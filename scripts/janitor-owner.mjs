// janitor-owner - lane 74 item 2. Owner-or-orphan classification, read-only.
//
// A worktree (or a branch) is OWNED when an OPEN work record names it in its `Worktree:` line. The
// line is resolved the way work-record's closeout resolves it (scripts/janitor.mjs closeoutWorktree):
// an absolute path, a repo-relative path, or a bare branch name (an `origin/` or `refs/heads/` prefix
// is stripped). A worktree whose branch is `<owned branch>-<suffix>` (the territory pattern
// `build/<slug>-<id>`) is owned too. Anything else is an ORPHAN.
//
// "Open" = any status except accepted, closed and withdrawn. Records are read from the repo's main
// tree AND from every registered worktree of it (a lane record usually lives on the lane branch, in
// the lane's own worktree), through work-record's own `listRecords` (passed in; never parsed here).
import path from "node:path";

import { normPath } from "./janitor-roots.mjs";

const NOT_OPEN = new Set(["accepted", "closed", "withdrawn"]);

export function isOpenRecord(record) {
  const status = String(record?.fields?.status ?? "").trim();
  return !NOT_OPEN.has(status);
}

/** [{ work, status, worktree, open, file }] for every record under each directory's docs/work. */
export function collectRecords(dirs, listRecords) {
  const out = [];
  const seen = new Set();
  for (const dir of dirs) {
    let list = [];
    try {
      list = listRecords(path.join(dir, "docs", "work"));
    } catch {
      list = [];
    }
    for (const { path: file, record } of list) {
      const key = normPath(file);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        work: record?.fields?.work ?? path.basename(file),
        status: String(record?.fields?.status ?? "").trim(),
        worktree: record?.fields?.worktree ? String(record.fields.worktree).trim() : "",
        open: isOpenRecord(record),
        file,
      });
    }
  }
  return out;
}

function branchOfField(field) {
  return String(field).trim().replace(/\/+$/, "").replace(/^refs\/heads\//, "").replace(/^refs\/remotes\/origin\//, "").replace(/^origin\//, "");
}

/**
 * @param {{ path?: string, branch?: string|null }} subject a worktree ({path, branch}) or a bare branch ({branch})
 * @param {string} repoRoot  the repo main tree (relative `Worktree:` values resolve against it)
 * @param {{path: string, branch: string|null}[]} worktrees the repo's registered worktrees
 * @returns {{ owned: boolean, work: string|null, via: string|null }}
 */
export function ownerOf(subject, repoRoot, worktrees, records) {
  // Closure never reverses: a work id with ANY closing copy (a lane worktree's checkout keeps the stale "open"
  // copy it was cut with) is closed, so a stale open copy cannot keep owning a worktree.
  const closedWork = new Set(records.filter((r) => !r.open).map((r) => r.work));
  for (const rec of records) {
    if (!rec.open || !rec.worktree || closedWork.has(rec.work)) continue;
    const branchField = branchOfField(rec.worktree);
    const target = path.isAbsolute(rec.worktree) ? rec.worktree : path.resolve(repoRoot, rec.worktree);
    const registered = worktrees.find((w) => normPath(w.path) === normPath(target));
    if (subject.path && normPath(subject.path) === normPath(target)) return { owned: true, work: rec.work, via: "path" };
    const ownedBranch = registered?.branch ?? branchField;
    if (subject.branch && (subject.branch === branchField || subject.branch === ownedBranch)) {
      return { owned: true, work: rec.work, via: "branch" };
    }
    if (subject.branch && ownedBranch && subject.branch.startsWith(`${ownedBranch}-`)) {
      return { owned: true, work: rec.work, via: "territory-branch" };
    }
  }
  return { owned: false, work: null, via: null };
}
