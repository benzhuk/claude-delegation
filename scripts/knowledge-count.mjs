#!/usr/bin/env node
// knowledge-count — the CLI the lead runs on each host before writing the knowledge goal's
// status line in docs/GOALS.md (spec.md Territory K3 item 1). Prints the same three counts as
// the SessionStart notice (scripts/goal-card.mjs's knowledge line) plus the inbox date range,
// through the one shared module (scripts/knowledge-counts.mjs) so the two can never disagree.
//
// node scripts/knowledge-count.mjs [--since <ISO>] [--json]
//
// node --test scripts/knowledge-count.test.mjs

import { homedir } from "node:os";
import { realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { knowledgeCounts, inboxDateRange, countReadsInWindow, READ_WINDOW_MS } from "./knowledge-counts.mjs";

export function parseArgs(argv) {
  const opts = { since: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--since") {
      opts.since = argv[++i];
      if (!opts.since) throw new Error("--since needs an ISO timestamp");
      if (Number.isNaN(Date.parse(opts.since))) throw new Error(`--since is not a parseable timestamp: ${opts.since}`);
    } else if (a === "--json") {
      opts.json = true;
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  return opts;
}

/**
 * The report both output shapes (text and `--json`) share: K2's counting rules (topics, pending,
 * reads) plus the inbox date range K3 item 1 additionally asks for ("the three counts of K2 plus
 * the inbox date range for this host"). Pure: no writes, never throws (an absent store reports
 * zeros, same as the SessionStart line's own "Absent store: no line" — here, "nothing to
 * report").
 *
 * @param {string} home
 * @param {number} now
 * @param {string|null} since  an ISO timestamp; when given, `reads` is recounted over
 *   `[since, now]` instead of the fixed 7-day window (a wider or narrower ad-hoc window for the
 *   lead's own inspection — the SessionStart line always uses the fixed window regardless).
 */
export function buildReport(home, now, since = null) {
  const counts = knowledgeCounts(home, now);
  const range = inboxDateRange(home);
  const sinceMs = since === null ? null : Date.parse(since);
  const windowStart = sinceMs === null ? now - READ_WINDOW_MS : sinceMs;
  const reads = sinceMs === null || !counts.storeExists
    ? counts.reads
    : countReadsInWindow(home, now, now - sinceMs);
  return {
    storeExists: counts.storeExists,
    topics: counts.topics,
    pending: counts.pending,
    oldest: range.oldest,
    newest: range.newest,
    reads,
    windowStart: new Date(windowStart).toISOString(),
    windowEnd: new Date(now).toISOString(),
  };
}

function formatText(report) {
  if (!report.storeExists) {
    return "knowledge store not found (no ~/.claude/knowledge)";
  }
  const lines = [];
  lines.push(`topics: ${report.topics}`);
  lines.push(
    `inbox pending: ${report.pending}`
    + (report.oldest ? ` (oldest ${report.oldest}, newest ${report.newest})` : ""),
  );
  lines.push(`reads: ${report.reads} (window ${report.windowStart} .. ${report.windowEnd})`);
  return lines.join("\n");
}

export async function main(argv = process.argv.slice(2), { homeDir = homedir(), now = Date.now(), write = (s) => console.log(s) } = {}) {
  const opts = parseArgs(argv);
  const report = buildReport(homeDir, now, opts.since);
  write(opts.json ? JSON.stringify(report, null, 2) : formatText(report));
  return 0;
}

/**
 * Only when RUN, never when imported — same win32-safe check every CLI in this repo uses
 * (`scripts/goal-card.mjs`, `scripts/token-census.mjs`).
 */
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const real = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  const canon = (p) => (process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p));
  const self = real(fileURLToPath(import.meta.url));
  const argv1 = real(entry);
  if (canon(self) === canon(argv1)) return true;
  return basename(argv1).toLowerCase() === basename(self).toLowerCase();
}

if (isMainModule()) {
  main().then(
    (code) => { process.exitCode = code; },
    (err) => {
      process.stderr.write(`knowledge-count: ${String(err && err.message ? err.message : err)}\n`);
      process.exitCode = 1;
    },
  );
}
