# Lane 49 host gates r3

**VERDICT: PASS**  
**Candidate:** `90beeb9b61ec83a1af6dd4adc18419c4872ef5ce`

This is one fresh sealed verification of the changed, test-only deterministic backlog-composition candidate (parent `46228f302b88d64c48fd966caea0d73496b67614`), not a rerun of an unchanged candidate. Earlier r1 and r2 receipts are retained.

## Windows

- Native runner exit: `0`
- Started: `2026-09-29T00:55:33.0719545Z`; ended: `2026-09-29T00:58:35.2129945Z`
- Node: `C:\nvm4w\nodejs\node.exe`
- Full sealed suite: 2718 tests; 2704 pass; 0 fail; 0 cancelled; 14 skipped; 0 todo.
- Duration: 177019.8866 ms. Post-suite temp-entry check found 0 new entries.
- Mutex: Windows `Global\claude-verify`, acquired through the prepared runner and released in its `finally` block.
- Raw receipt: `windows/90beeb9b61ec83a1af6dd4adc18419c4872ef5ce/suite.raw.log`

## Netcup

- Local SSH exit: `0`; remote runner exit: `0`
- Started: `2026-09-29T00:55:32Z`; ended: `2026-09-29T00:55:52Z`
- Node: `/home/ben/.local/state/fnm_multishells/769051_1790643332987/bin/node`
- Full sealed suite: 2718 tests; 2713 pass; 0 fail; 0 cancelled; 5 skipped; 0 todo.
- Duration: 19246.095749 ms. Post-suite temp-entry check found 0 new entries.
- Runner was syntax-checked and executed with `bash`; it used the existing regular-file `/tmp/claude-verify.lock` flock and short temporary root.
- Raw receipt: `netcup/90beeb9b61ec83a1af6dd4adc18419c4872ef5ce/suite.raw.log`; SSH receipt: `L49-netcup-ssh-r4.exit`.
