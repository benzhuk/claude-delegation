VERDICT: ACCEPTED dad15f870d839f3fceaf4f6c2cb0f3d58b81fa3e

# Codex-led parity build — skills-a / Astra

Delivery branch: `build/codex-parity-1`. Reviewed source: `dad15f870d839f3fceaf4f6c2cb0f3d58b81fa3e`. Subsequent delivery commits contain evidence and work-record metadata only. No merge into main, installation, Notion write or parity release bump was performed. Main's released 0.20.8 manifest versions were merged into this branch as requested.

## Delivered behavior

- P1: Claude and Codex use one shared goal-card and bearings-notice helper. Verified Codex leads receive the shared content on existing SessionStart and UserPromptSubmit events, respecting the existing switches. Unknown identity adds no new goal context; confirmed children are excluded. Existing peer and continuation output is preserved. No new event, scheduler, state store or renderer was introduced.
- P2: the census validates and deduplicates verified Codex response-local usage. Complete response coverage, conversational leadTurns, model attribution and child usage remain explicitly unsupported. Diagnostic observations are labeled separately. Acceptance refuses an UNSUPPORTED report and explains the explicit no-census route.
- P3: native-use, bearings and changelog documentation describe current install routes, exact event and switch behavior, and the boundary between source tests and installed evidence.
- The two original census-review defects are repaired upstream and integrated: unreadable default directories cannot become confident zeros, and unrelated future-dated labels cannot make stale evidence fresh.

## Independent review and acceptance

Codex mid-tier builders worked in three separate territories. Claude high-tier reviewers, coordinated by skills-o, reviewed every territory. A fresh Claude reviewer independently checked the integration and its final delta.

| Evidence | Approved artifact |
| --- | --- |
| [P1 final review](codex-parity-p1-review-final.md) | f0f32e91209101ec3886cbb77c6e7c4cf887defe |
| [P2 final review](codex-parity-p2-review-approved-db5ae5c.md) | db5ae5c714861648f6ce1481eefae230c94e26ff |
| [P3 final review](codex-parity-p3-review-final.md) | 6311556cc17c62d364d056a595f3c2fe3a71b150 |
| [Final seam review](codex-parity-seam-final.md) | dad15f870d839f3fceaf4f6c2cb0f3d58b81fa3e |

The parent and all three child records passed `check-acceptance` and were changed to accepted by `work-record.mjs accept`. Parent/P1/P2 deliberately pin dad15f8; P3 pins its approved documentation commit, retained in its worktree and integrated into dad15f8. Each records an explicit no-census reason. Parent acceptance occurred September 25, 2026, at 10:01:45.637 America/New_York.

## Verification and the failed run

The [final bounded sealed gate](codex-parity-bounded-full-gate.md) passed **1562/1562**, with no skips or cancellations, in 77.75 seconds. A temporary copy of the canonical sealed runner used four test workers, the original complete discovery list and unchanged sealing, canary and failure handling. The three temporary-runner differences are documented in that report; no repository runner or deadline was changed.

The preceding default-concurrency full run passed 1561 and failed the existing Windows npm-shim D5 test after 5845.8 ms against its 5000 ms child deadline. The same file then passed 73/73 in isolation, with D5 taking 269.7 ms. Scheduling pressure is plausible; the original child diagnostic was not retained, so the cause is not proven. Both the [failure](codex-parity-default-full-failure.md) and [triage](codex-parity-d5-triage.md) are retained. This delivery does not claim that the final source passed the default-concurrency full runner.

Independent composition checks covered 378 Codex cases and 180 Claude cases across review rounds. Final contract and original-census regression probes passed. Review mutation checks confirmed that the new optional-bearings and UNSUPPORTED-acceptance tests detect their intended failures.

## Measurement

- Admission to acceptance: **44 minutes 22.278 seconds**, from the parent record's Opened time to its successful acceptance log. Exact spec-to-acceptance duration is unknown because the spec has no precise timestamp.
- Builder iterations before final seam corrections: P1 **3**, P2 **5**, P3 **4**. One final parallel correction round closed all three low-severity seam findings. These are builder iterations, not a claim that every iteration received a separate full review.
- [Observed usage snapshot](codex-parity-observed-usage.md): September 25, 2026, 09:16:54–09:58:34 America/New_York, **161 observed response requests**, **1 observed native turn ID**, and **21,971,145 observed tokens including cached tokens**. These observations do not establish conversational leadTurns, complete build spend, child cost or a final acceptance total. No cost or speed improvement over an earlier build is claimed.
- Reviewer prose timestamps are not used for elapsed-time measurement. Record and ledger timestamps provide the timing evidence.

## Rollout limits and operational follow-up

No installation or fresh native startup observation was performed. Startup delivery remains conditional on verified native lead metadata. The existing asynchronous hook budget cannot preempt synchronous filesystem operations; the pre-existing unref timer limitation is also unchanged. One nonblocking review nit remains: the new acceptance seam test leaves a small scratch directory.

During review, two unsealed filesystem-spy runs used a fixture session ID that matched this actual root session and wrote its real continuation store. Its native status was observed suspended; rebinding returned EPISODE_INACTIVE. No state was manually repaired and no native epoch was fabricated. P1 now isolates both goal and continuation environments; independent review verified zero real-home accesses. Automatic completion-check enforcement is not claimed active for this session. A fresh verified native episode is required before rebinding. This incident and the census observation limits were captured in the shared knowledge inbox.

Next owner: skills-fable for merge assessment and an installed Codex pilot with real native startup/prompt evidence. This closes the finite Codex-led source build and cross-provider review/acceptance exercise; it does not establish that all harness goals are achieved.
