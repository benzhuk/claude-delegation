PASS

# T4 — Janitor workarounds

Territory files only: `scripts/janitor.mjs`, `scripts/janitor.test.mjs`. Worktree
`C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31\scratchpad\next-build\wt-T4`,
branch `feat/next-build-T4`, base `95d54535e1d6deb3ed242a95a23beb8b43c11d7c`.
Commit: `8498f22 feat(janitor): add T4 workarounds JUDGMENT row gathered from docs/work`.

## What changed

`scripts/janitor.mjs`:
- Imports `listRecords` from `./work-record.mjs` (read-only, contract import — T1's file, not
  touched).
- New `gatherWorkarounds(root, { now, fsImpl })` (exported): calls
  `listRecords(path.join(root, "docs", "work"))`, skips any record with no `fields.work`, and for
  each `record.workarounds[]` builds
  `{ ref: workId, reason: "<cause> / remove when <removeWhen> (overdue|open)", overdue }`. A
  missing `docs/work` directory is not a finding — `listRecords` (`scripts/work-record.mjs:93-108`)
  already returns `[]` when the directory can't be read.
- `isWorkaroundOverdue(removeWhen, now)`: only a `by <yyyy-mm-dd>` (case-insensitive) form with a
  date in the past is overdue; a worded condition or a future date is "open".
- `gatherState()` sets `result.judgment.workarounds = gatherWorkarounds(root, { now })`.
- `printReport()` prints `workarounds:` right after `untracked files:`, before `DRIFT:`.
- `hasFindings()` and the `--apply` path's `judgmentRemains` both now also treat any
  `overdue: true` workaround row as a finding; open rows never affect exit code.

`scripts/janitor.test.mjs`: added `writeWorkRecord()` helper and 5 new tests (no `docs/work` dir
= no finding; overdue date = JUDGMENT + exit 1; two open cases (future date, worded condition) =
JUDGMENT rows + exit 0, printed after untracked files; record missing `Work:` = skipped, no
crash; direct unit test of `gatherWorkarounds` with two `WORKAROUND:` lines on one record).

## Addendum A4 (spec-addendum-r3.md)

Read as instructed. A4 pins three definitions: owner-change `Log:` line, `formatLogLine`'s
trailing-space/`undefined` behavior, and `validateRecord` without `repoRoot`. All three live in
`scripts/work-record.mjs` (`validateRecord`, `formatLogLine`) — T1's territory, read-only for me
— and my code never calls `validateRecord`/`formatLogLine` nor inspects `Log:`/owner fields at
all (`gatherWorkarounds` only reads `record.fields.work` and `record.workarounds`). **A4 required
no code change in T4's two files**; applied by inspection, noted here per instruction.

## Gate

`node --test scripts/janitor.test.mjs` — **42 pass, 0 fail**. Log:
`C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31\scratchpad\next-build\reports\T4-gate.log`.

## Deviations / assumptions (flagged for seam review, not blocking)

1. `<x>` in the reason string is the raw `removeWhen` value verbatim (e.g. `by 2020-01-01`, or a
   worded condition), not reformatted — matches the spec's literal `"<cause> / remove when <x>
   (overdue|open)"` template as I read it.
2. Extended the `--apply` exit-code's `judgmentRemains` check to also require no overdue
   workarounds, by analogy with the non-apply path (spec doesn't spell out the `--apply` case
   explicitly for this new row kind). Workarounds have no apply action themselves — nothing new is
   deleted or touched by `--apply`.

State file (six sections, current): `C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31\scratchpad\next-build\reports\T4-state.md`.

## Round 2

Reviewer verdict: NEEDS_FIXES (3), all MAJOR, each with a ready patch
(`next-build/reports/T4-review.md`). All three applied verbatim, plus the two tests the review
asked for. Commit: `eada62c fix(janitor): bound the overdue-date regex, don't blind on an
unreadable record, stop leaking real wiring in tests`.

1. **MAJOR 1** — `isWorkaroundOverdue` (`scripts/janitor.mjs`) only matched the exact `by
   <yyyy-mm-dd>` form, so `2020-01-01` (bare date) and `by 2020-01-01 at the latest` were
   silently read as "open" instead of overdue, letting a genuinely overdue workaround exit 0.
   Also used an unbounded `[ \t]+`/`[ \t]*`, breaking the repo's regex rule. Fixed with the
   patch's bounded, optional-`by`, trailing-words-allowed regex:
   `/^(?:by[ \t]{1,20})?(\d{4}-\d{2}-\d{2})\b/i`. Added a third `WORKAROUND:` line (bare date,
   no `by`) to the `gatherWorkarounds` unit test asserting `overdue === true`.
2. **MAJOR 2** — `listRecords` guards `readdirSync` but not `readFileSync`; a directory (or a
   win32-locked file) named `*.record.md` under `docs/work` threw `EISDIR` out of
   `gatherWorkarounds` → `gatherState` → into `main()`'s fail-open catch, which printed nothing
   and exited 0, hiding every other finding. `gatherWorkarounds` now wraps the `listRecords` call
   in its own try/catch, writes one stderr line, and returns `[]` so the rest of the report still
   prints. Added test "MAJOR 2: an unreadable docs/work entry (a directory named *.record.md)
   does not blind the whole report" — reproduced live on this machine (log line
   `janitor: could not read work records in ...docs\work: EISDIR: illegal operation on a
   directory, read` appears in the gate log), and the rest of the report (`SAFE:` section, etc.)
   still prints with exit 0.
3. **MAJOR 3** — three of my round-1 tests called `main()` without suppressing `console.log`,
   so they printed the real machine's `~/.agents` wiring rows into test output (the same class of
   leak main-checkout commit `1fdd51b` fixed elsewhere in this file). Wrapped all three the same
   way every other `main()` call in this file already is.

Gate after fixes: `node --test scripts/janitor.test.mjs` — **43 pass, 0 fail** (was 42; +1 for
MAJOR 2's new test). Log refreshed at
`next-build/reports/T4-gate.log`.
