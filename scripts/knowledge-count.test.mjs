// node --test scripts/knowledge-count.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';
import { parseArgs, buildReport, main } from './knowledge-count.mjs';
import { storeDir, inboxDir, readLogPath } from './knowledge-counts.mjs';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI = path.join(REPO, 'scripts', 'knowledge-count.mjs');

function tmpHome(prefix = 'knowledge-count-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function mkHome({ topics = [], inbox = [], readLines = [] } = {}) {
  const home = tmpHome();
  const store = storeDir(home);
  fs.mkdirSync(store, { recursive: true });
  for (const name of topics) fs.writeFileSync(path.join(store, name), '# topic\n');
  const inboxD = inboxDir(home);
  fs.mkdirSync(inboxD, { recursive: true });
  for (const name of inbox) fs.writeFileSync(path.join(inboxD, name), 'note\n');
  if (readLines.length) {
    const logPath = readLogPath(home);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, readLines.join('\n') + '\n');
  }
  return home;
}

// ─────────────────────────────────────────────────────────────────────────────
// parseArgs
// ─────────────────────────────────────────────────────────────────────────────

test('parseArgs: defaults, --since, --json, and an unknown flag throws', () => {
  assert.deepEqual(parseArgs([]), { since: null, json: false });
  assert.deepEqual(parseArgs(['--json']), { since: null, json: true });
  assert.deepEqual(parseArgs(['--since', '2026-09-01T00:00:00Z']), { since: '2026-09-01T00:00:00Z', json: false });
  assert.throws(() => parseArgs(['--since']), /needs an ISO timestamp/);
  assert.throws(() => parseArgs(['--since', 'not-a-date']), /not a parseable timestamp/);
  assert.throws(() => parseArgs(['--bogus']), /unknown argument/);
});

// ─────────────────────────────────────────────────────────────────────────────
// buildReport
// ─────────────────────────────────────────────────────────────────────────────

test('buildReport: absent store reports storeExists false and zeros, never throws', () => {
  const home = tmpHome();
  const r = buildReport(home, Date.now());
  assert.equal(r.storeExists, false);
  assert.equal(r.topics, 0);
  assert.equal(r.pending, 0);
  assert.equal(r.oldest, null);
  assert.equal(r.newest, null);
  assert.equal(r.reads, 0);
});

test('buildReport: the three counts of K2 plus the inbox date range', () => {
  const now = Date.parse('2026-09-27T12:00:00Z');
  const home = mkHome({
    topics: ['ai-sdk.md', 'orca.md', 'INDEX.md'],
    inbox: ['2026-09-01-a.md', '2026-09-20-b.md'],
    readLines: [`${new Date(now - 24 * 60 * 60 * 1000).toISOString()} Read /x/orca.md session-a`],
  });
  const r = buildReport(home, now);
  assert.equal(r.storeExists, true);
  assert.equal(r.topics, 2);
  assert.equal(r.pending, 2);
  assert.equal(r.oldest, '2026-09-01');
  assert.equal(r.newest, '2026-09-20');
  assert.equal(r.reads, 1);
  assert.equal(r.windowEnd, new Date(now).toISOString());
});

test('buildReport: --since recounts reads over a caller-given window, sharing the same log scan', () => {
  const now = Date.parse('2026-09-27T12:00:00Z');
  const home = mkHome({
    topics: ['orca.md'],
    readLines: [
      `${new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString()} Read /x/a.md s`, // 10 days ago
      `${new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()} Read /x/b.md s`, // 2 days ago
    ],
  });
  // Default (7-day) window: only the 2-day-old line counts.
  assert.equal(buildReport(home, now).reads, 1);
  // --since 15 days ago: both lines fall inside the window.
  const since = new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString();
  const wide = buildReport(home, now, since);
  assert.equal(wide.reads, 2);
  assert.equal(wide.windowStart, since);
});

// ─────────────────────────────────────────────────────────────────────────────
// main / output shaping
// ─────────────────────────────────────────────────────────────────────────────

test('main: text output names topics, pending (with range) and reads', async () => {
  const now = Date.parse('2026-09-27T12:00:00Z');
  const home = mkHome({ topics: ['orca.md', 'react.md'], inbox: ['2026-09-24-a.md'] });
  let out = '';
  const code = await main([], { homeDir: home, now, write: (s) => { out += s; } });
  assert.equal(code, 0);
  assert.match(out, /topics: 2/);
  assert.match(out, /inbox pending: 1 \(oldest 2026-09-24, newest 2026-09-24\)/);
  assert.match(out, /reads: 0/);
});

test('main: --json prints the same report as parseable JSON', async () => {
  const now = Date.parse('2026-09-27T12:00:00Z');
  const home = mkHome({ topics: ['orca.md'] });
  let out = '';
  await main(['--json'], { homeDir: home, now, write: (s) => { out += s; } });
  const parsed = JSON.parse(out);
  assert.equal(parsed.topics, 1);
  assert.equal(parsed.storeExists, true);
});

test('main: an absent store prints a plain sentence, not an error, and exits 0', async () => {
  const home = tmpHome();
  let out = '';
  const code = await main([], { homeDir: home, now: Date.now(), write: (s) => { out += s; } });
  assert.equal(code, 0);
  assert.match(out, /knowledge store not found/);
});

// ─────────────────────────────────────────────────────────────────────────────
// CLI as a real child process (N2: every spawn goes through childEnv)
// ─────────────────────────────────────────────────────────────────────────────

test('the CLI as a child process: real exit code, stdout carries the counts', () => {
  const home = mkHome({ topics: ['orca.md', 'react.md'], inbox: ['2026-09-24-a.md'] });
  const stdout = execFileSync(process.execPath, [CLI], {
    encoding: 'utf8', env: childEnv(home),
  });
  assert.match(stdout, /topics: 2/);
  assert.match(stdout, /inbox pending: 1/);
});

test('the CLI as a child process: --json is valid JSON on stdout', () => {
  const home = mkHome({ topics: ['orca.md'] });
  const stdout = execFileSync(process.execPath, [CLI, '--json'], {
    encoding: 'utf8', env: childEnv(home),
  });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.topics, 1);
});

test('the CLI as a child process: an unknown flag exits non-zero and says why on stderr', () => {
  const home = mkHome();
  let code = 0;
  let stderr = '';
  try {
    execFileSync(process.execPath, [CLI, '--nope'], { encoding: 'utf8', stdio: 'pipe', env: childEnv(home) });
  } catch (e) {
    code = e.status;
    stderr = e.stderr;
  }
  assert.notEqual(code, 0);
  assert.match(stderr, /unknown argument/);
});
