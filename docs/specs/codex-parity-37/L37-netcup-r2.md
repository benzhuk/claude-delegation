VERDICT: BLOCKED — SHA b726ff9ad09f3e403ade74d27ab0a497c742c729; host Netcup; suites started 1; native exit 1; SSH exit 1.

# Lane 37 Netcup final-source sealed gate

The existing authorized clone at `/home/ben/orca-gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f` was clean before fetch, fetched and detached at the exact requested SHA, then was clean again before the suite.

Login-shell discovery resolved Node `v24.18.1` to `/home/ben/.local/state/fnm_multishells/3936746_1790633563951/bin/node`; the suite used that absolute executable under the process-owned `/tmp/claude-verify.lock`. The single-process preflight found no active Node `scripts/run-tests.mjs` process. The lock released in the script trap.

The one suite ran with `TEMP`, `TMP`, and `TMPDIR` set to `/home/ben/orca-gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/r2-tmp-b726ff9ad09f3e403ade74d27ab0a497c742c729`, as required to remain under the Lane 37 root. It failed with native exit `1`, retained separately from SSH transport exit `1`.

The failure is gate-environmental: `skills/multi/scripts/inbox.test.mjs` could not bind its Unix-domain socket because the resulting path was too long (`listen EINVAL .../r2-tmp-b726.../inbox-sock-25fn4w/s.sock`). The same missing socket then caused the stale-inbox classification and dial-once assertions to fail. No source edits or same-SHA retry were performed.

Remote complete raw log: `/home/ben/orca-gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/r2-suite.raw.log`.
Remote summary: `/home/ben/orca-gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/r2-suite.summary`.
Local transport log: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/netcup/sealed-gate-r2.transport.log`.
