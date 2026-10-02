// node --test skills/team-build/references/accept-prep.test.mjs
//
// R3 (docs/specs/one-launch-2/contracts.md): (a) a record edit differs ONLY in the fields
// accept-prep owns, plus one appended Log line (byte diff, checked against committed
// fixtures); (b) ORDER — a fake --plugin-root's stub scripts prove the census only ever
// sees the record AFTER the reviewed Log: line is written, and check-acceptance only ever
// runs after that; (c) a census failure leaves the record edit in place and reports
// censusPath: null; (d) accept-prep never writes Status: accepted.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { childEnv } from "../../multi/scripts/test-child-env.mjs";
import {
  parseArgs, editRecord, splitPreservingEol, joinPreservingEol, formatLogLine, main,
} from "./accept-prep.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "accept-prep.mjs");
const FIXTURES = path.join(HERE, "fixtures", "accept-prep");
const FIXTURE_NO_WORKTREE = path.join(FIXTURES, "record-no-worktree.md");
const FIXTURE_WITH_WORKTREE = path.join(FIXTURES, "record-with-worktree.md");

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix));
}

// Builds a throwaway repo directory with the named fixture copied in at `recordRel`, and
// returns { repo, recordRel, recordAbsPath }.
function makeRepoWithRecord(fixturePath, recordRel = "docs/work/wr-x.record.md") {
  const repo = mkTmp("accept-prep-repo-");
  const recordAbsPath = path.join(repo, recordRel);
  fs.mkdirSync(path.dirname(recordAbsPath), { recursive: true });
  fs.copyFileSync(fixturePath, recordAbsPath);
  return { repo, recordRel, recordAbsPath };
}

// -------------------------------------------------------------------------------------
// R3(a): byte diff — differs ONLY in the owned fields plus one appended Log line.
// -------------------------------------------------------------------------------------

test("R3a: editRecord on a record with no Worktree: changes only Status/Artifact/Evidence, inserts Worktree, appends one Log line — everything else byte-identical", () => {
  const { repo, recordRel, recordAbsPath } = makeRepoWithRecord(FIXTURE_NO_WORKTREE);
  const original = fs.readFileSync(recordAbsPath, "utf8");

  const opts = {
    repo, recordPath: recordRel,
    deliveryRef: "build/fixture-int", artifactSha: "2".repeat(40),
    worktree: "build/fixture-int", owner: "skills-n", logNote: "seam SKIPPED",
    evidence: "docs/work/evidence/fixture-seam.md",
    now: "2026-09-20T16:00:00.000Z",
  };
  const changed = editRecord(opts);
  assert.deepEqual(changed, ["Status", "Artifact", "Evidence", "Worktree", "Log"]);

  const updated = fs.readFileSync(recordAbsPath, "utf8");
  const expected = [
    "Work: wr-2026-09-20-fixture-sample",
    "Scope: skills/team-build/references/accept-prep.mjs",
    "Owner: skills-n",
    "Status: reviewed",
    "Authority: build, review, integrate on green",
    "Artifact: build/fixture-int@2222222222222222222222222222222222222222",
    "Evidence: docs/notes/fixture-note.md, docs/work/evidence/fixture-seam.md",
    "Next: run accept-prep",
    "Opened: 2026-09-20T10:00:00.000Z",
    "Lead-session: /home/lead/session.jsonl",
    "Base: 1111111111111111111111111111111111111111",
    "Worktree: build/fixture-int",
    "Log: 2026-09-20T10:00:00.000Z owned skills-n opened",
    "Log: 2026-09-20T11:00:00.000Z owned skills-n dispatched build round 1",
    "Log: 2026-09-20T12:00:00.000Z owned skills-n build round 1 complete",
    "Log: 2026-09-20T13:00:00.000Z owned skills-n review round 1 NEEDS_FIXES",
    "Log: 2026-09-20T14:00:00.000Z owned skills-n build round 2 complete",
    "Log: 2026-09-20T15:00:00.000Z owned skills-n review round 2 APPROVE",
    "Log: 2026-09-20T16:00:00.000Z reviewed skills-n seam SKIPPED",
    "",
    "Observed: pending review closeout.",
    "",
  ].join("\n");
  assert.equal(updated, expected);
  assert.notEqual(updated, original);

  // Every UNCHANGED original line still appears verbatim, in order, in the updated file
  // (a genuine line-level byte diff, not just a full-text hand comparison above).
  const originalLines = original.split("\n");
  const updatedLines = updated.split("\n");
  const unchangedOriginalLines = originalLines.filter(
    (l) => !/^(Status|Artifact|Evidence):/.test(l),
  );
  for (const line of unchangedOriginalLines) {
    assert.ok(updatedLines.includes(line), `unchanged line lost: ${line}`);
  }
});

test("R3a: editRecord on a record WITH an existing Worktree: updates it in place (no insert) and dedupes Evidence, keeping existing order", () => {
  const { repo, recordRel, recordAbsPath } = makeRepoWithRecord(FIXTURE_WITH_WORKTREE);
  const opts = {
    repo, recordPath: recordRel,
    deliveryRef: "build/fixture-int-2", artifactSha: "3".repeat(40),
    worktree: "build/fixture-sample-2-updated", owner: "skills-n",
    logNote: "seam r2 APPROVE 4444444444444444444444444444444444444444",
    evidence: "docs/notes/fixture-note.md,docs/work/evidence/fixture-seam.md",
    now: "2026-09-20T16:30:00.000Z",
  };
  const changed = editRecord(opts);
  assert.deepEqual(changed, ["Status", "Artifact", "Evidence", "Worktree", "Log"]);

  const updated = fs.readFileSync(recordAbsPath, "utf8");
  const expected = [
    "Work: wr-2026-09-20-fixture-sample-2",
    "Scope: skills/team-build/references/accept-prep.mjs",
    "Owner: skills-n",
    "Status: reviewed",
    "Authority: build, review, integrate on green",
    "Artifact: build/fixture-int-2@3333333333333333333333333333333333333333",
    "Worktree: build/fixture-sample-2-updated",
    "Evidence: docs/notes/fixture-note.md, docs/notes/fixture-note-2.md, docs/work/evidence/fixture-seam.md",
    "Next: run accept-prep",
    "Opened: 2026-09-20T10:00:00.000Z",
    "Lead-session: /home/lead/session.jsonl",
    "Base: 1111111111111111111111111111111111111111",
    "Log: 2026-09-20T10:00:00.000Z owned skills-n opened",
    "Log: 2026-09-20T11:00:00.000Z owned skills-n dispatched build round 1",
    "Log: 2026-09-20T12:00:00.000Z owned skills-n build round 1 complete",
    "Log: 2026-09-20T13:00:00.000Z owned skills-n review round 1 NEEDS_FIXES",
    "Log: 2026-09-20T14:00:00.000Z owned skills-n build round 2 complete",
    "Log: 2026-09-20T15:00:00.000Z owned skills-n review round 2 APPROVE",
    "Log: 2026-09-20T16:30:00.000Z reviewed skills-n seam r2 APPROVE 4444444444444444444444444444444444444444",
    "",
    "Observed: pending review closeout.",
    "",
  ].join("\n");
  assert.equal(updated, expected);
  // No new Worktree: line was inserted — the count of "Worktree:" lines stays at 1.
  assert.equal((updated.match(/^Worktree:/gm) ?? []).length, 1);
});

// The repo's own .gitattributes normalizes committed text files to LF (eol=lf), so a
// genuinely CRLF fixture can never be committed and read back with its \r\n bytes
// intact — this one is built at runtime, in a tmp file, never through git at all.
function makeCrlfRepoWithRecord() {
  const repo = mkTmp("accept-prep-repo-");
  const recordRel = "docs/work/wr-x.record.md";
  const recordAbsPath = path.join(repo, recordRel);
  fs.mkdirSync(path.dirname(recordAbsPath), { recursive: true });
  const text = [
    "Work: wr-2026-09-20-fixture-crlf",
    "Scope: skills/team-build/references/accept-prep.mjs",
    "Owner: skills-n",
    "Status: owned",
    "Authority: build, review, integrate on green",
    "Artifact: none yet",
    "Evidence: docs/notes/fixture-note.md",
    "Next: run accept-prep",
    "Opened: 2026-09-20T10:00:00.000Z",
    "Log: 2026-09-20T10:00:00.000Z owned skills-n opened",
    "",
    "Observed: pending review closeout.",
    "",
  ].join("\r\n");
  fs.writeFileSync(recordAbsPath, text);
  return { repo, recordRel, recordAbsPath };
}

test("R3a (line endings): a CRLF record's untouched lines keep \\r\\n exactly, including the newly inserted Log line", () => {
  const { repo, recordRel, recordAbsPath } = makeCrlfRepoWithRecord();
  const opts = {
    repo, recordPath: recordRel,
    deliveryRef: "build/crlf", artifactSha: "6".repeat(40),
    worktree: "build/crlf", owner: "skills-n", logNote: "note",
    evidence: "docs/notes/extra.md", now: "2026-09-20T17:00:00.000Z",
  };
  editRecord(opts);
  const updated = fs.readFileSync(recordAbsPath, "utf8");
  assert.ok(!/[^\r]\n/.test(updated), "every newline in the CRLF fixture's output must be preceded by \\r");
  const expected = [
    "Work: wr-2026-09-20-fixture-crlf",
    "Scope: skills/team-build/references/accept-prep.mjs",
    "Owner: skills-n",
    "Status: reviewed",
    "Authority: build, review, integrate on green",
    "Artifact: build/crlf@6666666666666666666666666666666666666666",
    "Evidence: docs/notes/fixture-note.md, docs/notes/extra.md",
    "Next: run accept-prep",
    "Opened: 2026-09-20T10:00:00.000Z",
    "Worktree: build/crlf",
    "Log: 2026-09-20T10:00:00.000Z owned skills-n opened",
    "Log: 2026-09-20T17:00:00.000Z reviewed skills-n note",
    "",
    "Observed: pending review closeout.",
    "",
  ].join("\r\n");
  assert.equal(updated, expected);
});

test("R3a: editRecord throws missing-field, changes nothing on disk, when Status: is absent", () => {
  const repo = mkTmp("accept-prep-repo-");
  const recordRel = "docs/work/wr-bad.record.md";
  const recordAbsPath = path.join(repo, recordRel);
  fs.mkdirSync(path.dirname(recordAbsPath), { recursive: true });
  const text = "Work: wr-x\nArtifact: none\nEvidence: none\n\nObserved: x.\n";
  fs.writeFileSync(recordAbsPath, text);
  assert.throws(
    () => editRecord({ repo, recordPath: recordRel, deliveryRef: "b", artifactSha: "7".repeat(40), worktree: "b", owner: "o", logNote: "n", evidence: "e" }),
    /Status/,
  );
  assert.equal(fs.readFileSync(recordAbsPath, "utf8"), text, "a failed edit must never touch the file");
});

// lane 67 addendum (d): a record opened per SKILL.md Setup step 7 carries no Artifact: or
// Evidence: line yet; accept-prep inserts them (the same insert-if-absent path Worktree: uses)
// instead of exiting [missing-field]. Status: stays required (the test above).
test("lane 67 (d): editRecord inserts Artifact: and Evidence: when absent, after the last singleton header line, every unowned line byte-identical", () => {
  const repo = mkTmp("accept-prep-repo-");
  const recordRel = "docs/work/wr-open.record.md";
  const recordAbsPath = path.join(repo, recordRel);
  fs.mkdirSync(path.dirname(recordAbsPath), { recursive: true });
  const text = [
    "Work: wr-2026-10-01-open",
    "Scope: docs/specs/open/spec.md",
    "Owner: skills-f",
    "Status: owned",
    "Authority: build on the lane branch",
    "Next: run the loop",
    "Opened: 2026-10-01T10:00:00.000Z",
    "Lead-session: sess-0123456789",
    "Scratch: /tmp/scratch/sess/lane",
    "Workflow: wf_abc123",
    "Log: 2026-10-01T10:00:00.000Z owned skills-f opened",
    "",
    "Observed: pending.",
    "",
  ].join("\n");
  fs.writeFileSync(recordAbsPath, text);
  const changed = editRecord({
    repo, recordPath: recordRel, deliveryRef: "build/open", artifactSha: "9".repeat(40),
    worktree: "build/open", owner: "skills-f", logNote: "note",
    evidence: "docs/work/evidence/wr-open-L1.md,docs/work/evidence/wr-open-seam.md", now: "2026-10-01T12:00:00.000Z",
  });
  assert.deepEqual(changed, ["Status", "Artifact", "Evidence", "Worktree", "Workflow", "Log"]);
  const expected = [
    "Work: wr-2026-10-01-open",
    "Scope: docs/specs/open/spec.md",
    "Owner: skills-f",
    "Status: reviewed",
    "Authority: build on the lane branch",
    "Next: run the loop",
    "Opened: 2026-10-01T10:00:00.000Z",
    "Lead-session: sess-0123456789",
    "Scratch: /tmp/scratch/sess/lane",
    "Workflow: wf_abc123 maxRounds=3",
    "Artifact: build/open@9999999999999999999999999999999999999999",
    "Evidence: docs/work/evidence/wr-open-L1.md, docs/work/evidence/wr-open-seam.md",
    "Worktree: build/open",
    "Log: 2026-10-01T10:00:00.000Z owned skills-f opened",
    "Log: 2026-10-01T12:00:00.000Z reviewed skills-f note",
    "",
    "Observed: pending.",
    "",
  ].join("\n");
  assert.equal(fs.readFileSync(recordAbsPath, "utf8"), expected);
});

test("lane 67 (d): inserting Artifact: and Evidence: keeps CRLF endings and a missing trailing newline", () => {
  const repo = mkTmp("accept-prep-repo-");
  const recordRel = "docs/work/wr-open2.record.md";
  const recordAbsPath = path.join(repo, recordRel);
  fs.mkdirSync(path.dirname(recordAbsPath), { recursive: true });
  fs.writeFileSync(recordAbsPath, ["Work: wr-x", "Status: owned", "Base: x"].join("\r\n"));
  editRecord({
    repo, recordPath: recordRel, deliveryRef: "b", artifactSha: "a".repeat(40),
    worktree: "b", owner: "o", logNote: "n", evidence: "none", now: "2026-10-01T12:00:00.000Z",
  });
  const updated = fs.readFileSync(recordAbsPath, "utf8");
  assert.equal(
    updated,
    ["Work: wr-x", "Status: reviewed", "Base: x", `Artifact: b@${"a".repeat(40)}`, "Evidence: none", "Worktree: b", "Log: 2026-10-01T12:00:00.000Z reviewed o n"].join("\r\n"),
  );
});

test("lane 67 (d): main() on a record with no Artifact:/Evidence: lines does not exit missing-field (it proceeds to the census step)", () => {
  const repo = mkTmp("accept-prep-repo-");
  const recordRel = "docs/work/wr-open3.record.md";
  const recordAbsPath = path.join(repo, recordRel);
  fs.mkdirSync(path.dirname(recordAbsPath), { recursive: true });
  fs.writeFileSync(recordAbsPath, "Work: wr-x\nStatus: owned\nOpened: 2026-10-01T10:00:00.000Z\n\nObserved: x.\n");
  const stderr = [];
  const io = { stdout: { write() {} }, stderr: { write: (c) => stderr.push(c) } };
  main([
    "--record", recordRel, "--repo", repo, "--plugin-root", path.join(repo, "no-plugin-root"), "--delivery-ref", "b",
    "--artifact-sha", "b".repeat(40), "--worktree", "b", "--owner", "o", "--log-note", "n", "--evidence", "none",
    "--lead", path.join(repo, "lead.jsonl"), "--census-out", "docs/work/evidence/c.md", "--json",
  ], io);
  assert.ok(!stderr.join("").includes("missing-field"), "a missing Artifact:/Evidence: line must not exit missing-field");
  assert.ok(/Artifact: b@/.test(fs.readFileSync(recordAbsPath, "utf8")));
});

// B1 (round 2 fix, review finding): a header-only record with NO trailing newline must
// never have its last unowned line glued onto the newly inserted line. Both edge cases
// the reviewer named: a record ending on its sixth Log line, and one ending at Base: with
// no Log lines at all.
test("B1: editRecord on a no-trailing-newline record ending in a Log line inserts a new line, never gluing it onto the last one", () => {
  const repo = mkTmp("accept-prep-repo-");
  const recordRel = "docs/work/wr-notrail.record.md";
  const recordAbsPath = path.join(repo, recordRel);
  fs.mkdirSync(path.dirname(recordAbsPath), { recursive: true });
  const text = [
    "Work: wr-x",
    "Status: owned",
    "Artifact: none",
    "Evidence: none",
    "Base: x",
    "Log: 2026-09-20T10:00:00.000Z owned o six",
  ].join("\n");
  fs.writeFileSync(recordAbsPath, text);
  editRecord({
    repo, recordPath: recordRel, deliveryRef: "b", artifactSha: "8".repeat(40),
    worktree: "b", owner: "o", logNote: "n", evidence: "none",
    now: "2026-09-20T11:00:00.000Z",
  });
  const updated = fs.readFileSync(recordAbsPath, "utf8");
  const expected = [
    "Work: wr-x",
    "Status: reviewed",
    "Artifact: b@8888888888888888888888888888888888888888",
    "Evidence: none",
    "Base: x",
    "Worktree: b",
    "Log: 2026-09-20T10:00:00.000Z owned o six",
    "Log: 2026-09-20T11:00:00.000Z reviewed o n",
  ].join("\n");
  assert.equal(updated, expected, "the unowned sixth Log line must survive untouched, on its own line, with no trailing newline added");
  assert.ok(!updated.endsWith("\n"), "no-trailing-newline property must be preserved");
});

test("B1: editRecord on a no-trailing-newline record with NO Log lines at all still inserts one cleanly", () => {
  const repo = mkTmp("accept-prep-repo-");
  const recordRel = "docs/work/wr-notrail2.record.md";
  const recordAbsPath = path.join(repo, recordRel);
  fs.mkdirSync(path.dirname(recordAbsPath), { recursive: true });
  const text = [
    "Work: wr-x",
    "Status: owned",
    "Artifact: none",
    "Evidence: none",
    "Base: x",
  ].join("\n");
  fs.writeFileSync(recordAbsPath, text);
  editRecord({
    repo, recordPath: recordRel, deliveryRef: "b", artifactSha: "9".repeat(40),
    worktree: "b", owner: "o", logNote: "n", evidence: "none",
    now: "2026-09-20T11:00:00.000Z",
  });
  const updated = fs.readFileSync(recordAbsPath, "utf8");
  const expected = [
    "Work: wr-x",
    "Status: reviewed",
    "Artifact: b@9999999999999999999999999999999999999999",
    "Evidence: none",
    "Base: x",
    "Worktree: b",
    "Log: 2026-09-20T11:00:00.000Z reviewed o n",
  ].join("\n");
  assert.equal(updated, expected, "Base: must survive untouched, on its own line");
  assert.ok(!updated.endsWith("\n"), "no-trailing-newline property must be preserved");
});

// m1 (round 2 fix, review finding): the loop script can render `--evidence none` (e.g. a
// startFrom APPROVE territory with no findingsPath and a skipped seam); "none" must never
// be appended as a literal evidence path.
test("m1: --evidence none is never appended as an evidence path, whether existing Evidence: is real paths or already 'none'", () => {
  const repo = mkTmp("accept-prep-repo-");
  const recordRel = "docs/work/wr-evnone.record.md";
  const recordAbsPath = path.join(repo, recordRel);
  fs.mkdirSync(path.dirname(recordAbsPath), { recursive: true });
  fs.writeFileSync(recordAbsPath, "Work: wr-x\nStatus: owned\nArtifact: none\nEvidence: docs/a.md\n\nObserved: x.\n");
  editRecord({
    repo, recordPath: recordRel, deliveryRef: "b", artifactSha: "a".repeat(40),
    worktree: "b", owner: "o", logNote: "n", evidence: "none",
    now: "2026-09-20T11:00:00.000Z",
  });
  assert.match(fs.readFileSync(recordAbsPath, "utf8"), /^Evidence: docs\/a\.md$/m, "existing evidence must stay untouched, with no ', none' appended");

  const repo2 = mkTmp("accept-prep-repo-");
  const recordRel2 = "docs/work/wr-evnone2.record.md";
  const recordAbsPath2 = path.join(repo2, recordRel2);
  fs.mkdirSync(path.dirname(recordAbsPath2), { recursive: true });
  fs.writeFileSync(recordAbsPath2, "Work: wr-x\nStatus: owned\nArtifact: none\nEvidence: none\n\nObserved: x.\n");
  editRecord({
    repo: repo2, recordPath: recordRel2, deliveryRef: "b", artifactSha: "a".repeat(40),
    worktree: "b", owner: "o", logNote: "n", evidence: "none",
    now: "2026-09-20T11:00:00.000Z",
  });
  assert.match(fs.readFileSync(recordAbsPath2, "utf8"), /^Evidence: none$/m, "'none' plus 'none' must stay 'none', never 'none, none'");
});

// -------------------------------------------------------------------------------------
// R3(b): ORDER — census must see the record's reviewed Log: line already written, and
// check-acceptance must run only after census. Fake --plugin-root stubs, per contracts.md
// R3(b) ("stub work-record/build-census scripts under a fake --plugin-root that log
// invocation order and read the record's mtime/contents").
// -------------------------------------------------------------------------------------

const CENSUS_STUB = `
import fs from "node:fs";
const text = fs.readFileSync(process.env.RECORD_ABS_PATH, "utf8");
const hasReviewedLog = /^Log: .* reviewed /m.test(text);
fs.appendFileSync(process.env.ORDER_LOG, \`census sawReviewedLog=\${hasReviewedLog}\\n\`);
process.exit(0);
`;

const CENSUS_FAIL_STUB = `
import fs from "node:fs";
fs.appendFileSync(process.env.ORDER_LOG, "census failing\\n");
process.stderr.write("stub census: deliberate failure\\n");
process.exit(3);
`;

const WORK_RECORD_STUB = `
import fs from "node:fs";
fs.appendFileSync(process.env.ORDER_LOG, \`check-acceptance argv=\${JSON.stringify(process.argv.slice(2))}\\n\`);
process.stdout.write(JSON.stringify({ ok: true, work: "wr-x", artifact: "abc", delivery: "abc" }) + "\\n");
process.exit(0);
`;

function makeFakePluginRoot(dir, censusStubSrc, workRecordStubSrc) {
  const pluginRoot = path.join(dir, "plugin");
  fs.mkdirSync(path.join(pluginRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, "scripts", "build-census.mjs"), censusStubSrc);
  fs.writeFileSync(path.join(pluginRoot, "scripts", "work-record.mjs"), workRecordStubSrc);
  return pluginRoot;
}

function baseCliArgs({ repo, recordRel, pluginRoot }) {
  return [
    SCRIPT,
    "--record", recordRel, "--repo", repo, "--plugin-root", pluginRoot,
    "--delivery-ref", "build/x", "--artifact-sha", "5".repeat(40),
    "--worktree", "build/x", "--owner", "tester", "--log-note", "note",
    "--evidence", "docs/notes/e.md", "--lead", "/fake/lead.jsonl",
    "--census-out", "docs/work/evidence/x-census.md", "--json",
  ];
}

test("R3b ORDER: census sees the reviewed Log: line already present, and check-acceptance runs strictly after census", () => {
  const tmp = mkTmp("accept-prep-order-");
  const { repo, recordRel, recordAbsPath } = makeRepoWithRecord(FIXTURE_NO_WORKTREE, "docs/work/wr-x.record.md");
  const pluginRoot = makeFakePluginRoot(tmp, CENSUS_STUB, WORK_RECORD_STUB);
  const orderLog = path.join(tmp, "order.log");
  fs.writeFileSync(orderLog, "");

  const env = childEnv(tmp, { ORDER_LOG: orderLog, RECORD_ABS_PATH: recordAbsPath });
  const result = spawnSync(process.execPath, baseCliArgs({ repo, recordRel, pluginRoot }), { encoding: "utf8", env });

  assert.equal(result.status, 0, `stderr: ${result.stderr}\nstdout: ${result.stdout}`);
  const orderLines = fs.readFileSync(orderLog, "utf8").trim().split("\n");
  assert.equal(orderLines.length, 2, `expected exactly 2 order-log lines, got: ${JSON.stringify(orderLines)}`);
  assert.equal(orderLines[0], "census sawReviewedLog=true", "census stub must see the reviewed Log: line already written");
  assert.match(orderLines[1], /^check-acceptance argv=/, "check-acceptance must run after census");
  assert.ok(orderLines[1].includes("check-acceptance"), "work-record.mjs must be invoked with check-acceptance");
});

// The negative half of R3(b) ("a variant where the helper is patched to call census first
// must fail that test") is demonstrated, not committed here as a permanently-broken test —
// see the F1 report for the actual run of a reordered copy of accept-prep.mjs against this
// exact scenario, which fails with sawReviewedLog=false.

// -------------------------------------------------------------------------------------
// R3(c): a census failure leaves the record edit in place; censusPath: null, censusError
// set, check-acceptance never runs.
// -------------------------------------------------------------------------------------

test("R3c: a failing census leaves the record's edit in place, reports censusPath null + censusError, and never runs check-acceptance", () => {
  const tmp = mkTmp("accept-prep-censusfail-");
  const { repo, recordRel, recordAbsPath } = makeRepoWithRecord(FIXTURE_NO_WORKTREE, "docs/work/wr-x.record.md");
  const pluginRoot = makeFakePluginRoot(tmp, CENSUS_FAIL_STUB, WORK_RECORD_STUB);
  const orderLog = path.join(tmp, "order.log");
  fs.writeFileSync(orderLog, "");

  const env = childEnv(tmp, { ORDER_LOG: orderLog, RECORD_ABS_PATH: recordAbsPath });
  const result = spawnSync(process.execPath, baseCliArgs({ repo, recordRel, pluginRoot }), { encoding: "utf8", env });

  assert.notEqual(result.status, 0, "accept-prep must exit non-zero when census fails");
  const printed = JSON.parse(result.stdout.trim().split("\n").pop());
  assert.deepEqual(printed.recordChanged, ["Status", "Artifact", "Evidence", "Worktree", "Log"]);
  assert.equal(printed.censusPath, null);
  assert.match(printed.censusError, /exited 3/);
  assert.equal(printed.checkAcceptance, null, "check-acceptance must never run after a census failure");

  const orderLines = fs.readFileSync(orderLog, "utf8").trim().split("\n").filter(Boolean);
  assert.deepEqual(orderLines, ["census failing"], "work-record.mjs (check-acceptance) must never be invoked");

  const updated = fs.readFileSync(recordAbsPath, "utf8");
  assert.match(updated, /^Status: reviewed$/m, "the record edit from step 1 must remain in place despite the census failure");
});

// m2 (round 2 fix, review finding): accept-prep must create the census-out directory
// itself when it does not already exist (the runner's own copy step only creates
// evidence directories, and copies nothing when there are no deciding items).
test("m2: runCensus creates the --census-out directory when it does not already exist", () => {
  const tmp = mkTmp("accept-prep-mkdir-");
  const { repo, recordRel, recordAbsPath } = makeRepoWithRecord(FIXTURE_NO_WORKTREE, "docs/work/wr-x.record.md");
  const pluginRoot = makeFakePluginRoot(tmp, CENSUS_STUB, WORK_RECORD_STUB);
  const orderLog = path.join(tmp, "order.log");
  fs.writeFileSync(orderLog, "");
  assert.ok(!fs.existsSync(path.join(repo, "docs/work/evidence")), "the evidence dir must not pre-exist for this test to be meaningful");

  const env = childEnv(tmp, { ORDER_LOG: orderLog, RECORD_ABS_PATH: recordAbsPath });
  const result = spawnSync(process.execPath, baseCliArgs({ repo, recordRel, pluginRoot }), { encoding: "utf8", env });

  assert.equal(result.status, 0, `stderr: ${result.stderr}\nstdout: ${result.stdout}`);
  assert.ok(fs.existsSync(path.join(repo, "docs/work/evidence")), "runCensus must create the missing directory before spawning build-census.mjs");
});

// -------------------------------------------------------------------------------------
// R3(d): accept-prep never writes Status: accepted, and never invokes `accept`.
// -------------------------------------------------------------------------------------

test("R3d: a full successful run never writes Status: accepted and never invokes the accept subcommand", () => {
  const tmp = mkTmp("accept-prep-neveraccept-");
  const { repo, recordRel, recordAbsPath } = makeRepoWithRecord(FIXTURE_WITH_WORKTREE, "docs/work/wr-x.record.md");
  const pluginRoot = makeFakePluginRoot(tmp, CENSUS_STUB, WORK_RECORD_STUB);
  const orderLog = path.join(tmp, "order.log");
  fs.writeFileSync(orderLog, "");

  const env = childEnv(tmp, { ORDER_LOG: orderLog, RECORD_ABS_PATH: recordAbsPath });
  const result = spawnSync(process.execPath, baseCliArgs({ repo, recordRel, pluginRoot }), { encoding: "utf8", env });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const updated = fs.readFileSync(recordAbsPath, "utf8");
  assert.match(updated, /^Status: reviewed$/m);
  assert.ok(!/^Status: accepted$/m.test(updated), "accept-prep must never write Status: accepted");
  assert.ok(!/\baccepted\b/i.test(updated.match(/^Log:.*$/gm).join("\n")), "no Log line may claim accepted");

  const orderLines = fs.readFileSync(orderLog, "utf8").trim().split("\n");
  for (const line of orderLines) {
    if (line.startsWith("check-acceptance")) {
      assert.ok(line.includes('"check-acceptance"'), `work-record.mjs must only ever be called with check-acceptance: ${line}`);
      assert.ok(!line.includes('"accept"'), `accept-prep must never pass the accept subcommand: ${line}`);
    }
  }
});

// -------------------------------------------------------------------------------------
// CLI argument validation
// -------------------------------------------------------------------------------------

test("parseArgs: rejects a non-40-hex --artifact-sha", () => {
  assert.throws(
    () => parseArgs([
      "--record", "r.md", "--repo", "/repo", "--plugin-root", "/plugin",
      "--delivery-ref", "b", "--artifact-sha", "abc123", "--worktree", "b",
      "--owner", "o", "--log-note", "n", "--evidence", "e", "--lead", "l",
      "--census-out", "c.md",
    ]),
    /--artifact-sha/,
  );
});

test("parseArgs: rejects both --from and --marker together", () => {
  assert.throws(
    () => parseArgs([
      "--record", "r.md", "--repo", "/repo", "--plugin-root", "/plugin",
      "--delivery-ref", "b", "--artifact-sha", "5".repeat(40), "--worktree", "b",
      "--owner", "o", "--log-note", "n", "--evidence", "e", "--lead", "l",
      "--from", "2026-09-20T00:00:00Z", "--marker", "m", "--census-out", "c.md",
    ]),
    /only one of --from or --marker/,
  );
});

test("parseArgs: reports the missing flag name for a missing required option", () => {
  assert.throws(() => parseArgs(["--record", "r.md"]), /missing required option: --repo/);
});

// -------------------------------------------------------------------------------------
// splitPreservingEol / joinPreservingEol round-trip (the primitive editRecord relies on).
// -------------------------------------------------------------------------------------

test("splitPreservingEol/joinPreservingEol: round-trips arbitrary mixed line endings byte-for-byte", () => {
  const text = "a\r\nb\nc\r\nd";
  assert.equal(joinPreservingEol(splitPreservingEol(text)), text);
  const withTrailing = "a\nb\n";
  assert.equal(joinPreservingEol(splitPreservingEol(withTrailing)), withTrailing);
});

test("formatLogLine: matches scripts/work-record.mjs's own format (no trailing space when note is empty)", () => {
  assert.equal(formatLogLine("2026-01-01T00:00:00Z", "reviewed", "o", ""), "Log: 2026-01-01T00:00:00Z reviewed o");
  assert.equal(formatLogLine("2026-01-01T00:00:00Z", "reviewed", "o", "hi"), "Log: 2026-01-01T00:00:00Z reviewed o hi");
});

test("main: exits 1 and writes nothing to stdout on a bad-args failure", () => {
  const io = { stdout: { write: () => {} }, stderr: { chunks: [], write(s) { this.chunks.push(s); } } };
  const code = main(["--record", "r.md"], io);
  assert.equal(code, 1);
  assert.match(io.stderr.chunks.join(""), /missing required option/);
});

// -------------------------------------------------------------------------------------
// lane 73 (F1): the record's Workflow: line carries `maxRounds=<n>`, the round bound used.
// -------------------------------------------------------------------------------------

function makeWorkflowRecord(workflowLine) {
  const repo = mkTmp("accept-prep-repo-");
  const recordRel = "docs/work/wr-x.record.md";
  const recordAbsPath = path.join(repo, recordRel);
  fs.mkdirSync(path.dirname(recordAbsPath), { recursive: true });
  const text = fs.readFileSync(FIXTURE_NO_WORKTREE, "utf8").replace("Base: ", `${workflowLine}Base: `);
  fs.writeFileSync(recordAbsPath, text);
  return { repo, recordRel, recordAbsPath };
}

function editOpts(repo, recordRel, extra = {}) {
  return {
    repo, recordPath: recordRel,
    deliveryRef: "build/fixture-int", artifactSha: "2".repeat(40),
    worktree: "build/fixture-int", owner: "skills-n", logNote: "seam SKIPPED",
    evidence: "docs/work/evidence/fixture-seam.md", now: "2026-10-02T04:00:00.000Z",
    ...extra,
  };
}

test("F1: a record naming a run gets `<run id> maxRounds=<n>` with the value used", () => {
  const { repo, recordRel, recordAbsPath } = makeWorkflowRecord("Workflow: wf_abc-123\n");
  const changed = editRecord(editOpts(repo, recordRel, { maxRounds: "5" }));
  assert.ok(changed.includes("Workflow"));
  const updated = fs.readFileSync(recordAbsPath, "utf8");
  assert.match(updated, /^Workflow: wf_abc-123 maxRounds=5$/m);
  assert.equal((updated.match(/^Workflow:/gm) ?? []).length, 1);
});

test("F1: maxRounds omitted writes the default 3", () => {
  const { repo, recordRel, recordAbsPath } = makeWorkflowRecord("Workflow: wf_abc-123\n");
  editRecord(editOpts(repo, recordRel));
  assert.match(fs.readFileSync(recordAbsPath, "utf8"), /^Workflow: wf_abc-123 maxRounds=3$/m);
});

test("F1: a second accept-prep replaces the bound rather than appending another", () => {
  const { repo, recordRel, recordAbsPath } = makeWorkflowRecord("Workflow: wf_abc-123 maxRounds=3\n");
  editRecord(editOpts(repo, recordRel, { maxRounds: 4 }));
  assert.match(fs.readFileSync(recordAbsPath, "utf8"), /^Workflow: wf_abc-123 maxRounds=4$/m);
});

test("F1: `Workflow: none, <reason>` and a record with no Workflow line are left alone; --workflow inserts one", () => {
  const none = makeWorkflowRecord("Workflow: none, Codex-led: no Workflow tool\n");
  assert.ok(!editRecord(editOpts(none.repo, none.recordRel, { maxRounds: "5" })).includes("Workflow"));
  assert.match(fs.readFileSync(none.recordAbsPath, "utf8"), /^Workflow: none, Codex-led: no Workflow tool$/m);

  const absent = makeRepoWithRecord(FIXTURE_NO_WORKTREE);
  assert.ok(!editRecord(editOpts(absent.repo, absent.recordRel)).includes("Workflow"));
  assert.ok(!/^Workflow:/m.test(fs.readFileSync(absent.recordAbsPath, "utf8")));

  const given = makeRepoWithRecord(FIXTURE_NO_WORKTREE);
  assert.ok(editRecord(editOpts(given.repo, given.recordRel, { workflow: "wf_given", maxRounds: "2" })).includes("Workflow"));
  assert.match(fs.readFileSync(given.recordAbsPath, "utf8"), /^Workflow: wf_given maxRounds=2$/m);
});

test("F1: parseArgs takes --max-rounds and --workflow, and refuses a non-integer bound or a `none` run id", () => {
  const base = [
    "--record", "r.md", "--repo", "/x", "--plugin-root", "/p", "--delivery-ref", "b", "--artifact-sha", "a".repeat(40),
    "--worktree", "b", "--owner", "o", "--log-note", "n", "--evidence", "none", "--lead", "/l.jsonl", "--census-out", "c.md",
  ];
  const ok = parseArgs([...base, "--max-rounds", "4", "--workflow", "wf_1"]);
  assert.equal(ok.maxRounds, "4");
  assert.equal(ok.workflow, "wf_1");
  assert.throws(() => parseArgs([...base, "--max-rounds", "three"]), (e) => e.code === "bad-args");
  assert.throws(() => parseArgs([...base, "--workflow", "none"]), (e) => e.code === "bad-args");
});
