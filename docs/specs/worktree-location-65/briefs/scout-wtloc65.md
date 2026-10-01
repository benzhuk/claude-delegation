# Scout addendum: wtloc65 (one territory = the whole lane; surveyed read-only at base 0a33fd52)

## 1. Files and symbols
- Spec has no territory map or contracts.md: the single territory owns every path the six scope items touch.
- Item 1 premise DRIFTED: `hooks/agent-dispatch-guard.mjs` (708 lines) is wired only to `Agent|SendMessage` (`hooks/hooks.json:93`). It never sees `git worktree add`; that is a Bash/PowerShell call, wired only to `hooks/delete-guard.mjs`. Rules today: R0-stale (hardDeny, decide() ~l.532), R1, R1b, R2, R3; no rule mentions worktrees. `Agent` input has `isolation` but no path field (no `isolation` literal exists in hooks/agents/skills; build-loop-workflow.js even bans the token).
- Item 2: `scripts/janitor.mjs` SAFE rules (classify ~l.689-756) have NO location filter. Merged+clean+aged worktrees are already SAFE anywhere. Premise holds trivially; nothing pins it for a nested `.claude/worktrees/` path.
- Item 3: `scripts/run-tests.mjs:26` `EXCLUDED_DIRS = {node_modules,.claude,.git}` already skips `.claude` at every depth (premise holds). `mirror-shared-skills.mjs` and `collect-*` walk no repo tree (fixed source dirs only). `.gitignore` is 2 lines (`.schema-answer.tmp.md`, `.DS_Store`): lacks `.claude/worktrees/`. `.claude/settings.json` IS tracked (`git ls-files .claude`), so ignore `.claude/worktrees/`, never `.claude/`.
- Item 4: team-build/SKILL.md (483 lines) mentions worktrees (l.34,44,241,353-373) but never the path; delegate/SKILL.md has no worktree text; agents/builder.md and runner.md have none outside the safety block (l.27 is about not deleting); docs/pane-setup.md l.67 `orca terminal create --worktree <wt>`.
- Item 5 premise holds: `scripts/install-janitor-timer.mjs:156` returns `~/Code/claude-delegation`. Same literal in the doc comment l.145 and help text l.524; `skills/janitor/SKILL.md:189`. Other live-code hits: none (decisions-pickup.mjs:637 and mirror-shared-skills.mjs:624 are comments; `required-wiring.default.json:138` and `collect-status.mjs defaultOutDir` key on the repo BASENAME `claude-delegation`, which survives the move).
- Item 7: `janitor.mjs:133 DEFAULT_RECORD_DIR = "docs/work/evidence/janitor/"`, resolved against the repo root in `writeRecord` (~l.2013-2083) which writes `<date>-<host>[-hhmmss].json` (wx create-only) AND appends `drift.md`. The timer runs bare `--record --apply` (install-janitor-timer.mjs:189), so every durable checkout gets a tracked-file edit plus an untracked json daily. Tracked today: `drift.md` plus 9 evidence files in that dir.
## 2. Helpers to reuse
- delete-guard.mjs: `GIT_PREFIX` regex (l.232), `detectGitWorktree*` (l.444-465), `switchPresentFailSafe`, `appendLog`, flush-safe `writeJsonFlushed`; mirror its fail-open `runCli`.
- agent-dispatch-guard.mjs: `decide(input, ctx)` pure core with `{home, fsImpl}`, `hardDeny` return flag, `~/.agents/no-dispatch-guard` kill switch.
- `mainCheckout(dir, runner)` (skills/multi/scripts/transport.mjs:451; used by collect-status.mjs:306) resolve a linked worktree to its main repo; use for "<repo>" instead of a new resolver. `samePath` (janitor.mjs:944, not exported) for path compare.
- install-janitor-timer.test.mjs `mkTmp` fixture homes; janitor.test.mjs `initRepo`/`writeProjectConfig`/`main(argv,{cwd})`.
## 3. Tests that police this area
- hooks/agent-dispatch-guard.test.mjs (1403 lines): pins every rule text and the R0 hardDeny/no-enforce semantics; new rule must not disturb evaluation order or the log entry shape.
- Tests that read hooks.json: skills/multi/scripts/hooks.test.mjs, scripts/wiring-check.test.mjs, native-package.test.mjs, codex-hook-trust.test.mjs, codex-unsupported.test.mjs, mirror-shared-skills.test.mjs: widening a matcher or adding a hook can trip them.
- agents/agents.test.mjs: safety block byte-identical across 4 agent files and under 2100 chars; edit OUTSIDE the safety-block markers only. Role files also share a pinned scratch sentence (l.158).
- janitor.test.mjs:1882 pins "bare --record defaults to docs/work/evidence/janitor/ under the project root" and l.3152/3189 read `drift.md` from the record dir: these must be rewritten for item 7.
- install-janitor-timer.test.mjs:141 pins `resolveRepo` default; l.71/280/993 build `home/Code/claude-delegation` fixtures.
- run-tests.test.mjs, skills/team-build/references/build-loop-workflow.test.mjs (worktreeRoot = parent of integrationWorktree; do not change).
## 4. Open questions for the spec
1. Item 1: which hook carries the Bash/PowerShell `git worktree add` check (widen agent-dispatch-guard's matcher, or put it in delete-guard.mjs, which Codex also wires)? Hard deny (ignores enforce file, like R0-stale) or enforce-gated?
2. Item 1: what exactly is checked for an Agent isolation worktree, given the Agent input has no path field? (Mandate text `Worktree:` line? `cwd`?)
3. Item 2: is a test pinning existing behavior all that is wanted, or should an outside-folder worktree be demoted to JUDGMENT?
4. Item 3: "sync" has no named script; bare `node --test` (no args) recurses into `.claude/worktrees/` copies of the suite: is a guard expected?
5. Item 7: where under `~/.agents/` (path), and does the tracked `drift.md` get `git rm`ed or stay frozen? `skills/janitor/SKILL.md:198` says Ben's page links it. `--record <dir>` with an explicit dir keeps writing there?
