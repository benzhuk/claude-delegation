Work: wr-2026-09-27-measure-truth
Scope: docs/specs/measure-truth-1/spec.md (read at origin 65a50a0) with lead rulings docs/specs/measure-truth-1/contracts.md; territories F1, F2, F3
Owner: skills-n
Status: reviewed
Authority: build, review, integrate, push build/measure-truth-1, and merge into main on acceptance under the merge-on-acceptance rule, without Ben
Artifact: ea149162b51537c283195e7f9a57edac7731fe3b
Evidence: docs/work/evidence/wr-2026-09-27-measure-truth-seam-review.md, docs/work/evidence/wr-2026-09-27-measure-truth-F1.md, docs/work/evidence/wr-2026-09-27-measure-truth-F2.md, docs/work/evidence/wr-2026-09-27-measure-truth-F3.md, docs/work/evidence/wr-2026-09-27-measure-truth-seam-review-r1.md, docs/work/evidence/wr-2026-09-27-measure-truth-windows-suite.md, docs/work/evidence/wr-2026-09-27-measure-truth-suites.md
Next: census, four-read, accept, merge into main
Worktree: build/measure-truth-1
Opened: 2026-09-27T08:32:15.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T08:19:00Z
Base: 380a666a85f937aa27c1b9ff59e9b92a083ee877
Log: 2026-09-27T08:32:15.000Z owned skills-n picked up skills-fable-measure-truth-1, ACK sent over ssh on ben-desktop, base 380a666
Log: 2026-09-27T08:35:31.000Z owned skills-n pack committed: contracts R1-R9 with fixture facts (lane fifteen post-fix keeps an offset Spec-from; lane sixteen's model gap is on a delivered line), trimmed session fixtures for lanes ten and sixteen; build loop launching
Log: 2026-09-27T10:53:51.000Z owned skills-n launch wf_8ecc2ee8-ad7: F3 APPROVE 6131258 (r1), F1 APPROVE b28254e (r2, Opus reviewer); the F2 r3 builder hung 64 min on an rm -rf permission prompt from 09:48Z with edits uncommitted; stopped, edits committed as 826485c, relaunched in given mode with startFrom NEEDS_FIXES against reports/lead-stall-note.md
Log: 2026-09-27T12:08:33.000Z owned skills-n relaunch wf_3afecf1c-1b4 ended BLOCKED: /tmp inodes exhausted by leftover sealed-home dirs, every shell ENOSPC; F2 r4 edits committed as 9b697ff (gate 94/94), Opus delta review APPROVE 9b697ff (reports/F2-review-round4.md); integration relaunched with F1, F2, F3 all APPROVE
Log: 2026-09-27T12:29:30.000Z owned skills-n F3 APPROVE 6131258 (r1, Opus reviewer: the loop pins delegation:reviewer to model opus); F2 APPROVE 9b697ff (r4, Opus reviewer); integrated by the lead at 4ff8d94 after the loop's integrator refused on seam order; seam Opus NEEDS_FIXES 4ff8d94 (reports/seam.md, the loop's reviewed line named no model), patches applied at ea14916, Linux suite 2089 of 2092 with 0 fail
Log: 2026-09-27T12:49:04.000Z reviewed skills-n seam Opus APPROVE ea149162b51537c283195e7f9a57edac7731fe3b after round 2 (reports/seam-round2.md); Windows suite 2092 of 2092, Linux 2089 of 2092 with 0 fail; four-read on the real fixtures: lane10 "1 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); agent a314563636ff6b931 silent 216.8 min from 2026-09-26T22:44:29.665Z", lane16 "0 gap(s) over 30min stalled; 1 waiting-on-agents (41.8 min)"

Predicts: accept refuses a record missing Spec-session, Spec-from in Z form, a one-sha Base, a model on review lines, or a stall count its own Log contradicts; four-read counts subagent stalls and stops counting a lead's wait on its own agents as stalled.

Observed: F1, F2 and F3 each Opus APPROVE (b28254e r2, 9b697ff r4, 6131258 r1). The lead integrated them at 4ff8d94, and they were fixed at ea149162b51537c283195e7f9a57edac7731fe3b after the seam review found that the build loop's own reviewed line named no model, so the new accept would have refused every loop-accepted record. Seam round 2 Opus APPROVE. Windows 2092 of 2092, Linux 2089 of 2092 with 0 fail. On the real sessions, four-read now counts lane ten's 216.8-minute builder silence as one stalled gap, and lane sixteen's 41.8-minute Workflow wait as waiting-on-agents rather than stalled. The suite leaves six /tmp/sealed-home dirs per run and never removes them: 451 of them exhausted Netcup's tmpfs inodes this morning, which stopped every shell for about 35 minutes.
