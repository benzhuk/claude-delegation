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
function topTierModels() { return (process.env.DELEGATION_TOP_TIER || 'fable,opus').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean); }
// ── Number 1 — top-tier tokens per build ────────────────────────────────────
// matched models + total, and (MAJOR 5) the same sums split into the four raw fields.
function sumTopTier(combined, tiers) {
  const matched = Object.keys(combined || {}).filter((model) => tiers.some((t) => model.toLowerCase().includes(t)));
  const split = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  for (const m of matched) {
    const a = combined[m] || {};
    split.input += a.input_tokens || 0; split.cacheWrite += a.cache_creation_input_tokens || 0;
    split.cacheRead += a.cache_read_input_tokens || 0; split.output += a.output_tokens || 0;
  }
  return { total: matched.reduce((n, m) => n + totalTokens(combined[m]), 0), matched, split };
}
// BLOCKER 1(b): reject a census whose window doesn't match this build's own window.
export function computeTopTierTokens(census, specCensus, fields, openedMs = null, acceptedMs = null, lastAcceptedMs = null) {
  if (!census) return { value: 'unavailable (no census)' };
  if (!census.combined) return { value: 'unavailable (census has no combined by-model sums)' };
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
  const tiers = topTierModels();
  const build = sumTopTier(census.combined, tiers);
  const buildPart = `build ${build.total}${build.matched.length ? ` (${build.matched.sort().join(', ')})` : ' (no top-tier model matched)'}`;
  if (specCensus) { // r1 BLOCKER 1's twin: the spec slice is Spec-session's Spec-from:..Opened:, checked like the census
    const sl = specCensus.lead || {}, sFrom = parseDateMs(fields['spec-from']), sStart = parseDateMs(sl.windowStartAt), sEnd = parseDateMs(sl.windowEndAt);
    const sFile = specCensus.leadPath ? path.basename(specCensus.leadPath).replace(/\.jsonl$/i, '') : null;
    if (!specCensus.combined || sFile !== fields['spec-session'] || [sFrom, sStart, sEnd, openedMs].includes(null) || sStart < sFrom - tolerance || sEnd > openedMs + tolerance) return { value: `${build.total} tokens: ${buildPart}; partial (no spec slice): spec-census is not Spec-session:'s Spec-from:..Opened: window` };
    const spec = sumTopTier(specCensus.combined, tiers);
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
// trio — TaskStop is a tool_use too). tool_result items are kept whole, not just
// tool_use_id, so R7's direct-subagent end-bound match can read a real (untrimmed)
// transcript's own agent-id field if one exists; the committed trimmed fixtures never carry
// one, so that match always falls through to the window end there (see docs/census.md).
export function scanLeadToolEvents(fsImpl, filePath) {
  const text = tryOr(() => fsImpl.readFileSync(filePath, 'utf8'), null);
  if (text === null) return null;
  const toolUses = []; // {ms, name, id}
  const toolResults = []; // {ms, item}
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const obj = tryOr(() => JSON.parse(line), null);
    if (!obj) continue;
    const ms = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
    if (Number.isNaN(ms)) continue;
    const content = obj.message && Array.isArray(obj.message.content) ? obj.message.content : [];
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'tool_use' && item.id) toolUses.push({ ms, name: item.name, id: item.id });
      else if (item.type === 'tool_result' && item.tool_use_id) toolResults.push({ ms, item });
    }
  }
  return { toolUses, toolResults };
}
function firstToolResultMs(toolResults, id) {
  let found = null;
  for (const r of toolResults) if (r.item.tool_use_id === id && (found === null || r.ms < found)) found = r.ms;
  return found;
}
// R6 Spans: literal for Agent/Task (tool_use ts -> its own tool_result ts, else window end).
// Workflow is different BY EVIDENCE, not by guess: in both committed fixtures (lane10,
// lane16) the Workflow tool_use's OWN tool_result returns in under a second while its
// dispatched builders/reviewers keep running for up to ~80 more minutes (see
// scripts/fixtures/four-read/sessions/*/*/subagents/workflows/*/agent-*.jsonl) — that quick
// result is a dispatch ack, not completion. So a Workflow span instead runs to the first
// LATER lead `TaskStop` tool_use (the same signal R7 uses for a Workflow agent's own end
// bound), or to the window end when no TaskStop follows it. This is a deviation from R6's
// one-line wording, needed to make lane16 read 0 stalled/1 waiting-on-agents (41.8min) as
// contracts.md's Facts section pins — flagged here and in the F2 report.
export function buildAgentSpans(toolUses, toolResults, windowEndMs) {
  const taskStopMs = toolUses.filter((t) => t.name === 'TaskStop').map((t) => t.ms).sort((a, b) => a - b);
  const spans = [];
  for (const t of toolUses) {
    if (!SPAN_TOOL_NAMES.has(t.name)) continue;
    let end;
    if (t.name === 'Workflow') {
      const later = taskStopMs.find((ms) => ms > t.ms);
      end = later !== undefined ? later : windowEndMs;
    } else {
      const resultMs = firstToolResultMs(toolResults, t.id);
      end = resultMs !== null ? resultMs : windowEndMs;
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
// never carry one, so this always falls to the window end there); a Workflow agent's is the
// first lead TaskStop after the file's last timestamp, else the Workflow tool_result, else
// the window end.
function subagentEndBound(isWorkflow, agentId, fileLastMs, toolUses, toolResults, windowEndMs) {
  if (!isWorkflow) {
    for (const r of toolResults) if (r.item.agentId === agentId || r.item.agent_id === agentId) return r.ms;
    return windowEndMs;
  }
  const taskStopAfter = toolUses.filter((t) => t.name === 'TaskStop' && t.ms > fileLastMs).map((t) => t.ms).sort((a, b) => a - b);
  if (taskStopAfter.length) return taskStopAfter[0];
  const workflowUse = toolUses.find((t) => t.name === 'Workflow');
  if (workflowUse) {
    const resultMs = firstToolResultMs(toolResults, workflowUse.id);
    if (resultMs !== null) return resultMs;
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
      const minutes = (endBound - last) / 60000;
      if (minutes > 30) stalls.push({ id: f.id, atMs: last, minutes });
    }
  }
  return { stalls, unreadableIds };
}
// ── Number 2 — hours ask to accepted, plus the largest gap inside that window ──────────
// leadGapReason (MAJOR 1): why leadTimestamps is null (a lead-session mismatch, not a missing transcript).
export function computeHoursAskToAccepted(fields, logs, leadTimestamps, leadGapReason) {
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
      ? `largest gap ${gap.minutes.toFixed(1)}min at ${new Date(gap.startMs).toISOString()}`
      : 'gap unavailable (fewer than 2 lead messages in window)';
  }
  return { value: `${hours.toFixed(1)}h; ${gapPart}`, openedMs, acceptedMs };
}
// ── Number 3 — rework after acceptance ──────────────────────────────────────────────────
function runGit(repoDir, args) { return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' }); }
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
function ledgerHasSlug(entries, leadSlug) { return entries.some((e) => e.from === leadSlug || e.to === leadSlug); }
// ── Number 4 — work lost or stalled. leadGapReason (MAJOR 1): see computeHoursAskToAccepted.
// `spans` (R6, a merged union of [start,end] Agent/Task/Workflow intervals from
// buildAgentSpans+mergeSpans) and `agentResults` (R7, {stalls, unreadableIds} from
// collectSubagentStalls) are both precomputed by the caller (buildFourRead) and may be null
// when unavailable; the fewer-than-2-messages and no-lead-transcript wordings are kept
// exactly as before (R6 says to keep the former) and never fold in R7's agent stalls, since
// neither case can even locate the lead's own session file to derive a subagents/ dir from.
export function computeWorkLostOrStalled(leadTimestamps, ledgerEntries, leadSlug, { openedMs, acceptedMs, reason }, leadGapReason, spans = null, agentResults = null) {
  if (openedMs === null) return { value: 'unavailable (no Opened:)' };
  if (acceptedMs === null) return { value: `unavailable (${reason || 'no accepted Log: entry'})` }; // MAJOR 4
  let gapPart;
  if (leadTimestamps === null) {
    gapPart = `gaps unavailable (${leadGapReason || 'no lead transcript'})`;
  } else {
    // BLOCKER 2: fewer than 2 in-window messages must not print a confident "0 gaps".
    const inWindow = leadTimestamps.filter((t) => t >= openedMs && t <= acceptedMs);
    const over30 = inWindow.length < 2 ? null : gaps(inWindow, 'over', 30);
    if (over30 === null) {
      gapPart = 'gaps unavailable (fewer than 2 lead messages in window)'; // R6: keep this wording
    } else {
      const union = spans || [];
      const leadStalled = []; // outside the union, over 30min alone (R6 Splitting)
      const waiting = []; // inside the union, any length
      for (const g of over30) {
        const { insidePieces, outsidePieces } = splitGapByUnion(g.startMs, g.endMs, union);
        for (const p of outsidePieces) if (p.minutes > 30) leadStalled.push(p);
        for (const p of insidePieces) waiting.push(p);
      }
      const agentStalls = (agentResults && agentResults.stalls) || [];
      const unreadableIds = (agentResults && agentResults.unreadableIds) || [];
      const n = leadStalled.length + agentStalls.length; // R6 Line: "N counts lead stalled pieces plus agent stalls"
      const waitingMinutes = waiting.reduce((sum, p) => sum + p.minutes, 0);
      const stalledList = leadStalled.map((p) => `${new Date(p.startMs).toISOString()} (${p.minutes.toFixed(1)}min)`).join(', ');
      const agentLines = [
        ...agentStalls.map((a) => `agent ${a.id} silent ${a.minutes.toFixed(1)} min from ${new Date(a.atMs).toISOString()}`), // R7 Output
        ...unreadableIds.map((id) => `agent ${id} unreadable timestamps`),
      ];
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
function computeTopTierMessages(fsImpl, census, leadPath, leadGapReason, openedMs, acceptedMs, numberOneValue) {
  if (numberOneValue.startsWith('unavailable')) return { value: numberOneValue };
  const tiers = topTierModels();
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
  // MAJOR 1: only trust the transcript when Lead-session:/--lead-session actually names the
  // file the census read — a wrong/missing session must not silently produce numbers.
  const leadFileId = leadPath ? path.basename(leadPath).replace(/\.jsonl$/i, '') : null;
  const leadGapReason = !leadSessionId ? 'no Lead-session:'
    : leadFileId && leadFileId !== leadSessionId ? `census lead file ${leadFileId} is not Lead-session ${leadSessionId}` : null;
  const leadTimestamps = leadPath && !leadGapReason ? scanTimestamps(fsImpl, leadPath) : null;
  // R6/R7: the same lead file's own Agent/Task/Workflow/TaskStop tool events, read once and
  // reused for both the lead-gap union (R6) and the subagent-file scan (R7).
  const leadToolEvents = leadPath && !leadGapReason ? scanLeadToolEvents(fsImpl, leadPath) : null;
  const ledgerEntries = opts.ledger ? collectLedgerEntries(opts.ledger, fsImpl) : null;
  const numberTwo = computeHoursAskToAccepted(fields, logs, leadTimestamps, leadGapReason);
  const windowMs = { openedMs: numberTwo.openedMs, acceptedMs: numberTwo.acceptedMs, reason: numberTwo.reason };
  const agentSpans = (leadToolEvents && windowMs.acceptedMs !== null)
    ? mergeSpans(buildAgentSpans(leadToolEvents.toolUses, leadToolEvents.toolResults, windowMs.acceptedMs))
    : null;
  const agentStallResults = (leadToolEvents && leadFileId && windowMs.openedMs !== null && windowMs.acceptedMs !== null)
    ? collectSubagentStalls(fsImpl, leadPath, leadFileId, windowMs.openedMs, windowMs.acceptedMs, leadToolEvents.toolUses, leadToolEvents.toolResults)
    : null;
  const acceptedLogs = logs.filter((l) => l.status.toLowerCase() === 'accepted');
  const lastAcceptedMs = (acceptedLogs.length ? parseDateMs(acceptedLogs[acceptedLogs.length - 1].at) : null) ?? windowMs.acceptedMs; // unparseable last -> the tighter first bound
  // BLOCKER 1 (r2): an unchecked window says so; BLOCKER 1(b)/MAJOR 1/2 (r3): refuse with Number 2.
  const numberOne = leadGapReason && leadSessionId ? { value: `unavailable (${leadGapReason})` } // the census read another session
    : windowMs.openedMs === null || windowMs.acceptedMs === null ? { value: `unavailable (${numberTwo.reason.replace(/:$/, '')}: census window cannot be checked)` } // MINOR 3 (r4): no doubled colon
    : computeTopTierTokens(census, specCensus, fields, windowMs.openedMs, windowMs.acceptedMs, lastAcceptedMs);
  const numberThree = computeReworkAfterAcceptance(fields, logs, opts.git, opts.branch || 'HEAD');
  const numberFour = computeWorkLostOrStalled(leadTimestamps, ledgerEntries, opts.leadSlug, windowMs, leadGapReason, agentSpans, agentStallResults);
  const notesToLead = computeNotesToLead(ledgerEntries, opts.leadSlug, windowMs);
  const topTierMessages = computeTopTierMessages(fsImpl, census, leadPath, leadGapReason, windowMs.openedMs, windowMs.acceptedMs, numberOne.value);
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
export async function main(argv = process.argv.slice(2), { fsImpl = fs, write = (s) => console.log(s) } = {}) {
  const opts = parseArgs(argv);
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
