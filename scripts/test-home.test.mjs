// node --test scripts/test-home.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { makeTempHome, checkSeal } from "./test-home.mjs";
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

// A3 (spec-addendum-r3.md): every fixture repo in this file lives under a mkdtemp of os.tmpdir(),
// never inside this repo - the includeIf pattern makeTempHome seeds only grants an identity there.
function fixtureRepoDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "test-home-fixture-repo-"));
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
  const { home, agentsHome, env, cleanup } = tempHome();
  assert.equal(typeof home, "string");
  assert.ok(fs.existsSync(home));
  assert.equal(agentsHome, path.join(home, ".agents"));
  assert.ok(fs.existsSync(agentsHome));
  assert.equal(env.HOME, home);
  assert.equal(env.USERPROFILE, home);
  assert.equal(env.AGENTS_HOME, agentsHome);
  assert.equal(env.GIT_CONFIG_GLOBAL, path.join(home, ".gitconfig"));
  assert.equal(env.GIT_CONFIG_NOSYSTEM, "1");
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

test("cleanup removes the home directory", () => {
  const built = makeTempHome();
  assert.ok(fs.existsSync(built.home));
  built.cleanup();
  assert.equal(fs.existsSync(built.home), false);
});

// ---------------------------------------------------------------------------
// Gitconfig seeding (C5 / A3): includeIf scoped to the realpath'd system temp dir, forward slashes
// ---------------------------------------------------------------------------

test("makeTempHome seeds .gitconfig with an includeIf scoped to the realpath'd system temp dir, forward slashes only", () => {
  const { home } = tempHome({ gitIdentity: true });
  const gitconfig = fs.readFileSync(path.join(home, ".gitconfig"), "utf8");
  const tempRoot = fs.realpathSync(os.tmpdir()).split(path.sep).join("/");
  assert.match(gitconfig, /\[includeIf "gitdir\/i:/);
  assert.ok(gitconfig.includes(tempRoot), "includeIf pattern must contain the realpath'd temp dir");
  assert.ok(!gitconfig.includes("\\"), "gitconfig values must use forward slashes, never backslashes");
  assert.match(gitconfig, /path = .*\.gitconfig-fixture/);
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
// Fixture commits: identity resolves under the temp dir, refused everywhere else
// ---------------------------------------------------------------------------

test("a fixture commit succeeds under the seal with the fixture identity", () => {
  const { env } = tempHome({ gitIdentity: true });
  const repo = fixtureRepoDir(); // under os.tmpdir(), per A3
  execFileSync("git", ["init", "-q"], { cwd: repo, env });
  fs.writeFileSync(path.join(repo, "a.txt"), "hi");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, env });
  execFileSync("git", ["commit", "-q", "-m", "fixture commit"], { cwd: repo, env });
  const who = execFileSync("git", ["log", "-1", "--format=%an <%ae>"], { cwd: repo, env }).toString().trim();
  assert.equal(who, "Fixture <fixture@example.invalid>");
});

test("a commit attempted outside the system temp dir has no identity under the seal and is refused", () => {
  const { env } = tempHome({ gitIdentity: true });
  // F4 (T7-review.md): this worktree's WORKING TREE is under the system temp dir (the whole build
  // runs from a scratchpad under %TEMP%) - but its GITDIR is not: a `git worktree add` gitdir lives
  // under the main checkout's `.git/worktrees/<name>`, which the includeIf pattern (matched against
  // gitdir, not worktree) does not cover. That's what this test actually exercises: gitdir outside
  // the temp dir -> no identity -> refused. (A DIFFERENT repo, e.g. one `git clone`d directly under
  // %TEMP% instead of `worktree add`, would have its gitdir there too and WOULD get the identity -
  // that's F4's flagged follow-up, not a bug in this assertion.)
  //
  // `git var GIT_COMMITTER_IDENT` resolves identity with no write - unlike `git commit`, which would
  // actually create a real commit on this checked-out branch if identity ever resolved here.
  assert.throws(
    () => execFileSync("git", ["var", "GIT_COMMITTER_IDENT"], { cwd: process.cwd(), env, stdio: "pipe" }),
    (e) => /identity unknown|unable to auto-detect email|empty ident/i.test(String(e.stderr ?? "")),
  );
});

test("gitIdentity: false refuses a commit even under the system temp dir", () => {
  const { env } = tempHome({ gitIdentity: false });
  const repo = fixtureRepoDir();
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
