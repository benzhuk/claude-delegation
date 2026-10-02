// janitor-sweep - lane 74 items 2, 3, 5 (report part), 7. The multi-root sweep.
//
// Walks the root list (janitor-roots), classifies every worktree, branch and stray folder as owned or
// orphan (janitor-owner), and for each NEW class either REPORTS what it would do (default) or acts
// (janitor-archive). A class acts only when ALL of: the run was given --apply, the janitor-act kill
// switch is not set, and the class id is listed in `<home>/.agents/janitor-policy.json`
// ({"act": ["dirty-worktree-archive", ...]}). An absent, unreadable or empty policy file = every new
// class reports only. Writing that file is the owner's tick, never this code's.
//
// This module imports nothing from janitor.mjs (which wires it in); the janitor helpers it needs
// arrive in `deps`. Every location (home, roots, clock, policy) is injected.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { withoutRepoLocatingGitEnv } from "../skills/multi/scripts/transport.mjs";
import { scanRoots, defaultRoots, registeredWorktrees, gitMarkerKind, normPath, isExcludedPath } from "./janitor-roots.mjs";
import { collectRecords, ownerOf } from "./janitor-owner.mjs";
import { archiveThenRemoveWorktree, archiveThenDeleteBranch, archiveCheckout, statusCounts, matchedExcludedRemote, DEFAULT_EXCLUDE_REMOTES } from "./janitor-archive.mjs";

export const CLASS_IDS = Object.freeze({
  dirtyWorktree: "dirty-worktree-archive",
  unmergedBranch: "unmerged-branch-archive",
  mergedOrigin: "merged-origin-branch-delete",
  deregistered: "deregistered-folder-archive",
  untracked: "untracked-report",
});
const IDLE_FLOOR = 24;
const UNTRACKED_DAYS = 7;
const UNTRACKED_ROW_CAP = 50;
const PROTECTED = new Set(["main", "master", "develop", "development", "release", "production", "stable", "trunk"]);
const HERE = path.dirname(fileURLToPath(import.meta.url));

export function policyPath(home) {
  return path.join(home, ".agents", "janitor-policy.json");
}

/** { present, act:Set, exclude:[], excludeRemotes:[], roots:null|[], problem } - never throws; a bad file acts on nothing. */
export function loadSweepPolicy(home) {
  const file = policyPath(home);
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    return { present: false, act: new Set(), exclude: [], excludeRemotes: [], roots: null, problem: err?.code === "ENOENT" ? null : `unreadable (${err?.code})` };
  }
  try {
    const parsed = JSON.parse(text);
    const act = new Set(Array.isArray(parsed?.act) ? parsed.act.filter((x) => typeof x === "string") : []);
    const exclude = Array.isArray(parsed?.exclude) ? parsed.exclude.filter((x) => typeof x === "string") : [];
    const excludeRemotes = Array.isArray(parsed?.excludeRemotes) ? parsed.excludeRemotes.filter((x) => typeof x === "string" && x) : [];
    const roots = Array.isArray(parsed?.roots) ? parsed.roots.filter((r) => r && typeof r.path === "string" && typeof r.kind === "string") : null;
    return { present: true, act, exclude, excludeRemotes, roots, problem: null };
  } catch {
    return { present: true, act: new Set(), exclude: [], excludeRemotes: [], roots: null, problem: "not valid JSON; every new class reports only" };
  }
}

function git(args, cwd, opts = {}) {
  try {
    return { ok: true, out: execFileSync("git", args, { cwd, env: withoutRepoLocatingGitEnv(process.env), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }) };
  } catch (err) {
    return { ok: false, error: String(err?.stderr || err?.message || err).trim().split("\n").pop() };
  }
}

function hasRef(repo, ref) {
  return git(["show-ref", "--verify", "--quiet", ref], repo).ok;
}

function isAncestor(repo, ancestor, descendant) {
  return git(["merge-base", "--is-ancestor", ancestor, descendant], repo).ok;
}

/** The default reclaim bridge: asks scripts/reclaim.mjs (the vetted remover) in a child process. */
export function defaultReclaim(home) {
  const script = path.join(HERE, "reclaim.mjs");
  const env = { ...withoutRepoLocatingGitEnv(process.env), HOME: home, USERPROFILE: home };
  const call = (args) => {
    try {
      const out = execFileSync(process.execPath, [script, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
      return { ok: true, out };
    } catch (err) {
      return { ok: false, out: String(err?.stdout || ""), error: String(err?.stderr || err?.message || "").trim() };
    }
  };
  return { dryRun: (folder) => call(["--dry-run", folder]), remove: (folder) => call([folder]) };
}

function row(cls, fields) {
  return { class: cls, repo: "", path: "", branch: "", status: "", action: "", detail: "", ...fields };
}

function headSha(dir) {
  const r = git(["rev-parse", "HEAD"], dir);
  return r.ok ? r.out.trim() : "";
}

/** Tips (full shas) of the repo's local archive/* branches. */
function localArchiveTips(repo) {
  const r = git(["for-each-ref", "--format=%(objectname)", "refs/heads/archive/"], repo);
  return new Set(r.ok ? r.out.split("\n").map((s) => s.trim()).filter(Boolean) : []);
}

function sweepWorktrees(ctx, repo, list, records, rows, main) {
  let owned = 0;
  const archiveTips = localArchiveTips(repo);
  for (const wt of list) {
    if (wt.main || wt.bare) continue;
    if (isExcludedPath(wt.path, { home: ctx.home, exclude: ctx.exclude })) continue; // the exclude list and BTO/dotfiles apply to registered worktrees too
    const who = ownerOf({ path: wt.path, branch: wt.branch }, repo, list, records);
    if (who.owned) {
      owned += 1;
      continue;
    }
    if (wt.prunable) {
      rows.push(row(CLASS_IDS.dirtyWorktree, { repo, path: wt.path, branch: wt.branch || "", status: "orphan", action: "keep", detail: "prunable (directory gone); nothing to archive" }));
      continue;
    }
    if (wt.locked) {
      rows.push(row(CLASS_IDS.dirtyWorktree, { repo, path: wt.path, branch: wt.branch || "", status: "orphan", action: "keep", detail: "locked" }));
      continue;
    }
    const counts = statusCounts(wt.path);
    if (!counts) {
      rows.push(row(CLASS_IDS.dirtyWorktree, { repo, path: wt.path, branch: wt.branch || "", status: "orphan", action: "keep", detail: "git status unreadable" }));
      continue;
    }
    // A clean orphan on an unmerged, local-only branch is the shape the loop's phase-end commit leaves: its commits live
    // nowhere else, so it gets the same archive-then-remove as a dirty one (one rule: an orphan's unmerged work is archived).
    let cls = CLASS_IDS.dirtyWorktree;
    let what = `${counts.dirty} changed path(s)`;
    if (counts.dirty === 0 && counts.ignored === 0) {
      // Archived and pushed, but git refused the removal: clean, detached at an archive tip. Keep reporting it.
      if (!wt.branch && archiveTips.has(headSha(wt.path))) {
        rows.push(row(CLASS_IDS.dirtyWorktree, { repo, path: wt.path, branch: "(detached)", status: "archived", action: "report-only", detail: "archived; removal refused earlier, needs a hand" }));
        continue;
      }
      if (!wt.branch || !main || PROTECTED.has(wt.branch) || wt.branch.startsWith("archive/")) continue; // the SAFE class and the branch class own the rest
      const full = `refs/heads/${wt.branch}`;
      if (!hasRef(repo, full) || isAncestor(repo, full, main.baseRef)) continue; // merged (or gone): the SAFE class owns it
      if (hasRef(repo, `refs/remotes/origin/${wt.branch}`)) {
        rows.push(row(CLASS_IDS.unmergedBranch, { repo, path: wt.path, branch: wt.branch, status: "orphan", action: "report-only", detail: "clean, unmerged, branch on origin; a person decides" }));
        continue;
      }
      cls = CLASS_IDS.unmergedBranch;
      what = "clean, unmerged, local-only";
    }
    const base = { repo, path: wt.path, branch: wt.branch || "(detached)", status: "orphan" };
    const idle = ctx.deps.idleHours(wt.path, { home: ctx.home, now: ctx.nowMs });
    if (!Number.isFinite(idle) || idle < IDLE_FLOOR) {
      rows.push(row(cls, { ...base, action: "keep", detail: `${cls === CLASS_IDS.unmergedBranch ? what : `dirty (${counts.dirty} changed, ${counts.ignored} ignored)`}; idle ${Number.isFinite(idle) ? `${Math.floor(idle)}h < ${IDLE_FLOOR}h` : "unknown"}` }));
      continue;
    }
    if (counts.ignored > 0) {
      rows.push(row(cls, { ...base, action: "keep", detail: `ignored content (${counts.ignored} path(s)) would be lost; not removed` }));
      continue;
    }
    const name = path.basename(wt.path);
    const btoRemote = matchedExcludedRemote(wt.path, ctx.excludeRemotes);
    if (btoRemote) {
      rows.push(row(cls, { ...base, action: "keep", detail: `excluded (BTO remote: origin matches ${btoRemote})` }));
      continue;
    }
    if (!ctx.acts(cls)) {
      rows.push(row(cls, { ...base, action: "would-archive-then-remove", detail: `${what}, idle ${Math.floor(idle)}h; report mode` }));
      continue;
    }
    // The in-use check is a rename on win32: it runs only for a class that is about to act (report mode never touches a tree).
    if (ctx.deps.pathHasOpenProcess(wt.path) !== false) {
      rows.push(row(cls, { ...base, action: "keep", detail: "a process holds this directory (or it could not be checked)" }));
      continue;
    }
    if (!ctx.repoVerified(repo)) {
      rows.push(row(cls, { ...base, action: "skipped", detail: "origin fetch failed this run; unverifiable" }));
      continue;
    }
    const r = archiveThenRemoveWorktree({ repoRoot: repo, wtPath: wt.path, name, excludeRemotes: ctx.excludeRemotes });
    rows.push(row(cls, { ...base, action: r.ok ? "archived-then-removed" : r.skipped ? "skipped" : "failed", detail: r.ok ? `${r.ref} ${r.sha}` : r.skipped || r.error }));
  }
  return owned;
}

/**
 * The base branch of ONE repo: its origin/HEAD, then its own .agents/project.json main_branch, then main, then master;
 * the first that exists as origin/<x> or a local branch. { name, baseRef, originRef } or null.
 */
function resolveMain(repo) {
  const names = [];
  const head = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], repo);
  if (head.ok && head.out.trim()) names.push(head.out.trim().replace(/^origin\//, ""));
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(repo, ".agents", "project.json"), "utf8"));
    if (typeof cfg?.main_branch === "string" && cfg.main_branch) names.push(cfg.main_branch);
  } catch {
    /* no or unreadable project config: fall through to the defaults */
  }
  names.push("main", "master");
  for (const name of names) {
    const originRef = `refs/remotes/origin/${name}`;
    if (hasRef(repo, originRef)) return { name, baseRef: originRef, originRef };
    if (hasRef(repo, `refs/heads/${name}`)) return { name, baseRef: `refs/heads/${name}`, originRef: null };
  }
  return null;
}

function sweepBranches(ctx, repo, list, records, rows, main) {
  const heads = git(["for-each-ref", "--format=%(refname)", "refs/heads/"], repo);
  if (!heads.ok) return;
  const fulls = heads.out.split("\n").map((s) => s.trim()).filter(Boolean);
  // A local archive/* branch that origin does not hold: the push failed or never ran; the work is on this disk only.
  for (const full of fulls) {
    const branch = full.slice("refs/heads/".length);
    if (branch.startsWith("archive/") && !hasRef(repo, `refs/remotes/origin/${branch}`)) {
      rows.push(row(CLASS_IDS.unmergedBranch, { repo, branch, status: "unpushed-archive", action: "report-only", detail: "local archive branch is not on origin; the archived work exists on this disk only (a clone with a narrow fetch refspec has no origin/archive/* tracking refs and reports every pushed archive here: false positive, check with git ls-remote)" }));
    }
  }
  if (!main) {
    rows.push(row(CLASS_IDS.unmergedBranch, { repo, status: "unknown", action: "keep", detail: "no main branch resolved (origin/HEAD, project.json, main, master); branch classes skipped" }));
    return;
  }
  const baseRef = main.baseRef;
  const checkedOut = new Set(list.map((w) => w.branch).filter(Boolean));
  for (const full of fulls) {
    const branch = full.slice("refs/heads/".length);
    if (PROTECTED.has(branch) || branch.startsWith("archive/") || checkedOut.has(branch)) continue;
    if (hasRef(repo, `refs/remotes/origin/${branch}`)) continue; // not local-only
    if (isAncestor(repo, full, baseRef)) continue; // merged: the SAFE class owns it
    const who = ownerOf({ branch }, repo, list, records);
    if (who.owned) continue;
    const ct = git(["log", "-1", "--format=%ct", full], repo);
    const ageH = ct.ok ? (ctx.nowMs / 1000 - Number(ct.out.trim())) / 3600 : NaN;
    const base = { repo, branch, status: "orphan" };
    const btoRemote = matchedExcludedRemote(repo, ctx.excludeRemotes);
    if (btoRemote) {
      rows.push(row(CLASS_IDS.unmergedBranch, { ...base, action: "keep", detail: `excluded (BTO remote: origin matches ${btoRemote})` }));
      continue;
    }
    if (!Number.isFinite(ageH) || ageH < IDLE_FLOOR) {
      rows.push(row(CLASS_IDS.unmergedBranch, { ...base, action: "keep", detail: `last commit ${Number.isFinite(ageH) ? `${Math.floor(ageH)}h` : "unknown"} ago < ${IDLE_FLOOR}h` }));
      continue;
    }
    if (!ctx.acts(CLASS_IDS.unmergedBranch)) {
      rows.push(row(CLASS_IDS.unmergedBranch, { ...base, action: "would-archive-then-delete", detail: "unmerged, local-only, no open record; report mode" }));
      continue;
    }
    if (!ctx.repoVerified(repo)) {
      rows.push(row(CLASS_IDS.unmergedBranch, { ...base, action: "skipped", detail: "origin fetch failed this run; unverifiable" }));
      continue;
    }
    // Already inside an archive on origin (its worktree was archived): delete locally, never push a second archive.
    const held = git(["for-each-ref", "--contains", full, "--format=%(refname:short)", "refs/remotes/origin/archive/"], repo);
    const inside = held.ok ? held.out.split("\n").map((s) => s.trim()).filter(Boolean)[0] : null;
    if (inside && git(["ls-remote", "origin", `refs/heads/${inside.replace(/^origin\//, "")}`], repo).out?.trim()) {
      const del = git(["branch", "-D", branch], repo);
      rows.push(row(CLASS_IDS.unmergedBranch, { ...base, action: del.ok ? "archived-then-deleted" : "failed", detail: del.ok ? `already inside ${inside}; no second archive` : del.error }));
      continue;
    }
    const r = archiveThenDeleteBranch({ repoRoot: repo, branch, excludeRemotes: ctx.excludeRemotes });
    rows.push(row(CLASS_IDS.unmergedBranch, { ...base, action: r.ok ? "archived-then-deleted" : r.skipped ? "skipped" : "failed", detail: r.ok ? `${r.ref} ${r.sha}` : r.skipped || r.error }));
  }
}

/** Merged origin branches (no open record): REPORT ONLY. Deleting one is a non-archive push, which this janitor never does. */
function sweepMergedOrigin(ctx, repo, list, records, rows, main) {
  const originMain = main?.originRef;
  if (!originMain) return;
  const refs = git(["for-each-ref", "--format=%(refname)", "refs/remotes/origin/"], repo);
  if (!refs.ok) return;
  for (const full of refs.out.split("\n").map((s) => s.trim()).filter(Boolean)) {
    const branch = full.slice("refs/remotes/origin/".length);
    if (branch === "HEAD" || PROTECTED.has(branch) || branch.startsWith("archive/")) continue;
    if (!isAncestor(repo, full, originMain)) continue;
    if (ownerOf({ branch }, repo, list, records).owned) continue;
    rows.push(row(CLASS_IDS.mergedOrigin, { repo, branch, status: "orphan", action: "report-only", detail: "merged into origin main; deleting a non-archive ref is not done by this janitor" }));
  }
}

function sweepDeregistered(ctx, scan, registered, rows) {
  const repoKeys = new Set(scan.repos.map(normPath));
  for (const folder of scan.folders) {
    const kind = gitMarkerKind(folder.path);
    if (kind === null) continue;
    const key = normPath(folder.path);
    if (registered.has(key) || repoKeys.has(key)) continue;
    const base = { path: folder.path, status: "deregistered" };
    if (kind === "file") {
      const ok = git(["rev-parse", "--git-dir"], folder.path);
      rows.push(row(CLASS_IDS.deregistered, { ...base, action: "report-only", detail: ok.ok ? "linked .git file but no repo lists it; removal needs a hand" : "broken .git link, nothing to archive; removal needs a hand" }));
      continue;
    }
    const counts = statusCounts(folder.path);
    if (!counts) {
      rows.push(row(CLASS_IDS.deregistered, { ...base, action: "report-only", detail: "intact .git dir but git status failed; removal needs a hand" }));
      continue;
    }
    if (counts.dirty === 0) {
      rows.push(row(CLASS_IDS.deregistered, { ...base, action: "report-only", detail: "intact .git, no uncommitted changes; removal needs a hand unless reclaim accepts it" }));
      continue;
    }
    const idle = ctx.deps.idleHours(folder.path, { home: ctx.home, now: ctx.nowMs });
    if (!Number.isFinite(idle) || idle < IDLE_FLOOR) {
      rows.push(row(CLASS_IDS.deregistered, { ...base, action: "keep", detail: `dirty (${counts.dirty} changed); idle ${Number.isFinite(idle) ? `${Math.floor(idle)}h < ${IDLE_FLOOR}h` : "unknown"}` }));
      continue;
    }
    const btoRemote = matchedExcludedRemote(folder.path, ctx.excludeRemotes);
    if (btoRemote) {
      rows.push(row(CLASS_IDS.deregistered, { ...base, action: "keep", detail: `excluded (BTO remote: origin matches ${btoRemote})` }));
      continue;
    }
    if (!ctx.acts(CLASS_IDS.deregistered)) {
      rows.push(row(CLASS_IDS.deregistered, { ...base, action: "would-archive", detail: `${counts.dirty} changed path(s), ${counts.ignored} ignored; report mode, then removal only via reclaim` }));
      continue;
    }
    // The in-use check is a rename on win32: it runs only for a class that is about to act.
    if (ctx.deps.pathHasOpenProcess(folder.path) !== false) {
      rows.push(row(CLASS_IDS.deregistered, { ...base, action: "keep", detail: "a process holds this directory (or it could not be checked)" }));
      continue;
    }
    const r = archiveCheckout({ dir: folder.path, name: path.basename(folder.path), excludeRemotes: ctx.excludeRemotes });
    if (!r.ok) {
      rows.push(row(CLASS_IDS.deregistered, { ...base, action: r.skipped ? "skipped" : "failed", detail: r.skipped || r.error }));
      continue;
    }
    const probe = ctx.reclaim.dryRun(folder.path);
    if (probe.ok && /would-remove/.test(probe.out)) {
      const rm = ctx.reclaim.remove(folder.path);
      rows.push(row(CLASS_IDS.deregistered, { ...base, action: rm.ok ? "archived-then-removed" : "archived", detail: `${r.ref} ${r.sha}${rm.ok ? "" : "; reclaim refused the removal"}` }));
    } else {
      rows.push(row(CLASS_IDS.deregistered, { ...base, action: "archived", detail: `${r.ref} ${r.sha}; removal needs a hand (reclaim does not accept this folder)` }));
    }
  }
}

function sweepUntracked(ctx, repo, rows) {
  const ls = git(["ls-files", "--others", "--exclude-standard", "-z"], repo, { maxBuffer: 64 * 1024 * 1024 });
  if (!ls.ok) return;
  let shown = 0;
  let total = 0;
  for (const rel of ls.out.split("\0").filter(Boolean)) {
    let st;
    try {
      st = fs.statSync(path.join(repo, rel));
    } catch {
      continue;
    }
    const days = (ctx.nowMs - st.mtimeMs) / 86_400_000;
    if (days < UNTRACKED_DAYS) continue;
    total += 1;
    if (shown < UNTRACKED_ROW_CAP) {
      shown += 1;
      rows.push(row(CLASS_IDS.untracked, { repo, path: path.join(repo, rel), status: "untracked", action: "report-only", detail: `${Math.floor(days)} days old` }));
    }
  }
  if (total > shown) rows.push(row(CLASS_IDS.untracked, { repo, status: "untracked", action: "report-only", detail: `... and ${total - shown} more older than ${UNTRACKED_DAYS} days` }));
}

/**
 * @param {object} o
 * @param {string} o.home                   injected home (policy file, idle check, reclaim)
 * @param {{kind:string,path:string}[]} o.roots  the root list (injected)
 * @param {boolean} o.apply                 --apply given AND the act kill switch is off
 * @param {object} o.policy                 loadSweepPolicy() result
 * @param {number} o.nowMs                  the clock
 * @param {object} o.deps                   { listWorktrees, listRecords, idleHours, pathHasOpenProcess, fetchOrigin }
 * @returns {{ rows: object[], repos: string[], owned: number, unreadable: string[] }}
 */
export function runSweep({ home, roots, apply, policy, nowMs, deps, exclude = [], mainBranch = "main", reclaim = null }) {
  const allExclude = [...exclude, ...(policy?.exclude || [])];
  const scan = scanRoots(roots, { home, exclude: allExclude });
  const { registered, perRepo, unreadable } = registeredWorktrees(scan.repos, deps.listWorktrees);
  const verified = new Map();
  const ctx = {
    home, nowMs, deps, mainBranch, exclude: allExclude,
    excludeRemotes: [...DEFAULT_EXCLUDE_REMOTES, ...(policy?.excludeRemotes || [])],
    reclaim: reclaim || defaultReclaim(home),
    acts: (id) => Boolean(apply && policy?.act?.has(id)),
    repoVerified: (repo) => {
      if (!verified.has(repo)) {
        const f = deps.fetchOrigin(repo);
        verified.set(repo, f === true || f?.ok === true);
      }
      return verified.get(repo);
    },
  };
  const rows = [];
  let owned = 0;
  try {
    for (const repo of scan.repos) {
      const list = perRepo.get(repo);
      if (!list) continue;
      const records = collectRecords([repo, ...list.map((w) => w.path)], deps.listRecords);
      const main = resolveMain(repo);
      owned += sweepWorktrees(ctx, repo, list, records, rows, main);
      sweepBranches(ctx, repo, list, records, rows, main);
      sweepMergedOrigin(ctx, repo, list, records, rows, main);
      sweepUntracked(ctx, repo, rows);
    }
    sweepDeregistered(ctx, scan, registered, rows);
  } catch (err) {
    // A probe that could not put something back (or any other throw) stops the sweep; the rows already acted on stay in the report.
    rows.push(row(CLASS_IDS.dirtyWorktree, { status: "stopped", action: "stopped", detail: String(err && err.message ? err.message : err) }));
  }
  return { rows, repos: scan.repos, owned, unreadable };
}

/** Plain-text report of a sweep. Always names the mode so a reader knows nothing acted unless a row says so. */
export function formatSweep(result, { apply, policy }) {
  const lines = [];
  const actingIds = [...(policy?.act || [])].filter((id) => Object.values(CLASS_IDS).includes(id));
  lines.push("SWEEP (multi-root, lane 74):");
  lines.push(`mode: ${apply && actingIds.length ? `acting on ${actingIds.join(", ")}` : "report only"}${policy?.problem ? ` (policy file ${policy.problem})` : ""}; repos scanned: ${result.repos.length}; worktrees owned by an open record: ${result.owned}`);
  for (const r of result.unreadable) lines.push(`unreadable worktree list: ${r}`);
  if (result.rows.length === 0) {
    lines.push("(nothing to report)");
    return lines.join("\n");
  }
  for (const r of result.rows) {
    const where = r.path || r.branch || r.repo;
    lines.push(`- [${r.class}] ${r.action}: ${where}${r.branch && r.path ? ` (${r.branch})` : ""} - ${r.detail}`);
  }
  return lines.join("\n");
}

export { defaultRoots };
