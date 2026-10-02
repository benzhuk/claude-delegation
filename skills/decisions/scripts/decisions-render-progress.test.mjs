// node --test skills/decisions/scripts/decisions-render-progress.test.mjs
// Lane 73 item 3: every waiting item and every in-progress session bullet shows
// `Now: ... | To finish: ... | Est: ...` as one short line; a missing one is refused by file and line.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, RefusedError } from './decisions-render.mjs';
import { checkWaitingProgressLine, checkSessionProgress, isProgressLine } from './decisions-render-core.mjs';
import { toggleFiles, withTogglesGit } from './fixtures/toggles-fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'progress-73');
const read = (n) => fs.readFileSync(path.join(FIX, n), 'utf8');
const REPO = path.join(path.parse(HERE).root, 'repo-fixture');
const p = (...parts) => path.join(REPO, ...parts);

function deps(overrides = {}) {
  const map = new Map(Object.entries({
    ...toggleFiles(path.join, REPO),
    [p('docs', 'decisions', 'now.md')]: 'The plugin runs the loop by itself. Ticks reach the right session within a minute. Knowledge sharing between machines is the next lane.',
    [p('docs', 'decisions', 'session.md')]: read('session-with-line.md'),
    [p('docs', 'decisions', 'history', '2026-09-27.md')]: '# Sep 27, 2026\nSummary: five lanes merged, the delete guard shipped, and a second RE-PLAN reached your page.\n- some bullet\n',
    [p('docs', 'decisions', 'archive', 'decisions-page-2026-09-27.md')]: '# archive\ncontent\n',
    ...overrides,
  }));
  const readFile = (f) => { if (!map.has(f)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return map.get(f); };
  const readdirSync = (dir) => [...map.keys()].filter((k) => path.dirname(k) === dir).map((k) => path.basename(k));
  return { readFile, readdirSync, execGit: withTogglesGit((args) => args[args.length - 1]) };
}

test('waiting item with the line directly under its title passes and the line rides into the page', () => {
  assert.doesNotThrow(() => checkWaitingProgressLine(read('waiting-with-line.md'), 'waiting/a.md'));
  const page = render({ repo: REPO }, deps({ [p('docs', 'decisions', 'waiting', 'a.md')]: read('waiting-with-line.md') }));
  assert.match(page, /<summary>\*\*Cap the nightly batch[^\n]*<\/summary>\n\t\tNow: queue outgrew memory twice \| To finish: you pick a cap or none \| Est: a day after your tick\n/);
});

test('waiting item without the line is refused, naming file and line', () => {
  assert.throws(
    () => checkWaitingProgressLine(read('waiting-without-line.md'), 'waiting/a.md'),
    (e) => e instanceof RefusedError && /^waiting\/a\.md:3 lacks the line directly under the title/.test(e.message),
  );
  assert.throws(
    () => render({ repo: REPO }, deps({ [p('docs', 'decisions', 'waiting', 'a.md')]: read('waiting-without-line.md') })),
    (e) => e instanceof RefusedError && /waiting\/a\.md:3/.test(e.message),
  );
});

test('waiting item with only two of the three fields is refused', () => {
  assert.throws(
    () => checkWaitingProgressLine(read('waiting-two-fields.md'), 'waiting/a.md'),
    (e) => e instanceof RefusedError && /waiting\/a\.md:3 is not exactly/.test(e.message),
  );
});

test('waiting item progress line over 200 characters is refused', () => {
  const long = read('waiting-with-line.md').replace('queue outgrew memory twice', 'x'.repeat(200));
  assert.throws(() => checkWaitingProgressLine(long, 'waiting/a.md'), (e) => /more than the required 200/.test(e.message));
});

test('session: an In progress bullet with the line passes; without it is refused, naming file and line', () => {
  assert.doesNotThrow(() => render({ repo: REPO }, deps()));
  assert.throws(
    () => render({ repo: REPO }, deps({ [p('docs', 'decisions', 'session.md')]: read('session-without-line.md') })),
    (e) => e instanceof RefusedError && /^session\.md:3 says "In progress" but lacks/.test(e.message),
  );
});

test('session: the 200-character limit counts the fields (a long bullet is refused for length, not for hiding the fields)', () => {
  const tooLong = `since: 2026-09-27T18:16:00Z\n- In progress, report states. Now: ${'x'.repeat(190)} | To finish: y | Est: 1 day`;
  assert.throws(
    () => render({ repo: REPO }, deps({ [p('docs', 'decisions', 'session.md')]: tooLong })),
    (e) => e instanceof RefusedError && /session\.md:2 is \d+ characters, more than the required 200/.test(e.message),
  );
  assert.doesNotThrow(() => checkSessionProgress('Lane 71 merged tonight.', 'session.md:2'));
});

test('isProgressLine: exactly three non-empty fields in order', () => {
  assert.equal(isProgressLine('Now: a | To finish: b | Est: 1 day'), true);
  assert.equal(isProgressLine('Now: a | To finish: b'), false);
  assert.equal(isProgressLine('Now: a | To finish: b | Est: '), false);
  assert.equal(isProgressLine('Now: a | To finish: b | Est: c | d'), false);
  assert.equal(isProgressLine('To finish: b | Now: a | Est: 1 day'), false);
});
