VERDICT: PASS

# Integrate report — collect-from-origin Windows fix round

Run at 2026-09-26 09:57 America/New_York, in /home/ben/Code/wt-collect-1 on
build/collect-from-origin-1.

## Approval check (before merging)

C1's round-5 review, docs/specs/collect-from-origin-1/reports/C1-review-r5.md, line 1:
`VERDICT: APPROVE 5e67b85605e8a946f8609980326e268e983d925a`. That sha matches the one
named in my prompt exactly. No other territory was named as approved for this round; C2
was not part of this mandate and was not touched.

## Merge

Base sha (confirmed ancestor of pre-merge HEAD): 5f057a3959323bd0fd01231e6fe6d47688991cec.
Pre-merge HEAD: 5da8fb9 ("docs(work): collect-from-origin reopened for the Windows path
fix"). C1 sha 5e67b85605e8a946f8609980326e268e983d925a was not yet an ancestor of HEAD
before the merge.

Ran:
```
git merge --no-ff 5e67b85605e8a946f8609980326e268e983d925a -m "merge: build/collect-from-origin-1-C1 at 5e67b85605e8a946f8609980326e268e983d925a (Windows path fix)"
```
Result: "Merge made by the 'ort' strategy." Clean, no conflicts.
```
 scripts/collect-from-origin.test.mjs | 26 +++++++++++++++++++++++++-
 1 file changed, 25 insertions(+), 1 deletion(-)
```

headSha (post-merge): **645eb79d39df7c35525e2c5b92bdaff20eb6352c**

`git log --oneline -2` after merge:
```
645eb79 merge: build/collect-from-origin-1-C1 at 5e67b85605e8a946f8609980326e268e983d925a (Windows path fix)
5e67b85 fix(collect-from-origin): round-5 Windows path-separator fix (skills-fable findings)
```

No git identity was set; no push was made; no destructive git command was run.

## Note on pre-existing uncommitted files in this worktree

Before I touched anything, `git status --short` in wt-collect-1 already showed
modified `docs/specs/collect-from-origin-1/reports/C1-gate.log` and
`docs/specs/collect-from-origin-1/reports/C1-state.md`, plus untracked
`C1-report-r5.md` and `C1-review-r5.md` — these are the round-5 builder/reviewer
artifacts for C1, apparently written directly into this shared reports/ path rather
than committed on the C1 branch. I did not create these, did not commit them, did not
stash or discard them, and confirmed the merge did not touch them (the C1 branch's own
diff only touches `scripts/collect-from-origin.test.mjs`). They remain uncommitted and
untouched in the working tree after the merge — same as before. Flagging this because
it is unusual, not because I fixed or decided anything about it.

## Sealed test run (node scripts/run-tests.mjs)

Ran once, full suite, at the merge commit. Full output saved to
docs/specs/collect-from-origin-1/reports/integrate-win-gate.log.

```
ℹ tests 1715
ℹ pass 1710
ℹ fail 2
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
```

Two failures, both named in my brief as known pre-existing failures against base
ac9c842:

| Test | File | Status |
|---|---|---|
| V4: a real install writes one shim per command, each naming ITS OWN command in its errors | skills/multi/scripts/mirror-shim.test.mjs:269 | known (base ac9c842) |
| H6: a plain checkout resolves to itself, and backslashes are normalised (L1) | skills/multi/scripts/note-send.test.mjs:367 | known (base ac9c842) |

No third failure, no failure outside these two file/test names. This matches the prior
integrator round's own base re-run (docs/specs/collect-from-origin-1/reports/
integrator-report.md, "Base comparison (ac9c842), re-run fresh in a scratch worktree" —
same 2 named failures, fail count 2). Gate: **no new failure vs base ac9c842 by failing
test name.** PASS.

`docs/sealed-baseline.json` in this worktree is `{"files": []}` — the empty ratchet list
does not name either failing file, but my brief's own explicit gate (no new failure vs
ac9c842 by test name, H6/V4 named as known) takes precedence for this round and both
observed failures are exactly the two it names as known. I am reporting this, not
deciding whether the empty sealed-baseline.json should instead be read as "any failure
is new" — that is the orchestrator's call, not mine.

`run-tests.mjs` left a sealed-home directory for inspection at
`/tmp/sealed-home-B86ymc` (its own behavior on failure, not something I created or will
clean up, since I did not start it as a background process and it is outside any repo).

## What I did not do

- Did not fix, judge severity, or decide ship/no-ship on the two known failures.
- Did not touch, commit, stash, or discard the pre-existing uncommitted docs files.
- Did not run any live/dev-server smoke check — this territory (C1) is a CLI script
  with no route/UI surface, and my brief did not ask for one.
- Did not send any peer notes.
- Did not push anything.

## Files touched by me

- Merge commit 645eb79d39df7c35525e2c5b92bdaff20eb6352c in /home/ben/Code/wt-collect-1
  (branch build/collect-from-origin-1).
- Wrote docs/specs/collect-from-origin-1/reports/integrate-win-gate.log (full sealed-run
  output) and this report.
