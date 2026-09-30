#!/usr/bin/env node
// four-read — prints the goal's four measures (docs/specs/2026-09-25-four-number-read.md,
// Territory R1) for one build. Every number prints a computed `value` or
// `unavailable (<reason>)` — never a guess. Parses the record's own fields itself (fields
// may not exist in work-record.mjs in this worktree yet) rather than importing it — see docs/census.md.
// node scripts/four-read.mjs --record <record.md> --census <census.json>
//   [--spec-census <json>] [--ledger docs/ledger] [--git <repo>] [--branch <ref>] [--lead-session <id>] [--lead-slug <slug>] [--out <path>] [--json <path>] [--accept-at <iso>]
// node --test scripts/four-read.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withoutRepoLocatingGitEnv } from '../skills/multi/scripts/transport.mjs';
// ── Record parsing (independent of scripts/work-record.mjs) ────────────────
function fieldRegex(label) {
  return new RegExp(`^[ \\t*+-]{0,20}${label}:\\**[ \\t]{0,20}(.+)$`, 'mi');
}
// -> {fields: {opened, base, artifact, 'lead-session', 'spec-session', 'spec-from'},
//     logs: [{at, status, owner, note}]}
export function parseRecordText(text) {
  const lines = text.split(/\r?\n/);
  const blankIdx = lines.findIndex((l) => l.trim() === '');
  const headerText = (blankIdx === -1 ? lines : lines.slice(0, blankIdx)).join('\n');
  const fields = {};
  for (const [key, label] of [
    ['opened', 'Opened'], ['base', 'Base'], ['artifact', 'Artifact'],
    // 'artifact-repo' (lane 60b, artifact-repo-60b spec): the other repository Base/Artifact
    // shas live in, when this build's artifact was never in --git at all.
    ['artifact-repo', 'Artifact-repo'],
    ['lead-session', 'Lead-session'], ['spec-session', 'Spec-session'], ['spec-from', 'Spec-from'],
  ]) {
    const m = fieldRegex(label).exec(headerText);
    if (m) fields[key] = m[1].trim();
  }
  const logs = [];
  for (const lm of headerText.matchAll(/^[ \t*+-]{0,20}Log:\**[ \t]{0,20}(.+)$/gim)) {
    const parts = lm[1].trim().match(/^(\S{1,64})[ \t]{1,20}(\S{1,64})[ \t]{1,20}(\S{1,64})(?:[ \t]{1,20}(.*))?$/);
    if (parts) logs.push({ at: parts[1], status: parts[2], owner: parts[3], note: (parts[4] ?? '').trim() });
  }
  return { fields, logs };
}
// MINOR 9: Artifact: is the CURRENT artifact (wrong after a re-accept): fallback only with one accepted entry.
function acceptedShaFrom(fields, note, singleAccepted) {
  const fromNote = /artifact\s+([0-9a-f]{7,40})/i.exec(note || '');
  if (fromNote) return fromNote[1];
  if (!singleAccepted) return null;
  return fields.artifact && fields.artifact.includes('@') ? fields.artifact.split('@')[1] : null;
}
function tryOr(fn, fallback) { try { return fn(); } catch { return fallback; } }
function loadJson(fsImpl, filePath) { return filePath ? tryOr(() => JSON.parse(fsImpl.readFileSync(filePath, 'utf8')), null) : null; }
function parseDateMs(s) { if (!s) return null; const ms = Date.parse(s); return Number.isNaN(ms) ? null : ms; }
function totalTokens(a) { return a ? (a.input_tokens || 0) + (a.cache_creation_input_tokens || 0) + (a.cache_read_input_tokens || 0) + (a.output_tokens || 0) : 0; }
// Preserve Claude's established default. Codex has its own mapped default from
// docs/model-tiers.md, while an explicit policy remains authoritative for either host.
function topTierModels(census) {
  const configured = process.env.DELEGATION_TOP_TIER;
  const defaults = isCodexCensus(census) ? 'gpt-6-astra,gpt-5.6-sol' : 'fable,opus';
  return (configured || defaults).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function isCodexCensus(census) { return census && census.lead && census.lead.host === 'codex'; }

function isUsableCodexValue(value) {
  return typeof value === 'string' && value.trim() !== '' && !/^(?:unknown|unavailable|null|undefined|missing|unset|n\/?a)$/i.test(value.trim());
}

function codexCoverageReason(census) {
  if (!isCodexCensus(census)) return null;
  const unavailable = census.lead.codex && Array.isArray(census.lead.codex.unavailable) ? census.lead.codex.unavailable.filter(Boolean) : [];
  if (census.lead.coverageSupported !== true) return `Codex census coverage is unavailable${unavailable.length ? `: ${unavailable.join('; ')}` : ''}`;
  if (census.subagents && census.subagents.incomplete) return 'Codex census subagents are incomplete';
  return null;
}

function codexModelTotalsReason(combined) {
  for (const [model, aggregate] of Object.entries(combined || {})) {
    if (!isUsableCodexValue(model)) return `Codex combined model total has unavailable model attribution`;
    if (!aggregate || !Number.isFinite(aggregate.derived_total_tokens) || aggregate.derived_total_tokens < 0) return `Codex combined model total for ${model} has unavailable derived_total_tokens`;
  }
  return null;
}

function censusLeadSessionId(census) {
  if (isCodexCensus(census)) return census.lead.sessionId || null;
  return census && census.leadPath ? path.basename(census.leadPath).replace(/\.jsonl$/i, '') : null;
}

function codexIdentityReason(census, requestedSessionId, requestedLabel = 'Lead-session') {
  const censusSessionId = census && census.lead && census.lead.sessionId;
  if (!isUsableCodexValue(requestedSessionId)) return `no valid ${requestedLabel}:`;
  if (!isUsableCodexValue(censusSessionId)) return 'Codex census has no valid lead.sessionId';
  if (censusSessionId !== requestedSessionId) return `Codex census session ${censusSessionId} is not ${requestedLabel} ${requestedSessionId}`;
  return null;
}

function codexResponseTimeline(census) {
  const codex = census && census.lead && census.lead.codex;
  if (!codex || codex.responseTimelineComplete !== true) return { timestamps: null, reason: 'Codex census response timeline is unavailable or incomplete' };
  if (!Array.isArray(codex.responseTimeline)) return { timestamps: null, reason: 'Codex census response timeline is unavailable or incomplete' };
  const ids = new Set();
  const timestamps = [];
  const rows = [];
  for (const row of codex.responseTimeline) {
    const ms = row && typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN;
    if (!row || !isUsableCodexValue(row.responseId) || !isUsableCodexValue(row.turnId) || !isUsableCodexValue(row.model) || Number.isNaN(ms)) {
      return { timestamps: null, reason: 'Codex census response timeline is unavailable or incomplete' };
    }
    if (ids.has(row.responseId)) return { timestamps: null, reason: 'Codex census response timeline has duplicate response ids' };
    ids.add(row.responseId);
    timestamps.push(ms);
    rows.push(row);
  }
  return { timestamps: timestamps.sort((a, b) => a - b), rows, reason: null };
}

function codexTokenSummary(census, tiers) {
  const top = sumTopTier(census.combined, tiers, true);
  const unavailable = [];
  const split = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  for (const model of top.matched) {
    const aggregate = census.combined[model];
    for (const [field, label] of [['input_tokens', 'input'], ['cache_creation_input_tokens', 'cache-write'], ['cache_read_input_tokens', 'cache-read'], ['output_tokens', 'output']]) {
      if (!Number.isFinite(aggregate[field]) || aggregate[field] < 0) unavailable.push(`${label} (${model})`);
      else if (field === 'input_tokens') split.input += aggregate[field];
      else if (field === 'cache_creation_input_tokens') split.cacheWrite += aggregate[field];
      else if (field === 'cache_read_input_tokens') split.cacheRead += aggregate[field];
      else split.output += aggregate[field];
    }
  }
  const breakdown = unavailable.length
    ? `breakdown unavailable (${unavailable.join(', ')})`
    : `cache-read ${split.cacheRead}, cache-write ${split.cacheWrite}, input ${split.input}, output ${split.output}`;
  return { ...top, value: `total ${top.total}; ${breakdown}` };
}
// ── Number 1 — top-tier tokens per build ────────────────────────────────────
// matched models + total, and (MAJOR 5) the same sums split into the four raw fields.
function sumTopTier(combined, tiers, useDerivedTotals = false) {
  const matched = Object.keys(combined || {}).filter((model) => tiers.some((t) => model.toLowerCase().includes(t)));
  const split = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  for (const m of matched) {
    const a = combined[m] || {};
    split.input += a.input_tokens || 0; split.cacheWrite += a.cache_creation_input_tokens || 0;
    split.cacheRead += a.cache_read_input_tokens || 0; split.output += a.output_tokens || 0;
  }
  return { total: matched.reduce((n, m) => n + (useDerivedTotals ? combined[m].derived_total_tokens : totalTokens(combined[m])), 0), matched, split };
}
// BLOCKER 1(b): reject a census whose window doesn't match this build's own window.
export function computeTopTierTokens(census, specCensus, fields, openedMs = null, acceptedMs = null, lastAcceptedMs = null) {
  if (!census) return { value: 'unavailable (no census)' };
  const coverageReason = codexCoverageReason(census);
  if (coverageReason) return { value: `unavailable (${coverageReason})` };
  if (!census.combined) return { value: 'unavailable (census has no combined by-model sums)' };
  const modelTotalsReason = isCodexCensus(census) ? codexModelTotalsReason(census.combined) : null;
  if (modelTotalsReason) return { value: `unavailable (${modelTotalsReason})` };
  const tolerance = 5 * 60000;
  const windowStartAt = census.lead && census.lead.windowStartAt ? Date.parse(census.lead.windowStartAt) : NaN;
  if (Number.isNaN(windowStartAt)) return { value: 'unavailable (census has no window start)' }; // MAJOR 1
  if ((acceptedMs !== null && windowStartAt > acceptedMs) || (openedMs !== null && windowStartAt < openedMs - tolerance)) {
    return { value: `unavailable (census window ${census.lead.windowStartAt} is not the build window)` };
  }
  // MAJOR 1: check the end too, or a persistent pane's next build's tokens mix in.
  const windowEndAt = census.lead && census.lead.windowEndAt ? Date.parse(census.lead.windowEndAt) : NaN;
  if (Number.isNaN(windowEndAt)) return { value: 'unavailable (census has no window end)' }; // MAJOR 3 (r3)
  if (lastAcceptedMs !== null && windowEndAt > lastAcceptedMs + tolerance) {
    return { value: `unavailable (census window ends ${census.lead.windowEndAt}, after the last acceptance)` };
  }
  const tiers = topTierModels(census);
  const build = sumTopTier(census.combined, tiers, isCodexCensus(census));
  const buildPart = `build ${build.total}${build.matched.length ? ` (${build.matched.sort().join(', ')})` : ' (no top-tier model matched)'}`;
  if (specCensus) { // r1 BLOCKER 1's twin: the spec slice is Spec-session's Spec-from:..Opened:, checked like the census
    const sl = specCensus.lead || {}, sFrom = parseDateMs(fields['spec-from']), sStart = parseDateMs(sl.windowStartAt), sEnd = parseDateMs(sl.windowEndAt);
    const specCoverageReason = codexCoverageReason(specCensus);
    const specTotalsReason = isCodexCensus(specCensus) && specCensus.combined ? codexModelTotalsReason(specCensus.combined) : null;
    const specIdentityReason = isCodexCensus(specCensus) ? codexIdentityReason(specCensus, fields['spec-session'], 'Spec-session') : null;
    if (specCoverageReason || specTotalsReason || specIdentityReason) return { value: `${build.total} tokens: ${buildPart}; partial (no spec slice): ${specCoverageReason || specTotalsReason || specIdentityReason}` };
    const sFile = censusLeadSessionId(specCensus);
    if (!specCensus.combined || sFile !== fields['spec-session'] || [sFrom, sStart, sEnd, openedMs].includes(null) || sStart < sFrom - tolerance || sEnd > openedMs + tolerance) return { value: `${build.total} tokens: ${buildPart}; partial (no spec slice): spec-census is not Spec-session:'s Spec-from:..Opened: window` };
    const spec = sumTopTier(specCensus.combined, topTierModels(specCensus), isCodexCensus(specCensus));
    return { value: `${build.total + spec.total} tokens: ${buildPart} + spec slice ${spec.total}` };
  }
  const reason = /^[(<[{"']*(?:none|null|undefined|unavailable|unknown|missing|unset|n.?a|tbd|pending|-+)(?![A-Za-z0-9_-])/i.test(fields['spec-session'] || 'none') || parseDateMs(fields['spec-from']) === null ? 'Spec-session:/Spec-from: missing from record' : 'spec-census not run';
  return { value: `${build.total} tokens: ${buildPart}; partial (no spec slice): ${reason}` }; // MINOR 4
}
// ── Lead-transcript timestamps — shared by numbers 2 and 4 (any JSONL line with a
// `timestamp` field is one "message", any role, so a gap can span roles).
export function scanTimestamps(fsImpl, filePath) {
  const text = tryOr(() => fsImpl.readFileSync(filePath, 'utf8'), null);
  if (text === null) return null;
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const obj = tryOr(() => JSON.parse(line), null);
    const ms = obj && obj.timestamp ? Date.parse(obj.timestamp) : NaN;
    if (!Number.isNaN(ms)) out.push(ms);
  }
  return out.sort((a, b) => a - b);
}
// gaps between consecutive entries; mode 'max' -> the single largest (or null), 'over' ->
// every gap strictly greater than thresholdMinutes.
function gaps(msList, mode, thresholdMinutes = 0) {
  if (!msList || msList.length < 2) return mode === 'max' ? null : [];
  const out = [];
  let best = null;
  for (let i = 1; i < msList.length; i++) {
    const minutes = (msList[i] - msList[i - 1]) / 60000;
    const g = { startMs: msList[i - 1], endMs: msList[i], minutes };
    if (mode === 'over' && minutes > thresholdMinutes) out.push(g);
    else if (mode === 'max' && (!best || minutes > best.minutes)) best = g;
  }
  return mode === 'max' ? best : out;
}
// ── R6/R7 — Agent/Task/Workflow spans and subagent stall scanning (docs/census.md) ──────────
const SPAN_TOOL_NAMES = new Set(['Agent', 'Task', 'Workflow']);

// Every tool_use/tool_result in the LEAD's own transcript (not just the Agent/Task/Workflow
// trio — TaskStop is a tool_use too). tool_result items are kept whole, AND (F2-review-round1
// MAJOR-3/MAJOR-1) the record-level `toolUseResult.agentId`/`.runId` a real (untrimmed)
// transcript carries next to the tool_result item are captured too — the committed trimmed
// fixtures never carry a `toolUseResult` at all, so both always read null there and every
// match falls through to the documented fallback (see docs/census.md).
export function scanLeadToolEvents(fsImpl, filePath) {
  const text = tryOr(() => fsImpl.readFileSync(filePath, 'utf8'), null);
  if (text === null) return null;
  const toolUses = []; // {ms, name, id}
  const toolResults = []; // {ms, item, agentId, runId}
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const obj = tryOr(() => JSON.parse(line), null);
    if (!obj) continue;
    const ms = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
    if (Number.isNaN(ms)) continue;
    const content = obj.message && Array.isArray(obj.message.content) ? obj.message.content : [];
    const tur = obj.toolUseResult && typeof obj.toolUseResult === 'object' ? obj.toolUseResult : null;
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'tool_use' && item.id) toolUses.push({ ms, name: item.name, id: item.id });
      else if (item.type === 'tool_result' && item.tool_use_id) toolResults.push({ ms, item, agentId: tur ? (tur.agentId || null) : null, runId: tur ? (tur.runId || null) : null });
    }
  }
  return { toolUses, toolResults };
}
// The whole matching toolResults record (not just its ms), earliest by ms.
function firstToolResult(toolResults, id) {
  let found = null;
  for (const r of toolResults) if (r.item.tool_use_id === id && (found === null || r.ms < found.ms)) found = r;
  return found;
}
function firstToolResultMs(toolResults, id) {
  const r = firstToolResult(toolResults, id);
  return r ? r.ms : null;
}
// R6 Spans: an Agent/Task/Workflow tool_use's OWN tool_result is a dispatch ack, not
// completion (in both committed fixtures it returns in under a second while the agents it
// spawned keep running for far longer — see F2-review-round1.md MAJOR-1). So each span is
// instead bounded by the LATER of that ack and the last timestamp of the agent file(s) it
// actually spawned, read straight from `<session>/subagents/`:
//   - Agent/Task: `subagents/agent-<toolUseResult.agentId>.jsonl`, when the lead's own
//     tool_result names that id (real transcripts carry it; the trimmed fixtures never do).
//   - Workflow: the run directory `subagents/workflows/<runId>/`, identified either by the
//     lead's own tool_result's `toolUseResult.runId` (real transcripts), or — for the
//     trimmed fixtures, which carry neither field — by the run whose earliest agent
//     timestamp falls in [this Workflow's tool_use, the next Workflow tool_use).
// Only when no matching agent file can be found at all does a span fall back to the
// literal rule: the ack for Agent/Task, or the first later lead `TaskStop` tool_use (else
// the window end) for Workflow — the same fallback R7 uses for a Workflow agent's own tail.
export function buildAgentSpans(fsImpl, leadPath, sessionId, toolUses, toolResults, windowEndMs) {
  const subagentsDir = path.join(path.dirname(leadPath), sessionId, 'subagents');
  const workflowsDir = path.join(subagentsDir, 'workflows');
  const taskStopMs = toolUses.filter((t) => t.name === 'TaskStop').map((t) => t.ms).sort((a, b) => a - b);
  const workflowUseMs = toolUses.filter((t) => t.name === 'Workflow').map((t) => t.ms).sort((a, b) => a - b);
  const runDirNames = tryOr(() => fsImpl.readdirSync(workflowsDir, { withFileTypes: true }), [])
    .filter((e) => (typeof e.isDirectory === 'function' ? e.isDirectory() : true)).map((e) => e.name);
  const lastMsCache = new Map();
  // An agent left waiting on a tool (R7 tail pending) is still alive until its R7 end bound,
  // so the lead waiting on it is waiting-on-agents, and the hang counts once (as the agent's
  // own tail stall via R7), never a second time as a lead stall (F2-review-round2 MAJOR-A).
  function activityEndMs(scanned, isWorkflow, agentId) {
    const lastTs = scanned.timestamps[scanned.timestamps.length - 1];
    return scanned.tailPendingToolUseId ? Math.max(lastTs, subagentEndBound(isWorkflow, agentId, lastTs, toolUses, toolResults, windowEndMs)) : lastTs;
  }
  // Only agent files whose FIRST timestamp falls in [fromMs, toMs) belong to this launch — a
  // relaunch that reuses a Workflow runId must not stretch the first launch's span over a
  // lead stall before the relaunch (F2-review-round2 MAJOR-B). Cache key includes the bound.
  function lastAgentMsInDir(dir, fromMs = -Infinity, toMs = Infinity) {
    const cacheKey = `${dir}|${fromMs}|${toMs}`;
    if (lastMsCache.has(cacheKey)) return lastMsCache.get(cacheKey);
    const names = tryOr(() => fsImpl.readdirSync(dir), []);
    let last = null;
    for (const name of names) {
      if (!AGENT_FILE_RE.test(name)) continue;
      const scanned = scanSubagentFile(fsImpl, path.join(dir, name));
      if (scanned.unreadable || !scanned.timestamps.length) continue;
      const first = scanned.timestamps[0];
      if (first < fromMs || first >= toMs) continue;
      const t = activityEndMs(scanned, true, AGENT_FILE_RE.exec(name)[1]);
      if (last === null || t > last) last = t;
    }
    lastMsCache.set(cacheKey, last);
    return last;
  }
  function fileLastMs(filePath, agentId) {
    const scanned = scanSubagentFile(fsImpl, filePath);
    return (!scanned.unreadable && scanned.timestamps.length) ? activityEndMs(scanned, false, agentId) : null;
  }
  // The next Workflow tool_use, after afterMs, whose OWN tool_result names the SAME runId —
  // a relaunch of this run, not just the next Workflow of any kind (F2-review-round2 MAJOR-B).
  function nextSameRunLaunchMs(afterMs, runId) {
    const later = toolUses.filter((tu) => tu.name === 'Workflow' && tu.ms > afterMs).sort((a, b) => a.ms - b.ms);
    for (const tu of later) {
      const r = firstToolResult(toolResults, tu.id);
      if (r && r.runId === runId) return tu.ms;
    }
    return Infinity;
  }
  const spans = [];
  for (const t of toolUses) {
    if (!SPAN_TOOL_NAMES.has(t.name)) continue;
    const ownResult = firstToolResult(toolResults, t.id);
    const ownResultMs = ownResult ? ownResult.ms : null;
    let end;
    if (t.name === 'Workflow') {
      let agentsLastMs = null;
      if (ownResult && ownResult.runId && runDirNames.includes(ownResult.runId)) {
        const toMs = nextSameRunLaunchMs(t.ms, ownResult.runId);
        agentsLastMs = lastAgentMsInDir(path.join(workflowsDir, ownResult.runId), t.ms, toMs);
      } else {
        // No runId (the trimmed fixtures never carry one): every agent file, in any run
        // directory, whose first timestamp falls in [this Workflow, the next Workflow of ANY
        // kind) belongs to this launch — take the MAX of their last-activity values, not just
        // the first one found in readdir order (F2-review-round2 MINOR-C). Each agent file
        // belongs to the latest Workflow launched at or before its own first timestamp,
        // whichever run dir it sits in, so a parallel launch never orphans a run's staged
        // agents and a relaunch never stretches the first launch (F2-review-round3 MINOR-1).
        const nextWorkflowMs = workflowUseMs.find((ms) => ms > t.ms);
        const upperBound = nextWorkflowMs !== undefined ? nextWorkflowMs : Infinity;
        for (const name of runDirNames) {
          const dir = path.join(workflowsDir, name);
          const last = lastAgentMsInDir(dir, t.ms, upperBound);
          if (last !== null && (agentsLastMs === null || last > agentsLastMs)) agentsLastMs = last;
        }
      }
      if (agentsLastMs !== null) {
        end = Math.max(ownResultMs !== null ? ownResultMs : t.ms, agentsLastMs);
      } else {
        const later = taskStopMs.find((ms) => ms > t.ms);
        end = later !== undefined ? later : windowEndMs;
      }
    } else {
      const agentId = ownResult ? ownResult.agentId : null;
      const agentFileLastMs = agentId ? fileLastMs(path.join(subagentsDir, `agent-${agentId}.jsonl`), agentId) : null;
      if (agentFileLastMs !== null) {
        end = Math.max(ownResultMs !== null ? ownResultMs : t.ms, agentFileLastMs);
      } else {
        end = ownResultMs !== null ? ownResultMs : windowEndMs;
      }
    }
    spans.push([t.ms, Math.max(end, t.ms)]);
  }
  return spans;
}
export function mergeSpans(spans) {
  const sorted = spans.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of sorted) {
    if (out.length && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
    else out.push([s, e]);
  }
  return out;
}
// Splits [gStart, gEnd) at the union's boundaries: a piece overlapping a span is
// waiting-on-agents (any length); a piece outside is stalled only when that piece alone is
// over 30 min (R6 Splitting).
export function splitGapByUnion(gStart, gEnd, union) {
  let cursor = gStart;
  const insidePieces = [];
  const outsidePieces = [];
  for (const [s, e] of union) {
    if (e <= cursor || s >= gEnd) continue;
    const os = Math.max(s, cursor);
    const oe = Math.min(e, gEnd);
    if (os > cursor) outsidePieces.push({ startMs: cursor, minutes: (os - cursor) / 60000 });
    insidePieces.push({ startMs: os, minutes: (oe - os) / 60000 });
    cursor = oe;
  }
  if (cursor < gEnd) outsidePieces.push({ startMs: cursor, minutes: (gEnd - cursor) / 60000 });
  return { insidePieces, outsidePieces };
}
// ── R7 — subagent stall scanning ─────────────────────────────────────────────────────────────
const AGENT_FILE_RE = /^agent-(.+)\.jsonl$/;
// A timestamp is accepted only when it parses AND carries an explicit Z or +/-HH:MM offset —
// never guessed as local time (R7).
function isStrictIsoInstant(s) {
  return typeof s === 'string' && /(Z|[+-]\d{2}:?\d{2})$/.test(s) && !Number.isNaN(Date.parse(s));
}
// One subagent file's own timestamps, plus whether its LAST record (in file order) holds a
// tool_use with no later tool_result in the same file — waiting on a tool, R7 tail silence.
// A single bad timestamp anywhere in the file rejects the WHOLE file, never a partial guess.
export function scanSubagentFile(fsImpl, filePath) {
  const text = tryOr(() => fsImpl.readFileSync(filePath, 'utf8'), null);
  if (text === null) return { unreadable: true };
  const objs = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const obj = tryOr(() => JSON.parse(line), null);
    if (!obj) continue;
    if (obj.timestamp !== undefined && !isStrictIsoInstant(obj.timestamp)) return { unreadable: true };
    objs.push(obj);
  }
  const timestamps = objs.filter((o) => o.timestamp !== undefined).map((o) => Date.parse(o.timestamp)).sort((a, b) => a - b);
  const last = objs.length ? objs[objs.length - 1] : null;
  const lastContent = last && last.message && Array.isArray(last.message.content) ? last.message.content : [];
  const pending = lastContent.find((c) => c && c.type === 'tool_use' && c.id);
  let tailPendingToolUseId = null;
  if (pending) {
    const hasLaterResult = objs.some((o) => o.message && Array.isArray(o.message.content)
      && o.message.content.some((c) => c && c.type === 'tool_result' && c.tool_use_id === pending.id));
    if (!hasLaterResult) tailPendingToolUseId = pending.id;
  }
  return { unreadable: false, timestamps, tailPendingToolUseId };
}
// Every `<lead-dir>/<session>/subagents/agent-*.jsonl` and
// `.../subagents/workflows/<run>/agent-*.jsonl` file (R7 Files); `journal.jsonl` and any
// `*.meta.json` never match `agent-*.jsonl` and are skipped by construction, not by name.
function listSubagentFiles(fsImpl, leadPath, sessionId) {
  const baseDir = path.join(path.dirname(leadPath), sessionId, 'subagents');
  const dirs = [{ dir: baseDir, isWorkflow: false }];
  const workflowsDir = path.join(baseDir, 'workflows');
  const runEntries = tryOr(() => fsImpl.readdirSync(workflowsDir, { withFileTypes: true }), []);
  for (const e of runEntries) {
    const isDir = typeof e.isDirectory === 'function' ? e.isDirectory() : true;
    if (isDir) dirs.push({ dir: path.join(workflowsDir, e.name), isWorkflow: true });
  }
  const files = [];
  for (const { dir, isWorkflow } of dirs) {
    const names = tryOr(() => fsImpl.readdirSync(dir), []);
    for (const name of names.slice().sort()) {
      const m = AGENT_FILE_RE.exec(name);
      if (m) files.push({ file: path.join(dir, name), id: m[1], isWorkflow });
    }
  }
  return files;
}
// R7 end bounds: a direct subagent's is the lead's own tool_result for its spawning
// Agent/Task call, matched by an agent-id field the lead result names (our trimmed fixtures
// never carry one, so this always falls to the window end there) — and only when that
// result comes AFTER the file's last timestamp, since an async Agent's matched result is
// often just the launch ack (F2-review-round1 MAJOR-3). A Workflow agent's end bound is the
// first lead TaskStop after the file's last timestamp, else the nearest-preceding Workflow's
// tool_result — again only when it is later than the file's last timestamp, never the ack
// (MAJOR-2) — else the window end.
function subagentEndBound(isWorkflow, agentId, fileLastMs, toolUses, toolResults, windowEndMs) {
  if (!isWorkflow) {
    for (const r of toolResults) if ((r.agentId === agentId || r.item.agentId === agentId || r.item.agent_id === agentId) && r.ms > fileLastMs) return r.ms;
    return windowEndMs;
  }
  const taskStopAfter = toolUses.filter((t) => t.name === 'TaskStop' && t.ms > fileLastMs).map((t) => t.ms).sort((a, b) => a - b);
  if (taskStopAfter.length) return taskStopAfter[0];
  // The nearest Workflow launched before this file ended — not just the first Workflow in
  // the whole lead — and only a result strictly later than the file's own end bounds it.
  const workflowUses = toolUses.filter((t) => t.name === 'Workflow' && t.ms <= fileLastMs).sort((a, b) => b.ms - a.ms);
  for (const w of workflowUses) {
    const resultMs = firstToolResultMs(toolResults, w.id);
    if (resultMs !== null && resultMs > fileLastMs) return resultMs;
  }
  return windowEndMs;
}
// Scans every subagent file in scope (R7 Scope: its timestamp range overlaps the window).
// `stalls` entries ({id, atMs, minutes}) each count as +1 toward N; `unreadableIds` files are
// named but never guessed at or counted.
export function collectSubagentStalls(fsImpl, leadPath, sessionId, windowStartMs, windowEndMs, toolUses, toolResults) {
  const files = listSubagentFiles(fsImpl, leadPath, sessionId);
  const stalls = [];
  const unreadableIds = [];
  for (const f of files) {
    const scanned = scanSubagentFile(fsImpl, f.file);
    if (scanned.unreadable) { unreadableIds.push(f.id); continue; }
    if (!scanned.timestamps.length) continue;
    const first = scanned.timestamps[0];
    const last = scanned.timestamps[scanned.timestamps.length - 1];
    if (last < windowStartMs || first > windowEndMs) continue; // R7 Scope
    const inWindow = scanned.timestamps.filter((m) => m >= windowStartMs && m <= windowEndMs);
    for (let i = 1; i < inWindow.length; i++) {
      const minutes = (inWindow[i] - inWindow[i - 1]) / 60000;
      if (minutes > 30) stalls.push({ id: f.id, atMs: inWindow[i - 1], minutes });
    }
    if (scanned.tailPendingToolUseId) {
      const endBound = subagentEndBound(f.isWorkflow, f.id, last, toolUses, toolResults, windowEndMs);
      // MINOR-3: an end bound (a TaskStop/tool_result) can land after the window itself —
      // clip to the window, the same way internal gaps only ever use in-window timestamps.
      const minutes = (Math.min(endBound, windowEndMs) - last) / 60000;
      if (minutes > 30) stalls.push({ id: f.id, atMs: last, minutes });
    }
  }
  return { stalls, unreadableIds, filesFound: files.length }; // MINOR-2: lets the caller tell "no agents ran" from "no files found"
}
// ── Number 2 — hours ask to accepted, plus the largest gap inside that window ──────────
// leadGapReason (MAJOR 1): why leadTimestamps is null (a lead-session mismatch, not a missing transcript).
export function computeHoursAskToAccepted(fields, logs, leadTimestamps, leadGapReason, gapLabel = 'largest gap') {
  const openedMs = parseDateMs(fields.opened);
  if (openedMs === null) return { value: 'unavailable (no Opened:)', openedMs: null, acceptedMs: null, reason: 'no Opened:' };
  const first = logs.find((l) => l.status.toLowerCase() === 'accepted');
  if (!first) return { value: 'unavailable (no accepted Log: entry)', openedMs, acceptedMs: null, reason: 'no accepted Log: entry' };
  const acceptedMs = parseDateMs(first.at);
  if (acceptedMs === null) return { value: 'unavailable (unparseable accepted Log: timestamp)', openedMs, acceptedMs: null, reason: 'unparseable accepted Log: timestamp' };
  // MAJOR 4: first Log: is the first accepted -> no earlier entry; 0.0h would be a confident non-answer.
  if (logs.indexOf(first) === 0) {
    const reason = 'record opened at acceptance: no Log: entry before the first accepted';
    return { value: `unavailable (${reason})`, openedMs, acceptedMs: null, reason };
  }
  const hours = (acceptedMs - openedMs) / 3600000;
  let gapPart;
  if (leadTimestamps === null) {
    gapPart = `gap unavailable (${leadGapReason || 'no lead transcript'})`;
  } else {
    const gap = gaps(leadTimestamps.filter((t) => t >= openedMs && t <= acceptedMs), 'max');
    gapPart = gap
      ? `${gapLabel} ${gap.minutes.toFixed(1)}min at ${new Date(gap.startMs).toISOString()}`
      : 'gap unavailable (fewer than 2 lead messages in window)';
  }
  return { value: `${hours.toFixed(1)}h; ${gapPart}`, openedMs, acceptedMs };
}
// ── Number 3 — rework after acceptance ──────────────────────────────────────────────────
function runGit(repoDir, args) { return execFileSync('git', ['-C', repoDir, ...args], { env: withoutRepoLocatingGitEnv(process.env), encoding: 'utf8' }); }
export function computeReworkAfterAcceptance(fields, logs, gitDir, branch = 'HEAD') {
  const accepted = logs.filter((l) => l.status.toLowerCase() === 'accepted');
  const reaccepts = accepted.slice(1);
  const reacceptPart = reaccepts.length
    ? `${reaccepts.length} re-accept Log: entr${reaccepts.length === 1 ? 'y' : 'ies'} after the first: ${reaccepts.map((l) => `${l.at} ${l.note}`).join('; ')}`
    : '0 re-accept Log: entries after the first';
  const first = accepted[0];
  const acceptedSha = first ? acceptedShaFrom(fields, first.note, accepted.length === 1) : null; // MINOR 9
  if (!fields.base || !acceptedSha || !gitDir) return { value: `unavailable (no range); ${reacceptPart}` }; // MINOR 1
  try {
    const changed = runGit(gitDir, ['diff', '--name-only', `${fields.base}..${acceptedSha}`]).split('\n').map((s) => s.trim()).filter(Boolean);
    if (!changed.length) return { value: `unavailable (no range); ${reacceptPart}` }; // MINOR 1
    const acceptedMs = parseDateMs(first.at);
    const untilIso = acceptedMs === null ? null : new Date(acceptedMs + 7 * 24 * 3600000).toISOString();
    const args = ['log', '--no-merges', `--since=${first.at}`, ...(untilIso ? [`--until=${untilIso}`] : []),
      '--pretty=%H%x1f%s', `${acceptedSha}..${branch}`, '--', ...changed];
    const commits = runGit(gitDir, args).split('\n').filter(Boolean)
      .map((l) => { const [sha, subject] = l.split('\x1f'); return { sha, subject }; })
      // MAJOR 2: real release subjects also take "chore: release ..." / "chore(release): ...".
      .filter((c) => !/^(?:release\b|chore:\s*release\b|chore\(release\):)/i.test(c.subject));
    const commitPart = commits.length
      ? `${commits.length} commit(s) touching build files within 7 days: ${commits.map((c) => `${c.sha.slice(0, 7)} "${c.subject}"`).join(', ')}`
      : '0 commits touching build files within 7 days';
    return { value: `${commitPart}; ${reacceptPart}` };
  } catch (e) { return { value: `unavailable (git: ${e.message.split('\n')[0]})` }; }
}
// ── Ledger parsing — shared by number 4 and "notes to the lead". Line shape:
// `<from> → <to>, M.D.YY HH:MM TZ [<id>( re <parent-id>)?] KIND: text`
const LEDGER_LINE_RE = /^(\S+)\s+→\s+(\S+),\s+(\d{1,2}\.\d{1,2}\.\d{2,4})\s+(\d{1,2}:\d{2})\s+(\S+)\s+\[([^\]]+)\]\s+(ASK|RESULT|BLOCKED|ACK|FYI):/;
// MINOR 5: America/New_York flips EDT/EST across the year — try both candidate offsets and
// keep whichever round-trips through the real IANA zone, never hard-coded -04:00.
function ledgerTimestampMs(date, time, tz) {
  if (tz !== 'NYC') return null;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(date);
  if (!m) return null;
  let [, mo, da, yr] = m;
  if (yr.length === 2) yr = `20${yr}`;
  mo = mo.padStart(2, '0'); da = da.padStart(2, '0');
  for (const off of ['-04:00', '-05:00']) {
    const ms = Date.parse(`${yr}-${mo}-${da}T${time}:00${off}`);
    if (Number.isNaN(ms)) continue;
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ms));
    const g = (t) => p.find((x) => x.type === t).value;
    if (`${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}` === `${yr}-${mo}-${da}T${time}`) return ms;
  }
  return null;
}
function parseLedgerLine(line) {
  const m = LEDGER_LINE_RE.exec(line);
  if (!m) return null;
  const [, from, to, date, time, tz, bracket, kind] = m;
  const [idRaw, reRaw] = bracket.split(/\s+re\s+/);
  return { from, to, tz, id: idRaw.trim(), re: reRaw ? reRaw.trim() : null, kind, ms: ledgerTimestampMs(date, time, tz) };
}
export function collectLedgerEntries(ledgerDir, fsImpl) {
  const names = tryOr(() => fsImpl.readdirSync(ledgerDir).filter((f) => f.endsWith('.md')).sort(), null);
  if (names === null) return null;
  const entries = [];
  for (const name of names) {
    const text = tryOr(() => fsImpl.readFileSync(path.join(ledgerDir, name), 'utf8'), null);
    if (text === null) continue;
    for (const line of text.split(/\r?\n/)) {
      const e = parseLedgerLine(line);
      if (e) entries.push(e);
    }
  }
  return entries;
}
function ledgerInWindow(entries, kinds, leadSlug, openedMs, acceptedMs) {
  return entries.filter((e) => kinds.includes(e.kind) && e.to === leadSlug && e.ms !== null && e.ms >= openedMs && e.ms <= acceptedMs);
}
// Stall nudges received (census-completeness, lane 38): ledger lines whose id matches
// `collect-*-stall-*` (the collector's stall-nudge ASK, collect-status.mjs buildStallTopic) that are
// addressed to the lead's slug inside [fromMs, toMs]. Shared with build-census.mjs.
export const STALL_NUDGE_ID_RE = /^collect-.+-stall-/;
export function countStallNudges(entries, leadSlug, fromMs, toMs) {
  const hits = entries.filter((e) => e.to === leadSlug && STALL_NUDGE_ID_RE.test(e.id) && e.ms !== null && e.ms >= fromMs && e.ms <= toMs);
  return { count: hits.length, ids: hits.map((e) => e.id) };
}
function ledgerHasSlug(entries, leadSlug) { return entries.some((e) => e.from === leadSlug || e.to === leadSlug); }
// ── Number 4 — work lost or stalled. leadGapReason (MAJOR 1): see computeHoursAskToAccepted.
// `spans` (R6, a merged union of [start,end] Agent/Task/Workflow intervals from
// buildAgentSpans+mergeSpans) and `agentResults` (R7, {stalls, unreadableIds, filesFound,
// note?} from collectSubagentStalls, note added by the caller per MINOR-2) are both
// precomputed by the caller (buildFourRead) and may be null when unavailable. The
// no-lead-transcript wording is kept exactly as before (that case can't even locate the
// lead's own session file to derive a subagents/ dir from, so agentResults is always null
// there too); the fewer-than-2-messages wording (R6) now still appends the agent lines
// (F2-review-round1 MINOR-1) since collectSubagentStalls can run independently of the lead's
// own in-window message count.
// `nativeGapUnit` is used only for a verified Codex response timeline. Native response
// silence is a heuristic; it cannot establish Claude Agent/Task/Workflow wait spans or
// child-agent stall semantics, so those remain explicitly unavailable even when the
// heuristic finds zero long response gaps.
export function computeWorkLostOrStalled(leadTimestamps, ledgerEntries, leadSlug, { openedMs, acceptedMs, reason }, leadGapReason, spans = null, agentResults = null, nativeGapUnit = null) {
  if (openedMs === null) return { value: 'unavailable (no Opened:)' };
  if (acceptedMs === null) return { value: `unavailable (${reason || 'no accepted Log: entry'})` }; // MAJOR 4
  const nativeStallUnavailable = nativeGapUnit
    ? 'stalled classification unavailable (native Codex Agent/Task/Workflow span/stall coverage is not established); '
    : '';
  let gapPart;
  if (leadTimestamps === null) {
    gapPart = nativeGapUnit
      ? `${nativeStallUnavailable}native API response gaps unavailable (${leadGapReason || 'no verified response timeline'})`
      : `gaps unavailable (${leadGapReason || 'no lead transcript'})`;
  } else {
    const agentStalls = (agentResults && agentResults.stalls) || [];
    const unreadableIds = (agentResults && agentResults.unreadableIds) || [];
    const agentLines = [
      ...agentStalls.map((a) => `agent ${a.id} silent ${a.minutes.toFixed(1)} min from ${new Date(a.atMs).toISOString()}`), // R7 Output
      ...unreadableIds.map((id) => `agent ${id} unreadable timestamps`),
      ...(agentResults && agentResults.note ? [agentResults.note] : []), // MINOR-2
    ];
    // BLOCKER 2: fewer than 2 in-window messages must not print a confident "0 gaps".
    const inWindow = leadTimestamps.filter((t) => t >= openedMs && t <= acceptedMs);
    const over30 = inWindow.length < 2 ? null : gaps(inWindow, 'over', 30);
    if (over30 === null) {
      // MINOR-1: agent stalls were already computed by the caller — don't drop them here.
      gapPart = nativeGapUnit
        ? `${nativeStallUnavailable}native API response gaps unavailable (fewer than 2 verified responses in window)`
        : 'gaps unavailable (fewer than 2 lead messages in window)' + (agentLines.length ? `; ${agentLines.join('; ')}` : '');
    } else if (nativeGapUnit) {
      const gapList = over30.map((g) => `${new Date(g.startMs).toISOString()} (${g.minutes.toFixed(1)}min)`).join(', ');
      gapPart = `${nativeStallUnavailable}${over30.length} ${nativeGapUnit}(s) over 30min (heuristic, not stall attribution)${over30.length ? `: ${gapList}` : ''}`;
    } else {
      const union = spans || [];
      const leadStalled = []; // outside the union, over 30min alone (R6 Splitting)
      const waiting = []; // inside the union, any length
      for (const g of over30) {
        const { insidePieces, outsidePieces } = splitGapByUnion(g.startMs, g.endMs, union);
        for (const p of outsidePieces) if (p.minutes > 30) leadStalled.push(p);
        for (const p of insidePieces) waiting.push(p);
      }
      const n = leadStalled.length + agentStalls.length; // R6 Line: "N counts lead stalled pieces plus agent stalls"
      const waitingMinutes = waiting.reduce((sum, p) => sum + p.minutes, 0);
      const stalledList = leadStalled.map((p) => `${new Date(p.startMs).toISOString()} (${p.minutes.toFixed(1)}min)`).join(', ');
      gapPart = `${n} gap(s) over 30min stalled${leadStalled.length ? `: ${stalledList}` : ''}`
        + `; ${waiting.length} waiting-on-agents (${waitingMinutes.toFixed(1)} min)`
        + `${agentLines.length ? `; ${agentLines.join('; ')}` : ''}`;
    }
  }
  let askPart;
  if (!leadSlug) askPart = 'ASKs unavailable (no --lead-slug)';
  else if (ledgerEntries === null) askPart = 'ASKs unavailable (no ledger dir)';
  else if (!ledgerHasSlug(ledgerEntries, leadSlug)) askPart = `ASKs unavailable (slug ${leadSlug} not in ledger)`; // MAJOR 3
  else {
    const asks = ledgerInWindow(ledgerEntries, ['ASK'], leadSlug, openedMs, acceptedMs);
    const answered = new Set(ledgerEntries.filter((e) => (e.kind === 'RESULT' || e.kind === 'BLOCKED') && e.re).map((e) => e.re));
    const unanswered = asks.filter((e) => !answered.has(e.id));
    askPart = unanswered.length
      ? `${unanswered.length} unanswered ASK(s) to ${leadSlug}: ${unanswered.map((e) => e.id).join(', ')}`
      : `0 unanswered ASKs to ${leadSlug}`;
  }
  return { value: `${gapPart}; ${askPart}` };
}
// ── Number 4's completeness suffix (census-completeness, lane 38) ───────────────────────────
// Wakes, Stop-blocks and stall nudges received, appended AFTER the leading stalled integer so
// work-record.mjs's stall check (which parses only that integer) is unaffected. Wakes and
// Stop-blocks are read from the census JSON (build-census.mjs, docs/census.md "Wakes,
// Stop-blocks, stall nudges") and only when the census window is the build window; stall
// nudges are counted here from the ledger over the record's own Opened:..accepted window.
export function computeCompletenessSuffix(census, ledgerEntries, leadSlug, { openedMs, acceptedMs, reason }, lastAcceptedMs) {
  const parts = [];
  const lead = census && census.lead ? census.lead : null;
  // Both hosts emit wakes and Stop-blocks; a census without integers for both predates them.
  const windowReason = !census ? 'no census'
    : !Number.isInteger(lead.wakes) || !Number.isInteger(lead.stopBlocks) ? 'census predates wake/Stop-block counts'
      : censusBuildWindowReason(census, { openedMs, acceptedMs, reason }, lastAcceptedMs);
  parts.push(windowReason
    ? `wakes unavailable (${windowReason})`
    : `wakes ${lead.wakes} (${lead.wakesNoteFlush} note-flush, ${lead.wakesDoneTick} Done-tick)`);
  parts.push(windowReason ? `Stop-blocks unavailable (${windowReason})` : `Stop-blocks ${lead.stopBlocks}`);
  if (!leadSlug) parts.push('stall nudges unavailable (no --lead-slug)');
  else if (ledgerEntries === null) parts.push('stall nudges unavailable (no ledger dir)');
  else if (!ledgerHasSlug(ledgerEntries, leadSlug)) parts.push(`stall nudges unavailable (slug ${leadSlug} not in ledger)`);
  else if (openedMs === null || acceptedMs === null) parts.push(`stall nudges unavailable (${(reason || 'no Opened:/accepted window').replace(/:$/, '')})`);
  else {
    const nudges = countStallNudges(ledgerEntries, leadSlug, openedMs, acceptedMs);
    parts.push(`stall nudges ${nudges.count} to ${leadSlug}${nudges.count ? `: ${nudges.ids.join(', ')}` : ''}`);
  }
  return parts.join('; ');
}
// ── Companion lines (item 5) ─────────────────────────────────────────────────────────────
function computeNotesToLead(ledgerEntries, leadSlug, { openedMs, acceptedMs, reason }) {
  if (!leadSlug) return { value: 'unavailable (no --lead-slug)' };
  if (ledgerEntries === null) return { value: 'unavailable (no ledger dir)' };
  if (!ledgerHasSlug(ledgerEntries, leadSlug)) return { value: `unavailable (slug ${leadSlug} not in ledger)` }; // MAJOR 3
  if (openedMs === null || acceptedMs === null) return { value: `unavailable (${reason || 'no Opened:/accepted window'})` }; // MINOR 1
  const notes = ledgerInWindow(ledgerEntries, ['ASK', 'RESULT', 'BLOCKED'], leadSlug, openedMs, acceptedMs);
  return { value: `${notes.length} note(s) to ${leadSlug}: ${notes.map((e) => `${e.kind} ${e.id}`).join(', ') || '(none)'}` };
}
// MAJOR 5: top-tier assistant messages per build, deduped by id per file like
// build-census.mjs's own dedup, over the lead transcript plus every subagent file counted.
function countTopTierMessages(fsImpl, filePath, tiers, sinceMs, untilMs) {
  const text = tryOr(() => fsImpl.readFileSync(filePath, 'utf8'), null);
  if (text === null) return null;
  const ids = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const obj = tryOr(() => JSON.parse(line), null);
    if (!obj || obj.type !== 'assistant' || !obj.message || !obj.message.usage) continue;
    const model = (obj.message.model || '').toLowerCase();
    if (!tiers.some((t) => model.includes(t))) continue;
    if (sinceMs !== null) {
      const ms = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
      if (Number.isNaN(ms) || ms < sinceMs || ms > untilMs) continue;
    }
    ids.add(obj.message.id || obj.requestId || `#${ids.size}`);
  }
  return ids.size;
}
// BLOCKER 1/MAJOR 1 (r2): gate on Number 1's own census verdict and count over its window.
function computeTopTierMessages(fsImpl, census, leadPath, leadGapReason, openedMs, acceptedMs, numberOneValue, codexTimeline = null) {
  if (isCodexCensus(census)) {
    const timeline = codexTimeline || codexResponseTimeline(census);
    if (leadGapReason || timeline.reason) return { value: `unavailable (${leadGapReason || timeline.reason})` };
    // A complete C1 lead timeline remains independently useful when only whole-build
    // token coverage is partial (for example, an unrelated child could not be proved).
    // Keep the lead-only count, while carrying the token-coverage failure explicitly.
    const tokenReason = codexCoverageReason(census) || codexModelTotalsReason(census.combined);
    if (numberOneValue.startsWith('unavailable') && !tokenReason) return { value: numberOneValue };
    const tiers = topTierModels(census);
    const count = timeline.rows.filter((row) => tiers.some((tier) => row.model.toLowerCase().includes(tier))).length;
    const tokenSummary = tokenReason ? `unavailable (${tokenReason})` : codexTokenSummary(census, tiers).value;
    return { value: `${count} verified top-tier native API response(s) (lead only); tokens: ${tokenSummary}` };
  }
  if (numberOneValue.startsWith('unavailable')) return { value: numberOneValue };
  const tiers = topTierModels(census);
  const { split } = sumTopTier(census.combined, tiers);
  const splitPart = `cache-read ${split.cacheRead}, cache-write ${split.cacheWrite}, input ${split.input}, output ${split.output}`;
  if (leadGapReason) return { value: `unavailable (${leadGapReason}); tokens: ${splitPart}` };
  const sinceMs = census.lead && census.lead.windowStartAt ? Date.parse(census.lead.windowStartAt) : null;
  const untilMs = census.lead && census.lead.windowEndAt ? Date.parse(census.lead.windowEndAt) : null;
  const files = [leadPath, ...((census.subagents && census.subagents.perFile) || []).map((f) => f.file)].filter(Boolean);
  let total = 0;
  for (const f of files) {
    const n = countTopTierMessages(fsImpl, f, tiers, sinceMs, untilMs);
    if (n === null) return { value: `unavailable (${f} unreadable); tokens: ${splitPart}` };
    total += n;
  }
  return { value: `${total} messages; tokens: ${splitPart}` };
}

// Native lead-response counts are independent of whole-build token completeness, but not
// of build identity. Validate the record/census interval separately because Number 1 checks
// token coverage first and can therefore stop before its own window checks.
function censusBuildWindowReason(census, { openedMs, acceptedMs, reason }, lastAcceptedMs) {
  if (openedMs === null || acceptedMs === null) return `${(reason || 'no Opened:/accepted window').replace(/:$/, '')}: census window cannot be checked`;
  const tolerance = 5 * 60000;
  const windowStartAt = census && census.lead && census.lead.windowStartAt ? Date.parse(census.lead.windowStartAt) : NaN;
  if (Number.isNaN(windowStartAt)) return 'census has no window start';
  if (windowStartAt > acceptedMs || windowStartAt < openedMs - tolerance) return `census window ${census.lead.windowStartAt} is not the build window`;
  const windowEndAt = census && census.lead && census.lead.windowEndAt ? Date.parse(census.lead.windowEndAt) : NaN;
  if (Number.isNaN(windowEndAt)) return 'census has no window end';
  if (lastAcceptedMs !== null && windowEndAt > lastAcceptedMs + tolerance) return `census window ends ${census.lead.windowEndAt}, after the last acceptance`;
  return null;
}
// ── Orchestration ────────────────────────────────────────────────────────────────────────
export function buildFourRead(opts, fsImpl = fs) {
  const { fields, logs } = parseRecordText(fsImpl.readFileSync(opts.record, 'utf8'));
  if (opts.acceptAt && !logs.some((l) => l.status.toLowerCase() === 'accepted')) logs.push({ at: opts.acceptAt, status: 'accepted', owner: '-', note: `artifact ${(fields.artifact || '').split('@').pop()}` }); // MAJOR 2 (seam): T stands in for the first accept until `accept --at T` writes it for real
  let leadSessionId = fields['lead-session'] || null;
  let leadSessionSource = leadSessionId ? 'record' : null;
  if (!leadSessionId && opts.leadSession) { leadSessionId = opts.leadSession; leadSessionSource = 'cli'; }
  const census = loadJson(fsImpl, opts.census);
  const specCensus = loadJson(fsImpl, opts.specCensus);
  const leadPath = census && census.leadPath ? census.leadPath : null;
  // Claude's filename is its session id. A Codex rollout basename is not: C1 supplies the
  // verified logical session id, so do not reject a valid timestamp-prefixed rollout filename.
  const leadFileId = censusLeadSessionId(census);
  const leadIdentityReason = isCodexCensus(census)
    ? codexIdentityReason(census, leadSessionId)
    : !leadSessionId ? 'no Lead-session:'
      : leadFileId && leadFileId !== leadSessionId ? `census lead file ${leadFileId} is not Lead-session ${leadSessionId}` : null;
  const codexTimeline = isCodexCensus(census) ? codexResponseTimeline(census) : null;
  // Codex gap inputs come only from C1's verified, window-filtered response timeline.
  // Claude retains its established transcript timestamp scan unchanged.
  const leadGapReason = leadIdentityReason || (codexTimeline && codexTimeline.reason);
  const leadTimestamps = isCodexCensus(census) ? (leadGapReason ? null : codexTimeline.timestamps) : leadPath && !leadGapReason ? scanTimestamps(fsImpl, leadPath) : null;
  // R6/R7: the same lead file's own Agent/Task/Workflow/TaskStop tool events, read once and
  // reused for both the lead-gap union (R6) and the subagent-file scan (R7). Codex has no
  // equivalent Claude tool-event contract, so its verified response timeline remains the
  // only native gap source and the Claude scanners are not invoked for it.
  const leadToolEvents = !isCodexCensus(census) && leadPath && !leadGapReason ? scanLeadToolEvents(fsImpl, leadPath) : null;
  const ledgerEntries = opts.ledger ? collectLedgerEntries(opts.ledger, fsImpl) : null;
  const numberTwo = computeHoursAskToAccepted(fields, logs, leadTimestamps, leadGapReason, isCodexCensus(census) ? 'largest native API response gap (heuristic)' : 'largest gap');
  const windowMs = { openedMs: numberTwo.openedMs, acceptedMs: numberTwo.acceptedMs, reason: numberTwo.reason };
  const agentSpans = (leadToolEvents && leadFileId && windowMs.acceptedMs !== null)
    ? mergeSpans(buildAgentSpans(fsImpl, leadPath, leadFileId, leadToolEvents.toolUses, leadToolEvents.toolResults, windowMs.acceptedMs))
    : null;
  const agentStallResults = (leadToolEvents && leadFileId && windowMs.openedMs !== null && windowMs.acceptedMs !== null)
    ? (() => {
        const result = collectSubagentStalls(fsImpl, leadPath, leadFileId, windowMs.openedMs, windowMs.acceptedMs, leadToolEvents.toolUses, leadToolEvents.toolResults);
        // MINOR-2: a missing subagents/ dir must not read as a confident "0 agent stalls"
        // when the lead actually dispatched Agent/Task/Workflow work.
        const hasSpanToolUses = leadToolEvents.toolUses.some((t) => SPAN_TOOL_NAMES.has(t.name));
        if (result.filesFound === 0 && hasSpanToolUses) result.note = `subagents unavailable (no files under ${leadFileId}/subagents)`;
        return result;
      })()
    : null;
  const acceptedLogs = logs.filter((l) => l.status.toLowerCase() === 'accepted');
  const lastAcceptedMs = (acceptedLogs.length ? parseDateMs(acceptedLogs[acceptedLogs.length - 1].at) : null) ?? windowMs.acceptedMs; // unparseable last -> the tighter first bound
  const nativeWindowReason = isCodexCensus(census) ? censusBuildWindowReason(census, windowMs, lastAcceptedMs) : null;
  // BLOCKER 1 (r2): an unchecked window says so; BLOCKER 1(b)/MAJOR 1/2 (r3): refuse with Number 2.
  const numberOne = isCodexCensus(census) && leadIdentityReason ? { value: `unavailable (${leadIdentityReason})` }
    : !isCodexCensus(census) && leadIdentityReason && leadSessionId ? { value: `unavailable (${leadIdentityReason})` } // the census read another session
    : windowMs.openedMs === null || windowMs.acceptedMs === null ? { value: `unavailable (${numberTwo.reason.replace(/:$/, '')}: census window cannot be checked)` } // MINOR 3 (r4): no doubled colon
    : computeTopTierTokens(census, specCensus, fields, windowMs.openedMs, windowMs.acceptedMs, lastAcceptedMs);
  // Lane 60b: Base/the accepted sha both live in Artifact-repo: when it is present, never in
  // --git - a missing or unreadable Artifact-repo: renders as `unavailable (no range)`, same as
  // any other missing/bad --git today (runGit throws, caught below), never a confident value.
  const artifactRepo = fields['artifact-repo'];
  const reworkGit = artifactRepo === undefined ? opts.git
    : (path.posix.isAbsolute(artifactRepo) || path.win32.isAbsolute(artifactRepo)) ? artifactRepo : null; // null -> unavailable (no range)
  const numberThree = computeReworkAfterAcceptance(fields, logs, reworkGit, opts.branch || 'HEAD');
  const numberFour = computeWorkLostOrStalled(
    leadTimestamps, ledgerEntries, opts.leadSlug, windowMs, leadGapReason,
    agentSpans, agentStallResults, isCodexCensus(census) ? 'native API response gap' : null,
  );
  if (!numberFour.value.startsWith('unavailable')) {
    numberFour.value = `${numberFour.value}; ${computeCompletenessSuffix(census, ledgerEntries, opts.leadSlug, windowMs, lastAcceptedMs)}`;
  }
  const notesToLead = computeNotesToLead(ledgerEntries, opts.leadSlug, windowMs);
  const topTierMessages = computeTopTierMessages(fsImpl, census, leadPath, leadGapReason || nativeWindowReason, windowMs.openedMs, windowMs.acceptedMs, numberOne.value, codexTimeline);
  const leadSessionNotes = { cli: 'id came from --lead-session on the command line; the census file names the lead session file it read', record: "from the record's Lead-session: field", unavailable: 'no Lead-session: field and no --lead-session given' };
  return {
    record: opts.record, acceptAt: opts.acceptAt || null,
    leadSession: { id: leadSessionId, source: leadSessionSource || 'unavailable', note: leadSessionNotes[leadSessionSource || 'unavailable'] },
    numbers: [
      { key: 'topTierTokensPerBuild', label: 'Top-tier tokens per build', value: numberOne.value },
      { key: 'hoursAskToAccepted', label: 'Hours ask to accepted', value: numberTwo.value },
      { key: 'reworkAfterAcceptance', label: 'Rework after acceptance', value: numberThree.value },
      { key: 'workLostOrStalled', label: 'Work lost or stalled', value: numberFour.value },
    ],
    companions: [
      { key: 'topTierAssistantMessagesPerBuild', label: 'Top-tier assistant messages per build', value: topTierMessages.value },
      { key: 'notesToLeadPerBuild', label: 'Notes to the lead per build', value: notesToLead.value },
    ],
  };
}
// ── Output formatting — deterministic JSON (sorted keys) and a markdown table ─────────────
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k]);
  return out;
}
export function formatJson(report) { return JSON.stringify(sortKeysDeep(report), null, 2); }
export function formatMarkdown(report) {
  const md = [
    `# Four-number read: ${path.basename(report.record)}`, '',
    `Lead session: \`${report.leadSession.id || 'unavailable'}\` (${report.leadSession.note})`, '',
    '| number | value |', '|---|---|',
  ];
  for (const n of report.numbers) md.push(`| ${n.label} | ${n.value} |`);
  md.push('', '## Companions', '', '| line | value |', '|---|---|');
  for (const c of report.companions) md.push(`| ${c.label} | ${c.value} |`);
  return md.join('\n');
}
// ── CLI ──────────────────────────────────────────────────────────────────────────────────
const ARG_FLAGS = { '--record': 'record', '--census': 'census', '--spec-census': 'specCensus', '--ledger': 'ledger', '--git': 'git', '--branch': 'branch', '--lead-session': 'leadSession', '--lead-slug': 'leadSlug', '--out': 'out', '--json': 'json', '--accept-at': 'acceptAt' };
export function parseArgs(argv) {
  const opts = { record: null, census: null, specCensus: null, ledger: null, git: null, branch: 'HEAD', leadSession: null, leadSlug: null, out: null, json: null, acceptAt: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const key = ARG_FLAGS[a];
    if (!key) throw new Error(`unknown argument: ${a}`);
    const v = argv[++i];
    if (!v) throw new Error(`${a} needs a value`);
    opts[key] = v;
  }
  if (!opts.record) throw new Error('--record <record.md> is required');
  if (!opts.census) throw new Error('--census <census.json> is required');
  return opts;
}
// F1 (lane 54, docs/reports/census-0928/four-read.md "Finding 4b is wrong" ¶): --census must
// be build-census.mjs's own `--json` data file, never the `-census.md` markdown report it
// also writes. Handing four-read the markdown used to fail `JSON.parse` inside `loadJson`
// (:47) and get silently swallowed into "no census" (:787) — a check that passes because it
// isn't looking. These are the top-level keys every build-census version has written, Claude
// and Codex alike (scripts/build-census.mjs:1359-1390, :1558-1609). `stallNudges` is left out
// on purpose: pre-lane-38 censuses (before commit 1c41ce7) lack it, and four-read never reads
// it, so requiring it would refuse legitimate older census JSON (lane 54 r1, F-1).
const CENSUS_JSON_TOP_LEVEL_KEYS = ['lead', 'subagents', 'combined', 'marker', 'leadPath', 'tasksPaths', 'defaultSubagentsDir'];
export function isBuildCensusJsonShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!CENSUS_JSON_TOP_LEVEL_KEYS.every((k) => Object.prototype.hasOwnProperty.call(value, k))) return false;
  return !!value.lead && typeof value.lead === 'object' && !Array.isArray(value.lead);
}
export const CENSUS_REFUSAL_MESSAGE = 'four-read: --census must be the build-census --json data file, not the census markdown';
// Strict, LOUD read of the --census flag's own file, independent of loadJson's silent
// try/fallback (used elsewhere for optional inputs). A file that cannot be read at all, that
// is not valid JSON (the markdown case), or that parses but is not build-census's own shape,
// is refused the same way: exit 2, before buildFourRead runs and before any output is written.
export function validateCensusArg(fsImpl, filePath) {
  let raw;
  try { raw = fsImpl.readFileSync(filePath, 'utf8'); }
  catch (err) { return { ok: false, message: `four-read: --census file not found or unreadable: ${filePath} (${err && err.message ? err.message : err})` }; }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return { ok: false, message: CENSUS_REFUSAL_MESSAGE }; }
  if (!isBuildCensusJsonShape(parsed)) return { ok: false, message: CENSUS_REFUSAL_MESSAGE };
  return { ok: true };
}
export async function main(argv = process.argv.slice(2), { fsImpl = fs, write = (s) => console.log(s), writeErr = (s) => process.stderr.write(s) } = {}) {
  const opts = parseArgs(argv);
  const censusCheck = validateCensusArg(fsImpl, opts.census);
  if (!censusCheck.ok) { writeErr(`${censusCheck.message}\n`); return 2; }
  if (opts.specCensus) {
    const specCheck = validateCensusArg(fsImpl, opts.specCensus);
    if (!specCheck.ok) { writeErr(`${specCheck.message.replace('--census', '--spec-census')}\n`); return 2; }
  }
  const report = buildFourRead(opts, fsImpl);
  const wrote = [];
  if (opts.json) { fsImpl.writeFileSync(opts.json, `${formatJson(report)}\n`); wrote.push(opts.json); }
  const text = formatMarkdown(report);
  if (opts.out) { fsImpl.writeFileSync(opts.out, text.endsWith('\n') ? text : `${text}\n`); wrote.push(opts.out); }
  if (wrote.length) for (const p of wrote) write(`wrote: ${p}`);
  else write(text);
  return 0;
}
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const real = (p) => tryOr(() => fs.realpathSync(p), path.resolve(p));
  const canon = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  return canon(real(fileURLToPath(import.meta.url))) === canon(real(entry));
}
if (isMainModule()) {
  main().then((code) => process.exit(code), (err) => { process.stderr.write(`four-read: ${String(err && err.message ? err.message : err)}\n`); process.exit(1); });
}
