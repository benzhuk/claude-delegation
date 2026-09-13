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
//   · from a 2-minute timer as a safety net (T3 installs the unit/plist/scheduled task)
//
// USAGE
//   note-flush [--to <slug>] [--json] [--max-ms 8000] [--max-attempts 20] [--max-age-hours 48]
//              [--orca <cmd>] [--dry-run] [--home <dir>]
//
// RULES
//   · Never blocks: one pass over the outbox inside --max-ms, then it stops and leaves the rest.
//   · Never re-sends a note whose id a later `supersedes` retired — that entry is dropped, logged.
//   · Never types into a pane that is not sendable for its vendor (Claude: idle or working; Codex:
//     idle only — it does not queue typed input mid-turn).
//   · Two-phase typing, exactly as note-send does it, through the same shared code.
//   · Exit 0 always. A drain is background work; a non-zero exit would make a turn-end hook look broken.
//   · Every attempt is appended to `~/.agents/notes/flush.log`.

import fs from 'node:fs';
import os from 'node:os';

import { NoteError } from './envelope.mjs';
import {
  toPosix, makeOrcaRunner, resolvePane, showPane, readPane, classifyPane, isSendable,
  twoPhaseSend, readOutbox, writeOutboxEntry, removeOutboxEntry, appendFlushLog,
  notesDir, readLedgerCorpus, supersededIds, isMainModule, HANDLE_RE,
} from './transport.mjs';

export const DEFAULT_MAX_MS = 8_000;
/** A wake-up that has failed this often is not going to start working; the ledger still has the note. */
export const DEFAULT_MAX_ATTEMPTS = 20;
/** Older than this and the nudge is pointless — the recipient has read the ledger or moved on. */
export const DEFAULT_MAX_AGE_HOURS = 48;

const STRING_FLAGS = new Set(['to', 'max-ms', 'max-attempts', 'max-age-hours', 'orca', 'home']);
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

  const started = clock();
  const deadline = started + maxMs;
  const results = [];
  const stamp = new Date(now).toISOString();
  const log = (verb, entry, detail) => {
    const text = `${stamp} ${verb} [${entry.id}] -> ${entry.toSlug ?? entry.to}${detail ? ` — ${detail}` : ''}`;
    if (!dryRun) appendFlushLog(home, text, fsImpl);
    return text;
  };

  const entries = readOutbox(home, fsImpl).filter((e) => entryMatchesTarget(e, args.to));
  if (entries.length === 0) {
    return { ok: true, exitCode: 0, drained: 0, attempted: 0, remaining: 0, results, home, dryRun };
  }

  // Retirement pass first: a superseded wake-up must never be typed, and an ancient or hopeless one is
  // dropped rather than retried forever. Both are cheap and need no orca.
  const retired = supersededIds(readLedgerCorpus([notesDir(home)], fsImpl));
  const live = [];
  for (const entry of entries) {
    if (retired.has(entry.id)) {
      if (!dryRun) removeOutboxEntry(home, entry.id, fsImpl);
      results.push({ id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'superseded', log: log('superseded', entry, 'a later note supersedes this id') });
      continue;
    }
    if (Number(entry.attempts ?? 0) >= maxAttempts) {
      if (!dryRun) removeOutboxEntry(home, entry.id, fsImpl);
      results.push({ id: entry.id, to: entry.toSlug ?? entry.to, outcome: 'gave-up', log: log('gave-up', entry, `${entry.attempts} attempts; the ledger still has the note`) });
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
      ok: true, exitCode: 0, drained: 0, attempted: 0, remaining: live.length,
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

  let drained = 0;
  let attempted = 0;
  let remaining = 0;

  for (const entry of live) {
    if (clock() >= deadline) { remaining += 1; continue; }
    attempted += 1;
    const target = entry.handle && HANDLE_RE.test(entry.handle) ? entry.handle : (entry.toSlug ?? entry.to);
    let outcome;
    let detail = '';
    try {
      const pane = resolvePane(terminals, target);
      const show = await showPane(orca, pane.handle);
      const read = await readPane(orca, pane.handle);
      const classification = classifyPane(show, read, { now: clock() });
      if (!isSendable(classification, pane.agentIdentity)) {
        outcome = 'deferred';
        detail = `pane is ${classification}`;
      } else {
        const res = await twoPhaseSend(orca, pane, entry.envelope, entry.id, classification);
        if (res.delivered) {
          outcome = 'delivered';
          detail = `typed into ${pane.handle} (${classification})`;
        } else {
          outcome = res.stranded ? 'stranded' : 'deferred';
          detail = res.reason ?? 'not delivered';
        }
      }
    } catch (err) {
      outcome = err instanceof NoteError && err.exitCode === 2 ? 'no-pane' : 'error';
      detail = err?.message ?? String(err);
    }

    if (outcome === 'delivered') {
      drained += 1;
      removeOutboxEntry(home, entry.id, fsImpl);
    } else {
      remaining += 1;
      writeOutboxEntry(home, {
        ...entry, attempts: Number(entry.attempts ?? 0) + 1,
        lastAttemptAt: new Date(now).toISOString(), lastOutcome: outcome, lastError: detail,
      }, fsImpl);
    }
    // The first line of the detail only: a CLI error can be a paragraph, and flush.log is a scan target.
    results.push({ id: entry.id, to: entry.toSlug ?? entry.to, outcome, detail, log: log(outcome, entry, detail.split('\n')[0]) });
  }

  return { ok: true, exitCode: 0, drained, attempted, remaining, results, home, dryRun };
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
Runs from note-send (piggyback), from note-notify at a Codex turn end, and from a 2-minute timer.
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
