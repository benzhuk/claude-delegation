#!/usr/bin/env node
// four-read — prints the goal's four measures (docs/specs/2026-09-25-four-number-read.md,
// Territory R1) for one build. Every number prints a computed `value` or
// `unavailable (<reason>)` — never a guess. Parses the record's own fields itself
// (Lead-session:/Spec-session:/Spec-from: may not exist in scripts/work-record.mjs yet
// in this worktree) rather than importing that file — see docs/census.md.
//
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

// -> { fields: { opened, base, artifact, 'lead-session', 'spec-session', 'spec-from' },
//      logs: [{ at, status, owner, note }] }
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

function acceptedShaFrom(fields, note) {
  const fromNote = /artifact\s+([0-9a-f]{7,40})/i.exec(note || '');
  if (fromNote) return fromNote[1];
  return fields.artifact && fields.artifact.includes('@') ? fields.artifact.split('@')[1] : null;
}

// ── Small shared helpers ────────────────────────────────────────────────────

function tryOr(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function loadJson(fsImpl, filePath) {
  return filePath ? tryOr(() => JSON.parse(fsImpl.readFileSync(filePath, 'utf8')), null) : null;
}

function parseDateMs(s) {
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

function totalTokens(agg) {
  if (!agg) return 0;
  return (agg.input_tokens || 0) + (agg.cache_creation_input_tokens || 0) + (agg.cache_read_input_tokens || 0) + (agg.output_tokens || 0);
}

// ── Number 1 — top-tier tokens per build ────────────────────────────────────

function topTierModels() {
  return (process.env.DELEGATION_TOP_TIER || 'fable,opus').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function sumTopTier(combined, tiers) {
  const matched = Object.keys(combined || {}).filter((model) => tiers.some((t) => model.toLowerCase().includes(t)));
  return { total: matched.reduce((n, m) => n + totalTokens(combined[m]), 0), matched };
}

export function computeTopTierTokens(census, specCensus, fields) {
  if (!census) return { value: 'unavailable (no census)' };
  const tiers = topTierModels();
  const build = sumTopTier(census.combined, tiers);
  const buildPart = `build ${build.total}${build.matched.length ? ` (${build.matched.sort().join(', ')})` : ' (no top-tier model matched)'}`;
  if (specCensus) {
    const spec = sumTopTier(specCensus.combined, tiers);
    return { value: `${build.total + spec.total} tokens: ${buildPart} + spec slice ${spec.total}` };
  }
  const reason = fields['spec-session'] && fields['spec-from'] ? 'spec-census not run' : 'Spec-session:/Spec-from: missing from record';
  return { value: `${build.total} tokens: ${buildPart} (partial: no spec slice — ${reason})` };
}

// ── Lead-transcript timestamps — shared by numbers 2 and 4. Every JSONL line carrying a
// `timestamp` field counts as one "message", any role, so a gap can span roles. ────────

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

// gaps between consecutive entries; mode 'max' -> the single largest gap (or null), 'over'
// -> every gap strictly greater than thresholdMinutes.
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

export function computeHoursAskToAccepted(fields, logs, leadTimestamps) {
  const openedMs = parseDateMs(fields.opened);
  if (openedMs === null) return { value: 'unavailable (no Opened:)', openedMs: null, acceptedMs: null };
  const first = logs.find((l) => l.status.toLowerCase() === 'accepted');
  if (!first) return { value: 'unavailable (no accepted Log: entry)', openedMs, acceptedMs: null };
  const acceptedMs = parseDateMs(first.at);
  if (acceptedMs === null) return { value: 'unavailable (unparseable accepted Log: timestamp)', openedMs, acceptedMs: null };
  const hours = (acceptedMs - openedMs) / 3600000;
  let gapPart;
  if (leadTimestamps === null) {
    gapPart = 'gap unavailable (no lead transcript)';
  } else {
    const gap = gaps(leadTimestamps.filter((t) => t >= openedMs && t <= acceptedMs), 'max');
    gapPart = gap
      ? `largest gap ${gap.minutes.toFixed(1)}min at ${new Date(gap.startMs).toISOString()}`
      : 'gap unavailable (fewer than 2 lead messages in window)';
  }
  return { value: `${hours.toFixed(1)}h; ${gapPart}`, openedMs, acceptedMs };
}

// ── Number 3 — rework after acceptance: commits touching build files within 7 days of
// first acceptance, plus re-accept Log: entries after the first. Range Base:..accepted
// sha; unresolvable range -> unavailable (spec.md: "a record without a resolvable range
// gives unavailable (no range)"). ───────────────────────────────────────────────────────

function runGit(repoDir, args) {
  return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' });
}

export function computeReworkAfterAcceptance(fields, logs, gitDir, branch = 'HEAD') {
  const reaccepts = logs.filter((l) => l.status.toLowerCase() === 'accepted').slice(1);
  const reacceptPart = reaccepts.length
    ? `${reaccepts.length} re-accept Log: entr${reaccepts.length === 1 ? 'y' : 'ies'} after the first: ${reaccepts.map((l) => `${l.at} ${l.note}`).join('; ')}`
    : '0 re-accept Log: entries after the first';
  const first = logs.find((l) => l.status.toLowerCase() === 'accepted');
  const acceptedSha = first ? acceptedShaFrom(fields, first.note) : null;
  if (!fields.base || !acceptedSha || !gitDir) return { value: 'unavailable (no range)' };
  try {
    const changed = runGit(gitDir, ['diff', '--name-only', `${fields.base}..${acceptedSha}`]).split('\n').map((s) => s.trim()).filter(Boolean);
    if (!changed.length) return { value: 'unavailable (no range)' };
    const acceptedMs = parseDateMs(first.at);
    const untilIso = acceptedMs === null ? null : new Date(acceptedMs + 7 * 24 * 3600000).toISOString();
    const args = ['log', '--no-merges', `--since=${first.at}`, ...(untilIso ? [`--until=${untilIso}`] : []),
      '--pretty=%H%x1f%s', `${acceptedSha}..${branch}`, '--', ...changed];
    const commits = runGit(gitDir, args).split('\n').filter(Boolean)
      .map((l) => { const [sha, subject] = l.split('\x1f'); return { sha, subject }; })
      .filter((c) => !/^release\b/i.test(c.subject)); // release commits are not rework
    const commitPart = commits.length
      ? `${commits.length} commit(s) touching build files within 7 days: ${commits.map((c) => `${c.sha.slice(0, 7)} "${c.subject}"`).join(', ')}`
      : '0 commits touching build files within 7 days';
    return { value: `${commitPart}; ${reacceptPart}` };
  } catch (e) {
    return { value: `unavailable (git: ${e.message.split('\n')[0]})` };
  }
}

// ── Ledger parsing — shared by number 4 and the "notes to the lead" companion line.
// Line shape: `<from> → <to>, M.D.YY HH:MM TZ [<id>( re <parent-id>)?] KIND: text` ─────

const LEDGER_LINE_RE = /^(\S+)\s+→\s+(\S+),\s+(\d{1,2}\.\d{1,2}\.\d{2,4})\s+(\d{1,2}:\d{2})\s+(\S+)\s+\[([^\]]+)\]\s+(ASK|RESULT|BLOCKED|ACK|FYI):/;

// September 2026 ledger dates are all America/New_York EDT (UTC-4); see docs/census.md.
function ledgerTimestampMs(date, time) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(date);
  if (!m) return null;
  let [, mo, da, yr] = m;
  if (yr.length === 2) yr = `20${yr}`;
  const ms = Date.parse(`${yr}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}T${time}:00-04:00`);
  return Number.isNaN(ms) ? null : ms;
}

function parseLedgerLine(line) {
  const m = LEDGER_LINE_RE.exec(line);
  if (!m) return null;
  const [, from, to, date, time, tz, bracket, kind] = m;
  const [idRaw, reRaw] = bracket.split(/\s+re\s+/);
  return { from, to, tz, id: idRaw.trim(), re: reRaw ? reRaw.trim() : null, kind, ms: ledgerTimestampMs(date, time) };
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

// ── Number 4 — work lost or stalled: gaps over 30min, plus unanswered ASKs to the lead ──

export function computeWorkLostOrStalled(leadTimestamps, ledgerEntries, leadSlug, { openedMs, acceptedMs }) {
  if (openedMs === null) return { value: 'unavailable (no Opened:)' };
  if (acceptedMs === null) return { value: 'unavailable (no accepted Log: entry)' };
  let gapPart;
  if (leadTimestamps === null) {
    gapPart = 'gaps unavailable (no lead transcript)';
  } else {
    const over30 = gaps(leadTimestamps.filter((t) => t >= openedMs && t <= acceptedMs), 'over', 30);
    gapPart = over30.length
      ? `${over30.length} gap(s) over 30min: ${over30.map((g) => `${new Date(g.startMs).toISOString()} (${g.minutes.toFixed(1)}min)`).join(', ')}`
      : '0 gaps over 30min';
  }
  let askPart;
  if (!leadSlug) {
    askPart = 'ASKs unavailable (no --lead-slug)';
  } else if (ledgerEntries === null) {
    askPart = 'ASKs unavailable (no ledger dir)';
  } else {
    const asks = ledgerInWindow(ledgerEntries, ['ASK'], leadSlug, openedMs, acceptedMs);
    const answered = new Set(ledgerEntries.filter((e) => (e.kind === 'RESULT' || e.kind === 'BLOCKED') && e.re).map((e) => e.re));
    const unanswered = asks.filter((e) => !answered.has(e.id));
    askPart = unanswered.length
      ? `${unanswered.length} unanswered ASK(s) to ${leadSlug}: ${unanswered.map((e) => e.id).join(', ')}`
      : `0 unanswered ASKs to ${leadSlug}`;
  }
  return { value: `${gapPart}; ${askPart}` };
}

// ── Companion lines (item 5) — printed beside the four, not part of the count itself ───

function computeNotesToLead(ledgerEntries, leadSlug, { openedMs, acceptedMs }) {
  if (!leadSlug) return { value: 'unavailable (no --lead-slug)' };
  if (ledgerEntries === null) return { value: 'unavailable (no ledger dir)' };
  if (openedMs === null || acceptedMs === null) return { value: 'unavailable (no Opened:/accepted window)' };
  const notes = ledgerInWindow(ledgerEntries, ['ASK', 'RESULT', 'BLOCKED'], leadSlug, openedMs, acceptedMs);
  return { value: `${notes.length} note(s) to ${leadSlug}: ${notes.map((e) => `${e.kind} ${e.id}`).join(', ') || '(none)'}` };
}

// ── Orchestration ────────────────────────────────────────────────────────────

export function buildFourRead(opts, fsImpl = fs) {
  const { fields, logs } = parseRecordText(fsImpl.readFileSync(opts.record, 'utf8'));
  let leadSessionId = fields['lead-session'] || null;
  let leadSessionSource = leadSessionId ? 'record' : null;
  if (!leadSessionId && opts.leadSession) {
    leadSessionId = opts.leadSession;
    leadSessionSource = 'cli';
  }

  const census = loadJson(fsImpl, opts.census);
  const specCensus = loadJson(fsImpl, opts.specCensus);
  const leadPath = census && census.leadPath ? census.leadPath : null;
  const leadTimestamps = leadPath ? scanTimestamps(fsImpl, leadPath) : null;
  const ledgerEntries = opts.ledger ? collectLedgerEntries(opts.ledger, fsImpl) : null;

  const numberOne = computeTopTierTokens(census, specCensus, fields);
  const numberTwo = computeHoursAskToAccepted(fields, logs, leadTimestamps);
  const windowMs = { openedMs: numberTwo.openedMs, acceptedMs: numberTwo.acceptedMs };
  const numberThree = computeReworkAfterAcceptance(fields, logs, opts.git, opts.branch || 'HEAD');
  const numberFour = computeWorkLostOrStalled(leadTimestamps, ledgerEntries, opts.leadSlug, windowMs);
  const notesToLead = computeNotesToLead(ledgerEntries, opts.leadSlug, windowMs);
  const leadSessionNotes = {
    cli: 'id came from --lead-session on the command line; the census file names the lead session file it read',
    record: "from the record's Lead-session: field",
    unavailable: 'no Lead-session: field and no --lead-session given',
  };
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
      { key: 'topTierAssistantMessagesPerBuild', label: 'Top-tier assistant messages per build', value: 'unavailable (build-census.mjs reports token sums by model, not per-model message counts)' },
      { key: 'notesToLeadPerBuild', label: 'Notes to the lead per build', value: notesToLead.value },
    ],
  };
}

// ── Output formatting — deterministic JSON (sorted keys) and a markdown table ─────────

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

// ── CLI ──────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const opts = { record: null, census: null, specCensus: null, ledger: null, git: null, branch: 'HEAD', leadSession: null, leadSlug: null, out: null, json: null };
  const need = (flag) => {
    const v = argv[++i];
    if (!v) throw new Error(`${flag} needs a value`);
    return v;
  };
  let i;
  for (i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--record') opts.record = need('--record');
    else if (a === '--census') opts.census = need('--census');
    else if (a === '--spec-census') opts.specCensus = need('--spec-census');
    else if (a === '--ledger') opts.ledger = need('--ledger');
    else if (a === '--git') opts.git = need('--git');
    else if (a === '--branch') opts.branch = need('--branch');
    else if (a === '--lead-session') opts.leadSession = need('--lead-session');
    else if (a === '--lead-slug') opts.leadSlug = need('--lead-slug');
    else if (a === '--out') opts.out = need('--out');
    else if (a === '--json') opts.json = need('--json');
    else throw new Error(`unknown argument: ${a}`);
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
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`four-read: ${String(err && err.message ? err.message : err)}\n`);
      process.exit(1);
    },
  );
}
