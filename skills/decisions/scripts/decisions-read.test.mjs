// node --test "skills/decisions/scripts/*.test.mjs"
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

// R3 (v2 addendum) CHANGES this rule: v1 said "a Done checkbox that is not the
// page-level line is an ordinary option", with no column restriction actually enforced
// by the code beyond "must be the true last line to count as Done at all" — so a
// column-0 Done checkbox anywhere else in the doc was, in v1, silently folded in as a
// normal option of whatever title preceded it. R3 says instead: ANY column-0 Done
// checkbox is NEVER an option, wherever it sits, and an out-of-place one WARNs.
test('R3: a column-0 Done checkbox that is not the last line is excluded from options and WARNs, never an ordinary option', () => {
  const md = L(
    '<summary>t</summary>',
    '\t- [x] other',
    '- [ ] Done',
    'trailing paragraph, so the last line is not a checkbox at all',
  );
  const doc = parseDocument(md);
  assert.equal(doc.done, false, 'read from the only column-0 Done line even though it is not last');
  assert.deepEqual(doc.decisions[0].options.map((o) => o.text), ['other'], 'Done must never be an option (R3)');
  assert.ok(doc.warnings.some((w) => w.text === 'Done is not the last line'));
});

// Round 2 review P1 (BLOCKER): amended — an INDENTED Done checkbox is now ALSO the
// page-level Done (never an option) at any indentation, and ALSO WARNs, since it is
// out of place. This REPLACES the just-added "remains an ordinary option" guarantee.
test('P1: an INDENTED Done checkbox is still the page-level Done, never an option, and WARNs "Done line is indented"', () => {
  const md = L(
    '<summary>t</summary>',
    '\t- [ ] Done',
    '\t- [x] other',
    'trailing paragraph, so the last line is not a checkbox at all',
  );
  const doc = parseDocument(md);
  assert.equal(doc.done, false, 'read even though it is indented and not the last line');
  assert.deepEqual(doc.decisions[0].options.map((o) => o.text), ['other'], 'Done is never an option, indented or not');
  assert.equal(doc.decisions[0].status, 'TICKED', '"other" is the only real, ticked option left');
  assert.ok(doc.warnings.some((w) => w.text === 'Done line is indented' && w.line === 2));
  assert.ok(doc.warnings.some((w) => w.text === 'Done is not the last line'));
});

test('P1: a space-indented Done checkbox at the true end of the document is Done (WARN indented, not "not the last line")', () => {
  const md = L('<summary>t</summary>', '\t- [x] a', '\tNo default: not needed here', '  - [x] Done');
  const doc = parseDocument(md);
  assert.equal(doc.done, true);
  assert.deepEqual(doc.warnings, [{ text: 'Done line is indented', line: 4 }]);
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
    '\tNo default: not needed here',
    '<summary>B (3 covered)</summary>',
    '\t- [ ] no',
    '\tNo default: not needed here',
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
    '\tNo default: not needed here',
    '- [x] Done',
  );
  const doc = parseDocument(md);
  const obj = toJsonObject(doc);
  // v2: comments carry `replied` (R1), decisions carry `default` (R4), and the document
  // carries a top-level `warnings` array (R3/R4) — new fields, schema grew, shape below updated.
  assert.deepEqual(obj, {
    decisions: [{
      title: 'A',
      status: 'TICKED',
      line: 1,
      options: [{ text: 'yes', ticked: true, line: 2 }],
      comments: [{ text: 'a comment too', line: 3, replied: false }],
      default: null,
    }],
    unattached: [],
    warnings: [],
    decisionCount: 1,
    done: true,
  });
  assert.deepEqual(JSON.parse(formatJson(doc)), obj);
});

test('computeExitCode: 0 when every decision is OPEN and nothing is unattached, else 1', () => {
  const openOnly = parseDocument(
    L('<summary>t</summary>', '\t- [ ] a', '\t- [ ] b', '\tNo default: not needed here', '- [ ] Done'),
  );
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
  const { exitCode, stdout } = runWith({
    argv: ['some.md'],
    fileText: L('<summary>t</summary>', '\t- [ ] a', '\tNo default: not needed here', '- [ ] Done'),
  });
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
  assert.equal(
    runWith({
      stdinText: L('<summary>t</summary>', '\t- [ ] a', '\tNo default: not needed here', '- [ ] Done'),
    }).exitCode,
    0,
  );
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

// Round-2 P1 (BLOCKER) REPLACES this v1/v2 guarantee: an indented Done checkbox now
// counts as the page-level Done at any indentation (never an option), with its own WARN.
test('P1: an INDENTED Done checkbox as the true last line is still Done, WARNs "Done line is indented" only', () => {
  const md = L('<summary>t</summary>', '\t- [x] a', '\tNo default: not needed here', '\t- [x] Done');
  const doc = parseDocument(md);
  assert.equal(doc.done, true, 'indentation no longer disqualifies it as the page-level line');
  assert.deepEqual(doc.decisions[0].options.map((o) => o.text), ['a'], 'never an option, indented or not');
  assert.deepEqual(doc.warnings, [{ text: 'Done line is indented', line: 4 }], 'it IS the true last line, so no other warning');
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

// ─────────────────────────────────────────────────────────────────────────────
// Round 2 — v2 addendum (build-0920-spec-addendum-decisions.md), R1-R6
// ─────────────────────────────────────────────────────────────────────────────

test('R1: a comment followed by a Reply: line is replied; JSON carries replied per comment', () => {
  const md = L(
    '<summary>t</summary>',
    '\t- [ ] \\*\\* is this cheaper to undo?',
    '\tReply: 2026-09-20, yes, done.',
    '\t- [ ] a',
  );
  const doc = parseDocument(md);
  const d = doc.decisions[0];
  assert.equal(d.comments[0].replied, true);
  assert.deepEqual(toJsonObject(doc).decisions[0].comments[0], {
    text: 'is this cheaper to undo?', line: 2, replied: true,
  });
});

test('R1: a comment with no Reply: line after it stays unreplied', () => {
  const md = L('<summary>t</summary>', '\t- [ ] \\*\\* unanswered?', '\t- [ ] a');
  const doc = parseDocument(md);
  assert.equal(doc.decisions[0].comments[0].replied, false);
});

test('R1: a Reply: only closes the nearest preceding open comment, never a later or earlier one', () => {
  const md = L(
    '<summary>t</summary>',
    '\t- [ ] \\*\\* first question',
    '\t- [ ] \\*\\* second question',
    '\tReply: 2026-09-20, answers the second one only',
    '\t- [ ] a',
  );
  const doc = parseDocument(md);
  const [first, second] = doc.decisions[0].comments;
  assert.equal(first.replied, false, 'the Reply: line came after the second comment opened, not the first');
  assert.equal(second.replied, true);
});

test('R2: all comments replied and no tick -> REPLIED, not COMMENTED, and not actionable', () => {
  const md = L(
    '<summary>t</summary>',
    '\t- [ ] \\*\\* a question',
    '\tReply: 2026-09-20, answered.',
    '\t- [ ] a',
    '\t- [ ] b',
    '\tNo default: not needed here',
    '- [ ] Done',
  );
  const doc = parseDocument(md);
  assert.equal(doc.decisions[0].status, 'REPLIED');
  assert.equal(computeExitCode(doc), 0, 'REPLIED is not actionable');
});

test('R2: a mix of one replied and one unreplied comment is still COMMENTED (priority order)', () => {
  const md = L(
    '<summary>t</summary>',
    '\t- [ ] \\*\\* answered one',
    '\tReply: 2026-09-20, done.',
    '\t- [ ] \\*\\* still open',
    '\t- [ ] a',
  );
  const doc = parseDocument(md);
  assert.equal(doc.decisions[0].status, 'COMMENTED');
  assert.equal(doc.decisions[0].comments.filter((c) => !c.replied).length, 1);
});

test('R2: a WARN alone (no decisions actionable) still makes the document actionable, exit 1', () => {
  const md = L('<summary>t</summary>', '\t- [ ] a', '\tDefault after garbage: nope');
  const doc = parseDocument(md);
  assert.equal(doc.decisions[0].status, 'OPEN');
  assert.ok(doc.warnings.length > 0, 'a malformed default line must WARN');
  assert.equal(computeExitCode(doc), 1, 'a WARN alone makes the document actionable');
});

test('R3: more than one column-0 Done line WARNs, and only the LAST sets done', () => {
  const md = L(
    '<summary>t</summary>',
    '\t- [x] a',
    '- [x] Done',
    '<summary>u</summary>',
    '\t- [ ] b',
    '- [ ] Done',
  );
  const doc = parseDocument(md);
  assert.equal(doc.done, false, 'the LAST Done line wins');
  assert.ok(doc.warnings.some((w) => w.text === 'more than one Done line'));
  assert.equal(doc.decisions.every((d) => d.options.every((o) => o.text !== 'Done')), true, 'never an option');
});

test('R4: a well-formed default is parsed into JSON as { text, at }', () => {
  const md = L(
    '<summary>t</summary>',
    '\t- [ ] a',
    '\tDefault after 2030-01-01 00:00 +00:00: a',
  );
  const doc = parseDocument(md);
  const def = toJsonObject(doc).decisions[0].default;
  assert.equal(def.text, 'a');
  assert.equal(def.at, '2030-01-01T00:00:00.000Z');
});

test('R4: an OPEN decision before its default deadline stays OPEN, not DUE', () => {
  const md = L('<summary>t</summary>', '\t- [ ] a', '\tDefault after 2030-01-01 00:00 +00:00: a', '- [ ] Done');
  const doc = parseDocument(md, { now: new Date('2029-01-01T00:00:00Z') });
  assert.equal(doc.decisions[0].status, 'OPEN');
  assert.equal(computeExitCode(doc), 0);
});

test('R4: an OPEN decision at or after its default deadline is DUE, detail is the default text, and it is actionable', () => {
  const md = L('<summary>t</summary>', '\t- [ ] a', '\tDefault after 2030-01-01 00:00 +00:00: a');
  const doc = parseDocument(md, { now: new Date('2030-01-01T00:00:00Z') });
  assert.equal(doc.decisions[0].status, 'DUE');
  assert.equal(detailForTest(doc), 'a');
  assert.equal(computeExitCode(doc), 1);
});

test('R4: a REPLIED decision past its deadline becomes DUE, not REPLIED', () => {
  const md = L(
    '<summary>t</summary>',
    '\t- [ ] \\*\\* q',
    '\tReply: 2026-09-20, answered.',
    '\t- [ ] a',
    '\tDefault after 2030-01-01 00:00 +00:00: a',
  );
  const doc = parseDocument(md, { now: new Date('2031-01-01T00:00:00Z') });
  assert.equal(doc.decisions[0].status, 'DUE');
});

test('R4: a malformed "Default after " line WARNs by line and is never an option', () => {
  const md = L('<summary>t</summary>', '\t- [ ] a', '\tDefault after next Tuesday: a');
  const doc = parseDocument(md);
  assert.equal(doc.decisions[0].options.length, 1, 'the malformed default line is not an option');
  assert.ok(doc.warnings.some((w) => w.line === 3 && w.text === 'default line is not in the required shape'));
});

test('R4: "No default" is ignored — no default set, no warning', () => {
  const md = L('<summary>t</summary>', '\t- [ ] a', '\tNo default: irreversible', '- [ ] Done');
  const doc = parseDocument(md);
  assert.equal(toJsonObject(doc).decisions[0].default, null);
  assert.equal(doc.warnings.length, 0);
});

test('R5: an owner comment under a heading with no checkboxes is UNATTACHED with "under", never dropped', () => {
  const md = L(
    '# Waiting {toggle="true"}',
    '\t\\*\\* a general remark at the top of the section',
    '<summary>Real decision</summary>',
    '\t- [ ] a',
  );
  const doc = parseDocument(md);
  const stray = doc.unattached.find((u) => u.kind === 'comment');
  assert.ok(stray, 'the comment must not vanish');
  assert.equal(stray.under, 'Waiting');
  assert.equal(doc.decisions.length, 1, 'the grouping heading itself is still not a decision');
});

test('R5: unticked checkboxes under a heading still make it a decision, as in v1 (unchanged)', () => {
  const md = L('# Waiting {toggle="true"}', '\t- [ ] an option', '\t\\*\\* a comment too');
  const doc = parseDocument(md);
  assert.equal(doc.decisions.length, 1);
  assert.equal(doc.decisions[0].comments.length, 1, 'the comment is not stripped out just because the tick is a real option');
  assert.equal(doc.unattached.length, 0);
});

test('R6: warnings print as WARN<TAB>text, ordered after UNATTACHED and before DECISIONS', () => {
  const md = L(
    '# Waiting {toggle="true"}',
    '\t\\*\\* a stray comment',
    '<summary>t</summary>',
    '\t- [x] a',
    '- [x] Done',
    '- [ ] Done',
  );
  const doc = parseDocument(md);
  const lines = formatText(doc).split('\n');
  const unattachedIdx = lines.findIndex((l) => l.startsWith('UNATTACHED'));
  const warnIdx = lines.findIndex((l) => l.startsWith('WARN'));
  const decisionsIdx = lines.findIndex((l) => l.startsWith('DECISIONS'));
  assert.ok(unattachedIdx >= 0 && warnIdx > unattachedIdx && decisionsIdx > warnIdx);
});

test('CLI: --now drives DUE through the process end to end', () => {
  const { exitCode, stdout } = runWith({
    argv: ['--now', '2030-01-01T00:00:00Z'],
    stdinText: L('<summary>t</summary>', '\t- [ ] a', '\tDefault after 2030-01-01 00:00 +00:00: a'),
  });
  assert.equal(exitCode, 1);
  assert.match(stdout, /^DUE\tt\ta/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Round 3 — Opus re-review (review-decisions-r2-report.md), parser findings P1-P9
// ─────────────────────────────────────────────────────────────────────────────

test('P2 (BLOCKER-adjacent MAJOR): a ticked option whose text starts with "Reply:" is never swallowed as a reply marker', () => {
  const md = L('<summary>t</summary>', '\t- [x] Reply: to the vendor and wait (recommended)', '\t- [ ] other');
  const doc = parseDocument(md);
  assert.equal(doc.decisions[0].status, 'TICKED');
  assert.equal(doc.decisions[0].options.find((o) => o.ticked).text, 'Reply: to the vendor and wait (recommended)');
  assert.equal(computeExitCode(doc), 1);
});

test('P2: a ticked option whose text starts with "Default after " is never swallowed as a deadline line', () => {
  const md = L('<summary>t</summary>', '\t- [x] Default after lunch, ship it', '\t- [ ] other');
  const doc = parseDocument(md);
  assert.equal(doc.decisions[0].status, 'TICKED');
  assert.equal(doc.decisions[0].options.find((o) => o.ticked).text, 'Default after lunch, ship it');
});

test('P3 (MAJOR): --now with a missing value is blind, exit 3, and never falls back to the system clock', () => {
  const { exitCode, stderr } = runWith({
    argv: ['--now'],
    stdinText: L('<summary>t</summary>', '\t- [ ] a', '\tDefault after 2020-01-01 00:00 +00:00: a'),
  });
  assert.equal(exitCode, 3);
  assert.match(stderr, /--now/);
});

test('P3: --now with an unparseable value is blind, exit 3, and names the bad value on stderr', () => {
  const { exitCode, stderr } = runWith({
    argv: ['--now', 'not-a-timestamp'],
    stdinText: L('<summary>t</summary>', '\t- [ ] a'),
  });
  assert.equal(exitCode, 3);
  assert.match(stderr, /not-a-timestamp/);
});

test('P4 (MAJOR): an impossible calendar date (Feb 30) never rolls over — malformed, WARN, no DUE', () => {
  const md = L('<summary>t</summary>', '\t- [ ] a', '\tDefault after 2026-02-30 18:00 -04:00: a');
  const doc = parseDocument(md, { now: new Date('2030-01-01T00:00:00Z') });
  assert.equal(doc.decisions[0].status, 'OPEN', 'must not silently roll to March 2 and go DUE');
  assert.equal(toJsonObject(doc).decisions[0].default, null);
  assert.ok(doc.warnings.some((w) => w.text === 'default line is not in the required shape'));
});

test('P4: 24:00 never rolls over to the next day — malformed, WARN', () => {
  const md = L('<summary>t</summary>', '\t- [ ] a', '\tDefault after 2026-09-20 24:00 -04:00: a');
  const doc = parseDocument(md, { now: new Date('2030-01-01T00:00:00Z') });
  assert.equal(doc.decisions[0].status, 'OPEN');
  assert.ok(doc.warnings.some((w) => w.text === 'default line is not in the required shape'));
});

test('P5 (MAJOR): an older "Default if unanswered by ..." line (not "Default after ") WARNs, never silently ignored', () => {
  const md = L('<summary>t</summary>', '\t- [ ] a', '\tDefault if unanswered by Friday, 5pm: option a');
  const doc = parseDocument(md);
  assert.equal(doc.decisions[0].status, 'OPEN');
  assert.equal(doc.decisions[0].options.length, 1, 'not swallowed as an option either');
  assert.ok(doc.warnings.some((w) => w.text === 'default line is not in the required shape'));
  assert.equal(computeExitCode(doc), 1);
});

test('P5: "No default" still is not touched by the broadened Default-prefix WARN', () => {
  const md = L('<summary>t</summary>', '\t- [ ] a', '\tNo default: irreversible, waits for your word', '- [ ] Done');
  const doc = parseDocument(md);
  assert.equal(doc.warnings.length, 0);
  assert.equal(toJsonObject(doc).decisions[0].default, null);
});

test('N2 (MAJOR): ordinary prose starting with "Default" but with no colon raises no WARN', () => {
  const md = L(
    '<summary>t</summary>',
    '\t- [ ] a',
    '\tDefault behaviour today is to run uncapped, which is what broke it.',
    '\tNo default: not needed here',
    '- [ ] Done',
  );
  const doc = parseDocument(md);
  assert.equal(doc.warnings.length, 0);
  assert.equal(doc.decisions[0].status, 'OPEN');
  assert.equal(computeExitCode(doc), 0);
});

test('N5 (MAJOR): a decision with a well-formed "Default after " line raises no N5 WARN', () => {
  const md = L(
    '<summary>Has a default</summary>',
    '\t- [ ] a',
    '\tDefault after 2030-01-01 00:00 +00:00: a',
    '- [ ] Done',
  );
  const doc = parseDocument(md);
  assert.ok(!doc.warnings.some((w) => w.text.startsWith('no default or "No default" line')));
});

test('N5 (MAJOR): a decision with a "No default: ..." line raises no N5 WARN', () => {
  const md = L(
    '<summary>Explicitly no default</summary>',
    '\t- [ ] a',
    '\tNo default: irreversible, waits for your word',
    '- [ ] Done',
  );
  const doc = parseDocument(md);
  assert.ok(!doc.warnings.some((w) => w.text.startsWith('no default or "No default" line')));
});

test('N5 (MAJOR): a decision with neither a default nor a "No default" line WARNs, naming the title', () => {
  const md = L('<summary>Neither one</summary>', '\t- [ ] a', '- [ ] Done');
  const doc = parseDocument(md);
  assert.ok(doc.warnings.some((w) => w.text === 'no default or "No default" line: Neither one'));
  assert.equal(doc.decisions[0].status, 'OPEN', 'N5 never changes the decision status');
});

test('N5 (MAJOR): a prose deadline not in the "Default"/"No default" shapes still WARNs (the class N5 closes)', () => {
  const md = L(
    '<summary>Prose deadline</summary>',
    '\t- [ ] a',
    '\tDeadline: 2026-09-25, cap at 200',
    '- [ ] Done',
  );
  const doc = parseDocument(md);
  assert.ok(doc.warnings.some((w) => w.text === 'no default or "No default" line: Prose deadline'));
  assert.equal(doc.decisions[0].options.length, 1, 'the prose deadline line is not swallowed as an option');
  assert.equal(doc.decisions[0].status, 'OPEN');
});

test('N5: a Closed/archived section of plain bullets (no options) never triggers the N5 WARN', () => {
  const md = L(
    '# Closed {toggle="true"}',
    '\t- an archived bullet, no checkbox, not a decision',
    '<summary>Real decision</summary>',
    '\t- [ ] a',
    '\tNo default: not needed here',
    '- [ ] Done',
  );
  const doc = parseDocument(md);
  assert.ok(!doc.warnings.some((w) => w.text.includes('Closed')));
});

test('P6 (MINOR): a bare "Reply:" line with no date does not close the owner\'s comment', () => {
  const md = L('<summary>t</summary>', '\t- [ ] \\*\\* still open?', '\tReply: fixed now, no date given', '\t- [ ] a');
  const doc = parseDocument(md);
  assert.equal(doc.decisions[0].comments[0].replied, false, 'the shapeless Reply: line does not count');
  assert.equal(doc.decisions[0].status, 'COMMENTED');
});

test('P6: a properly dated "Reply: YYYY-MM-DD ..." line still closes the comment', () => {
  const md = L('<summary>t</summary>', '\t- [ ] \\*\\* still open?', '\tReply: 2026-09-20, fixed now.', '\t- [ ] a');
  const doc = parseDocument(md);
  assert.equal(doc.decisions[0].comments[0].replied, true);
});

test('P7 (MINOR): the default text output shows "under" for a reported stray, not just JSON', () => {
  const md = L(
    '# Waiting {toggle="true"}',
    '\t\\*\\* a general remark at the top of the section',
    '<summary>Real decision</summary>',
    '\t- [ ] a',
  );
  const doc = parseDocument(md);
  const line = formatText(doc).split('\n').find((l) => l.startsWith('UNATTACHED'));
  assert.match(line, /\(under Waiting\)/);
});

test('P8 (MINOR): a page with a real decision but no Done line at all WARNs', () => {
  const md = L('<summary>t</summary>', '\t- [ ] a');
  const doc = parseDocument(md);
  assert.equal(doc.done, null);
  assert.ok(doc.warnings.some((w) => w.text === 'no Done line found'));
  assert.equal(computeExitCode(doc), 1);
});

test('P8: a page with only grouping titles and no real decisions does not need a Done line', () => {
  const md = L('# Closed {toggle="true"}', '\t- a plain bullet, no checkbox, not a decision');
  const doc = parseDocument(md);
  assert.equal(doc.done, null);
  assert.equal(doc.warnings.length, 0, 'nothing to be "done" on a page with no open decisions');
});

function detailForTest(doc) {
  return formatText(doc).split('\n')[0].split('\t')[2];
}
