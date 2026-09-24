import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  TRANSCRIPT_ROW_MAX_BYTES, TRANSCRIPT_SCAN_MAX_BYTES, TRANSCRIPT_TAIL_MAX_BYTES,
  classifyCodexRole, continuationBindMarker,
  latestClaudeUser, normalizeClaudeContinuation, normalizeCodexContinuation,
} from './continuation-native.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'continuation-native-'));
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('Claude tail classifier excludes meta/tool_result rows and selects the latest true user', () => {
  const file = path.join(tmp(), 'transcript.jsonl');
  const rows = [
    { type: 'user', uuid: uuid(1), isMeta: false, message: { role: 'user', content: 'first' } },
    { type: 'user', uuid: uuid(2), isMeta: false, message: { role: 'user', content: [{ type: 'tool_result' }] } },
    { type: 'user', uuid: uuid(3), isMeta: true, message: { role: 'user', content: 'hidden' } },
    { type: 'user', uuid: uuid(4), isMeta: false, message: { role: 'user', content: 'second' } },
  ];
  fs.writeFileSync(file, rows.map(JSON.stringify).join('\n'));
  assert.deepEqual(latestClaudeUser({ transcript_path: file }), { uuid: uuid(4), parentUuid: null });
});

test('Claude backward scan uses positioned chunks and enforces the hard aggregate byte cap', () => {
  let largest = 0; let total = 0; let closed = 0;
  const fakeFs = {
    openSync: () => 7,
    fstatSync: () => ({ isFile: () => true, size: TRANSCRIPT_SCAN_MAX_BYTES + TRANSCRIPT_TAIL_MAX_BYTES }),
    readSync: (_fd, buffer, _offset, length) => {
      largest = Math.max(largest, buffer.length); total += length; buffer.fill(0x0a, 0, length); return length;
    },
    closeSync: () => { closed += 1; },
  };
  assert.equal(latestClaudeUser({ transcript_path: '/private/transcript' }, fakeFs), null);
  assert.equal(largest, TRANSCRIPT_TAIL_MAX_BYTES);
  assert.equal(total, TRANSCRIPT_SCAN_MAX_BYTES);
  assert.equal(closed, 1);
});

test('Claude scan reaches the true user beyond the old 64 KiB tail in an actual-sized transcript', () => {
  const file = path.join(tmp(), 'transcript.jsonl');
  const target = { type: 'user', uuid: uuid(5), isMeta: false, message: { role: 'user', content: 'continue' } };
  const padding = Array.from({ length: 90 }, (_, i) => ({ type: 'assistant', uuid: uuid(100 + i), message: { role: 'assistant', content: 'x'.repeat(980) } }));
  const later = [
    { type: 'user', uuid: uuid(6), isMeta: false, message: { role: 'user', content: [{ type: 'tool_result' }] } },
    { type: 'user', uuid: uuid(7), isMeta: true, message: { role: 'user', content: 'hidden' } },
  ];
  fs.writeFileSync(file, [...[target], ...padding, ...later].map(JSON.stringify).join('\n'));
  assert.ok(fs.statSync(file).size > TRANSCRIPT_TAIL_MAX_BYTES);
  assert.deepEqual(latestClaudeUser({ transcript_path: file }), { uuid: uuid(5), parentUuid: null });
});

test('Claude backward scan returns the latest true user, not an older valid episode', () => {
  const file = path.join(tmp(), 'transcript.jsonl');
  const rows = [
    { type: 'user', uuid: uuid(20), isMeta: false, message: { role: 'user', content: 'old' } },
    ...Array.from({ length: 70 }, () => ({ type: 'assistant', message: { role: 'assistant', content: 'x'.repeat(980) } })),
    { type: 'user', uuid: uuid(21), isMeta: false, message: { role: 'user', content: 'new' } },
    { type: 'assistant', message: { role: 'assistant', content: 'done' } },
  ];
  fs.writeFileSync(file, rows.map(JSON.stringify).join('\n'));
  assert.deepEqual(latestClaudeUser({ transcript_path: file }), { uuid: uuid(21), parentUuid: null });
});

test('Claude scan fails closed on an oversized or truncated row', () => {
  const dir = tmp();
  const oversized = path.join(dir, 'oversized.jsonl');
  fs.writeFileSync(oversized, `${JSON.stringify({ type: 'user', uuid: uuid(30), isMeta: false, message: { role: 'user', content: 'old' } })}\n${'x'.repeat(TRANSCRIPT_ROW_MAX_BYTES + 1)}`);
  assert.equal(latestClaudeUser({ transcript_path: oversized }), null);

  const truncated = path.join(dir, 'truncated.jsonl');
  fs.writeFileSync(truncated, `${JSON.stringify({ type: 'user', uuid: uuid(31), isMeta: false, message: { role: 'user', content: 'old' } })}\n{"type":"user"`);
  assert.equal(latestClaudeUser({ transcript_path: truncated }), null);
});

test('Claude normalizer bootstraps at prompt and keys tool/Stop to the true user UUID', () => {
  const file = path.join(tmp(), 'transcript.jsonl');
  fs.writeFileSync(file, '');
  const prompt = normalizeClaudeContinuation({ hook_event_name: 'UserPromptSubmit', session_id: 'session', transcript_path: file });
  assert.equal(prompt.role, 'lead');
  assert.equal(prompt.episodeKey, null);
  assert.match(prompt.eventKey, /^prompt:0:/);

  fs.writeFileSync(file, `${JSON.stringify({ type: 'user', uuid: uuid(9), isMeta: false, message: { role: 'user', content: 'go' } })}\n`);
  const stop = normalizeClaudeContinuation({ hook_event_name: 'Stop', session_id: 'session', transcript_path: file, stop_hook_active: false });
  assert.equal(stop.episodeKey, uuid(9));
  assert.equal(stop.eventKey, `Stop:${uuid(9)}`);
  assert.equal(stop.cancellation, false);
});

test('bind marker is accepted only as whole successful tool-response JSON', () => {
  const marker = { continuationBind: { requestId: 'request-1', epoch: 'epoch-1' } };
  assert.deepEqual(continuationBindMarker({ stdout: JSON.stringify(marker), stderr: '', interrupted: false }), marker.continuationBind);
  assert.equal(continuationBindMarker({ stdout: `prefix ${JSON.stringify(marker)}`, stderr: '' }), null);
  assert.equal(continuationBindMarker({ stdout: JSON.stringify(marker), stderr: 'failed' }), null);
  assert.equal(continuationBindMarker('continuationBind request-1 epoch-1'), null);
});

test('Codex role is tri-state and inherited/mismatched metadata never proves lead', () => {
  const dir = tmp(); const file = path.join(dir, 'rollout.jsonl'); const session = uuid(10);
  const write = (payload) => fs.writeFileSync(file, `${JSON.stringify({ type: 'session_meta', payload })}\n`);
  write({ id: session, session_id: session, source: 'cli' });
  assert.equal(classifyCodexRole({ session_id: session, transcript_path: file }), 'lead');
  write({ id: session, session_id: session, source: 'vscode' });
  assert.equal(classifyCodexRole({ session_id: session, transcript_path: file }), 'lead');
  write({ id: uuid(11), session_id: session, source: { subagent: { thread_spawn: { parent_thread_id: uuid(12), depth: 2 } } } });
  assert.equal(classifyCodexRole({ session_id: session, agent_id: uuid(11), transcript_path: file }), 'child');
  assert.equal(classifyCodexRole({ session_id: session, agent_id: uuid(12), transcript_path: file }), 'unknown');
  write({ id: uuid(12), session_id: uuid(12), source: 'cli' });
  assert.equal(classifyCodexRole({ session_id: session, transcript_path: file }), 'unknown');
});

test('Codex documented turn fields remain nonblocking until native evidence enables the profile', () => {
  const dir = tmp(); const file = path.join(dir, 'rollout.jsonl'); const session = uuid(20);
  fs.writeFileSync(file, `${JSON.stringify({ type: 'session_meta', payload: { id: session, session_id: session, source: 'cli' } })}\n`);
  const input = { hook_event_name: 'Stop', session_id: session, transcript_path: file, turn_id: 'turn-1', stop_hook_active: false };
  const pending = normalizeCodexContinuation(input);
  assert.equal(pending.role, 'lead');
  assert.equal(pending.profile, null);
  assert.equal(pending.cancellationVerified, false);
  const proved = normalizeCodexContinuation(input, fs, { supported: true });
  assert.equal(proved.episodeKey, 'turn-1');
  assert.equal(proved.eventKey, 'Stop:turn-1');
});
