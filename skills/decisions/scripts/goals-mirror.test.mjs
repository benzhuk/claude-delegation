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

import { renderPage, computeSha, checkDirty, run, defaultCheckGoalsPageAbsent } from './goals-mirror.mjs';
import { parseDocument } from './decisions-read.mjs';
import { childEnv, scratchHome } from '../../multi/scripts/test-child-env.mjs';

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
  const home = scratchHome(fs, 'goals-mirror-');
  try {
    const res = spawnSync(process.execPath, [
      scriptPath, 'render', '--repo', FIXTURE_REPO, '--sha', 'test',
    ], { encoding: 'utf8', env: childEnv(home) });
    const expected = fs.readFileSync(EXPECTED_PATH, 'utf8');
    assert.equal(res.status, 0);
    assert.equal(res.stdout, expected);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('--sha override lands in the callout exactly once', () => {
  const page = renderPage({ repo: FIXTURE_REPO, sha: 'abc1234' });
  const matches = page.match(/main at abc1234/g) || [];
  assert.equal(matches.length, 1);
  // and it is inside the first line of the page's first callout, per the shared sha-line contract
  const firstCalloutBody = page.split('\n')[1];
  assert.match(firstCalloutBody, /\bmain at abc1234\b/);
});

test('the mirror callout backticks docs/GOALS.md and docs/goals/card.md, per the pinned contract', () => {
  const page = renderPage({ repo: FIXTURE_REPO, sha: 'test' });
  const firstCalloutBody = page.split('\n')[1];
  assert.match(firstCalloutBody, /`docs\/GOALS\.md`/);
  assert.match(firstCalloutBody, /`docs\/goals\/card\.md`/);
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
  assert.match(out.stderr, /docs\/GOALS\.md:5\b/);
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
  assert.match(out.stderr, /docs\/GOALS\.md:5\b/);
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
  assert.match(out.stderr, /docs\/GOALS\.md:5\b/);
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
  assert.match(out.stderr, /docs\/GOALS\.md:5\b/);
});

test('render exits 1 naming the line for a mid-line "<summary>" not at line start', () => {
  const { out, write, writeErr } = collect();
  const readFile = repoWithGoalsLine('Items use a <summary> toggle, not a bullet.');
  const code = run({
    argv: ['render', '--repo', '/fake', '--sha', 't'],
    readFile: (f) => (f === path.join('/fake', 'docs', 'GOALS.md') || f === path.join('/fake', 'docs', 'goals', 'card.md'))
      ? readFile(f) : fs.readFileSync(f, 'utf8'),
    write, writeErr,
  });
  assert.equal(code, 1);
  assert.match(out.stderr, /<summary/);
  assert.match(out.stderr, /docs\/GOALS\.md:5\b/);
});

test('render exits 1 for a "- Default…:" line with a leading bullet stripped, as the reader does', () => {
  const { out, write, writeErr } = collect();
  const readFile = repoWithGoalsLine('- Default after tomorrow: ship it');
  const code = run({
    argv: ['render', '--repo', '/fake', '--sha', 't'],
    readFile: (f) => (f === path.join('/fake', 'docs', 'GOALS.md') || f === path.join('/fake', 'docs', 'goals', 'card.md'))
      ? readFile(f) : fs.readFileSync(f, 'utf8'),
    write, writeErr,
  });
  assert.equal(code, 1);
  assert.match(out.stderr, /Default/);
  assert.match(out.stderr, /docs\/GOALS\.md:5\b/);
});

test('render exits 1 for a "* [ ]" bullet, which Notion turns into a to-do block like "- [ ]"', () => {
  const { out, write, writeErr } = collect();
  const readFile = repoWithGoalsLine('* [ ] x');
  const code = run({
    argv: ['render', '--repo', '/fake', '--sha', 't'],
    readFile: (f) => (f === path.join('/fake', 'docs', 'GOALS.md') || f === path.join('/fake', 'docs', 'goals', 'card.md'))
      ? readFile(f) : fs.readFileSync(f, 'utf8'),
    write, writeErr,
  });
  assert.equal(code, 1);
  assert.match(out.stderr, /docs\/GOALS\.md:5\b/);
});

test('a line starting "Default" with no colon is NOT refused (ordinary prose)', () => {
  const base = repoWithGoalsLine('Default behaviour has not changed since last release');
  const readFile = (f) => (f === TEMPLATE_PATH ? fs.readFileSync(TEMPLATE_PATH, 'utf8') : base(f));
  const page = renderPage({ repo: '/fake', sha: 't', readFile, templatePath: TEMPLATE_PATH });
  assert.match(page, /Default behaviour has not changed/);
});

test('a "$" in the sources renders verbatim, not as a replace() special pattern (reviewer attack)', () => {
  const base = repoWithGoalsLine("Costs $' and $& and $$ and $` stay");
  const readFile = (f) => (f === TEMPLATE_PATH ? fs.readFileSync(TEMPLATE_PATH, 'utf8') : base(f));
  const page = renderPage({ repo: '/fake', sha: 't', readFile, templatePath: TEMPLATE_PATH });
  assert.match(page, /\tCosts \$' and \$& and \$\$ and \$` stay/);
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

test('computeSha is BLIND (rethrows) when git fails, not a silent 1', () => {
  const git = () => { throw new Error('git not found'); };
  assert.throws(() => computeSha({ repo: '/repo', git }), /BlindError|git log failed/);
});

test('render is BLIND (exit 3) when git log fails, not exit 1', () => {
  const { write, writeErr } = collect();
  const git = () => { throw new Error('git not found'); };
  const code = run({ argv: ['render', '--repo', '/fake'], git, write, writeErr });
  assert.equal(code, 3);
});

test('render is BLIND (exit 3) when a source read fails, not exit 1', () => {
  const { write, writeErr } = collect();
  const readFile = () => { throw new Error('ENOENT'); };
  const code = run({ argv: ['render', '--repo', '/fake', '--sha', 't'], readFile, write, writeErr });
  assert.equal(code, 3);
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

test('checkDirty is BLIND (throws) when "git show" fails, never reported as clean', () => {
  const readFile = () => 'content\n';
  const git = () => { throw new Error('git show failed'); };
  assert.throws(() => checkDirty({ repo: '/repo', readFile, git }));
});

test('publish is BLIND (exit 3) when checkDirty\'s "git show" fails, not a false-clean publish', () => {
  const repo = '/repo';
  let spawnCalls = 0;
  const spawnNotion = () => { spawnCalls += 1; return { status: 0, stdout: '', stderr: '' }; };
  const git = () => { throw new Error('git show failed'); };
  const readFile = () => { throw new Error('should not be reached: dirty check refuses first'); };
  const { write, writeErr } = collect();
  const code = run({
    argv: ['publish', '--repo', repo, '--parent', 'p1', '--current', 'none'],
    readFile, git, spawnNotion, write, writeErr,
  });
  assert.equal(code, 3);
  assert.equal(spawnCalls, 0);
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

test('publish with a --current decision holding one unreplied comment exits 1 as COMMENTED, zero notion.js calls', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  let spawnCalls = 0;
  const spawnNotion = () => { spawnCalls += 1; return { status: 0, stdout: '', stderr: '' }; };
  const currentRead = L(
    '# Ship the thing {toggle="true"}',
    '\t- [ ] do it',
    '\tNo default line stated.',
    '\t\\*\\* comment needs answer',
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
  assert.match(out.stdout, /^COMMENTED\t/m);
});

test('publish with --current none and a clean tree renders and calls notion.js exactly once, when the Goals page is confirmed absent', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  const calls = [];
  const spawnNotion = (args) => { calls.push(args); return { status: 0, stdout: 'published\n', stderr: '' }; };
  const written = {};
  let absentCalls = 0;
  const checkGoalsPageAbsent = () => { absentCalls += 1; return true; };
  const { out, write, writeErr } = collect();
  const code = run({
    argv: ['publish', '--repo', repo, '--parent', 'goal-page-id', '--current', 'none'],
    readFile: fakeFiles(repo, content),
    writeFile: (f, s) => { written[f] = s; },
    git, spawnNotion, checkGoalsPageAbsent, write, writeErr,
  });
  assert.equal(code, 0);
  assert.equal(absentCalls, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].parent, 'goal-page-id');
  assert.equal(calls[0].title, 'Goals');
  assert.ok(written[calls[0].file].includes('main at test1234'));
});

test('publish with --current none is refused (exit 1) when the Goals page is found to exist, zero notion.js calls (addendum patch b)', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  let spawnCalls = 0;
  const spawnNotion = () => { spawnCalls += 1; return { status: 0, stdout: '', stderr: '' }; };
  const checkGoalsPageAbsent = () => false;
  const { out, write, writeErr } = collect();
  const code = run({
    argv: ['publish', '--repo', repo, '--parent', 'goal-page-id', '--current', 'none'],
    readFile: fakeFiles(repo, content),
    git, spawnNotion, checkGoalsPageAbsent, write, writeErr,
  });
  assert.equal(code, 1);
  assert.equal(spawnCalls, 0);
  assert.match(out.stderr, /--current none requires the Goals page to be absent/);
});

test('publish with --current none is BLIND (exit 3) when checkGoalsPageAbsent cannot tell, never a silent bypass', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  let spawnCalls = 0;
  const spawnNotion = () => { spawnCalls += 1; return { status: 0, stdout: '', stderr: '' }; };
  const checkGoalsPageAbsent = () => { throw new Error('notion.js search failed'); };
  const { write, writeErr } = collect();
  const code = run({
    argv: ['publish', '--repo', repo, '--parent', 'goal-page-id', '--current', 'none'],
    readFile: fakeFiles(repo, content),
    git, spawnNotion, checkGoalsPageAbsent, write, writeErr,
  });
  assert.equal(code, 3);
  assert.equal(spawnCalls, 0);
});

test('publish with a real --current file never calls checkGoalsPageAbsent (that bypass gate applies only to --current none)', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  const spawnNotion = () => ({ status: 0, stdout: '', stderr: '' });
  let absentCalls = 0;
  const checkGoalsPageAbsent = () => { absentCalls += 1; return true; };
  const currentRead = L('# Goals {toggle="true"}', '\t<empty-block/>');
  const files = fakeFiles(repo, content);
  const readFile = (f) => (f === '/current.md' ? currentRead : files(f));
  const { write, writeErr } = collect();
  const code = run({
    argv: ['publish', '--repo', repo, '--parent', 'goal-page-id', '--current', '/current.md'],
    readFile, git, spawnNotion, checkGoalsPageAbsent, write, writeErr,
  });
  assert.equal(code, 0);
  assert.equal(absentCalls, 0);
});

test('publish with a --current TICKED decision holding one unreplied comment exits 1, zero notion.js calls (addendum patch a: every status, not just COMMENTED)', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  let spawnCalls = 0;
  const spawnNotion = () => { spawnCalls += 1; return { status: 0, stdout: '', stderr: '' }; };
  const currentRead = L(
    '# Ship the thing {toggle="true"}',
    '\t- [x] do it',
    '\tNo default line stated.',
    '\t\\*\\* wait, are we sure?',
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
  assert.match(out.stdout, /^COMMENTED\t/m);
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

// ---------------------------------------------------------------------------
// r2 review: defaultCheckGoalsPageAbsent must be parent-scoped (MAJOR 1), the "absent"
// gate must be a strict boolean (MINOR 2), and a note shape the reader misses must still
// block publish (MINOR 3). Every case here injects a fake `spawn`/`checkGoalsPageAbsent`
// — never the real notion.js.
// ---------------------------------------------------------------------------

test('defaultCheckGoalsPageAbsent: a "Goals" child page under --parent is found -> not absent', () => {
  const spawn = () => ({ status: 0, stdout: '# Plan\n\n[child page: Goals] (abc)\n' });
  const absent = defaultCheckGoalsPageAbsent({ parent: 'P', title: 'Goals', spawn });
  assert.equal(absent, false);
});

test('defaultCheckGoalsPageAbsent: only a similarly-titled child page -> absent (parent-scoped, not a fuzzy match)', () => {
  const spawn = () => ({ status: 0, stdout: '# Plan\n\n[child page: Goals ruling] (x)\n' });
  const absent = defaultCheckGoalsPageAbsent({ parent: 'P', title: 'Goals', spawn });
  assert.equal(absent, true);
});

test('defaultCheckGoalsPageAbsent: no children at all -> absent', () => {
  const spawn = () => ({ status: 0, stdout: '# Plan\n\nnothing here\n' });
  const absent = defaultCheckGoalsPageAbsent({ parent: 'P', title: 'Goals', spawn });
  assert.equal(absent, true);
});

test('defaultCheckGoalsPageAbsent: a non-zero exit is BLIND, never "absent"', () => {
  const spawn = () => ({ status: 1, stdout: '', stderr: 'boom' });
  assert.throws(() => defaultCheckGoalsPageAbsent({ parent: 'P', title: 'Goals', spawn }), /BlindError|cannot list/);
});

test('defaultCheckGoalsPageAbsent: exit 0 with no page header is BLIND, never "absent"', () => {
  const spawn = () => ({ status: 0, stdout: '' });
  assert.throws(() => defaultCheckGoalsPageAbsent({ parent: 'P', title: 'Goals', spawn }), /BlindError|page header/);
});

test('defaultCheckGoalsPageAbsent: spawns notion.js read-blocks scoped to --parent, not a global search', () => {
  const calls = [];
  const spawn = (cmd, args) => { calls.push(args); return { status: 0, stdout: '# Plan\n\nnothing\n' }; };
  defaultCheckGoalsPageAbsent({ parent: 'P', title: 'Goals', spawn });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(-2), ['read-blocks', 'P']);
});

test('publish with --current none refuses (exit 1) unless checkGoalsPageAbsent returns exactly true (MINOR 2: no truthy shortcuts)', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  const truthyNonTrue = [Promise.resolve(false), 'false', 1, 'no', {}];
  for (const val of truthyNonTrue) {
    let spawnCalls = 0;
    const spawnNotion = () => { spawnCalls += 1; return { status: 0, stdout: '', stderr: '' }; };
    const checkGoalsPageAbsent = () => val;
    const { write, writeErr } = collect();
    const code = run({
      argv: ['publish', '--repo', repo, '--parent', 'goal-page-id', '--current', 'none'],
      readFile: fakeFiles(repo, content),
      git, spawnNotion, checkGoalsPageAbsent, write, writeErr,
    });
    assert.equal(code, 1, `expected refusal for checkGoalsPageAbsent() === ${JSON.stringify(val)}`);
    assert.equal(spawnCalls, 0);
  }
});

test('publish with --current none proceeds only when checkGoalsPageAbsent returns the literal boolean true', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  const spawnNotion = () => ({ status: 0, stdout: '', stderr: '' });
  const checkGoalsPageAbsent = () => true;
  const { write, writeErr } = collect();
  const code = run({
    argv: ['publish', '--repo', repo, '--parent', 'goal-page-id', '--current', 'none'],
    readFile: fakeFiles(repo, content),
    git, spawnNotion, checkGoalsPageAbsent, write, writeErr,
  });
  assert.equal(code, 0);
});

test('publish refuses (exit 1) a quoted "> \\*\\* note" the reader silently drops, via the raw-note backstop', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  let spawnCalls = 0;
  const spawnNotion = () => { spawnCalls += 1; return { status: 0, stdout: '', stderr: '' }; };
  const currentRead = L(
    '# Ship the thing {toggle="true"}',
    '\t- [ ] do it',
    '\tNo default line stated.',
    '\t> \\*\\* quoted note the reader silently drops',
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
  assert.match(out.stdout, /^NOTE\tline \d+\t/m);
});

test('publish refuses (exit 1) a numbered "1. \\*\\* note" the reader silently drops, via the raw-note backstop', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  let spawnCalls = 0;
  const spawnNotion = () => { spawnCalls += 1; return { status: 0, stdout: '', stderr: '' }; };
  const currentRead = L(
    '# Ship the thing {toggle="true"}',
    '\t- [ ] do it',
    '\tNo default line stated.',
    '\t1. \\*\\* numbered note the reader silently drops',
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
  assert.match(out.stdout, /^NOTE\tline \d+\t/m);
});

test('publish does NOT refuse on a mid-line escaped marker ("see \\*\\* here") — the backstop only matches a note at line start', () => {
  const repo = '/repo';
  const content = { goals: L('# Goals', '', '## S', '', 'Status: MET. ok', ''), card: L('GOAL: g', 'NOT: n', 'DONE: d', 'KILL: k', 'SOURCE: s.md', '') };
  const git = cleanGit(content);
  const spawnNotion = () => ({ status: 0, stdout: '', stderr: '' });
  const currentRead = L(
    '# Ship the thing {toggle="true"}',
    '\t- [ ] do it',
    '\tNo default line stated.',
    '\tsee \\*\\* here for the convention, not a note',
  );
  const files = fakeFiles(repo, content);
  const readFile = (f) => (f === '/current.md' ? currentRead : files(f));
  const { write, writeErr } = collect();
  const code = run({
    argv: ['publish', '--repo', repo, '--parent', 'p1', '--current', '/current.md'],
    readFile, git, spawnNotion, write, writeErr,
  });
  assert.equal(code, 0);
});
