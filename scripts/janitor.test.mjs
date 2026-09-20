// node --test scripts/janitor.test.mjs
//
// Builds real throwaway git repositories under os.tmpdir() for every scenario - no mocked git.
import test from "node:test";
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
} from "./janitor.mjs";
import { loadProjectConfig } from "./project-config.mjs";
import { appendArtifact } from "./artifact-registry.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

// ---------------------------------------------------------------------------

test("a merged clean worktree is SAFE; a dirty worktree is JUDGMENT regardless of merge state", () => {
  const root = initRepo();
  writeProjectConfig(root);

  const wtA = addWorktree(root, "feature-a");
  fs.writeFileSync(path.join(wtA, "a.txt"), "a\n");
  git(["add", "."], wtA);
  git(["commit", "-q", "-m", "a"], wtA);
  mergeIntoMain(root, "feature-a"); // now merged, and wtA is clean

  const wtB = addWorktree(root, "feature-b");
  fs.writeFileSync(path.join(wtB, "b.txt"), "uncommitted\n"); // never committed => dirty, unmerged

  const toplevel = gitToplevel(root);
  const { config } = loadProjectConfig(root);
  const state = gatherState({ root: toplevel, config });

  const safeRefs = state.safe.worktrees.map((w) => fs.realpathSync(w.ref));
  const judgmentRefs = state.judgment.worktrees.map((w) => fs.realpathSync(w.ref));
  assert.ok(safeRefs.includes(fs.realpathSync(wtA)), "merged + clean worktree should be SAFE");
  assert.ok(judgmentRefs.includes(fs.realpathSync(wtB)), "dirty worktree should be JUDGMENT");
  assert.ok(!judgmentRefs.includes(fs.realpathSync(wtA)));
  assert.ok(!safeRefs.includes(fs.realpathSync(wtB)));

  // and the merged branch behind it is SAFE at the branch level too
  assert.ok(state.safe.branches.some((b) => b.ref === "feature-a"));
});

test("--apply removes only the SAFE class; the dirty worktree and its branch survive untouched", () => {
  const root = initRepo();
  writeProjectConfig(root);

  const wtA = addWorktree(root, "feature-a");
  mergeIntoMain(root, "feature-a"); // merged, clean, no extra commit needed

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

  // judgment remains (the dirty worktree), so the run reports findings
  assert.equal(code, 1);
});

test("the current worktree and its branch are never touched, and main is never deleted, even when merged+clean", () => {
  const root = initRepo();
  // Deliberately no .agents/project.json here: writing one would leave an untracked file in
  // root's own tree, making the (unrelated) root worktree JUDGMENT-dirty and muddying this
  // assertion. Root falls back to project-config's defaults, which already match (main_branch
  // "main"), so the scenario stays exactly "one merged+clean worktree, which is also the current one".

  const wtC = addWorktree(root, "feature-c");
  mergeIntoMain(root, "feature-c"); // feature-c is now merged, and wtC is clean

  const toplevel = gitToplevel(wtC);
  const before = { worktrees: listWorktrees(toplevel).length, branches: listLocalBranches(toplevel).length };

  // Run STANDING IN wtC (the merged+clean worktree) - it must exclude itself and its own branch.
  const code = main(["--apply"], { cwd: wtC });

  const after = { worktrees: listWorktrees(toplevel).length, branches: listLocalBranches(toplevel).length };
  assert.deepEqual(after, before, "nothing should have been removed - the only candidate was the current worktree/branch");
  assert.ok(listLocalBranches(toplevel).includes("main"), "main branch must still exist");
  assert.ok(listLocalBranches(toplevel).includes("feature-c"), "the current branch must still exist");
  assert.equal(code, 0);
});

test("switch file ~/.agents/ws-off-janitor makes a run with real findings a silent exit 0", () => {
  const root = initRepo();
  writeProjectConfig(root);
  addWorktree(root, "feature-d");
  mergeIntoMain(root, "feature-d"); // a genuine SAFE finding exists

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

test("a malformed artifact registry line does not crash janitor - fail open, and the run still completes", () => {
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

test("registry: a tool-created single file past its end_condition is SAFE and --apply unlinks it and closes the line; a non-tool-created one is JUDGMENT only", () => {
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
