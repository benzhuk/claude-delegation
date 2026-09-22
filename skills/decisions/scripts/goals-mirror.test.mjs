// node --test skills/decisions/scripts/goals-mirror.test.mjs
// goals-mirror: renders docs/GOALS.md + docs/goals/card.md into the Notion mirror page shape,
// and publishes it. Every test mocks git and the notion.js spawn — never a real network call
// or a real repo write. Spec: docs/specs/2026-09-22-decisions-current.md (M2, Render rules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { renderPage, computeSha, checkDirty, run } from './goals-mirror.mjs';
import { parseDocument } from './decisions-read.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, 'fixtures');
const FIXTURE_REPO = path.join(FIXTURES_DIR, 'goals-src');
const EXPECTED_PATH = path.join(FIXTURES_DIR, 'goals-page.expected.md');
const TEMPLATE_PATH = path.join(HERE, '..', 'templates', 'goals-page.md');

const L = (...lines) => lines.join('\n');

function collect() {
  const out = { stdout: '', stderr: '' };
  const write = (s) => { out.stdout += s; };
  const writeErr = (s) => { out.stderr += s; };
  return { out, write, writeErr };
}

// ---------------------------------------------------------------------------
// Test 5 (mechanical): render byte-stability against the fixture.
// ---------------------------------------------------------------------------

test('render of the fixture repo equals goals-page.expected.md byte for byte', () => {
  const expected = fs.readFileSync(EXPECTED_PATH, 'utf8');
  const page = renderPage({ repo: FIXTURE_REPO, sha: 'test' });
  assert.equal(page, expected);
});

test('render is byte-stable across two runs (reviewer attack: run it twice, diff)', () => {
  const first = renderPage({ repo: FIXTURE_REPO, sha: 'test' });
  const second = renderPage({ repo: FIXTURE_REPO, sha: 'test' });
  assert.equal(first, second);
});

test('render output carries no CR and ends with exactly one trailing LF', () => {
  const page = renderPage({ repo: FIXTURE_REPO, sha: 'test' });
  assert.ok(!page.includes('\r'), 'no CRLF on Windows');
  assert.ok(page.endsWith('\n'), 'ends with a trailing newline');
  assert.ok(!page.endsWith('\n\n'), 'exactly one trailing newline, not a blank line at EOF');
});

test('the CLI render command matches the fixture byte for byte (spawned, real entry point)', () => {
  const scriptPath = path.join(HERE, 'goals-mirror.mjs');
  const res = spawnSync(process.execPath, [
    scriptPath, 'render', '--repo', FIXTURE_REPO, '--sha', 'test',
  ], { encoding: 'utf8' });
  const expected = fs.readFileSync(EXPECTED_PATH, 'utf8');
  assert.equal(res.status, 0);
  assert.equal(res.stdout, expected);
});

test('--sha override lands in the callout exactly once', () => {
  const page = renderPage({ repo: FIXTURE_REPO, sha: 'abc1234' });
  const matches = page.match(/main at abc1234/g) || [];
  assert.equal(matches.length, 1);
  // and it is inside the first line of the page's first callout, per the shared sha-line contract
  const firstCalloutBody = page.split('\n')[1];
  assert.match(firstCalloutBody, /\bmain at abc1234\b/);
});

test('the fixture render, fed to parseDocument, gives zero decisions, warnings and unattached', () => {
  const page = renderPage({ repo: FIXTURE_REPO, sha: 'test' });
  const doc = parseDocument(page);
  assert.equal(doc.decisions.length, 0);
  assert.equal(doc.warnings.length, 0);
  assert.equal(doc.unattached.length, 0);
});

test('a GOALS.md section with no Status line renders UNKNOWN red and does not crash', () => {
  const readFile = (f) => {
    if (f.endsWith(path.join('docs', 'GOALS.md'))) {
      return L(
        '# Goals',
        '',
        '## A section with no status',
        '',
        'Some prose about the section, no Status line at all.',
        '',
      );
    }
    if (f.endsWith(path.join('docs', 'goals', 'card.md'))) {
      return L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '');
    }
    return fs.readFileSync(f, 'utf8');
  };
  const page = renderPage({ repo: '/fake/repo', sha: 'test', readFile, templatePath: TEMPLATE_PATH });
  assert.match(page, /<span color="red">\*\*UNKNOWN\*\*<\/span>/);
  assert.match(page, /# A section with no status \{toggle="true"\}/);
});

test('sources are joined to --repo directly, never a root walk-up', () => {
  const seen = [];
  const readFile = (f) => { seen.push(f); return fs.readFileSync(f, 'utf8').length ? 'x\n' : 'x\n'; };
  // Force a throw so we only need to inspect the FIRST path requested, not build a full fixture.
  const throwing = (f) => { seen.push(f); throw new Error('stop'); };
  assert.throws(() => renderPage({ repo: '/some/repo', sha: 't', readFile: throwing, templatePath: TEMPLATE_PATH }));
  assert.equal(seen[0], path.join('/some/repo', 'docs', 'GOALS.md'));
});

// ---------------------------------------------------------------------------
// Render-refusal guard: `- [`, `<summary`, `Default…:`, a code fence (Test 5 / attack brief).
// ---------------------------------------------------------------------------

function repoWithGoalsLine(line) {
  return (f) => {
    if (f.endsWith(path.join('docs', 'GOALS.md'))) {
      return L('# Goals', '', '## A section', '', line, '');
    }
    if (f.endsWith(path.join('docs', 'goals', 'card.md'))) {
      return L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '');
    }
    throw new Error(`unexpected read: ${f}`);
  };
}

test('render exits 1 naming the line for a "- [" checkbox-shaped source line', () => {
  const { out, write, writeErr } = collect();
  const readFile = repoWithGoalsLine('- [ ] looks like a checkbox');
  const code = run({
    argv: ['render', '--repo', '/fake', '--sha', 't'],
    readFile: (f) => (f === path.join('/fake', 'docs', 'GOALS.md') || f === path.join('/fake', 'docs', 'goals', 'card.md'))
      ? readFile(f) : fs.readFileSync(f, 'utf8'),
    write, writeErr,
  });
  assert.equal(code, 1);
  assert.match(out.stderr, /- \[/);
  assert.match(out.stderr, /GOALS\.md/);
});

test('render exits 1 naming the line for a "<summary" source line', () => {
  const { out, write, writeErr } = collect();
  const readFile = repoWithGoalsLine('<summary>sneaky</summary>');
  const code = run({
    argv: ['render', '--repo', '/fake', '--sha', 't'],
    readFile: (f) => (f === path.join('/fake', 'docs', 'GOALS.md') || f === path.join('/fake', 'docs', 'goals', 'card.md'))
      ? readFile(f) : fs.readFileSync(f, 'utf8'),
    write, writeErr,
  });
  assert.equal(code, 1);
  assert.match(out.stderr, /<summary/);
});

test('render exits 1 naming the line for a "Default…:" source line', () => {
  const { out, write, writeErr } = collect();
  const readFile = repoWithGoalsLine('Default after 2026-01-01 00:00 +00:00: do the thing');
  const code = run({
    argv: ['render', '--repo', '/fake', '--sha', 't'],
    readFile: (f) => (f === path.join('/fake', 'docs', 'GOALS.md') || f === path.join('/fake', 'docs', 'goals', 'card.md'))
      ? readFile(f) : fs.readFileSync(f, 'utf8'),
    write, writeErr,
  });
  assert.equal(code, 1);
  assert.match(out.stderr, /Default/);
});

test('render exits 1 naming the line for a code fence', () => {
  const { out, write, writeErr } = collect();
  const readFile = repoWithGoalsLine('```js');
  const code = run({
    argv: ['render', '--repo', '/fake', '--sha', 't'],
    readFile: (f) => (f === path.join('/fake', 'docs', 'GOALS.md') || f === path.join('/fake', 'docs', 'goals', 'card.md'))
      ? readFile(f) : fs.readFileSync(f, 'utf8'),
    write, writeErr,
  });
  assert.equal(code, 1);
  assert.match(out.stderr, /code fence/);
});

test('a line starting "Default" with no colon is NOT refused (ordinary prose)', () => {
  const base = repoWithGoalsLine('Default behaviour has not changed since last release');
  const readFile = (f) => (f === TEMPLATE_PATH ? fs.readFileSync(TEMPLATE_PATH, 'utf8') : base(f));
  const page = renderPage({ repo: '/fake', sha: 't', readFile, templatePath: TEMPLATE_PATH });
  assert.match(page, /Default behaviour has not changed/);
});

// ---------------------------------------------------------------------------
// computeSha / checkDirty (git mocked — never a real git call in a test).
// ---------------------------------------------------------------------------

test('computeSha runs the pinned git log command and trims its output', () => {
  const calls = [];
  const git = (repo, args) => { calls.push({ repo, args }); return 'abc1234\n'; };
  const sha = computeSha({ repo: '/repo', git });
  assert.equal(sha, 'abc1234');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['log', '-1', '--format=%h', 'origin/main', '--', 'docs/GOALS.md', 'docs/goals/card.md']);
});

test('checkDirty: clean when the working tree matches origin/main for both sources', () => {
  const readFile = (f) => (f.endsWith('GOALS.md') ? 'goals content\n' : 'card content\n');
  const git = (_repo, args) => (args[1].includes('GOALS.md') ? 'goals content\n' : 'card content\n');
  const result = checkDirty({ repo: '/repo', readFile, git });
  assert.equal(result.dirty, false);
});

test('checkDirty: dirty when the working tree differs from origin/main (mocked git)', () => {
  const readFile = (f) => (f.endsWith('GOALS.md') ? 'LOCAL EDIT\n' : 'card content\n');
  const git = (_repo, args) => (args[1].includes('GOALS.md') ? 'goals content on origin\n' : 'card content\n');
  const result = checkDirty({ repo: '/repo', readFile, git });
  assert.equal(result.dirty, true);
  assert.equal(result.path, 'docs/GOALS.md');
});

// ---------------------------------------------------------------------------
// publish: dirty-tree refusal, owner-note refusal, zero notion.js calls (mocked spawn).
// ---------------------------------------------------------------------------

function cleanGit(content) {
  return (_repo, args) => {
    if (args[0] === 'show') {
      return args[1].includes('GOALS.md') ? content.goals : content.card;
    }
    if (args[0] === 'log') return 'test1234\n';
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };
}

function fakeFiles(repo, content) {
  return (f) => {
    if (f === path.join(repo, 'docs', 'GOALS.md')) return content.goals;
    if (f === path.join(repo, 'docs', 'goals', 'card.md')) return content.card;
    if (f === TEMPLATE_PATH) return fs.readFileSync(TEMPLATE_PATH, 'utf8');
    throw new Error(`unexpected read: ${f}`);
  };
}

test('publish refuses (exit 1) on a dirty source file and calls notion.js zero times', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = (_repo, args) => {
    if (args[0] === 'show') return args[1].includes('GOALS.md') ? 'DIFFERENT UPSTREAM CONTENT\n' : content.card;
    throw new Error('git log should not be reached before the dirty check refuses');
  };
  let spawnCalls = 0;
  const spawnNotion = () => { spawnCalls += 1; return { status: 0, stdout: '', stderr: '' }; };
  const { out, write, writeErr } = collect();
  const code = run({
    argv: ['publish', '--repo', repo, '--parent', 'p1', '--current', 'none'],
    readFile: fakeFiles(repo, content),
    git, spawnNotion, write, writeErr,
  });
  assert.equal(code, 1);
  assert.equal(spawnCalls, 0);
  assert.match(out.stderr, /docs\/GOALS\.md/);
});

test('publish with a --current carrying one ** note exits 1 with zero notion.js calls', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  let spawnCalls = 0;
  const spawnNotion = () => { spawnCalls += 1; return { status: 0, stdout: '', stderr: '' }; };
  const currentRead = L(
    '# Waiting on you now {toggle="true"}',
    '\t\\*\\* this needs a new section',
  );
  const files = fakeFiles(repo, content);
  const readFile = (f) => (f === '/current.md' ? currentRead : files(f));
  const { out, write, writeErr } = collect();
  const code = run({
    argv: ['publish', '--repo', repo, '--parent', 'p1', '--current', '/current.md'],
    readFile, git, spawnNotion, write, writeErr,
  });
  assert.equal(code, 1);
  assert.equal(spawnCalls, 0);
  assert.match(out.stdout, /UNATTACHED/);
});

test('publish with --current none and a clean tree renders and calls notion.js exactly once', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  const calls = [];
  const spawnNotion = (args) => { calls.push(args); return { status: 0, stdout: 'published\n', stderr: '' }; };
  const written = {};
  const { out, write, writeErr } = collect();
  const code = run({
    argv: ['publish', '--repo', repo, '--parent', 'goal-page-id', '--current', 'none'],
    readFile: fakeFiles(repo, content),
    writeFile: (f, s) => { written[f] = s; },
    git, spawnNotion, write, writeErr,
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].parent, 'goal-page-id');
  assert.equal(calls[0].title, 'Goals');
  assert.ok(written[calls[0].file].includes('main at test1234'));
});

test('publish requires --repo, --parent and --current; missing any is refused, not crashed', () => {
  const { write, writeErr } = collect();
  assert.equal(run({ argv: ['publish', '--parent', 'p', '--current', 'none'], write, writeErr }), 1);
  assert.equal(run({ argv: ['publish', '--repo', '/r', '--current', 'none'], write, writeErr }), 1);
  assert.equal(run({ argv: ['publish', '--repo', '/r', '--parent', 'p'], write, writeErr }), 1);
});

test('render requires --repo; missing it is refused, not crashed', () => {
  const { write, writeErr } = collect();
  assert.equal(run({ argv: ['render'], write, writeErr }), 1);
});

test('an unreadable --current is BLIND (exit 3), not a false-clean publish', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  let spawnCalls = 0;
  const spawnNotion = () => { spawnCalls += 1; return { status: 0, stdout: '', stderr: '' }; };
  const files = fakeFiles(repo, content);
  const readFile = (f) => { if (f === '/missing.md') throw new Error('ENOENT'); return files(f); };
  const { write, writeErr } = collect();
  const code = run({
    argv: ['publish', '--repo', repo, '--parent', 'p1', '--current', '/missing.md'],
    readFile, git, spawnNotion, write, writeErr,
  });
  assert.equal(code, 3);
  assert.equal(spawnCalls, 0);
});
