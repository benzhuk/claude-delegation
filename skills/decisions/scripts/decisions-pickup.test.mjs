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
import { execFileSync, spawnSync } from 'node:child_process';
import {
  account, inspectTransport, openPrivateCapture, ownerInputs, pickupOnce, readPageWithCli,
  receiptPaths, runRegisteredPickup, status, PickupError,
} from './decisions-pickup.mjs';
import * as pickupModule from './decisions-pickup.mjs';
import { publish, defaultReadPickupCapture } from './decisions-render-publish.mjs';
import { toggleFiles, CARD_SHA } from './fixtures/toggles-fixtures.mjs';

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

// Lane 34 / P1: a real git main checkout, committed under the sealed fixture identity (never a
// per-command -c user.* override — see skills/../scripts/test-home.mjs's includeIf identity), with
// `.agents/project.json` tracked so a linked worktree checks out the identical config.
function gitMainFixture(page = 'page-registered') {
  const sealed = makeTempHome();
  const repo = fs.mkdtempSync(path.join(sealed.fixtureRoot, 'git-main-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo, env: sealed.env });
  fs.mkdirSync(path.join(repo, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.agents', 'project.json'), JSON.stringify({ decisions_url: page }));
  execFileSync('git', ['add', '-A'], { cwd: repo, env: sealed.env });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo, env: sealed.env });
  const options = {
    repo, page, from: 'pickup-host', owner: 'decision-owner', reader: 'synthetic-reader.js',
  };
  const cleanup = () => sealed.cleanup();
  return { ...sealed, repo, options, cleanup };
}

/** `git worktree add` a linked worktree of `fx.repo`, still inside the sealed fixture root. */
function addLinkedWorktree(fx, branch = 'lane34-worktree') {
  const worktree = path.join(fx.fixtureRoot, 'linked-worktree');
  execFileSync('git', ['worktree', 'add', '-q', '-b', branch, worktree], { cwd: fx.repo, env: fx.env });
  return worktree;
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

// Lane 34 (pickup-binding, lead ruling P1): project identity resolves through the main checkout
// (the same `mainCheckout`/`durableTransportRepo` resolver `Details uses the durable main checkout...`
// above already exercises for the transport repo), so every worktree of one repository is one
// project. Real git fixtures throughout: `git init` plus `git worktree add` in mktemp dirs under the
// sealed fixture root, committed under the fixture's own configured identity — no `-c user.*` here.
test('a linked worktree of a repo resolves to the same project and projectScope as its main checkout, and finds a RECORDED round bound to the main checkout', async (t) => {
  const fx = gitMainFixture('page-worktree-identity'); t.after(fx.cleanup);
  const worktree = addLinkedWorktree(fx);

  const recorded = await pickupOnce(fx.options, deps(fx));
  assert.equal(recorded.status, 'RECORDED');
  assert.equal(recorded.receipt.round, 1);

  const fromWorktree = status({ repo: worktree, page: fx.options.page }, { agentsHome: fx.agentsHome });
  assert.equal(fromWorktree.status, 'RECORDED', JSON.stringify(fromWorktree));
  assert.equal(fromWorktree.receipt.round, 1, 'the worktree finds the round RECORDED from the main checkout');
  assert.equal(
    fromWorktree.receipt.project, fs.realpathSync(fx.repo),
    'a linked worktree must resolve to its main checkout, never its own path',
  );
  assert.equal(fromWorktree.receipt.projectScope, recorded.receipt.projectScope);

  const expected = receiptPaths({
    agentsHome: fx.agentsHome, project: fs.realpathSync(fx.repo), page: fx.options.page,
  });
  assert.equal(fromWorktree.receipt.projectScope, expected.projectScope);
});

test("a main-checkout path's projectScope is unchanged from today's formula", async (t) => {
  const fx = gitMainFixture('page-main-formula'); t.after(fx.cleanup);
  const recorded = await pickupOnce(fx.options, deps(fx));
  assert.equal(recorded.status, 'RECORDED');
  const todaysProject = fs.realpathSync(fx.repo);
  const todaysPaths = receiptPaths({ agentsHome: fx.agentsHome, project: todaysProject, page: fx.options.page });
  assert.equal(recorded.receipt.project, todaysProject, 'a main checkout keeps the plain realpath identity');
  assert.equal(recorded.receipt.projectScope, todaysPaths.projectScope, "today's sha256(project + page) formula, byte for byte");
});

test('a non-git directory keeps its realpath identity', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const recorded = await pickupOnce(fx.options, deps(fx));
  assert.equal(recorded.status, 'RECORDED');
  assert.equal(recorded.receipt.project, fs.realpathSync(fx.repo));
  assert.equal(recorded.receipt.transportRepo, fs.realpathSync(fx.repo));
});

// Review r1 F1 (MEDIUM regression): `readRegistration` used to hand `pickupOnce` the main-checkout
// identity as `entry.repo`, so the config got re-read from the main checkout instead of the checkout
// named in the registration entry. Here the entry names a linked worktree whose main checkout has
// no `.agents/project.json` at all (never committed there), so the old behaviour throws "project has
// no registered decisions_url" for every registered run, while the entry's own worktree config is
// valid throughout. Fails on bafd52d: PICKUP_FAILED instead of PICKUP_RECORDED.
test('a registration entry naming a linked worktree is validated from the worktree, and its receipt still binds to the main checkout', async (t) => {
  const sealed = makeTempHome(); t.after(sealed.cleanup);
  const repo = fs.mkdtempSync(path.join(sealed.fixtureRoot, 'git-main-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo, env: sealed.env });
  fs.writeFileSync(path.join(repo, 'README.md'), 'root\n');
  execFileSync('git', ['add', '-A'], { cwd: repo, env: sealed.env });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo, env: sealed.env });
  const worktree = path.join(sealed.fixtureRoot, 'f1-worktree');
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'lane34-f1', worktree], { cwd: repo, env: sealed.env });
  const page = 'f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1';
  fs.mkdirSync(path.join(worktree, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(worktree, '.agents', 'project.json'), JSON.stringify({ decisions_url: page }));
  const reader = path.join(sealed.fixtureRoot, 'f1-reader.mjs');
  fs.writeFileSync(reader, '#!/usr/bin/env node\n', 'utf8');
  const registrationPath = path.join(sealed.agentsHome, 'ws', 'decisions-pickup', 'registrations.json');
  fs.mkdirSync(path.dirname(registrationPath), { recursive: true });
  const entry = { repo: worktree, page, from: 'pickup-host', owner: 'decision-owner', reader };
  fs.writeFileSync(registrationPath, JSON.stringify({ version: 1, entries: [entry] }), 'utf8');

  const result = await runRegisteredPickup({ registrationPath }, {
    agentsHome: sealed.agentsHome,
    selectIndex: () => 0,
    now: NOW,
    readPage: async () => PAGE,
    send: async () => ({ id: 'saved-id', envelope: 'recorded' }),
  });
  assert.deepEqual(result, { code: 'PICKUP_RECORDED', ordinal: 0 });

  const direct = status({ repo: worktree, page }, { agentsHome: sealed.agentsHome });
  assert.equal(direct.status, 'RECORDED', JSON.stringify(direct));
  assert.equal(direct.receipt.project, fs.realpathSync(repo), "the receipt binds to the worktree's main checkout");
});

// Review r1 F2 (MEDIUM misbinding): `mainCheckout`'s `/\/?\.git\/?$/` strip is happy to remove a
// bare gitdir's own trailing `.git`, so a worktree of a separate bare clone `proj.git` used to take
// the identity of an unrelated sibling clone `proj`. `git clone --bare`/`--shared` and
// `git worktree add` make no commits; only the shared origin commit uses the sealed fixture identity.
test("a worktree of a bare-backed clone stays its own project, never a sibling clone's", async (t) => {
  const sealed = makeTempHome(); t.after(sealed.cleanup);
  const origin = fs.mkdtempSync(path.join(sealed.fixtureRoot, 'origin-'));
  execFileSync('git', ['init', '--quiet'], { cwd: origin, env: sealed.env });
  const page = 'f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2';
  fs.mkdirSync(path.join(origin, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(origin, '.agents', 'project.json'), JSON.stringify({ decisions_url: page }));
  execFileSync('git', ['add', '-A'], { cwd: origin, env: sealed.env });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: origin, env: sealed.env });

  const proj = path.join(sealed.fixtureRoot, 'proj');
  execFileSync('git', ['clone', '--quiet', '--shared', origin, proj], { env: sealed.env });

  const bareGitDir = path.join(sealed.fixtureRoot, 'proj.git');
  execFileSync('git', ['clone', '--quiet', '--bare', origin, bareGitDir], { env: sealed.env });
  const bwt = path.join(sealed.fixtureRoot, 'bwt');
  execFileSync('git', ['worktree', 'add', '-q', '--detach', bwt, 'HEAD'], { cwd: bareGitDir, env: sealed.env });

  const options = { repo: proj, page, from: 'pickup-host', owner: 'decision-owner', reader: 'synthetic-reader.js' };
  const recorded = await pickupOnce(options, deps(sealed));
  assert.equal(recorded.status, 'RECORDED');
  assert.equal(recorded.receipt.project, fs.realpathSync(proj));

  const fromBareWorktree = status({ repo: bwt, page }, { agentsHome: sealed.agentsHome });
  assert.equal(
    fromBareWorktree.status, 'PENDING_MANUAL_HANDOFF', JSON.stringify(fromBareWorktree),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Lane 64: the 9/30 decisions-page wedge. A synthetic fixture of its shape (never the real receipt
// or captures): round N recorded for lead `skills-a`; the owner's page is then re-ticked with four
// NEW answers; a different lead (registered owner `ben`) runs the pickup, which marks a manual
// handoff; the round ends NEEDS_RECONCILIATION with its bytes-changed reason. The owner's answers
// are all quoted in a history file from an earlier day. Before the fix: `account` refused (the
// attestation was bound to `skills-a`, the reconciliation inputs were not a sub-multiset), and
// `publish --clear-done` refused with "no captured pickup round for this page".
// ─────────────────────────────────────────────────────────────────────────────

function wedgeBlock(title, options, { ticked = [], comments = [] } = {}) {
  return [
    '<details>',
    `<summary>**${title}**</summary>`,
    ...options.map((option, index) => `\t- [${ticked.includes(index) ? 'x' : ' '}] ${option}`),
    ...comments.map((comment) => `\t\\*\\* ${comment}`),
    `\tDefault after 2030-01-01 00:00 -05:00: ${options[0]}`,
    '</details>',
  ].join('\n');
}
// Lane 72: the page shape nests the items and the Done checkbox inside the Waiting toggle, Done as
// its last block, so the pickup reads Done from that indented place.
const wedgePage = (blocks, done) => [
  '# Waiting on you now {toggle="true"}',
  ...blocks.join('\n').split('\n').map((l) => `\t${l}`),
  `\t- [${done ? 'x' : ' '}] Done`,
  '\t<empty-block/>',
].join('\n');

const W_HOOK = ['It has not happened again, drop it', 'Keep watching it'];
const W_NETCUP = ['Restart the BTO pane on Netcup', 'Leave the prompts alone'];
const W_FOLDERS = ['Delete them all from a script', 'Keep the folders'];
const W_TRIAGE = ['Run the Opus triage of every branch', 'Skip the triage'];
const W_COMMENT_FOLDERS = 'give me the command to delete them in powershell';
const W_COMMENT_TRIAGE = 'decide what we actually want to keep and what to discard';
// The page as the renderer last wrote it (nothing ticked) and as the owner leaves it each time.
const W_CLEAN = wedgePage([
  wedgeBlock('Codex hook failure', W_HOOK), wedgeBlock('Delete prompts on Netcup', W_NETCUP),
  wedgeBlock('Leftover folders', W_FOLDERS), wedgeBlock('Branch triage', W_TRIAGE),
], false);
// Round N: the two ticks the lead handled.
const W_ROUND = wedgePage([
  wedgeBlock('Codex hook failure', W_HOOK, { ticked: [0] }),
  wedgeBlock('Delete prompts on Netcup', W_NETCUP, { ticked: [0] }),
], true);
// After the clear: Done checked again with four new answers (two ticks, two comments).
const W_CHANGED = wedgePage([
  wedgeBlock('Codex hook failure', W_HOOK), wedgeBlock('Delete prompts on Netcup', W_NETCUP),
  wedgeBlock('Leftover folders', W_FOLDERS, { ticked: [0], comments: [W_COMMENT_FOLDERS] }),
  wedgeBlock('Branch triage', W_TRIAGE, { ticked: [0], comments: [W_COMMENT_TRIAGE] }),
], true);
const W_HISTORY_DAY = '2026-09-30';
const W_HISTORY = [
  '# Sep 30, 2026',
  'Summary: the cleanup answers are recorded.',
  `- On the Codex hook failure, Ben ticked "${W_HOOK[0]}". Plan item 15 is closed.`,
  `- On the Netcup delete prompts, Ben ticked "${W_NETCUP[0]}". The restart is his to do.`,
  `- On leftover folders, Ben ticked "${W_FOLDERS[0]}" and wrote "${W_COMMENT_FOLDERS}".`,
  `- On branch triage, Ben ticked "${W_TRIAGE[0]}" and wrote "${W_COMMENT_TRIAGE}".`,
  '',
].join('\n');

async function buildWedge(fx, changed = W_CHANGED) {
  const send = async () => ({});
  const first = await pickupOnce({ ...fx.options, owner: 'skills-a' }, deps(fx, { readPage: async () => W_ROUND, send }));
  assert.equal(first.status, 'RECORDED');
  const handoff = await pickupOnce({ ...fx.options, owner: 'ben' }, deps(fx, { readPage: async () => W_ROUND, send }));
  assert.equal(handoff.receipt.handoffStatus, 'PENDING_MANUAL_HANDOFF');
  let stuck;
  // Two passes: the live receipt's previousState was clobbered to NEEDS_RECONCILIATION by a second pass.
  for (let pass = 0; pass < 2; pass += 1) {
    stuck = await pickupOnce({ ...fx.options, owner: 'ben' }, deps(fx, { readPage: async () => changed, send }));
  }
  assert.equal(stuck.status, 'NEEDS_RECONCILIATION');
  assert.equal(stuck.receipt.owner, 'skills-a');
  assert.equal(stuck.receipt.previousState, 'NEEDS_RECONCILIATION');
  assert.equal(stuck.receipt.handoffStatus, 'PENDING_MANUAL_HANDOFF');
  assert.equal(stuck.receipt.requestedOwner, 'ben');
  assert.equal(stuck.receipt.reconciliationReason, 'checked page bytes changed during the active round');
  return stuck.receipt;
}

function boundPickup(fx) {
  return {
    status: (o) => status(o, { agentsHome: fx.agentsHome }),
    openPrivateCapture: (o) => openPrivateCapture(o, { agentsHome: fx.agentsHome }),
  };
}

/** publish() with every IO dependency faked in memory: the decisions tree, git and Notion. The pickup
 * side (receipt, captures) is the REAL one, in the sealed home. `history` maps NY day -> text. */
function wedgePublish(fx, { fresh, history, now = '2026-10-01T19:00:00Z', owner, lastRender = W_CLEAN }) {
  const files = new Map(Object.entries({
    ...toggleFiles(path.join, fx.repo),
    [path.join(fx.repo, 'docs', 'decisions', 'now.md')]: 'The plugin runs the loop by itself. Ticks reach the right session within a minute. Knowledge sharing between machines is the next lane.',
    [path.join(fx.repo, 'docs', 'decisions', 'session.md')]: 'since: 2026-09-27T18:16:00Z\n- The collector runs on Netcup every 15 minutes.',
    [path.join(fx.repo, 'docs', 'decisions', 'last-render.md')]: lastRender,
    ...Object.fromEntries(Object.entries(history).map(([day, text]) => [path.join(fx.repo, 'docs', 'decisions', 'history', `${day}.md`), text])),
  }));
  const readFile = (file) => {
    if (!files.has(file)) { const error = new Error(`ENOENT: ${file}`); error.code = 'ENOENT'; throw error; }
    return files.get(file);
  };
  const readdirSync = (directory) => {
    const prefix = directory.endsWith(path.sep) ? directory : directory + path.sep;
    const names = new Set();
    for (const key of files.keys()) if (key.startsWith(prefix) && !key.slice(prefix.length).includes(path.sep)) names.add(key.slice(prefix.length));
    if (!names.size) { const error = new Error(`ENOENT: ${directory}`); error.code = 'ENOENT'; throw error; }
    return [...names];
  };
  const refs = Object.fromEntries(Object.entries(history).map(([day, text]) => [`origin/main:docs/decisions/history/${day}.md`, text]));
  const execGit = (args) => {
    if (args[0] === 'show') { if (args[1] in refs) return refs[args[1]]; throw new Error(`fatal: ${args[1]}`); }
    if (args[0] === 'log') return CARD_SHA;
    if (args[0] === 'ls-tree') return args.includes('docs/decisions/history') ? Object.keys(history).map((day) => `docs/decisions/history/${day}.md`).join('\n') : args[args.length - 1];
    if (args[0] === 'rev-parse') return args.includes('--abbrev-ref') ? 'main' : 'sha-fixed';
    if (args[0] === 'diff') throw new Error('there is a staged difference');
    return '';
  };
  let written = fresh;
  let reads = 0;
  const notionWrites = [];
  const accountCalls = [];
  const publishDeps = {
    readFile,
    readdirSync,
    writeFile: (file, content) => files.set(file, content),
    execGit,
    now: () => new Date(now),
    readPage: async () => { reads += 1; return reads === 1 ? fresh : written; },
    replaceMd: async (_page, md) => { notionWrites.push(md); written = md; },
    titleSet: async () => {},
    readLatestBackup: async () => null,
    write: () => {},
    readPickupCapture: (ctx) => defaultReadPickupCapture(ctx, { pickup: boundPickup(fx) }),
    accountRound: async (ctx) => {
      accountCalls.push(ctx);
      return pickupModule.closeRound({
        repo: ctx.repo, page: ctx.page, owner: ctx.owner, reconciliation: ctx.reconciliation, freshInputs: ctx.freshInputs,
      }, {
        agentsHome: fx.agentsHome, now: ctx.now, readHistory: () => Object.values(history).join('\n'),
      });
    },
  };
  const run = (opts = {}) => publish({
    repo: fx.repo, page: fx.options.page, clearDone: true, ...(owner ? { owner } : {}), ...opts,
  }, publishDeps);
  return { run, files, notionWrites, accountCalls };
}

// Regression, item 1 (scope item 1: clearing Done and accounting the round are one step).
test('wedge 9/30 item 1: publish --clear-done accounts the round in the same step that clears Done', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const page = wedgePage([wedgeBlock('Codex hook failure', W_HOOK, { ticked: [0] })], true);
  const clean = wedgePage([wedgeBlock('Codex hook failure', W_HOOK)], false);
  const recorded = await pickupOnce({ ...fx.options, owner: 'skills-a' }, deps(fx, { readPage: async () => page }));
  assert.equal(recorded.status, 'RECORDED');
  const history = { '2026-10-01': `# Oct 1, 2026\nSummary: the hook answer is recorded.\n- Ben ticked "${W_HOOK[0]}".\n` };
  const harness = wedgePublish(fx, { fresh: page, history, lastRender: clean, owner: 'skills-a' });
  await assert.doesNotReject(() => harness.run());
  assert.equal(harness.notionWrites.length, 1, 'the page was written with Done cleared');
  const after = status(fx.options, { agentsHome: fx.agentsHome });
  assert.equal(after.status, 'ACCOUNTED', 'no path may clear Done and leave the round unaccounted');
  assert.equal(after.receipt.accountingOutcome.ownerAttested, true);
  assert.equal(after.receipt.accountedBy, 'skills-a');
  assert.equal(after.evidenceIntegrity.status, 'OK', 'the outcome the step wrote is on disk and matches its digest');
});

// Regression, item 2 (scope item 2: a round whose owner inputs are all quoted in history is admitted).
test('wedge 9/30 item 2: a stuck round whose owner inputs are all quoted in origin history is admitted as closed', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await buildWedge(fx);
  const report = path.join(fx.repo, 'outcome.md');
  fs.writeFileSync(report, 'Owner-attestation: skills-a\nFresh-page-reconciliation: all answers are quoted in history\nAccounted-ref: selection-001 closed\nAccounted-ref: selection-002 closed\n');
  const outcome = {};
  assert.doesNotThrow(() => {
    outcome.result = account({ ...fx.options, owner: undefined, outcome: report }, {
      agentsHome: fx.agentsHome, now: NOW, readHistory: () => W_HISTORY,
    });
  });
  assert.equal(outcome.result?.status, 'ACCOUNTED');
  assert.equal(outcome.result.receipt.accountedFrom, 'NEEDS_RECONCILIATION');
  assert.equal(outcome.result.receipt.admittedBy, 'history');
  assert.equal(outcome.result.receipt.handoffStatus, null, 'closing the round settles the manual-handoff marker');
});

// Regression, item 3 (scope item 3: the owner binding follows the lead that runs the pickup).
test('wedge 9/30 item 3: the attestation follows the lead that runs the accounting, not the first lead that ever ran the pickup', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const recorded = await pickupOnce({ ...fx.options, owner: 'skills-a' }, deps(fx));
  assert.equal(recorded.status, 'RECORDED');
  const asFirstLead = path.join(fx.repo, 'outcome-skills-a.md');
  const asRunningLead = path.join(fx.repo, 'outcome-skills-fable.md');
  const refs = 'Fresh-page-reconciliation: handled by hand\nAccounted-ref: selection-001 applied\nAccounted-ref: comment-001 answered\n';
  fs.writeFileSync(asFirstLead, `Owner-attestation: skills-a\n${refs}`);
  fs.writeFileSync(asRunningLead, `Owner-attestation: skills-fable\n${refs}`);
  const options = { ...fx.options, owner: 'skills-fable' };
  assert.throws(
    () => account({ ...options, outcome: asFirstLead }, { agentsHome: fx.agentsHome, now: NOW }),
    /required owner attestation/,
    'the running lead may not attest in another lead\'s name',
  );
  const outcome = {};
  assert.doesNotThrow(() => { outcome.result = account({ ...options, outcome: asRunningLead }, { agentsHome: fx.agentsHome, now: NOW }); });
  assert.equal(outcome.result?.status, 'ACCOUNTED');
  assert.equal(outcome.result.receipt.accountedBy, 'skills-fable');
  assert.equal(outcome.result.receipt.owner, 'skills-a', 'the saved owner is part of every capture check and is never rewritten');
  assert.equal(outcome.result.evidenceIntegrity.status, 'OK');
});

test('wedge 9/30 end to end: publish --clear-done closes the stuck round and clears Done in one step', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await buildWedge(fx);
  const before = await pickupOnce({ ...fx.options, owner: 'ben' }, deps(fx, { readPage: async () => W_CHANGED }));
  assert.equal(before.status, 'NEEDS_RECONCILIATION', 'before: the round is wedged');
  const harness = wedgePublish(fx, { fresh: W_CHANGED, history: { [W_HISTORY_DAY]: W_HISTORY }, owner: 'skills-fable' });
  await assert.doesNotReject(() => harness.run());
  assert.equal(harness.accountCalls.length, 1);
  assert.equal(harness.accountCalls[0].owner, 'skills-fable');
  assert.equal(harness.notionWrites.length, 1);
  const after = status(fx.options, { agentsHome: fx.agentsHome });
  assert.equal(after.status, 'ACCOUNTED');
  assert.equal(after.receipt.accountedBy, 'skills-fable');
  assert.equal(after.receipt.owner, 'skills-a');
  assert.equal(after.receipt.admittedBy, 'history');
  assert.equal(after.evidenceIntegrity.status, 'OK');
  // The registered pickup no longer reads the stale handoff marker as a reconciliation request.
  assert.equal(after.receipt.handoffStatus, null);
});

test('wedge 9/30: one input NOT quoted in history keeps the round wedged, at account and at publish', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await buildWedge(fx);
  const partial = W_HISTORY.replace(`"${W_COMMENT_TRIAGE}"`, 'something else');
  const report = path.join(fx.repo, 'outcome.md');
  fs.writeFileSync(report, 'Owner-attestation: skills-a\nFresh-page-reconciliation: x\nAccounted-ref: selection-001 closed\nAccounted-ref: selection-002 closed\n');
  assert.throws(
    () => account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW, readHistory: () => partial }),
    /cannot account a round outside RECORDED/,
  );
  const harness = wedgePublish(fx, { fresh: W_CHANGED, history: { [W_HISTORY_DAY]: partial } });
  await assert.rejects(
    harness.run(),
    (error) => error.code === 3 && /not every owner input is quoted/.test(error.message) && error.message.includes(W_COMMENT_TRIAGE),
  );
  assert.equal(harness.notionWrites.length, 0);
  assert.equal(harness.accountCalls.length, 0);
  assert.equal(status(fx.options, { agentsHome: fx.agentsHome }).status, 'NEEDS_RECONCILIATION');
});

test('closeRound refuses an uncertain-delivery round even with every input in history, and wants a reconciliation statement', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const recorded = await pickupOnce({ ...fx.options, owner: 'skills-a' }, deps(fx, { readPage: async () => W_ROUND }));
  const paths = receiptPaths({ agentsHome: fx.agentsHome, project: fs.realpathSync(fx.repo), page: fx.options.page });
  const { recordedAt, transportResult, ...rest } = recorded.receipt;
  fs.writeFileSync(paths.receipt, `${JSON.stringify({ ...rest, state: 'UNKNOWN', uncertainAt: NOW }, null, 2)}\n`);
  assert.throws(
    () => pickupModule.closeRound({ ...fx.options, reconciliation: 'x' }, { agentsHome: fx.agentsHome, now: NOW, readHistory: () => W_HISTORY }),
    /cannot account a round outside RECORDED/,
  );
  assert.throws(() => pickupModule.closeRound({ ...fx.options }, { agentsHome: fx.agentsHome, now: NOW }), /reconciliation statement/);
});

test('readOriginHistory reads every committed history day from origin/main, and quotedInHistory wants the exact quoted form', () => {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'ls-tree') return 'docs/decisions/history/2026-09-29.md\ndocs/decisions/history/2026-09-30.md\ndocs/decisions/history/README.txt\n';
    if (args[0] === 'show') return `text of ${args[1]}\n`;
    throw new Error('unexpected');
  };
  const text = pickupModule.readOriginHistory('/repo', git);
  assert.match(text, /origin\/main:docs\/decisions\/history\/2026-09-29\.md/);
  assert.match(text, /origin\/main:docs\/decisions\/history\/2026-09-30\.md/);
  assert.equal(text.includes('README.txt'), false);
  assert.deepEqual(calls[0], ['ls-tree', '-r', '--name-only', 'origin/main', '--', 'docs/decisions/history']);
  assert.equal(pickupModule.readOriginHistory('/repo', () => { throw new Error('no origin'); }), '');
  assert.equal(pickupModule.quotedInHistory(['comment', 't', 'no'], 'a note about it'), false);
  assert.equal(pickupModule.quotedInHistory(['comment', 't', 'no'], 'Ben wrote "no".'), true);
  assert.equal(pickupModule.quotedInHistory(['selection', 't', 'Yes'], 'the Yes branch'), false);
  assert.equal(pickupModule.quotedInHistory(['selection', 't', 'Yes'], 'Ben ticked "Yes".'), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Lane 64 fix round 2: an ACCOUNTED round admitted from NEEDS_RECONCILIATION keeps its original
// capture as the receipt baseline; it must still be clearable and must survive a pickup tick.
// ─────────────────────────────────────────────────────────────────────────────

test('wedge 9/30: a history-accounted round with Done still checked is cleared by publish --clear-done', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await buildWedge(fx);
  const report = path.join(fx.repo, 'o.md');
  fs.writeFileSync(report, 'Owner-attestation: skills-fable\nFresh-page-reconciliation: all quoted in history\nAccounted-ref: selection-001 a\nAccounted-ref: selection-002 b\n');
  account({ ...fx.options, owner: 'skills-fable', outcome: report }, { agentsHome: fx.agentsHome, now: NOW, readHistory: () => W_HISTORY });
  const h = wedgePublish(fx, { fresh: W_CHANGED, history: { [W_HISTORY_DAY]: W_HISTORY }, owner: 'skills-fable' });
  await assert.doesNotReject(() => h.run());
  assert.equal(h.notionWrites.length, 1);
  assert.equal(h.accountCalls.length, 0, 'an accounted round is not accounted twice');
});

test('wedge 9/30: a failed page write after the one-step accounting survives a pickup tick and a retry', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await buildWedge(fx);
  const history = { [W_HISTORY_DAY]: W_HISTORY };
  const h = wedgePublish(fx, { fresh: W_CHANGED, history, owner: 'skills-fable' });
  const push = h.notionWrites.push.bind(h.notionWrites);
  let fail = true;
  h.notionWrites.push = (md) => { if (fail) { fail = false; throw new Error('notion 502'); } return push(md); };
  await assert.rejects(h.run());
  const tick = await pickupOnce({ ...fx.options, owner: 'ben' }, deps(fx, { readPage: async () => W_CHANGED, send: async () => ({}) }));
  assert.equal(tick.status, 'ACCOUNTED', 'a tick with Done still checked must not re-wedge the accounted round');
  const retry = wedgePublish(fx, { fresh: W_CHANGED, history, owner: 'skills-fable' });
  await assert.doesNotReject(() => retry.run());
  assert.equal(retry.notionWrites.length, 1);
});

test('wedge 9/30: a page edited after the pickup last read it is not accounted until a tick has captured it', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  await buildWedge(fx);
  const extra = 'and the temp dirs under scratch too';
  const edited = wedgePage([
    wedgeBlock('Codex hook failure', W_HOOK), wedgeBlock('Delete prompts on Netcup', W_NETCUP),
    wedgeBlock('Leftover folders', W_FOLDERS, { ticked: [0], comments: [W_COMMENT_FOLDERS, extra] }),
    wedgeBlock('Branch triage', W_TRIAGE, { ticked: [0], comments: [W_COMMENT_TRIAGE] }),
  ], true);
  const history = { [W_HISTORY_DAY]: `${W_HISTORY}- Ben also wrote "${extra}".
` };
  const early = wedgePublish(fx, { fresh: edited, history, owner: 'skills-fable' });
  await assert.rejects(early.run(), (error) => error.code === 3 && /changed after the pickup last read it/.test(error.message));
  assert.equal(early.notionWrites.length, 0);
  assert.equal(status(fx.options, { agentsHome: fx.agentsHome }).status, 'NEEDS_RECONCILIATION');
  await pickupOnce({ ...fx.options, owner: 'ben' }, deps(fx, { readPage: async () => edited, send: async () => ({}) }));
  const h = wedgePublish(fx, { fresh: edited, history, owner: 'skills-fable' });
  const push = h.notionWrites.push.bind(h.notionWrites);
  let fail = true;
  h.notionWrites.push = (md) => { if (fail) { fail = false; throw new Error('notion 502'); } return push(md); };
  await assert.rejects(h.run());
  const tick = await pickupOnce({ ...fx.options, owner: 'ben' }, deps(fx, { readPage: async () => edited, send: async () => ({}) }));
  assert.equal(tick.status, 'ACCOUNTED', 'the accounted baseline covers the page publish verified');
  const retry = wedgePublish(fx, { fresh: edited, history, owner: 'skills-fable' });
  await assert.doesNotReject(() => retry.run());
  assert.equal(retry.notionWrites.length, 1);
});

// F2: history admission counts. Two new `yes` comments are not closed by one stale older-day quote.
test('wedge 9/30: a stale older-day quote of a short answer does not close a round with two new answers of that text', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const yesPage = wedgePage([
    wedgeBlock('Codex hook failure', W_HOOK), wedgeBlock('Delete prompts on Netcup', W_NETCUP),
    wedgeBlock('Leftover folders', W_FOLDERS, { comments: ['yes'] }),
    wedgeBlock('Branch triage', W_TRIAGE, { comments: ['yes'] }),
  ], true);
  await buildWedge(fx, yesPage);
  const stale = [
    '# Sep 23, 2026',
    `- Ben ticked "${W_HOOK[0]}" and "${W_NETCUP[0]}".`,
    '- Ben wrote "yes" about something unrelated.',
    '',
  ].join('\n');
  const history = { '2026-09-23': stale };
  const report = path.join(fx.repo, 'o.md');
  fs.writeFileSync(report, 'Owner-attestation: skills-fable\nFresh-page-reconciliation: x\nAccounted-ref: selection-001 a\nAccounted-ref: selection-002 b\n');
  assert.throws(
    () => account({ ...fx.options, owner: 'skills-fable', outcome: report }, { agentsHome: fx.agentsHome, now: NOW, readHistory: () => stale }),
    /cannot account a round outside RECORDED/,
  );
  const h = wedgePublish(fx, { fresh: yesPage, history, owner: 'skills-fable' });
  await assert.rejects(h.run(), (error) => error.code === 3 && /not every owner input is quoted/.test(error.message) && error.message.includes('yes'));
  assert.equal(h.notionWrites.length, 0);
  assert.equal(h.accountCalls.length, 0);
  assert.equal(status(fx.options, { agentsHome: fx.agentsHome }).status, 'NEEDS_RECONCILIATION');
});

test('allQuotedInHistory counts each text by its largest multiplicity in any one list, without double-counting overlaps', () => {
  const t = (text) => ['comment', 'x', text];
  assert.equal(pickupModule.allQuotedInHistory([[t('yes')], [t('yes'), t('yes')]], 'a "yes" b'), false);
  assert.equal(pickupModule.allQuotedInHistory([[t('yes')], [t('yes'), t('yes')]], '"yes" "yes"'), true);
  assert.equal(pickupModule.allQuotedInHistory([[t('yes')], [t('yes')]], '"yes"'), true, 'the same input in both lists needs one quote');
  assert.equal(pickupModule.allQuotedInHistory([[t('no')]], ''), false);
});

// F4: a stuck round with uncertain delivery is never closed by history, at account or at publish.
test('wedge 9/30: a stuck round with uncertain delivery stays refused even with every input quoted in history', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const stuck = await buildWedge(fx);
  const paths = receiptPaths({ agentsHome: fx.agentsHome, project: fs.realpathSync(fx.repo), page: fx.options.page });
  fs.writeFileSync(paths.receipt, `${JSON.stringify({ ...stuck, uncertainAt: NOW }, null, 2)}\n`);
  assert.throws(
    () => pickupModule.closeRound({ ...fx.options, owner: 'skills-fable', reconciliation: 'x' }, { agentsHome: fx.agentsHome, now: NOW, readHistory: () => W_HISTORY }),
    /outside RECORDED/,
  );
  const h = wedgePublish(fx, { fresh: W_CHANGED, history: { [W_HISTORY_DAY]: W_HISTORY }, owner: 'skills-fable' });
  await assert.rejects(h.run(), (error) => error.code === 3);
  assert.equal(h.notionWrites.length, 0);
});

// F4: publish --clear-done on a round that never reached RECORDED is refused (it used to clear Done).
test('publish --clear-done refuses a round still WAITING_OWNER: the round cannot be accounted, Done stays checked', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const waiting = await pickupOnce({ ...fx.options, owner: undefined }, deps(fx, { readPage: async () => W_ROUND }));
  assert.equal(waiting.status, 'WAITING_OWNER');
  const history = { '2026-10-01': `# Oct 1, 2026\nSummary: the answers are recorded.\n- Ben ticked "${W_HOOK[0]}" and "${W_NETCUP[0]}".\n` };
  const clean = wedgePage([wedgeBlock('Codex hook failure', W_HOOK), wedgeBlock('Delete prompts on Netcup', W_NETCUP)], false);
  const h = wedgePublish(fx, { fresh: W_ROUND, history, owner: 'skills-fable', lastRender: clean });
  await assert.rejects(h.run(), (error) => error.code === 3 && /could not be accounted, so Done was not cleared/.test(error.message));
  assert.equal(h.notionWrites.length, 0);
});

// F4: "origin only" on a real repository: an unpushed local commit and an uncommitted file are ignored.
test('readOriginHistory on a real repo reads only what origin/main holds, never an unpushed commit or the working tree', (t) => {
  const fx = gitMainFixture(); t.after(fx.cleanup);
  const git = (...args) => execFileSync('git', args, { cwd: fx.repo, env: fx.env, encoding: 'utf8' });
  const bare = path.join(fx.fixtureRoot, 'origin-only.git');
  execFileSync('git', ['init', '--quiet', '--bare', bare], { env: fx.env });
  git('branch', '-M', 'main');
  git('remote', 'add', 'origin', bare);
  const dir = path.join(fx.repo, 'docs', 'decisions', 'history');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-09-30.md'), '# Sep 30\n- pushed "answer one".\n');
  git('add', '-A'); git('commit', '-q', '-m', 'history day pushed'); git('push', '-q', '-u', 'origin', 'main');
  fs.writeFileSync(path.join(dir, '2026-10-01.md'), '# Oct 1\n- unpushed "answer two".\n');
  git('add', '-A'); git('commit', '-q', '-m', 'history day not pushed');
  fs.writeFileSync(path.join(dir, '2026-10-02.md'), '# Oct 2\n- uncommitted "answer three".\n');
  const text = pickupModule.readOriginHistory(fx.repo);
  assert.match(text, /pushed "answer one"/);
  assert.equal(text.includes('answer two'), false, 'an unpushed local commit is not origin history');
  assert.equal(text.includes('answer three'), false, 'the working tree is not origin history');
});

// ─────────────────────────────────────────────────────────────────────────────
// Lane 64b: `rebind` moves a receipt's project binding after a repo move. The fixture is the
// 9/30 state, synthesised: the stuck round is built in a sealed repo, then the repo directory is
// renamed so its old path no longer exists, keeping `.agents/project.json` and the untracked
// pointer files under docs/notes.
// ─────────────────────────────────────────────────────────────────────────────

async function movedRepo(t, { build = buildWedge } = {}) {
  const fx = fixture(); t.after(fx.cleanup);
  const receipt = await build(fx);
  const moved = path.join(fx.fixtureRoot, 'moved-pickup');
  fs.renameSync(fx.repo, moved);
  assert.equal(fs.existsSync(fx.repo), false, 'the old path is gone');
  const newProject = fs.realpathSync(moved);
  const options = { ...fx.options, repo: moved };
  const rebindOptions = { repo: moved, page: fx.options.page, fromProject: receipt.project };
  const run = (extra = {}, over = {}) => pickupModule.rebind(
    { ...rebindOptions, ...extra }, { agentsHome: fx.agentsHome, now: NOW, ...over },
  );
  const stat = () => status(options, { agentsHome: fx.agentsHome });
  const receiptFile = receiptPaths({ agentsHome: fx.agentsHome, project: newProject, page: fx.options.page }).receipt;
  return { fx, receipt, moved, newProject, options, rebindOptions, run, stat, receiptFile };
}

function treeBytes(root, into = new Map()) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) treeBytes(full, into);
    else if (entry.isFile()) into.set(full, fs.readFileSync(full).toString('base64'));
  }
  return into;
}

const readJsonFile = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const captureFiles = (fx, receipt) => [receipt.privateCaptureRef, receipt.reconciliationPrivateCaptureRef]
  .filter(Boolean).map((ref) => privateFile(fx, receipt, ref));

/** An orphan next-round capture (or an earlier round) under the saved scope, with the old identity. */
function writeExtraCapture(fx, receipt, round, text = PAGE) {
  const bytes = Buffer.from(text, 'utf8');
  const file = path.join(fx.agentsHome, 'ws', 'decisions-pickup', 'captures', receipt.projectScope, `r${round}.json`);
  fs.writeFileSync(file, `${JSON.stringify({
    version: 2, type: 'decisions-pickup-private-capture', page: receipt.page, project: receipt.project,
    projectScope: receipt.projectScope, transportRepo: receipt.transportRepo, round, readAt: NOW,
    owner: receipt.owner, from: receipt.from, digest: crypto.createHash('sha256').update(bytes).digest('hex'),
    originalEncoding: 'utf8-base64', originalBytes: bytes.toString('base64'), items: [], reason: 'synthetic',
  }, null, 2)}\n`);
  return file;
}

test('rebind 64b: a moved repo is refused before and bound and intact after, the saved scope and owner kept', async (t) => {
  const m = await movedRepo(t);
  const extra = writeExtraCapture(m.fx, m.receipt, m.receipt.round + 1);
  const before = m.stat();
  assert.equal(before.status, 'PENDING_MANUAL_HANDOFF');
  assert.equal(before.reason, 'this page is bound to a different authorization project');
  assert.equal(before.boundProject, m.receipt.project);
  const out = m.run();
  assert.deepEqual(out.rebound, { from: m.receipt.project, to: m.newProject });
  assert.equal(out.status, 'NEEDS_RECONCILIATION');
  const after = m.stat();
  assert.equal(after.status, 'NEEDS_RECONCILIATION', 'the receipt real state, no longer the foreign-project refusal');
  assert.equal(after.reason, undefined);
  assert.equal(after.evidenceIntegrity.status, 'OK');
  const r = after.receipt;
  assert.equal(r.project, m.newProject);
  assert.equal(r.transportRepo, m.newProject);
  assert.notEqual(r.project, m.receipt.project);
  for (const key of ['projectScope', 'privateCaptureRef', 'reconciliationPrivateCaptureRef', 'detailsPath', 'noteId', 'owner', 'state', 'round', 'digest', 'observedDigest', 'handoffStatus', 'requestedOwner']) {
    assert.deepEqual(r[key], m.receipt[key], key);
  }
  assert.equal(r.owner, 'skills-a');
  const argv = r.exactSendInputs.argv;
  assert.equal(argv[argv.indexOf('--recipient-repo') + 1], m.newProject);
  assert.equal(argv[argv.indexOf('--sender-repo') + 1], m.newProject);
  assert.deepEqual(argv.filter((v) => v === m.receipt.transportRepo), [], 'the old path is nowhere in the send argv');
  assert.deepEqual({ ...r.exactSendInputs, argv: undefined }, { ...m.receipt.exactSendInputs, argv: undefined },
    'id, topic, text, details, kind, needs untouched');
  for (const file of [...captureFiles(m.fx, m.receipt), extra]) {
    const capture = readJsonFile(file);
    assert.equal(capture.project, m.newProject, file);
    assert.equal(capture.transportRepo, m.newProject, file);
    assert.equal(capture.projectScope, m.receipt.projectScope, file);
  }
  const bytes = boundPickup(m.fx).openPrivateCapture({ ...m.options, round: m.receipt.round });
  assert.equal(bytes.toString('utf8'), W_ROUND);
});

test('rebind 64b: a different --owner leaves receipt.owner and sets the handoff marker that accounting settles', async (t) => {
  const build = async (fx) => {
    const recorded = await pickupOnce({ ...fx.options, owner: 'skills-a' }, deps(fx, { readPage: async () => W_ROUND }));
    assert.equal(recorded.status, 'RECORDED');
    assert.equal(recorded.receipt.handoffStatus, undefined);
    return recorded.receipt;
  };
  const m = await movedRepo(t, { build });
  const out = m.run({ owner: 'skills-fable' });
  assert.equal(out.status, 'RECORDED');
  assert.equal(out.receipt.owner, 'skills-a', 'the saved owner is never rewritten');
  assert.equal(out.receipt.handoffStatus, 'PENDING_MANUAL_HANDOFF');
  assert.equal(out.receipt.requestedOwner, 'skills-fable');
  assert.equal(out.receipt.handoffObservedAt, NOW);
  assert.equal(out.evidenceIntegrity.status, 'OK');
  const closed = pickupModule.closeRound({
    repo: m.moved, page: m.options.page, owner: 'skills-fable', reconciliation: 'rebound and handled',
  }, { agentsHome: m.fx.agentsHome, now: NOW });
  assert.equal(closed.status, 'ACCOUNTED');
  assert.equal(closed.receipt.accountedBy, 'skills-fable');
  assert.equal(closed.receipt.owner, 'skills-a');
  assert.equal(closed.receipt.handoffStatus, null, 'closing the round clears the marker');
  assert.equal(closed.evidenceIntegrity.status, 'OK');
  const same = await movedRepo(t, { build });
  const unchanged = same.run({ owner: 'skills-a' });
  assert.equal(unchanged.receipt.handoffStatus, undefined, 'the same owner sets no marker');
});

test('rebind 64b: an existing old path is refused, every file byte-identical, and a live second project still gets the old refusal', async (t) => {
  const m = await movedRepo(t);
  fs.mkdirSync(m.receipt.project, { recursive: true });
  const before = treeBytes(m.fx.agentsHome);
  const notes = treeBytes(path.join(m.moved, 'docs'));
  assert.throws(() => m.run(), (error) => error instanceof PickupError && /still exists.*never taken over/.test(error.message));
  assert.deepEqual(treeBytes(m.fx.agentsHome), before);
  assert.deepEqual(treeBytes(path.join(m.moved, 'docs')), notes);
  // A live project is never taken over: a copy at the old path, with its own config, is refused too.
  fs.mkdirSync(path.join(m.receipt.project, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(m.receipt.project, '.agents', 'project.json'), JSON.stringify({ decisions_url: m.options.page }));
  assert.throws(() => pickupModule.rebind(
    { repo: m.receipt.project, page: m.options.page, fromProject: m.receipt.project }, { agentsHome: m.fx.agentsHome, now: NOW },
  ), /still exists/);
  const live = m.stat();
  assert.equal(live.status, 'PENDING_MANUAL_HANDOFF');
  assert.equal(live.reason, 'this page is bound to a different authorization project');
  assert.throws(() => account({ ...m.options, outcome: path.join(m.moved, 'unused.md') }, { agentsHome: m.fx.agentsHome }), /bound to another authorization project/);
  assert.deepEqual(treeBytes(m.fx.agentsHome), before);
});

test('rebind 64b: a --from-project that is not the saved binding is refused with no write', async (t) => {
  const m = await movedRepo(t);
  const before = treeBytes(m.fx.agentsHome);
  const elsewhere = path.join(m.fx.fixtureRoot, 'never-existed');
  assert.throws(() => m.run({ fromProject: elsewhere }), /not --from-project/);
  assert.throws(() => m.run({ fromProject: undefined }), /--from-project is required/);
  assert.deepEqual(treeBytes(m.fx.agentsHome), before);
});

test('rebind 64b: a tampered saved capture is refused, receipt and captures byte-identical', async (t) => {
  for (const which of [0, 1]) {
    const m = await movedRepo(t);
    const file = captureFiles(m.fx, m.receipt)[which];
    const capture = readJsonFile(file);
    capture.originalBytes = Buffer.from('<summary>Changed</summary>\n- [x] Done\n', 'utf8').toString('base64');
    fs.writeFileSync(file, `${JSON.stringify(capture, null, 2)}\n`);
    const before = treeBytes(m.fx.agentsHome);
    assert.throws(() => m.run(), (error) => error instanceof PickupError && /is not intact/.test(error.message), `capture ${which}`);
    assert.deepEqual(treeBytes(m.fx.agentsHome), before, `capture ${which} refusal writes nothing`);
    fs.unlinkSync(file);
    const missing = treeBytes(m.fx.agentsHome);
    assert.throws(() => m.run(), /is not intact/, 'a missing capture refuses too');
    assert.deepEqual(treeBytes(m.fx.agentsHome), missing);
  }
});

test('rebind 64b: a tampered earlier-round capture under the saved scope is refused with no write', async (t) => {
  const m = await movedRepo(t);
  const extra = writeExtraCapture(m.fx, m.receipt, m.receipt.round + 1);
  const capture = readJsonFile(extra);
  capture.originalBytes = Buffer.from('tampered', 'utf8').toString('base64');
  fs.writeFileSync(extra, `${JSON.stringify(capture, null, 2)}\n`);
  const before = treeBytes(m.fx.agentsHome);
  assert.throws(() => m.run(), /is not intact/);
  assert.deepEqual(treeBytes(m.fx.agentsHome), before);
  fs.writeFileSync(extra, '{not json');
  assert.throws(() => m.run(), /is unreadable/);
});

test('rebind 64b: a pointer missing under the new transport repository is refused with no write', async (t) => {
  const m = await movedRepo(t);
  fs.unlinkSync(path.join(m.moved, ...m.receipt.detailsPath.split('/')));
  const before = treeBytes(m.fx.agentsHome);
  assert.throws(() => m.run(), /details pointer is not present under the new transport repository \(MISSING\)/);
  assert.deepEqual(treeBytes(m.fx.agentsHome), before);
});

test('rebind 64b: a missing receipt and a version-1 legacy receipt are refused', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  const run = () => pickupModule.rebind(
    { repo: fx.repo, page: fx.options.page, fromProject: path.join(fx.fixtureRoot, 'gone') }, { agentsHome: fx.agentsHome, now: NOW },
  );
  assert.throws(run, /no pickup receipt to rebind/);
  const recorded = await pickupOnce(fx.options, deps(fx));
  const file = receiptPaths({ agentsHome: fx.agentsHome, project: recorded.receipt.project, page: fx.options.page }).receipt;
  fs.writeFileSync(file, `${JSON.stringify({ ...recorded.receipt, version: 1 }, null, 2)}\n`);
  const before = treeBytes(fx.agentsHome);
  assert.throws(run, /version-1 legacy receipt cannot be rebound/);
  assert.deepEqual(treeBytes(fx.agentsHome), before);
});

test('rebind 64b: a second rebind is a clean refusal that changes nothing', async (t) => {
  const m = await movedRepo(t);
  m.run();
  const before = treeBytes(m.fx.agentsHome);
  assert.throws(() => m.run(), (error) => error instanceof PickupError && /not --from-project/.test(error.message));
  assert.deepEqual(treeBytes(m.fx.agentsHome), before);
  assert.equal(m.stat().evidenceIntegrity.status, 'OK');
});

test('rebind 64b: a crash after the captures are rewritten is finished by running rebind again', async (t) => {
  const m = await movedRepo(t);
  const extra = writeExtraCapture(m.fx, m.receipt, m.receipt.round + 1);
  let failed = 0;
  const fsImpl = {
    ...fs,
    renameSync(from, to) {
      if (to === m.receiptFile && failed === 0) { failed += 1; const error = new Error('injected'); error.code = 'EIO'; throw error; }
      return fs.renameSync(from, to);
    },
  };
  assert.throws(() => m.run({}, { fsImpl }), /injected/);
  assert.equal(failed, 1);
  assert.equal(readJsonFile(m.receiptFile).project, m.receipt.project, 'the receipt is written last, so it is still the old one');
  for (const file of [...captureFiles(m.fx, m.receipt), extra]) {
    assert.equal(readJsonFile(file).project, m.newProject, 'the captures were already rewritten');
  }
  assert.equal(m.stat().status, 'PENDING_MANUAL_HANDOFF');
  const out = m.run();
  assert.equal(out.status, 'NEEDS_RECONCILIATION');
  assert.equal(out.evidenceIntegrity.status, 'OK');
  assert.equal(m.stat().evidenceIntegrity.status, 'OK');
  assert.equal(m.stat().receipt.project, m.newProject);
});

test('rebind 64b: the CLI verb runs through a child process and runCli, sealed to AGENTS_HOME', async (t) => {
  const m = await movedRepo(t);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = (...args) => spawnSync(process.execPath, [path.join(here, 'decisions-pickup.mjs'), ...args], {
    encoding: 'utf8', timeout: 30_000, windowsHide: true,
    env: childEnv(m.fx.fixtureRoot, { AGENTS_HOME: m.fx.agentsHome }),
  });
  const missing = cli('rebind', '--page', m.options.page, '--repo', m.moved);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--from-project is required/);
  const child = cli('rebind', '--page', m.options.page, '--repo', m.moved, '--from-project', m.receipt.project);
  assert.equal(child.error, undefined, String(child.error?.message ?? ''));
  assert.equal(child.status, 0, `exit=${child.status}; stderr=${child.stderr}`);
  const parsed = JSON.parse(child.stdout);
  assert.equal(parsed.status, 'NEEDS_RECONCILIATION');
  assert.deepEqual(parsed.rebound, { from: m.receipt.project, to: m.newProject });
  assert.equal(parsed.evidenceIntegrity.status, 'OK');
  assert.equal(m.stat().receipt.project, m.newProject);
  const again = cli('rebind', '--page', m.options.page, '--repo', m.moved, '--from-project', m.receipt.project);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /not --from-project/);
  const errors = [];
  const code = await pickupModule.runCli({ argv: ['rebind', '--page', m.options.page, '--repo', m.moved], write: () => {}, writeErr: (text) => errors.push(text) });
  assert.equal(code, 1);
  assert.match(errors.join(''), /--from-project is required/);
});

async function buildAccounted(fx, outcomeDir = fx.repo) {
  const first = await pickupOnce({ ...fx.options, owner: 'skills-a' }, deps(fx, { send: async () => ({}) }));
  assert.equal(first.status, 'RECORDED');
  fs.mkdirSync(outcomeDir, { recursive: true });
  const report = path.join(outcomeDir, 'outcome.md');
  fs.writeFileSync(report, 'Owner-attestation: decision-owner\nFresh-page-reconciliation: fresh and checked\nAccounted-ref: selection-001 applied\nAccounted-ref: comment-001 answered\n');
  const done = account({ ...fx.options, outcome: report }, { agentsHome: fx.agentsHome, now: NOW });
  assert.equal(done.status, 'ACCOUNTED');
  return done.receipt;
}

test('rebind 64b: an ACCOUNTED round whose outcome lived in the repo is rebound with its outcome verified', async (t) => {
  const m = await movedRepo(t, { build: (fx) => buildAccounted(fx, path.join(fx.repo, 'docs')) });
  assert.equal(m.receipt.state, 'ACCOUNTED');
  const oldOutcome = m.receipt.accountingOutcome.path;
  assert.equal(m.stat().status, 'PENDING_MANUAL_HANDOFF');
  const out = m.run();
  assert.equal(out.status, 'ACCOUNTED');
  assert.equal(out.evidenceIntegrity.status, 'OK');
  const after = m.stat();
  assert.equal(after.status, 'ACCOUNTED');
  assert.equal(after.evidenceIntegrity.status, 'OK');
  const moved = after.receipt.accountingOutcome.path;
  assert.notEqual(moved, oldOutcome);
  assert.equal(path.relative(m.newProject, moved), path.join('docs', 'outcome.md'));
  assert.equal(after.receipt.accountingOutcome.digest, m.receipt.accountingOutcome.digest);
});

test('rebind 64b: an ACCOUNTED round whose outcome is gone is refused with every file byte-identical', async (t) => {
  const m = await movedRepo(t, { build: (fx) => buildAccounted(fx, path.join(fx.repo, 'docs')) });
  fs.unlinkSync(path.join(m.moved, 'docs', 'outcome.md'));
  const before = treeBytes(m.fx.agentsHome);
  assert.throws(() => m.run(), (error) => error instanceof PickupError && /accounting outcome does not verify/.test(error.message));
  assert.deepEqual(treeBytes(m.fx.agentsHome), before);
});

test('rebind 64b: a differing --owner sets no handoff marker on an ACCOUNTED receipt', async (t) => {
  const m = await movedRepo(t, { build: (fx) => buildAccounted(fx, path.join(fx.repo, 'docs')) });
  const out = m.run({ owner: 'skills-o' });
  assert.equal(out.receipt.handoffStatus, undefined);
  assert.equal(out.receipt.requestedOwner, undefined);
  assert.equal(out.receipt.owner, 'skills-a');
  assert.equal(m.stat().status, 'ACCOUNTED');
});
