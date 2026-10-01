#!/usr/bin/env node
// Independent contract tests for Codex rollout discovery. Fixtures deliberately retain
// only schema metadata, timestamps, model names, turn ids, and numeric usage fields.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { censusCodexLeadFile, formatJson, formatText, parseArgs, runCensus } from './build-census.mjs';
import { buildFourRead } from './four-read.mjs';

const ROOT = 'root-session';
const MODEL = 'gpt-5.6-terra';
const DAY = '2026/09/27';
const NEXT_DAY = '2026/09/28';
const NATIVE_DAY = '2026/09/26';
const NATIVE_NEXT_DAY = '2026/09/27';
const NATIVE_SANITIZED = path.join(path.dirname(fileURLToPath(import.meta.url)), 'build-census.fixtures', 'codex-native-sanitized');

function fixtureHome({ nextDay = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-census-contract-'));
  fs.mkdirSync(path.join(home, 'sessions', ...DAY.split('/')), { recursive: true });
  if (nextDay) fs.mkdirSync(path.join(home, 'sessions', ...NEXT_DAY.split('/')), { recursive: true });
  return home;
}

function line(type, payload, timestamp = '2026-09-27T12:00:00.000Z') {
  return { type, timestamp, payload };
}

function meta(id, sessionId = ROOT, parentId = null, depth = null, agentPath = '/root/builder') {
  const spawn = parentId === null ? undefined : {
    parent_thread_id: parentId, depth, agent_path: agentPath, agent_nickname: `nick-${id}`,
  };
  return line('session_meta', {
    id, session_id: sessionId, thread_source: parentId === null ? 'user' : 'subagent',
    ...(spawn ? { source: { subagent: { thread_spawn: spawn } } } : {}),
  });
}

function context(turnId, model = MODEL, at = '2026-09-27T12:00:01.000Z') {
  return line('turn_context', { turn_id: turnId, model }, at);
}

function taskStarted(turnId, at = '2026-09-27T12:00:00.500Z') {
  return line('event_msg', { type: 'task_started', turn_id: turnId }, at);
}

function usage(responseId, turnId, { sessionId = ROOT, output = 5, at = '2026-09-27T12:00:02.000Z', missing = [] } = {}) {
  const value = { input_tokens: 10, cached_input_tokens: 2, cache_write_input_tokens: 3, output_tokens: output };
  Object.assign(value, { reasoning_output_tokens: 1, total_tokens: 10 + output });
  for (const key of missing) delete value[key];
  return line('token_usage_record', { session_id: sessionId, response_id: responseId, turn_id: turnId, usage: value }, at);
}

function writeRollout(home, day, name, rows) {
  const file = path.join(home, 'sessions', ...day.split('/'), name);
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  return file;
}

function leadRows({ model = MODEL, repeatContext = false, tokenAt = '2026-09-27T12:00:02.000Z', missing = [], output = 3 } = {}) {
  const turn = 'lead-turn';
  return [meta(ROOT), taskStarted(turn), context(turn, model), ...(repeatContext ? [context(turn, model, '2026-09-27T12:00:01.500Z')] : []), usage('lead-response', turn, { output, at: tokenAt, missing }), line('event_msg', { type: 'task_complete', turn_id: turn }, '2026-09-27T12:00:03.000Z')];
}

function childRows(id, parentId, depth, responseId, output, options = {}) {
  const turn = `${id}-turn`;
  const sessionId = options.sessionId ?? ROOT;
  return [meta(id, sessionId, parentId, depth, options.agentPath), taskStarted(turn), ...(options.context === false ? [] : [context(turn, options.model ?? MODEL)]), usage(responseId, turn, { sessionId, output, missing: options.missing ?? [] }), line('event_msg', { type: 'task_complete', turn_id: turn }, '2026-09-27T12:00:03.000Z')];
}

function benignItem(at, text = 'benign trailing item') {
  return line('event_msg', {
    type: 'item_completed', turn_id: 'benign-item-turn',
    item: { type: 'UserMessage', content: [{ type: 'text', text }] },
  }, at);
}

async function boundedReport(home, lead, from = '2026-09-27T12:00:00.000Z', to = '2026-09-27T12:00:10.000Z') {
  return runCensus({ lead, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null, from, to, out: null });
}

test('Codex public census API preserves literal U+2028/U+2029 JSON and counts the following usage row', async () => {
  const home = fixtureHome();
  const rows = [
    meta(ROOT), taskStarted('lead-turn'), context('lead-turn'),
    line('response_item', { type: 'message', text: 'before\u2028middle\u2029after' }, '2026-09-27T12:00:01.500Z'),
    usage('unicode-response', 'lead-turn', { output: 7 }),
    line('event_msg', { type: 'task_complete', turn_id: 'lead-turn' }, '2026-09-27T12:00:03.000Z'),
  ];
  const lead = writeRollout(home, DAY, 'unicode.jsonl', rows);
  const raw = fs.readFileSync(lead, 'utf8');
  assert.equal((raw.match(/\u2028/g) || []).length, 1);
  assert.equal((raw.match(/\u2029/g) || []).length, 1);

  const parsed = await censusCodexLeadFile(lead, { rootSessionId: ROOT, expectedId: ROOT });
  assert.equal(parsed.damaged, null, 'literal JSON string separators are not malformed rows');
  assert.equal(parsed.tokenRecordCount, 1, 'the exact usage row after the Unicode string is reached');

  const report = await runCensus({ lead, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });

  assert.equal(report.lead.codex.discovery.scope.complete, true);
  assert.equal(report.lead.coverageSupported, true, report.lead.coverageReason);
  assert.equal(report.lead.observedLeadRequests, 1);
  assert.equal(report.combined[MODEL].output_tokens, 7, 'the response after the Unicode-bearing row is not lost');
  assert.match(formatText(report).split('\n')[0], /^VERDICT: COUNTED/);
});

test('Lane40b clean completed pre-window child is excluded even when benign item_completed trails task_complete', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'completed-pre-window.jsonl', [
    meta('completed-pre-window', ROOT, ROOT, 1, '/root/pre-window'),
    taskStarted('old-turn', '2026-09-27T11:00:00.000Z'),
    context('old-turn', MODEL, '2026-09-27T11:00:01.000Z'),
    usage('old-response', 'old-turn', { output: 99, at: '2026-09-27T11:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'old-turn' }, '2026-09-27T11:00:03.000Z'),
    benignItem('2026-09-27T11:00:04.000Z'),
  ]);

  const report = await boundedReport(home, lead);

  assert.equal(report.lead.codex.discovery.scope.complete, true, report.lead.codex.discovery.scope.reason);
  assert.equal(report.subagents.perFile.find((row) => row.parentId === ROOT).turns, 0, 'pre-window usage contributes no response');
  assert.equal(report.combined[MODEL].output_tokens, 3, 'pre-window child output is excluded from the aggregate');
  assert.match(formatText(report).split('\n')[0], /^VERDICT: COUNTED/);
});

test('Lane40b incomplete pre-window child remains PARTIAL with a named end-witness reason', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'incomplete-pre-window.jsonl', [
    meta('incomplete-pre-window', ROOT, ROOT, 1),
    taskStarted('old-open-turn', '2026-09-27T11:00:00.000Z'),
    context('old-open-turn', MODEL, '2026-09-27T11:00:01.000Z'),
    usage('old-open-response', 'old-open-turn', { output: 9, at: '2026-09-27T11:00:02.000Z' }),
    benignItem('2026-09-27T11:00:03.000Z'),
  ]);

  const report = await boundedReport(home, lead);

  assert.equal(report.lead.codex.discovery.scope.complete, false);
  assert.match(report.lead.codex.discovery.scope.reason, /child incomplete-pre-window.*end-bound witness/i);
  assert.equal(report.combined, null, 'unknown child end coverage cannot produce a complete aggregate');
  assert.match(formatText(report).split('\n')[0], /^VERDICT: PARTIAL/);
});

test('Lane40b completed overlapping child is counted when a benign row trails its task_complete', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'overlapping-child.jsonl', [
    meta('overlapping-child', ROOT, ROOT, 1),
    taskStarted('overlap-turn', '2026-09-27T11:59:59.000Z'),
    context('overlap-turn', MODEL, '2026-09-27T11:59:59.500Z'),
    usage('overlap-response', 'overlap-turn', { output: 5, at: '2026-09-27T12:00:05.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'overlap-turn' }, '2026-09-27T12:00:06.000Z'),
    benignItem('2026-09-27T12:00:07.000Z'),
  ]);

  const report = await boundedReport(home, lead);

  assert.equal(report.lead.codex.discovery.scope.complete, true, report.lead.codex.discovery.scope.reason);
  assert.equal(report.subagents.perFile.find((row) => row.parentId === ROOT).turns, 1);
  assert.equal(report.combined[MODEL].output_tokens, 8, 'lead output 3 plus overlapping child output 5');
  assert.match(formatText(report).split('\n')[0], /^VERDICT: COUNTED/);
});

test('Lane40b a newer task_started cannot borrow an earlier task completion', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'latest-task-open.jsonl', [
    meta('latest-task-open', ROOT, ROOT, 1),
    taskStarted('finished-turn', '2026-09-27T12:00:00.000Z'),
    context('finished-turn', MODEL, '2026-09-27T12:00:01.000Z'),
    usage('finished-response', 'finished-turn', { output: 4, at: '2026-09-27T12:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'finished-turn' }, '2026-09-27T12:00:03.000Z'),
    taskStarted('latest-open-turn', '2026-09-27T12:00:04.000Z'),
    context('latest-open-turn', MODEL, '2026-09-27T12:00:05.000Z'),
    usage('latest-open-response', 'latest-open-turn', { output: 6, at: '2026-09-27T12:00:06.000Z' }),
  ]);

  const report = await boundedReport(home, lead);

  assert.equal(report.lead.codex.discovery.scope.complete, false);
  assert.match(report.lead.codex.discovery.scope.reason, /child latest-task-open.*end-bound witness/i);
  assert.equal(report.combined, null);
});

test('Lane40b repeated same-id restart cannot borrow the first run completion', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'same-id-restart.jsonl', [
    meta('same-id-restart', ROOT, ROOT, 1),
    taskStarted('reused-turn', '2026-09-27T11:00:00.000Z'),
    context('reused-turn', MODEL, '2026-09-27T11:00:01.000Z'),
    usage('first-run-response', 'reused-turn', { output: 4, at: '2026-09-27T11:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'reused-turn' }, '2026-09-27T11:00:03.000Z'),
    taskStarted('reused-turn', '2026-09-27T11:00:04.000Z'),
    context('reused-turn', MODEL, '2026-09-27T11:00:05.000Z'),
    usage('second-run-response', 'reused-turn', { output: 6, at: '2026-09-27T11:00:06.000Z' }),
  ]);

  const report = await boundedReport(home, lead);

  assert.equal(report.lead.codex.discovery.scope.complete, false);
  assert.match(report.lead.codex.discovery.scope.reason, /child same-id-restart.*end-bound witness/i);
  assert.equal(report.combined, null);
});

test('Lane40b invalid task restart after completion remains PARTIAL', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'invalid-restart.jsonl', [
    meta('invalid-restart', ROOT, ROOT, 1),
    taskStarted('valid-turn', '2026-09-27T11:00:00.000Z'),
    context('valid-turn', MODEL, '2026-09-27T11:00:01.000Z'),
    usage('valid-response', 'valid-turn', { output: 4, at: '2026-09-27T11:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'valid-turn' }, '2026-09-27T11:00:03.000Z'),
    line('event_msg', { type: 'task_started' }, '2026-09-27T11:00:04.000Z'),
  ]);

  const report = await boundedReport(home, lead);

  assert.equal(report.lead.codex.discovery.scope.complete, false);
  assert.match(report.lead.codex.discovery.scope.reason, /child invalid-restart.*end-bound witness/i);
  assert.equal(report.lead.codex.fields.leadTurns.status, 'UNSUPPORTED');
  assert.equal(report.combined, null);
});

test('Lane40b segment retention: invalid start in segment B cannot borrow segment A completed witness', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'segment-a-completed.jsonl', [
    meta('segmented-invalid-restart', ROOT, ROOT, 1),
    taskStarted('segment-a-turn', '2026-09-27T11:00:00.000Z'),
    context('segment-a-turn', MODEL, '2026-09-27T11:00:01.000Z'),
    usage('segment-a-response', 'segment-a-turn', { output: 4, at: '2026-09-27T11:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'segment-a-turn' }, '2026-09-27T11:00:03.000Z'),
  ]);
  writeRollout(home, DAY, 'segment-b-invalid-start.jsonl', [
    meta('segmented-invalid-restart', ROOT, ROOT, 1),
    line('event_msg', { type: 'task_started' }, '2026-09-27T11:00:04.000Z'),
  ]);

  const report = await boundedReport(home, lead);

  assert.equal(report.lead.codex.discovery.scope.complete, false);
  assert.match(report.lead.codex.discovery.scope.reason, /child segmented-invalid-restart.*end-bound witness/i);
  assert.equal(report.lead.codex.fields.leadTurns.status, 'UNSUPPORTED', 'invalid start remains visible after segment merge');
  assert.equal(report.combined, null, 'segment A completion cannot turn the invalid later restart into COUNTED');
});

test('Lane40b segment retention: equal latest-start timestamps with conflicting witnesses stay PARTIAL', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'segment-a-witness.jsonl', [
    meta('segmented-start-tie', ROOT, ROOT, 1),
    taskStarted('completed-at-tie', '2026-09-27T11:00:00.000Z'),
    context('completed-at-tie', MODEL, '2026-09-27T11:00:01.000Z'),
    usage('tie-completed-response', 'completed-at-tie', { output: 4, at: '2026-09-27T11:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'completed-at-tie' }, '2026-09-27T11:00:03.000Z'),
  ]);
  writeRollout(home, DAY, 'segment-b-open.jsonl', [
    meta('segmented-start-tie', ROOT, ROOT, 1),
    taskStarted('open-at-tie', '2026-09-27T11:00:00.000Z'),
    context('open-at-tie', MODEL, '2026-09-27T11:00:01.500Z'),
    usage('tie-open-response', 'open-at-tie', { output: 6, at: '2026-09-27T11:00:04.000Z' }),
  ]);

  const report = await boundedReport(home, lead);

  assert.equal(report.lead.codex.discovery.scope.complete, false);
  assert.match(report.lead.codex.discovery.scope.reason, /child segmented-start-tie.*end-bound witness/i);
  assert.equal(report.combined, null, 'a merge-order tie cannot preserve the completed segment witness');
});

test('Lane40b segment retention: untimed start in segment B keeps an open-mode child PARTIAL', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'segment-a-timed-completed.jsonl', [
    meta('segmented-untimed', ROOT, ROOT, 1),
    taskStarted('a-turn', '2026-09-27T12:00:00.000Z'),
    context('a-turn', MODEL, '2026-09-27T12:00:01.000Z'),
    usage('a-resp', 'a-turn', { output: 4, at: '2026-09-27T12:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'a-turn' }, '2026-09-27T12:00:03.000Z'),
  ]);
  writeRollout(home, DAY, 'segment-b-untimed-open.jsonl', [
    meta('segmented-untimed', ROOT, ROOT, 1),
    { type: 'event_msg', payload: { type: 'task_started', turn_id: 'b-turn' } },
  ]);

  const report = await runCensus({
    lead, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null,
    from: null, to: null, out: null,
  });

  assert.equal(report.lead.codex.discovery.scope.complete, false);
  assert.match(report.lead.codex.discovery.scope.reason, /open or unbounded child segmented-untimed has no end-bound witness/i);
  assert.equal(report.combined, null, 'segment A completion cannot hide segment B\'s untimed open task');
});

test('Lane40b task completion before a benign row is a witness in open mode and contributes usage', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'open-completed-child.jsonl', [
    meta('open-completed-child', ROOT, ROOT, 1),
    taskStarted('open-child-turn', '2026-09-27T12:00:00.000Z'),
    context('open-child-turn', MODEL, '2026-09-27T12:00:01.000Z'),
    usage('open-child-response', 'open-child-turn', { output: 5, at: '2026-09-27T12:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'open-child-turn' }, '2026-09-27T12:00:03.000Z'),
    benignItem('2026-09-27T12:00:04.000Z'),
  ]);

  const report = await runCensus({ lead, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });

  assert.equal(report.lead.codex.discovery.scope.complete, true, report.lead.codex.discovery.scope.reason);
  assert.equal(report.combined[MODEL].output_tokens, 8, 'open mode includes lead output 3 and child output 5');
  assert.match(formatText(report).split('\n')[0], /^VERDICT: COUNTED/);
});

test('Lane40b from-only window excludes a clean child that ended before its finite start', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'from-only-pre-window.jsonl', [
    meta('from-only-pre-window', ROOT, ROOT, 1),
    taskStarted('from-old-turn', '2026-09-27T11:00:00.000Z'),
    context('from-old-turn', MODEL, '2026-09-27T11:00:01.000Z'),
    usage('from-old-response', 'from-old-turn', { output: 50, at: '2026-09-27T11:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'from-old-turn' }, '2026-09-27T11:00:03.000Z'),
    benignItem('2026-09-27T11:00:04.000Z'),
  ]);

  const report = await runCensus({
    lead, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null,
    from: '2026-09-27T12:00:00.000Z', to: null, out: null,
  });

  assert.equal(report.lead.codex.discovery.scope.complete, true, report.lead.codex.discovery.scope.reason);
  assert.equal(report.combined[MODEL].output_tokens, 3, 'from-only census excludes old child output');
});

test('Lane40b child ending exactly at --from overlaps and cannot be excluded as pre-window', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'boundary-zero-usage.jsonl', [
    meta('boundary-zero-usage', ROOT, ROOT, 1),
    taskStarted('boundary-turn', '2026-09-27T11:59:58.000Z'),
    context('boundary-turn', MODEL, '2026-09-27T11:59:59.000Z'),
    line('event_msg', { type: 'task_complete', turn_id: 'boundary-turn' }, '2026-09-27T12:00:00.000Z'),
  ]);

  const report = await boundedReport(home, lead);

  assert.equal(report.lead.codex.discovery.scope.complete, false);
  assert.match(report.lead.codex.discovery.scope.reason, /child boundary-zero-usage has no token_usage_record/i);
  assert.equal(report.combined, null);
});

test('Lane40b item_completed turn_id and task-complete-looking agent text are never terminal witnesses', async () => {
  for (const [id, terminalLikeRow] of [
    ['user-message-item', line('event_msg', {
      type: 'item_completed', turn_id: 'pending-turn',
      item: { type: 'UserMessage', content: [{ type: 'text', text: 'ordinary user message' }] },
    }, '2026-09-27T11:00:03.000Z')],
    ['agent-text-item', line('event_msg', {
      type: 'item_completed', turn_id: 'pending-turn',
      item: { type: 'AgentMessage', text: 'task complete' },
    }, '2026-09-27T11:00:03.000Z')],
  ]) {
    const home = fixtureHome();
    const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
    writeRollout(home, DAY, `${id}.jsonl`, [
      meta(id, ROOT, ROOT, 1),
      taskStarted('pending-turn', '2026-09-27T11:00:00.000Z'),
      context('pending-turn', MODEL, '2026-09-27T11:00:01.000Z'),
      usage(`${id}-response`, 'pending-turn', { output: 4, at: '2026-09-27T11:00:02.000Z' }),
      terminalLikeRow,
    ]);

    const report = await boundedReport(home, lead);
    assert.equal(report.lead.codex.discovery.scope.complete, false, id);
    assert.match(report.lead.codex.discovery.scope.reason, new RegExp(`child ${id}.*end-bound witness`, 'i'), id);
    assert.equal(report.combined, null, id);
  }
});

test('Lane40b pre-window completion never hides corrupt or conflicting child evidence', async () => {
  const corruptHome = fixtureHome();
  const corruptLead = writeRollout(corruptHome, DAY, 'lead.jsonl', leadRows());
  const corrupt = writeRollout(corruptHome, DAY, 'corrupt-pre-window.jsonl', [
    meta('corrupt-pre-window', ROOT, ROOT, 1),
    taskStarted('corrupt-turn', '2026-09-27T11:00:00.000Z'),
    context('corrupt-turn', MODEL, '2026-09-27T11:00:01.000Z'),
    usage('corrupt-response', 'corrupt-turn', { output: 4, at: '2026-09-27T11:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'corrupt-turn' }, '2026-09-27T11:00:03.000Z'),
  ]);
  fs.appendFileSync(corrupt, '{malformed-json\n', 'utf8');
  const corruptReport = await boundedReport(corruptHome, corruptLead);
  assert.equal(corruptReport.lead.codex.discovery.scope.complete, false);
  assert.match(corruptReport.lead.codex.discovery.scope.reason, /child corrupt-pre-window malformed JSON row/i);
  assert.equal(corruptReport.combined, null);

  const conflictHome = fixtureHome();
  const conflictLead = writeRollout(conflictHome, DAY, 'lead.jsonl', leadRows());
  writeRollout(conflictHome, DAY, 'conflict-pre-window.jsonl', [
    meta('conflict-pre-window', ROOT, ROOT, 1),
    taskStarted('conflict-turn', '2026-09-27T11:00:00.000Z'),
    context('conflict-turn', MODEL, '2026-09-27T11:00:01.000Z'),
    usage('same-response', 'conflict-turn', { output: 4, at: '2026-09-27T11:00:02.000Z' }),
    usage('same-response', 'conflict-turn', { output: 4, at: '2026-09-27T11:00:02.500Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'conflict-turn' }, '2026-09-27T11:00:03.000Z'),
  ]);
  const conflictReport = await boundedReport(conflictHome, conflictLead);
  assert.equal(conflictReport.lead.codex.discovery.scope.complete, false);
  assert.match(conflictReport.lead.codex.discovery.scope.reason, /child conflict-pre-window has conflicting timestamps/i);
  assert.equal(conflictReport.combined, null);
});

test('Lane40b clean completed zero-usage child wholly before --from is excluded', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'zero-usage-pre-window.jsonl', [
    meta('zero-usage-pre-window', ROOT, ROOT, 1),
    taskStarted('zero-turn', '2026-09-27T11:00:00.000Z'),
    context('zero-turn', MODEL, '2026-09-27T11:00:01.000Z'),
    line('event_msg', { type: 'task_complete', turn_id: 'zero-turn' }, '2026-09-27T11:00:02.000Z'),
    benignItem('2026-09-27T11:00:03.000Z'),
  ]);

  const report = await boundedReport(home, lead);

  assert.equal(report.lead.codex.discovery.scope.complete, true, report.lead.codex.discovery.scope.reason);
  assert.equal(report.combined[MODEL].output_tokens, 3, 'only lead usage contributes');
  assert.match(formatText(report).split('\n')[0], /^VERDICT: COUNTED/);
});

test('Codex contract: verified ancestry, root namespace, distinct child response ids, and native turns', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', leadRows({ repeatContext: true }));
  writeRollout(home, DAY, 'rollout-child-one.jsonl', childRows('child-one', ROOT, 1, 'same-response', 5));
  writeRollout(home, NEXT_DAY, 'rollout-child-two.jsonl', childRows('child-two', 'child-one', 2, 'same-response', 7));
  writeRollout(home, DAY, 'rollout-foreign.jsonl', childRows('foreign', 'another-lead', 1, 'foreign-response', 99, { sessionId: 'foreign-root' }));

  const report = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.host, 'codex');
  assert.equal(report.lead.coverageSupported, true);
  assert.equal(report.lead.leadTurns, 1, 'duplicate turn_context must not inflate task_started turns');
  assert.equal(report.subagents.fileCount, 2, 'foreign parent is excluded while depth two is included');
  assert.equal(report.combined[MODEL].output_tokens, 15, 'same response id in different child identities is additive');
  const two = report.subagents.perFile.find((row) => row.parentId === 'child-one');
  assert.equal(two.depth, 2);
  assert.equal(two.agentNickname, 'nick-child-two');
  assert.ok(report.lead.codex.discovery.excluded.some((row) => row.file.includes('foreign')), 'foreign-root rollout is named in exclusions');
});

test('Codex contract: selected root namespace with an unverifiable parent edge is partial and excluded', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', leadRows());
  writeRollout(home, DAY, 'rollout-unverified.jsonl', childRows('unverified', 'missing-parent', 2, 'unverified-response', 99));
  const report = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.coverageSupported, false);
  assert.equal(report.combined, null);
  assert.equal(report.subagents.fileCount, 0, 'an excluded parent edge cannot contribute observed child usage');
  assert.ok(report.lead.codex.discovery.excluded.some((row) => row.file.includes('unverified')), 'unverifiable rollout is named in exclusions');
});

test('Codex contract: depth four and unknown model remain unavailable, never zero', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', leadRows());
  let parent = ROOT;
  for (let depth = 1; depth <= 4; depth += 1) {
    const id = `depth-${depth}`;
    writeRollout(home, DAY, `rollout-${id}.jsonl`, childRows(id, parent, depth, `r-${depth}`, depth, { context: depth !== 3 }));
    parent = id;
  }
  const report = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.coverageSupported, false);
  assert.equal(report.combined, null, 'partial Codex observations cannot become a combined zero');
  assert.ok(report.lead.codex.unavailable.length > 0, 'unknown model and absent optional fields are named unavailable');
  assert.ok(report.lead.codex.discovery.excluded.some((row) => row.file.includes('depth-4')), 'over-depth rollout is named in exclusions');
  assert.match(formatText(report), /UNSUPPORTED|unavailable/i);
});

test('Codex contract: explicit tasks adds eligible outside-home rollout and de-dups a copied lead identity', async () => {
  const home = fixtureHome();
  const leadRowsValue = leadRows();
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', leadRowsValue);
  writeRollout(home, DAY, 'rollout-default-child.jsonl', childRows('default-child', ROOT, 1, 'default-response', 5));
  const explicit = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-census-explicit-'));
  fs.writeFileSync(path.join(explicit, 'copied-lead.jsonl'), `${leadRowsValue.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  fs.writeFileSync(path.join(explicit, 'outside-child.jsonl'), `${childRows('outside-child', ROOT, 1, 'outside-response', 7).map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');

  const report = await runCensus({ lead, codexHome: home, tasksDirs: [explicit], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.coverageSupported, true);
  assert.equal(report.subagents.fileCount, 2, 'lead duplicate is never a child; outside eligible child is additive');
  assert.equal(report.combined[MODEL].output_tokens, 15);
});

test('Codex contract: a context before --from supplies the model for an in-window response', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', [
    meta(ROOT), taskStarted('lead-turn'), context('lead-turn'),
    usage('lead-response', 'lead-turn', { output: 3, at: '2026-09-27T12:10:00.000Z' }),
    line('event_msg', { type: 'heartbeat' }, '2026-09-27T12:16:00.000Z'),
  ]);
  const report = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: '2026-09-27T12:05:00.000Z', to: '2026-09-27T12:15:00.000Z', out: null });
  assert.equal(report.lead.coverageSupported, true);
  assert.equal(report.combined[MODEL].output_tokens, 3);
  assert.equal(report.lead.leadTurns, 0, 'the pre-window task_started is outside the inclusive response window');
});

test('Codex contract: each missing cache breakdown stays unavailable while derived total remains known', async () => {
  for (const missing of [
    ['cached_input_tokens'],
    ['cache_write_input_tokens'],
    ['cached_input_tokens', 'cache_write_input_tokens'],
  ]) {
    const home = fixtureHome();
    const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', leadRows({ missing, output: 5 }));
    const report = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
    const aggregate = report.lead.observedWindowByModel[MODEL];
    assert.equal(report.lead.coverageSupported, missing.length === 1 && missing[0] === 'cache_write_input_tokens', missing.join('+'));
    assert.equal(aggregate.derived_total_tokens, 15, 'native input plus output remains observed without a false complete aggregate');
    for (const field of missing) {
      assert.equal(aggregate[field.replace('cached_', 'cache_read_').replace('cache_write_', 'cache_creation_')], null);
      assert.ok(aggregate.unavailable.includes(field), `${field} is aggregate-unavailable`);
      assert.match(formatJson(report), new RegExp(field));
      assert.match(formatText(report), new RegExp(field));
    }
  }
});

test('Codex contract: mixed complete and missing-cache responses derive 30 without a fake zero split', async () => {
  const home = fixtureHome();
  const turn = 'lead-turn';
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', [
    meta(ROOT), taskStarted(turn), context(turn), usage('complete', turn), usage('missing-cache-write', turn, { missing: ['cache_write_input_tokens'] }),
  ]);
  const report = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.coverageSupported, false);
  assert.equal(report.lead.observedWindowByModel[MODEL].derived_total_tokens, 30);
  assert.equal(report.lead.codex.fields.cacheWriteTokens.status, 'UNSUPPORTED');
  assert.match(formatJson(report), /cache_write_input_tokens/);
  assert.match(formatText(report), /cache_write_input_tokens/);
});

test('Codex contract: missing reasoning and raw total are named unavailable, not substituted with zero', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', leadRows({ missing: ['reasoning_output_tokens', 'total_tokens'], output: 5 }));
  const report = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.coverageSupported, true, 'optional reasoning/raw-total support does not erase complete required token evidence');
  assert.equal(report.combined[MODEL].derived_total_tokens, 15);
  assert.ok(report.combined[MODEL].unavailable.includes('reasoning_output_tokens'));
  assert.ok(report.combined[MODEL].unavailable.includes('total_tokens'));
  assert.match(formatJson(report), /reasoning_output_tokens/);
  assert.match(formatText(report), /reasoning_output_tokens/);
});

test('Codex contract: whitelist-native fixture discovers next-day child and preserves model/root accounting', async () => {
  const home = fixtureHome();
  fs.mkdirSync(path.join(home, 'sessions', ...NATIVE_DAY.split('/')), { recursive: true });
  const lead = path.join(home, 'sessions', ...NATIVE_DAY.split('/'), 'lead.jsonl');
  fs.copyFileSync(path.join(NATIVE_SANITIZED, 'lead.jsonl'), lead);
  fs.copyFileSync(path.join(NATIVE_SANITIZED, 'child-1.jsonl'), path.join(home, 'sessions', ...NATIVE_DAY.split('/'), 'child-1.jsonl'));
  fs.copyFileSync(path.join(NATIVE_SANITIZED, 'child-2.jsonl'), path.join(home, 'sessions', ...NATIVE_NEXT_DAY.split('/'), 'child-2.jsonl'));

  const report = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.coverageSupported, false, 'the native excerpt has no terminal temporal witness');
  assert.equal(report.lead.sessionId, '01a0df4c-2809-7520-b1d7-876cc51a87ee');
  assert.equal(report.subagents.fileCount, 2);
  assert.ok(report.subagents.perFile.every((row) => row.parentId === report.lead.sessionId));
  assert.equal(report.lead.observedWindowByModel['gpt-6-astra'].derived_total_tokens, 47893);
  assert.equal(report.subagents.perFile.find((row) => row.file.endsWith('child-1.jsonl')).byModel['gpt-5.6-terra'].derived_total_tokens, 49028);
  assert.equal(report.subagents.perFile.find((row) => row.file.endsWith('child-2.jsonl')).byModel['gpt-6-astra'].derived_total_tokens, 40432);
  assert.deepEqual(report.lead.codex.discovery.horizonUtcDays, ['2026-09-26', '2026-09-27']);
});

test('Codex contract: equal-usage duplicate with conflicting model preserves usage but makes attribution unavailable', async () => {
  const home = fixtureHome();
  const turn = 'lead-turn';
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', [
    meta(ROOT), taskStarted(turn),
    context(turn, 'gpt-6-astra'), usage('model-conflict', turn, { at: '2026-09-27T12:00:02.000Z' }),
    context(turn, MODEL, '2026-09-27T12:00:02.000Z'), usage('model-conflict', turn, { at: '2026-09-27T12:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: turn }, '2026-09-27T12:00:03.000Z'),
  ]);
  const report = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.observedLeadRequests, 1);
  assert.equal(report.lead.observedLeadTokens, 15);
  assert.equal(report.lead.codex.fields.model.status, 'UNSUPPORTED');
  assert.equal(report.lead.coverageSupported, false);
  assert.equal(report.lead.codex.discovery.scope.complete, true, 'unknown model is field support, not temporal incompleteness');
});

test('Codex contract: equal-usage duplicate with conflicting timestamp preserves usage but makes time incomplete', async () => {
  const home = fixtureHome();
  const turn = 'lead-turn';
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', [
    meta(ROOT), taskStarted(turn), context(turn, 'gpt-6-astra'),
    usage('timestamp-conflict', turn, { at: '2026-09-27T12:00:03.000Z' }),
    usage('timestamp-conflict', turn, { at: '2026-09-27T12:00:04.000Z' }),
  ]);
  const report = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: '2026-09-27T12:00:10.000Z', out: null });
  assert.equal(report.lead.observedLeadRequests, 1);
  assert.equal(report.lead.observedLeadTokens, 15);
  assert.equal(report.lead.codex.responseTimelineComplete, false);
  assert.equal(report.lead.codex.discovery.scope.complete, false);
  assert.match(formatText(report).split('\n')[0], /^VERDICT: PARTIAL/);
});

test('Codex contract: a duplicate response with conflicting raw optional evidence throws by name', async () => {
  const home = fixtureHome();
  const turn = 'lead-turn';
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', [
    meta(ROOT), taskStarted(turn), context(turn, 'gpt-6-astra'),
    usage('raw-conflict', turn, { at: '2026-09-27T12:00:05.000Z' }),
    usage('raw-conflict', turn, { at: '2026-09-27T12:00:05.000Z', missing: ['total_tokens'] }),
  ]);
  await assert.rejects(
    () => runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null }),
    /conflict/i,
  );
});

test('Codex contract: an exact repeated response is deduplicated once', async () => {
  const home = fixtureHome();
  const turn = 'lead-turn';
  const row = usage('identical-repeat', turn, { output: 5, at: '2026-09-27T12:00:05.000Z' });
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', [meta(ROOT), taskStarted(turn), context(turn), row, row, line('event_msg', { type: 'task_complete', turn_id: turn }, '2026-09-27T12:00:06.000Z')]);
  const report = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.coverageSupported, true);
  assert.equal(report.combined[MODEL].derived_total_tokens, 15);
});

test('Codex contract: a lead-only marker includes child responses at and after its shared boundary', async () => {
  const home = fixtureHome();
  const turn = 'lead-turn';
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', [
    meta(ROOT), taskStarted(turn), context(turn),
    line('event_msg', { type: 'marker', marker: 'start-build' }, '2026-09-27T12:00:10.000Z'),
    usage('lead-after', turn, { output: 3, at: '2026-09-27T12:00:11.000Z' }), line('event_msg', { type: 'task_complete', turn_id: turn }, '2026-09-27T12:00:12.000Z'),
  ]);
  writeRollout(home, DAY, 'rollout-child.jsonl', [
    meta('marker-child', ROOT, ROOT, 1), taskStarted('child-turn'), context('child-turn'),
    usage('child-before', 'child-turn', { output: 4, at: '2026-09-27T12:00:09.000Z' }),
    usage('child-at', 'child-turn', { output: 5, at: '2026-09-27T12:00:10.000Z' }),
    usage('child-after', 'child-turn', { output: 6, at: '2026-09-27T12:00:11.000Z' }), line('event_msg', { type: 'task_complete', turn_id: 'child-turn' }, '2026-09-27T12:00:12.000Z'),
  ]);
  const report = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: 'start-build', from: null, to: null, out: null });
  assert.equal(report.lead.coverageSupported, true);
  assert.equal(report.subagents.perFile[0].turns, 2);
  assert.equal(report.combined[MODEL].output_tokens, 14, 'lead marker need not appear in a child rollout');
});

test('Codex contract: implicit third-day coverage is partial, but an explicit in-horizon slice remains complete', async () => {
  for (const opts of [
    { marker: null, from: null, to: null },
    { marker: 'build-start', from: null, to: null },
    { marker: null, from: '2026-09-27T00:00:00.000Z', to: null },
  ]) {
    const home = fixtureHome();
    const turn = 'lead-turn';
    const rows = [meta(ROOT), taskStarted(turn), context(turn)];
    if (opts.marker) rows.push(line('event_msg', { type: 'marker', marker: opts.marker }, '2026-09-27T12:00:01.500Z'));
    rows.push(usage('third-day', turn, { at: '2026-09-29T12:00:00.000Z' }));
    const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', rows);
    const report = await runCensus({ lead, codexHome: home, tasksDirs: [], ...opts, out: null });
    assert.equal(report.lead.coverageSupported, false, JSON.stringify(opts));
    assert.equal(report.combined, null);
  }

  const home = fixtureHome();
  const turn = 'lead-turn';
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', [
    meta(ROOT), taskStarted(turn), context(turn),
    usage('in-horizon', turn, { output: 3, at: '2026-09-27T12:00:02.000Z' }),
    usage('outside-slice', turn, { output: 99, at: '2026-09-29T12:00:02.000Z' }),
  ]);
  const bounded = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: '2026-09-27T00:00:00.000Z', to: '2026-09-28T23:59:59.999Z', out: null });
  assert.equal(bounded.lead.coverageSupported, true);
  assert.equal(bounded.combined[MODEL].output_tokens, 3);
});

test('Codex contract: logical lead and child identity conflicts stay permanently unresolved', async () => {
  const identicalHome = fixtureHome();
  const rows = leadRows({ output: 5 });
  const identicalLead = writeRollout(identicalHome, DAY, 'rollout-lead.jsonl', rows);
  const explicitIdentical = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-census-identical-lead-'));
  fs.writeFileSync(path.join(explicitIdentical, 'lead-copy.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  const identical = await runCensus({ lead: identicalLead, codexHome: identicalHome, tasksDirs: [explicitIdentical], marker: null, from: null, to: null, out: null });
  assert.equal(identical.lead.coverageSupported, true, 'an exact lead copy is explicitly de-duplicated');
  assert.equal(identical.subagents.fileCount, 0);

  const divergentHome = fixtureHome();
  const divergentLead = writeRollout(divergentHome, DAY, 'rollout-lead.jsonl', rows);
  const explicitDivergent = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-census-divergent-lead-'));
  fs.writeFileSync(path.join(explicitDivergent, 'lead-conflict.jsonl'), `${leadRows({ output: 99 }).map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  await assert.rejects(
    () => runCensus({ lead: divergentLead, codexHome: divergentHome, tasksDirs: [explicitDivergent], marker: null, from: null, to: null, out: null }),
    /response_id conflict across segments/i,
  );

  const childrenHome = fixtureHome();
  const childrenLead = writeRollout(childrenHome, DAY, 'rollout-lead.jsonl', leadRows());
  writeRollout(childrenHome, DAY, 'child-first.jsonl', childRows('same-child', ROOT, 1, 'child-r', 5));
  writeRollout(childrenHome, DAY, 'child-second.jsonl', childRows('same-child', ROOT, 1, 'child-r', 6));
  writeRollout(childrenHome, DAY, 'child-third.jsonl', childRows('same-child', ROOT, 1, 'child-r', 5));
  await assert.rejects(
    () => runCensus({ lead: childrenLead, codexHome: childrenHome, tasksDirs: [], marker: null, from: null, to: null, out: null }),
    /response_id conflict across segments/i,
  );
});

test('Codex contract: a missing explicit tasks directory is partial while a missing default next-day directory is normal', async () => {
  const explicitHome = fixtureHome();
  const lead = writeRollout(explicitHome, DAY, 'rollout-lead.jsonl', leadRows());
  const missingExplicit = path.join(explicitHome, 'not-present');
  const explicit = await runCensus({ lead, codexHome: explicitHome, tasksDirs: [missingExplicit], marker: null, from: null, to: null, out: null });
  assert.equal(explicit.lead.coverageSupported, false);
  assert.equal(explicit.combined, null);
  assert.ok(explicit.lead.codex.discovery.unreadableFiles.some((file) => file.includes('not-present')) || explicit.subagents.unreadableDirs.some((file) => file.includes('not-present')));

  const optionalHome = fixtureHome({ nextDay: false });
  const optionalLead = writeRollout(optionalHome, DAY, 'rollout-lead.jsonl', leadRows());
  const optional = await runCensus({ lead: optionalLead, codexHome: optionalHome, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(optional.lead.coverageSupported, true);
  assert.equal(optional.subagents.fileCount, 0);
});

test('Codex contract: rejected root-namespace parent cannot authenticate its grandchild', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', leadRows());
  writeRollout(home, DAY, 'bad-parent.jsonl', childRows('bad-parent', ROOT, 1, 'bad-parent-response', 5, { sessionId: 'foreign-root' }));
  writeRollout(home, DAY, 'grandchild.jsonl', childRows('grandchild', 'bad-parent', 2, 'grandchild-response', 7));
  const report = await runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.coverageSupported, false);
  assert.equal(report.combined, null);
  assert.equal(report.subagents.perFile.some((row) => row.parentId === 'bad-parent'), false, 'an excluded parent is never an ancestry authority');
  assert.ok(report.lead.codex.discovery.excluded.some((row) => row.file.includes('bad-parent')));
  assert.ok(report.lead.codex.discovery.excluded.some((row) => row.file.includes('grandchild')));
});

// Lane55: known-id discovery must be bounded by the canonical tree, not the old
// lead-day horizon.  The old child is deliberately far from the lead filename day.
test('Lane55 known lead-session walks the canonical tree and counts an old resumed child exactly once', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'rollout-current-name.jsonl', [
    ...leadRows({ output: 3 }),
    line('event_msg', { type: 'task_complete', turn_id: 'lead-turn' }, '2026-09-27T12:00:03.000Z'),
  ]);
  const oldDay = '2026/03/01';
  fs.mkdirSync(path.join(home, 'sessions', ...oldDay.split('/')), { recursive: true });
  writeRollout(home, oldDay, 'rollout-old-child.jsonl', [
    meta('old-child', ROOT, ROOT, 1), taskStarted('old-child-turn'), context('old-child-turn'),
    usage('old-response', 'old-child-turn', { output: 7 }),
    line('event_msg', { type: 'task_complete', turn_id: 'old-child-turn' }, '2026-09-27T12:00:03.000Z'),
  ]);

  const report = await runCensus({
    lead, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null,
    from: '2026-09-27T00:00:00.000Z', to: '2026-09-27T23:59:59.999Z', out: null,
  });
  assert.ok(report.lead.codex.identity, 'known lead-session emits resolved identity evidence');
  assert.equal(report.lead.codex.identity.expectedId, ROOT);
  assert.equal(report.lead.codex.identity.verified, true);
  assert.equal(report.lead.codex.discovery.scope.kind, 'canonical-session-tree');
  assert.equal(report.lead.codex.discovery.scope.complete, true);
  assert.equal(report.subagents.fileCount, 1);
  assert.equal(report.combined[MODEL].derived_total_tokens, 30, 'lead 13 + old child 17, no horizon loss or double count');
});

test('Lane55 temporal COUNTED remains a consumer-readable verdict when a token field is unsupported', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', [
    ...leadRows({ missing: ['cached_input_tokens'] }),
    line('event_msg', { type: 'task_complete', turn_id: 'lead-turn' }, '2026-09-27T12:00:03.000Z'),
  ]);
  const report = await runCensus({
    lead, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null,
    from: '2026-09-27T00:00:00.000Z', to: '2026-09-27T12:00:02.500Z', out: null,
  });
  assert.equal(report.lead.coverageSupported, false, 'cache evidence is not fabricated');
  assert.equal(report.lead.codex.fields.cachedInputTokens.status, 'UNSUPPORTED');
  assert.match(formatText(report).split('\n')[0], /^VERDICT: COUNTED .*; UNSUPPORTED cachedInputTokens/);
  assert.equal(JSON.parse(formatJson(report)).lead.codex.fields.cachedInputTokens.status, 'UNSUPPORTED');
});

test('Lane55 --lead-session resolves the canonical lead without --lead and rejects a spoofed selected identity', async () => {
  const home = fixtureHome();
  writeRollout(home, DAY, 'rollout-resolved.jsonl', leadRows());
  const report = await runCensus({ lead: null, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.codex.identity.source, 'lead-session');
  assert.equal(report.lead.codex.identity.expectedId, ROOT);
  assert.equal(parseArgs(['--lead-session', ROOT, '--codex-home', home]).leadSession, ROOT);

  const spoof = writeRollout(home, DAY, 'rollout-spoof.jsonl', [meta('spoof-id', 'spoof-id'), taskStarted('spoof-turn'), context('spoof-turn'), usage('spoof-response', 'spoof-turn', { sessionId: 'spoof-id' }), line('event_msg', { type: 'task_complete', turn_id: 'spoof-turn' })]);
  await assert.rejects(() => runCensus({ lead: spoof, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null }), /identify|identity|expected/i);
});

test('Lane55 same-id nonconflicting segments are unioned and exact aliases do not add usage', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead-a.jsonl', leadRows({ output: 3 }));
  writeRollout(home, NEXT_DAY, 'lead-b.jsonl', [
    meta(ROOT), context('lead-turn'), usage('resumed-response', 'lead-turn', { output: 7, at: '2026-09-28T12:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'lead-turn' }, '2026-09-28T12:00:03.000Z'),
  ]);
  writeRollout(home, NEXT_DAY, 'lead-b-alias.jsonl', [
    meta(ROOT), context('lead-turn'), usage('resumed-response', 'lead-turn', { output: 7, at: '2026-09-28T12:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'lead-turn' }, '2026-09-28T12:00:03.000Z'),
  ]);
  const report = await runCensus({ lead, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.observedLeadRequests, 2);
  assert.equal(report.lead.observedLeadTokens, 30, '13 + 17; exact alias contributes zero');
  assert.equal(report.lead.codex.identity.paths.length, 2, 'identity evidence lists unique verified segments');
});

test('Lane55 bounded temporal witnesses distinguish damaged, open, historical, completed, and later-created files', async () => {
  const from = '2026-09-27T12:00:00.000Z';
  const to = '2026-09-27T12:00:10.000Z';

  const historicalHome = fixtureHome();
  const historicalLead = writeRollout(historicalHome, DAY, 'historical.jsonl', [
    meta(ROOT), taskStarted('t'), context('t'), usage('r', 't'),
    line('event_msg', { type: 'heartbeat' }, '2026-09-27T12:00:11.000Z'),
  ]);
  const historical = await runCensus({ lead: historicalLead, leadSession: ROOT, codexHome: historicalHome, tasksDirs: [], marker: null, from, to, out: null });
  assert.equal(historical.lead.codex.discovery.scope.complete, true, 'a valid row beyond --to closes an earlier window');

  const openHome = fixtureHome();
  const openLead = writeRollout(openHome, DAY, 'open.jsonl', [meta(ROOT), taskStarted('t'), context('t'), usage('r', 't')]);
  const open = await runCensus({ lead: openLead, leadSession: ROOT, codexHome: openHome, tasksDirs: [], marker: null, from, to, out: null });
  assert.equal(open.lead.codex.discovery.scope.complete, false);
  assert.match(open.lead.codex.discovery.scope.reason, /no end-bound witness/);

  const completeHome = fixtureHome();
  const completeLead = writeRollout(completeHome, DAY, 'complete.jsonl', [...leadRows(), line('event_msg', { type: 'task_complete', turn_id: 'lead-turn' }, '2026-09-27T12:00:04.000Z')]);
  writeRollout(completeHome, DAY, 'short-child.jsonl', childRows('short-child', ROOT, 1, 'child-r', 5));
  writeRollout(completeHome, NEXT_DAY, 'future-child.jsonl', [meta('future-child', ROOT, ROOT, 1), taskStarted('future-t', '2026-09-28T12:00:00.500Z'), context('future-t', MODEL, '2026-09-28T12:00:01.000Z'), usage('future-r', 'future-t', { at: '2026-09-28T12:00:02.000Z' })]);
  const complete = await runCensus({ lead: completeLead, leadSession: ROOT, codexHome: completeHome, tasksDirs: [], marker: null, from, to, out: null });
  assert.equal(complete.lead.codex.discovery.scope.complete, true, 'completed short child and child created after --to do not make the historical slice partial');

  const damagedHome = fixtureHome();
  const damagedLead = writeRollout(damagedHome, DAY, 'damaged.jsonl', leadRows());
  fs.appendFileSync(damagedLead, '{"type":"event_msg"');
  const damaged = await runCensus({ lead: damagedLead, leadSession: ROOT, codexHome: damagedHome, tasksDirs: [], marker: null, from, to, out: null });
  assert.equal(damaged.lead.codex.discovery.scope.complete, false);
  assert.match(damaged.lead.codex.discovery.scope.reason, /damaged|malformed|truncated/i);
});

test('Lane55 field contracts cover missing required evidence, native cache-write absence, and reasoning as an output subset', async () => {
  for (const missing of [['output_tokens'], ['input_tokens']]) {
    const home = fixtureHome();
    const lead = writeRollout(home, DAY, 'missing.jsonl', leadRows({ missing }));
    const report = await runCensus({ lead, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
    assert.equal(report.lead.coverageSupported, false);
    assert.equal(report.lead.codex.fields[missing[0] === 'output_tokens' ? 'outputTokens' : 'inputTokens'].status, 'UNSUPPORTED');
  }

  const noTaskHome = fixtureHome();
  const noTaskLead = writeRollout(noTaskHome, DAY, 'no-task-id.jsonl', [meta(ROOT), context('t'), usage('r', 't'), line('event_msg', { type: 'task_complete' })]);
  const noTask = await runCensus({ lead: noTaskLead, leadSession: ROOT, codexHome: noTaskHome, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(noTask.lead.leadTurns, 0, 'a response is not fabricated into a native task_started turn');
  assert.equal(noTask.lead.observedLeadRequests, 1);

  const schemaHome = fixtureHome();
  const schemaLead = writeRollout(schemaHome, DAY, 'schema.jsonl', [
    meta(ROOT), taskStarted('t'), context('t'),
    line('event_msg', { type: 'token_count', info: { total_token_usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5 } } }, '2026-09-27T12:00:01.500Z'),
    usage('r', 't', { missing: ['cache_write_input_tokens'] }),
    line('event_msg', { type: 'task_complete', turn_id: 't' }, '2026-09-27T12:00:03.000Z'),
  ]);
  const schema = await runCensus({ lead: schemaLead, leadSession: ROOT, codexHome: schemaHome, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(schema.lead.codex.fields.cacheWriteTokens.status, 'COUNTED');
  assert.equal(schema.combined[MODEL].cache_creation_input_tokens, 0);
  assert.equal(schema.combined[MODEL].reasoning_output_tokens, 1);
  assert.equal(schema.combined[MODEL].output_tokens, 5);
  assert.equal(schema.combined[MODEL].derived_total_tokens, 15, 'reasoning and cached tokens are not re-added');
});

test('Lane55 unchanged four-read propagates unsupported token fields as unavailable', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'consumer.jsonl', leadRows({ missing: ['cached_input_tokens'] }));
  const census = await runCensus({ lead, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.match(formatText(census).split('\n')[0], /^VERDICT: COUNTED .*UNSUPPORTED cachedInputTokens/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-four-read-contract-'));
  const censusPath = path.join(dir, 'census.json');
  const recordPath = path.join(dir, 'record.md');
  fs.writeFileSync(censusPath, formatJson(census));
  fs.writeFileSync(recordPath, `Work: fixture\nStatus: accepted\nLead-session: ${ROOT}\nOpened: 2026-09-27T12:00:00.000Z\nLog: 2026-09-27T12:00:00.000Z owned owner start\nLog: 2026-09-27T12:00:03.000Z accepted owner artifact 0123456789abcdef0123456789abcdef01234567\n\nfixture\n`);
  const read = buildFourRead({ record: recordPath, census: censusPath });
  assert.match(read.numbers.find((row) => row.key === 'topTierTokensPerBuild').value, /^unavailable \(Codex census coverage is unavailable/);
});

test('Lane55 task-turn and stall-nudge support require actual native evidence', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'missing-turn.jsonl', [
    meta(ROOT), line('event_msg', { type: 'task_started' }), context('t'), usage('r', 't'),
    line('event_msg', { type: 'task_complete' }, '2026-09-27T12:00:03.000Z'),
  ]);
  const report = await runCensus({ lead, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null, ledgerDir: path.join(home, 'missing-ledger'), leadSlug: null, from: null, to: null, out: null });
  assert.equal(report.lead.leadTurns, 0);
  assert.equal(report.lead.codex.fields.leadTurns.status, 'UNSUPPORTED', 'malformed task_started.turn_id cannot prove an exact zero');
  assert.equal(report.lead.codex.fields.stallNudges.status, 'UNSUPPORTED', 'no readable ledger/slug cannot prove zero nudges');
});

test('Lane55 temporal completeness includes open children and requires no in-window rows for the future-child exception', async () => {
  const openHome = fixtureHome();
  const openLead = writeRollout(openHome, DAY, 'lead.jsonl', leadRows());
  writeRollout(openHome, DAY, 'open-child.jsonl', [meta('open-child', ROOT, ROOT, 1), taskStarted('ct'), context('ct'), usage('cr', 'ct')]);
  const unbounded = await runCensus({ lead: openLead, leadSession: ROOT, codexHome: openHome, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(unbounded.lead.codex.discovery.scope.complete, false);
  assert.match(unbounded.lead.codex.discovery.scope.reason, /child.*end-bound witness|open.*child/i);

  const futureHome = fixtureHome();
  const futureLead = writeRollout(futureHome, DAY, 'lead.jsonl', leadRows());
  writeRollout(futureHome, NEXT_DAY, 'future-but-in-window.jsonl', [
    meta('future-child', ROOT, ROOT, 1),
    taskStarted('ft', '2026-09-28T12:00:00.500Z'), context('ft', MODEL, '2026-09-28T12:00:01.000Z'),
    usage('backdated-in-window', 'ft', { at: '2026-09-27T12:00:05.000Z' }),
  ]);
  const bounded = await runCensus({ lead: futureLead, leadSession: ROOT, codexHome: futureHome, tasksDirs: [], marker: null, from: '2026-09-27T12:00:00.000Z', to: '2026-09-27T12:00:10.000Z', out: null });
  assert.equal(bounded.lead.codex.discovery.scope.complete, false, 'future-file exception is invalid when the file contributes an in-window row');
});

test('Lane55 R1 corrupt verified children make descendant coverage PARTIAL with no complete aggregate', async () => {
  for (const [label, mutate] of [
    ['negative output', (row) => { row.payload.usage.output_tokens = -1; }],
    ['string input', (row) => { row.payload.usage.input_tokens = '10'; }],
    ['wrong usage session', (row) => { row.payload.session_id = 'foreign-root'; }],
  ]) {
    const home = fixtureHome();
    const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
    const rows = childRows('bad-' + label, ROOT, 1, 'bad-response-' + label, 5);
    mutate(rows.find((row) => row.type === 'token_usage_record'));
    writeRollout(home, DAY, 'bad-' + label + '.jsonl', rows);
    const report = await runCensus({ lead, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
    assert.equal(report.lead.codex.discovery.scope.complete, false, label);
    assert.match(report.lead.codex.discovery.scope.reason, /child|candidate|usage|unreadable|incomplete/i, label);
    assert.equal(report.lead.coverageSupported, false, label);
    assert.equal(report.combined, null, label);
    assert.match(formatText(report).split('\n')[0], /^VERDICT: PARTIAL/, label);
  }
});

test('Lane55 R1 relevant zero-usage logical child is unavailable without breaking valid empty-window rules', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'lead.jsonl', leadRows());
  writeRollout(home, DAY, 'zero-usage-child.jsonl', [
    meta('zero-usage-child', ROOT, ROOT, 1), taskStarted('zero-turn'), context('zero-turn'),
    line('event_msg', { type: 'task_complete', turn_id: 'zero-turn' }, '2026-09-27T12:00:03.000Z'),
  ]);
  const report = await runCensus({ lead, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.codex.discovery.scope.complete, false);
  assert.match(report.lead.codex.discovery.scope.reason, /child|usage|response/i);
  assert.equal(report.lead.coverageSupported, false);
  assert.equal(report.combined, null);
});

test('Lane55 R1 lead segment terminal witness follows chronology when explicit --lead is the later segment', async () => {
  const home = fixtureHome();
  writeRollout(home, DAY, 'early-segment.jsonl', [
    meta(ROOT), taskStarted('early-turn', '2026-09-27T11:00:00.500Z'), context('early-turn', MODEL, '2026-09-27T11:00:01.000Z'),
    usage('early-response', 'early-turn', { at: '2026-09-27T11:00:02.000Z' }),
  ]);
  const later = writeRollout(home, NEXT_DAY, 'explicit-later-segment.jsonl', [
    meta(ROOT), taskStarted('later-turn', '2026-09-27T13:00:00.500Z'), context('later-turn', MODEL, '2026-09-27T13:00:01.000Z'),
    usage('later-response', 'later-turn', { at: '2026-09-27T13:00:02.000Z' }),
    line('event_msg', { type: 'task_complete', turn_id: 'later-turn' }, '2026-09-27T13:00:03.000Z'),
  ]);
  const report = await runCensus({ lead: later, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null, from: '2026-09-27T10:00:00.000Z', to: '2026-09-27T14:00:00.000Z', out: null });
  assert.equal(report.lead.codex.discovery.scope.complete, true);
  assert.equal(report.lead.coverageSupported, true);
  assert.equal(report.lead.observedLeadRequests, 2);
});

test('Lane55 R1 explicit lead identity refusal names expected and found ids', async () => {
  const home = fixtureHome();
  const spoof = writeRollout(home, DAY, 'wrong-id.jsonl', [
    meta('found-session', 'found-session'), taskStarted('t'), context('t'),
    usage('r', 't', { sessionId: 'found-session' }), line('event_msg', { type: 'task_complete', turn_id: 't' }),
  ]);
  await assert.rejects(
    () => runCensus({ lead: spoof, leadSession: ROOT, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null }),
    /expected root-session.*found found-session/i,
  );
});
