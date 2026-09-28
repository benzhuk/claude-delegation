// node --test skills/decisions/scripts/decisions-render-core.test.mjs
//
// Review r1, F3, class (c): decisions-render-core.mjs's defaultExecGit is one of the "decisions
// trio" direct git call sites named in the spec's Part 1. Real two-repo fixture, lane-44 pattern:
// two scratch repos made with `git init`, GIT_DIR set in the PARENT PROCESS environment pointed
// at repo B, restored in `finally`, real git, no injected runner. Must fail on base d6f5c9d
// (red — GIT_DIR set with no env override answers for B, not A) and pass at the fix (green —
// withoutRepoLocatingGitEnv strips it).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { defaultExecGit } from './decisions-render-core.mjs';

const tracked = [];
function mkRepo(prefix) {
  const dir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix));
  tracked.push(dir);
  execFileSync('git', ['init', '--quiet'], { cwd: dir, encoding: 'utf8' });
  return dir;
}

after(() => {
  // Same convention as transport.test.mjs / collect-from-origin.test.mjs: under
  // scripts/run-tests.mjs every dir lives under FIXTURE_ROOT and makeTempHome's cleanup()
  // removes it; run directly, nothing else does.
  if (process.env.FIXTURE_ROOT) return;
  for (const dir of tracked) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort cleanup only */ }
  }
});

test('defaultExecGit ignores an inherited GIT_DIR: --absolute-git-dir answers for the repo it was told, never the poisoned one', () => {
  const repoA = mkRepo('render-core-gitdir-a-');
  const repoB = mkRepo('render-core-gitdir-b-');

  const hadGitDir = Object.prototype.hasOwnProperty.call(process.env, 'GIT_DIR');
  const prevGitDir = process.env.GIT_DIR;
  try {
    // GIT_DIR is set on the PARENT process environment, the same way a hook run inside a git
    // operation (or an agent spawned from one) would inherit it — never passed as an explicit
    // env override to the call under test.
    process.env.GIT_DIR = path.join(repoB, '.git');

    // `--absolute-git-dir`, not `--show-toplevel`: when GIT_DIR is set, git takes the cwd as the
    // top level, so `--show-toplevel` would not discriminate between A and B here.
    const answered = fs.realpathSync(defaultExecGit(['rev-parse', '--absolute-git-dir'], repoA).trim());
    const expected = fs.realpathSync(path.join(repoA, '.git'));
    assert.equal(answered, expected);
  } finally {
    if (hadGitDir) process.env.GIT_DIR = prevGitDir;
    else delete process.env.GIT_DIR;
  }
});
