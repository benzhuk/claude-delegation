// delegation-reminder — driven exactly as the harness drives it: the real hook as a child process,
// one crafted stdin per event, and what is asserted is the bytes Claude Code would receive.
//
// Every child gets a fixture HOME and a fixture AGENTS_HOME, so no case can read or write the real
// `~/.agents`, and `childEnv` blanks this session's messaging credential (suite rule N2).
//
// ROUND 2: every case the reviewer reproduced has a test here, and the ones that matter assert the
// FILESYSTEM, not only stdout — MAJOR 1 and MAJOR 2 were both invisible to a green round-1 suite
// precisely because every assertion stopped at stdout.
//
// BUILD 0921-S: the frozen tip this file was salvaged from also wired `SubagentStart`; that ruling
// was reversed for this build (a subagent gets its goal from its mandate, not a hook). Every case
// that drove `SubagentStart` as an injection point is removed or rewritten to drive `PostToolBatch`
// instead, which is the one mechanism a long-running subagent still reaches the card through.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';
import {
  PROMPT_LINE_MAX_BYTES, BATCHES_PER_REINJECT, REINJECT_MAX_MS, RENDER_MAX_BYTES, SUBAGENT_SUFFIX,
  SWITCH_NAME, MASTER_SWITCH, CONFIG_KEY, DEFAULT_CARD_PATH, SWEEP_MAX_UNLINKS,
  tallyFileFor, firedFileFor, stateDir, stateKey, renderInjection,
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
const envFor = (home) => ({ AGENTS_HOME: agentsOf(home) });

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

function payloadFor(event, cwd, input) {
  return JSON.stringify({ hook_event_name: event, cwd, session_id: SESSION_ID, ...input });
}

/**
 * Run the hook the way Claude Code does: JSON on stdin, the event in argv, a fixture home.
 * @returns {{status: number, stdout: string, json: object|null}}
 */
function runHook(event, home, { cwd = os.tmpdir(), input = {}, argv = true, stdin = null, over = {} } = {}) {
  const res = spawnSync(process.execPath, argv ? [HOOK, event] : [HOOK], {
    input: stdin !== null ? stdin : payloadFor(event, cwd, input),
    encoding: 'utf8',
    cwd: os.tmpdir(),
    env: childEnv(home, { AGENTS_HOME: agentsOf(home), DELEGATION_TOP_TIER: 'fable,opus', ...over }),
  });
  const stdout = res.stdout || '';
  return { status: res.status, stdout, json: stdout.trim() ? JSON.parse(stdout) : null, stderr: res.stderr || '' };
}

/** The same run, asynchronously, so stdout arrives over a real pipe (MINOR 2). */
function runHookAsync(event, home, { cwd = os.tmpdir(), input = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK, event], {
      cwd: os.tmpdir(),
      env: childEnv(home, { AGENTS_HOME: agentsOf(home), DELEGATION_TOP_TIER: 'fable,opus' }),
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => (stdout += d));
    child.on('close', (status) => resolve({ status, stdout }));
    child.stdin.end(payloadFor(event, cwd, input));
  });
}

const context = (r) => (r.json && r.json.hookSpecificOutput && r.json.hookSpecificOutput.additionalContext) || null;
const sysmsg = (r) => (r.json && r.json.systemMessage) || null;

/** Every path under the agents home, with its size: the fingerprint MAJOR 1 is asserted against. */
function homeFingerprint(home) {
  const base = agentsOf(home);
  const out = [];
  const walk = (dir, rel) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) { out.push(`${rel}${name}/`); walk(full, `${rel}${name}/`); }
      else out.push(`${rel}${name}:${st.size}`);
    }
  };
  walk(base, '');
  return out.join('\n');
}

const tally = (home, agentId) => {
  try { return fs.statSync(tallyFileFor(SESSION_ID, agentId, envFor(home))).size; } catch { return null; }
};

function seedTally(home, bytes, agentId) {
  const env = envFor(home);
  fs.mkdirSync(stateDir(env), { recursive: true });
  fs.writeFileSync(tallyFileFor(SESSION_ID, agentId, env), '.'.repeat(bytes), 'utf8');
  fs.writeFileSync(firedFileFor(SESSION_ID, agentId, env), '', 'utf8');
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
  seedTally(home, 17);
  const r = runHook('PostCompact', home, { cwd: root, input: { trigger: 'auto', compact_summary: 'x' } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '', 'PostCompact output is discarded by the harness; emitting is pointless');
  assert.equal(tally(home), 0);
});

test('an event nobody wired this hook for is silent, including SubagentStart (build 0921-S ruling)', () => {
  const home = fixtureHome();
  const root = project();
  for (const event of ['Stop', 'PostToolUse', 'SubagentStart', 'SubagentStop', 'SessionEnd', 'Notification']) {
    const r = runHook(event, home, { cwd: root, input: { agent_type: 'delegation:builder' } });
    assert.equal(r.status, 0, event);
    assert.equal(r.stdout, '', event);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAJOR 3 — every agent_type gets the card via its own PostToolBatch counter; only the
// report-writing roles get the extra line. Rewritten for build 0921-S: the frozen tip drove this
// through SubagentStart, which this build does not wire (a subagent gets its goal from its mandate).
// A long-running subagent still reaches the card through its own tool-batch tally, keyed by agent_id.
// ─────────────────────────────────────────────────────────────────────────────

test('MAJOR 3: every agent_type gets the card at its own batch threshold, and only builder/reviewer/integrator get the report line', () => {
  const home = fixtureHome();
  const root = project();
  let n = 0;

  for (const agent_type of ['delegation:builder', 'delegation:reviewer', 'delegation:integrator', 'builder', 'Reviewer']) {
    const agentId = `agent-${n++}`;
    seedTally(home, BATCHES_PER_REINJECT - 1, agentId);
    const r = runHook('PostToolBatch', home, { cwd: root, input: { agent_id: agentId, agent_type } });
    assert.equal(r.status, 0, agent_type);
    assert.equal(r.json.hookSpecificOutput.hookEventName, 'PostToolBatch', agent_type);
    assert.match(context(r), /GOAL: /, agent_type);
    assert.equal(context(r).endsWith(SUBAGENT_SUFFIX), true, `${agent_type} should get the report line`);
  }

  for (const agent_type of ['Explore', 'Plan', 'general-purpose', 'mrc-memo-writer', 'other-plugin:writer', undefined]) {
    const agentId = `agent-${n++}`;
    seedTally(home, BATCHES_PER_REINJECT - 1, agentId);
    const r = runHook('PostToolBatch', home, { cwd: root, input: { agent_id: agentId, agent_type } });
    assert.equal(r.status, 0, String(agent_type));
    assert.match(context(r), /GOAL: /, `${agent_type} should still get the card — a researcher drifts too`);
    assert.equal(context(r).includes(SUBAGENT_SUFFIX), false, `${agent_type} must not be told to write a goal line`);
    assert.equal(context(r).includes('territory'), false, String(agent_type));
  }
});

test('MINOR 7: the subagent line is a factual statement, not an imperative system instruction', () => {
  assert.equal(/^(Name|Write|Do|Always|You must)\b/i.test(SUBAGENT_SUFFIX), false, SUBAGENT_SUFFIX);
  assert.match(SUBAGENT_SUFFIX, /^A territory report here names /);
});

// ─────────────────────────────────────────────────────────────────────────────
// MAJOR 2 — the counter under parallel writers
// ─────────────────────────────────────────────────────────────────────────────

test('MAJOR 2: concurrent PostToolBatch hooks lose no increments', async () => {
  const home = fixtureHome();
  const root = project();
  const n = BATCHES_PER_REINJECT - 10; // below the threshold, so nothing truncates the tally
  const runs = [];
  for (let i = 0; i < n; i++) runs.push(runHookAsync('PostToolBatch', home, { cwd: root, input: { tool_calls: [] } }));
  const results = await Promise.all(runs);
  for (const r of results) assert.equal(r.status, 0);
  assert.equal(tally(home), n, `${n} concurrent hooks must produce ${n} appended bytes; the round-1 read-modify-write counter kept 22 of 120`);
  assert.equal(results.filter((r) => r.stdout.trim()).length, 0, 'none of them is at the threshold yet');
});

test('MAJOR 2: concurrent PostToolBatch hooks past the threshold DO fire (round 1 fired zero times)', async () => {
  const home = fixtureHome();
  const root = project();
  const n = BATCHES_PER_REINJECT + 5;
  const runs = [];
  for (let i = 0; i < n; i++) runs.push(runHookAsync('PostToolBatch', home, { cwd: root, input: { tool_calls: [] } }));
  const results = await Promise.all(runs);
  const fired = results.filter((r) => r.stdout.includes('GOAL: '));
  assert.ok(fired.length >= 1, `${n} concurrent batches fired ${fired.length} times; never firing is the one unacceptable outcome`);
  for (const r of results) assert.equal(r.status, 0);
});

test('MAJOR 2: a subagent’s tool batches do not advance the parent’s counter', () => {
  const home = fixtureHome();
  const root = project();
  seedTally(home, 5);                       // the parent's tally
  runHook('PostToolBatch', home, { cwd: root, input: { agent_id: 'agent-xyz' } });
  assert.equal(tally(home), 5, 'the parent counter is untouched by a subagent batch');
  assert.equal(tally(home, 'agent-xyz'), 1, 'the subagent counts its own');
  assert.notEqual(stateKey(SESSION_ID, 'agent-xyz'), stateKey(SESSION_ID), 'the key really does carry the agent');
});

test(`PostToolBatch injects on the ${BATCHES_PER_REINJECT}th batch, resets, and not before`, () => {
  const home = fixtureHome();
  const root = project();

  seedTally(home, BATCHES_PER_REINJECT - 2);
  const quiet = runHook('PostToolBatch', home, { cwd: root, input: { tool_calls: [] } });
  assert.equal(quiet.stdout, '', 'the batch before the threshold says nothing');
  assert.equal(tally(home), BATCHES_PER_REINJECT - 1);

  const fires = runHook('PostToolBatch', home, { cwd: root, input: { tool_calls: [] } });
  assert.equal(fires.json.hookSpecificOutput.hookEventName, 'PostToolBatch');
  assert.match(context(fires), /GOAL: /);
  assert.equal(tally(home), 0, 'firing truncates the tally rather than reading and rewriting a number');

  const after = runHook('PostToolBatch', home, { cwd: root, input: { tool_calls: [] } });
  assert.equal(after.stdout, '', 'the batch after the threshold says nothing again');
  assert.equal(tally(home), 1);
});

test('MAJOR 2: the time floor fires even when the tally is nearly empty', () => {
  const home = fixtureHome();
  const root = project();
  seedTally(home, 1);
  const env = envFor(home);
  const longAgo = new Date(Date.now() - REINJECT_MAX_MS - 60_000);
  fs.utimesSync(firedFileFor(SESSION_ID, undefined, env), longAgo, longAgo);

  const r = runHook('PostToolBatch', home, { cwd: root });
  assert.match(context(r), /GOAL: /, 'a batch arriving long after the last injection re-injects regardless of the count');
  assert.equal(tally(home), 0);

  const next = runHook('PostToolBatch', home, { cwd: root });
  assert.equal(next.stdout, '', 'and the clock restarts, so it does not fire on every batch afterwards');
});

test('SessionStart resets the counter and the clock, so a fresh session never fires early', () => {
  const home = fixtureHome();
  const root = project();
  seedTally(home, BATCHES_PER_REINJECT - 1);
  runHook('SessionStart', home, { cwd: root, input: { source: 'startup' } });
  assert.equal(tally(home), 0);
  const r = runHook('PostToolBatch', home, { cwd: root });
  assert.equal(r.stdout, '', 'one batch after a reset is batch 1, not batch 40');
  assert.equal(tally(home), 1);
});

test('a hostile session or agent id cannot escape the state directory', () => {
  const home = fixtureHome();
  const root = project();
  runHook('PostToolBatch', home, { cwd: root, input: { session_id: '../../escape', agent_id: '../../also' } });
  const names = fs.readdirSync(stateDir(envFor(home))).sort();
  assert.deepEqual(names, ['______escape.______also.fired', '______escape.______also.tally'].sort());
  assert.equal(fs.existsSync(path.join(home, 'escape.tally')), false);
});

test('an unreadable or oversized state file fails open: no crash, no stall, exit 0', () => {
  const home = fixtureHome();
  const root = project();
  const env = envFor(home);
  fs.mkdirSync(stateDir(env), { recursive: true });

  // A directory where the tally belongs: every append AND every stat-as-file fails.
  fs.mkdirSync(tallyFileFor(SESSION_ID, undefined, env), { recursive: true });
  const r1 = runHook('PostToolBatch', home, { cwd: root });
  assert.equal(r1.status, 0);

  const r2 = runHook('SessionStart', home, { cwd: root, input: { source: 'startup' } });
  assert.equal(r2.status, 0, 'a counter that cannot be written still lets the card through');
  assert.match(context(r2), /GOAL: /);

  // MINOR 4: the tally is never READ, only stat'ed, so a huge file costs a stat and nothing more.
  fs.rmSync(tallyFileFor(SESSION_ID, undefined, env), { recursive: true, force: true });
  fs.writeFileSync(tallyFileFor(SESSION_ID, undefined, env), Buffer.alloc(4 * 1024 * 1024, 0x2e));
  const started = Date.now();
  const r3 = runHook('PostToolBatch', home, { cwd: root });
  assert.equal(r3.status, 0);
  assert.ok(Date.now() - started < 1500, 'a 4 MB tally must not be read');
  assert.match(context(r3), /GOAL: /, 'and a tally past the threshold fires');
});

// ─────────────────────────────────────────────────────────────────────────────
// MINOR 3 — the sweep
// ─────────────────────────────────────────────────────────────────────────────

test('MINOR 3: the sweep removes a stale file that sits past the 500th directory entry', () => {
  const home = fixtureHome();
  const root = project();
  const env = envFor(home);
  const dir = stateDir(env);
  fs.mkdirSync(dir, { recursive: true });
  const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const stale = [];
  for (let i = 0; i < 700; i++) {
    const f = path.join(dir, `sess-${String(i).padStart(4, '0')}.tally`);
    fs.writeFileSync(f, '.', 'utf8');
    if (i >= 600 && i < 620) { fs.utimesSync(f, longAgo, longAgo); stale.push(f); }
  }
  runHook('SessionStart', home, { cwd: root, input: { source: 'startup' } });
  const left = stale.filter((f) => fs.existsSync(f));
  assert.deepEqual(left, [], 'the round-1 sweep capped the LISTING at 500, so these were never candidates');
  assert.ok(fs.readdirSync(dir).length > 600, 'and fresh files are untouched');
  assert.ok(SWEEP_MAX_UNLINKS === 500, 'the cap is on unlinks, not on the listing');
});

// ─────────────────────────────────────────────────────────────────────────────
// MAJOR 4 — a rejected card is never silent
// ─────────────────────────────────────────────────────────────────────────────

test('MAJOR 4: a malformed card produces exactly one systemMessage at SessionStart and nothing elsewhere', () => {
  const home = fixtureHome();
  const root = project(`${CARD}\nEXTRA: a sixth line`);

  const start = runHook('SessionStart', home, { cwd: root, input: { source: 'startup' } });
  assert.equal(start.status, 0);
  assert.equal(context(start), null, 'no card is injected into the model');
  const msg = sysmsg(start);
  assert.match(msg, /goal card not injected/);
  assert.match(msg, /found 6/, 'the reason is named, not just the fact');
  assert.match(msg, /No goals are being restated/);
  assert.ok(msg.includes(path.join('docs', 'goals', 'card.md')), 'and the path is named');

  const batch = runHook('PostToolBatch', home, { cwd: root, input: {} });
  assert.equal(batch.stdout, '', 'PostToolBatch must not repeat the notice');
});

test('MAJOR 4: a valid card and a missing card both produce no systemMessage', () => {
  const home = fixtureHome();
  for (const root of [project(), project(null)]) {
    const r = runHook('SessionStart', home, { cwd: root, input: { source: 'startup' } });
    assert.equal(sysmsg(r), null);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAJOR 1 — the switch stops every side effect
// ─────────────────────────────────────────────────────────────────────────────

test('MAJOR 1: with a switch file present the hook writes, deletes and reads nothing', () => {
  const root = project();
  for (const name of [MASTER_SWITCH, `ws-off-${SWITCH_NAME}`]) {
    const home = fixtureHome();
    const env = envFor(home);
    // Pre-existing state, including a file the sweep would delete.
    fs.mkdirSync(stateDir(env), { recursive: true });
    const ancient = path.join(stateDir(env), 'ancient.tally');
    fs.writeFileSync(ancient, '....', 'utf8');
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fs.utimesSync(ancient, longAgo, longAgo);
    seedTally(home, BATCHES_PER_REINJECT - 1);
    fs.writeFileSync(path.join(agentsOf(home), name), '', 'utf8');

    const before = homeFingerprint(home);
    for (const [event, input] of [
      ['SessionStart', { source: 'startup' }],
      ['PostToolBatch', {}],
      ['PostCompact', { trigger: 'auto' }],
      ['UserPromptSubmit', {}],
    ]) {
      const r = runHook(event, home, { cwd: root, input });
      assert.equal(r.status, 0, `${name} ${event}`);
      if (event !== 'UserPromptSubmit') assert.equal(r.stdout, '', `${name} ${event} must be silent`);
    }
    assert.equal(homeFingerprint(home), before, `${name}: the agents home must be byte-identical — no write, no sweep, no delete`);
    assert.equal(fs.existsSync(ancient), true, `${name}: the sweep must not run`);
  }
});

test('MAJOR 1: the master switch silences even the routing line; the feature switch does not', () => {
  const root = project();

  const master = fixtureHome();
  fs.writeFileSync(path.join(agentsOf(master), MASTER_SWITCH), '', 'utf8');
  const off = runHook('UserPromptSubmit', master, { cwd: root });
  assert.equal(off.status, 0);
  assert.equal(off.stdout, '', 'ws-off means this hook does nothing at all');

  const feature = fixtureHome();
  fs.writeFileSync(path.join(agentsOf(feature), `ws-off-${SWITCH_NAME}`), '', 'utf8');
  const on = runHook('UserPromptSubmit', feature, { cwd: root });
  assert.match(context(on), /^Routing: /, 'the routing line is not a goal-card feature');
});

// ─────────────────────────────────────────────────────────────────────────────
// Silence: malformed cards, missing cards, odd card paths
// ─────────────────────────────────────────────────────────────────────────────

test('a malformed card injects nothing and exits 0', () => {
  const home = fixtureHome();
  for (const bad of ['GOAL: only one line', `${CARD}\nEXTRA: sixth`, `NOT: x\n${CARD}`, `GOAL: ${'x'.repeat(400)}`]) {
    const root = project(bad);
    const r = runHook('SessionStart', home, { cwd: root, input: { source: 'startup' } });
    assert.equal(r.status, 0);
    assert.equal(context(r), null, `malformed card injected something: ${bad.slice(0, 30)}`);
  }
});

test('MINOR 5: a card path that is not a regular file renders nothing and returns promptly', () => {
  const home = fixtureHome();
  const root = project(null, 'docs/goals/card.md');
  fs.mkdirSync(path.join(root, 'docs', 'goals', 'card.md'), { recursive: true }); // a DIRECTORY
  const started = Date.now();
  const r = runHook('SessionStart', home, { cwd: root, input: { source: 'startup' } });
  assert.equal(r.status, 0);
  assert.equal(context(r), null);
  assert.ok(Date.now() - started < 1500, 'a blocking read would park the hook until the harness cancelled it');

  if (process.platform !== 'win32') {
    const fifoRoot = project(null, 'docs/goals/card.md');
    const fifo = path.join(fifoRoot, 'docs', 'goals', 'card.md');
    fs.mkdirSync(path.dirname(fifo), { recursive: true });
    const made = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
    if (made.status === 0) {
      const t0 = Date.now();
      const rf = runHook('SessionStart', home, { cwd: fifoRoot, input: { source: 'startup' } });
      assert.equal(rf.status, 0);
      assert.equal(context(rf), null);
      assert.ok(Date.now() - t0 < 1500, 'a FIFO with no writer must not be read');
    }
  }
});

test('no card and no project config: a quiet no-op, plus the one short prompt line', () => {
  const home = fixtureHome();
  const bare = tmpdir('reminder-bare-'); // no .agents, no .git, nothing
  for (const event of ['SessionStart', 'PostToolBatch', 'PostCompact']) {
    const r = runHook(event, home, { cwd: bare });
    assert.equal(r.status, 0, event);
    assert.equal(r.stdout, '', event);
  }
  const prompt = runHook('UserPromptSubmit', home, { cwd: bare });
  assert.match(context(prompt), /^Routing: /);
});

// ─────────────────────────────────────────────────────────────────────────────
// Budgets
// ─────────────────────────────────────────────────────────────────────────────

test('the per-prompt payload is under budget, well under what it replaced, and keeps its two clauses', () => {
  const home = fixtureHome();
  const root = project();
  const top = context(runHook('UserPromptSubmit', home, { cwd: root, over: { DELEGATION_TOP_TIER: 'opus' }, input: { model: 'claude-opus-5' } }));
  const exec = context(runHook('UserPromptSubmit', home, { cwd: root, input: { model: 'claude-sonnet-5' } }));
  assert.ok(top.includes('Subagents return a verdict'), 'top tier keeps the economy sentence');
  assert.equal(exec.includes('Subagents return a verdict'), false, 'execution tier does not');
  // MINOR 8: the clauses the shrink dropped, restored.
  for (const clause of ['delegation:team-build', 'before any code', 'delegation:delegate', 'a tier above the writer']) {
    assert.ok(exec.includes(clause), `the routing line lost "${clause}"`);
  }
  for (const [label, text] of [['top', top], ['exec', exec]]) {
    const bytes = Buffer.byteLength(text, 'utf8');
    assert.ok(bytes <= PROMPT_LINE_MAX_BYTES, `${label} prompt line is ${bytes} bytes, over ${PROMPT_LINE_MAX_BYTES}`);
    assert.ok(bytes < LEGACY_PROMPT_BYTES / 2, `${label} prompt line is ${bytes} bytes; the point was to at least halve ${LEGACY_PROMPT_BYTES}`);
  }
});

test('the card payload is under budget wherever it is injected', () => {
  const home = fixtureHome();
  const root = project();
  const sessionText = context(runHook('SessionStart', home, { cwd: root, input: { source: 'startup' } }));
  assert.ok(Buffer.byteLength(sessionText, 'utf8') <= RENDER_MAX_BYTES, 'SessionStart card is over budget');

  seedTally(home, BATCHES_PER_REINJECT - 1, 'agent-budget');
  const batchText = context(runHook('PostToolBatch', home, { cwd: root, input: { agent_id: 'agent-budget', agent_type: 'delegation:builder' } }));
  const bytes = Buffer.byteLength(batchText, 'utf8');
  assert.ok(bytes <= RENDER_MAX_BYTES + SUBAGENT_SUFFIX.length + 1, `PostToolBatch card is ${bytes} bytes`);
});

// ─────────────────────────────────────────────────────────────────────────────
// The protocol: never 2, always parseable, never a block, never truncated
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
  const gone = path.join(os.tmpdir(), 'reminder-does-not-exist-at-all');
  for (const event of events) assert.notEqual(runHook(event, home, { cwd: gone }).status, 2, event);
});

test('every output is a valid harness object, and never a block', () => {
  const home = fixtureHome();
  const root = project();
  for (const [event, input] of [
    ['SessionStart', { source: 'startup' }],
    ['UserPromptSubmit', {}],
  ]) {
    const r = runHook(event, home, { cwd: root, input });
    assert.equal(r.stdout.startsWith('{') && r.stdout.endsWith('}'), true, `${event}: stdout must parse as JSON, not plain text`);
    const j = r.json;
    assert.equal(typeof j.hookSpecificOutput.additionalContext, 'string', event);
    assert.equal(j.hookSpecificOutput.hookEventName, event, event);
    assert.equal('decision' in j, false, `${event}: this hook must never render a decision`);
    assert.equal('continue' in j, false, `${event}: this hook must never stop the loop`);
    assert.equal('stopReason' in j, false, event);
    // MINOR 10: `suppressOutput` is documented as having no effect, so nothing here pins it.
    assert.equal('systemMessage' in j, false, `${event}: a valid card needs nothing on Ben's screen`);
  }
});

test('MINOR 2: the whole payload reaches stdout over a pipe, never a half-written object', async () => {
  const home = fixtureHome();
  const root = project();
  const expected = renderInjection(CARD, fs.statSync(path.join(root, DEFAULT_CARD_PATH)).mtimeMs);
  for (let i = 0; i < 5; i++) {
    const r = await runHookAsync('SessionStart', home, { cwd: root, input: { source: 'startup' } });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.endsWith('}'), true, 'a payload cut short would start with { and not end with }');
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, expected);
  }
});

test('with no event in argv and none on stdin, it behaves as the UserPromptSubmit hook it shipped as', () => {
  const home = fixtureHome();
  const r = runHook('UserPromptSubmit', home, { argv: false, stdin: '{}' });
  assert.equal(r.status, 0);
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(context(r), /^Routing: /);
});

test('a stdin that never closes releases the hook inside its budget', async () => {
  const home = fixtureHome();
  const started = Date.now();
  const status = await new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK, 'UserPromptSubmit'], {
      cwd: os.tmpdir(),
      env: childEnv(home, { AGENTS_HOME: agentsOf(home) }),
    });
    child.stdout.resume();
    child.on('close', resolve);
    child.stdin.write('{"hook_event_name":"UserPromptSubmit"'); // never ended
  });
  const elapsed = Date.now() - started;
  assert.equal(status, 0);
  assert.ok(elapsed < 1500, `the hook held stdin for ${elapsed}ms; round 1 held it for 2042ms`);
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
  const started = Date.now();
  const rounds = 5;
  for (let i = 0; i < rounds; i++) runHook('PostToolBatch', home, { cwd: root });
  const each = (Date.now() - started) / rounds;
  // Node's own startup dominates; the budget is generous on purpose, and a regression that made this
  // hook read the transcript or import the ESM module on the quiet path would blow straight past it.
  assert.ok(each < 400, `below-threshold PostToolBatch averaged ${each}ms`);
  assert.equal(tally(home), rounds);
});
