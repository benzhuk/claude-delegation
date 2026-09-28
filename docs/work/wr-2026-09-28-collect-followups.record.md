Work: wr-2026-09-28-collect-followups
Scope: docs/specs/collect-followups-1/spec.md (lane 33, skills-fable's spec at 34ecdbe on origin/docs/lane-specs-0925); territory as pinned in the spec
Owner: skills-n
Status: delivered
Authority: build, review, integrate, push build/collect-followups-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; live proof only against a scratch HOME with --force-root --dry-run --json, never the live Netcup unit
Next: fix round 1 on review-r1 F1 F2 F4 F5 (fresh Sonnet builder), then Opus delta review
Worktree: build/collect-followups-1
Opened: 2026-09-28T03:48:18.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-28T03:44:00Z
Base: e9ccec4948e9689e58b0a4374fcfc36b2a8a8037
Log: 2026-09-28T03:48:18.000Z owned skills-n picked up skills-fable-lane-33-1, ACK sent over ssh on ben-desktop, base e9ccec4
Log: 2026-09-28T04:05:04.000Z delivered skills-n Sonnet builder DONE 19607cf (report 6cd4ec2), gate 140 of 140; a secret-guard warning on its state file was checked by the lead with secret-tool grep-safe over every changed file, no key prefix found; Opus reviewer and Windows suite started
Log: 2026-09-28T04:12:41.000Z rejected skills-n Opus review r1 NEEDS_FIXES 6cd4ec2 (Windows 2545 of 2554, 0 fail at 19607cf): F1 no test ties --stale-hours given to main to the written unit (4 mutants survive), F2 the closed grep test finds nothing and a comment defeats it, F4 --stale-hours silently ignored for janitor-record, F5 K3 overclaims. Lead rules F1 F2 F4 F5 in verbatim; F3 keep exit 1 like --hour/--every, spec Acceptance amended here (exit 1, not 2); F6 no change
Log: 2026-09-28T04:18:19.000Z delivered skills-n fix builder DONE 0523ec8 (F1 F2 F4 F5; F1 test fails on M4, F2 on M1), gate 141 of 141; secret-tool grep-safe over changed files again clean; Opus delta r2 and Windows suite started
