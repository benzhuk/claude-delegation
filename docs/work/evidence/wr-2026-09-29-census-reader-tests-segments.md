VERDICT: PASS — both required segment-retention cases stay PARTIAL on actual base; existing expected reds remain discriminating

# Lane 40b segment retention addendum

- Commit: `e57cf98963ec2ccaea3012fda8082921906ea149`
- Parent test commit: `6083ba291ed5dd430469139f924ec4a39555b0e9`
- Production base remains: `fb6367392dfc1dd4db71c09d4637bb0a5125462d`
- Changed path: `scripts/build-census.codex.contract.test.mjs`
- Run at: 2026-09-29 23:21:25 America/New_York
- Production files changed: none
- Original `tests-report.md`: unchanged

## Added retention cases

1. `Lane40b segment retention: invalid start in segment B cannot borrow segment A completed witness`
   - Segment A has a valid timed start, usage, and matching completion.
   - Segment B has the same child identity and a later invalid `task_started` with no usable turn id.
   - Observed on base: PASS; scope remained incomplete, reason matched `child segmented-invalid-restart ... end-bound witness`, `leadTurns` remained `UNSUPPORTED`, and `combined` remained `null`.

2. `Lane40b segment retention: equal latest-start timestamps with conflicting witnesses stay PARTIAL`
   - Segment A starts and completes one turn.
   - Segment B starts a different turn at the exact same timestamp and remains open, with a later usage row.
   - Observed on base: PASS; scope remained incomplete, reason matched `child segmented-start-tie ... end-bound witness`, and `combined` remained `null`.

These are retention and mutant-kill cases. They are expected green on the old final-row implementation and must remain green after the positional-witness repair. They catch a segment merge that preserves segment A’s witness across an invalid later start or a latest-start timestamp tie.

## Focused gate

The nonblocking Windows mutex `Global\claude-verify` was acquired.

Exact command:

```powershell
node --test scripts/build-census.codex.contract.test.mjs
```

Exact summary:

```text
ℹ tests 46
ℹ suites 0
ℹ pass 40
ℹ fail 6
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 437.8172
```

Both new segment tests passed. The six failures are the pre-existing expected reds from `6083ba2`:

- Codex Unicode public-reader framing;
- completed pre-window child with benign trailing row;
- completed overlapping child with benign trailing row;
- open-mode completion with benign trailing row;
- from-only pre-window exclusion;
- completed zero-usage pre-window exclusion.

Cause: a completion witness merged by only newest valid `lastStartedAt` can survive an invalid start in another segment, while a strict `>` merge can silently pick one witness when latest-start timestamps tie.

Discriminating check: both aggregate shapes must remain `PARTIAL` with the child-specific no-end-witness reason and `combined === null`; the invalid-start aggregate must also retain `leadTurns: UNSUPPORTED`.

Fix location: production child segment state merge in `scripts/build-census.mjs`; any invalid start in any child segment or a latest-start timestamp tie must clear the merged witness.

Simplification: the merged witness is valid only for one unambiguous owner segment and only when the OR-merged invalid-start flag is false.

