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
  stateDir, stateKey, tallyFileFor, firedFileFor, staleStateFiles, runCli,
} from './goal-card.mjs';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI = path.join(REPO, 'scripts', 'goal-card.mjs');

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
  const out = renderInjection(GOOD, mtime);
  assert.match(out, /SOURCE: docs\/goals\/batches\.md \(parent: docs\/goals\/program\.md\) — as of 2026-09-20 14:30 NYC$/);
  assert.equal(out.split('\n').length, 6, 'header plus five lines');
  assert.ok(Buffer.byteLength(out, 'utf8') <= RENDER_MAX_BYTES);
});

test('a hand-written as-of on the SOURCE line is replaced, not doubled', () => {
  const stale = GOOD.replace(/\(parent: docs\/goals\/program\.md\)/, '(parent: docs/goals/program.md), as of 2019-01-01');
  const out = renderInjection(stale, Date.parse('2026-09-20T18:30:00Z'));
  assert.equal((out.match(/as of/g) || []).length, 1);
  assert.equal(out.includes('2019-01-01'), false);
});

test('a subagent gets one extra line and the parent does not', () => {
  const plain = renderInjection(GOOD, Date.now());
  const withExtra = renderInjection(GOOD, Date.now(), { extra: 'Name the GOAL line your territory serves.' });
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
  assert.equal(goalCardContext(root, { env: { AGENTS_HOME: tmpdir('goal-card-home-') } }).includes('GOAL:'), true);
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
    const env = { AGENTS_HOME: home };
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
  const out = sink(); const err = sink();
  assert.equal(runCli(['show'], root, out, err), 0);
  assert.equal(out.text().trim(), renderInjection(GOOD, readCard(root).mtimeMs));
  const out2 = sink();
  assert.equal(runCli(['check'], root, out2, sink()), 0);
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
  assert.equal(PROMPT_LINE_MAX_BYTES, 320);
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

  const ok = goalCardResult(project({ card: GOOD }), { env: { AGENTS_HOME: tmpdir('goal-card-home-') } });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.reason, null);
  assert.equal(goalCardResult(project({ card: null }), { env: { AGENTS_HOME: tmpdir('goal-card-home-') } }).status, 'absent');
});

test('MAJOR 4: check names the switch instead of saying ok while nothing is injecting', () => {
  const root = project({ card: GOOD });
  for (const name of [MASTER_SWITCH, `ws-off-${SWITCH_NAME}`]) {
    const home = tmpdir('goal-card-home-');
    fs.writeFileSync(path.join(home, name), '', 'utf8');
    const env = { AGENTS_HOME: home };
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
  const root = project({ card: GOOD });
  const home = tmpdir('goal-card-home-');
  const stdout = execFileSync(process.execPath, [copy, 'check'], {
    cwd: root, encoding: 'utf8', env: childEnv(home, { AGENTS_HOME: path.join(home, '.agents') }),
  });
  assert.match(stdout, /^ok: /, 'the round-1 URL.pathname comparison printed nothing here');
});
