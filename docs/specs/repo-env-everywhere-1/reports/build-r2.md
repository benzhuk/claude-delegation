DONE 9435161e0997b5cde2e42b8a481c6e07f547d077

# Lane 47 build-r2 report: repo-env-everywhere-1, round 2 fixes

Base for this round: 6ef609a (fix round 1 delivered). Fixes review-r2.md findings R2-1
through R2-3 and NIT 1, per lead-ruling-r2.md, exactly as ruled — no new behaviour beyond
what the ruling specifies. NIT 2 is a report-accuracy correction, not a code change.

Commits (6ef609a..HEAD):
- 8c89e95 fix: honour the worktree's bearings answer when the main checkout is silent (R2-1)
- 6225e53 docs: correct build.md's Part 2 narrative to name the r0 hypothesis as disproved (R2-2)
- 42c3a20 test: seal git fixture helpers against an inherited GIT_DIR (R2-3)
- 9435161 docs: fix stale P6 reference in note-inbox.test.mjs comment (NIT 1)

## Bug-fix fields for R2-1 (as given by the review, unchanged)

Cause: bearingsNotice (hooks/lib/goal-context.mjs:43-48) treats the main checkout's answer as
final unless the worktree's answer is exactly `current`. A main checkout with no goal card
(`unconfigured`) or with no receipt therefore hides a worktree that is due. The notice goes
silent, or it drops the reviewer-not-independent reason.
Discriminating check: in a scratch main checkout with no card, plus a linked worktree that has
docs/goals/card.md and no receipt, `bearingsNotice(wt)` returns `null` at 1b6a5d5 and at
6ef609a. It returns "Bearings are due." at base d6f5c9d and with the R2-1 patch.
`bearings-state check --repo <wt>` says `due/no completion receipt`.
Fix location: hooks/lib/goal-context.mjs:44-48 (the F2 fallback condition), plus one test in
hooks/lib/goal-context.test.mjs.
Simplification: this changes the condition only. There is no new module and no second
resolution path. It stays inside P8's "one resolution change in the notice's own code" limit.

## R2-1 MEDIUM: applied as patched

Widened the F2 fallback condition in `hooks/lib/goal-context.mjs:44-48` so the worktree's own
answer also wins when the main checkout has nothing to say — `unconfigured`, or a card with
no receipt at all — not only when the worktree's own answer is exactly `current`. Commit
8c89e95.

Added the new test from the review, `hooks/lib/goal-context.test.mjs`: "a card only the
worktree has is not masked by the main checkout having none". It copies the F2 test's fixture
with the two changes the review specified — the main commit gets a README and no card, the
card is written into the worktree after `worktree add`, and no `complete` call is made — then
asserts `bearingsNotice(worktree, ...)` matches `/^Bearings are due\./`.

Gate 1 (targeted, with the fix in place): `node --test hooks/lib/goal-context.test.mjs` — 4/4
pass, including the new test.

Gate 2 (R2-1 red check): `git archive 6ef609a` into a mktemp dir
(`scratchpad/lane-47/b2-Dxjm/base`), with only `hooks/lib/goal-context.test.mjs` copied in over
the archive's own copy (goal-context.mjs left at 6ef609a, unfixed). Ran
`node --test --test-name-pattern='a card only the worktree has is not masked' hooks/lib/goal-context.test.mjs`
there: 1 fail — `AssertionError ... expected: /^Bearings are due\./, actual: 'null'`. Confirms
the new test is red at 6ef609a, matching the review's prediction.

## R2-2 LOW: applied as patched

Applied all five build.md patches verbatim, in `docs/specs/repo-env-everywhere-1/reports/build.md`:
1. :13-15 — the GOAL/NOT paragraph now credits only P8 with the resolution-path fix and names
   Part 2's cause as the r0 hypothesis, disproved by review r1.
2. :198 heading — "### r0 hypothesis, disproved by review r1 (the corrected cause is in the
   fields below)".
3. :205 — "The r0 hypothesis (disproved by review r1, F1): `mainCheckout` is a WRITER's
   helper...".
4. :210 — "(reproduced on the Windows box only by stripping Git from PATH, never observed live;
   review r1 found git reachable there — ...".
5. :240 (originally reported as :239-240) — "r0 hypothesis above, not the live cause) and calls
   `runNoteInbox`...".

None of these lines starts with a field label, so the four bug-fix fields (Part 2's own
Cause/Discriminating check/Fix location/Simplification, added under F1 in round 1) are
untouched. `node scripts/bugfix-fields.mjs docs/specs/repo-env-everywhere-1/reports/build.md`
still reports "all four fields present". Commit 6225e53.

## R2-3 LOW: applied both patches, standalone re-run confirms sealing

Patch 1, `scripts/collect-from-origin.test.mjs`: added
`import { childEnv } from "../skills/multi/scripts/test-child-env.mjs";` after the
`fileURLToPath` import, and changed the `git()` helper to pass
`env: childEnv(os.homedir())` to its `execFileSync` call.

Patch 2, `skills/decisions/scripts/decisions-render-core.test.mjs`: added
`import { childEnv } from '../../multi/scripts/test-child-env.mjs';` after the
`defaultExecGit` import, and changed `mkRepo`'s `git init --quiet` call to pass the same
`env: childEnv(os.homedir())`.

Commit 42c3a20.

Gate: unpoisoned targeted run,
`node --test scripts/collect-from-origin.test.mjs skills/decisions/scripts/decisions-render-core.test.mjs`
— 24/24 pass.

Gate 3 (R2-3 standalone check): built a scratch victim repo
(`scratchpad/lane-47/b2-Dxjm/victim`, one tracked `keep.txt`, one commit, machine's own
configured git identity — no identity was set by this agent). Exported
`GIT_DIR=<victim>/.git` in the shell and re-ran the same two-file `node --test` command
standalone from the worktree (not the sealed `run-tests.mjs` harness). Result: 24/24 pass,
including both "ignores an inherited GIT_DIR" tests. `git log --oneline | wc -l` in the victim
was 1 before and 1 after; `git ls-files` still shows only `keep.txt`. The victim was not
touched.

## NIT 1: applied

`skills/multi/scripts/note-inbox.test.mjs:208` — replaced "no regression from the P6 fix" with
"no regression from the P7 hardening" in the comment above the ordinary-path companion test.
Commit 9435161. Gate: `node --test skills/multi/scripts/note-inbox.test.mjs` — 59/59 pass
(combined with the other three touched test files in one run; see Gate 4 below for the
per-file total consistent with this).

## NIT 2 correction (no code change; build-r1.md left untouched per the ruling)

build-r1.md's F4 section states that
`node --test hooks/lib/goal-context.test.mjs skills/multi/scripts/hooks.test.mjs` gives
"3 + 30 = 33 tests". At 6ef609a `hooks.test.mjs` has 27 tests, not 30, so that combined run
gives 30 total (3 + 27), not 33. This is a report-accuracy slip only in build-r1.md; per the
lead ruling, build-r1.md was not edited. Noted here for the record.

## Gate numbers

1. Targeted `node --test` runs of the touched test files:
   - `hooks/lib/goal-context.test.mjs`: 4/4 pass.
   - `scripts/collect-from-origin.test.mjs` + `skills/decisions/scripts/decisions-render-core.test.mjs`: 24/24 pass.
   - Combined run of all four touched test files (`skills/multi/scripts/note-inbox.test.mjs
     hooks/lib/goal-context.test.mjs scripts/collect-from-origin.test.mjs
     skills/decisions/scripts/decisions-render-core.test.mjs`): 59/59 pass.
2. R2-1 red check: new test fails on a `git archive 6ef609a` copy (mktemp
   `scratchpad/lane-47/b2-Dxjm/base`) with only the new test copied in — 1 fail, as predicted.
3. R2-3 standalone check: both F3 tests, run with `GIT_DIR` exported to a scratch victim repo
   (`scratchpad/lane-47/b2-Dxjm/victim`) — 24/24 pass; victim's `git log --oneline | wc -l`
   unchanged (1 before, 1 after), `git ls-files` unchanged (`keep.txt` only).
4. Full `node scripts/run-tests.mjs`: 2698 pass, 0 fail, 5 skipped; leak check 0 new temp
   entries.

## Leftovers

Scratch under `scratchpad/lane-47/`:
- `b2-Dxjm/` (made via `mktemp -d`): `base/` (the 6ef609a archive copy used for the R2-1 red
  check) and `victim/` (the scratch git repo used for the R2-3 standalone check).
- `b2-red-XXXX/` — an empty directory created by an earlier `mkdir -p` typo before switching to
  `mktemp -d`; never populated, harmless, left in place (no delete commands were run, per the
  rules).

No secrets or transcript content in any of it.

Denied commands: none.
