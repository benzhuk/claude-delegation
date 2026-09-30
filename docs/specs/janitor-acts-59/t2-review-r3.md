VERDICT: APPROVE dbce299c3dcbe6d8faa7ba8dceb84f62b1b77c1a

# Lane 59 T2 delta re-review, round 3: fix commit dbce299 on top of 556f386

Scope: T2's files only. Checklist: t2-review-r2.md, findings R2-1 to R2-6. I also hunted for regressions this commit introduced.

Method:
- Probes, fixtures and a scratch archive copy (`git archive dbce299`) are in `/var/tmp/l59r3-KLnI` (mktemp).
- Mutations ran only on that copy. It was restored and `cmp`-verified after each one.
- Nothing in `/var/tmp/lane-59/wt` was written, and `git status --short` is empty.
- HEAD moved to `4cf13be` during the review, a T1 docs-only commit (t1-review.md and the work record). `git diff dbce299 HEAD` on T2's files is empty.
- No janitor, reclaim or installer run touched a real host.
- Real state was checked by stat only, before and after the two test runs, and nothing changed:
  - `~/.claude/settings.json` mtime: 1790718765;
  - janitor-record unit mtimes: 1790529480;
  - rollout-backups: 9 entries;
  - `~/.local/bin/reclaim`: absent.
- Denials: none.
- Finished 7:41 PM NY, 9/29.

## Test runs

**Territory**, `TMPDIR=/var/tmp node scripts/run-tests.mjs scripts/janitor.test.mjs scripts/mirror-shared-skills.test.mjs`:
- 161 tests: 158 pass, 0 fail, 2 skipped, 1 todo.
- Leak check: 0.

**Full suite**, `TMPDIR=/var/tmp node scripts/run-tests.mjs`, run once:
- Exit 0. 3154 tests: 3148 pass, 0 fail, 5 skipped, 1 todo.
- Leak check: 0.
- The only `✖` lines are run-tests' own deliberately failing self-test probe.

## R2 findings: all six closed

| # | status | evidence |
|---|---|---|
| R2-1 | **Closed** | My probe-idle.mjs, re-run: the three EACCES shapes (matched slug dir, `~/.claude/projects`, `~/.codex/sessions`) now read **NaN**; all ten other rows are unchanged. New probes: a fresh rollout at mode 000 gives NaN; a fresh rollout caught mid-write (its first line truncated) gives 48.00, not NaN, so the parse exemption holds and one mid-write session cannot block the host; `.claude` without `projects/` plus `.claude-empty` gives 48.00 (ENOENT is still "empty"). Mutations: dropping `unknown` from the return fails 1 test; making `unreadable()` a no-op fails 1 test |
| R2-2 | **Closed** | A rollout in the dir of 4 days ago, written now, reads 0.00 (it read 48.00 on 556f386). Mutation: loop back to `back <= 1` fails 1 test. The date formatters are now hoisted out of the loop |
| R2-3 | **Closed** | `q()` uses the inert character set: single quotes on POSIX; on win32, double quotes with `\` turned into `/`; null otherwise. Both hints return null unless every argument is inert, and the sha is always kept. The new test (`feat$x` gives restore null plus a 40-hex sha) covers the worktree and the branch row. Mutation: `q` back to `JSON.stringify` fails 3 tests |
| R2-4 | **Closed** | probe-open.mjs darwin-no-lsof now gives `in-use check failed`. The linux rows are unchanged (`a process has its cwd here` for cwd = wt, wt/sub, and a ref given through a symlink). The win32 simulations are unchanged: round-trip, `in use`, and rename-back failure stopping the loop with a record. Mutation: label collapsed fails 1 test |
| R2-5 | **Closed** | The clause is exactly the patch: the dest's dir must equal LOCAL_BIN, the basename must match, and it must be the complement of the collectSources gate. The new test drops a `reclaim`-named entry outside LOCAL_BIN; the finding 14 test still passes. Mutation: dir clause removed fails 1 test |
| R2-6 | **Closed** | The finding 9 test passes a fixture `home`. The file deletes `CODEX_HOME` and `CLAUDE_CONFIG_DIR` at the top (its own process). The source scanner flags any `applySafe(state, …, {now…})` with no `home`. Mutation: reverting the one `home` makes the scanner test fail |

## Regression hunt (dbce299 only): no defects found

- **Speed** (probe-perf.mjs, 2000-file fixtures, ms per call):

  | fixture | ms per call |
  |---|---|
  | empty home (the 30-day window adds about 62 ENOENT readdirs per Codex home) | 5.2 |
  | 2000 project dirs, plus 2000 transcripts in the matched slug | 17.2 |
  | 2000 fresh 22 KB rollouts | 141.1 |

  These are the same order as round 2's measured trial (9.6 / 20.9 / 135.7). Dry-run never calls idleHours.
- **Host-wide blocking:** none introduced. The two exemptions (per-pid `/proc`, Codex parse errors) are in place. This host has 0 unreadable entries under the session sources (measured in round 2). The mid-write probe above confirms a fresh unparsable rollout does not turn every worktree NaN.
- **Hint regex:** `/^[A-Za-z0-9._/@+=:,~ -]+$/`. The unescaped `/` inside the class is valid JS, and `-` is last, so it is literal. On POSIX, single quotes around this set are inert. A path with non-ASCII characters gets a null hint (the sha is kept), which is the safe direction.
- **R2-5 cost:** `isDurablePath` and `isLinkedWorktree` run only after the dir and basename clauses short-circuit true, so at most two git calls per mirror run.
- **Tests touching real state:** no writes (the stat snapshot is unchanged and the leak check is 0). With R2-6, janitor.test.mjs no longer reads the real home under a plain `node --test`.

## Notes (not counted)

- **R2-4 test portability.**
  - Windows: it runs `sh -c "command -v git"` and symlinks the result. The Windows suite evidence shows `sh` on PATH (collect-from-origin's F1 sh test passed in `wr-2026-09-27-ledger-both-halves-windows-suite.log`) and symlink creation working. Under Git's sh, though, `command -v git` returns an MSYS-style path, so the symlink would dangle. The test asserts nothing that needs git to resolve there: `platform` is forced to darwin, lsof is missing, so the result is "unknown". I expect it to pass, but it is unverified on a live Windows host.
  - A `skip` on win32 would be the cleaner shape, since the darwin simulation adds nothing there.
- **Builder deviation.** The builder report says it ran `git worktree remove --force` on its own scratch red-before worktree (`/var/tmp/delegation-l59t2f-xC2W/old-556f386`) against this round's no-delete instruction. It reported this itself. The shared worktree was untouched, and no content, commit or branch was lost. This is for the lead's record.
- **Seam for T1, unchanged from round 2.** reclaim.mjs labels a NaN refusal "active in last 24h". The direction is safe.
- **Scratch left in place:** `/var/tmp/l59r3-KLnI` and `/var/tmp/l59r2-e0CK`.

## C4 fields (R2-1, the headline fix verified this round)

Cause: idleHours' catch blocks treated EACCES/EIO/EMFILE like ENOENT, so an unreadable session source let the backdated git-admin mtimes decide "idle".
Discriminating check: fixture with the matched `~/.claude/projects/<slug>` at mode 000, a fresh transcript inside and other signals backdated 48 h. It gives 48.00 on 556f386 and NaN on dbce299 (re-measured). The mutation that drops `unknown` from the return re-fails the R2-1 test.
Fix location: scripts/janitor.mjs idleHours: the `unreadable(err)` helper, the catch blocks in noteMtime, checkProjectsDir and the Codex scan (I/O split from JSON parse), and `if (unknown || mtimes.length === 0) return NaN`.
Simplification: one `unknown` flag set by one helper (ENOENT/ENOTDIR means empty, anything else means unknown) replaces per-site judgment. Per-pid `/proc` reads and Codex parse errors are the only exemptions.
