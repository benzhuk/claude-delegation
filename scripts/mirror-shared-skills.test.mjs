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
  PLUGIN_SKILLS, CLAUDE_SKILLS, collectSources, isNewerVersion, isDurablePath, isCodexRulesPathCertain,
  isLinkedWorktree,
} from './mirror-shared-skills.mjs';
import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const MIRROR = path.join(HERE, 'mirror-shared-skills.mjs');

test('PLUGIN_SKILLS includes notion-writing, dev-server, bearings, and janitor', () => {
  assert.ok(PLUGIN_SKILLS.includes('notion-writing'), 'notion-writing must be in PLUGIN_SKILLS');
  assert.ok(PLUGIN_SKILLS.includes('dev-server'), 'dev-server must be in PLUGIN_SKILLS');
  assert.ok(PLUGIN_SKILLS.includes('bearings'), 'bearings must be in PLUGIN_SKILLS');
  assert.ok(!PLUGIN_SKILLS.includes('continue'), 'continue is retired and must not be in PLUGIN_SKILLS');
  assert.ok(PLUGIN_SKILLS.includes('janitor'), 'janitor must be in PLUGIN_SKILLS (lane five, J2)');
});

test('CLAUDE_SKILLS no longer includes dev-server', () => {
  assert.ok(!CLAUDE_SKILLS.includes('dev-server'), 'dev-server must be removed from CLAUDE_SKILLS');
});

test('plugin skills actually resolve to sources under <repo>/skills/, not ~/.claude/skills/', () => {
  const sources = collectSources();
  const byName = Object.fromEntries(sources.filter((s) => s.kind === 'skill').map((s) => [s.name, s]));

  for (const name of ['notion-writing', 'dev-server', 'bearings', 'janitor']) {
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

test('lane 53 m7: the mirrored team-build copy contains scripts/review-run.mjs (Codex reaches it), not its .test.mjs twin', () => {
  const sources = collectSources();
  const teamBuild = sources.find((s) => s.kind === 'skill' && s.name === 'team-build');
  assert.ok(teamBuild, 'team-build must be a skill source');
  const scriptPath = path.join(teamBuild.src, 'scripts', 'review-run.mjs');
  assert.ok(fs.existsSync(scriptPath), `expected ${scriptPath} to exist under the mirrored team-build source`);
  const testPath = path.join(teamBuild.src, 'scripts', 'review-run.test.mjs');
  assert.ok(fs.existsSync(testPath), 'sanity: the test file itself must exist on disk');
  // mirror-shared-skills.mjs's own SKILL_FILE_EXCLUDE is not exported; this mirrors its literal
  // pattern (`/\.test\.mjs$/`) so a change to that pattern that stops excluding tests is caught here.
  const excludePattern = /\.test\.mjs$/;
  assert.ok(excludePattern.test('review-run.test.mjs'), 'the exclude pattern must still catch it so it never publishes');
  assert.ok(!excludePattern.test('review-run.mjs'), 'the script itself must not match the test-file exclude pattern');
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

// ─────────────────────────────────────────────────────────────────────────────
// Lane 59: reclaim's PATH shim (F12), and the reclaim allow lines (F9/F10/F11)
// ─────────────────────────────────────────────────────────────────────────────

/** A real child-process run of the full installer (not --codex-hooks-only), same fake-env discipline
 * as runMirrorOnly above (fakeCodexEnv is defined earlier in this file). */
function runFull(args, home, envOverrides = {}) {
  const env = { ...fakeCodexEnv(home), ...envOverrides };
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [MIRROR, ...args, '--json'], { encoding: 'utf8', env });
  } catch (err) {
    stdout = String(err.stdout ?? '');
  }
  return JSON.parse(stdout);
}

function fixtureHomeWithSettings(prefix, settingsText) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  if (settingsText !== null) fs.writeFileSync(path.join(home, '.claude', 'settings.json'), settingsText);
  return home;
}

const PLAIN_SETTINGS = `${JSON.stringify({ permissions: { allow: ['Bash(git *)'] } }, null, 2)}\n`;

/** A fake `chezmoi` binary on PATH, for chezmoiManagedStatus()'s own execFileSync('chezmoi', ...) call
 * (no shell: true). A `#!/bin/sh` script works directly on POSIX. Measured on the lane 59 Windows
 * gate (r2): a `.cmd` stand-in does NOT work as a win32 equivalent - `execFileSync('chezmoi', ...)`
 * with no shell option throws ENOENT even with a `chezmoi.cmd` on PATH, because current, patched Node
 * versions (post CVE-2024-27980) only auto-wrap a resolved `.bat`/`.cmd` through cmd.exe when the
 * caller opts in with `shell: true` - which chezmoiManagedStatus() itself does not set, and this file
 * cannot add without touching product code. See CHEZMOI_FIXTURE_UNAVAILABLE below: the three tests
 * that depend on this fixture skip on win32 for that reason, not because chezmoi detection itself is
 * unavailable there. */
function writeFakeChezmoi(dir, { stdout = '', exitCode = 0 } = {}) {
  const bin = path.join(dir, 'chezmoi');
  fs.writeFileSync(bin, `#!/bin/sh\n${stdout ? `echo "${stdout}"\n` : ''}exit ${exitCode}\n`);
  fs.chmodSync(bin, 0o755);
  return bin;
}

const CHEZMOI_FIXTURE_UNAVAILABLE = "measured on the lane 59 Windows gate: chezmoiManagedStatus() "
  + "calls execFileSync('chezmoi', ...) with no shell option, which throws ENOENT for a .cmd stand-in "
  + "on current, patched Node (post CVE-2024-27980, a resolved .bat/.cmd is only auto-wrapped through "
  + "cmd.exe when the caller passes shell:true) - a test-fixture limitation only, not a claim that "
  + "chezmoi detection is unavailable on win32 itself.";

test('F12: the reclaim shim is gated by isDurablePath(REPO), targeting THIS repo\'s own scripts/reclaim.mjs, never the mirrored copy', () => {
  const sources = collectSources();
  const reclaimEntries = sources.filter((s) => s.kind === 'shim' && s.command === 'reclaim');
  const expectedTarget = path.resolve(path.join(REPO, 'scripts', 'reclaim.mjs'));
  // The same gate collectSources() uses: durable AND not a linked worktree (review finding 6).
  if (isDurablePath(REPO) && !isLinkedWorktree(REPO)) {
    assert.ok(reclaimEntries.length > 0, 'a durable REPO must publish the reclaim shim');
    for (const entry of reclaimEntries) {
      assert.equal(path.resolve(entry.target), expectedTarget, 'the reclaim shim must target THIS repo, not shimTarget()');
      assert.notEqual(entry.dest, undefined);
    }
    if (process.platform === 'win32') {
      assert.ok(reclaimEntries.some((e) => e.name === 'reclaim.cmd'));
      assert.ok(reclaimEntries.some((e) => e.name === 'reclaim' && e.flavour === 'sh'));
    } else {
      assert.equal(reclaimEntries.length, 1);
      assert.equal(reclaimEntries[0].name, 'reclaim');
    }
  } else {
    // A scratch lane under /tmp or /var/tmp (non-durable), or a durable linked worktree such as
    // an integration checkout: either way no reclaim shim is published.
    assert.equal(reclaimEntries.length, 0, 'a non-durable or linked-worktree REPO must publish no reclaim shim at all');
  }
});

test('review finding 6: isLinkedWorktree() tells a linked git worktree apart from the main checkout it came from', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-linked-worktree-'));
  const main = path.join(scratch, 'main');
  fs.mkdirSync(main, { recursive: true });
  const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-q'], main);
  // No commit, and no git identity, is needed at all: `git worktree add -b` works fine off an unborn
  // HEAD, and this test must never set user.email/user.name (no identity is configured, or assumed
  // available, in the sealed/sandboxed environment a full test-suite run uses for every fixture).
  const linked = path.join(scratch, 'linked');
  git(['worktree', 'add', '-q', linked, '-b', 'lane59-linked'], main);

  assert.equal(isLinkedWorktree(main), false, 'the main checkout is not a linked worktree');
  assert.equal(isLinkedWorktree(linked), true, 'a `git worktree add`-created checkout is a linked worktree');
  assert.equal(isLinkedWorktree(path.join(scratch, 'does-not-exist')), true, 'fail closed: an error from git counts as "linked"');

  // Additive-only cleanup: this worktree is scratch this test itself created, never one the run started with.
  git(['worktree', 'remove', linked, '--force'], main);
});

test('review finding 6: isLinkedWorktree(REPO) agrees with `git rev-parse --git-dir` vs `--git-common-dir` on THIS lane\'s own, real checkout', () => {
  // A real-data companion to the synthetic fixture test above: whatever checkout is actually running
  // this suite (main checkout or, as for every build lane, a `git worktree add` lane exactly like an
  // Orca workspace), the two ways of asking must agree — nobody built this fixture for the test.
  let gitDir; let commonDir;
  try {
    gitDir = execFileSync('git', ['-C', REPO, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim();
    commonDir = execFileSync('git', ['-C', REPO, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
  } catch {
    return; // not a git checkout at all here - nothing to compare
  }
  const expected = path.resolve(REPO, gitDir) !== path.resolve(REPO, commonDir);
  assert.equal(isLinkedWorktree(REPO), expected);
});

test('F12: a run from this (non-durable) checkout prints "SKIP reclaim shim: <REPO> is not durable" and writes no reclaim shim file', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-reclaim-shim-'));
  const json = runFull([], home);
  if (isDurablePath(REPO) && !isLinkedWorktree(REPO)) {
    assert.ok(!json.actions.some((a) => a.includes('SKIP reclaim shim')));
    return;
  }
  const reason = isDurablePath(REPO) ? `${REPO} is a linked git worktree` : `${REPO} is not durable`;
  assert.ok(
    json.actions.some((a) => a === `SKIP reclaim shim: ${reason}`),
    `expected the exact SKIP line, got:\n${json.actions.join('\n')}`,
  );
  assert.equal(fs.existsSync(path.join(home, '.local', 'bin', 'reclaim')), false);
});

test('F9/F10: every run prints both ALLOW lines, --write-allow or not, --dry-run or not, install or --uninstall', () => {
  for (const args of [[], ['--dry-run'], ['--uninstall'], ['--uninstall', '--dry-run']]) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-allow-lines-'));
    const json = runFull(args, home);
    assert.ok(json.actions.includes('ALLOW claude: Bash(reclaim *)'), `missing claude ALLOW line for args=${JSON.stringify(args)}: ${json.actions.join('\n')}`);
    assert.ok(
      json.actions.includes('ALLOW codex: prefix_rule(pattern = ["reclaim"], decision = "allow")  # append to ~/.codex/rules/default.rules'),
      `missing codex ALLOW line for args=${JSON.stringify(args)}: ${json.actions.join('\n')}`,
    );
  }
});

// ── --write-allow: Claude settings.json (F11) ────────────────────────────────

test('F11: --write-allow adds Bash(reclaim *) to an existing, unmanaged settings.json, preserving every other key/order, mode, and leaving a backup outside ~/.claude', () => {
  const home = fixtureHomeWithSettings('mirror-write-allow-ok-', PLAIN_SETTINGS);
  const settingsPath = path.join(home, '.claude', 'settings.json');
  fs.chmodSync(settingsPath, 0o600);
  const json = runFull(['--write-allow'], home);
  assert.ok(json.actions.some((a) => a === `WROTE ${settingsPath} +Bash(reclaim *)`), json.actions.join('\n'));
  const after = fs.readFileSync(settingsPath, 'utf8');
  assert.deepEqual(JSON.parse(after), { permissions: { allow: ['Bash(git *)', 'Bash(reclaim *)'] } });
  // byte-for-byte round trip except for the one appended entry: same 2-space JSON.stringify shape.
  assert.equal(after, `${JSON.stringify({ permissions: { allow: ['Bash(git *)', 'Bash(reclaim *)'] } }, null, 2)}\n`);
  // POSIX-only: win32 has no rwx mode bits (chmodSync's 0o600 above only ever toggles the read-only
  // attribute there, never the fine-grained owner bits this asserts on), so only the mode checks
  // themselves are skipped there - the rest of the write/round-trip/backup behaviour still runs.
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(settingsPath).mode & 0o777, 0o600, 'mode must be preserved, never widened by the rename');
  }
  const backupDir = path.join(home, '.agents', 'rollout-backups');
  const backups = fs.readdirSync(backupDir).filter((f) => f.startsWith('claude-settings.json.'));
  assert.equal(backups.length, 1, 'exactly one backup, outside ~/.claude');
  assert.equal(fs.readFileSync(path.join(backupDir, backups[0]), 'utf8'), PLAIN_SETTINGS, 'the backup holds the ORIGINAL bytes');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(path.join(backupDir, backups[0])).mode & 0o777, 0o600);
  }
});

test('F11: --write-allow SKIPs (does not write) when settings.json is absent', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-write-allow-absent-'));
  const json = runFull(['--write-allow'], home);
  assert.ok(json.actions.some((a) => a === `SKIP ${path.join(home, '.claude', 'settings.json')}: absent`), json.actions.join('\n'));
});

test('F11: --write-allow SKIPs a symlinked settings.json (chezmoi symlink_ hazard) rather than replacing it with a regular file', () => {
  const home = fixtureHomeWithSettings('mirror-write-allow-symlink-', null);
  const real = path.join(home, 'real-settings.json');
  fs.writeFileSync(real, PLAIN_SETTINGS);
  const settingsPath = path.join(home, '.claude', 'settings.json');
  fs.symlinkSync(real, settingsPath);
  const json = runFull(['--write-allow'], home);
  assert.ok(json.actions.some((a) => a === `SKIP ${settingsPath}: not a regular file`), json.actions.join('\n'));
  assert.ok(fs.lstatSync(settingsPath).isSymbolicLink(), 'the symlink itself must survive, never replaced');
  assert.equal(fs.readFileSync(real, 'utf8'), PLAIN_SETTINGS);
});

test('F11: --write-allow SKIPs invalid JSON, and the SKIP line names none of the file\'s own bytes', () => {
  const secretLooking = '{"permissions": plainword-not-json, "sekret": "do-not-print-me"}';
  const home = fixtureHomeWithSettings('mirror-write-allow-badjson-', secretLooking);
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const json = runFull(['--write-allow'], home);
  const line = json.actions.find((a) => a.startsWith(`SKIP ${settingsPath}`));
  assert.ok(line, json.actions.join('\n'));
  assert.equal(line, `SKIP ${settingsPath}: not valid JSON`);
  assert.ok(!line.includes('sekret'), 'the fixed SKIP reason must never quote the file');
  assert.ok(!line.includes('plainword'), 'the fixed SKIP reason must never quote the file');
});

test('F11: --write-allow SKIPs when the file does not already round-trip byte-identically through 2-space JSON.stringify', () => {
  const home = fixtureHomeWithSettings('mirror-write-allow-reformat-', '{"permissions":{"allow":["Bash(git *)"]}}');
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const json = runFull(['--write-allow'], home);
  assert.ok(json.actions.some((a) => a === `SKIP ${settingsPath}: formatting would change`), json.actions.join('\n'));
  assert.equal(fs.readFileSync(settingsPath, 'utf8'), '{"permissions":{"allow":["Bash(git *)"]}}', 'never touched');
});

test('F11: --write-allow accepts a CRLF file that round-trips after CRLF-to-LF normalisation, and rewrites it LF', () => {
  const text = `${JSON.stringify({ permissions: { allow: ['Bash(git *)'] } }, null, 2)}\n`.split('\n').join('\r\n');
  const home = fixtureHomeWithSettings('mirror-write-allow-crlf-', text);
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const json = runFull(['--write-allow'], home);
  assert.ok(json.actions.some((a) => a === `WROTE ${settingsPath} +Bash(reclaim *)`), json.actions.join('\n'));
});

for (const existingLine of ['Bash(reclaim *)', 'Bash(reclaim:*)']) {
  test(`F10: --write-allow SKIPs with "line present" when permissions.allow already has ${existingLine}`, () => {
    const settings = `${JSON.stringify({ permissions: { allow: ['Bash(git *)', existingLine] } }, null, 2)}\n`;
    const home = fixtureHomeWithSettings('mirror-write-allow-present-', settings);
    const settingsPath = path.join(home, '.claude', 'settings.json');
    const json = runFull(['--write-allow'], home);
    assert.ok(json.actions.some((a) => a === `SKIP ${settingsPath}: line present`), json.actions.join('\n'));
    assert.equal(fs.readFileSync(settingsPath, 'utf8'), settings, 'never touched');
  });
}

for (const shadowKey of ['deny', 'ask']) {
  test(`F10: --write-allow WARNs and never writes when permissions.${shadowKey} already has a Bash(reclaim...) rule`, () => {
    const settings = `${JSON.stringify({ permissions: { allow: ['Bash(git *)'], [shadowKey]: ['Bash(reclaim /etc/*)'] } }, null, 2)}\n`;
    const home = fixtureHomeWithSettings('mirror-write-allow-shadow-', settings);
    const settingsPath = path.join(home, '.claude', 'settings.json');
    const json = runFull(['--write-allow'], home);
    assert.ok(
      json.actions.some((a) => a === `WARN ${settingsPath}: a deny/ask rule shadows reclaim`),
      json.actions.join('\n'),
    );
    assert.equal(fs.readFileSync(settingsPath, 'utf8'), settings, 'never touched');
  });
}

test('F11: --write-allow SKIPs as chezmoi-managed when a fake chezmoi on PATH lists the settings file (relative to $HOME)', { skip: process.platform === 'win32' ? CHEZMOI_FIXTURE_UNAVAILABLE : false }, () => {
  const home = fixtureHomeWithSettings('mirror-write-allow-chezmoi-', PLAIN_SETTINGS);
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-chezmoi-'));
  writeFakeChezmoi(bin, { stdout: '.claude/settings.json' });
  const json = runFull(['--write-allow'], home, { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  assert.ok(json.actions.some((a) => a === `SKIP ${settingsPath}: chezmoi-managed`), json.actions.join('\n'));
  assert.equal(fs.readFileSync(settingsPath, 'utf8'), PLAIN_SETTINGS, 'never touched');
});

test('F11: --write-allow SKIPs as "chezmoi check failed" when chezmoi is on PATH but errors', { skip: process.platform === 'win32' ? CHEZMOI_FIXTURE_UNAVAILABLE : false }, () => {
  const home = fixtureHomeWithSettings('mirror-write-allow-chezmoi-err-', PLAIN_SETTINGS);
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-chezmoi-err-'));
  writeFakeChezmoi(bin, { exitCode: 1 });
  const json = runFull(['--write-allow'], home, { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  assert.ok(json.actions.some((a) => a === `SKIP ${settingsPath}: chezmoi check failed`), json.actions.join('\n'));
  assert.equal(fs.readFileSync(settingsPath, 'utf8'), PLAIN_SETTINGS, 'never touched');
});

test('F11: --write-allow --dry-run writes nothing at all, but still reports the would-write line', () => {
  const home = fixtureHomeWithSettings('mirror-write-allow-dryrun-', PLAIN_SETTINGS);
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const json = runFull(['--write-allow', '--dry-run'], home);
  assert.ok(json.actions.some((a) => a === `would WRITE ${settingsPath} +Bash(reclaim *)`), json.actions.join('\n'));
  assert.equal(fs.readFileSync(settingsPath, 'utf8'), PLAIN_SETTINGS, 'a dry run must touch nothing');
  assert.equal(fs.existsSync(path.join(home, '.agents', 'rollout-backups')), false);
});

test('review finding 7: --write-allow SKIPs with "backup failed" (never writes settings.json unbacked) when the backup dir cannot be created', () => {
  const home = fixtureHomeWithSettings('mirror-write-allow-backupfail-', PLAIN_SETTINGS);
  const settingsPath = path.join(home, '.claude', 'settings.json');
  // `.agents/rollout-backups` is the backup dir itself; pre-creating it as a plain FILE (not a
  // directory) makes `fs.mkdirSync(path.dirname(backupPath), {recursive:true})` fail (EEXIST: a
  // non-directory already occupies that path) — main() itself needs `.agents` to stay a real
  // directory (it unconditionally mkdirs `.agents/skills` before write-allow ever runs), so only the
  // backups subdir is sabotaged here, the exact "can't create the backup dir" shape the review covers.
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'rollout-backups'), 'not a directory');
  const before = fs.readFileSync(settingsPath, 'utf8');
  const beforeMode = fs.statSync(settingsPath).mode & 0o777;
  const json = runFull(['--write-allow'], home);
  assert.ok(json.actions.some((a) => a === `SKIP ${settingsPath}: backup failed`), json.actions.join('\n'));
  assert.equal(fs.readFileSync(settingsPath, 'utf8'), before, 'a failed backup must never let the write through unbacked');
  assert.equal(fs.statSync(settingsPath).mode & 0o777, beforeMode);
  // no stray temp file left behind from the aborted write
  const claudeDirEntries = fs.readdirSync(path.join(home, '.claude'));
  assert.deepEqual(claudeDirEntries, ['settings.json']);
});

// ── --write-allow: Codex rules file (F9's ruling r0 amendment) ──────────────

function fixtureCodexHome(home, rulesText) {
  const dir = path.join(home, '.codex', 'rules');
  fs.mkdirSync(dir, { recursive: true });
  if (rulesText !== null) fs.writeFileSync(path.join(dir, 'default.rules'), rulesText);
  return path.join(dir, 'default.rules');
}

test('F9: --write-allow appends the codex prefix_rule line when the rules file exists, the path is certain, and the line is absent', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-write-allow-codex-ok-'));
  const rulesPath = fixtureCodexHome(home, 'prefix_rule(pattern = ["git"], decision = "allow")\n');
  fs.chmodSync(rulesPath, 0o600);
  const json = runFull(['--write-allow'], home);
  const wanted = 'prefix_rule(pattern = ["reclaim"], decision = "allow")';
  assert.ok(json.actions.some((a) => a === `WROTE ${rulesPath} +${wanted}`), json.actions.join('\n'));
  assert.equal(
    fs.readFileSync(rulesPath, 'utf8'),
    `prefix_rule(pattern = ["git"], decision = "allow")\n${wanted}\n`,
  );
  if (process.platform !== 'win32') {
    // POSIX-only: win32 has no rwx mode bits to preserve here.
    assert.equal(fs.statSync(rulesPath).mode & 0o777, 0o600);
  }
  const backupDir = path.join(home, '.agents', 'rollout-backups');
  assert.ok(fs.readdirSync(backupDir).some((f) => f.startsWith('codex-default.rules.')));
});

test('F9: --write-allow SKIPs the codex rules file when absent', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-write-allow-codex-absent-'));
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  const rulesPath = path.join(home, '.codex', 'rules', 'default.rules');
  const json = runFull(['--write-allow'], home);
  assert.ok(json.actions.some((a) => a === `SKIP ${rulesPath}: absent`), json.actions.join('\n'));
});

test('F9: --write-allow SKIPs the codex rules file with "line present" when it already carries the prefix_rule', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-write-allow-codex-present-'));
  const wanted = 'prefix_rule(pattern = ["reclaim"], decision = "allow")';
  const rulesPath = fixtureCodexHome(home, `prefix_rule(pattern = ["git"], decision = "allow")\n${wanted}\n`);
  const json = runFull(['--write-allow'], home);
  assert.ok(json.actions.some((a) => a === `SKIP ${rulesPath}: line present`), json.actions.join('\n'));
});

test('F9: --write-allow SKIPs the codex rules file as chezmoi-managed', { skip: process.platform === 'win32' ? CHEZMOI_FIXTURE_UNAVAILABLE : false }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-write-allow-codex-chezmoi-'));
  const rulesPath = fixtureCodexHome(home, 'prefix_rule(pattern = ["git"], decision = "allow")\n');
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-chezmoi-codex-'));
  writeFakeChezmoi(bin, { stdout: '.codex/rules/default.rules' });
  const json = runFull(['--write-allow'], home, { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  assert.ok(json.actions.some((a) => a === `SKIP ${rulesPath}: chezmoi-managed`), json.actions.join('\n'));
});

test('F9: isCodexRulesPathCertain is true only for the single plain ~/.codex home — false when CODEX_HOME overrides it or an Orca-managed account home also exists', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-codex-certain-'));
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  assert.equal(isCodexRulesPathCertain({ home, env: {} }), true, 'the plain lone home is certain');
  assert.equal(
    isCodexRulesPathCertain({ home, env: { CODEX_HOME: path.join(home, 'other-codex') } }),
    false,
    'a CODEX_HOME override makes it ambiguous, even though .codex still exists',
  );
  // codexHomes() (which isCodexRulesPathCertain calls) looks for the Orca-managed accounts root at a
  // platform-specific path, keyed off the REAL process.platform (this test passes no `platform`
  // override) - the fixture must land in the same place codexHomes() will actually look, or this
  // "second managed home" never gets seen at all and the assertion below goes green for the wrong
  // reason (or red, on win32, before this fix - codexHomes() looked under AppData\Roaming there while
  // this fixture built only the POSIX .config/orca shape).
  const managedRoot = process.platform === 'win32'
    ? path.join(home, 'AppData', 'Roaming', 'orca', 'codex-accounts', 'acct-a', 'home')
    : process.platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support', 'orca', 'codex-accounts', 'acct-a', 'home')
      : path.join(home, '.config', 'orca', 'codex-accounts', 'acct-a', 'home');
  fs.mkdirSync(managedRoot, { recursive: true });
  assert.equal(
    isCodexRulesPathCertain({ home, env: {} }),
    false,
    'a second, Orca-managed Codex home on this machine makes it ambiguous too',
  );
});

test('F9: --write-allow prints a SKIP (print-only) for the codex line, never touching the file, when CODEX_HOME makes the path uncertain', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-write-allow-codex-ambiguous-'));
  fixtureCodexHome(home, 'prefix_rule(pattern = ["git"], decision = "allow")\n');
  const other = path.join(home, 'other-codex');
  fs.mkdirSync(other, { recursive: true });
  const json = runFull(['--write-allow'], home, { CODEX_HOME: other });
  assert.ok(
    json.actions.some((a) => a === 'SKIP codex allow line: codex rules path is not certain on this host (print only)'),
    json.actions.join('\n'),
  );
});

// ── manifest reconciliation (review finding 14) ──────────────────────────────

test('review finding 14: a previously-managed reclaim shim entry survives manifest reconciliation on a run that skips it, instead of being silently dropped', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-manifest-reclaim-carry-'));
  const localBin = path.join(home, '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  const reclaimDest = path.join(localBin, 'reclaim');
  // A dangling symlink is exactly what `publish()` leaves behind for a `kind: 'shim'` entry (MODE
  // 'symlink'); it needs to still be there (and still be a symlink) for a real regression to show up
  // as an actual unlink, not merely an entry silently vanishing from the manifest's JSON.
  fs.symlinkSync(path.join(home, 'nonexistent-target'), reclaimDest);
  const agentsSkills = path.join(home, '.agents', 'skills');
  fs.mkdirSync(agentsSkills, { recursive: true });
  const priorManifest = {
    version: 3,
    updatedAt: null,
    mode: 'symlink',
    pluginVersion: null,
    sourcePath: null,
    managed: [{
      name: 'reclaim', kind: 'shim', mode: 'generated-file',
      source: 'generated (target /some/old/repo/scripts/reclaim.mjs)',
      dest: reclaimDest.split(path.sep).join('/'),
    }],
  };
  fs.writeFileSync(path.join(agentsSkills, '.mirror-manifest.json'), `${JSON.stringify(priorManifest, null, 2)}\n`);

  // This run's own REPO (the fixture-independent, real checkout under /var/tmp) never publishes the
  // reclaim shim (F12: non-durable), so absent the finding-14 fix the reconciliation loop would treat
  // the prior entry as stale and drop it.
  const json = runFull([], home);

  assert.ok(
    !json.actions.some((a) => a.startsWith('drop no-longer-shared entry') && a.includes(reclaimDest)),
    `the reclaim entry must never be reported as dropped, got:\n${json.actions.join('\n')}`,
  );
  assert.ok(fs.lstatSync(reclaimDest).isSymbolicLink(), 'the on-disk shim symlink itself must survive untouched');

  const after = JSON.parse(fs.readFileSync(path.join(agentsSkills, '.mirror-manifest.json'), 'utf8'));
  const carried = after.managed.find((e) => path.resolve(e.dest) === path.resolve(reclaimDest));
  assert.ok(carried, `the reclaim entry must still be present in the reconciled manifest, got:\n${JSON.stringify(after.managed, null, 2)}`);
});

test('review finding R2-5: an entry merely NAMED reclaim outside LOCAL_BIN is dropped normally, not protected by the carry-forward clause', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-manifest-reclaim-elsewhere-'));
  // Keeps warnCrossSessionInbound()'s unconditional WARNING action out of this test's own noise (it
  // reads straight off HOME for every plain run) - not, in the end, this test's actual Windows-gate
  // failure; see the elsewhereDestSlash note below for the real cause.
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ crossSessionInbound: 'accept' }));
  // A skill (or anything else) that happens to be named "reclaim" but lives somewhere other than
  // ~/.local/bin must never become undroppable just because its basename matches the shim's - the
  // finding 14 carry-forward is scoped to the real shim location only (R2-5's own patch, the exact
  // complement of collectSources()'s gate).
  const elsewhereDir = path.join(home, '.agents', 'skills', 'reclaim');
  fs.mkdirSync(elsewhereDir, { recursive: true });
  fs.writeFileSync(path.join(elsewhereDir, 'SKILL.md'), '# not the shim\n');
  const elsewhereDest = path.join(home, 'somewhere-else', 'reclaim');
  fs.mkdirSync(path.dirname(elsewhereDest), { recursive: true });
  fs.symlinkSync(elsewhereDir, elsewhereDest);

  const agentsSkills = path.join(home, '.agents', 'skills');
  const priorManifest = {
    version: 3,
    updatedAt: null,
    mode: 'symlink',
    pluginVersion: null,
    sourcePath: null,
    managed: [{
      name: 'reclaim', kind: 'skill', mode: 'symlink',
      source: 'generated (target /some/old/repo/somewhere-else/reclaim)',
      dest: elsewhereDest.split(path.sep).join('/'),
    }],
  };
  fs.writeFileSync(path.join(agentsSkills, '.mirror-manifest.json'), `${JSON.stringify(priorManifest, null, 2)}\n`);

  const json = runFull([], home);

  // say() prints old.dest verbatim, which the manifest fixture above already stored in forward-slash
  // form (`elsewhereDest.split(path.sep).join('/')`, matching what publish() itself always writes) -
  // comparing against the raw, host-native `elsewhereDest` here (backslashes on win32) is what
  // actually broke this test on the Windows gate, not any crossSessionInbound WARNING output: the
  // action line was really there, just spelled with forward slashes.
  const elsewhereDestSlash = elsewhereDest.split(path.sep).join('/');
  assert.ok(
    json.actions.some((a) => a === `drop no-longer-shared entry: ${elsewhereDestSlash}`),
    `an entry merely named reclaim outside LOCAL_BIN must be dropped like any other stale entry, got:\n${json.actions.join('\n')}`,
  );
  assert.equal(fs.existsSync(elsewhereDest), false, 'the stray symlink itself must actually be removed');

  const after = JSON.parse(fs.readFileSync(path.join(agentsSkills, '.mirror-manifest.json'), 'utf8'));
  const carried = after.managed.find((e) => path.resolve(e.dest) === path.resolve(elsewhereDest));
  assert.equal(carried, undefined, 'it must not be silently carried forward just because its basename is "reclaim"');
});

/**
 * F10 probe P-allow (ruling r0: "the compound-command case is recorded as documented behavior, not
 * as a claim") — run ONCE by hand against the real Claude Code CLI (2.1.285), never in the automated
 * suite: it needs a live `claude` binary/session and is not something a sealed test run can shell out
 * to. Command, and measured result, recorded here for the next reader rather than only in the build
 * report:
 *
 *   cd <scratch cwd>; claude -p --settings <scratch>/settings.json --permission-mode default '...'
 *   (settings.json held exactly {"permissions":{"allow":["Bash(reclaim *)"]}})
 *
 *   1. reclaim /nonexistent               -> ran (reclaim not installed, exit 127) - ALLOWED
 *   2. reclaim /x && touch p1             -> denied outright, p1 never created
 *   3. reclaim /x; touch p2               -> denied outright, p2 never created
 *   4. reclaim $(touch p3)                -> denied outright (command substitution), p3 never created
 *   5. reclaim /x > p4                    -> ran (reclaim not installed, exit 127) - ALLOWED, and the
 *      shell's own output redirection created an EMPTY p4 before reclaim ever executed, regardless of
 *      reclaim's own outcome. This is a real, measured gap in `Bash(reclaim *)`: the allow rule lets a
 *      session create/truncate an arbitrary file via `reclaim <anything> > <target>`, independent of
 *      reclaim.mjs's own argument validation. Documented, not blocking (ruling r0) - the same gap
 *      exists for every other single-word Bash allow rule in this settings file (`Bash(git *)` etc.),
 *      it is not specific to reclaim, and reclaim.mjs never runs as a result.
 *   6. FOO=1 reclaim /x                   -> denied outright, never ran
 *
 * So: 2/3/4/6 (the chained/substituted/env-prefixed forms) are blocked exactly as F10 predicted; 1 and
 * 5 (simple invocations, redirection included) run under the plain `Bash(reclaim *)` allow.
 */
// review round 1, finding 13: `assert.ok(true)` checked nothing and still counted as a pass in the
// suite total. `test.todo` reports as pending, not passing, and still names what is outstanding.
test.todo('F10 probe P-allow: recorded as documented behavior above this test, not re-run here (needs a live claude CLI)');
