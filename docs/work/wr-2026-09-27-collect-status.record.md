Work: wr-2026-09-27-collect-status
Scope: docs/specs/collect-status-1/spec.md (skills-fable's spec, origin/docs/lane-specs-0925 at 02b6156) with lead rulings docs/specs/collect-status-1/contracts.md; territories C1, C2, C3
Owner: skills-n
Status: reviewed
Authority: build, review, integrate, push build/collect-status-1, merge into main on acceptance under the merge-on-acceptance rule without Ben, and install the collect job on Netcup on acceptance under Ben's tick of option (b) (decisions round 2)
Artifact: ccac310874957b2f21525bc6c3f518dd1713e052
Evidence: docs/work/evidence/wr-2026-09-27-collect-status-seam-review.md, docs/work/evidence/wr-2026-09-27-collect-status-C1.md, docs/work/evidence/wr-2026-09-27-collect-status-C2.md, docs/work/evidence/wr-2026-09-27-collect-status-C3.md, docs/work/evidence/wr-2026-09-27-collect-status-seam.md, docs/work/evidence/wr-2026-09-27-collect-status-suites.md
Next: census, four-read, accept, merge into main, then the Netcup install as the live proof
Worktree: build/collect-status-1
Opened: 2026-09-27T18:22:46.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T18:20:00Z
Base: 44118f4fc0175993909851d08b2cdfe8b6ed000d
Log: 2026-09-27T18:22:46.000Z owned skills-n picked up skills-fable-collect-status-1, ACK sent over ssh on ben-desktop, base 44118f4
Log: 2026-09-27T18:23:35.000Z owned skills-n pack committed: spec copied from 02b6156, rulings K1-K3 (paths, note, installer). Build loop launching
Log: 2026-09-27T19:15:41.000Z owned skills-n launch wf_58db5277-9a9: C1 APPROVE ed9d8ca (r2, Opus reviewer), C2 APPROVE 6b08cec (r3, Opus reviewer), C3 APPROVE 3707afa (r2, Opus reviewer); integrated at 1542f8c, integrator PASS 2345 of 2349 with 0 fail, seam r1 Opus APPROVE 1542f8c with five minors; accept-prep refused the record, which had no Artifact line yet
Log: 2026-09-27T19:25:01.000Z reviewed skills-n seam Opus APPROVE ccac310874957b2f21525bc6c3f518dd1713e052 after two delta rounds: the lead applied seam m1 (K2 allowlist, now enforced and tested) at 121eb52, and made three path-literal tests portable after Windows failed them, at ccac310; Linux 2346 of 2350 with 0 fail, Windows 2348 of 2350 with 0 fail

Predicts: the lead reads one status file per wave instead of answering each lane event, so top-tier tokens and turns per day fall toward 40M and 200 in the 2026-09-28 census window.

Observed: C1, C2 and C3 each Opus APPROVE (ed9d8ca r2, 6b08cec r3, 3707afa r2), the integrator passed 1542f8c, and seam round 1 approved it with five minors. The lead applied m1 because it was the lead ruling K2 left unenforced: a state token outside collect-from-origin names now reaches the note only as other, and a new test fails without the fix. Windows then failed three tests that build POSIX literal paths, all in test code. The defaultOutDir expectation now uses path.join, and the two systemd-text tests are skipped on win32, where the systemd generator is never chosen. Seam delta reviews approved 121eb52 and ccac310874957b2f21525bc6c3f518dd1713e052. Linux 2346 of 2350 with 0 fail, Windows 2348 of 2350 with 0 fail. Minors m2 to m5 are left as follow-ups: an absolute --out inside the repo, control characters in --host or --repo predating this lane, --every 46 to 60 against the 2700 s wiring window, and no cross-territory test. The live proof is the Netcup install after the merge.
