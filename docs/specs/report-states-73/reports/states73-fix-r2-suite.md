VERDICT: PASS

Fix round 2 (suite findings at 6fc9cd94), territory states73.

F1 fixed: scripts/report-check.test.mjs now builds one sealed home with makeTempHome (scripts/test-home.mjs) and passes its env to both spawnSync calls (runCli and the no-argument call). Guard test not touched. Gate (focused): report-check.test.mjs 16 pass, 0 fail; the N2 tests in skills/multi/scripts/hooks.test.mjs 16 pass, 0 fail (the offender list is empty).

F2 answered, no code change, no hand-edit of the record:
- accept-prep writes `<run id> maxRounds=<n>` on every accept-prep run, not only new runs: it rewrites any existing run-id Workflow value (replacing a stale bound) and adds the line when --workflow is given. It leaves `none, <reason>` and an absent line (with no --workflow) alone. The build loop passes --max-rounds <bound used> in its accept-prep command, so a loop-driven record ends as `wf_12ff9796-d81 maxRounds=2` style.
- The check (workflow-maxrounds-missing) is meant to apply only when Spec-from is on or after MAXROUNDS_FROM (2026-10-02T03:00:00Z). This lane's Spec-from per the round 2 note is 02:50Z, before the cutoff, so the check does not apply to it and nothing refuses it; its header gets the bound the next time accept-prep runs on it.
- Gap noted, not changed: the loop's accept-prep command does not pass --workflow, so a record with no Workflow line at all still gets none from the loop; the lead writes the run id into the record.
