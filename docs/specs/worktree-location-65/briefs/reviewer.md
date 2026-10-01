Task: Adversarially review territory wtloc65's delivered diff (all of lane 65) against the spec and its builder brief. Read-only; you never edit the territory's files. Verdict first: `APPROVE` or `NEEDS_FIXES (<n>)`.
Goal: work is not lost or stalled by worktrees scattered outside the repo; a worktree outside `<repo>/.claude/worktrees/` is refused with the right path named, merged and clean ones under it are swept, and no scheduled job leaves a durable checkout dirty.
Work: wr-2026-10-01-worktree-location

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/spec.md (items 1 to 7 are the contract)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/briefs/scout-wtloc65.md
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/briefs/wtloc65.md (the builder's brief, so you know what it was asked to do and NOT do, and which scout questions it was allowed to rule on)
- The builder's report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/reports/wtloc65-builder.md
- The builder's gate log: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/reports/wtloc65-gate.log
- The territory's worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-worktree-location-65-wtloc65, branch build/worktree-location-65-wtloc65, base 0a33fd52f00abcedf276a4e6497f66c61f5ba24b. Read the actual diff there (`git -C <worktree> diff 0a33fd52f00abcedf276a4e6497f66c61f5ba24b...HEAD`), never the report's paraphrase of it.

PROJECT FACTS (at most 25 lines):
- Windows host, Node only, no package.json. There is NO full suite on Windows: re-run `node --test` yourself on the test files the diff added or changed (and on hooks/agent-dispatch-guard.test.mjs, scripts/janitor.test.mjs, scripts/install-janitor-timer.test.mjs, agents/agents.test.mjs) to confirm the builder's gate log is real. Never run a bare `node --test`, never `node scripts/run-tests.mjs` with no arguments.
- Temp files only under the scratch folder your mandate names, never in a repo. Use fixture homes and fixture repos for every live check; never the real home or ~/.agents; never pass --apply to janitor.mjs against a real repo; never enable a real scheduler.
- Never run a recursive delete or git clean; never set a git identity; no commit trailers.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- You do not fix anything. You do not judge the cross-item seam between the dispatch guard, the janitor and the installer: that is the seam reviewer's job. You do not review the chezmoi mirror templates (not in this lane).

Evidence format: every finding carries a severity (BLOCKER/MAJOR/MINOR), a file:line or a measured command output, and a concrete fix (exact old -> exact new for anything mechanical). Verdict word first, on its own line, before any prose.

Attack brief, specific things to try:
- Item 1: feed the guard a hand-built PreToolUse JSON for `git worktree add ../x -b y`, `git -C <repo> worktree add <abs outside path>`, a relative path resolved against a cwd that is itself a linked worktree, a path under `<repo>/.claude/worktrees/` (must pass), a path under `<repo>/.claude/worktrees-evil/` or `<repo>/.claude/worktrees/../x` (must be refused: prefix-match and `..` traversal), a Windows backslash and mixed-case spelling of the allowed path (must pass), a PowerShell spelling, and a quoted path with spaces. Does the deny text name the right path? Does malformed input, missing cwd, or a non-git cwd fail OPEN (print nothing, exit 0)? Does `~/.agents/no-dispatch-guard` still skip everything? Are the R0-stale, R1, R1b, R2, R3 texts and order byte-unchanged (diff the test file's pinned strings)? Did widening the hooks.json matcher change what any other hook sees, or trip skills/multi/scripts/hooks.test.mjs and the wiring tests?
- Item 2: does the new test really prove a merged, clean, aged worktree at `.claude/worktrees/x` is SAFE, and a dirty or unmerged one is not? Is `--apply` ever reachable in the test against anything but a fixture?
- Item 3: does `.gitignore` carry `.claude/worktrees/` and NOT `.claude/` (confirm `git ls-files .claude/settings.json` still lists it)? Does the walkTestFiles test fail on a naive revert?
- Item 5: `resolveRepo` picks the new path when it exists, the old path only when the new is absent, and an `~/.agents/janitor-repo` file and `--repo` still win. Re-run the builder's sweep grep for live `Code/claude-delegation` and report any hit it missed.
- Item 7: run a bare `--record` against a clean fixture repo and confirm `git status --porcelain` is empty afterward; confirm the drift line AND the json landed under the injected ~/.agents path; confirm an explicit `--record <dir>` still writes there; confirm nothing scheduled (the installer's argv) still points at the tracked dir; check the janitor SKILL.md text matches. A same-day second run must still never overwrite an earlier json (the wx create-only rule).
- Item 4: the path is stated exactly once in each of the five named files, and agents/builder.md and runner.md safety blocks are byte-identical (agents.test.mjs).
Named failure class: "a guard that passes because it is not looking": a path check that a prefix, a trailing separator, a case difference or `..` defeats, or a deny that silently fails open on the very input it exists for. Also ask whether any fix is a cause fix or a compensation that hides the symptom.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/reports/wtloc65-review-r<round>.md. Line 1 is the verdict, first word: `VERDICT: APPROVE` or `VERDICT: NEEDS_FIXES (<n>)`.

A result of zero findings is a good answer, stated plainly, once you have tried every item above and can say so.

Autonomy: you decide severity and whether a finding blocks APPROVE. You do not decide whether to grant a fix round or spawn a fresh builder: that is the orchestrator's call once your report lands.

Un-agent-able steps: none expected; every check runs from a shell in the territory's worktree with a fixture home.
ETA: 30 to 45 minutes per round. Report or park by then.

JUDGMENT: adversarial correctness verdict on the worktree-location guard, janitor record move and installer default

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
