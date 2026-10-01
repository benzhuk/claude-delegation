VERDICT: NEEDS_FIXES (4) a548b145c0c4dc6e3e7d9e1c3dabf639315cac94

# Seam review r2 (delta): L1 (build-loop-workflow.js) <-> L2 (SKILL.md)

HEAD is `a548b145c0c4dc6e3e7d9e1c3dabf639315cac94`, from my own `git rev-parse HEAD` in
/home/ben/Code/claude-delegation-lane4. Range reviewed: `be2a30b..a548b14`. The code changes are all in fix commit 3169f98.
Prior findings: `docs/specs/one-launch-1/reports/seam-r1.md`.

Checks I ran:
- `node --test skills/team-build/references/build-loop-workflow.test.mjs`: 67 of 67 pass.
- A scratch simulation, run outside the tree through the same AsyncFunction harness with stub agents:
  - A legacy given-mode launch with no `integrationWorktree`. Every rendered prompt and the return are byte-identical between be2a30 and HEAD. Against 0.20.9 (fbd7cf6), the return is identical on the old keys. The only prompt difference is R9's appended "Never send peer notes.", which the contract requires.
  - A setup-mode launch. I printed the setup, integrate and accept-prep prompts it rendered. Findings N1 and N2 are based on those prompts.

Nothing in the reviewed tree was modified.

Counts: 0 BLOCKER, 1 MAJOR, 3 MINOR.

## Prior findings: verification

| # | Status | Evidence |
|---|---|---|
| S1 | FIXED | script:256-262 and 622-626. In setup mode the integrate prompt now carries `Integration worktree: /r/int (branch build/x); merge ... report headSha from git rev-parse HEAD run in it.` The legacy prompt is unchanged (simulation, and test.mjs:606). setupPrompt passes the facts to the integrator brief (script:271-274). |
| S2 | FIXED | script:305-307. The census `--out`, the evidence copy target and the record write target are all anchored at `${integrationWorktree}/`. SKILL.md:363 matches. |
| S3 | FIXED | SKILL.md:356-358 and 368-374 route on `integrator.verdict` and say integrator failure is never in `blockers`. This matches script:797-802. |
| S4 | FIXED, with a twin (N2) | script:749-750 adds `no-integration-branch`. script:296 falls back to a named gate. SKILL.md:336-339 documents both. The same `undefined` rendering is still present in the new setup-prompt text; see N2. |
| s5 | FIXED | SKILL.md:341-343 and 383-384 order the stages Setup, Build, Review, Fix, Integrate, Seam, Accept. This is the same as meta.phases (script:4-12) and the call order. |
| s6 | FIXED, now incomplete (N3) | SKILL.md:369 names `accept-prep`, but this round added a second reason for that id. |
| s7 | FIXED | SKILL.md:349-354 and 394-395. |
| s8 | FIXED | SKILL.md:347-348. |
| s9 | FIXED | SKILL.md:339-340. |
| s10 | APPLIED; the contract needs a ruling (N4) | script:303 and 307, and SKILL.md:378-379, agree with each other. |
| s11 | APPLIED; introduced N1 | script:412, 459 and 767-793. |

## Verified: no defects found in these areas

- **Backward compatibility of this round.** A legacy launch renders byte-identical prompts and returns identical values at be2a30 and at HEAD. `where` is `''`, so `.${where} Include` renders the same text as before.
- **Accept gating.** Accept-prep still cannot run when the integrator is non-PASS, when the seam is NEEDS_FIXES or BLOCKED, or when a territory is blocked (script:745-759). The script renders no `accept` call anywhere.
- **Twins of T1 and S5.** The two new checks compare paths by string equality and are not sha checks. No new stage takes a sha from prompt text. `seamLogText` uses `seam.sha`, which the script already set from a `sameSha`-verified review (script:729).
- **Runtime limits.** The delta adds no Date.now, fs or shell.
- **SKILL <-> script on the Log line.** SKILL.md:378-379 ("naming the seam round and sha, or `seam SKIPPED`") matches script:303.

## MAJOR

### N1. The accept-prep report path is relative, but the prompt has just moved the runner's cwd to the plugin root. The new strict equality check then turns the sensible reading into a false blocker
**Where:** script:767 (`acceptReportPath`), script:305 and 308-309 (the prompt), script:790-793 and 801 (the check and the blocker). On the SKILL.md side, the report path is not described anywhere.

**Evidence:** the simulated accept-prep prompt ends as follows. It contains no anchor for the report path:
`4) From the same delegation plugin root, run ... Report path: docs/specs/x/reports/accept-prep.md.`
With the example args, `specPath` is repo-relative (`build-loop-args.example.json`: `docs/specs/example-build/spec.md`). This is the same bug class as S2. Both readings of the prompt are bad:
- **Literal reading.** The runner writes the report under the delegation plugin root. That is the plugin cache or the plugin's own checkout, not the target repo. The lead then gets back a relative `acceptance.reportPath` that doesn't resolve from its own cwd.
- **Sensible reading.** The runner writes into the integration worktree and returns the absolute path, which Sonnet runners usually do. The check at script:790 then fails, and `{ id: 'accept-prep', reason: 'report-path-mismatch' }` blocks acceptance of a build that is fine.

The setup stage's identical check (script:459) does not have this problem. Its prompt never moves the runner's cwd, so its relative paths resolve the same way the pre-existing brief paths do.

**Fix (mechanical):** anchor the path the same way S2 anchored the evidence and record paths.

Old (script:767):
```js
  const acceptReportPath = `${dirName(specPath)}/reports/accept-prep.md`
```
New:
```js
  const acceptReportPath = specPath.startsWith('/')
    ? `${dirName(specPath)}/reports/accept-prep.md`
    : `${integrationWorktree}/${dirName(specPath)}/reports/accept-prep.md`
```
In test.mjs, add a helper `acceptReportPathFor(args)` that mirrors this logic. Use it in place of `reportPathFor(args.specPath, "accept-prep")` at lines 921, 1214, 1233, 1291, 1316, 1369 and 1455. At 1455 pass `example`.

**Predicted outcome:** the runner is told an absolute path inside the integration worktree, so it writes the report next to the evidence and echoes an equal string back. The check then fires only on a real deviation. All 67 tests stay green once the helper is updated. The legacy path is untouched, because accept-prep never runs without `integrationWorktree`.

## MINOR

### N2. The setup prompt renders `branch undefined` / `full-suite gate undefined` (a twin of S4)
**Where:** script:271-273. The SKILL side is SKILL.md:337-339, which treats `integrationBranch` and `integrationGate` as optional.

**Evidence:** the simulated setup-mode launch (with `integrationWorktree` and `integrationBranch`, and no `integrationGate`) rendered `The integrator brief names integration worktree /r/int, branch build/x, full-suite gate undefined.` The setup runner writes this into the integrator brief. S1's `integratePrompt` already guards both fields. This line does not.

**Fix (mechanical):**
Old (script:271-273):
```js
  const integrationText = integrationWorktree
    ? ` The integrator brief names integration worktree ${integrationWorktree}, branch ${integrationBranch}, full-suite gate ${integrationGate}.`
    : ''
```
New:
```js
  const integrationText = integrationWorktree
    ? ` The integrator brief names integration worktree ${integrationWorktree}${integrationBranch ? `, branch ${integrationBranch}` : ''}${integrationGate ? `, full-suite gate ${integrationGate}` : ''}.`
    : ''
```
**Predicted outcome:** when all three fields are given, the output is byte-identical to today, so the existing S1 setup test stays green. When a field is absent, nothing is rendered for it. Add one assertion to the existing setup test: with no `integrationGate`, `!setupCall.prompt.includes('undefined')`.

### N3. SKILL.md's `accept-prep` blocker description misses the new `report-path-mismatch` reason
**Where:** SKILL.md:369-370 against script:801.

**Evidence:** the script now emits two reasons under id `accept-prep` (script:800-801). SKILL.md names only the `integrationHead` case. The accept gate still holds because `blockers` is non-empty. But the routing sentence gives the lead no way to recognise the second reason.

**Fix (mechanical):**
Old (SKILL.md:369-370):
```
(a territory id, `seam`, `accept-prep` when its `integrationHead` is not the reviewed
head, or `*` for a launch error),
```
New:
```
(a territory id, `seam`, `accept-prep` when its `integrationHead` is not the reviewed
head (`review-sha-mismatch`) or its `reportPath` is not the one the script computed
(`report-path-mismatch`), or `*` for a launch error),
```

### N4. s10 deviates from contracts.md R5's pinned Log literal, and no ruling is recorded
**Where:** script:303 and 307, and SKILL.md:378-379, against contracts.md R5 step 3 (`one Log: <iso> reviewed <owner> seam r<n> APPROVE <sha> line`).

**Evidence:** on a SKIPPED seam, the script now renders `seam SKIPPED`. The contract literal presupposes an APPROVE seam. Round 1 flagged s10 as needing a lead ruling. The fix report (seam-fix-r2-report.md) applied it without one. `grep -rn ruling` over the briefs and the record finds only the launch-3 gate ruling. SKILL and script agree, so this is not a seam defect. It is a contract deviation that has not been recorded.

**Fix (lead action, no code change):** amend contracts.md R5 step 3 to read `... one Log: <iso> reviewed <owner> seam r<n> APPROVE <sha> line (or seam SKIPPED when the seam stage was skipped)`. If the lead would rather keep the literal, revert script:303 and 307 and SKILL.md:378-379 instead.

## C4 fields (N1, the regression this round introduced)
Cause: s11 added a relative `acceptReportPath` (script:767) to a prompt whose steps 1 and 4 explicitly move the runner's cwd to the plugin root. It also added a strict equality check (script:790) against that relative string.
Discriminating check: render an accept-prep prompt with the example args (repo-relative specPath). The `Report path:` value has no `${integrationWorktree}/` prefix and follows "From the same delegation plugin root". A stub runner that returns the absolute path inside the integration worktree gets `report-path-mismatch`.
Fix location: skills/team-build/references/build-loop-workflow.js:767, plus the accept-prep `reportPathFor` call sites in build-loop-workflow.test.mjs.
Simplification: anchor the path at `integrationWorktree` like the S2 paths, rather than adding cwd prose to the prompt. One conditional expression covers both absolute and relative specPath.

## Summary for the builder
- Apply N1 and N2 in `build-loop-workflow.js`, and update the test helper for N1.
- Apply N3 in `SKILL.md`.
- N4 is the lead's ruling to make in contracts.md.

None of these patches changes a legacy launch that has no `integrationWorktree`.
