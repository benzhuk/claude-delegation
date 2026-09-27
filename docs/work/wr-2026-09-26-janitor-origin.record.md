Work: wr-2026-09-26-janitor-origin
Scope: docs/specs/2026-09-26-janitor-origin-truth.md@b786916 (origin/docs/lane-specs-0925)
Owner: skills-o
Status: reviewed
Authority: skills-fable ASK skills-fable-janitor-origin-1: build, review, push build/janitor-origin-1, merge on acceptance under the lane eight rule. No install, release, Notion.
Artifact: build/janitor-origin-1@70f639bae113d97c1577fb3c3f86eb55825d6430
Worktree: build/janitor-origin-1
Evidence: docs/work/evidence/wr-2026-09-26-janitor-origin-J1-review-r2.md
Next: merge to main under the lane eight rule and post the Closed entry
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Base: c3f9ad0b0f9682d2de52c8e4ea8adcc6ee7877e7
Opened: 2026-09-27T02:21:04Z
Log: 2026-09-27T02:21:04Z owned skills-o base c3f9ad0b0f9682d2de52c8e4ea8adcc6ee7877e7 contains lane five bbd9f5d; start delayed 3.5 h because the lead's watch for that merge was killed for low memory at about 18:50 NY and the merge landed at 18:58
Log: 2026-09-27T03:23:26Z delivered skills-o J1 builder 6c9bc85, gate 107/107, full suite 1804/1804 on Windows; changed existing test: 'source never contains a destructive git verb' now allows exactly one sanctioned branch -D site; Spec-from removed, the lead had estimated it (not known)
Log: 2026-09-27T03:43:52Z rejected skills-o Opus review r1 NEEDS_FIXES on 6c9bc85: --no-fetch --apply reaches -D without this run's fetch; -D deletes a tip moved after the check. Netcup suite PASS 1799/1804 (H6, V4 expected, 3 skipped)
Log: 2026-09-27T04:42:23Z reviewed skills-o Opus APPROVE 70f639bae113d97c1577fb3c3f86eb55825d6430 (round 2: --no-fetch refuses --apply; -D re-proves the checked tip); Windows suite 1812/1812; Netcup at 70f639bae113d97c1577fb3c3f86eb55825d6430 fails exactly H6 and V4

Observed: J1 NEEDS_FIXES r1 on 6c9bc85 (2 MAJOR: --no-fetch --apply reached -D without this run's fetch; -D deleted a tip moved after the check), APPROVE r2 on 70f639bae113d97c1577fb3c3f86eb55825d6430. Windows suite 1812/1812, Netcup Linux fails exactly H6 and V4 (main's own). Start delayed 3.5 h: the lead's watch for the lane five merge was killed for low memory. Evidence: docs/work/evidence/wr-2026-09-26-janitor-origin-J1-review-r1.md, docs/work/evidence/wr-2026-09-26-janitor-origin-J1-review-r2.md, docs/work/evidence/wr-2026-09-26-janitor-origin-netcup-suite.md.

Predicts: Merged branches are cleaned after one --apply on any host with a stale local main, and nothing not proven merged on origin after this run's fetch is deleted.
