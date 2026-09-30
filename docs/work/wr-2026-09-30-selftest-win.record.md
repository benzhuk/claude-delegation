Work: wr-2026-09-30-selftest-win
Scope: docs/specs/selftest-win-60c/spec.md (lane 60c), from skills-fable-guard-60-5, written by the lead at b52757b9d78c328a4a3a4faaecec2581fa233e18
Owner: skills-n
Status: rejected
Authority: build and review on dotfiles branch build/selftest-win-60c-1 and plugin branch build/selftest-win-60c-1; test-only change; merge both on acceptance under the standing grant of 2026-09-26; no install on any machine
Next: fix round 2 on review-1 findings F1 to F3, then Opus delta review
Worktree: /var/tmp/lane-60c/dot
Scratch: /var/tmp/lane-60c
Opened: 2026-09-30T13:34:35.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-from: 2026-09-30T13:34:00Z
Base: b52757b9d78c328a4a3a4faaecec2581fa233e18
Log: 2026-09-30T13:34:35.000Z owned skills-n opened lane 60c from skills-fable-guard-60-5 (the Windows selftest is 27 of 74 without a python3 name, and 72 of 74 with a shim); Sonnet builder next
Log: 2026-09-30T14:08:04.000Z delivered skills-n Sonnet builder a1b7b78457cf5722b at dotfiles 2ddcbf5c87d871f218eba174e782d065e78bc593 (interpreter resolution with abort, path-form normalization, mode check skipped on MSYS); the builder wrote no report and hung on a banned rm of its scratch dir, so the lead stopped it; Netcup selftest 74 of 74 by the lead
Log: 2026-09-30T14:11:25.000Z rejected skills-n Opus reviewer a232f51a1b9e4f9a7 NEEDS_FIXES 2ddcbf5c87d871f218eba174e782d065e78bc593 (F1 HIGH abort guard exits only its command substitution, 27 of 74 reproduced, F2 MEDIUM basename fallback on every platform, F3 LOW empty stat passes on Windows); review-1.md

## Spec
See Scope. Dotfiles base is 6f183eb5af09f8222e19d750a564b34c4f529326.
