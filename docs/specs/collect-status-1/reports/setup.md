VERDICT: PASS

# Setup — collect-status-1

Base sha given: 31a23e2. Resolved: `git rev-parse 31a23e2` -> `31a23e24171fe846b406722bd05541a76ced2983`.

## Worktrees created

Ran, per territory: `git worktree add <worktree> -b <branch> 31a23e2` then
`git -C <worktree> rev-parse HEAD`. Full verbatim output of the rev-parse for each:

- C1: worktree `/home/ben/Code/wt-collect-status-1-C1`, branch `build/collect-status-1-C1`
  headSha `31a23e24171fe846b406722bd05541a76ced2983`
- C2: worktree `/home/ben/Code/wt-collect-status-1-C2`, branch `build/collect-status-1-C2`
  headSha `31a23e24171fe846b406722bd05541a76ced2983`
- C3: worktree `/home/ben/Code/wt-collect-status-1-C3`, branch `build/collect-status-1-C3`
  headSha `31a23e24171fe846b406722bd05541a76ced2983`

All three worktrees created cleanly (`git worktree add` exit 0, new branch each time — none of
the three target paths or branch names pre-existed). All three head shas equal the resolved base
sha since nothing was committed into the new branches yet.

## Scouting

One scout pass (done directly, not via a spawned sub-agent, since this setup job's mandate
covered the whole pipeline) against the base tree per `skills/team-build/references/scout-brief.md`,
read-only, no worktree touched during the survey. Output, one file per territory, at most 40 lines
each:

- `/home/ben/Code/wt-cs/docs/specs/collect-status-1/briefs/scout-C1.md`
- `/home/ben/Code/wt-cs/docs/specs/collect-status-1/briefs/scout-C2.md`
- `/home/ben/Code/wt-cs/docs/specs/collect-status-1/briefs/scout-C3.md`

Notable finding folded into C3's brief and flagged as pre-authorized: `scripts/wiring-check.test.mjs:730-732`
asserts the shipped `required-wiring.default.json` list has exactly 17 entries ("9 original + 8
new"), read straight off the real file. C3's one new `collect-status-fresh` row bumps that to 18
and will fail this assertion unless bumped; the brief pre-authorizes that one-line, mechanical
count fix even though `wiring-check.test.mjs` is outside C3's stated file list, so C3's builder
does not need to check in for it.

Also found: `scripts/install-janitor-timer.test.mjs:100` pins `scheduledCommandArgv`'s exact argv
for a call made WITHOUT a job argument — C2's brief calls this out explicitly so the new `--job`
parameter defaults to byte-identical behavior for every existing caller.

No test file anywhere yet references `collect-status.mjs`, `collect-status-fresh`, or any sentence
in `docs/GOALS.md`/`skills/continue/SKILL.md` about lane state — confirmed by grep, zero hits
outside the spec pack itself.

## Briefs written

Each from `docs/mandate-template.md`, filled with the spec, contracts.md, and the matching scout
file folded in by path (never restated):

- `/home/ben/Code/wt-cs/docs/specs/collect-status-1/briefs/C1.md`
- `/home/ben/Code/wt-cs/docs/specs/collect-status-1/briefs/C2.md`
- `/home/ben/Code/wt-cs/docs/specs/collect-status-1/briefs/C3.md`
- `/home/ben/Code/wt-cs/docs/specs/collect-status-1/briefs/reviewer.md` (one shared reviewer
  brief, reused per territory with the orchestrator naming which territory and commit range at
  spawn time; its attack brief is lifted verbatim from contracts.md's Process section)
- `/home/ben/Code/wt-cs/docs/specs/collect-status-1/briefs/integrator.md` (integration worktree
  `/home/ben/Code/wt-cs`, branch `build/collect-status-1`, full-suite gate `node
  scripts/run-tests.mjs`, zero-failures-on-Linux as the stated bar; also names the sealed-suite-
  on-a-second-host and Netcup live-proof steps from the spec's Acceptance section, with an explicit
  check-in requirement before the Netcup step)
- `/home/ben/Code/wt-cs/docs/specs/collect-status-1/briefs/seam.md` (the required seam review
  across the C2->C1 command seam, the C1 note, and the C1/C3 wiring-path match, spawned after all
  three territories are merged onto the integration branch)

Each territory brief: cites its own spec section and the pinned contracts.md rulings by path,
names its own gate command against its own new/changed test file, sets a state-file path, and
lists an explicit NOT list naming the other two territories' files. C2's and C3's briefs each
pre-authorize the one specific mechanical byte/count fix their own scout finding surfaced, so
neither builder needs a check-in round just to keep the suite green.

## Not done in this job (by design, per the setup mandate's scope)

- No builder, reviewer, or integrator agent was spawned — this job stops at briefs on disk.
- No work record was opened or edited (`docs/work/wr-2026-09-27-collect-status.record.md` already
  existed, owned by `skills-n`, before this job ran; never touched).
- No git identity was set or switched; no destructive git command was run; nothing was pushed.

## Deviations from the literal prompt

None. All three worktree/branch/brief paths match the prompt's computed names verbatim. The
reviewer/integrator/seam brief paths match the prompt's given paths verbatim.
