#!/usr/bin/env node
// backlog-notice — tells whoever is at the keyboard (or in an autonomous stretch) that the work
// record ledger (`docs/work/*.record.md`, C1 in next-build/spec.md) has something runnable, delivered
// or rejected waiting on them. It never blocks, never decides, and it is silent the overwhelming
// majority of the time it runs.
//
// SPEC: next-build/spec.md, C3. Read that before changing anything here.
//
// FOUR RULES, same as every hook in this plugin:
//   1. NEVER THROW past main(). Every path is wrapped; the fallback is "print nothing, exit 0".
//   2. SILENT WHEN THERE IS NOTHING TO SAY. Silent when all three counts are zero, silent within the
//      120-second window, silent when a kill switch is present.
//   3. CHEAP ON THE HOT PATH. PostToolUse fires on every tool call, so it gets a second, file-stat-only
//      gate before anything is imported (round-3 red-team addendum A1 — see below).
//   4. FAIL OPEN. Any error: one line to stderr, exit 0, nothing on stdout.
//
// CHEAP EXIT (round-3 addendum A1 replaces the original C3 wording, which used the docs/work
// DIRECTORY's own mtime — wrong, because a directory's mtime only moves when an entry is created,
// renamed or deleted, never when an existing *.record.md has its Status edited in place, which is
// exactly how records change. Applied here as A1 says:
//   1. Every event: sentinel exists and is under 120s old (by its stored `printedAt`) -> exit 0.
//   2. PostToolUse only, additionally: stat every `*.record.md` in `<cwd>/docs/work` (no readFileSync,
//      no parser import yet) and exit 0 when BOTH the newest FILE mtime and the file count equal what
//      the sentinel has stored. Never the directory's own mtime.
//   3. UserPromptSubmit and Stop have no second gate — the 120s sentinel is their only suppressor.
//   4. The sentinel is rewritten only when a line is actually printed.
// The sentinel path is `<agentsHome>/ws/backlog-notice.<session_id>` — one sentinel per session,
// shared by all three events, same shape as the stamp file in `hooks/multi-inbox.js:214-224`.
//
// ROUND-2 REVIEW FIXES:
//   MAJOR 1 — with no sentinel yet (a repo with no `docs/work`, or a ledger that never prints
//     because every record is `owned`/`accepted`), the second gate used to be skipped entirely, so
//     every PostToolUse paid for the ESM import and a full parse. `cheapExit` now stats first,
//     unconditionally, and exits at once when there are zero record files — nothing to import for.
//   MAJOR 1 residual (orchestrator ruling, binding): the sentinel keeps two kinds of fields.
//     `printedAt` moves only when a line is printed (A1.4, unchanged). The scan fields
//     (`newestMtimeMs`, `fileCount`) are recorded on EVERY PostToolUse evaluation that gets past the
//     120s gate, printed or not (`writeScanOnly`, below) — so an all-owned ledger is parsed once and
//     then stat-only until a record file actually changes.
//   MINOR 4 — `outputFor` only ever emits for the three events C3 names; anything else gets no
//     output at all (there is no fourth shape to guess at).
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

const SENTINEL_INTERVAL_MS = 120 * 1000;
const MAX_IDS = 3;
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const PARSER_PATH = path.join(PLUGIN_ROOT, 'scripts', 'work-record.mjs');

// ─────────────────────────────────────────────────────────────────────────────
// Home + kill switch — restated in CommonJS exactly as hooks/delegation-reminder.js:159-188 does
// (agentsHome / switchPresent / activeSwitch), pinned against scripts/project-config.mjs's
// switchedOff by hooks/backlog-notice.test.mjs. Duplicated deliberately: the hot path (PostToolUse,
// below the 120s gate) must not pay for an ESM import of project-config.mjs to learn it has nothing
// to do.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Home resolution: an explicit `home` argument wins, then AGENTS_HOME, then homedir()/.agents.
 * The live hook never passes an explicit home (there is none in the stdin payload); the parameter
 * exists so this function is directly unit-testable without an AGENTS_HOME env round-trip.
 */
function agentsHome(explicit, env = process.env) {
  if (explicit) return explicit;
  return (env && env.AGENTS_HOME) || path.join(os.homedir(), '.agents');
}

/**
 * `existsSync`-shaped check that fails TOWARD "present": only ENOENT/ENOTDIR (the file genuinely is
 * not there) counts as absent; any other error (EACCES, etc.) counts as the switch being present.
 * Copied verbatim in shape from hooks/delegation-reminder.js:170-177.
 */
function switchPresent(p) {
  try {
    fs.statSync(p);
    return true;
  } catch (e) {
    return Boolean(e) && e.code !== 'ENOENT' && e.code !== 'ENOTDIR';
  }
}

/** `"ws-off"` (master), `"ws-off-backlog"` (this feature), or null. */
function activeSwitch(home) {
  try {
    if (switchPresent(path.join(home, 'ws-off'))) return 'ws-off';
    if (switchPresent(path.join(home, 'ws-off-backlog'))) return 'ws-off-backlog';
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentinel — one file per session, covers all three events
// ─────────────────────────────────────────────────────────────────────────────

function sentinelPathFor(home, sessionId) {
  return path.join(home, 'ws', `backlog-notice.${sessionId || 'unknown'}`);
}

/**
 * null only when the file is absent, unreadable or not valid JSON — treated as "no sentinel yet".
 * `printedAt` is `null` (not a reason to discard the rest) when the file holds scan fields but has
 * never had a print recorded — `writeScanOnly` produces exactly that shape.
 */
function readSentinel(p) {
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const parsed = typeof raw.printedAt === 'string' ? Date.parse(raw.printedAt) : NaN;
    return {
      printedAt: Number.isFinite(parsed) ? parsed : null,
      newestMtimeMs: Number(raw.newestMtimeMs) || 0,
      fileCount: Number(raw.fileCount) || 0,
    };
  } catch {
    return null;
  }
}

/** Only ever called after a line is actually printed (A1.4). Never throws. */
function writeSentinel(p, { now, newestMtimeMs, fileCount }) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(
      p,
      JSON.stringify({ printedAt: new Date(now).toISOString(), newestMtimeMs, fileCount }),
      'utf8',
    );
  } catch {
    /* a sentinel we cannot write just means the next call re-derives everything */
  }
}

/**
 * Orchestrator ruling on MAJOR 1's residual: records what THIS evaluation scanned WITHOUT moving
 * `printedAt` — called only when PostToolUse got past the 120s gate but had nothing to print. Any
 * `printedAt` already on disk is preserved untouched; a sentinel that has never printed stays
 * without one. Never throws.
 */
function writeScanOnly(p, { newestMtimeMs, fileCount }) {
  try {
    const existing = readSentinel(p);
    const body = { newestMtimeMs, fileCount };
    if (existing && existing.printedAt !== null) {
      body.printedAt = new Date(existing.printedAt).toISOString();
    }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(body), 'utf8');
  } catch {
    /* a sentinel we cannot write just means the next call re-derives everything */
  }
}

/** Stat-only pass over `<cwd>/docs/work`: no readFileSync, no parser import. Never throws. */
function scanWorkDir(workDir) {
  let names;
  try {
    names = fs.readdirSync(workDir);
  } catch {
    return { fileCount: 0, newestMtimeMs: 0 };
  }
  let fileCount = 0;
  let newestMtimeMs = 0;
  for (const name of names) {
    if (!name.endsWith('.record.md')) continue;
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(path.join(workDir, name)).mtimeMs;
    } catch {
      continue;
    }
    fileCount += 1;
    if (mtimeMs > newestMtimeMs) newestMtimeMs = mtimeMs;
  }
  return { fileCount, newestMtimeMs };
}

/**
 * A1: the cheap exit. Returns true when this event should print nothing and touch nothing else.
 * `sentinel` may be null (first call this session, or an unreadable/cleared sentinel) — then only
 * the PostToolUse second gate is skipped, never the whole function.
 */
function cheapExit({ event, sentinel, workDir, now }) {
  if (sentinel && sentinel.printedAt !== null && now - sentinel.printedAt < SENTINEL_INTERVAL_MS) return true;
  // MAJOR 1: stat-only, before any import. With no records there is nothing to say, and without
  // this a sentinel-less repo (no docs/work, or a ledger that never prints) paid for the ESM import
  // and a full parse on every single PostToolUse call.
  const scan = scanWorkDir(workDir);
  if (scan.fileCount === 0) return true;
  if (event === 'PostToolUse' && sentinel) {
    if (scan.newestMtimeMs === sentinel.newestMtimeMs && scan.fileCount === sentinel.fileCount) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Counting + the line
// ─────────────────────────────────────────────────────────────────────────────

function idsList(ids) {
  return ids.slice(0, MAX_IDS).join(', ');
}

/**
 * Buckets records by status. A record with no `work` id, no `status`, or a `status` outside the
 * known set is malformed: skipped here, counted only for the caller's stderr note, never in the
 * printed counts. A `runnable`-status record whose `owner` is present and not `'none'` is malformed
 * too (work-record.mjs's `runnable-with-owner`, L-C6) — it is not what it claims to be, so it is not
 * pushed into `runnable` either.
 */
function classify(entries, statuses) {
  const runnable = [];
  const delivered = [];
  const rejected = [];
  let malformed = 0;
  for (const { record } of entries) {
    const status = record && record.fields && record.fields.status;
    const work = record && record.fields && record.fields.work;
    const owner = record && record.fields && record.fields.owner;
    if (!status || !work || !statuses.includes(status)) {
      malformed += 1;
      continue;
    }
    if (status === 'runnable' && owner !== undefined && owner !== '' && owner !== 'none') {
      malformed += 1;
      continue;
    }
    if (status === 'runnable') runnable.push(work);
    else if (status === 'delivered') delivered.push(work);
    else if (status === 'rejected') rejected.push(work);
  }
  return { runnable, delivered, rejected, malformed };
}

function buildLine({ runnable, delivered, rejected }) {
  return (
    `work: ${runnable.length} runnable and unowned (${idsList(runnable)}), ` +
    `${delivered.length} delivered and unreviewed (${idsList(delivered)}), ` +
    `${rejected.length} rejected awaiting a fix round (${idsList(rejected)}). ` +
    'Pull one or say why not.'
  );
}

function outputFor(event, line) {
  if (event === 'Stop') return { systemMessage: line };
  if (event === 'UserPromptSubmit' || event === 'PostToolUse') {
    return { hookSpecificOutput: { hookEventName: event, additionalContext: line } };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire protocol
// ─────────────────────────────────────────────────────────────────────────────

function readInput() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => {
      raw += d;
    });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

/** Write and WAIT for the flush before exiting — a pipe write is asynchronous (see multi-inbox.js). */
function emit(object) {
  return new Promise((resolve) => {
    try {
      process.stdout.write(JSON.stringify(object), () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

async function main() {
  const input = await readInput();
  const event = input.hook_event_name || process.argv[2] || 'UserPromptSubmit';
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const sessionId = input.session_id;

  const home = agentsHome(undefined, process.env);
  if (activeSwitch(home)) return; // ws-off or ws-off-backlog: silent, nothing read, nothing written

  const workDir = path.join(cwd, 'docs', 'work');
  const sentinelPath = sentinelPathFor(home, sessionId);
  const now = Date.now();
  const sentinel = readSentinel(sentinelPath);

  if (cheapExit({ event, sentinel, workDir, now })) return;

  let entries = [];
  let statuses;
  let duplicates = [];
  try {
    const parser = await import(pathToFileURL(PARSER_PATH).href);
    statuses = parser.STATUSES;
    entries = parser.listRecords(workDir, { fsImpl: fs });
    duplicates = parser.checkRecordSet(entries);
  } catch (err) {
    process.stderr.write(`backlog-notice: could not load the parser — ${err && err.message ? err.message : String(err)}\n`);
    return;
  }

  const { runnable, delivered, rejected, malformed } = classify(entries, statuses);
  if (malformed > 0) {
    process.stderr.write(`backlog-notice: skipped ${malformed} malformed record(s) in ${workDir}\n`);
  }
  if (duplicates.length > 0) {
    const ids = duplicates.map((d) => d.work).join(', ');
    process.stderr.write(`backlog-notice: duplicate work id(s): ${ids}\n`);
  }

  const scan = scanWorkDir(workDir);
  const hasBacklog = runnable.length > 0 || delivered.length > 0 || rejected.length > 0;

  if (!hasBacklog) {
    // MAJOR 1 residual (orchestrator ruling): PostToolUse records what it just scanned even with
    // nothing to print, so the next PostToolUse call — if nothing changed — hits the second gate's
    // match check instead of importing the parser and re-parsing every record again.
    if (event === 'PostToolUse') {
      writeScanOnly(sentinelPath, { newestMtimeMs: scan.newestMtimeMs, fileCount: scan.fileCount });
    }
    return;
  }

  const line = buildLine({ runnable, delivered, rejected });
  const payload = outputFor(event, line);
  if (!payload) return;
  await emit(payload);
  writeSentinel(sentinelPath, { now, newestMtimeMs: scan.newestMtimeMs, fileCount: scan.fileCount });
}

module.exports = {
  agentsHome,
  switchPresent,
  activeSwitch,
  sentinelPathFor,
  readSentinel,
  writeSentinel,
  scanWorkDir,
  cheapExit,
  classify,
  buildLine,
  outputFor,
};

if (require.main === module) {
  main()
    .catch(() => {
      /* rule 1: a hook failure must never be visible to Ben's session */
    })
    .finally(() => {
      process.exit(0);
    });
}
