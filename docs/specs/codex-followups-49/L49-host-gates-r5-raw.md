# Lane 49 host gates r5

**VERDICT: PASS**  
**Candidate:** `d7625e031a61bc34a9bcc8d0fbcdfb8c99114d87`

One fresh sealed verification of the changed test-only candidate. The r4 Windows failure and every earlier receipt are retained; this was not a rerun of that unchanged source.

## Windows

- Native runner exit: `0`; start `2026-09-29T01:14:51.9148277Z`, end `2026-09-29T01:18:09.2044638Z`.
- Full suite: 2912 total; 2898 pass; 0 fail; 0 cancelled; 14 skipped; 0 todo.
- Duration: 192448.8509 ms; post-suite temp check: 0 new entries.
- Prepared runner acquired `Global\claude-verify` and releases it in `finally`.
- Raw: `windows/d7625e031a61bc34a9bcc8d0fbcdfb8c99114d87/suite.raw.log`; exit: `windows/d7625e031a61bc34a9bcc8d0fbcdfb8c99114d87/suite.exit.txt`.

## Netcup

- Local SSH exit: `0`; remote runner exit: `0`; start `2026-09-29T01:14:55Z`, end `2026-09-29T01:15:17Z`.
- Full suite: 2912 total; 2907 pass; 0 fail; 0 cancelled; 5 skipped; 0 todo.
- Duration: 21501.261829 ms; post-suite temp check: 0 new entries.
- Runner was syntax-checked and used `bash`, an absolute login-shell Node, existing regular-file `/tmp/claude-verify.lock` flock, and the short temporary root.
- Raw: `netcup/d7625e031a61bc34a9bcc8d0fbcdfb8c99114d87/suite.raw.log`; SSH exit: `L49-netcup-ssh-r6.exit`.
