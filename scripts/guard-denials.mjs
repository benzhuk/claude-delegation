// guard-denials — reads the secret guard's denial log and counts refusals inside a build window,
// grouped by pattern name (lane 68, census68; docs/specs/secret-guard-60/spec.md Phase 1;
// docs/census.md "Guard denials"). Pure functions: the filesystem, home, environment and host
// name are all injected, nothing runs at import time, and nothing is ever written.
//
// Log line (tab separated): 1 UTC ISO timestamp, 2 hook phase, 3 tool name, 4 matched pattern
// NAME, 5 command text. This reader takes fields 1 to 4 ONLY. Field 5 is never sliced, kept,
// printed or returned: the scan stops at the fourth tab. The log is per machine and carries no
// session id, so "per build" is the time window Opened..last accepted Log line, on the host the
// census runs on. A missing log, an unreadable log, or the guard's own off switch reads
// `unavailable (<reason>)`, never 0.
import fs from 'node:fs';
import path from 'node:path';

const STRICT_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
// A pattern NAME is an identifier. Anything else in field 4 means the line is not the shape the
// guard writes, so it is skipped rather than echoed into a report.
const PATTERN_NAME_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

/** `$XDG_STATE_HOME/secret-guard/denials.log` when set, else `<home>/.local/state/secret-guard/denials.log`. */
export function denialsLogPath(home, env = {}) {
  const xdg = env && typeof env.XDG_STATE_HOME === 'string' && env.XDG_STATE_HOME.trim() !== '' ? env.XDG_STATE_HOME : null;
  return xdg ? path.join(xdg, 'secret-guard', 'denials.log') : path.join(home, '.local', 'state', 'secret-guard', 'denials.log');
}

/** The guard's own off switch (secret-guard-60 Phase 1): while present, nothing is logged. */
export function guardLogOffSwitchPath(home) {
  return path.join(home, '.agents', 'ws-off-guard-log');
}

// Fields 1 to 4 of one line, or null. Walks to the fourth tab and stops: field 5 is not read.
function parseFields1to4(line) {
  const t1 = line.indexOf('\t');
  if (t1 < 0) return null;
  const t2 = line.indexOf('\t', t1 + 1);
  if (t2 < 0) return null;
  const t3 = line.indexOf('\t', t2 + 1);
  if (t3 < 0) return null;
  const t4 = line.indexOf('\t', t3 + 1);
  const stamp = line.slice(0, t1);
  const pattern = line.slice(t3 + 1, t4 < 0 ? line.length : t4);
  if (!STRICT_UTC_RE.test(stamp) || !PATTERN_NAME_RE.test(pattern)) return null;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? null : { ms, pattern };
}

function readText(fsImpl, file) {
  try { return { text: fsImpl.readFileSync(file, 'utf8') }; }
  catch (err) { return { error: err && err.code ? String(err.code) : 'read failed' }; }
}

/**
 * Counts denials with fromMs <= timestamp <= toMs, by pattern name.
 * @returns {{ available: true, total: number, byPattern: Record<string, number>, skipped: number, host: string }
 *   | { available: false, reason: string }}
 */
export function readGuardDenials({ fsImpl = fs, home, env = {}, fromMs, toMs, host = 'unknown host' } = {}) {
  if (typeof home !== 'string' || home === '') return { available: false, reason: 'no home directory' };
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return { available: false, reason: 'no build window' };
  const offSwitch = guardLogOffSwitchPath(home);
  let offSwitchPresent = false;
  try { offSwitchPresent = fsImpl.existsSync(offSwitch); } catch { offSwitchPresent = false; }
  if (offSwitchPresent) return { available: false, reason: 'guard log off switch ~/.agents/ws-off-guard-log is present' };
  const logPath = denialsLogPath(home, env);
  const current = readText(fsImpl, logPath);
  if (current.error) {
    return { available: false, reason: current.error === 'ENOENT' ? 'no denials log on this host' : `denials log unreadable (${current.error})` };
  }
  // The one rotated generation. Absent is normal; present but unreadable would make the count a
  // partial one, so that is unavailable rather than a smaller number.
  const rotated = readText(fsImpl, `${logPath}.1`);
  if (rotated.error && rotated.error !== 'ENOENT') return { available: false, reason: `rotated denials log unreadable (${rotated.error})` };
  const byPattern = {};
  let total = 0;
  let skipped = 0;
  for (const text of [rotated.text, current.text]) {
    if (text === undefined) continue;
    for (const raw of text.split('\n')) {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      if (line === '') continue;
      const f = parseFields1to4(line);
      if (!f) { skipped += 1; continue; }
      if (f.ms < fromMs || f.ms > toMs) continue;
      byPattern[f.pattern] = (byPattern[f.pattern] || 0) + 1;
      total += 1;
    }
  }
  return { available: true, total, byPattern, skipped, host };
}

/** `7 on <host> (secret_path_default_deny 4, env_dump 3)`, `, skipped N` when lines were malformed. */
export function formatGuardDenials(result) {
  if (!result || !result.available) return `unavailable (${result && result.reason ? result.reason : 'no result'})`;
  const parts = Object.entries(result.byPattern).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([name, n]) => `${name} ${n}`);
  return `${result.total} on ${result.host}${parts.length ? ` (${parts.join(', ')})` : ''}${result.skipped ? `, skipped ${result.skipped}` : ''}`;
}

/** Window helper for four-read: the companion row's value. */
export function guardDenialsValue({ fsImpl = fs, home, env, host, openedMs, lastAcceptedMs, reason } = {}) {
  if (openedMs === null || openedMs === undefined) return 'unavailable (no Opened:)';
  if (lastAcceptedMs === null || lastAcceptedMs === undefined) return `unavailable (${(reason || 'no accepted Log: entry').replace(/:$/, '')})`;
  return formatGuardDenials(readGuardDenials({ fsImpl, home, env, fromMs: openedMs, toMs: lastAcceptedMs, host }));
}
