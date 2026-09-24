// Independent behavioral contract for the canonical decisions archive.
// Synthetic fixtures only; no private page content, Notion reader, or live transport is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { makeTempHome } from '../../../scripts/test-home.mjs';
import { parseDocument } from './decisions-read.mjs';
import { pickupOnce } from './decisions-pickup.mjs';

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
# Current section {toggle="true"}
<summary>Active malformed grouping</summary>
- [ ] Done
`;
const PICKUP_ARCHIVE = ARCHIVE.replace('# Current section {toggle="true"}\n<summary>Active malformed grouping</summary>\n', '');

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
  const doc = parseDocument(ARCHIVE, { now: new Date(NOW) });
  assert.deepEqual(doc.shapeless.map((entry) => entry.title), ['Active malformed grouping']);
  assert.equal(doc.unattached.some((entry) => entry.kind === 'comment' && entry.text === COMMENT), true);
  const archivedTick = doc.decisions.find((entry) => entry.title === 'Archived checked item');
  assert.equal(archivedTick.status, 'TICKED');
  assert.equal(archivedTick.options[0].text, 'retained archived tick');
  assert.deepEqual(Object.keys(doc).sort(), ['decisions', 'done', 'doneLabel', 'shapeless', 'unattached', 'warnings']);
  assert.deepEqual(Object.keys(doc.decisions[0]).sort(), ['comments', 'default', 'line', 'options', 'status', 'title']);
  assert.equal(JSON.stringify(doc).includes('archiveScope'), false, 'internal archive state must not leak');
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
<summary>Archived valid grouping</summary>
# Active {toggle="true"}
<summary>After exit remains active</summary>
`;
  const doc = parseDocument(text);
  assert.deepEqual(doc.shapeless.map((entry) => entry.title), [
    'Inside details', 'Numeric suffix remains active', 'Fenced fake remains active', 'After exit remains active',
  ]);
});

test('malformed summary remains blind even under canonical Closed', () => {
  assert.throws(
    () => parseDocument('# Closed {toggle="true"}\n<summary>broken\n'),
    /unreadable <summary>/,
  );
});

test('real pickupOnce accepts synthetic archive on unchecked and checked pages without archive sends', async (t) => {
  const fx = pickupFixture(t);
  const unchecked = PICKUP_ARCHIVE.replace('- [ ] Done', '- [ ] Done');
  const sends = { count: 0 };
  const noAction = await pickupOnce(fx.options, pickupDeps(fx, unchecked, sends));
  assert.equal(noAction.status, 'UNCHANGED');
  assert.equal(sends.count, 0, 'unchecked archive page must not capture or send');

  const checked = PICKUP_ARCHIVE.replace('- [ ] Done', '- [x] Done');
  const recorded = await pickupOnce(fx.options, pickupDeps(fx, checked, sends));
  assert.equal(recorded.status, 'RECORDED');
  assert.equal(sends.count, 1, 'one current checked selection produces exactly one existing dispatch');
  assert.equal(recorded.receipt.capturedItems.length, 2, 'current and archived checked options remain human signals');
});
