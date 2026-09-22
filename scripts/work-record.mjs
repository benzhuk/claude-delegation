// Work record contract stub. Pinned in next-build/spec.md, C1 and C2. Territory T1 fills the
// bodies; every other territory imports these names and tests against hand-written fixtures.
// Header lines in a record match /^[ \t*+-]{0,20}<Label>:\**[ \t]{0,20}(.+)$/mi, the dispatch
// guard's bounded shape: a [ \t]-only class with an explicit {0,20} bound, never \s.

import fs from "node:fs";
import path from "node:path";

export const STATUSES = ["runnable", "owned", "delivered", "rejected", "reviewed", "accepted", "blocked"];
export const REQUIRED_FIELDS = ["work", "scope", "owner", "status", "authority", "artifact", "evidence", "next", "opened"];
export const OPTIONAL_FIELDS = ["children", "builder", "rounds", "class"];
export const FINDING_CODES = [
  "missing-field", "bad-status", "bad-work-id", "accepted-without-artifact", "accepted-without-evidence",
  "evidence-missing", "evidence-no-verdict", "stale-result-candidate", "scope-drift", "workaround-overdue",
  "evidence-unreachable", "bugfix-gate-missing",
];

const FIELD_LABELS = [
  ["work", "Work"], ["scope", "Scope"], ["owner", "Owner"], ["status", "Status"],
  ["authority", "Authority"], ["artifact", "Artifact"], ["evidence", "Evidence"],
  ["next", "Next"], ["opened", "Opened"], ["children", "Children"],
  ["builder", "Builder"], ["rounds", "Rounds"], ["class", "Class"],
];
const LIST_FIELDS = new Set(["evidence", "children"]);
const KNOWN_LABELS = new Set([...FIELD_LABELS.map(([, l]) => l.toLowerCase()), "workaround", "log"]);
const HEADER_LINE_RE = /^[ \t*+-]{0,20}([A-Za-z][A-Za-z ]*):\**[ \t]{0,20}(.+)$/;

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
    workarounds.push({ cause: parts[0] ?? "", blockedBy: parts[1] ?? "", removeWhen: parts[2] ?? "" });
  }

  const log = [];
  const logRe = /^[ \t*+-]{0,20}Log:\**[ \t]{0,20}(.+)$/gim;
  for (const lm of headerText.matchAll(logRe)) {
    const value = rtrim(lm[1]).trim();
    const parts = value.match(/^(\S+)[ \t]+(\S+)[ \t]+(\S+)(?:[ \t]+(.*))?$/);
    if (!parts) {
      errors.push(`malformed Log line: ${value}`);
      continue;
    }
    log.push({ at: parts[1], status: parts[2], owner: parts[3], note: rtrim(parts[4] ?? "").trim() });
  }

  return { fields, workarounds, log, errors };
}

// opts: { fsImpl, now, repoRoot, gitDir, ref } -> [{ code, level: "finding"|"info", message }]
export function validateRecord(record, opts = {}) {
  throw new Error("not implemented: validateRecord (territory T1)");
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
      return { path: p, record: parseRecord(fsImpl.readFileSync(p, "utf8")) };
    });
}

export function formatLogLine(at, status, owner, note) {
  const base = `Log: ${at} ${status} ${owner}`;
  return note ? `${base} ${note}` : base;
}
