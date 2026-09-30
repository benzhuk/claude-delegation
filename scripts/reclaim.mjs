#!/usr/bin/env node
// scripts/reclaim.mjs
//
// C2 (spec.md, amended by F3-F8, F10, F13, F16, F17 - ruling r0 adopts every finding). The one
// allowlisted deleter: `reclaim [--dry-run] <path>... | --branch <name> --repo <dir>`.
//
// It validates every argument first. If any argument is refused, it removes nothing, prints one
// `refused <arg>: <reason>` line per refusal, and exits 3. Usage errors exit 2. Success exits 0.
//
// Four classes, and nothing else:
//   S - a caller's own session scratchpad (F5: CLAUDE_CODE_SESSION_ID must match), removed with
//       fs after F3's mount-crossing/linked-worktree walk;
//   T - an agent's own `delegation-<name>-XXXX` scratch dir, same removal path as S;
//   W - a SAFE, idle-at-least-24h git worktree (F1/F17), removed through janitor.mjs's applySafe;
//   B - a SAFE local branch (`--branch <name> --repo <dir>`), same applySafe path.
//
// No unlink path exists here that C1's path-safety.mjs and F3's walk have not both cleared first.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { checkRemovablePath, pathEscapesRoot } from "./path-safety.mjs";
import {
  gitToplevel, listWorktrees, gatherState, applySafe, pathWithin, idleHours, IDLE_FLOOR_HOURS, refSha,
  pathHasOpenProcess, winRenameBusyProbe,
} from "./janitor.mjs";
import { loadProjectConfig, switchedOff } from "./project-config.mjs";

// ---------- small, pure helpers ----------

function containsDotDot(raw) {
  // F7: split on either separator - a raw argument crafted on one OS can still carry the other
  // OS's separator, and the lexical `path.resolve` check alone does not see through a `..` that
  // only resolves correctly once the kernel (not Node's own lexical resolver) walks a symlink.
  return String(raw).split(/[\\/]/).some((seg) => seg === "..");
}

function isHostAbsolute(target, platform) {
  return platform === "win32"
    ? /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/])/.test(target)
    : path.posix.isAbsolute(target);
}

class WalkRefusal extends Error {}

// Seam review MEDIUM 1: this used to be its own copy (round-2 re-review MEDIUM 3's `escapesUp`)
// of the same escape predicate path-safety.mjs and janitor.mjs's `pathWithin` each carried
// separately. All three now import path-safety.mjs's single `pathEscapesRoot` instead.

/**
 * Round-2 re-review HIGH 2: a git directory is not always named `.git` - a bare clone
 * (`git clone --bare`) or a bare repo made by hand IS the repository itself, with no `.git` child
 * at all. This approximates git's own directory-shape test: `HEAD` is a FILE, and `objects/` and
 * `refs/` are both DIRECTORIES, directly inside the candidate. Any lstat error other than "this
 * entry is simply not there" is reported back to the caller to refuse with (ruling r1/r2: a check
 * that cannot be completed must never silently pass).
 */
function looksLikeGitDir(dirPath, fsImpl) {
  let headSt;
  try {
    headSt = fsImpl.lstatSync(path.join(dirPath, "HEAD"));
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return { shaped: false };
    return { error };
  }
  if (!headSt.isFile()) return { shaped: false };
  for (const name of ["objects", "refs"]) {
    let st;
    try {
      st = fsImpl.lstatSync(path.join(dirPath, name));
    } catch (error) {
      if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return { shaped: false };
      return { error };
    }
    if (!st.isDirectory()) return { shaped: false };
  }
  return { shaped: true };
}

/**
 * F3, amended by round-2 review HIGH 2: before any S/T removal, walk the target (lstat only,
 * never following a link) and refuse the whole invocation if any entry - the target included -
 * crosses a mount point, is a `.git` FILE (a linked worktree), or is a `.git` DIRECTORY whose own
 * `worktrees/` is non-empty (a repo with linked worktrees elsewhere). The same walk produces the
 * entry count reclaim prints. A symlink is never followed (lstat reports it, but its
 * `isDirectory()` is false, so the walk never recurses into what it points at) - this is what
 * keeps a symlink INSIDE the tree safe without a dedicated rule for it.
 *
 * HIGH 2's fix: the mount-crossing baseline is the CLASS ROOT's st_dev (e.g. the fake /tmp or
 * /var/tmp base), not the target's own - the old code compared every descendant against the
 * TARGET's own device, so a target that was itself the top of a mounted filesystem (a tmpfs, or a
 * bind mount landing exactly on the target) always matched its own children and was never caught.
 * st_dev alone still cannot see a same-filesystem bind mount at all (this is what
 * checkMountsUnderClassRoot, called by finishST right after this, is for).
 *
 * Round-2 review LOW 11: an lstat/readdir error OTHER than "this entry is simply gone" must refuse
 * the whole invocation, not silently skip past whatever it could not see - an unreadable
 * subdirectory could otherwise hide a `.git` file or a mount point below it, and rmSync would then
 * delete the readable siblings and throw partway through with nothing protected underneath.
 */
function walkForMountAndLinkedWorktrees(target, fsImpl, classRoot) {
  try {
    fsImpl.lstatSync(target);
  } catch (error) {
    if (error && error.code === "ENOENT") return { ok: true, entryCount: 0, absent: true };
    return { ok: false, reason: `could not stat: ${error.message || error}` };
  }
  let baseDev;
  try {
    // HIGH 2: the CLASS ROOT's st_dev, so a target that is itself a mount root is caught too.
    baseDev = fsImpl.lstatSync(classRoot).dev;
  } catch (error) {
    return { ok: false, reason: `could not stat class root: ${(error && error.code) || error}` };
  }
  let entryCount = 0;
  const visit = (p) => {
    let st;
    try {
      st = fsImpl.lstatSync(p);
    } catch (error) {
      if (error && error.code === "ENOENT") return; // vanished mid-walk - nothing left here to protect or to count
      throw new WalkRefusal(`could not stat ${p}`);
    }
    entryCount += 1;
    if (typeof st.dev === "number" && typeof baseDev === "number" && st.dev !== baseDev) {
      throw new WalkRefusal(`crosses a mount point at ${p}`);
    }
    const base = path.basename(p);
    if (base === ".git" && st.isFile()) {
      throw new WalkRefusal(`contains a linked worktree's .git file at ${p}`);
    }
    let isGitDir = base === ".git" && st.isDirectory();
    if (!isGitDir && st.isDirectory()) {
      // Round-2 re-review HIGH 2: a bare repo (or any git dir under another name) is invisible to
      // the basename check above - it IS the repository, with no `.git` child of its own.
      const shape = looksLikeGitDir(p, fsImpl);
      if (shape.error) throw new WalkRefusal(`could not stat ${p}`);
      isGitDir = shape.shaped;
    }
    if (isGitDir) {
      let names = [];
      try {
        names = fsImpl.readdirSync(path.join(p, "worktrees"));
      } catch (error) {
        if (error && error.code !== "ENOENT" && error.code !== "ENOTDIR") {
          throw new WalkRefusal(`could not read ${p}/worktrees`);
        }
        // no worktrees/ subdir - a standalone fixture repo, stays removable
      }
      if (names.length > 0) throw new WalkRefusal(`contains a repo with linked worktrees elsewhere at ${p}`);
    }
    if (st.isDirectory()) {
      let children;
      try {
        children = fsImpl.readdirSync(p);
      } catch (error) {
        if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return;
        throw new WalkRefusal(`could not read ${p}`);
      }
      for (const child of children) visit(path.join(p, child));
    }
  };
  try {
    visit(target);
  } catch (error) {
    if (error instanceof WalkRefusal) return { ok: false, reason: error.message };
    throw error;
  }
  return { ok: true, entryCount };
}

/**
 * Round-2 review HIGH 2, part 2: st_dev cannot see a same-filesystem bind mount at all (two paths
 * on the same device, one of them a bind of the other). This reads the live mount table -
 * `/proc/self/mountinfo` on Linux, `mount`'s own output on darwin - and refuses when the target
 * itself IS a registered mount point, CONTAINS one below it, or LIES UNDER one that sits strictly
 * between the class root and the target (a bind mount wrapping part of the scratch tree). Where
 * the mount table cannot be read at all, this refuses - ruling r1/r2: a check that cannot be
 * completed fails closed, never silently passes. win32 has no equivalent table read here; its
 * junctions are covered separately, by the walk's own symlink-non-follow behavior and (per F3) a
 * reparse-point refusal where the Windows gate needs one.
 */
function readMountPoints(ctx) {
  if (ctx.platform === "linux") {
    let text;
    try {
      text = ctx.fsImpl.readFileSync("/proc/self/mountinfo", "utf8");
    } catch {
      return null;
    }
    const decode = (raw) => raw.replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => decode(line.split(" ")[4] || ""))
      .filter(Boolean);
  }
  if (ctx.platform === "darwin") {
    let text;
    try {
      text = ctx.execFileSyncImpl("mount", [], { encoding: "utf8" });
    } catch {
      return null;
    }
    const points = [];
    for (const line of text.split("\n")) {
      const m = line.match(/ on (.+?) \(/);
      if (m) points.push(m[1]);
    }
    return points;
  }
  return []; // win32 and anything else: no mount-table cross-check attempted here
}

function checkMountsUnderClassRoot(resolved, classRoot, ctx) {
  if (ctx.platform !== "linux" && ctx.platform !== "darwin") return { ok: true };
  const points = readMountPoints(ctx);
  if (points === null) return { ok: false, reason: "could not read the mount table" };
  const withinOrEqual = (parent, child) => {
    const rel = path.relative(path.resolve(parent), path.resolve(child));
    return rel === "" || !pathEscapesRoot(rel);
  };
  const resolvedClassRoot = path.resolve(classRoot);
  for (const raw of points) {
    let real = raw;
    try {
      real = ctx.fsImpl.realpathSync(raw);
    } catch {
      // keep the raw form - a mount point this host cannot resolve right now is still worth
      // comparing textually rather than dropping from consideration entirely
    }
    if (path.resolve(real) === resolvedClassRoot) continue; // the class root's own mount is expected
    if (!withinOrEqual(resolvedClassRoot, real)) continue; // only mounts inside our own scratch tree matter
    if (path.resolve(real) === path.resolve(resolved)) {
      return { ok: false, reason: `crosses a mount point at ${real}` };
    }
    if (withinOrEqual(resolved, real)) {
      return { ok: false, reason: `crosses a mount point at ${real}` };
    }
    if (withinOrEqual(real, resolved)) {
      return { ok: false, reason: `lies under a bind mount at ${real}` };
    }
  }
  return { ok: true };
}

/**
 * Round-2 review HIGH 1, tightened by the re-review that followed it: S/T's downward walk (above)
 * only ever looked BELOW the target - a target that is itself a path INSIDE a linked worktree, an
 * ordinary repo checkout, or a bare repo fell through every check, because the `.git` entry (or,
 * for a bare repo, the repository directory itself) sits ABOVE the target, not below it. This
 * walks every ancestor from the target's parent up to the filesystem root (ruling r2: not merely
 * up to the class root) and refuses on ANY `.git` entry found above the target - the re-review's
 * ruling: a plain repo's own main checkout is live, uncommitted work exactly the same way a linked
 * worktree is, so this no longer distinguishes "has other linked worktrees" from "is just a
 * checkout" - and on any ancestor that itself has a bare-repo shape (HIGH 2). The `git worktree
 * list` branch this used to also carry is gone: it was dead weight (any repo whose list names a
 * non-root worktree already has a non-empty `worktrees/`, already caught by the `.git` check
 * above) and its own `listWorktrees() === null` path failed open.
 */
function checkAncestorsForGit(resolved, ctx) {
  let dir = path.dirname(resolved);
  for (;;) {
    // HIGH 2: `dir` itself may BE a git directory (bare or not), even though its own basename
    // isn't `.git` - a bare clone has no `.git` child at all, the directory itself IS the repo. A
    // directory literally named `.git` is skipped here - it always gets a more specific message
    // below, from its OWN parent's dotGit check one iteration up ("lies inside a git checkout"),
    // and an ordinary `.git` metadata directory happens to satisfy the very same HEAD/objects/refs
    // shape a bare repo does, so checking it here would misreport a checkout's own `.git` as a
    // "bare git directory" instead.
    if (path.basename(dir) !== ".git") {
      const shape = looksLikeGitDir(dir, ctx.fsImpl);
      if (shape.error) {
        return { ok: false, reason: `could not stat ${dir}` };
      }
      if (shape.shaped) {
        return { ok: false, reason: `lies inside a git directory at ${dir}` };
      }
    }
    const dotGit = path.join(dir, ".git");
    let st = null;
    try {
      st = ctx.fsImpl.lstatSync(dotGit);
    } catch (error) {
      if (!error || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) {
        return { ok: false, reason: `could not stat ${dotGit}` };
      }
    }
    if (st) {
      return {
        ok: false,
        reason: st.isDirectory() ? `lies inside a git checkout at ${dir}` : `lies inside a linked worktree at ${dir}`,
      };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root reached
    dir = parent;
  }
  return { ok: true };
}

/**
 * Round-2 re-review MEDIUM 3, part 2: F8's own cwd-containment check used janitor.mjs's
 * `pathWithin`, which (at the time) carried the exact same `..`-prefix defect LOW 12 fixed in
 * path-safety.mjs - a cwd of `<top>/..work` was read as "escapes `<top>`" and so never matched,
 * letting `<top>` itself be removed while it was the live cwd. This is reclaim's own copy of the
 * realpath + win32-case-fold logic `pathWithin` uses (now sharing path-safety.mjs's single
 * `pathEscapesRoot`, per seam review MEDIUM 1, which also fixed `pathWithin` itself).
 */
function within(child, parent, ctx) {
  const realpath = (p) => {
    try {
      return ctx.fsImpl.realpathSync(p);
    } catch {
      return p;
    }
  };
  const norm = (p) => {
    const r = realpath(path.resolve(p));
    return ctx.platform === "win32" ? r.toLowerCase() : r;
  };
  const rel = path.relative(norm(parent), norm(child));
  return rel === "" || !pathEscapesRoot(rel);
}

/** F6: the top scratch directory (S's `claude-<uid>`, T's `delegation-<name>-XXXX`) must be owned
 * by the current uid and must not be group- or world-writable. POSIX only - win32 has no uid/mode
 * model to check this against. */
function checkOwnerNotWidelyWritable(topPath, ctx) {
  if (ctx.platform === "win32") return { ok: true };
  let st;
  try {
    st = ctx.fsImpl.statSync(topPath);
  } catch (error) {
    // F8: an absent top dir is not a refusal - it's `absent`, and the actual removability check
    // (checkRemovablePath, reached via finishST right after this) is what turns ENOENT into that
    // outcome. Skipping the ownership check here just lets that happen; any OTHER stat error still
    // refuses, same as before.
    if (error && error.code === "ENOENT") return { ok: true };
    return { ok: false, reason: `could not stat: ${error.message || error}` };
  }
  if (typeof st.uid === "number" && st.uid !== ctx.uid) {
    return { ok: false, reason: "not owned by the current user" };
  }
  if (typeof st.mode === "number" && (st.mode & 0o022) !== 0) {
    return { ok: false, reason: "group- or world-writable" };
  }
  return { ok: true };
}

// ---------- class S: the caller's own session scratchpad ----------

// Round-2 review MEDIUM 7 (the fix's own words: "Tests use platform/pathImpl injection ... to
// cover the Windows claude segment"): this host's real `path` module is POSIX regardless of what
// `ctx.platform` claims, so a backslash-shaped win32 fixture can only be resolved correctly here
// by explicitly handing these functions `path.win32` - exactly the same pattern janitor.mjs's own
// `pathWithin` already uses for its own win32 tests. Production on a real win32 host is unaffected
// either way, since `path` already IS `path.win32` there.
function pImpl(ctx) {
  return ctx.pathImpl ?? (ctx.platform === "win32" ? path.win32 : path);
}

function sSpecRoot(ctx) {
  const p = pImpl(ctx);
  if (ctx.platform === "win32") {
    const expected = p.join(ctx.home, "AppData", "Local", "Temp");
    if (String(ctx.tmpdir).toLowerCase() !== expected.toLowerCase()) return null;
    return { path: ctx.tmpdir, kind: "win32" };
  }
  if (ctx.platform === "darwin") {
    // F4: darwin's own scratchpad layout is unmeasured. Until a builder records one real Mac
    // session's path, S refuses outright on darwin rather than guess at a layout.
    let real;
    try {
      real = ctx.fsImpl.realpathSync(ctx.tmpdir);
    } catch {
      return null;
    }
    if (!real.startsWith("/private/var/folders/")) return null;
    return { path: real, kind: "darwin-unmeasured" };
  }
  let real;
  try {
    real = ctx.fsImpl.realpathSync(ctx.posixTmpRoot);
  } catch {
    real = ctx.posixTmpRoot;
  }
  return { path: real, kind: "posix" };
}

export function checkS(resolved, ctx) {
  const p = pImpl(ctx);
  const root = sSpecRoot(ctx);
  if (!root) return null;
  const rel = p.relative(root.path, resolved);
  if (rel === "" || pathEscapesRoot(rel, p)) return null;
  if (root.kind === "darwin-unmeasured") {
    return { ok: false, reason: "S class unmeasured on darwin" };
  }
  const segments = rel.split(p.sep).filter(Boolean);
  if (root.kind === "win32") {
    if (!(segments[0] && segments[0].toLowerCase() === "claude")) return null; // not S-shaped at all
  } else if (segments[0] !== `claude-${ctx.uid}`) {
    return null; // not S-shaped at all (e.g. a claude-verify.lock sibling) - let T/W have a look
  }
  if (segments.length < 4 || segments[3] !== "scratchpad") {
    return { ok: false, reason: "does not match the session scratchpad layout" };
  }
  if (segments.length === 4) {
    return { ok: false, reason: "is the scratchpad directory itself" };
  }
  if (root.kind !== "win32") {
    const owner = checkOwnerNotWidelyWritable(p.join(root.path, segments[0]), ctx);
    if (!owner.ok) return owner;
  }
  const session = segments[2];
  if (!ctx.sessionId) {
    return { ok: false, reason: "S needs CLAUDE_CODE_SESSION_ID (own session only)" };
  }
  const same = root.kind === "win32"
    ? String(session).toLowerCase() === String(ctx.sessionId).toLowerCase()
    : session === ctx.sessionId;
  if (!same) {
    return { ok: false, reason: "S needs CLAUDE_CODE_SESSION_ID (own session only)" };
  }
  // NOTE: the root handed to checkRemovablePath's membership check must be the S BASE (root.path),
  // not the `claude-<uid>` directory - a target inside `scratchpad/` is always several segments
  // below the base either way (segments.length > 4 is already enforced above), so this is just the
  // base itself, kept explicit rather than re-derived.
  return { ok: true, root: root.path };
}

// ---------- class T: an agent's own delegation-<name>-XXXX scratch dir ----------

function tRoots(ctx) {
  const p = pImpl(ctx);
  if (ctx.platform === "win32") {
    const expected = p.join(ctx.home, "AppData", "Local", "Temp");
    if (String(ctx.tmpdir).toLowerCase() !== expected.toLowerCase()) return [];
    return [ctx.tmpdir];
  }
  const roots = [];
  for (const base of [ctx.posixTmpRoot, ctx.posixVarTmpRoot]) {
    try {
      roots.push(ctx.fsImpl.realpathSync(base));
    } catch {
      roots.push(base);
    }
  }
  if (ctx.platform === "darwin") {
    try {
      const real = ctx.fsImpl.realpathSync(ctx.tmpdir);
      if (real.startsWith("/private/var/folders/")) roots.push(real);
    } catch {
      // no extra darwin root available
    }
  }
  return roots;
}

export function checkT(resolved, ctx) {
  const p = pImpl(ctx);
  for (const root of tRoots(ctx)) {
    const rel = p.relative(root, resolved);
    if (rel === "" || pathEscapesRoot(rel, p)) continue;
    const segments = rel.split(p.sep).filter(Boolean);
    const topName = segments[0];
    const prefixOk = ctx.platform === "win32" ? /^delegation-/i.test(topName) : topName.startsWith("delegation-");
    if (!prefixOk) {
      return { ok: false, reason: "T dir must be named delegation-<name>-XXXX, directly under a scratch root" };
    }
    const topPath = p.join(root, topName);
    const owner = checkOwnerNotWidelyWritable(topPath, ctx);
    if (!owner.ok) return owner;
    // NOTE: `root` (the T BASE, e.g. /var/tmp), not `topPath`, goes to checkRemovablePath's
    // membership check - the common T removal target IS the whole delegation-<name>-XXXX
    // directory itself, which must resolve STRICTLY under something; using topPath as the root
    // would make that exact, ordinary case fail its own membership check.
    return { ok: true, root };
  }
  return null; // not under any T root at all
}

/** gatherState, with `minAgeHours` only overridden when a caller (a test - production never sets
 * this) explicitly supplies one; otherwise janitor.mjs's own default age floor applies, exactly
 * as the daily act itself gets it. */
function gatherStateFor(root, config, ctx) {
  const extra = ctx.minAgeHours === undefined ? {} : { minAgeHours: ctx.minAgeHours };
  return gatherState({ root, config, now: ctx.now, ...extra });
}

// ---------- repo protection shared by S and T (C1's repoRoots, F17's "repo containing cwd") ----------

function getCwdRepoRoots(ctx) {
  if (ctx._repoRootsCache) return ctx._repoRootsCache;
  let result;
  const toplevel = gitToplevel(ctx.cwd);
  if (!toplevel) {
    result = { ok: true, repoRoots: [] };
  } else {
    const worktrees = listWorktrees(toplevel);
    if (worktrees === null) {
      result = { ok: false, reason: "could not read git worktree list" };
    } else {
      result = {
        ok: true,
        repoRoots: [
          { path: toplevel, kind: "the repo root" },
          ...worktrees.map((w) => ({ path: w.path, kind: "a path in git worktree list" })),
        ],
      };
    }
  }
  ctx._repoRootsCache = result;
  return result;
}

function finishST(cls, resolved, classResult, ctx) {
  const repoRoots = getCwdRepoRoots(ctx);
  if (!repoRoots.ok) return { ok: false, reason: repoRoots.reason };
  const check = checkRemovablePath(resolved, {
    roots: [{ path: classResult.root }],
    repoRoots: repoRoots.repoRoots,
    home: ctx.home,
    platform: ctx.platform,
    allowFile: true,
    fsImpl: ctx.fsImpl,
    notAbsoluteReason: "not absolute on this host",
    underRootReason: "internal: outside its own class root",
  });
  if (!check.ok) {
    if (check.absent) return { ok: false, absent: true, class: cls };
    return { ok: false, reason: check.reason };
  }
  // HIGH 1: look UPWARD from the target too, not only below it - a target sitting INSIDE a linked
  // worktree (or inside a repo with other linked worktrees elsewhere) is caught here even when
  // cwd's own repo has nothing to do with it.
  const ancestors = checkAncestorsForGit(resolved, ctx);
  if (!ancestors.ok) return { ok: false, reason: ancestors.reason };
  const walk = walkForMountAndLinkedWorktrees(resolved, ctx.fsImpl, classResult.root);
  if (!walk.ok) return { ok: false, reason: walk.reason };
  if (walk.absent) return { ok: false, absent: true, class: cls };
  // HIGH 2, part 2: same-filesystem bind mounts st_dev cannot see at all.
  const mounts = checkMountsUnderClassRoot(resolved, classResult.root, ctx);
  if (!mounts.ok) return { ok: false, reason: mounts.reason };
  // Seam review MEDIUM 3: F8's own cwd check (validateArg, above) only ever covered reclaim's OWN
  // process - a live shell belonging to ANY OTHER process, sitting in (or as) the target, was never
  // checked at all before rmSync ran, the S/T twin of the daily act's W-class "open shell" guard
  // (round-1 review finding 2). Re-run here too, since this is the same function the LOW 13 re-check
  // calls immediately before the real rmSync.
  const busy = checkOpenProcess(resolved, ctx);
  if (!busy.ok) return { ok: false, reason: busy.reason };
  return { ok: true, class: cls, resolved, entryCount: walk.entryCount, root: classResult.root };
}

/**
 * Seam review MEDIUM 3: reuses janitor.mjs's own open-process check (`pathHasOpenProcess`, the
 * exact function the daily act's W class gets through applySafe) rather than keeping a second
 * implementation here. `ctx.openProcessImpl`/`ctx.winBusyProbeImpl` default to those real
 * functions; tests inject their own to exercise "unknown"/busy/catastrophic without a real process.
 *
 * win32 has no /proc or lsof - the rename-away-and-back probe is the only mechanism, and it is a
 * real (if self-reverting) filesystem mutation. A `--dry-run` call never removes anything, so it
 * skips the probe entirely rather than touch disk for a prediction; the real, destructive path -
 * both this function's first call (a live, non-dry-run argument) and the LOW 13 re-check
 * immediately before rmSync - always goes through it.
 *
 * A platform this file has no mechanism for at all (neither linux/darwin's probe nor win32's) fails
 * closed: ruling r1/r2, a check that cannot run must refuse, never silently pass.
 */
export function checkOpenProcess(resolved, ctx) {
  if (ctx.platform === "linux" || ctx.platform === "darwin") {
    const open = ctx.openProcessImpl(resolved);
    if (open) return { ok: false, reason: open === "unknown" ? "in-use check failed" : "a process has its cwd here" };
    return { ok: true };
  }
  if (ctx.platform === "win32") {
    if (ctx.dryRun) return { ok: true };
    const probe = ctx.winBusyProbeImpl(resolved);
    if (probe.catastrophic) return { ok: false, reason: probe.detail };
    if (probe.busy) return { ok: false, reason: "a process has its cwd here" };
    return { ok: true };
  }
  return { ok: false, reason: "in-use check failed" };
}

// ---------- class W: a SAFE, idle worktree (F1, F17) ----------

function samePathResolved(a, b) {
  return pathWithin(a, b) && pathWithin(b, a);
}

/**
 * Whether W CLAIMS this path at all - i.e. `git worktree list`, run from the path itself, both
 * succeeds and lists an entry whose own path is this one. Tried before S/T's purely positional
 * (directory-name-shaped) rules: a worktree that happens to live inside a session scratchpad or a
 * `delegation-*` scratch dir (the real, measured layout - scout.md item D, F3's evidence) is still
 * a worktree, and git's own SAFE+idle judgment is a stronger safety net than either positional
 * class's own rule. A path merely INSIDE a repo, but not itself a registered worktree's own root
 * (a file, a build artifact, a nested unregistered `.git`), is not claimed here at all - S/T's
 * checks, including F3's mount/linked-worktree walk, are what catch that case instead.
 */
function claimW(resolved) {
  let worktrees;
  try {
    worktrees = listWorktrees(resolved);
  } catch {
    worktrees = null;
  }
  if (!worktrees || worktrees.length === 0) return null;
  const entry = worktrees.find((w) => samePathResolved(w.path, resolved));
  if (!entry) return null;
  return { worktrees, entry };
}

function validateW(resolved, claim, ctx) {
  const { worktrees, entry } = claim;
  const root = worktrees[0].path; // git worktree list --porcelain always lists the main one first
  if (entry.main) return { ok: false, reason: "is the main worktree" };

  const { config } = loadProjectConfig(root);
  const state = gatherStateFor(root, config, ctx);
  if (state.__blind) return { ok: false, reason: state.reason };
  const safeMatch = state.safe.worktrees.find((w) => samePathResolved(w.ref, resolved));
  if (!safeMatch) {
    const judgMatch = state.judgment.worktrees.find((w) => samePathResolved(w.ref, resolved));
    return { ok: false, reason: judgMatch ? judgMatch.reason : "not SAFE" };
  }
  // F1: the idle floor applies to reclaim's W class too, not only the daily act. Goes through
  // ctx.idleHoursImpl (defaulting to janitor.mjs's real idleHours) so LOW 10's unknown/future
  // labels are testable without needing a real unreadable filesystem source.
  const hrs = ctx.idleHoursImpl(resolved, { home: ctx.home, now: ctx.now });
  if (!(hrs >= IDLE_FLOOR_HOURS)) {
    // Round-2 review, LOW 10 (ruling r1: doubt never gets a confident label): NaN (an unreadable
    // source) and a negative value (a clock running ahead somewhere) are unknowns, not "seen
    // 0-24h ago" - matching applySafe's own labels for the exact same computation.
    const reason = Number.isNaN(hrs) ? "idle age unknown" : hrs < 0 ? "mtime in the future" : "active in last 24h";
    return { ok: false, reason };
  }
  return {
    ok: true,
    root,
    mainBranch: config.main_branch || "main",
    safeMatch,
    fetch: state.fetch,
    tipSha: refSha(root, `refs/heads/${safeMatch.branch}`),
  };
}

// ---------- class B: a SAFE local branch (F17) ----------

function validateB(name, repoDir, ctx) {
  const root = gitToplevel(repoDir);
  if (!root) return { ok: false, reason: "not a git repository" };
  const { config } = loadProjectConfig(root);
  const state = gatherStateFor(root, config, ctx);
  if (state.__blind) return { ok: false, reason: state.reason };
  const safeMatch = state.safe.branches.find((b) => b.ref === name);
  if (!safeMatch) {
    const judgMatch = state.judgment.branches.find((b) => b.ref === name);
    return { ok: false, reason: judgMatch ? judgMatch.reason : "not SAFE" };
  }
  // Round-2 review, MEDIUM 4: classify() deliberately marks a branch SAFE even while it is still
  // checked out in a SAFE linked worktree (it expects the worktree to be removed first) - reclaim
  // narrows the state to the branch alone, so a bare `--branch` call skips that ordering entirely.
  // applySafe's own `stillCheckedOut` guard would catch this at apply time regardless (nothing is
  // ever deleted either way), but validation - and dry-run's own printed line - must say so too,
  // rather than claim `would-remove` for a branch a live run cannot actually delete.
  const wts = listWorktrees(root);
  if (wts === null) return { ok: false, reason: "could not read git worktree list" };
  const holder = wts.find((w) => w.branch === name);
  if (holder) return { ok: false, reason: `checked out in worktree ${holder.path}` };
  return { ok: true, root, mainBranch: config.main_branch || "main", safeMatch, fetch: state.fetch };
}

// ---------- per-argument dispatch ----------

function validateArg(rawArg, ctx) {
  if (containsDotDot(rawArg)) return { ok: false, reason: "contains .." };
  if (!isHostAbsolute(rawArg, ctx.platform)) return { ok: false, reason: "not absolute on this host" };
  let resolved = path.resolve(rawArg);
  // Round-2 review, MEDIUM 6: tRoots()/sSpecRoot() already realpath each root (on macOS /var/tmp
  // and /tmp are themselves symlinks to /private/var/tmp and /private/tmp), but the ARGUMENT was
  // never rewritten to match - `mktemp -d /var/tmp/delegation-x-XXXX` prints the un-rewritten
  // `/var/tmp/...` form, which then falls through every class as "unrecognized" instead of
  // matching the realpath'd root. This never touches anything BELOW the root, so the
  // realpath-equality check inside checkRemovablePath still refuses every symlink under it.
  if (ctx.platform !== "win32") {
    for (const base of [ctx.posixTmpRoot, ctx.posixVarTmpRoot]) {
      let real;
      try {
        real = ctx.fsImpl.realpathSync(base);
      } catch {
        continue;
      }
      if (real !== base && resolved.startsWith(base + path.sep)) {
        resolved = real + resolved.slice(base.length);
        break;
      }
    }
  }

  // F8: every class refuses a target that equals or contains process.cwd() - the one thing that
  // is always still running right now. Uses reclaim's own `within()`, not janitor.mjs's
  // `pathWithin` - see that function's doc comment (round-2 re-review MEDIUM 3).
  if (within(ctx.cwd, resolved, ctx)) {
    return { ok: false, reason: "equals process.cwd() or contains it" };
  }

  // W is tried first, by CLAIM (an actual `git worktree list` match), ahead of S/T's purely
  // positional rules - see claimW()'s own note.
  const claim = claimW(resolved);
  if (claim) {
    const wResult = validateW(resolved, claim, ctx);
    if (!wResult.ok) return wResult;
    return { ok: true, class: "W", resolved, ...wResult };
  }

  const sResult = checkS(resolved, ctx);
  if (sResult) {
    if (!sResult.ok) return sResult;
    return finishST("S", resolved, sResult, ctx);
  }
  const tResult = checkT(resolved, ctx);
  if (tResult) {
    if (!tResult.ok) return tResult;
    return finishST("T", resolved, tResult, ctx);
  }
  return { ok: false, reason: "not S, T, or a live worktree - unrecognized" };
}

// ---------- argv parsing ----------

function parseArgv(argv) {
  let dryRun = false;
  let branch = null;
  let repo = null;
  const paths = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (a === "--branch") {
      branch = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === "--repo") {
      repo = argv[i + 1];
      i += 1;
      continue;
    }
    if (String(a).startsWith("--")) return { error: `unknown flag ${a}` };
    paths.push(a);
  }
  if (branch !== null || repo !== null) {
    if (!branch || !repo) return { error: "--branch needs both --branch <name> and --repo <dir>" };
    if (paths.length > 0) return { error: "--branch cannot be combined with path arguments" };
    return { dryRun, mode: "branch", branch, repo };
  }
  if (paths.length === 0) return { error: "no path given" };
  return { dryRun, mode: "paths", paths };
}

// ---------- main ----------

export function main(argv = process.argv.slice(2), opts = {}) {
  const ctx = {
    cwd: opts.cwd ?? process.cwd(),
    home: opts.home ?? os.homedir(),
    platform: opts.platform ?? process.platform,
    uid: opts.uid ?? (typeof process.getuid === "function" ? process.getuid() : 0),
    tmpdir: opts.tmpdir ?? os.tmpdir(),
    posixTmpRoot: opts.posixTmpRoot ?? "/tmp",
    posixVarTmpRoot: opts.posixVarTmpRoot ?? "/var/tmp",
    sessionId: Object.prototype.hasOwnProperty.call(opts, "sessionId") ? opts.sessionId : process.env.CLAUDE_CODE_SESSION_ID,
    now: opts.now ?? new Date(),
    minAgeHours: opts.minAgeHours,
    fsImpl: opts.fsImpl ?? fs,
    print: opts.print ?? ((line) => process.stdout.write(`${line}\n`)),
    switchedOffImpl: opts.switchedOffImpl ?? switchedOff,
    execFileSyncImpl: opts.execFileSyncImpl ?? execFileSync,
    idleHoursImpl: opts.idleHoursImpl ?? idleHours,
    applySafeImpl: opts.applySafeImpl ?? applySafe,
    // Seam review MEDIUM 3.
    openProcessImpl: opts.openProcessImpl ?? pathHasOpenProcess,
    winBusyProbeImpl: opts.winBusyProbeImpl ?? winRenameBusyProbe,
  };

  const parsed = parseArgv(argv);
  if (parsed.error) {
    process.stderr.write(`reclaim: ${parsed.error}\n`);
    return 2;
  }
  // Seam review MEDIUM 3: win32's busy check is the rename-away-and-back probe, a real (if
  // self-reverting) filesystem mutation - checkOpenProcess() skips it on a dry run.
  ctx.dryRun = parsed.dryRun;

  // F14: reclaim's own kill switch, checked before anything else.
  if (ctx.switchedOffImpl("reclaim")) {
    const items = parsed.mode === "branch" ? [parsed.branch] : parsed.paths;
    for (const item of items) ctx.print(`refused ${item}: reclaim switched off`);
    return 3;
  }

  if (parsed.mode === "branch") {
    const result = validateB(parsed.branch, parsed.repo, ctx);
    if (!result.ok) {
      ctx.print(`refused ${parsed.branch}: ${result.reason}`);
      return 3;
    }
    if (parsed.dryRun) {
      ctx.print(`would-remove B ${parsed.branch} ${result.safeMatch.sha || ""}`.trimEnd());
      return 0;
    }
    const narrowed = {
      safe: { worktrees: [], branches: [result.safeMatch] },
      judgment: { worktrees: [], branches: [], untrackedFiles: [] },
      fetch: result.fetch,
      act: true,
      _raw: { root: result.root, mainBranch: result.mainBranch },
    };
    const log = ctx.applySafeImpl(narrowed, [], { home: ctx.home, now: ctx.now });
    const row = log.find((l) => l.action === "branch-delete");
    if (row && row.ok) {
      // Round-2 review, MEDIUM 5: applySafe already computed a restore hint - reclaim writes no
      // durable record of its own, so stdout is the only place that hint can ever reach an operator.
      ctx.print(`removed B ${parsed.branch} ${row.sha || ""}${row.restore ? ` restore: ${row.restore}` : ""}`.trimEnd());
      return 0;
    }
    process.stderr.write(`reclaim: ${parsed.branch}: ${row ? row.error : "branch-delete did not run"}\n`);
    return 1;
  }

  // Paths mode. Validate every argument first - nothing is removed until every one has cleared.
  const validations = parsed.paths.map((rawArg) => ({ rawArg, result: validateArg(rawArg, ctx) }));
  const refusals = validations.filter((v) => v.result.ok === false && !v.result.absent);
  if (refusals.length > 0) {
    for (const v of refusals) ctx.print(`refused ${v.rawArg}: ${v.result.reason}`);
    return 3;
  }

  let runtimeFailure = false;
  for (const { rawArg, result } of validations) {
    if (result.absent) {
      ctx.print(`absent ${rawArg}`);
      continue;
    }
    if (parsed.dryRun) {
      const tag = result.class === "S" || result.class === "T" ? String(result.entryCount) : (result.tipSha || "");
      ctx.print(`would-remove ${result.class} ${rawArg} ${tag}`.trimEnd());
      continue;
    }
    if (result.class === "S" || result.class === "T") {
      // Round-2 review, LOW 13: the check-to-delete window spans every other argument's own
      // validation (including a W argument's git fetch) - re-run the same S/T checks immediately
      // before the one rmSync that matters, shrinking the window from seconds to microseconds.
      const recheck = finishST(result.class, result.resolved, { root: result.root }, ctx);
      if (!recheck.ok) {
        runtimeFailure = true;
        ctx.print(`failed ${result.class} ${rawArg}: changed since validation (${recheck.absent ? "now absent" : recheck.reason})`);
        continue;
      }
      // Round-2 review, MEDIUM 3: an rmSync failure used to be uncaught - a crash mid-loop left no
      // line at all for what was already removed, and every later argument never ran.
      try {
        ctx.fsImpl.rmSync(result.resolved, { recursive: true, force: false });
        ctx.print(`removed ${result.class} ${rawArg} ${result.entryCount}`);
      } catch (error) {
        if (error && error.code === "ENOENT") {
          ctx.print(`absent ${rawArg}`); // e.g. already removed via an earlier, enclosing argument
        } else {
          runtimeFailure = true;
          ctx.print(`failed ${result.class} ${rawArg}: ${(error && error.code) || "error"} (may be partially removed)`);
        }
      }
      continue;
    }
    // class W
    const narrowed = {
      safe: { worktrees: [result.safeMatch], branches: [] },
      judgment: { worktrees: [], branches: [], untrackedFiles: [] },
      fetch: result.fetch,
      act: true,
      _raw: { root: result.root, mainBranch: result.mainBranch },
    };
    const log = ctx.applySafeImpl(narrowed, [], { home: ctx.home, now: ctx.now });
    const row = log.find((l) => l.action === "worktree-remove");
    if (row && row.ok) {
      // MEDIUM 5: same restore-hint reasoning as B above.
      ctx.print(`removed W ${rawArg} ${row.sha || ""}${row.restore ? ` restore: ${row.restore}` : ""}`.trimEnd());
    } else {
      runtimeFailure = true;
      if (row && row.partial) {
        // MEDIUM 5: a partial removal (git deregistered it, contents already gone) is exactly the
        // case ruling r1 named as most needing a restore line - it used to print a bare stderr
        // error with no sha and no restore hint at all.
        ctx.print(`partial W ${rawArg} ${row.sha || ""}${row.restore ? ` restore: ${row.restore}` : ""}`.trimEnd());
      }
      process.stderr.write(`reclaim: ${rawArg}: ${row ? (row.error || row.skipped) : "worktree-remove did not run"}\n`);
    }
  }
  return runtimeFailure ? 1 : 0;
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const canon = (p) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  const self = real(fileURLToPath(import.meta.url));
  const argv1 = real(entry);
  return canon(self) === canon(argv1);
}

if (isMainModule()) {
  process.exit(main());
}
