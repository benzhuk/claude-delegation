VERDICT: APPROVE cdf580f49249fe4a69b08007bcdabfcf29edda91

# loop67 review, round 2 (delta re-review)

- **Reviewed sha:** cdf580f49249fe4a69b08007bcdabfcf29edda91, from `git rev-parse HEAD` run by me in `.claude/worktrees/wt-build-loop-fed-67-loop67`.
- **Delta:** `dcc9582e..HEAD` is one commit (cdf580f4). It touches 4 files, +83/-18, all inside the territory list.
- **Full range:** `677c4a90..HEAD` still changes only the same 11 territory files as in round 1.
- **Worktree:** `git status --short` was empty before and after my runs.
- **Trial edits:** made only on a `git archive` copy at `scratchpad/lane-67/review-r2/tree/`, and restored byte-for-byte (checked with `cmp`).
- **Counts:** 0 BLOCKER, 0 MAJOR, 1 MINOR (new).

## Gates (run by me)
- **Territory gate:** `node --test build-loop-workflow.test.mjs accept-prep.test.mjs work-record.test.mjs work-census.test.mjs` gives tests 434, pass 434, fail 0. Log: `scratchpad/lane-67/review-r2/review-gate.log`.
- **Dependent files:** `agents/agents.test.mjs` and `scripts/mirror-shared-skills.test.mjs` give tests 68, pass 64, fail 0, with the rest skipped. Log: `review-dependents.log`.
- **Pinned checks still hold:**
  - L-C4.3: grepping the script for `isolation|import|require(|Date.now` finds 0 hits.
  - The delta adds no agent() opts, so the four pinned pairs and the flat const shape are unchanged.
  - The prompts test (every prompt carries `Never send peer notes.`) passes.

## Prior findings, each verified

- **MAJOR-1: FIXED.**
  - SKILL.md:458-462 now carries the round-1 patch text verbatim: committed only after `accept` succeeds, before the push and merge, because a commit moves HEAD off `Artifact:` and `accept` refuses.
  - The quoted refusal text matches the real message at scripts/work-record.mjs:1413, `Artifact ${artifact} does not match delivery ${delivery}`.
  - The false census-stale / Spec-from reason is gone.
  - The pin at work-record.test.mjs:4018 (`moves HEAD off \`Artifact:\``) is added, and the gate is green.
- **MINOR-1: FIXED.** The new test at build-loop-workflow.test.mjs:2222 runs the seam again when the recorded integrateHead differs. With the mutation `sameSha(priorSeam.integrateHead, integrate.headSha)` -> `true` (js:1030) on the scratch copy, exactly this test fails (1 of 18 "item 3" tests).
- **MINOR-2: FIXED.**
  - The assertion is now `< 4` (test:2051).
  - Removing `if (stateFlight) return stateFlight` (js:620) on the scratch copy fails exactly the coalescing test.
  - SKILL.md:419-421 and the comment at js:606-612 now state the real cost (about one write per territory per phase when territories finish apart).
- **MINOR-3: FIXED in code, but the new doc sentence overclaims (see MINOR-A below).**
  - js:878, 904, 925 and 951 are now `void flushState(...)`.
  - Changing them back to `await` on the scratch copy fails the new test "a territory never waits on its own state write" (test:2055) and the coalescing test.
  - Floating promises are safe: flushState's inner async body catches every error (js:621-634), so a `void` call cannot raise an unhandled rejection.
  - The final territory rows still reach the file, because the Integrate flush (js:1013) is awaited, joins any write in flight and loops while `stateDirty` is set.
- **MINOR-4: FIXED.** At js:225, deadlineLine now says that for a reviewer the BLOCKED/timeout rule overrides the APPROVE/NEEDS_FIXES first-line rule.
- **MINOR-5: FIXED (doc route).** SKILL.md:430-434 describes the mid-seam-fix relaunch failing closed as `review-sha-mismatch`, and the integrator re-run that recovers it. The text is accurate against js:1020-1030 and the seam stage.
- **MINOR-6: FIXED.** The comment at js:400-405 cites wr-2026-09-27-measure-truth.record.md:19 and says the cause is inferred. The report adopts the 40/84 count.

## New finding

### MINOR-A: SKILL.md says a hung state runner "cannot stall the build", but it stalls the build at Integrate
- **Where:** skills/team-build/SKILL.md:422-423, "A territory never waits on its own write, so a hung state runner cannot stall the build."
- **Shown by:** I appended a probe test to the scratch copy of the test file (the worktree was not touched):
  - The stub makes `state:Build` a promise that never resolves.
  - The run is raced against a 1.5 s timer. The outcome is `hung`, and the agent labels called are `["build:T1:r1","review:T1:r1","integrate"]`.
  - So the territory goes on as intended, but the run then blocks forever in `await flushState('Integrate')` (js:1013). That call joins the hung flight, so `accept-prep` never runs and the run returns nothing.
  - The scratch test file was restored and `cmp` confirmed it.
- **Why it matters:** the code comment at js:610-612 is accurate ("never stalls the territories; the Integrate, Seam and Accept flushes are awaited and join any write still in flight"). The SKILL.md sentence is the one a lead reads when a run goes quiet, and it rules out the real cause.
- **Why MINOR:** behaviour is strictly better than round 1, where the stall came at the first territory write. The prompt deadline line also applies to the state runner. Only the doc clause is wrong.
- **Fix (mechanical patch), SKILL.md:422-423.**
  Current:
  ```
  finish apart), and reads it once at launch. A territory never waits on its own write, so a
  hung state runner cannot stall the build. A state with `version` 1 and the same `baseSha` and `specPath` resumes: a
  ```
  Replacement:
  ```
  finish apart), and reads it once at launch. A territory never waits on its own write, so a
  hung state runner cannot stall Build, Review or Fix; the Integrate, Seam and Accept steps
  wait for any write still in flight, so a state runner that never returns stalls the run
  there. A state with `version` 1 and the same `baseSha` and `specPath` resumes: a
  ```
- **Predicted outcome:** no test pins this sentence (I searched the gate files for "cannot stall" and found no assertion), so the gate stays at 434/434.
- **Code alternative (lead's choice, not required):** race the Integrate-time join against nothing. That needs a timer, and the script bans timers, so the doc route is the only route that needs no new mechanism.

## Regression hunt in the delta (verified absences)
- **No lost state.**
  - flushState renders the snapshot when each write starts and loops while dirty.
  - The `stateFlight = null` reset at js:633 runs synchronously after the dirty check, so no request can slip between the check and the reset.
  - The awaited Integrate, Seam and Accept flushes therefore always write the latest rows.
- **No unhandled rejection:** the `void` calls return a promise whose body catches everything.
- **No ordering dependency:** the new test uses a 300 ms safety timer that it clears. With `await` restored, the test fails at about 315 ms because `reviewStartedWhilePending` is false. It does not hang.
- **No change outside the territory.** The Codex paragraph and the pinned census paragraph are untouched; the delta's SKILL.md hunks are at :416-434 and :456-462 only.

## Bug-fix fields
Cause: the round-1 SKILL.md accept-turn sentence gave a false reason (census-stale / Spec-from) for the record-commit timing, and the territory awaited every state write.
Discriminating check: the work-record.test.mjs:4018 pin on `moves HEAD off \`Artifact:\``, plus test:2055, which fails when `void` is changed back to `await` (checked on a scratch copy).
Fix location: skills/team-build/SKILL.md:458-462 and skills/team-build/references/build-loop-workflow.js:878, 904, 925 and 951.
Simplification: none needed; the delta is +83/-18 and adds no new mechanism.

## Open questions carried from round 1 (the lead's to rule; not findings)
- Should the second-host suite run after `accept-prep-failed`?
- Should a Windows alias be reported when acceptance skipped?
- `namesTimeout` matches any note containing timeout.
- A resumed rounds-exhausted territory gets fresh rounds.
- A relaunch after Accept runs accept-prep again.
- The state path is relative when `integrationWorktree` is absent.
