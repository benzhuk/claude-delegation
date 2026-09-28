Work: wr-2026-09-28-render-readback
Scope: docs/work/wr-2026-09-28-render-readback.record.md specification below, based on origin/main@926c6f801ce21383b06bd5f92ffb18b5ca2603bc and skills-fable-lane-48-1
Owner: skills-a
Status: delivered
Authority: Lane48 dispatch under the standing build/merge grant; normal renderer publication is the required live proof. Comparison function and tests only. No release, install, manual page write, pickup change or adoption workaround. Root alone writes this record.
Artifact: 2e3cb7135fff6e5961c001bffc30e73829d4a011
Worktree: C:/Users/benzh/orca/workspaces/claude-delegation/render-readback-48
Evidence: docs/specs/render-readback-48/L48-spec-evidence.md
Evidence: docs/specs/render-readback-48/L48-builder-report.md
Evidence: docs/specs/render-readback-48/L48-test-report.md
Evidence: docs/specs/render-readback-48/L48-opus-r1.md
Evidence: docs/specs/render-readback-48/L48-host-gates-r1.md
Next: same-Opus delta review and fresh sealed host gates on the byte-preserving candidate, then census/accept, merge and normal live publish. Set Artifact to the exact approved candidate at acceptance.
Lead-session: 01a0df4c-2809-7520-b1d7-876cc51a87ee
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-28T23:12:00Z
Base: 926c6f801ce21383b06bd5f92ffb18b5ca2603bc
Opened: 2026-09-28T23:13:00Z
Log: 2026-09-28T23:14:00Z owned skills-a ACKed lane48 and assigned GPT-5.6-Terra scout; original dispatch clock retained
Log: 2026-09-28T23:22:07.002Z owned skills-a dispatched independent GPT-5.6-Terra lane48_tests and GPT-5.6-Terra lane48_builder with disjoint file ownership; production waits for baseline-red evidence
Log: 2026-09-28T23:31:00Z delivered skills-a resumed ownership after GPT-5.6-Terra builder and independent GPT-5.6-Terra test author reported final scoped 145/145 native exit0; exact snapshot regression first failed on unchanged source. Final production blob feda39eb9dcfa4e171bee06547846916afd10bb1. Opus review and host/live proof remain pending.
Log: 2026-09-28T23:35:00Z reviewed skills-a Claude Opus 5.5 reviewer lane48-review returned NEEDS_FIXES at 4d6c940849f4c48264e0f05071bfd2b667e745c3 via skills-fable-lane-48-4. Normalizer passed adversarial checks, but Git converted pinned CRLF fixtures to LF. Same reviewer will inspect the repaired artifact; no acceptance occurred.
Log: 2026-09-28T23:38:00Z rejected skills-a both full host gates failed at 4d6c940849f4c48264e0f05071bfd2b667e745c3. Netcup reproduced fixture hash failure; Windows failed the unrelated backlog advisory assertion. Test author owns byte-preserving fixture attributes, integrator diagnoses Windows. Initial local WSL absence and remote Node PATH failures are retained setup errors, not test passes or permission denials.
Log: 2026-09-28T23:42:00Z delivered skills-a resumed ownership from GPT-5.6-Terra test author. Fixture-local attributes now preserve the exact original CRLF Git blobs. Fresh checkout of 6a12e9cb7aa8d9f32e77073e9cf79920eafdc43e passed 145/145 with original hashes; base normalizer still reports unequal on these bytes. Remediation source commit79d08ef84054b6345256a9e1ed4c6172acd444a6, proof report2e3cb7135fff6e5961c001bffc30e73829d4a011. Same reviewer delta and both full hosts remain required.

Scratch: C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/render-readback-48

Measure: rework after acceptance, specifically manual recovery after normal decisions publication.
Predicts: the required normal publish exits0 without adopt-live and records its pushed bookkeeping commit; the next three lane closes need zero whitespace-recovery publishes.
Observed: Lane37 normal publish exited5 after writing correct content. Fresh read versus intended render differs only by one blank line after a closing details tag. Independent exact-snapshot comparison is red before the fix and green after it, with substantive differences retained, but the first 145/145 receipt was from a working tree whose CRLF fixtures Git had stored as LF. Opus and Netcup exposed that packaging defect on fresh checkouts; repair is required before acceptance. Windows also failed a backlog advisory assertion, with a load-sensitive deadline the integrator's current hypothesis. Normal live publication remains unproved. Peer packet reports three prior recovery publishes as the attributed baseline, not a new measurement by this lane.

## Specification and pinned contract

Normalize the actual saved render/read pair identically while preserving meaningful changes. Existing public API normalize(text) -> string is already committed; no interface or new contract stub is needed. The pure normalize function lives in skills/decisions/scripts/decisions-render-core.mjs and is re-exported by decisions-render.mjs. All drift, pre-write-backup and readback comparisons use that same function. The dispatch's monolithic filename is interpreted as this extracted comparison function; extraction provenance was stated in ACK skills-a-lane-48-1.

Inputs are the exact Lane37 snapshots main-merge-r2-decisions-intended-publish-render.md and main-merge-r2-decisions-live-after-exit5.md under its retained scratch root. Copy their bytes into this lane's test fixtures and record hashes. The proven delta is the sequence closing details tag, empty line, next block versus closing details tag immediately followed by the next block. Ignore that separator only in structural details context, not a literal tag inside fenced code or substantive paragraph content. The existing final-newline normalization remains sufficient. Do not generalize to callout separators unless the pinned snapshots demonstrate that difference. Keep existing whitespace behavior elsewhere.

Independent tests must show the exact snapshot comparison red on the pinned base and green after the fix. Removing a bullet, changing an unchecked tick to checked, or moving a content line must remain unequal. A literal fenced closing-details tag must not gain the new whitespace exemption. Exercise the actual shared comparison used by publisher and its regression suite, not a parallel test-only normalizer. Fix the cause at the existing comparison; no retry, new state, new writer, timeout change or manual page repair.

## Territory and execution

Production builder owns only normalize and its immediately adjacent contract comment in skills/decisions/scripts/decisions-render-core.mjs. Independent test author owns comparison tests in skills/decisions/scripts/decisions-render.test.mjs, readback regressions in decisions-render-publish.test.mjs, and their snapshot fixtures under skills/decisions/scripts/fixtures/render-readback-48. Both may write their named reports under docs/specs/render-readback-48. Root owns this record and briefs. No changes to render composition, title/autolink guards, pickup, adopt-live semantics, notion.js, waiting items, test runner, or census reader. Lane39 owns its entrypoint import/call; fetch latest main and preserve it before merging. No docs/census marker change is needed.

GPT-5.6-Terra builds; a Claude Opus reviewer requested through skills-fable reviews the green exact artifact. This small single-function build uses its explicit pinned contract and one high-tier implementation review; no separate spec-red-team stage. Every denial stops that step with the verbatim error, never a retry through a different tool/shell. Windows uses process-owned Global\claude-verify, one actual-suite preflight and <=60s acquisition. Netcup uses the persistent regular /tmp/claude-verify.lock via flock on an open descriptor, never mkdir or file deletion. Remote TMPDIR/TMP/TEMP must be a short lane-specific root to avoid Unix socket path overflow. One full suite per changed candidate per host; no unchanged failed-suite rerun.

## Acceptance and close

Record the red/green proof, Opus exact-SHA approval and both sealed host receipts. Run the actual native lead census plus Claude spec slice after final review, preserving partial horizon coverage and unavailable measures. Use the documented visible no-census route only if the actual report is partial, and pass actual four-read output. Snapshot generated measurement evidence with format-only OBSERVED wrappers when required by closure validation; preserve raw output.

Accept reviewed source before merge under the standing workflow. Fetch latest origin/main, merge with one plain closing history bullet in the merge commit, and run the sealed Windows suite on the exact merge commit before push when it is a new tree. The post-merge efficacy gate is one normal decisions-render publish from clean current main on Windows, no recovery/adopt-live flags, exit0 and its pushed bookkeeping commit retained. Only after that proof, close through work-record close and send one RESULT. A fresh owner input or unexpected refusal remains a real dependency, never permission to bypass guards.

## Provenance and retained limits

Packet Spec-from23:15Z was incorrect and postdated dispatch. skills-a-lane-48-2 asked for correction; skills-fable-lane-48-2 confirms actual spec start2026-09-28T23:12:00Z, not a later revision. Opened remains23:13Z. Scratch stays in the record body because the current parser does not support that header. The published independent CONTINUE bearings assessment for the unchanged goal is current (Lane37 receipt verified at pickup); it does not imply source approval or measured savings. Codex has no Workflow tool; this is the authorized manual sequence with a mixed Claude review handoff.
