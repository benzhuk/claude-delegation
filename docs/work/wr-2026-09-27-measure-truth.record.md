Work: wr-2026-09-27-measure-truth
Scope: docs/specs/measure-truth-1/spec.md (read at origin 65a50a0) with lead rulings docs/specs/measure-truth-1/contracts.md; territories F1, F2, F3
Owner: skills-n
Status: owned
Authority: build, review, integrate, push build/measure-truth-1, and merge into main on acceptance under the merge-on-acceptance rule, without Ben
Next: build loop F1, F2, F3
Opened: 2026-09-27T08:32:15.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T08:19:00Z
Base: 380a666a85f937aa27c1b9ff59e9b92a083ee877
Log: 2026-09-27T08:32:15.000Z owned skills-n picked up skills-fable-measure-truth-1, ACK sent over ssh on ben-desktop, base 380a666
Log: 2026-09-27T08:35:31.000Z owned skills-n pack committed: contracts R1-R9 with fixture facts (lane fifteen post-fix keeps an offset Spec-from; lane sixteen's model gap is on a delivered line), trimmed session fixtures for lanes ten and sixteen; build loop launching
Log: 2026-09-27T10:53:51.000Z owned skills-n launch wf_8ecc2ee8-ad7: F3 APPROVE 6131258 (r1), F1 APPROVE b28254e (r2, Opus reviewer); the F2 r3 builder hung 64 min on an rm -rf permission prompt from 09:48Z with edits uncommitted; stopped, edits committed as 826485c, relaunched in given mode with startFrom NEEDS_FIXES against reports/lead-stall-note.md

Predicts: accept refuses a record missing Spec-session, Spec-from in Z form, a one-sha Base, a model on review lines, or a stall count its own Log contradicts; four-read counts subagent stalls and stops counting a lead's wait on its own agents as stalled.
