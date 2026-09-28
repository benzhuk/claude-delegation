// node --test scripts/four-read.completeness.test.mjs
//
// census-completeness (lane 38): the "Work lost or stalled" row also prints wakes, Stop-blocks and
// stall nudges received. The fixture lead transcript and ledger are build-census's own
// (scripts/build-census.fixtures/completeness/), so each count is exactly 1 (wakes: 1 note-flush + 1 Done-tick).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCensus } from './build-census.mjs';
import { buildFourRead, collectLedgerEntries, countStallNudges, computeCompletenessSuffix } from './four-read.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEAD_FIXTURE = path.join(HERE, 'build-census.fixtures', 'completeness', 'lead.jsonl');
const LEDGER = path.join(HERE, 'build-census.fixtures', 'completeness', 'ledger');
const RECORD_FIXTURE = path.join(HERE, 'fixtures', 'four-read', 'record.md');

const tracked = [];
after(() => { for (const d of tracked) fs.rmSync(d, { recursive: true, force: true }); });

// A record whose Lead-session is the fixture file's basename and whose window is the fixture's hour.
async function setup({ opened = '2026-09-27T12:00:00.000Z', accepted = '2026-09-27T13:00:00.000Z', mutateCensus = (c) => c } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'four-read-completeness-'));
  tracked.push(dir);
  const lead = path.join(dir, 'completeness-lead.jsonl');
  fs.copyFileSync(LEAD_FIXTURE, lead);
  const record = path.join(dir, 'record.md');
  fs.writeFileSync(record, fs.readFileSync(RECORD_FIXTURE, 'utf8')
    .replace(/^Lead-session:.*$/m, 'Lead-session: completeness-lead')
    .replace(/^Opened:.*$/m, `Opened: ${opened}`)
    .replace(/^Log: 2026-09-01T00:30:00.000Z .*$/m, `Log: ${opened} owned test-owner picked up the build`)
    .replace(/^Log: 2026-09-02T00:00:00.000Z accepted .*$/m, `Log: ${accepted} accepted test-owner artifact abcdef01234567890123456789012345abcdef0`)
    .replace(/^Log: 2026-09-02T01:00:00.000Z accepted .*$/m, ''));
  const census = mutateCensus(await runCensus({ lead, tasksDirs: [], marker: null, ledgerDir: LEDGER, leadSlug: 'skills-o' }));
  const censusPath = path.join(dir, 'census.json');
  fs.writeFileSync(censusPath, JSON.stringify(census));
  return { record, censusPath };
}
const row = (report) => report.numbers.find((n) => n.key === 'workLostOrStalled').value;

test('the L row prints wakes, Stop-blocks and stall nudges, each exactly 1, after the stalled integer', async () => {
  const { record, censusPath } = await setup();
  const value = row(buildFourRead({ record, census: censusPath, ledger: LEDGER, leadSlug: 'skills-o' }, fs));
  assert.match(value, /^\d+ gap\(s\) over 30min stalled/, 'the leading integer stays first (work-record.mjs parses it)');
  assert.match(value, /; wakes 2 \(1 note-flush, 1 Done-tick\); Stop-blocks 1; stall nudges 1 to skills-o: collect-netcup-stall-build-fixture-1-abc1234-1$/);
});

test('without a slug or ledger the stall-nudge count says why; wakes and Stop-blocks still print', async () => {
  const { record, censusPath } = await setup();
  const noSlug = row(buildFourRead({ record, census: censusPath, ledger: LEDGER }, fs));
  assert.match(noSlug, /; wakes 2 \(1 note-flush, 1 Done-tick\); Stop-blocks 1; stall nudges unavailable \(no --lead-slug\)$/);
  const noLedger = row(buildFourRead({ record, census: censusPath, leadSlug: 'skills-o' }, fs));
  assert.match(noLedger, /; stall nudges unavailable \(no ledger dir\)$/);
  const strangerSlug = row(buildFourRead({ record, census: censusPath, ledger: LEDGER, leadSlug: 'not-in-ledger' }, fs));
  assert.match(strangerSlug, /; stall nudges unavailable \(slug not-in-ledger not in ledger\)$/);
});

test('stall nudges are counted over the record window, not the census window', async () => {
  // 12:00Z..12:15Z: the 12:20Z nudge is outside; the census still covers the whole fixture, so wakes and
  // Stop-blocks are refused as "not the build window" only if the census window ends past the acceptance.
  const { record, censusPath } = await setup({ accepted: '2026-09-27T12:15:00.000Z' });
  const value = row(buildFourRead({ record, census: censusPath, ledger: LEDGER, leadSlug: 'skills-o' }, fs));
  assert.match(value, /stall nudges 0 to skills-o$/);
  assert.match(value, /wakes unavailable \(census window ends 2026-09-27T12:59:00.000Z, after the last acceptance\); Stop-blocks unavailable/);
});

test('a census that predates the counts, or a Codex census, is unavailable rather than zero', async () => {
  const old = await setup({ mutateCensus: (c) => { delete c.lead.wakes; delete c.lead.stopBlocks; return c; } });
  assert.match(row(buildFourRead({ record: old.record, census: old.censusPath, ledger: LEDGER, leadSlug: 'skills-o' }, fs)), /; wakes unavailable \(census predates wake\/Stop-block counts\); Stop-blocks unavailable \(census predates wake\/Stop-block counts\); stall nudges 1 to skills-o/);
  assert.match(computeCompletenessSuffix(null, null, null, { openedMs: null, acceptedMs: null }, null), /wakes unavailable \(no census\)/);
});

test('a Codex census prints its wakes and stall nudges, and Stop-blocks as unavailable with the stated reason', async () => {
  const CODEX_FIXTURE = path.join(HERE, 'build-census.fixtures', 'completeness', 'codex-lead.jsonl');
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'four-read-codex-home-'));
  tracked.push(codexHome);
  const census = await runCensus({ lead: CODEX_FIXTURE, tasksDirs: [], marker: null, ledgerDir: LEDGER, leadSlug: 'skills-o', codexHome });
  assert.equal(census.lead.host, 'codex');
  const entries = collectLedgerEntries(LEDGER, fs);
  const openedMs = Date.parse('2026-09-27T12:00:00.000Z');
  const acceptedMs = Date.parse('2026-09-27T13:00:00.000Z');
  const value = computeCompletenessSuffix(census, entries, 'skills-o', { openedMs, acceptedMs, reason: null }, acceptedMs);
  assert.match(value, /^wakes 2 \(1 note-flush, 1 Done-tick\); Stop-blocks unavailable \(no Codex rollout record of a Stop-hook block is established; the Stop reason appears only inside tool output\); stall nudges 1 to skills-o: collect-netcup-stall-build-fixture-1-abc1234-1$/);
});

test('countStallNudges: collect-*-stall-* ids to the slug, inside the window, and nothing else', () => {
  const entries = collectLedgerEntries(LEDGER, fs);
  const from = Date.parse('2026-09-27T12:00:00Z');
  const to = Date.parse('2026-09-27T13:00:00Z');
  assert.deepEqual(countStallNudges(entries, 'skills-o', from, to), { count: 1, ids: ['collect-netcup-stall-build-fixture-1-abc1234-1'] });
  assert.equal(countStallNudges(entries, 'skills-o', Date.parse('2026-09-27T09:00:00Z'), to).count, 2, 'the 10:00Z nudge joins when the window opens earlier');
  assert.ok(!countStallNudges(entries, 'skills-o', from, to).ids.includes('skills-fable-stall-review-1'), 'a peer note whose topic merely contains stall is not a nudge (pins the ^collect-.+-stall- anchor)');
  assert.equal(countStallNudges(entries, 'skills-fable', from, to).count, 0, 'an ordinary note that names a stall id is not a stall nudge');
  assert.equal(countStallNudges(entries, 'collect-netcup', from, to).count, 0, 'the RESULT answering a nudge is not a nudge');
});
