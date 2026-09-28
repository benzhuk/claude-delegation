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
    assert.deepEqual(lines, ["swept 2 stale sealed homes"], "the partial count must still be printed");
  },
);

// ---------------------------------------------------------------------------
// main(): --no-sweep gates the sweep call; the rest of the CLI contract is unchanged.
// ---------------------------------------------------------------------------

test("main() calls sweep by default, before running the suite", async () => {
  const probe = writeProbe(true);
  let sweepCalls = 0;
  const code = await withoutNodeTestContext(() =>
    main([probe], {
      sweep: () => {
        sweepCalls += 1;
      },
    }),
  );
  assert.equal(sweepCalls, 1);
  assert.equal(code, 0);
});

test("main() does not call sweep when --no-sweep is passed", async () => {
  const probe = writeProbe(true);
  let sweepCalls = 0;
  const code = await withoutNodeTestContext(() =>
    main(["--no-sweep", probe], {
      sweep: () => {
        sweepCalls += 1;
      },
    }),
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
  const out = await withoutNodeTestContext(() =>
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
    const killed = new Promise((resolve, reject) => {
      const killer = spawn("taskkill.exe", ["/PID", String(suitePid), "/F"], { windowsHide: true, stdio: "ignore" });
      killer.once("error", reject); killer.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`taskkill failed: ${code}`)));
    });
    await killed;
    const { code } = await waitForExit(runner, "runner after taskkill");
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
