#!/usr/bin/env node
/**
 * mirror-shared-skills — publish the shared skills and the Codex agent roles.
 *
 * Publishes to these places and no others:
 *   ~/.agents/skills/<name>    — Codex's native personal skill store (it scans this path itself)
 *   ~/.agents/skills/_docs/    — the shared docs the skills link to (seam review S1)
 *   ~/.codex/agents/*.toml     — Codex subagent role definitions
 *   ~/.local/bin/note-{send,inbox,flush,notify}
 *                              — PATH shims (seam review S2; v4 added the last three). On Windows BOTH
 *                                `<name>.cmd` (cmd, PowerShell) and an extensionless `<name>` (Git
 *                                Bash, which cannot resolve a bare name to a .cmd)
 *
 * It deliberately NEVER writes ~/.claude/skills. Claude Code already receives skills/* through the
 * plugin cache; a second copy there would mean two skills with the same name and undefined precedence,
 * and on Windows the copy would silently drift from the repo (red-team M11).
 *
 * Sources:
 *   <repo>/skills/{multi,delegate,team-build,decisions,notion-writing,dev-server}  — always
 *   ~/.claude/skills/{knowledge,triage,learn}                — when present (chezmoi-managed)
 *   <repo>/docs/{model-tiers,subagent-contract,…}.md         — always, to _docs/
 *   <repo>/codex/agents/*.toml                               — always
 *
 * macOS/Linux publish by symlink, Windows by copy (a junction needs admin or developer mode).
 * Everything it manages is recorded in ~/.agents/skills/.mirror-manifest.json so --uninstall can
 * remove exactly what it created and nothing else.
 *
 *   node scripts/mirror-shared-skills.mjs [--dry-run] [--force] [--uninstall] [--json] [--allow-downgrade]
 *
 * Exit 0 on success (including a no-op), 1 on any refusal or error. Idempotent.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  mergeHooksJson, trustEntriesForPlacements, upsertHooksState, pruneOurHooksState, ourTrustHashes, codexHomes,
} from './codex-hook-trust.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const HOME = os.homedir();
const AGENTS_SKILLS = path.join(HOME, '.agents', 'skills');
const SHARED_DOCS = path.join(AGENTS_SKILLS, '_docs');
const CODEX_AGENTS = path.join(HOME, '.codex', 'agents');
const LOCAL_BIN = path.join(HOME, '.local', 'bin');
const MANIFEST = path.join(AGENTS_SKILLS, '.mirror-manifest.json');
// D10: v3 adds two top-level fields, `pluginVersion` and `sourcePath` — the running tree's own
// identity, stamped on every write so D11's downgrade guard has something to compare against.
const MANIFEST_VERSION = 3;

/**
 * D10/D11: this running tree's own version and root, read fresh from `.claude-plugin/plugin.json`
 * under `REPO` — nothing in this script read that file before this build (scout R2, confirmed). Read
 * once at module load, same as every other tree-identity constant here (`REPO`, `HOME`).
 */
function readOwnPluginVersion() {
  try {
    const raw = fs.readFileSync(path.join(REPO, '.claude-plugin', 'plugin.json'), 'utf8');
    const version = JSON.parse(raw).version;
    return typeof version === 'string' ? version : null;
  } catch { return null; }
}
const OWN_PLUGIN_VERSION = readOwnPluginVersion();
const OWN_SOURCE_PATH = REPO.split(path.sep).join('/');

/**
 * The Codex hook entry point, by its path IN THIS REPO — not the mirrored copy. The mirror publishes
 * `skills/multi` and nothing else, and on POSIX it does so as a SYMLINK back to here, so the repo path
 * is the one location that exists on every machine and always matches the code that wrote the trust
 * hash. The installer re-runs on every `chezmoi apply`, so a plugin that moves is repaired next apply.
 */
const CODEX_HOOK_SCRIPT = path.join(REPO, 'hooks', 'multi-codex-hook.mjs');

export const PLUGIN_SKILLS = ['multi', 'delegate', 'team-build', 'decisions', 'notion-writing', 'dev-server'];
export const CLAUDE_SKILLS = ['knowledge', 'triage', 'learn'];
/** The docs every mirrored skill links to. Without these, `../_docs/model-tiers.md` dangles (S1). */
const SHARED_DOC_FILES = [
  'model-tiers.md', 'subagent-contract.md', 'concurrency-budget.md',
  'agent-pacing.md', 'mandate-standards.md', 'mandate-template.md', 'pane-setup.md',
];
/** Never publish a skill's own test files into Codex's skill store (review M6). */
const SKILL_FILE_EXCLUDE = /\.test\.mjs$/;
const IS_WINDOWS = process.platform === 'win32';
const MODE = IS_WINDOWS ? 'copy' : 'symlink';
/**
 * The four commands the protocol puts on PATH. v4 added three: the ledger read (note-inbox), the
 * outbox drain (note-flush) and the Codex turn-end wrapper (note-notify) — the last is named in
 * `~/.codex/config.toml` on every machine, so it MUST exist at a stable path.
 */
const SHIM_COMMANDS = ['note-send', 'note-inbox', 'note-flush', 'note-notify'];
/** A shim runs the MIRRORED copy, which exists on every machine the mirror has touched. */
function shimTarget(command) {
  return path.join(AGENTS_SKILLS, 'multi', 'scripts', `${command}.mjs`);
}
/**
 * Windows needs TWO shims per command in the same directory. `note-send.cmd` serves cmd and
 * PowerShell; Git Bash cannot resolve a bare `note-send` to a `.cmd`, and Ben's Claude sessions on
 * Windows run in Git Bash, so an extensionless POSIX-sh shim goes beside it.
 * `C:\\Users\\benzh\\.local\\bin` is already on both PATHs, Windows' and Git Bash's
 * `/c/Users/benzh/.local/bin`.
 */
const SHIM_SPECS = SHIM_COMMANDS.flatMap((command) => (IS_WINDOWS
  ? [{ name: `${command}.cmd`, flavour: 'cmd', command }, { name: command, flavour: 'sh', command }]
  : [{ name: command, flavour: 'sh', command }]));

// `log` and `refusals` before parseArgs: refuse() pushes into them, and an unknown flag or a
// `--codex-home` with no value must be a refusal, not a ReferenceError (review, 2026-09-14).
const log = [];
const refusals = [];
const opts = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const o = {
    dryRun: false, force: false, uninstall: false, json: false,
    codexHooksOnly: false, codexHooks: false, codexHome: null, allowDowngrade: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--codex-hooks-only') o.codexHooksOnly = true;
    else if (a === '--codex-hooks') o.codexHooks = true;
    else if (a === '--codex-home') {
      const value = argv[++i];
      if (value === undefined) refusals.push('--codex-home needs a path');
      else o.codexHome = value;
    } else if (a === '--force') o.force = true;
    else if (a === '--uninstall') o.uninstall = true;
    else if (a === '--json') o.json = true;
    else if (a === '--allow-downgrade') o.allowDowngrade = true;
    else if (a === '--help') o.help = true;
    else { refusals.push(`unknown flag ${a}`); }
  }
  return o;
}

/**
 * "would " prefixes an action we are NOT taking; a no-op reads the same either way. D11's refusal line
 * is a statement of fact true in both modes (nothing is dropped or overwritten whether or not this is
 * a dry run) rather than an action about to happen, so it reads the same "refusing to…" way too.
 */
const NO_OP = /^(up to date|already|nothing|refusing)/;
function say(action, detail) {
  log.push(`${opts.dryRun && !NO_OP.test(action) ? 'would ' : ''}${action}: ${detail}`);
}
function refuse(reason) { refusals.push(reason); }

/**
 * C14: peer notes are delivered into a Claude session's own inbox socket (multi 0.5.0), and a session
 * that bypasses permission prompts HOLDS an arriving note behind a modal approval dialog unless its
 * settings say `crossSessionInbound: "accept"`. That failure mode is worse than no delivery - the pane
 * stops until somebody answers a dialog - and it is invisible from the sending side, because a held
 * post looks exactly like a delivered one on the wire.
 *
 * So the installer SAYS SO on the machine that is missing it, and changes nothing: settings are Ben's,
 * and an installer that edited them would be making a permissions decision on his behalf. Reading is
 * best-effort; a missing or unparseable settings file is simply not a claim either way.
 *
 * @returns {{path: string, value: string|null, ok: boolean}|null} null when there is nothing to say
 */
export function checkCrossSessionInbound({ home = HOME, fsImpl = fs } = {}) {
  // N6: `settings.local.json` is a real place for this, and a machine that sets it there is CORRECTLY
  // configured - warning at it would be worse than saying nothing, because a false warning is what
  // teaches people to ignore the true one. Local wins, as it does for Claude Code itself.
  const files = [
    path.join(home, '.claude', 'settings.local.json'),
    path.join(home, '.claude', 'settings.json'),
  ];
  for (const file of files) {
    let value = null;
    try {
      value = JSON.parse(fsImpl.readFileSync(file, 'utf8')).crossSessionInbound ?? null;
    } catch {
      continue; // absent, or not JSON: not a claim either way, so try the next layer
    }
    if (value !== null) return { path: file.split(path.sep).join('/'), value, ok: value === 'accept' };
  }
  return { path: files[1].split(path.sep).join('/'), value: null, ok: false };
}

function warnCrossSessionInbound() {
  const state = checkCrossSessionInbound();
  if (!state || state.ok) return state;
  say(
    'WARNING: crossSessionInbound is not "accept"',
    `${state.path} says ${state.value === null ? 'nothing' : JSON.stringify(state.value)}. Peer notes posted `
    + 'into this machine\'s Claude sessions will be HELD behind an approval dialog in the recipient\'s pane '
    + 'instead of delivered (multi 0.5.0). Set it yourself - this installer never edits your settings.',
  );
  return state;
}

// ── manifest ─────────────────────────────────────────────────────────────────

/**
 * D11/F8 — "semver-greater," pinned exactly (NOT a library call, NOT a string compare — that is the
 * exact bug the Mac incident hit: `"0.13.0" < "0.5.0"` lexically). Split on `.`, parse the leading
 * integer of each of the first three components with `/^\d+/`; a component that does not start with a
 * digit, or a string that does not split into at least three `.`-separated components, fails to parse.
 * Returns `true`/`false`/`null` — `null` means "unparseable on either side," and is treated exactly
 * like "not newer" by every caller (the safe default: a malformed value never trips the guard, and
 * never suppresses it by defaulting the other way either — it just behaves as if unguarded).
 */
function parseVersionTriplet(v) {
  if (typeof v !== 'string') return null;
  const parts = v.split('.');
  if (parts.length < 3) return null;
  const nums = [];
  for (let i = 0; i < 3; i++) {
    const m = /^\d+/.exec(parts[i]);
    if (!m) return null;
    nums.push(Number(m[0]));
  }
  return nums;
}

/** `true` when `a` is semver-greater than `b`, `false` when equal or lesser, `null` when unparseable. */
export function isNewerVersion(a, b) {
  const pa = parseVersionTriplet(a);
  const pb = parseVersionTriplet(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
}

/**
 * D10: a manifest whose `version` is below 3 never carried `pluginVersion`/`sourcePath` at all — read
 * as `null` for both, for THIS run's comparison only. No migration write happens just from reading;
 * the next `writeManifest` call is what upgrades it on disk.
 */
function readManifest() {
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    if (m && Array.isArray(m.managed)) {
      const version = typeof m.version === 'number' ? m.version : 0;
      if (version < MANIFEST_VERSION) return { ...m, pluginVersion: null, sourcePath: null };
      return m;
    }
  } catch { /* no manifest yet */ }
  return {
    version: MANIFEST_VERSION, updatedAt: null, managed: [], pluginVersion: null, sourcePath: null,
  };
}

/**
 * `pluginVersion`/`sourcePath` default to THIS tree's own identity (the normal case, D10). D11's guard
 * overrides both to `prev`'s values on a guarded write (F7) so the on-disk manifest keeps reporting the
 * newer tree's identity — writing our own (older) identity here would silently disarm the guard on the
 * very next run.
 */
function writeManifest(managed, { pluginVersion = OWN_PLUGIN_VERSION, sourcePath = OWN_SOURCE_PATH } = {}) {
  const m = {
    version: MANIFEST_VERSION, updatedAt: new Date().toISOString(), mode: MODE, pluginVersion, sourcePath, managed,
  };
  if (opts.dryRun) { say('write manifest', `${MANIFEST} (${managed.length} entries)`); return m; }
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`, 'utf8');
  say('wrote manifest', `${MANIFEST} (${managed.length} entries)`);
  return m;
}

// ── sources ──────────────────────────────────────────────────────────────────

/**
 * Exported so tests can assert which real directory each mirrored skill resolves to (P4) without
 * running the CLI, which is guarded behind `isMainModule()` below. `HOME` is `os.homedir()` resolved
 * ONCE at module load, from this process's own environment: an importing test cannot retarget it
 * afterwards, so an in-process check must never trigger a write. A CHILD process launched with
 * HOME/USERPROFILE pre-set does get a different home — that is how
 * `skills/multi/scripts/mirror-shim.test.mjs` drives the real installer against a throwaway home.
 */
export function collectSources() {
  const out = [];
  for (const name of PLUGIN_SKILLS) {
    const src = path.join(REPO, 'skills', name);
    if (isSkillDir(src)) out.push({ kind: 'skill', name, src, dest: path.join(AGENTS_SKILLS, name) });
    else refuse(`missing source skill ${src} (no SKILL.md)`);
  }
  for (const name of CLAUDE_SKILLS) {
    const src = path.join(HOME, '.claude', 'skills', name);
    if (isSkillDir(src)) out.push({ kind: 'skill', name, src, dest: path.join(AGENTS_SKILLS, name) });
  }
  // S1: the docs the mirrored skills link to. Without them `../_docs/model-tiers.md` dangles for
  // every Codex session, while AGENTS.md calls that file the single source of truth.
  for (const file of SHARED_DOC_FILES) {
    const src = path.join(REPO, 'docs', file);
    if (fs.existsSync(src)) out.push({ kind: 'doc', name: file, src, dest: path.join(SHARED_DOCS, file) });
    else refuse(`missing shared doc ${src}`);
  }
  const codexDir = path.join(REPO, 'codex', 'agents');
  for (const file of safeReaddir(codexDir).filter((f) => f.endsWith('.toml'))) {
    out.push({ kind: 'codex-agent', name: file, src: path.join(codexDir, file), dest: path.join(CODEX_AGENTS, file) });
  }
  // S2: the PATH shims. Every doc tells Ben to run bare `note-send`; nothing installed it.
  for (const spec of SHIM_SPECS) {
    out.push({
      kind: 'shim', name: spec.name, flavour: spec.flavour, command: spec.command,
      src: null, dest: path.join(LOCAL_BIN, spec.name),
    });
  }
  return out;
}

/**
 * A launcher that finds node the way the chezmoi hook does: PATH first, then a platform fallback —
 * fnm's installed versions on macOS/Linux (fnm is not sourced in non-login shells such as ssh
 * commands and tmux, and a cross-host note is sent over exactly such a shell) and then Homebrew's
 * node on macOS (launchd runs the 1-minute flusher with a bare /usr/bin:/bin PATH — exit 127 on the
 * Mac, 2026-09-14), or nvm4w's `C:/nvm4w/nodejs/node.exe` on Windows, where fnm does not exist.
 */
function shimContent(flavour, command) {
  const target = shimTarget(command);
  if (flavour === 'cmd') {
    // Each `exit /b %ERRORLEVEL%` must be its own line: cmd expands %VAR% when it parses a whole
    // compound statement, so `node … & exit /b %ERRORLEVEL%` would return the value from BEFORE node ran.
    return [
      '@echo off',
      'setlocal',
      `set "NOTE_SCRIPT=${target}"`,
      'where node >nul 2>&1 || goto :nonode',
      'node "%NOTE_SCRIPT%" %*',
      'exit /b %ERRORLEVEL%',
      ':nonode',
      `echo ${command}: node not found on PATH 1>&2`,
      'exit /b 127',
      '',
    ].join('\r\n');
  }
  // POSIX sh, used on macOS/Linux AND by Git Bash on Windows. Forward slashes throughout: node on
  // Windows accepts them, and MSYS leaves them alone.
  const posixTarget = target.split(path.sep).join('/');
  const fallback = IS_WINDOWS
    ? `  for candidate in /c/nvm4w/nodejs/node.exe C:/nvm4w/nodejs/node.exe; do
    [ -x "$candidate" ] && node_bin="$candidate"
  done`
    : `  for candidate in /usr/local/bin/node /opt/homebrew/bin/node "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node; do
    [ -x "$candidate" ] && node_bin="$candidate"
  done`;
  const where = IS_WINDOWS ? 'on PATH or at C:/nvm4w/nodejs' : 'on PATH, under ~/.local/share/fnm, or at /opt/homebrew/bin';
  return [
    '#!/bin/sh',
    '# installed by claude-delegation scripts/mirror-shared-skills.mjs — do not edit by hand',
    `note_script="${posixTarget}"`,
    'node_bin="$(command -v node 2>/dev/null || true)"',
    'if [ -z "$node_bin" ]; then',
    fallback,
    'fi',
    'if [ -z "$node_bin" ]; then',
    `  echo "${command}: node not found ${where}" >&2`,
    '  exit 127',
    'fi',
    'exec "$node_bin" "$note_script" "$@"',
    '',
  ].join('\n'); // LF always: this file is read by sh, never by cmd
}

function isSkillDir(dir) {
  try { return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'SKILL.md')); } catch { return false; }
}

function safeReaddir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of safeReaddir(dir)) {
    const full = path.join(dir, entry);
    let st;
    try { st = fs.lstatSync(full); } catch { continue; }
    if (st.isDirectory()) out.push(...listFiles(full, base));
    else if (!SKILL_FILE_EXCLUDE.test(entry)) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

// ── install ──────────────────────────────────────────────────────────────────

function lstat(p) { try { return fs.lstatSync(p); } catch { return null; } }

/** True when this path is already ours according to the previous manifest. */
function isManaged(prev, dest) {
  return prev.managed.some((e) => path.resolve(e.dest) === path.resolve(dest));
}

function publishSymlink(entry, prev) {
  const st = lstat(entry.dest);
  if (st?.isSymbolicLink()) {
    const current = (() => { try { return fs.readlinkSync(entry.dest); } catch { return null; } })();
    if (current && path.resolve(path.dirname(entry.dest), current) === path.resolve(entry.src)) {
      say('up to date', entry.dest);
      return { ...manifestEntry(entry), files: null };
    }
    say('replace stale symlink', `${entry.dest} -> ${entry.src}`);
    if (!opts.dryRun) { fs.unlinkSync(entry.dest); fs.symlinkSync(entry.src, entry.dest, 'dir'); }
    return { ...manifestEntry(entry), files: null };
  }
  if (st) {
    // A real directory is never removed on manifest membership alone: a previous run recorded only
    // that we published HERE, not which files inside are ours, so a recursive delete could take a
    // sibling's work with it. Uninstall refuses the same case; install now matches it (review M1).
    if (!opts.force) {
      const why = isManaged(prev, entry.dest)
        ? 'is a real directory, not the symlink our manifest expects — something replaced it'
        : 'already exists and is not a symlink we created';
      refuse(`${entry.dest} ${why} — refusing to delete it recursively. Move it aside, or re-run with --force.`);
      return null;
    }
    say('remove existing path (--force)', entry.dest);
    if (!opts.dryRun) fs.rmSync(entry.dest, { recursive: true, force: true });
  }
  say('symlink', `${entry.dest} -> ${entry.src}`);
  if (!opts.dryRun) {
    fs.mkdirSync(path.dirname(entry.dest), { recursive: true });
    fs.symlinkSync(entry.src, entry.dest, 'dir');
  }
  return { ...manifestEntry(entry), files: null };
}

function publishCopy(entry, prev) {
  const st = lstat(entry.dest);
  const previous = prev.managed.find((e) => path.resolve(e.dest) === path.resolve(entry.dest));
  if (st && st.isSymbolicLink()) {
    say('replace symlink with a copy', entry.dest);
    if (!opts.dryRun) fs.rmSync(entry.dest, { recursive: true, force: true });
  } else if (st && st.isDirectory() && !previous && !opts.force) {
    const contents = safeReaddir(entry.dest);
    if (contents.length > 0) {
      refuse(`${entry.dest} already exists with ${contents.length} entries and is not in our manifest — refusing to overwrite. Move it aside, or re-run with --force.`);
      return null;
    }
  }

  const srcFiles = listFiles(entry.src);
  let copied = 0;
  for (const rel of srcFiles) {
    const from = path.join(entry.src, rel);
    const to = path.join(entry.dest, rel);
    if (!changed(from, to)) continue;
    copied += 1;
    if (!opts.dryRun) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }

  // Remove only files WE previously wrote into this dir and that no longer exist upstream.
  const stale = (previous?.files ?? []).filter((rel) => !srcFiles.includes(rel));
  for (const rel of stale) {
    const target = path.join(entry.dest, rel);
    if (!lstat(target)) continue;
    say('remove stale file', target);
    if (!opts.dryRun) { fs.rmSync(target, { force: true }); pruneEmpty(path.dirname(target), entry.dest); }
  }

  say(copied || stale.length ? 'copy' : 'up to date',
    `${entry.dest} (${srcFiles.length} files, ${copied} updated, ${stale.length} removed)`);
  return { ...manifestEntry(entry), files: srcFiles };
}

function publishFile(entry, prev) {
  const previous = prev.managed.find((e) => path.resolve(e.dest) === path.resolve(entry.dest));
  const st = lstat(entry.dest);
  if (st && !previous && !opts.force) {
    if (!sameContent(entry.src, entry.dest)) {
      refuse(`${entry.dest} already exists with different content and is not in our manifest — refusing to overwrite. Re-run with --force.`);
      return null;
    }
  }
  if (!changed(entry.src, entry.dest)) {
    say('up to date', entry.dest);
    return { ...manifestEntry(entry), files: [path.basename(entry.dest)] };
  }
  say('copy', `${entry.dest} <- ${path.relative(REPO, entry.src).split(path.sep).join('/')}`);
  if (!opts.dryRun) {
    fs.mkdirSync(path.dirname(entry.dest), { recursive: true });
    fs.copyFileSync(entry.src, entry.dest);
  }
  return { ...manifestEntry(entry), files: [path.basename(entry.dest)] };
}

/** The PATH shim is generated, not copied: its body names this machine's mirrored note-send. */
function publishShim(entry, prev) {
  const content = shimContent(entry.flavour, entry.command);
  const previous = prev.managed.find((e) => path.resolve(e.dest) === path.resolve(entry.dest));
  const st = lstat(entry.dest);
  if (st && !previous && !opts.force) {
    const current = (() => { try { return fs.readFileSync(entry.dest, 'utf8'); } catch { return null; } })();
    if (current !== content) {
      refuse(`${entry.dest} already exists and is not ours — refusing to overwrite a command already on PATH. Re-run with --force.`);
      return null;
    }
  }
  const current = (() => { try { return fs.readFileSync(entry.dest, 'utf8'); } catch { return null; } })();
  if (current === content) {
    say('up to date', entry.dest);
    return { ...manifestEntry(entry), files: [path.basename(entry.dest)] };
  }
  say('install PATH shim', `${entry.dest} -> ${shimTarget(entry.command)}`);
  if (!opts.dryRun) {
    fs.mkdirSync(path.dirname(entry.dest), { recursive: true });
    fs.writeFileSync(entry.dest, content, 'utf8');
    if (!IS_WINDOWS) { try { fs.chmodSync(entry.dest, 0o755); } catch { /* best effort */ } }
  }
  return { ...manifestEntry(entry), files: [path.basename(entry.dest)] };
}

function manifestEntry(entry) {
  const mode = entry.kind === 'skill' ? MODE : (entry.kind === 'shim' ? 'generated-file' : 'copy-file');
  return {
    name: entry.name,
    kind: entry.kind,
    mode,
    source: entry.src ? entry.src.split(path.sep).join('/') : `generated (target ${shimTarget(entry.command).split(path.sep).join('/')})`,
    dest: entry.dest.split(path.sep).join('/'),
  };
}

function changed(from, to) {
  const a = lstat(from); const b = lstat(to);
  if (!b) return true;
  if (!a) return false;
  if (a.size !== b.size) return true;
  return !sameContent(from, to);
}

function sameContent(a, b) {
  try { return fs.readFileSync(a).equals(fs.readFileSync(b)); } catch { return false; }
}

function pruneEmpty(dir, stopAt) {
  let cur = dir;
  while (path.resolve(cur).startsWith(path.resolve(stopAt)) && path.resolve(cur) !== path.resolve(stopAt)) {
    if (safeReaddir(cur).length > 0) return;
    try { fs.rmdirSync(cur); } catch { return; }
    cur = path.dirname(cur);
  }
}

// ── uninstall ────────────────────────────────────────────────────────────────

function uninstall(prev) {
  if (prev.managed.length === 0) { say('nothing to uninstall', MANIFEST); return; }
  for (const e of prev.managed) {
    const st = lstat(e.dest);
    if (!st) { say('already gone', e.dest); continue; }
    if (st.isSymbolicLink()) {
      say('unlink', e.dest);
      if (!opts.dryRun) fs.unlinkSync(e.dest);
      continue;
    }
    if (st.isFile()) {
      // a single mirrored file (a Codex agent role): dest IS the file
      say('remove', e.dest);
      if (!opts.dryRun) { fs.rmSync(e.dest, { force: true }); pruneIfEmpty(path.dirname(e.dest)); }
      continue;
    }
    if (Array.isArray(e.files)) {
      for (const rel of e.files) {
        const target = path.join(e.dest, rel);
        if (!lstat(target)) continue;
        say('remove', target);
        if (!opts.dryRun) { fs.rmSync(target, { force: true }); pruneEmpty(path.dirname(target), e.dest); }
      }
      if (!opts.dryRun && safeReaddir(e.dest).length === 0) { try { fs.rmdirSync(e.dest); } catch { /* keep */ } }
      continue;
    }
    refuse(`${e.dest} is a real directory with no file list in the manifest — not removing it by hand`);
  }
  say('remove manifest', MANIFEST);
  if (!opts.dryRun) {
    try { fs.rmSync(MANIFEST, { force: true }); } catch { /* fine */ }
    pruneIfEmpty(SHARED_DOCS);
    pruneIfEmpty(AGENTS_SKILLS);
    pruneIfEmpty(CODEX_AGENTS);
    pruneIfEmpty(LOCAL_BIN);
  }
}

/** Remove a directory only when nothing is left in it — never a directory holding someone else's files. */
function pruneIfEmpty(dir) {
  if (safeReaddir(dir).length > 0) return;
  try { fs.rmdirSync(dir); } catch { /* someone else owns it, leave it */ }
}

// ── main ─────────────────────────────────────────────────────────────────────

const USAGE = `mirror-shared-skills — publish shared skills, their docs, Codex roles and the note-send shim.

  node scripts/mirror-shared-skills.mjs [--dry-run] [--force] [--uninstall] [--json] [--allow-downgrade]

  --dry-run    print every action without touching anything
  --codex-hooks
               ALSO wire (and pre-trust) the Codex hooks. OFF by default: it edits live Codex homes
  --codex-hooks-only
               only wire the Codex hooks; publish nothing
  --codex-home <dir>
               wire ONLY that Codex home (use this for a scratch home; CODEX_HOME merely adds one).
               Required when running from a temporary checkout — live homes need a durable path
  --force      overwrite a destination that exists and is not in our manifest
  --uninstall  remove exactly what the manifest says we created, then the manifest
  --json       one JSON object instead of the human log
  --allow-downgrade
               drop and overwrite normally even when the on-disk manifest is from a NEWER tree
               (D11). Without it, a manifest newer than this tree refuses to drop or overwrite
               anything it manages, prints one line saying so, and still exits 0.

Destinations: ~/.agents/skills/<name>, ~/.agents/skills/_docs/, ~/.codex/agents/, ~/.local/bin/.
PATH shims: note-send, note-inbox, note-flush, note-notify (plus a .cmd for each on Windows).
Never writes ~/.claude/skills: Claude Code gets these skills from the plugin cache.
`;

function publish(entry, prev) {
  if (entry.kind === 'shim') return publishShim(entry, prev);
  if (entry.kind === 'codex-agent' || entry.kind === 'doc') return publishFile(entry, prev);
  return MODE === 'symlink' ? publishSymlink(entry, prev) : publishCopy(entry, prev);
}

/**
 * D4 — wire the Codex hooks into every Codex home on this machine, and PRE-TRUST them.
 *
 * Codex silently skips an untrusted hook, so writing hooks.json alone installs nothing. Trust is per
 * handler, keyed by the absolute path of the file, and the hash covers the normalized handler — all of
 * it in `codex-hook-trust.mjs`, pinned to hashes the Codex TUI itself produced.
 *
 * Three rules, because these are LIVE homes Ben works in:
 *   · never create a Codex home that does not exist;
 *   · never delete anything, and never touch a key that is not ours (the `notify` line must survive);
 *   · rewrite nothing when nothing changed, so an apply that changes no hooks leaves no mtimes moved.
 */
/**
 * Write through a temp file and rename. A Codex home's `config.toml` carries `notify`, `model` and
 * every project trust entry; a plain writeFileSync truncates first, so an apply interrupted at the
 * wrong instant (Ctrl-C, a closed terminal, a sleeping laptop) leaves a Codex that will not start, for
 * a file nobody backs up (review BLOCKER 2). The transport already writes `panes.json` this way.
 */
function writeFileAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* the throw below is what matters */ }
    throw err;
  }
}

/**
 * Is the hook script somewhere that will still exist tomorrow? `REPO` is whatever checkout this script
 * runs from, INCLUDING a disposable worktree or an unpacked archive. Wiring live Codex homes from one
 * of those repoints Ben's accounts at a directory that is about to be deleted — not a hypothetical: it
 * happened twice on 2026-09-14, on Netcup and on Windows, both times from a gate run (review BLOCKER 1).
 */
export function isDurablePath(target, { tmpDir = os.tmpdir(), home = os.homedir() } = {}) {
  const raw = String(target);
  const lower = raw.toLowerCase().split('\\').join('/');
  const temps = [tmpDir, path.join(home, 'AppData', 'Local', 'Temp'), '/tmp', '/var/folders']
    .filter(Boolean)
    .map((t) => String(t).toLowerCase().split('\\').join('/'));
  if (temps.some((t) => lower.startsWith(t))) return false;
  // A `tmp` segment anywhere is temporary too — `~/tmp/hookbuild` is exactly as disposable as `/tmp`,
  // and it is where the Netcup smokes unpack the tree.
  return !/(^|\/)(tmp|temp|scratchpad|worktrees?|wt-[^/]*)\//i.test(lower);
}

function installCodexHooks() {
  const results = [];
  if (!fs.existsSync(CODEX_HOOK_SCRIPT)) {
    refuse(`missing Codex hook script ${CODEX_HOOK_SCRIPT}`);
    return results;
  }
  // `--codex-home` restricts this to ONE home. Without it the installer covers every Codex home on the
  // machine, `~/.codex` included — correct for a real apply, and exactly wrong for a smoke or a test,
  // which is how real homes on Netcup AND on Windows got hooks nobody asked for (2026-09-14, repaired
  // by hand). Setting CODEX_HOME is NOT enough: that only ADDS a home.
  const homes = opts.codexHome ? [path.resolve(opts.codexHome)] : codexHomes();

  // Live homes are only ever wired from a durable checkout. A scratch checkout may still target a
  // scratch home, which is what every smoke and every test must do.
  if (!opts.codexHome && !isDurablePath(CODEX_HOOK_SCRIPT)) {
    refuse(`refusing to wire live Codex homes from a temporary checkout (${CODEX_HOOK_SCRIPT}) — `
      + 'run the installer from the installed plugin, or pass --codex-home <scratch dir>');
    return results;
  }

  for (const home of homes) {
    if (!fs.existsSync(home)) {
      // A home the user NAMED is a typo, not an absence; a home we discovered is simply not here.
      if (opts.codexHome) refuse(`--codex-home ${home} does not exist`);
      continue;
    }
    const hooksPath = path.join(home, 'hooks.json');
    const configPath = path.join(home, 'config.toml');
    const result = { home, hooksPath, wroteHooks: false, trust: { added: [], updated: [] } };

    // MERGE, never overwrite. Orca installs its OWN hooks.json into every managed home
    // (`.orca/agent-hooks/codex-hook.cmd` on SessionStart, UserPromptSubmit, PreToolUse,
    // PermissionRequest…). Writing this file wholesale would delete Orca's agent integration — which is
    // present in four of the five Codex homes on this machine, checked 2026-09-14.
    let current = null;
    try { current = fs.readFileSync(hooksPath, 'utf8'); } catch { current = null; }
    let existing = {};
    if (current !== null) {
      try {
        existing = JSON.parse(current);
      } catch {
        refuse(`${hooksPath} is not valid JSON — refusing to touch it. Fix or remove it, then re-run.`);
        continue;
      }
    }

    // BOTH FILES ARE DECIDED BEFORE EITHER IS WRITTEN (review MAJOR 1).
    //
    // hooks.json and config.toml are one unit: a handler Codex does not trust is skipped without a word,
    // so a home that gets a new hooks.json whose hash never reached config.toml is a home that silently
    // stops delivering. Writing hooks.json first and refusing the trust afterwards did exactly that. So
    // everything below computes, and nothing writes until the trust text is known to be safe.
    const merged = mergeHooksJson(existing, CODEX_HOOK_SCRIPT);
    const desired = `${JSON.stringify(merged.json, null, 2)}\n`;
    result.placements = merged.placements.map((pl) => `${pl.event}:${pl.groupIndex}:${pl.handlerIndex}`);

    // The key Codex computes uses the path as IT prints it, so the trust entries are keyed by the
    // native absolute path — backslashes and all on Windows — and by the indices our handler actually
    // landed on after the merge, which is why mergeHooksJson hands back the placements.
    const entries = trustEntriesForPlacements(path.resolve(hooksPath), merged.placements);
    let toml = '';
    try { toml = fs.readFileSync(configPath, 'utf8'); } catch { toml = ''; }
    // Drop OUR entries at indices we no longer occupy — what is left behind when Orca adds or removes a
    // group and our handler moves. Only our own hashes, only this file (review MINOR 3). "Ours" includes
    // the hashes earlier versions wrote for the same handler, or a leftover from the 0.4.0 Stop timeout
    // would go unrecognised and stay in the file for good.
    const pruned = pruneOurHooksState(
      toml, path.resolve(hooksPath), ourTrustHashes(merged.placements), Object.keys(entries),
    );
    const upserted = upsertHooksState(pruned.text, entries);
    // A config.toml that does not parse is a Codex that will not start, so a result that would still
    // declare a table twice is never written — it means somebody else's duplicate is in the file, and
    // only a human can decide what to keep (incident 2026-09-16). NEITHER file is touched: leaving the
    // home exactly as it was keeps whatever trust it already had working.
    if (upserted.refused.length > 0) {
      refuse(`${configPath} would still contain duplicate tables — neither it nor hooks.json was written, `
        + `so this home keeps the hooks and the trust it already had. ${upserted.refused.join('; ')}`);
      results.push(result);
      continue;
    }

    if (current !== desired) {
      say(current === null ? 'write codex hooks.json' : 'add multi hooks to codex hooks.json', hooksPath);
      if (!opts.dryRun) writeFileAtomic(hooksPath, desired);
      result.wroteHooks = true;
    }
    if (upserted.changed || pruned.removed.length > 0) {
      say('trust codex hooks',
        `${configPath} (+${upserted.added.length} ~${upserted.updated.length} =${upserted.deduped.length} -${pruned.removed.length})`);
      for (const key of upserted.deduped) say('dedupe trust entry', key);
      if (!opts.dryRun) {
        // One backup, the first time we ever touch this file. Nobody else backs it up, and the blast
        // radius of getting it wrong is a Codex that will not start.
        const backup = `${configPath}.bak-multi-first-touch`;
        if (toml && !fs.existsSync(backup)) {
          try { fs.copyFileSync(configPath, backup); say('back up config.toml', backup); } catch { /* best effort */ }
        }
        writeFileAtomic(configPath, upserted.text);
      }
      result.trust = {
        added: upserted.added, updated: upserted.updated, deduped: upserted.deduped, removed: pruned.removed,
      };
    }
    results.push(result);
  }
  return results;
}

function main() {
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  let codexHooks = [];

  // Just the Codex wiring, publishing nothing: what the integrator runs against a scratch CODEX_HOME to
  // prove a hook fires without the bypass flag, and the quickest repair when a home has drifted.
  if (opts.codexHooksOnly) {
    codexHooks = installCodexHooks();
    const lines = [...log, ...refusals.map((r) => `REFUSED: ${r}`)];
    if (opts.json) process.stdout.write(`${JSON.stringify({ ok: refusals.length === 0, codexHooks, actions: log, refusals }, null, 2)}\n`);
    else process.stdout.write(`${lines.join('\n')}\n`);
    return refusals.length === 0 ? 0 : 1;
  }

  const prev = readManifest();

  if (opts.uninstall) {
    uninstall(prev);
  } else {
    // D11: disk may be genuinely AHEAD of the tree running this mirror (a stale checkout, or a
    // chezmoi apply racing an upgrade elsewhere). `newer` is `true`/`false`/`null` per F8 — `null`
    // (unparseable on either side) behaves exactly like "not newer," today's unconditional behaviour.
    const newer = isNewerVersion(prev.pluginVersion, OWN_PLUGIN_VERSION);
    const guardActive = newer === true && !opts.allowDowngrade;
    if (guardActive) {
      say('refusing to drop or overwrite', `manifest is ${prev.pluginVersion} from ${prev.sourcePath ?? 'an unrecorded tree'}, `
        + `this tree is ${OWN_PLUGIN_VERSION}; run the mirror from the newer tree or pass --allow-downgrade`);
    }

    const sources = collectSources();
    if (!opts.dryRun) {
      fs.mkdirSync(AGENTS_SKILLS, { recursive: true });
      if (sources.some((s) => s.kind === 'doc')) fs.mkdirSync(SHARED_DOCS, { recursive: true });
      if (sources.some((s) => s.kind === 'codex-agent')) fs.mkdirSync(CODEX_AGENTS, { recursive: true });
      if (sources.some((s) => s.kind === 'shim')) fs.mkdirSync(LOCAL_BIN, { recursive: true });
    }
    const managed = [];
    const newlyInstalled = [];
    for (const entry of sources) {
      // D11 additive-only: under the guard, anything already on disk is left exactly alone — only a
      // genuinely MISSING entry is installed, since creating something absent can never un-publish
      // anything a newer tree put there.
      if (guardActive && lstat(entry.dest)) continue;
      const result = publish(entry, prev);
      if (result) {
        managed.push(result);
        if (guardActive) newlyInstalled.push(result);
      }
    }
    if (guardActive) {
      // F7: preserve prev.managed/pluginVersion/sourcePath EXACTLY as read, merging in only entries
      // this run genuinely newly installed. See writeManifest's own doc comment for why.
      const preserved = [...prev.managed];
      for (const entry of newlyInstalled) {
        if (!preserved.some((e) => path.resolve(e.dest) === path.resolve(entry.dest))) preserved.push(entry);
      }
      writeManifest(preserved, { pluginVersion: prev.pluginVersion, sourcePath: prev.sourcePath });
    } else {
      // Anything we managed before and no longer have a source for is stale: drop it.
      for (const old of prev.managed) {
        if (managed.some((m) => path.resolve(m.dest) === path.resolve(old.dest))) continue;
        const st = lstat(old.dest);
        if (!st) continue;
        say('drop no-longer-shared entry', old.dest);
        if (!opts.dryRun && st.isSymbolicLink()) fs.unlinkSync(old.dest);
      }
      writeManifest(managed);
    }
    // C14: said on the way past, because this is the command a fourth machine is provisioned with.
    warnCrossSessionInbound();
    // OPT-IN (review BLOCKER 1). A plain run publishes skills and shims and touches no Codex home at
    // all: the installer edits live files Orca also owns, and a default that reached them turned every
    // gate run into a live-config edit — twice, on two machines, in one afternoon. `--codex-hooks` asks
    // for it explicitly. Deliberately NOT in the manifest either: `--uninstall` must never strip a
    // Codex home's hooks.json or rewrite Ben's config.toml.
    if (opts.codexHooks) codexHooks = installCodexHooks();
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({
      ok: refusals.length === 0, platform: process.platform, mode: MODE, dryRun: opts.dryRun,
      agentsSkills: AGENTS_SKILLS.split(path.sep).join('/'), sharedDocs: SHARED_DOCS.split(path.sep).join('/'),
      codexAgents: CODEX_AGENTS.split(path.sep).join('/'),
      shims: SHIM_SPECS.map((s) => path.join(LOCAL_BIN, s.name).split(path.sep).join('/')),
      shimCommands: SHIM_COMMANDS,
      codexHooks: codexHooks.map((c) => ({ ...c, home: c.home.split(path.sep).join('/') })),
      actions: log, refusals,
    }, null, 2)}\n`);
  } else {
    process.stdout.write(`mirror-shared-skills — ${process.platform}, mode ${MODE}${opts.dryRun ? ', DRY RUN' : ''}\n`);
    for (const l of log) process.stdout.write(`  ${l}\n`);
    for (const r of refusals) process.stderr.write(`REFUSED: ${r}\n`);
  }
  return refusals.length === 0 ? 0 : 1;
}

/**
 * Only when RUN, never when imported. Without this, `import`ing the module to reach one exported helper
 * publishes every skill and rewrites the manifest — which is exactly what happened while sanity-checking
 * `isDurablePath` on 2026-09-14. Realpaths on both sides, because the mirror publishes this tree as a
 * symlink on macOS and Linux and a naive `url === argv[1]` comparison is false there.
 */
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const canon = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  const self = real(fileURLToPath(import.meta.url));
  const argv1 = real(entry);
  if (canon(self) === canon(argv1)) return true;
  return path.basename(argv1).toLowerCase() === path.basename(self).toLowerCase();
}

// `process.exitCode` rather than `process.exit()`: a piped --json write can still be in flight,
// and process.exit truncates it on Windows (review M5).
if (isMainModule()) process.exitCode = main();
