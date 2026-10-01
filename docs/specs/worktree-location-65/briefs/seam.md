Task: After the single territory wtloc65 is reviewed (APPROVE) and merged into the integration branch, run one adversarial pass scoped ONLY to the seams between the lane's parts, which no per-item test sees: (A) the new worktree guard and the janitor and installer agreeing on what "the right folder" is; (B) the janitor's new record location and everything that reads or schedules it; (C) the .gitignore line and the clean-checkout promise. Verdict first: `APPROVE` or `NEEDS_FIXES (<n>)`.
Goal: the lane's promises hold TOGETHER: a worktree made where the guard allows is one the janitor can see and sweep, and a durable checkout stays clean after the janitor timer has run.
Work: wr-2026-10-01-worktree-location

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/spec.md (the whole spec is the contract; there is no separate contracts file)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/briefs/wtloc65.md and scout-wtloc65.md (what was asked, what the builder was allowed to rule)
- The builder and review reports in C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/reports/ (wtloc65-builder.md, wtloc65-review-r<n>.md)
- The merged integration worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65, branch build/worktree-location-65: read the actual merged code, not the reports' paraphrase.

PROJECT FACTS (at most 25 lines):
- Windows host, Node only. NO full suite on Windows: run `node --test` only on specific test files; never bare `node --test`, never `node scripts/run-tests.mjs` with no arguments.
- Live seams to verify, in scratch fixtures (fixture repo and fixture HOME under the scratch folder your mandate names, never the real home, never a real scheduler):
  A. Create a worktree in a fixture repo at `<repo>/.claude/worktrees/x` from a merged branch; feed the guard the matching `git worktree add` PreToolUse JSON (allowed) and one for `<repo>/../x` (refused); then run janitor.mjs report-only against the fixture and confirm the allowed one is listed SAFE once merged, clean and past the age floor (--min-age-hours 0), and that the janitor's own root-clean test and the guard resolve `<repo>` the same way when started from inside a linked worktree.
  B. Install the timer with `--dry-run` into a fixture home and quote the scheduled argv: it must still be `--record --repo <repo> --apply` with no tracked-dir path in it; run a bare `--record` against a clean fixture repo with an injected home; `git status --porcelain` must be empty, the json and drift line must be under the injected `~/.agents/...`; grep skills/, scripts/, docs/*.md, hooks/ for any remaining reader of `docs/work/evidence/janitor/drift.md` (wiring-check, decisions, GOALS, SKILL text) and report each.
  C. In the fixture, with `.claude/worktrees/x` present, `git status --porcelain` at the repo root is empty because of the ignore line; without the line it is not (prove it by one `git check-ignore -v` each way).
  D. installer default: with only the new path present, only the old path present, both present, neither present, `resolveRepo` returns what the spec says; quote the four outputs.
- Never run a recursive delete or git clean; never set a git identity; no commit trailers; never pass --apply to janitor.mjs against a real repo.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- Re-reviewing the territory's internal correctness (its reviewer did that); you look only at the boundaries above.
- The chezmoi mirror templates, the Linux suites, any release or install.
- Fixing anything yourself: you report findings for the orchestrator to route.

Evidence format: every finding carries a severity (BLOCKER/MAJOR/MINOR), the exact command you ran and its exact output (not paraphrased), and the file that needs the fix.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/reports/seam-review.md. Line 1 is the verdict, first word: `VERDICT: APPROVE` or `VERDICT: NEEDS_FIXES (<n>)`.

A result of "seams hold, all four checks quoted below" is a good answer when it is true; say so plainly with the quoted output.

Autonomy: you decide whether a seam mismatch is a BLOCKER (breaks a spec promise literally) or a MINOR (cosmetic). You do not decide who gets the fix round.

Un-agent-able steps: none expected; everything runs from a shell against scratch fixtures.
ETA: 30 to 45 minutes. Report or park by then.

JUDGMENT: seam compliance of the worktree guard, janitor record location and installer default, checked live in fixtures

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
