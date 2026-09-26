VERDICT: PASS

# Setup report — merge-on-acceptance-1

## Worktrees created

Ran `git -C /home/ben/Code/wt-moa worktree add <worktree> -b <branch> 24e02eab356217a4c63725014d4fdd028cfb5891`
for each territory, then `git -C <worktree> rev-parse HEAD` to confirm the head.

- M1: worktree `/home/ben/Code/wt-merge-on-acceptance-1-M1`, branch
  `build/merge-on-acceptance-1-M1`. `git worktree add` exit 0 ("Preparing worktree (new
  branch 'build/merge-on-acceptance-1-M1')" / "HEAD is now at 24e02ea …"). `rev-parse
  HEAD` verbatim output: `24e02eab356217a4c63725014d4fdd028cfb5891`. `git status --short`
  clean.
- M2: worktree `/home/ben/Code/wt-merge-on-acceptance-1-M2`, branch
  `build/merge-on-acceptance-1-M2`. Same command, exit 0. `rev-parse HEAD` verbatim
  output: `24e02eab356217a4c63725014d4fdd028cfb5891`. `git status --short` clean.

The integration worktree/branch named in the task (`/home/ben/Code/wt-moa`, branch
`build/merge-on-acceptance-1`) already existed before this run, at the same head
(`24e02ea`), with `docs/work/wr-2026-09-26-merge-on-acceptance.record.md` already opened
by the lead (`Status: owned`, `Owner: skills-n`) — confirmed by reading it, not assumed.
I did not create or modify that worktree, its branch, or the work record; this run's own
scope was scouting and brief-writing only.

Confirmed ancestry before creating anything: `6d8ba95` (release 0.20.11, contracts.md's
stated base sha) is an ancestor of `24e02ea` (the task's given base sha), two commits
apart — both are doc-only commits (opening the work record, adding this spec pack). No
discrepancy to flag; the task's base sha is simply two commits ahead of contracts.md's.

## Scout pass (read-only, against the wt-moa checkout at 24e02ea)

One pass, both territories, per `skills/team-build/references/scout-brief.md`. Read every
file each territory's map names (team-build/SKILL.md, decisions/SKILL.md,
decision-item.md, census.md, pane-setup.md, GOALS.md for M1; note-flush.mjs,
note-flush.test.mjs, multi/SKILL.md, decisions-pickup.mjs, test-child-env.mjs,
hooks.test.mjs's N2 test for M2), confirmed every line number and premise the spec/
contracts cite still holds on this tree (some spec.md line numbers had drifted enough
that contracts.md's own re-derivation was needed — noted in each scout file), and found
two concrete regression risks in M2 (existing `deepEqual` tests on `buildFlushStatus`'s
json shape) and one already-answered-elsewhere open question resolved in the M1/M2
briefs themselves rather than left for the builder.

- `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/briefs/scout-M1.md` (40 lines,
  4 sections: files/symbols, helpers to reuse, tests that police the area, open questions).
- `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/briefs/scout-M2.md` (same
  4-section shape).

Both scout files' findings are folded into the corresponding territory brief; where a
scout open question needed a ruling to give the builder an unambiguous brief, I ruled on
it explicitly in that territory's brief (named as "Ruling on scout-<id>.md's ... open
question" inline) rather than leaving it open — per scout-brief.md's own rule that the
spec/contracts win once the orchestrator has ruled on a discrepancy.

One correction made after the first scout/brief pass: contracts.md's territory map
assigns the R5 "Done-window write rules" (and the pickup-host sentence) to M1's
`decisions/SKILL.md` edit, but spec.md's own M1 item list doesn't mention it (it's only in
contracts.md). My first draft of `briefs/M1.md` omitted it; caught on a second read of
the territory map and added as its own named block plus a sub-item under the exact-edits
list before finishing this report.

## Briefs written

All five, from `docs/mandate-template.md`'s field shape, each citing the spec pack (spec,
contracts, redteam where relevant, and its own scout file) by path, never restating their
content inline beyond quoting the exact lines being edited:

- `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/briefs/M1.md` — builder mandate,
  Gate + State-file fields present (docs-only gate:
  `node --test skills/decisions/scripts/skill-text.test.mjs scripts/work-record.test.mjs`).
- `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/briefs/M2.md` — builder mandate,
  Gate + State-file fields present
  (`node --test skills/multi/scripts/note-flush.test.mjs && node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs`).
- `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/briefs/reviewer.md` — review
  mandate (no Gate/State-file fields, per the template's own instruction for a review
  lane), one shared shape with a per-territory attack-brief section for each of M1 and M2.
- `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/briefs/integrator.md` — mandate
  naming the full-suite gate the task specified: `node scripts/run-tests.mjs`, judged
  against "no new failing test name vs base 6d8ba95" (contracts.md R8), with the two known
  pre-existing Windows-path failures (H6 `note-send.test.mjs:367`, V4
  `mirror-shim.test.mjs:269`) named from the prior build's own confirmation and flagged to
  be RE-confirmed at this build's base rather than assumed still valid.
- `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/briefs/seam.md` — seam-reviewer
  mandate scoped to the one real cross-territory surface: both territories independently
  describe the same registered-pickup mechanism (M1 in decisions/SKILL.md prose, M2 in
  note-flush.mjs's status line) without either one activating it; five concrete checks for
  where those two descriptions could drift apart from each other or from the actual code.

## What I did not do

- Did not open or touch `docs/work/wr-2026-09-26-merge-on-acceptance.record.md` — already
  opened by the lead before this run.
- Did not spawn any builder, reviewer, integrator, or seam agent — this run's scope was
  worktrees, scout, and briefs only, per the task.
- Did not touch `docs/GOALS.md`, `scripts/collect-from-origin.mjs`,
  `skills/decisions/scripts/decisions-pickup.mjs`, or any file under `hooks/` —
  contracts.md's off-limits list, respected in both the scouting reads (read-only there
  too) and the briefs written.
- Did not set or switch any git identity, did not push either new branch, added no
  trailers, sent no peer notes.

## Territory table

| id | worktree | branch | brief | gate | headSha |
|----|----------|--------|-------|------|---------|
| M1 | /home/ben/Code/wt-merge-on-acceptance-1-M1 | build/merge-on-acceptance-1-M1 | docs/specs/merge-on-acceptance-1/briefs/M1.md | `node --test skills/decisions/scripts/skill-text.test.mjs scripts/work-record.test.mjs` | 24e02eab356217a4c63725014d4fdd028cfb5891 |
| M2 | /home/ben/Code/wt-merge-on-acceptance-1-M2 | build/merge-on-acceptance-1-M2 | docs/specs/merge-on-acceptance-1/briefs/M2.md | `node --test skills/multi/scripts/note-flush.test.mjs && node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs` | 24e02eab356217a4c63725014d4fdd028cfb5891 |
