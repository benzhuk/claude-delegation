# Bearings assessment for astra-harness-next, September 23–24, 2026 (America/New_York)

**Revision:** the git snapshot shows HEAD at `020a266`, with uncommitted changes in `scripts/mirror-shared-skills.mjs` and `skills/multi/scripts/mirror-shim.test.mjs` (the mirror builder's work in progress). The parent records the final commit.

**Evidence boundary:** I read the nine repository files listed. I could not read `C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/0924-policy-diagnosis.md`, because the file tools are limited to the working directory. So the claim that "first-use Codex read denial was our fixture disabling its configured Windows backend" is **attributed only**. I did not verify it. I checked no source code beyond the listed documents.

## The four questions

**1. Significant progress toward the goal? Partial. Source work has progressed; the product outcome hasn't.**
- *Directly verified in documents, but the test runs themselves are attributed:* 0.20.3 was released at `2187116` with 1393 of 1393 tests passing (`docs/native-use.md:3`, `docs/work/evidence/overnight-release-disposition.md:3`).
- *Directly verified:* the acceptance boundary is still "real authorized work and shared handoffs on Codex, Claude Code, and a mixed collaboration" (`docs/GOALS.md:31`). The disposition itself says `PRODUCT_GOALS_NOT_FULLY_DEMONSTRATED` (`overnight-release-disposition.md:1`).
- *Directly verified:* all four measures are unknown or non-comparative (`GOALS.md:22-25`).
- *Attributed:* the most valuable result today is the policy diagnosis. It turns an item listed as "external" into a defect in our own fixture. That confirms the earlier stop was premature.

**2. Sidelined on a too-specific sub-project? Yes, at the margin.**
- The optional-mirror diagnostic is legitimate and small, but its own spec says it "is not evidence of improved delivery throughput" (`docs/specs/2026-09-24-optional-mirror-diagnostics.md:13`).
- More hook tests, and re-proving the previous turn's activation, would repeat the same pattern. That work sits near the hooks, not near the outcome.

**3. A castle of patches instead of architecture? Yes, the continuation mechanism is at that risk.**
- `docs/specs/2026-09-23-continuation-runtime-build.md:52-68` layers epoch, episodeKey, requestId, user-UUID matching, peerWillBlock, afterFlush, Interrupt disarm and several profile caveats. All of that exists to deliver at most one Stop correction.
- The mechanism can't catch the failure that actually happened. Accounting "cannot make a false completion or blocker claim true" (`skills/continue/SKILL.md:37`).
- The premature stop was a **scope-selection** error: blockers were labeled external without a discriminating observation (`docs/specs/2026-09-24-useful-work-reassessment.md:5`). It wasn't an activation gap, so more Stop prompts or activation proofs don't address it. No new continuation source is warranted.

**4. Still building toward the simplest solution to the core problem? Only if the next work is real host use.**
- The simplest route to the goal is to install the documented route (`native-use.md:23-31`) and run real authorized work in it.
- The existing instruction already covers the stop failure (`continue/SKILL.md:14`, "inspect their dependencies to find finite useful work or establish concrete blockers"). What's missing is enforcement at disposition time, and that's an operational fix, not an engine.

## Decision: **CONTINUE**

The direction set in `useful-work-reassessment.md` is sound. What changes is priority: the installation and live-validation authority the user just checked in Notion removes the first dependency in the disposition (`overnight-release-disposition.md:9`, "chosen production host/activation"). That dependency is now ready work.

**Missing evidence that could change this decision:**
- the exact wording and scope of that Notion checkbox (attributed);
- the outcome of the pilot;
- whether the policy-diagnosis report holds up on review.

## Ranked material gaps

| # | Gap | Evidence | Why this rank |
|---|---|---|---|
| 1 | No installed, real-work Codex, Claude or mixed demonstration | `GOALS.md:31`; disposition line 1 | This is the core product outcome, and its authority is now checked (attributed) |
| 2 | Codex production hook shell is unqualified: Store/MSIX PowerShell fails with OS error 5 before any handler runs | `native-use.md:55` | Probably the first broken contract once Codex is installed; it would silently leave all hooks inactive |
| 3 | Stop disposition classified items as external without a discriminating observation; continuation can't detect this | `useful-work-reassessment.md:5`; `continue/SKILL.md:37` | Recurring failure that the user has challenged repeatedly |
| 4 | No comparative cost, speed or rework cohort | `GOALS.md:22-27` | No improvement claim is valid without it; it needs real tasks from gap 1 first |
| 5 | Operator documents still attribute the Codex grounding failure to shell policy | `native-use.md:19`; disposition line 5 | Stale causal claim; fix it only after the pilot confirms the cause |
| 6 | Previous turn's activation unproved; optional mirror omissions are silent | brief; mirror spec | Low value. Don't build history-phase storage. Finish the mirror diagnostic only because it's already in flight |

I agree with rejecting the proposed census owned-event requirement. "Opened" to "accepted" is not ask-to-delivery time (`GOALS.md:23`). Retroactive timestamps would invalidate genuine records without adding any comparative evidence.

## One next action

Within the exact wording of the checked Notion authority, install 0.20.3 through the **native Codex package route only** (`native-use.md:25-29`). Leave plain-mirror hooks off, so the two hook routes aren't both active (`native-use.md:49`). Then, in a fresh session, run one small, already-authorized read-only project task, and record:
- the skill listing;
- whether SessionStart, PostToolUse and Stop fire;
- whether first-use file reads succeed on the default Windows backend.

**Prediction (checked when that session ends):**
- `codex plugin list` shows all nine `delegation:*` skills.
- If the policy diagnosis is right, reads succeed without widening the sandbox.
- Hooks either run, or fail before any handler with OS error 5.

If they fail that way, gap 2 becomes the next build: qualifying the production hook shell selection. That's a scoped source or configuration change, not new continuation machinery. If reads are denied under the default backend, the attributed diagnosis is falsified and gets reopened.

## Operational correction (no source change)

Before any stop, the disposition should contain a **blocker ledger**. For each remaining item, it lists:
- the dependency;
- the authority state, with the time it was read (for example, whether the Notion box is checked or unchecked);
- the last discriminating observation, or "none";
- the reversible preparation already done.

An item whose observation is "none" is ready work, not external. The bearings or independent reviewer checks the ledger rather than adding a Stop prompt.

**Falsifiable check:** apply the ledger retroactively to disposition line 9. It should flag Codex policy (no discriminating observation existed) and host activation (preparation not exhausted). If it flags neither, the correction is useless.

A single sentence adding this rule to `continue/SKILL.md` is the most I'd change in source. The ledger itself is operational, and nothing in hooks or code is warranted.

## Independent work continuing in parallel

- The corrected read-only Codex pilot keeps running untouched. Its result feeds gap 5 and cross-checks the prediction above.
- The mirror-diagnostic builder finishes, followed by independent review, within its existing two-file territory. After that, stop that lane.
- Local drafts only, not published: an upstream SDK issue about the missing hook-shell fallback (`native-use.md:55`), and a knowledge-publication packet. Posting both still waits on the unchecked Notion choices.
- The parent refreshes the disposition into the ledger form above.

I made no edits, ran no commands, contacted no external services and published nothing. The parent owns publication and the lead response.