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
// node scripts/collect-status.mjs [--repo <dir>] [--main <ref>] [--no-fetch] [--skip <name>]... [--only-prefix <prefix>]...
//   [--out <dir>] [--to <slug>] [--host <name>] [--merge-hours <n>=4] [--stale-hours <n>=6] [--quiet]

import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { main as collectFromOriginMain, fullRef, refExists, formatTable } from "./collect-from-origin.mjs";
import { parseRecord } from "./work-record.mjs";
import { assertFieldSafe, SLUG_RE, timeParts } from "../skills/multi/scripts/envelope.mjs";

// K2: the only state tokens that may ever reach a note's --text (collect-from-origin's computeState
// names plus the no-record row); anything else is counted as "other", never named.
const NOTE_STATE_TOKENS = new Set(["owned", "rejected", "withdrawn", "accepted-merged", "accepted-unmerged", "no-record"]);
export const DEFAULT_ONLY_PREFIXES = ["build/"];

export function parseArgs(argv) {
  const out = {
    repo: null, main: "origin/main", noFetch: false, skip: [], onlyPrefix: [], out: null,
    to: null, host: null, mergeHours: 4, staleHours: 6, quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") out.repo = argv[++i];
    else if (a === "--main") out.main = argv[++i];
    else if (a === "--no-fetch") out.noFetch = true;
    else if (a === "--skip") out.skip.push(argv[++i]);
    else if (a === "--only-prefix") out.onlyPrefix.push(argv[++i]);
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
  const safeByState = {};
  for (const [k, v] of Object.entries(byState)) {
    const token = NOTE_STATE_TOKENS.has(k) ? k : "other";
    safeByState[token] = (safeByState[token] ?? 0) + (Number.isInteger(v) ? v : 0);
  }
  const kv = Object.entries(safeByState).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(", ");
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

// ---------------------------------------------------------------------------
// Lane thirty (stall-nudge, docs/specs/stall-nudge-1): after status.md and the existing RESULT,
// send ONE ASK to the owning lead for every attention row still stuck at `silent-over-N-h`
// (contracts.md S1-S6). Nothing here ever throws past its own function: a bad Owner, a missing
// note-send, a kill switch or a ledger read error all degrade to "no ASK this round", never a
// stopped run.
// ---------------------------------------------------------------------------

const STALL_REASON_RE = /^silent-over-/;

// S2: the branch name lowercased, every run of characters outside [a-z0-9] collapsed to one "-",
// ends trimmed.
export function branchSlug(branch) {
  return String(branch ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// S2: "if it is too long, truncate the branch-slug part, never the sha." No exact cap is pinned;
// 40 mirrors sanitizeHost's own cap above and keeps the id comfortably inside note-send's 700-char
// envelope line no matter how long a branch name gets.
const BRANCH_SLUG_MAX = 40;

export function buildStallTopic(branch, tipSha) {
  const sha7 = String(tipSha ?? "").slice(0, 7).toLowerCase();
  let slug = branchSlug(branch) || "branch";
  if (slug.length > BRANCH_SLUG_MAX) slug = slug.slice(0, BRANCH_SLUG_MAX).replace(/-+$/, "");
  return `stall-${slug}-${sha7}`;
}

// S3: `none`, missing, or anything that fails note-send's slug grammar (lowercase, [a-z0-9-]+)
// yields null - never a guess at what the lead meant.
export function ownerSlugOrNull(rawOwner) {
  if (rawOwner === undefined || rawOwner === null) return null;
  const s = String(rawOwner).trim();
  if (!s || s.toLowerCase() === "none") return null;
  if (s !== s.toLowerCase()) return null;
  if (!SLUG_RE.test(s)) return null;
  return s;
}

// The row's Owner: field, read straight off the branch's own tip blob (never main's) so a row's
// ASK always names the owner the branch itself claims, matching how collect-from-origin already
// reads Status:/Artifact: for the same row (collect-from-origin.mjs buildRow). Any read/parse
// failure (missing blob, corrupt record) is swallowed here - S3 already treats "missing" as "no
// usable owner", so a read error is just another way to reach the same outcome.
function readOwnerField(repoAbs, row) {
  if (!row || !row.tipSha || !row.recordPath) return null;
  try {
    const text = execFileSync("git", ["show", `${row.tipSha}:${row.recordPath}`], {
      cwd: repoAbs, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    return parseRecord(text).fields.owner ?? null;
  } catch {
    return null;
  }
}

// S2: every docs/ledger/*.md file in the recipient repo, concatenated, read in process (never a
// shell). No ledger directory at all means nothing has ever been sent there - that is not a read
// error, so it returns "". Any OTHER failure (permission denied, docs/ledger existing as a plain
// file, ...) is rethrown so the caller can fail closed for the whole round, per S2's "a ledger
// read error means no ASK this run, with one stderr line".
function readLedgerCorpus(repoAbs) {
  const dir = path.join(repoAbs, "docs", "ledger");
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return "";
    throw err;
  }
  const parts = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    parts.push(fs.readFileSync(path.join(dir, entry.name), "utf8"));
  }
  return parts.join("\n");
}

// S4: same directory `defaultOutDir` already computes for status.json/status.md, regardless of
// whether --out overrides where THIS run actually writes - the switch is per repo, not per run.
function killSwitchPath(home, repoAbs) {
  return path.join(defaultOutDir(home, repoAbs), "no-nudge");
}

function buildStallNudgeArgv({ from, to, repo, text, topic, by }) {
  return [
    "--from", from, "--to", to, "--kind", "ASK", "--no-type",
    "--recipient-repo", repo, "--topic", topic, "--text", text,
    "--needs", "review", "--by", by,
  ];
}

/**
 * S1-S6: one note-send spawn per still-silent row, after status.md/the RESULT are already
 * written. Never throws (every failure path here is a warn() and an early return); returns the
 * per-row outcomes so a caller (or a test) can see what happened without re-deriving it.
 */
function sendStallNudges({
  args, home, env, hostname, repoAbs, rows, attention, now, warn,
  spawnNoteSend, resolveNoteSendFn,
}) {
  const stallRows = attention.filter((a) => STALL_REASON_RE.test(a.reason));
  if (stallRows.length === 0) return [];

  if (fs.existsSync(killSwitchPath(home, repoAbs))) {
    warn("collect-status: stall-nudge skipped, kill switch present (no-nudge)");
    return [];
  }

  const execPath = resolveNoteSendFn(home, env);
  if (!execPath) {
    warn("collect-status: stall-nudge skipped, note-send missing");
    return [];
  }

  let ledgerCorpus;
  try {
    ledgerCorpus = readLedgerCorpus(repoAbs);
  } catch (err) {
    warn(`collect-status: stall-nudge skipped, ledger read failed: ${err && err.message ? err.message : err}`);
    return [];
  }

  const from = `collect-${sanitizeHost(args.host ?? hostname)}`;
  const outcomes = [];
  for (const a of stallRows) {
    const row = rows.find((r) => r.branch === a.branch && r.recordPath === a.recordPath && r.state === a.state);
    if (!row) continue;
    const owner = ownerSlugOrNull(readOwnerField(repoAbs, row));
    if (!owner) {
      warn(`collect-status: stall-nudge skipped for ${a.branch}, no usable Owner`);
      outcomes.push({ branch: a.branch, sent: false, reason: "no usable owner" });
      continue;
    }
    const topic = buildStallTopic(a.branch, row.tipSha);
    const idPrefix = `[${from}-${topic}-`;
    if (ledgerCorpus.includes(idPrefix)) {
      outcomes.push({ branch: a.branch, sent: false, reason: "already asked" });
      continue;
    }
    const hours = typeof row.hoursSinceLog === "number" ? row.hoursSinceLog.toFixed(1) : "unknown";
    const text = `${a.branch} has had no Log line for ${hours} h in state ${a.state}. `
      + "Reply with the lane state and a new ETA, or BLOCKED. A Log line on the record resets this.";
    const by = timeParts(new Date(now + 30 * 60_000)).time;
    const argv = buildStallNudgeArgv({ from, to: owner, repo: repoAbs, text, topic, by });
    const result = spawnNoteSend(execPath, argv);
    if (result && result.status !== 0) {
      warn(`collect-status: stall-nudge send exit ${result.status ?? "unknown"} for ${a.branch}`);
    }
    outcomes.push({ branch: a.branch, sent: true, argv, result });
  }
  return outcomes;
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
  if (status.summary.skipped) lines.push(`skipped: ${status.summary.skipped.count} (outside ${status.summary.skipped.prefixes.join(", ")})`);
  const attention = status.summary.attention;
  lines.push(`attention (${attention.length})`);

  const fixedCount = lines.length; // header [+ reason] [+ skipped] + the "attention (n)" line
  const rows = status.rows;
  // Reserve both the table header and its immediately following lane legend.
  let remaining = Math.max(0, budget - fixedCount - 2);
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
  const [tableHeader, ...tableRows] = formatTable(rows.slice(0, rowsShown))
    .replace(/^([^\n]*)\tstate(?=\n|$)/, "$1\tlane")
    .split("\n");
  lines.push(tableHeader, "lane: every non-terminal Status shows as owned", ...tableRows);
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
    const onlyPrefixes = args.onlyPrefix.length ? args.onlyPrefix : DEFAULT_ONLY_PREFIXES;
    for (const prefix of onlyPrefixes) collectArgv.push("--only-prefix", prefix);
    let skipped = { count: 0, prefixes: onlyPrefixes };
    collectMain(collectArgv, { write: (s) => written.push(s), warn: (s) => collectWarnings.push(s), onSkipped: (value) => { skipped = value; }, now });
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
      summary: { byState, attention, skipped },
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

    // S5: the ASK goes after status.md and the existing RESULT - status is already durable by
    // the time this runs, so a stall-nudge failure of any kind can never cost the write above.
    // Same "a failed fetch never wakes anyone" promise as the RESULT above (sendNote's own
    // `!fetchFailed` guard): a failed fetch means `rows` reflects stale local refs, never grounds
    // for waking a lead.
    if (!fetchFailed) {
      try {
        sendStallNudges({
          args, home, env, hostname, repoAbs: repo, rows, attention, now, warn,
          spawnNoteSend: spawnNoteSendFn, resolveNoteSendFn,
        });
      } catch (err) {
        warn(`collect-status: stall-nudge failed: ${err && err.message ? err.message : err}`);
      }
    }

    write(mdPath);
    return 0;
  } catch (err) {
    warn(`collect-status: ${err && err.message ? err.message : err}`);
    return 0; // exit 0 always, same promise collect-from-origin makes
  }
}

const isMainModule = () => !!process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMainModule()) process.exitCode = main();
