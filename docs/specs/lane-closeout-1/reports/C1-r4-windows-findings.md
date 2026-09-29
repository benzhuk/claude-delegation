# C1 round 4: Windows second-host gate findings (lead)

Suite: build/lane-closeout-1 at cee1dafd665b26f53cc188a0209a132b86d103a4 (C1 dd99ae1 merged), on ben-desktop (win32).
Log: docs/work/evidence/wr-2026-09-28-lane-closeout-win-suite-cee1daf.log. The totals are 2775 tests: 2757 pass, 4 fail, 14 skipped. The GOALS.md STALE failure is pre-existing; `probe` is an intentional child run.
Hetzner at the same sha: 2775 tests, 2769 pass, 1 fail (pre-existing), 5 skipped.

## W1 (blocker, code): on win32, a posix-shaped Worktree: value is reported absent
- Tests: scripts/janitor.test.mjs:2575 and scripts/work-record-closeout.test.mjs:1556.
- On win32, the two steps come back `absent/absent`. Both tests expect `refused worktree-unresolved` and `refused worktree-unresolved (not checked)`, with exit 2.
- Cause: `path.win32.isAbsolute('/x')` is true, because the value is rooted on the current drive. So a Linux value such as `/home/ben/...` resolves to `C:\home\ben\...`, is missing on disk, and falls into the round-4 `absent` branch.
- This breaks the lead's ruling ("never silently absent"). A record opened on Linux and closed out on Windows would exit 0 as if it were done.
- Fix: before the absent branch, classify the value's form.
  - On win32, a value that begins with a single `/` and is not UNC (`//` or `\\`) is foreign.
  - On posix, a value with a drive letter (`^[A-Za-z]:[\\/]`) or a leading `\\` is foreign.
  - A foreign value is `refused worktree-unresolved`, and the branch step becomes `refused worktree-unresolved (not checked)`, exit 2.
  - Use one shared helper, the same one the scratch step's `other-platform path` rule uses if it fits. Do not add a second classifier.
- The two existing tests are the spec. Do not change them.

## W2 (test-only): R2-8 compares a normalized path to a native path
- Test: scripts/janitor.test.mjs:2490.
- actual `C:/Users/.../build/p9-1`, expected `C:\Users\...\build\p9-1`.
- Fix the test: compare through the module's own path normalizer, or through `path.resolve` on both sides. Keep the assertion that the value resolves to the real linked worktree. Do not loosen it to a basename match.
