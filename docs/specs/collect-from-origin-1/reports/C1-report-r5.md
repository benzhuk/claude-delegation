VERDICT: PASS

# C1 report — round 5 (Windows path-separator fix, skills-fable findings)

## Finding actioned
`docs/specs/collect-from-origin-1/reports/C1-windows-findings.md` (skills-fable, Windows,
2026-09-26 ~10:15 New York): an independent Sonnet rerun of the sealed suite on Windows at
33aa023 (`node scripts/run-tests.mjs`) found 5 of 5 failures inside
`scripts/collect-from-origin.test.mjs`, all Windows path-separator mismatches between the
code's real (git-sourced, always forward-slash) `recordPath` and a hardcoded-backslash
expected value, or the reverse. Named failing tests: the bare-remote fixture; "a branch with
several changed records yields one row per record (R1)"; the tip-equals-main /
missing-Artifact attack test; the orphan-branch (no merge base) test; and the
`changedRecordPaths` added/identical test.

## Root cause: the test, not the code
`scripts/collect-from-origin.mjs`'s `recordPath` field is never built with `path.join` — it
comes straight from `git diff --name-only` output, split on `\n`
(`changedRecordPaths`/`diffRecordPaths`, `scripts/collect-from-origin.mjs:75-84`), and git
always prints forward slashes on every OS, Windows included. This part was already correct;
no change was needed in `collect-from-origin.mjs`, and none was made.

The defect was in the test file's own fixture helper. `writeRecord`
(`scripts/collect-from-origin.test.mjs:41-46`, pre-fix) built the *expected* value the tests
compare against with:
```
return path.join("docs", "work", filename);
```
`path.join` on Windows joins with `path.sep`, a backslash — so every test that later compared
a row's or `changedRecordPaths()`'s real (forward-slash) value against this helper's return
value was comparing `docs/work/x.record.md` (actual) against `docs\work\x.record.md`
(expected) on Windows only. On Linux/macOS `path.sep` is `/`, so the same bug was invisible
there — exactly why it never showed up until skills-fable's own Windows rerun.

## Fix applied
One file changed: `scripts/collect-from-origin.test.mjs`. `collect-from-origin.mjs` is
untouched (confirmed by `git diff --stat` on the commit below showing only the test file).

1. `writeRecord` (`scripts/collect-from-origin.test.mjs:41-48`) now returns
   `path.posix.join("docs", "work", filename)` instead of `path.join(...)` — always a
   forward-slash path, matching git's real output on every OS, never `path.sep`.
2. Added a new test, "changedRecordPaths / row.recordPath: always forward-slash, never
   path.sep, regardless of OS" (after the existing `changedRecordPaths` test), asserting:
   - `changedRecordPaths()`'s returned path equals the literal string
     `"docs/work/wr-2026-09-26-slash.record.md"` and contains no `\`.
   - A full row's `recordPath` (from `main`'s `--json` output) equals the fixture's expected
     path and contains no `\`.
   This pins the forward-slash guarantee directly, so a future regression (in either the code
   or a future test helper) fails loudly on any OS, not just on Windows.

## Verified on Windows itself
Per the fix-round brief's instruction to verify on Windows if possible: scp'd
`collect-from-origin.mjs`, `collect-from-origin.test.mjs`, and `work-record.mjs` (its only
project import — confirmed by `grep -n "^import" scripts/work-record.mjs`, all four imports
are Node builtins, nothing further to carry) to `C:\Temp\c1verify` on
`benzh@ben-desktop.tail219acd.ts.net` over the existing SSH/scp access, then ran
`node --test collect-from-origin.test.mjs` there (cmd shell, one line, real Windows node at
`C:\nvm4w\nodejs\node.exe`).

Result on Windows:
```
ℹ tests 22
ℹ suites 0
ℹ pass 22
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 60884.1071
```
All 22/22 pass, including the five tests skills-fable's rerun had failing and the new
forward-slash-pinning test. The only non-test-runner output was git's own `autocrlf`
LF/CRLF advisory warnings on every commit inside the fixture repos (harmless, pre-existing,
unrelated to this fix). Temp dir `C:\Temp\c1verify` removed after the run
(`rmdir /s /q`, confirmed gone by a follow-up `dir`).

## Local (Linux) gate
`node --test scripts/collect-from-origin.test.mjs` in
`/home/ben/Code/wt-collect-from-origin-1-C1`: 22/22 pass. Full tail in
`docs/specs/collect-from-origin-1/reports/C1-gate.log`.

## Commit
`5e67b85605e8a946f8609980326e268e983d925a` on `build/collect-from-origin-1-C1` in
`/home/ben/Code/wt-collect-from-origin-1-C1`:
"fix(collect-from-origin): round-5 Windows path-separator fix (skills-fable findings)".
Not pushed (pushing is skills-fable's/the orchestrator's step per the findings doc, not
mine); no git identity set or switched; no destructive git used.

## Not done / out of scope this round
- No forward-merge into `build/one-launch-2` — that is explicitly the orchestrator's/
  skills-fable's step per the findings doc ("pushed as a new tip ... then merge that tip
  forward into build/one-launch-2"), not a C1 builder action, and pushing is out of scope
  for this territory regardless.
- No peer note sent (none authorized/needed for this round).
- `docs/work/` untouched, as always for this territory.
