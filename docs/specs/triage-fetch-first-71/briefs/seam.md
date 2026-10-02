Task: After the single territory triage71 is reviewed (APPROVE) and merged into the integration branch by the integrator, run one adversarial pass scoped ONLY to the seams between the lane's parts, which no per-item test sees: (A) the outer job's preflight and repair versus the nested triage skill's own publication (which lives outside this repo); (B) the ATTENTION text versus the lock and the 5:00 AM skip; (C) receipt, runState and publication verification after a fast-forward or a repair. Verdict first: `APPROVE` or `NEEDS_FIXES (<n>)`.
Goal: the lane's promises hold TOGETHER: a run that starts on a source that moved is brought level before it touches the store, a run that loses a push race is repaired once or stops cleanly with recovery a paste away, and the next scheduled run is neither wedged nor lied to.
Work: wr-2026-10-01-triage-fetch-first

Timing: this review runs AFTER Integrate, on the merged head of the integration branch, as a separate reviewer's job. The integrator did not wait for it and did not need its sign-off; your findings go to the orchestrator, who routes any fix round.

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/spec.md (the whole spec is the contract; there is no separate contracts file)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/briefs/triage71.md and scout-triage71.md (what was asked, what the builder was allowed to rule)
- The builder and review reports and the proposed skill patch in C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/reports/ (triage71-builder.md, triage71-review-r<n>.md, triage71-skill-patch.md, integrator.md)
- The merged integration worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71, branch build/triage-fetch-first-71: read the actual merged code, not the reports' paraphrase.
- Read-only context: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/work/evidence/2026-10-01-post-install-first-runs.md (the incident) and the installed skill text at C:/Users/benzh/.claude/skills/triage/SKILL.md (read only, l.85-135: the skill's own commit, push, verify and lock-release steps).

PROJECT FACTS (at most 25 lines):
- Windows host, Node only. NO full suite on Windows: run `node --test` only on specific test files; never bare `node --test`, never `node scripts/run-tests.mjs` with no arguments.
- Never touch the real chezmoi source repo (C:/Users/benzh/.local/share/chezmoi), ~/.claude/knowledge or ~/.agents/knowledge-triage, and never run the real knowledge-triage job. Everything below runs against a scratch bare repo, a scratch clone and a fixture home built with makeTempHome({ gitIdentity: true }) from scripts/test-home.mjs under C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-71/.
- Live seams to verify in scratch fixtures:
  A. Drive runKnowledgeTriage with the fake claude from the test harness (or a thin copy) against a REAL scratch bare origin: the fake "nested run" commits one DIGEST-touching commit in the scratch clone and fails to push while a third party advanced origin. Show the repair rebases once and pushes, then `publicationState` verifies and the run ends success, and quote the git call log. Then the same with a conflicting edit: `rebase --abort` runs, tree clean, ATTENTION with the conflict block, exit 1.
  B. After each ATTENTION outcome (dirty, diverged, conflict) run the job again with ATTENTION present: it must skip with "ATTENTION present" (the 5:00 AM behaviour is unchanged), and after the packet's own recovery commands plus `rm` of ATTENTION the next run must proceed. Run the quoted recovery commands from the packet verbatim against the scratch repo for each state and report whether each works.
  C. Receipt integrity: after a fast-forward preflight, `receipt.dotfilesBefore` is the post-ff HEAD; after a repair, `receipt.dotfilesSha`, `receipt.publication.remoteRef` and the verified flag agree with the scratch remote. An origin commit pulled in by the ff that touches the DIGEST path must not make a no-op nested run look like a published digest.
  D. Lock seam: the skill's `.curated-update.lock` is held by the (dead) nested session after a failed push. Show what a repaired run leaves behind and what the NEXT scheduled run does (defer on lock, then ATTENTION on the second). Report this plainly as a finding or as accepted by spec; the lock mechanism itself is out of scope and must be unchanged.
  E. Read the installed skill's publication paragraph against the proposed patch: do the outer job's repair and the skill's own steps ever both push, or both rebase, in one run? Quote the lines.
- Never run a recursive delete or git clean; never set a git identity; no commit trailers; never push.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- Re-reviewing the territory's internal correctness (its reviewer did that); you look only at the boundaries above.
- Editing the triage skill or any file; the Linux suites; any release or install; the lock mechanism, host gather list, archive format, Mac host.
- Fixing anything yourself: you report findings for the orchestrator to route.

Evidence format: every finding carries a severity (BLOCKER/MAJOR/MINOR), the exact command you ran and its exact output (not paraphrased), and the file that needs the fix.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/reports/seam-review.md. Line 1 is the verdict, first word: `VERDICT: APPROVE` or `VERDICT: NEEDS_FIXES (<n>)`.

A result of "seams hold, all five checks quoted below" is a good answer when it is true; say so plainly with the quoted output.

Autonomy: you decide whether a seam mismatch is a BLOCKER (breaks a spec promise literally) or a MINOR (cosmetic). You do not decide who gets the fix round.

Un-agent-able steps: none expected; everything runs from a shell against scratch fixtures.
ETA: 30 to 45 minutes. Report or park by then.

JUDGMENT: seam compliance of the triage preflight, the one-rebase repair and the three-state ATTENTION text with the skill's own publication, the curated lock and the next scheduled run, checked live in scratch repos

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
