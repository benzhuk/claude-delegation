Task: Independently review territory wedge64's changes (one-step clear-and-account, history-closed rounds admitted, owner binding follows the running lead, and their regression tests) against spec.md scope items 1-4 and scout-wedge64.md, read-only and adversarial. Spawn only after wedge64's own gate (C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/wedge64-gate.log) is green; read the builder's report first, then the diff of `build/decisions-wedge-64-wedge64` against base 0d9cdeb539a6f23e7974cdea589fb0d3b127f2f9, in worktree `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-decisions-wedge-64-wedge64`.
Goal: confirm the wedge cannot recur (no path clears Done without accounting, a history-quoted round closes, a lead change does not strand a round) without weakening the safety the pickup exists for: no resend, no accounting of an uncertain delivery, no admitting an owner input that is not quoted.
Work: wr-2026-10-01-decisions-wedge (docs/work/wr-2026-10-01-decisions-wedge.record.md in `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64`; read-only for you too).

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/spec.md
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/briefs/scout-wedge64.md
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/briefs/wedge64.md (the mandate the builder worked to, including its "Rulings needed" rule)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/wedge64-report.md and wedge64-gate.log

PROJECT FACTS: pure Node, `node --test <files>`, no build step, Windows host has no full suite (run only focused files if you must run anything). Header-line shape `/^[ \t*+-]{0,20}<Label>:\**[ \t]{0,20}(.+)$/mi`. Never set a git identity, never push, no trailers, never send peer notes. Never read or touch the real pickup state directory under the agents home or any live page. If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- Do not edit any file. Findings only, with file:line and a ready-to-apply patch (exact old -> exact new) for anything mechanical.
- Do not run item 5 (live close and publish), the Netcup/Hetzner suites, or touch `docs/work/`.
- Do not re-run an integration-wide suite.

Evidence format: `VERDICT: APPROVE` or `VERDICT: NEEDS_FIXES` as the literal first line. Every finding carries severity, file:line or a measured count, and a concrete fix. This is a bug-fix review: your report must carry four non-empty lines, `Cause:`, `Discriminating check:`, `Fix location:`, `Simplification:`, checked by `node scripts/bugfix-fields.mjs <your-report>` (run it and quote its exit code).

Attack brief:
1. Clear Done without accounting: find any remaining path (publish --clear-done, --adopt-live, a retry after a partial failure, a crash between the two halves of the one step) that leaves Done unchecked with the round un-accounted, or accounted with Done still checked and nothing able to clear it. Construct it, do not just read.
2. History-closed round: try a round with ONE owner input not quoted in history, a comment that is only a substring of unrelated prose, a quote present only in a local uncommitted or unpushed history file (must not count: origin only), a quote in a day other than today, and an input quoted twice when the page holds it three times (multiset). Each must behave as the spec's "all quoted" wording requires.
3. Owner binding: a different lead running the pickup must neither resend (grep sends in the new tests) nor leave the round PENDING_MANUAL_HANDOFF forever; confirm the old lead's attestation requirement is not silently dropped, and read how `registered-pickup.contract.test.mjs` line ~181 now reads and whether the change is the narrowest one.
4. Safety carried over: an UNKNOWN/uncertain-delivery round must still never become repeat-safe (decisions-pickup.test.mjs "uncertain-delivery provenance" test); a genuinely new owner input must still reconcile, not close.
5. Fixture honesty: the 9/30 wedge fixture must be synthetic (no copy of the real private capture or receipt values), reproduce receipt state NEEDS_RECONCILIATION with previousState NEEDS_RECONCILIATION, owner skills-a, handoffStatus PENDING_MANUAL_HANDOFF, and fail all three regression tests at the base sha. Re-run scripts/prefix-test.mjs for each yourself.
6. Scope: confirm the diff touches only the territory list, adds no waiver flag, no new page section, no publish-without-pickup path, and that SKILL.md and skill-text.test.mjs agree with the code.
7. Every "Rulings needed" item in the builder report: say whether the narrow reading taken is acceptable, and which alternative the lead must rule on.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/reviewer-report.md. Line 1 is the verdict, first word.

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
