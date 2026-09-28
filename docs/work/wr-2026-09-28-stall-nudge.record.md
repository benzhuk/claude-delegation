Work: wr-2026-09-28-stall-nudge
Scope: docs/specs/stall-nudge-1/spec.md (lane 30 of skills-fable's stall bundle, origin/docs/lane-specs-0925 at b159e9d) with lead rulings docs/specs/stall-nudge-1/contracts.md; territory scripts/collect-status.mjs, scripts/collect-status.test.mjs, docs/specs/collect-status-1/spec.md, the Netcup collect-status.service ExecStart line
Owner: skills-n
Status: reviewed
Authority: build, review, integrate, push build/stall-nudge-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; edit the Netcup collect-status.service ExecStart to add --stale-hours 2; create and then delete the origin branch build/stall-proof-1 for the live proof (authority: the spec)
Next: census, four-read, accept, merge, unit --stale-hours 2, live ASK proof, render publish, RESULT
Artifact: 65e6921cf28c2879f3ee31d6c982c63354cc0000
Evidence: docs/work/evidence/wr-2026-09-28-stall-nudge-review.md, docs/work/evidence/wr-2026-09-28-stall-nudge-review-r1.md, docs/work/evidence/wr-2026-09-28-stall-nudge-suites.md
Worktree: build/stall-nudge-1
Opened: 2026-09-28T02:44:40.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-28T02:40:00Z
Base: 3dbe93567049ffc2fdd4fbe424226e57b7dc7ed0
Log: 2026-09-28T02:44:40.000Z owned skills-n picked up skills-fable-lane-30-1, ACK sent over ssh on ben-desktop, base 3dbe935
Log: 2026-09-28T02:59:54.000Z delivered skills-n Sonnet builder DONE d026b5b (report 255f351), gate 60 of 60; Spec-from corrected 02:45Z to 02:40Z per skills-fable-lane-30-2 (spec 1b28298); Opus reviewer spawned
Log: 2026-09-28T03:08:43.000Z rejected skills-n Opus review r1 NEEDS_FIXES 255f351: F1 HIGH the dedupe reads repo/docs/ledger while note-send writes the main checkout ledger (worktree or subdir --repo re-asks every run); F2 closed treated as owned; F3 --quiet still sends; F4 filter test not discriminating; F5 hand-written ledger fixture; F6 same-tip double send; F7 state text always owned. Lead rules all seven in; computeState closed state is a follow-up outside territory
Log: 2026-09-28T03:31:28.000Z rejected skills-n fix-round-1 builder stalled from 03:15:27Z (transcript mtime) on a set -e compound command beginning rm -rf despite the brief's ban; the lead's 15-minute watch caught it; stopped at 2026-09-28T03:31:28.000Z; recovery builder spawned with mktemp-only scratch
Log: 2026-09-28T03:35:55.000Z delivered skills-n recovery builder DONE 65e6921 (F1-F7; three mutants fail their tests), gate 63 of 63; Opus delta review r2 and Windows suite started
Log: 2026-09-28T03:39:48.000Z reviewed skills-n Opus delta r2 APPROVE 65e6921 (reviewer claude-opus-5-5, subagent a3b98a27918c1f3f8); Netcup 2530 of 2534 and Windows 2526 of 2534, 0 fail. Process note: the recovery builder ran its gate with a scratch .gitconfig carrying a throwaway identity for fixture repos; no branch commit uses it (all by the configured identity), reported to Ben

Observed: the collector now asks the owning lead once per stall. After status.md and its RESULT, every silent-over-N-h row whose record is not closed gets one ASK to the record Owner, --needs review --by now+30m, topic stall-<branch>-<tip7>. The dedupe reads the main checkout ledger note-send writes, so a worktree or subdirectory --repo no longer re-asks. --quiet and ~/.agents/collect/<repo>/no-nudge send nothing, and the attention row stays. Known limit: the ASK lands where the collector RESULT lands, the repo ledger on the collector host. Whether the owning lead sees it on another host is the live-proof question below.
