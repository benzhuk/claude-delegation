VERDICT: PASS — SHA 66bd1b428959002ceb5a0ff45cc6357b2d3533e7; Netcup; 2,660 pass, 0 fail, 5 skip; native exit 0; SSH exit 0.

## Sealed gate receipt

- Host: `ben@100.69.249.18` (Netcup)
- Detached source: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f`
- Exact checked-out SHA: `66bd1b428959002ceb5a0ff45cc6357b2d3533e7`
- Entry point: `/home/ben/.local/state/fnm_multishells/4097267_1790634642618/bin/node scripts/run-tests.mjs`
- Node: `v24.18.1`
- `TEMP`, `TMP`, and `TMPDIR`: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37`
- Start/end UTC: `2026-09-28T22:39:05Z` / `2026-09-28T22:39:24Z`
- Native exit: `0`; direct SSH exit: `0`
- Raw remote log: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/r6-suite.raw.log`
- Remote summary: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/r6-suite.summary`
- Local SSH receipt: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/netcup/r6-ssh.exit.txt`

The corrected admission opened the pre-existing `/tmp/claude-verify.lock` regular file on a dedicated descriptor and used `flock -w 60`; it released the advisory lock by closing that descriptor and did not delete the file. Read-only postflight confirms the file remains a zero-byte regular file and has no holder. Existing prior-attempt evidence was retained. The clone still has its pre-existing untracked `docs/work/evidence/netcup-sealed-gate/`; this lane did not modify it.

The raw runner counters were:

```text
tests 2665
pass 2660
fail 0
cancelled 0
skipped 5
todo 0
duration_ms 18604.587175
```
