import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STATUSES, parseRecord, listRecords, formatLogLine } from "./work-record.mjs";

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
