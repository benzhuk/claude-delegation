VERDICT: PASS

# Integration report — one-launch-1 (launch 3)

Integration worktree: /home/ben/Code/claude-delegation-lane4 (branch build/one-launch-1,
base fbd7cf62ef4bf2ac81c46082a9e9cb76495d848b).

headSha: be2a30bfec16cef0ac99ef94ac54472b5f09e4ed

## Lead ruling applied

Per the "Lead ruling, launch 3" note added to this brief: the branches were already
merged by launch 2 (head be2a30b). This run only had to verify what was already merged
against the approved shas, confirm the spec pack was committed, and re-run the gate
under the corrected rule ("no NEW failure against base": PASS when every failing test
name at head also fails at base fbd7cf6; anything failing at head but passing at base
is FAIL — compare named failing subtests, not just counts).

## Approval check

- L1 (skills/team-build/references/build-loop-workflow.js and its test/example files),
  branch build/one-launch-1-L1: reviewer report
  docs/specs/one-launch-1/reports/review-L1-r2.md — `VERDICT: APPROVE
  c3a97b102716b632132bcb78506edbb141e6640e`. This is the exact sha named in my prompt
  (L1@c3a97b102716b632132bcb78506edbb141e6640e). Included.
- L2 (skills/team-build/SKILL.md), branch build/one-launch-1-L2: reviewer report
  docs/specs/one-launch-1/reports/review-L2-r3.md — `VERDICT: APPROVE
  0915fb6d8f90fe8dc88b13988b3cc151ab1c7552`. This is the exact sha named in my prompt
  (L2@0915fb6d8f90fe8dc88b13988b3cc151ab1c7552). Included.
- No excluded/blocked territories were named in the brief (Excluded: none).

## Merges

Both merges were already present at HEAD from launch 2, at exactly the approved shas
(verified with `git rev-parse` and `git merge-base --is-ancestor`; no new merge was
needed or performed this run):
- 4880cde "merge: build/one-launch-1-L1 at c3a97b102716b632132bcb78506edbb141e6640e"
  (parents a7e3260, c3a97b1) — --no-ff, no trailers.
- be2a30b "merge: build/one-launch-1-L2 at 0915fb6d8f90fe8dc88b13988b3cc151ab1c7552"
  (parents 4880cde, 0915fb6) — --no-ff, no trailers.

Both approved-sha commits are ancestors of HEAD. No merge conflicts.

## Spec-pack commit

Already committed in a7e3260 "docs: one-launch-1 spec pack" (present at HEAD; verified
untracked-file list is now empty for that set): docs/specs/2026-09-25-build-loop-workflow.md,
docs/specs/one-launch-1/** (briefs, contracts, reports), docs/work/evidence/2026-09-25-
census-build-lead-turns.md, docs/work/wr-2026-09-25-one-launch.record.md. No action
needed this run.

Note (not fixed, not decided — reporting only): at the time of this run the working tree
had two uncommitted modifications not covered by the "commit if still untracked" clause
because they are modifications to already-tracked files, not new untracked files:
docs/specs/one-launch-1/briefs/integrator.md (gained the "Lead ruling, launch 3" section)
and docs/work/wr-2026-09-25-one-launch.record.md (gained two Log lines documenting the
launch-2 result and the lead's launch-3 ruling). Left as-is; committing them was outside
this brief's instruction and outside my mandate.

## Sealed suite — gate comparison against base

Ran `node scripts/run-tests.mjs` once at HEAD (be2a30bfec16cef0ac99ef94ac54472b5f09e4ed):
1588 tests, 1583 pass, 2 fail, 3 skipped.

Failing tests at HEAD:
1. `skills/multi/scripts/mirror-shim.test.mjs:269` — "V4: a real install writes one shim
   per command, each naming ITS OWN command in its errors" — AssertionError:
   "SKILL_FILE_EXCLUDE let a .test.mjs file publish".
2. `skills/multi/scripts/note-send.test.mjs:367` — "H6: a plain checkout resolves to
   itself, and backslashes are normalised (L1)" — AssertionError: actual
   `<worktree>/C:/Users/benzh/Code/Zhuk Projects` vs expected
   `C:/Users/benzh/Code/Zhuk Projects` (a Windows-path-on-Linux environmental mismatch,
   sensitive to the absolute path of whatever checkout/worktree runs it).

To apply the lead's gate, I also ran the same sealed suite once at base fbd7cf6, in the
existing worktree /home/ben/Code/wt-ws-mainbase (git rev-parse HEAD there =
fbd7cf62ef4bf2ac81c46082a9e9cb76495d848b, confirmed before running):
1564 tests, 1559 pass, 2 fail, 3 skipped.

Failing tests at base (same worktree-relative paths/line numbers, same two test names):
1. `skills/multi/scripts/mirror-shim.test.mjs:269` — "V4: a real install writes one shim
   per command, each naming ITS OWN command in its errors" — same assertion
   ("SKILL_FILE_EXCLUDE let a .test.mjs file publish").
2. `skills/multi/scripts/note-send.test.mjs:367` — "H6: a plain checkout resolves to
   itself, and backslashes are normalised (L1)" — same assertion shape (path prefixed
   with the worktree's own absolute path).

Comparison: the two failing test names at HEAD are exactly the two failing test names at
base fbd7cf6 — no test that passes at base fails at head. HEAD adds 24 new passing tests
(1588 vs 1564; all in the new build-loop-workflow setup/seam/accept-prep/example-args
coverage from L1, all passing) and no new failures. Per the lead's ruling this is a PASS.

(Note: this differs from the plugin's default docs/sealed-baseline.json, which currently
lists `{"files": []}` — i.e. zero tolerated failures by default. The lead's ruling in
this brief explicitly overrides that default for this build, having independently
reproduced the same two pre-existing/environmental failures at base fbd7cf6. I followed
the brief's explicit gate definition rather than the plugin default; flagging this for
the record since I fix nothing and decide nothing myself.)

## Verdict

VERDICT: PASS — both approved territories (L1@c3a97b1, L2@0915fb6) are merged at their
exact approved shas with clean --no-ff merges and no conflicts; the spec pack is
committed; the sealed suite at HEAD (be2a30b) fails only the same two named tests that
already fail at base fbd7cf6, and adds no new failures.
