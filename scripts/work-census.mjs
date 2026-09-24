#!/usr/bin/env node
// work-census — elapsed and rounds census over docs/work/*.record.md
// (spec.md L-C10; dispatch latency and idle minutes retired per the M4 ruling,
// docs/notes/skills-fable-loop-build-3.md:8-9 — both measured the lead's hand dispatch,
// which the loop deletes by construction). Reads through scripts/work-record.mjs's own
// `listRecords`/`parseRecord`
// rather than re-parsing records; the Log grammar is `Log: <ISO> <status> <owner> <note>`
// (work-record.mjs:78,86).
//
// node --test scripts/work-census.test.mjs

import fs, { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listRecords } from './work-record.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Per-record timings
// ─────────────────────────────────────────────────────────────────────────────

function firstOfStatus(log, status) {
  const hit = log.find((l) => l.status === status);
  return hit ? hit.at : null;
}

function lastOfStatus(log, status) {
  let last = null;
  for (const l of log) if (l.status === status) last = l.at;
  return last;
}

// Timing evidence is deliberately admitted at the measurement boundary, after the shared
// record parser has preserved the raw Log fields. This accepts the ISO forms records use
// (Z or explicit offsets, with optional fractional seconds) without promoting prose such
// as `Sol delivered ...` into a timestamp.
function parseTimingEvidence(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;
  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond, rawOffsetHour, rawOffsetMinute] = match;
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = [rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond, rawOffsetHour, rawOffsetMinute].map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
    || hour > 23 || minute > 59 || second > 59 || (rawOffsetHour !== undefined && (offsetHour > 23 || offsetMinute > 59))) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? { value, ms } : null;
}

function timingValue(value) {
  return parseTimingEvidence(value)?.value ?? null;
}

// Rounds: the record's own Rounds: field when present, else a count of owned -> delivered
// transitions, file order. L-C10 says "a count of owned -> delivered transitions", not
// "adjacent Log lines" — an intervening line of some other status (a reviewed interim
// note, a rejected verdict) between an owned and its eventual delivered must still count
// as one transition. Tracked with an "armed" flag rather than adjacency: arms on `owned`,
// fires (and disarms) on the next `delivered`, ignoring everything else in between.
function countRounds(fields, log) {
  if (fields.rounds !== undefined && fields.rounds !== '') {
    const n = Number(fields.rounds);
    if (!Number.isNaN(n)) return n;
  }
  let rounds = 0;
  let armed = false;
  for (const l of log) {
    if (l.status === 'owned') armed = true;
    else if (l.status === 'delivered' && armed) {
      rounds++;
      armed = false;
    }
  }
  return rounds;
}

// Elapsed (spec.md L-C10, revised): opened -> accepted. Most real records never reach
// `accepted` (the common case, not an edge case) — fall back to opened -> the LAST
// `reviewed` line, labeled "(to reviewed)" rather than left blank. The label names
// whichever field is actually missing: a record with a reviewed/accepted line but no
// `Opened:` field is a different problem than one with neither line at all, and a label
// that names the wrong cause is worse than none in a tool whose job is credible numbers.
function elapsedFor(openedAt, log) {
  const lastAccepted = lastOfStatus(log, 'accepted');
  const lastReviewed = lastOfStatus(log, 'reviewed');
  const rawEndAt = lastAccepted || lastReviewed;
  const kind = lastAccepted ? 'accepted' : lastReviewed ? 'reviewed' : null;

  if (!rawEndAt) return { ms: null, endAt: null, label: '(no reviewed or accepted line)' };
  const end = parseTimingEvidence(rawEndAt);
  if (!end) return { ms: null, endAt: null, label: `(invalid ${kind} timestamp)` };
  if (!openedAt) return { ms: null, endAt: end.value, label: '(no Opened: field)' };
  const start = parseTimingEvidence(openedAt);
  if (!start) return { ms: null, endAt: end.value, label: '(invalid Opened: field)' };
  const ms = end.ms - start.ms;
  if (!Number.isFinite(ms) || ms < 0) return { ms: null, endAt: end.value, label: '(end precedes Opened: field)' };
  return { ms, endAt: end.value, label: `(to ${kind})` };
}

function perWorkReport(entry) {
  const { path: recPath, record } = entry;
  const fields = record.fields ?? {};
  const log = record.log ?? [];
  const work = fields.work || path.basename(recPath);

  const elapsed = elapsedFor(fields.opened, log);

  return {
    work,
    path: recPath,
    opened: timingValue(fields.opened),
    firstOwned: timingValue(firstOfStatus(log, 'owned')),
    firstDelivered: timingValue(firstOfStatus(log, 'delivered')),
    firstReviewed: timingValue(firstOfStatus(log, 'reviewed')),
    firstAccepted: timingValue(firstOfStatus(log, 'accepted')),
    rounds: countRounds(fields, log),
    elapsedMs: elapsed.ms,
    elapsedEndAt: elapsed.endAt,
    elapsedLabel: elapsed.label,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

export function computeWorkCensus(records) {
  const perWork = records.map(perWorkReport);
  return { perWork };
}

function fmtMinutes(ms) {
  if (ms === null || ms === undefined) return 'n/a';
  return `${(ms / 60000).toFixed(1)}m`;
}

export function formatText(report) {
  const md = [];
  md.push('# Work census');
  md.push('');
  md.push('| work | opened | first owned | first delivered | first reviewed | first accepted | rounds |');
  md.push('|---|---|---|---|---|---|---|');
  for (const r of report.perWork) {
    md.push(`| ${r.work} | ${r.opened || '(none)'} | ${r.firstOwned || '(none)'} | ${r.firstDelivered || '(none)'} | ${r.firstReviewed || '(none)'} | ${r.firstAccepted || '(none)'} | ${r.rounds} |`);
  }
  md.push('');
  md.push('## Elapsed (opened -> accepted, or opened -> last reviewed)');
  md.push('');
  md.push('| work | elapsed | ends at | label |');
  md.push('|---|---|---|---|');
  for (const r of report.perWork) {
    md.push(`| ${r.work} | ${fmtMinutes(r.elapsedMs)} | ${r.elapsedEndAt || '(none)'} | ${r.elapsedLabel} |`);
  }
  return md.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const opts = { dir: 'docs/work', out: null };
  let sawPositional = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      const v = argv[++i];
      if (!v) throw new Error('--out needs a value');
      opts.out = v;
    } else if (a.startsWith('--')) throw new Error(`unknown argument: ${a}`);
    else if (!sawPositional) {
      opts.dir = a;
      sawPositional = true;
    } else {
      throw new Error(`unexpected argument: ${a}`);
    }
  }
  return opts;
}

function realFs() {
  return {
    readdirSync: fs.readdirSync,
    readFileSync: fs.readFileSync,
    writeFileSync: fs.writeFileSync,
  };
}

export async function main(argv = process.argv.slice(2), { fsImpl = realFs(), now = Date.now(), write = (s) => console.log(s) } = {}) {
  const opts = parseArgs(argv);
  const records = listRecords(opts.dir, { fsImpl });
  const report = computeWorkCensus(records);
  const text = formatText(report);
  if (opts.out) {
    fsImpl.writeFileSync(opts.out, text.endsWith('\n') ? text : `${text}\n`);
    write(`wrote: ${opts.out}`);
  } else {
    write(text);
  }
  return 0;
}

/**
 * Only when RUN, never when imported — win32-safe, same shape as scripts/token-census.mjs's
 * isMainModule (a bare `import.meta.url === file://${argv[1]}` check never matches on
 * win32, since argv[1] is a backslash path).
 */
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const real = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const canon = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  const self = real(fileURLToPath(import.meta.url));
  const argv1 = real(entry);
  return canon(self) === canon(argv1);
}

if (isMainModule()) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`work-census: ${String(err && err.message ? err.message : err)}\n`);
      process.exit(1);
    },
  );
}
