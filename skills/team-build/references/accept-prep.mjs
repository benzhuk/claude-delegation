// node skills/team-build/references/accept-prep.mjs --record <repo-relative record> --repo
// <integration worktree> --plugin-root <dir holding scripts/work-record.mjs and
// scripts/build-census.mjs> --delivery-ref <branch> --artifact-sha <40-hex> --worktree
// <branch> --owner <slug> --log-note <text> --evidence <path>[,<path>...] --lead <lead
// .jsonl> [--from <iso> | --marker <text>] --census-out <repo-relative .md> [--now <iso>]
// [--json]
//
// Contracts R1/R2 (docs/specs/one-launch-2/contracts.md): a Workflow script (build-loop-
// workflow.js) has no fs or shell, so the order and header-preservation guarantees for
// accept-prep move into this deterministic, directly-testable Node helper. It runs, IN
// THIS ORDER, each only after the previous succeeded:
//   1. Edit the record's header IN PLACE — change ONLY Status:, Artifact:, Worktree:
//      (insert if absent), Evidence: (merge, dedupe, keep order) and append ONE Log: line.
//      Every other byte of the file (including line endings) is preserved. Written
//      atomically (temp file + rename in the same directory).
//   2. Run scripts/build-census.mjs from --plugin-root, AFTER step 1, so the census is
//      never older than the reviewed Log: line it just wrote.
//   3. Run scripts/work-record.mjs check-acceptance from --plugin-root (read-only),
//      capturing its exit code and combined output — only after step 2 succeeded.
// It never runs `accept` and never writes `Status: accepted`.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ── CLI parsing ──────────────────────────────────────────────────────────────────────

const FLAG_KEYS = new Map([
  ["--record", "recordPath"], ["--repo", "repo"], ["--plugin-root", "pluginRoot"],
  ["--delivery-ref", "deliveryRef"], ["--artifact-sha", "artifactSha"], ["--worktree", "worktree"],
  ["--owner", "owner"], ["--log-note", "logNote"], ["--evidence", "evidence"], ["--lead", "lead"],
  ["--from", "from"], ["--marker", "marker"], ["--census-out", "censusOut"], ["--now", "now"],
]);
const REQUIRED_KEYS = [
  "recordPath", "repo", "pluginRoot", "deliveryRef", "artifactSha", "worktree", "owner",
  "logNote", "evidence", "lead", "censusOut",
];

class AcceptPrepError extends Error {
  constructor(message, code = "accept-prep-error") {
    super(message);
    this.code = code;
  }
}

export function parseArgs(argv) {
  const opts = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") {
      opts.json = true;
      continue;
    }
    const key = FLAG_KEYS.get(a);
    if (!key) throw new AcceptPrepError(`unknown option: ${a}`, "bad-args");
    const value = argv[i + 1];
    if (value === undefined) throw new AcceptPrepError(`missing value for ${a}`, "bad-args");
    opts[key] = value;
    i += 1;
  }
  for (const key of REQUIRED_KEYS) {
    if (opts[key] === undefined) {
      const flag = [...FLAG_KEYS.entries()].find(([, v]) => v === key)?.[0] ?? key;
      throw new AcceptPrepError(`missing required option: ${flag}`, "bad-args");
    }
  }
  if (opts.from !== undefined && opts.marker !== undefined) {
    throw new AcceptPrepError("only one of --from or --marker is allowed", "bad-args");
  }
  if (!/^[0-9a-fA-F]{40}$/.test(opts.artifactSha)) {
    throw new AcceptPrepError(`--artifact-sha must be exactly 40 hex characters: ${opts.artifactSha}`, "bad-args");
  }
  if (opts.now !== undefined && Number.isNaN(Date.parse(opts.now))) {
    throw new AcceptPrepError(`--now is not a parseable timestamp: ${opts.now}`, "bad-args");
  }
  return opts;
}

// ── Line-preserving edit (R2 step 1) ────────────────────────────────────────────────
//
// Every line keeps its own original end-of-line bytes (or none, for a file with no
// trailing newline) so a byte diff of an unowned line is always empty, even on a CRLF
// file. `text.split(/(\r\n|\n)/)` alternates content/separator; the trailing empty
// string after a final separator becomes its own zero-content, zero-separator entry, so
// re-joining always reproduces the exact original bytes for every untouched line.

export function splitPreservingEol(text) {
  const parts = text.split(/(\r\n|\n)/);
  const lines = [];
  for (let i = 0; i < parts.length; i += 2) {
    lines.push({ text: parts[i], eol: parts[i + 1] ?? "" });
  }
  return lines;
}

export function joinPreservingEol(lines) {
  return lines.map((l) => l.text + l.eol).join("");
}

// Inserts a new { text, eol } line at index `at`, without ever gluing it onto a final
// line that has no EOL (a body-less/header-only record with no trailing newline): in
// that one case the previous last line first gains the EOL it was missing, and the new
// line becomes the (still EOL-less) final line, so the file's "no trailing newline"
// property is preserved and the unowned last line's text is never touched.
function insertLine(lines, at, text, eol) {
  if (at > 0 && at === lines.length && lines[at - 1].eol === "") {
    lines[at - 1] = { ...lines[at - 1], eol };
    lines.splice(at, 0, { text, eol: "" });
  } else {
    lines.splice(at, 0, { text, eol });
  }
}

function firstBlankIdx(lines) {
  const idx = lines.findIndex((l) => l.text.trim() === "");
  return idx === -1 ? lines.length : idx;
}

function fieldLineRegex(label) {
  return new RegExp(`^([ \\t*+-]{0,20}${label}:\\**[ \\t]{0,20})(.*)$`, "i");
}

// Returns { idx, prefix, value } for the first line (within [0, headerEnd)) whose label
// matches, or null. `prefix` is every byte of the line up to and including the value's
// leading whitespace — replacing only the trailing value never disturbs the bullet
// style, bold markers, or indentation the record's author chose.
function matchField(lines, headerEnd, label) {
  const re = fieldLineRegex(label);
  for (let i = 0; i < headerEnd; i += 1) {
    const m = re.exec(lines[i].text);
    if (m) return { idx: i, prefix: m[1], value: m[2] };
  }
  return null;
}

// Duplicated (deliberately) from scripts/work-record.mjs's own FIELD_LABELS, which that
// file does not export: the set of singleton (one-per-record) header labels, used only to
// find "the last singleton header line" for R2's insert-if-absent Worktree: rule.
// Repeatable labels (Log, Census, Four numbers, Workaround) are excluded on purpose — a
// new Worktree: line belongs with the other one-per-record fields, never spliced into the
// middle of a repeatable run of Log lines.
const SINGLETON_LABELS = [
  "Work", "Scope", "Owner", "Status", "Authority", "Artifact", "Evidence", "Next", "Opened",
  "Children", "Builder", "Rounds", "Class", "Worktree", "Lead-session", "Spec-session",
  "Spec-from", "Base", "Artifact-repo", "Superseded-by", "Scratch", "Workflow", "Measure",
];
const SINGLETON_LINE_RE = new RegExp(`^[ \\t*+-]{0,20}(${SINGLETON_LABELS.join("|")}):`, "i");

function lastSingletonIdx(lines, headerEnd) {
  let idx = -1;
  for (let i = 0; i < headerEnd; i += 1) {
    if (SINGLETON_LINE_RE.test(lines[i].text)) idx = i;
  }
  return idx === -1 ? headerEnd - 1 : idx;
}

function splitEvidenceList(value) {
  const v = value.trim();
  if (v === "" || v.toLowerCase() === "none") return [];
  return v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

// Same formatter as scripts/work-record.mjs's formatLogLine — reimplemented locally
// (rather than imported) so step 1's edit stays a self-contained, dependency-free
// function testable against fixtures with no --plugin-root involved at all.
export function formatLogLine(at, status, owner, note) {
  const base = `Log: ${at} ${status} ${owner}`;
  return note ? `${base} ${note}` : base;
}

function writeAtomic(targetPath, content) {
  const dir = path.dirname(targetPath);
  const tmpPath = path.join(dir, `.${path.basename(targetPath)}.accept-prep-tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmpPath, content, "utf8");
  fs.renameSync(tmpPath, targetPath);
}

// -> array of the field names actually changed, in the order they were touched. Throws
// AcceptPrepError('missing-field') if Status: (a required field that must already exist on
// any record reaching accept-prep) is absent — accept-prep has no in-place setter for it, so
// it fails closed with a named finding rather than guessing where to put one. Artifact: and
// Evidence: are inserted when absent (lane 67 addendum d: a record opened per SKILL.md Setup
// step 7 need not carry them yet), the same insert-if-absent path Worktree: uses, after the
// last singleton header line, so every unowned line keeps its exact bytes (R3a).
export function editRecord(opts) {
  const recordAbsPath = path.resolve(opts.repo, opts.recordPath);
  const original = fs.readFileSync(recordAbsPath, "utf8");
  const lines = splitPreservingEol(original);
  let headerEnd = firstBlankIdx(lines);
  const eol = lines.find((l) => l.eol)?.eol ?? "\n";
  const changed = [];

  const statusMatch = matchField(lines, headerEnd, "Status");
  if (!statusMatch) {
    throw new AcceptPrepError("no Status: header line found; accept-prep has no in-place setter for a missing field", "missing-field");
  }
  lines[statusMatch.idx].text = `${statusMatch.prefix}reviewed`;
  changed.push("Status");

  const artifactMatch = matchField(lines, headerEnd, "Artifact");
  if (artifactMatch) {
    lines[artifactMatch.idx].text = `${artifactMatch.prefix}${opts.deliveryRef}@${opts.artifactSha}`;
  } else {
    const insertAt = lastSingletonIdx(lines, headerEnd) + 1;
    insertLine(lines, insertAt, `Artifact: ${opts.deliveryRef}@${opts.artifactSha}`, eol);
    headerEnd += 1;
  }
  changed.push("Artifact");

  const evidenceMatch = matchField(lines, headerEnd, "Evidence");
  const existingEvidence = evidenceMatch ? splitEvidenceList(evidenceMatch.value) : [];
  const newEvidence = splitEvidenceList(String(opts.evidence));
  const mergedEvidence = [...existingEvidence];
  for (const p of newEvidence) {
    if (!mergedEvidence.includes(p)) mergedEvidence.push(p);
  }
  const evidenceText = mergedEvidence.length ? mergedEvidence.join(", ") : "none";
  if (evidenceMatch) {
    lines[evidenceMatch.idx].text = `${evidenceMatch.prefix}${evidenceText}`;
  } else {
    const insertAt = lastSingletonIdx(lines, headerEnd) + 1;
    insertLine(lines, insertAt, `Evidence: ${evidenceText}`, eol);
    headerEnd += 1;
  }
  changed.push("Evidence");

  const worktreeMatch = matchField(lines, headerEnd, "Worktree");
  if (worktreeMatch) {
    lines[worktreeMatch.idx].text = `${worktreeMatch.prefix}${opts.worktree}`;
  } else {
    const insertAt = lastSingletonIdx(lines, headerEnd) + 1;
    insertLine(lines, insertAt, `Worktree: ${opts.worktree}`, eol);
    headerEnd += 1;
  }
  changed.push("Worktree");

  const now = opts.now ?? new Date().toISOString();
  const logLineText = formatLogLine(now, "reviewed", opts.owner, opts.logNote);
  insertLine(lines, headerEnd, logLineText, eol);
  changed.push("Log");

  writeAtomic(recordAbsPath, joinPreservingEol(lines));
  return changed;
}

// ── Step 2: census (R2 step 2) ──────────────────────────────────────────────────────

export function runCensus(opts) {
  const buildCensusPath = path.join(opts.pluginRoot, "scripts", "build-census.mjs");
  const outAbsPath = path.resolve(opts.repo, opts.censusOut);
  fs.mkdirSync(path.dirname(outAbsPath), { recursive: true });
  const args = [buildCensusPath, "--lead", opts.lead];
  if (opts.marker !== undefined) args.push("--marker", opts.marker);
  if (opts.from !== undefined) args.push("--from", opts.from);
  args.push("--out", outAbsPath);
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  if (result.error) {
    throw new AcceptPrepError(`could not run build-census.mjs: ${result.error.message}`, "census-error");
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new AcceptPrepError(`build-census.mjs exited ${result.status}: ${detail}`, "census-error");
  }
  return opts.censusOut;
}

// ── Step 3: check-acceptance (R2 step 3) ────────────────────────────────────────────

export function runCheckAcceptance(opts) {
  const workRecordPath = path.join(opts.pluginRoot, "scripts", "work-record.mjs");
  const result = spawnSync(process.execPath, [
    workRecordPath, "check-acceptance",
    "--record", opts.recordPath,
    "--repo", opts.repo,
    "--delivery-ref", opts.deliveryRef,
  ], { encoding: "utf8" });
  if (result.error) {
    throw new AcceptPrepError(`could not run work-record.mjs: ${result.error.message}`, "check-acceptance-error");
  }
  const exitCode = result.status ?? 1;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { exitCode, verdict: exitCode === 0 ? "PASS" : "FAIL", output };
}

// ── Printing and main ───────────────────────────────────────────────────────────────

function printResult(result, json, io) {
  if (json) {
    io.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  io.stdout.write(`recordChanged: ${result.recordChanged.join(", ") || "(none)"}\n`);
  io.stdout.write(`censusPath: ${result.censusPath ?? "null"}\n`);
  if (result.censusError) io.stdout.write(`censusError: ${result.censusError}\n`);
  if (result.checkAcceptance) {
    io.stdout.write(`checkAcceptance: exitCode=${result.checkAcceptance.exitCode} verdict=${result.checkAcceptance.verdict}\n`);
    io.stdout.write(`${result.checkAcceptance.output}\n`);
  } else {
    io.stdout.write("checkAcceptance: not run\n");
  }
}

// -> exit code (number). io defaults to process for real runs, injectable for tests.
export function main(argv = process.argv.slice(2), io = process) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    io.stderr.write(`accept-prep: [${error.code ?? "error"}] ${error.message}\n`);
    return 1;
  }

  let recordChanged;
  try {
    recordChanged = editRecord(opts);
  } catch (error) {
    io.stderr.write(`accept-prep: [${error.code ?? "error"}] ${error.message}\n`);
    return 1;
  }

  let censusPath = null;
  let censusError = null;
  try {
    censusPath = runCensus(opts);
  } catch (error) {
    censusError = error.message;
  }

  let checkAcceptance = null;
  if (censusError === null) {
    try {
      checkAcceptance = runCheckAcceptance(opts);
    } catch (error) {
      censusError = null; // step 2 itself succeeded; this is a separate step-3 failure
      io.stderr.write(`accept-prep: [${error.code ?? "error"}] ${error.message}\n`);
    }
  }

  const result = { recordChanged, censusPath, censusError, checkAcceptance };
  printResult(result, opts.json, io);
  const allRan = censusError === null && checkAcceptance !== null;
  if (!allRan) {
    io.stderr.write(`accept-prep: not all steps ran (censusError: ${censusError ?? "none"}, checkAcceptance: ${checkAcceptance ? "ran" : "not run"})\n`);
  }
  return allRan ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
