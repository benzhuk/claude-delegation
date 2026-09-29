VERDICT: PASS
DONE ad2aac97d7ff48836809b69e6584694841a03120

GOAL served: "Rework after acceptance" (docs/GOALS.md) — a merged-but-abandoned
worktree/branch/scratch directory is exactly the kind of stray state that causes rework
later; `close --closeout`/`sweep-origin` remove it mechanically, with a refusal (never a
force) whenever the tool cannot prove it is safe. Nearest NOT: "a new mechanism while an
existing one is unfed or unmeasured" — this reuses janitor.mjs's existing SAFE proof
(`applySafe`, `isRemoteBranchMergedIntoOrigin`) rather than inventing a second one.

Branch: wt/lane-closeout-1-C1 (local only, not pushed, per brief).
Worktree: /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1 — mine, still needed by
the lane's integrator to read/merge; not removed by me.

## Ruling (a): the `Scratch:` field

- `scripts/work-record.mjs:108` — `export const SCRATCH_FROM = "2099-01-01T00:00:00Z"`
- `scripts/work-record.mjs:116` — `checkScratchField(record, opts)`, takes `opts.scratchFrom`
  exactly like `checkStrictField`/`opts.strictFrom`.
- Wired into `validateRecord` (finding `scratch-missing`/`scratch-invalid`, info-level
  warning when Spec-from is before scratchFrom/absent/unparseable) and into
  `checkAcceptance`/`acceptRecord` (throws `scratch-missing`/`scratch-invalid`).

Tests (`scripts/work-record.test.mjs`, all under the "C1 ruling a" block starting at
line 245):
- `FINDING_CODES is exactly L-C6's thirteen codes plus T1's accepted-without-check plus
  C1's scratch-missing/scratch-invalid (sixteen total)` — :245
- `checkScratchField: refuses scratch-missing only when Spec-from is parseable and
  on/after scratchFrom` — :285
- `checkScratchField: a record with no Scratch: line gets a warning only, never a
  refusal, when Spec-from is before scratchFrom, absent, or unparseable` — :297
- `checkScratchField: a Scratch: value that is not absolute is refused (scratch-invalid)
  at any date, before or after scratchFrom` — :315
- `checkScratchField: an absolute Scratch: value never refuses or warns, regardless of
  Spec-from/scratchFrom` — :326
- `checkScratchField uses the real SCRATCH_FROM export by default, when
  opts.scratchFrom is not given` — :333
- `validateRecord: scratch-missing is a finding-level refusal when Spec-from is
  on/after opts.scratchFrom, an info-level warning otherwise` — :340
- `validateRecord: scratch-invalid is a finding-level refusal` — :352
- `checkAcceptance/acceptRecord: refuse with code scratch-missing when Spec-from is
  on/after opts.scratchFrom and there is no Scratch: line` — :359
- `checkAcceptance/acceptRecord: refuse with code scratch-invalid when Scratch: is not
  an absolute path, regardless of Spec-from` — :367
- `checkAcceptance: a record with no Scratch: line and Spec-from before
  opts.scratchFrom is not refused, and carries the scratch-missing warning` — :375

Docs: `docs/work-record.md` — `Scratch:` row in the Fields table, plus new subsection
"### The `Scratch:` field, and where temp files live" (quotes the pinned scratch
sentence verbatim), plus two new FINDING_CODES rows.

## Ruling (b): `close --closeout`

- `scripts/work-record.mjs:1932` — `closeoutRecord(opts)`
- `scripts/work-record.mjs:2141` — `parseCloseArgs(argv)` (`--closeout`/`--dry-run` bare
  flags, `--by` a name/value pair)
- `scripts/work-record.mjs:1726` — `deriveRecordBranch(record)`
- `scripts/work-record.mjs:1773` — `evaluateOriginBranch(name, tipOrNull, opts)` (the 7
  origin-branch refusal reasons; shared with sweep-origin)
- `scripts/work-record.mjs:1819` — `removeScratchDirectory({...})`
- `scripts/janitor.mjs:1199` — `closeoutWorktree({root, worktreeField, mainBranch, cwd,
  dryRun})` — the one new janitor.mjs export, called by step 3; `main()` and the
  `--record` path are unchanged.

CLI usage (exact, as documented in `docs/work-record.md`):
```
node <verified-plugin-root>/scripts/work-record.mjs close \
  --record <repo-relative-record> --repo <target-root> --by <lead-session-id> \
  --closeout [--dry-run]
```
Each of the five steps (close, merge proof, worktree/branch, origin branch, scratch)
prints one line: `removed`, `refused <reason>`, `absent`, or `dirty`; exit 0 only when
every step is `removed`/`absent`, else 2; `--dry-run` prints the same lines prefixed
`would ` and writes nothing (including the `Log:` line).

Tests, one per named refusal:

Step 2, merge proof (`scripts/work-record.test.mjs` unless noted):
- `closeoutRecord: --by is required` — :2561
- `closeoutRecord: runs the existing close, then a failed merge proof (git fetch origin
  fails, no origin remote) refuses every one of the four cleanup steps with the same
  UNVERIFIABLE reason, and still writes the closeout Log: line` — :2566
- `closeoutRecord: merge proof - an Artifact: sha not an ancestor of origin/main refuses
  every one of the four cleanup steps, with a fetch that itself succeeds` —
  `scripts/work-record-closeout.test.mjs:191` (added this round to cover the second half
  of the same contract bullet, distinct from the fetch-failure case above)
- `closeoutRecord: --dry-run on an already-closed record changes nothing on disk and
  reports 'close: closed (already)'` — :2588
- `parseCloseArgs: --closeout/--dry-run are bare flags, --by is a name/value pair
  distinct from --merge/--at` — :2551

Step 3, worktree + local branch (`scripts/work-record-closeout.test.mjs`, plus the
lower-level `closeoutWorktree` tests in `scripts/janitor.test.mjs`):
- `closeoutRecord: a clean worktree is removed and its local branch deleted with -d
  (never -D); the origin's own tip proves the merge, so no force is ever needed` — :150
- `closeoutRecord: a dirty worktree is reported 'dirty' and left in place - never
  forced` — :170
- `closeoutRecord: refuses the main worktree` — :191
- `closeoutRecord: refuses the worktree that contains process.cwd()` — :205 (now :228
  after the merge-proof test insertion)
- `closeoutRecord: a Worktree: naming a branch that was never checked out anywhere is
  'absent', not an error, for both worktree and branch steps` — :231 region
- `closeoutRecord: --dry-run performs no git mutation for the worktree/branch steps and
  prints 'would ...' lines` — :249 region
- `closeoutWorktree: removes a clean worktree and deletes its local branch with -d,
  never -D` — `scripts/janitor.test.mjs:2375`
- `closeoutWorktree: a dirty worktree is reported 'dirty', left in place, and its branch
  is refused (never forced)` — `scripts/janitor.test.mjs:2391`
- `closeoutWorktree: refuses the main worktree, and refuses the worktree containing
  cwd` — `scripts/janitor.test.mjs:2408`
- `closeoutWorktree: a Worktree: naming a branch never checked out anywhere is
  'absent' for both worktree and branch, not an error` — `scripts/janitor.test.mjs:2423`
- `closeoutWorktree: --dry-run (dryRun: true) performs no git mutation and reports the
  same verdicts a live run would` — `scripts/janitor.test.mjs:2431`

Step 4, origin branch (`scripts/work-record-closeout.test.mjs`, all 7 named reasons):
1. not under `build/` — `closeoutRecord: origin-branch refuses a branch not under
   build/ (main, docs/*, feat/*)` — :273
2. not this record's own — `closeoutRecord: origin-branch refuses a branch that is not
   this record's own (another record, of ANY status, already claims the same branch)`
   — :287
3. tip not an ancestor of origin/main — `closeoutRecord: origin-branch refuses a tip
   that is not an ancestor of origin/main (never merged)` — :331
4. tip equal to origin/main's current sha — `closeoutRecord: origin-branch refuses a
   tip equal to origin/main's current sha` — :347
5. fast-forwarded, never behind a `--no-ff` merge — `closeoutRecord: origin-branch
   refuses a tip that is an ancestor of origin/main but was fast-forwarded in, never
   behind a --no-ff merge commit` — :364
6. named by another active record — `closeoutRecord: origin-branch refuses a branch
   named by another record under docs/work/ whose Status is neither closed nor
   withdrawn` — :309
7. `isRemoteBranchMergedIntoOrigin` disagrees — `closeoutRecord/sweepOrigin:
   origin-branch's evaluateOriginBranch calls isRemoteBranchMergedIntoOrigin and refuses
   on it, as the last of the seven origin-branch checks` — :418
   Plus the positive case: `closeoutRecord: origin-branch removes a branch merged via a
   --no-ff merge commit and proven safe, printing its tip sha and a restore command` — :387

(Reason 6 required a product fix — see "Deviations/fixes" below: the check order in
`evaluateOriginBranch` originally made reason 6 unreachable whenever `ownWorkId` is set,
because reason 2's condition is always a superset of reason 6's. Fixed by running the
status-scoped check first.)

Step 5, scratch directory (`scripts/work-record-closeout.test.mjs`):
- `--by` must equal `Lead-session:` — `closeoutRecord: scratch step refuses when --by
  does not match the record's Lead-session:` — :443
- resolves under a scratch root with `--by` as a whole segment — `closeoutRecord:
  scratch step refuses a path that does not resolve under a scratch root with --by as a
  whole segment strictly between the root and the target` — :457
- session directory itself refused — `closeoutRecord: scratch step refuses the session
  directory itself (--by is not a whole segment STRICTLY between the root and the
  target)` — :474
- symlink never followed — `closeoutRecord: scratch step refuses a symlinked target,
  and never follows it` — :491
- repo root / `git worktree list` entry — `closeoutRecord: scratch step refuses the
  repo root, and refuses a path in git worktree list` — :516
- `.git` entry — `closeoutRecord: scratch step refuses a directory containing a .git
  entry` — :565
- absent, not an error — `closeoutRecord: scratch step reports an absent directory as
  'absent', not an error, and exits 0 when every other step also removed/absent` — :580
- live removal + `--dry-run` leaves it — `closeoutRecord: scratch step actually removes
  the directory on a live run, prints its path, and --dry-run leaves it in place` — :595

Note: the contract's step-5 bullet "not a drive root, the home directory, the repo
root, any path in git worktree list, or a directory containing a .git entry" is one
`removeScratchDirectory` code path shared by several exclusions; the repo-root,
worktree-list, and `.git`-entry members of that list each have their own assertion
above. Drive root and home directory are not independently fixture-tested (no safe way
to fixture "is literally the machine's home directory" without touching the real
`~`, which the brief forbids) — same code path, exercised by the three siblings above.

Step 6, result/exit code:
- `closeoutRecord: exit 0 only when every step is removed or absent; the Log: closeout
  line is written only on a non-dry-run, and never on --dry-run` — :625

Docs: `docs/work-record.md` "## Closing out: `close --closeout`, and `sweep-origin`"
section (full CLI usage + step-by-step behavior + refusal reasons + exit codes + `Log:`
format). `skills/janitor/SKILL.md` — one paragraph inside "## janitor never deletes a
file" (headings unchanged; `janitor.test.mjs`'s heading-list test still passes).

## Ruling (c): `sweep-origin`

- `scripts/work-record.mjs:2054` — `sweepOrigin(opts)`
- `scripts/work-record.mjs:2168` — `parseSweepOriginArgs(argv)`

CLI usage:
```
node <verified-plugin-root>/scripts/work-record.mjs sweep-origin \
  --repo <target-root> [--exclude <name,name,...>] [--apply]
```

Tests (`scripts/work-record-closeout.test.mjs`):
- `parseSweepOriginArgs: --repo/--exclude are name/value pairs, --apply is a bare flag`
  — :648
- `sweepOrigin: dry run by default - lists every origin/build/* branch with its tip sha
  and a delete/keep verdict, deletes nothing` — :655
- `sweepOrigin: 'not the record's own' is dropped (unlike close --closeout) - a branch
  no record names at all is still eligible for delete` — :682
- `sweepOrigin: keeps a branch named by an active (not closed/withdrawn) record,
  exactly like close --closeout step 4` — :697
- `sweepOrigin: branches named in --exclude are added to the keep list, even when
  otherwise eligible for delete` — :715
- `sweepOrigin: --apply deletes only the branches marked delete, against the bare
  fixture origin, and prints each name/sha plus a restore command` — :729

### Dry-run transcript of `sweep-origin` against a fixture

Built with a real throwaway git repo + a real local bare "origin" (never the real
remote), three `build/*` branches: one merged via `--no-ff` (eligible for delete), one
never merged (kept — not an ancestor), one merged but named in `--exclude`. Ran
`acceptanceMain` directly (the real CLI entrypoint) and captured stdout verbatim:

```
$ node scripts/work-record.mjs sweep-origin --repo <fixture-repo> --exclude build/sweep-excluded-1
delete build/sweep-delete-1 4b20753dbeba2dc05ef6de9b2d42e1ec63af3e5a
keep build/sweep-excluded-1 - excluded
keep build/sweep-unmerged-1 ce6eac501c99342844456ad186525cd2b48f260a tip is not an ancestor of origin/main
(exit 0)
```
This matches `sweepOrigin`'s own line format (`delete <name> <tip>` /
`keep <name> <tip-or-dash> <reason>`) exactly. The transcript script and its fixture
directories were generated, run, and then removed via node `fs` only, from the lane
scratch dir; nothing is left on disk.

## Gate

Territory tests (`node --test scripts/work-record.test.mjs
scripts/work-record-closeout.test.mjs scripts/janitor.test.mjs
scripts/record-closed-and-skip.contract.test.mjs`):
```
ℹ tests 360
ℹ pass 357
ℹ fail 1
ℹ skipped 2
```
The one failure is `docs/GOALS.md and docs/goals/card.md carry no phrase this build's
evidence contradicts (STALE regexes, doesNotMatch)` at `scripts/work-record.test.mjs:2447`
— pre-existing, out of my diff (`git diff --stat docs/GOALS.md docs/goals/card.md`
returns empty), and `docs/GOALS.md` is listed "Nobody:" in contracts.md's territory map.

Full suite gate (`node scripts/run-tests.mjs > .../C1-gate.log 2>&1`), quoted from the
log's final tally:
```
ℹ tests 2638
ℹ pass 2632
ℹ fail 1
ℹ skipped 5
```
Same one failure, same file, same pre-existing cause.

## Deviations / fixes made along the way

1. **Product fix, in scope**: `evaluateOriginBranch` (`scripts/work-record.mjs:1773`)
   originally checked "not this record's own" before "named by another record, not
   closed/withdrawn" — since the former's match set is a superset of the latter's
   whenever `ownWorkId` is set (always true for `close --closeout`), reason 6 was
   unreachable. Reordered so the status-scoped check runs first; both reasons are now
   independently reachable and independently tested.
2. **Necessary, minimal fixture fix outside my named territory**:
   `scripts/record-closed-and-skip.contract.test.mjs`'s local `recordText()` fixture
   builder had no `Scratch:` line, so ruling (a)'s new unconditional `scratch-missing`
   info finding broke two of its `deepEqual(validateRecord(...), [])` assertions. Added
   one default absolute `Scratch:` line to that one shared fixture builder (3 lines
   changed total) — no other behavior in that file touched.
3. Added one more unit test this round (`closeoutRecord: merge proof - an Artifact:
   sha not an ancestor of origin/main refuses every one of the four cleanup steps...`,
   `scripts/work-record-closeout.test.mjs:191`) to close a gap: the merge-proof step's
   second named condition (Artifact not an ancestor of origin/main) previously had only
   the sibling fetch-failure case under direct test.

Files changed (2 commits on `wt/lane-closeout-1-C1`, not pushed):
```
adaa16a feat(work-record): C1 lane-closeout - Scratch field, close --closeout, sweep-origin
  docs/work-record.md | scripts/janitor.mjs | scripts/janitor.test.mjs |
  scripts/record-closed-and-skip.contract.test.mjs | scripts/work-record.mjs |
  scripts/work-record.test.mjs | skills/janitor/SKILL.md |
  scripts/work-record-closeout.test.mjs (new)
ad2aac9 test(work-record): cover the merge-proof unmerged-artifact refusal for close --closeout
  scripts/work-record-closeout.test.mjs
```
