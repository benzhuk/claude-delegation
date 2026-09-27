#!/usr/bin/env node
// collect-status — lane twenty-one (docs/specs/collect-status-1/spec.md's "C1: collect-status.mjs").
// Runs collect-from-origin IN PROCESS (import, never shell out to it) against --repo, then writes
// ONE status directory the lead reads once per wave, instead of the lead answering one lane event
// at a time. Judgment stays with the lead; this collector judges nothing beyond the mechanical
// attention rules spec.md names.
//
// Writes, atomically, under --out (default ~/.agents/collect/<basename of --repo>/):
//   status.json   - generatedAt, host, repo, fetch, main {ref, sha}, rows, summary {byState,
//                    attention}, changeKey (this run's change key), announced (last key a note
//                    was attempted for)
//   status.md     - the same, human-readable, at most 60 lines (header, attention, the table
//                    formatTable already prints)
//   previous.json - the prior status.json, moved aside with a rename (never a copy) before the
//                    new status.json is written
//
// Change detection: a change key is the sorted set of (branch, recordPath, state, tipSha). Equal
// to the last ANNOUNCED key (status.json `announced`, not merely the previous run's `changeKey`:
// a failed fetch still records a `changeKey` for its own run but must not move `announced`, or the
// change it saw would never be announced by a later good run) -> no note, silent exit 0. Different
// (or no previous status.json at all) -> exactly one note-send call, unless the fetch itself failed
// (a failed fetch never wakes anyone), the --main ref does not resolve (no real state to report),
// or --quiet / a missing note-send binary / a missing --to suppress the actual send (the run still
// counts the key as "announced" in those last three cases: they are operator/config conveniences,
// not a reason to re-send once they are fixed).
//
// node scripts/collect-status.mjs [--repo <dir>] [--main <ref>] [--no-fetch] [--skip <name>]...
//   [--out <dir>] [--to <slug>] [--host <name>] [--merge-hours <n>=4] [--stale-hours <n>=6] [--quiet]

import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { main as collectFromOriginMain, fullRef, refExists, formatTable } from "./collect-from-origin.mjs";
import { assertFieldSafe } from "../skills/multi/scripts/envelope.mjs";

export function parseArgs(argv) {
  const out = {
    repo: null, main: "origin/main", noFetch: false, skip: [], out: null,
    to: null, host: null, mergeHours: 4, staleHours: 6, quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") out.repo = argv[++i];
    else if (a === "--main") out.main = argv[++i];
    else if (a === "--no-fetch") out.noFetch = true;
    else if (a === "--skip") out.skip.push(argv[++i]);
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--to") out.to = argv[++i];
    else if (a === "--host") out.host = argv[++i];
    else if (a === "--merge-hours") out.mergeHours = Number(argv[++i]);
    else if (a === "--stale-hours") out.staleHours = Number(argv[++i]);
    else if (a === "--quiet") out.quiet = true;
  }
  return out;
}

export function defaultOutDir(home, repoAbs) {
  return path.join(home, ".agents", "collect", path.basename(repoAbs));
}

// K2: every character outside [a-z0-9-] -> "-", runs collapsed, trimmed, cut to 40 chars; a host
// that sanitizes to nothing is "host" (so the sender becomes "collect-host").
export function sanitizeHost(raw) {
  let s = String(raw ?? "").toLowerCase();
  s = s.replace(/[^a-z0-9-]/g, "-");
  s = s.replace(/-+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  s = s.slice(0, 40);
  return s || "host";
}

export function computeByState(rows) {
  const out = {};
  for (const r of rows) out[r.state] = (out[r.state] ?? 0) + 1;
  return out;
}

// K2/spec: the sorted set of (branch, recordPath, state, tipSha) tuples, joined into one
// deterministic string so two runs can be compared with ===.
export function computeChangeKey(rows) {
  const tuples = rows.map((r) => JSON.stringify([r.branch, r.recordPath, r.state, r.tipSha]));
  tuples.sort();
  return tuples.join("\n");
}

// spec's three mechanical attention rules. A row can trip at most one (state is singular per
// row), and a rule with an unparseable/missing timestamp is skipped rather than guessed at (never
// a confident flag from a date we could not read).
export function computeAttention(rows, mergeHours, staleHours, now) {
  const out = [];
  for (const r of rows) {
    if (r.state === "no-record") {
      out.push({ branch: r.branch, recordPath: r.recordPath ?? null, state: r.state, reason: "no-record" });
      continue;
    }
    if (r.state === "accepted-unmerged") {
      const t = r.tipDate ? Date.parse(r.tipDate) : NaN;
      if (!Number.isNaN(t) && (now - t) / 3_600_000 > mergeHours) {
        out.push({
          branch: r.branch, recordPath: r.recordPath ?? null, state: r.state,
          reason: `accepted-unmerged-over-${mergeHours}-h`,
        });
        continue;
      }
    }
    if (r.state === "owned" && typeof r.hoursSinceLog === "number" && r.hoursSinceLog > staleHours) {
      out.push({
        branch: r.branch, recordPath: r.recordPath ?? null, state: r.state,
        reason: `silent-over-${staleHours}-h`,
      });
    }
  }
  return out;
}

function isExecutableFile(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// K2: "~/.local/bin/note-send" if it is an executable file, else "note-send" resolved off PATH;
// null when neither exists anywhere ("no note-send on PATH").
export function resolveNoteSend(home, env) {
  const local = path.join(home, ".local", "bin", "note-send");
  if (isExecutableFile(local)) return local;
  const dirs = String(env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, "note-send");
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
}

function defaultSpawnNoteSend(execPath, args) {
  return spawnSync(execPath, args, { encoding: "utf8" });
}

function safeGoalOrNull(text) {
  try {
    assertFieldSafe("goal", text);
    return text;
  } catch {
    return null; // K2: drop the goal and still send
  }
}

function buildNoteArgv({ from, to, repo, text, goal }) {
  const argv = [
    "--from", from, "--to", to, "--kind", "RESULT", "--no-type",
    "--recipient-repo", repo, "--topic", "lane-state", "--text", text,
  ];
  if (goal) argv.push("--goal", goal);
  argv.push("--needs", "none");
  return argv;
}

/**
 * Decide whether to send, and send if so. Never throws: a note-send failure is recorded in the
 * return value, never allowed to stop the status write.
 *
 * Priority, all pinned by K2/spec: --quiet suppresses first (even the "config missing" cases are
 * moot once quiet); then a missing --to; then a missing note-send binary; then the real call. A
 * failed fetch or an unchanged key is decided by the caller (this function is only reached when
 * neither holds).
 */
function sendNote({
  args, home, env, hostname, repoAbs, statusMdPath, rows, byState, attention,
  spawnNoteSend, resolveNoteSendFn,
}) {
  if (args.quiet) return { attempted: true, sent: false, reason: "note: skipped, --quiet" };
  if (!args.to) return { attempted: true, sent: false, reason: "note: skipped, --to missing" };
  const execPath = resolveNoteSendFn(home, env);
  if (!execPath) return { attempted: true, sent: false, reason: "note: skipped, note-send missing" };

  const n = rows.length;
  const kv = Object.entries(byState).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(", ");
  const m = attention.length;
  const text = `${n} lanes on origin: ${kv || "none"}, attention ${m}`;
  const goal = safeGoalOrNull(`status at ${statusMdPath}`);
  const from = `collect-${sanitizeHost(args.host ?? hostname)}`;
  const argv = buildNoteArgv({ from, to: args.to, repo: repoAbs, text, goal });
  const result = spawnNoteSend(execPath, argv);
  const reason = result && result.status !== 0
    ? `note: send exit ${result.status ?? "unknown"}`
    : null;
  return { attempted: true, sent: true, reason, execPath, argv, result };
}

function tempPathFor(filePath) {
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`,
  );
}

function atomicWrite(filePath, content) {
  const tmp = tempPathFor(filePath);
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

function formatNY(ms) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

// Line budget for status.md (spec: "at most 60 lines"). Fixed lines (header, an optional
// send/skip reason, the "attention (n)" count line) are never cut. What can be cut, in this
// order, is the attention ENTRY list, then the table's rows (the table header itself is always
// kept, one row short of empty is still useful). When either list is cut, one line is spent on
// "(+K more, see status.json)" so the reader knows more rows exist and where to find them; that
// line counts toward the 60 too. The table's own per-row bytes are never reformatted here: they
// come straight out of the shared `formatTable`, just over a shorter slice.
const STATUS_MD_LINE_BUDGET = 60;

export function buildStatusMd({ status, fetchStatus, sendOutcome, budget = STATUS_MD_LINE_BUDGET }) {
  const lines = [];
  let header = `generatedAt: ${status.generatedAt} (${formatNY(Date.parse(status.generatedAt))} America/New_York) `
    + `| main: ${status.main.sha ?? "unknown"} | rows: ${status.rows.length}`;
  if (fetchStatus === "failed") header += " | fetch: failed";
  lines.push(header);
  if (sendOutcome.reason) lines.push(sendOutcome.reason);
  const attention = status.summary.attention;
  lines.push(`attention (${attention.length})`);

  const fixedCount = lines.length; // header [+ reason] + the "attention (n)" line
  const rows = status.rows;
  // Reserve the table's own header row so the table is never starved to nothing.
  let remaining = Math.max(0, budget - fixedCount - 1);
  let attnShown = Math.min(attention.length, remaining);
  let rowsShown = Math.min(rows.length, remaining - attnShown);
  let cutAttn = attention.length - attnShown;
  let cutRows = rows.length - rowsShown;
  let anyCut = cutAttn > 0 || cutRows > 0;
  if (anyCut) {
    // Make room for the "(+K more...)" notice itself: take one line back from the table first
    // (the attention list is the actual wake signal; keep it as complete as the budget allows).
    if (rowsShown > 0) rowsShown -= 1;
    else if (attnShown > 0) attnShown -= 1;
    cutAttn = attention.length - attnShown;
    cutRows = rows.length - rowsShown;
  }

  for (let i = 0; i < attnShown; i++) {
    const a = attention[i];
    lines.push(`- ${a.branch}\t${a.recordPath ?? "-"}\t${a.state}\t${a.reason}`);
  }
  lines.push(formatTable(rows.slice(0, rowsShown)));
  if (anyCut) lines.push(`(+${cutAttn + cutRows} more, see status.json)`);
  return `${lines.join("\n")}\n`;
}

export function main(argv = process.argv.slice(2), opts = {}) {
  const write = opts.write ?? ((s) => console.log(s));
  const warn = opts.warn ?? ((s) => process.stderr.write(`${s}\n`));
  const now = opts.now ?? Date.now();
  const home = opts.home ?? os.homedir();
  const env = opts.env ?? process.env;
  const hostname = opts.hostname ?? os.hostname();
  const collectMain = opts.collectMain ?? collectFromOriginMain;
  const resolveNoteSendFn = opts.resolveNoteSend ?? resolveNoteSend;
  const spawnNoteSendFn = opts.spawnNoteSend ?? defaultSpawnNoteSend;

  try {
    const args = parseArgs(argv);
    const repo = path.resolve(args.repo ?? opts.cwd ?? process.cwd());
    const outDir = args.out ? path.resolve(args.out) : defaultOutDir(home, repo);

    const written = [];
    const collectWarnings = [];
    const collectArgv = ["--repo", repo, "--main", args.main, "--json"];
    if (args.noFetch) collectArgv.push("--no-fetch");
    for (const s of args.skip) collectArgv.push("--skip", s);
    collectMain(collectArgv, { write: (s) => written.push(s), warn: (s) => collectWarnings.push(s), now });
    const rows = written.length ? JSON.parse(written[0]) : [];

    // Keep collect-from-origin's own exit-0-on-failed-fetch promise: a failed fetch still writes
    // a status (header says fetch: failed) and, per K2, never wakes anyone.
    const fetchFailed = !args.noFetch && collectWarnings.some((w) => w.includes("git fetch failed"));
    const fetchStatus = args.noFetch ? "skipped" : (fetchFailed ? "failed" : "ok");

    const mainFull = fullRef(args.main);
    let mainSha = null;
    if (refExists(repo, mainFull)) {
      try {
        mainSha = execFileSync("git", ["rev-parse", mainFull], { cwd: repo, encoding: "utf8" }).trim();
      } catch {
        mainSha = null;
      }
    }

    const byState = computeByState(rows);
    const attention = computeAttention(rows, args.mergeHours, args.staleHours, now);
    const currentKey = computeChangeKey(rows);

    fs.mkdirSync(outDir, { recursive: true });
    const statusPath = path.join(outDir, "status.json");
    const previousPath = path.join(outDir, "previous.json");
    const mdPath = path.join(outDir, "status.md");

    let previousStatus = null;
    if (fs.existsSync(statusPath)) {
      try {
        previousStatus = JSON.parse(fs.readFileSync(statusPath, "utf8"));
      } catch {
        previousStatus = null;
      }
    }
    const sameAsPrevious = Boolean(previousStatus) && (previousStatus.announced ?? null) === currentKey;

    let sendOutcome = { attempted: false, sent: false, reason: null };
    if (!fetchFailed && mainSha && !sameAsPrevious) {
      sendOutcome = sendNote({
        args, home, env, hostname, repoAbs: repo, statusMdPath: mdPath, rows, byState, attention,
        spawnNoteSend: spawnNoteSendFn, resolveNoteSendFn,
      });
    }
    // announced tracks the last key a send was ATTEMPTED for (--quiet/missing-binary/missing-to
    // still count: fixing the config later must not re-send for a state already seen). A failed
    // fetch is the one case that never updates it (K2: "does not update announced").
    const announced = sendOutcome.attempted ? currentKey : (previousStatus ? previousStatus.announced ?? null : null);

    const generatedAt = new Date(now).toISOString();
    const status = {
      generatedAt,
      host: args.host ?? hostname,
      repo,
      fetch: fetchStatus,
      main: { ref: args.main, sha: mainSha },
      rows,
      summary: { byState, attention },
      changeKey: currentKey,
      announced,
    };

    // Write the new status.json to a temp file BEFORE rotating the old one aside, so the window
    // with no status.json at all shrinks to the two renames themselves (a full-disk write failure
    // on the temp file now leaves the old status.json untouched, instead of leaving none).
    const statusTmp = tempPathFor(statusPath);
    fs.writeFileSync(statusTmp, `${JSON.stringify(status, null, 2)}\n`);
    if (fs.existsSync(statusPath)) fs.renameSync(statusPath, previousPath);
    fs.renameSync(statusTmp, statusPath);
    atomicWrite(mdPath, buildStatusMd({ status, fetchStatus, sendOutcome }));

    write(mdPath);
    return 0;
  } catch (err) {
    warn(`collect-status: ${err && err.message ? err.message : err}`);
    return 0; // exit 0 always, same promise collect-from-origin makes
  }
}

const isMainModule = () => !!process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMainModule()) process.exitCode = main();
