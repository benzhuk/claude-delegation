VERDICT: NEEDS_FIXES (11) be2a30bfec16cef0ac99ef94ac54472b5f09e4ed

# Seam review r1: L1 (build-loop-workflow.js) <-> L2 (SKILL.md)

HEAD: `be2a30bfec16cef0ac99ef94ac54472b5f09e4ed` (from my own `git rev-parse HEAD` in /home/ben/Code/claude-delegation-lane4).
Scope: the joint only. Does `skills/team-build/SKILL.md` describe exactly what
`skills/team-build/references/build-loop-workflow.js` does? Contracts: `docs/specs/one-launch-1/contracts.md`.
Checks run: `node --test skills/team-build/references/build-loop-workflow.test.mjs` passed 61 of 61. I also ran a
scratch simulation outside the tree. It fed the script through the same AsyncFunction harness with a setup-mode
launch and printed the setup, integrate and accept-prep prompts it rendered. Findings 1, 2 and 4 rest on those
prompts. Nothing in the reviewed tree was modified.

Counts: 0 BLOCKER, 4 MAJOR, 7 MINOR.

## Verified: no defects found in these areas

- **Arg names.** SKILL.md:327-330 lists the same 17 names the script reads (script:306-320, 393, 627). Nothing is missing and there are no extras.
- **Return shape.** SKILL.md:340 `{ territories, integrator, seam, acceptance, setup, blockers }` is the same as script:782-789 and earlyReturn at script:324-326. The territory-row fields at SKILL.md:341 match script:497.
- **seam/acceptance null rule.** SKILL.md:347 says "null only when no integrationWorktree". This matches script:629-630 and 733-734.
- **startFrom semantics.** SKILL.md:378-382 matches script:473-495. APPROVE skips the build and the review. NEEDS_FIXES starts at a fix round. startFrom is only valid on a given territory, and script:367 enforces that.
- **Never-accept rule.** SKILL.md:363-367 matches ACCEPT_MANDATE (script:155) and prompt step 3 (script:300). The script contains no `accept` call anywhere. The only work-record.mjs subcommand it renders is `check-acceptance` (script:301).
- **Lead-session source.** SKILL.md:320-321 and 338 match script:298: the runner resolves an id to its `.jsonl`, and with no session the census comes back null.
- **census-stale reasoning.** SKILL.md:354 and 374-375 match the prompt order at script:298-300: the census runs in step 1, before the Log line is written in step 3.
- **Seam default.** SKILL.md:336 "two or more territories; `seam: false` suppresses it" matches script:627.
- **Codex paragraph.** SKILL.md:384-388 says the loop is explicitly unsupported on Codex and rules out emulation. This matches contracts R10.
- **Wake discipline.** SKILL.md:369-371 is consistent with every mandate constant (script:146-155).

## MAJOR

### S1. In setup mode the integrator is never told where to integrate, but the seam review requires that location
**Where:** script:256-260 (`integratePrompt`), script:264-268 (`setupPrompt`), script:612/615 (call sites), script:651 (seam sha check). On the SKILL.md side: 322-324 and 335-336.

**Evidence:** SKILL.md:322-324 tells the lead to cut the integration worktree and pass it as `integrationWorktree`. SKILL.md:335 says that argument "turns on the seam review". The seam reviewer then runs `git rev-parse HEAD` in `integrationWorktree`, and script:651 requires that value to equal `integrate.headSha`. But `integrationWorktree`, `integrationBranch` and `integrationGate` never appear in any prompt the integrator can see. The simulated setup-mode integrate prompt was exactly: `Integrator brief: docs/specs/x/briefs/integrator.md. Base sha: …. Approved territories and shas: L1@…, L2@…. Excluded (blocked) territories: none. Include a territory only after …`. The setup prompt, which is what writes that integrator brief, doesn't carry them either.

In given mode this works only because the lead writes the worktree into the integrator brief by hand, as `briefs/integrator.md:3` does in this build. A setup-mode launch, the new "one launch" path, gives the integrator no merge target. The result is either an integrator that merges somewhere else, so script:651 returns `review-sha-mismatch` on seam, or a BLOCKED integrator.

**Fix:** pass the integration facts to the integrator whenever `integrationWorktree` is given. The legacy prompt stays byte-identical when it is absent.

Old (script:256-260):
```js
function integratePrompt(integratorBriefPath, baseSha, approved, excluded) {
  const approvedText = approved.length ? approved.map((r) => `${r.id}@${r.sha}`).join(', ') : 'none'
  const excludedText = excluded.length ? excluded.map((r) => `${r.id} (${r.blocker})`).join(', ') : 'none'
  return `Integrator brief: ${integratorBriefPath}. Base sha: ${baseSha}. Approved territories and shas: ${approvedText}. Excluded (blocked) territories: ${excludedText}. Include a territory only after its reviewer explicitly returned APPROVE for that exact sha; do not infer approval from an absent, NEEDS_FIXES, or mismatched review. ${INTEGRATE_MANDATE}`
}
```
New:
```js
function integratePrompt(integratorBriefPath, baseSha, approved, excluded, integration) {
  const approvedText = approved.length ? approved.map((r) => `${r.id}@${r.sha}`).join(', ') : 'none'
  const excludedText = excluded.length ? excluded.map((r) => `${r.id} (${r.blocker})`).join(', ') : 'none'
  const where = integration && integration.worktree
    ? ` Integration worktree: ${integration.worktree}${integration.branch ? ` (branch ${integration.branch})` : ''}; merge the approved territories there and report headSha from \`git rev-parse HEAD\` run in it.${integration.gate ? ` Full-suite gate: ${integration.gate}.` : ''}`
    : ''
  return `Integrator brief: ${integratorBriefPath}. Base sha: ${baseSha}. Approved territories and shas: ${approvedText}. Excluded (blocked) territories: ${excludedText}.${where} Include a territory only after its reviewer explicitly returned APPROVE for that exact sha; do not infer approval from an absent, NEEDS_FIXES, or mismatched review. ${INTEGRATE_MANDATE}`
}
```
At both call sites (script:612 and 615), add the final argument `{ worktree: integrationWorktree, branch: integrationBranch, gate: integrationGate }`. In `setupPrompt`, append ` The integrator brief names integration worktree ${integrationWorktree}, branch ${integrationBranch}, full-suite gate ${integrationGate}.` when `integrationWorktree` is given. That means threading the three values in as parameters. Add one test: a setup-mode launch's integrate prompt contains the integration worktree, and a legacy launch's prompt does not contain "Integration worktree".

**Predicted outcome:** the legacy prompt is unchanged, so the existing byte-comparison tests stay green. A setup-mode integrator gets a concrete merge target, so script:651 compares two reads of the same worktree.

### S2. Accept-prep's relative output paths resolve against the plugin root, not the integration worktree
**Where:** script:298-300. On the SKILL.md side: 352-353 and 365.

**Evidence:** step 1 tells the runner "From the delegation plugin root …, run `node scripts/build-census.mjs … --out docs/work/evidence/${workId}-census.md`". `build-census.mjs` writes `opts.out` against the process cwd (`scripts/build-census.mjs:996`), so the census lands in `<plugin-root>/docs/work/evidence/`. Step 2's copy destination `docs/work/evidence/${workId}-<lane>.md` and step 3's record `docs/work/wr….record.md` are also bare relative paths, and step 1 has just moved the runner's cwd to the plugin root.

SKILL.md:352-353 places this build's census at `<integrationWorktree>/docs/work/evidence/<work-id>-census.md`. SKILL.md:365 says the evidence copies go "in `docs/work/evidence/`" of the record's repo. `accepted` needs its evidence inside the repo (SKILL.md:222). So when the runner follows the prompt literally, it writes into the plugin checkout: possibly this very repo, or the installed plugin cache. It also edits the wrong record, or none.

This is a regression from the L1-r1 m5 fix. That fix's instruction was "From the integration worktree (cd there first), run the delegation plugin's scripts/…", but the delivered text anchors the cwd at the plugin root instead. Only `--record`, which `work-record.mjs:1029` resolves against `--repo`, is safe.

**Fix (mechanical):** anchor every written path at `integrationWorktree`.
- script:298. Old: `--out docs/work/evidence/${workId}-census.md` → New: `--out ${integrationWorktree}/docs/work/evidence/${workId}-census.md`
- script:299. Old: `to docs/work/evidence/${workId}-<lane>.md with original bytes` → New: `to ${integrationWorktree}/docs/work/evidence/${workId}-<lane>.md with original bytes (list them repo-relative in Evidence:)`
- script:300. Old: `Write exactly these header lines of ${recordPath} and no others` → New: `Write exactly these header lines of ${integrationWorktree}/${recordPath} and no others`

`integrationWorktree` is guaranteed truthy on this branch (script:733). No existing test pins these substrings (checked: test.mjs has no `--out` or `docs/work/evidence` assertion on the prompt), so all 61 tests should stay green. Add one assertion that the accept-prep prompt contains `${integrationWorktree}/docs/work/evidence/`.

### S3. SKILL.md's post-return routing never reads `integrator`, and integrator failure never reaches `blockers`
**Where:** SKILL.md:341-361 against script:776-780 and 629-631.

**Evidence:** `blockers` is built only from excluded territories, the seam blocker, and the accept-prep head mismatch (script:776-780). An integrator `FAIL` or `BLOCKED` adds nothing to it. With `integrationWorktree`, integrator FAIL produces `seam: SKIPPED` with `blocker: null` (script:631-634), plus `acceptance.skipped: 'integrator-not-pass'`. Accept stays gated, but only through `acceptance`. Without `integrationWorktree`, which is the legacy call, integrator FAIL returns `blockers: []`, `seam: null` and `acceptance: null`.

SKILL.md:360-361 then tells the lead: "`acceptance: null` with no blockers means this call ran without `integrationWorktree`, so seam and acceptance are still yours to run by hand". That sends the lead to run a seam review and acceptance over a failed integration. SKILL.md:348 also calls `blockers` "the same failures flattened", which implies integrator failure would appear there. It doesn't. The 0.20.9 SKILL said "`integrator` is that stage's own verdict object — read it last". The cut removed that sentence and nothing replaces it.

**Fix (SKILL.md, mechanical):**
- SKILL.md:358-359. Old: `Otherwise the first of these that applies decides the one next step: a \`blockers\` entry` → New: `Otherwise the first of these that applies decides the one next step: a \`blockers\` entry, \`integrator.verdict\` other than \`PASS\` (its \`failedGate\`/\`territory\`; integrator failure is never in \`blockers\`)`
- SKILL.md:360. Old: `` `acceptance: null` with no blockers means`` → New: `` `acceptance: null` with no blockers and \`integrator.verdict\` \`PASS\` means``
- SKILL.md:347-348. Old: `` `blockers` is the same failures flattened to `[{ id, reason }]`. `` → New: `` `blockers` is the territory, seam and accept-prep failures flattened to `[{ id, reason }]` (never the integrator's — read `integrator.verdict`). ``

### S4. SKILL marks `integrationBranch` and `integrationGate` optional, but the script renders them unguarded once `integrationWorktree` is given
**Where:** SKILL.md:327-330 and 335-338 against script:290, 297, 300-301, 393.

**Evidence:** SKILL.md:336-337 says "`integrationWorktree` plus `recordPath` turn on accept-prep". The script's accept-prep branch (script:746-754) doesn't check `integrationBranch`, and the template literals at script:297, 300 and 301 would render `Artifact: undefined@<40-hex head>`, `Worktree: undefined` and `--delivery-ref undefined`. The runner is told to write those header lines into the one work record. Likewise the seam-fix builder (script:290) gets `Gate: undefined` when `integrationGate` is absent. Also, in setup mode with neither `worktreeRoot` nor `integrationWorktree`, script:393 gives `dirName('')` = `.`, so setup worktrees become the relative `./wt-<slug>-<id>`, relative to wherever the runner stands. SKILL doesn't say that setup mode needs one of the two.

**Fix:**
- script, inside the accept-prep chain before the final `else` (after script:745). Insert `} else if (!integrationBranch) {\n  acceptance = { skipped: 'no-integration-branch' }` (R5's `{ skipped: <reason> }` is open vocabulary).
- script:290. Old: `Gate: ${integrationGate}.` → New: `Gate: ${integrationGate ?? 'the full-suite gate named in the integrator brief'}.`
- SKILL.md:336-338. Old: `` `integrationWorktree` plus `recordPath` turn on accept-prep; `` → New: `` `integrationWorktree` plus `recordPath` and `integrationBranch` turn on accept-prep (`integrationGate` is the seam-fix builder's gate; a setup launch also needs `worktreeRoot` or `integrationWorktree`, whose parent is the default root); ``

**Predicted outcome:** no existing test launches with `integrationWorktree` but without `integrationBranch`. The example file and the fixture both carry it. So the change is additive, and it closes the only way the runner could write `undefined` into record headers.

## MINOR

### s5. Stage order is stated backwards in two lists
SKILL.md:338-339 ("fix round, re-review, the seam review, integration and the accept-prep") and SKILL.md:370-371 ("fix rounds, re-reviews, the seam review, integration and the census") both put seam before integration. The script runs Integrate (script:608) before Seam (script:626-720), and meta.phases (script:4-12) orders them Setup, Build, Review, Fix, Integrate, Seam, Accept. SKILL.md never states that order anywhere.
- SKILL.md:338-339. Old: `Every fix round, re-review, the seam review, integration and the accept-prep census-and-check run inside that one call` → New: `The stages run in this order inside that one call: Setup (setup territories only), Build, Review, Fix, Integrate, Seam, Accept (accept-prep's census-and-check)`
- SKILL.md:370-371. Old: `fix rounds, re-reviews, the seam review,\nintegration and the census` → New: `fix rounds, re-reviews, integration,\nthe seam review and the census`

### s6. Blocker id `accept-prep` is emitted but not in SKILL's id list
script:779 emits `{ id: 'accept-prep', reason: 'review-sha-mismatch' }`. SKILL.md:359 enumerates blocker ids as "a territory id, `seam`, or `*`". The accept gate at SKILL.md:350 still holds, because `blockers` is non-empty. But the routing sentence gives the lead no way to recognise this id, and contracts R7 doesn't list it either.
- SKILL.md:359. Old: `(a territory id, \`seam\`, or \`*\` for a launch error)` → New: `(a territory id, \`seam\`, \`accept-prep\` when its \`integrationHead\` is not the reviewed head, or \`*\` for a launch error)`

### s7. The launch-error vocabulary in SKILL.md is incomplete
All of the following are at SKILL.md:343-345 and 378-382, against script:329-375, 418-452.
(a) `setup-failed` comes back with id `*` when the agent dies twice or brief paths mismatch (script:420, 452), but with the territory id when a territory row fails verification (script:434). SKILL.md:359 files territory ids under "a territory id", not under launch errors.
(b) An invalid `startFrom` returns `missing-args` (script:373). That covers a non-sha, a bad verdict, NEEDS_FIXES without `findingsPath`, or startFrom on a setup territory. SKILL.md:328 and 379-380 write `findingsPath?` as optional for both verdicts.
(c) A territory with one or two of the three fields present returns `mixed-territory-modes` (script:343, 347). SKILL.md:333-334 only mentions mixing given and setup territories.
Fix: after SKILL.md:345, add "`setup-failed` carries the failing territory's id when that territory's returned names or head do not match, `*` otherwise; an invalid `startFrom` (sha not 7-40 hex, verdict not APPROVE/NEEDS_FIXES, NEEDS_FIXES without `findingsPath`, or on a setup territory) is `missing-args`; a territory with only some of `briefPath`/`worktree`/`branch` is `mixed-territory-modes`". At SKILL.md:381, change `` `NEEDS_FIXES` starts with `` → `` `NEEDS_FIXES` (requires `findingsPath`) starts with ``.

### s8. `parallel-result-missing` is missing from SKILL's territory blocker list
script:603 emits it, with an extra `failure` field on the row (script:604). The script already did this at 0.20.9, and the old SKILL also omitted it. SKILL.md:342-343 still claims the list is complete ("else …").
- SKILL.md:343. Old: `` `review-sha-mismatch`, `review-not-approved` or `rounds-exhausted`; `` → New: `` `review-sha-mismatch`, `review-not-approved`, `rounds-exhausted` or `parallel-result-missing`; ``

### s9. In an all-given launch the seam reviewer receives `reviewerBriefPath`, and SKILL.md doesn't say so
script:638 uses `reviewerBriefPathFinal` as the seam brief when not in setup mode (contract R4 matches). SKILL.md:334-335 only says an all-given call "also passes `reviewerBriefPath` and `integratorBriefPath`". It never tells the lead that this reviewer brief must also carry the seam section, which is what this build's `briefs/reviewer.md:26` does by hand. Fix: at SKILL.md:335, append "; in an all-given call that reviewer brief is also the seam brief, so give it a seam section".

### s10. The accept-prep Log line says "seam r<n> APPROVE" even when the seam was SKIPPED, and the runner is never given n or the seam sha
script:300, repeated in SKILL.md:365-366. Accept-prep also runs on `seam.verdict === 'SKIPPED'` (script:744). It would then write a record line claiming a seam APPROVE that never happened. The script knows `seam.rounds`, `seam.sha` and `seam.verdict`, but passes none of them to the runner. This was L1-r1 m6, which was left for the lead because R5 pins the literal. It is re-raised here because SKILL.md:365-366 now documents the same false literal. Fix (lead's ruling on R5): render `seam ${seam && seam.verdict === 'APPROVE' ? `r${seam.rounds} APPROVE ${seam.sha}` : 'SKIPPED'}` into step 3, and have SKILL.md:365-366 say "one `Log: ... reviewed ...` line naming the seam round and sha, or `seam SKIPPED`".

### s11. The setup and accept-prep runners are never given a report path
SETUP_MANDATE (script:152-153) and ACCEPT_MANDATE (script:154-155) both say "Report to disk", but neither prompt (script:268, 294-303) names a path, and `setupInfo.reportPath` (script:458) and `acceptance.reportPath` are taken on faith. SKILL.md:345-346 tells the lead that `setup` holds "the setup stage's report and brief paths". Fix: compute `${dirName(specPath)}/reports/setup.md` and `.../reports/accept-prep.md` in the script, add `Report path: <that>.` to each prompt, and compare the returned `reportPath` against it the same way script:447-449 checks brief paths.

## Summary for the builder
Apply S1 and S2 in `build-loop-workflow.js`. Apply S3 in `SKILL.md`. Apply S4 in both files. The MINOR patches are mechanical text edits, except s10, which needs a lead ruling. None of the patches changes a given-mode launch with no `integrationWorktree`, so the legacy byte-compat tests should stay green.
