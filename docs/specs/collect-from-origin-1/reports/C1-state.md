# C1 state — collect-from-origin collector

## Territory
scripts/collect-from-origin.mjs, scripts/collect-from-origin.test.mjs, docs/census.md's
three-sentence addition. Worktree /home/ben/Code/wt-collect-from-origin-1-C1, branch
build/collect-from-origin-1-C1. Nothing else touched. Round 5, at
5e67b85605e8a946f8609980326e268e983d925a.

## Contracts I rely on
- contracts.md R1: CLI shape, row fields/order, state enum, artifact-sha extraction rule,
  git-plumbing-only, exit 0 always. The <=60 runtime-line pin is WAIVED by the lead ruling
  (C1-lead-ruling-r4.md) at the real size (114 lines) — the pin was a size proxy and
  statement-joining to meet it made the file harder to audit.
- contracts.md R2: three sentences in docs/census.md (untouched this round).
- work-record.mjs's `parseRecord(text)` (imported, not re-derived).

## Done (round 5 — skills-fable's Windows path-separator findings)
- Root cause: `scripts/collect-from-origin.mjs` was already correct — `recordPath` always
  comes straight from `git diff --name-only` output (`changedRecordPaths`,
  `collect-from-origin.mjs:79-84`), which git prints with forward slashes on every OS. The
  bug was in the TEST's own `writeRecord` helper (`collect-from-origin.test.mjs:41-46`),
  whose `return path.join("docs", "work", filename)` builds the *expected* value with
  `path.sep` — a backslash on Windows — so five assertions compared a forward-slash actual
  against a backslash expected there.
- Fix: `writeRecord` now returns `path.posix.join("docs", "work", filename)` (always `/`),
  matching git's real output on every OS. No change to collect-from-origin.mjs.
- Added one new test, "changedRecordPaths / row.recordPath: always forward-slash, never
  path.sep, regardless of OS" (`collect-from-origin.test.mjs`, after the existing
  `changedRecordPaths` test), asserting both `changedRecordPaths()`'s return value and a
  full row's `recordPath` contain no backslash and equal a literal forward-slash string.
- Verified on Windows itself, not just by inspection: scp'd collect-from-origin.mjs,
  collect-from-origin.test.mjs, and work-record.mjs (its only import) to
  C:\Temp\c1verify on benzh@ben-desktop.tail219acd.ts.net, ran `node --test
  collect-from-origin.test.mjs` there. Result: 22/22 pass (~61s; only noise was git's own
  autocrlf LF/CRLF advisory warnings, not test failures). Temp dir removed after.
- Gate (Linux, this worktree): 22/22 pass. Only file changed:
  scripts/collect-from-origin.test.mjs (25 insertions, 1 deletion; collect-from-origin.mjs
  untouched — confirmed by `git diff --stat`).
- Committed at 5e67b85605e8a946f8609980326e268e983d925a
  ("fix(collect-from-origin): round-5 Windows path-separator fix (skills-fable findings)").

## Next
Nothing planned. Push and forward-merge into build/one-launch-2 are the orchestrator's/
skills-fable's job per the findings doc, not mine (I never push).

## Open questions
None new. F6 is still a standing lead-only call (unchanged since round 2), not touched
this round — out of scope for this fix round.

## How to run my gate
`cd /home/ben/Code/wt-collect-from-origin-1-C1 && node --test scripts/collect-from-origin.test.mjs`
22/22 pass this round (Linux); also 22/22 on real Windows over SSH (see Done above).
