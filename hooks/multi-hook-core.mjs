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
//   3. FAST, ALWAYS. PostToolUse short-circuits on an mtime check, and no event ever waits for a peer.
//      A hook that parks is a turn that will not end (the 2026-09-16 ruling; see the spec).
//   4. NEVER GUESS THE SLUG. An inbox read under the wrong slug shows one session another's notes.

import fs from 'node:fs';

import { parseEnvelope, LEDGER_ONLY_KINDS } from '../skills/multi/scripts/envelope.mjs';
import { wakeAllKindsPath, killSwitchActive } from '../skills/multi/scripts/transport.mjs';

/** Whole-hook ceiling for the cheap events. */
export const BUDGET_MS = 2500;
/** PostToolUse fires on every tool call: tighter, and no git or orca underneath it. */
export const POST_TOOL_BUDGET_MS = 700;
/**
 * The Stop handler's own timeout, in seconds, and what `hooks.json` must say for Stop.
 *
 * 0.4.0 set this to 1020 because the handler was allowed to park for fifteen minutes. It is one inbox
 * read now, so a minute is generous — and a ceiling that high is itself a hazard: a hook that CAN run
 * for seventeen minutes will eventually do it, and to whoever is watching the pane that is a hang.
 */
export const STOP_TIMEOUT_S = 60;

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

/**
 * Control characters, including ANSI escapes. A note body cannot carry a newline or a shell
 * metacharacter (the envelope grammar and `assertFieldSafe` see to that) but it CAN carry ``, and
 * this string is printed into Ben's terminal by both agents. Nothing here reaches a shell — the hook
 * spawns nothing — so this is about garbling, not execution (review MINOR 6).
 */
const CONTROL_RE = new RegExp(`[\u0000-\u001f\u007f-\u009f]`, "g");

/** One note, as a human glances at it: who, to whom, what kind, and the gist. */
export function humanLine(note) {
  const parsed = parseEnvelope(String(note.line ?? '')) ?? {};
  const body = String(parsed.body ?? '').replace(CONTROL_RE, ' ').trim();
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
 * How many notes each event RENDERS — and therefore how many it may ack (review MINOR 4).
 *
 * The two numbers have to be the same one. `summarise` prints the first N lines and then "…and M more
 * — read them with `note-inbox --me <slug>`", but the ack advances the CURSOR, and note-inbox has no
 * flag that ignores it: a note acked without being printed is unreachable by the very command that
 * sentence recommends, and note-flush then retires its wake-up as "already read". The lines survive in
 * the ledger files, so it degrades a read rather than losing a note — but a backlog of seven at one
 * Stop was enough to trigger it. Now the remainder stays unseen and arrives on the next event.
 */
export const CONTEXT_LIMIT = 12;
export const STOP_LIMIT = 6;
export const POST_TOOL_LIMIT = 6;

/**
 * The hook output object for an event that carries notes. Both agents accept the same three keys:
 * `hookSpecificOutput.additionalContext` for the model, `decision`/`reason` to keep a turn alive, and
 * `systemMessage` for the human (verified live on Claude Code 2.1.271 and Codex 0.154.0).
 */
export function contextOutput(event, result, { note = null, limit = CONTEXT_LIMIT, maxChars = 0 } = {}) {
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

export function blockOutput(result, reason, limit = STOP_LIMIT) {
  return {
    decision: 'block',
    reason: `${summarise(result, limit, 220)}\n\n${reason}`,
    systemMessage: humanSummary(result.notes),
  };
}

export const STOP_REASON = 'Handle these before you stop: ACK what you are taking, answer what you can, '
  + 'or send BLOCKED with the reason. If none of it is for you, say so in one line and stop.';

export const MID_TURN_NOTE = 'This arrived mid-turn. Finish the current atomic step first — a note never '
  + 'interrupts an in-flight edit.';

/**
 * Write one JSON object to stdout and RESOLVE WHEN IT IS FLUSHED. On Windows a pipe write is
 * asynchronous, and `process.exit` does not flush it — a Stop reason is 1-2 KB, more than a pipe takes
 * in one go, so exiting straight after the write can hand the agent truncated JSON and lose the whole
 * delivery (review MAJOR 4). Ben's primary box is the Windows one; the smoke that proved this path ran
 * on Linux, where the same write is synchronous.
 */
export function writeJson(object, stream = process.stdout) {
  return new Promise((resolve) => {
    try {
      stream.write(`${JSON.stringify(object)}
`, () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

/** Merge continuation into the existing peer result without changing the peer ACK slice. */
export function composeContinuationResult(peerResult, continuation, event) {
  if (!continuation) return peerResult;
  const peer = peerResult ? { ...peerResult, output: peerResult.output ? structuredClone(peerResult.output) : null } : null;
  const text = continuation.reason ?? continuation.context ?? null;
  if (!text) return peer ? { ...peer, continuationAfterFlush: continuation.afterFlush } : null;

  if (event === 'Stop') {
    if (peer?.output?.decision === 'block') {
      peer.output.reason = `${peer.output.reason}\n\n${text}`;
      return { ...peer, continuationAfterFlush: continuation.afterFlush };
    }
    return {
      output: { decision: 'block', reason: text },
      ackIds: [],
      continuationAfterFlush: continuation.afterFlush,
    };
  }

  if (peer?.output?.hookSpecificOutput) {
    const prior = peer.output.hookSpecificOutput.additionalContext;
    peer.output.hookSpecificOutput.additionalContext = prior ? `${prior}\n${text}` : text;
    return { ...peer, continuationAfterFlush: continuation.afterFlush };
  }
  return {
    output: {
      suppressOutput: true,
      hookSpecificOutput: { hookEventName: event, additionalContext: text },
    },
    ackIds: [],
    continuationAfterFlush: continuation.afterFlush,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One event, one output object (or null for silence). `ctx.inbox(argv)` is the adapter's — it decides
 * the flags, because only the adapter knows how its slug was obtained (`--no-bind` for a guess).
 */
/**
 * One event in, one `{ output, ackIds }` out (or null for silence).
 *
 * The two halves are separate ON PURPOSE (review MAJOR 3). The read no longer acks; the ADAPTER writes
 * the output, waits for the write to flush, and only then acks exactly the ids it printed. Anything
 * that kills the process in between — Esc on a running hook, a budget timer, a closed pane — then costs
 * a repeat, not a note. Acking inside the read meant the cursor advanced for notes nobody ever saw, and
 * the flusher's retire-on-read dropped the wake-up behind them.
 *
 * `ctx.inbox(argv)` is the adapter's: it decides the flags, because only the adapter knows how its slug
 * was obtained (`--no-bind` for a guess, `--no-repo` on the hot path).
 */
export async function runHookEvent(ctx) {
  const event = ctx.event;
  if (event === 'Stop') return handleStop(ctx);
  if (event === 'PostToolUse') return handlePostToolUse(ctx);
  if (CONTEXT_EVENTS.has(event) || event === '') return handleContextEvent(ctx, event || 'UserPromptSubmit');
  return null;
}

/**
 * The ids this output actually PRINTED — the same slice `summarise` took — so the adapter acks those
 * and nothing else. `limit` is never defaulted here on purpose: every caller states the number it
 * rendered with, so the pair cannot drift apart silently.
 */
function shown(result, limit) {
  return (result.notes ?? []).slice(0, limit).map((n) => n.id).filter(Boolean);
}

async function handleContextEvent(ctx, event) {
  const result = await ctx.inbox([]);
  if (!result || result.count === 0) return null;
  ctx.onRead?.(result);
  return { output: contextOutput(event, result, { limit: CONTEXT_LIMIT }), ackIds: shown(result, CONTEXT_LIMIT) };
}

async function handlePostToolUse(ctx) {
  const result = await ctx.inbox([]);
  if (!result || result.count === 0) return null;
  ctx.onRead?.(result);
  return {
    output: contextOutput('PostToolUse', result, { note: MID_TURN_NOTE, limit: POST_TOOL_LIMIT, maxChars: 220 }),
    ackIds: shown(result, POST_TOOL_LIMIT),
  };
}

/**
 * MINOR 11 (review 2026-09-20, measured by `stop-block-census`: 28 of 66 Stop-blocks over 7 days were
 * every-waiting-note-quiet, 39% of THOSE continuations made no tool call at all — a full-context turn
 * spent saying "not for me, stopping"). A ledger-only kind never STARTS a turn; a Stop-block that fires
 * on ACK/FYI alone does exactly that, one event later than the sender-side rule already stops it at.
 * This is the third and last enforcement site for that ONE rule; the other two are the sender's
 * `quietKind` (`note-send.mjs:247`) and the flusher's `retired-quiet-kind` retirement
 * (`note-flush.mjs:399`), all three importing the same `LEDGER_ONLY_KINDS` from `envelope.mjs` — none
 * keeps its own list. (`note-flush.mjs`'s `UNKNOWN_RECIPIENT_KINDS` is a DIFFERENT rule — which kinds
 * earn the early unknown-recipient dead-letter, ASK/BLOCKED but not RESULT — and must not be merged
 * with this one.)
 *
 * True (block) when at least one waiting note is not ledger-only. Fails toward blocking — the old,
 * pre-2026-09-20 behaviour — in both uncertain cases: the kill-switch file present OR unreadable
 * (`killSwitchActive`'s own fail-open already means "yes" here, since THIS switch's presence restores
 * "everyone wakes"), and a note whose kind did not parse (`undefined` is not in `LEDGER_ONLY_KINDS`, so
 * it is loud by construction — no separate check needed).
 */
function hasLoudNote(result, home, fsImpl) {
  if (killSwitchActive(fsImpl, wakeAllKindsPath(home))) return true;
  return (result.notes ?? []).some((n) => !LEDGER_ONLY_KINDS.has(n?.kind));
}

/**
 * Stop, after the 2026-09-16 ruling: surface what is already there, then get out of the way.
 *
 *   · `stop_hook_active` → silent. This is the re-fire of a stop we already blocked.
 *   · loud notes waiting (MINOR 11: at least one is not ACK/FYI) → block, so they are handled before
 *     the turn ends. MIXED still blocks once and still surfaces everything, exactly as before.
 *   · only ledger-only notes waiting → silent, same as nothing waiting. They already reached the model
 *     mid-turn if this turn ran any tool call or prompt (handleContextEvent/handlePostToolUse, both
 *     unchanged); this Stop does not read them a second time to say so. Nothing is acked and nothing is
 *     marked seen — `ctx.onRead`/the cursor only move on the branch below — so they surface again,
 *     unchanged, at the next UserPromptSubmit/PostToolUse/SessionStart exactly as they would today.
 *   · nothing waiting at all → exit 0, silently, at once. ALWAYS, whatever this session is owed.
 *
 * No new read for the kind check: `result.notes[i].kind` already comes back from the SAME `ctx.inbox([])`
 * call this function always made, so seeing kinds costs nothing extra. The kill-switch check is one
 * `fs.existsSync`, and only runs once a note is already waiting — a Stop with nothing waiting never
 * reaches it, so it stays silent and instant exactly as before.
 *
 * 0.4.0 parked here for up to fifteen minutes while this session had an unanswered ASK, and it was the
 * wrong architecture. The live failure: `infra` asked a peer something; the peer ACKed and later sent
 * its RESULT under a NEW id rather than ` re <id>`, so nothing ever closed the ask — and infra then
 * parked fifteen minutes at the end of EVERY turn for a day, including the turns Ben was driving. The
 * delivery path that works needs no waiting at all: hooks surface notes during a turn, and an idle pane
 * is nudged by note-flush's typing path within a minute.
 */
async function handleStop(ctx) {
  // The loop guard, and it comes BEFORE the read. This is the re-fire of a stop we already blocked and
  // already acked, so there is nothing of ours left to find — and reading here would ack anything that
  // arrived in the last second while the model is on its way out, retiring notes it never saw. Silence
  // costs one turn; a swallowed note costs the note. Deviation from D2's "surface anything new", for
  // that reason: the next UserPromptSubmit shows it, in the one channel the model actually reads.
  if (ctx.input?.stop_hook_active) return null;

  const result = await ctx.inbox([]);
  if (!result || result.count === 0) return null;
  if (!hasLoudNote(result, ctx.home, ctx.fsImpl ?? fs)) return null;
  ctx.onRead?.(result);
  return { output: blockOutput(result, STOP_REASON, STOP_LIMIT), ackIds: shown(result, STOP_LIMIT) };
}
