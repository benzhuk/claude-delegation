// node --test scripts/wiring-check.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { checkWiring, mergeChecks, expandHome, main } from "./wiring-check.mjs";
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
    ["valid-empty-root", "{}"],
    ["valid-unrelated", JSON.stringify({ unrelated: true })],
    ["valid-no-event", JSON.stringify({ hooks: { SessionStart: [] } })],
    ["valid-empty-event", JSON.stringify({ hooks: { Stop: [] } })],
    ["valid-noncommand", JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "prompt", prompt: "review" }] }] } })],
  ]);
  const checks = [];
  for (const [id, payload] of payloads) {
    const file = write(home, `${id}.json`, payload);
    checks.push({ id, type: "hook_absent", file, event: "Stop", substring: "test-hook", why: "w", fix: "f" });
  }
  const result = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  const byId = Object.fromEntries(result.results.map((row) => [row.id, row]));
  for (const id of ["root-null", "root-number", "event-not-array", "handlers-not-array"]) {
    assert.equal(byId[id].state, "unknown", id);
  }
  for (const id of ["valid-empty-root", "valid-unrelated", "valid-no-event", "valid-empty-event", "valid-noncommand"]) {
    assert.equal(byId[id].state, "ok", id);
  }
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

test("switch: always 'info', why reports ON when the file exists and off when it does not", () => {
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
  assert.match(results[0].why, /unsupported check type/);
});

test("a check whose evaluation throws is unknown, private, and not a crash", () => {
  const home = mkHome();
  const throwingFs = {
    existsSync: () => false,
    readFileSync: () => "",
    statSync: () => {
      throw new Error("disk exploded");
    },
  };
  const checks = [{ id: "boom", type: "file_exists", file: "~/x", why: "w", fix: "f" }];
  const { results } = checkWiring({ home, platform: "linux", fsImpl: throwingFs, lists: { public: checks, private: [] } });
  assert.equal(results[0].state, "unknown");
  assert.doesNotMatch(results[0].why, /disk exploded/);
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

// ---------------------------------------------------------------------------
// platforms filter
// ---------------------------------------------------------------------------

test("a check with a platforms array is skipped entirely on a non-matching platform", () => {
  const home = mkHome();
  const checks = [
    { id: "mac-only", type: "switch", file: "~/x", platforms: ["darwin"], why: "w", fix: "f" },
    { id: "everywhere", type: "switch", file: "~/y", why: "w", fix: "f" },
  ];
  const onLinux = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  assert.equal(onLinux.results.some((r) => r.id === "mac-only"), false);
  assert.equal(onLinux.results.some((r) => r.id === "everywhere"), true);

  const onMac = checkWiring({ home, platform: "darwin", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  assert.equal(onMac.results.some((r) => r.id === "mac-only"), true);
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

test("a missing or unparseable ~/.agents/required-wiring.json is simply not consulted, never a crash", () => {
  const home = mkHome(); // no required-wiring.json at all
  const result = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: [{ id: "x", type: "switch", file: "~/y", why: "w", fix: "f" }] } });
  assert.equal(result.results.length, 1);
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
  write(home, ".agents/lean-rules.md", "# lean rules\n"); // only other required item that would print
  const withSlug = runCli(["--line"], home, { NOTE_SLUG: "taxonomy" });
  assert.equal(withSlug.code, 0);
  assert.equal(withSlug.stdout, "", "an env_presence row can never trigger --line's noisy path, even with NOTE_SLUG set");

  const withoutSlug = runCli(["--line"], home, { NOTE_SLUG: "" });
  assert.equal(withoutSlug.code, 0);
  assert.equal(withoutSlug.stdout, "", "nor with NOTE_SLUG absent");
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
    const out = execFileSync(NODE, [SCRIPT, ...args], {
      encoding: "utf8",
      env: childEnv(home, { AGENTS_HOME: path.join(home, ".agents"), ...over }),
    });
    return { code: 0, stdout: out, stderr: "" };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

test("CLI: no flag prints a table and exits 0 against a scratch home with nothing configured", () => {
  const home = mkHome();
  const { code, stdout } = runCli([], home);
  assert.equal(code, 0);
  assert.match(stdout, /wiring check:/);
});

test("CLI --json prints a parseable { ok, results } object and exits 0", () => {
  const home = mkHome();
  const { code, stdout } = runCli(["--json"], home);
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(typeof parsed.ok, "boolean");
  assert.ok(Array.isArray(parsed.results));
});

test("CLI --line prints nothing when nothing is missing or stale (a scratch home with lean-rules.md present has only info/ok results)", () => {
  const home = mkHome();
  // lean-rules-file (file_fresh, no whenMissing override) is 'stale' when absent, same as any other
  // required file - a truly "nothing to flag" home has to actually carry it.
  write(home, ".agents/lean-rules.md", "# lean rules\n");
  const { code, stdout } = runCli(["--line"], home);
  assert.equal(code, 0);
  assert.equal(stdout, "");
});

test("CLI --line names lean-rules-file when ~/.agents/lean-rules.md is absent", () => {
  const home = mkHome();
  const { code, stdout } = runCli(["--line"], home);
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^wiring: \d+ flagged \(.*\)\. Run wiring-check for the fixes\.$/);
  assert.match(stdout, /lean rules file/);
});

test("CLI --line prints one line naming what is missing when something is", () => {
  const home = mkHome();
  // A private list this scratch home supplies, entirely independent of the shipped default list,
  // guaranteeing at least one 'missing' result regardless of platform.
  write(home, ".agents/required-wiring.json", JSON.stringify([
    { id: "definitely-missing", type: "file_exists", file: "~/does/not/exist", why: "w", fix: "f" },
  ]));
  const { code, stdout } = runCli(["--line"], home);
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^wiring: \d+ flagged \(.*\)\. Run wiring-check for the fixes\.$/);
  assert.match(stdout, /definitely missing/);
});

test("CLI --line prints nothing when ~/.agents/ws-off is present, even with a missing check", () => {
  const home = mkHome();
  write(home, ".agents/required-wiring.json", JSON.stringify([
    { id: "definitely-missing", type: "file_exists", file: "~/does/not/exist", why: "w", fix: "f" },
  ]));
  write(home, ".agents/ws-off", "");
  const { code, stdout } = runCli(["--line"], home);
  assert.equal(code, 0);
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
    assert.equal(code, 0);
  } finally {
    console.log = origLog;
  }
  assert.equal(out, "", "an unreadable ws-off must be treated as present, silencing the line even though something is missing");
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
      { id: "definitely-missing", type: "file_exists", file: "~/nope", why: "w", fix: "f" }], private: [] } }), 0);
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
    assert.equal(main(["--json"], opts), 0);
    const parsed = JSON.parse(lines.shift());
    assert.equal(parsed.ok, false);
    assert.equal(parsed.results[0].state, "unknown");
    assert.doesNotMatch(JSON.stringify(parsed), /SECRET_SENTINEL/);

    assert.equal(main(["--line"], opts), 0);
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
  assert.match(byId["no-type-at-all"].why, /unsupported check type/);
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
// Wired into hooks.json: SessionStart shows the wiring check on its own
// ---------------------------------------------------------------------------

test("hooks.json runs wiring-check.mjs --line on SessionStart, pointed at a real file, with a timeout", () => {
  const repoRoot = path.join(HERE, "..");
  const hooksPath = path.join(repoRoot, "hooks", "hooks.json");
  const cfg = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
  const sessionStartHooks = cfg.hooks.SessionStart.flatMap((g) => g.hooks);
  const entry = sessionStartHooks.find((h) => h.command.includes("wiring-check.mjs") && h.command.includes("--line"));
  assert.ok(entry, "SessionStart must run wiring-check.mjs --line");
  assert.match(entry.command, /\$\{CLAUDE_PLUGIN_ROOT\}/, "must be plugin-root relative like its neighbours");
  assert.equal(typeof entry.timeout, "number");
  assert.ok(entry.timeout > 0);
  const referenced = entry.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+wiring-check\.mjs)/)[1];
  assert.ok(fs.existsSync(path.join(repoRoot, referenced)), `${referenced} must exist`);
});

