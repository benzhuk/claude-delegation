# janitor74 state

## Territory
Lane 74 spec items 2, 3, 5 (report part), 6, 7, 8 (janitor side). Worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-janitor-cleanup-74-janitor74, branch build/janitor-cleanup-74-janitor74. Files: scripts/janitor-{roots,owner,archive,sweep,timer-refresh}.mjs (+ janitor-sweep.test, janitor-timer-refresh.test); janitor.mjs edits = wiring only (runSweepIfWanted, sweepPathInUse, record/exit wiring).

## Contracts I rely on
Spec is the contract. Policy file `<home>/.agents/janitor-policy.json` {"act":[class ids],"exclude":[],"excludeRemotes":[],"roots":[{kind,path}]}; absent = report only. Class ids in janitor-sweep CLASS_IDS. Under NODE_TEST_CONTEXT only injected sweepOpts.roots ever sweeps.

## Done
- Round 1: roots, owner/orphan, archive-then-remove, untracked report, policy gate, item 6 script + tests.
- Round 2 (fix commit on top of 75312224): reviewer r1 findings BLOCKER 1, MAJOR 1-5, MINOR 1-5 applied; see reports/janitor74-builder-r2.md. Gate green: 458 tests, 0 fail.
- Round 4 (commit 8bf2f893): item 6 wired into wiring-check --hook, exit-code doc, narrow-refspec sentence; gate green 539 tests, 0 fail (gate list now also includes scripts/wiring-check.test.mjs). See reports/janitor74-builder-r4.md.

## Next (round 3 done: probe gated to acting classes, archived-not-removed row; MAJOR B still needs wiring-check owner)
MAJOR 6 (wire refreshIfRegistered into a SessionStart route) needs a territory ruling: wiring-check.mjs --hook is outside my files. Lead decides. MINOR 5 exit-code change (failed sweep row under --apply returns 1) awaits the lead's yes/no.

## Open questions
1. Widen territory for scripts/wiring-check.mjs (+ its test) or route (b) hooks.json + codex-unsupported row?
2. Keep the exit-1-on-failed-sweep-row change?
3. Rule on the guard-hit workaround (see builder-r2 report).

## How to run my gate
node --test scripts/janitor.test.mjs scripts/install-janitor-timer.test.mjs scripts/reclaim.test.mjs scripts/path-safety.test.mjs scripts/work-record-closeout.test.mjs scripts/test-home.test.mjs agents/agents.test.mjs scripts/janitor-sweep.test.mjs scripts/janitor-timer-refresh.test.mjs > reports/janitor74-gate.log 2>&1
(~5 minutes on Windows.)
