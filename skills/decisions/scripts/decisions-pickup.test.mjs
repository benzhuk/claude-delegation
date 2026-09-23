import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { makeTempHome } from '../../../scripts/test-home.mjs';
import { buildEnvelope } from '../../multi/scripts/envelope.mjs';
import { runNoteSend } from '../../multi/scripts/note-send.mjs';
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

test('capture and Details use the same durable main-checkout repository as actual note transport', async (t) => {
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
  assert.equal(fs.existsSync(path.join(main, ...result.receipt.capturePath.split('/'))), true);
  assert.equal(fs.existsSync(path.join(worktree, ...result.receipt.capturePath.split('/'))), false);
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
