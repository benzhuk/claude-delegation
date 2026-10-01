VERDICT: PASS

Setup for build/one-launch-2 (one territory, F1), base cf087dcfb4f8a5cc56a843a831ef41166810bad2.

## Worktree
- `git -C /home/ben/Code/wt-olfix worktree add /home/ben/Code/wt-one-launch-2-F1 -b build/one-launch-2-F1 cf087dcfb4f8a5cc56a843a831ef41166810bad2` — exit 0.
- `git -C /home/ben/Code/wt-one-launch-2-F1 rev-parse HEAD` -> `cf087dcfb4f8a5cc56a843a831ef41166810bad2`
  (equal to base sha; the worktree add made no new commit, as expected).

## Scout
Read-only survey at the base sha, written to
`/home/ben/Code/wt-olfix/docs/specs/one-launch-2/briefs/scout-F1.md` (per
skills/team-build/references/scout-brief.md, 4 sections, under the 40-line cap).
Confirmed all three named files exist (build-loop-workflow.js 813 lines,
build-loop-workflow.test.mjs 1487 lines, build-loop-args.example.json /
build-loop-args.legacy.example.json) and located the exact lines matching each of the
spec's four defects (acceptPrepPrompt's step order at build-loop-workflow.js:300-311;
the whole-header overwrite at line 307; given-mode's missing seamBriefPath
destructuring at lines 319-320 and the reviewerBriefPathFinal fallback at line 649).
Confirmed `skills/team-build/references/accept-prep.mjs` and its test/fixtures do not
yet exist (new file, per contracts). Confirmed reusable helpers: `formatLogLine` and
`parseRecord` (scripts/work-record.mjs:437, :90) and the splice-before-first-blank-line
pattern in `acceptRecord` (~line 1112) as the shape to imitate for the scoped edit,
noting it is NOT atomic (plain writeFileSync) so R2's atomic-write requirement is new
work. Two open questions for the spec recorded (Worktree: field present-but-no-setter
case; whether the ORDER test's fake --plugin-root means literal replacement scripts on
disk).

## Briefs written
All from the mandate template (docs/mandate-template.md), citing spec.md, contracts.md
and scout-F1.md by path, never restated inline:
- `/home/ben/Code/wt-olfix/docs/specs/one-launch-2/briefs/F1.md`
- `/home/ben/Code/wt-olfix/docs/specs/one-launch-2/briefs/reviewer.md` (F1 attack brief:
  drop-a-header-line, order-test-false-green, missing-seamBriefPath, bad-base-sha,
  step-order/failure-path, one-sentence SKILL.md check)
- `/home/ben/Code/wt-olfix/docs/specs/one-launch-2/briefs/integrator.md` (integration
  worktree /home/ben/Code/wt-olfix, branch build/one-launch-2, gate
  `node scripts/run-tests.mjs`, no-new-failure-by-name vs base 33aa023, known
  pre-existing H6/V4 per contracts.md)
- `/home/ben/Code/wt-olfix/docs/specs/one-launch-2/briefs/seam.md` (scoped to the joint
  between build-loop-workflow.js's rendered accept-prep prompt and accept-prep.mjs's
  actual flags/behavior/schema, since this build has one territory but two code
  surfaces that must agree)

## Territory row (as returned to the caller)
F1: worktree /home/ben/Code/wt-one-launch-2-F1, branch build/one-launch-2-F1,
briefPath docs/specs/one-launch-2/briefs/F1.md,
gate `node --test skills/team-build/references/build-loop-workflow.test.mjs skills/team-build/references/accept-prep.test.mjs`,
headSha cf087dcfb4f8a5cc56a843a831ef41166810bad2.

## Deviations / notes
None. No destructive git used; no identity set or switched; nothing pushed; no peer
note sent.
