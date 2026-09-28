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
import { execFileSync } from "node:child_process";
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

test("closeoutRecord: a Worktree: naming a branch that was never checked out anywhere is 'absent', not an error, for both worktree and branch steps", () => {
  const env = fixtureEnv();
  const { repo } = buildRepo(env);
  const branch = "build/wt-absent-1";
  const { tip } = cutBranch(repo, env, branch, { worktree: false });
  mergeNoFF(repo, env, branch);
  pushMain(repo, env);
  pushBranch(repo, env, branch);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-wt-absent", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.worktree.result, "absent");
  assert.equal(steps.branch.result, "absent");
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

test("closeoutRecord: scratch step refuses a directory containing a .git entry", () => {
  const env = fixtureEnv();
  const { repo, branch, tip } = closedFixtureForScratch(env);
  const { scratchPath, by } = mkScratchFixture();
  fs.mkdirSync(path.join(scratchPath, ".git"));
  const recordRel = writeClosedRecord(repo, {
    work: "wr-2026-09-27-sc-gitentry", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
  });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const steps = stepsOf(result);
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /\.git entry/);
  assert.equal(fs.existsSync(scratchPath), true);
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
  const ls = git(["ls-remote", "--heads", "origin", branch], repo, env).trim();
  assert.notEqual(ls, "", "the branch (with the raced-in commit) must survive a lease that no longer matches origin's current tip - a lease is conditional, never a force");
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
