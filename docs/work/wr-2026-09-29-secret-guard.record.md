Work: wr-2026-09-29-secret-guard
Scope: docs/specs/secret-guard-60/spec.md (lane 60), from skills-fable-guard-60-1 and Ben's tick recorded on main at f815df7, read at 1a76c54223974465a53004c8b49d92237f7fea24
Owner: skills-n
Status: closed
Authority: build and review on dotfiles branch build/secret-guard-60-1 and plugin branch build/secret-guard-60-1; merge both on acceptance under the standing grant of 2026-09-26; chezmoi apply on Netcup and Hetzner after an Opus red-team APPROVE (Netcup waits on Ben resolving the stuck merge in its chezmoi checkout); Windows and Mac only on Ben's word; the guard stays on throughout
Next: accept via Artifact-repo: (lane 60b on main at 52ab9af), merge dotfiles and plugin branches, desktop selftest, chezmoi apply on Hetzner
Artifact: ba985167ef11bdaf74c0b380d59de7f39dcf19ba
Evidence: docs/work/evidence/wr-2026-09-29-secret-guard-review.md, docs/work/evidence/wr-2026-09-29-secret-guard-p1.md
Artifact-repo: /var/tmp/lane-60/dot
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
Log: 2026-09-30T01:54:26.000Z reviewed skills-n Opus red-team verdict stands, accept refused sha-not-in-git: the dotfiles artifact is not resolvable from the plugin repo and no record field can name another repo; opened lane 60b (wr-2026-09-30-artifact-repo) for the cause, dotfiles merge held until accept
Log: 2026-09-30T02:54:13.000Z reviewed skills-n Opus red-team afe0fae31e1989dcc APPROVE ba985167ef11bdaf74c0b380d59de7f39dcf19ba stands; Artifact-repo: /var/tmp/lane-60/dot added now that lane 60b is merged to main at 52ab9afb8da6ed9c3100a7ba7bea3f8993e66b3a
Census: - leadTurns: 59
Census: - wallClockHours: 5.25
Census: - wakes: 0 (0 note-flush, 0 Done-tick)
Census: - wakeSplit: wake 0, stopBlock 0, other 59 (coalescable 0 at hold 10m — see "Wake-opened turns" below)
Census: - stopBlocks: 0
Census: - stallNudges: unavailable (ledger dir unreadable)
Census: - by-model: claude-opus-4-8=12923929, claude-opus-5-5=86466444, claude-sonnet-5=274430271
Census: - by-role: unassigned=332797266
Census: - subagentFiles: 287
Census: - Total assistant turns, deduped (whole file): **2058**
Census: - Window assistant turns, deduped: **239**
Census: - leadTurns (conversational runs — see docs/census.md): **59**
Census: - Wakes (turns opened by a note-flush or Done-tick line, see docs/census.md): **0** (0 note-flush, 0 Done-tick)
Census: - Stop-blocks (multi-inbox Stop hook blocks): **0**
Census: - Stall nudges received (ledger `collect-*-stall-*` ASKs to the lead's slug, in the window): **unavailable (ledger dir unreadable)**
Census: - Window: 2026-09-29T21:39:29.023Z .. 2026-09-30T02:54:26.914Z
Census: - Turns/hour in window: **45.53**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 4114 | 5828792 | 347756700 | 1374259 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 478 | 450808 | 40407518 | 164574 |
Census: - wakeTurns: 0, stopBlockTurns: 0, otherTurns: 59
Census: - cache_creation per turn (M6) — wake: (none); other: claude-opus-5-5=7640.8
Census: - coalescable (W1b, hold 10m, RESULT wakes only, Done-tick excluded): turns 0, upper (none), lower (none); ceiling (every RESULT wake turn) turns 0, (none)
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-4-8 | 224 | 241437 | 12498916 | 183352 |
Census: | claude-opus-5-5 | 1030 | 2432754 | 42444634 | 564648 |
Census: | claude-sonnet-5 | 3830 | 4336129 | 268405023 | 1685289 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 5084 | 7010320 | 323348573 | 2433289 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-4-8 | 183352 | 12740577 |
Census: | claude-opus-5-5 | 729222 | 85737222 |
Census: | claude-sonnet-5 | 1685289 | 272744982 |
Four numbers: Top-tier tokens per build: 99390373 tokens: build 99390373 (claude-opus-4-8, claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 5.3h; largest gap 31.3min at 2026-09-29T22:29:28.191Z
Four numbers: Rework after acceptance: unavailable (git: Command failed: git -C /var/tmp/lane-60/dot diff --name-only 1a76c54223974465a53004c8b49d92237f7fea24..ba985167ef11bdaf74c0b380d59de7f39dcf19ba)
Four numbers: Work lost or stalled: 4 gap(s) over 30min stalled; 1 waiting-on-agents (31.3 min); agent a367a2ba2b2f5efb9 silent 60.8 min from 2026-09-29T22:28:22.508Z; agent a8ae668d19e0620ae silent 58.6 min from 2026-09-29T22:30:15.967Z; agent a96da4ee9794f0460 silent 83.0 min from 2026-09-29T22:05:55.366Z; agent a9a2e9f8daa2e2466 silent 34.5 min from 2026-09-30T00:18:23.763Z; 0 unanswered ASKs to skills-n; wakes 0 (0 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-n
Log: 2026-09-30T02:54:29.000Z accepted skills-n artifact ba985167ef11bdaf74c0b380d59de7f39dcf19ba
Log: 2026-09-30T02:56:05.000Z accepted skills-n dotfiles branch merged to dotfiles main at 6f183eb5af09f8222e19d750a564b34c4f529326 (selftest 74 of 74 on the merged tree); plugin branch merged to main at 20f7267d0889eb092df3ff10c2ae00816143b42e (clean, suite 3303 tests 0 fail)
Log: 2026-09-30T02:56:05.000Z closed skills-n merge 20f7267d0889eb092df3ff10c2ae00816143b42e

Predicts: fewer false secret-guard denials cut the stalled and rerouted steps that agents hit on harmless commands. Replayed against the 362 desktop denials, 59 now pass with 0 regressions, so work lost or stalled to guard refusals should fall in the next census window, with no new secret reads.

Observed: phase 1 (denial log, redaction, off switch) was Opus APPROVE at c890801 after two fix rounds. Phase 2 (exclusions H, Q and E from the desktop corpus) was rejected once for four HIGH bypasses at fb48a92 and once for the git log line-range leak at 12589fc. It was approved at ba98516 after both exclusions and the git flag handling became positive allowlists. Selftest 74 of 74. Full-length replay: 59 now pass, 0 regressions, 0 structural real reads. Allow-path cost 40 to 42 ms against a 60 ms budget.

Stall: two builders sat on banned rm prompts, about 90 and 60 minutes. The fix was a transcript-silence watcher on every spawn from then on.

Gap: the held third and fourth patterns (the task-sha legacy key fold and the output detector trip) and the secret-fragment variable name test (skills-fable-guard-60-4) are not in this artifact. Windows and Mac installs wait on Ben's word.

## Spec

See docs/specs/secret-guard-60/spec.md.

Measure: work lost or stalled, read as refusals per day in the new denial log across hosts (baseline 236 refusals in 108 desktop transcripts on 9/29).
