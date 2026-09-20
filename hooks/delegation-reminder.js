#!/usr/bin/env node
// delegation-reminder — the ONE hook process that keeps routing and the goal card in front of a
// session. Extended, never duplicated: a second hook process is a second timeout, a second failure
// mode and a second thing to switch off.
//
// WHAT CHANGED AND WHY (2026-09-20). This hook used to inject a 671-character delegation-routing
// paragraph on EVERY user prompt. Two problems, both measured rather than felt:
//   1. It is wallpaper. A standing text a model reads 300 times in a session stops steering it, and
//      the drift that actually cost a week (a second execution engine, built while the goal was the
//      simplest architecture possible) happened during an AUTONOMOUS stretch, where UserPromptSubmit
//      never fires at all.
//   2. It is expensive in exactly the place it does least: ~168 tokens x every prompt.
// So the per-prompt line shrinks to one short sentence, and the goal card — five lines, read from
// the project's own file — is injected where drift starts instead: at session start (including the
// `compact` source, which is how a session re-enters after compaction), into every subagent at
// spawn, and once per 40 tool batches during a long autonomous stretch.
//
// EVENTS, VERIFIED AGAINST https://code.claude.com/docs/en/hooks (2026-09-20):
//   SessionStart    "Matcher value: startup, resume, clear, compact, fork"; decision control
//                   "Context only | hookSpecificOutput.additionalContext adds context for Claude".
//   SubagentStart   "SubagentStart hooks can't block subagent creation, but they can inject context
//                   into the subagent." `additionalContext` is "String added to the subagent's
//                   context at the start of its conversation, before its first prompt."
//   PostToolBatch   "Runs once after every tool call in a batch has resolved, before Claude Code
//                   sends the next request to the model." `additionalContext`: "Context string
//                   injected once before the next model call."
//   PostCompact     "No decision control. Used for side effects like logging or cleanup" — it CANNOT
//                   inject. It is handled here for its one legitimate side effect (resetting the
//                   counter) and emits nothing. The post-compaction injection is SessionStart's
//                   `compact` source.
//   UserPromptSubmit  unchanged path, short line.
//
// HARD RULES THIS FILE OBEYS:
//   * NEVER exit 2. On PostToolBatch exit 2 "Stops the agentic loop before the next model call" and
//     on UserPromptSubmit it "Blocks prompt processing and erases the prompt". A goal reminder that
//     can kill a turn is a worse problem than the one it solves.
//   * NEVER block: no `decision`, no `continue: false`, ever.
//   * FAIL OPEN: any error, any unreadable state, anything unexpected — exit 0, silent.
//   * NO network, NO child process.
//   * SWITCH FILES COME FIRST, BEFORE ANY SIDE EFFECT. `~/.agents/ws-off` (master) makes this hook a
//     no-op in every sense: no output at all, no state written, no file swept, nothing read past the
//     two `existsSync` calls that found the switch. `~/.agents/ws-off-goalcard` stops the card and
//     its state while leaving the routing line. The contract says the switch "must work exactly when
//     a hook is misbehaving", and for this hook misbehaving most plausibly means the disk side
//     (review D, MAJOR 1).
const fs = require("fs");
const path = require("path");
const os = require("os");
const { pathToFileURL } = require("url");

// ─────────────────────────────────────────────────────────────────────────────
// The per-prompt line
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 246 bytes, down from 510. The classification triad is the routing policy; the two clauses that
 * encode the anti-patterns ("before any code", "a tier above the writer") are kept because an agent
 * only opens the skill AFTER it has decided how to route, and the plugin-scoped ids are kept because
 * they are what the Skill tool takes (review D, MINOR 8).
 */
const ROUTING =
  "Routing: multi-file build → delegation:team-build before any code; independent research/review/audit lanes → delegation:delegate, all lanes in one message, verified a tier above the writer; single-file edit or known lookup → do it yourself.";

/** Top-tier orchestrators only (and unknown models, which are cheap). */
const ECONOMY = " Subagents return a verdict plus a report path, never file dumps.";

/** Asserted by the test suite: the per-prompt payload can never grow back into a paragraph. */
const PROMPT_LINE_MAX_BYTES = 320;

/** One re-injection per this many tool batches. ~50 tool calls is a typical long task (Manus). */
const BATCHES_PER_REINJECT = 40;
/** …or this long since the last injection, whichever comes first. See the state section. */
const REINJECT_MAX_MS = 30 * 60 * 1000;
/** Never unlink more than this in one session-start sweep. */
const SWEEP_MAX_UNLINKS = 500;
const STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Whole-hook ceiling, so a stdin that never ends cannot park a turn. */
const BUDGET_MS = 500;

const TAIL_BYTES = 262144; // transcripts can be many MB; read only the tail

// ─────────────────────────────────────────────────────────────────────────────
// Model tier (unchanged behaviour)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NOTE, so nobody later "restores" a read that was never removed: on UserPromptSubmit this DOES open
 * the transcript and read its last 256 KB, every time, because the docs say only SessionStart hooks
 * receive a `model` field and even there not always. Measured cost against a 40 MB transcript is nil
 * (38.4 ms median, against a 39.5 ms bare-node control) because only the tail is read (MINOR 6a).
 */
function modelFromTranscriptTail(p) {
  try {
    if (!p || !fs.existsSync(p)) return "";
    const fd = fs.openSync(p, "r");
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, TAIL_BYTES);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const lines = buf.toString("utf8").split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].includes('"model"')) continue;
        try {
          const j = JSON.parse(lines[i]);
          const m = j && j.message && j.message.model;
          if (typeof m === "string" && m) return m;
        } catch {}
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {}
  return "";
}

function detectModel(input) {
  const m = input && input.model;
  if (typeof m === "string" && m) return m;
  if (m && typeof m.id === "string" && m.id) return m.id;
  return modelFromTranscriptTail(input && input.transcript_path);
}

function promptLine(input) {
  const model = detectModel(input).toLowerCase();
  // Extend the list without editing this file: DELEGATION_TOP_TIER="opus,fable,foo".
  // CLAUDE_DELEGATION_TOP_TIER is the 0.2.x fallback, removed in 0.3.0.
  const tierEnv =
    process.env.DELEGATION_TOP_TIER ||
    process.env.CLAUDE_DELEGATION_TOP_TIER ||
    "fable,opus,gpt-6-astra,gpt-5.6-sol";
  const tiers = tierEnv
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const topTier = !model || tiers.some((t) => model.includes(t));
  return topTier ? ROUTING + ECONOMY : ROUTING;
}

// ─────────────────────────────────────────────────────────────────────────────
// Switches — duplicated deliberately
// ─────────────────────────────────────────────────────────────────────────────
// `scripts/goal-card.mjs` exports the same helpers, and a test asserts the two agree. They are
// re-stated here in CommonJS because the hot path (a prompt, a tool batch below the threshold) must
// not pay for an ESM import to learn it has nothing to do.

function agentsHome() {
  return process.env.AGENTS_HOME || path.join(os.homedir(), ".agents");
}

/** `"ws-off"` (master), `"ws-off-goalcard"` (this feature), or null. */
function activeSwitch() {
  try {
    const base = agentsHome();
    if (fs.existsSync(path.join(base, "ws-off"))) return "ws-off";
    if (fs.existsSync(path.join(base, "ws-off-goalcard"))) return "ws-off-goalcard";
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// State — append-only, never read-modify-write
// ─────────────────────────────────────────────────────────────────────────────
//
// A fan-out runs many of these concurrently under ONE `session_id` (tool events fire inside
// subagents and carry the parent's session id), and the round-1 read-modify-write counter lost 98 of
// 120 increments and fired ZERO times in the reviewer's 120-way reproduction. Exactness is not what
// this counter is for; never firing is the only unacceptable outcome. So:
//   · the tally is appended one byte per batch and its COUNT IS ITS SIZE — never parsed, never read,
//     only `statSync`ed, which is why an oversized state file costs nothing (MINOR 4);
//   · the key carries `agent_id`, so a subagent counts its own batches, not the parent's;
//   · firing truncates the tally and stamps `.fired`, whose mtime is the last injection;
//   · a TIME FLOOR backs the count up: a batch arriving more than REINJECT_MAX_MS after the last
//     injection fires regardless of the tally, so a lossy count can delay the card but never cancel it.
// Two racing hooks may both fire once, and a lost truncation costs one late injection. Both are the
// harmless direction.

const clean = (v, fallback) =>
  String(v || fallback)
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 120) || fallback;

function stateKey(sessionId, agentId) {
  const base = clean(sessionId, "unknown");
  return agentId ? `${base}.${clean(agentId, "agent")}` : base;
}

const stateDir = () => path.join(agentsHome(), "ws", "goal-card");
const tallyFile = (s, a) => path.join(stateDir(), `${stateKey(s, a)}.tally`);
const firedFile = (s, a) => path.join(stateDir(), `${stateKey(s, a)}.fired`);

function sizeOf(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function mtimeOf(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/** One byte, appended. No read, no rewrite, no lock. Never throws. */
function bumpTally(sessionId, agentId) {
  try {
    const file = tallyFile(sessionId, agentId);
    try {
      fs.appendFileSync(file, ".");
    } catch {
      fs.mkdirSync(stateDir(), { recursive: true });
      fs.appendFileSync(file, ".");
    }
    return sizeOf(file);
  } catch {
    return 0;
  }
}

/** Stamp the clock without touching the tally. Never throws. */
function startClock(sessionId, agentId) {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(firedFile(sessionId, agentId), "");
  } catch {}
}

/** Record an injection: tally back to zero, `.fired` stamped now. Never throws. */
function markFired(sessionId, agentId) {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    try {
      fs.writeFileSync(tallyFile(sessionId, agentId), "");
    } catch {}
    fs.writeFileSync(firedFile(sessionId, agentId), "");
  } catch {}
}

/**
 * Session-start sweep: state for sessions that ended days ago. Filters FIRST and caps the UNLINKS,
 * so a backlog larger than the cap still drains a cap's worth every session instead of never
 * reaching the stale files that sit past position 500 in readdir order (review D, MINOR 3).
 */
function sweepState() {
  try {
    const dir = stateDir();
    if (!fs.existsSync(dir)) return;
    const cutoff = Date.now() - STATE_MAX_AGE_MS;
    let removed = 0;
    for (const name of fs.readdirSync(dir)) {
      if (removed >= SWEEP_MAX_UNLINKS) break;
      if (!name.endsWith(".tally") && !name.endsWith(".fired")) continue;
      const file = path.join(dir, name);
      try {
        if (fs.statSync(file).mtimeMs < cutoff) {
          fs.unlinkSync(file);
          removed++;
        }
      } catch {}
    }
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// The card
// ─────────────────────────────────────────────────────────────────────────────

/** Imported lazily: nothing below the injection threshold ever pays for it. */
function goalCard() {
  return import(pathToFileURL(path.join(__dirname, "..", "scripts", "goal-card.mjs")).href);
}

/**
 * @returns {Promise<{text: string|null, reason: string|null, path: string|null, status: string}>}
 */
async function cardResult(cwd, agentType) {
  try {
    const mod = await goalCard();
    const extra = mod.wantsReportLine(agentType) ? mod.SUBAGENT_SUFFIX : undefined;
    return mod.goalCardResult(cwd || process.cwd(), extra ? { extra } : {});
  } catch {
    return { status: "blind", text: null, reason: null, path: null };
  }
}

async function rejectionNotice(result) {
  try {
    const mod = await goalCard();
    return mod.rejectionNotice(result.path, result.reason);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @returns {Promise<{text: string|null, systemMessage: string|null}>}
 */
async function handle(event, input) {
  const cwd = (input && input.cwd) || process.cwd();
  const sessionId = input && input.session_id;
  const agentId = input && input.agent_id;
  const nothing = { text: null, systemMessage: null };

  // THE SWITCH, BEFORE ANY SIDE EFFECT. Master: this process does nothing and says nothing.
  // Feature: the card and every byte of its state are off; the routing line is not a goal-card
  // feature and survives, as it did before this build existed.
  const off = activeSwitch();
  if (off === "ws-off") return nothing;
  const cardOff = off !== null;

  if (event === "UserPromptSubmit") {
    // The card is deliberately NOT here. Every-prompt injection is what made the last standing text
    // wallpaper, and the drift this build targets happens where no prompt is submitted at all.
    return { text: promptLine(input), systemMessage: null };
  }

  if (event === "SessionStart") {
    if (cardOff) return nothing;
    markFired(sessionId, agentId); // a session start IS an injection point: reset count and clock
    sweepState();
    const result = await cardResult(cwd, input && input.agent_type);
    if (result.status === "rejected") {
      // NEVER SILENT. Once per session, to the human, outside the conversation — not to the model,
      // where it would become the wallpaper this build exists to remove (review D, MAJOR 4).
      return { text: null, systemMessage: await rejectionNotice(result) };
    }
    return { text: result.text, systemMessage: null };
  }

  if (event === "PostCompact") {
    // Output is discarded for this event by design ("No decision control"); the reset is the point.
    if (cardOff) return nothing;
    markFired(sessionId, agentId);
    return nothing;
  }

  if (event === "SubagentStart") {
    // The subagent has its own context and never sees SessionStart. EVERY agent type gets the card —
    // a researcher drifts too — but only the roles that write a territory report are told to name a
    // goal line in one (orchestrator ruling, round 2). No counter: `session_id` here is the parent's,
    // and a spawn is not a tool batch.
    if (cardOff) return nothing;
    const result = await cardResult(cwd, input && input.agent_type);
    return { text: result.text, systemMessage: null };
  }

  if (event === "PostToolBatch") {
    if (cardOff) return nothing;
    const n = bumpTally(sessionId, agentId);
    const firedAt = mtimeOf(firedFile(sessionId, agentId));
    const overdue = firedAt !== 0 && Date.now() - firedAt >= REINJECT_MAX_MS;
    if (n < BATCHES_PER_REINJECT && !overdue) {
      // No clock yet (this hook wired without SessionStart, or the state swept)? Start it HERE.
      // Treating "never injected" as "injected at the epoch" would fire on every session's first batch.
      if (firedAt === 0) startClock(sessionId, agentId);
      return nothing;
    }
    markFired(sessionId, agentId);
    const result = await cardResult(cwd, input && input.agent_type);
    return { text: result.text, systemMessage: null }; // a rejection is reported at session start only
  }

  return nothing; // an event nobody wired for this hook: silence, exit 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire protocol
// ─────────────────────────────────────────────────────────────────────────────

let finished = false;

function finish(event, out) {
  if (finished) return;
  finished = true;
  const { text = null, systemMessage = null } = out || {};
  let payload = null;
  try {
    if (text || systemMessage) {
      const obj = {};
      if (text) obj.hookSpecificOutput = { hookEventName: event, additionalContext: text };
      if (systemMessage) obj.systemMessage = systemMessage;
      payload = JSON.stringify(obj);
    }
  } catch {}
  // 0, always. Never 1, never 3, and above all never 2: this process sits on the path of every
  // prompt and every tool batch on every machine.
  if (!payload) {
    process.exit(0);
    return;
  }
  // stdout is a PIPE, and pipe writes are asynchronous on macOS. Exiting before the bytes are out
  // would deliver JSON that starts with `{` and does not end with `}`, which the harness then treats
  // as plain text and injects verbatim (review D, MINOR 2). Exit from the write callback instead,
  // with a backstop in case it never runs.
  process.exitCode = 0;
  const bail = setTimeout(() => process.exit(0), 1000);
  if (typeof bail.unref === "function") bail.unref();
  try {
    process.stdout.write(payload, () => {
      clearTimeout(bail);
      process.exit(0);
    });
  } catch {
    process.exit(0);
  }
}

/**
 * The event name. `hook_event_name` is on every real payload; argv is how `hooks.json` names it; the
 * final fallback is the wiring this hook shipped with (a bare `UserPromptSubmit` entry, no argv), so
 * a harness that ever stops sending the field does not silently lose the routing line. The timeout
 * path below deliberately emits NOTHING, which is not a contradiction: there we have no payload at
 * all, so there is no evidence to fall back ON (review D, MINOR 9).
 */
function eventName(input) {
  const fromInput = input && input.hook_event_name;
  if (typeof fromInput === "string" && fromInput) return fromInput;
  const fromArgv = process.argv[2];
  if (typeof fromArgv === "string" && fromArgv) return fromArgv;
  return "UserPromptSubmit";
}

// A stdin that never ends must not park a turn. A few hundred milliseconds, then proceed as if empty
// — and silently, because a guessed `hookEventName` for an event this process never saw would be a
// schema failure in the transcript.
const guard = setTimeout(() => finish("UserPromptSubmit", null), BUDGET_MS);
if (typeof guard.unref === "function") guard.unref();

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("error", () => finish("UserPromptSubmit", null));
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(raw || "{}");
  } catch {}
  if (!input || typeof input !== "object") input = {};
  const event = eventName(input);
  handle(event, input)
    .then((out) => {
      clearTimeout(guard);
      // The per-prompt payload can never grow back into a paragraph, whatever a future edit says.
      if (event === "UserPromptSubmit" && out.text && Buffer.byteLength(out.text, "utf8") > PROMPT_LINE_MAX_BYTES) {
        finish(event, { text: ROUTING, systemMessage: null });
        return;
      }
      finish(event, out);
    })
    .catch(() => {
      clearTimeout(guard);
      // Even the failure path honours the master switch: `ws-off` means this process says nothing.
      const silent = activeSwitch() === "ws-off" || event !== "UserPromptSubmit";
      finish(event, silent ? null : { text: promptLine(input) });
    });
});
