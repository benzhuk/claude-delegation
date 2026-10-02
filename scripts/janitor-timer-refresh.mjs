#!/usr/bin/env node
// janitor-timer-refresh - lane 74 item 6. A stale timer must not keep running old code.
//
// Run from a SessionStart hook of the NEW release. When a janitor-record timer is ALREADY registered
// on this host (`~/.agents/janitor/installed.json` exists and its unit file is there) and the plugin
// root baked into that unit differs from THIS release's root (or cannot be read from it), it re-runs
// the installer from this release with the registered repo, hour, name and host. It never installs a
// timer that was never installed. No network; the only exec is the installer's own scheduler command,
// bounded by ONE 4.5 s deadline (2 s per exec). Fail open: any error ends in exit 0 and (at most) one line. Silent when nothing was
// needed. The installer itself still refuses a root that is not an installed plugin location, so a
// session started from a worktree cannot re-point a live timer at that worktree.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { main as installerMain } from "./install-janitor-timer.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXEC_TIMEOUT_MS = 2000;
const TOTAL_BUDGET_MS = 4500; // under the hook's 5 s bound, however many scheduler commands the installer issues

/** An exec that shares ONE deadline: each call gets min(per-exec bound, time left); none once the budget is gone. */
export function makeBoundedExec({ execFile = execFileSync, now = Date.now, budgetMs = TOTAL_BUDGET_MS, perExecMs = EXEC_TIMEOUT_MS } = {}) {
  const deadline = now() + budgetMs;
  return (cmd, args, o) => {
    const left = deadline - now();
    if (left <= 0) throw new Error("refresh time budget exhausted before running " + cmd);
    return execFile(cmd, args, { ...o, timeout: Math.min(perExecMs, left) });
  };
}

const refreshFile = (home) => path.join(home, ".agents", "janitor", "refresh.json");

/** True only when a refresh from `root` was recorded as accepted by the scheduler (the unit file alone proves nothing). */
function refreshRecorded(home, root) {
  try {
    const rec = JSON.parse(fs.readFileSync(refreshFile(home), "utf8"));
    return rec?.ok === true && typeof rec.root === "string" && sameRoot(rec.root, root);
  } catch {
    return false;
  }
}

const fold = (p) => (process.platform === "win32" || process.platform === "darwin" ? p.toLowerCase() : p);
const sameRoot = (a, b) => fold(path.resolve(a).replace(/[\\/]+$/, "")) === fold(path.resolve(b).replace(/[\\/]+$/, ""));

function readText(file) {
  const buf = fs.readFileSync(file);
  return file.endsWith(".xml") && buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe ? buf.toString("utf16le") : buf.toString("utf8");
}

function unescapeXml(s) {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** The plugin root a registered unit's text bakes in (the directory above `scripts/janitor.mjs`), or null. */
export function bakedRootFromUnit(text) {
  let t = unescapeXml(text);
  // systemd's ExecStart= quoting doubles every backslash inside a quoted word (a Windows-shaped root in a test).
  if (/^ExecStart=/m.test(t)) t = t.replaceAll("\\\\", "\\");
  const patterns = [
    /"([^"]*?)[\\/]scripts[\\/]janitor\.mjs"/,
    /'([^']*?)[\\/]scripts[\\/]janitor\.mjs'/,
    /(?:^|[\s=])(\S+?)[\\/]scripts[\\/]janitor\.mjs(?=\s|$)/m,
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m) return m[1];
  }
  return null;
}

function unitFileFor({ home, scheduler, name, env }) {
  if (scheduler === "systemd-user") return path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "systemd", "user", `${name}.service`);
  if (scheduler === "schtasks") return path.join(home, ".agents", "janitor", `${name}.task.xml`);
  if (scheduler === "launchd") return path.join(home, "Library", "LaunchAgents", `com.delegation.${name}.plist`);
  return null;
}

/**
 * @returns {{ action: "none"|"current"|"refreshed"|"refused"|"failed", reason?: string, code?: number }}
 */
export function refreshIfRegistered({
  home = os.homedir(),
  pluginRoot = path.resolve(HERE, ".."),
  env = process.env,
  platform = process.platform,
  install = installerMain,
  exec,
  forceRoot = false,
} = {}) {
  let installed;
  try {
    installed = JSON.parse(fs.readFileSync(path.join(home, ".agents", "janitor", "installed.json"), "utf8"));
  } catch {
    return { action: "none", reason: "no janitor timer registered on this host" };
  }
  if (!installed || typeof installed !== "object" || installed.job) return { action: "none", reason: "installed.json is not the janitor-record job" };
  const name = typeof installed.name === "string" && installed.name ? installed.name : "janitor-record";
  const unit = unitFileFor({ home, scheduler: installed.scheduler, name, env });
  if (!unit) return { action: "none", reason: "unknown scheduler in installed.json" };
  let text;
  try {
    text = readText(unit);
  } catch {
    return { action: "none", reason: "registered unit file not found; never installing a timer that was not installed" };
  }
  const baked = bakedRootFromUnit(text);
  // The unit text is written before the scheduler accepts it, so "baked equals this root" is current only with a recorded success.
  if (baked && sameRoot(baked, pluginRoot) && refreshRecorded(home, pluginRoot)) return { action: "current", reason: "timer already runs this release" };

  const argv = ["--repo", String(installed.repo), "--hour", String(installed.hour), "--enable"];
  if (name !== "janitor-record") argv.push("--name", name);
  const host = /--host\s+"?([^"\s<]+)"?/.exec(unescapeXml(text));
  if (host) argv.push("--host", host[1]);
  if (forceRoot) argv.push("--force-root");
  const lines = [];
  const boundedExec = exec || makeBoundedExec();
  const code = install(argv, { home, platform, pluginRoot, env, exec: boundedExec, stdout: (s) => lines.push(s) });
  if (code === 0) {
    try {
      fs.writeFileSync(refreshFile(home), `${JSON.stringify({ root: path.resolve(pluginRoot), ok: true })}\n`);
    } catch {
      /* unwritable: the next session simply retries */
    }
    return { action: "refreshed", reason: `re-registered from ${pluginRoot} (was ${baked || "unreadable"})`, code };
  }
  return { action: code === 1 ? "refused" : "failed", reason: (lines.join("").trim().split("\n")[0] || `installer exit ${code}`).replace(/^refused:\s*/, ""), code };
}

function isMainModule() {
  try {
    return path.resolve(process.argv[1] || "") === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const r = refreshIfRegistered();
    if (r.action === "refreshed" || r.action === "refused" || r.action === "failed") {
      process.stdout.write(`janitor timer: ${r.action}: ${r.reason}\n`);
    }
  } catch {
    /* fail open */
  }
  process.exit(0);
}
