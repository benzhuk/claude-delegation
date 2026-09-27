#!/usr/bin/env node
// Independent contract tests for Codex rollout discovery. Fixtures deliberately retain
// only schema metadata, timestamps, model names, turn ids, and numeric usage fields.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { formatText, runCensus } from './build-census.mjs';

const ROOT = 'root-session';
const MODEL = 'gpt-5.6-terra';
const DAY = '2026/09/27';
const NEXT_DAY = '2026/09/28';

function fixtureHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-census-contract-'));
  fs.mkdirSync(path.join(home, 'sessions', ...DAY.split('/')), { recursive: true });
  fs.mkdirSync(path.join(home, 'sessions', ...NEXT_DAY.split('/')), { recursive: true });
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

function usage(responseId, turnId, { sessionId = ROOT, output = 5, at = '2026-09-27T12:00:02.000Z', optional = true } = {}) {
  const value = { input_tokens: 10, cached_input_tokens: 2, cache_write_input_tokens: 3, output_tokens: output };
  if (optional) Object.assign(value, { reasoning_output_tokens: 1, total_tokens: 10 + output });
  return line('token_usage_record', { session_id: sessionId, response_id: responseId, turn_id: turnId, usage: value }, at);
}

function writeRollout(home, day, name, rows) {
  const file = path.join(home, 'sessions', ...day.split('/'), name);
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  return file;
}

function leadRows({ model = MODEL, repeatContext = false, tokenAt = '2026-09-27T12:00:02.000Z', optional = true } = {}) {
  const turn = 'lead-turn';
  return [meta(ROOT), taskStarted(turn), context(turn, model), ...(repeatContext ? [context(turn, model, '2026-09-27T12:00:01.500Z')] : []), usage('lead-response', turn, { output: 3, at: tokenAt, optional })];
}

function childRows(id, parentId, depth, responseId, output, options = {}) {
  const turn = `${id}-turn`;
  return [meta(id, ROOT, parentId, depth, options.agentPath), ...(options.context === false ? [] : [context(turn, options.model ?? MODEL)]), usage(responseId, turn, { output, optional: options.optional ?? true })];
}

test('Codex contract: verified ancestry, root namespace, distinct child response ids, and native turns', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', leadRows({ repeatContext: true }));
  writeRollout(home, DAY, 'rollout-child-one.jsonl', childRows('child-one', ROOT, 1, 'same-response', 5));
  writeRollout(home, NEXT_DAY, 'rollout-child-two.jsonl', childRows('child-two', 'child-one', 2, 'same-response', 7));
  writeRollout(home, DAY, 'rollout-foreign.jsonl', childRows('foreign', 'another-lead', 1, 'foreign-response', 99));

  const report = await runCensus({ lead, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.host, 'codex');
  assert.equal(report.lead.coverageSupported, true);
  assert.equal(report.lead.leadTurns, 1, 'duplicate turn_context must not inflate task_started turns');
  assert.equal(report.subagents.fileCount, 2, 'foreign parent is excluded while depth two is included');
  assert.equal(report.combined[MODEL].output_tokens, 15, 'same response id in different child identities is additive');
  const two = report.subagents.perFile.find((row) => row.parentId === 'child-one');
  assert.equal(two.depth, 2);
  assert.equal(two.agentNickname, 'nick-child-two');
  assert.ok(report.lead.codex.discovery.excluded.some((row) => /foreign|parent|ancestry/i.test(row.reason)));
});

test('Codex contract: depth four and unknown/missing native fields remain unavailable, never zero', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', leadRows({ optional: false }));
  let parent = ROOT;
  for (let depth = 1; depth <= 4; depth += 1) {
    const id = `depth-${depth}`;
    writeRollout(home, DAY, `rollout-${id}.jsonl`, childRows(id, parent, depth, `r-${depth}`, depth, { context: depth !== 3, optional: depth !== 2 }));
    parent = id;
  }
  const report = await runCensus({ lead, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.coverageSupported, false);
  assert.equal(report.combined, null, 'partial Codex observations cannot become a combined zero');
  assert.ok(report.lead.codex.unavailable.length > 0, 'unknown model and absent optional fields are named unavailable');
  assert.ok(report.lead.codex.discovery.excluded.some((row) => /depth/i.test(row.reason)));
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

  const report = await runCensus({ lead, tasksDirs: [explicit], marker: null, from: null, to: null, out: null });
  assert.equal(report.lead.coverageSupported, true);
  assert.equal(report.subagents.fileCount, 2, 'lead duplicate is never a child; outside eligible child is additive');
  assert.equal(report.combined[MODEL].output_tokens, 15);
});

test('Codex contract: a context before --from supplies the model for an in-window response', async () => {
  const home = fixtureHome();
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', leadRows({ tokenAt: '2026-09-27T12:10:00.000Z' }));
  const report = await runCensus({ lead, tasksDirs: [], marker: null, from: '2026-09-27T12:05:00.000Z', to: '2026-09-27T12:15:00.000Z', out: null });
  assert.equal(report.lead.coverageSupported, true);
  assert.equal(report.combined[MODEL].output_tokens, 3);
  assert.equal(report.lead.leadTurns, 1);
});
