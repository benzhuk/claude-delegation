import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { makeTempHome } from '../../../scripts/test-home.mjs';
import { buildEnvelope } from '../../multi/scripts/envelope.mjs';
import {
  account, inspectTransport, pickupOnce, readPageWithCli, receiptPaths, status,
} from './decisions-pickup.mjs';

const PAGE = `<summary>Choose transport</summary>
- [x] Keep the existing transport
No default: owner action is required
\\*\\*Please preserve the capture
- [x] Done
`;
const UNCHECKED = PAGE.replace('- [x] Done', '- [ ] Done');
const CHANGED = PAGE.replace('Please preserve the capture', 'Please preserve the capture and report it');
const NOW = '2026-09-23T16:00:00.000Z';

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
  assert.equal(fs.readdirSync(path.join(fx.repo, 'docs', 'notes')).length, 1);
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
  const changedCapture = JSON.parse(fs.readFileSync(path.join(fx.repo, ...result.receipt.reconciliationCapturePath.split('/')), 'utf8'));
  assert.equal(Buffer.from(changedCapture.originalBytes, 'base64').toString('utf8'), CHANGED);
  assert.equal(sends, 1);
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
});

test('capture digest is enforced before recovery or accounting', async (t) => {
  const fx = fixture(); t.after(fx.cleanup);
  let sends = 0;
  await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  const saved = status(fx.options, { agentsHome: fx.agentsHome }).receipt;
  const capture = path.join(fx.repo, ...saved.capturePath.split('/'));
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
  await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  assert.equal(sends, 1, 'a still-checked page cannot become round 2');
  await pickupOnce(fx.options, deps(fx, { readPage: async () => UNCHECKED }));
  const second = await pickupOnce(fx.options, deps(fx, { send: async () => { sends += 1; return {}; } }));
  assert.equal(second.receipt.round, 2);
  assert.equal(sends, 2);
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
