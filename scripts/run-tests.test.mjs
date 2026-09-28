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
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  runSealed,
  sweepStaleHomes,
  main,
  LEAK_PREFIX_RE,
  snapshotLeakNames,
  describeLeak,
  TEST_RUN_ROOT_PREFIX,
} from "./run-tests.mjs";
// N2 (windows-r1-f8aa816.log, skills/multi/scripts/hooks.test.mjs:429): every spawned child's env
// must be built by `childEnv`, never a bare object spread of the runner's own environment - that
// spread is what the suite-wide "no test file inherits the runner environment" check scans for,
// and a spawn that skips it can leak this session's messaging socket/token into a fixture (see
// test-child-env.mjs's own note on the 2026-09-17 incident). `childEnv` also fixes the second
// windows-r1 defect: it needs a fixture HOME anyway, and passing TEMP/TMP alongside TMPDIR (below)
// is what makes `os.tmpdir()` honour the injected scratch dir on win32, which reads TEMP/TMP, never
// TMPDIR.
import { childEnv } from "../skills/multi/scripts/test-child-env.mjs";

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
async function withoutNodeTestContext(fn) {
  const saved = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    return await fn();
  } finally {
    if (saved !== undefined) process.env.NODE_TEST_CONTEXT = saved;
  }
}

// Lane 46 (test-temp-hygiene): `main()` now mkdtemps its own per-run root directly under
// `os.tmpdir()` - which, called IN-PROCESS (not spawned), is THIS test process's own real
// `os.tmpdir()` unless overridden. Every in-process `main()` call below goes through this first,
// so it always creates (and, at the end of the run, removes) that root under an injected scratch
// dir instead - never the real `/tmp`.
async function withInjectedTmp(fn) {
  const dir = scratchDir("run-tests-main-tmp-");
  const saved = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
  process.env.TMPDIR = dir;
  process.env.TEMP = dir;
  process.env.TMP = dir;
  try {
    return await fn();
  } finally {
    for (const key of ["TMPDIR", "TEMP", "TMP"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

/** Captures the lines `fn` writes with `console.log` (restoring it after, even on throw) - used to
 * read the sealed home path `runSealed` prints on its own first line. */
async function captureLog(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    const result = await fn();
    return { result, lines };
  } finally {
    console.log = orig;
  }
}

// ---------------------------------------------------------------------------
// keep-on-failure / removed-on-success (RT-18/F6, unchanged by this lane's fix)
// ---------------------------------------------------------------------------

test("runSealed removes the sealed home when the suite passes", async () => {
  const probe = writeProbe(true);
  const { result: code, lines } = await withoutNodeTestContext(() => captureLog(() => runSealed({ files: [probe] })));
  assert.equal(code, 0);
  const home = lines[0];
  assert.ok(home, "the sealed home path must have been printed on the first line");
  assert.equal(fs.existsSync(home), false, "a passing suite must remove its sealed home");
});

test("runSealed keeps the sealed home when the suite fails (and it survives this process's own bookkeeping)", async () => {
  const probe = writeProbe(false);
  const { result: code, lines } = await withoutNodeTestContext(() => captureLog(() => runSealed({ files: [probe] })));
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

test("sweepStaleHomes prints exactly one 'swept n stale sealed homes, m stale test-run roots' line", () => {
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
  assert.deepEqual(lines, ["swept 1 stale sealed homes, 0 stale test-run roots"]);
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

// N2 (review-r2.md, optional per r1's F3 finding): the F3 fix (each removal in its own try/catch,
// the count always printed) had no unit test of its own - only the patch was verified by hand in a
// scratch copy. One unremovable stale directory (a subdirectory inside it made unwritable, the same
// shape a foreign 0700 `sealed-home-*` on a shared /tmp produces) must not abort the rest of the
// sweep, and the partial count must still be printed. Skipped on win32 (no POSIX permission bits)
// and when running as root (root ignores the deny).
test(
  "F3: one unremovable stale entry does not abort the sweep, and the partial count is still printed",
  {
    skip:
      process.platform === "win32"
        ? "no POSIX permission bits on win32 - the sweep's own guarantee there is the 6h age check"
        : process.getuid?.() === 0
          ? "root ignores the chmod 500 deny this test relies on"
          : false,
  },
  () => {
    const { tmpDir, now, stale } = makeAgeSet();
    const SEVEN_HOURS = 7 * 60 * 60 * 1000;

    const locked = path.join(tmpDir, "sealed-home-locked");
    const lockedSub = path.join(locked, "sub");
    fs.mkdirSync(lockedSub, { recursive: true });
    fs.writeFileSync(path.join(lockedSub, "file.txt"), "x");
    fs.utimesSync(locked, new Date(now - SEVEN_HOURS), new Date(now - SEVEN_HOURS));
    // Chmod the SUBdirectory, not `locked` itself: removing `sub/file.txt` needs write permission
    // on `sub` (its immediate parent), not on `locked` - an empty chmod-500 dir with nothing inside
    // it is still rmdir-able by its own parent's permission alone.
    fs.chmodSync(lockedSub, 0o500);
    cleanups.push(() => {
      try {
        fs.chmodSync(lockedSub, 0o700);
      } catch {
        // already gone
      }
    });

    const removable = path.join(tmpDir, "sealed-home-removable");
    fs.mkdirSync(removable);
    fs.utimesSync(removable, new Date(now - SEVEN_HOURS), new Date(now - SEVEN_HOURS));

    const homeDir = emptyHomeDir();
    const errors = [];
    const lines = [];
    const origErr = console.error;
    const origLog = console.log;
    console.error = (...args) => errors.push(args.join(" "));
    console.log = (...args) => lines.push(args.join(" "));
    let result;
    try {
      result = sweepStaleHomes({ tmpDir, homeDir, now: () => now });
    } finally {
      console.error = origErr;
      console.log = origLog;
      // Restore immediately, not just in the suite-wide after-hook: makeAgeSet's own scratchDir
      // cleanup removes the whole tmpDir recursively, and it was registered before this one.
      fs.chmodSync(lockedSub, 0o700);
    }

    assert.equal(fs.existsSync(stale), false, "the ordinary stale dir must still be removed");
    assert.equal(fs.existsSync(removable), false, "the removable stale dir must still be removed");
    assert.equal(fs.existsSync(locked), true, "the locked stale dir must survive - it could not be removed");
    assert.equal(result.swept, 2, "stale + removable, not the locked one");
    assert.ok(
      errors.some((line) => line.includes("sweep could not remove") && line.includes("sealed-home-locked")),
      "an error line must name the locked dir",
    );
    assert.deepEqual(
      lines,
      ["swept 2 stale sealed homes, 0 stale test-run roots"],
      "the partial count must still be printed",
    );
  },
);

// ---------------------------------------------------------------------------
// main(): --no-sweep gates the sweep call; the rest of the CLI contract is unchanged.
// ---------------------------------------------------------------------------

test("main() calls sweep by default, before running the suite", async () => {
  const probe = writeProbe(true);
  let sweepCalls = 0;
  const code = await withInjectedTmp(() =>
    withoutNodeTestContext(() =>
      main([probe], {
        sweep: () => {
          sweepCalls += 1;
        },
      }),
    ),
  );
  assert.equal(sweepCalls, 1);
  assert.equal(code, 0);
});

test("main() does not call sweep when --no-sweep is passed", async () => {
  const probe = writeProbe(true);
  let sweepCalls = 0;
  const code = await withInjectedTmp(() =>
    withoutNodeTestContext(() =>
      main(["--no-sweep", probe], {
        sweep: () => {
          sweepCalls += 1;
        },
      }),
    ),
  );
  assert.equal(sweepCalls, 0);
  assert.equal(code, 0);
});

test("main() still rejects an unsupported flag", async () => {
  const errors = [];
  const orig = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  let code;
  try {
    code = await main(["--bogus-flag"], { sweep: () => {} });
  } finally {
    console.error = orig;
  }
  assert.equal(code, 2);
  assert.ok(errors.some((line) => line.includes("flags are not supported")));
});

test("the real CLI honours --no-sweep end to end (spawned process, real exit code)", async () => {
  const probe = writeProbe(true);
  // Lane 46 (test-temp-hygiene): its own TMPDIR/TEMP/TMP, like every other CLI-spawning test in
  // this file - inheriting the OUTER sealed suite's env (no override) would put this inner run's
  // per-run root INSIDE that outer root, shared concurrently with whichever sibling *.test.mjs
  // files `node --test` happens to run alongside it, and the P4 leak check would then see THEIR
  // mkdtemp traffic as this run's own "new" entries - a false red from concurrency, not a leak.
  const tmp = scratchDir("run-tests-nosweep-tmp-");
  const fixtureHome = scratchDir("run-tests-nosweep-home-");
  const env = childEnv(fixtureHome, { TMPDIR: tmp, TEMP: tmp, TMP: tmp });
  delete env.NODE_TEST_CONTEXT;
  const out = execFileSync(NODE, [RUN_TESTS_MODULE, "--no-sweep", probe], { env, encoding: "utf8" });
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
  const fixtureHome = scratchDir("run-tests-keep-home-");
  const env = childEnv(fixtureHome, { TMPDIR: tmp, TEMP: tmp, TMP: tmp });
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(NODE, [RUN_TESTS_MODULE, "--no-sweep", probe], { env, encoding: "utf8" });
  assert.notEqual(r.status, 0);
  const home = r.stdout.split("\n")[0].trim();
  assert.ok(home.startsWith(fs.realpathSync(tmp)), "the home must be under the injected TMPDIR");
  assert.ok(fs.existsSync(home), "the exit handler must not delete a failed suite's kept home");
});

// F1 (review r1): a probe that runs long enough for a signal to arrive to the whole process group
// WHILE a previous synchronous runner was blocked - a Ctrl-C, a closed pane, or a dropped ssh session
// all send the signal to the group, not just the runner pid. Before the F1 fix this test fails:
// `node --test` (the sealed suite child) catches the signal itself and exits 1, which the runner's
// `finally` reads as a plain failed suite - it calls keep() and leaves ITS OWN sealed home behind,
// and the runner then exits 1 instead of dying from the signal (see review-r1.md, F1 BLOCKER).
const WIN32_GROUP_SIGNAL_SKIP_REASON =
  "on win32, child.kill(signal) terminates the child directly without running any Node signal " +
  "handler - the run-tests.mjs stale sweep at suite start is the guarantee there, not this handler";

// N1 (review-r2.md): a slow probe alone isn't enough - if the signal is sent as soon as the
// runner's home path is printed, it arrives before the sealed `node --test` child even exists, that
// child then runs the probe to a harmless pass, and `cleanup()` (not the keep()-on-a-killed-suite
// path this test exists to guard) removes the home. The probe now drops a ready-marker file once
// it is actually running, and the test waits for that marker before signalling - and asserts the
// signal took effect quickly, not that the suite merely ran to completion.
function writeSlowProbe() {
  const dir = scratchDir("run-tests-slow-probe-");
  const file = path.join(dir, "slow.test.mjs");
  const ready = path.join(dir, "ready");
  fs.writeFileSync(
    file,
    [
      "import test from 'node:test';",
      "import fs from 'node:fs';",
      `test('slow', async () => { fs.writeFileSync(${JSON.stringify(ready)}, ''); await new Promise((r) => setTimeout(r, 10000)); });`,
      "",
    ].join("\n"),
  );
  return { file, ready };
}

function waitForMarker(marker, label, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (fs.existsSync(marker)) { clearInterval(timer); resolve(fs.readFileSync(marker, "utf8").trim()); }
      else if (Date.now() >= deadline) { clearInterval(timer); reject(new Error(`${label} was not observed within ${timeoutMs}ms`)); }
    }, 20);
  });
}

function waitForExit(child, label, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not exit within ${timeoutMs}ms`)), timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
}

function writeForwardProbe() {
  const dir = scratchDir("run-tests-forward-probe-");
  const file = path.join(dir, "forward.test.mjs");
  const ready = path.join(dir, "ready");
  fs.writeFileSync(file, [
    "import test from 'node:test';", "import fs from 'node:fs';",
    `test('forward', async () => { fs.writeFileSync(${JSON.stringify(ready)}, String(process.ppid)); await new Promise((r) => setTimeout(r, 10000)); });`, "",
  ].join("\n"));
  return { file, ready };
}

function waitForOwnedPidGone(pid, label, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      try { process.kill(pid, 0); }
      catch (error) {
        clearInterval(timer);
        if (error.code === "ESRCH") resolve(); else reject(error);
        return;
      }
      if (Date.now() >= deadline) { clearInterval(timer); reject(new Error(`${label} (${pid}) is still alive`)); }
    }, 20);
  });
}

async function startForwardRunner(probe) {
  const tmp = scratchDir("run-tests-forward-tmp-");
  const fixtureHome = scratchDir("run-tests-forward-home-");
  const env = childEnv(fixtureHome, { TMPDIR: tmp, TEMP: tmp, TMP: tmp });
  delete env.NODE_TEST_CONTEXT;
  const runner = spawn(NODE, [RUN_TESTS_MODULE, "--no-sweep", probe.file], { env, stdio: ["ignore", "pipe", "inherit"] });
  const home = await new Promise((resolve, reject) => {
    let text = ""; const timeout = setTimeout(() => reject(new Error("runner did not print its home within 4s")), 4000);
    runner.once("error", (error) => { clearTimeout(timeout); reject(error); });
    runner.stdout.on("data", (chunk) => { text += chunk; if (text.includes("\n")) { clearTimeout(timeout); resolve(text.split("\n")[0].trim()); } });
  });
  const suitePid = Number(await waitForMarker(probe.ready, "suite ready marker"));
  assert.ok(Number.isInteger(suitePid) && suitePid > 0, "ready marker must identify runner's immediate suite child");
  return { runner, suitePid, home };
}

async function startForeignListenerRunner(probe) {
  const tmp = scratchDir("run-tests-foreign-listener-tmp-");
  const fixtureHome = scratchDir("run-tests-foreign-listener-home-");
  const env = childEnv(fixtureHome, { TMPDIR: tmp, TEMP: tmp, TMP: tmp });
  delete env.NODE_TEST_CONTEXT;
  const script = [
    `import { runSealed } from ${JSON.stringify(pathToFileURL(RUN_TESTS_MODULE).href)};`,
    "let deliveries = 0;",
    "process.on('SIGTERM', () => { deliveries += 1; setTimeout(() => { process.stdout.write(`foreign-deliveries=${deliveries}\\n`); process.exit(73); }, 250); });",
    `runSealed({ files: [${JSON.stringify(probe.file)}] }).then((code) => { process.exitCode = code; });`,
  ].join("\n");
  const runner = spawn(NODE, ["--input-type=module", "-e", script], { env, stdio: ["ignore", "pipe", "inherit"] });
  let stdout = "";
  const home = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("foreign-listener runner did not print its home within 4s")), 4000);
    runner.once("error", (error) => { clearTimeout(timeout); reject(error); });
    runner.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes("\n")) { clearTimeout(timeout); resolve(stdout.split("\n")[0].trim()); }
    });
  });
  const suitePid = Number(await waitForMarker(probe.ready, "foreign-listener suite ready marker"));
  assert.ok(Number.isInteger(suitePid) && suitePid > 0, "ready marker must identify runner's immediate suite child");
  return { runner, suitePid, home, stdout: () => stdout };
}

test(
  "SIGTERM to a runSealed wrapper with a foreign listener delivers once and removes its home (R1, POSIX only)",
  { skip: process.platform === "win32" ? WIN32_GROUP_SIGNAL_SKIP_REASON : false },
  async () => {
    const probe = writeForwardProbe();
    const { runner, suitePid, home, stdout } = await startForeignListenerRunner(probe);
    cleanups.push(() => { try { process.kill(runner.pid, "SIGKILL"); } catch {} try { process.kill(suitePid, "SIGKILL"); } catch {} });
    const exited = waitForExit(runner, "foreign-listener runner");
    const sentAt = Date.now();
    process.kill(runner.pid, "SIGTERM");
    const { code } = await exited;
    assert.ok(Date.now() - sentAt < 5000, "the wrapper must not wait for the 10s fixture");
    assert.equal(code, 73, "the foreign listener owns the wrapper's bounded exit");
    assert.match(stdout(), /foreign-deliveries=1/, "the foreign listener must receive SIGTERM exactly once");
    assert.equal(fs.existsSync(home), false, "the wrapper's registered home must be removed on SIGTERM");
    await waitForOwnedPidGone(suitePid, "foreign-listener immediate suite controller");
  },
);

test(
  "SIGTERM to only the runner terminates its immediate suite controller and removes the runner home (R1, POSIX only)",
  { skip: process.platform === "win32" ? WIN32_GROUP_SIGNAL_SKIP_REASON : false },
  async () => {
    const probe = writeForwardProbe();
    const { runner, suitePid, home } = await startForwardRunner(probe);
    cleanups.push(() => { try { process.kill(runner.pid, "SIGKILL"); } catch {} try { process.kill(suitePid, "SIGKILL"); } catch {} });
    const exited = waitForExit(runner, "runner");
    const sentAt = Date.now();
    process.kill(runner.pid, "SIGTERM");
    const { code, signal } = await exited;
    assert.ok(Date.now() - sentAt < 5000, "the runner must not wait for the 10s fixture");
    assert.ok(signal === "SIGTERM" || code === 143, `runner must preserve SIGTERM outcome, got code=${code} signal=${signal}`);
    assert.equal(fs.existsSync(home), false, "runner home must be removed on its own SIGTERM");
    await waitForOwnedPidGone(suitePid, "immediate suite controller");
  },
);

test(
  "taskkill of only the suite child keeps the runner home after its nonzero exit (R1, win32 only)",
  { skip: process.platform === "win32" ? false : "Windows taskkill contract" },
  async () => {
    const probe = writeForwardProbe();
    const { runner, suitePid, home } = await startForwardRunner(probe);
    cleanups.push(() => { try { process.kill(runner.pid, "SIGKILL"); } catch {} });
    const exited = waitForExit(runner, "runner after taskkill");
    const killed = new Promise((resolve, reject) => {
      const killer = spawn("taskkill.exe", ["/PID", String(suitePid), "/F"], { windowsHide: true, stdio: "ignore" });
      killer.once("error", reject); killer.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`taskkill failed: ${code}`)));
    });
    await killed;
    const { code } = await exited;
    assert.notEqual(code, 0, "a killed suite is a failed suite");
    assert.equal(fs.existsSync(home), true, "kept-on-failure retains the runner home");
  },
);

test(
  "a SIGTERM sent to the whole process group re-raises on the runner and removes its own sealed home (F1, POSIX only)",
  { skip: process.platform === "win32" ? WIN32_GROUP_SIGNAL_SKIP_REASON : false },
  async () => {
    const { file: slowProbe, ready } = writeSlowProbe();
    const tmp = scratchDir("run-tests-group-sigterm-tmp-");
    const fixtureHome = scratchDir("run-tests-group-sigterm-home-");
    const env = childEnv(fixtureHome, { TMPDIR: tmp, TEMP: tmp, TMP: tmp });
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

    // Signal only once the sealed suite child is really running the probe: sent earlier, the
    // signal lands before `node --test` exists, the suite then passes and cleanup() removes the
    // home anyway, so the keep()-on-a-killed-suite path this test guards is never reached.
    const deadline = Date.now() + 8000;
    while (!fs.existsSync(ready)) {
      if (Date.now() > deadline) throw new Error("the slow probe never started");
      await new Promise((r) => setTimeout(r, 20));
    }
    const sentAt = Date.now();
    process.kill(-child.pid, "SIGTERM"); // the whole group, as a closed pane / dropped ssh session does

    const { code, signal } = await exited;
    assert.ok(Date.now() - sentAt < 5000, "the runner must die from the signal, not after the suite ran to completion");
    assert.ok(
      signal === "SIGTERM" || code === 143,
      `the runner must die from the re-raised signal (128+15), got code=${code} signal=${signal}`,
    );
    assert.equal(fs.existsSync(home), false, "the runner's own sealed home must not survive a group SIGTERM");
  },
);

// ---------------------------------------------------------------------------
// Lane 46 (test-temp-hygiene): P1 (the per-run root), P2 (removal on exit 0 / trim on nonzero /
// full removal on signal) and P3's extension of the sweep to `delegation-test-run-*` roots. Every
// case below spawns the REAL CLI with TMPDIR/TEMP/TMP pointed at an injected scratch dir (never
// the real /tmp) so `os.tmpdir()`, as `main()` itself sees it, resolves to that scratch dir.
// ---------------------------------------------------------------------------

/** A `.test.mjs` file that writes its own view of TMPDIR/TEMP/TMP to a marker file, and (when
 * `mkdtempStray` is set) also mkdtemps ONE stray directory of its own under `os.tmpdir()` - the
 * exact shape a P5 straggler leaves behind, planted here on purpose so the P2 "everything except
 * the retained home is trimmed" test has something extra to prove gets removed. */
function writeEnvProbe({ passes, mkdtempStray } = {}) {
  const dir = scratchDir("run-tests-envprobe-");
  const file = path.join(dir, "envprobe.test.mjs");
  const marker = path.join(dir, "env.json");
  fs.writeFileSync(
    file,
    [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import fs from 'node:fs';",
      "import os from 'node:os';",
      "import path from 'node:path';",
      "test('envprobe', () => {",
      `  fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({` +
        "TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP, tmpdir: os.tmpdir()" +
        "}));",
      mkdtempStray ? "  fs.mkdtempSync(path.join(os.tmpdir(), 'run-tests-envprobe-stray-'));" : "",
      `  assert.ok(${passes});`,
      "});",
      "",
    ].join("\n"),
  );
  return { file, marker };
}

/** Spawns the real CLI against `probeFile`, TMPDIR/TEMP/TMP pointed at a fresh scratch dir (never
 * the real /tmp), and resolves once it exits with `{ code, stdout, tmp }` - `tmp` is the injected
 * scratch dir the run's own root must live directly under. */
function spawnRunner(probeFile, { noSweep = true } = {}) {
  const tmp = scratchDir("run-tests-root-tmp-");
  const fixtureHome = scratchDir("run-tests-root-home-");
  const env = childEnv(fixtureHome, { TMPDIR: tmp, TEMP: tmp, TMP: tmp });
  delete env.NODE_TEST_CONTEXT;
  const args = noSweep ? [RUN_TESTS_MODULE, "--no-sweep", probeFile] : [RUN_TESTS_MODULE, probeFile];
  const r = spawnSync(NODE, args, { env, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, tmp };
}

test("P1: the root is created directly under the injected temp dir, exported as TMPDIR/TEMP/TMP to the child, and removed on exit 0", () => {
  const { file, marker } = writeEnvProbe({ passes: true });
  const { code, stdout, tmp } = spawnRunner(file);
  assert.equal(code, 0);
  const home = stdout.split("\n")[0].trim();
  const root = path.dirname(home);
  assert.ok(
    path.basename(root).startsWith(TEST_RUN_ROOT_PREFIX),
    `the sealed home's parent must be the per-run root, got ${root}`,
  );
  assert.ok(root.startsWith(fs.realpathSync(tmp)), "the root must be directly under the injected TMPDIR");

  // The run has already exited and removed `root` by the time we get here (that's the very thing
  // this test proves below) - so these can't be re-realpath'd against a path that no longer
  // exists; `root` is already canonical (it's `path.dirname` of `home`, which `makeTempHome`
  // realpath'd), so a plain `path.resolve` on the child's raw values is the right comparison.
  const seen = JSON.parse(fs.readFileSync(marker, "utf8"));
  assert.equal(path.resolve(seen.TMPDIR), root, "the child's TMPDIR must be the root");
  assert.equal(path.resolve(seen.TEMP), root, "the child's TEMP must be the root");
  assert.equal(path.resolve(seen.TMP), root, "the child's TMP must be the root");
  assert.equal(path.resolve(seen.tmpdir), root, "os.tmpdir() inside the child must be the root");

  assert.equal(fs.existsSync(root), false, "a passing run must remove the whole root");
});

test("P2: on a failing run, only the retained sealed home remains under the root - a stray dir the test itself made is trimmed away", () => {
  const { file } = writeEnvProbe({ passes: false, mkdtempStray: true });
  const { code, stdout } = spawnRunner(file);
  assert.notEqual(code, 0);
  const home = stdout.split("\n")[0].trim();
  const root = path.dirname(home);
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.equal(fs.existsSync(home), true, "the retained sealed home must survive a failing run");
  const remaining = fs.readdirSync(root);
  assert.deepEqual(remaining, [path.basename(home)], "the root must hold nothing but the retained home");
});

test("P2: a child run killed with SIGTERM leaves no root at all (POSIX only)", { skip: WIN32_GROUP_SIGNAL_SKIP_REASON && process.platform === "win32" ? WIN32_GROUP_SIGNAL_SKIP_REASON : false }, async () => {
  const { file: slowProbe, ready } = writeSlowProbe();
  const tmp = scratchDir("run-tests-root-sigterm-tmp-");
  const fixtureHome = scratchDir("run-tests-root-sigterm-home-");
  const env = childEnv(fixtureHome, { TMPDIR: tmp, TEMP: tmp, TMP: tmp });
  delete env.NODE_TEST_CONTEXT;

  const child = spawn(NODE, [RUN_TESTS_MODULE, "--no-sweep", slowProbe], { env, stdio: ["ignore", "pipe", "inherit"] });
  cleanups.push(() => {
    try {
      process.kill(child.pid, "SIGKILL");
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
  const root = path.dirname(home);

  const exited = new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));

  const deadline = Date.now() + 8000;
  while (!fs.existsSync(ready)) {
    if (Date.now() > deadline) throw new Error("the slow probe never started");
    await new Promise((r) => setTimeout(r, 20));
  }
  process.kill(child.pid, "SIGTERM");
  await exited;

  assert.equal(fs.existsSync(home), false, "the sealed home must not survive a SIGTERM");
  assert.equal(fs.existsSync(root), false, "the whole per-run root must not survive a SIGTERM");
});

test("P3: sweepStaleHomes removes a stale test-run root with a dead pid, keeps a young one and one with a live pid", async () => {
  const tmpDir = scratchDir("run-tests-root-sweep-tmp-");
  const homeDir = emptyHomeDir();
  const now = Date.now();
  const TWENTY_FIVE_HOURS = 25 * 60 * 60 * 1000;
  const TWENTY_HOURS = 20 * 60 * 60 * 1000;

  // A genuinely dead pid: spawn a trivial child, wait for it to fully exit, then reuse its pid -
  // never a made-up number, which could collide with something real on a shared host.
  const dead = spawnSync(NODE, ["-e", "process.exit(0)"]);
  const deadPid = dead.pid;

  const stalePath = path.join(tmpDir, `${TEST_RUN_ROOT_PREFIX}${deadPid}-abcdef`);
  fs.mkdirSync(stalePath);
  fs.utimesSync(stalePath, new Date(now - TWENTY_FIVE_HOURS), new Date(now - TWENTY_FIVE_HOURS));

  const youngPath = path.join(tmpDir, `${TEST_RUN_ROOT_PREFIX}${deadPid}-ghijkl`);
  fs.mkdirSync(youngPath);
  fs.utimesSync(youngPath, new Date(now - TWENTY_HOURS), new Date(now - TWENTY_HOURS));

  const livePath = path.join(tmpDir, `${TEST_RUN_ROOT_PREFIX}${process.pid}-mnopqr`);
  fs.mkdirSync(livePath);
  fs.utimesSync(livePath, new Date(now - TWENTY_FIVE_HOURS), new Date(now - TWENTY_FIVE_HOURS));

  const result = sweepStaleHomes({ tmpDir, homeDir, now: () => now });

  assert.equal(result.sweptRoots, 1);
  assert.equal(fs.existsSync(stalePath), false, "an old root with a dead pid must be swept");
  assert.equal(fs.existsSync(youngPath), true, "a young root must survive even with a dead pid");
  assert.equal(fs.existsSync(livePath), true, "an old root must survive while its pid is alive");
});

// ---------------------------------------------------------------------------
// P4: the leak check. `snapshotLeakNames`/`describeLeak` are exercised directly against an
// injected scratch dir, never the real /tmp.
// ---------------------------------------------------------------------------

test("LEAK_PREFIX_RE matches every pinned prefix and rejects an unrelated name", () => {
  assert.ok(LEAK_PREFIX_RE.test("goal-abc123"));
  assert.ok(LEAK_PREFIX_RE.test("dispatch-abc123"));
  assert.ok(LEAK_PREFIX_RE.test("decisions-abc123"));
  assert.ok(!LEAK_PREFIX_RE.test("sealed-home-abc123"), "sealed-home is deliberately excluded");
  assert.ok(!LEAK_PREFIX_RE.test("unrelated-dir"));
});

test("the leak check is silent when clean and goes red on a planted leak, against an injected temp dir", () => {
  const tmpDir = scratchDir("run-tests-leak-tmp-");
  const before = snapshotLeakNames(tmpDir);
  assert.equal(describeLeak(before, snapshotLeakNames(tmpDir)).leaked, false);
  assert.equal(describeLeak(before, snapshotLeakNames(tmpDir)).line, "leak check: 0 new temp entries");

  const leakDir = path.join(tmpDir, "goal-card-fixture-abc123");
  fs.mkdirSync(leakDir);
  const after = snapshotLeakNames(tmpDir);
  const result = describeLeak(before, after);
  assert.equal(result.leaked, true);
  assert.equal(result.line, "leak check: 1 new temp entries: goal-card-fixture-abc123");

  fs.rmSync(leakDir, { recursive: true, force: true });
  assert.equal(describeLeak(before, snapshotLeakNames(tmpDir)).leaked, false, "removing the leak clears the check");
});

test("describeLeak reports at most 5 names even when more than 5 leaked", () => {
  const before = new Set();
  const after = new Set(["goal-1", "goal-2", "goal-3", "goal-4", "goal-5", "goal-6"]);
  const result = describeLeak(before, after);
  assert.equal(result.leaked, true);
  assert.equal(result.line, "leak check: 6 new temp entries: goal-1, goal-2, goal-3, goal-4, goal-5");
});

test("the real CLI's leak check line is printed and forces exit 1 even when the suite itself passes, on a planted real leak", () => {
  // Plants a leak DIRECTLY under the injected TMPDIR the runner treats as its "real" os.tmpdir()
  // (never the genuine system /tmp) by writing a probe that mkdtemps a LEAK_PREFIX_RE name itself,
  // bypassing TMPDIR the way a P5 straggler would (this probe deliberately imitates that defect
  // rather than reading os.tmpdir(), to prove the check fires on exactly that shape).
  const dir = scratchDir("run-tests-leak-cli-probe-");
  const file = path.join(dir, "leaky.test.mjs");
  fs.writeFileSync(
    file,
    [
      "import test from 'node:test';",
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "test('leaky', () => {",
      "  fs.mkdirSync(path.join(process.env.REAL_TMP_FOR_LEAK_TEST, 'goal-leak-probe-abc123'));",
      "});",
      "",
    ].join("\n"),
  );
  const tmp = scratchDir("run-tests-leak-cli-tmp-");
  const fixtureHome = scratchDir("run-tests-leak-cli-home-");
  const env = childEnv(fixtureHome, {
    TMPDIR: tmp,
    TEMP: tmp,
    TMP: tmp,
    REAL_TMP_FOR_LEAK_TEST: fs.realpathSync(tmp),
  });
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(NODE, [RUN_TESTS_MODULE, "--no-sweep", file], { env, encoding: "utf8" });
  cleanups.push(() => fs.rmSync(path.join(tmp, "goal-leak-probe-abc123"), { recursive: true, force: true }));

  assert.notEqual(r.status, 0, "a real leak must force a nonzero exit even though the probe itself passed");
  assert.match(r.stdout, /^leak check: 1 new temp entries: goal-leak-probe-abc123$/m);
});
