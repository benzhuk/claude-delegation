VERDICT: APPROVE 1a493e21cc2bc240bfe694ade4fdde64cb32d459

# Lane 28 render-guard: round-2 delta review

Scope: `git diff 7db6691..1a493e2` in C:/Users/benzh/Code/render-guard/wt (branch build/render-guard-1), a single commit. Read-only review. Every mutation ran on scratch copies of `skills/decisions/scripts` outside the repo. The worktree was clean before and after (`git status --short` printed nothing). I made no commits anywhere, including scratch.

## Gate

`node --test skills/decisions/scripts/*.test.mjs skills/multi/scripts/note-send.test.mjs` gave 600 pass, 0 fail, exit 0. The builder reported 626 because their run also included hooks.test.mjs.

## Nothing else changed: verified

The diff touches exactly 3 files: decisions-render.mjs (+1), decisions-render-publish.mjs (+12/-7) and decisions-render-publish.test.mjs (+108). No other hunks.

## Prior findings

### MAJOR-1: writeErr not forwarded to publishDeps. FIXED.
- decisions-render.mjs:171 now has `writeErr,` in `publishDeps`, ahead of `...deps`.
- `baseDeps` (test.mjs:69-90) does not supply `writeErr`. The new test passes `writeErr` only as run()'s top-level parameter, so it really goes through the CLI wiring.
- Mutation m1: I deleted the `writeErr,` line in a scratch copy. The test "CLI run(): publishDeps forwards writeErr..." fails, and the other 47 tests in the file pass. With the line restored in base, all 48 pass. The test catches the regression.

### MINOR-2: untracked files hidden by status.showUntrackedFiles=no. FIXED.
- decisions-render-publish.mjs:336 now runs `status --porcelain --untracked-files=all -- docs/decisions`.
- Real git check in a scratch `git init` with `status.showUntrackedFiles=no` and an untracked `docs/decisions/newdir/a.md`: without the flag the output is empty; with the flag it prints `?? docs/decisions/newdir/a.md`.
- Mutation m2 (flag removed): the `--repo` pin test fails on its exact-args `deepEqual`.

### MINOR-1: a rename was reduced to its new path. FIXED.
- `parsePorcelainEntries` now returns `{status, paths:[orig,new], rest}`.
- An entry is exempt only when every path it names is last-render.md, so a rename onto or from last-render.md is dirty.
- The printed list uses `rest` (`orig -> new`), so both paths appear in the exit-7 message and the dry-run warning.
- Mutation m3: I restored the old destination-only filter. "rename onto last-render.md" fails.
- Mutation m3b: `every` changed to `some`. Both the onto and from tests fail.
- Mutation m4: the list prints only the new path. "a rename lists both..." and "onto last-render.md" fail.

### MINOR-3: no pins for check order, --repo scope or rename. FIXED, and the pins are meaningful.
- **Order.** Mutation m6 moves `checkDecisionsTreeClean` from right after step 1 to after step 2. The order test fails: a ticked Done with no `--clear-done` hits the owner-input exit instead of exit 7. The test also asserts zero `writeFile` calls and no `show`/`diff` git calls.
- **--repo.** Mutation m5 runs status in `process.cwd()` instead of `repo`. The --repo test fails on `statusCall.cwd === REPO`. The same test pins the exact pathspec args.
- **Rename.** Three tests: both paths are listed, a rename onto last-render.md is dirty, a rename from it is dirty. Each is killed by at least one of m3, m3b or m4.

All seven scratch mutants (m1, m2, m3, m3b, m4, m5, m6) were killed. The unmutated base copy passes 48/48.

## New findings

None blocking.

- INFO, not required. decisions-render-publish.mjs:320: the ` -> ` split runs on every porcelain line, not only on `R`/`C` status lines. With a pathological untracked name such as a directory literally called `last-render.md -> docs` holding `decisions/last-render.md`, both halves would equal the exempt path and the entry would be dropped. This is not a realistic threat. Quoted paths (core.quotePath) are also safe, because they never match the exempt string. If wanted, the change is: `const isRename = status[0] === 'R' || status[0] === 'C'; const paths = isRename && arrow !== -1 ? [...] : [rest];`. Predicted outcome: the same 48/48, with that edge case closed.

## Verified absences
- The CLI path cannot shadow `writeErr` through test `deps`, because baseDeps has no writeErr.
- No other caller uses the old `.path` field of `parsePorcelainEntries`. grep finds one use, at line 343.
- No changes outside the three named files. No commits beyond 1a493e2.

## Cleanup for the lead
Scratch directories I created and could not remove (the delete-guard blocks agent `rm -r`) are under C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/588290d9-ee43-400b-a808-cf44c407171c/scratchpad/: `rg/` (base plus mutants m1 to m6) and `gitprobe/`, which is an uncommitted scratch `git init`.
