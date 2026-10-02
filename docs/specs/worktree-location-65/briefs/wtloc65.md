Task: Build territory wtloc65, the whole of lane 65 (worktree location rule), in your worktree: implement scope items 1 to 7 of the spec, with tests for items 1, 2, 3, 5 and 7, and commit on your branch.
Goal: work is not lost or stalled by worktrees scattered outside the repo: every worktree lives under `<repo>/.claude/worktrees/`, is refused elsewhere, is swept when merged and clean, and nothing a scheduled job does leaves a durable checkout dirty.
Work: wr-2026-10-01-worktree-location

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/spec.md (the pinned scope, items 1 to 7, quoted verbatim from the lead's packet; it carries no separate contracts file, the spec IS the contract)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/briefs/scout-wtloc65.md (your scout addendum: read it before any code. Where it conflicts with the spec, the spec wins. Its section 4 questions are yours to resolve under Autonomy below.)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/work/wr-2026-10-01-worktree-location.record.md (read-only context; you never write the record)
- Code to read first (paths relative to your worktree): hooks/agent-dispatch-guard.mjs, hooks/delete-guard.mjs, hooks/hooks.json, scripts/janitor.mjs (writeRecord ~l.2013, DEFAULT_RECORD_DIR l.133, classify ~l.689), scripts/install-janitor-timer.mjs (l.145-156, l.524), scripts/run-tests.mjs:26, skills/janitor/SKILL.md (l.186-215)

PROJECT FACTS (at most 25 lines):
- Your worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-worktree-location-65-wtloc65, branch build/worktree-location-65-wtloc65, cut from base 0a33fd52f00abcedf276a4e6497f66c61f5ba24b. Work and commit there only (conventional commit messages, no Co-Authored-By, no byline, the configured git identity untouched).
- The integration worktree/branch is C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65 (branch build/worktree-location-65); you never write there except your reports to the absolute report paths below.
- Windows host. No package.json, no npm, Node only. There is NO full suite on Windows: run `node --test` only on test files you added or changed (listed in the Gate). Never run `node scripts/run-tests.mjs` with no arguments, and never a bare `node --test` with no file list. The full suite runs later on Linux hosts, by the lead.
- Tests use fixture homes and fixture repos (fs.mkdtempSync under os.tmpdir()) only; never touch the real home, the real ~/.agents, or a real scheduler; never pass --apply to janitor.mjs against a real repo.
- Every worktree goes under <repo>/.claude/worktrees/<name>. You create no new worktree; if a test needs one, make it in a temp fixture repo.
- Edit agents/builder.md and agents/runner.md OUTSIDE the safety-block markers only (agents/agents.test.mjs pins the block byte-identical and under 2100 characters). State the path ONCE in each of: skills/team-build/SKILL.md, skills/delegate/SKILL.md, agents/builder.md, agents/runner.md, docs/pane-setup.md. One sentence each, same wording core: "Every worktree lives at `<repo>/.claude/worktrees/<name>`, never as a sibling in Code or anywhere else."
- Do not touch the chezmoi mirror templates (not in this lane; they wait for the Mac move). Do not edit skills/team-build/references/build-loop-workflow.js (pinned static contract; its worktreeRoot default already lands siblings of an integration worktree that sits under the folder).
- Item 5: scripts/install-janitor-timer.mjs resolveRepo default becomes `<home>/Code/zhuk-infra/claude-delegation`, falling back to the old `<home>/Code/claude-delegation` ONLY when the new path is absent (fs existence check, injectable for the test); update the l.145 doc comment, the l.524 help text and skills/janitor/SKILL.md:189. Sweep the repo for other hardcoded `Code/claude-delegation` in LIVE code (the scout found none besides these); report the grep command and its result either way. Comments and fixtures that are history stay.
- Item 3: add `.claude/worktrees/` to .gitignore (never `.claude/`: .claude/settings.json is tracked). run-tests.mjs already excludes `.claude`; add a test that walkTestFiles skips a nested .claude/worktrees tree, and a test that .gitignore carries the line.
- Item 7: the janitor's default record dir moves outside the tracked tree, under ~/.agents/ (os.homedir()-based, injectable for tests), so a bare --record writes both the <date>-<host>.json and the drift line there; an explicit `--record <dir>` keeps writing exactly there. The tracked docs/work/evidence/janitor/drift.md stops being written by any scheduled or default path. Update janitor.test.mjs:1882 and the l.3152/3189 tests, the janitor.mjs header and writeRecord comments, and skills/janitor/SKILL.md (where the record lands). Add a test that a bare --record on a clean fixture repo leaves `git status --porcelain` empty.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block. Never set a git identity, no --no-verify, no force, no recursive deletes (no recursive remove of any kind, no git clean).

NOT (out of scope, stated explicitly):
- chezmoi mirror templates; scripts/mirror-shared-skills.mjs behavior; skills/team-build/references/build-loop-workflow.js and its test.
- docs/work/*.record.md, docs/decisions/*, the README changelog, any release or install step, the Netcup and Hetzner suites.
- Any change to R0-stale, R1, R1b, R2, R3 behavior or text in the dispatch guard, or to delete-guard's existing detections.
- Never push; never merge into any branch; never touch another worktree.

Evidence format: cite file:line for every claim about existing code; for each of items 1, 2, 3, 5, 7, name the test(s) that prove it and quote the tail of the gate log. State every scout open question you resolved, the answer you chose and why, in one line each.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/reports/wtloc65-builder.md. Line 1 is the verdict, first word (VERDICT: PASS / FAIL / PARTIAL / BLOCKED).

Gate: node --test hooks/agent-dispatch-guard.test.mjs hooks/delete-guard.test.mjs scripts/janitor.test.mjs scripts/install-janitor-timer.test.mjs scripts/run-tests.test.mjs agents/agents.test.mjs <every other test file you add or change, appended here> > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/reports/wtloc65-gate.log 2>&1. Read only the tail and the failing names. No wrapper script. If you change hooks/hooks.json or hooks/codex-hooks.json, also append skills/multi/scripts/hooks.test.mjs scripts/wiring-check.test.mjs scripts/native-package.test.mjs scripts/codex-hook-trust.test.mjs hooks/codex-unsupported.test.mjs scripts/mirror-shared-skills.test.mjs.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/reports/wtloc65-state.md. Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you may decide, and must record in your report, the scout section-4 questions, each by the simplest reading that keeps the spec's wording true:
(1) item 1 lives in the dispatch guard as a new rule R4 (hard deny like R0-stale: ignores the enforce file, honors ~/.agents/no-dispatch-guard), checking a Bash/PowerShell `git worktree add <path>` (resolve a relative path against input.cwd and honor `git -C`; resolve <repo> through the main checkout, never the linked worktree) and an Agent spawn whose mandate names a `Worktree:` path; widen the hooks.json matcher for the guard only as far as needed; fail open on any error; the deny text names the correct path `<repo>/.claude/worktrees/<name>`. If delete-guard is the better host, say why. An Agent call with only `isolation: worktree` and no path is allowed (Claude Code creates it in the right place).
(2) item 2: pin existing behavior with a test (a merged, clean, aged worktree at <repo>/.claude/worktrees/x is SAFE) and document it; add no location demotion.
(3) item 3: no new guard for a bare `node --test`; note the hazard in your report.
(4) item 7: the new default is ~/.agents/janitor-evidence/; remove the tracked drift.md from the index ONLY IF nothing in skills/ or scripts/ links it by path after your edits, otherwise leave it frozen and say so.
Check in (BLOCKED, do not improvise) before: changing any other hook's behavior, touching the safety block, or touching anything outside the files the spec's scope names.
Un-agent-able steps: none. Live verification of item 1 is a scratch run of the hook with a hand-built PreToolUse JSON on stdin and a temp HOME; quote the exact input and output. Linux full suites are the lead's, scoped out of "done" for you.
ETA: 90 to 150 minutes (seven items across about ten files plus tests). Report or park by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
