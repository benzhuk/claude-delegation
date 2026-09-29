#!/usr/bin/env node
// Independent contract tests for Codex rollout discovery. Fixtures deliberately retain
// only schema metadata, timestamps, model names, turn ids, and numeric usage fields.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatJson, formatText, parseArgs, runCensus } from './build-census.mjs';

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
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', leadRows({ tokenAt: '2026-09-27T12:10:00.000Z' }));
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
    assert.equal(report.lead.coverageSupported, false, missing.join('+'));
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
  assert.equal(report.lead.coverageSupported, false, 'raw snapshot has no terminal witness and remains PARTIAL');
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
  assert.equal(report.lead.coverageSupported, true);
  assert.equal(report.lead.sessionId, '01a0df4c-2809-7520-b1d7-876cc51a87ee');
  assert.equal(report.subagents.fileCount, 2);
  assert.ok(report.subagents.perFile.every((row) => row.parentId === report.lead.sessionId));
  assert.equal(report.combined['gpt-5.6-terra'].derived_total_tokens, 49028);
  assert.equal(report.combined['gpt-6-astra'].derived_total_tokens, 88325);
  assert.deepEqual(report.lead.codex.discovery.horizonUtcDays, ['2026-09-26', '2026-09-27']);
});

test('Codex contract: a duplicate response with a conflicting model throws by name', async () => {
  const home = fixtureHome();
  const turn = 'lead-turn';
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', [
    meta(ROOT), taskStarted(turn),
    context(turn, 'gpt-6-astra'), usage('model-conflict', turn, { at: '2026-09-27T12:00:02.000Z' }),
    context(turn, MODEL), usage('model-conflict', turn, { at: '2026-09-27T12:00:02.000Z' }),
  ]);
  await assert.rejects(
    () => runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null }),
    /conflict/i,
  );
});

test('Codex contract: a duplicate response with a conflicting timestamp throws by name', async () => {
  const home = fixtureHome();
  const turn = 'lead-turn';
  const lead = writeRollout(home, DAY, 'rollout-lead.jsonl', [
    meta(ROOT), taskStarted(turn), context(turn, 'gpt-6-astra'),
    usage('timestamp-conflict', turn, { at: '2026-09-27T12:00:03.000Z' }),
    usage('timestamp-conflict', turn, { at: '2026-09-27T12:00:04.000Z' }),
  ]);
  await assert.rejects(
    () => runCensus({ lead, codexHome: home, tasksDirs: [], marker: null, from: null, to: null, out: null }),
    /conflict/i,
  );
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
  const divergent = await runCensus({ lead: divergentLead, codexHome: divergentHome, tasksDirs: [explicitDivergent], marker: null, from: null, to: null, out: null });
  assert.equal(divergent.lead.coverageSupported, false);
  assert.equal(divergent.combined, null);
  assert.ok(divergent.lead.codex.discovery.excluded.some((row) => row.file.includes('lead-conflict')));

  const childrenHome = fixtureHome();
  const childrenLead = writeRollout(childrenHome, DAY, 'rollout-lead.jsonl', leadRows());
  writeRollout(childrenHome, DAY, 'child-first.jsonl', childRows('same-child', ROOT, 1, 'child-r', 5));
  writeRollout(childrenHome, DAY, 'child-second.jsonl', childRows('same-child', ROOT, 1, 'child-r', 6));
  writeRollout(childrenHome, DAY, 'child-third.jsonl', childRows('same-child', ROOT, 1, 'child-r', 5));
  const children = await runCensus({ lead: childrenLead, codexHome: childrenHome, tasksDirs: [], marker: null, from: null, to: null, out: null });
  assert.equal(children.lead.coverageSupported, false);
  assert.equal(children.combined, null, 'a third copy cannot resurrect a conflicted child identity');
  assert.ok(children.lead.codex.discovery.excluded.some((row) => row.file.includes('child-second')));
  assert.ok(children.lead.codex.discovery.excluded.some((row) => row.file.includes('child-third')));
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
