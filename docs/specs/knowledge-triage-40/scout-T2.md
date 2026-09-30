VERDICT: READY — with the limits stated below (installer source was not read: guard refusal, see scout-T1.md).

## Test conventions to match (Node builtin `node:test`, ESM .mjs)
- Headers: `import test from 'node:test'; import assert from 'node:assert/strict'` (knowledge-counts.test.mjs:2-6). Installer tests add `after` for cleanup of tracked temp dirs (install-janitor-timer.test.mjs:12, mkTmp :36 honours `FIXTURE_ROOT` for the sealed run).
- Never touch real `~`: all functions take an injected `home`; main() called in-process, not spawned (install-janitor-timer.test.mjs header comment :1-10). Fake `exec` records argv (:462, :549).
- Fixtures reusable verbatim: knowledge-counts.test.mjs:12-34 (tmpHome/mkStore/writeLog); install-janitor-timer.test.mjs:36 mkTmp, :42 capture, :54 fixturePluginRoot (add a `knowledge-triage.mjs` stub or every --job knowledge-triage test is refused for a missing script, cf. test :1221), :69 fixtureDefaultRepoGit.
- Windows XML assertions read raw UTF-16LE bytes and check BOM 0xFF 0xFE (test :560-575); byte-stability test :75 and no-`--apply` test :88 must include the new job.
- Windows-only skips: `skip: process.platform === "win32" ? ...` for systemd text (:794, :860); this lane's host is win32 so schtasks/XML cases run.
- Spawning a real fake `claude`: review-run.test.mjs (skills/team-build/scripts) is the precedent for a fake binary and `spawnImpl`/`isAliveFn` injection (review-run.mjs:467-472); the grandchild-dies test (rev3 item 4) needs a real child process, so it must use a temp node script as the fake `claude` and check the grandchild pid with process.kill(pid, 0).

## Contract facts the tests can pin now
- Read log: `<ISO> <tool> <path> <session>`, session last token, path may contain spaces (hooks/knowledge-log.mjs:22-26). Exclusion test: one line with a listed session excluded, unlisted/`unknown` kept, malformed sessions.json (absent, corrupt, non-array) = exclude nothing, never throw (module rule knowledge-counts.mjs:7-10).
- Pending count contract: dotfiles and `_archive` excluded (test :56); an inbox note named `<host>-...` must still get date from the filename if the date leads (regex knowledge-counts.mjs:81) — a test for the chosen name shape is needed.
- Lock: skill's dir is `~/.claude/knowledge/.curated-update.lock` with `token.txt`/`owner.txt` (SKILL.md:51-69); job must only check existence. Absent today (verified).
- Writer host: the skill names `BEN-DESKTOP` at SKILL.md:35-36 (a code-formatted host name inside the "Designated writer boundary" paragraph); the "writer host not found" test must edit that paragraph in a FIXTURE copy, not the live skill.
- Fake ssh on PATH: on win32 spawn resolves `ssh.exe`/`.cmd` by PATH; a fake needs a `.cmd` shim or an injected spawn/exec seam. Precedent for shebang scripts failing on win32: review-run.mjs:719 comment ("shebang script ... spawn() throws synchronously"). Prefer an injected `runSsh` dependency plus one PATH-shim smoke test.
- Ben-inbox line: `~/.agents/notes/ben-inbox.md` (rev3 item 3); assert against a fixture home, never the real file.

## Premises the tests should not inherit
- "Suite" size: full suite ~2990 tests takes long; use `node --test scripts/<file>` only (scout-brief forbids running the suite now anyway).
- rev4 item 4 "second host" gate and rev3 "74 notes" are not testable facts; local inbox is 82.
- No test may run `taskkill /T /F` on a real pid it did not create; kill only fixture-spawned pids.

## Gaps for T2
- Cannot verify from source: whether main() accepts an injected hostname, and the per-job marker structure. Ask T1's builder for the seam names before T2 writes the remove-scoping test.
- install-janitor-timer.test.mjs is 1361 lines; T2 should add only the smallest job-scoped cases there and keep the bulk in the new knowledge-triage.test.mjs (< 800 lines each).
