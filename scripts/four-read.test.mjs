// node --test scripts/four-read.test.mjs
//
// Committed fixtures under scripts/fixtures/four-read/ (spec.md Territory R1 item 4):
//   - record.md          — a record with all fields, two `accepted` Log: entries.
//   - lead-session.jsonl  — a trimmed lead transcript with two gaps (10min under, 45min
//                            over the 30-minute threshold), split across a top-tier model
//                            (claude-opus-5-5) and a non-top-tier one (claude-sonnet-5).
//   - ledger/2026-09-01.md — one answered ASK, one unanswered ASK, one ASK to someone else.
// A tiny git repo (rework-after-acceptance) is built fresh per test under mkdtempSync,
// never committed, per the spec's own fixture note.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runCensus } from './build-census.mjs';
import {
  parseRecordText, computeTopTierTokens, scanTimestamps, computeHoursAskToAccepted,
  computeReworkAfterAcceptance, collectLedgerEntries, computeWorkLostOrStalled,
  buildFourRead, formatJson, formatMarkdown, parseArgs, main,
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

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
}

function initRepo(dir) {
  git(dir, ['init', '-q']);
  // The machine's git-identity-guard hook refuses a commit whose author/committer email is
  // not on its allowlist, even inside a disposable scratch repo — use an allowed identity.
  git(dir, ['config', 'user.email', 'benzhuk@gmail.com']);
  git(dir, ['config', 'user.name', 'fixture']);
}

function commit(dir, file, content, message, isoDate) {
  fs.writeFileSync(path.join(dir, file), content);
  git(dir, ['add', file]);
  const env = { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate };
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', message], { encoding: 'utf8', env });
  return git(dir, ['rev-parse', 'HEAD']).trim();
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
  const r = computeTopTierTokens(census, null, { 'spec-session': 'x', 'spec-from': 'y' });
  assert.match(r.value, /^6 tokens: build 6 \(claude-opus-5-5\); partial \(no spec slice\): spec-census not run$/);
});

test('computeTopTierTokens: Spec-session/Spec-from missing from the record names that reason instead', () => {
  const census = { combined: {}, lead: A_WINDOW };
  const r = computeTopTierTokens(census, null, {});
  assert.match(r.value, /Spec-session:\/Spec-from: missing from record/);
});

test('computeTopTierTokens: no top-tier model matched is named, not silently zero', () => {
  const census = { combined: { 'claude-sonnet-5': { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } }, lead: A_WINDOW };
  const r = computeTopTierTokens(census, null, {});
  assert.match(r.value, /no top-tier model matched/);
});

test('computeTopTierTokens: a spec-census combines the build slice and the spec slice into one total', () => {
  const census = { combined: { 'claude-opus-5-5': { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } }, lead: A_WINDOW };
  const specCensus = { combined: { 'claude-opus-5-5': { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } } };
  const r = computeTopTierTokens(census, specCensus, {});
  assert.match(r.value, /^15 tokens: build 10 \(claude-opus-5-5\) \+ spec slice 5$/);
});

test('computeTopTierTokens: DELEGATION_TOP_TIER overrides the default fable,opus tier list', (t) => {
  t.after(() => delete process.env.DELEGATION_TOP_TIER);
  process.env.DELEGATION_TOP_TIER = 'sonnet';
  const census = { combined: { 'claude-sonnet-5': { input_tokens: 7, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } }, lead: A_WINDOW };
  const r = computeTopTierTokens(census, null, {});
  assert.match(r.value, /^7 tokens: build 7/);
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
  initRepo(dir);
  const now = Date.now();
  const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
  const baseSha = commit(dir, 'a.txt', 'base', 'chore: base', iso(-3600000));
  const acceptedSha = commit(dir, 'a.txt', 'accepted version', 'feat: build files', iso(-1800000));
  commit(dir, 'a.txt', 'post-fix', 'fix: rework on build file', iso(60000)); // counts
  commit(dir, 'b.txt', 'unrelated', 'fix: unrelated file', iso(120000)); // does not touch a.txt
  commit(dir, 'a.txt', 'release bump', 'release: 0.20.9', iso(180000)); // excluded by subject

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
  initRepo(dir);
  const now = Date.now();
  const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
  const baseSha = commit(dir, 'a.txt', 'base', 'chore: base', iso(-3600000));
  const acceptedSha = commit(dir, 'a.txt', 'accepted version', 'feat: build files', iso(-1800000));
  commit(dir, 'a.txt', 'release bump 1', 'chore: release 0.20.9', iso(60000)); // excluded
  commit(dir, 'a.txt', 'release bump 2', 'chore(release): 0.20.7', iso(120000)); // excluded
  const fields = { base: baseSha };
  const logs = [{ status: 'accepted', at: new Date(now - 1800000).toISOString(), owner: 'x', note: `artifact ${acceptedSha}` }];
  const r = computeReworkAfterAcceptance(fields, logs, dir, 'HEAD');
  assert.match(r.value, /^0 commits touching build files within 7 days/);
  assert.doesNotMatch(r.value, /0\.20\.9/);
  assert.doesNotMatch(r.value, /0\.20\.7/);
});

test('computeReworkAfterAcceptance: the Artifact: fallback is only used with a single accepted entry — a re-accept without an artifact note gives unavailable, never the wrong (last) sha (MINOR 9)', () => {
  const dir = mkTmp('four-read-git-fallback-');
  initRepo(dir);
  const iso = new Date().toISOString();
  const sha = commit(dir, 'a.txt', 'x', 'chore: only commit', iso);
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
  initRepo(dir);
  const iso = new Date().toISOString();
  const sha = commit(dir, 'a.txt', 'x', 'chore: only commit', iso);
  const fields = { base: sha };
  const logs = [{ status: 'accepted', at: iso, owner: 'x', note: `artifact ${sha}` }];
  assert.equal(computeReworkAfterAcceptance(fields, logs, dir, 'HEAD').value, 'unavailable (no range); 0 re-accept Log: entries after the first');
});

test('computeReworkAfterAcceptance: an unresolvable git ref fails closed as unavailable, not a thrown error', () => {
  const dir = mkTmp('four-read-git-bad-');
  initRepo(dir);
  const iso = new Date().toISOString();
  commit(dir, 'a.txt', 'x', 'chore: only commit', iso);
  const fields = { base: 'not-a-real-ref' };
  const logs = [{ status: 'accepted', at: iso, owner: 'x', note: 'artifact 0123456' }];
  const r = computeReworkAfterAcceptance(fields, logs, dir, 'HEAD');
  assert.match(r.value, /^unavailable \(git: /);
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
  assert.match(r.value, /^0 gaps over 30min; ASKs unavailable \(no --lead-slug\)$/);
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
  assert.match(r.value, /^1 gap\(s\) over 30min: 2026-09-01T00:15:00\.000Z \(45\.0min\); 1 unanswered ASK\(s\) to test-lead: fixture-ask-2$/);
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

test('buildFourRead: a record opened at acceptance still prints a confident Number 1 today unless it refuses with Number 2 — against a census that fits the window (MAJOR 1, r3)', async () => {
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
  assert.match(report.numbers[0].value, /^unavailable \(no Opened:: census window cannot be checked\)$/);
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
    '      "value": "1 gap(s) over 30min: 2026-09-01T00:15:00.000Z (45.0min); 1 unanswered ASK(s) to test-lead: fixture-ask-2"',
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
    '| Work lost or stalled | 1 gap(s) over 30min: 2026-09-01T00:15:00.000Z (45.0min); 1 unanswered ASK(s) to test-lead: fixture-ask-2 |',
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
    '--out', 'o.md', '--json', 'o.json',
  ]);
  assert.deepEqual(opts, {
    record: 'r.md', census: 'c.json', specCensus: 's.json', ledger: 'l', git: 'g', branch: 'b',
    leadSession: 'ls', leadSlug: 'slug', out: 'o.md', json: 'o.json',
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
