// node --test skills/team-build/references/phase-commit.test.mjs
//
// Lane 74 item 1/8: the phase-end commit helper against scratch repos under a sealed fake home.
// Includes the dying-builder fixture: a builder that wrote files and died leaves them UNCOMMITTED
// (before); the helper leaves them COMMITTED on the territory branch (after).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeTempHome } from "../../../scripts/test-home.mjs";
import { phaseCommit, parseArgs, DEFAULT_MESSAGE } from "./phase-commit.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "phase-commit.mjs");

function g(cwd, childEnv, ...args) {
  const r = spawnSync("git", args, { cwd, env: childEnv, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function makeRepo(sealed, branch = "build/x-t1") {
  const { env, fixtureRoot } = sealed;
  const repo = fs.mkdtempSync(path.join(fixtureRoot, "phase-commit-"));
  g(repo, env, "init", "-q", "-b", branch);
  fs.writeFileSync(path.join(repo, "README.md"), "base\n");
  g(repo, env, "add", "-A");
  g(repo, env, "commit", "-q", "-m", "chore: base");
  return repo;
}

test("dying builder: uncommitted edits before, one commit on the territory branch after", () => {
  const sealed = makeTempHome();
  const { env } = sealed;
  try {
    const repo = makeRepo(sealed);
    const baseSha = g(repo, env, "rev-parse", "HEAD");
    // the builder wrote a modified file, a new file and a new directory, then died
    fs.writeFileSync(path.join(repo, "README.md"), "base\nedited\n");
    fs.writeFileSync(path.join(repo, "feature.mjs"), "export const x = 1\n");
    fs.mkdirSync(path.join(repo, "sub"));
    fs.writeFileSync(path.join(repo, "sub", "deep.txt"), "deep\n");
    // BEFORE: uncommitted work, HEAD unmoved
    const dirtyBefore = g(repo, env, "status", "--porcelain", "--untracked-files=all");
    assert.match(dirtyBefore, /M README\.md/);
    assert.match(dirtyBefore, /\?\? feature\.mjs/);
    assert.match(dirtyBefore, /\?\? sub\/deep\.txt/);
    assert.equal(g(repo, env, "rev-parse", "HEAD"), baseSha);

    const res = phaseCommit({ worktree: repo, env });
    assert.equal(res.committed, true);
    assert.equal(res.reason, "committed");
    assert.equal(res.dirty, 3);

    // AFTER: a commit on the territory branch holds all of it; the tree is clean
    const tip = g(repo, env, "rev-parse", "HEAD");
    assert.notEqual(tip, baseSha);
    assert.equal(res.sha, tip);
    assert.equal(g(repo, env, "rev-parse", "--abbrev-ref", "HEAD"), "build/x-t1");
    assert.equal(g(repo, env, "status", "--porcelain", "--untracked-files=all"), "");
    const files = g(repo, env, "show", "--name-only", "--format=", "HEAD").split("\n").sort();
    assert.deepEqual(files, ["README.md", "feature.mjs", "sub/deep.txt"]);
    assert.equal(g(repo, env, "log", "-1", "--format=%s"), DEFAULT_MESSAGE);
    assert.equal(g(repo, env, "rev-list", "--count", `${baseSha}..HEAD`), "1");
  } finally {
    sealed.cleanup();
  }
});

test("a clean tree is left alone: no commit, HEAD unmoved", () => {
  const sealed = makeTempHome();
  const { env } = sealed;
  try {
    const repo = makeRepo(sealed);
    const tip = g(repo, env, "rev-parse", "HEAD");
    const res = phaseCommit({ worktree: repo, env });
    assert.equal(res.committed, false);
    assert.equal(res.reason, "clean");
    assert.equal(res.sha, tip);
    assert.equal(g(repo, env, "rev-parse", "HEAD"), tip);
  } finally {
    sealed.cleanup();
  }
});

test("ignored files are not committed; a custom conventional message is used", () => {
  const sealed = makeTempHome();
  const { env } = sealed;
  try {
    const repo = makeRepo(sealed);
    fs.writeFileSync(path.join(repo, ".gitignore"), "scratch.log\n");
    g(repo, env, "add", "-A");
    g(repo, env, "commit", "-q", "-m", "chore: ignore");
    fs.writeFileSync(path.join(repo, "scratch.log"), "noise\n");
    assert.equal(phaseCommit({ worktree: repo, env }).reason, "clean");
    fs.writeFileSync(path.join(repo, "real.txt"), "work\n");
    const res = phaseCommit({ worktree: repo, env, message: "chore(t1): phase-end commit after Build" });
    assert.equal(res.committed, true);
    assert.equal(g(repo, env, "log", "-1", "--format=%s"), "chore(t1): phase-end commit after Build");
    assert.deepEqual(g(repo, env, "show", "--name-only", "--format=", "HEAD").split("\n"), ["real.txt"]);
  } finally {
    sealed.cleanup();
  }
});

test("no configured identity: nothing staged, nothing committed, files left, reason no-identity", () => {
  const sealed = makeTempHome({ gitIdentity: false });
  const { env, fixtureRoot } = sealed;
  try {
    const repo = fs.mkdtempSync(path.join(fixtureRoot, "phase-commit-noid-"));
    g(repo, env, "init", "-q", "-b", "build/x-t1");
    fs.writeFileSync(path.join(repo, "work.txt"), "work\n");
    const res = phaseCommit({ worktree: repo, env });
    assert.equal(res.committed, false);
    assert.equal(res.reason, "no-identity");
    assert.equal(res.dirty, 1);
    assert.equal(g(repo, env, "status", "--porcelain"), "?? work.txt", "the file is still untracked, not staged");
    assert.ok(fs.existsSync(path.join(repo, "work.txt")));
  } finally {
    sealed.cleanup();
  }
});

test("refuses on main, on a detached HEAD, and while a merge is in progress; never touches the files", () => {
  const sealed = makeTempHome();
  const { env } = sealed;
  try {
    const onMain = makeRepo(sealed, "main");
    fs.writeFileSync(path.join(onMain, "w.txt"), "w\n");
    assert.equal(phaseCommit({ worktree: onMain, env }).reason, "protected-branch");
    assert.equal(g(onMain, env, "status", "--porcelain"), "?? w.txt");

    const detached = makeRepo(sealed);
    g(detached, env, "checkout", "-q", "--detach");
    fs.writeFileSync(path.join(detached, "w.txt"), "w\n");
    assert.equal(phaseCommit({ worktree: detached, env }).reason, "detached-head");

    const merging = makeRepo(sealed);
    fs.writeFileSync(path.join(merging, "w.txt"), "w\n");
    fs.writeFileSync(path.join(merging, ".git", "MERGE_HEAD"), `${g(merging, env, "rev-parse", "HEAD")}\n`);
    assert.equal(phaseCommit({ worktree: merging, env }).reason, "operation-in-progress");
  } finally {
    sealed.cleanup();
  }
});

test("a missing or non-git directory is reported, not thrown", () => {
  const sealed = makeTempHome();
  const { env, home, fixtureRoot } = sealed;
  try {
    assert.equal(phaseCommit({ worktree: path.join(home, "nope"), env }).reason, "worktree-missing");
    const plain = fs.mkdtempSync(path.join(fixtureRoot, "plain-"));
    assert.equal(phaseCommit({ worktree: plain, env: { ...env, GIT_CEILING_DIRECTORIES: home } }).reason, "not-a-work-tree");
  } finally {
    sealed.cleanup();
  }
});

test("CLI: --json prints the result and exits 0 on commit, 3 on a refusal, 2 on bad args", () => {
  const sealed = makeTempHome();
  const { env } = sealed;
  try {
    const repo = makeRepo(sealed);
    fs.writeFileSync(path.join(repo, "w.txt"), "w\n");
    const ok = spawnSync(process.execPath, [SCRIPT, "--worktree", repo, "--json"], { env, encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    const parsed = JSON.parse(ok.stdout);
    assert.equal(parsed.committed, true);
    assert.match(parsed.sha, /^[0-9a-f]{40}$/);

    const protectedRepo = makeRepo(sealed, "main");
    fs.writeFileSync(path.join(protectedRepo, "w.txt"), "w\n");
    const refused = spawnSync(process.execPath, [SCRIPT, "--worktree", protectedRepo, "--json"], { env, encoding: "utf8" });
    assert.equal(refused.status, 3);
    assert.equal(JSON.parse(refused.stdout).reason, "protected-branch");

    const bad = spawnSync(process.execPath, [SCRIPT], { env, encoding: "utf8" });
    assert.equal(bad.status, 2);
    assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
  } finally {
    sealed.cleanup();
  }
});

test("source: the helper never pushes, resets, cleans, stashes or skips hooks", () => {
  const text = fs.readFileSync(SCRIPT, "utf8").replace(/^\s*\/\/.*$/gm, "");
  for (const bad of ["push", "reset", "clean", "stash", "checkout", "rm"]) {
    assert.ok(!new RegExp(`\\["${bad}"`).test(text), `${bad} must not be a git argument`);
  }
  assert.ok(!/no-verify/.test(text), "hooks are never skipped");
  assert.ok(!/--force/.test(text), "nothing is forced");
});
