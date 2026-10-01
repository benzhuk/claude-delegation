VERDICT: APPROVE 875efa007a06f1d16266da7448d63cd8cfbd378f

# Delta re-review: de019ec..875efa0

HEAD of /home/ben/Code/wt-lg was verified at 875efa007a06f1d16266da7448d63cd8cfbd378f. The
reviewed tree was not written to. The mutation ran on a fresh `git archive 875efa0` copy in the
session scratchpad.

## F1 (prior, Medium): FIXED, verbatim

- registered-pickup.contract.test.mjs:103-105: the `repo2` prefix is now `a-registered-project-two-`,
  with the two-line comment exactly as specified in delta-review.md.
- :134: the stale claim pre-seed comment was replaced with the specified one-liner.
- The delta's code-point comparator (:110-112) is unchanged and kept, as recommended.

## Mutation check (repeated)

On the scratch copy, decisions-pickup.mjs:649 was changed to `return entries;` (creation order).
Result: 20/20 runs FAILED at the intended assertion (`ordinal selects canonical repo/page order,
not fixture creation order`, actual `fedcba98...`, expected `01234567...`). At de019ec the same
mutant was caught 2/40. I then restored the file from `git show 875efa0:...`; `cmp` had confirmed
the mutation was the only difference. The restored copy passed 10/10.

## Regression check

- Real tree at 875efa0: `registered-pickup.contract.test.mjs` passed 25/25 isolated runs.
- Full `skills/decisions/scripts/*.test.mjs`: 252 tests, 252 pass, 0 fail.
- The ordering is now deterministic on every platform. `a` (0x61) sorts before `r` (0x72) under
  code-point compare, under win32 lowercasing, and under locale collation. The random mkdtemp
  suffix can no longer affect which entry is ordinal 0 or 1, so the held-claim block
  (`canonical[0]` = second repo) is stable too.
- Nothing else in the file or the implementation depends on the `registered-project-two-` prefix.

## Observation (not a finding)

The coordinator described the diff as one test file, but it also touches
docs/work/wr-2026-09-26-linux-green.record.md (+2 `Log:` lines, append-only, orchestrator-owned).
That file is outside code-review scope. It has no effect on behaviour.

## C4 fields

Cause: The test's expected order used `localeCompare`, while decisions-pickup.mjs:649-653 sorts by code-point compare of `${canonicalPathKey(repo)}\0${page}`. Mixed-case mkdtemp suffixes (U-Z/T) flipped the two orders about 10% of the time. Separately, the random suffix made the creation-order assertion discriminate only about 5-10% of runs.
Discriminating check: At de019ec, a scratch script against the real `runRegisteredPickup` showed the old comparator disagreeing on suffixes Vabcde/Tzzzzz/Uqrstu and the new one agreeing. At 875efa0, the creation-order mutant fails 20/20 (was 2/40) and the real implementation passes 25/25.
Fix location: skills/decisions/scripts/registered-pickup.contract.test.mjs:103-112 (fixture prefix and expected-order key) and :134 (comment). The implementation is unchanged.
Simplification: Choosing a fixture prefix that sorts first under every collation removes the dependence on random mkdtemp suffixes altogether. The mirrored comparator is now belt-and-braces rather than load-bearing.
