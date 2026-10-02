// janitor-archive - lane 74 item 3. ARCHIVE, then remove; never delete work.
//
// Every step goes through git. There is NO unlink path here: a worktree is removed with a plain
// `git worktree remove` (no force), a local branch with `git branch -D` only AFTER its tip is proven
// on origin under an `archive/...` name. The only ref this module ever pushes is `archive/<name>-<sha>`
// (assertArchiveRef), never forced, never any other ref. Archive commits use the host's configured
// git identity; with none resolvable the item is SKIPPED and reported (never set an identity).
import { execFileSync } from "node:child_process";

import { withoutRepoLocatingGitEnv } from "../skills/multi/scripts/transport.mjs";

const PUSH_TIMEOUT_MS = 60_000;

function run(args, cwd, { timeout, network = false, maxBuffer } = {}) {
  const env = withoutRepoLocatingGitEnv(process.env);
  if (network) Object.assign(env, { GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" });
  return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout, maxBuffer });
}

function tryRun(args, cwd, opts) {
  try {
    return { ok: true, out: run(args, cwd, opts) };
  } catch (err) {
    return { ok: false, error: String(err?.stderr || err?.message || err).trim().split("\n").pop() };
  }
}

/** `archive/<lane-or-folder>-<shortsha>`: the name is slugged to refname-safe characters. */
export function archiveRefName(name, sha) {
  const slug = String(name).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 60) || "item";
  return `archive/${slug}-${String(sha).slice(0, 7)}`;
}

function assertArchiveRef(ref) {
  if (!/^archive\/[A-Za-z0-9._-]+$/.test(ref)) throw new Error(`refusing to push a non-archive ref: ${ref}`);
}

/** True when git can name a committer (user.name and user.email both non-empty) in `cwd`. */
export function hasIdentity(cwd) {
  const name = tryRun(["config", "--get", "user.name"], cwd);
  const email = tryRun(["config", "--get", "user.email"], cwd);
  return name.ok && email.ok && name.out.trim() !== "" && email.out.trim() !== "";
}

/** { dirty, ignored } counts from `git status`: dirty = tracked + untracked entries, ignored = `!!` entries. */
export function statusCounts(cwd) {
  const r = tryRun(["status", "--porcelain", "--untracked-files=all", "--ignored=matching"], cwd);
  if (!r.ok) return null;
  let dirty = 0;
  let ignored = 0;
  for (const line of r.out.split("\n")) {
    if (!line.trim()) continue;
    if (line.startsWith("!!")) ignored += 1;
    else dirty += 1;
  }
  return { dirty, ignored };
}

function hasOrigin(cwd) {
  const r = tryRun(["remote", "get-url", "origin"], cwd);
  return r.ok && r.out.trim() !== "";
}

/** Origin remotes that belong to BTO ("leave BTO to BTO"); matched as case-insensitive substrings of the origin URL with backslash read as slash. */
export const DEFAULT_EXCLUDE_REMOTES = Object.freeze(["github.com/nucleusfilms/", "github.com:nucleusfilms/", "/bto-", "/bto_"]);

/** The pattern of `excludeRemotes` that `cwd`'s origin URL matches, or null. */
export function matchedExcludedRemote(cwd, excludeRemotes = DEFAULT_EXCLUDE_REMOTES) {
  const r = tryRun(["remote", "get-url", "origin"], cwd);
  if (!r.ok) return null;
  const url = r.out.trim().replaceAll("\\", "/").toLowerCase();
  return excludeRemotes.find((p) => url.includes(String(p).replaceAll("\\", "/").toLowerCase())) ?? null;
}

/** Pushes `refs/heads/<localRef>` to `refs/heads/<archiveRef>` on origin (never forced) and proves it landed. */
function pushArchive(cwd, localRef, archiveRef, sha) {
  assertArchiveRef(archiveRef);
  const push = tryRun(["push", "origin", `refs/heads/${localRef}:refs/heads/${archiveRef}`], cwd, { timeout: PUSH_TIMEOUT_MS, network: true });
  if (!push.ok) return { ok: false, error: `push failed: ${push.error}` };
  const probe = tryRun(["ls-remote", "origin", `refs/heads/${archiveRef}`], cwd, { timeout: PUSH_TIMEOUT_MS, network: true });
  if (!probe.ok || !probe.out.startsWith(sha)) return { ok: false, error: "push not confirmed on origin" };
  return { ok: true };
}

/**
 * Commits everything in the checkout at `dir` (tracked changes AND untracked files) onto a detached
 * archive commit, names it `archive/<name>-<shortsha>`, pushes that ref to origin and proves it is
 * there. Does NOT remove anything. Refuses (ok:false, skipped) when: no identity, no origin, or
 * IGNORED content exists (autonomy 4: it would be lost on removal and is not archived).
 * @returns {{ ok: boolean, ref?: string, sha?: string, skipped?: string, error?: string }}
 */
export function archiveCheckout({ dir, name, excludeRemotes = DEFAULT_EXCLUDE_REMOTES }) {
  if (!hasIdentity(dir)) return { ok: false, skipped: "no git identity resolves here (never set one)" };
  const counts = statusCounts(dir);
  if (!counts) return { ok: false, error: "git status failed" };
  if (counts.ignored > 0) return { ok: false, skipped: `${counts.ignored} ignored path(s) would be lost; not archived` };
  // Edits that `git status` never shows (--skip-worktree, --assume-unchanged) would be lost on removal.
  const flags = tryRun(["ls-files", "-v"], dir, { maxBuffer: 256 * 1024 * 1024 });
  if (!flags.ok) return { ok: false, error: "ls-files -v failed" };
  const hidden = flags.out.split("\n").filter((l) => /^(S|[a-z]) /.test(l)).length;
  if (hidden > 0) return { ok: false, skipped: `${hidden} skip-worktree/assume-unchanged path(s) hide edits from git status; not archived` };
  if (!hasOrigin(dir)) return { ok: false, skipped: "no origin remote to push the archive to" };
  const bto = matchedExcludedRemote(dir, excludeRemotes);
  if (bto) return { ok: false, skipped: `excluded (origin matches ${bto})` };
  // Remember where HEAD was so ANY failure after the detach can put it back (nothing is discarded).
  const origHeadR = tryRun(["rev-parse", "HEAD"], dir);
  if (!origHeadR.ok) return { ok: false, error: "rev-parse HEAD failed" };
  const origHead = origHeadR.out.trim();
  const origBranch = tryRun(["symbolic-ref", "-q", "--short", "HEAD"], dir);
  const branchName = origBranch.ok ? origBranch.out.trim() : "";
  const detach = tryRun(["checkout", "--detach"], dir);
  if (!detach.ok) return { ok: false, error: `detach failed: ${detach.error}` };
  /** Re-attach HEAD to where it was; the archived content stays in the tree and index, so the row recurs. */
  const fail = (result) => {
    const back = branchName ? tryRun(["symbolic-ref", "HEAD", `refs/heads/${branchName}`], dir) : tryRun(["update-ref", "--no-deref", "HEAD", origHead], dir);
    return back.ok ? result : { ...result, error: `${result.error}; HEAD could not be re-attached: ${back.error}` };
  };
  if (counts.dirty > 0) {
    const add = tryRun(["add", "-A"], dir);
    if (!add.ok) return fail({ ok: false, error: `add failed: ${add.error}` });
    const commit = tryRun(["commit", "-q", "-m", `archive: ${name} (janitor)`], dir);
    if (!commit.ok) return fail({ ok: false, error: `commit failed: ${commit.error}` });
  }
  const head = tryRun(["rev-parse", "HEAD"], dir);
  if (!head.ok) return fail({ ok: false, error: "rev-parse HEAD failed" });
  const sha = head.out.trim();
  const ref = archiveRefName(name, sha);
  const branch = tryRun(["branch", "-f", ref, sha], dir);
  if (!branch.ok) return fail({ ok: false, error: `branch failed: ${branch.error}` });
  const pushed = pushArchive(dir, ref, ref, sha);
  if (!pushed.ok) return fail({ ok: false, error: pushed.error, ref, sha });
  return { ok: true, ref, sha };
}

/** archiveCheckout, then a plain (never forced) `git worktree remove` run from `repoRoot`. */
export function archiveThenRemoveWorktree({ repoRoot, wtPath, name, excludeRemotes }) {
  const archived = archiveCheckout({ dir: wtPath, name, excludeRemotes });
  if (!archived.ok) return archived;
  const rm = tryRun(["worktree", "remove", wtPath], repoRoot);
  if (!rm.ok) return { ...archived, ok: false, error: `archived as ${archived.ref}; worktree remove refused: ${rm.error}` };
  return { ...archived, removed: true };
}

/** Pushes a local-only unmerged branch as `archive/<branch>-<shortsha>`, then (proof in hand) deletes it locally. */
export function archiveThenDeleteBranch({ repoRoot, branch, excludeRemotes = DEFAULT_EXCLUDE_REMOTES }) {
  const tip = tryRun(["rev-parse", "--verify", `refs/heads/${branch}`], repoRoot);
  if (!tip.ok) return { ok: false, error: "branch not found" };
  if (!hasOrigin(repoRoot)) return { ok: false, skipped: "no origin remote to push the archive to" };
  const bto = matchedExcludedRemote(repoRoot, excludeRemotes);
  if (bto) return { ok: false, skipped: `excluded (origin matches ${bto})` };
  const sha = tip.out.trim();
  const ref = archiveRefName(branch, sha);
  const pushed = pushArchive(repoRoot, branch, ref, sha);
  if (!pushed.ok) return { ok: false, error: pushed.error, ref, sha };
  const del = tryRun(["branch", "-D", branch], repoRoot);
  if (!del.ok) return { ok: false, ref, sha, error: `archived as ${ref}; branch delete refused: ${del.error}` };
  return { ok: true, ref, sha, deleted: true };
}
