// node --test scripts/work-census.test.mjs
//
// Fixtures are hand-written `.record.md` files under a fresh mkdtempSync temp dir (never
// the real docs/work), read through scripts/work-record.mjs's own listRecords — this file
// never re-implements record parsing. No child process is spawned anywhere in this file,
// so childEnv() does not apply.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { listRecords } from './work-record.mjs';
import * as workCensus from './work-census.mjs';
import { parseArgs, computeWorkCensus, formatText, main } from './work-census.mjs';

const tracked = [];
function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}
after(() => {
  for (const d of tracked) fs.rmSync(d, { recursive: true, force: true });
});

// t1: one round, reaches accepted.
const T1 = `Work: wr-2026-01-01-census-t1
Opened: 2026-01-01T00:00:00.000Z
Log: 2026-01-01T00:00:00.000Z runnable none
Log: 2026-01-01T00:10:00.000Z owned builder-1 spawned
Log: 2026-01-01T00:20:00.000Z delivered builder-1 artifact abc123
Log: 2026-01-01T00:20:01.000Z owned orchestrator agent-exited artifact abc123
Log: 2026-01-01T00:25:00.000Z reviewed orchestrator artifact abc123
Log: 2026-01-01T00:30:00.000Z accepted lead artifact abc123
`;

// t2: two rounds (Rounds: field given explicitly), never accepted. Carries TWO `reviewed`
// lines — an interim one mid-log and the final one — specifically so a fallback to the
// LAST reviewed line is distinguishable from a fallback to the FIRST one (M3: with only
// one `reviewed` line, first and last are the same timestamp and the elapsed test below
// could not tell a correct implementation from a `firstOfStatus` mutant).
const T2 = `Work: wr-2026-01-01-census-t2
Opened: 2026-01-01T01:00:00.000Z
Rounds: 2
Log: 2026-01-01T01:00:00.000Z runnable none
Log: 2026-01-01T01:05:00.000Z owned builder-2 spawned
Log: 2026-01-01T01:15:00.000Z delivered builder-2 artifact def456
Log: 2026-01-01T01:15:01.000Z owned orchestrator agent-exited artifact def456
Log: 2026-01-01T01:17:00.000Z rejected orchestrator needs-fixes
Log: 2026-01-01T01:17:01.000Z owned builder-2 respawned
Log: 2026-01-01T01:20:00.000Z reviewed orchestrator interim
Log: 2026-01-01T01:25:00.000Z delivered builder-2 artifact ghi789
Log: 2026-01-01T01:25:01.000Z owned orchestrator agent-exited artifact ghi789
Log: 2026-01-01T01:30:00.000Z reviewed orchestrator artifact ghi789
`;

// t3: still runnable/unowned, only one Log line — no reviewed or accepted line, so
// elapsed must fall back to null rather than guess.
const T3 = `Work: wr-2026-01-01-census-t3
Opened: 2026-01-01T02:00:00.000Z
Log: 2026-01-01T02:00:00.000Z runnable none
`;

// t4: rounds fallback with a NON-ADJACENT owned -> delivered pair (an interim `reviewed`
// line sits between them). No `Rounds:` field, so the fallback path is exercised.
const T4 = `Work: wr-2026-01-01-census-t4
Opened: 2026-01-01T03:00:00.000Z
Log: 2026-01-01T03:00:00.000Z runnable none
Log: 2026-01-01T03:05:00.000Z owned builder-4 spawned
Log: 2026-01-01T03:07:00.000Z reviewed orchestrator interim-note
Log: 2026-01-01T03:10:00.000Z delivered builder-4 artifact xyz111
`;

// t6: has a `reviewed` line but no `Opened:` field at all.
const T6_NO_OPENED = `Work: wr-2026-01-01-census-t6
Log: 2026-01-01T05:00:00.000Z runnable none
Log: 2026-01-01T05:05:00.000Z owned builder-6 spawned
Log: 2026-01-01T05:10:00.000Z delivered builder-6 artifact bbb222
Log: 2026-01-01T05:15:00.000Z reviewed orchestrator artifact bbb222
`;

function writeFixtures(dir, files) {
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), text, 'utf8');
  }
  return listRecords(dir);
}

// ── parseArgs ────────────────────────────────────────────────────────────────

test('parseArgs: defaults to docs/work, accepts one positional dir and --out', () => {
  assert.deepEqual(parseArgs([]), { dir: 'docs/work', out: null });
  assert.deepEqual(parseArgs(['docs/other']), { dir: 'docs/other', out: null });
  assert.deepEqual(parseArgs(['docs/other', '--out', 'r.md']), { dir: 'docs/other', out: 'r.md' });
});

test('parseArgs: an unknown flag throws', () => {
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

test('parseArgs: a second positional argument throws', () => {
  assert.throws(() => parseArgs(['a', 'b']), /unexpected argument/);
});

test('parseArgs: a trailing --out with no value throws instead of silently being ignored', () => {
  assert.throws(() => parseArgs(['docs/work', '--out']), /--out needs a value/);
});

// ── per-record timings ───────────────────────────────────────────────────────

test('per-record: opened / first-owned / first-delivered / first-reviewed / first-accepted, file order', () => {
  const dir = mkTmp('work-census-basic-');
  const records = writeFixtures(dir, { 't1.record.md': T1 });
  const { perWork } = computeWorkCensus(records);
  const r = perWork.find((x) => x.work === 'wr-2026-01-01-census-t1');
  assert.equal(r.opened, '2026-01-01T00:00:00.000Z');
  assert.equal(r.firstOwned, '2026-01-01T00:10:00.000Z');
  assert.equal(r.firstDelivered, '2026-01-01T00:20:00.000Z');
  assert.equal(r.firstReviewed, '2026-01-01T00:25:00.000Z');
  assert.equal(r.firstAccepted, '2026-01-01T00:30:00.000Z');
});

test('rounds: falls back to counting owned -> delivered transitions when Rounds: is absent', () => {
  const dir = mkTmp('work-census-rounds-fallback-');
  const records = writeFixtures(dir, { 't1.record.md': T1 });
  const { perWork } = computeWorkCensus(records);
  assert.equal(perWork[0].rounds, 1);
});

test('rounds: uses the Rounds: field when present, even though the fallback count agrees here', () => {
  const dir = mkTmp('work-census-rounds-field-');
  const records = writeFixtures(dir, { 't2.record.md': T2 });
  const { perWork } = computeWorkCensus(records);
  assert.equal(perWork[0].rounds, 2);
});

test('rounds: the fallback counts a NON-ADJACENT owned -> delivered transition (an interim status line in between), not just adjacent Log lines', () => {
  const dir = mkTmp('work-census-rounds-nonadjacent-');
  const records = writeFixtures(dir, { 't4.record.md': T4 });
  const { perWork } = computeWorkCensus(records);
  assert.equal(perWork[0].rounds, 1, 'owned -> reviewed(interim) -> delivered is still one round');
});

// dispatch latency and idle minutes were retired per the M4 ruling
// (docs/notes/skills-fable-loop-build-3.md:8-9): both measured the lead's hand dispatch,
// which the loop deletes by construction, and `Log:` lines can never carry a real
// spawn-time stamp honestly enough to quote. These assertions guard the DATA path, not
// just the printed output — a builder who only stopped `md.push`-ing the old sections
// while leaving the dead computation in place would still fail these.
test('dispatch latency: the field and its computation are gone from perWorkReport, not merely unprinted', () => {
  const dir = mkTmp('work-census-latency-removed-');
  const records = writeFixtures(dir, { 't1.record.md': T1, 't2.record.md': T2 });
  const { perWork } = computeWorkCensus(records);
  for (const r of perWork) {
    assert.equal(r.dispatchLatencies, undefined);
    assert.equal(r.dispatchLatencySumMs, undefined);
  }
});

test('idle minutes: idleMsAcrossRecords is no longer exported or callable, and computeWorkCensus no longer reports idleMinutes', () => {
  assert.equal(workCensus.idleMsAcrossRecords, undefined, 'idleMsAcrossRecords must not be exported at all');
  const dir = mkTmp('work-census-idle-removed-');
  const records = writeFixtures(dir, { 't1.record.md': T1 });
  const report = computeWorkCensus(records);
  assert.equal(report.idleMinutes, undefined);
  assert.ok(!('idleMinutes' in report), 'idleMinutes must not be a key on the report at all');
});

test('elapsed: opened -> accepted when an accepted line exists', () => {
  const dir = mkTmp('work-census-elapsed-accepted-');
  const records = writeFixtures(dir, { 't1.record.md': T1 });
  const { perWork } = computeWorkCensus(records);
  const r = perWork[0];
  assert.equal(r.elapsedMs, 30 * 60 * 1000); // 00:00:00 -> 00:30:00
  assert.equal(r.elapsedLabel, '(to accepted)');
});

test('elapsed: falls back to opened -> the LAST reviewed line, labeled "(to reviewed)", when there is no accepted line (the common case)', () => {
  const dir = mkTmp('work-census-elapsed-reviewed-');
  const records = writeFixtures(dir, { 't2.record.md': T2 });
  const { perWork } = computeWorkCensus(records);
  const r = perWork[0];
  assert.equal(r.elapsedMs, 30 * 60 * 1000); // 01:00:00 -> 01:30:00 (last reviewed, not the first)
  assert.equal(r.elapsedLabel, '(to reviewed)');
});

test('elapsed: a record with neither a reviewed nor an accepted line reports null, not a blank guess', () => {
  const dir = mkTmp('work-census-elapsed-none-');
  const records = writeFixtures(dir, { 't3.record.md': T3 });
  const { perWork } = computeWorkCensus(records);
  const r = perWork[0];
  assert.equal(r.elapsedMs, null);
  assert.equal(r.elapsedLabel, '(no reviewed or accepted line)');
});

test('elapsed: a record with a reviewed line but no Opened: field is labeled for the field that is actually missing', () => {
  const dir = mkTmp('work-census-elapsed-no-opened-');
  const records = writeFixtures(dir, { 't6.record.md': T6_NO_OPENED });
  const { perWork } = computeWorkCensus(records);
  const r = perWork[0];
  assert.equal(r.elapsedMs, null);
  assert.equal(r.elapsedLabel, '(no Opened: field)', 'not "(no reviewed or accepted line)" — that line exists, Opened: does not');
  assert.equal(r.elapsedEndAt, '2026-01-01T05:15:00.000Z');
});

// ── CLI ──────────────────────────────────────────────────────────────────

test('main(): reads the given dir, writes a report to --out, and prints only "wrote: <path>"', async () => {
  const dir = mkTmp('work-census-cli-');
  writeFixtures(dir, { 't1.record.md': T1, 't2.record.md': T2, 't3.record.md': T3 });
  const outPath = path.join(dir, 'report.md');
  const printed = [];
  const code = await main([dir, '--out', outPath], { write: (s) => printed.push(s) });
  assert.equal(code, 0);
  assert.deepEqual(printed, [`wrote: ${outPath}`]);
  const written = fs.readFileSync(outPath, 'utf8');
  assert.ok(written.includes('wr-2026-01-01-census-t1'));
  assert.ok(written.includes('wr-2026-01-01-census-t2'));
  assert.ok(!written.includes('Dispatch latency'), 'the retired section header must never print');
  assert.ok(!written.includes('Idle minutes'), 'the retired section header must never print');
});

test('main(): without --out, the full report goes to the write() sink', async () => {
  const dir = mkTmp('work-census-cli-stdout-');
  writeFixtures(dir, { 't1.record.md': T1 });
  const printed = [];
  await main([dir], { write: (s) => printed.push(s) });
  assert.equal(printed.length, 1);
  assert.ok(printed[0].startsWith('# Work census'));
});

test('formatText: renders a header row for every record', () => {
  const dir = mkTmp('work-census-format-');
  const records = writeFixtures(dir, { 't1.record.md': T1, 't2.record.md': T2 });
  const text = formatText(computeWorkCensus(records));
  assert.ok(text.includes('wr-2026-01-01-census-t1'));
  assert.ok(text.includes('wr-2026-01-01-census-t2'));
});

test('the retired measures are absent from the SOURCE, not merely from the returned object', () => {
  const src = fs.readFileSync(new URL('./work-census.mjs', import.meta.url), 'utf8');
  // Identifiers only — the top-of-file comment names the retired measures in prose, which is
  // the point of it; a surviving *identifier* means the dead computation is still there.
  for (const ident of ['dispatchLatencies', 'dispatchLatencySumMs', 'idleMsAcrossRecords', 'idleMinutes']) {
    assert.ok(!src.includes(ident), `${ident} must not survive anywhere in work-census.mjs`);
  }
});
