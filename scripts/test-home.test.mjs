// node --test scripts/test-home.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { makeTempHome, checkSeal } from "./test-home.mjs";
import { runSealed } from "./run-tests.mjs";
import { childEnv } from "../skills/multi/scripts/test-child-env.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_URL = pathToFileURL(path.join(HERE, "test-home.mjs")).href;
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

function tempHome(opts) {
  const built = makeTempHome(opts);
  cleanups.push(built.cleanup);
  return built;
}

// L-C7: every fixture repo in this file lives under a mkdtemp of the CALLER-SUPPLIED
// `fixtureRoot` (from `makeTempHome`'s own return), never bare `os.tmpdir()` and never inside
// this repo - the includeIf pattern makeTempHome seeds only grants an identity under fixtureRoot.
function fixtureRepoDir(fixtureRoot) {
  const dir = fs.mkdtempSync(path.join(fixtureRoot, "test-home-fixture-repo-"));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Runs the exported `checkSeal` inside a real child process, given an env - so the assertion is
 * about what a spawned test child actually observes, not what this in-process test computes. */
function checkSealInChild(env) {
  const src =
    `import { checkSeal } from ${JSON.stringify(MODULE_URL)};\n` +
    `console.log(JSON.stringify(checkSeal()));\n`;
  const result = execFileSync(NODE, ["--input-type=module", "-e", src], { env });
  return JSON.parse(result.toString());
}

// ---------------------------------------------------------------------------
// makeTempHome shape and isolation
// ---------------------------------------------------------------------------

test("makeTempHome returns a fresh, empty, disposable home with the expected shape", () => {
  const { home, agentsHome, env, fixtureRoot, cleanup } = tempHome();
  assert.equal(typeof home, "string");
  assert.ok(fs.existsSync(home));
  assert.equal(agentsHome, path.join(home, ".agents"));
  assert.ok(fs.existsSync(agentsHome));
  assert.equal(env.HOME, home);
  assert.equal(env.USERPROFILE, home);
  assert.equal(env.AGENTS_HOME, agentsHome);
  assert.equal(env.GIT_CONFIG_GLOBAL, path.join(home, ".gitconfig"));
  assert.equal(env.GIT_CONFIG_NOSYSTEM, "1");
  assert.equal(typeof fixtureRoot, "string");
  assert.ok(fs.existsSync(fixtureRoot));
  assert.equal(fs.realpathSync(fixtureRoot), fs.realpathSync(path.join(home, "fixtures")));
  assert.equal(env.FIXTURE_ROOT, fixtureRoot.split(path.sep).join("/"));
  assert.equal(typeof cleanup, "function");
});

test("makeTempHome never reuses a directory across calls", () => {
  const a = tempHome();
  const b = tempHome();
  assert.notEqual(a.home, b.home);
});

test("makeTempHome blanks the messaging socket/token in env (never inherits the runner's session)", () => {
  const { env } = tempHome();
  assert.equal(env.CLAUDE_CODE_MESSAGING_SOCKET, "");
  assert.equal(env.CLAUDE_CODE_MESSAGING_TOKEN, "");
});

test("makeTempHome writes files passed under opts.files, relative to the new home", () => {
  const { home } = tempHome({ files: { "docs/work/wr-1.record.md": "Work: wr-1\n" } });
  const full = path.join(home, "docs", "work", "wr-1.record.md");
  assert.ok(fs.existsSync(full));
  assert.equal(fs.readFileSync(full, "utf8"), "Work: wr-1\n");
});

// L-C7: run-tests.mjs adds no new wiring of its own - `runSealed` already forwards the WHOLE
// `env` object `makeTempHome` returns to both spawnSync calls, so once `makeTempHome` sets
// FIXTURE_ROOT the sealed child gets it for free. This proves that end-to-end through the real
// `runSealed`, not just that `makeTempHome`'s own return shape has the field.
//
// NODE_TEST_CONTEXT (set by node's OWN `--test` runner on THIS process, since this file runs
// under `node --test`) must be stripped before calling `runSealed`: `childEnv()` spreads
// `process.env`, so left in place it silently propagates to the grandchild `node --test <probe>`
// this test spawns, which then detects a "recursive" run and SKIPS running the probe entirely,
// still exiting 0 - a false green that would pass whether or not FIXTURE_ROOT actually arrived.
// Confirmed by direct check: with a deliberately-failing probe and NODE_TEST_CONTEXT left in
// place, runSealed() returned 0 (skipped) instead of 1; stripping it, the same failing probe
// correctly returned 1.
test("run-tests.mjs's runSealed forwards FIXTURE_ROOT through to the sealed child", () => {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-tests-fixture-root-probe-"));
  cleanups.push(() => fs.rmSync(probeDir, { recursive: true, force: true }));
  const probeFile = path.join(probeDir, "fixture-root-probe.test.mjs");
  fs.writeFileSync(
    probeFile,
    [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "test('FIXTURE_ROOT reaches the sealed child', () => {",
      "  assert.ok(process.env.FIXTURE_ROOT, 'FIXTURE_ROOT must be set under the seal');",
      "});",
      "",
    ].join("\n"),
  );
  const savedTestContext = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  let code;
  try {
    code = runSealed({ files: [probeFile] });
  } finally {
    if (savedTestContext !== undefined) process.env.NODE_TEST_CONTEXT = savedTestContext;
  }
  assert.equal(code, 0, "the sealed run of the probe file must succeed - FIXTURE_ROOT reached it");
});

test("cleanup removes the home directory", () => {
  const built = makeTempHome();
  assert.ok(fs.existsSync(built.home));
  built.cleanup();
  assert.equal(fs.existsSync(built.home), false);
});

// ---------------------------------------------------------------------------
// Gitconfig seeding (C5 / L-C7): includeIf scoped to the realpath'd fixtureRoot, forward slashes
// ---------------------------------------------------------------------------

test("makeTempHome seeds .gitconfig with an includeIf scoped to the realpath'd fixtureRoot, forward slashes only", () => {
  const { home, fixtureRoot } = tempHome({ gitIdentity: true });
  const gitconfig = fs.readFileSync(path.join(home, ".gitconfig"), "utf8");
  const fixtureRootGitPath = fs.realpathSync(fixtureRoot).split(path.sep).join("/");
  assert.match(gitconfig, /\[includeIf "gitdir\/i:/);
  assert.ok(gitconfig.includes(fixtureRootGitPath), "includeIf pattern must contain the realpath'd fixtureRoot");
  assert.ok(!gitconfig.includes("\\"), "gitconfig values must use forward slashes, never backslashes");
  assert.match(gitconfig, /path = .*\.gitconfig-fixture/);
  // Narrowing (L-C7): the pattern must NOT be scoped to the whole system temp dir any more - it
  // has to name something more specific than the bare realpath'd tmpdir on its own.
  const tempRoot = fs.realpathSync(os.tmpdir()).split(path.sep).join("/");
  assert.notEqual(fixtureRootGitPath, tempRoot, "fixtureRoot must be a subdirectory of the temp dir, not the temp dir itself");
});

test("makeTempHome seeds .gitconfig-fixture with the Fixture identity, forward slashes only", () => {
  const { home } = tempHome({ gitIdentity: true });
  const fixture = fs.readFileSync(path.join(home, ".gitconfig-fixture"), "utf8");
  assert.match(fixture, /\[user\]/);
  assert.match(fixture, /name = Fixture/);
  assert.match(fixture, /email = fixture@example\.invalid/);
  assert.ok(!fixture.includes("\\"));
});

test("gitIdentity: false leaves an empty global gitconfig (no identity anywhere under the seal)", () => {
  const { home } = tempHome({ gitIdentity: false });
  const gitconfig = fs.readFileSync(path.join(home, ".gitconfig"), "utf8");
  assert.equal(gitconfig, "");
  assert.equal(fs.existsSync(path.join(home, ".gitconfig-fixture")), false);
});

// ---------------------------------------------------------------------------
// Fixture commits: identity resolves under fixtureRoot, refused everywhere else (L-C7)
// ---------------------------------------------------------------------------

test("a fixture commit succeeds under the seal with the fixture identity", () => {
  const { env, fixtureRoot } = tempHome({ gitIdentity: true });
  const repo = fixtureRepoDir(fixtureRoot); // under fixtureRoot, per L-C7
  execFileSync("git", ["init", "-q"], { cwd: repo, env });
  fs.writeFileSync(path.join(repo, "a.txt"), "hi");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, env });
  execFileSync("git", ["commit", "-q", "-m", "fixture commit"], { cwd: repo, env });
  const who = execFileSync("git", ["log", "-1", "--format=%an <%ae>"], { cwd: repo, env }).toString().trim();
  assert.equal(who, "Fixture <fixture@example.invalid>");
});

// This is the L-C7 canary: the whole point of narrowing is that a repo merely sitting somewhere
// under the system temp dir - but OUTSIDE fixtureRoot - must get NO identity, where before the
// narrowing it would have. Built as a sibling of fixtureRoot (both under the same sealed home's
// realpath'd os.tmpdir() ancestor), so this test would PASS EVEN ON A REVERT to the old
// whole-tmpdir scoping if it merely checked "under tmpdir" - it specifically checks "under
// tmpdir, sibling to fixtureRoot, not inside it," which only the narrowed includeIf refuses.
test("a repo built under the system temp dir but OUTSIDE fixtureRoot gets no identity under the seal (L-C7 canary)", () => {
  const { env, fixtureRoot } = tempHome({ gitIdentity: true });
  const outsideRoot = path.dirname(fixtureRoot); // sibling of "fixtures", i.e. the sealed home itself
  const repo = fs.mkdtempSync(path.join(outsideRoot, "outside-fixture-root-"));
  cleanups.push(() => fs.rmSync(repo, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: repo, env });
  fs.writeFileSync(path.join(repo, "a.txt"), "hi");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, env });
  assert.throws(
    () => execFileSync("git", ["commit", "-q", "-m", "should be refused"], { cwd: repo, env, stdio: "pipe" }),
    /./,
    "a repo outside fixtureRoot must not resolve the fixture identity",
  );
});

test("a commit attempted outside the system temp dir has no identity under the seal and is refused", () => {
  const { env } = tempHome({ gitIdentity: true });
  // F4 (T7-review.md): this worktree's WORKING TREE is under the system temp dir (the whole build
  // runs from a scratchpad under %TEMP%) - but its GITDIR is not: a `git worktree add` gitdir lives
  // under the main checkout's `.git/worktrees/<name>`, which the includeIf pattern (matched against
  // gitdir, not worktree) does not cover. That's what this test actually exercises: gitdir outside
  // the temp dir -> no identity -> refused. (A DIFFERENT repo, e.g. one `git clone`d directly under
  // %TEMP% instead of `worktree add`, would have its gitdir there too and, before L-C7's narrowing,
  // would have gotten the identity - that's F4's flagged follow-up, not a bug in this assertion; per
  // L-C7 it now needs to be under fixtureRoot specifically, which this repo also is not.)
  //
  // `git var GIT_COMMITTER_IDENT` resolves identity with no write - unlike `git commit`, which would
  // actually create a real commit on this checked-out branch if identity ever resolved here.
  assert.throws(
    () => execFileSync("git", ["var", "GIT_COMMITTER_IDENT"], { cwd: process.cwd(), env, stdio: "pipe" }),
    (e) => /identity unknown|unable to auto-detect email|empty ident/i.test(String(e.stderr ?? "")),
  );
});

test("gitIdentity: false refuses a commit even under fixtureRoot", () => {
  const { env, fixtureRoot } = tempHome({ gitIdentity: false });
  const repo = fixtureRepoDir(fixtureRoot);
  execFileSync("git", ["init", "-q"], { cwd: repo, env });
  fs.writeFileSync(path.join(repo, "a.txt"), "hi");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, env });
  assert.throws(() => {
    execFileSync("git", ["commit", "-q", "-m", "no identity"], { cwd: repo, env, stdio: "pipe" });
  }, /./);
});

// ---------------------------------------------------------------------------
// checkSeal / canary (RT-18): passes sealed, fails when the seal is broken on purpose
// ---------------------------------------------------------------------------

// F2 (T7-review.md): self-consistency (AGENTS_HOME === "<home>/.agents") is NOT sufficient - a
// perfectly self-consistent but UNSEALED home (e.g. the real machine profile) must still fail.
// NOT `os.homedir()` read live: this whole suite is itself one of the files `run-tests.mjs` runs
// UNDER THE SEAL, so by the time this test executes, live `os.homedir()` may already be an OUTER
// sealed home rather than the true machine profile - reading it here would make the test's outcome
// depend on which runner invoked it. Instead, build a home that is unsealed BY CONSTRUCTION: the
// realpath'd system temp dir's own PARENT can never be "inside" the temp dir, in any context.
test("checkSeal fails in a child for an unsealed home, even when AGENTS_HOME is self-consistent", () => {
  const outsideHome = path.dirname(fs.realpathSync(os.tmpdir()));
  const env = childEnv(outsideHome, { AGENTS_HOME: path.join(outsideHome, ".agents") });
  const r = checkSealInChild(env);
  assert.equal(r.ok, false, r.message);
  assert.match(r.message, /not a sealed home/);
});

test("checkSeal fails when AGENTS_HOME is unset", () => {
  const saved = process.env.AGENTS_HOME;
  delete process.env.AGENTS_HOME;
  try {
    const r = checkSeal();
    assert.equal(r.ok, false);
    assert.match(r.message, /AGENTS_HOME is not set/);
  } finally {
    if (saved !== undefined) process.env.AGENTS_HOME = saved;
  }
});

test("checkSeal passes inside a real sealed child process", () => {
  const { env } = tempHome({ gitIdentity: false });
  const r = checkSealInChild(env);
  assert.equal(r.ok, true, r.message);
});

test("checkSeal fails in a child when the seal is broken on purpose (AGENTS_HOME points elsewhere)", () => {
  const { env, home } = tempHome({ gitIdentity: false });
  const otherHome = fs.mkdtempSync(path.join(os.tmpdir(), "other-home-"));
  cleanups.push(() => fs.rmSync(otherHome, { recursive: true, force: true }));
  const broken = { ...env, AGENTS_HOME: path.join(otherHome, ".agents") };
  const r = checkSealInChild(broken);
  assert.equal(r.ok, false);
  assert.match(r.message, /os\.homedir\(\)/);
  assert.notEqual(home, otherHome);
});

test("checkSeal fails in a child when AGENTS_HOME is not '<home>/.agents'", () => {
  const { env, home } = tempHome({ gitIdentity: false });
  const broken = { ...env, AGENTS_HOME: path.join(home, "not-dot-agents") };
  const r = checkSealInChild(broken);
  assert.equal(r.ok, false);
  assert.match(r.message, /AGENTS_HOME/);
});

// ---------------------------------------------------------------------------
// Class test (L-C7, unconditional - no carve-out): exactly ONE construction of an
// `includeIf "gitdir` directive across scripts/, hooks/, and skills/multi/scripts/.
// ---------------------------------------------------------------------------

test("class test: exactly one construction of the fixture includeIf gitdir-scope directive across scripts/, hooks/, and skills/multi/scripts/", () => {
  const REPO_ROOT = path.resolve(HERE, "..");
  const roots = [
    path.join(REPO_ROOT, "scripts"),
    path.join(REPO_ROOT, "hooks"),
    path.join(REPO_ROOT, "skills", "multi", "scripts"),
  ];
  // Built, never written literally, so this test is never counted as its own second construction.
  const needle = ["includeIf ", '"gitdir'].join("");
  const constructions = [];
  for (const dir of roots) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!fs.statSync(full).isFile() || !/\.(mjs|js)$/.test(name)) continue;
      const lines = fs.readFileSync(full, "utf8").split("\n");
      let inBlockComment = false;
      for (const [i, line] of lines.entries()) {
        const trimmed = line.trim();
        if (inBlockComment) {
          if (trimmed.includes("*/")) inBlockComment = false;
          continue; // the whole line lives inside the block comment
        }
        if (trimmed.startsWith("/*")) {
          if (!trimmed.includes("*/")) inBlockComment = true;
          continue;
        }
        if (!line.includes(needle)) continue;
        if (trimmed.startsWith("//")) continue; // line comment
        // A regex literal used only for matching (e.g. this file's own
        // `assert.match(gitconfig, /\[includeIf "gitdir\/i:/)`) escapes the bracket and the
        // slash the way a JS RegExp source does - a constructed value (a plain string or
        // template literal actually written to a file) never contains those escapes.
        if (line.includes('\\[includeIf') || line.includes("gitdir\\/")) continue;
        constructions.push(`${path.relative(REPO_ROOT, full)}:${i + 1}`);
      }
    }
  }
  assert.equal(
    constructions.length,
    1,
    `expected exactly one includeIf gitdir-scope construction, found: ${constructions.join(", ") || "(none)"}`,
  );
  assert.match(constructions[0], /test-home\.mjs:/, "the one construction must be makeTempHome's own");
});
