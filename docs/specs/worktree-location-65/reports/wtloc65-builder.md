VERDICT: PASS

# wtloc65 builder report (lane 65, worktree location rule), scope items 1 to 7

Worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-worktree-location-65-wtloc65
Branch: build/worktree-location-65-wtloc65, base 0a33fd52. Final HEAD: b7fcaaee9fa287fbaed79f229912997f08b8b500 (from `git rev-parse HEAD`).
GOAL line served: "work lost or stalled" (worktrees scattered outside the repo, a scheduled job leaving a durable checkout dirty). Nearest NOT: "a rule no script checks": every rule here has a script and a test.

## Gate
Command (exactly as briefed, hooks.json changed so the six extra files appended):
`node --test hooks/agent-dispatch-guard.test.mjs hooks/delete-guard.test.mjs scripts/janitor.test.mjs scripts/install-janitor-timer.test.mjs scripts/run-tests.test.mjs agents/agents.test.mjs hooks/worktree-location.test.mjs skills/multi/scripts/hooks.test.mjs scripts/wiring-check.test.mjs scripts/native-package.test.mjs scripts/codex-hook-trust.test.mjs hooks/codex-unsupported.test.mjs scripts/mirror-shared-skills.test.mjs > .../reports/wtloc65-gate.log 2>&1` (exit 0).
Log tail (reports/wtloc65-gate.log):
```
ℹ tests 807
ℹ suites 0
ℹ pass 790
ℹ fail 0
ℹ cancelled 0
ℹ skipped 16
ℹ todo 1
ℹ duration_ms 252473.1529
```
The three `✖` lines in the log (`probe`) are the deliberately failing probe file that scripts/run-tests.test.mjs spawns; fail count is 0. No full suite was run (Windows; the lead runs Linux).

## Files changed
New: hooks/worktree-location.mjs, hooks/worktree-location.test.mjs.
Edited: hooks/agent-dispatch-guard.mjs, hooks/agent-dispatch-guard.test.mjs (R0 CLI test's copy list gains worktree-location.mjs), hooks/hooks.json, skills/multi/scripts/hooks.test.mjs, scripts/install-janitor-timer.mjs, scripts/install-janitor-timer.test.mjs, scripts/janitor.mjs, scripts/janitor.test.mjs, scripts/run-tests.test.mjs, .gitignore, agents/builder.md, agents/runner.md, agents/agents.test.mjs, skills/team-build/SKILL.md, skills/delegate/SKILL.md, skills/janitor/SKILL.md, docs/pane-setup.md.
Untouched as briefed: safety blocks, chezmoi templates, build-loop-workflow.js, records, decisions, README, delete-guard, R0-stale/R1/R1b/R2/R3 text and behavior.

## Item 1: dispatch guard refuses a worktree outside <repo>/.claude/worktrees/
- Existing code facts: guard wired only to `Agent|SendMessage` (hooks/hooks.json:93 at base); `git worktree add` is a Bash/PowerShell call (delete-guard group, hooks/hooks.json Bash|PowerShell matcher).
- Built: rule R4 in hooks/agent-dispatch-guard.mjs (call at :553, right after R0-stale, `hardDeny: true`, ignores the enforce file, kill switch `~/.agents/no-dispatch-guard` checked first at the top of decide()). Logic in hooks/worktree-location.mjs (`checkBashWorktreeAdd`, `checkAgentWorktree`, `r4Text`).
  - Bash/PowerShell: finds `git worktree add` (up to 6 global options; `-C <dir>` honored, relative path resolved against input.cwd then -C), takes the first non-flag operand (skips `-b/-B/--reason` values), resolves `<repo>` via `git rev-parse --path-format=absolute --git-common-dir` (the MAIN checkout, never the linked worktree), refuses unless the target is strictly inside `<repo>/.claude/worktrees/` (realpath'd, case-folded on win32/darwin). Text: names `<repo>/.claude/worktrees/<name>` and the corrected full path.
  - Agent: a line-start `Worktree: <path>` in the mandate (markdown decoration allowed) whose value is path-like must contain `/.claude/worktrees/<name>`; `Worktree: none`, `<path>`, a branch name, mid-sentence mentions and `isolation: worktree` with no path are allowed.
  - Fail open: any exception, non-git dir, bare repo or submodule layout, `$VAR`/`$(..)`/glob/`%VAR%`, `--git-dir`/`--work-tree`, no operand: allow. Prose (echo, grep, git commit -m, gh, heredoc and PowerShell here-string bodies, quoted text a non-executor never runs) is not judged; `bash -c "git worktree add ../x"` IS judged.
  - Log shape unchanged; Bash/PowerShell calls are logged ONLY when R4 fires (no log flood from the widened matcher).
  - hooks/hooks.json:93 matcher is now `Agent|SendMessage|Bash|PowerShell` (the narrowest widening that reaches `git worktree add`); skills/multi/scripts/hooks.test.mjs:91 pins the new value.
- Tests (hooks/worktree-location.test.mjs, 11, all pass): sibling deny with exact text and hardDeny; PowerShell and `git -C`; allow under the folder; linked-worktree cwd judged against the main checkout; fail-open set; prose set; kill switch; Agent deny set; Agent allow set incl. `isolation: worktree`; CLI deny printed with no enforce file and logged `hard_deny`, ordinary Bash silent and unlogged; hooks.json matcher.
- Live verification (scratch HOME + temp `git init` repo, real hook process; REPO = .../scratchpad/live/Code/repo, shortened here):
  - IN: `{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"live-1","cwd":"<REPO>","tool_input":{"command":"git worktree add ../wt-live -b build/live"}}`
  - OUT: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"dispatch-guard R4: a worktree outside <repo>/.claude/worktrees/ is refused. Every worktree lives at `<repo>/.claude/worktrees/<name>`, never as a sibling in Code or anywhere else. Use <REPO>/.claude/worktrees/wt-live. Off switch: ~/.agents/no-dispatch-guard"}}`, exit 0.
  - IN with `git worktree add .claude/worktrees/wt-live -b build/live`: no output, exit 0 (allow).
  - IN Agent with prompt `Task: x\nWorktree: C:/Users/benzh/Code/wt-lane\nReport: r.md`: same deny shape naming `<REPO>/.claude/worktrees/wt-lane`.
  - The temp-HOME log carried `{"tool":"Bash","rules":["R4"],"action":"deny","enforced":false,"hard_deny":true}` and the Agent twin.

## Item 2: janitor SAFE covers clean, merged worktrees under the folder
No code change (classify has no location filter, scripts/janitor.mjs classify ~l.689 per scout). Pinned in scripts/janitor.test.mjs: "lane 65 item 2: a merged, clean, aged worktree at <repo>/.claude/worktrees/<name> is SAFE"; "... still JUDGMENT when dirty or too young"; "no location demotion - ... OUTSIDE the folder is SAFE exactly as before". Plus the end-to-end "scheduled run reclaiming a merged worktree under .claude/worktrees/ ... leaves the checkout clean".

## Item 3: runners exclude .claude/worktrees/, gitignored
- scripts/run-tests.mjs:26 `EXCLUDED_DIRS` already skips `.claude` at every depth (premise held; no code change). `.gitignore` gained `.claude/worktrees/` (never `.claude/`; .claude/settings.json is tracked).
- Tests (scripts/run-tests.test.mjs): "lane 65 item 3: walkTestFiles skips a .claude/worktrees tree at the root and nested at any depth"; ".gitignore carries .claude/worktrees/ (and never the whole .claude/ ...)" including `git check-ignore` on a worktree file (ignored) and `.claude/settings.json` (not ignored).
- Mirror/sync: scripts/mirror-shared-skills.mjs and collect-* walk fixed source dirs, no repo-tree walk, so nothing to exclude (scout finding re-checked: `readdirSync` appears once, on a single dir at mirror-shared-skills.mjs:663). No script is named "sync".
- Hazard noted, no guard added (ruling 3): a bare `node --test` with no file list in the main checkout recurses into `.claude/worktrees/` copies of the suite and runs every test once per worktree; `node scripts/run-tests.mjs` is safe, bare `node --test` is not.

## Item 4: path stated once each
Sentence "Every worktree lives at `<repo>/.claude/worktrees/<name>`, never as a sibling in Code or anywhere else." added once to skills/team-build/SKILL.md (Launch turn paragraph, ~l.353, plus "The dispatch guard (R4) refuses one created elsewhere."), skills/delegate/SKILL.md (l.28), agents/builder.md (l.28) and agents/runner.md (l.30) both OUTSIDE the safety block, docs/pane-setup.md (l.63). Test: agents/agents.test.mjs "the worktree location rule is stated exactly once in each of the five places, outside any safety block" (safety block stays byte-identical; the existing pinned-block tests pass).

## Item 5: install-janitor-timer default
- scripts/install-janitor-timer.mjs `resolveRepo` (l.149): default `<home>/Code/zhuk-infra/claude-delegation`, fallback to `<home>/Code/claude-delegation` ONLY when the new path is absent; `exists = fs.existsSync` injectable, an existence check that throws counts as absent. Doc comment (l.145-148), help text (l.533), skills/janitor/SKILL.md "Which repo it watches" updated.
- Tests (scripts/install-janitor-timer.test.mjs): "resolveRepo (lane 65 item 5): defaults to Code/zhuk-infra/claude-delegation when it exists, even if the old path also exists"; "falls back to the old Code/claude-delegation only when the new path is absent"; "the existence check is injectable, an unreadable path counts as absent, and the override file and --repo still win"; the old resolveRepo test now documents the fallback.
- Sweep. Command: `grep -rnE "Code[/\\]+claude-delegation" . -I | grep -v "^./docs/\|node_modules\|^./.git/\|\.test\.mjs"`. Result after my edits: only scripts/install-janitor-timer.mjs:146 (comment describing the fallback), :533 (help text naming the fallback), skills/decisions/scripts/decisions-pickup.mjs:637 (comment, history), skills/janitor/SKILL.md:189 (the fallback mention), skills/team-build/references/build-loop-args.example.json:10 (`claude-delegation-example-build`, an example value, not live). A second grep `grep -rnE "claude-delegation" --include=*.mjs --include=*.js --include=*.json --include=*.sh --include=*.ps1 ...` found only basename keys (required-wiring.default.json:138 `~/.agents/collect/claude-delegation/status.json`, collect-status defaultOutDir, decisions-render-core.mjs:45 GitHub URL) which survive the move. No other live hardcoded `Code/claude-delegation`.

## Item 7: janitor drift log leaves the tracked tree
- scripts/janitor.mjs: `defaultRecordDir(home = os.homedir())` (l.142) = `<home>/.agents/janitor-evidence`; `main(argv, { ..., home = os.homedir() })` (l.2214) passes it to `parseFlags(argv, home)` (l.2160, bare `--record` only) and on to `applyImpl(state, applyLog, { now, home })`. `writeRecord` unchanged in behavior: it writes `<date>-<host>[-hhmmss].json` and appends `drift.md` into whatever dir it is given, so both go out of tree on a bare `--record`; an explicit `--record <dir>` (absolute, or relative to the project root) writes exactly there. `DEFAULT_RECORD_DIR` (tracked docs path) is gone. Header (l.74-81) and writeRecord comments updated; skills/janitor/SKILL.md "Where the record lands" and the Cadence line rewritten.
- The timer's scheduled argv is `--record --repo <repo> [--host h] --apply` (install-janitor-timer.mjs scheduledCommandArgv): bare `--record`, so every scheduled run now writes to `~/.agents/janitor-evidence/` and touches nothing in the checkout. The other scheduled jobs write only under ~/.agents (collect-status defaultOutDir `~/.agents/collect/<repo>`, knowledge-triage `~/.agents/knowledge-triage`).
- Tests (scripts/janitor.test.mjs): the old bare-record test (was :1882) rewritten as "J1.4 / lane 65 item 7: a bare --record defaults to <home>/.agents/janitor-evidence/, never the watched repo"; "an explicit --record <dir> still writes exactly there, and nothing lands under the default"; "the scheduled argv (bare --record, --host, --apply) on a clean fixture repo leaves `git status --porcelain` empty"; "the same scheduled run reclaiming a merged worktree under .claude/worktrees/ still leaves the checkout clean". The F2 tests at (old) :3152/:3189 already pass an explicit `recordDir`, so they keep passing unchanged (no edit needed; they pin that an explicit dir still gets json + drift.md with the safe=/removed= suffix).
- Tracked docs/work/evidence/janitor/drift.md: LEFT FROZEN (ruling 4). Reasons: skills/janitor/SKILL.md said Ben's page links it by path (page is outside the repo, cannot be checked); and a `git rm` would make `git pull --ff-only` conflict on any host whose older-version janitor already appended a local line, the exact failure this item removes. SKILL.md now says it is frozen history, never written by a bare `--record`.

## Scout section 4 questions resolved
1. Item 1 host and strictness: R4 in the dispatch guard, hard deny (ignores the enforce file, honors no-dispatch-guard), matcher widened to add Bash|PowerShell. delete-guard was the cheaper host (already on Bash|PowerShell, wired for Codex too, no extra node cold start per Bash call) but its kill switch and purpose are deletion, and the brief named the dispatch guard; cost accepted: one more node start on every Bash/PowerShell call (silent and unlogged unless R4 fires). If that cost matters, moving only the Bash half into delete-guard is a small follow-up (the pure core is already a separate module).
2. Agent isolation check: the mandate's `Worktree:` line only; an Agent call with just `isolation: worktree` is allowed. Agent shape accepts any path with a `/.claude/worktrees/<name>` segment (cannot tell which repo a cross-repo mandate means); Bash shape is strict against the resolved main checkout.
3. Item 2: pin existing behavior, no location demotion.
4. Item 3: no guard for bare `node --test`; hazard noted above.
5. Item 7: path `~/.agents/janitor-evidence/`; `drift.md` stays tracked and frozen; explicit `--record <dir>` unchanged.

## Deviations and residual risks
- codex-unsupported.json reason for the dispatch guard ("requires Agent or SendMessage tool_name ...") is now slightly stale wording; the guard is still not wired for Codex, so left unedited (out of the named file set).
- R4 residuals: a `Worktree:` quote inside a pasted prior mandate at line start is judged; heredoc/quote scanning is heuristic (fail-open direction); `git worktree add` via a script file or `ssh` is not seen.
- The five-place sentence is not in the Codex .toml role files or chezmoi mirrors (out of scope).
- Janitor test file is slow on Windows (about 8 minutes alone); gate total 252 s when run as listed.
- A guard-hook note from setup is unchanged: delete-guard's false positive on heredoc prose naming a recursive-delete phrase; I avoided the phrase in my own commands. Nothing was denied during this build. No identity set, no destructive git, no directory deleted, nothing pushed or merged, no processes left running.
- Scratch: the record has no `Scratch:` line; temp files went to the session scratchpad (live-check repo under .../scratchpad/live, test notes) and /tmp/jan.log (a test log outside any repo). I deleted nothing; lead cleanup of both is a standalone command.

## Fix round 2 (review r1, all 5 findings applied)

Commit 9526ad717af1a09a151ad2ed4fe8421be45a7515 on build/worktree-location-65-wtloc65. Files: hooks/worktree-location.mjs, hooks/worktree-location.test.mjs, hooks/agent-dispatch-guard.mjs (doc comment only).

1. MAJOR cd/pushd/Set-Location: CD_RE added; checkBashWorktreeAdd replays directory changes that precede the git segment (skipped when inside a quote; `cd -` and `cd $X` are not judged). Test: "a cd / pushd / Set-Location earlier ..." covers the four reviewer cases plus `cd .claude/worktrees`, quoted-prose cd, `cd -`, `cd $WT`, `cd ..` to a non-repo.
2. MAJOR line continuation: argTokens treats `\`+newline (and CRLF, and PowerShell backtick) as whitespace; a root/empty-basename target is skipped. Test: "a Bash line continuation is whitespace".
3. MINOR Agent arm: scans every `Worktree:` declaration (line start with bullets, optional "Your ", or after `. `/`; ` as build-loop-workflow.js writes it); a path that already exists is not a creation and is allowed; header and doc say the Agent arm is advisory hygiene and the Bash arm is the enforcement. The home-config-dir acceptance (`<home>/.claude/worktrees/x`) is left as disclosed. Test: "R4 Agent: the build-loop mid-line mandate ...".
4. MINOR spellings: `[Gg][Ii][Tt](.exe)`; a quoted full path to git.exe is judged (QUOTED_GIT_HEAD_RE); unquoted `#` comments are stripped in the pre-pass (a `#` glued to a word is not). Test: "executable spellings ...".
5. MINOR stale doc comment at hooks/agent-dispatch-guard.mjs evaluation order now lists R4 after R0-stale.

Gate (exact brief command, 13 files, log reports/wtloc65-gate.log): tests 811, pass 794, fail 0, cancelled 0, skipped 16, todo 1, exit 0. worktree-location.test.mjs alone: 15 pass. No live CLI probe this round (the in-process decide() tests and the existing CLI test cover it; the secret guard blocked env-copying earlier in review, not retried).

## Fix round 3 (review r2: 1 MAJOR, 3 MINOR, all applied; commit 1364cdfdab59ecf3bda5b5e9244c961d7120a506)

Files: hooks/worktree-location.mjs, hooks/worktree-location.test.mjs only.
1. MAJOR cd; and Set-Location X; git ...: CD_RE now takes its operand with CD_VAL (stops at ; & | )) and accepts `cd --`. Test stub gitRunner now throws on a missing cwd, as real git does (mkdir of <repo>/.claude/worktrees added so the in-folder allow cases are meaningful). Added deny cases `cd <repo>;git worktree add ../semi-escape`; allow `cd -- .claude/worktrees && git worktree add wt-dd`.
2. MINOR quote state across lines: stripComment takes a shared state object, stripHeredocs carries it. Added the three multi-line commit-message commands as deny cases (escape-a/b/c).
3. MINOR backslash Agent relative paths: regex fixed to /^\.{1,2}[\/]/; added `Worktree: ..\wt-back` and `.\wt-dot` deny cases.
4. MINOR cd inside bash -c "...": replayCd helper replays CD_RE over the main prefix and, when the git match is inside a quote, over the quoted head. Added deny `bash -c "cd <repo> && git worktree add ../bashc-escape"` and allow `bash -c "cd .claude/worktrees && git worktree add wt-bashc-legit"`.
Gate (13 files, run exactly as in state file): exit 0, `tests 811, pass 794, fail 0, cancelled 0, skipped 16, todo 1`. worktree-location.test.mjs alone: 15/15. Test count is unchanged because the new cases extend existing tests.
Residuals not fixed (reviewer called them not counted): continuation inside the git head, `;# git worktree add` treated as code, two Worktree: declarations on one line.
