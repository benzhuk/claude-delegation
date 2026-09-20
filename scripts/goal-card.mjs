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
// REJECT, NEVER TRUNCATE. A card over the byte cap is refused whole. A silently shortened goal is a
// goal that says something its author did not say, and the line it would shorten first — NOT — is
// the line doing the work.
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";
import { loadProjectConfig } from "./project-config.mjs";

/** Per-feature switch name: `~/.agents/ws-off-goalcard`. Master is `~/.agents/ws-off`. */
export const SWITCH_NAME = "goalcard";

/** Project-config key and its default, both mirrored in `templates/goal-card.md`. */
export const CONFIG_KEY = "goal_card";
export const DEFAULT_CARD_PATH = "docs/goals/card.md";

/** The five labels, in the one order a card may use them. */
export const LABELS = Object.freeze(["GOAL", "NOT", "DONE", "KILL", "SOURCE"]);

/**
 * Byte caps. Deliberately tight: the whole argument for a card over a goals document is that it is
 * small enough to re-read a dozen times in a session without competing with the work.
 */
export const CARD_MAX_BYTES = 800;    // the five lines, joined
export const LINE_MAX_BYTES = 240;    // any one line
export const RENDER_MAX_BYTES = 1000; // what the hook injects, header and stamp included

/**
 * The hook's two behavioural constants, stated here so the test suite has one place to read them
 * from and so a future edit to `hooks/delegation-reminder.js` that diverges fails a test rather than
 * a session. The hook keeps CommonJS copies: its hot path must not import ESM to learn it is idle.
 */
export const PROMPT_LINE_MAX_BYTES = 320;
export const BATCHES_PER_REINJECT = 40;

/** The one extra sentence a subagent gets, so a territory report names the goal line it serves. */
export const SUBAGENT_SUFFIX =
  "Name in your report which GOAL line your territory serves, and the nearest NOT.";

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

/** A present switch FILE means the feature does nothing. Files, not env vars (contract). */
export function switchedOff(name = SWITCH_NAME, env = process.env) {
  try {
    const base = agentsHome(env);
    if (existsSync(join(base, "ws-off"))) return true;
    return name ? existsSync(join(base, `ws-off-${name}`)) : false;
  } catch {
    return false;
  }
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
  const path = isAbsolute(raw) ? resolve(raw) : resolve(join(root, raw));
  return {
    root,
    path,
    configured: Boolean(config && typeof config[CONFIG_KEY] === "string"),
    blind: source === "unreadable",
  };
}

/**
 * Read the card file. A missing file is not an error: it is the feature being off for this project.
 * @returns {{path: string|null, exists: boolean, text: string, mtimeMs: number, blind: boolean}}
 */
export function readCard(cwd = process.cwd()) {
  const loc = cardLocation(cwd);
  const empty = { path: loc.path, exists: false, text: "", mtimeMs: 0, blind: loc.blind };
  if (!loc.path) return empty;
  try {
    if (!existsSync(loc.path)) return empty;
    const text = readFileSync(loc.path, "utf8");
    const mtimeMs = statSync(loc.path).mtimeMs;
    return { path: loc.path, exists: true, text, mtimeMs, blind: loc.blind };
  } catch {
    // Present but unreadable: blind, and still never loud.
    return { ...empty, blind: true };
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

/**
 * The whole pipeline, as the hook uses it: switches, location, read, validate, render.
 * Never throws. Returns null whenever there is nothing to say.
 */
export function goalCardContext(cwd = process.cwd(), opts = {}) {
  try {
    if (switchedOff(SWITCH_NAME, opts.env || process.env)) return null;
    const card = readCard(cwd);
    if (!card.exists) return null;
    return renderInjection(card.text, card.mtimeMs, opts);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// State directory (the hook writes here; named here so both agree on one path)
// ─────────────────────────────────────────────────────────────────────────────

export const STATE_DIR_PARTS = Object.freeze(["ws", "goal-card"]);
export const STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function stateDir(env = process.env) {
  return join(agentsHome(env), ...STATE_DIR_PARTS);
}

/** Session ids come from the harness; never let one become a path. */
export function stateFileFor(sessionId, env = process.env) {
  const safe =
    String(sessionId || "unknown")
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .slice(0, 120) || "unknown";
  return join(stateDir(env), `${safe}.json`);
}

/** Names of state files past their age, for the hook's session-start sweep. Never throws. */
export function staleStateFiles(now = Date.now(), env = process.env) {
  try {
    const dir = stateDir(env);
    if (!existsSync(dir)) return [];
    const out = [];
    for (const name of readdirSync(dir).slice(0, 500)) {
      if (!name.endsWith(".json")) continue;
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

export function runCli(argv, cwd = process.cwd(), out = process.stdout, err = process.stderr) {
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
  const card = readCard(cwd);
  if (!card.exists) {
    if (cmd === "check") out.write(`no goal card at ${loc.path} (the goal card is off for this project)\n`);
    return 0;
  }
  const v = validateCard(card.text);
  if (!v.ok) {
    err.write(`goal-card: ${loc.path}: ${v.error}\n`);
    return 1;
  }
  const rendered = renderInjection(card.text, card.mtimeMs);
  if (rendered === null) {
    err.write(`goal-card: ${loc.path}: rendered card is over the ${RENDER_MAX_BYTES}-byte cap\n`);
    return 1;
  }
  if (cmd === "show") out.write(`${rendered}\n`);
  else out.write(`ok: ${loc.path} (${Buffer.byteLength(rendered, "utf8")} bytes rendered)\n`);
  return 0;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  let code = 0;
  try {
    code = runCli(process.argv.slice(2));
  } catch {
    code = 0; // fail open: a crash is silence, never a block
  }
  // Belt and braces: this process can never hand a harness a 2.
  process.exit(code === 2 ? 1 : code);
}
