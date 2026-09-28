Work: wr-2026-09-28-transport-identity
Scope: docs/specs/transport-identity-1/spec.md (lane 44 lead spec, rulings P1 to P3) from packet docs/specs/transport-identity-1/packet.md (skills-fable-lane-44-1, lane 34 review r1 F3)
Owner: skills-n
Status: reviewed
Authority: build, review, integrate, push build/transport-identity-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; the live proof reads only (decisions-pickup status); no release, no install
Next: accept, merge into main, close, publish, RESULT to skills-fable; the fix reaches installed hosts only with the next release; FU1 to FU6 from review r1 and N1 from review r2 are follow-ups
Artifact: 216d56bc1bb27233c3771e0779a2884fde6dd0c7
Evidence: docs/work/evidence/wr-2026-09-28-transport-identity-review.md, docs/work/evidence/wr-2026-09-28-transport-identity-review-r1.md, docs/work/evidence/wr-2026-09-28-transport-identity-suites.md, docs/work/evidence/wr-2026-09-28-transport-identity-live.md
Worktree: build/transport-identity-1
Opened: 2026-09-28T21:18:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-28T21:20:00Z
Base: 8b8c2f04cdabe25d1a996ad76bee7e6f2391b6ee
Log: 2026-09-28T21:17:20.000Z owned skills-n picked up skills-fable-lane-44-1, ACK sent; lead spec written with rulings P1 to P3; this lead runs 0.20.9 hooks, so once 0.20.17 installs here a fresh skills-n session picks this record up from origin
Log: 2026-09-28T21:22:18.000Z delivered skills-n Sonnet builder DONE 25a523b (gitRunner env without the four repo-locating vars, transport.test.mjs red on base then green), full 2654 of 2659 with 0 fail; Opus review r1 and Windows suite started
Log: 2026-09-28T21:31:25.000Z rejected skills-n Opus review r1 NEEDS_FIXES 25a523b, production cause confirmed; F1 the test fails on win32 (confirmed on Windows, 2646 of 2659 with 1 fail), F2 F3 F5 test hygiene and coverage, F4 mixed-case key on win32, all in (lead-ruling-r1.md); FU1 to FU6 are follow-ups
Log: 2026-09-28T21:40:31.000Z delivered skills-n fix builder DONE fc8f7fd (F1 to F5 as patched; the GIT_COMMON_DIR test fails on base and on a GIT_DIR-only mutant, passes at the fix); on hold: the verbatim test patch trips hooks.test.mjs N2 (a test file spreads the runner env instead of childEnv), and the full suite cannot run because Netcup /tmp is out of inodes (1046152 of 1048576), freeing it is Ben's call
Log: 2026-09-28T21:51:05.000Z delivered skills-n fix builder DONE 216d56b (the test builds its git env through childEnv, N2 passes; red on base and on the GIT_DIR-only mutant, green at the fix), full 2655 of 2660 with 0 fail after Netcup /tmp was freed with Ben's word; Opus delta r2 and Windows suite started
Log: 2026-09-28T21:56:52.000Z reviewed skills-n Opus reviewer a4cace0c0e074c6a6 delta r2 VERDICT: APPROVE 216d56b (F1 to F5 verified, N1 a follow-up); Linux 2655 of 2660 and Windows 2648 of 2660, 0 fail; live proof on decisions-pickup status PENDING_MANUAL_HANDOFF at base, ACCOUNTED at the fix

Scratch directory for this lane (in the body until lane 36 lands the header field): /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-44

Observed: decisions-pickup status run on Netcup with GIT_DIR pointing at a scratch repo read PENDING_MANUAL_HANDOFF at main df7ba47 and ACCOUNTED at 216d56b, the same as the control with GIT_DIR unset. transport.test.mjs fails on base and on a mutant that clears only GIT_DIR, and passes at the fix. The red runs were on Linux; the full suite passes at the fix on both Linux and Windows.

Predicts: after the next release, a pickup, collector or note-send run started from a git hook or any shell that exports GIT_DIR resolves the project from its own cwd, so no lane is misfiled as another project's manual handoff (work lost or stalled).

Stall: the watcher named in the Log lines is the lead's transcript watcher on each spawned agent. No agent went quiet; every one reported inside its ETA.
