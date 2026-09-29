VERDICT: APPROVE 9435161

# Lane 47 (repo-env-everywhere-1) review r3: delta 6ef609a..9435161

I found no defects in this delta. R2-1, R2-2, R2-3, NIT 1 and NIT 2 were each applied as lead-ruling-r2.md rules. The code changes are exactly the patches in review r2. The two F3 test files at 9435161 are byte-identical to the scratch-copy versions I checked in r2: blob `ec5dc73` for collect-from-origin.test.mjs and blob `220d593` for decisions-render-core.test.mjs. I also looked for regressions in the rest of the delta and found none.

Bug-fix fields (R2-1, confirmed at 9435161):
Cause: bearingsNotice treated the main checkout's answer as final unless the worktree's answer was exactly `current`. A main checkout with no card, or with no receipt, therefore masked a worktree that was due.
Discriminating check: in probe-f2-g case G (card only in the worktree, no receipt, cwd = worktree), `bearingsNotice` gives `null` at 1b6a5d5 and 6ef609a. It gives "Bearings are due." at base d6f5c9d and at 9435161, which agrees with `check --repo <wt>` = `due/no completion receipt`.
Fix location: hooks/lib/goal-context.mjs:44-52 (the `mainSilent` condition), plus the new test in hooks/lib/goal-context.test.mjs:138-165.
Simplification: this changes one condition only. It adds no module and no second resolution path.

## Verified

- **R2-1: the fix is right in every case I ran.**
  - The goal-context.mjs diff is the review's replacement, word for word.
  - I reran `probe-f2-g.mjs` and `probe-f2.mjs` on a `git archive 9435161` copy. Results for base / r0 / 9435161:
    - G: DUE / null / DUE.
    - I: DUE / DUE / DUE.
    - A: DUE / null / null.
    - B: null / DUE / null.
    - C: DUE / DUE / DUE.
    - D: null / null / null.
    - D2: DUE / DUE / DUE.
  - These match what I predicted in r2. Both directions still work, and so does a non-repo cwd.
  - The new test is red at 6ef609a: I copied the 9435161 test file into a `git archive 6ef609a` copy, and it gave 3 pass, 1 fail with `actual: 'null'`.
  - It is green at 9435161: 4/4 pass.
  - Both production callers, delegation-reminder.js:327-432 and multi-codex-hook.mjs:83, call it with the same signature. Nothing else changed for them.
- **R2-2: all five build.md patches were applied as given.**
  - A grep of build.md at 9435161 finds no remaining "actual cause", "confirmed on the real", "mechanism found above" or "found by reproduction".
  - `node scripts/bugfix-fields.mjs .../build.md` reports "all four fields present".
  - The four Part 2 fields are unchanged.
- **R2-3: the victim-repo standalone check passes.**
  - I made a new scratch repo `victim3` with one tracked `keep.txt`.
  - With `GIT_DIR=<victim3>/.git` exported, I ran `node --test scripts/collect-from-origin.test.mjs skills/decisions/scripts/decisions-render-core.test.mjs hooks/lib/goal-context.test.mjs` from the 9435161 copy. 28/28 pass.
  - Afterwards victim3 still has one commit (`victim3-seed`), only the branch `master`, and only `keep.txt` in `ls-files`.
  - In r2 the same test files gave me 24/24 red on base and on the single-wrap mutation.
- **NIT 1:** applied at note-inbox.test.mjs:208.
- **NIT 2:** the correction is recorded in build-r2.md. build-r1.md is unchanged since 823a2c9 (`git diff --stat 823a2c9 9435161` on that file is empty).
- **Regressions: none found in this delta.**
  - The targeted list on the 9435161 copy gives 469/470. The one failure is the expected "CLI: real process, without --head, calls real git", because an archive copy is not a git repo. That is the same as r1 and r2.
  - The files changed are goal-context.mjs, three test files and docs. Nothing else in production code changed.
  - I did not rerun the full `run-tests.mjs`. My r2 run of it was polluted by socket-path length from a long TMPDIR, and the builder reports 2698 pass and 0 fail at 9435161. The targeted list covers every file this delta touches.
- **Identity:** every commit from 6ef609a to HEAD has author and committer Ben Zhuk.

## Denied commands

None.

## Commands run

- `git cat-file -t 9435161` / `3f81ca7`. Both were already present and the worktree HEAD is 183b488, so no pull was needed and I ran none.
- `git log` and `git diff 6ef609a..9435161`; read lead-ruling-r2.md and build-r2.md.
- `mktemp -d .../lane-47/r3-XXXX` (r3-R3Z7), then `git archive` of 9435161 (`fix`) and 6ef609a (`prev`). `base` and `r0` are symlinks to the r2 copies.
- Probes: `node probe-f2-g.mjs`, `node probe-f2.mjs`.
- The victim3 poisoned standalone `node --test` run.
- The targeted `node --test` list.
- The red run on `prev` with the new test file copied in.
- `bugfix-fields.mjs` and a residue grep on build.md.
- `git grep` for `bearingsNotice(` callers.

Nothing was written to the reviewed worktree, and I ran no deletes. Scratch left behind is `.../lane-47/r3-R3Z7/` (the copies, `victim3`, probe fixtures and the probes).
