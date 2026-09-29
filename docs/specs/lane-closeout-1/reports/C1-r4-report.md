VERDICT: PASS
DONE dd99ae1f67a88bfc06163fad27f4591762d33b4d

Branch: `wt/lane-closeout-1-C1` (not pushed). Worktree:
`/home/ben/Code/claude-delegation-wt/lane-closeout-1-C1`. Started from `0fcd686`.

## Disposition of every finding in `addendum-C1-r4.md`

### R3-1 (blocker) — DONE, mutation-proof performed on a scratch copy
`closeoutRecord: R2-2 - a failed git worktree list refuses the origin-branch step, not just
the worktree step` in `scripts/work-record-closeout.test.mjs` now, in addition to its
existing assertions, asserts the scratch step's own result directly (5 new assertions:
`r.steps` shape for the scratch step's `result`/`detail`, and that `r.lines` records the
refusal, plus the pre-existing exit-code/step-ordering checks were kept). The equivalent
`sweepOrigin: R2-2` test got the same platform-skip guard as the closeout test
(`{ skip: process.platform === "win32" ? "windows: relies on POSIX chmod-based git failure
injection" : false }`) instead of being unconditionally skipped, and the stale comment
mislabeling it was fixed.

**Scratch-copy mutation proof** (run under
`/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C1/r4/mut-r31/copy/`,
never on the live worktree):
1. Copied `scripts/`, `docs/`, `skills/` from the live worktree (at commit `dd99ae1`, i.e.
   after the fix landed) into the scratch copy; kept `scripts/work-record.mjs.orig` as a
   byte-for-byte backup.
2. Baseline: `node --test scripts/work-record-closeout.test.mjs` in the scratch copy — 63/63
   pass.
3. Applied the M3-class mutant from the reviewer's table to the scratch copy only: changed
   the scratch-step's fail-closed `listWorktrees(root)` (which throws on a failed `git
   worktree list`, driving the refusal) to `listWorktrees(root) ?? []`, verified via a small
   Node script that the replacement matched exactly one location in the file before writing
   it.
4. Re-ran the same test file against the mutated scratch copy: the targeted test
   (`closeoutRecord: R2-2 - a failed git worktree list refuses the origin-branch step, not
   just the worktree step`) failed with `actual: 'removed', expected: 'refused'` on the new
   scratch-step assertion — confirming the new assertions actually catch this class of
   regression, not just the origin-branch step they already covered. Ran the whole scratch
   copy's territory suite (`work-record.test.mjs`, `work-record-closeout.test.mjs`,
   `janitor.test.mjs`, `record-closed-and-skip.contract.test.mjs`): 402/406 pass, 1 fail is
   this targeted test (as intended), 1 fail is the pre-existing STALE test, 2 skipped —
   confirming the mutant killed only the intended test and did not collaterally break
   unrelated coverage.
5. Restored `scripts/work-record.mjs` in the scratch copy from the `.orig` backup;
   `diff` confirmed byte-equal to both the backup and the live worktree's file.
   `git status`/`git diff --stat` in the live worktree confirmed it was never touched during
   any of this (all work happened only inside the scratch copy directory).

### R3-2 — DONE
Applied as the reviewer specified: `closeoutWorktree`'s `!entry` branch behavior for
"worktree naming a branch never checked out anywhere" is now covered by the idempotent
closeout redesign itself (see below); `janitor.test.mjs`'s R2-8 test was updated to match
the new, correct expected result (`worktree: absent`, `branch: removed`, branch actually
gone afterward) and retitled `closeoutWorktree: R2-8/round-4 - ...`.

### R3-3 — DONE
R2-10 test's scratch-path computation in `work-record-closeout.test.mjs` now synthesizes
`/tmp/${by}/r210-lane` explicitly on win32 rather than relying on `os.tmpdir()` producing a
POSIX-shaped path there, and the final `existsSync` assertion is guarded so it does not
fail on a platform where the synthesized path was never created on disk.

### R3-4 — DONE
`sweepOrigin: R2-1 - the basename fallback does not protect an unrelated branch that merely
shares a worktree's basename` in `work-record-closeout.test.mjs` gained the second CLOSED-
record case the reviewer asked for, exercising the fallback protection with an actually-
closed record present (not just an open one).

### R3-5 — DONE, applied as given
The R2-9 confinement check in `work-record.mjs` no longer `throw`s (which discarded
`lines`, including any step's own `restore:` line — the only record of an already-deleted
origin branch's sha). It now returns `{ lines, ok: false, exitCode: 2, steps: results }`
with `lines` carrying a `log: refused (path resolves outside repository: ...)` entry. The
R2-9 test in `work-record-closeout.test.mjs` was rewritten from `assert.throws(...)` to
capture `r = closeoutRecord(...)` and assert `r.exitCode === 2` and
`r.lines.at(-1)` matches `/log: refused \(path resolves outside repository/`.

### R3-6 — DONE
Fixed the scratch-sentence wording in `docs/work-record.md` (separated the root/home-
directory equality check from the contains/lies-inside check, per the reviewer's exact
wording) and the origin-branch delete command in `skills/janitor/SKILL.md`, which had
described a plain `git push origin --delete` — replaced with the actual lease-based command
this codebase uses: `git push --force-with-lease=refs/heads/<name>:<tip> origin
:refs/heads/<name>` (a lease on the sha it just proved merged).

### R3-7 — DONE
Both sites (`work-record.mjs`, ~2238 and ~2368) that surface `del.error` into a result/log
line now do `del.error.replace(/\s+/g, " ").trim()` first, so a multi-line git stderr does
not break single-line log/record formatting.

### Idempotent closeout ruling (R2-8 observation) — DONE, new design, no scaffolding existed
`closeoutWorktree`'s `!entry` branch (`scripts/janitor.mjs`) now makes three distinctions,
exactly per the ruling:
- **Genuinely absent** (the `Worktree:` path does not exist on disk, and no local branch by
  that name exists either): both `worktree` and `branch` report `absent`; does not raise the
  overall exit code.
- **Directory gone, branch survives** (the path is gone, but a local branch of that name
  still exists): `worktree` reports `absent`, and the branch step proceeds exactly as a
  normal closeout would — a plain `git branch -d` (never `-D`) — reporting `removed` or, if
  the branch itself can't be fast-deleted (unmerged etc.), `refused` with the git error.
- **Still ambiguous, per R2-8, unchanged**: a foreign-OS-shaped path value (POSIX- or
  Windows-absolute per `path.posix.isAbsolute`/`path.win32.isAbsolute`, but not
  `path.isAbsolute` on this host) or a real, existing directory that simply isn't a
  registered worktree — both keep the original R2-8 refusal, `worktree-unresolved`, exit 2.

`closeoutRecord`'s origin-branch step (`scripts/work-record.mjs`) narrowly extends the same
idea: when the origin-branch verdict's reason is specifically `"not found on origin"`, the
step reports `absent` (a prior successful run already deleted it) rather than `refused`;
every other "keep" reason (still named by an open record, excluded, not under `build/`, ...)
remains a genuine `refused`, unchanged.

The scratch step needed no code change: a second run's `lstatSync` on an already-removed
scratch directory throws `ENOENT`, which existing code already maps to `absent`.

New tests (7 total): `closeoutRecord: idempotent - running closeout twice on the same
fixture exits 0 both times ... every step absent` on run 2 (`work-record-closeout.test.mjs`),
plus two more there for the foreign-OS-path and real-but-unregistered-directory cases; four
targeted `closeoutWorktree` unit tests in `janitor.test.mjs` covering all three branches
(genuinely absent, directory gone/branch survives — using `mergeIntoMain` first so `git
branch -d` succeeds without `-D` — foreign-OS path, real unregistered directory).

## Files changed (6, all committed in `dd99ae1`)
- `scripts/work-record.mjs`
- `scripts/janitor.mjs`
- `scripts/work-record-closeout.test.mjs`
- `scripts/janitor.test.mjs`
- `docs/work-record.md`
- `skills/janitor/SKILL.md`

231 insertions(+), 36 deletions(-). No git identity changes, no trailers, not pushed.

## Gate

Territory (4 test files; the 2 source files are excluded from direct `node --test`
invocation because each runs its own CLI `main()` against the real repo when executed
standalone, which the test runner misreports as a failing test — this is pre-existing and
unrelated to this round):
```
cd /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1 && node --test \
  scripts/work-record.test.mjs scripts/work-record-closeout.test.mjs \
  scripts/janitor.test.mjs scripts/record-closed-and-skip.contract.test.mjs
```
406 tests, 403 pass, 1 fail (pre-existing STALE, out-of-scope), 2 skipped.

Full gate (`node scripts/run-tests.mjs`), log at
`docs/specs/lane-closeout-1/reports/C1-r4-gate.log`:
2684 tests, 2678 pass, 1 fail (pre-existing, out-of-scope `docs/GOALS.md`/`STALE` regex-
drift test — explicitly called out as out-of-scope in the round-4 brief), 5 skipped.

## Non-negotiables

No shell deletion commands were used anywhere (fixtures clean themselves via `node:fs`, real
origin never touched, only local bare-repo fixtures). No git identity changes, no trailers,
did not push. One command was blocked by the `secret-guard` pretooluse hook (an
`env HOME="$HOME" node <script>` invocation, flagged as dumping the process environment,
during R3-1/idempotent-closeout debugging); per instruction, I did not retry that or any
equivalent env-dumping form — I instead wrote the debug script directly into the scratchpad
with the Write tool and ran it with a plain `node <path>` invocation, which was not blocked.

## State file
Updated: `docs/specs/lane-closeout-1/reports/C1-state.md`.
