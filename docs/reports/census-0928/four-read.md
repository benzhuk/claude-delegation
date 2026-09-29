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
actually qualify — the packet's 9 plus **31, 32 and 33**, which closed 8, 24 and 24 minutes past
midnight NY respectively. This is reported to lane 38's owner below as a finding, not corrected in
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
| **Baseline (hand-run, 2026-09-25 bearings O9, no source record)** | not tracked pre-census | not tracked | not tracked | not tracked | **152 turns** (`docs/GOALS.md:56`: "19 and 67 orchestrator turns on the two loop builds against 152 turns (no source record; 2026-09-25 bearings O9)"); same line also pins loop-gates' 7 turns (hand count, unchecked) and census-complete's 32 turns (script-counted, over the 20-turn target) |
| Lane 31 sealed-signal — lead `01a0df4c-2809-7520-b1d7-876cc51a87ee` (Codex, host Windows) | unread (Codex census PARTIAL: unverified/out-of-contract discovery candidate; window outside default discovery horizon — `wr-2026-09-27-sealed-signal.census.md:1,10`); reviewer: Codex child nickname `Averroes`, no token figure printed | 0.9h; largest native API response gap (heuristic) 3.2min at 2026-09-28T02:59:38.514Z | 0 commits touching build files in 7 days; 0 re-accept Log entries | stalled classification unavailable (native span coverage not established); 0 native response gaps >30min (heuristic); 1 unanswered ASK to skills-a (skills-fable-lane-31-1) | 1 native user turn (Codex `leadTurns`, `wr-2026-09-27-sealed-signal.census.md:11`) |
| Lane 32 autolink-guard — lead `588290d9-ee43-400b-a808-cf44c407171c` (Claude, host Windows) | lead 4,844,410 (claude-opus-5-5); reviewer: same-session Opus self-review, no separate reviewer session id printed on record (`wr-2026-09-27-autolink-guard.record.md:18` names "skills-o Opus reviewer" with no id) | 7.4h; largest gap 179.1min at 2026-09-28T07:11:42.049Z | 0 commits touching build files in 7 days; 0 re-accept Log entries | 1 gap >30min stalled; 4 waiting-on-agents spans (415.1 min total); agent `a356bf87ac505c39d` silent 413.3 min from 2026-09-28T03:15:48.781Z (2026-09-27 11:15 PM NY); 0 unanswered ASKs to skills-o | 9 |
| Lane 33 collect-followups — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | lead 9,838,870 (claude-opus-5-5); reviewer agent `a8261c864f5d0c8dc` (`wr-2026-09-28-collect-followups.record.md:19`, named "Opus reviewer a8261c864f5d0c8dc"; that file appears in the census's default subagents dir with 53 in-window turns, `wr-2026-09-28-collect-followups-census.md:57` — no separate per-agent token figure, only the aggregate "unassigned" bucket, `:10`) | 0.6h; largest gap 14.4min at 2026-09-28T03:48:51.781Z | 1 commit touching build files in 7 days: 55ae08f | 0 gaps >30min stalled; 0 waiting-on-agents; 0 unanswered ASKs to skills-n | 7 |
| Lane 34 pickup-binding — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | lead 10,887,369 (claude-opus-5-5); reviewer agent `a3419dc7f623522d7` (`wr-2026-09-28-pickup-binding.record.md:20`; per-agent tokens unread, same aggregate-only limit as lane 33) | 0.6h; largest gap 14.7min at 2026-09-28T19:15:48.850Z | 1 commit touching build files in 7 days: 386c84c | 0 gaps >30min stalled; 0 waiting-on-agents; 0 unanswered ASKs to skills-n. Record's own Stall note (`:68`): "none occurred" — the only Log mention of "stall" is the watcher name itself | 8 |
| Lane 37 codex-parity — lead `01a0df4c-2809-7520-b1d7-876cc51a87ee` (Codex, host Windows) | unread (Codex census PARTIAL, same reason as lane 31 — `wr-2026-09-28-codex-parity.census.md:1,10`); reviewer: Codex child nickname `Averroes`, no token figure; separately, "Claude Opus review" via ASK ids skills-fable-lane-37-7/-10, no session id printed | 3.4h; largest native response gap (heuristic) 3.2min at 2026-09-28T22:25:57.087Z | 4 commits touching build files in 7 days: aafc1d0, 1841065, 8b1f4bf, 325fb41; 0 re-accept Log entries before the second acceptance | stalled classification unavailable; 0 native response gaps >30min (heuristic); 1 unanswered ASK to skills-a (skills-fable-lane-37-1). Record's own text (`:57`, `:47`) frames "work lost or stalled" as its own named measure for Codex-led builds; two BLOCKED Netcup gate attempts are on record (exit 127 then exit 1 — `docs/specs/codex-parity-37/L37-netcup-integration.md:1`), not literally "false reds" in this record's own words | 2 native conversational turns (Codex `leadTurns`); 169 verified top-tier native API responses (a different measure, per the record's own caution at `:67`) |
| Lane 38 census-completeness — lead `588290d9-ee43-400b-a808-cf44c407171c` (Claude, host Windows) | lead 11,940,121 (claude-opus-5-5); reviewer: same-session Opus self-review, no separate id (`wr-2026-09-28-census-completeness.record.md:17`, "skills-o Opus reviewer") | 0.8h; largest gap 10.2min at 2026-09-28T21:42:00.854Z | 0 commits touching build files in 7 days; 0 re-accept Log entries | 0 gaps >30min stalled; 0 waiting-on-agents; 0 unanswered ASKs to skills-o; wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-o | 9 |
| Lane 42 stale-session-guard — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | top-tier 8,917,860 (claude-opus-5-5; lead plus subagents in that census window, `docs/work/evidence/wr-2026-09-28-stale-session-guard-census.md:9`); this lane's own four-read (`wr-2026-09-28-stale-session-guard-four-read.md`) still prints `unavailable (no census)` for this cell — not stale (both files were added in the same accept commit, `abf6165`), it is a different-path miss, reported as a finding for lane 38's owner below; reviewer agent `a361ba9598eff58b8` (`wr-2026-09-28-stale-session-guard.record.md:20`) | 0.6h; gap unavailable (no lead transcript, per the four-read that was run) | 0 commits touching build files in 7 days; 0 re-accept Log entries | gaps unavailable (no lead transcript); 0 unanswered ASKs to skills-n. Record's own Stall note (`:68`): "no agent went quiet, every one reported inside its ETA" | 7 (from the lane's own later census file, `wr-2026-09-28-stale-session-guard-census.md:7`) |
| Lane 43 cross-host-nudge — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | top-tier 11,623,981 (claude-opus-5-5; lead plus subagents in that census window, `docs/work/evidence/wr-2026-09-28-cross-host-nudge-census.md:9`); this lane's own four-read still prints `unavailable (no census)`, same different-path miss as lane 42 (added in the same accept commit, `7cda069`), reported as a finding for lane 38's owner below; reviewer agent `a59ef3b3dbd0ae94c` (`wr-2026-09-28-cross-host-nudge.record.md:19`) | 0.6h; gap unavailable (no lead transcript) | 0 commits touching build files in 7 days; 0 re-accept Log entries | gaps unavailable (no lead transcript); 1 unanswered ASK to skills-n (skills-fable-lane-43-1). Record's own Stall note (`:67`): "no agent went quiet, every one reported inside its ETA" | 9 (from the lane's own later census file, `wr-2026-09-28-cross-host-nudge-census.md:7`) |
| Lane 44 transport-identity — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | top-tier 18,248,547 (claude-opus-5-5; lead plus subagents in that census window, `docs/work/evidence/wr-2026-09-28-transport-identity-census.md:9`); this lane's own four-read still prints `unavailable (no census)`, same different-path miss (added in the same accept commit, `90bcef2`), reported as a finding for lane 38's owner below; reviewer agent `a4cace0c0e074c6a6` (`wr-2026-09-28-transport-identity.record.md:20`) | 0.7h; gap unavailable (no lead transcript) | 0 commits touching build files in 7 days; 0 re-accept Log entries | gaps unavailable (no lead transcript); 2 unanswered ASKs to skills-n (pickup-netcup-decisions-...-4, skills-fable-release-0-20-17-1). Record's own Stall note (`:68`): "no agent went quiet" | 7 (from the lane's own later census file, `wr-2026-09-28-transport-identity-census.md:7`) |
| Lane 46 test-temp-hygiene — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | top-tier 14,735,966 (claude-opus-5-5; lead plus subagents in that census window, `docs/work/evidence/wr-2026-09-28-test-temp-hygiene-census.md:9`); this lane's own four-read still prints `unavailable (no census)`, same different-path miss (added in the same accept commit, `76cb236`), reported as a finding for lane 38's owner below; reviewer agent `adac9198d7d100193` (`wr-2026-09-28-test-temp-hygiene.record.md:19`) | 0.7h; gap unavailable (no lead transcript) | 0 commits touching build files in 7 days; 0 re-accept Log entries | gaps unavailable (no lead transcript); 1 unanswered ASK to skills-n (skills-fable-lane-47-1 — named in this lane's own four-read text verbatim, apparently copied from lane 47). Record's own Stall note (`:67`): "no agent went quiet" | 10 (from the lane's own later census file, `wr-2026-09-28-test-temp-hygiene-census.md:7`) |
| Lane 47 repo-env-everywhere — lead `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e` (Claude, this host) | top-tier 35,706,699 (claude-opus-5-5; lead plus subagents in that census window, `docs/work/evidence/wr-2026-09-28-repo-env-everywhere-census.md:12`); this lane's own four-read still prints `unavailable (no census)`, same different-path miss (added in the same accept commit, `a146e44`), reported as a finding for lane 38's owner below; reviewer agent `a4a42ea240cc29011` (`wr-2026-09-28-repo-env-everywhere.record.md:21`) | 1.9h; gap unavailable (no lead transcript) | 0 commits touching build files in 7 days; 0 re-accept Log entries | gaps unavailable (no lead transcript); 1 unanswered ASK to skills-n (skills-fable-lane-47-1); wakes unavailable (no census); Stop-blocks unavailable (no census); stall nudges 0 to skills-n | 19 (from the lane's own later census file, `wr-2026-09-28-repo-env-everywhere-census.md:7`) |
| Lane 48 render-readback — lead `01a0df4c-2809-7520-b1d7-876cc51a87ee` (Codex, host Windows) | unread (Codex census PARTIAL, same reason as lanes 31/37 — `wr-2026-09-28-render-readback.census.md:1,10`); reviewer: Codex child nickname `Averroes`, no token figure; separately "Claude Opus 5.5 reviewer" via ASK ids skills-fable-lane-48-4/-6, no session id printed | 0.6h; largest native response gap (heuristic) 3.1min at 2026-09-28T23:25:03.874Z | 0 commits touching build files in 7 days; 0 re-accept Log entries | stalled classification unavailable; 0 native response gaps >30min (heuristic); 1 unanswered ASK to skills-a (skills-fable-lane-48-1); wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-a. This lane's own defect trail (see below) is one of the packet's three named stalls | 1 native conversational turn (Codex `leadTurns`); 109 verified top-tier native API responses |

### Work lost or stalled: the packet's three named stalls, checked against records

1. **"Lane 36's builder hang at 6:12 PM NY."** Not found in this shape on this host. Lane 36 has
   no closed record in `docs/work/` at all (its own Scratch-header field "has not merged" per this
   lane-50 record's own Log line) — the only builder hang this reader could find anywhere in the
   12 lanes is autolink-guard's (lane 32) agent `a356bf87ac505c39d`, silent 413.3 minutes from
   2026-09-28T03:15:48.781Z = **2026-09-27 11:15 PM NY**, whose root cause is documented as lane
   42's own research subject (`docs/specs/pickup-binding-1/spec.md:27`: "root cause of the 9/28
   03:15Z builder hang... a builder sat 16 minutes at a delete prompt"). Neither the time (6:12 PM)
   nor the lane number (36) matches this reader's own finding. Listed as a finding for lane 38's
   owner below.
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
   lane 48's accept/close Log lines land at 2026-09-28T23:44:00Z / 23:57:13Z = **7:44 PM / 7:57 PM
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

**Exact reader command** (run over ssh on ben-desktop, where the file exists), read time fixed at
this report's own generation time, 2026-09-29T00:19:27Z:

```
node scripts/build-census.mjs --lead "C:\Users\benzh\.claude\projects\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl" \
  --from 2026-09-28T19:00:00Z --to 2026-09-29T00:19:27Z
```

To check the bearings prediction (65M tokens in the 24-hour window) at 3:00 PM NY on 2026-09-29
(= 2026-09-29T19:00:00Z), run the same command over ssh on ben-desktop with only `--to` advanced:

```
node scripts/build-census.mjs --lead "C:\Users\benzh\.claude\projects\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl" \
  --from 2026-09-28T19:00:00Z --to 2026-09-29T19:00:00Z
```

Value: **read** (see above). The second command, for the 24-hour bearings check at 3:00 PM NY on
2026-09-29, has not yet been run.

## DONE section (S5)

`docs/GOALS.md:28` — "DONE is a test with numbers, run once from a Claude lead and once from a
Codex lead with a mixed handoff between them."

- **Led once from Claude:** proven. 9 of the 12 lanes have a Claude `Lead-session:` with a
  `COUNTED` (non-partial) Claude census verdict — e.g. lane 33 collect-followups, lead
  `f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e`, `wr-2026-09-28-collect-followups-census.md:1`.
- **Led once from Codex with a mixed handoff, both ids on record:** **not yet**. Lanes 31, 37 and
  48 are Codex-led (`Lead-session: 01a0df4c-2809-7520-b1d7-876cc51a87ee`) with a Claude Opus
  reviewer named in every one of them, but in no record is the Claude reviewer's own session id
  printed — only ASK ids (e.g. `skills-fable-lane-48-4`) and, in the Codex census's child-discovery
  table, a nickname (`Averroes`) with no session id of its own
  (`docs/work/evidence/wr-2026-09-27-sealed-signal.census.md:58`). "Both ids on record" fails on
  every one of the three candidate lanes.
- **Lead under 20 turns:** proven, repeatedly. All 12 lanes' `leadTurns` are under 20 — the
  highest is lane 47's 19 (`wr-2026-09-28-repo-env-everywhere-census.md:7`); the lowest Claude-lane
  count is 7 (lanes 33, 42, 44).
- **Nothing lost or stalled, with the count:** proven for at least lane 33 (collect-followups):
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
2. **Reviewer tokens, all 9 Claude-led lanes:** `unread (per-agent token breakdown not printed —
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
   lane's own four-read.md. This part is genuinely unread: none of the 5 lanes' `-census.md` files
   carry a largest-gap or per-turn timing figure at all (their Summary sections have only
   `leadTurns`, `wallClockHours`, `by-model`/`by-role` totals and `subagentFiles` — see e.g.
   `docs/work/evidence/wr-2026-09-28-stale-session-guard-census.md:7-11`), so re-pointing four-read
   at the existing census.md would not fill this cell either way. The top-tier tokens half of this
   same finding, previously listed here as unread, is now read: each lane's `-census.md` by-model
   line does carry a top-tier (claude-opus-5-5) total covering the lead's window plus its
   subagents, and those figures are now in the table above, cited file:line
   (`wr-2026-09-28-stale-session-guard-census.md:9`, `wr-2026-09-28-cross-host-nudge-census.md:9`,
   `wr-2026-09-28-transport-identity-census.md:9`, `wr-2026-09-28-test-temp-hygiene-census.md:9`,
   `wr-2026-09-28-repo-env-everywhere-census.md:12`). Missing (for the gap/hours part only): a
   per-turn or per-response timestamp measure in `build-census.mjs`'s own output, which none of
   these 5 lanes' census files have.
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
5. **Wakes/Stop-blocks, lanes 47 (repo-env-everywhere) and 42/43/44/46 (stale-session-guard,
   cross-host-nudge, transport-identity, test-temp-hygiene):** `unavailable (no census)` in 4 of
   the 5, and simply absent from the printed row (no wakes/Stop-blocks clause at all) in the other.
   Same root cause as finding 4b: the different-path miss between `four-read.mjs`'s own `--census
   <json>` flag and `build-census.mjs`'s markdown-only output.
6. **Fable lead row tokens (S4):** read. The lead ran `build-census.mjs` over ssh on ben-desktop
   (claude-delegation checkout at `9435161`, Windows), against the real `--lead` path, and
   committed its output at `docs/reports/census-0928/fable-lead-census.md`: leadTurns 39, wakes 15
   (15 note-flush, 0 Done-tick), Stop-blocks 1, by-model totals as quoted in S4 above. Stall
   nudges were unavailable because the ledger dir was unreadable on that run
   (`docs/reports/census-0928/fable-lead-census.md:11`) — nothing else is missing.
7. **Packet stall #1 ("lane 36's builder hang at 6:12 PM NY"):** could not be corroborated on this
   host. Missing: either lane 36's own record (not yet closed, per this lane-50 record's own Log
   line: "lane 36's Scratch header field has not merged") reaching a state where its stall can be
   read, or a correction to the packet's lane number/time if it in fact meant lane 32's
   2026-09-27T03:15:48.781Z UTC (11:15 PM NY 9/27) hang.
8. **Packet stall #2 ("lane 37's Netcup gate false reds"):** the literal phrase is not on lane 37's
   record; what is on record is a two-exit BLOCKED attempt (127 then 1) plus the shared exit-5
   readback defect. Missing: a correction to the packet's wording, or a pointer to whichever
   evidence file actually uses the words "false red" for lane 37, if one exists off this host.

## Verdict (Opus, pending)
