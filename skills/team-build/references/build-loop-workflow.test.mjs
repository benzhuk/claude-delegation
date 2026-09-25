// Static harness for build-loop-workflow.js (L-C4, extended for one-launch-1 R1-R9).
// Follows the shape of skills/delegate/references/ladder-workflow.test.mjs (the pinned
// runtime's real precedent): reads the source as text, strips the leading `export` from
// `meta`, and wraps the body in an AsyncFunction with the runtime's real hook parameters
// (agent, parallel, pipeline, phase, log, args, budget). Never imports the script as an
// ES module — it has top-level `await` and a top-level `return`, which only a bare
// function body (not a module) can parse. The ONE child process this file spawns is the
// `node --check` parse check, built through childEnv() per N2 / addendum A2.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { mkdtempSync } from "node:fs";
import { childEnv } from "../../multi/scripts/test-child-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, "build-loop-workflow.js");
const SOURCE = readFileSync(SCRIPT_PATH, "utf8");

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// ---------------------------------------------------------------------------
// 1. the file parses (node --check, in a child via childEnv)
// ---------------------------------------------------------------------------

test("L-C4.1: the script parses under node --check", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "build-loop-check-"));
  const out = execFileSync(process.execPath, ["--check", SCRIPT_PATH], {
    encoding: "utf8",
    env: childEnv(home),
  });
  assert.equal(out, "");
});

// ---------------------------------------------------------------------------
// meta: pure literal extraction (brace-matched — meta nests objects inside `phases`, so
// a non-greedy regex would close on the first nested `}` instead of meta's own).
// ---------------------------------------------------------------------------

function extractMetaLiteral(source) {
  const marker = "export const meta = ";
  const start = source.indexOf(marker);
  assert.ok(start !== -1, "source must declare `export const meta = {...}`");
  const braceStart = source.indexOf("{", start + marker.length);
  assert.equal(
    source.slice(start + marker.length, braceStart).trim(),
    "",
    "meta must be assigned an object literal directly, nothing computed",
  );
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  throw new Error("unbalanced braces while extracting meta literal");
}

function stripLeadingExport(source) {
  assert.ok(
    source.startsWith("export const meta = "),
    "harness only knows how to strip a leading `export const meta = `",
  );
  return source.replace("export const meta = ", "const meta = ");
}

// ---------------------------------------------------------------------------
// 2. meta is a pure literal; 7. meta.phases titles equal the pinned seven, in order
// (R3/R4/R5 add Setup, Seam, Accept to the original Build, Review, Fix, Integrate).
// ---------------------------------------------------------------------------

test("L-C4.2 & L-C4.7: meta is a pure object literal; phases are {title, detail} objects titled Setup, Build, Review, Fix, Integrate, Seam, Accept in order", () => {
  const literal = extractMetaLiteral(SOURCE);
  assert.ok(!literal.includes("..."), "meta must not spread");
  assert.ok(!literal.includes("${"), "meta must not template-interpolate");
  assert.ok(!/\w\s*\(/.test(literal), "meta must not call a function");

  // Evaluate with NOTHING closed over: a reference to any outer identifier throws.
  const evalMeta = new Function(`"use strict"; return (${literal});`);
  const meta = evalMeta();

  assert.equal(typeof meta.name, "string");
  assert.ok(meta.name.length > 0);
  assert.equal(typeof meta.description, "string");
  assert.ok(meta.description.length > 0);
  assert.ok(Array.isArray(meta.phases));
  for (const p of meta.phases) {
    assert.equal(typeof p.title, "string");
    assert.equal(typeof p.detail, "string");
  }
  const titles = meta.phases.map((p) => p.title);
  assert.deepEqual(titles, ["Setup", "Build", "Review", "Fix", "Integrate", "Seam", "Accept"]);
});

// ---------------------------------------------------------------------------
// 3. banned tokens absent — each a distinct, named assertion (closes the five
// false-green holes: isolation, dynamic import(, crypto., performance., bare new Date)
// ---------------------------------------------------------------------------

test("L-C4.3: every banned token is absent from the source, each checked by name", () => {
  assert.ok(!/Date\s*\.\s*now/.test(SOURCE), "Date.now must be absent");
  assert.ok(!/Math\s*\.\s*random/.test(SOURCE), "Math.random must be absent");
  assert.ok(!/crypto\s*\./.test(SOURCE), "crypto. must be absent");
  assert.ok(!/performance\s*\./.test(SOURCE), "performance. must be absent");
  assert.ok(!/new\s+Date(?!\s*\()/.test(SOURCE), "bare `new Date` not immediately followed by `(` must be absent");
  assert.ok(!/require\s*\(/.test(SOURCE), "require( must be absent");
  assert.ok(!/\bimport\s/.test(SOURCE), "a static `import ` keyword must be absent");
  assert.ok(!/\bimport\(/.test(SOURCE), "dynamic import( must be absent");
  assert.ok(!/process\s*\./.test(SOURCE), "process. must be absent");
  assert.ok(!/\bfs\s*\./.test(SOURCE), "fs. must be absent");
  assert.ok(!/isolation/.test(SOURCE), "the literal token isolation must be absent, anywhere in the file");
});

test("bonus: the source never calls pipeline( (L-C3: not used at the territory level, or anywhere, in this script)", () => {
  assert.ok(!/\bpipeline\s*\(/.test(SOURCE), "pipeline( must not appear in the source");
});

// ---------------------------------------------------------------------------
// 4. every agent( call site carries both model: and agentType:, pair from the pinned
// list of five (builder/sonnet, reviewer/opus, integrator/sonnet, runner/sonnet used
// twice — setup and accept-prep — both pinned as the same pair).
// ---------------------------------------------------------------------------

const PINNED_PAIRS = [
  { agentType: "delegation:builder", model: "sonnet" },
  { agentType: "delegation:reviewer", model: "opus" },
  { agentType: "delegation:integrator", model: "sonnet" },
  { agentType: "delegation:runner", model: "sonnet" },
];

function findAgentCallTexts(source) {
  const calls = [];
  const re = /\bagent\(/g;
  let m;
  while ((m = re.exec(source))) {
    const openParen = m.index + m[0].length - 1;
    let depth = 0;
    let i = openParen;
    for (; i < source.length; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    calls.push(source.slice(m.index, i + 1));
  }
  return calls;
}

test("L-C4.4: every agent( call site carries a model: and an agentType: key, matching one of the pinned pairs", () => {
  const calls = findAgentCallTexts(SOURCE);
  assert.ok(calls.length >= 3, "expects at least Build, Review, and Integrate call sites");
  for (const call of calls) {
    // The call sites pass opts by variable (e.g. `agent(prompt, buildOpts1)`), not an
    // inline object literal — so scan the whole SOURCE for that opts variable's own
    // declaration instead of the call-site text itself.
    const varMatch = call.match(/,\s*(\w+)\)$/);
    let optsText = call;
    if (varMatch) {
      const declRe = new RegExp(`const\\s+${varMatch[1]}\\s*=\\s*\\{[^}]*\\}`);
      const declMatch = SOURCE.match(declRe);
      if (declMatch) optsText = declMatch[0];
    }
    const agentTypeMatch = optsText.match(/agentType:\s*['"]([^'"]+)['"]/);
    const modelMatch = optsText.match(/model:\s*['"]([^'"]+)['"]/);
    assert.ok(agentTypeMatch, `agent( call site missing agentType: — ${call.slice(0, 60)}...`);
    assert.ok(modelMatch, `agent( call site missing model: — ${call.slice(0, 60)}...`);
    const pair = { agentType: agentTypeMatch[1], model: modelMatch[1] };
    const matches = PINNED_PAIRS.some((p) => p.agentType === pair.agentType && p.model === pair.model);
    assert.ok(
      matches,
      `agent( call site pair {agentType: '${pair.agentType}', model: '${pair.model}'} is not one of the pinned pairs`,
    );
  }
  // and the integrator call is never upgraded to opus:
  const integratorPairText = SOURCE.match(/const integrateOpts = \{[^}]*\}/)[0];
  assert.ok(/model:\s*['"]sonnet['"]/.test(integratorPairText), "the integrator call must pin model: sonnet, never opus");
});

// ---------------------------------------------------------------------------
// 5. `args ?? {}` is the first statement referencing args (comments stripped first, so
// the doc comment mentioning `args` above the code doesn't count)
// ---------------------------------------------------------------------------

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

test("L-C4.5: `args ?? {}` (or `args ?? ({})`) is the first code statement referencing args", () => {
  const code = stripComments(SOURCE);
  const idx = code.search(/\bargs\b/);
  assert.ok(idx !== -1, "the code must reference args somewhere");
  const snippet = code.slice(idx, idx + 30);
  assert.ok(
    /^args\s*\?\?\s*\(?\s*\{\}\s*\)?/.test(snippet),
    `first code reference to args must be "args ?? {}" or "args ?? ({})", got: ${JSON.stringify(snippet.trim())}`,
  );
});

// ---------------------------------------------------------------------------
// 6. log( appears within 5 source lines of the literal string 'rounds-exhausted'
// ---------------------------------------------------------------------------

test("L-C4.6: log( appears within 5 source lines of the literal string 'rounds-exhausted'", () => {
  const lines = SOURCE.split("\n");
  const targetLines = [];
  lines.forEach((line, i) => {
    if (line.includes("'rounds-exhausted'")) targetLines.push(i);
  });
  assert.ok(targetLines.length > 0, "the literal string 'rounds-exhausted' must appear in the source");
  for (const t of targetLines) {
    const start = Math.max(0, t - 5);
    const end = Math.min(lines.length - 1, t + 5);
    const hasLog = lines.slice(start, end + 1).some((l) => l.includes("log("));
    assert.ok(hasLog, `no log( call within 5 source lines of 'rounds-exhausted' at line ${t + 1}`);
  }
});

// ---------------------------------------------------------------------------
// 8. each of BUILD, REVIEW, INTEGRATE, SETUP, ACCEPT_PREP appears as the schema: value
// in at least one agent( call
// ---------------------------------------------------------------------------

test("L-C4.8: BUILD, REVIEW, INTEGRATE, SETUP, and ACCEPT_PREP each appear as a schema: value in at least one agent( call", () => {
  assert.ok(/schema:\s*BUILD\b/.test(SOURCE), "schema: BUILD must appear in at least one agent( call");
  assert.ok(/schema:\s*REVIEW\b/.test(SOURCE), "schema: REVIEW must appear in at least one agent( call");
  assert.ok(/schema:\s*INTEGRATE\b/.test(SOURCE), "schema: INTEGRATE must appear in at least one agent( call");
  assert.ok(/schema:\s*SETUP\b/.test(SOURCE), "schema: SETUP must appear in at least one agent( call");
  assert.ok(/schema:\s*ACCEPT_PREP\b/.test(SOURCE), "schema: ACCEPT_PREP must appear in at least one agent( call");
});

// ---------------------------------------------------------------------------
// R9: no rendered prompt contains a note-send instruction other than the prohibition.
// ---------------------------------------------------------------------------

test("R9: every mandate constant carries the note-send prohibition", () => {
  const mandateNames = ["BUILD_MANDATE", "REVIEW_MANDATE", "INTEGRATE_MANDATE", "SETUP_MANDATE", "ACCEPT_MANDATE"];
  for (const name of mandateNames) {
    const re = new RegExp(`const ${name} =[\\s\\S]*?(?=\\nconst |\\n\\/\\/)`);
    const m = SOURCE.match(re);
    assert.ok(m, `expected to find ${name}'s declaration`);
    assert.ok(/Never send peer notes\./.test(m[0]), `${name} must carry the note-send prohibition`);
  }
});

// ---------------------------------------------------------------------------
// Behavioral harness: run the script body in an AsyncFunction with stubbed hooks
// ---------------------------------------------------------------------------

async function parallelStub(thunks) {
  return Promise.all(thunks.map((t) => t()));
}

function throwingPipelineStub() {
  throw new Error("pipeline() must never be called by build-loop-workflow.js");
}

/**
 * byLabel: { [label]: value | null | Array<value|null> } — an array is consumed one
 * entry per call to that label (sticking at the last entry once exhausted), so a test
 * can script "null, then a real value" to exercise the respawn-once path.
 */
function makeAgentStub(byLabel = {}) {
  const calls = [];
  const seenPerLabel = new Map();
  async function agentStub(prompt, opts) {
    calls.push({ prompt, opts });
    const label = opts && opts.label;
    if (!label || !Object.prototype.hasOwnProperty.call(byLabel, label)) {
      throw new Error(`unscripted agent() call for label ${label}`);
    }
    const entry = byLabel[label];
    if (Array.isArray(entry)) {
      const n = seenPerLabel.get(label) ?? 0;
      seenPerLabel.set(label, n + 1);
      return entry[Math.min(n, entry.length - 1)];
    }
    return entry;
  }
  agentStub.calls = calls;
  return agentStub;
}

function runScript(args, agentStub, { parallelImpl = parallelStub, pipelineImpl = throwingPipelineStub, logImpl } = {}) {
  const body = stripLeadingExport(SOURCE);
  const logs = [];
  const log = logImpl ?? ((msg) => logs.push(msg));
  const fn = new AsyncFunction("agent", "parallel", "pipeline", "phase", "log", "args", "budget", body);
  const resultPromise = fn(agentStub, parallelImpl, pipelineImpl, () => {}, log, args, {
    total: null,
    spent: () => 0,
    remaining: () => Infinity,
  });
  resultPromise.logs = logs;
  return resultPromise;
}

function buildResult(sha, verdict = "PASS", reportPath = `docs/work/${sha}.report.md`, note = "ok") {
  return { sha, verdict, reportPath, note };
}

function reviewResult(verdict, sha, findingsPath = null, blockerCount = 0, majorCount = 0) {
  return { verdict, sha, findingsPath, blockerCount, majorCount };
}

function integrateResult(verdict = "PASS", headSha = "headsha1", reportPath = "docs/work/integrate.report.md", failedGate = null, territory = null) {
  return { verdict, headSha, reportPath, failedGate, territory };
}

const BASE_ARGS = { specPath: "docs/specs/example/spec.md", baseSha: "cc81d0c19e910d947d640040a658b10b67a0be7f", startedAt: "2026-09-25T14:00:00Z" };

const T1 = { id: "T1", briefPath: "briefs/T1.md", worktree: "../wt-T1", branch: "feat/T1", gate: "node --test t1.test.mjs" };
const T2 = { id: "T2", briefPath: "briefs/T2.md", worktree: "../wt-T2", branch: "feat/T2", gate: "node --test t2.test.mjs" };

// ---------------------------------------------------------------------------
// R2: missing-args and mixed-territory-modes — nothing spawns.
// ---------------------------------------------------------------------------

test("R2: missing specPath/baseSha/startedAt returns missing-args and spawns nothing", async () => {
  const stub = makeAgentStub({});
  const result = await runScript({ territories: [T1] }, stub);
  assert.deepEqual(result.blockers, [{ id: "*", reason: "missing-args" }]);
  assert.equal(stub.calls.length, 0);
  assert.deepEqual(result.territories, []);
  assert.equal(result.integrator, null);
  assert.equal(result.seam, null);
  assert.equal(result.acceptance, null);
  assert.equal(result.setup, null);
});

test("R2: args entirely undefined also returns missing-args and spawns nothing", async () => {
  const stub = makeAgentStub({});
  const result = await runScript(undefined, stub);
  assert.deepEqual(result.blockers, [{ id: "*", reason: "missing-args" }]);
  assert.equal(stub.calls.length, 0);
});

test("R2: mixing a given territory with a setup territory is a launch error, nothing spawns", async () => {
  const setupTerritory = { id: "S1" };
  const stub = makeAgentStub({});
  const result = await runScript({ ...BASE_ARGS, territories: [T1, setupTerritory], integratorBriefPath: "briefs/integrator.md", reviewerBriefPath: "briefs/reviewer.md" }, stub);
  assert.deepEqual(result.blockers, [{ id: "*", reason: "mixed-territory-modes" }]);
  assert.equal(stub.calls.length, 0);
});

test("R2: a territory with only one or two of {worktree, branch, briefPath} is ambiguous, also mixed-territory-modes", async () => {
  const stub = makeAgentStub({});
  const result = await runScript({ ...BASE_ARGS, territories: [{ id: "T1", worktree: "../wt-T1" }] }, stub);
  assert.deepEqual(result.blockers, [{ id: "*", reason: "mixed-territory-modes" }]);
  assert.equal(stub.calls.length, 0);
});

// m2: startFrom is validated as part of R2's launch check, before anything spawns. The
// new reason vocabulary needs the lead's OK, so an invalid startFrom folds into the
// existing missing-args reason rather than a new 'invalid-start-from'.
test("m2: startFrom with a non-sha string (e.g. the literal 'HEAD') is a launch error, nothing spawns", async () => {
  const bad = { ...T1, startFrom: { sha: "HEAD", verdict: "APPROVE" } };
  const stub = makeAgentStub({});
  const result = await runScript({ ...BASE_ARGS, territories: [bad] }, stub);
  assert.deepEqual(result.blockers, [{ id: "*", reason: "missing-args" }]);
  assert.equal(stub.calls.length, 0);
});

test("m2: startFrom with an unrecognized verdict is a launch error, never silently runs from round 1", async () => {
  const bad = { ...T1, startFrom: { sha: "aaaaaaa1", verdict: "PENDING" } };
  const stub = makeAgentStub({});
  const result = await runScript({ ...BASE_ARGS, territories: [bad] }, stub);
  assert.deepEqual(result.blockers, [{ id: "*", reason: "missing-args" }]);
  assert.equal(stub.calls.length, 0);
});

test("m2: startFrom NEEDS_FIXES without a findingsPath is a launch error", async () => {
  const bad = { ...T1, startFrom: { sha: "aaaaaaa1", verdict: "NEEDS_FIXES" } };
  const stub = makeAgentStub({});
  const result = await runScript({ ...BASE_ARGS, territories: [bad] }, stub);
  assert.deepEqual(result.blockers, [{ id: "*", reason: "missing-args" }]);
  assert.equal(stub.calls.length, 0);
});

test("m2: startFrom on a setup territory is a launch error (R6: only valid on given territories)", async () => {
  const bad = { id: "S1", startFrom: { sha: "aaaaaaa1", verdict: "APPROVE" } };
  const stub = makeAgentStub({});
  const result = await runScript({ ...BASE_ARGS, territories: [bad] }, stub);
  assert.deepEqual(result.blockers, [{ id: "*", reason: "missing-args" }]);
  assert.equal(stub.calls.length, 0);
});

// m1: a trailing slash on integrationWorktree must never nest a setup worktree inside
// the integration worktree itself (worktreeRoot is the PARENT directory of
// integrationWorktree, per R2).
test("m1: a trailing slash on integrationWorktree does not nest the setup worktree inside it", async () => {
  const args = { ...BASE_ARGS, territories: [{ id: "L1" }], integrationWorktree: "/repo/wt-integrate/", integrationBranch: "build/x" };
  // This test only reads the rendered setup prompt, so any well-shaped (even
  // verification-failing) return that doesn't throw the stub is enough; the empty
  // territories row deliberately fails verification, ending the run right after setup.
  const stub = makeAgentStub({ setup: { territories: [], reviewerBriefPath: "x", integratorBriefPath: "x", seamBriefPath: "x", reportPath: "x" } });
  await runScript(args, stub);
  const setupCall = stub.calls.find((c) => c.opts.label === "setup");
  assert.ok(setupCall, "setup call must have fired");
  assert.ok(setupCall.prompt.includes("/repo/wt-x-L1"), `worktreeRoot must be the PARENT of integrationWorktree, got: ${setupCall.prompt}`);
  assert.ok(!setupCall.prompt.includes("/repo/wt-integrate/wt-x-L1"), "must never nest the setup worktree inside the integration worktree");
});

// m1: a trailing slash on integrationBranch must never produce an empty slug (baseName
// of a trailing-slash path used to return "").
test("m1: a trailing slash on integrationBranch does not produce an empty slug", async () => {
  const args = { ...BASE_ARGS, territories: [{ id: "L1" }], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x/" };
  const stub = makeAgentStub({ setup: setupResultFor({ ...args, integrationBranch: "build/x" }) });
  await runScript(args, stub);
  const setupCall = stub.calls.find((c) => c.opts.label === "setup");
  assert.ok(setupCall.prompt.includes("wt-x-L1"), `slug must be 'x', never empty, got: ${setupCall.prompt}`);
  assert.ok(!setupCall.prompt.includes("wt--L1"), "an empty slug would render as a double dash");
});

// ---------------------------------------------------------------------------
// Given-worktree path — byte-for-byte preservation of the existing round loop,
// sameSha, longerSha, and the respawn-once-on-death rule.
// ---------------------------------------------------------------------------

test("given path: no territories, integrator still runs once, empty territories and blockers", async () => {
  const stub = makeAgentStub({ integrate: integrateResult() });
  const result = await runScript({ ...BASE_ARGS, territories: [] }, stub);
  assert.deepEqual(result.territories, []);
  assert.deepEqual(result.blockers, []);
  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].opts.agentType, "delegation:integrator");
  assert.equal(stub.calls[0].opts.model, "sonnet");
  assert.equal(result.setup, null);
  assert.equal(result.seam, null);
  assert.equal(result.acceptance, null);
});

test("given path: one territory, immediate APPROVE: one build call, one review call, one integrate call, rounds=1", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  const result = await runScript({ ...BASE_ARGS, territories: [T1], reviewerBriefPath: "briefs/reviewer.md", integratorBriefPath: "briefs/integrator.md" }, stub);
  assert.equal(result.territories.length, 1);
  const t1 = result.territories[0];
  assert.equal(t1.id, "T1");
  assert.equal(t1.sha, "aaaaaaa1");
  assert.equal(t1.verdict, "APPROVE");
  assert.equal(t1.rounds, 1);
  assert.equal(t1.blocker, null);
  assert.deepEqual(result.blockers, []);

  const buildCall = stub.calls.find((c) => c.opts.label === "build:T1:r1");
  assert.equal(buildCall.opts.agentType, "delegation:builder");
  assert.equal(buildCall.opts.model, "sonnet");
  const reviewCall = stub.calls.find((c) => c.opts.label === "review:T1:r1");
  assert.equal(reviewCall.opts.agentType, "delegation:reviewer");
  assert.equal(reviewCall.opts.model, "opus");
  const integrateCall = stub.calls.find((c) => c.opts.agentType === "delegation:integrator");
  assert.equal(integrateCall.opts.model, "sonnet");
});

test("given path: NEEDS_FIXES once then APPROVE: fix round re-runs build with the SAME pinned builder pair, rounds=2", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", "docs/work/t1-r1-findings.md", 1, 0),
    "build:T1:r2": buildResult("bbbbbbb2", "PASS", "docs/work/T1-report.md"),
    "review:T1:r2": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult(),
  });
  const result = await runScript({ ...BASE_ARGS, territories: [T1] }, stub);
  const t1 = result.territories[0];
  assert.equal(t1.rounds, 2);
  assert.equal(t1.sha, "bbbbbbb2");
  assert.equal(t1.verdict, "APPROVE");
  assert.equal(t1.blocker, null);

  const fixBuildCall = stub.calls.find((c) => c.opts.label === "build:T1:r2");
  assert.equal(fixBuildCall.opts.agentType, "delegation:builder");
  assert.equal(fixBuildCall.opts.model, "sonnet");
  assert.ok(fixBuildCall.prompt.includes("docs/work/t1-r1-findings.md"), "the fix prompt must reference the prior findingsPath");

  const fixReviewCall = stub.calls.find((c) => c.opts.label === "review:T1:r2");
  assert.ok(fixReviewCall.prompt.includes("Commit range: aaaaaaa1..HEAD"), "the fix review must compare the captured prior builder sha to a live HEAD it resolves itself, never the new build sha as text");
  assert.ok(!fixReviewCall.prompt.includes("bbbbbbb2"), "the fix review prompt must never contain the new build's delivered sha for the reviewer to echo");
});

test("given path: a null agent() return on the build stage is respawned once and succeeds", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": [null, buildResult("aaaaaaa1")],
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  const result = await runScript({ ...BASE_ARGS, territories: [T1] }, stub);
  assert.equal(result.territories[0].blocker, null);
  assert.equal(result.territories[0].sha, "aaaaaaa1");
  const buildCalls = stub.calls.filter((c) => c.opts.label === "build:T1:r1");
  assert.equal(buildCalls.length, 2, "respawned exactly once");
});

test("given path: seam S1 sha prefix acceptance still works (sameSha/longerSha unchanged)", async () => {
  const full = "5743ce80c59f72c67e9d89012ff947d44ee70bb2";
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("5743ce8"),
    "review:T1:r1": reviewResult("APPROVE", full),
    integrate: integrateResult(),
  });
  const result = await runScript({ ...BASE_ARGS, territories: [T1] }, stub);
  const t1 = result.territories[0];
  assert.equal(t1.verdict, "APPROVE");
  assert.equal(t1.sha, full);
  const integrateCall = stub.calls.find((c) => c.opts.label === "integrate");
  assert.match(integrateCall.prompt, new RegExp(`T1@${full}`));
});

test("given path: NEEDS_FIXES at every round exhausts maxRounds: blocker rounds-exhausted, log() fires", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", "f1.md"),
    "build:T1:r2": buildResult("bbbbbbb2"),
    "review:T1:r2": reviewResult("NEEDS_FIXES", "bbbbbbb2", "f2.md"),
    integrate: integrateResult(),
  });
  const result = await runScript({ ...BASE_ARGS, territories: [T1], maxRounds: 2 }, stub);
  const t1 = result.territories[0];
  assert.equal(t1.rounds, 2);
  assert.equal(t1.blocker, "rounds-exhausted");
  assert.deepEqual(result.blockers, [{ id: "T1", reason: "rounds-exhausted" }]);

  const run = runScript({ ...BASE_ARGS, territories: [T1], maxRounds: 2 }, makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", "f1.md"),
    "build:T1:r2": buildResult("bbbbbbb2"),
    "review:T1:r2": reviewResult("NEEDS_FIXES", "bbbbbbb2", "f2.md"),
    integrate: integrateResult(),
  }));
  await run;
  assert.ok(run.logs.some((m) => m.includes("rounds-exhausted") && m.includes("T1")));
});

test("given path: cross-territory concurrency uses parallel(), never pipeline(): two territories complete independently", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:T2:r1": buildResult("2222222a"),
    "review:T2:r1": reviewResult("NEEDS_FIXES", "2222222a", "f.md"),
    "build:T2:r2": buildResult("2222222b"),
    "review:T2:r2": reviewResult("APPROVE", "2222222b"),
    integrate: integrateResult(),
  });
  const result = await runScript({ ...BASE_ARGS, territories: [T1, T2] }, stub);
  const byId = Object.fromEntries(result.territories.map((r) => [r.id, r]));
  assert.equal(byId.T1.rounds, 1);
  assert.equal(byId.T1.verdict, "APPROVE");
  assert.equal(byId.T2.rounds, 2);
  assert.equal(byId.T2.verdict, "APPROVE");
});

test("given path: returns the full R7 superset shape and nothing else", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  const result = await runScript({ ...BASE_ARGS, territories: [T1] }, stub);
  assert.deepEqual(Object.keys(result).sort(), ["acceptance", "blockers", "integrator", "seam", "setup", "territories"].sort());
  assert.equal(result.setup, null, "setup is null when territories arrived already given");
  assert.equal(result.seam, null, "seam is null when integrationWorktree is absent");
  assert.equal(result.acceptance, null, "acceptance is null when integrationWorktree is absent");
});

test("a null integrator return twice falls back to a BLOCKED INTEGRATE result rather than throwing", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: [null, null],
  });
  const result = await runScript({ ...BASE_ARGS, territories: [T1] }, stub);
  assert.equal(result.integrator.verdict, "BLOCKED");
  assert.equal(result.integrator.failedGate, "agent-died");
  const integrateCalls = stub.calls.filter((c) => c.opts.agentType === "delegation:integrator");
  assert.equal(integrateCalls.length, 2, "respawned exactly once before falling back");
});

// S1: the integrator's own prompt must carry the integration location whenever
// integrationWorktree is given (a setup-mode launch never puts it anywhere else the
// integrator can see); the legacy (no integrationWorktree) prompt stays byte-identical.
test("S1: the integrate prompt names the integration worktree/branch/gate when integrationWorktree is given, and omits it entirely otherwise", async () => {
  const legacyStub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  await runScript({ ...BASE_ARGS, territories: [T1] }, legacyStub);
  const legacyIntegrateCall = legacyStub.calls.find((c) => c.opts.label === "integrate");
  assert.ok(!legacyIntegrateCall.prompt.includes("Integration worktree"), "no integrationWorktree given: prompt never mentions it");

  const withIntegrationStub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  const args = { ...BASE_ARGS, territories: [T1], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", integrationGate: "node scripts/run-tests.mjs", seam: false };
  await runScript(args, withIntegrationStub);
  const integrateCall = withIntegrationStub.calls.find((c) => c.opts.label === "integrate");
  assert.ok(integrateCall.prompt.includes("Integration worktree: /repo/wt-integrate"));
  assert.ok(integrateCall.prompt.includes("branch build/x"));
  assert.ok(integrateCall.prompt.includes("Full-suite gate: node scripts/run-tests.mjs"));
});

// ---------------------------------------------------------------------------
// R6: startFrom
// ---------------------------------------------------------------------------

test("R6: startFrom APPROVE skips build and review entirely, goes straight to Integrate", async () => {
  const t1WithStart = { ...T1, startFrom: { sha: "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1", verdict: "APPROVE", findingsPath: "docs/work/old-findings.md" } };
  const stub = makeAgentStub({ integrate: integrateResult() });
  const result = await runScript({ ...BASE_ARGS, territories: [t1WithStart] }, stub);
  const t1 = result.territories[0];
  assert.equal(t1.verdict, "APPROVE");
  assert.equal(t1.sha, "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1");
  assert.equal(t1.rounds, 0);
  assert.equal(t1.reportPath, null);
  assert.equal(t1.findingsPath, "docs/work/old-findings.md");
  assert.ok(!stub.calls.some((c) => c.opts.label && c.opts.label.startsWith("build:")), "no build call");
  assert.ok(!stub.calls.some((c) => c.opts.label && c.opts.label.startsWith("review:")), "no review call");
  assert.equal(stub.calls.length, 1, "only the integrate call runs");
});

test("R6: startFrom NEEDS_FIXES starts at a fix round (round 2), no round-1 build or review call", async () => {
  const t1WithStart = { ...T1, startFrom: { sha: "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2", verdict: "NEEDS_FIXES", findingsPath: "docs/work/prior-findings.md" } };
  const stub = makeAgentStub({
    "build:T1:r2": buildResult("c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"),
    "review:T1:r2": reviewResult("APPROVE", "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"),
    integrate: integrateResult(),
  });
  const result = await runScript({ ...BASE_ARGS, territories: [t1WithStart] }, stub);
  const t1 = result.territories[0];
  assert.equal(t1.verdict, "APPROVE");
  assert.equal(t1.rounds, 2);
  assert.ok(!stub.calls.some((c) => c.opts.label === "build:T1:r1"), "no round-1 build call");
  assert.ok(!stub.calls.some((c) => c.opts.label === "review:T1:r1"), "no round-1 review call");
  const fixBuildCall = stub.calls.find((c) => c.opts.label === "build:T1:r2");
  assert.equal(fixBuildCall.opts.phase, "Fix");
  assert.ok(fixBuildCall.prompt.includes("docs/work/prior-findings.md"));
});

// ---------------------------------------------------------------------------
// R2 (setup mode) / R3 / R4 / R5 — the SETUP path, seam, and accept-prep.
// ---------------------------------------------------------------------------

const SETUP_ARGS = {
  ...BASE_ARGS,
  territories: [{ id: "L1" }, { id: "L2" }],
  integrationWorktree: "/repo/wt-integrate",
  integrationBranch: "build/one-launch-1",
  integrationGate: "node scripts/run-tests.mjs",
  leadSession: "/home/lead/session.jsonl",
  recordPath: "docs/work/wr-2026-09-25-one-launch.record.md",
};

// Mirrors the script's own R3 name computation exactly, so a fixture setup result
// verifies clean against whatever args (fixed test constants, or a real example.json)
// are handed to it.
function lastSeg(p) {
  const s = String(p ?? "");
  const idx = s.lastIndexOf("/");
  return idx === -1 ? s : s.slice(idx + 1);
}
function dirOf(p) {
  const s = String(p ?? "");
  const idx = s.lastIndexOf("/");
  return idx === -1 ? "." : s.slice(0, idx);
}
function stripExtension(name) {
  const idx = name.lastIndexOf(".");
  return idx <= 0 ? name : name.slice(0, idx);
}

// s11: setup and accept-prep report paths are computed in the script the same way,
// `${dirOf(specPath)}/reports/<name>.md` — mirror that here so fixtures verify clean.
function reportPathFor(specPath, name) {
  return `${dirOf(specPath)}/reports/${name}.md`;
}

// N1: unlike every other report path, accept-prep's runner has its cwd moved to the
// delegation plugin root (R5 steps 1 and 4), so a repo-relative specPath must be
// anchored at integrationWorktree the same way S2 anchored the evidence/record paths.
function acceptReportPathFor(args) {
  return String(args.specPath).startsWith("/")
    ? reportPathFor(args.specPath, "accept-prep")
    : `${args.integrationWorktree}/${reportPathFor(args.specPath, "accept-prep")}`;
}

function setupResultFor(args) {
  const specDir = dirOf(args.specPath);
  const slug = args.integrationBranch ? lastSeg(args.integrationBranch) : stripExtension(lastSeg(args.specPath));
  const worktreeRoot = args.worktreeRoot ?? dirOf(args.integrationWorktree ?? "");
  return {
    territories: args.territories.map((t) => ({
      id: t.id,
      worktree: `${worktreeRoot}/wt-${slug}-${t.id}`,
      branch: args.integrationBranch ? `${args.integrationBranch}-${t.id}` : `build/${slug}-${t.id}`,
      briefPath: `${specDir}/briefs/${t.id}.md`,
      gate: `node --test ${t.id}.test.mjs`,
      headSha: args.baseSha,
    })),
    reviewerBriefPath: `${specDir}/briefs/reviewer.md`,
    integratorBriefPath: `${specDir}/briefs/integrator.md`,
    seamBriefPath: `${specDir}/briefs/seam.md`,
    reportPath: reportPathFor(args.specPath, "setup"),
  };
}

test("setup path: setup-failed when a returned territory's headSha doesn't match baseSha", async () => {
  const args = { ...SETUP_ARGS, territories: [{ id: "L1" }] };
  const badSetup = setupResultFor(args);
  badSetup.territories[0].headSha = "0000000000000000000000000000000000000000";
  const stub = makeAgentStub({ setup: badSetup });
  const result = await runScript(args, stub);
  assert.deepEqual(result.blockers, [{ id: "L1", reason: "setup-failed" }]);
  assert.deepEqual(result.territories, []);
  assert.equal(result.setup, null);
  assert.equal(stub.calls.length, 1, "nothing built past the failed setup call");
});

test("setup path: setup-failed when a returned worktree/branch/briefPath doesn't match the computed name", async () => {
  const args = { ...SETUP_ARGS, territories: [{ id: "L1" }] };
  const badSetup = setupResultFor(args);
  badSetup.territories[0].worktree = "/repo/wt-wrong-name";
  const stub = makeAgentStub({ setup: badSetup });
  const result = await runScript(args, stub);
  assert.deepEqual(result.blockers, [{ id: "L1", reason: "setup-failed" }]);
});

// m9 gap: only worktree and headSha were covered — branch, briefPath, and a missing row
// must fail verification too.
test("setup path: setup-failed when a returned branch doesn't match the computed name", async () => {
  const args = { ...SETUP_ARGS, territories: [{ id: "L1" }] };
  const badSetup = setupResultFor(args);
  badSetup.territories[0].branch = "wrong/branch-name";
  const stub = makeAgentStub({ setup: badSetup });
  const result = await runScript(args, stub);
  assert.deepEqual(result.blockers, [{ id: "L1", reason: "setup-failed" }]);
});

test("setup path: setup-failed when a returned briefPath doesn't match the computed name", async () => {
  const args = { ...SETUP_ARGS, territories: [{ id: "L1" }] };
  const badSetup = setupResultFor(args);
  badSetup.territories[0].briefPath = "wrong/briefs/L1.md";
  const stub = makeAgentStub({ setup: badSetup });
  const result = await runScript(args, stub);
  assert.deepEqual(result.blockers, [{ id: "L1", reason: "setup-failed" }]);
});

test("setup path: setup-failed when a territory row is missing from the returned territories array", async () => {
  const args = { ...SETUP_ARGS, territories: [{ id: "L1" }, { id: "L2" }] };
  const badSetup = setupResultFor(args);
  badSetup.territories = badSetup.territories.filter((r) => r.id !== "L2");
  const stub = makeAgentStub({ setup: badSetup });
  const result = await runScript(args, stub);
  assert.deepEqual(result.blockers, [{ id: "L2", reason: "setup-failed" }]);
});

// m9 gap: setup dying twice must give the '*' id, mirroring the given-path integrator's
// agent-died fallback.
test("setup path: setup agent dying twice gives setup-failed with id '*' and spawns nothing else", async () => {
  const args = { ...SETUP_ARGS, territories: [{ id: "L1" }] };
  const stub = makeAgentStub({ setup: [null, null] });
  const result = await runScript(args, stub);
  assert.deepEqual(result.blockers, [{ id: "*", reason: "setup-failed" }]);
  assert.equal(result.setup, null);
  const setupCalls = stub.calls.filter((c) => c.opts.label === "setup");
  assert.equal(setupCalls.length, 2, "respawned exactly once before giving up");
});

// M5: the reviewer/integrator/seam brief paths are computed IN THE SCRIPT (R3); the
// script must verify what setup returns against those computed names, not trust them.
test("setup path: setup-failed when the returned seamBriefPath differs from the computed one", async () => {
  const args = { ...SETUP_ARGS, territories: [{ id: "L1" }] };
  const badSetup = setupResultFor(args);
  badSetup.seamBriefPath = "/tmp/EVIL-seam.md";
  const stub = makeAgentStub({ setup: badSetup });
  const result = await runScript(args, stub);
  assert.deepEqual(result.blockers, [{ id: "*", reason: "setup-failed" }]);
  assert.equal(result.setup, null);
  assert.equal(stub.calls.length, 1, "nothing built past the failed setup call");
});

test("setup path: setup-failed when the returned reviewerBriefPath or integratorBriefPath differs from the computed one", async () => {
  const args = { ...SETUP_ARGS, territories: [{ id: "L1" }] };
  const badReviewer = setupResultFor(args);
  badReviewer.reviewerBriefPath = "/tmp/EVIL-reviewer.md";
  const result1 = await runScript(args, makeAgentStub({ setup: badReviewer }));
  assert.deepEqual(result1.blockers, [{ id: "*", reason: "setup-failed" }]);

  const badIntegrator = setupResultFor(args);
  badIntegrator.integratorBriefPath = "/tmp/EVIL-integrator.md";
  const result2 = await runScript(args, makeAgentStub({ setup: badIntegrator }));
  assert.deepEqual(result2.blockers, [{ id: "*", reason: "setup-failed" }]);
});

test("setup path: computed branch/worktree names use integrationBranch's last segment as slug", async () => {
  const args = { ...SETUP_ARGS, territories: [{ id: "L1" }], recordPath: undefined, leadSession: undefined };
  let capturedPrompt = null;
  const setup = setupResultFor(args);
  const stub = makeAgentStub({
    setup,
    "build:L1:r1": buildResult("aaaaaaa1"),
    "review:L1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  await runScript(args, stub);
  const setupCall = stub.calls.find((c) => c.opts.label === "setup");
  capturedPrompt = setupCall.prompt;
  assert.ok(capturedPrompt.includes("/repo/wt-one-launch-1-L1"), "worktree name uses the integration branch's last segment as slug");
  assert.ok(capturedPrompt.includes("build/one-launch-1-L1"), "branch name is integrationBranch-id");
});

// S1 (setup-mode half): the integrator brief the setup runner writes must itself name the
// integration worktree/branch/gate, since setupPrompt is what produces that brief.
test("S1: the setup prompt names the integration worktree/branch/gate for the integrator brief it writes", async () => {
  const args = { ...SETUP_ARGS, territories: [{ id: "L1" }], recordPath: undefined, leadSession: undefined };
  const setup = setupResultFor(args);
  const stub = makeAgentStub({
    setup,
    "build:L1:r1": buildResult("aaaaaaa1"),
    "review:L1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  await runScript(args, stub);
  const setupCall = stub.calls.find((c) => c.opts.label === "setup");
  assert.ok(setupCall.prompt.includes(`integration worktree ${args.integrationWorktree}`));
  assert.ok(setupCall.prompt.includes(`branch ${args.integrationBranch}`));
  assert.ok(setupCall.prompt.includes(`full-suite gate ${args.integrationGate}`));
});

// s11: the setup runner is given its own report path, and the script verifies what comes
// back against the computed one, same as the brief-path checks (M5).
test("s11: setup prompt carries a report path, and a mismatched returned reportPath is setup-failed", async () => {
  const args = { ...SETUP_ARGS, territories: [{ id: "L1" }], recordPath: undefined, leadSession: undefined };
  const setup = setupResultFor(args);
  const stub = makeAgentStub({
    setup,
    "build:L1:r1": buildResult("aaaaaaa1"),
    "review:L1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  await runScript(args, stub);
  const setupCall = stub.calls.find((c) => c.opts.label === "setup");
  assert.ok(setupCall.prompt.includes(`Report path: ${reportPathFor(args.specPath, "setup")}`));

  const badSetup = setupResultFor(args);
  badSetup.reportPath = "/tmp/EVIL-setup-report.md";
  const badResult = await runScript(args, makeAgentStub({ setup: badSetup }));
  assert.deepEqual(badResult.blockers, [{ id: "*", reason: "setup-failed" }]);
});

// N2 (twin of S4): an absent integrationBranch/integrationGate must never render the
// literal string "undefined" into the setup runner's own prompt.
test("N2: the setup prompt never renders undefined when integrationBranch/integrationGate are absent", async () => {
  const args = { ...SETUP_ARGS, territories: [{ id: "L1" }], recordPath: undefined, leadSession: undefined, integrationBranch: undefined, integrationGate: undefined };
  const setup = setupResultFor(args);
  const stub = makeAgentStub({
    setup,
    "build:L1:r1": buildResult("aaaaaaa1"),
    "review:L1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  await runScript(args, stub);
  const setupCall = stub.calls.find((c) => c.opts.label === "setup");
  assert.ok(setupCall.prompt.includes(`integration worktree ${args.integrationWorktree}`));
  assert.ok(!setupCall.prompt.includes("undefined"));
});

// S4: integrationBranch is needed for accept-prep's own header lines (Artifact:,
// Worktree:), so it must be checked, not left to render literal "undefined".
test("S4: accept-prep is skipped (no-integration-branch) when integrationWorktree is given but integrationBranch is not", async () => {
  const args = { ...BASE_ARGS, territories: [T1], integrationWorktree: "/repo/wt-integrate", recordPath: "docs/work/wr-x.record.md", leadSession: "/home/lead/s.jsonl" };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
  });
  const result = await runScript(args, stub);
  assert.deepEqual(result.acceptance, { skipped: "no-integration-branch" });
  assert.ok(!stub.calls.some((c) => c.opts.label === "accept-prep"));
});

// S4: an absent integrationGate must never render the literal string "undefined" into a
// seam-fix builder's Gate: line.
test("S4: the seam-fix prompt never renders a literal undefined Gate when integrationGate is absent", async () => {
  const args = { ...BASE_ARGS, territories: [T1, T2], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x" };
  const seamFindings = "docs/work/seam-r1-findings.md";
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:T2:r1": buildResult("bbbbbbb2"),
    "review:T2:r1": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult("PASS", "f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6"),
    "seam:r1": reviewResult("NEEDS_FIXES", "f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6", seamFindings),
    "seam-fix:r2": buildResult("g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7"),
    "seam:r2": reviewResult("APPROVE", "g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7"),
  });
  await runScript(args, stub);
  const seamFixCall = stub.calls.find((c) => c.opts.label === "seam-fix:r2");
  assert.ok(!seamFixCall.prompt.includes("Gate: undefined"));
  assert.ok(seamFixCall.prompt.includes("Gate: the full-suite gate named in the integrator brief"));
});

test("setup path: full fixture run produces setup, builds, reviews, integrate, seam APPROVE, and accept-prep with censusPath and checkAcceptance", async () => {
  const args = SETUP_ARGS;
  const setup = setupResultFor(args);
  const seamFindings = "docs/work/seam-r1-findings.md";
  const l1Findings = "docs/work/evidence/L1-review-approve.md";
  const l2Findings = "docs/work/evidence/L2-review-approve.md";

  // M6: the journal must actually discriminate a live script (not just assert a constant
  // it built itself). Wrap the fixture stub so every call is recorded through the SAME
  // path the assertions read back, and append the return entry only once the script's own
  // promise has resolved — plus one tick of the microtask queue, so a stray un-awaited
  // agent() firing after return would still land in the journal before we check it.
  const inner = makeAgentStub({
    setup,
    "build:L1:r1": buildResult("aaaaaaa1"),
    "review:L1:r1": reviewResult("APPROVE", "aaaaaaa1", l1Findings),
    "build:L2:r1": buildResult("bbbbbbb2"),
    "review:L2:r1": reviewResult("APPROVE", "bbbbbbb2", l2Findings),
    integrate: integrateResult("PASS", "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4"),
    "seam:r1": reviewResult("APPROVE", "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4", seamFindings),
    "accept-prep": {
      censusPath: "docs/work/evidence/wr-2026-09-25-one-launch-census.md",
      censusNote: "ok",
      integrationHead: "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4",
      evidencePaths: ["docs/work/evidence/wr-2026-09-25-one-launch-L1.md", "docs/work/evidence/wr-2026-09-25-one-launch-L2.md"],
      checkAcceptance: { exitCode: 0, verdict: "PASS", output: "ok" },
      reportPath: acceptReportPathFor(args),
    },
  });
  const journal = [];
  const stub = async (prompt, opts) => {
    journal.push({ type: "agent", agentType: opts.agentType, model: opts.model, label: opts.label });
    return inner(prompt, opts);
  };
  stub.calls = inner.calls;

  const result = await runScript(args, stub);
  journal.push({ type: "return" });
  // let any stray un-awaited agent() call land before we check the journal's shape.
  await new Promise((resolve) => setTimeout(resolve, 0));

  // setup
  assert.ok(result.setup);
  assert.equal(result.setup.reportPath, setup.reportPath);
  assert.equal(result.setup.seamBriefPath, setup.seamBriefPath);
  assert.equal(result.territories[0].worktree ?? undefined, undefined, "territory result rows don't restate worktree — only id/sha/verdict/etc");

  // builds/reviews/integrate
  assert.equal(result.territories.length, 2);
  assert.ok(result.territories.every((t) => t.verdict === "APPROVE"));
  assert.equal(result.integrator.verdict, "PASS");

  // seam
  assert.ok(result.seam);
  assert.equal(result.seam.verdict, "APPROVE");
  assert.equal(result.seam.blocker, null);

  // accept-prep
  assert.ok(result.acceptance);
  assert.equal(result.acceptance.censusPath, "docs/work/evidence/wr-2026-09-25-one-launch-census.md");
  assert.equal(result.acceptance.checkAcceptance.verdict, "PASS");

  assert.deepEqual(result.blockers, []);

  // M1: the accept-prep prompt must carry the reviewers' APPROVE findings files, never
  // the builders' own report paths.
  const acceptCall = stub.calls.find((c) => c.opts.label === "accept-prep");
  assert.ok(acceptCall.prompt.includes(l1Findings), "accept-prep prompt must list L1's reviewer findings path");
  assert.ok(acceptCall.prompt.includes(l2Findings), "accept-prep prompt must list L2's reviewer findings path");
  assert.ok(acceptCall.prompt.includes(seamFindings), "accept-prep prompt must list the seam's APPROVE findings path");
  assert.ok(!acceptCall.prompt.includes("docs/work/aaaaaaa1.report.md"), "accept-prep prompt must never list a builder report path");
  assert.ok(!acceptCall.prompt.includes("docs/work/bbbbbbb2.report.md"), "accept-prep prompt must never list a builder report path");

  // JOURNAL: every agent() call the fake saw, plus one entry for the script's single
  // return — the count of script returns is exactly 1, the return is the LAST entry (no
  // agent() call fired after the script returned, awaited or not), and every call's
  // {agentType, model} pair is one of the pinned pairs the script itself issues (never
  // something "the pane" would issue directly, since every one of these calls originated
  // inside the script, never from the test/pane).
  assert.equal(journal.filter((e) => e.type === "return").length, 1, "exactly one script return");
  assert.equal(journal.at(-1).type, "return", "no agent() call after the script returned");
  for (const entry of journal.filter((e) => e.type === "agent")) {
    assert.ok(
      PINNED_PAIRS.some((p) => p.agentType === entry.agentType && p.model === entry.model),
      `unpinned {agentType: ${entry.agentType}, model: ${entry.model}}`,
    );
  }
  assert.deepEqual(
    journal
      .filter((e) => e.type === "agent")
      .map((e) => e.label)
      .sort(),
    ["accept-prep", "build:L1:r1", "build:L2:r1", "integrate", "review:L1:r1", "review:L2:r1", "seam:r1", "setup"],
  );
  assert.equal(stub.calls.length, 8, "setup + 2 builds + 2 reviews + integrate + seam + accept-prep = 8 calls, one launch");
});

test("given path (integrationWorktree absent): seam:null, acceptance:null even with two territories", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:T2:r1": buildResult("bbbbbbb2"),
    "review:T2:r1": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult(),
  });
  const result = await runScript({ ...BASE_ARGS, territories: [T1, T2] }, stub);
  assert.equal(result.seam, null);
  assert.equal(result.acceptance, null);
  assert.ok(!stub.calls.some((c) => c.opts.label && c.opts.label.startsWith("seam")));
  assert.ok(!stub.calls.some((c) => c.opts.label === "accept-prep"));
});

// ---------------------------------------------------------------------------
// R4: seam NEEDS_FIXES -> seam-fix -> seam APPROVE; seam rounds-exhausted
// ---------------------------------------------------------------------------

test("R4: seam NEEDS_FIXES triggers one seam-fix builder on the integration worktree, then a delta re-review that APPROVEs", async () => {
  const args = { ...BASE_ARGS, territories: [T1, T2], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", integrationGate: "node scripts/run-tests.mjs", reviewerBriefPath: "briefs/reviewer.md", integratorBriefPath: "briefs/integrator.md" };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:T2:r1": buildResult("bbbbbbb2"),
    "review:T2:r1": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
    "seam:r1": reviewResult("NEEDS_FIXES", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5", "docs/work/seam-r1-findings.md"),
    "seam-fix:r2": buildResult("f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6"),
    "seam:r2": reviewResult("APPROVE", "f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6"),
  });
  const result = await runScript(args, stub);
  assert.equal(result.seam.verdict, "APPROVE");
  assert.equal(result.seam.rounds, 2);
  assert.equal(result.seam.blocker, null);
  assert.equal(result.seam.sha, "f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6");

  const seamFixCall = stub.calls.find((c) => c.opts.label === "seam-fix:r2");
  assert.equal(seamFixCall.opts.agentType, "delegation:builder");
  assert.equal(seamFixCall.opts.model, "sonnet");
  assert.ok(seamFixCall.prompt.includes("docs/work/seam-r1-findings.md"));
  assert.ok(seamFixCall.prompt.includes("node scripts/run-tests.mjs"));
  assert.deepEqual(result.blockers, []);

  // M2 twin: the seam-fix made a NEW commit (f6... differs from priorHead e5...), so the
  // delta re-review prompt must carry the prior head for the range and never the new
  // build's delivered sha for an echoing reviewer to copy.
  const seamReReviewCall = stub.calls.find((c) => c.opts.label === "seam:r2");
  assert.ok(seamReReviewCall.prompt.includes("Commit range: e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5..HEAD"), "the r2 seam prompt must carry the prior head as the range start");
  assert.ok(!seamReReviewCall.prompt.includes("f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6"), "the r2 seam prompt must never contain the seam-fix's own delivered sha");
});

// M2: a no-commit seam-fix round (the fix builder reports the exact same head it started
// from) must never leak that sha into the delta re-review prompt as a "range" for an
// echoing reviewer to copy back.
test("M2: seam-fix that makes no new commit does not leak the current HEAD into the re-review prompt", async () => {
  const args = { ...BASE_ARGS, territories: [T1, T2], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", integrationGate: "node scripts/run-tests.mjs" };
  const noCommitSha = "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5";
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:T2:r1": buildResult("bbbbbbb2"),
    "review:T2:r1": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult("PASS", noCommitSha),
    "seam:r1": reviewResult("NEEDS_FIXES", noCommitSha, "docs/work/seam-r1-findings.md"),
    "seam-fix:r2": buildResult(noCommitSha),
    "seam:r2": reviewResult("APPROVE", noCommitSha),
  });
  const result = await runScript(args, stub);
  assert.equal(result.seam.verdict, "APPROVE");
  const seamReReviewCall = stub.calls.find((c) => c.opts.label === "seam:r2");
  assert.ok(!seamReReviewCall.prompt.includes(`${noCommitSha}..HEAD`), "a no-commit seam-fix must never render 'sha..HEAD' with the live HEAD's own sha");
  assert.ok(seamReReviewCall.prompt.includes("docs/work/seam-r1-findings.md"), "prior findings path is still carried even without a commit range");
});

// m9 gap: a round-1 seam sha mismatch against the integrator's own headSha must BLOCK,
// never silently accept.
test("m9: seam round-1 sha mismatch against integrate.headSha blocks with review-sha-mismatch", async () => {
  const args = { ...BASE_ARGS, territories: [T1, T2], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x" };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:T2:r1": buildResult("bbbbbbb2"),
    "review:T2:r1": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
    "seam:r1": reviewResult("APPROVE", "HEAD"),
  });
  const result = await runScript(args, stub);
  assert.equal(result.seam.verdict, "BLOCKED");
  assert.equal(result.seam.blocker, "review-sha-mismatch");
  assert.equal(result.seam.sha, null);
  assert.deepEqual(result.blockers, [{ id: "seam", reason: "review-sha-mismatch" }]);
});

// m9 gap: the seam reviewer agent dying twice must fall back to BLOCKED, mirroring the
// integrator's own agent-died fallback, rather than throwing.
test("m9: seam agent dying twice falls back to BLOCKED agent-died rather than throwing", async () => {
  const args = { ...BASE_ARGS, territories: [T1, T2], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x" };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:T2:r1": buildResult("bbbbbbb2"),
    "review:T2:r1": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
    "seam:r1": [null, null],
  });
  const result = await runScript(args, stub);
  assert.equal(result.seam.verdict, "BLOCKED");
  assert.equal(result.seam.blocker, "agent-died");
  assert.deepEqual(result.blockers, [{ id: "seam", reason: "agent-died" }]);
  const seamCalls = stub.calls.filter((c) => c.opts.label === "seam:r1");
  assert.equal(seamCalls.length, 2, "respawned exactly once before giving up");
});

test("R4: seam rounds-exhausted when NEEDS_FIXES persists through maxRounds", async () => {
  const args = { ...BASE_ARGS, territories: [T1, T2], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", integrationGate: "node scripts/run-tests.mjs", maxRounds: 2 };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:T2:r1": buildResult("bbbbbbb2"),
    "review:T2:r1": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
    "seam:r1": reviewResult("NEEDS_FIXES", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5", "f1.md"),
    "seam-fix:r2": buildResult("f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6"),
    "seam:r2": reviewResult("NEEDS_FIXES", "f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6", "f2.md"),
  });
  const result = await runScript(args, stub);
  assert.equal(result.seam.verdict, "NEEDS_FIXES");
  assert.equal(result.seam.blocker, "rounds-exhausted");
  assert.equal(result.seam.rounds, 2);
  // m7: rounds-exhausted keeps the last sameSha-verified sha, for parity with a
  // territory row in the same state.
  assert.equal(result.seam.sha, "f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6");
  assert.deepEqual(result.blockers, [{ id: "seam", reason: "rounds-exhausted" }]);
  assert.ok(!stub.calls.some((c) => c.opts.label === "seam-fix:r3"), "no round beyond maxRounds is attempted");
});

test("R4: seam is SKIPPED (not run) with a single territory, since the default requires two or more", async () => {
  const args = { ...BASE_ARGS, territories: [T1], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x" };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
  });
  const result = await runScript(args, stub);
  assert.equal(result.seam.verdict, "SKIPPED");
  assert.equal(result.seam.blocker, null);
  assert.ok(!stub.calls.some((c) => c.opts.label && c.opts.label.startsWith("seam")));
});

test("R4: seam:true forces the seam stage even with a single territory", async () => {
  const args = { ...BASE_ARGS, territories: [T1], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", seam: true };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
    "seam:r1": reviewResult("APPROVE", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
  });
  const result = await runScript(args, stub);
  assert.equal(result.seam.verdict, "APPROVE");
  assert.ok(stub.calls.some((c) => c.opts.label === "seam:r1"));
});

test("R4: seam:false suppresses the seam stage even with two or more territories", async () => {
  const args = { ...BASE_ARGS, territories: [T1, T2], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", seam: false };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:T2:r1": buildResult("bbbbbbb2"),
    "review:T2:r1": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
  });
  const result = await runScript(args, stub);
  assert.equal(result.seam.verdict, "SKIPPED");
  assert.ok(!stub.calls.some((c) => c.opts.label && c.opts.label.startsWith("seam")));
});

// ---------------------------------------------------------------------------
// R5: accept-prep is skipped when seam is not APPROVE/SKIPPED
// ---------------------------------------------------------------------------

test("R5: accept-prep is skipped (acceptance.skipped) when seam is NEEDS_FIXES", async () => {
  const args = { ...BASE_ARGS, territories: [T1, T2], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", integrationGate: "node scripts/run-tests.mjs", maxRounds: 1, recordPath: "docs/work/wr-x.record.md", leadSession: "/home/lead/s.jsonl" };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:T2:r1": buildResult("bbbbbbb2"),
    "review:T2:r1": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
    "seam:r1": reviewResult("NEEDS_FIXES", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5", "f1.md"),
  });
  const result = await runScript(args, stub);
  assert.equal(result.seam.verdict, "NEEDS_FIXES");
  assert.deepEqual(result.acceptance, { skipped: "seam-not-approved" });
  assert.ok(!stub.calls.some((c) => c.opts.label === "accept-prep"));
});

test("R5: accept-prep is skipped when recordPath is absent, even with seam APPROVE", async () => {
  const args = { ...BASE_ARGS, territories: [T1], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", seam: true };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
    "seam:r1": reviewResult("APPROVE", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
  });
  const result = await runScript(args, stub);
  assert.deepEqual(result.acceptance, { skipped: "no-record-path" });
  assert.ok(!stub.calls.some((c) => c.opts.label === "accept-prep"));
});

test("R5: accept-prep runs when seam is SKIPPED and integrator PASSed (no seam stage needed)", async () => {
  const args = { ...BASE_ARGS, territories: [T1], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", recordPath: "docs/work/wr-x.record.md", leadSession: "/home/lead/s.jsonl" };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
    "accept-prep": {
      censusPath: null,
      censusNote: "leadSession resolved but census errored: ok for test",
      integrationHead: "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5",
      evidencePaths: [],
      checkAcceptance: { exitCode: 1, verdict: "FAIL", output: "no artifact yet" },
      reportPath: acceptReportPathFor(args),
    },
  });
  const result = await runScript(args, stub);
  assert.equal(result.seam.verdict, "SKIPPED");
  assert.ok(result.acceptance);
  assert.equal(result.acceptance.censusPath, null);
  const acceptCall = stub.calls.find((c) => c.opts.label === "accept-prep");
  assert.equal(acceptCall.opts.agentType, "delegation:runner");
  assert.equal(acceptCall.opts.model, "sonnet");
  assert.ok(acceptCall.prompt.includes("wr-x-census.md"));
  // S2: every relative output path the runner is told to write lands inside the
  // integration worktree, never the plugin root's own docs/work/evidence/.
  assert.ok(acceptCall.prompt.includes("/repo/wt-integrate/docs/work/evidence/"), "census/evidence paths anchored at integrationWorktree");
  assert.ok(acceptCall.prompt.includes(`/repo/wt-integrate/${args.recordPath}`), "record path anchored at integrationWorktree");
  // s10: seam SKIPPED must never be rendered as a false "seam r<n> APPROVE" Log line.
  assert.ok(acceptCall.prompt.includes("seam SKIPPED"), "Log line names seam SKIPPED, not a false APPROVE");
  assert.ok(!/seam r\d+ APPROVE/.test(acceptCall.prompt), "never claims an APPROVE that never happened");
  // s11: the runner is given its own report path.
  assert.ok(acceptCall.prompt.includes(`Report path: ${acceptReportPathFor(args)}`));
});

test("R5: accept-prep is skipped when the integrator did not PASS", async () => {
  const args = { ...BASE_ARGS, territories: [T1], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", recordPath: "docs/work/wr-x.record.md" };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult("FAIL", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
  });
  const result = await runScript(args, stub);
  assert.deepEqual(result.acceptance, { skipped: "integrator-not-pass" });
});

// M4: R5 step 2 presupposes every territory has an APPROVE ("last territory APPROVE per
// territory"). Running accept-prep with a blocked territory (even alongside an approved
// one) writes a false "Status: reviewed" header over an incomplete build.
test("M4: accept-prep is skipped (territory-blockers) when a territory is builder-BLOCKED, even though the integrator PASSed", async () => {
  const args = { ...BASE_ARGS, territories: [T1], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", recordPath: "docs/work/wr-x.record.md", leadSession: "/home/lead/s.jsonl" };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1", "BLOCKED"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
  });
  const result = await runScript(args, stub);
  assert.equal(result.territories[0].blocker, "builder-blocked");
  assert.deepEqual(result.acceptance, { skipped: "territory-blockers" });
  assert.ok(!stub.calls.some((c) => c.opts.label === "accept-prep"));
  assert.deepEqual(result.blockers, [{ id: "T1", reason: "builder-blocked" }]);
});

test("M4: accept-prep is skipped (territory-blockers) when one of two territories is blocked", async () => {
  const args = { ...BASE_ARGS, territories: [T1, T2], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", recordPath: "docs/work/wr-x.record.md", leadSession: "/home/lead/s.jsonl", seam: false };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:T2:r1": buildResult("bbbbbbb2", "FAIL"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
  });
  const result = await runScript(args, stub);
  assert.deepEqual(result.acceptance, { skipped: "territory-blockers" });
  assert.ok(!stub.calls.some((c) => c.opts.label === "accept-prep"));
});

// M3: accept-prep's returned integrationHead is CHECKED (R1: "checks what that agent
// returns"), never taken on faith — an unverified head like the literal "HEAD" must
// blocker the return rather than ship silently.
test("M3: accept-prep returning an unverified integrationHead (e.g. the literal 'HEAD') adds an accept-prep review-sha-mismatch blocker", async () => {
  const args = { ...BASE_ARGS, territories: [T1], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", recordPath: "docs/work/wr-x.record.md", leadSession: "/home/lead/s.jsonl" };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
    "accept-prep": {
      censusPath: null,
      censusNote: "ok for test",
      integrationHead: "HEAD",
      evidencePaths: [],
      checkAcceptance: { exitCode: 0, verdict: "PASS", output: "ok" },
      reportPath: acceptReportPathFor(args),
    },
  });
  const result = await runScript(args, stub);
  assert.ok(result.acceptance, "acceptance is still returned (the runner's report), just flagged");
  assert.deepEqual(result.blockers, [{ id: "accept-prep", reason: "review-sha-mismatch" }]);
});

test("M3: accept-prep is checked against the seam's (longer) APPROVE sha, not the integrator's shorter one", async () => {
  const args = { ...BASE_ARGS, territories: [T1, T2], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", recordPath: "docs/work/wr-x.record.md", leadSession: "/home/lead/s.jsonl" };
  const shortIntegrateHead = "e5e5e5e";
  const fullSeamSha = "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5";
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:T2:r1": buildResult("bbbbbbb2"),
    "review:T2:r1": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult("PASS", shortIntegrateHead),
    "seam:r1": reviewResult("APPROVE", fullSeamSha),
    "accept-prep": {
      censusPath: null,
      censusNote: "ok for test",
      integrationHead: fullSeamSha,
      evidencePaths: [],
      checkAcceptance: { exitCode: 0, verdict: "PASS", output: "ok" },
      reportPath: acceptReportPathFor(args),
    },
  });
  const result = await runScript(args, stub);
  assert.deepEqual(result.blockers, [], "the full seam-verified sha, matched against seam.sha (the longer of the two independent reads), is never flagged");
  // s10: a genuine seam APPROVE renders its own round and sha, not a hardcoded literal.
  const acceptCall = stub.calls.find((c) => c.opts.label === "accept-prep");
  assert.ok(acceptCall.prompt.includes(`seam r1 APPROVE ${fullSeamSha}`));
});

// s11 (accept-prep half): the script checks the returned reportPath against the one it
// computed and told the runner, the same as M3 checks integrationHead.
test("s11: accept-prep returning a reportPath that differs from the computed one adds an accept-prep report-path-mismatch blocker", async () => {
  const args = { ...BASE_ARGS, territories: [T1], integrationWorktree: "/repo/wt-integrate", integrationBranch: "build/x", recordPath: "docs/work/wr-x.record.md", leadSession: "/home/lead/s.jsonl" };
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult("PASS", "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"),
    "accept-prep": {
      censusPath: null,
      censusNote: "ok for test",
      integrationHead: "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5",
      evidencePaths: [],
      checkAcceptance: { exitCode: 0, verdict: "PASS", output: "ok" },
      reportPath: "/tmp/EVIL-accept-report.md",
    },
  });
  const result = await runScript(args, stub);
  assert.ok(result.acceptance, "acceptance is still returned (the runner's report), just flagged");
  assert.deepEqual(result.blockers, [{ id: "accept-prep", reason: "report-path-mismatch" }]);
});

// ---------------------------------------------------------------------------
// R9: no note-send instruction beyond the prohibition, across every rendered prompt.
// ---------------------------------------------------------------------------

test("R9: no rendered prompt across build/review/integrate/setup/seam/accept-prep contains any note-send instruction other than the prohibition itself", async () => {
  const args = { ...SETUP_ARGS };
  const setup = setupResultFor(args);
  const stub = makeAgentStub({
    setup,
    "build:L1:r1": buildResult("aaaaaaa1"),
    "review:L1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:L2:r1": buildResult("bbbbbbb2"),
    "review:L2:r1": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult("PASS", "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4"),
    "seam:r1": reviewResult("APPROVE", "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4"),
    "accept-prep": {
      censusPath: "docs/work/evidence/wr-2026-09-25-one-launch-census.md",
      censusNote: "ok",
      integrationHead: "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4",
      evidencePaths: [],
      checkAcceptance: { exitCode: 0, verdict: "PASS", output: "ok" },
      reportPath: acceptReportPathFor(args),
    },
  });
  await runScript(args, stub);
  assert.ok(stub.calls.length > 0);
  for (const call of stub.calls) {
    assert.ok(/Never send peer notes\./.test(call.prompt), `prompt for label ${call.opts.label} must carry the note-send prohibition`);
    assert.ok(!/note-send/.test(call.prompt), `prompt for label ${call.opts.label} must never mention note-send itself`);
  }
});

// ---------------------------------------------------------------------------
// build-loop-args.example.json (new one-launch shape) and
// build-loop-args.legacy.example.json (old given-worktree shape) both parse.
// ---------------------------------------------------------------------------

test("build-loop-args.example.json (new one-launch shape) parses and matches the setup-territory shape", () => {
  const exampleRaw = readFileSync(path.join(__dirname, "build-loop-args.example.json"), "utf8");
  const example = JSON.parse(exampleRaw);
  assert.equal(typeof example.specPath, "string");
  assert.equal(typeof example.baseSha, "string");
  assert.equal(typeof example.startedAt, "string");
  assert.ok(Array.isArray(example.territories));
  for (const t of example.territories) {
    assert.equal(typeof t.id, "string");
    assert.equal(t.worktree, undefined, "one-launch example territories must not carry worktree — setup creates it");
    assert.equal(t.branch, undefined);
    assert.equal(t.briefPath, undefined);
  }
  assert.equal(typeof example.integrationWorktree, "string");
  assert.equal(typeof example.integrationBranch, "string");
  assert.equal(typeof example.integrationGate, "string");
  assert.equal(typeof example.leadSession, "string");
  assert.equal(typeof example.recordPath, "string");
});

test("build-loop-args.legacy.example.json (old given-worktree shape) parses and matches the given-territory shape", () => {
  const legacyRaw = readFileSync(path.join(__dirname, "build-loop-args.legacy.example.json"), "utf8");
  const legacy = JSON.parse(legacyRaw);
  assert.equal(typeof legacy.specPath, "string");
  assert.equal(typeof legacy.baseSha, "string");
  assert.equal(typeof legacy.startedAt, "string");
  assert.ok(Array.isArray(legacy.territories));
  assert.ok(legacy.territories.length > 0);
  for (const t of legacy.territories) {
    assert.equal(typeof t.id, "string");
    assert.equal(typeof t.worktree, "string");
    assert.equal(typeof t.branch, "string");
    assert.equal(typeof t.briefPath, "string");
    assert.equal(typeof t.gate, "string");
  }
  assert.equal(typeof legacy.reviewerBriefPath, "string");
  assert.equal(typeof legacy.integratorBriefPath, "string");
});

test("both example arg files launch cleanly against the given/setup detection with no mixed-territory-modes error", async () => {
  const legacy = JSON.parse(readFileSync(path.join(__dirname, "build-loop-args.legacy.example.json"), "utf8"));
  const legacyStub = makeAgentStub(
    Object.fromEntries([
      ...legacy.territories.flatMap((t) => [
        [`build:${t.id}:r1`, buildResult("aaaaaaa1")],
        [`review:${t.id}:r1`, reviewResult("APPROVE", "aaaaaaa1")],
      ]),
      ["integrate", integrateResult()],
    ]),
  );
  const legacyResult = await runScript(legacy, legacyStub);
  assert.deepEqual(legacyResult.blockers, []);

  const example = JSON.parse(readFileSync(path.join(__dirname, "build-loop-args.example.json"), "utf8"));
  const setup = setupResultFor(example);
  const exampleStub = makeAgentStub(
    Object.fromEntries([
      ["setup", setup],
      ...example.territories.flatMap((t) => [
        [`build:${t.id}:r1`, buildResult("aaaaaaa1")],
        [`review:${t.id}:r1`, reviewResult("APPROVE", "aaaaaaa1")],
      ]),
      ["integrate", integrateResult("PASS", "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4")],
      ["seam:r1", reviewResult("APPROVE", "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4")],
      ["accept-prep", {
        censusPath: null,
        censusNote: "no census in this smoke test",
        integrationHead: "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4",
        evidencePaths: [],
        checkAcceptance: { exitCode: 0, verdict: "PASS", output: "ok" },
        reportPath: acceptReportPathFor(example),
      }],
    ]),
  );
  const exampleResult = await runScript(example, exampleStub);
  assert.deepEqual(exampleResult.blockers, []);
});
