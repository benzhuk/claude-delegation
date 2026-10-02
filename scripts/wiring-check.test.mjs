// node --test scripts/wiring-check.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { checkWiring, mergeChecks, expandHome, expandPluginRoot, main } from "./wiring-check.mjs";
import { childEnv } from "../skills/multi/scripts/test-child-env.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const SCRIPT = path.join(HERE, "wiring-check.mjs");

const tracked = [];
function mkHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wiring-home-"));
  tracked.push(dir);
  return dir;
}
test.after(() => {
  for (const dir of tracked) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only
    }
  }
});

/** A read-only fs facade: only the methods checkWiring is documented to use are present at all, so
 * any attempt to write, delete or install anything throws immediately instead of silently working. */
function readOnlyFs(home) {
  return {
    existsSync: (p) => fs.existsSync(p),
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    statSync: (p) => fs.statSync(p),
  };
}

function write(home, rel, content) {
  const full = path.join(home, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

/** J2: the shipped default list gained checks (besides lean-rules-file) that can actually fail. A
 * fixture home used to prove "the CLI stays quiet / exits 0 when everything is wired" now has to
 * wire all of them - this is the whole point of the change (a bare scratch home is now genuinely
 * red). Callers add `.agents/lean-rules.md` themselves so a test can isolate that one check by
 * omitting it. Does not touch the two hook_present checks or the two hook-script file_exists
 * checks: those all read the plugin's OWN install root via CLAUDE_PLUGIN_ROOT, which every
 * runCli() call below pins at the real repo root, so they are already 'ok' against this checkout's
 * real, unmodified hooks/hooks.json, hooks/delete-guard.mjs and hooks/multi-inbox.js. */
function wireEverythingElse(home) {
  write(home, ".local/bin/note-send", "#!/bin/sh\nexit 0\n");
  fs.mkdirSync(path.join(home, ".agents", "notes"), { recursive: true });
  write(home, ".claude/settings.json", JSON.stringify({ crossSessionInbound: "accept" }));
  write(home, ".agents/janitor/installed.json", JSON.stringify({ schema: 1 }));
  write(home, ".agents/janitor/last-run.log", "ok\n");
}

const REPO_ROOT = path.join(HERE, "..");

// ---------------------------------------------------------------------------
// J1: pure export shape
// ---------------------------------------------------------------------------

test("checkWiring returns { ok, results } and each result has id/state/why/fix", () => {
  const home = mkHome();
  const result = checkWiring({
    home,
    platform: "linux",
    fsImpl: readOnlyFs(home),
    now: new Date(),
    lists: { public: [{ id: "a", type: "file_exists", file: "~/x", why: "w", fix: "f" }], private: [] },
  });
  assert.equal(typeof result.ok, "boolean");
  assert.ok(Array.isArray(result.results));
  const r = result.results[0];
  assert.equal(r.id, "a");
  assert.ok(["ok", "missing", "stale", "info", "unknown"].includes(r.state));
  assert.equal(typeof r.why, "string");
  assert.equal(typeof r.fix, "string");
});

test("checkWiring never writes, deletes or installs anything - a read-only fs facade is enough", () => {
  const home = mkHome();
  write(home, ".agents/settings.json", JSON.stringify({ hooks: { SessionStart: [] } }));
  const result = checkWiring({
    home,
    platform: process.platform,
    fsImpl: readOnlyFs(home),
    lists: {
      public: [
        { id: "hp", type: "hook_present", file: "~/.agents/settings.json", event: "SessionStart", substring: "x", why: "w", fix: "f" },
        { id: "sw", type: "switch", file: "~/.agents/ws-off", why: "w", fix: "f" },
      ],
      private: [],
    },
  });
  assert.equal(result.results.length, 2);
});

// ---------------------------------------------------------------------------
// J2: declarative check types
// ---------------------------------------------------------------------------

test("json_value: ok on match, stale on mismatch (string value never printed), missing on absent file or path", () => {
  const home = mkHome();
  const file = write(home, "cfg.json", JSON.stringify({ a: { b: "yes", n: 5, flag: true } }));
  const checks = [
    { id: "match", type: "json_value", file, path: "a.b", expected: "yes", why: "w", fix: "f" },
    { id: "mismatch-string", type: "json_value", file, path: "a.b", expected: "SECRET-VALUE", why: "w", fix: "f" },
    { id: "mismatch-number", type: "json_value", file, path: "a.n", expected: 9, why: "w", fix: "f" },
    { id: "mismatch-bool", type: "json_value", file, path: "a.flag", expected: false, why: "w", fix: "f" },
    { id: "no-path", type: "json_value", file, path: "a.missing", expected: "x", why: "w", fix: "f" },
    { id: "no-file", type: "json_value", file: path.join(home, "nope.json"), path: "a.b", expected: "x", why: "w", fix: "f" },
  ];
  const { results } = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));

  assert.equal(byId.match.state, "ok");

  assert.equal(byId["mismatch-string"].state, "stale");
  assert.ok(byId["mismatch-string"].why.includes("differs"), "a string mismatch says 'differs', never the value");
  assert.ok(!byId["mismatch-string"].why.includes("SECRET-VALUE"), "the expected string value must never be printed");
  assert.ok(!byId["mismatch-string"].why.includes("yes"), "the actual string value must never be printed");

  assert.equal(byId["mismatch-number"].state, "stale");
  assert.ok(byId["mismatch-number"].why.includes("5") && byId["mismatch-number"].why.includes("9"), "a number mismatch may show both values (J6)");

  assert.equal(byId["mismatch-bool"].state, "stale");
  assert.ok(byId["mismatch-bool"].why.includes("true") && byId["mismatch-bool"].why.includes("false"), "a boolean mismatch may show both values (J6)");

  assert.equal(byId["no-path"].state, "missing");
  assert.equal(byId["no-file"].state, "missing");
});

test("hook_present: ok when the substring is found on that event, missing otherwise or when the file is absent", () => {
  const home = mkHome();
  const settings = write(home, "settings.json", JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node secret-guard.mjs check" }] }] },
  }));
  const checks = [
    { id: "found", type: "hook_present", file: settings, event: "SessionStart", substring: "secret-guard", why: "w", fix: "f" },
    { id: "not-found", type: "hook_present", file: settings, event: "SessionStart", substring: "does-not-exist", why: "w", fix: "f" },
    { id: "no-event", type: "hook_present", file: settings, event: "PreToolUse", substring: "secret-guard", why: "w", fix: "f" },
    { id: "no-file", type: "hook_present", file: path.join(home, "missing.json"), event: "SessionStart", substring: "x", why: "w", fix: "f" },
  ];
  const { results } = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.equal(byId.found.state, "ok");
  assert.equal(byId["not-found"].state, "missing");
  assert.equal(byId["no-event"].state, "missing");
  assert.equal(byId["no-file"].state, "missing");
});

test("hook_absent: ok when the substring is not found (or the file is absent), stale when it is still there", () => {
  const home = mkHome();
  const settings = write(home, "settings.json", JSON.stringify({
    hooks: { SubagentStart: [{ hooks: [{ type: "command", command: "node delegation-reminder.js SubagentStart" }] }] },
  }));
  const checks = [
    { id: "still-there", type: "hook_absent", file: settings, event: "SubagentStart", substring: "delegation-reminder", why: "w", fix: "f" },
    { id: "gone", type: "hook_absent", file: settings, event: "SubagentStart", substring: "not-in-there", why: "w", fix: "f" },
    { id: "no-file", type: "hook_absent", file: path.join(home, "missing.json"), event: "SubagentStart", substring: "x", why: "w", fix: "f" },
  ];
  const { results } = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.equal(byId["still-there"].state, "stale");
  assert.equal(byId.gone.state, "ok");
  assert.equal(byId["no-file"].state, "ok");
});

test("hook checks distinguish valid absence from malformed selected hook containers", () => {
  const home = mkHome();
  const payloads = new Map([
    ["root-null", "null"],
    ["root-number", "42"],
    ["event-not-array", JSON.stringify({ hooks: { Stop: "bad-shape" } })],
    ["handlers-not-array", JSON.stringify({ hooks: { Stop: [{ hooks: {} }] } })],
    ["command-missing", JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command" }] }] } })],
    ["command-null", JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: null }] }] } })],
    ["command-number", JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: 42 }] }] } })],
    ["valid-empty-root", "{}"],
    ["valid-unrelated", JSON.stringify({ unrelated: true })],
    ["valid-no-event", JSON.stringify({ hooks: { SessionStart: [] } })],
    ["valid-empty-event", JSON.stringify({ hooks: { Stop: [] } })],
    ["valid-noncommand", JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "prompt", prompt: "review" }] }] } })],
    ["valid-command-match", JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "node test-hook.mjs" }] }] } })],
    ["valid-command-no-match", JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "node other.mjs" }] }] } })],
  ]);
  const checks = [];
  for (const [id, payload] of payloads) {
    const file = write(home, `${id}.json`, payload);
    checks.push({ id, type: "hook_absent", file, event: "Stop", substring: "test-hook", why: "w", fix: "f" });
  }
  const result = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  const byId = Object.fromEntries(result.results.map((row) => [row.id, row]));
  for (const id of ["root-null", "root-number", "event-not-array", "handlers-not-array", "command-missing", "command-null", "command-number"]) {
    assert.equal(byId[id].state, "unknown", id);
  }
  for (const id of ["valid-empty-root", "valid-unrelated", "valid-no-event", "valid-empty-event", "valid-noncommand", "valid-command-no-match"]) {
    assert.equal(byId[id].state, "ok", id);
  }
  assert.equal(byId["valid-command-match"].state, "stale");
  assert.equal(result.ok, false);
});

test("file_exists / file_absent", () => {
  const home = mkHome();
  const present = write(home, "present.txt", "x");
  const absent = path.join(home, "absent.txt");
  const checks = [
    { id: "exists-ok", type: "file_exists", file: present, why: "w", fix: "f" },
    { id: "exists-missing", type: "file_exists", file: absent, why: "w", fix: "f" },
    { id: "absent-ok", type: "file_absent", file: absent, why: "w", fix: "f" },
    { id: "absent-stale", type: "file_absent", file: present, why: "w", fix: "f" },
  ];
  const { results } = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.equal(byId["exists-ok"].state, "ok");
  assert.equal(byId["exists-missing"].state, "missing");
  assert.equal(byId["absent-ok"].state, "ok");
  assert.equal(byId["absent-stale"].state, "stale");
});

test("file_fresh: ok within the window, stale once past it, missing file is 'stale' by default and 'info' with whenMissing override", () => {
  const home = mkHome();
  const fresh = write(home, "fresh.json", "{}");
  const old = write(home, "old.json", "{}");
  const oldMs = Date.now() - 10 * 60 * 1000; // 10 minutes ago
  fs.utimesSync(old, oldMs / 1000, oldMs / 1000);
  const neverExisted = path.join(home, "never.json");

  const checks = [
    { id: "fresh", type: "file_fresh", file: fresh, maxAgeSeconds: 300, why: "w", fix: "f" },
    { id: "stale", type: "file_fresh", file: old, maxAgeSeconds: 300, why: "w", fix: "f" },
    { id: "missing-default", type: "file_fresh", file: neverExisted, maxAgeSeconds: 300, why: "w", fix: "f" },
    { id: "missing-info", type: "file_fresh", file: neverExisted, maxAgeSeconds: 300, whenMissing: "info", why: "w", fix: "f" },
  ];
  const { results } = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), now: new Date(), lists: { public: checks, private: [] } });
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.equal(byId.fresh.state, "ok");
  assert.equal(byId.stale.state, "stale");
  assert.equal(byId["missing-default"].state, "stale");
  assert.equal(byId["missing-info"].state, "info");
});

test("required file evidence distinguishes known absence from inaccessible or corrupt evidence", () => {
  const home = mkHome();
  const denied = path.join(home, "denied");
  const corrupt = write(home, "corrupt.json", "{not-json");
  const absent = path.join(home, "absent");
  const deniedError = Object.assign(new Error("PRIVATE-DISK-DETAIL"), { code: "EACCES" });
  const fsImpl = {
    readFileSync: (p, enc) => {
      if (p === denied) throw deniedError;
      return fs.readFileSync(p, enc);
    },
    statSync: (p) => {
      if (p === denied) throw deniedError;
      return fs.statSync(p);
    },
    existsSync: (p) => fs.existsSync(p),
  };
  const checks = [
    { id: "denied-exists", type: "file_exists", file: denied, why: "w", fix: "f" },
    { id: "denied-absent", type: "file_absent", file: denied, why: "w", fix: "f" },
    { id: "denied-fresh", type: "file_fresh", file: denied, maxAgeSeconds: 1, whenMissing: "info", why: "w", fix: "f" },
    { id: "denied-json", type: "json_value", file: denied, path: "x", expected: 1, why: "w", fix: "f" },
    { id: "denied-hook", type: "hook_absent", file: denied, event: "Stop", substring: "x", why: "w", fix: "f" },
    { id: "corrupt-json", type: "json_value", file: corrupt, path: "x", expected: 1, why: "w", fix: "f" },
    { id: "corrupt-hook", type: "hook_absent", file: corrupt, event: "Stop", substring: "x", why: "w", fix: "f" },
    { id: "known-absent", type: "file_absent", file: absent, why: "w", fix: "f" },
    { id: "known-missing", type: "file_exists", file: absent, why: "w", fix: "f" },
  ];
  const result = checkWiring({ home, platform: "linux", fsImpl, lists: { public: checks, private: [] } });
  const byId = Object.fromEntries(result.results.map((r) => [r.id, r]));
  for (const id of ["denied-exists", "denied-absent", "denied-fresh", "denied-json", "denied-hook", "corrupt-json", "corrupt-hook"]) {
    assert.equal(byId[id].state, "unknown", id);
    assert.doesNotMatch(byId[id].why, /PRIVATE-DISK-DETAIL/, id);
  }
  assert.equal(byId["known-absent"].state, "ok");
  assert.equal(byId["known-missing"].state, "missing");
  assert.equal(result.ok, false);
});

test("switch: known paths are informational, with ON when present and off when absent", () => {
  const home = mkHome();
  const onFile = write(home, "on-switch", "");
  const offFile = path.join(home, "off-switch");
  const checks = [
    { id: "on", type: "switch", file: onFile, why: "w", fix: "f" },
    { id: "off", type: "switch", file: offFile, why: "w", fix: "f" },
  ];
  const { results } = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.equal(byId.on.state, "info");
  assert.ok(byId.on.why.includes("ON"));
  assert.equal(byId.off.state, "info");
  assert.ok(byId.off.why.includes("off"));
});

test("switch reports unknown when its path cannot be inspected", () => {
  const home = mkHome();
  const fsImpl = readOnlyFs(home);
  fsImpl.statSync = () => { throw Object.assign(new Error("PRIVATE-SWITCH-ERROR"), { code: "EACCES" }); };
  const result = checkWiring({ home, platform: "linux", fsImpl, lists: { public: [
    { id: "denied-switch", type: "switch", file: "~/switch", why: "w", fix: "f" },
  ], private: [] } });
  assert.equal(result.ok, false);
  assert.equal(result.results[0].state, "unknown");
  assert.doesNotMatch(result.results[0].why, /PRIVATE-SWITCH-ERROR/);
});

// ---------------------------------------------------------------------------
// env_presence (package-build/P1, PB-C1): visibility-only, always 'info', both directions
// ---------------------------------------------------------------------------

test("env_presence: 'info' with the full why-string ending in (set) when the var is set, and (not set) when absent - never missing/stale either way", () => {
  const home = mkHome();
  const checks = [
    { id: "pane-note-slug", type: "env_presence", var: "NOTE_SLUG", why: "this pane's peer-note inbox registers only when NOTE_SLUG is set", fix: "f" },
  ];
  const setResult = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] }, env: { NOTE_SLUG: "taxonomy" } });
  assert.equal(setResult.results[0].state, "info");
  // v1.1 red-team finding 8: the FULL why string must end in "(set)" - state === 'info' alone would
  // pass against both the unwired-case bug (default: "unknown check type") and the missing-context
  // bug (an undefined env making env[check.var] throw, caught into "could not evaluate this check").
  assert.equal(setResult.results[0].why, "this pane's peer-note inbox registers only when NOTE_SLUG is set (set)");

  const unsetResult = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] }, env: {} });
  assert.equal(unsetResult.results[0].state, "info");
  assert.equal(unsetResult.results[0].why, "this pane's peer-note inbox registers only when NOTE_SLUG is set (not set)");
});

test("env_presence: an empty string, '0' or 'false' in the var still counts as absent/present by Boolean() coercion, and never leaks into missing/stale", () => {
  const home = mkHome();
  const checks = [{ id: "e", type: "env_presence", var: "X", why: "w", fix: "f" }];
  for (const [label, envValue] of [
    ["empty string", { X: "" }],
    ["the string 0", { X: "0" }],
    ["the string false", { X: "false" }],
    ["absent entirely", {}],
  ]) {
    const { results } = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] }, env: envValue });
    assert.equal(results[0].state, "info", label);
    assert.notEqual(results[0].state, "missing", label);
    assert.notEqual(results[0].state, "stale", label);
  }
  // "0" and "false" are truthy strings, so Boolean() reports them as "set" - documented coercion,
  // not a silent mis-read: the why string says exactly what happened.
  const truthyStrings = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] }, env: { X: "0" } });
  assert.match(truthyStrings.results[0].why, /\(set\)$/);
  const empty = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] }, env: { X: "" } });
  assert.match(empty.results[0].why, /\(not set\)$/);
});

test("checkWiring defaults env to process.env when a caller omits the argument entirely - an existing caller with no env key keeps working", () => {
  const home = mkHome();
  const varName = "WIRING_CHECK_P1_DEFAULT_ENV_PROBE";
  const checks = [{ id: "probe", type: "env_presence", var: varName, why: "w", fix: "f" }];
  delete process.env[varName];
  try {
    // No `env` key at all in this options object - exactly the shape every pre-existing test and
    // caller in this file uses.
    const before = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
    assert.match(before.results[0].why, /\(not set\)$/);

    process.env[varName] = "1";
    const after = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
    assert.match(after.results[0].why, /\(set\)$/, "checkWiring must default env to the real process.env, not an empty object");
  } finally {
    delete process.env[varName];
  }
});

test("an existing caller passing no env key at all (the pre-P1 shape) still returns { ok, results } unchanged for non-env_presence checks", () => {
  const home = mkHome();
  const result = checkWiring({
    home,
    platform: "linux",
    fsImpl: readOnlyFs(home),
    now: new Date(),
    lists: { public: [{ id: "a", type: "file_exists", file: "~/x", why: "w", fix: "f" }], private: [] },
  });
  assert.equal(typeof result.ok, "boolean");
  assert.equal(result.results[0].id, "a");
});

test("an unknown check type is unknown and prevents green", () => {
  const home = mkHome();
  const checks = [{ id: "mystery", type: "teleport", why: "w", fix: "f" }];
  const { results } = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  assert.equal(results[0].state, "unknown");
  assert.match(results[0].why, /invalid wiring check definition/);
});

test("a check whose evaluation throws is unknown, private, and not a crash", () => {
  const home = mkHome();
  const checks = [{ id: "boom", type: "env_presence", var: "X", why: "w", fix: "f" }];
  const { results } = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), env: null, lists: { public: checks, private: [] } });
  assert.equal(results[0].state, "unknown");
  assert.match(results[0].why, /could not evaluate/);
});

test("selected malformed check definitions are unknown before filesystem evaluation", () => {
  const home = mkHome();
  let fsCalls = 0;
  const fsImpl = {
    readFileSync: () => { fsCalls += 1; throw new Error("must not read"); },
    statSync: () => { fsCalls += 1; throw new Error("must not stat"); },
    existsSync: () => { fsCalls += 1; throw new Error("must not exist-check"); },
  };
  const checks = [
    { id: "hook-file", type: "hook_absent", file: "", event: "Stop", substring: "x" },
    { id: "hook-event", type: "hook_present", file: "x", event: "", substring: "x" },
    { id: "hook-substring", type: "hook_absent", file: "x", event: "Stop" },
    { id: "json-file", type: "json_value", file: "", path: "a", expected: 1 },
    { id: "json-path", type: "json_value", file: "x", path: "", expected: 1 },
    { id: "json-expected", type: "json_value", file: "x", path: "a" },
    { id: "file", type: "file_exists", file: null },
    { id: "fresh-negative", type: "file_fresh", file: "x", maxAgeSeconds: -1 },
    { id: "fresh-infinite", type: "file_fresh", file: "x", maxAgeSeconds: Infinity },
    { id: "switch", type: "switch", file: "" },
    { id: "env", type: "env_presence", var: "" },
    { id: "type", type: "unknown_type" },
  ];
  const result = checkWiring({ home, platform: "linux", fsImpl, lists: { public: checks, private: [] } });
  assert.equal(result.ok, false);
  assert.equal(result.results.length, checks.length);
  assert.ok(result.results.every((row) => row.state === "unknown"));
  assert.equal(fsCalls, 0);
});

test("an explicit empty hook substring remains the documented any-command match", () => {
  const home = mkHome();
  const settings = write(home, "settings-any-command.json", JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: "command", command: "node anything.mjs" }] }] },
  }));
  const result = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [
    { id: "any-command", type: "hook_present", file: settings, event: "Stop", substring: "", why: "w", fix: "f" },
  ], private: [] } });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].state, "ok");
});

test("invalid rows produce bounded input uncertainty before valid rows are merged", () => {
  const home = mkHome();
  const result = checkWiring({
    home,
    platform: "linux",
    fsImpl: readOnlyFs(home),
    lists: {
      public: [null, { type: "file_exists", file: "~/missing" }, { id: "kept", type: "switch", file: "~/x", why: "w", fix: "f" }],
      private: [{ id: "kept", type: "switch", file: "~/private", why: "private", fix: "f" }],
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.results.filter((r) => r.id === "wiring-default-row").length, 1);
  assert.equal(result.results.find((r) => r.id === "wiring-default-row").state, "unknown");
  assert.equal(result.results.find((r) => r.id === "kept").why, "private (off)");
  assert.equal(result.results.some((r) => String(r.why).includes("missing")), false, "invalid row contents are not echoed");
});

// ---------------------------------------------------------------------------
// ~ expansion
// ---------------------------------------------------------------------------

test("expandHome expands a leading ~ and leaves other paths untouched", () => {
  assert.equal(expandHome("~", "/home/x"), "/home/x");
  assert.equal(expandHome("~/a/b", "/home/x"), path.join("/home/x", "a/b"));
  assert.equal(expandHome("/already/absolute", "/home/x"), "/already/absolute");
  assert.equal(expandHome("relative/path", "/home/x"), "relative/path");
});

test("expandPluginRoot expands a leading ${CLAUDE_PLUGIN_ROOT} and leaves other paths (including ~) untouched", () => {
  assert.equal(expandPluginRoot("${CLAUDE_PLUGIN_ROOT}", "/plugin"), "/plugin");
  assert.equal(expandPluginRoot("${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json", "/plugin"), path.join("/plugin", "hooks/hooks.json"));
  assert.equal(expandPluginRoot("~/a/b", "/plugin"), "~/a/b", "a ~ path is not this function's job");
  assert.equal(expandPluginRoot("/already/absolute", "/plugin"), "/already/absolute");
  assert.equal(expandPluginRoot("relative/path", "/plugin"), "relative/path");
});

test("checkWiring resolves a ${CLAUDE_PLUGIN_ROOT}-prefixed file field against opts.pluginRoot, independent of home", () => {
  const home = mkHome();
  const pluginRoot = mkHome(); // reused as a second scratch dir, unrelated to `home`
  write(pluginRoot, "hooks/hooks.json", JSON.stringify({
    hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "node hooks/delete-guard.mjs" }] }] },
  }));
  const checks = [{ id: "plugin-hook", type: "hook_present", file: "${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json", event: "PreToolUse", substring: "delete-guard.mjs", why: "w", fix: "f" }];
  const { results } = checkWiring({ home, pluginRoot, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  assert.equal(results[0].state, "ok");
  // Prove it is really reading pluginRoot and not home: point pluginRoot at an empty dir instead.
  const emptyRoot = mkHome();
  const { results: miss } = checkWiring({ home, pluginRoot: emptyRoot, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  assert.equal(miss[0].state, "missing");
});

test("checkWiring defaults pluginRoot to env.CLAUDE_PLUGIN_ROOT, then to this script's own install directory - never process.env directly", () => {
  const home = mkHome();
  const fixtureRoot = mkHome();
  write(fixtureRoot, "hooks/hooks.json", JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "x" }] }] } }));
  const checks = [{ id: "plugin-hook", type: "hook_present", file: "${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json", event: "PreToolUse", substring: "x", why: "w", fix: "f" }];
  const viaEnv = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] }, env: { CLAUDE_PLUGIN_ROOT: fixtureRoot } });
  assert.equal(viaEnv.results[0].state, "ok", "env.CLAUDE_PLUGIN_ROOT must be honoured when no explicit opts.pluginRoot is given");

  // This repo's real hooks/hooks.json (one level up from this test file) really does have the
  // PreToolUse delete-guard hook, so the bare default (no env, no explicit pluginRoot) must find it.
  const real = checkWiring({
    home,
    platform: "linux",
    fsImpl: readOnlyFs(home),
    lists: { public: [{ id: "real-hook", type: "hook_present", file: "${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json", event: "PreToolUse", substring: "hooks/delete-guard.mjs", why: "w", fix: "f" }], private: [] },
    env: {},
  });
  assert.equal(real.results[0].state, "ok", "with no CLAUDE_PLUGIN_ROOT set at all, the default must fall back to this script's own real install directory");
});

// ---------------------------------------------------------------------------
// platforms filter
// ---------------------------------------------------------------------------

test("a check with a platforms array is skipped entirely on a non-matching platform", () => {
  const home = mkHome();
  const checks = [
    { id: "mac-only", type: "switch", file: "~/x", platforms: ["darwin"], why: "w", fix: "f" },
    { id: "excluded-malformed", type: "file_fresh", file: "", maxAgeSeconds: -1, platforms: ["darwin"], why: "w", fix: "f" },
    { id: "everywhere", type: "switch", file: "~/y", why: "w", fix: "f" },
  ];
  const onLinux = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  assert.equal(onLinux.results.some((r) => r.id === "mac-only"), false);
  assert.equal(onLinux.results.some((r) => r.id === "excluded-malformed"), false);
  assert.equal(onLinux.results.some((r) => r.id === "everywhere"), true);

  const onMac = checkWiring({ home, platform: "darwin", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  assert.equal(onMac.results.some((r) => r.id === "mac-only"), true);
  assert.equal(onMac.results.find((r) => r.id === "excluded-malformed").state, "unknown");
});

// ---------------------------------------------------------------------------
// J3: merge by id
// ---------------------------------------------------------------------------

test("mergeChecks: a private-list id wins on a collision; a private-only id is appended; order is stable", () => {
  const pub = [
    { id: "a", type: "switch", file: "~/a", why: "public a", fix: "f" },
    { id: "b", type: "switch", file: "~/b", why: "public b", fix: "f" },
  ];
  const priv = [
    { id: "a", type: "switch", file: "~/a-private", why: "private a wins", fix: "f" },
    { id: "c", type: "switch", file: "~/c", why: "private only", fix: "f" },
  ];
  const merged = mergeChecks(pub, priv);
  assert.deepEqual(merged.map((c) => c.id), ["a", "b", "c"]);
  assert.equal(merged[0].why, "private a wins");
  assert.equal(merged[1].why, "public b");
  assert.equal(merged[2].why, "private only");
});

test("checkWiring merges the default public list with an optional ~/.agents/required-wiring.json when present", () => {
  const home = mkHome();
  write(home, ".agents/required-wiring.json", JSON.stringify([{ id: "private-thing", type: "switch", file: "~/only-here", why: "w", fix: "f" }]));
  const { results } = checkWiring({
    home,
    platform: "linux",
    fsImpl: readOnlyFs(home),
    lists: { public: [{ id: "public-thing", type: "switch", file: "~/x", why: "w", fix: "f" }] },
  });
  const ids = results.map((r) => r.id);
  assert.ok(ids.includes("public-thing"));
  assert.ok(ids.includes("private-thing"));
});

test("a missing private wiring list is normal", () => {
  const home = mkHome(); // no required-wiring.json at all
  const result = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [{ id: "x", type: "switch", file: "~/y", why: "w", fix: "f" }] } });
  assert.equal(result.results.length, 1);
});

test("malformed or unreadable public and private list inputs are unknown", () => {
  const home = mkHome();
  write(home, ".agents/required-wiring.json", "{not-json");
  const privateResult = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [] } });
  assert.equal(privateResult.ok, false);
  assert.equal(privateResult.results[0].id, "wiring-private-input");
  assert.equal(privateResult.results[0].state, "unknown");

  const fsImpl = readOnlyFs(home);
  fsImpl.readFileSync = (file, enc) => {
    if (path.basename(String(file)) === "required-wiring.default.json") return "42";
    return fs.readFileSync(file, enc);
  };
  const publicResult = checkWiring({ home, platform: "linux", fsImpl, lists: { private: [] } });
  assert.equal(publicResult.ok, false);
  assert.equal(publicResult.results[0].id, "wiring-default-input");
  assert.equal(publicResult.results[0].state, "unknown");

  const deniedPrivateFs = readOnlyFs(home);
  deniedPrivateFs.readFileSync = (file, enc) => {
    if (path.basename(String(file)) === "required-wiring.json") throw Object.assign(new Error("private denied"), { code: "EACCES" });
    return fs.readFileSync(file, enc);
  };
  const deniedPrivate = checkWiring({ home, platform: "linux", fsImpl: deniedPrivateFs, lists: { public: [] } });
  assert.equal(deniedPrivate.results[0].id, "wiring-private-input");
  assert.equal(deniedPrivate.results[0].state, "unknown");

  const deniedPublicFs = readOnlyFs(home);
  deniedPublicFs.readFileSync = (file, enc) => {
    if (path.basename(String(file)) === "required-wiring.default.json") throw Object.assign(new Error("public denied"), { code: "EACCES" });
    return fs.readFileSync(file, enc);
  };
  const deniedPublic = checkWiring({ home, platform: "linux", fsImpl: deniedPublicFs, lists: { private: [] } });
  assert.equal(deniedPublic.results[0].id, "wiring-default-input");
  assert.equal(deniedPublic.results[0].state, "unknown");
});

// ---------------------------------------------------------------------------
// J6: never read the inbox ledger
// ---------------------------------------------------------------------------

test("checkWiring's own default list and machinery never read or name ~/.agents/notes/inboxes.json unprompted", () => {
  const home = mkHome();
  write(home, ".agents/notes/inboxes.json", JSON.stringify({ secret: "do-not-read" }));
  const readPaths = [];
  const spyFs = {
    existsSync: (p) => fs.existsSync(p),
    readFileSync: (p, enc) => {
      readPaths.push(String(p));
      return fs.readFileSync(p, enc);
    },
    statSync: (p) => fs.statSync(p),
  };
  // Real default list, no override - exactly what a bare `wiring-check` invocation does on this home.
  checkWiring({ home, platform: "linux", fsImpl: spyFs });
  const inboxesPath = path.join(home, ".agents", "notes", "inboxes.json");
  assert.ok(!readPaths.includes(inboxesPath), "the shipped default list must never cause a read of inboxes.json");

  // And the shipped list's own source never names the file at all, which is what guarantees the above
  // for every home, not just this one test's fixture.
  const defaultListRaw = JSON.parse(fs.readFileSync(path.join(HERE, "required-wiring.default.json"), "utf8"));
  const list = Array.isArray(defaultListRaw) ? defaultListRaw : defaultListRaw.checks;
  for (const check of list) {
    assert.ok(!String(check.file || "").includes("inboxes.json"), `default list check ${check.id} must never name inboxes.json`);
  }
});

// ---------------------------------------------------------------------------
// the shipped default list
// ---------------------------------------------------------------------------

test("scripts/required-wiring.default.json parses and contains the flusher heartbeat and the five named switches", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(HERE, "required-wiring.default.json"), "utf8"));
  const list = Array.isArray(raw) ? raw : raw.checks;
  const ids = list.map((c) => c.id);
  const flusher = list.find((c) => c.type === "file_fresh" && c.file.includes("flush-last.json"));
  assert.ok(flusher, "a file_fresh check for flush-last.json must exist");
  assert.equal(flusher.maxAgeSeconds, 300);
  assert.equal(flusher.whenMissing, "info", "never-existed must be info, not stale, per J3");
  for (const name of ["ws-off", "no-dispatch-guard", "dispatch-guard-enforce", "wake-all-kinds", "no-type"]) {
    assert.ok(list.some((c) => c.type === "switch" && c.file.includes(name)), `a switch check for ${name} must exist`);
  }
  for (const c of list) {
    assert.equal(typeof c.id, "string");
    assert.equal(typeof c.type, "string");
    assert.equal(typeof c.why, "string");
    assert.equal(typeof c.fix, "string");
  }
});

test("the default list names nothing private to the owner's machines (no absolute /Users or /home path, no username)", () => {
  const text = fs.readFileSync(path.join(HERE, "required-wiring.default.json"), "utf8");
  assert.ok(!/\/Users\//.test(text));
  assert.ok(!/\/home\/[a-z]/i.test(text));
  assert.ok(!/C:\\\\Users/.test(text));
});

test("the shipped list's pane-note-slug row is env_presence over NOTE_SLUG, and stays info in both directions through checkWiring itself", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(HERE, "required-wiring.default.json"), "utf8"));
  const list = Array.isArray(raw) ? raw : raw.checks;
  const rows = list.filter((c) => c.id === "pane-note-slug");
  assert.equal(rows.length, 1, "pane-note-slug must appear exactly once");
  assert.equal(rows[0].type, "env_presence");
  assert.equal(rows[0].var, "NOTE_SLUG");

  const home = mkHome();
  const set = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [rows[0]], private: [] }, env: { NOTE_SLUG: "taxonomy" } });
  assert.equal(set.results[0].state, "info");
  assert.match(set.results[0].why, /\(set\)$/);
  const unset = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [rows[0]], private: [] }, env: {} });
  assert.equal(unset.results[0].state, "info");
  assert.match(unset.results[0].why, /\(not set\)$/);
});

test("CLI --line stays silent for pane-note-slug whether or not NOTE_SLUG is set - env_presence never reaches printLine's missing/stale path", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home); // everything else required item that would print, too
  const withSlug = runCli(["--line"], home, { NOTE_SLUG: "taxonomy" });
  assert.equal(withSlug.code, 0);
  assert.equal(withSlug.stdout, "", "an env_presence row can never trigger --line's noisy path, even with NOTE_SLUG set");

  const withoutSlug = runCli(["--line"], home, { NOTE_SLUG: "" });
  assert.equal(withoutSlug.code, 0);
  assert.equal(withoutSlug.stdout, "", "nor with NOTE_SLUG absent");
});

// ---------------------------------------------------------------------------
// J2: the six new checks that can actually fail (hook_present x2, file_exists x2, json_value,
// file_fresh with a requiresFile gate) - each proven against the SHIPPED list's own row, not a
// synthetic stand-in, so a change to the real JSON is what breaks these.
// ---------------------------------------------------------------------------

function shippedList() {
  const raw = JSON.parse(fs.readFileSync(path.join(HERE, "required-wiring.default.json"), "utf8"));
  return Array.isArray(raw) ? raw : raw.checks;
}

function shippedRow(id) {
  const row = shippedList().find((c) => c.id === id);
  assert.ok(row, `required-wiring.default.json must have a check with id ${id}`);
  return row;
}

test("the shipped list gained exactly eight new checks: two hook_present (exact command+matcher), four file_exists, one json_value, one file_fresh with a requiresFile gate", () => {
  const list = shippedList();
  assert.equal(list.length, 18, "9 original + 8 new + 1 collect-status-fresh (collect-status-1/C3)");
  const delGuard = shippedRow("hook-delete-guard");
  assert.equal(delGuard.type, "hook_present");
  assert.equal(delGuard.event, "PreToolUse");
  assert.equal(delGuard.file, "${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json");
  assert.equal(delGuard.matcher, "Bash|PowerShell");
  assert.equal(delGuard.command, "node \"${CLAUDE_PLUGIN_ROOT}/hooks/delete-guard.mjs\"");

  const postInbox = shippedRow("hook-post-tool-use-inbox");
  assert.equal(postInbox.type, "hook_present");
  assert.equal(postInbox.event, "PostToolUse");
  assert.equal(postInbox.file, "${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json");
  assert.equal(postInbox.matcher, "*");
  assert.equal(postInbox.command, "node \"${CLAUDE_PLUGIN_ROOT}/hooks/multi-inbox.js\" PostToolUse");

  const delGuardScript = shippedRow("hook-delete-guard-script");
  assert.equal(delGuardScript.type, "file_exists");
  assert.equal(delGuardScript.file, "${CLAUDE_PLUGIN_ROOT}/hooks/delete-guard.mjs");

  const postInboxScript = shippedRow("hook-post-tool-use-inbox-script");
  assert.equal(postInboxScript.type, "file_exists");
  assert.equal(postInboxScript.file, "${CLAUDE_PLUGIN_ROOT}/hooks/multi-inbox.js");

  const shim = shippedRow("note-send-shim");
  assert.equal(shim.type, "file_exists");
  assert.equal(shim.file, "~/.local/bin/note-send");

  const notesDir = shippedRow("notes-dir");
  assert.equal(notesDir.type, "file_exists");
  assert.equal(notesDir.file, "~/.agents/notes");

  const cross = shippedRow("cross-session-inbound");
  assert.equal(cross.type, "json_value");
  assert.equal(cross.file, "~/.claude/settings.json");
  assert.equal(cross.path, "crossSessionInbound");
  assert.equal(cross.expected, "accept");

  const lastRun = shippedRow("janitor-last-run");
  assert.equal(lastRun.type, "file_fresh");
  assert.equal(lastRun.file, "~/.agents/janitor/last-run.log");
  assert.equal(lastRun.maxAgeSeconds, 26 * 3600);
  assert.equal(lastRun.whenMissing, "missing");
  assert.equal(lastRun.requiresFile, "~/.agents/janitor/installed.json");
});

test("hook-delete-guard and hook-post-tool-use-inbox: ok against this repo's own real hooks/hooks.json, missing against an empty plugin root", () => {
  const home = mkHome();
  const real = checkWiring({
    home,
    pluginRoot: REPO_ROOT,
    platform: "linux",
    fsImpl: readOnlyFs(home),
    lists: { public: [shippedRow("hook-delete-guard"), shippedRow("hook-post-tool-use-inbox")], private: [] },
  });
  assert.equal(real.results[0].state, "ok", real.results[0].why);
  assert.equal(real.results[1].state, "ok", real.results[1].why);

  const emptyRoot = mkHome();
  const missing = checkWiring({
    home,
    pluginRoot: emptyRoot,
    platform: "linux",
    fsImpl: readOnlyFs(home),
    lists: { public: [shippedRow("hook-delete-guard"), shippedRow("hook-post-tool-use-inbox")], private: [] },
  });
  assert.equal(missing.results[0].state, "missing");
  assert.equal(missing.results[1].state, "missing");
});

test("hook-delete-guard's exact command+matcher pin does not match a commented-out, echoed, disabled, renamed-file or wrong-matcher hook - only the real parsed command string under the real matcher", () => {
  const check = shippedRow("hook-delete-guard");
  const real = "node \"${CLAUDE_PLUGIN_ROOT}/hooks/delete-guard.mjs\"";

  function withCommand(command, matcher = check.matcher) {
    const pluginRoot = mkHome();
    write(pluginRoot, "hooks/hooks.json", JSON.stringify({
      hooks: { PreToolUse: [{ matcher, hooks: [{ type: "command", command }] }] },
    }));
    return pluginRoot;
  }

  const home = mkHome();
  function stateFor(pluginRoot) {
    const { results } = checkWiring({ home, pluginRoot, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [check], private: [] } });
    return results[0].state;
  }

  assert.equal(stateFor(withCommand(real)), "ok", "the real command under the real matcher must still read ok");

  // Round-2 (B1): a raw substring match would be fooled by every one of these - an exact `command`
  // equality plus a `matcher` equality is what tells them apart from the real thing.
  assert.equal(stateFor(withCommand(`# ${real}`)), "missing", "a shell-commented command must not satisfy the pin");
  assert.equal(stateFor(withCommand(`echo 'hooks/delete-guard.mjs is disabled for now'`)), "missing", "an echoed mention must not satisfy the pin");
  assert.equal(stateFor(withCommand(`true || ${real}`)), "missing", "a true-|| disabled command must not satisfy the pin");
  assert.equal(stateFor(withCommand(`node "\${CLAUDE_PLUGIN_ROOT}/hooks/delete-guard.mjs.bak"`)), "missing", "a renamed-file command must not satisfy the pin");
  assert.equal(stateFor(withCommand(real, "Read")), "missing", "the real command parked under a different matcher never fires for Bash and must not satisfy the pin");

  const trulyDifferent = withCommand("node \"${CLAUDE_PLUGIN_ROOT}/hooks/some-other-guard.mjs\"");
  assert.equal(stateFor(trulyDifferent), "missing", "a different hook command must never satisfy the delete-guard check");
});

test("note-send-shim and notes-dir: file_exists against ~/.local/bin/note-send and ~/.agents/notes", () => {
  const home = mkHome();
  const bare = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [shippedRow("note-send-shim"), shippedRow("notes-dir")], private: [] } });
  assert.equal(bare.results[0].state, "missing");
  assert.equal(bare.results[1].state, "missing");

  write(home, ".local/bin/note-send", "#!/bin/sh\n");
  fs.mkdirSync(path.join(home, ".agents", "notes"), { recursive: true });
  const wired = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [shippedRow("note-send-shim"), shippedRow("notes-dir")], private: [] } });
  assert.equal(wired.results[0].state, "ok");
  assert.equal(wired.results[1].state, "ok");
});

test("cross-session-inbound: missing when absent, stale when present but not 'accept', ok when 'accept', unknown when the settings file is unreadable or invalid JSON", () => {
  const home = mkHome();
  const check = shippedRow("cross-session-inbound");
  const absent = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [check], private: [] } });
  assert.equal(absent.results[0].state, "missing");

  write(home, ".claude/settings.json", JSON.stringify({ crossSessionInbound: "ask" }));
  const wrongValue = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [check], private: [] } });
  assert.equal(wrongValue.results[0].state, "stale");
  assert.doesNotMatch(wrongValue.results[0].why, /"ask"/, "a string value must never be printed verbatim, only 'differs'");

  write(home, ".claude/settings.json", JSON.stringify({ crossSessionInbound: "accept" }));
  const ok = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [check], private: [] } });
  assert.equal(ok.results[0].state, "ok");

  write(home, ".claude/settings.json", "{not-json");
  const corrupt = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [check], private: [] } });
  assert.equal(corrupt.results[0].state, "unknown", "invalid JSON must be unknown, never ok");
});

test("janitor-last-run (file_fresh + requiresFile): the J1/J2 seam contract's exact state table", () => {
  const check = shippedRow("janitor-last-run");
  const home = mkHome();

  // installed.json absent: info (round-2 amendment: spec.md J2.2 says a host without J1 is not
  // red for that reason, so this must never count against checkWiring().ok), never missing - even
  // though the log is also absent.
  const neverInstalled = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [check], private: [] } });
  assert.equal(neverInstalled.results[0].state, "info");
  assert.ok(neverInstalled.ok, "an uninstalled J1 timer must not make checkWiring().ok false");

  // installed.json present, log absent: missing.
  write(home, ".agents/janitor/installed.json", JSON.stringify({ schema: 1 }));
  const installedNoLog = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [check], private: [] } });
  assert.equal(installedNoLog.results[0].state, "missing");

  // log older than 26h: stale.
  const logPath = write(home, ".agents/janitor/last-run.log", "ran\n");
  const oldTime = new Date(Date.now() - 27 * 3600 * 1000);
  fs.utimesSync(logPath, oldTime, oldTime);
  const stale = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [check], private: [] } });
  assert.equal(stale.results[0].state, "stale");

  // otherwise (fresh log, installed.json present): ok.
  const freshTime = new Date();
  fs.utimesSync(logPath, freshTime, freshTime);
  const ok = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [check], private: [] } });
  assert.equal(ok.results[0].state, "ok");
});

test("janitor-last-run: installed.json itself being unreadable/corrupt is unknown, not a crash and not silently ok", () => {
  const check = shippedRow("janitor-last-run");
  const home = mkHome();
  write(home, ".agents/janitor/installed.json", "{not-json");
  write(home, ".agents/janitor/last-run.log", "ran\n");
  const fsImpl = {
    existsSync: (p) => fs.existsSync(p),
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    statSync: (p) => {
      // installed.json exists but is unreadable for a reason other than "not found".
      if (path.resolve(String(p)) === path.resolve(path.join(home, ".agents", "janitor", "installed.json"))) {
        const err = new Error("EACCES simulated");
        err.code = "EACCES";
        throw err;
      }
      return fs.statSync(p);
    },
  };
  const { results } = checkWiring({ home, platform: "linux", fsImpl, lists: { public: [check], private: [] } });
  assert.equal(results[0].state, "unknown");
});

// ---------------------------------------------------------------------------
// J4: CLI
// ---------------------------------------------------------------------------

/** Every child here goes through childEnv(): this session's own inbox socket/token must never
 * reach a spawned wiring-check process, whatever else it needs to see (test-child-env.mjs).
 * AGENTS_HOME is pinned to this fixture's own .agents dir (goal-card.test.mjs:296 does the same),
 * so an ambient AGENTS_HOME on the machine running the suite can never leak into the child. */
function runCli(args, home, over = {}) {
  try {
    // Pin CLAUDE_PLUGIN_ROOT at this repo's own real root so the two hook_present checks (which
    // read the plugin's own hooks.json, not anything under `home`) are deterministic here
    // regardless of whatever the ambient shell running the suite happens to have set - the same
    // rule test-child-env.mjs exists to enforce for every other environment input.
    const out = execFileSync(NODE, [SCRIPT, ...args], {
      encoding: "utf8",
      env: childEnv(home, { AGENTS_HOME: path.join(home, ".agents"), CLAUDE_PLUGIN_ROOT: REPO_ROOT, ...over }),
    });
    return { code: 0, stdout: out, stderr: "" };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

test("CLI: no flag prints a table and exits 1 against a scratch home with nothing configured (J2: the wiring check can now actually go red)", () => {
  const home = mkHome();
  const { code, stdout } = runCli([], home);
  assert.equal(code, 1);
  assert.match(stdout, /wiring check:/);
});

test("CLI --json prints a parseable { ok, results } object, and the exit code mirrors ok", () => {
  const home = mkHome();
  const { code, stdout } = runCli(["--json"], home);
  const parsed = JSON.parse(stdout);
  assert.equal(typeof parsed.ok, "boolean");
  assert.ok(Array.isArray(parsed.results));
  assert.equal(parsed.ok, false, "a bare scratch home has real findings against the shipped default list");
  assert.equal(code, 1, "J2: the CLI's exit code must be 1 when checkWiring().ok is false");
});

test("CLI --json exits 0 when a fully-wired scratch home makes checkWiring().ok true", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const { code, stdout } = runCli(["--json"], home);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.results.filter((r) => r.state !== "ok" && r.state !== "info")));
  assert.equal(code, 0);
});

test("CLI --line prints nothing when nothing is missing or stale (a fully-wired scratch home has only info/ok results)", () => {
  const home = mkHome();
  // lean-rules-file (file_fresh, no whenMissing override) is 'stale' when absent, same as any other
  // required file - a truly "nothing to flag" home has to actually carry it, and (J2) so do the
  // note-send shim, the notes dir, the Claude settings value and the janitor's own last-run.log.
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const { code, stdout } = runCli(["--line"], home);
  assert.equal(code, 0);
  assert.equal(stdout, "");
});

test("CLI --line names lean-rules-file when ~/.agents/lean-rules.md is absent, and only that (everything else is wired)", () => {
  const home = mkHome();
  wireEverythingElse(home); // everything but lean-rules.md, so it is the ONLY finding
  const { code, stdout } = runCli(["--line"], home);
  assert.equal(code, 1);
  assert.match(stdout.trim(), /^wiring: \d+ flagged \(.*\)\. Run wiring-check for the fixes\.$/);
  assert.match(stdout, /lean rules file/);
});

test("CLI --line --hook (the SessionStart caller): still prints the line when something is flagged, but always exits 0", () => {
  const home = mkHome();
  wireEverythingElse(home); // everything but lean-rules.md, so it is the ONLY finding
  const { code, stdout } = runCli(["--line", "--hook"], home);
  assert.equal(code, 0, "B2: a Claude Code command hook's non-zero exit drops its stdout, so --hook must keep exit 0 even while red");
  assert.match(stdout, /lean rules file/, "the visibility line must still reach the session under --hook");
});

test("CLI --line --hook against a bare scratch home (nothing configured) still exits 0 and prints the line", () => {
  const home = mkHome();
  const { code, stdout } = runCli(["--line", "--hook"], home);
  assert.equal(code, 0);
  assert.match(stdout, /^wiring: \d+ flagged/);
});

test("CLI --line prints one line naming what is missing when something is", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  // A private list this scratch home supplies, entirely independent of the shipped default list,
  // guaranteeing at least one 'missing' result regardless of platform.
  write(home, ".agents/required-wiring.json", JSON.stringify([
    { id: "definitely-missing", type: "file_exists", file: "~/does/not/exist", why: "w", fix: "f" },
  ]));
  const { code, stdout } = runCli(["--line"], home);
  assert.equal(code, 1);
  assert.match(stdout.trim(), /^wiring: \d+ flagged \(.*\)\. Run wiring-check for the fixes\.$/);
  assert.match(stdout, /definitely missing/);
});

test("CLI --line prints nothing when ~/.agents/ws-off is present, even with a missing check (ws-off only silences --line's output, never the exit code)", () => {
  const home = mkHome();
  write(home, ".agents/required-wiring.json", JSON.stringify([
    { id: "definitely-missing", type: "file_exists", file: "~/does/not/exist", why: "w", fix: "f" },
  ]));
  write(home, ".agents/ws-off", "");
  const { code, stdout } = runCli(["--line"], home);
  assert.equal(code, 1, "ws-off silences the --line text, not the exit code - checkWiring().ok is still false");
  assert.equal(stdout, "");
});

test("CLI --line: an fsImpl whose stat throws a non-ENOENT error for ws-off counts the switch as present, and the line stays silent", () => {
  // Seam review MINOR 1+2+3: wsOffActive() now goes through opts.fsImpl, not the real fs - so this
  // fail-safe branch (an unreadable switch file) is finally reachable from a test at all, on any OS.
  const home = mkHome();
  const wsOffPath = path.join(home, ".agents", "ws-off");
  const fsImpl = {
    existsSync: (p) => fs.existsSync(p),
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    statSync: (p) => {
      if (path.resolve(String(p)) === path.resolve(wsOffPath)) {
        const err = new Error("EACCES simulated");
        err.code = "EACCES";
        throw err;
      }
      return fs.statSync(p);
    },
  };
  const origLog = console.log;
  let out = "";
  console.log = (s) => { out += `${s}\n`; };
  try {
    const code = main(["--line"], {
      home,
      fsImpl,
      lists: { public: [{ id: "definitely-missing", type: "file_exists", file: "~/does/not/exist", why: "w", fix: "f" }], private: [] },
    });
    assert.equal(code, 1, "ws-off silences the printed line, not the exit code - checkWiring().ok is still false");
  } finally {
    console.log = origLog;
  }
  assert.equal(out, "", "an unreadable ws-off must be treated as present, silencing the line even though something is missing");
});

test("CLI --line keeps a throwing fsImpl accessor inside the ws-off fail-silent boundary", () => {
  const home = mkHome();
  const opts = { home };
  Object.defineProperty(opts, "fsImpl", { get() { throw new Error("PRIVATE-ACCESSOR-ERROR"); } });
  const origLog = console.log;
  let out = "";
  console.log = (value) => { out += `${value}\n`; };
  try {
    assert.doesNotThrow(() => main(["--line"], opts));
  } finally {
    console.log = origLog;
  }
  assert.equal(out, "");
});

test("an injected opts.home wins over an ambient AGENTS_HOME (seam-delta precedence fix)", () => {
  const decoy = mkHome(); const home = mkHome();
  write(home, ".agents/ws-off", "");
  const prev = process.env.AGENTS_HOME;
  process.env.AGENTS_HOME = path.join(decoy, ".agents");
  const origLog = console.log; let out = "";
  console.log = (s) => { out += `${s}\n`; };
  try {
    assert.equal(main(["--line"], { home, lists: { public: [
      { id: "definitely-missing", type: "file_exists", file: "~/nope", why: "w", fix: "f" }], private: [] } }), 1);
  } finally {
    console.log = origLog;
    if (prev === undefined) delete process.env.AGENTS_HOME; else process.env.AGENTS_HOME = prev;
  }
  assert.equal(out, "", "opts.home must win: the env-first order would read the decoy and print");
});

test("CLI: an unknown flag is a usage error, exit 1, and never a stack trace", () => {
  const home = mkHome();
  const { code, stderr } = runCli(["--bogus"], home);
  assert.equal(code, 1);
  assert.match(stderr, /unknown argument/);
});

test("main() as a function (not a subprocess) returns 0 for known flags and 1 for an unknown one - a scratch home only, never the real one", () => {
  // Round-1 review: main() with no opts falls back to os.homedir(), so calling it bare here would
  // print THIS machine's real wiring state into the suite's own output. Every call below pins a
  // scratch home explicitly, exactly like the CLI tests above already do via runCli().
  const home = mkHome();
  const origLog = console.log;
  console.log = () => {}; // this test asserts on exit codes only, not stdout
  try {
    assert.equal(main(["--json"], { home, fsImpl: readOnlyFs(home), lists: { public: [], private: [] } }), 0);
    assert.equal(main(["--line"], { home, fsImpl: readOnlyFs(home), lists: { public: [], private: [] } }), 0);
    assert.equal(main([], { home, fsImpl: readOnlyFs(home), lists: { public: [], private: [] } }), 0);
    assert.equal(main(["--nope"], { home, fsImpl: readOnlyFs(home), lists: { public: [], private: [] } }), 1);
  } finally {
    console.log = origLog;
  }
});

test("main reports an unexpected dependency failure as bounded unknown without leaking its error", () => {
  const home = mkHome();
  const opts = { home, fsImpl: readOnlyFs(home) };
  Object.defineProperty(opts, "lists", {
    get() { throw new Error("SECRET_SENTINEL"); },
  });
  const origLog = console.log;
  const lines = [];
  console.log = (value) => { lines.push(String(value)); };
  try {
    assert.equal(main(["--json"], opts), 1, "an unknown result is not ok, so the CLI's exit code must be 1 too");
    const parsed = JSON.parse(lines.shift());
    assert.equal(parsed.ok, false);
    assert.equal(parsed.results[0].state, "unknown");
    assert.doesNotMatch(JSON.stringify(parsed), /SECRET_SENTINEL/);

    assert.equal(main(["--line"], opts), 1);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /wiring: 1 flagged \(wiring check\)/);
    assert.doesNotMatch(lines[0], /SECRET_SENTINEL/);
  } finally {
    console.log = origLog;
  }
});

// ---------------------------------------------------------------------------
// round-1 findings: a missing type is not silently dropped, and inboxes.json is refused
// ---------------------------------------------------------------------------

test("a check with NO type field is unknown and never silently dropped", () => {
  const home = mkHome();
  const checks = [
    { id: "no-type-at-all", why: "w", fix: "f" }, // no `type` key whatsoever
    { id: "null-type", type: null, why: "w", fix: "f" },
  ];
  const { results } = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.ok(byId["no-type-at-all"], "a check with a missing type must still produce a result row");
  assert.equal(byId["no-type-at-all"].state, "unknown");
  assert.match(byId["no-type-at-all"].why, /invalid wiring check definition/);
  assert.ok(byId["null-type"], "a check with type: null must still produce a result row");
  assert.equal(byId["null-type"].state, "unknown");
});

test("a private-list entry naming inboxes.json is refused before any fs call, whatever type it claims", () => {
  const home = mkHome();
  const inboxesPath = path.join(home, ".agents", "notes", "inboxes.json");
  const touched = [];
  const spyFs = {
    existsSync: (p) => {
      touched.push(String(p));
      return fs.existsSync(p);
    },
    readFileSync: (p, enc) => {
      touched.push(String(p));
      return fs.readFileSync(p, enc);
    },
    statSync: (p) => {
      touched.push(String(p));
      return fs.statSync(p);
    },
  };
  const hostile = [
    { id: "read-the-inbox", type: "file_exists", file: "~/.agents/notes/inboxes.json", why: "w", fix: "f" },
    { id: "read-the-inbox-fresh", type: "file_fresh", file: "~/.agents/notes/inboxes.json", maxAgeSeconds: 60, why: "w", fix: "f" },
    { id: "read-the-inbox-json", type: "json_value", file: "~/.agents/notes/inboxes.json", path: "a", expected: 1, why: "w", fix: "f" },
  ];
  const { results } = checkWiring({ home, platform: "linux", fsImpl: spyFs, lists: { public: hostile, private: [] } });
  for (const r of results) {
    assert.equal(r.state, "unknown", `${r.id} must be refused as unknown, not evaluated`);
    assert.match(r.why, /protected peer-note ledger/);
  }
  assert.ok(!touched.some((p) => p === inboxesPath), "inboxes.json must never be opened or stat'ed, even though it never exists in this fixture yet");
});

// round-2 review D4 (MINOR): the refusal compared the basename case-sensitively, so on a real
// case-insensitive filesystem (Windows/NTFS, and macOS by default) a check spelled `INBOXES.JSON`
// (or any other-cased variant) still resolved to the same real ledger file and was evaluated - the
// reviewer measured a json_value mismatch printer then reading a value OUT of it. This test plants a
// real ledger file with content and proves every case variant is refused before any fs call, never
// just that the message looks right.
test("a check naming inboxes.json in ANY letter case is refused before any fs call, and nothing is read out of it", () => {
  const home = mkHome();
  const inboxesPath = write(home, ".agents/notes/inboxes.json", JSON.stringify({ marker: "LEDGER-CONTENT-MUST-NEVER-APPEAR" }));
  const touched = [];
  const spyFs = {
    existsSync: (p) => {
      touched.push(String(p));
      return fs.existsSync(p);
    },
    readFileSync: (p, enc) => {
      touched.push(String(p));
      return fs.readFileSync(p, enc);
    },
    statSync: (p) => {
      touched.push(String(p));
      return fs.statSync(p);
    },
  };
  const variants = ["INBOXES.JSON", "Inboxes.Json", "inboxes.JSON", "InBoXeS.jSoN"];
  const hostile = variants.map((name, i) => ({
    id: `case-variant-${i}`,
    type: "json_value",
    file: `~/.agents/notes/${name}`,
    path: "marker",
    expected: "LEDGER-CONTENT-MUST-NEVER-APPEAR",
    why: "w",
    fix: "f",
  }));
  const { results } = checkWiring({ home, platform: "linux", fsImpl: spyFs, lists: { public: hostile, private: [] } });
  for (const r of results) {
    assert.equal(r.state, "unknown", `${r.id} must be refused as unknown, not evaluated`);
    assert.match(r.why, /protected peer-note ledger/);
    assert.doesNotMatch(r.why, /LEDGER-CONTENT-MUST-NEVER-APPEAR/, `${r.id}'s message must never contain the ledger's actual content`);
  }
  assert.equal(touched.length, 0, "no case variant of inboxes.json may ever be opened or stat'ed, whatever the platform's own case sensitivity would resolve to");
  void inboxesPath;
});

// ---------------------------------------------------------------------------
// P7 (docs/specs/stale-session-guard-1/spec.md) - the stale-session line. Same fact as
// agent-dispatch-guard.mjs's R0-stale, read through THIS script's own path instead of the
// guard's; `main()`'s `opts.scriptPath` stands in for `SELF_PATH` here exactly like
// `opts.home`/`opts.fsImpl` already stand in for the real filesystem above.
// ---------------------------------------------------------------------------

/** A fake `.claude/plugins/cache/<marketplace>/<name>/<version>/` directory under `home`,
 * plus its own `installed_plugins.json` - the exact shape `plugin-staleness.mjs` reads.
 * Returns a `scriptPath` two directories below the version dir, mirroring this file's own
 * `scripts/x.mjs` shape. */
function staleFixture(home, { running, installedVersions, marketplace = "benzhuk", name = "delegation" }) {
  const versionDir = path.join(home, ".claude", "plugins", "cache", marketplace, name, running);
  fs.mkdirSync(versionDir, { recursive: true });
  const scriptPath = path.join(versionDir, "scripts", "wiring-check.mjs");
  write(home, ".claude/plugins/installed_plugins.json", JSON.stringify({
    version: 2,
    plugins: { [`${name}@${marketplace}`]: installedVersions.map((version) => ({ scope: "user", version })) },
  }));
  return scriptPath;
}

/** Runs `main()` in-process, capturing console.log - every P7 test below needs this, and
 * every one pins `env: {}` so this suite never reads the real process's own
 * CLAUDE_CONFIG_DIR. */
function runMainCapturing(args, opts) {
  const origLog = console.log;
  let out = "";
  console.log = (s) => { out += `${s}\n`; };
  try {
    return { code: main(args, { env: {}, ...opts }), out };
  } finally {
    console.log = origLog;
  }
}

test("P7: --line prints the stale marker and the exit code goes red, even though checkWiring's own findings are all ok", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home); // checkWiring().ok === true on its own
  const scriptPath = staleFixture(home, { running: "0.20.9", installedVersions: ["0.20.16"] });
  const { code, out } = runMainCapturing(["--line"], { home, scriptPath });
  assert.equal(code, 1, "a stale session is a red exit even though every ordinary check is ok");
  assert.match(out, /^stale session: this session loaded delegation hooks 0\.20\.9, but 0\.20\.16 is installed/m);
});

test("P7: --hook keeps exit 0 while stale, but the line still prints (same rule as any other flagged finding)", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const scriptPath = staleFixture(home, { running: "0.20.9", installedVersions: ["0.20.16"] });
  const { code, out } = runMainCapturing(["--line", "--hook"], { home, scriptPath });
  assert.equal(code, 0);
  // Lane 68 item 1: --hook prints the one-line restart advisory, not the long stale-session text.
  assert.match(out, /^plugin 0\.20\.9 running, 0\.20\.16 installed: restart this pane$/m);
  assert.doesNotMatch(out, /stale session: /);
  assert.equal(out.split(/\r?\n/).filter((l) => l.startsWith("plugin ")).length, 1, "exactly one advisory line");
});

test("lane 68: --hook is silent about staleness when not stale, and when ~/.agents/ws-off is present", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const fresh = staleFixture(home, { running: "0.20.16", installedVersions: ["0.20.16"] });
  const a = runMainCapturing(["--line", "--hook"], { home, scriptPath: fresh });
  assert.equal(a.code, 0);
  assert.doesNotMatch(a.out, /restart this pane|stale session/);

  const home2 = mkHome();
  write(home2, ".agents/lean-rules.md", "# lean rules\n");
  write(home2, ".agents/ws-off", "");
  wireEverythingElse(home2);
  const stale = staleFixture(home2, { running: "0.20.9", installedVersions: ["0.20.16"] });
  const b = runMainCapturing(["--line", "--hook"], { home: home2, scriptPath: stale });
  assert.equal(b.code, 0);
  assert.equal(b.out, "", "ws-off silences the advisory");
});

test("lane 68: bare --line keeps the long stale-session text (only --hook changed)", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const scriptPath = staleFixture(home, { running: "0.20.9", installedVersions: ["0.20.16"] });
  const { out } = runMainCapturing(["--line"], { home, scriptPath });
  assert.match(out, /^stale session: /m);
  assert.doesNotMatch(out, /restart this pane/);
});

test("P7: not stale (running equal to the installed entry) prints nothing extra and the exit stays green", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const scriptPath = staleFixture(home, { running: "0.20.16", installedVersions: ["0.20.16"] });
  const { code, out } = runMainCapturing(["--line"], { home, scriptPath });
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("P7: not stale (running newer than every entry) prints nothing extra and the exit stays green", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const scriptPath = staleFixture(home, { running: "0.21.0", installedVersions: ["0.20.16"] });
  const { code, out } = runMainCapturing(["--line"], { home, scriptPath });
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("P7: ws-off silences the printed line but the exit code stays red while stale (never silences the exit)", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  write(home, ".agents/ws-off", "");
  const scriptPath = staleFixture(home, { running: "0.20.9", installedVersions: ["0.20.16"] });
  const { code, out } = runMainCapturing(["--line"], { home, scriptPath });
  assert.equal(code, 1, "ws-off silences the line, never the exit code - same rule as every other finding");
  assert.equal(out, "");
});

test("P7: a non-cache scriptPath (the real repo-checkout shape) is not stale", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const scriptPath = path.join(home, "repo-checkout", "scripts", "wiring-check.mjs");
  const { code, out } = runMainCapturing(["--line"], { home, scriptPath });
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("P7: with no scriptPath override at all, main() defaults to THIS repo's own real wiring-check.mjs - never stale in this suite", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const { code, out } = runMainCapturing(["--line"], { home });
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("P7: a staleness read that throws never crashes main() and is treated as not stale", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const throwingFs = { ...fs, realpathSync() { throw new Error("boom"); } };
  const scriptPath = staleFixture(home, { running: "0.20.9", installedVersions: ["0.20.16"] });
  const { code, out } = runMainCapturing(["--line"], { home, scriptPath, fsImpl: throwingFs });
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("P7: CLI subprocess through the real file - copying this script into a fake cache dir proves the CLI wrapper (not just an injected opts.scriptPath) reads its own real location", () => {
  const home = mkHome();
  const versionDir = path.join(home, ".claude", "plugins", "cache", "benzhuk", "delegation", "0.20.9", "scripts");
  fs.mkdirSync(versionDir, { recursive: true });
  const copiedScript = path.join(versionDir, "wiring-check.mjs");
  fs.copyFileSync(SCRIPT, copiedScript);
  fs.copyFileSync(path.join(HERE, "plugin-staleness.mjs"), path.join(versionDir, "plugin-staleness.mjs"));
  fs.copyFileSync(path.join(HERE, "required-wiring.default.json"), path.join(versionDir, "required-wiring.default.json"));
  write(home, ".claude/plugins/installed_plugins.json", JSON.stringify({
    version: 2,
    plugins: { "delegation@benzhuk": [{ scope: "user", version: "0.20.16" }] },
  }));
  let out;
  try {
    out = execFileSync(NODE, [copiedScript, "--line"], {
      encoding: "utf8",
      env: childEnv(home, { AGENTS_HOME: path.join(home, ".agents") }),
    });
  } catch (err) {
    out = err.stdout ?? ""; // this fixture's ordinary checks are red too (no --hook here) - fine, only the marker matters
  }
  assert.match(out, /^stale session: this session loaded delegation hooks 0\.20\.9, but 0\.20\.16 is installed/m);
});

/** Like runMainCapturing, but also captures process.stderr.write - MINOR 4 (review-r1.md)
 * puts the stale line on stderr in --json mode so stdout's JSON stays exactly parseable. */
function runMainCapturingBoth(args, opts) {
  const origLog = console.log;
  const origErr = process.stderr.write.bind(process.stderr);
  let out = "";
  let err = "";
  console.log = (s) => { out += `${s}\n`; };
  process.stderr.write = (s) => { err += s; return true; };
  try {
    return { code: main(args, { env: {}, ...opts }), out, err };
  } finally {
    console.log = origLog;
    process.stderr.write = origErr;
  }
}

test("MINOR 4: --json keeps stdout exactly parseable and puts the stale reason on stderr", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const scriptPath = staleFixture(home, { running: "0.20.9", installedVersions: ["0.20.16"] });
  const { code, out, err } = runMainCapturingBoth(["--json"], { home, scriptPath });
  assert.equal(code, 1, "a stale session is a red exit in --json mode too");
  const parsed = JSON.parse(out); // must not throw: stdout is untouched by the stale line
  assert.equal(parsed.ok, true, "checkWiring()'s own findings are unaffected by staleness");
  assert.match(err, /^stale session: this session loaded delegation hooks 0\.20\.9, but 0\.20\.16 is installed/m);
});

test("MINOR 4: --json prints nothing extra to stderr and stays green when not stale", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const scriptPath = staleFixture(home, { running: "0.20.16", installedVersions: ["0.20.16"] });
  const { code, err } = runMainCapturingBoth(["--json"], { home, scriptPath });
  assert.equal(code, 0);
  assert.equal(err, "");
});

test("MINOR 4: table mode (no flag) prints the stale line too, and goes red", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const scriptPath = staleFixture(home, { running: "0.20.9", installedVersions: ["0.20.16"] });
  const { code, out } = runMainCapturing([], { home, scriptPath });
  assert.equal(code, 1);
  assert.match(out, /^stale session: this session loaded delegation hooks 0\.20\.9, but 0\.20\.16 is installed/m);
  assert.match(out, /^wiring check:/m, "the ordinary table is still printed alongside the stale line");
});

test("MINOR 4: table mode prints nothing extra and stays green when not stale", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const scriptPath = staleFixture(home, { running: "0.20.16", installedVersions: ["0.20.16"] });
  const { code, out } = runMainCapturing([], { home, scriptPath });
  assert.equal(code, 0);
  assert.doesNotMatch(out, /^stale session: /m);
});

// ---------------------------------------------------------------------------
// Wired into hooks.json: SessionStart shows the wiring check on its own
// ---------------------------------------------------------------------------

test("hooks.json runs wiring-check.mjs --line --hook on SessionStart, pointed at a real file, with a timeout", () => {
  const repoRoot = path.join(HERE, "..");
  const hooksPath = path.join(repoRoot, "hooks", "hooks.json");
  const cfg = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
  const sessionStartHooks = cfg.hooks.SessionStart.flatMap((g) => g.hooks);
  const entry = sessionStartHooks.find((h) => h.command.includes("wiring-check.mjs") && h.command.includes("--line"));
  assert.ok(entry, "SessionStart must run wiring-check.mjs --line");
  // Round-2 (B2): a bare --line's non-zero exit is a non-blocking hook error that Claude Code
  // discards the stdout for, so the SessionStart caller must also pass --hook to keep exit 0.
  assert.match(entry.command, /--hook\b/, "the SessionStart hook must pass --hook so its non-zero exit never drops the printed line");
  assert.match(entry.command, /\$\{CLAUDE_PLUGIN_ROOT\}/, "must be plugin-root relative like its neighbours");
  assert.equal(typeof entry.timeout, "number");
  assert.ok(entry.timeout > 0);
  const referenced = entry.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+wiring-check\.mjs)/)[1];
  assert.ok(fs.existsSync(path.join(repoRoot, referenced)), `${referenced} must exist`);
});


// ---------------------------------------------------------------------------
// Lane 74 item 6: the SessionStart --hook path ends with a fail-open timer refresh
// ---------------------------------------------------------------------------

import { refreshIfRegistered } from "./janitor-timer-refresh.mjs";

/** The plugin root a fixture's script runs from: <cache>/<marketplace>/<name>/<version>. */
const rootOf = (scriptPath) => path.dirname(path.dirname(scriptPath));

test("lane 74: --hook calls the timer refresh once, after its own output, with the injected home; bare --line never does", () => {
  const home = mkHome();
  // no lean-rules.md: the wiring line prints, so the order assertion has output to order against
  wireEverythingElse(home);
  const calls = [];
  const order = [];
  const origLog = console.log;
  let out = "";
  console.log = (s) => { order.push(String(s).startsWith("janitor timer") ? "refresh-line" : "line"); out += `${s}
`; };
  try {
    const refresh = (a) => { calls.push(a); order.push("refresh"); return { action: "none" }; };
    const scriptPath = staleFixture(home, { running: "0.20.16", installedVersions: ["0.20.16"] });
    const pluginRoot = rootOf(scriptPath);
    assert.equal(main(["--line", "--hook"], { env: {}, home, scriptPath, pluginRoot, refresh }), 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].home, home, "the refresh is pointed at the injected home, never the real one");
    assert.equal(calls[0].pluginRoot, pluginRoot);
    assert.deepEqual(order, ["line", "refresh"], "the hook's own output comes first, the refresh after it");
    main(["--line"], { env: {}, home, scriptPath, pluginRoot, refresh });
    main(["--json"], { env: {}, home, scriptPath, pluginRoot, refresh });
    assert.equal(calls.length, 1, "only the SessionStart --hook caller refreshes");
  } finally {
    console.log = origLog;
  }
});

test("lane 74: a STALE session's --hook never refreshes the timer and prints no janitor timer line", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const scriptPath = staleFixture(home, { running: "0.20.9", installedVersions: ["0.20.16"] });
  const calls = [];
  const refresh = (a) => { calls.push(a); return { action: "refreshed", reason: "should never run" }; };
  const { code, out } = runMainCapturing(["--line", "--hook"], { home, scriptPath, pluginRoot: rootOf(scriptPath), refresh });
  assert.equal(code, 0);
  assert.match(out, /0\.20\.9/, "the stale advisory still prints");
  assert.equal(calls.length, 0, "a stale pane is not the installed release: refreshing from it would downgrade the timer");
  assert.doesNotMatch(out, /janitor timer/);
});

test("lane 74: a root outside ~/.claude/plugins/cache (a .codex cache, a dev checkout, no root) makes 0 installer calls and prints nothing", () => {
  const home = mkHome();
  wireEverythingElse(home);
  const scriptPath = staleFixture(home, { running: "0.20.16", installedVersions: ["0.20.16"] });
  const codexRoot = path.join(home, ".codex", "plugins", "cache", "benzhuk", "delegation", "0.20.16");
  const devRoot = path.join(home, "Code", "dev-worktree");
  fs.mkdirSync(codexRoot, { recursive: true });
  fs.mkdirSync(devRoot, { recursive: true });
  const calls = [];
  const refresh = (a) => { calls.push(a); return { action: "refused", reason: "should never run" }; };
  for (const pluginRoot of [codexRoot, devRoot, undefined]) {
    const { code, out } = runMainCapturing(["--line", "--hook"], { home, scriptPath, pluginRoot, refresh });
    assert.equal(code, 0);
    assert.doesNotMatch(out, /janitor timer/);
  }
  assert.equal(calls.length, 0);
  // and through the real refresh with an injected installer: the installer is never reached
  const installs = [];
  const real = (a) => refreshIfRegistered({ ...a, install: (argv) => { installs.push(argv); return 0; }, platform: "linux" });
  runMainCapturing(["--line", "--hook"], { home, scriptPath, pluginRoot: codexRoot, refresh: real });
  assert.equal(installs.length, 0);
});

test("lane 74: a refresh that throws never changes the hook's exit code or output (fail open)", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const scriptPath = staleFixture(home, { running: "0.20.16", installedVersions: ["0.20.16"] });
  const pluginRoot = rootOf(scriptPath);
  let called = 0;
  const base = runMainCapturing(["--line", "--hook"], { home, scriptPath, pluginRoot, refresh: () => { called += 1; return { action: "none" }; } });
  const thrown = runMainCapturing(["--line", "--hook"], { home, scriptPath, pluginRoot, refresh: () => { called += 1; throw new Error("scheduler on fire"); } });
  assert.equal(called, 2, "the throwing refresh really ran");
  assert.equal(thrown.code, 0);
  assert.equal(thrown.out, base.out);
});

test("lane 74: a registered timer from an older release is re-registered through the hook, with an injected install (no scheduler is reached)", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const repo = path.join(home, "repo");
  const oldRoot = path.join(home, "plugin-old");
  const newRoot = path.join(home, "plugin-new");
  write(home, ".agents/janitor/installed.json", `${JSON.stringify({ scheduler: "systemd-user", name: "janitor-record", repo, hour: 7 })}\n`);
  write(home, ".config/systemd/user/janitor-record.service", `[Service]\nExecStart=node "${oldRoot}/scripts/janitor.mjs" --record --repo "${repo}" --apply --host fixture-host\n`);
  const installs = [];
  const unit = path.join(home, ".config", "systemd", "user", "janitor-record.service");
  // what the real installer does on success: the unit now bakes in the new release's root
  const install = (argv) => { installs.push(argv); fs.writeFileSync(unit, `[Service]\nExecStart=node "${newRoot}/scripts/janitor.mjs" --record\n`); return 0; };
  const refresh = (a) => refreshIfRegistered({ ...a, install, platform: "linux", pluginRoot: newRoot, forceRoot: true });
  const scriptPath = staleFixture(home, { running: "0.20.16", installedVersions: ["0.20.16"] });
  const hookOpts = { home, scriptPath, pluginRoot: rootOf(scriptPath), refresh };
  const { code, out } = runMainCapturing(["--line", "--hook"], hookOpts);
  assert.equal(code, 0);
  assert.equal(installs.length, 1, "the installer is called once, by the injected install");
  assert.deepEqual(installs[0].slice(0, 6), ["--repo", repo, "--hour", "7", "--enable", "--host"]);
  assert.match(out, /^janitor timer: refreshed: re-registered from /m);
  // a second session on the same release: recorded success, nothing more to do, no installer call
  runMainCapturing(["--line", "--hook"], hookOpts);
  assert.equal(installs.length, 1);
});

test("lane 74: --hook with a scratch home that has no timer registered stays silent and calls nothing real", () => {
  const home = mkHome();
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  wireEverythingElse(home);
  const { code, stdout } = runCli(["--line", "--hook"], home);
  assert.equal(code, 0);
  assert.doesNotMatch(stdout, /janitor timer/);
});
