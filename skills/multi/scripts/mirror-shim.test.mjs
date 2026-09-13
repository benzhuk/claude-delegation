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

test('R4: Windows plans BOTH shims — .cmd for cmd/PowerShell, extensionless for Git Bash', () => {
  const plan = dryRunPlan();
  assert.equal(plan.ok, true, JSON.stringify(plan.refusals));
  assert.equal(plan.dryRun, true);

  const shimActions = plan.actions.filter((a) => /PATH shim/.test(a));
  const expected = IS_WINDOWS ? 2 : 1;
  assert.equal(shimActions.length, expected,
    `expected ${expected} shim(s) on ${process.platform}, got:\n${shimActions.join('\n')}`);
  assert.equal(plan.shims.length, expected);

  if (IS_WINDOWS) {
    // Git Bash cannot resolve a bare `note-send` to a `.cmd`, and Ben's Claude sessions run in Git Bash.
    assert.ok(plan.shims.some((s) => s.endsWith('/note-send.cmd')), `no .cmd shim in ${plan.shims}`);
    assert.ok(plan.shims.some((s) => s.endsWith('/note-send')), `no extensionless shim in ${plan.shims}`);
  } else {
    assert.ok(plan.shims[0].endsWith('/note-send'));
    assert.ok(!plan.shims[0].endsWith('.cmd'));
  }
  for (const s of plan.shims) assert.match(s, /\/\.local\/bin\/note-send/);
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
