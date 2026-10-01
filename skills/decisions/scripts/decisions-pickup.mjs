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

export const RECEIPT_VERSION = 2;
const LEGACY_RECEIPT_VERSION = 1;
export const READER_TIMEOUT_MS = 15_000;
export const REGISTRATION_MAX_BYTES = 64 * 1024;
export const REGISTRATION_MAX_ENTRIES = 16;
const NOTE_KIND = 'ASK';
const NOTE_NEEDS = 'ack';

export class PickupError extends Error {
  constructor(message, exitCode = 1, pickupCode = 'PICKUP_FAILED') {
    super(message);
    this.name = 'PickupError';
    this.exitCode = exitCode;
    this.pickupCode = pickupCode;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const SAFE_ERROR_CODES = new Set([
  'EACCES', 'EEXIST', 'EIO', 'EISDIR', 'EINVAL', 'EMFILE', 'ENFILE', 'ENOENT',
  'ENOSPC', 'ENOTDIR', 'EPERM', 'EROFS', 'ETIMEDOUT', 'EXDEV', 'INVALID_JSON', 'UNKNOWN',
]);

function safeErrorCode(error) {
  if (error instanceof SyntaxError) return 'INVALID_JSON';
  const code = String(error?.code ?? 'UNKNOWN');
  return SAFE_ERROR_CODES.has(code) ? code : 'UNKNOWN';
}

function canonicalProject(repo, fsImpl = fs) {
  const absolute = path.resolve(repo);
  try {
    const real = fsImpl.realpathSync(absolute);
    if (!fsImpl.statSync(real).isDirectory()) throw new PickupError('repo is not a directory');
    return real;
  } catch (error) {
    if (error instanceof PickupError) throw error;
    throw new PickupError(`cannot resolve repo (${safeErrorCode(error)})`);
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

// Contracts.md C3: registration entries may carry an optional topic; no colon (that is the
// title-format separator), a letter to start, at most 40 characters.
const TOPIC_PATTERN = /^[A-Za-z][A-Za-z0-9 &._-]{0,39}$/;

function validateTopic(value) {
  if (typeof value !== 'string' || !TOPIC_PATTERN.test(value)) {
    throw new PickupError('registered pickup topic is invalid');
  }
  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function agentsHome(env = process.env) {
  return path.resolve(env.AGENTS_HOME || path.join(os.homedir(), '.agents'));
}

function switchPresent(file, fsImpl = fs) {
  try {
    fsImpl.statSync(file);
    return true;
  } catch (error) {
    return Boolean(error) && error.code !== 'ENOENT' && error.code !== 'ENOTDIR';
  }
}

function pickupSwitchActive(base, fsImpl = fs) {
  return switchPresent(path.join(base, 'ws-off'), fsImpl)
    || switchPresent(path.join(base, 'ws-off-decisions'), fsImpl);
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
    captures: path.join(directory, 'captures'),
  };
}

function readJson(file, fsImpl = fs) {
  try {
    const parsed = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
    if (parsed.version !== RECEIPT_VERSION && parsed.version !== LEGACY_RECEIPT_VERSION) {
      throw new Error(`unsupported version ${parsed.version}`);
    }
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new PickupError(`receipt unreadable (${safeErrorCode(error)})`);
  }
}

let writeSequence = 0;
function privateMkdir(directory, fsImpl = fs) {
  fsImpl.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { fsImpl.chmodSync(directory, 0o700); } catch { /* Windows and injected filesystems may not expose POSIX modes */ }
}

function atomicJson(file, value, fsImpl = fs) {
  privateMkdir(path.dirname(file), fsImpl);
  const temp = `${file}.tmp-${process.pid}-${writeSequence += 1}`;
  fsImpl.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx', mode: 0o600,
  });
  fsImpl.renameSync(temp, file);
}

function acquireClaim(claim, fsImpl = fs) {
  privateMkdir(path.dirname(claim), fsImpl);
  try {
    fsImpl.mkdirSync(claim, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new PickupError('page already has an exclusive pickup claim', 1, 'PICKUP_CLAIM_HELD');
    }
    throw error;
  }
}

function releaseClaim(claim, fsImpl = fs) {
  try { fsImpl.rmdirSync(claim); } catch { /* a failed cleanup stays visible; never break it automatically */ }
  try { fsImpl.rmdirSync(path.dirname(claim)); } catch { /* remove only an empty transient store directory */ }
}

function writeCaptureExclusive(file, capture, fsImpl = fs) {
  privateMkdir(path.dirname(file), fsImpl);
  const serialized = `${JSON.stringify(capture, null, 2)}\n`;
  try {
    fsImpl.writeFileSync(file, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return capture;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let existing;
    try { existing = JSON.parse(fsImpl.readFileSync(file, 'utf8')); } catch {
      throw new PickupError('private capture is unreadable and needs reconciliation');
    }
    if (existing.version !== RECEIPT_VERSION || existing.type !== capture.type
        || existing.page !== capture.page
        || existing.project !== capture.project || existing.digest !== capture.digest
        || existing.projectScope !== capture.projectScope
        || existing.transportRepo !== capture.transportRepo
        || existing.round !== capture.round || existing.originalEncoding !== capture.originalEncoding
        || existing.originalBytes !== capture.originalBytes
        || JSON.stringify(existing.items) !== JSON.stringify(capture.items)
        || (existing.owner !== capture.owner && existing.owner !== null) || existing.from !== capture.from) {
      throw new PickupError('private capture conflicts with this pickup and needs reconciliation');
    }
    try { fsImpl.chmodSync(file, 0o600); } catch { /* best effort on platforms without POSIX modes */ }
    return existing;
  }
}

function canonicalThroughExistingAncestor(target, fsImpl = fs) {
  const absolute = path.resolve(target);
  const tail = [];
  let cursor = absolute;
  while (true) {
    try {
      const existing = fsImpl.realpathSync(cursor);
      return path.resolve(existing, ...tail.reverse());
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') {
        throw new PickupError(`private capture location cannot be resolved (${safeErrorCode(error)})`);
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) throw new PickupError('private capture location has no resolvable ancestor');
      tail.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

function sameOrInside(candidate, root) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function detectedGitRoot(candidate, fsImpl = fs) {
  let cursor = candidate;
  while (true) {
    try {
      fsImpl.lstatSync(path.join(cursor, '.git'));
      return cursor;
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

function privateCaptureRelative(projectScope, round, digest = null) {
  const suffix = digest ? `-changed-${digest}` : '';
  return `captures/${projectScope}/r${round}${suffix}.json`;
}

function detailsRelative(projectScope, round) {
  return `docs/notes/decisions-pickup-${projectScope}-r${round}.pointer.json`;
}

function resolvePrivateCapture(receipt, privateRef, base, fsImpl = fs) {
  if (!privateRef || path.isAbsolute(privateRef) || privateRef.split(/[\\/]/).includes('..')) {
    throw new PickupError('private capture reference is invalid');
  }
  const expectedPrefix = `captures/${receipt.projectScope}/`;
  if (!privateRef.startsWith(expectedPrefix) || !/^r[1-9][0-9]*(?:-changed-[0-9a-f]{64})?\.json$/.test(privateRef.slice(expectedPrefix.length))) {
    throw new PickupError('private capture reference does not match the saved project scope');
  }
  const privateRoot = canonicalThroughExistingAncestor(path.join(base, 'ws', 'decisions-pickup'), fsImpl);
  const full = canonicalThroughExistingAncestor(path.resolve(privateRoot, ...privateRef.split('/')), fsImpl);
  if (!sameOrInside(full, privateRoot)) throw new PickupError('private capture reference escapes the private store');
  const project = canonicalThroughExistingAncestor(receipt.project, fsImpl);
  const transportRepo = canonicalThroughExistingAncestor(receipt.transportRepo, fsImpl);
  const gitRoot = detectedGitRoot(full, fsImpl);
  if (sameOrInside(full, project) || sameOrInside(full, transportRepo) || gitRoot) {
    throw new PickupError('PRIVATE_CAPTURE_UNSAFE: AGENTS_HOME private store must be outside every Git checkout');
  }
  return full;
}

function resolveDetails(receipt, detailsPath, fsImpl = fs) {
  if (!detailsPath || path.isAbsolute(detailsPath) || detailsPath.split(/[\\/]/).includes('..')) {
    throw new PickupError('details pointer path is invalid');
  }
  const transportRoot = canonicalThroughExistingAncestor(receipt.transportRepo, fsImpl);
  const full = canonicalThroughExistingAncestor(path.resolve(transportRoot, ...detailsPath.split('/')), fsImpl);
  if (!sameOrInside(full, transportRoot)) throw new PickupError('details pointer path escapes the transport repository');
  return full;
}

function pointerPacket(receipt) {
  return {
    version: RECEIPT_VERSION,
    type: 'decisions-pickup-private-pointer',
    availability: 'local-only-on-pickup-host',
    privateCaptureRef: receipt.privateCaptureRef,
    projectScope: receipt.projectScope,
    round: receipt.round,
    digest: receipt.digest,
    captureIdentity: sha256(`${receipt.projectScope}\0${receipt.round}\0${receipt.digest}\0${receipt.privateCaptureRef}`),
    open: 'Use decisions-pickup.mjs open with the registered project, page, and round on the pickup host; otherwise request manual handoff.',
  };
}

function writePointerExclusive(receipt, fsImpl = fs) {
  const file = resolveDetails(receipt, receipt.detailsPath, fsImpl);
  const serialized = `${JSON.stringify(pointerPacket(receipt), null, 2)}\n`;
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fsImpl.writeFileSync(file, serialized, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let existing;
    try { existing = fsImpl.readFileSync(file, 'utf8'); } catch {
      throw new PickupError('details pointer is unreadable and needs reconciliation');
    }
    if (existing !== serialized) throw new PickupError('details pointer conflicts with the saved pickup intent');
  }
  return file;
}

/**
 * Contracts.md C1: the owner-input triple. `line` moves with any lead edit and carries no
 * owner meaning; `ref` and `replied` are bookkeeping, not something the owner put on the page.
 */
export function ownerInputs(items) {
  return items.map((item) => [item.kind, item.title, item.text]);
}

function multisetKey(triple) {
  return JSON.stringify(triple);
}

/** True when every element of `fresh` is accounted for by an equal-or-greater count in `original`. */
function isSubMultiset(fresh, original) {
  const counts = new Map();
  for (const triple of original) {
    const key = multisetKey(triple);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const triple of fresh) {
    const key = multisetKey(triple);
    const remaining = counts.get(key) ?? 0;
    if (remaining <= 0) return false;
    counts.set(key, remaining - 1);
  }
  return true;
}

/**
 * Reads a private capture's owner-input triples derived from its digest-verified bytes (not the
 * saved, possibly stale-parser `items` field), or null. `expectedDigest` ties the read to the
 * capture the caller means to trust; a capture that fails digest verification is never used.
 */
function loadCaptureOwnerInputs(receipt, ref, expectedDigest, now, base, fsImpl) {
  if (verifyOnePrivateCapture(receipt, ref, expectedDigest, base, fsImpl).status !== 'OK') return null;
  try {
    const full = resolvePrivateCapture(receipt, ref, base, fsImpl);
    const capture = JSON.parse(fsImpl.readFileSync(full, 'utf8'));
    const raw = Buffer.from(capture.originalBytes, 'base64').toString('utf8');
    return ownerInputs(capturedItems(parseDocument(raw, { now })));
  } catch {
    return null;
  }
}

/**
 * Contracts.md C1: a fresh checked read is a CHANGE against the active round's original
 * capture only when it holds an owner-input triple the capture does not (a multiset compare,
 * not raw bytes). Missing an original baseline to compare against is not proof of no change,
 * so it is treated conservatively as a change.
 */
function ownerInputsChanged(receipt, doc, now, base, fsImpl) {
  const original = loadCaptureOwnerInputs(receipt, receipt.privateCaptureRef, receipt.digest, now, base, fsImpl);
  if (!original) return true;
  const fresh = ownerInputs(capturedItems(doc));
  if (isSubMultiset(fresh, original)) return false;
  // Lane 64 F1: a round admitted from NEEDS_RECONCILIATION keeps its ORIGINAL capture as the
  // receipt baseline, so the page that caused the wedge would re-wedge it on the next tick. The
  // reconciliation capture (the page the closing step verified) is also a valid baseline.
  if (receipt.state === 'ACCOUNTED' && receipt.accountedFrom === 'NEEDS_RECONCILIATION'
      && receipt.reconciliationPrivateCaptureRef) {
    const reconciled = loadCaptureOwnerInputs(receipt, receipt.reconciliationPrivateCaptureRef, receipt.observedDigest, now, base, fsImpl);
    if (reconciled && isSubMultiset(fresh, reconciled)) return false;
  }
  return true;
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

function pageWarningCode(text) {
  if (text === 'Done is not the last line') return 'DONE_NOT_LAST';
  if (text === 'more than one Done line') return 'DONE_DUPLICATE';
  if (text === 'Done line is indented') return 'DONE_INDENTED';
  if (text === 'default line is not in the required shape') return 'DEFAULT_INVALID';
  if (text === 'no Done line found') return 'DONE_MISSING';
  if (text.startsWith('no default or "No default" line:')) return 'DECISION_DEFAULT_MISSING';
  return 'PAGE_WARNING';
}

function invalidPageSummary(doc) {
  const warnings = doc.warnings.map((entry) => ({ code: pageWarningCode(entry.text), line: entry.line }));
  const shapeless = doc.shapeless.map((entry) => ({ code: 'SHAPELESS_TOGGLE', line: entry.line }));
  return {
    warningCount: warnings.length,
    shapelessCount: shapeless.length,
    issues: [...warnings, ...shapeless],
  };
}

function verifyOnePrivateCapture(receipt, privateRef, expectedDigest, base, fsImpl = fs) {
  let full;
  try {
    full = resolvePrivateCapture(receipt, privateRef, base, fsImpl);
    const capture = JSON.parse(fsImpl.readFileSync(full, 'utf8'));
    const bytes = Buffer.from(String(capture.originalBytes ?? ''), 'base64');
    if (capture.version !== RECEIPT_VERSION || capture.type !== 'decisions-pickup-private-capture'
        || capture.originalEncoding !== 'utf8-base64' || capture.page !== receipt.page
        || capture.project !== receipt.project || capture.round !== receipt.round
        || capture.projectScope !== receipt.projectScope
        || capture.transportRepo !== receipt.transportRepo
        || capture.from !== receipt.from
        || (capture.owner !== receipt.owner && capture.owner !== null)
        || capture.digest !== expectedDigest || sha256(bytes) !== expectedDigest) {
      return { status: 'TAMPERED' };
    }
    return { status: 'OK' };
  } catch (error) {
    const status = error?.code === 'ENOENT' ? 'MISSING'
      : (error instanceof PickupError ? 'INVALID_PATH' : 'UNREADABLE');
    return { status, errorCode: safeErrorCode(error) };
  }
}

function verifyPointer(receipt, fsImpl = fs) {
  try {
    const full = resolveDetails(receipt, receipt.detailsPath, fsImpl);
    const expected = `${JSON.stringify(pointerPacket(receipt), null, 2)}\n`;
    const actual = fsImpl.readFileSync(full, 'utf8');
    return actual === expected ? { status: 'OK' } : { status: 'TAMPERED' };
  } catch (error) {
    return {
      status: error?.code === 'ENOENT' ? 'MISSING' : 'UNREADABLE',
      errorCode: safeErrorCode(error),
    };
  }
}

function verifyLegacyCapture(receipt, relative, expectedDigest, fsImpl = fs) {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) {
    return { status: 'INVALID_PATH' };
  }
  try {
    const transportRoot = canonicalThroughExistingAncestor(receipt.transportRepo, fsImpl);
    const full = canonicalThroughExistingAncestor(path.resolve(transportRoot, ...relative.split('/')), fsImpl);
    if (!sameOrInside(full, transportRoot)) return { status: 'INVALID_PATH' };
    const capture = JSON.parse(fsImpl.readFileSync(full, 'utf8'));
    const bytes = Buffer.from(String(capture.originalBytes ?? ''), 'base64');
    if (capture.version !== LEGACY_RECEIPT_VERSION || capture.page !== receipt.page
        || capture.project !== receipt.project || capture.round !== receipt.round
        || capture.projectScope !== receipt.projectScope || capture.transportRepo !== receipt.transportRepo
        || capture.from !== receipt.from
        || (capture.owner !== receipt.owner && capture.owner !== null)
        || capture.digest !== expectedDigest || sha256(bytes) !== expectedDigest) {
      return { status: 'TAMPERED' };
    }
    return { status: 'OK' };
  } catch (error) {
    return {
      status: error?.code === 'ENOENT' ? 'MISSING' : 'UNREADABLE',
      errorCode: safeErrorCode(error),
    };
  }
}

function verifyAccountingOutcome(receipt, capture, fsImpl = fs) {
  if (receipt.state !== 'ACCOUNTED' || !receipt.accountingOutcome) return null;
  try {
    const outcome = fsImpl.readFileSync(receipt.accountingOutcome.path);
    return sha256(outcome) === receipt.accountingOutcome.digest
      ? null
      : { status: 'OUTCOME_TAMPERED', capture };
  } catch (error) {
    return { status: 'OUTCOME_MISSING', capture, errorCode: safeErrorCode(error) };
  }
}

function verifyLegacyEvidence(receipt, fsImpl = fs) {
  const capture = verifyLegacyCapture(receipt, receipt.capturePath, receipt.digest, fsImpl);
  if (capture.status !== 'OK') return { status: 'CAPTURE_INVALID', capture };
  if (receipt.reconciliationCapturePath) {
    const changed = verifyLegacyCapture(receipt, receipt.reconciliationCapturePath, receipt.observedDigest, fsImpl);
    if (changed.status !== 'OK') return { status: 'RECONCILIATION_CAPTURE_INVALID', capture, changed };
  }
  const outcomeFailure = verifyAccountingOutcome(receipt, capture, fsImpl);
  if (outcomeFailure) return outcomeFailure;
  return { status: 'OK', capture };
}

function verifyReceiptEvidence(receipt, base, fsImpl = fs) {
  if (!receipt) return { status: 'NONE' };
  if (receipt.version === LEGACY_RECEIPT_VERSION) return verifyLegacyEvidence(receipt, fsImpl);
  const capture = verifyOnePrivateCapture(receipt, receipt.privateCaptureRef, receipt.digest, base, fsImpl);
  if (capture.status !== 'OK') return { status: 'CAPTURE_INVALID', capture };
  const pointer = verifyPointer(receipt, fsImpl);
  if (pointer.status !== 'OK') return { status: 'POINTER_INVALID', capture, pointer };
  if (receipt.reconciliationPrivateCaptureRef) {
    const changed = verifyOnePrivateCapture(receipt, receipt.reconciliationPrivateCaptureRef, receipt.observedDigest, base, fsImpl);
    if (changed.status !== 'OK') return { status: 'RECONCILIATION_CAPTURE_INVALID', capture, changed };
  }
  const outcomeFailure = verifyAccountingOutcome(receipt, capture, fsImpl);
  if (outcomeFailure) return outcomeFailure;
  return { status: 'OK', capture, pointer };
}

function requiredItemsFromCapture(receipt, now, base, fsImpl = fs) {
  try {
    const full = receipt.version === LEGACY_RECEIPT_VERSION
      ? path.join(receipt.transportRepo, ...receipt.capturePath.split('/'))
      : resolvePrivateCapture(receipt, receipt.privateCaptureRef, base, fsImpl);
    const capture = JSON.parse(fsImpl.readFileSync(full, 'utf8'));
    const raw = Buffer.from(capture.originalBytes, 'base64').toString('utf8');
    return capturedItems(parseDocument(raw, { now }));
  } catch {
    throw new PickupError('captured evidence became unreadable during accounting');
  }
}

function sendInputs({ from, owner, projectScope, round, detailsPath, transportRepo }) {
  const topic = `decisions-${projectScope}`;
  const id = `${from}-${topic}-${round}`;
  const text = `Owner decisions pickup round ${round} is ready`;
  const argv = [
    '--from', from, '--to', owner, '--kind', NOTE_KIND, '--topic', topic,
    '--text', text, '--details', detailsPath, '--needs', NOTE_NEEDS,
    '--recipient-repo', transportRepo, '--sender-repo', transportRepo, '--id', id, '--no-type',
  ];
  return { id, topic, text, details: detailsPath, kind: NOTE_KIND, needs: NOTE_NEEDS, argv };
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
    if (conflicts.size) return { status: 'CONFLICT', matchCount: same.size, conflictCount: conflicts.size };
    if (same.size) return { status: 'MATCH', matchCount: same.size, conflictCount: 0 };
    return { status: 'ABSENT', matchCount: 0, conflictCount: 0 };
  } catch (error) {
    return { status: 'UNREADABLE', errorCode: safeErrorCode(error), matchCount: 0, conflictCount: 0 };
  }
}

function safeTransportEvidence(value) {
  const allowed = new Set(['ABSENT', 'CONFLICT', 'MATCH', 'UNREADABLE']);
  const status = allowed.has(value?.status) ? value.status : 'UNREADABLE';
  const count = (direct, entries) => {
    if (Number.isSafeInteger(direct) && direct >= 0) return direct;
    return Array.isArray(entries) ? entries.length : 0;
  };
  return {
    status,
    matchCount: count(value?.matchCount, value?.matches),
    conflictCount: count(value?.conflictCount, value?.conflicts),
    ...(status === 'UNREADABLE' ? { errorCode: safeErrorCode({ code: value?.errorCode }) } : {}),
  };
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
  if (result.error) {
    const code = safeErrorCode(result.error);
    const category = code === 'ETIMEDOUT' ? 'READER_TIMEOUT'
      : code === 'ENOENT' ? 'READER_NOT_FOUND'
        : (code === 'EACCES' || code === 'EPERM') ? 'READER_ACCESS_DENIED' : 'READER_SPAWN_FAILED';
    throw new PickupError(`reader failed (${category})`);
  }
  if (result.status !== 0) {
    const exitCode = Number.isSafeInteger(result.status) && result.status >= 0 ? result.status : 'UNKNOWN';
    throw new PickupError(`reader failed (READER_EXIT_${exitCode})`);
  }
  if (!String(result.stdout ?? '').trim()) throw new PickupError('reader failed (READER_EMPTY_OUTPUT)');
  return String(result.stdout);
}

// Lane 34 / P1: the CONFIG is still read from the checkout named on the command line (or in a
// registration entry) — a worktree's own `.agents/project.json`, unchanged. Only the returned
// IDENTITY is normalized, through the same `durableTransportRepo`/`mainCheckout` resolver every
// worktree of one repository already funnels through for its transport repo, so every worktree of
// one repository is one project. A main-checkout path's identity is untouched: `durableTransportRepo`
// of a main checkout resolves back to that same realpath (see its own doc comment), so existing
// receipts and captures keyed by `/home/ben/Code/claude-delegation` stay valid byte for byte.
function registeredProject(repo, page, fsImpl = fs, git = gitRunner) {
  const configCheckout = canonicalProject(repo, fsImpl);
  const loaded = loadProjectConfig(configCheckout);
  if (loaded.source === 'unreadable') throw new PickupError('project config is unreadable');
  if (!loaded.config.decisions_url) throw new PickupError('project has no registered decisions_url');
  if (normalizedPage(loaded.config.decisions_url) !== normalizedPage(page)) {
    throw new PickupError('page is not this project\'s registered decisions_url');
  }
  return projectIdentity(configCheckout, git, fsImpl);
}

// Only a standard linked worktree (git common dir exactly `<main>/.git`) shares its main checkout's
// identity. A bare-backed worktree, a separate-git-dir checkout or a submodule keeps its own realpath:
// `mainCheckout` strips any `.git` suffix, so `proj.git` would otherwise resolve to a sibling `proj`.
function projectIdentity(configCheckout, git = gitRunner, fsImpl = fs) {
  const main = durableTransportRepo(configCheckout, git, fsImpl);
  if (main === configCheckout) return main;
  let common;
  try { common = String(git(['rev-parse', '--git-common-dir'], configCheckout)).trim(); } catch { return configCheckout; }
  const absolute = path.resolve(configCheckout, common);
  if (path.basename(absolute) !== '.git') return configCheckout;
  return canonicalProject(path.dirname(absolute), fsImpl) === main ? main : configCheckout;
}

function canonicalPathKey(value) {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function registrationPath(base) {
  return path.join(base, 'ws', 'decisions-pickup', 'registrations.json');
}

function readRegistration(file, fsImpl = fs, git = gitRunner) {
  let info;
  try { info = fsImpl.lstatSync(file); } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      throw new PickupError('registered pickup is not configured', 1, 'PICKUP_UNCONFIGURED');
    }
    throw new PickupError('registered pickup configuration is unavailable');
  }
  if (info.isSymbolicLink() || !info.isFile() || info.size > REGISTRATION_MAX_BYTES) {
    throw new PickupError('registered pickup configuration is invalid');
  }
  let parsed;
  try { parsed = JSON.parse(fsImpl.readFileSync(file, 'utf8')); } catch {
    throw new PickupError('registered pickup configuration is invalid');
  }
  if (!exactKeys(parsed, ['entries', 'version']) || parsed.version !== 1
      || !Array.isArray(parsed.entries) || parsed.entries.length < 1
      || parsed.entries.length > REGISTRATION_MAX_ENTRIES) {
    throw new PickupError('registered pickup configuration is invalid');
  }

  const pages = new Set();
  const repos = new Set();
  const entries = parsed.entries.map((entry) => {
    const hasTopic = Boolean(entry) && typeof entry === 'object'
      && Object.prototype.hasOwnProperty.call(entry, 'topic');
    if (!exactKeys(entry, hasTopic
      ? ['from', 'owner', 'page', 'reader', 'repo', 'topic']
      : ['from', 'owner', 'page', 'reader', 'repo'])) {
      throw new PickupError('registered pickup entry is invalid');
    }
    const topic = hasTopic ? validateTopic(entry.topic) : null;
    const page = normalizedPage(entry.page);
    if (!/^[0-9a-f]{32}$/.test(page)) throw new PickupError('registered pickup page is invalid');
    const from = validateSlug('from', entry.from);
    const owner = validateSlug('owner', entry.owner);
    if (!path.isAbsolute(String(entry.repo ?? '')) || !path.isAbsolute(String(entry.reader ?? ''))) {
      throw new PickupError('registered pickup paths must be absolute');
    }
    const repo = canonicalProject(entry.repo, fsImpl);
    let readerInfo;
    let reader;
    try {
      readerInfo = fsImpl.lstatSync(entry.reader);
      if (readerInfo.isSymbolicLink() || !readerInfo.isFile()) throw new Error('invalid reader');
      reader = fsImpl.realpathSync(entry.reader);
      if (!fsImpl.statSync(reader).isFile()) throw new Error('invalid reader');
    } catch {
      throw new PickupError('registered pickup reader is invalid');
    }
    if (detectedGitRoot(path.dirname(reader), fsImpl)) {
      throw new PickupError('registered pickup reader must be outside Git');
    }
    // This is deliberately run for every entry before selection. One invalid project/page binding
    // invalidates the finite host registration and cannot leave a subset silently active.
    const boundRepo = registeredProject(repo, page, fsImpl, git);
    const pageKey = page;
    const repoKey = canonicalPathKey(boundRepo);
    if (pages.has(pageKey) || repos.has(repoKey)) {
      throw new PickupError('registered pickup entries must have unique pages and projects');
    }
    pages.add(pageKey);
    repos.add(repoKey);
    return { repo, page, from, owner, reader, topic };
  });

  return entries.sort((left, right) => {
    const a = `${canonicalPathKey(left.repo)}\0${left.page}`;
    const b = `${canonicalPathKey(right.repo)}\0${right.page}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function registeredResultCode(result) {
  const statusValue = String(result?.status ?? '');
  if (result?.manualReconciliationRequired === true) return 'PICKUP_RECONCILIATION_REQUIRED';
  if (statusValue === 'DISABLED') return 'PICKUP_DISABLED';
  if (statusValue === 'UNCHANGED' || statusValue === 'NO_ACTION' || statusValue === 'IDLE'
      || statusValue === 'ACCOUNTED') return 'PICKUP_NO_ACTION';
  if (statusValue === 'RECORDED') return 'PICKUP_RECORDED';
  if (statusValue === 'WAITING_OWNER') return 'PICKUP_PENDING_OWNER';
  if (statusValue === 'UNKNOWN') return 'PICKUP_FAILED';
  if (['INVALID', 'NEEDS_RECONCILIATION', 'PENDING_MANUAL_HANDOFF', 'ORPHAN_CAPTURE',
    'CAPTURE_INTENT', 'PREPARED', 'SENDING'].includes(statusValue)) {
    return 'PICKUP_RECONCILIATION_REQUIRED';
  }
  return 'PICKUP_FAILED';
}

/**
 * Run one randomly selected entry from the finite, private host registration. The return value is safe
 * for heartbeat diagnostics: it contains no registered identity, page content, path, or error text.
 */
export async function runRegisteredPickup(options = {}, deps = {}) {
  const fsImpl = deps.fsImpl ?? fs;
  const env = deps.env ?? process.env;
  const base = deps.agentsHome ?? agentsHome(env);
  if (pickupSwitchActive(base, fsImpl)) return { code: 'PICKUP_DISABLED', ordinal: null };

  let entries;
  try {
    entries = readRegistration(options.registrationPath ?? registrationPath(base), fsImpl, deps.git ?? gitRunner);
  } catch (error) {
    return {
      code: error instanceof PickupError && error.pickupCode === 'PICKUP_UNCONFIGURED'
        ? 'PICKUP_UNCONFIGURED' : 'PICKUP_CONFIG_INVALID',
      ordinal: null,
    };
  }

  let ordinal;
  try {
    const selectIndex = deps.selectIndex ?? ((count) => crypto.randomInt(count));
    ordinal = selectIndex(entries.length);
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= entries.length) {
      return { code: 'PICKUP_FAILED', ordinal: null };
    }
  } catch {
    return { code: 'PICKUP_FAILED', ordinal: null };
  }

  try {
    const runOne = deps.pickupOnce ?? pickupOnce;
    const pickupNow = typeof deps.now === 'function' ? deps.now() : deps.now;
    const entry = entries[ordinal];
    const result = await runOne(entry, { ...deps, agentsHome: base, fsImpl, env, now: pickupNow });
    const handoff = result?.receipt?.handoffStatus === 'PENDING_MANUAL_HANDOFF'
      && result.receipt.owner !== entry.owner;
    return {
      code: handoff ? 'PICKUP_RECONCILIATION_REQUIRED' : registeredResultCode(result),
      ordinal,
    };
  } catch (error) {
    return {
      code: error instanceof PickupError && error.pickupCode === 'PICKUP_CLAIM_HELD'
        ? 'PICKUP_CLAIM_HELD' : 'PICKUP_FAILED',
      ordinal,
    };
  }
}

function durableTransportRepo(project, git = gitRunner, fsImpl = fs) {
  const resolved = mainCheckout(project, git);
  if (!resolved) throw new PickupError('cannot resolve durable transport repo');
  return canonicalProject(resolved, fsImpl);
}

function receiptStatus(receipt, claim, base, fsImpl = fs, claimed = fsImpl.existsSync(claim)) {
  if (receipt?.version === LEGACY_RECEIPT_VERSION) {
    return {
      status: receipt.state,
      receipt,
      claimed,
      authoritative: false,
      evidenceIntegrity: verifyLegacyEvidence(receipt, fsImpl),
      legacyLocation: 'LEGACY_REPO_CAPTURE',
      manualReconciliationRequired: true,
      reason: 'legacy repository capture is preserved in place; automatic pickup is refused',
    };
  }
  const evidenceIntegrity = verifyReceiptEvidence(receipt, base, fsImpl);
  const effectiveStatus = receipt?.state === 'CAPTURE_INTENT'
    ? (evidenceIntegrity.status === 'OK' || (evidenceIntegrity.status === 'POINTER_INVALID'
      && evidenceIntegrity.capture?.status === 'OK') ? 'ORPHAN_CAPTURE' : 'NEEDS_RECONCILIATION')
    : (receipt && evidenceIntegrity.status !== 'OK' ? 'NEEDS_RECONCILIATION' : (receipt?.state ?? 'IDLE'));
  return {
    status: effectiveStatus,
    receipt,
    claimed,
    authoritative: false,
    evidenceIntegrity,
  };
}

function changedReceipt(receipt, raw, doc, now, base, fsImpl) {
  const observedDigest = sha256(Buffer.from(raw, 'utf8'));
  const privateRef = privateCaptureRelative(receipt.projectScope, receipt.round, observedDigest);
  const capturePath = resolvePrivateCapture(receipt, privateRef, base, fsImpl);
  writeCaptureExclusive(capturePath, {
    version: RECEIPT_VERSION,
    type: 'decisions-pickup-private-capture',
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
    reconciliationPrivateCaptureRef: privateRef,
    observedAt: now.toISOString(),
  };
}

async function recoverSending(receipt, ctx) {
  const evidence = safeTransportEvidence((ctx.inspectTransport ?? inspectTransport)(receipt, ctx));
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
  if (verifyReceiptEvidence(receipt, ctx.agentsHome, ctx.fsImpl).status !== 'OK') {
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
  try {
    await (ctx.send ?? runNoteSend)(sending.exactSendInputs.argv, ctx.sendDeps ?? {});
  } catch (error) {
    // note-send can throw after recording. Only an independently observed exact envelope resolves it.
    return recoverSending(sending, ctx);
  }
  const recorded = {
    ...sending,
    state: 'RECORDED',
    recordedAt: ctx.now.toISOString(),
    transportResult: { id: sending.noteId, recorded: true },
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
  const base = deps.agentsHome ?? agentsHome(env);
  if (pickupSwitchActive(base, fsImpl)) {
    return { status: 'DISABLED', reason: 'decisions pickup is disabled by ws-off-decisions or ws-off' };
  }
  const project = registeredProject(options.repo, options.page, fsImpl, deps.git ?? gitRunner);
  const paths = receiptPaths({ agentsHome: base, project, page: options.page });
  let receipt = readJson(paths.receipt, fsImpl);
  if (receipt?.version === LEGACY_RECEIPT_VERSION) {
    return receiptStatus(receipt, paths.claim, base, fsImpl, false);
  }
  if (receipt && receipt.project !== project) {
    return {
      ...receiptStatus(receipt, paths.claim, base, fsImpl, false),
      status: 'PENDING_MANUAL_HANDOFF',
      reason: 'this page is already bound to a different authorization project; no read or send was attempted',
      requestedProject: project,
      boundProject: receipt.project,
    };
  }
  const transportRepo = durableTransportRepo(project, deps.git ?? gitRunner, fsImpl);
  if (receipt && receipt.transportRepo !== transportRepo) {
    return {
      ...receiptStatus(receipt, paths.claim, base, fsImpl, false),
      status: 'NEEDS_RECONCILIATION',
      reason: 'the durable transport repository changed for this bound project',
      observedTransportRepo: transportRepo,
    };
  }
  const safetyReceipt = receipt ?? { project, transportRepo, projectScope: paths.projectScope };
  resolvePrivateCapture(
    safetyReceipt,
    receipt?.privateCaptureRef ?? privateCaptureRelative(paths.projectScope, 1),
    base,
    fsImpl,
  );
  acquireClaim(paths.claim, fsImpl);
  try {
    receipt = readJson(paths.receipt, fsImpl);
    if (receipt?.version === LEGACY_RECEIPT_VERSION) {
      return receiptStatus(receipt, paths.claim, base, fsImpl, false);
    }
    if (receipt && receipt.project !== project) {
      return {
        ...receiptStatus(receipt, paths.claim, base, fsImpl, false),
        status: 'PENDING_MANUAL_HANDOFF',
        reason: 'this page is already bound to a different authorization project; no read or send was attempted',
        requestedProject: project,
        boundProject: receipt.project,
      };
    }
    if (receipt && receipt.transportRepo !== transportRepo) {
      return {
        ...receiptStatus(receipt, paths.claim, base, fsImpl, false),
        status: 'NEEDS_RECONCILIATION',
        reason: 'the durable transport repository changed for this bound project',
        observedTransportRepo: transportRepo,
      };
    }
    if (receipt && receipt.state !== 'CAPTURE_INTENT'
        && verifyReceiptEvidence(receipt, base, fsImpl).status !== 'OK') {
      return receiptStatus(receipt, paths.claim, base, fsImpl, false);
    }
    const raw = deps.readPage
      ? await deps.readPage({ reader: options.reader, page: options.page, timeoutMs: READER_TIMEOUT_MS })
      : readPageWithCli({ reader: options.reader, page: options.page });
    let doc;
    try { doc = parseDocument(raw, { now }); } catch {
      throw new PickupError('registered page is BLIND (INVALID_PAGE)', 3);
    }
    const digest = sha256(Buffer.from(raw, 'utf8'));

    if (receipt?.state === 'CAPTURE_INTENT') {
      if (doc.done !== true || doc.warnings.length || doc.shapeless.length || digest !== receipt.digest) {
        // Contracts.md C1: raw bytes differing from the digest that opened this intent is not,
        // by itself, a change — only a new owner input against the round's original capture is.
        if (doc.done === true && digest !== receipt.digest
            && !ownerInputsChanged(receipt, doc, now, base, fsImpl)) {
          return receiptStatus(receipt, paths.claim, base, fsImpl, false);
        }
        let interrupted;
        if (doc.done === true && digest !== receipt.digest) {
          interrupted = changedReceipt(receipt, raw, doc, now, base, fsImpl);
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
        return receiptStatus(interrupted, paths.claim, base, fsImpl, false);
      }
      const capture = {
        version: RECEIPT_VERSION,
        type: 'decisions-pickup-private-capture',
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
        const capturePath = resolvePrivateCapture(receipt, receipt.privateCaptureRef, base, fsImpl);
        writeCaptureExclusive(capturePath, capture, fsImpl);
      } catch {
        const interrupted = {
          ...receipt,
          previousState: receipt.state,
          state: 'NEEDS_RECONCILIATION',
          reconciliationReason: 'private capture is missing, partial, or conflicting',
          observedAt: now.toISOString(),
        };
        atomicJson(paths.receipt, interrupted, fsImpl);
        return receiptStatus(interrupted, paths.claim, base, fsImpl, false);
      }
      deps.onTransition?.('CAPTURED', capture);
      try {
        writePointerExclusive(receipt, fsImpl);
      } catch {
        const interrupted = {
          ...receipt,
          previousState: receipt.state,
          state: 'NEEDS_RECONCILIATION',
          reconciliationReason: 'details pointer is missing, partial, or conflicting',
          observedAt: now.toISOString(),
        };
        atomicJson(paths.receipt, interrupted, fsImpl);
        return receiptStatus(interrupted, paths.claim, base, fsImpl, false);
      }
      deps.onTransition?.('POINTER_WRITTEN', pointerPacket(receipt));
      if (!receipt.owner) {
        const waiting = { ...receipt, state: 'WAITING_OWNER', ownerBoundAt: null };
        atomicJson(paths.receipt, waiting, fsImpl);
        deps.onTransition?.('WAITING_OWNER', waiting);
        return receiptStatus(waiting, paths.claim, base, fsImpl, false);
      }
      const prepared = { ...receipt, state: 'PREPARED', preparedAt: now.toISOString() };
      atomicJson(paths.receipt, prepared, fsImpl);
      deps.onTransition?.('PREPARED', prepared);
      const recorded = await dispatchPrepared(prepared, {
        fsImpl, agentsHome: base, now, paths, send: deps.send, sendDeps: deps.sendDeps,
        inspectTransport: deps.inspectTransport, onTransition: deps.onTransition,
      });
      return receiptStatus(recorded, paths.claim, base, fsImpl, false);
    }

    if (receipt && doc.done === true && receipt.digest !== digest
        && (receipt.state !== 'ACCOUNTED' || !receipt.observedUncheckedAt)
        && ownerInputsChanged(receipt, doc, now, base, fsImpl)) {
      const changed = changedReceipt(receipt, raw, doc, now, base, fsImpl);
      atomicJson(paths.receipt, changed, fsImpl);
      return receiptStatus(changed, paths.claim, base, fsImpl, false);
    }

    if (doc.warnings.length || doc.shapeless.length) {
      return {
        status: 'INVALID',
        reason: 'registered page has reader warnings or invisible toggles',
        invalidPage: invalidPageSummary(doc),
      };
    }

    if (receipt && receipt.state === 'ACCOUNTED' && doc.done === false) {
      if (!receipt.observedUncheckedAt) {
        receipt = { ...receipt, observedUncheckedAt: now.toISOString() };
        atomicJson(paths.receipt, receipt, fsImpl);
      }
      return receiptStatus(receipt, paths.claim, base, fsImpl, false);
    }

    if (receipt && receipt.state === 'ACCOUNTED' && doc.done === null) {
      return {
        ...receiptStatus(receipt, paths.claim, base, fsImpl, false),
        reason: 'Done is absent; the submission episode remains accounted but not reset',
      };
    }

    if (doc.done !== true) return { status: 'UNCHANGED', done: doc.done, sent: false };

    if (receipt && receipt.state === 'ACCOUNTED' && !receipt.observedUncheckedAt) {
      return { ...receiptStatus(receipt, paths.claim, base, fsImpl, false), reason: 'an unchecked page has not been observed since accounting; no new round admitted' };
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
      return receiptStatus(handoff, paths.claim, base, fsImpl, false);
    }
    if (receipt && ['RECORDED', 'UNKNOWN', 'NEEDS_RECONCILIATION'].includes(receipt.state)) {
      return receiptStatus(receipt, paths.claim, base, fsImpl, false);
    }
    if (receipt?.state === 'SENDING') {
      const recovered = await recoverSending(receipt, {
        fsImpl, agentsHome: base, now, paths, inspectTransport: deps.inspectTransport,
        onTransition: deps.onTransition,
      });
      return receiptStatus(recovered, paths.claim, base, fsImpl, false);
    }
    if (receipt?.state === 'PREPARED') {
      const recorded = await dispatchPrepared(receipt, {
        fsImpl, agentsHome: base, now, paths, send: deps.send, sendDeps: deps.sendDeps,
        inspectTransport: deps.inspectTransport, onTransition: deps.onTransition,
      });
      return receiptStatus(recorded, paths.claim, base, fsImpl, false);
    }

    if (receipt?.state === 'WAITING_OWNER') {
      if (!options.owner) return receiptStatus(receipt, paths.claim, base, fsImpl, false);
      const owner = validateSlug('owner', options.owner);
      const exact = sendInputs({
        from: receipt.from, owner, projectScope: receipt.projectScope, round: receipt.round,
        detailsPath: receipt.detailsPath, transportRepo: receipt.transportRepo,
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
      return receiptStatus(recorded, paths.claim, base, fsImpl, false);
    }

    const items = capturedItems(doc);
    if (items.length === 0) return { status: 'NO_ACTION', done: true, sent: false };
    const owner = options.owner ? validateSlug('owner', options.owner) : null;
    const from = validateSlug('from', options.from);
    const round = (receipt?.round ?? 0) + 1;
    const privateCaptureRef = privateCaptureRelative(paths.projectScope, round);
    const detailsPath = detailsRelative(paths.projectScope, round);
    const capture = {
      version: RECEIPT_VERSION,
      type: 'decisions-pickup-private-capture',
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
      from, owner, projectScope: paths.projectScope, round, detailsPath, transportRepo,
    }) : null;
    const intent = {
      version: RECEIPT_VERSION,
      page: capture.page,
      project,
      projectScope: paths.projectScope,
      transportRepo,
      round,
      privateCaptureRef,
      detailsPath,
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
    const capturePath = resolvePrivateCapture(intent, privateCaptureRef, base, fsImpl);
    writeCaptureExclusive(capturePath, capture, fsImpl);
    deps.onTransition?.('CAPTURED', capture);
    writePointerExclusive(intent, fsImpl);
    deps.onTransition?.('POINTER_WRITTEN', pointerPacket(intent));

    if (!owner) {
      const waiting = {
        ...intent,
        state: 'WAITING_OWNER',
      };
      atomicJson(paths.receipt, waiting, fsImpl);
      deps.onTransition?.('WAITING_OWNER', waiting);
      return receiptStatus(waiting, paths.claim, base, fsImpl, false);
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
    return receiptStatus(recorded, paths.claim, base, fsImpl, false);
  } finally {
    releaseClaim(paths.claim, fsImpl);
  }
}

export function status(options, deps = {}) {
  const fsImpl = deps.fsImpl ?? fs;
  const project = registeredProject(options.repo, options.page, fsImpl, deps.git ?? gitRunner);
  const base = deps.agentsHome ?? agentsHome(deps.env);
  const paths = receiptPaths({ agentsHome: base, project, page: options.page });
  const receipt = readJson(paths.receipt, fsImpl);
  const result = receiptStatus(receipt, paths.claim, base, fsImpl);
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
  if (receipt?.version === LEGACY_RECEIPT_VERSION) return result;
  if (receipt && durableTransportRepo(project, deps.git ?? gitRunner, fsImpl) !== receipt.transportRepo) {
    return { ...result, status: 'NEEDS_RECONCILIATION', reason: 'the durable transport repository changed for this bound project' };
  }
  const orphanRound = !receipt ? 1
    : (receipt.state === 'ACCOUNTED' && receipt.observedUncheckedAt ? receipt.round + 1 : null);
  if (orphanRound !== null) {
    const privateRef = privateCaptureRelative(receipt?.projectScope ?? paths.projectScope, orphanRound);
    const full = resolvePrivateCapture(
      receipt ?? { project, transportRepo, projectScope: paths.projectScope }, privateRef, base, fsImpl,
    );
    if (fsImpl.existsSync(full)) {
      return { ...result, status: 'ORPHAN_CAPTURE', orphanPrivateCaptureRef: privateRef, orphanRound };
    }
  }
  return result;
}

const STUCK_REASON = 'checked page bytes changed during the active round';
const HISTORY_DIR = 'docs/decisions/history';

/**
 * Lane 64: every committed history file on origin/main, concatenated (any day, not only today's).
 * Reads the committed ref only, never the working tree, so an uncommitted or unpushed note cannot
 * pass. An unreadable ref is the empty string: absence of proof never admits a round.
 */
export function readOriginHistory(transportRepo, git = gitRunner) {
  let listed;
  try {
    listed = String(git(['ls-tree', '-r', '--name-only', 'origin/main', '--', HISTORY_DIR], transportRepo));
  } catch {
    return '';
  }
  const files = listed.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.endsWith('.md'));
  return files.map((file) => {
    try { return String(git(['show', `origin/main:${file}`], transportRepo)); } catch { return ''; }
  }).join('\n');
}

/** An owner input is "quoted in history" only in its exact quoted form, for a selection as for a comment. */
export function quotedInHistory(triple, historyText) {
  const text = triple?.[2];
  if (typeof text !== 'string' || !text || !historyText) return false;
  return historyText.includes(`"${text}"`);
}

/**
 * Lane 64 F2: every input list is quoted in history by count, not only by presence. Each distinct
 * text must occur as `"text"` at least as many times as its largest multiplicity in any one list
 * (original capture, reconciliation capture), so a stale quote of a short answer such as "yes"
 * cannot close a round whose new answers are not recorded. Overlapping lists are not double-counted.
 */
export function allQuotedInHistory(tripleLists, historyText) {
  const need = new Map();
  for (const list of tripleLists) {
    const counts = new Map();
    for (const triple of list) counts.set(triple?.[2], (counts.get(triple?.[2]) ?? 0) + 1);
    for (const [text, n] of counts) need.set(text, Math.max(need.get(text) ?? 0, n));
  }
  for (const [text, n] of need) {
    if (typeof text !== 'string' || !text || !historyText) return false;
    if (historyText.split(`"${text}"`).length - 1 < n) return false;
  }
  return true;
}

/**
 * Lane 64 item 3: the lead that runs the accounting is the owner of the attestation. `--owner`
 * names that lead; without it the receipt's saved owner is used, as before. The receipt's own
 * `owner` field is never rewritten: it is part of what every saved private capture is verified
 * against, so a later lead is recorded as `accountedBy` instead.
 */
export function account(options, deps = {}) {
  return settleRound(options, deps, ({ outcomePath }, fsImpl) => {
    const resolved = path.resolve(outcomePath ?? '');
    try { return { outcomePath: resolved, outcome: fsImpl.readFileSync(resolved, 'utf8') }; } catch (error) {
      throw new PickupError(`accounting outcome is unreadable (${safeErrorCode(error)})`);
    }
  });
}

/**
 * Lane 64 item 1: clearing Done and accounting the round are one step. `publish --clear-done` calls
 * this after every check has passed and before it writes the page. The outcome file is written
 * here, from the captured refs and the lead's name, so no outcome has to exist beforehand; every
 * rule `account` enforces (integrity, provenance, attestation, one ref per captured item) still runs.
 */
export function closeRound(options, deps = {}) {
  const reconciliation = String(options.reconciliation ?? '').replace(/\s+/g, ' ').trim();
  if (!reconciliation) throw new PickupError('closing a round needs a nonempty reconciliation statement');
  return settleRound(options, deps, ({ receipt, lead, requiredItems, base, now }, fsImpl) => {
    const outcome = [
      `Owner-attestation: ${lead}`,
      `Round: ${receipt.round}`,
      `Page: ${receipt.page}`,
      `Fresh-page-reconciliation: ${reconciliation}`,
      ...requiredItems.map((item) => `Accounted-ref: ${item.ref} closed in the same step that cleared Done`),
      '',
    ].join('\n');
    const outcomePath = path.join(base, 'ws', 'decisions-pickup', 'outcomes', `${receipt.projectScope}-r${receipt.round}.md`);
    privateMkdir(path.dirname(outcomePath), fsImpl);
    const temp = `${outcomePath}.tmp-${process.pid}-${writeSequence += 1}`;
    fsImpl.writeFileSync(temp, outcome, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fsImpl.renameSync(temp, outcomePath);
    return { outcomePath, outcome, now };
  });
}

function settleRound(options, deps, outcomeFor) {
  const fsImpl = deps.fsImpl ?? fs;
  const now = new Date(deps.now ?? Date.now());
  const project = registeredProject(options.repo, options.page, fsImpl, deps.git ?? gitRunner);
  const base = deps.agentsHome ?? agentsHome(deps.env);
  const paths = receiptPaths({ agentsHome: base, project, page: options.page });
  acquireClaim(paths.claim, fsImpl);
  try {
    const receipt = readJson(paths.receipt, fsImpl);
    if (!receipt) throw new PickupError('no active round to account');
    if (receipt.project !== project) throw new PickupError('page is bound to another authorization project');
    const transportRepo = durableTransportRepo(project, deps.git ?? gitRunner, fsImpl);
    if (receipt.transportRepo !== transportRepo) throw new PickupError('durable transport repository changed; reconcile before accounting');
    const integrity = verifyReceiptEvidence(receipt, base, fsImpl);
    if (integrity.status !== 'OK') throw new PickupError(`cannot account a round with ${integrity.status}`);
    // Contracts.md C1 (P1.2): a round the old byte check stuck in NEEDS_RECONCILIATION may be
    // accounted like RECORDED when the reconciliation capture's owner inputs are a sub-multiset
    // of the original capture's — the lead acted on it, the owner added nothing new. `previousState`
    // alone does not survive a second stuck pass under the old code (it gets overwritten to
    // NEEDS_RECONCILIATION), so provenance is proven instead from the receipt's own evidence: only a
    // round that actually reached RECORDED sets `recordedAt`, and only via a positive transport
    // result or a MATCH recovery; an UNKNOWN round sets `uncertainAt` instead, and an already
    // accounted round carries a non-null `accountingOutcome`.
    const reachedRecorded = typeof receipt.recordedAt === 'string'
      && (receipt.transportResult?.recorded === true || receipt.transportEvidence?.status === 'MATCH')
      && !receipt.uncertainAt && receipt.accountingOutcome == null;
    // Lane 64 item 2: the same stuck round is ALSO admitted as closed when its sub-multiset test
    // fails but every owner input in BOTH the original and the reconciliation capture is quoted in
    // a committed history file on origin/main (any day): the lead has already recorded every answer
    // durably, so nothing the owner said is left unaccounted. Provenance gates are unchanged.
    let admittedBy = null;
    if (receipt.state === 'NEEDS_RECONCILIATION'
        && receipt.reconciliationReason === STUCK_REASON
        && (receipt.previousState === 'RECORDED' || receipt.previousState === 'NEEDS_RECONCILIATION')
        && reachedRecorded) {
      const original = loadCaptureOwnerInputs(receipt, receipt.privateCaptureRef, receipt.digest, now, base, fsImpl);
      const reconciliation = loadCaptureOwnerInputs(receipt, receipt.reconciliationPrivateCaptureRef, receipt.observedDigest, now, base, fsImpl);
      if (original && reconciliation) {
        if (isSubMultiset(reconciliation, original)) {
          admittedBy = 'sub-multiset';
        } else {
          const history = deps.readHistory
            ? deps.readHistory(receipt.transportRepo)
            : readOriginHistory(receipt.transportRepo, deps.git ?? gitRunner);
          if (allQuotedInHistory([original, reconciliation], history)) admittedBy = 'history';
        }
      }
    }
    if (receipt.state !== 'RECORDED' && !admittedBy) {
      throw new PickupError('cannot account a round outside RECORDED; uncertain delivery never becomes repeat-safe');
    }
    if (typeof receipt.owner !== 'string' || !/^[a-z0-9-]+$/.test(receipt.owner)) {
      throw new PickupError('saved owner binding is invalid');
    }
    const lead = options.owner ? validateSlug('owner', options.owner) : receipt.owner;
    const requiredItems = requiredItemsFromCapture(receipt, now, base, fsImpl);
    const { outcomePath, outcome } = outcomeFor({
      receipt, lead, requiredItems, base, now, outcomePath: options.outcome,
    }, fsImpl);
    if (!outcome.trim()) throw new PickupError('accounting outcome is empty');
    if (!new RegExp(`^Owner-attestation:\\s*${escapeRegExp(lead)}\\s*$`, 'mi').test(outcome)) {
      throw new PickupError('accounting outcome must contain the required owner attestation');
    }
    if (!/^Fresh-page-reconciliation:\s*\S.+$/mi.test(outcome)) {
      throw new PickupError('accounting outcome must contain a nonempty Fresh-page-reconciliation line');
    }
    const missing = requiredItems
      .map((item) => item.ref)
      .filter((ref) => !new RegExp(`^Accounted-ref:\\s*${ref}(?:\\s|$)`, 'mi').test(outcome));
    if (missing.length) throw new PickupError(`accounting outcome is missing captured refs: ${missing.join(', ')}`);
    const updated = {
      ...receipt,
      state: 'ACCOUNTED',
      accountedAt: now.toISOString(),
      accountedBy: lead,
      accountingOutcome: { path: outcomePath, digest: sha256(Buffer.from(outcome, 'utf8')), ownerAttested: true },
      observedUncheckedAt: null,
      ...(admittedBy ? { accountedFrom: 'NEEDS_RECONCILIATION' } : {}),
      ...(admittedBy === 'history' ? { admittedBy: 'history' } : {}),
      // A handoff marker left by a registered owner that differed from the saved one is settled by
      // closing the round: the next round binds whichever lead runs the pickup then.
      ...(receipt.handoffStatus === 'PENDING_MANUAL_HANDOFF'
        ? { handoffStatus: null, handoffResolvedAt: now.toISOString() } : {}),
    };
    atomicJson(paths.receipt, updated, fsImpl);
    return receiptStatus(updated, paths.claim, base, fsImpl, false);
  } finally {
    releaseClaim(paths.claim, fsImpl);
  }
}

export function openPrivateCapture(options, deps = {}) {
  const fsImpl = deps.fsImpl ?? fs;
  const project = registeredProject(options.repo, options.page, fsImpl, deps.git ?? gitRunner);
  const base = deps.agentsHome ?? agentsHome(deps.env);
  const paths = receiptPaths({ agentsHome: base, project, page: options.page });
  const receipt = readJson(paths.receipt, fsImpl);
  const requestedRound = Number(options.round);
  if (!receipt || receipt.version !== RECEIPT_VERSION || !Number.isSafeInteger(requestedRound)
      || requestedRound < 1 || receipt.round !== requestedRound || receipt.project !== project) {
    throw new PickupError('PRIVATE_CAPTURE_UNAVAILABLE: exact local private capture is unavailable; request manual handoff');
  }
  const verified = verifyOnePrivateCapture(receipt, receipt.privateCaptureRef, receipt.digest, base, fsImpl);
  if (verified.status !== 'OK') {
    throw new PickupError('PRIVATE_CAPTURE_UNAVAILABLE: exact local private capture is unavailable; request manual handoff');
  }
  try {
    const full = resolvePrivateCapture(receipt, receipt.privateCaptureRef, base, fsImpl);
    const capture = JSON.parse(fsImpl.readFileSync(full, 'utf8'));
    return Buffer.from(capture.originalBytes, 'base64');
  } catch {
    throw new PickupError('PRIVATE_CAPTURE_UNAVAILABLE: exact local private capture is unavailable; request manual handoff');
  }
}

function parseArgs(argv) {
  const command = ['status', 'account', 'open'].includes(argv[0]) ? argv.shift() : (argv.includes('--once') ? 'once' : null);
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--once') continue;
    if (!arg.startsWith('--')) throw new PickupError('unexpected positional argument');
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new PickupError('an option needs a value');
    options[key] = value;
    i += 1;
  }
  if (!command) throw new PickupError('use --once, status, account, or open');
  for (const required of ['page', 'repo']) if (!options[required]) throw new PickupError(`--${required} is required`);
  if (command === 'once') {
    for (const required of ['from', 'reader']) if (!options[required]) throw new PickupError(`--${required} is required`);
  }
  if (command === 'account' && !options.outcome) throw new PickupError('--outcome is required');
  if (command === 'open' && !options.round) throw new PickupError('--round is required');
  return { command, options };
}

export async function runCli({ argv = process.argv.slice(2), write = (text) => process.stdout.write(text), writeErr = (text) => process.stderr.write(text) } = {}) {
  try {
    const { command, options } = parseArgs([...argv]);
    if (command === 'open') {
      write(openPrivateCapture(options));
      return 0;
    }
    const result = command === 'once' ? await pickupOnce(options) : command === 'status' ? status(options) : account(options);
    write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof PickupError
      ? error.message
      : `internal failure (${safeErrorCode(error)})`;
    writeErr(`decisions-pickup: ${message}\n`);
    return error instanceof PickupError ? error.exitCode : 1;
  }
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const canon = (p) => {
    let r = path.resolve(p);
    try { r = fs.realpathSync(r); } catch { /* not on disk — fall back to the resolved path */ }
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return canon(entry) === canon(fileURLToPath(import.meta.url));
}

if (isMainModule()) process.exitCode = await runCli();
