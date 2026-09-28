Work: wr-2026-09-27-sealed-home-leak
Scope: docs/specs/sealed-home-leak-1/spec.md (lane 24 of skills-fable's follow-up bundle, origin/docs/lane-specs-0925 at 7e92f16); territory scripts/test-home.mjs, scripts/test-home.test.mjs, scripts/run-tests.mjs, scripts/run-tests.test.mjs
Owner: skills-n
Status: delivered
Authority: build, review, integrate, push build/sealed-home-leak-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; delete sealed-home-* temp dirs only through the suite's own cleanup and sweep
Next: fix round 1 on review-r1 F1 F2 F3 (fresh Sonnet builder), then Opus delta review
Worktree: build/sealed-home-leak-1
Opened: 2026-09-27T20:31:01.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T20:15:00Z
Base: 0c926057a948c4365cf92d82d8fb584cbcc77dcd
Log: 2026-09-27T20:31:01.000Z owned skills-n picked up skills-fable-lane-24-1, ACK sent over ssh on ben-desktop, base 0c92605
Log: 2026-09-27T20:31:39.000Z owned skills-n Sonnet builder spawned on the four-file territory; /tmp holds 72 sealed-home dirs at pickup
Log: 2026-09-27T20:43:13.000Z delivered skills-n Sonnet builder DONE ea16c1f (report 2812595), territory gate 37 of 37; Opus reviewer spawned on 2812595
Log: 2026-09-27T20:52:25.000Z rejected skills-n Opus review r1 NEEDS_FIXES 2812595: F1 BLOCKER runner home still leaks and signal swallowed under spawnSync, F2 MAJOR keep-on-failure test not discriminating, F3 MINOR one unremovable dir aborts the sweep; lead rules F1-F3 in, F4 (re-raise with another listener) left to the spec session, R1 left. Spec-from corrected 20:40Z to 20:15Z per skills-fable-lane-24-3 (spec 04d771b)
Log: 2026-09-28T02:16:16.000Z rejected skills-n fix-round-1 builder stalled from 20:55:28Z (transcript mtime) on a compound command carrying rm -rf, likely held at a permission prompt; stopped by the lead at 2026-09-28T02:16:16.000Z with uncommitted edits to run-tests.mjs and run-tests.test.mjs; fresh builder spawned with the recovery prompt
Log: 2026-09-28T02:20:10.000Z delivered skills-n recovery builder DONE f8aa816 (F1 F2 F3; both discriminating checks fail on revert), territory gate 39 of 39; Opus delta review started
