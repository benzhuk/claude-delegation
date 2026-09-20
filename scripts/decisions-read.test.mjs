// node --test "scripts/*.test.mjs"
// decisions-read: markdown in, a status list out. Fixtures below are synthetic, modelled on
// Notion's markdown export shape (tabs for indentation, `<details>`/toggleable headings, escaped
// owner asterisks) — never copied from a real page. Spec: docs/specs/2026-09-20-decisions-reader.md
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseDocument, formatText, formatJson, toJsonObject, computeExitCode, run } from './decisions-read.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./decisions-read.mjs', import.meta.url));

const L = (...lines) => lines.join('\n');

test('details-toggle decision: OPEN, TICKED, AMBIGUOUS, COMMENTED', () => {
  const md = L(
    '<details>',
    '<summary>Open one</summary>',
    '\t- [ ] a',
    '\t- [ ] b',
    '</details>',
    '<details>',
    '<summary>Ticked one</summary>',
    '\t- [ ] a',
    '\t- [x] b',
    '</details>',
    '<details>',
    '<summary>Ambiguous one</summary>',
    '\t- [x] a',
    '\t- [x] b',
    '</details>',
    '<details>',
    '<summary>Commented one</summary>',
    '\t- [ ] a',
    '\t- [ ] \\*\\* what about a third option?',
    '</details>',
  );
  const doc = parseDocument(md);
  const byTitle = Object.fromEntries(doc.decisions.map((d) => [d.title, d]));
  assert.equal(byTitle['Open one'].status, 'OPEN');
  assert.equal(byTitle['Ticked one'].status, 'TICKED');
  assert.equal(byTitle['Ambiguous one'].status, 'AMBIGUOUS');
  assert.equal(byTitle['Commented one'].status, 'COMMENTED');
  assert.deepEqual(byTitle['Commented one'].comments.map((c) => c.text), ['what about a third option?']);
  assert.equal(byTitle['Commented one'].options.length, 1, 'the comment line is not counted as an option');
});

test('toggleable heading decision, levels 1-3, all recognised as titles', () => {
  const md = L(
    '# Level one {toggle="true"}',
    '\t- [x] picked',
    '\t- [ ] other',
    '## Level two {toggle="true"}',
    '\t- [x] picked2',
    '### Level three {toggle="true"}',
    '\t- [x] picked3',
  );
  const doc = parseDocument(md);
  assert.deepEqual(doc.decisions.map((d) => d.title), ['Level one', 'Level two', 'Level three']);
  assert.ok(doc.decisions.every((d) => d.status === 'TICKED'));
});

test('a decision nested two levels under grouping toggles attaches to the nearest title', () => {
  const md = L(
    '<details>',
    '<summary>Grouping A</summary>',
    '\t<details>',
    '\t<summary>Nested decision</summary>',
    '\t\t- [ ] option1',
    '\t\t- [x] option2',
    '\t</details>',
    '</details>',
  );
  const doc = parseDocument(md);
  assert.deepEqual(doc.decisions.map((d) => d.title), ['Nested decision'], 'Grouping A has no options of its own');
  assert.equal(doc.decisions[0].status, 'TICKED');
});

test('grouping sections with bullets but no checkbox options are not reported', () => {
  const md = L(
    '# Closed {toggle="true"}',
    '\t- Some closed item, decided already.',
    '\t- Another closed item.',
    '# Waiting {toggle="true"}',
    '\t- [x] real option',
  );
  const doc = parseDocument(md);
  assert.deepEqual(doc.decisions.map((d) => d.title), ['Waiting']);
});

test('an owner comment written as a checkbox line is a comment, never an option or a tick, even ticked', () => {
  const md = L(
    '<summary>A decision</summary>',
    '\t- [x] \\*\\* is this ticked box actually a comment?',
    '\t- [ ] the only real option',
  );
  const doc = parseDocument(md);
  const d = doc.decisions[0];
  assert.equal(d.status, 'COMMENTED', 'the ticked box is a comment, so nothing is TICKED or AMBIGUOUS');
  assert.equal(d.options.length, 1);
  assert.equal(d.options[0].ticked, false);
});

test('agent-written bold (plain **) is not a comment', () => {
  const md = L(
    '<summary>A decision</summary>',
    '\t**Recommendation:** pick the first one',
    '\t- [ ] a',
    '\t- [ ] b',
  );
  const doc = parseDocument(md);
  const d = doc.decisions[0];
  assert.equal(d.comments.length, 0);
  assert.equal(d.status, 'OPEN');
});

test('a trailing digit-led count suffix is stripped from the title, other parens are not', () => {
  const md = L(
    '<summary>**My Title**  (7 · 4 covered)</summary>',
    '\t- [ ] a',
  );
  assert.equal(parseDocument(md).decisions[0].title, 'My Title');
});

test('Done: true, false, and absent', () => {
  const trueDoc = parseDocument(L('<summary>t</summary>', '\t- [ ] a', '- [x] Done'));
  const falseDoc = parseDocument(L('<summary>t</summary>', '\t- [ ] a', '- [ ] Done'));
  const absentDoc = parseDocument(L('<summary>t</summary>', '\t- [ ] a', 'just a closing paragraph'));
  assert.equal(trueDoc.done, true);
  assert.equal(falseDoc.done, false);
  assert.equal(absentDoc.done, null);
});

test('Done detected past trailing <empty-block/> and blank lines', () => {
  const md = L('<summary>t</summary>', '\t- [ ] a', '- [x] Done', '<empty-block/>', '', '');
  assert.equal(parseDocument(md).done, true);
});

test('a Done checkbox that is not the page-level line is an ordinary option', () => {
  const md = L(
    '<summary>t</summary>',
    '\t- [ ] Done',
    '\t- [x] other',
    'trailing paragraph, so the last line is not a checkbox at all',
  );
  const doc = parseDocument(md);
  assert.equal(doc.done, null, 'the true last line is not a column-0 Done checkbox');
  assert.deepEqual(doc.decisions[0].options.map((o) => o.text), ['Done', 'other']);
  assert.equal(doc.decisions[0].status, 'TICKED');
});

test('unattached tick and unattached comment, before any title, reported with line numbers', () => {
  const md = L(
    '- [x] a stray ticked box before any title', // line 1
    '- [ ] \\*\\* a stray comment before any title', // line 2
    '<summary>Real decision</summary>', // line 3
    '\t- [ ] a', // line 4
  );
  const doc = parseDocument(md);
  assert.deepEqual(doc.unattached, [
    { text: 'a stray ticked box before any title', line: 1, kind: 'tick' },
    { text: 'a stray comment before any title', line: 2, kind: 'comment' },
  ]);
  assert.equal(doc.decisions.length, 1, 'the real decision after the title is unaffected');
});

test('an unticked, unattached checkbox before any title is silently dropped, not reported', () => {
  const md = L('- [ ] unticked, before any title', '<summary>t</summary>', '\t- [ ] a');
  assert.equal(parseDocument(md).unattached.length, 0);
});

test('checkboxes inside a fenced code block are ignored entirely', () => {
  const md = L(
    '<summary>t</summary>',
    '\t```javascript',
    '\t- [x] this looks like an option but is inside a fence',
    '\t```',
    '\t- [x] this is the real, only option',
  );
  const doc = parseDocument(md);
  assert.equal(doc.decisions[0].options.length, 1);
  assert.equal(doc.decisions[0].options[0].text, 'this is the real, only option');
});

test('an unterminated fence fails closed: parseDocument throws', () => {
  const md = L('<summary>t</summary>', '\t```', '\t- [x] never closed');
  assert.throws(() => parseDocument(md), /fenc/i);
});

test('empty input throws (blind)', () => {
  assert.throws(() => parseDocument(''), /empty/i);
  assert.throws(() => parseDocument('   \n  \n'), /empty/i);
});

test('zero titles found throws (blind)', () => {
  assert.throws(() => parseDocument(L('just a paragraph', '- [x] a checkbox with no title above it')), /title/i);
});

test('formatText: one line per decision, then UNATTACHED lines, then DONE', () => {
  const md = L(
    '- [x] stray',
    '<summary>A</summary>',
    '\t- [x] yes',
    '<summary>B (3 covered)</summary>',
    '\t- [ ] no',
    '- [x] Done',
  );
  const doc = parseDocument(md);
  const text = formatText(doc);
  assert.equal(text, L(
    'TICKED\tA\tyes',
    'OPEN\tB\t',
    'UNATTACHED\tline 1\tstray',
    'DECISIONS\t2',
    'DONE\ttrue',
  ));
});

test('formatJson / toJsonObject: full shape', () => {
  const md = L(
    '<summary>A</summary>',
    '\t- [x] yes',
    '\t- [ ] \\*\\* a comment too',
  );
  const doc = parseDocument(md);
  const obj = toJsonObject(doc);
  assert.deepEqual(obj, {
    decisions: [{
      title: 'A',
      status: 'TICKED',
      line: 1,
      options: [{ text: 'yes', ticked: true, line: 2 }],
      comments: [{ text: 'a comment too', line: 3 }],
    }],
    unattached: [],
    decisionCount: 1,
    done: null,
  });
  assert.deepEqual(JSON.parse(formatJson(doc)), obj);
});

test('computeExitCode: 0 when every decision is OPEN and nothing is unattached, else 1', () => {
  const openOnly = parseDocument(L('<summary>t</summary>', '\t- [ ] a', '\t- [ ] b'));
  const ticked = parseDocument(L('<summary>t</summary>', '\t- [x] a'));
  const unattachedOnly = parseDocument(L('- [x] stray', '<summary>t</summary>', '\t- [ ] a'));
  assert.equal(computeExitCode(openOnly), 0);
  assert.equal(computeExitCode(ticked), 1);
  assert.equal(computeExitCode(unattachedOnly), 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// The CLI wrapper: stdin, --json, file arg, and the exit-code contract
// ─────────────────────────────────────────────────────────────────────────────

function runWith({ argv = [], stdinText, fileText } = {}) {
  const out = [];
  const err = [];
  const exitCode = run({
    argv,
    readStdin: () => stdinText,
    readFile: () => fileText,
    write: (s) => out.push(s),
    writeErr: (s) => err.push(s),
  });
  return { exitCode, stdout: out.join(''), stderr: err.join('') };
}

test('CLI: stdin input works when no file argument is given', () => {
  const { exitCode, stdout } = runWith({ stdinText: L('<summary>t</summary>', '\t- [x] a') });
  assert.equal(exitCode, 1);
  assert.match(stdout, /^TICKED\tt\ta/);
});

test('CLI: a file argument reads from readFile, not stdin', () => {
  const { exitCode, stdout } = runWith({ argv: ['some.md'], fileText: L('<summary>t</summary>', '\t- [ ] a') });
  assert.equal(exitCode, 0);
  assert.match(stdout, /^OPEN\tt\t/);
});

test('CLI: --json switches to JSON output', () => {
  const { stdout } = runWith({ argv: ['--json'], stdinText: L('<summary>t</summary>', '\t- [x] a') });
  const parsed = JSON.parse(stdout);
  assert.ok(Array.isArray(parsed.decisions));
  assert.equal(parsed.decisions[0].status, 'TICKED');
});

test('CLI: a crash inside IO is caught and reported as exit 3 with a one-line stderr message, never thrown', () => {
  const exitCode = run({
    argv: ['some.md'],
    readFile: () => { throw new Error('ENOENT: no such file'); },
    write: () => {},
    writeErr: () => {},
  });
  assert.equal(exitCode, 3);
  const messages = [];
  const exitCode2 = run({
    argv: ['some.md'],
    readFile: () => { throw new Error('ENOENT: no such file'); },
    write: () => {},
    writeErr: (s) => messages.push(s),
  });
  assert.equal(exitCode2, 3);
  assert.equal(messages.length, 1, 'one line to stderr');
  assert.equal((messages[0].match(/\n/g) || []).length, 1, 'exactly one trailing newline, no more');
});

test('exit codes 0 and 1 through the CLI wrapper', () => {
  assert.equal(runWith({ stdinText: L('<summary>t</summary>', '\t- [ ] a') }).exitCode, 0);
  assert.equal(runWith({ stdinText: L('<summary>t</summary>', '\t- [x] a') }).exitCode, 1);
});

test('NEVER exit 2: every path below returns 0, 1, or 3, including blind input and an internal crash', () => {
  const cases = [
    runWith({ stdinText: '' }).exitCode, // empty -> blind
    runWith({ stdinText: 'no titles here at all' }).exitCode, // no titles -> blind
    runWith({ stdinText: L('<summary>t</summary>', '\t```', '\t- [x] unterminated') }).exitCode, // fence -> blind
    runWith({ stdinText: L('<summary>t</summary>', '\t- [ ] a') }).exitCode, // OPEN -> 0
    runWith({ stdinText: L('<summary>t</summary>', '\t- [x] a') }).exitCode, // TICKED -> 1
    run({ argv: [], readStdin: () => { throw new Error('boom'); }, write: () => {}, writeErr: () => {} }), // crash -> 3
  ];
  for (const code of cases) assert.ok([0, 1, 3].includes(code), `unexpected exit code ${code}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Round 1 — Opus review fix list (docs/specs review, reader-review-report.md)
// ─────────────────────────────────────────────────────────────────────────────

test('BLOCKER 1: an owner comment with extra spaces after the checkbox marker is a comment, not a false TICKED', () => {
  const md = L(
    '<summary>A decision</summary>',
    '\t- [x]  \\*\\* i am a comment, not an answer',
    '\t- [ ] the only real option',
  );
  const doc = parseDocument(md);
  const d = doc.decisions[0];
  assert.equal(d.status, 'COMMENTED', 'must not be read as a false TICKED');
  assert.equal(d.options.length, 1);
  assert.equal(d.comments[0].text, 'i am a comment, not an answer');
});

test('BLOCKER 1: an owner comment as a plain bullet with extra spacing is not silently dropped', () => {
  const md = L(
    '<summary>t</summary>',
    '\t-  \\*\\* bullet comment with two spaces',
    '\t- [ ] a',
  );
  const doc = parseDocument(md);
  assert.deepEqual(doc.decisions[0].comments.map((c) => c.text), ['bullet comment with two spaces']);
});

test('an owner comment as a plain paragraph line, with no list or checkbox marker at all', () => {
  const md = L('<summary>t</summary>', '\t\\*\\* a plain paragraph comment', '\t- [ ] a');
  const doc = parseDocument(md);
  assert.deepEqual(doc.decisions[0].comments.map((c) => c.text), ['a plain paragraph comment']);
});

test('BLOCKER 2: invoked through a real symlink, the CLI still parses and exits correctly', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decisions-read-sym-'));
  const link = path.join(dir, 'sym-entry.mjs');
  try {
    fs.symlinkSync(SCRIPT_PATH, link, 'file');
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    // A Windows box without the symlink privilege (no Developer Mode, not elevated) throws
    // EPERM/EACCES here. That is an environment fact, not a code failure — a suite that goes
    // red for a reason unrelated to the code is how a suite rots. Skip with the reason instead.
    if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
      t.skip(`symlinks not permitted on this machine (${err.code})`);
      return;
    }
    throw err;
  }
  try {
    const result = spawnSync(process.execPath, [link], {
      input: L('<summary>t</summary>', '\t- [x] a'),
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, 'must still run and report TICKED (exit 1), not silently exit 0');
    assert.match(result.stdout, /^TICKED\tt\ta/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('MAJOR 3: a toggleable heading with extra attributes is still recognised as a title', () => {
  const md = L(
    '<summary>Open decision</summary>',
    '\t- [ ] a',
    '# Closed {toggle="true" id="abc"}',
    '\t- [x] an old answered item',
    '\t- [x] another old answered item',
  );
  const doc = parseDocument(md);
  const byTitle = Object.fromEntries(doc.decisions.map((d) => [d.title, d]));
  assert.equal(byTitle['Open decision'].status, 'OPEN', 'the two closed ticks must not land on the decision above');
  assert.ok(byTitle.Closed, 'the heading with an extra attribute is still recognised as a title');
  assert.equal(byTitle.Closed.status, 'AMBIGUOUS');
});

test('MAJOR 4: a <summary> split across lines fails closed instead of misattaching the next decision', () => {
  const md = L(
    '<details>',
    '<summary>Decision A</summary>',
    '\t- [ ] a-option',
    '</details>',
    '<details>',
    '<summary>Decision B',
    '</summary>',
    '\t- [x] b-option',
    '</details>',
  );
  assert.throws(() => parseDocument(md), /summary/i);
});

test('unescaped ** on a CHECKBOX line stays an ordinary option, not a comment', () => {
  const md = L('<summary>t</summary>', '\t- [x] **bold option**', '\t- [ ] plain option');
  const doc = parseDocument(md);
  const d = doc.decisions[0];
  assert.equal(d.status, 'TICKED');
  assert.equal(d.options.find((o) => o.ticked).text, '**bold option**');
  assert.equal(d.comments.length, 0);
});

test('rule 2 across a closed </details> boundary: a checkbox after it still attaches to the last title', () => {
  const md = L(
    '<details>',
    '<summary>t</summary>',
    '\t- [ ] inside',
    '</details>',
    '- [x] outside but still under t',
  );
  const doc = parseDocument(md);
  assert.equal(doc.decisions[0].title, 't');
  assert.deepEqual(doc.decisions[0].options.map((o) => o.text), ['inside', 'outside but still under t']);
  assert.equal(doc.unattached.length, 0);
});

test('formatText: a TICKED decision with comments shows the ticked text then the comments, joined with " | "', () => {
  const md = L('<summary>t</summary>', '\t- [x] yes', '\t- [ ] \\*\\* still a live question');
  const doc = parseDocument(md);
  const line = formatText(doc).split('\n')[0];
  assert.equal(line, 'TICKED\tt\tyes | still a live question');
});

test('a fence at column 0 (no indentation) is recognised, same as a tab-indented one', () => {
  const md = L(
    '<summary>t</summary>',
    '```',
    '- [x] fake, inside a column-0 fence',
    '```',
    '\t- [x] real option',
  );
  const doc = parseDocument(md);
  assert.deepEqual(doc.decisions[0].options.map((o) => o.text), ['real option']);
});

test('weak-assertion fix: an INDENTED Done checkbox as the true last line is not the page-level Done', () => {
  const md = L('<summary>t</summary>', '\t- [x] a', '\t- [x] Done');
  const doc = parseDocument(md);
  assert.equal(doc.done, null, 'indented — not column 0 — so it does not count as the page-level line');
  assert.deepEqual(doc.decisions[0].options.map((o) => o.text), ['a', 'Done']);
});

test('weak-assertion fix: a parenthetical without a leading digit is left in the title', () => {
  const doc = parseDocument(L('<summary>Goals ruling (Sep 20)</summary>', '\t- [ ] a'));
  assert.equal(doc.decisions[0].title, 'Goals ruling (Sep 20)');
});

test('MINOR 6: a leading UTF-8 BOM does not hide a first-line title', () => {
  const md = `﻿${L('<summary>First line title</summary>', '\t- [x] a')}`;
  const doc = parseDocument(md);
  assert.equal(doc.decisions[0].title, 'First line title');
});

test('MINOR 8: formatText and JSON report an explicit decision count', () => {
  const zero = parseDocument(L('<summary>t</summary>', '\t- plain bullet, no checkbox'));
  assert.equal(zero.decisions.length, 0);
  assert.match(formatText(zero), /^DECISIONS\t0\nDONE\t/);
  assert.equal(toJsonObject(zero).decisionCount, 0);

  const two = parseDocument(L('<summary>a</summary>', '\t- [x] x', '<summary>b</summary>', '\t- [ ] y'));
  assert.match(formatText(two), /DECISIONS\t2\nDONE\t/);
  assert.equal(toJsonObject(two).decisionCount, 2);
});

test('spawnSync: the real file, invoked as a process, honors the exit-code contract end to end', () => {
  const ticked = spawnSync(process.execPath, [SCRIPT_PATH], {
    input: L('<summary>t</summary>', '\t- [x] a'),
    encoding: 'utf8',
  });
  assert.equal(ticked.status, 1);
  assert.match(ticked.stdout, /^TICKED\tt\ta/);

  const blind = spawnSync(process.execPath, [SCRIPT_PATH], { input: '', encoding: 'utf8' });
  assert.equal(blind.status, 3);
  assert.match(blind.stderr, /decisions-read:/);
});
