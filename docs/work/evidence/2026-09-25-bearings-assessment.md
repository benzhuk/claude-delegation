DECISION: RE-PLAN

# Bearings — claude-delegation — 2026-09-25

## Scope

- Assessment window: 2026-09-24 09:49 (card v5, `fec9bc8`) to 2026-09-25 10:27 America/New_York.
- Goal revision: `docs/goals/card.md` and `docs/GOALS.md` at `28a222c` (card last changed at `fec9bc8`). Card v5 has no KILL line.
- Reviewed by: Claude Code, a fresh Opus reviewer spawned by skills-fable. It led none of the three builds. It ran read-only: `git show`, `git log`, `git grep`, the bearings `check`, and `build-census.mjs` from main writing only to scratch. No branch was checked out, no suite or build ran, and no tracked file was touched.
- Evidence boundary: the Sonnet packet, the lead's addendum, main at `28a222c`, `origin/build/census-complete-1@286873f` and `origin/build/codex-parity-1@72cadff`. The local ledger and notes are untracked, so they are local/unlinked evidence.
- Unknown or unavailable evidence: the hand-run baseline's token count, wall clock and definition of "turn"; seven-day rework; the Codex lead's turn count and builder model tier; installed or live Codex startup; the Mac host; the result of the dry merge of both branches; and whether the addendum's Notion ticks are real (I did not read Notion).

## Evidence

| Observation | Evidence | Basis | What it supports | Limitation |
| --- | --- | --- | --- | --- |
| O1. Claude-led loop-gates build: accepted 21:53 on 9-24, re-accepted at `693cd94` at 23:02 after fix round 2, then shipped as 0.20.8 | `28a222c:docs/work/wr-2026-09-24-loop-gates.record.md` (two accepted `Log:` lines); `git log` main | directly verified | The Claude half ran spec to accepted through the plugin | Its lead-turn figure of 7 was hand-counted (O3) |
| O2. Loop-gates builders were Sonnet and its reviewers were Opus | same record, "Tokens by model" | directly verified | Mid-tier builds and high-tier reviews on the Claude half | The lead's own tokens are not in that census |
| O3. The census spec says "7 turns" was hand-counted and that "a census that omits the lead cannot prove top-tier tokens per build" | `286873f:docs/specs/2026-09-24-census-complete.md` | directly verified | By the project's own standard, lead-turn and token evidence for loop-gates is unproven | — |
| O4. The census build's script numbers were leadTurns 5 and 8.82 h at the first acceptance (08:06), then leadTurns 32 and 10.86 h at the re-acceptance (10:10). Unassigned tokens were 19.8M | `286873f:docs/work/wr-2026-09-25-census-complete.record.md` | directly verified | The census now produces numbers. The final ones break the under-20 lead-turn target | The lead attributes the 32 turns to parity reviews run in the same pane (ledger, 10:12) |
| O5. Its window, 03:11Z to 14:02Z (23:11 to 10:02 NY), contains a freeze from 23:45 to 07:00 | record window; ledger 09:26 FYI; note `~/.claude/knowledge/_inbox/2026-09-25-windows-orca-panes-froze-overnight-os-awake.md` exists | window: verified. Stall: attributed (lead, Windows log, grep of the Orca fork's pty-consumer) | Work stalled for about 7.25 h and nothing in the plugin noticed | The cause is not independently reproduced |
| O6. Opus territory and seam reviews approved census code at `1274659`. The Codex reviewer then reproduced two MAJOR defects: an unreadable directory counts as zero, and a stray timestamp bypasses the freshness check. The lead accepted both as real. Two more fix rounds followed, the second after NEEDS_FIXES (4) | ledger 9-25 09:16 and 09:20; record "Observed" paragraph | verified (branch record); ledger local | Rework after acceptance in both Claude-led builds; a single-provider review missed real defects | One build is a small sample |
| O7. `build-census.mjs` grew 452 → 884 (`286873f`) → 1025 lines (`72cadff`). `work-record.mjs` grew 557 → 745 (`28a222c`) → 1068/1072. `docs/census.md` grew 94 → 257 | `git show <rev>:<path> \| wc -l` | directly verified | The measurement layer grew about 1,100 runtime lines in roughly 14 h over six or more review and fix rounds | Line counts do not measure complexity by themselves |
| O8. No non-test script measures rework after acceptance or work lost or stalled. `work-census.mjs` covers opened→accepted and review rounds | `git grep -iE 'rework\|stall\|fix-after\|recurr' 72cadff -- scripts hooks` (hits are installer comments only) | directly verified | Two of the four measures have no instrument. Hours has one, tokens has one for Claude only | — |
| O9. The measures table's baselines are 152 lead turns for tokens (no token figure), 3 h 40 m and 50 min for hours, a trailer-class count across 87 commits for rework, and note latencies for stalls. The 152-turn figure has no source record | `28a222c:docs/GOALS.md:15-18`; `git grep '\b152\b'` finds only GOALS and history | directly verified | Only "hours ask to accepted" has a comparable baseline | — |
| O10. Codex-led parity build: accepted at `dad15f8` on its branch, 44 m 22 s from admission to acceptance. Its record says "Census: skipped"; the observed-usage file reads `VERDICT: UNSUPPORTED`; it states "No installed/live startup delivery... is claimed" | `72cadff:docs/work/wr-2026-09-25-codex-parity.record.md`, `evidence/codex-parity-delivery.md`, `codex-parity-observed-usage.md` | directly verified | The Codex half ran with a mixed handoff: Codex built it, Claude reviewed it, and it built on the Claude census work (base `8cebeda`) | Source-only; the lead's turn count is unsupported |
| O11. The Codex builder's model is unrecorded ("model attribution is unknown") | `72cadff:docs/work/evidence/codex-parity-p2-builder.md:16-17` | directly verified | "Mid tier builds" on the Codex half is unproven | — |
| O12. A parity test used the Codex lead's real session id and wrote its live continuation store. The continuation was suspended and rebinding returned EPISODE_INACTIVE | parity delivery evidence | attributed (record) | A state-loss incident on the lead's own session | The work itself was not lost |
| O13. The Fable lead session over the window (09:50 9-24 to 10:22 9-25): 119 assistant turns, about 21.0M input-side tokens, 124k output. Over the whole session (9-20 to 9-25): 1395 turns, 302.6M input-side | `build-census.mjs` at `28a222c`, run with `--marker 2026-09-24T13:50`; output in scratch `bearings/fable-census-window.md` | directly verified (tool output) | The largest top-tier line (spec writing, verification, coordination) is outside every build census, even though the measure says "all roles" | Not split per build |
| O14. 0.20.7 bumped `.claude-plugin` but not `.codex-plugin`. `scripts/native-package.test.mjs:14` stayed red on main from 09:50 until `a874db9` at 22:17, and loop-gates carried it as "pre-existing". There is no release script | `git diff --stat faccdd6..795c8e1`; `git show a874db9`; `git ls-tree 28a222c scripts` | directly verified | A release defect that a test caught but no release step ran | — |
| O15. The three releases hit different code but one plane, the harness's own control surface: 0.20.6 `skills/decisions`, 0.20.7 `scripts/goal-card.mjs`, 0.20.8 `work-record.mjs`/bearings/team-build. `bearings-state check` returns `due` (no receipt for this goal) | three `git diff --stat` ranges; check run at 10:26 | directly verified | GOALS.md asks for a fresh check "at every release"; 0.20.7 and 0.20.8 shipped without an independent one | — |
| O16. "Third fix release in a row on one surface" was a KILL line in an earlier card and survives only in the fixture `skills/decisions/scripts/fixtures/goals-src/docs/goals/card.md:4`. Card v5 dropped it | `git grep` at `72cadff`; `fec9bc8^:docs/goals/card.md` | directly verified | The current STOP and NOT lines do not govern release streaks | — |
| O17. Ben's 9-24 and 9-25 ticks (Hetzner stays Claude, Mac deferred, 0.20.7 on three hosts, 0.20.8 on three hosts) | addendum 1-2; ledger 09:48 for 0.20.8 | attributed (lead) | Owner authority for the merges and installs | Notion not re-read; the GOALS "installed nowhere" line is stale |
| O18. Parity added one shared `hooks/lib/goal-context.mjs` used by both hosts, with no new event, store or scheduler | `git diff --stat 28a222c 72cadff`; delivery doc | verified (stat) plus attributed (behaviour) | Follows NOT "host-specific primitive as the shared contract" | — |

## Reviewer assessment

1. **Significant progress?** Yes, in structure. For the first time both DONE-shaped runs exist: a Claude-led build merged as 0.20.8 (O1, O2) and a Codex-led build with a cross-provider handoff accepted on a branch (O10). The GOALS status "a Codex-led build through the plugin has not been run end to end" is now out of date. DONE is not met (item by item below), and the window shows no measured improvement on any of the four measures against a comparable baseline (O9).
2. **Sidelined on a too-specific sub-project?** Partly. The Codex host work is on-goal (O18). The drift is into measuring itself: in about 24 h, two of three builds and most of the review rounds went to the census and acceptance gates (O6, O7). The census still answers one measure, for one host, without the top-tier lead (O8, O10, O13). The previous RE-PLAN asked for useful delivery. All three builds were the plugin building its own governance. DONE permits that, but it is self-referential.
3. **Castle of patches?** The census is becoming one. Each fix round was a real defect: hardlink and inode de-duplication, EACCES handling that fails closed, marker windowing, `excludedByWindow`, `leadLastMessageAt`, a pin to the first line only. All of them harden a transcript scraper against edge cases. The design problem they work around stays open: persistent lead panes span several builds, so a substring marker cannot attribute tokens (O4's 32 turns and 19.8M unassigned). Runtime grew about 1,100 lines (O7). The simplest thing that measures the four numbers would sum each build's own files and read git and records for rework and stalls.
4. **Still building toward the simplest solution?** The host architecture is: shared modules and thin hooks (O18). The measurement layer is not: it grows while three of the four DONE comparisons still cannot be computed (O8, O9, O13).

**DONE, item by item:**
- Led once from Claude: YES. Loop-gates is merged (O1); census-complete is accepted on its branch.
- Led once from Codex with a mixed handoff: YES, source only, not live (O10).
- Lead under 20 turns: Claude met it only by hand count (7) or at the first acceptance (5, script). The final script number is 32 (O3, O4). Codex is UNSUPPORTED.
- Mid tier builds: Claude YES (O2). Codex UNKNOWN (O11).
- High tier reviews: YES on both. They were cross-provider on census and Opus on parity.
- Nothing lost or stalled: NO. The 7.25 h freeze counts. The DONE line and "Nothing stalls silently" describe the work, not who is to blame. The host owning the cause changes who fixes it, not whether it happened, and nothing detected it (O5). O12 is a second state incident. Loop-gates had no known stall.
- Census beats the hand-run build on all four measures: NO, and it cannot be computed. Only hours has a comparable baseline: loop-gates at 1 h 40 m and parity at 44 m beat the rename-build's 3 h 40 m. Census-complete's raw 10.86 h does not; excluding the stall it is about 1.6 h to first acceptance and 3.7 h to re-acceptance (inference). Tokens has a baseline in turns only. Rework and stall have no per-build baseline and no script (O8, O9).

**Three releases in a row on one surface:** not one code surface. It is one plane: the harness's control surface (O15). The retired KILL line would be judgment-dependent here. Card v5's STOP and NOT lines do not speak to it (O16). The next merge (census plus parity) would be a fourth release on that plane, and a second in a row touching `work-record.mjs`.

- Decision: `RE-PLAN`. It covers the DONE-measurement lane only, not the host work or the goal.
- Missing evidence that could change the decision:
  - the 152-turn hand-run transcript. If it still exists, the token baseline becomes computable.
  - the dry-merge result.
  - Ben's view on whether host stalls count toward DONE.
- Next action: freeze growth of `build-census.mjs`. Build a four-number DONE read on the existing sources, with a net runtime budget of +150 lines or less across census scripts. The design choice is the lead's.
  - **Tokens:** every Fable and Opus file of the build's own sessions, including the spec writer's slice. Require one fresh lead session per build instead of marker windowing.
  - **Hours:** `work-census` Opened → first accepted, plus the largest gap between messages, so a stall is visible.
  - **Rework:** fix commits and re-accepted `Log:` lines on the artifact's files within 7 days, from git and the records.
  - **Stalled:** any gap over 30 min in a build transcript, plus admitted ids with no result.
  - Then run it once on the three builds and on the hand-run baseline, or record that baseline as unavailable.
- Prediction: by the next bearings run (at most 24 h, or at the next release), the read reports numbers for all four measures, or a named reason ("unsupported"), for loop-gates, census-complete and parity. Census-complete shows a gap of at least 7 h and at least 2 post-acceptance fix rounds. None of the three Claude-side values needs a hand count. `build-census.mjs` plus `work-record.mjs` stays at or under 1,222 lines on the merged main (1,072 + 150). This is falsified if any Claude-side value is still hand-counted or the line budget is exceeded.

## Ranked failures or gaps

| Priority | Failure or gap | Evidence | Impact | Confidence or unknown | Why this rank |
| --- | --- | --- | --- | --- | --- |
| 1 | The DONE census clause cannot be computed, and the census keeps being patched | O7, O8, O9, O13, O4 | DONE cannot be declared, and "the next census checks it" has no instrument for 2 of the 4 measures | High; unknown whether the baseline transcript still exists | Every other gap is judged through these numbers |
| 2 | Rework after acceptance in both Claude builds; a single-provider review missed MAJOR defects | O1, O6 | Quality and rework measure; the acceptance gate fires before the decisive review | High on facts; the cause is inference | Needs item 1's rework count before it can be tuned |
| 3 | A silent 7.25 h host stall; nothing detects it | O5 | Lost-or-stalled measure; distorts hours | Stall attributed, cause attributed | Item 1's gap metric makes it visible; the fix lies in the host |
| 4 | Codex half is source-only; lead turns and builder tier unknown | O10, O11, O12 | Codex clause of DONE is partial | High | Needs an installed pilot, which is separate authority |
| 5 | Releases without an independent check, and a manifest-drift test left red on main | O14, O15 | Rework; a rule with no step that runs it | High | Small; mechanical |

- Selected next build: the four-number DONE read under the line budget (next action above).
- Selection rationale: until tokens, hours, rework and stall are computed the same way for every build, no change can show that it "improves one and worsens none". Gaps 2, 3 and 5 are also unmeasurable without it.
- Independently authorized work continuing in parallel:
  - mechanical verification and dry merge of `286873f` and `72cadff`, then Ben's merge item. That merge ships the census as it stands; the budget applies from that point.
  - research on the Orca pty flow control, in Ben's fork, on his word.
  - the installed Codex pilot, when authorized.
  - Mac login, which is Ben's call.

## Lead response

[Reserved for skills-fable, in its own words.]

## Re-plan record

- Previous unresolved RE-PLAN concern: `docs/work/evidence/2026-09-24-simplicity-bearings.md` (useful end-to-end delivery fragmented). It was not independent under card v5.
- This response's result: partly improved. Two end-to-end builds closed. Measurement became the new concern.
- Reassessment required: no. This is the first independent RE-PLAN under card v5. Under the STOP line, another RE-PLAN on the measurement lane stops that lane.

## Publication

- Notion target: Ben's decisions page (id `3e1da11277a18174bccfea187d5c3972`, per the addendum).
- Publication status: PUBLISHED
- Published at: https://www.notion.so/3e1da11277a18174bccfea187d5c3972
- If pending: the reviewer does not publish; the lead owns publication.

## Completion receipt inputs

- Assessment report path: `C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/9c61c35a-82dd-4aef-8eca-c99bb0e72e31/scratchpad/bearings/assessment.md`
- Lead response path: pending, from the lead
- Verified publication URL: pending
- Release/KILL condition considered: STOP line of card v5 (`fec9bc8`); retired KILL "third fix release in a row on one surface" (O16)
