// C6 harness (RT-17, addendum A2): reads skills/delegate/references/ladder-workflow.js as
// text, strips the leading `export` from `meta`, wraps the body in an AsyncFunction with
// parameters (agent, parallel, pipeline, phase, log, args, budget), and injects a counting
// `agent` stub. Never imports the script as an ES module (it has no exports past `meta`
// and its top level uses top-level `await`, which only a module or an async function body
// supports) — the AsyncFunction wrapper is the intended harness shape.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, "ladder-workflow.js");
const SOURCE = readFileSync(SCRIPT_PATH, "utf8");

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// ---------------------------------------------------------------------------
// meta: pure literal extraction (brace-matched, not a greedy regex — meta nests objects
// inside its `phases` array, so a non-greedy `[\s\S]*?\}` would close on the FIRST nested
// `}` instead of meta's own).
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
      if (depth === 0) {
        return source.slice(braceStart, i + 1);
      }
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
// Script runner: build the AsyncFunction once per call so each test gets a fresh
// `agentCalls` closure (the cap counter lives inside the script body, not the harness).
// ---------------------------------------------------------------------------
function makeAgentStub() {
  const calls = [];
  async function agentStub(prompt, opts) {
    calls.push({ prompt, opts });
    if (opts && opts.phase === "Judge") {
      return { verdict: "PASS", evidence: ["docs/work/example.record.md"] };
    }
    return {
      status: "complete",
      finding: `finding for ${(opts && opts.label) || "call"}`,
      sources: ["docs/work/example.record.md"],
      reason: "inspected source",
    };
  }
  agentStub.calls = calls;
  return agentStub;
}

async function parallelStub(thunks) {
  return Promise.all(thunks.map((t) => t()));
}

async function pipelineStub(items, ...stages) {
  return Promise.all(
    items.map(async (item, index) => {
      let result = item;
      for (const stage of stages) {
        result = await stage(result, item, index);
      }
      return result;
    }),
  );
}

// Runtime-faithful variants (review Notes: the real Workflow runtime resolves a thunk's
// or stage's thrown error to `null` for just that one item rather than rejecting the
// whole parallel()/pipeline() call — Promise.all above does NOT match that and never
// exercised the null-drop path). These catch per-item and resolve null, same as the
// documented runtime behavior.
async function parallelNullOnThrowStub(thunks) {
  return Promise.all(
    thunks.map(async (t) => {
      try {
        return await t();
      } catch {
        return null;
      }
    }),
  );
}

async function pipelineNullOnThrowStub(items, ...stages) {
  return Promise.all(
    items.map(async (item, index) => {
      let result = item;
      try {
        for (const stage of stages) {
          result = await stage(result, item, index);
        }
      } catch {
        return null;
      }
      return result;
    }),
  );
}

function runScript(args, agentStub, { parallelImpl = parallelStub, pipelineImpl = pipelineStub } = {}) {
  const body = stripLeadingExport(SOURCE);
  const fn = new AsyncFunction(
    "agent",
    "parallel",
    "pipeline",
    "phase",
    "log",
    "args",
    "budget",
    body,
  );
  return fn(agentStub, parallelImpl, pipelineImpl, () => {}, () => {}, args, {
    total: null,
    spent: () => 0,
    remaining: () => Infinity,
  });
}

// ---------------------------------------------------------------------------
// meta is a pure literal
// ---------------------------------------------------------------------------

test("meta is assigned a pure object literal (no calls, spreads, or interpolation)", () => {
  const literal = extractMetaLiteral(SOURCE);
  assert.ok(!literal.includes("..."), "meta must not spread");
  assert.ok(!literal.includes("${"), "meta must not template-interpolate");
  assert.ok(!/\w\s*\(/.test(literal), "meta must not call a function");

  // Evaluate in a scope with NOTHING closed over: if the literal referenced any
  // identifier (a variable, `args`, a helper), this throws ReferenceError.
  const evalMeta = new Function(`"use strict"; return (${literal});`);
  const meta = evalMeta();

  assert.equal(typeof meta.name, "string");
  assert.ok(meta.name.length > 0);
  assert.equal(typeof meta.description, "string");
  assert.ok(meta.description.length > 0);
  assert.ok(Array.isArray(meta.phases));
  assert.ok(meta.phases.length >= 3, "expects Read, Research, Judge rungs");
  for (const p of meta.phases) {
    assert.equal(typeof p.title, "string");
  }
  const titles = meta.phases.map((p) => p.title);
  assert.deepEqual(titles, ["Read", "Research", "Judge"]);
});

// ---------------------------------------------------------------------------
// banned calls absent (addendum A2: grep Date.now, Math.random, and ARGLESS new Date()
// only — new Date(<arg>) is legal runtime code and must not be flagged)
// ---------------------------------------------------------------------------

test("Date.now, Math.random and argless new Date() are absent from the source", () => {
  assert.ok(!/Date\.now\s*\(/.test(SOURCE), "Date.now() must be absent");
  assert.ok(!/Math\.random\s*\(/.test(SOURCE), "Math.random() must be absent");
  assert.ok(!/new\s+Date\s*\(\s*\)/.test(SOURCE), "argless new Date() must be absent");
});

// ---------------------------------------------------------------------------
// args may be undefined (addendum A2): run once with args undefined, once with
// { maxAgents: 2 }
// ---------------------------------------------------------------------------

test("runs with args undefined (every field defaults)", async () => {
  const stub = makeAgentStub();
  const result = await runScript(undefined, stub);
  assert.equal(typeof result, "object");
  assert.equal(result.verdict, "inconclusive");
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.coverage, []);
  assert.equal(result.cost.agents, 0);
  assert.equal(stub.calls.length, 0);
});

test("runs with args = { maxAgents: 2 } and no targets", async () => {
  const stub = makeAgentStub();
  const result = await runScript({ maxAgents: 2 }, stub);
  assert.equal(result.cost.agents, 0);
  assert.equal(stub.calls.length, 0);
});

// ---------------------------------------------------------------------------
// the reader-type fallback and rung model/effort wiring
// ---------------------------------------------------------------------------

test("fast tier defaults to delegation:runner, haiku, low effort; mid tier is sonnet; judge is opus, one agent", async () => {
  const stub = makeAgentStub();
  const result = await runScript({ targets: ["file-a.md"] }, stub);
  assert.equal(stub.calls.length, 3, "one read, one research, one judge");
  const [readCall, researchCall, judgeCall] = stub.calls;
  assert.equal(readCall.opts.agentType, "delegation:runner");
  assert.equal(readCall.opts.model, "haiku");
  assert.equal(readCall.opts.effort, "low");
  assert.equal(researchCall.opts.model, "sonnet");
  assert.equal(judgeCall.opts.model, "opus");
  assert.equal(result.cost.agents, 3);
});

test("honours an explicit readerType (the general-purpose fallback callers use when delegation:runner is not registered)", async () => {
  const stub = makeAgentStub();
  await runScript({ targets: ["file-a.md"], readerType: "general-purpose" }, stub);
  assert.equal(stub.calls[0].opts.agentType, "general-purpose");
});

// ---------------------------------------------------------------------------
// the cap: enforced by counting agent() calls, throws past maxAgents
// ---------------------------------------------------------------------------

test("does not throw when the total agent() calls land exactly on maxAgents", async () => {
  const stub = makeAgentStub();
  // 2 targets -> 2 reads + 2 research + 1 judge = 5 calls
  const result = await runScript({ targets: ["a", "b"], maxAgents: 5 }, stub);
  assert.equal(result.cost.agents, 5);
  assert.equal(stub.calls.length, 5);
});

test("throws at maxAgents + 1 when a later rung tips the cumulative count over", async () => {
  const stub = makeAgentStub();
  // 2 targets -> Read reserves 2 (total 2, ok against cap 4), Research reserves 2
  // (total 4, ok), Judge reserves 1 (total 5 = maxAgents + 1) -> throws before the
  // judge agent() call is made.
  await assert.rejects(
    () => runScript({ targets: ["a", "b"], maxAgents: 4 }, stub),
    /required 5, provided 4/,
  );
  assert.equal(stub.calls.length, 0, "preflight rejects before any agent() call");
});

test("throws at maxAgents + 1 when the very first rung alone exceeds the cap", async () => {
  const stub = makeAgentStub();
  // 3 targets need 3 Read calls; cap 2 -> reserve(3) sees next = 3 = maxAgents + 1.
  await assert.rejects(
    () => runScript({ targets: ["a", "b", "c"], maxAgents: 2 }, stub),
    /required 7, provided 2/,
  );
  assert.equal(stub.calls.length, 0, "no agent() call happens once a rung is over cap");
});

test("default cap is the required 2*N+1 calls", async () => {
  const stub = makeAgentStub();
  // 4 targets -> 4 + 4 + 1 = 9 calls, well under the default cap of 12; proves no cap
  // is silently applied lower than documented.
  const result = await runScript({ targets: ["a", "b", "c", "d"] }, stub);
  assert.equal(result.cost.agents, 9);
  const larger = await runScript({ targets: ["a", "b", "c", "d", "e", "f"] }, makeAgentStub());
  assert.equal(larger.cost.agents, 13, "the default cap grows with planned coverage");
});

test("a numeric-string maxAgents (e.g. from JSON-ish args) still honours the cap, not widen it to 12", async () => {
  const stub = makeAgentStub();
  // 5 targets, maxAgents: '2' -> parses to 2; Read alone reserves 5, which exceeds 2 ->
  // must throw at the Read rung, never run 11 agents against an unenforced cap.
  await assert.rejects(
    () => runScript({ targets: ["a", "b", "c", "d", "e"], maxAgents: "2" }, stub),
    /required 11, provided 2/,
  );
  assert.equal(stub.calls.length, 0, "no agent() call happens once a rung is over cap");
});

// ---------------------------------------------------------------------------
// return shape: exactly one object, intermediate output never leaves the script
// ---------------------------------------------------------------------------

test("returns coverage as an additive fourth top-level field", async () => {
  const stub = makeAgentStub();
  const result = await runScript({ targets: ["a"] }, stub);
  assert.deepEqual(Object.keys(result).sort(), ["cost", "coverage", "evidence", "verdict"]);
  assert.deepEqual(Object.keys(result.cost), ["agents"]);
  assert.equal(typeof result.verdict, "string");
  assert.ok(Array.isArray(result.evidence));
  assert.deepEqual(result.coverage[0], {
    index: 0,
    target: "a",
    read: { status: "complete", reason: "inspected source" },
    research: { status: "complete", reason: "inspected source" },
    sources: ["docs/work/example.record.md"],
  });
});

// ---------------------------------------------------------------------------
// runtime-faithful stubs: a thrown thunk/stage resolves to null (the null-drop path),
// not a rejection, matching the real Workflow parallel()/pipeline() semantics
// ---------------------------------------------------------------------------

test("a failed read preserves positional coverage and still receives research", async () => {
  const calls = [];
  async function agentStub(prompt, opts) {
    calls.push({ prompt, opts });
    if (opts && opts.label === "read:1:b") {
      throw new Error("simulated per-item failure");
    }
    if (opts && opts.phase === "Judge") {
      return { verdict: "PASS", evidence: ["docs/work/example.record.md"] };
    }
    return { status: "complete", finding: "verified", sources: ["docs/work/example.record.md"], reason: "inspected" };
  }

  const result = await runScript(
    { targets: ["a", "b", "c"] },
    agentStub,
    { parallelImpl: parallelNullOnThrowStub, pipelineImpl: pipelineNullOnThrowStub },
  );

  const readCalls = calls.filter((c) => c.opts.phase === "Read");
  assert.equal(readCalls.length, 3, "all three reads are attempted");
  const researchCalls = calls.filter((c) => c.opts.phase === "Research");
  assert.equal(researchCalls.length, 3, "every planned target receives research");
  assert.ok(researchCalls.some((c) => c.opts.label === "research:1:b"));
  const judgeCalls = calls.filter((c) => c.opts.phase === "Judge");
  assert.equal(judgeCalls.length, 1, "the judge still runs exactly once");
  assert.equal(result.cost.agents, 7, "cost counts actual attempted calls");
  assert.equal(result.coverage[1].read.status, "unavailable");
  assert.equal(result.coverage[1].research.status, "complete");
});

test("rejects insufficient or malformed explicit caps before any dispatch, with required and provided budgets", async () => {
  const insufficient = makeAgentStub();
  await assert.rejects(
    () => runScript({ targets: ["a", "b"], maxAgents: 4 }, insufficient),
    /required 5, provided 4/,
  );
  assert.equal(insufficient.calls.length, 0);
  const malformed = makeAgentStub();
  await assert.rejects(
    () => runScript({ targets: ["a"], maxAgents: "nope" }, malformed),
    /required 3, provided nope/,
  );
  assert.equal(malformed.calls.length, 0);
  for (const maxAgents of [[3], { value: 3 }, true]) {
    const typedMalformed = makeAgentStub();
    await assert.rejects(
      () => runScript({ targets: ["a"], maxAgents }, typedMalformed),
      /required 3, provided/,
    );
    assert.equal(typedMalformed.calls.length, 0, "non-scalar caps never dispatch");
  }
});

test("duplicate targets retain distinct positional coverage rows", async () => {
  const result = await runScript({ targets: ["same", "same"] }, makeAgentStub());
  assert.deepEqual(result.coverage.map((row) => [row.index, row.target]), [[0, "same"], [1, "same"]]);
});

test("legacy, null, or incomplete results are unverified or unavailable and cannot let a PASS judge override inconclusive", async () => {
  const calls = [];
  async function stub(prompt, opts) {
    calls.push(opts);
    if (opts.phase === "Judge") return { verdict: "PASS", evidence: ["invented.md"] };
    if (opts.phase === "Read") return "I could access the source";
    return { status: "complete", finding: "claim", sources: [], reason: "access failed but trust me" };
  }
  const result = await runScript({ targets: ["a"] }, stub);
  assert.equal(result.verdict, "inconclusive");
  assert.deepEqual(result.evidence, []);
  assert.equal(result.coverage[0].read.status, "unverified");
  assert.equal(result.coverage[0].research.status, "unverified");
  assert.equal(result.cost.agents, 3);
});

test("judge receives attributed findings and limitations rather than public coverage alone", async () => {
  let judgePrompt = "";
  async function stub(prompt, opts) {
    if (opts.phase === "Judge") {
      judgePrompt = prompt;
      return { verdict: "inconclusive", evidence: [] };
    }
    if (opts.phase === "Research" && opts.label === "research:0:a") {
      return { status: "complete", finding: "DISTINCT SUCCESS FINDING", sources: ["refs/good.md"], reason: "inspected" };
    }
    if (opts.phase === "Research") {
      return { status: "complete", finding: "Could not open denied.md: access denied.", sources: ["refs/denied.md"], reason: "reported failure" };
    }
    return { status: "unavailable", finding: "", sources: [], reason: "not accessible" };
  }
  await runScript({ targets: ["a", "b"] }, stub);
  assert.match(judgePrompt, /DISTINCT SUCCESS FINDING/);
  assert.match(judgePrompt, /Could not open denied\.md: access denied\./);
  assert.match(judgePrompt, /"index":1/);
  assert.match(judgePrompt, /refs\/denied\.md/);
});

test("mixed valid and fabricated judge citations make PASS inconclusive without laundering the verdict", async () => {
  async function stub(prompt, opts) {
    if (opts.phase === "Judge") return { verdict: "PASS", evidence: ["refs/good.md", "invented.md"] };
    if (opts.phase === "Research" && opts.label === "research:0:a") {
      return { status: "complete", finding: "verified", sources: ["refs/good.md"], reason: "inspected" };
    }
    return { status: "unavailable", finding: "", sources: [], reason: "not accessible" };
  }
  const result = await runScript({ targets: ["a", "b"] }, stub);
  assert.equal(result.verdict, "inconclusive");
  assert.deepEqual(result.evidence, ["refs/good.md"]);
  assert.equal(result.coverage[1].research.status, "unavailable");
});

test("legitimate partial coverage can pass when every judge citation is attributable", async () => {
  async function stub(prompt, opts) {
    if (opts.phase === "Judge") return { verdict: "PASS", evidence: ["refs/good.md"] };
    if (opts.phase === "Research" && opts.label === "research:0:a") {
      return { status: "complete", finding: "verified", sources: ["refs/good.md"], reason: "inspected" };
    }
    return { status: "unavailable", finding: "", sources: [], reason: "not accessible" };
  }
  const result = await runScript({ targets: ["a", "b"] }, stub);
  assert.equal(result.verdict, "PASS");
  assert.deepEqual(result.evidence, ["refs/good.md"]);
  assert.equal(result.coverage[1].research.status, "unavailable");
});

test("missing parallel or pipeline result slots remain not-run without removing their coverage", async () => {
  const result = await runScript(
    { targets: ["a", "b"] },
    makeAgentStub(),
    {
      parallelImpl: async (thunks) => [await thunks[0]],
      pipelineImpl: async (items, stage) => [await stage(items[0])],
    },
  );
  assert.equal(result.coverage[1].read.status, "not-run");
  assert.equal(result.coverage[1].research.status, "not-run");
  assert.equal(result.cost.agents, 2, "only dispatched callbacks count as attempted calls");
});
