Work: wr-2026-09-27-goals-one-line
Scope: docs/specs/goals-one-line-1/spec.md (the Lane 27 section of docs/specs/2026-09-27-decisions-render.md read at origin/docs/lane-specs-0925 952c6ef; full file copied as spec-full.md); one territory G1
Owner: skills-h
Status: reviewed
Authority: build, review, push build/goals-one-line-1, one live mirror step on the Goals page by anchored edits (never a line Ben wrote, publish stays disabled), and merge into main on acceptance under the standing grant of 2026-09-26, without Ben; no release or install
Artifact: build/goals-one-line-1@70e4c344fe90927ac87d401538ea8ea519325a6a
Evidence: docs/specs/goals-one-line-1/spec.md, docs/work/evidence/wr-2026-09-27-goals-one-line-G1.md, docs/work/evidence/wr-2026-09-27-goals-one-line-live.md, docs/work/evidence/wr-2026-09-27-goals-one-line-win-suite-cb555e6.log, docs/work/evidence/wr-2026-09-27-goals-one-line-win-suite-70e4c34.log, docs/specs/goals-one-line-1/reports/G1-r2-gate.log
Next: census, four-read, accept, merge into main with the Closed history bullet, RESULT to skills-fable
Opened: 2026-09-27T21:14:00.000Z
Lead-session: ad389ae1-f992-4dd3-8a19-2b51176675c1
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T21:00:00Z
Base: 854784ce841f726895006f094d02b1462fb341e0
Worktree: build/goals-one-line-1
Log: 2026-09-27T21:15:00Z owned skills-h ACK skills-h-goals-one-line-1 sent over ssh on ben-desktop with --sender-host zhuk-vps32, recorded in the Windows ledger; Goals page read fresh into docs/specs/goals-one-line-1/goals-page-live-before.md
Log: 2026-09-27T21:25:25Z delivered skills-h G1 builder (sonnet) DONE cb555e65cc2d70b2e845a2d90e3c55a98d146117, suite 2380 of 2384 0 fail, real GOALS.md renders with 0 refusals
Log: 2026-09-27T21:29:04Z delivered skills-h Windows suite at cb555e6 2382 of 2384, 0 fail, 2 skips; Opus review spawned
Log: 2026-09-28T02:16:28Z delivered skills-h Opus reviewer stalled 4.8 h (last tool call 2026-09-27T21:29:30Z, a scratch mutate.sh beginning with rm -rf, run through an escaped perl one-liner, never returned; the brief forbade deletion); stopped, no report written, worktree clean; fresh Opus reviewer spawned with a node-only mutation rule
Log: 2026-09-28T02:23:43Z rejected skills-h Opus review (opus) NEEDS_FIXES cb555e6 (M1 date column undated on 7 of 12 real goals, M2 vacuous reader test, L1-L5), findings docs/specs/goals-one-line-1/reports/G1-review.md; round 2 rulings in addendum-G1-r2.md
Log: 2026-09-28T02:31:12Z delivered skills-h G1 round 2 builder (sonnet) DONE 70e4c344fe90927ac87d401538ea8ea519325a6a, gate 2384 of 2388 0 fail 4 skipped (G1-r2-gate.log); Windows suite at 70e4c34 2386 of 2388, 0 fail, 2 skipped
Log: 2026-09-28T02:33:31Z reviewed skills-h Opus delta review (opus) APPROVE 70e4c344fe90927ac87d401538ea8ea519325a6a, docs/work/evidence/wr-2026-09-27-goals-one-line-G1.md
Log: 2026-09-28T02:37:08Z reviewed skills-h lead (opus) live mirror step: two --safe anchored edits on the Goals page (02:35:49Z marker plus table, 02:37:08Z old content under Detail), readback verified, HANDBACK ok on fresh reads, docs/work/evidence/wr-2026-09-27-goals-one-line-live.md

Observed: the real Goals page now opens on the marker callout and a one-line table, with columns State, Goal, Summary and Date and one row per goal. The old card and goal sections sit one tab deeper under a collapsed Detail toggle. It was done by two anchored --safe edits after fresh reads, with no line Ben wrote touched and no replace-md. HANDBACK ok. The suite is green on Hetzner and on Windows at 70e4c34. It took one NEEDS_FIXES round, because the date column was undated on 7 of 12 real goals and a reader test was vacuous. The first Opus reviewer stalled for 4.8 h on an rm -rf script, against its brief.
