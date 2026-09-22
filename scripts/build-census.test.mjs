// node --test scripts/build-census.test.mjs
//
// Every ad-hoc fixture here is a real temp directory built with mkdtempSync under
// os.tmpdir() — never the real ~/.claude. The two COMMITTED fixtures under
// scripts/build-census.fixtures/ are the ones gate-10 (the integrator's `census` gate)
// runs the CLI against directly; this file's expectations for them are hand-computed
// below and must stay in sync with the fixture files.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArgs, runCensus, formatText, main, censusLeadFile, censusSubFile } from './build-census.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_LEAD = path.join(HERE, 'build-census.fixtures', 'lead.jsonl');
const FIXTURES_TASKS = path.join(HERE, 'build-census.fixtures', 'tasks');

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

test('parseArgs: --lead and --tasks are required', () => {
  assert.throws(() => parseArgs([]), /--lead/);
  assert.throws(() => parseArgs(['--lead', 'x.jsonl']), /--tasks/);
});

test('parseArgs: reads --lead/--tasks/--marker/--out', () => {
  const opts = parseArgs(['--lead', 'a.jsonl', '--tasks', 'dir', '--marker', 'text here', '--out', 'out.md']);
  assert.deepEqual(opts, { lead: 'a.jsonl', tasks: 'dir', marker: 'text here', out: 'out.md' });
});

test('parseArgs: an unknown flag throws', () => {
  assert.throws(() => parseArgs(['--lead', 'a', '--tasks', 'b', '--nope']), /unknown argument/);
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

// ── the committed fixtures, end to end (this is gate-10's own invocation) ──

test('runCensus over the committed fixtures matches the hand-computed expected values', async () => {
  const report = await runCensus({ lead: FIXTURES_LEAD, tasks: FIXTURES_TASKS, marker: null, out: null });

  assert.equal(report.lead.totalTurns, 3);
  assert.equal(report.lead.windowTurns, 3); // no marker: window == whole file
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

  assert.deepEqual(report.combined, {
    'claude-sonnet-5': { input_tokens: 1050 + 320, cache_creation_input_tokens: 0, cache_read_input_tokens: 200 + 50, output_tokens: 210 + 80 },
    'claude-opus-5': { input_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 100, output_tokens: 30 },
  });

  const text = formatText(report);
  assert.equal(text.split('\n')[0], 'VERDICT: COUNTED 3 lead turns, 2 subagent files');
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
  const report = await runCensus({ lead: FIXTURES_LEAD, tasks: FIXTURES_TASKS, marker: null, out: null }, fsImpl);
  assert.equal(report.subagents.fileCount, 2);
  assert.ok(!opened.some((p) => p.endsWith('empty.output')), 'a zero-byte file must never be opened as a stream');
  assert.ok(opened.some((p) => p.endsWith('split-request.output')), 'the non-empty file must still be opened');
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

test('--marker: window turns are deduped independently of the whole-file map, and a straddling request keeps only its post-marker value', async () => {
  const dir = mkTmp('build-census-marker-');
  const leadPath = path.join(dir, 'lead.jsonl');
  writeJsonl(leadPath, [
    asstLine({ requestId: 'pre', ts: '2026-01-01T00:00:00.000Z', usageOpts: { output: 1, input: 10 } }),
    // straddling: first line before the marker, second (final) line after it
    asstLine({ requestId: 'straddle', ts: '2026-01-01T00:01:00.000Z', usageOpts: { output: 10, input: 100 } }),
    { type: 'user', timestamp: '2026-01-01T00:02:00.000Z', message: { role: 'user', content: 'MARK-HERE now building' } },
    asstLine({ requestId: 'straddle', ts: '2026-01-01T00:03:00.000Z', usageOpts: { output: 99, input: 100 } }),
    asstLine({ requestId: 'post', ts: '2026-01-01T00:04:00.000Z', usageOpts: { output: 5, input: 20 } }),
  ]);
  const { totalById, windowById, windowStartAt } = await censusLeadFile(leadPath, { marker: 'MARK-HERE' });
  assert.equal(totalById.size, 3, 'pre, straddle, post — all deduped across the whole file');
  assert.equal(windowById.size, 2, 'straddle and post only; pre never entered the window');
  assert.equal(windowById.get('req:straddle').usage.output_tokens, 99, 'the window keeps the straddling request\'s POST-marker (last) value');
  assert.equal(totalById.get('req:straddle').usage.output_tokens, 99, 'the whole-file map also keeps the last value overall');
  assert.equal(windowStartAt, '2026-01-01T00:02:00.000Z');
});

// ── --out ────────────────────────────────────────────────────────────────

test('--out writes the full report to a file and stdout gets only the "wrote:" line', async () => {
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
  assert.ok(written.startsWith('VERDICT: COUNTED 3 lead turns, 2 subagent files'));
});

test('without --out, the full report (and nothing else) goes to the write() sink', async () => {
  const printed = [];
  const code = await main(['--lead', FIXTURES_LEAD, '--tasks', FIXTURES_TASKS], { write: (s) => printed.push(s) });
  assert.equal(code, 0);
  assert.equal(printed.length, 1);
  assert.ok(printed[0].startsWith('VERDICT: COUNTED 3 lead turns, 2 subagent files'));
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
  const body = src.slice(src.indexOf('export async function censusLeadFile'), src.indexOf('// ─────────────────────────────────────────────────────────────────────────────\n// fsImpl'));
  assert.equal(/\bfs\s*\./.test(body), false, 'a direct node:fs call bypasses the containment wrapper');
});
