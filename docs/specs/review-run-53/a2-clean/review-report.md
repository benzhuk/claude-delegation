VERDICT: NEEDS_FIXES (3) 90beeb9b61ec83a1af6dd4adc18419c4872ef5ce

# Lane 49 delta review: d6e4117 → 90beeb9 (wr-2026-09-28-codex-followups)

- Inspected SHA: 90beeb9b61ec83a1af6dd4adc18419c4872ef5ce (HEAD of the review worktree, checked with `git rev-parse HEAD`)
- Prior approved artifact: d6e411764846d8a02b82e3c0671f13ccd19a5951. Base: 9c816fdd8ef906388c74d69263bb6b9935dc9221
- Reviewer: Claude Opus 5.5 (`claude-opus-5-5`). This is an independent reviewer subagent spawned for session a4480c92-4216-4d71-aab1-71444bf3fa67, which is the spawning lead's id and not a reviewer id. The lead must record the agentId that the Agent tool returned for this reviewer.
- Delta content: 46228f3 changed only `hooks/codex-unsupported.test.mjs` (+9/−3) and the L49 test report. 90beeb9, d2f443b, c0b9ffa, 93ba826 and 782ed16 changed only docs. The delta made no production change.

## Findings

### F1: MAJOR. The delta removed the only real-route evidence for PostToolUse and Stop, so a production mutant that drops either route now survives

Evidence (verified directly):
- `hooks/codex-unsupported.test.mjs:223-225` now passes `nativeRouteForLead: deterministicBacklogRoute` for UserPromptSubmit, PostToolUse and Stop. Before this change, the loop called production `nativeRouteForLead`, which spawned the real `hooks/backlog-notice.js`.
- Every real-route test that remains is UserPromptSubmit only: the CLI test at :233, the two-session test at :351-ff and the silence test at :380-ff. SessionStart is still real at :216. Nothing else runs production `nativeRouteForLead` for PostToolUse or Stop.
- I applied in-memory mutants to production `hooks/multi-codex-hook.mjs:132` through an ESM load hook, with no file written. Each mutant has an anchor check, and a mutant that fails to apply throws. Results:
  - M1 `if (event === 'Stop') return null;`: the candidate test goes 12/12 green, so the mutant **survives**. The d6e4117 test fails with `Stop must render actual backlog output`.
  - M3 `if (event === 'PostToolUse') return null;`: the candidate test goes 12/12 green, so the mutant **survives**. The d6e4117 test fails with `PostToolUse must render actual backlog output`.
  - M4, which drops the SessionStart route: the candidate test fails 2 tests, so the SessionStart route is still guarded.
- This breaks the brief's requirement to "keep actual behavioral route evidence". The parity validator only checks that `NATIVE_ROUTES` declares Stop and PostToolUse. It cannot tell whether production actually routes them. The author's red-mutant receipt (L49-test-report.md:33) mutated the **injected test fixture**, not production, so it only proves that the test asserts its own fixture. The check is circular.

Fix: keep the injected composition loop, which is a legitimate test of composition. Add one test that calls production `nativeRouteForLead` for PostToolUse and Stop. It has the same shape and the same load exposure as the retained two-session test, and it adds no production change. Insert it after the `nativeRouteForLead consumes the production NATIVE_ROUTES declaration` test, which ends at `hooks/codex-unsupported.test.mjs:350`:

```js
test('production nativeRouteForLead routes PostToolUse and Stop through the real backlog child, with Stop in additionalContext', async (t) => {
  for (const event of ['PostToolUse', 'Stop']) {
    const root = scratch(`codex-parity-real-${event}-`); const home = scratch(`codex-parity-real-${event}-home-`);
    rmLater(t, root); rmLater(t, home); runnableRecord(root);
    const result = await nativeRouteForLead(
      { hook_event_name: event, session_id: LEAD, cwd: root }, root, 'unknown',
      childEnv(home, { AGENTS_HOME: path.join(home, '.agents'), CLAUDE_PLUGIN_ROOT: REPO }),
    );
    assert.match(result?.text ?? '', /work: 1 runnable and unowned \(wr-2026-09-28-parity\)/, `${event} must reach the real backlog child through production routing`);
    if (event === 'Stop') assert.equal(result.systemMessage, result.text, 'Stop must carry the human line into additionalContext too');
  }
});
```

Measured outcome of this exact patch, injected in memory into the candidate test on Linux with Node v24.18.1:
- Unmutated production: 13/13 pass, and the new test takes 102.9ms.
- M1 fails with `Stop must reach the real backlog child through production routing`.
- M2 (see F3) fails on the same assertion.
- M3 fails with `PostToolUse must reach the real backlog child through production routing`.
- Every other test stays green.
- It leaves 0 temp entries.

### F2: MINOR. The new test comment and the test report overstate the retained coverage

`hooks/codex-unsupported.test.mjs:221-222` says "Actual child routing remains covered by the default-CLI and two-session route tests below". L49-test-report.md:31 makes the same claim. Both named tests are UserPromptSubmit only, and F1's M1 and M3 show that PostToolUse and Stop child routing are not covered. Patch this after F1 lands.

Current:
```js
  // so all three event shapes are deterministic under a loaded host. Actual child routing remains
  // covered by the default-CLI and two-session route tests below.
```
Replacement:
```js
  // so all three event shapes are deterministic under a loaded host. Actual child routing remains
  // covered by the default-CLI and two-session tests (UserPromptSubmit) and the production
  // nativeRouteForLead PostToolUse/Stop test below.
```
Also correct L49-test-report.md:31 and :33. The Stop mutant it cites is a mutant of the fixture, not of production. The author owns that report.

### F3: MINOR, pre-existing and not a regression. Nothing tests that the Stop line reaches additionalContext

`hooks/multi-codex-hook.mjs:134-136` exists so that a Codex autonomous lead receives the Stop backlog cue in `additionalContext`, not only in `systemMessage`. Mutant M2 changes line 136 to `const text = output?.hookSpecificOutput?.additionalContext ?? null;`. It survives both the candidate test and the d6e4117 test (12/12 each), because the composition assertion at :226 checks the concatenation of context, systemMessage and reason, and `systemMessage` alone satisfies it. F1's patch closes this gap with its `result.text` plus `systemMessage === text` assertion. I measured that M2 fails under that patch. No separate change is needed.

## C4 fields

Cause: the merge-gate failure (L49-merge-gate-r1.md, Windows sealed suite, where the Stop line was absent but peer and continuation context were present) was attributed to load pushing the real backlog child past the 400ms route budget. The record itself says this is "without proving it instrumentally". I found no cause specific to Stop in the code: `backlog-notice.js` main and `cheapExit` have no Stop-only gate, each event uses its own AGENTS_HOME and therefore its own sentinel, and `appendGoalContext` does not treat Stop differently. So load is plausible but unproven. If load is the cause, it applies just as much to the retained real-route checks: SessionStart at :216 in the same test, the CLI test, the two-session test and the silence test. The correction therefore removes one symptom, not the cause. It also removed evidence (F1).

Discriminating check: production mutant M1 (`multi-codex-hook.mjs:132`, Stop returns null) passes the candidate test 12/12 and fails the d6e4117 test. Applying F1's patch makes M1, M2 and M3 fail and leaves the unmutated tree green at 13/13.

Fix location: `hooks/codex-unsupported.test.mjs` only. Add the F1 test after :350 and apply the F2 comment patch at :221-222. Production budgets and code stay unchanged.

Simplification: keep the single injected composition loop. Real routing then rests on one small direct `nativeRouteForLead` test per event pair, with no new seam, no wider timeout and no production change.

## Attack-surface answers

1. **Timing.** Verified directly: the delta leaves the child-reaping test (:282) and the never-resolving outer-route test (:317) unchanged, both still asserting `< 2000ms`. `ROUTE_TIMEOUT_MS = 400` and the outer `ROUTE_TIMEOUT_MS + 50` (`multi-codex-hook.mjs:76, 228, 232`) are unchanged since base. The ready advisory and peer context assertions remain. The delta widened no allowance. In the focused run on my host the tests took 887.7ms and 452.2ms. I did not rerun the 5000ms mutants, which are unchanged since d6e4117. Their fail receipts are attributed to the prior builder and test reports and the r2 Opus approval.
2. **Parity.** Verified directly: `NATIVE_ROUTES` is consumed by production (`multi-codex-hook.mjs:124-126`), and the declaration-mutation test at :336 is still present. Pair identity is script/event (`key()` at :32), and Interrupt is the only allowance, at :181. The delta did not change the fake-event and orphan validators. Regression found: behavioral route evidence for PostToolUse and Stop was removed (F1).
3. **Timer premise.** Verified directly: `sentinelPathFor` is `<home>/ws/backlog-notice.<session_id || 'unknown'>` (`backlog-notice.js:101-102`), and the two-session test (:351-ff) is unchanged, asserting both exact sentinels and a suppressed repeat. `hooks/hooks.json`, `codex-hooks.json`, `codex-unsupported.json`, `backlog-notice.js`, `multi-inbox.js`, `multi-hook-core.mjs` and `scripts/wiring-check.mjs` are byte-identical to base, with an empty `git diff` against 9c816fd. `hooks/lib/goal-context.mjs` differs from base only through the origin/main merge (repo-env-everywhere, f7df941). Against f7df941 the lane changes nothing outside docs except `codex/README.md`, `hooks/codex-unsupported.test.mjs` and `hooks/multi-codex-hook.mjs`. The docs sentences in `codex/README.md:64-65` and `docs/census.md:219` state the `unknown` fallback limit and claim no per-session guarantee for missing ids.
4. **Scope and simplicity.** Verified directly: from d6e4117 to HEAD the only non-docs change is the test file. The delta touches no transport, janitor, renderer, install or production code. `git diff d7a9eb4 HEAD` shows no change to exported signatures, so the contract stub is intact.

## Verified directly versus attributed

- Verified directly:
  - The focused file `node --test hooks/codex-unsupported.test.mjs` was run once on the candidate with a sealed HOME, TMPDIR and AGENTS_HOME under scratch: 12/12 pass in 2010.9ms.
  - Mutants M1 to M4 and the F1 patch, all in memory, with no file written to the tree.
  - The scope and byte-identity diffs.
  - The code reading.
- Attributed to the author and the record, not verified: the Windows 25/25 scoped greens (r4), the Windows merge-gate failure counts (2703 pass, 1 fail, 14 skip), the SHA256 values, the 5000ms timing-mutant receipts and the Stop-fixture mutant receipt. Those raw files are on C:\ paths that this host cannot reach.

I made no write to the reviewed tree. The scratch temp dir was empty after the runs.
