// delegation-reminder — driven exactly as the harness drives it: the real hook as a child process,
// one crafted stdin per event, and what is asserted is the bytes Claude Code would receive.
//
// Every child gets a fixture HOME and a fixture AGENTS_HOME, so no case can read or write the real
// `~/.agents`, and `childEnv` blanks this session's messaging credential (suite rule N2).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';
import {
  PROMPT_LINE_MAX_BYTES, BATCHES_PER_REINJECT, RENDER_MAX_BYTES, SUBAGENT_SUFFIX, SWITCH_NAME,
  CONFIG_KEY, DEFAULT_CARD_PATH, stateFileFor, stateDir,
} from '../scripts/goal-card.mjs';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOOK = path.join(REPO, 'hooks', 'delegation-reminder.js');
const SESSION_ID = 'fixture-session-0001';

/** What the hook injected on every user prompt before 2026-09-20, for the net-negative assertion. */
const LEGACY_PROMPT_BYTES = 671;

const CARD = [
  'GOAL: every batch is cheap, fast, recoverable, tracked and metered, and we never lose one.',
  'NOT: a second execution engine. NOT: a new leg or transport to fix a polling bug.',
  'DONE: a killed run resumes from its ledger with zero re-billed work, and spend is visible first.',
  'KILL: if recovery still needs a human after two weeks, stop and buy a durable engine. Budget: $600.',
  'SOURCE: docs/goals/batches.md (parent: docs/goals/program.md)',
].join('\n');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** A fixture HOME whose `.agents` is the AGENTS_HOME the child will use. */
function fixtureHome() {
  const home = tmpdir('reminder-home-');
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  return home;
}

const agentsOf = (home) => path.join(home, '.agents');

/** A project root with `.agents/project.json` and, optionally, a card. */
function project(card = CARD, cardPath = null) {
  const root = tmpdir('reminder-proj-');
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
  const body = { name: 'fixture', vcs: 'none' };
  if (cardPath) body[CONFIG_KEY] = cardPath;
  fs.writeFileSync(path.join(root, '.agents', 'project.json'), JSON.stringify(body), 'utf8');
  if (card !== null) {
    const file = path.join(root, cardPath || DEFAULT_CARD_PATH);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, card, 'utf8');
  }
  return root;
}

/**
 * Run the hook the way Claude Code does: JSON on stdin, the event in argv, a fixture home.
 * @returns {{status: number, stdout: string, json: object|null}}
 */
function runHook(event, home, { cwd = os.tmpdir(), input = {}, argv = true, stdin = null, over = {} } = {}) {
  const payload = stdin !== null
    ? stdin
    : JSON.stringify({ hook_event_name: event, cwd, session_id: SESSION_ID, ...input });
  const res = spawnSync(process.execPath, argv ? [HOOK, event] : [HOOK], {
    input: payload,
    encoding: 'utf8',
    cwd: os.tmpdir(),
    env: childEnv(home, { AGENTS_HOME: agentsOf(home), DELEGATION_TOP_TIER: 'fable,opus', ...over }),
  });
  const stdout = res.stdout || '';
  let json = null;
  if (stdout.trim()) json = JSON.parse(stdout);
  return { status: res.status, stdout, json, stderr: res.stderr || '' };
}

const context = (r) => (r.json && r.json.hookSpecificOutput && r.json.hookSpecificOutput.additionalContext) || null;

function seedCount(home, n) {
  const env = { AGENTS_HOME: agentsOf(home) };
  fs.mkdirSync(stateDir(env), { recursive: true });
  fs.writeFileSync(stateFileFor(SESSION_ID, env), JSON.stringify({ batches: n }), 'utf8');
}

function readCount(home) {
  const env = { AGENTS_HOME: agentsOf(home) };
  try {
    return JSON.parse(fs.readFileSync(stateFileFor(SESSION_ID, env), 'utf8')).batches;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Which events carry the card
// ─────────────────────────────────────────────────────────────────────────────

test('SessionStart injects the card, on every source', () => {
  const home = fixtureHome();
  const root = project();
  for (const source of ['startup', 'resume', 'clear', 'compact', 'fork']) {
    const r = runHook('SessionStart', home, { cwd: root, input: { source } });
    assert.equal(r.status, 0, source);
    assert.equal(r.json.hookSpecificOutput.hookEventName, 'SessionStart', source);
    const text = context(r);
    assert.match(text, /^Goal card for this project:\n/, source);
    assert.match(text, /NOT: a second execution engine/, source);
    assert.match(text, / — as of \d{4}-\d{2}-\d{2} \d{2}:\d{2} NYC$/, source);
  }
});

test('SubagentStart injects the card plus the one report line', () => {
  const home = fixtureHome();
  const root = project();
  const r = runHook('SubagentStart', home, { cwd: root, input: { agent_id: 'agent-1', agent_type: 'delegation:builder' } });
  assert.equal(r.status, 0);
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'SubagentStart');
  assert.match(context(r), /GOAL: /);
  assert.equal(context(r).endsWith(SUBAGENT_SUFFIX), true, 'the subagent line is the last line');
});

test('UserPromptSubmit never carries the card — that is what made the last standing text wallpaper', () => {
  const home = fixtureHome();
  const root = project();
  const r = runHook('UserPromptSubmit', home, { cwd: root, input: { prompt: 'do the thing' } });
  assert.equal(r.status, 0);
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(context(r).includes('GOAL:'), false);
  assert.match(context(r), /^Routing: /);
});

test('PostCompact emits nothing — the docs give it no decision control — but it resets the counter', () => {
  const home = fixtureHome();
  const root = project();
  seedCount(home, 17);
  const r = runHook('PostCompact', home, { cwd: root, input: { trigger: 'auto', compact_summary: 'x' } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '', 'PostCompact output is discarded by the harness; emitting is pointless');
  assert.equal(readCount(home), 0);
});

test('an event nobody wired this hook for is silent', () => {
  const home = fixtureHome();
  const root = project();
  for (const event of ['Stop', 'PostToolUse', 'SubagentStop', 'SessionEnd', 'Notification']) {
    const r = runHook(event, home, { cwd: root });
    assert.equal(r.status, 0, event);
    assert.equal(r.stdout, '', event);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// The counter
// ─────────────────────────────────────────────────────────────────────────────

test(`PostToolBatch injects on the ${BATCHES_PER_REINJECT}th batch and on no other`, () => {
  const home = fixtureHome();
  const root = project();

  seedCount(home, BATCHES_PER_REINJECT - 2);
  const quiet = runHook('PostToolBatch', home, { cwd: root, input: { tool_calls: [] } });
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stdout, '', 'the batch before the threshold says nothing');
  assert.equal(readCount(home), BATCHES_PER_REINJECT - 1);

  const fires = runHook('PostToolBatch', home, { cwd: root, input: { tool_calls: [] } });
  assert.equal(fires.status, 0);
  assert.equal(fires.json.hookSpecificOutput.hookEventName, 'PostToolBatch');
  assert.match(context(fires), /GOAL: /);
  assert.equal(readCount(home), BATCHES_PER_REINJECT);

  const after = runHook('PostToolBatch', home, { cwd: root, input: { tool_calls: [] } });
  assert.equal(after.stdout, '', 'the batch after the threshold says nothing again');
  assert.equal(readCount(home), BATCHES_PER_REINJECT + 1);
});

test('SessionStart resets the counter, so a fresh session never fires early', () => {
  const home = fixtureHome();
  const root = project();
  seedCount(home, BATCHES_PER_REINJECT - 1);
  runHook('SessionStart', home, { cwd: root, input: { source: 'startup' } });
  assert.equal(readCount(home), 0);
  const r = runHook('PostToolBatch', home, { cwd: root });
  assert.equal(r.stdout, '', 'one batch after a reset is batch 1, not batch 40');
  assert.equal(readCount(home), 1);
});

test('the counter is per session id, and a hostile id cannot escape the state directory', () => {
  const home = fixtureHome();
  const root = project();
  runHook('PostToolBatch', home, { cwd: root, input: { session_id: '../../escape' } });
  const env = { AGENTS_HOME: agentsOf(home) };
  const names = fs.readdirSync(stateDir(env));
  assert.deepEqual(names, ['______escape.json'], 'dots and separators alike are flattened');
  assert.equal(path.basename(stateFileFor('../../escape', env)), names[0], 'and the module agrees with the hook');
  assert.equal(fs.existsSync(path.join(home, 'escape.json')), false);
});

test('an unreadable state file fails open: no crash, no injection, exit 0', () => {
  const home = fixtureHome();
  const root = project();
  const env = { AGENTS_HOME: agentsOf(home) };
  const file = stateFileFor(SESSION_ID, env);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  fs.writeFileSync(file, 'not json at all', 'utf8');
  const r1 = runHook('PostToolBatch', home, { cwd: root });
  assert.equal(r1.status, 0);
  assert.equal(r1.stdout, '', 'a corrupt counter reads as zero, it does not fire and it does not throw');

  // A directory where the counter belongs: every read AND every write fails.
  fs.rmSync(file);
  fs.mkdirSync(file, { recursive: true });
  const r2 = runHook('PostToolBatch', home, { cwd: root });
  assert.equal(r2.status, 0);
  assert.equal(r2.stdout, '');
  const r3 = runHook('SessionStart', home, { cwd: root, input: { source: 'startup' } });
  assert.equal(r3.status, 0, 'a counter that cannot be written still lets the card through');
  assert.match(context(r3), /GOAL: /);
});

// ─────────────────────────────────────────────────────────────────────────────
// Silence: malformed cards, missing cards, switches
// ─────────────────────────────────────────────────────────────────────────────

test('a malformed card injects nothing and exits 0', () => {
  const home = fixtureHome();
  for (const bad of ['GOAL: only one line', `${CARD}\nEXTRA: sixth`, `NOT: x\n${CARD}`, `GOAL: ${'x'.repeat(400)}`]) {
    const root = project(bad);
    const r = runHook('SessionStart', home, { cwd: root, input: { source: 'startup' } });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '', `malformed card injected something: ${bad.slice(0, 30)}`);
  }
});

test('no card and no project config: a quiet no-op, plus the one short prompt line', () => {
  const home = fixtureHome();
  const bare = tmpdir('reminder-bare-'); // no .agents, no .git, nothing
  for (const event of ['SessionStart', 'SubagentStart', 'PostToolBatch', 'PostCompact']) {
    const r = runHook(event, home, { cwd: bare });
    assert.equal(r.status, 0, event);
    assert.equal(r.stdout, '', event);
  }
  const prompt = runHook('UserPromptSubmit', home, { cwd: bare });
  assert.equal(prompt.status, 0);
  assert.match(context(prompt), /^Routing: /);
});

test('either switch file silences the card, and the routing line survives', () => {
  const root = project();
  for (const name of ['ws-off', `ws-off-${SWITCH_NAME}`]) {
    const home = fixtureHome();
    fs.writeFileSync(path.join(agentsOf(home), name), '', 'utf8');
    for (const event of ['SessionStart', 'SubagentStart']) {
      const r = runHook(event, home, { cwd: root, input: { source: 'startup' } });
      assert.equal(r.status, 0, `${name} ${event}`);
      assert.equal(r.stdout, '', `${name} ${event}`);
    }
    seedCount(home, BATCHES_PER_REINJECT - 1);
    const batch = runHook('PostToolBatch', home, { cwd: root });
    assert.equal(batch.stdout, '', `${name} PostToolBatch`);
    const prompt = runHook('UserPromptSubmit', home, { cwd: root });
    assert.match(context(prompt), /^Routing: /, `${name}: routing is not a goal-card feature`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Budgets
// ─────────────────────────────────────────────────────────────────────────────

test('the per-prompt payload is under budget and well under what it replaced', () => {
  const home = fixtureHome();
  const root = project();
  const top = context(runHook('UserPromptSubmit', home, { cwd: root, over: { DELEGATION_TOP_TIER: 'opus' }, input: { model: 'claude-opus-5' } }));
  const exec = context(runHook('UserPromptSubmit', home, { cwd: root, input: { model: 'claude-sonnet-5' } }));
  assert.ok(top.includes('Subagents return a verdict'), 'top tier keeps the economy sentence');
  assert.equal(exec.includes('Subagents return a verdict'), false, 'execution tier does not');
  for (const [label, text] of [['top', top], ['exec', exec]]) {
    const bytes = Buffer.byteLength(text, 'utf8');
    assert.ok(bytes <= PROMPT_LINE_MAX_BYTES, `${label} prompt line is ${bytes} bytes, over ${PROMPT_LINE_MAX_BYTES}`);
    assert.ok(bytes < LEGACY_PROMPT_BYTES / 2, `${label} prompt line is ${bytes} bytes; the point was to at least halve ${LEGACY_PROMPT_BYTES}`);
  }
});

test('the card payload is under budget wherever it is injected', () => {
  const home = fixtureHome();
  const root = project();
  for (const [event, input] of [['SessionStart', { source: 'startup' }], ['SubagentStart', { agent_type: 'Explore' }]]) {
    const text = context(runHook(event, home, { cwd: root, input }));
    const bytes = Buffer.byteLength(text, 'utf8');
    assert.ok(bytes <= RENDER_MAX_BYTES + SUBAGENT_SUFFIX.length + 1, `${event} card is ${bytes} bytes`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// The protocol: never 2, always parseable, never a block
// ─────────────────────────────────────────────────────────────────────────────

test('nothing this hook does ever exits 2', () => {
  const home = fixtureHome();
  const root = project();
  const events = ['SessionStart', 'UserPromptSubmit', 'SubagentStart', 'PostToolBatch', 'PostCompact', 'Stop', 'Bogus'];
  const stdins = [null, '', 'not json', '[]', 'null', '{"hook_event_name":', '{}'];
  for (const event of events) {
    for (const stdin of stdins) {
      const r = runHook(event, home, { cwd: root, stdin });
      assert.notEqual(r.status, 2, `${event} with stdin ${JSON.stringify(stdin)} exited 2`);
      assert.equal(r.status, 0, `${event} with stdin ${JSON.stringify(stdin)} exited ${r.status}`);
    }
  }
  // Also with a card the module cannot even be reached for: a project root that vanished.
  const gone = path.join(os.tmpdir(), 'reminder-does-not-exist-at-all');
  for (const event of events) {
    const r = runHook(event, home, { cwd: gone });
    assert.notEqual(r.status, 2, event);
  }
});

test('every output is a valid harness object, and never a block', () => {
  const home = fixtureHome();
  const root = project();
  for (const [event, input] of [
    ['SessionStart', { source: 'startup' }],
    ['UserPromptSubmit', {}],
    ['SubagentStart', { agent_type: 'Explore' }],
  ]) {
    const r = runHook(event, home, { cwd: root, input });
    assert.equal(r.stdout.startsWith('{') && r.stdout.endsWith('}'), true, `${event}: stdout must parse as JSON, not plain text`);
    const j = r.json;
    assert.equal(typeof j.hookSpecificOutput.additionalContext, 'string', event);
    assert.equal(j.hookSpecificOutput.hookEventName, event, event);
    assert.equal(j.suppressOutput, true, event);
    assert.equal('decision' in j, false, `${event}: this hook must never render a decision`);
    assert.equal('continue' in j, false, `${event}: this hook must never stop the loop`);
    assert.equal('systemMessage' in j, false, `${event}: nothing here belongs on Ben's screen`);
  }
});

test('with no event in argv and none on stdin, it behaves as the UserPromptSubmit hook it shipped as', () => {
  const home = fixtureHome();
  const r = runHook('UserPromptSubmit', home, { argv: false, stdin: '{}' });
  assert.equal(r.status, 0);
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(context(r), /^Routing: /);
});

test('the hook spawns nothing and opens no socket', () => {
  const source = fs.readFileSync(HOOK, 'utf8');
  for (const forbidden of ['child_process', 'spawn(', 'execSync', 'node:http', 'require("https")', 'fetch(']) {
    assert.equal(source.includes(forbidden), false, `delegation-reminder.js references ${forbidden}`);
  }
  assert.equal(/process\.exit\(\s*2\s*\)/.test(source), false, 'no path may exit 2');
});

test('the hook is fast enough to sit on every tool batch', () => {
  const home = fixtureHome();
  const root = project();
  seedCount(home, 0);
  const started = Date.now();
  const rounds = 5;
  for (let i = 0; i < rounds; i++) runHook('PostToolBatch', home, { cwd: root });
  const each = (Date.now() - started) / rounds;
  // Node's own startup dominates; the budget is generous on purpose, and a regression that made this
  // hook read the transcript or import the ESM module on the quiet path would blow straight past it.
  assert.ok(each < 400, `below-threshold PostToolBatch averaged ${each}ms`);
  assert.equal(readCount(home), rounds);
});
