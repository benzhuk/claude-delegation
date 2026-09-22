#!/usr/bin/env node
// work-census — dispatch-latency, elapsed, and idle-time census over docs/work/*.record.md
// (spec.md L-C10). Reads through scripts/work-record.mjs's own `listRecords`/`parseRecord`
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

// Rounds: the record's own Rounds: field when present, else a count of owned -> delivered
// transitions (adjacent Log lines, file order).
function countRounds(fields, log) {
  if (fields.rounds !== undefined && fields.rounds !== '') {
    const n = Number(fields.rounds);
    if (!Number.isNaN(n)) return n;
  }
  let rounds = 0;
  for (let i = 0; i < log.length - 1; i++) {
    if (log[i].status === 'owned' && log[i + 1].status === 'delivered') rounds++;
  }
  return rounds;
}

// Dispatch latency (spec.md L-C10, revised): for each `delivered` Log line, the time to
// the FIRST LATER Log line whose status is `reviewed` OR `rejected` — never simply "the
// next line" (a real record's line right after `delivered` is routinely a same-second
// `owned ... agent-exited` hand-back, which measures bookkeeping, not dispatch). A record
// delivered more than once (fix rounds) gets one latency per round.
function dispatchLatencies(log) {
  const out = [];
  for (let i = 0; i < log.length; i++) {
    if (log[i].status !== 'delivered') continue;
    for (let j = i + 1; j < log.length; j++) {
      if (log[j].status === 'reviewed' || log[j].status === 'rejected') {
        const ms = Date.parse(log[j].at) - Date.parse(log[i].at);
        out.push({ deliveredAt: log[i].at, respondedAt: log[j].at, respondedStatus: log[j].status, ms });
        break;
      }
    }
  }
  return out;
}

// Elapsed (spec.md L-C10, revised): opened -> accepted. Most real records never reach
// `accepted` (the common case, not an edge case) — fall back to opened -> the LAST
// `reviewed` line, labeled "(to reviewed)" rather than left blank.
function elapsedFor(openedAt, log) {
  const lastAccepted = lastOfStatus(log, 'accepted');
  if (openedAt && lastAccepted) {
    return { ms: Date.parse(lastAccepted) - Date.parse(openedAt), endAt: lastAccepted, label: '(to accepted)' };
  }
  const lastReviewed = lastOfStatus(log, 'reviewed');
  if (openedAt && lastReviewed) {
    return { ms: Date.parse(lastReviewed) - Date.parse(openedAt), endAt: lastReviewed, label: '(to reviewed)' };
  }
  return { ms: null, endAt: null, label: '(no reviewed or accepted line)' };
}

function perWorkReport(entry) {
  const { path: recPath, record } = entry;
  const fields = record.fields ?? {};
  const log = record.log ?? [];
  const work = fields.work || path.basename(recPath);

  const latencies = dispatchLatencies(log);
  const latencySumMs = latencies.reduce((s, d) => s + d.ms, 0);
  const elapsed = elapsedFor(fields.opened, log);

  return {
    work,
    path: recPath,
    opened: fields.opened || null,
    firstOwned: firstOfStatus(log, 'owned'),
    firstDelivered: firstOfStatus(log, 'delivered'),
    firstReviewed: firstOfStatus(log, 'reviewed'),
    firstAccepted: firstOfStatus(log, 'accepted'),
    rounds: countRounds(fields, log),
    dispatchLatencies: latencies,
    dispatchLatencySumMs: latencySumMs,
    elapsedMs: elapsed.ms,
    elapsedEndAt: elapsed.endAt,
    elapsedLabel: elapsed.label,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Idle minutes footer
// ─────────────────────────────────────────────────────────────────────────────

// Total idle time (ms) across all records during which at least one record was
// `runnable` with `Owner: none`, computed from merged, timestamp-sorted status
// transitions across every record's Log lines (spec.md L-C10 footer). A record with no
// Log lines at all contributes no transitions and is never considered idle.
export function idleMsAcrossRecords(records) {
  const events = [];
  for (const { path: recPath, record } of records) {
    const work = (record.fields ?? {}).work || recPath;
    for (const l of record.log ?? []) {
      const t = Date.parse(l.at);
      if (Number.isNaN(t)) continue;
      events.push({ t, work, status: l.status, owner: l.owner });
    }
  }
  events.sort((a, b) => a.t - b.t);

  const state = new Map(); // work -> { status, owner }
  const isIdle = () => {
    for (const s of state.values()) {
      if (s.status === 'runnable' && s.owner === 'none') return true;
    }
    return false;
  };

  let idleMs = 0;
  let prevT = null;
  let prevIdle = false;
  let i = 0;
  while (i < events.length) {
    const t = events[i].t;
    if (prevT !== null && t > prevT && prevIdle) idleMs += t - prevT;
    while (i < events.length && events[i].t === t) {
      state.set(events[i].work, { status: events[i].status, owner: events[i].owner });
      i++;
    }
    prevIdle = isIdle();
    prevT = t;
  }
  return idleMs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

export function computeWorkCensus(records) {
  const perWork = records.map(perWorkReport);
  const idleMinutes = idleMsAcrossRecords(records) / 60000;
  return { perWork, idleMinutes };
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
  md.push('## Dispatch latency (delivered -> first later reviewed or rejected)');
  md.push('');
  md.push('| work | round | delivered at | responded at | status | latency |');
  md.push('|---|---|---|---|---|---|');
  for (const r of report.perWork) {
    r.dispatchLatencies.forEach((d, i) => {
      md.push(`| ${r.work} | ${i + 1} | ${d.deliveredAt} | ${d.respondedAt} | ${d.respondedStatus} | ${fmtMinutes(d.ms)} |`);
    });
  }
  md.push('');
  md.push('| work | latency sum (all rounds) |');
  md.push('|---|---|');
  for (const r of report.perWork) md.push(`| ${r.work} | ${fmtMinutes(r.dispatchLatencySumMs)} |`);
  md.push('');
  md.push('## Elapsed (opened -> accepted, or opened -> last reviewed)');
  md.push('');
  md.push('| work | elapsed | ends at | label |');
  md.push('|---|---|---|---|');
  for (const r of report.perWork) {
    md.push(`| ${r.work} | ${fmtMinutes(r.elapsedMs)} | ${r.elapsedEndAt || '(none)'} | ${r.elapsedLabel} |`);
  }
  md.push('');
  md.push(`## Idle minutes (>=1 record runnable, Owner: none)`);
  md.push('');
  md.push(`Total idle: **${report.idleMinutes.toFixed(1)} minutes**`);
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
    if (a === '--out') opts.out = argv[++i];
    else if (a.startsWith('--')) throw new Error(`unknown argument: ${a}`);
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

export async function main(argv = process.argv.slice(2), { fsImpl = realFs(), write = (s) => console.log(s) } = {}) {
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
