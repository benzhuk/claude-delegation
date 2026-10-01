VERDICT: PASS — A1 untimed-segment test is green on reviewed source and kills M6 at the intended assertion

# Lane 40b A1 untimed-segment regression

- Test commit: `6999b70d318a096ad255ca6f3af676274b248fb7`
- Reviewed source tested: `dc53988d6add72fe8f0560b184c1ec900360335c`
- Changed repository path: `scripts/build-census.codex.contract.test.mjs`
- Production repository changes by this lane: none
- Completed: 2026-09-29 23:36:50 America/New_York
- Test worktree status: clean
- Integration worktree status: clean
- Full suite: not run
- Prior reports: unchanged

## Added contract case

```text
Lane40b segment retention: untimed start in segment B keeps an open-mode child PARTIAL
```

The fixture is the code review’s exact A1 shape:

- segment A identifies child `segmented-untimed`, starts timed task `a-turn`, records usage, and completes it;
- segment B has the same child identity and a literal timestamp-less `task_started` for open task `b-turn`;
- the census is open mode (`from: null`, `to: null`);
- assertions require incomplete scope, reason matching `open or unbounded child segmented-untimed has no end-bound witness`, and `combined === null`.

## Scratch verification

Scratch copy:

```text
C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/census-reader-40b/untimed-mutant-dc53988
```

It is a plain-file copy of the integrated `scripts/` and required `skills/` tree at source SHA `dc53988d`, with the committed test file overlaid. Integration source, Git identity, HOME, and logs were untouched.

The nonblocking Windows mutex `Global\claude-verify` was acquired for both runs.

Exact command for control and mutant:

```powershell
node --test --test-name-pattern "Lane40b segment retention: untimed start in segment B" scripts/build-census.codex.contract.test.mjs
```

Control result:

```text
✔ Lane40b segment retention: untimed start in segment B keeps an open-mode child PARTIAL (11.1308ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 144.6441
```

M6 scratch mutation:

```diff
- const childEnded = (state) => state.latestStartCompleted && !state.invalidTaskStarted && !state.untimedStart;
+ const childEnded = (state) => state.latestStartCompleted && !state.invalidTaskStarted;
```

Mutant result:

```text
✖ Lane40b segment retention: untimed start in segment B keeps an open-mode child PARTIAL (10.7043ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 72.2698

AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
true !== false
```

The failure is at the first intended assertion, `report.lead.codex.discovery.scope.complete === false`: without `!state.untimedStart`, segment A’s completed witness is borrowed and the open child is incorrectly reported complete.

Cause: the latest timed start can belong to a completed segment while another segment contains a later-in-file untimed open start; without the aggregate untimed-start guard, the completed witness survives.

Discriminating check: the exact open-mode segment fixture stays PARTIAL on reviewed source and becomes complete under M6.

Fix location: `scripts/build-census.mjs` aggregate `childEnded` predicate. No production fix was needed because reviewed source already contains the guard.

Simplification: one focused retention test pins the existing conservative boolean; no new mechanism or output shape is introduced.

