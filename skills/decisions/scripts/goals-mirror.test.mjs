// node --test skills/decisions/scripts/goals-mirror.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderPage, computeSha, checkDirty, run } from './goals-mirror.mjs';
import { parseDocument } from './decisions-read.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixtureRepo = path.join(FIXTURES, 'goals-src');
const expected = fs.readFileSync(path.join(FIXTURES, 'goals-page.expected.md'), 'utf8');

test('render remains byte-stable for the goals fixture', () => {
  assert.equal(renderPage({ repo: fixtureRepo, sha: 'test' }), expected);
});

test('real CLI render matches the fixture byte for byte', () => {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'goals-mirror.mjs');
  const result = spawnSync(process.execPath, [script, 'render', '--repo', fixtureRepo, '--sha', 'test'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, expected);
});

test('rendered fixture remains invisible to the decisions reader', () => {
  const doc = parseDocument(renderPage({ repo: fixtureRepo, sha: 'test' }));
  assert.equal(doc.decisions.length, 0);
  assert.equal(doc.warnings.length, 0);
  assert.equal(doc.unattached.length, 0);
});

test('render reports a git failure as BLIND', () => {
  let err = '';
  assert.equal(run({ argv: ['render', '--repo', fixtureRepo], git: () => { throw new Error('git failed'); }, writeErr: (s) => { err += s; } }), 3);
  assert.match(err, /BLIND.*git log failed/);
});

test('render uses a supplied sha and never needs a git write', () => {
  const page = renderPage({ repo: fixtureRepo, sha: 'abc1234' });
  assert.equal((page.match(/main at abc1234/g) ?? []).length, 1);
});

test('render preserves exact dated paths, URLs, years, and parenthetical source context', () => {
  const context = 'See docs/specs/2026-09-23-harness-next.md (reviewed 2026-09-23) and https://example.test/2026-09-23?context=(source).';
  const source = `Status: PARTIAL. ${context}\n`;
  const readFile = (file) => {
    if (file.endsWith('GOALS.md')) return `# Goals\n\n## Source\n${source}`;
    if (file.endsWith('card.md')) return 'GOAL: g\nNOT: n\nDONE: d\nKILL: k\nSOURCE: s\n';
    return fs.readFileSync(file, 'utf8');
  };
  const page = renderPage({ repo: fixtureRepo, sha: 'test', readFile });
  assert.match(page, new RegExp(`\\*\\*PARTIAL\\*\\*</span> ${context.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('default render refuses a local goals source that differs from origin/main', () => {
  let err = '';
  const code = run({
    argv: ['render', '--repo', '/fixture'],
    readFile: () => 'local\n',
    git: (_repo, args) => args[0] === 'log' ? 'abc1234\n' : 'origin\n',
    writeErr: (s) => { err += s; },
  });
  assert.equal(code, 1);
  assert.match(err, /docs\/GOALS\.md.*differs from origin\/main/);
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

test('render marks a section without Status UNKNOWN and preserves dollar text', () => {
  const readFile = (file) => {
    if (file.endsWith('GOALS.md')) return '# Goals\n\n## A\nCosts $& remain.\n';
    if (file.endsWith('card.md')) return 'GOAL: g\nNOT: n\nDONE: d\nKILL: k\nSOURCE: s\n';
    return fs.readFileSync(file, 'utf8');
  };
  const page = renderPage({ repo: fixtureRepo, sha: 'test', readFile });
  assert.match(page, /UNKNOWN/);
  assert.match(page, /Costs \$& remain/);
});

test('render reads sources directly under the supplied repo and fails blind through the CLI on missing input', () => {
  const seen = [];
  assert.throws(() => renderPage({ repo: '/direct', sha: 't', readFile: (file) => { seen.push(file); throw new Error('missing'); } }), /cannot read/);
  assert.equal(seen[0], path.join('/direct', 'docs', 'GOALS.md'));
  let err = '';
  assert.equal(run({ argv: ['render', '--repo', '/missing', '--sha', 't'], readFile: () => { throw new Error('ENOENT'); }, writeErr: (s) => { err += s; } }), 3);
  assert.match(err, /BLIND/);
});

test('render refuses every retained unsafe source form', () => {
  for (const line of ['<summary>x</summary>', 'Default after 2026-01-01 00:00 +00:00: x', '```js', '* [ ] x']) {
    const readFile = (file) => {
      if (file.endsWith('GOALS.md')) return `# Goals\n\n## A\n${line}\n`;
      if (file.endsWith('card.md')) return 'GOAL: g\nNOT: n\nDONE: d\nKILL: k\nSOURCE: s\n';
      return fs.readFileSync(file, 'utf8');
    };
    assert.throws(() => renderPage({ repo: fixtureRepo, sha: 't', readFile }));
  }
});

test('checkDirty reports dirty and blind git failures', () => {
  assert.deepEqual(checkDirty({ repo: '/r', readFile: () => 'local\n', git: () => 'origin\n' }), { dirty: true, path: 'docs/GOALS.md' });
  assert.throws(() => checkDirty({ repo: '/r', readFile: () => 'x', git: () => { throw new Error('git'); } }), /cannot read origin/);
});
