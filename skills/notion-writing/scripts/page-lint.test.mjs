// node scripts/run-tests.mjs skills/notion-writing/scripts/page-lint.test.mjs
// Every page-lint rule: red on a planted violation, green on its fix, and green on a false-positive
// probe. Then the four pinned fixtures (masked skeletons of the pages Ben used, plus today's render)
// with their exact rule-id sets, and the CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { childEnv } from '../../multi/scripts/test-child-env.mjs';
import {
  lintPage, formatViolations, main, KINDS, RULES, FRAGMENT_OFF, isByline,
} from './page-lint.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, 'page-lint.mjs');
const FIX = path.join(HERE, 'fixtures');

const doc = (...lines) => `${lines.join('\n')}\n`;
const ids = (text, opts) => [...new Set(lintPage(text, opts).map((v) => v.rule))].sort();
const T = '\t';

const GOAL = ['<callout icon="🎯">', `${T}Ben wants pages he can read fast.`, '</callout>'];

// ---------------------------------------------------------------------------
// goal-callout
// ---------------------------------------------------------------------------

test('goal-callout: red when the first block is not a goal callout, green when it is', () => {
  for (const kind of ['spec', 'brief', 'status', 'handoff']) {
    assert.deepEqual(ids(doc('# Plan', 'Text.'), { kind }), ['goal-callout'], kind);
    assert.deepEqual(ids(doc(...GOAL, '# Plan', 'Text.'), { kind }), [], kind);
  }
});

test('goal-callout: 15 lines pass, 16 fail; a callout that is not first fails', () => {
  const body = (n) => Array.from({ length: n }, (_, i) => `${T}goal line ${i + 1}`);
  assert.deepEqual(ids(doc('<callout icon="🎯">', ...body(15), '</callout>'), { kind: 'spec' }), []);
  assert.deepEqual(ids(doc('<callout icon="🎯">', ...body(16), '</callout>'), { kind: 'spec' }), ['goal-callout']);
  assert.deepEqual(ids(doc('# Plan', ...GOAL), { kind: 'spec' }), ['goal-callout']);
  assert.deepEqual(ids(doc('<callout icon="🎬">', `${T}other`, '</callout>'), { kind: 'spec' }), ['goal-callout']);
});

test('goal-callout: not asked of decisions, read or plain pages, and off for a fragment', () => {
  for (const kind of ['decisions', 'read', 'plain']) assert.ok(!ids(doc('# Plan', 'Text.'), { kind }).includes('goal-callout'), kind);
  assert.deepEqual(ids(doc('# Plan', 'Text.'), { kind: 'spec', fragment: true }), []);
});

// ---------------------------------------------------------------------------
// read-status and prior-rounds
// ---------------------------------------------------------------------------

const roundToggle = (n, extra = '') => [
  '<details>', `<summary>**Round ${n}${extra}**</summary>`, `${T}- sample`, `${T}<empty-block/>`, '</details>',
];

test('read-status: two rounds need a two-sentence status callout and exactly one Read now line', () => {
  const good = doc(
    '<callout icon="📌">', `${T}Round 2 is out. Read round 2 only.`, '</callout>',
    'Read now: Round 2 samples',
    ...roundToggle(2),
    '<details>', '<summary>**Prior rounds**</summary>', ...roundToggle(1).map((l) => T + l), `${T}<empty-block/>`, '</details>',
  );
  assert.deepEqual(ids(good, { kind: 'read' }), []);
  const noCallout = good.replace('<callout icon="📌">', 'Intro.').replace('</callout>\n', '\n').replace(/\tRound 2 is out.*\n/, '');
  assert.deepEqual(ids(noCallout, { kind: 'read' }), ['read-status']);
  const three = good.replace('Round 2 is out. Read round 2 only.', 'One. Two. Three.');
  assert.deepEqual(ids(three, { kind: 'read' }), ['read-status']);
  const noPointer = good.replace('Read now: Round 2 samples\n', '');
  assert.deepEqual(ids(noPointer, { kind: 'read' }), ['read-status']);
  const twoPointers = good.replace('Read now: Round 2 samples\n', 'Read now: Round 2 samples\nRead now: again\n');
  assert.deepEqual(ids(twoPointers, { kind: 'read' }), ['read-status']);
});

test('read-status: probe, a page with one round and no callout is not asked for a status callout', () => {
  assert.deepEqual(ids(doc('> quote', ...roundToggle(1), '<details>', '<summary>**Plain name**</summary>', `${T}x`, `${T}<empty-block/>`, '</details>'), { kind: 'read' }), []);
});

test('prior-rounds: sibling round toggles are red, one Prior rounds toggle is green', () => {
  const sibling = doc(...roundToggle(1), ...roundToggle(2));
  assert.deepEqual(ids(sibling, { kind: 'plain' }), ['prior-rounds']);
  const nested = doc('# Samples {toggle="true"}', ...roundToggle(1).map((l) => T + l), ...roundToggle(2).map((l) => T + l), `${T}<empty-block/>`);
  assert.deepEqual(ids(nested, { kind: 'plain' }), ['prior-rounds'], 'any depth');
  const fixed = doc(...roundToggle(3), '<details>', '<summary>**Prior rounds**</summary>', ...roundToggle(1).map((l) => T + l), ...roundToggle(2).map((l) => T + l), `${T}<empty-block/>`, '</details>');
  assert.deepEqual(ids(fixed, { kind: 'plain' }), []);
});

test('prior-rounds: probes, comps-v2 and version summaries, two toggles for one round, a fragment', () => {
  const probes = doc(
    '<details>', '<summary>**comps-v2 cohort**</summary>', `${T}x`, `${T}<empty-block/>`, '</details>',
    '<details>', '<summary>**wf-08 v08.234 notes**</summary>', `${T}x`, `${T}<empty-block/>`, '</details>',
  );
  assert.deepEqual(ids(probes, { kind: 'plain' }), []);
  assert.deepEqual(ids(doc(...roundToggle(13, ' samples'), ...roundToggle(13, ' scores')), { kind: 'plain' }), []);
  assert.deepEqual(ids(doc(...roundToggle(1), ...roundToggle(2)), { kind: 'plain', fragment: true }), []);
  assert.deepEqual(ids(doc(...roundToggle(1), ...roundToggle(2)), { kind: 'spec' }).filter((r) => r === 'prior-rounds'), [], 'not asked of spec pages');
});

// ---------------------------------------------------------------------------
// heading-prefix and heading-children
// ---------------------------------------------------------------------------

test('heading-prefix: numbered, lettered, roman, P-coded and Step headings and summaries are red', () => {
  for (const bad of ['## 1. Decisions', '# 2) Plan', '# A. Plan', '# IV. Plan', '# P1 Plan', '# Step 2 setup', '### Phase 3 rollout']) {
    assert.deepEqual(ids(doc(bad), { kind: 'plain' }), ['heading-prefix'], bad);
  }
  assert.deepEqual(ids(doc('<details>', '<summary>**2. Round notes**</summary>', `${T}x`, `${T}<empty-block/>`, '</details>'), { kind: 'plain' }), ['heading-prefix']);
  assert.deepEqual(ids(doc('<details>', '<summary>P1 notes</summary>', `${T}x`, `${T}<empty-block/>`, '</details>'), { kind: 'plain' }), ['heading-prefix']);
});

test('heading-prefix: green on stand-alone headings; probes for words that only look like prefixes', () => {
  for (const ok of ['## Decisions', '# Release 0.20.17', '# 2026 plan', '# Part of the plan', '# A plan', '# Phase change', '# Pass or fail']) {
    assert.deepEqual(ids(doc(ok), { kind: 'plain' }), [], ok);
  }
});

test('heading-children: a plain heading with indented children is red, a toggle heading is green', () => {
  assert.deepEqual(ids(doc('# Head', `${T}child`), { kind: 'plain' }), ['heading-children']);
  assert.deepEqual(ids(doc('# Head {toggle="true"}', `${T}child`, `${T}<empty-block/>`), { kind: 'plain' }), []);
  assert.deepEqual(ids(doc('# Head', 'sibling'), { kind: 'plain' }), [], 'probe: a sibling is not a child');
  assert.deepEqual(ids(doc('<details>', '<summary>x</summary>', `${T}# Head`, `${T}text`, `${T}<empty-block/>`, '</details>'), { kind: 'plain' }), []);
});

// ---------------------------------------------------------------------------
// toggle-tail
// ---------------------------------------------------------------------------

test('toggle-tail: a <details> or toggle heading that does not end in an empty block is red', () => {
  const d = (tail) => doc('<details>', '<summary>x</summary>', `${T}- item`, ...(tail ? [`${T}<empty-block/>`] : []), '</details>');
  assert.deepEqual(ids(d(false), { kind: 'plain' }), ['toggle-tail']);
  assert.deepEqual(ids(d(true), { kind: 'plain' }), []);
  assert.deepEqual(ids(doc('# H {toggle="true"}', `${T}- item`), { kind: 'plain' }), ['toggle-tail']);
  assert.deepEqual(ids(doc('# H {toggle="true"}', `${T}- item`, `${T}<empty-block/>`), { kind: 'plain' }), []);
  assert.deepEqual(ids(doc('<details>', '<summary>x</summary>', `${T}- item`), { kind: 'plain' }), ['toggle-tail'], 'never closes');
});

test('toggle-tail: probes, a blank line before the empty block, and verbatim Original text', () => {
  assert.deepEqual(ids(doc('<details>', '<summary>x</summary>', `${T}- item`, `${T}<empty-block/>`, '', '</details>'), { kind: 'plain' }), []);
  const orig = doc('<details>', '<summary>**Original text**</summary>', `${T}<details>`, `${T}<summary>y</summary>`, `${T}${T}z`, `${T}</details>`, `${T}<empty-block/>`, '</details>');
  assert.deepEqual(ids(orig, { kind: 'plain' }), []);
});

// ---------------------------------------------------------------------------
// before-after
// ---------------------------------------------------------------------------

test('before-after: an uncolored pair is red, a colored pair is green', () => {
  assert.deepEqual(ids(doc('Before: the old line', 'After: the new line'), { kind: 'plain' }), ['before-after']);
  assert.deepEqual(ids(doc('BEFORE and AFTER on one line'), { kind: 'plain' }), ['before-after']);
  const colored = doc('<span color="red">**BEFORE**</span> the old line', '<span color="green">**AFTER**</span> the new line');
  assert.deepEqual(ids(colored, { kind: 'plain' }), []);
  assert.deepEqual(ids(doc('<span color="red">**BEFORE**</span> old', 'After: new, uncolored'), { kind: 'plain' }), ['before-after']);
});

test('before-after: probes, a lone label is not a pair, and far-apart labels are not a pair', () => {
  assert.deepEqual(ids(doc('After: the dead-run fix landed.'), { kind: 'plain' }), []);
  assert.deepEqual(ids(doc('Before: only this'), { kind: 'plain' }), []);
  assert.deepEqual(ids(doc('Before: a', 'x', 'y', 'z', 'w', 'After: b'), { kind: 'plain' }), []);
});

// ---------------------------------------------------------------------------
// options-checkbox
// ---------------------------------------------------------------------------

test('options-checkbox: option labels in prose are red, checkbox lines are green', () => {
  assert.deepEqual(ids(doc('(A) publish now', '(B) hold'), { kind: 'decisions' }).filter((r) => r === 'options-checkbox'), ['options-checkbox']);
  assert.deepEqual(ids(doc('- (a) publish now'), { kind: 'plain' }), ['options-checkbox']);
  assert.deepEqual(ids(doc('- [ ] (A) recommended. Publish now.', '- [x] (b) hold'), { kind: 'decisions' }).filter((r) => r === 'options-checkbox'), []);
});

test('options-checkbox: probes, a mid-line (b), a quoted option, Original text, and other kinds', () => {
  assert.deepEqual(ids(doc('- Your choice (b) is live: the collector runs.'), { kind: 'decisions' }).filter((r) => r === 'options-checkbox'), []);
  assert.deepEqual(ids(doc('"(a) Give the three rows" he wrote'), { kind: 'decisions' }).filter((r) => r === 'options-checkbox'), []);
  const orig = doc('<details>', '<summary>**Original text**</summary>', `${T}- (a) verbatim option`, `${T}<empty-block/>`, '</details>');
  assert.deepEqual(ids(orig, { kind: 'decisions' }).filter((r) => r === 'options-checkbox'), []);
  assert.ok(!ids(doc('(A) x'), { kind: 'spec' }).includes('options-checkbox'), 'not asked of spec pages');
});

// ---------------------------------------------------------------------------
// decisions rules
// ---------------------------------------------------------------------------

const optionLines = [`${T}- [ ] (A) recommended. Publish now.`, `${T}- [ ] (B) Hold it.`];
const waitingItem = (over = {}) => [
  '- [ ] **Publish it now?**',
  ...(over.omitWhy ? [] : [`${T}**Why this is yours:** it is your site.`]),
  `${T}**What waits on it:** nothing else.`,
  `${T}**Options, tick one:**`,
  ...(over.options ?? optionLines),
  `${T}**My recommendation:** A, because it is safe.`,
  `${T}**Given:** Sep 28, 06:57 NYC.`,
  ...(over.details ?? [`${T}<details>`, `${T}<summary>**Background**</summary>`, `${T}${T}- a fact`, `${T}${T}<empty-block/>`, `${T}</details>`]),
  `${T}**Answer here:**`,
  `${T}<empty-block/>`,
];
const decidedItem = (over = {}) => [
  `${T}- [x] **Publish six?**${over.noAnswer ? '' : ' Your answer: "a" (Sep 28). Then: done.'}`,
  ...(over.noOriginal ? [] : [
    `${T}${T}<details>`, `${T}${T}<summary>**Original text**</summary>`, `${T}${T}${T}- [ ] **Publish six?**`, `${T}${T}${T}<empty-block/>`, `${T}${T}</details>`,
  ]),
];
const decisionsPage = (waiting = waitingItem(), decided = decidedItem()) => doc(
  '# Waiting on you', ...waiting,
  '# Decided {toggle="true"}', ...decided, `${T}<empty-block/>`,
  '- [ ] Done', '<empty-block/>',
);

test('decisions page: the packet block, complete, is clean under every decisions rule', () => {
  assert.deepEqual(lintPage(decisionsPage(), { kind: 'decisions' }), []);
});

test('decision-block: each missing piece of a waiting item is red', () => {
  assert.deepEqual(ids(decisionsPage(waitingItem({ omitWhy: true })), { kind: 'decisions' }), ['decision-block']);
  assert.deepEqual(ids(decisionsPage(waitingItem({ options: [`${T}- [ ] (A) only one`] })), { kind: 'decisions' }), ['decision-block']);
  assert.deepEqual(ids(decisionsPage(waitingItem({ options: [`${T}(A) prose one`, `${T}(B) prose two`] })), { kind: 'decisions' }).includes('decision-block'), true);
  const twoDetails = [...waitingItem().slice(0, 8), `${T}<details>`, `${T}<summary>**Reasoning**</summary>`, `${T}${T}x`, `${T}${T}<empty-block/>`, `${T}</details>`, ...waitingItem().slice(8)];
  assert.deepEqual(ids(decisionsPage(twoDetails), { kind: 'decisions' }), ['decision-block']);
  assert.deepEqual(ids(decisionsPage(waitingItem({ details: [`${T}<details>`, `${T}<summary>**Notes**</summary>`, `${T}${T}x`, `${T}${T}<empty-block/>`, `${T}</details>`] })), { kind: 'decisions' }), ['decision-block']);
  const swapped = waitingItem();
  [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
  assert.deepEqual(ids(decisionsPage(swapped), { kind: 'decisions' }), ['decision-block'], 'labels out of order');
});

test('decision-block: a decided item needs his answer and the original text toggle', () => {
  assert.deepEqual(ids(decisionsPage(waitingItem(), decidedItem({ noAnswer: true })), { kind: 'decisions' }), ['decision-block']);
  assert.deepEqual(ids(decisionsPage(waitingItem(), decidedItem({ noOriginal: true })), { kind: 'decisions' }), ['decision-block']);
});

test('decision-block: a question that does not end with ? is red; probes for other kinds and skip', () => {
  const noQ = waitingItem();
  noQ[0] = '- [ ] **Publish it now**';
  assert.deepEqual(ids(decisionsPage(noQ), { kind: 'decisions' }), ['decision-block']);
  assert.deepEqual(ids(decisionsPage(waitingItem({ omitWhy: true })), { kind: 'plain' }), [], 'not asked of plain pages');
  assert.deepEqual(ids(decisionsPage(waitingItem({ omitWhy: true })), { kind: 'decisions', skip: ['decision-block'] }), []);
  assert.deepEqual(ids(decisionsPage(waitingItem({ omitWhy: true })), { kind: 'decisions', fragment: true }), []);
});

test('open-question-visible: a question inside a <details> is red, a visible one is green', () => {
  const hidden = doc(
    '# Waiting on you', '<details>', '<summary>**More**</summary>', ...waitingItem().map((l) => T + l), `${T}<empty-block/>`, '</details>',
    '- [ ] Done',
  );
  assert.ok(ids(hidden, { kind: 'decisions' }).includes('open-question-visible'));
  assert.ok(!ids(decisionsPage(), { kind: 'decisions' }).includes('open-question-visible'));
});

test('open-question-visible: probe, options inside a Background toggle are not questions', () => {
  const item = waitingItem({ details: [`${T}<details>`, `${T}<summary>**Background**</summary>`, `${T}${T}- [ ] a checklist fact`, `${T}${T}<empty-block/>`, `${T}</details>`] });
  assert.ok(!ids(decisionsPage(item), { kind: 'decisions' }).includes('open-question-visible'));
});

test('done-last: red when Done is missing or not last, green with trailing empty blocks', () => {
  assert.deepEqual(ids(doc('# Waiting on you', '- [ ] Done', 'Later text.'), { kind: 'decisions' }), ['done-last']);
  assert.deepEqual(ids(doc('# Waiting on you', 'Text.'), { kind: 'decisions' }), ['done-last']);
  assert.deepEqual(ids(doc('Text.', '- [ ] Done', '<empty-block/>', ''), { kind: 'decisions' }), []);
  assert.deepEqual(ids(doc('Text.', '- [x] Done (last cleared Sep 28)'), { kind: 'decisions' }), []);
  assert.deepEqual(ids(doc('Text.'), { kind: 'decisions', fragment: true }), []);
  assert.deepEqual(ids(doc('Text.'), { kind: 'spec' }), ['goal-callout']);
});

// ---------------------------------------------------------------------------
// no-byline
// ---------------------------------------------------------------------------

test('no-byline: the misses the first draft had all fire', () => {
  for (const s of [
    '- Written by Claude Code', '_Written by Claude_', '— Claude', '**By:** Claude', 'Generated by Codex',
    'Drafted with Codex', '<callout icon="🤖">Written with ChatGPT</callout>', 'By Claude', '🤖 Generated with tooling',
    'Co-Authored-By: someone <a@b.c>', 'Created by Claude Code on Sep 28', 'Authored using OpenAI',
  ]) {
    assert.ok(isByline(s), s);
    assert.deepEqual(ids(doc(s), { kind: 'plain' }), ['no-byline'], s);
  }
});

test('no-byline: the false positives the first draft had all pass', () => {
  for (const s of [
    'By default, Claude sessions hold a peer note behind a dialog.',
    'Author of the lane: skills-o, a Claude Code session.',
    'By Sep 30 the AI tier drops to Sonnet.',
    'Generated by the AI judge at taxonomy 44, then graded.',
    'Written by Ben Zhuk',
    'Created by the Claude lead at 06:58 after the review.',
  ]) {
    assert.ok(!isByline(s), s);
    assert.deepEqual(ids(doc(s), { kind: 'plain' }), [], s);
  }
});

test('no-byline: reads every line, fences and Original text included; the title is linted too', () => {
  assert.deepEqual(ids(doc('```', '- Written by Claude Code', '```'), { kind: 'plain' }), ['no-byline']);
  assert.deepEqual(ids(doc('<details>', '<summary>**Original text**</summary>', `${T}Written by Claude`, `${T}<empty-block/>`, '</details>'), { kind: 'plain' }), ['no-byline']);
  assert.deepEqual(lintPage('Fine.\n', { kind: 'plain', title: 'Report by Claude' }).map((v) => v.rule), ['no-byline']);
  assert.deepEqual(lintPage('Fine.\n', { kind: 'plain', title: '2. Report' }).map((v) => v.rule), ['heading-prefix']);
  assert.deepEqual(lintPage('Fine.\n', { kind: 'plain', title: 'Skills: 9/28 7:00PM Decisions' }), []);
});

// ---------------------------------------------------------------------------
// em-dash-arrow and the verbatim exemption
// ---------------------------------------------------------------------------

test('em-dash-arrow: dashes and arrows in prose are red, sentences are green', () => {
  for (const bad of ['The gate — not the run — failed.', 'Run A -> run B.', 'Then → done.', 'Result ⇒ pass.']) {
    assert.deepEqual(ids(doc(bad), { kind: 'spec' }).filter((r) => r === 'em-dash-arrow'), ['em-dash-arrow'], bad);
  }
  assert.deepEqual(ids(doc('The gate failed, and so did the run.'), { kind: 'spec' }).filter((r) => r === 'em-dash-arrow'), []);
  assert.deepEqual(ids(doc('a — b'), { kind: 'plain' }), [], 'not asked of plain pages');
});

test('em-dash-arrow: probes, code, fences, quotes, comments, link targets, Original text, owner lines', () => {
  const clean = [
    'Use `a -> b` here.', 'a --> b', '"quoted — text"', '“curly — quote”', '[link](https://x.y/a->b) text',
    '\\*\\* his comment — with a dash', '- \\*\\* his comment -> arrow',
  ];
  for (const s of clean) assert.deepEqual(ids(doc(s), { kind: 'spec' }).filter((r) => r === 'em-dash-arrow'), [], s);
  assert.deepEqual(ids(doc('```', 'a — b', '```'), { kind: 'spec' }).filter((r) => r === 'em-dash-arrow'), []);
  const orig = doc('<details>', '<summary>**Original text**</summary>', `${T}his words — verbatim`, `${T}<empty-block/>`, '</details>');
  assert.deepEqual(ids(orig, { kind: 'spec' }).filter((r) => r === 'em-dash-arrow'), []);
  const reply = doc('\\*\\* his comment', `${T}Reply, 06:12 NYC: done — yes`);
  assert.deepEqual(ids(reply, { kind: 'spec' }).filter((r) => r === 'em-dash-arrow'), ['em-dash-arrow'], 'our reply is not exempt');
});

test('verbatim exemption: every rule but no-byline ignores an Original text subtree', () => {
  const verbatim = doc(
    '<details>', '<summary>**Original text**</summary>',
    `${T}## 2. Decisions`, `${T}(a) option in prose`, `${T}Before: x`, `${T}After: y`, `${T}a — b`,
    `${T}<details>`, `${T}<summary>inner</summary>`, `${T}${T}z`, `${T}</details>`, `${T}<empty-block/>`, '</details>',
  );
  assert.deepEqual(lintPage(verbatim, { kind: 'decisions', skip: ['done-last'] }), []);
});

// ---------------------------------------------------------------------------
// API shape
// ---------------------------------------------------------------------------

test('lintPage: returns [{rule, line, message}], sorted by line, one entry per violation', () => {
  const v = lintPage(doc('ok', '## 1. Bad', 'also ok', '# 2. Worse'), { kind: 'plain' });
  assert.deepEqual(v.map((x) => [x.rule, x.line]), [['heading-prefix', 2], ['heading-prefix', 4]]);
  assert.equal(typeof v[0].message, 'string');
  assert.match(formatViolations(v, 'doc.md')[0], /^page-lint: heading-prefix doc\.md:2 /);
});

test('lintPage: throws on an unknown kind or an unknown skip id, and skip switches a rule off', () => {
  assert.throws(() => lintPage('x', { kind: 'nope' }), /unknown kind/);
  assert.throws(() => lintPage('x', { kind: 'plain', skip: ['no-such-rule'] }), /unknown rule id "no-such-rule"/);
  assert.deepEqual(lintPage('## 1. Bad\n', { kind: 'plain', skip: ['heading-prefix'] }), []);
});

test('lintPage: CRLF and a BOM change no rule outcome and no line number', () => {
  const bad = doc('# Fine', '', '## 1. Bad');
  const crlf = `﻿${bad.replace(/\n/g, '\r\n')}`;
  assert.deepEqual(lintPage(crlf, { kind: 'plain' }), lintPage(bad, { kind: 'plain' }));
  assert.equal(lintPage(crlf, { kind: 'plain' })[0].line, 3);
  assert.deepEqual(lintPage(decisionsPage().replace(/\n/g, '\r\n'), { kind: 'decisions' }), []);
});

test('the rule table names only known kinds, and every fragment-off rule is a real rule', () => {
  for (const kinds of Object.values(RULES)) for (const k of kinds) assert.ok(KINDS.includes(k), k);
  for (const id of FRAGMENT_OFF) assert.ok(Object.hasOwn(RULES, id), id);
});

// ---------------------------------------------------------------------------
// The pinned fixtures: masked skeletons of the pages Ben used, and today's render
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Round 2 review fixes: four rule defects and the surviving mutations
// ---------------------------------------------------------------------------

const rule = (text, opts, id) => lintPage(text, opts).filter((v) => v.rule === id).map((v) => v.line);
const priorToggle = (inner) => ['<details>', '<summary>**Prior rounds**</summary>', ...inner.map((l) => T + l), `${T}<empty-block/>`, '</details>'];
const passToggle = (n) => ['<details>', `<summary>**Pass ${n}**</summary>`, `${T}- sample`, `${T}<empty-block/>`, '</details>'];

test('prior-rounds: sub-toggles of an earlier round nested inside Prior rounds are green', () => {
  const round3 = ['<details>', '<summary>**Round 3**</summary>', ...passToggle(1).map((l) => T + l), ...passToggle(2).map((l) => T + l), `${T}<empty-block/>`, '</details>'];
  const page = doc(...roundToggle(4, ' samples'), ...priorToggle(round3));
  assert.deepEqual(rule(page, { kind: 'plain' }, 'prior-rounds'), []);
  const twoOutside = doc(...roundToggle(4), ...roundToggle(3));
  assert.deepEqual(ids(twoOutside, { kind: 'plain' }), ['prior-rounds'], 'still red outside Prior rounds');
});

test('toggle-tail: an unclosed Original text toggle exempts nothing and is itself reported', () => {
  const page = doc('<details>', '<summary>Original text</summary>', `${T}x`, '# 1. Bad heading', 'A — dash', '- Written by Claude');
  const got = lintPage(page, { kind: 'spec', fragment: true }).map((v) => v.rule).sort();
  assert.deepEqual(got, ['em-dash-arrow', 'heading-prefix', 'no-byline', 'toggle-tail']);
});

test('options-checkbox: a quoted phrase before a mid-line (a) is not an option line', () => {
  assert.deepEqual(rule(doc('- "Ship it" (a) is my pick.'), { kind: 'decisions' }, 'options-checkbox'), []);
  assert.deepEqual(rule(doc('"Ship it" (a) is my pick.'), { kind: 'decisions' }, 'options-checkbox'), []);
  assert.deepEqual(rule(doc('(a) Ship it'), { kind: 'decisions' }, 'options-checkbox'), [1], 'a real option line still fires');
});

test('decision-block: details and summary on one line are read like the two-line form', () => {
  const oneLine = (summary) => [`${T}<details><summary>**${summary}**</summary>`, `${T}${T}- a fact`, `${T}${T}<empty-block/>`, `${T}</details>`];
  const waiting = waitingItem({ details: oneLine('Background') });
  const decided = [
    `${T}- [x] **Publish six?** Your answer: "a" (Sep 28). Then: done.`,
    `${T}${T}<details><summary>**Original text**</summary>`, `${T}${T}${T}- [ ] **Publish six?**`, `${T}${T}${T}<empty-block/>`, `${T}${T}</details>`,
  ];
  assert.deepEqual(rule(decisionsPage(waiting, decided), { kind: 'decisions' }, 'decision-block'), []);
  assert.deepEqual(ids(decisionsPage(waitingItem({ details: oneLine('Notes') })), { kind: 'decisions' }), ['decision-block'], 'a wrong one-line title is still red');
});

test('decision-block: a second details child is red even when it is also titled Background', () => {
  const w = waitingItem();
  const second = [`${T}<details>`, `${T}<summary>**Background**</summary>`, `${T}${T}x`, `${T}${T}<empty-block/>`, `${T}</details>`];
  const two = [...w.slice(0, 8), ...second, ...w.slice(8)];
  assert.deepEqual(ids(decisionsPage(two), { kind: 'decisions' }), ['decision-block']);
});

test('decision-block: an owner line between Options and its checkboxes breaks nothing', () => {
  const w = waitingItem();
  const withNote = [...w.slice(0, 4), `${T}\\*\\* his note`, ...w.slice(4)];
  assert.deepEqual(rule(decisionsPage(withNote), { kind: 'decisions' }, 'decision-block'), []);
});

test('before-after: a pair written After first is found; a different indent is not a pair', () => {
  assert.deepEqual(ids(doc('After: new', 'Before: old'), { kind: 'plain' }), ['before-after']);
  const colored = doc('<span color="green">**AFTER**</span> new', '<span color="red">**BEFORE**</span> old');
  assert.deepEqual(ids(colored, { kind: 'plain' }), []);
  assert.deepEqual(ids(doc('Before: a', `${T}After: b`), { kind: 'plain' }), [], 'an After at another indent is not a sibling');
  assert.deepEqual(ids(doc('After: a', 'x', 'y', 'z', 'w', 'Before: b'), { kind: 'plain' }), [], 'far apart');
});

test('no-byline: a name that only starts like an agent is not a byline', () => {
  assert.ok(!isByline('Written by Claudette Colbert'));
  assert.deepEqual(ids(doc('Written by Claudette Colbert'), { kind: 'plain' }), []);
});

test('lintPage: a leading BOM does not hide the goal callout from the first-block check', () => {
  assert.deepEqual(lintPage('\uFEFF' + doc(...GOAL, '# Plan'), { kind: 'spec' }), []);
});

test('read-status: off for a fragment, so a two-round fragment without a callout is clean', () => {
  const page = doc('Read now: the Round 2 toggle.', ...roundToggle(2), ...priorToggle(roundToggle(1)));
  assert.deepEqual(rule(page, { kind: 'read', fragment: true }, 'read-status'), []);
  assert.deepEqual(rule(doc(...roundToggle(2), ...priorToggle(roundToggle(1))), { kind: 'read' }, 'read-status').length > 0, true, 'and red for a whole page');
});

const RENDER_SKIP = ['open-question-visible', 'decision-block', 'done-last', 'em-dash-arrow'];
const fixtureIds = (name, opts) => ids(fs.readFileSync(path.join(FIX, name), 'utf8'), opts);

test('fixture: today\'s render (decisions, the render skip list) gives []', () => {
  assert.deepEqual(fixtureIds('render-decisions.skeleton.md', { kind: 'decisions', skip: RENDER_SKIP }), []);
});

test('fixture: the side-by-side read page (read) gives exactly [toggle-tail]', () => {
  assert.deepEqual(fixtureIds('read-page.skeleton.md', { kind: 'read' }), ['toggle-tail']);
});

test('fixture: the handoff brief (handoff) gives exactly [toggle-tail]', () => {
  assert.deepEqual(fixtureIds('handoff-brief.skeleton.md', { kind: 'handoff' }), ['toggle-tail']);
});

// Lead ruling: the 19 em-dash-arrow hits are real (Ben's "no em dashes, no arrows" rule; the page predates enforcement, like toggle-tail on the other two), and the Done line is absent from today's read.
test('fixture: decisions page (decisions) gives exactly [done-last, em-dash-arrow], 19 em-dash-arrow hits', () => {
  const text = fs.readFileSync(path.join(FIX, 'open-decisions.skeleton.md'), 'utf8');
  const v = lintPage(text, { kind: 'decisions' });
  assert.deepEqual([...new Set(v.map((x) => x.rule))].sort(), ['done-last', 'em-dash-arrow']);
  assert.equal(v.filter((x) => x.rule === 'em-dash-arrow').length, 19);
});

test('fixture: decisions page, the sets that do hold, the other ten rules are green', () => {
  const got = fixtureIds('open-decisions.skeleton.md', { kind: 'decisions' });
  assert.deepEqual(got.filter((r) => r !== 'em-dash-arrow'), ['done-last'], 'today\'s read has no Done line');
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function capture(argv) {
  let out = '';
  let err = '';
  const code = main(argv, { out: (s) => { out += s; }, err: (s) => { err += s; } });
  return { code, out, err };
}

test('CLI main: clean is exit 0 with a "page-lint: clean (<kind>)" line', () => {
  const r = capture([path.join(FIX, 'render-decisions.skeleton.md'), '--kind', 'plain']);
  assert.equal(r.code, 0);
  assert.equal(r.out, 'page-lint: clean (plain)\n');
});

test('CLI main: violations are exit 2, one stderr line each, all of them', () => {
  const r = capture([path.join(FIX, 'handoff-brief.skeleton.md'), '--kind', 'handoff']);
  assert.equal(r.code, 2);
  const lines = r.err.trim().split('\n');
  assert.equal(lines.length, 51);
  assert.match(lines[0], /^page-lint: toggle-tail .*handoff-brief\.skeleton\.md:\d+ /);
  assert.equal(r.out, '');
});

test('CLI main: usage errors are exit 1 (unknown kind, missing file, no file, bad option)', () => {
  assert.equal(capture([path.join(FIX, 'render-decisions.skeleton.md'), '--kind', 'nope']).code, 1);
  assert.equal(capture([path.join(FIX, 'no-such-file.md')]).code, 1);
  assert.equal(capture([]).code, 1);
  assert.equal(capture(['x.md', '--bogus']).code, 1);
  assert.equal(capture(['x.md', '--kind']).code, 1);
});

test('CLI process: real exit codes, and --title and --fragment reach the linter', () => {
  const home = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'), 'page-lint-'));
  const file = path.join(home, 'd.md');
  fs.writeFileSync(file, 'Text only.\n');
  const run = (args) => spawnSync(process.execPath, [CLI, file, ...args], { encoding: 'utf8', env: childEnv(home) });
  assert.equal(run([]).status, 0);
  assert.equal(run(['--kind', 'spec']).status, 2, 'no goal callout');
  assert.equal(run(['--kind', 'spec', '--fragment']).status, 0);
  const t = run(['--title', 'Notes by Claude Code']);
  assert.equal(t.status, 2);
  assert.match(t.stderr, /page-lint: no-byline .*:0 /);
  assert.equal(run(['--kind', 'bogus']).status, 1);
});

test('page-lint imports nothing from the decisions skill (the render imports it, not the reverse)', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assert.equal(/from\s+['"][^'"]*decisions/.test(src), false);
  assert.equal(/from\s+['"]node:/.test(src), true);
});

test('SKILL.md names every rule id, and every [rule-id] it cites is a real rule', () => {
  const skill = fs.readFileSync(path.join(HERE, '..', 'SKILL.md'), 'utf8');
  for (const id of Object.keys(RULES)) assert.ok(skill.includes(`[${id}]`), `SKILL.md must cite [${id}]`);
  for (const [, id] of skill.matchAll(/`\[([a-z-]+)\]`/g)) assert.ok(id === 'rule-id' || Object.hasOwn(RULES, id), `SKILL.md cites unknown rule [${id}]`);
  for (const kind of KINDS) assert.ok(skill.includes(kind), `SKILL.md must name the kind ${kind}`);
});
