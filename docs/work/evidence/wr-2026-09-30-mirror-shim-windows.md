VERDICT: PASS 9bc94906728cb412a549d6147d44222f247fc8be

## Setup

Source: /var/tmp/lane-59b/wt, branch build/mirror-shim-59b-1 (HEAD 9bc94906728cb412a549d6147d44222f247fc8be).
Base: origin/main = b52757b9d78c328a4a3a4faaecec2581fa233e18.

1. Local ref `l59b-main-for-bundle` created at b52757b9d78c328a4a3a4faaecec2581fa233e18 in the
   source worktree. Bundle built at /var/tmp/lane-59b-winbundle.TSxxsY/l59b.bundle containing both
   refs: `l59b-main-for-bundle` (b52757b...) and `build/mirror-shim-59b-1` (5017f81, the tip of the
   built branch, HEAD's own history includes 9bc9490).
2. scp'd to `C:\Temp\l59b-win1.bundle` on benzh@ben-desktop.tail219acd.ts.net.
3. Cloned NOT under C:\Temp but to the durable path `C:\Users\benzh\Code\scratch-l59b-win1`
   (`git clone -q -n C:\Temp\l59b-win1.bundle C:\Users\benzh\Code\scratch-l59b-win1`).

   **isDurablePath check** (read from
   /var/tmp/lane-59b/wt/scripts/mirror-shared-skills.mjs:966-976): it lower-cases the path, converts
   `\` to `/`, rejects any prefix match against `os.tmpdir()`, `%HOME%\AppData\Local\Temp`, `/tmp`,
   `/var/folders`, and separately rejects any path with a whole path SEGMENT equal to `tmp`, `temp`,
   `scratchpad`, `worktree(s)`, or `wt-*` followed by a `/`. `c:/users/benzh/code/scratch-l59b-win1`
   matches none of the temp-dir prefixes (it's not under AppData\Local\Temp) and its segments
   (`users`, `benzh`, `code`, `scratch-l59b-win1`) match none of the banned segment names — in
   particular `scratch-l59b-win1` is not `scratchpad` and is the terminal segment anyway (the banned-
   segment regex requires a trailing `/`, which a final path component never has). So
   `isDurablePath()` returns `true` here: this clone counts as durable on win32, which is exactly why
   it also plans the `reclaim` shim (via `isDurablePath(REPO) && !isLinkedWorktree(REPO)` in
   mirror-shared-skills.mjs:571) and reproduces the R4 bug that only shows up on a durable, non-linked
   checkout.
4. `main` and `refs/remotes/origin/main` both pointed at b52757b9d78c328a4a3a4faaecec2581fa233e18
   (`git branch -f main refs/remotes/origin/l59b-main-for-bundle`, `git update-ref
   refs/remotes/origin/main refs/remotes/origin/l59b-main-for-bundle`); then `git checkout
   9bc94906728cb412a549d6147d44222f247fc8be`.

## Full suite at 9bc94906728cb412a549d6147d44222f247fc8be

`node scripts\run-tests.mjs > C:\Temp\l59b-win1.log 2>&1`, run from
`C:\Users\benzh\Code\scratch-l59b-win1`, pulled back to
/tmp/l59b_win1_full.log (not deleted, left at that path for reference):

tests 3379 / pass 3288 / fail 0 / cancelled 0 / skipped 90 / todo 1, duration_ms 308033.9465
leak check: 0 new temp entries

Only `✖` lines in the log are the harness's own expected self-check:
```
✖ probe (5.0198ms)
✖ failing tests:
✖ probe (5.0198ms)
```
This is the one expected exception named in the brief. Zero real failures.

## R4 reproduction (proves the durable path reproduces the bug)

Test file: `skills/multi/scripts/mirror-shim.test.mjs` (touched by 9bc9490,
"fix(multi): R4 counts the note shims, not reclaim's (lane 59b)").

**At b52757b9d78c328a4a3a4faaecec2581fa233e18** (checked out in the same durable clone), ran
`node --test skills\multi\scripts\mirror-shim.test.mjs` alone:

tests 22 / pass 21 / fail 1

Failing test: "R4: Windows plans BOTH shims — .cmd for cmd/PowerShell, extensionless for Git Bash"
```
AssertionError [ERR_ASSERTION]: expected 8 shim(s) on win32, got:
  ... (8 note-* shim lines) ...
  would install PATH shim: C:\Users\benzh\AppData\Local\Temp\mirror-home-HY0d7E\.local\bin\reclaim.cmd -> C:\Users\benzh\Code\scratch-l59b-win1\scripts\reclaim.mjs
  would install PATH shim: C:\Users\benzh\AppData\Local\Temp\mirror-home-HY0d7E\.local\bin\reclaim -> C:\Users\benzh\Code\scratch-l59b-win1\scripts\reclaim.mjs

  10 !== 8
```
Exactly the 8-expected-vs-10-got mismatch: because this checkout is durable and not a linked
worktree, the reclaim shim (2 forms on win32: `.cmd` + extensionless) is legitimately planned
alongside the 8 note-* shims, inflating the old test's hardcoded count of 8 to 10. This is measured
in the actual durable clone, not assumed.

Returned to 9bc94906728cb412a549d6147d44222f247fc8be (`git checkout
9bc94906728cb412a549d6147d44222f247fc8be`) and re-ran the same file alone as a control:

tests 22 / pass 22 / fail 0, duration_ms 4066.5198

Confirms the fix (matching by command name, and asserting the reclaim shim's presence is gated on
`isDurablePath(REPO) && !isLinkedWorktree(REPO)`) resolves the failure this durable clone reproduces.

## End state left on the Windows host

- `C:\Temp\l59b-win1.bundle` — the transferred bundle (not deleted).
- `C:\Users\benzh\Code\scratch-l59b-win1` — the durable clone, left checked out at
  9bc94906728cb412a549d6147d44222f247fc8be, with `main` and `refs/remotes/origin/main` both at
  b52757b9d78c328a4a3a4faaecec2581fa233e18 per the procedure. Nothing deleted.
- `C:\Temp\l59b-win1.log` — full-suite log at 9bc9490.
- `C:\Temp\l59b-win1-r4-base.log` — R4-only log at b52757b (reproduces the bug).
- `C:\Temp\l59b-win1-r4-fix.log` — R4-only log at 9bc9490 (control, passes).

Local (netcup) side, nothing deleted:
- /var/tmp/lane-59b-winbundle.TSxxsY/l59b.bundle — the bundle built for this gate.
- /tmp/l59b_win1_full.log, /tmp/l59b_win1_r4_base.log, /tmp/l59b_win1_r4_fix.log — pulled-back logs.
- `l59b-main-for-bundle` branch ref in /var/tmp/lane-59b/wt, at b52757b9d78c328a4a3a4faaecec2581fa233e18.

## Verdict

PASS. Full suite on the durable Windows checkout at 9bc94906728cb412a549d6147d44222f247fc8be: 3379
tests, 3288 pass, 0 fail (only the expected `probe` self-check shows `✖`), 90 skipped, 1 todo. The
R4 fix is confirmed both by the base-revision reproduction (8 expected vs 10 got, on this same
durable path) and the fix-revision control (22/22 pass).
