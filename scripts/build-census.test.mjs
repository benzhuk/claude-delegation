// node --test scripts/build-census.test.mjs
//
// Every ad-hoc fixture here is a real temp directory built with mkdtempSync under
// os.tmpdir() — never the real ~/.claude. The COMMITTED fixtures under
// scripts/build-census.fixtures/ are the ones gate-10 (the integrator's `census` gate)
// runs the CLI against directly; this file's expectations for them are hand-computed
// below and must stay in sync with the fixture files.
//
// Two committed fixture groups:
//   - lead.jsonl + tasks/            — the original de-dup proof (unchanged; gate-10
//                                       runs the CLI against exactly this pair).
//   - lead-multi.jsonl (+ its own    — trimmed fixtures for census-complete's new
//     lead-multi/subagents/) and       requirements: multi-dir counting, the default
//     workflow-tasks/ (+ journal.jsonl) subagents glob, role mapping (journal + an
//                                       unassigned file), and leadTurns with tool
//                                       results and a notification interleaved.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArgs, runCensus, formatText, formatJson, main, censusLeadFile, censusSubFile } from './build-census.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_LEAD = path.join(HERE, 'build-census.fixtures', 'lead.jsonl');
const FIXTURES_TASKS = path.join(HERE, 'build-census.fixtures', 'tasks');
const FIXTURES_LEAD_MULTI = path.join(HERE, 'build-census.fixtures', 'lead-multi.jsonl');
const FIXTURES_LEAD_MULTI_DEFAULT_DIR = path.join(HERE, 'build-census.fixtures', 'lead-multi', 'subagents');
const FIXTURES_WORKFLOW_TASKS = path.join(HERE, 'build-census.fixtures', 'workflow-tasks');
const FIXTURES_LEAD_WORKFLOW = path.join(HERE, 'build-census.fixtures', 'lead-workflow.jsonl');
const FIXTURES_CODEX_LEAD = path.join(HERE, 'build-census.fixtures', 'codex-lead.jsonl');

const tracked = [];
function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}
after(() => {
  for (const d of tracked) fs.rmSync(d, { recursive: true, force: true });
});

function usage({ input = 0, cacheCreation = 0, cacheRead = 0, output = 0 } = {}) {
  return {
    input_tokens: input,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
    output_tokens: output,
  };
}
function userLine(content, ts) {
  return { type: 'user', timestamp: ts, message: { role: 'user', content } };
}
function toolResultLine(ts, toolUseId = 'tu') {
  return { type: 'user', timestamp: ts, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }] } };
}
function asstLine({ requestId, id, model = 'claude-sonnet-5', ts, usageOpts = {} }) {
  const message = { role: 'assistant', model, usage: usage(usageOpts) };
  if (id) message.id = id;
  const obj = { type: 'assistant', timestamp: ts, message };
  if (requestId) obj.requestId = requestId;
  return obj;
}
function writeJsonl(filePath, objs) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, objs.map((o) => (typeof o === 'string' ? o : JSON.stringify(o))).join('\n') + '\n', 'utf8');
}

// ── parseArgs ────────────────────────────────────────────────────────────────

test('parseArgs: --lead is required; --tasks may be omitted entirely (the default subagents glob can stand alone)', () => {
  assert.throws(() => parseArgs([]), /--lead/);
  const opts = parseArgs(['--lead', 'x.jsonl']);
  assert.deepEqual(opts, { lead: 'x.jsonl', tasksDirs: [], marker: null, out: null, json: null, roleMap: null });
});

test('parseArgs: --tasks may repeat, accumulating into tasksDirs in CLI order', () => {
  const opts = parseArgs(['--lead', 'a.jsonl', '--tasks', 'dir1', '--tasks', 'dir2', '--marker', 'text here', '--out', 'out.md', '--json', 'out.json']);
  assert.deepEqual(opts, { lead: 'a.jsonl', tasksDirs: ['dir1', 'dir2'], marker: 'text here', out: 'out.md', json: 'out.json', roleMap: null });
});

test('parseArgs: --role-map parses its JSON value', () => {
  const opts = parseArgs(['--lead', 'a.jsonl', '--role-map', '{"agent-x":"seam-reviewer"}']);
  assert.deepEqual(opts.roleMap, { 'agent-x': 'seam-reviewer' });
});

test('parseArgs: invalid --role-map JSON throws', () => {
  assert.throws(() => parseArgs(['--lead', 'a.jsonl', '--role-map', 'not json']), /--role-map is not valid JSON/);
});

test('parseArgs: an unknown flag throws', () => {
  assert.throws(() => parseArgs(['--lead', 'a', '--nope']), /unknown argument/);
});

test('parseArgs: a trailing flag with no value throws instead of silently swallowing the next flag', () => {
  assert.throws(() => parseArgs(['--lead', 'a', '--marker']), /--marker needs a value/);
  assert.throws(() => parseArgs(['--lead', 'a', '--out']), /--out needs a value/);
  assert.throws(() => parseArgs(['--lead', 'a', '--json']), /--json needs a value/);
  assert.throws(() => parseArgs(['--lead', 'a', '--role-map']), /--role-map needs a value/);
  assert.throws(() => parseArgs(['--lead', 'a', '--tasks']), /--tasks needs a value/);
});

// ── Codex lead — per-response usage only, with explicit conversational-turn limit ──

test('runCensus detects a verified Codex session and sums response-local usage without adding cumulative turn/thread snapshots', async () => {
  const report = await runCensus({ lead: FIXTURES_CODEX_LEAD, tasksDirs: [], marker: null, out: null });
  assert.equal(report.lead.host, 'codex');
  assert.equal(report.lead.totalTurns, null, 'observed response ids are not a complete census request count');
  assert.equal(report.lead.leadTurns, null, 'native turn ids must not be relabeled as conversational leadTurns');
  assert.equal(report.lead.observedNativeTurnCount, 2);
  assert.equal(report.lead.coverageSupported, false);
  assert.equal(report.subagents.totalTurns, null);
  assert.equal(report.subagents.totalByModel, null);
  assert.equal(report.subagents.totalByRole, null);
  assert.equal(report.subagents.roleFileCounts, null);
  assert.equal(report.lead.totalByModel, null);
  assert.equal(report.combined, null);
  assert.deepEqual(report.lead.observedTotalByModel, {
    unknown: { input_tokens: 135, cache_creation_input_tokens: 10, cache_read_input_tokens: 25, output_tokens: 12 },
  }, 'only payload.usage is response-local; cumulative turn/thread fields are ignored');
  const text = formatText(report);
  assert.ok(text.includes('- leadHost: codex'));
  assert.ok(text.includes('- leadTurnsLimit: unsupported'));
  assert.ok(text.startsWith('VERDICT: UNSUPPORTED Codex complete census'));
  assert.ok(text.includes('- observedLeadTokens: 182 (verified deduplicated per-response usage; incomplete coverage)'));
  assert.ok(text.includes('- observedNativeTurnCountWindow: 2 (native turn ids; not leadTurns)'));
  assert.ok(text.includes('- codexSubagents: unsupported'));
});

test('Codex marker scopes per-response usage and native turn ids without inventing a build id', async () => {
  const report = await runCensus({ lead: FIXTURES_CODEX_LEAD, tasksDirs: [], marker: 'CODEX-WINDOW', out: null });
  assert.equal(report.lead.windowTurns, null);
  assert.equal(report.lead.observedNativeTurnCountWindow, 1);
  assert.equal(report.lead.windowByModel, null);
  assert.deepEqual(report.lead.observedWindowByModel, {
    unknown: { input_tokens: 30, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 3 },
  });
});

test('Codex seam: unsupported header carries its dedicated timestamp and disabled Claude discovery creates no child-directory incompleteness', async () => {
  const report = await runCensus({ lead: FIXTURES_CODEX_LEAD, tasksDirs: [], marker: null, out: null });
  assert.equal(report.defaultSubagentsDir, null, 'Codex must not probe the Claude default child directory');
  assert.deepEqual(report.subagents.unreadableDirs, []);
  const text = formatText(report);
  assert.match(text.split('\n')[0], /^VERDICT: UNSUPPORTED .*leadLastMessageAt: 2026-09-25T09:00:04\.000Z$/);
  assert.ok(!text.includes('census INCOMPLETE'));
});

test('Codex attribution failures throw instead of becoming a zero-token census', async () => {
  const dir = mkTmp('build-census-codex-bad-');
  const bad = path.join(dir, 'bad.jsonl');
  writeJsonl(bad, [
    { type: 'session_meta', payload: { id: 'expected', session_id: 'expected' } },
    { type: 'token_usage_record', payload: { session_id: 'wrong', response_id: 'r', turn_id: 't', usage: { input_tokens: 1, output_tokens: 1 } } },
  ]);
  await assert.rejects(() => runCensus({ lead: bad, tasksDirs: [], marker: null, out: null }), /lacks verified session/);
});

test('a verified Codex session without per-response usage is explicitly unsupported, never COUNTED 0', async () => {
  const dir = mkTmp('build-census-codex-no-usage-');
  const lead = path.join(dir, 'codex.jsonl');
  writeJsonl(lead, [
    { type: 'session_meta', payload: { id: 'codex-empty', session_id: 'codex-empty' } },
    { type: 'event_msg', payload: { type: 'token_count' } },
  ]);
  const report = await runCensus({ lead, tasksDirs: [], marker: null, out: null });
  assert.equal(report.lead.host, 'codex');
  assert.equal(report.lead.coverageSupported, false);
  assert.equal(report.lead.windowTurns, null);
  const text = formatText(report);
  assert.ok(text.startsWith('VERDICT: UNSUPPORTED Codex complete census'));
  assert.ok(text.includes('- leadTokens: unsupported (no token_usage_record rows with per-response usage; complete coverage is not established)'));
  assert.ok(!text.includes('### Lead tokens by model'), 'unsupported usage must not be followed by a zero-looking token table');
  assert.ok(!text.includes('### Subagent tokens') && !text.includes('## Combined split'), 'unsupported native child usage must not render role or combined-spend tables');
});

test('a Codex marker window without response records stays unknown rather than becoming a counted zero', async () => {
  const dir = mkTmp('build-census-codex-empty-window-');
  const lead = path.join(dir, 'window.jsonl');
  writeJsonl(lead, [
    { type: 'session_meta', payload: { id: 'codex-window', session_id: 'codex-window' } },
    { type: 'token_usage_record', payload: { session_id: 'codex-window', response_id: 'before', turn_id: 'turn', usage: { input_tokens: 1, output_tokens: 1 } } },
    { type: 'event_msg', payload: { type: 'marker', note: 'WINDOW-END' } },
  ]);
  const report = await runCensus({ lead, tasksDirs: [], marker: 'WINDOW-END', out: null });
  assert.equal(report.lead.windowTurns, null);
  assert.equal(report.lead.observedLeadTokens, null);
  assert.equal(report.lead.observedNativeTurnCountWindow, null);
  assert.equal(JSON.parse(formatJson(report)).lead.windowTurns, null);
  const text = formatText(report);
  assert.ok(text.startsWith('VERDICT: UNSUPPORTED'));
  assert.ok(!/\*\*0\*\*|: 0 \(|0\.00/.test(text));
});

test('Codex conflicting repeated response ids fail visibly while identical repeats remain observations', async () => {
  const dir = mkTmp('build-census-codex-conflict-');
  const lead = path.join(dir, 'conflict.jsonl');
  const meta = { type: 'session_meta', payload: { id: 'codex-conflict', session_id: 'codex-conflict' } };
  const row = { type: 'token_usage_record', payload: { session_id: 'codex-conflict', response_id: 'same', turn_id: 'one', usage: { input_tokens: 1, output_tokens: 1 } } };
  writeJsonl(lead, [meta, row, { type: 'token_usage_record', payload: { ...row.payload, turn_id: 'two' } }]);
  await assert.rejects(() => runCensus({ lead, tasksDirs: [], marker: null, out: null }), /conflicting turn or usage/);
});

test('a truncated Codex stream with a token record before metadata fails visibly instead of falling through to Claude', async () => {
  const dir = mkTmp('build-census-codex-truncated-');
  const lead = path.join(dir, 'truncated.jsonl');
  writeJsonl(lead, [
    { type: 'event_msg', payload: { type: 'token_count' } },
    { type: 'token_usage_record', payload: { session_id: 'missing-meta', response_id: 'r', turn_id: 't', usage: { input_tokens: 1, output_tokens: 1 } } },
  ]);
  await assert.rejects(() => runCensus({ lead, tasksDirs: [], marker: null, out: null }), /lacks verified session|session_meta was not found/);
});

test('a Codex-shaped event-only truncated stream fails visibly instead of becoming a zero-token Claude census', async () => {
  const dir = mkTmp('build-census-codex-event-only-');
  const lead = path.join(dir, 'event-only.jsonl');
  writeJsonl(lead, [{ type: 'response_item', payload: { role: 'assistant' } }]);
  await assert.rejects(() => runCensus({ lead, tasksDirs: [], marker: null, out: null }), /session_meta was not found/);
});

test('a recognized Codex stream rejects malformed JSON and native child task paths visibly', async () => {
  const dir = mkTmp('build-census-codex-malformed-');
  const lead = path.join(dir, 'malformed.jsonl');
  fs.writeFileSync(lead, `${JSON.stringify({ type: 'session_meta', payload: { id: 'codex-malformed', session_id: 'codex-malformed' } })}\nnot-json\n`, 'utf8');
  await assert.rejects(() => runCensus({ lead, tasksDirs: [], marker: null, out: null }), /contains malformed JSON/);
  await assert.rejects(() => runCensus({ lead: FIXTURES_CODEX_LEAD, tasksDirs: [dir], marker: null, out: null }), /child transcript census is unsupported/);
});

test('Codex usage rejects missing objects and negative counters instead of coercing them to zero', async () => {
  const dir = mkTmp('build-census-codex-invalid-usage-');
  const meta = { type: 'session_meta', payload: { id: 'codex-invalid', session_id: 'codex-invalid' } };
  const invalids = [null, { input_tokens: 1, output_tokens: -1 }, { input_tokens: 1, cached_input_tokens: -1, output_tokens: 1 }];
  for (let i = 0; i < invalids.length; i++) {
    const lead = path.join(dir, `invalid-${i}.jsonl`);
    writeJsonl(lead, [meta, { type: 'token_usage_record', payload: { session_id: 'codex-invalid', response_id: `r${i}`, turn_id: 't', usage: invalids[i] } }]);
    await assert.rejects(() => runCensus({ lead, tasksDirs: [], marker: null, out: null }), /invalid|lacks a valid/);
  }
});

// ── de-duplication: the fixture that proves the fix ────────────────────────

test('de-dup: a request split across 3 lines counts as 1 turn with the LAST output_tokens, not naive per-line summing', async () => {
  const raw = fs.readFileSync(FIXTURES_LEAD, 'utf8').split('\n').filter((l) => l.trim());
  // Independent, naive baseline computed straight from the fixture text (not through the
  // implementation under test): every syntactically valid line whose type is "assistant".
  let naiveTurns = 0;
  let naiveSonnetOutput = 0;
  for (const line of raw) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type === 'assistant' && obj.message && obj.message.usage) {
      naiveTurns += 1;
      if (obj.message.model === 'claude-sonnet-5') naiveSonnetOutput += obj.message.usage.output_tokens || 0;
    }
  }
  // The fixture's req-A alone spans 3 lines, so a naive per-line count is strictly higher
  // than the correct de-duped count — this is what makes the fixture discriminative.
  assert.equal(naiveTurns, 5, 'fixture sanity: 5 raw assistant lines (3 for req-A, 1 msg-B, 1 no-id)');
  assert.equal(naiveSonnetOutput, 50 + 120 + 200 + 10, 'naive sonnet output sum (would over-count req-A 3x)');

  const { totalById } = await censusLeadFile(FIXTURES_LEAD, {});
  assert.equal(totalById.size, 3, 'deduped: req-A, msg-B and the no-id line are each exactly one turn');
  assert.notEqual(totalById.size, naiveTurns, 'a naive implementation would disagree with the correct one on this fixture');

  const sonnetOutput = [...totalById.values()]
    .filter((e) => e.model === 'claude-sonnet-5')
    .reduce((s, e) => s + e.usage.output_tokens, 0);
  assert.equal(sonnetOutput, 200 + 10, 'req-A contributes only its LAST line (200), not 50+120+200');
  assert.notEqual(sonnetOutput, naiveSonnetOutput, 'a naive implementation would over-count output_tokens on this fixture');
});

test('de-dup: subagent split-request.output collapses req-X to 1 turn (last output_tokens=75)', async () => {
  const { byId } = await censusSubFile(path.join(FIXTURES_TASKS, 'split-request.output'), {});
  assert.equal(byId.size, 2, 'req-X (deduped) + req-Y');
  const reqX = [...byId.values()].find((e) => e.usage.output_tokens === 75);
  assert.ok(reqX, 'req-X kept only its last line');
  assert.equal(reqX.usage.input_tokens, 300);
  assert.equal(reqX.usage.cache_read_input_tokens, 50);
});

test('id fallback chain: requestId, then message.id, then a per-line unique id', async () => {
  const { totalById } = await censusLeadFile(FIXTURES_LEAD, {});
  const ids = [...totalById.keys()];
  assert.ok(ids.some((k) => k === 'req:req-A'), 'requestId branch');
  assert.ok(ids.some((k) => k === 'msg:msg-B'), 'message.id fallback branch (msg-B carries no requestId)');
  assert.ok(ids.some((k) => k.startsWith('line:')), 'per-line-unique fallback branch (the final line has neither field)');
});

test('id resolution: a turn whose lines have MIXED id presence (one carries only message.id, another carries both) still counts as one turn', async () => {
  const dir = mkTmp('build-census-mixed-id-');
  const leadPath = path.join(dir, 'lead.jsonl');
  // First line only has message.id (no requestId yet known) — this is the exact repro
  // that split into 2 turns before the alias fix: 'msg:M' filed first, then 'req:RQ'
  // filed separately once the requestId shows up on a later line for the SAME message.id.
  writeJsonl(leadPath, [
    asstLine({ id: 'M', ts: '2026-01-01T00:00:00.000Z', usageOpts: { output: 1, input: 1 } }),
    asstLine({ requestId: 'RQ', id: 'M', ts: '2026-01-01T00:00:01.000Z', usageOpts: { output: 9, input: 1 } }),
  ]);
  const { totalById } = await censusLeadFile(leadPath, {});
  assert.equal(totalById.size, 1, 'both lines belong to the same logical turn');
  assert.equal([...totalById.keys()][0], 'req:RQ', 'once the alias is known, the canonical key is the requestId form');
  assert.equal(totalById.get('req:RQ').usage.output_tokens, 9, 'last-line-wins across the alias migration too');
});

test('id resolution: the alias also resolves in the other order (both ids known first, message-id-only line arrives later)', async () => {
  const dir = mkTmp('build-census-mixed-id-rev-');
  const leadPath = path.join(dir, 'lead.jsonl');
  writeJsonl(leadPath, [
    asstLine({ requestId: 'RQ2', id: 'M2', ts: '2026-01-01T00:00:00.000Z', usageOpts: { output: 1, input: 1 } }),
    asstLine({ id: 'M2', ts: '2026-01-01T00:00:01.000Z', usageOpts: { output: 9, input: 1 } }),
  ]);
  const { totalById } = await censusLeadFile(leadPath, {});
  assert.equal(totalById.size, 1);
  assert.equal(totalById.get('req:RQ2').usage.output_tokens, 9);
});

// ── the committed lead.jsonl + tasks/ fixtures, end to end (gate-10's own invocation) ──

test('runCensus over the committed lead.jsonl + tasks/ fixtures matches the hand-computed expected values', async () => {
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [FIXTURES_TASKS], marker: null, out: null });

  assert.equal(report.lead.totalTurns, 3);
  assert.equal(report.lead.windowTurns, 3); // no marker: window == whole file
  // leadTurns (conversational) vs totalTurns (id-deduped) genuinely differ on this
  // fixture: req-A's 3 lines plus msg-B plus the no-id final line are 3 DEDUPED turns,
  // but only 2 conversational runs — "continue please" is the only real user boundary
  // (the malformed line is skipped entirely, never a boundary).
  assert.equal(report.lead.leadTurns, 2);
  assert.deepEqual(report.lead.totalByModel, {
    'claude-sonnet-5': { input_tokens: 1050, cache_creation_input_tokens: 0, cache_read_input_tokens: 200, output_tokens: 210 },
    'claude-opus-5': { input_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 100, output_tokens: 30 },
  });
  assert.deepEqual(report.lead.windowByModel, report.lead.totalByModel);
  assert.equal(report.lead.windowStartAt, '2026-09-21T10:00:00.000Z');
  assert.equal(report.lead.windowEndAt, '2026-09-21T10:06:00.000Z');
  assert.equal(report.lead.turnsPerHour, 30); // 3 turns / 0.1h

  assert.equal(report.subagents.fileCount, 2); // empty.output, split-request.output
  assert.equal(report.subagents.totalTurns, 2); // empty contributes 0, split-request contributes 2
  assert.deepEqual(report.subagents.totalByModel, {
    'claude-sonnet-5': { input_tokens: 320, cache_creation_input_tokens: 0, cache_read_input_tokens: 50, output_tokens: 80 },
  });
  // Neither file appears in any journal.jsonl and no --role-map was given: both land in
  // unassigned, never silently folded into another row.
  assert.deepEqual(report.subagents.totalByRole, {
    unassigned: { input_tokens: 320, cache_creation_input_tokens: 0, cache_read_input_tokens: 50, output_tokens: 80 },
  });
  assert.deepEqual(report.subagents.roleFileCounts, { unassigned: 2 });

  assert.deepEqual(report.combined, {
    'claude-sonnet-5': { input_tokens: 1050 + 320, cache_creation_input_tokens: 0, cache_read_input_tokens: 200 + 50, output_tokens: 210 + 80 },
    'claude-opus-5': { input_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 100, output_tokens: 30 },
  });

  const text = formatText(report);
  assert.equal(text.split('\n')[0], 'VERDICT: COUNTED 3 lead requests (leadTurns 2), 2 subagent files, leadLastMessageAt: 2026-09-21T10:06:00.000Z');
  assert.ok(text.includes('\n# Build census\n'), 'the header line other tools recognise this report by must be present verbatim');
  assert.ok(text.includes('- leadTurns: 2'), 'leadTurns must be printed literally');
});

test('a lead session with no <session id>/subagents/ dir at all (the common case) contributes zero default-glob files without throwing', async () => {
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [], marker: null, out: null });
  assert.equal(report.subagents.fileCount, 0);
  assert.equal(report.defaultSubagentsDir, path.join(HERE, 'build-census.fixtures', 'lead', 'subagents'));
});

test('an UNREADABLE explicit --tasks directory throws instead of reporting 0 subagent files at exit 0', async () => {
  const fsImpl = {
    createReadStream: fs.createReadStream,
    readdirSync: () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); },
    statSync: fs.statSync,
    writeFileSync: fs.writeFileSync,
  };
  await assert.rejects(
    () => runCensus({ lead: FIXTURES_LEAD, tasksDirs: ['C:/no/such/dir'], marker: null, out: null }, fsImpl),
    /--tasks directory not readable/,
    'a mistyped or already-swept tasks dir must not render as a legitimate zero',
  );
});

test('an EMPTY but readable --tasks directory is still a legitimate zero and does not throw', async () => {
  const empty = mkTmp('build-census-empty-');
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [empty], marker: null, out: null });
  assert.equal(report.subagents.fileCount, 0);
});

test('zero-byte subagent files are treated as zero turns and never opened as a stream', async () => {
  const opened = [];
  const real = fs;
  const fsImpl = {
    readdirSync: (...a) => real.readdirSync(...a),
    statSync: (...a) => real.statSync(...a),
    writeFileSync: (...a) => real.writeFileSync(...a),
    createReadStream: (p, ...rest) => {
      opened.push(p);
      return real.createReadStream(p, ...rest);
    },
  };
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [FIXTURES_TASKS], marker: null, out: null }, fsImpl);
  assert.equal(report.subagents.fileCount, 2);
  assert.ok(!opened.some((p) => p.endsWith('empty.output')), 'a zero-byte file must never be opened as a stream');
  assert.ok(opened.some((p) => p.endsWith('split-request.output')), 'the non-empty file must still be opened');
});

test('a subagent file whose statSync throws (vanished/unreadable between readdir and stat) reports turns as n/a, never a silent 0 — n7', async () => {
  const real = fs;
  const fsImpl = {
    readdirSync: (...a) => real.readdirSync(...a),
    statSync: (p, ...rest) => {
      if (p.endsWith('split-request.output')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return real.statSync(p, ...rest);
    },
    writeFileSync: (...a) => real.writeFileSync(...a),
    createReadStream: (...a) => real.createReadStream(...a),
  };
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [FIXTURES_TASKS], marker: null, out: null }, fsImpl);
  const racedFile = report.subagents.perFile.find((f) => f.file.endsWith('split-request.output'));
  assert.equal(racedFile.turns, null, 'a statSync failure must not render as a real zero-turn count');
  const emptyFile = report.subagents.perFile.find((f) => f.file.endsWith('empty.output'));
  assert.equal(emptyFile.turns, 0, 'a genuinely zero-byte file is still a real zero, unaffected by the guard');
  const text = formatText(report);
  const expected = `| ${path.join(FIXTURES_TASKS, 'split-request.output')} | unassigned | n/a |`;
  assert.ok(text.includes(expected), `expected an n/a row for the raced file:\n${text}`);
  assert.ok(!text.includes(`| ${path.join(FIXTURES_TASKS, 'split-request.output')} | unassigned | 0 |`), 'a raced file must never print as if it were a real zero');
});

test('an unreadable subagent file is counted and surfaced at every quoted surface, not just its own row', async () => {
  const real = fs;
  const fsImpl = {
    readdirSync: (...a) => real.readdirSync(...a),
    statSync: (p, ...rest) => {
      if (p.endsWith('split-request.output')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return real.statSync(p, ...rest);
    },
    writeFileSync: (...a) => real.writeFileSync(...a),
    createReadStream: (...a) => real.createReadStream(...a),
  };
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [FIXTURES_TASKS], marker: null, out: null }, fsImpl);
  assert.equal(report.subagents.unreadable, 1, 'one raced file must be counted in subagents.unreadable');
  const text = formatText(report);
  assert.ok(text.startsWith('VERDICT: COUNTED 3 lead requests (leadTurns 2), 2 subagent files (1 UNREADABLE'),
    `VERDICT line must flag the unreadable count, not read as a clean run:\n${text.split('\n')[0]}`);
  assert.ok(text.includes('## Subagents (2 files, 1 unreadable, 0 turns total, deduped)'),
    `Subagents header must carry the unreadable count:\n${text}`);
  assert.ok(text.includes('_Incomplete: 1 subagent file(s) could not be read'),
    `must print an Incomplete note when any file is unreadable:\n${text}`);
});

test('formatText: Summary carries an INCOMPLETE bullet naming the unreadable count when a subagent file could not be read — seam S2, so accept --census cannot copy a confident-looking but short count', async () => {
  const real = fs;
  const fsImpl = {
    readdirSync: (...a) => real.readdirSync(...a),
    statSync: (p, ...rest) => {
      if (p.endsWith('split-request.output')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return real.statSync(p, ...rest);
    },
    writeFileSync: (...a) => real.writeFileSync(...a),
    createReadStream: (...a) => real.createReadStream(...a),
  };
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [FIXTURES_TASKS], marker: null, out: null }, fsImpl);
  const text = formatText(report);
  assert.ok(text.includes('- subagentFiles: 2'), `expected a subagentFiles bullet in Summary:\n${text}`);
  assert.ok(text.includes('- INCOMPLETE: 1 subagent file(s) unreadable — subagent and combined totals exclude them'),
    `expected an INCOMPLETE bullet in Summary when a file is unreadable:\n${text}`);
});

test('the healthy path (no unreadable files) prints no UNREADABLE/unreadable/Incomplete text anywhere', async () => {
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [FIXTURES_TASKS], marker: null, out: null });
  assert.equal(report.subagents.unreadable, 0);
  const text = formatText(report);
  assert.equal(text.split('\n')[0], 'VERDICT: COUNTED 3 lead requests (leadTurns 2), 2 subagent files, leadLastMessageAt: 2026-09-21T10:06:00.000Z');
  assert.ok(!/unreadable|UNREADABLE|Incomplete/.test(text), 'a clean run must never mention unreadable files');
});

test('a malformed JSON line is skipped, not thrown', async () => {
  // FIXTURES_LEAD itself contains one malformed line; censusLeadFile already ran over it
  // above without throwing. Confirm explicitly with a minimal dedicated fixture too.
  const dir = mkTmp('build-census-malformed-');
  const leadPath = path.join(dir, 'lead.jsonl');
  writeJsonl(leadPath, ['not json at all {{{', asstLine({ requestId: 'r1', ts: '2026-01-01T00:00:00.000Z', usageOpts: { output: 1 } })]);
  const { totalById } = await censusLeadFile(leadPath, {});
  assert.equal(totalById.size, 1);
});

// ── --marker / window, including a request that straddles the boundary ─────

test('--marker: window turns are deduped independently of the whole-file map, and a straddling request keeps only its LAST post-marker value (window map is last-wins, not first-wins)', async () => {
  const dir = mkTmp('build-census-marker-');
  const leadPath = path.join(dir, 'lead.jsonl');
  writeJsonl(leadPath, [
    asstLine({ requestId: 'pre', ts: '2026-01-01T00:00:00.000Z', usageOpts: { output: 1, input: 10 } }),
    // straddling: first line before the marker, then TWO lines after it — this is what
    // proves the window map applies its own last-wins de-dup rather than just keeping
    // whichever post-marker line happens to arrive first.
    asstLine({ requestId: 'straddle', ts: '2026-01-01T00:01:00.000Z', usageOpts: { output: 10, input: 100 } }),
    { type: 'user', timestamp: '2026-01-01T00:02:00.000Z', message: { role: 'user', content: 'MARK-HERE now building' } },
    asstLine({ requestId: 'straddle', ts: '2026-01-01T00:03:00.000Z', usageOpts: { output: 99, input: 100 } }),
    asstLine({ requestId: 'straddle', ts: '2026-01-01T00:03:30.000Z', usageOpts: { output: 150, input: 100 } }),
    asstLine({ requestId: 'post', ts: '2026-01-01T00:04:00.000Z', usageOpts: { output: 5, input: 20 } }),
  ]);
  const { totalById, windowById, windowStartAt } = await censusLeadFile(leadPath, { marker: 'MARK-HERE' });
  assert.equal(totalById.size, 3, 'pre, straddle, post — all deduped across the whole file');
  assert.equal(windowById.size, 2, 'straddle and post only; pre never entered the window');
  assert.equal(windowById.get('req:straddle').usage.output_tokens, 150, 'the window keeps straddle\'s LAST post-marker line, not its first');
  assert.equal(totalById.get('req:straddle').usage.output_tokens, 150, 'the whole-file map also keeps the last value overall');
  assert.equal(windowStartAt, '2026-01-01T00:02:00.000Z');
});

test('--marker given but not found in the file throws loudly instead of printing a silent zero', async () => {
  const dir = mkTmp('build-census-marker-missing-');
  const leadPath = path.join(dir, 'lead.jsonl');
  writeJsonl(leadPath, [asstLine({ requestId: 'r1', ts: '2026-01-01T00:00:00.000Z', usageOpts: { output: 1, input: 1 } })]);
  await assert.rejects(
    () => main(['--lead', leadPath, '--tasks', FIXTURES_TASKS, '--marker', 'NEVER-PRESENT'], { write: () => {} }),
    /--marker text not found/,
  );
});

test('--marker: matching a line that carries no timestamp does not false-alarm as "not found" (N1)', async () => {
  const dir = mkTmp('build-census-marker-no-ts-');
  const leadPath = path.join(dir, 'lead.jsonl');
  writeJsonl(leadPath, [
    // the marker-matching line itself has no `timestamp` field, and no earlier line
    // supplied one either — windowStartAt stays null even though the marker WAS found.
    { type: 'user', message: { role: 'user', content: 'MARK-HERE now building' } },
    asstLine({ requestId: 'r1', ts: '2026-01-01T00:05:00.000Z', usageOpts: { output: 1, input: 1 } }),
  ]);
  const { windowById, windowStartAt, markerFound } = await censusLeadFile(leadPath, { marker: 'MARK-HERE' });
  assert.equal(markerFound, true, 'the marker line was matched');
  assert.equal(windowById.size, 1, 'the window is not empty');
  assert.equal(windowStartAt, null, 'no timestamp was ever seen at or before the marker line');
  // main() must not throw on this input — a found marker with no timestamp is a real,
  // non-empty window, not the "marker not found" case.
  await assert.doesNotReject(() =>
    main(['--lead', leadPath, '--tasks', FIXTURES_TASKS, '--marker', 'MARK-HERE'], { write: () => {} }),
  );
});

test('--marker: a marker that genuinely matches nothing still throws even when no line in the file carries a timestamp (N1 counterpart)', async () => {
  const dir = mkTmp('build-census-marker-no-ts-notfound-');
  const leadPath = path.join(dir, 'lead.jsonl');
  writeJsonl(leadPath, [
    { type: 'user', message: { role: 'user', content: 'nothing to see here' } },
    asstLine({ requestId: 'r1', usageOpts: { output: 1, input: 1 } }), // no ts field
  ]);
  const { markerFound } = await censusLeadFile(leadPath, { marker: 'NEVER-PRESENT' });
  assert.equal(markerFound, false);
  await assert.rejects(
    () => main(['--lead', leadPath, '--tasks', FIXTURES_TASKS, '--marker', 'NEVER-PRESENT'], { write: () => {} }),
    /--marker text not found/,
  );
});

test('--marker windows leadTurns too, not just windowTurns: a persistent lead pane must not report the WHOLE session\'s conversational runs as if they were this build\'s — MAJOR 2 part 1', async () => {
  const { leadTurns, leadTurnsTotal } = await censusLeadFile(FIXTURES_LEAD_MULTI, { marker: 'continue please' });
  // "continue please" is the boundary immediately before the final run (req-LM5) in
  // lead-multi.jsonl — see the leadTurns=3 test above for the whole-file breakdown.
  assert.equal(leadTurnsTotal, 3, 'leadTurnsTotal is unaffected by --marker: always the whole file');
  assert.equal(leadTurns, 1, 'leadTurns is windowed: only the run(s) at/after the marker count');
});

test('runCensus exposes leadTurnsTotal alongside the windowed leadTurns, and formatText prints both when --marker is given', async () => {
  const report = await runCensus({ lead: FIXTURES_LEAD_MULTI, tasksDirs: [], marker: 'continue please', out: null });
  assert.equal(report.lead.leadTurns, 1);
  assert.equal(report.lead.leadTurnsTotal, 3);
  const text = formatText(report);
  assert.ok(text.includes('leadTurns (conversational runs — see docs/census.md): **1** (of 3 in the whole file, unwindowed)'), `expected the total to be printed alongside the windowed count:\n${text}`);
});

test('--marker: a subagent file with entries both before and after the window start excludes only the pre-window ones from every subagent total, and reports the excluded count per file, without the file disappearing — MAJOR 2 part 2', async () => {
  const dir = mkTmp('build-census-marker-sub-window-');
  const leadPath = path.join(dir, 'lead.jsonl');
  const tasksDir = path.join(dir, 'tasks');
  writeJsonl(leadPath, [
    asstLine({ requestId: 'pre', ts: '2026-01-01T00:00:00.000Z', usageOpts: { output: 1 } }),
    { type: 'user', timestamp: '2026-01-01T00:05:00.000Z', message: { role: 'user', content: 'MARK-HERE now building' } },
    asstLine({ requestId: 'post', ts: '2026-01-01T00:06:00.000Z', usageOpts: { output: 1 } }),
  ]);
  writeJsonl(path.join(tasksDir, 'agent-w.jsonl'), [
    asstLine({ requestId: 'sub-pre', ts: '2026-01-01T00:01:00.000Z', usageOpts: { output: 7, input: 3 } }), // before the window: must be excluded
    asstLine({ requestId: 'sub-post', ts: '2026-01-01T00:07:00.000Z', usageOpts: { output: 11, input: 5 } }), // after the window: must be kept
    asstLine({ requestId: 'sub-no-ts', usageOpts: { output: 2, input: 1 } }), // no timestamp at all: unknown, kept (never dropped as a guess)
  ]);
  const report = await runCensus({ lead: leadPath, tasksDirs: [tasksDir], marker: 'MARK-HERE', out: null });
  assert.equal(report.subagents.fileCount, 1, 'the file itself is never dropped, even though one of its turns is excluded');
  assert.equal(report.subagents.totalTurns, 2, 'sub-post and sub-no-ts remain; sub-pre is excluded');
  assert.equal(report.subagents.excludedByWindow, 1);
  const f = report.subagents.perFile.find((x) => x.file.endsWith('agent-w.jsonl'));
  assert.equal(f.turns, 2, 'the file shows its real in-window turn count, not 0 and not a silent disappearance');
  assert.equal(f.excludedByWindow, 1);
  assert.equal(totalTokensAcrossModels(report.subagents.totalByModel), 11 + 5 + 2 + 1, 'sub-pre\'s 7+3 must not appear in the totals at all');
  const text = formatText(report);
  assert.ok(text.includes(`Window-excluded subagent turns`), 'the exclusion must be surfaced, not silent');
  assert.ok(text.includes(`${f.file}=1`), 'per-file excluded count must be reported by name');
});

test('--marker: a subagent file whose EVERY entry is pre-window adds no role row and no role file count, but keeps its own perFile row at 0 turns — seam S3', async () => {
  const dir = mkTmp('build-census-marker-wholly-pre-');
  const leadPath = path.join(dir, 'lead.jsonl');
  const tasksDir = path.join(dir, 'tasks');
  writeJsonl(leadPath, [
    asstLine({ requestId: 'pre', ts: '2026-01-01T00:00:00.000Z', usageOpts: { output: 1 } }),
    { type: 'user', timestamp: '2026-01-01T00:05:00.000Z', message: { role: 'user', content: 'MARK-HERE now building' } },
    asstLine({ requestId: 'post', ts: '2026-01-01T00:06:00.000Z', usageOpts: { output: 1 } }),
  ]);
  writeJsonl(path.join(tasksDir, 'agent-old.jsonl'), [
    asstLine({ requestId: 'stale-1', ts: '2026-01-01T00:01:00.000Z', usageOpts: { output: 7, input: 3 } }), // wholly before the window
  ]);
  writeJsonl(path.join(tasksDir, 'agent-new.jsonl'), [
    asstLine({ requestId: 'fresh-1', ts: '2026-01-01T00:07:00.000Z', usageOpts: { output: 11, input: 5 } }),
  ]);
  const roleMap = { 'agent-old': 'stale-role' };
  const report = await runCensus({ lead: leadPath, tasksDirs: [tasksDir], marker: 'MARK-HERE', out: null, roleMap });
  assert.equal(report.subagents.fileCount, 2, 'the wholly pre-window file is never dropped from the file list');
  const oldFile = report.subagents.perFile.find((f) => f.file.endsWith('agent-old.jsonl'));
  assert.equal(oldFile.turns, 0, 'the wholly pre-window file keeps its own row, at 0 in-window turns');
  assert.equal(oldFile.excludedByWindow, 1);
  assert.equal(report.subagents.roleFileCounts['stale-role'], undefined, 'a role whose only file is wholly pre-window gets no file count row at all');
  assert.equal(report.subagents.totalByRole['stale-role'], undefined, 'and no zero-token role row either — no phantom role');
  assert.equal(report.subagents.roleFileCounts.unassigned, 1, 'the genuinely in-window file still gets its real role row');
  const text = formatText(report);
  // The per-file table still names the file's real role in its own row (that identity is
  // never hidden) — what must never appear is a phantom "stale-role" role-SUMMARY row: the
  // Summary's by-role bullet, the Roles: file-count line, and the by-role token table.
  assert.ok(text.includes('- by-role: unassigned='), `by-role Summary bullet must list only the real in-window role:\n${text}`);
  assert.ok(!text.includes('- by-role: stale-role'), `by-role Summary bullet must never carry a phantom role:\n${text}`);
  assert.ok(text.includes('Roles: unassigned=1'), `Roles: file-count line must list only the real in-window role:\n${text}`);
  assert.ok(!/^Roles:.*stale-role/m.test(text), `Roles: file-count line must never carry a phantom role:\n${text}`);
  const byRoleTable = text.slice(text.indexOf('### Subagent tokens by role'));
  assert.ok(!byRoleTable.includes('stale-role'), `the by-role token table must never carry a phantom stale-role row:\n${byRoleTable}`);
});

test('--marker: a subagent file whose window-cutoff cannot be established (no timestamp anywhere at/before the marker) excludes nothing — no guessing', async () => {
  const dir = mkTmp('build-census-marker-sub-nocutoff-');
  const leadPath = path.join(dir, 'lead.jsonl');
  const tasksDir = path.join(dir, 'tasks');
  writeJsonl(leadPath, [
    { type: 'user', message: { role: 'user', content: 'MARK-HERE now building' } }, // no timestamp on the marker line
    asstLine({ requestId: 'post', ts: '2026-01-01T00:06:00.000Z', usageOpts: { output: 1 } }),
  ]);
  writeJsonl(path.join(tasksDir, 'agent-w.jsonl'), [
    asstLine({ requestId: 'sub-1', ts: '2020-01-01T00:00:00.000Z', usageOpts: { output: 9 } }),
  ]);
  const report = await runCensus({ lead: leadPath, tasksDirs: [tasksDir], marker: 'MARK-HERE', out: null });
  assert.equal(report.subagents.totalTurns, 1, 'with no window-start timestamp to compare against, nothing is excluded');
  assert.equal(report.subagents.excludedByWindow, 0);
});

// ── --out / --json ───────────────────────────────────────────────────────

test('--out writes the full markdown report to a file and stdout gets only the "wrote:" line', async () => {
  const dir = mkTmp('build-census-out-');
  const outPath = path.join(dir, 'report.md');
  const printed = [];
  const code = await main(['--lead', FIXTURES_LEAD, '--tasks', FIXTURES_TASKS, '--out', outPath], {
    write: (s) => printed.push(s),
  });
  assert.equal(code, 0);
  assert.equal(printed.length, 1);
  assert.equal(printed[0], `wrote: ${outPath}`);
  const written = fs.readFileSync(outPath, 'utf8');
  assert.ok(written.startsWith('VERDICT: COUNTED 3 lead requests (leadTurns 2), 2 subagent files'));
});

test('--json writes deterministic JSON (sorted keys) to a file', async () => {
  const dir = mkTmp('build-census-json-');
  const jsonPath = path.join(dir, 'report.json');
  await main(['--lead', FIXTURES_LEAD, '--tasks', FIXTURES_TASKS, '--json', jsonPath], { write: () => {} });
  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.equal(parsed.lead.leadTurns, 2);
  assert.equal(parsed.subagents.fileCount, 2);
});

test('without --out or --json, the full markdown report (and nothing else) goes to the write() sink', async () => {
  const printed = [];
  const code = await main(['--lead', FIXTURES_LEAD, '--tasks', FIXTURES_TASKS], { write: (s) => printed.push(s) });
  assert.equal(code, 0);
  assert.equal(printed.length, 1);
  assert.ok(printed[0].startsWith('VERDICT: COUNTED 3 lead requests (leadTurns 2), 2 subagent files'));
});

test('output is byte-stable across a re-run with no new input: markdown and JSON are identical byte-for-byte', async () => {
  const dir = mkTmp('build-census-stable-');
  const out1 = path.join(dir, 'r1.md');
  const out2 = path.join(dir, 'r2.md');
  const json1 = path.join(dir, 'r1.json');
  const json2 = path.join(dir, 'r2.json');
  await main(['--lead', FIXTURES_LEAD_MULTI, '--tasks', FIXTURES_TASKS, '--tasks', FIXTURES_WORKFLOW_TASKS, '--out', out1, '--json', json1], { write: () => {} });
  await main(['--lead', FIXTURES_LEAD_MULTI, '--tasks', FIXTURES_TASKS, '--tasks', FIXTURES_WORKFLOW_TASKS, '--out', out2, '--json', json2], { write: () => {} });
  assert.equal(fs.readFileSync(out1, 'utf8'), fs.readFileSync(out2, 'utf8'), 'markdown must be byte-identical across re-runs');
  assert.equal(fs.readFileSync(json1, 'utf8'), fs.readFileSync(json2, 'utf8'), 'JSON must be byte-identical across re-runs');
});

test('formatJson sorts object keys recursively (deterministic regardless of insertion order)', () => {
  const a = formatJson({ z: 1, a: { z: 1, a: 2 } });
  const b = formatJson({ a: { a: 2, z: 1 }, z: 1 });
  assert.equal(a, b);
});

// ── secrecy ──────────────────────────────────────────────────────────────

test('secrecy: message content and the --marker text itself never reach the report', async () => {
  const CANARY = 'zzqx-hostile-marker-not-a-real-secret-plum-otter-4471';
  const dir = mkTmp('build-census-secrecy-');
  const leadPath = path.join(dir, 'lead.jsonl');
  const tasksDir = path.join(dir, 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });
  writeJsonl(leadPath, [
    userLine(`plain human turn with the marker ${CANARY} inline`, '2026-01-01T00:00:00.000Z'),
    asstLine({ requestId: 'r1', ts: '2026-01-01T00:00:01.000Z', usageOpts: { output: 1, input: 1 } }),
  ]);
  writeJsonl(path.join(tasksDir, 'sub.output'), [
    userLine(`subagent brief mentioning ${CANARY}`, '2026-01-01T00:00:00.000Z'),
    asstLine({ requestId: 'r2', ts: '2026-01-01T00:00:01.000Z', usageOpts: { output: 1, input: 1 } }),
  ]);

  const printed = [];
  await main(['--lead', leadPath, '--tasks', tasksDir, '--marker', CANARY], { write: (s) => printed.push(s) });
  const out = printed.join('\n');
  assert.equal(out.includes(CANARY), false, 'the report must never contain message content or the marker text');
});

test('secrecy: no direct node:fs call bypasses the injected fsImpl in the streaming/marker code paths', () => {
  const src = fs.readFileSync(new URL('./build-census.mjs', import.meta.url), 'utf8');
  // Start at openLines, the ONLY createReadStream call site — starting later (e.g. at
  // censusLeadFile) would miss a regression to a bare fs.createReadStream there (m6).
  const body = src.slice(src.indexOf('async function openLines'), src.indexOf('// ─────────────────────────────────────────────────────────────────────────────\n// fsImpl'));
  assert.equal(/\bfs\s*\./.test(body), false, 'a direct node:fs call bypasses the containment wrapper');
});

// ── multi-dir --tasks, the default subagents glob, and de-dup across sources ──

test('multi-dir --tasks: files across several dirs, plus the lead\'s own default subagents glob, are all counted, each exactly once', async () => {
  const report = await runCensus({
    lead: FIXTURES_LEAD_MULTI,
    tasksDirs: [FIXTURES_TASKS, FIXTURES_WORKFLOW_TASKS],
    marker: null,
    out: null,
  });
  // tasks/ (2) + workflow-tasks/ (5) + lead-multi/subagents/ default glob (1) = 8.
  assert.equal(report.subagents.fileCount, 8);
  assert.equal(report.defaultSubagentsDir, FIXTURES_LEAD_MULTI_DEFAULT_DIR);
  assert.deepEqual(report.subagents.roleFileCounts, { build: 1, review: 1, seam: 1, integrate: 1, unassigned: 4 });
  // Every counted file is listed with its own path, exactly once.
  const paths = report.subagents.perFile.map((f) => f.file);
  assert.equal(new Set(paths).size, paths.length, 'no path is listed twice');
  assert.equal(paths.length, 8);
  assert.ok(paths.some((p) => p.endsWith('agent-default1.jsonl')), 'the default-glob file must be present');
});

test('the default subagents glob alone (no --tasks at all) counts the lead\'s own Task-tool subagents without a flag, and never widens past agent-*.jsonl — MINOR 6', async () => {
  // lead-multi/subagents/ also carries agent-default1.meta.json (real Claude Code layout:
  // every agent-<id>.jsonl has a *.meta.json sibling) and a stray notes.jsonl — neither
  // may be counted; only the one real agent-*.jsonl transcript may.
  const report = await runCensus({ lead: FIXTURES_LEAD_MULTI, tasksDirs: [], marker: null, out: null });
  assert.equal(report.subagents.fileCount, 1);
  assert.ok(report.subagents.perFile[0].file.endsWith('agent-default1.jsonl'));
  assert.equal(report.subagents.perFile[0].role, 'unassigned', 'no journal.jsonl or --role-map covers this file');
});

test('multi-dir de-dup: the same --tasks dir given twice never double-counts its files', async () => {
  const report = await runCensus({
    lead: FIXTURES_LEAD,
    tasksDirs: [FIXTURES_WORKFLOW_TASKS, FIXTURES_WORKFLOW_TASKS],
    marker: null,
    out: null,
  });
  assert.equal(report.subagents.fileCount, 5, 'workflow-tasks/ has 5 agent-*.jsonl files, not 10');
});

test('multi-dir de-dup: a file reachable through two different --tasks paths (a symlink in real life) is counted once — real path is the dedup key', async () => {
  const dir = mkTmp('build-census-symlink-');
  const dirA = path.join(dir, 'a');
  const dirB = path.join(dir, 'b');
  fs.mkdirSync(dirA, { recursive: true });
  fs.mkdirSync(dirB, { recursive: true });
  writeJsonl(path.join(dirA, 'agent-shared.jsonl'), [asstLine({ requestId: 'r1', usageOpts: { output: 1 } })]);
  writeJsonl(path.join(dirB, 'agent-shared-alias.jsonl'), [asstLine({ requestId: 'r1', usageOpts: { output: 1 } })]);
  const real = fs;
  const fsImpl = {
    readdirSync: (...a) => real.readdirSync(...a),
    statSync: (...a) => real.statSync(...a),
    writeFileSync: (...a) => real.writeFileSync(...a),
    createReadStream: (...a) => real.createReadStream(...a),
    // Simulate a symlink: two nominally different paths resolve to the same canonical
    // target, so the real fs never needs an actual OS-level symlink for this test.
    realpathSync: (p) => (p.includes('agent-shared') ? 'CANONICAL-SHARED-TARGET' : path.resolve(p)),
  };
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [dirA, dirB], marker: null, out: null }, fsImpl);
  assert.equal(report.subagents.fileCount, 1, 'both nominal paths resolve to the same real file');
});

test('multi-dir de-dup: a REAL hardlink (Claude Code\'s own tasks/<id>.output -> subagents/agent-<id>.jsonl shape) is counted once, not twice — realpath alone cannot see this (BLOCKER 1)', async () => {
  const dir = mkTmp('build-census-hardlink-');
  const subDir = path.join(dir, 'sub');
  const tasksDir = path.join(dir, 'tasks');
  fs.mkdirSync(subDir, { recursive: true });
  fs.mkdirSync(tasksDir, { recursive: true });
  const original = path.join(subDir, 'agent-x.jsonl');
  writeJsonl(original, [asstLine({ requestId: 'r1', usageOpts: { output: 42, input: 7 } })]);
  // A hardlink, not a symlink: fs.realpathSync resolves BOTH paths to themselves (they are
  // each their own canonical path) — this is exactly why the path-only de-dup missed it.
  fs.linkSync(original, path.join(tasksDir, 'x.output'));
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [tasksDir, subDir], marker: null, out: null });
  assert.equal(report.subagents.fileCount, 1, 'the hardlinked pair must be counted once, keyed by inode, not by (distinct) real path');
  assert.equal(report.subagents.totalTurns, 1);
  assert.equal(totalTokensAcrossModels(report.subagents.totalByModel), 42 + 7, 'tokens counted once, not twice');
});

function totalTokensAcrossModels(byModel) {
  let sum = 0;
  for (const a of Object.values(byModel)) sum += a.input_tokens + a.cache_creation_input_tokens + a.cache_read_input_tokens + a.output_tokens;
  return sum;
}

test('subagent row ordering: perFile is sorted by full path regardless of the order readdirSync happens to return names in, using a code-unit (not locale) comparator — MINOR 5', async () => {
  const dir = mkTmp('build-census-sortorder-');
  writeJsonl(path.join(dir, 'agent-c.jsonl'), [asstLine({ requestId: 'rc', usageOpts: { output: 1 } })]);
  writeJsonl(path.join(dir, 'agent-a.jsonl'), [asstLine({ requestId: 'ra', usageOpts: { output: 1 } })]);
  writeJsonl(path.join(dir, 'agent-b.jsonl'), [asstLine({ requestId: 'rb', usageOpts: { output: 1 } })]);
  const real = fs;
  const fsImpl = {
    // Deliberately scramble whatever order the real fs happened to return, so the
    // assertion below can only pass if runCensus sorts its own output.
    readdirSync: (p, ...rest) => real.readdirSync(p, ...rest).slice().reverse(),
    statSync: (...a) => real.statSync(...a),
    writeFileSync: (...a) => real.writeFileSync(...a),
    createReadStream: (...a) => real.createReadStream(...a),
  };
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [dir], marker: null, out: null }, fsImpl);
  const names = report.subagents.perFile.map((f) => path.basename(f.file));
  assert.deepEqual(names, ['agent-a.jsonl', 'agent-b.jsonl', 'agent-c.jsonl'], 'output order is sorted, independent of readdir order');
});

test('the default subagents glob (no --tasks) also finds Workflow-tool agents one level down (subagents/workflows/<runId>/agent-*.jsonl), not just top-level Task-tool agents — MAJOR 1', async () => {
  const report = await runCensus({ lead: FIXTURES_LEAD_WORKFLOW, tasksDirs: [], marker: null, out: null });
  // subagents/ itself has no top-level agent-*.jsonl for this lead; both files come from
  // the two workflows/<runId>/ dirs, found with NO --tasks flag at all.
  assert.equal(report.subagents.fileCount, 2);
  const roleByFile = Object.fromEntries(report.subagents.perFile.map((f) => [path.basename(f.file), f.role]));
  assert.deepEqual(roleByFile, { 'agent-x1.jsonl': 'build', 'agent-y1.jsonl': 'review' }, 'each run dir\'s own journal.jsonl labels its own agent files');
  // defaultSubagentsDir still names the base subagents/ dir (the first default spec), not
  // one of the workflows/<runId>/ subdirs.
  assert.equal(report.defaultSubagentsDir, path.join(HERE, 'build-census.fixtures', 'lead-workflow', 'subagents'));
});

// ── roles: Workflow journal labels, --role-map, and unassigned ─────────────

test('roles: journal.jsonl labels map to roles correctly (build:T1:r2, review:T1:r1, seam, integrate), and a file absent from the journal is unassigned', async () => {
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [FIXTURES_WORKFLOW_TASKS], marker: null, out: null });
  const roleByFile = Object.fromEntries(report.subagents.perFile.map((f) => [path.basename(f.file), f.role]));
  assert.deepEqual(roleByFile, {
    'agent-w1.jsonl': 'build', // label build:T1:r2 -> role is the segment before the first ':'
    'agent-w2.jsonl': 'review', // label review:T1:r1
    'agent-w3.jsonl': 'seam', // label seam (no ':' — the whole label is the role)
    'agent-w4.jsonl': 'integrate', // label integrate
    'agent-w5.jsonl': 'unassigned', // no journal entry, no --role-map entry
  });
  assert.deepEqual(report.subagents.roleFileCounts, { build: 1, review: 1, seam: 1, integrate: 1, unassigned: 1 });
});

test('roles: --role-map covers a file the journal does not, but a journal label always wins over a --role-map entry for the same file', async () => {
  const report = await runCensus({
    lead: FIXTURES_LEAD,
    tasksDirs: [FIXTURES_WORKFLOW_TASKS],
    marker: null,
    out: null,
    roleMap: { 'agent-w5': 'seam-reviewer', 'agent-w1': 'should-never-win-over-the-journal' },
  });
  const roleByFile = Object.fromEntries(report.subagents.perFile.map((f) => [path.basename(f.file), f.role]));
  assert.equal(roleByFile['agent-w5.jsonl'], 'seam-reviewer', '--role-map fills in when the journal has no entry');
  assert.equal(roleByFile['agent-w1.jsonl'], 'build', 'the journal label wins even when --role-map also names this file');
  assert.equal(report.subagents.roleFileCounts.unassigned, undefined, 'w5 is no longer unassigned once role-mapped');
});

test('roles: --role-map keyed by the BARE id (no agent- prefix) still resolves a file whose name has no prefix, e.g. a real tasks/<id>.output — MINOR 3', async () => {
  const dir = mkTmp('build-census-rolemap-output-');
  writeJsonl(path.join(dir, 'x9.output'), [asstLine({ requestId: 'r1', usageOpts: { output: 1 } })]);
  // docs/census.md documents --role-map keys in the `agent-<id>` form, but a real
  // tasks/<id>.output file's basename (with its extension stripped) has no `agent-`
  // prefix at all — the map must resolve either form to the same file.
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [dir], marker: null, out: null, roleMap: { 'agent-x9': 'seam-reviewer' } });
  assert.equal(report.subagents.perFile[0].role, 'seam-reviewer', 'agent-<id>-form key must resolve a .output file whose own basename has no agent- prefix');
});

test('the by-role markdown table is produced alongside the by-model table, in the same shape', async () => {
  const report = await runCensus({ lead: FIXTURES_LEAD, tasksDirs: [FIXTURES_WORKFLOW_TASKS], marker: null, out: null });
  const text = formatText(report);
  assert.ok(text.includes('### Subagent tokens by model — totals (deduped)'));
  assert.ok(text.includes('### Subagent tokens by role — totals (deduped)'));
  assert.ok(text.includes('| seam | 12 | 0 | 0 | 3 |'), `expected a seam row:\n${text}`);
  assert.ok(text.includes('Roles: build=1, integrate=1, review=1, seam=1, unassigned=1'), `expected a Roles summary line:\n${text}`);
});

// ── leadTurns: maximal runs of assistant messages between real (non-tool-result) user turns ──

test('leadTurns: the committed lead-multi.jsonl fixture (tool results and a task notification interleaved) counts 3 runs, distinct from the 5 id-deduped turns', async () => {
  const { totalById, leadTurns } = await censusLeadFile(FIXTURES_LEAD_MULTI, {});
  assert.equal(totalById.size, 5, 'sanity: 5 distinct requestIds, the id-dedup notion of "turn"');
  assert.equal(leadTurns, 3, 'run1 (2 assistant lines around a tool_result), run2 (same shape), run3 (final assistant) — the task notification and the plain "continue please" line both open a new run; the tool_result lines never do');
});

test('leadTurns: a minimal dedicated repro pins "a task notification opens a new turn, a tool result does not"', async () => {
  const dir = mkTmp('build-census-leadturns-');
  const leadPath = path.join(dir, 'lead.jsonl');
  writeJsonl(leadPath, [
    asstLine({ requestId: 'a1', ts: '2026-01-01T00:00:00.000Z', usageOpts: { output: 1 } }),
    toolResultLine('2026-01-01T00:00:01.000Z'),
    asstLine({ requestId: 'a2', ts: '2026-01-01T00:00:02.000Z', usageOpts: { output: 1 } }), // still run 1
    userLine('<task-notification>Task build:T1:r1 completed</task-notification>', '2026-01-01T00:00:03.000Z'), // real boundary
    asstLine({ requestId: 'b1', ts: '2026-01-01T00:00:04.000Z', usageOpts: { output: 1 } }), // run 2
  ]);
  const { leadTurns } = await censusLeadFile(leadPath, {});
  assert.equal(leadTurns, 2);
});

test('leadTurns: a user line whose content mixes a tool_result with real content (not tool-result-ONLY) still counts as a real boundary', async () => {
  const dir = mkTmp('build-census-leadturns-mixed-');
  const leadPath = path.join(dir, 'lead.jsonl');
  writeJsonl(leadPath, [
    asstLine({ requestId: 'a1', ts: '2026-01-01T00:00:00.000Z', usageOpts: { output: 1 } }),
    { type: 'user', timestamp: '2026-01-01T00:00:01.000Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu', content: 'ok' }, { type: 'text', text: 'and also a real comment' }] } },
    asstLine({ requestId: 'a2', ts: '2026-01-01T00:00:02.000Z', usageOpts: { output: 1 } }),
  ]);
  const { leadTurns } = await censusLeadFile(leadPath, {});
  assert.equal(leadTurns, 2, 'a mixed content array is not tool-result-only, so it ends the run');
});

test('leadTurns is written to docs/census.md as a one-sentence definition', () => {
  const docs = fs.readFileSync(new URL('../docs/census.md', import.meta.url), 'utf8');
  assert.ok(/leadTurns/.test(docs), 'docs/census.md must define leadTurns');
});

// ── T1/C2 fix round, MAJOR C1: an unreadable default agents dir must fail closed ──────
//
// Reproduces skills-a's (Codex/Astra) independent CLI fault-injection probe
// (docs/notes/skills-a-census-review-1.md): a real default `<session>/subagents/` dir
// exists with one subagent file inside it; injecting EACCES for ONLY that directory's
// readdirSync (every other filesystem call untouched) must never render as "no such
// source" (0 files, 0 unreadable, a clean COUNTED verdict). It must be visibly
// UNREADABLE and INCOMPLETE, never silently counted as zero.
test('an unreadable (EACCES) default subagents dir is visibly UNREADABLE/INCOMPLETE, never a silent zero — skills-a MAJOR C1 probe', async () => {
  const dir = mkTmp('build-census-default-eacces-');
  const leadPath = path.join(dir, 'permission.jsonl');
  writeJsonl(leadPath, [asstLine({ requestId: 'p', ts: '2026-09-25T00:00:00.000Z', usageOpts: { output: 1 } })]);
  const defaultDir = path.join(dir, 'permission', 'subagents');
  writeJsonl(path.join(defaultDir, 'agent-existing.jsonl'), [asstLine({ requestId: 'sub', ts: '2026-09-25T00:01:00.000Z', usageOpts: { output: 9 } })]);

  // Baseline: the healthy run genuinely counts the one subagent file, unreadableDirs empty.
  const normal = await runCensus({ lead: leadPath, tasksDirs: [] });
  assert.equal(normal.subagents.fileCount, 1);
  assert.deepEqual(normal.subagents.unreadableDirs, []);
  assert.equal(normal.subagents.incomplete, false);

  const real = fs;
  const deniedFsImpl = {
    readdirSync: (p, ...rest) => {
      if (path.resolve(p) === path.resolve(defaultDir)) {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      }
      return real.readdirSync(p, ...rest);
    },
    statSync: (...a) => real.statSync(...a),
    writeFileSync: (...a) => real.writeFileSync(...a),
    createReadStream: (...a) => real.createReadStream(...a),
    readFileSync: (...a) => real.readFileSync(...a),
    realpathSync: (...a) => real.realpathSync(...a),
  };
  const denied = await runCensus({ lead: leadPath, tasksDirs: [] }, deniedFsImpl);

  // The exact failure class the probe caught: a swallowed EACCES must never look like
  // ENOENT (absence) — zero files, zero unreadable FILES, and no incompleteness signal.
  assert.equal(denied.subagents.fileCount, 0, 'the file inside the denied dir cannot be listed at all');
  assert.equal(denied.subagents.unreadable, 0, 'this is a directory-level failure, not a file-level one');
  assert.deepEqual(denied.subagents.unreadableDirs, [defaultDir], 'the denied dir itself must be named as unreadable');
  assert.equal(denied.subagents.incomplete, true, 'an EACCES on a default dir must mark the whole report INCOMPLETE');

  const text = formatText(denied);
  assert.ok(/UNREADABLE/.test(text.split('\n')[0]), `VERDICT line must not read as a clean run:\n${text.split('\n')[0]}`);
  assert.ok(text.includes('INCOMPLETE'), `formatText must surface INCOMPLETE somewhere when a default dir is unreadable:\n${text}`);
  const json = formatJson(denied);
  assert.ok(json.includes(JSON.stringify(defaultDir).slice(1, -1)) && /"incomplete":\s*true/.test(json), 'the JSON must carry both the unreadable dir path and an incomplete flag');
});

// A missing default dir (the ordinary, common case — most lead sessions spawn no
// subagents at all) must stay silent: ENOENT is absence, not a finding.
test('a genuinely MISSING default subagents dir (ENOENT) is still silent — never reported as unreadable/INCOMPLETE', async () => {
  const dir = mkTmp('build-census-default-missing-');
  const leadPath = path.join(dir, 'nosubagents.jsonl');
  writeJsonl(leadPath, [asstLine({ requestId: 'p', ts: '2026-09-25T00:00:00.000Z', usageOpts: { output: 1 } })]);
  const report = await runCensus({ lead: leadPath, tasksDirs: [] });
  assert.equal(report.subagents.fileCount, 0);
  assert.deepEqual(report.subagents.unreadableDirs, []);
  assert.equal(report.subagents.incomplete, false);
  const text = formatText(report);
  assert.ok(!/UNREADABLE|INCOMPLETE/.test(text), 'a merely-absent default dir must never render as a finding');
});

// The Workflow root (<session>/subagents/workflows/) is the third discovery boundary
// the packet named (build-census.mjs buildDirSpecs): an EACCES listing it must be
// INCOMPLETE too, never the silent "no Workflow runs" it used to be.
test('an unreadable (EACCES) default workflows/ root is visibly UNREADABLE/INCOMPLETE, never a silent zero', async () => {
  const dir = mkTmp('build-census-workflows-eacces-');
  const leadPath = path.join(dir, 'wf.jsonl');
  writeJsonl(leadPath, [asstLine({ requestId: 'p', ts: '2026-09-25T00:00:00.000Z', usageOpts: { output: 1 } })]);
  const workflowsDir = path.join(dir, 'wf', 'subagents', 'workflows');
  writeJsonl(path.join(workflowsDir, 'run1', 'agent-w1.jsonl'), [asstLine({ requestId: 'w', ts: '2026-09-25T00:01:00.000Z', usageOpts: { output: 9 } })]);

  const normal = await runCensus({ lead: leadPath, tasksDirs: [] });
  assert.equal(normal.subagents.fileCount, 1);
  assert.equal(normal.subagents.incomplete, false);

  const real = fs;
  const deniedFsImpl = {
    readdirSync: (p, ...rest) => {
      if (path.resolve(p) === path.resolve(workflowsDir)) {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      }
      return real.readdirSync(p, ...rest);
    },
    statSync: (...a) => real.statSync(...a),
    writeFileSync: (...a) => real.writeFileSync(...a),
    createReadStream: (...a) => real.createReadStream(...a),
    readFileSync: (...a) => real.readFileSync(...a),
    realpathSync: (...a) => real.realpathSync(...a),
  };
  const denied = await runCensus({ lead: leadPath, tasksDirs: [] }, deniedFsImpl);
  assert.equal(denied.subagents.fileCount, 0);
  assert.deepEqual(denied.subagents.unreadableDirs, [workflowsDir]);
  assert.equal(denied.subagents.incomplete, true);
  const text = formatText(denied);
  assert.ok(/UNREADABLE/.test(text.split('\n')[0]), text.split('\n')[0]);
  assert.ok(text.split('\n').some((l) => /^- INCOMPLETE:/.test(l)), 'the Summary must carry the INCOMPLETE bullet accept --census refuses on');
});
