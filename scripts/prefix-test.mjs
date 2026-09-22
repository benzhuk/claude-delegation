// C4 (spec.md): proves a regression test actually discriminates the bug it was written
// for, so a bug fix cannot be accepted on a test that would also have passed before the
// fix.
//
// node scripts/prefix-test.mjs --base <sha> --test <path> --repo <dir>
//
// - Adds a temporary worktree at <base> under the system temp dir.
// - Copies the CURRENT (fix-revision) copy of <path> from <repo> into that worktree,
//   overwriting whatever is or isn't there at <base>.
// - Runs `node --test` on it there.
// - Exits 0 only when that run FAILS WITH AT LEAST ONE node --test ASSERTION FAILURE
//   INSIDE THE NAMED FILE, and the same test then PASSES when run in <repo> as currently
//   checked out (the fix revision). "Inside the named file" means the failing *test* is
//   declared there; an assertion thrown from a helper module that test imports and calls
//   still counts (round-2 review ruling (b) - the failing test itself is still the named
//   file's). A load/import error, a cancelled/timed-out test, a skip/todo-only file, or
//   zero real tests is inconclusive at either revision: exit 2, never 0. A base run that
//   already passes (the fix made no difference the test can see) is a conclusive
//   non-reproduction: exit 1. A base run that reproduces but whose fix-revision run does
//   not pass is also exit 1 (conclusively: not a proven fix - pinned by its own fixture
//   case), unless the fix-revision run is itself inconclusive, which is exit 2.
// - Last step: `git worktree remove --force <tmp>` on the exact path this run created,
//   verified before removal; on failure it also runs `git worktree prune` and reports
//   both failures (never swallowed). No network, no writes outside the temp worktree,
//   never `stash`, `reset`, `clean`.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") out.base = argv[++i];
    else if (a === "--test") out.test = argv[++i];
    else if (a === "--repo") out.repo = argv[++i];
  }
  return out;
}

function run(cmd, args, opts) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

// node prints a top-level test's name AS GIVEN on the command line (e.g.
// "scripts/foo.test.mjs" when invoked with that relative path, not just its basename —
// round-2 review MAJOR 4, measured), so the zero-real-tests check below must compare
// against the full invoked path, falling back to the final path segment for callers (and
// existing unit tests) that only ever pass a bare basename.
function sameFile(tapName, wanted) {
  const norm = (s) => s.replace(/\\/g, "/").trim();
  const a = norm(tapName);
  const b = norm(wanted);
  return a === b || a.split("/").pop() === b.split("/").pop();
}

// Parses `node --test --test-reporter=tap` output. `testFile` is the path this run was
// invoked with — it lets us recognize the one shape plain summary counts can't: a file
// with zero real `test()` calls is reported by node itself as a single passing top-level
// "test" named after the FILE (not a real test name) — measured directly against node
// v24.18.0 (see the T3 report for the three probe transcripts this shape and the
// ERR_ASSERTION/ERR_TEST_FAILURE split below were taken from). `hasAssertionFailure` is
// anchored to the YAML diagnostic block's own indented `code:` line (round-2 review
// MAJOR 3): the unanchored form also matched the literal string appearing inside a TEST
// NAME, which a hostile or coincidental test name can spoof. `cancelled`/`skipped`/`todo`
// (round-2 review BLOCKER 1 and orchestrator ruling (a)) catch a timed-out test — node
// reports `# fail 0` / `# cancelled 1` for a cancellation, which the old fail-count-only
// check let through as "passed" — and a skip/todo-only file, which node also counts as
// passing tests.
export function parseTapCounts(output, testFile) {
  const testsMatch = /^# tests (\d+)/m.exec(output);
  const passMatch = /^# pass (\d+)/m.exec(output);
  const failMatch = /^# fail (\d+)/m.exec(output);
  const cancelledMatch = /^# cancelled (\d+)/m.exec(output);
  const skippedMatch = /^# skipped (\d+)/m.exec(output);
  const todoMatch = /^# todo (\d+)/m.exec(output);
  const hasAssertionFailure = /^[ \t]+code: 'ERR_ASSERTION'$/m.test(output);
  const topLevelLines = output
    .split(/\r?\n/)
    .filter((l) => /^(not )?ok \d+ - /.test(l));
  const zeroRealTests =
    testFile !== undefined &&
    topLevelLines.length === 1 &&
    sameFile(topLevelLines[0].replace(/^(not )?ok \d+ - /, ""), testFile);
  return {
    tests: testsMatch ? Number(testsMatch[1]) : 0,
    pass: passMatch ? Number(passMatch[1]) : 0,
    fail: failMatch ? Number(failMatch[1]) : 0,
    cancelled: cancelledMatch ? Number(cancelledMatch[1]) : 0,
    skipped: skippedMatch ? Number(skippedMatch[1]) : 0,
    todo: todoMatch ? Number(todoMatch[1]) : 0,
    hasAssertionFailure,
    zeroRealTests,
  };
}

// Runs one test file with `node --test` in `cwd`, classifying the result.
// -> { category: "reproduced" | "passed" | "inconclusive", detail, counts?, output }
//
// `node --test` marks its own worker children with NODE_TEST_CONTEXT / NODE_TEST_WORKER_ID
// so they report over an internal channel instead of printing TAP to stdout. Since this
// script (and its own test file) is itself routinely run under `node --test` - the T3 gate
// is exactly that - those vars are already set in OUR process.env and would otherwise leak
// into the nested `node --test` spawned here, silencing its TAP output entirely (measured:
// with the vars inherited, `output` is empty and every run classifies as "no TAP summary").
// `NODE_OPTIONS` is stripped for the same reason (round-2 review MINOR 5): an ambient
// `NODE_OPTIONS=--test-reporter=spec` (or similar) silences the nested run's TAP output
// exactly like the two NODE_TEST_* vars do. All three stripped unconditionally, not just
// when detected, so this holds regardless of how deep prefix-test.mjs itself is invoked
// from, or what the caller's own environment happens to set.
export function classifyRun(cwd, testFile) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_WORKER_ID;
  delete env.NODE_OPTIONS;
  const result = run(process.execPath, ["--test", "--test-reporter=tap", testFile], { cwd, env });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) {
    return { category: "inconclusive", detail: `spawn failed: ${result.error.message}`, output };
  }
  const counts = parseTapCounts(output, testFile);
  if (counts.tests === 0 || !/^# tests \d/m.test(output)) {
    return { category: "inconclusive", detail: "no TAP summary / zero tests run", counts, output };
  }
  if (counts.cancelled > 0 || (counts.tests > 0 && counts.skipped + counts.todo >= counts.tests)) {
    return { category: "inconclusive", detail: "a test was cancelled or timed out, or the file is skip/todo-only", counts, output };
  }
  if (counts.zeroRealTests) {
    return { category: "inconclusive", detail: "zero real test() calls ran", counts, output };
  }
  if (counts.fail > 0 && counts.hasAssertionFailure) {
    return { category: "reproduced", detail: "at least one assertion failure inside the file", counts, output };
  }
  if (counts.fail > 0) {
    return { category: "inconclusive", detail: "failure with no assertion failure (load/import error or crash)", counts, output };
  }
  return { category: "passed", detail: "all tests passed", counts, output };
}

function verifyIsOurWorktree(dir, tmpRoot) {
  try {
    const real = fs.realpathSync(dir);
    if (real !== tmpRoot && !real.startsWith(tmpRoot + path.sep)) return false;
    const gitFile = fs.readFileSync(path.join(dir, ".git"), "utf8");
    return /worktrees[\\/]/.test(gitFile);
  } catch {
    return false;
  }
}

export function main(argv) {
  const { base, test: testPath, repo } = parseArgs(argv);
  if (!base || !testPath || !repo) {
    console.error("usage: prefix-test.mjs --base <sha> --test <path> --repo <dir>");
    return 2;
  }
  const repoAbs = path.resolve(repo);
  const srcTestFile = path.join(repoAbs, testPath);
  let testContent;
  try {
    testContent = fs.readFileSync(srcTestFile, "utf8");
  } catch (e) {
    console.error(`prefix-test: cannot read test file ${srcTestFile}: ${e.message}`);
    return 2;
  }

  const tmpRoot = fs.realpathSync(os.tmpdir());
  const worktreeDir = path.join(tmpRoot, `prefix-test-${crypto.randomUUID()}`);

  function cleanupWorktree() {
    if (!fs.existsSync(worktreeDir)) return;
    if (!verifyIsOurWorktree(worktreeDir, tmpRoot)) {
      console.error(`prefix-test: refusing to remove ${worktreeDir}: does not look like the worktree this run created`);
      return;
    }
    const r = run("git", ["worktree", "remove", "--force", worktreeDir], { cwd: repoAbs });
    if (r.status !== 0) {
      console.error(`prefix-test: warning: failed to remove worktree ${worktreeDir}: ${(r.stderr ?? r.stdout ?? "").trim()}`);
      // Round-2 review ruling (e): don't leave a stale entry in the caller's repo behind
      // a failed removal. Reported, not swallowed — a prune failure is also printed, and
      // neither failure changes this run's exit code (that's decided by classification).
      const p = run("git", ["worktree", "prune"], { cwd: repoAbs });
      if (p.status !== 0) {
        console.error(`prefix-test: warning: git worktree prune also failed: ${(p.stderr ?? p.stdout ?? "").trim()}`);
      }
    }
  }

  try {
    const addResult = run("git", ["worktree", "add", "--detach", worktreeDir, base], { cwd: repoAbs });
    if (addResult.status !== 0) {
      console.error(`prefix-test: git worktree add failed: ${(addResult.stderr ?? addResult.stdout ?? "").trim()}`);
      return 2;
    }

    const destTestFile = path.join(worktreeDir, testPath);
    fs.mkdirSync(path.dirname(destTestFile), { recursive: true });
    fs.writeFileSync(destTestFile, testContent);

    const baseRun = classifyRun(worktreeDir, testPath);
    if (baseRun.category === "inconclusive") {
      console.log(`prefix-test: inconclusive at base ${base}: ${baseRun.detail}`);
      return 2;
    }
    if (baseRun.category === "passed") {
      console.log(`prefix-test: test passes at base ${base}; does not reproduce the bug`);
      return 1;
    }

    // baseRun.category === "reproduced": check the fix revision in place. repoAbs is
    // already checked out at the fix revision; no second worktree is needed.
    const fixRun = classifyRun(repoAbs, testPath);
    if (fixRun.category === "passed") {
      console.log(`prefix-test: reproduces at base ${base} and passes at the fix revision`);
      return 0;
    }
    if (fixRun.category === "inconclusive") {
      console.log(`prefix-test: reproduces at base ${base}, but the fix-revision run is inconclusive: ${fixRun.detail}`);
      return 2;
    }
    console.log(`prefix-test: reproduces at base ${base}, but does not pass at the fix revision`);
    return 1;
  } finally {
    cleanupWorktree();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
