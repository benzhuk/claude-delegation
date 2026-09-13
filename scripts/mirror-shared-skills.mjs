#!/usr/bin/env node
/**
 * mirror-shared-skills — publish the shared skills and the Codex agent roles.
 *
 * Publishes to TWO places and no others:
 *   ~/.agents/skills/<name>   — Codex's native personal skill store (it scans this path itself)
 *   ~/.codex/agents/*.toml    — Codex subagent role definitions
 *
 * It deliberately NEVER writes ~/.claude/skills. Claude Code already receives skills/* through the
 * plugin cache; a second copy there would mean two skills with the same name and undefined precedence,
 * and on Windows the copy would silently drift from the repo (red-team M11).
 *
 * Sources:
 *   <repo>/skills/{multi,delegate,team-build}               — always
 *   ~/.claude/skills/{knowledge,triage,dev-server,learn}     — when present (chezmoi-managed)
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
const CODEX_AGENTS = path.join(HOME, '.codex', 'agents');
const MANIFEST = path.join(AGENTS_SKILLS, '.mirror-manifest.json');
const MANIFEST_VERSION = 1;

const PLUGIN_SKILLS = ['multi', 'delegate', 'team-build'];
const CLAUDE_SKILLS = ['knowledge', 'triage', 'dev-server', 'learn'];
const MODE = process.platform === 'win32' ? 'copy' : 'symlink';

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

function say(action, detail) { log.push(`${opts.dryRun ? 'would ' : ''}${action}: ${detail}`); }
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
  const codexDir = path.join(REPO, 'codex', 'agents');
  for (const file of safeReaddir(codexDir).filter((f) => f.endsWith('.toml'))) {
    out.push({ kind: 'codex-agent', name: file, src: path.join(codexDir, file), dest: path.join(CODEX_AGENTS, file) });
  }
  return out;
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
    else out.push(path.relative(base, full).split(path.sep).join('/'));
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
    if (!isManaged(prev, entry.dest) && !opts.force) {
      refuse(`${entry.dest} already exists and is not a symlink we created — refusing to overwrite. Move it aside, or re-run with --force.`);
      return null;
    }
    say('remove existing path', entry.dest);
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

function manifestEntry(entry) {
  return {
    name: entry.name,
    kind: entry.kind,
    mode: entry.kind === 'codex-agent' ? 'copy-file' : MODE,
    source: entry.src.split(path.sep).join('/'),
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
    pruneIfEmpty(AGENTS_SKILLS);
    pruneIfEmpty(CODEX_AGENTS);
  }
}

/** Remove a directory only when nothing is left in it — never a directory holding someone else's files. */
function pruneIfEmpty(dir) {
  if (safeReaddir(dir).length > 0) return;
  try { fs.rmdirSync(dir); } catch { /* someone else owns it, leave it */ }
}

// ── main ─────────────────────────────────────────────────────────────────────

const USAGE = `mirror-shared-skills — publish shared skills to ~/.agents/skills and Codex roles to ~/.codex/agents.

  node scripts/mirror-shared-skills.mjs [--dry-run] [--force] [--uninstall] [--json]

  --dry-run    print every action without touching anything
  --force      overwrite a destination that exists and is not in our manifest
  --uninstall  remove exactly what the manifest says we created, then the manifest
  --json       one JSON object instead of the human log

Never writes ~/.claude/skills: Claude Code gets these skills from the plugin cache.
`;

function main() {
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  const prev = readManifest();

  if (opts.uninstall) {
    uninstall(prev);
  } else {
    const sources = collectSources();
    if (!opts.dryRun) {
      fs.mkdirSync(AGENTS_SKILLS, { recursive: true });
      if (sources.some((s) => s.kind === 'codex-agent')) fs.mkdirSync(CODEX_AGENTS, { recursive: true });
    }
    const managed = [];
    for (const entry of sources) {
      const result = entry.kind === 'codex-agent'
        ? publishFile(entry, prev)
        : (MODE === 'symlink' ? publishSymlink(entry, prev) : publishCopy(entry, prev));
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
      agentsSkills: AGENTS_SKILLS.split(path.sep).join('/'), codexAgents: CODEX_AGENTS.split(path.sep).join('/'),
      actions: log, refusals,
    }, null, 2)}\n`);
  } else {
    process.stdout.write(`mirror-shared-skills — ${process.platform}, mode ${MODE}${opts.dryRun ? ', DRY RUN' : ''}\n`);
    for (const l of log) process.stdout.write(`  ${l}\n`);
    for (const r of refusals) process.stderr.write(`REFUSED: ${r}\n`);
  }
  return refusals.length === 0 ? 0 : 1;
}

process.exit(main());
