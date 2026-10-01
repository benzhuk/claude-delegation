VERDICT: APPROVE 4eb7bd1e91f716f902c86681a075eff67e473fc4

# F1 review, round 2 (delta re-review): one-launch-2 (wr-2026-09-26-one-launch-fix)

Worktree: /home/ben/Code/wt-one-launch-2-F1. `git rev-parse HEAD` (my own run):
`4eb7bd1e91f716f902c86681a075eff67e473fc4`. `git status --short`: empty, so the tree is clean.
Range reviewed: `8791423e37a85d2fee31854c7eade696fde2552e..HEAD` is one commit (4eb7bd1). It touches one file,
`skills/team-build/references/accept-prep.test.mjs`, with 5 lines added and 4 removed. Production code
(`accept-prep.mjs`, `build-loop-workflow.mjs`, SKILL.md) is unchanged since the round-1 APPROVE at 8791423.

## Prior finding: N2 (integrator-report.md, "Triage: N2 -> territory F1"). FIXED, verified.

- Diff: accept-prep.test.mjs:16 adds `import { childEnv } from "../../multi/scripts/test-child-env.mjs";`.
  Four spawn sites (lines 368, 396, 424 and 442) change from spreading the runner env to
  `childEnv(tmp, { ORDER_LOG: orderLog, RECORD_ABS_PATH: recordAbsPath })`.
- `childEnv` (skills/multi/scripts/test-child-env.mjs:33-41) blanks
  CLAUDE_CODE_MESSAGING_SOCKET and CLAUDE_CODE_MESSAGING_TOKEN, and points HOME and USERPROFILE at `tmp`. The
  per-test `over` still carries ORDER_LOG and RECORD_ABS_PATH, which the stubs read (accept-prep.test.mjs:322-337).
- I ran `node --test --test-name-pattern="N2" skills/multi/scripts/hooks.test.mjs`:
  `✔ N2: no test file in this suite inherits the runner environment on its own`, pass 1, fail 0.
- I ran the territory gate
  `node --test skills/team-build/references/build-loop-workflow.test.mjs skills/team-build/references/accept-prep.test.mjs`:
  tests 100, pass 100, fail 0.

## Regression hunt

- **Does the order test still catch a census-first order when run under the sealed env?** Yes, I verified it.
  I made a scratch copy (`git archive HEAD` into my session scratchpad, outside the reviewed tree, deleted
  afterwards). In that copy's `main()` (accept-prep.mjs:305-319) I swapped the order so `runCensus` runs before
  `editRecord`, then ran `node --test skills/team-build/references/accept-prep.test.mjs`:
  `✖ R3b ORDER: census sees the reviewed Log: line already present, and check-acceptance runs strictly after census`,
  pass 16, fail 1. So R3b still discriminates. Moving HOME did not turn it into a check that passes because it
  isn't looking.
- **Could the HOME change silently change what the children see?** No. accept-prep.mjs does not read HOME,
  and the stubs read only ORDER_LOG and RECORD_ABS_PATH. Every CLI test that uses childEnv still asserts on
  content in the order log and on the record bytes, and all of them pass.
- **Are other spawn sites in the territory's test files unsealed?** One, and it is pre-existing:
  build-loop-workflow.test.mjs:32, `execFileSync(process.execPath, ["--check", SCRIPT_PATH], ...)`. It is
  byte-identical at base 33aa023, where the same line is also line 32. It runs `node --check`, which parses
  the script and executes nothing, so it cannot leak a token. N2 does not flag it. This is not a finding
  against this round.
- **Did round 2 change anything else?** No. The diffstat is limited to accept-prep.test.mjs. The round-1
  attack-brief results (header byte-preservation, order, seamBriefPath fallback, baseSha validation, census
  failure leaving the record edit in place, and the SKILL.md sentence) cover code this round did not touch,
  so they still hold as verified at 8791423.

## Findings

None. There are zero blockers, zero major findings and zero minor findings.

## C4 fields

Cause: in round 1, four spawnSync sites in accept-prep.test.mjs built the child env by spreading the runner's own environment instead of calling the sealed childEnv() helper, which violated the repo-wide N2 invariant (hooks.test.mjs:429).
Discriminating check: `node --test --test-name-pattern="N2" skills/multi/scripts/hooks.test.mjs` failed on 8791423 (integrator log) and passes at 4eb7bd1 (my run). A census-first mutation on a scratch copy still fails R3b, so the seal did not blind the order test.
Fix location: skills/team-build/references/accept-prep.test.mjs:16 (import), then lines 368, 396, 424 and 442 (childEnv calls).
Simplification: none needed. The fix routes the tests through the existing childEnv helper and adds no new env plumbing.
