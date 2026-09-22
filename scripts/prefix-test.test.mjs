// node --test scripts/prefix-test.test.mjs
//
// Fixture identity (spec.md C5 shape, T3.md scoped-identity instructions, addendum A3;
// narrowed to fixtureRoot by L-C7, round 2 review minor 1): a temp .gitconfig holding ONLY an
// `[includeIf "gitdir/i:<realpath of fixtureRoot>/**"]` (fixtureRoot = `<home>/fixtures`, NOT
// the whole system temp dir) pointing at a `.gitconfig-fixture` carrying `[user] name =
// Fixture` / `email = fixture@example.invalid`; GIT_CONFIG_GLOBAL and GIT_CONFIG_NOSYSTEM=1 are set
// only in the child-process env used to build THIS test's fixture repo, never via
// `-c user.*`, never GIT_AUTHOR_*, never touching a real repo.
//
// This identity, and the sealed child env it rides in, are built by the ONE shared
// `makeTempHome({ gitIdentity: true })` from `./test-home.mjs` (T7) — never a private
// copy in this file, and never a spread of the runner's environment: doing either trips
// `skills/multi/scripts/hooks.test.mjs`'s N2 guard, and a private copy is exactly the
// duplication the seam review (F1, wr-dedupe-fixture-git-env) collapsed. `makeTempHome`
// seeds the identical includeIf/realpath/forward-slash/NOSYSTEM shape this file used to
// build by hand.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTapCounts, classifyRun } from "./prefix-test.mjs";
import { makeTempHome } from "./test-home.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "prefix-test.mjs");
// L-C7: the seal's fixture identity is now scoped to `fixtureRoot`, not the whole system temp
// dir - every mkdtemp in this file (git-identity-needing or not, for uniformity now that the
// old TMP_ROOT constant is retired) is rooted here instead. This is a module-level home shared
// by the tests below that don't build their own fixture repo (the classifyRun cases, which never
// touch git and just need a scratch directory); `buildFixtureRepo()` below still gets its own
// fresh `makeTempHome()` call per invocation, for its own isolated git identity/env.
const { fixtureRoot: FIXTURE_ROOT } = makeTempHome({ gitIdentity: true });

function git(args, cwd, env) {
  const r = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} in ${cwd} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

// Builds a 3-commit fixture repo: a root commit with no math.mjs (used as the "import
// error at base" case), a bug commit that adds math.mjs with a subtracting bug (used as
// the "reproduces" case), and a fix commit (HEAD) that corrects math.mjs and adds the
// regression test math.test.mjs (used, as its own sha, for the "passes at base" case,
// and always as the in-place fix revision).
function buildFixtureRepo() {
  const { home: configDir, env, fixtureRoot } = makeTempHome({ gitIdentity: true });
  const repoDir = fs.mkdtempSync(path.join(fixtureRoot, "prefix-test-repo-"));

  git(["init", "-q"], repoDir, env);
  fs.writeFileSync(path.join(repoDir, "README.md"), "fixture repo\n");
  git(["add", "."], repoDir, env);
  git(["commit", "-q", "-m", "root: fixture repo init"], repoDir, env);
  const rootSha = git(["rev-parse", "HEAD"], repoDir, env).trim();

  fs.writeFileSync(
    path.join(repoDir, "math.mjs"),
    "export function add(a, b) {\n  return a - b; // bug: subtracts instead of adding\n}\n"
  );
  git(["add", "."], repoDir, env);
  git(["commit", "-q", "-m", "feat: add math.mjs (bug: subtracts)"], repoDir, env);
  const bugSha = git(["rev-parse", "HEAD"], repoDir, env).trim();

  fs.writeFileSync(
    path.join(repoDir, "math.mjs"),
    "export function add(a, b) {\n  return a + b;\n}\n"
  );
  fs.writeFileSync(
    path.join(repoDir, "math.test.mjs"),
    [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { add } from './math.mjs';",
      "",
      "test('add sums two numbers', () => {",
      "  assert.strictEqual(add(2, 3), 5);",
      "});",
      "",
    ].join("\n")
  );
  git(["add", "."], repoDir, env);
  git(["commit", "-q", "-m", "fix: correct add(), add regression test"], repoDir, env);
  const fixSha = git(["rev-parse", "HEAD"], repoDir, env).trim();

  return { repoDir, configDir, rootSha, bugSha, fixSha, env };
}

function runPrefixTest(base, testPath, repoDir) {
  return spawnSync(
    process.execPath,
    [SCRIPT, "--base", base, "--test", testPath, "--repo", repoDir],
    { encoding: "utf8" }
  );
}

test("case: reproduces at the bug commit and passes at the fix revision -> exit 0", () => {
  const { repoDir, bugSha, env } = buildFixtureRepo();
  const r = runPrefixTest(bugSha, "math.test.mjs", repoDir);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  const worktrees = git(["worktree", "list", "--porcelain"], repoDir, env);
  assert.equal(worktrees.split("worktree ").length, 2, "prefix-test must remove the worktree it created");
});

test("case: test already passes at the given base (the fix sha itself) -> exit 1", () => {
  const { repoDir, fixSha } = buildFixtureRepo();
  const r = runPrefixTest(fixSha, "math.test.mjs", repoDir);
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /does not reproduce/);
});

test("case: import error at a base before the module existed -> exit 2", () => {
  const { repoDir, rootSha } = buildFixtureRepo();
  const r = runPrefixTest(rootSha, "math.test.mjs", repoDir);
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /inconclusive/);
});

test("case: reproduces at base but the fix revision does not pass -> exit 1, never 0", () => {
  const { repoDir, bugSha, env } = buildFixtureRepo();
  fs.writeFileSync(path.join(repoDir, "math.mjs"), "export function add(a, b) {\n  return a * b;\n}\n");
  git(["add", "."], repoDir, env);
  git(["commit", "-q", "-m", "regress: add() multiplies"], repoDir, env);
  const r = runPrefixTest(bugSha, "math.test.mjs", repoDir);
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /does not pass at the fix revision/);
});

test("never exits 0 on the base run alone: a bad --base sha is inconclusive, not a pass", () => {
  const { repoDir } = buildFixtureRepo();
  const r = runPrefixTest("not-a-real-sha", "math.test.mjs", repoDir);
  assert.notEqual(r.status, 0);
});

test("parseTapCounts: recognizes a real assertion failure (node v24.18.0 TAP shape)", () => {
  const tap = [
    "TAP version 13",
    "# Subtest: add sums two numbers",
    "not ok 1 - add sums two numbers",
    "  ---",
    "  error: 'Expected values to be strictly equal'",
    "  code: 'ERR_ASSERTION'",
    "  name: 'AssertionError'",
    "  ---",
    "1..1",
    "# tests 1",
    "# pass 0",
    "# fail 1",
    "",
  ].join("\n");
  const counts = parseTapCounts(tap, "math.test.mjs");
  assert.equal(counts.tests, 1);
  assert.equal(counts.fail, 1);
  assert.equal(counts.hasAssertionFailure, true);
  assert.equal(counts.zeroRealTests, false);
});

test("parseTapCounts: a module-not-found load error does not count as an assertion failure", () => {
  const tap = [
    "TAP version 13",
    "# Subtest: math.test.mjs",
    "not ok 1 - math.test.mjs",
    "  ---",
    "  error: 'test failed'",
    "  code: 'ERR_TEST_FAILURE'",
    "  ---",
    "1..1",
    "# tests 1",
    "# pass 0",
    "# fail 1",
    "",
  ].join("\n");
  const counts = parseTapCounts(tap, "math.test.mjs");
  assert.equal(counts.hasAssertionFailure, false);
  assert.equal(counts.zeroRealTests, true, "a single top-level test named after the file is node's zero-test-calls shape");
});

test("parseTapCounts: a real, uniquely named passing test is not mistaken for the zero-test wrapper", () => {
  const tap = [
    "TAP version 13",
    "# Subtest: add sums two numbers",
    "ok 1 - add sums two numbers",
    "  ---",
    "  ---",
    "1..1",
    "# tests 1",
    "# pass 1",
    "# fail 0",
    "",
  ].join("\n");
  const counts = parseTapCounts(tap, "math.test.mjs");
  assert.equal(counts.zeroRealTests, false);
});

test("parseTapCounts: a cancelled/timed-out test is not counted as passed (fail 0, cancelled 1)", () => {
  // node v24 reports a timeout/cancellation as "not ok" with `# fail 0` / `# cancelled 1` -
  // round-2 review BLOCKER 1: a fail-count-only check let this fall through to "passed".
  const tap = [
    "TAP version 13",
    "# Subtest: slow",
    "not ok 1 - slow",
    "  ---",
    "  error: 'test timed out'",
    "  code: 'ERR_TEST_FAILURE'",
    "  ---",
    "1..1",
    "# tests 1",
    "# pass 0",
    "# fail 0",
    "# cancelled 1",
    "# skipped 0",
    "# todo 0",
    "",
  ].join("\n");
  const counts = parseTapCounts(tap, "slow.test.mjs");
  assert.equal(counts.cancelled, 1);
  assert.equal(counts.fail, 0);
});

test("parseTapCounts: skip/todo-only counts are captured so classifyRun can fold them in (orchestrator ruling a)", () => {
  const tap = [
    "TAP version 13",
    "# Subtest: someday",
    "ok 1 - someday # SKIP not ready",
    "  ---",
    "  ---",
    "1..1",
    "# tests 1",
    "# pass 1",
    "# fail 0",
    "# cancelled 0",
    "# skipped 1",
    "# todo 0",
    "",
  ].join("\n");
  const counts = parseTapCounts(tap, "someday.test.mjs");
  assert.equal(counts.skipped, 1);
  assert.equal(counts.tests, 1);
});

test("classifyRun: a cancelled test is inconclusive, never passed (BLOCKER 1 regression)", () => {
  const dir = fs.mkdtempSync(path.join(FIXTURE_ROOT, "prefix-test-slow-"));
  fs.writeFileSync(
    path.join(dir, "slow.test.mjs"),
    [
      "import test from 'node:test';",
      "test('slow', { timeout: 100 }, async () => { await new Promise((r) => setTimeout(r, 2000)); });",
      "",
    ].join("\n")
  );
  const r = classifyRun(dir, "slow.test.mjs");
  assert.equal(r.category, "inconclusive");
});

test("classifyRun: a skip-only file is inconclusive, never passed (orchestrator ruling a)", () => {
  const dir = fs.mkdtempSync(path.join(FIXTURE_ROOT, "prefix-test-skiponly-"));
  fs.writeFileSync(
    path.join(dir, "skiponly.test.mjs"),
    [
      "import test from 'node:test';",
      "test('someday', { skip: true }, () => {});",
      "",
    ].join("\n")
  );
  const r = classifyRun(dir, "skiponly.test.mjs");
  assert.equal(r.category, "inconclusive");
});

test("classifyRun: a real test in a subdirectory is not mistaken for the zero-test wrapper (MAJOR 4 regression)", () => {
  const dir = fs.mkdtempSync(path.join(FIXTURE_ROOT, "prefix-test-subdir-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts", "empty.test.mjs"), "// no test() calls\nexport const x = 1;\n");
  const r = classifyRun(dir, path.join("scripts", "empty.test.mjs"));
  assert.equal(r.category, "inconclusive", "a zero-test file in a subdirectory must still be inconclusive, not passed");
});

test("classifyRun: a file with zero real test() calls is inconclusive, never counted as passed", () => {
  const dir = fs.mkdtempSync(path.join(FIXTURE_ROOT, "prefix-test-empty-"));
  fs.writeFileSync(path.join(dir, "empty.test.mjs"), "// no test() calls\nexport const x = 1;\n");
  const r = classifyRun(dir, "empty.test.mjs");
  assert.equal(r.category, "inconclusive");
});

test("classifyRun: two real named tests, one failing, is reproduced (fail>0 with ERR_ASSERTION)", () => {
  const dir = fs.mkdtempSync(path.join(FIXTURE_ROOT, "prefix-test-two-"));
  fs.writeFileSync(
    path.join(dir, "two.test.mjs"),
    [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "test('passes', () => { assert.equal(1, 1); });",
      "test('fails', () => { assert.equal(1, 2); });",
      "",
    ].join("\n")
  );
  const r = classifyRun(dir, "two.test.mjs");
  assert.equal(r.category, "reproduced");
});

test("parseTapCounts: the ERR_ASSERTION literal inside a TEST NAME is not an assertion failure (MAJOR 3 regression)", () => {
  const tap = ["TAP version 13", "# Subtest: regression for code: 'ERR_ASSERTION' handling",
    "not ok 1 - regression for code: 'ERR_ASSERTION' handling", "  ---", "  error: 'boom'",
    "  code: 'ERR_TEST_FAILURE'", "  ---", "1..1", "# tests 1", "# pass 0", "# fail 1", ""].join("\n");
  assert.equal(parseTapCounts(tap, "spoof.test.mjs").hasAssertionFailure, false);
});
