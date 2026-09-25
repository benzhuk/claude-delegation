import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { childEnv } from "../skills/multi/scripts/test-child-env.mjs";
import {
  STATUSES, FINDING_CODES, parseRecord, validateRecord, listRecords, formatLogLine, checkRecordSet,
  checkAcceptance, acceptRecord, acceptanceMain, isCensusFile, extractCensusSummary, extractCensusTimestamp,
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
    Worktree: ".",
    Next: "run strict acceptance",
    Opened: "2026-09-23T12:00:00Z",
  }, [], "Predicts: acceptance identity agrees.\nObserved: pending integration measurement."));
  return { repo, env, sha, evidence, record };
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
        `VERDICT: COUNTED ${leadTurns} lead turns, 5 subagent files`,
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

test("FINDING_CODES is exactly L-C6's thirteen codes plus T1's accepted-without-check (fourteen total)", () => {
  // Documents the full set this suite must cover; the individual tests below assert each one fires.
  assert.equal(FINDING_CODES.length, 14);
  assert.deepEqual(
    [...FINDING_CODES].sort(),
    [
      "accepted-without-artifact",
      "accepted-without-check",
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
      ["Log: 2026-09-24T10:00:00.000Z accepted t1 artifact abcd1234abcd1234abcd1234abcd1234abcd1234"],
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

test("accepted-without-check: every record already in this repo's docs/work/ is grandfathered (zero hits)", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = path.join(repoRoot, "docs", "work");
  const hits = fs.readdirSync(dir).filter((f) => f.endsWith(".record.md")).filter((f) =>
    codes(validateRecord(parseRecord(fs.readFileSync(path.join(dir, f), "utf8")))).includes("accepted-without-check"));
  assert.deepEqual(hits, []);
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
  assert.deepEqual(JSON.parse(stdout), { ok: true, work: "wr-2026-09-23-acceptance", artifact: f.sha, delivery: f.sha });
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

test("extractCensusSummary: copies bullets, leadTurns/wall-clock lines, and by-model/by-role tables verbatim, deduped", () => {
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

test("extractCensusTimestamp: returns the latest ISO timestamp in the file, or null when none is present", () => {
  const censusPath = makeCensusFixture({ lastAt: "2026-09-24T10:12:00Z" });
  assert.equal(extractCensusTimestamp(fs.readFileSync(censusPath, "utf8")), Date.parse("2026-09-24T10:12:00Z"));
  assert.equal(extractCensusTimestamp("no timestamps in here"), null);
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

test("checkAcceptance: census-stale fails closed when the record has no Log: reviewed entry to compare against", () => {
  const f = makeAcceptanceFixture(); // no Log: lines at all
  const censusPath = makeCensusFixture();
  try {
    checkAcceptance({ repoRoot: f.repo, recordPath: f.record, pinnedArtifact: f.sha, censusPath });
    assert.fail("expected checkAcceptance to throw census-stale on a missing review timestamp");
  } catch (error) {
    assert.equal(error.code, "census-stale");
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
