Task: One seam pass, after the integrator's PASS (C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/integrator-report.md), on the boundary between rebind64b's changed code and the live sequence the lead runs next: `decisions-pickup.mjs rebind`, then `status`, then `decisions-render.mjs publish --clear-done --owner skills-o` (which accounts the round), with `note-flush.mjs --status` reading the registration, all acting together on a moved-repo receipt, in a sealed copy. This build has one code territory, so the seam is "unit-tested pieces" to "the exact sequence the lead will run", not a cross-territory contract.
Goal: prove on the merged integration branch (not the builder's worktree) that the live sequence in spec.md "Investigation" (rebind, then publish after merge) would unstick the moved-repo page with no hand-edit of receipt or page, before the lead touches the real page.
Work: wr-2026-10-01-pickup-rebind (docs/work/wr-2026-10-01-pickup-rebind.record.md; read-only for you).

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/spec.md (the live sequence under test is in its Investigation section)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/briefs/scout-rebind64b.md
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/rebind64b-report.md, reviewer-report.md, integrator-report.md
- `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b` (integration worktree, branch `build/pickup-rebind-64b`, post-merge)

PROJECT FACTS: work only in a SCRATCH sealed home built with `makeTempHome` (scripts/test-home.mjs) or a temp directory under the scratch folder the lead's record names; the registration, receipt, captures, pointers, repo and the page are all fakes you build, with the page reader a local stub and every child process through `childEnv()` (skills/multi/scripts/test-child-env.mjs). Never touch the real pickup state directory under the agents home, never call `notion.js`, never run rebind, publish or account against page 3e1da11277a18174bccfea187d5c3972 or the real repo path. Pure Node, `node --test <files>`. Build the moved-repo fixture the way the builder's tests do (sealed repo, stuck round, repo directory renamed so the old path is gone, pointers and `.agents/project.json` carried along). Never set a git identity, never push, no trailers, never send peer notes. If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- Do not run the real live sequence or repair the real host registration (`registrations.json` names the pre-move repo path until the lead repoints it); that is the lead's.
- Do not re-review the territory code for bugs already in the reviewer's scope; this is the live-sequence handoff.
- Do not run the Netcup/Hetzner suites or a full-repo suite; do not decide ship.

Evidence format: `VERDICT: APPROVE`, `SKIPPED` or `NEEDS_FIXES` as the literal first line. For each check below quote the ACTUAL output line or state string, never a description.

Checks:
1. Sealed 9/30-shaped fixture (round 3 receipt in NEEDS_RECONCILIATION with previousState NEEDS_RECONCILIATION, owner skills-a, handoffStatus PENDING_MANUAL_HANDOFF, repo moved so the old path is gone). Quote `status --repo <new root>` BEFORE (expect the "different authorization project" refusal), then run the exact CLI shape the lead will run, `decisions-pickup.mjs rebind --page <id> --repo <new root> --from-project <old path> --owner skills-o`, with AGENTS_HOME set to the sealed home; quote its stdout and exit code; then `status` AFTER (quote state and `evidenceIntegrity.status`). Then close the round with the one-step publish path against fakes (the `wedgePublish` pattern in decisions-pickup.test.mjs, `--clear-done --owner skills-o`) and quote the receipt `state`, `accountedBy`, `owner`, `handoffStatus`. Confirm the receipt, captures and page changed only by the scripts, `owner` is still skills-a, and no send occurred.
2. The refusals through the real CLI: old path still existing, a `--from-project` that is not the receipt's, a tampered capture, a second `rebind`. Quote each refusal line and exit code, and hash the receipt and captures before and after to show no change.
3. Run the new-round path after rebind: a fresh checked Done on the moved repo opens round 4 under the NEW project's scope while round 3 keeps its saved scope; quote both `projectScope` prefixes and confirm the pointer file name and `noteId` of round 3 are unchanged.
4. `note-flush.mjs --status` with the fixture registration naming the missing pre-move repo path: quote the pickup field it prints. Then, from the code only (do not change anything), state exactly what the lead must change on the host before the live `publish` can run (registration `repo` and `owner` to the new root and skills-o, AGENTS_HOME, `.agents/project.json` `decisions_url` in the new repo, the untracked pointers under the new `docs/notes`, merge to main for `checkOnMain`).
5. Sanity re-check of the integrator's PASS on the merge commit: re-run `node --test skills/decisions/scripts/*.test.mjs` once and quote the summary line.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/seam-report.md. Line 1 is the verdict, first word.

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
