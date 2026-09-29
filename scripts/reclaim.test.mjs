// Tests for reclaim.mjs (C2, spec.md amended by F3-F8, F10, F13, F16, F17 - ruling r0 adopts every
// finding). Every refusal case here is red before the corresponding reclaim.mjs behaviour exists
// and green after; every fixture lives under its own mkdtemp, with a fake HOME/tmp-root layout and
// a fake CLAUDE_CODE_SESSION_ID passed through ctx, never the real ones.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { main as reclaimMain } from "./reclaim.mjs";

const tmpDirs = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
after(() => {
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function mkdir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/** A tight, private scratch layout for S/T fixtures: a fake tmp root and a fake /var/tmp root, each
 * with mode 0700 so checkOwnerNotWidelyWritable never trips on the sandbox's umask (real `mktemp
 * -d` is 0700 regardless of umask; plain mkdirSync is not). */
function mkScratchRoots() {
  const base = mkTmp("reclaim-roots-");
  const tmpRoot = mkdir(path.join(base, "tmp"));
  const varTmpRoot = mkdir(path.join(base, "var-tmp"));
  fs.chmodSync(tmpRoot, 0o700);
  fs.chmodSync(varTmpRoot, 0o700);
  return { base, tmpRoot, varTmpRoot };
}

function baseCtx(overrides = {}) {
  const { tmpRoot, varTmpRoot } = mkScratchRoots();
  const home = mkTmp("reclaim-home-");
  const cwd = mkTmp("reclaim-cwd-");
  return {
    cwd,
    home,
    platform: "linux",
    uid: process.getuid(),
    tmpdir: tmpRoot,
    posixTmpRoot: tmpRoot,
    posixVarTmpRoot: varTmpRoot,
    sessionId: "sess-1",
    now: new Date(),
    fsImpl: fs,
    print: () => {},
    ...overrides,
  };
}

function collector() {
  const lines = [];
  return { lines, print: (l) => lines.push(l) };
}

function initRepo() {
  const repo = mkTmp("reclaim-repo-");
  git(["init", "-q", "-b", "main"], repo);
  fs.writeFileSync(path.join(repo, "README.md"), "root\n");
  git(["add", "."], repo);
  git(["commit", "-q", "-m", "init"], repo);
  const origin = mkTmp("reclaim-origin-");
  git(["init", "-q", "--bare", "-b", "main"], origin);
  git(["remote", "add", "origin", origin], repo);
  git(["push", "-q", "origin", "main"], repo);
  return { repo, origin };
}

function addMergedWorktree(repo, branch) {
  git(["branch", branch], repo);
  // repo's own basename (from mkdtemp) keeps this unique across tests that reuse a branch name -
  // a fixed `wt-<branch>` sibling name would collide between tests sharing the same tmp parent.
  const wt = path.join(path.dirname(repo), `${path.basename(repo)}-wt-${branch}`);
  git(["worktree", "add", wt, branch], repo);
  fs.writeFileSync(path.join(wt, "x.txt"), "work\n");
  git(["add", "."], wt);
  git(["commit", "-q", "-m", "work"], wt);
  git(["merge", "--no-ff", "-q", "-m", "merge", branch], repo);
  git(["push", "-q", "origin", "main"], repo);
  return wt;
}

const ADVANCED = new Date(Date.now() + 25 * 3600000);
const MID = new Date(Date.now() + 10 * 3600000);

// ---------- usage errors (exit 2) ----------

test("no path given: exit 2, usage error to stderr not stdout", () => {
  const c = collector();
  const code = reclaimMain([], { ...baseCtx(), print: c.print });
  assert.equal(code, 2);
  assert.deepEqual(c.lines, []);
});

test("unknown flag: exit 2", () => {
  const c = collector();
  const code = reclaimMain(["--bogus"], { ...baseCtx(), print: c.print });
  assert.equal(code, 2);
});

test("--branch without --repo: exit 2", () => {
  const c = collector();
  const code = reclaimMain(["--branch", "foo"], { ...baseCtx(), print: c.print });
  assert.equal(code, 2);
});

test("--branch combined with a path: exit 2", () => {
  const c = collector();
  const code = reclaimMain(["--branch", "foo", "--repo", "/tmp", "/tmp/x"], { ...baseCtx(), print: c.print });
  assert.equal(code, 2);
});

// ---------- F14 kill switch ----------

test("F14: kill switch refuses every argument, exit 3, nothing removed", () => {
  const ctx = baseCtx({ switchedOffImpl: () => true });
  const target = path.join(ctx.posixTmpRoot, `claude-${ctx.uid}`, "proj", ctx.sessionId, "scratchpad", "x");
  mkdir(target);
  const c = collector();
  const code = reclaimMain([target], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.equal(c.lines.length, 1);
  assert.match(c.lines[0], /reclaim switched off/);
  assert.ok(fs.existsSync(target));
});

// ---------- F8: cwd containment ----------

test("F8: target equal to process.cwd() is refused", () => {
  const ctx = baseCtx();
  const c = collector();
  const code = reclaimMain([ctx.cwd], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /equals process\.cwd\(\) or contains it/);
});

// ---------- F7: .. escape ----------

test("F7: a raw argument carrying a literal .. segment is refused before any resolution", () => {
  const ctx = baseCtx();
  // path.join would lexically collapse ".." away before reclaim ever saw it - build the raw
  // string by hand so the literal ".." segment survives, exactly as F7 means to catch.
  const raw = `${ctx.posixTmpRoot}/../etc`;
  const c = collector();
  const code = reclaimMain([raw], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /contains \.\./);
});

// ---------- class S ----------

function sTarget(ctx, { session = ctx.sessionId, project = "proj1", rest = "work-item" } = {}) {
  const p = path.join(ctx.posixTmpRoot, `claude-${ctx.uid}`, project, session, "scratchpad", rest);
  mkdir(p);
  fs.chmodSync(path.join(ctx.posixTmpRoot, `claude-${ctx.uid}`), 0o700);
  return p;
}

test("S: happy path removes with fs, dry-run removes nothing", () => {
  const ctx = baseCtx();
  const target = sTarget(ctx);
  const c1 = collector();
  const code1 = reclaimMain(["--dry-run", target], { ...ctx, print: c1.print });
  assert.equal(code1, 0);
  assert.match(c1.lines[0], /^would-remove S /);
  assert.ok(fs.existsSync(target));

  const c2 = collector();
  const code2 = reclaimMain([target], { ...ctx, print: c2.print });
  assert.equal(code2, 0);
  assert.match(c2.lines[0], /^removed S /);
  assert.ok(!fs.existsSync(target));
});

test("S: session id mismatch is refused", () => {
  const ctx = baseCtx({ sessionId: "sess-1" });
  const target = sTarget(ctx, { session: "sess-OTHER" });
  const c = collector();
  const code = reclaimMain([target], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /CLAUDE_CODE_SESSION_ID/);
  assert.ok(fs.existsSync(target));
});

test("S: unset session id is refused", () => {
  const ctx = baseCtx({ sessionId: undefined });
  const target = sTarget({ ...ctx, sessionId: "sess-1" }, { session: "sess-1" });
  const c = collector();
  const code = reclaimMain([target], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /CLAUDE_CODE_SESSION_ID/);
});

test("S: the scratchpad directory itself is refused, not just its contents", () => {
  const ctx = baseCtx();
  const target = path.join(ctx.posixTmpRoot, `claude-${ctx.uid}`, "proj1", ctx.sessionId, "scratchpad");
  mkdir(target);
  fs.chmodSync(path.join(ctx.posixTmpRoot, `claude-${ctx.uid}`), 0o700);
  const c = collector();
  const code = reclaimMain([target], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /is the scratchpad directory itself/);
});

// ---------- class T ----------

function tTarget(ctx, { root = ctx.posixVarTmpRoot, name = "delegation-foo-XXXX", rest = "data" } = {}) {
  const top = mkdir(path.join(root, name));
  fs.chmodSync(top, 0o700);
  const p = rest ? mkdir(path.join(top, rest)) : top;
  return { top, target: p };
}

test("T: happy path removes with fs, dry-run removes nothing", () => {
  const ctx = baseCtx();
  const { target } = tTarget(ctx);
  const c1 = collector();
  const code1 = reclaimMain(["--dry-run", target], { ...ctx, print: c1.print });
  assert.equal(code1, 0);
  assert.match(c1.lines[0], /^would-remove T /);
  assert.ok(fs.existsSync(target));

  const c2 = collector();
  const code2 = reclaimMain([target], { ...ctx, print: c2.print });
  assert.equal(code2, 0);
  assert.match(c2.lines[0], /^removed T /);
  assert.ok(!fs.existsSync(target));
});

test("T: whole delegation-<name>-XXXX directory removes as one unit", () => {
  const ctx = baseCtx();
  const { top } = tTarget(ctx);
  const c = collector();
  const code = reclaimMain([top], { ...ctx, print: c.print });
  assert.equal(code, 0);
  assert.ok(!fs.existsSync(top));
});

test("T: a top dir not prefixed delegation- is refused", () => {
  const ctx = baseCtx();
  const { target } = tTarget(ctx, { name: "not-delegation-foo" });
  const c = collector();
  const code = reclaimMain([target], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /delegation-<name>-XXXX/);
});

test("T: owned by another uid is refused (no root required - inject ctx.uid)", () => {
  const ctx = baseCtx();
  const { target } = tTarget(ctx);
  const forged = { ...ctx, uid: ctx.uid + 1 };
  const c = collector();
  const code = reclaimMain([target], { ...forged, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /not owned by the current user/);
});

// ---------- F3: mount-crossing / linked-worktree walk ----------

test("F3: a nested linked-worktree .git FILE inside a T dir is refused", () => {
  const ctx = baseCtx();
  const { target } = tTarget(ctx);
  const sub = mkdir(path.join(target, "sub"));
  fs.writeFileSync(path.join(sub, ".git"), "gitdir: /elsewhere/.git/worktrees/sub\n");
  const c = collector();
  const code = reclaimMain([target], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /linked worktree's \.git file/);
  assert.ok(fs.existsSync(target));
});

test("F3: a nested repo with a non-empty worktrees/ subdir is refused", () => {
  const ctx = baseCtx();
  const { target } = tTarget(ctx);
  const sub = mkdir(path.join(target, "sub"));
  mkdir(path.join(sub, ".git", "worktrees", "other"));
  const c = collector();
  const code = reclaimMain([target], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /linked worktrees elsewhere/);
  assert.ok(fs.existsSync(target));
});

// ---------- repoRoots (C1's repoRoots wired through S/T) ----------

test("T dir containing a path from the cwd's own git worktree list is refused", () => {
  // The main repo root lives INSIDE the T target; cwd is a second, linked worktree of that same
  // repo living OUTSIDE the T target - so F8's own "equals/contains cwd" rule (a stronger, earlier
  // check) never fires here, and it's repoRoots' own "contains" rule being exercised instead.
  const ctx = baseCtx();
  const top = mkdir(path.join(ctx.posixVarTmpRoot, "delegation-holder-1"));
  fs.chmodSync(top, 0o700);
  const repo = path.join(top, "repo");
  mkdir(repo);
  git(["init", "-q", "-b", "main"], repo);
  fs.writeFileSync(path.join(repo, "README.md"), "x\n");
  git(["add", "."], repo);
  git(["commit", "-q", "-m", "init"], repo);
  git(["branch", "side"], repo);
  const cwdWt = mkTmp("reclaim-cwdwt-");
  fs.rmdirSync(cwdWt);
  git(["worktree", "add", cwdWt, "side"], repo);
  const forged = { ...ctx, cwd: cwdWt };
  const c = collector();
  const code = reclaimMain([top], { ...forged, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /contains/);
  assert.ok(fs.existsSync(top));
});

// ---------- symlink refusal ----------

test("a symlink target is refused, never followed", () => {
  const ctx = baseCtx();
  const { top } = tTarget(ctx, { rest: null });
  const elsewhere = mkTmp("reclaim-elsewhere-");
  const link = path.join(top, "reallink");
  fs.symlinkSync(elsewhere, link);
  const c = collector();
  const code = reclaimMain([link], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /symlink/);
  assert.ok(fs.existsSync(elsewhere));
});

// ---------- HOME refusal ----------

test("a target equal to HOME is refused", () => {
  const roots = mkScratchRoots();
  const homeAsT = mkdir(path.join(roots.varTmpRoot, "delegation-home-1"));
  fs.chmodSync(homeAsT, 0o700);
  const cwd = mkTmp("reclaim-cwd-");
  const ctx = {
    cwd,
    home: homeAsT,
    platform: "linux",
    uid: process.getuid(),
    tmpdir: roots.tmpRoot,
    posixTmpRoot: roots.tmpRoot,
    posixVarTmpRoot: roots.varTmpRoot,
    sessionId: "sess-1",
    now: new Date(),
    fsImpl: fs,
  };
  const c = collector();
  const code = reclaimMain([homeAsT], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /is the home directory/);
});

// ---------- absent targets ----------

test("an absent target does not block other arguments and does not fail the run", () => {
  const ctx = baseCtx();
  const { target } = tTarget(ctx);
  const missing = path.join(ctx.posixVarTmpRoot, "delegation-missing-1");
  const c = collector();
  const code = reclaimMain([missing, target], { ...ctx, print: c.print });
  assert.equal(code, 0);
  assert.ok(c.lines.some((l) => l.startsWith(`absent ${missing}`)));
  assert.ok(c.lines.some((l) => l.startsWith("removed T")));
  assert.ok(!fs.existsSync(target));
});

// ---------- one refusal among many removes nothing ----------

test("one refusal among many arguments removes nothing at all", () => {
  const ctx = baseCtx();
  const { target: good } = tTarget(ctx, { name: "delegation-good-1" });
  const { target: bad } = tTarget(ctx, { name: "not-delegation-bad" });
  const c = collector();
  const code = reclaimMain([good, bad], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.ok(fs.existsSync(good));
  assert.ok(fs.existsSync(bad));
});

// ---------- class W ----------

test("W: happy path - dry-run prints without removing, live removes via applySafe (F1 idle floor cleared)", () => {
  const { repo } = initRepo();
  const wt = addMergedWorktree(repo, "feature-a");
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: ADVANCED });

  const c1 = collector();
  const code1 = reclaimMain(["--dry-run", wt], { ...ctx, print: c1.print });
  assert.equal(code1, 0);
  assert.match(c1.lines[0], /^would-remove W /);
  assert.ok(fs.existsSync(wt));

  const c2 = collector();
  const code2 = reclaimMain([wt], { ...ctx, print: c2.print });
  assert.equal(code2, 0);
  assert.match(c2.lines[0], /^removed W /);
  assert.ok(!fs.existsSync(wt));
});

test("W: refused when younger than the classify-level age floor (real now)", () => {
  const { repo } = initRepo();
  const wt = addMergedWorktree(repo, "feature-a");
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: new Date() });
  const c = collector();
  const code = reclaimMain([wt], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /younger than the age floor|not SAFE/);
  assert.ok(fs.existsSync(wt));
});

test("W: F1 - SAFE but not yet idle 24h is refused distinctly from the age floor", () => {
  const { repo } = initRepo();
  const wt = addMergedWorktree(repo, "feature-a");
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: MID });
  const c = collector();
  const code = reclaimMain([wt], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /active in last 24h/);
  assert.ok(fs.existsSync(wt));
});

test("W: a dirty worktree is refused, never removed", () => {
  const { repo } = initRepo();
  const wt = addMergedWorktree(repo, "feature-a");
  fs.writeFileSync(path.join(wt, "uncommitted.txt"), "dirty\n");
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: ADVANCED });
  const c = collector();
  const code = reclaimMain([wt], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.ok(c.lines[0].startsWith(`refused ${wt}:`));
  assert.ok(fs.existsSync(wt));
});

test("W: the main worktree itself is refused", () => {
  const { repo } = initRepo();
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: ADVANCED });
  const c = collector();
  const code = reclaimMain([repo], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /is the main worktree/);
});

// ---------- class B ----------

test("B: happy path removes a SAFE, merged local branch", () => {
  const { repo } = initRepo();
  const wt = addMergedWorktree(repo, "feature-b");
  git(["worktree", "remove", wt], repo);
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: ADVANCED });

  const c1 = collector();
  const code1 = reclaimMain(["--dry-run", "--branch", "feature-b", "--repo", repo], { ...ctx, print: c1.print });
  assert.equal(code1, 0);
  assert.match(c1.lines[0], /^would-remove B feature-b/);
  assert.equal(git(["branch", "--list", "feature-b"], repo).trim(), "feature-b");

  const c2 = collector();
  const code2 = reclaimMain(["--branch", "feature-b", "--repo", repo], { ...ctx, print: c2.print });
  assert.equal(code2, 0);
  assert.match(c2.lines[0], /^removed B feature-b/);
  assert.equal(git(["branch", "--list", "feature-b"], repo).trim(), "");
});

test("B: an unmerged branch is refused, never deleted", () => {
  const { repo } = initRepo();
  git(["branch", "feature-c"], repo);
  const wt = path.join(path.dirname(repo), "wt-feature-c");
  git(["worktree", "add", wt, "feature-c"], repo);
  fs.writeFileSync(path.join(wt, "y.txt"), "unmerged\n");
  git(["add", "."], wt);
  git(["commit", "-q", "-m", "unmerged work"], wt);
  git(["worktree", "remove", wt], repo);
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: ADVANCED });
  const c = collector();
  const code = reclaimMain(["--branch", "feature-c", "--repo", repo], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.ok(c.lines[0].startsWith("refused feature-c:"));
  assert.equal(git(["branch", "--list", "feature-c"], repo).trim(), "feature-c");
});

test("B: --repo not a git repository is refused", () => {
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: ADVANCED });
  const notRepo = mkTmp("reclaim-notrepo-");
  const c = collector();
  const code = reclaimMain(["--branch", "anything", "--repo", notRepo], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /not a git repository/);
});

// ---------- unrecognized ----------

test("a path that is neither S, T, nor a live worktree is refused", () => {
  const ctx = baseCtx();
  const stray = mkTmp("reclaim-stray-");
  const c = collector();
  const code = reclaimMain([stray], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /unrecognized/);
});
