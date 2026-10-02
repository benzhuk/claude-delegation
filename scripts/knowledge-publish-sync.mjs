// knowledge-publish-sync — Lane 71 (docs/specs/triage-fetch-first-71/spec.md, items 1 to 3).
// The knowledge-triage job's two git seams around the nested triage run, in the chezmoi source repo:
//   1. syncBeforeStart: before anything is gathered, check the tracked tree is clean, fetch origin and
//      fast-forward the branch. Dirty, ahead or diverged: stop with a named state, nothing touched.
//   2. repairPushRace: after the nested run, when the skill's single commit could not be pushed because
//      origin moved, fetch again, rebase that one commit once, push it. A conflict is aborted and named.
// Never: --force, reset, stash, clean, checkout, a merge commit, an identity change, the curated lock, chezmoi.
// Every call is `git -C <repo> ...` through runProcess (bounded, no shell). Env comes from `deps.gitEnv`
// (a test hands in its sealed one), else the process env, exactly like knowledge-gather's own git calls.

import { resolveDotfilesRepo, runProcess } from "./knowledge-gather.mjs";

export const SYNC_GIT_TIMEOUT_MS = 30_000;

const flat = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const quote = (p) => (/\s/.test(p) ? `"${p}"` : p);

async function git(options, repo, args) {
  const deps = options.deps ?? {};
  const r = await runProcess({
    cmd: deps.gitCommand ?? ["git"], args: ["-C", repo, ...args], env: deps.gitEnv ?? process.env,
    timeoutMs: SYNC_GIT_TIMEOUT_MS, timers: deps.timers,
  });
  const out = r.stdout.toString("utf8").trim();
  const ok = r.code === 0 && !r.error && !r.timedOut;
  const error = ok ? "" : r.timedOut ? "timed out" : r.error ? String(r.error.code ?? r.error.message) : flat(`${r.stderr} ${out}`).slice(0, 300);
  return { ok, out, error };
}

const stop = (kind, reason, repo = null, branch = null) => ({ ok: false, kind, reason, repo, branch });

/** `rev-list --count`, or null when git cannot answer (unknown ref). */
async function count(options, repo, range) {
  const r = await git(options, repo, ["rev-list", "--count", range]);
  const n = Number.parseInt(r.out, 10);
  return r.ok && Number.isInteger(n) ? n : null;
}

/**
 * Item 1. Resolves the repo and branch, refuses a dirty tracked tree (before any fetch), fetches origin
 * (no tags, no prune) and fast-forwards when behind. Returns { ok: true, repo, branch, action, behind } or
 * { ok: false, kind, reason, repo, branch } with kind dirty | diverged | unresolved.
 */
export async function syncBeforeStart(options = {}) {
  const found = await resolveDotfilesRepo(options);
  if (!found.root) return stop("unresolved", found.error?.startsWith("dotfiles repo unresolved") ? found.error : `dotfiles repo unresolved: ${found.error}`);
  const repo = found.root;
  const head = await git(options, repo, ["symbolic-ref", "--short", "HEAD"]);
  if (!head.ok || !head.out) {
    return stop("unresolved", `dotfiles repo unresolved: ${repo} has no branch checked out (${head.error || "detached HEAD"})`, repo);
  }
  const branch = head.out;
  const status = await git(options, repo, ["status", "--porcelain", "--untracked-files=no"]);
  if (!status.ok) return stop("unresolved", `dotfiles repo unresolved: git status failed in ${repo}: ${status.error}`, repo, branch);
  if (status.out) {
    const lines = status.out.split(/\r?\n/);
    const shown = lines.slice(0, 3).map(flat).join(" / ");
    return stop("dirty", `dirty before start: ${repo} has ${lines.length} tracked change(s) on ${branch} (${shown}${lines.length > 3 ? " / ..." : ""}); nothing was gathered or run`, repo, branch);
  }
  const fetch = await git(options, repo, ["fetch", "--no-tags", "--no-prune", "origin"]);
  if (!fetch.ok) return stop("unresolved", `fetch failed before start: git fetch origin in ${repo}: ${fetch.error}`, repo, branch);
  const remote = `origin/${branch}`;
  const ahead = await count(options, repo, `${remote}..HEAD`);
  const behind = await count(options, repo, `HEAD..${remote}`);
  if (ahead === null || behind === null) {
    return stop("unresolved", `dotfiles repo unresolved: ${remote} unknown in ${repo} after fetch`, repo, branch);
  }
  if (ahead > 0) {
    const how = behind > 0 ? `${ahead} local commit(s) origin lacks and ${behind} origin commit(s) the local lacks` : `${ahead} unpublished local commit(s) origin lacks, nothing to fast-forward`;
    return stop("diverged", `diverged before start: ${branch} in ${repo} has ${how}; nothing was gathered or run`, repo, branch);
  }
  if (behind > 0) {
    const ff = await git(options, repo, ["merge", "--ff-only", remote]);
    if (!ff.ok) return stop("unresolved", `fast-forward failed before start: git merge --ff-only ${remote} in ${repo}: ${ff.error}`, repo, branch);
  }
  return { ok: true, repo, branch, action: behind > 0 ? "fast-forwarded" : "in sync", behind };
}

/**
 * Item 2. Called only when this run changed DIGEST and HEAD does not match the fresh remote ref. Repairs
 * exactly one case: the tracked tree is clean and HEAD is ahead of origin by exactly one commit, the one
 * made since `before`. Returns { attempted: false, why } (nothing was run beyond reads and a fetch),
 * { attempted: true, pushed: true }, or { attempted: true, stop: { kind, reason } }.
 */
export async function repairPushRace(options, { repo, branch, before }) {
  if (!repo || !branch || !before) return { attempted: false, why: "no start-of-run baseline" };
  const status = await git(options, repo, ["status", "--porcelain", "--untracked-files=no"]);
  if (!status.ok || status.out) return { attempted: false, why: status.ok ? "tracked tree not clean after the nested run" : `git status failed: ${status.error}` };
  const fetch = await git(options, repo, ["fetch", "--no-tags", "--no-prune", "origin"]);
  if (!fetch.ok) return { attempted: false, why: `fetch failed: ${fetch.error}` };
  const remote = `origin/${branch}`;
  const unpushed = await git(options, repo, ["rev-list", `${remote}..HEAD`]);
  const own = await git(options, repo, ["rev-list", `${before}..HEAD`]);
  if (!unpushed.ok || !own.ok) return { attempted: false, why: `rev-list failed: ${unpushed.error || own.error}` };
  const a = unpushed.out.split(/\s+/).filter(Boolean);
  const b = own.out.split(/\s+/).filter(Boolean);
  if (a.length !== 1 || b.length !== 1 || a[0] !== b[0]) {
    return { attempted: false, why: `expected exactly one own commit ahead of ${remote}, found ${a.length} ahead and ${b.length} since the run began` };
  }
  const rebase = await git(options, repo, ["rebase", remote]);
  if (!rebase.ok) {
    const abort = await git(options, repo, ["rebase", "--abort"]);
    const tail = abort.ok ? "rebase aborted, tree restored" : `rebase --abort FAILED (${abort.error}); the rebase may still be open`;
    return { attempted: true, stop: { kind: "conflict", reason: `conflict on rebase: git rebase ${remote} in ${repo}: ${rebase.error}; ${tail}` } };
  }
  const push = await git(options, repo, ["push", "origin", `HEAD:${branch}`]);
  if (!push.ok) {
    return { attempted: true, stop: { kind: "pushRejected", reason: `push rejected after one rebase: git push origin HEAD:${branch} in ${repo}: ${push.error}; no second rebase` } };
  }
  return { attempted: true, pushed: true };
}

/** Item 3. Paste-ready extra lines for the ATTENTION packet, one block per state; empty for none. */
export function recoveryBlock(kind, repo, branch) {
  if (!repo) return [];
  const r = quote(repo);
  const b = branch ?? "<branch>";
  const last = "When that is done, remove ATTENTION with the last command of this packet.";
  if (kind === "dirty") {
    return [
      `State: dirty before start. Repo found: ${repo}. The job stopped before it touched the knowledge store; there is nothing of its own to recover.`,
      `  git -C ${r} status --short`,
      `Ben commits or discards those tracked changes by hand (the job never does). ${last}`,
    ];
  }
  if (kind === "diverged" || kind === "pushRejected") {
    return [
      kind === "diverged"
        ? `State: diverged before start. Repo found: ${repo}. The job stopped before it touched the knowledge store.`
        : `State: push rejected after one rebase. Repo found: ${repo}. The rebase finished; only the push failed.`,
      `  git -C ${r} fetch origin`,
      `  git -C ${r} log --oneline origin/${b}..HEAD`,
      `  git -C ${r} rebase origin/${b}`,
      `  git -C ${r} push origin HEAD:${b}`,
      `Read the log first: those are the commits origin lacks. ${last}`,
    ];
  }
  if (kind === "conflict") {
    return [
      `State: conflict on rebase. Repo found: ${repo}. The job tried one rebase of its single commit onto origin/${b}; on a conflict it runs rebase --abort, so the commit is still in the local branch and nothing was pushed.`,
      `  git -C ${r} status`,
      `  git -C ${r} fetch origin`,
      `  git -C ${r} rebase origin/${b}`,
      "That rebase stops at the same conflict. Resolve the files by hand, then:",
      `  git -C ${r} rebase --continue`,
      `  git -C ${r} push origin HEAD:${b}`,
      `  git -C ${r} status -sb`,
      "Verify the branch line shows no ahead or behind. If the status shows a rebase still open (the packet line above says when the abort failed) and you would rather start over, run this first:",
      `  git -C ${r} rebase --abort`,
      last,
    ];
  }
  if (kind === "unresolved") {
    return [
      `State: the dotfiles repo could not be synced before start. Repo found: ${repo}. The job stopped before it touched the knowledge store.`,
      `  git -C ${r} status -sb`,
      `  git -C ${r} remote -v`,
      `  git -C ${r} fetch origin`,
      `Fix what git reports (branch checked out, origin reachable). ${last}`,
    ];
  }
  return [];
}
