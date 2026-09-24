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
const REPO_ROOT = path.dirname(path.dirname(MIRROR));
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

test('optional source omissions are named, nonfatal, and dry-run writes nothing', () => {
  const plan = dryRunPlan();
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.refusals, []);
  for (const name of ['knowledge', 'triage', 'learn']) {
    assert.ok(plan.actions.some((line) => line.includes(`optional source skill not sourced: ${name} (source missing)`)),
      `missing source diagnostic for ${name}:\n${plan.actions.join('\n')}`);
  }
  assert.deepEqual(fs.readdirSync(plan.home), [], '--dry-run must not create a home entry');
});

test('optional source without SKILL.md is named while a usable optional source remains selected', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-optional-source-'));
  const root = path.join(home, '.claude', 'skills');
  fs.mkdirSync(path.join(root, 'knowledge'), { recursive: true });
  fs.writeFileSync(path.join(root, 'triage'), 'not a skill directory', 'utf8');
  fs.mkdirSync(path.join(root, 'learn'), { recursive: true });
  fs.writeFileSync(path.join(root, 'learn', 'SKILL.md'), '# learn\n', 'utf8');

  const plan = runMirrorJson(['--dry-run'], home);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.refusals, []);
  assert.ok(plan.actions.some((line) => line.includes('optional source skill not sourced: knowledge (SKILL.md missing)')),
    plan.actions.join('\n'));
  assert.ok(plan.actions.some((line) => line.includes('optional source skill not sourced: triage (wrong file type: source is not a directory)')),
    plan.actions.join('\n'));
  const publishVerb = IS_WINDOWS ? 'copy' : 'symlink';
  assert.ok(plan.actions.some((line) => new RegExp(`would ${publishVerb}: .*\\.agents[\\\\/]skills[\\\\/]learn`).test(line)),
    `usable optional source was not selected:\n${plan.actions.join('\n')}`);
  assert.deepEqual(fs.readdirSync(path.join(home, '.claude', 'skills', 'learn')), ['SKILL.md']);
  assert.ok(!fs.existsSync(path.join(home, '.agents')), '--dry-run must not publish optional sources');
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
  // SKILL_FILE_EXCLUDE (m5): a real install must never publish a skill's own test file —
  // skills/multi/scripts/hooks.test.mjs relies on this to import from outside its
  // mirrored directory. Windows publishes by copy, so this can only be pinned by
  // checking what actually landed, not the dry-run plan (which logs a per-directory
  // file count, not names).
  const mirroredFiles = fs.readdirSync(path.join(home, '.agents', 'skills'), { recursive: true });
  assert.ok(!mirroredFiles.some((f) => f.endsWith('.test.mjs')),
    'SKILL_FILE_EXCLUDE let a .test.mjs file publish');
  // Positive control: the assertion above must fail because the walk found real files and
  // filtered one out, not because the walk (or the whole publish) silently did nothing.
  assert.ok(mirroredFiles.some((f) => f.replace(/\\/g, '/').endsWith('multi/scripts/transport.mjs')),
    'the skill file walk published nothing');
  // …and it removes exactly what it created.
  execFileSync(process.execPath, [MIRROR, '--uninstall'], { encoding: 'utf8', env: fakeEnv(home) });
  assert.equal(fs.existsSync(bin), false, 'uninstall left shims behind');
});

// ─────────────────────────────────────────────────────────────────────────────
// D10/D11/D12 — manifest v3 and the downgrade guard.
//
// F10: every case below reads THIS repo's real `.claude-plugin/plugin.json` version at TEST RUN TIME
// (`ownPluginVersion()`) — no literal for the running tree's own version anywhere in this file. Only
// the MANIFEST side of a fixture uses a literal (e.g. "99.0.0"), since that is the fixture's own
// input, not a claim about the tree.
//
// The scout's own binding flag for this territory: no test anywhere wrote a fixture
// `.mirror-manifest.json` before this build, so every case here is the FIRST proof the drop loop can
// actually be skipped, not merely that the run exits 0 — and case 3 is the required POSITIVE CONTROL:
// a same-version manifest with a genuinely stale entry must still get it dropped.
// ─────────────────────────────────────────────────────────────────────────────

function manifestPath(home) {
  return path.join(home, '.agents', 'skills', '.mirror-manifest.json');
}

function writeFixtureManifest(home, manifest) {
  const p = manifestPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function ownPluginVersion() {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
}

const OWN_SOURCE_PATH = REPO_ROOT.split(path.sep).join('/');

/**
 * A fake pre-existing managed entry: a real directory with one file in it, at a `dest` the real
 * `collectSources()` will never reproduce (no skill by this name exists in the repo) — so it is
 * genuinely stale from THIS tree's point of view, the exact shape a real "removed skill" would take.
 * Used both as the guard's "must survive untouched" fixture and as case 3's positive control.
 */
function ghostEntry(home, name) {
  const dest = path.join(home, '.agents', 'skills', name);
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'ghost.txt'), 'ghost', 'utf8');
  return {
    name, kind: 'skill', mode: IS_WINDOWS ? 'copy' : 'symlink',
    source: `<ghost>/${name}`, dest: dest.split(path.sep).join('/'), files: ['ghost.txt'],
  };
}

function baseManifest(pluginVersion, sourcePath, managed) {
  return {
    version: 3, updatedAt: null, mode: IS_WINDOWS ? 'copy' : 'symlink', pluginVersion, sourcePath, managed,
  };
}

/** Runs the installer with `--json` and returns the parsed object, whether it exited 0 or refused. */
function runMirrorJson(args, home, mirror = MIRROR) {
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [mirror, ...args, '--json'], { encoding: 'utf8', env: fakeEnv(home) });
  } catch (err) {
    stdout = String(err.stdout ?? '');
  }
  let json = null;
  try { json = JSON.parse(stdout); } catch { /* assertion below reports the raw stdout */ }
  assert.ok(json, `--json output did not parse:\n${stdout}`);
  return json;
}

const dropped = (json, dest) => json.actions.some((a) => a.includes('drop no-longer-shared entry') && a.includes(dest));
const refusalLine = (json) => json.actions.find((a) => a.includes('refusing to drop or overwrite'));

test('D12 case 1: a manifest newer than this tree refuses to drop, keeps entries, exits 0, prints the refusal', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-guard-newer-'));
  const ghost = ghostEntry(home, 'r2-ghost-newer');
  writeFixtureManifest(home, baseManifest('99.0.0', '/some/newer/tree', [ghost]));

  const json = runMirrorJson([], home);

  assert.equal(json.ok, true, JSON.stringify(json.refusals));
  assert.ok(fs.existsSync(ghost.dest), 'the pre-existing managed entry must still be on disk');
  assert.ok(!dropped(json, ghost.dest), 'F9: a guarded run must not drop the entry (must be absent from actions)');
  const line = refusalLine(json);
  assert.ok(line, `refusal line missing from actions:\n${json.actions.join('\n')}`);
  assert.ok(line.startsWith('refusing to drop or overwrite: manifest is 99.0.0 from /some/newer/tree, this tree is '),
    `the refusal line must be verbatim, with no "would " prefix even under --dry-run; got: ${line}`);
  assert.ok(line.endsWith('; run the mirror from the newer tree or pass --allow-downgrade'), line);
  assert.ok(!json.refusals.some((r) => /refusing to drop or overwrite/.test(r)),
    'F9: the refusal line must go through say()/actions only, never into the refusals array');
});

test('D12 case 2: --allow-downgrade restores unconditional drop even against a newer manifest', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-guard-allow-'));
  const ghost = ghostEntry(home, 'r2-ghost-allow');
  writeFixtureManifest(home, baseManifest('99.0.0', '/some/newer/tree', [ghost]));

  const json = runMirrorJson(['--allow-downgrade'], home);

  assert.equal(json.ok, true, JSON.stringify(json.refusals));
  assert.ok(dropped(json, ghost.dest), '--allow-downgrade must restore the drop that case 1 refused');
});

test('D12 case 3 (positive control): equal pluginVersion is unaffected — a genuinely stale entry is still dropped', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-guard-equal-'));
  const ghost = ghostEntry(home, 'r2-ghost-equal');
  writeFixtureManifest(home, baseManifest(ownPluginVersion(), OWN_SOURCE_PATH, [ghost]));

  const json = runMirrorJson([], home);

  assert.equal(json.ok, true, JSON.stringify(json.refusals));
  assert.ok(dropped(json, ghost.dest),
    'an equal-version manifest must behave exactly like today: a genuinely stale entry is dropped');
  assert.ok(!refusalLine(json), 'the guard must never fire when versions are equal');
});

test('D12 case 4: a version-2 manifest (no pluginVersion key) drops as today and upgrades to v3 on write', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-guard-v2-'));
  const ghost = ghostEntry(home, 'r2-ghost-v2');
  const mPath = manifestPath(home);
  fs.mkdirSync(path.dirname(mPath), { recursive: true });
  fs.writeFileSync(mPath, `${JSON.stringify({
    version: 2, updatedAt: null, mode: IS_WINDOWS ? 'copy' : 'symlink', managed: [ghost],
  }, null, 2)}\n`, 'utf8');

  const json = runMirrorJson([], home);

  assert.equal(json.ok, true, JSON.stringify(json.refusals));
  assert.ok(dropped(json, ghost.dest), 'pluginVersion: null (a v2 manifest) is never "newer" — drops proceed as today');
  assert.ok(!refusalLine(json), 'a v2 manifest must never trip the guard');

  const written = JSON.parse(fs.readFileSync(mPath, 'utf8'));
  assert.equal(written.version, 3, 'D10: this run\'s own write must upgrade the manifest to v3');
  assert.equal(written.pluginVersion, ownPluginVersion());
  assert.equal(written.sourcePath, OWN_SOURCE_PATH);
});

test('D12 case 5 (F7): two consecutive guarded runs both refuse — the second read still sees the newer version', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-guard-twice-'));
  const ghost = ghostEntry(home, 'r2-ghost-twice');
  writeFixtureManifest(home, baseManifest('99.0.0', '/some/newer/tree', [ghost]));
  const mPath = manifestPath(home);

  const first = runMirrorJson([], home);
  assert.ok(!dropped(first, ghost.dest), 'run 1 must not drop');
  assert.ok(refusalLine(first), 'run 1 must print the refusal line');

  const afterFirst = JSON.parse(fs.readFileSync(mPath, 'utf8'));
  assert.equal(afterFirst.pluginVersion, '99.0.0',
    'F7: a guarded write must NOT stamp this (older) tree\'s own identity onto the manifest');
  assert.equal(afterFirst.sourcePath, '/some/newer/tree');

  const second = runMirrorJson([], home);
  assert.ok(!dropped(second, ghost.dest),
    'F7: run 2 must still refuse — the guard must not have disarmed itself after run 1\'s own write');
  assert.ok(refusalLine(second), 'run 2 must still print the refusal line');
  assert.ok(fs.existsSync(ghost.dest), 'the ghost entry must still be present after two guarded runs');
});

test('D12 case 6 (F8 table case): manifest "0.13.0" vs a running tree at "0.5.0" is a downgrade (guard fires)', () => {
  // The real repo's own version does not exercise the string/semver disagreement (0.13.0 > 0.12.0 both
  // ways), so this case needs the CHILD's own tree version under control too — a scratch copy of just
  // the mirror script plus a fabricated .claude-plugin/plugin.json, never the real repo's own file
  // (read-only, and F10 forbids a literal claim about the real tree's version anyway).
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-tree-'));
  fs.mkdirSync(path.join(scratchRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(scratchRoot, '.claude-plugin'), { recursive: true });
  fs.copyFileSync(MIRROR, path.join(scratchRoot, 'scripts', 'mirror-shared-skills.mjs'));
  fs.copyFileSync(
    path.join(REPO_ROOT, 'scripts', 'codex-hook-trust.mjs'),
    path.join(scratchRoot, 'scripts', 'codex-hook-trust.mjs'),
  );
  fs.writeFileSync(path.join(scratchRoot, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: '0.5.0' }), 'utf8');
  const scratchMirror = path.join(scratchRoot, 'scripts', 'mirror-shared-skills.mjs');

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-guard-f8-'));
  const ghost = ghostEntry(home, 'r2-ghost-f8');
  writeFixtureManifest(home, baseManifest('0.13.0', '/some/newer/tree', [ghost]));

  const json = runMirrorJson([], home, scratchMirror);

  assert.ok(!dropped(json, ghost.dest),
    'F8: "0.13.0" is semver-newer than "0.5.0" though lexically smaller — a naive string compare gets '
    + 'this backwards, and the guard must still fire');
  const line = refusalLine(json);
  assert.ok(line, `refusal line missing from actions:\n${json.actions.join('\n')}`);
  assert.match(line, /manifest is 0\.13\.0 from \/some\/newer\/tree, this tree is 0\.5\.0/);
});

test('D12 mutation check: additive-only still installs a genuinely missing entry even under the guard', () => {
  // A fixture entry the manifest attributes to the newer tree, present in `managed[]`, but genuinely
  // ABSENT from disk (e.g. a half-applied previous run) — creating it cannot un-publish anything newer,
  // so it must still be installed even in downgrade mode (reviewer attack brief, R2).
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-guard-additive-'));
  writeFixtureManifest(home, baseManifest('99.0.0', '/some/newer/tree', []));

  const json = runMirrorJson([], home);

  assert.ok(refusalLine(json), 'the guard must still fire (manifest is newer)');
  const bin = path.join(home, '.local', 'bin');
  assert.ok(fs.existsSync(path.join(bin, 'note-send')), 'a genuinely missing shim must still be installed under the guard');
});

test('D12: --dry-run against a newer manifest still prints the refusal line (nothing written, but visible)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-guard-dryrun-'));
  const ghost = ghostEntry(home, 'r2-ghost-dryrun');
  writeFixtureManifest(home, baseManifest('99.0.0', '/some/newer/tree', [ghost]));

  const json = runMirrorJson(['--dry-run'], home);

  assert.equal(json.dryRun, true);
  assert.ok(!dropped(json, ghost.dest), '--dry-run must not drop under the guard either');
  const line = refusalLine(json);
  assert.ok(line, `--dry-run must still print the refusal line, got:\n${json.actions.join('\n')}`);
  assert.ok(line.startsWith('refusing to drop or overwrite: manifest is 99.0.0 from /some/newer/tree, this tree is '),
    `the refusal line must be verbatim, with no "would " prefix even under --dry-run; got: ${line}`);
  assert.ok(line.endsWith('; run the mirror from the newer tree or pass --allow-downgrade'), line);
  // The manifest fixture must be untouched on disk: --dry-run never writes.
  assert.equal(JSON.parse(fs.readFileSync(manifestPath(home), 'utf8')).pluginVersion, '99.0.0');
});

test('D12: the guard protects an EXISTING entry from being overwritten (the other half of D11)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-guard-overwrite-'));
  // A normal, unguarded install first, so the home holds real, live, managed entries — every
  // other guard case fixtures a STALE entry, which only ever exercises the drop half of D11.
  runMirrorJson([], home);
  const mPath = manifestPath(home);
  const installed = JSON.parse(fs.readFileSync(mPath, 'utf8'));
  const shim = installed.managed.find((e) => e.kind === 'shim');
  assert.ok(shim, 'the first run must have installed at least one shim');
  const victim = shim.dest;
  const ours = fs.readFileSync(victim, 'utf8');
  const newerContent = `${ours}\n:: NEWER TREE SENTINEL\n`;
  fs.writeFileSync(victim, newerContent, 'utf8');
  // Now claim that content came from a newer tree.
  fs.writeFileSync(mPath, `${JSON.stringify({ ...installed, pluginVersion: '99.0.0', sourcePath: '/some/newer/tree' }, null, 2)}\n`, 'utf8');

  const guarded = runMirrorJson([], home);
  assert.ok(refusalLine(guarded), 'the guard must fire');
  assert.equal(fs.readFileSync(victim, 'utf8'), newerContent,
    'D11: an entry that already exists must NOT be overwritten by the older tree under the guard');

  // Positive control: --allow-downgrade restores today's unconditional overwrite.
  const allowed = runMirrorJson(['--allow-downgrade'], home);
  assert.ok(!refusalLine(allowed), '--allow-downgrade must not print the refusal line');
  assert.equal(fs.readFileSync(victim, 'utf8'), ours,
    '--allow-downgrade must restore the overwrite the guard refused');
});
