VERDICT: APPROVE f0f32e91209101ec3886cbb77c6e7c4cf887defe

# P1 delta re-review: shared goal/bearings hook helper (skills-o, Claude high-tier)

September 25, 2026, 1:44 PM America/New_York. This is a narrow, read-only delta re-review of `C:/Users/benzh/orca/workspaces/claude-delegation/astra-codex-p1` at `f0f32e9`. The prior review tip was `455b3ab`, which had two findings (F1 and F2). The delta since then is one commit, "test(hooks): isolate Codex goal fixtures". It changes only a comment in `hooks/multi-codex-hook.mjs` and the test file. I read git state with `git diff` and `git archive` only. Every run used a scratch export. HEAD is still `f0f32e9` and the status is clean.

## Prior findings

### F1. FIXED: the test fixture now isolates `AGENTS_HOME`, and the ambient-versus-injected pin is present
- `hooks/multi-codex-hook.test.mjs:116-117`: the `'lead'` fixture now injects `AGENTS_HOME: path.join(home, '.agents')` and `continuationDeps: { env: { AGENTS_HOME: … } }`. This matches the proposed patch exactly.
- `hooks/multi-codex-hook.test.mjs:285-298`: the new test "an injected scratch AGENTS_HOME beats an ambient one carrying ws-off" is present, verbatim.
- Spy check, run as before (a filesystem spy preloaded with `--import`, test file run with no scratch env): 13/13 pass and **zero** accesses under the real `C:/Users/benzh/.agents` or `.codex`. At `455b3ab` the same check had logged `ws-off`/`ws-off-goalcard` stats and a `ws/continuation` write. The test therefore no longer reads real switches and no longer writes real continuation state.
- Mutation check on a scratch copy: I changed the adapter to pass `process.env` in place of the injected `env` in `advisoryFn(…)`. The file then fails 12/13, and the failing test is the new one. It therefore discriminates.

### F2. FIXED: the comment no longer overclaims the budget
- `hooks/multi-codex-hook.mjs:139-142` now says the race drops only the goal context when the advisory promise is unresolved or rejected. It also says the card read and the bearings receipt and evidence reads are synchronous, are not preempted, and share the event loop with peer delivery and main's `BUDGET_MS`. The text matches the replacement I proposed.

## Regression hunt on the delta
- **Runtime:** the only runtime-file change is the comment. `goalContextForLead`, `appendGoalContext` and `runCodexHook` logic are unchanged.
- **Focused gate at f0f32e9**, with scratch homes, over the `multi-codex-hook`, `delegation-reminder`, `continuation-native`, `multi-hook-core`, `goal-card` and `bearings-state` tests: **146/146 pass** in 12.8 s. That is the prior 145 plus the new test. The sealed 88/88 is a different subset, which I did not reproduce exactly.
- **Codex stdout, base `7f188b0` against `f0f32e9`**, over the same 378-case grid (every event × lead/unknown/child × peer × continuation × card × source): 348 cases are byte-identical. The other 30 are append-only and occur only on the eligible lead SessionStart/UserPromptSubmit cases. There are 0 unexpected differences, the same as at `455b3ab`.
- **Claude hook:** `delegation-reminder.js` and `hooks/lib/goal-context.mjs` are unchanged since `455b3ab`. My earlier 180-case byte-identity check against the base therefore still applies.

## Limits (carried forward from the prior report, not findings)
- The `withBudget` timer is unref'd. An advisory that hung with no active handle would let the process exit silently. The outer budget had the same property at the base, and the goal path has no handle-less hang today.
- Real startup SessionStart classification remains unverified. Tests pin only the fixture outcomes, and P3 must document this.
- Separate builder worktrees can classify as leads. The contract rules this out of scope.
- **Disclosure from the prior round:** my two spy runs on `base` and `455b3ab` each wrote the fixture-keyed real file `~/.agents/ws/continuation/eb40db8e….json` once. I left it in place. The re-run at `f0f32e9` touched nothing under the real home.

## C4 fields
Cause: a pre-existing lead fixture had no injected `AGENTS_HOME`, so the new goal path and the continuation path fell back to the real home. The new tests also made ambient equal injected, and a code comment claimed the 500 ms race bounded synchronous reads.
Discriminating check: the filesystem spy logged zero real-home accesses at `f0f32e9`, against switch stats and a continuation write at `455b3ab`. The new ambient test fails when the adapter is mutated to pass `process.env`.
Fix location: `hooks/multi-codex-hook.test.mjs:116-117` and `:285-298`, and `hooks/multi-codex-hook.mjs:139-142` (comment only).
Simplification: none needed. The fix is test fixture wiring plus one comment, with no runtime change.
