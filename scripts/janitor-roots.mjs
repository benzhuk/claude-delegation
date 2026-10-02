// janitor-roots - lane 74 item 2. The janitor's roots are a LIST, not one pinned repo.
//
// Pure read-only discovery: nothing here writes or removes. It imports nothing from janitor.mjs (which
// wires it in): the one git call, `git worktree list`, is passed in as `listWorktrees`.
// Every location is injected (home, tmp dir, /var/tmp), so a test passes fixture directories and
// never falls back to the real home or the real `~/Code`.
//
// Roots (spec item 2): every git repo under `<home>/Code`, `<repo>/.claude/worktrees` of each such
// repo, the session Temp scratch root, `<home>/orca/workspaces`, and `/var/tmp/lane-*`.
// Never BTO (`<home>/Code/BTO/**`), never the dotfiles repo, plus a configurable exclude list.
import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", ".claude", ".next", "dist", "build", ".cache"]);
const DOTFILES_NAME_RE = /dotfiles|chezmoi/i;
const MAX_REPO_DEPTH = 3;

const foldCase = (p) => (process.platform === "win32" || process.platform === "darwin" ? p.toLowerCase() : p);

/** Realpath-ish normal form for comparing two paths (case folded on win32/darwin, forward slashes). */
export function normPath(p) {
  let r = path.resolve(String(p));
  try {
    r = fs.realpathSync.native(r);
  } catch {
    /* missing: compare by its resolved form */
  }
  return foldCase(r.split("\\").join("/")).replace(/\/+$/, "");
}

/** True when `child` is `parent` or inside it. */
export function isInside(child, parent) {
  const c = normPath(child);
  const p = normPath(parent);
  return c === p || c.startsWith(`${p}/`);
}

/**
 * Exclusions (autonomy 7): anything under `<home>/Code/BTO`, any path with a segment named like the
 * dotfiles repo, and the configured `exclude` list (absolute paths; a path inside one is excluded).
 */
export function isExcludedPath(target, { home, exclude = [] } = {}) {
  if (home && isInside(target, path.join(home, "Code", "BTO"))) return true;
  const segments = path.resolve(String(target)).split(/[\\/]/);
  if (segments.some((s) => DOTFILES_NAME_RE.test(s))) return true;
  return exclude.some((e) => isInside(target, e));
}

/**
 * The default root list for a host. `tmpScratch` is the session Temp scratch root (the caller passes
 * `<os.tmpdir()>/claude` or whatever its host uses); `varTmp` is `/var/tmp`, whose `lane-*` children
 * are the roots on Linux. Absent directories are simply skipped at scan time.
 * @returns {{ kind: "code"|"folders"|"lane-glob", path: string }[]}
 */
export function defaultRoots({ home, tmpScratch, varTmp }) {
  const roots = [{ kind: "code", path: path.join(home, "Code") }];
  if (tmpScratch) roots.push({ kind: "folders", path: tmpScratch });
  roots.push({ kind: "folders", path: path.join(home, "orca", "workspaces") });
  if (varTmp) roots.push({ kind: "lane-glob", path: varTmp });
  return roots;
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function lstatKind(p) {
  try {
    const st = fs.lstatSync(p);
    return st.isDirectory() ? "dir" : st.isFile() ? "file" : "other";
  } catch {
    return null;
  }
}

function childDirs(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => isDir(path.join(dir, n))).sort().map((n) => path.join(dir, n));
}

/**
 * Every git repo (a directory whose `.git` is a DIRECTORY, i.e. a main checkout - a `.git` FILE is a
 * linked worktree, never a repo here) under a "code" root, at most MAX_REPO_DEPTH levels down. Does
 * not descend into a repo it finds. Excluded paths are pruned, never entered.
 */
export function discoverRepos(codeRoot, { home, exclude = [], maxDepth = MAX_REPO_DEPTH } = {}) {
  const repos = [];
  const walk = (dir, depth) => {
    if (isExcludedPath(dir, { home, exclude })) return;
    if (lstatKind(path.join(dir, ".git")) === "dir") {
      repos.push(dir);
      return;
    }
    if (depth >= maxDepth) return;
    for (const child of childDirs(dir)) {
      if (SKIP_DIRS.has(path.basename(child))) continue;
      walk(child, depth + 1);
    }
  };
  for (const child of childDirs(codeRoot)) {
    if (SKIP_DIRS.has(path.basename(child))) continue;
    walk(child, 1);
  }
  return repos;
}

/**
 * Scans the root list. Returns { repos, folders }:
 *   repos   - absolute paths of discovered main checkouts (excluded ones never appear);
 *   folders - candidate folders under non-code roots (`<repo>/.claude/worktrees/*`, the scratch
 *             root, orca/workspaces, `/var/tmp/lane-*`), each { path, root }; only folders are listed
 *             here, whether registered or not is decided by the caller from the worktree lists.
 */
export function scanRoots(roots, { home, exclude = [] } = {}) {
  const repos = [];
  const folders = [];
  const seen = new Set();
  const addFolder = (p, root) => {
    const key = normPath(p);
    if (seen.has(key) || isExcludedPath(p, { home, exclude })) return;
    seen.add(key);
    folders.push({ path: p, root });
  };
  for (const root of roots) {
    if (root.kind === "code") {
      for (const repo of discoverRepos(root.path, { home, exclude })) {
        repos.push(repo);
        for (const wt of childDirs(path.join(repo, ".claude", "worktrees"))) addFolder(wt, path.join(repo, ".claude", "worktrees"));
      }
    } else if (root.kind === "folders") {
      for (const child of childDirs(root.path)) {
        addFolder(child, root.path);
        // orca/workspaces/<repo>/<worktree>: one level deeper holds the worktrees themselves.
        if (lstatKind(path.join(child, ".git")) === null) for (const grand of childDirs(child)) addFolder(grand, root.path);
      }
    } else if (root.kind === "lane-glob") {
      for (const child of childDirs(root.path)) if (/^lane-/.test(path.basename(child))) addFolder(child, root.path);
    }
  }
  return { repos, folders };
}

/** True when the folder itself carries a `.git` file or directory (a checkout of something). */
export function gitMarkerKind(folder) {
  return lstatKind(path.join(folder, ".git"));
}

/**
 * Registered worktree paths across every repo: a Set of normPath keys (main trees included).
 * A repo whose worktree list cannot be read contributes nothing and is named in `unreadable`.
 */
export function registeredWorktrees(repos, listWorktrees) {
  const registered = new Set();
  const perRepo = new Map();
  const unreadable = [];
  for (const repo of repos) {
    const list = listWorktrees(repo);
    if (list === null) {
      unreadable.push(repo);
      continue;
    }
    perRepo.set(repo, list);
    for (const w of list) registered.add(normPath(w.path));
  }
  return { registered, perRepo, unreadable };
}
