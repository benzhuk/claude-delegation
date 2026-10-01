VERDICT: APPROVE 894453fc2e8a493e719fc07e7b4fa5e50d01b79f

# Review: territory wedge64, delta re-review after fix round 2 (findings F8 and F9)

Branch build/decisions-wedge-64-wedge64. The delta is 535f5140470416d55ee72aea287af15392bde047..894453fc2e8a493e719fc07e7b4fa5e50d01b79f, one commit (894453fc). The sha comes from my own `git rev-parse HEAD` in the worktree.
This was a read-only review. Every construction ran on `git archive` copies under the lane scratch folder `.../scratchpad/lane-64/reviewer-r4/{head,mut}`. `git status --short` in the reviewed worktree was empty before and after. The round-3 report this file replaces is kept at `.../scratchpad/lane-64/reviewer-r4/reviewer-report-round3.md`.

There are no new findings: 0 blockers, 0 majors, 0 minors. Both prior findings are fixed, and the delta adds no regression.

Cause: the wedge was one transition split across two commands, with the receipt's baseline not matching the page the closing step had verified. F6 (round 3) closed the last twin. F8 was the missing test pin for F6's production wiring (the `freshInputs` forwarding in `defaultAccountRound`). F9 was one SKILL.md instruction that still omitted `--owner`.
Discriminating check: mutation on the scratch copy `mut/`. I removed `...(freshInputs ? { freshInputs } : {}),` from decisions-render-publish.mjs:168 and ran decisions-render-publish.test.mjs: EXIT=1, pass 72, fail 1. The failing test is exactly "defaultAccountRound (lane 64 F6): forwards the fresh page triples so the pickup can refuse an uncaptured page". With the line restored (as at HEAD), the gate is 171/171.
Fix location: skills/decisions/scripts/decisions-render-publish.test.mjs:1386-1392 (the new test); skills/decisions/SKILL.md:66.
Simplification: no code change. One unit test pins the production forwarding, and one SKILL.md instruction gains the required flag.

## Prior findings: verification
- F8 MINOR: FIXED.
  - The test is added verbatim from the round-3 patch at decisions-render-publish.test.mjs:1386-1392, directly after the existing defaultAccountRound test.
  - Mutation proof, run by me: dropping the forwarding at decisions-render-publish.mjs:168 fails exactly this test, with 72 passing and 1 failing. The scratch mutant was restored afterwards (`diff -r head mut` is empty).
- F9 MINOR: FIXED.
  - SKILL.md:66 now reads "add `--clear-done --owner <your-session-name>` when the".
  - I grepped every `clear-done` in SKILL.md and decisions-render.mjs. The run instructions all carry `--owner`: SKILL.md:66, :122, :289, :315 and decisions-render.mjs:8. The rest (:68, :98, :126, :134, :275, :278, :293) name the flag in prose and are not instructions to run it.

## Verified (first-class, no defect)
- Gate re-run on an archive of HEAD with the four gate files: 171 tests, 171 pass, 0 fail, EXIT=0. This matches the builder's claim and wedge64-gate.log.
- Prefix proof, run by me in the worktree: `node scripts/prefix-test.mjs --base 0d9cdeb539a6f23e7974cdea589fb0d3b127f2f9 --test skills/decisions/scripts/decisions-pickup.test.mjs --repo .` gave EXIT=0, "prefix-test: reproduces at base 0d9cdeb539a6f23e7974cdea589fb0d3b127f2f9 and passes at the fix revision". The worktree was clean afterwards.
- Scope: the delta touches only skills/decisions/SKILL.md (1 line) and skills/decisions/scripts/decisions-render-publish.test.mjs (+8 lines). Both are territory files. There is no production code change, no waiver flag, no page section and no publish-without-pickup path.
- skill-text.test.mjs stays green. No skill-text pin matched the old SKILL.md:66 wording.

## INFO (not counted, carried over unchanged for the lead)
- I1 and I2: the publish-side F1 unit test does not discriminate by itself, and history matches text, not title.
- I3: residual and pre-existing. A round that is ACCOUNTED, after which the owner edits the page before Done is cleared, ends in NEEDS_RECONCILIATION with previousState ACCOUNTED, and nothing closes it (decisions-pickup.mjs:1431 needs `accountingOutcome == null`). Lead's call: accept it as disclosed, or rule a follow-up.
- SKILL.md:66 is now 114 columns wide, against the surrounding wrap of about 90. Lines :122, :131 and :315 have the same issue. It is cosmetic, and no test polices it.

## Rulings needed (builder's A-F, unchanged since round 3)
- A: strict (`--owner` required when the step accounts). Acceptable, and every SKILL.md run instruction now agrees with it.
- B: acceptable. The day floor is still open for the lead.
- C: registered-pickup.contract.test.mjs:181 is untouched and passes. This is the narrowest reading.
- D: project rebind. Still parked, and it still blocks item 5. It is the lead's.
- E and F: agreed.
- Live note for item 5: run one pickup tick on the repaired host immediately before the live `publish --clear-done --owner <lead>`. Otherwise F6 correctly refuses with exit 3 whenever the page moved since the last tick.

## Commands run
- In the worktree (read-only):
  - `git rev-parse HEAD`
  - `git status --short`: empty before and after
  - `git log` and `git diff 535f5140..HEAD`
  - one `node scripts/prefix-test.mjs` run (result above)
- On scratch archives:
  - the gate on `head/`: 171/171
  - the forwarding mutation on `mut/`: 1 fail, exactly the F8 test, then restored
- `node scripts/bugfix-fields.mjs <this report>`: see the last line.
- `node scripts/bugfix-fields.mjs <this report>`: exit 0, "bugfix-fields: all four fields present".
