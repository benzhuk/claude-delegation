VERDICT: PASS

# F1 round 2 fix report — one-launch-2 (wr-2026-09-26-one-launch-fix)

Worktree: /home/ben/Code/wt-one-launch-2-F1, branch build/one-launch-2-F1.
Round-2 commit: `4eb7bd1e91f716f902c86681a075eff67e473fc4` (own `git rev-parse HEAD`, run in
the worktree after the fix commit — never typed from memory).

## Reviewer finding applied (from integrator-report.md)

Source: /home/ben/Code/wt-olfix/docs/specs/one-launch-2/reports/integrator-report.md:51-71
("Triage: N2 -> territory F1").

Finding: the full sealed suite's `N2` invariant test
(skills/multi/scripts/hooks.test.mjs:429, "no test file in this suite inherits the runner
environment on its own") failed on the merge commit with:

```
AssertionError [ERR_ASSERTION]: these spawn sites build their own env instead of using childEnv():
skills/team-build/references/accept-prep.test.mjs:367, skills/team-build/references/accept-prep.test.mjs:395,
skills/team-build/references/accept-prep.test.mjs:423, skills/team-build/references/accept-prep.test.mjs:441
```

Root cause: four `spawnSync` call sites in `accept-prep.test.mjs` (round-1 F1 work) each
built the child env by spreading the runner's own environment directly
(`{ ...process.env, ORDER_LOG: orderLog, RECORD_ABS_PATH: recordAbsPath }`) instead of
routing through the repo's sealed `childEnv()` helper
(skills/multi/scripts/test-child-env.mjs), which blanks
`CLAUDE_CODE_MESSAGING_SOCKET`/`CLAUDE_CODE_MESSAGING_TOKEN` and points `HOME`/`USERPROFILE`
at a fixture dir. This is the exact class of leak the N2 test exists to catch (see
skills/multi/scripts/hooks.test.mjs:430-448 and test-child-env.mjs's header comment on the
2026-09-17 leak).

Confirmed absent at base 33aa023 per the integrator report (accept-prep.test.mjs did not
exist yet) — a new failure caused entirely by F1's round-1 new file, correctly triaged to F1
(the only builder that touched it).

## Fix applied

File: skills/team-build/references/accept-prep.test.mjs (only file changed this round).

1. Added import (accept-prep.test.mjs:16, after the fix — was line 15 before):
   `import { childEnv } from "../../multi/scripts/test-child-env.mjs";`
   Same relative path already used by the sibling file in this same directory,
   skills/team-build/references/build-loop-workflow.test.mjs:18.

2. Replaced all four offending sites (original lines 367, 395, 423, 441 — now 368, 396, 424,
   442 after the added import line shifted everything down by one):

   Before (each of the 4 sites, identical text):
   `const env = { ...process.env, ORDER_LOG: orderLog, RECORD_ABS_PATH: recordAbsPath };`

   After (each of the 4 sites):
   `const env = childEnv(tmp, { ORDER_LOG: orderLog, RECORD_ABS_PATH: recordAbsPath });`

   `tmp` is each test's own already-in-scope throwaway fixture directory (created via
   `mkTmp(...)` at the top of each test), used as the fixture `HOME` argument `childEnv`
   requires — consistent with `childEnv`'s own doc comment ("fixture HOME"). Neither
   `accept-prep.mjs` (grep for `homedir`/`HOME` returned nothing) nor the inline
   `CENSUS_STUB`/`WORK_RECORD_STUB` scripts read `HOME`, so redirecting it to the fixture dir
   changes no test's behavior — confirmed by the unchanged 100/100 pass count below.

No other file was touched. No fixture files (record-no-worktree.md,
record-with-worktree.md) changed, so R3(a)'s byte-diff assertions are untouched and still
pass (see full run below).

## Gate 1 (this territory's pinned gate)

`node --test skills/team-build/references/build-loop-workflow.test.mjs
skills/team-build/references/accept-prep.test.mjs`, run from /home/ben/Code/wt-one-launch-2-F1
at 4eb7bd1e91f716f902c86681a075eff67e473fc4. Full tail:

```
ℹ tests 100
ℹ suites 0
ℹ pass 100
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 505.558409
```

100/100, 0 failures — same count as round 1's own claimed 100/100 (F1-report.md,
F1-review.md), confirming the childEnv change introduced no regression in this territory's
own test files. Full log: docs/specs/one-launch-2/reports/F1-gate.log.

## Gate 2 (the reviewer-named repro gate, N2 only)

`node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs`, run from
/home/ben/Code/wt-one-launch-2-F1 at 4eb7bd1e91f716f902c86681a075eff67e473fc4:

```
✔ N2: no test file in this suite inherits the runner environment on its own (14.549278ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 98.269445
```

N2 now passes — the exact failure the integrator reported is fixed. Full log:
docs/specs/one-launch-2/reports/F1-n2-gate.log.

## Scope discipline

- Only skills/team-build/references/accept-prep.test.mjs touched; nothing under
  scripts/, hooks/, .codex-plugin/; no README edit; no SKILL.md edit beyond round 1's
  already-landed R5 sentence (untouched this round); no docs/work/ write; no peer note
  sent; no git identity set or switched; no destructive git used (only `git add`/`git
  commit`, no reset/clean/stash/force-push/rm -rf).
- V4 (mirror-shim.test.mjs) and H6 (note-send.test.mjs), the other two names in the
  integrator's failing-name diff, are pre-existing per the integrator's own base-comparison
  run (fail at base 33aa023 too) and per contracts.md R6's pinned list — not F1's, not
  touched here.

## Not done / out of scope

- No dogfood step (lane six's record Base rewrite, four-read) — the lead's job per the
  brief's NOT list, not touched.
- No full-suite run (`node scripts/run-tests.mjs`) performed here — that is the
  integrator's job, not this territory's gate. Both territory-scoped gates named above were
  run and both pass.

Report: this file. Gate logs:
docs/specs/one-launch-2/reports/F1-gate.log,
docs/specs/one-launch-2/reports/F1-n2-gate.log.
State file: docs/specs/one-launch-2/reports/F1-state.md.
