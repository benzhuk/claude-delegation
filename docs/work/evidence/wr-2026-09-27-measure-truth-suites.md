VERDICT: PASS 4ff8d94999333cd529372639317f1e4048e0675e

# Sealed test suite — two-host run for integration head 4ff8d94999333cd529372639317f1e4048e0675e

Branch: `build/measure-truth-1` (pushed to origin). Both hosts ran the sealed suite (`scripts/run-tests.mjs`) at this exact SHA, with 0 failures on each.

## A. Linux (this host — /home/ben/Code/wt-mt)

- `git rev-parse HEAD` → `4ff8d94999333cd529372639317f1e4048e0675e` (matches). Branch: `build/measure-truth-1`.
- `node scripts/run-tests.mjs` totals: **tests 2089, pass 2086, fail 0, cancelled 0, skipped 3, todo 0** (duration 19606.58ms).
- No failing tests. The 3 skipped tests:
  - `round-1: run FROM a linked worktree reached via a lowercased path, it still never appears in SAFE (case-insensitive fs)` — skipped: "linux filesystems are case-sensitive; a lowercased path would not resolve to the same worktree"
  - `round-2 MINOR: when git deregisters a worktree but an empty directory shell survives (Windows), the log says removed, not survived` — skipped: "this reproduces a Windows-only failure shape (RemoveDirectory refuses while a live process holds the directory as its CWD, after git has already unlinked its tracked files and deregistered it)"
  - `timeout terminates the exact owned descendant tree` — skipped (`# SKIP`)

### Four-read CLI, lane10 and lane16 fixtures (fresh `mktemp -d` per lane)

**lane10** (dir `.../scratchpad/lane10.yxI3Ki`):
- `node scripts/build-census.mjs --lead scripts/fixtures/four-read/sessions/lane10/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e.jsonl --json <dir>/c10.json --out <dir>/c10.md` — exit 0.
- `node scripts/four-read.mjs --record scripts/fixtures/four-read/record-lane10.md --census <dir>/c10.json` — exit 0.
- Work lost or stalled line, verbatim:
  > Work lost or stalled | 1 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); agent a314563636ff6b931 silent 216.8 min from 2026-09-26T22:44:29.665Z; ASKs unavailable (no --lead-slug)

**lane16** (dir `.../scratchpad/lane16.jxpBeM`):
- `node scripts/build-census.mjs --lead scripts/fixtures/four-read/sessions/lane16/588290d9-ee43-400b-a808-cf44c407171c.jsonl --json <dir>/c16.json --out <dir>/c16.md` — exit 0.
- `node scripts/four-read.mjs --record scripts/fixtures/four-read/record-lane16.md --census <dir>/c16.json` — exit 0.
- Work lost or stalled line, verbatim:
  > Work lost or stalled | 0 gap(s) over 30min stalled; 1 waiting-on-agents (41.8 min); ASKs unavailable (no --lead-slug)

### /tmp inode and sealed-home counts

| | before | after |
|---|---|---|
| `df -i /tmp` (last line) | `tmpfs 1048576 515309 533267 50% /tmp` | `tmpfs 1048576 521563 527013 50% /tmp` |
| `ls -d /tmp/sealed-home-* \| wc -l` | 457 | 463 |

(Inode usage and sealed-home directory count both grew modestly over the run — consistent with the suite's own sealed-home fixtures, no leak signal beyond that.)

## B. Windows (benzh@ben-desktop.tail219acd.ts.net)

- Bundle created on Linux: `git bundle create <scratch>/lane14.bundle build/measure-truth-1 refs/remotes/origin/main` — exit 0.
- `scp`'d to `C:/Temp/lane14.bundle` — exit 0.
- Single ssh cmd line: cloned the bundle into `C:\Temp\lane14-mt1-0927`, fetched `refs/remotes/origin/main`, checked out `4ff8d94999333cd529372639317f1e4048e0675e`, ran `node scripts/run-tests.mjs > C:\Temp\lane14-mt1-0927-suite.log 2>&1`, all chained with ` & `. Clone emitted a benign `warning: remote HEAD refers to nonexistent ref, unable to checkout` (the bundle carries no default HEAD ref; the explicit `git checkout -q <sha>` after it succeeded normally). Overall chain exit code: `DONE_EXIT_0`.
- `node scripts/run-tests.mjs` totals on Windows: **tests 2089, pass 2089, fail 0, cancelled 0, skipped 0, todo 0** (duration 651650.65ms). Origin/main was present (fetched explicitly), so the one test that needs it did not fail.
- 0 failures.

## Totals summary

| host | tests | pass | fail | skipped |
|---|---|---|---|---|
| Linux | 2089 | 2086 | 0 | 3 |
| Windows | 2089 | 2089 | 0 | 0 |

Both hosts: 0 failures at head 4ff8d94999333cd529372639317f1e4048e0675e.

## Log paths

- Linux suite log: `/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane14-linux-suite.log`
- Windows suite log (scp'd back to scratchpad): `/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane14-windows-suite.log`
- Windows suite log (original, left in place on Windows): `C:\Temp\lane14-mt1-0927-suite.log`

## Leftover paths (left in place per instructions)

Windows (left in place, per instructions):
- `C:\Temp\lane14.bundle` — the transferred git bundle
- `C:\Temp\lane14-mt1-0927` — the Windows clone/checkout used for the test run
- `C:\Temp\lane14-mt1-0927-suite.log` — the Windows suite log (source of the copy above)

Linux scratchpad (temp files created by this run, left in place per hard rule against deleting):
- `/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane14.bundle` (the bundle built for transfer to Windows)
- `/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane14-linux-suite.log`
- `/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane14-windows-suite.log`
- `/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane10.yxI3Ki/` (c10.json, c10.md, fourread10.out)
- `/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane16.jxpBeM/` (c16.json, c16.md, fourread16.out)

Note: the scratchpad also contains numerous pre-existing files/dirs from earlier, unrelated sessions (e.g. `lane10-census.json`, `lane16-lead.jsonl`, `lane10-record.md`, various `home-*`, `repo-*`, `p3-*`, `p4-*` dirs) — these were not created by this run and were left untouched.
