#!/usr/bin/env node
// wiring-check — reads whether a guard, hook, timer or switch that is SUPPOSED to be wired on this
// machine actually is. A guard that is not wired looks exactly like one with nothing to say, and on
// 2026-09-20 that had to be worked out by hand, machine by machine. This never fixes anything: it
// only reads and reports, so a caller (the janitor, a person, a script) can decide what to do.
//
// checkWiring() is pure with respect to its inputs (home, platform, fsImpl, now, lists are all
// passed in with real defaults) and READS ONLY - it never edits settings.json, never installs a
// hook, never deletes a file, never writes anything at all.
//
// Two check lists are merged by id, second wins: this file's sibling `required-wiring.default.json`
// (the plugin's own needs - what it wires or reads on every machine) and an optional
// `~/.agents/required-wiring.json` a machine's own dotfiles may supply for private, machine-specific
// checks (that file is never read by this repo's own tests or CI; only a real home may have one).
//
// Check types (each check is `{ id, type, why, fix, platforms? }` plus type-specific fields; `~` at
// the start of any path field expands to `home`):
//   json_value    { file, path (dotted), expected }         - ok / stale (differs) / missing (file or path absent)
//   hook_present  { file, event, substring }                - ok (found) / missing (not found or file absent)
//   hook_absent   { file, event, substring }                - ok (not found or file absent) / stale (found - should have been removed)
//   file_exists   { file }                                  - ok / missing
//   file_absent   { file }                                  - ok / stale (still there)
//   file_fresh    { file, maxAgeSeconds, whenMissing? }      - ok / stale (too old, or missing - default 'stale') / whenMissing overrides the missing case
//   switch        { file }                                  - always 'info', why says ON or off
//   (anything else)                                         - 'info', why: "unknown check type" - never a crash
//
// A check whose `platforms` array does not include the current platform is skipped entirely (it does
// not apply here, so it is not a finding either way).
//
// Never reads ~/.agents/notes/inboxes.json. Never prints a secret: a json_value mismatch prints the
// file and path and says "differs", never the actual value, unless the expected value is a boolean
// or a number (those are never secrets and are useful to see directly).
//
// CLI: no flag prints a small table. `--line` prints ONE line, only when something is missing or
// stale, and nothing at all when everything is ok/info. `--json` prints `{ ok, results }`. Exit 0
// always, except an unknown flag (usage error) - a wiring check never fails its caller.

import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LIST_PATH = path.join(HERE, "required-wiring.default.json");
const PRIVATE_LIST_RELATIVE = "~/.agents/required-wiring.json";

// ---------- path + JSON helpers ----------

export function expandHome(p, home) {
  if (typeof p !== "string") return p;
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(home, p.slice(2));
  return p;
}

function readJsonSafe(fsImpl, file) {
  try {
    return JSON.parse(fsImpl.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function getDotted(obj, dottedPath) {
  if (obj === null || obj === undefined || typeof dottedPath !== "string") return undefined;
  let cur = obj;
  for (const part of dottedPath.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

function loadCheckList(fsImpl, file) {
  const raw = readJsonSafe(fsImpl, file);
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.checks)) return raw.checks;
  return [];
}

/** Merge two check lists by id - a private-list id wins on a collision, keeping the public list's
 * ordering; a private-only id is appended after. Any entry missing a string `id` is dropped. */
export function mergeChecks(publicList = [], privateList = []) {
  const order = [];
  const byId = new Map();
  for (const list of [publicList, privateList]) {
    for (const check of list) {
      if (!check || typeof check.id !== "string") continue;
      if (!byId.has(check.id)) order.push(check.id);
      byId.set(check.id, check);
    }
  }
  return order.map((id) => byId.get(id));
}

function appliesToPlatform(check, platform) {
  if (!Array.isArray(check.platforms) || check.platforms.length === 0) return true;
  return check.platforms.includes(platform);
}

// ---------- per-type evaluation, each returns { state, why? } (why defaults to check.why) ----------

function evalJsonValue(check, { home, fsImpl }) {
  const file = expandHome(check.file, home);
  if (!fsImpl.existsSync(file)) return { state: "missing", why: `${check.why} (${file} does not exist)` };
  const data = readJsonSafe(fsImpl, file);
  if (data === null) return { state: "missing", why: `${check.why} (${file} is not valid JSON)` };
  const actual = getDotted(data, check.path);
  if (actual === undefined) return { state: "missing", why: `${check.why} (${file}#${check.path} is not set)` };
  if (actual === check.expected) return { state: "ok" };
  // J6: never print the actual or expected value unless it is a boolean or a number - neither can be
  // a secret, and both are useful to see directly. Anything else (a string, an object) says "differs".
  const safeToShow = typeof check.expected === "boolean" || typeof check.expected === "number";
  const detail = safeToShow
    ? `${file}#${check.path} is ${JSON.stringify(actual)}, expected ${JSON.stringify(check.expected)}`
    : `${file}#${check.path} differs from the expected value`;
  return { state: "stale", why: `${check.why} (${detail})` };
}

function hookGroupHasSubstring(hooksSection, event, substring) {
  const group = hooksSection?.[event];
  if (!Array.isArray(group)) return false;
  for (const entry of group) {
    const list = Array.isArray(entry?.hooks) ? entry.hooks : [];
    for (const h of list) {
      if (typeof h?.command === "string" && h.command.includes(substring)) return true;
    }
  }
  return false;
}

function evalHookPresence(check, { home, fsImpl }, wantPresent) {
  const file = expandHome(check.file, home);
  if (!fsImpl.existsSync(file)) {
    // No settings file at all: nothing is wired, either desired direction is answered by that fact.
    return wantPresent
      ? { state: "missing", why: `${check.why} (${file} does not exist)` }
      : { state: "ok" };
  }
  const data = readJsonSafe(fsImpl, file);
  if (data === null) return { state: "missing", why: `${check.why} (${file} is not valid JSON)` };
  const present = hookGroupHasSubstring(data?.hooks, check.event, check.substring);
  if (wantPresent) return present ? { state: "ok" } : { state: "missing", why: `${check.why} (no ${check.event} hook in ${file} contains "${check.substring}")` };
  return present ? { state: "stale", why: `${check.why} (a ${check.event} hook in ${file} still contains "${check.substring}")` } : { state: "ok" };
}

function evalFileExistence(check, { home, fsImpl }, wantPresent) {
  const file = expandHome(check.file, home);
  const present = fsImpl.existsSync(file);
  if (wantPresent) return present ? { state: "ok" } : { state: "missing", why: `${check.why} (${file} does not exist)` };
  return present ? { state: "stale", why: `${check.why} (${file} still exists)` } : { state: "ok" };
}

function evalFileFresh(check, { home, fsImpl, now }) {
  const file = expandHome(check.file, home);
  if (!fsImpl.existsSync(file)) {
    const state = check.whenMissing === "info" ? "info" : "stale";
    return { state, why: `${check.why} (${file} has never been created)` };
  }
  let mtimeMs;
  try {
    mtimeMs = fsImpl.statSync(file).mtimeMs;
  } catch {
    return { state: "info", why: `${check.why} (could not read the mtime of ${file})` };
  }
  const ageSeconds = Math.max(0, (now.getTime() - mtimeMs) / 1000);
  if (ageSeconds <= check.maxAgeSeconds) return { state: "ok" };
  return { state: "stale", why: `${check.why} (last touched ${Math.round(ageSeconds)}s ago, max ${check.maxAgeSeconds}s)` };
}

function evalSwitch(check, { home, fsImpl }) {
  const file = expandHome(check.file, home);
  const on = fsImpl.existsSync(file);
  return { state: "info", why: `${check.why} (${on ? "ON" : "off"})` };
}

function evalCheck(check, ctx) {
  switch (check.type) {
    case "json_value":
      return evalJsonValue(check, ctx);
    case "hook_present":
      return evalHookPresence(check, ctx, true);
    case "hook_absent":
      return evalHookPresence(check, ctx, false);
    case "file_exists":
      return evalFileExistence(check, ctx, true);
    case "file_absent":
      return evalFileExistence(check, ctx, false);
    case "file_fresh":
      return evalFileFresh(check, ctx);
    case "switch":
      return evalSwitch(check, ctx);
    default:
      return { state: "info", why: "unknown check type" };
  }
}

// ---------- the pure entry point ----------

/**
 * @param {object} [opts]
 * @param {string} [opts.home] - defaults to os.homedir()
 * @param {string} [opts.platform] - defaults to process.platform
 * @param {object} [opts.fsImpl] - defaults to node:fs (readFileSync, existsSync, statSync)
 * @param {Date} [opts.now] - defaults to new Date()
 * @param {{public?: object[], private?: object[]}} [opts.lists] - override either list; omit to
 *   read the plugin's own required-wiring.default.json and, if present, ~/.agents/required-wiring.json
 * @returns {{ ok: boolean, results: Array<{id: string, state: 'ok'|'missing'|'stale'|'info', why: string, fix: string}> }}
 */
export function checkWiring({ home = homedir(), platform = process.platform, fsImpl = fs, now = new Date(), lists } = {}) {
  const publicList = lists?.public ?? loadCheckList(fsImpl, DEFAULT_LIST_PATH);
  let privateList = lists?.private;
  if (privateList === undefined) {
    const privateFile = expandHome(PRIVATE_LIST_RELATIVE, home);
    privateList = fsImpl.existsSync(privateFile) ? loadCheckList(fsImpl, privateFile) : [];
  }
  const merged = mergeChecks(publicList, privateList);

  const results = [];
  for (const check of merged) {
    if (!check || typeof check.id !== "string" || typeof check.type !== "string") continue;
    if (!appliesToPlatform(check, platform)) continue;
    let outcome;
    try {
      outcome = evalCheck(check, { home, fsImpl, now });
    } catch (err) {
      outcome = { state: "info", why: `could not evaluate this check: ${String(err && err.message ? err.message : err)}` };
    }
    results.push({
      id: check.id,
      state: outcome.state,
      why: outcome.why ?? check.why ?? "",
      fix: check.fix ?? "",
    });
  }

  const ok = results.every((r) => r.state === "ok" || r.state === "info");
  return { ok, results };
}

// ---------- CLI ----------

function humanize(id) {
  return String(id).replace(/[-_]+/g, " ").trim();
}

function printTable(results) {
  if (results.length === 0) {
    console.log("wiring check: no checks configured");
    return;
  }
  console.log("wiring check:");
  for (const r of results) {
    console.log(`  ${r.id}  |  ${r.state}  |  ${r.why}`);
  }
}

function printLine(results) {
  const findings = results.filter((r) => r.state === "missing" || r.state === "stale");
  if (findings.length === 0) return; // nothing to say when everything is ok/info
  const names = findings.map((r) => humanize(r.id)).join(", ");
  console.log(`wiring: ${findings.length} missing (${names}). Run wiring-check for the fixes.`);
}

function printJson(result) {
  console.log(JSON.stringify(result, null, 2));
}

export function main(argv = process.argv.slice(2)) {
  const known = new Set(["--line", "--json"]);
  const unknown = argv.filter((a) => !known.has(a));
  if (unknown.length > 0) {
    process.stderr.write(`wiring-check: unknown argument(s): ${unknown.join(", ")}\n`);
    return 1; // usage error - the only non-zero exit this tool ever returns
  }

  let result;
  try {
    result = checkWiring();
  } catch (err) {
    // A wiring check never fails its caller: an unexpected throw is reported as one blind info line.
    result = { ok: false, results: [{ id: "wiring-check", state: "info", why: `could not run: ${String(err && err.message ? err.message : err)}`, fix: "" }] };
  }

  if (argv.includes("--json")) printJson(result);
  else if (argv.includes("--line")) printLine(result.results);
  else printTable(result.results);

  return 0;
}

/**
 * Only when RUN, never when imported (a plain `import.meta.url === file://${argv[1]}` check never
 * matches on win32: argv[1] is a backslash path, import.meta.url is a forward-slash file:// URL.
 * Same fix already used by scripts/mirror-shared-skills.mjs's isMainModule()).
 */
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const canon = (p) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  const self = real(fileURLToPath(import.meta.url));
  const argv1 = real(entry);
  return canon(self) === canon(argv1);
}

if (isMainModule()) {
  process.exit(main());
}
