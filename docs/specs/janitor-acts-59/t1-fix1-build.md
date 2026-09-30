VERDICT: PASS

# Lane 59 T1 fix round 1: reclaim and path-safety

Territory: scripts/path-safety.mjs + path-safety.test.mjs, scripts/reclaim.mjs +
reclaim.test.mjs (new), scripts/work-record.mjs (path-safety use only, work-record.test.mjs
imports only, work-record-closeout.test.mjs pins the refactor end-to-end).

GOAL served: "work lost or stalled" (the daily-act deleter must never remove a live worktree,
a mount, or a same-uid file it wasn't asked for — every one of these 14 findings was a way
`reclaim`/the act run could destroy or lose work it wasn't told to touch). Nearest NOT: "a
symptom fix" — each fix addresses the named root cause (an upward walk that never existed, a
mount baseline computed from the wrong path, an uncaught throw, a stale ordering), not just
the symptom the reviewer's probe happened to trip.

Base: c12e190a9519186f5d5254726138099409b0497c. Final commit: cb5cda0caa87774186715984fd18e187bf28b198.
Input: docs/specs/janitor-acts-59/t1-review.md (14 findings), ruling-r2.md (adopts all 14,
settles HIGH1's upward walk and HIGH2's fail-closed mount check).

## Gate results
- Territory: `TMPDIR=/var/tmp node --test scripts/path-safety.test.mjs scripts/reclaim.test.mjs
  scripts/work-record.test.mjs scripts/work-record-closeout.test.mjs` → 388 pass, 0 fail.
- Full suite: `TMPDIR=/var/tmp node scripts/run-tests.mjs` → 3172 pass, 0 fail, 5 skipped,
  1 todo, exit 0, leak check: 0 new temp entries.

## Per-finding table

| # | Fix | Test | Red before (c12e190) | Green after |
|---|-----|------|----|----|
| HIGH1 | reclaim.mjs: `checkAncestorsForGit` walks every ancestor of an S/T target up to the filesystem root, refusing a `.git` FILE (linked worktree) or a `.git` DIR with non-empty `worktrees/` above the target, or containment in that repo's own `git worktree list` | "HIGH1: a target INSIDE a linked worktree living inside a T dir is refused..." | yes (exit 0, would delete uncommitted work) | yes |
| HIGH2 | reclaim.mjs: mount-crossing walk now baselines `st_dev` on the **class root**, not the target; new `checkMountsUnderClassRoot` reads `/proc/self/mountinfo` (Linux) / `mount` (darwin) to catch same-device bind mounts st_dev can't see; unreadable table refuses | 4 tests: class-root st_dev baseline (mutation M5-provable), injected-mountinfo same-device bind, unreadable-table fail-closed, and a real `unshare -rm` end-to-end bind-mount test (skips with a stated reason if `unshare -rm` is unavailable; ran and passed here) | yes (3 of 4; the 4th passed old code too but for an unrelated reason — proven instead by the M5 mutation below) | yes |
| MEDIUM3 | reclaim.mjs: `rmSync` wrapped in try/catch; ENOENT prints `absent`, any other error prints `failed ... (may be partially removed)` and continues to later arguments instead of an uncaught throw | "MEDIUM3: an rmSync failure prints a failed line and does not crash..." | yes | yes |
| MEDIUM4 | reclaim.mjs: `validateB` refuses a branch checked out in any worktree (`git worktree list` lookup), dry-run reports the same reason | "MEDIUM4: B refuses a merged branch still checked out in a SAFE worktree..." | yes | yes |
| MEDIUM5 | reclaim.mjs: `removed B`/`removed W` lines carry `sha` and `restore: <hint>`; a partial W removal prints its own `partial W ... restore: ...` line instead of a bare stderr error | 2 tests (B and W restore-hint lines) | yes | yes |
| MEDIUM6 | reclaim.mjs: `validateArg` rewrites a `posixTmpRoot`/`posixVarTmpRoot` prefix to its realpath before any class check (macOS: `/var/tmp` → `/private/var/tmp`), so T works there for its own paths; a symlink below the root is still refused | 2 tests (symlinked-root accept; below-root symlink still refused) | yes (the accept test) | yes |
| MEDIUM7 | Missing tests added, each shown to discriminate under its own mutation: win32 `claude` segment (via a new `pImpl(ctx)` — `path.win32` when `ctx.platform==="win32"` — threaded through `checkS`/`checkT`, now exported for direct unit testing), darwin unmeasured refusal, T/S mode (group/world-writable) checks | 6 tests (M4-provable claude-verify.lock, win32 claude accepted, win32 T delegation- accepted, darwin unmeasured, 2× M7-provable mode checks) | yes (win32/mode tests; the two already-correct old-code cases pass either way, as expected) | yes |
| MEDIUM8 | reclaim.test.mjs: tightened the loose `/contains/` regex to `/contains a path in git worktree list/`, which only the repoRoots wiring (not F3's own downward walk) can produce | same test, regex tightened; **mutation-proof**: M1 (`repoRoots: repoRoots.repoRoots,` → `repoRoots: [],`) turns it red | mutation-red (shown, then reverted — file diff-identical after) | yes |
| LOW9 | reclaim.test.mjs: the kill-switch test's stub now checks the switch **name** (`(name) => name === "reclaim"`) instead of ignoring it | same test; **mutation-proof**: M2 (`switchedOffImpl("reclaim")` → `switchedOffImpl("janitor-act")`) turns it red | mutation-red (shown, then reverted) | yes |
| LOW10 | reclaim.mjs: `validateW`'s idle-floor refusal now labels NaN as "idle age unknown" and a negative value as "mtime in the future", never the confident "active in last 24h" (ruling r1); added `ctx.idleHoursImpl` injection point so this is testable without a real unreadable fs source | 2 tests (NaN, negative) | yes (old code has no `idleHoursImpl`, throws) | yes |
| LOW11 | reclaim.mjs: the F3 walk's lstat/readdir catches now refuse (`WalkRefusal`) on any non-ENOENT/ENOTDIR error instead of silently treating an unreadable entry as absent/empty | "LOW11: an unreadable subdirectory during the walk refuses the whole invocation..." | yes | yes |
| LOW12 | path-safety.mjs: new `escapes(rel)` helper (`rel === ".." \|\| rel.startsWith(".."+sep) \|\| isAbsolute`) replaces the loose `rel.startsWith("..")` in root membership and both containment directions, so a segment literally named `"..repo"` is no longer misread as an escape (which failed toward ALLOW) | 2 tests in path-safety.test.mjs | yes (both contains/lies-inside missed the `..repo` protected path) | yes |
| LOW13 | reclaim.mjs: immediately before an S/T `rmSync`, a fresh `finishST` re-check runs; a refusal there prints `failed ... changed since validation (...)` instead of proceeding | "LOW13: a target that becomes a symlink between validation and removal is refused at the re-check..." | yes | yes |
| LOW14 | work-record.mjs: `removeScratchDirectory` now calls `checkRemovablePath` twice — first with `repoRoots: []` (absent/refused decided before any git call), then an explicit "is the repo root" equality check, then `listWorktreesImpl`, then the full repoRoots check — restoring dff1e00's exact ordering | "closeoutRecord: LOW14 - an ABSENT scratch path is reported absent, not refused, even when git worktree list cannot be read" | yes | yes |

## Mutation proofs (findings 7, 8, 9)
Each mutation was applied to the committed, fixed `scripts/reclaim.mjs`, the named test run
to confirm red, then the file restored and `diff` confirmed byte-identical to the pre-mutation
copy before moving on:
- **M1** (MEDIUM8): `repoRoots: repoRoots.repoRoots,` → `repoRoots: [],` — "T dir containing a
  path from the cwd's own git worktree list is refused" goes from pass to
  `/contains a path in git worktree list/` mismatch (actual: "contains a repo with linked
  worktrees elsewhere at .../repo/.git").
- **M2** (LOW9): `ctx.switchedOffImpl("reclaim")` → `ctx.switchedOffImpl("janitor-act")` —
  F14's kill-switch test fails (`/reclaim switched off/` no longer matches).
- **M4** (MEDIUM7): win32 `segments[0].toLowerCase() === "claude"` → `/^claude/i.test(...)` —
  the claude-verify.lock test fails (`checkS` now returns `{ok:true,...}` instead of `null`).
- **M5** (MEDIUM7): the walk's `st.dev !== baseDev` comparison disabled (`if (false && ...)`)
  — the class-root-baseline test fails (exit 0 instead of 3, nothing refused).
- **M7** (MEDIUM7): the mode check `(st.mode & 0o022) !== 0` disabled (`if (false && ...)`) —
  both T-dir and S-dir mode tests fail (exit 0 instead of 3).

## Deviations / assumptions
- Added a `pImpl(ctx)` helper and exported `checkS`/`checkT` from reclaim.mjs (not previously
  exported) so the win32 positional-matching logic is unit-testable with `path.win32`
  injection — this host's real `path` module is POSIX regardless of `ctx.platform`, the same
  documented limitation path-safety.test.mjs's own win32 test already accepts ("only pins that
  the absolute gate itself is passed, not a full resolve"). Production behavior on a real
  win32 host is unaffected (`path` already IS `path.win32` there).
- Added `ctx.idleHoursImpl` (defaulting to the real `idleHours`) and `ctx.execFileSyncImpl`
  (defaulting to the real `execFileSync`) as injection points in reclaim.mjs, purely for
  LOW10 and HIGH2's darwin-mount testability. Neither changes default behavior.
- HIGH2's darwin mount-table check (`mount` output, parsed by `/ on (.+?) \(/`) is implemented
  but not measured on a real Mac — no darwin host available. It fails closed (SKIP/refuse) if
  `mount` errors, consistent with ruling r2's "fails closed" requirement.
- Sealed a new test's child environment (`execFileSync("unshare", ["-rm","bash","-c", "...
  node ..."])`) with `childEnv(ctx.home)` per this repo's own N2 guard
  (skills/multi/scripts/hooks.test.mjs), discovered only when the full suite ran — not part of
  the 14 findings but required for the gate to pass cleanly.

## Seam note for T2 (not edited — out of T1's territory, per ruling r2)
janitor.mjs's own `pathWithin` (used by `closeoutWorktree` and elsewhere) shares LOW12's exact
defect: `rel.startsWith("..")` also matches a path segment literally beginning with two dots
(e.g. `"..repo"`), misreading it as an escape — which fails toward ALLOW (missing a
containment refusal), not toward refuse. The fix mirrors path-safety.mjs's new `escapes()`
helper (`rel === ".." || rel.startsWith(".."+path.sep) || path.isAbsolute(rel)`). Not applied
here; reclaim.mjs currently relies on `pathWithin` only for the `cwd`-containment check (F8),
which is a narrower, lower-risk surface than path-safety's repoRoots checks, but the shared
defect should still be fixed at its source in a T2-owned round.

## Scratch left in place (not deleted, per brief)
- /var/tmp/delegation-l59t1f-nWEY — old/new/mutated copies of reclaim.mjs, work-record.mjs,
  path-safety.mjs used for red/green and mutation-proof verification, plus captured log
  `old-run.log`/`old-run2.log`.
- /var/tmp/delegation-l59t1f-mnttest-1Qv6, /var/tmp/delegation-l59t1f-dbg-*,
  /var/tmp/delegation-l59t1f-dbg2*, /var/tmp/delegation-l59t1f-dbg3*,
  /var/tmp/delegation-l59t1f-sent*, /var/tmp/delegation-l59t1f-dbgroot* — manual `unshare -rm`
  bind-mount probes used to design and validate HIGH2's fix before writing the automated test.
- /var/tmp/lane-59/t1-fix1-fullsuite.log — the full-suite run's output.

No file outside this territory was edited. No real host path, worktree, branch, or settings
file was ever a removal target — every test runs against fixtures under its own mkdtemp
(mostly under `TMPDIR=/var/tmp`), and every reclaim call in a test is either `--dry-run` or
targets a throwaway fixture.
