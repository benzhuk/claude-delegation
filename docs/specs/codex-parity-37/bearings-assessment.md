VERDICT: CONTINUE

# Bearings — Lane 37 pickup — 2026-09-28

## Scope

- Assessment window: September 28, 2026, 3:00 PM through the 5:44 PM pickup, America/New_York; written September 28, 2026, America/New_York.
- Goal revision: `8b8c2f04cdabe25d1a996ad76bee7e6f2391b6ee:docs/GOALS.md`; reviewed by independent Codex agent `/root/lane37_bearings`, separate from lead `/root`.
- Evidence boundary: [packet](bearings-packet.md), [prior assessment](prior-bearings.md), [pinned bundle](pinned-spec.md), [territories](territories.md), current goals, bounded hook sources, and Lane 31's record and cited reports. Source spot-checks only; no census or suite executed.
- All links below are local/unlinked evidence, not published permalinks. Historical source claims use the stated base unless noted. The pinned bundle was copied from `dc16de3ba767fe9762cde454b3483e1e3a5abd9a`.
- Unknowns: Lane 37 outcome, complete current Codex and Claude reviewer token cost, current host-wide stalls, mature seven-day rework, installation parity, and next-window project measurements. No new empirical measure improvement is established during this pickup.

## Evidence

| Observation | Evidence | Basis | Supports and limitation |
| --- | --- | --- | --- |
| O1. The token baseline is now median 12.6M, range 2.8M–54.7M, over 14 closed records. Historical hand-run token cost remains absent. | [GOALS](../../GOALS.md), first measure | Directly verified document; aggregate not recomputed | Prior assessment O7 is superseded. This gives a closed-lane comparator, not proof of savings against hand-run builds. |
| O2. Lane 31 reports accepted in 0.9h; source and proof approved; cross-host suites passed; candidate cleanup 53ms versus baseline over five seconds. | [record](../../work/wr-2026-09-27-sealed-signal.record.md), [integration report](../../work/evidence/wr-2026-09-27-sealed-signal-integration.md) | Attributed reports, checked against each other | Concrete reliability progress, not current Lane 37 effectiveness; suites were not rerun. |
| O3. Lane 31 has no combined token aggregate and excludes discovery candidates as outside horizon. Its zero rework snapshot was immature; native stall classification was unavailable. | [retained JSON](../sealed-signal-1/reports/L31-build-census.json), [record](../../work/wr-2026-09-27-sealed-signal.record.md) | JSON null aggregate/exclusions directly verified; record limitations directly verified as stated | Neither a missing aggregate nor zero response gaps proves cheap, stall-free work. |
| O4. Claude wires 14 script/event pairs. Base Codex manifest routes five events through its existing adapter and has no PreToolUse or PostToolBatch entry; the adapter already supplies lead goal/bearings context. | [Claude manifest](../../../hooks/hooks.json), [Codex manifest](../../../hooks/codex-hooks.json), [adapter](../../../hooks/multi-codex-hook.mjs), base `8b8c2f0` | Directly verified | A checked coverage inventory addresses a real boundary. Different event manifests alone do not prove behavior absent or equivalent. Existing goal context must not be misreported as nonexistent. |
| O5. The bundle authorizes parallel lanes 34, 36, 37 and 38, and Lane 37 requires native scratch-home output plus a fresh Claude reviewer handoff. | [pinned bundle](pinned-spec.md), [territories](territories.md) | Directly verified specification | Scope serves two-host baseline; specification is not delivery evidence. |
| O6. Prior review reports lead cost down from 86.4M to 65.1M, still above its bound; owner resolved the earlier coordination STOP. Its next prediction is due September 29 at 3:00 PM America/New_York. | [prior assessment](prior-bearings.md) | Attributed report | Direction improved, but the next window has not matured. No new consecutive RE-PLAN state follows. |
| O7. Current census docs allow explicit --tasks rollout files subject to verification; the old Lane 31 diagnosis says --tasks was unsupported. Default discovery still uses the lead's UTC date and following date. | [current census contract](../../census.md), [historical diagnosis](../sealed-signal-1/reports/L31-census-diagnosis.md) | Directly verified document difference | Historical diagnosis cannot define today's entire contract. Current horizon documentation needs revision-aware claims; no census implementation audit was performed. |
| O8. Dispatch to ACK was about 2h28m at pickup, with no completed Lane 37 source or test evidence in the packet. | [packet](bearings-packet.md) | Attributed report | The existing three-hour bundle target is already pressured. ACK is not acceptance; no acceptance duration or cause of delay is invented. |

## Four-measure reading

- Top-tier tokens: a useful closed-lane baseline now exists (O1), but current complete cost and reviewer contribution remain unknown (O3). No saving claimed.
- Hours ask to accepted: Lane 31's reported 0.9h is real evidence of a completed lane, not a controlled comparison. Lane 37 dispatch delay pressures the bundle target (O2, O8).
- Rework after acceptance: no mature seven-day observation for the recent work; acceptance-time zero must stay provisional (O3).
- Work lost or stalled: cleanup behavior improved in Lane 31's reported proof; native stall attribution remains unavailable. Lane 37 coverage and handoff are a bounded next contribution, not proof of zero lost work (O2–O5).

## Reviewer assessment

1. **Have we made significant progress towards the goal?** Yes in capability and measurement truth: O1 corrects a baseline defect and O2 records a discriminating reliability result. Improvement across all four measures, and the full two-host DONE test, remain unproven. There is no new Lane 37 outcome yet.
2. **Have we gotten sidelined on some too-specific sub-project?** Lane 37 is appropriately specific: host coverage and a mixed handoff directly serve the stated agent-agnostic requirement (O4–O5). Scope creep into a census redesign or shared orchestration engine would be a sideline; neither is needed to finish this authorized lane.
3. **Have we spent time on a castle of patches instead of simplifying?** Prior evidence identifies recurring pickup/collector repairs (O6 and the prior assessment), so the risk remains. This lane's existing-adapter routing and one exhaustive inventory are a reasonable simplification of undocumented divergence, provided supported behavior is verified rather than inferred from manifest entries (O4–O5).
4. **Are we still building towards the simplest solution to the core problem?** Yes, conditionally: retain shared work and evidence contracts, use native adapters, and state unsupported behavior explicitly. Reuse the existing lead goal/bearings context, and document today's census boundary rather than copying a stale diagnosis (O4, O7).

## Ranked material gaps

| Priority | Gap | Impact | Confidence and reason for rank |
| --- | --- | --- | --- |
| 1 | Codex coverage lacks a checked complete disposition and the required Claude review handoff is still pending (O4–O5). | Lost/stalled work and two-host baseline cannot be assessed consistently. | High on manifest/spec gap; runtime equivalence unknown. Directly addressable by the active authorized lane, so it selects the next action. |
| 2 | Complete cross-host tokens and native stall attribution remain unavailable; historical census guidance differs from today's contract (O3, O7). | The four-measure improvement test cannot be fully evaluated. | High on retained evidence and document discrepancy; current coverage not measured. Preserve limits instead of broadening this build. |
| 3 | Pickup delay has consumed most of the bundle's three-hour target; accepted rework is immature (O8, O3). | Speed and quality comparisons may be optimistic. | Medium on delay, cause unknown. Closeout must use original timestamps and defer mature quality judgment. |
| 4 | Prior coordination cost remains over target and publication remains blocked (O6, O5). | Token objective and human-visible bearings completion remain unfinished. | Attributed cost; explicit publication deferral. Existing parallel owners and the scheduled prediction check address these. |

- Decision: CONTINUE.
- One next action / selected next build: finish the already authorized Lane 37 coverage slice through its existing adapter and checked supported/unsupported inventory, then carry its green artifact through the required Claude review handoff with a truthful four-number record.
- Selection rationale: priority 1 closes a concrete two-host evidence gap without adding a shared engine. This advisory is not code approval and does not itself authorize acceptance, installation or publication.
- Falsifiable prediction: the first Codex-led lane accepted after Lane 37 has zero unstated Claude script/event coverage gaps; evaluate its acceptance record against the parity inventory and linked native/handoff evidence. If no such lane has accepted by September 29, 2026, 3:00 PM America/New_York, report the prediction as not yet testable, not passed.
- Independently authorized work remains parallel: lane 34 pickup/publication recovery, lane 36 closeout, and lane 38 census markers. The prior project-level lane 36 priority is not rescinded by this Lane 37 advisory. Existing held lanes remain held under the pinned bundle.
- Missing evidence that could change the decision: unsupported reasons contradicted by native probes, new adapter state disproportionate to the benefit, failure of the mixed review handoff, or the next complete measurement window showing regression.

## Re-plan and publication

- Previous coordination STOP was resolved by the owner's collector choice, per the prior report. This is CONTINUE; no second ineffective RE-PLAN or new release/KILL trigger is established.
- Lead response: pending the lead's own accounting; this reviewer does not write it on the lead's behalf.
- Notion target: configured project Goals child page, `3e3da112-77a1-813c-b326-c42ed97a1d5d`.
- Publication: PUBLISHED at 2026-09-28 6:31:59 PM America/New_York by a fresh anchored `notion.js edit --safe`; readback verified one dated section and both candidate permalinks. Receipt: [Goals page](https://www.notion.so/3e3da11277a1813cb326c42ed97a1d5d).
- Completion inputs: assessment is `docs/specs/codex-parity-37/bearings-assessment.md`; lead response is `docs/specs/codex-parity-37/bearings-lead-response.md`; verified publication URL is the Goals page receipt above. Root attestation may record completion separately.

