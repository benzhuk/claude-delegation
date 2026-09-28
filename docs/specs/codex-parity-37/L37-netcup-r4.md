VERDICT: BLOCKED — SHA 66bd1b428959002ceb5a0ff45cc6357b2d3533e7; Netcup; suites started 0; native exit N/A; gate-script exit 46 (the lock path was a regular file); SSH exit not captured because the initial PowerShell `Tee-Object` pipeline masked it.

## Receipt

- Host: `ben@100.69.249.18` (Netcup)
- Candidate requested and checked out: `66bd1b428959002ceb5a0ff45cc6357b2d3533e7`
- Remote detached clone: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f`
- Node resolved from a login shell: `/home/ben/.local/state/fnm_multishells/4097267_1790634642618/bin/node` (`v24.18.1`)
- Intended entrypoint: `node scripts/run-tests.mjs`
- Intended `TEMP`, `TMP`, and `TMPDIR`: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37`
- Local transport receipt: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/netcup/r4-sealed-full.transport.log`
- Remote gate script retained: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/r4-sealed-full.sh`

## Result

The gate performed its exact-SHA checkout and then waited the authorized 60 seconds for `/tmp/claude-verify.lock`. It exited before launching Node with this preserved raw receipt:

```text
BLOCKED: mutex busy after 60 seconds: /tmp/claude-verify.lock
```

No `r4-suite.raw.log` or `r4-suite.summary` was created, so there are no test counters and no native suite exit. The original read-only follow-up used `test -d` and incorrectly called the lock released. Later investigation established that `/tmp/claude-verify.lock` is a persistent zero-byte regular file, so `mkdir` cannot acquire it. The clone remains at the requested SHA; pre-existing untracked `docs/work/evidence/netcup-sealed-gate/` was not modified. Prior R1–R3 evidence remains under the same short remote root.

The initial base64 transport attempt failed locally with `base64: invalid input` and did not reach the remote script. The subsequent SCP upload reached the script and produced the mutex receipt above. This was the single authorized expensive-suite attempt; no retry was started.
