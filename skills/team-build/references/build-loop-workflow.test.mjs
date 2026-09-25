// Static harness for build-loop-workflow.js (L-C4). Follows the shape of
// skills/delegate/references/ladder-workflow.test.mjs (the pinned runtime's real
// precedent): reads the source as text, strips the leading `export` from `meta`, and
// wraps the body in an AsyncFunction with the runtime's real hook parameters
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
// 2. meta is a pure literal; 7. meta.phases titles equal the pinned four, in order
// ---------------------------------------------------------------------------

test("L-C4.2 & L-C4.7: meta is a pure object literal; phases are {title, detail} objects titled Build, Review, Fix, Integrate in order", () => {
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
  assert.deepEqual(titles, ["Build", "Review", "Fix", "Integrate"]);
});

// ---------------------------------------------------------------------------
// 3. banned tokens absent — each a distinct, named assertion (closes the five
// false-green holes: isolation, dynamic import(, crypto., performance., bare new Date)
// ---------------------------------------------------------------------------

test("L-C4.3: every banned token is absent from the source, each checked by name", () => {
  // Round 2 fix (reviewer L1-review-r1.md, BLOCKER): L-C4.3 pins the forbidden TOKENS
  // `Date.now` and `Math.random`, not a call-site shape. The prior `/Date\.now\s*\(/` /
  // `/Math\.random\s*\(/` regexes required the dot and the name adjacent with no space,
  // so `Date .now()`, an aliased `const f = Date.now; f()`, and a formatter's
  // `Date.\n  now()` all passed green. `\s*` between the dot and the name (and no
  // trailing `\(` requirement, so a bare reference is caught even when never called)
  // closes all of those with no false positive against this script (verified: the
  // shipped script still passes clean).
  assert.ok(!/Date\s*\.\s*now/.test(SOURCE), "Date.now must be absent");
  assert.ok(!/Math\s*\.\s*random/.test(SOURCE), "Math.random must be absent");
  // Same weakness class swept across every other dotted-token ban below: each now
  // tolerates whitespace/line breaks between the identifier and the dot.
  assert.ok(!/crypto\s*\./.test(SOURCE), "crypto. must be absent");
  assert.ok(!/performance\s*\./.test(SOURCE), "performance. must be absent");
  assert.ok(!/new\s+Date(?!\s*\()/.test(SOURCE), "bare `new Date` not immediately followed by `(` must be absent");
  assert.ok(!/require\s*\(/.test(SOURCE), "require( must be absent");
  assert.ok(!/\bimport\s/.test(SOURCE), "a static `import ` keyword must be absent");
  assert.ok(!/\bimport\(/.test(SOURCE), "dynamic import( must be absent");
  assert.ok(!/process\s*\./.test(SOURCE), "process. must be absent");
  // \b, not a bare /fs\s*\./ — a bare pattern false-positives on the word "briefs." in
  // prose comments (b-r-i-e-"fs".), which is not the banned `fs.` filesystem-module
  // token; \b still excludes it after adding \s* tolerance (no boundary between the "e"
  // in "brie" and the "f" in "fs", so the word-boundary anchor never engages there).
  assert.ok(!/\bfs\s*\./.test(SOURCE), "fs. must be absent");
  assert.ok(!/isolation/.test(SOURCE), "the literal token isolation must be absent, anywhere in the file");
});

// bonus, not one of the eight L-C4 items but pins L-C3's own shape rule directly: this
// script never calls pipeline() at all (parallel() is the only cross-territory hook it
// uses; behavioral coverage below in "never calls pipeline"). Same whitespace tolerance
// as the sweep above.
test("bonus: the source never calls pipeline( (L-C3: not used at the territory level, or anywhere, in this script)", () => {
  assert.ok(!/\bpipeline\s*\(/.test(SOURCE), "pipeline( must not appear in the source");
});

// ---------------------------------------------------------------------------
// 4. every agent( call site carries both model: and agentType:, pair from the pinned
// list of three
// ---------------------------------------------------------------------------

const PINNED_PAIRS = [
  { agentType: "delegation:builder", model: "sonnet" },
  { agentType: "delegation:reviewer", model: "opus" },
  { agentType: "delegation:integrator", model: "sonnet" },
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

test("L-C4.4: every agent( call site carries a model: and an agentType: key, matching one of the three pinned pairs", () => {
  const calls = findAgentCallTexts(SOURCE);
  assert.ok(calls.length >= 3, "expects at least Build, Review, and Integrate call sites");
  for (const call of calls) {
    const agentTypeMatch = call.match(/agentType:\s*['"]([^'"]+)['"]/);
    const modelMatch = call.match(/model:\s*['"]([^'"]+)['"]/);
    assert.ok(agentTypeMatch, `agent( call site missing agentType: — ${call.slice(0, 60)}...`);
    assert.ok(modelMatch, `agent( call site missing model: — ${call.slice(0, 60)}...`);
    const pair = { agentType: agentTypeMatch[1], model: modelMatch[1] };
    const matches = PINNED_PAIRS.some((p) => p.agentType === pair.agentType && p.model === pair.model);
    assert.ok(
      matches,
      `agent( call site pair {agentType: '${pair.agentType}', model: '${pair.model}'} is not one of the three pinned pairs`,
    );
  }
  // and the integrator call is never upgraded to opus:
  const integratorCalls = calls.filter((c) => /agentType:\s*['"]delegation:integrator['"]/.test(c));
  assert.ok(integratorCalls.length >= 1, "expects at least one delegation:integrator call site");
  for (const call of integratorCalls) {
    assert.ok(/model:\s*['"]sonnet['"]/.test(call), "the integrator call must pin model: sonnet, never opus");
  }
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
// 8. each of BUILD, REVIEW, INTEGRATE appears as the schema: value in at least one
// agent( call
// ---------------------------------------------------------------------------

test("L-C4.8: BUILD, REVIEW, and INTEGRATE each appear as a schema: value in at least one agent( call", () => {
  assert.ok(/schema:\s*BUILD\b/.test(SOURCE), "schema: BUILD must appear in at least one agent( call");
  assert.ok(/schema:\s*REVIEW\b/.test(SOURCE), "schema: REVIEW must appear in at least one agent( call");
  assert.ok(/schema:\s*INTEGRATE\b/.test(SOURCE), "schema: INTEGRATE must appear in at least one agent( call");
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

function integrateResult(verdict = "PASS", headSha = "headsha", reportPath = "docs/work/integrate.report.md", failedGate = null, territory = null) {
  return { verdict, headSha, reportPath, failedGate, territory };
}

const T1 = { id: "T1", briefPath: "briefs/T1.md", worktree: "../wt-T1", branch: "feat/T1", gate: "node --test t1.test.mjs" };
const T2 = { id: "T2", briefPath: "briefs/T2.md", worktree: "../wt-T2", branch: "feat/T2", gate: "node --test t2.test.mjs" };

test("runs with args undefined: no territories, integrator still runs once, empty territories and blockers", async () => {
  const stub = makeAgentStub({ integrate: integrateResult() });
  const result = await runScript(undefined, stub);
  assert.deepEqual(result.territories, []);
  assert.deepEqual(result.blockers, []);
  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].opts.agentType, "delegation:integrator");
  assert.equal(stub.calls[0].opts.model, "sonnet");
});

test("one territory, immediate APPROVE: one build call, one review call, one integrate call, rounds=1", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
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

test("NEEDS_FIXES once then APPROVE: fix round re-runs build with the SAME pinned builder pair, rounds=2", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", "docs/work/t1-r1-findings.md", 1, 0),
    "build:T1:r2": buildResult("bbbbbbb2", "PASS", "docs/work/T1-report.md"),
    "review:T1:r2": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
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

// MINOR 4 (T1 round-2 review): a fix-round builder that returns PASS with the SAME sha as
// the prior round (no new commit) must never hand the reviewer a rendered prompt containing
// that sha as text - an echoing reviewer could match it without ever running `git rev-parse
// HEAD` itself.
test("fix round with no new commit: the r2 review prompt never contains the unchanged sha as text", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", "docs/work/t1-r1-findings.md"),
    "build:T1:r2": buildResult("aaaaaaa1", "PASS", "docs/work/T1-report.md"),
    "review:T1:r2": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  const t1 = result.territories[0];
  assert.equal(t1.verdict, "APPROVE");
  assert.equal(t1.sha, "aaaaaaa1");

  const fixReviewCall = stub.calls.find((c) => c.opts.label === "review:T1:r2");
  assert.ok(!fixReviewCall.prompt.includes("aaaaaaa1"), "the r2 review prompt must not contain the sha for the reviewer to echo when no new commit was made");
  assert.ok(fixReviewCall.prompt.includes("docs/work/t1-r1-findings.md"), "prior findings must still be referenced even without a commit range");
});

test("a fix review always receives the captured artifact range, even with an empty findings path and a retry", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", ""),
    "build:T1:r2": buildResult("bbbbbbb2"),
    "review:T1:r2": [null, reviewResult("APPROVE", "bbbbbbb2")],
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  assert.equal(result.territories[0].verdict, "APPROVE");
  const retryingReviewCalls = stub.calls.filter((c) => c.opts.label === "review:T1:r2");
  assert.equal(retryingReviewCalls.length, 2, "the fix review retries once after a null response");
  for (const call of retryingReviewCalls) {
    assert.ok(call.prompt.includes("Commit range: aaaaaaa1..HEAD"), "each fix-review attempt receives the captured artifact range, resolved live rather than handed as text");
  }
});

// T1 (loop-gates spec item 3): the reviewer prompt must name the worktree and instruct an
// independent `git rev-parse HEAD` there, and must never contain the delivered sha itself
// (that self-reported string is exactly what a reviewer could echo back without checking).
test("the review prompt names the worktree and never contains the delivered sha for the reviewer to echo", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("eeeeeee5", "PASS", "docs/work/T1-report.md"),
    "review:T1:r1": reviewResult("APPROVE", "eeeeeee5"),
    integrate: integrateResult(),
  });
  await runScript({ territories: [T1] }, stub);
  const reviewCall = stub.calls.find((c) => c.opts.label === "review:T1:r1");
  assert.ok(reviewCall.prompt.includes(`Worktree: ${T1.worktree}`), "the review prompt must name the worktree to check HEAD in");
  assert.ok(/git rev-parse HEAD/.test(reviewCall.prompt), "the review prompt must instruct an independent git rev-parse HEAD");
  assert.ok(!reviewCall.prompt.includes("eeeeeee5"), "the review prompt must never contain the delivered sha as text");
});

// Round-2 review MAJOR 1: the spec's "the builder likewise" item — the builder prompt
// must also instruct a live `git rev-parse HEAD`, in both the first round and every fix
// round, not just the reviewer prompt.
test("the build prompt tells the builder to report git rev-parse HEAD as its sha field, in round 1 and every fix round", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", "f1.md"),
    "build:T1:r2": buildResult("bbbbbbb2"),
    "review:T1:r2": reviewResult("APPROVE", "bbbbbbb2"),
    integrate: integrateResult(),
  });
  await runScript({ territories: [T1] }, stub);
  const round1Build = stub.calls.find((c) => c.opts.label === "build:T1:r1");
  const round2Build = stub.calls.find((c) => c.opts.label === "build:T1:r2");
  assert.match(round1Build.prompt, /git rev-parse HEAD/);
  assert.match(round2Build.prompt, /git rev-parse HEAD/);
});

// Round-2 review MAJOR 1: build.sha and review.sha are now two independently-produced
// `git rev-parse HEAD` reads of the same commit, so the equality check must normalize
// case and surrounding whitespace rather than doing a raw string compare — otherwise a
// reviewer that (correctly) reports the full lowercase 40-hex against a builder that
// reported an uppercase or newline-padded value would be wrongly blocked.
test("review sha comparison is case- and whitespace-normalized: an uppercase or padded reviewer sha still approves", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("abcdef1234567890abcdef1234567890abcdef12"),
    "review:T1:r1": reviewResult("APPROVE", "ABCDEF1234567890ABCDEF1234567890ABCDEF12\n"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  assert.equal(result.territories[0].verdict, "APPROVE");
  assert.equal(result.territories[0].blocker, null);
  assert.deepEqual(result.blockers, []);
});

test("review sha comparison still rejects a genuinely different sha (never equal on empty either side)", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult(""),
    "review:T1:r1": reviewResult("APPROVE", ""),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  assert.deepEqual(result.blockers, [{ id: "T1", reason: "review-sha-mismatch" }]);
});

// Seam S1: a builder that reports a short `git rev-parse --short` (or copies a short sha
// from its own commit log) against a reviewer's full 40-hex read of the SAME commit must
// still approve — both are honest, independent reads, only at different lengths.
test("seam S1: a 7-character short sha from the builder approves against the reviewer's matching full 40-hex sha", async () => {
  const full = "5743ce80c59f72c67e9d89012ff947d44ee70bb2";
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("5743ce8"),
    "review:T1:r1": reviewResult("APPROVE", full),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  const t1 = result.territories[0];
  assert.equal(t1.verdict, "APPROVE");
  assert.equal(t1.blocker, null);
  assert.deepEqual(result.blockers, []);
  // Seam S1 optional: the integrator prompt always carries the longer (full) sha, never
  // whichever length the builder happened to report.
  const integrateCall = stub.calls.find((c) => c.opts.label === "integrate");
  assert.match(integrateCall.prompt, new RegExp(`T1@${full}`));
});

test("seam S1: a 7-character sha differing from the reviewer's full sha in its last character is still a mismatch", async () => {
  const full = "5743ce80c59f72c67e9d89012ff947d44ee70bb2";
  const notAPrefix = "5743ce9"; // differs from full's first 7 chars in the last position
  const stub = makeAgentStub({
    "build:T1:r1": buildResult(notAPrefix),
    "review:T1:r1": reviewResult("APPROVE", full),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  assert.deepEqual(result.blockers, [{ id: "T1", reason: "review-sha-mismatch" }]);
});

test("seam S1: a 5-character prefix is too short to accept, even when it does prefix-match", async () => {
  const full = "5743ce80c59f72c67e9d89012ff947d44ee70bb2";
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("5743c"),
    "review:T1:r1": reviewResult("APPROVE", full),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  assert.deepEqual(result.blockers, [{ id: "T1", reason: "review-sha-mismatch" }]);
});

// Seam S5: sameSha must require both sides to look like a git sha (7-40 lowercase hex
// chars); two equal non-sha strings (e.g. both "HEAD", or both "unknown") must never be
// treated as a match.
test("seam S5: two identical non-hex strings (e.g. both 'HEAD') never approve as a matching sha", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("HEAD"),
    "review:T1:r1": reviewResult("APPROVE", "HEAD"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  assert.deepEqual(result.blockers, [{ id: "T1", reason: "review-sha-mismatch" }]);
});

test("seam S5: two identical 'unknown' strings never approve as a matching sha", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("unknown"),
    "review:T1:r1": reviewResult("APPROVE", "unknown"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  assert.deepEqual(result.blockers, [{ id: "T1", reason: "review-sha-mismatch" }]);
});

test("a review only approves the build sha it reviewed, including after a fix round", async () => {
  const initialMismatch = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "ddddddd4"),
    integrate: integrateResult(),
  });
  const initialResult = await runScript({ territories: [T1] }, initialMismatch);
  assert.deepEqual(initialResult.blockers, [{ id: "T1", reason: "review-sha-mismatch" }]);
  assert.match(
    initialMismatch.calls.find((c) => c.opts.label === "integrate").prompt,
    /Approved territories and shas: none/,
  );

  const fixMismatch = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", "f1.md"),
    "build:T1:r2": buildResult("bbbbbbb2"),
    "review:T1:r2": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  const fixResult = await runScript({ territories: [T1] }, fixMismatch);
  assert.deepEqual(fixResult.blockers, [{ id: "T1", reason: "review-sha-mismatch" }]);
  assert.match(
    fixMismatch.calls.find((c) => c.opts.label === "integrate").prompt,
    /Approved territories and shas: none/,
  );
});

test("NEEDS_FIXES at every round exhausts maxRounds: blocker rounds-exhausted, log() fires, no round beyond maxRounds is attempted", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", "f1.md"),
    "build:T1:r2": buildResult("bbbbbbb2"),
    "review:T1:r2": reviewResult("NEEDS_FIXES", "bbbbbbb2", "f2.md"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1], maxRounds: 2 }, stub);
  const t1 = result.territories[0];
  assert.equal(t1.rounds, 2);
  assert.equal(t1.blocker, "rounds-exhausted");
  assert.equal(stub.calls.filter((c) => c.opts.label && c.opts.label.startsWith("build:T1:")).length, 2, "no round 3 build call");
  assert.deepEqual(result.blockers, [{ id: "T1", reason: "rounds-exhausted" }]);

  // log() actually fired, and named the territory, not just "somewhere in the loop"
  const run = runScript({ territories: [T1], maxRounds: 2 }, makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", "f1.md"),
    "build:T1:r2": buildResult("bbbbbbb2"),
    "review:T1:r2": reviewResult("NEEDS_FIXES", "bbbbbbb2", "f2.md"),
    integrate: integrateResult(),
  }));
  await run;
  assert.ok(run.logs.some((m) => m.includes("rounds-exhausted") && m.includes("T1")));
});

test("maxRounds default is 3 when omitted", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", "f1.md"),
    "build:T1:r2": buildResult("bbbbbbb2"),
    "review:T1:r2": reviewResult("NEEDS_FIXES", "bbbbbbb2", "f2.md"),
    "build:T1:r3": buildResult("ccccccc3"),
    "review:T1:r3": reviewResult("APPROVE", "ccccccc3"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  assert.equal(result.territories[0].rounds, 3);
  assert.equal(result.territories[0].blocker, null);
});

test("a numeric-string maxRounds is honoured (parsed, not left as a string)", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", "f1.md"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1], maxRounds: "1" }, stub);
  assert.equal(result.territories[0].rounds, 1);
  assert.equal(result.territories[0].blocker, "rounds-exhausted");
});

test("a null agent() return on the build stage is respawned once and succeeds", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": [null, buildResult("aaaaaaa1")],
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  assert.equal(result.territories[0].blocker, null);
  assert.equal(result.territories[0].sha, "aaaaaaa1");
  const buildCalls = stub.calls.filter((c) => c.opts.label === "build:T1:r1");
  assert.equal(buildCalls.length, 2, "respawned exactly once");
});

test("a null agent() return twice on the review stage records blocker agent-died and never starts a fix round", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": [null, null],
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  const t1 = result.territories[0];
  assert.equal(t1.blocker, "agent-died");
  const reviewCalls = stub.calls.filter((c) => c.opts.label === "review:T1:r1");
  assert.equal(reviewCalls.length, 2, "respawned exactly once before giving up");
  assert.ok(!stub.calls.some((c) => c.opts.label === "build:T1:r2"), "no fix round starts once review has died twice");
});

test("a builder verdict of FAIL or BLOCKED ends the territory immediately, no review call", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1", "BLOCKED"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  const t1 = result.territories[0];
  assert.equal(t1.verdict, "BLOCKED");
  assert.equal(t1.blocker, "builder-blocked");
  assert.ok(!stub.calls.some((c) => c.opts.label === "review:T1:r1"), "no review call once the build itself is BLOCKED");
});

test("cross-territory concurrency uses parallel(), never pipeline(): two territories complete independently", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    "build:T2:r1": buildResult("2222222a"),
    "review:T2:r1": reviewResult("NEEDS_FIXES", "2222222a", "f.md"),
    "build:T2:r2": buildResult("2222222b"),
    "review:T2:r2": reviewResult("APPROVE", "2222222b"),
    integrate: integrateResult(),
  });
  // pipelineImpl left as throwingPipelineStub (default) — a call to pipeline() would
  // throw and fail this test.
  const result = await runScript({ territories: [T1, T2] }, stub);
  const byId = Object.fromEntries(result.territories.map((r) => [r.id, r]));
  assert.equal(byId.T1.rounds, 1);
  assert.equal(byId.T1.verdict, "APPROVE");
  assert.equal(byId.T2.rounds, 2);
  assert.equal(byId.T2.verdict, "APPROVE");

  // Converse of the excluded-territory check below: two APPROVEd territories really do
  // land in the approved-sha segment of the integrator prompt (id@sha, both of them),
  // so that assertion can't pass merely by the prompt losing its approved list entirely.
  const integrateCall = stub.calls.find((c) => c.opts.agentType === "delegation:integrator");
  const approvedSegment = integrateCall.prompt.match(/Approved territories and shas: (.*?)\. Excluded/)[1];
  assert.equal(approvedSegment, "T1@aaaaaaa1, T2@2222222b");
});

test("the integrator prompt names excluded (blocked) territories and their reason, and result.blockers reflects them", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", "f1.md"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1], maxRounds: 1 }, stub);
  assert.deepEqual(result.blockers, [{ id: "T1", reason: "rounds-exhausted" }]);
  const integrateCall = stub.calls.find((c) => c.opts.agentType === "delegation:integrator");
  assert.ok(integrateCall.prompt.includes("T1"));
  assert.ok(integrateCall.prompt.includes("rounds-exhausted"));
  assert.equal(integrateCall.opts.model, "sonnet", "the integrator never runs at opus");

  // Round 2 fix (reviewer L1-review-r1.md, MAJOR): nothing previously pinned that a
  // blocked territory is actually EXCLUDED from the approved-sha segment — mutating
  // `const approved = results.filter((r) => !r.blocker)` to `const approved = results`
  // still passed here, because T1's id appears in both the approved and excluded halves
  // of the prompt and both prior asserts were plain `.includes("T1")` substring checks.
  // Isolate the approved segment specifically and require it to read "none".
  const approvedSegment = integrateCall.prompt.match(/Approved territories and shas: (.*?)\. Excluded/)[1];
  assert.equal(approvedSegment, "none", "a blocked territory must never appear in the approved-sha list");
});

test("parallel null and omitted slots retain every planned territory as a blocked result", async () => {
  const stub = makeAgentStub({ integrate: integrateResult() });
  const result = await runScript(
    { territories: [T1, T2] },
    stub,
    { parallelImpl: async () => [null] },
  );
  assert.deepEqual(result.territories.map((r) => r.id), ["T1", "T2"]);
  assert.deepEqual(result.blockers, [
    { id: "T1", reason: "parallel-result-missing" },
    { id: "T2", reason: "parallel-result-missing" },
  ]);
  assert.deepEqual(result.territories.map((r) => r.failure), [
    { stage: "parallel", reason: "missing-result", index: 0 },
    { stage: "parallel", reason: "missing-result", index: 1 },
  ]);
  const integrateCall = stub.calls.find((c) => c.opts.label === "integrate");
  assert.match(integrateCall.prompt, /T1 \(parallel-result-missing\), T2 \(parallel-result-missing\)/);
});

test("the integration prompt requires explicit matching reviewer approval", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  await runScript({ territories: [T1] }, stub);
  const integrateCall = stub.calls.find((c) => c.opts.label === "integrate");
  assert.match(integrateCall.prompt, /explicitly returned APPROVE for that exact sha/);
});

test("a review without explicit APPROVE is excluded even if a runtime bypasses the review schema", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("UNKNOWN", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  assert.deepEqual(result.blockers, [{ id: "T1", reason: "review-not-approved" }]);
  const integrateCall = stub.calls.find((c) => c.opts.label === "integrate");
  assert.match(integrateCall.prompt, /Approved territories and shas: none/);
});

test("returns exactly { territories, integrator, blockers } and nothing else", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: integrateResult(),
  });
  const result = await runScript({ territories: [T1] }, stub);
  assert.deepEqual(Object.keys(result).sort(), ["blockers", "integrator", "territories"]);
  assert.ok(Array.isArray(result.territories));
  assert.ok(Array.isArray(result.blockers));
  assert.equal(typeof result.integrator, "object");
});

test("a null integrator return twice falls back to a BLOCKED INTEGRATE result rather than throwing", async () => {
  const stub = makeAgentStub({
    "build:T1:r1": buildResult("aaaaaaa1"),
    "review:T1:r1": reviewResult("APPROVE", "aaaaaaa1"),
    integrate: [null, null],
  });
  const result = await runScript({ territories: [T1] }, stub);
  assert.equal(result.integrator.verdict, "BLOCKED");
  assert.equal(result.integrator.failedGate, "agent-died");
  const integrateCalls = stub.calls.filter((c) => c.opts.agentType === "delegation:integrator");
  assert.equal(integrateCalls.length, 2, "respawned exactly once before falling back");
});
