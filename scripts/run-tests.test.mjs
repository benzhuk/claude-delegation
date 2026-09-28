// node --test scripts/run-tests.test.mjs
//
// Lane 24 (sealed-home-leak): the sweep, the keep-on-failure/removed-on-success contract, and the
// `--no-sweep` kill switch. `sweepStaleHomes`'s `tmpDir`/`homeDir`/`now` are ALWAYS injected here -
// never the real `os.tmpdir()`/`os.homedir()`/`Date.now` - so this file can never delete a real
// `/tmp` sealed home or read the real `~/.agents`, whatever else is going on on the machine running
// this suite. See scripts/test-home.test.mjs for the per-process registry/handler/keep() tests.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runSealed, sweepStaleHomes, main } from "./run-tests.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN_TESTS_MODULE = path.join(HERE, "run-tests.mjs");
const NODE = process.execPath;

const cleanups = [];
test.after(() => {
  for (const fn of cleanups) {
    try {
      fn();
    } catch {
      // best-effort only
    }
  }
});

function scratchDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A `.test.mjs` file `run-tests.mjs`'s own sealed suite can run - passing or failing on purpose. */
function writeProbe(passes) {
  const dir = scratchDir("run-tests-probe-");
  const file = path.join(dir, "probe.test.mjs");
  fs.writeFileSync(
    file,
    [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      `test('probe', () => { assert.ok(${passes}); });`,
      "",
    ].join("\n"),
  );
  return file;
}

/** `runSealed`/`main` are called IN-PROCESS by this same `node --test` run, which means
 * `NODE_TEST_CONTEXT` is already set on `process.env` here - left in place, the sealed grandchild
 * `node --test` spawn inside `runSealed` would silently SKIP the probe as a "recursive" run and
 * report success no matter what the probe actually asserts (see test-home.test.mjs's own note on
 * the same trap). Every test below that calls `runSealed`/`main` strips it first. */
function withoutNodeTestContext(fn) {
  const saved = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    return fn();
  } finally {
    if (saved !== undefined) process.env.NODE_TEST_CONTEXT = saved;
  }
}

/** Captures the lines `fn` writes with `console.log` (restoring it after, even on throw) - used to
 * read the sealed home path `runSealed` prints on its own first line. */
function captureLog(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    const result = fn();
    return { result, lines };
  } finally {
    console.log = orig;
  }
}

// ---------------------------------------------------------------------------
// keep-on-failure / removed-on-success (RT-18/F6, unchanged by this lane's fix)
// ---------------------------------------------------------------------------

test("runSealed removes the sealed home when the suite passes", () => {
  const probe = writeProbe(true);
  const { result: code, lines } = withoutNodeTestContext(() => captureLog(() => runSealed({ files: [probe] })));
  assert.equal(code, 0);
  const home = lines[0];
  assert.ok(home, "the sealed home path must have been printed on the first line");
  assert.equal(fs.existsSync(home), false, "a passing suite must remove its sealed home");
});

test("runSealed keeps the sealed home when the suite fails (and it survives this process's own bookkeeping)", () => {
  const probe = writeProbe(false);
  const { result: code, lines } = withoutNodeTestContext(() => captureLog(() => runSealed({ files: [probe] })));
  assert.notEqual(code, 0);
  const home = lines[0];
  assert.ok(fs.existsSync(home), "a failing suite must keep its sealed home");
  cleanups.push(() => fs.rmSync(home, { recursive: true, force: true }));
});

// ---------------------------------------------------------------------------
// sweepStaleHomes: removes old, keeps young, keeps non-matching, honours both kill switches, never
// throws on an unreadable temp dir. Always injected tmpDir/homeDir/now - never the real ones.
// ---------------------------------------------------------------------------

function makeAgeSet() {
  const tmpDir = scratchDir("run-tests-sweep-tmp-");
  const now = Date.now();
  const SEVEN_HOURS = 7 * 60 * 60 * 1000;
  const FIVE_HOURS = 5 * 60 * 60 * 1000;

  const stale = path.join(tmpDir, "sealed-home-stale");
  fs.mkdirSync(stale);
  fs.utimesSync(stale, new Date(now - SEVEN_HOURS), new Date(now - SEVEN_HOURS));

  const fresh = path.join(tmpDir, "sealed-home-fresh");
  fs.mkdirSync(fresh);
  fs.utimesSync(fresh, new Date(now - FIVE_HOURS), new Date(now - FIVE_HOURS));

  const nonMatching = path.join(tmpDir, "other-dir-not-sealed");
  fs.mkdirSync(nonMatching);
  fs.utimesSync(nonMatching, new Date(now - SEVEN_HOURS), new Date(now - SEVEN_HOURS));

  // Boundary case (spec: "never a name that does not match the exact prefix"): starts with
  // "sealed-home" but NOT the exact "sealed-home-" prefix (no dash right after "sealed-home").
  const almostMatching = path.join(tmpDir, "sealed-homeXstale");
  fs.mkdirSync(almostMatching);
  fs.utimesSync(almostMatching, new Date(now - SEVEN_HOURS), new Date(now - SEVEN_HOURS));

  return { tmpDir, now, stale, fresh, nonMatching, almostMatching };
}

function emptyHomeDir() {
  return scratchDir("run-tests-sweep-home-");
}

test("sweepStaleHomes removes only sealed-home-* dirs older than 6h, keeps young and non-matching ones", () => {
  const { tmpDir, now, stale, fresh, nonMatching, almostMatching } = makeAgeSet();
  const homeDir = emptyHomeDir();

  const result = sweepStaleHomes({ tmpDir, homeDir, now: () => now });

  assert.equal(result.skipped, false);
  assert.equal(result.swept, 1);
  assert.equal(fs.existsSync(stale), false, "older-than-6h sealed-home- dir must be removed");
  assert.equal(fs.existsSync(fresh), true, "younger-than-6h sealed-home- dir must be kept");
  assert.equal(fs.existsSync(nonMatching), true, "a non-matching name must never be swept");
  assert.equal(
    fs.existsSync(almostMatching),
    true,
    "a name that only starts with 'sealed-home' (no exact prefix) must never be swept",
  );
});

test("sweepStaleHomes prints exactly one 'swept n stale sealed homes' line", () => {
  const { tmpDir, now } = makeAgeSet();
  const homeDir = emptyHomeDir();
  const lines = [];
  const orig = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    sweepStaleHomes({ tmpDir, homeDir, now: () => now });
  } finally {
    console.log = orig;
  }
  assert.deepEqual(lines, ["swept 1 stale sealed homes"]);
});

test("sweepStaleHomes is skipped when <homeDir>/.agents/ws-off exists (shared kill switch)", () => {
  const { tmpDir, now, stale } = makeAgeSet();
  const homeDir = emptyHomeDir();
  fs.mkdirSync(path.join(homeDir, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(homeDir, ".agents", "ws-off"), "");

  const result = sweepStaleHomes({ tmpDir, homeDir, now: () => now });
  assert.deepEqual(result, { swept: 0, skipped: true });
  assert.equal(fs.existsSync(stale), true, "nothing must be removed while ws-off is present");
});

test("sweepStaleHomes is skipped when <homeDir>/.agents/ws-off-sweep exists (lane-specific kill switch)", () => {
  const { tmpDir, now, stale } = makeAgeSet();
  const homeDir = emptyHomeDir();
  fs.mkdirSync(path.join(homeDir, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(homeDir, ".agents", "ws-off-sweep"), "");

  const result = sweepStaleHomes({ tmpDir, homeDir, now: () => now });
  assert.deepEqual(result, { swept: 0, skipped: true });
  assert.equal(fs.existsSync(stale), true, "nothing must be removed while ws-off-sweep is present");
});

test("sweepStaleHomes never throws when the temp dir can't be read - prints an error and returns", () => {
  const homeDir = emptyHomeDir();
  const missingTmpDir = path.join(os.tmpdir(), `run-tests-sweep-missing-${process.pid}-${Date.now()}`);
  const errors = [];
  const orig = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  let result;
  try {
    result = sweepStaleHomes({ tmpDir: missingTmpDir, homeDir, now: () => Date.now() });
  } finally {
    console.error = orig;
  }
  assert.equal(result.skipped, false);
  assert.ok(result.error, "an error must be reported on the return value");
  assert.ok(errors.some((line) => line.includes("run-tests: sweep error")), "the error must be printed");
});

// ---------------------------------------------------------------------------
// main(): --no-sweep gates the sweep call; the rest of the CLI contract is unchanged.
// ---------------------------------------------------------------------------

test("main() calls sweep by default, before running the suite", () => {
  const probe = writeProbe(true);
  let sweepCalls = 0;
  const code = withoutNodeTestContext(() =>
    main([probe], {
      sweep: () => {
        sweepCalls += 1;
      },
    }),
  );
  assert.equal(sweepCalls, 1);
  assert.equal(code, 0);
});

test("main() does not call sweep when --no-sweep is passed", () => {
  const probe = writeProbe(true);
  let sweepCalls = 0;
  const code = withoutNodeTestContext(() =>
    main(["--no-sweep", probe], {
      sweep: () => {
        sweepCalls += 1;
      },
    }),
  );
  assert.equal(sweepCalls, 0);
  assert.equal(code, 0);
});

test("main() still rejects an unsupported flag", () => {
  const errors = [];
  const orig = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  let code;
  try {
    code = main(["--bogus-flag"], { sweep: () => {} });
  } finally {
    console.error = orig;
  }
  assert.equal(code, 2);
  assert.ok(errors.some((line) => line.includes("flags are not supported")));
});

test("the real CLI honours --no-sweep end to end (spawned process, real exit code)", () => {
  const probe = writeProbe(true);
  const out = withoutNodeTestContext(() =>
    execFileSync(NODE, [RUN_TESTS_MODULE, "--no-sweep", probe], { encoding: "utf8" }),
  );
  assert.ok(!/^swept /m.test(out), "no 'swept n stale sealed homes' line must appear under --no-sweep");
});

// F2 (review r1): the in-process "keeps the sealed home when the suite fails" test above never
// exercises the exit handler at all - it asserts the home still exists right after runSealed()
// returns, in the SAME process, before any exit/signal handler could ever run. This test spawns the
// real CLI as a child process and checks the home survives AFTER that child process has actually
// exited, which is the only way to prove keep() really runs before the exit handler's sweep, not
// just that keep() works in isolation (see test-home.test.mjs's own keep()-survives-signal test).
test("the real CLI keeps a failed suite's home after the process has exited (RT-18/F6)", () => {
  const probe = writeProbe(false);
  const tmp = scratchDir("run-tests-keep-tmp-");
  const env = { ...process.env, TMPDIR: tmp };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(NODE, [RUN_TESTS_MODULE, "--no-sweep", probe], { env, encoding: "utf8" });
  assert.notEqual(r.status, 0);
  const home = r.stdout.split("\n")[0].trim();
  assert.ok(home.startsWith(fs.realpathSync(tmp)), "the home must be under the injected TMPDIR");
  assert.ok(fs.existsSync(home), "the exit handler must not delete a failed suite's kept home");
});

// F1 (review r1): a probe that runs long enough for a signal to arrive to the whole process group
// WHILE the runner is blocked inside spawnSync - a Ctrl-C, a closed pane, or a dropped ssh session
// all send the signal to the group, not just the runner pid. Before the F1 fix this test fails:
// `node --test` (the sealed suite child) catches the signal itself and exits 1, which the runner's
// `finally` reads as a plain failed suite - it calls keep() and leaves ITS OWN sealed home behind,
// and the runner then exits 1 instead of dying from the signal (see review-r1.md, F1 BLOCKER).
const WIN32_GROUP_SIGNAL_SKIP_REASON =
  "on win32, child.kill(signal) terminates the child directly without running any Node signal " +
  "handler - the run-tests.mjs stale sweep at suite start is the guarantee there, not this handler";

function writeSlowProbe() {
  const dir = scratchDir("run-tests-slow-probe-");
  const file = path.join(dir, "slow.test.mjs");
  fs.writeFileSync(
    file,
    [
      "import test from 'node:test';",
      "test('slow', async () => { await new Promise((r) => setTimeout(r, 10000)); });",
      "",
    ].join("\n"),
  );
  return file;
}

test(
  "a SIGTERM sent to the whole process group re-raises on the runner and removes its own sealed home (F1, POSIX only)",
  { skip: process.platform === "win32" ? WIN32_GROUP_SIGNAL_SKIP_REASON : false },
  async () => {
    const slowProbe = writeSlowProbe();
    const tmp = scratchDir("run-tests-group-sigterm-tmp-");
    const env = { ...process.env, TMPDIR: tmp };
    delete env.NODE_TEST_CONTEXT;

    const child = spawn(NODE, [RUN_TESTS_MODULE, "--no-sweep", slowProbe], {
      env,
      detached: true,
      stdio: ["ignore", "pipe", "inherit"],
    });
    cleanups.push(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // already gone
      }
    });

    const home = await new Promise((resolve, reject) => {
      let buf = "";
      child.stdout.on("data", (chunk) => {
        buf += chunk.toString();
        const nl = buf.indexOf("\n");
        if (nl !== -1) resolve(buf.slice(0, nl).trim());
      });
      child.on("error", reject);
    });

    const exited = new Promise((resolve) => {
      child.on("exit", (code, signal) => resolve({ code, signal }));
    });

    process.kill(-child.pid, "SIGTERM"); // the whole group, as a closed pane / dropped ssh session does

    const { code, signal } = await exited;
    assert.ok(
      signal === "SIGTERM" || code === 143,
      `the runner must die from the re-raised signal (128+15), got code=${code} signal=${signal}`,
    );
    assert.equal(fs.existsSync(home), false, "the runner's own sealed home must not survive a group SIGTERM");
  },
);
