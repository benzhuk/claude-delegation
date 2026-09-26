#!/usr/bin/env node
// collect-from-origin — read-only signal for accepted-but-unmerged work (lane six,
// docs/specs/collect-from-origin-1/spec.md). Lists every non-main origin/* branch whose tip is
// NOT already an ancestor of --main (a fully merged branch has nothing left to report), finds
// docs/work/*.record.md paths that the branch itself added or changed since it forked from
// --main, and prints one row per changed record (or one no-record row when a branch has none):
// the branch's own tip, the record path, the Status:/Artifact: read from the BRANCH's own blob
// (never main's — an attacker record on main with a later Status must never leak into a row
// about a different branch), whether the artifact sha is a proven ancestor of --main, hours
// since the record's last Log: line, and a state word.
//
// Reads only through git plumbing: for-each-ref, show, cat-file, merge-base --is-ancestor,
// log -1, diff --name-only. Never `git checkout`, never writes, never a temp file. The one
// exception is the `git fetch` this CLI is itself specified to run (skip with --no-fetch).
// Exit 0 always, including a failed fetch (stderr warning, then it proceeds with local refs).
//
// node scripts/collect-from-origin.mjs [--repo <dir>] [--main <ref>] [--no-fetch] [--json] [--skip <name>]...

import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseRecord } from "./work-record.mjs";

const ROW_FIELDS = ["branch", "tipSha", "tipDate", "recordPath", "status", "artifactSha", "merged", "hoursSinceLog", "state"];
const SHA_RE = /^[0-9a-f]{40}$/i;

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const tryGit = (args, cwd) => { try { return git(args, cwd); } catch { return null; } };
// One exit-status reader for every read-only existence/ancestry check below: true on exit 0,
// false on exit 1 (git's own "no"), null for anything else — an unknown git failure (a corrupt
// or shallow repo, say) is never coerced into a confident answer either way (F7).
const ok = (args, repo) => { try { git(args, repo); return true; } catch (err) { return err && err.status === 1 ? false : null; } };

export function parseArgs(argv) {
  const out = { repo: null, main: "origin/main", noFetch: false, json: false, skip: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") out.repo = argv[++i];
    else if (a === "--main") out.main = argv[++i];
    else if (a === "--no-fetch") out.noFetch = true;
    else if (a === "--json") out.json = true;
    else if (a === "--skip") out.skip.push(argv[++i]);
  }
  return out;
}

// A full refname, never a bare/short name handed straight to git as a revision operand (the
// same DWIM-ambiguity discipline scripts/janitor.mjs documents at length): "origin/main" (has a
// slash, not already "refs/...") becomes refs/remotes/origin/main; a bare name becomes
// refs/heads/<name>. Existence is proven separately, with show-ref, before any use as a revision.
export const fullRef = (ref) => (ref.startsWith("refs/") ? ref : ref.includes("/") ? `refs/remotes/${ref}` : `refs/heads/${ref}`);

export const refExists = (repo, full) => ok(["show-ref", "--verify", "--quiet", full], repo) === true;

export function listOriginBranches(repo, skipSet) {
  const out = tryGit(["for-each-ref", "--format=%(refname)", "refs/remotes/origin/"], repo);
  if (out === null) return [];
  return out.split("\n").map((l) => l.trim()).filter(Boolean)
    .map((ref) => ({ ref, name: ref.slice("refs/remotes/origin/".length) }))
    .filter((b) => b.name && !skipSet.has(b.name));
}

function commitInfo(repo, ref) {
  const out = tryGit(["log", "-1", "--format=%H%x1f%cI", ref], repo);
  if (!out) return null;
  const [sha, date] = out.trim().split("\x1f");
  return { sha, date };
}

// Three-dot: only records the branch itself added or changed since it forked from --main.
// --diff-filter=AM (added/modified, as seen from the branch side) excludes the D direction — a
// record --main has and the branch's own tree lacks is not "this branch changed a record".
// ":(top,glob)" anchors the pathspec at the repo root, so a --repo pointing at a subdirectory
// (or a nested docs/work/x/y.record.md) can't silently under- or over-match (F5).
function diffRecordPaths(repo, range) {
  return tryGit(["diff", "--name-only", "--no-renames", "--diff-filter=AM", ...range, "--", ":(top,glob)docs/work/*.record.md"], repo);
}

export function changedRecordPaths(repo, mainFull, branchRef) {
  // No merge base (orphan branch / shallow clone): fall back to R1's literal two-dot range
  // rather than reading the missing merge base as "no changes" (a confident false negative).
  const out = diffRecordPaths(repo, [`${mainFull}...${branchRef}`]) ?? diffRecordPaths(repo, [mainFull, branchRef]);
  return out ? out.split("\n").map((s) => s.trim()).filter(Boolean) : [];
}

const blobAt = (repo, ref, filePath) => tryGit(["show", `${ref}:${filePath}`], repo);

// R1 "Artifact sha": the 40-hex after the last "@" when there is one, else the whole trimmed
// value if that alone is a 40-hex sha; anything else -> null (never shown as merged).
export function extractArtifactSha(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  const at = v.lastIndexOf("@");
  const candidate = at === -1 ? v : v.slice(at + 1).trim();
  return SHA_RE.test(candidate) ? candidate.toLowerCase() : null;
}

const objectExists = (repo, sha) => ok(["cat-file", "-e", `${sha}^{commit}`], repo) === true;

// true/false/null (see `ok`) — a confirmed non-ancestor is `false`; an unresolvable check is
// `null`, never a confident `false` (F7).
const isAncestor = (repo, a, b) => ok(["merge-base", "--is-ancestor", a, b], repo);

// null whenever ancestry can't be proven (no artifact sha, --main unresolved, or the sha names
// no object this repo has) — "unknown is never shown as merged" (R1).
function computeMerged(repo, artifactSha, mainFull, mainVerified) {
  if (!artifactSha || !mainVerified || !objectExists(repo, artifactSha)) return null;
  return isAncestor(repo, artifactSha, mainFull);
}

export function computeState(status, merged) {
  if (status === "accepted") return merged === true ? "accepted-merged" : "accepted-unmerged";
  return status === "rejected" ? "rejected" : "owned"; // absent/unparseable/any other -> owned (R1)
}

export function hoursSinceLog(log, now) {
  if (!Array.isArray(log) || log.length === 0) return null;
  const t = Date.parse(log.at(-1).at);
  return Number.isNaN(t) ? null : Math.round(((now - t) / 3_600_000) * 100) / 100;
}

const tipFields = (commit) => ({ tipSha: commit ? commit.sha : null, tipDate: commit ? commit.date : null });

// A branch with zero changed records still gets exactly one row, so a lead sees the branch at
// all rather than it disappearing from the table (F2).
const noRecordRow = (branchInfo, commit) => ({ branch: branchInfo.name, ...tipFields(commit), recordPath: null, status: null, artifactSha: null, merged: null, hoursSinceLog: null, state: "no-record" });

function buildRow(repo, branchInfo, filePath, mainFull, mainVerified, now, commit) {
  const parsed = parseRecord(blobAt(repo, branchInfo.ref, filePath) ?? "");
  const status = parsed.fields.status ?? null;
  const artifactSha = extractArtifactSha(parsed.fields.artifact);
  const merged = computeMerged(repo, artifactSha, mainFull, mainVerified);
  return { branch: branchInfo.name, ...tipFields(commit), recordPath: filePath, status, artifactSha, merged, hoursSinceLog: hoursSinceLog(parsed.log, now), state: computeState(status, merged) };
}

export const formatTable = (rows) => [ROW_FIELDS.join("\t"), ...rows.map((r) => ROW_FIELDS.map((k) => String(r[k] ?? "-")).join("\t"))].join("\n");

export function main(argv = process.argv.slice(2), opts = {}) {
  const write = opts.write ?? ((s) => console.log(s));
  const warn = opts.warn ?? ((s) => process.stderr.write(`${s}\n`));
  const now = opts.now ?? Date.now();
  try {
    const args = parseArgs(argv);
    const repo = args.repo ?? opts.cwd ?? process.cwd();
    if (!args.noFetch) {
      try {
        git(["fetch", "origin"], repo);
      } catch (err) {
        warn(`collect-from-origin: git fetch failed, proceeding with local refs: ${err && err.message ? err.message : err}`);
      }
    }
    const mainFull = fullRef(args.main);
    const mainVerified = refExists(repo, mainFull);
    if (!mainVerified) warn(`collect-from-origin: --main ref "${args.main}" not found locally; merged and diff checks are skipped`);
    const skipSet = new Set(["main", "HEAD", ...args.skip]);
    const rows = [];
    if (mainVerified) {
      for (const branchInfo of listOriginBranches(repo, skipSet)) {
        if (isAncestor(repo, branchInfo.ref, mainFull) === true) continue; // fully merged: nothing left to report
        const commit = commitInfo(repo, branchInfo.ref);
        const paths = changedRecordPaths(repo, mainFull, branchInfo.ref);
        if (paths.length === 0) { rows.push(noRecordRow(branchInfo, commit)); continue; }
        for (const filePath of paths) rows.push(buildRow(repo, branchInfo, filePath, mainFull, mainVerified, now, commit));
      }
    }
    write(args.json ? JSON.stringify(rows) : formatTable(rows));
    return 0;
  } catch (err) {
    warn(`collect-from-origin: ${err && err.message ? err.message : err}`);
    return 0; // exit 0 always (R1)
  }
}

// process.exitCode (not process.exit): process.exit kills the process before an async stdout
// pipe write flushes, silently truncating piped --json output past 64 KiB (F1).
const isMainModule = () => !!process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMainModule()) process.exitCode = main();
