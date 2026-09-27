VERDICT: APPROVE 9b697ff974f2556baa9a62692db9fb95d8f69754

# F2 review, round 4 (delta re-review of F2-review-round3.md)

Worktree: /home/ben/Code/wt-measure-truth-1-F2, branch build/measure-truth-1-F2. I confirmed the sha myself with `git rev-parse HEAD`: 9b697ff974f2556baa9a62692db9fb95d8f69754. `git status --short` is empty, so the tree is clean.
Range: 26b0177..9b697ff, one commit. It touches only `scripts/four-read.mjs` (all inside `buildAgentSpans`) and `scripts/four-read.test.mjs`, 36 insertions and 20 deletions in total. Both files are in F2's territory (contracts.md R9).
Work id: wr-measure-truth-1-F2.

Counts: 0 BLOCKER, 0 MAJOR, 0 MINOR, 1 NIT. The NIT is optional and does not block.

## 1. Are the three MINORs fixed as prescribed, and did nothing else change?
- **MINOR-1: fixed, verbatim.**
  - `earliestAgentMsInDir` has been deleted. Its old lines were four-read.mjs:208-219.
  - The earliest-agent `continue` has been removed from the no-runId loop (four-read.mjs:244-248).
  - The block comment has been rewritten (four-read.mjs:235-241).
  - The new parallel-launch test (four-read.test.mjs:641-661) matches round 3's patch character for character.
  - `grep earliestAgentMsInDir` finds no remaining references.
- **MINOR-2: fixed, verbatim.**
  - The loop over both readdir orders is at four-read.test.mjs:627-633.
  - `const spans` is kept, because the `computeWorkLostOrStalled` assertion below it still uses it.
- **MINOR-3: fixed, verbatim.** The decoy `agent-y` now ends at +120 (four-read.test.mjs:862). That is the second occurrence, inside `writeJsonl(runY, ...)`, as the patch specified.
- **Nothing else changed.** Every hunk in the diff maps to one of the three patches. There were no edits to docs/census.md or fixtures, and none outside F2's territory.

### Mutation checks
I ran each check on its own `git archive HEAD` copy in the scratchpad. The reviewed tree was not touched.

| Mutant | What I changed | Result |
|---|---|---|
| m1 | Swapped in the 26b0177 `four-read.mjs`, which restores the earliest-agent candidate test | 93 pass / 1 fail. Only the new MINOR-1 test fails. |
| m2 | Put the first-match `if (last !== null) { agentsLastMs = last; break; }` back | 93 pass / 1 fail. Only the MINOR-C test fails. |
| m3 | Disabled the runId branch (`if (false) {`) | 93 pass / 1 fail. Only the MINOR-E-b test fails. |

Each fix is now pinned by the test that claims to pin it. m3 also shows that E-b now does real work. The MAJOR-B test no longer catches the disabled runId branch: after MINOR-1, the heuristic path also splits a relaunch by first timestamp, so E-b is now the only test pinning that branch. That is the correct place for it.

## 2. Regression hunt: can MINOR-1's removal attach a file to the wrong span, or double count it?
I ran probes against the HEAD module and the 26b0177 module. Each probe used a real temporary fs tree in the scratchpad. The table shows union spans in minutes.

| Probe | HEAD raw spans, then union | 26b0177 union |
|---|---|---|
| mixedA: launch A has runId wf_a; launch B has no runId, 2.4 s later; A's staged agent a2 starts at +1 min and runs to +120 | raw `[[0,120],[0.04,120]]`, union `[[0,120]]` | `[[0,120]]` |
| relaunch without runId into the same dir, with a lead stall from +10 to +100 | `[[0,10],[100,150]]` | `[[0,10],[100,160]]`, the round-3 regression |
| noRunThenRun: launch without runId at 0, then a runId launch at +50 | `[[0,5],[50,90]]` | same |
| sameMs: two no-runId launches at the same ms | raw `[[0,60],[0,60]]`, union `[[0,60]]` | same |

- **Attachment to the wrong span can happen, but it is harmless.** In mixedA, no-runId launch B claims A's file a2, because a2's first timestamp falls in `[B, next Workflow)`.
  - B's span is still contained in A's own runId span. Proof: B claims a file from a runId run only when `B.ms <= first < nextWorkflowAfterB`. If that run's launch A is before B, then A's same-run bound `nextSameRunLaunchMs(A)` is a Workflow later than A. Either it is later than B, and so at or after `nextWorkflowAfterB` and above `first`, or it is at or before B, and so at or before `first`. In the first case A claims the file too, with `A.ms < B.ms`, so B's span sits inside A's. In the second case the later same-run launch is the latest launch before `first`, it also claims the file, and it starts at or before B.ms.
  - The one case with no containment is a file whose first timestamp is before its own run's launch. Round 3 measured this on real data (31 of 31 launches) and found no such file. Even then the file lands on the latest launch before it starts, which is the rule the fix intended.
- **Double counting cannot happen.** The only consumer of `buildAgentSpans` is four-read.mjs:636, and it passes the spans straight into `mergeSpans`. Both N and waiting-on-agents are computed from that union through `splitGapByUnion`.
  - Two spans claiming the same file (sameMs, mixedA) therefore collapse into one union interval.
  - R7 agent stalls are scanned per file through `subagentEndBound`. That path does not depend on span attribution, so a file cannot be counted twice there either.
  - The no-runId windows `[t.ms, next Workflow of any kind)` are disjoint between distinct launch times. A file on the boundary `first == next.ms` goes to the later launch only, because the window is half-open.
- **Parallel launches** (the round-3 probe) are now correct, and the new test pins them.
- **Performance**: each no-runId Workflow now scans every run dir. Before, it also scanned every run dir, to find each one's earliest file. Real transcripts always carry runId, so this path only runs on the trimmed fixtures. No concern.

## 3. Gate, re-run by me
`/tmp` is healthy again: `df -i /tmp` shows 48% of inodes used.
`node --test scripts/four-read.test.mjs` in the worktree gave `tests 94, pass 94, fail 0, cancelled 0, skipped 0`.

## 4. The CLI end to end on both committed fixtures
I made a fresh scratch dir with `mktemp -d`: `.../scratchpad/f2r4rev-TEAs`. Then I ran `build-census.mjs --lead scripts/fixtures/four-read/sessions/laneNN/<id>.jsonl --json <scratch>/laneNN-census.json --out <scratch>/laneNN-census.md`, which exited 0, followed by `four-read.mjs --record scripts/fixtures/four-read/record-laneNN.md --census <scratch>/laneNN-census.json`.
`--json` takes a path argument. With no value, build-census exits 1 with "--json needs a value".

- lane10: `| Work lost or stalled | 1 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); agent a314563636ff6b931 silent 216.8 min from 2026-09-26T22:44:29.665Z; ASKs unavailable (no --lead-slug) |`
- lane16: `| Work lost or stalled | 0 gap(s) over 30min stalled; 1 waiting-on-agents (41.8 min); ASKs unavailable (no --lead-slug) |`

Both lines match contracts.md R7 Fixtures. lane10 has exactly one stall, agent a314563636ff6b931, at 216.8 min. lane16 has 0 stalled and 1 waiting-on-agents of 41.8 min. The leading token is still a plain integer, which keeps the F1/F2 contract in R9. The lines are byte-identical to the ones round 3 quoted.

## Findings

### NIT-1 (optional, does not block): the header comment on `buildAgentSpans` still describes the removed earliest-agent rule
- **Evidence**: four-read.mjs:166-169 still says the no-runId run is matched "by the run whose earliest agent timestamp falls in [this Workflow's tool_use, the next Workflow tool_use)". MINOR-1 removed exactly that rule. The inner comment at :235-241 is correct. Round 3's patch named only the inner comment, so the builder followed the patch exactly.
- **Patch**:
  - Current, four-read.mjs:167-169:
    ```js
    //     lead's own tool_result's `toolUseResult.runId` (real transcripts), or — for the
    //     trimmed fixtures, which carry neither field — by the run whose earliest agent
    //     timestamp falls in [this Workflow's tool_use, the next Workflow tool_use).
    ```
  - Replacement:
    ```js
    //     lead's own tool_result's `toolUseResult.runId` (real transcripts), or — for the
    //     trimmed fixtures, which carry neither field — by every agent file, in any run
    //     directory, whose first timestamp falls in [this Workflow's tool_use, the next Workflow tool_use).
    ```
- **Predicted outcome**: the change is to a comment only, so the gate stays at 94/94.

## Process notes (not code findings)
- On disk, `docs/specs/measure-truth-1/reports/F2-gate.log` is still the second run the builder's ENOSPC failure corrupted (it ends in `ENOSPC ... mkdtemp`). That log is not evidence for 9b697ff. The clean run in section 3 is.
- F2-builder-round4.md's first line reads `VERDICT: BLOCKED 26b0177...`, because it was written before the lead's commit. The code it describes is exactly what 9b697ff contains. I checked this against the diff.

## C4 fields
Cause: round 2's MAJOR-B recipe kept an earliest-agent candidate test on the no-runId heuristic, so a parallel launch orphaned a run's staged agents. Separately, the MINOR-C and MINOR-E-b tests could pass against the mutations they were meant to catch.
Discriminating check: on a scratch copy, three mutants each fail exactly one test, the one that claims to pin the fix: m1 (the 26b0177 module), m2 (the first-match `break` put back) and m3 (the runId branch disabled). The HEAD module gives union `[[0,120]]` on the parallel probe and `[[0,10],[100,150]]` on the no-runId relaunch.
Fix location: scripts/four-read.mjs:235-248, the no-runId branch of `buildAgentSpans`, with `earliestAgentMsInDir` deleted. scripts/four-read.test.mjs:627-633, :641-661 and :862.
Simplification: on the no-runId path, each agent file belongs to the latest Workflow launched at or before its first timestamp. There is no run-dir matching and no dependence on readdir order.

Scratch, outside every repo: /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/f2r4rev-TEAs/. It holds the census JSON and md for both lanes, three mutant trees (m1, m2, m3), the HEAD copy, probe.mjs and the probe trees. Nothing in the worktree was modified.
