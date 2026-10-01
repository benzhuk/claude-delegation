# Lane 67: feed the build loop (plan item 6, restated from evidence)

Written 10/1 by skills-f. Evidence: `docs/work/evidence/2026-10-01-build-loop-usage.md`.

## What the evidence changed
Plan item 6 asked for "one Workflow per build". That Workflow already exists (`skills/team-build/references/build-loop-workflow.js`, since 0.11.0). Since 9/25 the Claude-led builds that ran through it cost 3 to 17 lead turns, median 9. The builds that cost 30 to 59 lead turns (lane 60, lane-closeout, janitor-acts, test-ipc, review-run) did not use it, and no record says why. So nothing new is built. The existing loop is made the only route, and the three things that push an orchestrator off it are fixed.

Measure moved: top-tier tokens per build and lead turns per build. Check at the next census: every Claude-led build record opened after this merges names a Workflow run, and its lead turn count is under 20.

## Scope, pinned
1. **One route.** `skills/team-build/SKILL.md` drops the by-hand route for single-territory lanes (near line 342): one territory runs through the same Workflow. The work record gets a required line, `Workflow: <run id>` or `Workflow: none, <reason>`. The accept step refuses a record without that line. The census reports the line per build.
2. **A hung agent ends.** Records tie the Workflow to builders that sat on a prompt for 40 minutes to 3.5 hours with no timeout (linux-green, measure-truth, ledger-both-halves). Each agent call in the script gets a wall-clock limit; on expiry the territory returns a named failure to the script, which reports it and carries on with the other territories. If the Workflow API has no per-agent limit, say so in the record and rule the nearest mechanism that needs no new part.
3. **A run survives its session.** Runs died with the pane three times (decisions-current, rename-build, knowledge-counted). The script writes its state after each phase to one file beside the lane's work record (territory, phase, builder sha, reviewer verdict, open findings). Started again with the same arguments, it reads that file and skips what is done. This replaces the hand-read `startFrom` path; `startFrom` stays as the override.
4. **Three known defects** that forced hand work: the short-versus-full sha check, the relative-path setup failure, and the integrator brief that refuses when the seam review is on.
5. **Second-host suite inside the script.** Today the lead runs it by hand after the Workflow returns. It becomes the last phase: a mid-tier runner runs the sealed suite once on the named second host over ssh and the result goes into the returned value. One suite per machine at a time; none on Windows.
6. Tests for 1 to 5 in `build-loop-workflow.test.mjs` and the accept test file.

## Not in scope
- A Codex equivalent. The Workflow is Claude Code only; lane 40 (Codex-led) cost 196M tokens by hand. That is the next lane, opened when lane 62's census can count a Codex-led build, and it must reuse this lane's state file as the shared contract, not a host primitive.
- Spec red team, record opening, accept, merge: these stay with the orchestrator.
- Any new mechanism, flag or skill.

## Build shape
This lane is built through the Workflow it fixes, as it stands. Sonnet builds, Opus reviews, one red-team round on this spec at most. Worktree under `<repo>/.claude/worktrees/`. Focused tests on Windows, full suite once on Netcup and once on Hetzner at accept. Record the lane's own lead turns and Opus tokens in its work record: that is the first data point for the check above. Merge under the 9/26 grant. No release, no install.

Every execution brief carries: if any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Due on main: 10/2 3:00 PM America/New_York.
