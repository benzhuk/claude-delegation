VERDICT: APPROVE 70e4c344fe90927ac87d401538ea8ea519325a6a

# G1 review, round 2 (delta)

Artifact: 70e4c344fe90927ac87d401538ea8ea519325a6a. The later commits (572676d, 579b921) change only files under `docs/specs/.../reports/`, and `git diff --stat 70e4c34 579b921 -- skills docs/pane-setup.md` is empty. The worktree was not written: `git status --short` is clean apart from this report.

Method: the restart addendum rules still applied.

- `mutate-r2.mjs` is one node script. For each mutation it copies `scripts/` and `templates/` into a new scratch dir `mut-r2-<name>-<Date.now()>`, does a plain string replace (and asserts the replace applied), then runs `node --test` on the two territory files.
- `probe.mjs` and `probe2.mjs` re-ran read-only against the worktree.
- All of these live in `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/g1r/`. There were no shell scripts, no deletions and no in-place sed or perl. Every check returned.

Territory tests: 136 tests, 136 pass, 0 fail (r2-baseline copy). The real `docs/GOALS.md` render exits 0.

## Prior findings, each verified

| Finding | Status | Evidence |
|---|---|---|
| M1 date column | FIXED | goals-mirror.mjs:111-119 match the recommended patch verbatim. New test "table date: the latest standalone ISO date…". Mutation checks: earliest date instead of latest gives 133/3; letting file-name dates count gives 135/1 (the new test fails). The regenerated fixture changed exactly the four predicted rows: Simplest 2026-09-22, Decisions 2026-09-22, Learns 2026-09-27, Cleanup 2026-09-22. |
| M2 heading test skips the reader | FIXED | goals-mirror.test.mjs:42-62 now uses the real reader with the probe checkbox. Re-running the reader mutation (`matchTitle` accepts column-zero headings only) gives **135/1**: "decisions-read still sees every goal heading with zero shapeless" fails. In round 1 this mutant passed 132/0. |
| L1 pipe escaping untested | FIXED | New test "a \"\|\" in the table sentence or heading is escaped…". Mutation `escapeCell` → `return s;` gives 135/1. |
| L2 callout-in-table guard | FIXED | goals-mirror.test.mjs:84 loop runs to `detailIdx`. Re-running the mutation (callout appended after the last table row) gives **133/3**, and the marker-first test now fails along with the two fixture tests. In round 1 only the fixture tests failed. The optional `extractPageSha` assertion was left out, which the builder flagged; my probe confirms `extractPageSha` still returns the sha from the real render and from a simulated `<table>` readback. |
| L3 Releasing paragraph | FIXED | `git diff 3bf5ac9 70e4c34 -- docs/pane-setup.md` has one hunk, inside the "Releasing" paragraph only. It adds the exit-2 path, the readback table shape and the one-time migration, worded as specified. |
| L4 glued hex | FIXED | goals-mirror.mjs:75 has the lookaround regex. The probe now refuses `0.20.6-3-g7dfc59d`, `sha7dfc59d` and `_7dfc59d` (exit 2) and still does not refuse `deadbee`, `1234567`, dates, versions or `O9`. Reverting to the old regex gives 135/1. The real GOALS.md still renders with exit 0 (no new false positive). |
| L5 literal callout tag | FIXED | goals-mirror.mjs:87-89 plus the new test. Removing the check gives 135/1. |

## The 12 real rows, checked against docs/GOALS.md

The rendered dates (probe `real-render.md`) equal an independent computation from docs/GOALS.md (probe2), and they equal the builder's r2 table on every row:

- The aim: undated (no Status line)
- Cut: 2026-09-22
- Speed: undated (no date in line 47)
- Lead: 2026-09-25
- Simplest: 2026-09-23 (from 09-22 and 09-23)
- Progress: 2026-09-24 (the file name `2026-09-24-simplicity-bearings.md` is correctly excluded)
- Any host: undated
- One package: 2026-09-25
- Nothing stalls: 2026-09-25 (the note file name `2026-09-25-windows-…` is excluded, and the standalone 2026-09-25 counts)
- Decisions: 2026-09-24
- Learns: 2026-09-27 (from 07-28 and 09-27)
- Cleanup: 2026-09-22

Also checked: 12 rows for 12 `## ` goals.

## Regression hunt (verified absent)

- **Marker callout.** It is still the first callout (line 1). The card callout sits on line 19 inside Detail, the table starts on line 4 and Detail on line 18. `<empty-block/>` is the last line.
- **Detail.** It is still byte-for-byte the old renderer's sections after one tab: 97 of 97 lines on the real repo and 68 of 68 on the fixture, first difference none.
- **Reader.** On the real render, and on the simulated readback, it reports 0 decisions, 0 unattached, 0 warnings and 0 shapeless.
- **Refusals.** Every round-1 refusal and non-refusal probe gives the same result as in round 1, apart from the three L4 cases that are now refused as intended. Text in Detail only never refuses.
- **`publish`** is still disabled.

## INFO (no change requested)

- **ISO timestamps.** The date lookahead `(?![\w-])` also rejects a date followed by `T` (for example `2026-09-25T10:00`), so an ISO timestamp does not count as a date. No real Status line has one.
- **Date can come from a later sentence.** The date is the latest one anywhere in the Status line. It can therefore come from a later sentence than the Summary shows: "Nothing stalls" says 2026-09-23 in the Summary and shows 2026-09-25. This follows the lead's ruling.
- **Stale test name.** The round-1 test is still named "table date: a trailing dated citation is the status date, else \"undated\"". It still passes under the new rule, but its name now describes the old rule. A rename is optional.

## Bug-fix fields (70e4c34 is `fix(goals-mirror): G1 round 2 review fixes`)

Cause: the date rule read only a trailing parenthetical, so 7 of 12 dated Status lines rendered "undated". Separately, the heading acceptance test copied the reader's regex instead of running the reader, and the pipe escaping, the callout-after-table guard, glued shas and literal callout tags had no test or rule.
Discriminating check: each fix's scratch revert fails its new or tightened test. The reader column-zero mutant gives 135/1, callout-after-last-row 133/3, no-escape 135/1, old hex regex 135/1, no callout check 135/1, earliest date 133/3, file-name dates counted 135/1. The unmutated copy passes 136/0.
Fix location: skills/decisions/scripts/goals-mirror.mjs:75, 87-89 and 111-119; goals-mirror.test.mjs:42-62 and 84 plus four new tests; fixtures/goals-page.expected.md (four date cells); the docs/pane-setup.md "Releasing" paragraph.
Simplification: one global regex and a sort replace the trailing-citation rule. The heading test drops its duplicated regex in favour of the real reader. No new module or export was added.
