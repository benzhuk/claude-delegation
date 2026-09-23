// node --test skills/decisions/scripts/goals-mirror.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage, computeSha, checkDirty, run } from './goals-mirror.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixtureRepo = path.join(FIXTURES, 'goals-src');
const expected = fs.readFileSync(path.join(FIXTURES, 'goals-page.expected.md'), 'utf8');

test('render remains byte-stable for the goals fixture', () => {
  assert.equal(renderPage({ repo: fixtureRepo, sha: 'test' }), expected);
});

test('render uses a supplied sha and never needs a git write', () => {
  const page = renderPage({ repo: fixtureRepo, sha: 'abc1234' });
  assert.equal((page.match(/main at abc1234/g) ?? []).length, 1);
});

test('computeSha and checkDirty remain pure source helpers', () => {
  const git = (_repo, args) => args[0] === 'log' ? 'abc1234\n' : fs.readFileSync(path.join(fixtureRepo, ...args[1].slice('origin/main:'.length).split('/')), 'utf8');
  assert.equal(computeSha({ repo: fixtureRepo, git }), 'abc1234');
  assert.deepEqual(checkDirty({ repo: fixtureRepo, git }), { dirty: false, path: null });
});

test('publish is deliberately refused before any read, git, temporary file, or network operation', () => {
  let reads = 0;
  let gits = 0;
  let out = '';
  const code = run({
    argv: ['publish', '--repo', '/repo', '--parent', 'p', '--current', 'none'],
    readFile: () => { reads += 1; throw new Error('must not read'); },
    git: () => { gits += 1; throw new Error('must not run git'); },
    writeErr: (s) => { out += s; },
  });
  assert.equal(code, 1);
  assert.equal(reads, 0);
  assert.equal(gits, 0);
  assert.match(out, /publish is disabled; run render, read the Goals page fresh, then use notion-writing targeted anchored edits and verify readback/);
});

test('publish refuses identically when --current is omitted or none', () => {
  for (const argv of [['publish'], ['publish', '--current', 'none']]) {
    let out = '';
    assert.equal(run({ argv, writeErr: (s) => { out += s; } }), 1);
    assert.match(out, /publish is disabled/);
  }
});

test('render rejects a source line that would become a decision checkbox', () => {
  const readFile = (file) => {
    if (file.endsWith('GOALS.md')) return '# Goals\n\n## A\n- [ ] unsafe\n';
    if (file.endsWith('card.md')) return 'GOAL: g\nNOT: n\nDONE: d\nKILL: k\nSOURCE: s\n';
    return fs.readFileSync(file, 'utf8');
  };
  assert.throws(() => renderPage({ repo: fixtureRepo, sha: 'test', readFile }), /would render as a checkbox/);
});
