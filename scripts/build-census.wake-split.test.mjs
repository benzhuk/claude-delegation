// node --test scripts/build-census.wake-split.test.mjs
//
// Lane 51 (wr-2026-09-28-fable-wave), step 1: W1 (the wake-opened/stopBlock-opened/other
// split, pinned by m2), W1b (the coalescable-hold simulation, M4), and M6 (cache_creation
// per turn on the wake and other sides). Red at base a6efbbe (the field is absent); green
// at this lane's head.
//
// Fixture (all times relative to T0 = 2026-09-29T00:00:00.000Z, one model throughout,
// `claude-fable-5-1`):
//   A  wake (RESULT) at T0            -> run A: 2 requests (150/15/7/30 total)
//   D  wake (RESULT) at T0+4min       -> run D: 2 requests (req D1 80/8/4/16, req D2 40/4/2/8)
//   B  plain human message at T0+5min -> run B (other): 1 request (200/20/10/40)
//   C  wake (ASK) at T0+8min          -> run C: 1 request (60/6/3/12)
//   E  Stop-hook feedback at T0+9min  -> run E (stopBlock): 1 request (30/3/1/6)
//
// leadTurns = 5 = wakeTurns(3: A, D, C) + stopBlockTurns(1: E) + otherTurns(1: B).
// Only A and D are RESULT and not the Done-tick, so only they are eligible for W1b's hold;
// D arrives 4 minutes after A (under the 10-minute hold), so D is the one coalescable turn,
// and its own two requests give upper (162, both requests) a different total from lower
// (108, the first request alone) — proving the two bounds are computed separately.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  censusLeadFile, runCensus, formatText, formatJson, WAKE_SPLIT_HOLD_MINUTES, WAKE_PREFIX,
} from './build-census.mjs';
import { buildEnvelope } from '../skills/multi/scripts/envelope.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL = 'claude-fable-5-1';
const AT = { date: '9.29.26', time: '00:00', tz: 'NYC' };

const tracked = [];
after(() => { for (const d of tracked) fs.rmSync(d, { recursive: true, force: true }); });
function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}

const T0 = Date.parse('2026-09-29T00:00:00.000Z');
const iso = (offsetMs) => new Date(T0 + offsetMs).toISOString();

function userWake(offsetMs, env) {
  return {
    type: 'user', timestamp: iso(offsetMs), isMeta: true,
    origin: { kind: 'peer', from: 'note-flush' },
    message: { role: 'user', content: `Another Claude session sent a message:\n${env}` },
  };
}
function userPlain(offsetMs, text) {
  return { type: 'user', timestamp: iso(offsetMs), message: { role: 'user', content: text } };
}
function userStopFeedback(offsetMs, slug) {
  const header = `1 new peer note for ${slug} (the multi skill; the ledger is the channel):`;
  return {
    type: 'user', timestamp: iso(offsetMs), isMeta: true,
    message: { role: 'user', content: `Stop hook feedback:\n${header}\n  x\n\n${'Handle these before you stop: ACK what you are taking, answer what you can, or send BLOCKED with the reason. If none of it is for you, say so in one line and stop.'}` },
  };
}
function assistantLine(offsetMs, requestId, usage) {
  return {
    type: 'assistant', timestamp: iso(offsetMs), requestId,
    message: { id: `msg-${requestId}`, model: MODEL, usage, content: [{ type: 'text', text: 'ok' }] },
  };
}
function agg(input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens) {
  return { input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens };
}

function buildFixtureLines() {
  const envA = buildEnvelope({ from: 'skills-fable', to: 'skills-o', id: 'skills-fable-wave-1', kind: 'RESULT', body: 'Wake A, coalescable wave starter', ...AT });
  const envD = buildEnvelope({ from: 'skills-fable', to: 'skills-o', id: 'skills-fable-wave-2', kind: 'RESULT', body: 'Wake D, 4 minutes after A', ...AT });
  const envC = buildEnvelope({ from: 'skills-fable', to: 'skills-o', id: 'skills-fable-wave-3', kind: 'ASK', body: 'Wake C, ASK kind never coalesces', ...AT });
  return [
    userWake(0, envA),
    assistantLine(5000, 'reqA1', agg(100, 10, 5, 20)),
    assistantLine(10000, 'reqA2', agg(50, 5, 2, 10)),
    userWake(4 * 60000, envD),
    assistantLine(4 * 60000 + 5000, 'reqD1', agg(80, 8, 4, 16)),
    assistantLine(4 * 60000 + 15000, 'reqD2', agg(40, 4, 2, 8)),
    userPlain(5 * 60000, 'Please also check the other thing while you are at it.'),
    assistantLine(5 * 60000 + 5000, 'reqB1', agg(200, 20, 10, 40)),
    userWake(8 * 60000, envC),
    assistantLine(8 * 60000 + 5000, 'reqC1', agg(60, 6, 3, 12)),
    userStopFeedback(9 * 60000, 'skills-o'),
    assistantLine(9 * 60000 + 5000, 'reqE1', agg(30, 3, 1, 6)),
  ];
}

function writeFixture(dir) {
  const p = path.join(dir, 'lead.jsonl');
  fs.writeFileSync(p, buildFixtureLines().map((o) => JSON.stringify(o)).join('\n') + '\n');
  return p;
}

test('W1/m2: wakeTurns/stopBlockTurns/otherTurns partition leadTurns, and byModel sums back to windowByModel', async () => {
  const dir = mkTmp('build-census-wake-split-');
  const lead = path.join(dir, 'lead.jsonl');
  fs.writeFileSync(lead, buildFixtureLines().map((o) => JSON.stringify(o)).join('\n') + '\n');
  const census = await censusLeadFile(lead, {});
  assert.equal(census.leadTurns, 5);
  const { wakeSplit } = census;
  assert.equal(wakeSplit.wakeTurns, 3);
  assert.equal(wakeSplit.stopBlockTurns, 1);
  assert.equal(wakeSplit.otherTurns, 1);
  assert.equal(wakeSplit.wakeTurns + wakeSplit.stopBlockTurns + wakeSplit.otherTurns, census.leadTurns);

  assert.deepEqual(wakeSplit.byModel.wake[MODEL], agg(330, 33, 16, 66));
  assert.deepEqual(wakeSplit.byModel.other[MODEL], agg(200, 20, 10, 40));
  assert.deepEqual(wakeSplit.byModel.stopBlock[MODEL], agg(30, 3, 1, 6));

  // per model, per column: wake + stopBlock + other == windowByModel (the whole-file window here)
  const windowByModel = {};
  for (const entry of census.windowById.values()) {
    if (!windowByModel[entry.model]) windowByModel[entry.model] = agg(0, 0, 0, 0);
    windowByModel[entry.model].input_tokens += entry.usage.input_tokens;
    windowByModel[entry.model].cache_creation_input_tokens += entry.usage.cache_creation_input_tokens;
    windowByModel[entry.model].cache_read_input_tokens += entry.usage.cache_read_input_tokens;
    windowByModel[entry.model].output_tokens += entry.usage.output_tokens;
  }
  for (const col of ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens']) {
    const sum = wakeSplit.byModel.wake[MODEL][col] + wakeSplit.byModel.stopBlock[MODEL][col] + wakeSplit.byModel.other[MODEL][col];
    assert.equal(sum, windowByModel[MODEL][col], col);
  }
});

test('W1b/M4: only RESULT, non-Done-tick wakes coalesce; D (4 minutes after A) is the one coalescable turn, with distinct upper/lower bounds', async () => {
  const dir = mkTmp('build-census-wake-split-');
  const lead = writeFixture(dir);
  const census = await censusLeadFile(lead, {});
  assert.deepEqual(census.wakeSplit.coalescable, {
    holdMinutes: WAKE_SPLIT_HOLD_MINUTES,
    turns: 1,
    upperByModel: { [MODEL]: agg(120, 12, 6, 24) },
    lowerByModel: { [MODEL]: agg(80, 8, 4, 16) },
    resultTurns: 2,
    resultByModel: { [MODEL]: agg(270, 27, 13, 54) },
  });
});

test('runCensus/formatJson: shareByModel sums to 100.0 per model, cacheCreationPerTurn is exact, wakeSplitUnavailable is null for a Claude lead', async () => {
  const dir = mkTmp('build-census-wake-split-');
  const lead = writeFixture(dir);
  const report = await runCensus({ lead, tasksDirs: [], marker: null });
  const { wakeSplit } = report.lead;
  assert.equal(report.lead.wakeSplitUnavailable, null);
  assert.deepEqual(wakeSplit.shareByModel[MODEL], { wake: 58.9, stopBlock: 5.3, other: 35.8 });
  assert.equal(wakeSplit.shareByModel[MODEL].wake + wakeSplit.shareByModel[MODEL].stopBlock + wakeSplit.shareByModel[MODEL].other, 100.0);
  assert.deepEqual(wakeSplit.cacheCreationPerTurn, { wake: { [MODEL]: 11 }, other: { [MODEL]: 20 } });

  const json = JSON.parse(formatJson(report));
  assert.deepEqual(json.lead.wakeSplit.coalescable, { holdMinutes: 10, turns: 1, upperByModel: { [MODEL]: agg(120, 12, 6, 24) }, lowerByModel: { [MODEL]: agg(80, 8, 4, 16) }, resultTurns: 2, resultByModel: { [MODEL]: agg(270, 27, 13, 54) } });

  const text = formatText(report);
  assert.match(text, /^- wakeSplit: wake 3, stopBlock 1, other 1 \(coalescable 1 at hold 10m/m);
  assert.match(text, /^### Wake-opened turns against the rest \(window\)$/m);
  assert.match(text, /^- wakeTurns: 3, stopBlockTurns: 1, otherTurns: 1$/m);
  assert.match(text, new RegExp(`^\\| wake \\| ${MODEL} \\| 330 \\| 33 \\| 16 \\| 66 \\| 445 \\| 58\\.9% \\|$`, 'm'));
  assert.match(text, new RegExp(`^- cache_creation per turn \\(M6\\) — wake: ${MODEL}=11\\.0; other: ${MODEL}=20\\.0$`, 'm'));
  assert.match(text, new RegExp(`^- coalescable \\(W1b, hold 10m, RESULT wakes only, Done-tick excluded\\): turns 1, upper ${MODEL}=162, lower ${MODEL}=108; ceiling \\(every RESULT wake turn\\) turns 2, ${MODEL}=364$`, 'm'));
});

test('a Codex lead reports wakeSplit unavailable and prints the fixed sentence', async () => {
  const codexLead = path.join(HERE, 'build-census.fixtures', 'completeness', 'codex-lead.jsonl');
  const report = await runCensus({ lead: codexLead, tasksDirs: [] });
  assert.equal(report.lead.host, 'codex');
  assert.equal(report.lead.wakeSplit, null);
  assert.equal(report.lead.wakeSplitUnavailable, 'codex lead');
  const text = formatText(report);
  assert.match(text, /^- wakeSplit: unavailable \(codex lead\)$/m);
  const json = JSON.parse(formatJson(report));
  assert.equal(json.lead.wakeSplit, null);
  assert.equal(json.lead.wakeSplitUnavailable, 'codex lead');
});

test('a wake line whose next run starts after an intervening plain human message opens as `other`, not `wake` (last qualifying line wins)', async () => {
  const dir = mkTmp('build-census-wake-split-');
  const lead = path.join(dir, 'lead.jsonl');
  const env = buildEnvelope({ from: 'skills-fable', to: 'skills-o', id: 'skills-fable-wave-4', kind: 'RESULT', body: 'A wake, superseded by a human message before the run opens', ...AT });
  const lines = [
    userWake(0, env),
    userPlain(1000, 'Actually, ignore that — do this instead.'),
    assistantLine(2000, 'reqX1', agg(10, 1, 1, 1)),
  ];
  fs.writeFileSync(lead, lines.map((o) => JSON.stringify(o)).join('\n') + '\n');
  const census = await censusLeadFile(lead, {});
  assert.equal(census.wakeSplit.wakeTurns, 0);
  assert.equal(census.wakeSplit.otherTurns, 1);
  assert.deepEqual(census.wakeSplit.byModel.other[MODEL], agg(10, 1, 1, 1));
});

// R1 fix round: MINOR 2, MINOR 3, MINOR 5's own small fixtures. `wake`/`asst`/`toolResult`/`run`
// build a RESULT wake, a 1-token assistant line, and a tool-result-only user line respectively,
// without the full fixture's other kinds.
const M = 60000;
const envR = (n) => buildEnvelope({ from: 'skills-a', to: 'skills-o', id: `skills-a-w-${n}`, kind: 'RESULT', body: 'x', ...AT });
const wake = (ms, n) => ({ type: 'user', timestamp: iso(ms), isMeta: true, origin: { kind: 'peer', from: 'note-flush' }, message: { role: 'user', content: `${WAKE_PREFIX}\n${envR(n)}` } });
const asst = (ms, rid) => assistantLine(ms, rid, agg(1, 0, 0, 0));
const toolResult = (ms) => ({ type: 'user', timestamp: iso(ms), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } });
async function run(lines, opts = {}) {
  const dir = mkTmp('build-census-wake-edge-');
  const p = path.join(dir, 'lead.jsonl');
  fs.writeFileSync(p, lines.map((o) => JSON.stringify(o)).join('\n') + '\n');
  return censusLeadFile(p, opts);
}

test('W1/--from: a run opened by a wake before --from and still running at --from is wake-opened, so wakeTurns can exceed the window wake lines by one', async () => {
  const c = await run([wake(-M, 1), asst(-50000, 'a'), toolResult(100), asst(5000, 'b')], { from: iso(0) });
  assert.equal(c.leadTurns, 1);
  assert.equal(c.wakes, 0);
  assert.equal(c.wakeSplit.wakeTurns, 1);
});

test('W1b/window edge (straddle2): a RESULT wave that starts just before the window still absorbs an in-window RESULT less than N minutes later', async () => {
  const c = await run([
    wake(-M, 1), asst(-55000, 'r1'),
    userPlain(-40000, 'anything'), asst(-35000, 'r2'),
    wake(3 * M, 2), asst(3 * M + 1000, 'r3'),
  ], { from: iso(0) });
  assert.equal(c.wakeSplit.coalescable.turns, 1);
});

test('W1b: a wave is measured from its START, not from the previous wake (0, 6, 12 min -> 1 coalescable)', async () => {
  const c = await run([wake(0, 1), asst(1000, 'a'), wake(6 * M, 2), asst(6 * M + 1000, 'b'), wake(12 * M, 3), asst(12 * M + 1000, 'c')]);
  assert.equal(c.wakeSplit.coalescable.turns, 1);
});

test('W1b: a wake exactly N minutes after the wave start starts a new wave (less than N coalesces)', async () => {
  const c = await run([wake(0, 1), asst(1000, 'a'), wake(10 * M, 2), asst(10 * M + 1000, 'b')]);
  assert.equal(c.wakeSplit.coalescable.turns, 0);
  const d = await run([wake(0, 1), asst(1000, 'a'), wake(10 * M - 1, 2), asst(10 * M + 1000, 'b')]);
  assert.equal(d.wakeSplit.coalescable.turns, 1);
});
