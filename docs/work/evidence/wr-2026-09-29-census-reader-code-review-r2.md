VERDICT: APPROVE 4f4edbc4e470e6faa4f9598763dbb4800468bb3e

# Lane 40b census reader: delta review r2 (A1/A2 closure)

- Reviewed artifact: `4f4edbc4e470e6faa4f9598763dbb4800468bb3e` (worktree HEAD confirmed; `git status` clean before and after).
- Baseline: approved `dc53988d`.
- Scope: closing advisories A1 and A2 from `docs/work/evidence/wr-2026-09-29-census-reader-code-review-r1.md` only. This is not a fresh full review.
- Findings: 0.

## Artifact identity

- `git diff --stat dc53988d 4f4edbc4 -- scripts/ skills/ plugins/` shows two changes: `scripts/jsonl-lines.mjs` (+7/-6) and `scripts/build-census.codex.contract.test.mjs` (+25, one added test). Everything else in the delta is docs and evidence under `docs/`. There is no production census logic change and no config change.
- The focused-r3 gate ran at `37f8915b`. `git diff --quiet 37f8915b 4f4edbc4 -- scripts/` shows no differences, so `scripts/` is byte-identical to that run. I also re-ran the gate at the current SHA (see below).

## A2: CLOSED (chunk-local LF scan)

- `jsonl-lines.mjs:15-23` matches r1's A2 "Replacement" block line for line. Nothing else in the file changed.
- Checked by reading the code:
  - **CRLF split across chunks:** `"x\r"` then `"\n"`. The first chunk has no LF, so it goes to `rest`. The second chunk has `end = 0` and yields `stripCr("x\r" + "")`, which is `x`. This is correct.
  - **Several complete lines plus a remainder:** the first line is joined with `rest`. Later lines are sliced from the chunk only, and `rest = chunk.slice(start)` replaces the old remainder rather than appending to it. A CR at the end of a chunk followed by LF in the next chunk still becomes `b`.
  - **Empty rows** (`"\n\n"`) yield `''` each time, as before.
  - **Errors:** a throw from the source leaves `for await` before the post-loop remainder yield, so the pending remainder is not emitted (unchanged).
  - **Early return:** the code still uses `for await`, so the iterator's `return()` destroys the Readable.
- Checked by running code:
  - **Differential fuzz:** I ran old and new `lfLines` side by side, in memory with no files written. The test used 20,000 random chunk sequences over `a`, `\r`, `\n`, ` `, `\n\n`, `\r\n` and `b`, with a source error injected at random in 30% of cases. Result: **0 differences**. Old and new output, including error propagation, are identical.
  - **Early break:** breaking out of a `Readable.from` stream left `destroyed === true`.
  - **Timing:** the same 32 MB single-row synthetic payload (64 KiB chunks) took **14 ms**. This matches the builder's 2965 ms → 14 ms claim. The input is synthetic only.

## A1: CLOSED (untimed segment-B witness)

- The added test (`build-census.codex.contract.test.mjs:279-302`) uses exactly the fixture r1 prescribed:
  - It runs in open mode (`from`/`to` null).
  - Segment A has a timed start and task, then completes.
  - Segment B has the same child id and a literal `task_started` for `b-turn` with no timestamp.
  - It asserts `scope.complete === false`, that the reason matches `/open or unbounded child segmented-untimed has no end-bound witness/i`, and that `combined === null`.
- The guard it pins is at `build-census.mjs:1554`: `childEnded = ... && !state.untimedStart`, merged across segments at `:1469`.
- Mutation evidence is reused from `wr-2026-09-29-census-reader-tests-untimed.md`, as the brief asked, not re-run. Removing `!state.untimedStart` (M6) turns the test red at the first intended assertion (`true !== false` on `scope.complete`), and the control is green 1/1. So the test does prevent a false COUNTED when the guard is missing. The mutation diff shown is exactly M6 from r1.

## Current focused gate (at 4f4edbc4)

`node --test` over the 8 focused files (codex.contract, completeness, build-census, wake-split, jsonl-lines, token-census, four-read.completeness, four-read): **307 tests, 307 pass, 0 fail**. The new A1 test passes. Fixtures use `os.tmpdir()`, and the worktree was still clean after the run. The full suite was not run, as the brief scoped.

## Verified absences

- The A2 patch does not change semantics: 0 differential mismatches, including error paths.
- The delta does not weaken or remove any test (the `scripts/` test diff adds lines only).
- There is no production completion or verdict logic change between dc53988d and 4f4edbc4.

## Remaining known limits (by reference, not closed here)

Items 1–5 in r1 "Remaining PARTIAL coverage limits" still apply unchanged:
1. The lead witness is still final-row only.
2. Usage after `task_complete` with no new start is counted as part of the ended child.
3. Pre-window conflicts between segments are not compared.
4. An excluded zero-usage child still leaves an `unusable child coverage` entry in JSON.
5. An untimed start in open mode is conservatively PARTIAL (now pinned by the A1 test).

Surviving equivalent mutants M9 and M11 are as documented in r1. The performance evidence is synthetic, not real-world. This review does not claim completeness beyond A1/A2.

## C4 fields

Cause: A2: `lfLines` appended every chunk to `rest` and rescanned it from offset 0, so one long row cost quadratic time. A1: the `untimedStart` guard in the open-mode segmented child path had no test, so M6 survived.

Discriminating check: A2 is covered by the old-vs-new differential fuzz (20,000 cases, 0 differences, errors included) and by 32 MB timing of 14 ms now against 2965 ms before. A1 is covered by the control test (green) and the M6 mutant (red at `scope.complete === false`). The focused gate is 307/307 at 4f4edbc4.

Fix location: `scripts/jsonl-lines.mjs:15-23` (`lfLines` loop body) and `scripts/build-census.codex.contract.test.mjs:279-302` (new test pinning `build-census.mjs:1554`).

Simplification: the reader is the same generator, now searching only the new chunk, with no new helper or state. A1 adds one focused test and no production change.
