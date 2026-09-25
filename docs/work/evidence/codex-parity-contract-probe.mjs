#!/usr/bin/env node
// Post-integration contract probe for P1.  It intentionally imports the chosen checkout at run time.
// Usage: node integration-probe.mjs <integrated-checkout>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const checkout = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!checkout || !fs.existsSync(path.join(checkout, 'hooks', 'multi-codex-hook.mjs'))) {
  process.stderr.write('usage: node integration-probe.mjs <integrated-checkout>\n');
  process.exit(2);
}

const { runCodexHook } = await import(pathToFileURL(path.join(checkout, 'hooks', 'multi-codex-hook.mjs')).href);
const LEAD = '01a0c5f8-1865-7d93-9ff3-38793062f1ee';
const CHILD = '01a0d099-9b5f-7cb3-be77-6a827340ab32';
const CARD = [
  'GOAL: prove a host-neutral harness preserves work identity.',
  'NOT: invent a second execution engine.',
  'DONE: one Codex lead receives the bounded advisory.',
  'KILL: stop if evidence cannot distinguish source from installation.',
  'SOURCE: docs/goals/card.md',
].join('\n');

function metadata({ id = LEAD, sessionId = LEAD, child = false } = {}) {
  const source = child ? { subagent: { thread_spawn: { parent_thread_id: LEAD, depth: 1 } } } : 'cli';
  return `${JSON.stringify({ type: 'session_meta', payload: { id, session_id: sessionId, source } })}\n`;
}

function peerNotes() {
  return {
    slug: 'lead', count: 1, problems: [], scanned: [],
    notes: [{ id: 'probe-peer-1', from: 'peer', to: 'lead', kind: 'ASK', line: 'peer → lead, 9.25.26 12:00 NYC [probe-peer-1] ASK: retain existing context.', details: null, packetExists: null, packetPath: null, ymd: '2026-09-25' }],
  };
}

function contextOf(result) { return result?.output?.hookSpecificOutput?.additionalContext || ''; }
function systemOf(result) { return result?.output?.systemMessage || ''; }
function absent(text) { assert.doesNotMatch(text, /GOAL:|Bearings (are due|status is unknown)/); }
function peerPreserved(result) {
  assert.match(contextOf(result), /peer → lead/);
  assert.match(systemOf(result), /📨 peer → lead ASK:/);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-parity-probe-'));
const home = path.join(scratch, 'agents-home');
const project = path.join(scratch, 'project');
fs.mkdirSync(path.join(home), { recursive: true });
fs.mkdirSync(path.join(project, '.agents'), { recursive: true });
fs.mkdirSync(path.join(project, 'docs', 'goals'), { recursive: true });
fs.writeFileSync(path.join(project, '.agents', 'project.json'), JSON.stringify({ name: 'probe', vcs: 'none', goal_card: 'docs/goals/card.md' }));
fs.writeFileSync(path.join(project, 'docs', 'goals', 'card.md'), CARD);
const leadTranscript = path.join(scratch, 'lead.jsonl');
const childTranscript = path.join(scratch, 'child.jsonl');
fs.writeFileSync(leadTranscript, metadata());
fs.writeFileSync(childTranscript, metadata({ id: CHILD, sessionId: LEAD, child: true }));

const priorAgentsHome = process.env.AGENTS_HOME;
process.env.AGENTS_HOME = home;
const env = { AGENTS_HOME: home, NOTE_SLUG: 'lead', CODEX_HOME: path.join(scratch, 'codex-home') };
const deps = { home, env, inbox: async () => peerNotes(), handleContinuationEvent: async () => null };
const invoke = (event, extra = {}) => runCodexHook({ hook_event_name: event, session_id: LEAD, cwd: project, transcript_path: leadTranscript, ...extra }, deps);

try {
  const started = await invoke('SessionStart');
  assert.match(contextOf(started), /GOAL:/);
  assert.match(contextOf(started), /Bearings are due/);
  peerPreserved(started);
  assert.match(systemOf(started), /Bearings are due/);

  const prompted = await invoke('UserPromptSubmit');
  assert.match(contextOf(prompted), /GOAL:/);
  assert.match(contextOf(prompted), /Bearings are due/);
  peerPreserved(prompted);
  assert.doesNotMatch(systemOf(prompted), /Bearings (are due|status is unknown)/);

  const unknown = await runCodexHook({ hook_event_name: 'UserPromptSubmit', session_id: LEAD, cwd: project }, deps);
  peerPreserved(unknown);
  absent(`${contextOf(unknown)}\n${systemOf(unknown)}`);

  const child = await runCodexHook({ hook_event_name: 'UserPromptSubmit', session_id: LEAD, cwd: project, transcript_path: childTranscript }, deps);
  assert.equal(child, null);

  for (const [name, cardExpected, bearingsExpected] of [['ws-off', false, false], ['ws-off-goalcard', false, false], ['ws-off-bearings', true, false]]) {
    fs.writeFileSync(path.join(home, name), '');
    const switched = await invoke('SessionStart');
    peerPreserved(switched);
    if (cardExpected) assert.match(contextOf(switched), /GOAL:/); else assert.doesNotMatch(contextOf(switched), /GOAL:/);
    if (bearingsExpected) assert.match(`${contextOf(switched)}\n${systemOf(switched)}`, /Bearings are due/); else assert.doesNotMatch(`${contextOf(switched)}\n${systemOf(switched)}`, /Bearings (are due|status is unknown)/);
    fs.unlinkSync(path.join(home, name));
  }

  for (const event of ['PostToolUse', 'Stop']) {
    const passive = await invoke(event);
    assert.ok(passive, `${event} should preserve the existing hook result`);
    absent(JSON.stringify(passive.output));
  }
  process.stdout.write('VERDICT: PASS integration hook contract observed\n');
} catch (error) {
  process.stdout.write(`VERDICT: FAIL integration hook contract: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  if (priorAgentsHome === undefined) delete process.env.AGENTS_HOME;
  else process.env.AGENTS_HOME = priorAgentsHome;
  fs.rmSync(scratch, { recursive: true, force: true });
}
