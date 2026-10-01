VERDICT: DONE 1a493e21cc2bc240bfe694ade4fdde64cb32d459

# Lane 28 render-guard, round 2

Branch build/render-guard-1, worktree C:/Users/benzh/Code/render-guard/wt, starting head
7db6691, new head 1a493e21cc2bc240bfe694ade4fdde64cb32d459 (single commit).

Applied exactly the four items in the round-2 brief, drawn from
pack/reports/review.md's MAJOR-1/MINOR-1/MINOR-2/MINOR-3 findings. Nothing else touched.

## (1) MAJOR-1: writeErr wired into the CLI, plus a proving test

`skills/decisions/scripts/decisions-render.mjs:171` — added the missing `writeErr,` line to
`publishDeps` (the report's exact mechanical fix: `write,` was already there, `writeErr,`
was not, so `publish --dry-run`'s dirty-tree warning silently no-op'd through the real CLI
entry point even though the deps-level unit test passed).

New test in `decisions-render-publish.test.mjs`: `CLI run(): publishDeps forwards writeErr,
so the real CLI entry's --dry-run dirty-tree warning reaches stderr`. It imports `run` from
`./decisions-render.mjs` and calls it exactly the way the CLI does — `writeErr` passed only
as `run()`'s own top-level param, never inside `deps` — with a dirty scratch tree
(`?? docs/decisions/scratch.md`) and `--dry-run`. Asserts exit 0 and a captured stderr line
starting `warning:` naming the file.

Verified the fail-before/pass-after claim directly: I temporarily blanked the `writeErr,`
line, reran just this test file — the new test failed with `AssertionError` (warnings array
empty) while the other four new tests still passed — then restored the fix and reran the
full gate (626/626 green). No other test changed behavior from this edit.

## (2) --untracked-files=all

`decisions-render-publish.mjs:335`: `checkDecisionsTreeClean` now runs
`git status --porcelain --untracked-files=all -- docs/decisions` (was missing the flag), per
MINOR-2 — a host with `status.showUntrackedFiles=no` set, or a new untracked directory,
can no longer hide a dirty path from the guard.

## (3) Rename handling

`parsePorcelainEntries` (decisions-render-publish.mjs:314-323) now returns
`{status, paths, rest}` instead of `{status, path}`: `paths` is an array holding BOTH sides
of a rename (`orig -> new`), and `rest` keeps the raw `orig -> new` text. `checkDecisionsTreeClean`
now drops an entry only when EVERY path it names equals `docs/decisions/last-render.md` —
so a rename onto or from `last-render.md` (where before only the destination filename was
checked) now correctly counts as dirty — and the printed list uses `rest`, so both the old
and new path are named (matters because `git restore -- <new>` alone can't undo a staged
rename).

## (4) New pinning tests

Added to `decisions-render-publish.test.mjs`, in the existing "Fix 1" test block:
- `the dirty-tree check runs before step 2: owner input pending stays unseen, exit 7 not
  exit 3, and no write or drift compare happens` — dirty tree + a ticked-Done (owner-input
  pending) page, no `--clear-done`: asserts exit 7 (not 3), zero `writeFile` calls, and no
  `show`/`diff` git calls reached.
- `the dirty-tree status check runs in --repo, not cwd, with the docs/decisions pathspec` —
  custom `execGit` fake records `(args, cwd)` pairs; asserts the status call's `cwd === REPO`
  and the exact args array including the new `--untracked-files=all` flag.
- `a rename lists both the old and the new path, and is exit 7`
- `a rename onto last-render.md still counts as dirty (the source path is not exempt)`
- `a rename from last-render.md still counts as dirty (the destination path is not exempt)`

All three rename tests were checked against the pre-fix parser logic by hand: the "onto
last-render.md" case would have silently passed (zero entries, no throw) under the old
single-`path` filter — that's the actual bug MINOR-1 identified — confirming this test
exercises real prior-broken behavior, not just a redundant pin.

## Gate

`node --test skills/decisions/scripts/*.test.mjs skills/multi/scripts/note-send.test.mjs
skills/multi/scripts/hooks.test.mjs` → 626 pass, 0 fail, exit 0. Log at
C:/Users/benzh/Code/render-guard/pack/reports/B-gate.log.

## Territory / rules

Touched only `skills/decisions/scripts/decisions-render-publish.mjs`,
`decisions-render-publish.test.mjs`, and `decisions-render.mjs` (explicitly named in-territory
for this line per the round-2 brief). No Notion writes, no push, no spawn calls added (none
of this round's changes touch `runReaderCli`/`spawnSync`), no git identity changes, no
`--no-gpg-sign`/`--no-verify`, no trailers. One commit on build/render-guard-1. No dev server
started. No files deleted, no scratch directory used (no temp files needed — the
fail-before/pass-after check was done in place with a one-line sed and reverted before the
final gate run and commit).

## Files changed
- C:/Users/benzh/Code/render-guard/wt/skills/decisions/scripts/decisions-render.mjs
- C:/Users/benzh/Code/render-guard/wt/skills/decisions/scripts/decisions-render-publish.mjs
- C:/Users/benzh/Code/render-guard/wt/skills/decisions/scripts/decisions-render-publish.test.mjs
- C:/Users/benzh/Code/render-guard/pack/reports/B-state.md (state file, updated)
- C:/Users/benzh/Code/render-guard/pack/reports/B-gate.log (gate output)
