// Tests for the P4 fold: notion-writing and dev-server move from CLAUDE_SKILLS (sourced from
// ~/.claude/skills/<name>, silently skipped if absent) into PLUGIN_SKILLS (sourced from
// <repo>/skills/<name>, hard-refused if SKILL.md is missing).
//
// `HOME` in mirror-shared-skills.mjs is `os.homedir()` resolved once at module load from the
// process's own environment, so an IMPORTING process cannot retarget it — this file therefore never
// runs the CLI (guarded behind isMainModule() anyway) and never runs the script at all, dry-run or
// not (common.md ban). It imports the exported `collectSources()` and inspects the plain data it
// returns, which proves the two skills ACTUALLY resolve under <repo>/skills/ rather than merely
// having their names present in the right array (the failure class this build watches for: a
// copy-paste into the wrong array, or a typo in the directory name under skills/, would leave the
// string present in PLUGIN_SKILLS but the mirror silently sourcing nothing or the wrong path).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  PLUGIN_SKILLS, CLAUDE_SKILLS, collectSources, isNewerVersion,
} from './mirror-shared-skills.mjs';
import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const MIRROR = path.join(HERE, 'mirror-shared-skills.mjs');

test('PLUGIN_SKILLS includes notion-writing, dev-server, bearings, continue, and janitor', () => {
  assert.ok(PLUGIN_SKILLS.includes('notion-writing'), 'notion-writing must be in PLUGIN_SKILLS');
  assert.ok(PLUGIN_SKILLS.includes('dev-server'), 'dev-server must be in PLUGIN_SKILLS');
  assert.ok(PLUGIN_SKILLS.includes('bearings'), 'bearings must be in PLUGIN_SKILLS');
  assert.ok(PLUGIN_SKILLS.includes('continue'), 'continue must be in PLUGIN_SKILLS');
  assert.ok(PLUGIN_SKILLS.includes('janitor'), 'janitor must be in PLUGIN_SKILLS (lane five, J2)');
});

test('CLAUDE_SKILLS no longer includes dev-server', () => {
  assert.ok(!CLAUDE_SKILLS.includes('dev-server'), 'dev-server must be removed from CLAUDE_SKILLS');
});

test('plugin skills actually resolve to sources under <repo>/skills/, not ~/.claude/skills/', () => {
  const sources = collectSources();
  const byName = Object.fromEntries(sources.filter((s) => s.kind === 'skill').map((s) => [s.name, s]));

  for (const name of ['notion-writing', 'dev-server', 'bearings', 'continue', 'janitor']) {
    const entry = byName[name];
    assert.ok(entry, `${name} did not resolve to any skill source at all`);
    const expected = path.join(REPO, 'skills', name);
    assert.equal(
      path.resolve(entry.src),
      path.resolve(expected),
      `${name} source must be ${expected}, got ${entry.src}`,
    );
    assert.ok(
      entry.src.startsWith(path.join(REPO, 'skills')),
      `${name} source must start with <repo>/skills/, got ${entry.src}`,
    );
    assert.ok(
      !entry.src.includes(path.join('.claude', 'skills')),
      `${name} source must not come from ~/.claude/skills/, got ${entry.src}`,
    );
  }
});

test('work-record.md resolves as a shared document into the synthetic Codex docs home', () => {
  const source = collectSources().find((entry) => entry.kind === 'doc' && entry.name === 'work-record.md');
  assert.ok(source, 'work-record.md must be a shared document source');
  assert.equal(path.resolve(source.src), path.join(REPO, 'docs', 'work-record.md'));
  assert.equal(
    path.resolve(source.dest),
    path.join(os.homedir(), '.agents', 'skills', '_docs', 'work-record.md'),
    'shared document must be copied into the synthetic Codex docs home',
  );
});

// D11/F8 — `isNewerVersion` is a pure helper, so it is covered in-process here rather than through a
// child-process fixture; `mirror-shim.test.mjs` (D12) covers the full guarded-run behaviour, which
// needs HOME redirected via a real child process.
test('isNewerVersion: clearly newer major', () => {
  assert.equal(isNewerVersion('1.0.0', '0.9.9'), true);
});

test('isNewerVersion: clearly older major', () => {
  assert.equal(isNewerVersion('0.9.9', '1.0.0'), false);
});

test('isNewerVersion: equal versions are not "newer"', () => {
  assert.equal(isNewerVersion('0.12.0', '0.12.0'), false);
});

test('isNewerVersion: F8 table case — "0.13.0" vs "0.5.0" is newer as semver though not as a string', () => {
  assert.equal('0.13.0' < '0.5.0', true, 'sanity: the naive string comparison gets this backwards');
  assert.equal(isNewerVersion('0.13.0', '0.5.0'), true);
});

test('isNewerVersion: compares left to right — minor and patch decide when major ties', () => {
  assert.equal(isNewerVersion('1.2.3', '1.3.0'), false);
  assert.equal(isNewerVersion('1.3.0', '1.2.9'), true);
  assert.equal(isNewerVersion('1.2.3', '1.2.4'), false);
  assert.equal(isNewerVersion('1.2.4', '1.2.3'), true);
});

test('isNewerVersion: a prerelease/build suffix after the third component is ignored', () => {
  assert.equal(isNewerVersion('1.2.3-beta.1', '1.2.3'), false);
  assert.equal(isNewerVersion('1.2.4-beta.1', '1.2.3'), true);
});

test('isNewerVersion: malformed on either side is null, never true or false', () => {
  assert.equal(isNewerVersion('not-a-version', '1.0.0'), null);
  assert.equal(isNewerVersion('1.0.0', 'not-a-version'), null);
  assert.equal(isNewerVersion('1.0', '1.0.0'), null, 'fewer than three dot-separated components fails to parse');
  assert.equal(isNewerVersion(null, '1.0.0'), null, 'a missing pluginVersion (no manifest field) is null');
  assert.equal(isNewerVersion(undefined, '1.0.0'), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// delete-deny Territory D2 — hooks/delete-guard.mjs wired as a Codex PreToolUse hook, behind its own
// opt-in flag. A real child process, exactly like `skills/multi/scripts/mirror-shim.test.mjs` uses for
// every other installer-behaviour case in this file's family — HOME/APPDATA/LOCALAPPDATA are all faked
// so `codexHomes()` can never reach a real Codex home on this machine (the 2026-09-14 incident that
// file's own header documents).
// ─────────────────────────────────────────────────────────────────────────────

function fakeCodexEnv(home) {
  const env = childEnv(home);
  env.APPDATA = path.join(home, 'AppData', 'Roaming');
  env.LOCALAPPDATA = path.join(home, 'AppData', 'Local');
  delete env.CODEX_HOME;
  return env;
}

function runMirrorOnly(args, home) {
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [MIRROR, '--codex-hooks-only', ...args, '--json'], {
      encoding: 'utf8', env: fakeCodexEnv(home),
    });
  } catch (err) {
    stdout = String(err.stdout ?? '');
  }
  return JSON.parse(stdout);
}

test('D2: --codex-hooks-delete-guard is its OWN flag — --codex-hooks alone never wires it', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-delete-guard-off-'));
  const codex = path.join(home, 'scratch-codex');
  fs.mkdirSync(codex, { recursive: true });

  const json = runMirrorOnly(['--codex-home', codex], home);
  assert.deepEqual(json.codexDeleteGuardHooks, [], '--codex-hooks-only without the extra flag must not touch the guard');
  assert.equal(fs.existsSync(path.join(codex, 'hooks.json')), true, 'the note-delivery hook still installs');
  const hooks = JSON.parse(fs.readFileSync(path.join(codex, 'hooks.json'), 'utf8'));
  assert.equal(hooks.hooks.PreToolUse, undefined, 'no PreToolUse group was ever created for the note hooks');
});

test('D2: --codex-hooks-delete-guard wires (or cleanly refuses) hooks/delete-guard.mjs, independent of --codex-hooks', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-delete-guard-on-'));
  const codex = path.join(home, 'scratch-codex');
  fs.mkdirSync(codex, { recursive: true });

  // `--codex-hooks-only` always wires the note-delivery hooks too (its documented behaviour since
  // before this build); what THIS flag adds is the extra `codexDeleteGuardHooks` entry alongside it,
  // with neither script's group colliding with the other's in the same hooks.json.
  const json = runMirrorOnly(['--codex-home', codex, '--codex-hooks-delete-guard'], home);
  assert.ok(json.codexHooks.length > 0, 'the note-delivery hooks still install alongside the guard');

  const deleteGuardScript = path.join(REPO, 'hooks', 'delete-guard.mjs');
  if (!fs.existsSync(deleteGuardScript)) {
    // D1's script (spec: Territory D1) may not exist in this worktree yet — the contract this build
    // codes against. Nothing must crash, and silence would be worse than a guard nobody thought to
    // check for: a missing script is a REFUSAL, named, not a silent no-op.
    assert.equal(json.ok, false);
    assert.ok(
      json.refusals.some((r) => /missing .*delete-guard.*hook script/.test(r)),
      `expected a named refusal for the missing script, got:\n${json.refusals.join('\n')}`,
    );
    assert.deepEqual(json.codexDeleteGuardHooks, []);
  } else {
    assert.equal(json.ok, true, JSON.stringify(json.refusals));
    assert.equal(json.codexDeleteGuardHooks.length, 1);
    assert.equal(json.codexDeleteGuardHooks[0].wroteHooks, true);
    const hooks = JSON.parse(fs.readFileSync(path.join(codex, 'hooks.json'), 'utf8'));
    assert.ok(hooks.hooks.PreToolUse[0].hooks[0].command.includes('delete-guard.mjs'));
  }
});
