VERDICT: FAIL

# Integrator report — one-launch-2 (wr-2026-09-26-one-launch-fix)

Integration worktree: /home/ben/Code/wt-olfix, branch build/one-launch-2.
Merge commit (F1 into build/one-launch-2, ordinary merge, no rebase, not pushed):
`2f659bf574fa66460fe3f34cff4ae4013cd54e97` (my own `git rev-parse HEAD`, run in the worktree
after the merge — never typed from memory).

Territory merged: F1, branch build/one-launch-2-F1, sha `8791423e37a85d2fee31854c7eade696fde2552e`.
Review at that exact sha: /home/ben/Code/wt-olfix/docs/specs/one-launch-2/reports/F1-review.md,
first line `VERDICT: APPROVE 8791423e37a85d2fee31854c7eade696fde2552e` — matches
`git rev-parse build/one-launch-2-F1` exactly. No other territory was in scope (contracts.md:
"One territory, id F1"); no territory is excluded/blocked per the brief.

Pre-merge state note (not mine to fix, reported for the record): the worktree already carried
two uncommitted docs-only edits when I started — docs/specs/one-launch-2/briefs/F1.md (a note
that R7 was added after F1's setup) and docs/specs/one-launch-2/contracts.md (R8, the
Base-of-header ruling). Neither file is touched by F1's branch, so the merge did not conflict
with them; I left them exactly as found, uncommitted, and did not stage or commit them — out
of scope for the integrator.

## Gate: `node scripts/run-tests.mjs`

Run 1, on the merge commit (2f659bf...), from /home/ben/Code/wt-olfix:
Full tail in docs/specs/one-launch-2/reports/integrator-gate.log.
Summary: `tests 1746 / pass 1740 / fail 3`.
Failing test names: **N2** (skills/multi/scripts/hooks.test.mjs), **V4**
(skills/multi/scripts/mirror-shim.test.mjs), **H6** (skills/multi/scripts/note-send.test.mjs).

Base comparison run, to confirm which names are pre-existing rather than trusting
contracts.md's list as exhaustive: created a scratch worktree at base sha
`33aa023bd927b44b23292d540cc0c2aed4ced212` under the session scratchpad (never under
/home/ben/Code/wt-olfix, never pushed, removed afterward with `git worktree remove`), and ran
the identical command there.
Summary: `tests 1714 / pass 1709 / fail 2`.
Failing test names: **V4** (skills/multi/scripts/mirror-shim.test.mjs), **H6**
(skills/multi/scripts/note-send.test.mjs).

### Failing-test-name diff (this branch vs base 33aa023), by name

| Test name | Base 33aa023 | build/one-launch-2 @ 2f659bf | Verdict |
|---|---|---|---|
| V4 (mirror-shim.test.mjs) | fail | fail | pre-existing, matches contracts.md R6's pinned list |
| H6 (note-send.test.mjs) | fail | fail | pre-existing, matches contracts.md R6's pinned list |
| N2 (hooks.test.mjs) | pass | **fail** | **NEW — not in the base run, not a name absent-from-base can be waved away** |

One new failing test name: **N2**. Per the brief, any failing name absent from the base run
is a new failure, full stop — reported here, not judged away.

## Triage: N2 → territory F1

N2 (skills/multi/scripts/hooks.test.mjs:429) is a repo-wide sealed-suite invariant: it walks
every `*.test.mjs` file in the repo and asserts none of them spreads `...process.env` directly
into a child-process `env` (the sealed rule is that every child env must be built through the
`childEnv()` helper, so no test file can leak this session's messaging token into a spawned
child — see the test's own comment referencing a prior 2026-09-17 leak). It failed with:

```
AssertionError [ERR_ASSERTION]: these spawn sites build their own env instead of using childEnv():
skills/team-build/references/accept-prep.test.mjs:367, skills/team-build/references/accept-prep.test.mjs:395,
skills/team-build/references/accept-prep.test.mjs:423, skills/team-build/references/accept-prep.test.mjs:441
```

All four named lines are inside `skills/team-build/references/accept-prep.test.mjs` — the new
test file F1 added this round (per F1-report.md's file list and contracts.md's "ONE NEW FILE
ruled in by the lead"). Each site reads `const env = { ...process.env, ORDER_LOG: orderLog,
RECORD_ABS_PATH: recordAbsPath };` before a `spawnSync`, instead of using the repo's `childEnv()`
helper. This is a new failure caused entirely by F1's own new file, confirmed absent at base
33aa023 where accept-prep.test.mjs does not exist. Triaged to **F1**, the only builder that
touched that file.

## Two named territory gate results (verbatim, per the evidence format)

`node --test skills/team-build/references/build-loop-workflow.test.mjs
skills/team-build/references/accept-prep.test.mjs`, run from /home/ben/Code/wt-olfix at the
merge commit — full output:

```
[... 96 passing test lines omitted from this copy for length; every line was ✔, none ✖ ...]
✔ R9: no rendered prompt across build/review/integrate/setup/seam/accept-prep contains any note-send instruction other than the prohibition itself (0.420585ms)
✔ build-loop-args.example.json (new one-launch shape) parses and matches the setup-territory shape (0.29123ms)
✔ build-loop-args.legacy.example.json (old given-worktree shape) parses and matches the given-territory shape (0.224749ms)
✔ both example arg files launch cleanly against the given/setup detection with no mixed-territory-modes error (0.666997ms)
ℹ tests 100
ℹ suites 0
ℹ pass 100
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 502.694331
```

Plain pass/fail for F1's own contribution (its two pinned test files, run in isolation): **PASS**
— 100/100, 0 failures. Matches F1-report.md's and F1-review.md's own claimed 100/100.

This is the contradiction the gate surfaces: F1's own scoped gate (its two named files) is
clean, but the full sealed suite catches a cross-cutting invariant (N2, in a third file outside
F1's own gate) that F1's new file violates. Both facts are true and both are reported.

## Evidence

- docs/specs/one-launch-2/reports/integrator-gate.log — full tail of the post-merge run.
- Base-comparison run: performed in a scratch worktree
  (`/tmp/claude-1000/.../scratchpad/base-33aa023`, since removed with `git worktree remove`);
  its output is transcribed above (summary + both failing test names) rather than left on disk,
  since it lived outside the integration worktree.
- docs/specs/one-launch-2/reports/integrator-state.md — kept current after the gate run.

## Not done (explicitly out of scope)

- No fix applied to N2, V4, H6, or anything else — triaged and reported, not patched.
- No ship decision — that is the orchestrator's call, not mine.
- No judgment on whether N2 is "acceptable" — it is a new failing test name, reported as such.
- The lead's dogfood step (lane six's record Base rewrite + four-read) — not touched, not mine.
- No push to origin. No destructive git. No peer notes sent.

Report: this file. Gate log: docs/specs/one-launch-2/reports/integrator-gate.log. State file:
docs/specs/one-launch-2/reports/integrator-state.md.
