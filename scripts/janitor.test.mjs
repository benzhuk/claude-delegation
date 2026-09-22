// node --test scripts/janitor.test.mjs
//
// Builds real throwaway git repositories under os.tmpdir() for every scenario - no mocked git.
// Every mkdtemp'd directory is tracked and removed in one `after()` hook at the bottom of this
// file (fs.rmSync, recursive, only ever on paths this file itself created under os.tmpdir()).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

import {
  main,
  gatherState,
  gitToplevel,
  listWorktrees,
  listLocalBranches,
  matchesScratchPattern,
  isTreeClean,
  isBranchOnOrigin,
  isBranchMerged,
  applySafe,
  gatherWorkarounds,
} from "./janitor.mjs";
import { loadProjectConfig } from "./project-config.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

const tracked = [];
function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}

function initRepo() {
  const dir = mkTmp("janitor-repo-");
  git(["init", "-q", "-b", "main"], dir);
  fs.writeFileSync(path.join(dir, "README.md"), "root\n");
  git(["add", "."], dir);
  git(["commit", "-q", "-m", "init"], dir);
  return dir;
}

function writeProjectConfig(root, overrides = {}) {
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".agents", "project.json"),
    JSON.stringify({ name: "janitor-test", vcs: "git", main_branch: "main", ...overrides }),
  );
}

/** Writes a `docs/work/<filename>` record file (never `git add`ed - work records are, in this
 * fixture, deliberately untracked; scratch_patterns defaults to [] in these tests so they never
 * themselves become an untrackedFiles JUDGMENT row). */
function writeWorkRecord(root, filename, lines) {
  const dir = path.join(root, "docs", "work");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), lines.join("\n"));
}

function addWorktree(root, branch, { fromBranch } = {}) {
  git(["branch", branch, ...(fromBranch ? [fromBranch] : [])], root);
  const wt = path.join(mkTmp("janitor-wt-"), branch);
  git(["worktree", "add", wt, branch], root);
  return wt;
}

function mergeIntoMain(root, branch) {
  git(["merge", "--no-ff", "-q", "-m", `merge ${branch}`, branch], root);
}

/** A bare "origin" remote, with `main` pushed - `isBranchOnOrigin` needs this ref to exist at all. */
function addOrigin(root) {
  const bare = mkTmp("janitor-origin-");
  git(["init", "-q", "--bare", "-b", "main"], bare);
  git(["remote", "add", "origin", bare], root);
  pushMain(root);
  return bare;
}

function pushMain(root) {
  git(["push", "-q", "origin", "main"], root);
}

/** Every regular file under `dir`, recursively, as sorted absolute paths - never descending into
 * `.git` (its internal bookkeeping legitimately changes as a side effect of the two SANCTIONED git
 * operations, `worktree remove` and `branch -d`; that is not a "file this tool deleted"). */
function listAllFiles(dir) {
  const out = [];
  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === ".git") continue;
      const p = path.join(d, e.name);
      if (e.isSymbolicLink() || e.isFile()) {
        out.push(p);
      } else if (e.isDirectory()) {
        walk(p);
      }
    }
  }
  walk(dir);
  return out.sort();
}

// ---------------------------------------------------------------------------
// Happy path (round 1, now with an origin remote - SAFE requires the branch tip to be confirmed
// on origin/main, so these scenarios push after merging).
// ---------------------------------------------------------------------------

test("a merged, origin-confirmed, clean worktree is SAFE; a dirty worktree is JUDGMENT regardless of merge state", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);

  const wtA = addWorktree(root, "feature-a");
  fs.writeFileSync(path.join(wtA, "a.txt"), "a\n");
  git(["add", "."], wtA);
  git(["commit", "-q", "-m", "a"], wtA);
  mergeIntoMain(root, "feature-a");
  pushMain(root); // origin/main now contains feature-a's commit

  const wtB = addWorktree(root, "feature-b");
  fs.writeFileSync(path.join(wtB, "b.txt"), "uncommitted\n"); // never committed => dirty, unmerged

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });

  const safeRefs = state.safe.worktrees.map((w) => fs.realpathSync(w.ref));
  const judgmentRefs = state.judgment.worktrees.map((w) => fs.realpathSync(w.ref));
  assert.ok(safeRefs.includes(fs.realpathSync(wtA)), "merged + clean + origin-confirmed worktree should be SAFE");
  assert.ok(judgmentRefs.includes(fs.realpathSync(wtB)), "dirty worktree should be JUDGMENT");
  assert.ok(!judgmentRefs.includes(fs.realpathSync(wtA)));
  assert.ok(!safeRefs.includes(fs.realpathSync(wtB)));

  assert.ok(state.safe.branches.some((b) => b.ref === "feature-a"));
});

test("--apply removes only the SAFE class; the dirty worktree and its branch survive untouched", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);

  const wtA = addWorktree(root, "feature-a");
  mergeIntoMain(root, "feature-a");
  pushMain(root);

  const wtB = addWorktree(root, "feature-b");
  fs.writeFileSync(path.join(wtB, "b.txt"), "uncommitted\n");

  const wtARealBefore = fs.realpathSync(wtA);
  const wtBRealBefore = fs.realpathSync(wtB);

  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(["--apply"], { cwd: root });
  } finally {
    console.log = origLog;
  }

  const toplevel = gitToplevel(root);
  // `git worktree list --porcelain` always prints forward-slash paths, even on win32; normalize
  // with path.normalize() before comparing to fs.realpathSync()'s platform-separator output.
  const worktreesAfter = listWorktrees(toplevel).map((w) => path.normalize(w.path));
  const branchesAfter = listLocalBranches(toplevel);

  assert.ok(!worktreesAfter.includes(path.normalize(wtARealBefore)), "wtA should be gone");
  assert.ok(!branchesAfter.includes("feature-a"), "merged branch should be deleted");

  assert.ok(fs.existsSync(wtB), "dirty worktree directory must survive");
  assert.ok(worktreesAfter.includes(path.normalize(wtBRealBefore)), "dirty worktree must still be a registered worktree");
  assert.ok(branchesAfter.includes("feature-b"), "unmerged branch must survive");

  assert.equal(code, 1);
});

test("the current worktree and its branch are never touched, and main is never deleted, even when merged+clean", () => {
  const root = initRepo();
  // Deliberately no .agents/project.json here: writing one would leave an untracked file in
  // root's own tree, making the (unrelated) root worktree JUDGMENT-dirty and muddying this
  // assertion. Root falls back to project-config's defaults, which already match (main_branch
  // "main"), so the scenario stays exactly "one merged+clean worktree, which is also the current one".

  const wtC = addWorktree(root, "feature-c");
  mergeIntoMain(root, "feature-c");

  const toplevel = gitToplevel(wtC);
  const before = { worktrees: listWorktrees(toplevel).length, branches: listLocalBranches(toplevel).length };

  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(["--apply"], { cwd: wtC });
  } finally {
    console.log = origLog;
  }

  const after_ = { worktrees: listWorktrees(toplevel).length, branches: listLocalBranches(toplevel).length };
  assert.deepEqual(after_, before, "nothing should have been removed - the only candidate was the current worktree/branch");
  assert.ok(listLocalBranches(toplevel).includes("main"), "main branch must still exist");
  assert.ok(listLocalBranches(toplevel).includes("feature-c"), "the current branch must still exist");
  assert.equal(code, 0);
});

test("switch file ~/.agents/ws-off-janitor makes a run with real findings a silent exit 0", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);
  addWorktree(root, "feature-d");
  mergeIntoMain(root, "feature-d");
  pushMain(root);

  const home = mkTmp("janitor-home-");
  fs.mkdirSync(path.join(home, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(home, ".agents", "ws-off-janitor"), "");

  const prevHome = process.env.HOME;
  const prevAgentsHome = process.env.AGENTS_HOME;
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  process.env.HOME = home;
  // switchedOff() reads AGENTS_HOME first and falls back to os.homedir(), which reads USERPROFILE
  // (not HOME) on win32 — set both so this sandbox actually takes effect on every platform.
  process.env.AGENTS_HOME = path.join(home, ".agents");
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    process.env.HOME = prevHome;
    if (prevAgentsHome === undefined) delete process.env.AGENTS_HOME;
    else process.env.AGENTS_HOME = prevAgentsHome;
    console.log = origLog;
  }
  assert.equal(code, 0);
  assert.deepEqual(logs, [], "the switch means the feature does nothing, including printing");
});

test("the master switch ~/.agents/ws-off also silences janitor", () => {
  const root = initRepo();
  writeProjectConfig(root);
  const home = mkTmp("janitor-home-");
  fs.mkdirSync(path.join(home, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(home, ".agents", "ws-off"), "");
  const prevHome = process.env.HOME;
  const prevAgentsHome = process.env.AGENTS_HOME;
  process.env.HOME = home;
  // switchedOff() reads AGENTS_HOME first and falls back to os.homedir(), which reads USERPROFILE
  // (not HOME) on win32 — set both so this sandbox actually takes effect on every platform.
  process.env.AGENTS_HOME = path.join(home, ".agents");
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    process.env.HOME = prevHome;
    if (prevAgentsHome === undefined) delete process.env.AGENTS_HOME;
    else process.env.AGENTS_HOME = prevAgentsHome;
  }
  assert.equal(code, 0);
});

test("vcs: none makes janitor exit 0 silently even with a dirty tree", () => {
  const root = initRepo();
  writeProjectConfig(root, { vcs: "none" });
  fs.writeFileSync(path.join(root, "dirty.txt"), "x\n");
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.equal(code, 0);
  assert.deepEqual(logs, []);
});

test("matchesScratchPattern: matches basename-only patterns anywhere, and path patterns by relative path", () => {
  assert.equal(matchesScratchPattern("tmp-foo.md", ["tmp-*.md"]), true);
  assert.equal(matchesScratchPattern("docs/tmp-foo.md", ["tmp-*.md"]), true);
  assert.equal(matchesScratchPattern("scripts/_tmp-bar.mjs", ["scripts/_tmp-*"]), true);
  assert.equal(matchesScratchPattern("lib/_tmp-bar.mjs", ["scripts/_tmp-*"]), false);
  assert.equal(matchesScratchPattern("scripts/real-file.mjs", ["scripts/_tmp-*", "tmp-*.md"]), false);
});

test("matchesScratchPattern: a literal '?' in a pattern stays literal, never a regex quantifier", () => {
  // "tmp-?.md" should match exactly "tmp-?.md", NOT "tmpX.md" (which it would if "?" leaked
  // through as an unescaped regex quantifier on the escaped ".").
  assert.equal(matchesScratchPattern("tmp-?.md", ["tmp-?.md"]), true);
  assert.equal(matchesScratchPattern("tmpX.md", ["tmp-?.md"]), false);
});

// NEW-4 (round 3 delta review): `*` -> `[^/]*` (round 2's own MINOR 14 fix) silently stopped a
// scratch-DIRECTORY pattern matching anything inside it - `git status -uall` reports files, never
// directories, so a temp run directory full of output went invisible to both janitor and
// commit-check. Every path segment and every ancestor prefix must be tried, not just the full
// relative path and the basename.
test("NEW-4: a scratch pattern that names a directory matches every file inside it, including nested paths and paths with a space", () => {
  assert.equal(matchesScratchPattern("scripts/_tmp-bar.mjs", ["scripts/_tmp-*"]), true, "round-1 case must still work");
  assert.equal(
    matchesScratchPattern("scripts/_tmp-run/out.txt", ["scripts/_tmp-*"]),
    true,
    "a file INSIDE a scratch directory must match the directory's own pattern",
  );
  assert.equal(
    matchesScratchPattern("scripts/_tmp-run/nested/deep.txt", ["scripts/_tmp-*"]),
    true,
    "arbitrarily nested content must still match",
  );
  assert.equal(
    matchesScratchPattern("scripts/_tmp run with space/out.txt", ["scripts/_tmp*"]),
    true,
    "a space in the directory name must not break the match",
  );
  assert.equal(matchesScratchPattern("tmp-foo.md", ["tmp-*.md"]), true, "basename-only patterns still work");
  assert.equal(matchesScratchPattern("docs/tmp-foo.md", ["tmp-*.md"]), true);
  assert.equal(matchesScratchPattern("scripts/real-file.mjs", ["scripts/_tmp-*"]), false, "a non-matching sibling must not match");
});

test("the four drift numbers are all present and numeric (or null for disk, if `du` is unavailable)", () => {
  const root = initRepo();
  writeProjectConfig(root);
  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.equal(typeof state.drift.worktreeCount, "number");
  assert.equal(typeof state.drift.openBranchCount, "number");
  assert.equal(typeof state.drift.untrackedFileCount, "number");
  assert.ok(state.drift.diskUsedKB === null || typeof state.drift.diskUsedKB === "number");
  assert.ok(!("registryPastEndCount" in state.drift), "the registry drift number is gone with the registry (round-1 cut)");
});

test("source never contains a destructive git verb, a force flag, or exit(2), outside comments", () => {
  const files = ["janitor.mjs"].map((f) => path.join(import.meta.dirname, f));
  const banned = ["git clean", "reset --hard", "stash", "rm -rf", "--force", "branch -D", "process.exit(2)"];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of banned) {
      assert.equal(stripped.includes(bad), false, `${file} contains forbidden "${bad}" outside comments`);
    }
  }
});

// ---------------------------------------------------------------------------
// Round 2: reviewer-reproduced BLOCKERs and MAJORs, each red-then-green.
// ---------------------------------------------------------------------------

// BLOCKER 1: --apply deletes gitignored files inside a worktree it calls "clean"
test("BLOCKER 1: a merged worktree holding a gitignored file with content is JUDGMENT, and --apply leaves both the directory and the ignored file on disk", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);
  fs.writeFileSync(path.join(root, ".gitignore"), "local-config.ini\nbuild-output/\n");
  git(["add", ".gitignore"], root);
  git(["commit", "-q", "-m", "gitignore"], root);

  const wt = addWorktree(root, "feature-ignored");
  mergeIntoMain(root, "feature-ignored");
  pushMain(root);
  // The worktree is now merged, and `git status --porcelain` (no --ignored) sees nothing - but
  // it holds real, uncommitted content that is not this tool's to destroy.
  fs.writeFileSync(path.join(wt, "local-config.ini"), "token=super-secret\n");
  fs.mkdirSync(path.join(wt, "build-output"));
  fs.writeFileSync(path.join(wt, "build-output", "artifact.bin"), "hours of compute\n");

  assert.equal(git(["status", "--porcelain"], wt).trim(), "", "sanity: plain porcelain status sees nothing");
  assert.equal(isTreeClean(wt), false, "isTreeClean must count ignored content as not-clean");

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const before = gatherState({ root: toplevel, config });
  const wtReal = fs.realpathSync(wt);
  assert.ok(
    !before.safe.worktrees.some((w) => fs.realpathSync(w.ref) === wtReal),
    "an ignored-content worktree must never be SAFE",
  );
  assert.ok(
    before.judgment.worktrees.some((w) => fs.realpathSync(w.ref) === wtReal),
    "it must be JUDGMENT instead",
  );

  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(["--apply"], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.equal(code, 1);
  assert.ok(fs.existsSync(wt), "the worktree directory must survive --apply");
  assert.ok(fs.existsSync(path.join(wt, "local-config.ini")), "the ignored file must survive --apply");
  assert.ok(fs.existsSync(path.join(wt, "build-output", "artifact.bin")), "ignored directory content must survive --apply");
});

// Round 3, orchestrator-mandated replacement for the deleted unlink feature's tests: the one
// property that actually matters now is structural, not case-by-case - a tool with no unlink code
// path cannot delete the wrong file. Snapshot every regular file's path (never descending into
// .git, whose own internal bookkeeping legitimately changes under the two sanctioned git
// operations) across a fixture that deliberately includes a SAFE worktree (the one sanctioned
// removal, as a WHOLE directory via git), a surviving dirty worktree, an in-root registry-
// referenced file, and an out-of-root registry-referenced file - both registry files overdue and
// tool-created, which in round 2 would have been unlinked.
test("SAFE-CUT: --apply never removes a regular file anywhere - only a whole worktree directory, via git worktree remove", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);

  const wtSafe = addWorktree(root, "feature-safe");
  mergeIntoMain(root, "feature-safe");
  pushMain(root);

  const wtDirty = addWorktree(root, "feature-dirty");
  fs.writeFileSync(path.join(wtDirty, "keep-me.txt"), "keep\n");

  // Everything except wtSafe (the one sanctioned removal) must be byte-for-byte the same set of
  // regular files, before and after --apply.
  const watched = [root, wtDirty];
  assert.ok(fs.existsSync(wtSafe), "sanity: the SAFE worktree exists before --apply");
  const before = watched.map((d) => listAllFiles(d));

  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(["--apply"], { cwd: root });
  } finally {
    console.log = origLog;
  }

  const after = watched.map((d) => listAllFiles(d));
  for (let i = 0; i < watched.length; i++) {
    assert.deepEqual(after[i], before[i], `the set of regular files under ${watched[i]} must be unchanged by --apply`);
  }
  assert.ok(!fs.existsSync(wtSafe), "the SAFE worktree is the one sanctioned removal - a whole directory, via git");
  assert.ok(fs.existsSync(path.join(wtDirty, "keep-me.txt")), "every file in the surviving dirty worktree survives");
  assert.equal(code, 1, "the surviving dirty worktree is still a finding");
});

// BLOCKER 4 (round 2): a throw during --apply, after something was already deleted, produced zero
// output and exit 0. Round 3 cut the unlink/registry-close code path that the original chmod-500
// reproduction depended on, so the reproduction is re-cast on the only two actions applySafe still
// has: a worktree removal racing a lock taken after classification, and a branch delete racing a
// checkout. Both are per-item try/caught (never throw past applySafe), so the guarantee to prove is
// the same one the review asked for: never silent, never exit 0, on a partial failure.
test("BLOCKER 4: a worktree that becomes locked between classification and --apply is a logged, non-silent failure, never a clean exit", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);
  const wt = addWorktree(root, "feature-race");
  mergeIntoMain(root, "feature-race");
  pushMain(root);

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.equal(state.safe.worktrees.length, 1, "sanity: the worktree classified SAFE before the race");

  // The race: something locks the worktree AFTER classification but BEFORE applySafe runs.
  git(["worktree", "lock", "--reason", "raced", wt], root);

  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  let log;
  try {
    log = applySafe(state, []);
  } finally {
    console.log = origLog;
  }
  assert.ok(log.some((l) => l.action === "worktree-remove" && l.ok === false), "the failed removal must be logged, not swallowed");
  assert.ok(fs.existsSync(wt), "the locked worktree must survive");

  git(["worktree", "unlock", wt], root); // release so our own cleanup can remove it later
});

test("BLOCKER 4b: applySafe accumulates into a caller-supplied log array, so main()'s outer catch can still report partial progress if anything ever throws past it", () => {
  // main() passes a `log` array into applySafe and, in its own try/catch around that call, prints
  // every entry already pushed before re-raising as a non-zero exit - this proves the plumbing
  // that guarantee depends on: the array IS mutated in place as applySafe runs, not just returned
  // at the end, so a throw halfway through still leaves prior entries visible to the caller.
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);
  const wt = addWorktree(root, "feature-throw");
  mergeIntoMain(root, "feature-throw");
  pushMain(root);

  const wtReal = fs.realpathSync(wt);
  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });

  const externalLog = [];
  applySafe(state, externalLog);
  assert.ok(externalLog.length > 0, "the caller-supplied array must have been mutated with real entries");
  // `l.ref` here is git's own forward-slash worktree path (from `git worktree list --porcelain`,
  // which never uses backslashes even on win32) - normalize before comparing to fs.realpathSync's
  // platform-separator form. The worktree is already removed by this point, so realpathSync(l.ref)
  // would throw ENOENT; path.normalize() needs no filesystem access.
  assert.ok(
    externalLog.some((l) => l.action === "worktree-remove" && path.normalize(l.ref) === path.normalize(wtReal)),
    `expected a worktree-remove entry for ${wtReal} in ${JSON.stringify(externalLog)}`,
  );
});

// MAJOR 5: a LOCKED worktree is classified SAFE
test("MAJOR 5: a locked worktree is JUDGMENT with its lock reason, never SAFE", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);

  const wt = addWorktree(root, "feature-locked");
  mergeIntoMain(root, "feature-locked");
  pushMain(root);
  git(["worktree", "lock", "--reason", "Ben: do not remove, long-running experiment", wt], root);

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  const wtReal = fs.realpathSync(wt);
  assert.ok(!state.safe.worktrees.some((w) => fs.realpathSync(w.ref) === wtReal), "a locked worktree is never SAFE");
  const judgmentRow = state.judgment.worktrees.find((w) => fs.realpathSync(w.ref) === wtReal);
  assert.ok(judgmentRow, "a locked worktree must be JUDGMENT");
  assert.match(judgmentRow.reason, /locked/);
  assert.match(judgmentRow.reason, /do not remove/);
});

// MAJOR 6: the main working tree is listed SAFE when run from a linked worktree
test("MAJOR 6: run from a linked worktree, the main working tree never appears in SAFE even if it happens to sit on a merged branch", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);

  // Put the MAIN checkout itself on a merged, clean branch (a realistic post-merge moment).
  git(["checkout", "-q", "-b", "feat-on-main-checkout"], root);
  fs.writeFileSync(path.join(root, "extra.txt"), "x\n");
  git(["add", "."], root);
  git(["commit", "-q", "-m", "extra"], root);
  git(["checkout", "-q", "main"], root);
  mergeIntoMain(root, "feat-on-main-checkout");
  pushMain(root);
  git(["checkout", "-q", "feat-on-main-checkout"], root); // main checkout now sits on the merged branch

  const other = addWorktree(root, "feature-other");

  const toplevel = gitToplevel(other);
  const { config } = loadProjectConfig(other);
  const state = gatherState({ root: toplevel, config });
  const rootReal = fs.realpathSync(root);
  assert.ok(
    !state.safe.worktrees.some((w) => fs.realpathSync(w.ref) === rootReal),
    "the main working tree must never appear in SAFE, from anywhere",
  );

  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(["--apply"], { cwd: other });
  } finally {
    console.log = origLog;
  }
  assert.ok(fs.existsSync(root), "the main working tree must survive --apply");
  assert.ok(fs.existsSync(path.join(root, ".git")), "the main working tree's .git must survive --apply");
  void code;
});

// MAJOR 7: merged-branch deletion has no protected-name guard
test("MAJOR 7: a branch named 'release' that points at main is JUDGMENT and survives --apply", () => {
  const root = initRepo();
  writeProjectConfig(root);
  git(["branch", "release", "main"], root);

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.ok(!state.safe.branches.some((b) => b.ref === "release"), "a protected-name branch must never be SAFE");
  assert.ok(state.judgment.branches.some((b) => b.ref === "release"), "it must be JUDGMENT instead");

  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  try {
    main(["--apply"], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.ok(listLocalBranches(gitToplevel(root)).includes("release"), "release must survive --apply");
});

// round-1 review MAJOR: a local branch literally named `origin/<main>` shadows the real
// refs/remotes/origin/<main> ref in git's own bare-name ambiguity order, making a never-pushed,
// locally-merged branch look confirmed on origin. --apply then deleted both its worktree and its
// ref, leaving the commits reachable only via a local main that could itself be reset later.
test("round-1 MAJOR: a local branch named origin/main does not fool the origin-confirmation proof", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);

  const wt = addWorktree(root, "feat-precious");
  fs.writeFileSync(path.join(wt, "precious.txt"), "only copy\n");
  git(["add", "."], wt);
  git(["commit", "-q", "-m", "precious work"], wt);
  mergeIntoMain(root, "feat-precious"); // merged into LOCAL main only - never pushed

  // The shadow: a local branch literally named origin/main, pointing at the same (unpushed) tip.
  git(["branch", "origin/main", "main"], root);

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });

  const wtReal = fs.realpathSync(wt);
  assert.ok(
    !state.safe.worktrees.some((w) => fs.realpathSync(w.ref) === wtReal),
    "feat-precious's worktree must NOT be SAFE just because a branch named origin/main exists locally",
  );
  assert.ok(
    state.judgment.worktrees.some((w) => fs.realpathSync(w.ref) === wtReal),
    "it must be JUDGMENT instead - merged locally, not actually confirmed on the real origin/main",
  );
  assert.ok(!state.safe.branches.some((b) => b.ref === "feat-precious"), "feat-precious the branch must NOT be SAFE either");
  assert.ok(state.judgment.branches.some((b) => b.ref === "feat-precious"), "it must be JUDGMENT");

  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(["--apply"], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.ok(fs.existsSync(wt), "the worktree must survive --apply");
  assert.ok(listLocalBranches(gitToplevel(root)).includes("feat-precious"), "feat-precious must survive --apply");
  assert.equal(code, 1);
});

// round-1 review MINOR 2: the protected-name guard existed only in the branch loop - a worktree
// checked out on a protected name (clean, merged, pushed) was SAFE and --apply removed the
// directory, while the branch of the same name was correctly held back as JUDGMENT.
test("round-1 MINOR: a worktree checked out on a protected branch name is JUDGMENT, never SAFE, and survives --apply", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);

  const wt = addWorktree(root, "release/rc1");
  mergeIntoMain(root, "release/rc1");
  pushMain(root);

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  const wtReal = fs.realpathSync(wt);
  assert.ok(!state.safe.worktrees.some((w) => fs.realpathSync(w.ref) === wtReal), "a protected-name worktree must never be SAFE");
  const row = state.judgment.worktrees.find((w) => fs.realpathSync(w.ref) === wtReal);
  assert.ok(row, "it must be JUDGMENT instead");
  assert.match(row.reason, /protected/);

  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(["--apply"], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.ok(fs.existsSync(wt), "the release/rc1 worktree must survive --apply");
  void code;
});

// round-1 review MINOR 3: a worktree-remove that fails (even partially - git can deregister and
// empty the directory before a final rmdir fails) must never let that worktree's branch get
// deleted in the same run, and the log must say what actually happened.
test("round-1 MINOR: when a worktree-remove fails, its branch is not deleted this run, and both survive", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);
  const wt = addWorktree(root, "feature-failremove");
  mergeIntoMain(root, "feature-failremove");
  pushMain(root);

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.equal(state.safe.worktrees.length, 1, "sanity: classified SAFE before the race");
  assert.ok(state.safe.branches.some((b) => b.ref === "feature-failremove"), "sanity: its branch is also SAFE");

  // Race: lock the worktree after classification but before applySafe runs, so the removal fails
  // cleanly (git itself refuses; directory and worktree registration both survive intact).
  git(["worktree", "lock", "--reason", "raced", wt], root);
  try {
    const log = applySafe(state, []);
    const removeEntry = log.find((l) => l.action === "worktree-remove");
    assert.equal(removeEntry.ok, false, "the removal must be logged as failed");
    const branchEntry = log.find((l) => l.action === "branch-delete" && l.ref === "feature-failremove");
    assert.ok(branchEntry, "the branch-delete attempt must be logged, not silently skipped");
    assert.equal(branchEntry.ok, false, "the branch must NOT be deleted when its worktree removal did not succeed");
    assert.ok(fs.existsSync(wt), "the worktree directory must survive");
    assert.ok(listLocalBranches(gitToplevel(root)).includes("feature-failremove"), "the branch must survive");
  } finally {
    git(["worktree", "unlock", wt], root);
  }
});

// round-1 review MINOR 7: no test pinned "never the worktree janitor is standing in" - verified
// live by the reviewer three ways (normal cwd, lowercased cwd, NTFS junction) but unpinned.
test("round-1: run FROM a linked worktree, that worktree never appears in SAFE and survives --apply", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);
  const wt = addWorktree(root, "feature-self");
  mergeIntoMain(root, "feature-self");
  pushMain(root);

  const state = gatherState({ root: gitToplevel(wt), config: loadProjectConfig(wt).config });
  const wtReal = fs.realpathSync(wt);
  assert.ok(
    !state.safe.worktrees.some((w) => path.normalize(w.ref) === path.normalize(wtReal)),
    "the worktree we're standing in must never appear in SAFE",
  );

  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  try {
    main(["--apply"], { cwd: wt });
  } finally {
    console.log = origLog;
  }
  assert.ok(fs.existsSync(wt), "janitor must never remove the worktree it is running from");
});

test(
  "round-1: run FROM a linked worktree reached via a lowercased path, it still never appears in SAFE (case-insensitive fs)",
  { skip: process.platform === "linux" ? "linux filesystems are case-sensitive; a lowercased path would not resolve to the same worktree" : false },
  () => {
    const root = initRepo();
    writeProjectConfig(root);
    addOrigin(root);
    const wt = addWorktree(root, "feature-self-lc");
    mergeIntoMain(root, "feature-self-lc");
    pushMain(root);

    const lowered = wt.toLowerCase();
    const state = gatherState({ root: gitToplevel(lowered), config: loadProjectConfig(lowered).config });
    const wtReal = fs.realpathSync(wt);
    assert.ok(
      !state.safe.worktrees.some((w) => path.normalize(w.ref).toLowerCase() === path.normalize(wtReal).toLowerCase()),
      "the worktree we're standing in, reached via a different-case path, must never appear in SAFE",
    );
  },
);

// NEW-2 (round 3 delta review): branch deletion had no origin confirmation at all - only the
// worktree class did. In a repo with zero remotes, a merged local branch was SAFE and --apply
// deleted it, even though the exact same commit reachable only via a worktree was correctly held
// back as JUDGMENT ("not confirmed on origin/main"). Branches now get the identical proof.
test("NEW-2: in a repo with NO remote at all, a merged branch is JUDGMENT (not confirmed on origin), and survives --apply", () => {
  const root = initRepo();
  writeProjectConfig(root);
  // Deliberately no addOrigin(root) here - this is the whole point of the test.
  git(["checkout", "-q", "-b", "feat-local"], root);
  fs.writeFileSync(path.join(root, "local.txt"), "x\n");
  git(["add", "."], root);
  git(["commit", "-q", "-m", "local work"], root);
  git(["checkout", "-q", "main"], root);
  git(["merge", "--no-ff", "-q", "-m", "merge feat-local", "feat-local"], root);

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.ok(!state.safe.branches.some((b) => b.ref === "feat-local"), "a merged-but-unconfirmed branch must never be SAFE");
  const row = state.judgment.branches.find((b) => b.ref === "feat-local");
  assert.ok(row, "it must be JUDGMENT instead");
  assert.match(row.reason, /not confirmed on origin/);

  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(["--apply"], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.ok(listLocalBranches(gitToplevel(root)).includes("feat-local"), "feat-local must survive --apply with no remote to confirm against");
  assert.equal(code, 1);
});

// MAJOR 8: an unreadable/malformed .agents/project.json silently exits 0 with findings on the floor
test("MAJOR 8: a malformed .agents/project.json exits 3, not 0, and says so on stderr", () => {
  const root = initRepo();
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(root, ".agents", "project.json"), "{ not json");
  // A genuine SAFE-looking finding exists underneath, to prove this is not read as "clean".
  addWorktree(root, "feature-e");

  const errs = [];
  const origErr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => {
    errs.push(s);
    return true;
  };
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    process.stderr.write = origErr;
  }
  assert.equal(code, 3);
  assert.match(errs.join(""), /project\.json/);
});

// MAJOR 9 / MAJOR 9b (round-1 CUT): both covered the artifact registry's blind/malformed-read
// paths. The registry (scripts/artifact-registry.mjs) was removed from this build entirely per
// round-1 review - it read a file nothing shipped ever wrote - so there is no registry read path
// left to be blind about. Removed rather than kept red.

// MAJOR 10: C-quoted paths defeat the scratch-pattern match
test("MAJOR 10: an untracked scratch file with a space, and one with a non-ASCII character, are both flagged", () => {
  const root = initRepo();
  writeProjectConfig(root, { scratch_patterns: ["tmp-*.md"] });
  fs.writeFileSync(path.join(root, "tmp-my notes.md"), "x\n");
  fs.writeFileSync(path.join(root, "tmp-café.md"), "x\n");

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  const flagged = state.judgment.untrackedFiles.map((f) => f.ref);
  assert.ok(flagged.includes("tmp-my notes.md"), `expected "tmp-my notes.md" in ${JSON.stringify(flagged)}`);
  assert.ok(flagged.includes("tmp-café.md"), `expected the accented filename in ${JSON.stringify(flagged)}`);
});

// ---------------------------------------------------------------------------
// J5: the janitor's report gains the wiring results as its last section
// ---------------------------------------------------------------------------

test("J5: --json output carries a top-level wiring key with the checkWiring() shape", () => {
  const root = initRepo();
  writeProjectConfig(root);
  const origLog = console.log;
  const lines = [];
  console.log = (s) => lines.push(s);
  let code;
  try {
    code = main(["--json"], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.equal(code, 0);
  const parsed = JSON.parse(lines.join("\n"));
  assert.ok("wiring" in parsed, "JSON output must carry a wiring key (J5)");
  assert.equal(typeof parsed.wiring.ok, "boolean");
  assert.ok(Array.isArray(parsed.wiring.results));
});

test("J5: the printed table's last section is WIRING, and janitor never acts on its results (display only)", () => {
  const root = initRepo();
  writeProjectConfig(root);
  const origLog = console.log;
  const lines = [];
  console.log = (s) => lines.push(s);
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    console.log = origLog;
  }
  const text = lines.join("\n");
  const driftIndex = text.indexOf("DRIFT:");
  const wiringIndex = text.indexOf("WIRING (read-only visibility, never acted on by janitor):");
  assert.ok(driftIndex >= 0 && wiringIndex > driftIndex, "WIRING must print after DRIFT, as the last section");
  // Exit code reflects only SAFE/JUDGMENT findings, per the janitor's own contract - the wiring
  // section is informational and must never change it. A bare project with nothing stale here
  // has no janitor findings, so this must stay 0 regardless of what wiring reports.
  assert.equal(code, 0);
});

test("J5: a wiring check failure never breaks the janitor's own report (display only, wrapped)", () => {
  const root = initRepo();
  writeProjectConfig(root);
  // No fault injection needed beyond proving the call site is guarded: main() itself wraps
  // checkWiring() in its own try/catch and continues printing everything else regardless.
  const origLog = console.log;
  const lines = [];
  console.log = (s) => lines.push(s);
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.equal(code, 0);
  assert.ok(lines.join("\n").includes("SAFE:"), "the rest of the report must still print even around the wiring call");
});

// round-2 review D1 (MAJOR): `rev-parse --verify --quiet` DWIMs through gitrevisions'
// disambiguation order, so a TAG named `refs/remotes/origin/<main>` satisfied the origin-existence
// guard even in a repo with no origin remote at all - a locally-merged, never-pushed branch then
// looked confirmed. `show-ref --verify` reads the ref store directly and never guesses.
test("round-2 MAJOR: a tag named refs/remotes/origin/main cannot fool the origin-confirmation guard when there is no origin remote", () => {
  const root = initRepo();
  writeProjectConfig(root);
  // Deliberately no addOrigin(root) - the whole point is that nothing is actually confirmed.

  git(["checkout", "-q", "-b", "feat-unpushed"], root);
  fs.writeFileSync(path.join(root, "unpushed.txt"), "only copy\n");
  git(["add", "."], root);
  git(["commit", "-q", "-m", "unpushed work"], root);
  git(["checkout", "-q", "main"], root);
  git(["merge", "--no-ff", "-q", "-m", "merge feat-unpushed", "feat-unpushed"], root);

  assert.equal(isBranchOnOrigin(root, "feat-unpushed", "main"), false, "sanity: unconfirmed before the tag exists");

  // The shadow: a tag whose NAME is the exact string the origin-confirmation guard checks for.
  git(["tag", "refs/remotes/origin/main", "main"], root);

  assert.equal(
    isBranchOnOrigin(root, "feat-unpushed", "main"),
    false,
    "a tag literally named refs/remotes/origin/main must never satisfy the origin-existence guard",
  );

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.ok(!state.safe.branches.some((b) => b.ref === "feat-unpushed"), "feat-unpushed must NOT be SAFE");
  assert.ok(state.judgment.branches.some((b) => b.ref === "feat-unpushed"), "it must be JUDGMENT - merged locally, not actually confirmed");

  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(["--apply"], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.ok(listLocalBranches(gitToplevel(root)).includes("feat-unpushed"), "feat-unpushed must survive --apply");
  assert.equal(code, 1);
});

// round-2 review D2 (MINOR): `%(refname:short)` is git's own DWIM output and comes back as
// `heads/<name>` whenever a tag of the same name exists, which then fails headRef() qualification
// entirely (reported as permanently unmerged even when merged and pushed). `%(refname)` is the full,
// unambiguous name; stripping the literal `refs/heads/` prefix never guesses.
test("round-2 MINOR: a tag sharing a branch's name does not corrupt that branch's classification", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);

  const wt = addWorktree(root, "feat-amb");
  mergeIntoMain(root, "feat-amb");
  pushMain(root);
  git(["tag", "feat-amb", "feat-amb"], root); // a tag with the exact same name as the branch

  assert.ok(listLocalBranches(root).includes("feat-amb"), "the real branch name must appear, not a mangled 'heads/feat-amb'");
  assert.ok(!listLocalBranches(root).includes("heads/feat-amb"), "for-each-ref's DWIM-shortened form must never leak through");

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.ok(state.safe.branches.some((b) => b.ref === "feat-amb"), "feat-amb must classify as SAFE (merged and on origin) despite the same-named tag");
  const wtReal = fs.realpathSync(wt);
  assert.ok(state.safe.worktrees.some((w) => fs.realpathSync(w.ref) === wtReal), "its worktree must classify as SAFE too");
});

// round-2 ruling: the exact case the reviewer measured - a tag named "main" makes for-each-ref
// disambiguate the real main branch's own short name to "heads/main", which then matches neither
// the `b.name === mainBranch` skip nor the protected-name set, listing the protected main branch
// itself as a cleanup candidate.
test("round-2 MINOR: a tag literally named 'main' does not make the protected main branch appear as a JUDGMENT candidate", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);
  git(["tag", "main", "main"], root); // a tag with the exact same name as the protected main branch

  assert.ok(!listLocalBranches(root).includes("heads/main"), "the mangled DWIM form must never reach the branch list");

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.ok(!state.judgment.branches.some((b) => b.ref === "heads/main" || b.ref === "main"), "main itself must never appear as a cleanup candidate");
  assert.ok(!state.safe.branches.some((b) => b.ref === "heads/main" || b.ref === "main"), "nor as SAFE");
});

// round-2 review D3 (MINOR): on Windows, `git worktree remove` can deregister the worktree and
// empty its directory of tracked files before a final rmdir fails (a live process holding the
// directory as its CWD is enough) - `!existsSync(w.ref)` never fired because the empty directory
// SHELL survives, so the log read as "the worktree survived" when git had already stopped tracking
// it. Ask git's own worktree list instead of the filesystem.
test(
  "round-2 MINOR: when git deregisters a worktree but an empty directory shell survives (Windows), the log says removed, not survived",
  { skip: process.platform !== "win32" ? "this reproduces a Windows-only failure shape (RemoveDirectory refuses while a live process holds the directory as its CWD, after git has already unlinked its tracked files and deregistered it)" : false },
  async () => {
    const root = initRepo();
    writeProjectConfig(root);
    addOrigin(root);
    const wt = addWorktree(root, "feature-shellremains");
    mergeIntoMain(root, "feature-shellremains");
    pushMain(root);

    const toplevel = gitToplevel(root);
    const { config } = loadProjectConfig(root);
    const state = gatherState({ root: toplevel, config });
    assert.equal(state.safe.worktrees.length, 1, "sanity: classified SAFE before the race");

    const holder = spawn(process.execPath, ["-e", "setInterval(()=>{}, 1000)"], { cwd: wt, stdio: "ignore" });
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const log = applySafe(state, []);
      const removeEntry = log.find((l) => l.action === "worktree-remove");
      assert.equal(removeEntry.ok, false, "the removal must be logged as failed (permission denied on the final rmdir)");
      assert.ok(!(listWorktrees(root) || []).some((w) => w.branch === "feature-shellremains"), "sanity: git itself no longer lists this worktree");
      assert.match(
        removeEntry.error,
        /git no longer lists this worktree/,
        "the note must say REMOVED, not imply survival, once git's own listing confirms it is gone",
      );
      const branchEntry = log.find((l) => l.action === "branch-delete" && l.ref === "feature-shellremains");
      assert.equal(branchEntry.ok, false, "the branch must still not be deleted this run, regardless of the wording fix");
    } finally {
      holder.kill();
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  },
);

// round-3 review E1 (MINOR): a full, qualified refname still DWIMs to a TAG of the identical name
// when the real ref is ABSENT (gitrevisions rule 3, refs/tags/<the whole qualified string>, still
// matches a string like "refs/heads/main"). In a repo whose main branch was deleted, with a tag
// named `refs/heads/main` left behind, `isBranchMerged` answered `true` for an unrelated branch that
// was not actually merged into anything. Non-destructive (SAFE still requires the separately
// show-ref-gated `onOrigin` proof), but the JUDGMENT reason was wrong. Both operands are now
// show-ref-verified to exist before ever being used as a merge-base revision.
test("round-3 MINOR: a tag named refs/heads/main cannot fake 'merged' when the real main branch does not exist", () => {
  const root = initRepo();
  writeProjectConfig(root);
  git(["checkout", "-q", "-b", "feat-orphan"], root);
  fs.writeFileSync(path.join(root, "orphan.txt"), "x\n");
  git(["add", "."], root);
  git(["commit", "-q", "-m", "orphan work"], root);

  // Delete the real main branch (git allows this once HEAD has moved elsewhere), then plant a tag
  // with the exact string a fully-qualified reference to it would have been.
  git(["branch", "-D", "main"], root);
  git(["tag", "refs/heads/main", "feat-orphan"], root);

  assert.equal(
    isBranchMerged(root, "feat-orphan", "main"),
    false,
    "a tag named refs/heads/main must never stand in for the real (now-deleted) main branch",
  );
});

// round-4 review F1 (MAJOR): the branch loop never consulted `worktrees`, so a branch checked out
// in ANY worktree - including the MAIN one - could be reported SAFE while --apply would refuse to
// delete it, a documented-vs-actual contradiction. A branch is now SAFE only alone, or together with
// its own worktree also being SAFE this run.
test("round-4 MAJOR: a merged branch checked out in the MAIN worktree is never SAFE, and appears as one honest JUDGMENT row", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);

  // feat-done is merged and pushed, but checked out in the MAIN working tree itself.
  git(["checkout", "-q", "-b", "feat-done"], root);
  fs.writeFileSync(path.join(root, "done.txt"), "x\n");
  git(["add", "."], root);
  git(["commit", "-q", "-m", "done work"], root);
  git(["checkout", "-q", "main"], root);
  git(["merge", "--no-ff", "-q", "-m", "merge feat-done", "feat-done"], root);
  git(["checkout", "-q", "feat-done"], root); // main worktree now sits ON feat-done
  pushMain(root);

  // Run from a SEPARATE linked worktree, so "cur" is not feat-done and the branch loop actually has
  // to consult the worktree list to know feat-done is checked out anywhere at all.
  const runner = addWorktree(root, "runner-branch");

  const toplevel = gitToplevel(runner);
  const { config } = loadProjectConfig(runner);
  const state = gatherState({ root: toplevel, config });

  assert.ok(!state.safe.branches.some((b) => b.ref === "feat-done"), "feat-done must never be SAFE while checked out in the main worktree");
  const row = state.judgment.branches.find((b) => b.ref === "feat-done");
  assert.ok(row, "it must appear as a JUDGMENT row instead");
  assert.match(row.reason, /checked out in a worktree/);

  // NIT (seam delta): --apply prints a real-machine WIRING section, display-only - capture, discard.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(["--apply"], { cwd: runner });
  } finally {
    console.log = origLog;
  }
  assert.ok(listLocalBranches(gitToplevel(runner)).includes("feat-done"), "feat-done must survive --apply");
  void code;
});

// round-4 review F2/F3: `git worktree prune` used to run unconditionally under --apply, before the
// removal-tracking guard was computed, so it could deregister a worktree this SAME run had correctly
// classified JUDGMENT (moved aside, directory unreachable) - and the post-prune listing then made
// its branch look free to delete in the same run. `worktree prune` is now dropped from --apply
// entirely; a prunable worktree is its own JUDGMENT row, and nothing --apply does can touch it.
test("round-4 MAJOR: a worktree moved aside (directory gone, git still registers it as prunable) - its branch and the prunable registration both survive --apply", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);
  const wt = addWorktree(root, "feature-moved");
  mergeIntoMain(root, "feature-moved");
  pushMain(root);

  // Simulate "moved aside" (an unmounted drive / offline share): the directory disappears from
  // where git still expects it, without ever going through `git worktree remove`.
  const movedTo = `${wt}-actually-moved`;
  fs.renameSync(wt, movedTo);
  tracked.push(movedTo); // let the shared after() hook clean this one up too

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });

  const wtRow = state.judgment.worktrees.find((w) => path.normalize(w.ref) === path.normalize(wt));
  assert.ok(wtRow, "the moved-aside worktree must be JUDGMENT, not silently absorbed into 'tree not clean'");
  assert.match(wtRow.reason, /prunable/i);
  assert.ok(!state.safe.worktrees.some((w) => path.normalize(w.ref) === path.normalize(wt)), "it must never be SAFE");
  assert.ok(!state.safe.branches.some((b) => b.ref === "feature-moved"), "its branch must never be SAFE either, even though merged and pushed");
  const branchRow = state.judgment.branches.find((b) => b.ref === "feature-moved");
  assert.ok(branchRow, "the branch must appear as JUDGMENT");

  // NIT (seam delta): same as above - suppress the real-machine WIRING section, display-only.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(["--apply"], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.ok(listLocalBranches(gitToplevel(root)).includes("feature-moved"), "feature-moved must survive --apply");
  const stillRegistered = (listWorktrees(gitToplevel(root)) || []).some((w) => w.branch === "feature-moved");
  assert.ok(stillRegistered, "the moved-aside worktree's git registration must survive --apply - nothing JUDGMENT may be pruned");
  void code;
});

test("round-5 MINOR: an abandoned worktree on a stale UNMERGED branch is reported in JUDGMENT, not silently dropped from both tables", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addOrigin(root);
  const wt = addWorktree(root, "feat-stale");
  fs.writeFileSync(path.join(wt, "wip.txt"), "wip\n");
  git(["add", "."], wt);
  git(["commit", "-q", "-m", "unfinished work"], wt);
  // never merged into main, never pushed - the janitor's most common real shape: an agent
  // worktree left on stale, unfinished work.

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const farFuture = new Date(Date.now() + 900 * 86400 * 1000); // simulate 900 days of staleness
  const state = gatherState({ root: toplevel, config, now: farFuture });

  assert.ok(!state.safe.branches.some((b) => b.ref === "feat-stale"), "an unmerged branch must never be SAFE");
  const row = state.judgment.branches.find((b) => b.ref === "feat-stale");
  assert.ok(row, "a stale unmerged branch checked out in a worktree must appear in JUDGMENT, never vanish from both tables");
  assert.match(row.reason, /unmerged/);
  assert.match(row.reason, /checked out in a worktree/);

  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(["--apply"], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.ok(listLocalBranches(gitToplevel(root)).includes("feat-stale"), "unmerged work must survive --apply regardless");
  void code;
});

// ---------------------------------------------------------------------------
// T4: workaround rows gathered from docs/work records (scripts/work-record.mjs's listRecords)
// ---------------------------------------------------------------------------

const WORK_RECORD_HEADER = [
  "Scope: docs/x@abc123",
  "Owner: none",
  "Status: accepted",
  "Authority: none",
  "Artifact: none",
  "Evidence: none",
  "Next: nothing",
  "Opened: 2026-01-01T00:00:00Z",
];

test("T4: no docs/work directory at all is not a finding - judgment.workarounds is simply empty", () => {
  const root = initRepo();
  writeProjectConfig(root);
  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.deepEqual(state.judgment.workarounds, []);
  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.equal(code, 0);
});

test("T4: an overdue workaround (remove when a past 'by <date>') is a JUDGMENT row and a finding (exit 1)", () => {
  const root = initRepo();
  writeProjectConfig(root);
  writeWorkRecord(root, "wr-2026-01-01-overdue.record.md", [
    "Work: wr-2026-01-01-overdue",
    ...WORK_RECORD_HEADER,
    "WORKAROUND: manual review skipped / no reviewer available / by 2020-01-01",
    "",
    "Prose.",
    "",
  ]);

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });

  const row = state.judgment.workarounds.find((w) => w.ref === "wr-2026-01-01-overdue");
  assert.ok(row, "the overdue workaround must appear as a JUDGMENT row");
  assert.equal(row.overdue, true);
  assert.match(row.reason, /^manual review skipped \/ remove when by 2020-01-01 \(overdue\)$/);

  // NIT (seam delta): suppress the real-machine WIRING section this report prints, display-only.
  const origLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.equal(code, 1, "an overdue workaround must fail the run");
});

test("T4: an open workaround (not yet due, or a worded condition) is a JUDGMENT row but never a finding by itself, and prints after untracked files", () => {
  const root = initRepo();
  writeProjectConfig(root);
  writeWorkRecord(root, "wr-2026-01-01-open-a.record.md", [
    "Work: wr-2026-01-01-open-a",
    ...WORK_RECORD_HEADER,
    "WORKAROUND: waiting on T1 / T1's parser lands / by 2099-01-01",
    "",
    "Prose.",
    "",
  ]);
  writeWorkRecord(root, "wr-2026-01-01-open-b.record.md", [
    "Work: wr-2026-01-01-open-b",
    ...WORK_RECORD_HEADER,
    "WORKAROUND: waiting on T3 / T3's fixture lands / T3 merges",
    "",
    "Prose.",
    "",
  ]);

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });

  const rowA = state.judgment.workarounds.find((w) => w.ref === "wr-2026-01-01-open-a");
  const rowB = state.judgment.workarounds.find((w) => w.ref === "wr-2026-01-01-open-b");
  assert.ok(rowA && rowB, "both open workarounds must appear as JUDGMENT rows");
  assert.equal(rowA.overdue, false, "a future 'by <date>' is not overdue");
  assert.equal(rowB.overdue, false, "a worded condition is never mechanically overdue");
  assert.match(rowA.reason, /\(open\)$/);
  assert.match(rowB.reason, /\(open\)$/);

  const lines = [];
  const origLog = console.log;
  console.log = (s) => lines.push(s);
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.equal(code, 0, "open workarounds must never fail the run by themselves");
  const text = lines.join("\n");
  const untrackedIdx = text.indexOf("untracked files:");
  const workaroundsIdx = text.indexOf("workarounds:");
  assert.ok(untrackedIdx >= 0 && workaroundsIdx > untrackedIdx, "workarounds must print after untracked files");
  assert.match(text, /waiting on T1/);
  assert.match(text, /waiting on T3/);
});

test("T4: a record with no Work: id is skipped for workarounds, never guessed at, and never crashes", () => {
  const root = initRepo();
  writeProjectConfig(root);
  writeWorkRecord(root, "wr-broken.record.md", [
    "Scope: docs/x@abc123",
    "Owner: none",
    "WORKAROUND: something / blocked / by 2020-01-01",
    "",
    "Prose.",
    "",
  ]);

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.deepEqual(state.judgment.workarounds, []);
  const origLog = console.log;
  console.log = () => {};
  try {
    assert.equal(main([], { cwd: root }), 0);
  } finally {
    console.log = origLog;
  }
});

test("T4: gatherWorkarounds is exported and pure (no I/O beyond listRecords) - repeatable WORKAROUND lines on one record each become their own row", () => {
  const root = initRepo();
  writeWorkRecord(root, "wr-2026-01-01-multi.record.md", [
    "Work: wr-2026-01-01-multi",
    ...WORK_RECORD_HEADER,
    "WORKAROUND: cause one / blocked one / by 2020-01-01",
    "WORKAROUND: cause two / blocked two / by 2099-01-01",
    "WORKAROUND: cause three / blocked three / 2020-01-01",
    "",
    "Prose.",
    "",
  ]);
  const rows = gatherWorkarounds(root, { now: new Date("2026-09-21T00:00:00Z") });
  assert.equal(rows.length, 3);
  assert.ok(rows.some((r) => r.ref === "wr-2026-01-01-multi" && r.overdue === true && /cause one/.test(r.reason)));
  assert.ok(rows.some((r) => r.ref === "wr-2026-01-01-multi" && r.overdue === false && /cause two/.test(r.reason)));
  assert.ok(
    rows.some((r) => r.ref === "wr-2026-01-01-multi" && r.overdue === true && /cause three/.test(r.reason)),
    "a bare yyyy-mm-dd (no 'by' prefix) in the past must also be judged overdue - C1 says ANY remove-when date in the past, in any status",
  );
});

// MAJOR 2 (round-2 review): listRecords guards readdirSync but not readFileSync - a directory (or
// a win32-locked file) named `x.record.md` throws EISDIR out of gatherWorkarounds, out of
// gatherState, into main()'s fail-open catch, which used to print NOTHING and exit 0, hiding every
// other finding. gatherWorkarounds now catches that read failure itself and returns [] with a
// stderr line, so the rest of the report still prints.
test("MAJOR 2: an unreadable docs/work entry (a directory named *.record.md) does not blind the whole report", () => {
  const root = initRepo();
  writeProjectConfig(root);
  fs.mkdirSync(path.join(root, "docs", "work", "x.record.md"), { recursive: true });

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.deepEqual(state.judgment.workarounds, [], "the unreadable entry yields no rows, but does not throw");

  const lines = [];
  const origLog = console.log;
  console.log = (s) => lines.push(s);
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    console.log = origLog;
  }
  assert.equal(code, 0, "no other findings in this fixture - the report must still complete cleanly");
  assert.ok(lines.join("\n").includes("SAFE:"), "the rest of the report must still print despite the unreadable record entry");
});

after(() => {
  for (const dir of tracked) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only
    }
  }
});
