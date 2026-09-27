VERDICT: APPROVE ed9d8ca25648835ae4c3835ee618c188ef9f6c8c

# C1 review, round 2 (collect-status-1), delta re-review

Reviewed: `/home/ben/Code/wt-collect-status-1-C1`, HEAD `ed9d8ca25648835ae4c3835ee618c188ef9f6c8c`
(from my own `git rev-parse HEAD` in the worktree). Range `eaa3631..ed9d8ca` is one commit,
`fix(collect-status): round 2 — apply C1-review-r1 findings`. It touches 5 files:
`scripts/collect-status.mjs`, `scripts/collect-status.test.mjs`, and the builder's own
`reports/C1.md`, `C1-state.md` and `C1-gate.log`. Nothing outside the territory changed.

Gate, re-run by me with the brief's own command: `node scripts/run-tests.mjs scripts/collect-status.test.mjs`
exited 0 with `tests 24, pass 24, fail 0`. The log went to the scratch folder. `git status --short`
in the worktree was empty afterwards.

I did every mutation on a `git archive HEAD` copy in the scratch folder, never in the reviewed tree,
and restored the copy after each one (the final `diff` came back identical).

Severity counts: 0 BLOCKER, 0 MAJOR, 0 MINOR, 2 NIT.

## How each prior finding was fixed

| # | Prior | Status | Evidence |
|---|---|---|---|
| F1 | MAJOR | Fixed | `collect-status.mjs:324` compares `previousStatus.announced` with `currentKey`. The regression test is at `test:422-443`. **Mutation:** switching back to `changeKey` makes exactly that test fail (23 pass, 1 fail). |
| F2 | MAJOR | Fixed | `buildStatusMd` at `:231-266` now has a line budget. **Test:** the 40-row test at `test:234-252` counts every line. **Mutation:** setting the budget to 100000 makes it fail. |
| F3 | MINOR | Fixed, no test | `:237` now reads `if (sendOutcome.reason) lines.push(...)`. No test pins it; see NIT-1. |
| F4 | MINOR | Fixed | `:327` sends only when `!fetchFailed && mainSha && !sameAsPrevious`. The test is at `test:445-457`. **Mutation:** dropping `mainSha &&` makes it fail. `announced` carries over through `:336`. |
| F5 | MINOR | Fixed | The boundary test at `test:167-168` uses exactly 4h and 4h + 1s. **Mutation:** changing `>` to `>=` at `:102` makes it fail. |
| F6 | MINOR | Fixed | `snapshotGitDir` now walks `root` (`test:79-92`), and the test still passes. The helper name and test title still say ".git"; see NIT-2. |
| F7 | MINOR | Fixed | **(a)** The header comment at `test:3-9` now says the helpers are copied, and the round-2 section of the report flags this as a deviation. **(b)** `after()` returns early when `FIXTURE_ROOT` is set (`test:490-497`). That directory is `<sealed home>/fixtures`, under `raw`, which makeTempHome's `cleanup()` removes (`test-home.mjs:52,65,107`). |
| F8 | MINOR | Documented | The report now states: "note-sending is Linux/macOS only; a Windows collector ... never calls note-send". The finding asked only for documentation, so no code change was expected. |
| NIT | NIT | Fixed | At `:354-357` the temp file is written first, then status.json is renamed to previous.json, then the temp file is renamed to status.json. The "no temp file left behind" test still passes. |

## Regression hunt on the new code

- **Line budget, exhaustive check. Verified correct.**
  - I ran `buildStatusMd` over every rows count n from 0 to 120 and every attention count m from 0
    to n, with and without a reason line: 14,762 cases.
  - Result: 0 violations, and the most lines in any output was 60.
  - The checks were:
    - total lines are at most 60;
    - the `(+K more` line appears only when something was cut;
    - K equals the true number of hidden attention entries plus hidden table rows;
    - whenever something is cut, the output uses the full 60 lines, so nothing is cut early.
  - `attention (n)` always shows the true total.
  - Printed table rows are still produced by `formatTable` on a slice, so their bytes are
    unchanged.
- **F1 interactions. Verified correct.**
  - First run fails its fetch: `announced` stays null, and the next good run sends.
  - `--main` ref missing: `announced` carries over, and the next good run compares against the
    last real announcement.
  - `--quiet`, a missing `--to` and a missing note-send still count as announced (the builder's
    deviation 5, disclosed and unchanged).
- **Attack brief, unchanged surfaces. Still no path from a branch or record field to shell or
  envelope.**
  - The new status.md reason line prints only fixed literals or `note: send exit <integer|unknown>`
    (`:180-195`).
  - `--text` and `--goal` construction is unchanged.
  - A failed fetch still never sends (`:327`).
  - Nothing stops a second host from installing its own collector, which matches the ruling. The
    change makes no claim otherwise.

## NIT-1: F3's fix has no test pinning it

Mutation check: reverting `:237` to
`if (sendOutcome.attempted && !sendOutcome.sent && sendOutcome.reason)` leaves the suite at 24/24.
Optional fix, a test to add next to the `--quiet` test:

```js
test("a non-zero note-send exit is shown in status.md", () => {
  const root = initRepoWithOrigin(); const out = outTmp();
  main(["--repo", root, "--no-fetch", "--out", out, "--to", "lead"],
    { spawnNoteSend: () => ({ status: 1 }), resolveNoteSend: alwaysNoteSend });
  assert.ok(fs.readFileSync(path.join(out, "status.md"), "utf8").includes("note: send exit 1"));
});
```

Predicted result: it passes at HEAD and fails with the reverted guard.

## NIT-2: the helper name and test title still say ".git" after F6 widened the scope

- The helper `snapshotGitDir` (`test:79`) is still named after `.git`.
- The test title at `test:459` still reads "every file under .git is byte-identical". Both now
  cover the whole repo.
- Cosmetic only: rename them to `snapshotRepo` and "every file under the repo".

## Builder process notes (information only)

- The report's round-2 gate numbers (46/46) come from `node --test` over two files, not from the
  brief's `run-tests.mjs` gate. The report's "sealed" cross-check figure (21) is from round 1.
- My own run of the brief's command gave 24/24, quoted above.
- One side effect: under a direct `node --test` run, `FIXTURE_ROOT` is unset, so F7(b)'s
  `rmSync` branch runs. That is the documented fallback.
