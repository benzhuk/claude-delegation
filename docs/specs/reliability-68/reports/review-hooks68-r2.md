VERDICT: APPROVE 03bc7f60358ccc944d1207b2050204a114a45db6

# Review hooks68, round 2 (delta re-review)

Reviewed commit: 03bc7f60358ccc944d1207b2050204a114a45db6 (my own `git rev-parse HEAD` in wt-reliability-68-hooks68). Delta range 34faa09a9e981a122b2dc8b0a87a8358e18bc714..HEAD: two commits, 3 files, +1 -11.
- c548618d chore: drop test ledger files committed by mistake
- 03bc7f60 test: give C11 a git checkout cwd so it cannot write a ledger line into the repo

Nothing else changed since round 1. `git diff 34faa09a..HEAD` with docs/ledger and inbox.test.mjs excluded is empty. So the round-1 contract checks for A, B and C, the mutation checks and the pin checks still apply to this sha unchanged.

Severity count: BLOCKER 0, MAJOR 0, MINOR 0 new. The round-1 notes M1 and M2 stand as notes. M1 was the undisclosed ledger files, which are now removed.

## Prior findings

### F1 (MAJOR): test ledger files committed. FIXED.
- c548618d deletes `docs/ledger/1969-12-31.md` and `docs/ledger/2026-09-17.md`.
- `git diff --stat 0f910a7a..HEAD -- docs/ledger` is empty, and `git ls-files docs/ledger` lists nothing.
- The full base..HEAD diff is now 27 files, +397 -24. Every file is inside hooks68 territory: agents/, codex/agents/, docs/mandate-template.md, hooks/, scripts/{plugin-staleness,wiring-check}.mjs and their tests, skills/delegate/SKILL.md, skills/team-build/SKILL.md, skills/multi/scripts/.

### F2 (MAJOR): inbox.test.mjs C11 wrote a ledger line into the repo. FIXED.
- The patch was applied verbatim at skills/multi/scripts/inbox.test.mjs:1231: `fs.mkdirSync(path.join(home, '.git'));`. The test still asserts `budget === SEND_INBOX_BUDGET_MS` (line 1241), so its purpose is unchanged.
- Cause: the note-send.mjs:663 non-checkout fallback sends a `cwd: home` record with no `.git` to `process.cwd()`, which is the repo.
- Discriminating check: in a scratch clone at HEAD I swapped in the 34faa09a version of inbox.test.mjs and ran it. Result: 73 pass, 0 fail, and the clone was left with `?? docs/ledger/2026-09-17.md`, so the leak is back. With the HEAD version, two runs in a row gave 73 pass, 0 fail each, with `git status` clean. I restored the scratch clone afterwards.
- Fix location: skills/multi/scripts/inbox.test.mjs:1231 (test fixture only; production code unchanged).
- Simplification: none needed. The fix is one line and matches the existing C9 and N5 pattern.

## Regression hunt (scratch clone at 03bc7f60, never the reviewed worktree)
- I ran the gate's 8 files plus inbox.test, hooks.test and multi-hook-core.test: 615 tests, 615 pass, 0 fail. That matches round 1's 615. Afterwards `git status --short --untracked-files=all` was empty.
- note-flush.test plus decisions-pickup.test: 153 pass (combined), 0 fail. No repo write.
- The reviewed worktree's `git status --short --untracked-files=all` was empty at the end of the review.

## Scope
- The delta touches only docs/ledger (deletions, which undo the round-1 out-of-territory files) and one hooks68-owned test file.
- No plugin.json change, no dotfiles or ~/.claude edits, no secret reads.
