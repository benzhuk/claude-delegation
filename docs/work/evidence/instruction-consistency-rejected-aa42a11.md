VERDICT: NEEDS_FIXES (2) — aa42a11772998a7b3d95a04c8e43aa37c22ce2b0

# Independent instruction-consistency review — native Claude (Opus 5.5)

Reviewer: native Claude Code session `2ccdbe03-d922-418e-8215-c375d3e9538c`, model `claude-opus-5-5`.
Scope: the immutable three-file candidate delta and the eight scenarios in `review-brief.md`, and nothing else.
Authority: `authority.md`. This is a review only. No candidate file or work record was edited, and no git, hash, test, or search command was run.

## Reviewed identity

| Item | Value |
|---|---|
| Candidate | `aa42a11772998a7b3d95a04c8e43aa37c22ce2b0` |
| Base | `03e3bcee0bbc54884778dee4be1101c933197d47` |
| `skills/team-build/SKILL.md` | blob `bf2f842027f60566e4cb94467a40ea8b9bfd3b54` |
| `docs/agent-pacing.md` | blob `5aee6da9cbd2a824099ff971bafd547aa1edc43b` |
| `docs/subagent-contract.md` | blob `e503ea7a2a80cd8fcf71b3ea643d27fe10bb8c3c` |
| Spec `docs/specs/2026-09-23-instruction-consistency.md` | blob `5208c0fad95b193cddaf1c764066f8163b0dda84` |
| `evidence/candidate.patch` | sha256 `e2e6623d…8425` (manifest) |
| `evidence/builder-report.md` | sha256 `d293f96c…a62d` (manifest) |

The host verified these blob and hash values (`evidence/snapshot-manifest.json:1-32`). As the brief instructs, I did not recompute them.

Line citations below point to the packet copies: `SKILL` = `candidate/skills/team-build/SKILL.md`, `PACING` = `candidate/docs/agent-pacing.md`, `CONTRACT` = `candidate/docs/subagent-contract.md`, `SPEC` = `spec/docs/specs/2026-09-23-instruction-consistency.md`.

## Findings (ordered by severity)

### F1 — Medium: the caller skill no longer says a hard budget is binding, so a progress-based extension can exceed it (scenario 4)

- SPEC:12 contains two separate rules: "A hard user/project budget remains binding" and "Wrong approach, documented stall or exceeded hard limit permits stopping/recovery."
- SKILL:180-182 keeps only the second rule: "Recorded native progress can justify a bounded extension under that ladder, while a documented stall, wrong approach, or exceeded hard user/project budget **permits** stop and recovery." "Permits" is optional. The extension sentence has no budget ceiling, and nothing in the caller skill says the budget is binding.
- In the shared contract, the only statement that the budget is binding is PACING:64. It sits inside the "Silent past 2× ETA, no reply" bullet (PACING:59-64). The rung that fits scenario 4 is "On track (progressing; ETA was just tight) → extend the timer once. No changes." (PACING:39), and it says nothing about a budget.
- Result: take a reviewer whose native progress is visible and whose hard budget runs out at ETA. SKILL:180-181 plus PACING:39 allow one more extension. SKILL:182 allows a stop but does not require one. PACING:64 does not apply because the agent answered the check. Two readings are possible, extend or stop, which fails the SPEC:22 prediction of one consistent next action.
- Fix (only the words change; the bullets stay where they are):
  - SKILL:180-182, old → new:
    `Recorded native progress can justify a` / `bounded extension under that ladder, while a documented stall, wrong approach, or` / `exceeded hard user/project budget permits stop and recovery.`
    →
    `Recorded native progress can justify a` / `bounded extension under that ladder, never past a hard user/project budget, which` / `remains binding; a documented stall, wrong approach, or exceeded hard limit permits` / `stop and recovery.`
  - PACING:37, old → new:
    `Classify from the status reply (or its absence):`
    →
    `Classify from the status reply (or its absence). A hard user- or project-supplied budget stays binding on every rung; no extension goes past it:`
    The last sentence of PACING:64 then repeats this and can be removed or left in.

### F2 — Low: dependency admission lists only the three post-delivery states, so a consumer of an in-flight prerequisite is not told to wait (scenario 2)

- SPEC:9 says: "work consuming delivered/rejected/**unintegrated** prerequisites waits for those exact prerequisites."
- The base rule required a positive condition before a dependent could start: "a workstream whose prerequisite is met and whose own record says so" (patch lines 80-83).
- The candidate replaces that with a list of blocking states: "waits while that prerequisite is `delivered`, `rejected`, or `reviewed` but not integrated" (SKILL:162-164). A prerequisite that is still `owned` (being built) or `runnable` is also unintegrated, but it is not on the list. The permission clause "Disjoint work with no such unmet prerequisite may continue" (SKILL:164-165) does not cover that consumer either, because the consumer is not disjoint. So in that case the text gives no next action. The old "prerequisite is met" condition did cover it.
- This does not affect the pinned-contract parallelism inside a build (SKILL:45-46). Parallel territories code against committed contracts and do not consume a named prerequisite's output.
- Fix, SKILL:162-164, old → new:
  `A workstream that consumes a named prerequisite` / `waits while that prerequisite is \`delivered\`, \`rejected\`, or \`reviewed\` but not` / `integrated; record the dependency in its own work record.`
  →
  `A workstream that consumes a named prerequisite` / `waits until that exact prerequisite is integrated, whatever its current status` / `(\`owned\`, \`delivered\`, \`rejected\`, or \`reviewed\`); record the dependency in its own work record.`

The review found no other defects. The checks were for precedence gaps, new idle or stopping behavior, serial barriers, false approval evidence, lost authority boundaries, and accidental bulk tier upgrades.

## Scenario table

| # | Scenario | Single next action | Caller skill | Shared contract | Result |
|---|---|---|---|---|---|
| 1 | Unrelated ready work while another lane has a rejected fix | Start or continue the disjoint ready work now. The rejected lane's fix round goes on separately. | SKILL:162-165 (dependency-specific admission; disjoint work "may continue under the continue skill"); SKILL:258-260 ("start independent ready work without waiting for unrelated work to finish"); the global barrier is removed (patch 80-83) | Neither doc adds a scheduling barrier. CONTRACT:75-82 has notification hygiene only. | Consistent |
| 2 | Work consuming an unintegrated prerequisite | Hold that workstream and record the named dependency in its work record until the exact prerequisite is integrated. | SKILL:162-164; SKILL:210-215 (status lifecycle; `accepted` only once integrated) | Not addressed (scheduling is caller-owned) | Consistent when the prerequisite is `delivered`/`rejected`/`reviewed`. **F2** gap when it is still in flight. |
| 3 | Reviewer with observed progress reaches ETA | Send ONE batched status and lever message. If it is on track, extend the timer once and write the extension line. Do not stop it. | SKILL:179-183 ("Check in once at ETA … progress checkpoint, not a hard kill … bounded extension"; "Never infer death from silence alone or poll repeatedly"); the old reviewer kill-at-ETA sentence is removed (patch 105-107) | PACING:29-33 (one message, never poll more than once per ETA window); PACING:39 (extend once); PACING:59-64 (silence is a recovery signal, not proof of death); PACING:68-70 (record the decision) | Consistent |
| 4 | Real hard user/project budget while progress is visible | Should be: no extension past the budget; stop and recover within authority. | SKILL:180-182 ("permits", no binding statement) | PACING:39 (on-track extension, no budget); PACING:64 (binding, but only in the silent-past-2× bullet) | **F1**: two readings (extend or stop) |
| 5 | Report without an explicit verdict as approval evidence | Do not copy it as the deciding evidence. Ask the author for an explicit `VERDICT: APPROVE <sha>`. | SKILL:215-223 (author must state an explicit verdict; never infer it from a bare reply, test result, or parent judgment); the "add the prefix at copy time" vector is removed (patch 121-122); SKILL:280-281 | CONTRACT:17-23 (first line carries the verdict; missing or ambiguous approval requires the author); CONTRACT:41-50 (read the report; missing exit/output means unknown, never PASS; review checks evidence rather than copying the builder's label) | Consistent. The builder report in this packet (`VERDICT: PASS`) is correctly supporting evidence only (SKILL:218-219). |
| 6 | Format-only wrapper for an already explicit verdict and exact artifact | Add an attributed wrapper that surfaces the verdict and artifact and keeps the original bytes. No re-report is needed. | SKILL:215-216, 219-223 | CONTRACT:19-23; inline fallback kept at CONTRACT:24-26 | Consistent. SKILL says "bare reply" and CONTRACT says "a reply", but both forbid only *inferring*. An explicit inline verdict (CONTRACT:24-26) is not inferred, so the two do not conflict. |
| 7 | High-tier builder; default tiers unchanged | Keep the normal high-tier reviewer and add top-tier adjudication for that territory's risky work. Every other territory keeps mid builder / high reviewer. | SKILL:131-132 (adds scrutiny without changing the default flow); SKILL:11-13, 80-93, 108-120 (defaults, the one-territory high-builder reservation, and the explicit low-risk mid-reviewer exception, all unchanged); no model IDs in the patch | Not addressed (tiering is caller-owned) | Consistent. No reviewer or orchestrator is upgraded in bulk. |
| 8 | Authorized mechanical environment step | The orchestrator authorizes it. A scoped executor runs the routine command. The orchestrator keeps adjudication, the access-boundary judgment, and the ship decision. | SKILL:143-147 (orchestrator authorizes; executor authorization "never grants user authority, credentials, or access"); SKILL:138-142 (integrator "never decides"); SKILL:205-208 (orchestrator owns ship); SKILL:68-76 (`Authority:` and sole record writer unchanged) | CONTRACT:72-73 (the orchestrator owns stopping any server left running); nothing contradicts | Consistent. No new grants. |

## Sound rules preserved (verified in the candidate text)

- **Process-receipt wording is intact.** CONTRACT:44-50 is outside both contract hunks (patch 26-47). It keeps: actual exit, counts, and output at the stated artifact; preserve the process/session ID; an empty wrapper or commit is not evidence; PowerShell `$LASTEXITCODE`; missing output means unknown, never PASS; review checks evidence and does not copy the label.
- Report-reading is resolved. CONTRACT:10-11 (read load-bearing verdict and evidence even on success, in proportion to the decision) agrees with SKILL:146-147 (no reading of full green logs) and CONTRACT:41-42. The contradictory "opens the file only when something failed" is gone.
- The inline-report fallback (CONTRACT:24-32) and role-specific cleanup and termination (CONTRACT:59-82) are unchanged, as SPEC:18 requires.
- One check per ETA window with no polling or wake loop: PACING:29-33 and SKILL:179, 182-183.
- Recovery order is the same: resume the same agent first, respawn second (CONTRACT:84-93, PACING:62-63). Wrong-approach stop and salvage is kept (PACING:55-58).
- The pipelined-review, no-barrier rule and one-message builder spawn are unchanged (SKILL:151-154).
- The orchestrator is still the only `docs/work/` writer, and `accepted` still needs integration within `Authority:` or Ben's quoted word (SKILL:72-76, 213-215, 223-225).
- Clauses were edited in place (every hunk replaces text), with no new policy layer, scripts, state, or model-ID changes, as SPEC:18 requires.

## Residual limits

- This review checks consistency between instructions only. It does not show that live models comply, and it is not a speed comparison (SPEC:22).
- `docs/model-tiers.md`, the `continue` skill, and `work-record.mjs` / `validateRecord` are not in the packet. So I could not check that "top-tier adjudication" (SKILL:131) names the same tier as the tier table, or who performs it and whether it gates `reviewed`. I also could not confirm that a format-only wrapper satisfies the tooling's first-line verdict check. The candidate dropped the explicit sentence "starts with its original `VERDICT:` line" (patch 116-117). Keeping the original bytes plus a wrapper that "surfaces" the verdict implies first-line placement, but the tooling was not reviewed.
- The Workflow loop's `parallel()` barrier across territories and its pinned agent/model pairs (SKILL:294-300) existed before this change and are outside the delta. They are not a new serial barrier. Whether the loop sends high-tier-built territories to top-tier adjudication was not checked.
- The builder's validator and `git diff --check` exits (builder-report:15-17) are taken as supplied evidence and were not re-run, per the brief.
- F1 and F2 are wording fixes inside the three files that already have territory. Neither needs new mechanisms, tests, or a full-suite rerun (SPEC:18-20).
