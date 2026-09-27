#!/usr/bin/env node
// knowledge-counts — the one pure counting module over `~/.claude/knowledge/`, shared by the
// SessionStart notice (scripts/goal-card.mjs) and the CLI (scripts/knowledge-count.mjs) so the
// two never disagree (spec.md Territory K3 item 1: "share the counting code with K2 through one
// small module").
//
// PURE: no writes, no network, no process exit, and it never throws — every failure mode
// (absent store, unreadable dir, a malformed read.log line, a broken symlink) counts as
// zero/absent rather than raising, matching spec.md K2 item 2 ("Any error: no line") — this
// module hands the caller a quiet zero and lets the caller decide what "no line" means for its
// own output.
//
// `home` is an OS home directory: `.claude/knowledge` (chezmoi-managed) and `.agents/knowledge`
// (the per-host, never-chezmoi-managed read log K1's hook writes) are siblings under it in
// production (real `homedir()`); a test passes a scratch directory containing both instead.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Where the chezmoi-managed store lives under a home directory. */
export function storeDir(home) {
  return join(home, ".claude", "knowledge");
}

/** The inbox, a subdirectory of the store. */
export function inboxDir(home) {
  return join(storeDir(home), "_inbox");
}

/** The per-host read log (`hooks/knowledge-log.mjs`, Territory K1) — never inside the
 * chezmoi-managed store (rules/00-machine.md: machine-specific state stays out of managed dirs). */
export function readLogPath(home) {
  return join(home, ".agents", "knowledge", "read.log");
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** R's window: "topic reads on this host in 7 days" (spec.md K2 item 1). */
export const READ_WINDOW_MS = 7 * DAY_MS;

function safeReaddir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Never trust a dirent's own type for a symlink (attack brief: "a symlinked knowledge dir") —
 * `statSync` follows symlinks, so a symlinked topic file (or the store itself being a symlink,
 * which `safeReaddir`'s caller already resolved by the time an entry reaches here) still counts,
 * and a broken symlink (`statSync` throws) counts as absent rather than crashing the whole count.
 */
function isRegularFile(fullPath, dirent) {
  if (dirent.isSymbolicLink()) {
    try {
      return statSync(fullPath).isFile();
    } catch {
      return false;
    }
  }
  return dirent.isFile();
}

/** T (spec.md K2 item 1): markdown files in the store top level, excluding `INDEX.md` and any
 * name starting with `_` (so `_inbox` and any other leading-underscore entry are never topics). */
export function countTopics(home) {
  const dir = storeDir(home);
  let n = 0;
  for (const d of safeReaddir(dir)) {
    const name = d.name;
    if (name.startsWith("_")) continue;
    if (name === "INDEX.md") continue;
    if (!name.toLowerCase().endsWith(".md")) continue;
    if (isRegularFile(join(dir, name), d)) n++;
  }
  return n;
}

/** A leading `YYYY-MM-DD` in the filename, the common shape every real inbox note already uses. */
const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})(?:[-_.]|$)/;

/**
 * One date per pending inbox file — the filename's own date prefix, else the file's mtime
 * (spec.md K2 item 1: "oldest from the filename date prefix, else mtime") — sorted ascending.
 * `_archive/` is excluded by name before any file-type check, so nothing under it is ever
 * visited or recursed into (spec.md's own attack brief: "_inbox/_archive/ files counted as
 * pending" must not happen); dotfiles are excluded the same way.
 */
function inboxDates(home) {
  const dir = inboxDir(home);
  const dates = [];
  for (const d of safeReaddir(dir)) {
    const name = d.name;
    if (name.startsWith(".")) continue; // dotfiles excluded
    if (name === "_archive") continue; // triaged, never pending; never recursed into
    const full = join(dir, name);
    if (!isRegularFile(full, d)) continue; // a note is a file; any other subdirectory is skipped
    const m = name.match(DATE_PREFIX);
    if (m) {
      dates.push(m[1]);
      continue;
    }
    try {
      dates.push(new Date(statSync(full).mtimeMs).toISOString().slice(0, 10));
    } catch {
      // vanished under us or unreadable; not counted at all rather than guessed
    }
  }
  return dates.sort();
}

/** P and its oldest date (spec.md K2 item 1's `<P>`/`oldest`). */
export function countPending(home) {
  const dates = inboxDates(home);
  return { pending: dates.length, oldest: dates[0] ?? null };
}

/** The inbox date range (oldest AND newest), for `knowledge-count.mjs`'s extra output (spec.md
 * K3 item 1: "the three counts of K2 plus the inbox date range for this host"). Reuses the exact
 * same file scan `countPending` uses, so the two can never disagree about what "oldest" means. */
export function inboxDateRange(home) {
  const dates = inboxDates(home);
  return { oldest: dates[0] ?? null, newest: dates[dates.length - 1] ?? null };
}

/**
 * R: read.log lines whose leading ISO timestamp falls in the 7 days up to `now` (spec.md K2 item
 * 1's `<R>`). A malformed line (attack brief) — no leading timestamp, or one that does not parse
 * — is skipped, never counted and never thrown on. `<=` on both ends so a line stamped exactly
 * `now` counts, and a clock-skewed future timestamp does not.
 */
export function countReads(home, now) {
  let text;
  try {
    text = readFileSync(readLogPath(home), "utf8");
  } catch {
    return 0;
  }
  let n = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const ts = trimmed.split(" ")[0];
    const parsed = Date.parse(ts);
    if (Number.isNaN(parsed)) continue;
    if (parsed <= now && now - parsed <= READ_WINDOW_MS) n++;
  }
  return n;
}

/**
 * The one pure function both callers share (spec.md K3 item 1).
 *
 * @param {string} home  an OS home directory (real `homedir()` in production; a scratch
 *   directory containing `.claude/knowledge` and `.agents/knowledge/read.log` in a test)
 * @param {number} [now] ms since epoch; defaults to `Date.now()`
 * @returns {{topics: number, pending: number, oldest: string|null, reads: number, storeExists: boolean}}
 *   `storeExists` is false when `.claude/knowledge` itself is absent — the caller's own signal
 *   for "no line" (spec.md K2 item 2: "Absent store: no line"), kept alongside the four named
 *   fields rather than folded into a guessed zero.
 */
export function knowledgeCounts(home, now = Date.now()) {
  try {
    if (!existsSync(storeDir(home))) {
      return { topics: 0, pending: 0, oldest: null, reads: 0, storeExists: false };
    }
    const topics = countTopics(home);
    const { pending, oldest } = countPending(home);
    const reads = countReads(home, now);
    return { topics, pending, oldest, reads, storeExists: true };
  } catch {
    return { topics: 0, pending: 0, oldest: null, reads: 0, storeExists: false };
  }
}
