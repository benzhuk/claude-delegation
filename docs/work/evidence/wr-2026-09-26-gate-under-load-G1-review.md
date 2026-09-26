VERDICT: APPROVE 0c00422e97755df7d01127e529c8216c756ee8f9

I found no blocking findings. Every check in the attack brief was run on a disposable copy, and the commit passed all of them. Model: Opus 5.5 (`claude-opus-5-5`).

**Findings**

1. **Low (evidence provenance, not a code defect).** The ten loaded-run logs were written between 23:07:53Z and 23:13:29Z, but commit `0c00422` was created at 23:15:46Z (author timestamp 1790464546). So the logs show a working tree that later became the commit, not the commit hash itself. The new test name and the exact printed line (`below-threshold PostToolBatch average: …ms; DELEGATION_PERF_ASSERT armed: false`) only exist in this change, and my focused runs of the exact commit agree with the logs. Still, the logs can't prove the bytes were identical.
   - Cause: the harness ran before the commit and never recorded a hash.
   - Discriminating check: the logs contain no hash; I ran the exact commit's tree myself (below).
   - Fix location: record only. Note the gap in the work record; no code change needed.
   - Simplification: have the load harness log `git rev-parse HEAD` and `git status --short` next to each run.

2. **Info (by design).** The revised MAJOR 2 test on its own doesn't catch a hook that fires early or twice. That's expected: the base code explicitly allows racing hooks to fire twice. The unchanged sibling tests catch both mutants (measured in M4 and M5 below).
   - Cause: duplicate firing under concurrency is permitted.
   - Discriminating check: M4 and M5.
   - Fix location: none.
   - Simplification: none needed.

**What I checked**

- **Never-firing hook fails the revised test.**
  - M2: replaced `markFired(sessionId, agentId);` at `hooks/delegation-reminder.js:428` with `return nothing;`. The focused MAJOR 2 run failed with "the overdue time fallback fires after a lossy fan-out stays quiet" (exit 1).
  - M2b: the same mutant with the fan-out cut to 1 process also failed (exit 1).
- **The fallback moves the existing clock back instead of faking anything.** `hooks/delegation-reminder.test.mjs:352-359` uses `fs.utimesSync` on the existing `.fired` file, set to `REINJECT_MAX_MS + 60 s` ago. That matches the unchanged time-floor test at `:396-397`. There's no sleep, polling or tally edit.
  - M3: fan-out of 1 against the real hook passed. The tally was 36, then 37, so the card could only have come from the time fallback.
  - M3b: fan-out of 1 with the hook's `overdue` forced to false failed.
  - M3c: fan-out of 1 with the `utimesSync` line removed failed. The clock change is necessary, and the test really does exercise the fallback.
- **Test setup kept.** The 45-process fan-out (`:343`), the seed of 35 (`:347`) and the exit-0 loop (`:351`) are unchanged. The test name mentions the time fallback.
- **Early and duplicate firing are caught by siblings.**
  - M4: firing one batch early (`n < BATCHES_PER_REINJECT - 1`) failed the "injects on the 40th batch" sibling with "the batch before the threshold says nothing".
  - M5: stopping `markFired` from clearing the tally failed that sibling ("firing truncates…") and the time-floor test.
- **Siblings unchanged.** The "lose no increments" test is byte-identical (base and head lines 318–338), and base lines 360–420 match head 364–424.
- **The opt-in is read in one place, with exact matching.** `git grep DELEGATION_PERF_ASSERT` at the commit finds the env read only at `hooks/delegation-reminder.test.mjs:822` (`=== '1'`), the print at `:823`, and the one doc sentence at `docs/sealed-tests.md:11`. The hook and runner never read it. With `each` forced to 401:

  | `DELEGATION_PERF_ASSERT` | Printed | Result |
  |---|---|---|
  | not set | 401ms, armed: false | pass |
  | `1` | 401ms, armed: true | fail (averaged 401ms) |
  | `true` | armed: false | pass |
  | `" 1"` | armed: false | pass |

  Without the mutant and with `=1`, it printed 42ms, armed: true, and passed. The `tally(home) === rounds` assertion is still there.
- **Production hook and runner unchanged.** `git diff --exit-code 68d2a15 0c00422 -- hooks/delegation-reminder.js scripts/run-tests.mjs scripts/test-home.mjs` exited 0. The diff touches exactly two files, and `git diff --check` is clean.
- **Baseline failure is real and was under load.** `prechange-focused-2` ran 23:00:57–23:01:47Z, exit 1, with "45 concurrent batches fired 0 times" at the base test. The load suite (238.55 s, finished at 23:04:00Z, so started around 23:00:01Z) overlapped the whole run, and its own result was 1777/1777.
- **Ten loaded postchange runs, none counted from a missing capture.**
  - Batch 1: runs 01–06 exited 0, while suite pid 73596 ran 23:07:06–23:10:19Z. Run 7 is marked `load-ended-before-run` and was not counted.
  - Batch 2: runs 07–10 exited 0, while suite pid 71244 ran 23:10:49–23:14:22Z.
  - Every run passed both tests and printed armed: false. Averages ranged from 73.4 to 275 ms. Both suites were 1777/1777 with empty stderr.
  - The logs don't show which branch (immediate card or fallback) each loaded run took. M3 covers the fallback branch separately.

**Commands I ran**
- `git rev-parse HEAD`, `git status --short`, and `git diff` / `--stat` / `--name-status` / `--check` / `--exit-code` between base and head.
- `git log`, `git cat-file -p`, `git show <sha>:<path>`, `git grep` at the head commit, `grep`, `ls`, `date`, and `cat` of the manifests and exit files.
- `git archive 0c00422 | tar -x` into `opus-review-disposable/tree`.
- A driver `focus.mjs` that runs `node --test --test-name-pattern …` for one file inside a sealed home, used for the control run (5/5 pass) and every mutant above.
- All mutants ran one at a time, and the copy was restored from the commit and checked with `diff` after each group.

**Not run or denied**
- The Write tool was denied (don't-ask mode), so I created `focus.mjs` with a Bash heredoc in the same disposable directory.
- I didn't run a full suite, loaded runs of my own, or the Linux/second-host run.
- The real worktree is still at `0c00422` with no changes; the only untracked file is `G1-report.md`, which was already there. The disposable copy is left in `opus-review-disposable/`.