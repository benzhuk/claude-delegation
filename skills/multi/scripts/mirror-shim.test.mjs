// node --test "skills/multi/scripts/*.test.mjs"
// The mirror's PATH-shim planning. Runs the real script with --dry-run against a throwaway HOME,
// so nothing outside the temp directory is touched and no network or orca is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MIRROR = fileURLToPath(new URL('../../../scripts/mirror-shared-skills.mjs', import.meta.url));
const IS_WINDOWS = process.platform === 'win32';

function dryRunPlan() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-home-'));
  const stdout = execFileSync(process.execPath, [MIRROR, '--dry-run', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  return { home, ...JSON.parse(stdout) };
}

test('the mirror script is where the test expects it', () => {
  assert.ok(fs.existsSync(MIRROR), MIRROR);
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
  execFileSync(process.execPath, [MIRROR], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
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
  execFileSync(process.execPath, [MIRROR, '--uninstall'], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
  assert.equal(fs.existsSync(bin), false, 'uninstall left shims behind');
});
