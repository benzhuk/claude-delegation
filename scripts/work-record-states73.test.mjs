// node --test scripts/work-record-states73.test.mjs
// Lane 73 item 2: the lane-record Status words and the Now / To finish / Est header line.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATUSES, FINDING_CODES, GATE_STATUS_WORDS, LANE_STATUS_WORDS, PROGRESS_LINE_FROM, isLaneStatusWord, isKnownStatus,
  checkProgressLine, parseRecord, validateRecord, listRecords, checkAcceptance, checkMergeReady,
} from "./work-record.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const NOW_LINE = "Now: build merged, suites pending | To finish: run suites, accept, merge | Est: 3 hours";

function record(overrides = {}, extra = []) {
  const base = {
    Work: "wr-2026-10-03-states-fixture",
    Scope: "docs/spec.md@abc1234",
    Owner: "lead",
    Status: "open",
    Authority: "may edit fixtures only",
    Artifact: "territory/a@abc1234",
    Evidence: "docs/work/evidence/review.md",
    Next: "run the suites",
    Opened: "2026-10-03T12:00:00Z",
    "Lead-session": "fixture-lead-session-1",
  };
  const merged = { ...base, ...overrides };
  const lines = Object.entries(merged).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`);
  return [...lines, ...extra, "", "Prose body."].join("\n");
}

function findingsFor(text, opts) {
  return validateRecord(parseRecord(text), opts);
}

function accept(text) {
  const dir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "states73-"));
  fs.mkdirSync(path.join(dir, "docs", "work"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs", "work", "x.record.md"), text);
  return () => checkAcceptance({ repoRoot: dir, recordPath: "docs/work/x.record.md", pinnedArtifact: "abc1234" });
}

test("status words: the lane set is open, NEEDS BEN, NEEDS <peer>, FAILED, accepted, closed", () => {
  assert.deepEqual(LANE_STATUS_WORDS, ["open", "NEEDS BEN", "NEEDS <peer slug>", "FAILED", "accepted", "closed"]);
  for (const ok of ["open", "NEEDS BEN", "NEEDS skills-o", "FAILED", "accepted", "closed"]) assert.equal(isLaneStatusWord(ok), true, ok);
  for (const bad of ["PARTIAL", "NEEDS", "NEEDS Ben", "NEEDS ben ", "needs BEN", "open ", "reviewed", "owned"]) assert.equal(isLaneStatusWord(bad), false, bad);
});

test("status words: old words stay readable and the new words are not bad-status", () => {
  assert.equal(STATUSES.length, 9);
  assert.equal(FINDING_CODES.length, 17);
  assert.equal(isKnownStatus("owned"), true);
  for (const status of ["open", "NEEDS BEN", "NEEDS skills-o", "FAILED", "owned", "withdrawn"]) {
    const codes = findingsFor(record({ Status: status, Opened: "2026-09-21T09:00:00Z" })).map((f) => f.code);
    assert.ok(!codes.includes("bad-status"), `${status}: ${codes}`);
  }
  for (const status of ["PARTIAL", "NEEDS Ben", "done"]) {
    assert.ok(findingsFor(record({ Status: status })).some((f) => f.code === "bad-status"), status);
  }
});

test("Now line: parsed as the progress field, same shape as a report line 2", () => {
  const parsed = parseRecord(record({}, [NOW_LINE]));
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.fields.progress, "build merged, suites pending | To finish: run suites, accept, merge | Est: 3 hours");
});

test("Now line: a record opened on/after the cutoff without it is a missing-field finding naming Now:", () => {
  const f = findingsFor(record({ Opened: PROGRESS_LINE_FROM }));
  assert.ok(f.some((x) => x.code === "missing-field" && /Now:/.test(x.message)));
  assert.ok(!findingsFor(record({ Opened: PROGRESS_LINE_FROM }, [NOW_LINE])).some((x) => /Now:/.test(x.message)));
  for (const status of ["NEEDS BEN", "NEEDS skills-o", "FAILED", "reviewed"]) {
    assert.ok(findingsFor(record({ Opened: PROGRESS_LINE_FROM, Status: status })).some((x) => /Now:/.test(x.message)), status);
  }
});

test("Now line: grandfathered before the cutoff, and not required on accepted, closed or withdrawn", () => {
  assert.ok(!findingsFor(record({ Opened: "2026-10-02T03:59:59Z" })).some((x) => /Now:/.test(x.message)));
  for (const status of ["accepted", "closed", "withdrawn"]) {
    assert.ok(!findingsFor(record({ Opened: "2026-10-05T00:00:00Z", Status: status })).some((x) => /Now:/.test(x.message)), status);
  }
});

test("Now line: a present but malformed line is a finding at any date", () => {
  for (const bad of ["Now: x | To finish: y", "Now: x | Est: 1 day | To finish: y", "Now: x | To finish: | Est: 1 day"]) {
    const f = findingsFor(record({ Opened: "2026-09-21T09:00:00Z" }, [bad]));
    assert.ok(f.some((x) => x.code === "missing-field" && /malformed Now:/.test(x.message)), bad);
  }
  assert.equal(checkProgressLine(parseRecord(record({}, [NOW_LINE]))), null);
});

test("accept: refuses a Status word outside the allowed set, naming the set (code status-word-refused)", () => {
  for (const status of ["PARTIAL", "NEEDS Ben", "done"]) {
    assert.throws(accept(record({ Status: status })), (e) => e.code === "status-word-refused" && /outside open, NEEDS BEN, NEEDS <peer slug>, FAILED, accepted, closed, reviewed/.test(e.message), status);
  }
  assert.deepEqual(GATE_STATUS_WORDS.slice(-1), ["reviewed"]);
});

test("accept: an allowed word that is not reviewed is still refused as not reviewed", () => {
  for (const status of ["open", "NEEDS BEN", "FAILED", "accepted", "closed"]) {
    assert.throws(accept(record({ Status: status })), (e) => e.code !== "status-word-refused" && /Status must be reviewed/.test(e.message), status);
  }
});

test("accept: a reviewed record opened on/after the cutoff without a Now line is refused (progress-line-missing); with one it is not", () => {
  assert.throws(accept(record({ Status: "reviewed" })), (e) => e.code === "progress-line-missing" && /Now:/.test(e.message));
  assert.throws(accept(record({ Status: "reviewed" }, [NOW_LINE])), (e) => e.code !== "progress-line-missing" && e.code !== "status-word-refused");
  assert.throws(accept(record({ Status: "reviewed", Opened: "2026-09-23T12:00:00Z" })), (e) => e.code !== "progress-line-missing");
});

test("merge-check: refuses every Status word but accepted; an unlisted word gets status-word-refused", () => {
  const run = (status) => () => checkMergeReady({
    repoRoot: REPO, recordPath: "docs/work/x.record.md", branch: "b",
    execImpl: () => record({ Status: status }),
  });
  assert.throws(run("PARTIAL"), (e) => e.code === "status-word-refused" && /not an allowed Status word/.test(e.message));
  assert.throws(run("NEEDS Ben"), (e) => e.code === "status-word-refused");
  for (const status of ["open", "NEEDS BEN", "NEEDS skills-o", "FAILED", "reviewed", "closed"]) {
    assert.throws(run(status), (e) => e.code === "not-accepted-for-merge", status);
  }
  assert.equal(run("accepted")().ok, true);
});

test("existing records on disk still parse and none gains a bad-status or Now: finding", () => {
  const entries = listRecords(path.join(REPO, "docs", "work"), { fsImpl: fs });
  assert.ok(entries.length > 50, `records read: ${entries.length}`);
  for (const { path: p, record: r } of entries) {
    assert.deepEqual(r.errors, [], p);
    const bad = validateRecord(r).filter((f) => f.code === "bad-status" || /Now:/.test(f.message));
    assert.deepEqual(bad, [], p);
  }
});
