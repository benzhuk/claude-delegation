# wtloc65 state

## Territory
Whole of lane 65 (worktree location rule), scope items 1-7, in worktree
C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-worktree-location-65-wtloc65
(branch build/worktree-location-65-wtloc65, base 0a33fd52). Spec: lane-65/docs/specs/worktree-location-65/spec.md.

## Contracts I rely on
- The spec is the contract (no contracts file). Scout addendum briefs/scout-wtloc65.md. Spec wins over scout.

## Done (committed unless noted)
- Fix round 3 (review r3 finding 1, here-string quote in stripHeredocs): commit ea919e4c, gate green (794 pass, 0 fail). See wtloc65-fix-r3.md.
- Item 1: hooks/worktree-location.mjs (new, pure R4 core) + hooks/agent-dispatch-guard.mjs (R4 after R0-stale, hardDeny) + hooks/hooks.json matcher widened to Agent|SendMessage|Bash|PowerShell + skills/multi/scripts/hooks.test.mjs:91 updated + hooks/worktree-location.test.mjs (11 tests, pass) + R0 CLI test copy list gets worktree-location.mjs.
- Item 5: scripts/install-janitor-timer.mjs resolveRepo (+exists injectable), help text, doc comment, skills/janitor/SKILL.md; tests added to install-janitor-timer.test.mjs (pass).
- Item 3: .gitignore line, 2 tests in scripts/run-tests.test.mjs (pass).
- Item 4: sentence once in 5 places + test in agents/agents.test.mjs (pass).
- Item 7 + 2 (committed b7fcaaee): scripts/janitor.mjs defaultRecordDir(home) -> ~/.agents/janitor-evidence, main(home) option, SKILL.md text; scripts/janitor.test.mjs tests rewritten/added (run is slow, ~3+ min on Windows).

## Next
- Nothing: fix round 3 applied (commit 1364cdfd), gate green (811 tests, 0 fail), report appended.

## Open questions
- None blocking. drift.md left tracked/frozen on purpose (see report).

## How to run my gate
cd the worktree; run the Gate line from briefs/wtloc65.md with all changed test files appended:
node --test hooks/agent-dispatch-guard.test.mjs hooks/delete-guard.test.mjs scripts/janitor.test.mjs scripts/install-janitor-timer.test.mjs scripts/run-tests.test.mjs agents/agents.test.mjs hooks/worktree-location.test.mjs skills/multi/scripts/hooks.test.mjs scripts/wiring-check.test.mjs scripts/native-package.test.mjs scripts/codex-hook-trust.test.mjs hooks/codex-unsupported.test.mjs scripts/mirror-shared-skills.test.mjs > <reports>/wtloc65-gate.log 2>&1
(never bare node --test, never run-tests.mjs without a file list)
