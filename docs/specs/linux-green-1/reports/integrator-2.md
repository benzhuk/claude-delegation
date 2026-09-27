VERDICT: PASS de019ecec82499fe6c09e821f033d272a5998e25

## Run
- Command: `node scripts/run-tests.mjs 2>&1 | tee /home/ben/Code/wt-lg/docs/specs/linux-green-1/reports/integrator-2.log`
- Repo: /home/ben/Code/wt-lg
- HEAD verified via `git rev-parse HEAD`: de019ecec82499fe6c09e821f033d272a5998e25
- Exit code: 0

## Totals (full suite, single run)
- tests: 1778
- pass: 1775
- fail: 0
- cancelled: 0
- skipped: 3
- todo: 0
- duration: 8108.9 ms

(Note: an intermediate "tests 1 / pass 1" TAP summary at log line ~660 is nested output from a test that itself spawns a sealed sub-process `node --test` run — it is part of one parent test case, not a second top-level suite invocation. The final summary at log line 1820 is the aggregate for the whole run.)

## Failing tests
None. Zero failures on Linux — gate met.

## hooks/delegation-reminder.test.mjs (known flake check)
Not triggered — the file's tests all passed in this single run (no rerun needed):
- `SessionStart injects the card, on every source` — log:165 — PASS
- `MAJOR 3: every agent_type gets the card at its own batch threshold, and only builder/reviewer/integrator get the report line` — log:174 — PASS
- `MAJOR 2: concurrent PostToolBatch hooks lose no increments beyond what the design accepts` — log:176 — PASS
- `MAJOR 2: concurrent PostToolBatch hooks past the threshold DO fire (round 1 fired zero times)` — log:177 — PASS
No second (isolated) run of this file was needed since it did not fail.

## Skipped tests (3, all intentional/platform-conditional, not failures)
1. `round-1: run FROM a linked worktree reached via a lowercased path, it still never appears in SAFE (case-insensitive fs)` — skipped: Linux filesystems are case-sensitive, so a lowercased path would not resolve to the same worktree.
2. `round-2 MINOR: when git deregisters a worktree but an empty directory shell survives (Windows), the log says removed, not survived` — skipped: reproduces a Windows-only failure shape (RemoveDirectory semantics).
3. `timeout terminates the exact owned descendant tree` — skipped (marked `# SKIP` in source).

## Log
Full output: /home/ben/Code/wt-lg/docs/specs/linux-green-1/reports/integrator-2.log
