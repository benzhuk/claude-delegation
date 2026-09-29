# Census 2026-09-28: the four-number read across lanes closed 2026-09-28 NY or later

Lane 50 (measurement only). Spec: `docs/work/wr-2026-09-28-census-0928.record.md` S1-S5. This
report does S1-S5 only; S6 (the verdict) is a separate heading below, left for Opus.

Every number below is either quoted verbatim from a record's own evidence file (the record's
`docs/work/evidence/<work>-census.md` / `-four-read.md`, produced by `scripts/build-census.mjs`
and `scripts/four-read.mjs` per `docs/census.md`) or marked `unread (<what is missing>)`. No
number in this report was estimated. Per S2, the reader (`build-census.mjs`/`four-read.mjs`) was
not rerun anywhere: every one of the 12 lanes in scope already carries its own census and
four-read evidence file, so S2's "reuse first" rule applies throughout.

## Scope of lanes (S1)

**Rule applied:** every `docs/work/*.record.md` with `Status: closed` whose closed `Log:` line,
converted from the record's UTC timestamp to America/New_York (EDT, UTC-4 in September), falls on
or after 2026-09-28T00:00 NY.

The packet (`docs/work/wr-2026-09-28-census-0928.record.md:17`) names lanes **34, 42, 43, 44, 38,
46, 37, 48 and 47** (9 lanes). Reading every closed record's own `Log:` line directly, 12 lanes
actually qualify — the packet's 9 plus **31, 32 and 33**, which closed at 00:08, 06:31 and 00:24 NY on 9/28
respectively. This is reported to lane 38's owner below as a finding, not corrected in
any record.

| Lane | Work id | Closed `Log:` (UTC) | Closed (NY) | In packet? |
|---|---|---|---|---|
| 31 | wr-2026-09-27-sealed-signal | 2026-09-28T04:08:23.490Z | 2026-09-28 00:08 | no (found by this reader) |
| 32 | wr-2026-09-27-autolink-guard | 2026-09-28T10:31:15.000Z | 2026-09-28 06:31 | no (found by this reader) |
| 33 | wr-2026-09-28-collect-followups | 2026-09-28T04:24:01.000Z | 2026-09-28 00:24 | no (found by this reader) |
| 34 | wr-2026-09-28-pickup-binding | 2026-09-28T19:52:23.000Z | 2026-09-28 15:52 | yes |
| 37 | wr-2026-09-28-codex-parity | 2026-09-28T23:06:15.794Z | 2026-09-28 19:06 | yes |
| 38 | wr-2026-09-28-census-completeness | 2026-09-28T22:31:17.000Z | 2026-09-28 18:31 | yes |
| 42 | wr-2026-09-28-stale-session-guard | 2026-09-28T21:13:25.000Z | 2026-09-28 17:13 | yes |
| 43 | wr-2026-09-28-cross-host-nudge | 2026-09-28T20:35:49.000Z | 2026-09-28 16:35 | yes |
| 44 | wr-2026-09-28-transport-identity | 2026-09-28T21:57:49.000Z | 2026-09-28 17:57 | yes |
| 46 | wr-2026-09-28-test-temp-hygiene | 2026-09-28T22:48:16.000Z | 2026-09-28 18:48 | yes |
| 47 | wr-2026-09-28-repo-env-everywhere | 2026-09-29T00:13:12.000Z | 2026-09-28 20:13 | yes |
| 48 | wr-2026-09-28-render-readback | 2026-09-28T23:57:13.000Z | 2026-09-28 19:57 | yes |

Records checked and excluded (closed `Log:` falls on 2026-09-27 NY, before the window): codex-census
(closed `Log:` 2026-09-27T21:33:13.913Z = 17:33 NY), collect-status (19:26 NY 9/27), decisions-render
(18:43 NY 9/27), delete-deny (03:54 NY 9/27), inbox-truth (19:33 NY 9/27), knowledge-counted (10:10 NY
9/27), measure-truth (08:50 NY 9/27), pickup-complete (10:37 NY 9/27), record-closed-and-skip (17:31 NY
9/27), render-guard (22:52 NY 9/27, i.e. still 9/27 since 02:52Z-4h stays same date), sealed-home-leak
(22:36 NY 9/27), windows-task (16:50 NY 9/27), stall-nudge (23:42 NY 9/27). Source for every timestamp:
each record's own final `closed` `Log:` line, cited by file and line number in "Sources" below.

## Sources

Every number in the table and the Fable row traces to one of these files. Line numbers are for
this worktree's checkout at the base commit named in the lane-50 record (`f7df941` plus whatever
later commits this branch carries).

| Lane | Record `closed Log:` line | Record `Opened:` line | Census evidence | Four-read evidence |
|---|---|---|---|---|
| 31 | `wr-2026-09-27-sealed-signal.record.md:27` | `:14` | `docs/work/evidence/wr-2026-09-27-sealed-signal.census.md` (VERDICT `:1`, leadTurns `:11`) | `docs/work/evidence/wr-2026-09-27-sealed-signal.four-read.md` |
| 32 | `wr-2026-09-27-autolink-guard.record.md:56` | `:14` | `docs/work/evidence/wr-2026-09-27-autolink-guard-census.md` (VERDICT `:1`, leadTurns `:7`) | `docs/work/evidence/wr-2026-09-27-autolink-guard.four-read.md` |
| 33 | `wr-2026-09-28-collect-followups.record.md:59` | `:10` | `docs/work/evidence/wr-2026-09-28-collect-followups-census.md` (VERDICT `:1`, leadTurns `:7`) | `docs/work/evidence/wr-2026-09-28-collect-followups-four-read.md` |
| 34 | `wr-2026-09-28-pickup-binding.record.md:60` | `:10` | `docs/work/evidence/wr-2026-09-28-pickup-binding-census.md` (VERDICT `:1`, leadTurns `:7`) | `docs/work/evidence/wr-2026-09-28-pickup-binding-four-read.md` |
| 37 | `wr-2026-09-28-codex-parity.record.md:43` | `:14` | `docs/work/evidence/wr-2026-09-28-codex-parity.census.md` (VERDICT `:1`, leadTurns `:11`) | `docs/work/evidence/wr-2026-09-28-codex-parity.four-read.md` |
| 38 | `wr-2026-09-28-census-completeness.record.md:62` | `:14` | `docs/work/evidence/wr-2026-09-28-census-completeness-census.md` (VERDICT `:1`, leadTurns `:7`) | `docs/work/evidence/wr-2026-09-28-census-completeness.four-read.md` |
| 42 | `wr-2026-09-28-stale-session-guard.record.md:60` | `:10` | `docs/work/evidence/wr-2026-09-28-stale-session-guard-census.md` (VERDICT `:1`, leadTurns `:7`) | `docs/work/evidence/wr-2026-09-28-stale-session-guard-four-read.md` |
| 43 | `wr-2026-09-28-cross-host-nudge.record.md:59` | `:10` | `docs/work/evidence/wr-2026-09-28-cross-host-nudge-census.md` (VERDICT `:1`, leadTurns `:7`) | `docs/work/evidence/wr-2026-09-28-cross-host-nudge-four-read.md` |
| 44 | `wr-2026-09-28-transport-identity.record.md:60` | `:10` | `docs/work/evidence/wr-2026-09-28-transport-identity-census.md` (VERDICT `:1`, leadTurns `:7`) | `docs/work/evidence/wr-2026-09-28-transport-identity-four-read.md` |
| 46 | `wr-2026-09-28-test-temp-hygiene.record.md:59` | `:10` | `docs/work/evidence/wr-2026-09-28-test-temp-hygiene-census.md` (VERDICT `:1`, leadTurns `:7`) | `docs/work/evidence/wr-2026-09-28-test-temp-hygiene-four-read.md` |
| 47 | `wr-2026-09-28-repo-env-everywhere.record.md:67` | `:10` | `docs/work/evidence/wr-2026-09-28-repo-env-everywhere-census.md` (VERDICT `:1`, leadTurns `:7`) | `docs/work/evidence/wr-2026-09-28-repo-env-everywhere-four-read.md` |
| 48 | `wr-2026-09-28-render-readback.record.md:29` | `:14` | `docs/work/evidence/wr-2026-09-28-render-readback.census.md` (VERDICT `:1`, leadTurns `:11`) | `docs/work/evidence/wr-2026-09-28-render-readback.four-read.md` |

Reviewer agent ids and identities for the "lead and reviewer" cell come from each record's own
`reviewed` `Log:` lines (grepped and cited inline in the table below) and, for the three
Codex-led lanes (31, 37, 48), from the child row in the census markdown's discovery table
(nickname `Averroes`, parent id `01a0df4c-2809-7520-b1d7-876cc51a87ee`, role `reviewer`) — e.g.
`docs/work/evidence/wr-2026-09-27-sealed-signal.census.md:58`.

The hand-run baseline row is quoted from `docs/GOALS.md:56`. The DONE section's four clauses are
`docs/GOALS.md:28` (the DONE test itself) cross-checked against the 12 lanes' own `Lead-session:`
fields and census `VERDICT` lines. Stall citations are listed with their own sources in the
"Work lost or stalled" notes under the table.

## Table (S3)

Columns: top-tier tokens (lead + reviewer, by session/agent id) · hours ask to accepted (+ largest
gap) · rework after acceptance · work lost or stalled (census count + stalls on record) · lead
turns.

| Row | Top-tier tokens (lead; reviewer) | Hours ask→accepted (largest gap) | Rework after acceptance | Work lost or stalled | Lead turns |
|---|---|---|---|---|---|
| **Baseline (hand-run, 2026-09-25 bearings O9, no source record; measure baselines docs/GOALS.md:15-18)** | hand-run: none ("earlier hand-run builds have no token record", `docs/GOALS.md:15`); plugin baseline same line: median 12.6M, range 2.8M to 54.7M over 14 records closed 9/26 to 9/28 | package-build 50 min; rename-build 3 h 40 (`docs/GOALS.md:16`) | Co-Authored-By trailer class recurred across 87 commits; no per-build count (`docs/GOALS.md:17`) | two RESULT notes waited 6 h 54 and 57 min; 3 of 7 loud notes logged no-inbox (`docs/GOALS.md:18`) | **152 turns** (`docs/GOALS.md:56`: "19 and 67 orchestrator turns on the two loop builds against 152 turns (no source record; 2026-09-25 bearings O9)"); same line also pins loop-gates' 7 turns (hand count, unchecked) and census-complete's 32 turns (script-counted, over the 20-turn target) |
| Lane 31 sealed-signal — lead `01a0df4c-2809-7520-b1d7-876cc51a87ee` (Codex, host Windows) | unread (Codex census PARTIAL: unverified/out-of-contract discovery candidate; window outside default discovery horizon — `wr-2026-09-27-sealed-signal.census.md:1,10`); reviewer: Codex child nickname `Averroes`, no token figure printed | 0.9h; largest native API response gap (heuristic) 3.2min at 2026-09-28T02:59:38.514Z | 0 commits touching build files in 7 days; 0 re-accept Log entries | stalled classification unavailable (native span coverage not established); 0 native response gaps >30min (heuristic); 1 unanswered ASK to skills-a (skills-fable-lane-31-1) | 1 native user turn (Codex `leadTurns`, `wr-2026-09-27-sealed-signal.census.md:11`) |
| Lane 32 autolink-guard — lead `588290d9-ee43-400b-a808-cf44c407171c` (Claude, host Windows) | top-tier 4,844,410 (claude-opus-5-5; lead window plus subagents, reviewer included); reviewer: same-session Opus self-review, no separate reviewer session id printed on record (`wr-2026-09-27-autolink-guard.record.md:18` names "skills-o Opus reviewer" with no id) | 7.4h; largest gap 179.1min at 2026-09-28T07:11:42.049Z | 0 commits touching build files in 7 days; 0 re-accept Log entries | 1 gap >30min stalled; 4 waiting-on-agents spans (415.1 min total); agent `a356bf87ac505c39d` silent 413.3 min from 2026-09-28T03:15:48.781Z (2026-09-27 11:15 PM NY); 0 unanswered ASKs to skills-o | 9 |
| Lane 33 collect-followups — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | top-tier 9,838,870 (claude-opus-5-5; lead window plus subagents, reviewer included); reviewer agent `a8261c864f5d0c8dc` (`wr-2026-09-28-collect-followups.record.md:19`, named "Opus reviewer a8261c864f5d0c8dc"; that file appears in the census's default subagents dir with 53 in-window turns, `wr-2026-09-28-collect-followups-census.md:57` — no separate per-agent token figure, only the aggregate "unassigned" bucket, `:10`) | 0.6h; largest gap 14.4min at 2026-09-28T03:48:51.781Z | 1 commit touching build files in 7 days: 55ae08f | 0 gaps >30min stalled; 0 waiting-on-agents; 0 unanswered ASKs to skills-n | 7 |
| Lane 34 pickup-binding — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | top-tier 10,887,369 (claude-opus-5-5; lead window plus subagents, reviewer included); reviewer agent `a3419dc7f623522d7` (`wr-2026-09-28-pickup-binding.record.md:20`; per-agent tokens unread, same aggregate-only limit as lane 33) | 0.6h; largest gap 14.7min at 2026-09-28T19:15:48.850Z | 1 commit touching build files in 7 days: 386c84c | 0 gaps >30min stalled; 0 waiting-on-agents; 0 unanswered ASKs to skills-n. Record's own Stall note (`:68`): "none occurred" — the only Log mention of "stall" is the watcher name itself | 8 |
| Lane 37 codex-parity — lead `01a0df4c-2809-7520-b1d7-876cc51a87ee` (Codex, host Windows) | unread (Codex census PARTIAL, same reason as lane 31 — `wr-2026-09-28-codex-parity.census.md:1,10`); reviewer: Codex child nickname `Averroes`, no token figure; separately, "Claude Opus review" via ASK ids skills-fable-lane-37-7/-10, no session id printed | 3.4h; largest native response gap (heuristic) 3.2min at 2026-09-28T22:25:57.087Z | 4 commits touching build files in 7 days: aafc1d0, 1841065, 8b1f4bf, 325fb41; 0 re-accept Log entries before the second acceptance | stalled classification unavailable; 0 native response gaps >30min (heuristic); 1 unanswered ASK to skills-a (skills-fable-lane-37-1). Record's own text (`:57`, `:47`) frames "work lost or stalled" as its own named measure for Codex-led builds; two BLOCKED Netcup gate attempts are on record (exit 127 then exit 1 — `docs/specs/codex-parity-37/L37-netcup-integration.md:1`), not literally "false reds" in this record's own words | 2 native conversational turns (Codex `leadTurns`); 169 verified top-tier native API responses (a different measure, per the record's own caution at `:67`) |
| Lane 38 census-completeness — lead `588290d9-ee43-400b-a808-cf44c407171c` (Claude, host Windows) | top-tier 11,940,121 (claude-opus-5-5; lead window plus subagents, reviewer included); reviewer: same-session Opus self-review, no separate id (`wr-2026-09-28-census-completeness.record.md:17`, "skills-o Opus reviewer") | 0.8h; largest gap 10.2min at 2026-09-28T21:42:00.854Z | 0 commits touching build files in 7 days; 0 re-accept Log entries | 0 gaps >30min stalled; 0 waiting-on-agents; 0 unanswered ASKs to skills-o; wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-o | 9 |
| Lane 42 stale-session-guard — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | top-tier 8,917,860 (claude-opus-5-5; lead plus subagents in that census window, `docs/work/evidence/wr-2026-09-28-stale-session-guard-census.md:9`); this lane's own four-read (`wr-2026-09-28-stale-session-guard-four-read.md`) still prints `unavailable (no census)` for this cell — not stale (both files were added in the same accept commit, `abf6165`), it is a markdown `--census` miss (4b), reported as a finding for lane 38's owner below; reviewer agent `a361ba9598eff58b8` (`wr-2026-09-28-stale-session-guard.record.md:20`) | 0.6h; gap unavailable (no lead transcript, per the four-read that was run) | 0 commits touching build files in 7 days; 0 re-accept Log entries | gaps unavailable (no lead transcript); 0 unanswered ASKs to skills-n. Record's own Stall note (`:68`): "no agent went quiet, every one reported inside its ETA" | 7 (from the lane's own later census file, `wr-2026-09-28-stale-session-guard-census.md:7`) |
| Lane 43 cross-host-nudge — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | top-tier 11,623,981 (claude-opus-5-5; lead plus subagents in that census window, `docs/work/evidence/wr-2026-09-28-cross-host-nudge-census.md:9`); this lane's own four-read still prints `unavailable (no census)`, same markdown `--census` miss (4b) as lane 42 (added in the same accept commit, `7cda069`), reported as a finding for lane 38's owner below; reviewer agent `a59ef3b3dbd0ae94c` (`wr-2026-09-28-cross-host-nudge.record.md:19`) | 0.6h; gap unavailable (no lead transcript) | 0 commits touching build files in 7 days; 0 re-accept Log entries | gaps unavailable (no lead transcript); 1 unanswered ASK to skills-n (skills-fable-lane-43-1). Record's own Stall note (`:67`): "no agent went quiet, every one reported inside its ETA" | 9 (from the lane's own later census file, `wr-2026-09-28-cross-host-nudge-census.md:7`) |
| Lane 44 transport-identity — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | top-tier 18,248,547 (claude-opus-5-5; lead plus subagents in that census window, `docs/work/evidence/wr-2026-09-28-transport-identity-census.md:9`); this lane's own four-read still prints `unavailable (no census)`, same markdown `--census` miss (4b) (added in the same accept commit, `90bcef2`), reported as a finding for lane 38's owner below; reviewer agent `a4cace0c0e074c6a6` (`wr-2026-09-28-transport-identity.record.md:20`) | 0.7h; gap unavailable (no lead transcript) | 0 commits touching build files in 7 days; 0 re-accept Log entries | gaps unavailable (no lead transcript); 2 unanswered ASKs to skills-n (pickup-netcup-decisions-...-4, skills-fable-release-0-20-17-1). Record's own Stall note (`:68`): "no agent went quiet" | 7 (from the lane's own later census file, `wr-2026-09-28-transport-identity-census.md:7`) |
| Lane 46 test-temp-hygiene — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | top-tier 14,735,966 (claude-opus-5-5; lead plus subagents in that census window, `docs/work/evidence/wr-2026-09-28-test-temp-hygiene-census.md:9`); this lane's own four-read still prints `unavailable (no census)`, same markdown `--census` miss (4b) (added in the same accept commit, `76cb236`), reported as a finding for lane 38's owner below; reviewer agent `adac9198d7d100193` (`wr-2026-09-28-test-temp-hygiene.record.md:19`) | 0.7h; gap unavailable (no lead transcript) | 0 commits touching build files in 7 days; 0 re-accept Log entries | gaps unavailable (no lead transcript); 1 unanswered ASK to skills-n (skills-fable-lane-47-1 — named in this lane's own four-read text verbatim, apparently copied from lane 47). Record's own Stall note (`:67`): "no agent went quiet" | 10 (from the lane's own later census file, `wr-2026-09-28-test-temp-hygiene-census.md:7`) |
| Lane 47 repo-env-everywhere — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | top-tier 35,706,699 (claude-opus-5-5; lead plus subagents in that census window, `docs/work/evidence/wr-2026-09-28-repo-env-everywhere-census.md:12`); this lane's own four-read still prints `unavailable (no census)`, same markdown `--census` miss (4b) (added in the same accept commit, `a146e44`), reported as a finding for lane 38's owner below; reviewer agent `a4a42ea240cc29011` (`wr-2026-09-28-repo-env-everywhere.record.md:21`) | 1.9h; gap unavailable (no lead transcript) | 0 commits touching build files in 7 days; 0 re-accept Log entries | gaps unavailable (no lead transcript); 1 unanswered ASK to skills-n (skills-fable-lane-47-1); wakes unavailable (no census); Stop-blocks unavailable (no census); stall nudges 0 to skills-n | 19 (from the lane's own later census file, `wr-2026-09-28-repo-env-everywhere-census.md:7`) |
| Lane 48 render-readback — lead `01a0df4c-2809-7520-b1d7-876cc51a87ee` (Codex, host Windows) | unread (Codex census PARTIAL, same reason as lanes 31/37 — `wr-2026-09-28-render-readback.census.md:1,10`); reviewer: Codex child nickname `Averroes`, no token figure; separately "Claude Opus 5.5 reviewer" via ASK ids skills-fable-lane-48-4/-6, no session id printed | 0.6h; largest native response gap (heuristic) 3.1min at 2026-09-28T23:25:03.874Z | 0 commits touching build files in 7 days; 0 re-accept Log entries | stalled classification unavailable; 0 native response gaps >30min (heuristic); 1 unanswered ASK to skills-a (skills-fable-lane-48-1); wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-a. This lane's own defect trail (see below) is one of the packet's three named stalls | 1 native conversational turn (Codex `leadTurns`); 109 verified top-tier native API responses |

### Work lost or stalled: the packet's three named stalls, checked against records

1. **"Lane 36's builder hang at 6:12 PM NY."** Confirmed, on lane 36's open record on its build
   branch: `origin/build/lane-closeout-1:docs/work/wr-2026-09-28-lane-closeout.record.md:36`
   (committed ad30238, 20:02 NY): the C1 round-5 Sonnet builder committed 2296478 at 22:12Z
   (6:12 PM NY), then hung with no report and no gate; the lead stopped it at 00:03Z, about 111
   minutes later. Lane 36 is not closed, so it has no row in the table (S1).
2. **"Lane 37's Netcup gate false reds."** The phrase "false red" does not appear anywhere under
   `docs/specs/codex-parity-37/`. What is on record for lane 37's Netcup gate is one BLOCKED
   attempt with two real, non-flake exits (`docs/specs/codex-parity-37/L37-netcup-integration.md:1`:
   "attempt 1 native/SSH exits 127/127; attempt 2 native/SSH exits 1/1" — a login-shell PATH problem,
   then a real regression), followed by a later PASS (`L37-netcup-r7.md:1`). Separately, lane 37's
   own merge-to-main attempt hit the decisions-render readback defect (`L37-result.md:25`: "returned
   exit 5, readback did not verify") — this is the same defect lane 48 (render-readback) fixed, not a
   Netcup-suite false-red. The literal phrase "false red" is on record only for lane 46's leak-check
   concurrency case (`docs/specs/test-temp-hygiene-1/spec.md:31`) and lane 14's `--every` case
   (`docs/specs/collect-status-1/reports/seam-review-r1.md:222`), neither of which is lane 37.
3. **"The render readback exit 5s between 6:50 and 7:59 PM NY."** Confirmed. `docs/specs/render-readback-48/pickup.md:5`
   names the defect directly: "the readback verification exits 5 because Notion drops one blank
   line... every publisher has had to run [`--adopt-live`] since about 18:50 NY (three times
   today...)". Lane 48's own fix is verified by a normal publish that exited 0 at **7:56 PM
   America/New_York** with no recovery flag (`docs/specs/render-readback-48/L48-result.md:9`), and
   lane 48's accept/close Log lines land at 2026-09-28T23:47:24Z / 23:57:13Z = **7:47 PM / 7:57 PM
   NY** — inside the named 6:50-7:59 PM window.

## Fable lead row (S4)

Session `9c61c35a-82dd-4aef-8eca-c99bb0e72e31` is the `Spec-session:` on every one of the 12
lane records above (all identical), and per `docs/work/evidence/wr-2026-09-26-merge-on-acceptance-seam.md:53`
("Windows, where skills-fable runs") this is a Windows-hosted session. It is **not on this host**:

```
$ ls ~/.claude/projects/-home-ben-Code-claude-delegation/9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl
ls: cannot access '.../9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl': No such file or directory
```

It is, however, reachable over ssh: the lead ran the reader on ben-desktop itself, from a
claude-delegation checkout at `9435161` on Windows, against the real `--lead` path
`C:\Users\benzh\.claude\projects\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl`,
and committed the output beside this report: `docs/reports/census-0928/fable-lead-census.md`
(session `9c61c35a-82dd-4aef-8eca-c99bb0e72e31`, window 2026-09-28T19:00:00Z to
2026-09-29T00:19:27Z).

Values, quoted from that file:
- leadTurns: **39** (`docs/reports/census-0928/fable-lead-census.md:7`)
- Lead tokens by model, window (deduped), claude-fable-5-1: input 5,474; cache_creation 683,680;
  cache_read 39,357,584; output 224,181; **sum 40,270,919**
  (`docs/reports/census-0928/fable-lead-census.md:40`)
- By-model totals (window): claude-fable-5-1=40,270,919, claude-opus-5-5=10,498,370,
  claude-sonnet-5-5=8,605,452 (`docs/reports/census-0928/fable-lead-census.md:12`)
- Wakes: 15 (15 note-flush, 0 Done-tick) (`docs/reports/census-0928/fable-lead-census.md:9`)
- Stop-blocks: 1 (`docs/reports/census-0928/fable-lead-census.md:10`)
- Stall nudges: unavailable (ledger dir unreadable) (`docs/reports/census-0928/fable-lead-census.md:11`)

**Exact reader command** (run over ssh on ben-desktop; the one-line form runs as is in cmd.exe or PowerShell, where the file exists), read time fixed at this report's own generation time,
2026-09-29T00:19:27Z:

```
node scripts/build-census.mjs --lead "C:\Users\benzh\.claude\projects\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl" --from 2026-09-28T19:00:00Z --to 2026-09-29T00:19:27Z
```

To check the bearings prediction (65M tokens in the 24-hour window) at 3:00 PM NY on 2026-09-29
(= 2026-09-29T19:00:00Z), run the same command over ssh on ben-desktop (cmd.exe or PowerShell), with only
`--to` advanced:

```
node scripts/build-census.mjs --lead "C:\Users\benzh\.claude\projects\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl" --from 2026-09-28T19:00:00Z --to 2026-09-29T19:00:00Z
```

Value: **read** (see above). The second command, for the 24-hour bearings check at 3:00 PM NY on
2026-09-29, has not yet been run.

## DONE section (S5)

`docs/GOALS.md:28` — "DONE is a test with numbers, run once from a Claude lead and once from a
Codex lead with a mixed handoff between them."

- **Led once from Claude:** proven. 9 of the 12 lanes have a Claude `Lead-session:` with a
  `COUNTED` (non-partial) Claude census verdict — e.g. lane 33 collect-followups, lead
  `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e`, `wr-2026-09-28-collect-followups-census.md:1`.
- **Led once from Codex with a mixed handoff, both ids on record:** **not yet** (the Opus verdict below reads this part as partly met; see "DONE, part by part"). Lanes 31, 37 and
  48 are Codex-led (`Lead-session: 01a0df4c-2809-7520-b1d7-876cc51a87ee`) with a Claude Opus
  reviewer named in every one of them, but in no record is the Claude reviewer's own session id
  printed — only ASK ids (e.g. `skills-fable-lane-48-4`) and, in the Codex census's child-discovery
  table, a nickname (`Averroes`) with no session id of its own
  (`docs/work/evidence/wr-2026-09-27-sealed-signal.census.md:58`). "Both ids on record" fails on
  every one of the three candidate lanes.
- **Lead under 20 turns:** proven, repeatedly. All 12 lanes' `leadTurns` are under 20 — the
  highest is lane 47's 19 (`wr-2026-09-28-repo-env-everywhere-census.md:7`); the lowest Claude-lane
  count is 7 (lanes 33, 42, 44).
- **Nothing lost or stalled, with the count:** proven (the Opus verdict below reads this part as partly met; see "DONE, part by part") for at least lane 33 (collect-followups):
  "0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); 0 unanswered ASKs to skills-n"
  (`wr-2026-09-28-collect-followups.record.md:56`), and no stall/hang/watcher/false-red language
  anywhere in that lane's own Log lines. Lane 34 (pickup-binding) matches it and adds an explicit
  denial: "Stall: none occurred" (`wr-2026-09-28-pickup-binding.record.md:68`).

## Findings for lane 38's owner

Every `unread` cell in the table above, and what is missing to make it read:

1. **Top-tier tokens, lanes 31/37/48 (Codex leads):** `unread (Codex census coverage is
   unavailable: unverified or out-of-contract discovery candidate; effective census window is
   outside default discovery horizon)`. Missing: a configurable discovery horizon for
   `build-census.mjs`'s Codex path, or an explicit `--tasks` override that can reach a build
   outside the fixed two-day window from the lead's own start date (`docs/census.md`'s own
   documented limit, "no configurable discovery horizon").
2. **Reviewer tokens, all 9 Claude-led lanes:** `reviewer tokens are inside the combined top-tier figure; the per-agent split is unread (per-agent token breakdown not printed —
   the census sums subagent tokens only by model and by role in aggregate; the named reviewer
   agent id resolves to role "unassigned" with no per-file token row)`. Missing: either a
   `--role-map` pass naming each lane's specific reviewer agent id at census time, or a per-file
   token column in the report.
3. **Reviewer session id, lanes 31/37/48 (Codex leads):** `unread (no Claude session id printed on
   record — only a nickname, "Averroes", and ASK ids)`. Missing: the record's `reviewed` `Log:`
   line, or the census discovery table, would need to carry the reviewer's own session id, the
   way `Lead-session:` already does for leads.
4. **Gap/hours detail, lanes 42/43/44/46/47:** `unread (no lead transcript)` for the largest-gap
   figure inside "hours ask to accepted", and the whole "work lost or stalled" gap line, per each
   lane's own four-read.md. Cause: the one under 4b (the markdown census has no `leadPath`, so four-read never opens the lead transcript, `scripts/four-read.mjs:789`). The top-tier tokens half of this
   same finding, previously listed here as unread, is now read: each lane's `-census.md` by-model
   line does carry a top-tier (claude-opus-5-5) total covering the lead's window plus its
   subagents, and those figures are now in the table above, cited file:line
   (`wr-2026-09-28-stale-session-guard-census.md:9`, `wr-2026-09-28-cross-host-nudge-census.md:9`,
   `wr-2026-09-28-transport-identity-census.md:9`, `wr-2026-09-28-test-temp-hygiene-census.md:9`,
   `wr-2026-09-28-repo-env-everywhere-census.md:12`). Missing: a four-read rerun with the `.census.json`, per 4b's correction.
4b. **Why these 5 lanes' own four-read.md still prints `unread (no census)` for top-tier tokens,
   even though each lane's `-census.md` sits right beside it with the number filled in:** checked,
   and it is not a stale read — in every one of the 5 lanes, the `-census.md` and `-four-read.md`
   files were added in the very same accept commit (e.g. `abf6165` for lane 42, `7cda069` for lane
   43, `90bcef2` for lane 44, `76cb236` for lane 46, `a146e44` for lane 47 — one commit each, same
   timestamp), so the census file did not arrive later. The real cause is a different-path miss:
   `scripts/four-read.mjs` only ever reads a census through its own `--census <json>` flag (see
   `computeTopTierTokens`, `scripts/four-read.mjs:145-146`: "if (!census) return { value:
   'unavailable (no census)' }"), and `scripts/build-census.mjs` does not emit a JSON census at
   all — only the `-census.md` markdown report. No JSON census file exists anywhere under
   `docs/work/evidence/` for any of these 5 lanes. Missing: either `build-census.mjs` needs a
   `--json` output mode that `four-read.mjs --census` can consume, or the accept-prep step that
   runs both scripts needs to wire the markdown census's numbers into four-read's own input before
   four-read runs.
   Lead-side correction (Opus verdict): the cause above is wrong. `build-census.mjs` does write a JSON census with `--json <path>` (`scripts/build-census.mjs:1675`, `:1709-1711`), and the lead ran it that way; the miss is that `four-read.mjs --census` was handed the markdown `-census.md`, which `loadJson` (`scripts/four-read.mjs:47`, `:787`) fails to parse and silently turns into no census, so the token cell and, through the missing `census.leadPath` (`:789`), the gap, stall, wake and Stop-block cells print unavailable; the fix is to pass the `.json` file, as `docs/census.md:492-494` already says, and to make a non-JSON `--census` an error.
5. **Wakes/Stop-blocks, lanes 47 (repo-env-everywhere) and 42/43/44/46 (stale-session-guard,
   cross-host-nudge, transport-identity, test-temp-hygiene):** `unavailable (no census)` in 4 of
   the 5, and simply absent from the printed row (no wakes/Stop-blocks clause at all) in the other.
   Same root cause as finding 4b: four-read was handed the markdown census (see the correction under 4b).
6. **Fable lead row tokens (S4):** read. The lead ran `build-census.mjs` over ssh on ben-desktop
   (claude-delegation checkout at `9435161`, Windows), against the real `--lead` path, and
   committed its output at `docs/reports/census-0928/fable-lead-census.md`: leadTurns 39, wakes 15
   (15 note-flush, 0 Done-tick), Stop-blocks 1, by-model totals as quoted in S4 above. Stall
   nudges were unavailable because the ledger dir was unreadable on that run
   (`docs/reports/census-0928/fable-lead-census.md:11`) — nothing else is missing.
7. **Packet stall #1:** read (see item 1 above); nothing missing.
8. **Packet stall #2 ("lane 37's Netcup gate false reds"):** the literal phrase is not on lane 37's
   record; what is on record is a two-exit BLOCKED attempt (127 then 1) plus the shared exit-5
   readback defect. Missing: a correction to the packet's wording, or a pointer to whichever
   evidence file actually uses the words "false red" for lane 37, if one exists off this host.

## Verdict (Opus)

Written on 9/28 from the table above, with each figure used here reopened at its cited file and line. The baseline is the measure table in `docs/GOALS.md:13-18`, not only the 152-turn line quoted in the table's first row. S3 asked for every number GOALS.md pins, and lines 15 to 18 pin at least one per measure. Where a line pins nothing comparable, this section says so and makes no comparison.

Finding 4b is wrong, and the correction is under it. `build-census.mjs` does emit a JSON census (`--json`, `scripts/build-census.mjs:1675`, `:1709-1711`). The miss is that `four-read.mjs` was given the markdown file and silently read it as no census (`scripts/four-read.mjs:47`, `:787`). The same miss also blanks the gap and stall cells for lanes 42 to 47 (`:789`), so part of finding 4 and all of finding 5 have the same cause.

### The four measures

Top-tier tokens per build: no comparison with the hand-run baseline is possible, because it has no token number: "earlier hand-run builds have no token record" (`docs/GOALS.md:15`). The same line pins a plugin baseline instead: closed lanes from 9/26 to 9/28, median 12.6M over 14 records, range 2.8M to 54.7M. Today's nine readable lanes are the Claude-led ones, all with census verdict COUNTED. Their median is 11.6M (lane 43, `wr-2026-09-28-cross-host-nudge-census.md:9`) and they run from 4.8M (lane 32, `wr-2026-09-27-autolink-guard-census.md:9`) to 35.7M (lane 47, `wr-2026-09-28-repo-env-everywhere-census.md:12`). That is level with the plugin baseline, not a gain. The baseline was written at 3:10 PM NY on 9/28 (7b00418) and its sample can include lanes 32 and 33; without them today's median is 11.9M, still level. These figures are also smaller than the measure itself, which counts "all roles" from spec to accepted, for three reasons:
- No lane carries its Fable spec work. The Fable lead spent 40,270,919 claude-fable-5-1 tokens from 19:00Z to 00:19Z (`fable-lead-census.md:40`). Nine of these lanes closed in that window, and none of those tokens is in any lane's figure. Its own subagents spent another 10,498,370 claude-opus-5-5 tokens in the window (`fable-lead-census.md:12`), also in no lane.
- The three Codex-led lanes (31, 37, 48) are unread.
- Lanes 46 and 47 ran from the same lead session, and their census windows overlap from 22:17Z to 22:47Z (`wr-2026-09-28-test-temp-hygiene-census.md:20`, `wr-2026-09-28-repo-env-everywhere-census.md:26`). That half hour's lead and subagent tokens, and its lead turns, are counted in both lanes.

Hours ask to accepted: beat on the reader's clock, cannot compare on the baseline's. `docs/GOALS.md:16` pins two builds: package-build at 50 minutes and rename-build at 3 h 40. Across the 12 lanes the median is 0.7 h, about 42 minutes. Seven lanes took 0.7 h or less, under the 50-minute build, and lane 38 at 0.8 h is level with it. Eleven of 12 finished under 3 h 40. Lane 32 did not: it took 7.4 h (`wr-2026-09-27-autolink-guard.four-read.md:8`), most of it one builder silent for 413 minutes. Lane 37 took 3.4 h, with three rejections before acceptance (`wr-2026-09-28-codex-parity.record.md:21`, `:23`, `:25`). The two clocks start at different points: the reader starts at Opened, after the Fable spec; the baseline starts at Ben's go. Measured instead from each record's Spec-from (or Opened, where Opened is earlier), the 12-lane median is 74 minutes, over the 50-minute build; Spec-from is shared by five lanes (19:03:14Z, the Fable batch start) and falls after Opened on three, so neither clock is the baseline's. The gain holds on the Opened clock only.

Rework after acceptance: per build, no comparison is possible, because `docs/GOALS.md:17` pins no per-build count. What it pins is one failure class recurring: "Co-Authored-By trailer class recurred across 87 commits". On that class the plugin beat the baseline. None of the 216 commits on origin/main dated 9/28 in New York carries the trailer; this verdict ran `git log origin/main --since=2026-09-28T04:00:00Z --until=2026-09-29T04:00:00Z -i --grep=co-authored-by` and got 0 lines. Per build, 1 of 12 lanes had a fix round after acceptance: lane 37. It was accepted at 6:40 PM, its merge gate failed at 6:47 PM (`wr-2026-09-28-codex-parity.record.md:34`), fix 8b1f4bf and test 1841065 followed, and it was accepted again at 6:58 PM (`:42`). The reader also counts one commit each for lanes 33 (55ae08f) and 34 (386c84c), but each of those edits only the lane's own record and evidence files, so neither is a fix. Every lane's 7-day window runs to 10/5, so this reading is early.

Work lost or stalled: did not beat. `docs/GOALS.md:18` pins two RESULT notes that waited 6 h 54 and 57 minutes, and 3 of 7 loud notes logged no-inbox. Today the plugin lanes still have stalls of the same size:
- Lane 32's agent a356bf87ac505c39d went silent for 413.3 minutes, about 6 h 53, from 11:15 PM on 9/27 (`wr-2026-09-27-autolink-guard.four-read.md:10`).
- Lane 36's C1 builder hung after committing 2296478 at 6:12 PM and sat about 111 minutes until the lead stopped it at 8:03 PM (`origin/build/lane-closeout-1:docs/work/wr-2026-09-28-lane-closeout.record.md:36`). Lane 36 is still open, so it is not in the table.
- From about 6:50 PM, each Notion publish exited 5 on readback and needed `--adopt-live`, three times, until lane 48's fix published clean at 7:56 PM (`docs/specs/render-readback-48/pickup.md:5`, `L48-result.md:9`).
- The reader also counts 8 "unanswered" ASKs (7 distinct), but at least five are the lanes' own dispatch asks, picked up and closed, read before the RESULT reply; they are not counted as stalls here.

Only lanes 33, 34 and 38 read clean on every part: 0 gaps over 30 minutes, 0 waiting on agents, 0 unanswered ASKs. Lanes 42 to 47 have no gap reading, because of the miss under 4b. The three Codex lanes have no stall classification. Nothing today counts loud notes logged no-inbox, the baseline's second number.

### DONE, part by part

- Led once from Claude: met, by lane 33. Lead f6c8ae21, census COUNTED (`wr-2026-09-28-collect-followups-census.md:1`), and eight other Claude-led lanes pass as well.
- Led once from Codex with a mixed handoff, both ids on record: partly, by lane 48. Lanes 31, 37 and 48 were led by Codex session 01a0df4c from specs written by the Claude Fable session 9c61c35a. Each record carries both ids (`wr-2026-09-28-render-readback.record.md:10-11`), and Claude Opus reviewed each lane through ledger asks. That makes a mixed handoff with both ids on record, so this verdict differs from S5's "not yet", which also asked for the Claude reviewer's own session id. It is still only partly met: the Codex census is PARTIAL (`wr-2026-09-28-render-readback.census.md:1`), so the run cannot be scored with numbers, and DONE is a test with numbers.
- Lead under 20 turns: met, by lane 33 with 7 (`wr-2026-09-28-collect-followups-census.md:7`). Every Claude-led lane is under 20, the highest being lane 47 at 19 (`wr-2026-09-28-repo-env-everywhere-census.md:7`), against 152 for the hand-run build (`docs/GOALS.md:56`). No lane counts the Fable spec session, which took 39 turns in its 5.3-hour window (`fable-lead-census.md:7`) while nine lanes closed.
- Nothing lost or stalled, with the count: partly, by lane 33. Its count is 0 gaps over 30 minutes, 0 waiting on agents and 0 unanswered ASKs (`wr-2026-09-28-collect-followups-four-read.md:10`), and lanes 34 and 38 match it. The day as a whole does not: lane 32's 413-minute silence, lane 36's 111-minute builder hang, the readback exit 5s, no reading for lanes 42 to 47, and no stall count at all for the Codex half of the DONE pair.

### The one change next

Stop waking the Fable lead for each note. Let lane results wait in the ledger until the lead's next planned turn, so it wakes once per wave rather than once per note. The measure it should move is top-tier tokens per build, through the Fable share that today sits outside every lane's figure.

The numbers point here. The Fable lead's 40.3M in 5.3 hours is larger than any lane's figure and, spread over the nine lanes that closed in its window, adds about 4.5M a lane, 38 percent on top of the 11.6M median. 97.7 percent of it is cache reads (39,357,584 of 40,270,919, `fable-lead-census.md:40`), so its 39 turns average about 1.03M each (213 requests, about 189k each); the census does not split tokens between the 15 wake-opened turns and the rest, so the saving is not yet read. Note-flush wakes opened 15 of those 39 turns (`fable-lead-census.md:9`).

The next Fable lead census checks the change: wakes per hour should fall, and so should claude-fable-5-1 per lane closed. Two measures must not worsen: hours ask to accepted, because a batched read can delay the next dispatch, and work lost or stalled, because a batched read leaves RESULT notes unread longer; no RESULT or loud note may sit unread over 30 minutes (docs/GOALS.md:18), read from the flush log and ledger. Before building, split the Fable lead's window tokens by wake-opened versus other turns, so the saving is measured rather than assumed.

The reader miss under 4b is a finding for lane 38's owner, not this change.

### Prediction to check at 3:00 PM NY on 9/29

Part (b) of the 9/28 bearings (`docs/decisions/history/2026-09-28.md:34`) holds if the lead census for 19:00Z on 9/28 to 19:00Z on 9/29 shows at most 65M claude-fable-5-1 tokens, summed over every Fable lead session.

Steps to check it:
1. At 3:00 PM NY on 9/29, run the second command in the S4 section above on ben-desktop, with `--to 2026-09-29T19:00:00Z`. Run it from a fresh detached worktree of origin/main, as the bearings reader asks (`:35`); this report's read used a checkout at 9435161.
2. Read the claude-fable-5-1 row of "Lead tokens by model — window (deduped)" and sum its four columns. With `--json`, read `lead.windowByModel`, the same numbers.
3. The command covers session 9c61c35a only. Run any other Fable lead session active in the window the same way and add its total.

At 8:19 PM NY on 9/28 the total stood at 40,270,919, which is 62 percent of the bound after 5.3 of the 24 hours. To stay under the bound, the remaining 18.7 hours must use less than 24.7M, about 24 more lead turns at today's 1.03M each. At the evening's rate of about 7.6M an hour, the bound would pass around 11:30 PM NY on 9/28. The prediction holds only if the lead stays mostly idle overnight and through the morning.

## Appendix: lanes 42 to 47 rerun with the census JSON (lane 54)

Finding 4b's own correction (the "Verdict (Opus)" section above) named the real cause: `four-read.mjs` was handed the `-census.md` markdown for these 5 lanes, `loadJson` (`scripts/four-read.mjs:47`) silently failed to parse it into "no census" (`:787`), and the missing `census.leadPath` then blanked the gap, stall, wake and Stop-block cells (`:789`). Lane 54 (`docs/work/wr-2026-09-29-four-read-json.record.md`) fixed `four-read.mjs` to refuse a non-JSON `--census` outright (exit 2), then reran the five lanes with a real `build-census.mjs --json` census against each lane's own `Opened:`..accepted window, over the shared lead transcript `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e.jsonl` (the same session as all 5 records' `Lead-session:` field). Lane 45 is not one of these 5: no `wr-2026-09-28-*` record exists for it — it names the janitor.mjs/work-record.mjs git-runner work and the scratch-reaper (`docs/specs/repo-env-everywhere-1/spec.md:29`, `docs/specs/test-temp-hygiene-1/packet.md:3`), specced but not yet a closed lane in this window.

Exact commands (run once per lane; `--lead` is the shared transcript above):

```
node scripts/build-census.mjs --lead ~/.claude/projects/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e.jsonl --from <Opened> --to <accepted Log time> --json <scratch>/laneNN.census.json
node scripts/four-read.mjs --record docs/work/<record>.record.md --census <scratch>/laneNN.census.json --out <scratch>/laneNN.four-read.md --json <scratch>/laneNN.four-read.json
```

| Lane | Record | `--from` (Opened) | `--to` (accepted Log) | Hours ask→accepted (largest gap) | Work lost or stalled |
|---|---|---|---|---|---|
| 42 | `wr-2026-09-28-stale-session-guard` | 2026-09-28T20:37:43.000Z | 2026-09-28T21:12:39.000Z | 0.6h; largest gap 15.3min at 2026-09-28T20:39:39.994Z | 0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); ASKs unavailable (no --lead-slug); wakes 0 (0 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges unavailable (no --lead-slug) |
| 43 | `wr-2026-09-28-cross-host-nudge` | 2026-09-28T19:56:00.000Z | 2026-09-28T20:34:53.000Z | 0.6h; largest gap 12.7min at 2026-09-28T20:13:44.130Z | 0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); ASKs unavailable (no --lead-slug); wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges unavailable (no --lead-slug) |
| 44 | `wr-2026-09-28-transport-identity` | 2026-09-28T21:18:00.000Z | 2026-09-28T21:57:01.000Z | 0.7h; largest gap 7.7min at 2026-09-28T21:31:45.836Z | 0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); ASKs unavailable (no --lead-slug); wakes 0 (0 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges unavailable (no --lead-slug) |
| 46 | `wr-2026-09-28-test-temp-hygiene` | 2026-09-28T22:03:00.000Z | 2026-09-28T22:47:28.000Z | 0.7h; largest gap 10.1min at 2026-09-28T22:07:27.484Z | 0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); ASKs unavailable (no --lead-slug); wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges unavailable (no --lead-slug) |
| 47 | `wr-2026-09-28-repo-env-everywhere` | 2026-09-28T22:17:00.000Z | 2026-09-29T00:12:11.000Z | 1.9h; largest gap 40.9min at 2026-09-28T22:51:00.423Z | 0 gap(s) over 30min stalled; 1 waiting-on-agents (40.9 min); ASKs unavailable (no --lead-slug); wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges unavailable (no --lead-slug) |

Every rerun exited 0 and its top-tier tokens figure (8,917,860 / 11,623,981 / 18,248,547 / 14,735,966 / 35,706,699) matches the by-model figure already in the S3 table above, cited from each lane's own `-census.md`, confirming the rerun reads the same lead window. `--lead-slug`/`--ledger` were not passed, so the ASKs-unaddressed and stall-nudges cells in each rerun's own output print `unavailable (no --lead-slug)`, unchanged from before — outside this lane's territory. No lead transcript was missing and no rerun failed, so no line here reads `unread` or names an error.
# Lane55 R1 candidate Codex rows and receipts: [codex-rows.md](codex-rows.md).
