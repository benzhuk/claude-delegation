import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { makeTempHome } from '../../../scripts/test-home.mjs';
import { buildEnvelope } from '../../multi/scripts/envelope.mjs';
import { runNoteSend } from '../../multi/scripts/note-send.mjs';
import {
  account, inspectTransport, openPrivateCapture, pickupOnce, readPageWithCli, receiptPaths, status,
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
  const changed = await pickupOnce(active.options, deps(active, { readPage: async () => EMPTY_DONE }));
  assert.equal(changed.status, 'NEEDS_RECONCILIATION');
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
