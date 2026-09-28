VERDICT: BLOCKED — SHA 66bd1b428959002ceb5a0ff45cc6357b2d3533e7; Netcup; suites started 0; native exit N/A; gate-script/SSH exit 46 after the regular-file lock made every `mkdir` acquisition fail.

## Admission and receipt

- Host: `ben@100.69.249.18` (Netcup)
- Candidate checkout confirmed read-only after the invocation: `66bd1b428959002ceb5a0ff45cc6357b2d3533e7`
- Remote detached clone: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f`
- Node resolved from a login shell: `/home/ben/.local/state/fnm_multishells/4097267_1790634642618/bin/node` (`v24.18.1`)
- Requested entrypoint: `node scripts/run-tests.mjs`
- Requested `TEMP`, `TMP`, and `TMPDIR`: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37`
- Remote script retained: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/r5-sealed-full.sh`
- Local script: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/netcup/r5-sealed-full.sh`

## Result

R5 invoked the remote gate directly (no `Tee-Object` pipeline). Its local direct-SSH receipt was written as `46` in `r5-ssh.exit.txt`, which proves the shell returned normally after the bounded mutex branch. A read-only remote check found all of the following:

```text
R5_SUMMARY_PENDING
R5_LOG_ABSENT
LOCK_RELEASED   # this was a false directory-only test result
66bd1b428959002ceb5a0ff45cc6357b2d3533e7
```

Thus Node never started and there are no test counters or native exit to report. Follow-up `ls -ld`/`stat` showed `/tmp/claude-verify.lock` is a zero-byte regular file (`-rw-r--r--`, owner `ben:ben`, mtime `2026-09-28 18:24:59 -0400`), not a directory. `fuser`, `lslocks`, and `lsof` showed no current holder. The script's `mkdir` loop therefore failed independently of actual contention. No further suite invocation was made. The pre-existing untracked `docs/work/evidence/netcup-sealed-gate/` remains preserved and untouched.

## Corrected invocation for a newly authorized gate

The documented plan calls for a `mkdir` lock, but that protocol cannot operate while this persistent regular path exists and must not remove it. A new authorization should instead use the existing file as an advisory lock: open it on a dedicated descriptor, use `flock -w 60` on that descriptor, run the suite only after success, and release by closing the descriptor. A preflight must test `-e`/`stat`, not `-d`. This lane did not execute that corrected invocation.
