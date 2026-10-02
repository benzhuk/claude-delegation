VERDICT: RE-PLAN

# Bearings — claude-delegation — 2026-09-26

## Scope

- Assessment window: 2026-09-25 10:35 to 2026-09-26 08:00 America/New_York.
- Goal revision: `docs/goals/card.md` at main `ac9c842` (card v5, last changed `fec9bc8` 09-24 09:49, sha256 `5e3df82d`). Its lines are GOAL, NOT, DONE and STOP. **It has no KILL line.**
- Reviewed by: Claude Code, a fresh Opus reviewer spawned by skills-fable. It led none of the builds. Everything it ran was read-only: `git show/log/diff/worktree list/branch` in the main checkout, reads of worktrees, the ledger and the scratch reports, and one `build-census.mjs` run from main whose output went only to `<scratch>/bearings-0926/lead-census.{md,json}`. It switched no branch, ran no suite, and made no Notion read and no ssh.
- Evidence boundary: the packet; the 09-25 assessment and lead response; main `ac9c842`; `origin/build/one-launch-1@05b9bcc`, `origin/build/decisions-actions-1@f82ecb4` and `origin/docs/lane-specs-0925@6683903`; the Windows ledger (untracked, local/unlinked); the lane-two worktree `orca/workspaces/claude-delegation/codex-fresh-1` (local/unlinked).
- Unknown or unavailable: the Netcup and Hetzner ledgers (whether skills-n sent a RESULT, whether skills-h ever ACKed); lane three's real state; a per-activity split of the lead's own tokens; any token figure for the hand-run baseline; seven-day rework for every build (the window is still open); the state of Ben's page.

## Evidence

| Observation | Evidence | Basis | What it supports | Limitation |
| --- | --- | --- | --- | --- |
| O1. The card on main has no KILL line. The packet's card text (a KILL line, "Sonnet builds, Opus reviews", no "led once from Claude and once from Codex") is card v2 `78cb46e` (sha `f5b5970b`). That is the card the lead's own worktree `gudgeon` still holds (branch integrate/0921). The card is read from cwd (`scripts/goal-card.mjs:211`, `hooks/lib/goal-context.mjs:9-12`) | sha256 of both files; `git show` | verified; the injection path is inference | The lead is being fed a retired card, and the packet's KILL question rests on it | I did not see the hook's injected text itself |
| O2. Lane one (four-read) was accepted at 21:58 on 9-25 (`5d8eccf`) and released in `ac9c842`: leadTurns 13, Opus 22.4M (partial), Sonnet 122.8M, 3.6 h from Opened to accepted, 2 gaps over 30 min | `ac9c842:docs/work/wr-2026-09-25-four-read.record.md` | verified | DONE shape on the Claude side: under 20 turns, mid-tier builds, high-tier reviews | No spec slice in the tokens; 48.9M of role tokens are "unassigned" |
| O3. Lane one's real ask-to-accepted time is 11.2 h. ASK at 10:47; ACK at 10:48 "waiting for Ben to clear the pane"; fresh-session ACK at 18:23; Opened 18:24; accepted 21:58. The read prints 3.6 h and "0 notes to skills-o" because its window starts at `Opened:` | `docs/ledger/2026-09-25.md:61-66`; record `Opened:` | verified | Hours and stalls leave out this build's largest stall, 7.6 h, which the previous RE-PLAN's fresh-session rule caused | — |
| O4. Lane four (one-launch, skills-n, Netcup) was **accepted at 19:48 on 9-25** (`55106db`) and pushed as `origin/build/one-launch-1@05b9bcc`: leadTurns 6, 1.3 h from Opened to accepted, Opus 10.5M, Sonnet 35.9M. The packet says "no ACK received, in flight". No Windows ledger contains a note from or to skills-n or skills-h | `git show origin/build/one-launch-1:docs/work/wr-2026-09-25-one-launch.record.md`; `grep skills-n docs/ledger` finds 0 | verified | Finished work sat unseen for about 12 h: lost or stalled at the handoff | Unknown whether a RESULT was sent and then dropped |
| O5. Lane two (Codex, skills-a): the record says `Status: owned` and the artifact is "X1 initial PARTIAL c05a497". The last file write was 18:34 on 9-25. The record is modified but uncommitted, 9 report files are untracked, and there is no origin branch. The lane also published its own bearings to Notion at 18:31 | `codex-fresh-1` git status and log; `publication-result.md` | verified (worktree); attributed (Notion) | The lane has been idle for about 13.5 h with work not pushed. It is not "in flight" | Codex session not read |
| O6. Lane three has no `build/fresh-walk-1` on origin and no skills-h note in the ledger | `git branch -r`; ledger grep | verified absence, Windows side only | No evidence that lane three started | Hetzner ledger not read |
| O7. Lead session 9c61c35a, from 10:35 on 9-25 to 07:48 on 9-26: 166 top-tier messages, leadTurns 35, **Fable 30.9M tokens** (cache-read 29.6M, about 178k per message). Its subagent files add Opus 4.8M and Sonnet 47.2M | `<scratch>/bearings-0926/lead-census.md` (my run) | verified (tool output) | The coordinating lead spent about as much top tier as the two accepted builds combined (32.9M) | Includes this review. Not split by activity |
| O8. The two capped scripts went from 1036 + 1072 = 2108 lines to 1084 + 1169 = 2253, which is +145 against a +150 cap. The spec (rule 2) took the new `four-read.mjs` (399 lines) out of the budget. Counted across all census scripts, net growth is +544. The previous prediction's "≤1,222" was an arithmetic error by the reviewer: the pair was already 2,097 lines at that point | `git show <rev>:<path> \| wc -l` at `fbd7cf6` and `ac9c842`; `docs/specs/2026-09-25-four-number-read.md` | verified | The budget was met only after the lead's own spec re-based it. The `build-census.mjs` diff is the `--from/--to` window only, so the freeze held | — |
| O9. Four-read outputs. Loop-gates: all four unavailable. Census-complete: 44.8M, 8.9 h, one 505-min gap, rework "unavailable (no range); 1 re-accept". Parity: 0.7 h, the rest unavailable. Hand-run baseline: 1.5 h, tokens unavailable | `ac9c842:docs/work/evidence/*.four-read.md` | verified | Last prediction: numbers or reasons MET; gap ≥7 h MET; no hand counts MET; ≥2 post-acceptance fix rounds NOT shown (it reads 1) | With no baseline tokens, DONE's "beats the hand-run build on all four" cannot be computed |
| O10. Four-read needed R1 5 rounds, R2 3 and seam 3. The Workflow returned rounds-exhausted and the lead ran rounds by hand. One-launch needed 3 seam rounds, its seam-fix role used 14.3M, and it was accepted with 2 tests failing "as at base" on Netcup | both records, `Observed`/`Log:` lines | verified (records) | Review loops dominate subagent cost. Main's suite is not green on Netcup | Windows reports 1662/1662 (attributed) |
| O11. `scripts/work-record.mjs` changed in 0.20.8, 0.20.9 and 0.20.10. `build-census.mjs` changed in 0.20.9 and 0.20.10. Each release's headline is acceptance or measurement | `git diff --stat 795c8e1..28a222c`, `28a222c..fbd7cf6`, `fbd7cf6..ac9c842` | verified | Three releases in a row on the acceptance/measurement record surface | — |
| O12. Live counts match the cleanup evidence: 18 worktrees, 21 local branches, 8 origin branches. The evidence says 43 worktrees were removed, 18 of them leaving empty directories under `orca/workspaces` (Permission denied). The janitor's prose said 39 while its own table said 43 | `git worktree list \| wc -l`, `git branch`; `6683903:docs/work/evidence/janitor/2026-09-26-cleanup-applied.md` | counts verified; removals attributed | The cleanup happened. The janitor report is self-inconsistent | The four-read worktrees are already stale again |
| O13. Three-wakes rule against the ledger. skills-o → fable (lane one): 3 (10:48, 18:23, 21:58). skills-a: 1 (18:23 ACK). skills-n and skills-h: 0 | ledger 09-25 and 09-26 | verified | The rule held where anything is visible. The wakes that are missing are the missing RESULTs (O4-O6) | Cross-host ledgers not read |
| O14. The lane-five ASK (07:07 on 9-26) allows "marker or from/to" windowing and dispatches a fifth lane while lanes two to four are unaccounted for | `docs/ledger/2026-09-26.md:3` | verified | Markers were ruled the wrong shape on 9-25. Dispatch is outpacing collection | — |
| O15. Ben on 9-26: "The goal was to run without me and optimize token use". The fresh-session rule needed his hands and was withdrawn | packet, owner direction (5) | attributed | A rule that needs Ben's hands fails this goal by construction | — |

## Reviewer assessment

1. **Significant progress?** Yes, but less than the packet claims. Overnight, two builds reached acceptance in DONE shape. Both came in under 20 lead turns, with Sonnet builders and Opus reviewers (O2, O4), and four numbers now print per build (O9). But only one of the five lanes reached main. One accepted build went unseen for 12 h (O4), one lane is idle with its work not pushed (O5), and one shows no sign of having started (O6). DONE is not met. "Nothing lost or stalled" fails (O3, O4, O5). "Beats the hand-run build on all four" cannot be computed, because the baseline has no token figure (O9).
2. **Sidelined?** Less than on 9-25. Lanes two to four are product work. The drift has moved from measurement to coordination: the lead's window went to two releases, a cleanup, a reader fix and a sixth spec while three lanes were unaccounted for (O7, O14).
3. **Castle of patches?** In measurement it is contained: the freeze held and the budget held as re-based (O8). The patching has moved into the review loop, though: 11 rounds for about 545 runtime lines, then rounds-exhausted, then rounds run by hand (O10). The read also starts at `Opened:`, a field the lead sets, so the tool built to show stalls cannot see the largest stall of the window (O3).
4. **Simplest solution?** Not for coordination. The current setup is five lanes on three hosts, with results expected as cross-host notes that never arrived, run by a top-tier lead whose window spend equals the two accepted builds combined (O7). The simplest collection path already exists: an accepted record pushed to origin. O4 is exactly that, and the lead did not read it.

**Where the lead is fooling itself.**
- "In flight, no RESULT yet" is false for lane four and misleading for lane two (O4, O5).
- Lead cost is now measured, and it is no longer an unknown: 35 turns, 166 top-tier messages and 30.9M in 21 h (O7). Ben's worry that four lanes cost four times the tokens is aimed at the wrong thing. The lanes are the cheap part. The expensive part is the Fable lead re-reading about 178k of context on every message it spends coordinating them.
- "3.6 h ask to accepted" is 11.2 h measured from the ask (O3).
- "+145 of +150" holds only because the lead's spec moved the 399-line new file out of the budget (O8).
- The packet quotes a retired card that comes from the lead's stale worktree (O1).
- The previous reviewer's fresh-session rule cost 7.6 h and needed Ben's hands (O3, O15).

**KILL ruling.** No KILL line is in force. Card v5 retired it on 9-24, and `docs/GOALS.md:29` makes killing a direction Ben's call. The question comes from card v2 in the lead's worktree (O1). If the line were in force, it would be **met**. All three releases changed `work-record.mjs`, the last two changed `build-census.mjs`, and every headline was acceptance or measurement (O11). "Three components through one plugin" does not hold up. The brake that does govern is STOP. The measurement lane's previous RE-PLAN was partly effective (O8, O9), and I am not re-planning it, so STOP does not fire. The lane is still one RE-PLAN away from stopping, and the release streak belongs on Ben's page as a fact.

- Decision: `RE-PLAN`. The scope is lane coordination: dispatch and collection across hosts, and the lead's role in both. It does not cover the measurement lane or the goal.
- Missing evidence that could change it:
  - The Netcup and Hetzner ledgers. If skills-n sent a RESULT that the flusher dropped, and skills-h is working, this is a delivery bug and the decision becomes CONTINUE with a bug fix.
  - A per-activity split of the lead's 30.9M. If more than two thirds was one-off release or cleanup work, the coordination-cost claim weakens.
  - Whether one-launch is already on Ben's page.
- Next action: before any new dispatch, lane five included, run one read-only lane-status sweep from durable sources:
  - Sources: origin branches plus their records' `Status:` and `Log:` lines, and each host's ledger.
  - Output: a five-row table of accepted, blocked, idle or not started.
  - Then act on it: post `build/one-launch-1@55106db` as Ben's merge item, and send lane two one resume-or-BLOCKED ask.
  - Move the lead's pane to a checkout of current main (O1).
- Prediction, checked at the next bearings and no later than 2026-09-27 08:00 America/New_York. Two conditions:
  - The lead's own census, `build-census.mjs --lead 9c61c35a… --from 2026-09-26T12:00Z --to 2026-09-27T12:00Z`, shows at most 20M top-tier tokens.
  - No origin branch with an accepted record is missing from both main and Ben's page for more than 4 h.
  - It is falsified if either condition fails.

## Ranked failures or gaps

| Priority | Failure or gap | Evidence | Impact | Confidence or unknown | Why this rank |
| --- | --- | --- | --- | --- | --- |
| 1 | Accepted or idle lane work is invisible to the lead, because results travel as cross-host notes that did not arrive | O4, O5, O6, O13 | Work lost or stalled; "usable components sooner" fails at the last step | High on facts; the cause (not sent or dropped) is unknown | It is a named measure and the owner's live complaint. Fixing collection also cuts gap 2 |
| 2 | The coordinating lead is the largest top-tier line, and no instrument owns it | O7 | Top-tier tokens per build roughly doubled | High (tool output); the split is unknown | Mostly fixed by taking the lead off the collect path |
| 3 | The lead is steered by a retired card; the bearings check and goal hook read a stale repo | O1 | Goal drift; the wrong KILL question | High | Cheap, and handled in the same action |
| 4 | Four-read's clock starts at `Opened:`, and rework is "unavailable (no range)" for 3 of 4 builds | O3, O9 | Hours and stall numbers flatter the builds | High | Measurement backlog; not re-planned |
| 5 | Review-round inflation, and a Netcup suite accepted while not green | O10 | Tokens, hours, quality risk | Medium | Comes after collection |
| 6 | DONE's comparison with the baseline cannot be computed | O9 | DONE cannot be declared as written | High | Owner decision: re-baseline or rule on it |
| 7 | Cleanup left 18 empty directories, and the janitor report contradicts itself | O12 | Minor | High | Lane five's territory |

- Selected next build: collect from git. It is a small addition to existing tooling: at most 60 runtime lines, no hook, no scheduler.
  - It lists origin branches whose record says `Status: accepted` and whose artifact is not in main.
  - The lead runs it at each merge tick, and the bearings packet uses it.
  - Team-build gains one rule: a lane's acceptance writes its own merge item to Ben's decisions page through the existing decisions skill, so the lead is off the collect path. The design is the lead's.
- Selection rationale: gap 1 is the only gap that both loses finished work and costs top-tier turns (gap 2). Records on origin already hold the answer (O4), so this reads an existing source and adds no mechanism.
- Independently authorized work continuing in parallel:
  - Lane four is done; only the merge item is left, for Ben's tick.
  - The `f82ecb4` reader fix: its merge item.
  - Lane two continues on its own authority once it pushes and sends RESULT or BLOCKED; no lead turns go to it before that.
  - Lane three continues only if the Hetzner ledger shows it started. If it never started, hold it until the collect build lands.
  - Lane five (janitor-fed) continues if skills-o confirms: it feeds an existing unfed mechanism and Ben asked for it. It must use `--from/--to`, not markers (O14). The 18 empty directories are removed only on Ben's tick.

## Lead response

Left for the lead.

## Re-plan record

Left for the lead.

## Publication

Left for the lead.

## Completion receipt inputs

Left for the lead.
