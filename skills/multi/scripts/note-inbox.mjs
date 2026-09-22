#!/usr/bin/env node
// note-inbox — read the ledger as an inbox (spec V2).
//
// v4's first premise: THE LEDGER IS THE CHANNEL. A note is discovered by reading, not by being typed
// at. Typing into a pane is a best-effort wake-up that the pilot showed fails for hours at a time when
// the recipient is mid-turn. This script is the read side, and it is the one command a session runs to
// learn whether anyone is waiting on it.
//
// USAGE
//   note-inbox [--me <slug>] [--ack] [--json] [--days 3] [--cold-start-hours 12] [--orca <cmd>]
//   note-inbox --bind <slug> [--title <text>]
//   note-inbox --unbind
//
//   --me      the pane's slug. Otherwise the session's own name (--transcript-path + --session-id,
//             D6), otherwise $NOTE_SLUG, otherwise the binding recorded for $ORCA_TERMINAL_HANDLE,
//             otherwise the pane title via `orca terminal show` (cached 10 min). Never guessed — see
//             transport.resolveSlug.
//   --transcript-path/--session-id  this session's own hook-payload fields, for the session-name
//             source above. Only used together; either alone is simply skipped, never guessed.
//   --bind    record "this pane IS <slug>" in ~/.agents/notes/panes.json and do nothing else. A --me
//             read does the same registration as a side effect, so a session that reads its inbox is
//             reachable by slug even after its title changes (spec 2026-09-14).
//   --ack     advance the cursor: everything printed is marked seen and will not be shown again.
//   --json    one JSON object instead of the human list.
//   --days    how many days of ledger files to scan (default 3).
//   --cold-start-hours  on a pane with no cursor yet, show only notes this recent and mark the rest
//             seen, so a first run does not dump three days of history. Reported, never silent.
//
// WHAT IT SCANS
//   ~/.agents/notes/YYYY-MM-DD.md            — the machine-wide mirror every sender writes
//   <repo>/docs/ledger/YYYY-MM-DD.md         — the current repo's main checkout (git rev-parse
//                                              --git-common-dir), which is where a peer on this box
//                                              wrote a cross-repo note
//
// WHAT COUNTS AS MINE
//   Lines whose `to` is my slug. `--me ben` also picks up lines addressed to the reserved `ben`.
//   Lines I sent myself are never my inbox. A line already in the cursor is never shown twice.
//
// EXIT 0 ALWAYS. An inbox read must never fail a caller: a hook runs it on every prompt, and a hook
// that throws breaks Ben's session. Problems are reported in the output, not in the exit code.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NoteError, parseEnvelope, envelopeInstant, timeParts, validateSlug, DEFAULT_ZONE } from './envelope.mjs';
import {
  toPosix, gitRunner, mainCheckout, makeOrcaRunner, resolveSlug, isMainModule,
  notesDir, ledgerDir, recentLedgerFiles, readIfExists, readCursor, writeCursor, cursorPath, worktreePathFromEnv,
  HANDLE_RE, writeBinding, removeBinding, maybeBindPane, bindingsPath, cursorProblem,
} from './transport.mjs';

export const DEFAULT_DAYS = 3;
export const DEFAULT_COLD_START_HOURS = 12;

const STRING_FLAGS = new Set([
  'me', 'days', 'cold-start-hours', 'orca', 'repo', 'zone', 'home', 'bind', 'title', 'ack-ids',
  // D6 (rename-build spec): threaded straight into resolveSlug's new session-name source; for the
  // hand-run CLI case, since a bare `note-inbox` has no other way to state which session it is.
  'transcript-path', 'session-id',
]);
const BOOL_FLAGS = new Set(['ack', 'json', 'help', 'no-repo', 'active-terminal', 'no-bind', 'unbind']);

export function parseInboxArgs(argv) {
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

/**
 * Every envelope line in `files`, parsed, in file order. A line that does not parse is kept as a raw
 * entry rather than dropped: an unparseable line in the ledger is exactly the thing a reader must see.
 */
export function scanLedgerFiles(files, fsImpl = fs) {
  const out = [];
  for (const { file, ymd } of files) {
    const text = readIfExists(file, fsImpl);
    if (!text) continue;
    for (const raw of text.split('\n')) {
      const line = raw.trimEnd();
      if (!line || line.startsWith('#')) continue;
      const g = parseEnvelope(line);
      if (g) out.push({ line, file, ymd, ...g });
      else if (/^[a-z0-9-]+ → /u.test(line)) out.push({ line, file, ymd, unparsed: true });
    }
  }
  return out;
}

/** Deduplicate by id, keeping the first sighting — the same line lands in two or three files. */
export function dedupeById(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    const key = e.id ?? e.line;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function addressedToMe(entry, slug) {
  if (entry.unparsed) return false;
  if (entry.from === slug) return false; // my own sends are not my inbox
  return entry.to === slug;
}

/**
 * @param {string[]} argv
 * @param {object} deps - { fsImpl, home, env, cwd, git, orca, now } — all injectable for tests.
 */
export async function runNoteInbox(argv, deps = {}) {
  const args = parseInboxArgs(argv);
  const fsImpl = deps.fsImpl ?? fs;
  const env = deps.env ?? process.env;
  const home = toPosix(args.home ?? deps.home ?? os.homedir());
  const cwd = toPosix(deps.cwd ?? process.cwd());
  const git = deps.git ?? gitRunner;
  const now = deps.now ?? Date.now();
  const zone = args.zone || env.NOTE_SEND_ZONE || DEFAULT_ZONE;

  // ── `--unbind`: forget THIS pane's binding. Rebinding and 24 h of absence were the only ways out,
  //    which left a mistaken `--bind` — or two panes bound to one slug, which is exit 2 for every send
  //    to that slug — with no fix but hand-editing panes.json (review MINOR 6).
  if (args.unbind) {
    const handle = env.ORCA_TERMINAL_HANDLE;
    if (!handle || !HANDLE_RE.test(String(handle))) {
      throw new NoteError(
        2,
        `cannot unbind: $ORCA_TERMINAL_HANDLE ${handle ? `is "${handle}", which is not a term_… handle` : 'is not set in this shell'}. `
        + 'Run --unbind inside the pane whose binding you want removed, or delete its entry from '
        + `${bindingsPath(home)} by hand.`,
      );
    }
    const removal = removeBinding(home, String(handle), { fs: fsImpl });
    return {
      ok: !removal.error, exitCode: 0, mode: 'unbind', slug: removal.removed, slugSource: '--unbind',
      handle: String(handle), binding: removal, file: removal.file ?? bindingsPath(home),
      acked: false, cursor: null, cursorFallback: false, scanned: [], days: 0, coldStart: false,
      suppressed: 0, count: 0, notes: [],
      problems: removal.error ? [`binding not removed from ${bindingsPath(home)} (${removal.error})`] : [],
    };
  }

  // ── `--bind <slug>`: registration ONLY, no inbox read (spec 2026-09-14 D2). For Ben or a hook, in
  //    the pane itself. The agent in the pane is the authority on who it is, so this outranks the title
  //    from here on — which is what survives Codex renaming the pane to `Continue` on restart.
  if (args.bind !== undefined) {
    const slug = validateSlug('bind', String(args.bind));
    const handle = env.ORCA_TERMINAL_HANDLE;
    if (!handle || !HANDLE_RE.test(String(handle))) {
      throw new NoteError(
        2,
        `cannot bind "${slug}": $ORCA_TERMINAL_HANDLE ${handle ? `is "${handle}", which is not a term_… handle` : 'is not set in this shell'}. `
        + 'Run --bind inside the Orca pane you want bound — the handle is what the binding is keyed by.',
      );
    }
    const binding = writeBinding(home, String(handle), slug, { fs: fsImpl, now, title: args.title });
    return {
      ok: !binding.error, exitCode: 0, mode: 'bind', slug, slugSource: '--bind', handle: String(handle),
      binding, file: binding.file ?? bindingsPath(home), acked: false, cursor: null, cursorFallback: false,
      scanned: [], days: 0, coldStart: false, suppressed: 0, count: 0, notes: [],
      problems: binding.error ? [`binding not written to ${bindingsPath(home)} (${binding.error})`] : [],
    };
  }

  const days = args.days !== undefined ? Number(args.days) : DEFAULT_DAYS;
  if (!Number.isInteger(days) || days < 1) throw new NoteError(1, `--days must be a positive integer (got "${args.days}")`);
  const coldHours = args['cold-start-hours'] !== undefined
    ? Number(args['cold-start-hours']) : DEFAULT_COLD_START_HOURS;
  if (!Number.isFinite(coldHours) || coldHours < 0) {
    throw new NoteError(1, `--cold-start-hours must be a non-negative number (got "${args['cold-start-hours']}")`);
  }

  const notes = [];
  const problems = [];

  // ── Who am I. Only build an orca runner if the cheap sources did not answer.
  const needsOrca = !args.me && !env.NOTE_SLUG;
  const orca = deps.orca ?? (needsOrca ? makeOrcaRunner(args.orca, env) : null);
  const { slug, source: slugSource } = await resolveSlug({
    explicit: args.me, env, home, fsImpl, orca, now,
    // D6: threaded through unconditionally — resolveSlug itself never reads these from process.env, so
    // without the flags this source is simply absent, exactly today's behaviour.
    transcriptPath: args['transcript-path'], sessionId: args['session-id'],
    // Opt-in only: the focused pane is "me" only when a human ran this command in it.
    allowActiveTerminal: Boolean(args['active-terminal']),
  });

  // D2: a pane that names itself BINDS itself. `--me astra` (or NOTE_SLUG) run in a pane is the only
  // first-hand evidence of who that pane is; the title is a secondhand guess that a restart invalidates.
  // Cheap enough to redo on every read, and the refreshed `at` is what keeps a live pane out of the GC.
  // `--no-bind` is for a caller that knows its slug is a GUESS. The Claude hook passes it when the slug
  // came out of the title cache, which has a 10-minute TTL for a reason: a binding has none, so
  // laundering a cached title through `--me` would freeze a renamed pane's old slug forever, and it
  // would go on ACKing another slug's inbox (review BLOCKER 1).
  const binding = args['no-bind'] ? null : maybeBindPane({ home, env, slug, source: slugSource, fsImpl, now });
  if (binding?.error) problems.push(`pane binding not written to ${bindingsPath(home)} (${binding.error})`);

  // ── Where to look.
  const sources = [{ dir: notesDir(home), kind: 'mirror' }];
  if (!args['no-repo']) {
    // `--repo`, else this process's cwd, else the pane's own worktree from ORCA_WORKTREE_ID — a hook
    // can be invoked with a cwd that is not inside the repo the pane actually works in.
    const start = args.repo ? toPosix(args.repo) : (cwd || worktreePathFromEnv(env));
    let repo = null;
    try { repo = mainCheckout(start, git); } catch { repo = null; }
    if (repo && !fsImpl.existsSync(ledgerDir(repo))) {
      const fallback = worktreePathFromEnv(env);
      if (fallback && toPosix(fallback) !== toPosix(start)) {
        try { repo = mainCheckout(fallback, git) ?? repo; } catch { /* keep the first answer */ }
      }
    }
    if (repo) sources.push({ dir: ledgerDir(repo), kind: 'repo', repo });
  }

  const { ymd: todayYmd } = timeParts(new Date(now), zone);
  const files = [];
  for (const s of sources) {
    for (const f of recentLedgerFiles(s.dir, days, todayYmd, fsImpl)) files.push({ ...f, kind: s.kind });
  }

  const all = dedupeById(scanLedgerFiles(files, fsImpl));
  const mine = all.filter((e) => addressedToMe(e, slug));

  // ── What is new.
  const cursor = readCursor(home, slug, fsImpl);
  const coldStart = !cursor.updatedAt;
  const coldCutoff = coldStart && coldHours > 0 ? now - coldHours * 3_600_000 : null;

  let suppressed = 0;
  for (const e of mine) {
    if (cursor.seen[e.id]) continue;
    if (coldCutoff !== null) {
      const at = envelopeInstant(e, zone);
      if (at !== null && at < coldCutoff) {
        suppressed += 1;
        cursor.seen[e.id] = e.ymd;
        // Marked seen but never DISPLAYED. note-flush must not read this as "the recipient has it" and
        // retire the wake-up, or a peer that was down longer than the window loses the note entirely
        // (review BLOCKER 2).
        (cursor.cold ??= {})[e.id] = e.ymd;
        continue;
      }
    }
    const packet = e.details ? packetLocation(e, sources, fsImpl) : null;
    notes.push({
      id: e.id, from: e.from, to: e.to, kind: e.kind, needs: e.needs ?? null, by: e.by ?? null,
      re: e.re ?? null, supersedes: e.sup ?? null, details: e.details ?? null,
      packetExists: packet ? packet.exists : null, packetPath: packet ? packet.path : null,
      ymd: e.ymd, line: e.line,
    });
  }

  // A note that names a packet nobody wrote is the single most useful thing to shout about: the line
  // is a pointer, and a dangling pointer means the sender's --packet-file never ran.
  for (const n of notes) {
    if (n.details && n.packetExists === false) problems.push(`[${n.id}] points at ${n.details}, which is not on this machine`);
  }

  let cursorFile = null;
  let cursorFallback = false;
  /**
   * H5: prune against the oldest day we ACTUALLY SCANNED, across BOTH sources. Computing it from the
   * mirror alone retired a repo-ledger id the instant it was acked whenever the mirror's window started
   * later — a fresh machine, a cleared `~/.agents/notes`, or `docs/ledger/*.md` pulled from the other
   * host. The note was then re-shown on every run, so `Stop` blocked on every stop, forever.
   *
   * M1: a cursor that cannot be written must not silence this. writeCursor falls back to the temp dir
   * and reports, and the problem is surfaced rather than thrown.
   */
  const persist = (keepFrom) => {
    const res = writeCursor(home, slug, cursor, { fsImpl, keepFrom });
    cursorFile = res.file;
    cursorFallback = res.fallback;
    if (res.error) {
      problems.push(
        `cursor not writable at ${cursorPath(home, slug)} (${res.error})`
        + `${res.file ? ` — using ${res.file} instead, so these notes are not repeated` : ' — these notes WILL repeat until it is fixed'}`,
      );
    }
  };

  if (args.ack || args['ack-ids'] !== undefined) {
    // `--ack-ids a,b` marks EXACTLY those, and is how a hook acks after it has emitted: the read that
    // produced the output does not advance the cursor, so a process killed between reading and printing
    // cannot retire a note the model never saw (review MAJOR 3).
    const only = args['ack-ids'] === undefined
      ? null
      : new Set(String(args['ack-ids']).split(',').map((id) => id.trim()).filter(Boolean));
    for (const n of notes) {
      if (only && !only.has(n.id)) continue;
      cursor.seen[n.id] = n.ymd;
    }
    persist(files.map((f) => f.ymd).sort()[0] ?? null);
  } else if (suppressed > 0) {
    // The cold-start suppression must persist even without --ack, or every run re-suppresses and the
    // "N older notes" banner never stops.
    persist(null);
  } else if (notes.length > 0) {
    // A read that shows notes but writes nothing still has to SAY when the cursor is broken: the ack is
    // a separate call now, so without this the first sign of trouble would be the same notes arriving
    // again, with no reason given (M1).
    const why = cursorProblem(home, slug, fsImpl);
    if (why) {
      problems.push(`cursor not writable at ${cursorPath(home, slug)} (${why}) — the temp-dir fallback will be used, `
        + 'so these notes are not repeated forever, but fix the path');
    }
  }

  return {
    ok: true, exitCode: 0, slug, slugSource, binding: binding ?? null,
    acked: Boolean(args.ack || args['ack-ids'] !== undefined), cursor: cursorFile, cursorFallback,
    scanned: files.map((f) => f.file), days, coldStart, suppressed,
    count: notes.length, notes, problems,
  };
}

/** Is the packet the `Details:` path names actually on disk? Checked in every repo we scanned. */
function packetLocation(entry, sources, fsImpl) {
  for (const s of sources) {
    if (s.kind !== 'repo' || !s.repo) continue;
    const p = toPosix(path.posix.join(toPosix(s.repo), entry.details));
    if (fsImpl.existsSync(p)) return { path: p, exists: true };
  }
  return { path: entry.details, exists: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────

/** The compact form a hook injects and a human reads. One line per note, packet state appended. */
export function formatInbox(result) {
  if (result.mode === 'unbind') {
    if (!result.ok) {
      return [`${result.handle} was NOT unbound`, ...(result.problems ?? []).map((p) => `  ! ${p}`)].join('\n');
    }
    return result.slug
      ? `unbound ${result.handle} (was ${result.slug}) in ${result.file}`
      : `${result.handle} was not bound to anything`;
  }
  if (result.mode === 'bind') {
    if (!result.ok) {
      return [`${result.handle} was NOT bound to ${result.slug}`, ...(result.problems ?? []).map((p) => `  ! ${p}`)].join('\n');
    }
    const head = `bound ${result.handle} → ${result.slug} in ${result.file}`
      + `${result.binding?.rebound ? ` (was ${result.binding.previous})` : ''}`;
    return [head, ...(result.problems ?? []).map((p) => `  ! ${p}`)].join('\n');
  }
  if (result.count === 0) {
    return `no new notes for ${result.slug}`;
  }
  const lines = [`${result.count} new peer note${result.count === 1 ? '' : 's'} for ${result.slug}:`];
  for (const n of result.notes) {
    const packet = n.details ? (n.packetExists ? ` [packet: ${n.packetPath}]` : ` [packet MISSING: ${n.details}]`) : '';
    lines.push(`  ${n.line}${packet}`);
  }
  if (result.suppressed > 0) {
    lines.push(`  (cursor initialised for ${result.slug}: ${result.suppressed} note(s) older than the cold-start window were marked seen — read them with \`cat ~/.agents/notes/$(date +%F).md\`)`);
  }
  // A missing packet or an unwritable cursor belongs in the OUTPUT, not only on stderr: a caller that
  // pipes this never sees stderr, and the hook's stderr on exit 0 does not reach the model at all (M3).
  for (const p of result.problems ?? []) lines.push(`  ! ${p}`);
  return lines.join('\n');
}

const USAGE = `note-inbox — the ledger, read as this pane's inbox.

  note-inbox [--me <slug>] [--ack] [--json] [--days 3] [--cold-start-hours 12] [--orca <cmd>]
  note-inbox --bind <slug> [--title <text>]
  note-inbox --unbind

  --me     this pane's slug (else the session's own name, else $NOTE_SLUG, else the binding for
           $ORCA_TERMINAL_HANDLE, else its title)
  --transcript-path <path>  this session's transcript path, for the session-name source (with --session-id)
  --session-id <uuid>       this session's id, for the session-name source (with --transcript-path)
  --ack    mark everything printed as seen (advances ~/.agents/notes/.cursor-<slug>)
  --ack-ids <a,b>
           mark exactly those ids seen — what a hook runs AFTER it has emitted them
  --json   one JSON object instead of the human list
  --bind   record "this pane IS <slug>" in ~/.agents/notes/panes.json and stop. Run it INSIDE the pane.
           Every --me read binds too; --bind is for a pane that is not reading an inbox right now.
  --unbind remove THIS pane's entry from panes.json and stop — the way out of a wrong --bind.
  --no-bind read the inbox WITHOUT recording a binding, for a caller whose slug is only a guess.

Scans ~/.agents/notes/*.md and this repo's docs/ledger/*.md for the last --days days.
Exit 0 always — an inbox read never fails its caller.
`;

async function main() {
  const argv = process.argv.slice(2);
  const wantsJson = argv.includes('--json');
  if (argv.includes('--help')) { process.stdout.write(USAGE); return 0; }
  try {
    const result = await runNoteInbox(argv);
    process.stdout.write(wantsJson ? `${JSON.stringify(result)}\n` : `${formatInbox(result)}\n`);
    for (const p of result.problems) process.stderr.write(`note-inbox: ${p}\n`);
  } catch (err) {
    // Still exit 0: the caller is a hook or a turn-start command, and a non-zero here would look like
    // a broken session rather than "I could not tell which pane this is".
    const message = err?.message ?? String(err);
    if (wantsJson) {
      process.stdout.write(`${JSON.stringify({ ok: false, exitCode: 0, count: 0, notes: [], error: message })}\n`);
    } else {
      process.stdout.write(`note-inbox: ${message}\n`);
    }
  }
  return 0;
}

// Symlink-tolerant entry check (transport.isMainModule): the mirror publishes this directory as a
// symlink on macOS and Linux, and a naive `url === argv[1]` comparison silently no-ops there.
if (isMainModule(import.meta.url)) process.exitCode = await main();
