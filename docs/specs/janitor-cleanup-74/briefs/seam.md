Task: After both territories (janitor74, loop74) are reviewed (APPROVE) and merged into the integration branch by the integrator, run one adversarial pass scoped ONLY to the seams between the lane's parts, which no per-item test sees. This job runs AFTER Integrate, on the merged head, as a separate reviewer's job; the integrator did not wait for it. Verdict first: `APPROVE` or `NEEDS_FIXES (<n>)`.
Goal: the lane's promises hold TOGETHER: a lane that lands leaves nothing, a build in flight is never archived out from under its builders, and a durable checkout stays clean while the janitor runs.
Work: wr-2026-10-02-janitor-cleanup

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/spec.md (the whole spec is the contract; there is no separate contracts file)
- The scout files and builder briefs janitor74.md and loop74.md under C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/briefs/, and the builder and review reports in C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/reports/ (janitor74-builder.md, loop74-builder.md, <id>-review-r<n>.md, integrator.md)
- The merged integration worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74, branch build/janitor-cleanup-74: read the actual merged code, not the reports' paraphrase.

PROJECT FACTS (at most 25 lines):
- Windows host, Node only. NO full suite on Windows: run `node --test` only on specific test files; never bare `node --test`, never `node scripts/run-tests.mjs` with no arguments.
- Live seams to verify, in scratch fixtures (fixture repos, fixture bare origin and fixture HOME under the scratch folder your mandate names; never the real home, ~/Code, a real worktree, a real origin or a real scheduler):
  A. Ownership against the loop's shapes: in a fixture repo create an integration branch and worktree and two territory worktrees named as the loop names them (branch `build/<slug>`, `build/<slug>-<id>`, worktrees under `.claude/worktrees/`), with an open record whose `Worktree:` is (1) a branch name, (2) an absolute path. Make the territory worktrees dirty and age them past 24 h with the injected clock. Run the janitor with the archive policy ON: nothing of an open lane is archived or removed. Close the record: the same worktrees are now archived-then-removed, or removed by closeout, never both, never lost.
  B. Closeout against archive: run the lane's closeout on a merged fixture lane (fixture origin), then the janitor over the same repo: the second actor finds nothing to do, no error, no second archive branch. Reverse the order too.
  C. Phase-end commit against the janitor: a territory worktree left clean by the phase commit and merged is SAFE to the existing class; one left dirty is a JUDGMENT/archive row; the archive branch name does not collide with a phase-commit message or branch.
  D. Packets and the untracked report: after a note-send (with a packet) and a decisions pickup against a fixture home and fixture checkout, `git status --porcelain` of the checkout is empty and the janitor's 7-day untracked report lists nothing for it; a hand-made untracked file backdated past 7 days is listed by path and not touched.
  E. Report mode and activation: with no policy file nothing new acts across a full fixture run (compare the repo and origin before and after); the existing SAFE class still acts; the timer re-registration (janitor74) leaves the policy untouched; install `--dry-run` into a fixture home and quote the scheduled argv (must still be `--record --repo <repo> --host <name> --apply`).
  F. grep scripts/, skills/, hooks/, docs/*.md for any remaining reader of a moved path (`docs/notes/` packets, `*.pointer.json`, `docs/ledger/`, `docs/work/evidence/janitor/`) and report each.
- No recursive delete by you, no history-discarding commands, never set a git identity, no commit trailers, never pass --apply to janitor.mjs against anything but a fixture.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- Re-reviewing a territory's internal correctness (its reviewer did that); you look only at the boundaries above.
- The Linux suites, any release or install, the policy tick, the Netcup and Hetzner timers.
- Fixing anything yourself: you report findings for the orchestrator to route.

Evidence format: every finding carries a severity (BLOCKER/MAJOR/MINOR), the exact command you ran and its exact output (not paraphrased), and the file that needs the fix.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/reports/seam-review.md. Line 1 is the verdict, first word: `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`, <sha> the full output of `git rev-parse HEAD` in the integration worktree.

A result of "seams hold, all six checks quoted below" is a good answer when it is true; say so plainly with the quoted output.

Autonomy: you decide whether a seam mismatch is a BLOCKER (breaks a spec promise literally) or a MINOR (cosmetic). You do not decide who gets the fix round.

Un-agent-able steps: none expected; everything runs from a shell against scratch fixtures.
ETA: 30 to 45 minutes. Report or park by then.

JUDGMENT: seam compliance of the janitor's ownership and archive against the build loop's worktrees, commits, closeout and out-of-checkout packets, checked live in fixtures

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
