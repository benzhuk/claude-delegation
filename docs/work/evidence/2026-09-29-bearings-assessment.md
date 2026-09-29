DECISION: RE-PLAN

# Bearings — claude-delegation — 2026-09-29

## Scope

- Assessment window: 2026-09-28 3:58 PM to 2026-09-29 3:17 PM New York (the 9/28 bearings completion to the packet's assessment time). Written 9/29 about 3:40 PM New York.
- Goal revision: `docs/goals/card.md` and `docs/GOALS.md` at origin/main 0b517ba. GOALS.md last changed at 14174e8, 9/28 3:54 PM New York, before the window. Nothing in the window changed the measures or the card.
- Reviewed by: a fresh Opus 5.5 reviewer on Windows (ben-desktop), independent bearings role. It led no lane and ran no tests.
- Evidence boundary: the lead's packet, the runner's prediction checks, the 9/28 assessment, the 0.20.17 bearings template (highest cached version) and a read-only detached worktree at 0b517ba. The worktree's origin/main ref has since moved to c42ed97 (9/29 3:18 PM New York, three docs commits: janitor record-mode evidence and triage item rev 4). No command was denied in this review.
- Unknown or unavailable evidence:
  - Fable lead sessions other than 9c61c35a in the window. Part (b) read one session only, so the true total is at least 72.7M, not exactly that.
  - Stall nudges in the window: "unavailable (ledger dir unreadable)".
  - Codex-led lanes' spec slice, peer-review cost and stall classification: all UNSUPPORTED or unread (codex-rows.md).
  - Seven-day rework for any lane closed in the window: the windows run to 10/5 or later.
  - The Notion decisions page and Ben's 9/29 comment text. Only the lead's summary was available.
  - Which plugin version each host ran during the window. Only this desktop's cache was listed; its highest is 0.20.17.
  - The Codex Lane 37 bearings prediction (9/28 6:32 PM New York) was not checked by anyone.

## Evidence

| Observation | Evidence | Basis | What it supports | Limitation |
| --- | --- | --- | --- | --- |
| O1. 17 first-parent merges reached main in the window, from c56a1ae (9/28 4:35 PM) to 340c900 (9/29 3:28 AM) | `git log --first-parent --merges 9b2c3ae..HEAD` in the worktree, count 17 | directly verified | A lot of accepted work shipped | Merge count is not value |
| O2. All 17 window records are Status closed. Spot-checked: fable-wave and review-run both read `Status: closed`, with Artifact e7f5f25 and 643a862, matching the packet | `docs/work/wr-2026-09-28-fable-wave.record.md:4,7`; `docs/work/wr-2026-09-29-review-run.record.md:4,7` at 0b517ba | directly verified | Records close cleanly and the packet is accurate | Two of 17 checked |
| O3. Prediction (a) failed: 61 merged origin branches besides main against a bound of 5. The 9/28 count was 44. The sweep that would delete them needed Ben's tick, which came only on 9/29, and has not run | runner report lines 20-84; `docs/decisions/waiting/sweep-lane-36.md` "nothing is deleted without your tick" | attributed report for the count; directly verified for the gate text | Lane 36 was built and closed, but its sweep was gated on Ben. My 9/28 prediction assumed it would run unattended. The miss is mostly about the gate, and partly real: nothing deletes as lanes close, so the count grew by 17, one per merge | Fetch ran without --prune |
| O4. Prediction (b) failed: 72,687,068 claude-fable-5-1 tokens for session 9c61c35a from 9/28 3:00 PM to 9/29 3:00 PM, against a bound of 65M. 97.79 percent is cache reads. 44 of 91 lead turns were wake-opened and carried 47.0 percent of the tokens. Lead turns stop at 4:38 AM on 9/29 | runner report lines 86-112 | attributed report | The named concern worsened: the prior window was 65.1M. The 9/28 conditional ("if the next window misses again without a further fall, the scope goes back to Ben's page") has fired | One session only. The two windows differ by 7 hours of clock |
| O5. Prediction (c) passed: lanes 34, 36, 37 and 38 are closed | runner report lines 114-121 | attributed report | The four-lead bundle delivered | none |
| O6. Fable-wave (lane 51) built only a measurement. It found coalescable RESULT wakes of about 1.5 percent and chose NO-BUILD for batching. Most wakes are ASKs: 10 of 11 from skills-a asking for a reviewer spawn | `docs/work/wr-2026-09-28-fable-wave.record.md:17-20` | directly verified | The 9/28 four-read's "one change next" (stop waking per note) was measured and correctly declined. The real wake source is relay ASKs | Split read covers 9/28 3:00 to 9:27 PM only |
| O7. Review-run (lane 57's predecessor, closed 3:29 AM 9/29) removes the Fable relay for reviewer spawns. The plugin version on main is still 0.20.17. Release 0.20.18 was ticked by Ben on 9/29 and is not cut | `.claude-plugin/plugin.json:5` at 0b517ba; runner and packet on the release item | directly verified for the version; attributed for the tick | The change aimed at O4's cause has shipped to main but runs nowhere. Its effect cannot show until it is installed | Host installs not read |
| O8. The four-read's DONE section and its Opus verdict disagree. The section says "Led once from Codex with a mixed handoff: not yet". The verdict says partly met by lane 48, because the Codex census is PARTIAL | `docs/reports/census-0928/four-read.md` DONE section (S5) and "DONE, part by part" | directly verified | DONE is closer than on 9/28: Claude-led and under-20-turn parts are met. The Codex half still cannot be scored with numbers | none |
| O9. Codex rows are now COUNTED. L48's 10,726,282 graph-only tokens appear in its four-read.json, produced by `four-read.mjs` with native exit 0 at source sha 4e36981 | `docs/reports/census-0928/codex-rows.md`; `docs/reports/census-0928/codex-evidence/final-main-4e36981-001/L48/four-read.json` | directly verified | Codex lanes now have a native token and turn read, which O11 of 9/28 lacked | No spec slice; stall classification UNSUPPORTED |
| O10. The owner input path is blocked again. `publish` exits 3 on pending owner input. The one-shot pickup on this desktop returns NEEDS_RECONCILIATION on a round 1 receipt captured 9/26 7:13 AM. The skill forbids an agent to migrate legacy receipts. Ben's ticks were acted on by hand | `skills/decisions/SKILL.md:200-201,226-228`; `skills/decisions/scripts/decisions-render-publish.mjs` near the "owner input pending" throw; `SCRATCH/pickup-out.json` status and captureReadAt | directly verified for the code, rule and output; attributed for the hand action | Lane 34 was the third repair of the pickup. The fourth failure arrived within a day of it | skills-n's round 5 on Netcup not read |
| O11. The janitor timer ran at 6:01 AM on 9/29 in record-only mode. It listed 16 SAFE worktrees and 18 SAFE branches and removed none. drift.md on origin/main shows 53 worktrees and 73 branches, against 20 and 29 on 9/26 | `C:/Users/benzh/.agents/janitor/last-run.log`; `origin/main:docs/work/evidence/janitor/drift.md` last three lines | directly verified | Cleanup has a schedule but no action, so worktrees nearly tripled since Ben's last sweep | Disk use unknown |
| O12. Two lanes sit on branches only: lane 57 test-ipc (delivered, fix round 1) and lane 39 notion-writing (owned, revised after 14 red-team findings) | packet "In-flight on branches only" | attributed report | Work is not stalled on the record, but it is not accepted either | none |

## Reviewer assessment

1. **Have we made significant progress toward the goal?** Yes on delivery, no on the goal's measures. Seventeen lanes merged and closed in under a day (O1, O2), the bundle delivered (O5), and Codex lanes now have a counted native read (O9). DONE moved: the Claude-led and under-20-turn parts are met, and the Codex half is partly met (O8). The measures did not improve. The Fable lead cost rose (O4), cleanup went backwards (O3, O11), and the work-lost clause has no reading for the Codex half.
2. **Have we been sidelined on a too-specific sub-project?** Partly. The census and four-read tooling took at least five of the 17 lanes (census-0928, census-completeness, four-read-json, codex-counted, codex-clock). That tooling is the card's measurement, so it earns its place. But measurement now outruns deployment: review-run, the change aimed at O4's cause, is on main and not installed (O7).
3. **Have we spent time on a castle of patches?** Yes, in one place. The owner input path failed again one day after lane 34's redesign (O10). This is the fourth break on the same mechanism (9/27 stuck pickup, 9/28 dirty checkout binding, lane 34, now a legacy receipt no agent may move). Each fix added a state or a refusal. Elsewhere the work was disciplined: fable-wave measured before building and declined a build it could not justify (O6).
4. **Are we still building toward the simplest solution?** Mostly, but the loop is open at the install step. The simplest route to the aim is build, install, measure. Today builds land in minutes, installs wait for a release tick, and the next census reads a plugin that does not contain the change. The card forbids "a new mechanism while an existing one is unfed or unmeasured". Seventeen merges against zero installs is that case at the release level.

- Decision: `RE-PLAN`.
  - **What changed since the last one.** The last RE-PLAN was 9/25. Since then 9/28 was CONTINUE, so this is not a second RE-PLAN in a row and STOP does not fire on the project. The 9/28 CONTINUE carried one condition, and it fired: the lead Fable cost rose from 65.1M to at least 72.7M. By that condition, the lead-coordination scope goes back to Ben's page as options.
  - **Did the named concern improve?** No. The 9/25 concern was that measurement did not exist. It now exists and is good. The 9/28 concern was lead cost, and it got worse. Cleanup, the 9/28 priority 1, also got worse on origin.
  - **The plan change.** Stop opening new lanes until 0.20.18 is installed and one census window has read it. Finish in-flight lanes 57 and 39 only.
- Missing evidence that could change the decision:
  - Other Fable lead sessions in the window. More would deepen the miss.
  - Host plugin versions during the window. If review-run was somehow live, O4 is a failure of the change, not of deployment.
  - The Netcup round 5 state, which could show the pickup is fine for the registered host and broken only here.
- Next action: cut release 0.20.18 from main, carrying review-run, and install it on all four hosts, per Ben's 9/29 tick. Measure it moves: top-tier tokens per build, read as claude-fable-5-1 wake-opened turns and their token share in the next 24-hour lead census.
- Prediction: see "Prediction" below.

## Ranked failures or gaps

| Priority | Failure or gap | Evidence | Impact | Confidence or unknown | Why this rank |
| --- | --- | --- | --- | --- | --- |
| 1 | Shipped changes do not reach the hosts, so no measure can move. Main holds 17 merges on 0.20.17, including review-run, which targets the largest wake source | O4, O6, O7 | Top-tier tokens per build, the first measure. Every census reads the old plugin | High on the version. Host states unknown | It explains why the named concern did not improve, and Ben has already ticked the fix |
| 2 | Lead Fable cost is at least 72.7M a day, up from 65.1M. Wake-opened turns carry 47 percent | O4 | The aim's first measure | High for one session. Other sessions unknown | The 9/28 condition fired. It goes to Ben's page as options |
| 3 | The owner input path breaks repeatedly. A legacy receipt now blocks every publish on this desktop | O10 | Work stalled, and decisions reach Ben by hand | High on the output. Netcup state unknown | Fourth break on one mechanism. It needs a redesign from the aim, not a fifth fix |
| 4 | Cleanup acts only on Ben's tick. 61 merged origin branches and 53 desktop worktrees | O3, O11 | Work lost or stalled through disk and inode pressure | High | Ben has ticked the sweep. It is running work, not a plan |
| 5 | The Codex half of DONE cannot be scored: no spec slice and no stall classification | O8, O9 | The two-host baseline | Medium | Real, but it moved forward this window |

- Selected next build: no new build. The action is release 0.20.18 and its install on all four hosts.
- Selection rationale: priority 1 is the reason priority 2 did not move. Review-run removes the relay ASKs that fable-wave named as the main wake source, but it runs nowhere. Installing it is the cheapest change that can move the first measure, and Ben has already authorized it.
- Independently authorized work continuing in parallel, kept distinct:
  - **Lane 36 sweep.** skills-h runs it now on Ben's 9/29 tick. It moves priority 4, and the 9/28 prediction (a) re-checks against it.
  - **Pickup reconciliation.** skills-n, the registered pickup host, handles the round 1 receipt. Nobody on this desktop migrates it, per the skill.
  - **Lead-coordination scope.** It goes to Ben's page as options, with 72.7M and the 47 percent wake share as the reading. This is the 9/28 condition, not a new lane.
  - **Knowledge triage item rev 4.** It waits for Ben's word on the rewritten item.
  - **Lanes 57 and 39** finish review and merge under the standing grant.
  - **Held:** any new lane, including a fifth pickup repair, until the 0.20.18 census reads.

## Prediction

- Claim: in the 24 hours after 0.20.18 is installed on ben-desktop, the Fable lead session reads at most 20 wake-opened turns. Its claude-fable-5-1 total is at most 65M. If 0.20.18 is not installed on ben-desktop by 2026-09-30 3:00 PM New York, record the prediction as failed on deployment, not as untestable.
- Check at 2026-10-01 3:00 PM New York, from a fresh detached worktree of origin/main, for each Fable lead session on ben-desktop, with the window starting at the install time:

```
node scripts/build-census.mjs --lead <each Fable lead .jsonl> --from <install time, UTC> --to <install time + 24h, UTC> --json
```

- Read `lead.windowByModel["claude-fable-5-1"]` summed over its four columns, and the wakeTurns line. Both bounds must hold, summed over every Fable lead session.

## Lead response

Pending. The lead writes it in its own words.

## Re-plan record

- Previous unresolved RE-PLAN concern: lead coordination cost, RE-PLAN on 9/26 and 9/27, resolved by Ben's option (b) on 9/27. The 9/28 CONTINUE made one more window the test.
- This response's result: the test failed. Cost rose from 65.1M to at least 72.7M, and the change aimed at its cause was never installed.
- Reassessment required: no, because this is the first RE-PLAN since the 9/28 CONTINUE. A RE-PLAN at the next bearings would be the second in a row and would stop the lane.

## Publication

- Notion target: the decisions page, published by the lead.
- Publication status: `PENDING`
- Published at: pending
- If pending: the reviewer does not publish. The desktop publish path currently exits 3 (O10).

## Completion receipt inputs

- Assessment report path: C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/9c61c35a-82dd-4aef-8eca-c99bb0e72e31/scratchpad/bearings-0929-assessment.md
- Lead response path: pending
- Verified publication URL: pending
- Release/KILL condition considered: the card's STOP line (not fired, since the last decision was CONTINUE) and the 9/28 conditional (fired; lead-coordination scope goes to Ben's page).
