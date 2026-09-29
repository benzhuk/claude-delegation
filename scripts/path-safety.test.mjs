// node --test scripts/path-safety.test.mjs
//
// C1 (spec.md, amended by F3, F6, F7, F8). checkRemovablePath is factored, byte-identical in
// behavior, from work-record.mjs's former removeScratchDirectory - work-record-closeout.test.mjs
// pins the refactor's fidelity end to end (its own scratch tests still pass unchanged). This file
// tests checkRemovablePath itself, directly, against its own fixtures under its own mkdtemp.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { checkRemovablePath } from "./path-safety.mjs";

const tracked = [];
function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}
after(() => {
  for (const dir of tracked) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

test("checkRemovablePath: a target strictly under a listed root passes, returning its realpath", () => {
  const root = mkTmp("path-safety-root-");
  const target = path.join(root, "scratch", "lane-1");
  fs.mkdirSync(target, { recursive: true });
  const result = checkRemovablePath(target, { roots: [root] });
  assert.equal(result.ok, true);
  assert.equal(result.real, fs.realpathSync(target));
});

test("checkRemovablePath: the root itself is refused (a target must be STRICTLY under a root, never equal to it)", () => {
  const root = mkTmp("path-safety-root-");
  const result = checkRemovablePath(root, { roots: [root] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "does not resolve under an allowed root");
});

test("checkRemovablePath: underRootReason is a caller-supplied override (work-record.mjs keeps its own legacy wording)", () => {
  const root = mkTmp("path-safety-root-");
  const outside = mkTmp("path-safety-outside-");
  const target = path.join(outside, "x");
  const result = checkRemovablePath(target, { roots: [root], underRootReason: "custom root reason" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "custom root reason");
});

test("checkRemovablePath: a root's predicate gates membership on the relative segments (work-record's --by-as-a-whole-segment rule)", () => {
  const root = mkTmp("path-safety-root-");
  const okTarget = path.join(root, "ok-segment", "lane-1");
  const badTarget = path.join(root, "nope-segment", "lane-1");
  fs.mkdirSync(okTarget, { recursive: true });
  fs.mkdirSync(badTarget, { recursive: true });
  const predicate = (segments) => segments.includes("ok-segment") && segments.indexOf("ok-segment") < segments.length - 1;
  assert.equal(checkRemovablePath(okTarget, { roots: [{ path: root, predicate }] }).ok, true);
  const refused = checkRemovablePath(badTarget, { roots: [{ path: root, predicate }] });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "does not resolve under an allowed root");
});

test("checkRemovablePath: a relative target is refused as not absolute on this host (POSIX)", () => {
  const result = checkRemovablePath("relative/path", { roots: ["/tmp"] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "not absolute on this host");
});

test("checkRemovablePath: notAbsoluteReason is a caller-supplied override", () => {
  const result = checkRemovablePath("relative/path", { roots: ["/tmp"], notAbsoluteReason: "custom absolute reason" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "custom absolute reason");
});

// F9 twin (work-record's own R2-10): on a win32 host a POSIX-shaped value is refused outright as
// not-absolute, never resolved against this host's cwd. The reverse - a genuinely win32-shaped
// value (drive letter or UNC) - clears the absolute gate; this host's real `path` module cannot
// resolve backslash paths correctly on POSIX (the same limitation work-record.mjs's own code and
// tests inherit), so this only pins that the absolute *gate* itself is passed, not a full resolve.
test("checkRemovablePath: platform win32 refuses a POSIX-shaped path as not absolute", () => {
  const result = checkRemovablePath("/tmp/x", { roots: ["/tmp"], platform: "win32" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "not absolute on this host");
});

test("checkRemovablePath: platform win32 accepts a drive-letter or UNC form past the absolute gate", () => {
  const drive = checkRemovablePath("C:\\Users\\me\\x", { roots: [], platform: "win32", underRootReason: "past-absolute-gate" });
  assert.equal(drive.ok, false);
  assert.equal(drive.reason, "past-absolute-gate", "must fail on root membership, not on the absolute gate");

  const unc = checkRemovablePath("\\\\server\\share\\x", { roots: [], platform: "win32", underRootReason: "past-absolute-gate" });
  assert.equal(unc.ok, false);
  assert.equal(unc.reason, "past-absolute-gate", "must fail on root membership, not on the absolute gate");
});

test("checkRemovablePath: refuses a target that is a symlink, without following it", () => {
  const root = mkTmp("path-safety-root-");
  const realTarget = path.join(root, "real-target");
  fs.mkdirSync(realTarget);
  const linkPath = path.join(root, "link-target");
  try {
    fs.symlinkSync(realTarget, linkPath, "dir");
  } catch {
    return; // sandbox refuses symlink creation - skip rather than false-fail
  }
  const result = checkRemovablePath(linkPath, { roots: [root] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "target is a symlink or junction");
  assert.equal(fs.existsSync(realTarget), true);
});

test("checkRemovablePath: refuses a target whose ANCESTOR is a symlink, changing its real path", () => {
  const outerRoot = mkTmp("path-safety-root-");
  const realBase = mkTmp("path-safety-realbase-");
  const realLane = path.join(realBase, "lane-1");
  fs.mkdirSync(realLane, { recursive: true });
  const sessionLink = path.join(outerRoot, "session-link");
  try {
    fs.symlinkSync(realBase, sessionLink, "dir");
  } catch {
    return;
  }
  const target = path.join(sessionLink, "lane-1");
  const result = checkRemovablePath(target, { roots: [outerRoot] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "a symlinked ancestor changes the real path");
  assert.equal(fs.existsSync(realLane), true);
});

test("checkRemovablePath: refuses HOME exactly", () => {
  const home = mkTmp("path-safety-home-");
  const root = path.dirname(home);
  const result = checkRemovablePath(home, { roots: [root], home });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "is the home directory");
});

test("checkRemovablePath: refuses a target that is not a directory by default; allowFile:true admits a regular file", () => {
  const root = mkTmp("path-safety-root-");
  const filePath = path.join(root, "scratch.txt");
  fs.writeFileSync(filePath, "x\n");
  const refused = checkRemovablePath(filePath, { roots: [root] });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "target is not a directory");

  const allowed = checkRemovablePath(filePath, { roots: [root], allowFile: true });
  assert.equal(allowed.ok, true);
});

test("checkRemovablePath: allowFile:true still refuses a symlink, even one pointing at a regular file", () => {
  const root = mkTmp("path-safety-root-");
  const realFile = path.join(root, "real.txt");
  fs.writeFileSync(realFile, "x\n");
  const linkPath = path.join(root, "link.txt");
  try {
    fs.symlinkSync(realFile, linkPath);
  } catch {
    return;
  }
  const result = checkRemovablePath(linkPath, { roots: [root], allowFile: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "target is a symlink or junction");
});

test("checkRemovablePath: repoRoots - equal/contains/lies-inside are each refused with the caller's own kind text, checked in repoRoots order", () => {
  const root = mkTmp("path-safety-root-");
  const scratch = path.join(root, "scratch");
  const repoA = path.join(scratch, "repoA");
  const otherDir = path.join(scratch, "other");
  const wtB = path.join(otherDir, "wtB");
  fs.mkdirSync(path.join(repoA, "inner"), { recursive: true });
  fs.mkdirSync(path.join(wtB, "inner"), { recursive: true });

  const repoRoots = [
    { path: repoA, kind: "the repo root" },
    { path: wtB, kind: "a path in git worktree list" },
  ];
  const opts = { roots: [root], repoRoots };

  // equal
  assert.equal(checkRemovablePath(repoA, opts).reason, "is the repo root");
  assert.equal(checkRemovablePath(wtB, opts).reason, "is a path in git worktree list");

  // contains (target is an ancestor of the protected path)
  assert.equal(checkRemovablePath(scratch, opts).reason, "contains the repo root");
  assert.equal(checkRemovablePath(otherDir, opts).reason, "contains a path in git worktree list");

  // lies inside (target is a descendant of the protected path)
  assert.equal(checkRemovablePath(path.join(repoA, "inner"), opts).reason, "lies inside the repo root");
  assert.equal(checkRemovablePath(path.join(wtB, "inner"), opts).reason, "lies inside a path in git worktree list");
});

test("checkRemovablePath: repoRoots does not refuse a target that is a sibling of a protected path", () => {
  const root = mkTmp("path-safety-root-");
  const scratch = path.join(root, "scratch");
  const repoA = path.join(scratch, "repoA");
  const sibling = path.join(scratch, "sibling-lane");
  fs.mkdirSync(repoA, { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });
  const result = checkRemovablePath(sibling, { roots: [root], repoRoots: [{ path: repoA, kind: "the repo root" }] });
  assert.equal(result.ok, true);
});

test("checkRemovablePath: an absent target (ENOENT) is reported absent, not refused", () => {
  const root = mkTmp("path-safety-root-");
  const missing = path.join(root, "does-not-exist");
  const result = checkRemovablePath(missing, { roots: [root] });
  assert.equal(result.ok, false);
  assert.equal(result.absent, true);
  assert.equal(result.reason, undefined);
});

test("checkRemovablePath: a non-ENOENT lstat error is refused (could not stat), not reported absent", () => {
  const root = mkTmp("path-safety-root-");
  const target = path.join(root, "x");
  const fsImpl = {
    lstatSync() {
      const err = new Error("boom");
      err.code = "EACCES";
      throw err;
    },
  };
  const result = checkRemovablePath(target, { roots: [root], fsImpl });
  assert.equal(result.ok, false);
  assert.equal(result.absent, undefined);
  assert.match(result.reason, /could not stat: boom/);
});

test("checkRemovablePath: a realpath failure AFTER a successful lstat (a TOCTOU race) is reported absent", () => {
  const root = mkTmp("path-safety-root-");
  const target = path.join(root, "raced");
  fs.mkdirSync(target);
  const fsImpl = {
    lstatSync: (p) => fs.lstatSync(p),
    realpathSync() {
      throw new Error("gone between lstat and realpath");
    },
  };
  const result = checkRemovablePath(target, { roots: [root], fsImpl });
  assert.equal(result.ok, false);
  assert.equal(result.absent, true);
});

test("checkRemovablePath: allowFile:true refuses something that is neither a file nor a directory", () => {
  const root = mkTmp("path-safety-root-");
  const target = path.join(root, "neither");
  const fsImpl = {
    lstatSync: () => ({ isSymbolicLink: () => false, isDirectory: () => false, isFile: () => false }),
  };
  const result = checkRemovablePath(target, { roots: [root], allowFile: true, fsImpl });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "target is not a file or directory");
});

test("checkRemovablePath: string roots and { path, predicate } roots can be mixed in one call", () => {
  const rootA = mkTmp("path-safety-root-a-");
  const rootB = mkTmp("path-safety-root-b-");
  const targetA = path.join(rootA, "x");
  const targetB = path.join(rootB, "x");
  fs.mkdirSync(targetA);
  fs.mkdirSync(targetB);
  const roots = [rootA, { path: rootB, predicate: (segments) => segments[0] === "x" }];
  assert.equal(checkRemovablePath(targetA, { roots }).ok, true);
  assert.equal(checkRemovablePath(targetB, { roots }).ok, true);
});
