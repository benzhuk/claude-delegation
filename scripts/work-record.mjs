// Work record contract stub. Pinned in next-build/spec.md, C1 and C2. Territory T1 fills the
// bodies; every other territory imports these names and tests against hand-written fixtures.
// Header lines in a record match /^[ \t*+-]{0,20}<Label>:\**[ \t]{0,20}(.+)$/mi, the dispatch
// guard's bounded shape: a [ \t]-only class with an explicit {0,20} bound, never \s.

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const STATUSES = ["runnable", "owned", "delivered", "rejected", "reviewed", "accepted", "blocked"];
export const REQUIRED_FIELDS = ["work", "scope", "owner", "status", "authority", "artifact", "evidence", "next", "opened"];
// "worktree" (T1, loop-gates spec item 2): the git worktree or branch path that produced
// Artifact:. Optional for validateRecord/parseRecord (an old record without it still
// parses cleanly) but checkAcceptance requires it - see the sha-not-in-git check below.
export const OPTIONAL_FIELDS = ["children", "builder", "rounds", "class", "worktree"];
export const FINDING_CODES = [
  "missing-field", "bad-status", "bad-work-id", "accepted-without-artifact", "accepted-without-evidence",
  "evidence-missing", "evidence-no-verdict", "stale-result-candidate", "scope-drift", "workaround-overdue",
  "evidence-unreachable", "bugfix-gate-missing", "runnable-with-owner", "accepted-without-check",
];

// T1 (round-2 review, MAJOR 3): before this, `Status: accepted` was enforced only by the
// prose in SKILL.md - a hand-edited Status: line went unnoticed by every reader of a
// record (continuation.mjs, hooks/backlog-notice.js). `acceptRecord` always appends
// exactly one `Log: <iso> accepted <owner> artifact <40-hex>` line when it flips a
// record; a record with no such line naming its own Artifact: was never accepted through
// code. Gated by Opened: (not by the mere absence of Worktree:, which a hand-editor could
// omit on purpose) so every record opened before this check existed is grandfathered.
// Later than every record already in docs/work/ on any branch (newest Opened: 2026-09-24T12:05:41Z),
// earlier than this build's own record (spec written 2026-09-24 evening, America/New_York).
const ACCEPTED_WITHOUT_CHECK_CUTOFF = Date.parse("2026-09-24T13:00:00Z");
// C2: every accept through code on/after this writes >=1 Census: line (copied summary or
// `skipped — <reason>`). Later than every record in docs/work at 2869798 (newest Opened
// 2026-09-25T01:52:55Z), earlier than this census build. A hand-edited Status: accepted
// that also copies a matching Log: accepted line (imitating a real acceptance, so the
// check above alone would miss it) is still caught here when it carries no Census: line
// at all - "no other path... marks a record accepted without one" (reviewer attack
// brief). FINDING_CODES stays at fourteen: this folds into the existing
// accepted-without-check code rather than adding a new one.
const CENSUS_REQUIRED_CUTOFF = Date.parse("2026-09-25T02:00:00Z");

const FIELD_LABELS = [
  ["work", "Work"], ["scope", "Scope"], ["owner", "Owner"], ["status", "Status"],
  ["authority", "Authority"], ["artifact", "Artifact"], ["evidence", "Evidence"],
  ["next", "Next"], ["opened", "Opened"], ["children", "Children"],
  ["builder", "Builder"], ["rounds", "Rounds"], ["class", "Class"], ["worktree", "Worktree"],
];
const LIST_FIELDS = new Set(["evidence", "children"]);
// "census" (C2, "acceptance requires the census"): a repeatable header line, same shape
// as WORKAROUND/Log - `accept --census` writes one per copied summary line - never a
// FIELD_LABELS singleton, so several may coexist without tripping the duplicate-singleton
// check in requireStrictRecordShape.
const KNOWN_LABELS = new Set([...FIELD_LABELS.map(([, l]) => l.toLowerCase()), "workaround", "log", "census"]);
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

  // census (C2): every Census: line, verbatim, in file order - the summary lines
  // `accept --census` copied out of a recognised census report, plus a `--no-census`
  // skip reason. Never re-parsed into structured fields: this file only ever copies them.
  const census = [];
  const censusRe = /^[ \t*+-]{0,20}Census:\**[ \t]{0,20}(.+)$/gim;
  for (const cm of headerText.matchAll(censusRe)) {
    census.push(rtrim(cm[1]).trim());
  }

  return { fields, workarounds, log, census, errors };
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

  // accepted-without-check: see ACCEPTED_WITHOUT_CHECK_CUTOFF above. Never fires on a
  // record opened before the cutoff, and never fires when Artifact: itself doesn't even
  // shape-parse (accepted-without-artifact already covers that emptier case).
  if (
    isAccepted
    && fields.opened !== undefined
    // An unparseable Opened: is unknown, not grandfathered: NaN < cutoff is false, so it fires.
    && !(Date.parse(fields.opened) < ACCEPTED_WITHOUT_CHECK_CUTOFF)
    && fields.artifact !== undefined
    && fields.artifact !== "none"
  ) {
    let expectedShaPrefix = null;
    try {
      expectedShaPrefix = artifactRevision(fields.artifact).toLowerCase();
    } catch {
      expectedShaPrefix = null;
    }
    const acceptedThroughCode = expectedShaPrefix !== null && log.some((l) => {
      if ((l.status ?? "").toLowerCase() !== "accepted") return false;
      const m = /^artifact[ \t]+([0-9a-f]{40})$/i.exec((l.note ?? "").trim());
      return m !== null && m[1].toLowerCase().startsWith(expectedShaPrefix);
    });
    // Seam S3: expectedShaPrefix is null whenever Artifact: doesn't resolve to a git
    // revision at all (a doc-only Artifact: path, for example) — accepted-without-check
    // is about a hand-edited Status: bypassing the git-backed `accept` check, and a
    // record with no git-shaped Artifact: was never a candidate for that check in the
    // first place. Only fire when there WAS a resolvable sha to look for in Log:.
    if (expectedShaPrefix !== null && !acceptedThroughCode) {
      findings.push({
        code: "accepted-without-check",
        level: "finding",
        message: "Status: accepted but no Log: accepted ... artifact <40-hex> line names this record's own Artifact: — Status may have been hand-edited rather than moved by `work-record.mjs accept`",
      });
    }
    // C2: a Log: accepted line naming the right artifact is no longer sufficient on its
    // own once CENSUS_REQUIRED_CUTOFF applies - `acceptRecord` always writes at least one
    // Census: line, so a record with none was never moved by it, even when the Log: line
    // was copied to imitate one that was.
    if (
      expectedShaPrefix !== null && acceptedThroughCode
      && !(Date.parse(fields.opened) < CENSUS_REQUIRED_CUTOFF)
      && (record.census ?? []).length === 0
    ) {
      findings.push({
        code: "accepted-without-check",
        level: "finding",
        message: "Status: accepted with no Census: line - accepted without `accept --census <file>` or `--no-census \"<reason>\"`",
      });
    }
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
// Seam S2: the loop's REVIEW_MANDATE and reviewer briefs ask for a `VERDICT: NEEDS_FIXES
// (<n>)` first line (a parenthesised finding count, never a sha in that position);
// tolerate that count so a historical NEEDS_FIXES report still counts as history instead
// of aborting acceptance outright ("malformed deciding verdict"). It never becomes a
// deciding APPROVE — DECIDING_VERDICTS and the "approval omits a revision" check below
// are unchanged.
const VERDICT_RE = /^VERDICT:[ \t]*(APPROVE|NEEDS_FIXES|FAIL|REJECTED)(?:[ \t]+\(\d{1,4}\))?(?:[ \t]+(?:—[ \t]+)?([0-9a-fA-F]{4,64}))?[ \t]*$/;

function acceptanceError(message, code = "acceptance-failed") {
  const error = new Error(message);
  error.code = code;
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

function resolveCommit(repoRoot, revision, label, spawnImpl) {
  if (!revision) throw acceptanceError(`${label} revision is missing`);
  try {
    const result = spawnImpl("git", ["-C", repoRoot, "-c", "core.warnAmbiguousRefs=true", "rev-parse", "--verify", `${revision}^{commit}`], {
      encoding: "utf8",
      stdio: "pipe",
    });
    if (result.error || result.status !== 0 || String(result.stderr ?? "").trim()) {
      throw result.error ?? new Error(String(result.stderr ?? "Git could not resolve revision").trim());
    }
    const resolved = String(result.stdout ?? "").trim();
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
  let fence = null;
  let quotedParagraph = false;
  for (let i = 0; i < body.length; i += 1) {
    const line = body[i];
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.char}{${fence.length},}[ \\t]*$`);
      if (close.test(line)) fence = null;
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (opening && !(opening[1][0] === "`" && opening[2].includes("`"))) {
      fence = { char: opening[1][0], length: opening[1].length };
      quotedParagraph = false;
      continue;
    }
    if (/^[ \t]*$/.test(line)) {
      quotedParagraph = false;
      continue;
    }
    if (/^ {0,3}>/.test(line)) {
      quotedParagraph = true;
      continue;
    }
    if (quotedParagraph) continue;
    const match = /^Observed:[ \t]*(.+?)[ \t]*$/i.exec(line);
    if (!match || !match[1].trim()) continue;
    const previous = i === 0 ? null : body[i - 1];
    const predictsStartsParagraph = i >= 1 && /^Predicts:[ \t]*\S.*$/i.test(previous)
      && (i === 1 || /^[ \t]*$/.test(body[i - 2]));
    if (i === 0 || /^[ \t]*$/.test(previous) || predictsStartsParagraph) return;
  }
  throw acceptanceError("record body requires a nonempty Observed: top-level paragraph at body start, after a blank line, or immediately after top-level Predicts:");
}

function requireStrictRecordShape(text, record) {
  if (record.errors.length > 0) throw acceptanceError(`record parse error: ${record.errors.join("; ")}`);
  const lines = text.split(/\r?\n/);
  const blank = lines.findIndex((line) => line.trim() === "");
  const header = blank === -1 ? lines : lines.slice(0, blank);
  const counts = new Map();
  const strictHeaderRe = /^[ \t*+-]{0,20}([A-Za-z][A-Za-z ]{0,40}):\**[ \t]{0,20}(.*)$/;
  for (const line of header) {
    const match = line.match(strictHeaderRe);
    if (!match) continue;
    const label = match[1].trim().toLowerCase();
    if (!KNOWN_LABELS.has(label)) throw acceptanceError(`unknown label: ${match[1].trim()}`);
    const key = SINGLETON_LABELS.get(label);
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

// ── Census recognition (C2, "acceptance requires the census") ──────────────────────
//
// ASSUMPTION PINNED HERE, for the seam reviewer to reconcile against whatever C1's
// scripts/build-census.mjs actually lands with (C1 is a PARALLEL build; this file
// cannot import it or read its final field names, and never does - it only ever reads
// the census file's own bytes): a real census report's FIRST LINE begins with the
// literal `VERDICT: COUNTED` - the exact contract already documented in docs/census.md
// and produced by build-census.mjs at this build's base commit (2869798). That is the
// "header line" a census file is "recognised by" (spec.md C2 item 1). A file whose
// first line does not match this is refused outright - never parsed loosely, never
// treated as an empty-but-valid census (reviewer attack brief).
const CENSUS_HEADER_RE = /^VERDICT: COUNTED\b/;

export function isCensusFile(text) {
  const firstLine = (text.split(/\r?\n/, 1)[0] ?? "").trim();
  return CENSUS_HEADER_RE.test(firstLine);
}

// Copies the census's own summary lines verbatim, in file order, with no global
// dedupe - this file never re-derives a number from raw transcript data (it never
// reads one): (a) every top-level bullet line (bold-valued or not - a differently
// formatted field, like a plain "- by-model: x=1" line, is never silently dropped
// just because it isn't wrapped in `**`); (b) any line naming `leadTurns` or "wall
// clock" outside that bullet shape; (c) whole markdown table sections (heading +
// every row) whose heading OR first header cell mentions "model" or "role" - the
// by-model and by-role tables spec.md names, including a second table whose rows
// happen to duplicate an earlier one (e.g. a whole-file table and a windowed table
// with identical rows - both are real, distinct facts, so neither is dropped as a
// "duplicate"). (T1/C2 round-2 review, MAJOR 1: an earlier global-dedupe version
// silently emptied a real by-model table whenever its rows matched an earlier
// table's rows, and skipped every non-bold summary bullet - "copied faithfully"
// was not true on the script's real output.)
export function extractCensusSummary(text) {
  const lines = text.split(/\r?\n/).slice(1).map((l) => l.trim());
  const summary = [];
  let heading = null;
  let table = [];
  const flushTable = () => {
    const firstCell = ((table[0] ?? "").split("|")[1] ?? "").trim();
    if (table.length > 0 && (/model|role/i.test(heading ?? "") || /^(model|role)$/i.test(firstCell))) {
      if (heading) summary.push(heading);
      summary.push(...table);
      heading = null;
    }
    table = [];
  };
  for (const t of lines) {
    if (t.startsWith("|")) {
      table.push(t);
      continue;
    }
    flushTable();
    if (/^#{1,6}\s+/.test(t)) {
      heading = t;
    } else if (/^-\s+[^:]+:\s*\S/.test(t) || /\bleadTurns\b/.test(t) || /wall[ -]?clock/i.test(t)) {
      summary.push(t);
    }
  }
  flushTable();
  return summary;
}

// The census's own currency signal (T1/C2 fix round, MAJOR C2 - rewritten from scratch):
// reads ONLY the `leadLastMessageAt: <ISO>` field build-census.mjs writes on its own
// header (first) line - never any other ISO-8601-looking substring anywhere else in the
// report. The earlier version scanned the WHOLE text for the latest ISO timestamp it
// could find, which let ANY free text carrying an ISO-looking string rescue a stale
// census - independently reproduced with a --role-map label literally named
// `review-2026-09-26T00:00:00Z` (a role name, not an event time): the label's embedded
// date was picked up as "the census timestamp" and a genuinely stale census passed
// acceptance. A role label, a file path, or any other annotation must never be read as
// this field - "spec.md C2 item 2" requires the lead session's own mtime/last-message
// time, and only this one named field stands in for it. Returns epoch ms, or null when
// the field is missing or unparsable anywhere in the text - census-stale then fails
// closed on that null rather than treating an unknown as an agreeing one.
const LEAD_LAST_MESSAGE_AT_RE = /\bleadLastMessageAt:\s*(\S+)/;

export function extractCensusTimestamp(text) {
  // Deliberately restricted to the FIRST LINE ONLY (the header line
  // build-census.mjs writes the field on) - never scanned across the whole report, so no
  // amount of adversarial free text elsewhere (a role name, a file path, a table cell)
  // can ever be mistaken for this field.
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const match = LEAD_LAST_MESSAGE_AT_RE.exec(firstLine);
  if (!match) return null;
  const t = Date.parse(match[1]);
  return Number.isNaN(t) ? null : t;
}

// INCOMPLETE means the census ran but a default subagent directory (or an individual
// subagent file) could not be read - the report's totals are missing an unknown amount,
// not a real, quoted-safe zero (build-census.mjs's own INCOMPLETE idiom, docs/census.md).
// `accept --census` must refuse such a census outright rather than copying partial
// totals into the record as if they were whole ones - `--no-census "<reason>"` remains
// the one explicit, visible way past a broken census. Read from the recognised census's
// Summary section only (an `- INCOMPLETE: ...` bullet - the one line
// `extractCensusSummary` already carries into the record's own `Census:` lines), never
// from arbitrary prose that happens to contain the word.
const INCOMPLETE_SUMMARY_RE = /^-\s*INCOMPLETE:/i;

export function isIncompleteCensus(summary) {
  return summary.some((line) => INCOMPLETE_SUMMARY_RE.test(line));
}

// The record's own currency signal: the latest `Log: ... reviewed ...` entry's `at`,
// or null when none exists, OR when any reviewed entry's `at` is unparseable - census-stale
// fails closed on that null rather than skipping the comparison silently, or (T1/C2
// round-2 review, MINOR 3) silently falling back to an earlier, parseable review entry
// while a later, unparseable one (e.g. a hand-written "Log: tonight reviewed ...") goes
// unnoticed. An unknown review time is never skipped in favor of a known-earlier one.
function lastReviewLogAt(record) {
  const reviewed = (record.log ?? []).filter((l) => (l.status ?? "").toLowerCase() === "reviewed");
  if (reviewed.length === 0) return null;
  let best = null;
  for (const l of reviewed) {
    const t = Date.parse(l.at);
    if (Number.isNaN(t)) return null;
    if (best === null || t > Date.parse(best.at)) best = l;
  }
  return best.at;
}

// Reads a --census source. Unlike evidence, a fresh census report legitimately lives
// OUTSIDE the repo (the whole point of `accept --census` is to bring it in), so this is
// deliberately NOT readConfinedRegularFile - no repo-confinement check - but it still
// refuses a missing, unreadable, or non-regular-file path instead of guessing.
function readCensusSource(censusPath, fsImpl) {
  if (!censusPath) throw acceptanceError("--census path is missing", "census-missing");
  let real;
  let stat;
  try {
    real = fsImpl.realpathSync(censusPath);
    stat = fsImpl.statSync(real);
  } catch (error) {
    throw acceptanceError(`unreadable --census path: ${censusPath} (${error.message})`, "census-missing");
  }
  if (!stat.isFile()) throw acceptanceError(`--census path is not a regular file: ${censusPath}`, "census-missing");
  try {
    return fsImpl.readFileSync(real, "utf8");
  } catch (error) {
    throw acceptanceError(`unreadable --census path: ${censusPath} (${error.message})`, "census-missing");
  }
}

// opts: { censusPath, fsImpl } -> { text, summary, timestamp, incomplete }. Throws
// census-missing (not a generic parse error) when the file doesn't begin with the
// recognised header - "a file lacking the header is refused, not parsed loosely"
// (reviewer attack brief).
function loadCensus(censusPath, fsImpl) {
  const text = readCensusSource(censusPath, fsImpl);
  if (!isCensusFile(text)) {
    throw acceptanceError(
      `census file does not begin with the census header line, refused: ${censusPath}`,
      "census-missing",
    );
  }
  const summary = extractCensusSummary(text);
  return { text, summary, timestamp: extractCensusTimestamp(text), incomplete: isIncompleteCensus(summary) };
}

/**
 * Strict, read-only Git-backed acceptance check. Historical validateRecord behavior remains
 * deliberately separate. opts: { repoRoot, recordPath, deliveryRef?, pinnedArtifact?, fsImpl?, spawnImpl?, execImpl? }
 */
export function checkAcceptance(opts = {}) {
  const fsImpl = opts.fsImpl ?? fs;
  const spawnImpl = opts.spawnImpl ?? (opts.execImpl
    ? (command, args, childOpts) => {
        try {
          return { status: 0, stdout: opts.execImpl(command, args, childOpts), stderr: "" };
        } catch (error) {
          return { status: 1, stdout: "", stderr: error.message, error };
        }
      }
    : spawnSync);
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

  // census-stale (C2 spec item 2): opt-in here - only runs when a caller passes
  // --census, so every census-agnostic caller (check-acceptance's existing read-only
  // uses, and every pre-census test of this function) is unaffected. The MANDATORY
  // requirement to provide one (or an explicit --no-census reason) lives only in
  // acceptRecord below, the sole path that can ever flip Status: to accepted - this
  // function stays a read-only preview either way.
  // T1/C2 round-2 review, MINOR 5: censusText is captured here and returned so
  // acceptRecord's own (necessarily separate) read of the same --census path can be
  // compared against it, rather than trusting a second, later read of a file that could
  // have changed bytes in between.
  let censusText;
  if (opts.censusPath !== undefined) {
    const census = loadCensus(opts.censusPath, fsImpl);
    censusText = census.text;
    // census-incomplete (T1/C2 fix round, item 1's other half): a census that ran but
    // could not enumerate a default subagent directory (or read a subagent file) is
    // visibly INCOMPLETE, never a confident-looking partial total. accept --census
    // refuses it outright, exactly like census-missing/census-stale - --no-census
    // "<reason>" remains the one explicit, visible escape past a broken census.
    if (census.incomplete) {
      throw acceptanceError(
        `census-incomplete: the census file reports itself INCOMPLETE (a subagent file or default directory could not be read) - use --no-census "<reason>" to accept visibly unmeasured instead: ${opts.censusPath}`,
        "census-incomplete",
      );
    }
    const reviewedAt = lastReviewLogAt(record);
    const reviewedMs = reviewedAt === null ? NaN : Date.parse(reviewedAt);
    // Fails closed on EITHER side being unknown - a record with no Log: reviewed entry,
    // or a census with no parseable timestamp at all - rather than treating an unknown
    // as an agreeing one (the failure class this whole build guards against).
    if (reviewedAt === null || Number.isNaN(reviewedMs) || census.timestamp === null) {
      throw acceptanceError(
        "census-stale: no comparable timestamp - a Log: reviewed entry on the record and a timestamp inside the census file are both required, and at least one is missing",
        "census-stale",
      );
    }
    if (census.timestamp < reviewedMs) {
      throw acceptanceError(
        `census-stale: the census file predates the record's last review (Log: ... reviewed ... at ${reviewedAt})`,
        "census-stale",
      );
    }
  }

  // A SHA git does not have at all is sha-not-in-git (T1 required item 4), the same code
  // as an unresolvable Worktree: below - both are "the recorded commit identity does not
  // exist in this git" - not the generic acceptance-failed used for shape errors.
  let artifact;
  try {
    artifact = resolveCommit(repoRoot, artifactRevision(record.fields.artifact), "Artifact", spawnImpl);
  } catch (error) {
    throw acceptanceError(`sha-not-in-git: ${error.message}`, "sha-not-in-git");
  }
  const deliveryInput = opts.deliveryRef !== undefined ? opts.deliveryRef : opts.pinnedArtifact;
  if (opts.pinnedArtifact !== undefined && !/^[0-9a-fA-F]{4,64}$/.test(opts.pinnedArtifact)) {
    throw acceptanceError(`pinned artifact must be an explicit hexadecimal revision: ${opts.pinnedArtifact}`);
  }
  const delivery = resolveCommit(repoRoot, deliveryInput, opts.deliveryRef !== undefined ? "delivery ref" : "pinned artifact", spawnImpl);
  if (artifact !== delivery) {
    throw acceptanceError(`Artifact ${artifact} does not match delivery ${delivery}`);
  }

  // sha-not-in-git (T1, loop-gates spec item 2): the record must independently name the
  // git worktree or branch that produced Artifact: (Worktree:), and that path's live HEAD
  // must be a real, git-resolvable commit - never trusted from a caller-supplied ref
  // alone, and never a self-reported agent value. An old record with no Worktree: field
  // fails closed here instead of silently passing acceptance.
  const worktreeField = record.fields.worktree;
  if (!worktreeField) {
    throw acceptanceError(
      "Worktree: field is required (the git worktree or branch this artifact came from); none is present",
      "sha-not-in-git",
    );
  }
  // T1 (loop-gates spec item 2, "branch or worktree"): Worktree: may name an absolute
  // path, a repo-relative path, OR a local branch name. A real directory is read as a
  // live worktree (its own HEAD); anything else is read as `refs/heads/<name>` in this
  // repo - never a bare revision expression, so a leading "-" can never be read as an
  // option by the git child process.
  const worktreeTarget = path.isAbsolute(worktreeField) ? worktreeField : path.resolve(repoRoot, worktreeField);
  let worktreeIsDir = false;
  try {
    worktreeIsDir = fsImpl.statSync(worktreeTarget).isDirectory();
  } catch {
    worktreeIsDir = false;
  }
  const worktreeGitDir = worktreeIsDir ? worktreeTarget : repoRoot;
  const worktreeRev = worktreeIsDir ? "HEAD^{commit}" : `refs/heads/${worktreeField}^{commit}`;
  const worktreeResult = spawnImpl("git", ["-C", worktreeGitDir, "rev-parse", "--verify", worktreeRev], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (worktreeResult.error || worktreeResult.status !== 0 || String(worktreeResult.stderr ?? "").trim()) {
    throw acceptanceError(`sha-not-in-git: could not resolve HEAD in Worktree: ${worktreeField}`, "sha-not-in-git");
  }
  const worktreeHead = String(worktreeResult.stdout ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/i.test(worktreeHead)) {
    throw acceptanceError(`sha-not-in-git: Worktree: ${worktreeField} did not resolve to a commit`, "sha-not-in-git");
  }
  // Freshness (the worktree's live HEAD really is the delivered sha) is only meaningful in
  // live-delivery mode: pinned mode deliberately targets a fixed, possibly-historical
  // artifact ("a source artifact may differ from the merge head", SKILL.md), so a worktree
  // that has since moved on is not itself a finding there - only an unresolvable one is.
  if (opts.deliveryRef !== undefined && worktreeHead !== artifact) {
    throw acceptanceError(
      `sha-not-in-git: Worktree: ${worktreeField} HEAD (${worktreeHead}) does not match delivery ${artifact}`,
      "sha-not-in-git",
    );
  }
  // Pinned mode still requires SOME relationship between the artifact and the named
  // worktree/branch: not equality (a pinned artifact may be historical), but ancestry - the
  // artifact must be reachable from that worktree's HEAD. Without this, an artifact that
  // lives only on a wholly unrelated branch (or in a wholly unrelated repository) would
  // pass pinned mode merely because Worktree: resolves to *some* commit, which is a check
  // that passes because it isn't looking (T1 round-2 review, MAJOR 2).
  if (opts.pinnedArtifact !== undefined && worktreeHead !== artifact) {
    const ancestry = spawnImpl("git", ["-C", worktreeGitDir, "merge-base", "--is-ancestor", artifact, worktreeHead], {
      encoding: "utf8",
      stdio: "pipe",
    });
    if (ancestry.error || ancestry.status !== 0) {
      throw acceptanceError(
        `sha-not-in-git: Artifact ${artifact} is not in the history of Worktree: ${worktreeField} (HEAD ${worktreeHead})`,
        "sha-not-in-git",
      );
    }
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
    const reportCommit = resolveCommit(repoRoot, verdict[2], `evidence ${evidencePath}`, spawnImpl);
    if (reportCommit !== artifact) continue;
    if (verdict[1] === "APPROVE") approved = true;
    else blockers.push(`${verdict[1]} in ${evidencePath}`);
  }
  if (blockers.length > 0) throw acceptanceError(`current artifact has refusing evidence: ${blockers.join(", ")}`);
  if (!approved) throw acceptanceError("no evidence has an exact APPROVE verdict for the current artifact");

  // censusText is only ever present as a key when --census was actually given - every
  // pre-census caller (and every census-agnostic call, like check-acceptance without
  // --census) keeps the exact result shape it always had.
  return censusText !== undefined
    ? { ok: true, work: record.fields.work, artifact, delivery, censusText }
    : { ok: true, work: record.fields.work, artifact, delivery };
}

/**
 * Accept path (T1, loop-gates spec item 1): the ONLY code-mediated way a record's Status:
 * moves to `accepted`. Always runs checkAcceptance first, with the exact opts it was
 * given - a failing check throws before anything on disk is touched, so there is no
 * argument, flag, or alternate route here that can transition a record checkAcceptance
 * would refuse. `check-acceptance` itself stays read-only, unchanged, for manual use;
 * this is a separate, additive entry point, not a replacement.
 *
 * Census requirement (C2, "acceptance requires the census"): exactly one of
 * opts.censusPath / opts.noCensusReason is required, checked here - never in
 * checkAcceptance, which stays census-agnostic for every caller that doesn't opt in
 * (check-acceptance's existing read-only uses included) - `accept` is the only path
 * that can ever mark a record accepted, so it is the only path this requirement can be
 * enforced on without breaking every pre-census caller of checkAcceptance itself.
 * opts: same as checkAcceptance, plus optional { now }, plus { censusPath } XOR
 * { noCensusReason } (non-empty).
 */
export function acceptRecord(opts = {}) {
  const fsImpl = opts.fsImpl ?? fs;

  const censusGiven = opts.censusPath !== undefined;
  const noCensusGiven = opts.noCensusReason !== undefined;
  if (censusGiven === noCensusGiven) {
    throw acceptanceError(
      censusGiven
        ? "exactly one of --census or --no-census is allowed, not both"
        : '--census <file> is required to accept (or --no-census "<reason>" to skip it visibly)',
      "census-missing",
    );
  }
  let noCensusReason = null;
  if (noCensusGiven) {
    // T1/C2 round-2 review, MINOR 6: collapse any internal whitespace (including
    // newlines) to a single space, not just trim the ends - a reason containing a
    // newline would otherwise inject a second header line into the record (or, worse,
    // end the header early on a blank line inside it), corrupting later parses.
    noCensusReason = String(opts.noCensusReason).replace(/\s+/g, " ").trim();
    if (!noCensusReason) throw acceptanceError('--no-census requires a non-empty reason', "census-missing");
  }

  // T1 round-2 review, MINOR 4 (time-of-check/time-of-use): capture the record's exact
  // bytes BEFORE checkAcceptance runs, so an edit that lands during the check (between
  // this read and the write below) is caught rather than silently accepted. Any failure
  // here is deliberately swallowed - checkAcceptance below re-derives the same path and
  // reports the real reason (bad repo, escaping path, etc.) itself.
  let preCheckRepoRoot;
  let preCheckRepoReal;
  let preCheckText;
  try {
    preCheckRepoRoot = path.resolve(opts.repoRoot);
    preCheckRepoReal = fsImpl.realpathSync(preCheckRepoRoot);
    preCheckText = readConfinedRegularFile(preCheckRepoReal, preCheckRepoRoot, opts.recordPath, fsImpl);
  } catch {
    preCheckText = undefined;
  }

  const result = checkAcceptance(opts); // fails closed: throws before any write below (also runs census-stale when censusPath is set)

  const repoRoot = path.resolve(opts.repoRoot);
  const repoReal = fsImpl.realpathSync(repoRoot);
  const text = readConfinedRegularFile(repoReal, repoRoot, opts.recordPath, fsImpl);
  if (preCheckText !== undefined && text !== preCheckText) {
    throw acceptanceError("record changed during acceptance: re-run accept against the current text");
  }
  const statusRe = /^([ \t*+-]{0,20}Status:\**[ \t]{0,20})reviewed([ \t]*)$/mi;
  if (!statusRe.test(text)) {
    throw acceptanceError("could not find a Status: reviewed header line to accept");
  }
  const record = parseRecord(text);

  // Build the Census: header lines, and (with --census) a copy of the whole census file
  // to store next to the record's own evidence (spec.md C2 item 1) - re-validated here
  // (not just trusted from checkAcceptance's own read) so accept never writes a Census:
  // line it hasn't itself confirmed carries the recognised header.
  let censusLines;
  let censusCopy = null; // { destRelative, text } or null when --no-census was used
  if (censusGiven) {
    const census = loadCensus(opts.censusPath, fsImpl);
    // T1/C2 round-2 review, MINOR 5 (TOCTOU on the census file itself): checkAcceptance
    // above already read and validated this same --census path once (its census-stale
    // check ran against those exact bytes). This is a second, independent read; if the
    // file changed in between, the copy stored next to the record and the Census: lines
    // written below could come from bytes that never passed census-stale at all. Fail
    // closed rather than silently accepting the newer bytes.
    if (result.censusText !== undefined && census.text !== result.censusText) {
      throw acceptanceError(
        "census file changed during acceptance: re-run accept against the current --census file",
        "census-stale",
      );
    }
    censusLines = census.summary.length > 0
      ? census.summary.map((l) => `Census: ${l}`)
      // Never a silent, confident-looking blank: a recognised-but-empty census still
      // says so visibly, rather than writing zero Census: lines (an unknown rendered
      // as "nothing to report").
      : ["Census: (census file recognized but produced no summary lines to copy)"];
    const evidenceList = Array.isArray(record.fields.evidence) ? record.fields.evidence : [];
    const evidenceDir = evidenceList.length > 0
      ? path.posix.dirname(evidenceList[0].replace(/\\/g, "/"))
      : "docs/work/evidence";
    const workId = record.fields.work || "census";
    censusCopy = { destRelative: path.posix.join(evidenceDir, `${workId}-census.md`), text: census.text };
  } else {
    censusLines = [`Census: skipped — ${noCensusReason}`];
  }

  const at = (opts.now ?? new Date()).toISOString();
  const logLine = formatLogLine(at, "accepted", record.fields.owner ?? "", `artifact ${result.artifact}`);

  const lines = text.split(/\r?\n/);
  const blankIdx = lines.findIndex((line) => line.trim() === "");
  const insertAt = blankIdx === -1 ? lines.length : blankIdx;
  lines.splice(insertAt, 0, ...censusLines, logLine);
  const updated = lines.join("\n").replace(statusRe, (m, pre, post) => `${pre}accepted${post}`);

  if (censusCopy) {
    const destAbs = path.resolve(repoRoot, censusCopy.destRelative);
    fsImpl.mkdirSync(path.dirname(destAbs), { recursive: true });
    fsImpl.writeFileSync(destAbs, censusCopy.text);
  }
  const absPath = path.resolve(repoRoot, opts.recordPath);
  fsImpl.writeFileSync(absPath, updated);
  // censusText was only ever an internal comparison value (MINOR 5 above) - never part
  // of the public result shape (it could be an entire census report's worth of bytes).
  const { censusText: _censusText, ...publicResult } = result;
  return { ...publicResult, path: absPath };
}

export function parseAcceptanceArgs(argv) {
  if (argv[0] !== "check-acceptance" && argv[0] !== "accept") {
    throw acceptanceError("expected command: check-acceptance or accept");
  }
  const opts = { command: argv[0] };
  const names = new Map([
    ["--record", "recordPath"], ["--repo", "repoRoot"],
    ["--delivery-ref", "deliveryRef"], ["--pinned-artifact", "pinnedArtifact"],
    ["--census", "censusPath"], ["--no-census", "noCensusReason"],
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
    const { command, ...opts } = parseAcceptanceArgs(argv);
    const result = command === "accept" ? acceptRecord(opts) : checkAcceptance(opts);
    // censusText (MINOR 5) is an internal comparison value only, never part of the CLI's
    // printed result - it can be an entire census report's worth of bytes.
    const { censusText: _censusText, ...printable } = result;
    io.stdout.write(`${JSON.stringify(printable)}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`work-record: [${error.code ?? "error"}] ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = acceptanceMain();
}
