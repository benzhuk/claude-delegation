VERDICT: NEEDS_FIXES

Candidate: 34fd10c9a5510402a4b823a3247c6c189245589b (integrate/decisions-current), compared with main 78cb46e. Read-only source adjudication against revised E and supplied current requirements, September 23, 2026, America/New_York. No tests executed, no live reads/writes, no source edits, no release actions.

The prior approvals establish fidelity to an older contract. They do not establish readiness against the settled human-submit contract. Keep the useful parser/comment/config improvements, but do not merge or perform the proposed live whole-page publication as-is.

## Blocking findings

1. P1 — Done still means completion, not human submission.
   - skills/decisions/scripts/decisions-handback.mjs:43-51 requires checked at zero decisions and unchecked otherwise.
   - skills/decisions/scripts/decisions-read.mjs:183 recognizes only exact `Done`; :373-377 ignores doc.done when computing actionable exit status.
   - skills/decisions/SKILL.md:61-65 directs agents to uncheck when adding items and check when the last item closes.
   Regression: an accounted empty page with unchecked Done is rejected, a partial human submission is called a mismatch, and checking Done alone on otherwise OPEN items still yields reader exit 0. A timestamp-suffixed Done becomes an ordinary option or disappears as a nondecision, rather than submission metadata. Current tests explicitly assert the opposite of the required empty-page behavior.
   Required fix: migrate parser, handback, instructions, fixtures and spec together. Human checks to submit; agent accounts the captured input before clearing with actual last-cleared time. Permit unchecked empty pages and partial submissions; recognize supported timestamp labels and explicitly migrated bare Done. Do not conflate options/comments/default warnings with submission identity. Add regressions for those cases and for later checked-content changes. Done must not confer blanket authority.

2. P1 — Goals publication can destroy edits made after the supplied read.
   - skills/decisions/scripts/goals-mirror.mjs:289 loads only the local --current file; :300 checks notes in that old snapshot; :316 invokes the publisher; :199-202 dispatches `notion.js publish`, a whole-page replacement.
   - skills/decisions/SKILL.md:50-52 expressly exempts this operation from the anchored-edit rule.
   Regression: capture a clean Goals page, human adds a note/choice/native comment-associated content, run publish with the captured file; no new read or targeted preservation occurs before the replacement. The --current file is also not bound to the actual selected child page: any suitably shaped mirror snapshot passes. The absence probe fixes a trivial bypass but does not make page creation atomic.
   Required fix: retain pure rendering; update existing pages using fresh reads and targeted edits of agent-owned sections with stable page identity. Preserve surrounding human content, use readback/backups, reconcile uncertain writes before retry. Test a later human edit and wrong-page snapshot; refuse rather than silently replace. Exact-anchor edits are useful but are not page-wide CAS, and must not be advertised as eliminating identical uncheck/recheck ambiguity.

3. P2 — Disabled gate returns the same success exit required for handback.
   - skills/decisions/scripts/decisions-handback.mjs:366 returns 0 on a blocked result when a switch is active, while printing HANDBACK blocked.
   - skills/decisions/SKILL.md:161 instructs handback on exit 0 only, and :165-169 expects the clean summary that this path never prints.
   Regression: create ws-off-decisions and supply a known defective page; documented caller sees success despite the gate not passing. Existing tests deliberately assert it. Output is not falsely labeled ok, but the executable success contract is ambiguous and the prose is inconsistent.
   Required fix: distinguish disabled/not-enforced from verified clean and make the actual handback rule require explicit HANDBACK ok plus summary (or use a distinct exit status). Add a caller-level disabled-gate regression. Disabling enforcement must not manufacture verification evidence.

4. P1 — Included goal rewrite drops agreed measurement definitions and introduces unreconciled policy.
   - docs/GOALS.md:9 replaces the aim plus the four-measure table and decision-rule explanation from main; all four explicit definitions/baselines/reading locations disappear.
   - docs/goals/card.md:2 says the best plan goes to every machine at once; :3 supplies a new DONE; :4 changes the KILL condition from a mechanism without measurement to a goal without mechanism and retains a provider-specific Fable budget shorthand.
   The revised D1/E integration requires preserving the four measures and reconciling the lead's current rewrite, not silently adopting this older replacement. These content changes are not necessary for the reader/mirror feature. Required fix: exclude this stale goal/card rewrite from the release candidate or reconcile it in a concrete reviewed diff against the current mandate, retaining measures and histories. Neither all-machine rollout nor these revised acceptance/KILL statements follow merely from decisions-page authorization.

## Useful improvements and bounded remaining scope

- The current mirror ownerNoteLines directly inspects unreplied comments on every decision status, so TICKED does not hide them. rawNoteLines additionally blocks marked lines outside ordinary parser coverage. The positive absence probe rejects --current none when a Goals child exists. These older T2 findings are fixed in source, not fresh installed proof.
- Mirrored Codex copy now fails closed when project-config discovery is unknown and no goals read is supplied; explicit --goals still runs the full checks. The seam report contains scratch-copy evidence. This is useful compatibility work.
- Shape checking still only recognizes `Waiting on you now` or no heading (handback:81). This is compatible with the branch's prescribed headings; it is not a separate regression while those headings remain. Any adoption of To Decide must extend/test this check rather than just changing display text.
- Shared parser/handback contracts are reusable by either host; a Node executable or ~/.claude local helper path does not itself make semantics Claude-only. However SKILL.md:141 requires a Sonnet runner, and no real Codex/Claude discovery/execution or mixed-owner live evidence was supplied. Make runner guidance host-neutral, keep installed capability gaps explicit. Do not demand a new universal adapter framework.
- Native Notion comments and literal-star lines are distinct. These scripts demonstrate only the literal-star parsing path; no native-comment retrieval/accounting is implemented or tested here. A Reply date proves only a textual reply exists, not that an instruction was executed.
- No unattended pickup, receipt/replay protection or configured owner invocation exists in this delta; the spec explicitly excludes hooks/timers. An attended slice can ship independently after the blockers, but it cannot be accepted as revised E4 or the full two-host baseline. Reuse existing packet/ledger receipts when that separate slice is built.

## Verification evidence and release disposition

Read the supplied release handoff, revised E, docs-review, actual Git delta/source, integrate-report.md, seam-findings-r3.md and seamfix-report-r3.md. Earlier integration report claims plain AND sealed 1272/1272 at e81bac1. Final builder report claims plain 1286/1286 at 34fd10c, 213 focused tests, fixture equality; final seam review reports focused 213/213, scratch mutation discrimination and Codex-copy checks. I did not independently rerun any of these. The inspected final reports do not establish a final sealed 1286/1286 run; do not extend the earlier sealed result to a different candidate without its log.

Gate 5 is explicitly NOT RUN. Current approvals bind the old spec, and final seam approval examines three prior findings; neither resolves the current semantic incompatibility or stale-snapshot race. After the fixes, run inherited focused tests through scripts/run-tests.mjs, independently review the new candidate, then use applicable release authority and a safe attended live smoke. No prior green count substitutes for these requirements.

Cleanup: no agents, processes, worktrees or temporary source copies created by this audit. Only this report was written.
