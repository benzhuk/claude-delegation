import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { childEnv, scratchHome } from '../../skills/multi/scripts/test-child-env.mjs';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const HELPER = path.join(REPO, 'hooks', 'lib', 'goal-context.mjs');
const CARD = [
  'GOAL: Preserve the card when bearings is unavailable.',
  'NOT: couple optional host advice to card rendering.',
  'DONE: the card remains available.',
  'KILL: do not rename shipped source files.',
  'SOURCE: docs/goals/card.md (parent: docs/goals/program.md)',
].join('\n');

test('a copied helper keeps card rendering when its optional bearings module is absent', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-context-copy-'));
  const project = path.join(root, 'project');
  const agentsHome = path.join(root, 'agents');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'hooks', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(project, '.agents'), { recursive: true });
  fs.mkdirSync(path.join(project, 'docs', 'goals'), { recursive: true });
  fs.writeFileSync(path.join(project, '.agents', 'project.json'), '{}');
  fs.writeFileSync(path.join(project, 'docs', 'goals', 'card.md'), CARD);
  fs.copyFileSync(HELPER, path.join(root, 'hooks', 'lib', 'goal-context.mjs'));
  fs.symlinkSync(path.join(REPO, 'scripts'), path.join(root, 'scripts'), 'junction');

  const copied = await import(pathToFileURL(path.join(root, 'hooks', 'lib', 'goal-context.mjs')).href);
  const card = await copied.cardResult(project, undefined, { env: { AGENTS_HOME: agentsHome } });
  assert.equal(card.status, 'ok');
  assert.match(card.text ?? '', /GOAL: Preserve the card/);
  assert.equal(await copied.bearingsNotice(project, { env: { AGENTS_HOME: agentsHome } }), null);
});

// Lane 47, P8: a completion receipt is keyed on the project's MAIN checkout. bearingsNotice used to
// pass a linked worktree's OWN path straight to bearings-state's `check`, which walks up from that
// path and stops at the worktree's own `.git` — a different project root, and therefore a different
// receipt file, than the one the main checkout resolves to. So a SessionStart notice run inside a
// worktree pane said "Bearings are due" even seconds after an independent, current receipt was
// published for that same repository. Must fail on base d6f5c9d (red) before the fix, pass after it
// (green).
test('bearings receipt written for the main checkout reads current from a linked worktree', async (t) => {
  const bearingsHome = scratchHome(fs, 'goal-context-bearings-home-');
  t.after(() => { try { fs.rmSync(bearingsHome, { recursive: true, force: true }); } catch {} });

  // Real git fixtures need a real commit identity. Under `run-tests.mjs`'s sealed run,
  // `GIT_CONFIG_GLOBAL` carries an `includeIf` that only matches a gitdir under `FIXTURE_ROOT` (see
  // test-home.mjs's own doc comment) - so every repo this test builds must sit inside that root, the
  // same way scripts/janitor.test.mjs's own `mkTmp` does. Falls back to `os.tmpdir()` when this file
  // runs standalone, outside the sealed harness. No custom env override needed: the ambient
  // `process.env` (sealed or not) already carries whatever identity is available.
  const parent = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), 'goal-context-bearings-repo-'));
  t.after(() => { try { fs.rmSync(parent, { recursive: true, force: true }); } catch {} });
  const main = path.join(parent, 'main');
  fs.mkdirSync(main, { recursive: true });
  const gitEnv = childEnv(os.homedir());
  execFileSync('git', ['init', '-q', main], { env: gitEnv });
  fs.mkdirSync(path.join(main, 'docs', 'goals'), { recursive: true });
  fs.writeFileSync(path.join(main, 'docs', 'goals', 'card.md'), 'GOAL: fixture\nNOT: nothing\nDONE: nothing\nKILL: nothing\n');
  execFileSync('git', ['-C', main, 'add', '-A'], { env: gitEnv });
  execFileSync('git', ['-C', main, 'commit', '-qm', 'seed'], { env: gitEnv });
  execFileSync('git', ['-C', main, 'branch', '-q', 'feature'], { env: gitEnv });
  const worktree = path.join(parent, 'wt');
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', worktree, 'feature'], { env: gitEnv });

  const report = path.join(parent, 'report.md');
  const response = path.join(parent, 'response.md');
  fs.writeFileSync(report, 'review\n');
  fs.writeFileSync(response, 'lead\n');

  const { complete } = await import(pathToFileURL(path.join(REPO, 'skills', 'bearings', 'scripts', 'bearings-state.mjs')).href);
  const bearingsEnv = { AGENTS_HOME: bearingsHome };
  complete({
    repo: main, report, leadResponse: response, publication: 'https://example.test/decision',
    reviewerId: 'reviewer-a', leadId: 'lead-b', env: bearingsEnv,
  });

  // `bearings-state.mjs check --repo .` run from the MAIN checkout already agrees the receipt is
  // current — this is the resolution goal-context.mjs's own bearingsNotice must now match.
  const { check } = await import(pathToFileURL(path.join(REPO, 'skills', 'bearings', 'scripts', 'bearings-state.mjs')).href);
  assert.equal(check({ repo: main, env: bearingsEnv }).status, 'current');

  const { bearingsNotice } = await import(pathToFileURL(HELPER).href);
  const notice = await bearingsNotice(worktree, { env: bearingsEnv });
  assert.equal(notice, null, 'a current main-checkout receipt must silence the worktree pane\'s notice too');
});

// Review r1, F2: the fix above (checking the main checkout first) is a regression for the OTHER
// direction — a receipt completed FROM a linked worktree (a lead in an Orca worktree pane running
// `complete --repo .`, per SKILL.md) is keyed on that worktree, not the main checkout. Checking only
// `mainCheckout(cwd)` misses it entirely and the notice wrongly says "Bearings are due" even though
// `bearings-state.mjs check --repo .` run in that same worktree already agrees the receipt is
// current. Must fail at 1b6a5d5 (red) before this patch, pass after it (green).
test('bearings receipt completed from a linked worktree still reads current from that worktree', async (t) => {
  const bearingsHome = scratchHome(fs, 'goal-context-bearings-home-');
  t.after(() => { try { fs.rmSync(bearingsHome, { recursive: true, force: true }); } catch {} });

  const parent = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), 'goal-context-bearings-repo-'));
  t.after(() => { try { fs.rmSync(parent, { recursive: true, force: true }); } catch {} });
  const main = path.join(parent, 'main');
  fs.mkdirSync(main, { recursive: true });
  const gitEnv = childEnv(os.homedir());
  execFileSync('git', ['init', '-q', main], { env: gitEnv });
  fs.mkdirSync(path.join(main, 'docs', 'goals'), { recursive: true });
  fs.writeFileSync(path.join(main, 'docs', 'goals', 'card.md'), 'GOAL: fixture\nNOT: nothing\nDONE: nothing\nKILL: nothing\n');
  execFileSync('git', ['-C', main, 'add', '-A'], { env: gitEnv });
  execFileSync('git', ['-C', main, 'commit', '-qm', 'seed'], { env: gitEnv });
  execFileSync('git', ['-C', main, 'branch', '-q', 'feature'], { env: gitEnv });
  const worktree = path.join(parent, 'wt');
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', worktree, 'feature'], { env: gitEnv });

  const report = path.join(parent, 'report.md');
  const response = path.join(parent, 'response.md');
  fs.writeFileSync(report, 'review\n');
  fs.writeFileSync(response, 'lead\n');

  const { complete, check } = await import(pathToFileURL(path.join(REPO, 'skills', 'bearings', 'scripts', 'bearings-state.mjs')).href);
  const bearingsEnv = { AGENTS_HOME: bearingsHome };
  complete({
    repo: worktree, report, leadResponse: response, publication: 'https://example.test/decision',
    reviewerId: 'reviewer-a', leadId: 'lead-b', env: bearingsEnv,
  });

  // `bearings-state.mjs check --repo .` run from the WORKTREE already agrees the receipt is
  // current — this is the resolution goal-context.mjs's own bearingsNotice must now honour too.
  assert.equal(check({ repo: worktree, env: bearingsEnv }).status, 'current');

  const { bearingsNotice } = await import(pathToFileURL(HELPER).href);
  const notice = await bearingsNotice(worktree, { env: bearingsEnv });
  assert.equal(notice, null, 'a current worktree-keyed receipt must silence that same worktree\'s notice');
});
