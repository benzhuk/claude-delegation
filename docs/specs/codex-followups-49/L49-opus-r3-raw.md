NEEDS_FIXES 90beeb9

Reviewer: lane49-review (Claude Opus 5.5). Delta review in worktree scratchpad/wt-review-49c, detached at 90beeb9b61ec83a1af6dd4adc18419c4872ef5ce. The prior review approved d6e4117.

## What checks out

- `git diff d6e4117..90beeb9 --stat` touches only tests, evidence and the record. The only code file is hooks/codex-unsupported.test.mjs, with 12 changed lines. multi-codex-hook.mjs is unchanged.
- The 400 ms kill, the 450 ms per-promise bound, and both 2 s test bounds are untouched.
- Scoped gate `node --test hooks/multi-codex-hook.test.mjs hooks/codex-unsupported.test.mjs` ran 25 tests. All 25 passed with 0 failures.

## MAJOR: the fix removes the only real-route proof for the Codex Stop backlog

hooks/codex-unsupported.test.mjs:223-225. The loop now injects `deterministicBacklogRoute` for all three events, which is a stub that returns the backlog line itself. Before, the Stop case was the only test that ran the real `nativeRouteForLead` for Stop and checked that the backlog line reached Codex's output. The comment says the default-CLI and two-session tests still cover real routing. Those tests only send UserPromptSubmit, so no remaining test sends a Stop event through the real route.

Mutant run to show it. In hooks/multi-codex-hook.mjs I changed
`const routes = NATIVE_ROUTES[event];` to
`const routes = event === 'Stop' ? null : NATIVE_ROUTES[event];`
so that Codex never shows the backlog on Stop.
- With the d6e4117 test file: 1 fails, "Stop must render actual backlog output".
- With the 90beeb9 test file: 25 of 25 pass. The regression goes undetected.

The lead's brief mentions a "Stop-null mutant" that fails at 90beeb9. That mutant must null the stub, not production. It therefore proves the composition assertion only, not that Stop routing works.

Fix: keep the deterministic composition loop, which is a reasonable fix for the load flake. Also add a real-route Stop test that avoids the 450 ms outer race by calling `nativeRouteForLead` directly. Proposed addition after the two-session test:

```js
test('real native Stop route surfaces backlog text for Codex', async (t) => {
  const root = scratch('codex-parity-stop-route-'); const home = scratch('codex-parity-stop-route-home-');
  rmLater(t, root); rmLater(t, home); runnableRecord(root);
  const env = childEnv(home, { AGENTS_HOME: path.join(home, '.agents'), NOTE_SLUG: 'lead', CLAUDE_PLUGIN_ROOT: REPO });
  const result = await nativeRouteForLead({ hook_event_name: 'Stop', session_id: 'stop-l49-session', cwd: root }, root, 'unknown', env);
  assert.match(result?.text ?? '', /work: 1 runnable and unowned/, 'Codex Stop must carry the real backlog line in additionalContext text');
});
```

This path is still bounded only by the 400 ms child kill. If that also flakes on Windows under load, spawn backlog-notice.js with Stop the way the two-session test does, then feed its JSON through the same mapping. Either way, the Stop-null mutant above must fail again.

## Side note, my own action

While attempting a comparison run, a `cd` to the removed wt-review-49b worktree failed. The chained commands then ran in the gudgeon worktree. They mutated and immediately restored hooks/multi-codex-hook.mjs there, and git status in gudgeon is clean. They also left one stray backup file at C:/Users/benzh/orca/workspaces/claude-delegation/mch49b.bak. I did not delete it. It is safe to remove.

## Verified directly

- The diff stat and hunks.
- The scoped gate at 25 of 25.
- The Stop-null production mutant against both the old and the new test file, results above.
- I also removed the systemMessage fallback for Stop text in production. It passes under both test files, so it was never covered. The proposed test above would catch it.
- Worktree 49c was restored afterwards. git status in hooks is clean.
