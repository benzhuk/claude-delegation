DONE 63996a6

# Lane 54 (four-read-json) fix round 1

Findings: docs/specs/four-read-json-54/review-r1.md (NEEDS_FIXES (4) 84e643e).

## Cause

F-1/F-2 share one cause: the lane-54 build's `--census` shape gate
(`CENSUS_JSON_TOP_LEVEL_KEYS`, `scripts/four-read.mjs:899`) required `stallNudges`, a key
build-census only started writing on 2026-09-28 17:55 (commit 1c41ce7, lane 38). four-read
never reads `stallNudges`, so requiring it refused every pre-lane-38 census JSON with the
exact "not the census markdown" message — false, since the input was JSON. `--spec-census`
had the opposite problem: it was never gated at all, so `buildFourRead`'s own internal
`loadJson` (`:787`) silently swallowed a markdown handed to `--spec-census` into "no spec
census", the same "passes because it isn't looking" class F-1 fixed for `--census`.

## Discriminating check

Built a detached git worktree at HEAD (36c8d61, code-identical to the reviewed artifact
84e643e — confirmed with `git diff 84e643e HEAD --stat`, only the record and review doc
differ). Appended the F-1 regression test and the F-2 mirror test to that worktree's
`scripts/four-read.test.mjs`, then ran `node --test scripts/four-read.test.mjs` against the
worktree's own pre-fix `four-read.mjs`:

```
✖ validateCensusArg: a pre-lane-38 build-census JSON (no stallNudges) still passes
  actual: { ok: false, message: 'four-read: --census must be the build-census --json data
  file, not the census markdown' }, expected: { ok: true }
✖ main: --spec-census pointed at the census markdown refuses with exit 2, mirroring --census
  actual: 0, expected: 2
tests 113, pass 111, fail 2
```

Both new tests confirmed red at the pre-fix source, for the reason each finding names. For
F-4 (a test-gap finding, no source bug): with the F-1 fix applied in that same scratch
worktree, the new `lead: null` / `lead: []` assertions passed trivially only once
`stallNudges` was removed from the key list (before that, `hasOwnProperty` rejected the stub
before ever reaching the `lead` check, so the assertions weren't exercising anything yet).
I then mutated the guard's return line to `return true;` in the scratch copy and reran:
`isBuildCensusJsonShape: the census markdown, plain objects, arrays and null are not the
shape` went red (`actual: true, expected: false`) — confirming the new assertions do pin the
exact unguarded-`lead` bug class F-4 names. Reverted the mutation in scratch, then removed
the scratch worktree (`git worktree remove --force`, my own detached checkout, never the
lead's).

## Fix location

- `scripts/four-read.mjs:895-899`: `CENSUS_JSON_TOP_LEVEL_KEYS` drops `stallNudges`; comment
  now says these are the keys every build-census version has written and explains why
  `stallNudges` is left out.
- `scripts/four-read.mjs:922-928` (`main`): after the existing `--census` gate, a matching
  `if (opts.specCensus)` block runs `validateCensusArg` on `opts.specCensus` and exits 2 with
  the same message (flag name swapped) on failure, before `buildFourRead` runs.
- `docs/census.md:508`: "pass its output file as `--spec-census`" → "pass its `--json`
  output file as `--spec-census`".
- `docs/reports/census-0928/four-read.md:323-327`: each lane's last cell now carries the
  verbatim four-read "Work lost or stalled" value, including the `ASKs unavailable` and
  `stall nudges unavailable` parts the appendix had dropped.
- `scripts/four-read.test.mjs`: new tests for F-1 and F-2 (exact patches from the review),
  plus the two `lead`-guard assertions inside the existing shape test (F-4).

## Simplification

No new mechanism for F-2: it reuses the exact `validateCensusArg` helper F-1 already built,
called a second time at the one place that matters (`main`, before any write), with the
flag name substituted into the existing message rather than a second message constant. F-1
is a one-line key-list edit plus a comment; F-3 and F-4 are data/assertion-only, no code
shape changed.

## Per-finding status

- F-1 (MAJOR): fixed exactly as patched. Verified: `validateCensusArg` now accepts
  `docs/work/evidence/wr-2026-09-27-collect-status.census.json` (`{ ok: true }`), and
  `node scripts/four-read.mjs --record docs/work/wr-2026-09-27-collect-status.record.md
  --census docs/work/evidence/wr-2026-09-27-collect-status.census.json` reproduces the
  review's exact numbers (16106944 tokens, 1.0h, largest gap 51.7min), matching base
  behavior with exit 0.
- F-2 (MAJOR): fixed exactly as patched, plus the docs/census.md:508 wording and the mirror
  test. Verified red-then-green per the discriminating check above.
- F-3 (MINOR): all 5 appendix rows now carry the exact verbatim cell text the review
  specified, byte for byte.
- F-4 (MINOR): the two `lead` assertions added exactly as patched; confirmed they catch the
  named mutation (return true unconditionally) once F-1 is in place.

## Counts

```
node --test scripts/four-read*.test.mjs
tests 119, pass 119, fail 0, cancelled 0, skipped 0, todo 0
(117 before this round + 2 new: the F-1 regression test and the F-2 mirror test; F-4's two
new assertions live inside an existing test, not a new test)

node scripts/run-tests.mjs
tests 2935, pass 2930, fail 0, cancelled 0, skipped 5, todo 0
exit 0, leak check: 0 new temp entries
```

## Commits

- `b13f448` fix(four-read): accept older census JSON, gate --spec-census (lane 54 r1)
- `63996a6` docs(census-0928): show the verbatim four-read appendix cells (lane 54 r1)

## Deviations / assumptions

None. All four patches were applied exactly as the review specified, byte for byte where an
exact patch was given.

## Cleanup

No dev server, no background process. The one scratch detached worktree used for the
discriminating check was removed with `git worktree remove --force` before this report was
written; nothing else was left under `scratchpad/lane-54/` outside the run-tests log and the
mktemp scratch dir it and the check lived in.
