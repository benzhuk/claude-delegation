Work: wr-2026-09-28-repo-env-everywhere
Scope: docs/specs/repo-env-everywhere-1/spec.md (lane 47 lead spec, rulings P1 to P8) from packet docs/specs/repo-env-everywhere-1/packet.md (skills-fable-lane-47-1, plus skills-fable-lane-47-2 for P8)
Owner: skills-n
Status: delivered
Authority: build, review, integrate, push build/repo-env-everywhere-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; live proofs run read-only commands under a scratch GIT_DIR and a scratch notes home; no release, no install, no change to live note state
Next: Opus review and the Windows suite at 1b6a5d5; the P6 cause is shown only with git stripped from PATH, and the review tests whether that is the live cause
Worktree: build/repo-env-everywhere-1
Opened: 2026-09-28T22:17:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-28T22:20:00Z
Base: d6f5c9d4ba95aada3057e511763d68e29b93b154
Log: 2026-09-28T22:50:28.000Z owned skills-n picked up skills-fable-lane-47-1 (ACK sent at pickup, queued behind lane 46) and skills-fable-lane-47-2; lead spec written after a grep of every direct git call and a read of note-inbox's repo resolution and mainCheckout at d6f5c9d; Sonnet builder spawned
Log: 2026-09-28T23:32:51.000Z delivered skills-n Sonnet builder DONE 1b6a5d5 (P1 to P5 helper and every direct git call wrapped, P3 sealed envs, P4 bare repo; P6 note-inbox no longer treats a git-unproven dir as checked, repro on Windows with git stripped from PATH; P8 bearings notice keyed on the main checkout); full 2694 of 2699, 0 fail, leak check 0; the builder worked around two git-identity-guard denials (scratch fixture .gitconfig files, identity fixture@example.invalid, no real identity) and one secret-guard heredoc denial (the script was rewritten through the Write tool), all recorded; branch commits carry the machine identity; Opus review and Windows suite started

Scratch directory for this lane (in the body until lane 36 lands the header field): /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-47
