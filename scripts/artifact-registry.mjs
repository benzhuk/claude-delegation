// artifact-registry — append/list/close lines in a project's artifact registry (JSONL, one JSON
// object per line, one record per `contracts/artifact.schema.json`).
//
// Concurrent-writer safety: every mutation (append AND close) takes an exclusive lock file
// (`<registryPath>.lock`, created with the `wx` flag) around its read-modify-write. `appendArtifact`
// blocks briefly (bounded spin) for the lock, because a dropped append is data loss. `closeArtifact`
// tries once and, if the lock is held, SKIPS ENTIRELY and returns 0 rather than proceeding on a
// stale read — a dropped close just means the next run tries again; racing it against a concurrent
// append would silently discard that append. `closeArtifact` still writes via temp-file + rename,
// never in place.
//
// Reading is conservative in the other direction: `listArtifacts` returns every line that parses
// AND validates as `entries`, but a line that fails either (a hand annotation with an extra field,
// a truncated in-flight write) is content this reader does not own — it is reported via
// `malformedCount`, never silently dropped from the FILE. `closeArtifact` rewrites from the RAW
// lines, not from `listArtifacts`' parsed view, so an unparseable/invalid line is always copied
// through byte-for-byte, never erased, even though it can never be the line being closed (closing
// requires a `ref` match, which requires parsing).
//
// A registry file that exists but cannot be READ (permissions, mid-corruption) is reported as
// `unreadable: true`, distinct from a simply-missing file (`unreadable: false`, normal "no registry
// yet" state) — callers (janitor) must treat `unreadable` as blind, not as "zero findings".
//
// No schema-validation dependency (this repo has none) — `validateArtifact` checks the
// `artifact.schema.json` fields by hand and must be kept in sync with that file if it changes.

import {
  readFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmdirSync,
  appendFileSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
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

// ---------- lock helper (shared by append and close) ----------

/**
 * Acquire an exclusive lock file. Non-blocking by default (one attempt); `blocking:true` spins
 * (bounded by `maxWaitMs`) because the caller cannot tolerate silently skipping. Returns the file
 * descriptor, or null if the lock could not be acquired in time.
 */
function acquireLock(lockPath, { blocking = false, maxWaitMs = 500 } = {}) {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    try {
      return openSync(lockPath, "wx");
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      if (!blocking || Date.now() >= deadline) return null;
      // Tight retry: registry files are tiny, so any hold is microseconds long in practice, and a
      // synchronous script has no async sleep to fall back on.
    }
  }
}

function releaseLock(fd, lockPath) {
  try {
    closeSync(fd);
  } catch {
    // already closed; nothing to do
  }
  try {
    unlinkSync(lockPath);
  } catch {
    // already removed by someone else; nothing to do
  }
}

/**
 * Append one validated record as a single JSONL line. Throws on an invalid record (a programmer
 * error the caller should fix, not a runtime condition to fail open on), and throws if the write
 * lock cannot be acquired within the wait budget (a dropped append is data loss, so this is loud,
 * never silent).
 */
export function appendArtifact(record, { registryPath, extraKinds = [] }) {
  const { valid, errors } = validateArtifact(record, extraKinds);
  if (!valid) throw new Error(`invalid artifact record: ${errors.join("; ")}`);
  mkdirSync(dirname(registryPath), { recursive: true });
  const lockPath = `${registryPath}.lock`;
  const fd = acquireLock(lockPath, { blocking: true, maxWaitMs: 500 });
  if (fd === null) throw new Error(`could not acquire the registry lock (${lockPath}) in time`);
  try {
    // JSON.stringify escapes control characters (incl. newlines) inside string values, so the
    // serialized record is always exactly one line.
    appendFileSync(registryPath, `${JSON.stringify(record)}\n`, { flag: "a" });
  } finally {
    releaseLock(fd, lockPath);
  }
}

/**
 * Read every line. Returns { entries, malformedCount, unreadable } — entries is an array of
 * { record, line } for lines that parse AND validate; a line that fails either is counted in
 * malformedCount but never removed from the underlying file by this function (it only reads).
 * A missing file returns an empty, non-blind result. A file that exists but cannot be read
 * (permissions, etc.) returns `unreadable: true` with empty entries — callers must not treat that
 * the same as "genuinely empty".
 */
export function listArtifacts({ registryPath, extraKinds = [] }) {
  if (!existsSync(registryPath)) return { entries: [], malformedCount: 0, unreadable: false };
  let raw;
  try {
    raw = readFileSync(registryPath, "utf8");
  } catch {
    return { entries: [], malformedCount: 0, unreadable: true };
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
  return { entries, malformedCount, unreadable: false };
}

/**
 * Remove every line whose record matches `ref` (and `created`, when given, to disambiguate two
 * artifacts that reused the same ref). Rewrites via temp-file + rename, never in place, and
 * operates on RAW LINES: a line this reader cannot parse or validate (a hand annotation, a
 * truncated in-flight write) is not something this tool owns, so it is copied through byte for
 * byte and can never match a close request. Returns the number of lines removed.
 *
 * Concurrency: takes the same lock `appendArtifact` uses, non-blocking. If another writer holds
 * it, this call does nothing and returns 0 rather than rewriting from a read that a concurrent
 * append could invalidate between the read and the rename — a skipped close is retried next run;
 * a lost concurrent append would not be.
 */
export function closeArtifact({ ref, created }, { registryPath, extraKinds = [] }) {
  if (!existsSync(registryPath)) return 0;
  const lockPath = `${registryPath}.lock`;
  const fd = acquireLock(lockPath, { blocking: false });
  if (fd === null) return 0; // someone else is writing right now; leave this close for next run
  try {
    let raw;
    try {
      raw = readFileSync(registryPath, "utf8");
    } catch {
      return 0;
    }
    const trailingNewline = raw.endsWith("\n");
    const lines = raw.split("\n");
    let removed = 0;
    const kept = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const isLastEmptyFromTrailingNewline = i === lines.length - 1 && line === "";
      if (isLastEmptyFromTrailingNewline) continue; // artifact of split(), not a real line
      if (line.trim() === "") {
        kept.push(line);
        continue;
      }
      let record = null;
      try {
        record = JSON.parse(line.trim());
      } catch {
        kept.push(line); // unparseable: not ours to touch
        continue;
      }
      const valid = validateArtifact(record, extraKinds).valid;
      const matches = valid && record.ref === ref && (created === undefined || record.created === created);
      if (matches) removed += 1;
      else kept.push(line); // invalid-but-parseable (e.g. a hand-added field) is preserved too
    }
    if (removed === 0) return 0;
    const dir = dirname(registryPath);
    const tmpDir = mkdtempSync(join(dir, ".artifact-registry-tmp-"));
    const tmpFile = join(tmpDir, "artifacts.jsonl");
    try {
      const body = kept.join("\n") + (kept.length && trailingNewline ? "\n" : "");
      appendFileSync(tmpFile, body, { flag: "w" });
      renameSync(tmpFile, registryPath);
    } finally {
      // The directory is a fresh mkdtemp and holds at most the one file named above; remove those
      // two names explicitly rather than recursively, so nothing in this territory reads as a
      // recursive delete.
      try { unlinkSync(tmpFile); } catch { /* the rename already moved it */ }
      try { rmdirSync(tmpDir); } catch { /* already gone */ }
    }
    return removed;
  } finally {
    releaseLock(fd, lockPath);
  }
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
