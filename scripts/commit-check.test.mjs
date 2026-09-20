// node --test scripts/commit-check.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { main, stagedPaths, findScratchMatches } from "./commit-check.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function initRepo() {
  const dir = mkTmp("commit-check-repo-");
  git(["init", "-q", "-b", "main"], dir);
  fs.writeFileSync(path.join(dir, "README.md"), "root\n");
  git(["add", "."], dir);
  git(["commit", "-q", "-m", "init"], dir);
  return dir;
}

function writeProjectConfig(root, overrides = {}) {
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".agents", "project.json"),
    JSON.stringify({ name: "commit-check-test", vcs: "git", scratch_patterns: ["scripts/_tmp-*", "tmp-*.md"], ...overrides }),
  );
}

test("findScratchMatches: filters a path list by the project's scratch_patterns", () => {
  const matches = findScratchMatches(
    ["scripts/_tmp-foo.mjs", "scripts/real.mjs", "tmp-notes.md", "docs/plan.md"],
    ["scripts/_tmp-*", "tmp-*.md"],
  );
  assert.deepEqual(matches.sort(), ["scripts/_tmp-foo.mjs", "tmp-notes.md"]);
});

test("main: exits 1 and refuses when a staged path matches a scratch pattern", () => {
  const root = initRepo();
  writeProjectConfig(root);
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts", "_tmp-scratch.mjs"), "x\n");
  git(["add", "scripts/_tmp-scratch.mjs"], root);

  const code = main([], { cwd: root });
  assert.equal(code, 1);
});

test("main: exits 0 when nothing staged matches a scratch pattern", () => {
  const root = initRepo();
  writeProjectConfig(root);
  fs.writeFileSync(path.join(root, "real-file.mjs"), "x\n");
  git(["add", "real-file.mjs"], root);

  const code = main([], { cwd: root });
  assert.equal(code, 0);
});

test("main: reads staged paths from git when no CLI args are given, and prefers explicit args when given", () => {
  const root = initRepo();
  writeProjectConfig(root);
  fs.writeFileSync(path.join(root, "real-file.mjs"), "x\n");
  git(["add", "real-file.mjs"], root);

  // staged path is clean, but an explicit arg names a scratch path -> still refused
  const code = main(["tmp-explicit.md"], { cwd: root });
  assert.equal(code, 1);
});

test("stagedPaths: reads real `git diff --cached --name-only` output", () => {
  const root = initRepo();
  fs.writeFileSync(path.join(root, "a.txt"), "1\n");
  fs.writeFileSync(path.join(root, "b.txt"), "2\n");
  git(["add", "a.txt", "b.txt"], root);
  assert.deepEqual(stagedPaths(root).sort(), ["a.txt", "b.txt"]);
});

test("switch file ~/.agents/ws-off-commit-check makes a would-fail commit a silent exit 0", () => {
  const root = initRepo();
  writeProjectConfig(root);
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts", "_tmp-scratch.mjs"), "x\n");
  git(["add", "scripts/_tmp-scratch.mjs"], root);

  const home = mkTmp("commit-check-home-");
  fs.mkdirSync(path.join(home, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(home, ".agents", "ws-off-commit-check"), "");
  const prevHome = process.env.HOME;
  process.env.HOME = home;
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    process.env.HOME = prevHome;
  }
  assert.equal(code, 0);
});

test("vcs: none exits 0 regardless of scratch content", () => {
  const root = initRepo();
  writeProjectConfig(root, { vcs: "none" });
  const code = main(["tmp-anything.md"], { cwd: root });
  assert.equal(code, 0);
});

test("main never returns exit code 2", () => {
  const root = initRepo();
  writeProjectConfig(root);
  assert.notEqual(main([], { cwd: root }), 2);
  assert.notEqual(main(["tmp-x.md"], { cwd: root }), 2);
  assert.notEqual(main([], { cwd: "/path/does/not/exist" }), 2);
});
