// node --test scripts/census-completeness-62.test.mjs
//
// Lane62 independent contract tests (T2). Written against spec.md, contracts.d.ts and
// spec-adjudication.md, never against the implementation. Every negative case is paired with a
// positive control built from the same fixture, so a test that fails at the base fails because the
// behavior is missing, not because the fixture is wrong (and a refusal is never mistaken for a pass
// just because the CLI rejected an unknown flag). Everything goes through the public CLIs
// (build-census.mjs, four-read.mjs) and the shared helper exports; there is no test-only seam.
// Fixtures are synthetic: ids, timestamps, models and numeric usage only, with U+2028/U+2029
// inside strings to prove LF-only framing.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD_CENSUS = path.join(HERE, 'build-census.mjs');
const FOUR_READ = path.join(HERE, 'four-read.mjs');
const MEASURES = path.join(HERE, 'census-measures.mjs');
const SEP = '  and  ';

const tracked = [];
after(() => { for (const d of tracked) fs.rmSync(d, { recursive: true, force: true }); });
function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}
function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}
function writeRows(file, rows) {
  writeText(file, `${rows.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n')}\n`);
}
function runNode(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, DELEGATION_TOP_TIER: '', CLAUDE_DELEGATION_TOP_TIER: '' } });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// ── Claude native-shaped rows ─────────────────────────────────────────────────────────────────
const LEAD_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OPUS = 'claude-opus-5-5';
const FROM = '2026-09-30T12:00:00.000Z';
const TO = '2026-09-30T13:00:00.000Z';
const user = (ts, text = 'start') => ({ type: 'user', timestamp: ts, message: { role: 'user', content: text } });
function asst(ts, { sessionId, req, id = `m-${req}`, model = OPUS, input = 10, cc = 0, cr = 0, output = 5, noUsage = false, noModel = false } = {}) {
  const message = { id, role: 'assistant', content: [{ type: 'text', text: `t${SEP}` }] };
  if (!noModel) message.model = model;
  if (!noUsage) message.usage = { input_tokens: input, cache_creation_input_tokens: cc, cache_read_input_tokens: cr, output_tokens: output };
  return { type: 'assistant', timestamp: ts, sessionId, requestId: req, message };
}
const total = (u) => (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);
const sumCombined = (combined) => Object.values(combined || {}).reduce((n, u) => n + total(u), 0);
const firstLine = (mdPath) => fs.readFileSync(mdPath, 'utf8').split('\n')[0];

const WORK = 'wr-2026-09-30-fixture-lane';
const B = 'bbbbbbbb-0000-4000-8000-000000000001';
const C = 'cccccccc-0000-4000-8000-000000000002';

// Standard builder transcript: five distinct requests around the window (before, at FROM, inside,
// at TO, after) and one streamed repeat of the inside request (collapsed by native alias dedup). Inclusive bounds => 3 requests,
// 15 processed tokens each = 45.
function builderRows(sessionId = B) {
  return [
    asst('2026-09-30T11:59:59.999Z', { sessionId, req: 'r-before', output: 500 }),
    asst('2026-09-30T12:00:00.000Z', { sessionId, req: 'r-from' }),
    asst('2026-09-30T12:10:00.000Z', { sessionId, req: 'r-mid' }),
    asst('2026-09-30T12:10:00.500Z', { sessionId, req: 'r-mid' }),
    asst('2026-09-30T13:00:00.000Z', { sessionId, req: 'r-to' }),
    asst('2026-09-30T13:00:00.001Z', { sessionId, req: 'r-after', output: 500 }),
  ];
}

// Builds the sandbox: claude-root with the lead under projects/lane, a repo with a record, a role
// manifest and launch-identity evidence. `mutate` edits the fixture object before it is written.
function claudeFixture(mutate = () => {}) {
  const root = mkTmp('lane62-claude-');
  const fx = {
    root, repo: path.join(root, 'repo'), claudeRoot: path.join(root, 'claude-root'), codexHome: path.join(root, 'codex-home'),
    leadRel: `projects/lane/${LEAD_ID}.jsonl`,
    leadRows: [user(FROM), asst('2026-09-30T12:00:05.000Z', { sessionId: LEAD_ID, req: 'lead-1' }), user('2026-09-30T12:30:00.000Z', `later${SEP}`)],
    work: WORK,
    roles: [{
      host: 'claude', sessionId: B, role: 'builder', transcriptRel: `projects/lane/${B}.jsonl`, rows: builderRows(),
      evidenceName: 'builder', evidence: { session: B, startedAt: '2026-09-30T11:58:00.000Z', sourceSha256: 'a'.repeat(64) },
    }],
    manifestOverride: null, manifestWork: null, recordExtra: '',
    args: {}, // per-call additions: marker, noRecord, noRepo, noFrom, noTo
  };
  mutate(fx);
  return fx;
}
function writeFixture(fx) {
  writeRows(path.join(fx.claudeRoot, fx.leadRel), fx.leadRows);
  const sessions = fx.roles.map((r) => {
    if (r.rows) {
      const file = path.join(r.host === 'codex' ? fx.codexHome : fx.claudeRoot, r.transcriptRel);
      if (r.rawText !== undefined) writeText(file, r.rawText); else writeRows(file, r.rows);
    }
    const evidence = r.evidencePath || `docs/work/evidence/${r.evidenceName}.identity.json`;
    if (r.evidence && !evidence.startsWith('..')) writeText(path.join(fx.repo, evidence), JSON.stringify(r.evidence));
    return { host: r.host, sessionId: r.sessionId, role: r.role, evidence, transcript: r.transcriptRel };
  });
  const manifest = fx.manifestOverride || { version: 1, work: fx.manifestWork || fx.work, sessions };
  writeText(path.join(fx.repo, 'docs/work/roles.json'), JSON.stringify(manifest));
  writeText(path.join(fx.repo, 'docs/work/lane.record.md'), [
    `Work: ${fx.work}`, 'Scope: lane62 fixture', 'Owner: fixture', 'Status: delivered', 'Authority: fixture',
    'Artifact: build/fixture@0123456789abcdef', 'Evidence: docs/work/evidence/review.md', 'Next: measure',
    `Opened: ${FROM}`, 'Role-sessions: docs/work/roles.json', fx.recordExtra, '', 'Observed: fixture.', '',
  ].filter((l, i, a) => l !== '' || i > 9 || a[i] === '').join('\n'));
  fs.mkdirSync(fx.codexHome, { recursive: true });
}
function runClaudeCensus(fx) {
  writeFixture(fx);
  const out = path.join(fx.root, 'census.json');
  const md = path.join(fx.root, 'census.md');
  const a = fx.args;
  const args = ['--lead', path.join(fx.claudeRoot, fx.leadRel), '--json', out, '--out', md];
  if (!a.noFrom) args.push('--from', FROM);
  if (!a.noTo) args.push('--to', TO);
  if (a.marker) args.push('--marker', a.marker);
  if (!a.noRecord) args.push('--record', path.join(fx.repo, 'docs/work/lane.record.md'));
  if (!a.noRepo) args.push('--repo', fx.repo);
  args.push('--claude-root', fx.claudeRoot, '--codex-home', fx.codexHome);
  const res = runNode(BUILD_CENSUS, args);
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  return { ...res, report, md, first: fs.existsSync(md) ? firstLine(md) : '', out };
}
const counted = (r) => r.status === 0 && /^VERDICT: COUNTED/.test(r.first);
const explain = (r) => `status=${r.status} first=${JSON.stringify(r.first)} stderr=${r.stderr.slice(0, 300)}`;
// The standard declared scenario must count: 15 (lead) + 45 (builder) = 60 processed tokens.
function assertControl(r) {
  assert.ok(counted(r), `control fixture must be COUNTED: ${explain(r)}`);
  assert.equal(sumCombined(r.report.combined), 60, 'control: lead 15 + declared builder 45');
}
// A declaration defect must never read as a clean COUNTED census and never as a zero.
function assertTainted(r, label) {
  assert.ok(!counted(r), `${label}: must be refused or PARTIAL, got ${explain(r)}`);
}
const roleOf = (r, sessionId = B) => (r.report && r.report.roleSessions ? r.report.roleSessions.find((x) => x.sessionId === sessionId) : undefined);

// ── Item 1: detached role sessions ────────────────────────────────────────────────────────────
test('legacy census without a manifest keeps its explicit native-only scope and no declared roles', () => {
  const fx = claudeFixture();
  fx.args.noRecord = true; fx.args.noRepo = true;
  const r = runClaudeCensus(fx);
  assert.equal(r.status, 0, explain(r));
  assert.equal(sumCombined(r.report.combined), 15, 'only the lead window: the undeclared builder is not reachable natively');
  assert.equal(r.report.measurementScope && r.report.measurementScope.roles, 'native-only');
  assert.deepEqual(r.report.roleSessions, []);
  assert.equal(r.report.tokenDefinition && r.report.tokenDefinition.id, 'processed-v1');
});

test('a declared detached builder becomes counted: window-clipped, inclusive bounds, streamed duplicate once', () => {
  const r = runClaudeCensus(claudeFixture());
  assertControl(r);
  const role = roleOf(r);
  assert.ok(role, 'roleSessions carries the declared builder');
  assert.equal(role.status, 'complete');
  assert.equal(role.role, 'builder');
  assert.equal(role.requests, 3, 'r-from, r-mid and r-to; r-before and r-after are clipped');
  assert.equal(role.duplicateRequests, 0, 'no overlap with native discovery; the streamed repeat of r-mid is collapsed by requestId/message-id alias dedup first, not counted here');
  assert.equal(total(role.byModel[OPUS]), 45, 'models come from the usage rows');
  assert.equal(r.report.measurementScope.roles, 'native-plus-declared');
  assert.equal(r.report.measurementScope.from, FROM);
  assert.equal(r.report.measurementScope.to, TO);
  assert.ok(r.report.measurementScope.limitations.length > 0, 'declared-role scope states its limit (declared roles are not proof no role exists)');
  assert.match(fs.readFileSync(r.md, 'utf8'), /native-plus-declared/, 'text report names the new scope');
});

test('the same session reachable natively AND declared is counted once', () => {
  const fx = claudeFixture();
  writeRows(path.join(fx.claudeRoot, 'projects/lane', LEAD_ID, 'subagents', `agent-${B}.jsonl`), builderRows());
  const r = runClaudeCensus(fx);
  assertControl(r);
  assert.equal(roleOf(r).duplicateRequests, 3, 'the three declared in-window requests were already represented natively and are dropped, not double counted');
});

test('an identical duplicate declaration collapses; conflicting role declarations are PARTIAL', () => {
  const dup = runClaudeCensus(claudeFixture((fx) => { fx.roles.push({ ...fx.roles[0] }); }));
  assertControl(dup);
  assert.equal(dup.report.roleSessions.filter((x) => x.sessionId === B).length, 1, 'one result for one identity');
  assert.deepEqual([roleOf(dup).requests, roleOf(dup).duplicateRequests], [3, 0], 'an identical duplicate declaration collapses once; it is not native overlap');
  const conflict = runClaudeCensus(claudeFixture((fx) => { fx.roles.push({ ...fx.roles[0], role: 'reviewer' }); }));
  assertTainted(conflict, 'same session declared as builder and reviewer');
});

test('wrong Work, wrong sidecar session, wrong native row sessionId and a declared lead are not counted', () => {
  assertControl(runClaudeCensus(claudeFixture()));
  assertTainted(runClaudeCensus(claudeFixture((fx) => { fx.manifestWork = 'wr-2026-09-30-some-other-lane'; })), 'manifest Work mismatch');
  assertTainted(runClaudeCensus(claudeFixture((fx) => { fx.roles[0].evidence = { ...fx.roles[0].evidence, session: C }; })), 'sidecar session mismatch');
  assertTainted(runClaudeCensus(claudeFixture((fx) => { fx.roles[0].rows = builderRows(C); })), 'native rows carry another sessionId');
  assertTainted(runClaudeCensus(claudeFixture((fx) => {
    fx.roles[0] = { ...fx.roles[0], sessionId: LEAD_ID, transcriptRel: fx.leadRel, rows: null, evidence: { ...fx.roles[0].evidence, session: LEAD_ID } };
  })), 'declaring the lead itself');
});

test('a sidecar that starts before the first row is ordinary startup, not a mismatch', () => {
  const r = runClaudeCensus(claudeFixture((fx) => { fx.roles[0].evidence = { session: B, started: '2026-09-30T00:01:00.000Z', sourceSha256: 'b'.repeat(64) }; }));
  assertControl(r);
});

test('missing transcript, no in-window usage, corrupt usage, corrupt row and unknown model are PARTIAL, never zero', () => {
  assertControl(runClaudeCensus(claudeFixture()));
  const missing = runClaudeCensus(claudeFixture((fx) => { fx.roles[0].rows = null; }));
  assertTainted(missing, 'declared transcript missing');
  const empty = runClaudeCensus(claudeFixture((fx) => { fx.roles[0].rows = [user('2026-09-30T12:05:00.000Z')].map((x) => ({ ...x, sessionId: B })); }));
  assertTainted(empty, 'no usage rows in window');
  const outside = runClaudeCensus(claudeFixture((fx) => { fx.roles[0].rows = [asst('2026-09-30T14:00:00.000Z', { sessionId: B, req: 'late' })]; }));
  assertTainted(outside, 'usage only outside the window');
  const corruptUsage = runClaudeCensus(claudeFixture((fx) => { fx.roles[0].rows = [asst('2026-09-30T12:10:00.000Z', { sessionId: B, req: 'neg', output: -5 })]; }));
  assertTainted(corruptUsage, 'negative token field');
  const corruptRow = runClaudeCensus(claudeFixture((fx) => { fx.roles[0].rows = [...builderRows(), '{"type":"assistant","timestamp":"2026-09-30T12:20:00.000Z","message":']; }));
  assertTainted(corruptRow, 'unparsable in-window row');
  const noModel = runClaudeCensus(claudeFixture((fx) => { fx.roles[0].rows = [asst('2026-09-30T12:10:00.000Z', { sessionId: B, req: 'nomodel', noModel: true })]; }));
  assertTainted(noModel, 'unknown model');
  for (const r of [missing, empty]) {
    const role = roleOf(r);
    if (role) { assert.notEqual(role.status, 'complete'); assert.ok(role.reasons.length > 0, 'names the reason'); assert.notEqual(role.requests, 0, 'a missing source is not a confident zero request count'); }
  }
});

test('path confinement: parent-traversal and absolute transcript paths, and an escaping evidence path, are refused', () => {
  assertControl(runClaudeCensus(claudeFixture()));
  const outside = claudeFixture();
  const outsideFile = path.join(outside.root, 'outside', `${B}.jsonl`);
  writeRows(outsideFile, builderRows());
  outside.roles[0].rows = null;
  outside.roles[0].transcriptRel = `../outside/${B}.jsonl`;
  assertTainted(runClaudeCensus(outside), 'transcript ../ traversal');
  const abs = claudeFixture();
  abs.roles[0].transcriptRel = path.join(abs.claudeRoot, `projects/lane/${B}.jsonl`);
  abs.roles[0].rows = null;
  writeRows(abs.roles[0].transcriptRel, builderRows());
  assertTainted(runClaudeCensus(abs), 'absolute transcript path');
  const evid = claudeFixture();
  evid.roles[0].evidencePath = '../evidence-outside.json';
  writeText(path.join(evid.root, 'evidence-outside.json'), JSON.stringify(evid.roles[0].evidence));
  assertTainted(runClaudeCensus(evid), 'evidence path escaping the repo');
});

test('record/--repo/--from/--to are required together and --marker is forbidden with a manifest', () => {
  assertControl(runClaudeCensus(claudeFixture()));
  assertTainted(runClaudeCensus(claudeFixture((fx) => { fx.args.noRepo = true; })), '--record without --repo');
  assertTainted(runClaudeCensus(claudeFixture((fx) => { fx.args.noFrom = true; })), 'manifest without explicit --from');
  assertTainted(runClaudeCensus(claudeFixture((fx) => { fx.args.noTo = true; })), 'manifest without explicit --to');
  assertTainted(runClaudeCensus(claudeFixture((fx) => { fx.args.marker = 'start'; })), '--marker with a manifest');
});

test('a declared Codex role reuses the Codex reader: processed input+output, cached and reasoning not added (F11)', () => {
  const rel = 'sessions/2026/09/30/rollout-c.jsonl';
  const codexRows = [
    { type: 'session_meta', timestamp: '2026-09-30T12:19:00.000Z', payload: { id: C, session_id: C, thread_source: 'user' } },
    { type: 'event_msg', timestamp: '2026-09-30T12:19:01.000Z', payload: { type: 'task_started', turn_id: 'c-turn' } },
    { type: 'turn_context', timestamp: '2026-09-30T12:19:02.000Z', payload: { turn_id: 'c-turn', model: 'gpt-5.6-sol' } },
    { type: 'token_usage_record', timestamp: '2026-09-30T12:20:00.000Z', payload: { session_id: C, response_id: 'c-r1', turn_id: 'c-turn', usage: { input_tokens: 100, cached_input_tokens: 40, cache_write_input_tokens: 0, output_tokens: 10, reasoning_output_tokens: 4, total_tokens: 110 } } },
    { type: 'event_msg', timestamp: '2026-09-30T12:20:01.000Z', payload: { type: 'task_complete', turn_id: 'c-turn' } },
  ];
  const r = runClaudeCensus(claudeFixture((fx) => {
    fx.roles.push({ host: 'codex', sessionId: C, role: 'reviewer', transcriptRel: rel, rows: codexRows, evidenceName: 'reviewer', evidence: { session: C, startedAt: '2026-09-30T12:18:00.000Z', sourceSha256: 'c'.repeat(64) } });
  }));
  assert.ok(counted(r), explain(r));
  const role = roleOf(r, C);
  assert.ok(role, 'Codex role result present');
  assert.equal(role.host, 'codex');
  assert.equal(role.status, 'complete');
  assert.equal(role.byModel['gpt-5.6-sol'].derived_total_tokens, 110, 'input 100 (includes cached 40) + output 10; reasoning 4 is a subset');
});

// ── Item 2: Codex activity (stalls) ───────────────────────────────────────────────────────────
const CROOT = 'root-session';
const CMODEL = 'gpt-5.6-terra';
const ts = (hms) => `2026-09-30T${hms}.000Z`;
const crow = (type, payload, hms) => ({ type, timestamp: ts(hms), payload });
const started = (turn, hms, extra = {}) => crow('event_msg', { type: 'task_started', turn_id: turn, ...extra }, hms);
const complete = (turn, hms) => crow('event_msg', { type: 'task_complete', turn_id: turn }, hms);
const cusage = (resp, turn, hms) => crow('token_usage_record', { session_id: CROOT, response_id: resp, turn_id: turn, usage: { input_tokens: 10, cached_input_tokens: 2, cache_write_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 1, total_tokens: 15 } }, hms);
const cctx = (turn, hms) => crow('turn_context', { turn_id: turn, model: CMODEL }, hms);
const cmeta = (hms) => crow('session_meta', { id: CROOT, session_id: CROOT, thread_source: 'user' }, hms);
const say = (hms, text = 'ok') => crow('response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `${text}${SEP}` }] }, hms);
const call = (id, hms, name = 'exec') => crow('response_item', { type: 'function_call', call_id: id, name, arguments: '{}' }, hms);
const callOut = (id, hms) => crow('response_item', { type: 'function_call_output', call_id: id, output: 'done' }, hms);
const head = () => [cmeta('11:00:00'), started('T1', '11:00:01'), cctx('T1', '11:00:02'), cusage('r1', 'T1', '11:00:03')];

function runCodexActivity(rows, { from = ts('11:00:00'), to = ts('20:00:00'), extra = [] } = {}) {
  const home = mkTmp('lane62-codex-');
  const lead = path.join(home, 'sessions', '2026', '09', '30', 'lead.jsonl');
  writeRows(lead, rows);
  const out = path.join(home, 'census.json');
  const res = runNode(BUILD_CENSUS, ['--lead', lead, '--codex-home', home, '--from', from, '--to', to, '--json', out, ...extra]);
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  return { ...res, report, activity: report ? report.activity : undefined, home, lead };
}
const big = (a) => (a && a.intervals ? a.intervals.filter((i) => i.durationMs > 7200000 || i.rightCensored) : []);
const need = (r) => { assert.equal(r.status, 0, `codex census ran: ${r.stderr.slice(0, 300)}`); assert.ok(r.activity, 'census JSON carries activity for a Codex lead'); return r.activity; };

test('activity: same-size 3h gap is in-turn silence when the turn is open, between-turns when completed', () => {
  const open = need(runCodexActivity([...head(), say('14:00:03'), complete('T1', '14:00:04')]));
  assert.equal(open.causalAttribution, 'UNSUPPORTED');
  assert.equal(open.thresholdMs, 7200000);
  assert.equal(open.coverage, 'complete', open.reasons.join('; '));
  const g = big(open);
  assert.equal(g.length, 1);
  assert.equal(g[0].kind, 'in-turn-silence');
  assert.equal(g[0].durationMs, 10800000);
  assert.equal(g[0].rightCensored, false);
  assert.ok(g[0].sourceRows.length >= 2 && g[0].sourceRows.every(Number.isInteger), 'boundary source row numbers only');
  assert.deepEqual([open.observedSilentGaps, open.toolRunningGaps, open.baselineRuleGaps], [1, 0, 1]);
  const closed = need(runCodexActivity([...head(), complete('T1', '11:00:04'), started('T2', '14:00:04'), cusage('r2', 'T2', '14:00:06'), complete('T2', '14:00:08')]));
  const c = big(closed);
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, 'between-turns');
  assert.equal(c[0].durationMs, 10800000);
  assert.deepEqual([closed.observedSilentGaps, closed.toolRunningGaps], [0, 0], 'an owner wait between turns is not a silent stall');
  assert.equal(closed.baselineRuleGaps, 1, 'the baseline event-gap rule still counts consecutive native events, owner waits included');
});

test('activity: a long tool call (wait_agent, sleep, exec) is tool-running runtime, never a blamed stall', () => {
  for (const name of ['wait_agent', 'sleep', 'exec']) {
    const a = need(runCodexActivity([...head(), call('c1', '11:00:04', name), callOut('c1', '14:00:04'), complete('T1', '14:00:05')]));
    const g = big(a);
    assert.equal(g.length, 1, name);
    assert.equal(g[0].kind, 'tool-running', name);
    assert.deepEqual(g[0].callIds, ['c1']);
    assert.deepEqual([a.observedSilentGaps, a.toolRunningGaps, a.baselineRuleGaps], [0, 1, 1], name);
  }
});

test('activity: threshold is strictly greater than 120 minutes', () => {
  const exactly = need(runCodexActivity([...head(), say('13:00:03'), complete('T1', '13:00:04')]));
  assert.deepEqual([exactly.observedSilentGaps, exactly.toolRunningGaps, exactly.baselineRuleGaps], [0, 0, 0], 'exactly 120 minutes qualifies nowhere');
  const over = need(runCodexActivity([...head(), crow('response_item', { type: 'message', role: 'assistant', content: [] }, '13:00:03'), complete('T1', '13:00:04')].map((row, i) => (i === 4 ? { ...row, timestamp: '2026-09-30T13:00:03.001Z' } : row))));
  assert.deepEqual([over.observedSilentGaps, over.baselineRuleGaps], [1, 1], 'one millisecond over qualifies');
});

test('activity: right censoring - an open turn at the boundary is labelled; a closed turn accrues no idle', () => {
  const open = need(runCodexActivity(head(), { to: ts('15:00:00') }));
  const g = big(open);
  assert.equal(g.length, 1, 'one right-censored interval');
  assert.equal(g[0].rightCensored, true);
  assert.equal(g[0].kind, 'in-turn-silence');
  assert.equal(g[0].to, '2026-09-30T15:00:00.000Z', 'censored at the fixed window end');
  assert.equal(open.observedSilentGaps, 1, 'reported as a separate diagnostic');
  assert.equal(open.baselineRuleGaps, 0, 'an artificial to boundary is not a consecutive native event');
  const closed = need(runCodexActivity([...head(), complete('T1', '11:00:04')], { to: ts('15:00:00') }));
  assert.deepEqual(big(closed), [], 'a completed turn cannot accrue infinite idle');
  assert.deepEqual([closed.observedSilentGaps, closed.baselineRuleGaps], [0, 0]);
  const openTool = need(runCodexActivity([...head(), call('c9', '11:00:04')], { to: ts('15:00:00') }));
  const t = big(openTool);
  assert.equal(t.length, 1);
  assert.equal(t[0].kind, 'tool-running');
  assert.equal(t[0].rightCensored, true);
  assert.equal(openTool.observedSilentGaps, 0);
});

test('activity: no lifecycle evidence is unavailable with null counts, not zero', () => {
  const r = runCodexActivity([cmeta('11:00:00'), cctx('T1', '11:00:02'), cusage('r1', 'T1', '11:00:03'), say('15:00:03')]);
  const a = need(r);
  assert.notEqual(a.coverage, 'complete');
  assert.equal(a.observedSilentGaps, null);
  assert.equal(a.toolRunningGaps, null);
});

test('activity: contradictory lifecycle or tool order is PARTIAL', () => {
  const completeFirst = need(runCodexActivity([cmeta('11:00:00'), complete('T1', '11:00:02'), started('T1', '11:00:10'), cctx('T1', '11:00:11'), cusage('r1', 'T1', '11:00:12')]));
  assert.equal(completeFirst.coverage, 'PARTIAL', 'task_complete before task_started for one turn id');
  assert.ok(completeFirst.reasons.length > 0);
  const outputFirst = need(runCodexActivity([...head(), callOut('c1', '11:00:04'), call('c1', '11:00:05'), complete('T1', '11:00:06')]));
  assert.equal(outputFirst.coverage, 'PARTIAL', 'output before its call');
});

test('activity: identical replayed lifecycle/tool rows collapse and create no gaps; timestamp reversal alone is not a contradiction', () => {
  const base = [...head(), say('14:00:03'), complete('T1', '14:00:04')];
  const replay = [...base, started('T1', '11:00:01'), complete('T1', '14:00:04'), base[3]];
  const a = need(runCodexActivity(replay));
  assert.equal(a.coverage, 'complete', a.reasons.join('; '));
  assert.deepEqual([a.observedSilentGaps, a.baselineRuleGaps], [1, 1], 'replayed events are not extra gaps or counts');
  const reversed = need(runCodexActivity([...head().slice(0, 3), say('14:00:03'), cusage('r1', 'T1', '11:00:03'), complete('T1', '14:00:04')]));
  assert.equal(reversed.coverage, 'complete', reversed.reasons.join('; '));
  assert.deepEqual([reversed.observedSilentGaps, reversed.baselineRuleGaps], [1, 1], 'stable sort by timestamp then file order');
});

test('activity: an unrelated new turn supersedes an unclosed predecessor as unknown/PARTIAL, even with a shared root_turn_id', () => {
  for (const extra of [{}, { root_turn_id: 'R' }]) {
    const rows = [cmeta('11:00:00'), started('T1', '11:00:01', extra), cctx('T1', '11:00:02'), cusage('r1', 'T1', '11:00:03'), started('T2', '14:00:03', extra), cctx('T2', '14:00:04'), cusage('r2', 'T2', '14:00:05'), complete('T2', '14:00:06')];
    const a = need(runCodexActivity(rows));
    assert.equal(a.coverage, 'PARTIAL', JSON.stringify(extra));
    assert.ok(a.reasons.length > 0);
    const g = big(a);
    assert.equal(g.length, 1, 'the gap is bounded by actual events, not dropped');
    assert.equal(g[0].kind, 'unknown');
    assert.deepEqual([a.observedSilentGaps, a.toolRunningGaps, a.baselineRuleGaps], [0, 0, 1], 'unknown never counts as silent or tool-running, but the event-gap baseline rule counts it');
  }
});

test('wake rows: a replayed identical note row counts once and never becomes a turn entry by proximity', () => {
  const note = 'skills-fable → skills-o, 9.30.26 08:05 NYC [skills-fable-lane62-1] ASK: lane62 fixture note. Needs: ack';
  const wake = (hms) => crow('response_item', { type: 'message', id: 'msg-note', role: 'user', content: [{ type: 'input_text', text: note }] }, hms);
  const r = runCodexActivity([...head(), wake('11:05:00'), wake('11:05:00'), complete('T1', '11:06:00')]);
  assert.equal(r.status, 0, r.stderr.slice(0, 200));
  assert.equal(r.report.lead.wakesNoteFlush + (r.report.lead.wakesDoneTick || 0), 1, 'one wake');
  assert.equal(r.report.lead.wakes, 1);
});

// ── Item 3: rework attribution ────────────────────────────────────────────────────────────────
const T_OPENED = '2026-09-20T12:00:00.000Z';
const T_ACCEPTED = '2026-09-21T12:00:00.000Z';
const DAY = 86400000;
const at = (base, deltaMs) => new Date(Date.parse(base) + deltaMs).toISOString();
const TARGET = 'wr-2026-09-20-target';

function recordText({ work, opened = T_OPENED, accepted = T_ACCEPTED, followUpOf, extra = [] }) {
  const lines = [`Work: ${work}`, 'Scope: lane62 fixture', 'Owner: fixture', accepted ? 'Status: accepted' : 'Status: delivered', 'Authority: fixture',
    'Artifact: build/fixture@0123456789abcdef0123456789abcdef01234567', 'Evidence: docs/work/evidence/review.md', 'Next: none',
    `Opened: ${opened}`, `Lead-session: ${LEAD_ID}`, ...extra];
  if (followUpOf !== undefined) lines.push(`Follow-up-of: ${followUpOf}`);
  lines.push(`Log: ${opened} owned fixture picked up`);
  if (accepted) lines.push(`Log: ${accepted} accepted fixture artifact 0123456789abcdef0123456789abcdef01234567`);
  lines.push('', 'Observed: fixture.', '');
  return lines.join('\n');
}
function reworkFixture(records, { target = TARGET, asOf = at(T_ACCEPTED, 10 * DAY), recordsFlag = true, targetText } = {}) {
  const root = mkTmp('lane62-rework-');
  const dir = path.join(root, 'docs', 'work');
  for (const r of records) writeText(path.join(dir, `${r.file || r.work}.record.md`), recordText(r));
  const targetPath = path.join(dir, `${target}.record.md`);
  if (!fs.existsSync(targetPath)) writeText(targetPath, targetText || recordText({ work: target }));
  const census = path.join(root, 'census.json');
  const lead = path.join(root, 'lead', `${LEAD_ID}.jsonl`);
  writeRows(lead, [user(T_OPENED), asst(at(T_OPENED, 5000), { sessionId: LEAD_ID, req: 'l1' })]);
  const cres = runNode(BUILD_CENSUS, ['--lead', lead, '--from', T_OPENED, '--to', T_ACCEPTED, '--json', census]);
  assert.equal(cres.status, 0, `census for rework fixture: ${cres.stderr.slice(0, 300)}`);
  const out = path.join(root, 'four.json');
  const args = ['--record', targetPath, '--census', census, '--json', out, '--as-of', asOf];
  if (recordsFlag) args.push('--records', dir);
  const res = runNode(FOUR_READ, args);
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  return { ...res, report, rework: report ? report.reworkAttribution : undefined, dir, root, targetPath };
}
const reworkNeed = (r) => { assert.equal(r.status, 0, `four-read ran: ${r.stderr.slice(0, 300)}`); assert.ok(r.rework, 'four-read JSON carries reworkAttribution'); return r.rework; };
const child = (work, openedDeltaMs, extra = {}) => ({ work, opened: at(T_ACCEPTED, openedDeltaMs), accepted: null, followUpOf: TARGET, ...extra });

test('rework: direct children admitted strictly after acceptance and within 7 days are counted once each, bounds exact', () => {
  const r = reworkFixture([
    child('wr-2026-09-21-child-a', 60000),
    child('wr-2026-09-27-child-b', 7 * DAY), // exactly acceptance + 7d: inside
    child('wr-2026-09-21-child-edge0', 0), // exactly at acceptance: not after it
    child('wr-2026-09-28-child-late', 7 * DAY + 1), // one ms past the window
    { work: 'wr-2026-09-22-grand', opened: at(T_ACCEPTED, DAY), accepted: null, followUpOf: 'wr-2026-09-21-child-a' }, // grandchild: never billed to target
  ]);
  const w = reworkNeed(r);
  assert.equal(w.scope, 'declared-links-only');
  assert.equal(w.coverage, 'complete', w.reasons.join('; '));
  assert.equal(w.mature, true);
  assert.equal(w.windowEnd, at(T_ACCEPTED, 7 * DAY));
  assert.equal(w.episodeCount, 2);
  assert.deepEqual(w.episodes.map((e) => e.work).sort(), ['wr-2026-09-21-child-a', 'wr-2026-09-27-child-b']);
  assert.ok(w.episodes.every((e) => e.parent === TARGET && e.source === 'follow-up-of'));
  assert.deepEqual(w.outsideWindow.map((e) => e.work).sort(), ['wr-2026-09-21-child-edge0', 'wr-2026-09-28-child-late'], 'listed outside coverage, not silently mixed');
});

test('rework: the episode count and its scope/maturity are in the copied Four-numbers row, separate from legacy counts', () => {
  const w = reworkFixture([child('wr-2026-09-21-child-a', 60000)]);
  reworkNeed(w);
  const value = w.report.numbers.find((n) => n.key === 'reworkAfterAcceptance').value;
  assert.match(value, /1 .*episode/i, 'episode count is in the row the operator copies');
  assert.match(value, /declared/i, 'scope limitation is in the text');
  assert.match(value, /mature/i, 'maturity is in the text');
  assert.match(value, /0 re-accept Log: entries after the first/, 'the existing re-accept companion stays separate and unchanged');
  assert.ok(!/\b1 \+ 0\b|\bsum\b/i.test(value), 'overlapping counts are never summed');
});

test('rework: as-of before windowEnd is PARTIAL with the observed count, not a mature zero; later children stay out', () => {
  const r = reworkFixture([child('wr-2026-09-21-child-a', 60000), child('wr-2026-09-25-future', 4 * DAY)], { asOf: at(T_ACCEPTED, 2 * DAY) });
  const w = reworkNeed(r);
  assert.equal(w.coverage, 'PARTIAL');
  assert.equal(w.mature, false);
  assert.ok(w.reasons.some((x) => /window|open|mature/i.test(x)));
  assert.equal(w.episodeCount, 1, 'observed so far; the child opened after as-of is not in this read');
  const none = reworkNeed(reworkFixture([], { asOf: at(T_ACCEPTED, 2 * DAY) }));
  assert.equal(none.mature, false);
  assert.equal(none.coverage, 'PARTIAL', 'an open window with zero children is provisional, not a mature zero');
  const exactlyEnd = reworkNeed(reworkFixture([], { asOf: at(T_ACCEPTED, 7 * DAY) }));
  assert.equal(exactlyEnd.mature, true, 'mature is asOf >= windowEnd');
  assert.equal(exactlyEnd.episodeCount, 0);
});

test('rework: missing parent, self-link, cycle and conflicting duplicate Work ids are PARTIAL, not a crash or a count', () => {
  const okControl = reworkNeed(reworkFixture([child('wr-2026-09-21-child-a', 60000)]));
  assert.equal(okControl.coverage, 'complete');
  const missing = reworkNeed(reworkFixture([], { targetText: recordText({ work: TARGET, followUpOf: 'wr-2026-09-01-missing' }) }));
  assert.equal(missing.coverage, 'PARTIAL');
  assert.equal(missing.followUpOf, 'wr-2026-09-01-missing');
  assert.ok(missing.reasons.some((x) => /missing|parent/i.test(x)));
  const self = reworkNeed(reworkFixture([], { targetText: recordText({ work: TARGET, followUpOf: TARGET }) }));
  assert.equal(self.coverage, 'PARTIAL');
  assert.ok(self.reasons.some((x) => /self|cycle/i.test(x)));
  const cycle = reworkNeed(reworkFixture([{ work: 'wr-2026-09-19-parent', opened: '2026-09-19T00:00:00.000Z', accepted: null, followUpOf: TARGET }], { targetText: recordText({ work: TARGET, followUpOf: 'wr-2026-09-19-parent' }) }));
  assert.equal(cycle.coverage, 'PARTIAL');
  assert.ok(cycle.reasons.some((x) => /cycle/i.test(x)));
  const dup = reworkNeed(reworkFixture([child('wr-2026-09-21-dup', 60000), { ...child('wr-2026-09-21-dup', 120000), file: 'dup-second-file' }]));
  assert.equal(dup.coverage, 'PARTIAL', 'two records claim one relevant Work id');
  assert.ok(dup.reasons.some((x) => /duplicate|conflict/i.test(x)));
});

test('rework: an unrelated malformed Follow-up-of elsewhere in the corpus is ignored', () => {
  const r = reworkNeed(reworkFixture([child('wr-2026-09-21-child-a', 60000), { work: 'wr-2026-09-22-unrelated', opened: at(T_ACCEPTED, DAY), accepted: null, followUpOf: 'not a work id !!' }]));
  assert.equal(r.coverage, 'complete', r.reasons.join('; '));
  assert.equal(r.episodeCount, 1);
});

test('rework: no usable corpus or no acceptance is unavailable with a null count, never 0', () => {
  const emptyRoot = mkTmp('lane62-empty-records-');
  const r = reworkFixture([child('wr-2026-09-21-child-a', 60000)]);
  const res = runNode(FOUR_READ, ['--record', r.targetPath, '--census', path.join(r.root, 'census.json'), '--json', path.join(r.root, 'x.json'), '--as-of', at(T_ACCEPTED, 10 * DAY), '--records', emptyRoot]);
  assert.equal(res.status, 0, res.stderr.slice(0, 200));
  const wrong = JSON.parse(fs.readFileSync(path.join(r.root, 'x.json'), 'utf8')).reworkAttribution;
  assert.ok(wrong, 'reworkAttribution present');
  assert.equal(wrong.coverage, 'unavailable', 'an empty directory is not a corpus containing the target');
  assert.equal(wrong.episodeCount, null);
  const unaccepted = reworkNeed(reworkFixture([], { targetText: recordText({ work: TARGET, accepted: null }) }));
  assert.equal(unaccepted.coverage, 'unavailable');
  assert.equal(unaccepted.episodeCount, null);
});

test('rework: --records defaults to the sibling directory of the target record', () => {
  const r = reworkNeed(reworkFixture([child('wr-2026-09-21-child-a', 60000)], { recordsFlag: false }));
  assert.equal(r.episodeCount, 1);
});

// ── Item 4: shared token definition and top-tier classification ──────────────────────────────
async function measures() {
  try { return await import(pathToFileURL(MEASURES).href); } catch (e) { assert.fail(`scripts/census-measures.mjs must export processedTokenTotal and isTopTierModel (${e.code || e.message})`); }
}

test('processedTokenTotal: Claude categories are disjoint; Codex is input+output; equal vectors agree across hosts', async () => {
  const { processedTokenTotal } = await measures();
  const claude = processedTokenTotal('claude', { input_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 40, output_tokens: 10 });
  const codex = processedTokenTotal('codex', { input_tokens: 100, cached_input_tokens: 40, output_tokens: 10, reasoning_output_tokens: 4 });
  assert.equal(claude, 110);
  assert.equal(codex, 110, 'cached input is a subset of input; reasoning is a subset of output');
  assert.equal(processedTokenTotal('claude', { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 4 }), 10);
  assert.equal(processedTokenTotal('claude', { input_tokens: 1, cache_creation_input_tokens: 2, cache_creation: { ephemeral_5m_input_tokens: 2, ephemeral_1h_input_tokens: 0 }, cache_read_input_tokens: 3, output_tokens: 4 }), 10, 'nested cache creation breakdown is never an extra term');
  assert.equal(processedTokenTotal('codex', { input_tokens: 50, cached_input_tokens: 30, cache_write_input_tokens: 20, output_tokens: 5 }), 55, 'cached+cache_write == input is allowed');
});

test('processedTokenTotal: invalid vectors throw instead of becoming zero', async () => {
  const { processedTokenTotal } = await measures();
  const good = { input_tokens: 10, output_tokens: 5 };
  assert.equal(processedTokenTotal('codex', good), 15, 'control');
  for (const [host, bad] of [
    ['claude', { ...good, input_tokens: -1 }], ['claude', { ...good, output_tokens: Number.NaN }], ['claude', { ...good, cache_read_input_tokens: Infinity }],
    ['claude', { input_tokens: 10 }], ['claude', { output_tokens: 5 }], ['claude', { ...good, cache_creation_input_tokens: -2 }], ['claude', { ...good, cache_read_input_tokens: '7' }],
    ['codex', { ...good, cached_input_tokens: 8, cache_write_input_tokens: 3 }], ['codex', { ...good, reasoning_output_tokens: 6 }],
    ['codex', { ...good, reasoning_output_tokens: -1 }], ['codex', { ...good, cached_input_tokens: -1 }], ['codex', null],
  ]) assert.throws(() => processedTokenTotal(host, bad), undefined, `${host} ${JSON.stringify(bad)}`);
});

test('isTopTierModel: known non-top is false, top and configured are true, unknown stays null', async () => {
  const { isTopTierModel } = await measures();
  for (const m of ['claude-fable-5-1', 'claude-opus-5-5', 'gpt-6-astra', 'gpt-5.6-sol']) assert.equal(isTopTierModel(m), true, m);
  for (const m of ['claude-sonnet-5-5', 'claude-haiku-4-5-20251001', 'gpt-5.6-terra', 'gpt-5.6-luna', 'codex-spark']) assert.equal(isTopTierModel(m), false, m);
  for (const m of ['mystery-model-1', '', null, 'gpt-7-nova']) assert.equal(isTopTierModel(m), null, String(m));
  assert.equal(isTopTierModel('zeta-9', ['zeta']), true, 'configured family matches');
  assert.equal(isTopTierModel('claude-sonnet-5-5', ['zeta']), false, 'known non-top stays false under configuration');
  assert.equal(isTopTierModel('mystery-model-1', ['zeta']), null);
});

function fourReadWithCombined(mutateCombined) {
  const root = mkTmp('lane62-tier-');
  const lead = path.join(root, 'lead', `${LEAD_ID}.jsonl`);
  writeRows(lead, [user(T_OPENED), asst(at(T_OPENED, 5000), { sessionId: LEAD_ID, req: 'l1' })]);
  const census = path.join(root, 'census.json');
  assert.equal(runNode(BUILD_CENSUS, ['--lead', lead, '--from', T_OPENED, '--to', T_ACCEPTED, '--json', census]).status, 0);
  const parsed = JSON.parse(fs.readFileSync(census, 'utf8'));
  mutateCombined(parsed.combined);
  fs.writeFileSync(census, JSON.stringify(parsed));
  const record = path.join(root, 'docs', 'work', `${TARGET}.record.md`);
  writeText(record, recordText({ work: TARGET }));
  const out = path.join(root, 'four.json');
  const res = runNode(FOUR_READ, ['--record', record, '--census', census, '--json', out, '--as-of', at(T_ACCEPTED, 10 * DAY)]);
  assert.equal(res.status, 0, res.stderr.slice(0, 300));
  return JSON.parse(fs.readFileSync(out, 'utf8')).numbers.find((n) => n.key === 'topTierTokensPerBuild').value;
}
const vec = (input, output) => ({ input_tokens: input, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: output });

test('top-tier tokens: positive unclassified-model tokens make the number unavailable with an observed subtotal; zero rows do not', () => {
  const control = fourReadWithCombined(() => {});
  assert.match(control, /^15 tokens: build 15 /, `control: lead opus 15 tokens counted (${control})`);
  const unknown = fourReadWithCombined((c) => { c['mystery-model-1'] = vec(100, 50); });
  assert.match(unknown, /^unavailable/, `an unknown model with tokens must not read as a confident number (${unknown})`);
  assert.match(unknown, /15/, 'observed top-tier subtotal is still shown');
  const zero = fourReadWithCombined((c) => { c['mystery-model-1'] = vec(0, 0); });
  assert.match(zero, /^15 tokens/, `a zero-token unknown row is not unknown usage (${zero})`);
  const mid = fourReadWithCombined((c) => { c['claude-sonnet-5-5'] = vec(100, 50); });
  assert.match(mid, /^15 tokens/, `known non-top model is excluded, not unknown (${mid})`);
});

// ── Item 1+4 cross-host: Codex lead + declared Claude role reach one four-read number (F1) ────
test('Codex-led mixed lane: Codex 100 + declared Claude opus 10 = four-read 110 processed tokens', () => {
  const home = mkTmp('lane62-mixed-');
  const codexHome = path.join(home, 'codex-home');
  const claudeRoot = path.join(home, 'claude-root');
  const repo = path.join(home, 'repo');
  const leadFile = path.join(codexHome, 'sessions', '2026', '09', '30', 'lead.jsonl');
  const leadRows = [cmeta('12:00:00'), started('T1', '12:00:01'), cctx('T1', '12:00:02'), crow('token_usage_record', { session_id: CROOT, response_id: 'r1', turn_id: 'T1', usage: { input_tokens: 80, cached_input_tokens: 20, cache_write_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 100 } }, '12:00:03'), complete('T1', '12:00:04')]
    .map((r) => (r.type === 'turn_context' ? { ...r, payload: { ...r.payload, model: 'gpt-5.6-sol' } } : r));
  writeRows(leadFile, leadRows);
  const role = { host: 'claude', sessionId: B, role: 'builder', evidence: 'docs/work/evidence/builder.identity.json', transcript: `projects/lane/${B}.jsonl` };
  writeRows(path.join(claudeRoot, role.transcript), [asst('2026-09-30T12:10:00.000Z', { sessionId: B, req: 'b1', input: 10, output: 0 })]);
  writeText(path.join(repo, role.evidence), JSON.stringify({ session: B, startedAt: '2026-09-30T11:58:00.000Z', sourceSha256: 'd'.repeat(64) }));
  writeText(path.join(repo, 'docs/work/roles.json'), JSON.stringify({ version: 1, work: WORK, sessions: [role] }));
  const opened = '2026-09-30T12:00:00.000Z';
  const accepted = '2026-09-30T13:00:00.000Z';
  const recPath = path.join(repo, 'docs', 'work', 'lane.record.md');
  writeText(recPath, recordText({ work: WORK, opened, accepted, extra: ['Role-sessions: docs/work/roles.json'] }).replace(LEAD_ID, CROOT));
  const census = path.join(home, 'census.json');
  const cres = runNode(BUILD_CENSUS, ['--lead', leadFile, '--codex-home', codexHome, '--from', opened, '--to', accepted, '--json', census, '--record', recPath, '--repo', repo, '--claude-root', claudeRoot]);
  assert.equal(cres.status, 0, `codex-led census with declared claude role: ${cres.stderr.slice(0, 300)}`);
  const out = path.join(home, 'four.json');
  const fres = runNode(FOUR_READ, ['--record', recPath, '--census', census, '--json', out, '--as-of', at(accepted, 10 * DAY)]);
  assert.equal(fres.status, 0, fres.stderr.slice(0, 300));
  const value = JSON.parse(fs.readFileSync(out, 'utf8')).numbers.find((n) => n.key === 'topTierTokensPerBuild').value;
  assert.match(value, /^110 tokens/, `Codex 100 (input+output, cached/reasoning subsets) + Claude opus 10 (${value})`);
});
