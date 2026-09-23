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
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PLUGIN_SKILLS, CLAUDE_SKILLS, collectSources, isNewerVersion,
} from './mirror-shared-skills.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

test('PLUGIN_SKILLS includes notion-writing, dev-server, and bearings', () => {
  assert.ok(PLUGIN_SKILLS.includes('notion-writing'), 'notion-writing must be in PLUGIN_SKILLS');
  assert.ok(PLUGIN_SKILLS.includes('dev-server'), 'dev-server must be in PLUGIN_SKILLS');
  assert.ok(PLUGIN_SKILLS.includes('bearings'), 'bearings must be in PLUGIN_SKILLS');
});

test('CLAUDE_SKILLS no longer includes dev-server', () => {
  assert.ok(!CLAUDE_SKILLS.includes('dev-server'), 'dev-server must be removed from CLAUDE_SKILLS');
});

test('notion-writing and dev-server actually resolve to a source under <repo>/skills/, not ~/.claude/skills/', () => {
  const sources = collectSources();
  const byName = Object.fromEntries(sources.filter((s) => s.kind === 'skill').map((s) => [s.name, s]));

  for (const name of ['notion-writing', 'dev-server', 'bearings']) {
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
