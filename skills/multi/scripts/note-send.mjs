#!/usr/bin/env node
// note-send — PINNED CLI CONTRACT v3 (2026-09-13). Builder T1 implements the body; the interface below is frozen.
//
// Compose one peer-note envelope (see ../references/envelope.md), write it to the ledger(s), then type it
// into the recipient's Orca pane through the plain terminal path. The SENDER is the safety gate; nothing is
// ever dropped silently.
//
// USAGE
//   note-send --from <slug> --to <slug|term_handle> --kind ASK|ACK|RESULT|BLOCKED|FYI --topic <slug> --text "<substance>"
//             [--n <int>] [--re <parent-id>] [--supersedes <id>] [--goal "<why>"] [--details <path>]
//             [--needs decision|review|ack|none] [--by "<time>"] [--recipient-repo <dir>] [--sender-repo <dir>]
//             [--packet-file <path|->] [--force] [--tz NYC] [--orca <cmd>] [--wait-max <seconds>=600] [--dry-run] [--json]
//
//   --packet-file writes the detail packet to <recipient-repo>/docs/notes/<id>.md BEFORE the ledger line (stdin when `-`);
//   an existing packet is never overwritten without --force. Cross-host notes: run note-send on the recipient's host
//   over ssh (see envelope.md transport step 7); there is no <host>: Details form.
//
//   The id is derived: <from>-<topic>-<n>; --n defaults to (highest n already in the ledgers for that prefix) + 1.
//   Text for any field is passed as an argv value and forwarded to `orca` with execFile(argv[]) — never through a
//   shell string, so quotes, `$` and backticks in the substance are safe.
//
// BEHAVIOUR (in this order)
//   1. Validate: id lowercase (exit 1 with the lowercase form suggested); kind/needs pairing (only ASK may carry
//      decision/review/ack); Details path format (see envelope.md); no \n \r \t or reserved words in any field;
//      whole line ≤ 500 chars. Build the envelope; it must match the pinned regex (exit 1 otherwise).
//   2. Resolve the recipient pane (`<orca> terminal list --json`): slug match on title with leading glyphs and
//      whitespace stripped, case-insensitive, or a raw `term_…` handle. Ambiguous → exit 2 listing every candidate
//      handle+title; not found → exit 2 listing the panes that exist. Reserved `--to ben`: skip 2–6, write ledger
//      + packet, print the line, exit 0 with delivered:false, notified:true.
//   3. Decide where files go. Recipient repo = the pane's `worktreePath` main checkout (`git rev-parse
//      --git-common-dir`), unless --recipient-repo overrides; empty worktreePath → require --recipient-repo (exit 1).
//      If the pane's `executionHostId` is not the local runtime and --recipient-repo was passed: exit 5 (cross-host
//      misuse — send from the recipient's host instead). Details is always repo-relative, POSIX, no host prefix.
//   4. Ledger first: append the line to <repo>/docs/ledger/<YYYY-MM-DD>.md (mkdir -p) in the recipient repo and,
//      when --sender-repo differs, in the sender repo; always also to ~/.agents/notes/<YYYY-MM-DD>.md. Then
//      classify the pane from `<orca> terminal show --terminal <h> --json` (agentIdentity, agentWait, connected,
//      writable, preview, lastOutputAt) + the tail of `<orca> terminal read` into
//      agent-idle | agent-working | permission | shell | hibernated | unknown.
//   5. Gate: send only on agent-idle or agent-working. permission → poll every 10 s up to --wait-max, then exit 3
//      "deferred". shell / hibernated / unknown → exit 3 with the classification (never type). Codex recipients
//      (agentIdentity codex): additionally wait for idle (`<orca> terminal wait --for tui-idle`) within --wait-max.
//   6. Two-phase delivery: `<orca> terminal send --terminal <h> --text <line> --json` (NO --enter); re-read the pane
//      (`terminal read`); if the line is visible and the classification is unchanged, `<orca> terminal send
//      --terminal <h> --text "" --enter --json` (or the equivalent Enter-only send the CLI supports). If the state
//      changed between reads, do NOT press Enter; exit 3. CLI error → exit 4 with the CLI's message. Success → exit 0.
//   7. Output: one human line by default; with --json exactly one object
//      { ok, exitCode, envelope, id, to, handle, classification, delivered, deferred, notified,
//        ledgers: [paths], packetPath, error }.
//
// ORCA COMMAND RESOLUTION
//   --orca <cmd>  >  $ORCA_CLI  >  "orca" on PATH. Hetzner needs ~/.local/bin/orca-native-fixed; Windows may pass
//   "node C:/Users/benzh/.local/share/orca-fork-cli/out/cli/index.js" (split on whitespace; first token is the
//   executable). Node ≥ 20, zero npm dependencies; macOS, Linux, Windows (Git Bash or cmd).
//
// EXIT CODES: 0 delivered (or notified for ben) · 1 bad arguments/envelope · 2 pane not found or ambiguous ·
//             3 deferred / unsafe pane state · 4 orca CLI error · 5 cross-host misuse
//
// NEVER: print or log token material; use orca orchestration commands; press Enter into a pane whose state you
//        did not just verify; pick one of several matching panes.
//
// The grammar (constants, validation, build, parse, id derivation, time, packet template) lives in
// ./envelope.mjs and is re-exported here; this file owns I/O and transport only.

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  NoteError, RESERVED_RECIPIENT, DEFAULT_ZONE, DEFAULT_TZ_LABEL, SLUG_RE,
  assertFieldSafe, validateSlug, validateId, validateDetails, validateKindNeeds,
  buildEnvelope, nextCounter, timeParts,
} from './envelope.mjs';

export * from './envelope.mjs';

const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
// Pane classification
// ─────────────────────────────────────────────────────────────────────────────

export const HANDLE_RE = /^term_[A-Za-z0-9-]+$/;
/** No agent output for this long, with no agent composer on screen, reads as a dead pane (red-team M2). */
export const STALE_MS = 30 * 60 * 1000;
/** Permission markers are only trusted inside the live screen region, never in old scrollback. */
export const LIVE_TAIL_LINES = 30;

/**
 * Permission / approval markers.
 *
 * Group A is lifted verbatim from Orca's own wait-text classifier (the `agent-approval-prompt` and
 * `codex-interactive-prompt` reasons, read out of resources/app.asar on 2026-09-12) — these are the strings
 * Orca itself uses to decide a pane is blocked on a human.
 * Group B is the Claude Code TUI selector and Codex approval wording. It could NOT be observed live on this
 * box (every local pane runs with permissions bypassed), so it is encoded from known prompt text and must be
 * re-checked during the pilot.
 */
export const PERMISSION_MARKERS = [
  // A — verified, from Orca's classifier
  'permission required', 'requires permission', 'allow once', 'allow always',
  'run this command?', 'run (once)', 'to allowlist?', 'run everything', 'skip & tell the agent',
  'do you trust', 'trust this', 'trusted workspace', 'press t to trust', 'hooks need review',
  'press enter to confirm', 'press enter to continue',
  // B — encoded, unverified live
  'do you want to proceed?', 'do you want to make this edit', 'do you want to create',
  "yes, and don't ask again", 'no, and tell claude what to do differently', 'esc to cancel',
  'allow command', 'approve?', 'press enter to approve',
];

/**
 * The agent is visibly mid-turn. This list is INCOMPLETE by nature: Claude Code randomises the spinner
 * verb ("Schlepping…", "Crunching…"), so a working pane often shows none of these and classifies
 * `agent-idle` instead. Harmless for Claude, where both states are sendable — but it must never be the
 * basis of the Codex idle gate, which is why that gate goes through Orca's own `terminal wait --for
 * tui-idle` unconditionally (review C1).
 */
export const WORKING_MARKERS = [
  'esc to interrupt', 'ctrl+c to stop', 'working…', 'thinking…', 'esc to stop', 'esc to pause',
];

/** An agent composer is on screen: the pane is alive and accepting input. */
export const COMPOSER_MARKERS = [
  '? for shortcuts', 'shift+tab to cycle', 'bypass permissions on', 'for agents', '/clear to save',
  'press up to edit queued messages', '⏵⏵', '⏎ send', 'newline', 'try "', 'plan mode on', 'accept edits on',
];

function containsAny(haystack, markers) {
  const s = haystack.toLowerCase();
  return markers.some((m) => s.includes(m.toLowerCase()));
}

/**
 * Classify a pane from `terminal show` + `terminal read`. Send only on `agent-idle` / `agent-working`.
 * Anything unreadable is `unknown` on purpose: a deferred note is cheap, an approved dialog is not (C1/C2).
 */
export function classifyPane(show, read, opts = {}) {
  const now = opts.now ?? Date.now();
  const staleMs = opts.staleMs ?? STALE_MS;
  if (!show || typeof show !== 'object') return 'unknown';
  if (show.connected !== true || show.writable !== true) return 'unknown';
  if (show.orphaned === true) return 'unknown';
  if (!show.agentIdentity) return 'shell';

  const tail = Array.isArray(read?.tail) ? read.tail : [];
  const liveTail = tail.slice(-LIVE_TAIL_LINES).join('\n');
  const screen = `${show.preview ?? ''}\n${liveTail}`;

  if (show.agentWait != null) return 'permission';
  if (containsAny(screen, PERMISSION_MARKERS)) return 'permission';

  if (read && read.status && read.status !== 'running') return 'unknown';

  const hasComposer = containsAny(screen, COMPOSER_MARKERS);
  const age = now - (Number(show.lastOutputAt) || 0);
  if (age > staleMs && !hasComposer) return 'hibernated';

  if (containsAny(screen, WORKING_MARKERS)) return 'agent-working';
  if (hasComposer) return 'agent-idle';
  return 'unknown';
}

export const SENDABLE = new Set(['agent-idle', 'agent-working']);

/**
 * Whitespace-insensitive check for the typed line in the composer. The terminal wraps, so only the
 * `[<id>` token is reliable. Restricted to the same live window the classifier trusts, so an id sitting
 * in old scrollback can never stand in for text that never reached the composer (review H1).
 */
export function composerShows(read, id, lines = LIVE_TAIL_LINES) {
  const tail = Array.isArray(read?.tail) ? read.tail.slice(-lines).join('') : '';
  return tail.replace(/\s+/g, '').includes(`[${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pane resolution
// ─────────────────────────────────────────────────────────────────────────────

/** Strip Orca's status glyphs and collapse whitespace so a pane title can be compared to a slug (L3). */
export function normalizeTitle(title) {
  return String(title ?? '')
    .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function titleMatchesSlug(title, slug) {
  const n = normalizeTitle(title);
  return n === slug || n.replace(/[\s_]+/g, '-') === slug;
}

export function describePanes(list) {
  return list.map((t) => `  ${t.handle}  ${JSON.stringify(t.title ?? '')}  ${t.agentIdentity ?? 'no-agent'}`).join('\n');
}

/** Never guess between candidates: ambiguity is exit 2 with the list (red-team H9). */
export function resolvePane(terminals, to) {
  const list = Array.isArray(terminals) ? terminals : [];
  if (HANDLE_RE.test(to)) {
    const exact = list.find((t) => t.handle === to);
    if (exact) return exact;
    throw new NoteError(2, `no pane with handle ${to}\n${describePanes(list)}`);
  }
  const matches = list.filter((t) => titleMatchesSlug(t.title, to));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) throw new NoteError(2, `no pane titled "${to}"\n${describePanes(list)}`);
  throw new NoteError(
    2,
    `"${to}" matches ${matches.length} panes — refusing to guess. Re-send with one of these handles:\n${describePanes(matches)}`,
  );
}

/**
 * A pane is local when the runtime says so. `executionHostId` is `local` for every pane served by the
 * runtime we are talking to; ORCA_SENDER_HOST only names an ADDITIONAL id that counts as ours, so a
 * mis-set value can never flip every local pane to cross-host (review M4).
 */
export function isLocalPane(pane, senderHost) {
  const id = pane?.executionHostId;
  if (!id || id === 'local') return true;
  return Boolean(senderHost) && id === senderHost;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo resolution
// ─────────────────────────────────────────────────────────────────────────────

export function toPosix(p) { return String(p).replace(/\\/g, '/'); }

/** Default git shell-out. Tests inject their own `git` through deps, so this is never hit off-box. */
export function gitRunner(args, cwd) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
  }).toString();
}

/**
 * Ledger and packet belong in the repo's MAIN checkout — an Orca worktree is deleted after merge and would
 * take the record with it (red-team H6).
 */
export function mainCheckout(dir, runner) {
  if (!dir) return null;
  const start = toPosix(dir);
  let common;
  try {
    common = runner(['rev-parse', '--git-common-dir'], start);
  } catch {
    return start; // not a git repo (or no git): write where we were told
  }
  if (!common) return start;
  let c = toPosix(common.trim());
  if (!c) return start;
  if (!path.posix.isAbsolute(c) && !/^[A-Za-z]:/.test(c)) c = toPosix(path.resolve(start, c));
  return c.replace(/\/?\.git\/?$/, '') || start;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orca runner
// ─────────────────────────────────────────────────────────────────────────────

/** Where an `orca` lives when PATH does not know about it, tried in this order after PATH. */
export const ORCA_FALLBACKS = [
  { rel: '.local/bin/orca-native-fixed', why: '~/.local/bin/orca-native-fixed (Hetzner)' },
  { rel: '.local/bin/orca', why: '~/.local/bin/orca' },
];
/** Windows has no `orca` binary; the fork CLI is a script run through node. */
export const ORCA_WINDOWS_FORK = '.local/share/orca-fork-cli/out/cli/index.js';

/** `which`, without spawning one. Mockable, so the resolution order is unit-testable. */
export function findOnPath(name, env = process.env, deps = {}) {
  const existsSync = deps.existsSync ?? fs.existsSync;
  const platform = deps.platform ?? process.platform;
  const raw = env.PATH ?? env.Path ?? '';
  const sep = platform === 'win32' ? ';' : ':';
  const exts = platform === 'win32'
    ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  for (const dir of String(raw).split(sep).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Resolve the orca CLI. Contract order is unchanged — `--orca` > `$ORCA_CLI` > `orca` on PATH — with
 * explicit fallbacks after PATH, because a non-login ssh shell on the boxes has no `~/.local/bin` on
 * PATH and the bare name then fails with a bare `spawn orca ENOENT`.
 *
 * Returns what it tried, so the exit-4 message can name it instead of leaving the user guessing.
 */
export function resolveOrcaCommand(explicit, env = process.env, deps = {}) {
  const existsSync = deps.existsSync ?? fs.existsSync;
  const platform = deps.platform ?? process.platform;
  const home = toPosix(deps.home ?? os.homedir());
  const tried = [];

  const fromString = (cmd, source) => {
    const parts = String(cmd).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) throw new NoteError(1, `${source} resolved to an empty command`);
    return { exe: parts[0], base: parts.slice(1), source, tried };
  };

  if (explicit) return fromString(explicit, '--orca');
  if (env.ORCA_CLI) return fromString(env.ORCA_CLI, '$ORCA_CLI');

  tried.push('orca on PATH');
  if (findOnPath('orca', env, { existsSync, platform })) {
    return { exe: 'orca', base: [], source: 'PATH', tried };
  }

  for (const f of ORCA_FALLBACKS) {
    const candidate = path.posix.join(home, f.rel);
    tried.push(candidate);
    if (existsSync(candidate)) return { exe: candidate, base: [], source: f.why, tried };
  }

  if (platform === 'win32') {
    const fork = path.posix.join(home, ORCA_WINDOWS_FORK);
    tried.push(`node ${fork}`);
    if (existsSync(fork)) return { exe: 'node', base: [fork], source: 'orca-fork-cli', tried };
  }

  // Nothing found. Keep the contract's default so the spawn failure is the CLI's own error, but carry
  // the list so the message can say where we looked.
  return { exe: 'orca', base: [], source: 'not found', tried };
}

/** Say which orca we used, or where we looked — an ENOENT with no context is a dead end for the reader. */
export function orcaHint(resolved) {
  if (resolved.source !== 'not found') {
    return ` (orca resolved from ${resolved.source}: ${[resolved.exe, ...resolved.base].join(' ')})`;
  }
  return ` — no orca CLI found. Looked at: ${resolved.tried.join(', ')}. `
    + 'Pass --orca <cmd> or set ORCA_CLI; from a non-login shell (ssh command, tmux) run '
    + "`bash -lc 'note-send …'` so the profile that puts ~/.local/bin on PATH is sourced.";
}

/** execFile with an argv array — never a shell string, so a `$` or a quote in the substance is inert (M7). */
export function makeOrcaRunner(explicit, env = process.env, deps = {}) {
  const resolved = resolveOrcaCommand(explicit, env, deps);
  const { exe, base } = resolved;
  return async (args) => {
    let stdout;
    try {
      ({ stdout } = await execFileAsync(exe, [...base, ...args], { maxBuffer: 64 * 1024 * 1024, windowsHide: true }));
    } catch (err) {
      stdout = err?.stdout;
      if (!stdout) throw new NoteError(4, `orca ${args.slice(0, 2).join(' ')} failed: ${err?.message ?? err}${orcaHint(resolved)}`);
    }
    let json;
    try {
      json = JSON.parse(stdout);
    } catch {
      throw new NoteError(4, `orca ${args.slice(0, 2).join(' ')} returned non-JSON output: ${String(stdout).slice(0, 300)}`);
    }
    if (json.ok === false) {
      throw new NoteError(4, `orca ${args.slice(0, 2).join(' ')} failed: ${json.error?.code ?? 'unknown_error'}${json.error?.message ? ` — ${json.error.message}` : ''}`);
    }
    return json.result;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Files
// ─────────────────────────────────────────────────────────────────────────────

export function ledgerPath(repo, ymd) { return toPosix(path.posix.join(toPosix(repo), 'docs/ledger', `${ymd}.md`)); }
export function notesMirrorPath(home, ymd) { return toPosix(path.posix.join(toPosix(home), '.agents/notes', `${ymd}.md`)); }
export function packetPathFor(repo, id) { return toPosix(path.posix.join(toPosix(repo), 'docs/notes', `${id}.md`)); }

/**
 * Append one envelope line. The day header goes through the exclusive `wx` flag so two concurrent senders
 * cannot both emit it (review L5); the line itself is one O_APPEND write, atomic at the ≤500 bytes an
 * envelope can be.
 */
export function appendLine(file, line, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fsImpl.writeFileSync(file, `# Peer-note ledger ${path.basename(file, '.md')}\n\n`, { flag: 'wx' });
  } catch { /* another sender created it first — that is exactly what `wx` is for */ }
  fsImpl.appendFileSync(file, `${line}\n`, 'utf8');
  return file;
}

/** Never clobber a packet the recipient may already have annotated, unless --force says so. */
export function writePacket(file, content, { force = false, fsImpl = fs } = {}) {
  const exists = fsImpl.existsSync(file);
  if (exists && !force) return { path: file, written: false, skipped: true };
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  fsImpl.writeFileSync(file, content, 'utf8');
  return { path: file, written: true, overwrote: exists, skipped: false };
}

function readIfExists(file, fsImpl = fs) {
  try { return fsImpl.readFileSync(file, 'utf8'); } catch { return ''; }
}

function readLedgerCorpus(dirs, fsImpl = fs) {
  const texts = [];
  for (const dir of dirs) {
    if (!dir) continue;
    let entries = [];
    try { entries = fsImpl.readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      if (name.endsWith('.md')) texts.push(readIfExists(path.posix.join(toPosix(dir), name), fsImpl));
    }
  }
  return texts;
}

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────────────────────

const STRING_FLAGS = new Set([
  'from', 'to', 'kind', 'topic', 'text', 'n', 're', 'supersedes', 'goal', 'details',
  'needs', 'by', 'recipient-repo', 'sender-repo', 'packet-file', 'tz', 'orca', 'wait-max', 'id',
]);
const BOOL_FLAGS = new Set(['dry-run', 'json', 'force', 'help']);

export function parseArgs(argv) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Delivery helpers
// ─────────────────────────────────────────────────────────────────────────────

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function uniq(a) { return [...new Set(a)]; }

async function showPane(orca, handle) {
  const r = await orca(['terminal', 'show', '--terminal', handle, '--json']);
  return r?.terminal ?? null;
}

async function readPane(orca, handle) {
  const r = await orca(['terminal', 'read', '--terminal', handle, '--limit', '80', '--json']);
  return r?.terminal ?? null;
}

async function classifyNow(orca, handle, deps) {
  if (deps.classify) return deps.classify(handle);
  const show = await showPane(orca, handle);
  const read = await readPane(orca, handle);
  return classifyPane(show, read, { now: Date.now() });
}

function deferMessage(classification, pane, envelope, ledgers) {
  const why = {
    permission: 'it is sitting at a permission/approval prompt — typing there could approve it',
    shell: 'it is a plain shell with no agent — a note typed there would EXECUTE',
    hibernated: 'its agent appears gone (no output and no composer) — bytes would land in a PTY nobody reads',
    unknown: 'its state could not be read — a deferred note is cheap, an approved dialog is not',
  }[classification] ?? classification;
  return `NOT delivered to ${pane.handle} ("${pane.title}"): ${why}. The note is in the ledger (${ledgers[0]}) — you own the retry. Defer twice → send ben a BLOCKED.\n${envelope}`;
}

function recipientSlug(pane, raw) {
  if (!HANDLE_RE.test(raw)) return raw;
  const n = normalizeTitle(pane?.title).replace(/[\s_]+/g, '-');
  return n && SLUG_RE.test(n) ? n : 'peer';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string[]} argv
 * @param {object} deps - { orca, fsImpl, git, now, home, env, sleep, stdin } — all injectable for tests.
 */
export async function runNoteSend(argv, deps = {}) {
  const args = parseArgs(argv);
  const fsImpl = deps.fsImpl ?? fs;
  const env = deps.env ?? process.env;
  const home = toPosix(deps.home ?? os.homedir());
  const nap = deps.sleep ?? defaultSleep;
  const git = deps.git ?? gitRunner;
  const now = deps.now ? new Date(deps.now) : new Date();
  const dryRun = Boolean(args['dry-run']);
  const force = Boolean(args.force);

  for (const r of ['from', 'to', 'kind', 'topic', 'text']) {
    if (!args[r]) throw new NoteError(1, `--${r} is required`);
  }

  const from = validateSlug('from', args.from);
  const topic = validateSlug('topic', args.topic);
  const kind = String(args.kind).toUpperCase();
  const tz = args.tz ? String(args.tz) : DEFAULT_TZ_LABEL;
  const { date, time, ymd } = timeParts(now, env.NOTE_SEND_ZONE || DEFAULT_ZONE);
  const toRaw = String(args.to);
  const isBen = toRaw.toLowerCase() === RESERVED_RECIPIENT;
  const senderHost = env.ORCA_SENDER_HOST || '';

  // Step 1 of the contract: every check that does not need a pane runs BEFORE we touch orca,
  // so a typo never costs a terminal round-trip and never half-resolves a recipient.
  if (args['wait-max'] !== undefined && !/^\d+$/.test(String(args['wait-max']))) {
    throw new NoteError(1, `--wait-max must be a whole number of seconds (got "${args['wait-max']}")`);
  }
  const waitMaxMs = Math.max(0, Number(args['wait-max'] ?? 600) * 1000);
  if (args.n !== undefined && !/^\d+$/.test(String(args.n))) {
    throw new NoteError(1, `--n must be a positive integer (got "${args.n}")`);
  }
  if (!isBen && !HANDLE_RE.test(toRaw)) validateSlug('to', toRaw);
  validateKindNeeds(kind, args.needs);
  if (args.details) validateDetails(args.details);
  for (const [name, value] of [['text', args.text], ['goal', args.goal], ['by', args.by]]) {
    assertFieldSafe(name, value);
  }
  if (args.re) validateId('re', args.re);
  if (args.supersedes) validateId('supersedes', args.supersedes);

  const senderRepo = args['sender-repo'] ? mainCheckout(args['sender-repo'], git) : null;
  const plan = [];
  const warnings = [];

  // ── 2. Resolve the pane. In --dry-run we never touch orca at all.
  let pane = null;
  let orca = null;
  if (isBen) {
    plan.push('"ben" is a reserved recipient: no pane is resolved; the line is recorded and printed');
  } else if (dryRun) {
    plan.push(`resolve pane "${toRaw}" via \`terminal list --json\` (skipped: --dry-run)`);
  } else {
    orca = deps.orca ?? makeOrcaRunner(args.orca, env);
    pane = resolvePane((await orca(['terminal', 'list', '--json']))?.terminals, toRaw);
  }

  // ── 3. Where the files go. v3: the packet ALWAYS lives in the recipient's repo.
  const local = isBen ? true : isLocalPane(pane, senderHost);
  if (pane && !local && args['recipient-repo']) {
    throw new NoteError(
      5,
      `pane ${pane.handle} runs on host "${pane.executionHostId}", not this runtime — --recipient-repo cannot reach it. ` +
      `Send from that host instead, quoting the whole remote command as one argument: ` +
      `ssh <host> '~/.local/bin/note-send --from ${from} --to ${toRaw} … --packet-file -' < packet.md`,
    );
  }

  let targetRepo;
  if (isBen) {
    targetRepo = senderRepo ?? mainCheckout(process.cwd(), git);
    if (!targetRepo) throw new NoteError(1, '--to ben needs --sender-repo (or run inside a repo) so the note has a home');
  } else if (args['recipient-repo']) {
    targetRepo = mainCheckout(args['recipient-repo'], git);
  } else if (pane) {
    if (!pane.worktreePath) {
      throw new NoteError(1, `pane ${pane.handle} ("${pane.title}") has no worktreePath (floating pane) — pass --recipient-repo`);
    }
    targetRepo = mainCheckout(pane.worktreePath, git);
  } else {
    throw new NoteError(1, '--dry-run without --recipient-repo cannot decide where the note would live; pass --recipient-repo');
  }

  // A repo we cannot see is a repo we must not pretend to write to. For a pane on another host that is
  // exactly the cross-host misuse the contract names; locally it is a bad --recipient-repo.
  if (!dryRun && !fsImpl.existsSync(targetRepo)) {
    if (!local) {
      throw new NoteError(
        5,
        `pane ${pane.handle} works in "${targetRepo}" on host "${pane.executionHostId}", which does not exist here. ` +
        `Run note-send on that host, quoting the whole remote command as one argument: ` +
        `ssh <host> '~/.local/bin/note-send --from ${from} --to ${toRaw} … --packet-file -' < packet.md`,
      );
    }
    throw new NoteError(1, `recipient repo "${targetRepo}" does not exist`);
  }

  const details = args.details ? validateDetails(args.details) : undefined;

  // ── Id, derived from every ledger we can see.
  const ledgerDirs = [
    path.posix.join(toPosix(targetRepo), 'docs/ledger'),
    senderRepo ? path.posix.join(toPosix(senderRepo), 'docs/ledger') : null,
    path.posix.join(home, '.agents/notes'),
  ].filter(Boolean);
  const prefix = `${from}-${topic}`;
  const n = args.n !== undefined ? Number(args.n) : nextCounter(readLedgerCorpus(ledgerDirs, fsImpl), prefix);
  if (!Number.isInteger(n) || n < 1) throw new NoteError(1, `--n must be a positive integer (got "${args.n}")`);
  const id = args.id ? validateId('id', args.id) : `${prefix}-${n}`;

  const envelope = buildEnvelope({
    from, to: isBen ? RESERVED_RECIPIENT : recipientSlug(pane, toRaw), date, time, tz, id,
    re: args.re, supersedes: args.supersedes, kind, body: args.text, goal: args.goal, details,
    needs: args.needs, by: args.by,
  });

  const packetPath = args['packet-file'] !== undefined ? packetPathFor(targetRepo, id) : null;
  const ledgerTargets = uniq([
    ledgerPath(targetRepo, ymd),
    senderRepo && senderRepo !== targetRepo ? ledgerPath(senderRepo, ymd) : null,
    notesMirrorPath(home, ymd),
  ].filter(Boolean));

  if (details && !packetPath && !dryRun && !fsImpl.existsSync(path.posix.join(toPosix(targetRepo), details))) {
    warnings.push(`Details points at ${details}, which does not exist in ${targetRepo} — write it, or pass --packet-file`);
  }

  if (dryRun) {
    if (packetPath) {
      plan.push(`write packet ${packetPath} from ${args['packet-file'] === '-' ? 'stdin' : args['packet-file']}${force ? ' (--force: overwrites an existing packet)' : ' (refuses to overwrite)'}`);
    }
    for (const t of ledgerTargets) plan.push(`append envelope to ${t}`);
    if (!isBen) {
      plan.push('classify pane via `terminal show` + `terminal read`; send only on agent-idle/agent-working');
      plan.push('codex recipients: `terminal wait --for tui-idle` first, unconditionally');
      plan.push('two-phase: baseline read, `terminal send --text <envelope>` (no --enter), re-read, then `terminal send --enter`');
    }
    return {
      ok: true, exitCode: 0, envelope, id, to: toRaw, handle: null,
      classification: isBen ? 'n/a (ben)' : 'not-checked (--dry-run)',
      delivered: false, deferred: false, notified: false, dryRun: true,
      ledgers: ledgerTargets, packetPath, plan, warnings, error: null,
    };
  }

  // ── 4. Packet BEFORE the ledger line; ledger BEFORE any delivery attempt.
  let packetWritten = false;
  if (packetPath) {
    const source = String(args['packet-file']);
    const content = source === '-' ? (deps.stdin ?? readStdin()) : readIfExists(path.resolve(source), fsImpl);
    if (!content.trim()) {
      throw new NoteError(1, `--packet-file ${source} is empty or unreadable; a packet with no body is worse than none`);
    }
    const res = writePacket(packetPath, content, { force, fsImpl });
    if (res.skipped) {
      throw new NoteError(1, `packet ${packetPath} already exists; pass --force to overwrite it (the recipient may have annotated it)`);
    }
    packetWritten = res.written;
  }

  for (const t of ledgerTargets) appendLine(t, envelope, fsImpl);

  const base = {
    envelope, id, to: toRaw, handle: pane?.handle ?? null, ledgers: ledgerTargets,
    packetPath, packetWritten, warnings,
  };

  // ── `ben` stops here: recorded, printed, notified.
  if (isBen) {
    return {
      ok: true, exitCode: 0, ...base, classification: 'n/a (ben)',
      delivered: false, deferred: false, notified: true, error: null,
    };
  }

  // ── 5. Gate on pane state.
  const deadline = Date.now() + waitMaxMs;
  let classification = await classifyNow(orca, pane.handle, deps);
  while (classification === 'permission' && Date.now() < deadline) {
    await nap(10_000);
    classification = await classifyNow(orca, pane.handle, deps);
  }
  if (!SENDABLE.has(classification)) {
    throw new NoteError(3, deferMessage(classification, pane, envelope, ledgerTargets), { ...base, classification, notified: false });
  }

  // Codex recipients go through Orca's own idle detector, ALWAYS, and fail closed when it cannot run.
  // Our marker set cannot tell working from idle by itself — Claude Code randomises the spinner verb, so
  // a mid-turn pane routinely classifies `agent-idle` (review C1). Only `tui-idle` is authoritative here.
  if (String(pane.agentIdentity).toLowerCase() === 'codex') {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new NoteError(
        3,
        `codex pane ${pane.handle} needs a positive --wait-max: Codex mid-turn queuing is unproven, so a note is typed only after \`terminal wait --for tui-idle\` succeeds. Nothing was typed. Ledger: ${ledgerTargets[0]}`,
        { ...base, classification, notified: false },
      );
    }
    try {
      await orca(['terminal', 'wait', '--terminal', pane.handle, '--for', 'tui-idle', '--timeout-ms', String(remaining), '--json']);
    } catch (err) {
      throw new NoteError(
        3,
        `codex pane ${pane.handle}: \`terminal wait --for tui-idle\` did not succeed (${err.message}) — nothing was typed. Ledger: ${ledgerTargets[0]}`,
        { ...base, classification, notified: false },
      );
    }
    classification = await classifyNow(orca, pane.handle, deps);
    if (!SENDABLE.has(classification)) {
      throw new NoteError(3, deferMessage(classification, pane, envelope, ledgerTargets), { ...base, classification, notified: false });
    }
  }

  // ── 6. Two-phase delivery: baseline, text, verify, only then Enter (C1 / review H1).
  const before = await readPane(orca, pane.handle);
  if (composerShows(before, id)) {
    throw new NoteError(
      3,
      `[${id}] is already on screen in ${pane.handle} — refusing to press Enter over whatever the composer holds. The ledger has the note; check the pane, then retry with a fresh --n.`,
      { ...base, classification, notified: false },
    );
  }

  try {
    await orca(['terminal', 'send', '--terminal', pane.handle, '--text', envelope, '--json']);
  } catch (err) {
    throw new NoteError(4, `${err.message} — nothing was typed`, { ...base, classification, notified: false });
  }

  const after = await readPane(orca, pane.handle);
  const visible = composerShows(after, id);
  const recheck = classifyPane(await showPane(orca, pane.handle), after, { now: Date.now() });
  if (!visible || recheck !== classification) {
    throw new NoteError(
      3,
      `aborted before Enter: pane went "${classification}" → "${recheck}"${visible ? '' : ', and the typed line was not visible in the composer'}. The text may be sitting unsent in ${pane.handle}; the ledger already has the note. Retry or clear the pane by hand.`,
      { ...base, classification: recheck, notified: false },
    );
  }

  try {
    await orca(['terminal', 'send', '--terminal', pane.handle, '--enter', '--json']);
  } catch (err) {
    throw new NoteError(
      4,
      `${err.message} — the envelope is sitting UNSENT in ${pane.handle}'s composer; clear it or press Enter by hand`,
      { ...base, classification, notified: false },
    );
  }

  return { ok: true, exitCode: 0, ...base, classification, delivered: true, deferred: false, notified: false, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry
// ─────────────────────────────────────────────────────────────────────────────

const USAGE = `note-send — one peer-note envelope, ledger-first, typed into a peer's Orca pane.

  note-send --from <slug> --to <slug|term_handle|ben> --kind ASK|ACK|RESULT|BLOCKED|FYI
            --topic <slug> --text "<substance>"
            [--n <int>] [--re <parent-id>] [--supersedes <id>] [--goal "<why>"] [--details <repo/relative/path.md>]
            [--needs decision|review|ack|none] [--by "<time>"] [--recipient-repo <dir>] [--sender-repo <dir>]
            [--packet-file <path|->] [--force] [--tz NYC] [--orca <cmd>] [--wait-max <seconds>] [--dry-run] [--json]

Cross-host: run note-send ON the recipient's host over ssh. Use the absolute path (an ssh command
gets a non-login shell, which has no ~/.local/bin on PATH) and quote the whole remote command as
ONE argument, on one line (a \\ continuation is literal inside single quotes):
  ssh ben@<host> '~/.local/bin/note-send --from <you> --to <pane> --kind ASK --topic <t> --text "…" --packet-file -' < packet.md

Exit: 0 delivered (or notified, for ben) · 1 bad arguments/envelope · 2 pane not found/ambiguous ·
      3 deferred or unsafe pane state (NOT delivered — you own the retry) · 4 orca CLI error · 5 cross-host misuse
`;

function emit(result, wantsJson) {
  if (wantsJson) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  process.stdout.write(`${result.envelope}\n`);
  if (result.dryRun) {
    process.stdout.write('\n--dry-run — nothing was written or sent. Planned actions:\n');
    for (const a of result.plan) process.stdout.write(`  - ${a}\n`);
  } else if (result.delivered) {
    process.stdout.write(`delivered to ${result.handle} (${result.classification}); ledger: ${result.ledgers.join(', ')}\n`);
  } else {
    process.stdout.write(`recorded, not delivered (to: ${result.to}); ledger: ${result.ledgers.join(', ')}\n`);
  }
  for (const w of result.warnings ?? []) process.stderr.write(`note-send: warning: ${w}\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  const wantsJson = argv.includes('--json');
  if (argv.length === 0 || argv.includes('--help')) {
    process.stdout.write(USAGE);
    process.exitCode = argv.length === 0 ? 1 : 0;
    return;
  }
  try {
    const result = await runNoteSend(argv);
    emit(result, wantsJson);
    process.exitCode = 0;
  } catch (err) {
    const exitCode = err instanceof NoteError ? err.exitCode : 1;
    if (wantsJson) {
      // The packet and ledger are written before most failures; report them rather than an empty object (review M2).
      process.stdout.write(`${JSON.stringify({
        ok: false, exitCode, envelope: err.envelope ?? null, id: err.id ?? null, to: err.to ?? null,
        handle: err.handle ?? null, classification: err.classification ?? null, delivered: false,
        deferred: exitCode === 3, notified: Boolean(err.notified), ledgers: err.ledgers ?? [],
        packetPath: err.packetPath ?? null, warnings: err.warnings ?? [], error: err.message,
      })}\n`);
    } else {
      process.stderr.write(`note-send: ${err.message}\n`);
      if (err.ledgers?.length) process.stderr.write(`note-send: the note IS recorded in ${err.ledgers.join(', ')}\n`);
    }
    process.exitCode = exitCode;
  }
}

/**
 * Is this module the process entry point?
 *
 * The naive `import.meta.url === pathToFileURL(process.argv[1]).href` check is FALSE whenever the
 * script is reached through a symlink: Node resolves the module URL to the real path while
 * `process.argv[1]` keeps the link path. The mirror publishes `~/.agents/skills/multi` as a symlink on
 * macOS and Linux, and the PATH shim runs the script through exactly that path — so the guard failed,
 * `main()` never ran, and `note-send` exited 0 having printed nothing and written no ledger line. A
 * silent drop, which is the one failure this whole protocol exists to prevent.
 *
 * So: compare real paths on both sides, and fall back to the basename. Being wrong in the "run it"
 * direction is a visible error; being wrong the other way is silence.
 */
export function isMainModule(metaUrl, entry = process.argv[1]) {
  if (!entry) return false;
  const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const canon = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  const self = real(fileURLToPath(metaUrl));
  const argv1 = real(entry);
  if (canon(self) === canon(argv1)) return true;
  // Launched through a path we could not canonicalise (a dangling link, a junction on a mapped drive):
  // if the entry point carries this file's name, nothing else plausibly imported us.
  return path.basename(argv1).toLowerCase() === path.basename(self).toLowerCase();
}

if (isMainModule(import.meta.url)) await main();
