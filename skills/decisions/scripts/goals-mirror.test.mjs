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

const CARD = 'GOAL: g\nNOT: n\nDONE: d\nKILL: k\nSOURCE: s\n';
function readFileFor(goalsText) {
  return (file) => {
    if (file.endsWith('GOALS.md')) return goalsText;
    if (file.endsWith('card.md')) return CARD;
    return fs.readFileSync(file, 'utf8');
  };
}

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

test('decisions-read still sees every goal heading with zero shapeless', () => {
  const page = renderPage({ repo: fixtureRepo, sha: 'test' });
  const doc = parseDocument(page);
  assert.equal(doc.shapeless.length, 0);
  // Same title-line contract decisions-read.mjs's matchTitle uses (docs/specs/2026-09-20-decisions-reader.md):
  // a `#`/`##`/`###` heading, any indentation, ending in `{toggle="true"}`.
  const HEADING_RE = /^[ \t]*#{1,3}[ \t]+(.*?)[ \t]*\{[^}]*\btoggle="true"[^}]*\}[ \t]*$/;
  const seen = new Set(
    page.split(/\r\n|\n/).map((l) => HEADING_RE.exec(l)).filter(Boolean).map((m) => m[1].trim()),
  );
  const goalsText = fs.readFileSync(path.join(fixtureRepo, 'docs', 'GOALS.md'), 'utf8');
  const goalHeadings = goalsText.split(/\r\n|\n/)
    .map((l) => /^##[ \t]+(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => m[1].trim());
  assert.ok(goalHeadings.length > 0);
  for (const heading of goalHeadings) assert.ok(seen.has(heading), `missing heading: ${heading}`);
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

test('the marker callout is the first callout, sha on its first line', () => {
  const page = renderPage({ repo: fixtureRepo, sha: 'abc1234' });
  const lines = page.split('\n');
  assert.match(lines[0], /^<callout icon="🎯"/);
  assert.match(lines[1], /main at abc1234/);
  // No other callout appears before the table / Detail toggle.
  const detailIdx = lines.findIndex((l) => l === '# Detail {toggle="true"}');
  const tableIdx = lines.findIndex((l) => l.startsWith('| State |'));
  assert.ok(tableIdx > 0 && tableIdx < detailIdx);
  for (let i = 2; i < tableIdx; i += 1) assert.doesNotMatch(lines[i], /<callout/);
});

test('render preserves exact dated paths, URLs, years, and parenthetical source context', () => {
  const context = 'See docs/specs/2026-09-23-harness-next.md (reviewed 2026-09-23) and https://example.test/2026-09-23?context=(source).';
  const source = `Status: PARTIAL. ${context}\n`;
  const page = renderPage({ repo: fixtureRepo, sha: 'test', readFile: readFileFor(`# Goals\n\n## Source\n${source}`) });
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
  const readFile = readFileFor('# Goals\n\n## A\n- [ ] unsafe\n');
  assert.throws(() => renderPage({ repo: fixtureRepo, sha: 'test', readFile }), /would render as a checkbox/);
});

test('render marks a section without Status UNKNOWN and preserves dollar text', () => {
  const readFile = readFileFor('# Goals\n\n## A\nCosts $& remain.\n');
  const page = renderPage({ repo: fixtureRepo, sha: 'test', readFile });
  assert.match(page, /UNKNOWN/);
  assert.match(page, /Costs \$& remain/);
  // No Status line at all: the table row still gets an UNKNOWN state word and an undated cell.
  assert.match(page, /\| <span color="red">\*\*UNKNOWN\*\*<\/span> \| A \|  \| undated \|/);
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
    const readFile = readFileFor(`# Goals\n\n## A\n${line}\n`);
    assert.throws(() => renderPage({ repo: fixtureRepo, sha: 't', readFile }));
  }
});

test('checkDirty reports dirty and blind git failures', () => {
  assert.deepEqual(checkDirty({ repo: '/r', readFile: () => 'local\n', git: () => 'origin\n' }), { dirty: true, path: 'docs/GOALS.md' });
  assert.throws(() => checkDirty({ repo: '/r', readFile: () => 'x', git: () => { throw new Error('git'); } }), /cannot read origin/);
});

// ── The one-line-per-goal table ────────────────────────────────────────────────────────────

test('table has one row per goal, in source order, with a header and separator', () => {
  const goals = '# Goals\n\n## First\nStatus: MET. All good.\n\n## Second\nStatus: NONE. Nothing yet.\n';
  const page = renderPage({ repo: fixtureRepo, sha: 't', readFile: readFileFor(goals) });
  const lines = page.split('\n');
  const headerIdx = lines.indexOf('| State | Goal | Summary | Date |');
  assert.ok(headerIdx > 0);
  assert.equal(lines[headerIdx + 1], '| --- | --- | --- | --- |');
  assert.equal(lines[headerIdx + 2], '| <span color="green">**MET**</span> | First | All good. | undated |');
  assert.equal(lines[headerIdx + 3], '| <span color="red">**NONE**</span> | Second | Nothing yet. | undated |');
});

test('table state word carries the existing colour-span style for every status word', () => {
  const cases = [['MET', 'green'], ['PARTIAL', 'orange'], ['NONE', 'red'], ['UNKNOWN', 'red']];
  for (const [word, color] of cases) {
    const goals = `# Goals\n\n## G\nStatus: ${word}. Something happened.\n`;
    const page = renderPage({ repo: fixtureRepo, sha: 't', readFile: readFileFor(goals) });
    assert.match(page, new RegExp(`\\| <span color="${color}">\\*\\*${word}\\*\\*</span> \\| G \\|`));
  }
});

test('table sentence is cut at the first ". " after the state word', () => {
  const goals = '# Goals\n\n## G\nStatus: PARTIAL. First part of it. Second part never shows up here.\n';
  const page = renderPage({ repo: fixtureRepo, sha: 't', readFile: readFileFor(goals) });
  assert.match(page, /\| First part of it\. \|/);
  assert.doesNotMatch(page.split('# Detail')[0], /Second part never shows up here/);
  // The Detail toggle still carries the full text, unabridged.
  assert.match(page, /Second part never shows up here/);
});

test('table sentence with no ". " at all uses the whole trimmed rest', () => {
  const goals = '# Goals\n\n## G\nStatus: PARTIAL. one sentence no period at end\n';
  const page = renderPage({ repo: fixtureRepo, sha: 't', readFile: readFileFor(goals) });
  assert.match(page, /\| one sentence no period at end \|/);
});

test('table date: a trailing dated citation is the status date, else "undated"', () => {
  const goals = '# Goals\n\n## Dated\nStatus: PARTIAL. Evidence here. (2026-09-22 audit)\n\n## Undated\nStatus: PARTIAL. Evidence here, no citation.\n';
  const page = renderPage({ repo: fixtureRepo, sha: 't', readFile: readFileFor(goals) });
  assert.match(page, /\| Dated \| Evidence here\. \| 2026-09-22 \|/);
  assert.match(page, /\| Undated \| Evidence here, no citation\. \| undated \|/);
});

// ── The three table-sentence refusals ──────────────────────────────────────────────────────

test('table refuses a sentence carrying a hex token (7-40 hex chars, a letter and a digit)', () => {
  const goals = '# Goals\n\n## G\nStatus: PARTIAL. Fixed in 7dfc59d today.\n';
  const readFile = readFileFor(goals);
  assert.throws(
    () => renderPage({ repo: fixtureRepo, sha: 't', readFile }),
    /carries a hex token "7dfc59d"/,
  );
});

test('table refuses a sentence carrying a test count ("N of M" or "N/M")', () => {
  const ofGoals = '# Goals\n\n## G\nStatus: PARTIAL. Passed 19 of 20 tests.\n';
  assert.throws(
    () => renderPage({ repo: fixtureRepo, sha: 't', readFile: readFileFor(ofGoals) }),
    /carries a test count "19 of 20"/,
  );
  const slashGoals = '# Goals\n\n## G\nStatus: PARTIAL. Passed 3/4 checks.\n';
  assert.throws(
    () => renderPage({ repo: fixtureRepo, sha: 't', readFile: readFileFor(slashGoals) }),
    /carries a test count "3\/4"/,
  );
});

test('table refuses a sentence carrying a session id', () => {
  const goals = '# Goals\n\n## G\nStatus: PARTIAL. Session 9c61c35a-82dd-4aef-8eca-c99bb0e72e31 ran it.\n';
  const readFile = readFileFor(goals);
  assert.throws(
    () => renderPage({ repo: fixtureRepo, sha: 't', readFile }),
    /carries a session id "9c61c35a-82dd-4aef-8eca-c99bb0e72e31"/,
  );
});

test('a 7-digit count and a plain date do not trip the hex-token rule', () => {
  const goals = '# Goals\n\n## G\nStatus: PARTIAL. Ran 1234567 times on 2026-09-22.\n';
  const page = renderPage({ repo: fixtureRepo, sha: 't', readFile: readFileFor(goals) });
  assert.match(page, /\| Ran 1234567 times on 2026-09-22\. \|/);
});

test('a table-sentence refusal exits 2 at the CLI, distinct from every other refusal (exit 1)', () => {
  const goals = '# Goals\n\n## G\nStatus: PARTIAL. Fixed in 7dfc59d today.\n';
  let err = '';
  const code = run({ argv: ['render', '--repo', fixtureRepo, '--sha', 't'], readFile: readFileFor(goals), writeErr: (s) => { err += s; } });
  assert.equal(code, 2);
  assert.match(err, /carries a hex token "7dfc59d"/);
  // An ordinary (non-table) refusal still exits 1, unchanged.
  let err2 = '';
  const code2 = run({ argv: ['render', '--repo', fixtureRepo, '--sha', 't'], readFile: readFileFor('# Goals\n\n## A\n- [ ] unsafe\n'), writeErr: (s) => { err2 += s; } });
  assert.equal(code2, 1);
});

test('a refusing token past the first ". " never blocks the render (only the table sentence is checked)', () => {
  const goals = '# Goals\n\n## G\nStatus: PARTIAL. All clear here. But fixed in 7dfc59d later.\n';
  const page = renderPage({ repo: fixtureRepo, sha: 't', readFile: readFileFor(goals) });
  assert.match(page, /\| All clear here\. \|/);
  assert.match(page, /fixed in 7dfc59d later/); // unabridged in Detail
});

// ── Detail toggle: old sections carried byte for byte after one tab ───────────────────────

test('the Detail toggle carries the old per-goal sections byte for byte after exactly one added tab', () => {
  const goals = '# Goals\n\n## First\nStatus: MET. All good.\n\n## Second\nSome prose with no status.\n';
  const readFile = readFileFor(goals);
  // What the OLD (pre-Detail) renderer produced for the sections block: reproduce it here by
  // calling the same section-building rules via the rendered page's Detail contents and
  // stripping exactly one leading tab per line — the inverse of the pinned "one tab" rule.
  const page = renderPage({ repo: fixtureRepo, sha: 't', readFile });
  const detailStart = page.indexOf('# Detail {toggle="true"}\n') + '# Detail {toggle="true"}\n'.length;
  const detailBody = page.slice(detailStart, page.lastIndexOf('\n<empty-block/>'));
  const detailLines = detailBody.split('\n');
  const firstHeadingIdx = detailLines.findIndex((l) => l === '\t# First {toggle="true"}');
  assert.ok(firstHeadingIdx > 0);
  const sectionLines = detailLines.slice(firstHeadingIdx);
  for (const line of sectionLines) assert.match(line, /^\t/, `expected exactly one leading tab: ${JSON.stringify(line)}`);
  const unindented = sectionLines.map((l) => l.slice(1)).join('\n');
  assert.equal(unindented, [
    '# First {toggle="true"}',
    '\t<span color="green">**MET**</span> All good.',
    '\t<empty-block/>',
    '# Second {toggle="true"}',
    '\tSome prose with no status.',
    '\t<span color="red">**UNKNOWN**</span>',
    '\t<empty-block/>',
  ].join('\n'));
});

test('the card callout lives only inside Detail, one tab deep, never before the table', () => {
  const page = renderPage({ repo: fixtureRepo, sha: 't' });
  const beforeTable = page.split('| State |')[0];
  assert.doesNotMatch(beforeTable, /🃏/);
  assert.match(page, /\t<callout icon="🃏"/);
});
