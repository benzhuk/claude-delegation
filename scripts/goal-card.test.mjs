// goal-card — the pure half: locate, read, validate, render, and the CLI's exit codes.
// Nothing here touches the real `~/.agents` or the real project: every case builds its own fixture
// project root and points `AGENTS_HOME` at a temp directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';
import {
  LABELS, CARD_MAX_BYTES, LINE_MAX_BYTES, RENDER_MAX_BYTES, DEFAULT_CARD_PATH, CONFIG_KEY,
  SWITCH_NAME, MASTER_SWITCH, PROMPT_LINE_MAX_BYTES, BATCHES_PER_REINJECT, REINJECT_MAX_MS, CARD_HEADER,
  SWEEP_MAX_UNLINKS, SUBAGENT_SUFFIX, REPORT_LINE_AGENT_ROLES,
  agentsHome, switchedOff, activeSwitch, wantsReportLine, cardLocation, readCard, validateCard,
  renderInjection, asOfStamp, goalCardContext, goalCardResult, rejectionNotice, isMainModule,
  stateDir, stateKey, tallyFileFor, firedFileFor, staleStateFiles, runCli, switchPresent,
  switchErrorMeansPresent,
  knowledgeSessionLine, formatKnowledgeLine, NO_KNOWLEDGE_LOG_SWITCH, KNOWLEDGE_LINE_MAX_BYTES,
  KNOWLEDGE_INDEX_HINT,
} from './goal-card.mjs';
import { storeDir as knowledgeStoreDir, inboxDir as knowledgeInboxDir, readLogPath as knowledgeReadLogPath }
  from './knowledge-counts.mjs';
// Round 2 (MAJOR 3): the two end-to-end tests below drive the real hook adapters (never edited —
// both are outside this territory's file list) to prove the knowledge line actually reaches the
// SessionStart notice through each host, not only through `renderInjection` in isolation.
import { runCodexHook } from '../hooks/multi-codex-hook.mjs';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI = path.join(REPO, 'scripts', 'goal-card.mjs');
const CLAUDE_HOOK = path.join(REPO, 'hooks', 'delegation-reminder.js');

const GOOD = [
  'GOAL: every batch is cheap, fast, recoverable, tracked and metered, and we never lose one.',
  'NOT: a second execution engine. NOT: a new leg or transport to fix a polling bug.',
  'DONE: a killed run resumes from its ledger with zero re-billed work, and spend is visible before it is spent.',
  'KILL: if recovery still needs a human after two weeks, stop and buy a durable engine. Budget: $600.',
  'SOURCE: docs/goals/batches.md (parent: docs/goals/program.md)',
].join('\n');

function tmpdir(prefix = 'goal-card-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * An `env` (or a piece of one) pointing `KNOWLEDGE_HOME` at a fresh, empty scratch directory —
 * guaranteed to have no `.claude/knowledge`, so every pre-existing assertion in this file (about
 * the CARD alone, none of them written with a knowledge line in mind) stays exactly as it was.
 * Without this, every in-process render call below would default to the REAL `homedir()` and
 * pick up whatever this machine's actual `~/.claude/knowledge` happens to contain (see the
 * knowledge-line-specific tests further down for deliberate, fixture-built stores instead).
 */
function noKnowledgeEnv(extra = {}) {
  return { KNOWLEDGE_HOME: tmpdir('goal-card-nostore-'), ...extra };
}

/** A project root with an `.agents/project.json`, optionally a card, optionally a config key. */
function project({ card = null, cardPath = null, projectJson = { name: 'fixture', vcs: 'none' } } = {}) {
  const root = tmpdir('goal-card-proj-');
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
  if (projectJson !== null) {
    const body = cardPath ? { ...projectJson, [CONFIG_KEY]: cardPath } : projectJson;
    fs.writeFileSync(path.join(root, '.agents', 'project.json'), JSON.stringify(body), 'utf8');
  }
  if (card !== null) {
    const file = path.join(root, cardPath || DEFAULT_CARD_PATH);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, card, 'utf8');
  }
  return root;
}

/** A sink that collects writes, so `runCli` can be driven without touching the runner's stdio. */
function sink() {
  const chunks = [];
  return { write: (s) => chunks.push(String(s)), text: () => chunks.join('') };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

test('a well-formed card validates and keeps its five values', () => {
  const v = validateCard(GOOD);
  assert.equal(v.ok, true, v.error || '');
  assert.deepEqual(Object.keys(v.fields), [...LABELS]);
  assert.match(v.fields.NOT, /second execution engine/);
  assert.equal(v.lines.length, 5);
});

test('blank lines, a markdown title and an HTML comment are ignored; a bullet is stripped', () => {
  const decorated = ['# Goal card', '', '<!-- edited 2026-09-20 -->', ...GOOD.split('\n').map((l) => `- ${l}`), ''].join('\n');
  const v = validateCard(decorated);
  assert.equal(v.ok, true, v.error || '');
  assert.equal(v.lines[0].startsWith('GOAL: '), true);
});

test('CRLF line endings validate the same as LF', () => {
  const v = validateCard(`${GOOD.split('\n').join('\r\n')}\r\n`);
  assert.equal(v.ok, true, v.error || '');
});

test('a sixth line, a missing label and a wrong order are each malformed', () => {
  const lines = GOOD.split('\n');
  assert.equal(validateCard(`${GOOD}\nEXTRA: sixth line`).ok, false);
  assert.equal(validateCard(lines.slice(0, 4).join('\n')).ok, false);
  const swapped = [lines[1], lines[0], lines[2], lines[3], lines[4]].join('\n');
  assert.equal(validateCard(swapped).ok, false);
});

test('an empty label value is malformed, and the error names the line', () => {
  const v = validateCard(['GOAL:', ...GOOD.split('\n').slice(1)].join('\n'));
  assert.equal(v.ok, false);
  assert.match(v.error, /line 1 .*GOAL/);
});

test('an over-cap card is REJECTED, never truncated', () => {
  const fat = GOOD.split('\n');
  fat[1] = `NOT: ${'x'.repeat(LINE_MAX_BYTES)}`;
  const v = validateCard(fat.join('\n'));
  assert.equal(v.ok, false);
  assert.match(v.error, new RegExp(`over the ${LINE_MAX_BYTES}-byte line cap`));
  assert.equal(renderInjection(fat.join('\n'), Date.now()), null, 'nothing is rendered from an over-cap card');

  // And the whole-card cap, reached with five lines each legal on their own.
  const wide = LABELS.map((l) => `${l}: ${'y'.repeat(LINE_MAX_BYTES - l.length - 20)}`).join('\n');
  const wv = validateCard(wide);
  assert.equal(wv.ok, false);
  assert.match(wv.error, new RegExp(`over the ${CARD_MAX_BYTES}-byte cap`));
});

test('the fourth line may read STOP instead of KILL, but not any other word', () => {
  const withStop = GOOD.split('\n');
  withStop[3] = 'STOP: if recovery still needs a human after two weeks, stop and buy a durable engine.';
  const v = validateCard(withStop.join('\n'));
  assert.equal(v.ok, true, v.error || '');
  assert.deepEqual(Object.keys(v.fields), [...LABELS], 'fields stay keyed by the canonical KILL label');
  assert.match(v.fields.KILL, /durable engine/);
  assert.equal(v.lines[3].startsWith('STOP: '), true, 'the rendered line keeps the word the file used');
  const injected = renderInjection(withStop.join('\n'), Date.now(), { env: noKnowledgeEnv() });
  assert.match(injected, /^STOP: /m, 'SessionStart output reads STOP for a card that wrote STOP');

  const withHalt = GOOD.split('\n');
  withHalt[3] = 'HALT: if recovery still needs a human after two weeks, stop and buy a durable engine.';
  const hv = validateCard(withHalt.join('\n'));
  assert.equal(hv.ok, false, 'HALT is not an accepted word for the fourth line');
  assert.match(hv.error, /line 4/);
});

test('the caps are ordered so a valid card can always render', () => {
  assert.ok(CARD_MAX_BYTES < RENDER_MAX_BYTES, 'a card at the cap must still fit once rendered');
  assert.ok(RENDER_MAX_BYTES - CARD_MAX_BYTES > CARD_HEADER.length + 40, 'header and stamp need headroom');
});

// ─────────────────────────────────────────────────────────────────────────────
// Rendering and the as-of stamp
// ─────────────────────────────────────────────────────────────────────────────

test('the SOURCE line is stamped from the file mtime, in Ben’s zone', () => {
  // 2026-09-20T18:30:00Z is 14:30 in New York (EDT).
  const mtime = Date.parse('2026-09-20T18:30:00Z');
  assert.equal(asOfStamp(mtime), '2026-09-20 14:30 NYC');
  const out = renderInjection(GOOD, mtime, { env: noKnowledgeEnv() });
  assert.match(out, /SOURCE: docs\/goals\/batches\.md \(parent: docs\/goals\/program\.md\) — as of 2026-09-20 14:30 NYC$/);
  assert.equal(out.split('\n').length, 6, 'header plus five lines');
  assert.ok(Buffer.byteLength(out, 'utf8') <= RENDER_MAX_BYTES);
});

test('a hand-written as-of on the SOURCE line is replaced, not doubled', () => {
  const stale = GOOD.replace(/\(parent: docs\/goals\/program\.md\)/, '(parent: docs/goals/program.md), as of 2019-01-01');
  const out = renderInjection(stale, Date.parse('2026-09-20T18:30:00Z'), { env: noKnowledgeEnv() });
  assert.equal((out.match(/as of/g) || []).length, 1);
  assert.equal(out.includes('2019-01-01'), false);
});

test('a subagent gets one extra line and the parent does not', () => {
  const env = noKnowledgeEnv();
  const plain = renderInjection(GOOD, Date.now(), { env });
  const withExtra = renderInjection(GOOD, Date.now(), { env, extra: 'Name the GOAL line your territory serves.' });
  assert.equal(plain.split('\n').length + 1, withExtra.split('\n').length);
  assert.equal(plain.includes('territory'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Locating, reading, switches
// ─────────────────────────────────────────────────────────────────────────────

test('the card path defaults to docs/goals/card.md and the config key overrides it', () => {
  const plain = project({ card: GOOD });
  assert.equal(cardLocation(plain).path, path.resolve(plain, DEFAULT_CARD_PATH));

  const moved = project({ card: GOOD, cardPath: 'docs/goals/batches.md' });
  assert.equal(cardLocation(moved).path, path.resolve(moved, 'docs/goals/batches.md'));
  assert.equal(readCard(moved).exists, true);
});

test('an absolute goal_card path is used as given', () => {
  const elsewhere = path.join(tmpdir('goal-card-abs-'), 'card.md');
  fs.mkdirSync(path.dirname(elsewhere), { recursive: true });
  fs.writeFileSync(elsewhere, GOOD, 'utf8');
  const root = project({ cardPath: elsewhere });
  assert.equal(cardLocation(root).path, path.resolve(elsewhere));
  assert.equal(goalCardContext(root, { env: noKnowledgeEnv({ AGENTS_HOME: tmpdir('goal-card-home-') }) }).includes('GOAL:'), true);
});

test('NIT 5 (round-1 review): a relative goal_card escape is refused, not followed', () => {
  const outside = tmpdir('goal-card-outside-');
  fs.writeFileSync(path.join(outside, 'evil.md'), GOOD, 'utf8');
  const root = project({ cardPath: `../${path.basename(outside)}/evil.md` });
  const loc = cardLocation(root);
  assert.equal(loc.path, null, 'a relative escape must not resolve to a path at all');
  assert.equal(loc.blind, true);
  // Absolute paths are unaffected: that is an existing, deliberately supported feature, not the bug.
  assert.equal(cardLocation(project({ cardPath: path.join(outside, 'evil.md') })).path, path.resolve(outside, 'evil.md'));
});

test('no card means nothing is rendered, and that is not an error', () => {
  const root = project({ card: null });
  assert.equal(readCard(root).exists, false);
  assert.equal(goalCardContext(root, { env: { AGENTS_HOME: tmpdir('goal-card-home-') } }), null);
});

test('either switch file silences the card', () => {
  const root = project({ card: GOOD });
  for (const name of ['ws-off', `ws-off-${SWITCH_NAME}`]) {
    const home = tmpdir('goal-card-home-');
    const env = noKnowledgeEnv({ AGENTS_HOME: home });
    assert.equal(switchedOff(SWITCH_NAME, env), false);
    assert.ok(goalCardContext(root, { env }), 'a card renders before the switch exists');
    fs.writeFileSync(path.join(home, name), '', 'utf8');
    assert.equal(switchedOff(SWITCH_NAME, env), true, name);
    assert.equal(goalCardContext(root, { env }), null, name);
  }
});

test('AGENTS_HOME points the agents home at a fixture, and defaults to ~/.agents', () => {
  const home = tmpdir('goal-card-home-');
  assert.equal(agentsHome({ AGENTS_HOME: home }), home);
  assert.equal(agentsHome({}), path.join(os.homedir(), '.agents'));
  assert.equal(stateDir({ AGENTS_HOME: home }), path.join(home, 'ws', 'goal-card'));
});

test('a session id and an agent id can never become a path, and the two are different keys', () => {
  const home = tmpdir('goal-card-home-');
  const env = { AGENTS_HOME: home };
  const evil = tallyFileFor('../../etc/passwd', null, env);
  assert.equal(path.dirname(evil), stateDir(env));
  assert.equal(path.basename(evil).includes('/'), false);
  assert.equal(path.basename(tallyFileFor('', null, env)), 'unknown.tally');
  // MAJOR 2a: a subagent must not share the parent's tally.
  assert.notEqual(tallyFileFor('s', 'agent-1', env), tallyFileFor('s', null, env));
  assert.equal(stateKey('s', 'agent-1'), 's.agent-1');
  assert.equal(path.basename(firedFileFor('s', 'agent-1', env)), 's.agent-1.fired');
});

test('the stale sweep lists only files past their age and never throws on a missing dir', () => {
  const home = tmpdir('goal-card-home-');
  const env = { AGENTS_HOME: home };
  assert.deepEqual(staleStateFiles(Date.now(), env), []);
  fs.mkdirSync(stateDir(env), { recursive: true });
  const fresh = tallyFileFor('fresh', null, env);
  const old = tallyFileFor('old', null, env);
  fs.writeFileSync(fresh, '.', 'utf8');
  fs.writeFileSync(old, '.', 'utf8');
  const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  fs.utimesSync(old, longAgo, longAgo);
  assert.deepEqual(staleStateFiles(Date.now(), env), [old]);
});

test('MINOR 3: the sweep list filters BEFORE it caps, so a backlog past the cap still drains', () => {
  const home = tmpdir('goal-card-home-');
  const env = { AGENTS_HOME: home };
  fs.mkdirSync(stateDir(env), { recursive: true });
  const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const stale = [];
  for (let i = 0; i < 40; i++) {
    const f = tallyFileFor(`sess-${String(i).padStart(3, '0')}`, null, env);
    fs.writeFileSync(f, '.', 'utf8');
    if (i >= 30) { fs.utimesSync(f, longAgo, longAgo); stale.push(f); }
  }
  // A cap of 2 must still return the stale files, which sit at listing positions 30-39.
  const capped = staleStateFiles(Date.now(), env, 2);
  assert.equal(capped.length, 2, 'the cap applies to the RESULT, not to how far the listing is read');
  assert.deepEqual(staleStateFiles(Date.now(), env).sort(), stale.sort());
  assert.equal(SWEEP_MAX_UNLINKS, 500);
});

test('a malformed project.json is blind, not a crash', () => {
  const root = tmpdir('goal-card-bad-');
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents', 'project.json'), '{not json', 'utf8');
  const loc = cardLocation(root);
  assert.equal(loc.blind, true);
  assert.equal(goalCardContext(root, { env: { AGENTS_HOME: tmpdir('goal-card-home-') } }), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

test('show prints exactly the injection text; check reports ok', () => {
  const root = project({ card: GOOD });
  const env = noKnowledgeEnv();
  const out = sink(); const err = sink();
  assert.equal(runCli(['show'], root, out, err, env), 0);
  assert.equal(out.text().trim(), renderInjection(GOOD, readCard(root).mtimeMs, { env }));
  const out2 = sink();
  assert.equal(runCli(['check'], root, out2, sink(), env), 0);
  assert.match(out2.text(), /^ok: /);
});

test('a missing card is exit 0, a malformed card exit 1, no project exit 3 — and never 2', () => {
  const missing = project({ card: null });
  assert.equal(runCli(['check'], missing, sink(), sink()), 0);
  assert.equal(runCli(['show'], missing, sink(), sink()), 0);

  const bad = project({ card: 'GOAL: only one line' });
  const err = sink();
  assert.equal(runCli(['check'], bad, sink(), err), 1);
  assert.match(err.text(), /expected exactly 5 card lines/);
  const showOut = sink();
  assert.equal(runCli(['show'], bad, showOut, sink()), 1);
  assert.equal(showOut.text(), '', 'a malformed card prints nothing on stdout');

  // No project root anywhere above: `/` has neither `.agents/project.json` nor `.git`.
  assert.equal(runCli(['check'], path.parse(process.cwd()).root, sink(), sink()), 3);

  assert.equal(runCli(['nonsense'], missing, sink(), sink()), 1);
});

test('the CLI as a child process: real exit codes, and stdout is the card', () => {
  const root = project({ card: GOOD });
  const home = tmpdir('goal-card-home-');
  const stdout = execFileSync(process.execPath, [CLI, 'show'], {
    cwd: root, encoding: 'utf8', env: childEnv(home, { AGENTS_HOME: path.join(home, '.agents') }),
  });
  assert.match(stdout, /^Goal card for this project:\nGOAL: /);

  const bad = project({ card: 'GOAL: only one line' });
  let code = 0;
  try {
    execFileSync(process.execPath, [CLI, 'check'], {
      cwd: bad, encoding: 'utf8', stdio: 'pipe',
      env: childEnv(home, { AGENTS_HOME: path.join(home, '.agents') }),
    });
  } catch (e) {
    code = e.status;
  }
  assert.equal(code, 1, 'a finding is 1');
  assert.notEqual(code, 2, 'exit 2 is BLOCK in the hook protocol and must never be reachable');
});

test('the constants the hook copies are pinned here', () => {
  assert.equal(PROMPT_LINE_MAX_BYTES, 400); // raised from 336 on Ben's word 2026-09-24
  assert.equal(BATCHES_PER_REINJECT, 40);
  assert.equal(REINJECT_MAX_MS, 30 * 60 * 1000);
  assert.equal(SWEEP_MAX_UNLINKS, 500);
  assert.equal(MASTER_SWITCH, 'ws-off');
});

// ─────────────────────────────────────────────────────────────────────────────
// Round 2 additions
// ─────────────────────────────────────────────────────────────────────────────

test('MAJOR 3: wantsReportLine names exactly the three delegation roles, scoped or bare', () => {
  for (const yes of ['delegation:builder', 'delegation:reviewer', 'delegation:integrator',
    'builder', 'REVIEWER', ' integrator ', 'other-plugin:builder']) {
    assert.equal(wantsReportLine(yes), true, yes);
  }
  for (const no of ['Explore', 'Plan', 'general-purpose', 'mrc-memo-writer', 'statusline-setup',
    'builderish', '', null, undefined, 42]) {
    assert.equal(wantsReportLine(no), false, String(no));
  }
  assert.deepEqual([...REPORT_LINE_AGENT_ROLES], ['builder', 'reviewer', 'integrator']);
});

test('MAJOR 4: goalCardResult keeps the REASON a card was refused, and the notice names it', () => {
  const root = project({ card: `${GOOD}\nEXTRA: a sixth line` });
  const r = goalCardResult(root, { env: { AGENTS_HOME: tmpdir('goal-card-home-') } });
  assert.equal(r.status, 'rejected');
  assert.equal(r.text, null);
  assert.match(r.reason, /found 6/);
  const notice = rejectionNotice(r.path, r.reason);
  assert.match(notice, /goal card not injected/);
  assert.match(notice, /No goals are being restated/);
  assert.ok(notice.includes(r.path));
  assert.ok(notice.includes(fileURLToPath(new URL('./goal-card.mjs', import.meta.url))), 'the remedy names the script by its real path');
  assert.ok(!notice.includes('node scripts/goal-card.mjs'), 'no project-relative path a fresh project lacks');

  const ok = goalCardResult(project({ card: GOOD }), { env: noKnowledgeEnv({ AGENTS_HOME: tmpdir('goal-card-home-') }) });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.reason, null);
  assert.equal(goalCardResult(project({ card: null }), { env: { AGENTS_HOME: tmpdir('goal-card-home-') } }).status, 'absent');
});

test('MAJOR 4: check names the switch instead of saying ok while nothing is injecting', () => {
  const root = project({ card: GOOD });
  for (const name of [MASTER_SWITCH, `ws-off-${SWITCH_NAME}`]) {
    const home = tmpdir('goal-card-home-');
    fs.writeFileSync(path.join(home, name), '', 'utf8');
    const env = noKnowledgeEnv({ AGENTS_HOME: home });
    assert.equal(activeSwitch(SWITCH_NAME, env), name);
    const out = sink();
    assert.equal(runCli(['check'], root, out, sink(), env), 0);
    assert.match(out.text(), new RegExp(`^OFF: ${name} is present`), name);
    assert.equal(out.text().includes('ok:'), false, `${name}: check must not answer "ok"`);
  }
  // …and a rejected card still reports its reason with the switch on, rather than hiding behind it.
  const bad = project({ card: 'GOAL: only one line' });
  const home = tmpdir('goal-card-home-');
  fs.writeFileSync(path.join(home, MASTER_SWITCH), '', 'utf8');
  const err = sink();
  assert.equal(runCli(['check'], bad, sink(), err, { AGENTS_HOME: home }), 1);
  assert.match(err.text(), /expected exactly 5 card lines/);
});

test('MINOR 2 (round-1 review): an unreadable switch path counts as present, so the feature goes quiet', () => {
  // The decision table, unit-tested directly: forcing a real EACCES from Node is not reliable on
  // Windows (chmod does not reliably deny stat there), so the pure predicate is what is asserted.
  assert.equal(switchErrorMeansPresent({ code: 'ENOENT' }), false, 'genuinely absent stays absent');
  assert.equal(switchErrorMeansPresent({ code: 'ENOTDIR' }), false, 'a path component that is a file stays absent');
  assert.equal(switchErrorMeansPresent({ code: 'EACCES' }), true, 'permission denied must read as present');
  assert.equal(switchErrorMeansPresent({ code: 'EPERM' }), true, 'operation not permitted must read as present');
  assert.equal(switchErrorMeansPresent({ code: 'EIO' }), true, 'a device that refuses to answer must read as present');
  assert.equal(switchErrorMeansPresent(undefined), false, 'no error at all is not a reason to go quiet');

  // Integration-level: `switchPresent` really calls through to this predicate, not just existsSync.
  const home = tmpdir('goal-card-home-');
  assert.equal(switchPresent(path.join(home, 'does-not-exist')), false, 'a real missing file is absent');
  fs.writeFileSync(path.join(home, 'ws-off'), '', 'utf8');
  assert.equal(switchPresent(path.join(home, 'ws-off')), true, 'a real present file is present');
  // A path with a FILE as one of its own components: statSync throws ENOTDIR, which this fix
  // deliberately keeps in the "absent" bucket (matches the reviewer's own reproduction: pointing
  // AGENTS_HOME at a file did not make the hook treat the switch as present).
  assert.equal(switchPresent(path.join(home, 'ws-off', 'nested')), false, 'a path through a file component stays absent');
});

test('D1 (round-2 delta review): activeSwitch actually routes through switchPresent, in both copies', () => {
  // The MINOR 2 test above pins switchErrorMeansPresent/switchPresent's own truth table, but nothing
  // asserted that activeSwitch's CALL SITES actually use them: reverting both bodies to existsSync
  // left the whole suite green (measured by the reviewer on a copy under SCRATCH\build-goal-card\).
  const mod = fs.readFileSync(path.join(REPO, 'scripts', 'goal-card.mjs'), 'utf8');
  const hook = fs.readFileSync(path.join(REPO, 'hooks', 'delegation-reminder.js'), 'utf8');
  const body = (src) => /function activeSwitch\([^)]*\) \{[\s\S]*?\n\}/.exec(src)[0];
  for (const [name, src] of [['goal-card.mjs', mod], ['delegation-reminder.js', hook]]) {
    assert.equal(/existsSync\(/.test(body(src)), false, `${name}: activeSwitch fell back to existsSync`);
    assert.match(body(src), /switchPresent\(/, `${name}: activeSwitch must use switchPresent`);
  }
});

test('MINOR 5: a card path that is not a regular file is not read', () => {
  const root = project({ card: null });
  fs.mkdirSync(path.join(root, DEFAULT_CARD_PATH), { recursive: true }); // a DIRECTORY at the card path
  const started = Date.now();
  const r = goalCardResult(root, { env: { AGENTS_HOME: tmpdir('goal-card-home-') } });
  assert.equal(r.text, null);
  assert.ok(Date.now() - started < 1000);
});

test('MAJOR 5: isMainModule is true for the real path and survives a path containing a space', () => {
  const self = fileURLToPath(new URL('./goal-card.mjs', import.meta.url));
  assert.equal(isMainModule(new URL('./goal-card.mjs', import.meta.url).href, self), true);
  assert.equal(isMainModule(new URL('./goal-card.mjs', import.meta.url).href, undefined), false);

  const spaced = path.join(tmpdir('goal card spaced-'), 'has space');
  fs.mkdirSync(spaced, { recursive: true });
  const copy = path.join(spaced, 'goal-card.mjs');
  fs.copyFileSync(CLI, copy);
  fs.copyFileSync(path.join(REPO, 'scripts', 'project-config.mjs'), path.join(spaced, 'project-config.mjs'));
  fs.copyFileSync(path.join(REPO, 'scripts', 'knowledge-counts.mjs'), path.join(spaced, 'knowledge-counts.mjs'));
  const canonicalConfig = path.join(path.dirname(spaced), 'skills', 'decisions', 'scripts', 'project-config.mjs');
  fs.mkdirSync(path.dirname(canonicalConfig), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'skills', 'decisions', 'scripts', 'project-config.mjs'), canonicalConfig);
  const root = project({ card: GOOD });
  const home = tmpdir('goal-card-home-');
  const stdout = execFileSync(process.execPath, [copy, 'check'], {
    cwd: root, encoding: 'utf8', env: childEnv(home, { AGENTS_HOME: path.join(home, '.agents') }),
  });
  assert.match(stdout, /^ok: /, 'the round-1 URL.pathname comparison printed nothing here');
});

// ─────────────────────────────────────────────────────────────────────────────
// The knowledge line (spec.md Territory K2, combined with K3 in the Lead addendum)
// ─────────────────────────────────────────────────────────────────────────────

/** A `.claude/knowledge` + `.agents/knowledge/read.log` pair under one scratch home. */
function mkKnowledgeHome({ topics = [], inbox = [], readLines = [] } = {}) {
  const home = tmpdir('goal-card-knowhome-');
  const store = knowledgeStoreDir(home);
  fs.mkdirSync(store, { recursive: true });
  for (const name of topics) fs.writeFileSync(path.join(store, name), '# topic\n');
  const inboxD = knowledgeInboxDir(home);
  fs.mkdirSync(inboxD, { recursive: true });
  for (const name of inbox) fs.writeFileSync(path.join(inboxD, name), 'note\n');
  if (readLines.length) {
    const logPath = knowledgeReadLogPath(home);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, readLines.join('\n') + '\n');
  }
  return home;
}

test('knowledge line: absent store means null, not an error', () => {
  assert.equal(knowledgeSessionLine({ env: noKnowledgeEnv() }), null);
});

test('knowledge line: exact rendered text matches spec.md K2 item 1\'s template', () => {
  const home = mkKnowledgeHome({
    topics: ['ai-sdk.md', 'orca.md', 'INDEX.md', '_private.md'],
    inbox: ['2026-09-20-a.md', '2026-09-24-b.md'],
    readLines: [`${new Date('2026-09-26T12:00:00Z').toISOString()} Read /x/orca.md session-a`],
  });
  const now = Date.parse('2026-09-27T12:00:00Z');
  const line = knowledgeSessionLine({ env: { KNOWLEDGE_HOME: home }, now });
  assert.equal(
    line,
    'knowledge: 2 topics, 2 inbox notes pending (oldest 2026-09-20), 1 topic reads on this host in 7 days; INDEX ~/.claude/knowledge/INDEX.md',
  );
  assert.ok(Buffer.byteLength(line, 'utf8') <= KNOWLEDGE_LINE_MAX_BYTES);
});

test('knowledge line: zero pending notes reads "0 inbox notes pending", no oldest parenthetical', () => {
  const home = mkKnowledgeHome({ topics: ['orca.md'] });
  const line = knowledgeSessionLine({ env: { KNOWLEDGE_HOME: home }, now: Date.now() });
  assert.match(line, /^knowledge: 1 topics, 0 inbox notes pending, 0 topic reads on this host in 7 days; INDEX/);
});

test('knowledge line: the no-knowledge-log switch silences it; the master ws-off switch already does (upstream)', () => {
  const home = mkKnowledgeHome({ topics: ['orca.md'] });
  const agentsDir = tmpdir('goal-card-agentshome-');
  fs.writeFileSync(path.join(agentsDir, NO_KNOWLEDGE_LOG_SWITCH), '', 'utf8');
  const env = { KNOWLEDGE_HOME: home, AGENTS_HOME: agentsDir };
  assert.equal(knowledgeSessionLine({ env, now: Date.now() }), null);
});

test('knowledgeSessionLine itself ignores ws-off-goalcard (goalCardResult still gates it upstream)', () => {
  const home = mkKnowledgeHome({ topics: ['orca.md'] });
  const agentsDir = tmpdir('goal-card-agentshome-');
  fs.writeFileSync(path.join(agentsDir, 'ws-off-goalcard'), '', 'utf8');
  const env = { KNOWLEDGE_HOME: home, AGENTS_HOME: agentsDir };
  assert.ok(knowledgeSessionLine({ env, now: Date.now() }));
});

test('formatKnowledgeLine: pure, no filesystem — the full template fits easily under cap', () => {
  const line = formatKnowledgeLine({ topics: 16, pending: 44, oldest: '2026-09-20', reads: 0 });
  assert.equal(
    line,
    'knowledge: 16 topics, 44 inbox notes pending (oldest 2026-09-20), 0 topic reads on this host in 7 days; INDEX ~/.claude/knowledge/INDEX.md',
  );
});

test('formatKnowledgeLine: over the line cap with the INDEX hint drops the hint, keeps the counts', () => {
  // A pathologically large R (30 digits) is the simplest way to force the full template past 160
  // bytes without needing tens of thousands of real fixture files on disk.
  const bigReads = '9'.repeat(30);
  const counts = { topics: 1, pending: 1, oldest: '2026-09-20', reads: bigReads };
  const full = `knowledge: ${counts.topics} topics, ${counts.pending} inbox notes pending (oldest ${counts.oldest}), ${counts.reads} topic reads on this host in 7 days; INDEX ${KNOWLEDGE_INDEX_HINT}`;
  assert.ok(Buffer.byteLength(full, 'utf8') > KNOWLEDGE_LINE_MAX_BYTES, 'fixture must actually exceed the cap to test the fallback');
  const line = formatKnowledgeLine(counts);
  assert.equal(line.includes('INDEX'), false, 'the INDEX hint is dropped first');
  assert.equal(line, `knowledge: 1 topics, 1 inbox notes pending (oldest 2026-09-20), ${bigReads} topic reads on this host in 7 days`);
  assert.ok(Buffer.byteLength(line, 'utf8') <= KNOWLEDGE_LINE_MAX_BYTES);
});

test('formatKnowledgeLine: pathological (even the shortened line is over cap) returns null, never truncates', () => {
  const counts = { topics: 1, pending: 1, oldest: '2026-09-20', reads: '9'.repeat(65) };
  const line = formatKnowledgeLine(counts);
  assert.equal(line, null);
});

test('renderInjection: the knowledge line rides after the card and before the subagent extra', () => {
  // Round 2 (BLOCKER 1): renderInjection is pure again — it takes `opts.knowledgeLine` rather
  // than computing it itself, so this test computes it the same way `goalCardResult` now does.
  const home = mkKnowledgeHome({ topics: ['orca.md', 'react.md'], inbox: ['2026-09-24-a.md'] });
  const env = { KNOWLEDGE_HOME: home };
  const now = Date.now();
  const knowledgeLine = knowledgeSessionLine({ env, now });
  const out = renderInjection(GOOD, now, { extra: 'Name the GOAL line your territory serves.', knowledgeLine });
  const linesOut = out.split('\n');
  assert.equal(linesOut.length, 8, 'header + 5 card lines + knowledge + extra');
  assert.match(linesOut[6], /^knowledge: 2 topics, 1 inbox notes pending \(oldest 2026-09-24\), 0 topic reads/);
  assert.equal(linesOut[7], 'Name the GOAL line your territory serves.');
});

test('renderInjection: over the render cap with the knowledge line added, the line is dropped, card and extra survive', () => {
  // Round 2 (BLOCKER 1): drive the knowledge line in through `opts.knowledgeLine`, the same shape
  // `goalCardResult` now builds, rather than `renderInjection` computing it from `env` itself.
  const home = mkKnowledgeHome({ topics: ['orca.md'] });
  const env = { KNOWLEDGE_HOME: home };
  const now = Date.now();
  const knowledgeLine = knowledgeSessionLine({ env, now });
  // A card near CARD_MAX_BYTES (well under LINE_MAX_BYTES per line) plus a long `extra` line eats
  // most of the render headroom (RENDER_MAX_BYTES - CARD_MAX_BYTES), leaving no room for the
  // knowledge line too — sized against the actual `formatKnowledgeLine` output below, not a
  // guess, so this stays correct if either byte cap ever changes.
  const overhead = LABELS.reduce((s, l) => s + l.length + 2, 0);
  const per = Math.floor((CARD_MAX_BYTES - overhead - 5) / LABELS.length);
  const packed = LABELS.map((l, i) => (i === 4 ? `${l}: docs/goals/x.md` : `${l}: ${'z'.repeat(per)}`)).join('\n');
  assert.equal(validateCard(packed).ok, true, 'fixture card must itself be valid');

  const knowledgeLineBytes = Buffer.byteLength(formatKnowledgeLine({ topics: 1, pending: 0, oldest: null, reads: 0 }), 'utf8');
  const withoutKnowledgeBytes = Buffer.byteLength(renderInjection(packed, now, { extra: 'x' }), 'utf8');
  // Room left before RENDER_MAX_BYTES once card + a 1-byte extra + its own newlines are in;
  // an extra sized to use most of it, but leave less than the knowledge line + its newline needs.
  const room = RENDER_MAX_BYTES - withoutKnowledgeBytes;
  assert.ok(room > knowledgeLineBytes, 'fixture is unusable: no room to demonstrate the drop at all');
  const extraLen = room - Math.floor(knowledgeLineBytes / 2);
  const extra = 'x'.repeat(extraLen);

  const withoutKnowledge = renderInjection(packed, now, { extra });
  assert.notEqual(withoutKnowledge, null, 'fixture must actually render without the knowledge line');
  const withKnowledge = renderInjection(packed, now, { extra, knowledgeLine });
  assert.equal(withKnowledge, withoutKnowledge, 'the knowledge line was dropped; card and extra are untouched');
});

// ─────────────────────────────────────────────────────────────────────────────
// End to end (round-2 review, MAJOR 3): the knowledge line proven through each host's real
// adapter, not only through `renderInjection`/`goalCardResult` called directly. Neither
// `hooks/multi-codex-hook.mjs` nor `hooks/delegation-reminder.js` is edited here (both are
// outside this territory, per the brief's NOT list) — these tests only drive them.
// ─────────────────────────────────────────────────────────────────────────────

/** A minimal, valid Codex `session_meta` first line naming a confirmed lead (no spawn/child
 * shape at all — `classifyCodexRole`'s "no spawn" branch, matching a real `cli`-launched lead). */
function codexLeadMetadata(sessionId) {
  return `${JSON.stringify({ type: 'session_meta', payload: { id: sessionId, session_id: sessionId, source: 'cli' } })}\n`;
}

function codexTranscript(dir, content) {
  const file = path.join(dir, 'session.jsonl');
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

test('end to end (Codex): a confirmed lead SessionStart carries the exact knowledge line through runCodexHook', async () => {
  const sessionId = 'k23-codex-e2e-lead-session';
  const transcriptHome = tmpdir('goal-card-codex-transcript-');
  const file = codexTranscript(transcriptHome, codexLeadMetadata(sessionId));
  const root = project({ card: GOOD });
  const home = mkKnowledgeHome({ topics: ['orca.md'] }); // topics:1, pending:0, oldest:null, reads:0
  const env = { AGENTS_HOME: path.join(home, '.agents') }; // no KNOWLEDGE_HOME: exercises the M1 fallback
  const out = await runCodexHook(
    { hook_event_name: 'SessionStart', session_id: sessionId, transcript_path: file, cwd: root },
    { home, env },
  );
  const context = out?.output?.hookSpecificOutput?.additionalContext ?? '';
  assert.match(context, /GOAL: every batch is cheap/, 'the card itself must still be present');
  assert.ok(
    context.includes(
      'knowledge: 1 topics, 0 inbox notes pending, 0 topic reads on this host in 7 days; INDEX ~/.claude/knowledge/INDEX.md',
    ),
    `knowledge line missing from Codex additionalContext: ${context}`,
  );
});

test('end to end (Claude): a spawned delegation-reminder.js SessionStart carries the exact knowledge line', () => {
  const home = mkKnowledgeHome({ topics: ['orca.md'] }); // topics:1, pending:0, oldest:null, reads:0
  const root = project({ card: GOOD });
  const payload = JSON.stringify({ hook_event_name: 'SessionStart', cwd: root, session_id: 'k23-claude-e2e-session' });
  const stdout = execFileSync(process.execPath, [CLAUDE_HOOK, 'SessionStart'], {
    input: payload,
    encoding: 'utf8',
    // No KNOWLEDGE_HOME: exercises the M1 fallback (AGENTS_HOME's dirname). `HOME`/`USERPROFILE`
    // are also this fixture home (childEnv), so even the un-overridden `homedir()` path would agree.
    env: childEnv(home, { AGENTS_HOME: path.join(home, '.agents') }),
  });
  const context = JSON.parse(stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /GOAL: every batch is cheap/, 'the card itself must still be present');
  assert.ok(
    context.includes(
      'knowledge: 1 topics, 0 inbox notes pending, 0 topic reads on this host in 7 days; INDEX ~/.claude/knowledge/INDEX.md',
    ),
    `knowledge line missing from Claude additionalContext: ${context}`,
  );
});
