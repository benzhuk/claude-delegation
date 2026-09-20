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
//   * NO network, NO child process, and no file read on the hot path beyond two `existsSync` calls
//     and one small counter file. The goal-card module is imported only when a card will be rendered.
//   * Switch FILES: `~/.agents/ws-off` (master) and `~/.agents/ws-off-goalcard` silence the card.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { pathToFileURL } = require("url");

// ─────────────────────────────────────────────────────────────────────────────
// The per-prompt line
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 178 bytes, down from 510. The three shapes are the whole routing policy; the skills carry the
 * detail, and an agent that needs the detail opens the skill.
 */
const ROUTING =
  "Routing: multi-file build → team-build skill; independent research/review/audit lanes → delegate skill, all lanes in one message; single-file edit or known lookup → do it yourself.";

/** 65 bytes, down from 161. Top-tier orchestrators only (and unknown models, which are cheap). */
const ECONOMY = " Subagents return a verdict plus a report path, never file dumps.";

/** Asserted by the test suite: the per-prompt payload can never grow back into a paragraph. */
const PROMPT_LINE_MAX_BYTES = 320;

/** One re-injection per this many tool batches. ~50 tool calls is a typical long task (Manus). */
const BATCHES_PER_REINJECT = 40;

/** Whole-hook ceiling, so a stdin that never ends cannot park a turn. */
const BUDGET_MS = 2000;

const TAIL_BYTES = 262144; // transcripts can be many MB; read only the tail

// ─────────────────────────────────────────────────────────────────────────────
// Model tier (unchanged behaviour)
// ─────────────────────────────────────────────────────────────────────────────

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
// Switches and state — duplicated deliberately
// ─────────────────────────────────────────────────────────────────────────────
// `scripts/goal-card.mjs` exports the same two helpers, and a test asserts the two agree. They are
// re-stated here in CommonJS because the hot path (a prompt, a tool batch below the threshold) must
// not pay for an ESM import to learn it has nothing to do.

function agentsHome() {
  return process.env.AGENTS_HOME || path.join(os.homedir(), ".agents");
}

function cardSwitchedOff() {
  try {
    const base = agentsHome();
    return fs.existsSync(path.join(base, "ws-off")) || fs.existsSync(path.join(base, "ws-off-goalcard"));
  } catch {
    return false;
  }
}

function stateFile(sessionId) {
  const safe =
    String(sessionId || "unknown")
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .slice(0, 120) || "unknown";
  return path.join(agentsHome(), "ws", "goal-card", `${safe}.json`);
}

/** Current batch count for this session. Unreadable or malformed reads as 0: fail open. */
function readCount(sessionId) {
  try {
    const raw = fs.readFileSync(stateFile(sessionId), "utf8");
    const n = JSON.parse(raw).batches;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** Temp file + rename, so a second session never reads a half-written counter. Never throws. */
function writeCount(sessionId, batches) {
  try {
    const file = stateFile(sessionId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ batches, updated: new Date().toISOString() }), "utf8");
    fs.renameSync(tmp, file);
  } catch {}
}

/** Session-start sweep: counters for sessions that ended days ago. Bounded and never throws. */
function sweepState() {
  try {
    const dir = path.join(agentsHome(), "ws", "goal-card");
    if (!fs.existsSync(dir)) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(dir).slice(0, 500)) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(dir, name);
      try {
        if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
      } catch {}
    }
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// The card
// ─────────────────────────────────────────────────────────────────────────────

/** Imported lazily: nothing below the injection threshold ever pays for it. */
async function cardText(cwd, extra) {
  try {
    const mod = await import(pathToFileURL(path.join(__dirname, "..", "scripts", "goal-card.mjs")).href);
    return mod.goalCardContext(cwd || process.cwd(), extra ? { extra } : {});
  } catch {
    return null;
  }
}

async function subagentSuffix() {
  try {
    const mod = await import(pathToFileURL(path.join(__dirname, "..", "scripts", "goal-card.mjs")).href);
    return mod.SUBAGENT_SUFFIX;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @returns {Promise<string|null>} the `additionalContext` for this event, or null for silence.
 */
async function contextFor(event, input) {
  const cwd = (input && input.cwd) || process.cwd();
  const sessionId = input && input.session_id;

  if (event === "UserPromptSubmit") {
    // The card is deliberately NOT here. Every-prompt injection is what made the last standing text
    // wallpaper, and the drift this build targets happens where no prompt is submitted at all.
    return promptLine(input);
  }

  if (event === "SessionStart") {
    writeCount(sessionId, 0);
    sweepState();
    if (cardSwitchedOff()) return null;
    return cardText(cwd);
  }

  if (event === "PostCompact") {
    // Output is discarded for this event by design ("No decision control"); the reset is the point.
    writeCount(sessionId, 0);
    return null;
  }

  if (event === "SubagentStart") {
    // The subagent has its own context and never sees SessionStart. It does NOT share the parent's
    // counter: `session_id` here is the parent's, and a spawn is not a tool batch.
    if (cardSwitchedOff()) return null;
    const suffix = await subagentSuffix();
    return cardText(cwd, suffix || undefined);
  }

  if (event === "PostToolBatch") {
    const n = readCount(sessionId) + 1;
    writeCount(sessionId, n);
    if (n % BATCHES_PER_REINJECT !== 0) return null;
    if (cardSwitchedOff()) return null;
    return cardText(cwd);
  }

  return null; // an event nobody wired for this hook: silence, exit 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire protocol
// ─────────────────────────────────────────────────────────────────────────────

let finished = false;

function finish(event, text) {
  if (finished) return;
  finished = true;
  try {
    if (text) {
      process.stdout.write(
        JSON.stringify({
          suppressOutput: true,
          hookSpecificOutput: { hookEventName: event, additionalContext: text },
        }),
      );
    }
  } catch {}
  // 0, always. Never 1, never 3, and above all never 2: this process sits on the path of every
  // prompt and every tool batch on every machine.
  process.exit(0);
}

function eventName(input) {
  const fromInput = input && input.hook_event_name;
  if (typeof fromInput === "string" && fromInput) return fromInput;
  const fromArgv = process.argv[2];
  if (typeof fromArgv === "string" && fromArgv) return fromArgv;
  return "UserPromptSubmit"; // the wiring this hook shipped with, before events were passed
}

// A stdin that never ends must not park a turn. Silence, not a guessed event name: emitting
// `hookEventName` for an event this process never saw would be a schema failure in the transcript.
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
  contextFor(event, input)
    .then((text) => {
      clearTimeout(guard);
      // The per-prompt payload can never grow back into a paragraph, whatever a future edit says.
      if (event === "UserPromptSubmit" && text && Buffer.byteLength(text, "utf8") > PROMPT_LINE_MAX_BYTES) {
        finish(event, ROUTING);
        return;
      }
      finish(event, text);
    })
    .catch(() => {
      clearTimeout(guard);
      finish(event, event === "UserPromptSubmit" ? promptLine(input) : null);
    });
});
