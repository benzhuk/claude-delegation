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
import { appendArtifact, closeArtifact, resolveRegistryPath } from "./artifact-registry.mjs";

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

test("registry: a tool-created single file past its end_condition, inside the project root, is SAFE and --apply unlinks it and closes the line; a non-tool-created one is JUDGMENT only", () => {
  const root = initRepo();
  writeProjectConfig(root);

  const registryPath = path.join(root, ".agents", "artifacts.jsonl");
  const scratchFile = path.join(root, "scratch-one.txt");
  fs.writeFileSync(scratchFile, "scratch\n");
  appendArtifact(
    {
      ref: scratchFile,
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

  const code = main(["--apply"], { cwd: root });

  assert.ok(!fs.existsSync(scratchFile), "the tool-created, overdue scratch file should be unlinked");
  assert.ok(fs.existsSync(otherFile), "the human-made scratch file must survive - JUDGMENT never executes");

  const remaining = fs.readFileSync(registryPath, "utf8");
  assert.ok(!remaining.includes(scratchFile), "its registry line should be closed");
  assert.ok(remaining.includes(otherFile), "the other registry line must remain for a human to see");
  assert.equal(code, 1, "the surviving judgment entry is still a finding");
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

// BLOCKER 2: --apply unlinks any path on the machine a registry line names
test("BLOCKER 2: a registry line with created_by_tool:true whose ref is outside the project root (absolute, and relative ../ escape) is JUDGMENT, and --apply leaves the file on disk", () => {
  const root = initRepo();
  writeProjectConfig(root);

  const outsideDir = mkTmp("janitor-outside-");
  const outsideFile = path.join(outsideDir, "notes.txt");
  fs.writeFileSync(outsideFile, "precious\n");

  const registryPath = path.join(root, ".agents", "artifacts.jsonl");
  appendArtifact(
    {
      ref: outsideFile,
      kind: "scratch",
      owner: "builder-b",
      purpose: "absolute path outside root",
      end_condition: "date:2020-01-01",
      created_by_tool: true,
      created: new Date().toISOString(),
    },
    { registryPath },
  );

  // Relative-escape form: a ref like "../../victim.txt" resolved against the PROJECT ROOT (never
  // process.cwd()) so the same line means the same file no matter where janitor is invoked from.
  const victimParent = path.dirname(root);
  const victimFile = path.join(victimParent, "victim.txt");
  fs.writeFileSync(victimFile, "also precious\n");
  const relRef = path.relative(root, victimFile);
  appendArtifact(
    {
      ref: relRef,
      kind: "scratch",
      owner: "builder-b",
      purpose: "relative escape via ../",
      end_condition: "date:2020-01-01",
      created_by_tool: true,
      created: new Date().toISOString(),
    },
    { registryPath },
  );

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });
  assert.equal(state.safe.registryEntries.length, 0, "neither out-of-root ref may be classified SAFE");
  assert.equal(state.judgment.registryEntries.length, 2, "both must land in JUDGMENT");

  const code = main(["--apply"], { cwd: root });
  assert.equal(code, 1);
  assert.ok(fs.existsSync(outsideFile), "the absolute out-of-root file must survive --apply");
  assert.ok(fs.existsSync(victimFile), "the ../ escape target must survive --apply");

  fs.rmSync(victimFile, { force: true }); // clean up outside our own mkdtemp roots
});

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

// BLOCKER 4: a throw during --apply, after files were already deleted, produces zero output and exit 0
test("BLOCKER 4: when the registry cannot be rewritten mid-apply, --apply still reports what it deleted and never exits 0", () => {
  const root = initRepo();
  writeProjectConfig(root);
  const registryPath = path.join(root, ".agents", "artifacts.jsonl");
  const scratchFile = path.join(root, "scratch-one.txt");
  fs.writeFileSync(scratchFile, "scratch\n");
  appendArtifact(
    {
      ref: scratchFile,
      kind: "scratch",
      owner: "builder-b",
      purpose: "test scratch file",
      end_condition: "date:2020-01-01",
      created_by_tool: true,
      created: new Date().toISOString(),
    },
    { registryPath },
  );

  // Make the .agents directory unwritable so closeArtifact's mkdtempSync (needed only when a line
  // is actually removed, i.e. after the unlink already happened) throws.
  fs.chmodSync(path.join(root, ".agents"), 0o500);
  const logs = [];
  const errs = [];
  const origLog = console.log;
  const origErr = process.stderr.write.bind(process.stderr);
  console.log = (...args) => logs.push(args.join(" "));
  process.stderr.write = (s) => {
    errs.push(s);
    return true;
  };
  let code;
  try {
    code = main(["--apply"], { cwd: root });
  } finally {
    console.log = origLog;
    process.stderr.write = origErr;
    fs.chmodSync(path.join(root, ".agents"), 0o700); // restore so our own cleanup can remove it
  }

  assert.notEqual(code, 0, "a partially-executed destructive run must never report exit 0");
  // Every closeArtifact call in applySafe is individually try/caught (per the review's own
  // "wrap each closeArtifact call so one unwritable registry cannot abort the rest of the run"),
  // so this scenario never actually throws past applySafe - it fails soft, logs the failure, and
  // finishes the NORMAL report. The point of the test is what the reviewer's reproduction cared
  // about: this is never silent and never exit 0. Check the combined output (stdout table or
  // stderr) actually documents the failed registry-close and the file that was already unlinked.
  const combined = logs.join("\n") + errs.join("");
  assert.match(combined, /registry-close/, "the failed registry-close action must be documented somewhere in the output");
  assert.ok(!fs.existsSync(scratchFile), "the file was in fact already deleted (documenting the partial state, not preventing it)");
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
  const registryPath = resolveRegistryPath(toplevel, config.artifact_registry);

  const externalLog = [];
  applySafe(state, { registryPath, extraKinds: [] }, externalLog);
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
