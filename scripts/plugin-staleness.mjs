// node --test scripts/plugin-staleness.test.mjs
//
// plugin-staleness — the shared, pure fact-finder behind the stale-session guard (spec:
// docs/specs/stale-session-guard-1/spec.md). Claude Code loads a plugin's hooks once per
// session, from the version directory that was installed when the session started
// (`<pluginsDir>/cache/<marketplace>/<name>/<version>/`). A lead session that started before
// a newer version was installed keeps running the OLD version's hooks for its whole life —
// including every safety guard added since. This module answers exactly one question, cheap
// and fail-open: is the running script older than every readable installed entry?
//
// checkStaleness() is pure with respect to its inputs (scriptPath, home, env, fsImpl are all
// passed in) and reads at most two things: a realpath of a directory (never the leaf file
// itself) and one small JSON file. No stat beyond what realpath needs, no directory listing,
// no network, no child process — cheap enough to run on every builder/reviewer/runner/
// integrator spawn (P3).
//
// P1, where the running version comes from: the running script's OWN file path, never a
// manifest or plugin.json. `hooks/x.mjs` or `scripts/x.mjs` puts the plugin root two
// directories above the script. That candidate root's REALPATH must match
// `<pluginsDir>/cache/<marketplace>/<name>/<version>` EXACTLY — three path segments under
// `cache/`, no more, no less — for this to be a cache install at all. A repo checkout, a dev
// copy, a Codex home, or any other shape: not a cache install, and this returns `stale:
// false` with a `reason` saying so, before any manifest is even opened.
//
// P2, where the installed version comes from: `installed_plugins.json` in `<pluginsDir>`,
// where `<pluginsDir>` is `$CLAUDE_CONFIG_DIR/plugins` when that env var is set, else
// `<home>/.claude/plugins`. `plugins[key]` is an array; every entry whose `version` is plain
// numeric `x.y.z` is readable, any other shape (a prerelease, a tag, a missing field) makes
// that one entry unreadable and it is skipped, never the whole lookup.
//
// P3, the comparison and the failure posture: STALE only when the running version is
// strictly older (numeric x.y.z compare) than EVERY readable entry's version. Equal to or
// newer than any one entry: pass. No readable entry, a missing manifest, bad JSON, a missing
// key, a non-array value, an unreadable path, or any exception at all: pass. This function
// never throws.

import path from 'node:path';
import { homedir } from 'node:os';
import fs from 'node:fs';

const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** Plain numeric `x.y.z` only (P2) — a prerelease, a tag, or a missing field returns null and
 * the caller treats that one entry (or the running version itself) as unreadable. */
function parseVersion(v) {
  if (typeof v !== 'string' || !VERSION_RE.test(v)) return null;
  return v.split('.').map(Number);
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** `<pluginsDir>`: `$CLAUDE_CONFIG_DIR/plugins` when that env var is a non-empty string, else
 * `<home>/.claude/plugins` (P2). `home` is always caller-supplied — `os.homedir()` only as the
 * last-resort default below, exactly like every other pure fact-finder in this repo. */
function pluginsDirFor(home, env) {
  const configDir = env?.CLAUDE_CONFIG_DIR;
  if (typeof configDir === 'string' && configDir.length > 0) return path.join(configDir, 'plugins');
  return path.join(home, '.claude', 'plugins');
}

/**
 * P1: the plugin root is two directories above the script (`hooks/x.mjs`, `scripts/x.mjs`).
 * Its REALPATH — one `fsImpl.realpathSync` call on the directory, never the script file
 * itself — must equal `<pluginsDir>/cache/<marketplace>/<name>/<version>` exactly. Returns
 * `{ running, key }` on a match, or null for any other shape (including an unreadable
 * candidate root — a directory that does not exist at all is "not a cache install", not an
 * error to bubble up).
 */
function resolveRunning(scriptPath, pluginsDir, fsImpl) {
  if (typeof scriptPath !== 'string' || scriptPath.length === 0) return null;
  const candidateRoot = path.dirname(path.dirname(path.resolve(scriptPath)));
  let pluginRoot;
  try {
    pluginRoot = fsImpl.realpathSync(candidateRoot);
  } catch {
    return null;
  }
  const cacheDir = path.resolve(pluginsDir, 'cache');
  const rel = path.relative(cacheDir, pluginRoot);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const segments = rel.split(path.sep).filter((s) => s.length > 0);
  if (segments.length !== 3) return null;
  const [marketplace, name, version] = segments;
  return { running: version, key: `${name}@${marketplace}` };
}

/** P2: every readable (`version` plain numeric x.y.z) entry's version string for `key` in
 * `installed_plugins.json`, or null on a missing file, bad JSON, a missing key, or a
 * non-array value — the caller treats null the same as "zero readable entries" (pass). */
function readInstalledVersions(pluginsDir, key, fsImpl) {
  const manifestPath = path.join(pluginsDir, 'installed_plugins.json');
  let manifest;
  try {
    manifest = JSON.parse(fsImpl.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
  const entries = manifest?.plugins?.[key];
  if (!Array.isArray(entries)) return null;
  const versions = [];
  for (const entry of entries) {
    if (typeof entry?.version === 'string' && VERSION_RE.test(entry.version)) versions.push(entry.version);
  }
  return versions;
}

/**
 * @param {object} opts
 * @param {string} opts.scriptPath  the caller's OWN file path (P1) — required; any non-string
 *   value is treated as "not a cache install" rather than thrown
 * @param {string} [opts.home]      defaults to `os.homedir()`
 * @param {object} [opts.env]       defaults to `process.env`; the only source of
 *   `CLAUDE_CONFIG_DIR`
 * @param {object} [opts.fsImpl]    defaults to `node:fs` (`realpathSync`, `readFileSync`)
 * @returns {{ stale: boolean, running: string|null, installed: string|null, key: string|null,
 *             reason: string }} `installed` is the LOWEST readable entry version, and only
 *   set when `stale` is true (P4).
 */
export function checkStaleness({ scriptPath, home = homedir(), env = process.env, fsImpl = fs } = {}) {
  try {
    const pluginsDir = pluginsDirFor(home, env);
    const runningInfo = resolveRunning(scriptPath, pluginsDir, fsImpl);
    if (!runningInfo) {
      return { stale: false, running: null, installed: null, key: null, reason: 'not a cache install' };
    }
    const { running, key } = runningInfo;
    const runningParsed = parseVersion(running);
    if (!runningParsed) {
      return { stale: false, running, installed: null, key, reason: 'running version is not plain numeric x.y.z' };
    }

    const versions = readInstalledVersions(pluginsDir, key, fsImpl);
    if (!versions || versions.length === 0) {
      return { stale: false, running, installed: null, key, reason: 'no readable installed_plugins.json entry' };
    }

    let lowestStr = null;
    let lowestParsed = null;
    let staleAgainstAll = true;
    for (const v of versions) {
      const parsed = parseVersion(v);
      if (!parsed) continue; // readInstalledVersions already filters these out, but stay defensive
      if (lowestParsed === null || compareVersions(parsed, lowestParsed) < 0) {
        lowestParsed = parsed;
        lowestStr = v;
      }
      if (compareVersions(runningParsed, parsed) >= 0) staleAgainstAll = false;
    }
    if (lowestStr === null) {
      return { stale: false, running, installed: null, key, reason: 'no readable installed_plugins.json entry' };
    }
    if (!staleAgainstAll) {
      return { stale: false, running, installed: null, key, reason: 'running is equal to or newer than at least one installed entry' };
    }
    return { stale: true, running, installed: lowestStr, key, reason: 'running is older than every readable installed entry' };
  } catch {
    return { stale: false, running: null, installed: null, key: null, reason: 'unexpected error, fail-open' };
  }
}

/**
 * P6, exact deny/notice text, one line (the marker is its first two words). Shared so the
 * guard and wiring-check's `--line` print the literal same fact under the literal same
 * marker (P7) — never two hand-typed copies that can drift. `delegation` is replaced by the
 * `key`'s name part (`name@marketplace` — everything before `@`).
 */
export function staleSessionText({ key, running, installed }) {
  const name = typeof key === 'string' && key.includes('@') ? key.split('@')[0] : 'delegation';
  return `stale session: this session loaded ${name} hooks ${running}, but ${installed} is installed, `
    + 'so hooks added since (the delete guard among them) are not running for it or its agents. The '
    + 'one fix: start a fresh session (claude --resume keeps the conversation). Off switch: '
    + '~/.agents/no-dispatch-guard';
}
