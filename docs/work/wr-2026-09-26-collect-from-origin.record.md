Work: wr-2026-09-26-collect-from-origin
Scope: docs/specs/collect-from-origin-1/spec.md (read at origin/docs/lane-specs-0925 ce7ca65) with lead rulings docs/specs/collect-from-origin-1/contracts.md; territories C1 (collector script, test, docs/census.md) and C2 (team-build and decisions skills, decision-item template)
Owner: skills-n
Status: rejected
Authority: build, review, integrate, push build/collect-from-origin-1 on green, and post its merge item to Ben's decisions page, without Ben; merge to main waits for Ben's word
Artifact: none yet
Evidence: docs/notes/skills-fable-collect-from-origin-1.md (ASK packet, main checkout)
Next: one launch of the one-launch script (build/one-launch-1 at 55106db), setup mode, then accept
Opened: 2026-09-26T12:12:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-26T08:11:46-04:00
Base: ac9c842+05b9bcc
Log: 2026-09-26T12:16:00.000Z owned skills-n launch dispatched, setup mode, script frozen from build/one-launch-1 55106db; ACK sent from Netcup over ssh on ben-desktop (Windows ledger)
Log: 2026-09-26T12:22:00.000Z owned skills-n first launch (wf_63e2ed2a-6c7) stopped seconds in, before setup created anything, on skills-fable's base ruling; relaunched on the local merge of ac9c842 and 05b9bcc
Log: 2026-09-26T13:30:00.000Z rejected skills-n launch wf_b9df59bc-46c returned: C2 APPROVE r2 at 1468a63 (merged, head 297d593); C1 NEEDS_FIXES(1) after 3 rounds at 0bf8be8, only F4 (77 runtime lines vs pinned 60); integrator sealed suite no-new-failure PASS, dogfood blocked because C1 was excluded
Log: 2026-09-26T13:35:00.000Z owned skills-n lead ruling docs/specs/collect-from-origin-1/reports/C1-lead-ruling-r4.md: 60-line pin WAIVED at real size, layout-only fix round; relaunch with C1 startFrom NEEDS_FIXES, C2 startFrom APPROVE

Observed: pending.
