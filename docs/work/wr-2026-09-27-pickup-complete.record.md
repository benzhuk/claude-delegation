Work: wr-2026-09-27-pickup-complete
Scope: docs/specs/pickup-complete-1/spec.md (written at 78bf171) with lead rulings docs/specs/pickup-complete-1/contracts.md; territories P1, P2, P3
Owner: skills-n
Status: owned
Authority: build, review, integrate, push build/pickup-complete-1, merge into main on acceptance under the merge-on-acceptance rule without Ben, then reconcile round 1 and add the topic on the Netcup pickup host
Next: build loop P1, P2, P3
Opened: 2026-09-27T13:37:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-from: 2026-09-27T13:42:17Z
Base: 78bf171d247352fbb43601dc48db5ba2f68df631
Log: 2026-09-27T13:37:00.000Z owned skills-n picked up skills-fable-decisions-title-1 bundled with skills-fable-decisions-pickup-netcup-3, ACK sent over ssh on ben-desktop, base 78bf171
Log: 2026-09-27T13:44:05.000Z owned skills-n pack committed at cf007ef: rulings C1-C5 (owner-input multiset, title format, topic, Bearings headings, title CLI and hand-back check). Build loop launching
Log: 2026-09-27T14:27:14.000Z owned skills-n launch wf_654ba052-163: P1 APPROVE 08151bf (r3, Opus reviewer), P2 APPROVE bb0c91a (r1, Opus reviewer), P3 APPROVE b62e612 (r2, Opus reviewer); integrated at 80cd701, integrator FAIL on two tests (the symlink CLI test spread its own env, and the archive contract handback call had no --title-meta), fixed by the lead at 578ec5c, Linux suite 2162 of 2165 with 0 fail; seam Opus review running

Predicts: an edit by the lead while Done is ticked no longer kills the Done-tick wake, the stuck round 1 can be accounted, Bearings sections stop blocking pickup and hand-back, and the page title carries topic and last change.
