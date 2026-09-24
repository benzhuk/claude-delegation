// Independent behavioral contract for the canonical decisions archive.
// Synthetic fixtures only; no private page content, Notion reader, or live transport is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { makeTempHome } from '../../../scripts/test-home.mjs';
import { parseDocument } from './decisions-read.mjs';
import { openPrivateCapture, pickupOnce, receiptPaths } from './decisions-pickup.mjs';
import { run as runHandback } from './decisions-handback.mjs';

const PAGE = '0123456789abcdef0123456789abcdef';
const NOW = '2026-09-24T12:00:00.000Z';
const COMMENT = 'ARCHIVE_COMMENT_CANARY';

const ARCHIVE = `<summary>Current choice</summary>
- [x] current selection
No default: current owner choice
# Closed {toggle="true"}
<summary>Archived grouping</summary>
\\*\\*${COMMENT}
<summary>Archived checked item</summary>
- [x] retained archived tick
No default: historical
<details>
<summary>Nested archived grouping</summary>
</details>
# Current section {toggle="true"}
<summary>Active malformed grouping</summary>
- [ ] Done
`;
const PICKUP_ARCHIVE = ARCHIVE.replace('# Current section {toggle="true"}\n<summary>Active malformed grouping</summary>\n', '');
const PLAIN_PICKUP_ARCHIVE = PICKUP_ARCHIVE.replace('# Closed {toggle="true"}', '# Closed');
const MIXED_UNKNOWN = `${PLAIN_PICKUP_ARCHIVE.replace('- [ ] Done', '# Unknown historical section\n<summary>Unknown optionless history</summary>\n- [ ] Done')}`;
const MIXED_NORMALIZED = MIXED_UNKNOWN.replace('# Unknown historical section', '## Unknown historical section');
const UNCLOSED_DETAILS = `# Closed
<details>
<summary>Historical optionless</summary>
# Active
<summary>Active optionless</summary>
- [ ] Done
`;
const STRAY_DETAILS_CLOSE = `# Closed
</details>
<summary>Historical optionless</summary>
# Active
<summary>Active optionless</summary>
- [ ] Done
`;
const HANDBACK_UNKNOWN = `<summary>Current unchecked choice</summary>
- [ ] current option
No default: explicit owner choice
# Closed
<summary>Archived grouping</summary>
# Unknown historical section
<summary>Unknown optionless history</summary>
- [ ] Done
`;
const HANDBACK_NORMALIZED = HANDBACK_UNKNOWN.replace('# Unknown historical section', '## Unknown historical section');
const HAND_BACK_GOALS = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'handback', 'goals-clean.md'), 'utf8');

function pickupFixture(t) {
  const sealed = makeTempHome();
  t.after(sealed.cleanup);
  const repo = fs.mkdtempSync(path.join(sealed.fixtureRoot, 'archive-pickup-'));
  fs.mkdirSync(path.join(repo, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.agents', 'project.json'), JSON.stringify({ decisions_url: PAGE }));
  return {
    ...sealed,
    options: { repo, page: PAGE, from: 'archive-host', owner: 'archive-owner', reader: 'synthetic-reader.mjs' },
  };
}

function pickupDeps(fx, page, sends) {
  return {
    agentsHome: fx.agentsHome,
    env: fx.env,
    now: NOW,
    readPage: async () => page,
    send: async () => { sends.count += 1; return { id: 'sealed-archive-note' }; },
  };
}

test('canonical Closed archives only optionless summaries while retaining comments, ticks, scope exit, and public shape', () => {
  for (const closed of ['# Closed {toggle="true"}', '# Closed']) {
    const scoped = parseDocument(ARCHIVE.replace('# Closed {toggle="true"}', closed), { now: new Date(NOW) });
    assert.deepEqual(scoped.shapeless.map((entry) => entry.title), ['Active malformed grouping']);
  }
  const doc = parseDocument(ARCHIVE, { now: new Date(NOW) });
  assert.deepEqual(doc.shapeless.map((entry) => entry.title), ['Active malformed grouping']);
  assert.equal(doc.unattached.some((entry) => entry.kind === 'comment' && entry.text === COMMENT), true);
  const archivedTick = doc.decisions.find((entry) => entry.title === 'Archived checked item');
  assert.equal(archivedTick.status, 'TICKED');
  assert.equal(archivedTick.options[0].text, 'retained archived tick');
  assert.deepEqual(Object.keys(doc).sort(), ['decisions', 'done', 'doneLabel', 'shapeless', 'unattached', 'warnings']);
  for (const decision of doc.decisions) {
    assert.deepEqual(Object.keys(decision).sort(), ['comments', 'default', 'line', 'options', 'status', 'title']);
  }
});

test('only a structural top-level exact Closed heading opens scope; fences, details, suffixes, and scope exit do not', () => {
  const text = `<details>
# Closed {toggle="true"}
<summary>Inside details</summary>
</details>
# Closed (8) {toggle="true"}
<summary>Numeric suffix remains active</summary>
\`\`\`
# Closed {toggle="true"}
\`\`\`
<summary>Fenced fake remains active</summary>
  # Closed {toggle="true"}
<summary>Indented fake remains active</summary>
# Closed {toggle="true"}
<summary>Archived valid grouping</summary>
<details>
# Active {toggle="true"}
</details>
<summary>Still archived after nested heading</summary>
# Active
<summary>After exit remains active</summary>
`;
  const doc = parseDocument(text);
  assert.deepEqual(doc.shapeless.map((entry) => entry.title), [
    'Inside details', 'Numeric suffix remains active', 'Fenced fake remains active', 'Indented fake remains active',
    'After exit remains active',
  ]);
});

test('malformed summary remains blind even under canonical Closed', () => {
  assert.throws(
    () => parseDocument('# Closed {toggle="true"}\n<summary>broken\n'),
    /unreadable <summary>/,
  );
});

test('unterminated fence remains blind under canonical Closed', () => {
  assert.throws(() => parseDocument('# Closed\n```\n<summary>ignored</summary>\n'), /unterminated fenced code block/);
});

test('unbalanced details falls back to active shapeless checks without becoming BLIND', async (t) => {
  for (const text of [UNCLOSED_DETAILS, STRAY_DETAILS_CLOSE]) {
    const doc = parseDocument(text);
    assert.deepEqual(doc.shapeless.map((entry) => entry.title), ['Historical optionless', 'Active optionless']);
  }
  const fx = pickupFixture(t);
  const sends = { count: 0 };
  const invalid = await pickupOnce(fx.options, pickupDeps(fx, UNCLOSED_DETAILS, sends));
  assert.equal(invalid.status, 'INVALID');
  assert.equal(sends.count, 0);
  const paths = receiptPaths({ agentsHome: fx.agentsHome, project: fs.realpathSync(fx.options.repo), page: PAGE });
  assert.equal(fs.existsSync(paths.directory), false, 'unbalanced details must not create receipt artifacts');
});

test('only normalized history beneath Closed is exempt; later unknown H1 remains a shared parser and pickup defect', async (t) => {
  const before = parseDocument(MIXED_UNKNOWN);
  const after = parseDocument(MIXED_NORMALIZED);
  assert.deepEqual(before.shapeless.map((entry) => entry.title), ['Unknown optionless history']);
  assert.deepEqual(after.shapeless, []);
  assert.deepEqual(
    after.decisions.map((decision) => ({ title: decision.title, options: decision.options, comments: decision.comments, status: decision.status })),
    before.decisions.map((decision) => ({ title: decision.title, options: decision.options, comments: decision.comments, status: decision.status })),
    'normalization changes hierarchy only, not synthetic human option/comment signals',
  );
  assert.equal(after.done, before.done, 'Done state is unchanged by normalization');
  assert.deepEqual(after.unattached, before.unattached, 'normalization preserves archived unattached human comments');

  const fx = pickupFixture(t);
  const sends = { count: 0 };
  const invalid = await pickupOnce(fx.options, pickupDeps(fx, MIXED_UNKNOWN, sends));
  assert.equal(invalid.status, 'INVALID');
  assert.equal(sends.count, 0);

  const normalizedFx = pickupFixture(t);
  const normalizedSends = { count: 0 };
  const noAction = await pickupOnce(normalizedFx.options, pickupDeps(normalizedFx, MIXED_NORMALIZED, normalizedSends));
  assert.equal(noAction.status, 'UNCHANGED');
  assert.equal(normalizedSends.count, 0);
  const paths = receiptPaths({ agentsHome: normalizedFx.agentsHome, project: fs.realpathSync(normalizedFx.options.repo), page: PAGE });
  assert.equal(fs.existsSync(paths.directory), false, 'normalized unchecked page has no receipt or capture');
});

test('handback reports the same unknown-H1 shape defect and clears it after hierarchy-only normalization', (t) => {
  const sealed = makeTempHome();
  t.after(sealed.cleanup);
  const run = (decisions) => {
    const out = [];
    const exitCode = runHandback({
      argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
      readFile: (file) => ({ d: decisions, g: HAND_BACK_GOALS })[file],
      execGit: () => { throw new Error('head supplied'); }, write: (text) => out.push(text), writeErr: () => {},
      env: sealed.env,
      readGoalsParentPage: () => ({ configured: true }),
    });
    return { exitCode, stdout: out.join('') };
  };
  const unknown = run(HANDBACK_UNKNOWN);
  assert.equal(unknown.exitCode, 1);
  assert.match(unknown.stdout, /^SHAPE/m);
  assert.match(unknown.stdout, /HANDBACK blocked/);
  const normalized = run(HANDBACK_NORMALIZED);
  assert.equal(normalized.exitCode, 0);
  assert.doesNotMatch(normalized.stdout, /^SHAPE/m);
  assert.match(normalized.stdout, /HANDBACK ok/);
});

test('real pickupOnce preserves synthetic archive signals across unchecked and checked lifecycle', async (t) => {
  const fx = pickupFixture(t);
  const unchecked = PLAIN_PICKUP_ARCHIVE;
  const sends = { count: 0 };
  const noAction = await pickupOnce(fx.options, pickupDeps(fx, unchecked, sends));
  assert.equal(noAction.status, 'UNCHANGED');
  assert.equal(sends.count, 0, 'unchecked archive page must not capture or send');
  const paths = receiptPaths({ agentsHome: fx.agentsHome, project: fs.realpathSync(fx.options.repo), page: PAGE });
  assert.equal(fs.existsSync(paths.receipt), false, 'unchecked page must not create a receipt');
  assert.equal(fs.existsSync(paths.directory), false, 'unchecked page must not create a private capture directory');

  const checked = PLAIN_PICKUP_ARCHIVE.replace('- [ ] Done', '- [x] Done');
  const recorded = await pickupOnce(fx.options, pickupDeps(fx, checked, sends));
  assert.equal(recorded.status, 'RECORDED');
  assert.equal(sends.count, 1, 'one checked page records one existing dispatch; archive prose does not dispatch separately');
  const reopened = openPrivateCapture({ ...fx.options, round: '1' }, { agentsHome: fx.agentsHome });
  assert.equal(reopened.toString('utf8'), checked, 'private capture must preserve exact synthetic bytes');
  const captured = parseDocument(reopened.toString('utf8'));
  const capturedSignals = [
    ...captured.decisions.flatMap((decision) => decision.options.filter((option) => option.ticked).map((option) => ({ kind: 'selection', text: option.text }))),
    ...captured.unattached.filter((entry) => entry.kind === 'comment').map((entry) => ({ kind: 'comment', text: entry.text })),
  ];
  assert.deepEqual(capturedSignals, [
    { kind: 'selection', text: 'current selection' },
    { kind: 'selection', text: 'retained archived tick' },
    { kind: 'comment', text: COMMENT },
  ]);
});

test('real pickupOnce keeps invalid-before-Done guard for active shapeless summary', async (t) => {
  const fx = pickupFixture(t);
  const sends = { count: 0 };
  const invalid = await pickupOnce(fx.options, pickupDeps(fx, ARCHIVE, sends));
  assert.equal(invalid.status, 'INVALID');
  assert.equal(sends.count, 0);
  const paths = receiptPaths({ agentsHome: fx.agentsHome, project: fs.realpathSync(fx.options.repo), page: PAGE });
  assert.equal(fs.existsSync(paths.directory), false, 'invalid unchecked page must not create a receipt or capture');
});
