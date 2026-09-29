NEEDS_FIXES fb96de5

Reviewer: lane56-review, acting as lane49-review (Claude Opus 5.5, model id claude-opus-5-5). Worktree scratchpad/wt-review-56, detached at fb96de5fd011f2c9457c045dcc647adc7d116243. Merge-base with origin/main is c0818c9.

## Classification of the 14 tests

| # | Test (short) | Class | What it proves | Can a faked timer hide a regression no deadline test catches? |
|---|---|---|---|---|
| 1 | manifests derive bidirectional coverage | pure (labelled functional) | Parity derived from both manifests on disk, with only the Interrupt allowance | No timers involved |
| 2 | validator rejects fake Claude and Codex events | pure (labelled functional) | Fake events on either side fail | No timers involved |
| 3 | wrapper emits SessionStart plus prompt, post and stop output | functional, parent frozen | Composition with a stubbed backlog route, peer and continuation kept | No. The 400/450 ms limits are covered by tests 7 and 8 |
| 4 | real wrapper CLI, frozen by preload | functional, preload | The real CLI reaches the real child. Output goes to stdout and the session sentinel is written | Partly. The preload freezes only literal delays of 400, 450 and 2500 ms (see MINOR 1) |
| 5 | SessionStart without transcript routes wiring | functional, parent frozen | The real wiring-check child runs, peer is kept, and a healthy home stays silent | No |
| 6 | declaration consumed and no sentinel for a missing child | functional, parent frozen | Production NATIVE_ROUTES drives routing | No |
| 7 | deadline: route child give-up within 2 s | deadline, real clock | The 400 ms kill reaps a real hung child | This test is the one that catches it |
| 8 | deadline: outer route budget within 2 s | deadline, real clock | The 450 ms outer limit ends the hook, which returns null | The bound, yes. It no longer proves advisory and peer output survive (MAJOR 1) |
| 9 | real prompt-submit child keeps peer and advisory | functional, parent frozen | A successful real route merges with peer and advisory output | Yes. It covers only the success path, so the hung-route merge is unproven (MAJOR 1) |
| 10 | two session ids, independent sentinels | functional, parent frozen | Per-session cadence across Claude and Codex | No |
| 11 | real Stop route surfaces backlog | functional, parent frozen | The Codex Stop mapping, text fallback included, with a real child and sentinel | No |
| 12 | cadence and switch stay silent | functional, parent frozen | The 120 s cadence and the ws-off-backlog switch | No |
| 13 | scratch installer wires the delete guard | pure (labelled functional) | Installer wiring and trust | No timers involved |
| 14 | negative controls | pure (labelled functional) | Removed or overlapping coverage is rejected | No timers involved |

No test is both deadline and functional. Tests 1, 2, 13 and 14 are labelled "functional:" but touch no timers. That is cosmetic.

## Findings

### MAJOR 1: a hung route may now silently discard a ready advisory or peer output

hooks/codex-unsupported.test.mjs:319-335. Test 8 used to assert that peer output and the ready advisory survive a never-resolving route. That was the core lane 37 guarantee, "a stalled native route cannot discard an already-complete advisory". The lane replaced that with an empty inbox, a null advisory and `result === null`. Test 9 checks peer and advisory output only when the route succeeds.

- Cause: removing the load-sensitive assertions also removed the deterministic ones. The peer and advisory fakes resolve as microtasks before any timer, so they were never the flaky part.
- Discriminating check: I mutated hooks/multi-codex-hook.mjs:269 to `const [advisoryRaw, route] = await Promise.all([advisoryWork, routeWork]); const advisory = route ? advisoryRaw : null;`. This drops the advisory whenever the route gives up.
  - With the fb96de5 test file: 14 of 14 pass, so the regression is undetected.
  - With the c0818c9 test file: 2 fail, "a stalled native route cannot discard an already-complete advisory" and "ready advisory survives the separately bounded route".
- Fix location: test 8 only. Restore the injected peer and advisory output and their assertions. This is still a pure deadline test, because nothing in it waits on a real child.
- Simplification: none needed. It is a one-hunk revert of the assertions.

Patch for hooks/codex-unsupported.test.mjs.

old:
```js
      inbox: async () => ({ slug: 'lead', count: 0, notes: [] }),
      goalContextForLead: async () => null,
      nativeRouteForLead: async () => new Promise(() => {}),
      codexContinuationSupported: false,
    },
  );
  assert.ok(performance.now() - started < 2000, 'runCodexHook outer route budget must reject the 5-second timeout mutant');
  assert.equal(result, null, 'the timed-out route must give up silently');
```
new:
```js
      inbox: async () => peerNotes(),
      goalContextForLead: async () => ({ text: 'OUTER-ADVISORY-PRESERVED' }),
      nativeRouteForLead: async () => new Promise(() => {}),
      codexContinuationSupported: false,
    },
  );
  assert.ok(performance.now() - started < 2000, 'runCodexHook outer route budget must reject the 5-second timeout mutant');
  assert.match(context(result), /peer → lead/, 'peer delivery survives the separately bounded route');
  assert.match(context(result), /OUTER-ADVISORY-PRESERVED/, 'a stalled native route cannot discard an already-complete advisory');
```

### MINOR 1: the CLI preload freezes only three exact delay values

hooks/codex-unsupported.test.mjs:39-56, `wrapperTimerPreload`. It freezes only literal delays of 400, 450 and 2500 ms. If production retunes any of them, for example to 350 ms, the preload silently stops freezing that timer. Test 4 then races under load again, with no failure to say so. Two fixes would work:
- Export the constants from multi-codex-hook.mjs and pass them to the preload.
- Freeze every delay of 300 ms or more except the 10 s spawn cleanup, and assert inside the preload that at least one timer was frozen. For example, write a marker file on the first freeze and assert it exists after the spawn.

Not blocking on its own.

### NIT: labels

Tests 1, 2, 13 and 14 are labelled "functional:" but do not touch timers. "pure:" would keep the deadline-or-functional split meaningful.

## Load ordering, point 5 of the brief

The flaky assertion at the old line 233, "received only continuation epoch context", came from test 3 losing the backlog line to the 450 ms race. In fb96de5, test 3 both stubs the route and freezes the parent's timers, so the backlog line cannot be dropped by load there. Tests 9, 10, 11 and 12 freeze the parent's timers around real children, so they cannot drop a line either; a hung child would hit the test's 10 s timeout instead. No test depends on two children finishing in a particular order. The only remaining wall-clock tests are 7 and 8, which assert bounds of under 2 s against 400 and 450 ms limits.

## Timer restoration

`freezeParentRouteTimers` uses `t.mock.timers`, which Node restores automatically at the end of each test, pass or fail. It also registers `t.after(reset)`. A throwing assertion therefore cannot leave a fake timer behind for the next test. The CLI preload runs only inside the spawned wrapper process and is never passed to the backlog child.

## Raw counts, all run by me in wt-review-56, focused file only

| Run | Tests | Pass | Fail | Other |
|---|---|---|---|---|
| Base | 14 | 14 | 0 | |
| Stop route nulled | 14 | 13 | 1 | "Codex Stop must carry the real backlog line", test 11 only |
| Stop text fallback dropped | 14 | 13 | 1 | Same assertion, test 11 only |
| 400 ms kill raised to 5 s | 14 | 12 | 0 | 2 cancelled, "test timed out after 2000ms", exit 1 |
| Advisory dropped when the route gives up | 14 | 14 | 0 | Undetected, MAJOR 1 |
| Same advisory mutant, c0818c9 test file | 13 | 11 | 2 | Caught |

In the 5 s kill run, the two cancelled tests are the deadline tests. The test runner's own 2 s timeout fires before the elapsed-time assertion, which is an acceptable way to fail. Production and the test file were restored after every mutant, and git status is clean.

## Diff scope

`git diff c0818c9..fb96de5 --stat` touches one code file, hooks/codex-unsupported.test.mjs, with 126 lines changed. The rest is under docs/specs/codex-clock-56/ plus the work record. No production file changed.
