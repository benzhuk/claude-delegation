import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readInboxes } from '../skills/multi/scripts/transport.mjs';
import { SESSION_META_MAX_BYTES, isConfirmedCodexChild, runCodexHook } from './multi-codex-hook.mjs';

const LEAD = '01a0c5f8-1865-7d93-9ff3-38793062f1ee';
const CHILD = '01a0d099-9b5f-7cb3-be77-6a827340ab32';
const NOW = Date.UTC(2026, 8, 23, 19, 30);

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-child-hook-')); }

function metadata({ id = CHILD, sessionId = LEAD, parent = LEAD, depth = 1, source, padding = '' } = {}) {
  return `${JSON.stringify({
    type: 'session_meta',
    payload: { id, session_id: sessionId, source: source ?? { subagent: { thread_spawn: { parent_thread_id: parent, depth } } }, padding },
  })}\n`;
}

function transcript(root, content = metadata()) {
  const file = path.join(root, 'session.jsonl');
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

function notes() {
  return {
    slug: 'lead', count: 1, problems: [], scanned: [],
    notes: [{ id: 'peer-work-1', from: 'peer', to: 'lead', kind: 'ASK', line: 'peer → lead, 9.23.26 19:30 NYC [peer-work-1] ASK: review.', details: null, packetExists: null, packetPath: null, ymd: '2026-09-23' }],
  };
}

test('confirmed child metadata suppresses inherited parent handle registration and inbox work', async (t) => {
  const home = tmp(); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.agents', 'notes'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'notes', 'panes.json'), JSON.stringify({ term_parent: { slug: 'lead' } }));
  let reads = 0;
  const out = await runCodexHook(
    { hook_event_name: 'UserPromptSubmit', session_id: LEAD, agent_id: CHILD, transcript_path: transcript(home, metadata({ padding: 'x'.repeat(24 * 1024) })), cwd: '/project' },
    { home, env: { NOTE_SLUG: 'lead', ORCA_TERMINAL_HANDLE: 'term_parent', CODEX_HOME: '/codex-parent' }, now: NOW, inbox: async () => { reads += 1; return notes(); } },
  );
  assert.equal(out, null);
  assert.equal(reads, 0);
  assert.deepEqual(readInboxes(home), {});
});

test('lead, missing metadata, corrupt metadata, and mismatched metadata preserve the current hook path', async (t) => {
  const cases = [
    ['lead', LEAD, metadata({ id: LEAD, sessionId: LEAD, source: 'cli' })],
    ['missing', CHILD, null],
    ['corrupt', CHILD, '{not json}\n'],
    ['mismatched', CHILD, metadata({ id: LEAD })],
  ];
  for (const [name, sessionId, content] of cases) {
    const home = tmp(); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const input = { hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: '/project' };
    if (content !== null) input.transcript_path = transcript(home, content);
    let reads = 0;
    const out = await runCodexHook(input, {
      home, env: { NOTE_SLUG: 'lead', CODEX_HOME: '/codex-home' }, now: NOW,
      inbox: async () => { reads += 1; return notes(); },
    });
    assert.equal(reads, 1, name);
    assert.ok(out?.output?.hookSpecificOutput?.additionalContext, name);
    assert.equal(readInboxes(home).lead.threadId, sessionId, name);
  }
});

test('over-cap first metadata line is bounded, closed, and remains unknown', (t) => {
  const home = tmp(); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = transcript(home, 'x'.repeat(SESSION_META_MAX_BYTES + 1));
  assert.equal(isConfirmedCodexChild({ transcript_path: file, session_id: CHILD }), false);

  let largestAllocation = 0;
  let closed = 0;
  const fakeFs = {
    openSync: () => 7,
    readSync(_fd, buffer) {
      largestAllocation = Math.max(largestAllocation, buffer.length);
      buffer.fill(0x78);
      return buffer.length;
    },
    closeSync: () => { closed += 1; },
  };
  assert.equal(isConfirmedCodexChild({ transcript_path: '/private/transcript', session_id: CHILD }, fakeFs), false);
  assert.ok(largestAllocation <= 8 * 1024);
  assert.equal(closed, 1);
});

test('qualified native vscode lead enables the Codex continuation profile by default', async (t) => {
  const home = tmp(); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = transcript(home, metadata({ id: LEAD, sessionId: LEAD, source: 'vscode' }));
  let seen = null;
  const out = await runCodexHook({
    hook_event_name: 'Stop', session_id: LEAD, transcript_path: file,
    turn_id: 'turn-native', stop_hook_active: false, cwd: '/project',
  }, {
    home, env: {}, handleContinuationEvent: async (event) => { seen = event; return null; },
  });
  assert.equal(out, null);
  assert.equal(seen?.role, 'lead');
  assert.equal(seen?.profile, 'codex-native-turn-v1');
  assert.equal(seen?.episodeKey, 'turn-native');
  assert.equal(seen?.cancellationVerified, true);
});
