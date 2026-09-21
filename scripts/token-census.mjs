#!/usr/bin/env node
// token-census — read-only census of Claude Code transcript token usage under a projects
// directory (default `~/.claude/projects`). Consolidates the throwaway scripts in
// scratchpad/census-hooks (census.js, census_r2.js, aggregate.js, aggregate_r2.js, and the
// round 3/4 scripts) into one tool. The classification, model-family, tier and cost-unit
// definitions below are copied VERBATIM from those scripts so numbers stay comparable across
// runs and machines — do not "simplify" a regex or a formula here without checking it still
// matches the source.
//
// SECRECY, the load-bearing contract: this tool prints numbers, model family names, agent
// type names (truncated at 40 chars), project folder names and the five class labels only.
// It never prints message content, prompts, tool inputs, or env values. Message TEXT is read
// into memory only to run the classification regexes below (never stored on the report
// object, never logged, never included in --json output); tool_use inputs are never read at
// all. It opens nothing outside the given --projects-dir: every filesystem call in this file
// goes through the injected `fsImpl` and every path handed to it is built by joining
// `projectsDir` (or one of its own listed entries) — there is no other source of a path.
//
// node --test scripts/token-census.test.mjs

import fs, { realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// Classification — ported from scratchpad/census-hooks/census.js + census_r2/r3/r4.js.
// ─────────────────────────────────────────────────────────────────────────────

// Unambiguous structural markers for an incoming/outgoing cross-session or peer-note event
// (see census.js's own note on why these, not a bare <cross-session-message> tag alone, are
// the dominant real-world shape). Ungated: they fire regardless of turn-text length.
const PEER_WAKE_MARKERS_UNGATED = [
  '<cross-session-message',
  '[Cross-session',
  'Another Claude session sent a message',
  'Another Codex session sent a message',
  '<teammate-message',
  '<agent-message',
];
// Fuzzy markers, gated to turns under WAKE_LENGTH_GATE chars: ungated, they false-positive on
// a rules doc or report quoting the note format as documentation (census.js round 1 finding).
const NOTE_ENVELOPE_RE = /[\w.-]{1,40}\s*→\s*[\w.-]{1,40},[^[\]]{0,60}\[[^\]\n]{1,60}\]\s*(ASK|ACK|RESULT|BLOCKED|FYI)\s*:/;
const STOP_HOOK_RE = /(stop[ _-]?hook|"stopHookActive"\s*:\s*true|<stop-hook)/i;
const TASK_NOTIF_RE = /<task-notification/i;
const WAKE_LENGTH_GATE = 4000;

export const CLASS_ORDER = ['HUMAN', 'TASK_NOTIFICATION', 'PEER_WAKE', 'STOP_HOOK', 'OTHER'];
export const TIER_ORDER = ['top', 'mid', 'fast', 'other'];

/** Recursively pulls plain text out of an Anthropic message `content` field (string, or an
 * array of text/tool_result blocks). Used ONLY to feed classifyTurn(); the returned string is
 * never stored on any accumulator or report field — see the secrecy note at the top. */
export function extractTextFromContent(content, depth) {
  depth = depth || 0;
  if (depth > 4) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    let out = '';
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      if (typeof item.text === 'string') out += item.text + '\n';
      if (typeof item.content === 'string') out += item.content + '\n';
      else if (Array.isArray(item.content)) out += extractTextFromContent(item.content, depth + 1) + '\n';
    }
    return out;
  }
  return '';
}

/** A user-role message whose content is ONLY tool_result blocks is a turn continuation
 * (the harness feeding a tool's output back in), never a new turn. */
export function isToolResultOnly(content) {
  if (typeof content === 'string') return false;
  if (!Array.isArray(content)) return false;
  if (content.length === 0) return false;
  return content.every((item) => item && item.type === 'tool_result');
}

/** First-match classification: PEER_WAKE > STOP_HOOK > TASK_NOTIFICATION > null (caller
 * resolves null to HUMAN or OTHER). Returns null, never a default, so callers can tell "not
 * one of the three marker classes" apart from an explicit class. */
export function classifyTurn(text) {
  for (const m of PEER_WAKE_MARKERS_UNGATED) if (text.includes(m)) return 'PEER_WAKE';
  if (text.length < WAKE_LENGTH_GATE) {
    if (text.includes('📨')) return 'PEER_WAKE';
    if (NOTE_ENVELOPE_RE.test(text)) return 'PEER_WAKE';
    if (STOP_HOOK_RE.test(text)) return 'STOP_HOOK';
  }
  if (TASK_NOTIF_RE.test(text)) return 'TASK_NOTIFICATION';
  return null;
}

export function modelFamily(model) {
  if (!model) return 'other';
  const m = String(model).toLowerCase();
  if (m.includes('fable')) return 'fable';
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'other';
}

export function tierOf(fam) {
  if (fam === 'fable' || fam === 'opus') return 'top';
  if (fam === 'sonnet') return 'mid';
  if (fam === 'haiku') return 'fast';
  return 'other';
}

/** Cost unit = input x1 + cache_creation x1.25 + cache_read x0.1 + output x5 — a price-ratio
 * unit (not USD), pinned by the spec, unchanged since census_r2.js. */
export function costUnits(u) {
  return (u.input || 0) * 1 + (u.cache_creation || 0) * 1.25 + (u.cache_read || 0) * 0.1 + (u.output || 0) * 5;
}

function rawTokensOf(u) {
  return (u.input || 0) + (u.cache_creation || 0) + (u.cache_read || 0) + (u.output || 0);
}

function percentile(sortedArr, p) {
  if (!sortedArr.length) return null;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.ceil((p / 100) * sortedArr.length) - 1));
  return sortedArr[idx];
}

/** Same "lower-median on ties" convention as every prior round's percentile() — kept for
 * comparability, not a textbook median. */
export function median(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = arr.slice().sort((a, b) => a - b);
  return percentile(sorted, 50);
}

// ─────────────────────────────────────────────────────────────────────────────
// Time window
// ─────────────────────────────────────────────────────────────────────────────

export function resolveWindow(opts, nowMs = Date.now()) {
  if (opts.since) {
    const sinceMs = Date.parse(opts.since);
    if (!Number.isFinite(sinceMs)) throw new Error(`invalid --since value: ${opts.since}`);
    return { startMs: sinceMs, endMs: nowMs };
  }
  // --days 0 or negative is treated as "not given" and silently falls back to 7 (F8 nit).
  const days = Number.isFinite(opts.days) && opts.days > 0 ? opts.days : 7;
  return { startMs: nowMs - days * 24 * 60 * 60 * 1000, endMs: nowMs };
}

function inWindow(ts, window) {
  if (!ts) return false;
  // A timestamp with no zone offset is parsed as machine-local, not UTC — shifts the window
  // edge by the machine's UTC offset for that one line (F8 nit).
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return false;
  return ms >= window.startMs && ms <= window.endMs;
}

// ─────────────────────────────────────────────────────────────────────────────
// File discovery — main session files directly under a project folder, subagent transcripts
// at `<project>/<sessionId>/subagents/agent-*.jsonl` with a `.meta.json` sidecar (confirmed
// shape, census_r3.js/census_r4.js). Every path here is built from `projectsDir` and entries
// `fsImpl` itself just listed — nothing outside it is ever touched.
// ─────────────────────────────────────────────────────────────────────────────

export function discoverFiles(fsImpl, projectsDir) {
  const mainFiles = [];
  const subFiles = [];
  let projectEntries = [];
  try {
    projectEntries = fsImpl.readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return { mainFiles, subFiles };
  }
  for (const projEnt of projectEntries) {
    if (!projEnt.isDirectory()) continue;
    const projectFolder = projEnt.name;
    const projectDir = path.join(projectsDir, projectFolder);
    let entries = [];
    try {
      entries = fsImpl.readdirSync(projectDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.isFile() && ent.name.endsWith('.jsonl')) {
        mainFiles.push({ full: path.join(projectDir, ent.name), projectFolder });
      } else if (ent.isDirectory()) {
        const subDir = path.join(projectDir, ent.name, 'subagents');
        let subEntries = [];
        try {
          subEntries = fsImpl.readdirSync(subDir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const se of subEntries) {
          if (!se.isFile() || !/^agent-.*\.jsonl$/.test(se.name)) continue;
          subFiles.push({ full: path.join(subDir, se.name), projectFolder });
        }
      }
    }
  }
  return { mainFiles, subFiles };
}

// ─────────────────────────────────────────────────────────────────────────────
// Accumulator state
// ─────────────────────────────────────────────────────────────────────────────

function newClassBucket() {
  return { turns: 0, costUnits: 0, rawTokens: 0 };
}

// Cold-start bookkeeping lives in its own accumulator, scoped to top-tier turns only — see
// finalizeMainTurn (round-2 review F3).
function newColdBucket() {
  return { turns: 0, costUnits: 0, coldTurns: 0, coldCostUnits: 0 };
}

function newState() {
  const byClass = {};
  const coldStartTopTier = {};
  for (const cls of CLASS_ORDER) {
    byClass[cls] = newClassBucket();
    coldStartTopTier[cls] = newColdBucket();
  }
  return {
    sanity: { mainFiles: 0, subFiles: 0, malformedLines: 0, metaMissing: 0, fileErrors: 0, mainLinesSeen: 0, subLinesSeen: 0 },
    dedupe: { main: new Set(), sub: new Set() },
    byClass,
    coldStartTopTier,
    tier: { top: 0, mid: 0, fast: 0, other: 0 },
    scope: { main: { costUnits: 0, rawTokens: 0 }, sub: { costUnits: 0, rawTokens: 0 } },
    agentTypes: new Map(), // agentType -> { agentType, famCounts, files, apiResponses, costUnits, baselineArr, ctxSum, ctxCount }
    subHighCtx: { atOrAbove150k: 0, total: 0 }, // subagent cost units, per-response context >= 150k
  };
}

function finalizeMainTurn(turn, state) {
  if (!turn || turn.apiResponses.length === 0) return;
  const bucket = state.byClass[turn.cls] || (state.byClass[turn.cls] = newClassBucket());
  let cu = 0;
  let raw = 0;
  for (const r of turn.apiResponses) {
    cu += costUnits(r);
    raw += rawTokensOf(r);
  }
  bucket.turns += 1;
  bucket.costUnits += cu;
  bucket.rawTokens += raw;

  const first = turn.apiResponses[0];
  // census_r3.js gated cold-start to top-tier (fable/opus) turns only, using the family of the
  // turn's first (in-window) response — restored here (instead of just relabelling) so these
  // numbers are comparable to that reference table rather than a same-named, differently-scoped
  // metric (round-2 review F3: all-tier drifted 33.3% vs R3's 21.1% HUMAN cold-turn share).
  if (tierOf(first.fam) === 'top') {
    const coldBucket = state.coldStartTopTier[turn.cls] || (state.coldStartTopTier[turn.cls] = newColdBucket());
    coldBucket.turns += 1;
    coldBucket.costUnits += cu;
    const ctx0 = first.input + first.cache_creation + first.cache_read;
    // Cold start (census_r3.js definition): the turn's first (in-window) response paid to
    // rebuild more than half its own context from scratch, i.e. it landed on an expired cache.
    const cold = ctx0 > 0 && first.cache_creation / ctx0 > 0.5;
    if (cold) {
      coldBucket.coldTurns += 1;
      coldBucket.coldCostUnits += cu;
    }
  }
}

async function openLines(fsImpl, full) {
  const stream = fsImpl.createReadStream(full, { encoding: 'utf8' });
  return readline.createInterface({ input: stream, crlfDelay: Infinity });
}

async function scanMainFile(fsImpl, fileInfo, window, state) {
  const { full } = fileInfo;
  let rl;
  try {
    rl = await openLines(fsImpl, full);
  } catch {
    state.sanity.fileErrors += 1;
    return;
  }
  let currentTurn = null;
  const finalize = () => {
    finalizeMainTurn(currentTurn, state);
    currentTurn = null;
  };

  for await (const line of rl) {
    if (!line || !line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      state.sanity.malformedLines += 1;
      continue;
    }
    if (obj.type !== 'user' && obj.type !== 'assistant') continue;
    if (!obj.message) continue;
    const role = obj.message.role;
    // A sidechain USER line belongs to a subagent's own inline turn logged in the same file
    // (rare) — never a main-chain turn boundary.
    if (role === 'user' && obj.isSidechain) continue;

    if (role === 'user') {
      const content = obj.message.content;
      if (!isToolResultOnly(content)) {
        finalize();
        const text = extractTextFromContent(content); // classification only, never stored
        let cls = classifyTurn(text);
        if (!cls) cls = obj.isMeta === true || text.trim().length === 0 ? 'OTHER' : 'HUMAN';
        currentTurn = { cls, apiResponses: [] };
      }
      continue;
    }

    // role === 'assistant'
    if (obj.isSidechain) continue; // inline subagent sub-turn: out of main-chain scope
    const msg = obj.message;
    const usage = msg.usage;
    if (!usage) continue;
    const respId = msg.id || obj.requestId || (obj.uuid ? `uuid:${obj.uuid}` : null);
    const dedupKey = respId || `noid:${full}:${state.sanity.mainLinesSeen++}`;
    if (state.dedupe.main.has(dedupKey)) continue;
    state.dedupe.main.add(dedupKey);

    if (!inWindow(obj.timestamp, window)) continue;

    const fam = modelFamily(msg.model);
    const rec = {
      input: usage.input_tokens || 0,
      cache_creation: usage.cache_creation_input_tokens || 0,
      cache_read: usage.cache_read_input_tokens || 0,
      output: usage.output_tokens || 0,
      fam, // carried per-response so finalizeMainTurn can gate cold-start to top-tier turns (F3)
    };
    const cu = costUnits(rec);

    state.tier[tierOf(fam)] += cu;
    state.scope.main.costUnits += cu;
    state.scope.main.rawTokens += rawTokensOf(rec);

    if (currentTurn) currentTurn.apiResponses.push(rec);
  }
  finalize();
}

async function scanSubagentFile(fsImpl, fileInfo, window, state) {
  const { full } = fileInfo;
  const metaPath = full.replace(/\.jsonl$/, '.meta.json');
  let agentType = null;
  try {
    const rawMeta = fsImpl.readFileSync(metaPath, 'utf8');
    const meta = JSON.parse(rawMeta);
    if (typeof meta.agentType === 'string' && meta.agentType) agentType = meta.agentType;
  } catch {
    // no sidecar, or unreadable/malformed — falls through to UNATTRIBUTED below.
  }
  if (!agentType) {
    state.sanity.metaMissing += 1;
    agentType = 'UNATTRIBUTED';
  }

  let rl;
  try {
    rl = await openLines(fsImpl, full);
  } catch {
    state.sanity.fileErrors += 1;
    return;
  }

  let respCount = 0;
  let costTotal = 0;
  let ctxSum = 0;
  let ctxCount = 0;
  let firstCtx = null;
  const famCounts = {};

  for await (const line of rl) {
    if (!line || !line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      state.sanity.malformedLines += 1;
      continue;
    }
    if (obj.type !== 'assistant' || !obj.message) continue;
    const msg = obj.message;
    const usage = msg.usage;
    if (!usage) continue;
    const respId = msg.id || obj.requestId || (obj.uuid ? `uuid:${obj.uuid}` : null);
    const dedupKey = respId || `nosub:${full}:${state.sanity.subLinesSeen++}`;
    if (state.dedupe.sub.has(dedupKey)) continue;
    state.dedupe.sub.add(dedupKey);

    if (!inWindow(obj.timestamp, window)) continue;

    const rec = {
      input: usage.input_tokens || 0,
      cache_creation: usage.cache_creation_input_tokens || 0,
      cache_read: usage.cache_read_input_tokens || 0,
      output: usage.output_tokens || 0,
    };
    const fam = modelFamily(msg.model);
    const cu = costUnits(rec);
    const ctxNow = rec.input + rec.cache_creation + rec.cache_read;

    respCount += 1;
    costTotal += cu;
    ctxSum += ctxNow;
    ctxCount += 1;
    famCounts[fam] = (famCounts[fam] || 0) + 1;
    // opening/baseline context: first IN-WINDOW response, not the file's true first response
    // (census_r4.js always used the file's first) — identical on the corpora measured so far
    // since subagent files are short-lived, but a --since that cuts into a long file would
    // make this differ from that reference (F7 nit).
    if (firstCtx == null) firstCtx = ctxNow;

    state.tier[tierOf(fam)] += cu;
    state.scope.sub.costUnits += cu;
    state.scope.sub.rawTokens += rawTokensOf(rec);
    state.subHighCtx.total += cu;
    if (ctxNow >= 150000) state.subHighCtx.atOrAbove150k += cu;
  }

  if (respCount === 0) return;

  let agg = state.agentTypes.get(agentType);
  if (!agg) {
    agg = { agentType, famCounts: {}, files: 0, apiResponses: 0, costUnits: 0, baselineArr: [], ctxSum: 0, ctxCount: 0 };
    state.agentTypes.set(agentType, agg);
  }
  agg.files += 1;
  agg.apiResponses += respCount;
  agg.costUnits += costTotal;
  agg.baselineArr.push(firstCtx);
  agg.ctxSum += ctxSum;
  agg.ctxCount += ctxCount;
  for (const [f, c] of Object.entries(famCounts)) agg.famCounts[f] = (agg.famCounts[f] || 0) + c;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report assembly
// ─────────────────────────────────────────────────────────────────────────────

function round(n) {
  return Math.round(n || 0);
}

/** Secrecy: agent type is the one label here that is not a closed set — it comes off a
 * sidecar on disk, which an orchestrator writes but this tool must not blindly trust. Keep
 * printable ASCII only, so a newline or an ANSI escape cannot forge a second table row or
 * move the cursor, then cap the length. (Round-2 review F1.) */
function safeLabel(s) {
  return String(s == null ? '' : s).replace(/[^\x20-\x7E]/g, '.').slice(0, 40);
}

function buildReport(state, opts, window, projectsDir) {
  const byClass = CLASS_ORDER.map((cls) => {
    const b = state.byClass[cls];
    return { cls, turns: b.turns, costUnits: round(b.costUnits), rawTokens: round(b.rawTokens) };
  });

  const tierTotal = Object.values(state.tier).reduce((s, v) => s + v, 0);
  const byTier = TIER_ORDER.map((t) => ({
    tier: t,
    costUnits: round(state.tier[t]),
    share: tierTotal ? +(state.tier[t] / tierTotal).toFixed(4) : 0,
  }));

  const mainVsSub = {
    main: { costUnits: round(state.scope.main.costUnits), rawTokens: round(state.scope.main.rawTokens) },
    sub: { costUnits: round(state.scope.sub.costUnits), rawTokens: round(state.scope.sub.rawTokens) },
  };

  const topN = Number.isFinite(opts.top) && opts.top > 0 ? opts.top : 12;
  const topAgentTypes = [...state.agentTypes.values()]
    .map((a) => {
      let domFam = 'other';
      let domCount = -1;
      for (const [f, c] of Object.entries(a.famCounts)) if (c > domCount) { domFam = f; domCount = c; }
      return {
        agentType: safeLabel(a.agentType), // secrecy: sanitised, then capped at 40 chars
        family: domFam,
        files: a.files,
        apiResponses: a.apiResponses,
        costUnits: round(a.costUnits),
        medianOpeningCtx: median(a.baselineArr),
        meanCtx: a.ctxCount ? Math.round(a.ctxSum / a.ctxCount) : null,
      };
    })
    .sort((x, y) => y.costUnits - x.costUnits)
    .slice(0, topN);

  const subagentHighContextShare = state.subHighCtx.total
    ? +(state.subHighCtx.atOrAbove150k / state.subHighCtx.total).toFixed(4)
    : null;

  // TOP-TIER TURNS ONLY (fable/opus) — see finalizeMainTurn (F3); this scope, not
  // state.byClass, is what makes these numbers comparable to census_r3.js's table.
  const coldStartByClass = CLASS_ORDER.map((cls) => {
    const b = state.coldStartTopTier[cls];
    return {
      cls,
      turns: b.turns,
      coldTurns: b.coldTurns,
      coldTurnShare: b.turns ? +(b.coldTurns / b.turns).toFixed(4) : null,
      costUnits: round(b.costUnits),
      coldCostUnits: round(b.coldCostUnits),
      coldCostShare: b.costUnits ? +(b.coldCostUnits / b.costUnits).toFixed(4) : null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    projectsDir,
    window: { startISO: new Date(window.startMs).toISOString(), endISO: new Date(window.endMs).toISOString() },
    sanity: { ...state.sanity },
    costUnitFormula: 'input x1 + cache_creation x1.25 + cache_read x0.1 + output x5 (price-ratio unit, not USD)',
    byClass,
    byTier,
    mainVsSub,
    topAgentTypes,
    subagentHighContextShare,
    coldStartByClass,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

function realFs() {
  return {
    readdirSync: fs.readdirSync,
    statSync: fs.statSync,
    existsSync: fs.existsSync,
    readFileSync: fs.readFileSync,
    createReadStream: fs.createReadStream,
  };
}

/**
 * Runs the census and returns the report object (no printing). `opts.projectsDir` is
 * required in tests (a fixture directory); in real use the CLI fills it in from
 * `opts.homeDir` (or `os.homedir()`) when omitted. `fsImpl` defaults to real `node:fs`
 * functions; pass a wrapping object to observe/limit what paths get opened.
 */
export async function runCensus(opts = {}, fsImpl = realFs(), now = Date.now()) {
  const projectsDir = opts.projectsDir || path.join(opts.homeDir || os.homedir(), '.claude', 'projects');
  const window = resolveWindow(opts, now);
  const state = newState();

  const { mainFiles, subFiles } = discoverFiles(fsImpl, projectsDir);
  state.sanity.mainFiles = mainFiles.length;
  state.sanity.subFiles = subFiles.length;

  // Batch rule: the whole file list goes in flight at once (local disk, no rate wall).
  await Promise.all(mainFiles.map((f) => scanMainFile(fsImpl, f, window, state).catch(() => { state.sanity.fileErrors += 1; })));
  await Promise.all(subFiles.map((f) => scanSubagentFile(fsImpl, f, window, state).catch(() => { state.sanity.fileErrors += 1; })));

  return buildReport(state, opts, window, projectsDir);
}

// ─────────────────────────────────────────────────────────────────────────────
// Text formatting
// ─────────────────────────────────────────────────────────────────────────────

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}
function padNum(n, width) {
  const s = (n ?? 0).toLocaleString('en-US');
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}
function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}
function pctOrNa(x) {
  return x == null ? 'n/a' : pct(x);
}

export function formatText(report) {
  const lines = [];
  lines.push(`token-census: ${report.window.startISO} .. ${report.window.endISO}`);
  lines.push(`projects dir: ${report.projectsDir}`);
  lines.push(
    `files: ${report.sanity.mainFiles} main, ${report.sanity.subFiles} subagent `
      + `(meta missing ${report.sanity.metaMissing}) | malformed lines: ${report.sanity.malformedLines} `
      + `| file errors: ${report.sanity.fileErrors}`,
  );
  lines.push('');
  lines.push(`cost unit = ${report.costUnitFormula}`);
  lines.push('');
  lines.push('By trigger class (main-chain turns):');
  lines.push(`  ${pad('class', 20)} ${pad('turns', 7)} ${pad('cost units', 13)} ${pad('raw tokens', 14)}`);
  for (const r of report.byClass) {
    lines.push(`  ${pad(r.cls, 20)} ${padNum(r.turns, 7)} ${padNum(r.costUnits, 13)} ${padNum(r.rawTokens, 14)}`);
  }
  lines.push('');
  lines.push('By tier (main + subagent combined):');
  lines.push(`  ${pad('tier', 8)} ${pad('cost units', 13)} ${pad('share', 7)}`);
  for (const r of report.byTier) {
    lines.push(`  ${pad(r.tier, 8)} ${padNum(r.costUnits, 13)} ${pad(pct(r.share), 7)}`);
  }
  lines.push('');
  lines.push('Main vs subagent:');
  lines.push(`  main       cost units ${round(report.mainVsSub.main.costUnits)}   raw tokens ${round(report.mainVsSub.main.rawTokens)}`);
  lines.push(`  subagent   cost units ${round(report.mainVsSub.sub.costUnits)}   raw tokens ${round(report.mainVsSub.sub.rawTokens)}`);
  lines.push('');
  lines.push(`Top agent types (subagent, by cost units, top ${report.topAgentTypes.length}):`);
  lines.push(`  ${pad('agent type', 40)} ${pad('family', 7)} ${pad('files', 6)} ${pad('calls', 7)} ${pad('cost units', 12)} ${pad('opening ctx', 12)} ${pad('mean ctx', 10)}`);
  for (const r of report.topAgentTypes) {
    lines.push(
      `  ${pad(r.agentType, 40)} ${pad(r.family, 7)} ${padNum(r.files, 6)} ${padNum(r.apiResponses, 7)} `
        + `${padNum(r.costUnits, 12)} ${padNum(r.medianOpeningCtx ?? 0, 12)} ${padNum(r.meanCtx ?? 0, 10)}`,
    );
  }
  lines.push('');
  lines.push(`Subagent cost at or above 150k context, per API response: ${pctOrNa(report.subagentHighContextShare)}`);
  lines.push('');
  lines.push('Cold-start share of cost, by class, TOP-TIER TURNS ONLY (first in-window response, cache_creation > 50% of its own context):');
  lines.push(`  ${pad('class', 20)} ${pad('turns', 6)} ${pad('cold', 6)} ${pad('cold turn%', 11)} ${pad('cost units', 12)} ${pad('cold cost units', 16)} ${pad('cold cost%', 11)}`);
  for (const r of report.coldStartByClass) {
    lines.push(
      `  ${pad(r.cls, 20)} ${padNum(r.turns, 6)} ${padNum(r.coldTurns, 6)} ${pad(pctOrNa(r.coldTurnShare), 11)} `
        + `${padNum(r.costUnits, 12)} ${padNum(r.coldCostUnits, 16)} ${pad(pctOrNa(r.coldCostShare), 11)}`,
    );
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const opts = { days: 7, since: null, projectsDir: null, json: false, top: 12 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--days') opts.days = Number(argv[++i]);
    else if (a === '--since') opts.since = argv[++i];
    else if (a === '--projects-dir') {
      opts.projectsDir = argv[++i];
      // secrecy/containment: a missing or empty value here must not silently fall through
      // to the real ~/.claude/projects default below (round-2 review F2).
      if (!opts.projectsDir) throw new Error('--projects-dir needs a directory');
    } else if (a === '--json') opts.json = true;
    else if (a === '--top') opts.top = Number(argv[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

export async function main(argv = process.argv.slice(2), { fsImpl = realFs(), homeDir = os.homedir(), now = Date.now(), write = (s) => console.log(s) } = {}) {
  const opts = parseArgs(argv);
  opts.homeDir = homeDir;
  const report = await runCensus(opts, fsImpl, now);
  write(opts.json ? JSON.stringify(report, null, 2) : formatText(report));
  return 0;
}

/**
 * Only when RUN, never when imported — same win32-safe check as scripts/janitor.mjs (a plain
 * `import.meta.url === file://${argv[1]}` check never matches on win32: argv[1] is a
 * backslash path).
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
      process.stderr.write(`token-census: ${String(err && err.message ? err.message : err)}\n`);
      process.exit(1);
    },
  );
}
