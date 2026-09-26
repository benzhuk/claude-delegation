#!/usr/bin/env node
// collect-from-origin — read-only signal for accepted-but-unmerged work (lane six,
// docs/specs/collect-from-origin-1/spec.md). Lists every non-main origin/* branch, finds
// docs/work/*.record.md paths that differ between that branch and --main (added, changed, or
// present on --main but absent on the branch), and prints one row per changed record: the
// branch's own tip, the record path, the Status:/Artifact: read from the BRANCH's own blob
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
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseRecord } from "./work-record.mjs";

const ROW_FIELDS = ["branch", "tipSha", "tipDate", "recordPath", "status", "artifactSha", "merged", "hoursSinceLog", "state"];
const SHA_RE = /^[0-9a-f]{40}$/i;

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

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
export function fullRef(ref) {
  if (ref.startsWith("refs/")) return ref;
  return ref.includes("/") ? `refs/remotes/${ref}` : `refs/heads/${ref}`;
}

export function refExists(repo, full) {
  try {
    git(["show-ref", "--verify", "--quiet", full], repo);
    return true;
  } catch {
    return false;
  }
}

export function listOriginBranches(repo, skipSet) {
  const out = tryGit(["for-each-ref", "--format=%(refname)", "refs/remotes/origin/"], repo);
  if (out === null) return [];
  const branches = [];
  for (const line of out.split("\n")) {
    const ref = line.trim();
    if (!ref) continue;
    const name = ref.slice("refs/remotes/origin/".length);
    if (!name || skipSet.has(name)) continue;
    branches.push({ name, ref });
  }
  return branches;
}

function commitInfo(repo, ref) {
  const out = tryGit(["log", "-1", "--format=%H%x1f%cI", ref], repo);
  if (!out) return null;
  const [sha, date] = out.trim().split("\x1f");
  return { sha, date };
}

export function changedRecordPaths(repo, mainFull, branchRef) {
  const out = tryGit(["diff", "--name-only", mainFull, branchRef, "--", "docs/work/*.record.md"], repo);
  if (!out) return [];
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

function blobAt(repo, ref, filePath) {
  return tryGit(["show", `${ref}:${filePath}`], repo);
}

// R1 "Artifact sha": the 40-hex after the last "@" when there is one, else the whole trimmed
// value if that alone is a 40-hex sha; anything else -> null (never shown as merged).
export function extractArtifactSha(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  const at = v.lastIndexOf("@");
  const candidate = at === -1 ? v : v.slice(at + 1).trim();
  return SHA_RE.test(candidate) ? candidate.toLowerCase() : null;
}

function objectExists(repo, sha) {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`], repo);
    return true;
  } catch {
    return false;
  }
}

function isAncestor(repo, sha, mainFull) {
  try {
    git(["merge-base", "--is-ancestor", sha, mainFull], repo);
    return true;
  } catch {
    return false;
  }
}

// null whenever ancestry can't be proven (no artifact sha, --main unresolved, or the sha names
// no object this repo has) — "unknown is never shown as merged" (R1).
function computeMerged(repo, artifactSha, mainFull, mainVerified) {
  if (!artifactSha || !mainVerified) return null;
  if (!objectExists(repo, artifactSha)) return null;
  return isAncestor(repo, artifactSha, mainFull);
}

export function computeState(status, merged) {
  if (status === "accepted") return merged === true ? "accepted-merged" : "accepted-unmerged";
  if (status === "rejected") return "rejected";
  return "owned"; // absent/unparseable/any other Status, per R1 and the scout's recommendation
}

export function hoursSinceLog(log, now) {
  if (!Array.isArray(log) || log.length === 0) return null;
  const t = Date.parse(log.at(-1).at);
  if (Number.isNaN(t)) return null;
  return Math.round(((now - t) / 3_600_000) * 100) / 100;
}

function buildRow(repo, branchInfo, filePath, mainFull, mainVerified, now) {
  const commit = commitInfo(repo, branchInfo.ref);
  const base = {
    branch: branchInfo.name,
    tipSha: commit ? commit.sha : null,
    tipDate: commit ? commit.date : null,
    recordPath: filePath,
  };
  const branchBlob = blobAt(repo, branchInfo.ref, filePath);
  if (branchBlob === null) {
    // Present on --main, absent on this branch's own tree: nothing to read here at all.
    return { ...base, status: null, artifactSha: null, merged: null, hoursSinceLog: null, state: "no-record" };
  }
  const parsed = parseRecord(branchBlob);
  const status = parsed.fields.status ?? null;
  const artifactSha = extractArtifactSha(parsed.fields.artifact);
  const merged = computeMerged(repo, artifactSha, mainFull, mainVerified);
  return { ...base, status, artifactSha, merged, hoursSinceLog: hoursSinceLog(parsed.log, now), state: computeState(status, merged) };
}

export function formatTable(rows) {
  const lines = [ROW_FIELDS.join("\t")];
  for (const r of rows) lines.push(ROW_FIELDS.map((k) => (r[k] === null || r[k] === undefined ? "-" : String(r[k]))).join("\t"));
  return lines.join("\n");
}

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
        for (const filePath of changedRecordPaths(repo, mainFull, branchInfo.ref)) {
          rows.push(buildRow(repo, branchInfo, filePath, mainFull, mainVerified, now));
        }
      }
    }

    write(args.json ? JSON.stringify(rows) : formatTable(rows));
    return 0;
  } catch (err) {
    warn(`collect-from-origin: ${err && err.message ? err.message : err}`);
    return 0; // exit 0 always (R1)
  }
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const real = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const canon = (p) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  return canon(real(fileURLToPath(import.meta.url))) === canon(real(entry));
}

if (isMainModule()) {
  process.exit(main());
}
