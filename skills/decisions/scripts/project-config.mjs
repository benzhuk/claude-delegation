// The ONE loader for .agents/project.json. Every script reads project config through this, never its own parser.
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";

export const DEFAULTS = Object.freeze({
  vcs: "git", main_branch: "main", gate_command: null, decisions_url: null,
  scratch_patterns: ["scripts/_tmp-*", "tmp-*.md"], artifact_registry: ".agents/artifacts.jsonl", extra_artifact_kinds: [],
});

export function findProjectRoot(start = process.cwd()) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".agents", "project.json")) || existsSync(join(dir, ".git"))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function loadProjectConfig(start = process.cwd()) {
  const root = findProjectRoot(start);
  if (!root) return { root: null, config: { ...DEFAULTS, name: "unknown", vcs: "none" }, source: "none" };
  const file = join(root, ".agents", "project.json");
  if (!existsSync(file)) {
    return { root, config: { ...DEFAULTS, name: root.split("/").pop(), vcs: existsSync(join(root, ".git")) ? "git" : "none" }, source: "defaults" };
  }
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return { root, config: { ...DEFAULTS, ...raw }, source: file };
  } catch {
    return { root, config: { ...DEFAULTS, name: root.split("/").pop(), vcs: "none" }, source: "unreadable" };
  }
}

export function switchedOff(name) {
  const base = process.env.AGENTS_HOME || join(homedir(), ".agents");
  const present = (p) => { try { statSync(p); return true; }
                           catch (e) { return Boolean(e) && e.code !== "ENOENT" && e.code !== "ENOTDIR"; } };
  return present(join(base, "ws-off")) || (name ? present(join(base, `ws-off-${name}`)) : false);
}
