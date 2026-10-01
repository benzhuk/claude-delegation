// The ONE loader for .agents/project.json. Every script reads project config through this, never its own parser.
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";

export const DEFAULTS = Object.freeze({
  vcs: "git", main_branch: "main", gate_command: null, decisions_url: null,
  scratch_patterns: ["scripts/_tmp-*", "tmp-*.md"], artifact_registry: ".agents/artifacts.jsonl", extra_artifact_kinds: [],
  // Lane 43 (cross-host nudge): Owner-slug -> mirror-host-name table (the host names note-send's own
  // MIRROR_HOSTS uses), the ONE place a collector may read that mapping - never a hardcoded map in a
  // collector itself. An owner absent from this table is unmapped, on purpose (today's behaviour).
  owner_hosts: {},
});

// A malformed `owner_hosts` value - not a plain object, or holding any key/value pair that is not a
// non-empty string - is IGNORED wholesale, falling back to `{}` (DEFAULTS' own value), never refused/
// thrown. This loader's whole contract is "a broken .agents/project.json degrades every reader to
// safe defaults, never a crash"; `owner_hosts` follows that same rule rather than carving out its own
// throw path that every caller would then have to guard against separately.
// F6 (review r1): exported so `collect-status.mjs` can run the SAME sanitizer against
// `origin/main:.agents/project.json` (read through its own git runner) as this loader runs
// against the working tree - one sanitizing rule, never a second copy of it.
export function sanitizeOwnerHosts(raw) {
  if (raw === undefined) return { ...DEFAULTS.owner_hosts };
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== "string" || typeof v !== "string" || !k || !v) return {};
  }
  return { ...raw };
}

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
    return { root, config: { ...DEFAULTS, ...raw, owner_hosts: sanitizeOwnerHosts(raw?.owner_hosts) }, source: file };
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
