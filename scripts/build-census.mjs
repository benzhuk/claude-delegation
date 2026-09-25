#!/usr/bin/env node
// build-census — turn/token census over one lead transcript (a Claude Code session
// .jsonl) plus its subagent .output/.jsonl transcripts, for measuring one loop-build run
// against another (spec.md L-C9, and the census-complete spec's Territory C1).
//
// THE DE-DUPLICATION FIX, the whole point of this file: Claude Code re-emits the SAME
// logical assistant turn as several JSONL lines — one per `apiBlockIndex` — all sharing
// one `requestId` (and one `message.id`), each repeating the same `input_tokens`/
// `cache_read_input_tokens` while `output_tokens` grows across the lines; only the LAST
// line for a given id holds the true final counts. Naive per-line summing over-counted
// the dominant token category by ~1.8x on a real 813-line transcript. Every id is kept in
// a bounded `Map<id, entry>`, OVERWRITTEN on every repeat (last-line-wins) — this is a map
// keyed by id, not a buffer of raw lines, so streaming stays bounded. A "turn" (in the
// `totalTurns`/`windowTurns` sense) is one map entry (`Map.size`), counted once the stream
// ends, never a per-line increment.
//
// LEADTURNS, a SEPARATE, conversational notion of "turn" (census-complete spec, item 3):
// the number of maximal runs of consecutive assistant messages, where a run is broken only
// by a user message that is NOT a pure tool_result (a task notification is a plain user
// message and DOES break a run; a tool_result-only user message does not). This is counted
// over raw lines in file order, independently of the requestId/message.id de-dup above —
// one API request split across 3 JSONL lines is still just part of ONE run, whether or not
// it also happens to be one deduped "turn" by the de-dup definition. See docs/census.md
// for the pinned one-sentence definition.
//
// ROLES (item 2): a subagent file's role comes from the Workflow's own `journal.jsonl`
// (written next to that file, one line per agent, `{"agentId":"<id>","label":"<label>"}`,
// `<id>` being the file's basename with a leading `agent-` and its extension stripped) when
// that journal has a matching entry — role is the label's segment before its first `:`
// (`build:T1:r2` -> `build`, `seam` -> `seam`). Failing that, `--role-map <json>` maps the
// file's bare basename (`agent-<id>`, extension stripped) directly to a role string,
// verbatim. Failing both, the file is `unassigned` — never silently folded into another
// role.
//
// MULTI-DIR / DEFAULT GLOB (item 1): `--tasks <dir>` may be repeated; every file across
// every given dir is counted, each exactly once (de-duped by resolved real path, so the
// same dir given twice, or a symlink aliasing another counted file, never double-counts).
// When `--lead <session.jsonl>` is given, the script ALSO globs
// `<dirname of lead>/<lead session id>/subagents/agent-*.jsonl` — the lead's own Task-tool
// subagents — without needing a flag. Unlike an explicitly-given `--tasks` dir (unreadable
// is an error, never a silent zero), a MISSING default dir is normal (most lead sessions
// spawn no subagents) and contributes zero files without complaint.
//
// SECRECY, load-bearing: this tool never reads or prints `message.content` (or any other
// transcript text) except to test membership of `--marker` inside a parsed line via
// `containsMarkerDeep`, which returns only a boolean and never the matched string. Output
// is numbers, model names, role names, and file paths only.
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

function addAggInto(target, a) {
  target.input_tokens += a.input_tokens;
  target.cache_creation_input_tokens += a.cache_creation_input_tokens;
  target.cache_read_input_tokens += a.cache_read_input_tokens;
  target.output_tokens += a.output_tokens;
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
    addAggInto(target[model], a);
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
// leadTurns — a maximal run of consecutive assistant messages, broken by any user
// message that is NOT purely tool_result content (a task notification is plain-content
// and DOES break a run; a tool_result-only user message does not).
// ─────────────────────────────────────────────────────────────────────────────

function isToolResultOnlyUser(obj) {
  const content = obj.message && obj.message.content;
  if (!Array.isArray(content)) return false; // a string/notification body is a real user turn
  return content.length > 0 && content.every((c) => c && c.type === 'tool_result');
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
 *     given), windowStartAt, firstAt, lastAt, leadTurns }
 * De-dup ("last line wins") is applied independently to the total map and the window map,
 * since a request can straddle the marker boundary (spec.md L-C9).
 * `leadTurns` (census-complete spec item 3) is counted over the SAME single pass, over raw
 * lines, independently of the id de-dup above — see docs/census.md for its definition.
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

  let leadTurns = 0;
  let inRun = false;

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

    if (obj.type === 'assistant') {
      if (!inRun) {
        leadTurns += 1;
        inRun = true;
      }
    } else if (obj.type === 'user') {
      if (!isToolResultOnlyUser(obj)) inRun = false;
      // a tool_result-only user line is transparent: the run continues through it.
    }

    if (obj.type !== 'assistant' || !obj.message || !obj.message.usage) continue;

    const entry = { model: obj.message.model || 'unknown', usage: obj.message.usage, ts: obj.timestamp || lastAt };
    resolveAndStore(totalById, totalAlias, obj, uniqueCounter, entry);
    if (marker && windowStarted) resolveAndStore(windowById, windowAlias, obj, uniqueCounter, entry);
  }

  if (!marker) windowStartAt = firstAt;

  return { totalById, windowById, markerFound: windowStarted, windowStartAt, firstAt, lastAt, leadTurns };
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
// fsImpl — real node:fs by default; pass a wrapping object in tests. readFileSync and
// realpathSync are used only for journal.jsonl reads and cross-dir real-path de-dup —
// every code path that touches them tolerates a mock fsImpl that omits them (falls back
// to "no journal" / path.resolve respectively), so existing simpler mocks never break.
// ─────────────────────────────────────────────────────────────────────────────

function realFs() {
  return {
    readdirSync: fs.readdirSync,
    statSync: fs.statSync,
    writeFileSync: fs.writeFileSync,
    createReadStream: fs.createReadStream,
    readFileSync: fs.readFileSync,
    realpathSync: fs.realpathSync,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-dir task file collection, real-path de-dup, and role resolution.
// ─────────────────────────────────────────────────────────────────────────────

function matchesPattern(f, pattern) {
  if (pattern === 'agent') return /^agent-.*\.jsonl$/.test(f);
  // journal.jsonl is metadata ABOUT the agent files in its dir, not itself an agent
  // transcript — it must never be counted as one of the files censused.
  if (f === 'journal.jsonl') return false;
  return f.endsWith('.output') || f.endsWith('.jsonl');
}

// Explicit --tasks dirs first (CLI order), then the default subagents glob (if a --lead
// was given) last, tagged isDefault so collectTaskFiles knows a missing one is not an
// error.
function buildDirSpecs(opts) {
  const specs = [];
  for (const d of opts.tasksDirs || []) specs.push({ dir: d, isDefault: false, pattern: 'wide' });
  if (opts.lead) {
    const leadSessionId = path.basename(opts.lead).replace(/\.jsonl$/i, '');
    const defaultDir = path.join(path.dirname(opts.lead), leadSessionId, 'subagents');
    specs.push({ dir: defaultDir, isDefault: true, pattern: 'agent' });
  }
  return specs;
}

function collectTaskFiles(dirSpecs, fsImpl) {
  const collected = [];
  for (const spec of dirSpecs) {
    let names;
    try {
      names = fsImpl.readdirSync(spec.dir);
    } catch {
      // An unreadable/missing EXPLICIT --tasks dir is not "no subagents ran" — reporting 0
      // files at exit 0 would silently drop a whole source the caller asked for by name.
      // The DEFAULT subagents dir is different: most lead sessions spawn no subagents at
      // all, so its absence is the common, legitimate case, not an error.
      if (spec.isDefault) continue;
      throw new Error(`--tasks directory not readable: ${spec.dir}`);
    }
    for (const filename of names.filter((f) => matchesPattern(f, spec.pattern))) {
      collected.push({ dir: spec.dir, filename, fullPath: path.join(spec.dir, filename) });
    }
  }
  return collected;
}

// De-dup by resolved real path so the same dir given twice, a file reachable through two
// --tasks dirs, or a symlink aliasing an already-counted file, is never counted twice.
// Falls back to path.resolve (no symlink resolution) when fsImpl has no realpathSync.
function dedupeByRealPath(collected, fsImpl) {
  const seen = new Set();
  const out = [];
  for (const item of collected) {
    let real;
    try {
      real = typeof fsImpl.realpathSync === 'function' ? fsImpl.realpathSync(item.fullPath) : path.resolve(item.fullPath);
    } catch {
      real = path.resolve(item.fullPath);
    }
    const key = process.platform === 'win32' ? real.toLowerCase() : real;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// journal.jsonl lives next to the agent files it labels: one line per agent,
// `{"agentId":"<id>","label":"<label>"}`, `<id>` being that agent's file basename with a
// leading `agent-` and its extension stripped. Returns null (never throws) when the dir
// has no journal, an unreadable one, or fsImpl has no readFileSync — all three mean "no
// journal labels available here", not an error.
function readJournal(dir, fsImpl) {
  if (typeof fsImpl.readFileSync !== 'function') return null;
  let text;
  try {
    text = fsImpl.readFileSync(path.join(dir, 'journal.jsonl'), 'utf8');
  } catch {
    return null;
  }
  const map = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj && obj.agentId != null && obj.label != null) map.set(String(obj.agentId), String(obj.label));
  }
  return map;
}

function resolveRole(agentKey, journalMap, roleMap) {
  const bareId = agentKey.replace(/^agent-/, '');
  if (journalMap && journalMap.has(bareId)) {
    return journalMap.get(bareId).split(':')[0];
  }
  if (roleMap && Object.prototype.hasOwnProperty.call(roleMap, agentKey)) {
    return roleMap[agentKey];
  }
  return 'unassigned';
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the full census and returns a plain report object (no printing, no fs writes).
 * opts: { lead, tasksDirs, marker, out, json, roleMap } — see parseArgs. fsImpl defaults
 * to real node:fs.
 */
export async function runCensus(opts, fsImpl = realFs()) {
  const lead = await censusLeadFile(opts.lead, { fsImpl, marker: opts.marker });

  const dirSpecs = buildDirSpecs(opts);
  const defaultSpec = dirSpecs.find((s) => s.isDefault) || null;
  const rawFiles = collectTaskFiles(dirSpecs, fsImpl);
  const orderedFiles = dedupeByRealPath(rawFiles, fsImpl).sort((a, b) => a.fullPath.localeCompare(b.fullPath));

  const journalCache = new Map();
  const journalFor = (dir) => {
    if (!journalCache.has(dir)) journalCache.set(dir, readJournal(dir, fsImpl));
    return journalCache.get(dir);
  };

  const subFiles = [];
  for (const f of orderedFiles) {
    let size = 1;
    let unreadable = false;
    try {
      size = fsImpl.statSync(f.fullPath).size;
    } catch {
      // A file that vanished or became unreadable between readdir and stat is not the
      // same as a genuinely zero-byte one — reporting it as 0 turns would misattribute
      // an unknown count as a real zero. Flagged through as unreadable instead, so
      // formatText can render it `n/a`, the same idiom this file already uses for
      // turnsPerHour and the latency sum whenever a real count can't be produced.
      unreadable = true;
      size = 0;
    }
    const agentKey = f.filename.replace(/\.(jsonl|output)$/i, '');
    const role = resolveRole(agentKey, journalFor(f.dir), opts.roleMap);
    if (size === 0) {
      subFiles.push({ file: f.fullPath, role, byId: new Map(), unreadable });
      continue;
    }
    const r = await censusSubFile(f.fullPath, { fsImpl });
    subFiles.push({ file: f.fullPath, role, byId: r.byId });
  }

  const subTotalsByModel = {};
  const subTotalsByRole = {};
  const roleFileCounts = {};
  let subTotalTurns = 0;
  let unreadableCount = 0;
  const perFile = [];
  for (const sf of subFiles) {
    const byModel = aggByModel(sf.byId);
    mergeAggInto(subTotalsByModel, byModel);
    if (!subTotalsByRole[sf.role]) subTotalsByRole[sf.role] = newAgg();
    for (const a of Object.values(byModel)) addAggInto(subTotalsByRole[sf.role], a);
    roleFileCounts[sf.role] = (roleFileCounts[sf.role] || 0) + 1;
    subTotalTurns += sf.byId.size;
    if (sf.unreadable) unreadableCount += 1;
    perFile.push({ file: sf.file, role: sf.role, turns: sf.unreadable ? null : sf.byId.size, byModel });
  }

  const leadTotalByModel = aggByModel(lead.totalById);
  const leadWindowByModel = aggByModel(lead.windowById);

  // Combined split: the build-window lead cost (the only lead cost comparable to
  // subagents, which exist only during the build) plus every subagent's cost.
  const combined = {};
  mergeAggInto(combined, leadWindowByModel);
  mergeAggInto(combined, subTotalsByModel);

  let turnsPerHour = null;
  let wallClockHours = null;
  if (lead.windowStartAt && lead.lastAt) {
    const hours = (new Date(lead.lastAt) - new Date(lead.windowStartAt)) / 3600000;
    if (hours > 0) {
      turnsPerHour = lead.windowById.size / hours;
      wallClockHours = hours;
    }
  }

  return {
    lead: {
      totalTurns: lead.totalById.size,
      windowTurns: lead.windowById.size,
      leadTurns: lead.leadTurns,
      totalByModel: leadTotalByModel,
      windowByModel: leadWindowByModel,
      markerFound: lead.markerFound,
      windowStartAt: lead.windowStartAt,
      windowEndAt: lead.lastAt,
      turnsPerHour,
      wallClockHours,
    },
    subagents: {
      fileCount: orderedFiles.length,
      unreadable: unreadableCount,
      totalTurns: subTotalTurns,
      totalByModel: subTotalsByModel,
      totalByRole: subTotalsByRole,
      roleFileCounts,
      perFile,
    },
    combined,
    marker: opts.marker || null,
    leadPath: opts.lead,
    tasksPaths: [...(opts.tasksDirs || [])],
    defaultSubagentsDir: defaultSpec ? defaultSpec.dir : null,
  };
}

function tokenRow(label, a) {
  return `| ${label} | ${a.input_tokens} | ${a.cache_creation_input_tokens} | ${a.cache_read_input_tokens} | ${a.output_tokens} |`;
}

function sumAgg(a) {
  return a.input_tokens + a.cache_creation_input_tokens + a.cache_read_input_tokens;
}

function totalTokens(a) {
  return sumAgg(a) + a.output_tokens;
}

export function formatText(report) {
  const md = [];
  const unread = report.subagents.unreadable || 0;
  md.push(`VERDICT: COUNTED ${report.lead.windowTurns} lead turns, ${report.subagents.fileCount} subagent files${unread ? ` (${unread} UNREADABLE — subagent totals below are incomplete)` : ''}`);
  md.push('');
  // The header line other tools (e.g. work-record.mjs's `accept --census`) recognise a
  // build-census report by: this exact literal line, always present, always verbatim.
  // See docs/census.md, "Header line".
  md.push('# Build census');
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push(`- leadTurns: ${report.lead.leadTurns}`);
  md.push(`- wallClockHours: ${report.lead.wallClockHours !== null ? report.lead.wallClockHours.toFixed(2) : 'n/a'}`);
  const modelLine = Object.keys(report.combined).sort().map((m) => `${m}=${totalTokens(report.combined[m])}`).join(', ') || '(none)';
  md.push(`- by-model: ${modelLine}`);
  const roleLine = Object.keys(report.subagents.totalByRole).sort().map((r) => `${r}=${totalTokens(report.subagents.totalByRole[r])}`).join(', ') || '(none)';
  md.push(`- by-role: ${roleLine}`);
  md.push('');
  const tasksLine = report.tasksPaths.length ? report.tasksPaths.map((p) => `\`${p}\``).join(', ') : '(none)';
  md.push(`Lead: \`${path.basename(report.leadPath)}\` | Tasks dirs: ${tasksLine}${report.defaultSubagentsDir ? ` | Default subagents dir: \`${report.defaultSubagentsDir}\`` : ''}`);
  if (report.marker) md.push(`Window marker: given (not echoed)`);
  md.push('');
  md.push('## Lead transcript');
  md.push('');
  md.push(`- Total assistant turns, deduped (whole file): **${report.lead.totalTurns}**`);
  md.push(`- Window assistant turns, deduped: **${report.lead.windowTurns}**`);
  md.push(`- leadTurns (conversational runs — see docs/census.md): **${report.lead.leadTurns}**`);
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
  md.push(`## Subagents (${report.subagents.fileCount} files${unread ? `, ${unread} unreadable` : ''}, ${report.subagents.totalTurns} turns total, deduped)`);
  if (unread) md.push(`\n_Incomplete: ${unread} subagent file(s) could not be read; their tokens are absent from this table and from the combined split below._`);
  md.push('');
  const roleCountsLine = Object.keys(report.subagents.roleFileCounts).sort().map((r) => `${r}=${report.subagents.roleFileCounts[r]}`).join(', ') || '(none)';
  md.push(`Roles: ${roleCountsLine}`);
  md.push('');
  md.push('| file | role | turns |');
  md.push('|---|---|---|');
  for (const f of report.subagents.perFile) md.push(`| ${f.file} | ${f.role} | ${f.turns === null ? 'n/a' : f.turns} |`);
  md.push('');
  md.push('### Subagent tokens by model — totals (deduped)');
  md.push('');
  md.push('| model | input | cache_creation | cache_read | output |');
  md.push('|---|---|---|---|---|');
  for (const m of Object.keys(report.subagents.totalByModel).sort()) md.push(tokenRow(m, report.subagents.totalByModel[m]));
  md.push('');
  md.push('### Subagent tokens by role — totals (deduped)');
  md.push('');
  md.push('| role | input | cache_creation | cache_read | output |');
  md.push('|---|---|---|---|---|');
  for (const r of Object.keys(report.subagents.totalByRole).sort()) md.push(tokenRow(r, report.subagents.totalByRole[r]));
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

// Deterministic JSON: object keys sorted recursively so two runs over the same input are
// byte-identical regardless of any incidental insertion-order difference (census-complete
// spec item 5).
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k]);
    return out;
  }
  return value;
}

export function formatJson(report) {
  return JSON.stringify(sortKeysDeep(report), null, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const opts = { lead: null, tasksDirs: [], marker: null, out: null, json: null, roleMap: null };
  const need = (flag) => {
    const v = argv[++i];
    if (!v) throw new Error(`${flag} needs a value`);
    return v;
  };
  let i;
  for (i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lead') opts.lead = need('--lead');
    else if (a === '--tasks') opts.tasksDirs.push(need('--tasks'));
    else if (a === '--marker') opts.marker = need('--marker');
    else if (a === '--out') opts.out = need('--out');
    else if (a === '--json') opts.json = need('--json');
    else if (a === '--role-map') {
      const raw = need('--role-map');
      try {
        opts.roleMap = JSON.parse(raw);
      } catch {
        throw new Error(`--role-map is not valid JSON: ${raw}`);
      }
    } else throw new Error(`unknown argument: ${a}`);
  }
  if (!opts.lead) throw new Error('--lead <session.jsonl> is required');
  return opts;
}

export async function main(argv = process.argv.slice(2), { fsImpl = realFs(), now = Date.now(), write = (s) => console.log(s) } = {}) {
  const opts = parseArgs(argv);
  const report = await runCensus(opts, fsImpl);
  // M1: a --marker that matches nothing in the lead file leaves the window empty, which
  // would otherwise print a confident VERDICT of 0 lead turns and a zeroed combined
  // split — the exact shape spec.md's "Done" comparison depends on. Loud failure instead
  // of a silent, plausible-looking zero. The marker text itself is never echoed.
  if (opts.marker && !report.lead.markerFound) {
    throw new Error(`--marker text not found in ${path.basename(opts.lead)} (window would be empty)`);
  }
  const wrote = [];
  if (opts.json) {
    fsImpl.writeFileSync(opts.json, formatJson(report) + '\n');
    wrote.push(opts.json);
  }
  const text = formatText(report);
  if (opts.out) {
    fsImpl.writeFileSync(opts.out, text.endsWith('\n') ? text : `${text}\n`);
    wrote.push(opts.out);
  }
  if (wrote.length) {
    for (const p of wrote) write(`wrote: ${p}`);
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
