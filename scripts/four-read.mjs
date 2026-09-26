#!/usr/bin/env node
// four-read — prints the goal's four measures (docs/specs/2026-09-25-four-number-read.md,
// Territory R1) for one build. Every number prints a computed `value` or
// `unavailable (<reason>)` — never a guess. Parses the record's own fields itself (fields
// may not exist in work-record.mjs in this worktree yet) rather than importing it — see docs/census.md.
// node scripts/four-read.mjs --record <record.md> --census <census.json>
//   [--spec-census <json>] [--ledger docs/ledger] [--git <repo>] [--branch <ref>]
//   [--lead-session <id>] [--lead-slug <slug>] [--out <path>] [--json <path>]
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
// MINOR 9: Artifact: is the CURRENT artifact — wrong once a re-accept overwrote it, so the
// fallback is only safe with a single accepted entry.
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
  if (specCensus) {
    const spec = sumTopTier(specCensus.combined, tiers);
    return { value: `${build.total + spec.total} tokens: ${buildPart} + spec slice ${spec.total}` };
  }
  const reason = fields['spec-session'] && fields['spec-from'] ? 'spec-census not run' : 'Spec-session:/Spec-from: missing from record';
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
    const g = { startMs: msList[i - 1], minutes };
    if (mode === 'over' && minutes > thresholdMinutes) out.push(g);
    else if (mode === 'max' && (!best || minutes > best.minutes)) best = g;
  }
  return mode === 'max' ? best : out;
}
// ── Number 2 — hours ask to accepted, plus the largest gap inside that window ──────────
// leadGapReason (MAJOR 1): why leadTimestamps is null, printed when it's the lead-session
// mismatch rather than a plain missing transcript.
export function computeHoursAskToAccepted(fields, logs, leadTimestamps, leadGapReason) {
  const openedMs = parseDateMs(fields.opened);
  if (openedMs === null) return { value: 'unavailable (no Opened:)', openedMs: null, acceptedMs: null, rawAcceptedMs: null, reason: 'no Opened:' };
  const first = logs.find((l) => l.status.toLowerCase() === 'accepted');
  if (!first) return { value: 'unavailable (no accepted Log: entry)', openedMs, acceptedMs: null, rawAcceptedMs: null, reason: 'no accepted Log: entry' };
  const acceptedMs = parseDateMs(first.at);
  if (acceptedMs === null) return { value: 'unavailable (unparseable accepted Log: timestamp)', openedMs, acceptedMs: null, rawAcceptedMs: null, reason: 'unparseable accepted Log: timestamp' };
  // MAJOR 4: first Log: is itself the first accepted -> no earlier entry ever recorded;
  // 0.0h would be a confident non-answer. rawAcceptedMs keeps the real ts for BLOCKER 1(b).
  if (logs.indexOf(first) === 0) {
    const reason = 'record opened at acceptance: no Log: entry before the first accepted';
    return { value: `unavailable (${reason})`, openedMs, acceptedMs: null, rawAcceptedMs: acceptedMs, reason };
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
  return { value: `${hours.toFixed(1)}h; ${gapPart}`, openedMs, acceptedMs, rawAcceptedMs: acceptedMs };
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
export function computeWorkLostOrStalled(leadTimestamps, ledgerEntries, leadSlug, { openedMs, acceptedMs, reason }, leadGapReason) {
  if (openedMs === null) return { value: 'unavailable (no Opened:)' };
  if (acceptedMs === null) return { value: `unavailable (${reason || 'no accepted Log: entry'})` }; // MAJOR 4
  let gapPart;
  if (leadTimestamps === null) {
    gapPart = `gaps unavailable (${leadGapReason || 'no lead transcript'})`;
  } else {
    // BLOCKER 2: fewer than 2 in-window messages must not print a confident "0 gaps".
    const inWindow = leadTimestamps.filter((t) => t >= openedMs && t <= acceptedMs);
    const over30 = inWindow.length < 2 ? null : gaps(inWindow, 'over', 30);
    gapPart = over30 === null ? 'gaps unavailable (fewer than 2 lead messages in window)'
      : over30.length
        ? `${over30.length} gap(s) over 30min: ${over30.map((g) => `${new Date(g.startMs).toISOString()} (${g.minutes.toFixed(1)}min)`).join(', ')}`
        : '0 gaps over 30min';
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
  const ledgerEntries = opts.ledger ? collectLedgerEntries(opts.ledger, fsImpl) : null;
  const numberTwo = computeHoursAskToAccepted(fields, logs, leadTimestamps, leadGapReason);
  const windowMs = { openedMs: numberTwo.openedMs, acceptedMs: numberTwo.acceptedMs, reason: numberTwo.reason };
  const acceptedLogs = logs.filter((l) => l.status.toLowerCase() === 'accepted');
  const lastAcceptedMs = (acceptedLogs.length ? parseDateMs(acceptedLogs[acceptedLogs.length - 1].at) : null) ?? windowMs.acceptedMs; // unparseable last -> the tighter first bound
  // BLOCKER 1 (r2): an unchecked window says so; BLOCKER 1(b)/MAJOR 1/2 (r3): refuse with Number 2.
  const numberOne = leadGapReason && leadSessionId ? { value: `unavailable (${leadGapReason})` } // the census read another session
    : windowMs.openedMs === null || windowMs.acceptedMs === null ? { value: `unavailable (${numberTwo.reason}: census window cannot be checked)` }
    : computeTopTierTokens(census, specCensus, fields, windowMs.openedMs, windowMs.acceptedMs, lastAcceptedMs);
  const numberThree = computeReworkAfterAcceptance(fields, logs, opts.git, opts.branch || 'HEAD');
  const numberFour = computeWorkLostOrStalled(leadTimestamps, ledgerEntries, opts.leadSlug, windowMs, leadGapReason);
  const notesToLead = computeNotesToLead(ledgerEntries, opts.leadSlug, windowMs);
  const topTierMessages = computeTopTierMessages(fsImpl, census, leadPath, leadGapReason, windowMs.openedMs, windowMs.acceptedMs, numberOne.value);
  const leadSessionNotes = { cli: 'id came from --lead-session on the command line; the census file names the lead session file it read', record: "from the record's Lead-session: field", unavailable: 'no Lead-session: field and no --lead-session given' };
  return {
    record: opts.record,
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
const ARG_FLAGS = { '--record': 'record', '--census': 'census', '--spec-census': 'specCensus', '--ledger': 'ledger', '--git': 'git', '--branch': 'branch', '--lead-session': 'leadSession', '--lead-slug': 'leadSlug', '--out': 'out', '--json': 'json' };
export function parseArgs(argv) {
  const opts = { record: null, census: null, specCensus: null, ledger: null, git: null, branch: 'HEAD', leadSession: null, leadSlug: null, out: null, json: null };
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
