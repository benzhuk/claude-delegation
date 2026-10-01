VERDICT: APPROVE 8de9e42aa5e05658956e5253a428f3ae9dc38db3

# Seam review, round 1: collect-from-origin-1 (C1 x C2)

Reviewed tree: /home/ben/Code/wt-collect-1, `git rev-parse HEAD` = 8de9e42aa5e05658956e5253a428f3ae9dc38db3
(C2 merge 297d593 at 1468a63, C1 merge 8de9e42 at 4843ef7). Lane base for the diffs: b8f7cef.
Read-only pass. No file in the tree was modified. `git status --short` gave the same result before and after my run.

JUDGMENT: pull-and-push-signals-coexist-without-contradiction: HOLDS

Blockers: 0. Majors: 0. Minor: 1 (non-blocking, patch below). Observations: 3 (not counted).

## Territory disjointness (precondition)

`git show --stat` on each territory commit:
- C1 (d2a6270, 61b6aa6, 0bf8be8, 4843ef7) touches only `docs/census.md`, `scripts/collect-from-origin.mjs` and `scripts/collect-from-origin.test.mjs`.
- C2 (3ff5635, 1468a63) touches only `skills/decisions/SKILL.md`, `skills/decisions/templates/decision-item.md` and `skills/team-build/SKILL.md`.

No file is touched by both territories, and neither territory touches an off-limits file. `git diff --stat b8f7cef HEAD -- scripts/ hooks/ README.md .codex-plugin/` lists only the two collector files.

## Check 1: pull (collector) and push (merge item) coexist. Result: HOLDS

- The pull side is `docs/census.md:352-357`. The collector "is run before any lane dispatch and at every merge tick", and its table goes into the bearings packet. The passage names no actor and says nothing about merge items or the decisions page.
- The push side is `skills/team-build/SKILL.md:256-264`, `skills/decisions/SKILL.md:56-68` and `skills/decisions/templates/decision-item.md:24-27`. The lane lead pushes, then posts its own merge item, then sends its RESULT. `SKILL.md:264` refers to the collector as a backstop that "still finds the branch". Neither doc says the other is unnecessary, replaced or absent.
- The ordering in `team-build/SKILL.md:256-257` (push the accepted record, then post the item) is what lets the collector list the branch as `accepted-unmerged`. `collect-from-origin.mjs:111-113` reads `Status: accepted` from the branch's own blob, so both signals come from the same pushed record.
- The fallback in `decisions/SKILL.md:66-68` (a second exit 3 or any exit 4 leaves the item unposted and the RESULT carries its text) is consistent with this. The branch stays visible to the collector.
- `grep -in "in flight\|collector\|collect-from-origin"` across the three C2 files and census.md: census.md is the only place that defines "in flight", and no C2 text uses the phrase. No contradiction.

## Check 2: record header shape unchanged. Result: VERIFIED ABSENT (no change)

- `git log b8f7cef..HEAD -- docs/work/ scripts/work-record.mjs scripts/four-read.mjs scripts/build-census.mjs` returns only orchestrator commits (5f057a3, 2166a26), and those touch the lane's own record, not a writer or parser. C1 only imports `parseRecord` from `work-record.mjs` (`collect-from-origin.mjs:22`) and never writes a record.
- C2 cites a `Four numbers:` line (`decisions/SKILL.md:61`). That is the label `work-record.mjs` still writes (`:462`, and `:1100` for "not run") and parses (`:148`). The citation is current.
- The "census's lead-turns figure" (`decisions/SKILL.md:59`) is the `leadTurns` defined at `docs/census.md:160-176`. C1's census.md addition is appended at `:345+` and leaves that definition untouched.

## Check 3: no false claim of automatic collector invocation. Result: HOLDS

C2's text never names `collect-from-origin.mjs`, and nothing says it runs as part of `accept` or the accept sequence. The only reference is the backstop sentence at `team-build/SKILL.md:264`. The workflow-driver line at `team-build/SKILL.md:379-380` wires accept, then push, then merge item, then RESULT, with no collector step. That matches spec C2, which wires only the decisions-page post. The one weakness is the unnamed reference itself (M1).

## Check 4: no interaction failure in the full suite. Result: none found (one pre-existing flake)

I ran `node scripts/run-tests.mjs` myself on 8de9e42, with the log written to my scratchpad: 1714 tests, 1708 pass, 3 fail, 3 skipped. The failures:
- `skills/multi/scripts/mirror-shim.test.mjs:269` (V4): known base failure.
- `skills/multi/scripts/note-send.test.mjs:367` (H6): known base failure.
- `skills/decisions/scripts/registered-pickup.contract.test.mjs:98`: not an interaction failure, and pre-existing:
  - Neither territory touches it. `git diff --stat b8f7cef HEAD -- skills/decisions/scripts` is empty.
  - It reads no territory file. It builds fixtures under mkdtemp.
  - It is intermittent. Run on its own 30 times, it failed 3 times.
  - Likely cause: the test sorts on the random mkdtemp repo names with `localeCompare` (`:108`), and that order can disagree with the order the code sorts in.

The integrator's run (integrator-report.md) showed only V4 and H6, and I read the same two named failures in its gate log.

Tests that read territory files, all run on the merged tree (`build-loop-workflow.test.mjs`, `build-census.test.mjs`, `work-record.test.mjs`): 292/292 pass. This includes `build-census.test.mjs:1076`, which reads `docs/census.md`, and `work-record.test.mjs:1815`, which reads `team-build/SKILL.md`. Both territories' files are present together in these runs, and neither breaks the other's assertions.

## Findings

### M1 (MINOR, owner C2): team-build names "the collector" without a path and gives it a false cause

- C2 side: `skills/team-build/SKILL.md:263-264`, "...carries the merge item text verbatim in its RESULT instead, so the collector still finds the branch."
- C1 side: `docs/census.md:346-357`, which defines the collector and is the only doc that names it.

A reader of team-build alone cannot tell which collector is meant. The "so" also implies that the RESULT text is what makes the collector find the branch. The actual cause is the pushed accepted record, which `collect-from-origin.mjs` reads through `changedRecordPaths` and `buildRow`. Nothing breaks when team-build is run on its own, so this is non-blocking.

Patch, to apply verbatim in `skills/team-build/SKILL.md`. Current line 264:
```
verbatim in its RESULT instead, so the collector still finds the branch.
```
Replacement:
```
verbatim in its RESULT instead; the pushed accepted record still lets
`scripts/collect-from-origin.mjs` (see `docs/census.md`) find the branch.
```
Predicted outcome: `work-record.test.mjs:1815` asserts on the census command strings in the acceptance section, not on this sentence, so it stays green. The reference then resolves to C1's documented CLI, and the cause is the pushed record.

## Observations (not findings; outside the seam or owned by the orchestrator)

- O1: One R4 dogfood row in integrator-report.md shows this lane's own record as `status: rejected, hoursSinceLog: -0.15`.
  - At tip 2166a26 the record header reads `Status: rejected` (line 4), but its last `Log:` line is `2026-09-26T13:35:00.000Z owned ...` (line 17).
  - That Log line is dated after the commit it sits in (`2026-09-26T09:16:14-04:00`, which is 13:16Z). This explains the negative age.
  - The collector reports honestly what the record says. The inconsistency is in how the orchestrator writes the record: the header was not moved back to `owned`, and the Log line is future-dated. Under census.md's own rule, this lane would not be reported as "in flight" until the header is fixed.
- O2: Because of the registered-pickup flake (about 1 run in 10), the integrator's "no new failing test name vs base" gate will sometimes show a false new failure. A rerun clears it. It has nothing to do with lane six.
- O3: The merge item's `<tip sha>` (`decisions/SKILL.md:57`) and the collector's `tipSha` agree only until the lane pushes again. Nothing in either doc contradicts this. The item is simply a snapshot, and the collector is live.

## What I tried
- I read seam.md, spec.md, contracts.md, both territory diffs, the collector source and the integrator report.
- I ran the full suite once, the flaky test on its own 30 times, and the three test files that read territory files.
- I grepped the territory files for collector, in-flight, `Four numbers:` and leadTurns references.
- I confirmed with `git show --stat` which files each territory commit touches.
