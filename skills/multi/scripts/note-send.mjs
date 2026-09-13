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

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
// Contract constants
// ─────────────────────────────────────────────────────────────────────────────

export const KINDS = ['ASK', 'ACK', 'RESULT', 'BLOCKED', 'FYI'];
export const NEEDS = ['decision', 'review', 'ack', 'none'];
/** Only ASK may carry a need other than `none` (envelope.md, Needs row; red-team M3). */
export const ASK_ONLY_NEEDS = ['decision', 'review', 'ack'];
export const RESERVED_WORDS = [' Goal: ', ' Details: ', ' Needs: '];
export const MAX_LINE = 500;
export const ARROW = '\u2192'; // →
export const RESERVED_RECIPIENT = 'ben';
export const DEFAULT_ZONE = 'America/New_York';
export const DEFAULT_TZ_LABEL = 'NYC';
/** No agent output for this long, with no agent composer on screen, reads as a dead pane (red-team M2). */
export const STALE_MS = 30 * 60 * 1000;
/** Permission markers are only trusted inside the live screen region, never in old scrollback. */
export const LIVE_TAIL_LINES = 30;

export const ENVELOPE_RE =
  /^(?<from>[a-z0-9-]+) → (?<to>[a-z0-9-]+), (?<date>\d{1,2}\.\d{1,2}\.\d{2}) (?<time>\d{2}:\d{2}) (?<tz>[A-Z]{2,5}) \[(?<id>[a-z0-9-]+-\d+)(?: re (?<re>[a-z0-9-]+-\d+))?(?: supersedes (?<sup>[a-z0-9-]+-\d+))?\] (?<kind>ASK|ACK|RESULT|BLOCKED|FYI): (?<body>.+?)(?: Goal: (?<goal>[^\t\n]+?))?(?: Details: (?<details>(?:[a-z0-9-]+:)?[A-Za-z0-9._/-]+))?(?: Needs: (?<needs>decision|review|ack|none)(?: by (?<by>[^\t\n]+?))?)?$/u;

export const DETAILS_RE = /^(?:[a-z0-9-]{2,}:)?[A-Za-z0-9._/-]+$/;
export const SLUG_RE = /^[a-z0-9-]+$/;
export const ID_RE = /^[a-z0-9-]+-\d+$/;
export const HANDLE_RE = /^term_[A-Za-z0-9-]+$/;

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

/** The agent is mid-turn. Claude Code accepts typed input here (it queues it); Codex is not yet proven to. */
export const WORKING_MARKERS = ['esc to interrupt', 'ctrl+c to stop', 'working…', 'thinking…', 'esc to stop'];

/** An agent composer is on screen: the pane is alive and accepting input. */
export const COMPOSER_MARKERS = [
  '? for shortcuts', 'shift+tab to cycle', 'bypass permissions on', 'for agents', '/clear to save',
  'press up to edit queued messages', '⏵⏵', '⏎ send', 'newline', 'try "', 'plan mode on', 'accept edits on',
];

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class NoteError extends Error {
  constructor(exitCode, message, extra = {}) {
    super(message);
    this.name = 'NoteError';
    this.exitCode = exitCode;
    Object.assign(this, extra);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Field + envelope validation
// ─────────────────────────────────────────────────────────────────────────────

/** Reject anything that would split the line, hide a field, or execute in a shell pane (H1, M6, M7). */
export function assertFieldSafe(name, value) {
  if (value === undefined || value === null) return;
  const s = String(value);
  if (/[\r\n\t]/.test(s)) {
    throw new NoteError(1, `--${name} contains a newline or tab; an envelope is exactly one physical line`);
  }
  for (const word of RESERVED_WORDS) {
    if (s.includes(word)) {
      throw new NoteError(1, `--${name} contains the reserved word "${word.trim()}"; it would silently swallow later fields`);
    }
  }
  if (s.includes('`') || s.includes('$(')) {
    throw new NoteError(1, `--${name} contains \` or $( — a note must never be able to execute if it lands in a shell pane`);
  }
}

export function assertLowercase(name, value) {
  if (value !== String(value).toLowerCase()) {
    throw new NoteError(1, `--${name} must be lowercase; use "${String(value).toLowerCase()}"`);
  }
}

export function validateSlug(name, value) {
  assertLowercase(name, value);
  if (!SLUG_RE.test(value)) {
    throw new NoteError(1, `--${name} must match [a-z0-9-]+ (got "${value}")`);
  }
  return value;
}

export function validateId(name, value) {
  assertLowercase(name, value);
  if (!ID_RE.test(value)) {
    throw new NoteError(1, `--${name} must be <slug>-<counter>, lowercase (got "${value}")`);
  }
  return value;
}

/**
 * Details is validated BEFORE the regex so a bad path is a clear error, never three silently dropped
 * fields (red-team H2/H3). Repo-relative POSIX, optionally `<host>:` prefixed for a cross-host note.
 */
export function validateDetails(details) {
  const s = String(details);
  if (/\s/.test(s)) throw new NoteError(1, `--details must not contain spaces (got "${s}"); move the file or rename it`);
  if (s.includes('\\')) throw new NoteError(1, `--details must use POSIX slashes, not backslashes (got "${s}")`);
  if (/^[A-Za-z]:/.test(s)) throw new NoteError(1, `--details must not start with a drive letter (got "${s}"); use a repo-relative path`);
  if (s.endsWith('.')) throw new NoteError(1, `--details must not end with a period (got "${s}"); the trailing period is not part of the path`);
  if (!DETAILS_RE.test(s)) throw new NoteError(1, `--details must match ${DETAILS_RE} (got "${s}")`);
  return s;
}

/**
 * Cross-host Details: `<host>:<absolute path on that host>`.
 *
 * CONTRACT GAP (reported, not worked around): envelope.md's Details grammar forbids spaces and drive
 * letters, so a Windows absolute path cannot be expressed at all. We fail loudly with the reason rather
 * than emit a line the recipient's parser would mangle.
 */
export function crossHostDetails(repo, relative, hostPrefix) {
  const abs = toPosix(path.posix.join(toPosix(repo), String(relative)));
  if (/^[A-Za-z]:/.test(abs)) {
    throw new NoteError(
      5,
      `cross-host Details cannot express the absolute path "${abs}": envelope.md's grammar allows no drive letters. ` +
      `Pass --details <host>:<posix-absolute-path> yourself, or keep the packet on a POSIX host.`,
    );
  }
  if (/\s/.test(abs)) {
    throw new NoteError(5, `cross-host Details cannot express "${abs}": envelope.md's grammar allows no spaces in a path`);
  }
  return validateDetails(`${hostPrefix}:${abs}`);
}

/** Only ASK may ask for something back (red-team M3). */
export function validateKindNeeds(kind, needs) {
  if (!KINDS.includes(kind)) throw new NoteError(1, `--kind must be one of ${KINDS.join('|')} (got "${kind}")`);
  if (needs === undefined) return;
  if (!NEEDS.includes(needs)) throw new NoteError(1, `--needs must be one of ${NEEDS.join('|')} (got "${needs}")`);
  if (kind !== 'ASK' && ASK_ONLY_NEEDS.includes(needs)) {
    throw new NoteError(1, `${kind} may only carry "Needs: none" or no Needs field; "${needs}" is ASK-only`);
  }
}

/**
 * Close a sentence field so the next reserved word reads as a boundary, matching the canonical example in
 * envelope.md. Applied to `substance` and `Goal:` only — never to `Details:` or `by`, which must stay
 * period-free (red-team H3).
 */
export function terminate(text) {
  const s = String(text).trim();
  return /[.!?:;,]$/.test(s) ? s : `${s}.`;
}

/**
 * Assemble the one-line envelope. Every field is validated first; the result must match the pinned regex,
 * so a build that passes here is a line the reader's parser accepts.
 */
export function buildEnvelope(o) {
  validateSlug('from', o.from);
  validateSlug('to', o.to);
  validateId('id', o.id);
  if (o.re !== undefined) validateId('re', o.re);
  if (o.supersedes !== undefined) validateId('supersedes', o.supersedes);
  if (!o.id.startsWith(`${o.from}-`)) {
    throw new NoteError(1, `id "${o.id}" must start with the sender slug "${o.from}-" (ids are collision-free by sender prefix)`);
  }
  validateKindNeeds(o.kind, o.needs);

  for (const [name, value] of [['text', o.body], ['goal', o.goal], ['by', o.by], ['tz', o.tz]]) {
    assertFieldSafe(name, value);
  }
  if (!o.body || !String(o.body).trim()) throw new NoteError(1, '--text is required and must not be empty');
  if (o.details !== undefined) validateDetails(o.details);
  if (o.by !== undefined && o.needs === undefined) {
    throw new NoteError(1, '--by requires --needs');
  }
  if (!/^[A-Z]{2,5}$/.test(o.tz)) throw new NoteError(1, `--tz must be 2-5 uppercase letters (got "${o.tz}")`);
  if (!/^\d{1,2}\.\d{1,2}\.\d{2}$/.test(o.date)) throw new NoteError(1, `internal: bad date "${o.date}"`);
  if (!/^\d{2}:\d{2}$/.test(o.time)) throw new NoteError(1, `internal: bad time "${o.time}"`);

  const brackets = [o.id, o.re ? `re ${o.re}` : null, o.supersedes ? `supersedes ${o.supersedes}` : null]
    .filter(Boolean).join(' ');

  let line = `${o.from} ${ARROW} ${o.to}, ${o.date} ${o.time} ${o.tz} [${brackets}] ${o.kind}: ${terminate(o.body)}`;
  if (o.goal) line += ` Goal: ${terminate(o.goal)}`;
  if (o.details) line += ` Details: ${o.details}`;
  if (o.needs) line += ` Needs: ${o.needs}${o.by ? ` by ${String(o.by).trim()}` : ''}`;

  if (line.length > MAX_LINE) {
    throw new NoteError(1, `envelope is ${line.length} chars, over the ${MAX_LINE} cap; shorten --text and move the rest into the detail packet`);
  }
  if (!ENVELOPE_RE.test(line)) {
    throw new NoteError(1, `built line does not match the pinned envelope regex:\n${line}`);
  }
  return line;
}

/**
 * Parse an envelope line back out. Strips at most one trailing period from `details`, so the v2 contract's own
 * example line (which still carries one) yields a usable path (red-team H3).
 */
export function parseEnvelope(line) {
  const m = ENVELOPE_RE.exec(line);
  if (!m) return null;
  const g = { ...m.groups };
  if (g.details && g.details.endsWith('.')) g.details = g.details.slice(0, -1);
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Id derivation
// ─────────────────────────────────────────────────────────────────────────────

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Highest counter already used for `<from>-<topic>` anywhere in the ledger text we can see. */
export function highestCounter(texts, prefix) {
  const re = new RegExp(`${escapeRe(prefix)}-(\\d+)(?=[\\s\\]])`, 'g');
  let max = 0;
  for (const text of texts) {
    if (!text) continue;
    for (const m of String(text).matchAll(re)) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

export function nextCounter(texts, prefix) { return highestCounter(texts, prefix) + 1; }

// ─────────────────────────────────────────────────────────────────────────────
// Time
// ─────────────────────────────────────────────────────────────────────────────

/** Ben's local zone always, whatever clock the box runs on (rule 05-time.md). */
export function timeParts(now = new Date(), zone = DEFAULT_ZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    date: `${Number(parts.month)}.${Number(parts.day)}.${String(parts.year).slice(-2)}`,
    time: `${hour}:${parts.minute}`,
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pane resolution + classification
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
  if (matches.length === 0) {
    throw new NoteError(2, `no pane titled "${to}"\n${describePanes(list)}`);
  }
  throw new NoteError(
    2,
    `"${to}" matches ${matches.length} panes — refusing to guess. Re-send with one of these handles:\n${describePanes(matches)}`,
  );
}

export function describePanes(list) {
  return list.map((t) => `  ${t.handle}  ${JSON.stringify(t.title ?? '')}  ${t.agentIdentity ?? 'no-agent'}`).join('\n');
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Repo resolution
// ─────────────────────────────────────────────────────────────────────────────

export function toPosix(p) { return String(p).replace(/\\/g, '/'); }

/**
 * Ledger and packet belong in the repo's MAIN checkout — an Orca worktree is deleted after merge and would
 * take the record with it (red-team H6).
 */
export function mainCheckout(dir, gitRunner) {
  if (!dir) return null;
  const start = toPosix(dir);
  let common;
  try {
    common = gitRunner(['rev-parse', '--git-common-dir'], start);
  } catch {
    return start; // not a git repo (or no git): write where we were told
  }
  if (!common) return start;
  let c = toPosix(common.trim());
  if (!c) return start;
  if (!path.posix.isAbsolute(c) && !/^[A-Za-z]:/.test(c)) c = toPosix(path.resolve(start, c));
  return c.replace(/\/?\.git\/?$/, '') || start;
}

/** Default git shell-out. Tests inject their own `git` through deps, so this is never hit off-box. */
export function gitRunner(args, cwd) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
  }).toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Orca runner
// ─────────────────────────────────────────────────────────────────────────────

export function resolveOrcaCommand(explicit, env = process.env) {
  const cmd = explicit || env.ORCA_CLI || 'orca';
  const parts = String(cmd).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new NoteError(1, '--orca resolved to an empty command');
  return { exe: parts[0], base: parts.slice(1) };
}

/** execFile with an argv array — never a shell string, so a `$` or a quote in the substance is inert (M7). */
export function makeOrcaRunner(explicit, env = process.env) {
  const { exe, base } = resolveOrcaCommand(explicit, env);
  return async (args) => {
    let stdout;
    try {
      ({ stdout } = await execFileAsync(exe, [...base, ...args], { maxBuffer: 64 * 1024 * 1024, windowsHide: true }));
    } catch (err) {
      stdout = err?.stdout;
      if (!stdout) throw new NoteError(4, `orca ${args.slice(0, 2).join(' ')} failed: ${err?.message ?? err}`);
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

export function appendLine(file, line, fsImpl = fs) {
  const dir = path.dirname(file);
  fsImpl.mkdirSync(dir, { recursive: true });
  const exists = fsImpl.existsSync(file);
  const header = exists ? '' : `# Peer-note ledger ${path.basename(file, '.md')}\n\n`;
  fsImpl.appendFileSync(file, `${header}${line}\n`, 'utf8');
  return file;
}

export function packetTemplate(o) {
  return `# ${o.id} — ${o.title}
from: ${o.from} · to: ${o.to} · sent: ${o.date} ${o.time} ${o.tz} · event: ${o.event ?? 'same'} · supersedes: ${o.supersedes ?? 'none'}

## Ask / Decision
${o.body}

## Scope (files, branch/worktree, reviewed revision or content hash)
(fill in)

## Conditions (gates, ownership, budget, "no deploy/DB/flag changes" etc.)
(fill in)

## Evidence (paths, commits, measured numbers — reported vs verified vs pending)
(fill in)

## Next action (owner, by when)
${o.needs ? `${o.to}: ${o.needs}${o.by ? ` by ${o.by}` : ''}` : '(fill in)'}

## Received / acted (appended by the recipient: when read, what was done, RESULT id)
`;
}

/** Never clobber a packet the recipient may already have written into. */
export function writePacket(file, content, fsImpl = fs) {
  if (fsImpl.existsSync(file)) return { path: file, written: false };
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  fsImpl.writeFileSync(file, content, 'utf8');
  return { path: file, written: true };
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

// ─────────────────────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────────────────────

const STRING_FLAGS = new Set([
  'from', 'to', 'kind', 'topic', 'text', 'n', 're', 'supersedes', 'goal', 'details',
  'needs', 'by', 'recipient-repo', 'sender-repo', 'tz', 'orca', 'wait-max', 'id',
]);
const BOOL_FLAGS = new Set(['dry-run', 'json', 'help']);

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
// Main
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string[]} argv
 * @param {object} deps - { orca, fsImpl, git, now, home, env, sleep } — all injectable for tests.
 */
export async function runNoteSend(argv, deps = {}) {
  const args = parseArgs(argv);
  const fsImpl = deps.fsImpl ?? fs;
  const env = deps.env ?? process.env;
  const home = toPosix(deps.home ?? os.homedir());
  const nap = deps.sleep ?? sleep;
  const git = deps.git ?? gitRunner;
  const now = deps.now ? new Date(deps.now) : new Date();
  const dryRun = Boolean(args['dry-run']);

  const required = ['from', 'to', 'kind', 'topic', 'text'];
  for (const r of required) {
    if (!args[r]) throw new NoteError(1, `--${r} is required`);
  }

  const from = validateSlug('from', args.from);
  const topic = validateSlug('topic', args.topic);
  const kind = String(args.kind).toUpperCase();
  const tz = args.tz ? String(args.tz) : DEFAULT_TZ_LABEL;
  const { date, time, ymd } = timeParts(now, env.NOTE_SEND_ZONE || DEFAULT_ZONE);
  const waitMaxMs = Math.max(0, Number(args['wait-max'] ?? 600) * 1000);
  const toRaw = String(args.to);
  const isBen = toRaw.toLowerCase() === RESERVED_RECIPIENT;
  const senderHost = env.ORCA_SENDER_HOST || 'local';

  // Step 1 of the contract: every check that does not need a pane runs BEFORE we touch orca,
  // so a typo never costs a terminal round-trip and never half-resolves a recipient.
  if (!isBen && !HANDLE_RE.test(toRaw)) validateSlug('to', toRaw);
  validateKindNeeds(kind, args.needs);
  if (args.details) validateDetails(args.details);
  for (const [name, value] of [['text', args.text], ['goal', args.goal], ['by', args.by]]) {
    assertFieldSafe(name, value);
  }
  if (args.re) validateId('re', args.re);
  if (args.supersedes) validateId('supersedes', args.supersedes);

  const senderRepoRaw = args['sender-repo'] ? mainCheckout(args['sender-repo'], git) : null;
  const plan = { actions: [] };

  // ── Reserved recipient: Ben. No pane exists; the note is a record + a print (H10).
  if (isBen) {
    const repo = senderRepoRaw ?? mainCheckout(process.cwd(), git);
    if (!repo) throw new NoteError(1, '--to ben needs --sender-repo (or run inside a repo) so the note has a home');
    return finishBen({ args, from, topic, kind, tz, date, time, ymd, repo, home, fsImpl, dryRun, plan, env });
  }

  // ── 2. Resolve the pane. In --dry-run we never touch orca at all.
  let pane = null;
  let orca = null;
  if (!dryRun) {
    orca = deps.orca ?? makeOrcaRunner(args.orca, env);
    const listing = await orca(['terminal', 'list', '--json']);
    pane = resolvePane(listing?.terminals, toRaw);
  } else {
    plan.actions.push(`resolve pane "${toRaw}" via \`terminal list --json\` (skipped: --dry-run)`);
  }

  // ── 3. Where the files go.
  const crossHost = Boolean(pane && pane.executionHostId && pane.executionHostId !== senderHost);
  if (crossHost && args['recipient-repo']) {
    throw new NoteError(5, `pane ${pane.handle} runs on host "${pane.executionHostId}" but this session is on "${senderHost}" — a cross-host note keeps its packet in the SENDER's repo; drop --recipient-repo`);
  }

  let targetRepo;
  if (crossHost) {
    if (!senderRepoRaw) throw new NoteError(5, 'cross-host note needs --sender-repo (the packet cannot be written on the other host)');
    targetRepo = senderRepoRaw;
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

  // ── Details: repo-relative, or `<host>:<abs>` for a cross-host note.
  let details = args.details ? validateDetails(args.details) : undefined;
  let packetRelative = args.details ? String(args.details) : undefined;
  if (crossHost && details && !details.includes(':')) {
    const hostPrefix = (env.ORCA_SENDER_HOST || os.hostname()).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    details = crossHostDetails(targetRepo, details, hostPrefix);
  }

  // ── Id.
  const ledgerDirs = [
    path.posix.join(toPosix(targetRepo), 'docs/ledger'),
    senderRepoRaw ? path.posix.join(toPosix(senderRepoRaw), 'docs/ledger') : null,
    path.posix.join(home, '.agents/notes'),
  ].filter(Boolean);
  const prefix = `${from}-${topic}`;
  const n = args.n !== undefined ? Number(args.n) : nextCounter(readLedgerCorpus(ledgerDirs, fsImpl), prefix);
  if (!Number.isInteger(n) || n < 1) throw new NoteError(1, `--n must be a positive integer (got "${args.n}")`);
  const id = args.id ? validateId('id', args.id) : `${prefix}-${n}`;

  const envelope = buildEnvelope({
    from, to: isBen ? RESERVED_RECIPIENT : normalizedRecipientSlug(pane, toRaw), date, time, tz, id,
    re: args.re, supersedes: args.supersedes, kind, body: args.text, goal: args.goal, details,
    needs: args.needs, by: args.by,
  });

  // ── 4. Ledger FIRST, so the record exists even if delivery defers or fails.
  const ledgerTargets = uniq([
    ledgerPath(targetRepo, ymd),
    senderRepoRaw && senderRepoRaw !== targetRepo ? ledgerPath(senderRepoRaw, ymd) : null,
    notesMirrorPath(home, ymd),
  ].filter(Boolean));

  const packetPath = packetRelative ? toPosix(path.posix.join(toPosix(targetRepo), packetRelative)) : null;

  if (dryRun) {
    for (const t of ledgerTargets) plan.actions.push(`append envelope to ${t}`);
    if (packetPath) plan.actions.push(`write packet ${packetPath} (skipped if it already exists)`);
    plan.actions.push(`classify pane via \`terminal show\` + \`terminal read\`; send only on agent-idle/agent-working`);
    plan.actions.push(`two-phase: \`terminal send --text <envelope>\` (no --enter), re-read, then \`terminal send --enter\``);
    return {
      ok: true, exitCode: 0, envelope, id, to: toRaw, handle: null, classification: 'not-checked (--dry-run)',
      delivered: false, deferred: false, notified: false, dryRun: true,
      ledgers: ledgerTargets, packetPath, plan: plan.actions, error: null,
    };
  }

  for (const t of ledgerTargets) appendLine(t, envelope, fsImpl);
  let packetWritten = false;
  if (packetPath) {
    packetWritten = writePacket(packetPath, packetTemplate({
      id, title: firstSentence(args.text), from, to: toRaw, date, time, tz,
      supersedes: args.supersedes, body: args.text, needs: args.needs, by: args.by,
    }), fsImpl).written;
  }

  const base = {
    envelope, id, to: toRaw, handle: pane.handle, ledgers: ledgerTargets,
    packetPath, packetWritten, notified: false,
  };

  // ── 5. Gate on pane state.
  const deadline = Date.now() + waitMaxMs;
  let classification = await classifyNow(orca, pane.handle, deps);
  while (classification === 'permission' && Date.now() < deadline) {
    await nap(10_000);
    classification = await classifyNow(orca, pane.handle, deps);
  }
  if (!SENDABLE.has(classification)) {
    throw new NoteError(3, deferMessage(classification, pane, envelope, ledgerTargets), { ...base, classification });
  }

  // Codex recipients: idle only, until the pilot proves Codex queues typed input mid-turn (M1).
  if (pane.agentIdentity === 'codex' && classification !== 'agent-idle') {
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining > 0) {
      try {
        await orca(['terminal', 'wait', '--terminal', pane.handle, '--for', 'tui-idle', '--timeout-ms', String(remaining), '--json']);
      } catch { /* fall through to the re-check below */ }
    }
    classification = await classifyNow(orca, pane.handle, deps);
    if (classification !== 'agent-idle') {
      throw new NoteError(3, `codex pane ${pane.handle} is "${classification}", not idle — Codex mid-turn queuing is unproven, so the note was NOT typed. Ledger written: ${ledgerTargets[0]}. You own the retry.`, { ...base, classification });
    }
  }

  // ── 6. Two-phase delivery. Text first, verify, only then Enter (C1).
  await orca(['terminal', 'send', '--terminal', pane.handle, '--text', envelope, '--json']);
  const after = await readPane(orca, pane.handle);
  const visible = composerShows(after, id);
  const recheck = classifyPane(await showPane(orca, pane.handle), after, { now: Date.now() });
  if (!visible || recheck !== classification) {
    throw new NoteError(
      3,
      `aborted before Enter: pane went "${classification}" → "${recheck}"${visible ? '' : ', and the typed line was not visible in the composer'}. The text may be sitting unsent in ${pane.handle}; the ledger already has the note. Retry or clear the pane by hand.`,
      { ...base, classification: recheck },
    );
  }
  await orca(['terminal', 'send', '--terminal', pane.handle, '--enter', '--json']);

  return { ok: true, exitCode: 0, ...base, classification, delivered: true, deferred: false, error: null };
}

function normalizedRecipientSlug(pane, raw) {
  if (!HANDLE_RE.test(raw)) return raw;
  const n = normalizeTitle(pane?.title).replace(/[\s_]+/g, '-');
  return SLUG_RE.test(n) && n ? n : 'peer';
}

function uniq(a) { return [...new Set(a)]; }

function firstSentence(text) {
  const s = String(text).trim();
  const m = s.match(/^.{0,80}?[.!?](\s|$)/);
  return (m ? m[0] : s.slice(0, 80)).trim().replace(/[.!?]$/, '');
}

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
  const [show, read] = [await showPane(orca, handle), await readPane(orca, handle)];
  return classifyPane(show, read, { now: Date.now() });
}

/** Whitespace-insensitive check: the terminal wraps the composer, so only the `[id]` token is reliable. */
export function composerShows(read, id) {
  const tail = Array.isArray(read?.tail) ? read.tail.join('') : '';
  return tail.replace(/\s+/g, '').includes(`[${id}`.replace(/\s+/g, ''));
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

function finishBen({ args, from, topic, kind, tz, date, time, ymd, repo, home, fsImpl, dryRun, plan, env }) {
  const ledgerDirs = [path.posix.join(toPosix(repo), 'docs/ledger'), path.posix.join(home, '.agents/notes')];
  const prefix = `${from}-${topic}`;
  const n = args.n !== undefined ? Number(args.n) : nextCounter(readLedgerCorpus(ledgerDirs, fsImpl), prefix);
  const id = args.id ? validateId('id', args.id) : `${prefix}-${n}`;
  const details = args.details ? validateDetails(args.details) : undefined;
  const envelope = buildEnvelope({
    from, to: RESERVED_RECIPIENT, date, time, tz, id, re: args.re, supersedes: args.supersedes,
    kind, body: args.text, goal: args.goal, details, needs: args.needs, by: args.by,
  });
  const ledgers = uniq([ledgerPath(repo, ymd), notesMirrorPath(home, ymd)]);
  const packetPath = args.details ? toPosix(path.posix.join(toPosix(repo), String(args.details))) : null;

  if (dryRun) {
    for (const t of ledgers) plan.actions.push(`append envelope to ${t}`);
    if (packetPath) plan.actions.push(`write packet ${packetPath} (skipped if it already exists)`);
    plan.actions.push('no pane resolved: "ben" is a reserved recipient; the line is printed for Ben to read');
    return {
      ok: true, exitCode: 0, envelope, id, to: RESERVED_RECIPIENT, handle: null, classification: 'n/a (ben)',
      delivered: false, deferred: false, notified: false, dryRun: true, ledgers, packetPath, plan: plan.actions, error: null,
    };
  }
  for (const t of ledgers) appendLine(t, envelope, fsImpl);
  if (packetPath) {
    writePacket(packetPath, packetTemplate({
      id, title: firstSentence(args.text), from, to: RESERVED_RECIPIENT, date, time, tz,
      supersedes: args.supersedes, body: args.text, needs: args.needs, by: args.by,
    }), fsImpl);
  }
  return {
    ok: true, exitCode: 0, envelope, id, to: RESERVED_RECIPIENT, handle: null, classification: 'n/a (ben)',
    delivered: false, deferred: false, notified: true, ledgers, packetPath, error: null,
    note: env.NOTE_SEND_NTFY_URL ? 'ntfy url set but push is not wired in this version' : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry
// ─────────────────────────────────────────────────────────────────────────────

const USAGE = `note-send — one peer-note envelope, ledger-first, typed into a peer's Orca pane.

  note-send --from <slug> --to <slug|term_handle|ben> --kind ASK|ACK|RESULT|BLOCKED|FYI
            --topic <slug> --text "<substance>"
            [--n <int>] [--re <parent-id>] [--supersedes <id>] [--goal "<why>"] [--details <repo/relative/path.md>]
            [--needs decision|review|ack|none] [--by "<time>"] [--recipient-repo <dir>] [--sender-repo <dir>]
            [--tz NYC] [--orca <cmd>] [--wait-max <seconds>] [--dry-run] [--json]

Exit: 0 delivered (or notified, for ben) · 1 bad arguments/envelope · 2 pane not found/ambiguous ·
      3 deferred or unsafe pane state (NOT delivered — you own the retry) · 4 orca CLI error · 5 cross-host misuse
`;

async function main() {
  const argv = process.argv.slice(2);
  const wantsJson = argv.includes('--json');
  if (argv.length === 0 || argv.includes('--help')) {
    process.stdout.write(USAGE);
    process.exit(argv.length === 0 ? 1 : 0);
  }
  try {
    const result = await runNoteSend(argv);
    if (wantsJson) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      process.stdout.write(`${result.envelope}\n`);
      if (result.dryRun) {
        process.stdout.write(`\n--dry-run — nothing was written or sent. Planned actions:\n`);
        for (const a of result.plan) process.stdout.write(`  - ${a}\n`);
      } else if (result.delivered) {
        process.stdout.write(`delivered to ${result.handle} (${result.classification}); ledger: ${result.ledgers.join(', ')}\n`);
      } else {
        process.stdout.write(`recorded, not delivered (to: ${result.to}); ledger: ${result.ledgers.join(', ')}\n`);
      }
    }
    process.exit(0);
  } catch (err) {
    const exitCode = err instanceof NoteError ? err.exitCode : 1;
    if (wantsJson) {
      process.stdout.write(`${JSON.stringify({
        ok: false, exitCode, envelope: err.envelope ?? null, id: err.id ?? null, to: err.to ?? null,
        handle: err.handle ?? null, classification: err.classification ?? null, delivered: false,
        deferred: exitCode === 3, notified: false, ledgers: err.ledgers ?? [], packetPath: err.packetPath ?? null,
        error: err.message,
      })}\n`);
    } else {
      process.stderr.write(`note-send: ${err.message}\n`);
    }
    process.exit(exitCode);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
