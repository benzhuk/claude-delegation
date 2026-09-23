// Work record contract stub. Pinned in next-build/spec.md, C1 and C2. Territory T1 fills the
// bodies; every other territory imports these names and tests against hand-written fixtures.
// Header lines in a record match /^[ \t*+-]{0,20}<Label>:\**[ \t]{0,20}(.+)$/mi, the dispatch
// guard's bounded shape: a [ \t]-only class with an explicit {0,20} bound, never \s.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const STATUSES = ["runnable", "owned", "delivered", "rejected", "reviewed", "accepted", "blocked"];
export const REQUIRED_FIELDS = ["work", "scope", "owner", "status", "authority", "artifact", "evidence", "next", "opened"];
export const OPTIONAL_FIELDS = ["children", "builder", "rounds", "class"];
export const FINDING_CODES = [
  "missing-field", "bad-status", "bad-work-id", "accepted-without-artifact", "accepted-without-evidence",
  "evidence-missing", "evidence-no-verdict", "stale-result-candidate", "scope-drift", "workaround-overdue",
  "evidence-unreachable", "bugfix-gate-missing", "runnable-with-owner",
];

const FIELD_LABELS = [
  ["work", "Work"], ["scope", "Scope"], ["owner", "Owner"], ["status", "Status"],
  ["authority", "Authority"], ["artifact", "Artifact"], ["evidence", "Evidence"],
  ["next", "Next"], ["opened", "Opened"], ["children", "Children"],
  ["builder", "Builder"], ["rounds", "Rounds"], ["class", "Class"],
];
const LIST_FIELDS = new Set(["evidence", "children"]);
const KNOWN_LABELS = new Set([...FIELD_LABELS.map(([, l]) => l.toLowerCase()), "workaround", "log"]);
const HEADER_LINE_RE = /^[ \t*+-]{0,20}([A-Za-z][A-Za-z ]{0,40}):\**[ \t]{0,20}(.+)$/;

function rtrim(s) {
  return s.replace(/[\r \t]+$/, "");
}

function fieldRegex(label) {
  return new RegExp(`^[ \\t*+-]{0,20}${label}:\\**[ \\t]{0,20}(.+)$`, "mi");
}

function splitList(value) {
  const v = rtrim(value).trim();
  if (v.toLowerCase() === "none") return [];
  return v.split(",").map((s) => rtrim(s).trim()).filter((s) => s.length > 0);
}

// -> { fields, workarounds: [{ cause, blockedBy, removeWhen }], log: [{ at, status, owner, note }], errors: [] }
export function parseRecord(text) {
  const errors = [];
  const lines = text.split(/\r?\n/);
  const blankIdx = lines.findIndex((l) => l.trim() === "");
  const headerLines = blankIdx === -1 ? lines : lines.slice(0, blankIdx);
  const headerText = headerLines.join("\n");

  for (const line of headerLines) {
    const m = line.match(HEADER_LINE_RE);
    if (!m) continue;
    const label = m[1].trim().toLowerCase();
    if (!KNOWN_LABELS.has(label)) errors.push(`unknown label: ${m[1].trim()}`);
  }

  const fields = {};
  for (const [key, label] of FIELD_LABELS) {
    const m = fieldRegex(label).exec(headerText);
    if (!m) continue;
    const value = rtrim(m[1]).trim();
    fields[key] = LIST_FIELDS.has(key) ? splitList(value) : value;
  }

  const workarounds = [];
  const workaroundRe = /^[ \t*+-]{0,20}WORKAROUND:\**[ \t]{0,20}(.+)$/gim;
  for (const wm of headerText.matchAll(workaroundRe)) {
    const parts = rtrim(wm[1]).trim().split(" / ").map((p) => rtrim(p).trim());
    // The last two segments are always <blocked by> and <remove when>; a cause that itself
    // contains " / " folds back into the cause rather than shifting the date out of view.
    workarounds.push(parts.length > 3
      ? { cause: parts.slice(0, -2).join(" / "), blockedBy: parts.at(-2), removeWhen: parts.at(-1) }
      : { cause: parts[0] ?? "", blockedBy: parts[1] ?? "", removeWhen: parts[2] ?? "" });
  }

  const log = [];
  const logRe = /^[ \t*+-]{0,20}Log:\**[ \t]{0,20}(.+)$/gim;
  for (const lm of headerText.matchAll(logRe)) {
    const value = rtrim(lm[1]).trim();
    const parts = value.match(/^(\S{1,64})[ \t]{1,20}(\S{1,64})[ \t]{1,20}(\S{1,64})(?:[ \t]{1,20}(.*))?$/);
    if (!parts) {
      errors.push(`malformed Log line: ${value}`);
      continue;
    }
    log.push({ at: parts[1], status: parts[2], owner: parts[3], note: rtrim(parts[4] ?? "").trim() });
  }

  return { fields, workarounds, log, errors };
}

function isInsideRepo(repoRoot, evidencePath) {
  const resolved = path.resolve(repoRoot, evidencePath);
  const rel = path.relative(repoRoot, resolved);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// opts: { fsImpl, now, repoRoot, gitDir, ref } -> [{ code, level: "finding"|"info", message }]
export function validateRecord(record, opts = {}) {
  const fsImpl = opts.fsImpl ?? fs;
  // execImpl mirrors fsImpl: the scope-drift git call is injectable so a test can prove it is
  // NOT made when gitDir or ref is absent (the catch below would otherwise hide a lost guard).
  const execImpl = opts.execImpl ?? execFileSync;
  const now = opts.now ?? new Date();
  const fields = record.fields ?? {};
  const log = record.log ?? [];
  const workarounds = record.workarounds ?? [];
  const evidence = Array.isArray(fields.evidence) ? fields.evidence : [];
  const findings = [];

  for (const key of REQUIRED_FIELDS) {
    if (fields[key] === undefined) {
      findings.push({ code: "missing-field", level: "finding", message: `missing required field: ${key}` });
    }
  }

  if (fields.status !== undefined && !STATUSES.includes(fields.status)) {
    findings.push({
      code: "bad-status",
      level: "finding",
      message: `status "${fields.status}" is not one of ${STATUSES.join(", ")}`,
    });
  }

  if (fields.status === "runnable" && fields.owner !== undefined && fields.owner !== "" && fields.owner !== "none") {
    findings.push({
      code: "runnable-with-owner",
      level: "finding",
      message: `Status: runnable but Owner: is "${fields.owner}", not none`,
    });
  }

  if (fields.work !== undefined && !/^wr-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(fields.work)) {
    findings.push({
      code: "bad-work-id",
      level: "finding",
      message: `Work: "${fields.work}" does not match wr-<yyyy-mm-dd>-<slug> (lowercase, [a-z0-9-])`,
    });
  }

  const isAccepted = fields.status === "accepted";

  if (isAccepted && (fields.artifact === undefined || fields.artifact === "none")) {
    findings.push({
      code: "accepted-without-artifact",
      level: "finding",
      message: "Status: accepted but Artifact: is none or missing",
    });
  }

  // Evidence path checks only run when repoRoot is given (A4): without it we cannot tell
  // in-repo from unreachable, so we skip every evidence-path check rather than guess.
  // Without repoRoot we cannot tell in-repo from unreachable (A4), and we must NOT treat
  // every path as outside the repo: any declared evidence path counts for `accepted`.
  let hasInRepoEvidence = opts.repoRoot === undefined && evidence.length > 0;
  if (opts.repoRoot !== undefined) {
    for (const ev of evidence) {
      if (!isInsideRepo(opts.repoRoot, ev)) {
        findings.push({ code: "evidence-unreachable", level: "info", message: `evidence path outside repo root: ${ev}` });
        continue;
      }
      hasInRepoEvidence = true;
      const abs = path.resolve(opts.repoRoot, ev);
      let exists = false;
      try {
        exists = fsImpl.existsSync(abs);
      } catch {
        exists = false;
      }
      if (!exists) {
        findings.push({ code: "evidence-missing", level: "finding", message: `evidence path does not exist: ${ev}` });
        continue;
      }
      let firstLine = "";
      try {
        const content = fsImpl.readFileSync(abs, "utf8");
        firstLine = (content.split(/\r?\n/)[0] ?? "").trim();
      } catch {
        firstLine = "";
      }
      if (!firstLine.startsWith("VERDICT:")) {
        findings.push({ code: "evidence-no-verdict", level: "finding", message: `evidence file's first line is not VERDICT:: ${ev}` });
      }
    }
  }

  if (isAccepted && !hasInRepoEvidence) {
    findings.push({
      code: "accepted-without-evidence",
      level: "finding",
      message: "Status: accepted but no evidence path is inside the repo",
    });
  }

  // stale-result-candidate (RT-8, A4): an owner-change Log line is one whose owner differs
  // from the immediately preceding Log line's owner (the first line always counts).
  const artifactLogs = log.filter((l) => /^artifact[ \t]+\S+/i.test(l.note ?? ""));
  if (artifactLogs.length > 0 && fields.artifact !== "none" && fields.artifact !== undefined) {
    const ownerChangeLogs = log.filter((l, i) => i === 0 || l.owner !== log[i - 1].owner);
    if (ownerChangeLogs.length > 0) {
      const newestOwnerChange = ownerChangeLogs.reduce((a, b) => (Date.parse(b.at) > Date.parse(a.at) ? b : a));
      const newestArtifact = artifactLogs.reduce((a, b) => (Date.parse(b.at) > Date.parse(a.at) ? b : a));
      if (Date.parse(newestOwnerChange.at) > Date.parse(newestArtifact.at)) {
        findings.push({
          code: "stale-result-candidate",
          level: "finding",
          message: `owner changed at ${newestOwnerChange.at} (to "${newestOwnerChange.owner}"), after the newest artifact note at ${newestArtifact.at}: the recorded evidence is from a previous owner`,
        });
      }
    }
  }

  // scope-drift (RT-9): only attempted when both gitDir and ref are given.
  if (opts.gitDir !== undefined && opts.ref !== undefined && fields.scope) {
    const m = /^(.*)@([0-9a-fA-F]+)$/.exec(fields.scope);
    if (m) {
      const [, scopePath, sha] = m;
      try {
        const out = execImpl("git", ["-C", opts.gitDir, "log", "-1", "--format=%H", opts.ref, "--", scopePath], {
          encoding: "utf8",
        }).trim();
        if (!out) {
          // git ran fine and answered "no history for this path at this ref" - an unresolvable
          // scope is not the same fact as an agreeing one (F7); say so without adding a finding
          // code (C2's twelve are pinned; this info row sits outside that list).
          findings.push({
            code: "scope-unresolvable",
            level: "info",
            message: `${opts.ref} has no commit touching ${scopePath}: scope-drift could not be checked`,
          });
        } else if (!out.toLowerCase().startsWith(sha.toLowerCase())) {
          findings.push({
            code: "scope-drift",
            level: "finding",
            message: `Scope: sha ${sha} for ${scopePath} does not match ${opts.ref}'s latest commit touching it (${out})`,
          });
        }
      } catch {
        // git could not answer at all (bad gitDir, not a repo, etc.) - fail open, no finding, no
        // info row: this is a different failure mode than "git ran and found nothing".
      }
    }
  }

  // workaround-overdue: fires in any status, for any "remove when" that is a past date.
  for (const w of workarounds) {
    const dm = /^by[ \t]+(\d{4}-\d{2}-\d{2})$/i.exec((w.removeWhen ?? "").trim());
    if (dm) {
      const due = new Date(`${dm[1]}T00:00:00Z`);
      if (due.getTime() < now.getTime()) {
        findings.push({
          code: "workaround-overdue",
          level: "finding",
          message: `workaround "${w.cause}" was due to be removed by ${dm[1]}`,
        });
      }
    }
  }

  // bugfix-gate-missing (RT-23)
  if (fields.class !== undefined && isAccepted) {
    const hasPrefixTestEvidence = evidence.some((ev) => path.basename(ev).includes("prefix-test"));
    if (!hasPrefixTestEvidence) {
      findings.push({
        code: "bugfix-gate-missing",
        level: "finding",
        message: "Class: is set and Status: accepted but no evidence path's basename contains prefix-test",
      });
    }
  }

  return findings;
}

// opts: { fsImpl } -> [{ path, record }], reads <dir>/*.record.md only, never recurses
export function listRecords(dir, opts = {}) {
  const fsImpl = opts.fsImpl ?? fs;
  let entries;
  try {
    entries = fsImpl.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith(".record.md"))
    .sort()
    .map((f) => {
      const p = path.join(dir, f);
      let text = "";
      try {
        text = fsImpl.readFileSync(p, "utf8");
      } catch {
        // Removed between readdir and read; treat as an unparseable-but-present entry
        // rather than throwing through a caller like T2's hook or T4's janitor.
      }
      return { path: p, record: parseRecord(text) };
    });
}

// records is listRecords's own return shape ([{ path, record }]); groups by
// record.fields.work (records with no work field are skipped — that's missing-field's
// job) and reports every work id held by more than one record. Deliberately a different
// shape from validateRecord's findings: work/paths, not message.
// -> [{ code: 'duplicate-work-id', level: 'finding', work, paths: [...] }]
export function checkRecordSet(records) {
  const byWork = new Map();
  for (const { path: p, record } of records) {
    const work = record?.fields?.work;
    if (work === undefined) continue;
    if (!byWork.has(work)) byWork.set(work, []);
    byWork.get(work).push(p);
  }
  const findings = [];
  for (const [work, paths] of byWork) {
    if (paths.length > 1) {
      findings.push({ code: "duplicate-work-id", level: "finding", work, paths });
    }
  }
  return findings;
}

export function formatLogLine(at, status, owner, note) {
  const base = `Log: ${at} ${status} ${owner}`;
  return note ? `${base} ${note}` : base;
}

const SINGLETON_LABELS = new Map(FIELD_LABELS.map(([key, label]) => [label.toLowerCase(), key]));
const DECIDING_VERDICTS = new Set(["APPROVE", "NEEDS_FIXES", "FAIL", "REJECTED"]);
const VERDICT_RE = /^VERDICT:[ \t]*(APPROVE|NEEDS_FIXES|FAIL|REJECTED)(?:[ \t]+(?:—[ \t]+)?([0-9a-fA-F]{4,64}))?[ \t]*$/;

function acceptanceError(message) {
  const error = new Error(message);
  error.code = "acceptance-failed";
  return error;
}

function readConfinedRegularFile(repoReal, repoRoot, relativePath, fsImpl) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw acceptanceError(`path must be repository-relative: ${relativePath || "<empty>"}`);
  }
  const candidate = path.resolve(repoRoot, relativePath);
  const lexical = path.relative(repoRoot, candidate);
  if (lexical.startsWith("..") || path.isAbsolute(lexical)) {
    throw acceptanceError(`path escapes repository: ${relativePath}`);
  }
  let real;
  let stat;
  try {
    real = fsImpl.realpathSync(candidate);
    stat = fsImpl.statSync(real);
  } catch (error) {
    throw acceptanceError(`unreadable path: ${relativePath} (${error.message})`);
  }
  const realRelative = path.relative(repoReal, real);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw acceptanceError(`path resolves outside repository: ${relativePath}`);
  }
  if (!stat.isFile()) throw acceptanceError(`path is not a regular file: ${relativePath}`);
  try {
    return fsImpl.readFileSync(real, "utf8");
  } catch (error) {
    throw acceptanceError(`unreadable path: ${relativePath} (${error.message})`);
  }
}

function resolveCommit(repoRoot, revision, label, execImpl) {
  if (!revision) throw acceptanceError(`${label} revision is missing`);
  try {
    const resolved = execImpl("git", ["-C", repoRoot, "rev-parse", "--verify", `${revision}^{commit}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!/^[0-9a-f]{40}$/i.test(resolved)) throw new Error("Git did not return a commit object");
    return resolved.toLowerCase();
  } catch {
    throw acceptanceError(`${label} revision is missing, ambiguous, or not a commit: ${revision}`);
  }
}

function requireObservedBody(text) {
  const lines = text.split(/\r?\n/);
  const blank = lines.findIndex((line) => line.trim() === "");
  const body = blank === -1 ? [] : lines.slice(blank + 1);
  let fenced = false;
  for (const line of body) {
    if (/^[ \t]*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || /^[ \t]*>/.test(line)) continue;
    const match = /^[ \t]*Observed:[ \t]*(.+?)[ \t]*$/i.exec(line);
    if (match && match[1].trim()) return;
  }
  throw acceptanceError("record body requires a nonempty Observed: line outside fences and blockquotes");
}

function requireStrictRecordShape(text, record) {
  if (record.errors.length > 0) throw acceptanceError(`record parse error: ${record.errors.join("; ")}`);
  const lines = text.split(/\r?\n/);
  const blank = lines.findIndex((line) => line.trim() === "");
  const header = blank === -1 ? lines : lines.slice(0, blank);
  const counts = new Map();
  for (const line of header) {
    const match = line.match(HEADER_LINE_RE);
    if (!match) continue;
    const key = SINGLETON_LABELS.get(match[1].trim().toLowerCase());
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) {
    if (count > 1) throw acceptanceError(`duplicate singleton field: ${key}`);
  }
  for (const key of REQUIRED_FIELDS) {
    const value = record.fields[key];
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      throw acceptanceError(`missing required field: ${key}`);
    }
  }
  if (!/^wr-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(record.fields.work)) {
    throw acceptanceError(`invalid Work: ${record.fields.work}`);
  }
  if (record.fields.status !== "reviewed") {
    throw acceptanceError(`Status must be reviewed immediately before acceptance, got: ${record.fields.status}`);
  }
  requireObservedBody(text);
}

function artifactRevision(artifact) {
  const match = /(?:^|@)([0-9a-fA-F]{4,64})$/.exec(artifact ?? "");
  if (!match) throw acceptanceError(`Artifact does not end in a Git revision: ${artifact ?? "<missing>"}`);
  return match[1];
}

/**
 * Strict, read-only Git-backed acceptance check. Historical validateRecord behavior remains
 * deliberately separate. opts: { repoRoot, recordPath, deliveryRef?, pinnedArtifact?, fsImpl?, execImpl? }
 */
export function checkAcceptance(opts = {}) {
  const fsImpl = opts.fsImpl ?? fs;
  const execImpl = opts.execImpl ?? execFileSync;
  if (!opts.repoRoot) throw acceptanceError("--repo is required");
  if (!opts.recordPath) throw acceptanceError("--record is required");
  const modes = Number(opts.deliveryRef !== undefined) + Number(opts.pinnedArtifact !== undefined);
  if (modes !== 1) throw acceptanceError("exactly one of --delivery-ref or --pinned-artifact is required");

  let repoRoot;
  let repoReal;
  try {
    repoRoot = path.resolve(opts.repoRoot);
    repoReal = fsImpl.realpathSync(repoRoot);
  } catch (error) {
    throw acceptanceError(`repository is unreadable: ${error.message}`);
  }
  const text = readConfinedRegularFile(repoReal, repoRoot, opts.recordPath, fsImpl);
  const record = parseRecord(text);
  requireStrictRecordShape(text, record);

  const artifact = resolveCommit(repoRoot, artifactRevision(record.fields.artifact), "Artifact", execImpl);
  const deliveryInput = opts.deliveryRef !== undefined ? opts.deliveryRef : opts.pinnedArtifact;
  const delivery = resolveCommit(repoRoot, deliveryInput, opts.deliveryRef !== undefined ? "delivery ref" : "pinned artifact", execImpl);
  if (artifact !== delivery) {
    throw acceptanceError(`Artifact ${artifact} does not match delivery ${delivery}`);
  }

  let approved = false;
  const blockers = [];
  for (const evidencePath of record.fields.evidence) {
    const evidence = readConfinedRegularFile(repoReal, repoRoot, evidencePath, fsImpl);
    const firstLine = (evidence.split(/\r?\n/, 1)[0] ?? "").trim();
    const verdict = VERDICT_RE.exec(firstLine);
    if (!verdict && /^VERDICT:[ \t]*(?:APPROVE|NEEDS_FIXES|FAIL|REJECTED)\b/.test(firstLine)) {
      throw acceptanceError(`malformed deciding verdict: ${evidencePath}`);
    }
    if (!verdict || !DECIDING_VERDICTS.has(verdict[1])) continue;
    if (!verdict[2]) {
      if (verdict[1] === "APPROVE") throw acceptanceError(`approval omits a revision: ${evidencePath}`);
      continue;
    }
    const reportCommit = resolveCommit(repoRoot, verdict[2], `evidence ${evidencePath}`, execImpl);
    if (reportCommit !== artifact) continue;
    if (verdict[1] === "APPROVE") approved = true;
    else blockers.push(`${verdict[1]} in ${evidencePath}`);
  }
  if (blockers.length > 0) throw acceptanceError(`current artifact has refusing evidence: ${blockers.join(", ")}`);
  if (!approved) throw acceptanceError("no evidence has an exact APPROVE verdict for the current artifact");

  return { ok: true, work: record.fields.work, artifact, delivery };
}

export function parseAcceptanceArgs(argv) {
  if (argv[0] !== "check-acceptance") throw acceptanceError("expected command: check-acceptance");
  const opts = {};
  const names = new Map([
    ["--record", "recordPath"], ["--repo", "repoRoot"],
    ["--delivery-ref", "deliveryRef"], ["--pinned-artifact", "pinnedArtifact"],
  ]);
  for (let i = 1; i < argv.length; i += 2) {
    const key = names.get(argv[i]);
    if (!key || argv[i + 1] === undefined) throw acceptanceError(`unknown or incomplete option: ${argv[i]}`);
    opts[key] = argv[i + 1];
  }
  return opts;
}

export function acceptanceMain(argv = process.argv.slice(2), io = process) {
  try {
    const result = checkAcceptance(parseAcceptanceArgs(argv));
    io.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`work-record: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = acceptanceMain();
}
