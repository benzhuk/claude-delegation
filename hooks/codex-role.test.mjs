import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { classifyCodexRole } from './codex-role.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'codex-role-'));
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('Codex role is tri-state and inherited/mismatched metadata never proves lead', () => {
  const dir = tmp(); const file = path.join(dir, 'rollout.jsonl'); const session = uuid(10);
  const write = (payload) => fs.writeFileSync(file, `${JSON.stringify({ type: 'session_meta', payload })}\n`);
  write({ id: session, session_id: session, source: 'cli' });
  assert.equal(classifyCodexRole({ session_id: session, transcript_path: file }), 'lead');
  write({ id: session, source: 'cli' });
  assert.equal(classifyCodexRole({ session_id: session, transcript_path: file }), 'lead');
  write({ id: session, session_id: session, source: 'vscode' });
  assert.equal(classifyCodexRole({ session_id: session, transcript_path: file }), 'lead');
  write({ id: uuid(11), session_id: session, source: { subagent: { thread_spawn: { parent_thread_id: uuid(12), depth: 2 } } } });
  assert.equal(classifyCodexRole({ session_id: session, agent_id: uuid(11), transcript_path: file }), 'child');
  assert.equal(classifyCodexRole({ session_id: session, agent_id: uuid(12), transcript_path: file }), 'unknown');
  write({ id: session, source: { subagent: { thread_spawn: { parent_thread_id: uuid(12), depth: 2 } } } });
  assert.equal(classifyCodexRole({ session_id: session, transcript_path: file }), 'child');
  write({ id: session, session_id: uuid(12), source: { subagent: { thread_spawn: { parent_thread_id: uuid(12), depth: 2 } } } });
  assert.equal(classifyCodexRole({ session_id: session, transcript_path: file }), 'unknown');
  write({ id: session, source: { subagent: { thread_spawn: { parent_thread_id: uuid(12), depth: 0 } } } });
  assert.equal(classifyCodexRole({ session_id: session, transcript_path: file }), 'unknown');
  write({ id: uuid(11), session_id: session, source: { subagent: { thread_spawn: { parent_thread_id: uuid(11), depth: 2 } } } });
  assert.equal(classifyCodexRole({ session_id: session, agent_id: uuid(11), transcript_path: file }), 'unknown');
  write({ id: session, source: { subagent: { thread_spawn: null } } });
  assert.equal(classifyCodexRole({ session_id: session, transcript_path: file }), 'unknown');
  write({ id: uuid(12), session_id: uuid(12), source: 'cli' });
  assert.equal(classifyCodexRole({ session_id: session, transcript_path: file }), 'unknown');
});
