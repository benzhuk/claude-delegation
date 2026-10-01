// node --test scripts/four-read.test.mjs
//
// Committed fixtures under scripts/fixtures/four-read/ (spec.md Territory R1 item 4):
//   - record.md          — a record with all fields, two `accepted` Log: entries.
//   - lead-session.jsonl  — a trimmed lead transcript with two gaps (10min under, 45min
//                            over the 30-minute threshold), split across a top-tier model
//                            (claude-opus-5-5) and a non-top-tier one (claude-sonnet-5).
//   - ledger/2026-09-01.md — one answered ASK, one unanswered ASK, one ASK to someone else.
//   - record-lane10.md, record-lane16.md — point at the two already-committed real session
//     fixtures under sessions/lane10/ and sessions/lane16/ (contracts.md's Facts section,
//     R6/R7): lane10 has exactly one subagent stall (216.8min); lane16 has 0 stalled and one
//     41.8min waiting-on-agents lead gap. Their census.json is built fresh per test via
//     runCensus, never committed (it's a pure function of the committed .jsonl files).
// A tiny git repo (rework-after-acceptance) is built fresh per test under mkdtempSync,
// never committed, per the spec's own fixture note.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';

import { runCensus } from './build-census.mjs';
import {
  parseRecordText, computeTopTierTokens, scanTimestamps, computeHoursAskToAccepted,
  computeReworkAfterAcceptance, collectLedgerEntries, computeWorkLostOrStalled,
  buildFourRead, formatJson, formatMarkdown, parseArgs, main,
  mergeSpans, splitGapByUnion, buildAgentSpans, scanSubagentFile, collectSubagentStalls,
  validateCensusArg, isBuildCensusJsonShape, CENSUS_REFUSAL_MESSAGE,
} from './four-read.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures', 'four-read');
const RECORD = path.join(FIXTURES, 'record.md');
const LEAD = path.join(FIXTURES, 'lead-session.jsonl');
const LEDGER = path.join(FIXTURES, 'ledger');

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function buildCensusFile(dir, name = 'census.json') {
  const report = await runCensus({ lead: LEAD, tasksDirs: [], marker: null, out: null });
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(report));
  return p;
}

function git(dir, args, env) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env });
}

// N2 ("no test file in this suite inherits the runner environment on its own"): every child this
// file spawns to build a git fixture goes through childEnv(), never a bare process.env.
function initRepo(dir) {
  const env = childEnv(mkTmp('four-read-git-home-'));
  git(dir, ['init', '-q'], env);
  // The machine's git-identity-guard hook refuses a commit whose author/committer email is
  // not on its allowlist, even inside a disposable scratch repo — use an allowed identity.
  git(dir, ['config', 'user.email', 'benzhuk@gmail.com'], env);
  git(dir, ['config', 'user.name', 'fixture'], env);
  return env;
}

function commit(dir, file, content, message, isoDate, env) {
  fs.writeFileSync(path.join(dir, file), content);
  git(dir, ['add', file], env);
  git(dir, ['commit', '-q', '-m', message], { ...env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate });
  return git(dir, ['rev-parse', 'HEAD'], env).trim();
}

// ── parseRecordText ──────────────────────────────────────────────────────────

test('parseRecordText: reads the fixture record\'s fields and both accepted Log: entries', () => {
  const { fields, logs } = parseRecordText(fs.readFileSync(RECORD, 'utf8'));
  assert.equal(fields.opened, '2026-09-01T00:00:00.000Z');
  assert.equal(fields.base, '0000000000000000000000000000000000000000');
  assert.equal(fields['lead-session'], 'lead-session');
  assert.equal(fields['spec-session'], 'fixture-spec-session-id');
  assert.equal(fields['spec-from'], '2026-08-31T23:00:00.000Z');
  assert.equal(logs.filter((l) => l.status === 'accepted').length, 2);
  assert.equal(logs[0].status, 'owned');
  assert.equal(logs.find((l) => l.status === 'accepted').at, '2026-09-02T00:00:00.000Z');
});

test('parseRecordText: a record missing a field simply omits its key, never throws', () => {
  const { fields } = parseRecordText('Work: x\nStatus: runnable\n\nObserved: body\n');
  assert.equal(fields.opened, undefined);
  assert.equal(fields['lead-session'], undefined);
});

// Lane 60b (artifact-repo-60b spec.md item 4): the field this file reads to know Base:/the
// accepted sha live in another repository, never --git.
test('parseRecordText: reads Artifact-repo: like any other singleton field', () => {
  const { fields } = parseRecordText('Work: x\nArtifact-repo: /var/tmp/some-other-repo\n\nObserved: body\n');
  assert.equal(fields['artifact-repo'], '/var/tmp/some-other-repo');
});

// ── computeTopTierTokens (number 1) ─────────────────────────────────────────

test('computeTopTierTokens: no census -> unavailable', () => {
  assert.equal(computeTopTierTokens(null, null, {}).value, 'unavailable (no census)');
});

test('computeTopTierTokens: a census with no combined by-model sums is unavailable, never a silent 0 (BLOCKER 1(b))', () => {
  assert.equal(computeTopTierTokens({ leadPath: 'x.jsonl' }, null, {}).value, 'unavailable (census has no combined by-model sums)');
});

test('computeTopTierTokens: a census window that starts after this build\'s accepted time is rejected as not this build\'s window (BLOCKER 1(b))', () => {
  const census = {
    combined: { 'claude-opus-5-5': { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } },
    lead: { windowStartAt: '2026-09-25T01:56:48.611Z' },
  };
  const openedMs = Date.parse('2026-09-25T01:52:55.000Z');
  const acceptedMs = Date.parse('2026-09-25T01:53:20.968Z'); // loop-gates: window starts after accept
  const r = computeTopTierTokens(census, null, {}, openedMs, acceptedMs);
  assert.equal(r.value, 'unavailable (census window 2026-09-25T01:56:48.611Z is not the build window)');
});

test('computeTopTierTokens: a census window starting well before Opened: (a whole-session census) is rejected even with no accepted time known (BLOCKER 1(b))', () => {
  const census = {
    combined: { 'claude-opus-5-5': { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } },
    lead: { windowStartAt: '2026-09-20T00:00:00.000Z' },
  };
  const openedMs = Date.parse('2026-09-25T01:52:55.000Z');
  const r = computeTopTierTokens(census, null, {}, openedMs, null);
  assert.match(r.value, /^unavailable \(census window 2026-09-20T00:00:00\.000Z is not the build window\)$/);
});

test('computeTopTierTokens: a census window inside the build window (within tolerance) is trusted', () => {
  const census = {
    combined: { 'claude-opus-5-5': { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } },
    lead: { windowStartAt: '2026-09-25T01:53:00.000Z', windowEndAt: '2026-09-25T04:00:00.000Z' },
  };
  const openedMs = Date.parse('2026-09-25T01:52:55.000Z');
  const acceptedMs = Date.parse('2026-09-25T05:00:00.000Z');
  const r = computeTopTierTokens(census, null, {}, openedMs, acceptedMs);
  assert.match(r.value, /^1 tokens: build 1/);
});

const A_WINDOW = { windowStartAt: '2026-01-01T00:00:00.000Z', windowEndAt: '2026-01-01T01:00:00.000Z' };

test('computeTopTierTokens: a census with no lead.windowStartAt at all is unavailable, not silently trusted (MAJOR 1)', () => {
  const r = computeTopTierTokens({ combined: {} }, null, {});
  assert.equal(r.value, 'unavailable (census has no window start)');
});

test('computeTopTierTokens: census present, no spec-census, Spec-session/Spec-from present in the record -> partial with the "not run" reason', () => {
  const census = { combined: { 'claude-opus-5-5': { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 2, output_tokens: 3 } }, lead: A_WINDOW };
  const r = computeTopTierTokens(census, null, { 'spec-session': 'x', 'spec-from': '2026-09-01T00:00:00Z' });
  assert.match(r.value, /^6 tokens: build 6 \(claude-opus-5-5\); partial \(no spec slice\): spec-census not run$/);
});

test('computeTopTierTokens: Spec-session/Spec-from missing from the record names that reason instead', () => {
  const census = { combined: {}, lead: A_WINDOW };
  const r = computeTopTierTokens(census, null, {});
  assert.match(r.value, /Spec-session:\/Spec-from: missing from record/);
});

// MINOR 3 (seam): a placeholder Spec-session:/Spec-from: (what the facts file tells a lead
// to write when it can't prove either) must get the "missing from record" reason, not the
// "spec-census not run" reason a real-but-unrun spec session gets.
test('computeTopTierTokens: a placeholder Spec-session:/Spec-from: (unavailable) gets the "missing from record" reason, not "not run" (MINOR 3, seam)', () => {
  const census = { combined: {}, lead: A_WINDOW };
  const r = computeTopTierTokens(census, null, { 'spec-session': 'unavailable', 'spec-from': 'unavailable' });
  assert.match(r.value, /Spec-session:\/Spec-from: missing from record$/);
});

test('computeTopTierTokens: no top-tier model matched is named, not silently zero', () => {
  const census = { combined: { 'claude-sonnet-5': { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } }, lead: A_WINDOW };
  const r = computeTopTierTokens(census, null, {});
  assert.match(r.value, /no top-tier model matched/);
});

const SPEC_FIELDS = { 'spec-session': 'spec-s', 'spec-from': '2025-12-31T23:00:00.000Z' };
const SPEC_CENSUS = { combined: { 'claude-opus-5-5': { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } }, leadPath: '/x/spec-s.jsonl', lead: { windowStartAt: '2025-12-31T23:00:00.000Z', windowEndAt: '2025-12-31T23:59:00.000Z' } };
const TEN = { combined: { 'claude-opus-5-5': { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } }, lead: A_WINDOW };
test('computeTopTierTokens: a spec-census over Spec-session:\'s Spec-from:..Opened: combines the build slice and the spec slice into one total', () => {
  const r = computeTopTierTokens(TEN, SPEC_CENSUS, SPEC_FIELDS, Date.parse('2026-01-01T00:00:00.000Z'));
  assert.match(r.value, /^15 tokens: build 10 \(claude-opus-5-5\) \+ spec slice 5$/);
});
test('computeTopTierTokens: a spec-census that is not Spec-session:\'s Spec-from:..Opened: window is never summed (r1 BLOCKER 1 twin)', () => {
  const opened = Date.parse('2026-01-01T00:00:00.000Z');
  for (const bad of [{}, { ...SPEC_CENSUS, lead: A_WINDOW }, { ...SPEC_CENSUS, lead: { windowStartAt: '2025-12-31T20:00:00.000Z', windowEndAt: '2025-12-31T23:59:00.000Z' } }, { ...SPEC_CENSUS, leadPath: '/x/other.jsonl' }]) {
    assert.equal(computeTopTierTokens(TEN, bad, SPEC_FIELDS, opened).value, "10 tokens: build 10 (claude-opus-5-5); partial (no spec slice): spec-census is not Spec-session:'s Spec-from:..Opened: window");
  }
  assert.match(computeTopTierTokens(TEN, SPEC_CENSUS, { 'spec-session': 'spec-s' }, opened).value, /partial \(no spec slice\)/); // no Spec-from: in the record
});

test('computeTopTierTokens: each mixed-host build and spec slice uses its own default top-tier policy', (t) => {
  const prior = process.env.DELEGATION_TOP_TIER;
  t.after(() => { if (prior === undefined) delete process.env.DELEGATION_TOP_TIER; else process.env.DELEGATION_TOP_TIER = prior; });
  delete process.env.DELEGATION_TOP_TIER;
  const codexBuild = {
    lead: { host: 'codex', sessionId: 'build-codex', coverageSupported: true, codex: { unavailable: [] }, ...A_WINDOW },
    subagents: { incomplete: false }, combined: { 'gpt-6-astra': { derived_total_tokens: 23 } },
  };
  const codexSpec = {
    lead: { host: 'codex', sessionId: 'spec-s', coverageSupported: true, codex: { unavailable: [] }, windowStartAt: '2025-12-31T23:00:00.000Z', windowEndAt: '2025-12-31T23:59:00.000Z' },
    subagents: { incomplete: false }, combined: { 'gpt-6-astra': { derived_total_tokens: 23 } },
  };
  const claudeSpec = { ...SPEC_CENSUS, combined: { 'claude-opus-5-5': { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 20 } } };
  const claudeBuild = { combined: { 'claude-opus-5-5': { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 20 } }, lead: A_WINDOW };
  assert.match(computeTopTierTokens(codexBuild, claudeSpec, SPEC_FIELDS, Date.parse('2026-01-01T00:00:00.000Z')).value, /^143 tokens: build 23 \(gpt-6-astra\) \+ spec slice 120$/);
  assert.match(computeTopTierTokens(claudeBuild, codexSpec, SPEC_FIELDS, Date.parse('2026-01-01T00:00:00.000Z')).value, /^143 tokens: build 120 \(claude-opus-5-5\) \+ spec slice 23$/);
  process.env.DELEGATION_TOP_TIER = 'astra';
  assert.match(computeTopTierTokens(codexBuild, claudeSpec, SPEC_FIELDS, Date.parse('2026-01-01T00:00:00.000Z')).value, /^23 tokens: build 23 \(gpt-6-astra\) \+ spec slice 0$/);
});

test('computeTopTierTokens: a Codex spec slice requires a usable matching Spec-session identity for either build host', (t) => {
  const prior = process.env.DELEGATION_TOP_TIER;
  t.after(() => { if (prior === undefined) delete process.env.DELEGATION_TOP_TIER; else process.env.DELEGATION_TOP_TIER = prior; });
  delete process.env.DELEGATION_TOP_TIER;
  const opened = Date.parse('2026-01-01T00:00:00.000Z');
  const codexBuild = {
    lead: { host: 'codex', sessionId: 'build-codex', coverageSupported: true, codex: { unavailable: [] }, ...A_WINDOW },
    subagents: { incomplete: false }, combined: { 'gpt-6-astra': { derived_total_tokens: 23 } },
  };
  const claudeBuild = { combined: { 'claude-opus-5-5': { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 20 } }, lead: A_WINDOW };
  const validSpec = {
    lead: { host: 'codex', sessionId: 'spec-valid', coverageSupported: true, codex: { unavailable: [] }, windowStartAt: '2025-12-31T23:00:00.000Z', windowEndAt: '2025-12-31T23:59:00.000Z' },
    subagents: { incomplete: false }, combined: { 'gpt-6-astra': { derived_total_tokens: 23 } },
  };
  for (const [nativeId, requestedId, reason] of [
    ['unknown', 'unknown', 'no valid Spec-session:'], ['unavailable', 'unavailable', 'no valid Spec-session:'], ['', '', 'no valid Spec-session:'], ['   ', '   ', 'no valid Spec-session:'],
    [undefined, 'spec-valid', 'Codex census has no valid lead.sessionId'], ['spec-valid', undefined, 'no valid Spec-session:'],
    ['spec-native', 'spec-requested', 'Codex census session spec-native is not Spec-session spec-requested'],
  ]) {
    const spec = { ...validSpec, lead: { ...validSpec.lead } };
    if (nativeId === undefined) delete spec.lead.sessionId;
    else spec.lead.sessionId = nativeId;
    const fields = { 'spec-from': SPEC_FIELDS['spec-from'] };
    if (requestedId !== undefined) fields['spec-session'] = requestedId;
    assert.match(computeTopTierTokens(codexBuild, spec, fields, opened).value, new RegExp(`^23 tokens: build 23 \\(gpt-6-astra\\); partial \\(no spec slice\\): ${reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    assert.match(computeTopTierTokens(claudeBuild, spec, fields, opened).value, new RegExp(`^120 tokens: build 120 \\(claude-opus-5-5\\); partial \\(no spec slice\\): ${reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  }
});

test('computeTopTierTokens: DELEGATION_TOP_TIER overrides the configured default tier list', (t) => {
  t.after(() => delete process.env.DELEGATION_TOP_TIER);
  process.env.DELEGATION_TOP_TIER = 'sonnet';
  const census = { combined: { 'claude-sonnet-5': { input_tokens: 7, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } }, lead: A_WINDOW };
  const r = computeTopTierTokens(census, null, {});
  assert.match(r.value, /^7 tokens: build 7/);
});

test('computeTopTierTokens: a complete Codex census counts Astra under the configured default top tier', (t) => {
  const prior = process.env.DELEGATION_TOP_TIER;
  t.after(() => { if (prior === undefined) delete process.env.DELEGATION_TOP_TIER; else process.env.DELEGATION_TOP_TIER = prior; });
  delete process.env.DELEGATION_TOP_TIER;
  const census = {
    lead: { host: 'codex', coverageSupported: true, codex: { unavailable: [] }, ...A_WINDOW },
    subagents: { incomplete: false },
    combined: { 'gpt-6-astra': { derived_total_tokens: 23, input_tokens: 7, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 11 } },
  };
  assert.match(computeTopTierTokens(census, null, {}).value, /^23 tokens: build 23 \(gpt-6-astra\)/);
});

test('computeTopTierTokens: an incomplete Codex census is unavailable with C1 evidence, never a confident zero', () => {
  const census = {
    lead: { host: 'codex', coverageSupported: false, codex: { unavailable: ['unknown model attribution in rollout.jsonl'] }, ...A_WINDOW },
    subagents: { incomplete: true }, combined: { 'gpt-6-astra': { derived_total_tokens: 2, input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 } },
  };
  assert.equal(computeTopTierTokens(census, null, {}).value, 'unavailable (Codex census coverage is unavailable: unknown model attribution in rollout.jsonl)');
});

test('computeTopTierTokens: a Codex model total uses derived_total_tokens when an optional breakdown field is unavailable', () => {
  const census = {
    lead: { host: 'codex', coverageSupported: true, codex: { unavailable: [] }, ...A_WINDOW },
    subagents: { incomplete: false }, combined: { 'gpt-6-astra': { derived_total_tokens: 2, input_tokens: 1, cache_creation_input_tokens: 0, output_tokens: 1 } },
  };
  assert.match(computeTopTierTokens(census, null, {}).value, /^2 tokens: build 2 \(gpt-6-astra\)/);
});

test('computeTopTierTokens: unknown or blank Codex aggregate model attribution is unavailable, never a verified zero', () => {
  for (const model of ['unknown', '', '   ']) {
    const census = {
      lead: { host: 'codex', coverageSupported: true, codex: { unavailable: [] }, ...A_WINDOW },
      subagents: { incomplete: false }, combined: { [model]: { derived_total_tokens: 23 } },
    };
    assert.equal(computeTopTierTokens(census, null, {}).value, 'unavailable (Codex combined model total has unavailable model attribution)');
  }
});

test('computeTopTierTokens: a census window ending after the last acceptance (plus tolerance) is rejected — it would mix in the next build (MAJOR 1)', () => {
  const census = { combined: { 'claude-opus-5-5': { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } }, lead: { windowStartAt: '2026-01-01T00:00:00.000Z', windowEndAt: '2026-01-01T05:00:00.000Z' } };
  const r = computeTopTierTokens(census, null, {}, null, null, Date.parse('2026-01-01T01:00:00.000Z'));
  assert.equal(r.value, 'unavailable (census window ends 2026-01-01T05:00:00.000Z, after the last acceptance)');
});

test('computeTopTierTokens: a census with no lead.windowEndAt at all is unavailable, not a silent "0 messages" companion (MAJOR 3, r3)', () => {
  const r = computeTopTierTokens({ combined: {}, lead: { windowStartAt: '2026-01-01T00:00:00.000Z' } }, null, {});
  assert.equal(r.value, 'unavailable (census has no window end)');
});

// ── scanTimestamps ───────────────────────────────────────────────────────────

test('scanTimestamps: returns null for a missing file, never throws', () => {
  assert.equal(scanTimestamps(fs, path.join(FIXTURES, 'nope.jsonl')), null);
});

test('scanTimestamps: the fixture lead session yields 4 sorted timestamps', () => {
  const ts = scanTimestamps(fs, LEAD);
  assert.equal(ts.length, 4);
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
});

test('scanTimestamps: malformed JSON lines and lines with no timestamp are skipped, not thrown', () => {
  const dir = mkTmp('four-read-scants-');
  const p = path.join(dir, 'x.jsonl');
  fs.writeFileSync(p, 'not json {{{\n{"type":"user"}\n{"type":"assistant","timestamp":"2026-01-01T00:00:00.000Z"}\n');
  assert.deepEqual(scanTimestamps(fs, p), [Date.parse('2026-01-01T00:00:00.000Z')]);
});

// ── computeHoursAskToAccepted (number 2) ────────────────────────────────────

test('computeHoursAskToAccepted: no Opened: -> unavailable', () => {
  assert.equal(computeHoursAskToAccepted({}, [], null).value, 'unavailable (no Opened:)');
});

test('computeHoursAskToAccepted: no accepted Log: entry -> unavailable', () => {
  const r = computeHoursAskToAccepted({ opened: '2026-01-01T00:00:00.000Z' }, [], null);
  assert.equal(r.value, 'unavailable (no accepted Log: entry)');
});

test('computeHoursAskToAccepted: unparseable accepted timestamp -> unavailable', () => {
  const r = computeHoursAskToAccepted({ opened: '2026-01-01T00:00:00.000Z' }, [{ status: 'accepted', at: 'not-a-date', note: '' }], null);
  assert.equal(r.value, 'unavailable (unparseable accepted Log: timestamp)');
});

test('computeHoursAskToAccepted: null leadTimestamps -> the hours print with an explicit "no lead transcript" gap reason', () => {
  const fields = { opened: '2026-01-01T00:00:00.000Z' };
  const logs = [{ status: 'owned', at: '2026-01-01T00:10:00.000Z', note: '' }, { status: 'accepted', at: '2026-01-01T02:00:00.000Z', note: '' }];
  const r = computeHoursAskToAccepted(fields, logs, null);
  assert.equal(r.value, '2.0h; gap unavailable (no lead transcript)');
});

test('computeHoursAskToAccepted: leadGapReason is printed instead of the generic "no lead transcript" reason (MAJOR 1)', () => {
  const fields = { opened: '2026-01-01T00:00:00.000Z' };
  const logs = [{ status: 'owned', at: '2026-01-01T00:10:00.000Z', note: '' }, { status: 'accepted', at: '2026-01-01T02:00:00.000Z', note: '' }];
  const r = computeHoursAskToAccepted(fields, logs, null, 'no Lead-session:');
  assert.equal(r.value, '2.0h; gap unavailable (no Lead-session:)');
});

test('computeHoursAskToAccepted: fewer than 2 messages in the window -> gap unavailable, hours still print', () => {
  const fields = { opened: '2026-01-01T00:00:00.000Z' };
  const logs = [{ status: 'owned', at: '2026-01-01T00:10:00.000Z', note: '' }, { status: 'accepted', at: '2026-01-01T02:00:00.000Z', note: '' }];
  const r = computeHoursAskToAccepted(fields, logs, [Date.parse('2026-01-01T01:00:00.000Z')]);
  assert.equal(r.value, '2.0h; gap unavailable (fewer than 2 lead messages in window)');
});

test('computeHoursAskToAccepted: the first Log: entry being the first accepted -> unavailable, not a confident 0.0h (MAJOR 4)', () => {
  const fields = { opened: '2026-01-01T00:00:00.000Z' };
  const logs = [{ status: 'accepted', at: '2026-01-01T00:00:25.000Z', note: '' }];
  const r = computeHoursAskToAccepted(fields, logs, null);
  assert.equal(r.value, 'unavailable (record opened at acceptance: no Log: entry before the first accepted)');
  assert.equal(r.acceptedMs, null);
});

test('computeHoursAskToAccepted: on the fixture record + lead session, prints 24.0h and the 45min gap', () => {
  const { fields, logs } = parseRecordText(fs.readFileSync(RECORD, 'utf8'));
  const ts = scanTimestamps(fs, LEAD);
  const r = computeHoursAskToAccepted(fields, logs, ts);
  assert.equal(r.value, '24.0h; largest gap 45.0min at 2026-09-01T00:15:00.000Z');
});

// ── computeReworkAfterAcceptance (number 3) ─────────────────────────────────

test('computeReworkAfterAcceptance: no Base:/accepted sha/--git -> unavailable (no range), with the known re-accept count carried alongside (MINOR 1)', () => {
  assert.equal(computeReworkAfterAcceptance({}, [], null).value, 'unavailable (no range); 0 re-accept Log: entries after the first');
  assert.equal(computeReworkAfterAcceptance({ base: 'x' }, [], 'C:/some/dir').value, 'unavailable (no range); 0 re-accept Log: entries after the first');
});

test('computeReworkAfterAcceptance: counts only commits touching build files within 7 days, excludes release commits and commits outside the pathspec, and reports re-accept Log: entries', () => {
  const dir = mkTmp('four-read-git-');
  const env = initRepo(dir);
  const now = Date.now();
  const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
  const baseSha = commit(dir, 'a.txt', 'base', 'chore: base', iso(-3600000), env);
  const acceptedSha = commit(dir, 'a.txt', 'accepted version', 'feat: build files', iso(-1800000), env);
  commit(dir, 'a.txt', 'post-fix', 'fix: rework on build file', iso(60000), env); // counts
  commit(dir, 'b.txt', 'unrelated', 'fix: unrelated file', iso(120000), env); // does not touch a.txt
  commit(dir, 'a.txt', 'release bump', 'release: 0.20.9', iso(180000), env); // excluded by subject

  const fields = { base: baseSha };
  const logs = [
    { status: 'accepted', at: new Date(now - 1800000).toISOString(), owner: 'x', note: `artifact ${acceptedSha}` },
    { status: 'accepted', at: new Date(now - 1000000).toISOString(), owner: 'x', note: 're-accept fix round' },
  ];
  const r = computeReworkAfterAcceptance(fields, logs, dir, 'HEAD');
  assert.match(r.value, /1 commit\(s\) touching build files within 7 days/);
  assert.match(r.value, /"fix: rework on build file"/);
  assert.doesNotMatch(r.value, /unrelated file/);
  assert.doesNotMatch(r.value, /release: 0\.20\.9/);
  assert.match(r.value, /1 re-accept Log: entry after the first/);
});

test('computeReworkAfterAcceptance: excludes this repo\'s real release subject forms, not just "release: ..." (MAJOR 2)', () => {
  const dir = mkTmp('four-read-git-release-forms-');
  const env = initRepo(dir);
  const now = Date.now();
  const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
  const baseSha = commit(dir, 'a.txt', 'base', 'chore: base', iso(-3600000), env);
  const acceptedSha = commit(dir, 'a.txt', 'accepted version', 'feat: build files', iso(-1800000), env);
  commit(dir, 'a.txt', 'release bump 1', 'chore: release 0.20.9', iso(60000), env); // excluded
  commit(dir, 'a.txt', 'release bump 2', 'chore(release): 0.20.7', iso(120000), env); // excluded
  const fields = { base: baseSha };
  const logs = [{ status: 'accepted', at: new Date(now - 1800000).toISOString(), owner: 'x', note: `artifact ${acceptedSha}` }];
  const r = computeReworkAfterAcceptance(fields, logs, dir, 'HEAD');
  assert.match(r.value, /^0 commits touching build files within 7 days/);
  assert.doesNotMatch(r.value, /0\.20\.9/);
  assert.doesNotMatch(r.value, /0\.20\.7/);
});

test('computeReworkAfterAcceptance: the Artifact: fallback is only used with a single accepted entry — a re-accept without an artifact note gives unavailable, never the wrong (last) sha (MINOR 9)', () => {
  const dir = mkTmp('four-read-git-fallback-');
  const env = initRepo(dir);
  const iso = new Date().toISOString();
  const sha = commit(dir, 'a.txt', 'x', 'chore: only commit', iso, env);
  const fields = { base: sha, artifact: `build/x@${sha}` };
  const logs = [
    { status: 'accepted', at: iso, owner: 'x', note: 'no artifact mentioned here' },
    { status: 'accepted', at: iso, owner: 'x', note: 'a re-accept, also no artifact mentioned' },
  ];
  const r = computeReworkAfterAcceptance(fields, logs, dir, 'HEAD');
  assert.match(r.value, /^unavailable \(no range\)/, 'must not fall back to Artifact: once a re-accept could have overwritten it');
});

test('computeReworkAfterAcceptance: base == accepted (no changed files) -> unavailable (no range)', () => {
  const dir = mkTmp('four-read-git-norange-');
  const env = initRepo(dir);
  const iso = new Date().toISOString();
  const sha = commit(dir, 'a.txt', 'x', 'chore: only commit', iso, env);
  const fields = { base: sha };
  const logs = [{ status: 'accepted', at: iso, owner: 'x', note: `artifact ${sha}` }];
  assert.equal(computeReworkAfterAcceptance(fields, logs, dir, 'HEAD').value, 'unavailable (no range); 0 re-accept Log: entries after the first');
});

test('computeReworkAfterAcceptance: an unresolvable git ref fails closed as unavailable, not a thrown error', () => {
  const dir = mkTmp('four-read-git-bad-');
  const env = initRepo(dir);
  const iso = new Date().toISOString();
  commit(dir, 'a.txt', 'x', 'chore: only commit', iso, env);
  const fields = { base: 'not-a-real-ref' };
  const logs = [{ status: 'accepted', at: iso, owner: 'x', note: 'artifact 0123456' }];
  const r = computeReworkAfterAcceptance(fields, logs, dir, 'HEAD');
  assert.match(r.value, /^unavailable \(git: /);
});

// Lane 60b (artifact-repo-60b spec.md item 4): "wherever they turn Artifact: into a sha that
// they then look up in git, they use Artifact-repo: when it is present" - main()'s own call
// site, not computeReworkAfterAcceptance itself (that function's gitDir parameter is unchanged;
// this proves main() feeds it the RIGHT directory). --git here points at a real but unrelated
// repository that has never heard of Base:/the accepted sha at all - only Artifact-repo: does.
test('main: Artifact-repo: redirects number 3 (rework after acceptance) to that repository, never falling back to a --git that cannot resolve the range', async () => {
  const dir = mkTmp('four-read-artifact-repo-main-');
  const unrelatedGitDir = mkTmp('four-read-artifact-repo-main-unrelated-');
  initRepo(unrelatedGitDir); // --git: a real repo, but with no relationship to Base:/the accepted sha
  const artifactRepoDir = mkTmp('four-read-artifact-repo-main-b-');
  const env = initRepo(artifactRepoDir);
  const now = Date.now();
  const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
  const baseSha = commit(artifactRepoDir, 'a.txt', 'base', 'chore: base', iso(-3600000), env);
  const acceptedSha = commit(artifactRepoDir, 'a.txt', 'accepted version', 'feat: build files', iso(-1800000), env);
  commit(artifactRepoDir, 'a.txt', 'post-fix', 'fix: rework on build file', iso(60000), env);

  const acceptedAt = new Date(now - 1800000).toISOString();
  const recordPath = path.join(dir, 'record.md');
  fs.writeFileSync(recordPath, [
    'Work: wr-2026-09-30-artifact-repo-fourread',
    'Opened: 2026-09-01T00:00:00.000Z',
    `Base: ${baseSha}`,
    `Artifact: territory/a@${acceptedSha}`,
    `Artifact-repo: ${artifactRepoDir}`,
    'Lead-session: lead-session',
    `Log: ${acceptedAt} accepted x artifact ${acceptedSha}`,
    '',
    'Observed: body',
  ].join('\n'));

  const censusPath = await buildCensusFile(dir);
  const lines = [];
  await main(['--record', recordPath, '--census', censusPath, '--git', unrelatedGitDir, '--branch', 'HEAD'], { write: (s) => lines.push(s) });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Rework after acceptance.*1 commit\(s\) touching build files within 7 days/s);
  assert.match(lines[0], /"fix: rework on build file"/);
});

// Lane 60b review round 1, F5 (LOW): a relative Artifact-repo: must never be trusted to mean
// "whatever directory the process happens to be running in" - it renders as unavailable (no
// range), exactly like no Artifact-repo: and no --git at all, never a confident guess.
test('main: a relative Artifact-repo: never resolves against process.cwd() - number 3 renders unavailable (no range)', async () => {
  const dir = mkTmp('four-read-artifact-repo-relative-');
  const unrelatedGitDir = mkTmp('four-read-artifact-repo-relative-unrelated-');
  const env = initRepo(unrelatedGitDir);
  const now = Date.now();
  const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
  const acceptedSha = commit(unrelatedGitDir, 'a.txt', 'accepted version', 'feat: build files', iso(-1800000), env);

  const acceptedAt = new Date(now - 1800000).toISOString();
  const recordPath = path.join(dir, 'record.md');
  fs.writeFileSync(recordPath, [
    'Work: wr-2026-09-30-artifact-repo-relative',
    'Opened: 2026-09-01T00:00:00.000Z',
    `Base: ${acceptedSha}`,
    `Artifact: territory/a@${acceptedSha}`,
    'Artifact-repo: relative/path/to/repo-b',
    'Lead-session: lead-session',
    `Log: ${acceptedAt} accepted x artifact ${acceptedSha}`,
    '',
    'Observed: body',
  ].join('\n'));

  const censusPath = await buildCensusFile(dir);
  const lines = [];
  await main(['--record', recordPath, '--census', censusPath, '--git', unrelatedGitDir, '--branch', 'HEAD'], { write: (s) => lines.push(s) });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /unavailable \(no range\)/);
});

// ── Ledger: collectLedgerEntries / computeWorkLostOrStalled ────────────────

test('collectLedgerEntries: returns null for a missing directory', () => {
  assert.equal(collectLedgerEntries(path.join(FIXTURES, 'nope-dir'), fs), null);
});

test('collectLedgerEntries: parses the fixture ledger day into ASK/ACK/RESULT entries with kind, to, id, re and ms', () => {
  const entries = collectLedgerEntries(LEDGER, fs);
  assert.equal(entries.length, 5);
  const ask1 = entries.find((e) => e.id === 'fixture-ask-1');
  assert.equal(ask1.kind, 'ASK');
  assert.equal(ask1.to, 'test-lead');
  assert.equal(ask1.re, null);
  assert.ok(Number.isFinite(ask1.ms));
  const result1 = entries.find((e) => e.id === 'fixture-result-1');
  assert.equal(result1.re, 'fixture-ask-1');
});

test('collectLedgerEntries: NYC timestamps resolve to the correct EST/EDT offset across the year, non-NYC tz gives ms null (MINOR 5)', () => {
  const dir = mkTmp('four-read-ledger-tz-');
  fs.writeFileSync(path.join(dir, '2026-01-01.md'), [
    'test-lead → test-owner, 1.15.26 09:00 NYC [tz-winter] FYI: winter check',
    'test-lead → test-owner, 6.15.26 09:00 NYC [tz-summer] FYI: summer check',
    'test-lead → test-owner, 6.15.26 09:00 UTC [tz-other] FYI: non-NYC tz',
  ].join('\n'));
  const entries = collectLedgerEntries(dir, fs);
  const winter = entries.find((e) => e.id === 'tz-winter');
  const summer = entries.find((e) => e.id === 'tz-summer');
  const other = entries.find((e) => e.id === 'tz-other');
  assert.equal(winter.ms, Date.parse('2026-01-15T14:00:00.000Z')); // EST = UTC-5
  assert.equal(summer.ms, Date.parse('2026-06-15T13:00:00.000Z')); // EDT = UTC-4
  assert.equal(other.ms, null);
});

test('computeWorkLostOrStalled: no Opened:/accepted window -> unavailable', () => {
  assert.equal(computeWorkLostOrStalled(null, null, null, { openedMs: null, acceptedMs: null }).value, 'unavailable (no Opened:)');
  assert.equal(computeWorkLostOrStalled(null, null, null, { openedMs: 1, acceptedMs: null }).value, 'unavailable (no accepted Log: entry)');
});

test('computeWorkLostOrStalled: no --lead-slug -> ASKs part is explicitly unavailable, gaps part still computes', () => {
  const r = computeWorkLostOrStalled([1000, 2000], null, null, { openedMs: 0, acceptedMs: 3000 });
  assert.match(r.value, /^0 gap\(s\) over 30min stalled; 0 waiting-on-agents \(0\.0 min\); ASKs unavailable \(no --lead-slug\)$/);
});

test('computeWorkLostOrStalled: a slug that never appears in the ledger reads unavailable, not a confident 0 (MAJOR 3)', () => {
  const ledgerEntries = collectLedgerEntries(LEDGER, fs);
  const r = computeWorkLostOrStalled([1000, 2000], ledgerEntries, 'nobody', { openedMs: 0, acceptedMs: 3000 });
  assert.match(r.value, /ASKs unavailable \(slug nobody not in ledger\)$/);
});

test('computeWorkLostOrStalled: fewer than 2 in-window lead messages -> gaps unavailable, never a confident "0 gaps" (R1 r1 BLOCKER 2, pinned against reversion in r2)', () => {
  const r = computeWorkLostOrStalled([1000], null, null, { openedMs: 0, acceptedMs: 3000 });
  assert.match(r.value, /^gaps unavailable \(fewer than 2 lead messages in window\);/);
});

test('computeWorkLostOrStalled: on the fixture record + lead session + ledger, one gap over 30min and one unanswered ASK', () => {
  const { fields, logs } = parseRecordText(fs.readFileSync(RECORD, 'utf8'));
  const ts = scanTimestamps(fs, LEAD);
  const window = computeHoursAskToAccepted(fields, logs, ts);
  const ledgerEntries = collectLedgerEntries(LEDGER, fs);
  const r = computeWorkLostOrStalled(ts, ledgerEntries, 'test-lead', { openedMs: window.openedMs, acceptedMs: window.acceptedMs });
  assert.match(r.value, /^1 gap\(s\) over 30min stalled: 2026-09-01T00:15:00\.000Z \(45\.0min\); 0 waiting-on-agents \(0\.0 min\); 1 unanswered ASK\(s\) to test-lead: fixture-ask-2$/);
});

// ── R6: Agent/Task/Workflow spans, union/merge, and gap splitting ──────────

test('mergeSpans: merges overlapping/adjacent intervals, leaves disjoint ones apart', () => {
  assert.deepEqual(mergeSpans([[0, 10], [5, 15], [20, 30]]), [[0, 15], [20, 30]]);
  assert.deepEqual(mergeSpans([]), []);
  assert.deepEqual(mergeSpans([[10, 20], [0, 5]]), [[0, 5], [10, 20]]);
});

test('splitGapByUnion: a gap entirely outside the union is one stalled piece', () => {
  const { insidePieces, outsidePieces } = splitGapByUnion(0, 60 * 60000, []);
  assert.deepEqual(insidePieces, []);
  assert.equal(outsidePieces.length, 1);
  assert.equal(outsidePieces[0].minutes, 60);
});

test('splitGapByUnion: a gap entirely inside one span is all waiting-on-agents, no stalled piece', () => {
  const gStart = 10 * 60000, gEnd = 50 * 60000;
  const { insidePieces, outsidePieces } = splitGapByUnion(gStart, gEnd, [[0, 60 * 60000]]);
  assert.equal(outsidePieces.length, 0);
  assert.equal(insidePieces.length, 1);
  assert.equal(insidePieces[0].minutes, 40);
});

// Acceptance attack: "nested spans (a Workflow whose agents are the lead's own subagents
// too, counted twice)" — the union must merge them into one interval, not double the gap.
test('splitGapByUnion: nested/overlapping spans in the union never double-count a gap piece', () => {
  const union = mergeSpans([[0, 100 * 60000], [10 * 60000, 20 * 60000]]); // Agent nested inside Workflow
  const { insidePieces, outsidePieces } = splitGapByUnion(5 * 60000, 95 * 60000, union);
  assert.equal(outsidePieces.length, 0);
  assert.equal(insidePieces.length, 1);
  assert.equal(insidePieces[0].minutes, 90);
});

// Acceptance attack: "a gap that spans two adjacent Agent calls with a 2-minute lead turn
// between them" — a real lead message between the two spans ends the raw gap early (this is
// `gaps()`'s own consecutive-pairs behavior, not span logic), so each half is judged alone.
test('computeWorkLostOrStalled: a 2-minute lead turn between two adjacent Agent calls splits one big window into two separately-judged gaps', () => {
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  const min = 60000;
  // t0 .. t0+40min (gap1, 40min) .. turn .. t0+42min .. t0+82min (gap2, 40min)
  const leadTimestamps = [t0, t0 + 40 * min, t0 + 42 * min, t0 + 82 * min];
  const r = computeWorkLostOrStalled(leadTimestamps, null, null, { openedMs: t0, acceptedMs: t0 + 82 * min }, null, []);
  assert.match(r.value, /^2 gap\(s\) over 30min stalled: .*40\.0min.*40\.0min.*; 0 waiting-on-agents \(0\.0 min\)/);
});

// buildAgentSpans reads `<dirname of leadPath>/<sessionId>/subagents/` for agent files; these
// tests point it at a session directory that does not exist, so it always falls to the
// literal/fallback rule (no agent file can ever be found there) — exercising exactly the
// fallback paths these tests are about, independent of MAJOR-1's file-based bound.
const NO_SUBAGENTS_LEAD = path.join(HERE, 'fixtures', 'four-read', 'no-such-session.jsonl');

test('buildAgentSpans: Agent/Task use their own tool_result; a missing result falls back to the window end', () => {
  const toolUses = [{ ms: 0, name: 'Agent', id: 'a' }, { ms: 100, name: 'Task', id: 'b' }, { ms: 200, name: 'Bash', id: 'c' }];
  const toolResults = [{ ms: 50, item: { type: 'tool_result', tool_use_id: 'a' } }];
  const spans = buildAgentSpans(fs, NO_SUBAGENTS_LEAD, 'no-such-session', toolUses, toolResults, 1000);
  assert.deepEqual(spans, [[0, 50], [100, 1000]]); // Bash is not a span source
});

test('buildAgentSpans: a Workflow tool_use ignores its own quick tool_result — its span runs to the first later TaskStop, else the window end (R6 deviation, see code comment)', () => {
  const toolUses = [
    { ms: 0, name: 'Workflow', id: 'w' },
    { ms: 5000, name: 'TaskStop', id: 'ts' }, // AFTER the Workflow call
  ];
  const toolResults = [{ ms: 2, item: { type: 'tool_result', tool_use_id: 'w' } }]; // near-instant ack
  assert.deepEqual(buildAgentSpans(fs, NO_SUBAGENTS_LEAD, 'no-such-session', toolUses, toolResults, 9999), [[0, 5000]]);
  // no later TaskStop -> falls all the way to the window end, not the quick ack
  assert.deepEqual(buildAgentSpans(fs, NO_SUBAGENTS_LEAD, 'no-such-session', [{ ms: 0, name: 'Workflow', id: 'w' }], toolResults, 9999), [[0, 9999]]);
});

// F2-review-round1 MAJOR-1: a Workflow span must be bounded by the agents it actually
// spawned, not by the window end — otherwise any lead stall after a Workflow silently reads
// as waiting-on-agents no matter how long it runs.
test('buildAgentSpans/computeWorkLostOrStalled: a Workflow span is bounded by its spawned agents\' last activity, so a long lead silence AFTER they finish still reads as stalled (MAJOR-1)', () => {
  const dir = mkTmp('four-read-major1-');
  const sessionId = 'sess';
  const leadPath = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(leadPath, '');
  const runDir = path.join(dir, sessionId, 'subagents', 'workflows', 'wf1');
  fs.mkdirSync(runDir, { recursive: true });
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  const min = 60000;
  writeJsonl(runDir, 'agent-w1.jsonl', [
    { timestamp: new Date(t0 + 1000).toISOString(), type: 'user' },
    { timestamp: new Date(t0 + 10 * min).toISOString(), type: 'user' }, // agents finish by +10min
  ]);
  const toolUses = [{ ms: t0, name: 'Workflow', id: 'w' }]; // Workflow at +0s, no TaskStop ever
  const toolResults = [{ ms: t0 + 1000, item: { type: 'tool_result', tool_use_id: 'w' }, agentId: null, runId: null }]; // ack at +1s
  const windowEndMs = t0 + 200 * min;
  const spans = mergeSpans(buildAgentSpans(fs, leadPath, sessionId, toolUses, toolResults, windowEndMs));
  assert.deepEqual(spans, [[t0, t0 + 10 * min]]); // bounded by the agents' last activity, not windowEndMs

  // The lead is then silent from +11min to +191min (180min), well after the agents finished.
  const leadTimestamps = [t0 + 11 * min, t0 + 191 * min];
  const r = computeWorkLostOrStalled(leadTimestamps, null, null, { openedMs: t0, acceptedMs: windowEndMs }, null, spans, null);
  assert.match(r.value, /^1 gap\(s\) over 30min stalled: .*\(180\.0min\); 0 waiting-on-agents \(0\.0 min\)/);
});

// F2-review-round2 MAJOR-A (regression from round1's fix): an agent left waiting on a
// pending tool_use is still ALIVE until its own R7 end bound — a permission-prompt hang must
// count once (as the agent's own R7 tail stall), never a second time as a lead R6 stall
// because its span stopped at the file's last (pre-hang) timestamp.
for (const variant of ['Workflow', 'direct Agent']) {
  test(`buildAgentSpans/computeWorkLostOrStalled: an agent hung on a pending tool_use is still active until its R7 end bound, so the hang counts once, not twice (MAJOR-A, ${variant})`, () => {
    const dir = mkTmp('four-read-majora-');
    const sessionId = 'sess';
    const leadPath = path.join(dir, `${sessionId}.jsonl`);
    fs.writeFileSync(leadPath, '');
    const t0 = Date.parse('2026-01-01T00:00:00.000Z');
    const min = 60000;
    const windowEndMs = t0 + 200 * min;
    let toolUses, toolResults, agentFileDir, agentFileName;
    if (variant === 'Workflow') {
      agentFileDir = path.join(dir, sessionId, 'subagents', 'workflows', 'wf1');
      agentFileName = 'agent-hung.jsonl';
      toolUses = [{ ms: t0 + 1000, name: 'Workflow', id: 'w' }]; // launch at +1s, no TaskStop ever
      toolResults = [{ ms: t0 + 1500, item: { type: 'tool_result', tool_use_id: 'w' }, agentId: null, runId: null }]; // ack at +1.5s
    } else {
      agentFileDir = path.join(dir, sessionId, 'subagents');
      agentFileName = 'agent-hung.jsonl';
      toolUses = [{ ms: t0 + 1000, name: 'Agent', id: 'a' }];
      toolResults = [{ ms: t0 + 1500, item: { type: 'tool_result', tool_use_id: 'a' }, agentId: 'hung', runId: null }];
    }
    fs.mkdirSync(agentFileDir, { recursive: true });
    // Hung at +5min on a tool with no later result: still "alive" past this point (R7 tail).
    writeJsonl(agentFileDir, agentFileName, [
      { timestamp: new Date(t0 + 5 * min).toISOString(), type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 't1' }] } },
    ]);
    const spans = mergeSpans(buildAgentSpans(fs, leadPath, sessionId, toolUses, toolResults, windowEndMs));
    // The span is bounded by the agent's own R7 end bound (the window end here, since no
    // TaskStop/later Workflow result and no later direct result exists), not by the file's
    // last (pre-hang) timestamp — the motivating permission-prompt case.
    assert.deepEqual(spans, [[t0 + 1000, windowEndMs]]);

    const leadTimestamps = [t0, windowEndMs]; // the lead is silent from the launch to the window end
    const agentStallResults = { stalls: [{ id: 'hung', atMs: t0 + 5 * min, minutes: 195 }], unreadableIds: [] };
    const r = computeWorkLostOrStalled(leadTimestamps, null, null, { openedMs: t0, acceptedMs: windowEndMs }, null, spans, agentStallResults);
    // N is 1 (from the agent's own R7 stall), never 2 — the lead's silence is entirely inside
    // the union (waiting-on-agents), so it contributes 0 to N despite being 200min long.
    assert.match(r.value, /^1 gap\(s\) over 30min stalled; 1 waiting-on-agents \(200\.0 min\); agent hung silent 195\.0 min from 2026-01-01T00:05:00\.000Z; ASKs unavailable \(no --lead-slug\)$/);
  });
}

// F2-review-round2 MAJOR-B: a Workflow relaunch that reuses a runId must bound each launch by
// only the agent files it itself started, not by every agent file ever written to that run's
// directory — otherwise a lead stall before the relaunch reads as waiting-on-agents.
test('buildAgentSpans: a Workflow relaunch reusing the same runId bounds each launch by the agent files it started, not the whole run directory (MAJOR-B)', () => {
  const dir = mkTmp('four-read-majorb-');
  const sessionId = 'sess';
  const leadPath = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(leadPath, '');
  const runDir = path.join(dir, sessionId, 'subagents', 'workflows', 'wf_r');
  fs.mkdirSync(runDir, { recursive: true });
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  const min = 60000;
  writeJsonl(runDir, 'agent-first.jsonl', [
    { timestamp: new Date(t0 + 0.5 * min).toISOString(), type: 'user' },
    { timestamp: new Date(t0 + 10 * min).toISOString(), type: 'user' }, // first launch's agents end at +10min
  ]);
  writeJsonl(runDir, 'agent-second.jsonl', [
    { timestamp: new Date(t0 + 100.5 * min).toISOString(), type: 'user' },
    { timestamp: new Date(t0 + 150 * min).toISOString(), type: 'user' }, // relaunch's agents end at +150min
  ]);
  const toolUses = [
    { ms: t0, name: 'Workflow', id: 'w1' }, // first launch at +0
    { ms: t0 + 100 * min, name: 'Workflow', id: 'w2' }, // relaunch at +100min, SAME runId
  ];
  const toolResults = [
    { ms: t0 + 1000, item: { type: 'tool_result', tool_use_id: 'w1' }, agentId: null, runId: 'wf_r' },
    { ms: t0 + 100 * min + 1000, item: { type: 'tool_result', tool_use_id: 'w2' }, agentId: null, runId: 'wf_r' },
  ];
  const windowEndMs = t0 + 160 * min;
  const spans = mergeSpans(buildAgentSpans(fs, leadPath, sessionId, toolUses, toolResults, windowEndMs));
  assert.deepEqual(spans, [[t0, t0 + 10 * min], [t0 + 100 * min, t0 + 150 * min]]);

  // The lead is silent from +11min to +100min (89min), entirely between the two launches'
  // spans — a stall the relaunch must not paper over as waiting-on-agents.
  const leadTimestamps = [t0 + 11 * min, t0 + 100 * min];
  const r = computeWorkLostOrStalled(leadTimestamps, null, null, { openedMs: t0, acceptedMs: windowEndMs }, null, spans, null);
  assert.match(r.value, /^1 gap\(s\) over 30min stalled: .*\(89\.0min\); 0 waiting-on-agents \(0\.0 min\)/);
});

// F2-review-round2 MINOR-C: the no-runId heuristic match must not depend on readdir order and
// take only the first candidate run — it must take the MAX of every candidate's last activity.
test('buildAgentSpans: the no-runId heuristic run match takes the max of every candidate run\'s last activity, not just the first found (MINOR-C)', () => {
  const dir = mkTmp('four-read-minorc-');
  const sessionId = 'sess';
  const leadPath = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(leadPath, '');
  const workflowsDir = path.join(dir, sessionId, 'subagents', 'workflows');
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  const min = 60000;
  const runA = path.join(workflowsDir, 'wf_a');
  const runZ = path.join(workflowsDir, 'wf_z');
  fs.mkdirSync(runA, { recursive: true });
  fs.mkdirSync(runZ, { recursive: true });
  writeJsonl(runA, 'agent-a.jsonl', [
    { timestamp: new Date(t0 + 1 * min).toISOString(), type: 'user' },
    { timestamp: new Date(t0 + 5 * min).toISOString(), type: 'user' },
  ]);
  writeJsonl(runZ, 'agent-z.jsonl', [
    { timestamp: new Date(t0 + 2 * min).toISOString(), type: 'user' },
    { timestamp: new Date(t0 + 150 * min).toISOString(), type: 'user' },
  ]);
  const toolUses = [{ ms: t0, name: 'Workflow', id: 'w' }]; // no runId on the ack -> heuristic path
  const toolResults = [{ ms: t0 + 1000, item: { type: 'tool_result', tool_use_id: 'w' }, agentId: null, runId: null }];
  const windowEndMs = t0 + 160 * min;
  // Pin BOTH readdir orders: tmpfs lists newest-first and ext4 by hash, so a single order
  // can let a first-match `break` pass by luck (F2-review-round3 MINOR-2).
  for (const order of ['forward', 'reversed']) {
    const fsOrdered = order === 'forward' ? fs : { ...fs, readdirSync: (p, o) => fs.readdirSync(p, o).slice().reverse() };
    assert.deepEqual(mergeSpans(buildAgentSpans(fsOrdered, leadPath, sessionId, toolUses, toolResults, windowEndMs)), [[t0, t0 + 150 * min]], order);
  }
  const spans = mergeSpans(buildAgentSpans(fs, leadPath, sessionId, toolUses, toolResults, windowEndMs));

  const leadTimestamps = [t0, windowEndMs]; // silent from launch through +160min
  const r = computeWorkLostOrStalled(leadTimestamps, null, null, { openedMs: t0, acceptedMs: windowEndMs }, null, spans, null);
  // The +150min..+160min piece outside the union is only 10min, never stalled alone.
  assert.match(r.value, /^0 gap\(s\) over 30min stalled; 1 waiting-on-agents \(150\.0 min\)/);
});

test('buildAgentSpans: no-runId heuristic — a staged agent that starts after a parallel Workflow launch still sits inside the union (F2-review-round3 MINOR-1)', () => {
  const dir = mkTmp('four-read-r3-parallel-');
  const sessionId = 'sess';
  const leadPath = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(leadPath, '');
  const wf = path.join(dir, sessionId, 'subagents', 'workflows');
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  const min = 60000;
  fs.mkdirSync(path.join(wf, 'wf_a'), { recursive: true });
  fs.mkdirSync(path.join(wf, 'wf_b'), { recursive: true });
  writeJsonl(path.join(wf, 'wf_a'), 'agent-a1.jsonl', [{ timestamp: new Date(t0 + 100).toISOString(), type: 'user' }, { timestamp: new Date(t0 + 5 * min).toISOString(), type: 'user' }]);
  writeJsonl(path.join(wf, 'wf_a'), 'agent-a2.jsonl', [{ timestamp: new Date(t0 + 1 * min).toISOString(), type: 'user' }, { timestamp: new Date(t0 + 120 * min).toISOString(), type: 'user' }]);
  writeJsonl(path.join(wf, 'wf_b'), 'agent-b1.jsonl', [{ timestamp: new Date(t0 + 2500).toISOString(), type: 'user' }, { timestamp: new Date(t0 + 10 * min).toISOString(), type: 'user' }]);
  const toolUses = [{ ms: t0, name: 'Workflow', id: 'wa' }, { ms: t0 + 2400, name: 'Workflow', id: 'wb' }];
  const toolResults = [
    { ms: t0 + 500, item: { type: 'tool_result', tool_use_id: 'wa' }, agentId: null, runId: null },
    { ms: t0 + 2900, item: { type: 'tool_result', tool_use_id: 'wb' }, agentId: null, runId: null },
  ];
  const spans = mergeSpans(buildAgentSpans(fs, leadPath, sessionId, toolUses, toolResults, t0 + 130 * min));
  assert.deepEqual(spans, [[t0, t0 + 120 * min]]);
});

// ── R7: subagent stall scanning ─────────────────────────────────────────────

function writeJsonl(dir, name, lines) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n'));
  return p;
}

test('scanSubagentFile: an internal gap over 30min between consecutive timestamps is reported; a tool_use tail with a later tool_result is not tail-pending', () => {
  const dir = mkTmp('four-read-subagent-');
  const p = writeJsonl(dir, 'agent-x.jsonl', [
    { timestamp: '2026-01-01T00:00:00.000Z', type: 'user' },
    { timestamp: '2026-01-01T00:00:31.000Z', type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 't1' }] } },
    { timestamp: '2026-01-01T01:20:00.000Z', type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] } },
  ]);
  const r = scanSubagentFile(fs, p);
  assert.equal(r.unreadable, false);
  assert.equal(r.tailPendingToolUseId, null); // the tool_use's own result did arrive later
  assert.equal(r.timestamps.length, 3);
});

test('scanSubagentFile: a killed agent (last record is a tool_use with no later tool_result) is tail-pending', () => {
  const dir = mkTmp('four-read-subagent-killed-');
  const p = writeJsonl(dir, 'agent-y.jsonl', [
    { timestamp: '2026-01-01T00:00:00.000Z', type: 'user' },
    { timestamp: '2026-01-01T00:00:05.000Z', type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 't1' }] } },
  ]);
  const r = scanSubagentFile(fs, p);
  assert.equal(r.tailPendingToolUseId, 't1');
});

test('scanSubagentFile: a timestamp with no Z or offset (local time) rejects the whole file, never guessed', () => {
  const dir = mkTmp('four-read-subagent-local-');
  const p = writeJsonl(dir, 'agent-z.jsonl', [{ timestamp: '2026-01-01T00:00:00.000', type: 'user' }]);
  assert.deepEqual(scanSubagentFile(fs, p), { unreadable: true });
});

test('scanSubagentFile: an unparseable timestamp also rejects the whole file', () => {
  const dir = mkTmp('four-read-subagent-bad-');
  const p = writeJsonl(dir, 'agent-z.jsonl', [{ timestamp: 'not-a-date', type: 'user' }]);
  assert.deepEqual(scanSubagentFile(fs, p), { unreadable: true });
});

test('scanSubagentFile: a file with one timestamp has no internal gap and (with no trailing tool_use) no tail stall', () => {
  const dir = mkTmp('four-read-subagent-one-');
  const p = writeJsonl(dir, 'agent-one.jsonl', [{ timestamp: '2026-01-01T00:00:00.000Z', type: 'user' }]);
  const r = scanSubagentFile(fs, p);
  assert.equal(r.timestamps.length, 1);
  assert.equal(r.tailPendingToolUseId, null);
});

test('collectSubagentStalls: an out-of-window file is skipped (R7 Scope); an in-window internal gap over 30min counts once', () => {
  const dir = mkTmp('four-read-collect-');
  const sessionDir = path.join(dir, 'lead-session');
  fs.mkdirSync(path.join(sessionDir, 'subagents'), { recursive: true });
  fs.mkdirSync(path.join(sessionDir, 'subagents', 'workflows', 'wf1'), { recursive: true });
  writeJsonl(path.join(sessionDir, 'subagents'), 'agent-far-away.jsonl', [ // outside the window entirely
    { timestamp: '2020-01-01T00:00:00.000Z', type: 'user' },
  ]);
  writeJsonl(path.join(sessionDir, 'subagents'), 'journal.jsonl', [{ timestamp: '2026-01-01T00:00:00.000Z' }]); // must be skipped
  writeJsonl(path.join(sessionDir, 'subagents', 'workflows', 'wf1'), 'agent-builder.jsonl', [
    { timestamp: '2026-01-01T00:00:00.000Z', type: 'user' },
    { timestamp: '2026-01-01T01:00:00.000Z', type: 'user' }, // 60min internal gap
  ]);
  const leadPath = path.join(dir, 'lead-session.jsonl');
  fs.writeFileSync(leadPath, '');
  const windowStartMs = Date.parse('2026-01-01T00:00:00.000Z');
  const windowEndMs = Date.parse('2026-01-01T02:00:00.000Z');
  const { stalls, unreadableIds } = collectSubagentStalls(fs, leadPath, 'lead-session', windowStartMs, windowEndMs, [], []);
  assert.equal(unreadableIds.length, 0);
  assert.equal(stalls.length, 1);
  assert.equal(stalls[0].id, 'builder');
  assert.equal(Math.round(stalls[0].minutes), 60);
});

test('collectSubagentStalls: an unreadable subagent file is named, never silently skipped or guessed', () => {
  const dir = mkTmp('four-read-collect-unreadable-');
  const sessionDir = path.join(dir, 'lead-session');
  fs.mkdirSync(path.join(sessionDir, 'subagents'), { recursive: true });
  writeJsonl(path.join(sessionDir, 'subagents'), 'agent-bad.jsonl', [{ timestamp: 'not-a-date', type: 'user' }]);
  const leadPath = path.join(dir, 'lead-session.jsonl');
  fs.writeFileSync(leadPath, '');
  const { stalls, unreadableIds } = collectSubagentStalls(fs, leadPath, 'lead-session', 0, Date.now(), [], []);
  assert.equal(stalls.length, 0);
  assert.deepEqual(unreadableIds, ['bad']);
});

// Acceptance attack: "an agent whose tool_result never arrives (killed)" — a direct
// subagent's tail silence is judged against the window end since our fixtures never carry
// an agent-id field on the lead's own tool_result (see code comment on subagentEndBound).
test('collectSubagentStalls: a killed direct subagent (tail tool_use, no later result) is judged against the window end', () => {
  const dir = mkTmp('four-read-collect-killed-');
  const sessionDir = path.join(dir, 'lead-session');
  fs.mkdirSync(path.join(sessionDir, 'subagents'), { recursive: true });
  writeJsonl(path.join(sessionDir, 'subagents'), 'agent-killed.jsonl', [
    { timestamp: '2026-01-01T00:00:00.000Z', type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 't1' }] } },
  ]);
  const leadPath = path.join(dir, 'lead-session.jsonl');
  fs.writeFileSync(leadPath, '');
  const windowEndMs = Date.parse('2026-01-01T01:00:00.000Z'); // 60min after the file's last (and only) timestamp
  const { stalls } = collectSubagentStalls(fs, leadPath, 'lead-session', 0, windowEndMs, [], []);
  assert.equal(stalls.length, 1);
  assert.equal(stalls[0].id, 'killed');
  assert.equal(Math.round(stalls[0].minutes), 60);
});

// F2-review-round1 MAJOR-2: a Workflow agent's tail-silence bound must be a LATER Workflow
// tool_result, never the launch ack (which is always before the file's last timestamp) —
// otherwise the permission-prompt hang this rule exists for is invisible for every Workflow
// agent. Covers both the one-timestamp and multi-timestamp cases the brief calls out.
for (const label of ['one timestamp', 'several timestamps']) {
  test(`collectSubagentStalls: a Workflow agent stuck on a tool with no TaskStop is a stall bounded by a LATER Workflow result, not the launch ack (MAJOR-2, ${label})`, () => {
    const dir = mkTmp('four-read-major2-');
    const sessionDir = path.join(dir, 'lead-session');
    const runDir = path.join(sessionDir, 'subagents', 'workflows', 'wf1');
    fs.mkdirSync(runDir, { recursive: true });
    const lines = label === 'one timestamp'
      ? [{ timestamp: '2026-01-01T00:05:00.000Z', type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 't1' }] } }]
      : [
        { timestamp: '2026-01-01T00:00:00.000Z', type: 'user' },
        { timestamp: '2026-01-01T00:05:00.000Z', type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 't1' }] } },
      ];
    writeJsonl(runDir, 'agent-w1.jsonl', lines);
    const leadPath = path.join(dir, 'lead-session.jsonl');
    fs.writeFileSync(leadPath, '');
    const toolUses = [{ ms: Date.parse('2026-01-01T00:00:00.000Z'), name: 'Workflow', id: 'w' }]; // Workflow launch, no TaskStop
    const toolResults = [{ ms: Date.parse('2026-01-01T00:00:02.000Z'), item: { type: 'tool_result', tool_use_id: 'w' }, agentId: null, runId: null }]; // ack at +2s, BEFORE the file's last ts
    const windowEndMs = Date.parse('2026-01-01T03:20:00.000Z'); // +200min
    const { stalls } = collectSubagentStalls(fs, leadPath, 'lead-session', 0, windowEndMs, toolUses, toolResults);
    assert.equal(stalls.length, 1);
    assert.equal(stalls[0].id, 'w1');
    assert.equal(Math.round(stalls[0].minutes * 10) / 10, 195.0);
  });
}

// F2-review-round1 MAJOR-3: the direct-subagent end-bound match must read the record-level
// `toolUseResult.agentId` (what real transcripts carry), and only count a result strictly
// AFTER the agent file's own last timestamp — an async Agent's matched result is often just
// the launch ack, which must never recreate MAJOR-2's negative-bound bug.
test('collectSubagentStalls: a direct subagent named by the lead\'s record-level toolUseResult.agentId is judged against that LATER result, not the window end (MAJOR-3)', () => {
  const dir = mkTmp('four-read-major3-');
  const sessionDir = path.join(dir, 'lead-session');
  fs.mkdirSync(path.join(sessionDir, 'subagents'), { recursive: true });
  writeJsonl(path.join(sessionDir, 'subagents'), 'agent-dir1.jsonl', [
    { timestamp: '2026-01-01T00:00:00.000Z', type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 't1' }] } },
  ]);
  const leadPath = path.join(dir, 'lead-session.jsonl');
  fs.writeFileSync(leadPath, '');
  // The lead's own result names the agent at record level (toolUseResult.agentId), arriving
  // one minute after the file's last (and only) timestamp — the true silence is 1 minute.
  const toolResults = [{ ms: Date.parse('2026-01-01T00:06:00.000Z'), item: { type: 'tool_result', tool_use_id: 'a' }, agentId: 'dir1', runId: null }];
  const windowEndMs = Date.parse('2026-01-01T05:00:00.000Z'); // far past the match — must not be used
  const { stalls } = collectSubagentStalls(fs, leadPath, 'lead-session', 0, windowEndMs, [], toolResults);
  assert.equal(stalls.length, 0); // 1.0min of silence, not a false 195min-style inflation
});

// F2-review-round2 MINOR-E: the real-transcript paths (an agentId/runId the lead's own
// tool_result actually carries) were exercised only by hand-probes, never by a committed
// test — each of these four pins one such path against a specific mutation (per the review).

// (a) the Agent/Task agent-file bound (four-read.mjs:239's `if (agentFileLastMs !== null)`).
test('buildAgentSpans: an Agent tool_use\'s span is bounded by the agent file its own toolUseResult.agentId names (MINOR-E-a)', () => {
  const dir = mkTmp('four-read-minore-a-');
  const sessionId = 'sess';
  const leadPath = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(leadPath, '');
  const subagentsDir = path.join(dir, sessionId, 'subagents');
  fs.mkdirSync(subagentsDir, { recursive: true });
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  const min = 60000;
  writeJsonl(subagentsDir, 'agent-d1.jsonl', [
    { timestamp: new Date(t0 + 1000).toISOString(), type: 'user' },
    { timestamp: new Date(t0 + 50 * min).toISOString(), type: 'user' },
  ]);
  const toolUses = [{ ms: t0, name: 'Agent', id: 'a' }];
  const toolResults = [{ ms: t0 + 1000, item: { type: 'tool_result', tool_use_id: 'a' }, agentId: 'd1', runId: null }]; // ack at +1s
  const spans = buildAgentSpans(fs, leadPath, sessionId, toolUses, toolResults, t0 + 999 * min);
  assert.deepEqual(spans, [[t0, t0 + 50 * min]]);
});

// (b) the runId path (four-read.mjs:219), also pinning MINOR-C's max-over-candidates rule.
test('buildAgentSpans: a Workflow ack\'s toolUseResult.runId picks its own run directory over a decoy with an earlier-fitting candidate (MINOR-E-b)', () => {
  const dir = mkTmp('four-read-minore-b-');
  const sessionId = 'sess';
  const leadPath = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(leadPath, '');
  const workflowsDir = path.join(dir, sessionId, 'subagents', 'workflows');
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  const min = 60000;
  const runX = path.join(workflowsDir, 'wf_x');
  const runY = path.join(workflowsDir, 'wf_y'); // decoy: its earliest agent also falls in range
  fs.mkdirSync(runX, { recursive: true });
  fs.mkdirSync(runY, { recursive: true });
  writeJsonl(runX, 'agent-x.jsonl', [
    { timestamp: new Date(t0 + 1 * min).toISOString(), type: 'user' },
    { timestamp: new Date(t0 + 60 * min).toISOString(), type: 'user' },
  ]);
  writeJsonl(runY, 'agent-y.jsonl', [
    { timestamp: new Date(t0 + 2 * min).toISOString(), type: 'user' },
    { timestamp: new Date(t0 + 120 * min).toISOString(), type: 'user' }, // ends LATER than wf_x, so only the runId path can pick wf_x
  ]);
  const toolUses = [{ ms: t0, name: 'Workflow', id: 'w' }];
  const toolResults = [{ ms: t0 + 1000, item: { type: 'tool_result', tool_use_id: 'w' }, agentId: null, runId: 'wf_x' }];
  const spans = buildAgentSpans(fs, leadPath, sessionId, toolUses, toolResults, t0 + 999 * min);
  assert.deepEqual(spans, [[t0, t0 + 60 * min]]); // wf_x's own end, never wf_y's
});

// (c) the nearest-preceding Workflow sort in subagentEndBound (four-read.mjs's descending
// sort by ms) — a farther-preceding Workflow with a later, also-valid result must lose to a
// nearer one, and a Workflow launched AFTER the file ends must never be a candidate at all.
test('collectSubagentStalls: a Workflow agent\'s tail bound picks the NEAREST preceding Workflow\'s later result, never a farther one or one launched after the file ends (MINOR-E-c)', () => {
  const dir = mkTmp('four-read-minore-c-');
  const sessionDir = path.join(dir, 'lead-session');
  const runDir = path.join(sessionDir, 'subagents', 'workflows', 'wf1');
  fs.mkdirSync(runDir, { recursive: true });
  writeJsonl(runDir, 'agent-w1.jsonl', [
    { timestamp: '2026-01-01T00:10:00.000Z', type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 't1' }] } },
  ]); // file's last (and only) timestamp: 00:10
  const leadPath = path.join(dir, 'lead-session.jsonl');
  fs.writeFileSync(leadPath, '');
  const toolUses = [
    { ms: Date.parse('2026-01-01T00:00:00.000Z'), name: 'Workflow', id: 'far' }, // farther-preceding
    { ms: Date.parse('2026-01-01T00:08:00.000Z'), name: 'Workflow', id: 'near' }, // nearer-preceding
    { ms: Date.parse('2026-01-01T00:20:00.000Z'), name: 'Workflow', id: 'after' }, // launched AFTER the file ends
  ];
  const toolResults = [
    { ms: Date.parse('2026-01-01T01:30:00.000Z'), item: { type: 'tool_result', tool_use_id: 'far' }, agentId: null, runId: null }, // wrong (farther) result: 80min
    { ms: Date.parse('2026-01-01T00:50:00.000Z'), item: { type: 'tool_result', tool_use_id: 'near' }, agentId: null, runId: null }, // the correct bound: 00:50, 40min after 00:10
    { ms: Date.parse('2026-01-01T02:00:00.000Z'), item: { type: 'tool_result', tool_use_id: 'after' }, agentId: null, runId: null }, // must never be used
  ];
  const windowEndMs = Date.parse('2026-01-01T10:00:00.000Z');
  const { stalls } = collectSubagentStalls(fs, leadPath, 'lead-session', 0, windowEndMs, toolUses, toolResults);
  assert.equal(stalls.length, 1);
  assert.equal(stalls[0].id, 'w1');
  assert.equal(Math.round(stalls[0].minutes), 40); // 00:10 -> 00:50, the NEAR Workflow's result, not the FAR one's 80min
});

// (d) the `r.ms > fileLastMs` guard on the direct-agent match — dropping it would let an
// async launch ack (which always precedes the file's own activity) produce a negative bound.
test('collectSubagentStalls: a direct subagent\'s end-bound match requires a result strictly LATER than the file\'s own end, never the earlier launch ack (MINOR-E-d)', () => {
  const dir = mkTmp('four-read-minore-d-');
  const sessionDir = path.join(dir, 'lead-session');
  fs.mkdirSync(path.join(sessionDir, 'subagents'), { recursive: true });
  writeJsonl(path.join(sessionDir, 'subagents'), 'agent-dir1.jsonl', [
    { timestamp: '2026-01-01T00:05:00.000Z', type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 't1' }] } },
  ]); // pending at +5min
  const leadPath = path.join(dir, 'lead-session.jsonl');
  fs.writeFileSync(leadPath, '');
  // The lead's own async launch ack, naming this agent, arrives at +1s — BEFORE the file's own
  // last (and only) timestamp. Dropping the `r.ms > fileLastMs` guard would let this recreate
  // MAJOR-2's negative-bound bug (a "silence" that's actually negative).
  const toolResults = [{ ms: Date.parse('2026-01-01T00:00:01.000Z'), item: { type: 'tool_result', tool_use_id: 'a' }, agentId: 'dir1', runId: null }];
  const windowEndMs = Date.parse('2026-01-01T01:45:00.000Z'); // +100min from the file's last ts
  const { stalls } = collectSubagentStalls(fs, leadPath, 'lead-session', 0, windowEndMs, [], toolResults);
  assert.equal(stalls.length, 1);
  assert.equal(stalls[0].id, 'dir1');
  assert.equal(Math.round(stalls[0].minutes), 100); // bounded by the window end, not a negative number
});

// F2-review-round1 MINOR-1: agent stalls must not be silently dropped when the lead itself
// has fewer than 2 in-window messages — that branch still names the agent stall.
test('computeWorkLostOrStalled: fewer than 2 lead messages in window still surfaces agent stalls, never drops them (MINOR-1)', () => {
  const agentResults = { stalls: [{ id: 'a1', atMs: Date.parse('2026-01-01T00:00:00.000Z'), minutes: 45.3 }], unreadableIds: [] };
  const r = computeWorkLostOrStalled([1000], null, null, { openedMs: 0, acceptedMs: 3000 }, null, null, agentResults);
  assert.equal(r.value, 'gaps unavailable (fewer than 2 lead messages in window); agent a1 silent 45.3 min from 2026-01-01T00:00:00.000Z; ASKs unavailable (no --lead-slug)');
});

// F2-review-round1 MINOR-2: a lead that dispatched Agent/Task/Workflow work but for which no
// subagent files can be found at all must say so, not read as a confident "0 agent stalls".
test('buildFourRead: a lead with Agent/Task/Workflow tool_uses but no subagents/ directory says so, not a silent zero (MINOR-2)', async () => {
  const dir = mkTmp('four-read-minor2-');
  const sessionId = 'sess';
  const leadPath = path.join(dir, `${sessionId}.jsonl`);
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  const min = 60000;
  fs.writeFileSync(leadPath, [
    { timestamp: new Date(t0).toISOString(), type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'a' }] } },
    { timestamp: new Date(t0 + 5000).toISOString(), type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a' }] } },
    { timestamp: new Date(t0 + 40 * min).toISOString(), type: 'user' },
  ].map((l) => JSON.stringify(l)).join('\n'));
  // no `<dir>/sess/subagents/` directory at all
  const census = await runCensus({ lead: leadPath, tasksDirs: [], marker: null, out: null });
  const censusPath = path.join(dir, 'census.json');
  fs.writeFileSync(censusPath, JSON.stringify(census));
  const recordPath = path.join(dir, 'record.md');
  fs.writeFileSync(recordPath, [
    `Lead-session: ${sessionId}`,
    `Opened: ${new Date(t0).toISOString()}`,
    `Log: ${new Date(t0).toISOString()} owned test-owner picked up the build`,
    `Log: ${new Date(t0 + 41 * min).toISOString()} accepted test-owner artifact 0000000000000000000000000000000000000000`,
    '',
  ].join('\n'));
  const report = buildFourRead({ record: recordPath, census: censusPath, ledger: null }, fs);
  const value = report.numbers.find((n) => n.key === 'workLostOrStalled').value;
  assert.match(value, new RegExp(`subagents unavailable \\(no files under ${sessionId}/subagents\\)`));
});

// F2-review-round1 MINOR-3: tail silence must clip to the window, exactly like internal gaps.
test('collectSubagentStalls: tail silence is clipped to the window, never measured past it (MINOR-3)', () => {
  const dir = mkTmp('four-read-minor3-');
  const sessionDir = path.join(dir, 'lead-session');
  fs.mkdirSync(path.join(sessionDir, 'subagents', 'workflows', 'wf1'), { recursive: true });
  writeJsonl(path.join(sessionDir, 'subagents', 'workflows', 'wf1'), 'agent-clip.jsonl', [
    { timestamp: '2026-01-01T00:00:00.000Z', type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 't1' }] } },
  ]);
  const leadPath = path.join(dir, 'lead-session.jsonl');
  fs.writeFileSync(leadPath, '');
  // TaskStop bound is 300min after the file's last ts, but the window itself ends at 40min —
  // the clipped silence (40min) is over 30min; the unclipped one (300min) would also be over
  // 30min, so assert the exact clipped minutes to prove the clip, not just the threshold.
  const toolUses = [{ ms: Date.parse('2026-01-01T05:00:00.000Z'), name: 'TaskStop', id: 'ts' }];
  const windowEndMs = Date.parse('2026-01-01T00:40:00.000Z');
  const { stalls } = collectSubagentStalls(fs, leadPath, 'lead-session', 0, windowEndMs, toolUses, []);
  assert.equal(stalls.length, 1);
  assert.equal(Math.round(stalls[0].minutes), 40);
});

// ── R6/R7 against the two real committed session fixtures (contracts.md Facts) ─────────────
// lane10: lead f6c8ae21…, window 2026-09-26T22:35:00Z..2026-09-27T02:49:52Z. Its builder
// (workflows/wf_7223f595-b7d/agent-a314563636ff6b931.jsonl) is silent for 216.8 min from
// 2026-09-26T22:44:29.665Z — exactly one stall (R7), 0 stalled/0 waiting-on-agents at the
// lead level (R6: the lead's own transcript never runs long enough to raise a >30min gap).
test('buildFourRead: lane10\'s real session gives exactly one agent stall (216.8min), 0 lead-stalled, 0 waiting-on-agents', async () => {
  const dir = mkTmp('four-read-lane10-');
  const leadPath = path.join(FIXTURES, 'sessions', 'lane10', 'f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e.jsonl');
  const census = await runCensus({ lead: leadPath, tasksDirs: [], marker: null, out: null });
  const censusPath = path.join(dir, 'census.json');
  fs.writeFileSync(censusPath, JSON.stringify(census));
  const report = buildFourRead({ record: path.join(FIXTURES, 'record-lane10.md'), census: censusPath, ledger: null }, fs);
  const value = report.numbers.find((n) => n.key === 'workLostOrStalled').value;
  assert.equal(value, '1 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); agent a314563636ff6b931 silent 216.8 min from 2026-09-26T22:44:29.665Z; ASKs unavailable (no --lead-slug); wakes 0 (0 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges unavailable (no --lead-slug)');
});

// lane16: lead 588290d9…, window 2026-09-27T06:20:18Z..2026-09-27T07:50:17Z. The lead gap of
// 41.8 min from 2026-09-27T06:20:46.606Z lies inside its one Workflow tool_use span — 0
// stalled, 1 waiting-on-agents (41.8min).
test('buildFourRead: lane16\'s real session gives 0 stalled, 1 waiting-on-agents (41.8min), no agent stalls', async () => {
  const dir = mkTmp('four-read-lane16-');
  const leadPath = path.join(FIXTURES, 'sessions', 'lane16', '588290d9-ee43-400b-a808-cf44c407171c.jsonl');
  const census = await runCensus({ lead: leadPath, tasksDirs: [], marker: null, out: null });
  const censusPath = path.join(dir, 'census.json');
  fs.writeFileSync(censusPath, JSON.stringify(census));
  const report = buildFourRead({ record: path.join(FIXTURES, 'record-lane16.md'), census: censusPath, ledger: null }, fs);
  const value = report.numbers.find((n) => n.key === 'workLostOrStalled').value;
  assert.equal(value, '0 gap(s) over 30min stalled; 1 waiting-on-agents (41.8 min); ASKs unavailable (no --lead-slug); wakes 0 (0 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges unavailable (no --lead-slug)');
});

// ── buildFourRead / formatJson / formatMarkdown (integration) ──────────────

test('buildFourRead: the fixture record + a real census over the fixture lead session produces all four numbers and both companions', async () => {
  const dir = mkTmp('four-read-build-');
  const censusPath = await buildCensusFile(dir);
  const report = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead', git: null, branch: 'HEAD' }, fs);

  assert.equal(report.leadSession.id, 'lead-session');
  assert.equal(report.leadSession.source, 'record');
  assert.equal(report.numbers.length, 4);
  assert.deepEqual(report.numbers.map((n) => n.key), ['topTierTokensPerBuild', 'hoursAskToAccepted', 'reworkAfterAcceptance', 'workLostOrStalled']);
  assert.match(report.numbers[0].value, /^193 tokens: build 193 \(claude-opus-5-5\)/);
  assert.equal(report.numbers[1].value, '24.0h; largest gap 45.0min at 2026-09-01T00:15:00.000Z');
  // no --git given; still reports the re-accept Log: entry (MINOR 1)
  assert.match(report.numbers[2].value, /^unavailable \(no range\); 1 re-accept Log: entry after the first: 2026-09-02T01:00:00\.000Z/);
  assert.match(report.numbers[3].value, /1 unanswered ASK\(s\) to test-lead: fixture-ask-2/);
  assert.equal(report.companions.length, 2);
  assert.match(report.companions[0].value, /^\d+ messages; tokens: cache-read \d+, cache-write \d+, input \d+, output \d+$/);
  assert.match(report.companions[1].value, /2 note\(s\) to test-lead/);
});

test('buildFourRead: a record with no Lead-session: falls back to --lead-session on the command line, and says so', async () => {
  const dir = mkTmp('four-read-build-cli-lead-');
  const censusPath = await buildCensusFile(dir);
  const strippedRecord = path.join(dir, 'record.md');
  fs.writeFileSync(strippedRecord, fs.readFileSync(RECORD, 'utf8').replace(/^Lead-session:.*$/m, ''));
  const report = buildFourRead({ record: strippedRecord, census: censusPath, leadSession: 'cli-supplied-id', ledger: null }, fs);
  assert.equal(report.leadSession.id, 'cli-supplied-id');
  assert.equal(report.leadSession.source, 'cli');
  assert.match(report.leadSession.note, /--lead-session on the command line/);
});

test('buildFourRead: a complete Codex census uses lead.sessionId instead of its rollout basename and reports native response gaps/messages', () => {
  const dir = mkTmp('four-read-codex-c1-');
  const censusPath = path.join(dir, 'census.json');
  const leadPath = path.join(dir, 'rollout-2026-09-27T12-00-00-lead-session.jsonl');
  const codexCensus = {
    leadPath,
    lead: {
      host: 'codex', sessionId: 'lead-session', coverageSupported: true,
      codex: { unavailable: [], responseTimelineComplete: true, responseTimeline: [
        { responseId: 'r1', turnId: 't1', timestamp: '2026-09-01T00:15:00.000Z', model: 'gpt-6-astra' },
        { responseId: 'r2', turnId: 't2', timestamp: '2026-09-01T01:00:00.000Z', model: 'gpt-6-astra' },
      ] },
      windowStartAt: '2026-09-01T00:05:00.000Z', windowEndAt: '2026-09-01T01:05:00.000Z',
    },
    subagents: { incomplete: false, perFile: [] },
    combined: { 'gpt-6-astra': { derived_total_tokens: 23, input_tokens: 7, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 11 } },
  };
  fs.writeFileSync(censusPath, JSON.stringify(codexCensus));
  // A native Codex read is confined to the C1 census (plus record/ledger inputs). Even a
  // Claude-shaped rollout path in that census must not enter the Claude R6/R7 raw scanners
  // or derive a <session>/subagents directory.
  const forbiddenFsOps = [];
  const guardedFs = new Proxy(fs, { get(target, prop) {
    if (prop === 'readFileSync') return (file, ...args) => {
      const resolved = path.resolve(file);
      if (resolved !== path.resolve(RECORD) && resolved !== path.resolve(censusPath) && !resolved.startsWith(`${path.resolve(LEDGER)}${path.sep}`)) {
        forbiddenFsOps.push(`read ${resolved}`);
        throw new Error(`unexpected native Codex read: ${resolved}`);
      }
      return target.readFileSync(file, ...args);
    };
    if (prop === 'readdirSync') return (directory, ...args) => {
      const resolved = path.resolve(directory);
      if (resolved !== path.resolve(LEDGER)) {
        forbiddenFsOps.push(`readdir ${resolved}`);
        throw new Error(`unexpected native Codex directory scan: ${resolved}`);
      }
      return target.readdirSync(directory, ...args);
    };
    return Reflect.get(target, prop);
  } });
  const report = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, guardedFs);
  assert.deepEqual(forbiddenFsOps, []);
  assert.match(report.numbers[0].value, /^23 tokens: build 23 \(gpt-6-astra\); partial \(no spec slice\): spec-census not run$/);
  assert.equal(report.numbers[1].value, '24.0h; largest native API response gap (heuristic) 45.0min at 2026-09-01T00:15:00.000Z');
  assert.match(report.numbers[3].value, /^stalled classification unavailable \(native Codex Agent\/Task\/Workflow span\/stall coverage is not established\); 1 native API response gap\(s\) over 30min \(heuristic, not stall attribution\): 2026-09-01T00:15:00\.000Z \(45\.0min\);/);
  assert.equal(report.companions[0].value, '2 verified top-tier native API response(s) (lead only); tokens: total 23; cache-read 3, cache-write 2, input 7, output 11');

  const shortTimeline = structuredClone(codexCensus);
  shortTimeline.lead.codex.responseTimeline[1].timestamp = '2026-09-01T00:30:00.000Z';
  fs.writeFileSync(censusPath, JSON.stringify(shortTimeline));
  const noLongNativeGap = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.match(noLongNativeGap.numbers[3].value, /^stalled classification unavailable \(native Codex Agent\/Task\/Workflow span\/stall coverage is not established\); 0 native API response gap\(s\) over 30min \(heuristic, not stall attribution\);/);

  const childPartial = structuredClone(codexCensus);
  childPartial.subagents.incomplete = true;
  fs.writeFileSync(censusPath, JSON.stringify(childPartial));
  const partialChildren = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.equal(partialChildren.numbers[0].value, 'unavailable (Codex census subagents are incomplete)');
  assert.equal(partialChildren.numbers[1].value, report.numbers[1].value);
  assert.match(partialChildren.numbers[3].value, /; 1 native API response gap\(s\) over 30min/);
  assert.equal(partialChildren.companions[0].value, '2 verified top-tier native API response(s) (lead only); tokens: unavailable (Codex census subagents are incomplete)');

  const incompleteTimeline = structuredClone(codexCensus);
  incompleteTimeline.lead.codex.responseTimelineComplete = false;
  fs.writeFileSync(censusPath, JSON.stringify(incompleteTimeline));
  const partial = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.match(partial.numbers[1].value, /gap unavailable \(Codex census response timeline is unavailable or incomplete\)$/);
  assert.match(partial.numbers[3].value, /^stalled classification unavailable \(native Codex Agent\/Task\/Workflow span\/stall coverage is not established\); native API response gaps unavailable \(Codex census response timeline is unavailable or incomplete\);/);
  assert.equal(partial.companions[0].value, 'unavailable (Codex census response timeline is unavailable or incomplete)');

  const invalidTimeline = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  invalidTimeline.lead.codex.responseTimelineComplete = true;
  invalidTimeline.lead.codex.responseTimeline[0].model = 'unknown';
  fs.writeFileSync(censusPath, JSON.stringify(invalidTimeline));
  const unknownModel = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.equal(unknownModel.companions[0].value, 'unavailable (Codex census response timeline is unavailable or incomplete)');

  invalidTimeline.lead.codex.responseTimeline[0].model = 'gpt-5.6-terra';
  invalidTimeline.lead.codex.responseTimeline[1].model = 'gpt-5.6-terra';
  invalidTimeline.combined = { 'gpt-5.6-terra': { derived_total_tokens: 23 } };
  fs.writeFileSync(censusPath, JSON.stringify(invalidTimeline));
  const knownMidTier = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.match(knownMidTier.numbers[0].value, /^0 tokens: build 0 \(no top-tier model matched\)/);
  assert.match(knownMidTier.companions[0].value, /^0 verified top-tier native API response\(s\) \(lead only\); tokens: total 0;/);

  invalidTimeline.lead.codex.responseTimeline[0].model = 'gpt-6-astra';
  invalidTimeline.lead.codex.responseTimeline[1].model = 'gpt-6-astra';
  invalidTimeline.combined = { 'gpt-6-astra': { derived_total_tokens: 23 } };
  invalidTimeline.lead.codex.responseTimeline[0].responseId = '';
  fs.writeFileSync(censusPath, JSON.stringify(invalidTimeline));
  const missingResponseId = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.equal(missingResponseId.companions[0].value, 'unavailable (Codex census response timeline is unavailable or incomplete)');

  invalidTimeline.lead.codex.responseTimeline[0].responseId = 'r1';
  invalidTimeline.lead.codex.responseTimeline[0].turnId = '';
  fs.writeFileSync(censusPath, JSON.stringify(invalidTimeline));
  assert.equal(buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs).companions[0].value, 'unavailable (Codex census response timeline is unavailable or incomplete)');

  invalidTimeline.lead.codex.responseTimeline[0].turnId = 't1';
  invalidTimeline.lead.sessionId = 'other-session';
  fs.writeFileSync(censusPath, JSON.stringify(invalidTimeline));
  assert.equal(buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs).numbers[0].value, 'unavailable (Codex census session other-session is not Lead-session lead-session)');

  const missingIdentity = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  missingIdentity.lead.codex.responseTimeline[0].responseId = 'r1';
  delete missingIdentity.lead.sessionId;
  fs.writeFileSync(censusPath, JSON.stringify(missingIdentity));
  const noSession = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.equal(noSession.numbers[0].value, 'unavailable (Codex census has no valid lead.sessionId)');
  assert.equal(noSession.companions[0].value, noSession.numbers[0].value);
  assert.match(noSession.numbers[1].value, /gap unavailable \(Codex census has no valid lead\.sessionId\)$/);

  missingIdentity.lead.sessionId = '   ';
  fs.writeFileSync(censusPath, JSON.stringify(missingIdentity));
  assert.equal(buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs).numbers[0].value, 'unavailable (Codex census has no valid lead.sessionId)');
});

test('buildFourRead: native lead counts require a valid record/census build window even when token coverage is partial', () => {
  const dir = mkTmp('four-read-codex-window-gate-');
  const recordText = fs.readFileSync(RECORD, 'utf8');
  const baseCensus = {
    leadPath: path.join(dir, 'rollout-native.jsonl'),
    lead: {
      host: 'codex', sessionId: 'lead-session', coverageSupported: true,
      codex: { unavailable: [], responseTimelineComplete: true, responseTimeline: [
        { responseId: 'r1', turnId: 't1', timestamp: '2026-09-01T00:15:00.000Z', model: 'gpt-6-astra' },
        { responseId: 'r2', turnId: 't2', timestamp: '2026-09-01T01:00:00.000Z', model: 'gpt-6-astra' },
      ] },
      windowStartAt: '2026-09-01T00:05:00.000Z', windowEndAt: '2026-09-01T01:05:00.000Z',
    },
    subagents: { incomplete: false, perFile: [] },
    combined: { 'gpt-6-astra': { derived_total_tokens: 23 } },
  };
  const cases = [
    { name: 'missing Opened', record: recordText.replace(/^Opened:.*\r?\n/m, '') },
    { name: 'missing acceptance', record: recordText.replace(/^Log: .* accepted .*\r?\n/gm, '') },
    { name: 'record opened at acceptance', record: recordText.replace(/^Log: .* owned .*\r?\n/m, '') },
    { name: 'census outside record window', record: recordText, outside: true },
  ];
  for (const incomplete of [false, true]) {
    for (const scenario of cases) {
      const recordPath = path.join(dir, `${scenario.name.replaceAll(' ', '-')}-${incomplete}.md`);
      const censusPath = path.join(dir, `${scenario.name.replaceAll(' ', '-')}-${incomplete}.json`);
      const census = structuredClone(baseCensus);
      census.subagents.incomplete = incomplete;
      if (scenario.outside) {
        census.lead.windowStartAt = '2026-09-03T00:05:00.000Z';
        census.lead.windowEndAt = '2026-09-03T01:05:00.000Z';
        census.lead.codex.responseTimeline[0].timestamp = '2026-09-03T00:15:00.000Z';
        census.lead.codex.responseTimeline[1].timestamp = '2026-09-03T01:00:00.000Z';
      }
      fs.writeFileSync(recordPath, scenario.record);
      fs.writeFileSync(censusPath, JSON.stringify(census));
      const companion = buildFourRead({ record: recordPath, census: censusPath, ledger: null }, fs).companions[0].value;
      assert.match(companion, /^unavailable \(/, `${scenario.name}, child incomplete=${incomplete}`);
      assert.doesNotMatch(companion, /verified top-tier native API response/, `${scenario.name}, child incomplete=${incomplete}`);
    }
  }
});

test('buildFourRead: a Codex census requires a nonempty requested Lead-session identity', () => {
  const dir = mkTmp('four-read-codex-missing-requested-id-');
  const censusPath = path.join(dir, 'census.json');
  const recordPath = path.join(dir, 'record.md');
  fs.writeFileSync(recordPath, fs.readFileSync(RECORD, 'utf8').replace(/^Lead-session:.*\n/m, ''));
  fs.writeFileSync(censusPath, JSON.stringify({
    leadPath: path.join(dir, 'rollout-arbitrary.jsonl'),
    lead: { host: 'codex', sessionId: 'lead-session', coverageSupported: true, codex: { unavailable: [] }, windowStartAt: '2026-09-01T00:05:00.000Z', windowEndAt: '2026-09-01T01:05:00.000Z' },
    subagents: { incomplete: false }, combined: { 'gpt-6-astra': { derived_total_tokens: 23 } },
  }));
  const report = buildFourRead({ record: recordPath, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.equal(report.numbers[0].value, 'unavailable (no valid Lead-session:)');
  assert.equal(report.companions[0].value, report.numbers[0].value);

  fs.writeFileSync(recordPath, fs.readFileSync(RECORD, 'utf8').replace(/^Lead-session:.*$/m, 'Lead-session: unknown'));
  assert.equal(buildFourRead({ record: recordPath, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs).numbers[0].value, 'unavailable (no valid Lead-session:)');
});

test('buildFourRead: a record opened at acceptance (MAJOR 4) still rejects a whole-session census by its real accepted time, not a silently-trusted one (BLOCKER 1(b))', async () => {
  const dir = mkTmp('four-read-opened-at-accept-');
  const censusPath = await buildCensusFile(dir);
  const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  // simulate a whole-session census whose window starts after this record's own acceptance.
  census.lead = { ...census.lead, windowStartAt: '2026-09-02T02:00:00.000Z' };
  fs.writeFileSync(censusPath, JSON.stringify(census));
  const openedAtAcceptRecord = path.join(dir, 'record.md');
  fs.writeFileSync(openedAtAcceptRecord, fs.readFileSync(RECORD, 'utf8').replace(/^Log: .*owned.*\n/m, ''));
  const report = buildFourRead({ record: openedAtAcceptRecord, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.match(report.numbers[1].value, /^unavailable \(record opened at acceptance/); // Number 2, MAJOR 4
  assert.match(report.numbers[0].value, /^unavailable \(record opened at acceptance: no Log: entry before the first accepted: census window cannot be checked\)$/); // Number 1 refuses with Number 2 (MAJOR 1, r3)
  // BLOCKER 1 (r2): the companion must equal Number 1's own verdict — never a confident
  // "0 messages" beside a census Number 1 has already called wrong.
  assert.equal(report.companions[0].value, report.numbers[0].value);
  assert.doesNotMatch(report.companions[0].value, /^0 messages/);
  assert.match(report.companions[1].value, /^unavailable \(record opened at acceptance/); // M8 (r3): notes-to-lead too
});

test('buildFourRead: a record opened at acceptance makes Number 1 refuse with Number 2, even against a census that fits the window (MAJOR 1, r3)', async () => {
  const dir = mkTmp('four-read-opened-at-accept-fits-');
  const censusPath = await buildCensusFile(dir);
  const openedAtAcceptRecord = path.join(dir, 'record.md');
  // remove the `owned` line only: the first Log: entry becomes the first `accepted` one, and
  // the fixture census (00:05..01:05) fits comfortably inside Opened:..first-accepted.
  fs.writeFileSync(openedAtAcceptRecord, fs.readFileSync(RECORD, 'utf8').replace(/^Log: .*owned.*\n/m, ''));
  const report = buildFourRead({ record: openedAtAcceptRecord, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.match(report.numbers[0].value, /^unavailable \(record opened at acceptance/);
  assert.equal(report.companions[0].value, report.numbers[0].value);
});

test('buildFourRead: a record with no Opened: makes Number 1 and its companion both unavailable, never a confident count (BLOCKER 1)', async () => {
  const dir = mkTmp('four-read-no-opened-');
  const censusPath = await buildCensusFile(dir);
  const noOpenedRecord = path.join(dir, 'record.md');
  fs.writeFileSync(noOpenedRecord, fs.readFileSync(RECORD, 'utf8').replace(/^Opened:.*$/m, ''));
  const report = buildFourRead({ record: noOpenedRecord, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.match(report.numbers[0].value, /^unavailable \(no Opened: census window cannot be checked\)$/);
  assert.equal(report.companions[0].value, report.numbers[0].value);
});

test('buildFourRead: a Lead-session: that does not match the census\'s own lead file gives a named mismatch reason on Numbers 2 and 4, not a silently-wrong transcript (MAJOR 1, pinned against reversion in r2)', async () => {
  const dir = mkTmp('four-read-lead-mismatch-');
  const censusPath = await buildCensusFile(dir);
  const mismatchedRecord = path.join(dir, 'record.md');
  fs.writeFileSync(mismatchedRecord, fs.readFileSync(RECORD, 'utf8').replace(/^Lead-session:.*$/m, 'Lead-session: not-the-census-file'));
  const report = buildFourRead({ record: mismatchedRecord, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.match(report.numbers[1].value, /gap unavailable \(census lead file lead-session is not Lead-session not-the-census-file\)$/);
  assert.match(report.numbers[3].value, /^gaps unavailable \(census lead file lead-session is not Lead-session not-the-census-file\)/);
  // MAJOR 2 (r3): Number 1 must refuse on the same mismatch, not print tokens from a sibling
  // pane's census.
  assert.match(report.numbers[0].value, /^unavailable \(census lead file lead-session is not Lead-session not-the-census-file\)$/);
  assert.equal(report.companions[0].value, report.numbers[0].value);
});

test('buildFourRead: a census with no lead.windowEndAt is unavailable, never a confident "0 messages" companion (MAJOR 3, r3)', async () => {
  const dir = mkTmp('four-read-no-window-end-');
  const censusPath = await buildCensusFile(dir);
  const c = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  delete c.lead.windowEndAt;
  fs.writeFileSync(censusPath, JSON.stringify(c));
  const report = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.equal(report.numbers[0].value, 'unavailable (census has no window end)');
  assert.equal(report.companions[0].value, report.numbers[0].value);
  assert.doesNotMatch(report.companions[0].value, /^0 messages/);
});

test('buildFourRead: the companion counts over the census window, and the end check uses the LAST accepted (r2 MAJOR 1, pinned in r3)', async () => {
  const dir = mkTmp('four-read-census-window-');
  const censusPath = await buildCensusFile(dir);
  const rec = path.join(dir, 'record.md');
  fs.writeFileSync(rec, fs.readFileSync(RECORD, 'utf8').replace('2026-09-02T00:00:00.000Z accepted', '2026-09-01T00:30:00.000Z accepted').replace('2026-09-02T01:00:00.000Z accepted', '2026-09-01T01:10:00.000Z accepted'));
  const r = buildFourRead({ record: rec, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.match(r.numbers[0].value, /^193 tokens/);
  assert.match(r.companions[0].value, /^2 messages;/); // Opened..first-accepted would give 1
});

// MAJOR 2 (seam): an accept-time run (record has no `accepted` Log: yet) must give real
// values, not the `unavailable` every accepted record would otherwise be stuck copying —
// the shared-timestamp design: `--accept-at T` stands in for the accept `accept --at T`
// writes for real, both naming the same T.
test('buildFourRead: --accept-at gives real values at accept time instead of unavailable (MAJOR 2, seam)', async () => {
  const dir = mkTmp('four-read-accept-at-');
  const censusPath = await buildCensusFile(dir);
  const noAcceptRecord = path.join(dir, 'record.md');
  fs.writeFileSync(noAcceptRecord, fs.readFileSync(RECORD, 'utf8').replace(/^Log: .*accepted.*\n?/gm, ''));
  const report = buildFourRead({ record: noAcceptRecord, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead', acceptAt: '2026-09-01T02:00:00.000Z' }, fs);
  assert.equal(report.acceptAt, '2026-09-01T02:00:00.000Z');
  assert.doesNotMatch(report.numbers[0].value, /^unavailable/);
  assert.doesNotMatch(report.numbers[1].value, /^unavailable/);
  assert.match(report.numbers[0].value, /^193 tokens: build 193 \(claude-opus-5-5\)/);
  assert.equal(report.numbers[1].value, '2.0h; largest gap 45.0min at 2026-09-01T00:15:00.000Z');
});

test('buildFourRead: an unparseable last accepted Log: timestamp falls back to the first accepted (tighter) bound for the census end check, not a silently-skipped one (MAJOR 3, r3)', async () => {
  const dir = mkTmp('four-read-last-accept-bad-');
  const censusPath = await buildCensusFile(dir);
  const c = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  fs.writeFileSync(censusPath, JSON.stringify({ ...c, lead: { ...c.lead, windowEndAt: '2026-09-05T00:00:00.000Z' } }));
  const rec = path.join(dir, 'record.md');
  fs.writeFileSync(rec, fs.readFileSync(RECORD, 'utf8').replace('2026-09-02T01:00:00.000Z accepted', 'not-a-date accepted'));
  const r = buildFourRead({ record: rec, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.equal(r.numbers[0].value, 'unavailable (census window ends 2026-09-05T00:00:00.000Z, after the last acceptance)');
  assert.equal(r.companions[0].value, r.numbers[0].value);
});

test('buildFourRead: passes the last acceptance into the census end check (r2 MAJOR 1, pinned in r3)', async () => {
  const dir = mkTmp('four-read-census-end-');
  const censusPath = await buildCensusFile(dir);
  const c = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  fs.writeFileSync(censusPath, JSON.stringify({ ...c, lead: { ...c.lead, windowEndAt: '2026-09-05T00:00:00.000Z' } }));
  const r = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  assert.equal(r.numbers[0].value, 'unavailable (census window ends 2026-09-05T00:00:00.000Z, after the last acceptance)');
  assert.equal(r.companions[0].value, r.numbers[0].value);
});

test('formatJson: deterministic, sorted keys, over the fixture build', async () => {
  const dir = mkTmp('four-read-json-');
  const censusPath = await buildCensusFile(dir);
  const report = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  const a = formatJson(report);
  const b = formatJson(buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs));
  assert.equal(a, b);
  assert.deepEqual(Object.keys(JSON.parse(a)), Object.keys(JSON.parse(a)).slice().sort());
});

test('formatMarkdown: prints a "| number | value |" table with all four labels, plus a Companions table', async () => {
  const dir = mkTmp('four-read-md-');
  const censusPath = await buildCensusFile(dir);
  const report = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  const md = formatMarkdown(report);
  assert.match(md, /\| number \| value \|/);
  assert.match(md, /\| Top-tier tokens per build \|/);
  assert.match(md, /\| Hours ask to accepted \|/);
  assert.match(md, /\| Rework after acceptance \|/);
  assert.match(md, /\| Work lost or stalled \|/);
  assert.match(md, /## Companions/);
  assert.match(md, /\| Notes to the lead per build \|/);
});

test('formatJson/formatMarkdown: pin exact golden content for the fixture build, not just self-equality (MINOR 6)', async () => {
  const dir = mkTmp('four-read-golden-');
  const censusPath = await buildCensusFile(dir);
  const report = buildFourRead({ record: RECORD, census: censusPath, ledger: LEDGER, leadSlug: 'test-lead' }, fs);
  report.record = 'scripts/fixtures/four-read/record.md'; // relative, so the golden string is stable

  assert.equal(formatJson(report), [
    '{',
    '  "acceptAt": null,',
    '  "companions": [',
    '    {',
    '      "key": "topTierAssistantMessagesPerBuild",',
    '      "label": "Top-tier assistant messages per build",',
    '      "value": "2 messages; tokens: cache-read 170, cache-write 0, input 15, output 8"',
    '    },',
    '    {',
    '      "key": "notesToLeadPerBuild",',
    '      "label": "Notes to the lead per build",',
    '      "value": "2 note(s) to test-lead: ASK fixture-ask-1, ASK fixture-ask-2"',
    '    }',
    '  ],',
    '  "leadSession": {',
    '    "id": "lead-session",',
    '    "note": "from the record\'s Lead-session: field",',
    '    "source": "record"',
    '  },',
    '  "numbers": [',
    '    {',
    '      "key": "topTierTokensPerBuild",',
    '      "label": "Top-tier tokens per build",',
    '      "value": "193 tokens: build 193 (claude-opus-5-5); partial (no spec slice): spec-census not run"',
    '    },',
    '    {',
    '      "key": "hoursAskToAccepted",',
    '      "label": "Hours ask to accepted",',
    '      "value": "24.0h; largest gap 45.0min at 2026-09-01T00:15:00.000Z"',
    '    },',
    '    {',
    '      "key": "reworkAfterAcceptance",',
    '      "label": "Rework after acceptance",',
    '      "value": "unavailable (no range); 1 re-accept Log: entry after the first: 2026-09-02T01:00:00.000Z artifact abcdef01234567890123456789012345abcdef0 reaccepted for fix round"',
    '    },',
    '    {',
    '      "key": "workLostOrStalled",',
    '      "label": "Work lost or stalled",',
    '      "value": "1 gap(s) over 30min stalled: 2026-09-01T00:15:00.000Z (45.0min); 0 waiting-on-agents (0.0 min); 1 unanswered ASK(s) to test-lead: fixture-ask-2; wakes 0 (0 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to test-lead"',
    '    }',
    '  ],',
    '  "record": "scripts/fixtures/four-read/record.md"',
    '}',
  ].join('\n'));

  assert.equal(formatMarkdown(report), [
    '# Four-number read: record.md',
    '',
    "Lead session: `lead-session` (from the record's Lead-session: field)",
    '',
    '| number | value |',
    '|---|---|',
    '| Top-tier tokens per build | 193 tokens: build 193 (claude-opus-5-5); partial (no spec slice): spec-census not run |',
    '| Hours ask to accepted | 24.0h; largest gap 45.0min at 2026-09-01T00:15:00.000Z |',
    '| Rework after acceptance | unavailable (no range); 1 re-accept Log: entry after the first: 2026-09-02T01:00:00.000Z artifact abcdef01234567890123456789012345abcdef0 reaccepted for fix round |',
    '| Work lost or stalled | 1 gap(s) over 30min stalled: 2026-09-01T00:15:00.000Z (45.0min); 0 waiting-on-agents (0.0 min); 1 unanswered ASK(s) to test-lead: fixture-ask-2; wakes 0 (0 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to test-lead |',
    '',
    '## Companions',
    '',
    '| line | value |',
    '|---|---|',
    '| Top-tier assistant messages per build | 2 messages; tokens: cache-read 170, cache-write 0, input 15, output 8 |',
    '| Notes to the lead per build | 2 note(s) to test-lead: ASK fixture-ask-1, ASK fixture-ask-2 |',
  ].join('\n'));
});

// ── parseArgs / main ──────────────────────────────────────────────────────

test('parseArgs: --record and --census are required', () => {
  assert.throws(() => parseArgs([]), /--record/);
  assert.throws(() => parseArgs(['--record', 'r.md']), /--census/);
});

test('parseArgs: an unknown flag throws, and a trailing flag with no value throws', () => {
  assert.throws(() => parseArgs(['--record', 'r', '--census', 'c', '--nope']), /unknown argument/);
  assert.throws(() => parseArgs(['--record', 'r', '--census']), /--census needs a value/);
});

test('parseArgs: every optional flag is captured', () => {
  const opts = parseArgs([
    '--record', 'r.md', '--census', 'c.json', '--spec-census', 's.json', '--ledger', 'l',
    '--git', 'g', '--branch', 'b', '--lead-session', 'ls', '--lead-slug', 'slug',
    '--out', 'o.md', '--json', 'o.json', '--accept-at', '2026-09-25T12:00:00Z',
  ]);
  assert.deepEqual(opts, {
    record: 'r.md', census: 'c.json', specCensus: 's.json', ledger: 'l', git: 'g', branch: 'b',
    leadSession: 'ls', leadSlug: 'slug', out: 'o.md', json: 'o.json', acceptAt: '2026-09-25T12:00:00Z',
  });
});

test('main: --out and --json write files; stdout gets only "wrote:" lines', async () => {
  const dir = mkTmp('four-read-main-');
  const censusPath = await buildCensusFile(dir);
  const outMd = path.join(dir, 'out.md');
  const outJson = path.join(dir, 'out.json');
  const lines = [];
  await main(['--record', RECORD, '--census', censusPath, '--ledger', LEDGER, '--lead-slug', 'test-lead', '--out', outMd, '--json', outJson], { write: (s) => lines.push(s) });
  assert.deepEqual(lines, [`wrote: ${outJson}`, `wrote: ${outMd}`]);
  assert.match(fs.readFileSync(outMd, 'utf8'), /Four-number read/);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(outJson, 'utf8')));
});

test('main: without --out/--json, the full markdown report goes to the write() sink', async () => {
  const dir = mkTmp('four-read-main-stdout-');
  const censusPath = await buildCensusFile(dir);
  const lines = [];
  await main(['--record', RECORD, '--census', censusPath], { write: (s) => lines.push(s) });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Four-number read/);
});

// ── F1/F3 (lane 54): --census must be build-census's own --json file, never the markdown ──
// (docs/reports/census-0928/four-read.md, "Finding 4b is wrong" ¶: four-read.mjs used to hand
// the markdown to loadJson (:47), which silently swallowed the parse failure into "no census"
// (:787) — a check that passes because it isn't looking.)

const CENSUS_MARKDOWN = path.join(FIXTURES, 'census-markdown-sample.md');

test('isBuildCensusJsonShape: a real build-census --json report is the shape', async () => {
  const dir = mkTmp('four-read-shape-');
  const censusPath = await buildCensusFile(dir);
  assert.equal(isBuildCensusJsonShape(JSON.parse(fs.readFileSync(censusPath, 'utf8'))), true);
});

test('isBuildCensusJsonShape: the census markdown, plain objects, arrays and null are not the shape', () => {
  assert.equal(isBuildCensusJsonShape({ leadTurns: 7 }), false);
  assert.equal(isBuildCensusJsonShape([1, 2, 3]), false);
  assert.equal(isBuildCensusJsonShape(null), false);
  assert.equal(isBuildCensusJsonShape('VERDICT: COUNTED'), false);
  const allKeys = { subagents: {}, combined: null, marker: null, leadPath: 'x', tasksPaths: [], defaultSubagentsDir: null };
  assert.equal(isBuildCensusJsonShape({ ...allKeys, lead: null }), false);
  assert.equal(isBuildCensusJsonShape({ ...allKeys, lead: [] }), false);
});

test('validateCensusArg: the census markdown fails JSON.parse and is refused with the F1 message', () => {
  const result = validateCensusArg(fs, CENSUS_MARKDOWN);
  assert.equal(result.ok, false);
  assert.equal(result.message, CENSUS_REFUSAL_MESSAGE);
});

test('validateCensusArg: JSON with the wrong top-level shape is refused with the F1 message', () => {
  const dir = mkTmp('four-read-wrong-shape-');
  const p = path.join(dir, 'wrong-shape.json');
  fs.writeFileSync(p, JSON.stringify({ leadTurns: 7, ok: true }));
  const result = validateCensusArg(fs, p);
  assert.equal(result.ok, false);
  assert.equal(result.message, CENSUS_REFUSAL_MESSAGE);
});

test('validateCensusArg: a missing file is refused loudly, not silently accepted', () => {
  const dir = mkTmp('four-read-missing-census-');
  const result = validateCensusArg(fs, path.join(dir, 'does-not-exist.json'));
  assert.equal(result.ok, false);
  assert.match(result.message, /four-read: --census file not found or unreadable/);
});

test('validateCensusArg: a real build-census --json file passes', async () => {
  const dir = mkTmp('four-read-valid-census-');
  const censusPath = await buildCensusFile(dir);
  assert.deepEqual(validateCensusArg(fs, censusPath), { ok: true });
});

// The discriminating check named in the build report: at the base commit this test failed
// (exit 0, `wrote:` lines printed, output files written) because the markdown silently read
// as "no census". After the fix it exits 2, writes nothing, and stderr names the flag.
test('main: --census pointed at the census markdown refuses with exit 2 and writes no output file, before this fix it silently exited 0', async () => {
  const dir = mkTmp('four-read-main-markdown-census-');
  const outMd = path.join(dir, 'out.md');
  const outJson = path.join(dir, 'out.json');
  const lines = [];
  const errLines = [];
  const code = await main(
    ['--record', RECORD, '--census', CENSUS_MARKDOWN, '--out', outMd, '--json', outJson],
    { write: (s) => lines.push(s), writeErr: (s) => errLines.push(s) },
  );
  assert.equal(code, 2);
  assert.deepEqual(lines, []);
  assert.equal(errLines.length, 1);
  assert.equal(errLines[0], `${CENSUS_REFUSAL_MESSAGE}\n`);
  assert.equal(fs.existsSync(outMd), false);
  assert.equal(fs.existsSync(outJson), false);
});

test('main: --census pointed at a real build-census --json file still passes (F3: JSON input keeps working)', async () => {
  const dir = mkTmp('four-read-main-json-census-');
  const censusPath = await buildCensusFile(dir);
  const lines = [];
  const code = await main(['--record', RECORD, '--census', censusPath], { write: (s) => lines.push(s) });
  assert.equal(code, 0);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Four-number read/);
});

// ── Lane 54 fix round 1 ──────────────────────────────────────────────────────────────────

test('validateCensusArg: a pre-lane-38 build-census JSON (no stallNudges) still passes', async () => {
  const dir = mkTmp('four-read-old-census-');
  const censusPath = await buildCensusFile(dir);
  const c = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  delete c.stallNudges;
  fs.writeFileSync(censusPath, JSON.stringify(c));
  assert.deepEqual(validateCensusArg(fs, censusPath), { ok: true });
});

// F-2 (lane 54 r1): --spec-census must be gated the same way as --census, not silently
// read as "no spec census" via buildFourRead's internal loadJson (:787).
test('main: --spec-census pointed at the census markdown refuses with exit 2, mirroring --census', async () => {
  const dir = mkTmp('four-read-main-markdown-spec-census-');
  const censusPath = await buildCensusFile(dir);
  const outMd = path.join(dir, 'out.md');
  const outJson = path.join(dir, 'out.json');
  const lines = [];
  const errLines = [];
  const code = await main(
    ['--record', RECORD, '--census', censusPath, '--spec-census', CENSUS_MARKDOWN, '--out', outMd, '--json', outJson],
    { write: (s) => lines.push(s), writeErr: (s) => errLines.push(s) },
  );
  assert.equal(code, 2);
  assert.deepEqual(lines, []);
  assert.equal(errLines.length, 1);
  assert.equal(errLines[0], 'four-read: --spec-census must be the build-census --json data file, not the census markdown\n');
  assert.equal(fs.existsSync(outMd), false);
  assert.equal(fs.existsSync(outJson), false);
});
