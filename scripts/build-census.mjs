#!/usr/bin/env node
// build-census — turn/token census over one lead transcript (a Claude Code session
// .jsonl) plus its subagent .output/.jsonl transcripts, for measuring one loop-build run
// against another (spec.md L-C9, and the census-complete spec's Territory C1).
//
// THE DE-DUPLICATION FIX, the whole point of this file: Claude Code re-emits the SAME
// logical assistant turn as several JSONL lines — one per `apiBlockIndex` — all sharing
// one `requestId` (and one `message.id`), each repeating the same `input_tokens`/
// `cache_read_input_tokens` while `output_tokens` grows across the lines; only the LAST
// line for a given id holds the true final counts. Naive per-line summing over-counted
// the dominant token category by ~1.8x on a real 813-line transcript. Every id is kept in
// a bounded `Map<id, entry>`, OVERWRITTEN on every repeat (last-line-wins) — this is a map
// keyed by id, not a buffer of raw lines, so streaming stays bounded. A "turn" (in the
// `totalTurns`/`windowTurns` sense) is one map entry (`Map.size`), counted once the stream
// ends, never a per-line increment.
//
// LEADTURNS, a SEPARATE, conversational notion of "turn" (census-complete spec, item 3):
// the number of maximal runs of consecutive assistant messages, where a run is broken only
// by a user message that is NOT a pure tool_result (a task notification is a plain user
// message and DOES break a run; a tool_result-only user message does not). This is counted
// over raw lines in file order, independently of the requestId/message.id de-dup above —
// one API request split across 3 JSONL lines is still just part of ONE run, whether or not
// it also happens to be one deduped "turn" by the de-dup definition. See docs/census.md
// for the pinned one-sentence definition. `leadTurns` is windowed by --marker exactly like
// windowById is; `leadTurnsTotal` is the same count over the whole file regardless.
//
// ROLES (item 2): a subagent file's role comes from the Workflow tool's own
// `journal.jsonl` (its real output file, at `subagents/workflows/<runId>/journal.jsonl`,
// one line per agent carrying at least `{"agentId":"<id>","label":"<label>"}`, `<id>`
// being the file's basename with a leading `agent-` and its extension stripped) when that
// journal has a matching entry — role is the label's segment before its first `:`
// (`build:T1:r2` -> `build`, `seam` -> `seam`). Failing that, `--role-map <json>` maps the
// file's bare basename (`agent-<id>` OR the bare id with no prefix — a real
// `tasks/<id>.output` file's own basename has no `agent-` prefix at all) directly to a
// role string, verbatim. Failing both, the file is `unassigned` — never silently folded
// into another role.
//
// MULTI-DIR / DEFAULT GLOB (item 1): `--tasks <dir>` may be repeated; every file across
// every given dir is counted, each exactly once — de-duped by BOTH its resolved real path
// AND its filesystem inode, so the same dir given twice, a symlink aliasing another
// counted file, or Claude Code's own `tasks/<id>.output` (a HARDLINK to
// `subagents/agent-<id>.jsonl` — two distinct real paths, one inode, which real-path
// de-dup alone cannot see) never double-counts. When `--lead <session.jsonl>` is given,
// the script ALSO globs `<dirname of lead>/<lead session id>/subagents/agent-*.jsonl` (the
// lead's own Task-tool subagents) AND one directory per Workflow run under
// `.../subagents/workflows/<runId>/agent-*.jsonl` (a loop build's builders, reviewers and
// integrator) — without needing a flag. Unlike an explicitly-given `--tasks` dir
// (unreadable is an error, never a silent zero), a MISSING default dir is normal (most
// lead sessions spawn no subagents, or Task-tool subagents only) and contributes zero
// files without complaint.
//
// SECRECY, load-bearing: this tool never prints `message.content` (or any other transcript
// text). It tests membership of `--marker` inside a parsed line via `containsMarkerDeep`,
// which returns only a boolean and never the matched string; and (lane 38) it matches the
// plugin's own wake / Stop-block marker strings (classifyWake, classifyStopBlock), keeping
// only a kind and a recipient slug from them, never the text. Output is numbers, model
// names, role names, slugs, ledger ids, and file paths only.
//
// node --test scripts/build-census.test.mjs

import fs, { realpathSync } from 'node:fs';
import path from 'node:path';
import { lfLines } from './jsonl-lines.mjs';
import { fileURLToPath } from 'node:url';

import { collectLedgerEntries, countStallNudges } from './four-read.mjs';
import { parseRecord } from './work-record.mjs';
import { pathEscapesRoot } from './path-safety.mjs';
import { TOKEN_DEFINITION, processedTokenTotal, computeCodexActivity } from './census-measures.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Usage aggregation
// ─────────────────────────────────────────────────────────────────────────────

function newAgg() {
  return { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
}

function addUsage(agg, usage) {
  if (!usage) return;
  agg.input_tokens += usage.input_tokens || 0;
  agg.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
  agg.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
  agg.output_tokens += usage.output_tokens || 0;
}

function addAggInto(target, a) {
  target.input_tokens += a.input_tokens;
  target.cache_creation_input_tokens += a.cache_creation_input_tokens;
  target.cache_read_input_tokens += a.cache_read_input_tokens;
  target.output_tokens += a.output_tokens;
}

// Sum, by model, the LAST-seen entry for every id in a dedup map.
function aggByModel(idMap) {
  const byModel = {};
  for (const entry of idMap.values()) {
    const model = entry.model || 'unknown';
    if (!byModel[model]) byModel[model] = newAgg();
    addUsage(byModel[model], entry.usage);
  }
  return byModel;
}

function mergeAggInto(target, source) {
  for (const [model, a] of Object.entries(source)) {
    if (!target[model]) target[model] = newAgg();
    addAggInto(target[model], a);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Marker search — bounded depth/width, returns a boolean only, never the matched text.
// ─────────────────────────────────────────────────────────────────────────────

function containsMarkerDeep(value, marker, depth = 0) {
  if (depth > 8 || value == null) return false;
  if (typeof value === 'string') return value.includes(marker);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length && i < 50; i++) {
      if (containsMarkerDeep(value[i], marker, depth + 1)) return true;
    }
    return false;
  }
  if (typeof value === 'object') {
    for (const k of Object.keys(value)) {
      if (containsMarkerDeep(value[k], marker, depth + 1)) return true;
    }
    return false;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// leadTurns — a maximal run of consecutive assistant messages, broken by any user
// message that is NOT purely tool_result content (a task notification is plain-content
// and DOES break a run; a tool_result-only user message does not).
// ─────────────────────────────────────────────────────────────────────────────

function isToolResultOnlyUser(obj) {
  const content = obj.message && obj.message.content;
  if (!Array.isArray(content)) return false; // a string/notification body is a real user turn
  return content.length > 0 && content.every((c) => c && c.type === 'tool_result');
}

// ─────────────────────────────────────────────────────────────────────────────
// Wakes, Stop-blocks (census-completeness, lane 38). Read-only over the lead transcript: each
// classifier below answers a kind / a slug / null and the text it looked at is never kept or printed.
// The marker strings are the plugin's own; see docs/census.md "Wakes, Stop-blocks, stall nudges"
// for each marker with its producing file:line.
// ─────────────────────────────────────────────────────────────────────────────

/** Claude Code's own prefix on a peer turn; the envelope line the plugin wrote follows it. */
export const WAKE_PREFIX = 'Another Claude session sent a message:';
/**
 * The plugin's envelope line (skills/multi/scripts/envelope.mjs ENVELOPE_RE, without the tail groups).
 * Group 4 (lane 51, M4) captures the envelope's own kind — ASK/ACK/RESULT/BLOCKED/FYI — so a wake can
 * be told apart by kind (the W1b coalescable simulation holds RESULT only); group 5 is the body.
 */
const ENVELOPE_LINE_RE = /^([a-z0-9-]+) → ([a-z0-9-]+), \d{1,2}\.\d{1,2}\.\d{2} \d{2}:\d{2} [A-Z]{2,5} \[([a-z0-9-]+-\d+)(?: re [a-z0-9-]+-\d+)?(?: supersedes [a-z0-9-]+-\d+)?\] (ASK|ACK|RESULT|BLOCKED|FYI): (.+)$/u;
/** Lane 51 (M4): the fixed hold used by W1b's coalescable simulation, in minutes. */
export const WAKE_SPLIT_HOLD_MINUTES = 10;
/** The decisions pickup's note (decisions-pickup.mjs sendInputs): id `<from>-decisions-<64 hex>-<round>`. */
const DONE_TICK_ID_RE = /^[a-z0-9-]+-decisions-[0-9a-f]{64}-\d+$/;
const DONE_TICK_BODY_RE = /^Owner decisions pickup round \d+ is ready\./;
/** hooks/multi-hook-core.mjs STOP_REASON, verbatim (a test pins it to the hook's own export). */
export const STOP_BLOCK_REASON = 'Handle these before you stop: ACK what you are taking, answer what you can, '
  + 'or send BLOCKED with the reason. If none of it is for you, say so in one line and stop.';
export const STOP_FEEDBACK_PREFIX = 'Stop hook feedback:\n';
const PEER_HEADER_RE = /\d+ new peer notes? for ([a-z0-9-]+) \(the multi skill; the ledger is the channel\):/;

function userText(obj) {
  const content = obj.message && obj.message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n');
  return '';
}

/**
 * A wake: a top-level user turn that opens with the peer prefix and then the plugin's envelope line,
 * delivered by note-flush (origin `{kind:'peer', from:'note-flush'}` when the transcript records one).
 * Returns null, or `{ to, kind, doneTick }` — `kind` (lane 51, M4) is the envelope's own ASK/ACK/
 * RESULT/BLOCKED/FYI, read off `ENVELOPE_LINE_RE`'s group 4. Text that merely quotes an envelope
 * mid-message never matches: the prefix must be the first thing in the turn.
 */
export function classifyWake(obj) {
  if (!obj || obj.type !== 'user' || isToolResultOnlyUser(obj)) return null;
  const origin = obj.origin;
  if (origin && typeof origin === 'object' && !(origin.kind === 'peer' && origin.from === 'note-flush')) return null;
  const text = userText(obj);
  if (!text.startsWith(WAKE_PREFIX)) return null;
  const rest = text.slice(WAKE_PREFIX.length);
  const nl = /^[ \t]*\r?\n/.exec(rest);
  if (!nl) return null;
  const line = rest.slice(nl[0].length).split(/\r?\n/, 1)[0].trim();
  const m = ENVELOPE_LINE_RE.exec(line);
  if (!m) return null;
  return { to: m[2], kind: m[4], doneTick: DONE_TICK_ID_RE.test(m[3]) && DONE_TICK_BODY_RE.test(m[5]) };
}

/**
 * A Stop-block, in either of the two records Claude Code keeps of one: the `hook_blocking_error`
 * attachment for the Stop event, or the meta user turn that opens with `Stop hook feedback:`. Both
 * must carry the multi-inbox STOP reason sentence. Returns null, or `{ form, slug }`.
 */
export function classifyStopBlock(obj) {
  if (!obj) return null;
  let reason = null;
  let form = null;
  if (obj.type === 'attachment' && obj.attachment && obj.attachment.type === 'hook_blocking_error' && obj.attachment.hookEvent === 'Stop') {
    const be = obj.attachment.blockingError;
    reason = be && typeof be === 'object' ? be.blockingError : be;
    const command = be && typeof be === 'object' ? be.command : null;
    if (typeof command === 'string' && !command.includes('multi-inbox')) return null;
    form = 'attachment';
  } else if (obj.type === 'user' && !isToolResultOnlyUser(obj)) {
    const text = userText(obj);
    if (text.startsWith(STOP_FEEDBACK_PREFIX)) { reason = text; form = 'feedback'; }
  }
  if (typeof reason !== 'string' || !reason.includes(STOP_BLOCK_REASON)) return null;
  const m = PEER_HEADER_RE.exec(reason);
  return { form, slug: m ? m[1] : null };
}

/**
 * A Codex wake. `codex queue` (inbox-codex.mjs) starts the queued note as its own turn, and the rollout
 * records that as a `response_item` whose payload is a `message` with role `user` and ONE `input_text`
 * part holding exactly one plugin envelope line, with no prefix (read on a live rollout that received a
 * queued note: 01a0dab2-065e-7a31-bff4-9aecfe1fa833, 2026-09-25T22:32:53Z). Returns null, or
 * `{ to, kind, doneTick }` (`kind`, lane 51 M4, is the envelope's own ASK/ACK/RESULT/BLOCKED/FYI). A
 * typed prompt, a multi-line message and the `item_completed` echo of the same turn never match; a
 * developer-role hook context ("N new peer note(s) for <slug>") is not a wake.
 */
export function classifyCodexWake(obj) {
  if (!obj || obj.type !== 'response_item') return null;
  const p = obj.payload;
  if (!p || p.type !== 'message' || p.role !== 'user' || !Array.isArray(p.content) || p.content.length !== 1) return null;
  const part = p.content[0];
  if (!part || part.type !== 'input_text' || typeof part.text !== 'string') return null;
  const text = part.text.trim();
  if (text.includes('\n')) return null;
  const m = ENVELOPE_LINE_RE.exec(text);
  if (!m) return null;
  return { to: m[2], kind: m[4], doneTick: DONE_TICK_ID_RE.test(m[3]) && DONE_TICK_BODY_RE.test(m[5]) };
}

/**
 * A Codex Stop-hook block. When the multi-inbox Stop hook refuses a stop, Codex records the hook's output as
 * an `event_msg` / `item_completed` whose `item.type` is `HookPrompt`; each fragment carries the hook's text
 * and a `hookRunId` that starts with the event, `stop:`. (Read live: rollout 01a0df4c-2809-7520-b1d7-876cc51a87ee,
 * 2026-09-28T03:56:33Z. The same block also appears once as a `<hook_prompt hook_run_id="stop:...">` user
 * message; that form is not counted, or each block would count twice.) Another Stop hook uses the same item
 * shape ("Continuation accounting ..."), so a block is counted only when the fragment text holds the multi-inbox
 * reason sentence. The sentence in tool output (CommandExecution, custom_tool_call_output) is another item type
 * and never matches. Returns null or `{ slug }`.
 */
export function classifyCodexStopBlock(obj) {
  if (!obj || obj.type !== 'event_msg') return null;
  const p = obj.payload;
  if (!p || p.type !== 'item_completed' || !p.item || p.item.type !== 'HookPrompt' || !Array.isArray(p.item.fragments)) return null;
  for (const f of p.item.fragments) {
    if (!f || typeof f.hookRunId !== 'string' || !f.hookRunId.startsWith('stop:')) continue;
    if (typeof f.text !== 'string' || !f.text.includes(STOP_BLOCK_REASON)) continue;
    const m = PEER_HEADER_RE.exec(f.text);
    return { slug: m ? m[1] : null };
  }
  return null;
}

/** The slug a Codex developer-role hook context addresses. */
function codexHookContextSlug(obj) {
  if (!obj || obj.type !== 'response_item' || !obj.payload || obj.payload.type !== 'message' || obj.payload.role !== 'developer') return null;
  for (const part of Array.isArray(obj.payload.content) ? obj.payload.content : []) {
    if (!part || typeof part.text !== 'string') continue;
    const m = PEER_HEADER_RE.exec(part.text);
    if (m) return m[1];
  }
  return null;
}

/** The slug a UserPromptSubmit / PostToolUse hook context addresses ("N new peer note(s) for <slug> ..."). */
function hookContextSlug(obj) {
  if (!obj || obj.type !== 'attachment' || !obj.attachment || obj.attachment.type !== 'hook_additional_context') return null;
  const content = obj.attachment.content;
  for (const c of Array.isArray(content) ? content : [content]) {
    if (typeof c !== 'string') continue;
    const m = PEER_HEADER_RE.exec(c);
    if (m) return m[1];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming line readers — never buffer a whole file.
// ─────────────────────────────────────────────────────────────────────────────

async function openLines(fsImpl, filePath) {
  const stream = fsImpl.createReadStream(filePath, { encoding: 'utf8' });
  return lfLines(stream);
}

// Resolve the canonical id for one line and store it (last-line-wins) into idMap.
// aliasByMsgId records, once a line carries BOTH a requestId and a message.id, that the
// message.id belongs to that requestId — so a line that later (or earlier, in file
// position) carries the SAME message.id but no requestId of its own resolves to the same
// canonical `req:` key instead of splitting into a second turn (a mixed-id-presence line
// pair would otherwise double-count the one logical turn L-C9 exists to collapse).
function resolveAndStore(idMap, aliasByMsgId, obj, uniqueCounter, entry) {
  const requestId = obj.requestId || null;
  const msgId = (obj.message && obj.message.id) || null;
  let canonicalKey;
  if (requestId && msgId) {
    canonicalKey = `req:${requestId}`;
    if (!aliasByMsgId.has(msgId)) aliasByMsgId.set(msgId, canonicalKey);
    // Migrate an entry that was filed under the bare msg: key before the alias was known
    // (the message.id-only line arrived first in the stream).
    const priorMsgKey = `msg:${msgId}`;
    if (idMap.has(priorMsgKey)) idMap.delete(priorMsgKey);
  } else if (requestId) {
    canonicalKey = `req:${requestId}`;
  } else if (msgId) {
    canonicalKey = aliasByMsgId.get(msgId) || `msg:${msgId}`;
  } else {
    canonicalKey = `line:${uniqueCounter.n++}`;
  }
  idMap.set(canonicalKey, entry); // last-line-wins
  return canonicalKey; // lane 51 (M4): callers tracking a run's first deduped request need this key
}

/**
 * Census one lead transcript file. Returns:
 *   { totalById: Map<id, {model, usage, ts}>, windowById: Map (same shape; === totalById
 *     entries filtered to the marker window, or the whole-file map when no marker is
 *     given), windowStartAt, firstAt, lastAt, leadTurns, leadTurnsTotal }
 * De-dup ("last line wins") is applied independently to the total map and the window map,
 * since a request can straddle the marker boundary (spec.md L-C9).
 * `leadTurns` (census-complete spec item 3) is counted over the SAME single pass, over raw
 * lines, independently of the id de-dup above — see docs/census.md for its definition.
 * `leadTurns` is windowed by --marker exactly like windowById is (0 before the window
 * starts); `leadTurnsTotal` is the same count over the WHOLE file regardless of --marker —
 * they're equal whenever no --marker is given.
 */
// --from/--to (four-read spec.md Territory R1, item 3): a second, independent windowing
// mode alongside --marker — narrows counted assistant messages to a plain ISO timestamp
// range instead of a marker match. Mutually exclusive with --marker (ambiguous otherwise).
// A window covering the whole fixture is required to equal the unwindowed run (pinned by
// test): windowStartAt still lands on the first in-range timestamp, exactly as the no-
// window case falls back to firstAt below.
export async function censusLeadFile(filePath, { fsImpl = fs, marker, from, to } = {}) {
  if (marker && (from || to)) throw new Error('--marker and --from/--to are mutually exclusive');
  const fromMs = from ? Date.parse(from) : NaN;
  const toMs = to ? Date.parse(to) : NaN;
  if (from && Number.isNaN(fromMs)) throw new Error(`--from is not a valid date: ${from}`);
  if (to && Number.isNaN(toMs)) throw new Error(`--to is not a valid date: ${to}`);
  if (from && to && fromMs > toMs) throw new Error('--from is after --to'); // MINOR 3
  const windowed = Boolean(marker || from || to);
  const rl = await openLines(fsImpl, filePath);
  const totalById = new Map();
  const totalAlias = new Map();
  const windowById = windowed ? new Map() : totalById; // no window: window == whole file
  const windowAlias = windowed ? new Map() : totalAlias;
  const uniqueCounter = { n: 0 };

  let windowStarted = !marker && !from;
  let windowEnded = false; // only --to can end a window once started
  let windowStartAt = null;
  let windowLastAt = null;
  let firstAt = null;
  let lastAt = null;

  let leadTurns = 0; // runs inside the window (== whole file when unwindowed)
  let leadTurnsTotal = 0; // runs in the whole file, always, regardless of windowing
  let inRun = false;
  let inWindowRun = false;

  // Lane 51 (m2): a wake line sets a pending flag; the next assistant line that starts a
  // (windowed) run tags that run wake-opened and clears the flag; a Stop-block feedback
  // line does the same for `stopBlock`; any other run is `other`. Only windowed runs are
  // tagged — the split (W1) is a window-only measure.
  let pendingTag = null; // 'wake' | 'stopBlock' | null, decided by the LAST qualifying top-level user line
  let pendingWakeAt = null; // that line's own timestamp, when pendingTag === 'wake'
  let pendingWakeKind = null;
  let pendingWakeDoneTick = false;
  let currentRunTag = null; // the tag of the CURRENTLY OPEN windowed run
  let currentRunWakeRecord = null; // set only while currentRunTag === 'wake'; see wakeRunRecords below
  let wakeTurns = 0;
  let stopBlockTurns = 0;
  let otherTurns = 0;
  // One record per wake-opened windowed run, built up as its own deduped id map (last-line-
  // wins, same shape as totalById/windowById) so the W1b coalescable simulation (M4) can read
  // both a run's full usage (the upper bound) and its FIRST deduped request alone (the lower
  // bound) without re-deriving dedup semantics.
  const wakeRunRecords = [];
  const wakeRunAliasCounter = { n: 0 };
  // MINOR 3 (R1): a RESULT, non-Done-tick wake LINE that lands before the window starts must be
  // able to start a wave even though its own run (if any) never becomes a wakeRunRecords entry
  // (that list is windowed-runs-only). Recorded only while the window has not started, so a line
  // after a --to end is never one of them (R2).
  const preWindowResultAts = [];

  const wakes = { window: 0, windowDoneTick: 0, total: 0 };
  const stops = { window: { attachment: 0, feedback: 0 }, total: { attachment: 0, feedback: 0 } };
  const slugVotes = new Map();
  const vote = (slug) => { if (slug) slugVotes.set(slug, (slugVotes.get(slug) || 0) + 1); };

  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (obj.timestamp) {
      if (!firstAt) firstAt = obj.timestamp;
      lastAt = obj.timestamp;
    }

    if (marker && !windowStarted && containsMarkerDeep(obj, marker)) {
      windowStarted = true;
      windowStartAt = obj.timestamp || lastAt;
    }
    if (from && !windowStarted && obj.timestamp && Date.parse(obj.timestamp) >= fromMs) {
      windowStarted = true;
      windowStartAt = obj.timestamp;
    }
    if (to && !windowEnded && obj.timestamp && Date.parse(obj.timestamp) > toMs) windowEnded = true;
    const inWindowNow = windowStarted && !windowEnded;
    // MAJOR 6 (R1 fix round 1): a --to window's own last in-window timestamp, not the
    // whole file's, so wallClockHours/windowEndAt don't run past a --to cutoff.
    if (inWindowNow && obj.timestamp) windowLastAt = obj.timestamp;

    const wake = classifyWake(obj);
    if (wake) {
      wakes.total += 1;
      if (inWindowNow) { wakes.window += 1; if (wake.doneTick) wakes.windowDoneTick += 1; }
      vote(wake.to);
    }
    const stop = classifyStopBlock(obj);
    if (stop) {
      stops.total[stop.form] += 1;
      if (inWindowNow) stops.window[stop.form] += 1;
      vote(stop.slug);
    }
    vote(hookContextSlug(obj));

    if (obj.type === 'assistant') {
      if (!inRun) {
        leadTurnsTotal += 1;
        inRun = true;
      }
      // A windowed leadTurns must be windowed too — otherwise a persistent lead pane (one
      // session across several builds) reports the WHOLE session's run count as if it
      // were this build's, the same "unknown rendered as a confident number" failure this
      // fix's sibling (the subagent window filter, below in runCensus) also guards
      // against. Unwindowed, windowStarted is true from the first line and windowEnded
      // never fires, so leadTurns === leadTurnsTotal, unchanged from before this fix.
      if (inWindowNow && !inWindowRun) {
        leadTurns += 1;
        inWindowRun = true;
        // Lane 51 (m2): this run opens now — consume whatever pending tag the last
        // qualifying user line left, then clear it so a later run starts fresh as `other`.
        currentRunTag = pendingTag || 'other';
        if (currentRunTag === 'wake') {
          wakeTurns += 1;
          currentRunWakeRecord = {
            at: pendingWakeAt, kind: pendingWakeKind, doneTick: pendingWakeDoneTick,
            ids: new Map(), aliasByMsgId: new Map(), firstKey: null,
          };
          wakeRunRecords.push(currentRunWakeRecord);
        } else {
          currentRunWakeRecord = null;
          if (currentRunTag === 'stopBlock') stopBlockTurns += 1;
          else otherTurns += 1;
        }
        pendingTag = null;
        pendingWakeAt = null;
        pendingWakeKind = null;
        pendingWakeDoneTick = false;
      }
    } else if (obj.type === 'user') {
      if (!isToolResultOnlyUser(obj)) {
        inRun = false;
        inWindowRun = false;
        // Lane 51 (m2): recompute the pending tag fresh off THIS line — a wake wins, else
        // a Stop-block feedback line, else this line clears any stale pending tag (an
        // ordinary human message between a wake and the next run means that run is
        // `other`, not wake-opened).
        if (wake) {
          if (!windowStarted && wake.kind === 'RESULT' && !wake.doneTick) {
            preWindowResultAts.push(obj.timestamp || lastAt);
          }
          pendingTag = 'wake';
          pendingWakeAt = obj.timestamp || lastAt;
          pendingWakeKind = wake.kind;
          pendingWakeDoneTick = Boolean(wake.doneTick);
        } else if (stop && stop.form === 'feedback') {
          pendingTag = 'stopBlock';
          pendingWakeAt = null;
          pendingWakeKind = null;
          pendingWakeDoneTick = false;
        } else {
          pendingTag = null;
          pendingWakeAt = null;
          pendingWakeKind = null;
          pendingWakeDoneTick = false;
        }
      }
      // a tool_result-only user line is transparent: the run continues through it.
    }

    if (obj.type !== 'assistant' || !obj.message || !obj.message.usage) continue;

    const entry = {
      model: obj.message.model || 'unknown', usage: obj.message.usage, ts: obj.timestamp || lastAt,
      bucket: inWindowNow ? currentRunTag : null, // lane 51 (m2): 'wake' | 'stopBlock' | 'other' | null (outside window)
    };
    resolveAndStore(totalById, totalAlias, obj, uniqueCounter, entry);
    if (windowed && inWindowNow) resolveAndStore(windowById, windowAlias, obj, uniqueCounter, entry);
    if (inWindowNow && currentRunWakeRecord) {
      const key = resolveAndStore(currentRunWakeRecord.ids, currentRunWakeRecord.aliasByMsgId, obj, wakeRunAliasCounter, entry);
      if (currentRunWakeRecord.firstKey === null) currentRunWakeRecord.firstKey = key;
    }
  }

  if (!marker && !from) windowStartAt = firstAt; // unwindowed or --to-only: window starts at the file's start (MAJOR 2, r2)

  // Lane 51 (m2/M4): split windowById by the run tag each entry carried, then simulate the
  // W1b hold over the wake-opened runs. `wakeById`/`stopBlockById`/`otherById` partition
  // windowById exactly (every windowed entry has a bucket), so byModel columns sum back to
  // windowByModel per model — the invariant W2 pins.
  const wakeById = new Map();
  const stopBlockById = new Map();
  const otherById = new Map();
  for (const [key, entry] of windowById) {
    if (entry.bucket === 'wake') wakeById.set(key, entry);
    else if (entry.bucket === 'stopBlock') stopBlockById.set(key, entry);
    else otherById.set(key, entry); // 'other', or a stray unset bucket (defensive: never expected)
  }
  const wakeSplitByModel = { wake: aggByModel(wakeById), stopBlock: aggByModel(stopBlockById), other: aggByModel(otherById) };

  // W1b (M4): only RESULT wakes that are not the Done-tick are coalescable. In wake-line
  // timestamp order, a wave starts at its first wake and absorbs every later one arriving
  // less than WAKE_SPLIT_HOLD_MINUTES after the wave's own start; `coalescableTurns` is
  // those wakes minus the waves they started.
  const holdMs = WAKE_SPLIT_HOLD_MINUTES * 60000;
  // MINOR 3 (R1): pre-window RESULT wake lines may start a wave (so an in-window RESULT less
  // than holdMs after one is coalescable, not a wave starter itself), but they are never pushed
  // into coalescableRecords — they have no in-window run of their own to attribute tokens to.
  // All of them, not only the last holdMs: waves chain, so an older line decides whether a later
  // pre-window line starts a wave (R2). A line whose own run straddles the window start is that
  // run's record already (same wake-line timestamp), so it is dropped here, or the record would
  // coalesce into the wave it started itself (R2).
  const resultRecordAtMs = new Set(wakeRunRecords
    .filter((r) => r.kind === 'RESULT' && !r.doneTick && r.at)
    .map((r) => Date.parse(r.at)));
  const preWindowEligible = preWindowResultAts
    .map((at) => Date.parse(at))
    .filter((atMs) => !Number.isNaN(atMs) && !resultRecordAtMs.has(atMs))
    .map((atMs) => ({ atMs, preWindow: true }));
  const eligible = [
    ...preWindowEligible,
    ...wakeRunRecords
      .filter((r) => r.kind === 'RESULT' && !r.doneTick && r.at && !Number.isNaN(Date.parse(r.at)))
      .map((r) => ({ ...r, atMs: Date.parse(r.at) })),
  ].sort((a, b) => a.atMs - b.atMs);
  let waveStartMs = null;
  const coalescableRecords = [];
  for (const rec of eligible) {
    if (waveStartMs === null || rec.atMs - waveStartMs >= holdMs) {
      waveStartMs = rec.atMs; // this wake starts a new wave; it is not itself coalescable
    } else if (!rec.preWindow) {
      coalescableRecords.push(rec);
    }
  }
  const upperByModel = {};
  const lowerByModel = {};
  // MINOR 4 (R1): an id a later run re-used is counted there (last line wins in windowById),
  // never here as well. The ceiling below deliberately does not use it (R2).
  const liveWindowEntries = new Set(windowById.values());
  for (const rec of coalescableRecords) {
    for (const entry of rec.ids.values()) {
      if (!liveWindowEntries.has(entry)) continue;
      if (!upperByModel[entry.model]) upperByModel[entry.model] = newAgg();
      addUsage(upperByModel[entry.model], entry.usage);
    }
    const firstEntry = rec.firstKey !== null ? rec.ids.get(rec.firstKey) : null;
    if (firstEntry && liveWindowEntries.has(firstEntry)) {
      if (!lowerByModel[firstEntry.model]) lowerByModel[firstEntry.model] = newAgg();
      addUsage(lowerByModel[firstEntry.model], firstEntry.usage);
    }
  }

  // The ceiling (M4 follow-up): every RESULT, non-Done-tick wake-opened turn. No RESULT-only hold can
  // save more than these turns, whatever its release rule (leading-edge wave, trailing debounce, or a
  // held RESULT surfaced by hooks inside a loud note's turn); the wave count above is one model of it.
  const resultRecords = wakeRunRecords.filter((r) => r.kind === 'RESULT' && !r.doneTick);
  const resultByModel = {};
  // No liveWindowEntries guard here (R2): a request first seen in a RESULT run was issued by that
  // run, so a ceiling errs high and keeps it even when a later run's line wins it in windowById.
  for (const rec of resultRecords) {
    for (const entry of rec.ids.values()) {
      if (!resultByModel[entry.model]) resultByModel[entry.model] = newAgg();
      addUsage(resultByModel[entry.model], entry.usage);
    }
  }

  return {
    totalById, windowById, markerFound: windowStarted, windowStartAt, firstAt, lastAt, leadTurns, leadTurnsTotal,
    windowLastAt: windowed ? windowLastAt : lastAt,
    // Lane 38. A Stop-block leaves two records in one transcript (see classifyStopBlock); one block is
    // counted once, as the larger of the two forms, never their sum.
    wakes: wakes.window, wakesDoneTick: wakes.windowDoneTick, wakesTotal: wakes.total,
    stopBlocks: Math.max(stops.window.attachment, stops.window.feedback),
    stopBlocksTotal: Math.max(stops.total.attachment, stops.total.feedback),
    slugVotes: [...slugVotes.entries()],
    wakeSplit: {
      wakeTurns, stopBlockTurns, otherTurns,
      byModel: wakeSplitByModel,
      coalescable: { holdMinutes: WAKE_SPLIT_HOLD_MINUTES, turns: coalescableRecords.length, upperByModel, lowerByModel, resultTurns: resultRecords.length, resultByModel },
    },
  };
}

// Codex writes one token_usage_record per response.  Its `usage` object is the
// response-local counter; `turn_token_usage` and `thread_token_usage` are cumulative
// snapshots and must never be added.  The session_meta id binds every counted record to
// the requested session, while response_id supplies the de-dup key.
const CANONICAL_CODEX_HOME = 'C:\\Users\\benzh\\AppData\\Roaming\\orca\\codex-accounts\\f22a4cc4-fb5a-4af5-aeec-4951188a536a\\home';

function codexUsage(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    throw new Error('Codex token_usage_record lacks a valid per-response usage object');
  }
  const finiteCount = (value, name, optional = false) => {
    if (value === undefined && optional) return null;
    if (!Number.isFinite(value) || value < 0) throw new Error(`Codex token_usage_record has invalid ${name}`);
    return value;
  };
  const input = finiteCount(usage.input_tokens, 'input_tokens', true);
  const cached = finiteCount(usage.cached_input_tokens, 'cached_input_tokens', true);
  const cacheWrite = finiteCount(usage.cache_write_input_tokens, 'cache_write_input_tokens', true);
  const output = finiteCount(usage.output_tokens, 'output_tokens', true);
  const reasoning = finiteCount(usage.reasoning_output_tokens, 'reasoning_output_tokens', true);
  const rawTotal = finiteCount(usage.total_tokens, 'total_tokens', true);
  if (input !== null && cached !== null && cacheWrite !== null && input < cached + cacheWrite) {
    throw new Error('Codex token_usage_record has invalid per-response usage');
  }
  const splitAvailable = input !== null && cached !== null && cacheWrite !== null;
  const unavailable = [];
  if (input === null) unavailable.push('input_tokens');
  if (cached === null) unavailable.push('cached_input_tokens');
  if (cacheWrite === null) unavailable.push('cache_write_input_tokens');
  if (!splitAvailable) unavailable.push('input_tokens (exclusive cache split)');
  if (reasoning === null) unavailable.push('reasoning_output_tokens');
  if (output === null) unavailable.push('output_tokens');
  if (rawTotal === null) unavailable.push('total_tokens');
  // Native input is inclusive of both cache categories. Keep it intact and derive the
  // native total independently. The legacy additive split is available only when both
  // cache components are known, so a known cache component can never be added twice.
  return {
    native_input_tokens: input,
    input_tokens: splitAvailable ? input - cached - cacheWrite : null,
    cache_creation_input_tokens: cacheWrite,
    cache_read_input_tokens: cached,
    output_tokens: output,
    reasoning_output_tokens: reasoning,
    total_tokens: rawTotal,
    derived_total_tokens: input === null || output === null ? null : input + output,
    unavailable,
  };
}

function codexUsageFingerprint(usage) {
  return JSON.stringify([usage.native_input_tokens, usage.cache_read_input_tokens,
    usage.cache_creation_input_tokens ?? 0, usage.output_tokens,
    usage.reasoning_output_tokens, usage.total_tokens]);
}

function newCodexAgg() {
  return {
    native_input_tokens: 0,
    input_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 0,
    derived_total_tokens: 0,
    unavailable: [],
  };
}

function addCodexUsage(target, usage) {
  const addNullable = (field) => {
    if (target[field] === null) return;
    if (usage[field] === null) target[field] = null;
    else target[field] += usage[field];
  };
  addNullable('native_input_tokens');
  addNullable('input_tokens');
  addNullable('cache_creation_input_tokens');
  addNullable('cache_read_input_tokens');
  addNullable('output_tokens');
  addNullable('reasoning_output_tokens');
  addNullable('total_tokens');
  addNullable('derived_total_tokens');
  target.unavailable = [...new Set([...target.unavailable, ...usage.unavailable])].sort();
}

function mergeCodexAgg(target, aggregate) {
  addCodexUsage(target, aggregate);
}

function codexAggByModel(idMap) {
  const byModel = {};
  for (const entry of idMap.values()) {
    const model = entry.model || 'unknown';
    if (!byModel[model]) byModel[model] = newCodexAgg();
    addCodexUsage(byModel[model], entry.usage);
  }
  return byModel;
}

function mergeCodexAggInto(target, source) {
  for (const [model, aggregate] of Object.entries(source)) {
    if (!target[model]) target[model] = newCodexAgg();
    mergeCodexAgg(target[model], aggregate);
  }
}

function isUsableCodexString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeCodexModel(value) {
  if (!isUsableCodexString(value)) return null;
  const model = value.trim();
  return model.toLowerCase() === 'unknown' ? null : model;
}

function normalizeCodexTimestamp(value) {
  if (!isUsableCodexString(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  return { milliseconds, value: new Date(milliseconds).toISOString() };
}

async function detectLeadHost(filePath, fsImpl) {
  const rl = await openLines(fsImpl, filePath);
  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj.type === 'session_meta') {
      const payload = obj.payload;
      if (!payload || !isUsableCodexString(payload.id) || !isUsableCodexString(payload.session_id) || payload.session_id !== payload.id) {
        throw new Error('Codex session_meta is malformed or lacks a verified session id');
      }
      return 'codex';
    }
    // A token record is distinctive Codex evidence even when a truncated file lost its
    // session_meta prelude. Route it to the Codex reader, which rejects missing session
    // attribution visibly rather than treating it as a zero-token Claude transcript.
    if (obj.type === 'token_usage_record' || obj.type === 'response_item' || obj.type === 'event_msg' || obj.type === 'turn_context' || obj.type === 'compacted') return 'codex';
  }
  return 'claude';
}

function codexInWindow(timestamp, markerStarted, fromMs, toMs) {
  if (!markerStarted) return false;
  if ((fromMs !== null || toMs !== null) && timestamp === null) return false;
  const value = timestamp && timestamp.milliseconds;
  if (fromMs !== null && value < fromMs) return false;
  if (toMs !== null && value > toMs) return false;
  return true;
}

function nativeTaskStarted(obj) {
  const event = obj.type === 'event_msg' ? obj.payload : obj;
  return event && event.type === 'task_started' && isUsableCodexString(event.turn_id) ? event.turn_id : null;
}

export async function censusCodexLeadFile(filePath, { fsImpl = fs, marker, from, to, rootSessionId, expectedId, child = false } = {}) {
  if (marker && (from || to)) throw new Error('--marker and --from/--to are mutually exclusive');
  const fromMs = from ? Date.parse(from) : null;
  const toMs = to ? Date.parse(to) : null;
  if (from && Number.isNaN(fromMs)) throw new Error(`--from is not a valid date: ${from}`);
  if (to && Number.isNaN(toMs)) throw new Error(`--to is not a valid date: ${to}`);
  if (fromMs !== null && toMs !== null && fromMs > toMs) throw new Error('--from is after --to');
  const rl = await openLines(fsImpl, filePath);
  const totalById = new Map();
  const windowById = marker || from || to ? new Map() : totalById;
  const totalNativeTurns = new Set();
  const windowNativeTurns = new Set();
  const responseFingerprints = new Map();
  let meta = null;
  let sawMeta = false;
  let tokenRecordCount = 0;
  let windowTokenRecordCount = 0;
  let windowStarted = !marker && fromMs === null;
  let windowStartAt = null;
  let firstAt = null;
  let lastAt = null;
  let windowLastAt = null;
  let currentModel = null;
  const unknownModels = new Set();
  const invalidResponseTimestamps = new Set();
  const conflictingResponseModels = new Set();
  const conflictingResponseTimestamps = new Set();
  const conflictingResponseTurnIds = new Set();
  const stopBlocks = { window: 0, total: 0 };
  const wakes = { window: 0, windowDoneTick: 0, total: 0 };
  const slugVotes = new Map();
  const startedTurns = new Set();
  const completedTurns = new Set();
  let invalidTaskStarted = false;
  let lastStartedTurn = null;
  let lastStartedAt = null;
  let hasRowAfterTo = false;
  let finalEvent = null;
  let finalRowCompletesTurn = false;
  // Positional child witness: the most recent task_started in file order (valid or not) clears it;
  // only a later task_complete with a usable id matching that start sets it.
  let openTurn = null;
  let latestStartCompleted = false;
  let untimedStart = false;
  let damaged = null;
  let cacheWriteTierAbsentBySchema = false;
  let previousTimestampMs = null;
  const vote = (slug) => { if (slug) slugVotes.set(slug, (slugVotes.get(slug) || 0) + 1); };

  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { damaged = 'malformed JSON row'; break; }
    const timestamp = normalizeCodexTimestamp(obj.timestamp);
    finalRowCompletesTurn = false;
    if ((fromMs !== null || toMs !== null) && !timestamp && obj.type !== 'session_meta') damaged ||= 'row has invalid or missing window timestamp';
    if (obj.type !== 'session_meta' && timestamp && previousTimestampMs !== null && timestamp.milliseconds < previousTimestampMs) damaged ||= 'non-monotonic timestamps';
    if (obj.type !== 'session_meta' && timestamp) previousTimestampMs = timestamp.milliseconds;
    if (toMs !== null && timestamp && timestamp.milliseconds > toMs) hasRowAfterTo = true;
    if (timestamp) {
      if (!firstAt) firstAt = timestamp.value;
      lastAt = timestamp.value;
    }
    if (marker && !windowStarted && obj.type !== 'session_meta' && obj.type !== 'turn_context' && containsMarkerDeep(obj, marker)) {
      windowStarted = true;
      windowStartAt = timestamp ? timestamp.value : lastAt;
    }
    if (!marker && fromMs !== null && !windowStarted && timestamp && timestamp.milliseconds >= fromMs) {
      windowStarted = true;
      windowStartAt = timestamp.value;
    }
    const inWindow = codexInWindow(timestamp, windowStarted, fromMs, toMs);
    const eventPayload = obj.type === 'event_msg' ? obj.payload : null;
    const tokenCountUsage = eventPayload && eventPayload.type === 'token_count' && eventPayload.info && eventPayload.info.total_token_usage;
    if (tokenCountUsage && Number.isFinite(tokenCountUsage.input_tokens) && Number.isFinite(tokenCountUsage.cached_input_tokens)
      && Number.isFinite(tokenCountUsage.output_tokens) && !Object.prototype.hasOwnProperty.call(tokenCountUsage, 'cache_write_input_tokens')) cacheWriteTierAbsentBySchema = true;
    if (inWindow && timestamp) windowLastAt = timestamp.value;
    if (obj.type === 'session_meta') {
      meta = obj.payload;
      if (expectedId && meta && isUsableCodexString(meta.id) && meta.id !== expectedId) {
        throw new Error(`Codex session identity mismatch: expected ${expectedId}, found ${meta.id}`);
      }
      if (sawMeta || !meta || !isUsableCodexString(meta.id) || !isUsableCodexString(meta.session_id) || (!child && meta.session_id !== meta.id)) {
        throw new Error('Codex session_meta is malformed or does not identify exactly one session');
      }
      if (rootSessionId && meta.session_id !== rootSessionId) throw new Error('Codex session_meta is outside the lead root session namespace');
      sawMeta = true;
      continue;
    }
    if (obj.type === 'turn_context') {
      const model = obj.payload && obj.payload.model;
      currentModel = normalizeCodexModel(model);
    }
    const wake = classifyCodexWake(obj);
    if (wake) {
      wakes.total += 1;
      if (inWindow) { wakes.window += 1; if (wake.doneTick) wakes.windowDoneTick += 1; }
      vote(wake.to);
    }
    vote(codexHookContextSlug(obj));
    const stop = classifyCodexStopBlock(obj);
    if (stop) {
      stopBlocks.total += 1;
      if (inWindow) stopBlocks.window += 1;
      vote(stop.slug);
    }
    const started = nativeTaskStarted(obj);
    const nativeEvent = obj.type === 'event_msg' ? obj.payload : obj;
    if (nativeEvent && nativeEvent.type === 'task_started') {
      if (!started) invalidTaskStarted = true;
      openTurn = started; latestStartCompleted = false;
      if (!timestamp) untimedStart = true;
    }
    if (started) {
      startedTurns.add(started); finalEvent = { type: 'task_started', turnId: started };
      if (timestamp && (!lastStartedAt || timestamp.milliseconds >= Date.parse(lastStartedAt))) { lastStartedAt = timestamp.value; lastStartedTurn = started; }
    }
    const completedPayload = obj.type === 'event_msg' ? obj.payload : obj;
    if (completedPayload && completedPayload.type === 'task_complete' && isUsableCodexString(completedPayload.turn_id)) {
      completedTurns.add(completedPayload.turn_id);
      finalEvent = { type: 'task_complete', turnId: completedPayload.turn_id };
      finalRowCompletesTurn = true;
      if (openTurn !== null && completedPayload.turn_id === openTurn) latestStartCompleted = true;
    }
    if (started && inWindow) windowNativeTurns.add(started);
    if (started) totalNativeTurns.add(started);
    if (obj.type !== 'token_usage_record') continue;
    tokenRecordCount += 1;
    const record = obj.payload;
    if (!sawMeta || !record || !isUsableCodexString(record.session_id) || record.session_id !== meta.session_id || (rootSessionId && record.session_id !== rootSessionId) || !isUsableCodexString(record.response_id) || !isUsableCodexString(record.turn_id)) {
      throw new Error('Codex token_usage_record lacks verified session, response, or turn attribution');
    }
    const entry = {
      model: currentModel || 'unknown',
      usage: codexUsage(record.usage),
      ts: timestamp ? timestamp.value : null,
      responseId: record.response_id,
      turnId: record.turn_id,
    };
    if (!currentModel) unknownModels.add(record.response_id);
    if (!timestamp) invalidResponseTimestamps.add(record.response_id);
    const key = `${meta.id}:response:${record.response_id}`;
    const fingerprint = codexUsageFingerprint(entry.usage);
    const seen = responseFingerprints.get(key);
    if (seen !== undefined && seen !== fingerprint) throw new Error('Codex token_usage_record repeats a response_id with conflicting usage');
    const prior = totalById.get(key);
    if (prior) {
      if (prior.model !== entry.model) { prior.model = 'unknown'; unknownModels.add(record.response_id); conflictingResponseModels.add(record.response_id); }
      if (prior.ts !== entry.ts) { prior.ts = null; invalidResponseTimestamps.add(record.response_id); conflictingResponseTimestamps.add(record.response_id); }
      if (prior.turnId !== entry.turnId) conflictingResponseTurnIds.add(record.response_id);
      if (inWindow && !windowById.has(key)) windowById.set(key, prior);
      continue;
    }
    responseFingerprints.set(key, fingerprint);
    totalById.set(key, entry);
    if (inWindow) {
      windowTokenRecordCount += 1;
      windowById.set(key, entry);
    }
  }
  if (!sawMeta) throw new Error('Codex session_meta was not found');
  if (cacheWriteTierAbsentBySchema) for (const entry of totalById.values()) {
    if (entry.usage.cache_creation_input_tokens === null) {
      entry.usage.cache_creation_input_tokens = 0;
      entry.usage.unavailable = entry.usage.unavailable.filter((name) => name !== 'cache_write_input_tokens');
      if (entry.usage.native_input_tokens !== null && entry.usage.cache_read_input_tokens !== null) {
        entry.usage.input_tokens = entry.usage.native_input_tokens - entry.usage.cache_read_input_tokens;
        entry.usage.unavailable = entry.usage.unavailable.filter((name) => name !== 'input_tokens (exclusive cache split)');
      }
    }
  }
  if (!marker && fromMs === null) windowStartAt = firstAt;
  const responseTimeline = [...windowById.values()].map((entry) => ({
    responseId: entry.responseId,
    turnId: entry.turnId,
    timestamp: entry.ts,
    model: entry.model,
  }));
  const unknownModelList = [...unknownModels].sort();
  const invalidTimestampList = [...invalidResponseTimestamps].sort();
  const responseTimelineComplete = invalidTimestampList.length === 0
    && responseTimeline.every((entry) => entry.timestamp !== null && entry.model !== 'unknown');
  return {
    totalById, windowById, markerFound: windowStarted, windowStartAt, firstAt, lastAt,
    // Codex-native user turns are unique task_started ids. They are intentionally
    // distinct from response counts because one user turn may yield several responses.
    leadTurns: totalNativeTurns.size, leadTurnsTotal: totalNativeTurns.size,
    nativeTurnCount: totalNativeTurns.size, nativeTurnCountWindow: windowNativeTurns.size,
    tokenRecordCount, windowTokenRecordCount,
    windowLastAt: (marker || fromMs !== null || toMs !== null) ? windowLastAt : lastAt,
    wakes: wakes.window, wakesDoneTick: wakes.windowDoneTick, wakesTotal: wakes.total,
    stopBlocks: stopBlocks.window, stopBlocksTotal: stopBlocks.total,
    slugVotes: [...slugVotes.entries()],
    sessionId: meta.id,
    rootSessionId: meta.session_id,
    unknownModels: unknownModelList,
    invalidResponseTimestamps: invalidTimestampList,
    responseTimeline,
    responseTimelineComplete,
    conflictingResponseModels: [...conflictingResponseModels].sort(),
    conflictingResponseTimestamps: [...conflictingResponseTimestamps].sort(),
    conflictingResponseTurnIds: [...conflictingResponseTurnIds].sort(),
    startedTurns: [...startedTurns], windowStartedTurns: [...windowNativeTurns], completedTurns: [...completedTurns], invalidTaskStarted, lastStartedTurn, lastStartedAt, hasRowAfterTo, finalEvent, finalRowCompletesTurn, latestStartCompleted, untimedStart, damaged, cacheWriteTierAbsentBySchema,
    coverageSupported: tokenRecordCount > 0 && windowTokenRecordCount > 0 && unknownModelList.length === 0 && invalidTimestampList.length === 0,
    coverageReason: tokenRecordCount === 0 ? 'no token_usage_record rows with per-response usage' : unknownModelList.length ? 'usage rows have unknown model attribution' : invalidTimestampList.length ? 'usage rows have invalid or missing response timestamps' : windowTokenRecordCount === 0 ? 'no token_usage_record rows inside the requested window' : null,
  };
}

/**
 * Census one subagent .output/.jsonl file. Same last-line-wins de-dup, independently per
 * file. Returns { byId: Map<id, {model, usage, ts}>, firstAt, lastAt }.
 */
// `collect` (lane 62, declared roles only): additionally return the count of unparsable rows, every
// sessionId the rows name, and give each entry its request/message id keys so a declared session can be
// de-duplicated against native files. Legacy callers get the original shape plus a `malformed` count.
export async function censusSubFile(filePath, { fsImpl = fs, collect = false } = {}) {
  const rl = await openLines(fsImpl, filePath);
  const byId = new Map();
  const alias = new Map();
  const uniqueCounter = { n: 0 };
  const sessionIds = new Set();
  let malformed = 0;
  let firstAt = null;
  let lastAt = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      malformed += 1;
      continue;
    }
    if (obj.timestamp) {
      if (!firstAt) firstAt = obj.timestamp;
      lastAt = obj.timestamp;
    }
    if (collect && typeof obj.sessionId === 'string') sessionIds.add(obj.sessionId);
    if (obj.type !== 'assistant' || !obj.message || !obj.message.usage) continue;
    const entry = { model: obj.message.model || 'unknown', usage: obj.message.usage, ts: obj.timestamp || lastAt };
    if (collect) entry.ids = [obj.requestId ? `req:${obj.requestId}` : null, obj.message.id ? `msg:${obj.message.id}` : null].filter(Boolean);
    resolveAndStore(byId, alias, obj, uniqueCounter, entry);
  }

  return { byId, firstAt, lastAt, malformed, sessionIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// fsImpl — real node:fs by default; pass a wrapping object in tests. readFileSync and
// realpathSync are used only for journal.jsonl reads and cross-dir real-path de-dup —
// every code path that touches them tolerates a mock fsImpl that omits them (falls back
// to "no journal" / path.resolve respectively), so existing simpler mocks never break.
// ─────────────────────────────────────────────────────────────────────────────

function realFs() {
  return {
    readdirSync: fs.readdirSync,
    statSync: fs.statSync,
    writeFileSync: fs.writeFileSync,
    createReadStream: fs.createReadStream,
    readFileSync: fs.readFileSync,
    realpathSync: fs.realpathSync,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-dir task file collection, real-path de-dup, and role resolution.
// ─────────────────────────────────────────────────────────────────────────────

function matchesPattern(f, pattern) {
  if (pattern === 'agent') return /^agent-.*\.jsonl$/.test(f);
  // journal.jsonl is metadata ABOUT the agent files in its dir, not itself an agent
  // transcript — it must never be counted as one of the files censused.
  if (f === 'journal.jsonl') return false;
  return f.endsWith('.output') || f.endsWith('.jsonl');
}

// Default specs (the lead's own subagents/, plus one per Workflow run dir under
// subagents/workflows/) come FIRST, explicit --tasks dirs (CLI order) LAST. This order is
// load-bearing for dedupeByRealPath above: on a collision (Claude Code's tasks/<id>.output
// hardlinked to subagents/agent-<id>.jsonl) it keeps the FIRST-seen copy, so a default's
// `agent-<id>.jsonl` name — the one --role-map and journal.jsonl both key off — wins over
// an explicit --tasks dir's `<id>.output` alias.
// (T1/C2 fix round, MAJOR C1): a MISSING default dir (ENOENT — no such source exists) is
// the common, legitimate case and contributes zero specs/files silently, exactly as
// before. Any OTHER error listing a default dir (EACCES, EPERM, ENOTDIR, EMFILE,
// etc.) is NOT absence — it is a source that exists but couldn't be enumerated, and
// swallowing it the same way as ENOENT would report a confident zero (and, worse, a clean
// COUNTED verdict with no warning) for agents that actually ran but weren't reachable.
// Both buildDirSpecs (the workflows/ run-directory listing) and collectTaskFiles (each
// individual default dir's own readdir) make this same ENOENT-vs-other distinction, and
// both feed their unreadable dirs into runCensus's combined `unreadableDirs` list, which
// marks the whole report INCOMPLETE — the same idiom already used for an individual
// unreadable subagent FILE, just at the directory-enumeration boundary instead.
function isAbsenceError(error) {
  return Boolean(error) && error.code === 'ENOENT';
}

function buildDirSpecs(opts, fsImpl, { includeDefaultSubagents = true } = {}) {
  const specs = [];
  const unreadableDirs = [];
  if (opts.lead && includeDefaultSubagents) {
    const leadSessionId = path.basename(opts.lead).replace(/\.jsonl$/i, '');
    const sessionDir = path.join(path.dirname(opts.lead), leadSessionId);
    const defaultDir = path.join(sessionDir, 'subagents');
    specs.push({ dir: defaultDir, isDefault: true, pattern: 'agent' });
    // The Workflow tool (a loop build's builders/reviewers/integrator) writes its agent
    // transcripts one directory PER RUN, one level below the Task-tool default above:
    // <session>/subagents/workflows/<runId>/agent-<agentId>.jsonl, with that run's own
    // journal.jsonl beside them. Without this, the default glob stops at the top level
    // and a loop build's whole by-role table comes back empty. A missing workflows/ dir
    // is the common case (most sessions never ran the Workflow tool) and contributes zero
    // specs, not an error — same idiom as the plain subagents/ default above.
    const workflowsDir = path.join(defaultDir, 'workflows');
    try {
      const entries = fsImpl.readdirSync(workflowsDir, { withFileTypes: true });
      for (const e of entries) {
        const isDir = typeof e.isDirectory === 'function' ? e.isDirectory() : true;
        if (!isDir) continue;
        specs.push({ dir: path.join(workflowsDir, e.name), isDefault: true, pattern: 'agent' });
      }
    } catch (error) {
      // A missing workflow directory is normal; a directory that exists but cannot be
      // enumerated must make the census incomplete rather than silently report zero.
      if (!isAbsenceError(error)) unreadableDirs.push(workflowsDir);
    }
  }
  for (const d of opts.tasksDirs || []) specs.push({ dir: d, isDefault: false, pattern: 'wide' });
  return { specs, unreadableDirs };
}

function collectTaskFiles(dirSpecs, fsImpl) {
  const collected = [];
  const unreadableDirs = [];
  for (const spec of dirSpecs) {
    let names;
    try {
      names = fsImpl.readdirSync(spec.dir);
    } catch (error) {
      // An unreadable/missing EXPLICIT --tasks dir is not "no subagents ran" — reporting 0
      // files at exit 0 would silently drop a whole source the caller asked for by name.
      // The DEFAULT subagents dir is different: most lead sessions spawn no subagents at
      // all, so its absence is the common, legitimate case, not an error.
      if (spec.isDefault) {
        if (!isAbsenceError(error)) unreadableDirs.push(spec.dir);
        continue;
      }
      throw new Error(`--tasks directory not readable: ${spec.dir}`);
    }
    for (const filename of names.filter((f) => matchesPattern(f, spec.pattern))) {
      collected.push({ dir: spec.dir, filename, fullPath: path.join(spec.dir, filename) });
    }
  }
  return { collected, unreadableDirs };
}

// De-dup by resolved real path so the same dir given twice, a file reachable through two
// --tasks dirs, or a symlink aliasing an already-counted file, is never counted twice.
// Falls back to path.resolve (no symlink resolution) when fsImpl has no realpathSync.
//
// ALSO de-dup by inode (dev+ino), independently of the path key. Claude Code's own
// `tasks/<id>.output` for a finished background/subagent task is a HARDLINK to
// `<session>/subagents/agent-<id>.jsonl` — two distinct real paths, ONE inode.
// `fs.realpathSync` returns two different strings for a hardlink (it only resolves
// symlinks), so the path-only de-dup above cannot see this case at all: passing both the
// default subagents dir and an explicit `--tasks <tasks dir>` (docs/census.md's own
// recommended shape) silently double-counted every hardlinked file's tokens. A file that
// can't be `statSync`'d with `{bigint:true}` (or whose fsImpl lacks that call) falls back
// to the path key alone — never an error here; runCensus's own statSync already marks an
// unreadable file separately.
function dedupeByRealPath(collected, fsImpl) {
  const seenPath = new Set();
  const seenInode = new Set();
  const out = [];
  for (const item of collected) {
    let real;
    try {
      real = typeof fsImpl.realpathSync === 'function' ? fsImpl.realpathSync(item.fullPath) : path.resolve(item.fullPath);
    } catch {
      real = path.resolve(item.fullPath);
    }
    const pathKey = process.platform === 'win32' ? real.toLowerCase() : real;
    let inodeKey = null;
    try {
      const st = typeof fsImpl.statSync === 'function' ? fsImpl.statSync(item.fullPath, { bigint: true }) : null;
      if (st && typeof st.ino === 'bigint' && st.ino !== 0n) inodeKey = `${st.dev}:${st.ino}`;
    } catch {
      // not stat-able here: path key only.
    }
    if (seenPath.has(pathKey) || (inodeKey && seenInode.has(inodeKey))) continue;
    seenPath.add(pathKey);
    if (inodeKey) seenInode.add(inodeKey);
    out.push(item);
  }
  return out;
}

// journal.jsonl lives next to the agent files it labels: one line per agent,
// `{"agentId":"<id>","label":"<label>"}`, `<id>` being that agent's file basename with a
// leading `agent-` and its extension stripped. Returns null (never throws) when the dir
// has no journal, an unreadable one, or fsImpl has no readFileSync — all three mean "no
// journal labels available here", not an error.
function readJournal(dir, fsImpl) {
  if (typeof fsImpl.readFileSync !== 'function') return null;
  let text;
  try {
    text = fsImpl.readFileSync(path.join(dir, 'journal.jsonl'), 'utf8');
  } catch {
    return null;
  }
  const map = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj && obj.agentId != null && obj.label != null) map.set(String(obj.agentId), String(obj.label));
  }
  return map;
}

function resolveRole(agentKey, journalMap, roleMap) {
  const bareId = agentKey.replace(/^agent-/, '');
  if (journalMap && journalMap.has(bareId)) {
    return journalMap.get(bareId).split(':')[0];
  }
  // A file's agentKey has no `agent-` prefix when it came from a `<id>.output` name
  // (Claude Code's real tasks/ shape), but docs/census.md documents --role-map keys as
  // `agent-<id>`. Accept the exact key as given, the `agent-<id>` form, and the bare id,
  // so a role map written against either naming convention resolves the same file.
  if (roleMap) {
    for (const k of [agentKey, `agent-${bareId}`, bareId]) {
      if (Object.prototype.hasOwnProperty.call(roleMap, k)) return roleMap[k];
    }
  }
  return 'unassigned';
}

function codexFirstMeta(file, fsImpl) {
  let text;
  try {
    text = fsImpl.readFileSync(file, 'utf8');
  } catch {
    return { file, error: 'unreadable' };
  }
  const first = text.split(/\r?\n/, 1)[0];
  try {
    const obj = JSON.parse(first);
    const meta = obj.type === 'session_meta' ? obj.payload : null;
    if (!meta || !isUsableCodexString(meta.id) || !isUsableCodexString(meta.session_id)) return { file, error: 'malformed metadata' };
    return { file, meta, timestamp: obj.timestamp || meta.timestamp || null, text };
  } catch {
    return { file, error: 'malformed JSON' };
  }
}

function utcDays(timestamp) {
  const d = new Date(timestamp);
  if (Number.isNaN(d.valueOf())) return [];
  const day = (offset) => {
    const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));
    return `${copy.getUTCFullYear()}-${String(copy.getUTCMonth() + 1).padStart(2, '0')}-${String(copy.getUTCDate()).padStart(2, '0')}`;
  };
  return [day(0), day(1)];
}

function codexDayDir(home, day) {
  const [year, month, date] = day.split('-');
  return path.join(home, 'sessions', year, month, date);
}

function listCodexJsonl(dir, fsImpl, discovery, required = false) {
  try {
    return fsImpl.readdirSync(dir).filter((name) => name.endsWith('.jsonl')).map((name) => path.join(dir, name));
  } catch (error) {
    if (required || !isAbsenceError(error)) discovery.unreadableDirs.push(dir);
    return [];
  }
}

function codexRole(meta) {
  const spawn = meta.source && meta.source.subagent && meta.source.subagent.thread_spawn;
  const basename = spawn && typeof spawn.agent_path === 'string' ? path.basename(spawn.agent_path) : '';
  const role = ['builder', 'reviewer', 'integrator', 'runner'].includes(basename) ? basename : 'unmapped';
  return { role, agentNickname: spawn && typeof spawn.agent_nickname === 'string' ? spawn.agent_nickname : null, parentId: spawn && spawn.parent_thread_id };
}

function listCanonicalCodexTree(codexHome, fsImpl, discovery) {
  const root = path.join(codexHome, 'sessions');
  const files = [];
  const walk = (dir, depth) => {
    let names;
    try { names = fsImpl.readdirSync(dir); }
    catch { discovery.unreadableDirs.push(dir); return; }
    for (const name of names) {
      const child = path.join(dir, name);
      if (depth === 3) {
        if (name.endsWith('.jsonl')) files.push(child);
      } else if (/^\d+$/.test(name)) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return files;
}

function discoverCodexChildren({ leadPath, leadMeta, tasksDirs, fsImpl, codexHome, knownId = false }) {
  const horizonUtcDays = utcDays(leadMeta.timestamp);
  const discovery = { home: 'canonical', horizonUtcDays: knownId ? [] : horizonUtcDays, candidates: 0, malformedFiles: [], unreadableFiles: [], unreadableDirs: [], excluded: [], selectedLeadIdentityVerified: true,
    scope: { kind: knownId ? 'canonical-session-tree' : 'default-horizon', complete: true, reason: null } };
  const files = new Map();
  const canonical = knownId ? listCanonicalCodexTree(codexHome, fsImpl, discovery)
    : horizonUtcDays.flatMap((day) => listCodexJsonl(codexDayDir(codexHome, day), fsImpl, discovery));
  for (const file of canonical) files.set(path.resolve(file), { file });
  for (const dir of tasksDirs || []) for (const file of listCodexJsonl(dir, fsImpl, discovery, true)) {
    const key = path.resolve(file);
    files.set(key, { file });
  }
  const candidates = [];
  for (const { file } of files.values()) {
    const read = codexFirstMeta(file, fsImpl);
    if (read.error) {
      (read.error === 'unreadable' ? discovery.unreadableFiles : discovery.malformedFiles).push(file);
      continue;
    }
    discovery.candidates += 1;
    if (path.resolve(file) === path.resolve(leadPath)) {
      discovery.excluded.push({ file, reason: 'duplicate lead/path' });
      continue;
    }
    candidates.push(read);
  }
  const leadIdentity = codexFirstMeta(leadPath, fsImpl);
  if (leadIdentity.error) throw new Error(`Codex selected lead identity is ${leadIdentity.error}`);
  const byId = new Map();
  const groups = new Map([[leadMeta.id, [{ ...leadIdentity, selectedLead: true }]]]);
  for (const candidate of candidates) {
    if (!groups.has(candidate.meta.id)) groups.set(candidate.meta.id, []);
    groups.get(candidate.meta.id).push(candidate);
  }
  const conflictedIds = new Set();
  for (const [id, group] of groups) {
    const unique = [];
    for (const candidate of group) {
      if (unique.some((item) => item.text === candidate.text)) discovery.excluded.push({ file: candidate.file, reason: 'exact duplicate logical identity' });
      else unique.push(candidate);
    }
    const identitySignatures = new Set(unique.map((candidate) => {
      const role = codexRole(candidate.meta);
      return JSON.stringify([candidate.meta.session_id, role.parentId || null]);
    }));
    if (identitySignatures.size > 1) {
      conflictedIds.add(id);
      if (id === leadMeta.id) discovery.selectedLeadIdentityVerified = false;
      for (const candidate of unique) discovery.excluded.push({ file: candidate.file, reason: 'conflicting logical-session identity' });
      continue;
    }
    byId.set(id, unique);
  }
  const selected = [];
  const verified = new Map([[leadMeta.id, { meta: leadMeta, depth: 0 }]]);
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const [id, segments] of byId) {
      if (verified.has(id) || conflictedIds.has(id)) continue;
      const candidate = segments[0];
      const role = codexRole(candidate.meta);
      const parent = verified.get(role.parentId);
      if (!parent) continue;
      const depth = parent.depth + 1;
      if (depth > 3) {
        discovery.excluded.push({ file: candidate.file, reason: 'depth > 3' });
        conflictedIds.add(id);
        continue;
      }
      if (candidate.meta.session_id !== leadMeta.id) {
        discovery.excluded.push({ file: candidate.file, reason: 'root session mismatch' });
        conflictedIds.add(id);
        continue;
      }
      const candidateTime = candidate.timestamp ? Date.parse(candidate.timestamp) : NaN;
      const candidateDay = Number.isNaN(candidateTime) ? null : new Date(candidateTime).toISOString().slice(0, 10);
      if (!knownId && (!candidateDay || !horizonUtcDays.includes(candidateDay))) {
        discovery.excluded.push({ file: candidate.file, reason: 'outside horizon' });
        conflictedIds.add(id);
        continue;
      }
      for (const segment of segments) selected.push({ ...segment, depth, ...role });
      verified.set(id, { meta: candidate.meta, depth });
      progressed = true;
    }
  }
  for (const [id, segments] of byId) {
    if (verified.has(id) || conflictedIds.has(id)) continue;
    const candidate = segments[0];
    const role = codexRole(candidate.meta);
    const claimsRoot = candidate.meta.session_id === leadMeta.id;
    discovery.excluded.push({ file: candidate.file, reason: claimsRoot ? 'unverified ancestry' : 'unrelated' });
  }
  if (discovery.unreadableDirs.length || discovery.unreadableFiles.length || discovery.malformedFiles.length
    || discovery.excluded.some((item) => !['unrelated', 'duplicate lead/path', 'exact duplicate logical identity'].includes(item.reason))) {
    discovery.scope.complete = false;
    discovery.scope.reason = 'canonical discovery contains unreadable or indeterminate candidates';
  }
  const leadSegments = byId.get(leadMeta.id) || [{ ...leadIdentity, selectedLead: true }];
  return { discovery, selected, leadSegments };
}

// ─────────────────────────────────────────────────────────────────────────────
// Declared roles (lane 62). The record's single `Role-sessions:` manifest names detached sessions
// (a review-run reviewer, a launcher-spawned builder) that the native session graph cannot reach.
// The declaration is the lane/role attribution authority (current sidecars do not attest a lane);
// identity is proven by the sidecar's session and the native rows' own id, models always come from
// native usage, and any source that cannot be verified taints its own coverage (PARTIAL) rather than
// dropping out silently. Legacy runs without --record stay native-only.
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECLARED_ROLES = new Set(['builder', 'reviewer', 'integrator', 'scout', 'spec-reviewer']);
const OPENED_TOLERANCE_MS = 5 * 60000; // four-read's census-window tolerance

// A confined regular file: root-relative path, no lexical or symlink escape.
function confinedRegularFile(rootDir, relativePath, fsImpl) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) return { ok: false, reason: 'path must be relative to its root' };
  const root = path.resolve(rootDir);
  const candidate = path.resolve(root, relativePath);
  if (pathEscapesRoot(path.relative(root, candidate))) return { ok: false, reason: 'path escapes its root' };
  try {
    const realRoot = fsImpl.realpathSync(root);
    const real = fsImpl.realpathSync(candidate);
    if (pathEscapesRoot(path.relative(realRoot, real))) return { ok: false, reason: 'path resolves outside its root' };
    if (!fsImpl.statSync(real).isFile()) return { ok: false, reason: 'path is not a regular file' };
    return { ok: true, real };
  } catch {
    return { ok: false, reason: 'path is missing or unreadable' };
  }
}

// --record/--repo/--from/--to rules shared by the Claude and Codex entry paths. Returns null without --record.
function declaredRoleContext(opts, fsImpl) {
  if (!opts.record && !opts.repo) return null;
  if (!opts.record || !opts.repo) throw new Error('--record and --repo are required together');
  if (opts.marker) throw new Error('--record cannot be combined with --marker (declared roles need an explicit --from/--to window)');
  if (!opts.from || !opts.to) throw new Error('--record requires explicit --from and --to');
  let parsed;
  try { parsed = parseRecord(fsImpl.readFileSync(path.resolve(opts.record), 'utf8')); }
  catch (error) { throw new Error(`--record is not readable: ${error.message}`); }
  const work = parsed.fields.work;
  if (!work) throw new Error('--record has no Work: field');
  const openedMs = Date.parse(parsed.fields.opened ?? '');
  if (Number.isNaN(openedMs)) throw new Error('--record has no parseable Opened: instant');
  if (Date.parse(opts.from) < openedMs - OPENED_TOLERANCE_MS) {
    throw new Error(`--from ${opts.from} is earlier than the record's Opened ${parsed.fields.opened} by more than 5 minutes`);
  }
  return { work, manifestPath: parsed.fields.roleSessions || null };
}

const NATIVE_ONLY_LIMITATION = 'roles: native session graph only; detached sessions are counted only when declared in a Role-sessions manifest';
const DECLARATION_LIMITATIONS = [
  'declared roles: the record declaration is the lane/role attribution authority (current sidecars do not attest a lane)',
  'declared roles are the declared set only, never proof that no undeclared role exists',
];
const COMPARABILITY_LIMITATION = 'token totals cover the stated roles and window only; a lead-only hand-run baseline, its window, quality, rework and stall classes are not the same scope';

function emptyDeclared(opts) {
  return {
    results: [], files: [], scope: {
      roles: 'native-only', from: opts.from || null, to: opts.to || null, omitted: [],
      limitations: [NATIVE_ONLY_LIMITATION, COMPARABILITY_LIMITATION],
    },
  };
}

function newVector() {
  return { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
}

function withDerived(byModel) {
  const out = {};
  for (const [model, v] of Object.entries(byModel)) {
    out[model] = { ...v, derived_total_tokens: v.input_tokens + v.cache_creation_input_tokens + v.cache_read_input_tokens + v.output_tokens };
  }
  return out;
}

function unreadableDeclared(reason) {
  return { reasons: [reason], requests: null, duplicates: 0, byModel: null, files: [] };
}

async function readDeclaredClaude({ real, sessionId, role, fromMs, toMs, nativeRaw, nativeKeys, seen, opts, fsImpl }) {
  const reasons = [];
  const files = [];
  const byModel = {};
  let requests = 0;
  let duplicates = 0;
  let inWindow = 0;
  let invalid = 0;
  let unknownModel = 0;
  let untimed = 0;
  let malformed = 0;
  const root = await censusSubFile(real, { fsImpl, collect: true });
  if (!root.sessionIds.has(sessionId)) return unreadableDeclared('native identity not found in transcript rows');
  if ([...root.sessionIds].some((id) => id !== sessionId)) reasons.push('transcript rows name another session');
  const { specs, unreadableDirs: specDirs } = buildDirSpecs({ lead: real }, fsImpl);
  const { collected, unreadableDirs: collectDirs } = collectTaskFiles(specs, fsImpl);
  if (specDirs.length || collectDirs.length) reasons.push('declared subagent directory unreadable');
  const fileEntries = [{ file: real, role, data: root }];
  // The declared subtree rides the native default traversal; a file the native census already reads is not read twice.
  const tagged = collected.map((item) => ({ ...item, declared: true }));
  const survivors = dedupeByRealPath([...nativeRaw, ...tagged], fsImpl).filter((item) => item.declared);
  const journals = new Map();
  for (const item of survivors) {
    if (!journals.has(item.dir)) journals.set(item.dir, readJournal(item.dir, fsImpl));
    const resolved = resolveRole(item.filename.replace(/\.(jsonl|output)$/i, ''), journals.get(item.dir), opts.roleMap);
    try {
      fileEntries.push({ file: item.fullPath, role: resolved === 'unassigned' ? role : resolved, data: await censusSubFile(item.fullPath, { fsImpl, collect: true }) });
    } catch { reasons.push('declared subagent file unreadable'); }
  }
  for (const { file, role: fileRole, data } of fileEntries) {
    malformed += data.malformed;
    const fileByModel = {};
    let fileRequests = 0;
    for (const [key, entry] of data.byId) {
      const t = entry.ts ? Date.parse(entry.ts) : NaN;
      if (Number.isNaN(t)) { untimed += 1; continue; }
      if (t < fromMs || t > toMs) continue;
      inWindow += 1;
      const ids = [key, ...(entry.ids || [])];
      if (ids.some((id) => nativeKeys.has(id) || seen.has(id))) { duplicates += 1; continue; }
      try { processedTokenTotal('claude', entry.usage); } catch { invalid += 1; continue; }
      for (const id of ids) seen.add(id);
      if (entry.model === 'unknown') unknownModel += 1;
      const model = entry.model || 'unknown';
      for (const target of [fileByModel, byModel]) {
        if (!target[model]) target[model] = newVector();
        addUsage(target[model], entry.usage);
      }
      fileRequests += 1;
      requests += 1;
    }
    files.push({ file, role: fileRole, turns: fileRequests, byModel: withDerived(fileByModel) });
  }
  if (malformed) reasons.push(`corrupt rows: ${malformed}`);
  if (invalid) reasons.push(`invalid usage rows: ${invalid}`);
  if (unknownModel) reasons.push(`usage rows without a model: ${unknownModel}`);
  if (untimed) reasons.push(`usage rows without a timestamp: ${untimed}`);
  if (inWindow === 0) reasons.push('no in-window usage');
  return { reasons, requests, duplicates, byModel: withDerived(byModel), files };
}

// A declared Codex role: identity is the rollout's own session_meta; usage and descendants come from the existing reader.
async function readDeclaredCodex({ real, sessionId, role, opts, nativeKeys, seen, codexHome, fsImpl }) {
  const reasons = [];
  const meta = codexFirstMeta(real, fsImpl);
  if (meta.error || meta.meta.id !== sessionId) return unreadableDeclared('native identity mismatch: rollout session_meta id is not the declared session');
  const window = { from: opts.from, to: opts.to };
  const parts = [{ file: real, data: null }];
  try { parts[0].data = await censusCodexLeadFile(real, { fsImpl, marker: null, ...window, expectedId: sessionId, child: true }); }
  catch (error) { return unreadableDeclared(`declared Codex rollout unusable: ${error.message}`); }
  try {
    const leadMeta = { id: sessionId, session_id: parts[0].data.rootSessionId, timestamp: parts[0].data.firstAt };
    const { discovery, selected } = discoverCodexChildren({ leadPath: real, leadMeta, tasksDirs: [], fsImpl, codexHome, knownId: true });
    if (!discovery.scope.complete) reasons.push('declared Codex subtree discovery incomplete');
    for (const child of selected) {
      try {
        parts.push({ file: child.file, role: child.role, data: await censusCodexLeadFile(child.file, { fsImpl, marker: null, ...window, rootSessionId: parts[0].data.rootSessionId, expectedId: child.meta.id, child: true }) });
      } catch (error) { reasons.push(`declared Codex child unusable: ${error.message}`); }
    }
  } catch (error) { reasons.push(`declared Codex subtree unavailable: ${error.message}`); }
  const byModel = {};
  const files = [];
  let requests = 0;
  let duplicates = 0;
  let inWindow = 0;
  let unusable = 0;
  for (const part of parts) {
    const fileByModel = {};
    let fileRequests = 0;
    for (const [key, entry] of part.data.windowById) {
      inWindow += 1;
      if (nativeKeys.has(key) || seen.has(key)) { duplicates += 1; continue; }
      const u = entry.usage;
      const vector = { input_tokens: u.input_tokens, cache_creation_input_tokens: u.cache_creation_input_tokens, cache_read_input_tokens: u.cache_read_input_tokens, output_tokens: u.output_tokens };
      if (entry.model === 'unknown' || Object.values(vector).some((n) => n === null)) { unusable += 1; continue; }
      seen.add(key);
      for (const target of [fileByModel, byModel]) {
        if (!target[entry.model]) target[entry.model] = newVector();
        addUsage(target[entry.model], vector);
      }
      fileRequests += 1;
      requests += 1;
    }
    files.push({ file: part.file, role: part.role || role, turns: fileRequests, byModel: withDerived(fileByModel) });
  }
  if (unusable) reasons.push(`responses with unknown model or unavailable token categories: ${unusable}`);
  if (inWindow === 0) reasons.push('no in-window usage');
  return { reasons, requests, duplicates, byModel: withDerived(byModel), files };
}

/**
 * Read the record's declared roles. A bad DECLARATION is PARTIAL, never a throw; only bad CLI use throws
 * (--record without --repo/--from/--to, --from before Opened).
 * leadIdentity: {host, sessionId}. native: {raw (collected native subagent files), keys (Set of canonical request keys)}.
 */
async function readDeclaredRoles(opts, leadIdentity, native, fsImpl) {
  const context = declaredRoleContext(opts, fsImpl);
  const out = emptyDeclared(opts);
  if (!context || !context.manifestPath) return out; // no record, or a record with no Role-sessions: stays native-only
  const omit = (host, sessionId, reason) => out.scope.omitted.push({ host: String(host), sessionId: String(sessionId), reason });
  out.scope.roles = 'native-plus-declared';
  out.scope.limitations = [...DECLARATION_LIMITATIONS, COMPARABILITY_LIMITATION];
  const manifestFile = confinedRegularFile(opts.repo, context.manifestPath, fsImpl);
  if (!manifestFile.ok) { omit('unknown', context.manifestPath, `Role-sessions manifest ${manifestFile.reason}`); return out; }
  let manifest;
  try { manifest = JSON.parse(fsImpl.readFileSync(manifestFile.real, 'utf8')); }
  catch { omit('unknown', context.manifestPath, 'Role-sessions manifest is not valid JSON'); return out; }
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.sessions)) { omit('unknown', context.manifestPath, 'Role-sessions manifest is not version 1 with a sessions array'); return out; }
  if (manifest.work !== context.work) { omit('unknown', context.manifestPath, `Role-sessions manifest work ${String(manifest.work)} is not the record's Work ${context.work}`); return out; }
  const fromMs = Date.parse(opts.from);
  const toMs = Date.parse(opts.to);
  const codexHome = opts.codexHome || CANONICAL_CODEX_HOME;
  // Group declarations: identical repeats collapse; any difference in role/evidence/transcript conflicts.
  const groups = new Map();
  for (const entry of manifest.sessions) {
    const host = entry && entry.host;
    const sessionId = entry && entry.sessionId;
    if ((host !== 'claude' && host !== 'codex') || typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) { omit(host, sessionId, 'declaration has an invalid host or sessionId'); continue; }
    const key = `${host}:${sessionId.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const seen = new Set();
  for (const [, group] of [...groups].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const first = group[0];
    const signature = (e) => JSON.stringify([e.role, e.evidence, e.transcript]);
    const result = { host: first.host, sessionId: first.sessionId, role: DECLARED_ROLES.has(first.role) ? first.role : 'builder', evidence: String(first.evidence ?? ''),
      status: 'PARTIAL', reasons: [], requests: null, duplicateRequests: 0, byModel: null };
    const fail = (reason) => { if (!result.reasons.includes(reason)) result.reasons.push(reason); };
    if (!DECLARED_ROLES.has(first.role)) fail('declaration has an invalid role');
    if (group.some((e) => signature(e) !== signature(first))) fail('conflicting declarations for this session');
    if (first.sessionId === leadIdentity.sessionId && first.host === leadIdentity.host) fail('declared session is the lead');
    let real = null;
    if (!result.reasons.length) {
      const evidenceFile = confinedRegularFile(opts.repo, first.evidence, fsImpl);
      let evidence = null;
      if (!evidenceFile.ok) fail(`launch evidence ${evidenceFile.reason}`);
      else {
        try { evidence = JSON.parse(fsImpl.readFileSync(evidenceFile.real, 'utf8')); } catch { fail('launch evidence is not valid JSON'); }
      }
      if (evidence) {
        const startedAt = evidence.started ?? evidence.startedAt;
        if (evidence.session !== first.sessionId) fail('launch evidence session is not the declared session');
        else if (typeof startedAt !== 'string' || Number.isNaN(Date.parse(startedAt))) fail('launch evidence has no parseable started/startedAt');
      }
      const root = first.host === 'claude' ? opts.claudeRoot : codexHome;
      if (!result.reasons.length) {
        if (!root) fail('no --claude-root for a declared Claude session');
        else {
          const transcript = confinedRegularFile(root, first.transcript, fsImpl);
          if (!transcript.ok) fail(`transcript ${transcript.reason}`); else real = transcript.real;
        }
      }
    }
    if (real) {
      try {
        const read = first.host === 'claude'
          ? await readDeclaredClaude({ real, sessionId: first.sessionId, role: result.role, fromMs, toMs, nativeRaw: native.raw, nativeKeys: native.keys, seen, opts, fsImpl })
          : await readDeclaredCodex({ real, sessionId: first.sessionId, role: result.role, opts, nativeKeys: native.keys, seen, codexHome, fsImpl });
        for (const reason of read.reasons) fail(reason);
        result.requests = read.requests;
        result.duplicateRequests = read.duplicates;
        result.byModel = read.byModel;
        for (const file of read.files) out.files.push({ ...file, host: first.host, sessionId: first.sessionId });
      } catch (error) { fail(`declared transcript unreadable: ${error.message}`); }
    }
    if (!result.reasons.length) result.status = 'complete';
    out.results.push(result);
  }
  return out;
}

function declaredIsPartial(declared) {
  return declared.scope.omitted.length > 0 || declared.results.some((r) => r.status !== 'complete');
}

function declaredReasons(declared) {
  return [
    ...declared.scope.omitted.map((o) => `${o.host} ${o.sessionId}: ${o.reason}`),
    ...declared.results.filter((r) => r.status !== 'complete').map((r) => `${r.host} ${r.sessionId} (${r.role}): ${r.reasons.join(', ')}`),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the full census and returns a plain report object (no printing, no fs writes).
 * opts: { lead, tasksDirs, marker, out, json, roleMap } — see parseArgs. fsImpl defaults
 * to real node:fs.
 */

// A declared vector (claude-disjoint categories + derived total) added into a Codex-shaped aggregate map. Native
// reasoning/raw-total categories do not exist for it, so those become explicitly unavailable, never a guessed sum.
function addDeclaredVector(map, key, vector) {
  if (!map[key]) map[key] = newCodexAgg();
  const target = map[key];
  const bump = (field, value) => { if (target[field] !== null) target[field] += value; };
  bump('native_input_tokens', vector.input_tokens + vector.cache_creation_input_tokens + vector.cache_read_input_tokens);
  bump('input_tokens', vector.input_tokens);
  bump('cache_creation_input_tokens', vector.cache_creation_input_tokens);
  bump('cache_read_input_tokens', vector.cache_read_input_tokens);
  bump('output_tokens', vector.output_tokens);
  bump('derived_total_tokens', vector.derived_total_tokens);
  target.reasoning_output_tokens = null;
  target.total_tokens = null;
  target.unavailable = [...new Set([...target.unavailable, 'reasoning_output_tokens', 'total_tokens'])].sort();
}

// Lifecycle and tool rows of every verified lead segment (LF framing; ids, instants and row numbers only, never text).
async function readCodexActivityEvents(paths, fsImpl) {
  const events = [];
  let corruptRows = 0;
  let seq = 0;
  for (const file of paths) {
    let row = 0;
    for await (const line of await openLines(fsImpl, file)) {
      row += 1;
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { corruptRows += 1; continue; }
      const ms = Date.parse(obj && obj.timestamp);
      const payload = obj && obj.payload && typeof obj.payload === 'object' ? obj.payload : {};
      const type = obj && obj.type === 'event_msg' ? payload.type : null;
      const itemType = obj && obj.type === 'response_item' ? payload.type : null;
      const base = { ms, row, seq: seq++ };
      let kind = 'other';
      if (type === 'task_started') kind = 'start';
      else if (type === 'task_complete') kind = 'complete';
      else if (itemType === 'function_call' || itemType === 'custom_tool_call') kind = 'call';
      else if (itemType === 'function_call_output' || itemType === 'custom_tool_call_output') kind = 'output';
      if (Number.isNaN(ms)) { if (kind !== 'other') corruptRows += 1; continue; }
      if (kind === 'start' || kind === 'complete') {
        if (!isUsableCodexString(payload.turn_id)) { corruptRows += 1; continue; }
        events.push({ ...base, kind, turnId: payload.turn_id, rootTurnId: isUsableCodexString(payload.root_turn_id) ? payload.root_turn_id : null });
      } else if (kind === 'call' || kind === 'output') {
        if (!isUsableCodexString(payload.call_id)) { corruptRows += 1; continue; }
        events.push({ ...base, kind, callId: payload.call_id, turnId: isUsableCodexString(payload.turn_id) ? payload.turn_id : null });
      } else events.push({ ...base, kind });
    }
  }
  return { events, corruptRows };
}

async function runCodexCensus(opts, fsImpl) {
  const lead = await censusCodexLeadFile(opts.lead, { fsImpl, marker: opts.marker, from: opts.from, to: opts.to, expectedId: opts.leadSession || undefined });
  const leadMeta = { id: lead.sessionId, session_id: lead.rootSessionId, timestamp: lead.firstAt };
  const codexHome = opts.codexHome || CANONICAL_CODEX_HOME;
  const { discovery, selected, leadSegments } = discoverCodexChildren({ leadPath: opts.lead, leadMeta, tasksDirs: opts.tasksDirs || [], fsImpl, codexHome, knownId: Boolean(opts.leadSession) });
  const identityPaths = [opts.lead];
  for (const segment of leadSegments) {
    if (path.resolve(segment.file) === path.resolve(opts.lead)) continue;
    const part = await censusCodexLeadFile(segment.file, { fsImpl, marker: null, from: opts.from, to: opts.to, expectedId: lead.sessionId });
    identityPaths.push(segment.file);
    for (const mapName of ['totalById', 'windowById']) for (const [key, entry] of part[mapName]) {
      const prior = lead[mapName].get(key);
      if (prior && codexUsageFingerprint(prior.usage) !== codexUsageFingerprint(entry.usage)) throw new Error(`Codex response_id conflict across segments for ${entry.responseId}`);
      if (prior) {
        if (prior.model !== entry.model) { prior.model = 'unknown'; lead.conflictingResponseModels = [...new Set([...(lead.conflictingResponseModels || []), entry.responseId])]; }
        if (prior.ts !== entry.ts) { prior.ts = null; lead.conflictingResponseTimestamps = [...new Set([...(lead.conflictingResponseTimestamps || []), entry.responseId])]; }
        if (prior.turnId !== entry.turnId) lead.conflictingResponseTurnIds = [...new Set([...(lead.conflictingResponseTurnIds || []), entry.responseId])];
      } else lead[mapName].set(key, entry);
    }
    lead.conflictingResponseModels = [...new Set([...(lead.conflictingResponseModels || []), ...(part.conflictingResponseModels || [])])];
    lead.conflictingResponseTimestamps = [...new Set([...(lead.conflictingResponseTimestamps || []), ...(part.conflictingResponseTimestamps || [])])];
    lead.conflictingResponseTurnIds = [...new Set([...(lead.conflictingResponseTurnIds || []), ...(part.conflictingResponseTurnIds || [])])];
    lead.invalidResponseTimestamps = [...new Set([...(lead.invalidResponseTimestamps || []), ...(part.invalidResponseTimestamps || [])])];
    lead.nativeTurnCount = new Set([...(lead.startedTurns || []), ...(part.startedTurns || [])]).size;
    lead.windowStartedTurns = [...new Set([...(lead.windowStartedTurns || []), ...(part.windowStartedTurns || [])])];
    lead.nativeTurnCountWindow = lead.windowStartedTurns.length;
    lead.startedTurns = [...new Set([...(lead.startedTurns || []), ...(part.startedTurns || [])])];
    lead.completedTurns = [...new Set([...(lead.completedTurns || []), ...(part.completedTurns || [])])];
    lead.invalidTaskStarted ||= part.invalidTaskStarted;
    if (part.lastStartedAt && (!lead.lastStartedAt || Date.parse(part.lastStartedAt) > Date.parse(lead.lastStartedAt))) {
      lead.lastStartedAt = part.lastStartedAt; lead.lastStartedTurn = part.lastStartedTurn;
    }
    lead.hasRowAfterTo ||= part.hasRowAfterTo;
    lead.damaged ||= part.damaged;
    if (!lead.lastAt || (part.lastAt && Date.parse(part.lastAt) > Date.parse(lead.lastAt))) {
      lead.lastAt = part.lastAt; lead.finalEvent = part.finalEvent; lead.finalRowCompletesTurn = part.finalRowCompletesTurn;
    }
  }
  lead.responseTimeline = [...lead.windowById.values()].map((entry) => ({ responseId: entry.responseId, turnId: entry.turnId, timestamp: entry.ts, model: entry.model }));
  lead.responseTimelineComplete = lead.responseTimeline.every((entry) => entry.timestamp !== null && entry.model !== 'unknown')
    && (lead.invalidResponseTimestamps || []).length === 0 && (lead.conflictingResponseTurnIds || []).length === 0;
  const subTotalsByModel = {};
  const subTotalsByRole = {};
  const roleFileCounts = {};
  const perFile = [];
  const unavailable = [];
  const childLastAts = [];
  const subWindowById = new Map();
  const childTemporal = new Map();
  const unusableChildren = [];
  const sharedFrom = opts.marker ? lead.windowStartAt : opts.from;
  const sharedFromMs = sharedFrom ? Date.parse(sharedFrom) : NaN;
  if (opts.marker && !lead.windowStartAt) unavailable.push('marker boundary timestamp is unavailable');
  let subTotalTurns = 0;
  for (const candidate of selected) {
    try {
      const child = await censusCodexLeadFile(candidate.file, {
        fsImpl, marker: null, from: sharedFrom, to: opts.to,
        rootSessionId: lead.rootSessionId, expectedId: candidate.meta.id, child: true,
      });
      if (child.lastAt) childLastAts.push(child.lastAt);
      const state = childTemporal.get(candidate.meta.id) || { firstAt: null, windowResponses: 0, tokenRecordCount: 0, invalidTaskStarted: false, lastStartedAt: null, lastStartedTurn: null, hasRowAfterTo: false, damaged: null, latestAt: null, latestStartCompleted: false, untimedStart: false, finalRowCompletesTurn: false, finalEvent: null, startedTurns: [] };
      if (!state.firstAt || (child.firstAt && Date.parse(child.firstAt) < Date.parse(state.firstAt))) state.firstAt = child.firstAt;
      state.windowResponses += child.windowById.size;
      state.tokenRecordCount += child.tokenRecordCount;
      state.invalidTaskStarted ||= child.invalidTaskStarted;
      if (child.lastStartedAt && (!state.lastStartedAt || Date.parse(child.lastStartedAt) > Date.parse(state.lastStartedAt))) {
        state.lastStartedAt = child.lastStartedAt; state.lastStartedTurn = child.lastStartedTurn;
        state.latestStartCompleted = child.latestStartCompleted;
      } else if (child.lastStartedAt && Date.parse(child.lastStartedAt) === Date.parse(state.lastStartedAt)) {
        // Equal-time newest starts in different segments: association is ambiguous, so never keep a true witness unless both agree.
        state.latestStartCompleted &&= child.latestStartCompleted;
      }
      state.untimedStart ||= child.untimedStart;
      state.hasRowAfterTo ||= child.hasRowAfterTo;
      state.damaged ||= child.damaged;
      state.startedTurns = [...new Set([...state.startedTurns, ...(child.startedTurns || [])])];
      if (!state.latestAt || (child.lastAt && Date.parse(child.lastAt) > Date.parse(state.latestAt))) {
        state.latestAt = child.lastAt; state.finalRowCompletesTurn = child.finalRowCompletesTurn; state.finalEvent = child.finalEvent;
      }
      childTemporal.set(candidate.meta.id, state);
      const byModel = codexAggByModel(child.windowById);
      for (const [key, entry] of child.windowById) {
        const prior = subWindowById.get(key);
        if (prior && codexUsageFingerprint(prior.entry.usage) !== codexUsageFingerprint(entry.usage)) throw new Error(`Codex response_id conflict across segments for ${entry.responseId}`);
        if (prior) {
          if (prior.entry.model !== entry.model) { prior.entry.model = 'unknown'; state.modelConflict = true; }
          if (prior.entry.ts !== entry.ts) { prior.entry.ts = null; state.timestampConflict = true; }
          if (prior.entry.turnId !== entry.turnId) state.turnIdConflict = true;
        } else subWindowById.set(key, { entry, role: candidate.role });
      }
      state.modelConflict ||= child.conflictingResponseModels.length > 0;
      state.timestampConflict ||= child.conflictingResponseTimestamps.length > 0;
      state.turnIdConflict ||= child.conflictingResponseTurnIds.length > 0;
      roleFileCounts[candidate.role] = (roleFileCounts[candidate.role] || 0) + 1;
      subTotalTurns += child.windowById.size;
      if (child.tokenRecordCount === 0) unavailable.push(`unusable child coverage in ${candidate.file}: no token_usage_record rows with per-response usage`);
      if (child.unknownModels.length) unavailable.push(`unknown model attribution in ${candidate.file}`);
      if (child.invalidResponseTimestamps.length) unavailable.push(`invalid or missing response timestamp in ${candidate.file}`);
      perFile.push({ file: candidate.file, role: candidate.role, parentId: candidate.parentId, agentNickname: candidate.agentNickname, depth: candidate.depth, turns: child.windowById.size, byModel, excludedByWindow: child.totalById.size - child.windowById.size });
    } catch (error) {
      if (/response_id conflict|conflicting usage/i.test(error.message)) throw error;
      discovery.unreadableFiles.push(candidate.file);
      unusableChildren.push(`${candidate.file}: ${error.message}`);
      discovery.excluded.push({ file: candidate.file, reason: `unusable child: ${error.message}` });
    }
  }
  if (lead.unknownModels.length) unavailable.push(`unknown model attribution in ${opts.lead}`);
  if (lead.coverageReason) unavailable.push(lead.coverageReason);
  if (discovery.malformedFiles.length) unavailable.push('malformed discovery candidate');
  if (discovery.unreadableFiles.length) unavailable.push('unreadable discovery candidate');
  if (discovery.unreadableDirs.length) unavailable.push('unreadable or missing explicitly requested discovery directory');
  if (discovery.excluded.some((item) => !['unrelated', 'duplicate lead/path', 'exact duplicate logical identity'].includes(item.reason))) unavailable.push('unverified or out-of-contract discovery candidate');
  const latestObserved = [lead.lastAt, ...childLastAts].filter(Boolean).reduce((latest, value) => {
    const time = Date.parse(value);
    return Number.isNaN(time) || (latest && Date.parse(latest) >= time) ? latest : value;
  }, null);
  const effectiveStartAt = opts.from ? new Date(opts.from).toISOString() : opts.marker ? lead.windowStartAt : lead.firstAt;
  const effectiveEndAt = opts.to ? new Date(opts.to).toISOString() : latestObserved;
  const horizonStart = discovery.horizonUtcDays.length ? Date.parse(`${discovery.horizonUtcDays[0]}T00:00:00.000Z`) : NaN;
  const horizonEndExclusive = discovery.horizonUtcDays.length ? horizonStart + discovery.horizonUtcDays.length * 86400000 : NaN;
  const effectiveStartMs = effectiveStartAt ? Date.parse(effectiveStartAt) : NaN;
  const effectiveEndMs = effectiveEndAt ? Date.parse(effectiveEndAt) : NaN;
  if (!opts.leadSession && (!Number.isFinite(horizonStart) || !Number.isFinite(effectiveStartMs) || !Number.isFinite(effectiveEndMs)
    || effectiveStartMs < horizonStart || effectiveEndMs >= horizonEndExclusive)) {
    unavailable.push('effective census window is outside default discovery horizon');
  }
  for (const { entry, role } of subWindowById.values()) {
    const singleton = new Map([[`${role}:${entry.responseId}`, entry]]);
    mergeCodexAggInto(subTotalsByModel, codexAggByModel(singleton));
    if (!subTotalsByRole[role]) subTotalsByRole[role] = newCodexAgg();
    mergeCodexAgg(subTotalsByRole[role], entry.usage);
  }
  subTotalTurns = subWindowById.size;
  const leadTotalByModel = codexAggByModel(lead.totalById);
  const leadWindowByModel = codexAggByModel(lead.windowById);
  const observedCombined = {};
  mergeCodexAggInto(observedCombined, leadWindowByModel);
  mergeCodexAggInto(observedCombined, subTotalsByModel);
  const aggregates = Object.values(observedCombined);
  const nativeKeys = new Set([...lead.totalById.keys(), ...subWindowById.keys()]);
  const stallNudges = computeStallNudges(opts, lead, fsImpl);
  const field = (ok, reason) => ({ status: ok ? 'COUNTED' : 'UNSUPPORTED', reason: ok ? null : reason });
  const allPresent = (name) => aggregates.length > 0 && aggregates.every((aggregate) => aggregate[name] !== null);
  const modelCounted = !Object.prototype.hasOwnProperty.call(observedCombined, 'unknown');
  const fields = {
    model: field(modelCounted, 'one or more responses lack native model attribution'),
    inputTokens: field(allPresent('native_input_tokens'), 'one or more responses lack input_tokens'),
    cachedInputTokens: field(allPresent('cache_read_input_tokens'), 'one or more responses lack cached_input_tokens'),
    cacheWriteTokens: field(allPresent('cache_creation_input_tokens'), 'native rows do not prove a cache-write tier or exact zero'),
    outputTokens: field(allPresent('output_tokens'), 'one or more responses lack output_tokens'),
    reasoningOutputTokens: field(allPresent('reasoning_output_tokens'), 'one or more responses lack reasoning_output_tokens'),
    derivedTotalTokens: field(allPresent('derived_total_tokens'), 'input_tokens and output_tokens are not complete'),
    leadTurns: field(!lead.invalidTaskStarted && [...childTemporal.values()].every((state) => !state.invalidTaskStarted), 'one or more task_started events lack turn_id'), responses: field(true, null),
    wakes: field(Number.isFinite(lead.wakes), 'native wake evidence unavailable'),
    stopBlocks: field(Number.isFinite(lead.stopBlocks), 'native Stop-block evidence unavailable'),
    stallNudges: field(stallNudges.count !== null, stallNudges.reason || 'ledger nudge evidence unavailable'),
    stalls: field(false, 'native Agent/Task/Workflow stall attribution is unsupported'),
  };
  const childEnded = (state) => state.latestStartCompleted && !state.invalidTaskStarted && !state.untimedStart;
  // Clean, completed child that ended strictly before the (finite) window start: outside the window.
  const childEndedBeforeWindow = (state) => Number.isFinite(sharedFromMs) && childEnded(state) && !state.damaged
    && !state.timestampConflict && state.windowResponses === 0 && Number.isFinite(Date.parse(state.latestAt)) && Date.parse(state.latestAt) < sharedFromMs;
  const temporalReasons = [];
  if (!discovery.scope.complete) temporalReasons.push(discovery.scope.reason);
  if (unusableChildren.length) temporalReasons.push(`verified child could not be read: ${unusableChildren.join('; ')}`);
  if (lead.damaged) temporalReasons.push(`lead ${lead.damaged}`);
  if ((lead.conflictingResponseTimestamps || []).length) temporalReasons.push('lead has conflicting timestamps for a duplicate response id');
  if (opts.to) {
    const lastStarted = lead.lastStartedTurn;
    if (!lead.hasRowAfterTo && !(lead.finalRowCompletesTurn && lead.finalEvent && lead.finalEvent.turnId === lastStarted)) temporalReasons.push('lead has no end-bound witness for the requested window');
    for (const [id, state] of childTemporal) {
      if (state.firstAt && Date.parse(state.firstAt) > Date.parse(opts.to) && state.windowResponses === 0) continue;
      if (childEndedBeforeWindow(state)) continue;
      if (state.damaged) temporalReasons.push(`child ${id} ${state.damaged}`);
      if (state.timestampConflict) temporalReasons.push(`child ${id} has conflicting timestamps for a duplicate response id`);
      if (state.tokenRecordCount === 0) temporalReasons.push(`child ${id} has no token_usage_record rows with per-response usage`);
      if (!state.hasRowAfterTo && !childEnded(state)) temporalReasons.push(`child ${id} has no end-bound witness for the requested window`);
    }
  } else {
    if (!lead.finalRowCompletesTurn) temporalReasons.push('open or unbounded lead has no end-bound witness');
    for (const [id, state] of childTemporal) {
      if (childEndedBeforeWindow(state)) continue;
      if (state.damaged) temporalReasons.push(`child ${id} ${state.damaged}`);
      if (state.tokenRecordCount === 0) temporalReasons.push(`child ${id} has no token_usage_record rows with per-response usage`);
      if (!childEnded(state)) temporalReasons.push(`open or unbounded child ${id} has no end-bound witness`);
    }
  }
  const temporalComplete = temporalReasons.length === 0;
  discovery.scope.complete = temporalComplete;
  discovery.scope.reason = temporalComplete ? null : temporalReasons.join('; ');
  const requiredFields = ['inputTokens', 'cachedInputTokens', 'outputTokens', 'model', 'derivedTotalTokens'];
  const coverageSupported = temporalComplete && requiredFields.every((name) => fields[name].status === 'COUNTED');
  unavailable.push(...Object.entries(fields).filter(([, value]) => value.status === 'UNSUPPORTED').map(([name, value]) => `${name}: ${value.reason}`));
  // Lane 62: declared roles (either host) join the existing reducers with a processed-v1 derived total; the
  // field checks above stay over native responses only, so a declared Claude vector never blanks a Codex cell.
  const declared = await readDeclaredRoles(opts, { host: 'codex', sessionId: lead.sessionId }, { raw: [], keys: nativeKeys }, fsImpl);
  for (const f of declared.files) {
    for (const [model, vector] of Object.entries(f.byModel)) {
      addDeclaredVector(subTotalsByModel, model, vector);
      addDeclaredVector(observedCombined, model, vector);
      addDeclaredVector(subTotalsByRole, f.role, vector);
    }
    roleFileCounts[f.role] = (roleFileCounts[f.role] || 0) + 1;
    subTotalTurns += f.turns;
    perFile.push({ file: f.file, role: f.role, parentId: null, agentNickname: null, depth: null, turns: f.turns, byModel: f.byModel, excludedByWindow: 0, source: 'declared', host: f.host, sessionId: f.sessionId });
  }
  const activityFrom = opts.from ? Date.parse(opts.from) : opts.marker && lead.windowStartAt ? Date.parse(lead.windowStartAt) : null;
  const activityRead = await readCodexActivityEvents(identityPaths, fsImpl);
  const activity = computeCodexActivity(activityRead.events, { fromMs: Number.isNaN(activityFrom) ? null : activityFrom, toMs: opts.to ? Date.parse(opts.to) : null, corruptRows: activityRead.corruptRows });
  const endAt = lead.windowLastAt ?? lead.lastAt;
  const wallClockHours = lead.windowStartAt && endAt && new Date(endAt) > new Date(lead.windowStartAt)
    ? (new Date(endAt) - new Date(lead.windowStartAt)) / 3600000 : null;
  return {
    lead: {
      host: 'codex', sessionId: lead.sessionId, totalTurns: lead.totalById.size, windowTurns: lead.windowById.size,
      leadTurns: lead.nativeTurnCountWindow, leadTurnsTotal: lead.nativeTurnCount,
      nativeTurnCount: lead.nativeTurnCount, nativeTurnCountWindow: lead.nativeTurnCountWindow,
      observedLeadRequests: lead.windowById.size, observedLeadTokens: Object.values(leadWindowByModel).every((aggregate) => aggregate.derived_total_tokens !== null) ? Object.values(leadWindowByModel).reduce((n, aggregate) => n + aggregate.derived_total_tokens, 0) : null,
      observedNativeTurnCount: lead.nativeTurnCount, observedNativeTurnCountWindow: lead.nativeTurnCountWindow,
      coverageSupported, coverageReason: coverageSupported ? null : unavailable.join('; '),
      totalByModel: coverageSupported ? leadTotalByModel : null, windowByModel: coverageSupported ? leadWindowByModel : null,
      observedTotalByModel: leadTotalByModel, observedWindowByModel: leadWindowByModel,
      wakeSplit: null, wakeSplitUnavailable: 'codex lead', // lane 51 (W1): the Claude-only wake split is out of scope for a Codex lead
      wakes: lead.wakes, wakesNoteFlush: lead.wakes - lead.wakesDoneTick, wakesDoneTick: lead.wakesDoneTick, wakesTotal: lead.wakesTotal,
      stopBlocks: lead.stopBlocks, stopBlocksTotal: lead.stopBlocksTotal,
      markerFound: lead.markerFound, windowStartAt: lead.windowStartAt, windowEndAt: endAt, leadLastMessageAt: lead.lastAt,
      turnsPerHour: wallClockHours ? lead.windowById.size / wallClockHours : null, wallClockHours,
      codex: {
        discovery,
        identity: { expectedId: opts.leadSession || lead.sessionId, verified: true, path: opts.lead, paths: identityPaths.sort(), source: opts.leadSession ? 'lead-session' : 'lead' },
        fields,
        unavailable: [...new Set(unavailable)],
        responseTimeline: lead.responseTimeline,
        responseTimelineComplete: lead.responseTimelineComplete && discovery.selectedLeadIdentityVerified,
        effectiveWindow: { from: effectiveStartAt, to: effectiveEndAt },
      },
    },
    subagents: {
      fileCount: perFile.length, unreadable: discovery.unreadableFiles.length, unreadableDirs: discovery.unreadableDirs,
      incomplete: !coverageSupported, totalTurns: subTotalTurns, excludedByWindow: perFile.reduce((n, file) => n + file.excludedByWindow, 0),
      totalByModel: coverageSupported ? subTotalsByModel : null, totalByRole: coverageSupported ? subTotalsByRole : null,
      roleFileCounts: coverageSupported ? roleFileCounts : null, perFile,
    },
    combined: coverageSupported ? observedCombined : null,
    tokenDefinition: TOKEN_DEFINITION, measurementScope: declared.scope, roleSessions: declared.results, activity,
    stallNudges,
    marker: opts.marker || null, leadPath: opts.lead, tasksPaths: [...(opts.tasksDirs || [])], defaultSubagentsDir: null,
  };
}

const DEFAULT_LEDGER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'ledger');

/**
 * Stall nudges received by the lead in the window (lane 38): ledger lines whose id matches
 * `collect-*-stall-*` addressed to the lead's slug. The slug is `--lead-slug`, else the recipient the
 * transcript itself names most often (wake envelopes, Stop-block and hook-context headers); the ledger is
 * `--ledger-dir`, else this repository's docs/ledger. Anything that cannot be read is
 * `count: null` with a reason, never a zero.
 */
export function computeStallNudges(opts, lead, fsImpl) {
  const votes = [...(lead.slugVotes || [])].sort((a, b) => b[1] - a[1]);
  const slug = opts.leadSlug || (votes.length ? votes[0][0] : null);
  const slugSource = opts.leadSlug ? 'option' : slug ? 'inferred' : null;
  const ledgerDir = opts.ledgerDir || DEFAULT_LEDGER_DIR;
  const base = { count: null, ids: [], slug, slugSource, ledgerDir, windowStartAt: opts.from || lead.windowStartAt || null, windowEndAt: opts.to || lead.windowLastAt || lead.lastAt || null, reason: null };
  if (!slug) return { ...base, reason: 'no --lead-slug and the transcript names no recipient' };
  const entries = collectLedgerEntries(ledgerDir, fsImpl);
  if (entries === null) return { ...base, reason: 'ledger dir unreadable' };
  // An explicit --from/--to is the window as asked for; otherwise the lead file's own window (in base).
  const fromMs = Date.parse(base.windowStartAt);
  const toMs = Date.parse(base.windowEndAt);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return { ...base, reason: 'no window timestamps' };
  const { count, ids } = countStallNudges(entries, slug, fromMs, toMs);
  return { ...base, count, ids };
}

/**
 * Lane55 pinned additive options: opts.leadSession?: string is a verified Codex
 * session identity supplied by the caller (which may use exported parseRecord).
 * opts.codexHome?: string is the canonical Codex home; opts.lead remains legacy.
 * Implementations preserve existing exports and consumer keys; see final-spec.md.
 */
export async function runCensus(opts, fsImpl = realFs()) {
  if (opts.leadSession && !opts.lead) {
    const discovery = { unreadableDirs: [] };
    const matches = listCanonicalCodexTree(opts.codexHome || CANONICAL_CODEX_HOME, fsImpl, discovery)
      .map((file) => codexFirstMeta(file, fsImpl)).filter((item) => !item.error && item.meta.id === opts.leadSession);
    if (discovery.unreadableDirs.length) throw new Error('Codex canonical session tree is not fully readable');
    if (!matches.length) throw new Error(`--lead-session identity was not found: ${opts.leadSession}`);
    opts = { ...opts, lead: matches.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))[0].file };
  }
  if (!opts.lead) throw new Error('--lead or --lead-session is required');
  const leadHost = await detectLeadHost(opts.lead, fsImpl);
  if (opts.leadSession && leadHost !== 'codex') throw new Error('--lead-session requires a Codex lead');
  if (leadHost === 'codex') return runCodexCensus(opts, fsImpl);
  const lead = leadHost === 'codex'
    ? await censusCodexLeadFile(opts.lead, { fsImpl, marker: opts.marker })
    : await censusLeadFile(opts.lead, { fsImpl, marker: opts.marker, from: opts.from, to: opts.to });

  const { specs: dirSpecs, unreadableDirs: specUnreadableDirs } = buildDirSpecs(opts, fsImpl, { includeDefaultSubagents: leadHost !== 'codex' });
  const defaultSpec = dirSpecs.find((s) => s.isDefault) || null;
  const { collected: rawFiles, unreadableDirs: collectUnreadableDirs } = collectTaskFiles(dirSpecs, fsImpl);
  const unreadableDirs = [...new Set([...specUnreadableDirs, ...collectUnreadableDirs])].sort();
  // Code-unit comparator, not localeCompare: sort order must not depend on the running
  // machine's ICU/locale, and the other sorts in this file (Object.keys(...).sort()) are
  // already plain code-unit sorts — this keeps output byte-stable across machines too.
  const orderedFiles = dedupeByRealPath(rawFiles, fsImpl).sort((a, b) => (a.fullPath < b.fullPath ? -1 : a.fullPath > b.fullPath ? 1 : 0));

  const journalCache = new Map();
  const journalFor = (dir) => {
    if (!journalCache.has(dir)) journalCache.set(dir, readJournal(dir, fsImpl));
    return journalCache.get(dir);
  };

  // When --marker is given AND the lead file actually established a window start
  // timestamp, a subagent turn timestamped BEFORE that instant is pre-build activity
  // (the lead's earlier session, an earlier build in the same pane) — without this, the
  // default glob's whole-session reach means "top-tier tokens per build" for a persistent
  // lead pane silently reports every subagent the session EVER spawned, not this build's.
  // An entry with no parseable timestamp is unknown, not excluded — dropping it would be
  // exactly the kind of silent undercount this fix exists to prevent on the lead side.
  // BLOCKER 1(a) (R1 fix round 1): --from must window subagents exactly like --marker
  // does, both ends — otherwise --from/--to's "top-tier tokens per build" silently sums
  // every subagent the persistent lead pane EVER spawned, not this window's.
  const windowCutoff = (opts.marker || opts.from) && lead.windowStartAt ? Date.parse(lead.windowStartAt) : NaN;
  const windowEndCutoff = opts.to ? Date.parse(opts.to) : NaN;
  const hasWindowCutoff = !Number.isNaN(windowCutoff) || !Number.isNaN(windowEndCutoff);

  const nativeKeys = new Set(lead.totalById.keys());
  const subFiles = [];
  for (const f of orderedFiles) {
    let size = 1;
    let unreadable = false;
    try {
      size = fsImpl.statSync(f.fullPath).size;
    } catch {
      // A file that vanished or became unreadable between readdir and stat is not the
      // same as a genuinely zero-byte one — reporting it as 0 turns would misattribute
      // an unknown count as a real zero. Flagged through as unreadable instead, so
      // formatText can render it `n/a`, the same idiom this file already uses for
      // turnsPerHour and the latency sum whenever a real count can't be produced.
      unreadable = true;
      size = 0;
    }
    const agentKey = f.filename.replace(/\.(jsonl|output)$/i, '');
    const role = resolveRole(agentKey, journalFor(f.dir), opts.roleMap);
    if (size === 0) {
      subFiles.push({ file: f.fullPath, role, byId: new Map(), unreadable, excludedByWindow: 0 });
      continue;
    }
    const r = await censusSubFile(f.fullPath, { fsImpl });
    for (const key of r.byId.keys()) nativeKeys.add(key);
    let byId = r.byId;
    let excludedByWindow = 0;
    if (hasWindowCutoff) {
      const kept = new Map();
      for (const [k, entry] of byId) {
        const t = entry.ts ? Date.parse(entry.ts) : NaN;
        if (!Number.isNaN(t) && (t < windowCutoff || t > windowEndCutoff)) {
          excludedByWindow += 1;
          continue;
        }
        kept.set(k, entry);
      }
      byId = kept;
    }
    subFiles.push({ file: f.fullPath, role, byId, excludedByWindow });
  }

  const subTotalsByModel = {};
  const subTotalsByRole = {};
  const roleFileCounts = {};
  let subTotalTurns = 0;
  let unreadableCount = 0;
  let excludedByWindowTotal = 0;
  const perFile = [];
  for (const sf of subFiles) {
    const byModel = aggByModel(sf.byId);
    mergeAggInto(subTotalsByModel, byModel);
    // Under --marker, a file whose every entry was pre-window belongs to an earlier build:
    // it keeps its perFile row (turns 0, excludedByWindow N) but adds no role row or count.
    const whollyPreWindow = sf.byId.size === 0 && (sf.excludedByWindow || 0) > 0;
    if (!whollyPreWindow) {
      if (!subTotalsByRole[sf.role]) subTotalsByRole[sf.role] = newAgg();
      for (const a of Object.values(byModel)) addAggInto(subTotalsByRole[sf.role], a);
      roleFileCounts[sf.role] = (roleFileCounts[sf.role] || 0) + 1;
    }
    subTotalTurns += sf.byId.size;
    if (sf.unreadable) unreadableCount += 1;
    excludedByWindowTotal += sf.excludedByWindow || 0;
    perFile.push({ file: sf.file, role: sf.role, turns: sf.unreadable ? null : sf.byId.size, byModel, excludedByWindow: sf.excludedByWindow || 0 });
  }

  // Lane 62: declared detached roles ride the same reducers (per model, per role, per file), source 'declared'.
  const declared = await readDeclaredRoles(opts, { host: 'claude', sessionId: path.basename(opts.lead).replace(/\.jsonl$/i, '') }, { raw: orderedFiles, keys: nativeKeys }, fsImpl);
  for (const f of declared.files) {
    mergeAggInto(subTotalsByModel, f.byModel);
    if (!subTotalsByRole[f.role]) subTotalsByRole[f.role] = newAgg();
    for (const a of Object.values(f.byModel)) addAggInto(subTotalsByRole[f.role], a);
    roleFileCounts[f.role] = (roleFileCounts[f.role] || 0) + 1;
    subTotalTurns += f.turns;
    perFile.push({ file: f.file, role: f.role, turns: f.turns, byModel: f.byModel, excludedByWindow: 0, source: 'declared', host: f.host, sessionId: f.sessionId });
  }

  const leadTotalByModel = aggByModel(lead.totalById);
  const leadWindowByModel = aggByModel(lead.windowById);

  // Combined split: the build-window lead cost (the only lead cost comparable to
  // subagents, which exist only during the build) plus every subagent's cost.
  const combined = {};
  mergeAggInto(combined, leadWindowByModel);
  mergeAggInto(combined, subTotalsByModel);

  // MAJOR 6 (R1 fix round 1): windowLastAt is the window's own last in-window timestamp;
  // ?? lead.lastAt covers the unmarked/unmarkered case where windowLastAt is unset.
  const endAt = lead.windowLastAt ?? lead.lastAt;
  let turnsPerHour = null;
  let wallClockHours = null;
  if (lead.windowStartAt && endAt) {
    const hours = (new Date(endAt) - new Date(lead.windowStartAt)) / 3600000;
    if (hours > 0) {
      turnsPerHour = lead.windowById.size / hours;
      wallClockHours = hours;
    }
  }

  const codex = leadHost === 'codex';
  const observedWindowTokens = codex && lead.windowTokenRecordCount > 0
    ? Object.values(leadWindowByModel).reduce((n, a) => n + totalTokens(a), 0)
    : null;
  // Lane 51 (m2/M6): the wake/stopBlock/other split's per-model share of this window's
  // top-tier tokens, and the wake and other sides' cache_creation per turn (M6 — a hold can
  // turn a warm cache read into a cold cache_creation write, which the raw token sum alone
  // cannot see).
  const wakeSplit = codex ? null : {
    wakeTurns: lead.wakeSplit.wakeTurns,
    stopBlockTurns: lead.wakeSplit.stopBlockTurns,
    otherTurns: lead.wakeSplit.otherTurns,
    byModel: lead.wakeSplit.byModel,
    shareByModel: shareByModelFor(lead.wakeSplit.byModel, leadWindowByModel),
    cacheCreationPerTurn: cacheCreationPerTurnFor(lead.wakeSplit.byModel, lead.wakeSplit.wakeTurns, lead.wakeSplit.otherTurns),
    coalescable: lead.wakeSplit.coalescable,
  };
  return {
    lead: {
      host: leadHost,
      totalTurns: codex ? null : lead.totalById.size,
      windowTurns: codex ? null : lead.windowById.size,
      leadTurns: lead.leadTurns,
      leadTurnsTotal: lead.leadTurnsTotal,
      wakeSplit,
      wakeSplitUnavailable: codex ? 'codex lead' : null,
      wakes: lead.wakes,
      wakesNoteFlush: lead.wakes - lead.wakesDoneTick,
      wakesDoneTick: lead.wakesDoneTick,
      wakesTotal: lead.wakesTotal,
      stopBlocks: lead.stopBlocks,
      stopBlocksTotal: lead.stopBlocksTotal,
      nativeTurnCount: codex ? null : lead.nativeTurnCount ?? null,
      nativeTurnCountWindow: codex ? null : lead.nativeTurnCountWindow ?? null,
      observedLeadRequests: codex && lead.windowTokenRecordCount > 0 ? lead.windowById.size : null,
      observedLeadTokens: observedWindowTokens,
      observedNativeTurnCount: codex && lead.tokenRecordCount > 0 ? lead.nativeTurnCount : null,
      observedNativeTurnCountWindow: codex && lead.windowTokenRecordCount > 0 ? lead.nativeTurnCountWindow : null,
      coverageSupported: lead.coverageSupported ?? true,
      coverageReason: lead.coverageReason ?? null,
      totalByModel: codex ? null : leadTotalByModel,
      windowByModel: codex ? null : leadWindowByModel,
      observedTotalByModel: codex ? leadTotalByModel : null,
      observedWindowByModel: codex ? leadWindowByModel : null,
      markerFound: lead.markerFound,
      windowStartAt: lead.windowStartAt,
      windowEndAt: endAt,
      leadLastMessageAt: lead.lastAt,
      turnsPerHour: codex ? null : turnsPerHour,
      wallClockHours,
    },
    subagents: {
      fileCount: orderedFiles.length + declared.files.length,
      unreadable: unreadableCount,
      unreadableDirs,
      incomplete: unreadableCount > 0 || unreadableDirs.length > 0,
      totalTurns: codex ? null : subTotalTurns,
      excludedByWindow: excludedByWindowTotal,
      totalByModel: codex ? null : subTotalsByModel,
      totalByRole: codex ? null : subTotalsByRole,
      roleFileCounts: codex ? null : roleFileCounts,
      perFile,
    },
    combined: codex ? null : combined,
    tokenDefinition: TOKEN_DEFINITION, measurementScope: declared.scope, roleSessions: declared.results,
    stallNudges: computeStallNudges(opts, lead, fsImpl),
    marker: opts.marker || null,
    leadPath: opts.lead,
    tasksPaths: [...(opts.tasksDirs || [])],
    defaultSubagentsDir: defaultSpec ? defaultSpec.dir : null,
  };
}

function tokenRow(label, a) {
  return `| ${label} | ${a.input_tokens} | ${a.cache_creation_input_tokens} | ${a.cache_read_input_tokens} | ${a.output_tokens} |`;
}

// Lane 51 (W1/m2/M4/M6): the "Wake-opened turns against the rest" markdown block. Lines only
// (no leading/trailing blanks); the caller spreads them into its own md array.
function formatWakeSplitSection(wakeSplit) {
  const md = [];
  md.push('### Wake-opened turns against the rest (window)');
  md.push('');
  md.push(`- wakeTurns: ${wakeSplit.wakeTurns}, stopBlockTurns: ${wakeSplit.stopBlockTurns}, otherTurns: ${wakeSplit.otherTurns}`);
  md.push('');
  md.push('| bucket | model | input | cache_creation | cache_read | output | sum | share |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const bucket of ['wake', 'stopBlock', 'other']) {
    for (const model of Object.keys(wakeSplit.byModel[bucket]).sort()) {
      const a = wakeSplit.byModel[bucket][model];
      const share = wakeSplit.shareByModel[model] ? wakeSplit.shareByModel[model][bucket] : 0;
      md.push(`| ${bucket} | ${model} | ${a.input_tokens} | ${a.cache_creation_input_tokens} | ${a.cache_read_input_tokens} | ${a.output_tokens} | ${totalTokens(a)} | ${share.toFixed(1)}% |`);
    }
  }
  md.push('');
  const ccpt = wakeSplit.cacheCreationPerTurn;
  const ccptLine = (side) => Object.keys(ccpt[side]).sort()
    .map((m) => `${m}=${ccpt[side][m] === null ? 'n/a' : ccpt[side][m].toFixed(1)}`).join(', ') || '(none)';
  md.push(`- cache_creation per turn (M6) — wake: ${ccptLine('wake')}; other: ${ccptLine('other')}`);
  const c = wakeSplit.coalescable;
  const byModelSum = (byModel) => Object.keys(byModel).sort().map((m) => `${m}=${totalTokens(byModel[m])}`).join(', ') || '(none)';
  md.push(`- coalescable (W1b, hold ${c.holdMinutes}m, RESULT wakes only, Done-tick excluded): turns ${c.turns}, upper ${byModelSum(c.upperByModel)}, lower ${byModelSum(c.lowerByModel)}; ceiling (every RESULT wake turn) turns ${c.resultTurns}, ${byModelSum(c.resultByModel)}`);
  return md;
}

function codexTokenCell(value) {
  return value === null ? 'unavailable' : value;
}

function codexTokenRow(label, aggregate) {
  return `| ${label} | ${aggregate.native_input_tokens} | ${codexTokenCell(aggregate.input_tokens)} | ${codexTokenCell(aggregate.cache_creation_input_tokens)} | ${codexTokenCell(aggregate.cache_read_input_tokens)} | ${aggregate.output_tokens} | ${aggregate.derived_total_tokens} | ${codexTokenCell(aggregate.reasoning_output_tokens)} | ${codexTokenCell(aggregate.total_tokens)} | ${aggregate.unavailable.join(', ') || '(none)'} |`;
}

function sumAgg(a) {
  return a.input_tokens + a.cache_creation_input_tokens + a.cache_read_input_tokens;
}

function totalTokens(a) {
  return sumAgg(a) + a.output_tokens;
}

// Lane 51 (m2): each model's wake/stopBlock/other share of ITS OWN window total tokens
// (never hardcoding a model name — R2 reads whichever model it names off this object).
// Percent, one decimal (Math.round(x * 1000) / 10); a model absent from a bucket is 0.
function shareByModelFor(byModelBuckets, windowByModel) {
  const out = {};
  for (const model of Object.keys(windowByModel)) {
    const denom = totalTokens(windowByModel[model]);
    const pct = (bucket) => {
      const a = byModelBuckets[bucket][model];
      if (!a || denom <= 0) return 0;
      return Math.round((totalTokens(a) / denom) * 1000) / 10;
    };
    out[model] = { wake: pct('wake'), stopBlock: pct('stopBlock'), other: pct('other') };
  }
  return out;
}

// Lane 51 (M6): cache_creation_input_tokens per turn, wake side and other side only (a
// stopBlock turn is note-driven but untouched by any hold, so M6's cost concern does not
// apply to it). `null` when that side has no turns, never a division by zero.
function cacheCreationPerTurnFor(byModelBuckets, wakeTurns, otherTurns) {
  const perTurn = (byModel, turns) => {
    const out = {};
    for (const [model, a] of Object.entries(byModel)) out[model] = turns > 0 ? a.cache_creation_input_tokens / turns : null;
    return out;
  };
  return { wake: perTurn(byModelBuckets.wake, wakeTurns), other: perTurn(byModelBuckets.other, otherTurns) };
}

// Lane 62 scope/definition lines, shared by both hosts. A hand-built legacy report without the additive
// keys prints nothing new, so the text of an old census never changes.
function reportDeclared(report) {
  return report.measurementScope ? { scope: report.measurementScope, results: report.roleSessions || [] } : null;
}

function scopeSummaryLines(report) {
  const declared = reportDeclared(report);
  if (!declared) return [];
  const partial = declared.results.filter((r) => r.status !== 'complete').length;
  const lines = [
    `- tokenDefinition: ${report.tokenDefinition.id} (${report.tokenDefinition.formula})`,
    `- measurementScope: ${declared.scope.roles}; window ${declared.scope.from || '(lead window)'} .. ${declared.scope.to || '(lead window)'}`,
    `- roleSessions: ${declared.results.length} declared (${declared.results.length - partial} complete, ${partial} PARTIAL, ${declared.scope.omitted.length} omitted)`,
  ];
  for (const r of declared.results) lines.push(`- roleSession: ${r.host} ${r.sessionId} ${r.role} ${r.status}${r.reasons.length ? ` (${r.reasons.join(', ')})` : ''}; requests ${r.requests ?? 'unavailable'}, duplicateRequests ${r.duplicateRequests}`);
  for (const o of declared.scope.omitted) lines.push(`- omitted: ${o.host} ${o.sessionId} (${o.reason})`);
  for (const limitation of declared.scope.limitations) lines.push(`- limitation: ${limitation}`);
  return lines;
}

function activitySummaryLines(activity) {
  if (!activity) return [];
  const count = (n) => (n === null ? 'unavailable' : n);
  const lines = [`- activity: coverage ${activity.coverage}; baselineRuleGaps ${count(activity.baselineRuleGaps)} (every consecutive-event gap over 120 min, any kind); observedSilentGaps ${count(activity.observedSilentGaps)}; toolRunningGaps ${count(activity.toolRunningGaps)}; causal attribution ${activity.causalAttribution}`];
  for (const reason of activity.reasons) lines.push(`- activity reason: ${reason}`);
  for (const i of activity.intervals) lines.push(`- activity interval: ${i.from} .. ${i.to} ${i.kind}${i.rightCensored ? ' right-censored' : ''} ${Math.round(i.durationMs / 60000)} min rows ${i.sourceRows.join(',')}`);
  return lines;
}

function formatCodexText(report) {
  const md = [];
  const supported = report.lead.coverageSupported;
  const temporalComplete = report.lead.codex.discovery.scope.complete;
  const unavailable = report.lead.codex.unavailable;
  const unsupported = Object.entries(report.lead.codex.fields || {}).filter(([, value]) => value.status === 'UNSUPPORTED').map(([name]) => name);
  const declaredView = reportDeclared(report);
  const roleReasons = declaredView && declaredIsPartial(declaredView) ? declaredReasons(declaredView) : [];
  md.push(temporalComplete && !roleReasons.length
    ? `VERDICT: COUNTED ${report.lead.windowTurns} Codex responses (leadTurns ${report.lead.leadTurns})${unsupported.length ? `; UNSUPPORTED ${unsupported.join(', ')}` : ''}, ${report.subagents.fileCount} subagent files, leadLastMessageAt: ${report.lead.leadLastMessageAt || 'unknown'}`
    : `VERDICT: PARTIAL Codex census (${[report.lead.codex.discovery.scope.reason, ...roleReasons].filter(Boolean).join('; ') || 'temporal coverage unavailable'}), ${report.subagents.fileCount} subagent files, leadLastMessageAt: ${report.lead.leadLastMessageAt || 'unknown'}`);
  md.push('', '# Build census', '', '## Summary', '');
  md.push('- leadHost: codex');
  md.push(`- leadSessionId: ${report.lead.sessionId}`);
  md.push(`- coverageSupported: ${supported}`);
  if (!supported) md.push(`- unavailable: ${unavailable.join('; ')}`);
  md.push(`- leadTurns: ${report.lead.leadTurns}`);
  md.push(`- wallClockHours: ${report.lead.wallClockHours === null ? 'n/a' : report.lead.wallClockHours.toFixed(2)}`);
  md.push(`- wakes: ${report.lead.wakes} (${report.lead.wakesNoteFlush} note-flush, ${report.lead.wakesDoneTick} Done-tick)`);
  md.push('- wakeSplit: unavailable (codex lead)');
  md.push(`- stopBlocks: ${report.lead.stopBlocks}`);
  md.push(`- stallNudges: ${stallNudgesLabel(report.stallNudges)}`);
  md.push(`- by-model: ${supported ? Object.keys(report.combined).sort().map((model) => `${model}=${report.combined[model].derived_total_tokens}`).join(', ') || '(none)' : 'partial/unavailable'}`);
  md.push(`- by-role: ${supported ? Object.keys(report.subagents.totalByRole).sort().map((role) => `${role}=${report.subagents.totalByRole[role].derived_total_tokens}`).join(', ') || '(none)' : 'partial/unavailable'}`);
  md.push(`- subagentFiles: ${report.subagents.fileCount}`);
  md.push(...scopeSummaryLines(report), ...activitySummaryLines(report.activity), '');
  md.push(`Lead: \`${path.basename(report.leadPath)}\` | Tasks dirs: ${report.tasksPaths.length ? report.tasksPaths.map((item) => `\`${item}\``).join(', ') : '(none)'}`);
  md.push(`Window: ${report.lead.windowStartAt || '(none)'} .. ${report.lead.windowEndAt || '(none)'}`, '');
  md.push('## Codex discovery', '');
  const discovery = report.lead.codex.discovery;
  md.push(`- scope: ${discovery.scope.kind}; complete ${discovery.scope.complete}; reason ${discovery.scope.reason || '(none)'}`);
  const identity = report.lead.codex.identity;
  md.push(`- identity: ${identity.expectedId} verified from ${identity.paths.length} file(s)`);
  md.push(`- home: ${discovery.home}`);
  md.push(`- horizonUtcDays: ${discovery.horizonUtcDays.join(', ') || 'unavailable'}`);
  md.push(`- candidates: ${discovery.candidates}`);
  for (const file of discovery.malformedFiles) md.push(`- malformed: ${file}`);
  for (const file of discovery.unreadableFiles) md.push(`- unreadable: ${file}`);
  for (const dir of discovery.unreadableDirs || []) md.push(`- unreadable directory: ${dir}`);
  for (const item of discovery.excluded) md.push(`- excluded: ${item.file} (${item.reason})`);
  md.push('', '## Lead tokens by model — observed per-response usage', '');
  md.push('| model | native_input | exclusive_input | cache_creation | cache_read | output | derived_total | reasoning_output | raw_total | unavailable |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const model of Object.keys(report.lead.observedWindowByModel).sort()) md.push(codexTokenRow(model, report.lead.observedWindowByModel[model]));
  md.push('', `## Subagents (${report.subagents.fileCount} files, ${report.subagents.totalTurns} observed responses)`, '');
  md.push('| file | role | nickname | parentId | depth | turns |', '|---|---|---|---|---|---|');
  for (const file of report.subagents.perFile) md.push(`| ${file.file} | ${file.role} | ${file.agentNickname || 'unavailable'} | ${file.parentId} | ${file.depth} | ${file.turns} |`);
  if (supported) {
    md.push('', '## Combined native totals (lead window + subagents)', '', '| model | output_tokens | derived_total_tokens | unavailable optional fields |', '|---|---|---|---|');
    for (const model of Object.keys(report.combined).sort()) md.push(`| ${model} | ${report.combined[model].output_tokens} | ${report.combined[model].derived_total_tokens} | ${report.combined[model].unavailable.join(', ') || '(none)'} |`);
  }
  return md.join('\n');
}

function stallNudgesLabel(s) {
  if (!s || s.count === null) return `unavailable (${s && s.reason ? s.reason : 'not counted'})`;
  return `${s.count} to ${s.slug} (slug ${s.slugSource}, ledger ${s.ledgerDir})${s.count ? `: ${s.ids.join(', ')}` : ''}`;
}

export function formatText(report) {
  if (report.lead.host === 'codex') return formatCodexText(report);
  const md = [];
  const unread = report.subagents.unreadable || 0;
  const unreadDirs = report.subagents.unreadableDirs || [];
  const codexTokensUnsupported = report.lead.host === 'codex' && !report.lead.coverageSupported;
  const leadLastMessageAt = report.lead.leadLastMessageAt || report.lead.windowEndAt || null;
  // C2 (scripts/work-record.mjs's `accept --census`) recognises a build-census report by
  // the literal PREFIX `VERDICT: COUNTED ` on line 1 — never by `# Build census` below,
  // which is only this report's section title. Keep that prefix byte-identical; the rest
  // of the line is free text. `windowTurns` is the de-duped API-request count (NOT the
  // same number as `leadTurns`, printed alongside it here so the two aren't mistaken for
  // one another on a skim).
  const leadTurnsLabel = report.lead.leadTurns === null ? 'unsupported' : report.lead.leadTurns;
  const claudeDeclared = reportDeclared(report);
  const claudeRoleReasons = claudeDeclared && declaredIsPartial(claudeDeclared) ? declaredReasons(claudeDeclared) : [];
  if (claudeRoleReasons.length && !codexTokensUnsupported) {
    md.push(`VERDICT: PARTIAL Claude census (${claudeRoleReasons.join('; ')}), ${report.subagents.fileCount} subagent files, leadLastMessageAt: ${leadLastMessageAt || 'unknown'}`);
  } else if (codexTokensUnsupported) {
    md.push(`VERDICT: UNSUPPORTED Codex complete census (${report.lead.coverageReason}), ${report.subagents.fileCount} subagent files, leadLastMessageAt: ${leadLastMessageAt || 'unknown'}`);
  } else {
    md.push(
      `VERDICT: COUNTED ${report.lead.windowTurns} lead requests (leadTurns ${leadTurnsLabel}), ${report.subagents.fileCount} subagent files` +
      (unread ? ` (${unread} UNREADABLE — subagent totals below are incomplete)` : '') +
      (unreadDirs.length ? ` (${unreadDirs.length} director${unreadDirs.length === 1 ? 'y' : 'ies'} UNREADABLE — census INCOMPLETE)` : '') +
      `, leadLastMessageAt: ${leadLastMessageAt || 'unknown'}`,
    );
  }
  md.push('');
  md.push('# Build census');
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push(`- leadTurns: ${leadTurnsLabel}`);
  if (report.lead.host === 'codex') {
    md.push('- leadHost: codex');
    md.push(`- leadTokens: unsupported (${report.lead.coverageReason})`);
    md.push(`- observedLeadTokens: ${report.lead.observedLeadTokens ?? 'unknown'}${report.lead.observedLeadTokens === null ? '' : ' (verified deduplicated per-response usage; incomplete coverage)'}`);
    md.push(`- observedLeadRequests: ${report.lead.observedLeadRequests ?? 'unknown'} (not complete lead turns)`);
    md.push('- leadTurnsLimit: unsupported (Codex response records have no assistant/user role ordering)');
    md.push(`- observedNativeTurnCountWindow: ${report.lead.observedNativeTurnCountWindow ?? 'unknown'} (native turn ids; not leadTurns)`);
    md.push('- codexSubagents: unsupported (native child transcript discovery/usage is not established; Codex --tasks is rejected)');
  }
  md.push(`- wallClockHours: ${report.lead.wallClockHours !== null ? report.lead.wallClockHours.toFixed(2) : 'n/a'}`);
  md.push(`- wakes: ${report.lead.wakes} (${report.lead.wakesNoteFlush} note-flush, ${report.lead.wakesDoneTick} Done-tick)`);
  md.push(`- wakeSplit: wake ${report.lead.wakeSplit.wakeTurns}, stopBlock ${report.lead.wakeSplit.stopBlockTurns}, other ${report.lead.wakeSplit.otherTurns}`
    + ` (coalescable ${report.lead.wakeSplit.coalescable.turns} at hold ${report.lead.wakeSplit.coalescable.holdMinutes}m — see "Wake-opened turns" below)`);
  md.push(`- stopBlocks: ${report.lead.stopBlocks}`);
  md.push(`- stallNudges: ${stallNudgesLabel(report.stallNudges)}`);
  const modelLine = codexTokensUnsupported
    ? `unsupported (${report.lead.coverageReason})`
    : Object.keys(report.combined).sort().map((m) => `${m}=${totalTokens(report.combined[m])}`).join(', ') || '(none)';
  md.push(`- by-model: ${modelLine}`);
  const roleLine = report.lead.host === 'codex'
    ? 'unsupported (native Codex child usage is not established)'
    : Object.keys(report.subagents.totalByRole).sort().map((r) => `${r}=${totalTokens(report.subagents.totalByRole[r])}`).join(', ') || '(none)';
  md.push(`- by-role: ${roleLine}`);
  md.push(`- subagentFiles: ${report.subagents.fileCount}`);
  md.push(...scopeSummaryLines(report));
  if (unread || unreadDirs.length) {
    const parts = [];
    if (unread) parts.push(`${unread} subagent file(s) unreadable`);
    if (unreadDirs.length) parts.push(`${unreadDirs.length} subagent director${unreadDirs.length === 1 ? 'y' : 'ies'} unreadable`);
    md.push(`- INCOMPLETE: ${parts.join('; ')} — subagent and combined totals exclude them`);
  }
  md.push('');
  const tasksLine = report.tasksPaths.length ? report.tasksPaths.map((p) => `\`${p}\``).join(', ') : '(none)';
  md.push(`Lead: \`${path.basename(report.leadPath)}\` | Tasks dirs: ${tasksLine}${report.defaultSubagentsDir ? ` | Default subagents dir: \`${report.defaultSubagentsDir}\`` : ''}`);
  if (report.marker) md.push(`Window marker: given (not echoed)`);
  md.push('');
  md.push('## Lead transcript');
  md.push('');
  md.push(`- Total assistant turns, deduped (whole file): **${report.lead.totalTurns ?? 'unsupported'}**`);
  md.push(`- Window assistant turns, deduped: **${report.lead.windowTurns ?? 'unsupported'}**`);
  if (report.lead.leadTurns === null) {
    md.push('- leadTurns (conversational runs — see docs/census.md): **unsupported** (Codex response records do not establish assistant/user role ordering)');
    md.push(`- Observed native turn ids (not conversational leadTurns): **${report.lead.observedNativeTurnCountWindow ?? 'unknown'}**${report.marker ? ` (of ${report.lead.observedNativeTurnCount ?? 'unknown'} in the whole file, unwindowed)` : ''}`);
  } else {
    md.push(`- leadTurns (conversational runs — see docs/census.md): **${report.lead.leadTurns}**${report.marker ? ` (of ${report.lead.leadTurnsTotal} in the whole file, unwindowed)` : ''}`);
  }
  md.push(`- Wakes (turns opened by a note-flush or Done-tick line, see docs/census.md): **${report.lead.wakes}** (${report.lead.wakesNoteFlush} note-flush, ${report.lead.wakesDoneTick} Done-tick)${report.marker ? ` (of ${report.lead.wakesTotal} in the whole file, unwindowed)` : ''}`);
  md.push(`- Stop-blocks (multi-inbox Stop hook blocks): **${report.lead.stopBlocks}**${report.marker ? ` (of ${report.lead.stopBlocksTotal} in the whole file, unwindowed)` : ''}`);
  md.push(`- Stall nudges received (ledger \`collect-*-stall-*\` ASKs to the lead's slug, in the window): **${stallNudgesLabel(report.stallNudges)}**`);
  md.push(`- Window: ${report.lead.windowStartAt || '(none)'} .. ${report.lead.windowEndAt || '(none)'}`);
  md.push(`- Turns/hour in window: **${report.lead.turnsPerHour !== null ? report.lead.turnsPerHour.toFixed(2) : 'n/a'}**`);
  md.push('');
  if (codexTokensUnsupported) {
    md.push(`- Lead token usage: **unsupported** (${report.lead.coverageReason})`);
    md.push('');
    md.push('## Codex child usage');
    md.push('');
    md.push('Native Codex child transcript discovery and usage attribution are unsupported; no child, role, or combined-spend table is emitted.');
    return md.join('\n');
  }
  md.push('### Lead tokens by model — whole file (deduped)');
  md.push('');
  md.push('| model | input | cache_creation | cache_read | output |');
  md.push('|---|---|---|---|---|');
  for (const m of Object.keys(report.lead.totalByModel).sort()) md.push(tokenRow(m, report.lead.totalByModel[m]));
  md.push('');
  md.push('### Lead tokens by model — window (deduped)');
  md.push('');
  md.push('| model | input | cache_creation | cache_read | output |');
  md.push('|---|---|---|---|---|');
  for (const m of Object.keys(report.lead.windowByModel).sort()) md.push(tokenRow(m, report.lead.windowByModel[m]));
  md.push('');
  md.push(...formatWakeSplitSection(report.lead.wakeSplit));
  md.push('');
  md.push(`## Subagents (${report.subagents.fileCount} files${unread ? `, ${unread} unreadable` : ''}, ${report.subagents.totalTurns} turns total, deduped)`);
  if (unread) md.push(`\n_Incomplete: ${unread} subagent file(s) could not be read; their tokens are absent from this table and from the combined split below._`);
  if (unreadDirs.length) md.push(`\n_INCOMPLETE: ${unreadDirs.length} default subagent director${unreadDirs.length === 1 ? 'y' : 'ies'} could not be enumerated; this census is incomplete by an unknown amount._`);
  md.push('');
  const roleCountsLine = Object.keys(report.subagents.roleFileCounts).sort().map((r) => `${r}=${report.subagents.roleFileCounts[r]}`).join(', ') || '(none)';
  md.push(`Roles: ${roleCountsLine}`);
  if (report.marker) {
    // A file whose entries are ALL pre-window still appears above with turns:0 — it never
    // silently disappears — but the exclusion itself is invisible unless named here.
    const excludedLines = report.subagents.perFile.filter((f) => f.excludedByWindow).map((f) => `${f.file}=${f.excludedByWindow}`);
    md.push(`Window-excluded subagent turns (timestamped before the marker window; dropped from every subagent total and the combined split above): ${excludedLines.length ? excludedLines.join(', ') : '(none)'}`);
  }
  md.push('');
  md.push('| file | role | turns |');
  md.push('|---|---|---|');
  for (const f of report.subagents.perFile) md.push(`| ${f.file} | ${f.role} | ${f.turns === null ? 'n/a' : f.turns} |`);
  md.push('');
  md.push('### Subagent tokens by model — totals (deduped)');
  md.push('');
  md.push('| model | input | cache_creation | cache_read | output |');
  md.push('|---|---|---|---|---|');
  for (const m of Object.keys(report.subagents.totalByModel).sort()) md.push(tokenRow(m, report.subagents.totalByModel[m]));
  md.push('');
  md.push('### Subagent tokens by role — totals (deduped)');
  md.push('');
  md.push('| role | input | cache_creation | cache_read | output |');
  md.push('|---|---|---|---|---|');
  for (const r of Object.keys(report.subagents.totalByRole).sort()) md.push(tokenRow(r, report.subagents.totalByRole[r]));
  md.push('');
  md.push('## Combined split (lead window + subagents)');
  md.push('');
  md.push('| model | output_tokens | input+cache_creation+cache_read |');
  md.push('|---|---|---|');
  for (const m of Object.keys(report.combined).sort()) {
    md.push(`| ${m} | ${report.combined[m].output_tokens} | ${sumAgg(report.combined[m])} |`);
  }
  return md.join('\n');
}

// Deterministic JSON: object keys sorted recursively so two runs over the same input are
// byte-identical regardless of any incidental insertion-order difference (census-complete
// spec item 5).
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k]);
    return out;
  }
  return value;
}

export function formatJson(report) {
  return JSON.stringify(sortKeysDeep(report), null, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const opts = { lead: null, tasksDirs: [], marker: null, from: null, to: null, out: null, json: null, roleMap: null, ledgerDir: null, leadSlug: null };
  const need = (flag) => {
    const v = argv[++i];
    if (!v) throw new Error(`${flag} needs a value`);
    return v;
  };
  let i;
  for (i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lead') opts.lead = need('--lead');
    else if (a === '--lead-session') opts.leadSession = need('--lead-session');
    else if (a === '--codex-home') opts.codexHome = need('--codex-home');
    else if (a === '--tasks') opts.tasksDirs.push(need('--tasks'));
    else if (a === '--marker') opts.marker = need('--marker');
    else if (a === '--from') opts.from = need('--from');
    else if (a === '--to') opts.to = need('--to');
    else if (a === '--ledger-dir') opts.ledgerDir = need('--ledger-dir');
    else if (a === '--lead-slug') opts.leadSlug = need('--lead-slug');
    else if (a === '--record') opts.record = need('--record');
    else if (a === '--repo') opts.repo = need('--repo');
    else if (a === '--claude-root') opts.claudeRoot = need('--claude-root');
    else if (a === '--out') opts.out = need('--out');
    else if (a === '--json') opts.json = need('--json');
    else if (a === '--role-map') {
      const raw = need('--role-map');
      try {
        opts.roleMap = JSON.parse(raw);
      } catch {
        throw new Error(`--role-map is not valid JSON: ${raw}`);
      }
    } else throw new Error(`unknown argument: ${a}`);
  }
  if (!opts.lead && !opts.leadSession) throw new Error('--lead <session.jsonl> or --lead-session <id> is required');
  return opts;
}

export async function main(argv = process.argv.slice(2), { fsImpl = realFs(), now = Date.now(), write = (s) => console.log(s) } = {}) {
  const opts = parseArgs(argv);
  const report = await runCensus(opts, fsImpl);
  // M1: a --marker that matches nothing in the lead file leaves the window empty, which
  // would otherwise print a confident VERDICT of 0 lead turns and a zeroed combined
  // split — the exact shape spec.md's "Done" comparison depends on. Loud failure instead
  // of a silent, plausible-looking zero. The marker text itself is never echoed.
  if (opts.marker && !report.lead.markerFound) {
    throw new Error(`--marker text not found in ${path.basename(opts.lead)} (window would be empty)`);
  }
  // MINOR 2 (R1 fix round 1): --from gets its own message, distinct from --marker's.
  if (opts.from && !report.lead.markerFound) {
    throw new Error(`--from window not found in ${path.basename(opts.lead)} (window would be empty)`);
  }
  // MINOR 3 (R1 fix round 1): an empty --to-only window, or --to before --to's own
  // messages start, must not print zeroed sums with no error.
  if ((opts.from || opts.to) && report.lead.windowTurns === 0) {
    throw new Error(`--from/--to window holds no assistant messages in ${path.basename(opts.lead)}`);
  }
  const wrote = [];
  if (opts.json) {
    fsImpl.writeFileSync(opts.json, formatJson(report) + '\n');
    wrote.push(opts.json);
  }
  const text = formatText(report);
  if (opts.out) {
    fsImpl.writeFileSync(opts.out, text.endsWith('\n') ? text : `${text}\n`);
    wrote.push(opts.out);
  }
  if (wrote.length) {
    for (const p of wrote) write(`wrote: ${p}`);
  } else {
    write(text);
  }
  return 0;
}

/**
 * Only when RUN, never when imported — win32-safe (a bare `import.meta.url ===
 * file://${argv[1]}` check never matches on win32, since argv[1] is a backslash path).
 * Same shape as scripts/token-census.mjs's isMainModule.
 */
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const real = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const canon = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  const self = real(fileURLToPath(import.meta.url));
  const argv1 = real(entry);
  return canon(self) === canon(argv1);
}

if (isMainModule()) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`build-census: ${String(err && err.message ? err.message : err)}\n`);
      process.exit(1);
    },
  );
}
