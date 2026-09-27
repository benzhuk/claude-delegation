VERDICT: FAIL

# Integrator report — linux-green-1

## Territories merged

- L1 — sha `a1be58949d77617e19f462a8277a89e0ca849281`. Reviewed at exactly that sha with an explicit
  `VERDICT: APPROVE a1be58949d77617e19f462a8277a89e0ca849281` in
  `docs/specs/linux-green-1/reports/L1-review-3.md`. Merged into `build/linux-green-1` in
  `/home/ben/Code/wt-lg` via `git merge --no-edit build/linux-green-1-L1` (no conflicts).
- No excluded/blocked territories this run (none named in the mandate).

**Merge commit / headSha:** `d93e3f2b87053d8253cf1ce38ea00625cf0f27b3` (`git rev-parse HEAD` in
`/home/ben/Code/wt-lg`, branch `build/linux-green-1`).

## Gate run

Command run exactly as specified:
```
node scripts/run-tests.mjs > /home/ben/Code/wt-lg/docs/specs/linux-green-1/reports/integrator-gate.log 2>&1
```
Exit code: 1.

**Summary line:** `1774 pass, 1 fail, 3 skipped` (of 1778 total tests; 0 cancelled, 0 todo).

## Failing test (named exactly)

`skills/decisions/scripts/registered-pickup.contract.test.mjs:98:1` — test name "one injected
selection invokes exactly one bound entry and maps lifecycle states to safe summaries", failing
assertion at line 116:

```
AssertionError [ERR_ASSERTION]: ordinal selects canonical repo/page order, not fixture creation order
+ actual - expected
+ 'fedcba9876543210fedcba9876543210'
- '0123456789abcdef0123456789abcdef'
```

This is **not** `hooks/delegation-reminder.test.mjs` — the one known flake named in contracts.md
R4 — so the "rerun it alone before any verdict" carve-out does not apply, and it did not appear at
all in this run's log. No special handling was invoked; this failure stands as-is against the
zero-failures bar.

This file is outside L1's territory map (contracts.md: L1 owns only
`skills/multi/scripts/transport.mjs`, `note-send.test.mjs`, `mirror-shim.test.mjs`, and
`scripts/mirror-shared-skills.mjs`). `git log` on the file shows no commit touching it in this
lane; it was untouched by the merge — the owning builder for triage is whichever territory/lane
owns `skills/decisions/scripts/` (outside linux-green-1's own territory map), not L1.

For triage context only (diagnostic, not a re-run of the gate, and not used to change this
verdict): I ran the single failing file alone, outside the sealed run, five times —
`node --test skills/decisions/scripts/registered-pickup.contract.test.mjs` — and it failed once
(1/5) with the identical assertion and the identical two swapped literal values. The test's own
"canonical" ordering sorts fixture repos by `path.resolve(repo)` string comparison, and the two
fixture-directory prefixes used (`registered-project-` vs `registered-project-two-`) differ only
by inserting the literal substring `"two-"`; `mkdtempSync`'s random suffix on the first prefix can
lexically sort either side of that substring, flipping which entry the test calls "ordinal 0"
between runs. This looks like a real, intermittent, order-dependent failure in the test itself —
not the contracts-named flake, so it is reported plainly as a blocker per R4 ("any failure you
find is a blocker to report plainly, not a judgment call to soften"), not waived.

## Gate log evidence

Tail of `/home/ben/Code/wt-lg/docs/specs/linux-green-1/reports/integrator-gate.log` (last ~30
lines, includes the summary counts and the one failing test's full output block):

```
ℹ tests 1778
ℹ suites 0
ℹ pass 1774
ℹ fail 1
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
ℹ duration_ms 8482.696811

✖ failing tests:

test at skills/decisions/scripts/registered-pickup.contract.test.mjs:98:1
✖ one injected selection invokes exactly one bound entry and maps lifecycle states to safe summaries (9.624823ms)
  AssertionError [ERR_ASSERTION]: ordinal selects canonical repo/page order, not fixture creation order
  + actual - expected

  + 'fedcba9876543210fedcba9876543210'
  - '0123456789abcdef0123456789abcdef'

      at TestContext.<anonymous> (file:///home/ben/Code/wt-lg/skills/decisions/scripts/registered-pickup.contract.test.mjs:116:10)
      at async Test.run (node:internal/test_runner/test:1332:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:911:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 'fedcba9876543210fedcba9876543210',
    expected: '0123456789abcdef0123456789abcdef',
    operator: 'strictEqual',
    diff: 'simple'
  }
run-tests: leaving the sealed home for inspection: /tmp/sealed-home-ZoprdT
```

The runner left `/tmp/sealed-home-ZoprdT` on disk for inspection (its own behavior on a failing
run) — not removed, in case it is useful for triage.

## What I did not do

- Did not fix `registered-pickup.contract.test.mjs` or any other file.
- Did not run the second-host (Windows) suite — out of scope per this mandate's NOT section.
- Did not touch `docs/GOALS.md` or `docs/work/` beyond this report and the state file.
- Did not set/switch a git identity, did not push, sent no peer notes, ran no destructive git
  command (no `reset --hard`, `clean`, `stash`, force push).
- Left `docs/specs/linux-green-1/reports/L1-gate.log` / `L1-state.md`'s pre-existing uncommitted
  working-tree modifications and the three untracked `L1*.md` report files exactly as found — not
  mine to stage or commit.

## Verdict

**FAIL.** One real, named failure
(`skills/decisions/scripts/registered-pickup.contract.test.mjs:98:1`) against R4's zero-failures
bar. This is not the contracts-named flake and not excused. Reporting to the orchestrator/lead for
triage; I decide nothing about ship-readiness.
