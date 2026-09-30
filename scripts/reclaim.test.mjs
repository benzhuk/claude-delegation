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

import { main as reclaimMain, checkS, checkT } from "./reclaim.mjs";
import { childEnv } from "../skills/multi/scripts/test-child-env.mjs";

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
    // win32 has no process.getuid() at all - guarded here (matching reclaim.mjs's own opts.uid
    // default) so every test below can construct a ctx without crashing on win32; the POSIX-shaped
    // tests that actually depend on uid ownership carry their own win32 skip (see below).
    uid: typeof process.getuid === "function" ? process.getuid() : 0,
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

/** A real win32 context, built the same way LOW5's does: T's win32 root is always
 * <home>\AppData\Local\Temp, so that's what gets built here, with a real reparse-free directory
 * tree under it. Only meaningful on an actual win32 host - `pImpl()` in reclaim.mjs forces
 * `path.win32` string arithmetic for `ctx.platform === "win32"`, which only lines up with the
 * REAL on-disk paths mkTmp()/path.join() produce when the host's own `path` module is win32's,
 * i.e. on a real Windows machine. */
function win32Ctx(overrides = {}) {
  const home = mkTmp("reclaim-home32-");
  const tmpdir = mkdir(path.join(home, "AppData", "Local", "Temp"));
  const cwd = mkTmp("reclaim-cwd32-");
  return {
    cwd,
    home,
    platform: "win32",
    uid: 0,
    tmpdir,
    posixTmpRoot: "/tmp",
    posixVarTmpRoot: "/var/tmp",
    sessionId: "sess-1",
    now: new Date(),
    fsImpl: fs,
    print: () => {},
    ...overrides,
  };
}

const NO_WIN32_HOST = "no win32 host is available in this environment - this runs (and must be "
  + "read) on a real Windows machine: reclaim.mjs's pImpl() forces path.win32 arithmetic for a "
  + "win32 ctx, which only lines up with real on-disk paths when the host itself is win32.";

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

// argv parsing rejects before ctx.platform is ever consulted (parseArgv runs before any path
// resolution), so these run against a real win32 ctx (per the Windows gate's brief) rather than
// baseCtx()'s POSIX fixture - and pass on both hosts either way.
test("no path given: exit 2, usage error to stderr not stdout", () => {
  const c = collector();
  const code = reclaimMain([], { ...win32Ctx(), print: c.print });
  assert.equal(code, 2);
  assert.deepEqual(c.lines, []);
});

test("unknown flag: exit 2", () => {
  const c = collector();
  const code = reclaimMain(["--bogus"], { ...win32Ctx(), print: c.print });
  assert.equal(code, 2);
});

test("--branch without --repo: exit 2", () => {
  const c = collector();
  const code = reclaimMain(["--branch", "foo"], { ...win32Ctx(), print: c.print });
  assert.equal(code, 2);
});

test("--branch combined with a path: exit 2", () => {
  const c = collector();
  const code = reclaimMain(["--branch", "foo", "--repo", "/tmp", "/tmp/x"], { ...win32Ctx(), print: c.print });
  assert.equal(code, 2);
});

// ---------- F14 kill switch ----------

test("F14: kill switch refuses every argument, exit 3, nothing removed", () => {
  // Round-2 review, LOW 9: `switchedOffImpl: () => true` (ignoring its argument entirely) stayed
  // green even after mutating the call site from `switchedOffImpl("reclaim")` to
  // `switchedOffImpl("janitor-act")` - the test never actually checked WHICH switch name reclaim
  // asks about. Injecting a name-sensitive stub makes that mutation fail loudly instead.
  // The kill switch fires before any path resolution, so this runs against a real win32 ctx too.
  const ctx = win32Ctx({ switchedOffImpl: (name) => name === "reclaim" });
  const target = path.join(ctx.tmpdir, `claude-${ctx.uid}`, "proj", ctx.sessionId, "scratchpad", "x");
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

test("T: happy path removes with fs, dry-run removes nothing (win32 host)", { skip: process.platform !== "win32" ? NO_WIN32_HOST : false }, () => {
  // T's win32 root is <home>\AppData\Local\Temp (win32Ctx() builds exactly that) - a real win32
  // context is required here, not baseCtx()'s POSIX fixture, per the Windows gate's brief.
  const ctx = win32Ctx();
  const top = mkdir(path.join(ctx.tmpdir, "delegation-foo-XXXX"));
  const target = mkdir(path.join(top, "data"));
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

test("F3: a nested linked-worktree .git FILE inside a T dir is refused (win32 host)", { skip: process.platform !== "win32" ? NO_WIN32_HOST : false }, () => {
  const ctx = win32Ctx();
  const top = mkdir(path.join(ctx.tmpdir, "delegation-foo-XXXX"));
  const target = mkdir(path.join(top, "data"));
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
  // Round-2 review, MEDIUM 8: a loose /contains/ match here passed even with reclaim's own
  // repoRoots wiring deleted (mutation M1 replacing it with `[]`) - the F3 downward walk's OWN
  // "contains a repo with linked worktrees elsewhere" message also matches /contains/, so the test
  // never actually exercised repoRoots at all. Tightened to the exact reason text repoRoots
  // produces, so it goes red the moment that wiring is cut.
  assert.match(c.lines[0], /contains a path in git worktree list/);
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

// ---------- HIGH 1: upward containment walk (round-2 review) ----------

test("HIGH1: a target INSIDE a linked worktree living inside a T dir is refused, even with cwd outside the worktree's repo", () => {
  // Mirrors probe1's layout: repo R lives OUTSIDE the T root; a linked worktree of R lives INSIDE
  // a T dir, holding uncommitted work; cwd is a third, unrelated directory. Before HIGH 1, F3's
  // walk only looked BELOW the argument, and repoRoots only sees the CWD's own repo - so a target
  // strictly inside the worktree (not the worktree's own root) matched neither and fell through to
  // a bare fs delete.
  const { repo } = initRepo();
  git(["branch", "lane-work"], repo);
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-") }); // cwd has nothing to do with `repo`
  const top = mkdir(path.join(ctx.posixVarTmpRoot, "delegation-lane-1"));
  fs.chmodSync(top, 0o700);
  const wt = path.join(top, "wt");
  git(["worktree", "add", wt, "lane-work"], repo);
  const srcDir = mkdir(path.join(wt, "src"));
  fs.writeFileSync(path.join(srcDir, "a.txt"), "uncommitted\n");
  fs.writeFileSync(path.join(wt, "new.txt"), "also uncommitted\n");

  // `wt` itself is a registered worktree root, so W's own claim (git worktree list) reaches it
  // FIRST - this HIGH 1 fix is specifically about a target STRICTLY INSIDE it, which W never
  // claims (claimW only matches an exact worktree root) and which used to fall through to a bare
  // fs delete instead of being caught at all.
  const c1 = collector();
  const code1 = reclaimMain([srcDir], { ...ctx, print: c1.print });
  assert.equal(code1, 3);
  assert.match(c1.lines[0], /linked worktree/);
  assert.ok(fs.existsSync(path.join(srcDir, "a.txt")));

  const c2 = collector();
  const code2 = reclaimMain([path.join(wt, "new.txt")], { ...ctx, print: c2.print });
  assert.equal(code2, 3);
  assert.match(c2.lines[0], /linked worktree/);
  assert.ok(fs.existsSync(path.join(wt, "new.txt")), "uncommitted work must survive");
});

test("HIGH1 (re-review finding 1): a plain repo's own main checkout, with NO other linked worktrees, is refused too - ruling r2's 'any .git entry' rule, not only 'has other linked worktrees'", () => {
  // Round-1's fix narrowed ruling r2's "refuse on any .git file or directory above the target" to
  // "refuse a .git DIR only when its worktrees/ is non-empty" - so a plain repo's own checkout,
  // with no linked worktrees at all, fell through to a bare fs delete even though its tracked and
  // untracked files are exactly as live as a linked worktree's.
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-") });
  const top = mkdir(path.join(ctx.posixVarTmpRoot, "delegation-plain-1"));
  fs.chmodSync(top, 0o700);
  const repo = mkdir(path.join(top, "r"));
  git(["init", "-q", "-b", "main"], repo);
  fs.writeFileSync(path.join(repo, "README.md"), "root\n");
  const srcDir = mkdir(path.join(repo, "src"));
  fs.writeFileSync(path.join(srcDir, "a.txt"), "tracked\n");
  git(["add", "."], repo);
  git(["commit", "-q", "-m", "init"], repo);
  fs.appendFileSync(path.join(srcDir, "a.txt"), "modified\n"); // ` M src/a.txt`
  fs.writeFileSync(path.join(srcDir, "new.txt"), "untracked\n"); // `?? src/new.txt`

  for (const target of [srcDir, path.join(srcDir, "new.txt"), path.join(repo, ".git", "objects")]) {
    const c = collector();
    const code = reclaimMain([target], { ...ctx, print: c.print });
    assert.equal(code, 3, `target ${target} must be refused`);
    assert.match(c.lines[0], /lies inside a git checkout at/);
  }
  assert.ok(fs.existsSync(path.join(srcDir, "a.txt")));
  assert.ok(fs.existsSync(path.join(srcDir, "new.txt")));
});

test("HIGH1: a plain repo's own main checkout is refused too - ancestor .git refusal (win32 host)", { skip: process.platform !== "win32" ? NO_WIN32_HOST : false }, () => {
  const ctx = win32Ctx({ cwd: mkTmp("reclaim-cwd32-") });
  const top = mkdir(path.join(ctx.tmpdir, "delegation-plain-1"));
  const repo = mkdir(path.join(top, "r"));
  git(["init", "-q", "-b", "main"], repo);
  fs.writeFileSync(path.join(repo, "README.md"), "root\n");
  const srcDir = mkdir(path.join(repo, "src"));
  fs.writeFileSync(path.join(srcDir, "a.txt"), "tracked\n");
  git(["add", "."], repo);
  git(["commit", "-q", "-m", "init"], repo);
  fs.appendFileSync(path.join(srcDir, "a.txt"), "modified\n");
  fs.writeFileSync(path.join(srcDir, "new.txt"), "untracked\n");

  for (const target of [srcDir, path.join(srcDir, "new.txt"), path.join(repo, ".git", "objects")]) {
    const c = collector();
    const code = reclaimMain([target], { ...ctx, print: c.print });
    assert.equal(code, 3, `target ${target} must be refused`);
    assert.match(c.lines[0], /lies inside a git checkout at/);
  }
  assert.ok(fs.existsSync(path.join(srcDir, "a.txt")));
  assert.ok(fs.existsSync(path.join(srcDir, "new.txt")));
});

test("HIGH1 (re-review finding 1, P2b): the T top itself is the plain repo - a target inside it is still refused", () => {
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-") });
  const repo = mkdir(path.join(ctx.posixVarTmpRoot, "delegation-plain-repo-1"));
  fs.chmodSync(repo, 0o700);
  git(["init", "-q", "-b", "main"], repo);
  fs.writeFileSync(path.join(repo, "README.md"), "root\n");
  git(["add", "."], repo);
  git(["commit", "-q", "-m", "init"], repo);
  const srcDir = mkdir(path.join(repo, "src"));
  fs.writeFileSync(path.join(srcDir, "a.txt"), "untracked\n");
  const c = collector();
  const code = reclaimMain([srcDir], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /lies inside a git checkout at/);
  assert.ok(fs.existsSync(path.join(srcDir, "a.txt")));
});

test("HIGH1 (re-review finding 1, P2c): a plain repo whose .git/worktrees/ is empty (its one linked worktree already removed) is still refused", () => {
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-") });
  const top = mkdir(path.join(ctx.posixVarTmpRoot, "delegation-plain-gone-1"));
  fs.chmodSync(top, 0o700);
  const repo = mkdir(path.join(top, "r"));
  git(["init", "-q", "-b", "main"], repo);
  fs.writeFileSync(path.join(repo, "README.md"), "root\n");
  git(["add", "."], repo);
  git(["commit", "-q", "-m", "init"], repo);
  git(["branch", "side"], repo);
  const wt = mkTmp("reclaim-p2cwt-");
  fs.rmdirSync(wt);
  git(["worktree", "add", wt, "side"], repo);
  git(["worktree", "remove", wt], repo); // .git/worktrees/ exists but is empty again

  const c = collector();
  const code = reclaimMain([path.join(repo, "README.md")], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /lies inside a git checkout at/);
  assert.ok(fs.existsSync(path.join(repo, "README.md")));
});

// ---------- Round-2 re-review MEDIUM 4: mutations that survived fix round 1's own proof set ----------

test("H1d (mutation-provable): an unreadable ancestor .git entry refuses, rather than being treated as absent", () => {
  const ctx = baseCtx();
  const { target } = tTarget(ctx, { rest: "sub" });
  const dotGit = path.join(path.dirname(target), ".git");
  const fsImpl = Object.create(fs);
  fsImpl.lstatSync = (p) => {
    if (path.resolve(p) === path.resolve(dotGit)) {
      const err = new Error("boom");
      err.code = "EACCES";
      throw err;
    }
    return fs.lstatSync(p);
  };
  const c = collector();
  const code = reclaimMain([target], { ...ctx, fsImpl, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /could not stat/);
  assert.ok(fs.existsSync(target));
});

// ---------- HIGH 2: mount-point/bind-mount refusal (round-2 review) ----------

test("HIGH2 (re-review finding 2): a bare repo backing a live linked worktree with an unpushed commit is refused, and so is anything inside it", () => {
  // P3's exact layout: a bare clone inside a T dir, with a linked worktree ELSEWHERE holding a
  // commit that was never pushed anywhere else - the bare repo is the only copy of that commit.
  const { repo, origin } = initRepo();
  void origin;
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-") });
  const top = mkdir(path.join(ctx.posixVarTmpRoot, "delegation-bare-1"));
  fs.chmodSync(top, 0o700);
  const bareRepo = path.join(top, "b.git");
  git(["clone", "-q", "--bare", repo, bareRepo], undefined);
  const bareWt = mkTmp("reclaim-barewt-");
  fs.rmdirSync(bareWt);
  git(["worktree", "add", bareWt, "main"], bareRepo);
  fs.writeFileSync(path.join(bareWt, "unpushed.txt"), "only copy\n");
  git(["add", "."], bareWt);
  git(["commit", "-q", "-m", "unpushed work"], bareWt);

  const c1 = collector();
  const code1 = reclaimMain([top], { ...ctx, print: c1.print });
  assert.equal(code1, 3);
  assert.match(c1.lines[0], /contains a repo with linked worktrees elsewhere at/);
  assert.ok(fs.existsSync(bareRepo));

  const c2 = collector();
  const code2 = reclaimMain([path.join(bareRepo, "objects")], { ...ctx, print: c2.print });
  assert.equal(code2, 3);
  assert.match(c2.lines[0], /lies inside a git directory at/);
  assert.ok(fs.existsSync(path.join(bareRepo, "objects")));
});

test("HIGH2: a bare repo backing a live linked worktree with an unpushed commit is refused (win32 host)", { skip: process.platform !== "win32" ? NO_WIN32_HOST : false }, () => {
  const { repo, origin } = initRepo();
  void origin;
  const ctx = win32Ctx({ cwd: mkTmp("reclaim-cwd32-") });
  const top = mkdir(path.join(ctx.tmpdir, "delegation-bare-1"));
  const bareRepo = path.join(top, "b.git");
  git(["clone", "-q", "--bare", repo, bareRepo], undefined);
  const bareWt = mkTmp("reclaim-barewt32-");
  fs.rmdirSync(bareWt);
  git(["worktree", "add", bareWt, "main"], bareRepo);
  fs.writeFileSync(path.join(bareWt, "unpushed.txt"), "only copy\n");
  git(["add", "."], bareWt);
  git(["commit", "-q", "-m", "unpushed work"], bareWt);

  const c1 = collector();
  const code1 = reclaimMain([top], { ...ctx, print: c1.print });
  assert.equal(code1, 3);
  assert.match(c1.lines[0], /contains a repo with linked worktrees elsewhere at/);
  assert.ok(fs.existsSync(bareRepo));

  const c2 = collector();
  const code2 = reclaimMain([path.join(bareRepo, "objects")], { ...ctx, print: c2.print });
  assert.equal(code2, 3);
  assert.match(c2.lines[0], /lies inside a git directory at/);
  assert.ok(fs.existsSync(path.join(bareRepo, "objects")));
});

test("HIGH2 (re-review finding 2): a plain delegation-* dir with no git shape at all stays removable", () => {
  const ctx = baseCtx();
  const { target } = tTarget(ctx, { rest: "data" });
  fs.writeFileSync(path.join(target, "HEAD"), "not actually a git dir\n"); // a file named HEAD alone must not trip the shape test
  const c = collector();
  const code = reclaimMain([target], { ...ctx, print: c.print });
  assert.equal(code, 0);
  assert.match(c.lines[0], /^removed T /);
  assert.ok(!fs.existsSync(target));
});

test("HIGH2: the class-root st_dev baseline catches a target that is ITSELF a differently-mounted directory (mutation M5b-provable: the fix's own baseDev change)", () => {
  // Regression for the exact redteam measurement: a tmpfs mounted AT the T target itself always
  // matched its own children under the OLD baseline (the target's own st_dev), because every
  // descendant is naturally on the SAME device as the target. The fix compares against the CLASS
  // ROOT's st_dev instead. Simulated with an injected fsImpl (no real mount needed) so this is
  // deterministic and portable - the real end-to-end case is covered separately with `unshare -rm`.
  //
  // Round-2 re-review MEDIUM 4: the fake device must cover `top` AND every descendant, not just
  // `top` itself - otherwise `inner` still differs from the (mutated) baseDev under the OLD
  // baseline too, and mutation M5b (reverting the fix back to `baseDev = lstatSync(target).dev`)
  // stayed green even though the fix it targets was gone. The mount table is also forced empty, so
  // part 2 (checkMountsUnderClassRoot) cannot mask a wrong answer from part 1.
  const ctx = baseCtx();
  const { top, target } = tTarget(ctx, { rest: "inner" });
  const realLstat = fs.lstatSync.bind(fs);
  const fsImpl = Object.create(fs);
  const topResolved = path.resolve(top);
  fsImpl.lstatSync = (p) => {
    const st = realLstat(p);
    const resolvedP = path.resolve(p);
    if (resolvedP === topResolved || resolvedP.startsWith(topResolved + path.sep)) {
      // Pretend `top` AND everything under it sits on a different device than the class root - the
      // exact shape of "a tmpfs mounted AT the target".
      return Object.assign(Object.create(Object.getPrototypeOf(st)), st, { dev: 999999 });
    }
    return st;
  };
  fsImpl.readFileSync = (p, enc) => (p === "/proc/self/mountinfo" ? "" : fs.readFileSync(p, enc));
  const c = collector();
  const code = reclaimMain([top], { ...ctx, fsImpl, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /crosses a mount point/);
  assert.ok(fs.existsSync(target));
});

test("HIGH2: a same-filesystem bind mount (st_dev identical) is refused via the mount table (injected mountinfo)", () => {
  // st_dev cannot see this at all - the real hazard the redteam measured with `unshare -rm`: a
  // bind mount of an unrelated directory landing exactly on a T target, on the SAME device.
  const ctx = baseCtx({ platform: "linux" });
  const { top, target } = tTarget(ctx, { rest: "inner" });
  const mountinfoText = [
    "23 30 0:20 / /sys rw,nosuid,nodev,noexec,relatime - sysfs sysfs rw",
    `24 30 254:4 /elsewhere ${top} rw,relatime - ext4 /dev/root rw`,
    "",
  ].join("\n");
  const fsImpl = Object.create(fs);
  fsImpl.readFileSync = (p, enc) => {
    if (p === "/proc/self/mountinfo") return mountinfoText;
    return fs.readFileSync(p, enc);
  };
  const c = collector();
  const code = reclaimMain([top], { ...ctx, fsImpl, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /mount point|bind mount/);
  assert.ok(fs.existsSync(target));
});

test("HIGH2: an unreadable mount table fails closed (refused), never silently passes", () => {
  const ctx = baseCtx({ platform: "linux" });
  const { top } = tTarget(ctx);
  const fsImpl = Object.create(fs);
  fsImpl.readFileSync = (p, enc) => {
    if (p === "/proc/self/mountinfo") {
      const err = new Error("boom");
      err.code = "EACCES";
      throw err;
    }
    return fs.readFileSync(p, enc);
  };
  const c = collector();
  const code = reclaimMain([top], { ...ctx, fsImpl, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /mount table/);
});

test("H2c (mutation-provable): a target lying under an ANCESTOR bind mount is refused as 'lies under a bind mount', not just 'crosses'", () => {
  // Round-2 re-review MEDIUM 4: the existing injected-mountinfo test above only ever exercises the
  // "target IS/CONTAINS a mount point" branches (mount registered AT top, target == top) - never
  // the "target LIES UNDER a mount registered on one of its own ancestors" branch, so disabling
  // that branch alone left the suite green.
  const ctx = baseCtx({ platform: "linux" });
  const { top, target } = tTarget(ctx, { rest: "inner" });
  const mountinfoText = [
    "23 30 0:20 / /sys rw,nosuid,nodev,noexec,relatime - sysfs sysfs rw",
    `24 30 254:4 /elsewhere ${top} rw,relatime - ext4 /dev/root rw`,
    "",
  ].join("\n");
  const fsImpl = Object.create(fs);
  fsImpl.readFileSync = (p, enc) => {
    if (p === "/proc/self/mountinfo") return mountinfoText;
    return fs.readFileSync(p, enc);
  };
  const c = collector();
  const code = reclaimMain([target], { ...ctx, fsImpl, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /lies under a bind mount/);
  assert.ok(fs.existsSync(target));
});

test("HIGH2 (measured, unshare -rm): a real same-device bind mount landing on a T target is refused and the sentinel survives", { skip: (() => {
  try {
    execFileSync("unshare", ["-rm", "true"], { stdio: "ignore" });
    return false;
  } catch {
    return "unshare -rm is not available in this environment";
  }
})() }, () => {
  const ctx = baseCtx({ platform: "linux" });
  const { top } = tTarget(ctx, { rest: null });
  const sentinel = mkTmp("reclaim-sentinel-");
  fs.writeFileSync(path.join(sentinel, "keep.txt"), "keep me\n");
  const bindPoint = path.join(top, "bound");
  mkdir(bindPoint);
  const script = path.join(mkTmp("reclaim-script-"), "run.mjs");
  const outFile = path.join(path.dirname(script), "out.json");
  // `unshare -r` maps the real, outside uid to uid 0 INSIDE the new user namespace - every file
  // this fixture owns appears owned by uid 0 from in here, so the ownership check must be compared
  // against `process.getuid()` AS SEEN INSIDE the namespace, not the outside ctx.uid captured
  // before unshare ran.
  fs.writeFileSync(script, `
    import { main } from "file://${path.resolve("./scripts/reclaim.mjs")}";
    import fs from "node:fs";
    const lines = [];
    const code = main([${JSON.stringify(top)}], {
      cwd: ${JSON.stringify(ctx.cwd)},
      home: ${JSON.stringify(ctx.home)},
      platform: "linux",
      uid: process.getuid(),
      tmpdir: ${JSON.stringify(ctx.tmpdir)},
      posixTmpRoot: ${JSON.stringify(ctx.posixTmpRoot)},
      posixVarTmpRoot: ${JSON.stringify(ctx.posixVarTmpRoot)},
      sessionId: ${JSON.stringify(ctx.sessionId)},
      print: (l) => lines.push(l),
    });
    fs.writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({ code, lines }));
  `);
  // N2 (skills/multi/scripts/hooks.test.mjs): this call's own text names `node` literally, so it
  // must carry its own sealed env rather than inherit the runner's (its messaging socket/token).
  execFileSync("unshare", ["-rm", "bash", "-c",
    `mount --bind '${sentinel}' '${bindPoint}' && node '${script}'`], { stdio: "inherit", env: childEnv(ctx.home) });
  const out = JSON.parse(fs.readFileSync(outFile, "utf8"));
  assert.equal(out.code, 3);
  assert.ok(out.lines.some((l) => /mount point|bind mount/.test(l)));
  assert.ok(fs.existsSync(path.join(sentinel, "keep.txt")), "the sentinel outside the bind must survive");
});

// ---------- Re-review MEDIUM 3: the ".."-prefix twin of LOW 12, in reclaim's own mount check and
// F8's cwd check (both fail toward ALLOW) ----------

test("re-review MEDIUM3 (mount check): a same-filesystem bind mount at a dir literally named '..m' is still refused, not misread as an escape", () => {
  const ctx = baseCtx({ platform: "linux" });
  const { top } = tTarget(ctx, { rest: null });
  const mountPoint = path.join(top, "..m");
  fs.mkdirSync(mountPoint);
  const mountinfoText = [
    "23 30 0:20 / /sys rw,nosuid,nodev,noexec,relatime - sysfs sysfs rw",
    `24 30 254:4 /elsewhere ${mountPoint} rw,relatime - ext4 /dev/root rw`,
    "",
  ].join("\n");
  const fsImpl = Object.create(fs);
  fsImpl.readFileSync = (p, enc) => {
    if (p === "/proc/self/mountinfo") return mountinfoText;
    return fs.readFileSync(p, enc);
  };
  const c = collector();
  const code = reclaimMain([top], { ...ctx, fsImpl, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /crosses a mount point/);
});

test("re-review MEDIUM3 (F8 cwd check): a cwd of '<top>/..work' still refuses <top>, not misread as escaping it", () => {
  const ctx = baseCtx();
  const { top } = tTarget(ctx, { rest: null });
  const cwdDir = path.join(top, "..work");
  fs.mkdirSync(cwdDir);
  const forged = { ...ctx, cwd: cwdDir };
  const c = collector();
  const code = reclaimMain([top], { ...forged, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /equals process\.cwd\(\) or contains it/);
});

// ---------- MEDIUM 3: an rmSync failure must not crash the process (round-2 review) ----------

test("MEDIUM3: an rmSync failure prints a failed line and does not crash; later arguments still run", () => {
  const ctx = baseCtx();
  const { target: bad } = tTarget(ctx, { name: "delegation-bad-1" });
  const { target: good } = tTarget(ctx, { name: "delegation-good-1" });
  const fsImpl = Object.create(fs);
  fsImpl.rmSync = (p, opts2) => {
    if (path.resolve(p) === path.resolve(bad)) {
      const err = new Error("boom");
      err.code = "EACCES";
      throw err;
    }
    return fs.rmSync(p, opts2);
  };
  const c = collector();
  const code = reclaimMain([bad, good], { ...ctx, fsImpl, print: c.print });
  assert.equal(code, 1);
  assert.ok(c.lines.some((l) => /^failed T .*EACCES/.test(l)));
  assert.ok(c.lines.some((l) => l.startsWith("removed T")));
  assert.ok(!fs.existsSync(good));
});

// ---------- MEDIUM 4: B refuses a branch checked out anywhere (round-2 review) ----------

test("MEDIUM4: B refuses a merged branch still checked out in a SAFE worktree; dry-run says so too, not would-remove", () => {
  const { repo } = initRepo();
  const wt = addMergedWorktree(repo, "feature-live");
  // feature-live is SAFE (classify() marks a branch SAFE even while its worktree is also SAFE,
  // expecting the worktree to be removed first) but is NOT removed here - the worktree stays.
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: ADVANCED });

  const c1 = collector();
  const code1 = reclaimMain(["--dry-run", "--branch", "feature-live", "--repo", repo], { ...ctx, print: c1.print });
  assert.equal(code1, 3);
  assert.match(c1.lines[0], /checked out in worktree/);

  const c2 = collector();
  const code2 = reclaimMain(["--branch", "feature-live", "--repo", repo], { ...ctx, print: c2.print });
  assert.equal(code2, 3);
  assert.match(c2.lines[0], /checked out in worktree/);
  // `git branch --list` marks a branch checked out in ANOTHER worktree with a leading "+ ".
  assert.equal(git(["branch", "--list", "feature-live"], repo).trim(), "+ feature-live");
  assert.ok(fs.existsSync(wt));
});

// ---------- MEDIUM 5: restore hints on B and W removed/partial lines (round-2 review) ----------

test("MEDIUM5: a removed B line carries a restore hint", () => {
  const { repo } = initRepo();
  const wt = addMergedWorktree(repo, "feature-r");
  git(["worktree", "remove", wt], repo);
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: ADVANCED });
  const c = collector();
  const code = reclaimMain(["--branch", "feature-r", "--repo", repo], { ...ctx, print: c.print });
  assert.equal(code, 0);
  assert.match(c.lines[0], /^removed B feature-r [0-9a-f]{40} restore: git -C /);
});

test("MEDIUM5: a removed W line carries a restore hint", () => {
  const { repo } = initRepo();
  const wt = addMergedWorktree(repo, "feature-w");
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: ADVANCED });
  const c = collector();
  const code = reclaimMain([wt], { ...ctx, print: c.print });
  assert.equal(code, 0);
  assert.match(c.lines[0], /^removed W .* restore: git -C /);
});

test("M5c (mutation-provable): a partial W removal (git deregistered it, contents already gone) prints its own restore-hint line", () => {
  // Forcing a REAL "partial" row out of git (the final rmdir failing while the worktree is already
  // deregistered) is not reliably reproducible from a fixture - `ctx.applySafeImpl` is stubbed to
  // return exactly the `partial: true` shape janitor.mjs's own applySafe can produce for this case,
  // so this test exercises reclaim's OWN print logic for it, not applySafe's git plumbing (which
  // has its own coverage in janitor.test.mjs).
  const { repo } = initRepo();
  const wt = addMergedWorktree(repo, "feature-partial");
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: ADVANCED });
  const sha = git(["rev-parse", "HEAD"], wt).trim();
  const applySafeImpl = () => [{
    action: "worktree-remove",
    ref: wt,
    branch: "feature-partial",
    ok: false,
    partial: true,
    sha,
    restore: `git -C ${repo} worktree add ${wt} ${sha}`,
  }];
  const c = collector();
  const code = reclaimMain([wt], { ...ctx, applySafeImpl, print: c.print });
  assert.equal(code, 1);
  assert.match(c.lines[0], /^partial W .* restore: git -C /);
});

// ---------- MEDIUM 6: T works on darwin for the convention's own paths (round-2 review) ----------

test("MEDIUM6: a T argument given through a symlinked posixVarTmpRoot (darwin's own /var/tmp shape) is accepted and rmSync receives the REAL path", () => {
  const ctx = baseCtx();
  const realVarTmp = ctx.posixVarTmpRoot; // the fake "/private/var/tmp"
  const symlinkedVarTmp = path.join(mkTmp("reclaim-darwin-"), "var-tmp-link");
  fs.symlinkSync(realVarTmp, symlinkedVarTmp, "dir");
  const forged = { ...ctx, posixVarTmpRoot: symlinkedVarTmp };
  const top = mkdir(path.join(realVarTmp, "delegation-mac-1"));
  fs.chmodSync(top, 0o700);
  // The RAW argument spells the path through the symlink, exactly like `mktemp -d
  // /var/tmp/delegation-x-XXXX` would print on a host where /var/tmp is itself a symlink.
  const rawArg = path.join(symlinkedVarTmp, "delegation-mac-1");
  const c = collector();
  const code = reclaimMain([rawArg], { ...forged, print: c.print });
  assert.equal(code, 0);
  assert.match(c.lines[0], /^removed T /);
  assert.ok(!fs.existsSync(top));
});

test("MEDIUM6: a symlink ONE LEVEL BELOW the root is still refused (the rewrite never touches anything below the root)", () => {
  const ctx = baseCtx();
  const realVarTmp = ctx.posixVarTmpRoot;
  const elsewhere = mkTmp("reclaim-elsewhere-");
  const link = path.join(realVarTmp, "delegation-linked-1");
  fs.symlinkSync(elsewhere, link, "dir");
  const c = collector();
  const code = reclaimMain([link], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /symlink/);
  assert.ok(fs.existsSync(elsewhere));
});

// ---------- MEDIUM 7: missing tests the round-2 review named, each mutation-provable ----------

// This host's real `path` module is POSIX regardless of what `ctx.platform` claims, so these two
// win32 tests call `checkS` directly (exported for exactly this) with `path.win32` used to build
// the resolved argument - the same "platform/pathImpl injection" approach janitor.mjs's own
// `pathWithin` tests already use, rather than driving a win32-shaped path through the full
// `main()` pipeline (checkRemovablePath's own root-membership check is POSIX-only on this host,
// same documented, pre-existing limit as path-safety.test.mjs's own win32 test already accepts).
test("MEDIUM7 (M4-provable): a win32 claude-verify.lock sibling is never treated as S-shaped (checkS, pathImpl injection)", () => {
  const ctx = { platform: "win32", home: "C:\\Users\\me", tmpdir: "C:\\Users\\me\\AppData\\Local\\Temp", uid: 0, fsImpl: fs, sessionId: "sess-1" };
  // claude-verify.lock is a REAL sibling name (docs/concurrency-budget.md) that a loose
  // `/^claude/i` first-segment rule (mutation M4) would wrongly accept as S-shaped.
  const resolved = path.win32.resolve("C:\\Users\\me\\AppData\\Local\\Temp\\claude-verify.lock\\proj\\sess-1\\scratchpad\\x");
  const result = checkS(resolved, ctx);
  assert.equal(result, null, "not S-shaped at all - must fall through to T/W, never read as a session scratchpad");
});

test("MEDIUM7: the win32 S segment is literally `claude`, case-insensitive, and IS accepted (checkS, pathImpl injection)", () => {
  const ctx = { platform: "win32", home: "C:\\Users\\me", tmpdir: "C:\\Users\\me\\AppData\\Local\\Temp", uid: 0, fsImpl: fs, sessionId: "SeSs-1" };
  const resolved = path.win32.resolve("C:\\Users\\me\\AppData\\Local\\Temp\\Claude\\proj1\\sess-1\\scratchpad\\work");
  const result = checkS(resolved, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.root, ctx.tmpdir);
});

test("MEDIUM7: a win32 T dir is delegation-<name>-XXXX, case-insensitive (checkT, pathImpl injection)", () => {
  const ctx = { platform: "win32", home: "C:\\Users\\me", tmpdir: "C:\\Users\\me\\AppData\\Local\\Temp", uid: 0, fsImpl: { statSync: fs.statSync } };
  const resolved = path.win32.resolve("C:\\Users\\me\\AppData\\Local\\Temp\\DELEGATION-foo-XXXX\\data");
  const result = checkT(resolved, ctx);
  assert.equal(result.ok, true);
});

test("MEDIUM7: darwin S is refused with the unmeasured message when the tmpdir realpath is under /private/var/folders/", () => {
  const ctx = baseCtx({ platform: "darwin", tmpdir: "/var/folders/aa/bb" });
  const fsImpl = Object.create(fs);
  fsImpl.realpathSync = (p) => (p === ctx.tmpdir ? "/private/var/folders/aa/bb" : fs.realpathSync(p));
  // Given directly in its already-realpath'd form - MEDIUM6's own argument rewrite (posixTmpRoot /
  // posixVarTmpRoot only) is a separate concern from this darwin-unmeasured refusal.
  const c = collector();
  const code = reclaimMain(["/private/var/folders/aa/bb/claude-1/proj/sess/scratchpad/x"], { ...ctx, fsImpl, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /S class unmeasured on darwin/);
});

test("MEDIUM7 (M7-provable): a T top dir that is group- or world-writable is refused", () => {
  const ctx = baseCtx();
  const { target } = tTarget(ctx);
  const top = path.dirname(target);
  fs.chmodSync(top, 0o775);
  const c = collector();
  const code = reclaimMain([target], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /group- or world-writable/);
});

test("MEDIUM7 (M7-provable): an S claude-<uid> dir that is group- or world-writable is refused", () => {
  const ctx = baseCtx();
  const target = sTarget(ctx);
  fs.chmodSync(path.join(ctx.posixTmpRoot, `claude-${ctx.uid}`), 0o777);
  const c = collector();
  const code = reclaimMain([target], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /group- or world-writable/);
});

// ---------- LOW 10: unknown/future idle age never gets the confident "active" label (round-2 review) ----------

test("LOW10: an unreadable idle-age source gives 'idle age unknown', never 'active in last 24h'", () => {
  const { repo } = initRepo();
  const wt = addMergedWorktree(repo, "feature-nan");
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: ADVANCED, idleHoursImpl: () => NaN });
  const c = collector();
  const code = reclaimMain([wt], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /idle age unknown/);
});

test("LOW10: a negative idle age (clock running ahead) gives 'mtime in the future', never 'active in last 24h'", () => {
  const { repo } = initRepo();
  const wt = addMergedWorktree(repo, "feature-neg");
  const ctx = baseCtx({ cwd: mkTmp("reclaim-cwd-"), now: ADVANCED, idleHoursImpl: () => -5 });
  const c = collector();
  const code = reclaimMain([wt], { ...ctx, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /mtime in the future/);
});

// ---------- LOW 11: the F3 walk fails closed on an unreadable entry (round-2 review) ----------

test("LOW11: an unreadable subdirectory during the walk refuses the whole invocation, rather than silently skipping what it hides", () => {
  const ctx = baseCtx();
  const { target } = tTarget(ctx);
  const sub = mkdir(path.join(target, "sub"));
  const fsImpl = Object.create(fs);
  fsImpl.lstatSync = (p) => {
    if (path.resolve(p) === path.resolve(sub)) {
      const err = new Error("boom");
      err.code = "EACCES";
      throw err;
    }
    return fs.lstatSync(p);
  };
  const c = collector();
  const code = reclaimMain([target], { ...ctx, fsImpl, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /could not stat/);
  assert.ok(fs.existsSync(target));
});

test("L11 (mutation-provable): an unreadable subdirectory's READDIR failure refuses too, not just an lstat failure", () => {
  // The test above only ever forces an lstat error. LOW 11's own fix also fails closed on a
  // readdirSync error (a directory that lstats fine but cannot be listed) - disabling that half
  // alone left the suite green.
  const ctx = baseCtx();
  const { target } = tTarget(ctx);
  const sub = mkdir(path.join(target, "sub"));
  const fsImpl = Object.create(fs);
  fsImpl.readdirSync = (p, ...rest) => {
    if (path.resolve(p) === path.resolve(sub)) {
      const err = new Error("boom");
      err.code = "EACCES";
      throw err;
    }
    return fs.readdirSync(p, ...rest);
  };
  const c = collector();
  const code = reclaimMain([target], { ...ctx, fsImpl, print: c.print });
  assert.equal(code, 3);
  assert.match(c.lines[0], /could not read/);
  assert.ok(fs.existsSync(target));
});

// ---------- LOW 13: the check-to-delete window is re-checked immediately before rmSync (round-2 review) ----------

test("LOW13: a target that becomes a symlink between validation and removal is refused at the re-check, not removed", () => {
  const ctx = baseCtx();
  const { target } = tTarget(ctx);
  const elsewhere = mkTmp("reclaim-elsewhere-");
  const fsImpl = Object.create(fs);
  let lstatCalls = 0;
  fsImpl.lstatSync = (p) => {
    if (path.resolve(p) === path.resolve(target)) {
      lstatCalls += 1;
      // The first finishST pass (validateArg's own validation: checkRemovablePath's lstat, then
      // the walk's own lstat of the target - 2 calls total) sees a plain directory; the RE-CHECK
      // immediately before rmSync runs a second, fresh finishST pass - from its first lstat call
      // on, pretend the target has become a symlink in the gap, simulating the TOCTOU window
      // LOW 13 shrinks.
      if (lstatCalls > 2) {
        const st = fs.lstatSync(elsewhere);
        return Object.assign(Object.create(Object.getPrototypeOf(st)), st, {
          isSymbolicLink: () => true,
          isDirectory: () => false,
        });
      }
    }
    return fs.lstatSync(p);
  };
  const c = collector();
  const code = reclaimMain([target], { ...ctx, fsImpl, print: c.print });
  assert.equal(code, 1);
  assert.match(c.lines[0], /changed since validation/);
  assert.ok(fs.existsSync(target));
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

// ---------- LOW 5: Windows junction gate (round-2 review's MEDIUM 7 note, deferred to a real
// win32 host - see the re-review's LOW 5) ----------

test("LOW5 (Windows junction gate, deferred without a win32 host): a reparse-point junction inside a T dir must never let the sentinel it points at be swept up or emptied", {
  skip: process.platform !== "win32"
    ? "no win32 host is available in this environment - this runs (and must be read) on a real Windows machine, per the re-review's LOW 5: either `mklink /J` refuses the walk (a reparse point treated the same as a symlink - never followed), or reclaim removes only the junction link itself and the sentinel's own contents survive either way"
    : false,
}, () => {
  // A real win32 context: T's win32 root is <home>\AppData\Local\Temp, so build exactly that.
  const home = mkTmp("reclaim-home-");
  const tmpdir = mkdir(path.join(home, "AppData", "Local", "Temp"));
  const top = mkdir(path.join(tmpdir, "delegation-junction-XXXX"));
  const sentinel = mkTmp("reclaim-junction-sentinel-");
  fs.writeFileSync(path.join(sentinel, "keep.txt"), "keep me\n");
  const junction = path.join(top, "linked");
  execFileSync("cmd", ["/c", "mklink", "/J", junction, sentinel], { encoding: "utf8" });
  const c = collector();
  const code = reclaimMain([top], {
    cwd: mkTmp("reclaim-cwd-"), home, platform: "win32", uid: 0, tmpdir,
    posixTmpRoot: "/tmp", posixVarTmpRoot: "/var/tmp", sessionId: "sess-1", now: new Date(),
    fsImpl: fs, print: c.print,
  });
  // The sentinel's own contents must survive, whichever way reclaim resolves the junction.
  assert.ok(fs.existsSync(path.join(sentinel, "keep.txt")), "the junction's target must survive");
  if (code === 3) {
    assert.match(c.lines[0], /symlink|reparse|junction|mount/); // refused FOR the junction, not for an unrelated reason
  } else {
    assert.equal(code, 0);
    assert.match(c.lines[0], /^removed T /);
    assert.ok(!fs.existsSync(top));
  }
});
