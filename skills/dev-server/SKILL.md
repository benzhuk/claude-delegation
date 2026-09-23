---
name: dev-server
description: >-
  Start, prepare, find, or stop a local dev server (Next.js/Vite/any `npm run dev`) — ALWAYS through `server-manager-agent`, never `npm run dev &`/nohup. Use whenever you are about to run a dev server, need a worktree's node_modules (fresh git/Orca worktree = clone deps, don't `npm install`), need to know what's running on which port/worktree, or need to stop a server. This makes the server visible, killable, and switchable in Ben's `accounts` app, keeps it out of your own process group (so it survives you and can't take Claude down when killed), and enforces the port bands (3000 = cadma only). Triggers: "start the dev server", "run the app", "spin up next dev", "which port is X on", "kill the server", "restart the server", "install deps in this worktree", "npm install", "node_modules missing", "sh: next: command not found".
---

# dev-server

> This copy ships with the delegation plugin (`skills/dev-server/`). The
> `~/.claude/skills/dev-server` copy retires once this plugin version is confirmed on all
> four machines — that removal is a chezmoi/dotfiles change, out of scope here.

Every dev server on Ben's machines is managed by one tool: **`~/.local/bin/server-manager-agent`**
(Python, source `~/Code/zhuk-infra/server-manager/agent/`, spec `CONTRACT.md` there — that
binary is provisioned outside this plugin, a chezmoi/dotfiles concern). The
`accounts` TUI is just a front-end for it. If *you* start a server any other way, Ben sees a
server he can't stop, and its process group is yours — a group-kill takes the Claude session down.

## The rules (all machines: Mac, Netcup, Hetzner)

1. **Never** `npm run dev &`, `nohup npm run dev`, `pnpm dev &`, or a background `next dev` from
   your shell. Never `pkill node`. Never port 3000 for anything but cadma.
2. **Start** = `server-manager-agent start <worktreeDir>` — detached, logged, band-ported,
   registered. `<worktreeDir>` is the dir holding the app's `package.json` (cadma: the
   worktree's `app/` subdir).
3. **Fresh worktree, no `node_modules`?** Do **not** `npm install` (1 GB per worktree, minutes).
   `start` auto-**prepares**: it copy-on-write-clones `node_modules` from the project's canonical
   checkout (APFS `cp -c`; ~1 MB of real disk, ~20 s) and lets the package manager reconcile the
   lockfile delta. Standalone: `server-manager-agent prepare <worktreeDir>`.
   Prepare/start also copy missing gitignored env files (`.env*`) from the canonical checkout —
   never overwriting existing ones — so don't hand-copy `.env.local` into worktrees either.
4. **Find** what's running: `server-manager-agent list` → JSON rows `{project, worktreeName,
   worktreePath, running, port, url, pid, managerOwned, depsReady, branch}`. Read the `url` from
   here — cadma is `http://127.0.0.1:3000` (WorkOS-locked), everything else is the machine's
   tailnet IP.
5. **Stop** = `server-manager-agent kill <port>` (only manager-started servers are group-killed;
   a server with a `bash`/`claude` group leader is refused — that is the safety net, don't work
   around it; report it to Ben instead). **Restart** = `restart <worktreeDir> <port>`.
   **Move a project's server to another worktree on the same port** = the same `restart` with the
   new worktree (that is what the app's `s` key does).

## Cookbook

```bash
A=~/.local/bin/server-manager-agent
$A list | python3 -c 'import json,sys; [print(r["project"], r["worktreeName"], r["port"], r["url"]) for r in json.load(sys.stdin)["rows"] if r["running"]]'
$A start  <cadmaWorktree>/app                                          # cadma: the worktree's app/ subdir; auto-prepares if needed
$A start  "$HOME/Code/BTO/bto_team"                                    # port from band (4000s)
$A start  <dir> --port 4300                                             # explicit (non-locked projects)
$A logs   4300 --lines 80                                               # the server's own log
$A kill   4300
$A restart /path/to/other-worktree 4300                                 # switch worktree, keep port
```
Every command prints ONE JSON object as its last stdout line: `{"ok":true,...}` or
`{"ok":false,"error":"<code>","message":"..."}`. Common codes: `no_deps` (prepare failed —
read `message`), `port_in_use` (+`conflictWorktree`), `single_instance` / `port_locked` (cadma),
`machine_pin` (cadma is Mac-only), `unsafe_target` (kill refused — leave it, tell Ben),
`start_failed` (`message` carries the log's last line; also `logs <port>`).

Cold Next/Turbopack can take longer than the 40 s bind poll: `{"ok":true,"status":"starting"}`
means it's still compiling — `list` again in a few seconds, don't start a second one.

## Memory cap (every managed server, since 2026-09-02)

`start`/`restart` cap the server at **8 GB by default** (`projects.json` `"memoryMaxGB"` per
project to change it). Linux boxes get a hard cgroup cap (`systemd-run --user --scope`,
MemoryMax = cap, MemoryHigh = 85% so the kernel reclaims before it kills); everywhere the
server also gets `NODE_OPTIONS --max-old-space-size` at 75% of the cap (JS heap only —
Turbopack/native memory is NOT bounded on macOS). `start` echoes `memoryMaxGB` and
`memoryEnforcement: "cgroup" | "node-heap"`. Why: a 15-day-old next-server at 12 GB helped
OOM Netcup on 2026-09-01 and systemd's default `OOMPolicy=stop` then killed every Claude
session under `orca serve`. A server that hits the cap is OOM-killed **alone** (it shows as
not running in `list`; `logs <port>` explains) — restart it, don't raise the cap by reflex.
Verify a cap: `cat /sys/fs/cgroup$(cut -d: -f3 /proc/<pid>/cgroup)/memory.max`
(`systemctl --user show` reports `infinity` for transient scopes — trust the kernel file).

**Anything ELSE long-running or memory-hungry you launch on a Linux box** (corpus runs, test
gates, batch judges) — wrap it the same way so a runaway kills itself, not the box:
`systemd-run --user --scope -q -p MemoryMax=16G -- <cmd>`. `orca-serve` itself is capped at
50 GB with `OOMPolicy=continue` on Netcup (add the same three lines on any new serve box).

## Port bands (from `~/.cache/server-manager/projects.json`)
cadma **3000 only** (locked, single-instance, Mac only) · bto-team 4000–4900 · nucleus
5000–5900 · workflows 6000–6900 · Zhuk Projects 9000–9900 · unknown 8000–8900. The agent
allocates and remembers per-worktree ports; you rarely need `--port`.

## If the agent is missing on this machine (e.g. Windows, not yet deployed)
Fall back to the closest equivalent and SAY SO in your report: `cd <dir> && setsid npm run dev
-- -p <bandPort> >> ~/.cache/server-manager/logs/<name>-<port>.log 2>&1 &` (Windows: `start /b`
with the log redirected), never on 3000 unless cadma, and tell Ben the port + log path so he can
stop it. Do NOT `npm install` a fresh worktree there either — `cp -R` from the canonical
checkout's `node_modules` (no reflink off-APFS, but still faster than a network install) then
`npm install --prefer-offline`.
