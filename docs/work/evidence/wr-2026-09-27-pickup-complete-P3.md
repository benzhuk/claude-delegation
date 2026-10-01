VERDICT: APPROVE b62e6129819cfbdde472f27744642fd162ddf910

# P3 review, round 2 (delta)

- Territory: P3.
- Worktree: /home/ben/Code/wt-pickup-complete-1-P3.
- Reviewed sha: b62e6129819cfbdde472f27744642fd162ddf910, from my own `git rev-parse HEAD`.
- Range: 8388280ac7d16ceaeb3a1795947f3b591dbbe62c..HEAD, one commit (b62e612).
- The worktree is clean before and after this review. I wrote nothing inside it. All probes and mutations ran on a `git archive HEAD` copy in my scratch folder.

## Gate

I ran the brief's gate command first: the three test files through `node scripts/run-tests.mjs`. It exited 0 with 138 pass and 0 fail. Round 1 had 132 tests; this round adds 6.

## The failure class this build watches for

The class is a check that passes because it isn't looking, or an unknown shown as a confident number. For P3 that means the stale-title case must run on a stale fixture.

- That is still true. Test :981 is unchanged.
- The new DST tests pin the fall-back behaviour with real instants: 05:31Z gives 1 min, and 06:31Z gives 61 min. These are fixtures, not abstract assertions.
- MINOR-4 was an unknown shown as "not configured". It now has its own sentinel value and a visible suffix, and a mutation check shows the test catches a revert (details below).

## Prior findings, each verified

**MAJOR-1 (DST comparison untested): fixed.**
- The four tests from the round-1 patch are in decisions-handback.test.mjs:1169-1195, copied verbatim, and all pass.
- The doc comment is at decisions-handback.mjs:149-165. It is on `nyWallTimeToUtcMillis` rather than `titleTimeMillis`, which is the better spot because that function does the resolving.
- I checked the comment's reasoning by hand. The first guess is 01:30Z, which is EDT in NY, so the guess moves to 05:30Z. 05:30Z is still EDT because fall-back happens at 06:00Z, so the loop settles on EDT. The comment is accurate.
- The fail-closed choice is kept. The test at :1181 would fail with 1 min instead of 61 min if someone changed the resolver to pick EST. So the choice is pinned by a test, not just described.

**MINOR-2 (URL-form page id): fixed.**
- `canonicalPageId` is replaced with the round-1 patch verbatim (decisions-title.mjs:44-50).
- `pageHint` is canonicalised (decisions-handback.mjs:204).
- There is a new unit test at decisions-title.test.mjs:125.
- End-to-end probes (scratch copy, injected `readDecisionsUrl`):
  - URL `decisions_url`, no meta: `TITLE unchecked: ... --page 3e1da11277a18174bccfea187d5c3972 ...`, exit 1. That hint is a valid `--page` for decisions-title.mjs.
  - URL `decisions_url`, meta for the same page: `title ok`, exit 0.
  - URL `decisions_url`, meta for another page: exit 3, "title-meta page does not match".
  - Dashed id inside a URL with a trailing slash: `title ok`, exit 0.
- Unit probes:
  - Upper-case, dashed, and `#fragment` forms all canonicalise to the bare id.
  - `undefined` and `null` now return `''` instead of `'undefined'`/`'null'`. I checked every caller:
    - handback :222 type-checks `meta.page` as a string first;
    - `lookupRegisteredTopic` :125 type-checks `entry.page`;
    - title :272 runs only after `PAGE_ID_RE` has validated `args.page`.
  - So none of them can reach the changed behaviour. No regression.

**MINOR-3 (SKILL.md retitle failure guidance): fixed.**
- The sentence is added at SKILL.md:128-131, word for word as recommended.
- It is pinned by skill-text.test.mjs:73-77, which checks the `--topic`, exit 2, and exit 3/4 wording.

**MINOR-4 (missing loader rendered as "not configured"): fixed with the first option offered.**
- `defaultReadDecisionsUrl` returns a module-private `DECISIONS_URL_UNVERIFIABLE` symbol when the loader is missing (decisions-handback.mjs:34 and :410).
- `titleCheckLine` tells that apart from `null` (:200-202). The `title ok` line then gets the suffix ` (page unverified: project-config.mjs not found)` (:244-245).
- The line is still non-blocking, so the existing `missingDependencyExplicitGoals` `HANDBACK ok` expectation holds.
- The new assertion is in the copied-skill spawn test (decisions-handback.test.mjs:961-967).
- Mutation check on the scratch copy: I reverted :410 to `return null`. The copied-skill test then failed. With HEAD restored, it passed.
- Only `titleCheckLine` reads the symbol. It never reaches output, and it never reaches `canonicalPageId`, because `decisionsUrl` is set to `null` when the page is unverified.

## Regression hunt

- **Scope.** Across base..HEAD, only the six P3 files changed. decisions-pickup.mjs, decisions-read.mjs and docs/work/ are untouched.
- **Network and token.** The delta adds no `fetch(` call and no output path that could carry the token.
- **Scratch-copy caveat.** One test fails on the scratch copy both with and without my mutations: "CLI: real process, without --head, calls real git". The scratch copy is not a git repo, so this is environmental. The same test passes in the worktree gate.

## Observations (not findings, nothing blocks)

- **The pageHint canonicalisation has no test of its own.**
  - I reverted decisions-handback.mjs:204 to `decisionsUrl || '<id>'` on the scratch copy, and no test failed.
  - Impact is low. If this regresses, the hint prints a URL, and decisions-title.mjs rejects it loudly with exit 2. It never passes silently.
  - Optional test for the builder, placed after decisions-handback.test.mjs:1063:

    ```js
    test('--title-meta missing flag: a URL-form decisions_url is hinted as its bare page id', () => {
      const { exitCode, stdout } = runWith({
        argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
        files: { d: CLEAN_DECISIONS, g: CLEAN_GOALS },
        readDecisionsUrl: () => 'https://www.notion.so/Skills-3e1da11277a18174bccfea187d5c3972?pvs=4',
        omitTitleMeta: true,
      });
      assert.equal(exitCode, 1);
      assert.match(stdout, /^TITLE unchecked: run decisions-title\.mjs meta --page 3e1da11277a18174bccfea187d5c3972 and pass --title-meta$/m);
    });
    ```

  - Predicted outcome: passes on HEAD, and fails if :204 is reverted.
- **SKILL.md does not mention the suffix.** SKILL.md:359 documents `title ok: <title>` but not the ` (page unverified: ...)` suffix. The line still starts with `title ok: ` and still does not block, so what SKILL.md says remains true. A one-line mention would help anyone reading the output.
- **Observations carried from round 1.** Negative staleBy, `--now` parsed in local time, and `res.json()` running with no timer are all unchanged. None of them is a defect.

Cause: the round-1 defects were an ambiguous NY wall time settling on EDT with no comparison test, `canonicalPageId` handling ids only and not URLs, missing retitle-failure guidance in SKILL.md, and a missing loader returned as a plain `null`. All four are now fixed and pinned by tests.
Discriminating check: the new DST test at :1181 asserts a 61-minute gap. Reverting :410 on a scratch copy makes the copied-skill test fail.
Fix location: none needed this round. Optionally, add a pageHint URL test after decisions-handback.test.mjs:1063.
Simplification: none needed. The fixes are the minimal patches from round 1, applied verbatim.
