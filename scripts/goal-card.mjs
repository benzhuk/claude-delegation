#!/usr/bin/env node
// goal-card — locate, read, validate and render the five-line goal card.
//
// WHY THIS EXISTS. Over a week of long sessions the agents drifted from the stated goals (a second
// execution engine got built while the goal was the simplest architecture possible). Restating goals
// in prompt prose pulled them back, which says the mechanism works and the delivery is the problem:
// prose costs a paragraph every time and is only there when a human types it. This module is the
// delivery — one five-line card, kept in front of agents at the events where drift actually starts,
// at a few dozen tokens a time.
//
// PURE BY DESIGN. Nothing here writes, spawns, or touches the network. The hook
// (`hooks/delegation-reminder.js`) owns all state and all output; this file only answers "what text,
// if any". That split is what lets the whole thing be tested without a harness.
//
// REJECT, NEVER TRUNCATE — AND NEVER SILENTLY. A card over the byte cap is refused whole: a silently
// shortened goal says something its author did not say, and the line it would shorten first — NOT —
// is the line doing the work. But a refusal the owner cannot see is indistinguishable from a project
// with no card at all, so `goalCardResult` reports WHY it refused, the hook surfaces that once per
// session on `systemMessage`, and `check` exits 1 with the same sentence (review D, MAJOR 4).
import { readFileSync, existsSync, statSync, readdirSync, realpathSync } from "node:fs";
import { join, isAbsolute, resolve, basename, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadProjectConfig } from "./project-config.mjs";

/** Per-feature switch name: `~/.agents/ws-off-goalcard`. Master is `~/.agents/ws-off`. */
export const SWITCH_NAME = "goalcard";
export const MASTER_SWITCH = "ws-off";

/** Project-config key and its default, both mirrored in `templates/goal-card.md`. */
export const CONFIG_KEY = "goal_card";
export const DEFAULT_CARD_PATH = "docs/goals/card.md";

/** The five labels, in the one order a card may use them. */
export const LABELS = Object.freeze(["GOAL", "NOT", "DONE", "KILL", "SOURCE"]);

/**
 * Byte caps. Deliberately tight: the whole argument for a card over a goals document is that it is
 * small enough to re-read a dozen times in a session without competing with the work.
 */
export const CARD_MAX_BYTES = 1000;   // a five-line card of up to 1000 bytes; raised on Ben's word 2026-09-24
export const LINE_MAX_BYTES = 360;    // any one line, about a GOAL line's worth; raised on Ben's word 2026-09-24
export const RENDER_MAX_BYTES = 1200; // what the hook injects, header and stamp included; kept 200
// bytes above CARD_MAX_BYTES (the original 800/1000 headroom) so an at-cap card still renders;
// raised alongside the card cap on Ben's word 2026-09-24 — not explicitly named in that instruction,
// but required for "the caps are ordered so a valid card can always render" to still hold. Flag for review.

/**
 * The hook's behavioural constants, stated here so the test suite has one place to read them from and
 * so a future edit to `hooks/delegation-reminder.js` that diverges fails a test rather than a session.
 * The hook keeps CommonJS copies: its hot path must not import ESM to learn it is idle.
 */
export const PROMPT_LINE_MAX_BYTES = 400; // raised from 336 on Ben's word 2026-09-24, alongside the
// 1000-byte card cap and 360-byte line cap.
export const BATCHES_PER_REINJECT = 40;
/**
 * The time floor. The batch tally can lose increments under parallel writers by design (see
 * `tallyFileFor`), so "40 batches" alone could in principle never be reached. Whichever comes first:
 * 40 counted batches, or a batch arriving more than this long after the last injection.
 */
export const REINJECT_MAX_MS = 30 * 60 * 1000;

/**
 * The one extra line the three delegation roles get. Declarative, not imperative: the hooks doc's
 * "Add context for Claude" section says "Write the text as factual statements rather than imperative
 * system instructions … Text framed as out-of-band system commands can trigger Claude's
 * prompt-injection defenses" (review D, MINOR 7).
 */
export const SUBAGENT_SUFFIX =
  "A territory report here names which GOAL line the territory serves, and the nearest NOT.";

/**
 * Which agent types get that line. EVERY subagent gets the card — a researcher or a reviewer drifts
 * too — but only the roles that actually write a territory report are told to name a goal line in it
 * (orchestrator ruling, round 2). Matches a plugin-scoped id (`delegation:builder`) and a bare
 * frontmatter name (`builder`) alike, since a machine may carry either.
 */
export const REPORT_LINE_AGENT_ROLES = Object.freeze(["builder", "reviewer", "integrator"]);

export function wantsReportLine(agentType) {
  if (typeof agentType !== "string" || !agentType) return false;
  const tail = agentType.includes(":") ? agentType.slice(agentType.lastIndexOf(":") + 1) : agentType;
  return REPORT_LINE_AGENT_ROLES.includes(tail.trim().toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// Switches and the agents home
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The agents home. `AGENTS_HOME` wins so a test can point a child at a fixture without touching the
 * real `~/.agents` — `scripts/project-config.mjs` reads `homedir()` only, and this build does not own
 * that file (see INTEGRATION LINES in the builder report). Production behaviour is identical: with
 * `AGENTS_HOME` unset both resolve to `~/.agents`.
 */
export function agentsHome(env = process.env) {
  const override = env && env.AGENTS_HOME;
  return override ? String(override) : join(homedir(), ".agents");
}

/**
 * Which switch, if any, is present: `"ws-off"` (master), `"ws-off-goalcard"` (this feature), or null.
 * The distinction matters as of round 2: the master switch stops the hook doing ANYTHING, including
 * the routing line; the feature switch stops only the card.
 *
 * MINOR 2 (round-1 review): `existsSync` returns `false` on ANY failure, including `EACCES` on the
 * containing directory, so an unreadable switch path read as "switch absent" and the feature stayed
 * ON. Fail toward doing nothing instead: `ENOENT`/`ENOTDIR` (the file genuinely is not there) is the
 * only case that means absent; every other error (permission denied, a device that refuses to answer,
 * etc.) counts as the switch being present. Exported so both this and the hook's own truth table can
 * be unit-tested without needing to induce a real OS-level permission error, which is unreliable on
 * Windows (chmod does not reliably produce EACCES on stat there).
 */
export function switchErrorMeansPresent(e) {
  return Boolean(e) && e.code !== "ENOENT" && e.code !== "ENOTDIR";
}

export function switchPresent(p) {
  try {
    statSync(p);
    return true;
  } catch (e) {
    return switchErrorMeansPresent(e);
  }
}

export function activeSwitch(name = SWITCH_NAME, env = process.env) {
  try {
    const base = agentsHome(env);
    if (switchPresent(join(base, MASTER_SWITCH))) return MASTER_SWITCH;
    if (name && switchPresent(join(base, `ws-off-${name}`))) return `ws-off-${name}`;
    return null;
  } catch {
    return null;
  }
}

/** A present switch FILE means the feature does nothing. Files, not env vars (contract). */
export function switchedOff(name = SWITCH_NAME, env = process.env) {
  return activeSwitch(name, env) !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Locating the card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where this project's card would be.
 *
 * @returns {{root: string|null, path: string|null, configured: boolean, blind: boolean}}
 *   `blind` is true when no project root could be found or the config file is unreadable: the caller
 *   cannot see what it needs, which is exit 3, not a finding.
 */
export function cardLocation(cwd = process.cwd()) {
  let loaded;
  try {
    loaded = loadProjectConfig(cwd);
  } catch {
    return { root: null, path: null, configured: false, blind: true };
  }
  const { root, config, source } = loaded;
  if (!root) return { root: null, path: null, configured: false, blind: true };
  const raw =
    config && typeof config[CONFIG_KEY] === "string" && config[CONFIG_KEY].trim()
      ? config[CONFIG_KEY].trim()
      : DEFAULT_CARD_PATH;
  // NIT 5 (round-1 review), narrowed: the review's literal patch also closed the ABSOLUTE case, but
  // "an absolute goal_card path is used as given" is an existing, deliberately tested feature (a
  // monorepo pointing several projects at one shared card) — not the bug. Left as is. The actual bug
  // is a RELATIVE `../` escape slipping past a naive `resolve(join(root, raw))`: that alone is closed,
  // by refusing (not following) any relative path whose resolution lands outside `root`.
  const resolvedRoot = resolve(root);
  let path;
  if (isAbsolute(raw)) {
    path = resolve(raw);
  } else {
    const joined = resolve(join(resolvedRoot, raw));
    if (joined !== resolvedRoot && !joined.startsWith(resolvedRoot + sep)) {
      return { root, path: null, configured: false, blind: true };
    }
    path = joined;
  }
  return {
    root,
    path,
    configured: Boolean(config && typeof config[CONFIG_KEY] === "string"),
    blind: source === "unreadable",
  };
}

/**
 * Read the card file. A missing file is not an error: it is the feature being off for this project.
 *
 * `isFile()` before `readFileSync` is load-bearing, not hygiene: a `goal_card` path that is a FIFO
 * (or a directory, or a device node) would block the event loop until the harness cancelled the hook,
 * and the hook's own 2-second guard is a timer that a blocking read never lets fire (review D,
 * MINOR 5). `statSync` on a FIFO returns immediately; `readFileSync` does not.
 *
 * @returns {{path: string|null, exists: boolean, text: string, mtimeMs: number, blind: boolean}}
 */
export function readCard(cwd = process.cwd()) {
  const loc = cardLocation(cwd);
  const empty = { path: loc.path, exists: false, text: "", mtimeMs: 0, blind: loc.blind };
  if (!loc.path) return empty;
  try {
    const st = statSync(loc.path); // throws when absent: that is the ordinary "no card" case
    if (!st.isFile()) return { ...empty, blind: true };
    if (st.size > CARD_MAX_BYTES * 8) {
      // Far past any legal card. Read nothing; report it as present-and-wrong, never as absent.
      return { path: loc.path, exists: true, text: "", mtimeMs: st.mtimeMs, blind: false, oversize: st.size };
    }
    return { path: loc.path, exists: true, text: readFileSync(loc.path, "utf8"), mtimeMs: st.mtimeMs, blind: loc.blind };
  } catch {
    return empty;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validating
// ─────────────────────────────────────────────────────────────────────────────

const IGNORABLE = /^(?:#|<!--)/;
const BULLET = /^[-*]\s+/;

/**
 * Validate the five lines.
 * @returns {{ok: boolean, error: string|null, lines: string[], fields: object}}
 *   `lines` are the normalised `LABEL: value` lines, `fields` the values keyed by label.
 */
export function validateCard(text) {
  const fail = (error) => ({ ok: false, error, lines: [], fields: {} });
  if (typeof text !== "string") return fail("card is not text");

  const content = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "").trim();
    if (!line) continue;
    if (IGNORABLE.test(line)) continue; // a markdown title or an HTML comment may sit in the file
    content.push(line.replace(BULLET, ""));
  }

  if (content.length !== LABELS.length) {
    return fail(`expected exactly ${LABELS.length} card lines, found ${content.length}`);
  }

  const lines = [];
  const fields = {};
  for (let i = 0; i < LABELS.length; i++) {
    const label = LABELS[i];
    const m = content[i].match(new RegExp(`^${label}:\\s*(\\S.*)$`));
    if (!m) return fail(`line ${i + 1} is not a non-empty \`${label}:\` line`);
    const value = m[1].trim();
    const normalised = `${label}: ${value}`;
    const bytes = Buffer.byteLength(normalised, "utf8");
    if (bytes > LINE_MAX_BYTES) {
      return fail(`${label} line is ${bytes} bytes, over the ${LINE_MAX_BYTES}-byte line cap`);
    }
    lines.push(normalised);
    fields[label] = value;
  }

  const size = Buffer.byteLength(lines.join("\n"), "utf8");
  if (size > CARD_MAX_BYTES) {
    return fail(`card is ${size} bytes, over the ${CARD_MAX_BYTES}-byte cap`);
  }
  return { ok: true, error: null, lines, fields };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The as-of stamp: the card file's own mtime, in Ben's zone, because every time an agent surfaces is
 * stated in his local time. Explicit `timeZone` so the VPS (CEST) and the Mac render the same string.
 */
export function asOfStamp(mtimeMs, timeZone = "America/New_York") {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .formatToParts(new Date(mtimeMs))
        .map((p) => [p.type, p.value]),
    );
    const hour = parts.hour === "24" ? "00" : parts.hour;
    return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute} NYC`;
  } catch {
    return "unknown";
  }
}

/** A SOURCE line carries paths only; any hand-written as-of is replaced by the real mtime. */
const HANDWRITTEN_ASOF = /\s*(?:[-–—,]\s*)?as of\b.*$/i;

/** The header the card is injected under. Factual framing, per the hooks doc's advice on context. */
export const CARD_HEADER = "Goal card for this project:";

/**
 * The exact text the hook injects, or null when there is nothing to inject or the result is over cap.
 * @param {string} text   raw card file contents
 * @param {number} mtimeMs
 * @param {{extra?: string}} opts
 */
export function renderInjection(text, mtimeMs, opts = {}) {
  const v = validateCard(text);
  if (!v.ok) return null;
  const lines = v.lines.slice();
  lines[4] = `${lines[4].replace(HANDWRITTEN_ASOF, "")} — as of ${asOfStamp(mtimeMs)}`;
  const body = [CARD_HEADER, ...lines];
  if (opts.extra) body.push(String(opts.extra));
  const out = body.join("\n");
  if (Buffer.byteLength(out, "utf8") > RENDER_MAX_BYTES) return null;
  return out;
}

/** The one sentence the owner sees when his card exists but will not be injected. */
export function rejectionNotice(cardPath, reason) {
  return `goal card not injected: ${cardPath} — ${reason}. No goals are being restated in this session; `
    + "fix the card or run `node scripts/goal-card.mjs check`.";
}

/**
 * The whole pipeline, with the reason kept. Never throws.
 *
 * @returns {{status: "off"|"blind"|"absent"|"rejected"|"ok", text: string|null, reason: string|null, path: string|null}}
 */
export function goalCardResult(cwd = process.cwd(), opts = {}) {
  try {
    const env = opts.env || process.env;
    // `ignoreSwitch` is for the CLI only: `check` must still validate the card and name the switch,
    // rather than reporting "off" and leaving a broken card undiscovered behind it.
    if (!opts.ignoreSwitch && switchedOff(SWITCH_NAME, env)) {
      return { status: "off", text: null, reason: null, path: null };
    }
    const card = readCard(cwd);
    if (!card.path) return { status: "blind", text: null, reason: null, path: null };
    if (!card.exists) return { status: "absent", text: null, reason: null, path: card.path };
    if (card.oversize) {
      return { status: "rejected", text: null, path: card.path,
        reason: `the file is ${card.oversize} bytes, far over the ${CARD_MAX_BYTES}-byte cap` };
    }
    const v = validateCard(card.text);
    if (!v.ok) return { status: "rejected", text: null, reason: v.error, path: card.path };
    const text = renderInjection(card.text, card.mtimeMs, opts);
    if (text === null) {
      return { status: "rejected", text: null, path: card.path,
        reason: `the rendered card is over the ${RENDER_MAX_BYTES}-byte cap` };
    }
    return { status: "ok", text, reason: null, path: card.path };
  } catch {
    return { status: "blind", text: null, reason: null, path: null };
  }
}

/** The text, or null. The hook uses `goalCardResult`; this stays for callers that only want bytes. */
export function goalCardContext(cwd = process.cwd(), opts = {}) {
  return goalCardResult(cwd, opts).text;
}

// ─────────────────────────────────────────────────────────────────────────────
// State (the hook writes here; named here so both agree on one path and one sanitiser)
// ─────────────────────────────────────────────────────────────────────────────
//
// APPEND-ONLY, NEVER READ-MODIFY-WRITE. A fan-out runs many hooks concurrently under ONE session id
// (tool events fire inside subagents and carry the parent's `session_id`), and a read-modify-write
// counter lost 98 of 120 increments and fired zero times in the reviewer's reproduction. So:
//   · the tally is a file appended one byte per batch, and its COUNT IS ITS SIZE — never parsed, never
//     read, only `statSync`ed, which is also why an oversized state file costs nothing;
//   · the key includes `agent_id`, so a subagent counts its own batches and the parent counts its own;
//   · firing truncates the tally and stamps `.fired`, whose MTIME is the last injection. Two racing
//     hooks may both fire once; a lost truncation costs one late injection. Both harmless directions.

export const STATE_DIR_PARTS = Object.freeze(["ws", "goal-card"]);
export const STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Never unlink more than this in one sweep; the sweep runs at session start only. */
export const SWEEP_MAX_UNLINKS = 500;

export function stateDir(env = process.env) {
  return join(agentsHome(env), ...STATE_DIR_PARTS);
}

const clean = (v, fallback) =>
  String(v || fallback)
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 120) || fallback;

/** Session ids and agent ids come from the harness; never let one become a path. */
export function stateKey(sessionId, agentId) {
  const base = clean(sessionId, "unknown");
  return agentId ? `${base}.${clean(agentId, "agent")}` : base;
}

/** The appended tally: one byte per tool batch, counted by `statSync().size`. */
export function tallyFileFor(sessionId, agentId, env = process.env) {
  return join(stateDir(env), `${stateKey(sessionId, agentId)}.tally`);
}

/** The last-injection marker: its MTIME is the clock the time floor reads. */
export function firedFileFor(sessionId, agentId, env = process.env) {
  return join(stateDir(env), `${stateKey(sessionId, agentId)}.fired`);
}

/**
 * Names of state files past their age, for the hook's session-start sweep. Never throws.
 * Filters FIRST and caps the removals, so a backlog larger than the cap still drains (MINOR 3).
 */
export function staleStateFiles(now = Date.now(), env = process.env, limit = SWEEP_MAX_UNLINKS) {
  try {
    const dir = stateDir(env);
    if (!existsSync(dir)) return [];
    const out = [];
    for (const name of readdirSync(dir)) {
      if (out.length >= limit) break;
      if (!name.endsWith(".tally") && !name.endsWith(".fired")) continue;
      const file = join(dir, name);
      try {
        if (now - statSync(file).mtimeMs > STATE_MAX_AGE_MS) out.push(file);
      } catch {
        /* vanished under us; nothing to clean */
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI: show | check. Exit 0 ok, 1 finding, 3 blind. NEVER 2 (hooks read 2 as BLOCK).
// ─────────────────────────────────────────────────────────────────────────────

export function runCli(argv, cwd = process.cwd(), out = process.stdout, err = process.stderr, env = process.env) {
  const cmd = argv[0] || "show";
  if (!["show", "check"].includes(cmd)) {
    err.write("usage: goal-card.mjs show|check\n");
    return 1;
  }
  let loc;
  try {
    loc = cardLocation(cwd);
  } catch {
    err.write("goal-card: cannot read project config\n");
    return 3;
  }
  if (!loc.path || loc.blind) {
    err.write("goal-card: no project root or unreadable project config\n");
    return 3;
  }

  // The switch, FIRST and always named: this command's whole job is to answer "is my goal being
  // restated?", and it used to answer `ok:` while a ws-off file made the answer no (MAJOR 4b).
  const off = activeSwitch(SWITCH_NAME, env);

  const card = readCard(cwd);
  if (!card.exists) {
    if (cmd === "check") out.write(`no goal card at ${loc.path} (the goal card is off for this project)\n`);
    return 0;
  }
  const result = goalCardResult(cwd, { env, ignoreSwitch: true });
  if (result.status === "rejected") {
    err.write(`goal-card: ${loc.path}: ${result.reason}\n`);
    return 1;
  }
  if (result.status !== "ok") {
    err.write(`goal-card: ${loc.path}: cannot be read\n`);
    return 3;
  }
  if (off) {
    out.write(`OFF: ${off} is present in ${agentsHome(env)} — the card at ${loc.path} is valid but nothing is injecting it\n`);
    return 0;
  }
  if (cmd === "show") out.write(`${result.text}\n`);
  else out.write(`ok: ${loc.path} (${Buffer.byteLength(result.text, "utf8")} bytes rendered)\n`);
  return 0;
}

/**
 * Only when RUN, never when imported, and correct on a path with a space and on Windows — the same
 * guarded pattern `scripts/mirror-shared-skills.mjs` uses. `new URL(import.meta.url).pathname` is
 * percent-encoded and carries a leading slash before a drive letter, which made this a silent no-op
 * on `/Users/benzhuk/Code/Zhuk Projects` and on every Windows path (review D, MAJOR 5).
 */
export function isMainModule(metaUrl = import.meta.url, entry = process.argv[1]) {
  if (!entry) return false;
  const real = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  const canon = (p) => (process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p));
  const self = real(fileURLToPath(metaUrl));
  const argv1 = real(entry);
  if (canon(self) === canon(argv1)) return true;
  return basename(argv1).toLowerCase() === basename(self).toLowerCase();
}

if (isMainModule()) {
  let code = 0;
  try {
    code = runCli(process.argv.slice(2));
  } catch {
    code = 0; // fail open: a crash is silence, never a block
  }
  // Belt and braces: this process can never hand a harness a 2.
  process.exitCode = code === 2 ? 1 : code;
}
