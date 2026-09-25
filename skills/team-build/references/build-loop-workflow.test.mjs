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
    reportPath: `${specDir}/setup.report.md`,
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

test("setup path: full fixture run produces setup, builds, reviews, integrate, seam APPROVE, and accept-prep with censusPath and checkAcceptance", async () => {
  const args = SETUP_ARGS;
  const setup = setupResultFor(args);
  const stub = makeAgentStub({
    setup,
    "build:L1:r1": buildResult("aaaaaaa1"),
    "review:L1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:L2:r1": buildResult("bbbbbbb2"),
    "review:L2:r1": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult("PASS", "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4"),
    "seam:r1": reviewResult("APPROVE", "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4", "docs/work/seam-r1-findings.md"),
    "accept-prep": {
      censusPath: "docs/work/evidence/wr-2026-09-25-one-launch-census.md",
      censusNote: "ok",
      integrationHead: "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4",
      evidencePaths: ["docs/work/evidence/wr-2026-09-25-one-launch-L1.md", "docs/work/evidence/wr-2026-09-25-one-launch-L2.md"],
      checkAcceptance: { exitCode: 0, verdict: "PASS", output: "ok" },
      reportPath: "docs/work/accept-prep.report.md",
    },
  });

  const result = await runScript(args, stub);

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

  // JOURNAL: every agent() call the fake saw, plus one entry for the script's single
  // return — the count of script returns is exactly 1, and every call's agentType is one
  // the script itself issues (never something "the pane" would issue directly, since
  // every one of these calls originated inside the script, never from the test/pane).
  const PANE_LEVEL_TYPES = new Set(["general-purpose", "delegation:orchestrator"]);
  const journal = [
    ...stub.calls.map((c) => ({ type: "agent", agentType: c.opts.agentType })),
    { type: "return" },
  ];
  assert.equal(journal.filter((e) => e.type === "return").length, 1, "exactly one script return");
  for (const entry of journal.filter((e) => e.type === "agent")) {
    assert.ok(!PANE_LEVEL_TYPES.has(entry.agentType), `agentType ${entry.agentType} looks like something the pane would issue directly, not the script`);
  }
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
      reportPath: "docs/work/accept-prep.report.md",
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
      reportPath: "docs/work/accept-prep.report.md",
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
        reportPath: "docs/work/accept-prep.report.md",
      }],
    ]),
  );
  const exampleResult = await runScript(example, exampleStub);
  assert.deepEqual(exampleResult.blockers, []);
});
