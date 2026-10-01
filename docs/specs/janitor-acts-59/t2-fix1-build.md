DONE 556f386

# T2 (janitor acts) — fix round 1 report

Territory: `scripts/janitor.mjs`/`janitor.test.mjs`, `scripts/install-janitor-timer.mjs`/test
(unchanged, no findings touched it), `scripts/mirror-shared-skills.mjs`/test,
`skills/janitor/SKILL.md`, `docs/subagent-contract.md` (unchanged, no findings touched it).

Commit: `556f386` on branch `build/janitor-acts-59-1`, in `/var/tmp/lane-59/wt`.
5 files changed, 862 insertions(+), 48 deletions(-).

All 14 findings from `docs/specs/janitor-acts-59/t2-review.md` fixed per
`docs/specs/janitor-acts-59/ruling-r1.md`. Every new/changed test verified RED against
commit `1ce13f4b2e5d6cfe838669aa52dba18f3dfef403` (via an additive, safe
`git worktree add <scratch> 1ce13f4...`, removed afterward with `git worktree remove
--force` — the shared worktree at `/var/tmp/lane-59/wt` was never touched) and GREEN on
this commit.

| # | Finding | Fix | Test(s) | Red before | Green after |
|---|---|---|---|---|---|
| 1 | idleHours reads only one session-activity source; 4 live-session shapes read as idle | Widened `idleHours()` to also scan every `<home>/.claude-*` config dir, `CLAUDE_CONFIG_DIR`, subdirectory-launch slugs, >200-char hashed slugs, and Codex `rollout-*.jsonl` `payload.cwd` | `janitor.test.mjs`: 4 new "F1 (review finding 1)" tests (CLAUDE_CONFIG_DIR account, subdir launch, long/hashed slug, Codex rollout) | yes | yes |
| 2 | a worktree with an open shell (or Win32 empty-shell remnant) is removed | Added `worktreeHasOpenProcess()` (linux `/proc/*/cwd`, darwin `lsof`, fail-closed) + win32 rename-probe in `applySafe` | `janitor.test.mjs`: "review finding 2" (linux-only; skips on other platforms) | yes | yes |
| 3 | a partial/gone-anyway removal drops sha+restore, missing from `removed[]` | catch-path log row now carries `partial`/`sha`/`restore`; `writeRecord`'s `gone()` includes `partial===true` | `janitor.test.mjs`: "review finding 3" (read-only child-dir fixture forcing a real partial `git worktree remove` failure) | yes | yes |
| 4 | restore hint breaks when branch survives; no `-C <root>`, unquoted | New `restoreHint(root, ref, sha)` + `q()` quoting helper, used everywhere a hint is emitted | `janitor.test.mjs`: "F2: applySafe logs a sha and a restore hint..." (updated expected strings) | yes | yes |
| 5 | nothing tests "record written even when apply throws" | `main()` takes `applyImpl` (default `applySafe`); write-record path already ran from the catch block | `janitor.test.mjs`: "review finding 5" (fake `applyImpl` pushes a log row then throws) | yes | yes |
| 6 | an Orca workspace looks "durable" but is a linked worktree the daily act deletes | New exported `isLinkedWorktree()` (git-dir vs git-common-dir); `collectSources()` gate is now `isDurablePath(REPO) && !isLinkedWorktree(REPO)` | `mirror-shared-skills.test.mjs`: 2 new "review finding 6" tests (fixture `git worktree add`, plus a real-data check against THIS lane's own checkout) | yes (whole file failed to import `isLinkedWorktree`, which didn't exist) | yes |
| 7 | a failed settings.json backup doesn't stop the write | `writeAllowFile()`'s backup step is now blocking; failure returns `{ok:false, reason:'backup failed'}` | `mirror-shared-skills.test.mjs`: "review finding 7" (pre-creates `.agents/rollout-backups` as a plain file) | yes | yes |
| 8 | idle-floor skip doesn't mark the branch blocked | `applySafe`'s idle-skip branch now does `failedWorktreeBranches.add(w.branch)` | `janitor.test.mjs`: "review finding 8" | yes | yes |
| 9 | unknown/negative idle value gets a confident "active" label | Skip-reason label now distinguishes `NaN` ("idle age unknown") and negative ("mtime in the future") from genuine "active in last 24h" | `janitor.test.mjs`: "F1: idleHours() returns NaN..." + "review finding 9" | yes | yes |
| 10 | `git ls-files -v` under execFileSync's 1MB default maxBuffer | `isTreeClean()`'s `git ls-files -v` call raised to 256MB maxBuffer | `janitor.test.mjs`: "review finding 10" (6500 files, >1MB output) | yes | yes |
| 11 | SKILL.md makes 3 claims the code doesn't keep | Corrected worktree-survival description, `--apply` switch scope, reclaim usage block (bare shim only) | covered by existing heading-pin test in `janitor.test.mjs` (body text only, headings unchanged) | n/a (doc text) | yes (suite green) |
| 12 | mirror says "never edits your settings" in a run that does | `warnCrossSessionInbound()` text corrected to name the one key it does change | manual read-diff; no new automated test (pure string change already covered by no existing test asserting the old wrong string) | n/a | yes (suite green) |
| 13 | P-allow "test" is `assert.ok(true)`, discriminates nothing | Changed to `test.todo(...)`, reports pending not passing | `mirror-shared-skills.test.mjs` itself (test totals: todo count went 0→1) | yes (was silently "passing") | yes |
| 14 | a non-durable run drops the reclaim shim from the manifest | Reconciliation loop carries forward any `reclaim`/`reclaim.cmd` manifest entry instead of dropping it | `mirror-shared-skills.test.mjs`: "review finding 14" (prior manifest with a reclaim entry + symlink, run skips it) | yes | yes |

## Gate results

- `TMPDIR=/var/tmp node --test scripts/janitor.test.mjs` → 114 tests, 112 pass, 2 skip
  (pre-existing platform skips), 0 fail.
- `TMPDIR=/var/tmp node --test scripts/install-janitor-timer.test.mjs` → 52 tests, 52 pass,
  0 fail (no changes needed this round; run for regression only).
- `TMPDIR=/var/tmp node --test scripts/mirror-shared-skills.test.mjs` → 41 tests, 40 pass,
  1 todo, 0 fail.
- `TMPDIR=/var/tmp node scripts/run-tests.mjs` (full suite, run once) → 3148 tests, 3142
  pass, 0 fail, 5 skip, 1 todo.

## Deviations / assumptions

- `docs/subagent-contract.md` needed no change this round — none of the 14 findings
  touch it.
- `scripts/install-janitor-timer.mjs`/test needed no change this round — none of the 14
  findings touch it; its suite was run for regression safety only.
- Finding 6's second test (real-data companion) compares `isLinkedWorktree(REPO)` against
  a live `git rev-parse --git-dir`/`--git-common-dir` diff on whatever checkout runs the
  suite, rather than asserting a fixed `true`/`false` — this keeps it correct whether the
  suite runs from a linked worktree (every build lane, including this one) or a plain
  clone, instead of hard-coding an assumption about the CI/dev checkout shape.
- Finding 11's and 12's fixes are plain-text corrections with no dedicated new automated
  test (a SKILL.md prose fix and a warning-string fix); both are covered indirectly by the
  existing heading-pin test (which would fail on any heading-list drift) and the full
  suite staying green. No test previously asserted the OLD (wrong) strings either, so
  there is no discriminating red-before/green-after pair possible for these two without
  inventing a new doc-content assertion the review didn't ask for.
- Finding 14's test simulates the "skips the reclaim shim" condition via the real,
  already non-durable `REPO` (this build's own `/var/tmp/...` checkout) rather than a
  durable-but-linked-worktree fixture, since `collectSources()`'s `REPO` constant is
  fixed at module load to the running script's own location and cannot be swapped
  in-process; this matches the pattern the pre-existing F12 tests already use (they too
  only ever exercise the non-durable branch in this environment).
- No seam notes needed: no fix required touching `scripts/reclaim.mjs`,
  `scripts/path-safety.mjs`, or `scripts/work-record.mjs`.

## Safety notes

- No git identity was ever set (not even in scratch fixtures): the finding-6 fixture
  test creates its `git worktree add` fixture off an **unborn HEAD** (no commit needed at
  all — confirmed `git worktree add -b <branch>` works with zero commits), after an
  earlier attempt to commit in the fixture (relying on ambient global git config) proved
  unreliable under `run-tests.mjs`'s sealed-home sandbox.
- All scratch dirs used `mktemp -d /var/tmp/delegation-l59t2f-XXXX` or (inside test code)
  `fs.mkdtempSync(path.join(os.tmpdir(), ...))`. The one `git worktree add` I made
  personally (for red-before verification) was additive-only against the shared repo and
  removed with `git worktree remove --force` afterward — the real `/var/tmp/lane-59/wt`
  worktree itself was never touched.
- No secrets printed, no environment dumped, no transcript content printed.
