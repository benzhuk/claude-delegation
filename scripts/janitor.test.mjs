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
import { execFileSync } from "node:child_process";

import {
  main,
  gatherState,
  gitToplevel,
  listWorktrees,
  listLocalBranches,
  matchesScratchPattern,
  isTreeClean,
  applySafe,
} from "./janitor.mjs";
import { loadProjectConfig } from "./project-config.mjs";
import { appendArtifact, closeArtifact } from "./artifact-registry.mjs";

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

  const code = main(["--apply"], { cwd: root });

  const toplevel = gitToplevel(root);
  const worktreesAfter = listWorktrees(toplevel).map((w) => w.path);
  const branchesAfter = listLocalBranches(toplevel);

  assert.ok(!worktreesAfter.includes(wtARealBefore), "wtA should be gone");
  assert.ok(!branchesAfter.includes("feature-a"), "merged branch should be deleted");

  assert.ok(fs.existsSync(wtB), "dirty worktree directory must survive");
  assert.ok(worktreesAfter.includes(wtBRealBefore), "dirty worktree must still be a registered worktree");
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

  const code = main(["--apply"], { cwd: wtC });

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
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  process.env.HOME = home;
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    process.env.HOME = prevHome;
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
  process.env.HOME = home;
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    process.env.HOME = prevHome;
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

test("a malformed artifact registry line does not crash janitor - fail open on READ, and the run still completes", () => {
  const root = initRepo();
  writeProjectConfig(root);
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".agents", "artifacts.jsonl"),
    ["{ this is not valid json at all", JSON.stringify({ ref: "missing-fields" })].join("\n") + "\n",
  );
  assert.doesNotThrow(() => {
    const code = main([], { cwd: root });
    assert.ok([0, 1].includes(code));
  });
});

test("registry entries are REPORT-ONLY: an overdue entry (tool-created or not) is always JUDGMENT, never SAFE, and --apply never touches its file or its registry line", () => {
  // Round 3: the unlink feature was cut entirely (NEW-1/NEW-3 from the delta review). janitor has
  // no unlink code path left at all - a registry entry past its end_condition is reported in the
  // JUDGMENT table, whatever it claims about who created it, and --apply does not act on it.
  const root = initRepo();
  writeProjectConfig(root);

  const registryPath = path.join(root, ".agents", "artifacts.jsonl");
  const toolFile = path.join(root, "scratch-one.txt");
  fs.writeFileSync(toolFile, "scratch\n");
  appendArtifact(
    {
      ref: toolFile,
      kind: "scratch",
      owner: "builder-b",
      purpose: "test scratch file",
      end_condition: "date:2020-01-01",
      created_by_tool: true,
      created: new Date().toISOString(),
    },
    { registryPath },
  );

  const otherFile = path.join(root, "scratch-two.txt");
  fs.writeFileSync(otherFile, "scratch2\n");
  appendArtifact(
    {
      ref: otherFile,
      kind: "scratch",
      owner: "a-human",
      purpose: "hand-made scratch file",
      end_condition: "date:2020-01-01",
      created_by_tool: false,
      created: new Date().toISOString(),
    },
    { registryPath },
  );

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.equal(state.safe.worktrees.length + (state.safe.branches?.length ?? 0), 0, "SAFE has no registryEntries key at all now");
  assert.ok(!("registryEntries" in state.safe), "the SAFE class is exactly worktrees and branches, per the round-3 cut");
  assert.equal(state.judgment.registryEntries.length, 2, "both entries land in JUDGMENT regardless of created_by_tool");

  const code = main(["--apply"], { cwd: root });

  assert.ok(fs.existsSync(toolFile), "a tool-created registry entry's file must survive --apply - there is no unlink path");
  assert.ok(fs.existsSync(otherFile), "the human-made scratch file must survive --apply");

  const remaining = fs.readFileSync(registryPath, "utf8");
  assert.ok(remaining.includes(toolFile), "the tool-created line must remain - closeArtifact is never called from apply");
  assert.ok(remaining.includes(otherFile), "the other registry line must remain for a human to see");
  assert.equal(code, 1, "both surviving judgment entries are still findings");
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

test("the five drift numbers are all present and numeric (or null for disk, if `du` is unavailable)", () => {
  const root = initRepo();
  writeProjectConfig(root);
  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.equal(typeof state.drift.worktreeCount, "number");
  assert.equal(typeof state.drift.openBranchCount, "number");
  assert.equal(typeof state.drift.untrackedFileCount, "number");
  assert.equal(typeof state.drift.registryPastEndCount, "number");
  assert.ok(state.drift.diskUsedKB === null || typeof state.drift.diskUsedKB === "number");
});

test("source never contains a destructive git verb, a force flag, or exit(2), outside comments", () => {
  const files = ["janitor.mjs", "commit-check.mjs", "artifact-registry.mjs"].map((f) =>
    path.join(import.meta.dirname, f),
  );
  const banned = ["git clean", "reset --hard", "stash", "rm -rf", "--force", "branch -D", "process.exit(2)"];
  for (const file of files) {
    if (!fs.existsSync(file)) continue; // commit-check.mjs may not exist yet when this file runs standalone
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

  const code = main(["--apply"], { cwd: root });
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

  const registryPath = path.join(root, ".agents", "artifacts.jsonl");
  const registryFile = path.join(root, "registry-referenced.txt");
  fs.writeFileSync(registryFile, "referenced\n");
  appendArtifact(
    {
      ref: registryFile,
      kind: "scratch",
      owner: "tool",
      purpose: "in-root, overdue, tool-created - would have been unlinked in round 2",
      end_condition: "date:2020-01-01",
      created_by_tool: true,
      created: new Date().toISOString(),
    },
    { registryPath },
  );

  const outsideDir = mkTmp("janitor-outside-");
  const outsideFile = path.join(outsideDir, "outside.txt");
  fs.writeFileSync(outsideFile, "outside\n");
  appendArtifact(
    {
      ref: outsideFile,
      kind: "scratch",
      owner: "tool",
      purpose: "out-of-root, overdue, tool-created - would have been an escape target in round 2",
      end_condition: "date:2020-01-01",
      created_by_tool: true,
      created: new Date().toISOString(),
    },
    { registryPath },
  );

  // Everything except wtSafe (the one sanctioned removal) must be byte-for-byte the same set of
  // regular files, before and after --apply.
  const watched = [root, wtDirty, outsideDir];
  assert.ok(fs.existsSync(wtSafe), "sanity: the SAFE worktree exists before --apply");
  const before = watched.map((d) => listAllFiles(d));

  const code = main(["--apply"], { cwd: root });

  const after = watched.map((d) => listAllFiles(d));
  for (let i = 0; i < watched.length; i++) {
    assert.deepEqual(after[i], before[i], `the set of regular files under ${watched[i]} must be unchanged by --apply`);
  }
  assert.ok(!fs.existsSync(wtSafe), "the SAFE worktree is the one sanctioned removal - a whole directory, via git");
  assert.ok(fs.existsSync(registryFile), "the in-root registry-referenced file survives - report-only");
  assert.ok(fs.existsSync(outsideFile), "the out-of-root registry-referenced file survives - report-only");
  assert.ok(fs.existsSync(path.join(wtDirty, "keep-me.txt")), "every file in the surviving dirty worktree survives");
  assert.equal(code, 1, "the surviving JUDGMENT rows (dirty worktree, two registry entries) are still findings");
});

// BLOCKER 2: --apply unlinks any path on the machine a registry line names
// Round-3 note: BLOCKER 2 (round 2) and NEW-1 (round 3's symlinked-parent bypass of the round-2
// containment check) are both retired here, not fixed further - the orchestrator's decision was to
// CUT the unlink feature entirely rather than harden the containment check again. See the
// dedicated "--apply never removes a regular file anywhere" test below, which is the replacement
// the orchestrator asked for: a tool with no unlink code path cannot have a containment bug in it.

// BLOCKER 3: closeArtifact silently erases every registry line it cannot parse or validate
test("BLOCKER 3: closeArtifact preserves a line it cannot validate (hand-annotated) and a truncated final line", () => {
  const root = initRepo();
  const registryPath = path.join(root, ".agents", "artifacts.jsonl");
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });

  const toolRecord = {
    ref: "/a/one",
    kind: "scratch",
    owner: "tool",
    purpose: "p",
    end_condition: "date:2020-01-01",
    created: "2026-01-01T00:00:00.000Z",
  };
  const handAnnotated = JSON.stringify({
    ref: "/a/hand",
    kind: "scratch",
    owner: "ben",
    purpose: "p",
    end_condition: "date:2030-01-01",
    created: "2026-01-01T00:00:00.000Z",
    note: "DO NOT DELETE, mine",
  });
  const truncated = '{ "ref": "/a/broken", "kind": "scratch"';

  fs.writeFileSync(registryPath, [JSON.stringify(toolRecord), handAnnotated, truncated].join("\n") + "\n");

  const removed = closeArtifact({ ref: "/a/one" }, { registryPath });
  assert.equal(removed, 1);

  const after_ = fs.readFileSync(registryPath, "utf8");
  assert.ok(!after_.includes("/a/one"), "the matched line should be gone");
  assert.ok(after_.includes("DO NOT DELETE, mine"), "the hand-annotated line must survive byte for byte");
  assert.ok(after_.includes('"ref": "/a/broken"'), "the truncated line must survive byte for byte");
});

test("BLOCKER 3: a close that cannot get the write lock (another writer holds it) skips entirely and does not touch the file", () => {
  const root = initRepo();
  const registryPath = path.join(root, ".agents", "artifacts.jsonl");
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  const record = {
    ref: "/a/one",
    kind: "scratch",
    owner: "tool",
    purpose: "p",
    end_condition: "date:2020-01-01",
    created: "2026-01-01T00:00:00.000Z",
  };
  fs.writeFileSync(registryPath, JSON.stringify(record) + "\n");
  const before = fs.readFileSync(registryPath, "utf8");

  // Simulate a concurrent writer by holding the same lock file closeArtifact uses.
  const lockPath = `${registryPath}.lock`;
  const lockFd = fs.openSync(lockPath, "wx");
  try {
    const removed = closeArtifact({ ref: "/a/one" }, { registryPath });
    assert.equal(removed, 0, "a held lock means: do nothing this run, try again next time");
    assert.equal(fs.readFileSync(registryPath, "utf8"), before, "the file must be byte-for-byte untouched");
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lockPath);
  }

  // Lock released: the same close now succeeds normally.
  const removedAfter = closeArtifact({ ref: "/a/one" }, { registryPath });
  assert.equal(removedAfter, 1);
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
  assert.ok(
    externalLog.some((l) => l.action === "worktree-remove" && l.ref === wtReal),
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

  const code = main(["--apply"], { cwd: other });
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

  main(["--apply"], { cwd: root });
  assert.ok(listLocalBranches(gitToplevel(root)).includes("release"), "release must survive --apply");
});

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

  const code = main(["--apply"], { cwd: root });
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

// MAJOR 9: registry read failures are swallowed and the drift number lies
test("MAJOR 9: an unreadable registry file exits 3 (blind), never a clean-looking 0", () => {
  const root = initRepo();
  writeProjectConfig(root);
  const registryPath = path.join(root, ".agents", "artifacts.jsonl");
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  appendArtifact(
    {
      ref: path.join(root, "whatever.txt"),
      kind: "scratch",
      owner: "tool",
      purpose: "p",
      end_condition: "date:2020-01-01",
      created_by_tool: true,
      created: new Date().toISOString(),
    },
    { registryPath },
  );
  fs.chmodSync(registryPath, 0o000);

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
    fs.chmodSync(registryPath, 0o600); // restore so cleanup can remove it
  }
  assert.equal(code, 3, "an unreadable registry must never be reported as zero findings");
  assert.match(errs.join(""), /registry/);
});

test("MAJOR 9b: malformed (but readable) registry lines are surfaced as a count, not silently dropped to zero", () => {
  const root = initRepo();
  writeProjectConfig(root);
  const registryPath = path.join(root, ".agents", "artifacts.jsonl");
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, ["{ broken", JSON.stringify({ ref: "x" })].join("\n") + "\n");

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.equal(state.drift.registryMalformedCount, 2);
});

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

after(() => {
  for (const dir of tracked) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only
    }
  }
});
