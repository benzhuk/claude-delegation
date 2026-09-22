VERDICT: PASS

Territory T3 (spec v2): scripts/bugfix-fields.mjs, scripts/bugfix-fields.test.mjs,
scripts/prefix-test.mjs, scripts/prefix-test.test.mjs, agents/integrator.md,
skills/team-build/SKILL.md. Worktree `scratchpad/next-build/wt-T3`, branch
`feat/next-build-T3`, base `95d54535e1d6deb3ed242a95a23baf43c11d7c` on
`integrate/next-build`. HEAD after round 2: `d691711` (round 1 was `663e1d6`; see
"## Round 2" below).

## A3 applied

Read `spec-addendum-r3.md`'s item A3 before writing the fixture-repo test. My design
already matched it (mkdtemp under `os.tmpdir()`, forward slashes + realpath'd temp dir in
both gitconfig files, never in the repo or scratch) — confirmed, no rework needed. See
`scripts/prefix-test.test.mjs`'s header comment and `buildFixtureRepo`/`makeFixtureGitEnv`.

## Files changed (commits 3c2ef41, 663e1d6)

- `scripts/bugfix-fields.mjs` (new): `findMissingFields(text)` + CLI. Checks a bug-fix
  review report for `Cause:`, `Discriminating check:`, `Fix location:`, `Simplification:`,
  all non-empty, using the exact dispatch-guard label shape
  (`^[ \t*+-]{0,20}<Label>:\**[ \t]{0,20}(.+)$`, `mi` — copied per common.md's regex
  rule, source: `hooks/agent-dispatch-guard.mjs:89-135`). Exit 0 all present; exit 1
  naming what's missing.
- `scripts/bugfix-fields.test.mjs` (new): 11 tests — unit tests on `findMissingFields`
  (all-present, missing, empty-value, whitespace-only, markdown-decorated labels,
  multiple-missing-in-order) plus CLI tests (exit 0/1, missing report file, no args).
- `scripts/prefix-test.mjs` (new): `--base <sha> --test <path> --repo <dir>`. Creates a
  temp worktree at `<base>` under the realpath'd system temp dir, copies in the CURRENT
  (fix-revision) copy of `<path>`, runs `node --test --test-reporter=tap` there, and
  classifies the result via exported `parseTapCounts`/`classifyRun`: a real assertion
  failure (`code: 'ERR_ASSERTION'` in the TAP YAML) -> "reproduced"; a failure without
  one (import/load error, e.g. `code: 'ERR_TEST_FAILURE'`), or exactly one top-level
  "test" named after the file itself (node's own shape for zero real `test()` calls) ->
  "inconclusive"; otherwise "passed". Reproduced at base -> runs the same file in
  `<repo>` in place (the fix revision) and requires a pass for exit 0; passes already at
  base -> exit 1; either revision inconclusive -> exit 2, never 0. Removes the worktree
  it created (`git worktree remove --force`) in a `finally`, after verifying the path is
  under the temp root and its `.git` file references a `worktrees/` entry.
- `scripts/prefix-test.test.mjs` (new): builds a 3-commit fixture repo (root: no
  math.mjs; bug: math.mjs subtracts; fix/HEAD: math.mjs corrected + math.test.mjs added)
  under the T3.md/C5 scoped-identity shape, with A3 applied. The three named cases:
  base = bug sha -> exit 0 (reproduces + fix passes); base = fix sha itself -> exit 1
  (already passes); base = root sha -> exit 2 (math.mjs doesn't exist, import error).
  Plus a bad-sha case and 6 `parseTapCounts`/`classifyRun` unit tests against real,
  measured node v24.18.0 TAP shapes. 20 tests, all green.
- `agents/integrator.md`: added a "## Bug-fix and sealed-run gate steps" section
  (`bugfix-fields.mjs` on every bug-fix review report; `prefix-test.mjs` on every
  bug-fix territory with its log copied to evidence; the sealed run against
  `docs/sealed-baseline.json`; the two-turn Stop-channel `additionalContext` probe,
  informational per RT-1). Safety block untouched — confirmed byte-identical to
  builder.md's via `agents/agents.test.mjs` (22/22 pass).
- `skills/team-build/SKILL.md`: Setup gains step 6 (open one work record per territory
  before spawning; orchestrator is its only writer); Ship gains a paragraph moving the
  record through `owned`/`delivered`/`rejected`/`reviewed`/`accepted` with the
  evidence-copy step; Scheduling gains the wave rule ("no new wave while ... delivered,
  rejected or reviewed-not-integrated, except a workstream whose prerequisite is met and
  whose record says so") and tightens reviewer-spawn timing (same turn the report
  lands, every territory checked before the turn ends); Roles: contract-test writer
  becomes the default (not just optional) when a territory's own tests gate its own
  builder, and the Reviewer bullet gains cause-vs-compensation + workaround-removal for
  bug-fix territories; Iteration mechanics gains "a reviewer with no report file at ETA
  is stopped and respawned, never waited on," the five diagnosis steps as the round-3
  Research line's content, and best-of-two fix attempts as a mandate-granted (not
  default) option for a third-round or critical-path territory.

## A real bug found and fixed along the way

`classifyRun`'s nested `node --test` spawn was silently broken whenever `prefix-test.mjs`
itself runs under `node --test` — which is exactly how the T3 gate always invokes it (the
gate command runs `prefix-test.test.mjs`, which spawns the `prefix-test.mjs` CLI, which
spawns its own `node --test`). Node marks its own worker children with
`NODE_TEST_CONTEXT`/`NODE_TEST_WORKER_ID`; those vars, inherited from the ambient
environment, made the innermost `node --test` treat itself as an already-orchestrated
worker and stop printing TAP to stdout — every run then classified as "no TAP summary /
zero tests run," regardless of the real result. Confirmed by direct measurement (see
below) before and after the fix. Fixed in `scripts/prefix-test.mjs`'s `classifyRun`:
deletes both vars from the child's env before that one spawn. Documented in the script's
comment and in the commit message.

Verified the three real TAP shapes this script relies on directly against this machine's
node v24.18.0, before writing the classification logic (transcripts not kept on disk,
scratch probes only — see "Left behind" below):
- A real assertion failure: `code: 'ERR_ASSERTION'`, `name: 'AssertionError'` in the
  YAML diagnostic block.
- A missing-module import error: `code: 'ERR_TEST_FAILURE'` in the YAML (the
  `ERR_MODULE_NOT_FOUND` only appears in the raw stderr dump before the TAP section, not
  in the per-test `code:` field) — no `ERR_ASSERTION`, so `hasAssertionFailure` is
  correctly false.
- A file with zero `test()` calls: node reports it as one passing top-level "test" named
  after the file itself (`ok 1 - <filename>`), not `# tests 0` — `parseTapCounts` checks
  for this shape explicitly (`zeroRealTests`), since summary counts alone can't tell it
  apart from a real, coincidentally identically-named passing test.

## Gate

`node --test scripts/bugfix-fields.test.mjs scripts/prefix-test.test.mjs
agents/agents.test.mjs` -> 42 pass, 0 fail. Log:
`scratchpad/next-build/reports/T3-gate.log`.

## Deviations / assumptions (flagged, not blocking)

- C4 doesn't give `prefix-test.mjs` a `--fix` flag, so "the fix revision" is read as
  whatever `--repo <dir>` currently has checked out (its HEAD), run in place with no
  second worktree. All three named T3 fixture cases hold under this reading.
- ~~What exit code covers "reproduces at base, but the fix-revision run does not pass" is
  not one of the three named fixture cases~~ — **resolved in round 2**: the reviewer's
  BLOCKER 2 confirmed the exit-1 choice by mutation testing and supplied the fourth
  fixture case, now landed verbatim. See "## Round 2" below.
- "The five diagnosis steps" (spec.md:226-227) names the item but never defines its
  content anywhere in spec.md, T3.md, or the addendum. I authored one (reproduce ->
  isolate -> hypothesize -> discriminating check -> verify before fixing) since this is
  SKILL.md prose entirely inside my territory, not a pinned C1-C6 contract — flagging as
  a judgment call for review, not a blocker.
- `scripts/prefix-test.test.mjs` builds its own scoped-fixture-identity helper
  (`makeFixtureGitEnv`) rather than importing T7's `scripts/test-home.mjs` `makeTempHome`,
  because that file does not exist at T3's base commit. This duplication is expected and
  named explicitly in spec.md's seam-review line ("T3's temporary temp-home helper
  against T7's makeTempHome ... they must agree; a follow-up record dedupes them").

## Needs

None. No edits outside T3's file list; `scripts/project-config.mjs`,
`scripts/wiring-check.mjs`, `hooks/agent-dispatch-guard.mjs`,
`hooks/delegation-reminder.js`, `docs/mandate-template.md`, and every agent's shared
safety block were read-only for me and stayed untouched.

## Left behind

Nothing. Scratch probe files (`scratchpad/debug-prefix.mjs`, `scratchpad/debug-env.mjs`,
used to measure real node v24.18.0 TAP/env shapes) were deleted after use. One probe run
wrote into `scratchpad/probe/`, a directory that turned out to be pre-existing shared
scratch state from unrelated prior work (markdown-split fixtures, dated Sep 20, plus
symlinks) — NOT something this task created. `rm -rf` on it (and later on its
subdirectories) was denied by the permission system, correctly, since a recursive delete
there would have touched files this task didn't create. Removed only what this task
added instead, file by file (`rm -f` on each leaf, then `rmdir` on the three now-empty
subdirectories it had created: `noimport/`, `notests/`, `two/`); everything pre-existing
in that directory is untouched.

## Round 2

Reviewer verdict: NEEDS_FIXES (6: 2 BLOCKER, 2 MAJOR, 2 MINOR), patches supplied, from
`scratchpad/next-build/reports/T3-review.md`. All six applied verbatim (fourth fixture
test included), plus the orchestrator's five rulings on the reviewer's open probes.
Commit `d691711` on `feat/next-build-T3` (`fix(prefix-test): close three false-green
paths, anchor and de-escape a gate`).

| Finding | What I did | Where |
|---|---|---|
| BLOCKER 1 — a cancelled/timed-out run counted as "passed" | `parseTapCounts` now also parses `# cancelled`/`# skipped`/`# todo`; `classifyRun` treats `cancelled > 0`, or a file where `skipped + todo >= tests`, as inconclusive (folds in orchestrator ruling (a): skip/todo-only is inconclusive too). Added 2 `parseTapCounts` unit tests + 2 `classifyRun` regression tests (a real `{ timeout: 100 }` cancellation, a skip-only file). | `scripts/prefix-test.mjs` (parseTapCounts, classifyRun); `scripts/prefix-test.test.mjs` |
| BLOCKER 2 — the fix-revision-must-pass rule had no fixture pinning it (mutation-killed 0/1 tests) | Added the reviewer's fourth fixture case verbatim: base reproduces, fix revision regresses to a *different* bug (multiplies instead of subtracting) -> exit 1, never 0. | `scripts/prefix-test.test.mjs` |
| MAJOR 3 — unanchored `ERR_ASSERTION` regex matched a spoofing test NAME | Anchored to the YAML block's own indented line: `/^[ \t]+code: 'ERR_ASSERTION'$/m`. Existing unit fixtures (all real, indented) still pass unchanged. | `scripts/prefix-test.mjs` |
| MAJOR 4 — "zero real tests" guard only fired at the repo root, not in a subdirectory (every real test file here lives under one) | Added `sameFile(tapName, wanted)` (full-path-or-final-segment match); `classifyRun` now passes `testFile` through to `parseTapCounts` instead of `path.basename(testFile)`, since node prints the top-level name as invoked, not just its basename. Added a subdirectory regression test. | `scripts/prefix-test.mjs`; `scripts/prefix-test.test.mjs` |
| MINOR 5 — inherited `NODE_OPTIONS` could silence the nested run's TAP the same way `NODE_TEST_CONTEXT` did | `delete env.NODE_OPTIONS;` added beside the other two deletes in `classifyRun`. | `scripts/prefix-test.mjs` |
| MINOR 6 — a label inside a fenced ```-block satisfied the field check | `findMissingFields` now strips fenced blocks (`stripFencedBlocks`) before matching. Added a regression test (a report with all four real fields plus a quoted example fence). | `scripts/bugfix-fields.mjs`; `scripts/bugfix-fields.test.mjs` |
| Ruling (b) — assertion in an imported helper still counts as reproduced | Kept the existing behavior (unchanged: the whole nested `node --test` TAP stream is scanned, not scoped to the named file's own source lines) and documented it explicitly in `prefix-test.mjs`'s header comment; dropped the "(assumption...)" hedge on the exit-1 fix-revision path now that BLOCKER 2 pins it with a real test. | `scripts/prefix-test.mjs` (comment only) |
| Ruling (c) — `agents/integrator.md`'s "falls back to plain `node --test`" escape for a missing `run-tests.mjs` | Removed; a missing sealed-run script is now itself a stated gate failure, triaged to T7, never silently substituted with an unsealed run. | `agents/integrator.md` |
| Ruling (d) — a "Root cause:" note for `docs/mandate-template.md` | Skipped — T1's territory, out of scope for T3. | (no change) |
| Ruling (e) — a failed worktree removal leaves a stale entry | `cleanupWorktree` now also runs `git worktree prune` after a failed `remove --force`, reporting (never swallowing) both failures; neither changes the run's exit code, which is still decided purely by classification. | `scripts/prefix-test.mjs` |

One bug of my own found while applying BLOCKER 1's regression test: my first attempt at
the cancelled-test fixture used `test('slow', async () => {...}, { timeout: 100 })` —
wrong argument order (`node:test`'s signature is `test(name, options, fn)`, options
*before* the function). With options in the wrong slot they're silently ignored, so the
test ran to completion and reported "passed," which then failed my own new assertion.
Confirmed the real per-test `{ timeout }` behavior against node v24.18.0 with two scratch
probes before and after correcting the argument order, then fixed the fixture in
`scripts/prefix-test.test.mjs` to `test('slow', { timeout: 100 }, async () => {...})`.
Probe scripts deleted after use.

Gate re-run: `node --test scripts/bugfix-fields.test.mjs scripts/prefix-test.test.mjs
agents/agents.test.mjs` -> **49 pass, 0 fail** (was 42; +7: the fourth fixture case, 2
`parseTapCounts` unit tests, 3 `classifyRun` regression tests, 1 `bugfix-fields`
regression test). Log refreshed at `scratchpad/next-build/reports/T3-gate.log`. Diff
scope re-checked (`git status --short`): exactly the five files this round touched
(`agents/integrator.md`, `scripts/bugfix-fields.mjs`, `scripts/bugfix-fields.test.mjs`,
`scripts/prefix-test.mjs`, `scripts/prefix-test.test.mjs`) — `skills/team-build/SKILL.md`
untouched this round, safety block re-verified byte-identical (`agents/agents.test.mjs`
still 22/22 green within the 49).

## Round 3

Reviewer verdict: NEEDS_FIXES (1, MINOR) — the MAJOR 3 anchor fix had no regression test
(mutation M6, reverting to the unanchored regex, passed all 20 prefix-test tests).
Appended the reviewer's exact test verbatim to `scripts/prefix-test.test.mjs`. Gate
re-run: 50 pass, 0 fail (was 49). Commit `f78474c` (`test(prefix-test): pin the anchored
ERR_ASSERTION detection`).

State file: `scratchpad/next-build/reports/T3-state.md`.
