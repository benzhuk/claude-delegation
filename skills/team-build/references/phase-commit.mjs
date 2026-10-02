// node skills/team-build/references/phase-commit.mjs --worktree <dir> [--message <text>] [--json]
//
// Lane 74 item 1: uncommitted code never outlives a phase. build-loop-workflow.js is a Workflow
// script with no fs or shell, so the end-of-phase commit is this deterministic Node helper, and a
// runner agent executes it after every Build, Fix and seam-fix agent call, including a call that
// returned nothing (a builder that died leaves committed work).
//
// Given a territory worktree it:
//   - does nothing when the tree is clean (nothing staged, modified or untracked-and-unignored);
//   - otherwise stages everything not ignored (`git add -A`) and makes ONE conventional commit
//     with the repo's configured identity (it never sets or switches one; with no identity it
//     reports `no-identity` and leaves every file exactly as it was, nothing staged);
//   - never pushes, never uses --no-verify, never resets, cleans or stashes;
//   - refuses a path that is not the root of a linked worktree (not-worktree-root) and a main
//     checkout (main-checkout);
//   - refuses on a detached HEAD, on main/master (a durable checkout is never committed to), and
//     while a merge, rebase or cherry-pick is in progress or paths are unmerged.
// Exit code: 0 for committed or clean, 3 for a refusal or a failed commit, 2 for bad arguments.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_MESSAGE = "chore: phase-end commit of uncommitted territory work";
export const PROTECTED_BRANCHES = ["main", "master"];

function git(cwd, args, env) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: env ?? process.env, windowsHide: true });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error ?? null };
}

function normPath(p) {
  let r = path.resolve(p);
  try {
    r = fs.realpathSync.native(r);
  } catch {
    /* compare the resolved path as given */
  }
  return process.platform === "win32" ? r.toLowerCase() : r;
}

function result(fields) {
  return { committed: false, sha: "", dirty: 0, reason: "", ...fields };
}

function gitDirOf(worktree, env) {
  const r = git(worktree, ["rev-parse", "--git-dir"], env);
  if (r.status !== 0) return null;
  return path.resolve(worktree, r.stdout.trim());
}

/**
 * @param {{worktree: string, message?: string, env?: NodeJS.ProcessEnv}} opts
 * @returns {{committed: boolean, sha: string, dirty: number, reason: string, detail?: string}}
 */
export function phaseCommit(opts) {
  const { worktree, env } = opts;
  const message = opts.message && opts.message.trim() !== "" ? opts.message : DEFAULT_MESSAGE;
  if (!worktree || !fs.existsSync(worktree)) return result({ reason: "worktree-missing" });

  const inside = git(worktree, ["rev-parse", "--is-inside-work-tree"], env);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") return result({ reason: "not-a-work-tree" });

  // The target must be the root of a LINKED worktree (a territory). A path that is only somewhere
  // inside a checkout, or a main checkout itself, would commit that checkout's untracked files.
  const top = git(worktree, ["rev-parse", "--show-toplevel"], env);
  if (top.status !== 0 || normPath(top.stdout.trim()) !== normPath(worktree)) {
    return result({ reason: "not-worktree-root", detail: top.stdout.trim() });
  }
  const gd = git(worktree, ["rev-parse", "--git-dir"], env);
  const cd = git(worktree, ["rev-parse", "--git-common-dir"], env);
  if (gd.status === 0 && cd.status === 0 && normPath(path.resolve(worktree, gd.stdout.trim())) === normPath(path.resolve(worktree, cd.stdout.trim()))) {
    return result({ reason: "main-checkout" });
  }

  const branch = git(worktree, ["symbolic-ref", "--quiet", "--short", "HEAD"], env);
  const branchName = branch.status === 0 ? branch.stdout.trim() : "";

  const status = git(worktree, ["status", "--porcelain", "--untracked-files=all"], env);
  if (status.status !== 0) return result({ reason: "status-failed", detail: status.stderr.trim() });
  const lines = status.stdout.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return result({ reason: "clean", sha: headSha(worktree, env) });

  const dirty = lines.length;
  if (branchName === "") return result({ dirty, reason: "detached-head" });
  if (PROTECTED_BRANCHES.includes(branchName)) return result({ dirty, reason: "protected-branch", detail: branchName });

  const gitDir = gitDirOf(worktree, env);
  if (gitDir) {
    for (const marker of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"]) {
      if (fs.existsSync(path.join(gitDir, marker))) return result({ dirty, reason: "operation-in-progress", detail: marker });
    }
  }
  if (lines.some((l) => /^(DD|AU|UD|UA|DU|AA|UU) /.test(l))) return result({ dirty, reason: "unmerged-paths" });

  const name = git(worktree, ["config", "user.name"], env);
  const email = git(worktree, ["config", "user.email"], env);
  if (name.stdout.trim() === "" || email.stdout.trim() === "") return result({ dirty, reason: "no-identity" });

  const add = git(worktree, ["add", "-A"], env);
  if (add.status !== 0) return result({ dirty, reason: "add-failed", detail: add.stderr.trim() });
  const commit = git(worktree, ["commit", "-m", message], env);
  if (commit.status !== 0) {
    return result({ dirty, reason: "commit-failed", detail: (commit.stderr || commit.stdout).trim().slice(0, 600) });
  }
  return result({ committed: true, dirty, reason: "committed", sha: headSha(worktree, env) });
}

function headSha(worktree, env) {
  const r = git(worktree, ["rev-parse", "HEAD"], env);
  return r.status === 0 ? r.stdout.trim() : "";
}

export function parseArgs(argv) {
  const opts = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--worktree" || a === "--message") {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      opts[a === "--worktree" ? "worktree" : "message"] = v;
      i += 1;
    } else throw new Error(`unknown option: ${a}`);
  }
  if (!opts.worktree) throw new Error("missing required option: --worktree");
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`phase-commit: ${e.message}\n`);
    return 2;
  }
  const res = phaseCommit({ worktree: path.resolve(opts.worktree), message: opts.message });
  if (opts.json) process.stdout.write(`${JSON.stringify(res)}\n`);
  else process.stdout.write(`${res.committed ? "committed" : res.reason}${res.sha ? ` ${res.sha}` : ""}${res.detail ? ` (${res.detail})` : ""}\n`);
  return res.committed || res.reason === "clean" ? 0 : 3;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
