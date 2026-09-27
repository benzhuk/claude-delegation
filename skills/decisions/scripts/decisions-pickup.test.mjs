import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { makeTempHome } from '../../../scripts/test-home.mjs';
import { buildEnvelope } from '../../multi/scripts/envelope.mjs';
import { runNoteSend } from '../../multi/scripts/note-send.mjs';
import { childEnv } from '../../multi/scripts/test-child-env.mjs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  account, inspectTransport, openPrivateCapture, ownerInputs, pickupOnce, readPageWithCli,
  receiptPaths, runRegisteredPickup, status, PickupError,
} from './decisions-pickup.mjs';

const PAGE = `<summary>Choose transport</summary>
- [x] Keep the existing transport
No default: owner action is required
\\*\\*Please preserve the capture
- [x] Done
`;
const UNCHECKED = PAGE.replace('- [x] Done', '- [ ] Done');
const CHANGED = PAGE.replace('Please preserve the capture', 'Please preserve the capture and report it');
const EMPTY_DONE = `<summary>Choose transport</summary>
- [ ] Keep the existing transport
No default: owner action is required
- [x] Done
`;
// Contracts.md C1: a plain, non-checkbox, non-comment bullet "carries no signal"
// (skills/decisions/scripts/decisions-read.mjs:306) — bytes differ, owner inputs do not.
const BYTE_ONLY_CHANGE = PAGE.replace(
  'No default: owner action is required',
  'No default: owner action is required\n- a closed bullet with no owner signal',
);
const NEW_COMMENT = PAGE.replace(
  '\\*\\*Please preserve the capture',
  '\\*\\*Please preserve the capture\n\\*\\*Also notify finance',
);
// Fewer owner inputs than the capture (the lead acted on the comment) — a sub-multiset, per C1.
const SUBSET_CHANGE = `<summary>Choose transport</summary>
- [x] Keep the existing transport
No default: owner action is required
- [x] Done
`;
// Spec P1.5's literal fixture: the lead moves the whole settled decision under `# Closed` between
// rounds. `# Closed`'s block is untouched (skills/decisions/scripts/decisions-read.mjs:337) and its
// captured triples are identical to `PAGE`'s, so bytes differ but no owner input does.
const CLOSED_MOVE = `# Closed
<summary>Choose transport</summary>
- [x] Keep the existing transport
No default: owner action is required
\\*\\*Please preserve the capture
# Next
- [x] Done
`;
const NOW = '2026-09-23T16:00:00.000Z';
const REGISTERED_PAGE = '1234567890abcdef1234567890abcdef';

function fixture() {
  const sealed = makeTempHome();
  const repo = fs.mkdtempSync(path.join(sealed.fixtureRoot, 'pickup-'));
  fs.mkdirSync(path.join(repo, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.agents', 'project.json'), JSON.stringify({ decisions_url: 'page-registered' }));
  const options = {
    repo, page: 'page-registered', from: 'pickup-host', owner: 'decision-owner', reader: 'synthetic-reader.js',
  };
  const cleanup = () => sealed.cleanup();
  return { ...sealed, repo, options, cleanup };
}

function deps(fx, overrides = {}) {
  return {
    agentsHome: fx.agentsHome,
    now: NOW,
    readPage: async () => PAGE,
    send: async () => ({ id: 'saved-id', envelope: 'recorded' }),
    ...overrides,
  };
}

function registeredFixture() {
  const sealed = makeTempHome();
  const repo = fs.mkdtempSync(path.join(sealed.fixtureRoot, 'registered-project-'));
  fs.mkdirSync(path.join(repo, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.agents', 'project.json'), JSON.stringify({ decisions_url: REGISTERED_PAGE }));
  const reader = path.join(sealed.fixtureRoot, 'notion-reader.mjs');
  fs.writeFileSync(reader, '#!/usr/bin/env node\n', 'utf8');
  const registrationPath = path.join(sealed.agentsHome, 'ws', 'decisions-pickup', 'registrations.json');
  fs.mkdirSync(path.dirname(registrationPath), { recursive: true });
  const entry = { repo, page: REGISTERED_PAGE, from: 'pickup-host', owner: 'decision-owner', reader };
  const write = (entries = [entry], over = {}) => fs.writeFileSync(
    registrationPath, JSON.stringify({ version: 1, entries, ...over }), 'utf8',
  );
  write();
  return { ...sealed, repo, reader, entry, registrationPath, write, cleanup: sealed.cleanup };
}

function privateFile(fx, receipt, ref = receipt.privateCaptureRef) {
  return path.join(fx.agentsHome, 'ws', 'decisions-pickup', ...ref.split('/'));
}

function allFileText(root) {
  const chunks = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) chunks.push(fs.readFileSync(full).toString('utf8'));
    }
  };
  visit(root);
  return chunks.join('\n');
}

function installLegacyReceipt(fx, state = 'RECORDED') {
  const project = fs.realpathSync(fx.repo);
  const paths = receiptPaths({ agentsHome: fx.agentsHome, project, page: fx.options.page });
  const digest = crypto.createHash('sha256').update(Buffer.from(PAGE, 'utf8')).digest('hex');
  const capturePath = `docs/notes/decisions-pickup-${paths.projectScope}-r1.json`;
  const capture = {
    version: 1,
    page: 'pageregistered',
    project,
    projectScope: paths.projectScope,
    transportRepo: project,
    round: 1,
    readAt: NOW,
    owner: 'decision-owner',
    from: 'pickup-host',
    digest,
    originalEncoding: 'utf8-base64',
    originalBytes: Buffer.from(PAGE, 'utf8').toString('base64'),
    items: [],
  };
  const fullCapture = path.join(project, ...capturePath.split('/'));
  fs.mkdirSync(path.dirname(fullCapture), { recursive: true });
  fs.writeFileSync(fullCapture, `${JSON.stringify(capture, null, 2)}\n`);
  const topic = `decisions-${paths.projectScope}`;
  const noteId = `pickup-host-${topic}-1`;
  const exactSendInputs = {
    id: noteId,
    topic,
    text: 'Owner decisions pickup round 1 is ready',
    details: capturePath,
    kind: 'ASK',
    needs: 'ack',
    argv: [],
  };
  const receipt = {
    version: 1,
    page: capture.page,
    project,
    projectScope: paths.projectScope,
    transportRepo: project,
    round: 1,
    capturePath,
    captureReadAt: NOW,
    digest,
    owner: capture.owner,
    from: capture.from,
    noteId,
    exactSendInputs,
    state,
    accountingOutcome: null,
    preparedAt: NOW,
  };
  fs.mkdirSync(path.dirname(paths.receipt), { recursive: true });
  fs.writeFileSync(paths.receipt, `${JSON.stringify(receipt, null, 2)}\n`);
  return { receipt, paths, fullCapture };
}

test('production reader invokes the supplied CLI once with a bound and page id', () => {
  const calls = [];
  const output = readPageWithCli({
    reader: path.join('tools', 'notion.js'),
    page: 'page-registered',
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: PAGE, stderr: '' };
    },
  });
  assert.equal(output, PAGE);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(-2), ['read', 'page-registered']);
  assert.equal(calls[0].options.timeout, 15_000);
});

test('registered pickup validates the finite set, sorts canonically, and selects exactly one entry', async (t) => {
  const fx = registeredFixture(); t.after(fx.cleanup);
  const repo2 = fs.mkdtempSync(path.join(fx.fixtureRoot, 'aaa-project-'));
  const page2 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  fs.mkdirSync(path.join(repo2, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(repo2, '.agents', 'project.json'), JSON.stringify({ decisions_url: page2 }));
  fx.write([{ ...fx.entry }, { ...fx.entry, repo: repo2, page: page2 }]);
  const calls = [];
  const result = await runRegisteredPickup({ registrationPath: fx.registrationPath }, {
    agentsHome: fx.agentsHome,
    selectIndex: (count) => { assert.equal(count, 2); return 0; },
    pickupOnce: async (options) => { calls.push(options); return { status: 'RECORDED' }; },
  });
  assert.deepEqual(result, { code: 'PICKUP_RECORDED', ordinal: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].page, page2, 'stable canonical ordering is independent of registration order');
});

test('registered pickup maps every receipt outcome to one safe public code', async (t) => {
  const fx = registeredFixture(); t.after(fx.cleanup);
  const cases = [
    [{ status: 'DISABLED' }, 'PICKUP_DISABLED'],
    [{ status: 'UNCHANGED' }, 'PICKUP_NO_ACTION'],
    [{ status: 'NO_ACTION' }, 'PICKUP_NO_ACTION'],
    [{ status: 'IDLE' }, 'PICKUP_NO_ACTION'],
    [{ status: 'ACCOUNTED' }, 'PICKUP_NO_ACTION'],
    [{ status: 'RECORDED' }, 'PICKUP_RECORDED'],
    [{ status: 'RECORDED', receipt: {
      handoffStatus: 'PENDING_MANUAL_HANDOFF', owner: 'former-owner',
    } }, 'PICKUP_RECONCILIATION_REQUIRED'],
    [{ status: 'RECORDED', receipt: {
      handoffStatus: 'PENDING_MANUAL_HANDOFF', owner: 'decision-owner',
    } }, 'PICKUP_RECORDED'],
    [{ status: 'WAITING_OWNER' }, 'PICKUP_PENDING_OWNER'],
    [{ status: 'INVALID' }, 'PICKUP_RECONCILIATION_REQUIRED'],
    [{ status: 'NEEDS_RECONCILIATION' }, 'PICKUP_RECONCILIATION_REQUIRED'],
    [{ status: 'PENDING_MANUAL_HANDOFF' }, 'PICKUP_RECONCILIATION_REQUIRED'],
    [{ status: 'ORPHAN_CAPTURE' }, 'PICKUP_RECONCILIATION_REQUIRED'],
    [{ status: 'CAPTURE_INTENT' }, 'PICKUP_RECONCILIATION_REQUIRED'],
    [{ status: 'PREPARED' }, 'PICKUP_RECONCILIATION_REQUIRED'],
    [{ status: 'SENDING' }, 'PICKUP_RECONCILIATION_REQUIRED'],
    [{ status: 'RECORDED', manualReconciliationRequired: true }, 'PICKUP_RECONCILIATION_REQUIRED'],
    [{ status: 'UNKNOWN' }, 'PICKUP_FAILED'],
    [{ status: 'FUTURE_PRIVATE_STATE' }, 'PICKUP_FAILED'],
  ];
  for (const [pickupResult, code] of cases) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runRegisteredPickup({ registrationPath: fx.registrationPath }, {
      agentsHome: fx.agentsHome, selectIndex: () => 0, pickupOnce: async () => pickupResult,
    });
    assert.deepEqual(result, { code, ordinal: 0 });
  }
  const claimed = await runRegisteredPickup({ registrationPath: fx.registrationPath }, {
    agentsHome: fx.agentsHome, selectIndex: () => 0,
    pickupOnce: async () => { throw new PickupError('private claim path canary', 1, 'PICKUP_CLAIM_HELD'); },
  });
  assert.deepEqual(claimed, { code: 'PICKUP_CLAIM_HELD', ordinal: 0 });
});

test('registered pickup refuses an invalid full set before selection, page read, or send', async (t) => {
  const fx = registeredFixture(); t.after(fx.cleanup);
  let selections = 0;
  let pickups = 0;
  fx.write([fx.entry, { ...fx.entry, repo: fs.realpathSync(fx.repo) }]);
  const duplicate = await runRegisteredPickup({ registrationPath: fx.registrationPath }, {
    agentsHome: fx.agentsHome,
    selectIndex: () => { selections += 1; return 0; },
    pickupOnce: async () => { pickups += 1; return { status: 'RECORDED' }; },
  });
  assert.deepEqual(duplicate, { code: 'PICKUP_CONFIG_INVALID', ordinal: null });
  assert.equal(selections, 0);
  assert.equal(pickups, 0);

  fs.mkdirSync(path.join(fx.repo, '.git'));
  const gitReader = path.join(fx.repo, 'reader.mjs');
  fs.writeFileSync(gitReader, '', 'utf8');
  fx.write([{ ...fx.entry, reader: gitReader }]);
  const readerInsideGit = await runRegisteredPickup({ registrationPath: fx.registrationPath }, {
    agentsHome: fx.agentsHome, selectIndex: () => 0,
    pickupOnce: async () => { pickups += 1; return { status: 'RECORDED' }; },
  });
  assert.deepEqual(readerInsideGit, { code: 'PICKUP_CONFIG_INVALID', ordinal: null });
  assert.equal(pickups, 0);
});

test('registered pickup off switches precede registration access and missing registration is unconfigured', async (t) => {
  const fx = registeredFixture(); t.after(fx.cleanup);
  fs.rmSync(fx.registrationPath);
  assert.deepEqual(await runRegisteredPickup({ registrationPath: fx.registrationPath }, {
    agentsHome: fx.agentsHome,
  }), { code: 'PICKUP_UNCONFIGURED', ordinal: null });
  fs.writeFileSync(path.join(fx.agentsHome, 'ws-off-decisions'), '', 'utf8');
  assert.deepEqual(await runRegisteredPickup({ registrationPath: fx.registrationPath }, {
    agentsHome: fx.agentsHome,
  }), { code: 'PICKUP_DISABLED', ordinal: null });
});

test('unchecked and unchanged reads use no send and create no receipt', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  let sends = 0;
  const result = await pickupOnce(fx.options, deps(fx, {
    readPage: async () => UNCHECKED,
    send: async () => { sends += 1; },
  }));
  assert.equal(result.status, 'UNCHANGED');
  assert.equal(sends, 0);
  assert.equal(status(fx.options, { agentsHome: fx.agentsHome }).status, 'IDLE');
});

test('master and decisions switches disable --once before page, project, receipt, or transport work', async (t) => {
  for (const name of ['ws-off', 'ws-off-decisions']) {
    const fx = fixture(); t.after(fx.cleanup);
    fs.writeFileSync(path.join(fx.agentsHome, name), '', 'utf8');
    let reads = 0;
    let sends = 0;
    const result = await pickupOnce({ ...fx.options, repo: path.join(fx.repo, 'missing-project') }, deps(fx, {
      readPage: async () => { reads += 1; return PAGE; },
      send: async () => { sends += 1; return {}; },
    }));
    assert.equal(result.status, 'DISABLED', name);
    assert.equal(reads, 0, `${name}: reader must not run`);
    assert.equal(sends, 0, `${name}: sender must not run`);
    assert.equal(fs.existsSync(path.join(fx.agentsHome, 'ws', 'decisions-pickup')), false, `${name}: no receipt or claim`);
    assert.equal(fs.existsSync(path.join(fx.repo, 'docs', 'notes')), false, `${name}: no private capture`);
    assert.equal(status(fx.options, { agentsHome: fx.agentsHome }).status, 'IDLE', `${name}: status remains available`);
  }
});

test('capture crash leaves an immutable orphan that the same round reuses once', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await assert.rejects(pickupOnce(fx.options, deps(fx, {
    onTransition(state) { if (state === 'CAPTURED') throw new Error('crash after capture'); },
  })), /crash after capture/);
  assert.equal(status(fx.options, { agentsHome: fx.agentsHome }).status, 'ORPHAN_CAPTURE');
  let sends = 0;
  const result = await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  assert.equal(result.status, 'RECORDED');
  assert.equal(sends, 1);
  assert.equal(fs.readdirSync(path.join(fx.repo, 'docs', 'notes')).length, 1, 'only the sanitized pointer is durable');
  assert.equal(fs.existsSync(privateFile(fx, result.receipt)), true);
});

test('PREPARED resumes its saved id once; RECORDED retry never sends', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await assert.rejects(pickupOnce(fx.options, deps(fx, {
    onTransition(state) { if (state === 'PREPARED') throw new Error('crash prepared'); },
  })), /crash prepared/);
  const prepared = status(fx.options, { agentsHome: fx.agentsHome }).receipt;
  assert.equal(prepared.state, 'PREPARED');
  let sends = 0;
  await pickupOnce(fx.options, deps(fx, { send: async (argv) => { sends += 1; assert.ok(argv.includes(prepared.noteId)); return {}; } }));
  await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  assert.equal(sends, 1);
});

test('SENDING with absent evidence becomes UNKNOWN and stays zero-resend', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  let sends = 0;
  await assert.rejects(pickupOnce(fx.options, deps(fx, {
    onTransition(state) { if (state === 'SENDING') throw new Error('process stopped'); },
    send: async () => { sends += 1; return {}; },
  })), /process stopped/);
  assert.equal(sends, 0);
  const uncertain = await pickupOnce(fx.options, deps(fx, {
    inspectTransport: () => ({ status: 'ABSENT', matches: [], conflicts: [] }),
    send: async () => { sends += 1; return {}; },
  }));
  assert.equal(uncertain.status, 'UNKNOWN');
  await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  assert.equal(sends, 0);
});

test('send uncertainty resolves only from positive exact evidence', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const result = await pickupOnce(fx.options, deps(fx, {
    send: async () => { throw new Error('uncertain exit'); },
    inspectTransport: () => ({ status: 'MATCH', matches: ['exact'], conflicts: [] }),
  }));
  assert.equal(result.status, 'RECORDED');
  assert.equal(result.receipt.transportEvidence.status, 'MATCH');
});

test('conflicting or unreadable evidence is visible and never resent', async (t) => {
  for (const evidence of [
    { status: 'CONFLICT', matches: [], conflicts: ['wrong envelope'] },
    { status: 'UNREADABLE', error: 'denied', matches: [], conflicts: [] },
  ]) {
    const fx = fixture(); t.after(fx.cleanup);
    let sends = 0;
    const result = await pickupOnce(fx.options, deps(fx, {
      send: async () => { sends += 1; throw new Error('uncertain'); },
      inspectTransport: () => evidence,
    }));
    assert.equal(result.status, evidence.status === 'CONFLICT' ? 'NEEDS_RECONCILIATION' : 'UNKNOWN');
    await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
    assert.equal(sends, 1);
  }
});

test('transport inspection requires the exact saved envelope and detects an id conflict', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await pickupOnce(fx.options, deps(fx));
  const receipt = status(fx.options, { agentsHome: fx.agentsHome }).receipt;
  const ledger = path.join(fx.repo, 'docs', 'ledger', '2026-09-23.md');
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  const base = {
    from: receipt.from, to: receipt.owner, date: '9.23.26', time: '12:00', tz: 'NYC',
    id: receipt.noteId, kind: receipt.exactSendInputs.kind, body: receipt.exactSendInputs.text,
    details: receipt.exactSendInputs.details, needs: receipt.exactSendInputs.needs,
  };
  fs.writeFileSync(ledger, `${buildEnvelope(base)}\n`);
  assert.equal(inspectTransport(receipt, { agentsHome: fx.agentsHome }).status, 'MATCH');
  fs.appendFileSync(ledger, `${buildEnvelope({ ...base, body: 'different body' })}\n`);
  assert.equal(inspectTransport(receipt, { agentsHome: fx.agentsHome }).status, 'CONFLICT');
});

test('changed checked bytes stay in the active round and require reconciliation', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  let sends = 0;
  await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  const result = await pickupOnce(fx.options, deps(fx, {
    readPage: async () => CHANGED,
    send: async () => { sends += 1; return {}; },
  }));
  assert.equal(result.status, 'NEEDS_RECONCILIATION');
  assert.equal(result.receipt.round, 1);
  const changedCapture = JSON.parse(fs.readFileSync(privateFile(fx, result.receipt, result.receipt.reconciliationPrivateCaptureRef), 'utf8'));
  assert.equal(Buffer.from(changedCapture.originalBytes, 'base64').toString('utf8'), CHANGED);
  assert.equal(sends, 1);
});

test('C1: raw bytes differing with no new owner input keeps a RECORDED round unchanged', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  let sends = 0;
  await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  const before = status(fx.options, { agentsHome: fx.agentsHome });
  const captureBefore = fs.readFileSync(privateFile(fx, before.receipt), 'utf8');
  const result = await pickupOnce(fx.options, deps(fx, {
    readPage: async () => BYTE_ONLY_CHANGE,
    send: async () => { sends += 1; return {}; },
  }));
  assert.equal(result.status, 'RECORDED');
  assert.equal(result.receipt.round, 1);
  assert.equal(result.receipt.digest, before.receipt.digest, 'the saved receipt is untouched, not rewritten');
  assert.equal(fs.readFileSync(privateFile(fx, before.receipt), 'utf8'), captureBefore, 'no reconciliation capture is written');
  assert.equal(sends, 1, 'no new send for a non-change');

  // Fewer owner inputs than the capture (the lead acted on the comment) is also not a change.
  const subset = await pickupOnce(fx.options, deps(fx, {
    readPage: async () => SUBSET_CHANGE,
    send: async () => { sends += 1; return {}; },
  }));
  assert.equal(subset.status, 'RECORDED');
  assert.equal(sends, 1, 'a sub-multiset fresh read never sends again');

  // Spec P1.5: the whole decision moved under `# Closed` between rounds is a byte change with
  // identical captured triples, so it is not a change either.
  const closedMove = await pickupOnce(fx.options, deps(fx, {
    readPage: async () => CLOSED_MOVE,
    send: async () => { sends += 1; return {}; },
  }));
  assert.equal(closedMove.status, 'RECORDED', 'a decision moved verbatim under # Closed is not a change');
  assert.equal(sends, 1, 'no new send for the Closed-move fixture');
});

test('C1: a new owner comment is a change and still requires reconciliation', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  let sends = 0;
  await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  const result = await pickupOnce(fx.options, deps(fx, {
    readPage: async () => NEW_COMMENT,
    send: async () => { sends += 1; return {}; },
  }));
  assert.equal(result.status, 'NEEDS_RECONCILIATION');
  assert.equal(result.receipt.round, 1);
  assert.equal(sends, 1);
});

test('ownerInputs drops line/ref/replied and keeps kind, title, and text', () => {
  const items = [
    { ref: 'selection-001', kind: 'selection', title: 'Choose transport', text: 'Keep the existing transport', line: 12 },
    { ref: 'comment-001', kind: 'comment', title: 'Choose transport', text: 'Please preserve the capture', line: 14, replied: true },
  ];
  assert.deepEqual(ownerInputs(items), [
    ['selection', 'Choose transport', 'Keep the existing transport'],
    ['comment', 'Choose transport', 'Please preserve the capture'],
  ]);
});

test('C1 multiset: a third identical comment, a swapped tick, and a renamed title are changes; equal counts are not', async (t) => {
  const TWO_SAME = PAGE.replace('\\*\\*Please preserve the capture', '\\*\\*Please preserve the capture\n\\*\\*Please preserve the capture');
  const THREE_SAME = PAGE.replace('\\*\\*Please preserve the capture', '\\*\\*Please preserve the capture\n\\*\\*Please preserve the capture\n\\*\\*Please preserve the capture');
  const SWAPPED = PAGE.replace('- [x] Keep the existing transport', '- [ ] Keep the existing transport\n- [x] Switch transport');
  const RENAMED = PAGE.replace('<summary>Choose transport</summary>', '<summary>Choose the transport</summary>');
  for (const [name, first, second, expected] of [
    ['three identical comments against two', TWO_SAME, THREE_SAME, 'NEEDS_RECONCILIATION'],
    ['two identical comments, byte-only edit', TWO_SAME, TWO_SAME.replace('- [x] Done', '- a closed bullet\n- [x] Done'), 'RECORDED'],
    ['one tick removed and a different one added', PAGE, SWAPPED, 'NEEDS_RECONCILIATION'],
    ['decision title renamed under a live input', PAGE, RENAMED, 'NEEDS_RECONCILIATION'],
  ]) {
    const fx = fixture(); t.after(fx.cleanup);
    assert.equal((await pickupOnce(fx.options, deps(fx, { readPage: async () => first }))).status, 'RECORDED', name);
    assert.equal((await pickupOnce(fx.options, deps(fx, { readPage: async () => second }))).status, expected, name);
  }
});

test('a stuck NEEDS_RECONCILIATION round is accountable from receipt-evidenced provenance, either previousState', async (t) => {
  // This is the live shape a round reaches when the old byte check re-applied `changedReceipt` on
  // an already-NR receipt: `previousState` gets clobbered to NEEDS_RECONCILIATION, so provenance
  // must come from the receipt's own recordedAt/transportResult evidence, not from previousState.
  for (const previousState of ['RECORDED', 'NEEDS_RECONCILIATION']) {
    const fx = fixture(); t.after(fx.cleanup);
    const recorded = await pickupOnce(fx.options, deps(fx, { send: async () => ({}) }));
    assert.equal(recorded.status, 'RECORDED', previousState);
    const paths = receiptPaths({ agentsHome: fx.agentsHome, project: fs.realpathSync(fx.repo), page: fx.options.page });
    const receipt = JSON.parse(fs.readFileSync(paths.receipt, 'utf8'));
    const originalCapture = JSON.parse(fs.readFileSync(privateFile(fx, receipt), 'utf8'));
    const observedDigest = crypto.createHash('sha256').update(Buffer.from(BYTE_ONLY_CHANGE, 'utf8')).digest('hex');
    const ref = `captures/${receipt.projectScope}/r1-changed-${observedDigest}.json`;
    const reconCapture = {
      ...originalCapture,
      digest: observedDigest,
      originalBytes: Buffer.from(BYTE_ONLY_CHANGE, 'utf8').toString('base64'),
    };
    const reconPath = privateFile(fx, receipt, ref);
    fs.mkdirSync(path.dirname(reconPath), { recursive: true });
    fs.writeFileSync(reconPath, `${JSON.stringify(reconCapture, null, 2)}\n`);
    const stuck = {
      ...receipt,
      previousState,
      state: 'NEEDS_RECONCILIATION',
      reconciliationReason: 'checked page bytes changed during the active round',
      observedDigest,
      reconciliationPrivateCaptureRef: ref,
      observedAt: NOW,
    };
    fs.writeFileSync(paths.receipt, `${JSON.stringify(stuck, null, 2)}\n`);

    const report = path.join(fx.repo, `outcome-${previousState}.md`);
    fs.writeFileSync(report, 'Owner-attestation: decision-owner\nFresh-page-reconciliation: reconciled by hand\nAccounted-ref: selection-001 applied\nAccounted-ref: comment-001 answered\n');
    const result = account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW });
    assert.equal(result.status, 'ACCOUNTED', previousState);
    assert.equal(result.receipt.accountedFrom, 'NEEDS_RECONCILIATION', previousState);
    assert.equal(result.receipt.accountingOutcome.ownerAttested, true, previousState);
  }
});

test('a stuck NEEDS_RECONCILIATION round with a genuinely different reconciliation input is refused', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await pickupOnce(fx.options, deps(fx));
  const captured = await pickupOnce(fx.options, deps(fx, { readPage: async () => NEW_COMMENT }));
  assert.equal(captured.status, 'NEEDS_RECONCILIATION');
  assert.equal(captured.receipt.reconciliationReason, 'checked page bytes changed during the active round');
  assert.equal(captured.receipt.previousState, 'RECORDED');
  const report = path.join(fx.repo, 'outcome.md');
  fs.writeFileSync(report, 'Owner-attestation: decision-owner\nFresh-page-reconciliation: reconciled by hand\nAccounted-ref: selection-001 applied\nAccounted-ref: comment-001 answered\n');
  assert.throws(
    () => account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW }),
    /cannot account a round outside RECORDED/,
  );
});

test('C1 stuck path derives reconciliation inputs from verified bytes, never the saved items field', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const recorded = await pickupOnce(fx.options, deps(fx, { send: async () => ({}) }));
  assert.equal(recorded.status, 'RECORDED');
  const paths = receiptPaths({ agentsHome: fx.agentsHome, project: fs.realpathSync(fx.repo), page: fx.options.page });
  const receipt = JSON.parse(fs.readFileSync(paths.receipt, 'utf8'));
  const originalCapture = JSON.parse(fs.readFileSync(privateFile(fx, receipt), 'utf8'));
  // The reconciliation bytes carry a genuine new owner comment; only the saved `items` field claims
  // otherwise. The digest matches the bytes, so the capture verifies; a reader trusting `items`
  // would wrongly account this round.
  const observedDigest = crypto.createHash('sha256').update(Buffer.from(NEW_COMMENT, 'utf8')).digest('hex');
  const ref = `captures/${receipt.projectScope}/r1-changed-${observedDigest}.json`;
  const reconPath = privateFile(fx, receipt, ref);
  fs.mkdirSync(path.dirname(reconPath), { recursive: true });
  fs.writeFileSync(reconPath, `${JSON.stringify({
    ...originalCapture,
    digest: observedDigest,
    originalBytes: Buffer.from(NEW_COMMENT, 'utf8').toString('base64'),
    items: originalCapture.items,
  }, null, 2)}\n`);
  fs.writeFileSync(paths.receipt, `${JSON.stringify({
    ...receipt,
    previousState: 'NEEDS_RECONCILIATION',
    state: 'NEEDS_RECONCILIATION',
    reconciliationReason: 'checked page bytes changed during the active round',
    observedDigest,
    reconciliationPrivateCaptureRef: ref,
    observedAt: NOW,
  }, null, 2)}\n`);
  const report = path.join(fx.repo, 'outcome.md');
  fs.writeFileSync(report, 'Owner-attestation: decision-owner\nFresh-page-reconciliation: reconciled by hand\nAccounted-ref: selection-001 applied\nAccounted-ref: comment-001 answered\nAccounted-ref: comment-002 answered\n');
  assert.throws(
    () => account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW }),
    /cannot account a round outside RECORDED/,
  );
});

test('uncertain-delivery provenance is never accepted by the stuck-round account path, even with sub-multiset inputs', async (t) => {
  // The realistic uncertain-delivery shape: SENDING -> UNKNOWN, then a byte-only page change during
  // the active round gives NEEDS_RECONCILIATION with previousState UNKNOWN, uncertainAt set, and no
  // recordedAt. The sub-multiset clause alone must not be enough to account it — only provenance
  // (reachedRecorded) and the reconciliation-reason gate can refuse it.
  const fx = fixture(); t.after(fx.cleanup);
  const recorded = await pickupOnce(fx.options, deps(fx, { send: async () => ({}) }));
  assert.equal(recorded.status, 'RECORDED');
  const paths = receiptPaths({ agentsHome: fx.agentsHome, project: fs.realpathSync(fx.repo), page: fx.options.page });
  const receipt = JSON.parse(fs.readFileSync(paths.receipt, 'utf8'));
  const originalCapture = JSON.parse(fs.readFileSync(privateFile(fx, receipt), 'utf8'));
  const observedDigest = crypto.createHash('sha256').update(Buffer.from(BYTE_ONLY_CHANGE, 'utf8')).digest('hex');
  const ref = `captures/${receipt.projectScope}/r1-changed-${observedDigest}.json`;
  const reconCapture = {
    ...originalCapture,
    digest: observedDigest,
    originalBytes: Buffer.from(BYTE_ONLY_CHANGE, 'utf8').toString('base64'),
  };
  const reconPath = privateFile(fx, receipt, ref);
  fs.mkdirSync(path.dirname(reconPath), { recursive: true });
  fs.writeFileSync(reconPath, `${JSON.stringify(reconCapture, null, 2)}\n`);

  const { recordedAt, transportResult, ...receiptWithoutRecordedAtAndTransportResult } = receipt;
  const uncertain = {
    ...receiptWithoutRecordedAtAndTransportResult,
    state: 'NEEDS_RECONCILIATION',
    previousState: 'UNKNOWN',
    uncertainAt: NOW,
    reconciliationReason: 'checked page bytes changed during the active round',
    observedDigest,
    reconciliationPrivateCaptureRef: ref,
  };
  fs.writeFileSync(paths.receipt, `${JSON.stringify(uncertain, null, 2)}\n`);
  const report = path.join(fx.repo, 'outcome.md');
  fs.writeFileSync(report, 'Owner-attestation: decision-owner\nFresh-page-reconciliation: reconciled by hand\nAccounted-ref: selection-001 applied\nAccounted-ref: comment-001 answered\n');
  assert.throws(
    () => account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW }),
    /cannot account a round outside RECORDED/,
  );

  // Same live-shaped RECORDED provenance (recordedAt + transportResult intact), but a different
  // reconciliationReason: the reason gate alone must also refuse it.
  const wrongReason = {
    ...receipt,
    state: 'NEEDS_RECONCILIATION',
    previousState: 'RECORDED',
    reconciliationReason: 'the saved note id exists with conflicting envelope fields',
    observedDigest,
    reconciliationPrivateCaptureRef: ref,
  };
  fs.writeFileSync(paths.receipt, `${JSON.stringify(wrongReason, null, 2)}\n`);
  assert.throws(
    () => account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW }),
    /cannot account a round outside RECORDED/,
  );

  // Isolates the provenance gate itself from the previousState gate: previousState and reason both
  // read as an accountable stuck round, and the reconciliation inputs are a true sub-multiset, but
  // recordedAt (and transportResult/transportEvidence) never got set, so the round never actually
  // reached RECORDED. A mutant that drops the recordedAt/transport-evidence check would wrongly
  // account this; only the provenance gate refuses it.
  const neverRecorded = {
    ...receiptWithoutRecordedAtAndTransportResult,
    state: 'NEEDS_RECONCILIATION',
    previousState: 'RECORDED',
    reconciliationReason: 'checked page bytes changed during the active round',
    observedDigest,
    reconciliationPrivateCaptureRef: ref,
  };
  fs.writeFileSync(paths.receipt, `${JSON.stringify(neverRecorded, null, 2)}\n`);
  assert.throws(
    () => account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW }),
    /cannot account a round outside RECORDED/,
  );
});

test('C1 at the CAPTURE_INTENT branch: byte-only bytes stay an orphan capture, a real owner input reconciles', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const recorded = await pickupOnce(fx.options, deps(fx, { send: async () => ({}) }));
  assert.equal(recorded.status, 'RECORDED');
  const paths = receiptPaths({ agentsHome: fx.agentsHome, project: fs.realpathSync(fx.repo), page: fx.options.page });
  const receiptText = fs.readFileSync(paths.receipt, 'utf8');
  const receipt = JSON.parse(receiptText);
  // The capture and pointer from the RECORDED round already exist, so this shape's evidence verifies.
  const intent = { ...receipt, state: 'CAPTURE_INTENT' };
  fs.writeFileSync(paths.receipt, `${JSON.stringify(intent, null, 2)}\n`);
  const capturesDir = path.join(fx.agentsHome, 'ws', 'decisions-pickup', 'captures');
  const changedFilesBefore = fs.readdirSync(capturesDir, { recursive: true }).filter((entry) => String(entry).includes('-changed-'));
  assert.equal(changedFilesBefore.length, 0);

  const byteOnly = await pickupOnce(fx.options, deps(fx, { readPage: async () => BYTE_ONLY_CHANGE }));
  assert.equal(byteOnly.status, 'ORPHAN_CAPTURE');
  assert.equal(fs.readFileSync(paths.receipt, 'utf8'), `${JSON.stringify(intent, null, 2)}\n`, 'the receipt file is not rewritten');
  const changedFilesAfter = fs.readdirSync(capturesDir, { recursive: true }).filter((entry) => String(entry).includes('-changed-'));
  assert.equal(changedFilesAfter.length, 0, 'no reconciliation capture is written for a non-change at CAPTURE_INTENT');

  const withComment = await pickupOnce(fx.options, deps(fx, { readPage: async () => NEW_COMMENT }));
  assert.equal(withComment.status, 'NEEDS_RECONCILIATION');
  assert.equal(withComment.receipt.reconciliationReason, 'checked page bytes changed during the active round');
});

test('the CLI runs identically through a symlink to the script', (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const real = path.join(here, 'decisions-pickup.mjs');
  const link = path.join(fx.fixtureRoot, 'decisions-pickup-link.mjs');
  try {
    fs.symlinkSync(real, link, 'file');
  } catch (error) {
    if (error && (error.code === 'EPERM' || error.code === 'EACCES')) {
      t.skip(`symlinks not permitted on this machine (${error.code})`);
      return;
    }
    throw error;
  }
  const reader = path.join(fx.fixtureRoot, 'symlink-reader.mjs');
  fs.writeFileSync(reader, "process.stdout.write('# Group {toggle=\"true\"}\\n');\n");
  const child = spawnSync(process.execPath, [
    link, '--once', '--repo', fx.repo, '--page', fx.options.page, '--from', fx.options.from,
    '--reader', reader,
  ], {
    encoding: 'utf8', timeout: 15_000, windowsHide: true,
    env: childEnv(fx.fixtureRoot, { AGENTS_HOME: fx.agentsHome }),
  });
  assert.equal(child.error, undefined, String(child.error?.message ?? ''));
  assert.equal(child.status, 0, `exit=${child.status}; stderr=${child.stderr}`);
  const parsed = JSON.parse(child.stdout);
  assert.equal(parsed.status, 'UNCHANGED');
});

test('changed checked bytes after accounting still reconcile until unchecked is observed', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  let sends = 0;
  await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  const report = path.join(fx.repo, 'outcome.md');
  fs.writeFileSync(report, 'Owner-attestation: decision-owner\nFresh-page-reconciliation: fresh and checked\nAccounted-ref: selection-001 applied\nAccounted-ref: comment-001 answered\n');
  account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW });
  const changed = await pickupOnce(fx.options, deps(fx, {
    readPage: async () => CHANGED,
    send: async () => { sends += 1; return {}; },
  }));
  assert.equal(changed.status, 'NEEDS_RECONCILIATION');
  assert.equal(changed.receipt.round, 1);
  assert.equal(sends, 1);
});

test('missing owner waits, then binds the same round once; replacement stays manual', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  let sends = 0;
  const waiting = await pickupOnce({ ...fx.options, owner: undefined }, deps(fx, { send: async () => { sends += 1; } }));
  assert.equal(waiting.status, 'WAITING_OWNER');
  const bound = await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  assert.equal(bound.status, 'RECORDED');
  assert.equal(bound.receipt.round, 1);
  const handoff = await pickupOnce({ ...fx.options, owner: 'replacement-owner' }, deps(fx, {
    send: async () => { sends += 1; return {}; },
  }));
  assert.equal(handoff.receipt.handoffStatus, 'PENDING_MANUAL_HANDOFF');
  assert.equal(handoff.receipt.state, 'RECORDED');
  assert.equal(sends, 1);
});

test('account requires explicit owner, reconciliation, and every captured ref', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await pickupOnce(fx.options, deps(fx));
  const report = path.join(fx.repo, 'outcome.md');
  fs.writeFileSync(report, 'Owner-attestation: decision-owner\nFresh-page-reconciliation: checked current page\nAccounted-ref: selection-001 applied\n');
  assert.throws(() => account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW }), /comment-001/);
  fs.appendFileSync(report, 'Accounted-ref: comment-001 answered\n');
  const result = account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW });
  assert.equal(result.status, 'ACCOUNTED');
  assert.equal(result.receipt.accountingOutcome.ownerAttested, true);
  assert.equal(Object.hasOwn(result.receipt, 'accountedFrom'), false, 'a normal RECORDED account never carries accountedFrom');
});

test('account derives required refs from immutable bytes, not mutable receipt metadata', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await pickupOnce(fx.options, deps(fx));
  const paths = receiptPaths({ agentsHome: fx.agentsHome, project: fx.repo, page: fx.options.page });
  const receipt = JSON.parse(fs.readFileSync(paths.receipt, 'utf8'));
  receipt.capturedItems = [];
  fs.writeFileSync(paths.receipt, JSON.stringify(receipt));
  const report = path.join(fx.repo, 'empty-outcome.md');
  fs.writeFileSync(report, 'Owner-attestation: decision-owner\nFresh-page-reconciliation: fresh read\n');
  assert.throws(() => account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW }), /selection-001.*comment-001/);
});

test('capture digest is enforced before recovery or accounting', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  let sends = 0;
  await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  const saved = status(fx.options, { agentsHome: fx.agentsHome }).receipt;
  const capture = privateFile(fx, saved);
  fs.appendFileSync(capture, 'tampered');
  const visible = status(fx.options, { agentsHome: fx.agentsHome });
  assert.equal(visible.status, 'NEEDS_RECONCILIATION');
  await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  assert.equal(sends, 1);
});

test('ACCOUNTED requires an observed unchecked page before one new checked round', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  let sends = 0;
  await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  const report = path.join(fx.repo, 'outcome.md');
  fs.writeFileSync(report, 'Owner-attestation: decision-owner\nFresh-page-reconciliation: fresh and checked\nAccounted-ref: selection-001 applied\nAccounted-ref: comment-001 answered\n');
  account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW });
  const missing = await pickupOnce(fx.options, deps(fx, { readPage: async () => '# Group {toggle="true"}\n' }));
  assert.equal(missing.receipt.observedUncheckedAt, null, 'missing Done is not an observed unchecked episode');
  await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  assert.equal(sends, 1, 'a still-checked page cannot become round 2');
  await pickupOnce(fx.options, deps(fx, { readPage: async () => UNCHECKED }));
  const second = await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  assert.equal(second.receipt.round, 2);
  assert.equal(sends, 2);
});

test('one page is globally bound to one authorization project and second binding sends zero', async (t) => {
  const sealed = makeTempHome(); t.after(sealed.cleanup);
  const makeProject = (name) => {
    const repo = path.join(sealed.fixtureRoot, name);
    fs.mkdirSync(path.join(repo, '.agents'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.agents', 'project.json'), JSON.stringify({ decisions_url: 'shared-page' }));
    return { repo, page: 'shared-page', from: 'pickup-host', owner: 'decision-owner', reader: 'synthetic-reader.js' };
  };
  const first = makeProject('first');
  const second = makeProject('second');
  let sends = 0;
  let secondReads = 0;
  await pickupOnce(first, {
    agentsHome: sealed.agentsHome, readPage: async () => PAGE,
    send: async () => { sends += 1; return {}; },
  });
  const rejected = await pickupOnce(second, {
    agentsHome: sealed.agentsHome,
    readPage: async () => { secondReads += 1; return PAGE; },
    send: async () => { sends += 1; return {}; },
  });
  assert.equal(rejected.status, 'PENDING_MANUAL_HANDOFF');
  assert.equal(rejected.boundProject, fs.realpathSync(first.repo));
  assert.equal(secondReads, 0);
  assert.equal(sends, 1);
});

test('CAPTURED interruption keeps the global project binding and A resumes original round', async (t) => {
  const sealed = makeTempHome(); t.after(sealed.cleanup);
  const makeProject = (name) => {
    const repo = path.join(sealed.fixtureRoot, name);
    fs.mkdirSync(path.join(repo, '.agents'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.agents', 'project.json'), JSON.stringify({ decisions_url: 'shared-page' }));
    return { repo, page: 'shared-page', from: 'pickup-host', owner: 'decision-owner', reader: 'synthetic-reader.js' };
  };
  const a = makeProject('capture-a');
  const b = makeProject('capture-b');
  await assert.rejects(pickupOnce(a, {
    agentsHome: sealed.agentsHome,
    readPage: async () => PAGE,
    send: async () => { throw new Error('send must not start before CAPTURED interruption'); },
    onTransition(state) { if (state === 'CAPTURED') throw new Error('captured interruption'); },
  }), /captured interruption/);
  assert.equal(status(a, { agentsHome: sealed.agentsHome }).status, 'ORPHAN_CAPTURE');
  assert.equal(status(b, { agentsHome: sealed.agentsHome }).status, 'PENDING_MANUAL_HANDOFF');
  let bReads = 0;
  let sends = 0;
  const refused = await pickupOnce(b, {
    agentsHome: sealed.agentsHome,
    readPage: async () => { bReads += 1; return PAGE; },
    send: async () => { sends += 1; return {}; },
  });
  assert.equal(refused.status, 'PENDING_MANUAL_HANDOFF');
  assert.equal(bReads, 0);
  assert.throws(() => account({ ...b, outcome: path.join(b.repo, 'unused.md') }, { agentsHome: sealed.agentsHome }), /bound to another authorization project/);
  const resumed = await pickupOnce(a, {
    agentsHome: sealed.agentsHome,
    readPage: async () => PAGE,
    send: async () => { sends += 1; return {}; },
  });
  assert.equal(resumed.status, 'RECORDED');
  assert.equal(resumed.receipt.round, 1);
  assert.equal(sends, 1);
});

test('missing capture intent resumes safely; partial capture reconciles without send', async (t) => {
  const missing = fixture(); t.after(missing.cleanup);
  await assert.rejects(pickupOnce(missing.options, deps(missing, {
    onTransition(state) { if (state === 'CAPTURE_INTENT') throw new Error('intent interruption'); },
  })), /intent interruption/);
  assert.equal(status(missing.options, { agentsHome: missing.agentsHome }).status, 'NEEDS_RECONCILIATION');
  let missingSends = 0;
  const resumed = await pickupOnce(missing.options, deps(missing, {
    send: async () => { missingSends += 1; return {}; },
  }));
  assert.equal(resumed.status, 'RECORDED');
  assert.equal(resumed.receipt.round, 1);
  assert.equal(missingSends, 1);

  const partial = fixture(); t.after(partial.cleanup);
  await assert.rejects(pickupOnce(partial.options, deps(partial, {
    onTransition(state) { if (state === 'CAPTURE_INTENT') throw new Error('intent interruption'); },
  })), /intent interruption/);
  const saved = status(partial.options, { agentsHome: partial.agentsHome }).receipt;
  const capture = privateFile(partial, saved);
  fs.mkdirSync(path.dirname(capture), { recursive: true });
  fs.writeFileSync(capture, '{partial');
  let partialSends = 0;
  const reconciled = await pickupOnce(partial.options, deps(partial, {
    send: async () => { partialSends += 1; return {}; },
  }));
  assert.equal(reconciled.status, 'NEEDS_RECONCILIATION');
  assert.equal(partialSends, 0);
});

test('Details uses the durable main checkout while capture stays in private AGENTS_HOME', async (t) => {
  const sealed = makeTempHome(); t.after(sealed.cleanup);
  const worktree = path.join(sealed.fixtureRoot, 'worktree');
  const main = path.join(sealed.fixtureRoot, 'main');
  fs.mkdirSync(path.join(worktree, '.agents'), { recursive: true });
  fs.mkdirSync(main, { recursive: true });
  fs.writeFileSync(path.join(worktree, '.agents', 'project.json'), JSON.stringify({ decisions_url: 'page-main' }));
  const git = () => path.join(main, '.git');
  const options = { repo: worktree, page: 'page-main', from: 'pickup-host', owner: 'decision-owner', reader: 'synthetic-reader.js' };
  const result = await pickupOnce(options, {
    agentsHome: sealed.agentsHome,
    env: sealed.env,
    git,
    readPage: async () => PAGE,
    send: (argv) => runNoteSend(argv, { git, home: sealed.home, env: sealed.env }),
  });
  assert.equal(result.status, 'RECORDED');
  assert.equal(result.receipt.transportRepo, fs.realpathSync(main));
  assert.equal(fs.existsSync(path.join(main, ...result.receipt.detailsPath.split('/'))), true);
  assert.equal(fs.existsSync(privateFile(sealed, result.receipt)), true);
  assert.equal(fs.existsSync(path.join(main, ...result.receipt.privateCaptureRef.split('/'))), false);
  assert.equal(fs.existsSync(path.join(worktree, ...result.receipt.detailsPath.split('/'))), false);
  assert.equal(fs.existsSync(path.join(main, 'docs', 'ledger')), true);
});

test('exclusive per-page claim rejects concurrency and is never stale-broken', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const first = pickupOnce(fx.options, deps(fx, {
    readPage: async () => { entered(); await blocked; return PAGE; },
  }));
  await started;
  await assert.rejects(pickupOnce(fx.options, deps(fx)), /exclusive pickup claim/);
  assert.equal(status(fx.options, { agentsHome: fx.agentsHome }).claimed, true);
  release();
  await first;
});

test('a crash after RECORDED persistence cannot cause a repeated send', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  let sends = 0;
  await assert.rejects(pickupOnce(fx.options, deps(fx, {
    send: async () => { sends += 1; return {}; },
    onTransition(state) { if (state === 'RECORDED') throw new Error('crash recorded'); },
  })), /crash recorded/);
  assert.equal(status(fx.options, { agentsHome: fx.agentsHome }).status, 'RECORDED');
  await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  assert.equal(sends, 1);
});


test('every dispatch verifies original capture bytes and round before sending', async (t) => {
  for (const mode of ['first-admission', 'intent-resume']) {
    for (const corruption of ['originalBytes', 'round']) {
      const fx = fixture(); t.after(fx.cleanup);
      const corrupt = () => {
        const receipt = status(fx.options, { agentsHome: fx.agentsHome }).receipt;
        const file = privateFile(fx, receipt);
        const capture = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (corruption === 'originalBytes') capture.originalBytes = Buffer.from('different human content').toString('base64');
        else capture.round += 1;
        fs.writeFileSync(file, JSON.stringify(capture));
      };
      if (mode === 'intent-resume') {
        await assert.rejects(pickupOnce(fx.options, deps(fx, {
          onTransition(state) { if (state === 'CAPTURED') throw new Error('interrupted capture'); },
        })), /interrupted capture/);
        corrupt();
      }
      let sends = 0; const transitions = [];
      const result = await pickupOnce(fx.options, deps(fx, {
        send: async () => { sends += 1; return {}; },
        onTransition(state) {
          transitions.push(state);
          if (mode === 'first-admission' && state === 'CAPTURED') corrupt();
        },
      }));
      assert.equal(result.status, 'NEEDS_RECONCILIATION');
      assert.equal(sends, 0, mode + '/' + corruption);
      assert.equal(transitions.includes('SENDING'), false);
      assert.equal(result.receipt.state, 'NEEDS_RECONCILIATION');
      await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
      assert.equal(sends, 0);
    }
  }
});

test('raw initial and changed page bytes stay out of the project checkout and public packet', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const firstCanary = 'PRIVATE-INITIAL-CANARY-88411';
  const changedCanary = 'PRIVATE-CHANGED-CANARY-99217';
  const first = PAGE.replace('Please preserve the capture', firstCanary);
  const changed = first.replace(firstCanary, changedCanary);
  const git = () => path.join(fx.repo, '.git');
  const send = (argv) => runNoteSend(argv, { git, home: fx.home, env: fx.env });
  const result = await pickupOnce(fx.options, deps(fx, { git, readPage: async () => first, send }));
  const reconciled = await pickupOnce(fx.options, deps(fx, { git, readPage: async () => changed, send }));
  assert.equal(result.status, 'RECORDED');
  assert.equal(reconciled.status, 'NEEDS_RECONCILIATION');
  const publicBytes = allFileText(fx.repo);
  for (const secret of [firstCanary, changedCanary, Buffer.from(first, 'utf8').toString('base64'), Buffer.from(changed, 'utf8').toString('base64')]) {
    assert.equal(publicBytes.includes(secret), false);
    assert.equal(JSON.stringify(result.receipt.exactSendInputs).includes(secret), false);
  }
  assert.equal(fs.readFileSync(privateFile(fx, result.receipt), 'utf8').includes(Buffer.from(first, 'utf8').toString('base64')), true);
  assert.equal(fs.readFileSync(privateFile(fx, reconciled.receipt, reconciled.receipt.reconciliationPrivateCaptureRef), 'utf8')
    .includes(Buffer.from(changed, 'utf8').toString('base64')), true);
  const pointer = JSON.parse(fs.readFileSync(path.join(fx.repo, ...result.receipt.detailsPath.split('/')), 'utf8'));
  assert.deepEqual(Object.keys(pointer).sort(), [
    'availability', 'captureIdentity', 'digest', 'open', 'privateCaptureRef', 'projectScope', 'round', 'type', 'version',
  ]);
  assert.equal(pointer.type, 'decisions-pickup-private-pointer');
});

test('private store refuses project-local, unrelated Git-root, symlink, and traversal targets before reading', async (t) => {
  const cases = [];
  {
    const fx = fixture(); t.after(fx.cleanup);
    cases.push({ fx, agentsHome: path.join(fx.repo, '.private-agents') });
  }
  {
    const fx = fixture(); t.after(fx.cleanup);
    const gitContainer = path.join(fx.fixtureRoot, 'other-git-root');
    fs.mkdirSync(path.join(gitContainer, '.git'), { recursive: true });
    cases.push({ fx, agentsHome: path.join(gitContainer, 'private-agents') });
  }
  {
    const fx = fixture(); t.after(fx.cleanup);
    const pickupRoot = path.join(fx.agentsHome, 'ws', 'decisions-pickup');
    fs.mkdirSync(pickupRoot, { recursive: true });
    fs.symlinkSync(fx.repo, path.join(pickupRoot, 'captures'), 'junction');
    cases.push({ fx, agentsHome: fx.agentsHome });
  }
  for (const { fx, agentsHome } of cases) {
    let reads = 0;
    await assert.rejects(pickupOnce(fx.options, deps(fx, {
      agentsHome,
      readPage: async () => { reads += 1; return PAGE; },
    })), /PRIVATE_CAPTURE_UNSAFE|escapes the private store/);
    assert.equal(reads, 0);
  }

  const fx = fixture(); t.after(fx.cleanup);
  await pickupOnce(fx.options, deps(fx));
  const paths = receiptPaths({ agentsHome: fx.agentsHome, project: fs.realpathSync(fx.repo), page: fx.options.page });
  const receipt = JSON.parse(fs.readFileSync(paths.receipt, 'utf8'));
  receipt.privateCaptureRef = '../outside.json';
  fs.writeFileSync(paths.receipt, JSON.stringify(receipt));
  assert.equal(status(fx.options, { agentsHome: fx.agentsHome }).status, 'NEEDS_RECONCILIATION');
});

test('same-host open returns only the exact verified saved bytes and missing evidence is unavailable', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const result = await pickupOnce(fx.options, deps(fx));
  assert.equal(openPrivateCapture({ ...fx.options, round: '1' }, { agentsHome: fx.agentsHome }).toString('utf8'), PAGE);
  assert.throws(() => openPrivateCapture({ ...fx.options, round: '2' }, { agentsHome: fx.agentsHome }), /PRIVATE_CAPTURE_UNAVAILABLE/);
  fs.unlinkSync(privateFile(fx, result.receipt));
  assert.throws(() => openPrivateCapture({ ...fx.options, round: '1' }, { agentsHome: fx.agentsHome }), /PRIVATE_CAPTURE_UNAVAILABLE/);
});

test('pointer identity is verified before any page read or dispatch', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await assert.rejects(pickupOnce(fx.options, deps(fx, {
    onTransition(state) { if (state === 'PREPARED') throw new Error('prepared stop'); },
  })), /prepared stop/);
  const saved = status(fx.options, { agentsHome: fx.agentsHome }).receipt;
  const pointerPath = path.join(fx.repo, ...saved.detailsPath.split('/'));
  const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8'));
  fs.writeFileSync(pointerPath, JSON.stringify({ ...pointer, round: 99 }));
  let reads = 0; let sends = 0;
  const blocked = await pickupOnce(fx.options, deps(fx, {
    readPage: async () => { reads += 1; return PAGE; },
    send: async () => { sends += 1; return {}; },
  }));
  assert.equal(blocked.status, 'NEEDS_RECONCILIATION');
  assert.equal(reads, 0);
  assert.equal(sends, 0);
});

test('crash after pointer write resumes the same intent and sends once', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await assert.rejects(pickupOnce(fx.options, deps(fx, {
    onTransition(state) { if (state === 'POINTER_WRITTEN') throw new Error('pointer stop'); },
  })), /pointer stop/);
  const interrupted = status(fx.options, { agentsHome: fx.agentsHome });
  assert.equal(interrupted.status, 'ORPHAN_CAPTURE');
  let sends = 0;
  const resumed = await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  assert.equal(resumed.status, 'RECORDED');
  assert.equal(resumed.receipt.round, 1);
  assert.equal(sends, 1);
});

test('fresh valid checked page with zero captured items is NO_ACTION with no persistent artifact', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  let sends = 0;
  const result = await pickupOnce(fx.options, deps(fx, {
    readPage: async () => EMPTY_DONE,
    send: async () => { sends += 1; return {}; },
  }));
  assert.deepEqual(result, { status: 'NO_ACTION', done: true, sent: false });
  assert.equal(sends, 0);
  assert.equal(fs.existsSync(path.join(fx.agentsHome, 'ws', 'decisions-pickup')), false);
  assert.equal(fs.existsSync(path.join(fx.repo, 'docs', 'notes')), false);
});

test('comments-only and selections-only checked pages still admit a round', async (t) => {
  for (const page of [
    EMPTY_DONE.replace('- [x] Done', '\\*\\*Owner comment only\n- [x] Done'),
    PAGE.replace('\\*\\*Please preserve the capture\n', ''),
  ]) {
    const fx = fixture(); t.after(fx.cleanup);
    const result = await pickupOnce(fx.options, deps(fx, { readPage: async () => page }));
    assert.equal(result.status, 'RECORDED');
  }
});

test('empty checked bytes never erase an active round and preserve accounted episode sequencing', async (t) => {
  const active = fixture(); t.after(active.cleanup);
  await pickupOnce(active.options, deps(active));
  // Contracts.md C1: the option disappearing (the lead acting on it) is a sub-multiset of the
  // round's capture, not a new owner input, so this is not a change: RECORDED stays RECORDED,
  // untouched, rather than moving to NEEDS_RECONCILIATION.
  const changed = await pickupOnce(active.options, deps(active, { readPage: async () => EMPTY_DONE }));
  assert.equal(changed.status, 'RECORDED');
  assert.equal(changed.receipt.round, 1);

  const accounted = fixture(); t.after(accounted.cleanup);
  await pickupOnce(accounted.options, deps(accounted));
  const report = path.join(accounted.repo, 'outcome.md');
  fs.writeFileSync(report, 'Owner-attestation: decision-owner\nFresh-page-reconciliation: checked current page\nAccounted-ref: selection-001 applied\nAccounted-ref: comment-001 answered\n');
  account({ ...accounted.options, outcome: report }, { agentsHome: accounted.agentsHome, now: NOW });
  await pickupOnce(accounted.options, deps(accounted, { readPage: async () => UNCHECKED }));
  const noAction = await pickupOnce(accounted.options, deps(accounted, { readPage: async () => EMPTY_DONE }));
  assert.equal(noAction.status, 'NO_ACTION');
  assert.equal(status(accounted.options, { agentsHome: accounted.agentsHome }).receipt.round, 1);
  const next = await pickupOnce(accounted.options, deps(accounted));
  assert.equal(next.status, 'RECORDED');
  assert.equal(next.receipt.round, 2);
});

test('legacy receipts retain their saved state and location while once performs no new side effects', async (t) => {
  for (const state of ['CAPTURE_INTENT', 'PREPARED', 'SENDING', 'UNKNOWN', 'RECORDED', 'ACCOUNTED']) {
    const fx = fixture(); t.after(fx.cleanup);
    const legacy = installLegacyReceipt(fx, state);
    const before = fs.readFileSync(legacy.paths.receipt);
    const visible = status(fx.options, { agentsHome: fx.agentsHome });
    assert.equal(visible.status, state);
    assert.equal(visible.legacyLocation, 'LEGACY_REPO_CAPTURE');
    assert.equal(visible.manualReconciliationRequired, true);
    let reads = 0; let sends = 0;
    const refused = await pickupOnce(fx.options, deps(fx, {
      readPage: async () => { reads += 1; return PAGE; },
      send: async () => { sends += 1; return {}; },
    }));
    assert.equal(refused.status, state);
    assert.equal(reads, 0);
    assert.equal(sends, 0);
    assert.deepEqual(fs.readFileSync(legacy.paths.receipt), before);
    assert.equal(fs.existsSync(legacy.fullCapture), true);
  }
});

test('explicit accounting of an exact RECORDED legacy capture remains available without relocation', (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const legacy = installLegacyReceipt(fx, 'RECORDED');
  const report = path.join(fx.repo, 'legacy-outcome.md');
  fs.writeFileSync(report, 'Owner-attestation: decision-owner\nFresh-page-reconciliation: checked exact legacy page\nAccounted-ref: selection-001 applied\nAccounted-ref: comment-001 answered\n');
  const result = account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW });
  assert.equal(result.status, 'ACCOUNTED');
  assert.equal(result.receipt.version, 1);
  assert.equal(result.legacyLocation, 'LEGACY_REPO_CAPTURE');
  assert.equal(fs.existsSync(legacy.fullCapture), true);
});

test('corrupt private and legacy capture JSON never leaks source bytes through status or recovery', async (t) => {
  const privateFx = fixture(); t.after(privateFx.cleanup);
  await assert.rejects(pickupOnce(privateFx.options, deps(privateFx, {
    onTransition(state) { if (state === 'CAPTURE_INTENT') throw new Error('intent stop'); },
  })), /intent stop/);
  const intent = status(privateFx.options, { agentsHome: privateFx.agentsHome }).receipt;
  const privateCanary = 'PRIVATE-PARSE-ERROR-CANARY-31887';
  const privatePath = privateFile(privateFx, intent);
  fs.mkdirSync(path.dirname(privatePath), { recursive: true });
  fs.writeFileSync(privatePath, `{"raw":"${privateCanary}`);
  const visible = status(privateFx.options, { agentsHome: privateFx.agentsHome });
  assert.equal(visible.evidenceIntegrity.capture.errorCode, 'INVALID_JSON');
  assert.equal(JSON.stringify(visible).includes(privateCanary), false);
  let sends = 0;
  const recovered = await pickupOnce(privateFx.options, deps(privateFx, {
    send: async () => { sends += 1; return {}; },
  }));
  assert.equal(recovered.status, 'NEEDS_RECONCILIATION');
  assert.equal(sends, 0);
  const privateReceiptText = fs.readFileSync(receiptPaths({
    agentsHome: privateFx.agentsHome,
    project: fs.realpathSync(privateFx.repo),
    page: privateFx.options.page,
  }).receipt, 'utf8');
  assert.equal(JSON.stringify(recovered).includes(privateCanary), false);
  assert.equal(privateReceiptText.includes(privateCanary), false);

  const legacyFx = fixture(); t.after(legacyFx.cleanup);
  const legacy = installLegacyReceipt(legacyFx, 'CAPTURE_INTENT');
  const legacyCanary = 'LEGACY-PARSE-ERROR-CANARY-74022';
  fs.writeFileSync(legacy.fullCapture, `{"raw":"${legacyCanary}`);
  const legacyVisible = status(legacyFx.options, { agentsHome: legacyFx.agentsHome });
  assert.equal(legacyVisible.evidenceIntegrity.capture.errorCode, 'INVALID_JSON');
  assert.equal(JSON.stringify(legacyVisible).includes(legacyCanary), false);
  let reads = 0;
  const refused = await pickupOnce(legacyFx.options, deps(legacyFx, {
    readPage: async () => { reads += 1; return PAGE; },
  }));
  assert.equal(reads, 0);
  assert.equal(JSON.stringify(refused).includes(legacyCanary), false);
  assert.equal(fs.readFileSync(legacy.paths.receipt, 'utf8').includes(legacyCanary), false);
});

test('legacy ACCOUNTED status verifies the saved outcome digest and existence', (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  installLegacyReceipt(fx, 'RECORDED');
  const report = path.join(fx.repo, 'legacy-outcome-integrity.md');
  fs.writeFileSync(report, 'Owner-attestation: decision-owner\nFresh-page-reconciliation: exact legacy page\nAccounted-ref: selection-001 applied\nAccounted-ref: comment-001 answered\n');
  account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW });
  fs.appendFileSync(report, 'tampered\n');
  const tampered = status(fx.options, { agentsHome: fx.agentsHome });
  assert.equal(tampered.status, 'ACCOUNTED');
  assert.equal(tampered.evidenceIntegrity.status, 'OUTCOME_TAMPERED');
  fs.unlinkSync(report);
  const missing = status(fx.options, { agentsHome: fx.agentsHome });
  assert.equal(missing.status, 'ACCOUNTED');
  assert.equal(missing.evidenceIntegrity.status, 'OUTCOME_MISSING');
  assert.equal(missing.evidenceIntegrity.errorCode, 'ENOENT');
});

test('invalid-page diagnostics expose only categories, counts, and line numbers', async (t) => {
  const warningFx = fixture(); t.after(warningFx.cleanup);
  const warningCanary = 'PRIVATE-WARNING-TITLE-CANARY-90415';
  const warningPage = `<summary>${warningCanary}</summary>
- [ ] Option
- [x] Done
`;
  const warning = await pickupOnce(warningFx.options, deps(warningFx, { readPage: async () => warningPage }));
  assert.equal(warning.status, 'INVALID');
  assert.deepEqual(warning.invalidPage, {
    warningCount: 1,
    shapelessCount: 0,
    issues: [{ code: 'DECISION_DEFAULT_MISSING', line: 1 }],
  });
  assert.equal(JSON.stringify(warning).includes(warningCanary), false);
  assert.equal('warnings' in warning, false);

  const shapelessFx = fixture(); t.after(shapelessFx.cleanup);
  const shapelessCanary = 'PRIVATE-SHAPELESS-TITLE-CANARY-65120';
  const shapelessPage = `<summary>${shapelessCanary}</summary>
- [x] Done
`;
  const shapeless = await pickupOnce(shapelessFx.options, deps(shapelessFx, { readPage: async () => shapelessPage }));
  assert.equal(shapeless.status, 'INVALID');
  assert.deepEqual(shapeless.invalidPage, {
    warningCount: 0,
    shapelessCount: 1,
    issues: [{ code: 'SHAPELESS_TOGGLE', line: 1 }],
  });
  assert.equal(JSON.stringify(shapeless).includes(shapelessCanary), false);
  assert.equal('shapeless' in shapeless, false);
});

test('reader and malformed-page failures never forward external diagnostic text', async (t) => {
  const stderrCanary = 'PRIVATE-READER-STDERR-CANARY-23174';
  assert.throws(() => readPageWithCli({
    reader: 'synthetic-reader.js', page: 'page-registered',
    spawn: () => ({ status: 7, stdout: '', stderr: stderrCanary }),
  }), (error) => error.message === 'reader failed (READER_EXIT_7)' && !error.message.includes(stderrCanary));

  const spawnCanary = 'PRIVATE-SPAWN-MESSAGE-CANARY-11209';
  assert.throws(() => readPageWithCli({
    reader: 'synthetic-reader.js', page: 'page-registered',
    spawn: () => {
      const error = new Error(spawnCanary);
      error.code = `LEAK_${spawnCanary}`;
      return { error, status: null, stdout: '', stderr: '' };
    },
  }), (error) => error.message === 'reader failed (READER_SPAWN_FAILED)' && !error.message.includes(spawnCanary));

  assert.throws(() => readPageWithCli({
    reader: 'synthetic-reader.js', page: 'page-registered',
    spawn: () => ({ error: Object.assign(new Error(stderrCanary), { code: 'ETIMEDOUT' }) }),
  }), /reader failed \(READER_TIMEOUT\)/);

  const malformedFx = fixture(); t.after(malformedFx.cleanup);
  const parseCanary = 'PRIVATE-MALFORMED-PAGE-CANARY-44803';
  await assert.rejects(pickupOnce(malformedFx.options, deps(malformedFx, {
    readPage: async () => `<summary>${parseCanary}`,
  })), (error) => error.message === 'registered page is BLIND (INVALID_PAGE)'
    && !error.message.includes(parseCanary));
});

test('transport recovery and success receipts discard external envelope diagnostics', async (t) => {
  const conflictFx = fixture(); t.after(conflictFx.cleanup);
  await assert.rejects(pickupOnce(conflictFx.options, deps(conflictFx, {
    onTransition(state) { if (state === 'SENDING') throw new Error('sending stop'); },
  })), /sending stop/);
  const conflictCanary = 'PRIVATE-LEDGER-CONFLICT-CANARY-77391';
  const conflict = await pickupOnce(conflictFx.options, deps(conflictFx, {
    inspectTransport: () => ({ status: 'CONFLICT', matches: [], conflicts: [conflictCanary] }),
  }));
  assert.equal(conflict.status, 'NEEDS_RECONCILIATION');
  assert.deepEqual(conflict.receipt.transportEvidence, {
    status: 'CONFLICT', matchCount: 0, conflictCount: 1,
  });
  assert.equal(JSON.stringify(conflict).includes(conflictCanary), false);

  const successFx = fixture(); t.after(successFx.cleanup);
  const senderCanary = 'PRIVATE-SENDER-ENVELOPE-CANARY-38642';
  const success = await pickupOnce(successFx.options, deps(successFx, {
    send: async () => ({ id: senderCanary, envelope: senderCanary }),
  }));
  assert.deepEqual(success.receipt.transportResult, { id: success.receipt.noteId, recorded: true });
  assert.equal(JSON.stringify(success).includes(senderCanary), false);
});
