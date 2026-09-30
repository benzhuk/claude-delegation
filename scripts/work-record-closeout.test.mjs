// node --test scripts/work-record-closeout.test.mjs
//
// C1 rulings b and c (lane-closeout): `work-record.mjs close --closeout` steps 3-5 (worktree,
// local branch, origin branch, scratch directory) and `sweep-origin`. Ruling a and the "close"/
// "merge proof" steps of ruling b are covered in scripts/work-record.test.mjs, which already has
// the acceptance-fixture machinery those need; this file's fixtures start from an
// already-`Status: closed` record so every test here can go straight at steps 2-5 without
// re-deriving a whole accept/close transition first.
//
// Every fixture is a real, throwaway git repository plus a real, local BARE "origin" - per the
// contract, "Test it only against a local bare fixture origin" (ruling b) and "Tests use a bare
// fixture origin, never the real remote" (ruling c). Nothing here ever touches the real origin,
// the real ~/.agents, or a worktree outside this file's own fixtures. Every mkdtemp'd directory
// (repos, origins, worktrees, and scratch directories) is tracked and removed in one `after()`
// hook at the bottom, via node fs only - never a shell rm/rmdir/git-clean.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { childEnv } from "../skills/multi/scripts/test-child-env.mjs";
import { closeoutRecord, sweepOrigin, parseSweepOriginArgs, parseRecord } from "./work-record.mjs";

function git(args, cwd, env) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env });
}

const tracked = [];
function mkTmp(prefix) {
  // Same FIXTURE_ROOT-first convention as janitor.test.mjs/work-record.test.mjs: under a sealed
  // run-tests.mjs child this still resolves under the real os.tmpdir() (test-home.mjs builds
  // FIXTURE_ROOT itself under os.tmpdir()), so a scratch-directory fixture built directly under
  // os.tmpdir() elsewhere in this file is still a sibling of, not a stranger to, these repos.
  const dir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}

function fixtureEnv() {
  const home = mkTmp("closeout-git-home-");
  const gitConfigGlobal = path.join(home, ".gitconfig");
  fs.writeFileSync(gitConfigGlobal, "[user]\n\tname = Fixture\n\temail = fixture@example.invalid\n");
  // GIT_CONFIG_GLOBAL/GIT_CONFIG_NOSYSTEM must be set explicitly, not just HOME: under
  // run-tests.mjs's own sealed run, childEnv() already forwards the whole runner environment
  // it was given, which carries an outer GIT_CONFIG_GLOBAL (scoped, by its own includeIf, to ITS
  // OWN fixtureRoot) - a fixture built outside that root (as the repo-root scratch test below
  // must be, to keep `--by` as the literal first path segment under a real scratch root) would
  // silently inherit that path and never read this home's own .gitconfig at all, since
  // GIT_CONFIG_GLOBAL always wins over the implied $HOME/.gitconfig lookup.
  return childEnv(home, { GIT_CONFIG_GLOBAL: gitConfigGlobal, GIT_CONFIG_NOSYSTEM: "1" });
}

/** A repo with one commit on `main`, plus a local bare "origin" remote with `main` pushed. */
function buildRepo(env) {
  const repo = mkTmp("closeout-repo-");
  git(["init", "-q", "-b", "main"], repo, env);
  fs.writeFileSync(path.join(repo, "README.md"), "root\n");
  git(["add", "."], repo, env);
  git(["commit", "-q", "-m", "init"], repo, env);
  const origin = mkTmp("closeout-origin-");
  git(["init", "-q", "--bare", "-b", "main"], origin, env);
  git(["remote", "add", "origin", origin], repo, env);
  git(["push", "-q", "origin", "main"], repo, env);
  return { repo, origin };
}

/** Cuts `branch` off the repo's current HEAD, with one commit of its own, via a real `git
 * worktree add` (unless `worktree: false`, in which case the branch exists locally but was never
 * checked out anywhere - the "absent" case for closeoutWorktree). Returns the worktree path (or
 * null) and the branch's own tip sha. */
function cutBranch(repo, env, branch, { worktree = true } = {}) {
  git(["branch", branch], repo, env);
  if (!worktree) {
    const tip = git(["rev-parse", branch], repo, env).trim();
    return { wt: null, tip };
  }
  const wt = mkTmp("closeout-wt-");
  git(["worktree", "add", wt, branch], repo, env);
  fs.writeFileSync(path.join(wt, "work.txt"), `${branch}\n`);
  git(["add", "."], wt, env);
  git(["commit", "-q", "-m", `work on ${branch}`], wt, env);
  const tip = git(["rev-parse", "HEAD"], wt, env).trim();
  return { wt, tip };
}

function mergeNoFF(repo, env, branch) {
  git(["merge", "--no-ff", "-q", "-m", `merge ${branch}`, branch], repo, env);
}

function pushMain(repo, env) {
  git(["push", "-q", "origin", "main"], repo, env);
}

function pushBranch(repo, env, branch) {
  git(["push", "-q", "origin", branch], repo, env);
}

let scratchCounter = 0;
/** `--by` MUST be the literal path segment directly under a scratch root (ruling b item 5), so
 * this builds `<os.tmpdir()>/<by>/<lane>` - never nested inside FIXTURE_ROOT, which would insert
 * extra segments between the root and `by`. Tracked for its own node-fs cleanup in `after()`
 * (removeScratchDirectory only ever removes the leaf `<lane>` directory, by design). */
function mkScratchFixture(lane = "lane-1") {
  const by = `closeout-test-by-${++scratchCounter}`;
  const parent = path.join(os.tmpdir(), by);
  const dir = path.join(parent, lane);
  fs.mkdirSync(dir, { recursive: true });
  tracked.push(parent);
  return { by, scratchPath: dir, parent };
}

/** A minimal, already-`Status: closed` record - steps 2-5 only, per this file's own banner. */
function writeClosedRecord(repo, { work, worktree, artifact, leadSession, scratch, extra = {} }) {
  const fields = {
    Work: work,
    Scope: "docs/mandate-template.md@0000000",
    Owner: "lead",
    Status: "closed",
    Authority: "may accept after authorized integration",
    Artifact: artifact,
    Evidence: "none",
    Worktree: worktree,
    Next: "none",
    Opened: "2026-09-27T09:00:00Z",
    "Lead-session": leadSession,
    "Spec-session": "fixture-spec-session-1",
    "Spec-from": "2020-01-01T00:00:00Z",
    Scratch: scratch,
    ...extra,
  };
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`);
  lines.push(`Log: 2026-09-27T09:30:00Z closed lead ${work}`);
  const recordRel = path.join("docs", "work", `${work}.record.md`);
  fs.mkdirSync(path.join(repo, "docs", "work"), { recursive: true });
  fs.writeFileSync(path.join(repo, recordRel), [...lines, "", "Prose body."].join("\n"));
  return recordRel;
}

function stepsOf(result) {
  const out = {};
  for (const s of result.steps) out[s.step] = s;
  return out;
}

// ── Worktree and local branch (ruling b item 3) ─────────────────────────────────────

test("closeoutRecord: a clean worktree is removed and its local branch deleted with -d (never -D); the origin's own tip proves the merge, so no force is ever needed", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/wt-clean-1";
  const { wt, tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-wt-clean", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.worktree.result, "removed");
  assert.equal(steps.branch.result, "removed");
  assert.equal(fs.existsSync(wt), false);
  assert.equal(git(["branch", "--list", branch], repo, env).trim(), "");
});

test("closeoutRecord: a dirty worktree is reported 'dirty' and left in place - never forced", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/wt-dirty-1";
  const { wt, tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  fs.writeFileSync(path.join(wt, "uncommitted.txt"), "dirty\n"); // untracked - isTreeClean() must see this
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-wt-dirty", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.worktree.result, "dirty");
  assert.equal(fs.existsSync(wt), true, "a dirty worktree must never be removed");
  assert.equal(fs.existsSync(path.join(wt, "uncommitted.txt")), true);
  assert.equal(result.exitCode, 2);
});

// F1/L4 (C1 round 2, CRITICAL): an IGNORED file (never untracked or modified) must still make the
// worktree 'dirty' - round 1's isTreeClean only gated the DRY-RUN path with this; the LIVE path
// called `git worktree remove` (unforced) directly, which silently DELETES ignored files even
// though it refuses on untracked/modified ones. The reviewer's own repro (e1-ignored.mjs) is what
// found this.
test("closeoutRecord: F1 - a worktree with ONLY an ignored file (no untracked/modified) is still 'dirty', left in place, and the ignored file survives", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/wt-ignored-1";
  const { wt, tip } = cutBranch(repo, env, branch);
  fs.writeFileSync(path.join(wt, ".gitignore"), "ignored-file\n");
  git(["add", ".gitignore"], wt, env);
  git(["commit", "-q", "-m", "gitignore"], wt, env);
  const finalTip = git(["rev-parse", "HEAD"], wt, env).trim();
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  fs.writeFileSync(path.join(wt, "ignored-file"), "secret\n"); // matched by .gitignore above, never staged
  const status = git(["status", "--porcelain", "--ignored"], wt, env).trim();
  assert.match(status, /^!! ignored-file$/m, "fixture sanity: the file must actually be reported ignored, not untracked");
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-wt-ignored", worktree: branch, artifact: `${branch}@${finalTip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.worktree.result, "dirty");
  assert.match(steps.worktree.detail, /ignored/);
  assert.equal(fs.existsSync(wt), true, "the worktree must survive");
  assert.equal(fs.existsSync(path.join(wt, "ignored-file")), true, "the ignored file itself must survive - this is exactly what `git worktree remove` (unforced) would otherwise silently delete");
  assert.equal(result.exitCode, 2);
});

test("closeoutRecord: refuses the main worktree", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const { scratchPath, by } = mkScratchFixture();
  // Worktree: "." resolves to repo itself, which `git worktree list` reports as the main entry.
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-wt-main", worktree: ".", artifact: `docs/mandate-template.md@${git(["rev-parse", "HEAD"], repo, env).trim()}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.worktree.result, "refused");
  assert.match(steps.worktree.detail, /main worktree/);
});

test("closeoutRecord: refuses the worktree that contains process.cwd()", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/wt-cwd-1";
  const { wt, tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-wt-cwd", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const cwdBefore = process.cwd();
  process.chdir(wt);
  let result;
  try {
    result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  } finally {
    process.chdir(cwdBefore);
  }
  const steps = stepsOf(result);
  assert.equal(steps.worktree.result, "refused");
  assert.match(steps.worktree.detail, /process\.cwd\(\)/);
  assert.equal(fs.existsSync(wt), true);
});

test("closeoutRecord: merge proof - an Artifact: sha not an ancestor of origin/main refuses every one of the four cleanup steps, with a fetch that itself succeeds", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  // A commit that exists locally but was never pushed - `git fetch origin` succeeds (origin is a
  // real, reachable bare repo), but the artifact sha itself is not an ancestor of origin/main.
  fs.writeFileSync(path.join(repo, "unpushed.txt"), "never pushed\n");
  git(["add", "."], repo, env);
  git(["commit", "-q", "-m", "unpushed work"], repo, env);
  const unpushedSha = git(["rev-parse", "HEAD"], repo, env).trim();
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-merge-proof-unmerged", worktree: ".", artifact: `docs/mandate-template.md@${unpushedSha}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  assert.equal(result.exitCode, 2);
  assert.equal(result.ok, false);
  for (const step of ["worktree", "branch", "origin-branch", "scratch"]) {
    const row = result.steps.find((s) => s.step === step);
    assert.equal(row.result, "refused", `step ${step}`);
    assert.match(row.detail, /is not an ancestor of origin\/main/, `step ${step}`);
  }
});

// ── Artifact-repo: (lane 60b, docs/specs/artifact-repo-60b/spec.md) ─────────────────────────
// A work record whose artifact lives in another git repository - the close/cleanup half of
// spec.md's own numbered tests (accept/check-acceptance are covered in work-record.test.mjs,
// which already has that fixture machinery). Repo B here is a second, wholly independent
// `buildRepo` fixture, never repo A's own worktree list or origin.

// Test 7: close with Artifact-repo: checks ancestry against repo B's origin/main (after a fetch
// THERE), and refuses when the artifact is not merged there - never checking repo A's origin/main
// for this (repo A's origin/main never even has the sha to ask about).
test("closeoutRecord: merge proof with Artifact-repo: fetches and checks ancestry in repo B, refusing when the artifact is not merged into repo B's origin/main", () => {
  const env = fixtureEnv();
  const { repo: repoA } = buildRepo(env);
  const { repo: repoB } = buildRepo(env);
  const repoBPosix = repoB.split(path.sep).join("/");
  // A commit that exists locally in repo B but was never pushed there - repo B's own
  // `git fetch origin` succeeds (repo B has a real, reachable bare origin), but the artifact sha
  // itself is not an ancestor of repo B's origin/main.
  fs.writeFileSync(path.join(repoB, "unpushed.txt"), "never pushed in repo B\n");
  git(["add", "."], repoB, env);
  git(["commit", "-q", "-m", "unpushed work in repo B"], repoB, env);
  const unpushedShaInB = git(["rev-parse", "HEAD"], repoB, env).trim();
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repoA, {
    work: "wr-2026-09-30-artifact-repo-merge-proof",
    worktree: repoBPosix,
    artifact: `territory/a@${unpushedShaInB}`,
    leadSession: by,
    scratch: scratchPath,
    extra: { "Artifact-repo": repoBPosix },
  });
  const result = closeoutRecord({ repoRoot: repoA, recordPath: recordRel, closeoutBy: by });
  assert.equal(result.exitCode, 2);
  assert.equal(result.ok, false);
  for (const step of ["worktree", "branch", "origin-branch", "scratch"]) {
    const row = result.steps.find((s) => s.step === step);
    assert.equal(row.result, "refused", `step ${step}`);
    assert.match(row.detail, /is not an ancestor of origin\/main/, `step ${step}`);
  }
});

// Test 8: cleanup never touches repo B - the worktree/branch/origin-branch steps refuse by name
// (artifact-repo: cleanup is manual) rather than ever running against a foreign repository's
// worktrees or branches, even when the merge proof itself passes clean. Scratch is unaffected.
test("closeoutRecord: Artifact-repo: refuses the worktree/branch/origin-branch cleanup steps as manual, and never touches repo B's branch", () => {
  const env = fixtureEnv();
  const { repo: repoA } = buildRepo(env);
  const { repo: repoB, origin: originB } = buildRepo(env);
  const repoBPosix = repoB.split(path.sep).join("/");
  const branchB = "build/artifact-repo-b-1";
  const { tip: tipB } = cutBranch(repoB, env, branchB, { worktree: false });
  mergeNoFF(repoB, env, branchB);
  pushMain(repoB, env);
  pushBranch(repoB, env, branchB);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repoA, {
    work: "wr-2026-09-30-artifact-repo-cleanup-manual",
    worktree: branchB,
    artifact: `territory/a@${tipB}`,
    leadSession: by,
    scratch: scratchPath,
    extra: { "Artifact-repo": repoBPosix },
  });
  const result = closeoutRecord({ repoRoot: repoA, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.worktree.result, "refused");
  assert.match(steps.worktree.detail, /artifact-repo: cleanup is manual/);
  assert.equal(steps.branch.result, "refused");
  assert.match(steps.branch.detail, /artifact-repo: cleanup is manual/);
  assert.equal(steps["origin-branch"].result, "refused");
  assert.match(steps["origin-branch"].detail, /artifact-repo: cleanup is manual/);
  // Scratch is unaffected by Artifact-repo: - it still runs, still removing the lead's own scratch
  // directory (never anything in repo B).
  assert.equal(steps.scratch.result, "removed");
  assert.equal(fs.existsSync(scratchPath), false);
  // Repo B itself: the branch this record's Worktree: names must survive untouched, both locally
  // and on its own origin - cleanup must never have run against it.
  assert.notEqual(git(["branch", "--list", branchB], repoB, env).trim(), "");
  assert.match(git(["ls-remote", "--heads", originB, branchB], repoB, env), new RegExp(branchB.replace(/\//g, "\\/")));
});

// ── Lane 60b review round 1 (ruling-r1.md): F1 and F4's closeout tests, all adopted ─────────

// F1 (MAJOR): the scratch step must also see the Artifact-repo: repository's own worktrees, or a
// scratch directory that contains (or lies inside) one of them is removed right along with it -
// losing uncommitted work and leaving repo B with a dangling worktree admin entry. Reproduces the
// review's own probe: a repo B linked worktree registered INSIDE the lane's Scratch: directory.
test("closeoutRecord: F1 - the scratch step also sees Artifact-repo:'s own worktrees, refusing a scratch directory that contains one", () => {
  const env = fixtureEnv();
  const { repo: repoA } = buildRepo(env);
  const { repo: repoB } = buildRepo(env);
  const repoBPosix = repoB.split(path.sep).join("/");
  const { scratchPath, by } = mkScratchFixture();
  // A real, registered linked worktree of repo B, nested INSIDE the scratch directory, with
  // uncommitted work in it - exactly what the F1 probe describes.
  const wtBranch = "scratch-worktree-branch";
  git(["branch", wtBranch], repoB, env);
  const wtDir = path.join(scratchPath, "repoB-linked-wt");
  git(["worktree", "add", wtDir, wtBranch], repoB, env);
  fs.writeFileSync(path.join(wtDir, "uncommitted.txt"), "uncommitted work\n");
  const bTip = git(["rev-parse", "main"], repoB, env).trim();
  const recordRel = writeClosedRecord(repoA, {
    work: "wr-2026-09-30-artifact-repo-f1-scratch",
    worktree: wtBranch,
    artifact: `territory/a@${bTip}`,
    leadSession: by,
    scratch: scratchPath,
    extra: { "Artifact-repo": repoBPosix },
  });
  const result = closeoutRecord({ repoRoot: repoA, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  // Merge proof passes (bTip is main's own tip in repo B, an ancestor of itself) - so scratch is
  // the only step in question here; worktree/branch/origin-branch are still refused as manual.
  assert.equal(steps.scratch.result, "refused", steps.scratch.detail);
  assert.match(steps.scratch.detail, /contains a path in git worktree list/);
  assert.equal(fs.existsSync(scratchPath), true, "the scratch directory must survive");
  assert.equal(fs.existsSync(wtDir), true, "repo B's linked worktree, and its uncommitted work, must survive");
});

// F1, fail-closed half (ruling-r1.md): when Artifact-repo:'s own worktree list cannot be read, the
// scratch step refuses - it never falls back to repoRoot's list alone.
test("closeoutRecord: F1 - an unreadable Artifact-repo: worktree list refuses the scratch step, never removes", () => {
  const env = fixtureEnv();
  const { repo: repoA } = buildRepo(env);
  const { repo: repoB } = buildRepo(env);
  const repoBPosix = repoB.split(path.sep).join("/");
  const bTip = git(["rev-parse", "main"], repoB, env).trim();
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repoA, {
    work: "wr-2026-09-30-artifact-repo-f1-fail-closed",
    worktree: "main",
    artifact: `territory/a@${bTip}`,
    leadSession: by,
    scratch: scratchPath,
    extra: { "Artifact-repo": repoBPosix },
  });
  const listWorktreesImpl = (root) => (path.resolve(root) === path.resolve(repoB) ? null : []);
  const result = closeoutRecord({ repoRoot: repoA, recordPath: recordRel, closeoutBy: by, listWorktreesImpl });
  const steps = stepsOf(result);
  assert.match(steps.worktree.detail, /artifact-repo: cleanup is manual/); // merge proof passed
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /could not read git worktree list/);
  assert.equal(fs.existsSync(scratchPath), true, "the scratch directory must survive");
});

// F4 (MEDIUM), mutants M9/M10: the merge proof's fetch must run in the Artifact-repo: repository
// itself, and a fetch failure there must be reported (never silently ignored) - test 7 above
// can't tell the two apart, because its unpushed commit refuses "not an ancestor" whether or not
// any fetch ran at all.

// F4 test 1 (kills M9/M10): repo B's own local origin/main is stale relative to its real
// origin - a fetch that genuinely runs there is required before the artifact (only just merged
// and pushed by a second checkout) can be proven an ancestor.
test("closeoutRecord: F4 - the merge proof fetches inside Artifact-repo: itself, seeing past a stale local origin/main there", () => {
  const env = fixtureEnv();
  const { repo: repoA } = buildRepo(env);
  const { repo: repoB, origin: originB } = buildRepo(env);
  const repoBPosix = repoB.split(path.sep).join("/");
  // A second checkout of repo B's own origin - repo B's own local refs/remotes/origin/main stays
  // exactly where it was at buildRepo() time until something fetches there.
  const repoB2 = mkTmp("closeout-repoB2-");
  git(["clone", "-q", originB, repoB2], undefined, env);
  git(["checkout", "-q", "-b", "feature"], repoB2, env);
  fs.writeFileSync(path.join(repoB2, "feature.txt"), "feature work\n");
  git(["add", "."], repoB2, env);
  git(["commit", "-q", "-m", "feature work"], repoB2, env);
  git(["checkout", "-q", "main"], repoB2, env);
  mergeNoFF(repoB2, env, "feature");
  pushMain(repoB2, env);
  const newSha = git(["rev-parse", "main"], repoB2, env).trim();
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repoA, {
    work: "wr-2026-09-30-artifact-repo-f4-stale-ref",
    worktree: "main",
    artifact: `territory/a@${newSha}`,
    leadSession: by,
    scratch: scratchPath,
    extra: { "Artifact-repo": repoBPosix },
  });
  const result = closeoutRecord({ repoRoot: repoA, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  // A fetch that ran in repo B itself (never repo A) sees the just-pushed commit, so the merge
  // proof passes; only the manual-refusal reason should show, never "not an ancestor".
  assert.equal(steps.worktree.result, "refused");
  assert.match(steps.worktree.detail, /artifact-repo: cleanup is manual/);
  assert.doesNotMatch(steps.worktree.detail, /is not an ancestor/);
});

// F4 test 2 (kills M9): a fetch failure inside Artifact-repo: must block every step with
// UNVERIFIABLE, never be silently ignored in favor of whatever origin/main last held there.
test("closeoutRecord: F4 - a fetch failure inside Artifact-repo: refuses every step UNVERIFIABLE, never silently ignored", () => {
  const env = fixtureEnv();
  const { repo: repoA } = buildRepo(env);
  const { repo: repoB } = buildRepo(env);
  const repoBPosix = repoB.split(path.sep).join("/");
  const bTip = git(["rev-parse", "main"], repoB, env).trim();
  // Break repo B's own origin so `git fetch --prune origin` genuinely fails there - repo A's own
  // origin is completely untouched.
  const nonexistentOrigin = path.join(mkTmp("closeout-nonexistent-parent-"), "does-not-exist");
  git(["remote", "set-url", "origin", nonexistentOrigin], repoB, env);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repoA, {
    work: "wr-2026-09-30-artifact-repo-f4-fetch-fail",
    worktree: "main",
    artifact: `territory/a@${bTip}`,
    leadSession: by,
    scratch: scratchPath,
    extra: { "Artifact-repo": repoBPosix },
  });
  const result = closeoutRecord({ repoRoot: repoA, recordPath: recordRel, closeoutBy: by });
  assert.equal(result.exitCode, 2);
  assert.equal(result.ok, false);
  for (const step of ["worktree", "branch", "origin-branch", "scratch"]) {
    const row = result.steps.find((s) => s.step === step);
    assert.equal(row.result, "refused", `step ${step}`);
    assert.match(row.detail, /UNVERIFIABLE: fetch failed/, `step ${step}`);
  }
});

// R2-8 (C1 round 3), narrowed by the round-4 idempotent-closeout ruling: a record naming a branch
// that genuinely never had a worktree is no longer a blanket refusal - the branch it names really
// exists (only the WORKTREE half is absent), so closeout goes on to remove that branch, and the
// rest of the record, as usual.
test("closeoutRecord: R2-8/round-4 - a Worktree: naming a branch whose worktree directory is already gone reports the worktree step absent and still removes the branch, exit 0", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/wt-absent-1";
  // A real commit of its own (not the zero-commit `{ worktree: false }` form), so the branch's
  // tip is distinct from main's - the worktree directory is removed by hand BEFORE closeout ever
  // runs, exactly like a worktree the janitor sweep (or an earlier closeout) already cleaned up.
  const { wt, tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  git(["worktree", "remove", "--force", wt], repo, env);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-wt-absent", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.worktree.result, "absent");
  assert.equal(steps.branch.result, "removed");
  assert.equal(git(["branch", "--list", branch], repo, env).trim(), "", "the local branch must actually be gone now");
  assert.equal(result.exitCode, 0);
});

test("closeoutRecord: --dry-run performs no git mutation for the worktree/branch steps and prints 'would ...' lines", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/wt-dry-1";
  const { wt, tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-wt-dry", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by, dryRun: true });
  const steps = stepsOf(result);
  assert.equal(steps.worktree.result, "removed");
  assert.equal(steps.branch.result, "removed");
  assert.ok(result.lines.some((l) => l.startsWith("worktree: would removed") || l.includes("worktree: would ")), result.lines.join("\n"));
  assert.equal(fs.existsSync(wt), true, "--dry-run must not remove the worktree");
  assert.notEqual(git(["branch", "--list", branch], repo, env).trim(), "", "--dry-run must not delete the branch");
  assert.equal(fs.existsSync(scratchPath), true, "--dry-run must not remove the scratch directory");
});

// ── Origin branch (ruling b item 4 / ruling c) ──────────────────────────────────────

test("closeoutRecord: origin-branch refuses a branch not under build/ (main, docs/*, feat/*)", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    // "main" itself is on origin, and is not under build/ - the cheapest fixture for this reason.
    work: "wr-2026-09-27-ob-notbuild", worktree: "main", artifact: `docs/mandate-template.md@${git(["rev-parse", "HEAD"], repo, env).trim()}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps["origin-branch"].result, "refused");
  assert.match(steps["origin-branch"].detail, /not under build\//);
});

// M6: the "not under build/" check was previously tested with only one fixture ("main") - these
// two round out the regex with the two other named examples from the finding (docs/*, feat/*).
for (const name of ["docs/some-file", "feat/some-feature"]) {
  test(`closeoutRecord: origin-branch refuses a branch not under build/ - ${name} (M6)`, () => {
    const env = fixtureEnv();
    const { repo } = buildRepo(env);
    const { scratchPath, by } = mkScratchFixture();
    const recordRel = writeClosedRecord(repo, {
      work: `wr-2026-09-27-ob-notbuild-${name.replace("/", "-")}`, worktree: name, artifact: `docs/mandate-template.md@${git(["rev-parse", "HEAD"], repo, env).trim()}`, leadSession: by, scratch: scratchPath,
    });
    const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
    const steps = stepsOf(result);
    assert.equal(steps["origin-branch"].result, "refused");
    assert.match(steps["origin-branch"].detail, /not under build\//);
  });
}

test("closeoutRecord: origin-branch refuses a branch that is not this record's own (another record, of ANY status, already claims the same branch)", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/ob-notown-1";
  const { tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const { scratchPath, by } = mkScratchFixture();
  writeClosedRecord(repo, {
    work: "wr-2026-09-27-ob-notown-other", worktree: branch, artifact: `${branch}@${tip}`, leadSession: "some-other-session", scratch: scratchPath,
    extra: { Status: "closed" },
  });
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-ob-notown-self", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: mkScratchFixture().scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps["origin-branch"].result, "refused");
  assert.match(steps["origin-branch"].detail, /not this record's own/);
});

test("closeoutRecord: origin-branch refuses a branch named by another record under docs/work/ whose Status is neither closed nor withdrawn", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/ob-active-1";
  const { tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const { scratchPath, by } = mkScratchFixture();
  writeClosedRecord(repo, {
    work: "wr-2026-09-27-ob-active-other", worktree: branch, artifact: `${branch}@${tip}`, leadSession: "some-other-session", scratch: mkScratchFixture().scratchPath,
    extra: { Status: "owned" },
  });
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-ob-active-self", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps["origin-branch"].result, "refused");
  assert.match(steps["origin-branch"].detail, /not closed\/withdrawn/);
});

test("closeoutRecord: origin-branch refuses a tip that is not an ancestor of origin/main (never merged)", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/ob-unmerged-1";
  const { tip } = cutBranch(repo, env, branch); // never merged into main
  pushBranch(repo, env, branch);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-ob-unmerged", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps["origin-branch"].result, "refused");
  assert.match(steps["origin-branch"].detail, /not an ancestor/);
});

test("closeoutRecord: origin-branch refuses a tip equal to origin/main's current sha", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/ob-atmain-1";
  git(["branch", branch], repo, env); // cut, but no new commit: tip === main's tip
  pushBranch(repo, env, branch);
  const tip = git(["rev-parse", "main"], repo, env).trim();
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-ob-atmain", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps["origin-branch"].result, "refused");
  assert.match(steps["origin-branch"].detail, /equals origin\/main's current sha/);
});

test("closeoutRecord: origin-branch refuses a tip that is an ancestor of origin/main but was fast-forwarded in, never behind a --no-ff merge commit", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/ob-ff-1";
  const { tip } = cutBranch(repo, env, branch);
  git(["merge", "--ff-only", "-q", branch], repo, env); // no merge commit: main's tip becomes the branch tip
  // one more plain commit on main so the branch's tip is a strict, non-equal ancestor of main's
  // CURRENT tip (otherwise this would hit "equals origin/main's current sha" first).
  fs.writeFileSync(path.join(repo, "further.txt"), "further\n");
  git(["add", "."], repo, env);
  git(["commit", "-q", "-m", "further"], repo, env);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-ob-ff", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps["origin-branch"].result, "refused");
  assert.match(steps["origin-branch"].detail, /not on the mainline behind a merge commit/);
});

test("closeoutRecord: origin-branch removes a branch merged via a --no-ff merge commit and proven safe, printing its tip sha and a restore command", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/ob-delete-1";
  const { tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-ob-delete", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps["origin-branch"].result, "removed");
  assert.equal(steps["origin-branch"].sha, tip);
  const line = result.lines.find((l) => l.startsWith("origin-branch:"));
  assert.match(line, new RegExp(`restore: git push origin ${tip}:refs/heads/${branch.replace("/", "\\/")}`));
  // and it is actually gone from the bare origin:
  const remoteList = git(["ls-remote", "--heads", "origin", branch], repo, env).trim();
  assert.equal(remoteList, "");
});

// evaluateOriginBranch's seventh reason ("isRemoteBranchMergedIntoOrigin does not report this
// branch as merged") is a defence-in-depth re-check of the SAME ancestry fact the earlier
// "tip is not an ancestor of origin/main" step already proves true before this one ever runs
// (both read origin/<name> vs origin/main; see work-record.mjs's own comment on
// evaluateOriginBranch) - so a live fixture can never desynchronize the two without a mid-call
// mutation this suite has no hook for. Proven by source instead, the same way this codebase
// already proves its one other unreachable-live-without-a-fault-injection branch (janitor.test.mjs,
// "J1 round 2 MINOR 4").
test("closeoutRecord/sweepOrigin: origin-branch's evaluateOriginBranch calls isRemoteBranchMergedIntoOrigin and refuses on it, as the last of the seven origin-branch checks", () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, "work-record.mjs"), "utf8");
  const fnMatch = /function evaluateOriginBranch\([\s\S]*?\n\}\n/.exec(src);
  assert.ok(fnMatch, "evaluateOriginBranch must be found in the source");
  const body = fnMatch[0];
  // C1 round 2 F4: evaluateOriginBranch compares against normName (normalizeBranchName(name)),
  // not the raw name, so "origin/build/x"/"refs/heads/build/x"/"build/x/" all match the same way.
  assert.match(body, /if \(!isRemoteBranchMergedIntoOrigin\(root, normName, mainBranch\)\)/);
  assert.match(body, /isRemoteBranchMergedIntoOrigin does not report this branch as merged/);
  // and it is the LAST check before the "delete" verdict:
  const idx = body.indexOf("isRemoteBranchMergedIntoOrigin does not report");
  const deleteIdx = body.indexOf('verdict: "delete"');
  assert.ok(idx > 0 && deleteIdx > idx, "isRemoteBranchMergedIntoOrigin must be the last gate before a delete verdict");
});

// ── Scratch directory (ruling b item 5) ─────────────────────────────────────────────

function closedFixtureForScratch(env) {
  const { repo } = buildRepo(env);
  const branch = "build/scratch-fixture-1";
  const { tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  return { repo, branch, tip };
}

test("closeoutRecord: scratch step refuses when --by does not match the record's Lead-session:", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-sc-bymismatch", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: "someone-else-session" });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /does not match this record's Lead-session/);
  assert.equal(fs.existsSync(scratchPath), true);
});

test("closeoutRecord: scratch step refuses a path that does not resolve under a scratch root with --by as a whole segment strictly between the root and the target", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const by = "closeout-test-by-notroot";
  // Not under any scratch root at all - inside the repo itself.
  const badPath = path.join(repo, "not-a-scratch-dir");
  fs.mkdirSync(badPath, { recursive: true });
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-sc-notroot", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: badPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /does not resolve under a scratch root/);
  assert.equal(fs.existsSync(badPath), true);
});

test("closeoutRecord: scratch step refuses the session directory itself (--by is not a whole segment STRICTLY between the root and the target)", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const by = `closeout-test-by-selfdir-${++scratchCounter}`;
  const sessionDir = path.join(os.tmpdir(), by);
  fs.mkdirSync(sessionDir, { recursive: true });
  tracked.push(sessionDir);
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-sc-selfdir", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: sessionDir,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /whole path segment strictly between/);
  assert.equal(fs.existsSync(sessionDir), true);
});

// L6/F8 (C1 round 2, MAJOR): the real scratch layout is
// `/tmp/claude-<uid>/<project>/<session-id>/scratchpad/<lane>` - the session id (--by) sits
// several segments BELOW the root, not directly under it. Round 1 only matched `segments[0] ===
// by`, which never matched this project's own real layout at all.
test("closeoutRecord: scratch step accepts the REAL scratch layout - <root>/<project>/<session-id>/scratchpad/<lane>, --by several segments below the root", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const by = `closeout-test-by-deeplayout-${++scratchCounter}`;
  const root = mkTmp("closeout-scratch-root-");
  const target = path.join(root, "-home-ben-Code-claude-delegation", by, "scratchpad", "lane-closeout");
  fs.mkdirSync(target, { recursive: true });
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-sc-deeplayout", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: target,
  });
  const prevRoots = process.env.DELEGATION_SCRATCH_ROOTS;
  process.env.DELEGATION_SCRATCH_ROOTS = root;
  let result;
  try {
    result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  } finally {
    if (prevRoots === undefined) delete process.env.DELEGATION_SCRATCH_ROOTS;
    else process.env.DELEGATION_SCRATCH_ROOTS = prevRoots;
  }
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "removed");
  assert.equal(fs.existsSync(target), false);
});

// L6/F8: the SESSION directory itself (one level above scratchpad/<lane>) is still refused even
// under this deep, real layout - --by must be a segment STRICTLY between the root and the target,
// at any depth, never the target's own last segment.
test("closeoutRecord: scratch step refuses the session directory itself even under the deep real layout (--by still not strictly between root and target)", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const by = `closeout-test-by-deeplayout-selfdir-${++scratchCounter}`;
  const root = mkTmp("closeout-scratch-root-");
  const sessionDir = path.join(root, "-home-ben-Code-claude-delegation", by);
  fs.mkdirSync(sessionDir, { recursive: true });
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-sc-deeplayout-selfdir", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: sessionDir,
  });
  const prevRoots = process.env.DELEGATION_SCRATCH_ROOTS;
  process.env.DELEGATION_SCRATCH_ROOTS = root;
  let result;
  try {
    result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  } finally {
    if (prevRoots === undefined) delete process.env.DELEGATION_SCRATCH_ROOTS;
    else process.env.DELEGATION_SCRATCH_ROOTS = prevRoots;
  }
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /whole path segment strictly between/);
  assert.equal(fs.existsSync(sessionDir), true);
});

// F9 (C1 round 2, MAJOR): a Scratch: value recorded on the OTHER OS's path convention is refused
// OUTRIGHT at delete time (never resolved against this host's own cwd), even though
// checkScratchField (validation) accepts it. Driven through the test-only `platform` param, the
// same convention this codebase already uses elsewhere (codex-hook-trust.test.mjs,
// install-janitor-timer.test.mjs) instead of monkeypatching process.platform.
test("closeoutRecord: scratch step refuses a value in the WRONG OS's path convention for the current host, via the test-only platform param", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const by = `closeout-test-by-otheros-${++scratchCounter}`;
  const winPath = `C:\\Users\\${by}\\AppData\\Local\\Temp\\lane-closeout`;
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-sc-otheros", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: winPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by, platform: "linux" });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /not absolute on this host/);
});

test("closeoutRecord: scratch step refuses a symlinked target, and never follows it", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const { by, parent } = mkScratchFixture();
  const realTarget = path.join(parent, "real-target");
  fs.mkdirSync(realTarget, { recursive: true });
  const linkPath = path.join(parent, "lane-1"); // mkScratchFixture already made a real "lane-1" dir; replace it with a symlink
  fs.rmSync(linkPath, { recursive: true });
  try {
    fs.symlinkSync(realTarget, linkPath, "dir");
  } catch (err) {
    // Some sandboxes refuse symlink creation outright - skip rather than false-fail the suite.
    assert.ok(err, "symlink creation refused by the environment - scratch-symlink case skipped");
    return;
  }
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-sc-symlink", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: linkPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /symlink/);
  assert.equal(fs.existsSync(realTarget), true, "the symlink's real target must survive");
});

// M6: a symlinked ANCESTOR (not the target itself) that changes the real path is a distinct
// refusal branch from "target is a symlink" above - this pins that one directly.
test("closeoutRecord: scratch step refuses a target whose ANCESTOR (not the target itself) is a symlink, changing its real path", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const by = `closeout-test-by-ancestorlink-${++scratchCounter}`;
  const realBase = mkTmp("closeout-symlink-realbase-");
  const realLane = path.join(realBase, "lane-1");
  fs.mkdirSync(realLane, { recursive: true });
  const sessionLink = path.join(os.tmpdir(), by);
  try {
    fs.symlinkSync(realBase, sessionLink, "dir");
  } catch (err) {
    assert.ok(err, "symlink creation refused by the environment - ancestor-symlink case skipped");
    return;
  }
  tracked.push(sessionLink);
  const scratchPath = path.join(sessionLink, "lane-1");
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-sc-ancestorlink", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /symlinked ancestor/);
  assert.equal(fs.existsSync(realLane), true, "the real directory behind the symlinked ancestor must survive");
});

test("closeoutRecord: scratch step refuses the repo root, and refuses a path in git worktree list", () => {
  // Scratch: must resolve under a scratch root with --by as the segment right under it (ruling b
  // item 5) - so, unlike this file's other fixtures, the repo itself has to live AT
  // <tmpdir>/<by>/repo for "Scratch: == repo root" to ever reach the repo-root check at all.
  const byRoot = `closeout-test-by-reporoot-${++scratchCounter}`;
  const rootParent = path.join(os.tmpdir(), byRoot);
  fs.mkdirSync(rootParent, { recursive: true });
  tracked.push(rootParent);
  const repo = path.join(rootParent, "repo");
  fs.mkdirSync(repo);
  const env = fixtureEnv();
  git(["init", "-q", "-b", "main"], repo, env);
  fs.writeFileSync(path.join(repo, "README.md"), "root\n");
  git(["add", "."], repo, env);
  git(["commit", "-q", "-m", "init"], repo, env);
  const origin = mkTmp("closeout-origin-");
  git(["init", "-q", "--bare", "-b", "main"], origin, env);
  git(["remote", "add", "origin", origin], repo, env);
  git(["push", "-q", "origin", "main"], repo, env);
  const branch = "build/sc-reporoot-1";
  const { tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const rootRecordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-sc-reporoot", worktree: branch, artifact: `${branch}@${tip}`, leadSession: byRoot, scratch: repo,
  });
  const rootResult = closeoutRecord({ repoRoot: repo, recordPath: rootRecordRel, closeoutBy: byRoot });
  const rootSteps = stepsOf(rootResult);
  assert.equal(rootSteps.scratch.result, "refused");
  assert.match(rootSteps.scratch.detail, /repo root/);

  // a path in `git worktree list` - the repo's OWN worktree checkout is a scratch root's own
  // descendant when it happens to live under os.tmpdir(); build one explicitly there.
  const by = `closeout-test-by-wtlist-${++scratchCounter}`;
  const worktreesParent = path.join(os.tmpdir(), by);
  const worktreePath = path.join(worktreesParent, "lane-1");
  fs.mkdirSync(worktreesParent, { recursive: true });
  tracked.push(worktreesParent);
  git(["worktree", "add", worktreePath, "-b", "build/sc-wtlist-1"], repo, env);
  const wtRecordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-sc-wtlist", worktree: "build/ob-delete-1-does-not-exist", artifact: `docs/mandate-template.md@${git(["rev-parse", "HEAD"], repo, env).trim()}`, leadSession: by, scratch: worktreePath,
  });
  const wtResult = closeoutRecord({ repoRoot: repo, recordPath: wtRecordRel, closeoutBy: by });
  const wtSteps = stepsOf(wtResult);
  assert.equal(wtSteps.scratch.result, "refused");
  assert.match(wtSteps.scratch.detail, /git worktree list/);
});

// L5 REPLACED (C1 round 3 ruling): the round-2 recursive `.git` walk is dropped - lanes keep
// fixture git repos in their own scratch, so the walk refused almost every real closeout (R2-5).
// An UNREGISTERED git repo (one `git worktree list` does not report) inside the lead's own
// session scratch is throwaway by construction, and is removed WITH the directory, same as any
// other file in scratch.
test("closeoutRecord: L5 replaced - scratch step REMOVES a directory containing an unregistered .git entry (the round-2 walk is dropped)", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const { scratchPath, by } = mkScratchFixture();
  const nestedRepo = path.join(scratchPath, "fixture-repo");
  fs.mkdirSync(nestedRepo, { recursive: true });
  git(["init", "-q"], nestedRepo, env);
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-sc-gitentry", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "removed");
  assert.equal(fs.existsSync(scratchPath), false);
});

test("closeoutRecord: scratch step reports an absent directory as 'absent', not an error, and exits 0 when every other step also removed/absent", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const { scratchPath, by, parent } = mkScratchFixture();
  fs.rmSync(scratchPath, { recursive: true }); // node fs only, never a shell rm
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-sc-absent", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "absent");
  assert.equal(result.exitCode, 0, `expected exit 0; steps: ${JSON.stringify(result.steps)}`);
  assert.equal(fs.existsSync(parent), true, "the session's parent directory itself is untouched");
});

test("closeoutRecord: scratch step actually removes the directory on a live run, prints its path, and --dry-run leaves it in place", () => {
  const env = fixtureEnv();
  {
    const { repo, branch, tip } = closedFixtureForScratch(env);
    const { scratchPath, by } = mkScratchFixture();
    const recordRel = writeClosedRecord(repo, {
      work: "wr-2026-09-27-sc-live", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
    });
    const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
    const steps = stepsOf(result);
    assert.equal(steps.scratch.result, "removed");
    assert.equal(fs.existsSync(scratchPath), false);
    assert.ok(result.lines.some((l) => l.startsWith("scratch: removed") && l.includes(scratchPath)));
  }
  {
    const { repo, branch, tip } = closedFixtureForScratch(env);
    const { scratchPath, by } = mkScratchFixture();
    const recordRel = writeClosedRecord(repo, {
      work: "wr-2026-09-27-sc-dry", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
    });
    const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by, dryRun: true });
    const steps = stepsOf(result);
    assert.equal(steps.scratch.result, "removed");
    assert.equal(fs.existsSync(scratchPath), true, "--dry-run must not remove the scratch directory");
    assert.ok(result.lines.some((l) => l.startsWith("scratch: would removed")));
  }
});

// ── Result / exit code / Log: line (ruling b item 6) ────────────────────────────────

test("closeoutRecord: exit 0 only when every step is removed or absent; the Log: closeout line is written only on a non-dry-run, and never on --dry-run", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-result-clean", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const before = fs.readFileSync(path.join(repo, recordRel), "utf8");

  const dry = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by, dryRun: true });
  assert.equal(dry.exitCode, 0);
  assert.equal(fs.readFileSync(path.join(repo, recordRel), "utf8"), before, "--dry-run changes nothing, including no Log: line");

  const live = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  assert.equal(live.exitCode, 0);
  const after1 = fs.readFileSync(path.join(repo, recordRel), "utf8");
  const parsed = parseRecord(after1);
  assert.equal(parsed.log.at(-1).status, "closeout");
  assert.match(parsed.log.at(-1).note, /worktree=removed branch=removed origin-branch=removed scratch=removed/);
});

// ── sweep-origin (ruling c) ──────────────────────────────────────────────────────────

test("parseSweepOriginArgs: --repo/--exclude are name/value pairs, --apply is a bare flag", () => {
  const parsed = parseSweepOriginArgs(["sweep-origin", "--repo", ".", "--exclude", "build/keep-1,build/keep-2", "--apply"]);
  assert.equal(parsed.repoRoot, ".");
  assert.equal(parsed.exclude, "build/keep-1,build/keep-2");
  assert.equal(parsed.apply, true);
});

// F10 (C1 round 2, MEDIUM): a REPEATED --exclude accumulates (comma-joined), instead of the last
// one silently overwriting every earlier one.
test("parseSweepOriginArgs: F10 - a repeated --exclude accumulates, comma-joined, rather than the last one overwriting the rest", () => {
  const parsed = parseSweepOriginArgs(["sweep-origin", "--repo", ".", "--exclude", "build/a", "--exclude", "build/b", "--exclude", "build/c"]);
  assert.equal(parsed.exclude, "build/a,build/b,build/c");
});

// F10: an --exclude entry that matches no origin/build/* branch is called out with a warn line,
// rather than silently accepted as if it had done its job (a typo would otherwise sweep the
// branch the caller meant to protect).
test("sweepOrigin: F10 - an --exclude entry matching no origin/build/* branch prints a warn line naming it", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/sweep-exclude-warn-1";
  cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const result = sweepOrigin({ repoRoot: repo, exclude: "build/does-not-exist-at-all" });
  assert.ok(result.lines.some((l) => l === "warn exclude build/does-not-exist-at-all matches no origin/build/* branch"));
});

// F4/L8 (C1 round 2, CRITICAL): an active record's Worktree: is matched in EVERY form it might be
// recorded in (origin/build/x, refs/heads/build/x, build/x/, or an absolute worktree path) - not
// only one preferred derivation. Round 1 compared against a single derived form, so 3 of these 4
// real-world variants slipped through undetected as "not claimed by anyone".
for (const [label, formOf] of [
  ["origin/-prefixed", (name) => `origin/${name}`],
  ["refs/heads/-prefixed", (name) => `refs/heads/${name}`],
  ["a trailing slash", (name) => `${name}/`],
]) {
  test(`sweepOrigin: F4 - an active record's Worktree: given as ${label} (${formOf("build/x")}) still keeps the branch, exactly like the bare form`, () => {
    const env = fixtureEnv();
    const { repo } = buildRepo(env);
    const branch = "build/sweep-multiform-1";
    const { tip } = cutBranch(repo, env, branch);
    mergeNoFF(repo, env, branch);
    pushMain(repo, env);
    pushBranch(repo, env, branch);
    writeClosedRecord(repo, {
      work: "wr-2026-09-27-sweep-multiform", worktree: formOf(branch), artifact: `${branch}@${tip}`, leadSession: "some-session", scratch: mkScratchFixture().scratchPath,
      extra: { Status: "owned" },
    });
    const result = sweepOrigin({ repoRoot: repo });
    const row = result.rows.find((r) => r.name === branch);
    assert.equal(row.verdict, "keep");
    assert.match(row.reason, /not closed\/withdrawn/);
  });
}

// F4/L8: an active record's Worktree: given as the branch's own ABSOLUTE worktree path (resolved
// through `git worktree list`, not a literal branch-name comparison) still keeps the branch.
test("sweepOrigin: F4 - an active record's Worktree: given as the branch's absolute worktree path (resolved via git worktree list) still keeps the branch", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/sweep-multiform-abspath-1";
  const { wt, tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  writeClosedRecord(repo, {
    work: "wr-2026-09-27-sweep-multiform-abs", worktree: wt, artifact: `${branch}@${tip}`, leadSession: "some-session", scratch: mkScratchFixture().scratchPath,
    extra: { Status: "owned" },
  });
  const result = sweepOrigin({ repoRoot: repo });
  const row = result.rows.find((r) => r.name === branch);
  assert.equal(row.verdict, "keep");
  assert.match(row.reason, /not closed\/withdrawn/);
});

test("sweepOrigin: dry run by default - lists every origin/build/* branch with its tip sha and a delete/keep verdict, deletes nothing", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const deletable = "build/sweep-delete-1";
  const { tip: deletableTip } = cutBranch(repo, env, deletable);
  mergeNoFF(repo, env, deletable);
  const keepUnmerged = "build/sweep-unmerged-1";
  cutBranch(repo, env, keepUnmerged);
  pushMain(repo, env);
  pushBranch(repo, env, deletable);
  pushBranch(repo, env, keepUnmerged);

  const result = sweepOrigin({ repoRoot: repo });
  assert.equal(result.apply, false);
  assert.equal(result.applied.length, 0);
  const deleteRow = result.rows.find((r) => r.name === deletable);
  assert.equal(deleteRow.verdict, "delete");
  assert.equal(deleteRow.tip, deletableTip);
  const keepRow = result.rows.find((r) => r.name === keepUnmerged);
  assert.equal(keepRow.verdict, "keep");
  assert.match(keepRow.reason, /not an ancestor/);
  assert.ok(result.lines.some((l) => l === `delete ${deletable} ${deletableTip}`));
  assert.ok(result.lines.some((l) => l.startsWith(`keep ${keepUnmerged} `)));
  // still on origin - a dry run deletes nothing:
  assert.notEqual(git(["ls-remote", "--heads", "origin", deletable], repo, env).trim(), "");
});

test("sweepOrigin: 'not the record's own' is dropped (unlike close --closeout) - a branch no record names at all is still eligible for delete", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/sweep-noowner-1";
  const { tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  // no docs/work record at all names this branch.
  const result = sweepOrigin({ repoRoot: repo });
  const row = result.rows.find((r) => r.name === branch);
  assert.equal(row.verdict, "delete");
  assert.equal(row.tip, tip);
});

test("sweepOrigin: keeps a branch named by an active (not closed/withdrawn) record, exactly like close --closeout step 4", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/sweep-active-1";
  const { tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  writeClosedRecord(repo, {
    work: "wr-2026-09-27-sweep-active", worktree: branch, artifact: `${branch}@${tip}`, leadSession: "some-session", scratch: mkScratchFixture().scratchPath,
    extra: { Status: "owned" },
  });
  const result = sweepOrigin({ repoRoot: repo });
  const row = result.rows.find((r) => r.name === branch);
  assert.equal(row.verdict, "keep");
  assert.match(row.reason, /not closed\/withdrawn/);
});

test("sweepOrigin: branches named in --exclude are added to the keep list, even when otherwise eligible for delete", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/sweep-excluded-1";
  cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const result = sweepOrigin({ repoRoot: repo, exclude: `${branch},build/does-not-exist` });
  const row = result.rows.find((r) => r.name === branch);
  assert.equal(row.verdict, "keep");
  assert.equal(row.reason, "excluded");
});

test("sweepOrigin: --apply deletes only the branches marked delete, against the bare fixture origin, and prints each name/sha plus a restore command", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const toDelete = "build/sweep-apply-delete-1";
  const { tip } = cutBranch(repo, env, toDelete);
  mergeNoFF(repo, env, toDelete);
  const toKeep = "build/sweep-apply-keep-1";
  cutBranch(repo, env, toKeep); // never merged - stays on origin
  pushMain(repo, env);
  pushBranch(repo, env, toDelete);
  pushBranch(repo, env, toKeep);

  const result = sweepOrigin({ repoRoot: repo, apply: true });
  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0].name, toDelete);
  assert.equal(result.applied[0].ok, true);
  assert.ok(result.lines.some((l) => l === `deleted ${toDelete} ${tip} restore: git push origin ${tip}:refs/heads/${toDelete}`));
  assert.equal(git(["ls-remote", "--heads", "origin", toDelete], repo, env).trim(), "", "the deletable branch must be gone from origin");
  assert.notEqual(git(["ls-remote", "--heads", "origin", toKeep], repo, env).trim(), "", "the kept branch must still be on origin");
});

// F2/L2 (C1 round 2, CRITICAL): sweep-origin must `git fetch --prune origin` before it evaluates
// ANYTHING, in --apply mode too - otherwise a branch that WAS merged-and-safe when this repo last
// fetched, but has since had new, unmerged work pushed to it by someone else, is still evaluated
// against the STALE (old, merged) tip this repo remembers, and gets deleted with --apply even
// though origin's CURRENT tip is unmerged work that would be lost. The reviewer's own repro
// (e2-stale.mjs) is what found this.
test("sweepOrigin: F2 - a branch merged-and-safe as of this repo's last fetch, but advanced with NEW unmerged work on origin since, is re-fetched and kept, never deleted from a stale tip", () => {
  const env = fixtureEnv();
  const { repo, origin } = buildRepo(env);
  const branch = "build/sweep-stale-1";
  cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch); // this repo's local origin/build/sweep-stale-1 now == the merged, safe-to-delete tip

  // Someone else clones the same origin and pushes NEW, unmerged work to the same branch - `repo`
  // above never re-fetches, so its own tracking ref still remembers the old (merged) tip.
  const other = mkTmp("closeout-clone-");
  git(["clone", "-q", origin, other], repo, env);
  git(["checkout", "-q", branch], other, env);
  fs.writeFileSync(path.join(other, "new-work.txt"), "unmerged work\n");
  git(["add", "."], other, env);
  git(["commit", "-q", "-m", "new unmerged work"], other, env);
  git(["push", "-q", "origin", branch], other, env);
  const newTip = git(["rev-parse", "HEAD"], other, env).trim();

  const result = sweepOrigin({ repoRoot: repo, apply: true });
  const row = result.rows.find((r) => r.name === branch);
  assert.equal(row.tip, newTip, "must be evaluated against origin's CURRENT tip, fetched fresh - never the stale local tracking ref");
  assert.equal(row.verdict, "keep", "the new tip is unmerged work - must never be judged safe from a stale, already-superseded tip");
  assert.equal(result.applied.length, 0);
  // and the branch (with its new commit) is still on origin - nothing was deleted:
  const ls = git(["ls-remote", "--heads", "origin", branch], repo, env).trim();
  assert.notEqual(ls, "", "origin must still have the branch - its current, unmerged tip must never be deleted");
});

// L1 (C1 round 2 ruling): the origin delete is a LEASE (`--force-with-lease`), never a force - a
// branch that moved on origin between sweepOrigin's own evaluation and the moment its delete push
// actually runs fails that push outright ('moved'), rather than force-deleting whatever origin's
// tip happens to be by then. Driven through sweepOrigin's real code path (its injectable
// `execImpl`), racing the actual git push exactly at the point the delete fires - after
// evaluation has already captured its (about-to-be-stale) tip.
test("sweepOrigin: L1 - --apply's delete is a lease against the exact evaluated tip; a branch that moved since evaluation is refused 'moved', never force-deleted", () => {
  const env = fixtureEnv();
  const { repo, origin } = buildRepo(env);
  const branch = "build/sweep-lease-moved-1";
  cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);

  const other = mkTmp("closeout-clone-");
  git(["clone", "-q", origin, other], repo, env);

  const realExec = execFileSync;
  let raced = false;
  const execImpl = (cmd, args, opts) => {
    if (!raced && args[0] === "push" && String(args[1]).startsWith("--force-with-lease=")) {
      raced = true;
      // Race a new, unmerged commit onto the SAME branch on origin, from a separate clone, right
      // between sweepOrigin's evaluation (already captured the OLD tip in `args`) and this delete
      // push actually running - exactly the window L1's lease exists to close.
      git(["checkout", "-q", branch], other, env);
      fs.writeFileSync(path.join(other, "race.txt"), "raced in after evaluation\n");
      git(["add", "."], other, env);
      git(["commit", "-q", "-m", "raced in"], other, env);
      git(["push", "-q", "origin", branch], other, env);
    }
    return realExec(cmd, args, opts);
  };

  const result = sweepOrigin({ repoRoot: repo, apply: true, execImpl });
  assert.equal(raced, true, "fixture sanity: the race must actually have fired during the delete push");
  const row = result.applied.find((a) => a.name === branch);
  assert.equal(row.ok, false);
  assert.equal(row.error, "moved", "the moved-branch case must be flagged distinctly (never silently treated as a generic failure)");
  assert.ok(result.lines.some((l) => l === `delete-failed ${branch} moved`));
  // M4: a delete-failed must never be swallowed into a blanket exit 0.
  assert.equal(result.exitCode, 2);
  const ls = git(["ls-remote", "--heads", "origin", branch], repo, env).trim();
  assert.notEqual(ls, "", "the branch (with the raced-in commit) must survive a lease that no longer matches origin's current tip - a lease is conditional, never a force");
});

// R2-6 (C1 round 3, MINOR): a push rejected for a reason OTHER than a lost lease (e.g. origin's
// own `receive.denyDeletes`) must be reported by its REAL reason, never mislabeled 'moved' - the
// round-2 regex matched git's generic "failed to push some refs" line, which prints on every
// rejected push, lease-lost or not. The narrowed regex matches only git's own literal lease
// marker, `(stale info)`.
test("sweepOrigin: R2-6 - a push denied by origin's own receive.denyDeletes is reported by its real reason, never mislabeled 'moved'", () => {
  const env = fixtureEnv();
  const { repo, origin } = buildRepo(env);
  const branch = "build/r26-denydeletes-1";
  cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  git(["config", "receive.denyDeletes", "true"], origin, env);

  const result = sweepOrigin({ repoRoot: repo, apply: true });
  const row = result.applied.find((a) => a.name === branch);
  assert.equal(row.ok, false);
  assert.notEqual(row.error, "moved", "a denied delete is not a lost lease - it must not be mislabeled 'moved'");
  assert.ok(!result.lines.some((l) => l === `delete-failed ${branch} moved`));
  assert.equal(result.exitCode, 2);
  const ls = git(["ls-remote", "--heads", "origin", branch], repo, env).trim();
  assert.notEqual(ls, "", "a denied delete must leave the branch in place on origin");
});

// ── C1 round 3: mutation-killing tests (R2-3) + R2-1, R2-2, R2-4 ────────────────────

// R2-3(a): the sweep-origin fetch-failure early return had NO test - kills mutant M-d (that
// early return removed).
test("sweepOrigin: R2-3(a) - a failed fetch refuses EVERYTHING (exit 2, UNVERIFIABLE), deletes nothing, and never even lists origin/build/*", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/r23a-1";
  cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  let pushCalled = false;
  const spawnImpl = (cmd, args, opts) => {
    if (args[0] === "fetch") return { error: new Error("simulated fetch failure"), status: 1, stdout: "", stderr: "simulated" };
    return spawnSync(cmd, args, opts);
  };
  const execImpl = (cmd, args, opts) => { pushCalled = true; return execFileSync(cmd, args, opts); };
  const result = sweepOrigin({ repoRoot: repo, apply: true, spawnImpl, execImpl });
  assert.equal(result.exitCode, 2);
  assert.deepEqual(result.lines, ["refused UNVERIFIABLE: fetch failed"]);
  assert.equal(pushCalled, false, "no delete push must ever be attempted when the fetch itself could not be verified");
  assert.notEqual(git(["ls-remote", "--heads", "origin", branch], repo, env).trim(), "", "the branch must still be on origin");
});

// R2-2 (C1 round 3, MAJOR blocker): a failed `git worktree list` must refuse sweep-origin
// outright, not silently claim no open record protects anything - kills sweepOrigin's own
// `worktreesByPath === null` guard. (R3-1 correction: this is NOT round 2's mutant M-c - M-c
// was the scratch step's `listWorktrees === null` refusal at work-record.mjs:2064-2066, held
// by the `closeoutRecord: R2-2 ...` test below, not by this one.)
test("sweepOrigin: R2-2 - a failed git worktree list refuses everything (exit 2, UNVERIFIABLE), never fails open", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/r22-sweep-1";
  cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const result = sweepOrigin({ repoRoot: repo, apply: true, listWorktreesImpl: () => null });
  assert.equal(result.exitCode, 2);
  assert.deepEqual(result.lines, ["refused UNVERIFIABLE: could not read git worktree list"]);
  assert.notEqual(git(["ls-remote", "--heads", "origin", branch], repo, env).trim(), "", "the branch must still be on origin");
});

// R2-2/R2-7: the same failure, inside close --closeout's own origin-branch step - the worktree
// step already fails closed on its own (it reads git worktree list itself), so this pins the
// origin-branch step specifically, which round 2 left silently claiming "no branch name" instead.
test("closeoutRecord: R2-2 - a failed git worktree list refuses the origin-branch step (UNVERIFIABLE, exit 2), never silently proceeding as if no record claimed the branch", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-r22-closeout", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by, listWorktreesImpl: () => null });
  const steps = stepsOf(result);
  assert.equal(steps["origin-branch"].result, "refused");
  assert.match(steps["origin-branch"].detail, /could not read git worktree list/);
  assert.equal(steps.worktree.result, "refused");
  assert.match(steps.worktree.detail, /could not read git worktree state/);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /could not read git worktree list/);
  assert.equal(fs.existsSync(scratchPath), true, "the scratch directory must survive when git worktree list cannot be read");
  assert.equal(result.exitCode, 2);
  assert.notEqual(git(["ls-remote", "--heads", "origin", branch], repo, env).trim(), "", "the branch must still be on origin");
});

// R2-3(b): the scratch step's containment check (target CONTAINS a registered worktree) had no
// test - kills mutant M-b (both containment checks off).
test("closeoutRecord: R2-3(b) - scratch step refuses a target that CONTAINS a registered linked worktree, and the worktree's uncommitted file survives a live run", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const by = `closeout-test-by-r23b-${++scratchCounter}`;
  const scratchParent = path.join(os.tmpdir(), by);
  const scratchPath = path.join(scratchParent, "lane-1");
  fs.mkdirSync(scratchPath, { recursive: true });
  tracked.push(scratchParent);
  const innerWt = path.join(scratchPath, "inner-wt");
  git(["worktree", "add", innerWt, "-b", "build/r23b-inner-1"], repo, env);
  fs.writeFileSync(path.join(innerWt, "uncommitted.txt"), "still here\n");
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-r23b", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /contains a path in git worktree list/);
  assert.equal(fs.existsSync(path.join(innerWt, "uncommitted.txt")), true);
});

// R2-3(c): the scratch step's containment check (target CONTAINS the repo root) had no dedicated
// test either, and never on a dry run.
test("closeoutRecord: R2-3(c) - scratch step (--dry-run) refuses a target that CONTAINS the repo root", () => {
  const by = `closeout-test-by-r23c-${++scratchCounter}`;
  const scratchParent = path.join(os.tmpdir(), by);
  const scratchPath = path.join(scratchParent, "lane-1"); // --by must be strictly BETWEEN the root and the target
  fs.mkdirSync(scratchPath, { recursive: true });
  tracked.push(scratchParent);
  const repo = path.join(scratchPath, "nested-repo"); // the repo root lies INSIDE the scratch target
  fs.mkdirSync(repo);
  const env = fixtureEnv();
  git(["init", "-q", "-b", "main"], repo, env);
  fs.writeFileSync(path.join(repo, "README.md"), "root\n");
  git(["add", "."], repo, env);
  git(["commit", "-q", "-m", "init"], repo, env);
  const origin = mkTmp("closeout-origin-");
  git(["init", "-q", "--bare", "-b", "main"], origin, env);
  git(["remote", "add", "origin", origin], repo, env);
  git(["push", "-q", "origin", "main"], repo, env);
  const branch = "build/r23c-1";
  const { tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-r23c", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by, dryRun: true });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /contains the repo root/);
});

// R2-3(g): a regular-FILE target had no test - kills mutant M-e (the not-a-directory guard off).
test("closeoutRecord: R2-3(g) - scratch step refuses a target that is a regular FILE, not a directory, and it survives a live run", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const { scratchPath: dir, by } = mkScratchFixture();
  fs.rmSync(dir, { recursive: true });
  fs.writeFileSync(dir, "not a directory\n"); // same path, now a plain file
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-r23g", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: dir,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /target is not a directory/);
  assert.equal(fs.existsSync(dir), true);
  assert.equal(fs.statSync(dir).isFile(), true);
});

// R2-4 (C1 round 3, MEDIUM): the REVERSE containment direction - the target itself LIES INSIDE a
// registered worktree, rather than containing it - was never checked; L5's own equality/contains
// checks only ever looked at whether a worktree/the repo lies inside the target.
test("closeoutRecord: R2-4 - scratch step refuses a target that LIES INSIDE a registered linked worktree, and the worktree's uncommitted work survives a live run", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const by = `closeout-test-by-r24-${++scratchCounter}`;
  const rootsParent = path.join(os.tmpdir(), by);
  fs.mkdirSync(rootsParent, { recursive: true });
  tracked.push(rootsParent);
  const innerWt = path.join(rootsParent, "inner-wt");
  git(["worktree", "add", innerWt, "-b", "build/r24-inner-1"], repo, env);
  fs.mkdirSync(path.join(innerWt, "src"));
  fs.writeFileSync(path.join(innerWt, "src", "uncommitted.txt"), "still here\n");
  const scratchPath = path.join(innerWt, "src");
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-r24", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /lies inside a path in git worktree list/);
  assert.equal(fs.existsSync(path.join(innerWt, "src", "uncommitted.txt")), true);
});

// R2-4 (C1 round 3, MEDIUM): the same reverse direction, but the target LIES INSIDE the repo root
// itself (not a linked worktree) - the two `liesInside` checks are independent lines of code, and
// the worktree-lies-inside test above does not exercise this one at all.
test("closeoutRecord: R2-4 - scratch step refuses a target that LIES INSIDE the repo root itself", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const by = `closeout-test-by-r24root-${++scratchCounter}`;
  const scratchPath = path.join(repo, by, "lane-1"); // nested INSIDE the repo root, --by as a segment
  fs.mkdirSync(scratchPath, { recursive: true });
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-r24root", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /lies inside the repo root/);
  assert.equal(fs.existsSync(scratchPath), true);
});

// R2-9 (C1 round 3, MINOR, TOCTOU): the final write realpaths the record path again (a window
// since the confined read), but round 2 never checked that second realpath's result against the
// repo root it claimed to be confined to - only a real re-check, not just a second `realpathSync`
// call, makes this an actual confinement. Driven by racing a symlink swap in between, through the
// injectable `fsImpl`, exactly like acceptRecord's own TOCTOU test above.
test("closeoutRecord: R2-9 - a symlink swapped into the record's path between the confined read and the final write is refused, not written through", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const by = `closeout-test-by-r29-${++scratchCounter}`;
  const { scratchPath } = mkScratchFixture("r29-lane");
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-r29", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const recordAbs = path.resolve(repo, recordRel);
  const outside = mkTmp("closeout-r29-outside-");
  const outsideTarget = path.join(outside, "escaped.record.md");
  fs.writeFileSync(outsideTarget, fs.readFileSync(recordAbs, "utf8"));
  const realFsImpl = fs;
  let realpathCalls = 0;
  const racingFsImpl = {
    ...realFsImpl,
    realpathSync: (p, ...rest) => {
      const isRecordPath = typeof p === "string" && path.resolve(p) === recordAbs;
      if (isRecordPath) {
        realpathCalls += 1;
        // 1st call: readConfinedRegularFile's own read - let it resolve for real, inside the repo.
        // 2nd call: the final write's re-resolve - simulate a symlink having been swapped into
        // place in between, now resolving OUTSIDE the repo entirely.
        if (realpathCalls >= 2) return outsideTarget;
      }
      return realFsImpl.realpathSync(p, ...rest);
    },
  };
  const r = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by, fsImpl: racingFsImpl });
  assert.equal(r.exitCode, 2);
  assert.match(r.lines.at(-1), /log: refused \(path resolves outside repository/);
  assert.ok(realpathCalls >= 2, "fixture sanity: the swap must actually have been exercised on the second realpath call");
  assert.doesNotMatch(fs.readFileSync(outsideTarget, "utf8"), /Log:.*closeout/, "the escaped path outside the repo must never receive the closeout write");
});

// R2-10 (C1 round 3, MINOR): on a win32 host, `path.win32.isAbsolute` also accepts a bare POSIX
// value (e.g. `/tmp/x`, read as drive-relative), which let a Scratch: recorded on a DIFFERENT
// host slip past the host-absolute gate instead of being refused per L7 ("recorded on another
// OS"). Driven through closeoutRecord's own `platform` passthrough - no real Windows host needed.
test("closeoutRecord: R2-10 - on a win32 host, a POSIX-shaped Scratch: path is refused 'not absolute on this host', never silently accepted", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const by = `closeout-test-by-r210-${++scratchCounter}`;
  // On a win32 host, mkScratchFixture's os.tmpdir()-based path is already host-absolute (a real
  // C:\... path), so the POSIX-shaped value this test needs to drive through the win32 gate must
  // be synthesized instead - it never exists on disk, so the final existsSync check (which only
  // ever meant "the fixture directory was not removed") is skipped there.
  const scratchPath = process.platform === "win32" ? `/tmp/${by}/r210-lane` : mkScratchFixture("r210-lane").scratchPath; // a real POSIX absolute path, e.g. /tmp/.../r210-lane
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-r210", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by, platform: "win32" });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /not absolute on this host \(recorded on another OS\)/);
  if (process.platform !== "win32") {
    assert.equal(fs.existsSync(scratchPath), true, "a POSIX path misread as win32-absolute must never be removed");
  }
});

// R2-1 (C1 round 3, MAJOR ruling, L8 fallback): an open record whose Worktree: is a path that
// cannot be resolved through `git worktree list` (a Windows path read on Linux) still protects
// the branch whose own last path segment matches, compared case-insensitively.
test("sweepOrigin: R2-1 - an open record's Worktree: given as a Windows-shaped path unresolvable on this host still protects the branch by basename", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/r1-Fallback-1";
  const { tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  writeClosedRecord(repo, {
    work: "wr-2026-09-27-r1-win", worktree: "C:/Users/benzh/orca/workspaces/claude-delegation/r1-fallback-1",
    artifact: "none", leadSession: "some-session", scratch: mkScratchFixture().scratchPath,
    extra: { Status: "owned" },
  });
  const result = sweepOrigin({ repoRoot: repo });
  const row = result.rows.find((r) => r.name === branch);
  assert.equal(row.verdict, "keep");
  assert.match(row.reason, /^open-record-unresolved wr-2026-09-27-r1-win$/);
  assert.equal(row.tip, tip);
});

// R2-1: an open record's Worktree: naming an absolute POSIX path that simply is not (or is no
// longer) in `git worktree list` gets the same fallback protection - not only a cross-OS path.
test("sweepOrigin: R2-1 - an open record's Worktree: naming an absent POSIX path (not in git worktree list) still protects the branch by basename", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/r1-absent-1";
  cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  writeClosedRecord(repo, {
    work: "wr-2026-09-27-r1-absent", worktree: "/home/elsewhere/not-here/r1-absent-1",
    artifact: "none", leadSession: "some-session", scratch: mkScratchFixture().scratchPath,
    extra: { Status: "owned" },
  });
  const result = sweepOrigin({ repoRoot: repo });
  const row = result.rows.find((r) => r.name === branch);
  assert.equal(row.verdict, "keep");
  assert.match(row.reason, /^open-record-unresolved wr-2026-09-27-r1-absent$/);
});

// R2-1 does NOT protect a branch whose basename does not match, and does NOT protect one already
// closed/withdrawn - the fallback is exactly as narrow as an exact-name match, just on a weaker
// signal.
test("sweepOrigin: R2-1 - the basename fallback does not protect a DIFFERENT branch, and does not apply to a closed/withdrawn record", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/r1-nomatch-1";
  const { tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  writeClosedRecord(repo, {
    work: "wr-2026-09-27-r1-nomatch", worktree: "C:/Users/benzh/somewhere/completely-different",
    artifact: "none", leadSession: "some-session", scratch: mkScratchFixture().scratchPath,
    extra: { Status: "owned" },
  });
  // R3-4 (C1 round 4): a CLOSED record whose Worktree: basename DOES match must not protect the
  // branch either - the fallback applies only to OPEN records (owned/pending), never to one
  // already closed/withdrawn, which is the half of the test title the body above never exercised.
  writeClosedRecord(repo, {
    work: "wr-2026-09-27-r1-nomatch-closed", worktree: "C:/Users/benzh/x/r1-nomatch-1",
    artifact: "none", leadSession: "some-session", scratch: mkScratchFixture().scratchPath,
  });
  const result = sweepOrigin({ repoRoot: repo });
  const row = result.rows.find((r) => r.name === branch);
  assert.equal(row.verdict, "delete", "a non-matching basename must not protect an unrelated branch");
  assert.equal(row.tip, tip);
});

// R2-1 (P6, hoist fix): a Worktree: given as a SYMLINKED path that resolves (via worktreePathKey)
// to the SAME real worktree `git worktree list` itself reports now matches DIRECTLY - not only
// through the weaker basename fallback - closing the round-2 gap where the map was built with a
// realpath-normalized key but looked up with a plain path.resolve.
test("sweepOrigin: R2-1 (P6) - an open record's Worktree: given as a SYMLINKED path matches directly (named by, not just basename-unresolved)", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/r1-p6-1";
  const { tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  // A SECOND, otherwise-just-as-mergeable branch, checked out through a SYMLINKED parent
  // directory - `git worktree list` itself reports the real, resolved path (never the symlinked
  // one), which is exactly what round 2 built its map from but never actually matched against
  // (the map's own realpath call silently no-op'd on a `ReferenceError` this round's fix also
  // closes - see the module-level `realpathSync` import).
  const other = "build/r1-p6-other-1";
  const { tip: otherTip } = cutBranch(repo, env, other, { worktree: false });
  mergeNoFF(repo, env, other);
  pushMain(repo, env);
  pushBranch(repo, env, other);
  const realParent = mkTmp("closeout-real-parent-");
  const linkParent = path.join(mkTmp("closeout-link-holder-"), "link-parent");
  fs.symlinkSync(realParent, linkParent);
  const symlinkedWt = path.join(linkParent, "p6-wt");
  git(["worktree", "add", symlinkedWt, other], repo, env);
  writeClosedRecord(repo, {
    work: "wr-2026-09-27-r1-p6", worktree: symlinkedWt, artifact: "none", leadSession: "some-session",
    scratch: mkScratchFixture().scratchPath, extra: { Status: "owned" },
  });
  const result = sweepOrigin({ repoRoot: repo });
  // the record's OWN branch, claimed through the symlinked path, is protected by a DIRECT match
  // (never merely the weaker basename fallback):
  const ownRow = result.rows.find((r) => r.name === other);
  assert.equal(ownRow.verdict, "keep");
  assert.match(ownRow.reason, /^named by wr-2026-09-27-r1-p6 \(Status: owned\), not closed\/withdrawn$/);
  // an UNRELATED branch, whose basename does not match this record's Worktree: at all, is
  // unaffected - the fixture's own sanity check that the fallback protects only its claimed
  // branch, never every branch in the repo:
  const otherRow = result.rows.find((r) => r.name === branch);
  assert.equal(otherRow.verdict, "delete");
  assert.equal(otherRow.tip, tip);
  void otherTip;
});

// ── C1 round 4: idempotent closeout (the lead's ruling on the R2-3 review's O1 observation) ──

// Round 4: a closeout must be safe to re-run. The FIRST run removes the worktree, the local
// branch, the origin branch and the scratch directory for real; the SECOND run, on the exact
// same (already-closed) record, must exit 0 with every one of the four steps `absent` - never
// re-refuse a record that has already been fully cleaned up.
test("closeoutRecord: idempotent - running closeout twice on the same fixture exits 0 both times, and the second run reports every step absent", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/idem-1";
  const { wt, tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-idem", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });

  const first = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  assert.equal(first.exitCode, 0);
  const firstSteps = stepsOf(first);
  assert.equal(firstSteps.worktree.result, "removed");
  assert.equal(firstSteps.branch.result, "removed");
  assert.equal(firstSteps["origin-branch"].result, "removed");
  assert.equal(firstSteps.scratch.result, "removed");
  assert.equal(fs.existsSync(wt), false, "fixture sanity: the worktree is really gone after run 1");
  assert.equal(fs.existsSync(scratchPath), false, "fixture sanity: the scratch dir is really gone after run 1");

  const second = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  assert.equal(second.exitCode, 0, "a re-run of an already-cleaned-up record must not raise the exit code");
  const secondSteps = stepsOf(second);
  for (const step of ["worktree", "branch", "origin-branch", "scratch"]) {
    assert.equal(secondSteps[step].result, "absent", `step ${step} on the second run`);
  }
});

// R2-8 ruling still holds on a re-run too: a Worktree: this host genuinely cannot resolve as a
// path at all (a Windows-shaped value read on Linux) stays `refused worktree-unresolved`, exit 2
// - idempotency narrows ONLY the "the path is simply gone now" case, never this ambiguous one.
test("closeoutRecord: idempotent - a foreign-OS-shaped Worktree: value stays refused worktree-unresolved (exit 2), even though it never exists on disk on this host either", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-idem-foreign", worktree: process.platform === "win32" ? "/home/ben/orca/workspaces/x/idem-foreign-1" : "C:/Users/benzh/orca/workspaces/x/idem-foreign-1",
    artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.worktree.result, "refused");
  assert.equal(steps.worktree.detail, "worktree-unresolved");
  assert.equal(steps.branch.result, "refused");
  assert.equal(steps.branch.detail, "worktree-unresolved (not checked)");
  assert.equal(result.exitCode, 2);
});

// R2-8 ruling on a re-run: a Worktree: naming a real directory that exists on disk but is simply
// not (or no longer) a registered worktree also stays ambiguous, exit 2 - only a path that is
// genuinely gone counts as absent.
test("closeoutRecord: idempotent - a Worktree: naming a real directory that exists but is not a registered worktree stays refused worktree-unresolved (exit 2)", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const { scratchPath, by } = mkScratchFixture();
  const notAWorktree = mkTmp("closeout-idem-not-a-worktree-");
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-idem-notwt", worktree: notAWorktree, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.worktree.result, "refused");
  assert.equal(steps.worktree.detail, "worktree-unresolved");
  assert.equal(result.exitCode, 2);
  assert.equal(fs.existsSync(notAWorktree), true, "an unregistered real directory must never be removed");
});

test("closeoutRecord: idempotent - a path-form Worktree: that no longer exists, while a registered worktree elsewhere still holds the record's branch, stays refused worktree-unresolved (exit 2)", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/idem-stale-1";
  const { wt, tip } = cutBranch(repo, env, branch);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const { scratchPath, by } = mkScratchFixture();
  const stale = path.join(path.dirname(wt), `moved-away-${by}`, "idem-stale-1");
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-idem-stale", worktree: stale, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.worktree.result, "refused");
  assert.equal(steps.worktree.detail, "worktree-unresolved");
  assert.equal(result.exitCode, 2);
  assert.equal(fs.existsSync(wt), true, "the live worktree holding the record's branch must survive");
});

test("closeoutRecord: idempotent - a path-form Worktree: that no longer exists, with the record's own local branch surviving, goes on to remove that branch with -d", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/idem-pathbranch-1";
  git(["branch", branch], repo, env);
  const tree = git(["rev-parse", `${branch}^{tree}`], repo, env).trim();
  const tip = git(["commit-tree", tree, "-p", branch, "-m", `work on ${branch}`], repo, env).trim();
  git(["update-ref", `refs/heads/${branch}`, tip], repo, env);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const { scratchPath, by } = mkScratchFixture();
  const gone = path.join(os.tmpdir(), `never-existed-${by}`, "idem-pathbranch-1");
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-idem-pathbranch", worktree: gone, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.worktree.result, "absent");
  assert.equal(steps.branch.result, "removed");
  assert.equal(steps.branch.ref, branch);
  assert.equal(git(["branch", "--list", branch], repo, env).trim(), "", "the record's local branch must actually be gone");
  assert.equal(result.exitCode, 0);
});

// R4-5 (C1 round 5): the origin-branch `absent` path is confirmed against the remote with
// `git ls-remote --exit-code`; absent only on its exit 2. These pin both halves.
test("closeoutRecord: R4-5 - a narrow fetch refspec (no refs/remotes/origin tracking ref) with the branch still on origin is refused, never reported absent", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/r45-narrow-1";
  git(["config", "remote.origin.fetch", "+refs/heads/main:refs/remotes/origin/main"], repo, env);
  git(["branch", branch], repo, env);
  const tree = git(["rev-parse", `${branch}^{tree}`], repo, env).trim();
  const tip = git(["commit-tree", tree, "-p", branch, "-m", `work on ${branch}`], repo, env).trim();
  git(["update-ref", `refs/heads/${branch}`, tip], repo, env);
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-28-r45-narrow", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps["origin-branch"].result, "refused");
  assert.match(steps["origin-branch"].detail, /on origin, but no refs\/remotes\/origin tracking ref/);
  assert.equal(result.exitCode, 2);
  assert.notEqual(git(["ls-remote", "--heads", "origin", branch], repo, env).trim(), "", "the branch must still be on origin");
});

test("closeoutRecord: R4-5 - a failed git ls-remote on the absent path refuses UNVERIFIABLE (exit 2), never reports absent", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-28-r45-lsfail", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const first = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  assert.equal(stepsOf(first)["origin-branch"].result, "removed");
  const spawnImpl = (cmd, args, opts) => (cmd === "git" && args[0] === "ls-remote"
    ? { status: 128, stdout: "", stderr: "fatal: simulated ls-remote failure", error: undefined }
    : spawnSync(cmd, args, opts));
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by, spawnImpl });
  const steps = stepsOf(result);
  assert.equal(steps["origin-branch"].result, "refused");
  assert.equal(steps["origin-branch"].detail, "UNVERIFIABLE: git ls-remote failed");
  assert.equal(result.exitCode, 2);
});

// S1 (addendum-S1-seam, seam fix after merging main): main's 7248ba5 wraps every direct git
// child call's env with withoutRepoLocatingGitEnv so an inherited GIT_DIR/GIT_WORK_TREE/
// GIT_COMMON_DIR (e.g. from inside a git hook) can never point a call at a different repo.
// Modeled on work-record.test.mjs's "checkAcceptance resolves against repoRoot, not an inherited
// GIT_DIR pointed at another repo" - here against sweepOrigin and closeoutRecord's own git calls
// (fetch, show-ref, rev-list, rev-parse, merge-base, ls-remote, for-each-ref, and the
// --force-with-lease origin delete itself), using two wholly separate fixture repos (A and B),
// each with its own local bare origin, so a leak is provable as "B's origin ref set changed",
// not just "A's own effect looked right".
test("sweepOrigin and closeoutRecord never let an inherited GIT_DIR redirect their git calls at a different repo", () => {
  const envA = fixtureEnv();
  const { repo: repoA } = buildRepo(envA);
  const dropTracking = (repo, env, b) => git(["update-ref", "-d", `refs/remotes/origin/${b}`], repo, env);
  // A fast-forwarded branch: its tip sits on main's first parent under every later merge, so
  // tipBehindMergeCommit must keep it - a leaked `merge-base <tip> <p1>` would call it deletable.
  const ffBranch = "build/gitdir-leak-ff-1";
  cutBranch(repoA, envA, ffBranch);
  git(["merge", "--ff-only", "-q", ffBranch], repoA, envA);
  // A deletable branch for sweepOrigin: merged via --no-ff, safe by every evaluateOriginBranch check.
  const sweepBranch = "build/gitdir-leak-sweep-1";
  const { tip: sweepTip } = cutBranch(repoA, envA, sweepBranch);
  mergeNoFF(repoA, envA, sweepBranch);
  // A second, closeoutRecord-owned branch, with its own worktree and closed record.
  const closeBranch = "build/gitdir-leak-close-1";
  const { wt: closeWt, tip: closeTip } = cutBranch(repoA, envA, closeBranch);
  mergeNoFF(repoA, envA, closeBranch);
  pushMain(repoA, envA);
  for (const b of [ffBranch, sweepBranch, closeBranch]) pushBranch(repoA, envA, b);
  // Only a fetch of A's OWN origin can bring these tracking refs back; a fetch leaked to B leaves
  // them missing, and both verdicts below turn into keep/refused.
  dropTracking(repoA, envA, sweepBranch);
  dropTracking(repoA, envA, closeBranch);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repoA, {
    work: "wr-2026-09-28-gitdir-leak-close", worktree: closeBranch, artifact: `${closeBranch}@${closeTip}`, leadSession: by, scratch: scratchPath,
  });

  // Repo B, with its own bare origin carrying SAME-NAMED branches at different tips: a leaked
  // ls-remote sees them present, and a leaked delete that ever lost its lease would remove them.
  // B's own tracking refs are all dropped: a leaked for-each-ref then lists nothing, and a fetch
  // leaked into B recreates them.
  const envB = fixtureEnv();
  const { repo: repoB, origin: originB } = buildRepo(envB);
  const branchB = "build/gitdir-leak-b-1";
  for (const b of [sweepBranch, closeBranch, branchB]) {
    cutBranch(repoB, envB, b, { worktree: false });
    pushBranch(repoB, envB, b);
    dropTracking(repoB, envB, b);
  }
  const beforeOriginB = git(["for-each-ref"], originB, envB);
  const beforeRepoB = git(["for-each-ref"], repoB, envB);

  const hadGitDir = Object.prototype.hasOwnProperty.call(process.env, "GIT_DIR");
  const prevGitDir = process.env.GIT_DIR;
  let sweepResult;
  let closeResult;
  let rerunResult;
  try {
    process.env.GIT_DIR = path.join(repoB, ".git");
    sweepResult = sweepOrigin({ repoRoot: repoA, apply: true, exclude: closeBranch });
    // sweepOrigin's own fetch just restored this tracking ref: drop it again, so closeoutRecord's
    // fetch is the only thing that can bring it back.
    dropTracking(repoA, envA, closeBranch);
    closeResult = closeoutRecord({ repoRoot: repoA, recordPath: recordRel, closeoutBy: by });
    // Re-run: the branch is gone from A's origin, so this one goes through the ls-remote check.
    rerunResult = closeoutRecord({ repoRoot: repoA, recordPath: recordRel, closeoutBy: by });
  } finally {
    if (hadGitDir) process.env.GIT_DIR = prevGitDir;
    else delete process.env.GIT_DIR;
  }

  // Repo A's own effect: both branches actually left A's origin; the fast-forwarded one stayed.
  assert.ok(sweepResult.applied.some((a) => a.name === sweepBranch && a.tip === sweepTip && a.ok === true), `sweepOrigin must have deleted ${sweepBranch} on A's own origin`);
  assert.equal(git(["ls-remote", "--heads", "origin", sweepBranch], repoA, envA).trim(), "");
  assert.notEqual(git(["ls-remote", "--heads", "origin", ffBranch], repoA, envA).trim(), "", `${ffBranch} was fast-forwarded and must be kept`);
  const closeSteps = stepsOf(closeResult);
  assert.equal(closeSteps["origin-branch"].result, "removed");
  assert.equal(closeSteps["origin-branch"].sha, closeTip);
  assert.equal(git(["ls-remote", "--heads", "origin", closeBranch], repoA, envA).trim(), "");
  assert.equal(fs.existsSync(closeWt), false);
  assert.equal(stepsOf(rerunResult)["origin-branch"].result, "absent");

  // Repo B's proof: neither its bare origin nor its own refs moved, even though GIT_DIR pointed
  // straight at it throughout.
  assert.equal(git(["for-each-ref"], originB, envB), beforeOriginB, "repo B's origin refs must be untouched");
  assert.equal(git(["for-each-ref"], repoB, envB), beforeRepoB, "repo B's own refs must be untouched (no leaked fetch)");
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
