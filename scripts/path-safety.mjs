// C1 (spec.md, amended by F3, F6, F7, F8; scout.md item C). Factored out of work-record.mjs's
// former removeScratchDirectory (:1986-2097 at dff1e00) so work-record.mjs and reclaim.mjs share
// one "is this path safe to remove" gate. This module never removes anything itself - it only
// answers ok/refused/absent. Callers (work-record.mjs, reclaim.mjs) do the actual fs.rmSync (or,
// for W/B, the git-based removal), and own their own wording around this module's answer.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * checkRemovablePath(target, opts) -> { ok: true, real } | { ok: false, reason } | { ok: false, absent: true }
 *
 * opts:
 * - roots: Array<string | { path: string, predicate?: (segments: string[], rel: string) => boolean }>
 *     The target must resolve strictly UNDER one listed root (never equal to it - an exact match
 *     on the root itself does not count). `segments` is the relative path from that root to the
 *     target, split on path.sep with empty entries dropped. When a root entry carries a
 *     predicate, the root only matches if the predicate also returns true (this is how
 *     work-record keeps its own rule: the --by session id must be a whole segment strictly
 *     between the root and the target).
 * - repoRoots: Array<{ path: string, kind: string }>
 *     The target must be none of: equal to, containing, or lying inside any listed path. `kind`
 *     is the noun phrase used in the refusal reason ("is <kind>", "contains <kind>", "lies inside
 *     <kind>"). Checked in three full passes over repoRoots (all equality checks, then all
 *     containment checks, then all lies-inside checks) so that first-match order matches the
 *     order repoRoots was given, not per-entry.
 * - home: defaults to os.homedir(). The target must not equal this.
 * - platform: defaults to process.platform. "win32" switches to case-insensitive comparison and
 *     the win32 absolute-path form (drive letter or UNC), everything else to POSIX comparison.
 * - allowFile: default false. When true, a regular file passes where only a directory used to
 *     (F8) - symlinks are always refused regardless of allowFile.
 * - fsImpl: defaults to the real fs module. Only lstatSync/realpathSync are used.
 * - notAbsoluteReason / underRootReason: reason text overrides, so a caller that must reproduce
 *     legacy wording byte-for-byte (work-record.mjs) can supply its own, while a fresh caller
 *     (reclaim.mjs) can use a reason that reads right for its own CLI.
 */
export function checkRemovablePath(target, opts = {}) {
  const {
    roots = [],
    repoRoots = [],
    home = os.homedir(),
    platform = process.platform,
    allowFile = false,
    fsImpl = fs,
    notAbsoluteReason = "not absolute on this host",
    underRootReason = "does not resolve under an allowed root",
  } = opts;

  const winCase = platform === "win32";
  const hostAbsolute = winCase
    ? /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/])/.test(target)
    : path.posix.isAbsolute(target);
  if (!hostAbsolute) {
    return { ok: false, reason: notAbsoluteReason };
  }

  const cmp = (a, b) => (winCase ? String(a).toLowerCase() === String(b).toLowerCase() : a === b);
  const normSep = (p) => String(p).replace(/\\/g, "/");
  const forCompare = (p) => (winCase ? normSep(p).toLowerCase() : normSep(p));
  const resolved = path.resolve(target);

  let underRoot = false;
  for (const entry of roots) {
    const rootDesc = typeof entry === "string" ? { path: entry } : entry;
    const rootPath = path.resolve(rootDesc.path);
    const rel = path.relative(rootPath, resolved);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) continue;
    const segments = rel.split(path.sep).filter(Boolean);
    if (rootDesc.predicate && !rootDesc.predicate(segments, rel)) continue;
    underRoot = true;
    break;
  }
  if (!underRoot) {
    return { ok: false, reason: underRootReason };
  }

  let lst;
  try {
    lst = fsImpl.lstatSync(resolved);
  } catch (error) {
    if (error && error.code === "ENOENT") return { ok: false, absent: true };
    return { ok: false, reason: `could not stat: ${error.message || error}` };
  }
  if (lst.isSymbolicLink()) {
    return { ok: false, reason: "target is a symlink or junction" };
  }
  if (!lst.isDirectory() && !(allowFile && lst.isFile())) {
    return { ok: false, reason: allowFile ? "target is not a file or directory" : "target is not a directory" };
  }

  let real;
  try {
    real = fsImpl.realpathSync(resolved);
  } catch {
    return { ok: false, absent: true };
  }
  if (!cmp(real, resolved)) {
    return { ok: false, reason: "a symlinked ancestor changes the real path" };
  }
  if (path.resolve(resolved, "..") === resolved) {
    return { ok: false, reason: "is a drive/filesystem root" };
  }
  if (cmp(path.resolve(home), resolved)) {
    return { ok: false, reason: "is the home directory" };
  }

  const inside = (p) => {
    const rel = path.relative(forCompare(resolved), forCompare(path.resolve(p)));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  const liesInside = (p) => {
    const rel = path.relative(forCompare(path.resolve(p)), forCompare(resolved));
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  };

  for (const entry of repoRoots) {
    const repoPath = path.resolve(entry.path);
    if (cmp(repoPath, resolved)) return { ok: false, reason: `is ${entry.kind || "a protected path"}` };
  }
  for (const entry of repoRoots) {
    const repoPath = path.resolve(entry.path);
    if (inside(repoPath)) return { ok: false, reason: `contains ${entry.kind || "a protected path"}` };
  }
  for (const entry of repoRoots) {
    const repoPath = path.resolve(entry.path);
    if (liesInside(repoPath)) return { ok: false, reason: `lies inside ${entry.kind || "a protected path"}` };
  }

  return { ok: true, real };
}
