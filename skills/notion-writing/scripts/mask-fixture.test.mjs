// node scripts/run-tests.mjs skills/notion-writing/scripts/mask-fixture.test.mjs
// The masker that keeps Ben's real pages out of this public repo (spec Revision 2 F1), and the
// privacy check on every fixture that is committed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskText, maskLine, findLeaks, KEYWORDS } from './mask-fixture.mjs';
import { lintPage } from './page-lint.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const T = '\t';

test('maskLine: every word outside the keyword list becomes a same-length x run', () => {
  const line = 'The Netflix shelf costs $4,000 and ships Friday.';
  assert.equal(maskLine(line), 'xxx xxxxxxx xxxxx xxxxx $x,xxx xxx xxxxx xxxxxx.');
  assert.equal(maskLine(line).length, line.length);
});

test('maskLine: markers, tabs, tags, attributes, punctuation, em dashes and arrows stay', () => {
  assert.equal(maskLine(`${T}${T}- [ ] **Alpha beta?** — gamma -> delta`), `${T}${T}- [ ] **xxxxx xxxx?** — xxxxx -> xxxxx`);
  assert.equal(maskLine('<callout icon="🎯">'), '<callout icon="🎯">');
  assert.equal(maskLine('<span color="red">**BEFORE**</span> old line'), '<span color="red">**BEFORE**</span> xxx xxxx');
  assert.equal(maskLine('# Secret plan {toggle="true"}'), '# xxxxxx xxxx {toggle="true"}');
  assert.equal(maskLine('<empty-block/>'), '<empty-block/>');
  assert.equal(maskLine('<page url="https://app.example.com/p/abc123">Child title</page>'), '<page url="xxxxx://xxx.xxxxxxx.xxx/x/xxxxxx">xxxxx xxxxx</page>');
  assert.equal(maskLine('[Doc name](https://example.com/a-b)'), '[xxx xxxx](xxxxx://xxxxxxx.xxx/x-x)');
  assert.equal(maskLine('Use `secret.sh` now'), 'xxx `xxxxxx.xx` xxx');
});

test('maskLine: the keywords the rules key on survive, in any case', () => {
  for (const k of KEYWORDS) {
    assert.equal(maskLine(`**${k}:** hidden`), `**${k}:** xxxxxx`, k);
  }
  assert.equal(maskLine('# Waiting on you now'), '# Waiting on you xxx');
  assert.equal(maskLine('Read now: the second toggle'), 'Read now: xxx xxxxxx xxxxxx');
  assert.equal(maskLine('Undecided things'), 'xxxxxxxxx xxxxxx', 'a keyword inside a longer word is not kept');
});

test('maskLine: option labels, Round and Pass numbers, heading and summary ordinals survive', () => {
  assert.equal(maskLine('- [ ] (A) recommended. Publish.'), '- [ ] (A) xxxxxxxxxxx. xxxxxxx.');
  assert.equal(maskLine('<summary>**Round 13 samples**</summary>'), '<summary>**Round 13 xxxxxxx**</summary>');
  assert.equal(maskLine('pass 2 done'), 'pass 2 done');
  assert.equal(maskLine('## 2. Decisions and more'), '## 2. xxxxxxxxx xxx xxxx');
  assert.equal(maskLine('# A. Plan'), '# A. xxxx');
  assert.equal(maskLine('# Step 3 setup'), '# Step 3 xxxxx');
  assert.equal(maskLine('<summary>**P1 notes**</summary>'), '<summary>**P1 xxxxx**</summary>');
  assert.equal(maskLine('Not a heading 2. in prose'), 'xxx x xxxxxxx x. xx xxxxx');
});

test('maskText: idempotent, CRLF and BOM normalised, line count unchanged', () => {
  const src = `﻿# Real title\r\n${T}- [ ] **Question?**\r\n<details>\r\n<summary>**Original text**</summary>\r\n${T}quoted "words"\r\n</details>\r\n`;
  const once = maskText(src);
  assert.equal(maskText(once), once);
  assert.equal(once.split('\n').length, src.split('\r\n').length);
  assert.equal(once.includes('\r'), false);
  assert.equal(once.includes('title'), false);
});

test('maskText: the rules see the same structure before and after masking', () => {
  const src = [
    '# 1. Secret heading', `${T}child of a plain heading`,
    '<details>', '<summary>**Round 1 secret**</summary>', `${T}- (A) prose option`, '</details>',
    '<details>', '<summary>**Round 2 secret**</summary>', `${T}Before: old`, `${T}After: new — dash`, `${T}<empty-block/>`, '</details>',
    'Written by Claude Code', '',
  ].join('\n');
  const opts = { kind: 'plain' };
  const before = lintPage(src, opts).map((v) => `${v.rule}:${v.line}`);
  const after = lintPage(maskText(src), opts).map((v) => `${v.rule}:${v.line}`);
  assert.ok(before.length >= 5, before.join(' '));
  assert.deepEqual(after.filter((x) => !x.startsWith('no-byline')), before.filter((x) => !x.startsWith('no-byline')));
});

test('findLeaks: catches a real word, ignores x runs, keywords and tags', () => {
  assert.deepEqual(findLeaks('# Waiting on you\n<details>\n<summary>**Background**</summary>\n\txxx xxxx\n</details>'), []);
  assert.deepEqual(findLeaks('\txxx Netflix xxxx'), [{ line: 1, word: 'Netflix' }]);
});

test('every committed fixture is a skeleton: no real word, and the masker leaves it unchanged', () => {
  const files = fs.readdirSync(FIX).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 4, `expected the four skeletons, found ${files.join(', ')}`);
  for (const f of files) {
    assert.match(f, /\.skeleton\.md$/, `${f}: only masked skeletons may be committed here`);
    const text = fs.readFileSync(path.join(FIX, f), 'utf8');
    assert.deepEqual(findLeaks(text), [], f);
    assert.equal(maskText(text), text.replace(/\r\n/g, '\n'), `${f} is not a fixed point of the masker`);
  }
});

test('committed fixtures: a plain word grep finds only the keyword vocabulary', () => {
  const vocab = new Set([
    ...KEYWORDS.flatMap((k) => k.toLowerCase().split(/[^a-z]+/)).filter(Boolean),
    'details', 'summary', 'callout', 'icon', 'span', 'color', 'toggle', 'true', 'empty', 'block', 'page', 'url',
    'red', 'green', 'blue', 'gray', 'yellow', 'orange', 'purple', 'pink', 'brown', 'default', 'background',
    'step', 'phase', 'part',
  ]);
  for (const f of fs.readdirSync(FIX).filter((x) => x.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(FIX, f), 'utf8');
    const words = new Set((text.match(/[A-Za-z]{2,}/g) ?? []).map((w) => w.toLowerCase()).filter((w) => !/^x+$/.test(w)));
    const stray = [...words].filter((w) => !vocab.has(w) && !/^(?:[ivx]+|p)$/.test(w));
    assert.deepEqual(stray, [], `${f} carries words outside the keyword list`);
  }
});
