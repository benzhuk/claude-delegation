VERDICT: APPROVE 72f8b71e0410b55ce5402e5013de6541042f50a0

Lane 32 (autolink-guard), review r2, delta re-review of 3af975a..72f8b71. This review was read-only. `git fetch` and `git pull` reported "Already up to date" at 72f8b71, and `git status` in the worktree is clean. Every mutation ran on a scratch `git archive` copy of 72f8b71. That copy also needed `skills/multi/scripts/test-child-env.mjs`, which the test file imports; without it, the scratch baseline fails on a module-not-found error. The baseline was 94/94 before any mutation ran, and each mutated file was restored and byte-compared afterwards. The live proofs ran on a scratch clone at origin/main (1135f12).

Summary: F1 through F5 are all applied verbatim as patched, and each has a test that fails when its fix is reverted. The delta introduces no new defect and makes no change outside the lane's territory. There are two Low test gaps below (L1, L2). Neither blocks, and the code is correct as it stands.

## Prior findings

- **F1, fixed.** Core :146 is exactly the r1 replacement, `/<(?:https?:\/\/|www\.)[^>\s]*>/gi`. The doc comment at :122-127 is updated.
  - Mutation `F1revert` (back to `/<[^>]*>/g`) is killed by 3 tests: `a < b, see GOALS.md -> c`, `<GOALS.md>` and `<~/.agents>`.
  - Mutation `noAngle` (the exemption removed entirely) is killed by 2 tests: the original `<...>` URL test and the F1 `<https://example.com/x>` test.
  - Probes: all five r1 false negatives now refuse. `<https://x see GOALS.md>` and `<https://x>GOALS.md` refuse. `<details><summary>` passes.
- **F2, fixed.** Core :412 is `checkAutolinkLines(text, 'session.md')`.
  - Mutation `F2revert` (back to `bullets.join('\n')`) is killed by exactly one test: `render refusal F2 ... session.md:3`.
  - Live proof on the scratch clone: a bare `GOALS.md` line appended to the 9-line session.md reports `session.md:10`, and the process exits 2. With two blank lines before it (a 12-line file), it reports `session.md:12`. Both are the true line numbers.
  - The `since:` line cannot false-positive. `parseSessionSource` and `formatSinceHeading` already reject anything that is not a valid Date string, and no valid Date string contains `~`, `www.`, `http` or a listed extension. Scanning the untrimmed text changes nothing either, because the fence regex already allows leading whitespace.
- **F3, fixed.** The lookahead at :117 is `(?![A-Za-z0-9_-]|[./][A-Za-z0-9_-])`.
  - `F3revert` is killed by 2 tests. The half-mutants `F3onlySlash` and `F3onlyDot` are each killed by 1 test.
  - Probes: `notes.md/x.mjs` and `GOALS.md.bak` pass. `see GOALS.md.`, `see GOALS.md...`, `GOALS.md/` and `docs/notes.md` refuse.
- **F4, fixed.** The `'i'` flag is on both `AUTOLINK_FILENAME_RE` and `AUTOLINK_WWW_HTTP_RE`.
  - Mutations `dropSh`, `dropPy`, `dropIo` and `addJson` are each killed by the table test.
  - `fileNoI` and `urlNoI` are each killed by the case-insensitivity test.
- **F5, fixed.** SKILL.md:44-47 now names the eight extensions and cites `scripts/decisions-render.test.mjs`.
- **noFence (an r1 survivor), fixed.** The mutation is killed by the new fence test, and that test asserts the resume line `x:4`.

## New findings

### L1 (Low, non-blocking): no test pins the `\s` exclusion in the angle-bracket exemption
- Location: `decisions-render-core.mjs:146`.
- Mutation `angleAllowSpace` (`[^>\s]*` widened to `[^>]*`) SURVIVES. That widening is the F1 over-exemption bug class coming back: `<https://x see GOALS.md>` would be blanked whole and pass.
- The code is correct today (that probe refuses). The gap is only that a future loosening would go uncaught.
- Fix: add this test to `decisions-render.test.mjs`, next to the F1 tests:
  ```js
  test('checkAutolinkLines F1: an angle span with whitespace is not an autolink and is not exempt', () => {
    assert.throws(() => checkAutolinkLines('<https://x see GOALS.md>', 'x'), (e) => e instanceof RefusedError && /GOALS\.md/.test(e.message));
  });
  ```
  Predicted result: it passes on 72f8b71 and kills `angleAllowSpace`.

### L2 (Low, non-blocking): no test pins the `'i'` flag on the angle exemption
- Location: `decisions-render-core.mjs:146`, the `/gi` flags.
- Mutation `F1noI` SURVIVES. Without the flag, `<HTTPS://example.com/x>` would refuse, which is the safe direction to fail. Pinning it is optional.
- Fix, if wanted: add `assert.doesNotThrow(() => checkAutolinkLines('see <HTTPS://example.com/x>', 'x'));` to the F4 case-insensitivity test. Predicted result: it passes on 72f8b71 and kills `F1noI`.

## Observations (no action)
- **Deliberate side effect of F4.** Because of the `'i'` flag, `done.So` and `Mr.Me` now refuse; r1 listed `done.So` as passing. Both are typo-shaped, and refusing them is consistent with Notion's case-insensitive domain linking.
- **Real sources still pass.** They render with exit 0 (see "Test and render runs" below).
- **Cosmetic message detail.** `x.co.md` reports its match as `co.md`, not `x.co.md`. It still refuses, correctly, on the final-segment extension `md`. This is not worth a change.

## Diff since 3af975a
- **Code commit.** 72f8b71 (author Ben Zhuk) touches exactly three files: `decisions-render-core.mjs` (+9/-7 lines of code and comment), `decisions-render.test.mjs` (+70, tests only) and `SKILL.md` (the one sentence).
- **Record commit.** The only other commit in the range is 963a7f7, which touches `docs/work/wr-2026-09-27-autolink-guard.record.md` (the orchestrator's record).
- **Untouched.** `decisions-render.mjs`, `decisions-render-publish.mjs` and `docs/decisions/**` show no change across 3af975a..72f8b71.
- **Nothing else changed.** `stripExempt` is not touched, and there is no owner-quote exemption.

## Test and render runs
- **Test file.** `node --test skills/decisions/scripts/decisions-render.test.mjs` in the worktree gives 94 pass, 0 fail. The full suite was not run, as briefed.
- **Worktree sources.** `node skills/decisions/scripts/decisions-render.mjs render --repo .` in the worktree exits 0 with empty stderr. The worktree's sources have history through 2026-09-27.
- **Current main sources.** The branch's render code on a scratch clone of origin/main (1135f12) also exits 0. That clone includes `history/2026-09-28.md` and `waiting/release-0-20-16.md`.

## C4 fields
Cause: F1 blanked every `<...>` span before all three autolink rules ran. F2 numbered session.md refusals by bullet index instead of by file line.
Discriminating check: `F1revert` fails 3 of the new F1 tests, and `F2revert` fails the `session.md:3` render test. Each was run on a scratch copy against a 94/94 baseline and then restored.
Fix location: `skills/decisions/scripts/decisions-render-core.mjs:146` (F1) and `:412` (F2), plus `:117-118` (F3/F4) and `skills/decisions/SKILL.md:44-47` (F5).
Simplification: the F2 fix passes the raw file text instead of rebuilding it from bullets, which removes the mismatch between bullet index and file line rather than adding offset arithmetic.

## Scratch to delete (lead's command; the delete guard refuses a recursive rm by an agent)
`C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/588290d9-ee43-400b-a808-cf44c407171c/scratchpad/r2x`
