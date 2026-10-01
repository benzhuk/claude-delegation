// node --test scripts/plugin-staleness.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkStaleness, staleSessionText } from './plugin-staleness.mjs';

// Every fixture lives under a fresh mkdtempSync scratch dir — this suite never touches the
// real ~/.claude or ~/.agents, whatever machine runs it.
const tracked = [];
function scratchBase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-staleness-'));
  tracked.push(dir);
  return dir;
}
test.after(() => {
  for (const dir of tracked) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/** A fake "home" whose `.claude/plugins/cache/<marketplace>/<name>/<version>/` directory
 * really exists on disk (checkStaleness's one realpath call needs a real directory), and
 * whose script path points two levels below it — the exact shape `hooks/x.mjs` and
 * `scripts/x.mjs` both have in the real plugin. The leaf script file itself is never created
 * (and never needs to be — only the version directory is realpath'd). */
function cacheScriptPath(home, marketplace, name, version, leafDir = 'hooks', leafFile = 'agent-dispatch-guard.mjs') {
  const versionDir = path.join(home, '.claude', 'plugins', 'cache', marketplace, name, version);
  fs.mkdirSync(versionDir, { recursive: true });
  return path.join(versionDir, leafDir, leafFile);
}

function writeManifest(pluginsDir, obj) {
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.writeFileSync(path.join(pluginsDir, 'installed_plugins.json'), JSON.stringify(obj), 'utf8');
}

function entry(version) { return { scope: 'user', version }; }

// ─────────────────────────────────────────────────────────────────────────────
// P3: the comparison
// ─────────────────────────────────────────────────────────────────────────────

test('older than the only entry: stale, installed is that entry', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.20.9');
  writeManifest(path.join(home, '.claude', 'plugins'), { version: 2, plugins: { 'delegation@benzhuk': [entry('0.20.16')] } });
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, true);
  assert.equal(result.running, '0.20.9');
  assert.equal(result.installed, '0.20.16');
  assert.equal(result.key, 'delegation@benzhuk');
});

test('equal to the only entry: pass', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.20.16');
  writeManifest(path.join(home, '.claude', 'plugins'), { version: 2, plugins: { 'delegation@benzhuk': [entry('0.20.16')] } });
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, false);
});

test('newer than the only entry: pass', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.21.0');
  writeManifest(path.join(home, '.claude', 'plugins'), { version: 2, plugins: { 'delegation@benzhuk': [entry('0.20.16')] } });
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, false);
});

test('older than one entry but equal to another: pass — must be older than EVERY readable entry', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.20.9');
  writeManifest(path.join(home, '.claude', 'plugins'), {
    version: 2,
    plugins: { 'delegation@benzhuk': [entry('0.20.9'), entry('0.20.16')] },
  });
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, false);
});

test('older than two entries: stale, installed is the LOWEST of the readable entries', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.20.9');
  writeManifest(path.join(home, '.claude', 'plugins'), {
    version: 2,
    plugins: { 'delegation@benzhuk': [entry('0.20.16'), entry('0.20.13'), entry('0.21.0')] },
  });
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, true);
  assert.equal(result.installed, '0.20.13');
});

// ─────────────────────────────────────────────────────────────────────────────
// P3: fail-open — every unreadable shape passes
// ─────────────────────────────────────────────────────────────────────────────

test('manifest missing entirely: pass', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.1.0');
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, false);
  assert.match(result.reason, /no readable/);
});

test('manifest is not parseable JSON: pass', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.1.0');
  const pluginsDir = path.join(home, '.claude', 'plugins');
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.writeFileSync(path.join(pluginsDir, 'installed_plugins.json'), '{ not json', 'utf8');
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, false);
});

test('manifest has no entry for this key: pass', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.1.0');
  writeManifest(path.join(home, '.claude', 'plugins'), { version: 2, plugins: { 'other@benzhuk': [entry('9.9.9')] } });
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, false);
});

test('the key maps to a non-array value: pass', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.1.0');
  writeManifest(path.join(home, '.claude', 'plugins'), { version: 2, plugins: { 'delegation@benzhuk': { version: '9.9.9' } } });
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, false);
});

test('every entry has a non-numeric version (a prerelease tag): pass — no readable entries', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.1.0');
  writeManifest(path.join(home, '.claude', 'plugins'), {
    version: 2,
    plugins: { 'delegation@benzhuk': [entry('9.9.9-beta'), { scope: 'user' }] },
  });
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, false);
});

test('a non-numeric version entry is skipped, but a numeric sibling still proves staleness', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.20.9');
  writeManifest(path.join(home, '.claude', 'plugins'), {
    version: 2,
    plugins: { 'delegation@benzhuk': [entry('nightly'), entry('0.20.16')] },
  });
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, true);
  assert.equal(result.installed, '0.20.16');
});

test('a non-cache script path (a repo checkout shape): pass, no line', () => {
  const home = scratchBase();
  const repoLike = path.join(home, 'repo-checkout');
  fs.mkdirSync(repoLike, { recursive: true });
  const scriptPath = path.join(repoLike, 'hooks', 'agent-dispatch-guard.mjs');
  writeManifest(path.join(home, '.claude', 'plugins'), { version: 2, plugins: { 'delegation@benzhuk': [entry('0.20.16')] } });
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, false);
  assert.match(result.reason, /not a cache install/);
  assert.equal(result.running, null);
  assert.equal(result.key, null);
});

test('a plugin root under cache/ with the wrong number of segments (too shallow) is not a cache install', () => {
  const home = scratchBase();
  const shallow = path.join(home, '.claude', 'plugins', 'cache', 'benzhuk');
  fs.mkdirSync(shallow, { recursive: true });
  const scriptPath = path.join(shallow, 'hooks', 'agent-dispatch-guard.mjs');
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, false);
  assert.match(result.reason, /not a cache install/);
});

test('a plugin root under cache/ with too many segments (a stray nested dir) is not a cache install', () => {
  const home = scratchBase();
  const deep = path.join(home, '.claude', 'plugins', 'cache', 'benzhuk', 'delegation', '0.20.16', 'extra');
  fs.mkdirSync(deep, { recursive: true });
  const scriptPath = path.join(deep, 'hooks', 'agent-dispatch-guard.mjs');
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, false);
  assert.match(result.reason, /not a cache install/);
});

test('a candidate plugin root that does not exist on disk at all: pass (fail-open), never throws', () => {
  const home = scratchBase(); // scratchBase itself exists, but the deeper path is never created
  const scriptPath = path.join(home, '.claude', 'plugins', 'cache', 'benzhuk', 'delegation', '0.20.9', 'hooks', 'agent-dispatch-guard.mjs');
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, false);
});

test('scriptPath missing or not a string: pass, never throws', () => {
  const home = scratchBase();
  assert.equal(checkStaleness({ scriptPath: undefined, home, env: {} }).stale, false);
  assert.equal(checkStaleness({ scriptPath: 42, home, env: {} }).stale, false);
  assert.equal(checkStaleness({ home, env: {} }).stale, false);
});

test('a running version segment that is not plain numeric x.y.z: pass — the running version itself is unreadable', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.20.9-dev');
  writeManifest(path.join(home, '.claude', 'plugins'), { version: 2, plugins: { 'delegation@benzhuk': [entry('0.20.16')] } });
  const result = checkStaleness({ scriptPath, home, env: {} });
  assert.equal(result.stale, false);
  assert.match(result.reason, /not plain numeric/);
});

test('a throwing fsImpl.realpathSync (unreadable candidate root) is fail-open, never throws', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.20.9');
  const throwingFs = { ...fs, realpathSync() { throw new Error('EACCES simulated'); } };
  const result = checkStaleness({ scriptPath, home, env: {}, fsImpl: throwingFs });
  assert.equal(result.stale, false);
});

test('a throwing fsImpl.readFileSync (unreadable manifest) is fail-open, never throws', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.20.9');
  const throwingFs = { ...fs, readFileSync() { throw new Error('EACCES simulated'); } };
  const result = checkStaleness({ scriptPath, home, env: {}, fsImpl: throwingFs });
  assert.equal(result.stale, false);
});

test('a symlinked HOME still resolves the cache dir (review-r1.md MINOR 2): the cache dir itself is realpath\'d too', () => {
  const real = scratchBase();
  const link = path.join(path.dirname(real), `${path.basename(real)}-link`);
  fs.symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
  tracked.push(link);
  const scriptPath = cacheScriptPath(real, 'benzhuk', 'delegation', '0.20.9');
  writeManifest(path.join(real, '.claude', 'plugins'), { version: 2, plugins: { 'delegation@benzhuk': [entry('0.20.16')] } });
  const result = checkStaleness({ scriptPath, home: link, env: {} });
  assert.equal(result.stale, true);
  assert.equal(result.running, '0.20.9');
  assert.equal(result.installed, '0.20.16');
});

// ─────────────────────────────────────────────────────────────────────────────
// P2: CLAUDE_CONFIG_DIR
// ─────────────────────────────────────────────────────────────────────────────

test('CLAUDE_CONFIG_DIR is honoured over <home>/.claude when set', () => {
  const home = scratchBase();
  const configDir = path.join(home, 'alt-config');
  const versionDir = path.join(configDir, 'plugins', 'cache', 'benzhuk', 'delegation', '0.20.9');
  fs.mkdirSync(versionDir, { recursive: true });
  const scriptPath = path.join(versionDir, 'hooks', 'agent-dispatch-guard.mjs');
  writeManifest(path.join(configDir, 'plugins'), { version: 2, plugins: { 'delegation@benzhuk': [entry('0.20.16')] } });
  // A DIFFERENT (and irrelevant) manifest under home/.claude/plugins proves CLAUDE_CONFIG_DIR,
  // not home, is what actually got read.
  writeManifest(path.join(home, '.claude', 'plugins'), { version: 2, plugins: { 'delegation@benzhuk': [entry('0.0.1')] } });
  const result = checkStaleness({ scriptPath, home, env: { CLAUDE_CONFIG_DIR: configDir } });
  assert.equal(result.stale, true);
  assert.equal(result.installed, '0.20.16');
});

test('an empty-string CLAUDE_CONFIG_DIR falls back to <home>/.claude, same as unset', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.20.9');
  writeManifest(path.join(home, '.claude', 'plugins'), { version: 2, plugins: { 'delegation@benzhuk': [entry('0.20.16')] } });
  const result = checkStaleness({ scriptPath, home, env: { CLAUDE_CONFIG_DIR: '' } });
  assert.equal(result.stale, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// env/fsImpl defaults never read the real machine
// ─────────────────────────────────────────────────────────────────────────────

test('env defaults to process.env and fsImpl to node:fs when omitted, without throwing', () => {
  const home = scratchBase();
  const scriptPath = cacheScriptPath(home, 'benzhuk', 'delegation', '0.20.9');
  assert.doesNotThrow(() => checkStaleness({ scriptPath, home }));
});

test('home defaults to os.homedir() when omitted, without throwing (this suite never asserts on the result)', () => {
  assert.doesNotThrow(() => checkStaleness({ scriptPath: '/does/not/exist/hooks/x.mjs', env: {} }));
});

// ─────────────────────────────────────────────────────────────────────────────
// P6: the exact shared text
// ─────────────────────────────────────────────────────────────────────────────

test('staleSessionText matches the pinned P6 text exactly, with the key name substituted for "delegation"', () => {
  const text = staleSessionText({ key: 'delegation@benzhuk', running: '0.20.9', installed: '0.20.16' });
  assert.equal(
    text,
    'stale session: this session loaded delegation hooks 0.20.9, but 0.20.16 is installed, so hooks '
      + 'added since (the delete guard among them) are not running for it or its agents. The one fix: '
      + 'start a fresh session (claude --resume keeps the conversation). Off switch: '
      + '~/.agents/no-dispatch-guard',
  );
});

test('staleSessionText substitutes a different key name', () => {
  const text = staleSessionText({ key: 'some-plugin@othermarket', running: '1.0.0', installed: '1.2.0' });
  assert.match(text, /^stale session: this session loaded some-plugin hooks 1\.0\.0, but 1\.2\.0 is installed/);
});

test('staleSessionText falls back to "delegation" when key is missing or malformed', () => {
  assert.match(staleSessionText({ key: null, running: '1.0.0', installed: '1.2.0' }), /^stale session: this session loaded delegation hooks/);
  assert.match(staleSessionText({ running: '1.0.0', installed: '1.2.0' }), /^stale session: this session loaded delegation hooks/);
});
