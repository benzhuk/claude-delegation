VERDICT: APPROVE 8ada6f290b1b95150e48e4cd5b82aab7cd8daea7

APPROVE

# M2 review, round 2 (delta re-review): feed registered pickup's status line

Worktree `/home/ben/Code/wt-merge-on-acceptance-1-M2`. `git rev-parse HEAD` = `8ada6f290b1b95150e48e4cd5b82aab7cd8daea7`.
Range `202ad60..HEAD` is one commit, `8ada6f2 fix(multi): apply M2 review round-1 findings to pickup status`.
It touches 3 files (+28/-6). The working tree was clean before and after this review. Cumulative diff
against base `24e02eab`: the same 3 files, and nothing else.

Counts: blocker 0, major 0, minor 0.

## Prior findings: verification

### Finding 1 (MAJOR, `--status --json` dropped `at`/`ordinal`): FIXED
- `skills/multi/scripts/note-flush.mjs:320` now returns `json: { state: 'annotated', ...pickup, age_s: ageS }`.
  `pickup` is `safePickupAnnotation`'s output (`:226-233`), which is exactly `{ at, code, ordinal }`. It
  cannot contain `state` or `age_s`, so the spread cannot overwrite the two fixed keys. The annotated json
  now contains the full old raw annotation, plus `state` and `age_s`.
- The doc comment at `:299-302` describes the new shape.
- Test `note-flush.test.mjs:1522-1524` now pins the whole object: `at`, `code`, `ordinal: 3`, `age_s: 17`.
- Mutation check: I made the edits in a scratch copy made with `git archive`, outside the tree, and restored
  it afterwards (diff against `HEAD` identical). Reverting `:320` to the round-1 `code`-only shape fails
  exactly one test: "F3/M2: --status reports a heartbeat pickup annotation's code and age".

### Finding 2 (MINOR, SKILL.md missing the `configured` state): FIXED
- `skills/multi/SKILL.md:132-134` now lists all four endings. The `configured, awaiting first pickup pass`
  wording matches `note-flush.mjs:335` byte for byte, and the file-exists-but-not-yet-annotated condition
  is correct.
- The "not registered on this host" sentence from round 1 is still there, unchanged, and accurate.

### Finding 3 (MINOR, two untested branches): FIXED
- `note-flush.test.mjs:1537-1543` tests the configured state. It sets up only a registration and asserts both
  the line and `{ state: 'configured' }`.
- `:1545-1552` tests the case where both switches exist, and asserts `{ state: 'disabled', switch: 'ws-off' }`.
- Mutation checks, same scratch copy:
  - Swapping the ternary so `ws-off-decisions` is named first fails only the both-switches test.
  - Changing the configured string fails only the configured test.
- Neither new test spawns a process or spreads the process env.

## Regression hunt (no defects found)

1. **Gate, rerun by me.** `node --test skills/multi/scripts/note-flush.test.mjs` gives 117/117 pass (115
   before + 2 new). `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs` gives 1/1 pass.
2. **No scope creep this round.** The commit changes only the 3 territory files. Nothing under `hooks/`,
   and nothing in `skills/decisions/`. The code change is one expression on one line, plus a comment. It adds
   no I/O, no log line, no state file, no switch name, and no network call.
3. **Underlying pickup tests.** `decisions-pickup.test.mjs` + `registered-pickup.contract.test.mjs` give
   50/50 pass on 9 of 10 runs. See the observation below for the 1 failure, which does not come from M2.
4. **Other json consumers.** The pre-existing "--status --json includes the raw heartbeat" test still passes.
   The missing-heartbeat branch still passes `null` and reports `unregistered`/`disabled`/`configured`
   correctly. The two `deepEqual` tests from round 1 are unchanged.

## Observations for the orchestrator (not findings against this territory)

- **Flaky test outside the territory, not caused by M2.** In 2 of 10 runs, `registered-pickup.contract.test.mjs`
  failed "one injected selection invokes exactly one bound entry and maps lifecycle states to safe summaries".
  - The failure was `actual: 'fedcba98…'`, `expected: '01234567…'`.
  - Cause: the test orders entries with `localeCompare` on `path.resolve(repo)` (test file `:108`). The
    production code orders them with a code-point `<` on `canonicalPathKey` (`decisions-pickup.mjs:649-653`).
  - The two orders disagree whenever `mkdtemp`'s first random character after `registered-project-` is one
    of `U`-`Z`. Against `two-`'s `t`, code-point order puts uppercase first, and locale order puts it after.
  - Neither file is in M2's diff (`git diff --stat 24e02eab..HEAD`), and commit 931588a was an earlier attempt
    at this same flake.
  - The integrator's full-suite run can hit it about 1 run in 10. The fix belongs in that test file: compare
    with the same code-point comparator as production. It is not M2's work.
- **The gate log does not hold the note-flush half of the gate.** The brief's gate command is
  `A && B > M2-gate.log 2>&1`. The redirect binds only to `B`, so `reports/M2-gate.log` (207 bytes) holds
  only the N2 run. The builder's report says "Full log at … M2-gate.log. 117/117 pass", but that log does
  not contain the 117. The builder followed the brief's command exactly. I reproduced 117/117 myself.
  - If the record needs this log as `Evidence:`, rerun with
    `{ node --test skills/multi/scripts/note-flush.test.mjs && node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs; } > …/M2-gate.log 2>&1`.
