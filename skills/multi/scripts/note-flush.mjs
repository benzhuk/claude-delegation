#!/usr/bin/env node
// note-flush — drain the outbox of deferred wake-ups (spec V5).
//
// note-send writes the envelope to the ledger BEFORE it tries to type, so a deferral loses nothing:
// the note is already where the recipient reads. What is left over is the WAKE-UP — the typed nudge
// that would have made the peer look sooner. Those live in `~/.agents/notes/outbox/<id>.json`, and
// this drains them whenever a pane might be idle:
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
//   · Never types at a pane that is LISTENING: a fresh `.listening-<slug>.json` means that session is
//     parked in its Stop hook and will pull the note into its own context. Typing would put the same
//     note in Ben's composer for nothing. The entry waits, unattempted and un-aged.
//   · Never types into a pane that is not sendable for its vendor (Claude: idle or working; Codex:
//     idle only — it does not queue typed input mid-turn).
//   · Two-phase typing, exactly as note-send does it, through the same shared code. It NEVER starts
//     typing unless enough budget remains to press Enter afterwards: an envelope stranded in a peer's
//     composer is how a stack of stale notes arrives at once (incident 2026-09-14).
//   · Exit 0 always. A drain is background work; a non-zero exit would make a turn-end hook look broken.
//   · Every attempt is appended to `~/.agents/notes/flush.log`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NoteError } from './envelope.mjs';
import {
  toPosix, makeOrcaRunner, resolvePaneWithSource, showPane, readPane, classifyPane, isSendable,
  twoPhaseSend, readOutbox, writeOutboxEntry, removeOutboxEntry, appendFlushLog,
  notesDir, readLedgerCorpus, supersededIds, isMainModule, HANDLE_RE,
  claimOutboxEntry, releaseClaim, reclaimStaleClaims, withDeadline,
  killOutboxEntry, deadOutboxPath, benInboxPath,
  readBindings, pruneBindings, BINDING_GC_MS, readCursor, isListening,
} from './transport.mjs';

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

const STRING_FLAGS = new Set(['to', 'max-ms', 'max-attempts', 'max-age-hours', 'per-entry-ms', 'phase2-reserve-ms', 'orca', 'home']);
const BOOL_FLAGS = new Set(['json', 'dry-run', 'help']);

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
export function appendBlockedToBen(home, entry, attempts, fsImpl = fs) {
  const file = benInboxPath(home);
  const to = entry.toSlug ?? entry.to;
  try {
    fsImpl.mkdirSync(path.dirname(file), { recursive: true });
    try {
      fsImpl.writeFileSync(file, '# Ben\'s inbox — peer notes that need Ben\n\nAppended by note-send. Delete a line when it is handled.\n\n', { flag: 'wx' });
    } catch { /* already there */ }
    fsImpl.appendFileSync(
      file,
      `- note-flush → ben, ${new Date().toISOString()} BLOCKED: [${entry.id}] was never typed into ${to} after ${attempts} attempts`
      + `${entry.lastError ? ` (last: ${String(entry.lastError).split('\n')[0].slice(0, 120)})` : ''}.`
      + ` The note IS in the ledger; only the wake-up failed. Entry: ${deadOutboxPath(home, entry.id)}\n`,
      'utf8',
    );
  } catch { /* never fail a drain because a convenience file could not be written */ }
  return file;
}

/**
 * @param {string[]} argv
 * @param {object} deps - { fsImpl, home, env, orca, now } — all injectable for tests.
 */
export async function runNoteFlush(argv, deps = {}) {
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

  // A flusher killed mid-attempt leaves a claim behind; return anything long abandoned to the outbox
  // before reading it, or that entry is invisible forever (review M2).
  if (!dryRun) reclaimStaleClaims(home, { fsImpl, now });
  const entries = readOutbox(home, fsImpl).filter((e) => entryMatchesTarget(e, args.to));
  if (entries.length === 0) {
    return { ok: true, exitCode: 0, drained: 0, attempted: 0, remaining: 0, results, home, dryRun };
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
  // D5: who is parked in a Stop hook right now? One stat per slug per drain; a marker is only believed
  // while it is unexpired AND (on this host) its process is alive.
  const listeners = new Map();
  const listening = (slug) => {
    if (!slug) return null;
    if (!listeners.has(slug)) listeners.set(slug, isListening(home, slug, { fsImpl, now }));
    return listeners.get(slug);
  };

  let parked = 0;
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

  const live = [];
  for (const entry of entries) {
    if (retired.has(entry.id)) {
      if (!dryRun) removeOutboxEntry(home, entry.id, fsImpl);
      results.push({ id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'superseded', log: log('superseded', entry, 'a later note supersedes this id') });
      continue;
    }
    const marker = listening(entry.toSlug ?? entry.to);
    if (marker) {
      // Not a deferral: attempts are NOT incremented and the entry is left exactly as it is. A 15-minute
      // long poll spans fifteen 1-minute drains, which would otherwise burn most of the 20-attempt
      // budget for a wake-up nobody needed to type.
      parked += 1;
      results.push({
        id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'listening',
        log: log('listening', entry, `that session is parked in a Stop hook until ${new Date(Number(marker.until)).toISOString()} and will read it there`),
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
      if (!dryRun) removeOutboxEntry(home, entry.id, fsImpl);
      results.push({ id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'expired', log: log('expired', entry, `older than ${maxAgeHours}h; the ledger still has the note`) });
      continue;
    }
    live.push(entry);
  }

  if (live.length === 0 || dryRun) {
    return {
      ok: true, exitCode: 0, drained: 0, attempted: 0, remaining: live.length + parked,
      results: [...results, ...live.map((e) => ({ id: e.id, to: e.toSlug ?? e.to, outcome: dryRun ? 'would-retry' : 'pending' }))],
      home, dryRun,
    };
  }

  // ── The typing pass. One `terminal list` for the whole drain.
  let orca;
  let terminals;
  try {
    orca = deps.orca ?? makeOrcaRunner(args.orca, env);
    terminals = (await orca(['terminal', 'list', '--json']))?.terminals ?? [];
  } catch (err) {
    for (const entry of live) results.push({ id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'no-orca', log: log('no-orca', entry, err?.message ?? String(err)) });
    return { ok: true, exitCode: 0, drained: 0, attempted: 0, remaining: live.length, results, home, dryRun };
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

  let drained = 0;
  let attempted = 0;
  let remaining = 0;

  // A caller whose whole budget is smaller than phase 2 can never type anything — note-send's 3 s
  // piggyback, for instance. Say that ONCE rather than once per entry per send, which would bury the
  // log this file exists to make readable.
  const canType = Math.min(maxMs, perEntryMs) > phase2Reserve;
  if (!canType && live.length > 0 && !dryRun) {
    appendFlushLog(
      home,
      `${stamp} budget-only-pass ${live.length} entr${live.length === 1 ? 'y' : 'ies'} left untouched — `
      + `${Math.round(Math.min(maxMs, perEntryMs))} ms budget, phase 2 alone needs ${phase2Reserve} ms`,
      fsImpl,
    );
  }

  for (const entry of live) {
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
        const res = await twoPhaseSend(orca, look.pane, entry.envelope, entry.id, look.classification, { knownEnvelopes });
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

  return { ok: true, exitCode: 0, drained, attempted, remaining: remaining + parked, results, home, dryRun };
}

/**
 * The piggyback drain: note-send and note-notify call this instead of spawning a process. It swallows
 * everything — a drain that throws must never take down the send or the turn-end hook that invoked it.
 */
export async function drainQuietly(deps = {}, opts = {}) {
  const argv = [];
  if (opts.to) argv.push('--to', String(opts.to));
  argv.push('--max-ms', String(opts.maxMs ?? 3_000));
  if (opts.orca) argv.push('--orca', String(opts.orca));
  try {
    return await runNoteFlush(argv, deps);
  } catch {
    return { ok: false, drained: 0, attempted: 0, remaining: 0, results: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const USAGE = `note-flush — retry the wake-ups note-send could not type, and forget the ones that no longer matter.

  note-flush [--to <slug>] [--json] [--max-ms 8000] [--max-attempts 20] [--max-age-hours 48]
             [--orca <cmd>] [--dry-run]

The notes themselves are already in the ledger; this only retries the typed nudge.
Runs from note-send (piggyback), from note-notify at a Codex turn end, and from a 1-minute timer.
Exit 0 always. Attempts are appended to ~/.agents/notes/flush.log.
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
  try {
    const result = await runNoteFlush(argv);
    process.stdout.write(wantsJson ? `${JSON.stringify(result)}\n` : `${formatFlush(result)}\n`);
  } catch (err) {
    const message = err?.message ?? String(err);
    if (wantsJson) process.stdout.write(`${JSON.stringify({ ok: false, exitCode: 0, drained: 0, results: [], error: message })}\n`);
    else process.stdout.write(`note-flush: ${message}\n`);
  }
  return 0;
}

if (isMainModule(import.meta.url)) process.exitCode = await main();
