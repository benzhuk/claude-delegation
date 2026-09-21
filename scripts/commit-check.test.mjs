// node --test scripts/commit-check.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { main, stagedPaths, findScratchMatches, splitArgv } from "./commit-check.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

const tracked = [];
function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
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
  const prevAgentsHome = process.env.AGENTS_HOME;
  process.env.HOME = home;
  // switchedOff() reads AGENTS_HOME first and falls back to os.homedir(), which reads USERPROFILE
  // (not HOME) on win32 — set both so this sandbox actually takes effect on every platform.
  process.env.AGENTS_HOME = path.join(home, ".agents");
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    process.env.HOME = prevHome;
    if (prevAgentsHome === undefined) delete process.env.AGENTS_HOME;
    else process.env.AGENTS_HOME = prevAgentsHome;
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

// --- round 2: MAJOR 8, MAJOR 10, MINOR 18 ---

test("MAJOR 8: a malformed .agents/project.json exits 3, not 0, and says so on stderr", () => {
  const root = initRepo();
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(root, ".agents", "project.json"), "{ not json");
  const errs = [];
  const origErr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => {
    errs.push(s);
    return true;
  };
  let code;
  try {
    code = main([], { cwd: root });
  } finally {
    process.stderr.write = origErr;
  }
  assert.equal(code, 3);
  assert.match(errs.join(""), /project\.json/);
});

test("MAJOR 10: staged paths with a space and with a non-ASCII character are both caught, not silently missed via C-quoting", () => {
  const root = initRepo();
  writeProjectConfig(root, { scratch_patterns: ["tmp-*.md"] });
  fs.writeFileSync(path.join(root, "tmp-my notes.md"), "x\n");
  fs.writeFileSync(path.join(root, "tmp-café.md"), "x\n");
  git(["add", "-A"], root);

  const paths = stagedPaths(root);
  assert.ok(paths.includes("tmp-my notes.md"), `expected the spaced name unquoted in ${JSON.stringify(paths)}`);
  assert.ok(paths.includes("tmp-café.md"), `expected the accented name unquoted in ${JSON.stringify(paths)}`);

  const code = main([], { cwd: root });
  assert.equal(code, 1);
});

test("MINOR 18: splitArgv stops flag parsing at a literal '--', so a path argument starting with '-' still works", () => {
  assert.deepEqual(splitArgv(["--json", "a.txt", "b.txt"]), { flags: ["--json"], paths: ["a.txt", "b.txt"] });
  assert.deepEqual(splitArgv(["--json", "--", "-weird.md", "b.txt"]), { flags: ["--json"], paths: ["-weird.md", "b.txt"] });
  assert.deepEqual(splitArgv([]), { flags: [], paths: [] });
});

after(() => {
  for (const dir of tracked) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only
    }
  }
});
