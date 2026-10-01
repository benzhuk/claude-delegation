MISSED (65,108,489 claude-fable-5-1 tokens > 40,000,000, over by 25,108,489; windowTurns 335 > 200, over by 135)

# Bearings prediction check, 2026-09-27T12:00:00Z to 2026-09-28T12:00:00Z (8:00 AM to 8:00 AM New York)

Run at 2:56 PM New York on 9/28. Census script from a fresh detached worktree of origin/main at 3323d75 (release 0.20.16), `SCRATCH/wt-census-0928`.

Prediction, from `origin/docs/bearings-0927:docs/work/evidence/2026-09-27-bearings-assessment.md`: "The lead census for 2026-09-27T12:00Z to 2026-09-28T12:00Z shows at most 40M claude-fable-5-1 tokens in total, cache reads included. It also shows at most 200 windowTurns. If the lead changes sessions, the sum over all lead sessions in the window counts."

## Lead files considered
| file | in-window assistant messages | models | verdict |
|---|---|---|---|
| 9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl (gudgeon, primary) | 663 | claude-fable-5-1 (662), synthetic (1); first at 2026-09-27T12:00:07Z | IN |
| 588290d9-ee43-400b-a808-cf44c407171c.jsonl (gudgeon) | 342 | claude-opus-5-5 only; first at 13:43Z | OUT, not fable |
| 821a9ac9-d22c-4132-89f3-7f8d49a10e05.jsonl (stopprobe scratchpad) | 21 | claude-opus-5-5 only; first at 13:37Z | OUT, not fable |

No other transcript under a claude-delegation path was modified since 9/27 6:00 AM. Only one fable lead exists, so the sum is the primary file alone.

## Census, claude-fable-5-1, `lead.windowByModel` (JSON: SCRATCH/bearings-census-0928-1.json)
| window | input | output | cache_creation | cache_read | total | windowTurns |
|---|---|---|---|---|---|---|
| 9/27 12:00Z to 9/28 12:00Z | 7,710 | 302,780 | 1,235,833 | 63,562,166 | **65,108,489** | **335** |
| 9/26 12:00Z to 9/27 12:00Z (previous) | 11,542 | 406,130 | 2,341,882 | 83,680,024 | 86,439,578 | 468 |
| change | -3,832 | -103,350 | -1,106,049 | -20,117,858 | -21,331,089 (-24.7%) | -133 (-28.4%) |

The previous-window row reproduces yesterday's report exactly. In-window range of the primary file: 2026-09-27T12:00:02.926Z to 2026-09-28T10:35:08.150Z. The census output does not print user turns or the largest gap, so neither is reported.

## Verdict
Both bounds failed. Tokens are 162.8% of the 40M bound. windowTurns are 167.5% of the 200 bound.

## Cleanup NOT DONE (denied)
Removing the worktree with `git worktree remove --force` was refused by the delete-guard hook, verbatim: "recursive delete refused for an agent (git worktree remove --force). Removal of worktrees and scratch is the lead's own standalone command; report what needs deleting."
The lead needs to remove the detached worktree `SCRATCH/wt-census-0928` (registered under MAIN).
