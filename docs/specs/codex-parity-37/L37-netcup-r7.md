VERDICT: PASS — SHA 11a1023e47aeb94d7646d21c1b4c9b4cdc0bc883; Netcup; scoped 8/8 pass; sealed 2,660 pass, 0 fail, 5 skip; native/SSH exits 0/0.

## Admission and source

- Host: `ben@100.69.249.18` (Netcup)
- Detached source: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f`
- Exact source SHA: `11a1023e47aeb94d7646d21c1b4c9b4cdc0bc883`
- Node: `/home/ben/.local/state/fnm_multishells/4097267_1790634642618/bin/node` (`v24.18.1`)
- Temporary environment: `TEMP=TMP=TMPDIR=/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37`
- Persistent lock file: `/tmp/claude-verify.lock`; acquired via an open descriptor and `flock -w 60`, released by descriptor close without deleting the file.

## Node 24 scoped proof

Before the full suite, ran exactly one scoped check because the new regression has a never-resolving injected native route and its timeout timer is unref'ed. `node --test hooks/codex-unsupported.test.mjs` completed on Netcup Node 24 without cancellation: 8 pass, 0 fail, 0 cancelled, 0 skipped, native/SSH exit `0/0`, duration `1475.330093 ms`. This establishes that the test runner remains alive through the bounded race without an artificial keepalive.

- Raw: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/r7-scoped-unsupported.raw.log`
- Local SSH receipt: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/netcup/r7-scoped-ssh.exit.txt`

## Sealed suite

Ran once: `/home/ben/.local/state/fnm_multishells/4097267_1790634642618/bin/node scripts/run-tests.mjs`.

```text
tests 2665
pass 2660
fail 0
cancelled 0
skipped 5
todo 0
duration_ms 18414.153983
```

The remote summary records start/end `2026-09-28T22:52:09Z`/`2026-09-28T22:52:28Z`, native exit `0`; the direct SSH caller recorded exit `0` immediately after its session completed. Raw and summary: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/r7-suite.raw.log`, `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/r7-suite.summary`. Local SSH receipt: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/netcup/r7-ssh.exit.txt`.

All R1–R6 artifacts remain under the same short remote root. This gate did not modify source, records, the pre-existing untracked `docs/work/evidence/netcup-sealed-gate/`, or the persistent lock file.
