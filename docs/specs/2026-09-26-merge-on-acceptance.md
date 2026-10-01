# Lane eight: merge on acceptance, and a Done tick that reaches an idle lead

Written by skills-fable, 2026-09-26 about 11:05 New York. Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31. For a Claude lane lead from its pane's current session. Base: origin/main after release 0.20.11 (it carries one-launch, the reader fix and collect-from-origin). Branch build/merge-on-acceptance-1. Builders in their own worktrees.

## Why (Ben, 2026-09-26 10:55 NY, typed in the lead's pane)
"I want to let you keep merging your latest as you go, or at least keep building and not let it block you." Until now every merge to main was a Waiting item on his decisions page; lane six sat ready for an hour for no reason but the tick, and the lead learns of a tick only when something else gives it a turn: nothing reads the page while a lead is idle. He also asked "what's the exact mechanism for you to see that?" and the honest answer was: none.

Measures: hours ask to accepted (merge waits vanish from the path), work stalled (no accepted branch waits on a tick). Must not worsen: rework after acceptance, so the merge gate keeps the second-host suite.

## Territory M1: the merge gate and the page entry (skills/team-build/SKILL.md, skills/decisions/SKILL.md, skills/decisions/templates/decision-item.md, scripts/collect-from-origin.mjs only if a flag is needed)
1. Team-build's acceptance step changes from "post a merge item and wait" to: when the record on origin says accepted, the Opus review verdicts are in its evidence, and the sealed suite is green on a second host from origin (Windows when built on Linux, a Linux host when built on Windows; the lane lead runs it through ssh as lane six did, or asks the spec lead), the lane lead merges its branch into main with a merge commit and pushes, then posts one Closed entry on the owner's decisions page ("Merged <branch> at <sha>, <date>: <one-line changelog>; suite <n> of <n> on <host>") through the decisions skill's anchored route, and only then sends RESULT. No Waiting item. A conflict the lead cannot resolve as additive prose is the one case that still produces a Waiting item.
2. Releases and installs to the owner's machines stay per his word: the release item remains a decision, with the merged changelog lines as its evidence. Say this in one sentence in both skills.
3. The decisions skill's template gains the Closed-entry shape for a merge and drops "merges to main take your word per item" from the No-default line, keeping "installs take your word per item".
4. The collector (`collect-from-origin.mjs`) stays the audit: an accepted-unmerged row older than four hours is now a defect the lead reports, not a normal state. One sentence in docs where the collector is described.

## Territory M2: the Done tick wakes an idle lead (skills/multi/scripts/note-flush.mjs or the hook that runs it, hooks/lib, plus a test)
1. The one-minute flusher already runs while a lead is idle. Give it one more check: if `NOTION_TOKEN` is in its environment and the repo's decisions page id is known (from the decisions skill's configuration, wherever the reader takes it from today), read the page once per drain, and when the Done checkbox is true and was false at the last drain (state file next to flush.log), post one wake line into the owner-lead's inbox: "decisions page: Done ticked at <time NY>; run the reader". At most one line per flip. If the token or page id is absent, log `decisions-check skipped: <reason>` once per hour and do nothing else; that is the explicit unsupported state, no new process, no polling faster than the existing drain.
2. Test with a fake page fetch: false→true posts once; true→true posts nothing; missing token logs and does nothing.
3. Kill switch: `touch ~/.agents/notes/no-decisions-check` disables it; fails open.
Nothing under scripts/work-record.mjs, build-census.mjs, four-read.mjs, janitor.mjs; no README changelog.

## Acceptance
Sealed suite green on the branch on your host and on a second host from origin. Opus reviewer per territory; M2's attack brief: make the flusher post twice for one flip, make it block a drain when Notion is slow (it must time out under the drain budget), make it run without a token. Record with Lead-session, Spec-session, Spec-from, Base one sha; accept --census --four-read. Dogfood: merge this build under its own M1 rule, once the second-host suite is green, and post the Closed entry; that is the RESULT. Push at every Status change; a denied command stops the step and is reported; the git identity is never set by an agent; no trailers.
