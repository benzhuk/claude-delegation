VERDICT: PASS

# C1 report, round 2 — collect-from-origin collector, fixes for C1-review.md

Goal served: docs/GOALS.md's "work lost or stalled" measure (lane six's whole purpose is a
durable signal so accepted-but-unmerged work is never again reported as merely "in flight").
Nearest NOT: "a rule no script checks" — round 1 shipped a table that looked plausible but was
proven wrong by attack; this round fixes the mechanism the tests and the reviewer's own repro
now check, rather than adding prose about it.

Worktree: /home/ben/Code/wt-collect-from-origin-1-C1, branch build/collect-from-origin-1-C1.
Commit: `61b6aa60b2bb6e489dd0e257e365d135c89612c7` (round-1 base was `d2a62709bf63e8a3574176a3fbdc974ac85cc5c2`).
Files touched, exactly the two in C1's territory: `scripts/collect-from-origin.mjs` (161
lines changed),`scripts/collect-from-origin.test.mjs` (117 lines changed). `docs/census.md`
untouched — none of the review's findings named it.

## Findings applied, one by one

### F1 BLOCKER — fixed
`scripts/collect-from-origin.mjs:222` (was 228-229): `process.exitCode = main()` replaces
`process.exit(main())`. `process.exit` kills the process before an async pipe write flushes;
`process.exitCode` lets Node drain stdout naturally. New regression test
(`collect-from-origin.test.mjs`, "F1 regression: piped/subprocess --json output past 64 KiB is
never truncated") spawns the real CLI as a subprocess against 500 rows (5 branches x 100
records each) and asserts the output is both >65536 bytes and valid, complete JSON
(`JSON.parse(out).length === 500`). Passes.

### F2 MAJOR — fixed
`changedRecordPaths` (`collect-from-origin.mjs`, now near line 90) is
`git diff --name-only --no-renames --diff-filter=AM <mainFull>...<branchRef> -- ":(top,glob)docs/work/*.record.md"`.
`--diff-filter=AM` keeps only paths the branch itself added or changed (the D direction — a
path `--main` has and the branch's tree lacks — is excluded, matching R1's literal "the
record's blob on the branch differs from main's, or main lacks it"). A branch that returns zero
such paths now gets exactly one row (`noRecordRow`, new function) with `recordPath: null,
state: "no-record"`, rather than vanishing or (the round-1 bug) emitting a `no-record` row for
every record `--main` has that the branch's tree happens to lack.

Test: the pinned bare-remote fixture's old `feature/behind-main` case (which relied on the
now-removed D-direction behavior) is replaced with `feature/no-record` — a branch with a real,
unmerged, non-record commit — asserting exactly one `no-record` row with `recordPath: null`.
The old "every other branch also carries a no-record row for the main-only path" assertion is
replaced with the opposite: none of them do (`rowFor(b, recOnMainOnly) === undefined` for all
five branches in the fixture).

### F3 MAJOR (reviewer noted this narrows R1's literal text; no separate ruling was handed to
me — applied as the correctness fix the review itself recommends and verified) — fixed
`main()`'s branch loop now does `if (isAncestor(repo, branchInfo.ref, mainFull) === true)
continue;` before ever reading the branch's blob — a branch already an ancestor of `--main` is
fully merged and has nothing left to report, so it is skipped rather than read from its own
(now stale) blob. `changedRecordPaths` also moved to three-dot notation
(`${mainFull}...${branchRef}`), so only what the branch itself changed since its fork point is
considered.

Verified against the real repo (`/home/ben/Code/claude-delegation`, `--no-fetch --json`): 324
rows before this fix, exactly 8 after — and they match the reviewer's predicted set
branch-for-branch and state-for-state:
```
build/collect-from-origin-1  docs/work/wr-2026-09-25-one-launch.record.md         accepted-unmerged
build/collect-from-origin-1  docs/work/wr-2026-09-26-collect-from-origin.record.md owned
build/decisions-actions-1    null                                                 no-record
build/one-launch-1           docs/work/wr-2026-09-25-one-launch.record.md         accepted-unmerged
docs/bearings-0925           null                                                 no-record
docs/bearings-0926           null                                                 no-record
docs/lane-specs-0925         null                                                 no-record
feat/working-smarter         null                                                 no-record
```
New attack test: "a branch that has already been fully merged into main disappears entirely,
even though main later rewrites the same record with a later Status" — fast-forward-merges a
branch's own record into main, then advances main again rewriting the same path with
`Status: accepted` and a real merged artifact; asserts zero rows for that branch. Passes.

I did not treat this as a silent reinterpretation: it is called out here, in the commit
message, and in the state file as narrowing R1's literal wording, exactly as the reviewer
flagged it, for confirmation rather than assumption.

### F4 MAJOR — partially fixed, not silently claimed done
Applied every mechanical candidate the review named: `refExists`/`objectExists`/`isAncestor`
folded into one `ok(args, repo)` exit-status helper; `buildRow`'s dead
`branchBlob === null` branch deleted (impossible now that F2 filters to AM only);
`formatTable` and `isMainModule` are one-liners; `commitInfo` is called once per branch, not
once per row. `grep -vE '^\s*(//.*)?$' scripts/collect-from-origin.mjs | wc -l` went from
**180** (round 1) to **111** — real, verified progress, not just a report claim — but still
short of the pinned 60. I did not force it further: the remaining bulk is `main()`'s control
flow (~30 lines) and `parseArgs` (~12), both load-bearing and already about as dense as I could
make them without resorting to code that would be hard to verify against the pinned test suite
(exactly the trade the brief's autonomy line reserves for a check-in, not a unilateral call).
This is flagged in the state file for the lead to either record a waiver or say what more to
cut, per the review's own suggested resolution path — not dropped silently, which is what the
review criticized round 1 for doing.

### F5 MINOR — fixed
Same pathspec change as F2: `:(top,glob)docs/work/*.record.md` anchors matching at the repo
root. `node scripts/collect-from-origin.mjs --no-fetch --json --repo scripts` (run from the
repo root, so `--repo` names a subdirectory) now returns the same rows as running from the
repo root — verified by hand, not just by the pathspec change existing.

### F6 MINOR — not changed, and I say so rather than guessing
The review itself frames this as needing a lead ruling between two output-shape options (JSON
`null` vs. a stdout `UNKNOWN` line), and the brief requires a spec ruling — not a builder call —
before changing the CLI's output shape or exit-code behavior. No ruling was handed to me this
round, so the current behavior (stderr warning, exit 0, empty table) is unchanged. Recorded as
an open question in the state file.

### F7 MINOR — fixed
`isAncestor` (via the shared `ok()` helper) returns `null` for any git failure other than exit
status 1 (git's own confident "no"), never a confident `false`. `ok()`'s doc comment states
this explicitly; `computeMerged`/the branch-skip check both already treat `null` as "not
merged"/"not an ancestor," which is the safe direction R1 requires.

### F8 MINOR — fixed
The never-writes test (`"never writes: every file under .git is byte-identical..."`) now walks
`.git` recursively and sha256-hashes every file, before and after a `--no-fetch` run, and
asserts the two lists are identical — not just HEAD/branch/`status --porcelain`, which the
review correctly noted would miss a write to refs, config, or a loose object.

### F9 MINOR — fixed
See F3's new attack test above — it is exactly the case F9 asked for (a branch effectively
"tied" to main, via a real fast-forward merge, with a later Status on main for the same
record), and after F3's fix it produces zero rows, as predicted.

### N1 NIT — fixed
The false claim ("docs/census.md's third sentence exists because of exactly this") is deleted
from the test's comments; the replacement comment states only what the test actually asserts.

## Gate

Literal gate command, run exactly as given, output at `.../reports/C1-gate.log`:
```
node --test scripts/collect-from-origin.test.mjs
```
This fails with `ENOSPC` at `mkdtemp('/tmp/collect-repo-XXXXXX')`. Confirmed via `df -i /tmp`:
`221` inodes free out of `1048576`, 100% used, on the shared machine-wide `tmpfs` — the exact
same pre-existing, non-code condition the round-1 review documented and worked around (they
saw `1048509/1048576`; it is worse now, presumably from more concurrent sessions on this
shared host). This is not caused by anything in this round's diff.

Supplementary run, same test file, with `FIXTURE_ROOT`/`TMPDIR` pointed at a filesystem with
free inodes (the janitor.test.mjs convention this file already follows):
```
FIXTURE_ROOT=/var/tmp/c1-scratch/fixtures TMPDIR=/var/tmp/c1-scratch node --test scripts/collect-from-origin.test.mjs
```
```
tests 19
pass 19
fail 0
```
All 19 tests pass, including the two new attack tests (F1 regression, F9/F3 merged-branch
attack) and the rewritten fixture/never-writes tests.

## Scout's two open questions (unchanged from round 1, still holding)
- `diff --name-only` over `ls-tree`: unchanged reasoning, now three-dot and diff-filter=AM.
- Absent `Status:` -> `owned`, `no-record` reserved for the record not existing on the
  branch's own tree: unchanged; F2's fix makes this the precise, sole meaning of `no-record`
  (a branch, not a record within a present-record branch).

## Deviations / assumptions
- F3 and F6 are the two findings that touch R1's literal wording. F3 was applied (as a
  correctness fix, verified two ways: against the real repo's exact predicted row set, and via
  a new attack test) because leaving it unfixed leaves the tool's central defect (false
  "owned"/"accepted-unmerged" rows for fully merged branches) in place, which is the opposite
  of the lane's stated goal. F6 was left alone because the review offers no single fix, only
  options, and changing output shape is explicitly gated on a spec ruling in the brief.
- F4's 60-line budget: not fully met (111 vs. 60). Reported honestly, with the exact grep
  command and count, rather than re-asserting compliance or omitting it.
