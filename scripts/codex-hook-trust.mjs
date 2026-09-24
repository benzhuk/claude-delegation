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

/**
 * The path spelled the way Codex spells it on this platform, and the ONLY spelling we ever write.
 *
 * The incident (Windows, 2026-09-16): three spellings of the same key ended up in one config.toml —
 * Orca's `'C:\Users\…\hooks.json:stop:0:0'`, a 0.4.0 run's `'C:/Users/…/hooks.json:stop:1:0'`, and
 * 0.4.1's `"C:\\Users\\…\\hooks.json:stop:1:0"`. TOML unescapes the first and third to the SAME key, so
 * the file stopped parsing ("Cannot declare … twice") and every Codex home on the box was broken. The
 * second is a different key to TOML and simply trusted nothing.
 *
 * So: resolve, then force the platform separator. Windows is case- and slash-insensitive about paths,
 * POSIX is neither, which is why `logicalKey` below only folds on win32.
 */
export function canonicalTrustPath(hooksJsonPath, platform = process.platform) {
  const raw = String(hooksJsonPath);
  if (platform === 'win32') return path.win32.resolve(raw).replace(/\//g, '\\');
  return path.posix.resolve(raw);
}

/** `<abs hooks.json path>:<event label>:<group index>:<handler index>`, the path exactly as Codex prints it. */
export function trustKey(hooksJsonPath, eventName, groupIndex = 0, handlerIndex = 0, platform = process.platform) {
  return `${canonicalTrustPath(hooksJsonPath, platform)}:${hookEventLabel(eventName)}:${groupIndex}:${handlerIndex}`;
}

/** The path half of a trust key: everything before `:<event>:<group>:<handler>`. */
export function trustKeyPath(key) {
  const s = String(key);
  let at = s.length;
  for (let n = 0; n < 3; n += 1) {
    at = s.lastIndexOf(':', at - 1);
    if (at === -1) return s;
  }
  return s.slice(0, at);
}

/**
 * Two keys that mean the same entry, reduced to one string. On Windows a path is case-insensitive and
 * either separator works, so `C:/x` and `c:\X` are one key and must never become two tables. On POSIX
 * they are genuinely different paths and nothing is folded.
 */
export function logicalKey(key, platform = process.platform) {
  const s = String(key ?? '');
  return platform === 'win32' ? s.replace(/\\/g, '/').toLowerCase() : s;
}

/** The inverse of `tomlBasicString` for the two escapes we ever write: a Windows key round-trips. */
export function unescapeTomlBasic(text) {
  return String(text).replace(/\\(["\\])/g, (_m, ch) => ch);
}

/** A TOML basic string: only `\` and `"` need escaping for the paths and keys we write. */
export function tomlBasicString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * A TOML key the way Codex and Orca write one: a LITERAL string, where a Windows path needs no escaping
 * at all and cannot be mis-escaped. Only a key containing a `'` or a newline — which a path on either
 * platform will not have — falls back to a basic string.
 */
export function tomlKeyString(value) {
  const s = String(value);
  return /['\n\r]/.test(s) ? tomlBasicString(s) : `'${s}'`;
}

/**
 * One dotted key segment, unquoted: `'a.b'` and `"a.b"` both mean the key `a.b`, and a bare segment
 * means itself. Null for a segment that is not a legal key, so the caller can fall back to the raw text
 * rather than inventing an identity for something it did not understand.
 */
export function unquoteTomlKeyPart(part) {
  const s = String(part ?? '').trim();
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return unescapeTomlBasic(s.slice(1, -1));
  if (s === '' || /["'\s.]/.test(s)) return null;
  return s;
}

/**
 * A table header, parsed the way TOML reads one: `[a.b."c.d"]` is the three-segment path
 * `['a', 'b', 'c.d']`, and the dot inside the quotes is part of the key, not a separator.
 *
 * Whitespace inside the brackets is legal and is tolerated here, because a header we fail to recognise
 * is a table we would append a SECOND copy of — the incident, in miniature (review MINOR 3).
 *
 * @returns {{ parts: string[], array: boolean }|null} null when it is not a header we can read
 */
export function parseTomlKeyPath(header) {
  const raw = String(header ?? '').trim();
  const array = raw.startsWith('[[') && raw.endsWith(']]');
  if (!array && !(raw.startsWith('[') && raw.endsWith(']'))) return null;
  const inner = array ? raw.slice(2, -2) : raw.slice(1, -1);

  const segments = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (quote) {
      // Only a basic string has escapes; inside a literal string a backslash is just a backslash.
      if (quote === '"' && ch === '\\') { current += ch + (inner[i + 1] ?? ''); i += 1; continue; }
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === '.') { segments.push(current); current = ''; continue; }
    current += ch;
  }
  if (quote) return null; // an unterminated quote: not something we can claim to understand
  segments.push(current);

  const parts = segments.map(unquoteTomlKeyPart);
  return parts.some((p) => p === null) ? null : { parts, array };
}

/** The key a `[hooks.state.<key>]` header declares, unquoted, or null for any other line. */
export function hooksStateKey(header) {
  const parsed = parseTomlKeyPath(header);
  if (!parsed || parsed.array || parsed.parts.length !== 3) return null;
  return parsed.parts[0] === 'hooks' && parsed.parts[1] === 'state' ? parsed.parts[2] : null;
}

/**
 * Split a config.toml into its table sections — the lines before the first header, then one section per
 * `[header]` line with the lines that belong to it. Joining them back is byte-exact.
 *
 * Section-shaped rather than line-shaped because every operation here is "this table, entirely": update
 * one, delete a duplicate, append a new one. The old line-surgery version also ate the blank line before
 * the section that followed a removal.
 */
export function splitTomlSections(text) {
  const sections = [{ header: null, body: [] }];
  // An empty (or whitespace-only) file has no lines worth preserving. Keeping its single empty line
  // would push every appended table down one and give the file a leading blank on its first write.
  const raw = String(text ?? '');
  if (raw.trim() === '') return sections;
  for (const line of raw.split('\n')) {
    if (/^\s*\[/.test(line)) sections.push({ header: line, body: [] });
    else sections[sections.length - 1].body.push(line);
  }
  return sections;
}

export function joinTomlSections(sections) {
  const lines = [];
  for (const s of sections) {
    if (s.header !== null) lines.push(s.header);
    lines.push(...s.body);
  }
  return lines.join('\n');
}

/**
 * Every table this file declares twice — the thing that stops Codex parsing it at all.
 *
 * Judged by TOML's OWN rules and nothing else: two headers collide when their unquoted key paths are
 * equal, so quoting style does not matter and case and separators are never folded. That last part is
 * the correction (review MINOR 2): a Windows path is case-insensitive, but a TOML KEY is not, so
 * `'C:\x'` and `'C:/x'` are two perfectly legal tables and refusing them would leave a home stuck
 * refusing on every apply. Folding belongs in `logicalKey`, where it decides what is OUR entry.
 *
 * Every table is checked, not just `hooks.state` — `[projects."/a/b"]` and `[projects.'/a/b']` are the
 * same table declared twice, and that is the dangerous direction (review MINOR 3). A header we cannot
 * parse is identified by its own text, so an unreadable line is never silently treated as unique.
 * `[[array of tables]]` headers are legally repeatable and are never counted.
 *
 * @returns {string[]} empty when the text is safe to write
 */
export function validateTomlTables(text) {
  const problems = [];
  const seen = new Set();
  for (const section of splitTomlSections(text)) {
    if (section.header === null) continue;
    const parsed = parseTomlKeyPath(section.header);
    if (parsed?.array) continue;
    const id = parsed ? `key ${JSON.stringify(parsed.parts)}` : `raw ${section.header.trim()}`;
    if (!seen.has(id)) { seen.add(id); continue; }
    const key = parsed ? hooksStateKey(section.header) : null;
    problems.push(`${key === null ? section.header.trim() : `[hooks.state] ${key}`} is declared twice`);
  }
  return problems;
}

function withTrustedHash(section, key, hash) {
  const body = [...section.body];
  const at = body.findIndex((l) => /^[ \t]*trusted_hash[ \t]*=/.test(l));
  const line = `trusted_hash = ${tomlBasicString(hash)}`;
  if (at === -1) body.unshift(line);
  else body[at] = line;
  return { header: `[hooks.state.${tomlKeyString(key)}]`, body };
}

const sameSection = (a, b) => a.header === b.header && a.body.length === b.body.length
  && a.body.every((line, i) => line === b.body[i]);

/**
 * Upsert `[hooks.state."<key>"] trusted_hash = …`, PRESERVING everything else — a Codex home's
 * config.toml carries `notify`, `model`, project trust and whatever Ben has put there, and this runs on
 * every `chezmoi apply`.
 *
 * Three rules, all bought with a broken box:
 *   · a key is matched LOGICALLY, so an entry written in any spelling is updated in place rather than
 *     appended next to;
 *   · a pre-existing duplicate of one of our keys is collapsed to a single table carrying the current
 *     hash, reported in `deduped`;
 *   · the result is VALIDATED before it is handed back. If it would still declare a table twice —
 *     because somebody else's duplicate is in there — nothing is written and `refused` says why. A
 *     config.toml that does not parse is a Codex that does not start.
 *
 * `changed` is a byte comparison against the input, so a no-op run cannot move the file's mtime.
 *
 * @returns {{ text: string, changed: boolean, added: string[], updated: string[], deduped: string[], refused: string[] }}
 */
export function upsertHooksState(toml, entries, { platform = process.platform } = {}) {
  const before = String(toml ?? '');
  const want = new Map();
  for (const [key, hash] of Object.entries(entries)) want.set(logicalKey(key, platform), { key, hash });

  const added = [];
  const updated = [];
  const deduped = [];
  const placed = new Set();
  const out = [];

  for (const section of splitTomlSections(before)) {
    const key = section.header === null ? null : hooksStateKey(section.header);
    const logical = key === null ? null : logicalKey(key, platform);
    const target = logical === null ? undefined : want.get(logical);
    if (!target) { out.push(section); continue; }
    if (placed.has(logical)) {
      // A second table for a key we are writing: the duplicate that broke the file. Its body is dropped
      // whole, so the blank line that separated it goes too.
      deduped.push(key);
      continue;
    }
    placed.add(logical);
    const rewritten = withTrustedHash(section, target.key, target.hash);
    if (!sameSection(section, rewritten)) updated.push(target.key);
    out.push(rewritten);
  }

  for (const [logical, target] of want) {
    if (placed.has(logical)) continue;
    // Keep the file's shape: one blank line before the new table, unless there is nothing to separate
    // from (an empty file) or the separator is already there.
    const tail = out[out.length - 1];
    const hasContent = tail && (tail.header !== null || tail.body.length > 0);
    const endsBlank = tail && tail.body.length > 0 && tail.body[tail.body.length - 1].trim() === '';
    if (hasContent && !endsBlank) tail.body.push('');
    out.push({ header: `[hooks.state.${tomlKeyString(target.key)}]`, body: [`trusted_hash = ${tomlBasicString(target.hash)}`, ''] });
    added.push(target.key);
  }

  const text = joinTomlSections(out);
  const refused = validateTomlTables(text);
  if (refused.length > 0) {
    return { text: before, changed: false, added: [], updated: [], deduped: [], refused };
  }
  return { text, changed: text !== before, added, updated, deduped, refused };
}

/**
 * Drop `hooks.state` entries that are OURS but at an index we no longer occupy — what is left behind
 * when Orca adds or removes a group and our handler moves. Only entries whose key names THIS hooks.json
 * and whose hash is one of ours are touched, so a foreign handler's trust can never be removed by this,
 * and a key we are about to write is kept (review MINOR 3).
 *
 * Headers are matched logically here too: a leftover written in a different spelling is still ours, and
 * the old basic-string-only regex walked straight past Orca-style literal keys.
 *
 * @returns {{ text: string, removed: string[] }}
 */
export function pruneOurHooksState(toml, hooksJsonPath, ourHashes, keepKeys = [], { platform = process.platform } = {}) {
  const keep = new Set(keepKeys.map((k) => logicalKey(k, platform)));
  const mine = new Set(ourHashes);
  const ourPath = logicalKey(canonicalTrustPath(hooksJsonPath, platform), platform);
  const out = [];
  const removed = [];

  for (const section of splitTomlSections(toml)) {
    const key = section.header === null ? null : hooksStateKey(section.header);
    const logical = key === null ? null : logicalKey(key, platform);
    if (logical !== null && !keep.has(logical) && logicalKey(trustKeyPath(key), platform) === ourPath) {
      const line = section.body.find((l) => /trusted_hash\s*=/.test(l));
      const m = line && /trusted_hash\s*=\s*"([^"]+)"/.exec(line);
      if (m && mine.has(m[1])) { removed.push(key); continue; }
    }
    out.push(section);
  }
  return { text: joinTomlSections(out), removed };
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
  // Codex clamps Interrupt hooks to three seconds. This callback only disarms continuation state.
  { event: 'Interrupt', timeout: 3 },
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
export function trustEntriesForPlacements(hooksJsonPath, placements, platform = process.platform) {
  const out = {};
  for (const p of placements) {
    out[trustKey(hooksJsonPath, p.event, p.groupIndex, p.handlerIndex, platform)] =
      codexHookHash(p.handler ?? { command: p.command, timeout: p.timeout }, p.event, p.matcher ?? null);
  }
  return out;
}

/** The trust entries for exactly that file: one per handler, keyed by its absolute path. */
export function trustEntriesFor(hooksJsonPath, scriptPath, events = CODEX_EVENTS, nodeBin = process.execPath, platform = process.platform) {
  const command = nodeCommand(scriptPath, nodeBin);
  const out = {};
  for (const { event, timeout } of events) {
    out[trustKey(hooksJsonPath, event, 0, 0, platform)] = codexHookHash({ command, timeout }, event, null);
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
