// node --test "skills/multi/scripts/*.test.mjs"
//
// gitRunner identity (lane 44): with GIT_DIR set in the PARENT process environment (a hook run
// inside a git operation, an agent spawned from one, a timer unit with a stale environment), the
// real `git` binary answers every `git` invocation for the GIT_DIR repository, not for whatever
// `cwd` the caller asked about — `gitRunner` inherits the whole parent environment with no `env`
// override, so GIT_DIR (and its siblings GIT_WORK_TREE, GIT_COMMON_DIR, GIT_INDEX_FILE) leak
// straight through to the child. This test runs the REAL gitRunner against two real scratch repos
// (git init, mktemp dirs, no identity config, no commits) — no injected runner — and must fail on
// base 8b8c2f0 (red) before the fix and pass after it (green).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { gitRunner, mainCheckout, toPosix, withoutRepoLocatingGitEnv } from './transport.mjs';
// N2 (hooks.test.mjs): every child environment in this suite is built through childEnv(), never by
// spreading process.env in a .test.mjs file directly — that is the one thing that leaked a live
// session's messaging token into a fixture on 2026-09-17. scratchHome gives childEnv a fixture home
// to stand in for HOME, exactly like note-send.test.mjs's runScript (its own only caller).
import { childEnv, scratchHome } from './test-child-env.mjs';

// The four names gitRunner strips, repeated rather than imported so this file still loads on base
// 8b8c2f0 for the red run. mkRepo runs `git init` without them: an inherited GIT_DIR would otherwise
// turn it into a re-init of the caller's own repository.
const LOCATING = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE'];
const tracked = [];
const envHome = scratchHome(fs, 'transport-identity-env-');
tracked.push(envHome);

function cleanEnv() {
  const env = childEnv(envHome);
  for (const key of Object.keys(env)) if (LOCATING.includes(key.toUpperCase())) delete env[key];
  return env;
}

function mkRepo(prefix) {
  const dir = toPosix(fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix)));
  tracked.push(dir);
  execFileSync('git', ['init', '--quiet'], { cwd: dir, encoding: 'utf8', env: cleanEnv() });
  return dir;
}

after(() => {
  // Same convention as scripts/collect-status.test.mjs: under scripts/run-tests.mjs every dir lives
  // under FIXTURE_ROOT and makeTempHome's cleanup() removes it; run directly, nothing else does.
  if (process.env.FIXTURE_ROOT) return;
  for (const dir of tracked) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort cleanup only */ }
  }
});

test('gitRunner resolves identity from cwd, not an inherited GIT_DIR', () => {
  const repoA = mkRepo('transport-identity-a-');
  const repoB = mkRepo('transport-identity-b-');
  const hadGitDir = Object.prototype.hasOwnProperty.call(process.env, 'GIT_DIR');
  const prevGitDir = process.env.GIT_DIR;
  try {
    process.env.GIT_DIR = path.join(repoB, '.git');

    const common = gitRunner(['rev-parse', '--git-common-dir'], repoA).trim();
    const resolvedCommon = toPosix(path.resolve(repoA, common));
    assert.equal(resolvedCommon, `${repoA}/.git`);

    const checkout = mainCheckout(repoA, gitRunner);
    assert.equal(checkout, repoA);
  } finally {
    if (hadGitDir) process.env.GIT_DIR = prevGitDir;
    else delete process.env.GIT_DIR;
  }
});

test('gitRunner never mutates the parent environment\'s GIT_DIR', () => {
  const repoA = mkRepo('transport-identity-c-');
  const repoB = mkRepo('transport-identity-d-');
  const hadGitDir = Object.prototype.hasOwnProperty.call(process.env, 'GIT_DIR');
  const prevGitDir = process.env.GIT_DIR;
  try {
    process.env.GIT_DIR = path.join(repoB, '.git');
    const before = process.env.GIT_DIR;

    gitRunner(['rev-parse', '--git-common-dir'], repoA);

    assert.equal(process.env.GIT_DIR, before);
  } finally {
    if (hadGitDir) process.env.GIT_DIR = prevGitDir;
    else delete process.env.GIT_DIR;
  }
});

test('gitRunner resolves identity from cwd, not an inherited GIT_COMMON_DIR', () => {
  const repoA = mkRepo('transport-identity-e-');
  const repoB = mkRepo('transport-identity-f-');
  const had = Object.prototype.hasOwnProperty.call(process.env, 'GIT_COMMON_DIR');
  const prev = process.env.GIT_COMMON_DIR;
  try {
    process.env.GIT_COMMON_DIR = `${repoB}/.git`;
    assert.equal(mainCheckout(repoA, gitRunner), repoA);
  } finally {
    if (had) process.env.GIT_COMMON_DIR = prev;
    else delete process.env.GIT_COMMON_DIR;
  }
});

// Lane 47, P1: withoutRepoLocatingGitEnv is the exported helper every direct git call site wraps
// its env with. gitRunner itself now calls it (covered above); this exercises the export directly.
test('withoutRepoLocatingGitEnv strips the four names and never mutates its argument', () => {
  const input = {
    GIT_DIR: '/somewhere/.git',
    GIT_WORK_TREE: '/somewhere',
    GIT_COMMON_DIR: '/somewhere/.git',
    GIT_INDEX_FILE: '/somewhere/.git/index',
    PATH: process.env.PATH,
    OTHER_VAR: 'kept',
  };
  const before = { ...input };

  const out = withoutRepoLocatingGitEnv(input);

  assert.deepEqual(input, before); // argument untouched
  assert.equal(out.GIT_DIR, undefined);
  assert.equal(out.GIT_WORK_TREE, undefined);
  assert.equal(out.GIT_COMMON_DIR, undefined);
  assert.equal(out.GIT_INDEX_FILE, undefined);
  assert.equal(out.PATH, process.env.PATH);
  assert.equal(out.OTHER_VAR, 'kept');
});

// Lane 47, P4/FU5: a bare repo's OWN common dir ends in the four characters `.git`
// (`/srv/repo.git`), but there is no `/.git` PATH COMPONENT to strip — the old
// `/\/?\.git\/?$/` matched the bare suffix too and truncated it to `/srv/repo`, a directory
// that does not exist. Must fail on base d6f5c9d (red) before the fix, pass after it (green).
test('mainCheckout leaves a bare repo\'s own <name>.git common dir untouched', () => {
  const bareRunner = (args) => {
    if (args[0] === 'rev-parse' && args[1] === '--git-common-dir') return '/srv/repo.git\n';
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };
  assert.equal(mainCheckout('/srv/repo.git', bareRunner), '/srv/repo.git');
});

// A non-bare worktree's common dir DOES have a `/.git` component and must still be stripped.
test('mainCheckout still strips a real /.git component', () => {
  const runner = (args) => {
    if (args[0] === 'rev-parse' && args[1] === '--git-common-dir') return '/home/dev/project/.git\n';
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };
  assert.equal(mainCheckout('/home/dev/project', runner), '/home/dev/project');
});
