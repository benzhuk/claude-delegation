VERDICT: PASS

# triage71 fix round 2

HEAD 6b6365dfef2af9d913f36911572250a5248013c3 (branch build/triage-fetch-first-71-triage71). One commit on top of efb1e7d1.

Applied all four reviewer findings:
- MAJOR 1: repairPushRace now records `git rev-parse origin/<b>` before the rebase and returns it as `base`; knowledge-triage.mjs scans `digestCommitSince(..., repairBase ?? receipt.dotfilesBefore)`. Raced commits from another host no longer count as this run's digest commit. The optional up-front refusal was not applied (reviewer marked it optional; the range fix covers both cases).
- MINOR 2: conflict packet now has `git -C <repo> add -u` before `rebase --continue`; the conflict test's line list includes `add -u`.
- MINOR 3: repairPushRace checks `symbolic-ref --short HEAD` equals the preflight branch, else not attempted.
- MINOR 4: new test, two own commits ahead: no rebase, no push, remote unchanged, reason matches the reviewer's regex.
- New regression test for MAJOR 1 (fakeClaude knobs skipSourceDigest, commitFile, commits). Checked by reverting the range fix on the worktree: the test failed (actual 'success', expected 'attention'); restored, passes.

Gate: `node --test scripts/knowledge-triage.test.mjs scripts/knowledge-publish-sync.test.mjs` gave tests 38, pass 38, fail 0 (log: reports/triage71-gate.log). `node --test skills/multi/scripts/hooks.test.mjs` gave tests 42, pass 42, fail 0. knowledge-gather.mjs unchanged, so its test was not re-run. Worktree clean after commit. Test file is 412 lines.
