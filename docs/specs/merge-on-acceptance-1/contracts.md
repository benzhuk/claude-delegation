# merge-on-acceptance-1 — pinned contracts (lead's rulings on the spec)

Spec: `docs/specs/merge-on-acceptance-1/spec.md` (lane eight, from origin/docs/lane-specs-0925 aa11302).
Red-team: `docs/specs/merge-on-acceptance-1/reports/redteam.md` (Opus, verdict REWORK_M2). Every
finding there is adopted as ruled below; where this file and the spec disagree, this file wins.
Base sha for every worktree: `6d8ba95` (origin/main, release 0.20.11).

## R1. M2 feeds the existing registered pickup; no second reader

The spec's M2 (a new page read in the flusher, a state file next to flush.log, an hourly
skipped-log, a `no-decisions-check` switch) is dropped: registered pickup
(`skills/multi/scripts/note-flush.mjs` runPostFlushPickup, `skills/decisions/scripts/decisions-pickup.mjs`)
already reads the configured page after a timer drain, sends one ASK to the owner per round, times
out under the drain budget, and has the `ws-off-decisions` kill switch (red-team §1 table). The goal
card forbids a new mechanism while this one is unfed.

M2 becomes:
1. `buildFlushStatus` in `skills/multi/scripts/note-flush.mjs` (and only that function plus at most
   a small helper beside it): the `note-flush --status` human line gains `; pickup: <code> <age>` from
   the heartbeat's `pickup` annotation when present, else `; pickup: not registered on this host`
   decided by ONE lstat of `<agentsHome>/ws/decisions-pickup/registrations.json`, else
   `; pickup: disabled (<switch>)` when `ws-off` or `ws-off-decisions` exists. No new state file, no
   log line, no throttle, no page read, no network. `--status --json` gains the same as a `pickup`
   field (object or string, your choice, documented in the test).
2. Tests in `skills/multi/scripts/note-flush.test.mjs`: absent registration, present annotation
   (code + age), disabled switch. Every spawn uses `childEnv()` (the N2 test forbids spreading the
   process environment in a test file).
3. `skills/multi/SKILL.md`: one or two sentences where `note-flush --status` is described, saying
   the status line now reports the pickup state and what "not registered on this host" means.

Not a build deliverable (pickup-integration spec: no activation by builders; decisions SKILL.md:
never create it merely because the plugin is installed): writing `registrations.json` on Windows
with `owner: skills-fable`. The lead posts it as a by-hand decision item for Ben.

## R2. M1: the merge gate, in the named sentences only

Replace exactly the passages red-team §3 lists (team-build SKILL.md merge-item paragraph from
"After that `accept --census`" through "…so the collector still finds the branch.", the "before
the merge ask" clause, the Ship-step "post its merge item" clause; decisions SKILL.md "A lane
lead's own merge item" paragraph, keeping its two-writers and exit-3 sentences for the Closed
entry; decision-item.md's merge-item shape) with the spec's M1 rule:

When the record on origin says accepted, its Opus verdicts are in its evidence, and the sealed
suite is green on a second host from origin (a Windows host when built on Linux, a Linux host when
built on Windows), the lane lead merges its branch into main with a merge commit and pushes, then
posts one Closed entry on the owner's decisions page, then sends RESULT. No Waiting item.

Closed-entry shape (plain bullet, never starting with bold): `Merged <branch> at <sha>, <M-D>:
<one-line changelog>; suite <n> of <n> on <host>.`

Releases and installs stay per the owner's word: the release item remains a decision with the
merged changelog lines as evidence. One sentence in both skills. The template's release item uses
`No default: installs take your word per item` (new text; the spec's premise that it exists is
wrong).

## R3. Conflicts and the merge result

- Any conflict when merging into main (not just non-additive ones) → no merge; post a Waiting item
  with the conflicting paths. (Simplest rule; avoids a re-review question, team-build SKILL.md
  integration-changes sentence stays true.)
- When `origin/main` is not an ancestor of the branch tip, the merge result is a new tree: run the
  sealed suite on the merge commit (at least the lead's host, no new failing test name vs main)
  before pushing main.

## R4. Second-host evidence comes before accept

The second-host gate log is committed as record evidence BEFORE `accept` (any record change after
accept needs a fresh check). Say this in the team-build sentence. The second-host condition is
marked `(not checked)` in house style; the four-hour rule is checked by the collector's
`accepted-unmerged` rows and `hoursSinceLog` — say so where the collector is described
(`docs/census.md` near "at every merge tick"). `scripts/collect-from-origin.mjs` is NOT changed.

## R5. Done-window write rules (red-team F1), in decisions SKILL.md

Without these, feeding pickup wedges it once lane leads write the page:
1. The owner lead's first write in a pickup round clears Done; it then handles items from the
   saved capture (`open`) plus fresh reads, then runs `account`.
2. A lane lead whose fresh read shows Done checked does not write the page; it puts the Closed
   entry verbatim in its RESULT and the owner lead posts it after clearing Done.
3. Every round ends with `account`, or later ticks wake no one.
Plus one sentence: the pickup host is the host where the owner lead's inbox lives (note-send
delivers only on the recipient's host).

## R6. Other docs in M1

`docs/pane-setup.md` lines red-team §3 names (the merge ask, "the only pane that writes the
decisions page", "for the actual ship decision"): reword to the M1 rule. `docs/GOALS.md` is NOT
edited in this build (Ben's goal text, mirrored to Notion); the lead flags GOALS.md:21 to Ben.

## R7. Test pins M1 must respect

- `skills/decisions/scripts/skill-text.test.mjs` pins exact line wraps (its :50 and :57 against
  decisions SKILL.md) and forbids any line starting with `**`: do not rewrap those lines.
- `scripts/work-record.test.mjs` slices 800 chars from "Run the census at accept time" in
  team-build SKILL.md: leave that sentence and the ~800 chars after it intact; edits start after.
- Run the M1 gate below before reporting.

## R8. Gates and base failures

- M1 gate: `node --test skills/decisions/scripts/skill-text.test.mjs scripts/work-record.test.mjs`
  plus any test that greps the edited files (find them with grep; list them in the report).
- M2 gate: `node --test skills/multi/scripts/note-flush.test.mjs && node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs`
- Integration: `node scripts/run-tests.mjs`, no new failing test name vs base 6d8ba95. Known on
  this host (Netcup) at earlier bases: H6 (note-send.test.mjs) and V4 (mirror-shim.test.mjs); the
  integrator confirms them on a base export rather than assuming.
- Second host: the lead runs the sealed suite on Windows from origin after the integration head is
  pushed, before accept (R4).

## Territory map

- M1 (docs only): `skills/team-build/SKILL.md`, `skills/decisions/SKILL.md`,
  `skills/decisions/templates/decision-item.md`, `docs/census.md`, `docs/pane-setup.md`.
- M2: `skills/multi/scripts/note-flush.mjs` (`buildFlushStatus` and a helper only),
  `skills/multi/scripts/note-flush.test.mjs`, `skills/multi/SKILL.md`.
- Off-limits: `scripts/` (all of it), `hooks/`, `.codex-plugin/`, `docs/GOALS.md`, README.md,
  `skills/decisions/scripts/`, everything else.
- Every prompt: never send peer notes; never set a git identity; no trailers; never push.
