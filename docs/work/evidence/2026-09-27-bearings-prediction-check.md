Prediction 1: MISSED (86,439,578 top-tier tokens > 20,000,000). Prediction 2: HELD (no accepted branch was absent from both main and the page for more than 4 hours in the window).

# Bearings prediction check, 2026-09-26T12:00:00Z to 2026-09-27T12:00:00Z

Predictions, quoted from `origin/docs/bearings-0926:docs/work/evidence/2026-09-26-bearings-assessment.md`:
- "The lead's own census, `build-census.mjs --lead 9c61c35a… --from 2026-09-26T12:00Z --to 2026-09-27T12:00Z`, shows at most 20M top-tier tokens."
- "No origin branch with an accepted record is missing from both main and Ben's page for more than 4 h."

Method: fetched `origin` in `C:/Users/benzh/Code/claude-delegation` (read only, working tree untouched), then created a fresh detached worktree of `origin/main` (c25cc70) at `SCRATCH/wt-bearings-0927` so the census script run is main's own code.

## Prediction 1 — top-tier lead tokens in window

Command run from `SCRATCH/wt-bearings-0927`:
```
node scripts/build-census.mjs --lead <lead-session>.jsonl --from 2026-09-26T12:00:00Z --to 2026-09-27T12:00:00Z --json SCRATCH/bearings-census-0927.json
```
(no `--tasks`; the script's own default subagent globs supplied every subagent file). Output saved at `SCRATCH/bearings-census-0927.json`.

The script windowed by time without issue (`windowStartAt: 2026-09-26T12:00:03.976Z`, `windowEndAt: 2026-09-27T11:59:56.791Z`), so the fallback node one-liner for token summing was not needed. I did write one short node script, `SCRATCH/largest-gap-0927.mjs`, to compute the largest inter-message gap (a stat `build-census.mjs` does not itself report) — it reads only each line's `timestamp` field and prints counts/timestamps, nothing else.

**Lead top-tier tokens by model, in window** (only `claude-fable-5-1` appears; no `claude-opus-5-5` in the lead's window):
| model | cache_creation | cache_read | input | output | total |
|---|---|---|---|---|---|
| claude-fable-5-1 | 2,341,882 | 83,680,024 | 11,542 | 406,130 | **86,439,578** |

**Total top-tier tokens in window: 86,439,578** — 4.3x the 20,000,000 ceiling. **MISSED.**

Other requested numbers:
- **leadTurns in window:** 108 (whole-file `leadTurnsTotal` is 553; `windowTurns`, the deduped assistant-turn count in window, is 468; turns/hour in window 19.5).
- **Largest gap:** 250.07 minutes (4.17 h), from 2026-09-26T14:07:17.155Z to 2026-09-26T18:17:21.342Z, computed over all 4,178 lead-file messages timestamped inside the window.
- **Subagent files:** the script found **325** files under the lead's default `subagents/` glob (no explicit `--tasks` dir was passed). Of those, **72** had at least one in-window turn and were included in the token/role tables (all landed in `roleFileCounts: {"unassigned": 72}`, since no `--role-map` was given and none were under a `workflows/<runId>/` subdirectory); **253** were excluded down to 0 in-window turns (either pre-window or genuinely empty transcripts). 0 files were unreadable. 11,509 total subagent turns were excluded as outside the window.

## Prediction 2 — accepted-branch visibility

For every `origin/build/*` branch (21 total), read the branch-tip work record for `Status:`. Three branches are mid-build, not accepted, and are out of scope: `codex-census-1`/`-c1`/`-c3` and `measure-truth-1` (Status: owned), `knowledge-counted-1` (Status: owned), `fresh-walk-1` (Status: reviewed, not yet accepted). `gate-under-load-1-g1` shares `gate-under-load-1`'s own record (same lane, one row below). `decisions-actions-1` has no `wr-*.record.md` of its own on any branch (confirmed no-record as of the 2026-09-26T13:35 collector run embedded in `wr-2026-09-26-collect-from-origin.record.md`); it was a direct Ben's-choice merge, documented and confirmed accepted on Ben's page instead of via the standard record.

All other 15 branches are `Status: accepted`, and every one of them **is** an ancestor of `origin/main** — none is currently unmerged. One correction from the raw ancestor check: `gate-under-load-1`'s own branch ref (tip `0ba90d0`) is not an ancestor of main because trailing evidence-only commits were added to it after acceptance, but its accepted artifact (`0c00422`) was merged into main via a separate commit `dad0f79` ("merge: accept gate under load") within a minute of acceptance — that is the merge event used below.

| branch | accepted at (UTC) | merged at (UTC) | hours between | on page (Closed bullet) |
|---|---|---|---|---|
| four-read-1 | 2026-09-26T01:58:02.000Z | 2026-09-26T11:18:19Z | 9.34 | yes (predates window; both accept and merge are before window start) |
| one-launch-1 | 2026-09-25T23:48:25.485Z | 2026-09-26T19:09:15Z | 19.35 | yes — "Merge the one-launch build loop into main (build/one-launch-1 at 05b9bcc) ... Result, 15:35 NY: merged clean as f24427c" |
| collect-from-origin-1 | 2026-09-26T14:01:05.000Z | 2026-09-26T19:14:57Z | 5.23 | yes — "Merge build/collect-from-origin-1 into main (3048d19) ... Result, 15:35 NY: merged" |
| decisions-actions-1 | no formal record | 2026-09-26T19:13:57Z | n/a | yes — "Merge the decisions-reader fix into main (build/decisions-actions-1 at f82ecb4) ... Result, 15:35 NY: merged clean" |
| one-launch-2 | 2026-09-26T19:24:46.000Z | 2026-09-26T19:34:33Z | 0.16 | yes — "Merge build/one-launch-2 into main (fd7839b) ... Merge commit 9f0dfee" |
| merge-on-acceptance-1 | 2026-09-26T20:55:04.000Z | 2026-09-26T20:55:13Z | 0.003 | yes — "Merged build/merge-on-acceptance-1 at b7ddf11" |
| codex-fresh-1 | 2026-09-26T20:30:30.336Z | 2026-09-26T20:42:51Z | 0.21 | yes — "Merge build/codex-fresh-1 into main (0fde057) ... merge commit 9c9f34b" |
| withdraw-status-1 | 2026-09-26T22:18:14.000Z | 2026-09-26T22:18:24Z | 0.003 | yes — "Merged build/withdraw-status-1 (lane nine) at 68d2a15" |
| janitor-fed-1 | 2026-09-26T21:40:38.000Z | 2026-09-26T22:32:23Z | 0.86 | yes — "Merged build/janitor-fed-1 (lane five) at bbd9f5d" |
| gate-under-load-1 | 2026-09-26T23:47:46.354Z | 2026-09-26T23:48:57Z (dad0f79) | 0.02 | yes — "Merged build/gate-under-load-1 (lane twelve...) at dad0f79 ... evidence folded onto main at c3f9ad0" |
| linux-green-1 | 2026-09-27T02:49:51.000Z | 2026-09-27T02:50:07Z | 0.004 | yes — "Merged build/linux-green-1 at 3bd6ef6" |
| overdue-asks-1 | 2026-09-27T04:23:41.000Z | 2026-09-27T04:23:51Z | 0.003 | yes — "Merged build/overdue-asks-1 at 7aad49b" |
| janitor-origin-1 | 2026-09-27T04:42:39.000Z | 2026-09-27T04:43:00Z | 0.006 | yes — "Merged build/janitor-origin-1 (lane eleven, led by skills-o) at c8f7668" |
| ledger-both-halves-1 | 2026-09-27T06:05:17.000Z | 2026-09-27T06:05:26Z | 0.003 | yes — "Merged build/ledger-both-halves-1 at 806d773" |
| delete-deny-1 | 2026-09-27T07:50:16.000Z | 2026-09-27T07:50:30Z | 0.004 | yes — "Merged build/delete-deny-1 (lane sixteen, led by skills-o) at e47504b" |

Two branches exceed the 4-hour accept-to-merge gap (`one-launch-1` at 19.35h, `collect-from-origin-1` at 5.23h), but both have a Closed bullet naming them on Ben's page (read at `SCRATCH/page-bearings.md`), so neither was absent from **both** surfaces for more than 4 hours — the page carried them as an open decision item before Closed. `four-read-1`'s 9.34h gap is entirely before the window (both its accept and its merge predate 2026-09-26T12:00:00Z) and is out of scope for this window's check. No accepted branch was ever unmerged-and-off-the-page for more than 4 hours inside the window.

**Verdict: HELD.**

## Cleanup

Worktree `SCRATCH/wt-bearings-0927` removed as its own standalone command after this report was written.
