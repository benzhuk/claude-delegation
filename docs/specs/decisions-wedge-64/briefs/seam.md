Task: One seam pass, after the integrator's PASS (C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/integrator-report.md), on the boundary between wedge64's changed code and the live step the lead runs next: the three scripts (`decisions-pickup.mjs account`/`status`, `decisions-render.mjs publish --clear-done`, `note-flush.mjs --status`) acting together on a stuck round-3 receipt, in a sealed copy. This build has one code territory, so the seam is "unit-tested pieces" to "the exact sequence step 5 will run", not a cross-territory contract.
Goal: prove on the merged integration branch (not the builder's worktree) that the sequence in spec.md scope item 5 would close round 3 and publish with the waiting set empty, with no hand-edit of receipt or page, before the lead touches the real page.
Work: wr-2026-10-01-decisions-wedge (docs/work/wr-2026-10-01-decisions-wedge.record.md; read-only for you).

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/spec.md (item 5 is the sequence under test)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/briefs/scout-wedge64.md
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/wedge64-report.md, reviewer-report.md, integrator-report.md
- `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64` (integration worktree, branch `build/decisions-wedge-64`, post-merge)

PROJECT FACTS: work only in a SCRATCH sealed home built with `makeTempHome` (scripts/test-home.mjs) or a temp directory under the scratch folder the lead's record names; the registration, receipt, captures and the page are all fakes you build, with the page reader a local stub. Never touch the real pickup state directory under the agents home, never call `notion.js`, never run publish or account against page 3e1da11277a18174bccfea187d5c3972. Pure Node, `node --test <files>`. The integration worktree carries an uncommitted edit to the lead's work record: leave it alone. Never set a git identity, never push, no trailers, never send peer notes. If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- Do not run the real step 5 or repair the real host registration (`registrations.json` names the pre-move repo path); that is the lead's.
- Do not re-review the territory code for bugs already in the reviewer's scope; this is the live-sequence handoff.
- Do not run the Netcup/Hetzner suites or a full-repo suite; do not decide ship.

Evidence format: `VERDICT: APPROVE`, `SKIPPED` or `NEEDS_FIXES` as the literal first line. For each check below quote the ACTUAL output line or state string, never a description.

Checks:
1. Build a sealed fixture of the 9/30 wedge (round 3, state NEEDS_RECONCILIATION, previousState NEEDS_RECONCILIATION, owner skills-a, handoffStatus PENDING_MANUAL_HANDOFF, a fresh page carrying new owner input, every answer quoted in a history file on a fixture `origin/main`). Run the item-5 sequence with the fixed scripts: close the round, then `publish`. Quote the receipt state before and after, each exit code, and confirm the receipt and page were changed only by the scripts.
2. Re-run it with the pickup run by a different lead than the one in the receipt: quote the result; no resend.
3. Re-run it with one owner input NOT quoted in history: it must refuse; quote the refusal.
4. Re-run it with the fixture's registration naming a missing (pre-move) repo path: quote what `note-flush.mjs --status` prints for the pickup field, and state, from the code only, what the lead must change on the host before step 5 can run (do not change it).
5. Sanity re-check of the integrator's PASS on the merge commit: re-run the same changed test files once and quote the summary line.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/seam-report.md. Line 1 is the verdict, first word.

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
