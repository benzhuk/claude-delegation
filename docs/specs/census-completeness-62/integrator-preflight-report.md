VERDICT: PASS

## Source equality (BEFORE control valid)
scripts/build-census.mjs, four-read.mjs, token-census.mjs: blob hash at a3aa244b == working tree, git diff empty, no commits on a3aa244b..HEAD touching them.
build-census a99ebffb, four-read 75ea0f12, token-census dc792fee.

## Control (native-only, old source, no --record/role flags)
Command (cwd = worktree):
node scripts/build-census.mjs --lead-session 01a0df4c-2809-7520-b1d7-876cc51a87ee --codex-home C:/Users/benzh/AppData/Roaming/orca/codex-accounts/f22a4cc4-fb5a-4af5-aeec-4951188a536a/home --from 2026-09-29T19:17:00Z --to 2026-09-30T04:15:42.727Z --json control-before/lane40-before.json --out control-before/lane40-before.txt
Exit 0, stderr empty. --from = record Opened; --to = first accepted Log (record line 231, artifact 80760b3).
Outputs (under scratch/control-before): lane40-before.json sha256 c44503c9123f789f, .txt sha256 48619e9127d80cba, run.stdout, run.stderr.
Verdict line: COUNTED 926 Codex responses (leadTurns 19); UNSUPPORTED stallNudges, stalls, 59 subagent files, leadLastMessageAt 2026-09-30T22:58:05.166Z.
leadTurns 19, wallClockHours 7.25, wakes 19 (19 note-flush), stopBlocks 1, coverageSupported true, stallNudges unavailable (ledger dir unreadable).
by-model: gpt-5.6-sol=77804337, gpt-6-astra=120291865. by-role: unmapped=79184570 (59 subagent files, none mapped).
Identity: 01a0df4c... verified from 1 file in canonical session tree, complete true, 195 candidates; root rollout found via exact identity, duplicate excluded, no other account homes scanned.
Note: effective window start printed as 2026-09-29T21:00:30.739Z (first lead message inside the --from window), end 2026-09-30T04:15:42.229Z. Record says leadTurns 19 / wallClock 7.13 h; control shows 19 / 7.25 h.
Roles missing by design: the six declared detached Claude reviewers in docs/work/evidence/census62/lane40-roles.json (spec-reviewer 625dde50, reviewers 27395e06, 7b7526f5, 7214f385, ae5b9f49, 350044d6) are absent from the native-only result, as expected for old source.

## Gate script (prepared, NOT run)
/c/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/census-completeness-62/windows-full-gate.ps1 (sha256 ce0f237d5a541f4a). Parses clean (0 errors, parser only).
Usage: pwsh -File windows-full-gate.ps1 -Sha <40-hex candidate>. Refuses (exit 3) on DELEGATION_REVIEW_RUN presence without reading or clearing it; refuses if HEAD != -Sha (4), tracked-dirty (5), another run-tests.mjs node process (6), or Global\claude-verify held (7, nonblocking WaitOne(0)). Runs node scripts/run-tests.mjs --no-sweep once into windows-full-gate.log, writes windows-full-gate.receipt.md, releases only its own mutex in finally.

State file: integration-state.md. No source/test/spec/record edits, commit, agent, SSH, peer message or page write. Two untracked files in the worktree predate this task.
