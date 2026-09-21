// node --test scripts/token-census.test.mjs
//
// Every fixture is a real temp directory built with mkdtempSync under os.tmpdir() — never the
// real `~/.claude`. Tracked and removed in one after() hook at the bottom of this file.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  runCensus,
  formatText,
  parseArgs,
  main,
  resolveWindow,
  discoverFiles,
  classifyTurn,
  modelFamily,
  tierOf,
  costUnits,
  median,
} from './token-census.mjs';

const tracked = [];
function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}

function usage({ input = 0, cacheCreation = 0, cacheRead = 0, output = 0 } = {}) {
  return {
    input_tokens: input,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
    output_tokens: output,
  };
}

function userLine(content, extra = {}) {
  return { type: 'user', timestamp: new Date().toISOString(), message: { role: 'user', content }, ...extra };
}
function toolResultLine() {
  return userLine([{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }]);
}
function assistantLine({ id, model = 'claude-sonnet-4-5-20250929', usageOpts = {}, ts, extra = {} } = {}) {
  return {
    type: 'assistant',
    timestamp: ts || new Date().toISOString(),
    message: { role: 'assistant', id, model, usage: usage(usageOpts), content: [{ type: 'text', text: 'ok' }] },
    ...extra,
  };
}

function writeJsonl(filePath, objs) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, objs.map((o) => JSON.stringify(o)).join('\n') + '\n', 'utf8');
}

function mainFilePath(projectsDir, project, session) {
  return path.join(projectsDir, project, `${session}.jsonl`);
}
function subFilePath(projectsDir, project, session, agentId) {
  return path.join(projectsDir, project, session, 'subagents', `agent-${agentId}.jsonl`);
}
function subMetaPath(projectsDir, project, session, agentId) {
  return path.join(projectsDir, project, session, 'subagents', `agent-${agentId}.meta.json`);
}

// ── classification / small helpers ─────────────────────────────────────────

test('classifyTurn: recognizes each marker class, defaults to null', () => {
  assert.equal(classifyTurn('<task-notification>done</task-notification>'), 'TASK_NOTIFICATION');
  assert.equal(classifyTurn('<teammate-message>hi</teammate-message>'), 'PEER_WAKE');
  assert.equal(classifyTurn('alice → bob, 2026-09-21 [msg-1] ASK: please check'), 'PEER_WAKE');
  assert.equal(classifyTurn('Stop hook feedback: rerun the gate'), 'STOP_HOOK');
  assert.equal(classifyTurn('please fix the bug in foo.js'), null);
});

test('modelFamily / tierOf / costUnits match the pinned definitions', () => {
  assert.equal(modelFamily('claude-opus-4-1-20250805'), 'opus');
  assert.equal(modelFamily('claude-sonnet-4-5-20250929'), 'sonnet');
  assert.equal(modelFamily(null), 'other');
  assert.equal(tierOf('opus'), 'top');
  assert.equal(tierOf('sonnet'), 'mid');
  assert.equal(tierOf('haiku'), 'fast');
  assert.equal(tierOf('other'), 'other');
  assert.equal(costUnits({ input: 10, cache_creation: 10, cache_read: 10, output: 10 }), 10 + 12.5 + 1 + 50);
});

test('median uses the repo-wide lower-median-on-ties percentile convention', () => {
  assert.equal(median([1000, 3000]), 1000);
  assert.equal(median([1000, 2000, 3000]), 2000);
  assert.equal(median([]), null);
});

test('resolveWindow: --since overrides --days; both produce a sane window', () => {
  const now = Date.parse('2026-09-21T12:00:00Z');
  const byDays = resolveWindow({ days: 3 }, now);
  assert.equal(byDays.endMs, now);
  assert.equal(byDays.startMs, now - 3 * 86400000);
  const bySince = resolveWindow({ since: '2026-09-01T00:00:00Z', days: 3 }, now);
  assert.equal(bySince.startMs, Date.parse('2026-09-01T00:00:00Z'));
});

// ── each trigger class, end to end through runCensus ───────────────────────

test('runCensus: buckets every one of the five trigger classes correctly', async () => {
  const projectsDir = mkTmp('census-classes-');
  const now = new Date();
  const nowIso = now.toISOString();
  const lines = [
    userLine('please fix the bug in foo.js'),
    assistantLine({ id: 'r1', ts: nowIso, usageOpts: { input: 100, output: 10 } }),

    userLine('<task-notification>builder finished</task-notification>'),
    assistantLine({ id: 'r2', ts: nowIso, usageOpts: { input: 100, output: 10 } }),

    userLine('<teammate-message>{"type":"idle_notification"}</teammate-message>'),
    assistantLine({ id: 'r3', ts: nowIso, usageOpts: { input: 100, output: 10 } }),

    userLine('Stop hook feedback: gate failed, please rerun'),
    assistantLine({ id: 'r4', ts: nowIso, usageOpts: { input: 100, output: 10 } }),

    userLine('', { isMeta: true }),
    assistantLine({ id: 'r5', ts: nowIso, usageOpts: { input: 100, output: 10 } }),
  ];
  writeJsonl(mainFilePath(projectsDir, 'proj-a', 'session-1'), lines);

  const report = await runCensus({ projectsDir, days: 7 }, undefined, now.getTime());
  const byCls = Object.fromEntries(report.byClass.map((r) => [r.cls, r]));
  assert.equal(byCls.HUMAN.turns, 1);
  assert.equal(byCls.TASK_NOTIFICATION.turns, 1);
  assert.equal(byCls.PEER_WAKE.turns, 1);
  assert.equal(byCls.STOP_HOOK.turns, 1);
  assert.equal(byCls.OTHER.turns, 1);
});

test('runCensus: dedupes API responses by message id', async () => {
  const projectsDir = mkTmp('census-dedupe-');
  const now = new Date();
  const line = assistantLine({ id: 'dup-1', ts: now.toISOString(), usageOpts: { input: 100, output: 10 } });
  const lines = [userLine('do the thing'), line, JSON.parse(JSON.stringify(line))]; // exact duplicate line
  writeJsonl(mainFilePath(projectsDir, 'proj-a', 'session-1'), lines);

  const report = await runCensus({ projectsDir, days: 7 }, undefined, now.getTime());
  const human = report.byClass.find((r) => r.cls === 'HUMAN');
  assert.equal(human.turns, 1); // one turn, not counted twice
  assert.equal(report.mainVsSub.main.rawTokens, 110); // only one response's tokens (100 in + 10 out)
});

test('runCensus: cold-start rule fires only when cache_creation > 50% of the response own context', async () => {
  const projectsDir = mkTmp('census-cold-');
  const now = new Date();
  const nowIso = now.toISOString();
  const lines = [
    // cold: cache_creation (600) is 60% of its own context (1000)
    userLine('cold turn'),
    assistantLine({ id: 'cold-1', ts: nowIso, usageOpts: { input: 400, cacheCreation: 600, output: 10 } }),
    // warm: cache_creation (100) is 10% of its own context (1000)
    userLine('warm turn'),
    assistantLine({ id: 'warm-1', ts: nowIso, usageOpts: { input: 400, cacheCreation: 100, cacheRead: 500, output: 10 } }),
  ];
  writeJsonl(mainFilePath(projectsDir, 'proj-a', 'session-1'), lines);

  const report = await runCensus({ projectsDir, days: 7 }, undefined, now.getTime());
  const human = report.coldStartByClass.find((r) => r.cls === 'HUMAN');
  assert.equal(human.turns, 2);
  assert.equal(human.coldTurns, 1);
  assert.equal(human.coldTurnShare, 0.5);
});

test('runCensus: malformed lines are skipped, not fatal, and counted', async () => {
  const projectsDir = mkTmp('census-malformed-');
  const now = new Date();
  const filePath = mainFilePath(projectsDir, 'proj-a', 'session-1');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const good1 = JSON.stringify(userLine('please help'));
  const good2 = JSON.stringify(assistantLine({ id: 'ok-1', ts: now.toISOString(), usageOpts: { input: 50, output: 5 } }));
  fs.writeFileSync(filePath, [good1, '{ this is not json', good2, ''].join('\n'), 'utf8');

  const report = await runCensus({ projectsDir, days: 7 }, undefined, now.getTime());
  assert.equal(report.sanity.malformedLines, 1);
  const human = report.byClass.find((r) => r.cls === 'HUMAN');
  assert.equal(human.turns, 1);
});

test('runCensus: an empty projects dir produces a clean zeroed report, no crash', async () => {
  const projectsDir = mkTmp('census-empty-');
  const report = await runCensus({ projectsDir, days: 7 });
  assert.equal(report.sanity.mainFiles, 0);
  assert.equal(report.sanity.subFiles, 0);
  for (const r of report.byClass) assert.equal(r.turns, 0);
  assert.equal(report.subagentHighContextShare, null);
});

test('runCensus: a projects dir that does not exist at all is also a clean zeroed report', async () => {
  const projectsDir = path.join(mkTmp('census-missing-'), 'does-not-exist');
  const report = await runCensus({ projectsDir, days: 7 });
  assert.equal(report.sanity.mainFiles, 0);
  assert.equal(report.sanity.subFiles, 0);
});

// ── subagent attribution ────────────────────────────────────────────────────

test('runCensus: attributes subagent files via the .meta.json sidecar agentType field', async () => {
  const projectsDir = mkTmp('census-attrib-');
  const now = new Date();
  const nowIso = now.toISOString();

  writeJsonl(subFilePath(projectsDir, 'proj-a', 'sess-1', 'aaa'), [
    assistantLine({ id: 'b1', ts: nowIso, model: 'claude-sonnet-4-5-20250929', usageOpts: { input: 1000, output: 10 } }),
  ]);
  fs.writeFileSync(subMetaPath(projectsDir, 'proj-a', 'sess-1', 'aaa'), JSON.stringify({ agentType: 'delegation:builder', model: 'inherit' }));

  // No sidecar at all -> UNATTRIBUTED
  writeJsonl(subFilePath(projectsDir, 'proj-a', 'sess-1', 'bbb'), [
    assistantLine({ id: 'b2', ts: nowIso, model: 'claude-sonnet-4-5-20250929', usageOpts: { input: 500, output: 5 } }),
  ]);

  const report = await runCensus({ projectsDir, days: 7 }, undefined, now.getTime());
  const byType = Object.fromEntries(report.topAgentTypes.map((r) => [r.agentType, r]));
  assert.ok(byType['delegation:builder']);
  assert.equal(byType['delegation:builder'].files, 1);
  assert.ok(byType.UNATTRIBUTED);
  assert.equal(report.sanity.metaMissing, 1);
});

test('runCensus: median opening context and call-weighted mean context per agent type', async () => {
  const projectsDir = mkTmp('census-openctx-');
  const now = new Date();
  const nowIso = now.toISOString();

  // file 1: first response ctx=1000, second response ctx=2000
  writeJsonl(subFilePath(projectsDir, 'proj-a', 'sess-1', 'f1'), [
    assistantLine({ id: 'f1-1', ts: nowIso, usageOpts: { input: 1000, output: 1 } }),
    assistantLine({ id: 'f1-2', ts: nowIso, usageOpts: { input: 2000, output: 1 } }),
  ]);
  fs.writeFileSync(subMetaPath(projectsDir, 'proj-a', 'sess-1', 'f1'), JSON.stringify({ agentType: 'delegation:builder' }));

  // file 2: single response ctx=3000
  writeJsonl(subFilePath(projectsDir, 'proj-a', 'sess-1', 'f2'), [
    assistantLine({ id: 'f2-1', ts: nowIso, usageOpts: { input: 3000, output: 1 } }),
  ]);
  fs.writeFileSync(subMetaPath(projectsDir, 'proj-a', 'sess-1', 'f2'), JSON.stringify({ agentType: 'delegation:builder' }));

  const report = await runCensus({ projectsDir, days: 7 }, undefined, now.getTime());
  const row = report.topAgentTypes.find((r) => r.agentType === 'delegation:builder');
  assert.ok(row);
  assert.equal(row.medianOpeningCtx, 1000); // baselineArr = [1000, 3000] -> lower-median convention
  assert.equal(row.meanCtx, 2000); // (1000+2000+3000)/3
});

test('runCensus: agent type names are truncated to 40 chars in the report', async () => {
  const projectsDir = mkTmp('census-truncate-');
  const now = new Date();
  const longType = 'a'.repeat(80);
  writeJsonl(subFilePath(projectsDir, 'proj-a', 'sess-1', 'x1'), [
    assistantLine({ id: 'x1-1', ts: now.toISOString(), usageOpts: { input: 100, output: 1 } }),
  ]);
  fs.writeFileSync(subMetaPath(projectsDir, 'proj-a', 'sess-1', 'x1'), JSON.stringify({ agentType: longType }));

  const report = await runCensus({ projectsDir, days: 7 }, undefined, now.getTime());
  assert.equal(report.topAgentTypes[0].agentType.length, 40);
});

test('runCensus: share of subagent cost at or above 150k context', async () => {
  const projectsDir = mkTmp('census-highctx-');
  const now = new Date();
  const nowIso = now.toISOString();
  // response A: ctx = 100,000 (below threshold)
  writeJsonl(subFilePath(projectsDir, 'proj-a', 'sess-1', 'lo'), [
    assistantLine({ id: 'lo-1', ts: nowIso, usageOpts: { input: 100000, output: 1 } }),
  ]);
  // response B: ctx = 200,000 (at/above threshold)
  writeJsonl(subFilePath(projectsDir, 'proj-a', 'sess-1', 'hi'), [
    assistantLine({ id: 'hi-1', ts: nowIso, usageOpts: { input: 200000, output: 1 } }),
  ]);

  const report = await runCensus({ projectsDir, days: 7 }, undefined, now.getTime());
  const cuLo = costUnits({ input: 100000, cache_creation: 0, cache_read: 0, output: 1 });
  const cuHi = costUnits({ input: 200000, cache_creation: 0, cache_read: 0, output: 1 });
  const expected = +(cuHi / (cuLo + cuHi)).toFixed(4);
  assert.equal(report.subagentHighContextShare, expected);
});

// ── window filtering ────────────────────────────────────────────────────────

test('runCensus: --days excludes responses older than the window, --since widens it', async () => {
  const projectsDir = mkTmp('census-window-');
  const now = new Date('2026-09-21T12:00:00Z');
  const old = new Date(now.getTime() - 10 * 86400000).toISOString();
  const recent = now.toISOString();
  writeJsonl(mainFilePath(projectsDir, 'proj-a', 'sess-1'), [
    userLine('old one'),
    assistantLine({ id: 'old-1', ts: old, usageOpts: { input: 1000, output: 1 } }),
    userLine('recent one'),
    assistantLine({ id: 'new-1', ts: recent, usageOpts: { input: 2000, output: 1 } }),
  ]);

  const narrow = await runCensus({ projectsDir, days: 3 }, undefined, now.getTime());
  assert.equal(narrow.mainVsSub.main.rawTokens, 2001);

  const wide = await runCensus({ projectsDir, since: '2026-09-01T00:00:00Z' }, undefined, now.getTime());
  assert.equal(wide.mainVsSub.main.rawTokens, 1001 + 2001);
});

// ── discoverFiles shape ──────────────────────────────────────────────────────

test('discoverFiles: finds main files directly under a project dir and agent-*.jsonl under subagents', () => {
  const projectsDir = mkTmp('census-discover-');
  writeJsonl(mainFilePath(projectsDir, 'proj-a', 'sess-1'), [userLine('hi')]);
  writeJsonl(subFilePath(projectsDir, 'proj-a', 'sess-1', 'x'), [assistantLine({ id: 'a' })]);
  // A non-agent-prefixed jsonl in subagents must not be picked up.
  writeJsonl(path.join(projectsDir, 'proj-a', 'sess-1', 'subagents', 'not-an-agent-file.jsonl'), [userLine('nope')]);

  const { mainFiles, subFiles } = discoverFiles(fs, projectsDir);
  assert.equal(mainFiles.length, 1);
  assert.equal(subFiles.length, 1);
  assert.match(subFiles[0].full, /agent-x\.jsonl$/);
});

// ── secrecy contract ─────────────────────────────────────────────────────────

test('secrecy: a credential-shaped string in a message never reaches stdout or JSON', async () => {
  const projectsDir = mkTmp('census-secret-');
  const now = new Date();
  const secret = 'sk-ant-api03-' + 'X'.repeat(90);
  writeJsonl(mainFilePath(projectsDir, 'proj-a', 'sess-1'), [
    userLine(`please use this key: ${secret}`),
    assistantLine({ id: 'r1', ts: now.toISOString(), usageOpts: { input: 100, output: 10 } }),
  ]);

  const report = await runCensus({ projectsDir, days: 7, top: 12 }, undefined, now.getTime());
  const asJson = JSON.stringify(report);
  const asText = formatText(report);
  assert.ok(!asJson.includes(secret));
  assert.ok(!asText.includes(secret));
  assert.ok(!asJson.includes('sk-ant-api03'));
  assert.ok(!asText.includes('sk-ant-api03'));
});

test('secrecy: opens nothing outside the given --projects-dir', async () => {
  const projectsDir = mkTmp('census-scope-');
  const outsideDir = mkTmp('census-outside-');
  fs.writeFileSync(path.join(outsideDir, 'do-not-open.txt'), 'nope', 'utf8');
  const now = new Date();
  writeJsonl(mainFilePath(projectsDir, 'proj-a', 'sess-1'), [
    userLine('hello'),
    assistantLine({ id: 'r1', ts: now.toISOString(), usageOpts: { input: 10, output: 1 } }),
  ]);
  writeJsonl(subFilePath(projectsDir, 'proj-a', 'sess-1', 'x'), [
    assistantLine({ id: 'sub-1', ts: now.toISOString(), usageOpts: { input: 10, output: 1 } }),
  ]);
  fs.writeFileSync(subMetaPath(projectsDir, 'proj-a', 'sess-1', 'x'), JSON.stringify({ agentType: 'general-purpose' }));

  const opened = [];
  const tracking = {
    readdirSync: (p, opts) => { opened.push(String(p)); return fs.readdirSync(p, opts); },
    statSync: (p, opts) => { opened.push(String(p)); return fs.statSync(p, opts); },
    existsSync: (p) => { opened.push(String(p)); return fs.existsSync(p); },
    readFileSync: (p, opts) => { opened.push(String(p)); return fs.readFileSync(p, opts); },
    createReadStream: (p, opts) => { opened.push(String(p)); return fs.createReadStream(p, opts); },
  };

  await runCensus({ projectsDir, days: 7 }, tracking, now.getTime());

  assert.ok(opened.length > 0);
  const root = path.resolve(projectsDir);
  for (const p of opened) {
    assert.ok(path.resolve(p).startsWith(root), `opened a path outside projects-dir: ${p}`);
  }
});

// ── CLI wrapper ──────────────────────────────────────────────────────────────

test('parseArgs: reads all flags', () => {
  const opts = parseArgs(['--days', '3', '--projects-dir', '/tmp/x', '--json', '--top', '5', '--since', '2026-01-01']);
  assert.equal(opts.days, 3);
  assert.equal(opts.projectsDir, '/tmp/x');
  assert.equal(opts.json, true);
  assert.equal(opts.top, 5);
  assert.equal(opts.since, '2026-01-01');
});

test('main: text mode prints section headings and no crash on an empty fixture', async () => {
  const projectsDir = mkTmp('census-cli-text-');
  const logs = [];
  const code = await main(['--projects-dir', projectsDir, '--days', '7'], { write: (s) => logs.push(s) });
  assert.equal(code, 0);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /token-census:/);
  assert.match(logs[0], /By trigger class/);
  assert.match(logs[0], /Cold-start share of cost/);
});

test('main: --json mode prints valid, parseable JSON', async () => {
  const projectsDir = mkTmp('census-cli-json-');
  const logs = [];
  await main(['--projects-dir', projectsDir, '--json'], { write: (s) => logs.push(s) });
  const parsed = JSON.parse(logs[0]);
  assert.ok(Array.isArray(parsed.byClass));
  assert.ok(Array.isArray(parsed.topAgentTypes));
});

after(() => {
  for (const dir of tracked) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});
