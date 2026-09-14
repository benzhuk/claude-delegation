// multi-hook-core — the one implementation of "a peer note arrives without anyone typing".
//
// Both agents load this: `multi-inbox.js` (Claude Code) and `multi-codex-hook.mjs` (Codex). They differ
// only in how they are invoked and how they name themselves; what a note LOOKS like when it lands, when
// a session is allowed to wait, and what Ben sees are decided here, once.
//
// Ben, 2026-09-14: "could we drop a short for-human summary into the context when the models pass
// messages, without typing it into the prompt where I type? my prompts frequently collide with theirs."
// That is `systemMessage` — Claude Code prints it as `⎿  Stop says: …`, Codex as `Hook  …`. It never
// touches the composer, so it cannot collide with what Ben is typing.
//
// THE RULES, inherited from the Claude hook and now shared:
//   1. NEVER THROW. A hook that fails is Ben's session broken. Every path is wrapped; the fallback is
//      always "print nothing, exit 0".
//   2. SILENT WHEN THERE IS NOTHING. No notes, no slug, no pane: no output at all.
//   3. FAST, except when waiting is the point. PostToolUse short-circuits on an mtime check. The Stop
//      long-poll is the one place that waits, and only while this session has an ASK outstanding.
//   4. NEVER GUESS THE SLUG. An inbox read under the wrong slug shows one session another's notes.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseEnvelope } from '../skills/multi/scripts/envelope.mjs';
import {
  outstandingAsks, writeListening, removeListening, readIfExists, safeReaddir, toPosix,
} from '../skills/multi/scripts/transport.mjs';

/** Whole-hook ceiling for the cheap events. The Stop long-poll has its own, much longer, budget. */
export const BUDGET_MS = 2500;
/** PostToolUse fires on every tool call: tighter, and no git or orca underneath it. */
export const POST_TOOL_BUDGET_MS = 700;
/** Ben's ruling: adaptive long-poll, cap 15 minutes. `MULTI_LONGPOLL_MAX_MIN=0` disables it entirely. */
export const LONGPOLL_MAX_MIN = 15;
/** Cheap: a readdir and a stat per ledger directory. Nothing spawns, nothing talks to orca. */
export const POLL_INTERVAL_MS = 3_000;
/** What the Stop handler's own timeout must be, in seconds: the cap plus room to finish. */
export const STOP_TIMEOUT_S = (LONGPOLL_MAX_MIN + 2) * 60;

export function longPollMaxMin(env = process.env) {
  const raw = env.MULTI_LONGPOLL_MAX_MIN;
  if (raw === undefined || raw === '') return LONGPOLL_MAX_MIN;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : LONGPOLL_MAX_MIN;
}

// ─────────────────────────────────────────────────────────────────────────────
// What the model reads, and what Ben reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The model's copy: the envelope lines themselves, because the id and the `Details:` path are what it
 * acts on. `maxChars` truncates each line — the full text is always in the ledger (L3).
 */
export function summarise(result, limit = 12, maxChars = 0) {
  const shown = result.notes.slice(0, limit);
  const lines = shown.map((n) => {
    const packet = n.details ? (n.packetExists ? ` (packet: ${n.packetPath})` : ` (packet MISSING: ${n.details})`) : '';
    const text = `${n.line}${packet}`;
    return `  ${maxChars > 0 && text.length > maxChars ? `${text.slice(0, maxChars)}…` : text}`;
  });
  const more = result.notes.length - shown.length;
  return [
    `${result.count} new peer note${result.count === 1 ? '' : 's'} for ${result.slug} (the multi skill; the ledger is the channel):`,
    ...lines,
    more > 0 ? `  …and ${more} more in ~/.agents/notes/ — read them with \`note-inbox --me ${result.slug}\`` : null,
    // M3: problems are the packet that never arrived, the cursor that cannot be written. They reach
    // note-inbox's stderr and nowhere else, and hook stderr on exit 0 does not reach the model.
    ...(result.problems || []).map((p) => `  ! ${p}`),
    'Read the packet before acting. ACK an ASK you take, or send BLOCKED with the reason. '
    + 'Never re-send an id someone else sent, and never wait on a peer inside this turn.',
  ].filter(Boolean).join('\n');
}

export const HUMAN_BODY_MAX = 80;
export const HUMAN_MAX_LINES = 3;

/** One note, as a human glances at it: who, to whom, what kind, and the gist. */
export function humanLine(note) {
  const parsed = parseEnvelope(String(note.line ?? '')) ?? {};
  const body = String(parsed.body ?? '').trim();
  const gist = body.length > HUMAN_BODY_MAX ? `${body.slice(0, HUMAN_BODY_MAX - 1)}…` : body;
  return `📨 ${note.from} → ${note.to} ${note.kind}${gist ? `: ${gist}` : ''}`;
}

/**
 * Ben's line, and only Ben's. Short by construction: three notes, one line each, then a count. It is
 * shown OUTSIDE the conversation (`⎿  Stop says:` / `Hook`), so it must read on its own and must never
 * be long enough to bury the reply above it.
 */
export function humanSummary(notes, max = HUMAN_MAX_LINES) {
  const list = Array.isArray(notes) ? notes : [];
  if (list.length === 0) return null;
  const lines = list.slice(0, max).map(humanLine);
  const more = list.length - lines.length;
  if (more > 0) lines.push(`+${more} more in the ledger`);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Outputs
// ─────────────────────────────────────────────────────────────────────────────

const CONTEXT_EVENTS = new Set(['UserPromptSubmit', 'PostToolUse', 'SessionStart']);

/**
 * The hook output object for an event that carries notes. Both agents accept the same three keys:
 * `hookSpecificOutput.additionalContext` for the model, `decision`/`reason` to keep a turn alive, and
 * `systemMessage` for the human (verified live on Claude Code 2.1.271 and Codex 0.154.0).
 */
export function contextOutput(event, result, { note = null, limit = 12, maxChars = 0 } = {}) {
  const text = summarise(result, limit, maxChars);
  return {
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: note ? `${text}\n${note}` : text,
    },
    systemMessage: humanSummary(result.notes),
  };
}

export function blockOutput(result, reason) {
  return {
    decision: 'block',
    reason: `${summarise(result, 6, 220)}\n\n${reason}`,
    systemMessage: humanSummary(result.notes),
  };
}

export const STOP_REASON = 'Handle these before you stop: ACK what you are taking, answer what you can, '
  + 'or send BLOCKED with the reason. If none of it is for you, say so in one line and stop.';

export const MID_TURN_NOTE = 'This arrived mid-turn. Finish the current atomic step first — a note never '
  + 'interrupts an in-flight edit.';

// ─────────────────────────────────────────────────────────────────────────────
// The long poll (D2)
// ─────────────────────────────────────────────────────────────────────────────

/** Newest mtime over the `*.md` ledgers in these directories. The poll's whole cost. */
export function ledgerPulse(dirs, fsImpl = fs) {
  let newest = 0;
  for (const dir of new Set(dirs.filter(Boolean))) {
    for (const name of safeReaddir(dir, fsImpl)) {
      if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) continue;
      try {
        const m = fsImpl.statSync(path.posix.join(toPosix(dir), name)).mtimeMs;
        if (m > newest) newest = m;
      } catch { /* raced with a writer; the next tick sees it */ }
    }
  }
  return newest;
}

/** The directories the inbox actually scanned, which is exactly where a new note can appear. */
export function scannedDirs(result) {
  return [...new Set((result?.scanned ?? []).map((f) => path.posix.dirname(toPosix(f))))];
}

const sleepDefault = (ms) => new Promise((resolve) => { const t = setTimeout(resolve, ms); t.unref?.(); });

/**
 * Wait for a peer to answer — but ONLY while this session has an ASK nobody has replied to. That is the
 * whole of Ben's ruling: a session that is owed something may park; a session that is owed nothing goes
 * idle at once, because a Stop hook that always waited would make every turn end feel broken.
 *
 * The marker on disk is what stops the flusher typing into this pane while we wait (D5), so it is
 * removed on EVERY exit path — return, throw, or a signal. A marker left behind would silence the
 * wake-ups for this slug until it expired.
 *
 * @returns {Promise<object|null>} the inbox result that ended the wait, or null on timeout
 */
export async function longPoll(ctx, result) {
  const { home, env = process.env, now = Date.now(), fsImpl = fs, inbox } = ctx;
  const slug = result.slug;
  const maxMin = ctx.maxMin ?? longPollMaxMin(env);
  if (!slug || maxMin <= 0) return null;

  const texts = (result.scanned ?? []).map((f) => readIfExists(f, fsImpl));
  const asks = outstandingAsks(texts, slug, { now });
  if (asks.length === 0) return null;

  const dirs = scannedDirs(result);
  const until = now + maxMin * 60_000;
  const marker = {
    pid: ctx.pid ?? process.pid,
    host: ctx.host ?? os.hostname(),
    handle: env.ORCA_TERMINAL_HANDLE ?? null,
    slug,
    since: new Date(now).toISOString(),
    until,
    asks: asks.map((a) => a.id),
  };
  writeListening(home, slug, marker, fsImpl);

  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
  const cleanup = () => removeListening(home, slug, fsImpl);
  const onSignal = () => { cleanup(); process.exit(0); };
  const listen = ctx.listenSignals !== false && typeof process.on === 'function';
  if (listen) for (const sig of signals) process.on(sig, onSignal);

  const sleep = ctx.sleep ?? sleepDefault;
  const clock = ctx.clock ?? (() => Date.now());
  const interval = ctx.pollMs ?? POLL_INTERVAL_MS;
  try {
    let pulse = ledgerPulse(dirs, fsImpl);
    while (clock() < until) {
      await sleep(interval);
      const next = ledgerPulse(dirs, fsImpl);
      if (next <= pulse) continue;
      pulse = next;
      // Something was appended. Only a real read can say whether it is FOR US and unseen — the mirror
      // carries every session's traffic.
      const found = await inbox(['--ack']);
      if (found && found.count > 0) return found;
    }
    return null;
  } finally {
    cleanup();
    if (listen) for (const sig of signals) process.off?.(sig, onSignal);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One event, one output object (or null for silence). `ctx.inbox(argv)` is the adapter's — it decides
 * the flags, because only the adapter knows how its slug was obtained (`--no-bind` for a guess).
 */
export async function runHookEvent(ctx) {
  const event = ctx.event;
  if (event === 'Stop') return handleStop(ctx);
  if (event === 'PostToolUse') return handlePostToolUse(ctx);
  if (CONTEXT_EVENTS.has(event) || event === '') return handleContextEvent(ctx, event || 'UserPromptSubmit');
  return null;
}

async function handleContextEvent(ctx, event) {
  const result = await ctx.inbox(['--ack']);
  if (!result || result.count === 0) return null;
  ctx.onRead?.(result);
  return contextOutput(event, result);
}

async function handlePostToolUse(ctx) {
  const result = await ctx.inbox(['--ack']);
  if (!result || result.count === 0) return null;
  ctx.onRead?.(result);
  return contextOutput('PostToolUse', result, { note: MID_TURN_NOTE, limit: 6, maxChars: 220 });
}

/**
 * Stop is where the design lives.
 *
 *   · `stop_hook_active` → NEVER wait. This is the re-fire of a stop we already blocked; waiting here is
 *     how a session never ends. Surface anything new and get out.
 *   · notes already waiting → block, exactly as before.
 *   · nothing waiting, but an ASK of mine is unanswered → park for up to 15 minutes, delivering the
 *     answer into the context the moment it lands. Ben can type meanwhile: Claude Code holds the line in
 *     the composer until the hook ends, Codex queues it.
 *   · nothing waiting and nothing owed → exit 0, silently, at once.
 */
async function handleStop(ctx) {
  // The loop guard, and it comes BEFORE the read. This is the re-fire of a stop we already blocked and
  // already acked, so there is nothing of ours left to find — and reading here would `--ack` anything
  // that arrived in the last second while the model is on its way out, retiring notes it never saw.
  // Silence costs one turn; a swallowed note costs the note. Deviation from D2's "surface anything new",
  // for that reason: the next UserPromptSubmit shows it, in the one channel the model actually reads.
  if (ctx.input?.stop_hook_active) return null;

  const result = await ctx.inbox(['--ack']);
  if (result && result.count > 0) {
    ctx.onRead?.(result);
    return blockOutput(result, STOP_REASON);
  }
  if (!result) return null;

  const found = await longPoll(ctx, result);
  if (!found || found.count === 0) return null;
  ctx.onRead?.(found);
  return blockOutput(found, STOP_REASON);
}
