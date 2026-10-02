// node --test scripts/closeout-territories.test.mjs
//
// Lane 74 item 4/8: `work-record.mjs close --closeout` also removes a landed lane's territory
// worktrees and local territory branches (`<lane branch>-<id>`), through closeoutWorktree only.
// Fixture repos with a bare fixture origin, as scripts/work-record-closeout.test.mjs; nothing
// here touches a real repo, origin, home or worktree.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { childEnv } from "../skills/multi/scripts/test-child-env.mjs";
import { closeoutRecord } from "./work-record.mjs";

function git(args, cwd, gitEnv) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: gitEnv });
}

const tracked = [];
function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}

function fixtureEnv() {
  const home = mkTmp("terr-git-home-");
  const gitConfigGlobal = path.join(home, ".gitconfig");
  fs.writeFileSync(gitConfigGlobal, "[user]\n\tname = Fixture\n\temail = fixture@example.invalid\n");
  return childEnv(home, { GIT_CONFIG_GLOBAL: gitConfigGlobal, GIT_CONFIG_NOSYSTEM: "1" });
}

function buildRepo(gitEnv) {
  const repo = mkTmp("terr-repo-");
  git(["init", "-q", "-b", "main"], repo, gitEnv);
  fs.writeFileSync(path.join(repo, "README.md"), "root\n");
  git(["add", "."], repo, gitEnv);
  git(["commit", "-q", "-m", "init"], repo, gitEnv);
  const origin = mkTmp("terr-origin-");
  git(["init", "-q", "--bare", "-b", "main"], origin, gitEnv);
  git(["remote", "add", "origin", origin], repo, gitEnv);
  git(["push", "-q", "origin", "main"], repo, gitEnv);
  return repo;
}

function cutBranch(repo, gitEnv, branch, { worktree = true } = {}) {
  git(["branch", branch], repo, gitEnv);
  if (!worktree) return { wt: null, tip: git(["rev-parse", branch], repo, gitEnv).trim() };
  const wt = mkTmp("terr-wt-");
  git(["worktree", "add", wt, branch], repo, gitEnv);
  fs.writeFileSync(path.join(wt, `${branch.split("/").join("_")}.txt`), `${branch}\n`);
  git(["add", "."], wt, gitEnv);
  git(["commit", "-q", "-m", `work on ${branch}`], wt, gitEnv);
  return { wt, tip: git(["rev-parse", "HEAD"], wt, gitEnv).trim() };
}

function mergeNoFF(repo, gitEnv, branch) {
  git(["merge", "--no-ff", "-q", "-m", `merge ${branch}`, branch], repo, gitEnv);
}

let scratchCounter = 0;
function mkScratch() {
  const by = `terr-test-by-${++scratchCounter}-${process.pid}`;
  const parent = path.join(os.tmpdir(), by);
  const dir = path.join(parent, "lane-1");
  fs.mkdirSync(dir, { recursive: true });
  tracked.push(parent);
  return { by, scratchPath: dir };
}

function writeRecord(repo, { work, worktree, artifact, leadSession, scratch, status = "closed" }) {
  const fields = {
    Work: work, Scope: "docs/mandate-template.md@0000000", Owner: "lead", Status: status,
    Authority: "may accept after authorized integration", Artifact: artifact, Evidence: "none",
    Worktree: worktree, Next: "none", Opened: "2026-09-27T09:00:00Z", "Lead-session": leadSession,
    "Spec-session": "fixture-spec-session-1", "Spec-from": "2020-01-01T00:00:00Z", Scratch: scratch,
  };
  const lines = Object.entries(fields).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`);
  lines.push(`Log: 2026-09-27T09:30:00Z ${status} lead ${work}`);
  const rel = path.join("docs", "work", `${work}.record.md`);
  fs.mkdirSync(path.join(repo, "docs", "work"), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), [...lines, "", "Prose body."].join("\n"));
  return rel;
}

/** A landed lane `build/lane-a` plus territory branches, all merged into main and pushed. */
function landedLane() {
  const gitEnv = fixtureEnv();
  const repo = buildRepo(gitEnv);
  const lane = cutBranch(repo, gitEnv, "build/lane-a");
  const clean = cutBranch(repo, gitEnv, "build/lane-a-t1");
  const dirty = cutBranch(repo, gitEnv, "build/lane-a-t2");
  const noWt = cutBranch(repo, gitEnv, "build/lane-a-t4", { worktree: false });
  // a branch that only looks like a territory (a hyphen in its id) belongs to some other lane
  const lookalike = cutBranch(repo, gitEnv, "build/lane-a-b-c");
  for (const b of ["build/lane-a", "build/lane-a-t1", "build/lane-a-t2", "build/lane-a-t4", "build/lane-a-b-c"]) mergeNoFF(repo, gitEnv, b);
  git(["push", "-q", "origin", "main"], repo, gitEnv);
  git(["push", "-q", "origin", "build/lane-a"], repo, gitEnv);
  fs.writeFileSync(path.join(dirty.wt, "uncommitted.txt"), "dirty\n");
  const { by, scratchPath } = mkScratch();
  const recordRel = writeRecord(repo, { work: "wr-2026-10-02-lane-a", worktree: "build/lane-a", artifact: `build/lane-a@${lane.tip}`, leadSession: by, scratch: scratchPath });
  return { gitEnv, repo, lane, clean, dirty, noWt, lookalike, by, recordRel };
}

test("closeout removes a landed lane's clean, merged territory worktree and branch; a dirty one is left; one with no worktree loses only its branch", () => {
  const f = landedLane();
  const result = closeoutRecord({ repoRoot: f.repo, recordPath: f.recordRel, closeoutBy: f.by });
  assert.ok(result.steps.some((st) => st.step === "territory-worktree" && st.result === "removed"), "a territory-worktree removed line");
  assert.equal(fs.existsSync(f.clean.wt), false, "the clean territory worktree is gone");
  assert.equal(git(["branch", "--list", "build/lane-a-t1"], f.repo, f.gitEnv).trim(), "");

  assert.equal(fs.existsSync(f.dirty.wt), true, "a dirty territory worktree is never touched");
  assert.equal(fs.existsSync(path.join(f.dirty.wt, "uncommitted.txt")), true);
  assert.notEqual(git(["branch", "--list", "build/lane-a-t2"], f.repo, f.gitEnv).trim(), "", "its branch stays");
  const dirtyStep = result.steps.find((s) => s.step === "territory-worktree" && s.result === "dirty");
  assert.ok(dirtyStep, "the dirty worktree is reported dirty");
  const dirtyBranch = result.steps.find((s) => s.step === "territory-branch" && s.ref === "build/lane-a-t2");
  assert.equal(dirtyBranch.result, "refused");

  const noWtBranch = result.steps.find((s) => s.step === "territory-branch" && s.ref === "build/lane-a-t4");
  assert.equal(noWtBranch.result, "removed");
  assert.equal(git(["branch", "--list", "build/lane-a-t4"], f.repo, f.gitEnv).trim(), "");

  assert.notEqual(git(["branch", "--list", "build/lane-a-b-c"], f.repo, f.gitEnv).trim(), "", "a hyphenated id is another lane's branch, never swept");
  assert.equal(fs.existsSync(f.lookalike.wt), true);
  assert.equal(result.exitCode, 2, "the dirty one keeps the exit code non-zero");
  assert.ok(result.lines.some((l) => /^territory-worktree: removed /.test(l)));
  assert.ok(result.lines.some((l) => /^territory-branch: removed build\/lane-a-t4/.test(l)));
  assert.ok(result.lines.some((l) => /^territory-worktree: dirty /.test(l)));
});

test("closeout --dry-run reports the territory steps and removes nothing", () => {
  const f = landedLane();
  const result = closeoutRecord({ repoRoot: f.repo, recordPath: f.recordRel, closeoutBy: f.by, dryRun: true });
  assert.ok(result.lines.some((l) => /^territory-worktree: would removed /.test(l)));
  assert.equal(fs.existsSync(f.clean.wt), true);
  assert.notEqual(git(["branch", "--list", "build/lane-a-t1"], f.repo, f.gitEnv).trim(), "");
  assert.notEqual(git(["branch", "--list", "build/lane-a-t4"], f.repo, f.gitEnv).trim(), "");
});

test("an unmerged territory branch is refused and kept with its worktree: no work is lost", () => {
  const gitEnv = fixtureEnv();
  const repo = buildRepo(gitEnv);
  const lane = cutBranch(repo, gitEnv, "build/lane-b");
  const unmerged = cutBranch(repo, gitEnv, "build/lane-b-t1");
  mergeNoFF(repo, gitEnv, "build/lane-b");
  git(["push", "-q", "origin", "main"], repo, gitEnv);
  git(["push", "-q", "origin", "build/lane-b"], repo, gitEnv);
  const { by, scratchPath } = mkScratch();
  const recordRel = writeRecord(repo, { work: "wr-2026-10-02-lane-b", worktree: "build/lane-b", artifact: `build/lane-b@${lane.tip}`, leadSession: by, scratch: scratchPath });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const step = result.steps.find((s) => s.step === "territory-branch" && s.ref === "build/lane-b-t1");
  assert.equal(step.result, "refused");
  assert.match(step.detail, /not merged/);
  assert.equal(fs.existsSync(unmerged.wt), true);
  assert.notEqual(git(["branch", "--list", "build/lane-b-t1"], repo, gitEnv).trim(), "");
  assert.equal(result.steps.filter((s) => s.step === "territory-worktree").length, 0, "an unmerged territory never reaches closeoutWorktree");
});

test("a territory branch named by another open record is refused and kept", () => {
  const gitEnv = fixtureEnv();
  const repo = buildRepo(gitEnv);
  const lane = cutBranch(repo, gitEnv, "build/lane-c");
  const other = cutBranch(repo, gitEnv, "build/lane-c-t1");
  mergeNoFF(repo, gitEnv, "build/lane-c");
  mergeNoFF(repo, gitEnv, "build/lane-c-t1");
  git(["push", "-q", "origin", "main"], repo, gitEnv);
  git(["push", "-q", "origin", "build/lane-c"], repo, gitEnv);
  const { by, scratchPath } = mkScratch();
  writeRecord(repo, { work: "wr-2026-10-02-other", worktree: "build/lane-c-t1", artifact: "none", leadSession: "someone-else", scratch: "none", status: "building" });
  const recordRel = writeRecord(repo, { work: "wr-2026-10-02-lane-c", worktree: "build/lane-c", artifact: `build/lane-c@${lane.tip}`, leadSession: by, scratch: scratchPath });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  const step = result.steps.find((s) => s.step === "territory-branch" && s.ref === "build/lane-c-t1");
  assert.equal(step.result, "refused");
  assert.match(step.detail, /named by wr-2026-10-02-other/);
  assert.equal(fs.existsSync(other.wt), true);
});

test("a lane with no territory branch prints no territory line at all", () => {
  const gitEnv = fixtureEnv();
  const repo = buildRepo(gitEnv);
  const lane = cutBranch(repo, gitEnv, "build/lane-d");
  mergeNoFF(repo, gitEnv, "build/lane-d");
  git(["push", "-q", "origin", "main"], repo, gitEnv);
  git(["push", "-q", "origin", "build/lane-d"], repo, gitEnv);
  const { by, scratchPath } = mkScratch();
  const recordRel = writeRecord(repo, { work: "wr-2026-10-02-lane-d", worktree: "build/lane-d", artifact: `build/lane-d@${lane.tip}`, leadSession: by, scratch: scratchPath });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  assert.ok(!result.lines.some((l) => /^territory-/.test(l)));
  assert.equal(result.exitCode, 0);
});

test("a failed merge proof refuses the lane's own steps and never reaches the territories", () => {
  const gitEnv = fixtureEnv();
  const repo = buildRepo(gitEnv);
  const lane = cutBranch(repo, gitEnv, "build/lane-e");
  const terr = cutBranch(repo, gitEnv, "build/lane-e-t1");
  // nothing merged into main
  const { by, scratchPath } = mkScratch();
  const recordRel = writeRecord(repo, { work: "wr-2026-10-02-lane-e", worktree: "build/lane-e", artifact: `build/lane-e@${lane.tip}`, leadSession: by, scratch: scratchPath });
  const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
  assert.ok(!result.lines.some((l) => /^territory-/.test(l)));
  assert.equal(fs.existsSync(terr.wt), true);
  assert.equal(result.exitCode, 2);
});

test("skills/team-build/SKILL.md: the Ship merge text makes close --closeout --by the step after a pushed merge, and the Accept turn runs it before the RESULT", () => {
  const text = fs.readFileSync(new URL("../skills/team-build/SKILL.md", import.meta.url), "utf8").split(/\s+/).join(" ");
  assert.ok(text.includes("the step that follows a pushed merge"));
  assert.ok(text.includes("--closeout --by <Lead-session>"));
  assert.ok(text.includes("territory worktrees and local territory branches (`<lane branch>-<id>`)"));
  assert.ok(text.includes("run the closeout that paragraph names, and only then send ONE RESULT"));
});

after(() => {
  for (const dir of tracked) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});
