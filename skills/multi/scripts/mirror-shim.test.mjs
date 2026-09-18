// node --test "skills/multi/scripts/*.test.mjs"
// The mirror's PATH-shim planning. Runs the real script against a throwaway HOME.
//
// EVERY spawn here goes through `fakeEnv()`, and that is not tidiness. This file used to pass only
// HOME/USERPROFILE, so on Windows `%APPDATA%` leaked through and `codexHomes()` found Ben's REAL Orca
// Codex homes: two gate runs on 2026-09-14 rewired four live homes to a worktree that was then deleted.
// A test must never be able to reach a real Codex home — hence the fake APPDATA/LOCALAPPDATA, and the
// assertion below that a default run creates nothing under them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { childEnv } from './test-child-env.mjs';

import { codexHookHash, trustKey } from '../../../scripts/codex-hook-trust.mjs';

const MIRROR = fileURLToPath(new URL('../../../scripts/mirror-shared-skills.mjs', import.meta.url));
const IS_WINDOWS = process.platform === 'win32';

/**
 * A home the installer can reach NOTHING real from: HOME and USERPROFILE for `os.homedir()`, plus
 * APPDATA and LOCALAPPDATA, which is where `codexHomes()` looks for Orca's managed Codex homes on
 * Windows. CODEX_HOME is cleared for the same reason.
 */
function fakeEnv(home) {
  // N2: `childEnv` adds the messaging seal to the home seal this already had.
  const env = childEnv(home);
  env.APPDATA = path.join(home, 'AppData', 'Roaming');
  env.LOCALAPPDATA = path.join(home, 'AppData', 'Local');
  delete env.CODEX_HOME;
  return env;
}

function dryRunPlan() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-home-'));
  const stdout = execFileSync(process.execPath, [MIRROR, '--dry-run', '--json'], {
    encoding: 'utf8',
    env: fakeEnv(home),
  });
  return { home, ...JSON.parse(stdout) };
}

test('the mirror script is where the test expects it', () => {
  assert.ok(fs.existsSync(MIRROR), MIRROR);
});

/** The exact bytes a Codex home's config.toml must still have after a default run. */
const UNTOUCHED = 'model = "gpt-6-astra"\n';

test('BLOCKER 1: a default run touches NO Codex home, even one sitting right where it looks', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-codex-'));
  // A complete fake of every place codexHomes() looks, each with a config.toml we can watch.
  const roots = [
    path.join(home, '.codex'),
    path.join(home, 'AppData', 'Roaming', 'orca', 'codex-accounts', 'acct-a', 'home'),
    path.join(home, 'AppData', 'Roaming', 'orca', 'codex-runtime-home', 'home'),
    path.join(home, '.config', 'orca', 'codex-accounts', 'acct-b', 'home'),
    path.join(home, 'Library', 'Application Support', 'orca', 'codex-accounts', 'acct-c', 'home'),
  ];
  for (const dir of roots) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.toml'), UNTOUCHED, 'utf8');
  }

  execFileSync(process.execPath, [MIRROR], { encoding: 'utf8', env: fakeEnv(home) });

  for (const dir of roots) {
    assert.equal(fs.existsSync(path.join(dir, 'hooks.json')), false, `a default run wrote hooks.json into ${dir}`);
    assert.equal(fs.readFileSync(path.join(dir, 'config.toml'), 'utf8'), UNTOUCHED,
      `a default run edited config.toml in ${dir}`);
  }
});

test('BLOCKER 1: --codex-hooks from a temporary checkout refuses rather than wiring live homes', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-codex-temp-'));
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  // MIRROR is under the repo; copy it nowhere — instead assert on the guard the installer applies to
  // ITS OWN path. Running the in-repo script from a temp HOME is durable, so ask for the scratch form.
  let stdout = '';
  try {
    stdout = execFileSync(process.execPath, [MIRROR, '--codex-hooks-only', '--codex-home', path.join(home, 'nope')], {
      encoding: 'utf8', env: fakeEnv(home),
    });
  } catch (err) {
    stdout = String(err.stdout ?? '');
  }
  assert.match(stdout, /does not exist/, 'a named home that is missing is a typo, not a silent success');
});


// ─────────────────────────────────────────────────────────────────────────────
// hooks.json and config.toml are one unit (review MAJOR 1)
// ─────────────────────────────────────────────────────────────────────────────

/** Run the installer and keep the output whether it exits 0 or refuses with 1. */
function runMirror(args, home) {
  try {
    return { stdout: execFileSync(process.execPath, [MIRROR, ...args], { encoding: 'utf8', env: fakeEnv(home) }), code: 0 };
  } catch (err) {
    return { stdout: String(err.stdout ?? ''), code: err.status ?? 1 };
  }
}

/**
 * A scratch Codex home that is CORRECTLY TRUSTED and slightly out of date — a real 0.4.1 home. The
 * installer converges it once, then the Stop timeout is put back to 1020 and its trust hash recomputed
 * to match, so the home genuinely delivers notes before anything below runs.
 */
function trustedButStaleHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-order-'));
  const codex = path.join(home, 'scratch-codex');
  fs.mkdirSync(codex, { recursive: true });
  const hooksPath = path.join(codex, 'hooks.json');
  const configPath = path.join(codex, 'config.toml');

  const first = runMirror(['--codex-hooks-only', '--codex-home', codex], home);
  assert.equal(first.code, 0, first.stdout);

  const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const group = hooks.hooks.Stop.findIndex((g) => g.hooks.some((h) => h.command.includes('multi-codex-hook.mjs')));
  const handler = hooks.hooks.Stop[group].hooks[0];
  handler.timeout = 1020;
  fs.writeFileSync(hooksPath, `${JSON.stringify(hooks, null, 2)}\n`, 'utf8');

  // Re-trust THAT handler, so the home is internally consistent: hooks.json and config.toml agree.
  const key = trustKey(path.resolve(hooksPath), 'Stop', group, 0);
  const wanted = codexHookHash(handler, 'Stop', null);
  const lines = fs.readFileSync(configPath, 'utf8').split('\n');
  const at = lines.findIndex((l) => l.startsWith('[hooks.state.') && l.includes(key));
  assert.ok(at !== -1, 'the first run must have written a trust entry for Stop');
  lines[at + 1] = `trusted_hash = "${wanted}"`;
  fs.writeFileSync(configPath, lines.join('\n'), 'utf8');

  return { home, codex, hooksPath, configPath, staleHash: wanted };
}

test('MAJOR 1: the installer WOULD update such a home — the control for the test below', () => {
  const { home, codex, hooksPath, configPath, staleHash } = trustedButStaleHome();
  const res = runMirror(['--codex-hooks-only', '--codex-home', codex], home);

  assert.equal(res.code, 0, res.stdout);
  assert.equal(JSON.parse(fs.readFileSync(hooksPath, 'utf8')).hooks.Stop.at(-1).hooks[0].timeout, 60,
    'hooks.json is brought up to date');
  assert.ok(!fs.readFileSync(configPath, 'utf8').includes(staleHash),
    'and the trust follows it, so the hook stays trusted');
});

test('MAJOR 1: one foreign duplicate and NEITHER file is written', () => {
  const { home, codex, hooksPath, configPath } = trustedButStaleHome();
  // A duplicate that is nothing to do with us: two spellings of one table, which TOML refuses outright
  // and we have no business resolving.
  fs.appendFileSync(configPath,
    '\n[projects."/a/b"]\ntrust_level = "trusted"\n\n[projects.\'/a/b\']\ntrust_level = "trusted"\n', 'utf8');

  const beforeHooks = fs.readFileSync(hooksPath, 'utf8');
  const beforeConfig = fs.readFileSync(configPath, 'utf8');

  const res = runMirror(['--codex-hooks-only', '--codex-home', codex], home);

  assert.equal(res.code, 1, 'a refusal is a non-zero exit');
  assert.match(res.stdout, /REFUSED/);
  assert.match(res.stdout, /neither it nor hooks\.json was written/);
  assert.equal(fs.readFileSync(hooksPath, 'utf8'), beforeHooks,
    'hooks.json must NOT be rewritten: its new hash would be absent from config.toml and Codex would '
    + 'silently skip the hook');
  assert.equal(fs.readFileSync(configPath, 'utf8'), beforeConfig, 'and config.toml is untouched, as promised');
});

/** v4: four commands on PATH, not one. note-notify is named in ~/.codex/config.toml on every machine. */
const COMMANDS = ['note-send', 'note-inbox', 'note-flush', 'note-notify'];

test('R4: Windows plans BOTH shims — .cmd for cmd/PowerShell, extensionless for Git Bash', () => {
  const plan = dryRunPlan();
  assert.equal(plan.ok, true, JSON.stringify(plan.refusals));
  assert.equal(plan.dryRun, true);

  const shimActions = plan.actions.filter((a) => /PATH shim/.test(a));
  const expected = COMMANDS.length * (IS_WINDOWS ? 2 : 1);
  assert.equal(shimActions.length, expected,
    `expected ${expected} shim(s) on ${process.platform}, got:\n${shimActions.join('\n')}`);
  assert.equal(plan.shims.length, expected);
  assert.deepEqual(plan.shimCommands, COMMANDS);

  for (const command of COMMANDS) {
    if (IS_WINDOWS) {
      // Git Bash cannot resolve a bare name to a `.cmd`, and Ben's Claude sessions run in Git Bash.
      assert.ok(plan.shims.some((s) => s.endsWith(`/${command}.cmd`)), `no .cmd shim for ${command} in ${plan.shims}`);
    }
    assert.ok(plan.shims.some((s) => s.endsWith(`/${command}`)), `no extensionless shim for ${command} in ${plan.shims}`);
  }
  for (const s of plan.shims) assert.match(s, /\/\.local\/bin\/note-(send|inbox|flush|notify)(\.cmd)?$/);
});

test('V4: each shim points at its OWN script, never at note-send', () => {
  const plan = dryRunPlan();
  for (const command of COMMANDS) {
    const action = plan.actions.find((a) => /PATH shim/.test(a) && new RegExp(`bin[\\\\/]${command}( |$)`).test(a));
    assert.ok(action, `no shim action for ${command}`);
    assert.match(action, new RegExp(`scripts[\\\\/]${command}\\.mjs$`));
  }
});

test('R4: --dry-run plans the shims without creating anything', () => {
  const plan = dryRunPlan();
  for (const s of plan.shims) assert.ok(!fs.existsSync(s), `--dry-run created ${s}`);
  assert.ok(!fs.existsSync(path.join(plan.home, '.local')));
  assert.ok(!fs.existsSync(path.join(plan.home, '.agents')));
});

test('R4: the plan still covers the skills, the shared docs and the Codex roles', () => {
  const plan = dryRunPlan();
  assert.match(plan.sharedDocs, /\.agents\/skills\/_docs$/);
  assert.ok(plan.actions.some((a) => /_docs[\\/]model-tiers\.md/.test(a)), 'S1 docs still published');
  assert.ok(plan.actions.some((a) => /skills[\\/]multi\b/.test(a)), 'the multi skill still published');
  assert.ok(plan.actions.some((a) => /agents[\\/]builder\.toml/.test(a)), 'Codex roles still published');
  assert.ok(!plan.actions.some((a) => /\.claude[\\/]skills/.test(a) && /would copy: [^<]*\.claude/.test(a)),
    'M11: ~/.claude/skills is a source, never a destination');
});

test('V4: a real install writes one shim per command, each naming ITS OWN command in its errors', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-install-'));
  execFileSync(process.execPath, [MIRROR], { encoding: 'utf8', env: fakeEnv(home) });
  const bin = path.join(home, '.local', 'bin');
  // Plain substring checks, not regexes: a command name interpolated into a RegExp turns
  // `scripts\note-send.mjs` into a newline escape, which is how this test first "passed" wrongly.
  for (const command of COMMANDS) {
    const sh = fs.readFileSync(path.join(bin, command), 'utf8');
    assert.ok(sh.includes(`scripts/${command}.mjs`), `${command} sh shim points elsewhere:\n${sh}`);
    // The bug this catches: every shim inherited note-send's "node not found" message.
    assert.ok(sh.includes(`echo "${command}: node not found`), `${command} sh shim reports the wrong command`);
    if (IS_WINDOWS) {
      const cmd = fs.readFileSync(path.join(bin, `${command}.cmd`), 'utf8');
      assert.ok(cmd.includes(`${command}.mjs`), `${command} cmd shim points elsewhere:\n${cmd}`);
      assert.ok(cmd.includes(`echo ${command}: node not found`), `${command} cmd shim reports the wrong command`);
    }
  }
  // …and it removes exactly what it created.
  execFileSync(process.execPath, [MIRROR, '--uninstall'], { encoding: 'utf8', env: fakeEnv(home) });
  assert.equal(fs.existsSync(bin), false, 'uninstall left shims behind');
});
