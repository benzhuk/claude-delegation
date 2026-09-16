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

/** The inverse of `tomlBasicString` for the two escapes we ever write: a Windows key round-trips. */
export function unescapeTomlBasic(text) {
  return String(text).replace(/\\(["\\])/g, (_m, ch) => ch);
}

/** Escape a literal for use inside a RegExp — the key is a path, and a path is full of metacharacters. */
export function escapeRe(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, (m) => `\\${m}`);
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
    // Anchored to a line start: an unanchored search matches a COMMENTED-OUT header first
    // (`# [hooks.state."k"]`), writes the new hash into the comment region and leaves the real section
    // on its old hash — trusted for a command we no longer run (review MINOR 2).
    const at = text.search(new RegExp(`^${escapeRe(header)}`, 'm'));
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

/**
 * Drop `hooks.state` entries that are OURS but at an index we no longer occupy — what is left behind
 * when Orca adds or removes a group and our handler moves. Only entries whose key names THIS hooks.json
 * and whose hash is one of ours are touched, so a foreign handler's trust can never be removed by this,
 * and a key we are about to write is kept (review MINOR 3).
 *
 * @returns {{ text: string, removed: string[] }}
 */
export function pruneOurHooksState(toml, hooksJsonPath, ourHashes, keepKeys = []) {
  const keep = new Set(keepKeys);
  const mine = new Set(ourHashes);
  const lines = String(toml ?? '').split('\n');
  const out = [];
  const removed = [];
  for (let i = 0; i < lines.length; i++) {
    const header = /^\[hooks\.state\."(.+)"\]$/.exec(lines[i]);
    const key = header ? unescapeTomlBasic(header[1]) : null;
    const samePath = key ? key.slice(0, key.lastIndexOf(':', key.lastIndexOf(':', key.lastIndexOf(':') - 1) - 1)) === hooksJsonPath : false;
    if (key && samePath && !keep.has(key)) {
      const m = /trusted_hash\s*=\s*"([^"]+)"/.exec(lines[i + 1] ?? '');
      if (m && mine.has(m[1])) {
        removed.push(key);
        i += 1;                                            // the trusted_hash line
        if ((lines[i + 1] ?? '').trim() === '') i += 1;     // and the blank that follows it
        if (out.length && out[out.length - 1].trim() === '') out.pop();
        continue;
      }
    }
    out.push(lines[i]);
  }
  return { text: out.join('\n'), removed };
}

// ─────────────────────────────────────────────────────────────────────────────
// The hooks.json this plugin installs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every event is quick now. Stop had 1020 s in 0.4.0 for a long poll it no longer runs (2026-09-16
 * ruling: no parking), and 60 s is a generous ceiling on the one inbox read that is left. SessionStart
 * is included because a Codex session that starts with notes waiting should say so before its first
 * turn, and it is idempotent — the spike showed SessionStart fires again on every `exec resume`.
 */
export const CODEX_EVENTS = [
  { event: 'SessionStart', timeout: 30 },
  { event: 'UserPromptSubmit', timeout: 30 },
  { event: 'PostToolUse', timeout: 30 },
  // Must equal `STOP_TIMEOUT_S` in hooks/multi-hook-core.mjs — the two adapters bound Stop the same
  // way, and codex-hook-trust.test.mjs asserts it so they cannot drift apart (review MINOR 1). The
  // constant is not imported: this installer has no other reason to pull in the hook core.
  { event: 'Stop', timeout: 60 },
];

/**
 * Timeouts our handler has shipped with and no longer writes, per event.
 *
 * The trust hash covers the timeout, so an entry written by 0.4.0 carries the 1020-second hash. That
 * matters for exactly one thing: `pruneOurHooksState` recognises OUR leftovers by their hash, and an
 * entry at an index we have since vacated would not be recognised — it would sit in config.toml
 * forever, trusting a handler at a position nothing occupies. Hashes computed from this list are what
 * the prune is given, so a version bump cleans up after the version before it.
 */
export const HISTORIC_TIMEOUTS = { Stop: [1020] };

/**
 * Every hash that could identify one of OUR entries for these placements: what we are about to write,
 * plus what each earlier version would have written for the same handler.
 *
 * @returns {string[]}
 */
export function ourTrustHashes(placements) {
  const out = new Set();
  for (const p of placements) {
    const handler = p.handler ?? { command: p.command, timeout: p.timeout };
    const matcher = p.matcher ?? null;
    out.add(codexHookHash(handler, p.event, matcher));
    for (const timeout of HISTORIC_TIMEOUTS[p.event] ?? []) {
      out.add(codexHookHash({ ...handler, timeout }, p.event, matcher));
    }
  }
  return [...out];
}

/**
 * A command string Codex can run. The node binary is ABSOLUTE, and that is not a nicety: Codex inherits
 * whatever PATH its parent had, and a `codex exec` started from a non-login ssh shell on the boxes has
 * no `node` at all (fnm is set up by the profile). A bare `node` there fails silently, which for a hook
 * means it never runs and never says why. `process.execPath` is the node running the installer, so it
 * is right per machine; the installer re-runs on every apply, so a node upgrade is repaired then.
 */
export function nodeCommand(scriptPath, nodeBin = process.execPath) {
  const quote = (p) => (/\s/.test(p) ? `"${p}"` : p);
  return `${quote(String(nodeBin))} ${quote(String(scriptPath))}`;
}

export function buildHooksJson(scriptPath, events = CODEX_EVENTS, nodeBin = process.execPath) {
  const command = nodeCommand(scriptPath, nodeBin);
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
export function mergeHooksJson(existing, scriptPath, events = CODEX_EVENTS, nodeBin = process.execPath) {
  const command = nodeCommand(scriptPath, nodeBin);
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
    // The handler we ACTUALLY wrote, not the one we asked for: an update spreads the existing object, so
    // an `async: true` or a `statusMessage` already in the file survives into it — and Codex hashes what
    // is in the file. Hashing our idea of it would record a trust nobody can match, and an untrusted
    // hook is silently skipped (review MAJOR 1).
    placements.push({
      event, groupIndex, handlerIndex, command, timeout,
      matcher: groups[groupIndex].matcher ?? null,
      handler: groups[groupIndex].hooks[handlerIndex],
    });
  }

  return { json, changed, placements };
}

/** Trust entries for exactly the handlers we placed, at the indices they actually landed on. */
export function trustEntriesForPlacements(hooksJsonPath, placements) {
  const out = {};
  for (const p of placements) {
    out[trustKey(hooksJsonPath, p.event, p.groupIndex, p.handlerIndex)] =
      codexHookHash(p.handler ?? { command: p.command, timeout: p.timeout }, p.event, p.matcher ?? null);
  }
  return out;
}

/** The trust entries for exactly that file: one per handler, keyed by its absolute path. */
export function trustEntriesFor(hooksJsonPath, scriptPath, events = CODEX_EVENTS, nodeBin = process.execPath) {
  const command = nodeCommand(scriptPath, nodeBin);
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

  // Orca's own runtime home, a sibling of codex-accounts. It is a live Codex home with Orca's handlers
  // in it, and before this it was only ever reached because `$CODEX_HOME` happens to point at it inside
  // an Orca pane — an apply from a plain terminal skipped it entirely (review MINOR 4).
  const runtime = path.join(path.dirname(managedRoot), 'codex-runtime-home', 'home');
  try { if (fsImpl.statSync(runtime).isDirectory()) push(runtime); } catch { /* not on this machine */ }

  return homes;
}
