#!/usr/bin/env node
// build-census — turn/token census over one lead transcript (a Claude Code session
// .jsonl) plus its subagent .output/.jsonl transcripts, for measuring one loop-build run
// against another (spec.md L-C9).
//
// THE DE-DUPLICATION FIX, the whole point of this file: Claude Code re-emits the SAME
// logical assistant turn as several JSONL lines — one per `apiBlockIndex` — all sharing
// one `requestId` (and one `message.id`), each repeating the same `input_tokens`/
// `cache_read_input_tokens` while `output_tokens` grows across the lines; only the LAST
// line for a given id holds the true final counts. Naive per-line summing over-counted
// the dominant token category by ~1.8x on a real 813-line transcript. Every id is kept in
// a bounded `Map<id, entry>`, OVERWRITTEN on every repeat (last-line-wins) — this is a map
// keyed by id, not a buffer of raw lines, so streaming stays bounded. A "turn" is one map
// entry (`Map.size`), counted once the stream ends, never a per-line increment.
//
// SECRECY, load-bearing: this tool never reads or prints `message.content` (or any other
// transcript text) except to test membership of `--marker` inside a parsed line via
// `containsMarkerDeep`, which returns only a boolean and never the matched string. Output
// is numbers, model names, and file basenames only.
//
// node --test scripts/build-census.test.mjs

import fs, { realpathSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// Usage aggregation
// ─────────────────────────────────────────────────────────────────────────────

function newAgg() {
  return { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
}

function addUsage(agg, usage) {
  if (!usage) return;
  agg.input_tokens += usage.input_tokens || 0;
  agg.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
  agg.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
  agg.output_tokens += usage.output_tokens || 0;
}

// Sum, by model, the LAST-seen entry for every id in a dedup map.
function aggByModel(idMap) {
  const byModel = {};
  for (const entry of idMap.values()) {
    const model = entry.model || 'unknown';
    if (!byModel[model]) byModel[model] = newAgg();
    addUsage(byModel[model], entry.usage);
  }
  return byModel;
}

function mergeAggInto(target, source) {
  for (const [model, a] of Object.entries(source)) {
    if (!target[model]) target[model] = newAgg();
    target[model].input_tokens += a.input_tokens;
    target[model].cache_creation_input_tokens += a.cache_creation_input_tokens;
    target[model].cache_read_input_tokens += a.cache_read_input_tokens;
    target[model].output_tokens += a.output_tokens;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Marker search — bounded depth/width, returns a boolean only, never the matched text.
// ─────────────────────────────────────────────────────────────────────────────

function containsMarkerDeep(value, marker, depth = 0) {
  if (depth > 8 || value == null) return false;
  if (typeof value === 'string') return value.includes(marker);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length && i < 50; i++) {
      if (containsMarkerDeep(value[i], marker, depth + 1)) return true;
    }
    return false;
  }
  if (typeof value === 'object') {
    for (const k of Object.keys(value)) {
      if (containsMarkerDeep(value[k], marker, depth + 1)) return true;
    }
    return false;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming line readers — never buffer a whole file.
// ─────────────────────────────────────────────────────────────────────────────

async function openLines(fsImpl, filePath) {
  const stream = fsImpl.createReadStream(filePath, { encoding: 'utf8' });
  return readline.createInterface({ input: stream, crlfDelay: Infinity });
}

// Resolve the canonical id for one line and store it (last-line-wins) into idMap.
// aliasByMsgId records, once a line carries BOTH a requestId and a message.id, that the
// message.id belongs to that requestId — so a line that later (or earlier, in file
// position) carries the SAME message.id but no requestId of its own resolves to the same
// canonical `req:` key instead of splitting into a second turn (a mixed-id-presence line
// pair would otherwise double-count the one logical turn L-C9 exists to collapse).
function resolveAndStore(idMap, aliasByMsgId, obj, uniqueCounter, entry) {
  const requestId = obj.requestId || null;
  const msgId = (obj.message && obj.message.id) || null;
  let canonicalKey;
  if (requestId && msgId) {
    canonicalKey = `req:${requestId}`;
    if (!aliasByMsgId.has(msgId)) aliasByMsgId.set(msgId, canonicalKey);
    // Migrate an entry that was filed under the bare msg: key before the alias was known
    // (the message.id-only line arrived first in the stream).
    const priorMsgKey = `msg:${msgId}`;
    if (idMap.has(priorMsgKey)) idMap.delete(priorMsgKey);
  } else if (requestId) {
    canonicalKey = `req:${requestId}`;
  } else if (msgId) {
    canonicalKey = aliasByMsgId.get(msgId) || `msg:${msgId}`;
  } else {
    canonicalKey = `line:${uniqueCounter.n++}`;
  }
  idMap.set(canonicalKey, entry); // last-line-wins
}

/**
 * Census one lead transcript file. Returns:
 *   { totalById: Map<id, {model, usage, ts}>, windowById: Map (same shape; === totalById
 *     entries filtered to the marker window, or the whole-file map when no marker is
 *     given), windowStartAt, firstAt, lastAt }
 * De-dup ("last line wins") is applied independently to the total map and the window map,
 * since a request can straddle the marker boundary (spec.md L-C9).
 */
export async function censusLeadFile(filePath, { fsImpl = fs, marker } = {}) {
  const rl = await openLines(fsImpl, filePath);
  const totalById = new Map();
  const totalAlias = new Map();
  const windowById = marker ? new Map() : totalById; // no marker: window == whole file
  const windowAlias = marker ? new Map() : totalAlias;
  const uniqueCounter = { n: 0 };

  let windowStarted = !marker;
  let windowStartAt = null;
  let firstAt = null;
  let lastAt = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (obj.timestamp) {
      if (!firstAt) firstAt = obj.timestamp;
      lastAt = obj.timestamp;
    }

    if (marker && !windowStarted && containsMarkerDeep(obj, marker)) {
      windowStarted = true;
      windowStartAt = obj.timestamp || lastAt;
    }

    if (obj.type !== 'assistant' || !obj.message || !obj.message.usage) continue;

    const entry = { model: obj.message.model || 'unknown', usage: obj.message.usage, ts: obj.timestamp || lastAt };
    resolveAndStore(totalById, totalAlias, obj, uniqueCounter, entry);
    if (marker && windowStarted) resolveAndStore(windowById, windowAlias, obj, uniqueCounter, entry);
  }

  if (!marker) windowStartAt = firstAt;

  return { totalById, windowById, windowStartAt, firstAt, lastAt };
}

/**
 * Census one subagent .output/.jsonl file. Same last-line-wins de-dup, independently per
 * file. Returns { byId: Map<id, {model, usage, ts}>, firstAt, lastAt }.
 */
export async function censusSubFile(filePath, { fsImpl = fs } = {}) {
  const rl = await openLines(fsImpl, filePath);
  const byId = new Map();
  const alias = new Map();
  const uniqueCounter = { n: 0 };
  let firstAt = null;
  let lastAt = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.timestamp) {
      if (!firstAt) firstAt = obj.timestamp;
      lastAt = obj.timestamp;
    }
    if (obj.type !== 'assistant' || !obj.message || !obj.message.usage) continue;
    const entry = { model: obj.message.model || 'unknown', usage: obj.message.usage, ts: obj.timestamp || lastAt };
    resolveAndStore(byId, alias, obj, uniqueCounter, entry);
  }

  return { byId, firstAt, lastAt };
}

// ─────────────────────────────────────────────────────────────────────────────
// fsImpl — real node:fs by default; pass a wrapping object in tests.
// ─────────────────────────────────────────────────────────────────────────────

function realFs() {
  return {
    readdirSync: fs.readdirSync,
    statSync: fs.statSync,
    writeFileSync: fs.writeFileSync,
    createReadStream: fs.createReadStream,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the full census and returns a plain report object (no printing, no fs writes).
 * opts: { lead, tasks, marker, out } — see parseArgs. fsImpl defaults to real node:fs.
 */
export async function runCensus(opts, fsImpl = realFs()) {
  const lead = await censusLeadFile(opts.lead, { fsImpl, marker: opts.marker });

  let names = [];
  try {
    names = fsImpl.readdirSync(opts.tasks);
  } catch {
    names = [];
  }
  const files = names.filter((f) => f.endsWith('.output') || f.endsWith('.jsonl')).sort();

  const subFiles = [];
  for (const f of files) {
    const full = path.join(opts.tasks, f);
    let size = 1;
    try {
      size = fsImpl.statSync(full).size;
    } catch {
      size = 0;
    }
    if (size === 0) {
      subFiles.push({ file: f, byId: new Map() });
      continue;
    }
    const r = await censusSubFile(full, { fsImpl });
    subFiles.push({ file: f, byId: r.byId });
  }

  const subTotalsByModel = {};
  let subTotalTurns = 0;
  const perFile = [];
  for (const sf of subFiles) {
    const byModel = aggByModel(sf.byId);
    mergeAggInto(subTotalsByModel, byModel);
    subTotalTurns += sf.byId.size;
    perFile.push({ file: sf.file, turns: sf.byId.size, byModel });
  }

  const leadTotalByModel = aggByModel(lead.totalById);
  const leadWindowByModel = aggByModel(lead.windowById);

  // Combined split: the build-window lead cost (the only lead cost comparable to
  // subagents, which exist only during the build) plus every subagent's cost.
  const combined = {};
  mergeAggInto(combined, leadWindowByModel);
  mergeAggInto(combined, subTotalsByModel);

  let turnsPerHour = null;
  if (lead.windowStartAt && lead.lastAt) {
    const hours = (new Date(lead.lastAt) - new Date(lead.windowStartAt)) / 3600000;
    if (hours > 0) turnsPerHour = lead.windowById.size / hours;
  }

  return {
    lead: {
      totalTurns: lead.totalById.size,
      windowTurns: lead.windowById.size,
      totalByModel: leadTotalByModel,
      windowByModel: leadWindowByModel,
      windowStartAt: lead.windowStartAt,
      windowEndAt: lead.lastAt,
      turnsPerHour,
    },
    subagents: {
      fileCount: files.length,
      totalTurns: subTotalTurns,
      totalByModel: subTotalsByModel,
      perFile,
    },
    combined,
    marker: opts.marker || null,
    leadPath: opts.lead,
    tasksPath: opts.tasks,
  };
}

function tokenRow(model, a) {
  return `| ${model} | ${a.input_tokens} | ${a.cache_creation_input_tokens} | ${a.cache_read_input_tokens} | ${a.output_tokens} |`;
}

function sumAgg(a) {
  return a.input_tokens + a.cache_creation_input_tokens + a.cache_read_input_tokens;
}

export function formatText(report) {
  const md = [];
  md.push(`VERDICT: COUNTED ${report.lead.windowTurns} lead turns, ${report.subagents.fileCount} subagent files`);
  md.push('');
  md.push('# Build census');
  md.push('');
  md.push(`Lead: \`${path.basename(report.leadPath)}\` | Tasks dir: \`${report.tasksPath}\``);
  if (report.marker) md.push(`Window marker: given (not echoed)`);
  md.push('');
  md.push('## Lead transcript');
  md.push('');
  md.push(`- Total assistant turns, deduped (whole file): **${report.lead.totalTurns}**`);
  md.push(`- Window assistant turns, deduped: **${report.lead.windowTurns}**`);
  md.push(`- Window: ${report.lead.windowStartAt || '(none)'} .. ${report.lead.windowEndAt || '(none)'}`);
  md.push(`- Turns/hour in window: **${report.lead.turnsPerHour !== null ? report.lead.turnsPerHour.toFixed(2) : 'n/a'}**`);
  md.push('');
  md.push('### Lead tokens by model — whole file (deduped)');
  md.push('');
  md.push('| model | input | cache_creation | cache_read | output |');
  md.push('|---|---|---|---|---|');
  for (const m of Object.keys(report.lead.totalByModel).sort()) md.push(tokenRow(m, report.lead.totalByModel[m]));
  md.push('');
  md.push('### Lead tokens by model — window (deduped)');
  md.push('');
  md.push('| model | input | cache_creation | cache_read | output |');
  md.push('|---|---|---|---|---|');
  for (const m of Object.keys(report.lead.windowByModel).sort()) md.push(tokenRow(m, report.lead.windowByModel[m]));
  md.push('');
  md.push(`## Subagents (${report.subagents.fileCount} files, ${report.subagents.totalTurns} turns total, deduped)`);
  md.push('');
  md.push('| file | turns |');
  md.push('|---|---|');
  for (const f of report.subagents.perFile) md.push(`| ${f.file} | ${f.turns} |`);
  md.push('');
  md.push('### Subagent tokens by model — totals (deduped)');
  md.push('');
  md.push('| model | input | cache_creation | cache_read | output |');
  md.push('|---|---|---|---|---|');
  for (const m of Object.keys(report.subagents.totalByModel).sort()) md.push(tokenRow(m, report.subagents.totalByModel[m]));
  md.push('');
  md.push('## Combined split (lead window + subagents)');
  md.push('');
  md.push('| model | output_tokens | input+cache_creation+cache_read |');
  md.push('|---|---|---|');
  for (const m of Object.keys(report.combined).sort()) {
    md.push(`| ${m} | ${report.combined[m].output_tokens} | ${sumAgg(report.combined[m])} |`);
  }
  return md.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const opts = { lead: null, tasks: null, marker: null, out: null };
  const need = (flag) => {
    const v = argv[++i];
    if (!v) throw new Error(`${flag} needs a value`);
    return v;
  };
  let i;
  for (i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lead') opts.lead = need('--lead');
    else if (a === '--tasks') opts.tasks = need('--tasks');
    else if (a === '--marker') opts.marker = need('--marker');
    else if (a === '--out') opts.out = need('--out');
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!opts.lead) throw new Error('--lead <session.jsonl> is required');
  if (!opts.tasks) throw new Error('--tasks <dir> is required');
  return opts;
}

export async function main(argv = process.argv.slice(2), { fsImpl = realFs(), now = Date.now(), write = (s) => console.log(s) } = {}) {
  const opts = parseArgs(argv);
  const report = await runCensus(opts, fsImpl);
  // M1: a --marker that matches nothing in the lead file leaves the window empty, which
  // would otherwise print a confident VERDICT of 0 lead turns and a zeroed combined
  // split — the exact shape spec.md's "Done" comparison depends on. Loud failure instead
  // of a silent, plausible-looking zero. The marker text itself is never echoed.
  if (opts.marker && report.lead.windowStartAt === null) {
    throw new Error(`--marker text not found in ${path.basename(opts.lead)} (window would be empty)`);
  }
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
 * Only when RUN, never when imported — win32-safe (a bare `import.meta.url ===
 * file://${argv[1]}` check never matches on win32, since argv[1] is a backslash path).
 * Same shape as scripts/token-census.mjs's isMainModule.
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
      process.stderr.write(`build-census: ${String(err && err.message ? err.message : err)}\n`);
      process.exit(1);
    },
  );
}
