#!/usr/bin/env node
// note-flush — drain the outbox of deferred wake-ups (spec V5; inbox delivery 2026-09-17).
//
// DELIVERY ORDER, since 0.5.0 (spec 2026-09-17 D3). A wake-up goes to the recipient's own INBOX, never
// to its keyboard:
//   1. an inbox registered for that slug on THIS machine (`~/.agents/notes/inboxes.json`) → post there.
//      Claude Code: its per-session socket. Codex: its on-disk queue. Neither touches the composer.
//   2. nothing registered → the entry stays queued and one `no-inbox` line goes to flush.log. The
//      ledger already holds the note and the recipient's own hooks read it on its next event, so this
//      is a missing NUDGE, not a missing note — and it is not counted as a delivery attempt, because
//      nothing was attempted.
//   3. typing survives only as an explicit last resort: `MULTI_ALLOW_TYPING=1`, AND no inbox
//      registered, AND the composer pre-check passes. Default: no typing, ever. `~/.agents/notes/
//      no-type` remains a hard off switch on top of that.
//
// Why: on 2026-09-17 the typed path put a peer note into the middle of a sentence Ben was writing and
// submitted it. `classifyPane` cannot see whether the input box is EMPTY, so a half-typed human prompt
// looks exactly like an idle agent. An inbox has no such failure mode — it is not a keyboard.
//
// note-send writes the envelope to the ledger BEFORE it tries to deliver, so a deferral loses nothing:
// the note is already where the recipient reads. What is left over is the WAKE-UP — the nudge that
// makes the peer look sooner. Those live in `~/.agents/notes/outbox/<id>.json`, and this drains them
// whenever a recipient might be reachable:
//
//   · at the start of every note-send (piggyback, ~3 s budget)
//   · from note-notify when a Codex turn ends (the moment a Codex pane is provably idle)
//   · from a 1-minute timer as a safety net (T2 installs the unit/plist/scheduled task)
//
// USAGE
//   note-flush [--to <slug>] [--json] [--max-ms 100000] [--max-attempts 20] [--max-age-hours 48]
//              [--per-entry-ms 45000] [--phase2-reserve-ms 20000] [--orca <cmd>] [--dry-run] [--home <dir>]
//
// RULES
//   · Never blocks: one pass over the outbox inside --max-ms, then it stops and leaves the rest.
//   · Never re-sends a note whose id a later `supersedes` retired — that entry is dropped, logged.
//   · Never types a note the recipient has already READ: an id in `~/.agents/notes/.cursor-<slug>` is
//     retired unattempted. The ledger delivered it; the wake-up has nothing left to do.
//   · Types at an IDLE pane without waiting for permission from anyone. 0.4.0 stood aside for a pane
//     whose `.listening-<slug>.json` said it was parked in a Stop hook; nothing parks now, so nothing
//     writes one, and any left on disk are swept on the way in (cleanupListeningMarkers).
//   · Never types into a pane that is not sendable for its vendor (Claude: idle or working; Codex:
//     idle only — it does not queue typed input mid-turn).
//   · Everything below about typing is now the LAST RESORT path described above, reachable only with
//     MULTI_ALLOW_TYPING=1. It is kept, and kept tested, because a machine whose sessions predate the
//     registering hooks has nothing else; a later version deletes it once inbox delivery has run for a
//     while (spec D6).
//   · Two-phase typing, exactly as note-send does it, through the same shared code. It NEVER starts
//     typing unless enough budget remains to press Enter afterwards: an envelope stranded in a peer's
//     composer is how a stack of stale notes arrives at once (incident 2026-09-14).
//   · Exit 0 always. A drain is background work; a non-zero exit would make a turn-end hook look broken.
//   · Every attempt is appended to `~/.agents/notes/flush.log`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NoteError, parseEnvelope, LEDGER_ONLY_KINDS, suggestSlug } from './envelope.mjs';
import {
  toPosix, makeOrcaRunner, resolvePaneWithSource, showPane, readPane, classifyPane, isSendable,
  twoPhaseSend, readOutbox, writeOutboxEntry, removeOutboxEntry, appendFlushLog,
  notesDir, readLedgerCorpus, supersededIds, isMainModule, HANDLE_RE, safeReaddir,
  claimOutboxEntry, releaseClaim, reclaimStaleClaims, withDeadline,
  killOutboxEntry, deadOutboxPath, benInboxPath,
  readBindings, pruneBindings, BINDING_GC_MS, readCursor,
  readInboxes, pruneInboxes, INBOX_GC_MS,
  wakeAllKindsPath, noUnknownCheckPath, isUnknownRecipient, knownSlugs, recentMirrorTexts, killSwitchActive,
  withoutIds, undeliveredIds,
} from './transport.mjs';
import { deliverToSlug as postToClaude, DEFAULT_POST_TIMEOUT_MS } from './inbox-claude.mjs';
import { deliverToSlug as queueToCodex, DEFAULT_QUEUE_TIMEOUT_MS } from './inbox-codex.mjs';

/**
 * The standalone drain runs from a 1-minute timer, so it can afford to be patient — and it has to be:
 * Netcup answers an orca call in 1–7 s under load, and the old 8 s ceiling meant a single entry never
 * got through a full classify-type-verify-Enter sequence (incident 2026-09-14).
 */
export const DEFAULT_MAX_MS = 100_000;
/** A wake-up that has failed this often is not going to start working; the ledger still has the note. */
export const DEFAULT_MAX_ATTEMPTS = 20;
/** Older than this and the nudge is pointless — the recipient has read the ledger or moved on. */
export const DEFAULT_MAX_AGE_HOURS = 48;
/** One pane may not eat the whole drain: a single entry's attempt is bounded independently (H4). */
export const DEFAULT_PER_ENTRY_MS = 45_000;
/**
 * What phase 2 needs: a `terminal read`, a `terminal show` and a `terminal send --enter`. We refuse to
 * type at all unless this much budget remains, because a phase-2 timeout is what strands an envelope in
 * someone's composer — the whole incident.
 */
export const DEFAULT_PHASE2_RESERVE_MS = 20_000;

/**
 * C1: the least budget an inbox delivery may be STARTED with, per transport.
 *
 * `drainQuietly` gives a piggyback drain 3 000 ms, and `codex queue` spins up an in-process app-server
 * and opens SQLite - a little over a second on an idle box, more on a loaded one. Starting it with two
 * seconds left means SIGKILL, `codex-timeout`, and an attempt burnt; every note-send on the machine
 * triggers a piggyback, so the 20-attempt budget could be spent in minutes by drains that were never
 * going to succeed, ending in `outbox/dead/` and a BLOCKED line for a note the one-minute timer drain
 * would have delivered. The typed path has had exactly this guard since the 2026-09-14 incident
 * (`phase2Reserve`); this is its inbox equivalent.
 */
export const INBOX_FLOOR_MS = { 'claude-socket': 750, 'codex-queue': 5_000 };

/**
 * C2: outcomes that are NOT delivery attempts and must never move the attempt counter.
 *
 * `codex-no-thread` is "this Codex thread has not run its first turn yet" - the normal state of a pane
 * that was just launched, not a failure. `no-inbox` is "there was nothing to deliver to". Counting
 * either walks the entry toward `gave-up`, which dead-letters the note and writes a BLOCKED line into
 * the one file Ben reads, for a wake-up that was never tried.
 */
export const NOT_AN_ATTEMPT = new Set(['codex-no-thread', 'no-inbox']);

/** What a `no-inbox` result says, in one place: it is reported per entry and read by note-send. */
export const NO_INBOX_DETAIL = 'no inbox registered on this machine; the ledger has the note and its own hooks will read it';

/** What 0.4.0 wrote while a Stop hook was parked. Nothing writes these now, so every one is garbage. */
export const LISTENING_MARKER_RE = /^\.listening-.+\.json$/;

// ─────────────────────────────────────────────────────────────────────────────
// Heartbeat (build spec 0921-F): a quiet flush.log means either "nothing to deliver" or "the flusher is
// not running at all", and nobody could tell which. This file answers that, overwritten every pass.
// ─────────────────────────────────────────────────────────────────────────────

/** Owner-only, on create AND on every rewrite - same rule as inboxes.json (transport.mjs INBOX_MODE). */
export const HEARTBEAT_MODE = 0o600;
/** F3: older than this and `--status` says the one-minute timer looks dead. */
export const HEARTBEAT_STALE_MS = 5 * 60 * 1000;
export const PICKUP_ADMISSION_MS = 30_000;
const PICKUP_CODES = new Set([
  'PICKUP_UNCONFIGURED', 'PICKUP_DISABLED', 'PICKUP_CONFIG_INVALID', 'PICKUP_NO_ACTION',
  'PICKUP_RECORDED', 'PICKUP_PENDING_OWNER', 'PICKUP_RECONCILIATION_REQUIRED',
  'PICKUP_CLAIM_HELD', 'PICKUP_FAILED', 'PICKUP_SKIPPED_BUDGET',
]);

/** Outcomes that left the outbox without ever attempting a delivery (superseded, ACK/FYI, already-read, aged out). */
const HEARTBEAT_RETIRED_OUTCOMES = new Set(['superseded', 'retired-quiet-kind', 'retired', 'expired']);
/** Outcomes that moved the entry to `outbox/dead/` and reported it to ben. */
const HEARTBEAT_DEAD_LETTERED_OUTCOMES = new Set(['gave-up', 'unknown-recipient']);
/**
 * The two "this should never happen" catches in this file: an inbox client or the typing path throwing
 * instead of resolving (both are commented "Defensive: ... a bug-catcher, not a path"). Their raw
 * messages can embed a socket path (`errorDetail` in inbox-claude.mjs folds the OS error's own message
 * in, and an ENOENT on a socket names the socket) or pane/composer content, so `last_error` below records
 * only the outcome label for these two, never the message - the heartbeat's "no addresses, ever" rule
 * (F1) outranks "the error's message" here. Reported as a SPEC CONFLICT in the build report.
 *
 * Review round 1, NIT (finding 8): this counts only the two bug-catcher outcomes, so `stranded`,
 * `timed-out`, `no-orca` and `gave-up` all read as `deferred`/`dead_lettered` with `errors` at 0 rather
 * than bumping `errors`. The spec never defined which outcomes count as an "error" versus an expected
 * retry/terminal state, so this stays scoped to the two paths that are genuinely unexpected bugs; a wider
 * definition is a product decision left for a future spec, not assumed here.
 */
const HEARTBEAT_ERROR_OUTCOMES = new Set(['inbox-error', 'error']);

export function flushLastPath(home) { return toPosix(path.posix.join(notesDir(home), 'flush-last.json')); }

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
/** `skills/multi/scripts/` -> repo root, three levels up, then the plugin manifest (F1: "cheaply"). */
const PLUGIN_JSON_PATH = path.join(SCRIPT_DIR, '..', '..', '..', '.claude-plugin', 'plugin.json');
let cachedPluginVersion; // undefined = not tried yet; null = tried and unreadable; the real fs, always.

function readPluginVersion() {
  if (cachedPluginVersion !== undefined) return cachedPluginVersion;
  try {
    const parsed = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf8'));
    cachedPluginVersion = typeof parsed?.version === 'string' ? parsed.version : null;
  } catch {
    cachedPluginVersion = null;
  }
  return cachedPluginVersion;
}

/** tmp + chmod + rename: the same atomic-write shape transport.mjs uses for inboxes.json. */
function heartbeatIdentity(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    pid: value.pid,
    at: value.at,
    timer_at: Object.hasOwn(value, 'timer_at') ? value.timer_at : null,
  };
}

function sameHeartbeatIdentity(left, right) {
  return Boolean(left && right) && left.pid === right.pid && left.at === right.at
    && left.timer_at === right.timer_at;
}

function writeHeartbeatFile(home, data, fsImpl, expectedIdentity = null) {
  const file = flushLastPath(home);
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try { fsImpl.rmSync(tmp, { force: true }); } catch { /* will be created, or the write says why */ }
  try {
    fsImpl.writeFileSync(tmp, `${JSON.stringify(data)}\n`, { encoding: 'utf8', mode: HEARTBEAT_MODE });
    try { fsImpl.chmodSync(tmp, HEARTBEAT_MODE); } catch { /* win32 has no POSIX mode; the ACL is the user's */ }
    // This is deliberately immediately before the atomic replacement. If another pass has already
    // replaced this CLI's heartbeat, its peer accounting wins and this optional annotation is dropped.
    if (expectedIdentity && !sameHeartbeatIdentity(heartbeatIdentity(readHeartbeat(home, fsImpl)), expectedIdentity)) {
      fsImpl.rmSync(tmp, { force: true });
      return null;
    }
    fsImpl.renameSync(tmp, file);
  } catch (err) {
    // Review finding 4: a failing WRITE (not just a failing rename) left one `.<pid>.tmp` per pass behind
    // (the old code only cleaned up around the rename). The pre-write `rmSync` above only ever clears
    // THIS pid's own leftover tmp, so a write that fails every minute (ENOSPC-shaped) orphaned one file a
    // minute forever. Now the write and the rename share one cleanup.
    try { fsImpl.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    throw err;
  }
  return file;
}

/** Read-only counterpart, used by `--status` (F3) and available to callers/tests too. Never throws. */
export function readHeartbeat(home, fsImpl = fs) {
  try {
    const parsed = JSON.parse(fsImpl.readFileSync(flushLastPath(home), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function safePickupAnnotation(value) {
  if (!value || typeof value !== 'object' || !PICKUP_CODES.has(value.code)) return null;
  const atMs = Date.parse(String(value.at ?? ''));
  if (!Number.isFinite(atMs)) return null;
  const ordinal = value.ordinal;
  if (ordinal !== null && (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= 16)) return null;
  return { at: new Date(atMs).toISOString(), code: value.code, ordinal };
}

/**
 * F1: one JSON object summarizing whatever a pass just did - even a pass that found nothing, a
 * budget-only piggyback pass, or a pass that threw. `result` is what `runNoteFlushCore` resolved with;
 * `caught` is set instead when it threw. Counters are read straight off `result` (`drained`, `remaining`,
 * the per-entry `results` outcomes) - nothing here is invented bookkeeping.
 *
 * Review round 1, BLOCKER: `timer_at` is the stamp `--status` judges staleness on, and only a FULL pass
 * (`mode` unset or `'timer'`) ever sets it. A piggyback pass (`drainQuietly`, called from note-send on
 * every send and note-notify on every Codex turn end) carries the PREVIOUS `timer_at` forward untouched -
 * on a machine whose one-minute timer is dead but whose agents keep sending notes, a piggyback pass used
 * to refresh `at` and `--status` read the machine as healthy. No fallback to `at` when there is no prior
 * `timer_at`: that means no full pass has ever run, which is exactly what `--status` should report.
 */
function buildHeartbeat({ now, ms, result, caught, mode, prevTimerAt, prevPickup }) {
  const at = new Date(now).toISOString();
  const base = { at, host: os.hostname(), pid: process.pid, ms };
  const timerAt = mode === 'piggyback' ? prevTimerAt : at;
  if (timerAt) base.timer_at = timerAt;
  if (mode === 'timer' || mode === 'piggyback') base.mode = mode;
  const version = readPluginVersion();
  if (version) base.version = version;
  const pickup = safePickupAnnotation(prevPickup);
  if (pickup) base.pickup = pickup;

  if (!result) {
    // The pass never reached a result at all - the CLI's own args, or a bug outside every existing
    // try/catch in the pass. Nothing else here can be known, so everything else is honestly zero.
    const message = String(caught?.message ?? caught ?? 'unknown error').slice(0, 200);
    return {
      ...base, queued: 0, delivered: 0, deferred: 0, retired: 0, dead_lettered: 0,
      errors: 1, last_error: message,
    };
  }

  const results = Array.isArray(result.results) ? result.results : [];
  let retired = 0;
  let deadLettered = 0;
  let errors = 0;
  let lastError = null;
  for (const r of results) {
    const outcome = String(r?.outcome ?? '');
    if (HEARTBEAT_RETIRED_OUTCOMES.has(outcome)) retired += 1;
    if (HEARTBEAT_DEAD_LETTERED_OUTCOMES.has(outcome)) deadLettered += 1;
    if (HEARTBEAT_ERROR_OUTCOMES.has(outcome)) { errors += 1; lastError = outcome; }
  }

  return {
    ...base,
    queued: Number(result.queued ?? 0),
    delivered: Number(result.drained ?? 0),
    deferred: Number(result.remaining ?? 0),
    retired,
    dead_lettered: deadLettered,
    errors,
    last_error: lastError,
  };
}

/**
 * F3: `note-flush --status` - what the heartbeat says, without running a pass. Pure and injectable
 * (`fsImpl`, `home`, `now`), so fresh/stale/missing are all testable without a real clock or a real drain.
 *
 * @returns {{ exitCode: number, line: string, json: object }}
 */
export function buildFlushStatus(argv, deps = {}) {
  const args = parseFlushArgs(argv);
  const fsImpl = deps.fsImpl ?? fs;
  const home = toPosix(args.home ?? deps.home ?? os.homedir());
  const now = deps.now ?? Date.now();
  const heartbeat = readHeartbeat(home, fsImpl);
  if (!heartbeat) {
    // Review round 1, finding 2+3: "no file" and "a file nobody can read" are different problems and
    // send you to different places. Either way there is no full pass on record, so the json carries
    // `stale: true` rather than leaving a consumer reading `.stale` as `undefined` (falsy).
    const there = (() => { try { return Boolean(fsImpl.statSync(flushLastPath(home))); } catch { return false; } })();
    return {
      exitCode: 1,
      line: there
        ? 'flush-last.json is there but unreadable or not valid JSON: the flusher cannot be checked'
        : 'flusher has never run on this machine (no flush-last.json)',
      json: { missing: !there, unreadable: there, age_s: null, timer_age_s: null, stale: true },
    };
  }
  const atMs = Date.parse(String(heartbeat.at ?? ''));
  const ageS = Number.isFinite(atMs) ? Math.max(0, Math.round((now - atMs) / 1000)) : null;
  // Review round 1, BLOCKER: staleness is judged on the last FULL pass, never on a piggyback a note-send
  // triggered - those keep running on a machine whose one-minute timer is dead.
  const timerMs = Date.parse(String(heartbeat.timer_at ?? ''));
  const timerAgeS = Number.isFinite(timerMs) ? Math.max(0, Math.round((now - timerMs) / 1000)) : null;
  const stale = timerAgeS === null || timerAgeS * 1000 > HEARTBEAT_STALE_MS;
  const base = `flusher last ran ${ageS === null ? 'an unknown time' : `${ageS}s`} ago on ${heartbeat.host ?? 'unknown host'}: `
    + `queued ${heartbeat.queued ?? 0}, delivered ${heartbeat.delivered ?? 0}, deferred ${heartbeat.deferred ?? 0}, errors ${heartbeat.errors ?? 0}`;
  return {
    exitCode: stale ? 1 : 0,
    line: stale ? `${base}. STALE: the one-minute timer is not running` : base,
    json: { ...heartbeat, age_s: ageS, timer_age_s: timerAgeS, stale },
  };
}

/**
 * Spec 2026-09-20 N2: an ASK or BLOCKED whose recipient is STILL unknown this long after it was queued
 * is dead-lettered on the spot — much sooner than the ordinary give-up (DEFAULT_MAX_ATTEMPTS attempts,
 * about DEFAULT_MAX_AGE_HOURS hours). A note to a slug nobody has ever heard of is not going to become
 * deliverable by retrying it for two days; the evidence (2026-09-20) is two lost hours on five ASKs sent
 * to `fable` instead of `taxonomy-fable`.
 */
export const UNKNOWN_RECIPIENT_DEADLETTER_MS = 10 * 60 * 1000;
/** Only these kinds get the early unknown-recipient dead-letter — an ACK/FYI is already ledger-only (N1). */
export const UNKNOWN_RECIPIENT_KINDS = new Set(['ASK', 'BLOCKED']);

/**
 * Sweep `~/.agents/notes/.listening-*.json`.
 *
 * 0.4.0's Stop hook parked while this session had an unanswered ASK and dropped one of these to tell
 * the flusher not to type at its pane. The parking is gone (2026-09-16 ruling) and nothing writes them
 * any more — but a marker whose hook was killed before it could clean up carries an `until` hours in
 * the future, and a flusher that still read them would go on refusing to nudge that pane for exactly
 * as long. So they are deleted on every run, whether or not there is anything in the outbox.
 *
 * Never throws: a sweep that cannot delete costs nothing, because nothing reads these files.
 *
 * @returns {string[]} the files removed, oldest-listed first
 */
export function cleanupListeningMarkers(home, { fsImpl = fs, dryRun = false } = {}) {
  const dir = notesDir(home);
  const removed = [];
  for (const name of safeReaddir(dir, fsImpl)) {
    if (!LISTENING_MARKER_RE.test(name)) continue;
    const marker = toPosix(path.posix.join(dir, name));
    if (!dryRun) {
      try { fsImpl.rmSync(marker, { force: true }); } catch { continue; }
    }
    removed.push(marker);
  }
  return removed;
}

const STRING_FLAGS = new Set([
  'to', 'max-ms', 'max-attempts', 'max-age-hours', 'per-entry-ms', 'phase2-reserve-ms', 'orca', 'home',
  // `--codex` is to the Codex queue client what `--orca` is to the pane path: the way to name the
  // binary when a non-login shell's PATH cannot find it. $CODEX_CLI does the same thing.
  'codex',
]);
const BOOL_FLAGS = new Set(['json', 'dry-run', 'help', 'status']);

export function parseFlushArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new NoteError(1, `unexpected argument "${a}"`);
    const name = a.slice(2);
    if (BOOL_FLAGS.has(name)) { out[name] = true; continue; }
    if (!STRING_FLAGS.has(name)) throw new NoteError(1, `unknown flag --${name}`);
    const value = argv[++i];
    if (value === undefined) throw new NoteError(1, `--${name} needs a value`);
    out[name] = value;
  }
  return out;
}

/** `--to` filters on the slug the entry was addressed to, or on its resolved handle. */
export function entryMatchesTarget(entry, target) {
  if (!target) return true;
  const t = String(target).toLowerCase();
  return String(entry.toSlug ?? '').toLowerCase() === t
    || String(entry.to ?? '').toLowerCase() === t
    || String(entry.handle ?? '').toLowerCase() === t;
}

function hoursSince(iso, now) {
  const t = Date.parse(String(iso ?? ''));
  return Number.isFinite(t) ? (now - t) / 3_600_000 : 0;
}

/**
 * One BLOCKED line in `~/.agents/notes/ben-inbox.md` when a wake-up is abandoned. Not an envelope sent
 * through note-send — that would need a pane, which is the thing that just failed — but the same file
 * Ben already reads for everything waiting on him.
 */
export function appendBlockedToBen(home, entry, attempts, fsImpl = fs, reason = 'attempts') {
  const file = benInboxPath(home);
  const to = entry.toSlug ?? entry.to;
  // C3: an entry whose only outcome was ever `no-inbox` never reaches the 20-attempt give-up (nothing
  // was ever attempted), so without this it would expire at 48 h with a bare `expired` line and Ben
  // would lose a signal 0.4.2 gave him. "Nobody was reachable for two days" is worth exactly one line
  // in the file he reads.
  const body = reason === 'no-inbox'
    ? `never had an inbox on this machine to deliver to, for ${Math.round(Number(attempts) || 0)}h`
    : `was never typed into ${to} after ${attempts} attempts`;
  try {
    fsImpl.mkdirSync(path.dirname(file), { recursive: true });
    try {
      fsImpl.writeFileSync(file, '# Ben\'s inbox — peer notes that need Ben\n\nAppended by note-send. Delete a line when it is handled.\n\n', { flag: 'wx' });
    } catch { /* already there */ }
    fsImpl.appendFileSync(
      file,
      `- note-flush -> ben, ${new Date().toISOString()} BLOCKED: [${entry.id}] ${body}`
      + `${entry.lastError ? ` (last: ${String(entry.lastError).split('\n')[0].slice(0, 120)})` : ''}.`
      + ` The note IS in the ledger; only the wake-up failed. Entry: ${deadOutboxPath(home, entry.id)}\n`,
      'utf8',
    );
  } catch { /* never fail a drain because a convenience file could not be written */ }
  return file;
}

/**
 * Spec 2026-09-20 N2: one BLOCKED line for every (from, slug) pair a pass dead-lettered — naming the
 * sender, the unknown slug, every id involved, and a suggestion when one is close enough. Distinct from
 * `appendBlockedToBen`: this fires long before the ordinary give-up could, and for a different reason
 * (nobody has ever heard of the slug, not merely "unreachable right now").
 *
 * `group` is `{ from, slug, suggestion, ids, deadPaths }` — one entry per dead-lettered id, aggregated
 * BEFORE this is called (review MINOR 5): several stuck notes to the same wrong slug in one pass must
 * produce one line, not one per note, in the single file Ben reads for everything blocked on him.
 */
export function appendUnknownRecipientToBen(home, group, fsImpl = fs) {
  const file = benInboxPath(home);
  const { from = 'a peer', slug, suggestion, ids = [], deadPaths = [] } = group;
  const count = ids.length;
  const idList = ids.map((id) => `[${id}]`).join(', ');
  const body = `${from} sent ${count} note${count === 1 ? '' : 's'} (${idList}) to "${slug}", `
    + `still unknown on this machine 10 minutes later`
    + (suggestion ? ` — did you mean "${suggestion}"?` : '');
  try {
    fsImpl.mkdirSync(path.dirname(file), { recursive: true });
    try {
      fsImpl.writeFileSync(file, '# Ben\'s inbox — peer notes that need Ben\n\nAppended by note-send. Delete a line when it is handled.\n\n', { flag: 'wx' });
    } catch { /* already there */ }
    fsImpl.appendFileSync(
      file,
      `- note-flush -> ben, ${new Date().toISOString()} BLOCKED: ${body}. `
      + `The note${count === 1 ? ' IS' : 's ARE'} in the ledger; only the wake-up failed.`
      + `${deadPaths.length ? ` ${deadPaths.length === 1 ? 'Entry' : 'Entries'}: ${deadPaths.join(', ')}` : ''}\n`,
      'utf8',
    );
  } catch { /* never fail a drain because a convenience file could not be written */ }
  return file;
}

/**
 * One inbox delivery, dispatched on the registration's KIND, with the per-entry budget as the ceiling.
 *
 * The two clients have very different natural timeouts — a socket write is milliseconds, `codex queue`
 * spins up an app-server and opens SQLite — so each gets its own default, clamped by whatever the drain
 * has left. Never throws: both clients resolve with a verdict, and the verdict is token-free.
 *
 * @returns {Promise<{ok: boolean, delivered: boolean, reason: string, detail?: string}>}
 */
export async function deliverToInbox(home, slug, envelope, record, opts = {}) {
  const budgetMs = Number(opts.budgetMs);
  const cap = (fallback, floor) => (Number.isFinite(budgetMs) ? Math.max(floor, Math.min(fallback, budgetMs)) : fallback);
  // `opts` is passed through whole rather than cherry-picked: `fsImpl`, `env`, `inboxes` and `codex`
  // all matter to one client or the other, and the only thing this function decides is the ceiling.
  if (record.kind === 'claude-socket') {
    return postToClaude(home, slug, envelope, { ...opts, timeoutMs: cap(DEFAULT_POST_TIMEOUT_MS, 250) });
  }
  return queueToCodex(home, slug, envelope, { ...opts, timeoutMs: cap(DEFAULT_QUEUE_TIMEOUT_MS, 1_000) });
}

/**
 * @param {string[]} argv
 * @param {object} deps - { fsImpl, home, env, orca, now, inboxes, deliverToInbox } — injectable for tests.
 */
async function runNoteFlushCore(argv, deps = {}) {
  const args = parseFlushArgs(argv);
  const fsImpl = deps.fsImpl ?? fs;
  const env = deps.env ?? process.env;
  const home = toPosix(args.home ?? deps.home ?? os.homedir());
  const now = deps.now ?? Date.now();
  const clock = deps.clock ?? (() => Date.now());
  const dryRun = Boolean(args['dry-run']);
  const maxMs = args['max-ms'] !== undefined ? Number(args['max-ms']) : DEFAULT_MAX_MS;
  if (!Number.isFinite(maxMs) || maxMs < 0) throw new NoteError(1, `--max-ms must be a non-negative number (got "${args['max-ms']}")`);
  const maxAttempts = args['max-attempts'] !== undefined ? Number(args['max-attempts']) : DEFAULT_MAX_ATTEMPTS;
  const maxAgeHours = args['max-age-hours'] !== undefined ? Number(args['max-age-hours']) : DEFAULT_MAX_AGE_HOURS;
  const perEntryMs = args['per-entry-ms'] !== undefined ? Number(args['per-entry-ms']) : DEFAULT_PER_ENTRY_MS;
  if (!Number.isFinite(perEntryMs) || perEntryMs < 0) throw new NoteError(1, `--per-entry-ms must be a non-negative number (got "${args['per-entry-ms']}")`);
  const phase2Reserve = args['phase2-reserve-ms'] !== undefined ? Number(args['phase2-reserve-ms']) : DEFAULT_PHASE2_RESERVE_MS;
  if (!Number.isFinite(phase2Reserve) || phase2Reserve < 0) throw new NoteError(1, `--phase2-reserve-ms must be a non-negative number (got "${args['phase2-reserve-ms']}")`);

  const started = clock();
  const deadline = started + maxMs;
  const results = [];
  const stamp = new Date(now).toISOString();
  const log = (verb, entry, detail) => {
    const text = `${stamp} ${verb} [${entry.id}] -> ${entry.toSlug ?? entry.to}${detail ? ` — ${detail}` : ''}`;
    if (!dryRun) appendFlushLog(home, text, fsImpl);
    return text;
  };

  // Before any early return: a 0.4.0 marker left on disk must not outlive the version that read it,
  // and an empty outbox is exactly when there is nothing else to do about it.
  for (const marker of cleanupListeningMarkers(home, { fsImpl, dryRun })) {
    if (!dryRun) appendFlushLog(home, `${stamp} cleanup ${marker}`, fsImpl);
  }

  // A flusher killed mid-attempt leaves a claim behind; return anything long abandoned to the outbox
  // before reading it, or that entry is invisible forever (review M2).
  if (!dryRun) reclaimStaleClaims(home, { fsImpl, now });
  const entries = readOutbox(home, fsImpl).filter((e) => entryMatchesTarget(e, args.to));
  if (entries.length === 0) {
    return { ok: true, exitCode: 0, drained: 0, attempted: 0, remaining: 0, results, home, dryRun, queued: entries.length };
  }

  // Retirement pass first: a superseded wake-up must never be typed, and an ancient or hopeless one is
  // dropped rather than retried forever. Both are cheap and need no orca.
  const ledgerText = readLedgerCorpus([notesDir(home)], fsImpl);
  const retired = supersededIds(ledgerText);
  // Every envelope this machine has seen. twoPhaseSend uses it to tell "the composer holds a stack of
  // our own stranded notes" (finish the delivery) from "someone typed something" (never touch it).
  const knownEnvelopes = ledgerText
    .flatMap((text) => String(text).split('\n'))
    .map((l) => l.trim())
    .filter((l) => /^[a-z0-9-]+ → [a-z0-9-]+, \d/u.test(l));
  /**
   * D9: has the recipient already READ this note? `~/.agents/notes/.cursor-<slug>` is the pane's own
   * record of what note-inbox has shown it, so an id in `seen` means the note arrived through the
   * channel that matters and the wake-up has nothing left to wake anybody up for. Typing it then is a
   * pure duplicate — on Netcup, 2026-09-14, `taxonomy-main-tip-8` sat in the outbox for 40 minutes
   * while astra's cursor had already shown it read.
   *
   * One read per slug per drain, cached: a backlog is usually several notes for the same pane. An id
   * the cold-start window suppressed is NOT read — see `cold` below.
   */
  const cursors = new Map();
  const alreadyRead = (slug, id) => {
    if (!slug) return false;
    if (!cursors.has(slug)) cursors.set(slug, readCursor(home, slug, fsImpl));
    const cursor = cursors.get(slug);
    // `cold` ids were marked seen by the cold-start window WITHOUT being displayed. They are the one
    // kind of "seen" that is not "read": retiring those would delete the wake-up for a note the agent
    // was never shown, which is reachable exactly when a peer has been down longer than the window —
    // the case the outbox's 48 hours exist for (review BLOCKER 2).
    return Boolean(cursor.seen?.[id]) && !cursor.cold?.[id];
  };

  // N1: an ACK/FYI queued before this change never wakes anyone — retired unattempted, like a
  // superseded id. Cheap and no orca: parsed straight out of the envelope text already on disk.
  const wakeAllKinds = killSwitchActive(fsImpl, wakeAllKindsPath(home));
  // D3(3), hoisted (review MINOR 9): the early unknown-recipient dead-letter below must not fire on a
  // machine that still has a real shot at the pane later in THIS SAME pass — dead-lettering here would
  // beat a delivery that was coming. Read once, before the retirement loop that needs it.
  const allowTyping = String(env.MULTI_ALLOW_TYPING ?? '') === '1';
  // N2: the same no-orca inputs `isUnknownRecipient` needs, read once for the whole pass. `terminals`
  // is deliberately omitted here — this pass runs before any `terminal list` call, and an entry this
  // check applies to (classification `not-resolved`) never had a live pane in the first place.
  // Fails open: anything unreadable here (a corrupt registry, an I/O error) drops this pass entirely
  // rather than crash a drain whose real job — typing wake-ups — must still run.
  const noUnknownCheck = killSwitchActive(fsImpl, noUnknownCheckPath(home));
  let unknownCheckContext = null;
  if (!noUnknownCheck) {
    try {
      unknownCheckContext = {
        inboxes: readInboxes(home, fsImpl),
        bindings: readBindings(home, fsImpl),
        terminals: [],
        // review BLOCKER 1: a note-send that never delivered still wrote ITS OWN line into this exact
        // mirror before the entry was ever queued (note-send.mjs's ledger-first ordering), which would
        // otherwise make every unresolved recipient look "known" by the note that failed to reach them.
        // Strip every line whose id is still undelivered (queued or already dead-lettered), including
        // this pass's own entries — a sibling drainer may have claimed one and renamed it away already.
        ledgerTexts: withoutIds(
          recentMirrorTexts(home, 3, now, fsImpl),
          new Set([...undeliveredIds(home, fsImpl), ...entries.map((e) => e.id)]),
        ),
      };
    } catch { unknownCheckContext = null; }
  }

  /** review MINOR 5: one ben-inbox line per (from, slug) per pass, not one per dead-lettered entry. */
  const unknownRecipientGroups = new Map();
  const live = [];
  for (const entry of entries) {
    if (retired.has(entry.id)) {
      if (!dryRun) removeOutboxEntry(home, entry.id, fsImpl);
      results.push({ id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'superseded', log: log('superseded', entry, 'a later note supersedes this id') });
      continue;
    }
    if (!wakeAllKinds && LEDGER_ONLY_KINDS.has(parseEnvelope(entry.envelope)?.kind)) {
      if (!dryRun) removeOutboxEntry(home, entry.id, fsImpl);
      results.push({
        id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'retired-quiet-kind',
        log: log('retired-quiet-kind', entry, 'ACK/FYI are ledger-only (N1); no wake-up is ever sent for them'),
      });
      continue;
    }
    if (
      !allowTyping
      && unknownCheckContext
      // review MAJOR 3: a `--no-type` send never resolves a pane either — its classification is
      // `not-checked (--no-type)`, not `not-resolved` — so without this it could churn until the
      // ordinary 48h/20-attempt give-up and never reach the early unknown-recipient dead-letter at all.
      && (entry.classification === 'not-resolved' || entry.classification === 'not-checked (--no-type)')
      && UNKNOWN_RECIPIENT_KINDS.has(parseEnvelope(entry.envelope)?.kind)
      && (now - Date.parse(String(entry.createdAt ?? ''))) >= UNKNOWN_RECIPIENT_DEADLETTER_MS
      && isUnknownRecipient(entry.toSlug ?? entry.to, unknownCheckContext)
    ) {
      // N2: much sooner than the ordinary give-up (DEFAULT_MAX_ATTEMPTS / DEFAULT_MAX_AGE_HOURS) — a
      // slug nothing on this machine has ever heard of is not going to become deliverable by waiting.
      // Gated on `!allowTyping` (review MINOR 9): with typing enabled, the pass below still gets a real
      // shot at the pane, so dead-lettering here would pre-empt a delivery that was already coming.
      const slug = entry.toSlug ?? entry.to;
      const suggestion = suggestSlug(slug, knownSlugs(unknownCheckContext));
      let dead = null;
      if (!dryRun) {
        // review MINOR 4: claim like every other writer in this file — two overlapping drains (the
        // 1-minute timer and a note-send piggyback) must not both dead-letter, and both report to ben,
        // the same entry.
        const claim = claimOutboxEntry(home, entry.id, fsImpl);
        if (!claim) {
          results.push({ id: entry.id, to: slug, outcome: 'claimed-elsewhere' });
          continue;
        }
        dead = killOutboxEntry(home, entry.id, entry, fsImpl);
        releaseClaim(claim, fsImpl);
      }
      // review MINOR 5: collected here, one ben-inbox line per (from, slug) written after the loop —
      // several stuck notes to the same wrong slug must not produce a line each.
      const from = entry.from ?? 'a peer';
      const groupKey = `${from}\u0000${slug}`;
      if (!unknownRecipientGroups.has(groupKey)) {
        unknownRecipientGroups.set(groupKey, { from, slug, suggestion, ids: [], deadPaths: [] });
      }
      const group = unknownRecipientGroups.get(groupKey);
      group.ids.push(entry.id);
      if (dead) group.deadPaths.push(dead);
      results.push({
        id: entry.id, to: slug, outcome: 'unknown-recipient', dead,
        log: log('unknown-recipient', entry, `"${slug}" is still unknown 10 minutes after it was sent`
          + `${suggestion ? ` (did you mean "${suggestion}"?)` : ''} — moved to outbox/dead/ and reported to ben`),
      });
      continue;
    }
    if (alreadyRead(entry.toSlug ?? entry.to, entry.id)) {
      // Before the attempt and age checks: an entry the recipient has read is closed, not abandoned —
      // it must never reach `gave-up`, which writes a BLOCKED line into the one file Ben reads.
      if (!dryRun) removeOutboxEntry(home, entry.id, fsImpl);
      results.push({
        id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'retired',
        log: log('retired', entry, 'already read (cursor)'),
      });
      continue;
    }
    if (Number(entry.attempts ?? 0) >= maxAttempts) {
      // A wake-up nobody could deliver used to be deleted silently after 20 attempts, so a note that
      // never reached its pane left no trace anywhere Ben looks. Now it goes to `outbox/dead/` with one
      // BLOCKED line in the one file he reads (incident 2026-09-14).
      const to = entry.toSlug ?? entry.to;
      let dead = null;
      if (!dryRun) {
        dead = killOutboxEntry(home, entry.id, entry, fsImpl);
        appendBlockedToBen(home, entry, maxAttempts, fsImpl);
      }
      results.push({
        id: entry.id, to, outcome: 'gave-up', dead,
        log: log('gave-up', entry, `${entry.attempts} attempts; moved to outbox/dead/ and reported to ben — the ledger still has the note`),
      });
      continue;
    }
    if (hoursSince(entry.createdAt, now) > maxAgeHours) {
      // C3: an entry that only ever said `no-inbox` was never attempted, so it cannot have reached the
      // 20-attempt give-up that reports to Ben. Expiring it silently would drop a signal 0.4.2 had.
      const neverReachable = entry.lastOutcome === 'no-inbox';
      if (!dryRun) {
        removeOutboxEntry(home, entry.id, fsImpl);
        if (neverReachable) appendBlockedToBen(home, entry, maxAgeHours, fsImpl, 'no-inbox');
      }
      results.push({
        id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'expired',
        log: log('expired', entry, neverReachable
          ? `older than ${maxAgeHours}h and never had an inbox to deliver to; reported to ben. The ledger still has the note`
          : `older than ${maxAgeHours}h; the ledger still has the note`),
      });
      continue;
    }
    live.push(entry);
  }

  // review MINOR 5: one BLOCKED line per (from, slug) for this whole pass, listing every id, rather
  // than one line per dead-lettered entry — a stuck batch to the same wrong slug reads as one incident.
  if (!dryRun) {
    for (const group of unknownRecipientGroups.values()) {
      appendUnknownRecipientToBen(home, group, fsImpl);
    }
  }

  if (live.length === 0 || dryRun) {
    return {
      ok: true, exitCode: 0, drained: 0, attempted: 0, remaining: live.length,
      results: [...results, ...live.map((e) => ({ id: e.id, to: e.toSlug ?? e.to, outcome: dryRun ? 'would-retry' : 'pending' }))],
      home, dryRun, queued: entries.length,
    };
  }

  let drained = 0;
  let attempted = 0;
  let remaining = 0;

  // ── The inbox pass (D3(1)). No orca, no pane, no keystroke: every recipient that has registered an
  //    inbox on this machine gets the envelope posted into it. Everything the composer path needed —
  //    `terminal list`, the classification, two-phase typing — is skipped entirely for those entries,
  //    which is why the common drain now spends no orca calls at all.
  if (!dryRun) {
    for (const gone of pruneInboxes(home, { fsImpl, now })) {
      appendFlushLog(
        home,
        `${stamp} gc-inbox ${gone.slug} ${gone.kind} — registered ${Math.round(gone.ageMs / 3_600_000)}h ago `
        + `(> ${Math.round(INBOX_GC_MS / 3_600_000)}h); registration dropped`,
        fsImpl,
      );
    }
  }
  const inboxes = deps.inboxes ?? readInboxes(home, fsImpl);
  const deliverInbox = deps.deliverToInbox ?? deliverToInbox;
  // D3(3): typing is off unless this machine asks for it explicitly. `allowTyping` itself is computed
  // above, before the retirement pass, which now also needs it (review MINOR 9).
  const needTyping = [];
  /** C1: entries this pass could not START, summarised in one line rather than one attempt each. */
  const shortBudget = [];

  for (const entry of live) {
    const slug = entry.toSlug ?? entry.to;
    const record = inboxes[slug];
    if (!record) { needTyping.push(entry); continue; }

    // C1: never START what this budget cannot finish. A skip here is not an attempt and is not logged
    // per entry - the one summary line below says it once for the whole pass.
    const budget = Math.min(deadline - clock(), perEntryMs);
    const floor = INBOX_FLOOR_MS[record.kind] ?? 750;
    if (budget < floor) {
      remaining += 1;
      shortBudget.push({ id: entry.id, kind: record.kind, floor, budget: Math.max(0, Math.round(budget)) });
      continue;
    }

    // Claimed for the same reason the typed path claims: two drainers must not both deliver one
    // wake-up. A duplicate post is a duplicate TURN in the recipient's session.
    const claim = claimOutboxEntry(home, entry.id, fsImpl);
    if (!claim) {
      results.push({ id: entry.id, to: slug, outcome: 'claimed-elsewhere' });
      continue;
    }
    attempted += 1;

    let verdict;
    try {
      verdict = await deliverInbox(home, slug, entry.envelope, record, {
        fsImpl, env, inboxes, codex: args.codex, budgetMs: budget,
      });
    } catch (err) {
      // Defensive: both clients resolve rather than reject, so this is a bug-catcher, not a path.
      verdict = { ok: false, delivered: false, reason: 'inbox-error', detail: err?.message ?? String(err) };
    }

    const outcome = verdict.delivered ? 'delivered' : String(verdict.reason ?? 'inbox-error');
    // The detail names the TRANSPORT, never the registration: a record carries a token and must never
    // reach a log line, a result or an error (the secret rule, spec D1).
    const detail = verdict.delivered
      ? `inbox (${record.kind})`
      : `inbox (${record.kind}): ${String(verdict.detail ?? verdict.reason ?? 'not delivered').split('\n')[0]}`;

    if (verdict.delivered) {
      drained += 1;
      releaseClaim(claim, fsImpl); // the claim IS the entry now; dropping it retires the wake-up
    } else {
      remaining += 1;
      // C2: `codex-no-thread` and `no-inbox` are states, not failures - the entry is rewritten so the
      // log can go quiet on a repeat, but `attempts` does not move, so neither can ever dead-letter a
      // note nobody tried to deliver.
      const counted = !NOT_AN_ATTEMPT.has(outcome);
      if (!counted) attempted -= 1;
      writeOutboxEntry(home, {
        ...entry, attempts: Number(entry.attempts ?? 0) + (counted ? 1 : 0),
        lastAttemptAt: new Date(now).toISOString(), lastOutcome: outcome, lastError: detail,
      }, fsImpl);
      releaseClaim(claim, fsImpl);
    }
    // C3: a state that repeats every minute for 48 hours says nothing after the first time. The entry
    // remembers its last outcome, so this is "log on change", not "log once and forget".
    const repeat = !verdict.delivered && NOT_AN_ATTEMPT.has(outcome) && entry.lastOutcome === outcome;
    results.push({ id: entry.id, to: slug, outcome, detail, log: repeat ? null : log(outcome, entry, detail) });
  }

  // C1: one line for the whole pass, the way the typed path reports a budget that could never type.
  if (shortBudget.length > 0 && !dryRun) {
    // N6: the smallest, not the first - the line quotes a number, so it had better be the real one.
    const worst = shortBudget.reduce((a, b) => (b.budget < a.budget ? b : a));
    appendFlushLog(
      home,
      `${stamp} budget-only-pass ${shortBudget.length} inbox entr${shortBudget.length === 1 ? 'y' : 'ies'} `
      + `left untouched - ${worst.budget} ms left and a ${worst.kind} delivery needs ${worst.floor} ms to `
      + 'start. Nothing was attempted, so nothing was counted.',
      fsImpl,
    );
  }

  // ── D3(2): nothing registered, and typing is not allowed. The entry stays queued and says so once.
  //    NOT counted as an attempt: nothing was tried, so it must never walk an entry toward `gave-up`
  //    and a BLOCKED line in the one file Ben reads. It ages out at --max-age-hours like anything else.
  if (!allowTyping) {
    for (const entry of needTyping) {
      // C3: at one drain a minute plus one per note-send, logging this unconditionally writes on the
      // order of 2 880 identical lines before the entry expires - into the file SKILL.md tells Ben to
      // grep. The entry remembers the state, so the line goes in on a CHANGE of state and never again
      // while nothing changes. `attempts` is untouched: nothing was attempted.
      const changed = entry.lastOutcome !== 'no-inbox';
      if (!changed || dryRun) {
        remaining += 1;
        results.push({ id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'no-inbox', detail: NO_INBOX_DETAIL, log: null });
        continue;
      }

      // N1: take the claim, like EVERY other writer in this file. `writeOutboxEntry` RECREATES the
      // file, so writing an entry we do not hold RESURRECTS one another drainer has just delivered and
      // retired - and the next drain delivers it again, which is a duplicate turn in a peer's session.
      // The window is not theoretical: this drain can spend seconds awaiting posts for other entries
      // (5 s a socket, 20 s a Codex queue) while the recipient registers and a second drainer delivers
      // this one. Losing the claim means there is nothing of ours left to record, which is the right
      // answer rather than a problem.
      const claim = claimOutboxEntry(home, entry.id, fsImpl);
      if (!claim) {
        results.push({ id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'claimed-elsewhere' });
        continue;
      }
      remaining += 1;
      writeOutboxEntry(
        home,
        { ...entry, lastOutcome: 'no-inbox', lastError: 'no inbox registered on this machine' },
        fsImpl,
      );
      releaseClaim(claim, fsImpl);
      results.push({
        id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'no-inbox', detail: NO_INBOX_DETAIL,
        log: log('no-inbox', entry, 'no inbox registered on this machine (typing is off; set MULTI_ALLOW_TYPING=1 to nudge by keystroke)'),
      });
    }
    return { ok: true, exitCode: 0, drained, attempted, remaining, results, home, dryRun, queued: entries.length };
  }

  // ── The typing pass: the last resort, MULTI_ALLOW_TYPING=1 only. One `terminal list` for the rest.
  if (needTyping.length === 0) {
    return { ok: true, exitCode: 0, drained, attempted, remaining, results, home, dryRun, queued: entries.length };
  }
  let orca;
  let terminals;
  try {
    orca = deps.orca ?? makeOrcaRunner(args.orca, env);
    terminals = (await orca(['terminal', 'list', '--json']))?.terminals ?? [];
  } catch (err) {
    for (const entry of needTyping) {
      remaining += 1;
      results.push({ id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'no-orca', log: log('no-orca', entry, err?.message ?? String(err)) });
    }
    return { ok: true, exitCode: 0, drained, attempted, remaining, results, home, dryRun, queued: entries.length };
  }

  // The durable pane↔slug bindings, read once for the whole drain (spec 2026-09-14 D3). This is what
  // makes `--to astra` resolve when Codex has renamed the pane to `Continue`.
  const bindings = readBindings(home, fsImpl);
  // D6: a binding whose pane has been gone for a day is garbage. Dropped here, where `terminal list` is
  // already in hand — an empty outbox never reaches this point, and never spends an orca call either.
  if (!dryRun) {
    for (const gone of pruneBindings(home, terminals, { fsImpl, now })) {
      appendFlushLog(
        home,
        `${stamp} gc ${gone.handle} ${gone.slug} — no such pane and bound ${Math.round(gone.ageMs / 3_600_000)}h ago `
        + `(> ${Math.round(BINDING_GC_MS / 3_600_000)}h); binding dropped`,
        fsImpl,
      );
    }
  }

  // A caller whose whole budget is smaller than phase 2 can never type anything — note-send's 3 s
  // piggyback, for instance. Say that ONCE rather than once per entry per send, which would bury the
  // log this file exists to make readable.
  const canType = Math.min(maxMs, perEntryMs) > phase2Reserve;
  if (!canType && needTyping.length > 0 && !dryRun) {
    appendFlushLog(
      home,
      `${stamp} budget-only-pass ${needTyping.length} entr${needTyping.length === 1 ? 'y' : 'ies'} left untouched — `
      + `${Math.round(Math.min(maxMs, perEntryMs))} ms budget, phase 2 alone needs ${phase2Reserve} ms`,
      fsImpl,
    );
  }

  for (const entry of needTyping) {
    const budget = deadline - clock();
    if (budget <= 0) { remaining += 1; continue; }

    // M2: claim the entry before touching a pane. Losing the rename means another drainer owns it —
    // skip silently rather than double-typing the same wake-up into the same composer.
    const claim = claimOutboxEntry(home, entry.id, fsImpl);
    if (!claim) {
      results.push({ id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'claimed-elsewhere' });
      continue;
    }

    attempted += 1;
    // The handle recorded at send time is exact — while the pane it named still exists. A peer that
    // restarted gets a NEW handle, and resolving the old one is a permanent `no pane with handle …`
    // that burns all 20 attempts against a pane sitting right there under a different title. So the
    // recorded handle is used only while it is live, and otherwise we go back to the slug, which the
    // title or the binding can still answer.
    const recorded = entry.handle && HANDLE_RE.test(entry.handle) ? entry.handle : null;
    const handleGone = Boolean(recorded) && !terminals.some((t) => t.handle === recorded);
    const target = recorded && !handleGone ? recorded : (entry.toSlug ?? entry.to);
    let outcome;
    let detail = '';
    try {
      // The incident in one line: typing when there is no budget left to press Enter leaves the
      // envelope sitting in someone's composer, where later notes stack on top of it and all of them
      // arrive at once when anything finally submits. Never start what we cannot finish — checked
      // BEFORE we spend anything, so a short-budget caller (note-send's 3 s piggyback) says so plainly
      // instead of reporting a timeout it was always going to hit.
      const entryBudget = Math.min(budget, perEntryMs);
      const lookBound = entryBudget - phase2Reserve;

      // ── Phase A: work out whether to type. THIS is the part a deadline may cut short, because
      //    nothing has been typed yet, so being cut short costs only a retry.
      const TIMED_OUT = { outcome: 'timed-out', detail: `no answer from orca within ${Math.round(lookBound)} ms` };
      const look = entryBudget <= phase2Reserve
        ? { outcome: 'skipped: insufficient budget', detail: `${Math.round(entryBudget)} ms for this entry, phase 2 alone needs ${phase2Reserve} ms` }
        : await withDeadline((async () => {
          const { pane, via } = resolvePaneWithSource(terminals, target, { bindings });
          const show = await showPane(orca, pane.handle);
          const read = await readPane(orca, pane.handle);
          const classification = classifyPane(show, read, { now: clock() });
          return { pane, via, classification };
        })(), lookBound, TIMED_OUT);

      if (look.outcome) {
        ({ outcome, detail } = look);
      } else if (!isSendable(look.classification, look.pane.agentIdentity)) {
        outcome = 'deferred';
        detail = `pane is ${look.classification}`;
      } else if (clock() + phase2Reserve > deadline) {
        // Belt and braces: the look overran its own share, so what is left will not cover phase 2.
        outcome = 'skipped: insufficient budget';
        detail = `${Math.round(deadline - clock())} ms left after looking, phase 2 needs ${phase2Reserve} ms`;
      } else {
        // ── Phase B: typed, therefore UNRACED. Only the orca per-call timeouts bound this, so the
        //    Enter that follows the text always gets its chance.
        // review MINOR 12: same fix as note-send — without `home`/`env`/`fsImpl`, the no-type check falls
        // back to the real `os.homedir()` / `process.env`, so an injected test `home` was silently
        // ignored. Production is unaffected (there they already are the real ones).
        const res = await twoPhaseSend(
          orca, look.pane, entry.envelope, entry.id, look.classification,
          { knownEnvelopes, home, env, fsImpl },
        );
        if (res.delivered) {
          // `confirmed-from-screen`: the id was already in the pane's TRANSCRIPT, so the note arrived
          // on an earlier attempt and only the bookkeeping was left (addendum item 7).
          outcome = res.confirmed ? 'confirmed-from-screen' : 'delivered';
          // Say WHY that pane: `binding` means the title no longer matches the slug and panes.json is
          // the only reason this note reached anybody — the thing whose absence cost 35 minutes on
          // 2026-09-14. The title comes from the live pane, so the log reads as what a human sees.
          const how = look.via === 'binding'
            ? `binding, title ${JSON.stringify(look.pane.title ?? '')}, ${look.classification}`
            : look.classification;
          detail = res.confirmed
            ? `already in ${look.pane.handle}'s transcript — delivered earlier, entry closed`
            : `${res.recovered ? 'completed an interrupted delivery in' : 'typed into'} ${look.pane.handle} (${how})`;
        } else {
          outcome = res.stranded ? 'stranded' : 'deferred';
          detail = res.reason ?? 'not delivered';
        }
      }
    } catch (err) {
      outcome = err instanceof NoteError && err.exitCode === 2 ? 'no-pane' : 'error';
      detail = err?.message ?? String(err);
    }

    // Say it once, for whatever happened: the entry pointed at a pane that is gone, so everything after
    // this line is about a pane we found by name instead.
    if (handleGone) detail = detail ? `handle gone, resolved by slug; ${detail}` : 'handle gone, resolved by slug';

    if (outcome === 'delivered' || outcome === 'confirmed-from-screen') {
      drained += 1;
      releaseClaim(claim, fsImpl); // the claim IS the entry now; dropping it retires the wake-up
    } else {
      remaining += 1;
      writeOutboxEntry(home, {
        ...entry, attempts: Number(entry.attempts ?? 0) + 1,
        lastAttemptAt: new Date(now).toISOString(), lastOutcome: outcome, lastError: detail,
      }, fsImpl);
      releaseClaim(claim, fsImpl);
    }
    // The first line of the detail only: a CLI error can be a paragraph, and flush.log is a scan target.
    // A skip on a pass that could never type is covered by the single summary line above.
    const quiet = !canType && String(outcome).startsWith('skipped');
    results.push({
      id: entry.id, to: entry.toSlug ?? entry.to, outcome, detail,
      log: quiet ? null : log(outcome, entry, detail.split('\n')[0]),
    });
  }

  return { ok: true, exitCode: 0, drained, attempted, remaining, results, home, dryRun, queued: entries.length };
}

/**
 * F1/F2: every pass, whatever happened - a no-op, a budget-only piggyback, or a pass that threw - writes
 * `~/.agents/notes/flush-last.json`. This wraps `runNoteFlushCore` rather than living inside it, so the
 * heartbeat is a pure side effect with one write site for every one of the core function's return points:
 * the pass's result (or thrown error) is untouched, passed straight through (F2).
 *
 * @param {string[]} argv
 * @param {object} deps - everything `runNoteFlushCore` takes, plus `mode` ('timer' | 'piggyback'): set by
 *   a caller that already knows which one it is (`drainQuietly` sets it below). A bare CLI invocation
 *   cannot tell a scheduled timer run from a human running it by hand, so `mode` is left unset rather than
 *   guessed - F1 allows omitting it when the code does not already distinguish the two.
 */
export async function runNoteFlush(argv, deps = {}) {
  const startedAt = Date.now();
  let result;
  let caught = null;
  try {
    result = await runNoteFlushCore(argv, deps);
  } catch (err) {
    caught = err;
  }
  const ms = Date.now() - startedAt;

  // F2: everything below is inside its own try/catch and never changes what the pass returns or throws.
  try {
    // Dry-run's whole contract in this file is "report what would happen, touch nothing on disk" (every
    // other side effect - the log, the outbox, the listening-marker sweep - is already gated the same
    // way); the heartbeat keeps that contract rather than making a preview run look like a real one.
    //
    // SPEC CONFLICT (reported in the build report): F1 asks for a heartbeat on every pass, "including...
    // a budget-only piggyback pass". But note-send's own piggyback drain (`drainQuietly`, `mode:
    // 'piggyback'`) runs BEFORE note-send knows whether anything else will be recorded, and one of its
    // own tests (note-send.test.mjs, out of this territory) asserts that a send which records nothing
    // leaves NO file at all under `~/.agents/notes` - not even the directory. `mkdirSync`-ing that
    // directory to hold a heartbeat for an outbox that had nothing in it would break that guarantee. The
    // conservative fix: a piggyback pass only writes a heartbeat once it has something to report (queued
    // > 0) - which still covers F1's literal "budget-only piggyback pass" example (queued > 0, just not
    // enough budget to finish). A piggyback pass that found nothing, or threw before a result existed,
    // writes nothing. Every timer/CLI-invoked pass (`mode` unset) is unaffected and always writes,
    // including with nothing queued - that is the audience `--status` actually serves.
    const queued = result ? Number(result.queued ?? 0) : 0;
    const skipEmptyPiggyback = deps.mode === 'piggyback' && queued === 0;
    if (!skipEmptyPiggyback && (!result || !result.dryRun)) {
      const fsImpl = deps.fsImpl ?? fs;
      const now = deps.now ?? Date.now();
      let home;
      if (result) {
        home = result.home;
      } else {
        let homeArg;
        try { ({ home: homeArg } = parseFlushArgs(argv)); } catch { /* argv itself is what threw */ }
        home = toPosix(homeArg ?? deps.home ?? os.homedir());
      }
      // A piggyback pass carries the prior timer identity. Every pass also carries a prior VALID pickup
      // annotation; ordinary peer activity must not erase the last registered-pickup observation.
      const previous = readHeartbeat(home, fsImpl);
      const prevTimerAt = deps.mode === 'piggyback' ? previous?.timer_at : undefined;
      writeHeartbeatFile(home, buildHeartbeat({
        now, ms, result, caught, mode: deps.mode, prevTimerAt, prevPickup: previous?.pickup,
      }), fsImpl);
    }
  } catch { /* F2: a heartbeat failure must never touch the pass */ }

  if (caught) throw caught;
  return result;
}

/**
 * The piggyback drain: note-send and note-notify call this instead of spawning a process. It swallows
 * everything — a drain that throws must never take down the send or the turn-end hook that invoked it.
 */
function hasArg(argv, name) {
  const exact = `--${name}`;
  return argv.some((arg) => arg === exact || String(arg).startsWith(`${exact}=`));
}

function sameLocalPath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function switchActive(file, fsImpl) {
  try { fsImpl.statSync(file); return true; } catch (error) {
    return Boolean(error) && error.code !== 'ENOENT' && error.code !== 'ENOTDIR';
  }
}

function safePickupSummary(value) {
  if (!value || !PICKUP_CODES.has(value.code)) return { code: 'PICKUP_FAILED', ordinal: null };
  const ordinal = value.ordinal;
  if (ordinal !== null && (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= 16)) {
    return { code: 'PICKUP_FAILED', ordinal: null };
  }
  return { code: value.code, ordinal };
}

function annotatePickup(home, expectedIdentity, summary, deps) {
  if (!expectedIdentity) return;
  const fsImpl = deps.fsImpl ?? fs;
  const current = readHeartbeat(home, fsImpl);
  if (!sameHeartbeatIdentity(heartbeatIdentity(current), expectedIdentity)) return;
  const now = typeof deps.now === 'function' ? deps.now() : (deps.now ?? Date.now());
  const pickup = safePickupAnnotation({ at: new Date(now).toISOString(), ...summary });
  if (!pickup) return;
  try {
    writeHeartbeatFile(home, { ...current, pickup }, fsImpl, expectedIdentity);
  } catch { /* optional diagnostics never change peer delivery or CLI exit */ }
}

/**
 * Standalone-only admission after a successful normal flush. Imports and piggyback callers never call
 * this function. A missing registration is one local existence probe and returns null.
 */
export async function runPostFlushPickup(argv, context, deps = {}) {
  if (['help', 'status', 'dry-run', 'to', 'home'].some((name) => hasArg(argv, name))) return null;
  if (context?.result?.ok !== true) return null;

  const fsImpl = deps.fsImpl ?? fs;
  const env = deps.env ?? process.env;
  const home = path.resolve(deps.homedir ?? os.homedir());
  const base = path.resolve(home, '.agents');
  const configuredBase = path.resolve(env.AGENTS_HOME || base);
  const registration = path.join(base, 'ws', 'decisions-pickup', 'registrations.json');

  const disabled = switchActive(path.join(base, 'ws-off'), fsImpl)
    || switchActive(path.join(base, 'ws-off-decisions'), fsImpl);
  let configured = false;
  try { fsImpl.lstatSync(registration); configured = true; } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') configured = true;
  }
  if (!configured) return null;

  const heartbeat = readHeartbeat(home, fsImpl);
  const identity = heartbeat?.pid === (deps.pid ?? process.pid) ? heartbeatIdentity(heartbeat) : null;
  let summary;
  if (disabled) {
    summary = { code: 'PICKUP_DISABLED', ordinal: null };
  } else if (!sameLocalPath(configuredBase, base) || typeof context.result.home !== 'string'
      || !sameLocalPath(context.result.home, home)) {
    summary = { code: 'PICKUP_CONFIG_INVALID', ordinal: null };
  } else if (!Number.isFinite(Number(context.elapsedMs)) || Number(context.elapsedMs) >= PICKUP_ADMISSION_MS) {
    summary = { code: 'PICKUP_SKIPPED_BUDGET', ordinal: null };
  } else {
    try {
      const importer = deps.importer ?? (() => import('../../decisions/scripts/decisions-pickup.mjs'));
      const module = await importer();
      const pickupNow = typeof deps.now === 'function' ? deps.now() : deps.now;
      summary = safePickupSummary(await module.runRegisteredPickup(
        { registrationPath: registration },
        { fsImpl, env, agentsHome: base, now: pickupNow },
      ));
      if (summary.code === 'PICKUP_UNCONFIGURED') return null;
    } catch {
      summary = { code: 'PICKUP_FAILED', ordinal: null };
    }
  }
  annotatePickup(home, identity, summary, deps);
  return summary;
}

export async function drainQuietly(deps = {}, opts = {}) {
  const argv = [];
  if (opts.to) argv.push('--to', String(opts.to));
  argv.push('--max-ms', String(opts.maxMs ?? 3_000));
  if (opts.orca) argv.push('--orca', String(opts.orca));
  try {
    // F1: this is the piggyback path by construction - note-send and note-notify are its only callers.
    return await runNoteFlush(argv, { mode: 'piggyback', ...deps });
  } catch {
    return { ok: false, drained: 0, attempted: 0, remaining: 0, results: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const USAGE = `note-flush — deliver the wake-ups note-send deferred, and forget the ones that no longer matter.

  note-flush [--to <slug>] [--json] [--max-ms 100000] [--max-attempts 20] [--max-age-hours 48]
             [--codex <cmd>] [--orca <cmd>] [--dry-run]
  note-flush --status [--json]

Delivery goes to the recipient's OWN INBOX — a Claude session's socket, a Codex session's queue — which
its own hook registered in ~/.agents/notes/inboxes.json. Nothing is typed into anybody's composer.
A recipient with no registered inbox leaves its entry queued and one \`no-inbox\` line in the log; the
note itself is already in the ledger, which is the channel. Typing is the last resort and off by
default: MULTI_ALLOW_TYPING=1 turns it back on, and ~/.agents/notes/no-type kills it outright.

Runs from note-send (piggyback), from note-notify at a Codex turn end, and from a 1-minute timer.
Exit 0 always. Every attempt is appended to ~/.agents/notes/flush.log.

Every pass, whatever happened, overwrites ~/.agents/notes/flush-last.json with one summary object, so a
quiet flush.log can be told apart from "the timer is not running". \`--status\` prints that summary in one
line and exits 1 if it is missing or older than 5 minutes.
`;

export function formatFlush(result) {
  if (result.results.length === 0) return 'note-flush: outbox empty';
  const head = `note-flush: ${result.drained} delivered, ${result.remaining} left, ${result.attempted} attempted`;
  return [head, ...result.results.map((r) => `  ${r.outcome} [${r.id}] -> ${r.to}${r.detail ? ` — ${r.detail.split('\n')[0]}` : ''}`)].join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const wantsJson = argv.includes('--json');
  if (argv.includes('--help')) { process.stdout.write(USAGE); return 0; }
  if (argv.includes('--status')) {
    try {
      const status = buildFlushStatus(argv);
      process.stdout.write(wantsJson ? `${JSON.stringify(status.json)}\n` : `${status.line}\n`);
      return status.exitCode;
    } catch (err) {
      process.stdout.write(`note-flush: ${err?.message ?? String(err)}\n`);
      return 1;
    }
  }
  try {
    const startedAt = Date.now();
    const result = await runNoteFlush(argv);
    const elapsedMs = Date.now() - startedAt;
    process.stdout.write(wantsJson ? `${JSON.stringify(result)}\n` : `${formatFlush(result)}\n`);
    try { await runPostFlushPickup(argv, { result, elapsedMs }); } catch { /* optional pickup is fail-closed */ }
  } catch (err) {
    const message = err?.message ?? String(err);
    if (wantsJson) process.stdout.write(`${JSON.stringify({ ok: false, exitCode: 0, drained: 0, results: [], error: message })}\n`);
    else process.stdout.write(`note-flush: ${message}\n`);
  }
  return 0;
}

if (isMainModule(import.meta.url)) {
  main().then(
    (code) => { process.exitCode = code; },
    () => { process.exitCode = 1; },
  );
}
