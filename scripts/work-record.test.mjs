import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { STATUSES, FINDING_CODES, parseRecord, validateRecord, listRecords, formatLogLine } from "./work-record.mjs";

function codes(findings) {
  return findings.map((f) => f.code);
}

function mkRecordText(overrides = {}, extraLines = [], body = "Prose body.") {
  const defaults = {
    Work: "wr-2026-09-21-full-example",
    Scope: "docs/mandate-template.md@abc1234",
    Owner: "t1",
    Status: "owned",
    Authority: "may edit scripts/work-record.mjs; may not merge to main",
    Artifact: "none",
    Evidence: "none",
    Next: "implement validateRecord",
    Opened: "2026-09-21T09:00:00Z",
  };
  const merged = { ...defaults, ...overrides };
  const lines = Object.entries(merged)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`);
  lines.push(...extraLines);
  return [...lines, "", body].join("\n");
}

const EXAMPLE = [
  "Work: wr-2026-09-21-test-record",
  "Scope: docs/work/spec.md@abc1234",
  "Owner: t1",
  "Status: delivered",
  "Authority: may edit scripts/work-record.mjs; may not merge to main",
  "Artifact: integrate/next-build@0eda176",
  "Evidence: docs/work/evidence/wr-1.md, docs/work/evidence/wr-2.md",
  "Next: reviewer verdict",
  "Opened: 2026-09-21T10:00:00Z",
  "Children: wr-2026-09-21-child",
  "WORKAROUND: flaky network / ci runner / by 2026-10-01",
  "WORKAROUND: missing fixture / test-home not merged / when T7 lands",
  "Log: 2026-09-21T10:00:00Z owned t1",
  "Log: 2026-09-21T11:00:00Z delivered t1 artifact abc1234",
  "Log: 2026-09-21T12:00:00Z rejected reviewer review-rejected",
  "",
  "Prose body describing the work in more detail.",
].join("\n");

test("parseRecord parses a complete example record", () => {
  const r = parseRecord(EXAMPLE);
  assert.equal(r.fields.work, "wr-2026-09-21-test-record");
  assert.equal(r.fields.scope, "docs/work/spec.md@abc1234");
  assert.equal(r.fields.owner, "t1");
  assert.equal(r.fields.status, "delivered");
  assert.equal(r.fields.authority, "may edit scripts/work-record.mjs; may not merge to main");
  assert.equal(r.fields.artifact, "integrate/next-build@0eda176");
  assert.deepEqual(r.fields.evidence, ["docs/work/evidence/wr-1.md", "docs/work/evidence/wr-2.md"]);
  assert.equal(r.fields.next, "reviewer verdict");
  assert.equal(r.fields.opened, "2026-09-21T10:00:00Z");
  assert.deepEqual(r.fields.children, ["wr-2026-09-21-child"]);
  assert.equal(r.workarounds.length, 2);
  assert.deepEqual(r.workarounds[0], { cause: "flaky network", blockedBy: "ci runner", removeWhen: "by 2026-10-01" });
  assert.equal(r.log.length, 3);
  assert.deepEqual(r.log[1], { at: "2026-09-21T11:00:00Z", status: "delivered", owner: "t1", note: "artifact abc1234" });
  assert.equal(r.log[0].note, "");
  assert.deepEqual(r.errors, []);
});

test("parseRecord trims \\r from CRLF input", () => {
  const crlf = "Work: wr-x\r\nOwner: t1  \r\nStatus: owned\r\n\r\nbody\r\n";
  const r = parseRecord(crlf);
  assert.equal(r.fields.work, "wr-x");
  assert.equal(r.fields.owner, "t1");
  assert.equal(r.fields.status, "owned");
  assert.ok(!r.fields.owner.includes("\r"));
});

test("'none' evidence parses to an empty array", () => {
  const r = parseRecord("Work: wr-x\nEvidence: none\n\nbody");
  assert.deepEqual(r.fields.evidence, []);
});

test("an unknown header label is collected in errors", () => {
  const r = parseRecord("Work: wr-x\nFoo: bar\n\nbody");
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /Foo/);
});

test("listRecords reads only *.record.md files in a directory, sorted", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-"));
  fs.writeFileSync(path.join(dir, "b.record.md"), "Work: wr-b\n\nbody");
  fs.writeFileSync(path.join(dir, "a.record.md"), "Work: wr-a\n\nbody");
  fs.writeFileSync(path.join(dir, "notes.md"), "not a record");
  const results = listRecords(dir);
  assert.equal(results.length, 2);
  assert.ok(results[0].path.endsWith("a.record.md"));
  assert.ok(results[1].path.endsWith("b.record.md"));
  assert.equal(results[0].record.fields.work, "wr-a");
});

test("listRecords returns [] for a missing directory", () => {
  const dir = path.join(os.tmpdir(), "work-record-does-not-exist-xyz");
  assert.deepEqual(listRecords(dir), []);
});

test("formatLogLine with and without a note", () => {
  assert.equal(formatLogLine("2026-09-21T10:00:00Z", "owned", "t1", "artifact abc1234"), "Log: 2026-09-21T10:00:00Z owned t1 artifact abc1234");
  assert.equal(formatLogLine("2026-09-21T10:00:00Z", "owned", "t1", ""), "Log: 2026-09-21T10:00:00Z owned t1");
});

test("STATUSES includes rejected and has seven values", () => {
  assert.equal(STATUSES.length, 7);
  assert.ok(STATUSES.includes("rejected"));
});

test("formatLogLine omits the trailing space and never emits the word undefined when note is absent (A4)", () => {
  assert.equal(formatLogLine("2026-09-21T10:00:00Z", "owned", "t1"), "Log: 2026-09-21T10:00:00Z owned t1");
  assert.equal(formatLogLine("2026-09-21T10:00:00Z", "owned", "t1", undefined), "Log: 2026-09-21T10:00:00Z owned t1");
  for (const call of [
    formatLogLine("2026-09-21T10:00:00Z", "owned", "t1"),
    formatLogLine("2026-09-21T10:00:00Z", "owned", "t1", undefined),
    formatLogLine("2026-09-21T10:00:00Z", "owned", "t1", ""),
  ]) {
    assert.ok(!call.includes("undefined"), `formatLogLine emitted "undefined": ${call}`);
    assert.ok(!call.endsWith(" "), `formatLogLine left a trailing space: "${call}"`);
  }
});

// --- validateRecord ---------------------------------------------------------------

test("validateRecord: a clean record with no repoRoot given produces zero findings", () => {
  const r = parseRecord(mkRecordText());
  assert.deepEqual(validateRecord(r), []);
});

test("validateRecord: every code in FINDING_CODES is reachable by at least one test in this file", () => {
  // Documents the full set this suite must cover; the individual tests below assert each one fires.
  assert.deepEqual(
    [...FINDING_CODES].sort(),
    [
      "accepted-without-artifact",
      "accepted-without-evidence",
      "bad-status",
      "bad-work-id",
      "bugfix-gate-missing",
      "evidence-missing",
      "evidence-no-verdict",
      "evidence-unreachable",
      "missing-field",
      "scope-drift",
      "stale-result-candidate",
      "workaround-overdue",
    ].sort(),
  );
});

test("validateRecord: missing-field fires once per absent required field", () => {
  const r = parseRecord("Work: wr-2026-09-21-x\nOwner: t1\n\nbody");
  const findings = validateRecord(r);
  const missing = findings.filter((f) => f.code === "missing-field").map((f) => f.message);
  for (const field of ["scope", "status", "authority", "artifact", "evidence", "next", "opened"]) {
    assert.ok(missing.some((m) => m.includes(field)), `expected a missing-field finding naming "${field}"`);
  }
  assert.ok(findings.every((f) => f.level === "finding"));
});

test("validateRecord: bad-status fires on a status outside STATUSES", () => {
  const r = parseRecord(mkRecordText({ Status: "in-progress" }));
  const findings = validateRecord(r);
  assert.ok(codes(findings).includes("bad-status"));
});

test("validateRecord: bad-work-id fires on an uppercase or malformed Work id", () => {
  const r = parseRecord(mkRecordText({ Work: "WR-2026-09-21-Bad" }));
  assert.ok(codes(validateRecord(r)).includes("bad-work-id"));
  const good = parseRecord(mkRecordText({ Work: "wr-2026-09-21-good-slug" }));
  assert.ok(!codes(validateRecord(good)).includes("bad-work-id"));
});

test("validateRecord: accepted-without-artifact fires when Status: accepted and Artifact: none", () => {
  const r = parseRecord(mkRecordText({ Status: "accepted", Artifact: "none", Evidence: "docs/work-record.md" }));
  assert.ok(codes(validateRecord(r, { repoRoot: process.cwd() })).includes("accepted-without-artifact"));
});

test("validateRecord: without repoRoot, every evidence-path check is skipped (A4)", () => {
  const r = parseRecord(mkRecordText({ Evidence: "docs/does-not-exist-anywhere.md" }));
  const findings = validateRecord(r);
  assert.ok(!codes(findings).includes("evidence-missing"));
  assert.ok(!codes(findings).includes("evidence-unreachable"));
});

test("validateRecord: evidence-missing fires for an in-repo path that does not exist", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-evidence-"));
  const r = parseRecord(mkRecordText({ Evidence: "reports/missing.md" }));
  const findings = validateRecord(r, { repoRoot: dir });
  assert.ok(codes(findings).includes("evidence-missing"));
});

test("validateRecord: evidence-no-verdict fires when the file's first line does not start VERDICT:", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-evidence-"));
  fs.mkdirSync(path.join(dir, "reports"));
  fs.writeFileSync(path.join(dir, "reports", "r1.md"), "not a verdict line\nmore text\n");
  const r = parseRecord(mkRecordText({ Evidence: "reports/r1.md" }));
  const findings = validateRecord(r, { repoRoot: dir });
  assert.ok(codes(findings).includes("evidence-no-verdict"));
});

test("validateRecord: a well-formed in-repo evidence file with a VERDICT: first line has no evidence findings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-evidence-"));
  fs.mkdirSync(path.join(dir, "reports"));
  fs.writeFileSync(path.join(dir, "reports", "r1.md"), "VERDICT: PASS\nmore text\n");
  const r = parseRecord(mkRecordText({ Evidence: "reports/r1.md" }));
  const findings = validateRecord(r, { repoRoot: dir });
  assert.ok(!codes(findings).includes("evidence-missing"));
  assert.ok(!codes(findings).includes("evidence-no-verdict"));
});

test("validateRecord: evidence-unreachable is an info row, never a finding, for a path outside repoRoot", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-evidence-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-outside-"));
  fs.writeFileSync(path.join(outside, "ext.md"), "VERDICT: PASS\n");
  const r = parseRecord(mkRecordText({ Evidence: `${outside.split(path.sep).join("/")}/ext.md` }));
  const findings = validateRecord(r, { repoRoot: dir });
  const unreachable = findings.filter((f) => f.code === "evidence-unreachable");
  assert.equal(unreachable.length, 1);
  assert.equal(unreachable[0].level, "info");
});

// Named failure case 1 (T1 brief): "old worker finishes after replacement" ->
// stale-result-candidate. Owner t1 delivers an artifact; ownership then changes to t2
// AFTER that artifact note, so the recorded evidence is a candidate from the old owner.
test("validateRecord: old worker finishes after replacement -> stale-result-candidate", () => {
  const r = parseRecord(
    mkRecordText(
      { Status: "delivered", Artifact: "integrate/next-build@abc1111", Evidence: "none" },
      [
        "Log: 2026-09-21T09:00:00Z owned t1",
        "Log: 2026-09-21T10:00:00Z delivered t1 artifact abc1111",
        "Log: 2026-09-21T11:00:00Z owned t2 agent-exited",
      ],
    ),
  );
  const findings = validateRecord(r);
  assert.ok(codes(findings).includes("stale-result-candidate"));
});

test("validateRecord: stale-result-candidate does not fire when no artifact note exists yet", () => {
  const r = parseRecord(
    mkRecordText({ Status: "owned" }, ["Log: 2026-09-21T09:00:00Z owned t1", "Log: 2026-09-21T11:00:00Z owned t2 agent-exited"]),
  );
  assert.ok(!codes(validateRecord(r)).includes("stale-result-candidate"));
});

test("validateRecord: stale-result-candidate does not fire when Artifact: is none", () => {
  const r = parseRecord(
    mkRecordText(
      { Status: "owned", Artifact: "none" },
      [
        "Log: 2026-09-21T09:00:00Z owned t1",
        "Log: 2026-09-21T10:00:00Z delivered t1 artifact abc1111",
        "Log: 2026-09-21T11:00:00Z owned t2 agent-exited",
      ],
    ),
  );
  assert.ok(!codes(validateRecord(r)).includes("stale-result-candidate"));
});

// Named failure case 2 (T1 brief): "effect landed but result lost" -> Artifact: is set,
// Evidence: none, and `accepted` is refused (accepted-without-evidence).
test("validateRecord: effect landed but result lost -> accepted is refused (accepted-without-evidence)", () => {
  const r = parseRecord(mkRecordText({ Status: "accepted", Artifact: "integrate/next-build@abc1111", Evidence: "none" }));
  const findings = validateRecord(r, { repoRoot: process.cwd() });
  assert.ok(codes(findings).includes("accepted-without-evidence"));
  assert.ok(!codes(findings).includes("accepted-without-artifact"));
});

// Named failure case 3 (T1 brief): "fresh worker on an obsolete fact" -> scope-drift, on a
// fixture repo (built under os.tmpdir() per addendum A3) where the scope file has a newer
// commit than the sha recorded in Scope:.
test("validateRecord: fresh worker on an obsolete fact -> scope-drift on a fixture repo", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-scope-"));
  const run = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  run(["init", "-q"]);
  fs.writeFileSync(path.join(repo, "target.txt"), "v1\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "v1"]);
  const shaV1 = run(["rev-parse", "HEAD"]).trim();
  fs.writeFileSync(path.join(repo, "target.txt"), "v2\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "v2"]);
  const shaV2 = run(["rev-parse", "HEAD"]).trim();

  const stale = parseRecord(mkRecordText({ Scope: `target.txt@${shaV1}` }));
  const staleFindings = validateRecord(stale, { gitDir: repo, ref: "HEAD" });
  assert.ok(codes(staleFindings).includes("scope-drift"));

  const fresh = parseRecord(mkRecordText({ Scope: `target.txt@${shaV2}` }));
  const freshFindings = validateRecord(fresh, { gitDir: repo, ref: "HEAD" });
  assert.ok(!codes(freshFindings).includes("scope-drift"));
});

test("validateRecord: scope-drift is not attempted without both gitDir and ref", () => {
  const r = parseRecord(mkRecordText({ Scope: "docs/mandate-template.md@0000000" }));
  assert.ok(!codes(validateRecord(r)).includes("scope-drift"));
  assert.ok(!codes(validateRecord(r, { gitDir: process.cwd() })).includes("scope-drift"));
});

test("validateRecord: workaround-overdue fires for a past 'by <date>' removeWhen, in any status", () => {
  const r = parseRecord(mkRecordText({}, ["WORKAROUND: flaky ci / network blip / by 2020-01-01"]));
  const findings = validateRecord(r, { now: new Date("2026-09-21T00:00:00Z") });
  assert.ok(codes(findings).includes("workaround-overdue"));
});

test("validateRecord: workaround-overdue does not fire for a future date or a worded condition", () => {
  const future = parseRecord(mkRecordText({}, ["WORKAROUND: flaky ci / network blip / by 2099-01-01"]));
  assert.ok(!codes(validateRecord(future, { now: new Date("2026-09-21T00:00:00Z") })).includes("workaround-overdue"));
  const worded = parseRecord(mkRecordText({}, ["WORKAROUND: flaky ci / network blip / when T7 lands"]));
  assert.ok(!codes(validateRecord(worded, { now: new Date("2026-09-21T00:00:00Z") })).includes("workaround-overdue"));
});

test("validateRecord: bugfix-gate-missing fires when Class: is set, Status: accepted, and no evidence path's basename contains prefix-test", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-evidence-"));
  fs.mkdirSync(path.join(dir, "reports"));
  fs.writeFileSync(path.join(dir, "reports", "review.md"), "VERDICT: APPROVE\n");
  const r = parseRecord(
    mkRecordText(
      { Status: "accepted", Artifact: "integrate/next-build@abc1111", Evidence: "reports/review.md" },
      ["Class: stale-git-precedence"],
    ),
  );
  const findings = validateRecord(r, { repoRoot: dir });
  assert.ok(codes(findings).includes("bugfix-gate-missing"));
});

test("validateRecord: bugfix-gate-missing does not fire once an evidence path's basename contains prefix-test", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-evidence-"));
  fs.mkdirSync(path.join(dir, "reports"));
  fs.writeFileSync(path.join(dir, "reports", "review.md"), "VERDICT: APPROVE\n");
  fs.writeFileSync(path.join(dir, "reports", "prefix-test-run.md"), "VERDICT: PASS\n");
  const r = parseRecord(
    mkRecordText(
      {
        Status: "accepted",
        Artifact: "integrate/next-build@abc1111",
        Evidence: "reports/review.md, reports/prefix-test-run.md",
      },
      ["Class: stale-git-precedence"],
    ),
  );
  const findings = validateRecord(r, { repoRoot: dir });
  assert.ok(!codes(findings).includes("bugfix-gate-missing"));
});
