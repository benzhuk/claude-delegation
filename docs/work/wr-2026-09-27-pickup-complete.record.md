Work: wr-2026-09-27-pickup-complete
Scope: docs/specs/pickup-complete-1/spec.md (written at 78bf171) with lead rulings docs/specs/pickup-complete-1/contracts.md; territories P1, P2, P3
Owner: skills-n
Status: reviewed
Authority: build, review, integrate, push build/pickup-complete-1, merge into main on acceptance under the merge-on-acceptance rule without Ben, then reconcile round 1 and add the topic on the Netcup pickup host
Artifact: 69efa39a48713d088cae349b48d22dce79dd5468
Evidence: docs/work/evidence/wr-2026-09-27-pickup-complete-seam-review.md, docs/work/evidence/wr-2026-09-27-pickup-complete-P1.md, docs/work/evidence/wr-2026-09-27-pickup-complete-P2.md, docs/work/evidence/wr-2026-09-27-pickup-complete-P3.md, docs/work/evidence/wr-2026-09-27-pickup-complete-seam-review-r1.md, docs/work/evidence/wr-2026-09-27-pickup-complete-suites.md
Next: census, four-read, accept, merge into main, then reconcile round 1 and add the topic on Netcup
Worktree: build/pickup-complete-1
Opened: 2026-09-27T13:37:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-from: 2026-09-27T13:42:17Z
Base: 78bf171d247352fbb43601dc48db5ba2f68df631
Log: 2026-09-27T13:37:00.000Z owned skills-n picked up skills-fable-decisions-title-1 bundled with skills-fable-decisions-pickup-netcup-3, ACK sent over ssh on ben-desktop, base 78bf171
Log: 2026-09-27T13:44:05.000Z owned skills-n pack committed at cf007ef: rulings C1-C5 (owner-input multiset, title format, topic, Bearings headings, title CLI and hand-back check). Build loop launching
Log: 2026-09-27T14:27:14.000Z owned skills-n launch wf_654ba052-163: P1 APPROVE 08151bf (r3, Opus reviewer), P2 APPROVE bb0c91a (r1, Opus reviewer), P3 APPROVE b62e612 (r2, Opus reviewer); integrated at 80cd701, integrator FAIL on two tests (the symlink CLI test spread its own env, and the archive contract handback call had no --title-meta), fixed by the lead at 578ec5c, Linux suite 2162 of 2165 with 0 fail; seam Opus review running
Log: 2026-09-27T14:36:18.000Z reviewed skills-n seam Opus APPROVE 69efa39a48713d088cae349b48d22dce79dd5468 after round 2 (reports/seam-round2.md); round 1 NEEDS_FIXES 578ec5c found the fresh-title fixtures read the wall clock and go red in the fall-back hour, plus the bare page id in SKILL.md, both fixed at 69efa39; Linux suite 2162 of 2165 with 0 fail, Windows 2165 of 2165

Predicts: an edit by the lead while Done is ticked no longer kills the Done-tick wake, the stuck round 1 can be accounted, Bearings sections stop blocking pickup and hand-back, and the page title carries topic and last change.

Observed: P1, P2 and P3 each Opus APPROVE (08151bf r3, bb0c91a r1, b62e612 r2). The integrator failed the merged head 80cd701 on two tests that no territory's own gate ran: P1's symlink CLI test spread the runner environment itself (the N2 seal in hooks.test.mjs), and the archive contract's hand-back call had no --title-meta, which P3 made required. The lead fixed both in the test files at 578ec5c. The seam review then found that the fresh-title fixtures read the wall clock, so the suite would go red in every US fall-back hour (17 tests on 2026-11-01 at 01:30 EST), and that SKILL.md named decisions_url where decisions-title.mjs takes only a bare id. Both were fixed at 69efa39a48713d088cae349b48d22dce79dd5468, and seam round 2 approved it after rerunning the shifted-clock check. Linux 2162 of 2165 with 0 fail, Windows 2165 of 2165. Still to do after the merge: reconcile and account the stuck round 1 on Netcup, and add the Skills topic.
