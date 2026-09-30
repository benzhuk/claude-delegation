Work: wr-2026-09-29-secret-guard
Scope: docs/specs/secret-guard-60/spec.md (lane 60), from skills-fable-guard-60-1 and Ben's tick recorded on main at f815df7, read at 1a76c54223974465a53004c8b49d92237f7fea24
Owner: skills-n
Status: reviewed
Authority: build and review on dotfiles branch build/secret-guard-60-1 and plugin branch build/secret-guard-60-1; merge both on acceptance under the standing grant of 2026-09-26; chezmoi apply on Netcup and Hetzner after an Opus red-team APPROVE (Netcup waits on Ben resolving the stuck merge in its chezmoi checkout); Windows and Mac only on Ben's word; the guard stays on throughout
Next: accept, merge dotfiles and plugin branches, selftest on Netcup and the desktop, chezmoi apply on Hetzner
Artifact: ba985167ef11bdaf74c0b380d59de7f39dcf19ba
Evidence: docs/work/evidence/wr-2026-09-29-secret-guard-review.md, docs/work/evidence/wr-2026-09-29-secret-guard-p1.md
Worktree: /var/tmp/lane-60/dot
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
Log: 2026-09-29T23:58:01.000Z delivered skills-n Sonnet builder a5f20c5e13265092a phase 2 DONE dotfiles fb48a92 (exclusions H and Q, narrowing E; selftest 58 of 58; corpus replay 5 of 33 truncated commands now pass, 0 regressions, all 3 real reads deny); docs/specs/secret-guard-60/p2-build.md and p2-replay.md
Log: 2026-09-30T00:18:51.000Z rejected skills-n Opus red-team a9a2e9f8daa2e2466 NEEDS_FIXES on fb48a92 (4 HIGH real-read bypasses: executing heredoc, substitution operand, git log patch, lister piped to reader; full-length replay 397 refused commands, 196 now pass, about 101 flagged real reads, 0 regressions); nothing applied anywhere; ruling r2 narrows each exclusion to an allowlist; docs/specs/secret-guard-60/p2-review.md and ruling-r2.md
Log: 2026-09-30T00:52:45.000Z delivered skills-n Sonnet builder a5f20c5e13265092a phase 2 fix round 1 DONE dotfiles 12589fc (allowlist exclusions per ruling r2; full-length replay of 397 refused commands: 0 regressions, now passing 59 of 362 old denials, 2 classifier flags shown false; also found and fixed a seventh bypass in the sourcing check; selftest 67 of 67); docs/specs/secret-guard-60/p2-fix1-build.md
Log: 2026-09-30T01:17:50.000Z rejected skills-n Opus red-team a9a2e9f8daa2e2466 delta r2 NEEDS_FIXES 12589fc (1 HIGH: git log -L prints secret file lines; F1 to F6 and the seventh fix verified; replay confirmed 59 of 362 now pass, 0 regressions, 0 real reads in corpus; allow path 33 to 42 ms); ruling r3 makes git flags an allowlist; docs/specs/secret-guard-60/p2-review-r2.md and ruling-r3.md
Log: 2026-09-30T01:35:50.000Z delivered skills-n builder aadd2ad769f3b7f2b phase 2 fix r2 at dotfiles ba985167ef11bdaf74c0b380d59de7f39dcf19ba (git log and diff flag allowlist, selftest 74 of 74, replay 59 now pass, 0 regressions, 0 real reads, allow path 42 ms); docs/specs/secret-guard-60/p2-fix2-build.md
Log: 2026-09-30T01:51:59.000Z reviewed skills-n Opus red-team afe0fae31e1989dcc delta r3 APPROVE ba985167ef11bdaf74c0b380d59de7f39dcf19ba (N2 closed, flag allowlist held against every brief vector, H and Q byte-identical to 12589fc, selftest 74 of 74, replay 59 now pass, 0 regressions, 0 real reads, allow path 40 to 42 ms)

Predicts: fewer false secret-guard denials cut the stalled and rerouted steps that agents hit on harmless commands. Replayed against the 362 desktop denials, 59 now pass with 0 regressions, so work lost or stalled to guard refusals should fall in the next census window, with no new secret reads.

Observed: phase 1 (denial log, redaction, off switch) was Opus APPROVE at c890801 after two fix rounds. Phase 2 (exclusions H, Q and E from the desktop corpus) was rejected once for four HIGH bypasses at fb48a92 and once for the git log line-range leak at 12589fc. It was approved at ba98516 after both exclusions and the git flag handling became positive allowlists. Selftest 74 of 74. Full-length replay: 59 now pass, 0 regressions, 0 structural real reads. Allow-path cost 40 to 42 ms against a 60 ms budget.

Stall: two builders sat on banned rm prompts, about 90 and 60 minutes. The fix was a transcript-silence watcher on every spawn from then on.

Gap: the held third and fourth patterns (the task-sha legacy key fold and the output detector trip) and the secret-fragment variable name test (skills-fable-guard-60-4) are not in this artifact. Windows and Mac installs wait on Ben's word.

## Spec

See docs/specs/secret-guard-60/spec.md.

Measure: work lost or stalled, read as refusals per day in the new denial log across hosts (baseline 236 refusals in 108 desktop transcripts on 9/29).
