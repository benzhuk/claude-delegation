#!/usr/bin/env node
// wiring-check — reads whether a guard, hook, timer or switch that is SUPPOSED to be wired on this
// machine actually is. A guard that is not wired looks exactly like one with nothing to say, and on
// 2026-09-20 that had to be worked out by hand, machine by machine. This never fixes anything: it
// only reads and reports, so a caller (the janitor, a person, a script) can decide what to do.
//
// checkWiring() is pure with respect to its inputs (home, platform, fsImpl, now, lists, env are all
// passed in with real defaults) and READS ONLY - it never edits settings.json, never installs a
// hook, never deletes a file, never writes anything at all.
//
// Two check lists are merged by id, second wins: this file's sibling `required-wiring.default.json`
// (the plugin's own needs - what it wires or reads on every machine) and an optional
// `~/.agents/required-wiring.json` a machine's own dotfiles may supply for private, machine-specific
// checks (that file is never read by this repo's own tests or CI; only a real home may have one).
//
// Check types (each check is `{ id, type, why, fix, platforms? }` plus type-specific fields; `~` at
// the start of any path field expands to `home`, and `${CLAUDE_PLUGIN_ROOT}` at the start of any
// path field expands to the installed plugin's own root - the same token the plugin's hooks.json
// commands already use, resolved the same way multi-inbox.js/backlog-notice.js do:
// env.CLAUDE_PLUGIN_ROOT when a real host hook set it, else this very script's own install
// location. That is for a check that names a file the plugin ships (e.g. its own hooks.json),
// never a per-user home file):
//   json_value    { file, path (dotted), expected }         - ok / stale (differs) / missing (file or path absent)
//   hook_present  { file, event, substring | command, matcher? } - ok (found) / missing (not found or
//                 file absent). `command` (an exact match of the parsed command string, once
//                 trimmed) and `matcher` (an exact match of the hook group's own matcher) are
//                 stricter alternatives to `substring` - use them for a check that must not be
//                 satisfied by a commented-out, disabled, renamed-file or wrong-matcher hook.
//   hook_absent   { file, event, substring | command, matcher? } - ok (not found or file absent) / stale (found - should have been removed)
//   file_exists   { file }                                  - ok / missing
//   file_absent   { file }                                  - ok / stale (still there)
//   file_fresh    { file, maxAgeSeconds, whenMissing?, requiresFile? } - ok / stale (too old, or
//                 missing - default 'stale') / whenMissing: 'info' or 'missing' overrides the
//                 missing case / requiresFile: another file whose own absence forces 'info'
//                 (never 'missing' or 'stale', and never counted against `ok`) before `file` is
//                 even looked at - for a record a separate installer produces, so a host that never
//                 ran that installer is not red
//   switch        { file }                                  - known 'info' (ON/off), unreadable 'unknown'
//   env_presence  { var }                                   - always 'info', why says set or not set
//   (anything else)                                         - 'unknown' - never a crash
//
// A check whose `platforms` array does not include the current platform is skipped entirely (it does
// not apply here, so it is not a finding either way).
//
// Never reads ~/.agents/notes/inboxes.json. Never prints a secret: a json_value mismatch prints the
// file and path and says "differs", never the actual value, unless the expected value is a boolean
// or a number (those are never secrets and are useful to see directly).
//
// CLI: no flag prints a small table. `--line` prints ONE line when something is missing, stale or
// unknown, and nothing at all when everything is ok/info. `--json` prints `{ ok, results }`. Exit 1
// when checkWiring().ok is false (any missing/stale/unknown) or on an unknown flag (usage error),
// else 0. `--hook` (the SessionStart caller) always exits 0. checkWiring() itself never throws.

import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkStaleness, staleSessionText } from "./plugin-staleness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// This script's OWN file path (docs/specs/stale-session-guard-1/spec.md P7) - "it uses
// wiring-check's own script path", never the guard's.
const SELF_PATH = fileURLToPath(import.meta.url);
const DEFAULT_LIST_PATH = path.join(HERE, "required-wiring.default.json");
const PRIVATE_LIST_RELATIVE = "~/.agents/required-wiring.json";

// ---------- path + JSON helpers ----------

export function expandHome(p, home) {
  if (typeof p !== "string") return p;
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(home, p.slice(2));
  return p;
}

const PLUGIN_ROOT_TOKEN = "${CLAUDE_PLUGIN_ROOT}";

/** Same shape as expandHome, for a check that names a file the plugin itself ships (its own
 * hooks.json) rather than something under the user's home. */
export function expandPluginRoot(p, pluginRoot) {
  if (typeof p !== "string") return p;
  if (p === PLUGIN_ROOT_TOKEN) return pluginRoot;
  if (p.startsWith(`${PLUGIN_ROOT_TOKEN}/`) || p.startsWith(`${PLUGIN_ROOT_TOKEN}\\`)) {
    return path.join(pluginRoot, p.slice(PLUGIN_ROOT_TOKEN.length + 1));
  }
  return p;
}

/** Every eval function's one path-resolving entry point: try `~` (home), then
 * `${CLAUDE_PLUGIN_ROOT}` (plugin install root), else the field is used exactly as written. */
function resolveCheckPath(p, { home, pluginRoot }) {
  const afterHome = expandHome(p, home);
  if (afterHome !== p) return afterHome;
  return expandPluginRoot(p, pluginRoot);
}

function isKnownAbsent(error) {
  return error?.code === "ENOENT" || error?.code === "ENOTDIR";
}

function readJsonEvidence(fsImpl, file) {
  try {
    const text = fsImpl.readFileSync(file, "utf8");
    try {
      return { kind: "present", value: JSON.parse(text) };
    } catch {
      return { kind: "unknown" };
    }
  } catch (error) {
    return isKnownAbsent(error) ? { kind: "absent" } : { kind: "unknown" };
  }
}

function statEvidence(fsImpl, file) {
  try {
    return { kind: "present", value: fsImpl.statSync(file) };
  } catch (error) {
    return isKnownAbsent(error) ? { kind: "absent" } : { kind: "unknown" };
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

function loadCheckList(fsImpl, file, { optional = false } = {}) {
  try {
    const raw = JSON.parse(fsImpl.readFileSync(file, "utf8"));
    if (Array.isArray(raw)) return { list: raw, unknown: false };
    if (raw && Array.isArray(raw.checks)) return { list: raw.checks, unknown: false };
    return { list: [], unknown: true };
  } catch (error) {
    if (optional && (error?.code === "ENOENT" || error?.code === "ENOTDIR")) return { list: [], unknown: false };
    return { list: [], unknown: true };
  }
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

function isNonemptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function hasValidDefinition(check) {
  switch (check.type) {
    case "hook_present":
    case "hook_absent":
      // An empty substring intentionally means "any command hook" through String.includes("").
      // A check may instead (or also) pin an exact `command` string and an exact `matcher`, so a
      // commented-out, disabled, renamed-file or wrong-matcher hook cannot satisfy it (J2 ruling).
      return isNonemptyString(check.file) && isNonemptyString(check.event)
        && (typeof check.substring === "string" || isNonemptyString(check.command))
        && (check.command === undefined || isNonemptyString(check.command))
        && (check.matcher === undefined || typeof check.matcher === "string");
    case "json_value":
      return isNonemptyString(check.file) && isNonemptyString(check.path) && Object.hasOwn(check, "expected");
    case "file_exists":
    case "file_absent":
    case "switch":
      return isNonemptyString(check.file);
    case "file_fresh":
      return isNonemptyString(check.file) && Number.isFinite(check.maxAgeSeconds) && check.maxAgeSeconds >= 0
        && (check.requiresFile === undefined || isNonemptyString(check.requiresFile));
    case "env_presence":
      return isNonemptyString(check.var);
    default:
      return false;
  }
}

/** J6, round-1 finding 6: a check naming the peer-note ledger is refused before any fs call at all -
 * never opened, never stat'ed, whatever type it claims to be. Matched on basename only, so `~`
 * expansion or a differently-cased drive letter can't dodge it. Compared lower-cased (round-2
 * review: `INBOXES.JSON` reached a real, case-insensitive Windows filesystem past a case-sensitive
 * comparison here, and a mismatch printer then read a value out of it). */
function namesInboxesJson(check, home) {
  if (typeof check.file !== "string") return false;
  return path.basename(expandHome(check.file, home)).toLowerCase() === "inboxes.json";
}

// ---------- per-type evaluation, each returns { state, why? } (why defaults to check.why) ----------

function evalJsonValue(check, { home, fsImpl, pluginRoot }) {
  const file = resolveCheckPath(check.file, { home, pluginRoot });
  const evidence = readJsonEvidence(fsImpl, file);
  if (evidence.kind === "absent") return { state: "missing", why: `${check.why} (${file} does not exist)` };
  if (evidence.kind === "unknown") return { state: "unknown", why: "could not inspect required file evidence" };
  const actual = getDotted(evidence.value, check.path);
  if (actual === undefined) return { state: "missing", why: `${check.why} (${file}#${check.path} is not set)` };
  if (actual === check.expected) return { state: "ok" };
  // J6: never print the actual or expected value unless it is a boolean or a number - neither can be
  // a secret, and both are useful to see directly. Anything else (a string, an object) says "differs".
  const safeToShow = (typeof check.expected === "boolean" || typeof check.expected === "number")
    && typeof actual === typeof check.expected;
  const detail = safeToShow
    ? `${file}#${check.path} is ${JSON.stringify(actual)}, expected ${JSON.stringify(check.expected)}`
    : `${file}#${check.path} differs from the expected value`;
  return { state: "stale", why: `${check.why} (${detail})` };
}

function inspectHookGroup(data, event, substring, command, matcher) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return { kind: "unknown" };
  if (!Object.hasOwn(data, "hooks")) return { kind: "known", present: false };
  const hooksSection = data.hooks;
  if (hooksSection === null || typeof hooksSection !== "object" || Array.isArray(hooksSection)) return { kind: "unknown" };
  if (!Object.hasOwn(hooksSection, event)) return { kind: "known", present: false };
  const group = hooksSection[event];
  if (!Array.isArray(group)) return { kind: "unknown" };
  for (const entry of group) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry) || !Array.isArray(entry.hooks)) return { kind: "unknown" };
    // J2 ruling: when the check pins a matcher, a hook under any other matcher does not count - a
    // delete-guard parked under "Read" never fires for Bash.
    if (typeof matcher === "string" && entry.matcher !== matcher) continue;
    const list = entry.hooks;
    for (const h of list) {
      if (h === null || typeof h !== "object" || Array.isArray(h)) return { kind: "unknown" };
      const hasCommand = Object.hasOwn(h, "command");
      if ((h.type === "command" && !hasCommand) || (hasCommand && typeof h.command !== "string")) return { kind: "unknown" };
      if (typeof h.command !== "string") continue;
      // J2 ruling: an exact `command` pin compares the whole parsed command string, so a
      // shell-commented, echoed, `true ||`-disabled or renamed-file hook never satisfies it.
      const hit = typeof command === "string" ? h.command.trim() === command : h.command.includes(substring);
      if (hit) return { kind: "known", present: true };
    }
  }
  return { kind: "known", present: false };
}

function evalHookPresence(check, { home, fsImpl, pluginRoot }, wantPresent) {
  const file = resolveCheckPath(check.file, { home, pluginRoot });
  const evidence = readJsonEvidence(fsImpl, file);
  if (evidence.kind === "absent") {
    // No settings file at all: nothing is wired, either desired direction is answered by that fact.
    return wantPresent
      ? { state: "missing", why: `${check.why} (${file} does not exist)` }
      : { state: "ok" };
  }
  if (evidence.kind === "unknown") return { state: "unknown", why: "could not inspect required file evidence" };
  const inspected = inspectHookGroup(evidence.value, check.event, check.substring, check.command, check.matcher);
  if (inspected.kind === "unknown") return { state: "unknown", why: "could not inspect required hook evidence" };
  const present = inspected.present;
  const eventLabel = check.event ?? "(unspecified event)";
  const substringLabel = typeof check.command === "string" ? check.command : (check.substring ?? "(unspecified substring)");
  if (wantPresent) return present ? { state: "ok" } : { state: "missing", why: `${check.why} (no ${eventLabel} hook in ${file} contains "${substringLabel}")` };
  return present ? { state: "stale", why: `${check.why} (a ${eventLabel} hook in ${file} still contains "${substringLabel}")` } : { state: "ok" };
}

function evalFileExistence(check, { home, fsImpl, pluginRoot }, wantPresent) {
  const file = resolveCheckPath(check.file, { home, pluginRoot });
  const evidence = statEvidence(fsImpl, file);
  if (evidence.kind === "unknown") return { state: "unknown", why: "could not inspect required file evidence" };
  const present = evidence.kind === "present";
  if (wantPresent) return present ? { state: "ok" } : { state: "missing", why: `${check.why} (${file} does not exist)` };
  return present ? { state: "stale", why: `${check.why} (${file} still exists)` } : { state: "ok" };
}

function evalFileFresh(check, { home, fsImpl, now, pluginRoot }) {
  const file = resolveCheckPath(check.file, { home, pluginRoot });
  // J1/J2 seam contract (round-2 amendment, spec.md J2.2: "a host without J1 is not red for that
  // reason"): a check may name a `requiresFile` (e.g. the installer's own installed.json) that
  // gates the whole check to 'info' when absent - a host that never ran the installer is not red
  // for lacking a record it was never told to produce. 'info' (not 'unknown') is required so this
  // never counts against checkWiring().ok; the wording still says "unknown" because it genuinely is
  // - installed or not is simply not knowable from this file alone.
  if (typeof check.requiresFile === "string") {
    const gateFile = resolveCheckPath(check.requiresFile, { home, pluginRoot });
    const gate = statEvidence(fsImpl, gateFile);
    if (gate.kind === "absent") return { state: "info", why: `${check.why} (unknown: ${gateFile} does not exist - the timer was never installed on this host)` };
    if (gate.kind === "unknown") return { state: "unknown", why: "could not inspect required file evidence" };
  }
  const evidence = statEvidence(fsImpl, file);
  if (evidence.kind === "absent") {
    const state = check.whenMissing === "info" ? "info" : check.whenMissing === "missing" ? "missing" : "stale";
    return { state, why: `${check.why} (${file} has never been created)` };
  }
  if (evidence.kind === "unknown") return { state: "unknown", why: "could not inspect required file evidence" };
  const mtimeMs = evidence.value.mtimeMs;
  const ageSeconds = Math.max(0, (now.getTime() - mtimeMs) / 1000);
  if (ageSeconds <= check.maxAgeSeconds) return { state: "ok" };
  const maxLabel = typeof check.maxAgeSeconds === "number" ? `${check.maxAgeSeconds}s` : "(unspecified)";
  return { state: "stale", why: `${check.why} (last touched ${Math.round(ageSeconds)}s ago, max ${maxLabel})` };
}

function evalSwitch(check, { home, fsImpl, pluginRoot }) {
  const file = resolveCheckPath(check.file, { home, pluginRoot });
  const evidence = statEvidence(fsImpl, file);
  if (evidence.kind === "unknown") return { state: "unknown", why: "could not inspect required switch evidence" };
  const on = evidence.kind === "present";
  return { state: "info", why: `${check.why} (${on ? "ON" : "off"})` };
}

function evalEnvPresence(check, { env }) {
  const on = Boolean(env[check.var]);
  return { state: "info", why: `${check.why} (${on ? "set" : "not set"})` };
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
    case "env_presence":
      return evalEnvPresence(check, ctx);
    default:
      return { state: "unknown", why: "unsupported check type" };
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
 * @param {object} [opts.env] - defaults to the process environment; the only environment input, and
 *   only through this argument
 * @param {string} [opts.pluginRoot] - defaults to env.CLAUDE_PLUGIN_ROOT (set by a real host's own
 *   hook invocation, same convention as hooks/multi-inbox.js and hooks/backlog-notice.js) or, when
 *   that is unset, this very script's own install directory - a check may use it via the
 *   `${CLAUDE_PLUGIN_ROOT}` path token for a file the plugin ships, never a per-user home file
 * @returns {{ ok: boolean, results: Array<{id: string, state: 'ok'|'missing'|'stale'|'info'|'unknown', why: string, fix: string}> }}
 */
export function checkWiring({
  home = homedir(),
  platform = process.platform,
  fsImpl = fs,
  now = new Date(),
  lists,
  env = process.env,
  pluginRoot = (env && env.CLAUDE_PLUGIN_ROOT) || path.dirname(HERE),
} = {}) {
  const publicInput = lists?.public === undefined
    ? loadCheckList(fsImpl, DEFAULT_LIST_PATH)
    : { list: Array.isArray(lists.public) ? lists.public : [], unknown: !Array.isArray(lists.public) };
  const privateInput = lists?.private === undefined
    ? loadCheckList(fsImpl, expandHome(PRIVATE_LIST_RELATIVE, home), { optional: true })
    : { list: Array.isArray(lists.private) ? lists.private : [], unknown: !Array.isArray(lists.private) };
  const publicList = publicInput.list;
  const privateList = privateInput.list;
  const merged = mergeChecks(publicList, privateList);

  const results = [];
  if (publicInput.unknown) results.push({ id: "wiring-default-input", state: "unknown", why: "could not inspect the required wiring check list", fix: "repair the wiring check list" });
  if (privateInput.unknown) results.push({ id: "wiring-private-input", state: "unknown", why: "could not inspect the private wiring check list", fix: "repair or remove the private wiring check list" });
  if (publicList.some((check) => !check || typeof check !== "object" || typeof check.id !== "string" || check.id.length === 0)) {
    results.push({ id: "wiring-default-row", state: "unknown", why: "the required wiring check list contains an invalid row", fix: "repair the wiring check list" });
  }
  if (privateList.some((check) => !check || typeof check !== "object" || typeof check.id !== "string" || check.id.length === 0)) {
    results.push({ id: "wiring-private-row", state: "unknown", why: "the private wiring check list contains an invalid row", fix: "repair or remove the private wiring check list" });
  }
  for (const check of merged) {
    if (!appliesToPlatform(check, platform)) continue;
    let outcome;
    try {
      if (!hasValidDefinition(check)) {
        outcome = { state: "unknown", why: "invalid wiring check definition" };
      } else if (namesInboxesJson(check, home)) {
        outcome = { state: "unknown", why: "this check names the protected peer-note ledger and was not inspected" };
      } else {
        outcome = evalCheck(check, { home, fsImpl, now, env, pluginRoot });
      }
    } catch {
      outcome = { state: "unknown", why: "could not evaluate this check" };
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
  return String(id).replace(/[-_]+/g, " ").trim().replace(/\s+/g, " ").slice(0, 60);
}

function printTable(results) {
  if (results.length === 0) {
    console.log("wiring check: no applicable checks configured");
    return;
  }
  console.log("wiring check:");
  for (const r of results) {
    console.log(`  ${r.id}  |  ${r.state}  |  ${r.why}`);
  }
}

/** NIT 2 (seam review): an id from a machine's own private required-wiring.json is not sanitized
 * elsewhere, so this line caps both the length of one name (humanize()) and the number of names
 * joined, so one hostile or oversized id can neither split the line nor flood a session's context. */
const MAX_LINE_NAMES = 8;

function printLine(results) {
  const findings = results.filter((r) => r.state === "missing" || r.state === "stale" || r.state === "unknown");
  if (findings.length === 0) return; // nothing to say when everything is ok/info
  const shown = findings.slice(0, MAX_LINE_NAMES).map((r) => humanize(r.id));
  const extra = findings.length - shown.length;
  const names = extra > 0 ? `${shown.join(", ")}, +${extra} more` : shown.join(", ");
  console.log(`wiring: ${findings.length} flagged (${names}). Run wiring-check for the fixes.`);
}

function printJson(result) {
  console.log(JSON.stringify(result, null, 2));
}

/** A stat error other than "not found" counts as the switch being present - fail toward silence,
 * same rule as the goal card's switchErrorMeansPresent(). Exported so the untestable-on-some-platforms
 * branch (an unreadable switch file) can be driven directly by a fake fsImpl in tests. */
export function switchErrorMeansPresent(e) { return Boolean(e) && e.code !== "ENOENT" && e.code !== "ENOTDIR"; }

/** Master switch: `~/.agents/ws-off` present means `--line` says nothing at all. Honours `opts.home`,
 * `opts.fsImpl` and `AGENTS_HOME` like every other switch reader in this plugin (goal-card.mjs,
 * delegation-reminder.js, project-config.mjs) - and never lets an unresolvable home escape as an
 * uncaught throw, matching this file's own "never fails its caller" contract. */
function wsOffActive(opts = {}) {
  let base;
  // MINOR A (seam delta review): an explicitly injected home wins over the ambient env - the
  // reverse order silently redirected a caller's scratch home to the real one.
  try { base = opts.home ? path.join(opts.home, ".agents")
                         : (process.env.AGENTS_HOME || path.join(homedir(), ".agents")); }
  catch { return true; } // can't tell => say nothing
  try {
    const fsImpl = opts.fsImpl ?? fs;
    fsImpl.statSync(path.join(base, "ws-off")); return true;
  }
  catch (e) { return switchErrorMeansPresent(e); }
}

/** docs/specs/stale-session-guard-1/spec.md P7: the same fact `agent-dispatch-guard.mjs`'s
 * R0-stale denies on, read through this script's OWN path instead of the guard's. Never
 * throws (`checkStaleness` already fails open; this is a second, redundant belt) - a broken
 * staleness read must never take the wiring check itself down. */
function staleness(opts) {
  try {
    return checkStaleness({
      scriptPath: opts.scriptPath ?? SELF_PATH,
      home: opts.home ?? homedir(),
      env: opts.env ?? process.env,
      fsImpl: opts.fsImpl ?? fs,
    });
  } catch {
    return { stale: false };
  }
}

export function main(argv = process.argv.slice(2), opts = {}) {
  const known = new Set(["--line", "--json", "--hook"]);
  const unknown = argv.filter((a) => !known.has(a));
  if (unknown.length > 0) {
    process.stderr.write(`wiring-check: unknown argument(s): ${unknown.join(", ")}\n`);
    return 1; // usage error
  }

  let result;
  try {
    result = checkWiring(opts);
  } catch {
    // Keep unexpected dependency failures visible without copying exception text into output.
    result = { ok: false, results: [{ id: "wiring-check", state: "unknown", why: "could not inspect required wiring", fix: "inspect the wiring-check inputs and filesystem access" }] };
  }
  const stale = staleness(opts);

  if (argv.includes("--json")) {
    printJson(result);
    if (stale.stale) process.stderr.write(`${staleSessionText(stale)}\n`);
  }
  else if (argv.includes("--line")) {
    if (!wsOffActive(opts)) {
      printLine(result.results);
      // P7: the same marker, "stale session: ...", as the guard's own deny text (P6) - one
      // shared builder (staleSessionText), never two hand-typed copies that can drift.
      if (stale.stale) console.log(staleSessionText(stale));
    }
  }
  else {
    printTable(result.results);
    if (stale.stale) console.log(staleSessionText(stale));
  }

  // J2: exit 1 when a required check is missing, stale, or could not be evaluated at all (any
  // state other than ok/info) - a wiring check can finally go red. `--json`/`--line`/table output
  // shapes are unchanged; only this return value differs from before. `checkWiring()` itself never
  // changes shape or meaning for its other callers (the janitor's embedded WIRING section calls the
  // library function directly and never runs this CLI, so its own exit code is untouched).
  // P7: a stale session counts as a non-ok result for this same red exit, like any other stale
  // finding - independent of which flag printed (or suppressed) the table/line/json output.
  // --hook: a Claude Code command hook's non-zero exit drops its stdout (a non-blocking error), so
  // the SessionStart caller keeps exit 0 and the line still reaches the session; the red exit is
  // for a human or agent running the CLI directly (bare `--line`, `--json`, or the table).
  if (argv.includes("--hook")) return 0;
  return (result.ok && !stale.stale) ? 0 : 1;
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
