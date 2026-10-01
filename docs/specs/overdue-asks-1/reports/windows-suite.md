VERDICT: PASS 2ba158dfa7e4a6e0c8bc67f084b6c555d9bcb646

## Rev-parse (Windows checkout, final sha: 2ba158dfa7e4a6e0c8bc67f084b6c555d9bcb646)

```
HEAD:        2ba158dfa7e4a6e0c8bc67f084b6c555d9bcb646
origin/main: 3bd6ef6f98a07037b258ca7b843cbf88b7820f89
```

(Note: `git clone` printed a benign `warning: remote HEAD refers to nonexistent ref, unable to checkout` — expected for a bundle clone with no default branch resolvable; the subsequent explicit checkout to the target sha succeeded.)

## Totals (2ba158d — final)

```
tests 1831
suites 0
pass 1831
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 389839.2111
```

## Failing tests (2ba158d)

None. All 1831 tests passed on the first run.

`hooks/delegation-reminder.test.mjs` (the known Windows timing flake) did not fail, so no rerun of that file was needed.

## Prior run at 7b27740b7d7df92a05357aca808175fadc9415da (superseded, target moved)

Rev-parse:
```
HEAD:        7b27740b7d7df92a05357aca808175fadc9415da
origin/main: 3bd6ef6f98a07037b258ca7b843cbf88b7820f89
```

Totals:
```
tests 1830
suites 0
pass 1830
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 195604.837
```

No failing tests. Windows artifacts for this run (bundle, `C:\Temp\oa-7b27740`, `C:\Temp\oa-7b27740.log`) were cleaned up before the 2ba158d run started.

## Log path

/home/ben/Code/wt-oa/docs/work/evidence/wr-2026-09-26-overdue-asks-windows-suite.log

(overwritten with the final 2ba158d run's output; the 7b27740 log was captured to a scratch location for the totals above before being overwritten, and is not retained on disk.)

## Cleanup

Ran the Windows cleanup command as a separate step after each run:
- After 7b27740: `rmdir /s /q C:\Temp\oa-7b27740 & del C:\Temp\oa.bundle C:\Temp\oa-7b27740.log` — no prompts/denials, verified via `dir C:\Temp`.
- After 2ba158d: `rmdir /s /q C:\Temp\oa-2ba158d & del C:\Temp\oa.bundle C:\Temp\oa-2ba158d.log` — no prompts/denials, verified via `dir C:\Temp`.
