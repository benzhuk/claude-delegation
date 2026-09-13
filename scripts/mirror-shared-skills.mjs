#!/usr/bin/env node
/**
 * mirror-shared-skills — publish the shared skills and the Codex agent roles.
 *
 * Publishes to these places and no others:
 *   ~/.agents/skills/<name>    — Codex's native personal skill store (it scans this path itself)
 *   ~/.agents/skills/_docs/    — the shared docs the skills link to (seam review S1)
 *   ~/.codex/agents/*.toml     — Codex subagent role definitions
 *   ~/.local/bin/note-send     — a PATH shim (seam review S2). On Windows BOTH `note-send.cmd`
 *                                (cmd, PowerShell) and extensionless `note-send` (Git Bash, which
 *                                cannot resolve a bare name to a .cmd)
 *
 * It deliberately NEVER writes ~/.claude/skills. Claude Code already receives skills/* through the
 * plugin cache; a second copy there would mean two skills with the same name and undefined precedence,
 * and on Windows the copy would silently drift from the repo (red-team M11).
 *
 * Sources:
 *   <repo>/skills/{multi,delegate,team-build}               — always
 *   ~/.claude/skills/{knowledge,triage,dev-server,learn}     — when present (chezmoi-managed)
 *   <repo>/docs/{model-tiers,subagent-contract,…}.md         — always, to _docs/
 *   <repo>/codex/agents/*.toml                               — always
 *
 * macOS/Linux publish by symlink, Windows by copy (a junction needs admin or developer mode).
 * Everything it manages is recorded in ~/.agents/skills/.mirror-manifest.json so --uninstall can
 * remove exactly what it created and nothing else.
 *
 *   node scripts/mirror-shared-skills.mjs [--dry-run] [--force] [--uninstall] [--json]
 *
 * Exit 0 on success (including a no-op), 1 on any refusal or error. Idempotent.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const HOME = os.homedir();
const AGENTS_SKILLS = path.join(HOME, '.agents', 'skills');
const SHARED_DOCS = path.join(AGENTS_SKILLS, '_docs');
const CODEX_AGENTS = path.join(HOME, '.codex', 'agents');
const LOCAL_BIN = path.join(HOME, '.local', 'bin');
const MANIFEST = path.join(AGENTS_SKILLS, '.mirror-manifest.json');
const MANIFEST_VERSION = 2;

const PLUGIN_SKILLS = ['multi', 'delegate', 'team-build'];
const CLAUDE_SKILLS = ['knowledge', 'triage', 'dev-server', 'learn'];
/** The docs every mirrored skill links to. Without these, `../_docs/model-tiers.md` dangles (S1). */
const SHARED_DOC_FILES = [
  'model-tiers.md', 'subagent-contract.md', 'concurrency-budget.md',
  'agent-pacing.md', 'mandate-standards.md',
];
/** Never publish a skill's own test files into Codex's skill store (review M6). */
const SKILL_FILE_EXCLUDE = /\.test\.mjs$/;
const IS_WINDOWS = process.platform === 'win32';
const MODE = IS_WINDOWS ? 'copy' : 'symlink';
/** The shim runs the MIRRORED copy, which exists on every machine the mirror has touched. */
const SHIM_TARGET = path.join(AGENTS_SKILLS, 'multi', 'scripts', 'note-send.mjs');
/**
 * Windows needs TWO shims in the same directory. `note-send.cmd` serves cmd and PowerShell; Git Bash
 * cannot resolve a bare `note-send` to a `.cmd`, and Ben's Claude sessions on Windows run in Git Bash,
 * so an extensionless POSIX-sh shim goes beside it. `C:\\Users\\benzh\\.local\\bin` is already on both
 * PATHs, Windows' and Git Bash's `/c/Users/benzh/.local/bin`.
 */
const SHIM_SPECS = IS_WINDOWS
  ? [{ name: 'note-send.cmd', flavour: 'cmd' }, { name: 'note-send', flavour: 'sh' }]
  : [{ name: 'note-send', flavour: 'sh' }];

const opts = parseArgs(process.argv.slice(2));
const log = [];
const refusals = [];

function parseArgs(argv) {
  const o = { dryRun: false, force: false, uninstall: false, json: false };
  for (const a of argv) {
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--force') o.force = true;
    else if (a === '--uninstall') o.uninstall = true;
    else if (a === '--json') o.json = true;
    else if (a === '--help') o.help = true;
    else { refusals.push(`unknown flag ${a}`); }
  }
  return o;
}

/** "would " prefixes an action we are NOT taking; a no-op reads the same either way. */
const NO_OP = /^(up to date|already|nothing)/;
function say(action, detail) {
  log.push(`${opts.dryRun && !NO_OP.test(action) ? 'would ' : ''}${action}: ${detail}`);
}
function refuse(reason) { refusals.push(reason); }

// ── manifest ─────────────────────────────────────────────────────────────────

function readManifest() {
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    if (m && Array.isArray(m.managed)) return m;
  } catch { /* no manifest yet */ }
  return { version: MANIFEST_VERSION, updatedAt: null, managed: [] };
}

function writeManifest(managed) {
  const m = { version: MANIFEST_VERSION, updatedAt: new Date().toISOString(), mode: MODE, managed };
  if (opts.dryRun) { say('write manifest', `${MANIFEST} (${managed.length} entries)`); return m; }
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`, 'utf8');
  say('wrote manifest', `${MANIFEST} (${managed.length} entries)`);
  return m;
}

// ── sources ──────────────────────────────────────────────────────────────────

function collectSources() {
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
    out.push({ kind: 'shim', name: spec.name, flavour: spec.flavour, src: null, dest: path.join(LOCAL_BIN, spec.name) });
  }
  return out;
}

/**
 * A launcher that finds node the way the chezmoi hook does: PATH first, then a platform fallback —
 * fnm's installed versions on macOS/Linux (fnm is not sourced in non-login shells such as ssh
 * commands and tmux, and a cross-host note is sent over exactly such a shell), or nvm4w's
 * `C:/nvm4w/nodejs/node.exe` on Windows, where fnm does not exist.
 */
function shimContent(flavour) {
  if (flavour === 'cmd') {
    // Each `exit /b %ERRORLEVEL%` must be its own line: cmd expands %VAR% when it parses a whole
    // compound statement, so `node … & exit /b %ERRORLEVEL%` would return the value from BEFORE node ran.
    return [
      '@echo off',
      'setlocal',
      `set "NOTE_SEND=${SHIM_TARGET}"`,
      'where node >nul 2>&1 || goto :nonode',
      'node "%NOTE_SEND%" %*',
      'exit /b %ERRORLEVEL%',
      ':nonode',
      'echo note-send: node not found on PATH 1>&2',
      'exit /b 127',
      '',
    ].join('\r\n');
  }
  // POSIX sh, used on macOS/Linux AND by Git Bash on Windows. Forward slashes throughout: node on
  // Windows accepts them, and MSYS leaves them alone.
  const target = SHIM_TARGET.split(path.sep).join('/');
  const fallback = IS_WINDOWS
    ? `  for candidate in /c/nvm4w/nodejs/node.exe C:/nvm4w/nodejs/node.exe; do
    [ -x "$candidate" ] && node_bin="$candidate"
  done`
    : `  for candidate in "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node; do
    [ -x "$candidate" ] && node_bin="$candidate"
  done`;
  const where = IS_WINDOWS ? 'on PATH or at C:/nvm4w/nodejs' : 'on PATH or under ~/.local/share/fnm';
  return [
    '#!/bin/sh',
    '# installed by claude-delegation scripts/mirror-shared-skills.mjs — do not edit by hand',
    `note_send="${target}"`,
    'node_bin="$(command -v node 2>/dev/null || true)"',
    'if [ -z "$node_bin" ]; then',
    fallback,
    'fi',
    'if [ -z "$node_bin" ]; then',
    `  echo "note-send: node not found ${where}" >&2`,
    '  exit 127',
    'fi',
    'exec "$node_bin" "$note_send" "$@"',
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
  const content = shimContent(entry.flavour);
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
  say('install PATH shim', `${entry.dest} -> ${SHIM_TARGET}`);
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
    source: entry.src ? entry.src.split(path.sep).join('/') : `generated (target ${SHIM_TARGET.split(path.sep).join('/')})`,
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

  node scripts/mirror-shared-skills.mjs [--dry-run] [--force] [--uninstall] [--json]

  --dry-run    print every action without touching anything
  --force      overwrite a destination that exists and is not in our manifest
  --uninstall  remove exactly what the manifest says we created, then the manifest
  --json       one JSON object instead of the human log

Destinations: ~/.agents/skills/<name>, ~/.agents/skills/_docs/, ~/.codex/agents/, ~/.local/bin/.
Never writes ~/.claude/skills: Claude Code gets these skills from the plugin cache.
`;

function publish(entry, prev) {
  if (entry.kind === 'shim') return publishShim(entry, prev);
  if (entry.kind === 'codex-agent' || entry.kind === 'doc') return publishFile(entry, prev);
  return MODE === 'symlink' ? publishSymlink(entry, prev) : publishCopy(entry, prev);
}

function main() {
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  const prev = readManifest();

  if (opts.uninstall) {
    uninstall(prev);
  } else {
    const sources = collectSources();
    if (!opts.dryRun) {
      fs.mkdirSync(AGENTS_SKILLS, { recursive: true });
      if (sources.some((s) => s.kind === 'doc')) fs.mkdirSync(SHARED_DOCS, { recursive: true });
      if (sources.some((s) => s.kind === 'codex-agent')) fs.mkdirSync(CODEX_AGENTS, { recursive: true });
      if (sources.some((s) => s.kind === 'shim')) fs.mkdirSync(LOCAL_BIN, { recursive: true });
    }
    const managed = [];
    for (const entry of sources) {
      const result = publish(entry, prev);
      if (result) managed.push(result);
    }
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

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({
      ok: refusals.length === 0, platform: process.platform, mode: MODE, dryRun: opts.dryRun,
      agentsSkills: AGENTS_SKILLS.split(path.sep).join('/'), sharedDocs: SHARED_DOCS.split(path.sep).join('/'),
      codexAgents: CODEX_AGENTS.split(path.sep).join('/'),
      shims: SHIM_SPECS.map((s) => path.join(LOCAL_BIN, s.name).split(path.sep).join('/')),
      actions: log, refusals,
    }, null, 2)}\n`);
  } else {
    process.stdout.write(`mirror-shared-skills — ${process.platform}, mode ${MODE}${opts.dryRun ? ', DRY RUN' : ''}\n`);
    for (const l of log) process.stdout.write(`  ${l}\n`);
    for (const r of refusals) process.stderr.write(`REFUSED: ${r}\n`);
  }
  return refusals.length === 0 ? 0 : 1;
}

// `process.exitCode` rather than `process.exit()`: a piped --json write can still be in flight,
// and process.exit truncates it on Windows (review M5).
process.exitCode = main();
