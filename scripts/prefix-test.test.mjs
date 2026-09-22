// node --test scripts/prefix-test.test.mjs
//
// Fixture identity (spec.md C5 shape, T3.md scoped-identity instructions, addendum A3):
// a temp .gitconfig holding ONLY an `[includeIf "gitdir/i:<realpath of the system temp
// dir>/**"]` pointing at a `.gitconfig-fixture` carrying `[user] name = Fixture` /
// `email = fixture@example.invalid`; GIT_CONFIG_GLOBAL and GIT_CONFIG_NOSYSTEM=1 are set
// only in the child-process env used to build THIS test's fixture repo, never via
// `-c user.*`, never GIT_AUTHOR_*, never touching a real repo. Every fixture repo is
// created with fs.mkdtempSync(path.join(os.tmpdir(), ...)) (never in this repo or the
// scratch dir), and both gitconfig files use forward slashes with the temp dir
// realpath'd first (A3: a backslash in a git config value is an escape sequence). This
// is T3's OWN copy of the pattern, duplicated deliberately — T7's makeTempHome
// (scripts/test-home.mjs) does not exist at this territory's base commit; the seam
// review is expected to dedupe the two once T7 lands (spec.md's "Gates and acceptance"
// seam-review line).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTapCounts, classifyRun } from "./prefix-test.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "prefix-test.mjs");
const TMP_ROOT = fs.realpathSync(os.tmpdir());

function toPosix(p) {
  return p.replace(/\\/g, "/");
}

function makeFixtureGitEnv(configDir) {
  const globalConfig = path.join(configDir, ".gitconfig");
  const fixtureConfig = path.join(configDir, ".gitconfig-fixture");
  fs.writeFileSync(
    globalConfig,
    `[includeIf "gitdir/i:${toPosix(TMP_ROOT)}/**"]\n\tpath = ${toPosix(fixtureConfig)}\n`
  );
  fs.writeFileSync(
    fixtureConfig,
    "[user]\n\tname = Fixture\n\temail = fixture@example.invalid\n"
  );
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: "1",
  };
}

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
  const configDir = fs.mkdtempSync(path.join(TMP_ROOT, "prefix-test-cfg-"));
  const repoDir = fs.mkdtempSync(path.join(TMP_ROOT, "prefix-test-repo-"));
  const env = makeFixtureGitEnv(configDir);

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
  const { repoDir, bugSha } = buildFixtureRepo();
  const r = runPrefixTest(bugSha, "math.test.mjs", repoDir);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  const worktrees = git(["worktree", "list", "--porcelain"], repoDir, process.env);
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

test("classifyRun: a file with zero real test() calls is inconclusive, never counted as passed", () => {
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, "prefix-test-empty-"));
  fs.writeFileSync(path.join(dir, "empty.test.mjs"), "// no test() calls\nexport const x = 1;\n");
  const r = classifyRun(dir, "empty.test.mjs");
  assert.equal(r.category, "inconclusive");
});

test("classifyRun: two real named tests, one failing, is reproduced (fail>0 with ERR_ASSERTION)", () => {
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, "prefix-test-two-"));
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
