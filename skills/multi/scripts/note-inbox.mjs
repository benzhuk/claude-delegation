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
//
//   --me      the pane's slug. Otherwise $NOTE_SLUG, otherwise derived from $ORCA_TERMINAL_HANDLE via
//             `orca terminal show` (cached 10 min). Never guessed — see transport.resolveSlug.
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

import { NoteError, parseEnvelope, envelopeInstant, timeParts, DEFAULT_ZONE } from './envelope.mjs';
import {
  toPosix, gitRunner, mainCheckout, makeOrcaRunner, resolveSlug, isMainModule,
  notesDir, ledgerDir, recentLedgerFiles, readIfExists, readCursor, writeCursor, worktreePathFromEnv,
} from './transport.mjs';

export const DEFAULT_DAYS = 3;
export const DEFAULT_COLD_START_HOURS = 12;

const STRING_FLAGS = new Set(['me', 'days', 'cold-start-hours', 'orca', 'repo', 'zone', 'home']);
const BOOL_FLAGS = new Set(['ack', 'json', 'help', 'no-repo', 'active-terminal']);

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
    // Opt-in only: the focused pane is "me" only when a human ran this command in it.
    allowActiveTerminal: Boolean(args['active-terminal']),
  });

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
      if (at !== null && at < coldCutoff) { suppressed += 1; cursor.seen[e.id] = e.ymd; continue; }
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
  if (args.ack) {
    for (const n of notes) cursor.seen[n.id] = n.ymd;
    const keepFrom = recentLedgerFiles(notesDir(home), days, todayYmd, fsImpl)[0]?.ymd ?? null;
    cursorFile = writeCursor(home, slug, cursor, { fsImpl, keepFrom });
  } else if (suppressed > 0) {
    // The cold-start suppression must persist even without --ack, or every run re-suppresses and the
    // "N older notes" banner never stops.
    cursorFile = writeCursor(home, slug, cursor, { fsImpl });
  }

  return {
    ok: true, exitCode: 0, slug, slugSource, acked: Boolean(args.ack), cursor: cursorFile,
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
  return lines.join('\n');
}

const USAGE = `note-inbox — the ledger, read as this pane's inbox.

  note-inbox [--me <slug>] [--ack] [--json] [--days 3] [--cold-start-hours 12] [--orca <cmd>]

  --me     this pane's slug (else $NOTE_SLUG, else derived from $ORCA_TERMINAL_HANDLE)
  --ack    mark everything printed as seen (advances ~/.agents/notes/.cursor-<slug>)
  --json   one JSON object instead of the human list

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
