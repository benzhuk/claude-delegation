import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { childEnv } from "../skills/multi/scripts/test-child-env.mjs";
import {
  STATUSES, WITHDRAWABLE_STATUSES, FINDING_CODES, parseRecord, validateRecord, listRecords, formatLogLine, checkRecordSet,
  checkAcceptance, acceptRecord, acceptanceMain, isCensusFile, extractCensusSummary, extractCensusTimestamp,
  isIncompleteCensus, parseAcceptanceArgs, withdrawRecord, parseWithdrawArgs, closeRecord, parseCloseArgs,
  STRICT_FROM, MODEL_TIER_TOKENS, countedModelTiers, isStrictRecord, checkMeasureTruthRules,
  SCRATCH_FROM, checkScratchField, closeoutRecord,
} from "./work-record.mjs";

function codes(findings) {
  return findings.map((f) => f.code);
}

// N2 ("no test file in this suite inherits the runner environment on its own"): every child this
// file spawns to build a git fixture goes through childEnv(), never a bare process.env. The fixture
// HOME carries its own .gitconfig so the commit has an identity without touching the real one.
function makeGitFixtureEnv() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-git-home-"));
  fs.writeFileSync(path.join(home, ".gitconfig"), "[user]\n\tname = Fixture\n\temail = fixture@example.invalid\n");
  return childEnv(home);
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
    "Lead-session": "fixture-lead-session-1",
    "Spec-session": "fixture-spec-session-1",
    "Spec-from": "2026-09-21T08:00:00Z",
    // C1 ruling a (lane-closeout): an absolute path by default so every fixture that doesn't
    // care about Scratch: stays free of the scratch-missing warning; a test of that ruling
    // overrides this to `undefined` (omitted) or an explicit bad value.
    Scratch: path.join(os.tmpdir(), "work-record-fixture-scratch", "lead-session-1", "lane-1"),
  };
  const merged = { ...defaults, ...overrides };
  const lines = Object.entries(merged)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`);
  lines.push(...extraLines);
  return [...lines, "", body].join("\n");
}

// R2, four-number read: `overrides` is merged over the fixture's own record fields (the
// same shape mkRecordText takes), so a test can omit Lead-session/Spec-session/Spec-from
// (pass the label set to `undefined`) without hand-editing the written file.
function makeAcceptanceFixture(overrides = {}) {
  const repo = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-acceptance-"));
  const env = makeGitFixtureEnv();
  execFileSync("git", ["init", "-q", repo], { env });
  fs.writeFileSync(path.join(repo, "seed.txt"), "seed\n");
  execFileSync("git", ["-C", repo, "add", "seed.txt"], { env });
  execFileSync("git", ["-C", repo, "commit", "-qm", "seed"], { env });
  const sha = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { env, encoding: "utf8" }).trim();
  fs.mkdirSync(path.join(repo, "docs", "work", "evidence"), { recursive: true });
  const evidence = "docs/work/evidence/review.md";
  const record = "docs/work/example.record.md";
  fs.writeFileSync(path.join(repo, evidence), `VERDICT: APPROVE — ${sha.slice(0, 12)}\nIndependent review.\n`);
  fs.writeFileSync(path.join(repo, record), mkRecordText({
    Work: "wr-2026-09-23-acceptance",
    Scope: `docs/spec.md@${sha.slice(0, 12)}`,
    Owner: "lead",
    Status: "reviewed",
    Authority: "may accept after authorized integration",
    Artifact: `territory/a@${sha.slice(0, 12)}`,
    Evidence: evidence,
    Worktree: ".",
    Next: "run strict acceptance",
    Opened: "2026-09-23T12:00:00Z",
    // R2 (measure-truth-1): every record is refused on Base: unless it is exactly one
    // 40-hex sha, strict or not - a default here keeps every other fixture test's focus
    // on what it actually names, exactly like Lead-session/Spec-session/Spec-from
    // above; a test of Base: itself overrides this via `overrides`.
    Base: sha,
    ...overrides,
  }, [], "Predicts: acceptance identity agrees.\nObserved: pending integration measurement."));
  return { repo, env, sha, evidence, record };
}

// Lane 60b (artifact-repo-60b spec.md): a second, wholly independent real git repository - the
// "repo B" every Artifact-repo: test below points at. Never shares a home/.gitconfig identity
// setup of its own; callers pass the SAME `env` a makeAcceptanceFixture() built, since these
// tests only ever need one shared committer identity across both repos.
function makeArtifactRepoFixture(env, prefix = "work-record-artifact-repo-") {
  const dir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix));
  execFileSync("git", ["init", "-q", dir], { env });
  fs.writeFileSync(path.join(dir, "seed.txt"), "artifact repo seed\n");
  execFileSync("git", ["-C", dir, "add", "seed.txt"], { env });
  execFileSync("git", ["-C", dir, "commit", "-qm", "seed"], { env });
  const sha = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { env, encoding: "utf8" }).trim();
  return { dir, sha };
}

// A small, hand-written census fixture (C2's own assumption about C1's header/shape -
// see work-record.mjs's CENSUS_HEADER_RE comment): a recognisable `VERDICT: COUNTED`
// first line, bullet-style scalar facts (leadTurns, wall clock), and by-model/by-role
// markdown tables. Lives OUTSIDE any repo fixture (a real census legitimately does,
// too) so tests exercise the non-repo-confined --census read path.
function makeCensusFixture(opts = {}) {
  const { lastAt = "2026-09-24T10:12:00Z", leadTurns = 42, recognized = true } = opts;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-census-"));
  const lines = recognized
    ? [
        // leadLastMessageAt lives on THIS header line, exactly like build-census.mjs's
        // own output - extractCensusTimestamp reads only this field, never a timestamp
        // scanned from anywhere else in the file (T1/C2 fix round, MAJOR C2).
        `VERDICT: COUNTED ${leadTurns} lead turns, 5 subagent files, leadLastMessageAt: ${lastAt}`,
        "",
        "# Build census",
        "",
        `- leadTurns: **${leadTurns}**`,
        "- wall clock: **1h 12m**",
        "",
        "### Lead tokens by model — window (deduped)",
        "",
        "| model | input | cache_creation | cache_read | output |",
        "|---|---|---|---|---|",
        "| claude-opus-4 | 1000 | 200 | 300 | 400 |",
        "",
        "### By role",
        "",
        "| role | turns |",
        "|---|---|",
        "| build:T1 | 20 |",
        "| review:T1 | 10 |",
        "| unassigned | 12 |",
        "",
        `Window: 2026-09-24T09:00:00Z .. ${lastAt}`,
        "",
      ]
    : ["# Build census", "", "not a recognised header line", ""];
  const censusPath = path.join(dir, "census.md");
  fs.writeFileSync(censusPath, lines.join("\n"));
  return censusPath;
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

test("STATUSES includes rejected, closed, and withdrawn", () => {
  assert.equal(STATUSES.length, 9);
  assert.ok(STATUSES.includes("rejected"));
  assert.ok(STATUSES.includes("closed"));
  assert.ok(STATUSES.includes("withdrawn"));
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

test("FINDING_CODES is exactly L-C6's thirteen codes plus T1's accepted-without-check plus C1's scratch-missing/scratch-invalid plus lane 60b's artifact-repo-not-absolute (seventeen total)", () => {
  // Documents the full set this suite must cover; the individual tests below assert each one fires.
  assert.equal(FINDING_CODES.length, 17);
  assert.deepEqual(
    [...FINDING_CODES].sort(),
    [
      "accepted-without-artifact",
      "accepted-without-check",
      "accepted-without-evidence",
      "artifact-repo-not-absolute",
      "bad-status",
      "bad-work-id",
      "bugfix-gate-missing",
      "evidence-missing",
      "evidence-no-verdict",
      "evidence-unreachable",
      "missing-field",
      "runnable-with-owner",
      "scope-drift",
      "scratch-invalid",
      "scratch-missing",
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
  // This minimal, Scratch:-free record also gets checkScratchField's info-level warning (C1
  // ruling a) - every OTHER finding here (missing-field) is still level "finding".
  assert.ok(findings.filter((f) => f.code !== "scratch-missing").every((f) => f.level === "finding"));
});

// ── C1 ruling a (lane-closeout): the Scratch: field ─────────────────────────────────

test("checkScratchField: refuses scratch-missing only when Spec-from is parseable and on/after scratchFrom", () => {
  const scratchFrom = "2026-09-28T00:00:00Z";
  const onOrAfter = parseRecord(mkRecordText({ "Spec-from": "2026-09-28T00:00:00Z", Scratch: undefined }));
  const onOrAfterResult = checkScratchField(onOrAfter, { scratchFrom });
  assert.equal(onOrAfterResult.refusal?.code, "scratch-missing");
  assert.match(onOrAfterResult.refusal.message, /Spec-from:.*on or after SCRATCH_FROM/);
  assert.equal(onOrAfterResult.warning, null);

  const after = parseRecord(mkRecordText({ "Spec-from": "2026-09-29T00:00:00Z", Scratch: undefined }));
  assert.equal(checkScratchField(after, { scratchFrom }).refusal?.code, "scratch-missing");
});

test("checkScratchField: a record with no Scratch: line gets a warning only, never a refusal, when Spec-from is before scratchFrom, absent, or unparseable", () => {
  const scratchFrom = "2026-09-28T00:00:00Z";
  const before = parseRecord(mkRecordText({ "Spec-from": "2026-09-27T23:59:59Z", Scratch: undefined }));
  const beforeResult = checkScratchField(before, { scratchFrom });
  assert.equal(beforeResult.refusal, null);
  assert.match(beforeResult.warning, /scratch-missing/);

  const absent = parseRecord(mkRecordText({ "Spec-from": undefined, Scratch: undefined }));
  const absentResult = checkScratchField(absent, { scratchFrom });
  assert.equal(absentResult.refusal, null);
  assert.match(absentResult.warning, /scratch-missing/);

  const unparseable = parseRecord(mkRecordText({ "Spec-from": "not-a-date", Scratch: undefined }));
  const unparseableResult = checkScratchField(unparseable, { scratchFrom });
  assert.equal(unparseableResult.refusal, null);
  assert.match(unparseableResult.warning, /scratch-missing/);
});

test("checkScratchField: a Scratch: value that is not absolute is refused (scratch-invalid) at any date, before or after scratchFrom", () => {
  const scratchFrom = "2026-09-28T00:00:00Z";
  const beforeCutoff = parseRecord(mkRecordText({ "Spec-from": "2020-01-01T00:00:00Z", Scratch: "relative/scratch/dir" }));
  const beforeResult = checkScratchField(beforeCutoff, { scratchFrom });
  assert.equal(beforeResult.refusal?.code, "scratch-invalid");
  assert.match(beforeResult.refusal.message, /not an absolute directory path/);

  const afterCutoff = parseRecord(mkRecordText({ "Spec-from": "2027-01-01T00:00:00Z", Scratch: "relative/scratch/dir" }));
  assert.equal(checkScratchField(afterCutoff, { scratchFrom }).refusal?.code, "scratch-invalid");
});

test("checkScratchField: an absolute Scratch: value never refuses or warns, regardless of Spec-from/scratchFrom", () => {
  const abs = path.join(os.tmpdir(), "some-lead-session", "some-lane");
  const r = parseRecord(mkRecordText({ "Spec-from": "2099-06-01T00:00:00Z", Scratch: abs }));
  const result = checkScratchField(r, { scratchFrom: "2026-09-28T00:00:00Z" });
  assert.deepEqual(result, { refusal: null, warning: null });
});

// F9 (C1 round 2, MAJOR): a Windows-shaped Scratch: value (`C:\...`) is a valid record anywhere
// it is READ - checkScratchField accepts either OS's absolute convention, since the record may
// have been written on a different host than the one validating it. Only the actual delete
// (removeScratchDirectory, tested in work-record-closeout.test.mjs) refuses a value in the wrong
// convention for the CURRENT host.
test("checkScratchField: a Windows-shaped absolute Scratch: value (C:\\...) never refuses or warns on any host", () => {
  const r = parseRecord(mkRecordText({ "Spec-from": "2099-06-01T00:00:00Z", Scratch: "C:\\Users\\lead\\AppData\\Local\\Temp\\sess-1\\lane" }));
  const result = checkScratchField(r, { scratchFrom: "2026-09-28T00:00:00Z" });
  assert.deepEqual(result, { refusal: null, warning: null });
});

test("checkScratchField uses the real SCRATCH_FROM export by default, when opts.scratchFrom is not given", () => {
  const r = parseRecord(mkRecordText({ "Spec-from": "2099-06-01T00:00:00Z", Scratch: undefined }));
  const result = checkScratchField(r);
  assert.equal(result.refusal?.code, "scratch-missing");
  assert.match(result.refusal.message, new RegExp(SCRATCH_FROM.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("validateRecord: scratch-missing is a finding-level refusal when Spec-from is on/after opts.scratchFrom, an info-level warning otherwise", () => {
  const refused = parseRecord(mkRecordText({ "Spec-from": "2026-09-28T00:00:00Z", Scratch: undefined }));
  const refusedFindings = validateRecord(refused, { scratchFrom: "2026-09-28T00:00:00Z" });
  const refusedRow = refusedFindings.find((f) => f.code === "scratch-missing");
  assert.equal(refusedRow.level, "finding");

  const warned = parseRecord(mkRecordText({ "Spec-from": "2020-01-01T00:00:00Z", Scratch: undefined }));
  const warnedFindings = validateRecord(warned, { scratchFrom: "2026-09-28T00:00:00Z" });
  const warnedRow = warnedFindings.find((f) => f.code === "scratch-missing");
  assert.equal(warnedRow.level, "info");
});

test("validateRecord: scratch-invalid is a finding-level refusal", () => {
  const r = parseRecord(mkRecordText({ Scratch: "relative/dir" }));
  const findings = validateRecord(r);
  const row = findings.find((f) => f.code === "scratch-invalid");
  assert.equal(row.level, "finding");
});

// Lane 60b (artifact-repo-60b spec.md item 5): "Add a finding artifact-repo-not-absolute when
// it is present and not absolute."
test("validateRecord: artifact-repo-not-absolute fires (finding-level) for a relative Artifact-repo:, and is silent when it is absolute or absent", () => {
  const relative = parseRecord(mkRecordText({ "Artifact-repo": "relative/dir" }));
  const relativeFindings = validateRecord(relative);
  const row = relativeFindings.find((f) => f.code === "artifact-repo-not-absolute");
  assert.ok(row, "expected artifact-repo-not-absolute to fire for a relative Artifact-repo:");
  assert.equal(row.level, "finding");

  const absolute = parseRecord(mkRecordText({ "Artifact-repo": path.join(os.tmpdir(), "some-other-repo") }));
  assert.equal(validateRecord(absolute).some((f) => f.code === "artifact-repo-not-absolute"), false);

  const absent = parseRecord(mkRecordText());
  assert.equal(validateRecord(absent).some((f) => f.code === "artifact-repo-not-absolute"), false);
});

test("checkAcceptance/acceptRecord: refuse with code scratch-missing when Spec-from is on/after opts.scratchFrom and there is no Scratch: line", () => {
  const f = makeAcceptanceFixture({ Scratch: undefined, "Spec-from": "2026-09-28T00:00:00Z" });
  assert.throws(
    () => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, scratchFrom: "2026-09-28T00:00:00Z" }),
    (err) => err.code === "scratch-missing",
  );
});

test("checkAcceptance/acceptRecord: refuse with code scratch-invalid when Scratch: is not an absolute path, regardless of Spec-from", () => {
  const f = makeAcceptanceFixture({ Scratch: "relative/dir", "Spec-from": "2020-01-01T00:00:00Z" });
  assert.throws(
    () => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }),
    (err) => err.code === "scratch-invalid",
  );
});

test("checkAcceptance: a record with no Scratch: line and Spec-from before opts.scratchFrom is not refused, and carries the scratch-missing warning", () => {
  const f = makeAcceptanceFixture({ Scratch: undefined, "Spec-from": "2020-01-01T00:00:00Z" });
  const result = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, scratchFrom: "2026-09-28T00:00:00Z" });
  assert.ok(result.warnings?.some((w) => w.startsWith("scratch-missing:")));
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

test("validateRecord: accepted with an in-repo evidence path is clean without repoRoot (A4)", () => {
  const r = parseRecord(mkRecordText({ Status: "accepted", Artifact: "integrate/next-build@abc1111", Evidence: "docs/work/evidence/wr-x-review.md" }));
  assert.ok(!codes(validateRecord(r)).includes("accepted-without-evidence"));
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

test("validateRecord: a later Log line with the SAME owner is not an owner change (A4)", () => {
  const r = parseRecord(
    mkRecordText({ Status: "reviewed", Artifact: "integrate/next-build@abc1111" }, [
      "Log: 2026-09-21T09:00:00Z owned t1",
      "Log: 2026-09-21T10:00:00Z delivered t1 artifact abc1111",
      "Log: 2026-09-21T11:00:00Z reviewed t1",
    ]),
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

// --- accepted-without-check (T1 round-2 review, MAJOR 3) ---------------------------

test("validateRecord: accepted-without-check fires when Status: accepted, Opened: is on/after the cutoff, and there is no Log: accepted ... artifact <40-hex> line (a hand-flipped Status:)", () => {
  const r = parseRecord(
    mkRecordText({
      Status: "accepted",
      Artifact: "territory/a@abcd1234abcd1234abcd1234abcd1234abcd1234",
      Evidence: "docs/work-record.md",
      Opened: "2026-09-25T09:00:00Z",
    }),
  );
  assert.ok(codes(validateRecord(r, { repoRoot: process.cwd() })).includes("accepted-without-check"));
});

test("validateRecord: accepted-without-check does not fire once acceptRecord's own Log: shape is present, naming the same artifact", () => {
  const r = parseRecord(
    mkRecordText(
      {
        Status: "accepted",
        Artifact: "territory/a@abcd1234abcd1234abcd1234abcd1234abcd1234",
        Evidence: "docs/work-record.md",
        Opened: "2026-09-25T09:00:00Z",
      },
      [
        "Log: 2026-09-24T10:00:00.000Z accepted t1 artifact abcd1234abcd1234abcd1234abcd1234abcd1234",
        "Census: skipped — test fixture",
      ],
    ),
  );
  assert.ok(!codes(validateRecord(r, { repoRoot: process.cwd() })).includes("accepted-without-check"));
});

// --- accepted-without-check / census (T1/C2 round-2 review, MAJOR 2) ---------------

test("validateRecord: accepted-without-check fires when a hand-edited record copies a matching Log: accepted line but carries no Census: line at all", () => {
  const r = parseRecord(
    mkRecordText(
      {
        Status: "accepted",
        Artifact: "territory/a@abcd1234abcd1234abcd1234abcd1234abcd1234",
        Evidence: "docs/work-record.md",
        Opened: "2026-09-25T09:00:00Z",
      },
      ["Log: 2026-09-24T10:00:00.000Z accepted t1 artifact abcd1234abcd1234abcd1234abcd1234abcd1234"],
    ),
  );
  assert.ok(codes(validateRecord(r, { repoRoot: process.cwd() })).includes("accepted-without-check"));
});

test("validateRecord: the census-required check does not fire when a Census: line (even a skipped one) is present", () => {
  const r = parseRecord(
    mkRecordText(
      {
        Status: "accepted",
        Artifact: "territory/a@abcd1234abcd1234abcd1234abcd1234abcd1234",
        Evidence: "docs/work-record.md",
        Opened: "2026-09-25T09:00:00Z",
      },
      [
        "Log: 2026-09-24T10:00:00.000Z accepted t1 artifact abcd1234abcd1234abcd1234abcd1234abcd1234",
        "Census: skipped — no census available",
      ],
    ),
  );
  assert.ok(!codes(validateRecord(r, { repoRoot: process.cwd() })).includes("accepted-without-check"));
});

test("validateRecord: the census-required check is grandfathered for a record opened before CENSUS_REQUIRED_CUTOFF, even with no Census: line", () => {
  const r = parseRecord(
    mkRecordText(
      {
        Status: "accepted",
        Artifact: "territory/a@abcd1234abcd1234abcd1234abcd1234abcd1234",
        Evidence: "docs/work-record.md",
        Opened: "2026-09-24T20:00:00Z",
      },
      ["Log: 2026-09-24T21:00:00.000Z accepted t1 artifact abcd1234abcd1234abcd1234abcd1234abcd1234"],
    ),
  );
  assert.ok(!codes(validateRecord(r, { repoRoot: process.cwd() })).includes("accepted-without-check"));
});

test("validateRecord: accepted-without-check does not fire for a record opened before the cutoff (grandfathered)", () => {
  const r = parseRecord(
    mkRecordText({
      Status: "accepted",
      Artifact: "territory/a@abcd1234abcd1234abcd1234abcd1234abcd1234",
      Evidence: "docs/work-record.md",
      Opened: "2026-09-21T09:00:00Z",
    }),
  );
  assert.ok(!codes(validateRecord(r, { repoRoot: process.cwd() })).includes("accepted-without-check"));
});

test("validateRecord: still fires when the only Log: accepted line names a DIFFERENT artifact (a stale acceptance log)", () => {
  const r = parseRecord(
    mkRecordText(
      {
        Status: "accepted",
        Artifact: "territory/a@abcd1234abcd1234abcd1234abcd1234abcd1234",
        Evidence: "docs/work-record.md",
        Opened: "2026-09-25T09:00:00Z",
      },
      ["Log: 2026-09-24T10:00:00.000Z accepted t1 artifact 1111111111111111111111111111111111111111"],
    ),
  );
  assert.ok(codes(validateRecord(r, { repoRoot: process.cwd() })).includes("accepted-without-check"));
});

test("validateRecord: accepted-without-check fires on an unparseable Opened: (unknown is not grandfathered)", () => {
  const r = parseRecord(
    mkRecordText({
      Status: "accepted",
      Artifact: "territory/a@abcd1234abcd1234abcd1234abcd1234abcd1234",
      Evidence: "docs/work-record.md",
      Opened: "soon",
    }),
  );
  assert.ok(codes(validateRecord(r, { repoRoot: process.cwd() })).includes("accepted-without-check"));
});

test("seam S3: accepted-without-check never fires for a non-code Artifact: path (no resolvable sha), even opened after the cutoff", () => {
  const r = parseRecord(
    mkRecordText({
      Status: "accepted",
      Artifact: "docs/work/evidence/four-host-0206-and-live-pickup.md",
      Evidence: "docs/work-record.md",
      Opened: "2026-09-25T09:00:00Z",
    }),
  );
  assert.ok(!codes(validateRecord(r, { repoRoot: process.cwd() })).includes("accepted-without-check"));
});

test("accepted-without-check: existing accepted records remain grandfathered", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = path.join(repoRoot, "docs", "work");
  const hits = fs.readdirSync(dir).filter((f) => f.endsWith(".record.md")).filter((f) => {
    const record = parseRecord(fs.readFileSync(path.join(dir, f), "utf8"));
    return record.fields.status === "accepted" && codes(validateRecord(record)).includes("accepted-without-check");
  });
  assert.deepEqual(hits, []);
});

test("validateRecord: closed fixtures require the exact closed merge receipt", () => {
  for (const extra of [[], ["Log: 2026-09-27T18:00:00Z closed someone-else merge aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]]) {
    const record = parseRecord(mkRecordText({ Status: "closed", Artifact: "docs/work-record.md", Evidence: "docs/work-record.md", Opened: "2026-09-27T17:00:00Z" }, extra));
    assert.ok(codes(validateRecord(record, { repoRoot: process.cwd() })).includes("accepted-without-check"));
  }
});

// Named failure case 3 (T1 brief): "fresh worker on an obsolete fact" -> scope-drift, on a
// fixture repo (built under os.tmpdir() per addendum A3) where the scope file has a newer
// commit than the sha recorded in Scope:.
test("validateRecord: fresh worker on an obsolete fact -> scope-drift on a fixture repo", () => {
  const repo = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-scope-"));
  const env = makeGitFixtureEnv();
  const run = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", env });
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

// F7 (seam review): an unresolvable Scope: path (never tracked at ref) must be
// distinguishable from an agreeing one - a silent [] either way hides the difference.
test("validateRecord: scope-unresolvable (info) fires when the Scope: path has no history at ref, not when it does", () => {
  const repo = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-scope-unresolvable-"));
  const env = makeGitFixtureEnv();
  const run = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", env });
  run(["init", "-q"]);
  fs.writeFileSync(path.join(repo, "tracked.txt"), "v1\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "v1"]);
  const sha = run(["rev-parse", "HEAD"]).trim();

  const unresolvable = parseRecord(mkRecordText({ Scope: `never-committed.txt@${sha}` }));
  const unresolvableFindings = validateRecord(unresolvable, { gitDir: repo, ref: "HEAD" });
  const row = unresolvableFindings.find((f) => f.code === "scope-unresolvable");
  assert.ok(row, "expected a scope-unresolvable row");
  assert.equal(row.level, "info");
  assert.ok(!codes(unresolvableFindings).includes("scope-drift"));

  const resolvable = parseRecord(mkRecordText({ Scope: `tracked.txt@${sha}` }));
  const resolvableFindings = validateRecord(resolvable, { gitDir: repo, ref: "HEAD" });
  assert.ok(!codes(resolvableFindings).includes("scope-unresolvable"));
  assert.ok(!codes(resolvableFindings).includes("scope-drift"));
});

test("validateRecord: a git invocation that fails outright yields neither scope-drift nor scope-unresolvable", () => {
  const execImpl = () => {
    throw new Error("fatal: not a git repository");
  };
  const r = parseRecord(mkRecordText({ Scope: "docs/mandate-template.md@0000000" }));
  const findings = validateRecord(r, { gitDir: "/tmp/not-a-repo", ref: "HEAD", execImpl });
  assert.ok(!codes(findings).includes("scope-drift"));
  assert.ok(!codes(findings).includes("scope-unresolvable"));
});

test("validateRecord: scope-drift is not attempted without both gitDir and ref", () => {
  const r = parseRecord(mkRecordText({ Scope: "docs/mandate-template.md@0000000" }));
  assert.ok(!codes(validateRecord(r)).includes("scope-drift"));
  assert.ok(!codes(validateRecord(r, { gitDir: process.cwd() })).includes("scope-drift"));
});

test("validateRecord: scope-drift never invokes git unless BOTH gitDir and ref are given", () => {
  const calls = [];
  const execImpl = (...a) => {
    calls.push(a);
    return "";
  };
  const r = parseRecord(mkRecordText({ Scope: "docs/mandate-template.md@0000000" }));
  for (const partial of [{}, { gitDir: "/tmp/x" }, { ref: "HEAD" }]) {
    validateRecord(r, { ...partial, execImpl });
    assert.equal(calls.length, 0, `git was invoked with opts ${JSON.stringify(partial)}`);
  }
  validateRecord(r, { gitDir: "/tmp/x", ref: "HEAD", execImpl });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], ["-C", "/tmp/x", "log", "-1", "--format=%H", "HEAD", "--", "docs/mandate-template.md"]);
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

// --- L-C6: runnable-with-owner ----------------------------------------------------

test("validateRecord: runnable-with-owner fires when Status: runnable and Owner: is present and not none", () => {
  const r = parseRecord(mkRecordText({ Status: "runnable", Owner: "t2" }));
  const findings = validateRecord(r);
  assert.ok(codes(findings).includes("runnable-with-owner"));
  const finding = findings.find((f) => f.code === "runnable-with-owner");
  assert.equal(finding.level, "finding");
});

test("validateRecord: runnable-with-owner does not fire when Owner: is none", () => {
  const r = parseRecord(mkRecordText({ Status: "runnable", Owner: "none" }));
  assert.ok(!codes(validateRecord(r)).includes("runnable-with-owner"));
});

test("validateRecord: runnable-with-owner does not fire when Owner: is missing entirely", () => {
  const r = parseRecord("Work: wr-2026-09-21-x\nStatus: runnable\n\nbody");
  assert.ok(!codes(validateRecord(r)).includes("runnable-with-owner"));
});

// Round-2 review MINOR 1: a whitespace-only Owner: line parses to "" (not undefined, not
// "none"), which used to fire runnable-with-owner and silently drop an unowned runnable
// record out of the backlog notice - the one failure mode the hook exists to prevent.
test("validateRecord: runnable-with-owner does not fire when Owner: is whitespace-only (parses to empty string)", () => {
  const spaces = parseRecord(mkRecordText({ Status: "runnable", Owner: "   " }));
  assert.equal(spaces.fields.owner, "");
  assert.ok(!codes(validateRecord(spaces)).includes("runnable-with-owner"));
});

test("validateRecord: runnable-with-owner does not fire when Owner: is tab-only (parses to empty string)", () => {
  const tab = parseRecord(mkRecordText({ Status: "runnable", Owner: "\t" }));
  assert.equal(tab.fields.owner, "");
  assert.ok(!codes(validateRecord(tab)).includes("runnable-with-owner"));
});

test("validateRecord: runnable-with-owner does not fire when Owner: has no value at all on the line", () => {
  const r = parseRecord("Work: wr-2026-09-21-x\nStatus: runnable\nOwner:\n\nbody");
  assert.equal(r.fields.owner, undefined, "no characters after the colon means the field regex never matches");
  assert.ok(!codes(validateRecord(r)).includes("runnable-with-owner"));
});

test("validateRecord: runnable-with-owner does not fire for a non-runnable status with an owner", () => {
  const r = parseRecord(mkRecordText({ Status: "owned", Owner: "t2" }));
  assert.ok(!codes(validateRecord(r)).includes("runnable-with-owner"));
});

// --- L-C6: checkRecordSet -----------------------------------------------------------

test("checkRecordSet: a work id held by exactly one record produces no finding", () => {
  const records = [{ path: "/a/wr-2026-09-21-solo.record.md", record: parseRecord(mkRecordText({ Work: "wr-2026-09-21-solo" })) }];
  assert.deepEqual(checkRecordSet(records), []);
});

test("checkRecordSet: a work id held by more than one record produces duplicate-work-id with both paths", () => {
  const records = [
    { path: "/a/one.record.md", record: parseRecord(mkRecordText({ Work: "wr-2026-09-21-dup" })) },
    { path: "/a/two.record.md", record: parseRecord(mkRecordText({ Work: "wr-2026-09-21-dup" })) },
  ];
  const findings = checkRecordSet(records);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "duplicate-work-id");
  assert.equal(findings[0].level, "finding");
  assert.equal(findings[0].work, "wr-2026-09-21-dup");
  assert.deepEqual(findings[0].paths.sort(), ["/a/one.record.md", "/a/two.record.md"]);
  // Deliberately a different shape from validateRecord's findings: work/paths, not message.
  assert.equal(findings[0].message, undefined);
});

test("checkRecordSet: records with no work field are skipped, not treated as one more duplicate group", () => {
  const records = [
    { path: "/a/one.record.md", record: parseRecord("Owner: t1\n\nno work field") },
    { path: "/a/two.record.md", record: parseRecord("Owner: t2\n\nno work field either") },
  ];
  assert.deepEqual(checkRecordSet(records), []);
});

test("checkRecordSet: three or more distinct work ids with one duplicated pair reports only that pair", () => {
  const records = [
    { path: "/a/one.record.md", record: parseRecord(mkRecordText({ Work: "wr-2026-09-21-a" })) },
    { path: "/a/two.record.md", record: parseRecord(mkRecordText({ Work: "wr-2026-09-21-b" })) },
    { path: "/a/three.record.md", record: parseRecord(mkRecordText({ Work: "wr-2026-09-21-b" })) },
  ];
  const findings = checkRecordSet(records);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].work, "wr-2026-09-21-b");
});

test("checkRecordSet: works end to end against listRecords' own [{ path, record }] shape", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-dup-"));
  fs.writeFileSync(path.join(dir, "one.record.md"), mkRecordText({ Work: "wr-2026-09-21-live" }));
  fs.writeFileSync(path.join(dir, "two.record.md"), mkRecordText({ Work: "wr-2026-09-21-live" }));
  const results = listRecords(dir);
  const findings = checkRecordSet(results);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].work, "wr-2026-09-21-live");
  assert.equal(findings[0].paths.length, 2);
});

// --- strict read-only acceptance --------------------------------------------------

test("checkAcceptance accepts matching abbreviated approval in live and pinned modes", () => {
  const f = makeAcceptanceFixture();
  const live = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, deliveryRef: "HEAD" });
  // Opened: 2026-09-23T12:00:00Z is well before STRICT_FROM, so this fixture is
  // non-strict and always carries the R1 strict-exempt warning (contracts.md R1).
  assert.deepEqual(live, {
    ok: true, work: "wr-2026-09-23-acceptance", artifact: f.sha, delivery: f.sha,
    warnings: [`strict-exempt: Opened before ${STRICT_FROM}; Spec-session/Spec-from/model rules are warnings for this record`],
  });
  const pinned = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha.slice(0, 10) });
  assert.equal(pinned.artifact, f.sha);
});

// Lane 47, P2 class (b): checkAcceptance's git calls, run through their DEFAULT spawnImpl (no
// execImpl/spawnImpl injected), must resolve identity from -C <cwd>, never an inherited GIT_DIR
// pointed at a second, unrelated repo. Must fail on base d6f5c9d (red) before the fix, pass after.
test("checkAcceptance resolves against repoRoot, not an inherited GIT_DIR pointed at another repo", () => {
  const f = makeAcceptanceFixture();
  const other = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-other-repo-"));
  execFileSync("git", ["init", "-q", other], { env: makeGitFixtureEnv() });
  const hadGitDir = Object.prototype.hasOwnProperty.call(process.env, "GIT_DIR");
  const prevGitDir = process.env.GIT_DIR;
  try {
    process.env.GIT_DIR = path.join(other, ".git");
    const live = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, deliveryRef: "HEAD" });
    assert.equal(live.ok, true);
    assert.equal(live.artifact, f.sha);
  } finally {
    if (hadGitDir) process.env.GIT_DIR = prevGitDir;
    else delete process.env.GIT_DIR;
  }
});

test("checkAcceptance refuses a moved live ref without falling back to the reviewed artifact", () => {
  const f = makeAcceptanceFixture();
  fs.writeFileSync(path.join(f.repo, "later.txt"), "later\n");
  execFileSync("git", ["-C", f.repo, "add", "later.txt"], { env: f.env });
  execFileSync("git", ["-C", f.repo, "commit", "-qm", "later"], { env: f.env });
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, deliveryRef: "HEAD" }), /does not match delivery/);
  assert.equal(checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }).ok, true);
});

test("checkAcceptance preserves historical failures but refuses a current contradictory review", () => {
  const f = makeAcceptanceFixture();
  const historical = "docs/work/evidence/historical.md";
  execFileSync("git", ["-C", f.repo, "commit", "--allow-empty", "-qm", "historical other revision"], { env: f.env });
  const otherSha = execFileSync("git", ["-C", f.repo, "rev-parse", "HEAD"], { env: f.env, encoding: "utf8" }).trim();
  fs.writeFileSync(path.join(f.repo, historical), `VERDICT: FAIL ${otherSha.slice(0, 12)}\nOld failure.\n`);
  const recordPath = path.join(f.repo, f.record);
  let text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace(`Evidence: ${f.evidence}`, `Evidence: ${f.evidence}, ${historical}`));
  assert.equal(checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }).ok, true);
  fs.writeFileSync(path.join(f.repo, historical), `VERDICT: NEEDS_FIXES ${f.sha.slice(0, 12)}\nCurrent objection.\n`);
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }), /refusing evidence/);
});

test("checkAcceptance rejects malformed identity, duplicate fields, and fake Observed examples", () => {
  const f = makeAcceptanceFixture();
  const recordPath = path.join(f.repo, f.record);
  const original = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, original.replace(/Artifact: territory\/a@[0-9a-f]+/, "Artifact: territory/a@ffffffff"));
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }), /missing, ambiguous, or not a commit/);
  fs.writeFileSync(recordPath, original.replace("Status: reviewed", "Status: reviewed\nStatus: accepted"));
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }), /duplicate singleton field/);
  fs.writeFileSync(recordPath, original.replace(
    "Predicts: acceptance identity agrees.\nObserved: pending integration measurement.",
    "Predicts: acceptance identity agrees.\n> Observed: quoted only.\n```\nObserved: fenced only.\n```",
  ));
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }), /requires a nonempty Observed/);
});

test("checkAcceptance validates every evidence path and refuses realpath escapes", (t) => {
  const f = makeAcceptanceFixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-acceptance-outside-"));
  const outsideReport = path.join(outside, "review.md");
  fs.writeFileSync(outsideReport, `VERDICT: APPROVE ${f.sha}\n`);
  const link = path.join(f.repo, "docs", "work", "evidence", "escape.md");
  try {
    fs.symlinkSync(outsideReport, link, "file");
  } catch (error) {
    if (process.platform === "win32" && (error.code === "EPERM" || error.code === "EACCES")) {
      t.skip("creating symlinks is not permitted on this Windows host");
      return;
    }
    throw error;
  }
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace(`Evidence: ${f.evidence}`, "Evidence: docs/work/evidence/escape.md"));
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }), /resolves outside repository/);
});

test("checkAcceptance rejects noncommit objects and contradictory approval text", () => {
  const f = makeAcceptanceFixture();
  const blob = execFileSync("git", ["-C", f.repo, "hash-object", "seed.txt"], { env: f.env, encoding: "utf8" }).trim();
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: blob }), /not a commit/);
  fs.writeFileSync(path.join(f.repo, f.evidence), `VERDICT: APPROVE ${f.sha} but NEEDS_FIXES\n`);
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }), /malformed deciding verdict/);
});

// Seam S2: the loop's REVIEW_MANDATE and reviewer briefs ask for a first line of exactly
// `VERDICT: NEEDS_FIXES (<n>)` (a parenthesised finding count, no sha) or
// `VERDICT: APPROVE <sha>`. A historical NEEDS_FIXES (<n>) evidence file must count as
// history (skipped) rather than aborting acceptance with "malformed deciding verdict",
// and a fresh `VERDICT: APPROVE (<n>) <sha>`-shaped... (actually APPROVE never carries a
// count) must still resolve normally.
test("seam S2: a historical `VERDICT: NEEDS_FIXES (<n>)` evidence file (no sha) counts as history, not a malformed verdict", () => {
  const f = makeAcceptanceFixture();
  const historical = "docs/work/evidence/historical-needs-fixes.md";
  fs.writeFileSync(path.join(f.repo, historical), "VERDICT: NEEDS_FIXES (7)\nOld findings, since fixed.\n");
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace(`Evidence: ${f.evidence}`, `Evidence: ${f.evidence}, ${historical}`));
  assert.equal(checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }).ok, true);
});

test("seam S2: a current `VERDICT: NEEDS_FIXES (<n>)` for the artifact under review still refuses acceptance (no sha means it can't be for THIS artifact, so it counts as history, not a live refusal)", () => {
  // A NEEDS_FIXES (<n>) line with no sha can never match reportCommit === artifact (there is
  // no verdict[2] to resolve), so it is skipped exactly like any other unresolvable historical
  // line — the mandate's contract is that the reviewer always includes <sha>, and this proves
  // the grammar fix does not silently promote a sha-less NEEDS_FIXES into a blocking refusal.
  const f = makeAcceptanceFixture();
  fs.writeFileSync(path.join(f.repo, f.evidence), "VERDICT: NEEDS_FIXES (2)\nStill working.\n");
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }), /no evidence has an exact APPROVE verdict/);
});

test("checkAcceptance requires exactly one delivery mode and leaves input bytes unchanged", () => {
  const f = makeAcceptanceFixture();
  const recordPath = path.join(f.repo, f.record);
  const evidencePath = path.join(f.repo, f.evidence);
  const before = [fs.readFileSync(recordPath), fs.readFileSync(evidencePath)];
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record }), /exactly one/);
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, deliveryRef: "HEAD", pinnedArtifact: f.sha }), /exactly one/);
  checkAcceptance({ repoRoot: f.repo, recordPath: f.record, deliveryRef: "HEAD" });
  assert.deepEqual(fs.readFileSync(recordPath), before[0]);
  assert.deepEqual(fs.readFileSync(evidencePath), before[1]);
});

test("check-acceptance CLI emits only the pinned success JSON", () => {
  const f = makeAcceptanceFixture();
  const stdout = execFileSync(process.execPath, [
    fileURLToPath(new URL("./work-record.mjs", import.meta.url)), "check-acceptance",
    "--record", f.record, "--repo", f.repo, "--delivery-ref", "HEAD",
  ], { env: childEnv(fs.mkdtempSync(path.join(os.tmpdir(), "work-record-cli-home-"))), encoding: "utf8" });
  assert.deepEqual(JSON.parse(stdout), {
    ok: true, work: "wr-2026-09-23-acceptance", artifact: f.sha, delivery: f.sha,
    warnings: [`strict-exempt: Opened before ${STRICT_FROM}; Spec-session/Spec-from/model rules are warnings for this record`],
  });
});

test("checkAcceptance requires a top-level Observed metadata paragraph", () => {
  const bodies = [
    "- ```markdown\n  Observed: fenced list content.\n  ```",
    "- Example paragraph\nPredicts: example only.\nObserved: example only.",
    " \tObserved: mixed indentation.",
    "```markdown\n~~~\nObserved: fenced only.\n```",
    "````markdown\n```\nObserved: fenced only.\n````",
    "> Example paragraph\nObserved: lazy quoted continuation.",
    "    Observed: indented code only.",
  ];
  for (const body of bodies) {
    const f = makeAcceptanceFixture();
    const recordPath = path.join(f.repo, f.record);
    const text = fs.readFileSync(recordPath, "utf8");
    fs.writeFileSync(recordPath, text.replace("Predicts: acceptance identity agrees.\nObserved: pending integration measurement.", body));
    assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }), /requires a nonempty Observed/);
  }
});

test("checkAcceptance accepts top-level Observed at body start, after blank, or after Predicts", () => {
  for (const body of [
    "Observed: pending.",
    "Context paragraph.\n\nObserved: unknown.",
    "Predicts: identity agreement.\nObserved: measured after integration.",
  ]) {
    const f = makeAcceptanceFixture();
    const recordPath = path.join(f.repo, f.record);
    const text = fs.readFileSync(recordPath, "utf8");
    fs.writeFileSync(recordPath, text.replace("Predicts: acceptance identity agrees.\nObserved: pending integration measurement.", body));
    assert.equal(checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }).ok, true);
  }
});

test("checkAcceptance sees empty duplicate and unknown headers in its strict header pass", () => {
  for (const extra of ["Owner:", "Surprise:"]) {
    const f = makeAcceptanceFixture();
    const recordPath = path.join(f.repo, f.record);
    const text = fs.readFileSync(recordPath, "utf8");
    fs.writeFileSync(recordPath, text.replace("Owner: lead", `Owner: lead\n${extra}`));
    assert.throws(
      () => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }),
      extra === "Owner:" ? /duplicate singleton field/ : /unknown label/,
    );
  }
});

test("checkAcceptance rejects an ambiguous branch/tag delivery name", () => {
  const f = makeAcceptanceFixture();
  execFileSync("git", ["-C", f.repo, "commit", "--allow-empty", "-qm", "divergent branch tip"], { env: f.env });
  execFileSync("git", ["-C", f.repo, "branch", "collision", "HEAD"], { env: f.env });
  execFileSync("git", ["-C", f.repo, "tag", "collision", f.sha], { env: f.env });
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, deliveryRef: "collision" }), /ambiguous/);
  execFileSync("git", ["-C", f.repo, "config", "core.warnAmbiguousRefs", "false"], { env: f.env });
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, deliveryRef: "collision" }), /ambiguous/);
});

test("checkAcceptance pinned mode requires a hexadecimal commit identity", () => {
  const f = makeAcceptanceFixture();
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: "HEAD" }), /explicit hexadecimal revision/);
});

// --- sha-not-in-git (T1 required item 2) -------------------------------------------

test("checkAcceptance: sha-not-in-git fires closed when Worktree: is absent (an old record shape), in both modes", () => {
  const f = makeAcceptanceFixture();
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace(/^Worktree: \.\n/m, ""));
  for (const opts of [{ deliveryRef: "HEAD" }, { pinnedArtifact: f.sha }]) {
    try {
      checkAcceptance({ repoRoot: f.repo, recordPath: f.record, ...opts });
      assert.fail("expected checkAcceptance to throw for a record with no Worktree: field");
    } catch (error) {
      assert.match(error.message, /Worktree/);
      assert.equal(error.code, "sha-not-in-git");
    }
  }
});

test("checkAcceptance: sha-not-in-git fires closed for a missing worktree path", () => {
  const f = makeAcceptanceFixture();
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace("Worktree: .", "Worktree: does-not-exist-anywhere"));
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
    assert.fail("expected checkAcceptance to throw for an unresolvable worktree path");
  } catch (error) {
    assert.match(error.message, /sha-not-in-git/);
    assert.equal(error.code, "sha-not-in-git");
  }
});

test("checkAcceptance: sha-not-in-git fires in live mode when the named worktree's HEAD is on a different sha (another branch)", () => {
  const f = makeAcceptanceFixture();
  // A second, unrelated git worktree with its own independent history/HEAD.
  const other = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-acceptance-other-"));
  execFileSync("git", ["init", "-q", other], { env: f.env });
  fs.writeFileSync(path.join(other, "seed.txt"), "other seed\n");
  execFileSync("git", ["-C", other, "add", "seed.txt"], { env: f.env });
  execFileSync("git", ["-C", other, "commit", "-qm", "other seed"], { env: f.env });

  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace("Worktree: .", `Worktree: ${other.split(path.sep).join("/")}`));
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, deliveryRef: "HEAD" });
    assert.fail("expected checkAcceptance to throw when the recorded worktree's HEAD does not match delivery");
  } catch (error) {
    assert.match(error.message, /sha-not-in-git/);
    assert.equal(error.code, "sha-not-in-git");
  }
});

// Round-2 review MAJOR 2: pinned mode used to accept a Worktree: that merely resolved to
// SOME commit, with no relationship at all to the artifact - "a check that passes because
// it isn't looking". An artifact that lives only in a wholly unrelated repository must
// fail closed even in pinned mode.
test("checkAcceptance: pinned mode refuses a Worktree: in a wholly unrelated repository, even though it resolves", () => {
  const f = makeAcceptanceFixture();
  const other = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-acceptance-pinned-other-"));
  execFileSync("git", ["init", "-q", other], { env: f.env });
  fs.writeFileSync(path.join(other, "seed.txt"), "other seed\n");
  execFileSync("git", ["-C", other, "add", "seed.txt"], { env: f.env });
  execFileSync("git", ["-C", other, "commit", "-qm", "other seed"], { env: f.env });

  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace("Worktree: .", `Worktree: ${other.split(path.sep).join("/")}`));
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
    assert.fail("expected checkAcceptance to throw: the artifact has no relationship to an unrelated repository's HEAD");
  } catch (error) {
    assert.match(error.message, /sha-not-in-git/);
    assert.equal(error.code, "sha-not-in-git");
  }
});

// Round-2 review MAJOR 2, attack brief "a SHA on another branch": within the SAME repo,
// an artifact that only lives on a sibling branch (never an ancestor of the named
// worktree's HEAD) must also fail closed in pinned mode - ancestry, not mere resolvability.
test("checkAcceptance: pinned mode refuses a same-repo artifact that only lives on a diverged sibling branch", () => {
  const f = makeAcceptanceFixture();
  const initialBranch = execFileSync("git", ["-C", f.repo, "symbolic-ref", "--short", "HEAD"], { env: f.env, encoding: "utf8" }).trim();
  execFileSync("git", ["-C", f.repo, "checkout", "-qb", "feat", f.sha], { env: f.env });
  fs.writeFileSync(path.join(f.repo, "feat.txt"), "feat\n");
  execFileSync("git", ["-C", f.repo, "add", "feat.txt"], { env: f.env });
  execFileSync("git", ["-C", f.repo, "commit", "-qm", "feat commit"], { env: f.env });
  const featSha = execFileSync("git", ["-C", f.repo, "rev-parse", "HEAD"], { env: f.env, encoding: "utf8" }).trim();
  execFileSync("git", ["-C", f.repo, "checkout", "-q", initialBranch], { env: f.env });
  fs.writeFileSync(path.join(f.repo, "main-only.txt"), "main only\n");
  execFileSync("git", ["-C", f.repo, "add", "main-only.txt"], { env: f.env });
  execFileSync("git", ["-C", f.repo, "commit", "-qm", "main-only commit"], { env: f.env });

  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace(`territory/a@${f.sha.slice(0, 12)}`, `territory/a@${featSha}`));
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: featSha });
    assert.fail("expected checkAcceptance to throw: featSha is not an ancestor of Worktree:'s (moved) HEAD");
  } catch (error) {
    assert.match(error.message, /sha-not-in-git/);
    assert.equal(error.code, "sha-not-in-git");
  }
});

test("checkAcceptance: pinned mode still passes when the artifact is an ancestor of Worktree:'s (moved-forward) HEAD", () => {
  const f = makeAcceptanceFixture();
  fs.writeFileSync(path.join(f.repo, "later.txt"), "later\n");
  execFileSync("git", ["-C", f.repo, "add", "later.txt"], { env: f.env });
  execFileSync("git", ["-C", f.repo, "commit", "-qm", "later"], { env: f.env });
  const result = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
  assert.equal(result.ok, true);
});

// ── Artifact-repo: (lane 60b, docs/specs/artifact-repo-60b/spec.md) ─────────────────────────
// A work record whose artifact lives in another git repository - spec.md's own numbered tests.

// Test 1: accept succeeds for a record in repo A whose Artifact, Worktree and Artifact-repo:
// name a commit in repo B.
test("checkAcceptance: Artifact-repo: resolves Artifact:, Worktree: and the pinned artifact against a separate repository (repo B)", () => {
  const f = makeAcceptanceFixture();
  const b = makeArtifactRepoFixture(f.env);
  const bDirPosix = b.dir.split(path.sep).join("/");
  const recordPath = path.join(f.repo, f.record);
  let text = fs.readFileSync(recordPath, "utf8");
  text = text.replace(/^Artifact: .*$/m, `Artifact: territory/a@${b.sha}`);
  text = text.replace(/^Worktree: \.$/m, `Artifact-repo: ${bDirPosix}\nWorktree: ${bDirPosix}`);
  fs.writeFileSync(recordPath, text);
  // The evidence FILE stays in repo A (readConfinedRegularFile is unaffected); only the commit
  // sha its VERDICT line names is a repo-B sha, resolved through Artifact-repo:.
  fs.writeFileSync(path.join(f.repo, f.evidence), `VERDICT: APPROVE — ${b.sha}\nIndependent review of a cross-repo artifact.\n`);
  const result = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: b.sha });
  assert.equal(result.ok, true);
  assert.equal(result.artifact, b.sha);
  assert.equal(result.delivery, b.sha);
});

// Test 2 (regression guard, "not new red" per spec.md): the same cross-repo record, minus
// Artifact-repo:, still refuses sha-not-in-git - repo A's git has never heard of repo B's sha.
test("checkAcceptance: the same cross-repo record, without Artifact-repo:, still refuses sha-not-in-git", () => {
  const f = makeAcceptanceFixture();
  const b = makeArtifactRepoFixture(f.env);
  const bDirPosix = b.dir.split(path.sep).join("/");
  const recordPath = path.join(f.repo, f.record);
  let text = fs.readFileSync(recordPath, "utf8");
  text = text.replace(/^Artifact: .*$/m, `Artifact: territory/a@${b.sha}`);
  text = text.replace(/^Worktree: \.$/m, `Worktree: ${bDirPosix}`); // no Artifact-repo: line
  fs.writeFileSync(recordPath, text);
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: b.sha });
    assert.fail("expected checkAcceptance to throw: repo A's git has no object for repo B's sha");
  } catch (error) {
    assert.match(error.message, /sha-not-in-git/);
    assert.equal(error.code, "sha-not-in-git");
  }
});

// Test 3: an Artifact-repo: that points at repo A itself refuses artifact-repo-same.
test("checkAcceptance: Artifact-repo: naming --repo itself refuses artifact-repo-same", () => {
  const f = makeAcceptanceFixture();
  const recordPath = path.join(f.repo, f.record);
  let text = fs.readFileSync(recordPath, "utf8");
  text = text.replace(/^Worktree: \.$/m, `Artifact-repo: ${f.repo.split(path.sep).join("/")}\nWorktree: .`);
  fs.writeFileSync(recordPath, text);
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
    assert.fail("expected checkAcceptance to throw: Artifact-repo: names --repo itself");
  } catch (error) {
    assert.equal(error.code, "artifact-repo-same");
  }
});

// Test 4: a relative Artifact-repo: refuses.
test("checkAcceptance: a relative Artifact-repo: refuses (artifact-repo-not-absolute)", () => {
  const f = makeAcceptanceFixture();
  const recordPath = path.join(f.repo, f.record);
  let text = fs.readFileSync(recordPath, "utf8");
  text = text.replace(/^Worktree: \.$/m, "Artifact-repo: relative/path\nWorktree: .");
  fs.writeFileSync(recordPath, text);
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
    assert.fail("expected checkAcceptance to throw: Artifact-repo: is relative");
  } catch (error) {
    assert.equal(error.code, "artifact-repo-not-absolute");
  }
});

// Test 5: a missing Artifact-repo: directory fails closed with sha-not-in-git.
test("checkAcceptance: a missing Artifact-repo: directory fails closed with sha-not-in-git", () => {
  const f = makeAcceptanceFixture();
  const missing = path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-artifact-repo-missing-1");
  const recordPath = path.join(f.repo, f.record);
  let text = fs.readFileSync(recordPath, "utf8");
  text = text.replace(/^Worktree: \.$/m, `Artifact-repo: ${missing.split(path.sep).join("/")}\nWorktree: .`);
  fs.writeFileSync(recordPath, text);
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
    assert.fail("expected checkAcceptance to throw: Artifact-repo: does not exist on disk");
  } catch (error) {
    assert.match(error.message, /sha-not-in-git/);
    assert.equal(error.code, "sha-not-in-git");
  }
});

// Test 6: pinned mode refuses an artifact that is not an ancestor of the named Worktree: in repo B.
test("checkAcceptance: pinned mode refuses an artifact that is not an ancestor of Worktree: inside the Artifact-repo:", () => {
  const f = makeAcceptanceFixture();
  const b = makeArtifactRepoFixture(f.env);
  const bDirPosix = b.dir.split(path.sep).join("/");
  const initialBranch = execFileSync("git", ["-C", b.dir, "symbolic-ref", "--short", "HEAD"], { env: f.env, encoding: "utf8" }).trim();
  execFileSync("git", ["-C", b.dir, "checkout", "-qb", "feat", b.sha], { env: f.env });
  fs.writeFileSync(path.join(b.dir, "feat.txt"), "feat\n");
  execFileSync("git", ["-C", b.dir, "add", "feat.txt"], { env: f.env });
  execFileSync("git", ["-C", b.dir, "commit", "-qm", "feat commit"], { env: f.env });
  const featSha = execFileSync("git", ["-C", b.dir, "rev-parse", "HEAD"], { env: f.env, encoding: "utf8" }).trim();
  execFileSync("git", ["-C", b.dir, "checkout", "-q", initialBranch], { env: f.env });
  fs.writeFileSync(path.join(b.dir, "main-only.txt"), "main only\n");
  execFileSync("git", ["-C", b.dir, "add", "main-only.txt"], { env: f.env });
  execFileSync("git", ["-C", b.dir, "commit", "-qm", "main-only commit"], { env: f.env });

  const recordPath = path.join(f.repo, f.record);
  let text = fs.readFileSync(recordPath, "utf8");
  text = text.replace(/^Artifact: .*$/m, `Artifact: territory/a@${featSha}`);
  text = text.replace(/^Worktree: \.$/m, `Artifact-repo: ${bDirPosix}\nWorktree: ${bDirPosix}`);
  fs.writeFileSync(recordPath, text);
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: featSha });
    assert.fail("expected checkAcceptance to throw: featSha is not an ancestor of Worktree:'s HEAD in repo B");
  } catch (error) {
    assert.match(error.message, /sha-not-in-git/);
    assert.equal(error.code, "sha-not-in-git");
  }
});

// Review r3 (spec.md item 3, "Worktree: must then be an absolute directory ... in that repo"): a
// Worktree: directory in a separate clone of Artifact-repo: refuses in both modes; a linked
// worktree of Artifact-repo: itself (same git-common-dir) is still accepted.
test("checkAcceptance: r3 - a Worktree: directory outside the Artifact-repo: repository refuses; its linked worktree passes", () => {
  const f = makeAcceptanceFixture();
  const b = makeArtifactRepoFixture(f.env);
  const cDir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-artifact-repo-clone-"));
  execFileSync("git", ["clone", "-q", b.dir, cDir], { env: f.env });
  const linked = path.join(fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-artifact-repo-linked-")), "wt");
  execFileSync("git", ["-C", b.dir, "worktree", "add", "-q", "--detach", linked, b.sha], { env: f.env });
  const toPosix = (p) => p.split(path.sep).join("/");
  const recordPath = path.join(f.repo, f.record);
  const base = fs.readFileSync(recordPath, "utf8").replace(/^Artifact: .*$/m, `Artifact: territory/a@${b.sha}`);
  fs.writeFileSync(path.join(f.repo, f.evidence), `VERDICT: APPROVE — ${b.sha}\nIndependent review of a cross-repo artifact.\n`);
  const withWorktree = (dir) => fs.writeFileSync(recordPath, base.replace(/^Worktree: \.$/m, `Artifact-repo: ${toPosix(b.dir)}\nWorktree: ${toPosix(dir)}`));
  withWorktree(cDir);
  for (const opts of [{ pinnedArtifact: b.sha }, { deliveryRef: b.sha }]) {
    assert.throws(
      () => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, ...opts }),
      (error) => error.code === "sha-not-in-git" && /is not a worktree of Artifact-repo:/.test(error.message),
    );
  }
  withWorktree(linked);
  assert.equal(checkAcceptance({ repoRoot: f.repo, recordPath: f.record, deliveryRef: b.sha }).ok, true);
});

// ── Lane 60b review round 1 (ruling-r1.md): F1-F5, all adopted ─────────────────────────────

// F2 (MEDIUM): a bare repository is not "a directory inside a git worktree" - live mode's
// freshness check means nothing when no working tree ever exists, so it must refuse, not accept.
test("checkAcceptance: F2 - a bare Artifact-repo: (git clone --bare) refuses sha-not-in-git", () => {
  const f = makeAcceptanceFixture();
  const b = makeArtifactRepoFixture(f.env);
  const bareDir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-artifact-repo-bare-"));
  execFileSync("git", ["clone", "-q", "--bare", b.dir, bareDir], { env: f.env });
  const barePosix = bareDir.split(path.sep).join("/");
  const recordPath = path.join(f.repo, f.record);
  let text = fs.readFileSync(recordPath, "utf8");
  text = text.replace(/^Artifact: .*$/m, `Artifact: territory/a@${b.sha}`);
  const initialBranch = execFileSync("git", ["-C", b.dir, "symbolic-ref", "--short", "HEAD"], { env: f.env, encoding: "utf8" }).trim();
  text = text.replace(/^Worktree: \.$/m, `Artifact-repo: ${barePosix}\nWorktree: ${initialBranch}`);
  fs.writeFileSync(recordPath, text);
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: b.sha });
    assert.fail("expected checkAcceptance to throw: Artifact-repo: is a bare repository");
  } catch (error) {
    assert.match(error.message, /sha-not-in-git/);
    assert.equal(error.code, "sha-not-in-git");
  }
});

// F3 (MINOR): an unreadable --repo common dir must fail closed (never "assume different"),
// the same fail-closed contract gitCommonDirReal already documents for every other caller.
test("checkAcceptance: F3 - a --repo that is not itself a git repository refuses artifact-repo-same, never accepts", () => {
  const f = makeAcceptanceFixture();
  const b = makeArtifactRepoFixture(f.env);
  const bDirPosix = b.dir.split(path.sep).join("/");
  const recordPath = path.join(f.repo, f.record);
  let text = fs.readFileSync(recordPath, "utf8");
  text = text.replace(/^Artifact: .*$/m, `Artifact: territory/a@${b.sha}`);
  text = text.replace(/^Worktree: \.$/m, `Artifact-repo: ${bDirPosix}\nWorktree: ${bDirPosix}`);
  fs.writeFileSync(recordPath, text);
  fs.writeFileSync(path.join(f.repo, f.evidence), `VERDICT: APPROVE — ${b.sha}\nIndependent review of a cross-repo artifact.\n`);
  // Strip --repo's own .git so it is no longer readable as a git repository at all.
  fs.rmSync(path.join(f.repo, ".git"), { recursive: true, force: true });
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: b.sha });
    assert.fail("expected checkAcceptance to throw: --repo is not a readable git repository");
  } catch (error) {
    assert.equal(error.code, "artifact-repo-same");
  }
});

// F4 (MEDIUM), mutant M3: the same-repository check must compare git-common-dir realpaths, not
// a literal path.resolve() string - both a symlink to repo A and a linked worktree of repo A
// must still be caught as "the same repository".
test("checkAcceptance: F4/M3 - a symlink to --repo, and a linked worktree of --repo, both refuse artifact-repo-same", () => {
  const f = makeAcceptanceFixture();
  const symlinkDir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-artifact-repo-symlink-"));
  fs.rmSync(symlinkDir, { recursive: true, force: true });
  fs.symlinkSync(f.repo, symlinkDir, "dir");
  const worktreeParent = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-artifact-repo-wt-"));
  const worktreeDir = path.join(worktreeParent, "linked");
  execFileSync("git", ["-C", f.repo, "worktree", "add", "-q", "-b", "f4-wt-branch", worktreeDir, f.sha], { env: f.env });
  for (const target of [symlinkDir, worktreeDir]) {
    const recordPath = path.join(f.repo, f.record);
    let text = fs.readFileSync(recordPath, "utf8");
    text = text.replace(/^Artifact-repo: .*\n/m, "");
    text = text.replace(/^Worktree: .*$/m, `Artifact-repo: ${target.split(path.sep).join("/")}\nWorktree: .`);
    fs.writeFileSync(recordPath, text);
    try {
      checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
      assert.fail(`expected checkAcceptance to throw for ${target}: it is the same repository as --repo`);
    } catch (error) {
      assert.equal(error.code, "artifact-repo-same", `expected artifact-repo-same for ${target}, got ${error.code}: ${error.message}`);
    }
  }
});

// F4 (MEDIUM), mutant M4: Worktree: as a branch NAME must resolve inside Artifact-repo:, not
// repoRoot - test 1 above only ever names Worktree: as a directory, so this is the only proof
// that a branch-name Worktree: also honors Artifact-repo:.
test("checkAcceptance: F4/M4 - Worktree: given as a branch name resolves inside Artifact-repo:, not --repo", () => {
  const f = makeAcceptanceFixture();
  const b = makeArtifactRepoFixture(f.env);
  const bDirPosix = b.dir.split(path.sep).join("/");
  const bBranch = execFileSync("git", ["-C", b.dir, "symbolic-ref", "--short", "HEAD"], { env: f.env, encoding: "utf8" }).trim();
  const recordPath = path.join(f.repo, f.record);
  let text = fs.readFileSync(recordPath, "utf8");
  text = text.replace(/^Artifact: .*$/m, `Artifact: territory/a@${b.sha}`);
  // repoRoot (repo A) has no branch named bBranch (main/master collision aside, repo A's
  // default branch name may coincide - so make repo A's default branch diverge from b.sha to
  // prove resolution truly happened in repo B, not by accident in repo A).
  fs.writeFileSync(path.join(f.repo, "unrelated.txt"), "unrelated\n");
  execFileSync("git", ["-C", f.repo, "add", "unrelated.txt"], { env: f.env });
  execFileSync("git", ["-C", f.repo, "commit", "-qm", "unrelated commit, moves repo A HEAD past b.sha"], { env: f.env });
  text = text.replace(/^Worktree: \.$/m, `Artifact-repo: ${bDirPosix}\nWorktree: ${bBranch}`);
  fs.writeFileSync(recordPath, text);
  fs.writeFileSync(path.join(f.repo, f.evidence), `VERDICT: APPROVE — ${b.sha}\nIndependent review of a cross-repo artifact.\n`);
  const result = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: b.sha });
  assert.equal(result.ok, true);
  assert.equal(result.artifact, b.sha);
});

// T1 required item 2 ("branch or worktree") / round-2 review MAJOR 4: Worktree: must
// also accept a local branch name, not only a filesystem path - SKILL.md and the spec
// both say "branch", and this build's own territory worktrees live outside the repo, so
// a repo-relative path can't name them either.
// The repo's own HEAD is moved forward past f.sha BEFORE feat-branch is created at f.sha, so a
// variant that resolves Worktree:'s branch name by reading repoRoot's HEAD instead of
// refs/heads/<name> (round-2 review MINOR 3 / mutant M6) is distinguishable from the real
// refs/heads/ lookup: live mode requires the resolved Worktree: HEAD to equal the delivered
// artifact exactly, and only the real branch-ref lookup gives that after HEAD has moved on.
test("checkAcceptance: Worktree: accepts a local branch name (not only a filesystem path), even after repo HEAD has moved past it", () => {
  const f = makeAcceptanceFixture();
  fs.writeFileSync(path.join(f.repo, "later.txt"), "later\n");
  execFileSync("git", ["-C", f.repo, "add", "later.txt"], { env: f.env });
  execFileSync("git", ["-C", f.repo, "commit", "-qm", "later"], { env: f.env });
  execFileSync("git", ["-C", f.repo, "branch", "feat-branch", f.sha], { env: f.env });
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace("Worktree: .", "Worktree: feat-branch"));
  const result = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, deliveryRef: "feat-branch" });
  assert.equal(result.ok, true);
});

test("checkAcceptance: a Worktree: value that is neither a resolvable path nor a local branch name still fails closed", () => {
  const f = makeAcceptanceFixture();
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace("Worktree: .", "Worktree: does-not-exist-anywhere"));
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
    assert.fail("expected checkAcceptance to throw for a name that is neither a path nor a branch");
  } catch (error) {
    assert.match(error.message, /sha-not-in-git/);
    assert.equal(error.code, "sha-not-in-git");
  }
});

// --- acceptRecord / `accept` (T1 required item 1) -----------------------------------

// End-to-end tie between acceptRecord's real output and validateRecord's tripwire: a
// record accepted through code, with an Opened: date on/after the cutoff, must never
// trip accepted-without-check.
test("acceptRecord's real output never trips accepted-without-check, even opened on/after the cutoff", () => {
  const f = makeAcceptanceFixture();
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace("Opened: 2026-09-23T12:00:00Z", "Opened: 2026-09-25T09:00:00Z"));
  acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, now: new Date("2026-09-24T10:00:00Z"), noCensusReason: "pre-census fixture, unrelated to this test" });
  const updated = fs.readFileSync(recordPath, "utf8");
  const parsed = parseRecord(updated);
  assert.ok(!codes(validateRecord(parsed, { repoRoot: f.repo })).includes("accepted-without-check"));
});

test("acceptRecord: accepts with a passing check, flips Status: reviewed -> accepted, and appends an accepted Log line", () => {
  const f = makeAcceptanceFixture();
  const result = acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, now: new Date("2026-09-24T10:00:00Z"), noCensusReason: "pre-census fixture, unrelated to this test" });
  assert.equal(result.ok, true);
  assert.equal(result.work, "wr-2026-09-23-acceptance");
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Status: accepted$/m);
  assert.ok(!/^Status: reviewed$/m.test(updated), "the old Status: reviewed line must be gone, not merely joined by a new one");
  assert.match(updated, /^Log: 2026-09-24T10:00:00\.000Z accepted lead artifact [0-9a-f]{40}$/m);
  const parsed = parseRecord(updated);
  assert.equal(parsed.fields.status, "accepted");
  assert.equal(parsed.errors.length, 0);
});

test("acceptRecord: refused on a bad verdict line, and the record file is left byte-for-byte unchanged", () => {
  const f = makeAcceptanceFixture();
  fs.writeFileSync(path.join(f.repo, f.evidence), "VERDICT: PASS\nNot a deciding verdict.\n");
  const recordPath = path.join(f.repo, f.record);
  const before = fs.readFileSync(recordPath);
  assert.throws(
    () => acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, noCensusReason: "pre-census fixture, unrelated to this test" }),
    /no evidence has an exact APPROVE verdict/,
  );
  assert.deepEqual(fs.readFileSync(recordPath), before);
});

test("acceptRecord: refused on a sha git does not have (sha-not-in-git), and the record file is left byte-for-byte unchanged", () => {
  const f = makeAcceptanceFixture();
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(
    recordPath,
    text.replace(/Artifact: territory\/a@[0-9a-f]+/, "Artifact: territory/a@deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"),
  );
  const before = fs.readFileSync(recordPath);
  try {
    acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, noCensusReason: "pre-census fixture, unrelated to this test" });
    assert.fail("expected acceptRecord to throw for an Artifact sha git does not have");
  } catch (error) {
    assert.equal(error.code, "sha-not-in-git");
  }
  assert.deepEqual(fs.readFileSync(recordPath), before);
});

test("acceptRecord: refused on an unresolvable Worktree: path, and the record file is left byte-for-byte unchanged", () => {
  const f = makeAcceptanceFixture();
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace("Worktree: .", "Worktree: does-not-exist-anywhere"));
  const before = fs.readFileSync(recordPath);
  try {
    acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, noCensusReason: "pre-census fixture, unrelated to this test" });
    assert.fail("expected acceptRecord to throw for an unresolvable worktree path");
  } catch (error) {
    assert.equal(error.code, "sha-not-in-git");
  }
  assert.deepEqual(fs.readFileSync(recordPath), before);
});

test("acceptRecord: there is no bypass - every option is forwarded to checkAcceptance, so a caller cannot skip it with an extra or renamed flag", () => {
  const f = makeAcceptanceFixture();
  fs.writeFileSync(path.join(f.repo, f.evidence), "VERDICT: NEEDS_FIXES\nRefused.\n");
  const recordPath = path.join(f.repo, f.record);
  const before = fs.readFileSync(recordPath);
  assert.throws(
    () => acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, force: true, skipChecks: true, noCensusReason: "pre-census fixture, unrelated to this test" }),
    /no evidence has an exact APPROVE verdict/,
  );
  assert.deepEqual(fs.readFileSync(recordPath), before);
});

test("`accept` CLI: emits the pinned success JSON with a path, and mutates the record on disk to accepted", () => {
  const f = makeAcceptanceFixture();
  const stdout = execFileSync(process.execPath, [
    fileURLToPath(new URL("./work-record.mjs", import.meta.url)), "accept",
    "--record", f.record, "--repo", f.repo, "--pinned-artifact", f.sha,
    "--no-census", "pre-census fixture, unrelated to this test",
  ], { env: childEnv(fs.mkdtempSync(path.join(os.tmpdir(), "work-record-cli-home-"))), encoding: "utf8" });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.work, "wr-2026-09-23-acceptance");
  assert.ok(typeof parsed.path === "string" && parsed.path.length > 0);
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Status: accepted$/m);
});

test("`accept` CLI: a failing check exits non-zero, reports the reason on stderr, and never touches the record", () => {
  const f = makeAcceptanceFixture();
  fs.writeFileSync(path.join(f.repo, f.evidence), "VERDICT: PASS\nNot a deciding verdict.\n");
  const recordPath = path.join(f.repo, f.record);
  const before = fs.readFileSync(recordPath);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-cli-home-"));
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./work-record.mjs", import.meta.url)), "accept",
    "--record", f.record, "--repo", f.repo, "--pinned-artifact", f.sha,
    "--no-census", "pre-census fixture, unrelated to this test",
  ], { env: childEnv(home), encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no evidence has an exact APPROVE verdict/);
  assert.deepEqual(fs.readFileSync(recordPath), before);
});

// T1 round-2 review, MINOR 3: CLI failure output must carry the finding code, not just
// a message string a caller has to pattern-match by hand.
test("acceptanceMain: stderr output is prefixed with the finding code in brackets", () => {
  const stdout = [];
  const stderr = [];
  const io = { stdout: { write: (s) => stdout.push(s) }, stderr: { write: (s) => stderr.push(s) } };
  const f = makeAcceptanceFixture();
  fs.writeFileSync(path.join(f.repo, f.evidence), "VERDICT: PASS\nNot a deciding verdict.\n");
  const code = acceptanceMain([
    "accept", "--record", f.record, "--repo", f.repo, "--pinned-artifact", f.sha,
    "--no-census", "pre-census fixture, unrelated to this test",
  ], io);
  assert.equal(code, 1);
  assert.match(stderr.join(""), /^work-record: \[acceptance-failed\] no evidence has an exact APPROVE verdict/);
});

// T1 round-2 review, MINOR 4: an edit that lands between checkAcceptance's read and the
// write must be caught, not silently accepted.
test("acceptRecord: refuses when the record changes between checkAcceptance's read and the write (TOCTOU)", () => {
  const f = makeAcceptanceFixture();
  const recordPath = path.join(f.repo, f.record);
  const before = fs.readFileSync(recordPath);
  const realFsImpl = fs;
  let readCount = 0;
  const racingFsImpl = {
    ...realFsImpl,
    readFileSync: (p, enc) => {
      const out = realFsImpl.readFileSync(p, enc);
      if (p === recordPath || (typeof p === "string" && path.resolve(p) === path.resolve(recordPath))) {
        readCount += 1;
        // After checkAcceptance's own internal read (the 1st), but before acceptRecord's
        // pre-check read completes, an external edit lands - simulated by mutating the
        // real file on disk right after the very first read of the record.
        if (readCount === 1) {
          fs.writeFileSync(recordPath, out.replace("Next: run strict acceptance", "Next: something else entirely"));
        }
      }
      return out;
    },
  };
  try {
    acceptRecord({ repoRoot: f.repo, recordPath: f.record, fsImpl: racingFsImpl, pinnedArtifact: f.sha, noCensusReason: "pre-census fixture, unrelated to this test" });
    assert.fail("expected acceptRecord to throw: the record changed mid-acceptance");
  } catch (error) {
    assert.match(error.message, /record changed during acceptance/);
  }
});

// T1/C2 round-2 review, MINOR 5: the --census file is read once by checkAcceptance (for
// census-stale) and again, independently, by acceptRecord (to build the copy and the
// Census: lines). If the file's bytes change in between, the stored copy and the
// written Census: lines must not silently come from bytes that never passed
// census-stale at all - the second read must be compared against the first.
test("acceptRecord: refuses when the --census file's bytes change between checkAcceptance's read and acceptRecord's own read (TOCTOU on the census file)", () => {
  const f = makeAcceptanceFixture();
  withReviewedLog(f, "2026-09-23T13:00:00Z");
  const censusPath = makeCensusFixture({ lastAt: "2026-09-24T09:00:00Z" });
  const realFsImpl = fs;
  let censusReadCount = 0;
  const racingFsImpl = {
    ...realFsImpl,
    readFileSync: (p, enc) => {
      const out = realFsImpl.readFileSync(p, enc);
      if (typeof p === "string" && path.resolve(p) === path.resolve(censusPath)) {
        censusReadCount += 1;
        // After checkAcceptance's own read (the 1st), the census file changes on disk
        // before acceptRecord's own, separate read of the same path.
        if (censusReadCount === 1) {
          fs.writeFileSync(censusPath, out.replace("42", "999"));
        }
      }
      return out;
    },
  };
  try {
    acceptRecord({ repoRoot: f.repo, recordPath: f.record, fsImpl: racingFsImpl, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected acceptRecord to throw census-stale: the census file changed mid-acceptance");
  } catch (error) {
    assert.equal(error.code, "census-stale");
  }
  // Refused, so the record must be untouched and no copy written.
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.ok(!/^Status: accepted$/m.test(updated));
});

test("acceptanceMain: an unrecognized command is refused, not silently treated as check-acceptance", () => {
  const stdout = [];
  const stderr = [];
  const io = { stdout: { write: (s) => stdout.push(s) }, stderr: { write: (s) => stderr.push(s) } };
  const code = acceptanceMain(["approve", "--record", "x", "--repo", "y"], io);
  assert.equal(code, 1);
  assert.equal(stdout.length, 0);
  assert.match(stderr.join(""), /expected command: check-acceptance or accept/);
});

// --- census (C2, "acceptance requires the census") ----------------------------------

test("isCensusFile: recognises the VERDICT: COUNTED header line, and refuses a file lacking it (not parsed loosely)", () => {
  assert.equal(isCensusFile("VERDICT: COUNTED 3 lead turns, 1 subagent files\n\n# Build census\n"), true);
  assert.equal(isCensusFile("# Build census\n\nno header line here\n"), false);
  assert.equal(isCensusFile(""), false);
});

test("extractCensusSummary: copies bullets, leadTurns/wall-clock lines, and by-model/by-role tables verbatim, in file order", () => {
  const censusPath = makeCensusFixture();
  const text = fs.readFileSync(censusPath, "utf8");
  const summary = extractCensusSummary(text);
  assert.ok(summary.includes("- leadTurns: **42**"));
  assert.ok(summary.includes("- wall clock: **1h 12m**"));
  assert.ok(summary.some((l) => l.includes("Lead tokens by model")));
  assert.ok(summary.some((l) => l.includes("| claude-opus-4 | 1000 | 200 | 300 | 400 |")));
  assert.ok(summary.some((l) => l === "### By role"));
  assert.ok(summary.some((l) => l.includes("| build:T1 | 20 |")));
  // Never the full per-file subagent listing or the VERDICT line itself - only the
  // named summary categories (by model, by role, leadTurns, wall clock).
  assert.ok(!summary.some((l) => l.startsWith("VERDICT:")));
});

// T1/C2 round-2 review, MAJOR 1: an earlier version globally deduped every copied line,
// which silently emptied a second by-model table whenever its rows happened to match an
// earlier table's rows (a whole-file table and a windowed table over identical data, for
// example), and skipped every summary bullet that wasn't wrapped in `**`. Neither is
// acceptable: "copied faithfully" must hold even when two tables' rows collide, and a
// differently formatted (non-bold) summary line must not be silently dropped.
test("extractCensusSummary: a second table with identical rows to an earlier one is copied whole (not dropped as a duplicate), and a non-bold summary bullet is copied too", () => {
  const text = [
    "VERDICT: COUNTED 3 lead turns, 1 subagent files",
    "",
    "### Lead tokens by model — whole file",
    "",
    "| model | input |",
    "|---|---|",
    "| claude-opus-4 | 1000 |",
    "",
    "### Lead tokens by model — window (deduped)",
    "",
    "| model | input |",
    "|---|---|",
    "| claude-opus-4 | 1000 |",
    "",
    "- by-model: claude-sonnet-5=380",
    "- by-role: build=11, review=4",
    "",
  ].join("\n");
  const summary = extractCensusSummary(text);
  const wholeFileRows = summary.filter((l) => l === "| claude-opus-4 | 1000 |").length;
  assert.equal(wholeFileRows, 2, "expected both tables' identical rows to be present, not deduped away");
  assert.ok(summary.some((l) => l === "### Lead tokens by model — whole file"));
  assert.ok(summary.some((l) => l === "### Lead tokens by model — window (deduped)"));
  assert.ok(summary.includes("- by-model: claude-sonnet-5=380"), "expected a non-bold summary bullet to be copied too");
  assert.ok(summary.includes("- by-role: build=11, review=4"));
});

test("extractCensusTimestamp: reads the leadLastMessageAt field on the census's header line, or null when it's absent", () => {
  const censusPath = makeCensusFixture({ lastAt: "2026-09-24T10:12:00Z" });
  assert.equal(extractCensusTimestamp(fs.readFileSync(censusPath, "utf8")), Date.parse("2026-09-24T10:12:00Z"));
  assert.equal(extractCensusTimestamp("no timestamps in here"), null);
});

// T1/C2 fix round, MAJOR C2: the old implementation scanned the WHOLE report text for
// the latest ISO-8601-looking substring anywhere, so a --role-map label formatted like a
// timestamp (a role literally named `review-2026-09-26T00:00:00Z`, exactly skills-a's
// independent CLI probe) got read as "the census timestamp" instead of the real one.
// The fixed version reads ONLY the leadLastMessageAt field on line 1 - this pins that a
// later-looking string anywhere else in the report (a role name, a table cell, a path)
// is never picked up instead.
test("extractCensusTimestamp: a role label formatted like a future ISO timestamp elsewhere in the report never rescues the real leadLastMessageAt — skills-a MAJOR C2 probe", () => {
  const text = [
    "VERDICT: COUNTED 1 lead requests (leadTurns 1), 1 subagent files, leadLastMessageAt: 2026-09-25T07:00:00.000Z",
    "",
    "# Build census",
    "",
    "- leadTurns: 1",
    "",
    "Roles: review-2026-09-26T00:00:00Z=1",
    "",
    "| file | role | turns |",
    "|---|---|---|",
    "| agent-role.jsonl | review-2026-09-26T00:00:00Z | 1 |",
    "",
  ].join("\n");
  assert.equal(
    extractCensusTimestamp(text),
    Date.parse("2026-09-25T07:00:00.000Z"),
    "the role label's embedded future date must never be read as the census timestamp",
  );
});

test("extractCensusTimestamp: a leadLastMessageAt field anywhere but line 1 is ignored - a header without it fails closed", () => {
  const text = [
    "VERDICT: COUNTED 1 lead requests (leadTurns 1), 0 subagent files",
    "",
    "- note: leadLastMessageAt: 2099-01-01T00:00:00Z",
  ].join("\n");
  assert.equal(extractCensusTimestamp(text), null);
});

test("checkAcceptance: census-stale still fires when a --role-map-style label elsewhere in the report is formatted like a LATER timestamp — skills-a MAJOR C2 probe, end to end", () => {
  const f = makeAcceptanceFixture();
  withReviewedLog(f, "2026-09-25T08:00:30Z"); // the record's real last review
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-census-"));
  const censusPath = path.join(dir, "census.md");
  // leadLastMessageAt genuinely predates the review (stale) - but a role label
  // elsewhere in the same file carries a LATER, purely textual "timestamp".
  fs.writeFileSync(censusPath, [
    "VERDICT: COUNTED 1 lead requests (leadTurns 1), 1 subagent files, leadLastMessageAt: 2026-09-25T07:00:00.000Z",
    "",
    "# Build census",
    "",
    "- leadTurns: 1",
    "",
    "Roles: review-2026-09-26T00:00:00Z=1",
    "",
    "| file | role | turns |",
    "|---|---|---|",
    "| agent-role.jsonl | review-2026-09-26T00:00:00Z | 1 |",
    "",
  ].join("\n"));
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected checkAcceptance to throw census-stale despite the future-looking role label");
  } catch (error) {
    assert.equal(error.code, "census-stale", `expected census-stale, got [${error.code}] ${error.message}`);
  }
  try {
    acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected acceptRecord to throw census-stale despite the future-looking role label");
  } catch (error) {
    assert.equal(error.code, "census-stale");
  }
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.ok(!/^Status: accepted$/m.test(updated), "a stale census must never flip Status: to accepted");
});

// ── census-incomplete (T1/C2 fix round, item 1's other half) ─────────────────────────

test("isIncompleteCensus: true only for an '- INCOMPLETE:' Summary bullet, not for the word appearing in unrelated prose", () => {
  assert.equal(isIncompleteCensus(["- leadTurns: 1", "- INCOMPLETE: 1 subagent directory unreadable"]), true);
  assert.equal(isIncompleteCensus(["- leadTurns: 1", "- by-role: review=1"]), false);
  assert.equal(isIncompleteCensus([]), false);
});

test("checkAcceptance/acceptRecord: census-incomplete refuses a census whose Summary carries an INCOMPLETE bullet (a default subagent dir could not be enumerated)", () => {
  const f = makeAcceptanceFixture();
  withReviewedLog(f, "2026-09-23T13:00:00Z");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-census-"));
  const censusPath = path.join(dir, "census.md");
  fs.writeFileSync(censusPath, [
    "VERDICT: COUNTED 1 lead requests (leadTurns 1), 0 subagent files (1 directory UNREADABLE — census INCOMPLETE), leadLastMessageAt: 2026-09-24T09:00:00.000Z",
    "",
    "# Build census",
    "",
    "- leadTurns: 1",
    "- subagentFiles: 0",
    "- INCOMPLETE: 1 subagent director(y) unreadable (`/no/such/dir`) — subagent and combined totals exclude them",
    "",
  ].join("\n"));
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected checkAcceptance to throw census-incomplete");
  } catch (error) {
    assert.equal(error.code, "census-incomplete", `expected census-incomplete, got [${error.code}] ${error.message}`);
  }
  try {
    acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected acceptRecord to throw census-incomplete");
  } catch (error) {
    assert.equal(error.code, "census-incomplete");
  }
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.ok(!/^Status: accepted$/m.test(updated), "an INCOMPLETE census must never flip Status: to accepted");
  // The explicit escape still works: --no-census accepts visibly unmeasured.
  const skipped = acceptRecord({
    repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha,
    noCensusReason: "census reported INCOMPLETE — default subagent dir unreadable, accepting unmeasured",
    now: new Date("2026-09-24T10:00:00Z"),
  });
  assert.equal(skipped.ok, true);
});

// Genuine end-to-end wiring: build-census.mjs's own output for a directory it could not
// enumerate is refused by work-record.mjs's accept --census, without any hand-written
// census text standing in for the real script.
test("end to end: build-census.mjs's own INCOMPLETE output (EACCES on a default subagent dir) is refused by accept --census with census-incomplete", async () => {
  const buildCensus = await import("./build-census.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-e2e-incomplete-"));
  const leadPath = path.join(dir, "permission.jsonl");
  fs.writeFileSync(
    leadPath,
    JSON.stringify({ type: "assistant", requestId: "p", timestamp: "2026-09-24T09:00:00.000Z", message: { id: "p", model: "m", usage: { input_tokens: 1, output_tokens: 1 } } }) + "\n",
  );
  const defaultDir = path.join(dir, "permission", "subagents");
  fs.mkdirSync(defaultDir, { recursive: true });
  fs.writeFileSync(
    path.join(defaultDir, "agent-existing.jsonl"),
    JSON.stringify({ type: "assistant", requestId: "s", timestamp: "2026-09-24T09:01:00.000Z", message: { id: "s", model: "m", usage: { input_tokens: 1, output_tokens: 1 } } }) + "\n",
  );
  const real = fs;
  const deniedFsImpl = {
    readdirSync: (p, ...rest) => {
      if (path.resolve(p) === path.resolve(defaultDir)) throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      return real.readdirSync(p, ...rest);
    },
    statSync: (...a) => real.statSync(...a),
    writeFileSync: (...a) => real.writeFileSync(...a),
    createReadStream: (...a) => real.createReadStream(...a),
    readFileSync: (...a) => real.readFileSync(...a),
    realpathSync: (...a) => real.realpathSync(...a),
  };
  const report = await buildCensus.runCensus({ lead: leadPath, tasksDirs: [] }, deniedFsImpl);
  assert.equal(report.subagents.incomplete, true);
  const censusPath = path.join(dir, "census.md");
  fs.writeFileSync(censusPath, buildCensus.formatText(report));

  const f = makeAcceptanceFixture();
  withReviewedLog(f, "2026-09-23T13:00:00Z");
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected checkAcceptance to throw census-incomplete against build-census.mjs's real INCOMPLETE output");
  } catch (error) {
    assert.equal(error.code, "census-incomplete", `expected census-incomplete, got [${error.code}] ${error.message}`);
  }
});

test("acceptRecord: refuses with census-missing when neither --census nor --no-census is given", () => {
  const f = makeAcceptanceFixture();
  try {
    acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
    assert.fail("expected acceptRecord to throw census-missing");
  } catch (error) {
    assert.equal(error.code, "census-missing");
  }
});

test("acceptRecord: refuses with census-missing when both --census and --no-census are given", () => {
  const f = makeAcceptanceFixture();
  const censusPath = makeCensusFixture();
  try {
    acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath, noCensusReason: "both given" });
    assert.fail("expected acceptRecord to throw census-missing");
  } catch (error) {
    assert.equal(error.code, "census-missing");
  }
});

test("acceptRecord: refuses with census-missing when --no-census carries an empty or whitespace-only reason", () => {
  const f = makeAcceptanceFixture();
  for (const reason of ["", "   ", "\t"]) {
    try {
      acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, noCensusReason: reason });
      assert.fail("expected acceptRecord to throw census-missing for an empty --no-census reason");
    } catch (error) {
      assert.equal(error.code, "census-missing");
    }
  }
});

test("acceptRecord: --no-census writes the reason visibly into a Census: line, and the record is otherwise accepted normally", () => {
  const f = makeAcceptanceFixture();
  const result = acceptRecord({
    repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha,
    now: new Date("2026-09-24T10:00:00Z"), noCensusReason: "build-census.mjs crashed on a truncated transcript",
  });
  assert.equal(result.ok, true);
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Census: skipped — build-census\.mjs crashed on a truncated transcript$/m);
  const parsed = parseRecord(updated);
  assert.deepEqual(parsed.census, ["skipped — build-census.mjs crashed on a truncated transcript"]);
});

// T1/C2 round-2 review, MINOR 6: a reason containing a newline must be collapsed to one
// line, not just trimmed at the ends - otherwise it injects a second header line (or ends
// the header early), corrupting every later parse of this record.
test("acceptRecord: a --no-census reason containing a newline is collapsed to a single line, not written as-is", () => {
  const f = makeAcceptanceFixture();
  const result = acceptRecord({
    repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha,
    now: new Date("2026-09-24T10:00:00Z"), noCensusReason: "a\nb",
  });
  assert.equal(result.ok, true);
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Census: skipped — a b$/m);
  const parsed = parseRecord(updated);
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.census, ["skipped — a b"]);
});

test("acceptRecord: a --census file lacking the recognised header refuses with census-missing (not parsed loosely)", () => {
  const f = makeAcceptanceFixture();
  const censusPath = makeCensusFixture({ recognized: false });
  try {
    acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected acceptRecord to throw census-missing for an unrecognised census file");
  } catch (error) {
    assert.equal(error.code, "census-missing");
  }
});

test("acceptRecord: real Codex CLI PARTIAL census with unknown model attribution is refused", () => {
  const f = makeAcceptanceFixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-codex-census-"));
  const censusPath = path.join(dir, "codex.md");
  const cli = spawnSync(process.execPath, [
    fileURLToPath(new URL("./build-census.mjs", import.meta.url)),
    "--lead", fileURLToPath(new URL("./build-census.fixtures/codex-lead.jsonl", import.meta.url)),
    "--out", censusPath,
  ], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  const census = fs.readFileSync(censusPath, "utf8");
  assert.match(census, /^VERDICT: PARTIAL\b/);
  assert.match(census, /unknown model attribution/);
  try {
    acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected acceptRecord to refuse a PARTIAL Codex census");
  } catch (error) {
    assert.equal(error.code, "census-missing");
    assert.match(error.message, /does not begin with the census header line, refused/);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(f.repo, f.record), "utf8"), /^Status: accepted$/m);
});

test("acceptRecord: a legacy UNSUPPORTED census retains the explicit no-census diagnostic", () => {
  const f = makeAcceptanceFixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-codex-census-legacy-"));
  const censusPath = path.join(dir, "unsupported.md");
  fs.writeFileSync(censusPath, "VERDICT: UNSUPPORTED native coverage absent\n");
  assert.throws(
    () => acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath }),
    (error) => {
      assert.equal(error.code, "census-missing");
      assert.match(error.message, /UNSUPPORTED/);
      assert.match(error.message, /--no-census/);
      return true;
    },
  );
  assert.doesNotMatch(fs.readFileSync(path.join(f.repo, f.record), "utf8"), /^Status: accepted$/m);
});

// T1/C2 round-2 review, MINOR 4 (M9): a recognised census file that produces zero
// summary lines still writes a visible placeholder, never zero Census: lines - an
// unknown must never render as a silent, confident-looking "nothing to report".
test("acceptRecord: a recognised census file with no extractable summary lines writes the visible placeholder, not zero Census: lines", () => {
  const f = makeAcceptanceFixture();
  withReviewedLog(f, "2026-09-23T13:00:00Z");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-census-"));
  const censusPath = path.join(dir, "census.md");
  fs.writeFileSync(censusPath, "VERDICT: COUNTED 0 lead turns, 0 subagent files, leadLastMessageAt: 2026-09-24T09:00:00Z\n\nno extractable summary lines below\n");
  const result = acceptRecord({
    repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath,
    now: new Date("2026-09-24T10:00:00Z"),
  });
  assert.equal(result.ok, true);
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Census: \(census file recognized but produced no summary lines to copy\)$/m);
  const parsed = parseRecord(updated);
  assert.deepEqual(parsed.census, ["(census file recognized but produced no summary lines to copy)"]);
});

// Dedicated fixture with a Log: reviewed entry, since makeAcceptanceFixture's record
// carries none (census-stale needs the record's LAST review Log: entry to compare
// against - see work-record.mjs's lastReviewLogAt).
function withReviewedLog(f, reviewedAt) {
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  const lines = text.split(/\r?\n/);
  const blankIdx = lines.findIndex((l) => l.trim() === "");
  lines.splice(blankIdx === -1 ? lines.length : blankIdx, 0, `Log: ${reviewedAt} reviewed lead approved`);
  fs.writeFileSync(recordPath, lines.join("\n"));
}

test("acceptRecord: accepted with --census - copies summary lines under Census:, and stores the census file next to the record's evidence", () => {
  const f = makeAcceptanceFixture();
  withReviewedLog(f, "2026-09-23T13:00:00Z");
  const censusPath = makeCensusFixture({ lastAt: "2026-09-24T09:00:00Z" });
  const result = acceptRecord({
    repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath,
    now: new Date("2026-09-24T10:00:00Z"),
  });
  assert.equal(result.ok, true);
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Census: - leadTurns: \*\*42\*\*$/m);
  assert.match(updated, /^Census: - wall clock: \*\*1h 12m\*\*$/m);
  assert.match(updated, /^Census: \| build:T1 \| 20 \|$/m);
  const parsed = parseRecord(updated);
  assert.ok(parsed.census.length >= 4);
  const storedPath = path.join(f.repo, "docs", "work", "evidence", "wr-2026-09-23-acceptance-census.md");
  assert.ok(fs.existsSync(storedPath), "expected the whole census file to be stored next to the record's evidence");
  assert.equal(fs.readFileSync(storedPath, "utf8"), fs.readFileSync(censusPath, "utf8"));
});

test("checkAcceptance/acceptRecord: census-stale fires when the census file's timestamp predates the record's last review", () => {
  const f = makeAcceptanceFixture();
  withReviewedLog(f, "2026-09-24T12:00:00Z"); // reviewed AFTER the census below was produced
  const censusPath = makeCensusFixture({ lastAt: "2026-09-24T09:00:00Z" });
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected checkAcceptance to throw census-stale");
  } catch (error) {
    assert.equal(error.code, "census-stale");
  }
  try {
    acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected acceptRecord to throw census-stale");
  } catch (error) {
    assert.equal(error.code, "census-stale");
  }
  // Refused, so the record must be untouched.
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.ok(!/^Status: accepted$/m.test(updated));
});

test("checkAcceptance: census-stale does not fire when the census timestamp is at or after the record's last review", () => {
  const f = makeAcceptanceFixture();
  withReviewedLog(f, "2026-09-23T13:00:00Z"); // reviewed BEFORE the census below
  const censusPath = makeCensusFixture({ lastAt: "2026-09-24T09:00:00Z" });
  const result = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
  assert.equal(result.ok, true);
});

test("checkAcceptance: census-stale does not fire when the census timestamp exactly equals the record's last review", () => {
  const f = makeAcceptanceFixture();
  withReviewedLog(f, "2026-09-24T09:00:00Z"); // reviewed at the EXACT SAME instant as the census below
  const censusPath = makeCensusFixture({ lastAt: "2026-09-24T09:00:00Z" });
  const result = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
  assert.equal(result.ok, true);
});

// T1/C2 round-2 review, MINOR 3: lastReviewLogAt must use the record's LAST review Log:
// entry, and must fail closed (never silently skip) when any reviewed entry's `at` is
// unparseable, rather than falling back to an earlier, parseable one.
test("checkAcceptance: census-stale fires when the census falls between an earlier and a later Log: reviewed entry (the LAST review is used, not the first)", () => {
  const f = makeAcceptanceFixture();
  withReviewedLog(f, "2026-09-24T09:00:00Z"); // earlier review
  withReviewedLog(f, "2026-09-24T11:00:00Z"); // LATER review - census below predates this one
  const censusPath = makeCensusFixture({ lastAt: "2026-09-24T10:00:00Z" });
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected checkAcceptance to throw census-stale (the census predates the LAST review)");
  } catch (error) {
    assert.equal(error.code, "census-stale");
  }
});

test("checkAcceptance: census-stale fails closed when a Log: reviewed entry's `at` is unparseable, even when another reviewed entry is valid and would otherwise pass", () => {
  const f = makeAcceptanceFixture();
  withReviewedLog(f, "2026-09-23T13:00:00Z"); // valid, and BEFORE the census below - would pass alone
  withReviewedLog(f, "yesterday"); // unparseable - must not be silently skipped in favor of the valid one
  const censusPath = makeCensusFixture({ lastAt: "2026-09-24T09:00:00Z" });
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected checkAcceptance to throw census-stale on an unparseable review timestamp");
  } catch (error) {
    assert.equal(error.code, "census-stale");
    assert.match(error.message, /no comparable timestamp/);
  }
});

test("checkAcceptance: census-stale fails closed when the record has no Log: reviewed entry to compare against", () => {
  const f = makeAcceptanceFixture(); // no Log: lines at all
  const censusPath = makeCensusFixture();
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected checkAcceptance to throw census-stale on a missing review timestamp");
  } catch (error) {
    assert.equal(error.code, "census-stale");
    // T1/C2 round-2 review, MINOR 4: pin the branch this test is named for - without
    // this, `null < reviewedMs` coercing null to 0 would make the test pass for the
    // wrong reason even if the explicit `census.timestamp === null` guard were removed.
    assert.match(error.message, /no comparable timestamp/);
  }
});

test("checkAcceptance: census-stale fails closed when the census file carries no timestamp at all", () => {
  const f = makeAcceptanceFixture();
  withReviewedLog(f, "2026-09-23T13:00:00Z");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-census-"));
  const censusPath = path.join(dir, "census.md");
  fs.writeFileSync(censusPath, "VERDICT: COUNTED 1 lead turns, 0 subagent files\n\nno timestamps anywhere here\n");
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected checkAcceptance to throw census-stale on a missing census timestamp");
  } catch (error) {
    assert.equal(error.code, "census-stale");
    assert.match(error.message, /no comparable timestamp/);
  }
});

test("checkAcceptance: opts.censusPath is fully optional - every pre-census caller (no census opt at all) is unaffected", () => {
  const f = makeAcceptanceFixture();
  const result = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
  assert.equal(result.ok, true);
});

test("`accept` CLI: --census end to end - refuses census-missing without a flag, then accepts and writes Census: lines with it", () => {
  const f = makeAcceptanceFixture();
  withReviewedLog(f, "2026-09-23T13:00:00Z");
  const censusPath = makeCensusFixture({ lastAt: "2026-09-24T09:00:00Z" });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "work-record-cli-home-"));
  const refused = spawnSync(process.execPath, [
    fileURLToPath(new URL("./work-record.mjs", import.meta.url)), "accept",
    "--record", f.record, "--repo", f.repo, "--pinned-artifact", f.sha,
  ], { env: childEnv(home), encoding: "utf8" });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /\[census-missing\]/);

  const stdout = execFileSync(process.execPath, [
    fileURLToPath(new URL("./work-record.mjs", import.meta.url)), "accept",
    "--record", f.record, "--repo", f.repo, "--pinned-artifact", f.sha, "--census", censusPath,
  ], { env: childEnv(fs.mkdtempSync(path.join(os.tmpdir(), "work-record-cli-home-"))), encoding: "utf8" });
  assert.equal(JSON.parse(stdout).ok, true);
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Census: - leadTurns: \*\*42\*\*$/m);
});

// Seam S1: the acceptance section's prose must actually reproduce this build's own
// census (build-census.mjs --marker ... --out ...), not just gesture at "the lead's
// session file and the subagents dir" — a persistent lead pane with no --marker silently
// counts the WHOLE session (every prior build too), and accept --census takes that file
// just as readily as a correctly scoped one. Pinning the exact flags here so a future
// edit can't silently drop --marker (or --out) from the documented command again.
test("skills/team-build/SKILL.md: the census command in the acceptance section names build-census.mjs with --lead, --marker and --out, run after the last review's Log line", () => {
  const skillPath = fileURLToPath(new URL("../skills/team-build/SKILL.md", import.meta.url));
  const text = fs.readFileSync(skillPath, "utf8");
  const acceptanceIdx = text.indexOf("Run the census at accept time");
  assert.ok(acceptanceIdx !== -1, "expected the acceptance section's census paragraph to still be present");
  const section = text.slice(acceptanceIdx, acceptanceIdx + 800);
  assert.match(section, /build-census\.mjs/, "the paragraph must name the actual script");
  assert.match(section, /--lead\b/);
  assert.match(section, /--marker\b/, "omitting --marker is exactly S1: a persistent lead pane then counts the whole session, silently");
  assert.match(section, /--out\b/, "the census must be written to a file, since --json alone is refused by accept (census-missing)");
  assert.match(section, /Log: \.\.\. reviewed/, "the census must run after the last review's Log line lands, not in the same command as it");
  assert.match(section, /accept --census/);
});

// --- R2 item 2: Lead-session:/Spec-session:/Spec-from: -----------------------------

test("checkAcceptance: lead-session-missing fires closed when Lead-session: is absent (no override)", () => {
  const f = makeAcceptanceFixture({ "Lead-session": undefined });
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
    assert.fail("expected checkAcceptance to throw for a record with no Lead-session: field");
  } catch (error) {
    assert.match(error.message, /Lead-session/);
    assert.equal(error.code, "lead-session-missing");
  }
});

test("checkAcceptance: lead-session-missing fires when Lead-session: is a placeholder, not a real session id (M4)", () => {
  const f = makeAcceptanceFixture({ "Lead-session": "unavailable" });
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
    assert.fail("expected checkAcceptance to throw for a placeholder Lead-session:");
  } catch (error) {
    assert.equal(error.code, "lead-session-missing");
  }
});

test("checkAcceptance: lead-session-missing fires for interpolation leftovers and bracketed placeholders (M-B)", () => {
  for (const bad of ["undefined", "(none)", "missing", "<lead-session-id>"]) {
    const f = makeAcceptanceFixture({ "Lead-session": bad });
    try {
      checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
      assert.fail(`expected checkAcceptance to throw for Lead-session: ${bad}`);
    } catch (error) {
      assert.equal(error.code, "lead-session-missing", `Lead-session: ${bad} must refuse`);
    }
  }
});

test("checkAcceptance: a Lead-session: field lets an otherwise-valid record pass (no other change to the check)", () => {
  const f = makeAcceptanceFixture();
  const result = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
  assert.equal(result.ok, true);
  // Opened: is before STRICT_FROM (R1), so this fixture is non-strict and always carries
  // exactly the strict-exempt warning; Spec-session/Spec-from are otherwise valid.
  assert.equal(result.warnings.length, 1, "default fixture carries Spec-session/Spec-from, so no spec-field warning is expected");
  assert.match(result.warnings[0], /strict-exempt/);
});

test("checkAcceptance: missing Spec-session:/Spec-from: is a WARN, not a refusal", () => {
  const f = makeAcceptanceFixture({ "Spec-session": undefined, "Spec-from": undefined });
  const result = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
  assert.equal(result.ok, true, "spec fields are a WARN, never a refusal (record is non-strict)");
  assert.equal(result.warnings.length, 3);
  assert.match(result.warnings[0], /strict-exempt/);
  assert.match(result.warnings[1], /spec-session-missing/);
  assert.match(result.warnings[2], /spec-from-missing/);
});

test("checkAcceptance: Spec-session:/Spec-from: WARN also fires on a placeholder or a non-timestamp, not just absence (m1)", () => {
  const f = makeAcceptanceFixture({ "Spec-session": "unavailable", "Spec-from": "yesterday" });
  const result = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 3);
  assert.match(result.warnings[0], /strict-exempt/);
  assert.match(result.warnings[1], /spec-session-missing/);
  assert.match(result.warnings[2], /spec-from-missing/);
});

test("acceptRecord: warnings from checkAcceptance pass through unchanged (accept still succeeds and flips Status:)", () => {
  const f = makeAcceptanceFixture({ "Spec-session": undefined, "Spec-from": undefined });
  const result = acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, noCensusReason: "no census fixture in this test" });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 3);
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Status: accepted$/m);
});

test("acceptanceMain: a WARN is written to stderr, not only inside the stdout JSON, and exit code stays 0 (m2)", () => {
  const stdout = [];
  const stderr = [];
  const io = { stdout: { write: (s) => stdout.push(s) }, stderr: { write: (s) => stderr.push(s) } };
  const f = makeAcceptanceFixture({ "Spec-session": undefined, "Spec-from": undefined });
  const code = acceptanceMain([
    "accept", "--record", f.record, "--repo", f.repo, "--pinned-artifact", f.sha,
    "--no-census", "no census fixture in this test",
  ], io);
  assert.equal(code, 0);
  assert.match(stderr.join(""), /work-record: WARN spec-session-missing/);
  assert.match(stderr.join(""), /work-record: WARN spec-from-missing/);
});

// Seam-review m-B: Date.parse is lax ("0", "1", "Sep 25" all parse); Spec-from: must be
// an ISO-shaped timestamp, since --spec-from <iso> is the only value R1 ever writes here.
test("checkAcceptance: Spec-from: WARN fires on non-ISO text that Date.parse would still accept (m-B)", () => {
  for (const bad of ["0", "1", "Sep 25"]) {
    const f = makeAcceptanceFixture({ "Spec-from": bad });
    const result = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
    assert.equal(result.ok, true);
    assert.equal(result.warnings.length, 2, `Spec-from: ${bad} must WARN`);
    assert.match(result.warnings[0], /strict-exempt/);
    assert.match(result.warnings[1], /spec-from-missing/);
  }
});

// --- Seam fixes (seam-review: Base:, --at, hyphenated singleton dedup) -----------------

// Seam (four-read R1 x R2): Base: is one of four-read.mjs's record inputs (Number 3's range
// start), so a record carrying it must parse and accept - never refuse as an unknown label.
test("parseRecord: four-read's own fixture record (with Base:) parses with no errors (seam)", () => {
  const text = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "four-read", "record.md"), "utf8");
  const parsed = parseRecord(text);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.fields.base, "0000000000000000000000000000000000000000");
});

test("acceptRecord: a record carrying Base: accepts (seam: four-read's Number 3 range)", () => {
  const f = makeAcceptanceFixture({ Base: "931588a4e366e8df75ce796beb1ead161fac9693" });
  const result = acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, noCensusReason: "no census fixture in this test" });
  assert.equal(result.ok, true);
  assert.match(fs.readFileSync(path.join(f.repo, f.record), "utf8"), /^Base: 931588a4e366e8df75ce796beb1ead161fac9693$/m);
});

// MINOR 4 (seam): a duplicate hyphenated singleton label (Lead-session:, Spec-session:,
// Spec-from:) must be caught by the same duplicate-singleton check as every other label.
test("requireStrictRecordShape (via acceptRecord): a duplicate Lead-session: line refuses as a duplicate singleton field (MINOR 4, seam)", () => {
  const f = makeAcceptanceFixture();
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace(/^Lead-session:.*$/m, (line) => `${line}\n${line}`));
  assert.throws(
    () => acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, noCensusReason: "no census fixture in this test" }),
    /duplicate singleton field: leadSession/,
  );
});

// MAJOR 2 (seam): --at T is the shared timestamp four-read.mjs's --accept-at T stands in for
// at read time - accept stamps the SAME T into its accepted Log: line, so a later re-read
// against the accepted record reproduces the copied numbers instead of the accept flow
// forever writing an unavailable-only read into every accepted record.
test("acceptRecord: --at stamps the accepted Log: line at the given timestamp", () => {
  const f = makeAcceptanceFixture();
  const at = new Date(Date.now() - 60000).toISOString();
  acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, acceptAt: at, noCensusReason: "no census fixture in this test" });
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, new RegExp(`^Log: ${at} accepted `, "m"));
});

test("acceptRecord: --at refuses a timestamp earlier than the record's last Log: entry", () => {
  const f = makeAcceptanceFixture();
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace(/^(Opened:.*)$/m, "$1\nLog: 2026-09-24T00:00:00.000Z owned lead picked up the build"));
  assert.throws(
    () => acceptRecord({
      repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha,
      acceptAt: "2026-09-23T00:00:00.000Z", noCensusReason: "no census fixture in this test",
    }),
    /invalid --at/,
  );
});

test("acceptRecord: --at refuses a timestamp more than 5 minutes in the future", () => {
  const f = makeAcceptanceFixture();
  assert.throws(
    () => acceptRecord({
      repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha,
      acceptAt: new Date(Date.now() + 3600000).toISOString(), noCensusReason: "no census fixture in this test",
    }),
    /invalid --at/,
  );
});

test("acceptRecord: --at refuses a stale T more than 10 minutes old, even when it is after the record's last Log: entry (seam r2)", () => {
  const f = makeAcceptanceFixture();
  assert.throws(
    () => acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, acceptAt: new Date(Date.now() - 3600000).toISOString(), noCensusReason: "no census fixture in this test" }),
    /invalid --at/,
  );
});

test("acceptRecord: a --four-read measured to one T refuses when accept stamps another (seam r2)", () => {
  const f = makeAcceptanceFixture();
  const fourReadPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "work-record-four-read-at-")), "four-read.json");
  fs.writeFileSync(fourReadPath, JSON.stringify(fourReadFixture({ acceptAt: new Date(Date.now() - 120000).toISOString() })));
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.throws(
    () => acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, fourReadPath, noCensusReason: "no census fixture in this test" }),
    (error) => error.code === "four-read-invalid",
  );
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
});

test("acceptanceMain: --at is parsed into acceptAt (seam: shared timestamp with four-read.mjs --accept-at)", () => {
  const { command, ...opts } = parseAcceptanceArgs(["accept", "--record", "r.md", "--repo", ".", "--at", "2026-09-26T01:22:08Z"]);
  assert.equal(command, "accept");
  assert.equal(opts.acceptAt, "2026-09-26T01:22:08Z");
});

// --- R2 item 3: --four-read -----------------------------------------------------

test("acceptRecord: without --four-read the record shows 'Four numbers: not run'", () => {
  const f = makeAcceptanceFixture();
  acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, noCensusReason: "no census fixture in this test" });
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Four numbers: not run$/m);
});

// R1's real four-read.mjs output shape (24d19b6, scripts/four-read.mjs:296-309): a
// `numbers` array of exactly four { key, label, value } entries, in this fixed order.
// Seam-review B1: this file must copy THAT shape, not guess at a flat object.
function fourReadFixture(overrides = {}) {
  const base = {
    record: "docs/work/example.record.md",
    leadSession: { id: "abc", source: "record", note: "from the record's Lead-session: field" },
    numbers: [
      { key: "topTierTokensPerBuild", label: "Top-tier tokens per build", value: "123456 (cache-read 100000, cache-write 5000, input 8000, output 10456)" },
      { key: "hoursAskToAccepted", label: "Hours ask to accepted", value: "3.2h, max gap 45m at 2026-09-25T10:00:00Z" },
      { key: "reworkAfterAcceptance", label: "Rework after acceptance", value: "unavailable (no range)" },
      { key: "workLostOrStalled", label: "Work lost or stalled", value: "2 gaps over 30m" },
    ],
    companions: [],
  };
  return { ...base, ...overrides };
}

test("acceptRecord: --four-read copies R1's numbers[] entries under Four numbers:, in order", () => {
  const f = makeAcceptanceFixture();
  const fourReadPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "work-record-four-read-")), "four-read.json");
  fs.writeFileSync(fourReadPath, JSON.stringify(fourReadFixture()));
  const result = acceptRecord({
    repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha,
    noCensusReason: "no census fixture in this test", fourReadPath,
  });
  assert.equal(result.ok, true);
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Four numbers: Top-tier tokens per build: 123456 \(cache-read 100000, cache-write 5000, input 8000, output 10456\)$/m);
  assert.match(updated, /^Four numbers: Hours ask to accepted: 3\.2h, max gap 45m at 2026-09-25T10:00:00Z$/m);
  assert.match(updated, /^Four numbers: Rework after acceptance: unavailable \(no range\)$/m);
  assert.match(updated, /^Four numbers: Work lost or stalled: 2 gaps over 30m$/m);
  const parsed = parseRecord(updated);
  assert.equal(parsed.fourNumbers.length, 4);
});

test("acceptRecord: an unreadable or non-JSON --four-read path refuses with four-read-invalid, record left unchanged", () => {
  const f = makeAcceptanceFixture();
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  const badPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "work-record-four-read-bad-")), "not-json.json");
  fs.writeFileSync(badPath, "not json at all");
  try {
    acceptRecord({
      repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha,
      noCensusReason: "no census fixture in this test", fourReadPath: badPath,
    });
    assert.fail("expected acceptRecord to throw for a non-JSON --four-read path");
  } catch (error) {
    assert.equal(error.code, "four-read-invalid");
  }
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
});

// Seam-review B1 (reproduced against the old flat-object shape this file used to accept):
// a wrong-shaped --four-read file must refuse, never be silently stringified into the record.
test("acceptRecord: an old flat-object --four-read shape (not R1's numbers[]) refuses with four-read-invalid, record left unchanged", () => {
  const f = makeAcceptanceFixture();
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  const flatPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "work-record-four-read-flat-")), "flat.json");
  fs.writeFileSync(flatPath, JSON.stringify({
    "top-tier tokens per build": "123456",
    "hours ask to accepted": { value: "3.2h" },
  }));
  try {
    acceptRecord({
      repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha,
      noCensusReason: "no census fixture in this test", fourReadPath: flatPath,
    });
    assert.fail("expected acceptRecord to throw for the old flat-object shape");
  } catch (error) {
    assert.equal(error.code, "four-read-invalid");
  }
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
});

// Seam-review m-A: four rows that are shaped correctly but are not the four real
// measures (wrong/duplicate keys, or a blank label) must refuse too, not just a wrong
// overall shape.
test("acceptRecord: --four-read rows with the wrong keys, duplicate keys, or a blank label refuse with four-read-invalid", () => {
  const f = makeAcceptanceFixture();
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  for (const rows of [
    fourReadFixture().numbers.map((r) => ({ ...r, label: "" })),
    [0, 1, 2, 3].map(() => ({ key: "topTierTokensPerBuild", label: "Tokens", value: "999" })),
  ]) {
    const fourReadPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "work-record-four-read-badkeys-")), "four-read.json");
    fs.writeFileSync(fourReadPath, JSON.stringify({ ...fourReadFixture(), numbers: rows }));
    try {
      acceptRecord({
        repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha,
        noCensusReason: "no census fixture in this test", fourReadPath,
      });
      assert.fail("expected acceptRecord to throw for rows that are not the four real measures");
    } catch (error) {
      assert.equal(error.code, "four-read-invalid");
    }
  }
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
});

// M1 (twins T1/C2 round-2 MINOR 6): a four-read value must never be able to inject a
// blank line or a header-looking line into the record, which would push the Log: entry
// accept just wrote out of the header where parseRecord looks for Status:/Log:.
test("acceptRecord: a --four-read value containing embedded header-like lines cannot inject them into the record", () => {
  const f = makeAcceptanceFixture();
  const fourReadPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "work-record-four-read-inject-")), "four-read.json");
  fs.writeFileSync(fourReadPath, JSON.stringify(fourReadFixture({
    numbers: [
      { key: "topTierTokensPerBuild", label: "Top-tier tokens per build", value: "2 gaps\n\nStatus: owned\nx: y" },
      { key: "hoursAskToAccepted", label: "Hours ask to accepted", value: "3.2h" },
      { key: "reworkAfterAcceptance", label: "Rework after acceptance", value: "unavailable (no range)" },
      { key: "workLostOrStalled", label: "Work lost or stalled", value: "2 gaps over 30m" },
    ],
  })));
  acceptRecord({
    repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha,
    noCensusReason: "no census fixture in this test", fourReadPath,
  });
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  const statusLines = updated.match(/^Status:.*$/gm) ?? [];
  assert.equal(statusLines.length, 1, "exactly one Status: line");
  assert.equal(statusLines[0], "Status: accepted");
  assert.equal(parseRecord(updated).log.at(-1).status, "accepted", "the Log: accepted entry must still be inside the header parseRecord reads");
});

// --- Round 1 review, B1: R4 must judge THIS accept's --four-read, not the file's own -----
// (stale or absent) Four numbers: lines - acceptRecord only splices its Four numbers: lines
// into the record AFTER checkAcceptance passes, so at check time a Status: reviewed record
// normally carries none yet.

function withHungLog(f, at) {
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  fs.writeFileSync(recordPath, text.replace(/^(Opened:.*)$/m, `$1\nLog: ${at} owned lead the builder hung on a permission prompt, relaunched`));
}

test("acceptRecord: a hung Log: line refuses when THIS accept's --four-read reports zero Work lost or stalled (round 1 review B1)", () => {
  const f = makeAcceptanceFixture();
  withHungLog(f, "2026-09-24T00:00:00Z");
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  const fourReadPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "work-record-four-read-b1-")), "four-read.json");
  fs.writeFileSync(fourReadPath, JSON.stringify(fourReadFixture({
    numbers: fourReadFixture().numbers.map((r) => r.key === "workLostOrStalled"
      ? { ...r, value: "0 gap(s) over 30min stalled; nothing lost" }
      : r),
  })));
  try {
    acceptRecord({
      repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, now: new Date("2026-09-25T00:00:00Z"),
      noCensusReason: "no census fixture in this test", fourReadPath,
    });
    assert.fail("expected acceptRecord to throw stall-word-unexplained: --four-read reported zero against a hung line");
  } catch (error) {
    assert.equal(error.code, "stall-word-unexplained");
    assert.match(error.message, /2026-09-24T00:00:00Z/);
  }
  // Refused, so the record must be byte-unchanged - no Four numbers: line beside the hung
  // Log: line, and no Status: accepted flip.
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
});

test("acceptRecord: the same hung Log: line accepts when THIS accept's --four-read reports a non-zero Work lost or stalled (round 1 review B1)", () => {
  const f = makeAcceptanceFixture();
  withHungLog(f, "2026-09-24T00:00:00Z");
  const fourReadPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "work-record-four-read-b1-")), "four-read.json");
  fs.writeFileSync(fourReadPath, JSON.stringify(fourReadFixture({
    numbers: fourReadFixture().numbers.map((r) => r.key === "workLostOrStalled"
      ? { ...r, value: "1 gap(s) over 30min stalled; relaunched" }
      : r),
  })));
  const result = acceptRecord({
    repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, now: new Date("2026-09-25T00:00:00Z"),
    noCensusReason: "no census fixture in this test", fourReadPath,
  });
  assert.equal(result.ok, true);
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Status: accepted$/m);
  assert.match(updated, /^Four numbers: Work lost or stalled: 1 gap\(s\) over 30min stalled; relaunched$/m);
});

test("acceptRecord: without --four-read, a hung Log: line skips R4 with a warning and never refuses (accept's own 'not run' marker is never counted as a present line)", () => {
  const f = makeAcceptanceFixture();
  withHungLog(f, "2026-09-24T00:00:00Z");
  const result = acceptRecord({
    repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, now: new Date("2026-09-25T00:00:00Z"),
    noCensusReason: "no census fixture in this test",
  });
  assert.equal(result.ok, true);
  assert.ok((result.warnings ?? []).some((w) => /stall-word-check-skipped/.test(w)));
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Status: accepted$/m);
  assert.match(updated, /^Four numbers: not run$/m);
});

// TOCTOU on --four-read itself, mirroring MINOR 5's --census guard: checkAcceptance reads
// and validates this same path once (R4's stall-word check ran against those exact bytes);
// acceptRecord's own, necessarily separate read must be checked against it, not trusted a
// second time.
test("acceptRecord: refuses when the --four-read file's bytes change between checkAcceptance's read and acceptRecord's own read (TOCTOU on the four-read file)", () => {
  const f = makeAcceptanceFixture();
  const fourReadPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "work-record-four-read-toctou-")), "four-read.json");
  fs.writeFileSync(fourReadPath, JSON.stringify(fourReadFixture()));
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  const realFsImpl = fs;
  let fourReadReadCount = 0;
  const racingFsImpl = {
    ...realFsImpl,
    readFileSync: (p, enc) => {
      const out = realFsImpl.readFileSync(p, enc);
      if (typeof p === "string" && path.resolve(p) === path.resolve(fourReadPath)) {
        fourReadReadCount += 1;
        // After checkAcceptance's own read (the 1st), the four-read file changes on disk
        // before acceptRecord's own, separate read of the same path.
        if (fourReadReadCount === 1) {
          fs.writeFileSync(fourReadPath, out.replace("123456", "999999"));
        }
      }
      return out;
    },
  };
  try {
    acceptRecord({
      repoRoot: f.repo, recordPath: f.record, fsImpl: racingFsImpl, pinnedArtifact: f.sha,
      noCensusReason: "no census fixture in this test", fourReadPath,
    });
    assert.fail("expected acceptRecord to throw four-read-invalid: the four-read file changed mid-acceptance");
  } catch (error) {
    assert.equal(error.code, "four-read-invalid");
  }
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
});

// --- R2 item 4/5: GOALS.md corrections, pinned against a stale-phrase regression ---

// Seam-review M2: a single doesNotMatch on the OLD literal sentence does not fail when a
// future edit reintroduces the stale CLAIM in different words (reproduced against a
// mutation: appending a fresh sentence making the same false claims still passed the old
// single-assertion version of this test). STALE holds one regex per distinct false claim
// this build's evidence corrected, matched loosely enough to catch a reworded return of
// the same claim, and self-checked below to confirm none of them fire on the corrected
// files as they stand today.
const STALE = [
  // Claim: census-complete had nothing lost or stalled (false - 7.25h host stall).
  /nothing (?:was )?lost or stalled[^\n]{0,80}\b(?:MET|true|holds)\b/i,
  /census-complete[^\n]{0,60}no (?:stall|gap)/i,
  // Claim: loop-gates' hand-counted 7 lead turns meets the under-20 target as THE measure
  // (false - it is an unproven hand count; the script counts 32 for a different build).
  /\b7\b[^\n]{0,20}(?:lead )?turns[^\n]{0,40}\b(?:MET|under (?:the )?20)\b/i,
  // Claim: loop-gates itself has a script-measured lead-turn count (false - 32 belongs to
  // census-complete's window, not loop-gates'). Bounded to the same sentence ([^.\n], not
  // [^\n]) so a citation path like ".../wr-2026-09-24-loop-gates.record.md" sitting near an
  // unrelated, later, correctly-attributed "script count" phrase does not false-positive.
  /loop-gates[^.\n]{0,80}script counts?/i,
  /\b32\b[^.\n]{0,60}loop-gates/i,
  /loop-gates build(?:'s)? (?:is|was|had|counts?|lead turns?)[^.\n]{0,20}\b32\b/i,
  /7-turn hand count[^\n]{0,160}script counts? 32/i,
  // Claim: the 0.20.7 card-cap change was installed nowhere (false - Ben's ticks record
  // 0.20.7 and 0.20.8 each on three hosts).
  /0\.20\.7 card-cap change was installed nowhere/,
  // Claim: the census clause of DONE is met/true (false - not computable until the
  // four-number read runs).
  /census beats the hand-run build[^\n]{0,40}\b(?:MET|yes|true)\b/i,
];

test("docs/GOALS.md and docs/goals/card.md carry no phrase this build's evidence contradicts (STALE regexes, doesNotMatch)", () => {
  const goalsPath = fileURLToPath(new URL("../docs/GOALS.md", import.meta.url));
  const cardPath = fileURLToPath(new URL("../docs/goals/card.md", import.meta.url));
  const goals = fs.readFileSync(goalsPath, "utf8");
  const card = fs.readFileSync(cardPath, "utf8");
  const text = `${goals}\n${card}`;

  for (const re of STALE) {
    assert.doesNotMatch(text, re, `stale claim must not appear: ${re}`);
  }

  // The card's DONE line is the mandate's own unqualified test with numbers (M3): this
  // build's status correction lives in GOALS.md's DONE bullet, not in the card itself.
  assert.match(card, /census beats the hand-run build on all four measures\./, "DONE keeps the census clause as the test with numbers");
  assert.match(goals, /Status of DONE's census clause: not computable until the four-number read runs/, "GOALS.md states the census clause is not yet computable");

  // The corrected loop-gates/census-complete attribution must be present and distinct.
  assert.match(goals, /Loop-gates' 7 lead turns is a hand count no script has checked/, "loop-gates' hand count is stated as unproven, not corrected to 32");
  assert.match(goals, /Census-complete's script count is 32 lead turns/, "census-complete's script-measured 32 lead turns must be stated, attributed to the right build");

  // "Nothing lost or stalled" does not hold for the census-complete build itself.
  assert.match(goals, /7\.25 hour host stall/, "the census build's stall must be stated, not silently dropped");

  // M5: the 152-turn baseline and the 0.20.7 install line are corrected against the evidence.
  assert.match(goals, /152 turns \(no source record/, "the unsourced 152-turn baseline must be marked as such");
  assert.match(goals, /0\.20\.7 and 0\.20\.8 each installed on three hosts/, "the stale 'installed nowhere' line must be corrected");
});

// Mutation check (seam-review M2's own repro): appending a fresh sentence making the same
// false claims in different words must fail at least one STALE pattern, proving the list
// (not just the one literal sentence this build fixed) catches a reworded return.
test("STALE regexes: fail when a stale claim returns in different words (mutation probe)", () => {
  const mutated = "Status: MET. Nothing lost or stalled on the census-complete build; loop-gates lead turns: 7 (MET, under 20).";
  assert.ok(STALE.some((re) => re.test(mutated)), "at least one STALE pattern must catch the reworded mutation");

  // Seam-review M-A: the spec's own wrong sentence, and round-1's reworded version of it,
  // attributing loop-gates' 32 script count (false - 32 belongs to census-complete).
  for (const m of [
    "lead turns for the loop-gates build is 32 by the script (not 7 by hand)",
    "The loop-gates build's own record reported a 7-turn hand count (`docs/work/wr-2026-09-24-loop-gates.record.md`); the script counts 32 lead turns for that build's window",
  ]) assert.ok(STALE.some((re) => re.test(m)), `STALE must catch: ${m}`);
});

// --- withdraw (withdraw-status-1, W1: R1/R2) -----------------------------------------
//
// withdrawRecord needs no git fixture (no Artifact:/Worktree: check the way accept does) -
// a plain temp directory with a docs/work/*.record.md file is enough, so these tests skip
// makeAcceptanceFixture/makeGitFixtureEnv entirely.

function makeWithdrawFixture(overrides = {}, extraLines = []) {
  const repo = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-withdraw-"));
  fs.mkdirSync(path.join(repo, "docs", "work"), { recursive: true });
  const record = "docs/work/example.record.md";
  fs.writeFileSync(path.join(repo, record), mkRecordText({
    Work: "wr-2026-09-23-example",
    Status: "rejected",
    ...overrides,
  }, extraLines, "Prose body, unrelated to the withdraw call."));
  return { repo, record };
}

const WITHDRAW_ARGS = { by: "lead-session-9", at: "2026-09-26T18:00:00Z" };

test("closeRecord: accepted record closes only after its merge is on main, and writes the full merge receipt", () => {
  const f = makeAcceptanceFixture();
  acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, now: new Date("2026-09-24T10:00:00Z"), noCensusReason: "fixture" });
  const result = closeRecord({ repoRoot: f.repo, recordPath: f.record, merge: f.sha.slice(0, 12), main: "HEAD", at: "2026-09-24T10:01:00Z", now: new Date("2026-09-24T10:01:00Z") });
  assert.equal(result.status, "closed");
  assert.equal(result.merge, f.sha);
  const parsed = parseRecord(fs.readFileSync(path.join(f.repo, f.record), "utf8"));
  assert.equal(parsed.fields.status, "closed");
  assert.deepEqual(codes(validateRecord(parsed, { repoRoot: f.repo })), []);
  assert.deepEqual(parsed.log.at(-1), { at: "2026-09-24T10:01:00.000Z", status: "closed", owner: "lead", note: `merge ${f.sha}` });
});

test("closeRecord: malformed final Log timestamp refuses both stale and current closes without changing bytes", () => {
  for (const at of ["2026-09-24T10:00:00Z", "2026-09-24T11:00:00Z"]) {
    const f = makeAcceptanceFixture();
    acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, now: new Date("2026-09-24T10:00:00Z"), noCensusReason: "fixture" });
    const file = path.join(f.repo, f.record);
    const accepted = fs.readFileSync(file, "utf8");
    const corrupt = accepted.replace("\n\n", `\nLog: not-a-date accepted lead artifact ${f.sha}\n\n`);
    fs.writeFileSync(file, corrupt);
    assert.throws(() => closeRecord({ repoRoot: f.repo, recordPath: f.record, merge: f.sha, main: "HEAD", at, now: new Date("2026-09-24T11:00:00Z") }), /invalid final Log: timestamp/);
    assert.equal(fs.readFileSync(file, "utf8"), corrupt);
  }
});

test("closeRecord: rejects non-accepted, unmerged, repeated, and stale closure attempts without changing the record", () => {
  const f = makeAcceptanceFixture();
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.throws(() => closeRecord({ repoRoot: f.repo, recordPath: f.record, merge: f.sha, main: "HEAD" }), /only accepted/);
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
  acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, now: new Date("2026-09-24T10:00:00Z"), noCensusReason: "fixture" });
  assert.throws(() => closeRecord({ repoRoot: f.repo, recordPath: f.record, merge: f.sha, main: "does-not-exist", at: "2026-09-24T10:01:00Z", now: new Date("2026-09-24T10:01:00Z") }), /not an ancestor/);
  assert.throws(() => closeRecord({ repoRoot: f.repo, recordPath: f.record, merge: f.sha, main: "HEAD", now: new Date("2026-09-24T10:01:00Z") }), /--at is required/);
  closeRecord({ repoRoot: f.repo, recordPath: f.record, merge: f.sha, main: "HEAD", at: "2026-09-24T10:01:00Z", now: new Date("2026-09-24T10:01:00Z") });
  assert.throws(() => closeRecord({ repoRoot: f.repo, recordPath: f.record, merge: f.sha, main: "HEAD", at: "2026-09-24T10:01:00Z", now: new Date("2026-09-24T10:01:00Z") }), /already closed/);
  const parsed = parseCloseArgs(["close", "--record", "docs/work/a.record.md", "--repo", ".", "--merge", "abc", "--at", "2026-09-24T10:01:00Z"]);
  assert.equal(parsed.main, "origin/main");
});

// ── C1 ruling b (lane-closeout): close --closeout ───────────────────────────────────

test("parseCloseArgs: --closeout/--dry-run are bare flags, --by is a name/value pair distinct from --merge/--at", () => {
  const parsed = parseCloseArgs(["close", "--record", "docs/work/a.record.md", "--closeout", "--by", "lead-session-9", "--dry-run"]);
  assert.equal(parsed.closeout, true);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.closeoutBy, "lead-session-9");
  const withoutFlags = parseCloseArgs(["close", "--record", "docs/work/a.record.md", "--merge", "abc", "--at", "2026-09-24T10:01:00Z"]);
  assert.equal(withoutFlags.closeout, undefined);
  assert.equal(withoutFlags.dryRun, undefined);
});

test("closeoutRecord: --by is required", () => {
  const f = makeAcceptanceFixture();
  assert.throws(() => closeoutRecord({ repoRoot: f.repo, recordPath: f.record }), (err) => err.code === "by-missing");
});

// F11 (C1 round 2, MEDIUM): --by must be a single token, 1-64 non-space characters, or it is
// refused cleanly here - not left to silently produce a malformed Log: line (MALFORMED_RECORD
// downstream in the record readers).
test("closeoutRecord: --by containing whitespace is refused (by-malformed), never reaches the Log: write", () => {
  const f = makeAcceptanceFixture();
  assert.throws(
    () => closeoutRecord({ repoRoot: f.repo, recordPath: f.record, closeoutBy: "two tokens" }),
    (err) => err.code === "by-malformed",
  );
});

// L3 (C1 round 2 ruling): --by gates the WHOLE closeout, not just the scratch step - refused
// before step 1 (close) itself ever runs, on BOTH a live and a --dry-run call, with no field of
// the record touched either way.
test("closeoutRecord: L3 - a --by that does not match Lead-session: refuses all four steps before step 1 (close) ever runs, live and dry-run alike", () => {
  const f = makeAcceptanceFixture();
  acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, now: new Date("2026-09-24T10:00:00Z"), noCensusReason: "fixture" });
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  for (const dryRun of [false, true]) {
    const result = closeoutRecord({
      repoRoot: f.repo, recordPath: f.record, merge: f.sha, main: "HEAD",
      at: "2026-09-24T10:01:00Z", now: new Date("2026-09-24T10:01:00Z"),
      closeoutBy: "some-other-session", dryRun,
    });
    assert.equal(result.exitCode, 2);
    assert.equal(result.ok, false);
    assert.match(result.lines[0], /^close: refused \(--by some-other-session does not match this record's Lead-session:/);
    for (const step of ["worktree", "branch", "origin-branch", "scratch"]) {
      const row = result.steps.find((s) => s.step === step);
      assert.equal(row.result, "refused", `step ${step}`);
      assert.match(row.detail, /does not match this record's Lead-session:/, `step ${step}`);
    }
    // the record itself (Status:, every field) is completely untouched by the refused attempt:
    assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
  }
});

// L9 (C1 round 2 ruling): plain `close` (no --closeout), INCLUDING `close --dry-run`, behaves
// exactly as base, which throws on an argv it does not recognize - round 1's acceptanceMain
// silently accepted and ignored --dry-run/--by without --closeout, letting `close --dry-run`
// perform a REAL close.
test("acceptanceMain: plain 'close --dry-run' (no --closeout) is refused (closeout-flag-without-closeout), and performs no close - pins base's own throw-on-unrecognized-argv behavior", () => {
  const f = makeAcceptanceFixture();
  acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, now: new Date("2026-09-24T10:00:00Z"), noCensusReason: "fixture" });
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  const stdout = [];
  const stderr = [];
  const io = { stdout: { write: (s) => stdout.push(s) }, stderr: { write: (s) => stderr.push(s) } };
  const code = acceptanceMain([
    "close", "--record", f.record, "--repo", f.repo, "--merge", f.sha, "--main", "HEAD",
    "--at", "2026-09-24T10:01:00Z", "--dry-run",
  ], io);
  assert.equal(code, 1);
  assert.equal(stdout.length, 0);
  assert.match(stderr.join(""), /\[closeout-flag-without-closeout\]/);
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
});

test("closeoutRecord: runs the existing close, then a failed merge proof (git fetch origin fails, no origin remote) refuses every one of the four cleanup steps with the same UNVERIFIABLE reason, and still writes the closeout Log: line", () => {
  const f = makeAcceptanceFixture();
  acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, now: new Date("2026-09-24T10:00:00Z"), noCensusReason: "fixture" });
  // L3 (C1 round 2): --by must equal the record's own Lead-session: (makeAcceptanceFixture's
  // default, via mkRecordText) or the whole closeout is refused before step 1 ever runs.
  const result = closeoutRecord({
    repoRoot: f.repo, recordPath: f.record, merge: f.sha, main: "HEAD",
    at: "2026-09-24T10:01:00Z", now: new Date("2026-09-24T10:01:00Z"),
    closeoutBy: "fixture-lead-session-1",
  });
  assert.equal(result.exitCode, 2);
  assert.equal(result.ok, false);
  assert.equal(result.lines[0], "close: closed");
  for (const step of ["worktree", "branch", "origin-branch", "scratch"]) {
    const row = result.steps.find((s) => s.step === step);
    assert.equal(row.result, "refused", `step ${step}`);
    assert.match(row.detail, /UNVERIFIABLE: fetch failed/, `step ${step}`);
  }
  const parsed = parseRecord(fs.readFileSync(path.join(f.repo, f.record), "utf8"));
  assert.equal(parsed.fields.status, "closed");
  assert.equal(parsed.log.at(-1).status, "closeout");
  // F6 (C1 round 2): the Log: owner slot is the record's own Owner: ("lead", here), never the
  // closeout session id - the session id is still recorded, in the note text.
  assert.equal(parsed.log.at(-1).owner, "lead");
  assert.match(parsed.log.at(-1).note, /^by fixture-lead-session-1 /);
});

test("closeoutRecord: --dry-run on an already-closed record changes nothing on disk and reports 'close: closed (already)'", () => {
  const f = makeAcceptanceFixture();
  acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, now: new Date("2026-09-24T10:00:00Z"), noCensusReason: "fixture" });
  closeRecord({ repoRoot: f.repo, recordPath: f.record, merge: f.sha, main: "HEAD", at: "2026-09-24T10:01:00Z", now: new Date("2026-09-24T10:01:00Z") });
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  const result = closeoutRecord({
    repoRoot: f.repo, recordPath: f.record, closeoutBy: "fixture-lead-session-1", dryRun: true,
  });
  assert.equal(result.lines[0], "close: closed (already)");
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before, "--dry-run must change nothing on disk");
});

test("withdrawRecord: transition table — each of rejected/blocked/runnable/owned may be withdrawn, exactly one Log line each", () => {
  for (const status of WITHDRAWABLE_STATUSES) {
    const f = makeWithdrawFixture({ Status: status });
    const result = withdrawRecord({ repoRoot: f.repo, recordPath: f.record, reason: `closed: was ${status}`, ...WITHDRAW_ARGS });
    assert.equal(result.ok, true);
    assert.equal(result.status, "withdrawn");
    const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
    const parsed = parseRecord(updated);
    assert.equal(parsed.fields.status, "withdrawn", `${status} -> withdrawn`);
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.log.length, 1);
    assert.deepEqual(parsed.log[0], { at: "2026-09-26T18:00:00.000Z", status: "withdrawn", owner: "lead-session-9", note: `closed: was ${status}` });
  }
});

// Quoted verbatim (report evidence): the exact before/after Status: line and the exact new
// Log: line text for one transition case (rejected -> withdrawn, the dogfood's own case).
test("withdrawRecord: exact before/after Status: line and Log: line text for rejected -> withdrawn", () => {
  const f = makeWithdrawFixture({ Status: "rejected" });
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(before, /^Status: rejected$/m);
  withdrawRecord({
    repoRoot: f.repo, recordPath: f.record,
    reason: "closed without a fix round: superseded by later work", ...WITHDRAW_ARGS,
  });
  const after = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(after, /^Status: withdrawn$/m);
  assert.ok(!/^Status: rejected$/m.test(after));
  assert.match(after, /^Log: 2026-09-26T18:00:00\.000Z withdrawn lead-session-9 closed without a fix round: superseded by later work$/m);
});

test("withdrawRecord: never from accepted, refused before any write (R2)", () => {
  const f = makeWithdrawFixture({ Status: "accepted", Artifact: "territory/a@abc1234" });
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.throws(
    () => withdrawRecord({ repoRoot: f.repo, recordPath: f.record, reason: "no", ...WITHDRAW_ARGS }),
    (err) => { assert.equal(err.code, "not-withdrawable"); return true; },
  );
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before, "file must be byte-identical after a refusal");
});

test("withdrawRecord: refuses a record that is already withdrawn, and never a second time", () => {
  const f = makeWithdrawFixture({ Status: "withdrawn" });
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.throws(
    () => withdrawRecord({ repoRoot: f.repo, recordPath: f.record, reason: "again", ...WITHDRAW_ARGS }),
    (err) => { assert.equal(err.code, "already-withdrawn"); return true; },
  );
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
});

test("withdrawRecord: refuses with no --reason, and with an empty/whitespace-only --reason", () => {
  const f = makeWithdrawFixture();
  for (const reason of [undefined, "", "   "]) {
    assert.throws(
      () => withdrawRecord({ repoRoot: f.repo, recordPath: f.record, reason, ...WITHDRAW_ARGS }),
      (err) => { assert.equal(err.code, "reason-missing"); return true; },
    );
  }
});

test("withdrawRecord: requires --by and --at, as accept does", () => {
  const f = makeWithdrawFixture();
  assert.throws(
    () => withdrawRecord({ repoRoot: f.repo, recordPath: f.record, reason: "x", at: WITHDRAW_ARGS.at }),
    (err) => { assert.equal(err.code, "by-missing"); return true; },
  );
  assert.throws(
    () => withdrawRecord({ repoRoot: f.repo, recordPath: f.record, reason: "x", by: WITHDRAW_ARGS.by }),
    (err) => { assert.equal(err.code, "at-missing"); return true; },
  );
  assert.throws(
    () => withdrawRecord({ repoRoot: f.repo, recordPath: f.record, reason: "x", by: WITHDRAW_ARGS.by, at: "not-a-date" }),
    (err) => { assert.equal(err.code, "at-missing"); return true; },
  );
});

test("withdrawRecord: refuses a --by longer than the Log: owner slot (64), file unchanged", () => {
  const f = makeWithdrawFixture();
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.throws(
    () => withdrawRecord({ repoRoot: f.repo, recordPath: f.record, reason: "x", by: "s".repeat(65), at: WITHDRAW_ARGS.at }),
    (err) => { assert.equal(err.code, "by-missing"); return true; },
  );
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
});

test("withdrawRecord: refuses a non-ISO or backdated --at, file unchanged", () => {
  const f = makeWithdrawFixture();
  // "1" parses as a local date under Date.parse but has no ISO shape.
  const beforeShape = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.throws(
    () => withdrawRecord({ repoRoot: f.repo, recordPath: f.record, reason: "x", by: WITHDRAW_ARGS.by, at: "1" }),
    (err) => { assert.equal(err.code, "at-missing"); return true; },
  );
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), beforeShape);

  const g = makeWithdrawFixture({}, ["Log: 2026-09-20T00:00:00.000Z rejected lead-session-1 previous log"]);
  const beforeBackdated = fs.readFileSync(path.join(g.repo, g.record), "utf8");
  assert.throws(
    () => withdrawRecord({ repoRoot: g.repo, recordPath: g.record, reason: "x", by: WITHDRAW_ARGS.by, at: "2020-01-01T00:00:00Z" }),
    (err) => { assert.equal(err.code, "at-missing"); return true; },
  );
  assert.equal(fs.readFileSync(path.join(g.repo, g.record), "utf8"), beforeBackdated);
});

test("withdrawRecord: every non-withdrawable source status is refused, file byte-identical", () => {
  for (const status of ["delivered", "reviewed", "accepted", "not-a-status"]) {
    const f = makeWithdrawFixture({ Status: status });
    const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
    assert.throws(
      () => withdrawRecord({ repoRoot: f.repo, recordPath: f.record, reason: "no", ...WITHDRAW_ARGS }),
      (err) => { assert.equal(err.code, "not-withdrawable", status); return true; },
    );
    assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before, status);
  }
});

test("withdrawRecord: refuses --superseded-by naming a record that does not exist on disk, file unchanged", () => {
  const f = makeWithdrawFixture();
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.throws(
    () => withdrawRecord({
      repoRoot: f.repo, recordPath: f.record, reason: "x", supersededBy: "wr-2026-09-23-does-not-exist", ...WITHDRAW_ARGS,
    }),
    (err) => { assert.equal(err.code, "superseded-by-missing"); return true; },
  );
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
});

test("withdrawRecord: refuses a --superseded-by that is not a work id (path, subdirectory, or self-reference), file unchanged", () => {
  const f = makeWithdrawFixture({ Work: "wr-2026-09-26-self" });
  // Create targets so only the shape/self-reference check can be what refuses each value.
  fs.mkdirSync(path.join(f.repo, "other"), { recursive: true });
  fs.writeFileSync(
    path.join(f.repo, "other", "wr-2026-09-20-other.record.md"),
    mkRecordText({ Work: "wr-2026-09-20-other", Status: "owned" }),
  );
  fs.mkdirSync(path.join(f.repo, "docs", "work", "archive"), { recursive: true });
  fs.writeFileSync(
    path.join(f.repo, "docs", "work", "archive", "wr-2026-09-20-arch.record.md"),
    mkRecordText({ Work: "wr-2026-09-20-arch", Status: "owned" }),
  );
  fs.writeFileSync(
    path.join(f.repo, "docs", "work", "wr-2026-09-26-self.record.md"),
    mkRecordText({ Work: "wr-2026-09-26-self", Status: "owned" }),
  );
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  for (const supersededBy of [
    "../../other/wr-2026-09-20-other",
    "archive/wr-2026-09-20-arch",
    "wr-2026-09-26-self",
  ]) {
    assert.throws(
      () => withdrawRecord({ repoRoot: f.repo, recordPath: f.record, reason: "x", supersededBy, ...WITHDRAW_ARGS }),
      (err) => { assert.equal(err.code, "superseded-by-missing", supersededBy); return true; },
    );
  }
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
});

test("withdrawRecord: --superseded-by writes a Superseded-by: header that round-trips through parseRecord (R1)", () => {
  const f = makeWithdrawFixture();
  fs.writeFileSync(
    path.join(f.repo, "docs", "work", "wr-2026-09-23-instruction-consistency.record.md"),
    mkRecordText({ Work: "wr-2026-09-23-instruction-consistency", Status: "owned" }),
  );
  const result = withdrawRecord({
    repoRoot: f.repo, recordPath: f.record, reason: "superseded",
    supersededBy: "wr-2026-09-23-instruction-consistency", ...WITHDRAW_ARGS,
  });
  assert.equal(result.supersededBy, "wr-2026-09-23-instruction-consistency");
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Superseded-by: wr-2026-09-23-instruction-consistency$/m);
  const parsed = parseRecord(updated);
  assert.deepEqual(parsed.errors, [], "Superseded-by: must be a known label, not rejected by the parser");
  assert.equal(parsed.fields.supersededBy, "wr-2026-09-23-instruction-consistency");
});

test("withdrawRecord: preserves every other byte of the record (WORKAROUND lines, prose body, trailing newline)", () => {
  const f = makeWithdrawFixture({}, ["WORKAROUND: flaky ci / runner / by 2026-10-01"]);
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  withdrawRecord({ repoRoot: f.repo, recordPath: f.record, reason: "closed", ...WITHDRAW_ARGS });
  const after = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.ok(after.includes("WORKAROUND: flaky ci / runner / by 2026-10-01"));
  assert.ok(after.includes("Prose body, unrelated to the withdraw call."));
  // Only the Status: line changed and two lines (Log:, no Superseded-by: here) were added.
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  assert.equal(afterLines.length, beforeLines.length + 1, "exactly one Log: line is appended (no Superseded-by: here)");
});

test("parseWithdrawArgs: positional record path plus flag map", () => {
  const opts = parseWithdrawArgs([
    "withdraw", "docs/work/x.record.md", "--reason", "closed", "--superseded-by", "wr-y",
    "--by", "lead-1", "--at", "2026-09-26T18:00:00Z", "--repo", ".",
  ]);
  assert.deepEqual(opts, {
    command: "withdraw", recordPath: "docs/work/x.record.md", reason: "closed",
    supersededBy: "wr-y", by: "lead-1", at: "2026-09-26T18:00:00Z", repoRoot: ".",
  });
});

test("parseWithdrawArgs: refuses when argv[0] is not withdraw, or the record path is missing", () => {
  assert.throws(() => parseWithdrawArgs(["accept", "--record", "x"]));
  assert.throws(() => parseWithdrawArgs(["withdraw"]));
  assert.throws(() => parseWithdrawArgs(["withdraw", "--reason", "x"]));
});

test("acceptanceMain: withdraw dispatches end-to-end (CLI shape), writes the record and prints JSON", () => {
  const f = makeWithdrawFixture({ Status: "runnable" });
  const stdout = [];
  const stderr = [];
  const io = { stdout: { write: (s) => stdout.push(s) }, stderr: { write: (s) => stderr.push(s) } };
  const code = acceptanceMain([
    "withdraw", f.record, "--reason", "closed without a fix round", "--by", "lead-session-9",
    "--at", "2026-09-26T18:00:00Z", "--repo", f.repo,
  ], io);
  assert.equal(code, 0);
  assert.equal(stderr.length, 0);
  const printed = JSON.parse(stdout.join(""));
  assert.equal(printed.status, "withdrawn");
  assert.equal(parseRecord(fs.readFileSync(path.join(f.repo, f.record), "utf8")).fields.status, "withdrawn");
});

test("acceptanceMain: withdraw refusal (no --reason) writes stderr, exit 1, no stdout, record unchanged", () => {
  const f = makeWithdrawFixture();
  const before = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  const stdout = [];
  const stderr = [];
  const io = { stdout: { write: (s) => stdout.push(s) }, stderr: { write: (s) => stderr.push(s) } };
  const code = acceptanceMain(["withdraw", f.record, "--by", "lead-session-9", "--at", "2026-09-26T18:00:00Z", "--repo", f.repo], io);
  assert.equal(code, 1);
  assert.equal(stdout.length, 0);
  assert.match(stderr.join(""), /\[reason-missing\]/);
  assert.equal(fs.readFileSync(path.join(f.repo, f.record), "utf8"), before);
});

// ════════════════════════════════════════════════════════════════════════════════════
// measure-truth-1 (contracts.md R1-R5): STRICT_FROM cutoff, Base/Spec-session/Spec-from
// field refusals, model tokens on reviewed/APPROVE Log lines, the hung/stall/relaunch
// check, and the six real-record fixtures.
// ════════════════════════════════════════════════════════════════════════════════════

// --- R1: strict cutoff (STRICT_FROM), which defeats backdating -----------------------

test("isStrictRecord: Opened at/after STRICT_FROM is strict; before it is not (no repoRoot given - no commit to check)", () => {
  const strictRecord = parseRecord(mkRecordText({ Opened: STRICT_FROM }));
  const beforeRecord = parseRecord(mkRecordText({ Opened: "2026-09-27T08:32:14Z" }));
  assert.equal(isStrictRecord(strictRecord), true);
  assert.equal(isStrictRecord(beforeRecord), false);
});

test("isStrictRecord: opts.strictFrom overrides STRICT_FROM (tests only - no CLI flag exists)", () => {
  const record = parseRecord(mkRecordText({ Opened: "2020-01-01T00:00:00Z" }));
  assert.equal(isStrictRecord(record, { strictFrom: "2019-01-01T00:00:00Z" }), true);
  assert.equal(isStrictRecord(record, { strictFrom: "2021-01-01T00:00:00Z" }), false);
});

test("isStrictRecord: no commit yet - Opened: alone decides, and is still strict for new work", () => {
  const repo = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-strict-nocommit-"));
  const env = makeGitFixtureEnv();
  execFileSync("git", ["init", "-q", repo], { env });
  const recordRelative = "docs/work/wr-2026-09-27-uncommitted.record.md";
  fs.mkdirSync(path.join(repo, "docs", "work"), { recursive: true });
  fs.writeFileSync(path.join(repo, recordRelative), mkRecordText({ Opened: STRICT_FROM }));
  const record = parseRecord(fs.readFileSync(path.join(repo, recordRelative), "utf8"));
  assert.equal(isStrictRecord(record, { repoRoot: repo, recordPath: recordRelative }), true);
});

// Round 1 review, M2: an unparseable Opened: with no commit to fall back on is an UNKNOWN
// instant, never a known-early one - effectiveOpenedMs returns NaN, and isStrictRecord must
// treat that as strict (never as strict-exempt, and never claim "Opened before <cutoff>"
// about an instant it never actually knew).
test("isStrictRecord: an unparseable Opened: with no commit yet is strict, never exempt (round 1 review M2)", () => {
  const record = parseRecord(mkRecordText({ Opened: "soon" }));
  assert.equal(isStrictRecord(record), true);
  assert.equal(isStrictRecord(record, {}), true);
});

test("isStrictRecord: a record Opened one minute before STRICT_FROM, whose file was first committed after it, is strict (defeats backdating; spec Acceptance attack)", () => {
  const repo = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-strict-commit-"));
  const env = makeGitFixtureEnv();
  execFileSync("git", ["init", "-q", repo], { env });
  const recordRelative = "docs/work/wr-2026-09-27-strict.record.md";
  fs.mkdirSync(path.join(repo, "docs", "work"), { recursive: true });
  const oneMinuteBefore = new Date(Date.parse(STRICT_FROM) - 60000).toISOString();
  fs.writeFileSync(path.join(repo, recordRelative), mkRecordText({ Opened: oneMinuteBefore }));
  execFileSync("git", ["-C", repo, "add", recordRelative], { env });
  const commitAuthorDate = new Date(Date.parse(STRICT_FROM) + 3600000).toISOString();
  execFileSync("git", ["-C", repo, "commit", "-qm", "add record"], {
    env: { ...env, GIT_AUTHOR_DATE: commitAuthorDate, GIT_COMMITTER_DATE: commitAuthorDate },
  });
  const record = parseRecord(fs.readFileSync(path.join(repo, recordRelative), "utf8"));
  assert.equal(isStrictRecord(record, { repoRoot: repo, recordPath: recordRelative }), true);
});

test("isStrictRecord: backdating Opened: buys nothing once the file is committed after STRICT_FROM (exemption abuse; spec Acceptance attack)", () => {
  const repo = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-strict-backdate-"));
  const env = makeGitFixtureEnv();
  execFileSync("git", ["init", "-q", repo], { env });
  const recordRelative = "docs/work/wr-2020-01-01-backdated.record.md";
  fs.mkdirSync(path.join(repo, "docs", "work"), { recursive: true });
  fs.writeFileSync(path.join(repo, recordRelative), mkRecordText({ Opened: "2020-01-01T00:00:00Z" }));
  execFileSync("git", ["-C", repo, "add", recordRelative], { env });
  const commitAuthorDate = new Date(Date.parse(STRICT_FROM) + 3600000).toISOString();
  execFileSync("git", ["-C", repo, "commit", "-qm", "backdated add"], {
    env: { ...env, GIT_AUTHOR_DATE: commitAuthorDate, GIT_COMMITTER_DATE: commitAuthorDate },
  });
  const record = parseRecord(fs.readFileSync(path.join(repo, recordRelative), "utf8"));
  assert.equal(
    isStrictRecord(record, { repoRoot: repo, recordPath: recordRelative }),
    true,
    "a backdated Opened: does not exempt a record whose commit lands after STRICT_FROM",
  );
});

// Round 1 review, m3: every prior git-backed test had the commit AFTER STRICT_FROM, so a
// mutation that returns firstAddMs unconditionally (ignoring Opened: whenever a commit
// exists) still passed all of them. Here the commit is BEFORE STRICT_FROM and Opened: is
// after it - the later instant (Opened:) must win, which that mutation would get wrong.
test("isStrictRecord: Opened: after STRICT_FROM with a commit author-dated before it is still strict - the LATER instant wins, not the commit alone (round 1 review m3)", () => {
  const repo = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-strict-opened-later-"));
  const env = makeGitFixtureEnv();
  execFileSync("git", ["init", "-q", repo], { env });
  const recordRelative = "docs/work/wr-2026-09-27-opened-later.record.md";
  fs.mkdirSync(path.join(repo, "docs", "work"), { recursive: true });
  const openedAfter = new Date(Date.parse(STRICT_FROM) + 3600000).toISOString();
  fs.writeFileSync(path.join(repo, recordRelative), mkRecordText({ Opened: openedAfter }));
  execFileSync("git", ["-C", repo, "add", recordRelative], { env });
  const commitAuthorDate = new Date(Date.parse(STRICT_FROM) - 3600000).toISOString();
  execFileSync("git", ["-C", repo, "commit", "-qm", "add record, committed before Opened:"], {
    env: { ...env, GIT_AUTHOR_DATE: commitAuthorDate, GIT_COMMITTER_DATE: commitAuthorDate },
  });
  const record = parseRecord(fs.readFileSync(path.join(repo, recordRelative), "utf8"));
  assert.equal(
    isStrictRecord(record, { repoRoot: repo, recordPath: recordRelative }),
    true,
    "Opened: after STRICT_FROM must win over an earlier commit - `return firstAddMs` alone would wrongly report non-strict",
  );
});

// Round 1 review, m3: "take the earliest add-commit if there are several" was untested -
// a file added, deleted, and re-added at the same path has TWO add-commits; the earlier
// one must be the one that counts, or a re-add after STRICT_FROM could un-exempt (or,
// read the other way, a stale later re-add could wrongly exempt) a genuinely early record.
test("isStrictRecord: with several add-commits for the same path, the EARLIEST one counts (round 1 review m3)", () => {
  const repo = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-strict-readd-"));
  const env = makeGitFixtureEnv();
  execFileSync("git", ["init", "-q", repo], { env });
  const recordRelative = "docs/work/wr-2020-01-01-readded.record.md";
  fs.mkdirSync(path.join(repo, "docs", "work"), { recursive: true });
  const openedBefore = "2020-01-01T00:00:00Z";
  fs.writeFileSync(path.join(repo, recordRelative), mkRecordText({ Opened: openedBefore }));
  execFileSync("git", ["-C", repo, "add", recordRelative], { env });
  const firstAddDate = new Date(Date.parse(STRICT_FROM) - 3600000).toISOString();
  execFileSync("git", ["-C", repo, "commit", "-qm", "first add, before STRICT_FROM"], {
    env: { ...env, GIT_AUTHOR_DATE: firstAddDate, GIT_COMMITTER_DATE: firstAddDate },
  });
  execFileSync("git", ["-C", repo, "rm", "-q", recordRelative], { env });
  const removeDate = new Date(Date.parse(STRICT_FROM) + 1800000).toISOString();
  execFileSync("git", ["-C", repo, "commit", "-qm", "remove"], {
    env: { ...env, GIT_AUTHOR_DATE: removeDate, GIT_COMMITTER_DATE: removeDate },
  });
  // `git rm` removes the now-empty docs/work directory from the working tree too.
  fs.mkdirSync(path.join(repo, "docs", "work"), { recursive: true });
  fs.writeFileSync(path.join(repo, recordRelative), mkRecordText({ Opened: openedBefore }));
  execFileSync("git", ["-C", repo, "add", recordRelative], { env });
  const secondAddDate = new Date(Date.parse(STRICT_FROM) + 3600000).toISOString();
  execFileSync("git", ["-C", repo, "commit", "-qm", "re-add, after STRICT_FROM"], {
    env: { ...env, GIT_AUTHOR_DATE: secondAddDate, GIT_COMMITTER_DATE: secondAddDate },
  });
  const record = parseRecord(fs.readFileSync(path.join(repo, recordRelative), "utf8"));
  assert.equal(
    isStrictRecord(record, { repoRoot: repo, recordPath: recordRelative }),
    false,
    "the EARLIEST add-commit (before STRICT_FROM) must be the one that counts, not the later re-add",
  );
});

// --- R2: field refusals (Base always; Spec-session/Spec-from on strict records) ------

test("checkMeasureTruthRules: Base: absent or malformed refuses naming Base, strict or not", () => {
  for (const bad of [undefined, "short", "g".repeat(40), "a".repeat(39), "a".repeat(41)]) {
    const text = mkRecordText({ Opened: "2020-01-01T00:00:00Z", Base: bad });
    const record = parseRecord(text);
    assert.throws(() => checkMeasureTruthRules(text, record, {}), (e) => {
      assert.match(e.message, /Base/, `Base: ${bad} must name the field`);
      assert.equal(e.code, "base-invalid");
      return true;
    }, `Base: ${bad} must refuse`);
  }
});

test("checkMeasureTruthRules: a valid 40-hex Base: passes on a non-strict record with no other new-rule problem", () => {
  const text = mkRecordText({ Opened: "2020-01-01T00:00:00Z", Base: "a".repeat(40) });
  const record = parseRecord(text);
  const result = checkMeasureTruthRules(text, record, {});
  assert.equal(result.strict, false);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /strict-exempt/);
});

test("checkMeasureTruthRules: strict record refuses on Spec-session: absent or a placeholder", () => {
  for (const bad of [undefined, "unavailable", "tbd"]) {
    const text = mkRecordText({ Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": bad });
    const record = parseRecord(text);
    assert.throws(() => checkMeasureTruthRules(text, record, {}), (e) => {
      assert.match(e.message, /Spec-session/);
      assert.equal(e.code, "spec-session-missing");
      return true;
    }, `Spec-session: ${bad} must refuse on a strict record`);
  }
});

// Round 1 review, M2: an unparseable Opened: is strict (never exempt), so it must fall
// through to the strict-only Spec-session/Spec-from/model refusals below - not warn
// strict-exempt with a false "Opened before <cutoff>" claim.
test("checkMeasureTruthRules: an unparseable Opened: is refused on the strict fields, not warned strict-exempt (round 1 review M2)", () => {
  const text = mkRecordText({ Opened: "soon", Base: "a".repeat(40), "Spec-session": undefined });
  const record = parseRecord(text);
  assert.throws(() => checkMeasureTruthRules(text, record, {}), (e) => {
    assert.match(e.message, /Spec-session/);
    assert.equal(e.code, "spec-session-missing");
    return true;
  });
});

test("checkMeasureTruthRules: strict record refuses on Spec-from: absent or not an ISO-8601 UTC Z instant", () => {
  for (const bad of [undefined, "not-a-date", "yesterday"]) {
    const text = mkRecordText({ Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-from": bad });
    const record = parseRecord(text);
    assert.throws(() => checkMeasureTruthRules(text, record, {}), (e) => {
      assert.match(e.message, /Spec-from/);
      assert.equal(e.code, "spec-from-missing");
      return true;
    }, `Spec-from: ${bad} must refuse on a strict record`);
  }
});

test("checkMeasureTruthRules: strict record refuses Spec-from: with an offset instead of Z, and says to convert it (spec Acceptance attack)", () => {
  const text = mkRecordText({ Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-from": "2026-09-27T08:00:00-04:00" });
  const record = parseRecord(text);
  assert.throws(() => checkMeasureTruthRules(text, record, {}), (e) => {
    assert.match(e.message, /Spec-from/);
    assert.match(e.message, /convert it to UTC/);
    assert.equal(e.code, "spec-from-missing");
    return true;
  });
});

test("checkMeasureTruthRules: strict record with a real Spec-session:, a Z Spec-from:, and a satisfying reviewed line passes clean", () => {
  const text = mkRecordText(
    { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
    [`Log: ${STRICT_FROM} reviewed lead Opus APPROVE ${"b".repeat(40)}`],
  );
  const record = parseRecord(text);
  const result = checkMeasureTruthRules(text, record, {});
  assert.equal(result.strict, true);
  assert.deepEqual(result.warnings, []);
});

// --- R3: model tokens on reviewed/APPROVE Log lines -----------------------------------

test("R3: MODEL_TIER_TOKENS matches docs/model-tiers.md's own tier table (the sync)", () => {
  const mdPath = fileURLToPath(new URL("../docs/model-tiers.md", import.meta.url));
  const md = fs.readFileSync(mdPath, "utf8");
  const rows = [];
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length !== 4) continue;
    const tierMatch = /^\*\*(\w+)\*\*$/.exec(cells[0]);
    if (!tierMatch) continue;
    rows.push({ tier: tierMatch[1].toLowerCase(), claude: cells[2], openai: cells[3] });
  }
  assert.equal(rows.length, 4, "expected exactly the four tier rows (top/high/mid/fast)");
  const extractTokens = (cell) => cell.split(",").map((s) => s.replace(/\(.*?\)/g, "").trim()).filter(Boolean);
  const expected = [];
  for (const row of rows) {
    for (const token of extractTokens(row.claude)) expected.push(`${row.tier}:${token}`);
    for (const token of extractTokens(row.openai)) expected.push(`${row.tier}:${token}`);
  }
  const actual = MODEL_TIER_TOKENS.map(([tier, token]) => `${tier}:${token}`);
  assert.deepEqual(actual.slice().sort(), expected.slice().sort());
});

test("countedModelTiers: whole-word, case-insensitive, bounded by non-[A-Za-z0-9.] (claude-opus-5-5 counts as Opus)", () => {
  assert.ok(countedModelTiers("reviewed by claude-opus-5-5").has("high"));
  assert.ok(countedModelTiers("OPUS reviewer").has("high"));
  assert.equal(countedModelTiers("opusman reviewed").size, 0, "not a whole word");
  assert.equal(countedModelTiers("supersonnet reviewed").size, 0, "not a whole word");
});

test("countedModelTiers: negation - no/not/without within the two words before the token names no model (spec Acceptance attack)", () => {
  assert.equal(countedModelTiers("no Opus reviewer was used").size, 0);
  assert.equal(countedModelTiers("not Opus this time").size, 0);
  assert.equal(countedModelTiers("without Opus present").size, 0);
  assert.ok(countedModelTiers("Opus reviewer, not the builder").has("high"), "negation only looks at the two words BEFORE the token");
});

// Round 1 review, m1: a token sitting inside a compound (claude-opus-5-5) has its own
// prefix ("claude-") immediately before the match. Before the fix, that prefix was
// miscounted as a whole word of its own, which pushed the real negating word ("without"/
// "no") OUT of the two-word window - so "without the claude-opus-5-5 reviewer" wrongly
// counted as high (not negated). After the fix, the prefix is stripped before the window
// is taken, so the negating word is correctly seen and the match is negated (no tiers).
test("countedModelTiers: a compound's own prefix is not counted as one of the two negation words (round 1 review m1)", () => {
  assert.equal(countedModelTiers("without the claude-opus-5-5 reviewer").size, 0, "without correctly negates once claude- is excluded from the word window");
  assert.equal(countedModelTiers("no model: claude-opus-5-5").size, 0, "no correctly negates once model: is treated as its own word, not claude-'s");
  // Unchanged cases from the fix (still correct on both sides of the compound boundary):
  assert.ok(countedModelTiers("reviewed by claude-opus-5-5").has("high"));
  assert.equal(countedModelTiers("no Opus reviewer was used").size, 0);
  assert.ok(countedModelTiers("Opus reviewer, not the builder").has("high"));
});

test("checkMeasureTruthRules: strict record refuses a reviewed Log line with no counted model token, naming that line's timestamp", () => {
  const text = mkRecordText(
    { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
    [`Log: ${STRICT_FROM} reviewed lead APPROVE ${"b".repeat(40)}`],
  );
  const record = parseRecord(text);
  assert.throws(() => checkMeasureTruthRules(text, record, {}), (e) => {
    assert.match(e.message, new RegExp(STRICT_FROM.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(e.code, "log-model-missing");
    return true;
  });
});

test("checkMeasureTruthRules: 'no Opus reviewer was used' on a reviewed line refuses (negation attack, spec Acceptance paragraph)", () => {
  const text = mkRecordText(
    { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
    [`Log: ${STRICT_FROM} reviewed lead no Opus reviewer was used`],
  );
  const record = parseRecord(text);
  assert.throws(() => checkMeasureTruthRules(text, record, {}), (e) => {
    assert.match(e.message, /no counted model token/);
    assert.equal(e.code, "log-model-missing");
    return true;
  });
});

test("checkMeasureTruthRules: a reviewed line whose note contains SKIPPED needs no model (the loop's seam SKIPPED)", () => {
  const text = mkRecordText(
    { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
    [
      `Log: ${STRICT_FROM} reviewed lead seam SKIPPED`,
      `Log: ${STRICT_FROM} reviewed lead Opus APPROVE ${"b".repeat(40)}`,
    ],
  );
  const record = parseRecord(text);
  const result = checkMeasureTruthRules(text, record, {});
  assert.equal(result.strict, true);
});

// Seam (measure-truth-1): the build loop's own accept-prep reviewed line is a loop-accepted
// record's ONLY `reviewed` line; a strict record must pass R3 on that line alone.
for (const note of [
  `seam r1 APPROVE ${"d".repeat(40)} (Opus reviewer)`,
  "seam SKIPPED; territory reviews APPROVE (Opus reviewer)",
]) {
  test(`R3 seam: the loop's own reviewed line satisfies R3 on a strict record: ${note.slice(0, 24)}`, () => {
    const text = mkRecordText(
      { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
      [`Log: ${STRICT_FROM} reviewed lead ${note}`],
    );
    const record = parseRecord(text);
    assert.equal(checkMeasureTruthRules(text, record, {}).strict, true);
  });
}

// Round 1 review, M1: SKIPPED is the loop's own literal seam word, never one of R3's
// model tokens - it must stay case-sensitive, or a lowercase "skipped" anywhere in a
// reviewed line's note (incidental prose, not the loop's seam) would exempt a
// model-less line from R3 entirely.
test("checkMeasureTruthRules: a lowercase 'skipped' in ordinary prose does not exempt a model-less reviewed line (R3 bypass, round 1 review M1)", () => {
  const text = mkRecordText(
    { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
    [
      `Log: ${STRICT_FROM} reviewed lead D1 APPROVE ${"b".repeat(40)}, Windows suite skipped`,
      `Log: ${STRICT_FROM} reviewed lead Opus APPROVE ${"c".repeat(40)}`,
    ],
  );
  const record = parseRecord(text);
  assert.throws(() => checkMeasureTruthRules(text, record, {}), (e) => {
    assert.match(e.message, /no counted model token/);
    assert.equal(e.code, "log-model-missing");
    return true;
  });
});

// Round 1 review, M1: APPROVE is the loop's own literal verdict word, never one of R3's
// model tokens - it must stay case-sensitive, or ordinary prose using "approve" as an
// English verb would be misread as the loop's APPROVE verdict and wrongly require a model
// token on an otherwise-unrelated owned line.
test("checkMeasureTruthRules: lowercase 'approve' in ordinary prose is not read as the loop's APPROVE verdict (false refusal, round 1 review M1)", () => {
  const text = mkRecordText(
    { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
    [
      `Log: ${STRICT_FROM} owned lead waiting for Ben to approve the merge`,
      `Log: ${STRICT_FROM} reviewed lead Opus APPROVE ${"b".repeat(40)}`,
    ],
  );
  const record = parseRecord(text);
  const result = checkMeasureTruthRules(text, record, {});
  assert.equal(result.strict, true);
});

test("checkMeasureTruthRules: a delivered line whose note contains APPROVE with no model refuses (lane sixteen's shape)", () => {
  const text = mkRecordText(
    { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
    [
      `Log: ${STRICT_FROM} delivered lead D1 APPROVE ${"b".repeat(40)} (4 rounds)`,
      `Log: ${STRICT_FROM} reviewed lead Opus APPROVE ${"c".repeat(40)}`,
    ],
  );
  const record = parseRecord(text);
  assert.throws(() => checkMeasureTruthRules(text, record, {}), (e) => {
    assert.match(e.message, /no counted model token/);
    assert.equal(e.code, "log-model-missing");
    return true;
  });
});

test("checkMeasureTruthRules: the same delivered APPROVE line with a model token (Opus reviewer) passes (lane sixteen's fix)", () => {
  const text = mkRecordText(
    { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
    [
      `Log: ${STRICT_FROM} delivered lead D1 APPROVE ${"b".repeat(40)} (4 rounds, Opus reviewer)`,
      `Log: ${STRICT_FROM} reviewed lead Opus APPROVE ${"c".repeat(40)}`,
    ],
  );
  const record = parseRecord(text);
  const result = checkMeasureTruthRules(text, record, {});
  assert.equal(result.strict, true);
});

test("checkMeasureTruthRules: refuses when no reviewed line names a high/top token with APPROVE, even if every individual line passes", () => {
  const text = mkRecordText(
    { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
    [`Log: ${STRICT_FROM} reviewed lead Sonnet APPROVE ${"b".repeat(40)}`],
  );
  const record = parseRecord(text);
  assert.throws(() => checkMeasureTruthRules(text, record, {}), /no Log: reviewed line/);
});

test("checkMeasureTruthRules: old reviewed lines dated before STRICT_FROM are not re-judged", () => {
  const before = new Date(Date.parse(STRICT_FROM) - 3600000).toISOString();
  const text = mkRecordText(
    { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
    [
      `Log: ${before} reviewed lead APPROVE ${"b".repeat(40)}`,
      `Log: ${STRICT_FROM} reviewed lead Opus APPROVE ${"c".repeat(40)}`,
    ],
  );
  const record = parseRecord(text);
  const result = checkMeasureTruthRules(text, record, {});
  assert.equal(result.strict, true);
});

// Round 1 review, M3: parseRecord accepts any \S{1,64} as a Log line's `at` - an
// unparseable one used to be treated as "before STRICT_FROM" and skipped by R3 entirely.
// The other line here supplies a satisfying Opus APPROVE, so only R3's per-line model
// check on the undated line itself is under test.
test("checkMeasureTruthRules: an undated (unparseable at) reviewed/APPROVE Log line is judged by R3, never skipped (round 1 review M3)", () => {
  const text = mkRecordText(
    { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
    [
      `Log: later reviewed lead APPROVE ${"b".repeat(40)}`,
      `Log: ${STRICT_FROM} reviewed lead Opus APPROVE ${"c".repeat(40)}`,
    ],
  );
  const record = parseRecord(text);
  assert.throws(() => checkMeasureTruthRules(text, record, {}), (e) => {
    assert.match(e.message, /no counted model token/);
    assert.equal(e.code, "log-model-missing");
    return true;
  });
});

// --- R4: stall-word check (hung/stall/relaunch), every record, strict or not ----------

test("checkMeasureTruthRules: a Log: line naming hung/stall/relaunch refuses when Four numbers: Work lost or stalled is zero", () => {
  const text = mkRecordText(
    { Opened: "2020-01-01T00:00:00Z", Base: "a".repeat(40) },
    [
      "Log: 2020-01-02T00:00:00Z owned lead the builder hung on a prompt",
      "Four numbers: Work lost or stalled: 0 gaps over 30min",
    ],
  );
  const record = parseRecord(text);
  assert.throws(() => checkMeasureTruthRules(text, record, { now: new Date("2020-01-03T00:00:00Z") }), (e) => {
    assert.match(e.message, /2020-01-02T00:00:00Z/);
    assert.equal(e.code, "stall-word-unexplained");
    return true;
  });
});

test("checkMeasureTruthRules: the same Log: line passes when Four numbers: Work lost or stalled is non-zero", () => {
  const text = mkRecordText(
    { Opened: "2020-01-01T00:00:00Z", Base: "a".repeat(40) },
    [
      "Log: 2020-01-02T00:00:00Z owned lead the builder hung on a prompt, relaunched",
      "Four numbers: Work lost or stalled: 1 gap(s) over 30min",
    ],
  );
  const record = parseRecord(text);
  const result = checkMeasureTruthRules(text, record, { now: new Date("2020-01-03T00:00:00Z") });
  assert.equal(result.strict, false);
});

test("checkMeasureTruthRules: the same Log: line passes with a zero count when an unindented Stall:/Gap: body paragraph explains it", () => {
  const text = mkRecordText(
    { Opened: "2020-01-01T00:00:00Z", Base: "a".repeat(40) },
    [
      "Log: 2020-01-02T00:00:00Z owned lead the builder hung on a prompt",
      "Four numbers: Work lost or stalled: 0 gaps over 30min",
    ],
    "Observed: pending.\n\nGap: the lead was waiting on a Workflow, nothing stalled.",
  );
  const record = parseRecord(text);
  const result = checkMeasureTruthRules(text, record, { now: new Date("2020-01-03T00:00:00Z") });
  assert.equal(result.strict, false);
});

// Seam (R9): F2's real R6 line shape - only the leading N is read, never M or X.
test("R4 seam: R6's '0 gap(s) ... stalled; M waiting-on-agents (X min)' reads N=0 and refuses; unavailable wording refuses; N>0 passes", () => {
  const text = mkRecordText(
    { Opened: "2020-01-01T00:00:00Z", Base: "a".repeat(40) },
    ["Log: 2020-01-02T00:00:00Z owned lead the builder hung on a prompt"],
  );
  const record = parseRecord(text);
  const now = new Date("2020-01-03T00:00:00Z");
  const run = (v) => checkMeasureTruthRules(text, record, { now, fourNumbers: [`Work lost or stalled: ${v}`] });
  for (const v of [
    "0 gap(s) over 30min stalled; 3 waiting-on-agents (95.0 min); 0 unanswered ASKs to lead",
    "gaps unavailable (fewer than 2 lead messages in window); agent a1 silent 64.9 min from 2020-01-02T00:00:00.000Z; 0 unanswered ASKs to lead",
    "unavailable (no accepted Log: entry)",
  ]) {
    assert.throws(() => run(v), (e) => e.code === "stall-word-unexplained", v);
  }
  assert.equal(run("1 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); agent a1 silent 64.9 min from 2020-01-02T00:00:00.000Z; 0 unanswered ASKs to lead").strict, false);
});

test("checkMeasureTruthRules: no Four numbers: line at all skips the check and warns, never refuses", () => {
  const text = mkRecordText(
    { Opened: "2020-01-01T00:00:00Z", Base: "a".repeat(40) },
    ["Log: 2020-01-02T00:00:00Z owned lead the builder hung on a prompt"],
  );
  const record = parseRecord(text);
  const result = checkMeasureTruthRules(text, record, { now: new Date("2020-01-03T00:00:00Z") });
  assert.ok(result.warnings.some((w) => /stall-word-check-skipped/.test(w)));
});

test("checkMeasureTruthRules: 'installed'/'install' never match the stall-word check (must not match; spec Acceptance attack)", () => {
  const text = mkRecordText(
    { Opened: "2020-01-01T00:00:00Z", Base: "a".repeat(40) },
    [
      "Log: 2020-01-02T00:00:00Z owned lead installed the new dependency, will install more later",
      "Four numbers: Work lost or stalled: 0 gaps over 30min",
    ],
  );
  const record = parseRecord(text);
  const result = checkMeasureTruthRules(text, record, { now: new Date("2020-01-03T00:00:00Z") });
  assert.equal(result.strict, false);
});

test("checkMeasureTruthRules: R4 applies regardless of strict - a strict record with a contradicting Log line still refuses", () => {
  const text = mkRecordText(
    { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
    [
      `Log: ${STRICT_FROM} reviewed lead Opus APPROVE ${"b".repeat(40)}`,
      `Log: ${STRICT_FROM} owned lead the round stalled`,
      "Four numbers: Work lost or stalled: 0 gaps over 30min",
    ],
  );
  const record = parseRecord(text);
  assert.throws(
    () => checkMeasureTruthRules(text, record, { now: new Date(Date.parse(STRICT_FROM) + 3600000) }),
    (e) => {
      assert.match(e.message, /hung\/stall\/relaunch/);
      assert.equal(e.code, "stall-word-unexplained");
      return true;
    },
  );
});

// Round 1 review, M3: an undated (unparseable at) Log line used to fall outside the
// [Opened, accept] window automatically and skip R4 entirely - it must instead fall
// through and be judged, exactly like a dated line inside the window.
test("checkMeasureTruthRules: an undated (unparseable at) hung/stall/relaunch Log line is judged by R4, never skipped (round 1 review M3)", () => {
  const text = mkRecordText(
    { Opened: "2020-01-01T00:00:00Z", Base: "a".repeat(40) },
    [
      "Log: tonight owned lead the builder hung for 3h",
      "Four numbers: Work lost or stalled: 0 gaps over 30min",
    ],
  );
  const record = parseRecord(text);
  assert.throws(() => checkMeasureTruthRules(text, record, { now: new Date("2020-01-03T00:00:00Z") }), (e) => {
    assert.equal(e.code, "stall-word-unexplained");
    return true;
  });
});

// --- R5: fixtures from tonight's real records (contracts.md's fixture pairs) ---------

const MEASURE_TRUTH_FIXTURE_DIR = fileURLToPath(new URL("./fixtures/work-record/measure-truth/", import.meta.url));
function readMeasureTruthFixture(name) {
  return fs.readFileSync(path.join(MEASURE_TRUTH_FIXTURE_DIR, name), "utf8");
}
const INJECTED_STRICT_FROM = "2026-09-26T00:00:00Z";

test("R5 fixture: lane eleven pre-fix (2f197f1) is refused naming Spec-from, under the injected strictFrom", () => {
  const text = readMeasureTruthFixture("lane11-2f197f1.record.md");
  const record = parseRecord(text);
  assert.equal(record.errors.length, 0);
  assert.throws(() => checkMeasureTruthRules(text, record, { strictFrom: INJECTED_STRICT_FROM }), (e) => {
    assert.match(e.message, /Spec-from/);
    assert.equal(e.code, "spec-from-missing");
    return true;
  });
});

test("R5 fixture: lane eleven post-fix (65d2994) passes the new rules, under the injected strictFrom", () => {
  const text = readMeasureTruthFixture("lane11-65d2994.record.md");
  const record = parseRecord(text);
  const result = checkMeasureTruthRules(text, record, { strictFrom: INJECTED_STRICT_FROM });
  assert.equal(result.strict, true);
});

test("R5 fixture: lane fifteen pre-fix (c36e4d3) is refused naming Spec-from (the offset), under the injected strictFrom", () => {
  const text = readMeasureTruthFixture("lane15-c36e4d3.record.md");
  const record = parseRecord(text);
  assert.throws(() => checkMeasureTruthRules(text, record, { strictFrom: INJECTED_STRICT_FROM }), (e) => {
    assert.match(e.message, /Spec-from/);
    assert.equal(e.code, "spec-from-missing");
    return true;
  });
});

// Lane fifteen's fix only added the missing L1-approve Log: line; it never touched
// Spec-from, which still carries the -04:00 offset - the spec's own inconsistency,
// which contracts.md R5 corrects (spec.md item 4 says every post-fix record passes).
test("R5 fixture: lane fifteen post-fix (d0da77c) is STILL refused on Spec-from alone (contracts.md R5's correction of spec.md's own inconsistency)", () => {
  const text = readMeasureTruthFixture("lane15-d0da77c.record.md");
  const record = parseRecord(text);
  assert.throws(() => checkMeasureTruthRules(text, record, { strictFrom: INJECTED_STRICT_FROM }), (e) => {
    assert.match(e.message, /Spec-from/);
    assert.equal(e.code, "spec-from-missing");
    return true;
  });
});

// Round 1 review, m2: proves d0da77c is refused on Spec-from "alone" - substituting a
// valid Z Spec-from into the exact same bytes (nothing else touched) makes it pass, so
// Spec-from really was the only failing field.
test("R5 fixture: lane fifteen post-fix (d0da77c) passes once its Spec-from offset is converted to Z, proving Spec-from was the only failing field (round 1 review m2)", () => {
  const text = readMeasureTruthFixture("lane15-d0da77c.record.md")
    .replace("Spec-from: 2026-09-27T00:05:00-04:00", "Spec-from: 2026-09-27T04:05:00Z");
  const record = parseRecord(text);
  const result = checkMeasureTruthRules(text, record, { strictFrom: INJECTED_STRICT_FROM });
  assert.equal(result.strict, true);
  assert.deepEqual(result.warnings, []);
});

test("R5 fixture: lane fifteen's Log hung/relaunched line, with its '1 gap(s)' Four numbers line, passes R4", () => {
  const text = readMeasureTruthFixture("lane15-c36e4d3.record.md");
  const record = parseRecord(text);
  // Isolated from the separately-tested Spec-from refusal above: a far-future strictFrom
  // makes this record non-strict, so only R4 (which runs regardless of strict) is live.
  const result = checkMeasureTruthRules(text, record, { strictFrom: "2100-01-01T00:00:00Z" });
  assert.equal(result.strict, false);
});

test("R5 fixture: lane sixteen pre-fix (4e01139) is refused naming the model rule on the delivered APPROVE line", () => {
  const text = readMeasureTruthFixture("lane16-4e01139.record.md");
  const record = parseRecord(text);
  assert.throws(() => checkMeasureTruthRules(text, record, { strictFrom: INJECTED_STRICT_FROM }), (e) => {
    assert.match(e.message, /2026-09-27T07:42:29Z/);
    assert.equal(e.code, "log-model-missing");
    return true;
  });
});

test("R5 fixture: lane sixteen post-fix (9c4e1b0) passes the new rules, under the injected strictFrom", () => {
  const text = readMeasureTruthFixture("lane16-9c4e1b0.record.md");
  const record = parseRecord(text);
  const result = checkMeasureTruthRules(text, record, { strictFrom: INJECTED_STRICT_FROM });
  assert.equal(result.strict, true);
});

test("R5 fixture: under the real STRICT_FROM, all six fixtures are non-strict and print strict-exempt with no other refusal", () => {
  for (const name of [
    "lane11-2f197f1.record.md", "lane11-65d2994.record.md",
    "lane15-c36e4d3.record.md", "lane15-d0da77c.record.md",
    "lane16-4e01139.record.md", "lane16-9c4e1b0.record.md",
  ]) {
    const text = readMeasureTruthFixture(name);
    const record = parseRecord(text);
    const result = checkMeasureTruthRules(text, record, {});
    assert.equal(result.strict, false, `${name} must be non-strict under the real STRICT_FROM`);
    assert.ok(result.warnings.some((w) => /strict-exempt/.test(w)), `${name} must print strict-exempt`);
  }
});

// --- End-to-end: checkAcceptance/acceptRecord actually run these rules ---------------

// Opened after STRICT_FROM, valid Spec-session/Spec-from/Base, and a reviewed Opus
// APPROVE line by default - a strict "control" fixture so a test can flip exactly one
// field/line to prove exactly one new refusal.
function makeStrictAcceptanceFixture(overrides = {}, extraLogLines) {
  const f = makeAcceptanceFixture({
    Opened: STRICT_FROM,
    "Spec-session": "real-spec-session-1",
    "Spec-from": STRICT_FROM,
    ...overrides,
  });
  const recordPath = path.join(f.repo, f.record);
  const text = fs.readFileSync(recordPath, "utf8");
  const logLines = (extraLogLines ?? [`Log: ${STRICT_FROM} reviewed lead Opus APPROVE PLACEHOLDER_ARTIFACT`])
    .map((l) => l.replace("PLACEHOLDER_ARTIFACT", f.sha));
  const lines = text.split("\n");
  const blank = lines.findIndex((l) => l.trim() === "");
  lines.splice(blank, 0, ...logLines);
  fs.writeFileSync(recordPath, lines.join("\n"));
  return f;
}

test("checkAcceptance: a strict record with valid Spec-session/Spec-from/Base and a reviewed Opus APPROVE line passes with no measure-truth warnings", () => {
  const f = makeStrictAcceptanceFixture();
  const result = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha });
  assert.equal(result.ok, true);
  assert.equal(result.warnings, undefined);
});

test("checkAcceptance: a strict record refuses on Base: even though everything else is valid", () => {
  const f = makeStrictAcceptanceFixture({ Base: undefined });
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }), (e) => {
    assert.match(e.message, /Base/);
    assert.equal(e.code, "base-invalid");
    return true;
  });
});

test("checkAcceptance: a strict record refuses on Spec-session: even though it would only WARN pre-cutoff", () => {
  const f = makeStrictAcceptanceFixture({ "Spec-session": undefined });
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }), (e) => {
    assert.equal(e.code, "spec-session-missing");
    return true;
  });
});

test("checkAcceptance: a strict record refuses on a reviewed Log line with no model token, naming that line's timestamp", () => {
  const f = makeStrictAcceptanceFixture({}, [`Log: ${STRICT_FROM} reviewed lead APPROVE PLACEHOLDER_ARTIFACT`]);
  assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }), (e) => {
    assert.equal(e.code, "log-model-missing");
    assert.match(e.message, new RegExp(STRICT_FROM.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    return true;
  });
});

test("acceptRecord: a strict record accepts, and the accepted Log: line itself never needs a model token (it names no APPROVE)", () => {
  const f = makeStrictAcceptanceFixture();
  const result = acceptRecord({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, noCensusReason: "no census fixture in this test" });
  assert.equal(result.ok, true);
  const updated = fs.readFileSync(path.join(f.repo, f.record), "utf8");
  assert.match(updated, /^Status: accepted$/m);
});

// Lane62 (census-completeness-62, F6): Role-sessions: and Follow-up-of: are known singleton labels in
// BOTH entry paths (parseRecord and the strict accept path), not just one of them.
test("lane62 F6: parseRecord exposes roleSessions and followUpOf with no unknown-label error", () => {
  const parsed = parseRecord(mkRecordText({ "Role-sessions": "docs/work/roles.json", "Follow-up-of": "wr-2026-09-20-parent" }));
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.fields.roleSessions, "docs/work/roles.json");
  assert.equal(parsed.fields.followUpOf, "wr-2026-09-20-parent");
});

test("lane62 F6: strict acceptance accepts Role-sessions:/Follow-up-of: and refuses a duplicate of either as a singleton", () => {
  const ok = makeAcceptanceFixture({ "Role-sessions": "docs/work/roles.json", "Follow-up-of": "wr-2026-09-20-parent" });
  assert.equal(checkAcceptance({ repoRoot: ok.repo, recordPath: ok.record, pinnedArtifact: ok.sha }).ok, true);
  for (const [label, key, value] of [["Follow-up-of", "followUpOf", "wr-2026-09-20-parent"], ["Role-sessions", "roleSessions", "docs/work/roles.json"]]) {
    const f = makeAcceptanceFixture({ [label]: value });
    const recordPath = path.join(f.repo, f.record);
    fs.writeFileSync(recordPath, fs.readFileSync(recordPath, "utf8").replace(`${label}: ${value}`, `${label}: ${value}\n${label}: ${value}`));
    assert.throws(() => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha }), new RegExp(`duplicate singleton field: ${key}`));
  }
});
