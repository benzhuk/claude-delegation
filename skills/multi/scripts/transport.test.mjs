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

import { gitRunner, mainCheckout, toPosix } from './transport.mjs';

// The four names gitRunner strips, repeated rather than imported so this file still loads on base
// 8b8c2f0 for the red run. mkRepo runs `git init` without them: an inherited GIT_DIR would otherwise
// turn it into a re-init of the caller's own repository.
const LOCATING = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE'];
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (LOCATING.includes(key.toUpperCase())) delete env[key];
  return env;
}
const tracked = [];

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
