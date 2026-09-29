// Tests for the P4 fold: notion-writing and dev-server move from CLAUDE_SKILLS (sourced from
// ~/.claude/skills/<name>, silently skipped if absent) into PLUGIN_SKILLS (sourced from
// <repo>/skills/<name>, hard-refused if SKILL.md is missing).
//
// `HOME` in mirror-shared-skills.mjs is `os.homedir()` resolved once at module load from the
// process's own environment, so an IMPORTING process cannot retarget it — the tests that import it
// therefore never run the CLI in-process (guarded behind isMainModule() anyway). The tests that DO run
// the script (the D2 hook cases and the lane 39 case at the bottom) spawn a child process whose home,
// APPDATA and LOCALAPPDATA are faked (`fakeCodexEnv`). The rest imports the exported `collectSources()` and inspects the plain data it
// returns, which proves the two skills ACTUALLY resolve under <repo>/skills/ rather than merely
// having their names present in the right array (the failure class this build watches for: a
// copy-paste into the wrong array, or a typo in the directory name under skills/, would leave the
// string present in PLUGIN_SKILLS but the mirror silently sourcing nothing or the wrong path).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
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
// delete-deny Territory D2 — hooks/delete-guard.mjs wired as a Codex PreToolUse hook, riding along with
// the existing --codex-hooks/--codex-hooks-only opt-in (no separate flag: the deny shape it relies on is
// established, not merely assumed — see docs/notes/2026-09-27-delete-deny-codex-pretooluse-gap.md). A
// real child process, exactly like `skills/multi/scripts/mirror-shim.test.mjs` uses for every other
// installer-behaviour case in this file's family — HOME/APPDATA/LOCALAPPDATA are all faked so
// `codexHomes()` can never reach a real Codex home on this machine (the 2026-09-14 incident that file's
// own header documents).
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

test('D2: --codex-hooks-only wires the delete-guard automatically (or cleanly refuses), no separate flag needed', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-delete-guard-'));
  const codex = path.join(home, 'scratch-codex');
  fs.mkdirSync(codex, { recursive: true });

  // No `--codex-hooks-delete-guard` flag exists any more: the guard rides along with the SAME opt-in as
  // note delivery, and neither script's group collides with the other's in the same hooks.json.
  const json = runMirrorOnly(['--codex-home', codex], home);
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
    // review round 1, MAJOR 1: an unmatched group fired on every Codex tool, not just Bash.
    assert.equal(hooks.hooks.PreToolUse[0].matcher, 'Bash');
    // The note-delivery script's own groups (SessionStart etc.) are untouched by the guard landing in
    // the same file — the two scripts' groups never collide.
    assert.ok(
      hooks.hooks.SessionStart?.some((g) => g.hooks.some((h) => h.command.includes('multi-codex-hook.mjs'))),
      'note-delivery hooks must survive unchanged alongside the guard',
    );
  }
});

test('D2: an unknown flag (the old --codex-hooks-delete-guard) is refused, not silently accepted', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-delete-guard-oldflag-'));
  const codex = path.join(home, 'scratch-codex');
  fs.mkdirSync(codex, { recursive: true });

  const json = runMirrorOnly(['--codex-home', codex, '--codex-hooks-delete-guard'], home);
  assert.equal(json.ok, false);
  assert.ok(json.refusals.some((r) => r.includes('unknown flag --codex-hooks-delete-guard')));
});

// ─────────────────────────────────────────────────────────────────────────────
// Lane 39 (notion-writing): the mirrored skill carries a runnable page-lint.mjs. A real child process
// with the faked home (`fakeCodexEnv`, the mirror-shim.test.mjs `fakeEnv` pattern), because
// `os.homedir()` in the mirror is fixed at module load. win32 mirrors by COPY and POSIX by SYMLINK, so
// "the file is there" is trivially true on POSIX; the mode is asserted per platform and the checker is
// then actually run from the mirror with process.execPath.
// ─────────────────────────────────────────────────────────────────────────────

test('lane 39: the mirrored notion-writing skill carries a runnable page-lint.mjs (copy on win32, symlink on POSIX)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-notion-writing-'));
  execFileSync(process.execPath, [MIRROR], { encoding: 'utf8', env: fakeCodexEnv(home) });

  const mirrored = path.join(home, '.agents', 'skills', 'notion-writing');
  const isLink = fs.lstatSync(mirrored).isSymbolicLink();
  if (process.platform === 'win32') {
    assert.equal(isLink, false, 'on win32 the mirror copies');
    const manifest = JSON.parse(fs.readFileSync(path.join(home, '.agents', 'skills', '.mirror-manifest.json'), 'utf8'));
    const entry = manifest.managed.find((m) => m.name === 'notion-writing');
    assert.equal(entry.mode, 'copy');
    assert.ok(entry.files.includes('scripts/page-lint.mjs'), 'the manifest lists the copied checker');
    assert.deepEqual(entry.files.filter((f) => /\.test\.mjs$/.test(f)), []);
  } else {
    assert.equal(isLink, true, 'on POSIX the mirror symlinks');
  }

  const lint = path.join(mirrored, 'scripts', 'page-lint.mjs');
  assert.ok(fs.existsSync(lint), `${lint} must exist in the mirror`);
  assert.ok(fs.existsSync(path.join(mirrored, 'scripts', 'mask-fixture.mjs')));
  // The test-file exclusion (SKILL_FILE_EXCLUDE) lives in listFiles, which only the copy mode uses. A POSIX symlink
  // exposes the whole skill dir, test files included, by design.
  if (process.platform === 'win32') {
    assert.equal(fs.existsSync(path.join(mirrored, 'scripts', 'page-lint.test.mjs')), false, 'test files are never copied');
  } else {
    assert.equal(fs.realpathSync(mirrored), fs.realpathSync(path.join(REPO, 'skills', 'notion-writing')), 'the symlink points at the repo skill');
  }

  const fixture = path.join(mirrored, 'scripts', 'fixtures', 'handoff-brief.skeleton.md');
  assert.ok(fs.existsSync(fixture), 'the skeleton fixtures travel with the skill');
  const run = (args) => spawnSync(process.execPath, [lint, ...args], { encoding: 'utf8', env: fakeCodexEnv(home) });
  const bad = run([fixture, '--kind', 'handoff']);
  assert.equal(bad.status, 2, bad.stderr);
  assert.match(bad.stderr, /^page-lint: toggle-tail /m);
  const clean = run([path.join(mirrored, 'scripts', 'fixtures', 'render-decisions.skeleton.md'), '--kind', 'plain']);
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.stdout, 'page-lint: clean (plain)\n');

  // The decisions skill imports the checker as a sibling (../../notion-writing/scripts/page-lint.mjs);
  // that path must resolve inside the mirror too. With no --repo the render refuses at once, which it
  // can only do after its imports loaded.
  const render = spawnSync(process.execPath, [path.join(home, '.agents', 'skills', 'decisions', 'scripts', 'decisions-render.mjs'), 'render'], {
    encoding: 'utf8', env: fakeCodexEnv(home),
  });
  assert.equal(render.status, 2, render.stderr);
  assert.match(render.stderr, /render requires --repo/);
});
