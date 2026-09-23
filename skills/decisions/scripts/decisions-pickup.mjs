#!/usr/bin/env node
/**
 * decisions-pickup — one explicit, single-page pickup attempt.
 *
 * The decisions page remains the owner's attended workflow. This command only captures a
 * checked registered page and records one peer note. Its local receipt is recovery metadata,
 * never evidence that the owner's choices were carried out.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseDocument } from './decisions-read.mjs';
import { loadProjectConfig } from './project-config.mjs';
import { runNoteSend } from '../../multi/scripts/note-send.mjs';
import { parseEnvelope } from '../../multi/scripts/envelope.mjs';
import { gitRunner, mainCheckout } from '../../multi/scripts/transport.mjs';

export const RECEIPT_VERSION = 1;
export const READER_TIMEOUT_MS = 15_000;
const NOTE_KIND = 'ASK';
const NOTE_NEEDS = 'ack';

export class PickupError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'PickupError';
    this.exitCode = exitCode;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalProject(repo, fsImpl = fs) {
  const absolute = path.resolve(repo);
  try {
    const real = fsImpl.realpathSync(absolute);
    if (!fsImpl.statSync(real).isDirectory()) throw new PickupError(`repo is not a directory: ${repo}`);
    return real;
  } catch (error) {
    if (error instanceof PickupError) throw error;
    throw new PickupError(`cannot resolve repo ${repo}: ${error.message}`);
  }
}

function normalizedPage(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const withoutQuery = raw.split(/[?#]/, 1)[0].replace(/\/$/, '');
  const last = withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1);
  const idMatch = /([0-9a-fA-F]{32}|[0-9a-fA-F-]{36})$/.exec(last);
  return (idMatch ? idMatch[1] : raw).replaceAll('-', '').toLowerCase();
}

function validateSlug(label, value) {
  const slug = String(value ?? '');
  if (!/^[a-z0-9-]+$/.test(slug)) throw new PickupError(`${label} must match [a-z0-9-]+`);
  return slug;
}

function agentsHome(env = process.env) {
  return path.resolve(env.AGENTS_HOME || path.join(os.homedir(), '.agents'));
}

export function receiptPaths({ agentsHome: base, project, page }) {
  const key = sha256(normalizedPage(page));
  const projectScope = sha256(`${project}\0${normalizedPage(page)}`);
  const directory = path.join(base, 'ws', 'decisions-pickup');
  return {
    key,
    projectScope,
    directory,
    receipt: path.join(directory, `${key}.json`),
    claim: path.join(directory, `${key}.claim`),
  };
}

function readJson(file, fsImpl = fs) {
  try {
    const parsed = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
    if (parsed.version !== RECEIPT_VERSION) throw new Error(`unsupported version ${parsed.version}`);
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new PickupError(`receipt unreadable at ${file}: ${error.message}`);
  }
}

let writeSequence = 0;
function atomicJson(file, value, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${writeSequence += 1}`;
  fsImpl.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  fsImpl.renameSync(temp, file);
}

function acquireClaim(claim, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(claim), { recursive: true });
  try {
    fsImpl.mkdirSync(claim);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new PickupError(`page already has an exclusive pickup claim: ${claim}`);
    }
    throw error;
  }
}

function releaseClaim(claim, fsImpl = fs) {
  try { fsImpl.rmdirSync(claim); } catch { /* a failed cleanup stays visible; never break it automatically */ }
}

function writeCaptureExclusive(file, capture, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  const serialized = `${JSON.stringify(capture, null, 2)}\n`;
  try {
    fsImpl.writeFileSync(file, serialized, { encoding: 'utf8', flag: 'wx' });
    return capture;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let existing;
    try { existing = JSON.parse(fsImpl.readFileSync(file, 'utf8')); } catch (readError) {
      throw new PickupError(`orphan capture is unreadable and needs reconciliation: ${readError.message}`);
    }
    if (existing.version !== RECEIPT_VERSION || existing.page !== capture.page
        || existing.project !== capture.project || existing.digest !== capture.digest
        || existing.projectScope !== capture.projectScope
        || existing.transportRepo !== capture.transportRepo
        || (existing.owner !== capture.owner && existing.owner !== null) || existing.from !== capture.from) {
      throw new PickupError(`orphan capture conflicts with this pickup and needs reconciliation: ${file}`);
    }
    return existing;
  }
}

function capturedItems(doc) {
  const items = [];
  let selection = 0;
  let comment = 0;
  for (const decision of doc.decisions) {
    for (const option of decision.options.filter((entry) => entry.ticked)) {
      selection += 1;
      items.push({ ref: `selection-${String(selection).padStart(3, '0')}`, kind: 'selection', title: decision.title, text: option.text, line: option.line });
    }
    for (const entry of decision.comments) {
      comment += 1;
      items.push({
        ref: `comment-${String(comment).padStart(3, '0')}`, kind: 'comment', title: decision.title,
        text: entry.text, line: entry.line, replied: entry.replied,
      });
    }
  }
  for (const entry of doc.unattached) {
    if (entry.kind === 'comment') {
      comment += 1;
      items.push({ ref: `comment-${String(comment).padStart(3, '0')}`, kind: 'comment', title: entry.under ?? null, text: entry.text, line: entry.line, replied: false });
    } else if (entry.kind === 'tick') {
      selection += 1;
      items.push({ ref: `selection-${String(selection).padStart(3, '0')}`, kind: 'selection', title: entry.under ?? null, text: entry.text, line: entry.line });
    }
  }
  return items;
}

function captureRelative(projectScope, round) {
  return `docs/notes/decisions-pickup-${projectScope}-r${round}.json`;
}

function changedCaptureRelative(projectScope, round, digest) {
  return `docs/notes/decisions-pickup-${projectScope}-r${round}-changed-${digest}.json`;
}

function verifyOneCapture(receipt, relative, expectedDigest, fsImpl = fs) {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) {
    return { status: 'INVALID_PATH', path: relative ?? null };
  }
  const full = path.resolve(receipt.transportRepo, ...relative.split('/'));
  const rel = path.relative(receipt.transportRepo, full);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return { status: 'INVALID_PATH', path: relative };
  try {
    const capture = JSON.parse(fsImpl.readFileSync(full, 'utf8'));
    const bytes = Buffer.from(String(capture.originalBytes ?? ''), 'base64');
    if (capture.version !== RECEIPT_VERSION || capture.page !== receipt.page
        || capture.project !== receipt.project || capture.round !== receipt.round
        || capture.projectScope !== receipt.projectScope
        || capture.transportRepo !== receipt.transportRepo
        || capture.digest !== expectedDigest || sha256(bytes) !== expectedDigest) {
      return { status: 'TAMPERED', path: relative };
    }
    return { status: 'OK', path: relative };
  } catch (error) {
    return { status: error?.code === 'ENOENT' ? 'MISSING' : 'UNREADABLE', path: relative, error: error.message };
  }
}

function verifyReceiptEvidence(receipt, fsImpl = fs) {
  if (!receipt) return { status: 'NONE' };
  const capture = verifyOneCapture(receipt, receipt.capturePath, receipt.digest, fsImpl);
  if (capture.status !== 'OK') return { status: 'CAPTURE_INVALID', capture };
  if (receipt.reconciliationCapturePath) {
    const changed = verifyOneCapture(receipt, receipt.reconciliationCapturePath, receipt.observedDigest, fsImpl);
    if (changed.status !== 'OK') return { status: 'RECONCILIATION_CAPTURE_INVALID', capture, changed };
  }
  if (receipt.state === 'ACCOUNTED' && receipt.accountingOutcome) {
    try {
      const outcome = fsImpl.readFileSync(receipt.accountingOutcome.path);
      if (sha256(outcome) !== receipt.accountingOutcome.digest) return { status: 'OUTCOME_TAMPERED', capture };
    } catch (error) {
      return { status: 'OUTCOME_MISSING', capture, error: error.message };
    }
  }
  return { status: 'OK', capture };
}

function requiredItemsFromCapture(receipt, now, fsImpl = fs) {
  const full = path.join(receipt.transportRepo, ...receipt.capturePath.split('/'));
  const capture = JSON.parse(fsImpl.readFileSync(full, 'utf8'));
  const raw = Buffer.from(capture.originalBytes, 'base64').toString('utf8');
  return capturedItems(parseDocument(raw, { now }));
}

function sendInputs({ from, owner, projectScope, round, capturePath, transportRepo }) {
  const topic = `decisions-${projectScope}`;
  const id = `${from}-${topic}-${round}`;
  const text = `Owner decisions pickup round ${round} is ready`;
  const argv = [
    '--from', from, '--to', owner, '--kind', NOTE_KIND, '--topic', topic,
    '--text', text, '--details', capturePath, '--needs', NOTE_NEEDS,
    '--recipient-repo', transportRepo, '--sender-repo', transportRepo, '--id', id, '--no-type',
  ];
  return { id, topic, text, details: capturePath, kind: NOTE_KIND, needs: NOTE_NEEDS, argv };
}

function lineMatchesSend(parsed, receipt) {
  const send = receipt.exactSendInputs;
  return parsed.id === receipt.noteId && parsed.from === receipt.from && parsed.to === receipt.owner
    && parsed.kind === send.kind && parsed.body === `${send.text}.`
    && parsed.details === send.details && parsed.needs === send.needs;
}

function ledgerFiles({ transportRepo, agentsHome: base }, fsImpl = fs) {
  const dirs = [path.join(transportRepo, 'docs', 'ledger'), path.join(base, 'notes')];
  const files = [];
  for (const directory of dirs) {
    let entries;
    try { entries = fsImpl.readdirSync(directory, { withFileTypes: true }); } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) if (entry.isFile() && entry.name.endsWith('.md')) files.push(path.join(directory, entry.name));
  }
  return files;
}

/** Positive evidence only: unreadable and absent are distinct and neither authorizes a resend. */
export function inspectTransport(receipt, { fsImpl = fs, agentsHome: base = agentsHome() } = {}) {
  try {
    const same = new Set();
    const conflicts = new Set();
    for (const file of ledgerFiles({ transportRepo: receipt.transportRepo, agentsHome: base }, fsImpl)) {
      const lines = fsImpl.readFileSync(file, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const parsed = parseEnvelope(line);
        if (!parsed || parsed.id !== receipt.noteId) continue;
        if (lineMatchesSend(parsed, receipt)) same.add(line);
        else conflicts.add(line);
      }
    }
    if (conflicts.size) return { status: 'CONFLICT', matches: [...same], conflicts: [...conflicts] };
    if (same.size) return { status: 'MATCH', matches: [...same], conflicts: [] };
    return { status: 'ABSENT', matches: [], conflicts: [] };
  } catch (error) {
    return { status: 'UNREADABLE', error: error.message, matches: [], conflicts: [] };
  }
}

/** The production reader: one bounded invocation of the supplied Notion CLI. */
export function readPageWithCli({ reader, page, timeoutMs = READER_TIMEOUT_MS, spawn = spawnSync }) {
  if (!reader) throw new PickupError('--reader is required for --once');
  const readerPath = path.resolve(reader);
  const isNodeScript = /\.(?:c|m)?js$/i.test(readerPath);
  const command = isNodeScript ? process.execPath : readerPath;
  const args = isNodeScript ? [readerPath, 'read', page] : ['read', page];
  const result = spawn(command, args, {
    encoding: 'utf8', timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw new PickupError(`reader failed: ${result.error.message}`);
  if (result.status !== 0) throw new PickupError(`reader exited ${result.status}: ${String(result.stderr ?? '').trim() || 'no error text'}`);
  if (!String(result.stdout ?? '').trim()) throw new PickupError('reader returned an empty page');
  return String(result.stdout);
}

function registeredProject(repo, page, fsImpl = fs) {
  const project = canonicalProject(repo, fsImpl);
  const loaded = loadProjectConfig(project);
  if (loaded.source === 'unreadable') throw new PickupError('project config is unreadable');
  if (!loaded.config.decisions_url) throw new PickupError('project has no registered decisions_url');
  if (normalizedPage(loaded.config.decisions_url) !== normalizedPage(page)) {
    throw new PickupError(`page ${page} is not this project's registered decisions_url`);
  }
  return project;
}

function durableTransportRepo(project, git = gitRunner, fsImpl = fs) {
  const resolved = mainCheckout(project, git);
  if (!resolved) throw new PickupError(`cannot resolve durable transport repo for ${project}`);
  return canonicalProject(resolved, fsImpl);
}

function receiptStatus(receipt, claim, fsImpl = fs, claimed = fsImpl.existsSync(claim)) {
  const evidenceIntegrity = verifyReceiptEvidence(receipt, fsImpl);
  const effectiveStatus = receipt?.state === 'CAPTURE_INTENT'
    ? (evidenceIntegrity.status === 'OK' ? 'ORPHAN_CAPTURE' : 'NEEDS_RECONCILIATION')
    : (receipt && evidenceIntegrity.status !== 'OK' ? 'NEEDS_RECONCILIATION' : (receipt?.state ?? 'IDLE'));
  return {
    status: effectiveStatus,
    receipt,
    claimed,
    authoritative: false,
    evidenceIntegrity,
  };
}

function changedReceipt(receipt, raw, doc, now, fsImpl) {
  const observedDigest = sha256(Buffer.from(raw, 'utf8'));
  const relativeCapture = changedCaptureRelative(receipt.projectScope, receipt.round, observedDigest);
  const capturePath = path.join(receipt.transportRepo, ...relativeCapture.split('/'));
  writeCaptureExclusive(capturePath, {
    version: RECEIPT_VERSION,
    page: receipt.page,
    project: receipt.project,
    projectScope: receipt.projectScope,
    transportRepo: receipt.transportRepo,
    round: receipt.round,
    readAt: now.toISOString(),
    owner: receipt.owner,
    from: receipt.from,
    digest: observedDigest,
    originalEncoding: 'utf8-base64',
    originalBytes: Buffer.from(raw, 'utf8').toString('base64'),
    items: capturedItems(doc),
    reason: 'later checked-page bytes in the active round',
  }, fsImpl);
  return {
    ...receipt,
    previousState: receipt.state,
    state: 'NEEDS_RECONCILIATION',
    reconciliationReason: 'checked page bytes changed during the active round',
    observedDigest,
    reconciliationCapturePath: relativeCapture,
    observedAt: now.toISOString(),
  };
}

async function recoverSending(receipt, ctx) {
  const evidence = (ctx.inspectTransport ?? inspectTransport)(receipt, ctx);
  if (evidence.status === 'MATCH') {
    const updated = { ...receipt, state: 'RECORDED', recordedAt: ctx.now.toISOString(), transportEvidence: evidence };
    atomicJson(ctx.paths.receipt, updated, ctx.fsImpl);
    ctx.onTransition?.('RECORDED', updated);
    return updated;
  }
  const updated = {
    ...receipt,
    previousState: receipt.state,
    state: evidence.status === 'CONFLICT' ? 'NEEDS_RECONCILIATION' : 'UNKNOWN',
    uncertainAt: ctx.now.toISOString(),
    reconciliationReason: evidence.status === 'CONFLICT'
      ? 'the saved note id exists with conflicting envelope fields'
      : 'positive exact transport evidence is absent or unreadable; resend is forbidden',
    transportEvidence: evidence,
  };
  atomicJson(ctx.paths.receipt, updated, ctx.fsImpl);
  ctx.onTransition?.(updated.state, updated);
  return updated;
}

async function dispatchPrepared(receipt, ctx) {
  // All admission and recovery paths meet this same pre-send integrity contract.
  if (verifyReceiptEvidence(receipt, ctx.fsImpl).status !== 'OK') {
    const blocked = {
      ...receipt, previousState: receipt.state, state: 'NEEDS_RECONCILIATION',
      reconciliationReason: 'capture integrity failed before dispatch; sending is forbidden',
    };
    atomicJson(ctx.paths.receipt, blocked, ctx.fsImpl);
    ctx.onTransition?.('NEEDS_RECONCILIATION', blocked);
    return blocked;
  }
  const sending = { ...receipt, state: 'SENDING', sendingAt: ctx.now.toISOString() };
  atomicJson(ctx.paths.receipt, sending, ctx.fsImpl);
  ctx.onTransition?.('SENDING', sending);
  let result;
  try {
    result = await (ctx.send ?? runNoteSend)(sending.exactSendInputs.argv, ctx.sendDeps ?? {});
  } catch (error) {
    // note-send can throw after recording. Only an independently observed exact envelope resolves it.
    return recoverSending(sending, ctx);
  }
  const recorded = {
    ...sending,
    state: 'RECORDED',
    recordedAt: ctx.now.toISOString(),
    transportResult: { id: result?.id ?? sending.noteId, envelope: result?.envelope ?? null },
  };
  try {
    atomicJson(ctx.paths.receipt, recorded, ctx.fsImpl);
  } catch (error) {
    // A successful sender precedes this write, so failure to persist RECORDED is uncertain too.
    return recoverSending(sending, ctx);
  }
  ctx.onTransition?.('RECORDED', recorded);
  return recorded;
}

/** Injectable source seam. Production callers must still provide --reader and use readPageWithCli. */
export async function pickupOnce(options, deps = {}) {
  const fsImpl = deps.fsImpl ?? fs;
  const env = deps.env ?? process.env;
  const now = new Date(deps.now ?? Date.now());
  const project = registeredProject(options.repo, options.page, fsImpl);
  const base = deps.agentsHome ?? agentsHome(env);
  const paths = receiptPaths({ agentsHome: base, project, page: options.page });
  acquireClaim(paths.claim, fsImpl);
  try {
    let receipt = readJson(paths.receipt, fsImpl);
    if (receipt && receipt.project !== project) {
      return {
        ...receiptStatus(receipt, paths.claim, fsImpl, false),
        status: 'PENDING_MANUAL_HANDOFF',
        reason: 'this page is already bound to a different authorization project; no read or send was attempted',
        requestedProject: project,
        boundProject: receipt.project,
      };
    }
    const transportRepo = durableTransportRepo(project, deps.git ?? gitRunner, fsImpl);
    if (receipt && receipt.transportRepo !== transportRepo) {
      return {
        ...receiptStatus(receipt, paths.claim, fsImpl, false),
        status: 'NEEDS_RECONCILIATION',
        reason: 'the durable transport repository changed for this bound project',
        observedTransportRepo: transportRepo,
      };
    }
    const raw = deps.readPage
      ? await deps.readPage({ reader: options.reader, page: options.page, timeoutMs: READER_TIMEOUT_MS })
      : readPageWithCli({ reader: options.reader, page: options.page });
    let doc;
    try { doc = parseDocument(raw, { now }); } catch (error) {
      throw new PickupError(`registered page is BLIND: ${error.message}`, 3);
    }
    if (receipt && receipt.state !== 'CAPTURE_INTENT' && verifyReceiptEvidence(receipt, fsImpl).status !== 'OK') {
      return receiptStatus(receipt, paths.claim, fsImpl, false);
    }
    const digest = sha256(Buffer.from(raw, 'utf8'));

    if (receipt?.state === 'CAPTURE_INTENT') {
      if (doc.done !== true || doc.warnings.length || doc.shapeless.length || digest !== receipt.digest) {
        let interrupted;
        if (doc.done === true && digest !== receipt.digest) {
          interrupted = changedReceipt(receipt, raw, doc, now, fsImpl);
        } else {
          interrupted = {
            ...receipt,
            previousState: receipt.state,
            state: 'NEEDS_RECONCILIATION',
            reconciliationReason: 'capture intent no longer matches a valid checked page; dispatch is forbidden',
            observedDigest: digest,
            observedAt: now.toISOString(),
          };
        }
        atomicJson(paths.receipt, interrupted, fsImpl);
        return receiptStatus(interrupted, paths.claim, fsImpl, false);
      }
      const capture = {
        version: RECEIPT_VERSION,
        page: receipt.page,
        project: receipt.project,
        projectScope: receipt.projectScope,
        transportRepo: receipt.transportRepo,
        round: receipt.round,
        readAt: receipt.captureReadAt,
        owner: receipt.owner,
        from: receipt.from,
        digest: receipt.digest,
        originalEncoding: 'utf8-base64',
        originalBytes: Buffer.from(raw, 'utf8').toString('base64'),
        items: capturedItems(doc),
      };
      try {
        writeCaptureExclusive(path.join(receipt.transportRepo, ...receipt.capturePath.split('/')), capture, fsImpl);
      } catch (error) {
        const interrupted = {
          ...receipt,
          previousState: receipt.state,
          state: 'NEEDS_RECONCILIATION',
          reconciliationReason: `capture is missing, partial, or conflicting: ${error.message}`,
          observedAt: now.toISOString(),
        };
        atomicJson(paths.receipt, interrupted, fsImpl);
        return receiptStatus(interrupted, paths.claim, fsImpl, false);
      }
      deps.onTransition?.('CAPTURED', capture);
      if (!receipt.owner) {
        const waiting = { ...receipt, state: 'WAITING_OWNER', ownerBoundAt: null };
        atomicJson(paths.receipt, waiting, fsImpl);
        deps.onTransition?.('WAITING_OWNER', waiting);
        return receiptStatus(waiting, paths.claim, fsImpl, false);
      }
      const prepared = { ...receipt, state: 'PREPARED', preparedAt: now.toISOString() };
      atomicJson(paths.receipt, prepared, fsImpl);
      deps.onTransition?.('PREPARED', prepared);
      const recorded = await dispatchPrepared(prepared, {
        fsImpl, agentsHome: base, now, paths, send: deps.send, sendDeps: deps.sendDeps,
        inspectTransport: deps.inspectTransport, onTransition: deps.onTransition,
      });
      return receiptStatus(recorded, paths.claim, fsImpl, false);
    }

    if (receipt && doc.done === true && receipt.digest !== digest
        && (receipt.state !== 'ACCOUNTED' || !receipt.observedUncheckedAt)) {
      const changed = changedReceipt(receipt, raw, doc, now, fsImpl);
      atomicJson(paths.receipt, changed, fsImpl);
      return receiptStatus(changed, paths.claim, fsImpl, false);
    }

    if (doc.warnings.length || doc.shapeless.length) {
      return { status: 'INVALID', reason: 'registered page has reader warnings or invisible toggles', warnings: doc.warnings, shapeless: doc.shapeless };
    }

    if (receipt && receipt.state === 'ACCOUNTED' && doc.done === false) {
      if (!receipt.observedUncheckedAt) {
        receipt = { ...receipt, observedUncheckedAt: now.toISOString() };
        atomicJson(paths.receipt, receipt, fsImpl);
      }
      return receiptStatus(receipt, paths.claim, fsImpl, false);
    }

    if (receipt && receipt.state === 'ACCOUNTED' && doc.done === null) {
      return {
        ...receiptStatus(receipt, paths.claim, fsImpl, false),
        reason: 'Done is absent; the submission episode remains accounted but not reset',
      };
    }

    if (doc.done !== true) return { status: 'UNCHANGED', done: doc.done, sent: false };

    if (receipt && receipt.state === 'ACCOUNTED' && !receipt.observedUncheckedAt) {
      return { ...receiptStatus(receipt, paths.claim, fsImpl, false), reason: 'an unchecked page has not been observed since accounting; no new round admitted' };
    }
    if (receipt?.owner && options.owner && validateSlug('owner', options.owner) !== receipt.owner
        && !(receipt.state === 'ACCOUNTED' && receipt.observedUncheckedAt)) {
      const handoff = {
        ...receipt,
        handoffStatus: 'PENDING_MANUAL_HANDOFF',
        requestedOwner: options.owner,
        handoffObservedAt: now.toISOString(),
      };
      atomicJson(paths.receipt, handoff, fsImpl);
      return receiptStatus(handoff, paths.claim, fsImpl, false);
    }
    if (receipt && ['RECORDED', 'UNKNOWN', 'NEEDS_RECONCILIATION'].includes(receipt.state)) {
      return receiptStatus(receipt, paths.claim, fsImpl, false);
    }
    if (receipt?.state === 'SENDING') {
      const recovered = await recoverSending(receipt, {
        fsImpl, agentsHome: base, now, paths, inspectTransport: deps.inspectTransport,
        onTransition: deps.onTransition,
      });
      return receiptStatus(recovered, paths.claim, fsImpl, false);
    }
    if (receipt?.state === 'PREPARED') {
      const recorded = await dispatchPrepared(receipt, {
        fsImpl, agentsHome: base, now, paths, send: deps.send, sendDeps: deps.sendDeps,
        inspectTransport: deps.inspectTransport, onTransition: deps.onTransition,
      });
      return receiptStatus(recorded, paths.claim, fsImpl, false);
    }

    if (receipt?.state === 'WAITING_OWNER') {
      if (!options.owner) return receiptStatus(receipt, paths.claim, fsImpl, false);
      const owner = validateSlug('owner', options.owner);
      const exact = sendInputs({
        from: receipt.from, owner, projectScope: receipt.projectScope, round: receipt.round,
        capturePath: receipt.capturePath, transportRepo: receipt.transportRepo,
      });
      const prepared = {
        ...receipt,
        owner,
        noteId: exact.id,
        exactSendInputs: exact,
        state: 'PREPARED',
        ownerBoundAt: now.toISOString(),
      };
      atomicJson(paths.receipt, prepared, fsImpl);
      deps.onTransition?.('PREPARED', prepared);
      const recorded = await dispatchPrepared(prepared, {
        fsImpl, agentsHome: base, now, paths, send: deps.send, sendDeps: deps.sendDeps,
        inspectTransport: deps.inspectTransport, onTransition: deps.onTransition,
      });
      return receiptStatus(recorded, paths.claim, fsImpl, false);
    }

    const owner = options.owner ? validateSlug('owner', options.owner) : null;
    const from = validateSlug('from', options.from);
    const round = (receipt?.round ?? 0) + 1;
    const relativeCapture = captureRelative(paths.projectScope, round);
    const capturePath = path.join(transportRepo, ...relativeCapture.split('/'));
    const items = capturedItems(doc);
    const capture = {
      version: RECEIPT_VERSION,
      page: normalizedPage(options.page),
      project,
      projectScope: paths.projectScope,
      transportRepo,
      round,
      readAt: now.toISOString(),
      owner,
      from,
      digest,
      originalEncoding: 'utf8-base64',
      originalBytes: Buffer.from(raw, 'utf8').toString('base64'),
      items,
    };
    const exact = owner ? sendInputs({
      from, owner, projectScope: paths.projectScope, round, capturePath: relativeCapture, transportRepo,
    }) : null;
    const intent = {
      version: RECEIPT_VERSION,
      page: capture.page,
      project,
      projectScope: paths.projectScope,
      transportRepo,
      round,
      capturePath: relativeCapture,
      captureReadAt: now.toISOString(),
      digest,
      owner,
      from,
      noteId: exact?.id ?? null,
      exactSendInputs: exact,
      state: 'CAPTURE_INTENT',
      accountingOutcome: null,
      preparedAt: null,
    };
    atomicJson(paths.receipt, intent, fsImpl);
    deps.onTransition?.('CAPTURE_INTENT', intent);
    writeCaptureExclusive(capturePath, capture, fsImpl);
    deps.onTransition?.('CAPTURED', capture);

    if (!owner) {
      const waiting = {
        ...intent,
        state: 'WAITING_OWNER',
      };
      atomicJson(paths.receipt, waiting, fsImpl);
      deps.onTransition?.('WAITING_OWNER', waiting);
      return receiptStatus(waiting, paths.claim, fsImpl, false);
    }

    const prepared = {
      ...intent,
      state: 'PREPARED',
      preparedAt: now.toISOString(),
    };
    atomicJson(paths.receipt, prepared, fsImpl);
    deps.onTransition?.('PREPARED', prepared);
    const recorded = await dispatchPrepared(prepared, {
      fsImpl, agentsHome: base, now, paths, send: deps.send, sendDeps: deps.sendDeps,
      inspectTransport: deps.inspectTransport, onTransition: deps.onTransition,
    });
    return receiptStatus(recorded, paths.claim, fsImpl, false);
  } finally {
    releaseClaim(paths.claim, fsImpl);
  }
}

export function status(options, deps = {}) {
  const fsImpl = deps.fsImpl ?? fs;
  const project = registeredProject(options.repo, options.page, fsImpl);
  const paths = receiptPaths({ agentsHome: deps.agentsHome ?? agentsHome(deps.env), project, page: options.page });
  const receipt = readJson(paths.receipt, fsImpl);
  const result = receiptStatus(receipt, paths.claim, fsImpl);
  if (receipt && receipt.project !== project) {
    return {
      ...result,
      status: 'PENDING_MANUAL_HANDOFF',
      reason: 'this page is bound to a different authorization project',
      requestedProject: project,
      boundProject: receipt.project,
    };
  }
  const transportRepo = receipt?.transportRepo ?? durableTransportRepo(project, deps.git ?? gitRunner, fsImpl);
  if (receipt && durableTransportRepo(project, deps.git ?? gitRunner, fsImpl) !== receipt.transportRepo) {
    return { ...result, status: 'NEEDS_RECONCILIATION', reason: 'the durable transport repository changed for this bound project' };
  }
  const orphanRound = !receipt ? 1
    : (receipt.state === 'ACCOUNTED' && receipt.observedUncheckedAt ? receipt.round + 1 : null);
  if (orphanRound !== null) {
    const relative = captureRelative(receipt?.projectScope ?? paths.projectScope, orphanRound);
    const full = path.join(transportRepo, ...relative.split('/'));
    if (fsImpl.existsSync(full)) {
      return { ...result, status: 'ORPHAN_CAPTURE', orphanCapturePath: relative, orphanRound };
    }
  }
  return result;
}

export function account(options, deps = {}) {
  const fsImpl = deps.fsImpl ?? fs;
  const now = new Date(deps.now ?? Date.now());
  const project = registeredProject(options.repo, options.page, fsImpl);
  const paths = receiptPaths({ agentsHome: deps.agentsHome ?? agentsHome(deps.env), project, page: options.page });
  acquireClaim(paths.claim, fsImpl);
  try {
    const receipt = readJson(paths.receipt, fsImpl);
    if (!receipt) throw new PickupError('no active round to account');
    if (receipt.project !== project) throw new PickupError(`page is bound to another authorization project: ${receipt.project}`);
    const transportRepo = durableTransportRepo(project, deps.git ?? gitRunner, fsImpl);
    if (receipt.transportRepo !== transportRepo) throw new PickupError('durable transport repository changed; reconcile before accounting');
    const integrity = verifyReceiptEvidence(receipt, fsImpl);
    if (integrity.status !== 'OK') throw new PickupError(`cannot account a round with ${integrity.status}`);
    if (receipt.state !== 'RECORDED') throw new PickupError(`cannot account a round in ${receipt.state}; uncertain delivery never becomes repeat-safe`);
    const outcomePath = path.resolve(options.outcome ?? '');
    let outcome;
    try { outcome = fsImpl.readFileSync(outcomePath, 'utf8'); } catch (error) {
      throw new PickupError(`accounting outcome is unreadable: ${error.message}`);
    }
    if (!outcome.trim()) throw new PickupError('accounting outcome is empty');
    if (!new RegExp(`^Owner-attestation:\\s*${receipt.owner}\\s*$`, 'mi').test(outcome)) {
      throw new PickupError(`accounting outcome must contain "Owner-attestation: ${receipt.owner}"`);
    }
    if (!/^Fresh-page-reconciliation:\s*\S.+$/mi.test(outcome)) {
      throw new PickupError('accounting outcome must contain a nonempty Fresh-page-reconciliation line');
    }
    const requiredItems = requiredItemsFromCapture(receipt, now, fsImpl);
    const missing = requiredItems
      .map((item) => item.ref)
      .filter((ref) => !new RegExp(`^Accounted-ref:\\s*${ref}(?:\\s|$)`, 'mi').test(outcome));
    if (missing.length) throw new PickupError(`accounting outcome is missing captured refs: ${missing.join(', ')}`);
    const updated = {
      ...receipt,
      state: 'ACCOUNTED',
      accountedAt: now.toISOString(),
      accountingOutcome: { path: outcomePath, digest: sha256(Buffer.from(outcome, 'utf8')), ownerAttested: true },
      observedUncheckedAt: null,
    };
    atomicJson(paths.receipt, updated, fsImpl);
    return receiptStatus(updated, paths.claim, fsImpl, false);
  } finally {
    releaseClaim(paths.claim, fsImpl);
  }
}

function parseArgs(argv) {
  const command = argv[0] === 'status' || argv[0] === 'account' ? argv.shift() : (argv.includes('--once') ? 'once' : null);
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--once') continue;
    if (!arg.startsWith('--')) throw new PickupError(`unexpected argument ${arg}`);
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new PickupError(`${arg} needs a value`);
    options[key] = value;
    i += 1;
  }
  if (!command) throw new PickupError('use --once, status, or account');
  for (const required of ['page', 'repo']) if (!options[required]) throw new PickupError(`--${required} is required`);
  if (command === 'once') {
    for (const required of ['from', 'reader']) if (!options[required]) throw new PickupError(`--${required} is required`);
  }
  if (command === 'account' && !options.outcome) throw new PickupError('--outcome is required');
  return { command, options };
}

export async function runCli({ argv = process.argv.slice(2), write = (text) => process.stdout.write(text), writeErr = (text) => process.stderr.write(text) } = {}) {
  try {
    const { command, options } = parseArgs([...argv]);
    const result = command === 'once' ? await pickupOnce(options) : command === 'status' ? status(options) : account(options);
    write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    writeErr(`decisions-pickup: ${error.message}\n`);
    return error instanceof PickupError ? error.exitCode : 1;
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]).toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
}

if (isMainModule()) process.exitCode = await runCli();
