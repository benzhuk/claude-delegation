// transport — everything the four note-* scripts share: pane classification and resolution, the orca
// runner, the two-phase typing sequence, the on-disk layout (ledger, mirror, outbox, cursor, logs) and
// slug resolution.
//
// Split out in v4 so note-send, note-inbox, note-flush and note-notify use ONE copy of the rules
// instead of four drifting ones. `note-send.mjs` re-exports this module, so every symbol that used to
// live there is still importable from there (its tests and the pinned contract are unchanged).
//
// The v4 stance (spec V1): the ledger is the channel of record and the inbox; typing into a pane is a
// best-effort wake-up. Deferral is normal and cheap. Waiting on a peer is the bug. Nothing here ever
// blocks for minutes, and nothing is ever dropped silently.

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  NoteError, SLUG_RE, validateSlug, parseEnvelope, envelopeInstant, DEFAULT_ZONE, RESERVED_RECIPIENT,
} from './envelope.mjs';

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
  // C — modal overlays that are not approvals but CAPTURE ENTER, which is the whole danger. Verified
  // live 2026-09-13: Claude Code's agents-list overlay on the `taxonomy` pane. Our two-phase send
  // types text and then presses Enter; in an overlay that Enter selects a row.
  '↑/↓ to select', 'enter to view',
];

/**
 * Orca decorates a pane's TITLE when the agent is waiting on a human:
 * `[ . ] Action Required | astra | bto-workflows` (verified live 2026-09-13 15:55 NYC on the Codex
 * pane). Two consequences, and both matter:
 *
 *   · the slug must still resolve out of that title, or `--to astra` is exit 2 exactly when the peer
 *     most needs the note recorded (see stripStatusTag, used by normalizeTitle);
 *   · the pane must classify `permission`, because the tag IS the evidence — it is set by Orca itself,
 *     needs no screen scraping, and is visible even when the tail is unreadable.
 *
 * Any bracketed prefix counts, not just "Action Required". Pane titles are bare slugs by the protocol's
 * own pre-flight rule, so a bracket at the front is Orca's, and failing closed on an unknown status tag
 * costs a deferral — which is free, because the note is already in the ledger.
 */
export const TITLE_PERMISSION_MARKERS = [
  'action required', 'approval required', 'needs approval', 'waiting for approval',
];
export const STATUS_TAG_RE = /^\s*\[[^\]]*\]/;

export function titleSignalsPermission(title) {
  const t = String(title ?? '');
  if (STATUS_TAG_RE.test(t)) return true;
  const lower = t.toLowerCase();
  return TITLE_PERMISSION_MARKERS.some((m) => lower.includes(m));
}

/**
 * The agent is visibly mid-turn. This list is INCOMPLETE by nature: Claude Code randomises the spinner
 * verb ("Schlepping…", "Crunching…"), so a working Claude pane often shows none of these and classifies
 * `agent-idle` instead. Harmless for Claude, which queues typed input mid-turn — both states are
 * sendable there. It is NOT harmless for Codex, which does not; see CODEX_WORKING_MARKERS.
 */
export const WORKING_MARKERS = [
  'esc to interrupt', 'ctrl+c to stop', 'working…', 'thinking…', 'esc to stop', 'esc to pause',
];

/** An agent composer is on screen: the pane is alive and accepting input. */
export const COMPOSER_MARKERS = [
  '? for shortcuts', 'shift+tab to cycle', 'bypass permissions on', 'for agents', '/clear to save',
  'press up to edit queued messages', '⏵⏵', '⏎ send', 'newline', 'try "', 'plan mode on', 'accept edits on',
];

/**
 * Codex, from the tail only (spec V6). The pilot proved two things about Codex panes:
 * `orca terminal wait --for tui-idle` NEVER resolves for them (8 s waits time out on an idle pane), and
 * `lastOutputAt` is worthless because the TUI repaints a braille shimmer about once a second — output
 * recency is not evidence of working. So Codex state is read from what is on screen and nothing else.
 */
export const CODEX_WORKING_MARKERS = ['esc to interrupt', 'working', 'ctrl+c to stop', 'esc to stop'];
/** The `›` composer prompt. Seeing it with no working evidence above it is the only Codex idle signal. */
export const CODEX_COMPOSER_MARKERS = ['›', '⏎ send'];
/** Braille block: Codex's spinner frames. A line made mostly of these is a shimmer line = working. */
export const BRAILLE_RE = /[⠀-⣿]/u;
/** How far back a shimmer line still counts as "now" rather than scrollback. */
export const CODEX_SHIMMER_LINES = 6;

function containsAny(haystack, markers) {
  const s = haystack.toLowerCase();
  return markers.some((m) => s.includes(m.toLowerCase()));
}

function liveLines(read, limit = LIVE_TAIL_LINES) {
  const tail = Array.isArray(read?.tail) ? read.tail : [];
  return tail.slice(-limit);
}

/**
 * A spinner frame, not content: a short line whose visible characters are mostly braille. Bounded to the
 * last few lines so a shimmer frozen in scrollback cannot pin a pane to "working" forever.
 */
export function hasShimmerLine(read, limit = CODEX_SHIMMER_LINES) {
  return liveLines(read, limit).some((raw) => {
    const line = String(raw ?? '').trim();
    if (!line || !BRAILLE_RE.test(line)) return false;
    const visible = line.replace(/\s/g, '');
    const braille = (visible.match(/[⠀-⣿]/gu) ?? []).length;
    return braille > 0 && braille / visible.length >= 0.2;
  });
}

/** Codex branch of classifyPane. Never uses lastOutputAt — see CODEX_WORKING_MARKERS. */
export function classifyCodexPane(show, read, opts = {}) {
  const screen = `${show.preview ?? ''}\n${liveLines(read).join('\n')}`;
  if (show.agentWait != null) return 'permission';
  if (containsAny(screen, PERMISSION_MARKERS)) return 'permission';
  if (read && read.status && read.status !== 'running') return 'unknown';
  if (containsAny(screen, CODEX_WORKING_MARKERS)) return 'agent-working';
  if (hasShimmerLine(read, opts.shimmerLines ?? CODEX_SHIMMER_LINES)) return 'agent-working';
  if (containsAny(screen, CODEX_COMPOSER_MARKERS)) return 'agent-idle';
  return 'unknown';
}

/**
 * Classify a pane from `terminal show` + `terminal read`. Anything unreadable is `unknown` on purpose:
 * a deferred note is cheap, an approved dialog is not (review C1/C2).
 */
export function classifyPane(show, read, opts = {}) {
  const now = opts.now ?? Date.now();
  const staleMs = opts.staleMs ?? STALE_MS;
  if (!show || typeof show !== 'object') return 'unknown';
  if (show.connected !== true || show.writable !== true) return 'unknown';
  if (show.orphaned === true) return 'unknown';
  if (!show.agentIdentity) return 'shell';

  // Orca's own title decoration, checked before anything vendor-specific: it is set by the runtime, it
  // needs no screen scraping, and it is readable when the tail is not.
  if (titleSignalsPermission(show.title)) return 'permission';

  if (String(show.agentIdentity).toLowerCase() === 'codex') return classifyCodexPane(show, read, opts);

  const screen = `${show.preview ?? ''}\n${liveLines(read).join('\n')}`;

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

/** Claude queues typed input mid-turn; Codex does not (pilot, 2026-09-13) — so Codex is idle-only. */
export const SENDABLE = new Set(['agent-idle', 'agent-working']);
export const SENDABLE_CODEX = new Set(['agent-idle']);

export function sendableStates(agentIdentity) {
  return String(agentIdentity).toLowerCase() === 'codex' ? SENDABLE_CODEX : SENDABLE;
}

export function isSendable(classification, agentIdentity) {
  return sendableStates(agentIdentity).has(classification);
}

/**
 * The prompt that starts the input box. Verified live 2026-09-14 on Netcup: taxonomy's composer is
 * `U+276F` alone on its own line between two box rules, with the transcript above it. Codex uses `›`.
 * Only these two — `>` appears in quoted text and `⏵⏵` is the hint line BELOW the box.
 */
export const PROMPT_MARKERS = ['❯', '›'];
const RULE_LINE_RE = /^[\s─━═\-_]{3,}$/u;

/**
 * Split a pane read into what has already been SUBMITTED (history) and what is sitting in the composer.
 *
 * This is the fix for the incident's second half (2026-09-14): "is our note on screen?" was asked of
 * the whole tail, so an id that had been delivered and scrolled into the transcript looked identical to
 * one stranded in the composer. taxonomy's composer was empty — a bare `❯` — while flush.log insisted
 * the note was "already on screen", and the outbox never drained.
 *
 * The composer runs from the prompt marker to the next box rule (or the hint line below it), so the
 * agents list and the status line underneath are never mistaken for something a human typed.
 */
export function splitAtPrompt(read, lines = LIVE_TAIL_LINES) {
  const window = liveLines(read, lines);
  let idx = -1;
  for (let i = window.length - 1; i >= 0; i--) {
    const t = String(window[i] ?? '').trim();
    if (PROMPT_MARKERS.some((m) => t.startsWith(m))) { idx = i; break; }
  }
  if (idx === -1) return { found: false, history: window, composer: [] };

  const composer = [String(window[idx]).trim().slice(1)];
  for (let i = idx + 1; i < window.length; i++) {
    const t = String(window[i] ?? '').trim();
    if (RULE_LINE_RE.test(t)) break;
    if (containsAny(t, COMPOSER_MARKERS)) break;
    composer.push(String(window[i]));
  }
  return { found: true, history: window.slice(0, idx), composer };
}

const stripAll = (parts) => parts.join('').replace(/\s+/g, '');

/**
 * Where is `[<id>]` on screen? `composer` means a delivery that was typed and never submitted;
 * `history` means it was submitted and has scrolled into the transcript — i.e. it ARRIVED.
 */
export function locateId(read, id, lines = LIVE_TAIL_LINES) {
  const { found, history, composer } = splitAtPrompt(read, lines);
  const needle = `[${id}`;
  const inComposer = stripAll(composer).includes(needle);
  const inHistory = stripAll(history).includes(needle);
  return { found, inComposer, inHistory, composer, history };
}

/**
 * Whitespace-insensitive check for the typed line in the composer. The terminal wraps, so only the
 * `[<id>` token is reliable. Restricted to the composer region when it can be located, and otherwise to
 * the same live window the classifier trusts (review H1).
 */
export function composerShows(read, id, lines = LIVE_TAIL_LINES) {
  const { found, inComposer } = locateId(read, id, lines);
  if (found) return inComposer;
  const tail = Array.isArray(read?.tail) ? read.tail.slice(-lines).join('') : '';
  return tail.replace(/\s+/g, '').includes(`[${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pane resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reduce an Orca pane title to the slug it represents.
 *
 * Real shapes seen live:
 *   Claude  `◑ taxonomy`, `✳ nucleus`, `◐ accounts`      — a status glyph, then the name
 *   Codex   `⠇ astra | bto-workflows`, `n-astra | bto_nucleus`
 *                                                        — optional braille spinner, name, ` | worktree`
 *   shells  `MINGW64:/c/Users/benzh/Code/Zhuk Projects`, `nightrush-app`
 *
 * Order matters twice over. The status tag has to go FIRST, before the glyph strip flattens `[ . ]` and
 * leaves `Action Required | astra …` — which the pipe cut then reduces to `action required`, the exit 2
 * the live Codex pane produced on 2026-09-13. And the ` | ` separator has to be cut BEFORE the
 * decoration pass, which would otherwise leave `astra bto-workflows` (review R7).
 */
export function normalizeTitle(title) {
  return stripStatusTag(title)
    .replace(/^[^\p{L}\p{N}]+/u, '')   // leading status glyphs and whitespace
    .replace(/\s*\|.*$/su, '')         // Orca's ` | <worktree>` suffix on Codex panes
    .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Drop Orca's waiting-on-a-human decoration, e.g. `[ . ] Action Required | astra | bto-workflows` →
 * `astra | bto-workflows`, so the slug still resolves and the note reaches the ledger and the outbox
 * instead of dying at exit 2. The pane still classifies `permission` — that is titleSignalsPermission's
 * job, and it fails closed on ANY bracket.
 *
 * The RESOLVER must not generalise the same way (review M4). Eating the first segment for any bracketed
 * tag renames `[2] astra | bto-workflows` to `bto-workflows` — a pane answering to its worktree, which
 * would then read and ack another slug's inbox. So a segment is dropped only when it carries a KNOWN
 * waiting label (with or without a bracket); an unrecognised tag loses the bracket and nothing else.
 */
export function stripStatusTag(title) {
  const raw = String(title ?? '');
  const m = /^\s*(?:\[[^\]]*\]\s*)?([^|]*?)\s*\|\s*/.exec(raw);
  if (m && TITLE_PERMISSION_MARKERS.some((k) => m[1].toLowerCase().includes(k))) return raw.slice(m[0].length);
  return raw.replace(/^\s*\[[^\]]*\]\s*/, ''); // unknown tag: never eat a segment
}

/** The slug form of a pane title, or null when the title does not reduce to a legal slug. */
export function titleToSlug(title) {
  const slug = normalizeTitle(title).replace(/[\s_]+/g, '-');
  return slug && SLUG_RE.test(slug) ? slug : null;
}

/** Exact match only, case-insensitive. Never a prefix or substring — two panes must never both match. */
export function titleMatchesSlug(title, slug) {
  const n = normalizeTitle(title);
  const want = String(slug).toLowerCase();
  return n === want || n.replace(/[\s_]+/g, '-') === want;
}

export function describePanes(list) {
  return list.map((t) => `  ${t.handle}  ${JSON.stringify(t.title ?? '')}  ${t.agentIdentity ?? 'no-agent'}`).join('\n');
}

/**
 * Which pane is `to`, and HOW did we decide? (spec 2026-09-14, D3.)
 *
 * Order, and every step of it is load-bearing:
 *   1. a raw `term_…` handle is exact, always.
 *   2. an exact title match — the freshest intent there is, because a title is what Ben just renamed.
 *   3. a BINDING: a pane that told us "I am <slug>" by running `note-inbox --me <slug>` in itself.
 *      Codex derives a pane's title from the conversation (`Continue`, `switch-to-astra-model`), so
 *      title == slug survives exactly until the next restart — which is the 2026-09-14 incident, 35
 *      minutes of `no pane titled "astra"` against a pane that was reading astra's inbox all along.
 *
 * A title match BEATS a binding when they disagree: renaming a pane is a deliberate act, and the
 * binding will be refreshed by that pane's next inbox read anyway. Bindings for handles that are not
 * in `terminals` are ignored here and never deleted — GC is note-flush's job (D6).
 *
 * @returns {{ pane: object, via: 'handle'|'title'|'binding' }}
 */
export function resolvePaneWithSource(terminals, to, opts = {}) {
  const list = Array.isArray(terminals) ? terminals : [];
  if (HANDLE_RE.test(to)) {
    const exact = list.find((t) => t.handle === to);
    if (exact) return { pane: exact, via: 'handle' };
    throw new NoteError(2, `no pane with handle ${to}\n${describePanes(list)}`);
  }
  // A title match beats a binding — a rename is deliberate — but never against a pane that has SAID it
  // is somebody else. Codex generates titles from the conversation (`Continue`, `switch-to-astra-model`),
  // so an unrelated pane's title can reduce to a slug another pane has bound; without this filter the
  // note is typed into the session that calls itself something else (review MAJOR 1). A pane bound to
  // the slug, or bound to nothing, still matches on its title as before.
  const bindings = opts.bindings ?? {};
  const want = String(to).toLowerCase();
  const matches = list.filter((t) => titleMatchesSlug(t.title, to)
    && String(bindings[t.handle]?.slug ?? want).toLowerCase() === want);
  if (matches.length === 1) return { pane: matches[0], via: 'title' };
  if (matches.length > 1) {
    throw new NoteError(
      2,
      `"${to}" matches ${matches.length} panes — refusing to guess. Re-send with one of these handles:\n${describePanes(matches)}`,
    );
  }

  const bound = list.filter((t) => String(bindings[t.handle]?.slug ?? '').toLowerCase() === want);
  if (bound.length === 1) return { pane: bound[0], via: 'binding' };
  if (bound.length > 1) {
    // Two live panes both claiming the slug is the same refusal as two identical titles: never guessed,
    // reported with the list so a human can pick a handle (red-team H9).
    throw new NoteError(
      2,
      `"${to}" is bound to ${bound.length} live panes — refusing to guess. Re-send with one of these handles:\n${describePanes(bound)}`,
    );
  }

  throw new NoteError(
    2,
    `no pane titled "${to}" and no bound pane\n${describePanes(list)}\n`
    + `  hint: run: note-inbox --bind ${to}   inside that pane (its title no longer has to equal its slug)`,
  );
}

/** Never guess between candidates: ambiguity is exit 2 with the list (red-team H9). */
export function resolvePane(terminals, to, opts = {}) {
  return resolvePaneWithSource(terminals, to, opts).pane;
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

/**
 * Every advertised budget in v4 is a lie unless the subprocess underneath it can be killed. A hung
 * `terminal read` is exactly the rc 143/124 failure the pilot already paid for, one layer down: it
 * would block a sender past its "never more than 15 seconds" promise, pin the 1-minute timer unit, and
 * leave one stuck node process per Codex turn end. So every orca call is killed on expiry (review H4).
 */
/**
 * 12 s, not 8 (incident 2026-09-14). Netcup under load answers a `terminal show`/`read` in 1–7 s, so
 * an 8 s ceiling was timing out mid-delivery — and a timeout between "type the line" and "press Enter"
 * is the one failure that strands text in someone's composer.
 */
export const DEFAULT_ORCA_TIMEOUT_MS = 12_000;

export function orcaTimeoutMs(env = process.env) {
  const raw = Number(env.ORCA_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ORCA_TIMEOUT_MS;
}

/** execFile with an argv array — never a shell string, so a `$` or a quote in the substance is inert (M7). */
export function makeOrcaRunner(explicit, env = process.env, deps = {}) {
  const resolved = resolveOrcaCommand(explicit, env, deps);
  const { exe, base } = resolved;
  const timeout = deps.timeoutMs ?? orcaTimeoutMs(env);
  const run = deps.execFile ?? execFileAsync;
  return async (args) => {
    let stdout;
    try {
      ({ stdout } = await run(exe, [...base, ...args], {
        maxBuffer: 64 * 1024 * 1024, windowsHide: true, timeout, killSignal: 'SIGKILL',
      }));
    } catch (err) {
      // `killed` is how execFile reports "I hit the timeout and shot it". Never retried here: the
      // caller's own deadline decides, and a retry inside the runner would double every budget.
      if (err?.killed === true) {
        throw new NoteError(4, `orca ${args.slice(0, 2).join(' ')} timed out after ${timeout} ms and was killed${orcaHint(resolved)}`);
      }
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

/**
 * Run `work` with a hard wall-clock bound, returning `fallback` if it does not finish. The underlying
 * orca subprocess is separately killed by its own timeout, so a losing promise cannot keep the process
 * alive — this bound is about the CALLER's budget, which is what every v4 number promises (review H4).
 */
export async function withDeadline(work, ms, fallback) {
  if (!(ms > 0)) return fallback;
  let timer;
  const expiry = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    clearTimeout(timer);
  }
}

export async function showPane(orca, handle) {
  const r = await orca(['terminal', 'show', '--terminal', handle, '--json']);
  return r?.terminal ?? null;
}

export async function readPane(orca, handle) {
  const r = await orca(['terminal', 'read', '--terminal', handle, '--limit', '80', '--json']);
  return r?.terminal ?? null;
}

export async function classifyNow(orca, handle, deps = {}) {
  if (deps.classify) return deps.classify(handle);
  const show = await showPane(orca, handle);
  const read = await readPane(orca, handle);
  return classifyPane(show, read, { now: Date.now() });
}

/**
 * Two-phase delivery (review C1 / H1): type the line WITHOUT Enter, re-read the pane, and press Enter
 * only if the line is visible in the composer AND the classification is unchanged. A state change
 * between the two reads means a human or the agent moved; Enter then lands on something we never saw.
 *
 * @returns {Promise<{ delivered: boolean, reason?: string, classification: string, stranded?: boolean }>}
 */
export async function twoPhaseSend(orca, pane, envelope, id, classification, opts = {}) {
  const known = [envelope, ...(opts.knownEnvelopes ?? [])];
  const before = await readPane(orca, pane.handle);

  // RECOVERY (incident 2026-09-14). Where the id sits decides everything, and "on screen" is not
  // precise enough: an id in the TRANSCRIPT was delivered and submitted, an id in the COMPOSER was
  // typed and never submitted. Conflating them is why the outbox never drained against a pane whose
  // composer was empty.
  const where = locateId(before, id);

  // Order matters: with no prompt marker there is no split, so `history` is the whole window and would
  // claim every sighting as "already delivered". Rule that case out before trusting either bucket.
  if (!where.found && (where.inComposer || where.inHistory)) {
    return {
      delivered: false, classification, stranded: true,
      reason: `[${id}] is somewhere on ${pane.handle}'s screen but no prompt marker (${PROMPT_MARKERS.join(' or ')}) `
        + 'was found, so the composer could not be told apart from the transcript',
    };
  }

  if (where.found && where.inComposer) {
    // Typed by an earlier attempt whose phase 2 was cut short. Finish it — but only when the composer
    // holds nothing but notes we can account for. Anything else could be a human's half-typed message.
    const { foreign } = composerResidue(before, known);
    if (foreign) {
      return {
        delivered: false, classification, stranded: true,
        reason: `[${id}] is in ${pane.handle}'s composer but so is text that is not a note `
          + `(residue, whitespace stripped: ${JSON.stringify(foreign.slice(0, 60))}) — refusing to press Enter over it`,
      };
    }
    try {
      await orca(['terminal', 'send', '--terminal', pane.handle, '--enter', '--json']);
    } catch (err) {
      return {
        delivered: false, classification, stranded: true, cliError: err,
        reason: `${err.message} — [${id}] is still sitting UNSENT in ${pane.handle}'s composer`,
      };
    }
    return { delivered: true, classification, stranded: false, recovered: true };
  }

  if (where.found && where.inHistory) {
    // Already submitted: it is in the transcript, not the input box. The wake-up is done; retyping it
    // is how a peer receives the same note twice.
    return { delivered: true, classification, stranded: false, confirmed: true };
  }

  try {
    await orca(['terminal', 'send', '--terminal', pane.handle, '--text', envelope, '--json']);
  } catch (err) {
    return { delivered: false, classification, stranded: false, cliError: err, reason: `${err.message} — nothing was typed` };
  }

  // From here the text IS on screen. Everything below must run to completion — the caller must not
  // race this half against a deadline, or a slow read leaves the line in the composer with no Enter.
  const after = await readPane(orca, pane.handle);
  const visible = composerShows(after, id);
  const recheck = classifyPane(await showPane(orca, pane.handle), after, { now: Date.now() });
  if (!visible || recheck !== classification) {
    return {
      delivered: false, classification: recheck, stranded: visible,
      reason: `aborted before Enter: pane went "${classification}" → "${recheck}"`
        + `${visible ? '' : ', and the typed line was not visible in the composer'}`,
    };
  }

  try {
    await orca(['terminal', 'send', '--terminal', pane.handle, '--enter', '--json']);
  } catch (err) {
    return {
      delivered: false, classification, stranded: true, cliError: err,
      reason: `${err.message} — the envelope is sitting UNSENT in ${pane.handle}'s composer`,
    };
  }

  return { delivered: true, classification, stranded: false };
}

/** Screen furniture: never content, whoever typed it. */
const CHROME_RE = /[\s│┃|>‹›❯⏵⏎⠀-⣿─━┌┐└┘├┤┬┴┼╭╮╯╰═║╔╗╚╝•·…✻✳✢◐◑◒◓⎿↑↓▌▏█▁‸⎮]/gu;

/**
 * What is in the composer that is NOT one of the envelopes we know about?
 *
 * Whitespace is stripped before matching because the terminal WRAPS a 700-character envelope across
 * several lines — the same reason composerShows works on a stripped tail. `known` carries our own
 * envelope plus every line the ledger has seen today, so a composer holding a stack of stranded notes
 * comes back clean while a human's half-typed message does not.
 */
export function composerResidue(read, known, lines = LIVE_TAIL_LINES) {
  // The composer region only. Run over the whole tail this would call the entire transcript "foreign"
  // and refuse forever — the mirror image of the bug that called the transcript "the composer".
  const { found, composer } = splitAtPrompt(read, lines);
  const region = found ? composer : (Array.isArray(read?.tail) ? read.tail.slice(-lines) : []);
  const stripped = region.join('').replace(/\s+/g, '');
  if (!stripped) return { foreign: null, residue: '' };

  let rest = stripped.replace(CHROME_RE, '');
  for (const marker of COMPOSER_MARKERS) {
    const needle = marker.replace(/\s+/g, '').replace(CHROME_RE, '').toLowerCase();
    if (!needle) continue;
    let i = rest.toLowerCase().indexOf(needle);
    while (i !== -1) {
      rest = rest.slice(0, i) + rest.slice(i + needle.length);
      i = rest.toLowerCase().indexOf(needle);
    }
  }

  // Consume envelopes from the FRONT, longest first. Front-anchored is the strict reading of "every
  // non-empty composer line is exactly an envelope": text typed before our line fails to match at the
  // head, text typed after it survives to the end. Longest first because a superseding note contains
  // its parent's id, so the short one must not win the prefix.
  const needles = [...known].filter(Boolean)
    .map((env) => String(env).replace(/\s+/g, '').replace(CHROME_RE, ''))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (let progress = true; rest && progress;) {
    progress = false;
    for (const needle of needles) {
      if (rest.startsWith(needle)) { rest = rest.slice(needle.length); progress = true; break; }
    }
  }

  // ZERO tolerance (review F1). The old "more than three characters" allowance submitted exactly the
  // words a human types into an agent pane — `ok`, `y`, `no`, `yes`, `hmm` — along with our envelope.
  // A stray glyph now costs one deferral, which is free. A submitted "no" is not.
  return { foreign: rest.length > 0 ? rest : null, residue: rest };
}

// ─────────────────────────────────────────────────────────────────────────────
// On-disk layout
// ─────────────────────────────────────────────────────────────────────────────

export function notesDir(home) { return toPosix(path.posix.join(toPosix(home), '.agents/notes')); }
export function ledgerPath(repo, ymd) { return toPosix(path.posix.join(toPosix(repo), 'docs/ledger', `${ymd}.md`)); }
export function ledgerDir(repo) { return toPosix(path.posix.join(toPosix(repo), 'docs/ledger')); }
export function notesMirrorPath(home, ymd) { return toPosix(path.posix.join(notesDir(home), `${ymd}.md`)); }
export function packetPathFor(repo, id) { return toPosix(path.posix.join(toPosix(repo), 'docs/notes', `${id}.md`)); }
export function outboxDir(home) { return toPosix(path.posix.join(notesDir(home), 'outbox')); }
export function outboxPath(home, id) { return toPosix(path.posix.join(outboxDir(home), `${id}.json`)); }
/** Spec V2 names this file exactly: `~/.agents/notes/.cursor-<slug>`. It holds JSON. */
export function cursorPath(home, slug) { return toPosix(path.posix.join(notesDir(home), `.cursor-${slug}`)); }
export function flushLogPath(home) { return toPosix(path.posix.join(notesDir(home), 'flush.log')); }
/** Spec V7: one file Ben can read for everything blocked on him. */
export function benInboxPath(home) { return toPosix(path.posix.join(notesDir(home), 'ben-inbox.md')); }
export function paneSlugCachePath(home) { return toPosix(path.posix.join(notesDir(home), '.pane-slug.json')); }
/**
 * Spec 2026-09-14 D1: the DURABLE pane↔slug binding, `{ "<handle>": { slug, at, title? } }`. Distinct
 * from `.pane-slug.json`, which only caches what a title reduced to — a guess that expires. This file
 * records a pane SAYING who it is, and it is the only thing that survives a Codex restart renaming the
 * pane to `Continue`.
 */
export function bindingsPath(home) { return toPosix(path.posix.join(notesDir(home), 'panes.json')); }

/**
 * Append one envelope line. The day header goes through the exclusive `wx` flag so two concurrent senders
 * cannot both emit it (review L5); the line itself is one O_APPEND write, atomic at the ≤700 bytes an
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

export function readIfExists(file, fsImpl = fs) {
  try { return fsImpl.readFileSync(file, 'utf8'); } catch { return ''; }
}

export function safeReaddir(dir, fsImpl = fs) {
  try { return fsImpl.readdirSync(dir); } catch { return []; }
}

export function readLedgerCorpus(dirs, fsImpl = fs) {
  const texts = [];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const name of safeReaddir(dir, fsImpl)) {
      if (name.endsWith('.md')) texts.push(readIfExists(path.posix.join(toPosix(dir), name), fsImpl));
    }
  }
  return texts;
}

export const LEDGER_FILE_RE = /^(\d{4})-(\d{2})-(\d{2})\.md$/;

/**
 * The `YYYY-MM-DD.md` ledger files for the last `days` days, oldest first. Dated by FILENAME, not mtime:
 * the mirror and the repo ledger are appended by different processes and mtime drifts.
 */
export function recentLedgerFiles(dir, days, todayYmd, fsImpl = fs) {
  const cutoff = Date.parse(`${todayYmd}T00:00:00Z`) - (days - 1) * 86_400_000;
  return safeReaddir(dir, fsImpl)
    .filter((name) => LEDGER_FILE_RE.test(name))
    .filter((name) => Date.parse(`${name.slice(0, 10)}T00:00:00Z`) >= cutoff)
    .sort()
    .map((name) => ({ file: toPosix(path.posix.join(toPosix(dir), name)), ymd: name.slice(0, 10) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Cursor
// ─────────────────────────────────────────────────────────────────────────────

export const CURSOR_VERSION = 1;

/**
 * The cursor is a set of note ids this pane has already been shown, not a byte offset: the same line
 * appears in two or three files (recipient repo, sender repo, `~/.agents/notes` mirror) and is appended
 * by several processes, so an offset would double-report and drift. Ids are exact and are the same thing
 * the on-receipt dedup rule greps for.
 */
/**
 * Where a cursor goes when `~/.agents/notes` cannot be written — a read-only home, an EACCES, or the
 * `.cursor-<slug>` path occupied by a directory. Without this the hooks go PERMANENTLY SILENT: the
 * write throws, the hook swallows it, and a real pending note produces zero bytes forever (review M1).
 */
export function fallbackCursorHome(home, tmpDir = os.tmpdir()) {
  // Keyed by the home it stands in for. A single shared `note-cursor-fallback` directory would make
  // the fallback GLOBAL per slug: two homes on one machine (or two runs with different HOMEs) would
  // inherit each other's "already seen" set and silently swallow notes.
  const key = createHash('sha1').update(toPosix(home ?? '')).digest('hex').slice(0, 12);
  return toPosix(path.posix.join(toPosix(tmpDir), `note-cursor-fallback-${key}`));
}

function parseCursor(raw, slug) {
  if (!raw.trim()) return null;
  try {
    const c = JSON.parse(raw);
    if (c && typeof c.seen === 'object' && c.seen) {
      // `cold` is the subset of `seen` that was marked seen WITHOUT being displayed (the cold-start
      // window). It has to stay distinguishable: note-flush treats a seen id as "the recipient read it"
      // and retires the wake-up, which for a suppressed id retires a note nobody ever saw (BLOCKER 2).
      return {
        version: CURSOR_VERSION, slug, updatedAt: c.updatedAt ?? null, seen: c.seen,
        cold: (c.cold && typeof c.cold === 'object') ? c.cold : {},
      };
    }
  } catch { /* a corrupt cursor is a fresh cursor, never a crash */ }
  return null;
}

/**
 * Why this pane's cursor could not be written, WITHOUT writing anything — the reads that only display
 * notes no longer persist a cursor (the ack is a separate call now), so a broken cursor would otherwise
 * be discovered only after the output had already gone out, and the hook would repeat the same notes
 * forever with no explanation (review MAJOR 3 gave the reads this shape; M1 demands the explanation).
 *
 * @returns {string|null} the reason, or null when there is nothing wrong
 */
export function cursorProblem(home, slug, fsImpl = fs) {
  const file = cursorPath(home, slug);
  try {
    if (fsImpl.statSync(file).isDirectory()) return 'the path is a directory';
    return null; // it is a file: the write itself is the only real test, and it reports for itself
  } catch { /* missing is the normal case */ }
  if (typeof fsImpl.accessSync !== 'function') return null;
  try {
    fsImpl.accessSync(path.dirname(file), fs.constants.W_OK);
    return null;
  } catch (err) {
    return err?.message ?? 'not writable';
  }
}

export function readCursor(home, slug, fsImpl = fs, deps = {}) {
  const primary = parseCursor(readIfExists(cursorPath(home, slug), fsImpl), slug);
  if (primary) return primary;
  // The primary is missing or unreadable; a fallback cursor means a previous run could not write here
  // and parked its state in the temp dir. Using it is what keeps "emit once" from becoming "emit always".
  const fallback = parseCursor(readIfExists(cursorPath(fallbackCursorHome(home, deps.tmpDir), slug), fsImpl), slug);
  return fallback ?? { version: CURSOR_VERSION, slug, updatedAt: null, seen: {}, cold: {} };
}

function writeCursorTo(home, slug, seen, cold, fsImpl) {
  const file = cursorPath(home, slug);
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  fsImpl.writeFileSync(file, `${JSON.stringify({ version: CURSOR_VERSION, slug, updatedAt: new Date().toISOString(), seen, cold }, null, 0)}\n`, 'utf8');
  return file;
}

/**
 * Prune to the scan window so the file cannot grow without bound, then write — falling back to the temp
 * dir rather than throwing. Returns `{ file, fallback, error }`; the caller reports `error` instead of
 * going quiet.
 */
export function writeCursor(home, slug, cursor, { fsImpl = fs, keepFrom = null, tmpDir = undefined } = {}) {
  const prune = (map) => {
    const out = {};
    for (const [id, ymd] of Object.entries(map ?? {})) {
      if (keepFrom && String(ymd) < keepFrom) continue;
      out[id] = ymd;
    }
    return out;
  };
  const seen = prune(cursor.seen);
  // The same window for `cold`, so an id pruned out of `seen` cannot linger here and make a reused id
  // look suppressed forever.
  const cold = prune(cursor.cold);
  try {
    return { file: writeCursorTo(home, slug, seen, cold, fsImpl), fallback: false, error: null };
  } catch (err) {
    const why = err?.message ?? String(err);
    try {
      return { file: writeCursorTo(fallbackCursorHome(home, tmpDir), slug, seen, cold, fsImpl), fallback: true, error: why };
    } catch (err2) {
      // Both paths are gone. Still not a throw: the caller must surface the notes, not disappear.
      return { file: null, fallback: false, error: `${why}; fallback also failed: ${err2?.message ?? err2}` };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Outbox
// ─────────────────────────────────────────────────────────────────────────────

export const OUTBOX_VERSION = 1;

/**
 * One deferred note, written by note-send the moment delivery is refused and drained by note-flush.
 * The envelope is already in the ledger by then — the outbox only carries the WAKE-UP, so losing an
 * entry loses a nudge, never a note.
 */
export function writeOutboxEntry(home, entry, fsImpl = fs) {
  const file = outboxPath(home, entry.id);
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  const prev = (() => { try { return JSON.parse(readIfExists(file, fsImpl) || '{}'); } catch { return {}; } })();
  const merged = {
    version: OUTBOX_VERSION,
    createdAt: prev.createdAt ?? new Date().toISOString(),
    attempts: Number(prev.attempts ?? 0),
    ...entry,
    updatedAt: new Date().toISOString(),
  };
  fsImpl.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return file;
}

export function readOutbox(home, fsImpl = fs) {
  const dir = outboxDir(home);
  const out = [];
  for (const name of safeReaddir(dir, fsImpl)) {
    if (!name.endsWith('.json')) continue;
    const file = toPosix(path.posix.join(dir, name));
    try {
      const entry = JSON.parse(readIfExists(file, fsImpl));
      if (entry && entry.id && entry.envelope) out.push({ ...entry, file });
    } catch { /* a half-written entry is skipped, not fatal — the next flush sees it whole */ }
  }
  return out.sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
}

export function removeOutboxEntry(home, id, fsImpl = fs) {
  try { fsImpl.rmSync(outboxPath(home, id), { force: true }); return true; } catch { return false; }
}

export function deadOutboxDir(home) { return toPosix(path.posix.join(outboxDir(home), 'dead')); }
export function deadOutboxPath(home, id) { return toPosix(path.posix.join(deadOutboxDir(home), `${id}.json`)); }

/**
 * A wake-up nobody could deliver is retired to `outbox/dead/` rather than deleted or retried forever
 * (incident 2026-09-14: entries churned for 20 attempts and then vanished). The note itself is still in
 * the ledger; this keeps the evidence of what never got typed, and where.
 */
export function killOutboxEntry(home, id, entry, fsImpl = fs) {
  const file = deadOutboxPath(home, id);
  try {
    fsImpl.mkdirSync(path.dirname(file), { recursive: true });
    fsImpl.writeFileSync(file, `${JSON.stringify({ ...entry, diedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  } catch { /* the removal below is what matters */ }
  removeOutboxEntry(home, id, fsImpl);
  return file;
}

/**
 * Three drainers share the outbox — the 1-minute timer, note-notify at a Codex turn end, and every
 * note-send piggyback — so "read, attempt, delete on success" races (review M2). Flusher B holding a
 * stale copy of an entry A just delivered would take the `composerShows` early return, record a
 * deferral, and RESURRECT the file; the nudge is retyped later and the note lands in the pane twice.
 *
 * A claim is an atomic rename. Exactly one flusher can win it, because rename fails when the source is
 * already gone, and the winner owns the entry for the length of one attempt.
 */
export function claimPath(home, id, pid = process.pid) {
  return `${outboxPath(home, id)}.${pid}.claim`;
}

export function claimOutboxEntry(home, id, fsImpl = fs, pid = process.pid) {
  const claim = claimPath(home, id, pid);
  try {
    fsImpl.renameSync(outboxPath(home, id), claim);
    return claim;
  } catch {
    return null; // another flusher got there first, or it was delivered and deleted
  }
}

export function releaseClaim(claim, fsImpl = fs) {
  try { fsImpl.rmSync(claim, { force: true }); return true; } catch { return false; }
}

export const STALE_CLAIM_MS = 5 * 60 * 1000;

/**
 * A flusher killed mid-attempt leaves a claim behind, and the entry would be invisible forever. Any
 * claim older than STALE_CLAIM_MS is returned to the outbox at the start of the next drain — but only
 * when no live entry exists for that id, so a reclaim can never clobber a newer write.
 */
export function reclaimStaleClaims(home, { fsImpl = fs, now = Date.now(), maxAgeMs = STALE_CLAIM_MS } = {}) {
  const dir = outboxDir(home);
  const reclaimed = [];
  for (const name of safeReaddir(dir, fsImpl)) {
    const m = /^(.+\.json)\.\d+\.claim$/.exec(name);
    if (!m) continue;
    const claim = toPosix(path.posix.join(dir, name));
    const target = toPosix(path.posix.join(dir, m[1]));
    try {
      if (now - fsImpl.statSync(claim).mtimeMs < maxAgeMs) continue;
      if (fsImpl.existsSync(target)) { fsImpl.rmSync(claim, { force: true }); continue; }
      fsImpl.renameSync(claim, target);
      reclaimed.push(m[1].replace(/\.json$/, ''));
    } catch { /* another drain is racing us for the same claim; it can have it */ }
  }
  return reclaimed;
}

/** `~/.agents/notes/flush.log` — one line per attempt, so a silent retry loop is impossible to hide. */
export function appendFlushLog(home, text, fsImpl = fs) {
  const file = flushLogPath(home);
  try {
    fsImpl.mkdirSync(path.dirname(file), { recursive: true });
    fsImpl.appendFileSync(file, `${text}\n`, 'utf8');
  } catch { /* the log is a convenience; never let it break a drain */ }
  return file;
}

// ─────────────────────────────────────────────────────────────────────────────
// Outstanding asks, and the long-poll marker (spec 2026-09-14 hooks, D2)
// ─────────────────────────────────────────────────────────────────────────────

/** How far back an unanswered ASK still counts as outstanding. */
export const ASK_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Every line in `texts`, parsed, in order. A ledger corpus is a handful of small files; parsing it is
 * cheaper than the stat that decided to call us.
 */
function parseCorpus(texts) {
  const out = [];
  for (const text of texts) {
    for (const raw of String(text ?? '').split('\n')) {
      const g = parseEnvelope(raw.trimEnd());
      if (g) out.push(g);
    }
  }
  return out;
}

/**
 * The ASKs I have sent that nobody has answered — the ONLY reason a session is allowed to wait after a
 * turn (Ben's ruling: adaptive long-poll, and only while something is outstanding).
 *
 * Mine, in the last 24 h, that asked for something (`Needs:` other than `none`), minus the ones the
 * RECIPIENT has since replied to: a later line naming the ask in ` re <id>` whose kind is RESULT or
 * BLOCKED — or ACK, but only when the ask asked for exactly that. An ACK to a `Needs: review` is "I am
 * taking it", not the review, so that ask is still outstanding and the session may keep waiting.
 *
 * @returns {{id: string, to: string, needs: string}[]}
 */
export function outstandingAsks(texts, slug, { now = Date.now(), zone = DEFAULT_ZONE, windowMs = ASK_WINDOW_MS } = {}) {
  const entries = parseCorpus(texts);
  const me = String(slug ?? '').toLowerCase();
  if (!me) return [];

  const answered = new Set();
  for (const e of entries) {
    if (!e.re) continue;
    const parent = entries.find((p) => p.id === e.re);
    if (!parent || String(parent.from).toLowerCase() !== me) continue;
    // Only the pane the ask was addressed to can close it. A third session saying RESULT about it does
    // not mean the recipient has answered.
    if (String(e.from).toLowerCase() !== String(parent.to).toLowerCase()) continue;
    if (e.kind === 'RESULT' || e.kind === 'BLOCKED' || (e.kind === 'ACK' && parent.needs === 'ack')) {
      answered.add(e.re);
    }
  }

  // A later `supersedes` retires an ask exactly as it retires its wake-up: the question was replaced,
  // so waiting for an answer to the old one would park the session on something nobody will answer.
  const retired = supersededIds(texts);

  const seen = new Set();
  const out = [];
  for (const e of entries) {
    if (e.kind !== 'ASK' || String(e.from).toLowerCase() !== me) continue;
    if (!e.needs || e.needs === 'none') continue;
    // BEN IS NOT A PANE. He reads ben-inbox.md and answers by typing, so no RESULT line ever appears
    // for an ask addressed to him — and without this, one `--to ben` ASK parks the session for the full
    // 15 minutes at the end of EVERY turn for a day, which to Ben looks like the agent hanging on him
    // (review MAJOR 2).
    if (String(e.to).toLowerCase() === RESERVED_RECIPIENT) continue;
    if (answered.has(e.id) || retired.has(e.id) || seen.has(e.id)) continue;
    const at = envelopeInstant(e, zone);
    // A line whose date will not parse has no age, so it can never leave the window: treat it as too
    // old to wait for rather than as outstanding forever.
    if (at === null || now - at > windowMs) continue;
    seen.add(e.id);
    out.push({ id: e.id, to: e.to, needs: e.needs });
  }
  return out;
}

/**
 * `~/.agents/notes/.listening-<slug>.json` — "this pane is parked in a Stop hook waiting for a reply".
 * The flusher reads it and does NOT type at that pane (D5): the hook will deliver the note into the
 * context itself, which is the whole point of the exercise — no text in Ben's composer.
 */
export function listeningPath(home, slug) { return toPosix(path.posix.join(notesDir(home), `.listening-${slug}.json`)); }

export function writeListening(home, slug, marker, fsImpl = fs) {
  const file = listeningPath(home, slug);
  try {
    fsImpl.mkdirSync(path.dirname(file), { recursive: true });
    fsImpl.writeFileSync(file, `${JSON.stringify(marker, null, 0)}\n`, 'utf8');
    return file;
  } catch {
    return null; // a marker we cannot write costs us a typed wake-up, never the note
  }
}

export function readListening(home, slug, fsImpl = fs) {
  try {
    const m = JSON.parse(readIfExists(listeningPath(home, slug), fsImpl) || 'null');
    return m && typeof m === 'object' ? m : null;
  } catch { return null; }
}

/**
 * Remove the marker — but only if it is OURS. Two sessions can share a slug (a Claude pane and a Codex
 * pane both bound to it, or a pane that restarted), and whichever finished first used to delete the
 * survivor's marker, putting the flusher back to typing at a pane that is still parked (review MINOR 7).
 * Called with no owner it removes unconditionally, which is what a repair or a test wants.
 */
export function removeListening(home, slug, fsImpl = fs, owner = null) {
  if (owner) {
    const marker = readListening(home, slug, fsImpl);
    if (marker && (marker.pid !== owner.pid || marker.host !== owner.host)) return false;
  }
  try { fsImpl.rmSync(listeningPath(home, slug), { force: true }); return true; } catch { return false; }
}

/**
 * Is somebody listening for this slug RIGHT NOW? Expired markers do not count, and neither does one left
 * behind by a process that has died — a stale marker would silence the flusher for that slug forever.
 * The pid is only checked when the marker was written on this host; a marker from another machine is
 * trusted until it expires, because its pids mean nothing here.
 */
export function isListening(home, slug, { fsImpl = fs, now = Date.now(), host = os.hostname(), alive = defaultAlive } = {}) {
  const marker = readListening(home, slug, fsImpl);
  if (!marker) return null;
  if (!(Number(marker.until) > now)) return null;
  if (marker.host && marker.host === host && marker.pid && !alive(Number(marker.pid))) return null;
  return marker;
}

function defaultAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err?.code === 'EPERM'; }
}

/** Ids retired by a later `supersedes` anywhere in the ledgers we can see (spec V5). */
export function supersededIds(texts) {
  const out = new Set();
  for (const text of texts) {
    for (const m of String(text ?? '').matchAll(/ supersedes ([a-z0-9-]+-\d+)[\]\s]/g)) out.add(m[1]);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry-point detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Is this module the process entry point?
 *
 * The naive `import.meta.url === pathToFileURL(process.argv[1]).href` check is FALSE whenever the
 * script is reached through a symlink: Node resolves the module URL to the real path while
 * `process.argv[1]` keeps the link path. The mirror publishes `~/.agents/skills/multi` as a symlink on
 * macOS and Linux, and the PATH shim runs the script through exactly that path — so the guard failed,
 * `note-send` exited 0 having printed nothing and written no ledger line. A silent drop, which is the
 * one failure this whole protocol exists to prevent.
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

// ─────────────────────────────────────────────────────────────────────────────
// Slug resolution (spec V2)
// ─────────────────────────────────────────────────────────────────────────────

export const PANE_SLUG_CACHE_MS = 10 * 60 * 1000;

function readPaneSlugCache(home, fsImpl = fs) {
  try { return JSON.parse(readIfExists(paneSlugCachePath(home), fsImpl) || '{}'); } catch { return {}; }
}

function writePaneSlugCache(home, cache, fsImpl = fs) {
  const file = paneSlugCachePath(home);
  try {
    fsImpl.mkdirSync(path.dirname(file), { recursive: true });
    fsImpl.writeFileSync(file, `${JSON.stringify(cache)}\n`, 'utf8');
  } catch { /* a cache that cannot be written just means the next call asks orca again */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pane bindings (spec 2026-09-14) — "this pane IS <slug>", said by the pane itself
// ─────────────────────────────────────────────────────────────────────────────

/** A binding for a pane nobody has seen in this long is garbage-collected by note-flush (D6). */
export const BINDING_GC_MS = 24 * 60 * 60 * 1000;

/**
 * Which slug sources are allowed to WRITE a binding: only a pane stating its own identity. A slug
 * derived from a title never does — that is what `.pane-slug.json` is for, and letting a guess
 * overwrite a statement is how the pane titled `Continue` would claim to be `continue` forever (D4).
 * `binding` is included so an already-bound pane refreshes its `at` on every inbox read, which is what
 * keeps a LIVE pane out of the 24 h GC window.
 */
export const BINDING_SOURCES = new Set(['--me', '$NOTE_SLUG', 'binding']);

/**
 * Every binding on this machine, skipping anything malformed. A corrupt file is an empty map, never a
 * throw: this is read from a per-prompt hook, and a hook that throws breaks Ben's session.
 */
export function readBindings(home, fsImpl = fs) {
  let raw;
  try { raw = JSON.parse(readIfExists(bindingsPath(home), fsImpl) || '{}'); } catch { return {}; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [handle, rec] of Object.entries(raw)) {
    if (!HANDLE_RE.test(handle) || !rec || typeof rec !== 'object') continue;
    const slug = typeof rec.slug === 'string' && SLUG_RE.test(rec.slug) ? rec.slug : null;
    if (!slug) continue;
    out[handle] = {
      slug,
      at: Number.isFinite(Number(rec.at)) ? Number(rec.at) : 0,
      ...(rec.title == null ? {} : { title: String(rec.title) }),
    };
  }
  return out;
}

function writeBindingsFile(home, bindings, fsImpl) {
  const file = bindingsPath(home);
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  // tmp + rename: several processes write this file, and a reader that catches it half-written would
  // silently lose every binding on the box. This makes each write atomic FOR READERS; it does not
  // serialise two WRITERS — between one pane's read-modify-write another can land its own, and the
  // loser's binding is dropped. Self-healing, because that pane rebinds on its next inbox read, which
  // is why there is no lock here (review MINOR 2).
  const tmp = `${file}.${process.pid}.tmp`;
  fsImpl.writeFileSync(tmp, `${JSON.stringify(bindings, null, 2)}\n`, 'utf8');
  try {
    fsImpl.renameSync(tmp, file);
  } catch (err) {
    try { fsImpl.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    throw err;
  }
  return file;
}

/**
 * Record "handle X is slug Y". The pane is the AUTHORITY on who it is, so a handle already bound to a
 * different slug is re-bound rather than refused — and the change is logged, because a silent rebind
 * would be indistinguishable from the bug it fixes.
 *
 * Never throws: a binding that cannot be written costs a deferral, and the note is in the ledger.
 *
 * @returns {{ file: string|null, handle: string, slug: string, previous: string|null, rebound: boolean, error: string|null }}
 */
export function writeBinding(home, handle, slug, opts = {}) {
  const fsImpl = opts.fs ?? opts.fsImpl ?? fs;
  const now = opts.now ?? Date.now();
  const out = { file: null, handle, slug, previous: null, rebound: false, error: null };
  if (!HANDLE_RE.test(String(handle))) {
    out.error = `"${handle}" is not a pane handle`;
    return out;
  }
  if (!SLUG_RE.test(String(slug))) {
    out.error = `"${slug}" is not a legal slug`;
    return out;
  }
  const bindings = readBindings(home, fsImpl);
  out.previous = bindings[handle]?.slug ?? null;
  out.rebound = Boolean(out.previous && out.previous !== slug);
  // Keep a title an earlier `--bind --title` recorded: a plain `--me` read carries no title, and
  // dropping the field on every read would make it write-only (review MINOR 5).
  const keptTitle = opts.title == null ? bindings[handle]?.title : String(opts.title);
  bindings[handle] = {
    slug: String(slug), at: now,
    ...(keptTitle == null ? {} : { title: keptTitle }),
  };
  try {
    out.file = writeBindingsFile(home, bindings, fsImpl);
  } catch (err) {
    out.error = err?.message ?? String(err);
    return out;
  }
  if (out.rebound) {
    appendFlushLog(home, `${new Date(now).toISOString()} rebind ${handle} ${out.previous} -> ${slug}`, fsImpl);
  }
  return out;
}

/**
 * Bind this pane if the environment names one and the slug came from the pane itself (BINDING_SOURCES).
 * Returns null when there is nothing to do — no handle, or a slug we only guessed.
 */
export function maybeBindPane({ home, env = process.env, slug, source, title, fsImpl = fs, now = Date.now() } = {}) {
  const handle = env?.ORCA_TERMINAL_HANDLE;
  if (!slug || !handle || !HANDLE_RE.test(String(handle))) return null;
  if (!BINDING_SOURCES.has(source)) return null;
  return writeBinding(home, String(handle), String(slug), { fs: fsImpl, now, title });
}

/**
 * Forget THIS pane's binding, by handle. The only other ways out of a binding are rebinding to another
 * slug and 24 h of absence, which leaves a fat-fingered `--bind` (or two panes bound to one slug) with
 * no fix but hand-editing the file (review MINOR 6).
 *
 * @returns {{ file: string|null, handle: string, removed: string|null, error: string|null }}
 */
export function removeBinding(home, handle, opts = {}) {
  const fsImpl = opts.fs ?? opts.fsImpl ?? fs;
  const out = { file: null, handle, removed: null, error: null };
  const bindings = readBindings(home, fsImpl);
  if (!bindings[handle]) return out; // nothing bound here: not an error, there is just nothing to undo
  out.removed = bindings[handle].slug;
  delete bindings[handle];
  try {
    out.file = writeBindingsFile(home, bindings, fsImpl);
  } catch (err) {
    out.error = err?.message ?? String(err);
    out.removed = null;
  }
  return out;
}

/**
 * D6: forget a binding whose pane has been gone from `terminals` for more than `maxAgeMs`. Handles that
 * are still live are never touched, and a pane that is merely absent from ONE listing (a runtime blip)
 * keeps its binding until the age threshold passes.
 *
 * @returns {{handle: string, slug: string, ageMs: number}[]} what was dropped
 */
export function pruneBindings(home, terminals, { fsImpl = fs, now = Date.now(), maxAgeMs = BINDING_GC_MS } = {}) {
  const live = new Set((Array.isArray(terminals) ? terminals : []).map((t) => t?.handle));
  const bindings = readBindings(home, fsImpl);
  const dropped = [];
  for (const [handle, rec] of Object.entries(bindings)) {
    if (live.has(handle)) continue;
    const ageMs = now - Number(rec.at ?? 0);
    if (ageMs <= maxAgeMs) continue;
    dropped.push({ handle, slug: rec.slug, ageMs });
    delete bindings[handle];
  }
  if (dropped.length === 0) return dropped;
  try { writeBindingsFile(home, bindings, fsImpl); } catch { return []; }
  return dropped;
}

/**
 * Who am I? In order: `--me`, `$NOTE_SLUG`, `panes.json[handle]` (the binding), the cached title, then
 * the pane's live title.
 *
 * `ORCA_TERMINAL_HANDLE` is exported into every Orca pane's shell (verified live on Windows,
 * 2026-09-13: `term_d6dae247-…`), and `orca terminal show --terminal <handle>` turns it into the pane
 * title, which normalises to the slug. The result is cached for 10 minutes so a per-prompt hook does
 * not pay for an orca round-trip every time.
 *
 * Last resort is `orca terminal show` with no handle — the ACTIVE terminal. That is a UI-focus concept
 * and returns `no_active_terminal` for a pane that is not focused (verified), so it FAILS LOUD rather
 * than guessing: an inbox read under the wrong slug would show one pane another pane's notes.
 */
export async function resolveSlug(opts = {}) {
  const env = opts.env ?? process.env;
  const fsImpl = opts.fsImpl ?? fs;
  const home = toPosix(opts.home ?? os.homedir());
  const now = opts.now ?? Date.now();

  if (opts.explicit) return { slug: validateSlug('me', String(opts.explicit)), source: '--me' };
  if (env.NOTE_SLUG) return { slug: validateSlug('me', String(env.NOTE_SLUG)), source: '$NOTE_SLUG' };

  const handle = env.ORCA_TERMINAL_HANDLE;
  const orca = opts.orca ?? null;

  if (handle && HANDLE_RE.test(handle)) {
    // D4/D5: a BINDING outranks everything title-derived and has no TTL. A pane that ran
    // `note-inbox --me astra` is astra until it says otherwise — whatever Codex has renamed it to since.
    // Without this, a pane titled `Continue` resolves to the slug `continue` and reads an empty inbox
    // forever, which is the 2026-09-14 incident from the reader's side.
    const bound = readBindings(home, fsImpl)[handle];
    if (bound?.slug) return { slug: bound.slug, source: 'binding', handle };

    const cache = readPaneSlugCache(home, fsImpl);
    const hit = cache[handle];
    if (hit && hit.slug && now - Number(hit.at ?? 0) < (opts.cacheMs ?? PANE_SLUG_CACHE_MS)) {
      return { slug: hit.slug, source: '$ORCA_TERMINAL_HANDLE (cached)', handle };
    }
    if (orca) {
      const pane = await showPane(orca, handle).catch(() => null);
      // A pane with no agent is a plain shell. It has no peer identity, and a shell title reduces to a
      // perfectly legal-looking slug (`mingw64-c-users-benzh-code`) — which would silently claim an
      // inbox that is not its own.
      const slug = pane && pane.agentIdentity ? titleToSlug(pane.title) : null;
      if (slug) {
        cache[handle] = { slug, at: now };
        writePaneSlugCache(home, cache, fsImpl);
        return { slug, source: '$ORCA_TERMINAL_HANDLE', handle };
      }
      if (pane) {
        throw new NoteError(
          2,
          pane.agentIdentity
            ? `this pane's title ${JSON.stringify(pane.title ?? '')} does not reduce to a slug — rename the pane to its slug `
              + '(the pre-flight step), or pass --me <slug> / set NOTE_SLUG.'
            : `pane ${handle} has no agent — a plain shell has no peer identity and cannot own an inbox. `
              + 'Pass --me <slug> if you meant to read one.',
        );
      }
    }
  }

  // The ACTIVE terminal is a UI-focus concept: whatever pane Ben is looking at, which is only "me" for
  // a command a human typed at a focused pane. OFF by default (spec addendum: no handle in the
  // environment means `--me` is required) and opt-in through `note-inbox --active-terminal`, because a
  // turn ending in one pane must never drain or read another pane's inbox.
  if (orca && opts.allowActiveTerminal === true) {
    const active = await orca(['terminal', 'show', '--json']).catch(() => null);
    const pane = active?.terminal;
    const slug = pane && pane.agentIdentity ? titleToSlug(pane.title) : null;
    if (slug) return { slug, source: 'orca terminal show (active terminal)' };
  }

  throw new NoteError(
    2,
    'cannot tell which pane this is. Pass --me <slug>, or set NOTE_SLUG in this pane. '
    + `(ORCA_TERMINAL_HANDLE ${handle ? `is "${handle}" but orca could not read it` : 'is not set'}; `
    + '`orca terminal show` with no handle returns no_active_terminal unless the pane has UI focus, '
    + 'and that fallback is opt-in via --active-terminal anyway.) '
    + 'Never guessed: an inbox read under the wrong slug shows one pane another pane\'s notes.',
  );
}

/**
 * The pane's own worktree, straight from the environment Orca exports:
 * `ORCA_WORKTREE_ID=<id>::<worktreePath>::workspace:<id>` (verified on Windows and on Netcup,
 * 2026-09-13). Useful when a hook's cwd is not inside the repo the pane actually works in.
 */
export function worktreePathFromEnv(env = process.env) {
  const raw = env.ORCA_WORKTREE_ID;
  if (!raw) return null;
  const parts = String(raw).split('::');
  const candidate = parts[1];
  return candidate && !candidate.startsWith('workspace:') ? toPosix(candidate) : null;
}
