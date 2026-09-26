// node --test scripts/collect-from-origin.test.mjs
//
// Builds real throwaway git repositories + a bare "origin" remote under a temp dir - no mocked
// git, same convention as scripts/janitor.test.mjs. Every mkdtemp'd directory is tracked and
// removed in one after() hook at the bottom of this file.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  main,
  parseArgs,
  fullRef,
  refExists,
  listOriginBranches,
  changedRecordPaths,
  extractArtifactSha,
  computeState,
  hoursSinceLog,
  formatTable,
} from "./collect-from-origin.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

const tracked = [];
function mkTmp(prefix) {
  // Same fallback as janitor.test.mjs's mkTmp: FIXTURE_ROOT under a sealed run, else the
  // system temp dir.
  const dir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}

function writeRecord(root, filename, lines) {
  const dir = path.join(root, "docs", "work");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), lines.join("\n"));
  return path.join("docs", "work", filename);
}

function commitAll(root, msg) {
  git(["add", "."], root);
  git(["commit", "-q", "-m", msg], root);
}

/** Builds a repo with an initial commit, a bare "origin" remote, and main pushed. */
function initRepoWithOrigin() {
  const root = mkTmp("collect-repo-");
  git(["init", "-q", "-b", "main"], root);
  fs.writeFileSync(path.join(root, "README.md"), "root\n");
  commitAll(root, "init");
  const bare = mkTmp("collect-origin-");
  git(["init", "-q", "--bare", "-b", "main"], bare);
  git(["remote", "add", "origin", bare], root);
  git(["push", "-q", "origin", "main"], root);
  return root;
}

function newBranch(root, name) {
  git(["checkout", "-q", "-b", name], root);
}

function pushBranch(root, name) {
  git(["push", "-q", "origin", name], root);
}

function backToMain(root) {
  git(["checkout", "-q", "main"], root);
}

/** Every file under .git, by path, paired with a sha256 of its bytes — used to prove a run
 * never writes anything (F8: HEAD/branch/status alone would miss a write to refs, config or
 * loose objects). */
function snapshotGitDir(root) {
  const gitDir = path.join(root, ".git");
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(gitDir);
  return files
    .sort()
    .map((f) => `${path.relative(root, f)}:${crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")}`);
}

function rowsOf(root, extraArgs = []) {
  const written = [];
  const code = main(["--repo", root, "--no-fetch", "--json", ...extraArgs], { write: (s) => written.push(s) });
  assert.equal(code, 0);
  return JSON.parse(written[0]);
}

// ---------------------------------------------------------------------------
// Unit-level helpers
// ---------------------------------------------------------------------------

test("extractArtifactSha: 40-hex after @, a bare 40-hex, or null for anything else", () => {
  const sha = "a".repeat(40);
  assert.equal(extractArtifactSha(`scripts/foo.mjs@${sha}`), sha);
  assert.equal(extractArtifactSha(sha.toUpperCase()), sha);
  assert.equal(extractArtifactSha("none"), null);
  assert.equal(extractArtifactSha("scripts/foo.mjs@not-a-sha"), null);
  assert.equal(extractArtifactSha(undefined), null);
});

test("computeState: accepted maps by merged, rejected passes through, everything else is owned", () => {
  assert.equal(computeState("accepted", true), "accepted-merged");
  assert.equal(computeState("accepted", false), "accepted-unmerged");
  assert.equal(computeState("accepted", null), "accepted-unmerged"); // unknown is never merged
  assert.equal(computeState("rejected", null), "rejected");
  assert.equal(computeState("owned", null), "owned");
  assert.equal(computeState(undefined, null), "owned"); // absent Status: -> owned, not no-record
  assert.equal(computeState("some-typo'd-status", null), "owned");
});

test("hoursSinceLog: hours since the LAST Log: line in file order, null with no log or a bad date", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  assert.equal(hoursSinceLog([{ at: "2026-09-26T06:00:00Z" }, { at: "2026-09-26T10:00:00Z" }], now), 2);
  assert.equal(hoursSinceLog([], now), null);
  assert.equal(hoursSinceLog([{ at: "not-a-date" }], now), null);
});

test("parseArgs: flags, --main default, repeatable --skip", () => {
  const a = parseArgs(["--repo", "/x", "--main", "origin/release", "--no-fetch", "--json", "--skip", "a", "--skip", "b"]);
  assert.deepEqual(a, { repo: "/x", main: "origin/release", noFetch: true, json: true, skip: ["a", "b"] });
  assert.equal(parseArgs([]).main, "origin/main");
});

test("fullRef: origin/main -> refs/remotes/origin/main; a bare name -> refs/heads/<name>; refs/* passes through", () => {
  assert.equal(fullRef("origin/main"), "refs/remotes/origin/main");
  assert.equal(fullRef("main"), "refs/heads/main");
  assert.equal(fullRef("refs/heads/main"), "refs/heads/main");
});

test("formatTable: header row plus one tab-separated row per record, with '-' for null/undefined", () => {
  const table = formatTable([{
    branch: "b", tipSha: "s", tipDate: "d", recordPath: "p", status: "owned",
    artifactSha: null, merged: null, hoursSinceLog: null, state: "owned",
  }]);
  const lines = table.split("\n");
  assert.equal(lines[0], "branch\ttipSha\ttipDate\trecordPath\tstatus\tartifactSha\tmerged\thoursSinceLog\tstate");
  assert.equal(lines[1], "b\ts\td\tp\towned\t-\t-\t-\towned");
});

// ---------------------------------------------------------------------------
// The pinned fixture: three origin/* branches, one row each, accepted-unmerged /
// accepted-merged / owned - plus rejected and no-record for full state coverage.
// ---------------------------------------------------------------------------

test("bare-remote fixture: accepted-unmerged, accepted-merged, owned, rejected, no-record all classify correctly", () => {
  const root = initRepoWithOrigin();

  // accepted-merged: the artifact commit ("A") lands on main FIRST, so any branch built on
  // top of it trivially has it as an ancestor of main - the record itself (added only on the
  // branch) is still unmerged, but its named artifact already is.
  fs.writeFileSync(path.join(root, "artifact-a.txt"), "a\n");
  commitAll(root, "artifact A");
  const artifactA = git(["rev-parse", "HEAD"], root).trim();
  git(["push", "-q", "origin", "main"], root);

  newBranch(root, "feature/accepted-merged");
  const recAM = writeRecord(root, "wr-2026-09-26-am.record.md", [
    "Work: wr-2026-09-26-am", "Status: accepted", `Artifact: scripts/foo.mjs@${artifactA}`,
    "Log: 2026-09-26T01:00:00Z accepted t1 note", "",
  ]);
  commitAll(root, "am record");
  pushBranch(root, "feature/accepted-merged");
  backToMain(root);

  // accepted-unmerged: the artifact commit ("B") lives ONLY on this branch - never an
  // ancestor of main.
  newBranch(root, "feature/accepted-unmerged");
  fs.writeFileSync(path.join(root, "artifact-b.txt"), "b\n");
  commitAll(root, "artifact B");
  const artifactB = git(["rev-parse", "HEAD"], root).trim();
  const recAU = writeRecord(root, "wr-2026-09-26-au.record.md", [
    "Work: wr-2026-09-26-au", "Status: accepted", `Artifact: ${artifactB}`,
    "Log: 2026-09-26T02:00:00Z accepted t1 note", "",
  ]);
  commitAll(root, "au record");
  pushBranch(root, "feature/accepted-unmerged");
  backToMain(root);

  // owned: no artifact yet.
  newBranch(root, "feature/owned");
  const recOwned = writeRecord(root, "wr-2026-09-26-owned.record.md", [
    "Work: wr-2026-09-26-owned", "Status: owned", "Artifact: none",
    "Log: 2026-09-26T03:00:00Z owned t1 note", "",
  ]);
  commitAll(root, "owned record");
  pushBranch(root, "feature/owned");
  backToMain(root);

  // rejected.
  newBranch(root, "feature/rejected");
  const recRejected = writeRecord(root, "wr-2026-09-26-rejected.record.md", [
    "Work: wr-2026-09-26-rejected", "Status: rejected", "Artifact: none",
    "Log: 2026-09-26T04:00:00Z rejected t1 note", "",
  ]);
  commitAll(root, "rejected record");
  pushBranch(root, "feature/rejected");
  backToMain(root);

  // no-record: this branch has real unmerged work of its own (so it is not skipped as fully
  // merged, F3) but never touches any docs/work/*.record.md path at all - it should get
  // exactly one row, with recordPath: null, rather than disappear from the table entirely (F2).
  newBranch(root, "feature/no-record");
  fs.writeFileSync(path.join(root, "unrelated.txt"), "unrelated\n");
  commitAll(root, "no-record work");
  pushBranch(root, "feature/no-record");
  backToMain(root);
  const recOnMainOnly = writeRecord(root, "wr-2026-09-26-main-only.record.md", [
    "Work: wr-2026-09-26-main-only", "Status: accepted", "Artifact: none", "",
  ]);
  commitAll(root, "main-only record");
  git(["push", "-q", "origin", "main"], root);

  const rows = rowsOf(root);
  assert.deepEqual(rowsOf(path.join(root, "docs")), rows); // F5: a subdirectory --repo reads the same table
  // Look up rows by (branch, recordPath): a branch with several changed records yields one row
  // per record (R1), so recordPath - not just branch - is part of the row's identity.
  const rowFor = (branch, recordPath) => rows.find((r) => r.branch === branch && r.recordPath === recordPath);

  const am = rowFor("feature/accepted-merged", recAM);
  assert.equal(am.state, "accepted-merged");
  assert.equal(am.merged, true);
  assert.equal(am.artifactSha, artifactA);

  const au = rowFor("feature/accepted-unmerged", recAU);
  assert.equal(au.state, "accepted-unmerged");
  assert.equal(au.merged, false);
  assert.equal(au.artifactSha, artifactB);

  assert.equal(rowFor("feature/owned", recOwned).state, "owned");
  assert.equal(rowFor("feature/rejected", recRejected).state, "rejected");

  const noRecord = rowFor("feature/no-record", null);
  assert.equal(noRecord.state, "no-record");
  assert.equal(noRecord.status, null);
  assert.equal(noRecord.artifactSha, null);
  assert.equal(noRecord.merged, null);

  // recOnMainOnly lives only on main, added after every other branch forked - it never shows up
  // as a row for any of them (that was the old, noisy D-direction behavior F2 removed).
  for (const b of ["feature/accepted-merged", "feature/accepted-unmerged", "feature/owned", "feature/rejected", "feature/no-record"]) {
    assert.equal(rowFor(b, recOnMainOnly), undefined);
  }

  // Row shape and key order are exactly R1's pinned field list, for every row.
  const expectedKeys = ["branch", "tipSha", "tipDate", "recordPath", "status", "artifactSha", "merged", "hoursSinceLog", "state"];
  for (const r of rows) assert.deepEqual(Object.keys(r), expectedKeys);

  // Text-mode output carries the same rows.
  const written = [];
  main(["--repo", root, "--no-fetch"], { write: (s) => written.push(s) });
  assert.match(written[0], /accepted-merged/);
  assert.match(written[0], /accepted-unmerged/);
  assert.match(written[0], /no-record/);
});

test("main branch and HEAD are never listed as rows; --skip removes a named branch", () => {
  const root = initRepoWithOrigin();
  newBranch(root, "feature/skippable");
  writeRecord(root, "wr-2026-09-26-skip.record.md", ["Work: wr-2026-09-26-skip", "Status: owned", "Artifact: none", ""]);
  commitAll(root, "skip record");
  pushBranch(root, "feature/skippable");
  backToMain(root);

  const withoutSkip = rowsOf(root);
  assert.ok(withoutSkip.some((r) => r.branch === "feature/skippable"));
  assert.ok(!withoutSkip.some((r) => r.branch === "main"));
  assert.ok(!withoutSkip.some((r) => r.branch === "HEAD"));

  const withSkip = rowsOf(root, ["--skip", "feature/skippable"]);
  assert.ok(!withSkip.some((r) => r.branch === "feature/skippable"));
});

test("a branch with several changed records yields one row per record (R1)", () => {
  const root = initRepoWithOrigin();
  newBranch(root, "feature/multi");
  const p1 = writeRecord(root, "wr-2026-09-26-one.record.md", ["Work: wr-2026-09-26-one", "Status: owned", "Artifact: none", ""]);
  const p2 = writeRecord(root, "wr-2026-09-26-two.record.md", ["Work: wr-2026-09-26-two", "Status: owned", "Artifact: none", ""]);
  commitAll(root, "two records");
  pushBranch(root, "feature/multi");
  backToMain(root);

  const rows = rowsOf(root).filter((r) => r.branch === "feature/multi");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.recordPath).sort(), [p1, p2].sort());
});

test("a branch identical to main (no changed record) contributes zero rows", () => {
  const root = initRepoWithOrigin();
  newBranch(root, "feature/identical");
  pushBranch(root, "feature/identical");
  backToMain(root);

  const rows = rowsOf(root).filter((r) => r.branch === "feature/identical");
  assert.equal(rows.length, 0);
});

test("--no-fetch skips the network call entirely: origin unreachable still exits 0 on local refs", () => {
  const root = initRepoWithOrigin();
  newBranch(root, "feature/local-only");
  writeRecord(root, "wr-2026-09-26-local.record.md", ["Work: wr-2026-09-26-local", "Status: owned", "Artifact: none", ""]);
  commitAll(root, "local record");
  pushBranch(root, "feature/local-only");
  backToMain(root);

  git(["remote", "set-url", "origin", "/nonexistent/bare/repo/path"], root);
  const rows = rowsOf(root); // rowsOf always passes --no-fetch
  assert.ok(rows.some((r) => r.branch === "feature/local-only"));
});

test("a real fetch failure still exits 0, with a stderr warning, using whatever local refs exist", () => {
  const root = initRepoWithOrigin();
  git(["remote", "set-url", "origin", "/nonexistent/bare/repo/path"], root);
  const warnings = [];
  const written = [];
  const code = main(["--repo", root, "--json"], { write: (s) => written.push(s), warn: (s) => warnings.push(s) });
  assert.equal(code, 0);
  assert.ok(warnings.some((w) => /fetch failed/.test(w)));
  assert.deepEqual(JSON.parse(written[0]), []); // origin/main is still there locally; no other branches
});

test("attack: tip equals main and Artifact: is missing never reads as merged, even with a later-Status record on main for the same path", () => {
  const root = initRepoWithOrigin();

  // main gets its OWN version of the same record path, with a later Status and a real,
  // merged artifact - a naive reader that fell back to main's blob would call the branch
  // "merged" too.
  fs.writeFileSync(path.join(root, "mainartifact.txt"), "m\n");
  commitAll(root, "main artifact");
  const mainArtifact = git(["rev-parse", "HEAD"], root).trim();
  const sharedPath = writeRecord(root, "wr-2026-09-26-attack.record.md", [
    "Work: wr-2026-09-26-attack", "Status: accepted", `Artifact: ${mainArtifact}`, "",
  ]);
  commitAll(root, "main's own record");
  git(["push", "-q", "origin", "main"], root);

  // The branch is cut from main's tip (tip sha === main's tip sha right now) and OVERWRITES
  // the same record path with Status: accepted but no resolvable Artifact: at all.
  newBranch(root, "feature/attack");
  writeRecord(root, "wr-2026-09-26-attack.record.md", ["Work: wr-2026-09-26-attack", "Status: accepted", "Artifact: none", ""]);
  commitAll(root, "branch overwrites record");
  const branchTip = git(["rev-parse", "HEAD"], root).trim();
  pushBranch(root, "feature/attack");
  backToMain(root);
  // Advance main by one commit so the branch's tip is not literally == main's tip (a real
  // "tip equals main" would just make this branch invisible - nothing to diff), while the
  // ARTIFACT commit (main's tip at branch-cut time) is still an ancestor of main either way.
  fs.writeFileSync(path.join(root, "later.txt"), "later\n");
  commitAll(root, "main moves on");
  git(["push", "-q", "origin", "main"], root);

  const row = rowsOf(root).find((r) => r.branch === "feature/attack" && r.recordPath === sharedPath);
  assert.ok(row, "expected a row for the attack branch's own record");
  assert.equal(row.tipSha, branchTip);
  assert.equal(row.status, "accepted");
  assert.equal(row.artifactSha, null); // read from the BRANCH's blob, not main's
  assert.equal(row.merged, null); // unknown, never merged
  assert.equal(row.state, "accepted-unmerged");
});

test("F1 regression: piped/subprocess --json output past 64 KiB is never truncated", () => {
  const root = initRepoWithOrigin();
  const branches = 5;
  const recordsPerBranch = 100;
  for (let b = 0; b < branches; b++) {
    const name = `feature/bulk-${b}`;
    newBranch(root, name);
    for (let i = 0; i < recordsPerBranch; i++) {
      writeRecord(root, `wr-2026-09-26-bulk-${b}-${i}.record.md`, ["Work: wr-2026-09-26-bulk", "Status: owned", "Artifact: none", ""]);
    }
    commitAll(root, `bulk ${b}`);
    pushBranch(root, name);
    backToMain(root);
  }

  const scriptPath = fileURLToPath(new URL("./collect-from-origin.mjs", import.meta.url));
  // A real shell pipe (`| cat`), not execFileSync's own capture: only a pipe the child sees as
  // non-blocking reproduces the 64 KiB truncation that process.exit caused (F1).
  const out = execFileSync("sh", ["-c", '"$0" "$1" --repo "$2" --no-fetch --json | cat', process.execPath, scriptPath, root], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.ok(out.length > 65536, `expected output over 64 KiB, got ${out.length} bytes`);
  assert.equal(JSON.parse(out).length, branches * recordsPerBranch); // throws if truncated mid-string
});

test("attack: a branch that has already been fully merged into main disappears entirely, even though main later rewrites the same record with a later Status", () => {
  const root = initRepoWithOrigin();

  newBranch(root, "feature/merged");
  writeRecord(root, "wr-2026-09-26-merged.record.md", ["Work: wr-2026-09-26-merged", "Status: accepted", "Artifact: none", ""]);
  commitAll(root, "merged record");
  pushBranch(root, "feature/merged");

  // Fast-forward main onto the branch's own tip - the branch's tip is now literally an
  // ancestor of main (F3's real-world evidence: a merged branch whose record was later
  // superseded on main still showed up as a false "owned" row).
  backToMain(root);
  git(["merge", "-q", "--ff-only", "feature/merged"], root);
  git(["push", "-q", "origin", "main"], root);

  // main moves on again and rewrites the SAME record path with a later Status and a real,
  // merged artifact - a reader that fell back to the branch's now-stale blob, or that only
  // checked "does the record differ from main", would still show this branch as an
  // unresolved accepted/owned row. It must not appear at all: its tip is an ancestor of main.
  fs.writeFileSync(path.join(root, "later-merge.txt"), "later\n");
  commitAll(root, "main moves on");
  const laterArtifact = git(["rev-parse", "HEAD"], root).trim();
  writeRecord(root, "wr-2026-09-26-merged.record.md", ["Work: wr-2026-09-26-merged", "Status: accepted", `Artifact: build/x@${laterArtifact}`, ""]);
  commitAll(root, "main rewrites the same record with a later Status");
  git(["push", "-q", "origin", "main"], root);

  const rows = rowsOf(root).filter((r) => r.branch === "feature/merged");
  assert.deepEqual(rows, []);
});

test("three-dot: a record main rewrote after an unmerged branch forked is not a row for that branch", () => {
  const root = initRepoWithOrigin();
  const shared = writeRecord(root, "wr-2026-09-26-shared.record.md", ["Work: wr-2026-09-26-shared", "Status: owned", "Artifact: none", ""]);
  commitAll(root, "shared record on main");
  git(["push", "-q", "origin", "main"], root);

  newBranch(root, "feature/unmerged");
  fs.writeFileSync(path.join(root, "branch-work.txt"), "w\n");
  commitAll(root, "unmerged branch work, no record touched");
  pushBranch(root, "feature/unmerged");
  backToMain(root);

  writeRecord(root, "wr-2026-09-26-shared.record.md", ["Work: wr-2026-09-26-shared", "Status: accepted", "Artifact: none", ""]);
  commitAll(root, "main moves the shared record on");
  git(["push", "-q", "origin", "main"], root);

  const rows = rowsOf(root).filter((r) => r.branch === "feature/unmerged");
  assert.equal(rows.find((r) => r.recordPath === shared), undefined); // the branch's stale copy is not its change
  assert.deepEqual(rows.map((r) => r.state), ["no-record"]);
});

test("no merge base (orphan branch): its record is still a row, never a confident no-record", () => {
  const root = initRepoWithOrigin();
  git(["checkout", "-q", "--orphan", "orphan"], root);
  git(["rm", "-rq", "--cached", "."], root);
  const rec = writeRecord(root, "wr-2026-09-26-orphan.record.md", ["Work: wr-2026-09-26-orphan", "Status: accepted", "Artifact: none", ""]);
  git(["add", rec], root);
  git(["commit", "-q", "-m", "orphan record"], root);
  pushBranch(root, "orphan");
  git(["checkout", "-q", "-f", "main"], root);

  const rows = rowsOf(root).filter((r) => r.branch === "orphan");
  assert.deepEqual(rows.map((r) => [r.recordPath, r.state]), [[rec, "accepted-unmerged"]]);
});

test("never writes: every file under .git is byte-identical (by content hash) before and after a run", () => {
  const root = initRepoWithOrigin();
  newBranch(root, "feature/readonly-check");
  writeRecord(root, "wr-2026-09-26-ro.record.md", ["Work: wr-2026-09-26-ro", "Status: owned", "Artifact: none", ""]);
  commitAll(root, "ro record");
  pushBranch(root, "feature/readonly-check");
  backToMain(root);

  // Snapshots every file under .git (not just HEAD/branch/status, which would miss a write to
  // refs, config or a loose object - F8), before and after a --no-fetch run.
  const before = snapshotGitDir(root);
  rowsOf(root); // always --no-fetch
  const after = snapshotGitDir(root);
  assert.deepEqual(after, before);
});

test("refExists: true for a real ref, false for an absent one", () => {
  const root = initRepoWithOrigin();
  assert.equal(refExists(root, "refs/remotes/origin/main"), true);
  assert.equal(refExists(root, "refs/remotes/origin/does-not-exist"), false);
});

test("listOriginBranches: skips names in the skip set, strips the origin/ prefix", () => {
  const root = initRepoWithOrigin();
  newBranch(root, "feature/listed");
  pushBranch(root, "feature/listed");
  backToMain(root);
  const branches = listOriginBranches(root, new Set(["main", "HEAD"])).map((b) => b.name);
  assert.deepEqual(branches, ["feature/listed"]);
});

test("changedRecordPaths: diff --name-only against docs/work/*.record.md, added and identical cases", () => {
  const root = initRepoWithOrigin();
  newBranch(root, "feature/diffcheck");
  const p = writeRecord(root, "wr-2026-09-26-diff.record.md", ["Work: wr-2026-09-26-diff", "Status: owned", "Artifact: none", ""]);
  commitAll(root, "diff record");
  pushBranch(root, "feature/diffcheck");
  assert.deepEqual(changedRecordPaths(root, "refs/remotes/origin/main", "refs/remotes/origin/feature/diffcheck"), [p]);
  assert.deepEqual(changedRecordPaths(root, "refs/remotes/origin/main", "refs/remotes/origin/main"), []);
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
