// artifact-registry — append/list/close lines in a project's artifact registry (JSONL, one JSON
// object per line, one record per `contracts/artifact.schema.json`).
//
// Concurrent-writer safety: `appendArtifact` opens the file with the O_APPEND flag and writes the
// whole line in ONE write() call — POSIX guarantees that append-mode writes up to PIPE_BUF (4096
// bytes on Linux) are atomic, so two writers never interleave a line. `closeArtifact` (which removes
// lines, and so must rewrite the file) NEVER edits in place: it writes the filtered content to a temp
// file in the same directory and `fs.renameSync`s over the original, which is atomic on the same
// filesystem. Readers (`listArtifacts`) tolerate a missing file and skip any line that fails to parse
// or fails validation — a malformed line is data corruption, not a crash.
//
// No schema-validation dependency (this repo has none) — `validateArtifact` checks the
// `artifact.schema.json` fields by hand and must be kept in sync with that file if it changes.

import { readFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, appendFileSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";

export const ARTIFACT_KINDS = Object.freeze(["worktree", "branch", "scratch", "packet", "state", "other"]);

/** Resolve a project-config-relative registry path (e.g. ".agents/artifacts.jsonl") against a root. */
export function resolveRegistryPath(root, artifactRegistry) {
  if (isAbsolute(artifactRegistry)) return artifactRegistry;
  return join(root, artifactRegistry);
}

/**
 * Hand-checked mirror of contracts/artifact.schema.json. Returns { valid, errors }.
 * Unknown extra keys are rejected (the schema is additionalProperties:false).
 */
export function validateArtifact(record, extraKinds = []) {
  const errors = [];
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return { valid: false, errors: ["record is not an object"] };
  }
  const required = ["ref", "kind", "owner", "purpose", "end_condition", "created"];
  for (const key of required) {
    if (!(key in record)) errors.push(`missing required field: ${key}`);
  }
  const allowedKeys = new Set([...required, "created_by_tool"]);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) errors.push(`unknown field: ${key}`);
  }
  if ("ref" in record && typeof record.ref !== "string") errors.push("ref must be a string");
  const kinds = new Set([...ARTIFACT_KINDS, ...extraKinds]);
  if ("kind" in record && !kinds.has(record.kind)) errors.push(`kind must be one of ${[...kinds].join(", ")}`);
  if ("owner" in record && typeof record.owner !== "string") errors.push("owner must be a string");
  if ("purpose" in record) {
    if (typeof record.purpose !== "string") errors.push("purpose must be a string");
    else if (record.purpose.length > 200) errors.push("purpose exceeds 200 chars");
  }
  if ("end_condition" in record && typeof record.end_condition !== "string") errors.push("end_condition must be a string");
  if ("created_by_tool" in record && typeof record.created_by_tool !== "boolean") errors.push("created_by_tool must be a boolean");
  if ("created" in record) {
    if (typeof record.created !== "string" || Number.isNaN(Date.parse(record.created))) {
      errors.push("created must be an ISO date-time string");
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Append one validated record as a single JSONL line. Throws on an invalid record (a programmer
 * error the caller should fix, not a runtime condition to fail open on).
 */
export function appendArtifact(record, { registryPath, extraKinds = [] }) {
  const { valid, errors } = validateArtifact(record, extraKinds);
  if (!valid) throw new Error(`invalid artifact record: ${errors.join("; ")}`);
  mkdirSync(dirname(registryPath), { recursive: true });
  // JSON.stringify escapes control characters (incl. newlines) inside string values, so the
  // serialized record is always exactly one line.
  appendFileSync(registryPath, `${JSON.stringify(record)}\n`, { flag: "a" });
}

/**
 * Read every line. Returns { entries, malformedCount } — entries is an array of
 * { record, line } for lines that parse AND validate; a line that fails either is dropped and
 * counted, never thrown. A missing file returns an empty, valid result (fail open).
 */
export function listArtifacts({ registryPath, extraKinds = [] }) {
  if (!existsSync(registryPath)) return { entries: [], malformedCount: 0 };
  let raw;
  try {
    raw = readFileSync(registryPath, "utf8");
  } catch {
    return { entries: [], malformedCount: 0 };
  }
  const entries = [];
  let malformedCount = 0;
  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      malformedCount += 1;
      continue;
    }
    const { valid } = validateArtifact(record, extraKinds);
    if (!valid) {
      malformedCount += 1;
      continue;
    }
    entries.push({ record, line: trimmed });
  }
  return { entries, malformedCount };
}

/**
 * Remove every line whose record matches `ref` (and `created`, when given, to disambiguate two
 * artifacts that reused the same ref). Rewrites via temp-file + rename, never in place. Returns the
 * number of lines removed. A missing registry file is a no-op (0 removed), never an error.
 */
export function closeArtifact({ ref, created }, { registryPath, extraKinds = [] }) {
  if (!existsSync(registryPath)) return 0;
  const { entries } = listArtifacts({ registryPath, extraKinds });
  let removed = 0;
  const kept = [];
  for (const { record } of entries) {
    const matches = record.ref === ref && (created === undefined || record.created === created);
    if (matches) removed += 1;
    else kept.push(record);
  }
  if (removed === 0) return 0;
  const dir = dirname(registryPath);
  const tmpDir = mkdtempSync(join(dir, ".artifact-registry-tmp-"));
  const tmpFile = join(tmpDir, "artifacts.jsonl");
  try {
    const body = kept.map((r) => JSON.stringify(r)).join("\n") + (kept.length ? "\n" : "");
    appendFileSync(tmpFile, body, { flag: "w" });
    renameSync(tmpFile, registryPath);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  return removed;
}

/**
 * Interpret an `end_condition` string against the present moment. Only mechanically checkable
 * shapes are ever reported "met" — anything else (including free-text conditions like
 * "run-terminal") is reported unmet, because we cannot verify it and a false "met" would let a
 * SAFE-class action fire on a guess.
 *   - "date:YYYY-MM-DD"  -> met once `now` is on or after that date.
 *   - "branch-merged"    -> met when the caller's `isMerged(ref)` predicate returns true; with no
 *                           predicate supplied, unmet (unverifiable).
 *   - anything else      -> unmet.
 */
export function endConditionMet(record, { now = new Date(), isMerged } = {}) {
  const cond = record?.end_condition;
  if (typeof cond !== "string") return false;
  const dateMatch = cond.match(/^date:(\d{4}-\d{2}-\d{2})$/);
  if (dateMatch) {
    const due = new Date(`${dateMatch[1]}T00:00:00Z`);
    if (Number.isNaN(due.getTime())) return false;
    return now.getTime() >= due.getTime();
  }
  if (cond === "branch-merged") {
    if (typeof isMerged !== "function") return false;
    try {
      return Boolean(isMerged(record.ref));
    } catch {
      return false;
    }
  }
  return false;
}
