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
  assert.ok(["ok", "missing", "stale", "info"].includes(r.state));
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

test("an unknown check type is 'info: unknown check type', never a crash", () => {
  const home = mkHome();
  const checks = [{ id: "mystery", type: "teleport", why: "w", fix: "f" }];
  const { results } = checkWiring({ home, platform: "linux", fsImpl: readOnlyFs(home), lists: { public: checks, private: [] } });
  assert.equal(results[0].state, "info");
  assert.match(results[0].why, /unknown check type/);
});

test("a check whose evaluation throws is reported as 'info', not a crash", () => {
  const home = mkHome();
  const throwingFs = {
    existsSync: () => {
      throw new Error("disk exploded");
    },
    readFileSync: () => "",
    statSync: () => ({ mtimeMs: 0 }),
  };
  const checks = [{ id: "boom", type: "file_exists", file: "~/x", why: "w", fix: "f" }];
  const { results } = checkWiring({ home, platform: "linux", fsImpl: throwingFs, lists: { public: checks, private: [] } });
  assert.equal(results[0].state, "info");
  assert.match(results[0].why, /disk exploded/);
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

// ---------------------------------------------------------------------------
// J4: CLI
// ---------------------------------------------------------------------------

/** Every child here goes through childEnv(): this session's own inbox socket/token must never
 * reach a spawned wiring-check process, whatever else it needs to see (test-child-env.mjs). */
function runCli(args, home) {
  try {
    const out = execFileSync(NODE, [SCRIPT, ...args], { encoding: "utf8", env: childEnv(home) });
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

test("CLI --line prints nothing when nothing is missing or stale (a bare scratch home has only info/ok results)", () => {
  const home = mkHome();
  const { code, stdout } = runCli(["--line"], home);
  assert.equal(code, 0);
  assert.equal(stdout, "");
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
  assert.match(stdout.trim(), /^wiring: \d+ missing \(.*\)\. Run wiring-check for the fixes\.$/);
  assert.match(stdout, /definitely missing/);
});

test("CLI: an unknown flag is a usage error, exit 1, and never a stack trace", () => {
  const home = mkHome();
  const { code, stderr } = runCli(["--bogus"], home);
  assert.equal(code, 1);
  assert.match(stderr, /unknown argument/);
});

test("main() as a function (not a subprocess) returns 0 for known flags and 1 for an unknown one", () => {
  assert.equal(main(["--json"]), 0);
  assert.equal(main(["--line"]), 0);
  assert.equal(main([]), 0);
  assert.equal(main(["--nope"]), 1);
});
