Work: wr-2026-09-29-secret-guard
Scope: docs/specs/secret-guard-60/spec.md (lane 60), from skills-fable-guard-60-1 and Ben's tick recorded on main at f815df7, read at 1a76c54223974465a53004c8b49d92237f7fea24
Owner: skills-n
Status: owned
Authority: build and review on dotfiles branch build/secret-guard-60-1 and plugin branch build/secret-guard-60-1; merge both on acceptance under the standing grant of 2026-09-26; chezmoi apply on Netcup and Hetzner after an Opus red-team APPROVE (Netcup waits on Ben resolving the stuck merge in its chezmoi checkout); Windows and Mac only on Ben's word; the guard stays on throughout
Next: phase 2 Sonnet builder per ruling-r1 on top of c890801, then Opus red-team; later, the plugin secret-fragment name test (skills-fable-guard-60-4)
Worktree: build/secret-guard-60-1
Scratch: /var/tmp/lane-60
Opened: 2026-09-29T21:39:28.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-29T21:22:00Z
Base: 1a76c54223974465a53004c8b49d92237f7fea24
Log: 2026-09-29T21:39:28.000Z owned skills-n opened after the sweep RESULT (d3b780e); dotfiles worktree /var/tmp/lane-60/dot at b29f3f8593414670c19d66cf03032c7d5916bed8; the Netcup chezmoi checkout is mid-merge on the encrypted secrets file and is left untouched
Log: 2026-09-29T21:57:36.000Z delivered skills-n Sonnet builder af52da0a355e4d400 phase 1 DONE dotfiles ab4d67d (denial log with redaction, off switch, swallowed failures, modes 700 and 600, rotation; no test corpus existed, a new selftest holds 14 baseline cases plus 6 phase 1 cases, 16 of 20 pass before and 20 of 20 after); report docs/specs/secret-guard-60/p1-build.md
Log: 2026-09-29T21:59:11.000Z delivered skills-n Opus reviewer spawned on phase 1 (dotfiles ab4d67d), report /var/tmp/lane-60/p1-review.md; desktop corpus not yet on main
Log: 2026-09-29T22:08:09.000Z rejected skills-n Opus reviewer a367a2ba2b2f5efb9 NEEDS_FIXES (7: F1 field 5 is raw hook JSON and carries Write contents, F2 redaction misses split keys, base64 tails and PEM bodies and fails open, F3 a FIFO at the log path hangs the hook, F4 to F7 medium and low incl. four selftest cases not looking); docs/specs/secret-guard-60/p1-review.md
Log: 2026-09-29T22:13:36.000Z rejected skills-n ruling r1 from the desktop corpus (205 refusals): phase 2 narrows the secret-file-reference and environment-dump patterns via quoted-heredoc and search-operand exclusions; env-file flag dropped (zero cases); docs/specs/secret-guard-60/ruling-r1.md
Log: 2026-09-29T22:25:38.000Z delivered skills-n Sonnet builder a16b226fd4c64be00 phase 1 fix round 1 DONE dotfiles f7ca1eb (F1 to F7, each red on ab4d67d and green after); report docs/specs/secret-guard-60/p1-fix1-build.md; lane gains a later deliverable from skills-fable-guard-60-4: a plugin test that no plugin script names a non-secret variable with a secret fragment, two documented exceptions
Log: 2026-09-29T22:28:31.000Z rejected skills-n Opus reviewer a367a2ba2b2f5efb9 delta r2 on f7ca1eb NEEDS_FIXES (1: R2-1 Agent, Task and MCP inputs log body text; F1 to F7 closed); docs/specs/secret-guard-60/p1-review-r2.md
Log: 2026-09-29T23:29:02.000Z delivered skills-n Sonnet builder a8ae668d19e0620ae committed fix round 2 as dotfiles c890801 (R2-1), then sat about 60 min on a banned rm -rf permission prompt and was stopped by the lead before its report; the tree was clean, the reviewer runs the gate
Log: 2026-09-29T23:30:02.000Z owned skills-n Opus reviewer a367a2ba2b2f5efb9 delta r3 APPROVE c890801 (selftest 31 of 31; phase 1 done); phase 2 builder spawned; docs/specs/secret-guard-60/p1-review-r3.md

## Spec

See docs/specs/secret-guard-60/spec.md.

Measure: work lost or stalled, read as refusals per day in the new denial log across hosts (baseline 236 refusals in 108 desktop transcripts on 9/29).
