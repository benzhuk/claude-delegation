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
  assert.equal(fields['lead-session'], 'fixture-lead-session-id');
  assert.equal(fields['spec-session'], 'fixture-spec-session-id');
  assert.equal(fields['spec-from'], '2026-08-31T23:00:00.000Z');
  assert.equal(logs.filter((l) => l.status === 'accepted').length, 2);
  assert.equal(logs[0].at, '2026-09-02T00:00:00.000Z');
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

test('computeTopTierTokens: census present, no spec-census, Spec-session/Spec-from present in the record -> partial with the "not run" reason', () => {
  const census = { combined: { 'claude-opus-5-5': { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 2, output_tokens: 3 } } };
  const r = computeTopTierTokens(census, null, { 'spec-session': 'x', 'spec-from': 'y' });
  assert.match(r.value, /^6 tokens: build 6 \(claude-opus-5-5\) \(partial: no spec slice — spec-census not run\)$/);
});

test('computeTopTierTokens: Spec-session/Spec-from missing from the record names that reason instead', () => {
  const census = { combined: {} };
  const r = computeTopTierTokens(census, null, {});
  assert.match(r.value, /Spec-session:\/Spec-from: missing from record/);
});

test('computeTopTierTokens: no top-tier model matched is named, not silently zero', () => {
  const census = { combined: { 'claude-sonnet-5': { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } } };
  const r = computeTopTierTokens(census, null, {});
  assert.match(r.value, /no top-tier model matched/);
});

test('computeTopTierTokens: a spec-census combines the build slice and the spec slice into one total', () => {
  const census = { combined: { 'claude-opus-5-5': { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } } };
  const specCensus = { combined: { 'claude-opus-5-5': { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } } };
  const r = computeTopTierTokens(census, specCensus, {});
  assert.match(r.value, /^15 tokens: build 10 \(claude-opus-5-5\) \+ spec slice 5$/);
});

test('computeTopTierTokens: DELEGATION_TOP_TIER overrides the default fable,opus tier list', (t) => {
  t.after(() => delete process.env.DELEGATION_TOP_TIER);
  process.env.DELEGATION_TOP_TIER = 'sonnet';
  const census = { combined: { 'claude-sonnet-5': { input_tokens: 7, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } } };
  const r = computeTopTierTokens(census, null, {});
  assert.match(r.value, /^7 tokens: build 7/);
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
  const logs = [{ status: 'accepted', at: '2026-01-01T02:00:00.000Z', note: '' }];
  const r = computeHoursAskToAccepted(fields, logs, null);
  assert.equal(r.value, '2.0h; gap unavailable (no lead transcript)');
});

test('computeHoursAskToAccepted: fewer than 2 messages in the window -> gap unavailable, hours still print', () => {
  const fields = { opened: '2026-01-01T00:00:00.000Z' };
  const logs = [{ status: 'accepted', at: '2026-01-01T02:00:00.000Z', note: '' }];
  const r = computeHoursAskToAccepted(fields, logs, [Date.parse('2026-01-01T01:00:00.000Z')]);
  assert.equal(r.value, '2.0h; gap unavailable (fewer than 2 lead messages in window)');
});

test('computeHoursAskToAccepted: on the fixture record + lead session, prints 24.0h and the 45min gap', () => {
  const { fields, logs } = parseRecordText(fs.readFileSync(RECORD, 'utf8'));
  const ts = scanTimestamps(fs, LEAD);
  const r = computeHoursAskToAccepted(fields, logs, ts);
  assert.equal(r.value, '24.0h; largest gap 45.0min at 2026-09-01T00:15:00.000Z');
});

// ── computeReworkAfterAcceptance (number 3) ─────────────────────────────────

test('computeReworkAfterAcceptance: no Base:/accepted sha/--git -> unavailable (no range)', () => {
  assert.equal(computeReworkAfterAcceptance({}, [], null).value, 'unavailable (no range)');
  assert.equal(computeReworkAfterAcceptance({ base: 'x' }, [], 'C:/some/dir').value, 'unavailable (no range)');
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

test('computeReworkAfterAcceptance: base == accepted (no changed files) -> unavailable (no range)', () => {
  const dir = mkTmp('four-read-git-norange-');
  initRepo(dir);
  const iso = new Date().toISOString();
  const sha = commit(dir, 'a.txt', 'x', 'chore: only commit', iso);
  const fields = { base: sha };
  const logs = [{ status: 'accepted', at: iso, owner: 'x', note: `artifact ${sha}` }];
  assert.equal(computeReworkAfterAcceptance(fields, logs, dir, 'HEAD').value, 'unavailable (no range)');
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

test('computeWorkLostOrStalled: no Opened:/accepted window -> unavailable', () => {
  assert.equal(computeWorkLostOrStalled(null, null, null, { openedMs: null, acceptedMs: null }).value, 'unavailable (no Opened:)');
  assert.equal(computeWorkLostOrStalled(null, null, null, { openedMs: 1, acceptedMs: null }).value, 'unavailable (no accepted Log: entry)');
});

test('computeWorkLostOrStalled: no --lead-slug -> ASKs part is explicitly unavailable, gaps part still computes', () => {
  const r = computeWorkLostOrStalled([1000, 2000], null, null, { openedMs: 0, acceptedMs: 3000 });
  assert.match(r.value, /^0 gaps over 30min; ASKs unavailable \(no --lead-slug\)$/);
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

  assert.equal(report.leadSession.id, 'fixture-lead-session-id');
  assert.equal(report.leadSession.source, 'record');
  assert.equal(report.numbers.length, 4);
  assert.deepEqual(report.numbers.map((n) => n.key), ['topTierTokensPerBuild', 'hoursAskToAccepted', 'reworkAfterAcceptance', 'workLostOrStalled']);
  assert.match(report.numbers[0].value, /^193 tokens: build 193 \(claude-opus-5-5\)/);
  assert.equal(report.numbers[1].value, '24.0h; largest gap 45.0min at 2026-09-01T00:15:00.000Z');
  assert.equal(report.numbers[2].value, 'unavailable (no range)'); // no --git given
  assert.match(report.numbers[3].value, /1 unanswered ASK\(s\) to test-lead: fixture-ask-2/);
  assert.equal(report.companions.length, 2);
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
