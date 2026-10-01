DONE f10c7929711134ce0260741b2ade293ac8e4deb0

# C1 round 2 report (lane 36, lane-closeout): fixes for reports/C1-review.md

Worktree: `/home/ben/Code/claude-delegation-wt/lane-closeout-1-C1`, branch `wt/lane-closeout-1-C1`,
started from `ad2aac97d7ff48836809b69e6584694841a03120`. Three commits this round:

- `d40ceed09c861efabd9bcb0555841ef46e337b51` - the fixes themselves (F1-F11, L1-L9, M1/M2/M4/M5), plus
  the regression tests for F1, F2, F4, F5/L9, F7, F9, F10, F11/L3 and L1.
- `8b019d63ee4d2c5d97062a56c89908b326e5a556` - M6's two named test gaps (`docs/*`/`feat/*`
  not-under-`build/` cases, a symlinked-*ancestor* scratch case).
- `f10c7929711134ce0260741b2ade293ac8e4deb0` (final) - M4's exit-code assertion folded into the
  L1 lease-moved test.

No shell deletions were run anywhere in this round (every fixture cleanup is `fs.rmSync` inside
the test process itself, same as round 1). No command was denied this round. No git identity was
set; no trailers were added; nothing was pushed.

## Findings table

| Finding | Disposition | Test name | Commit |
|---|---|---|---|
| F1 (CRITICAL) - ignored files deleted live, dry-run says dirty | FIXED | `janitor.test.mjs`: "closeoutWorktree: an ignored-only file (no untracked/modified) is 'dirty' live, not just on --dry-run, and the file survives"; `work-record-closeout.test.mjs`: "closeoutRecord: F1 - a worktree with ONLY an ignored file (no untracked/modified) is still 'dirty', left in place, and the ignored file survives" | d40ceed0 |
| F2 (CRITICAL) - sweep-origin never fetches, deletes from stale refs | FIXED | `work-record-closeout.test.mjs`: "sweepOrigin: F2 - a branch merged-and-safe as of this repo's last fetch, but advanced with NEW unmerged work on origin since, is re-fetched and kept, never deleted from a stale tip" | d40ceed0 |
| F3 (MAJOR) - scratch delete: equality-only worktree/repo-root check, fail-open worktree list | FIXED | `work-record-closeout.test.mjs`: "scratch step refuses the repo root, and refuses a path in git worktree list" (round-1, equality) + "scratch step refuses a directory containing a .git entry" (round-1 name, now the bounded-depth walk, which structurally subsumes the nested-worktree containment case: any nested worktree/repo carries its own `.git` entry). `listWorktrees === null` fail-closed is a code-level change verified by reading `removeScratchDirectory`; no dedicated fixture forces `git worktree list` to fail this round (not independently tested) | d40ceed0 |
| F4 (MAJOR) - "not this record's own" matches only one name form | FIXED | `work-record-closeout.test.mjs`: "sweepOrigin: F4 - an active record's Worktree: given as origin/-prefixed / refs/heads/-prefixed / a trailing slash ... still keeps the branch" (3 parameterized cases) + "sweepOrigin: F4 - an active record's Worktree: given as the branch's absolute worktree path (resolved via git worktree list) still keeps the branch"; source-pin test updated to `normName` | d40ceed0 |
| F5 (MAJOR) - `close --dry-run` without `--closeout` performs a real close | FIXED | `work-record.test.mjs`: "acceptanceMain: plain 'close --dry-run' (no --closeout) is refused (closeout-flag-without-closeout), and performs no close - pins base's own throw-on-unrecognized-argv behavior" | d40ceed0 |
| F6 (MAJOR) - closeout Log: line trips stale-result-candidate | FIXED | `work-record.test.mjs`: "closeoutRecord: runs the existing close, then a failed merge proof ... still writes the closeout Log: line" (asserts `owner === "lead"`, `note` matches `/^by <session> /`) | d40ceed0 |
| F7 (MAJOR) - worktree step can remove --repo itself; win32 cwd check never fires | FIXED | `janitor.test.mjs`: "closeoutWorktree: F7 - refuses a worktree entry that IS (or contains) --repo, distinct from the main-worktree and cwd-containment checks" (dry and live, mirrors the reviewer's own e13 repro). Win32 case-folding itself is not separately unit-tested this round (the fix is realpath+`toLowerCase()` gated on `process.platform`, verified by code read) | d40ceed0 |
| F8 (MEDIUM) - default scratch roots never match the real session layout | FIXED (= L6) | `work-record-closeout.test.mjs`: "scratch step accepts the REAL scratch layout - <root>/<project>/<session-id>/scratchpad/<lane>, --by several segments below the root" + "...refuses the session directory itself even under the deep real layout..." | d40ceed0 |
| F9 (MEDIUM) - Windows-authored Scratch: refused on Linux | FIXED | `work-record.test.mjs`: "checkScratchField: a Windows-shaped absolute Scratch: value (C:\...) never refuses or warns on any host"; `work-record-closeout.test.mjs`: "scratch step refuses a value in the WRONG OS's path convention for the current host, via the test-only platform param" | d40ceed0 |
| F10 (MEDIUM) - repeated --exclude drops entries; no normalization | FIXED | `work-record-closeout.test.mjs`: "parseSweepOriginArgs: F10 - a repeated --exclude accumulates, comma-joined, rather than the last one overwriting the rest"; "sweepOrigin: F10 - an --exclude entry matching no origin/build/* branch prints a warn line naming it" | d40ceed0 |
| F11 (MEDIUM) - --by gates only the scratch step (= ruling L3) | FIXED | `work-record.test.mjs`: "closeoutRecord: L3 - a --by that does not match Lead-session: refuses all four steps before step 1 (close) ever runs, live and dry-run alike"; "closeoutRecord: --by containing whitespace is refused (by-malformed), never reaches the Log: write" | d40ceed0 |
| M1 - dry-run still fetches, changes nothing else | DOCUMENTED + code unchanged from round 1 (fetch already ran in dry-run) | Verified this round via the reviewer's own `e9-dry-forms.mjs` (E9, both advance=false/true) run against the fixed worktree: `advance=false` → `changed: nothing`; `advance=true` → `changed: refs` only. `docs/work-record.md`'s `--dry-run` bullet already states this | d40ceed0 (docs) |
| M2 - short ref names on push; fetch --prune missing at :1970 | FIXED | Full `refs/heads/<name>` names verified by code read (`deleteOriginBranchWithLease`); `git fetch --prune origin` added to `closeoutRecord`'s merge-proof step. Exercised indirectly by the F2/L1 tests' restore-line assertions (`refs/heads/${branch}`) | d40ceed0 |
| M3 - scratch: file target, EACCES, TOCTOU race | FIXED (code) | `lst.isDirectory()` and non-ENOENT-refuses-not-absent are code-level changes in `removeScratchDirectory`, verified by reading the function; not independently fixture-tested this round (no new test) | d40ceed0 |
| M4 - sweep-origin always exits 0 | FIXED | `work-record-closeout.test.mjs`: the L1 lease-moved test now also asserts `result.exitCode === 2` | f10c7929 |
| M5 - Log: write turns CRLF to LF, writes outside the confined path | FIXED (code) | `eol` detection and `fsImpl.realpathSync`-confined write verified by reading `closeoutRecord`; no dedicated CRLF fixture added this round | d40ceed0 |
| M6 - missing tests (docs/\*, feat/\*, symlinked ancestor, .., trailing slash, DELEGATION_SCRATCH_ROOTS, win32 case-fold, duplicate Scratch: singleton) | PARTIAL | Added: `docs/*`/`feat/*` not-under-build/ cases (2 tests); a symlinked-*ancestor* scratch case (distinct from round-1's symlinked-*target* case); `DELEGATION_SCRATCH_ROOTS` is exercised by the new F8/L6 deep-layout tests. Not added this round: a dedicated win32-case-folding fixture, and a duplicate-`Scratch:`-singleton-through-`accept` test | d40ceed0 / 8b019d63 |
| M7 - `tipBehindMergeCommit` O(merges × 4 spawns) | DEFERRED | No code change - a performance optimization (binary search over `git rev-list --first-parent origin/main`), not a correctness fix; out of this round's time budget and does not change behavior | - |
| M8 - out-of-territory edit to `record-closed-and-skip.contract.test.mjs` | No action this round | Already disclosed in the round-1 report; no further edit was made to that file this round (`git diff --stat ad2aac9` for this round touches only `docs/work-record.md`, `scripts/janitor.mjs`, `scripts/janitor.test.mjs`, `scripts/work-record.mjs`, `scripts/work-record.test.mjs`, `scripts/work-record-closeout.test.mjs`) | - |

Ten explicit lead rulings (L1-L10) map onto the table above: L1→M2/F2's lease mechanism (own
"L1" test), L2→F2, L3→F11, L4→F1, L5→F3, L6→F8, L7→F7/F9, L8→F4, L9→F5, L10 needed no fix
(informational; the identity-guard block the round-1 reviewer hit was on its own read-only
command).

## Gate

Territory tests (`node --test scripts/work-record.test.mjs scripts/work-record-closeout.test.mjs
scripts/janitor.test.mjs scripts/record-closed-and-skip.contract.test.mjs`): 381 tests, 378 pass,
1 fail, 2 skipped. The one failure is the pre-existing `docs/GOALS.md ... STALE regexes` test,
unrelated to this territory (also fails identically at base `ad2aac9`, per the addendum).

Full suite, quoted from `reports/C1-r2-gate.log`:
```
ℹ tests 2659
ℹ pass 2653
ℹ fail 1
ℹ skipped 5
```
The one failure is the same pre-existing `docs/GOALS.md and docs/goals/card.md carry no phrase
this build's evidence contradicts (STALE regexes, doesNotMatch)` test
(`scripts/work-record.test.mjs:2458`), `AssertionError: the unsourced 152-turn baseline must be
marked as such` - pre-existing at base, not this territory's responsibility per the addendum.

## The two CRITICAL repros, fresh fixture copies, before and after

Both run via the reviewer's own `e1-ignored.mjs`/`e2-stale.mjs` (copied into
`scratchpad/lane-closeout/C1-r2-verify/`, with `lib.mjs`'s `WT` made overridable so the exact same
script runs unmodified against either tree). "Before" points `WT` at a copy of
`scripts/work-record.mjs`/`janitor.mjs` extracted via `git show ad2aac9:...` (base, unmodified);
"after" is the default, this round's fixed worktree. Each run builds its own fresh fixture repo
and bare origin (timestamped scratch dir), so before/after never share fixture state.

### F1 (`e1-ignored.mjs`)

BEFORE (base `ad2aac9`):
```
DRY: worktree: would dirty …/wt-build_e1-1 | branch: would refused build/e1-1 (...)
LIVE: worktree: removed …/wt-build_e1-1 | branch: removed build/e1-1
.env survives: false  worktree dir exists: false
```

AFTER (this round, `f10c792`):
```
DRY: worktree: would dirty …/wt-build_e1-1 | branch: would refused build/e1-1 (...)
LIVE: worktree: dirty …/wt-build_e1-1 (untracked, modified or ignored files present (git worktree remove would delete ignored files)) | branch: refused build/e1-1 (worktree left in place (dirty))
.env survives: true  worktree dir exists: true
```

### F2 (`e2-stale.mjs`)

BEFORE (base `ad2aac9`):
```
delete build/e2-1 73b6fbb…
deleted build/e2-1 73b6fbb… restore: git push origin 73b6fbb…:refs/heads/build/e2-1
evaluated tip: 73b6fbb…  real origin tip before delete: ebbb8de…
origin still has branch: false
restore line restores only the stale tip; new commit reachable from origin? object present (unreferenced, gc-able)
```

AFTER (this round, `f10c792`):
```
keep build/e2-1 42f6b31… tip is not an ancestor of origin/main
evaluated tip: 92ca5ce…  real origin tip before delete: 42f6b31…
origin still has branch: true
restore line restores only the stale tip; new commit reachable from origin? object present (unreferenced, gc-able)
```
(The "new commit reachable" line is `e2-stale.mjs`'s own diagnostic printed unconditionally after
every run; the load-bearing line above it is "origin still has branch: true" - nothing was
deleted, so no restore is needed at all in the after case.)

## Deviations / assumptions

- F3's containment fix is exercised end-to-end by the reviewer's own `e5-nested.mjs` repro
  (re-run this round, both E5a/E5b now refused with "contains ..." messages) but I did not add a
  brand-new unit-test fixture for the nested-worktree case specifically, reasoning that the
  bounded-depth `.git`-entry walk (tested) structurally catches the same nested-worktree/repo
  cases containment does, since any registered worktree or repo carries its own `.git` entry.
- M3/M5/F3's `listWorktrees` failure path are fixed in code (verified by reading the functions)
  but not independently fixture-tested this round, given the 75-minute ETA; flagging this
  honestly rather than claiming full coverage.
- M6's win32-case-folding and duplicate-`Scratch:`-singleton test gaps remain open.
- M7 (performance) is explicitly deferred, not fixed - a correctness/perf tradeoff call within
  this round's time budget, not a disagreement with the finding.

## State file

`reports/C1-r2-state.md` kept current alongside this report.
