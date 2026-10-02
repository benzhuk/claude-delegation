VERDICT: APPROVE 19401d255026b426049af587ad7ac4bb4017a859

# states73 review, round 2: delta re-review of the suite findings fix

HEAD (git rev-parse HEAD in lane-73): 19401d255026b426049af587ad7ac4bb4017a859
Range: 8da75eab31507962a13f3a17cae9e823b6633086..HEAD. Two commits:
- 6fc9cd94 (lead, docs only: reports, docs/work evidence/record/loop-state).
- 19401d25 (builder): scripts/report-check.test.mjs (+5/-2) and the builder report. That is the only code change in the range.

Blockers: 0. Majors: 0. Minors: 1.

## Prior finding F1 (blocker, N2 env-inheritance guard): FIXED, verified
- scripts/report-check.test.mjs:9 imports makeTempHome from ./test-home.mjs. Line 17 builds one sealed home (`const SEALED = makeTempHome()`). Line 18 (runCli) and line 98 (the no-argument spawnSync) both pass `env: SEALED.env`. Those are the two sites the suite named (old lines 15 and 95).
- The guard test was not touched. `git diff 8da75eab..HEAD -- skills/` is empty, and the only script change is the one test file.
- Run: `node --test scripts/report-check.test.mjs` gives exit 0, 16 pass, 0 fail.
- Run: `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs` gives exit 0, 16 pass, 0 fail. This includes "N2: no test file in this suite inherits the runner environment on its own", the test that failed on Netcup and Hetzner at 6fc9cd94.
- Cleanup: the sealed home is never cleaned up explicitly. makeTempHome registers each directory and removes it with an exit/signal handler (scripts/test-home.mjs:114-116). scripts/prefix-test.test.mjs:35 uses the same pattern, so nothing leaks.
- I did not run a mutation check. The scanner (findEnvLessSpawns, skills/multi/scripts/hooks.test.mjs:605) is not exported, so I could not run it on the base file without writing to the tree. The discriminating evidence is the suite failure at 6fc9cd94: it named exactly these two lines, and this commit changes only them.

## Prior finding F2 (record Workflow line has no maxRounds): answered, claims verified
- accept-prep rewrites any Workflow value that names a run to `<run id> maxRounds=<n>`, replacing a stale bound. It inserts the line when --workflow is given and leaves `none, ...` alone. Code: skills/team-build/references/accept-prep.mjs:250-268, with DEFAULT_MAX_ROUNDS = 3 at :40.
- The build loop passes the bound it actually used. build-loop-workflow.js:476-477 computes `maxRounds` (args.maxRounds, default 3), :1199 passes it to acceptPrepPrompt, and :454 emits `--max-rounds ${maxRoundsUsed}`.
- The check applies only on or after the cutoff. scripts/work-record.mjs:226 sets MAXROUNDS_FROM = 2026-10-02T03:00:00Z, and :247-258 refuses only when Spec-from is on or after that. This record's Spec-from is 2026-10-02T00:50:00Z (docs/work/wr-2026-10-01-report-states.record.md:14), so the check does not apply, as the builder says.
- Why the 03:21:40Z accept-prep run still left `Workflow: wf_1a816e86-f8d` without a bound: that run used the plugin root, the main checkout (reports/accept-prep.md: "cwd = plugin root"). The main checkout does not yet have lane 73's accept-prep change (24291a15). The header picks up the bound once accept-prep runs from a root that contains this lane. That is consistent with the builder's "next time accept-prep runs on it".
- Run: `node --test scripts/work-record.test.mjs skills/team-build/references/accept-prep.test.mjs` gives exit 0, 297 pass, 0 fail.

## Regression hunt
- No new code paths. The test file now imports test-home.mjs, which is already used by other scripts/*.test.mjs, so it adds no new dependency.
- `git diff --stat 7233aa7f..HEAD -- agents/ docs/decisions/` is empty.
- The docs/work changes in this range are the lead's (6fc9cd94), not the builder's.

## Findings

M1 (MINOR): the builder report gives this lane's Spec-from with the wrong value.
- Evidence: reports/states73-fix-r2-suite.md:9 says "This lane's Spec-from per the round 2 note is 02:50Z". The record reads `Spec-from: 2026-10-02T00:50:00Z` (record.md:14). The prior reviewer already flagged the same error in states73-fix-r2.md:15 (states73-review-r2-f1.md:75).
- Impact: none on the conclusion. 00:50Z is also before MAXROUNDS_FROM.
- Fix: in a future report, state 00:50Z. No code change.

## Open question (not a finding; the spec leaves it open)
- The loop's accept-prep command (build-loop-workflow.js:454) does not pass --workflow. A record with no Workflow line at all therefore gets no `<run id> maxRounds=<n>` from the loop, and the lead must write the run id. The builder notes this. A Workflow script may not know its own run id, so the lead should decide whether to close this gap.

## C4 fields
Cause: the two spawnSync sites in scripts/report-check.test.mjs (old :15 runCli and old :95 no-argument call) passed no env key, so their children inherited the runner's whole environment. The N2 guard rejects that.
Discriminating check: on the suite at 6fc9cd94, N2 named exactly old lines 15 and 95. At 19401d25, `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs` gives 16 pass, 0 fail, and report-check.test.mjs gives 16 pass, 0 fail.
Fix location: scripts/report-check.test.mjs:9 (import), :17 (SEALED = makeTempHome()), :18 and :98 (env: SEALED.env).
Simplification: one module-level sealed home shared by both spawn sites, with cleanup left to test-home's registered exit handler. No per-test homes and no guard exemption.

## Not done
- Full suite: not run on Windows, by project rule.
- Mutation check of F1: not done (scanner not exported; see above).
