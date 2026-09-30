VERDICT: APPROVE 80760b3bea59b8d8641537b1ae3749388f13f575

# Lane40 SSH startup delta review (72ca037..80760b3), scoped

Scope: only the Windows OpenSSH startup defect. This approves the source only. It is not a new live proof and not acceptance. The failed G1 live proof and the denied Orca write both stay stopped. The prior full review `code-review-r3.md` (`VERDICT: APPROVE 72ca037be774…`) is kept as context and was not reopened. The old full-suite runs are not this candidate's gate. O1/O2 follow-ups are untouched.

## Delta measured
- Code-path diff since 72ca037 (`scripts skills hooks agents codex templates`): 2 files, +30/−2. Every other changed file is under `docs/`.
- `scripts/knowledge-gather.mjs`: one variable name and one comment. `"ProgramData"` was added to the `sshEnv` allowlist at :128, with the cause comment at :127. There is no other change: no full-environment inheritance, no PATH or binary override, no host-specific orchestration, no new state.
- `scripts/knowledge-gather.test.mjs`: one new test at :262, plus imports of `sshEnv` and `childEnv`.
- Shared helper: the gather call at `knowledge-gather.mjs:421` and the reconciliation/archive call at :503 both pass `env: sshEnv()`, so one entry fixes both paths.

## Ordering (research precedes source edit)
026ec5b test (20:49:25) → cd5751c red receipt (20:49:41) → 237c6c6 round-4 research receipt (20:51:25) → 412f62d source fix (20:51:48) → a199d92 result. The test was committed first, and the research receipt comes before the source edit. Confirmed.

## Gate run by me (nonblocking `Global\claude-verify`, acquired; local, no network)
Command: `node scripts/run-tests.mjs --no-sweep scripts/knowledge-gather.test.mjs`, run once in each tree.
- Candidate (wt @ 80760b3): exit 0. 23 tests, 23 pass, 0 fail, 0 skipped, 0 cancelled, leak 0. The new test ran and passed (21 ms).
- Scratch mutant: `git archive HEAD` copied outside the reviewed tree, with `knowledge-gather.mjs` replaced by the 72ca037 version. That is the prior source, and it omits ProgramData; `diff` shows only lines 127–128 differ. Result: exit 1. 23 tests, 22 pass, 1 fail, 0 skipped, leak 0. The only failure is the intended assertion: `native Windows OpenSSH did not start with sshEnv names: HOME, PATH, TEMP, TMP, USERPROFILE`, `255 !== 0`.
- Reviewed tree: `git status --porcelain` shows 0 entries. No write reached it.

## Answers to the brief
- **Actual native Windows OpenSSH `-V`:** Yes. The test uses the absolute path `C:/Windows/System32/OpenSSH/ssh.exe` with `-V`, so there is no host argument and no network. It fails on the prior source and passes here, as the gate numbers above show.
- **Sealed, explicit childEnv:** The environment passed to the process is `sshEnv(childEnv(fixtureHome, {…excluded}))`. `childEnv` blanks the messaging socket and token and points HOME/USERPROFILE at a fixture.
- **Excluded variables stay out:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CLAUDE_CODE_MESSAGING_TOKEN` and `GIT_AUTHOR_NAME` are injected into the base on purpose, and the test asserts all four are absent from the environment ssh receives.
- **Minimum cause vs binary selection:** The binary is pinned by absolute path, so the test cannot pass by resolving Git's OpenSSH, which starts fine without ProgramData (ssh-startup-r1). The only thing that changes between red and green is the ProgramData entry. My run adds extra evidence: my runner (launched through MSYS) had no exact-case `SystemRoot` key, so the green environment was HOME, PATH, ProgramData, TEMP, TMP, USERPROFILE. ssh still started, which is consistent with ssh-startup-r2's result that ProgramData alone is the minimal fix.
- **Explicit skip, no hidden green:** The skip is decided before the test runs: `WINDOWS_OPENSSH_SKIP` names the reason when the platform is not win32 or the binary is missing. On this Windows host it reported skipped 0, and the test executed (it has a timing and a failing variant).
- **Scope:** The environment was not expanded, and no host-specific orchestration was added.

## Findings
No blocking findings. The absence of defects in the scoped area was verified.

Non-blocking note: the test looks up the exact-case `ProgramData` key in a plain object copied from the runner's environment. Production uses `process.env`, which is case-insensitive on Windows, so production is not affected. If a runner ever exported only `PROGRAMDATA`, the test would fail loudly rather than pass falsely. No action needed.

## Bugfix fields
Cause: `sshEnv` allowlist omitted `ProgramData`; native Windows OpenSSH 9.5p2 exits 255 with empty output at startup without it, so both gather and reconciliation SSH children died before connecting.
Discriminating check: `knowledge-gather.test.mjs:262` against actual `C:/Windows/System32/OpenSSH/ssh.exe -V` — mutant with prior source 22/23 (255 !== 0), candidate 23/23, both measured in this review under the verify mutex.
Fix location: `scripts/knowledge-gather.mjs:127-128`, `sshEnv` allowlist (shared by :421 gather and :503 archive).
Simplification: one allowlist name added, nothing else; no environment inheritance, binary override or new mechanism.

No patch is required. The next authorized live proof still has to measure how the host actually behaves.
