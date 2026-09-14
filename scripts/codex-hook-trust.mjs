// codex-hook-trust — write Codex's hook config, and pre-trust it.
//
// Codex hooks are SILENTLY SKIPPED until the user has reviewed them in the TUI. A hook that is never
// trusted is a hook that never runs and never says why, so an installer that writes `hooks.json` and
// stops has installed nothing. Trust lives in `$CODEX_HOME/config.toml`:
//
//   [hooks.state."<abs hooks.json path>:<event label>:<group index>:<handler index>"]
//   trusted_hash = "sha256:<hex>"
//
// The hash is over a NORMALIZED identity, not the file text, so config.toml and hooks.json forms of the
// same hook agree. Reproduced here from the source (openai/codex `codex-rs/hooks/src/engine/
// discovery.rs::hook_hash` → `config/src/fingerprint.rs::version_for_toml`) and then VERIFIED against
// four real values the Codex 0.154.0 TUI wrote on Netcup, 2026-09-14 — the fixture in
// `codex-hook-trust.test.mjs` is those four hashes, so a change in Codex's recipe fails the suite here
// instead of silently disabling every hook.
//
// Two details the docs do not tell you, both learned from those real values:
//   · the event label in the KEY is snake_case (`user_prompt_submit`), not the PascalCase name used
//     inside hooks.json (`UserPromptSubmit`);
//   · the hashed handler carries `async: false` explicitly, and omits every `None` field — TOML has no
//     null, so `matcher` disappears entirely when it is not set.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** PascalCase event name → the snake_case label Codex uses in a trust key. */
export function hookEventLabel(eventName) {
  return String(eventName)
    .replace(/([a-z0-9])([A-Z])/g, (_m, a, b) => `${a}_${b}`)
    .toLowerCase();
}

/** Codex's own default when a handler names no timeout, and its floor of one second. */
export const DEFAULT_TIMEOUT_SEC = 600;

export function normalizeTimeout(timeoutSec) {
  const n = Number(timeoutSec);
  if (!Number.isFinite(n)) return DEFAULT_TIMEOUT_SEC;
  return Math.max(1, Math.trunc(n));
}

/**
 * Recursively key-sorted, compact JSON — `canonical_json` + `serde_json::to_vec` in the Rust. Node's
 * JSON.stringify already emits compact output with the same escaping for the ASCII we produce.
 */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * The trust hash for ONE handler.
 *
 * @param {{type?: string, command: string, timeout?: number, async?: boolean, statusMessage?: string}} handler
 * @param {string} eventName  PascalCase, as written in hooks.json
 * @param {string|null} matcher
 * @returns {string} `sha256:<hex>`
 */
export function codexHookHash(handler, eventName, matcher = null) {
  const normalized = {
    type: 'command',
    command: String(handler.command),
    timeout: normalizeTimeout(handler.timeout),
    // Serialized unconditionally: it is a plain bool with a default, not an Option.
    async: Boolean(handler.async),
  };
  // Option fields are absent, never null — TOML cannot hold a null, and the identity is built as TOML.
  if (handler.statusMessage != null) normalized.statusMessage = String(handler.statusMessage);
  const identity = { event_name: hookEventLabel(eventName), hooks: [normalized] };
  if (matcher != null) identity.matcher = String(matcher);
  return `sha256:${createHash('sha256').update(canonicalJson(identity), 'utf8').digest('hex')}`;
}

/** `<abs hooks.json path>:<event label>:<group index>:<handler index>`, the path exactly as Codex prints it. */
export function trustKey(hooksJsonPath, eventName, groupIndex = 0, handlerIndex = 0) {
  return `${hooksJsonPath}:${hookEventLabel(eventName)}:${groupIndex}:${handlerIndex}`;
}

/** A TOML basic string: only `\` and `"` need escaping for the paths and keys we write. */
export function tomlBasicString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Upsert `[hooks.state."<key>"] trusted_hash = …` into an existing config.toml, PRESERVING everything
 * else — a Codex home's config.toml carries `notify`, `model`, project trust and whatever Ben has put
 * there, and this runs on every `chezmoi apply`. Nothing is ever deleted; an entry whose hash already
 * matches is left untouched, so the file's mtime does not move on a no-op run.
 *
 * @returns {{ text: string, changed: boolean, added: string[], updated: string[] }}
 */
export function upsertHooksState(toml, entries) {
  let text = String(toml ?? '');
  const added = [];
  const updated = [];

  for (const [key, hash] of Object.entries(entries)) {
    const header = `[hooks.state.${tomlBasicString(key)}]`;
    const at = text.indexOf(header);
    if (at === -1) {
      const block = `${header}\ntrusted_hash = ${tomlBasicString(hash)}\n`;
      const sep = text === '' || text.endsWith('\n\n') ? '' : (text.endsWith('\n') ? '\n' : '\n\n');
      text = `${text}${sep}${block}`;
      added.push(key);
      continue;
    }
    // The section runs to the next table header at the start of a line, or to the end of the file.
    const bodyStart = at + header.length;
    const rest = text.slice(bodyStart);
    const nextHeader = rest.search(/\n\[/);
    const end = nextHeader === -1 ? text.length : bodyStart + nextHeader;
    const body = text.slice(bodyStart, end);
    const line = /^[ \t]*trusted_hash[ \t]*=.*$/m.exec(body);
    if (!line) {
      // A section with no hash: give it one rather than a second section with the same key, which
      // would make the file invalid TOML.
      text = `${text.slice(0, bodyStart)}\ntrusted_hash = ${tomlBasicString(hash)}${text.slice(bodyStart)}`;
      added.push(key);
      continue;
    }
    if (line[0].includes(hash)) continue; // already trusted, byte for byte: leave the file alone
    const replacement = `trusted_hash = ${tomlBasicString(hash)}`;
    const lineStart = bodyStart + line.index;
    text = `${text.slice(0, lineStart)}${replacement}${text.slice(lineStart + line[0].length)}`;
    updated.push(key);
  }

  return { text, changed: added.length > 0 || updated.length > 0, added, updated };
}

// ─────────────────────────────────────────────────────────────────────────────
// The hooks.json this plugin installs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stop gets the long-poll budget (15 min + 2), the rest are quick. SessionStart is included because a
 * Codex session that starts with notes waiting should say so before its first turn, and it is
 * idempotent — the spike showed SessionStart fires again on every `exec resume`.
 */
export const CODEX_EVENTS = [
  { event: 'SessionStart', timeout: 30 },
  { event: 'UserPromptSubmit', timeout: 30 },
  { event: 'PostToolUse', timeout: 30 },
  { event: 'Stop', timeout: 1020 },
];

/** A command string Codex can run: `node <script>`, quoted only when it has to be. */
export function nodeCommand(scriptPath) {
  const p = String(scriptPath);
  return /\s/.test(p) ? `node "${p}"` : `node ${p}`;
}

export function buildHooksJson(scriptPath, events = CODEX_EVENTS) {
  const command = nodeCommand(scriptPath);
  const hooks = {};
  for (const { event, timeout } of events) {
    hooks[event] = [{ hooks: [{ type: 'command', command, timeout }] }];
  }
  return { hooks };
}

/**
 * How we recognise OUR handler in somebody else's file. Orca writes its own `hooks.json` into every
 * managed Codex home (`.orca/agent-hooks/codex-hook.cmd`, covering SessionStart, UserPromptSubmit,
 * PreToolUse, PermissionRequest and more), so an installer that WROTE this file would silently delete
 * Orca's agent integration. We merge instead, and this substring is how we find our own line again —
 * it survives the plugin moving, because the file name does not change.
 */
export const HOOK_MARKER = 'multi-codex-hook.mjs';

function isOurHandler(handler) {
  return typeof handler?.command === 'string' && handler.command.includes(HOOK_MARKER);
}

/**
 * Add (or refresh) our handler in an existing hooks.json without disturbing anything else.
 *
 * Ours is APPENDED as its own group, so every handler already in the file keeps its group index — and
 * therefore keeps its trust, which is keyed by that index. An earlier copy of ours is updated in place
 * for the same reason.
 *
 * @returns {{ json: object, changed: boolean, placements: {event: string, groupIndex: number, handlerIndex: number, command: string, timeout: number}[] }}
 */
export function mergeHooksJson(existing, scriptPath, events = CODEX_EVENTS) {
  const command = nodeCommand(scriptPath);
  const base = existing && typeof existing === 'object' ? existing : {};
  const json = { ...base, hooks: { ...(base.hooks && typeof base.hooks === 'object' ? base.hooks : {}) } };
  const placements = [];
  let changed = false;

  for (const { event, timeout } of events) {
    const groups = Array.isArray(json.hooks[event]) ? json.hooks[event].map((g) => ({ ...g })) : [];
    let groupIndex = groups.findIndex((g) => Array.isArray(g?.hooks) && g.hooks.some(isOurHandler));
    let handlerIndex = 0;

    if (groupIndex === -1) {
      groups.push({ hooks: [{ type: 'command', command, timeout }] });
      groupIndex = groups.length - 1;
      changed = true;
    } else {
      const hooks = [...groups[groupIndex].hooks];
      handlerIndex = hooks.findIndex(isOurHandler);
      const current = hooks[handlerIndex];
      if (current.command !== command || current.timeout !== timeout || current.type !== 'command') {
        hooks[handlerIndex] = { ...current, type: 'command', command, timeout };
        changed = true;
      }
      groups[groupIndex] = { ...groups[groupIndex], hooks };
    }

    json.hooks[event] = groups;
    placements.push({ event, groupIndex, handlerIndex, command, timeout, matcher: groups[groupIndex].matcher ?? null });
  }

  return { json, changed, placements };
}

/** Trust entries for exactly the handlers we placed, at the indices they actually landed on. */
export function trustEntriesForPlacements(hooksJsonPath, placements) {
  const out = {};
  for (const p of placements) {
    out[trustKey(hooksJsonPath, p.event, p.groupIndex, p.handlerIndex)] =
      codexHookHash({ command: p.command, timeout: p.timeout }, p.event, p.matcher ?? null);
  }
  return out;
}

/** The trust entries for exactly that file: one per handler, keyed by its absolute path. */
export function trustEntriesFor(hooksJsonPath, scriptPath, events = CODEX_EVENTS) {
  const command = nodeCommand(scriptPath);
  const out = {};
  for (const { event, timeout } of events) {
    out[trustKey(hooksJsonPath, event, 0, 0)] = codexHookHash({ command, timeout }, event, null);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Where Codex lives
// ─────────────────────────────────────────────────────────────────────────────

/** `~/.codex`, plus every Orca-managed account home on this platform. */
export function codexHomes({ home = os.homedir(), platform = process.platform, fsImpl = fs, env = process.env } = {}) {
  const homes = [];
  const push = (p) => { if (p && !homes.includes(p)) homes.push(p); };
  // Both, always. Inside an Orca pane `$CODEX_HOME` points at the managed account home, and taking it
  // INSTEAD of `~/.codex` would quietly skip the plain home every non-Orca `codex` run uses.
  push(path.join(home, '.codex'));
  push(env.CODEX_HOME);

  const managedRoot = platform === 'win32'
    ? path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'orca', 'codex-accounts')
    : platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support', 'orca', 'codex-accounts')
      : path.join(home, '.config', 'orca', 'codex-accounts');

  let entries = [];
  try { entries = fsImpl.readdirSync(managedRoot); } catch { entries = []; }
  for (const name of entries) {
    const candidate = path.join(managedRoot, name, 'home');
    try { if (fsImpl.statSync(candidate).isDirectory()) push(candidate); } catch { /* not a home */ }
  }
  return homes;
}
