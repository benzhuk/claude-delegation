# Scout addendum: janitor74 (read-only survey at base 6b302f93; spec items 2, 3, 5 report part, 6, 7, 8)

## 1. Files and symbols
- Spec has no territory map or contracts file: the spec IS the contract. Spec cites evidence `docs/work/evidence/2026-10-01-cleanup-vs-janitor.md` and `...-detritus-census.md`: NOT in this tree, only (untracked) in the main checkout `C:/Users/benzh/Code/zhuk-infra/claude-delegation/docs/work/evidence/`. Read them there; do not copy them in.
- Premise "janitor pinned to one repo" HOLDS: `scripts/janitor.mjs` main() l.2214 calls `loadProjectConfig(cwd)` once, `gitToplevel`, then `gatherState({root})` l.1024 which reads `listWorktrees(root)` (l.301) and local/remote branches of that one root. The `--repo <repo>` the timer passes (`install-janitor-timer.mjs` scheduledCommandArgv l.186) is NOT parsed by janitor (parseFlags l.2160 has no --repo); the repo comes from the unit's WorkingDirectory.
- Premise "removed nothing": the only destructive paths are `applySafe` l.1527 (`git worktree remove` no force, `git branch -D` for SAFE only) and `closeoutWorktree` l.1753 (used by `work-record close --closeout`). File header l.2-11 states "janitor NEVER deletes a file"; SAFE needs `git status --porcelain --ignored` empty (isTreeClean l.345). Dirty = JUDGMENT, never acted.
- Existing gates to keep: `IDLE_FLOOR_HOURS = 24` l.1340 + `idleHours` l.1163 (Claude/Codex session mtimes, NaN = unknown = active), `worktreeHasOpenProcess` l.1398, `winRenameBusyProbe` l.1468, kill switches `~/.agents/ws-off`, `ws-off-janitor`, `ws-off-janitor-act` (main l.2214+).
- Item 7 drift-log premise: DONE already. `defaultRecordDir(home)` l.142 = `<home>/.agents/janitor-evidence`, bare `--record` uses it (parseFlags l.2160). Nothing to build there; keep the test.
- Item 2 "ownership": records are read with `listRecords(dir)` (work-record.mjs l.636, already imported by janitor for `gatherWorkarounds` l.990). `Worktree:` is a path, a repo-relative path OR a bare branch name (this lane's own record says `Worktree: build/janitor-cleanup-74`). Territory worktrees/branches (`wt-<slug>-<id>`, `build/<slug>-<id>`) are named by NO record and not in `<work-id>.loop-state.json` (it holds id/phase/sha only).
- Item 6: `install-janitor-timer.mjs` bakes `pluginRoot = path.resolve(HERE, "..")` into the unit (main l.570) and refuses a non-cache root unless `--force-root` (`isInstalledPluginRoot` l.504). `installed.json` (installedJsonText l.209) records repo/node/hour/scheduler/name, NOT pluginRoot or version. plugin.json is 0.20.19. Claude Code has no post-install hook in this plugin: `hooks/hooks.json` has SessionStart (multi-inbox, delegation-reminder, wiring-check) and `hooks/codex-hooks.json` is a parallel list.
- Policy page item exists: `docs/decisions/waiting/janitor-policy.md` (five recommended classes, default after 2026-10-03 12:00 NY). No file or flag yet says which class acts.

## 2. Helpers to reuse
- `scripts/janitor.mjs`: listWorktrees, isTreeClean, idleHours, pathWithin l.1732, closeoutWorktree, writeRecord l.2023, classify l.669, listUntrackedFiles l.611, `git()` l.183 (env-scrubbed via `withoutRepoLocatingGitEnv`). It is already 2389 lines: put roots/archive/untracked code in NEW modules (`scripts/janitor-*.mjs`), not in janitor.mjs.
- `scripts/reclaim.mjs` + `scripts/path-safety.mjs` (`checkRemovablePath`, `pathEscapesRoot`): the only vetted unlink path; reuse, do not write a second one.
- `skills/multi/scripts/transport.mjs` `mainCheckout(dir, runner)` l.451: linked worktree -> main repo.
- `scripts/work-record.mjs` `deriveRecordBranch`/`buildWorktreesByPath` (not exported) and `evaluateOriginBranch` (open-record protection) encode "named by an open record" for branches; the owned test should agree with them.
- Tests: `janitor.test.mjs` helpers initRepo l.68, addWorktree l.94, addOrigin l.122 (bare fixture origin), pushMain; `scripts/test-home.mjs` makeTempHome (sealed home + fixture git identity under `fixtureRoot`).

## 3. Tests that police this area
- `scripts/janitor.test.mjs` (3781 lines): pins SAFE/JUDGMENT classification, "never unlinks", exit codes 0/1/3, `--apply` needs a fetch, record shape. Adding classes must not change any existing row or exit code in a one-repo run.
- `scripts/install-janitor-timer.test.mjs` (1590): byte-stability of units, `installed.json`, scheduled argv; collect/triage jobs must stay byte-identical.
- `scripts/reclaim.test.mjs`, `scripts/path-safety.test.mjs`, `scripts/work-record-closeout.test.mjs` (closeoutWorktree consumer; do not change its behavior).
- If `hooks/hooks.json` or `hooks/codex-hooks.json` changes: skills/multi/scripts/hooks.test.mjs, scripts/wiring-check.test.mjs, scripts/native-package.test.mjs, scripts/codex-hook-trust.test.mjs, hooks/codex-unsupported.test.mjs, scripts/mirror-shared-skills.test.mjs.

## 4. Open questions for the spec
1. Which trigger re-registers the timer "on install" (no post-install hook exists): a SessionStart hook from the new release that re-runs the installer only when a timer is already registered, or a documented install step? Where is the baked pluginRoot read back from (unit text; installed.json has none)?
2. How does the policy tick take effect on a host (a file under `~/.agents`, a date)? Spec says "report mode until the tick", page default fires 10/3 12:00 NY.
3. Ownership of territory worktrees/branches that no record names: protect by branch-prefix of an open record's `Worktree:` branch, or rely on the 24 h idle floor and report mode?
4. A dirty tree with IGNORED files (node_modules, .env): `git add -A` skips them, a plain `git worktree remove` deletes them. Archive them, report them, or refuse removal?
5. Removing a deregistered folder needs a recursive unlink the janitor never does; reclaim refuses "inside a git checkout". Report-only this lane, or extend reclaim?
6. Commit identity: archive commits need a configured git identity; on a host with none, skip and report? (Never set one.)
7. Exact exclusion for "never BTO, never dotfiles" in the `~/Code` scan (path prefix `Code/BTO`? repo name?).
