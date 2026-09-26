# Lane seven: one-launch fix round, the defects from its first real use, and Base as one sha

Written by skills-fable, 2026-09-26 about 09:55 New York. Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31. For a Claude lane lead (Opus) from its pane's current session. Base: origin/build/collect-from-origin-1 at 33aa023, which already contains main ac9c842, one-launch 05b9bcc and lane six 8de9e42. Branch build/one-launch-2. Builder in its own worktree, never the main checkout. Merge order on Ben's page is one-launch, then collect-from-origin, then this.

## Why (from lane six's RESULT and reports, 2026-09-26)
Lane six was the first real setup-mode use of skills/team-build/references/build-loop-workflow.js. It worked: 4 lead turns, 1.4 hours ask to accepted, 11.6M top-tier tokens, 0 rework. It also exposed four defects, all recorded by skills-n:
1. accept-prep runs the census before it writes the reviewed Log line, so accept refuses with census-stale on a clean run.
2. accept-prep replaced the whole record header with its own five lines: Work, Scope, Owner and the Log history were gone until the lead restored them from git by hand. That is lost work and rework, the two measures this lane moves.
3. given-territory mode has no seamBriefPath argument, so the seam review cannot be briefed in that mode.
4. The record's Base was written as `ac9c842+05b9bcc` on the lead's ruling. four-read cannot resolve that, so the four numbers read unavailable until a corrected copy was made by hand. The ruling was wrong in shape; the fix is that Base is always one sha.

Must not worsen: lead turns, Sonnet build tokens.

## Territory (one builder): skills/team-build/references/build-loop-workflow.js, build-loop-workflow.test.mjs, build-loop-args.example.json, and sentences in skills/team-build/SKILL.md
1. accept-prep order: write the reviewed Log line, then run the census, then check-acceptance. A test pins the order against a fake record and fails if the census runs first.
2. accept-prep never rewrites the header. It changes only the fields it owns, through the record CLI's existing commands; if the CLI has no in-place setter for a field, say so in a finding and use a read-modify-write that preserves every line it does not own. Test: a record with Work, Scope, Owner, Authority, Evidence and six Log lines goes through accept-prep and differs only in the fields accept-prep must change.
3. given-territory mode takes seamBriefPath with the same shape as spec-pack mode; the example args file shows it; a test covers it.
4. Base is one sha. When the lead gives two bases, pre-launch makes the merge commit on the branch and writes `Base: <merge sha>` plus a `Base-of: <sha>, <sha>` line for humans. SKILL.md says this in one sentence. Dogfood: rewrite Base in a scratch copy of lane six's record to its merge commit and run four-read on it; paste the numbers in the record.
Nothing under scripts/, hooks/, .codex-plugin/; no README changelog edit; the RESULT carries the one-line entry.

## Acceptance
Sealed suite green on your host. One Opus reviewer with an attack brief: make accept-prep drop a header line it does not own; make the order test pass while the code still runs the census first; feed given-territory mode a missing seamBriefPath. Record docs/work/wr-2026-09-26-one-launch-fix.record.md with Lead-session, Spec-session as above, Spec-from the timestamp of this file's commit, Base as one sha; check-acceptance; accept --census --four-read. Post your own merge item to Ben's page before RESULT, as lane six did. Push the record at every Status change; notes over ssh on ben-desktop as you did for lane six. A denied command stops the step and is reported, never routed around. The git identity is never set by an agent; no trailers.
