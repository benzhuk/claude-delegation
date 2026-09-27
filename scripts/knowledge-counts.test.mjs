// node --test scripts/knowledge-counts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  knowledgeCounts, countTopics, countPending, countReads, inboxDateRange,
  storeDir, inboxDir, readLogPath, READ_WINDOW_MS,
} from './knowledge-counts.mjs';

function tmpHome(prefix = 'knowledge-counts-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function mkStore(home, { topics = [], inbox = [], archive = [] } = {}) {
  const store = storeDir(home);
  fs.mkdirSync(store, { recursive: true });
  for (const name of topics) fs.writeFileSync(path.join(store, name), '# topic\n');
  const inboxD = inboxDir(home);
  fs.mkdirSync(inboxD, { recursive: true });
  for (const name of inbox) fs.writeFileSync(path.join(inboxD, name), 'note\n');
  if (archive.length) {
    const archiveD = path.join(inboxD, '_archive');
    fs.mkdirSync(archiveD, { recursive: true });
    for (const name of archive) fs.writeFileSync(path.join(archiveD, name), 'archived\n');
  }
}

function writeLog(home, lines) {
  const p = readLogPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, lines.join('\n') + (lines.length ? '\n' : ''));
}

test('absent store: storeExists false, everything zero/null', () => {
  const home = tmpHome();
  const c = knowledgeCounts(home, Date.now());
  assert.deepEqual(c, { topics: 0, pending: 0, oldest: null, reads: 0, storeExists: false });
});

test('T excludes INDEX.md and any name starting with underscore, counts markdown only', () => {
  const home = tmpHome();
  mkStore(home, { topics: ['ai-sdk.md', 'orca.md', 'INDEX.md', '_private.md', 'notes.txt'] });
  assert.equal(countTopics(home), 2);
  assert.equal(knowledgeCounts(home, Date.now()).topics, 2);
});

test('a directory in the store top level is not counted as a topic', () => {
  const home = tmpHome();
  mkStore(home, { topics: ['ai-sdk.md'] });
  fs.mkdirSync(path.join(storeDir(home), 'sub.md'));
  assert.equal(countTopics(home), 1);
});

test('P counts inbox files, excludes _archive/ entirely and dotfiles', () => {
  const home = tmpHome();
  mkStore(home, {
    inbox: ['2026-09-01-a.md', '2026-09-05-b.md', '.hidden.md'],
    archive: ['2026-01-01-old.md'],
  });
  const { pending, oldest } = countPending(home);
  assert.equal(pending, 2);
  assert.equal(oldest, '2026-09-01');
});

test('oldest falls back to mtime when the filename carries no date prefix', () => {
  const home = tmpHome();
  mkStore(home, { inbox: ['no-date-name.md'] });
  const old = new Date('2026-01-15T00:00:00Z').getTime();
  fs.utimesSync(path.join(inboxDir(home), 'no-date-name.md'), old / 1000, old / 1000);
  const { pending, oldest } = countPending(home);
  assert.equal(pending, 1);
  assert.equal(oldest, '2026-01-15');
});

test('inboxDateRange reuses the same scan and reports oldest and newest', () => {
  const home = tmpHome();
  mkStore(home, { inbox: ['2026-09-10-a.md', '2026-09-01-b.md', '2026-09-20-c.md'] });
  assert.deepEqual(inboxDateRange(home), { oldest: '2026-09-01', newest: '2026-09-20' });
});

test('empty inbox: pending 0, oldest null', () => {
  const home = tmpHome();
  mkStore(home, {});
  assert.deepEqual(countPending(home), { pending: 0, oldest: null });
});

test('R counts read.log lines within the 7-day window up to now, ignores older ones', () => {
  const home = tmpHome();
  mkStore(home);
  const now = Date.parse('2026-09-27T12:00:00Z');
  writeLog(home, [
    `${new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString()} Read /x/orca.md session-a`,
    `${new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString()} Read /x/react.md session-a`,
    `${new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString()} Read /x/css.md session-a`, // outside window
  ]);
  assert.equal(countReads(home, now), 2);
  assert.equal(knowledgeCounts(home, now).reads, 2);
});

test('R exact boundary: exactly 7 days old still counts, older does not', () => {
  const home = tmpHome();
  mkStore(home);
  const now = Date.parse('2026-09-27T12:00:00Z');
  writeLog(home, [
    `${new Date(now - READ_WINDOW_MS).toISOString()} Read /x/orca.md s`,
    `${new Date(now - READ_WINDOW_MS - 1000).toISOString()} Read /x/orca.md s`,
  ]);
  assert.equal(countReads(home, now), 1);
});

test('a malformed read.log line is skipped, never thrown on', () => {
  const home = tmpHome();
  mkStore(home);
  const now = Date.now();
  writeLog(home, [
    'not-a-timestamp Read /x/orca.md session-a',
    '',
    `${new Date(now).toISOString()} Read /x/orca.md session-b`,
  ]);
  assert.equal(countReads(home, now), 1);
});

test('missing read.log: R is 0, not an error', () => {
  const home = tmpHome();
  mkStore(home);
  assert.equal(countReads(home, Date.now()), 0);
});

test('a symlinked topic file still counts; a broken symlink does not crash the count', () => {
  const home = tmpHome();
  mkStore(home, { topics: ['real.md'] });
  const store = storeDir(home);
  try {
    fs.symlinkSync(path.join(store, 'real.md'), path.join(store, 'linked.md'));
    fs.symlinkSync(path.join(store, 'does-not-exist.md'), path.join(store, 'broken.md'));
  } catch {
    return; // symlink privilege unavailable on this host (common on Windows without dev mode); skip
  }
  assert.equal(countTopics(home), 2); // real.md + linked.md; broken.md excluded
});

test('a symlinked store directory itself is still read as the store', () => {
  const outer = tmpHome();
  const real = tmpHome('knowledge-counts-real-');
  mkStore(real, { topics: ['orca.md'] });
  const claudeDir = path.join(outer, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  try {
    fs.symlinkSync(path.join(real, '.claude', 'knowledge'), path.join(claudeDir, 'knowledge'), 'junction');
  } catch {
    return; // symlink privilege unavailable; skip
  }
  assert.equal(knowledgeCounts(outer, Date.now()).topics, 1);
});

test('a path containing "knowledge" but outside the store is never consulted', () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, 'Code', 'knowledge-base'), { recursive: true });
  fs.writeFileSync(path.join(home, 'Code', 'knowledge-base', 'x.md'), 'not a topic\n');
  // no .claude/knowledge at all under home
  assert.equal(knowledgeCounts(home, Date.now()).storeExists, false);
});
