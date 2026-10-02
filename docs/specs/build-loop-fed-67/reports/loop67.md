VERDICT: PASS

# loop67 report (lane 67, build-loop-fed)

Serves GOAL: "work lost or stalled" (hung agent, resume) and "rework after acceptance" (Workflow: required, accept-prep failure named). Nearest NOT: "a rule no script checks" respected: every rule below has a test.

Worktree `.claude/worktrees/wt-build-loop-fed-67-loop67`, branch `build/build-loop-fed-67-loop67`. Commits: 9da53427, d64522ef, 24f5244e, f2be6fba, and the final docs commit (HEAD dcc9582ea41ac308f76a7a6e307d5fda4f0fcf1a). Nothing pushed.

## Scope items (all done)
1. One route: DONE. SKILL.md:350-356 (by-hand single-territory sentence removed, "ONE way"); FIELD_LABELS `workflow`/`measure` scripts/work-record.mjs:93, OPTIONAL_FIELDS :40; `WORKFLOW_FROM` :170; `checkWorkflowField` :178 wired in checkAcceptance :1269 (`opts.workflowFrom`); SKILL.md Setup step 7 :74-83; docs/work-record.md:50-51, :92-110; census `workflow` per row scripts/work-census.mjs:118, table :160-163. Tests: work-record.test.mjs:429,440,444,455,465,471,4002,4022; work-census.test.mjs:312.
2. Hung agent: DONE. `deadlineLine()` build-loop-workflow.js:224 in every prompt; `agentMinutes` :478-479 (default 45, invalid falls back); `agent-timeout` via `buildBlockerFor` :788, `reviewBlocked` :818, seam :1056/:1106, integrator :1291; SKILL.md blockers list :350+, :409 (Hung agents). Tests: build-loop test file :1840-1970.
3. Loop-state file: DONE. `loopStatePath` :568, `flushState` :611, read `state:read` :635, `resumeFromState` :796, integrator skip, seam skip `priorSeamUsable` :1020, Setup reuse; SKILL.md:418 (Loop state and resume). Tests :1978-2244.
4. Defects:
   - (a) DONE, pin only, no code change. Test :2246 (prefix both directions, 6-char refused, different commit refused).
   - (b) DONE. `isAbsolutePath` :274 (leading `/` or `X:/`), `specDirAbsolute` :1157. Tests :2271, :2298 (relative returned paths verify, lower-case drive, accept report path not doubled).
   - (c) DONE. See "Integrator refusal" below. Setup prompt :407-408, integrate prompt :391. Test :2314.
   - (d) DONE. accept-prep.mjs:182-223 inserts `Artifact:` and `Evidence:` when absent; `Status:` still `missing-field`. Tests accept-prep.test.mjs:217,268,285 (existing Status-missing test unchanged).
   - (e) DONE. Parser and strict validator accept `Workflow:`/`Measure:` (work-record.mjs:93; test :429).
   - (f) DONE. SKILL.md:78-83 Setup step 7 `Scratch:` (absolute `<scratch root>/<lead session id>/<lane>/`, required on/after 2026-09-29). Test work-record.test.mjs:4002.
   - (g) DONE, doc only. SKILL.md:451-454 (record and evidence committed only after `accept` succeeds). Test :4002.
   - (h) DONE. `acceptPrepFailed` :1153/:1211, report-path check only when `!acceptPrepFailed` :1225, blocker `{id:'accept-prep',reason:'accept-prep-failed'}` :1292. Tests :2335,:2347,:2355.
5. Second host: DONE. `secondHost`/`secondHostGate` args (:488), last `Second host` phase (:1259), runner label `second-host`, log `<specdir>/reports/second-host.md`, `secondHost` in the return, `windows-host` blocker with nothing spawned (:1257); example JSON lines 6, 16-17; SKILL.md:429. Tests :2369-2458, example test :1699+.
6. Tests: DONE, each new behaviour fails on the base tree. Run of the new build-loop test file against the base script (677c4a90): 41 of 124 fail, 83 pass (the 83 are old tests plus pins/negatives that hold on base: item 4a pin, builder-blocked for a non-timeout note, no state call without recordPath, null read is a fresh run).

## Integrator refusal (4c)
Cause, from the text the base tree sent: the base setup prompt (677c4a90 build-loop-workflow.js:316) told the setup runner to write an integrator brief "plus the seam brief" with no statement of order, and the base integrate prompt carried no word on the seam review, so a runner-written integrator brief that lists the seam review as a gate told the integrator to refuse or wait when the seam review was on. Inferred from the prompts; the refusing brief itself is a generated artifact not in my tree. Fix: setup prompt now carries `seamOrderText` (current :407-408: the brief must say the seam review runs AFTER Integrate, never gates the merge, never refuses/waits) and the integrate prompt says the seam review "comes AFTER you ... never a precondition" (:391).

## Prompt-level limit
The Workflow API has no per-agent time limit and the pinned agent() opts have no timeout key. The deadline is a line in every prompt (build-loop-workflow.js:219-225 comment states it). An agent that ignores its prompt is not stopped by the script. Stubs prove the script's side only; a real run is the lead's.

## Test files run (measured)
- Gate: build-loop-workflow.test.mjs 124, accept-prep.test.mjs 20, work-record.test.mjs 265, work-census.test.mjs 23. Total 432 pass, 0 fail. Log: reports/loop67-gate.log.
- Also run: agents/agents.test.mjs 25 pass (reports/loop67-gate-agents.log), scripts/mirror-shared-skills.test.mjs 39 pass (reports/loop67-gate-mirror.log), because they reference SKILL.md / FIELD_LABELS.

## Deviations and assumptions
- build-loop-args.legacy.example.json not changed (not needed).
- Windows host detection: `/^win/i` or `/windows|ben-desktop/i`.
- Second-host retry: one respawn on a dead runner, then `agent-died`.
- Pinned census paragraph and Codex paragraph in SKILL.md untouched (work-record.test.mjs asserts the census paragraph start).

## Fix round 2 (reviewer r1 findings)

Commit: the sha in the notification (one commit on top of dcc9582e). Gate: 434 tests, 434 pass, 0 fail (build-loop 126, +2 new; work-record +0 tests, one added assertion). Log: reports/loop67-gate.log.

- MAJOR-1 done: SKILL.md accept turn now says the record and evidence are committed only after `accept` succeeds, never between accept-prep and `accept`, and before the push and merge above, because accept-prep pins `Artifact:` and a commit moves HEAD off it, so live check-acceptance and `accept` refuse with `Artifact <sha> does not match delivery <sha>`. The false census-stale / Spec-from reason is gone. Pin extended in scripts/work-record.test.mjs (`moves HEAD off \`Artifact:\``).
- MINOR-1 done: new test "a seam the state records as APPROVE over a DIFFERENT integrator head is stale and the seam runs again" (build-loop-workflow.test.mjs, after the same-head seam test). It kills the `sameSha(priorSeam.integrateHead, ...)` -> `true` mutation.
- MINOR-2 done: coalescing test tightened to `< 4` writes (lockstep stubs give 3 Build+Review writes); with `if (stateFlight) return stateFlight` removed the test fails (checked). SKILL.md "Loop state and resume" reworded: coalesced across territories that finish together, about one per territory per phase when they finish apart.
- MINOR-3 done (code route): runTerritory starts its state writes with `void flushState(...)` (build-loop-workflow.js lines 873, 899, 920, 946); Integrate, Seam, Accept flushes stay awaited and join any write in flight. New test "a territory never waits on its own state write" holds the Build write pending and shows the review starts first; with `await` restored it fails (checked). Comment at the flushState definition and SKILL.md state paragraph say so.
- MINOR-4 done: deadlineLine's parenthetical now adds "for a reviewer this overrides the APPROVE/NEEDS_FIXES first-line rule". Test regex only pins the text up to "and return", still green.
- MINOR-5 done (documentation route, not code): SKILL.md "Loop state and resume" now says a run that dies after a seam-fix commit but before the seam re-review fails closed as `review-sha-mismatch` on a plain resume, and must be relaunched with the integrator re-run (no state file, or the integrator row removed).
- MINOR-6 done: setupPrompt comment now cites docs/work/wr-2026-09-27-measure-truth.record.md:19 for the refusal and says the brief itself is not in the tree and the cause is inferred. The 41/83 versus 40/84 count difference is immaterial; the reviewer's 40 fail / 84 pass is the number to use.

Open questions in the review (second host after a failed accept-prep, Windows alias with acceptance skipped, broad timeout match, resumed rounds-exhausted, accept-prep re-run on relaunch, relative state path) were not findings; left as they are for the lead's ruling.
