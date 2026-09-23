import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { childEnv } from "../skills/multi/scripts/test-child-env.mjs";
import { STATUSES, FINDING_CODES, parseRecord, validateRecord, listRecords, formatLogLine, checkRecordSet, checkAcceptance } from "./work-record.mjs";

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
  };
  const merged = { ...defaults, ...overrides };
  const lines = Object.entries(merged)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`);
  lines.push(...extraLines);
  return [...lines, "", body].join("\n");
}

function makeAcceptanceFixture() {
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
    Next: "run strict acceptance",
    Opened: "2026-09-23T12:00:00Z",
  }, [], "Predicts: acceptance identity agrees.\nObserved: pending integration measurement."));
  return { repo, env, sha, evidence, record };
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

test("FINDING_CODES is exactly L-C6's thirteen codes (the original twelve plus runnable-with-owner)", () => {
  // Documents the full set this suite must cover; the individual tests below assert each one fires.
  assert.equal(FINDING_CODES.length, 13);
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
      "runnable-with-owner",
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
  assert.deepEqual(live, { ok: true, work: "wr-2026-09-23-acceptance", artifact: f.sha, delivery: f.sha });
  const pinned = checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha.slice(0, 10) });
  assert.equal(pinned.artifact, f.sha);
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
  assert.deepEqual(JSON.parse(stdout), { ok: true, work: "wr-2026-09-23-acceptance", artifact: f.sha, delivery: f.sha });
});

test("checkAcceptance requires a top-level Observed metadata paragraph", () => {
  const bodies = [
    "- ```markdown\n  Observed: fenced list content.\n  ```",
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
