VERDICT: BLOCKED — SHA 0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f; host Netcup; suites started 1; attempt 1 native/SSH exits 127/127; attempt 2 native/SSH exits 1/1.

# Lane 37 Netcup sealed-gate result

Artifact: `0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f` (`origin/build/codex-parity-37`)

The preflight resolved Netcup's login-shell Node to `/home/ben/.local/state/fnm_multishells/3887890_1790632658236/bin/node`, version `v24.18.1`, and found no Node process running `scripts/run-tests.mjs`.

The required fresh clone was created at `/home/ben/orca-gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f`, detached at the requested SHA, and the process-owned `/tmp/claude-verify.lock` was acquired then released by its trap.

Attempt 1's LF-only `bash -s` payload did not inherit the login-shell PATH. Its header and suite invocation both emitted `bash: line 39: node: command not found`; immediate native exit was `127`, and SSH transport exit was separately `127`. The expensive test suite therefore never started.

Attempt 2 was the authorized changed gate command: it retained attempt 1's artifacts, reused the exact verified detached clone, and invoked the absolute executable resolved by the login-shell preflight, `/home/ben/.local/state/fnm_multishells/3887890_1790632658236/bin/node`. The suite started once and failed with native exit `1`; SSH transport exit was separately `1`. The remote raw tail identified three failures: `hooks/codex-unsupported.test.mjs` expected SessionStart `wiring:` context but observed only peer/continuation output; `scripts/native-package.test.mjs` still expects a native manifest without `PreToolUse`; and `skills/multi/scripts/hooks.test.mjs` rejects the test's direct subprocess environment at `hooks/codex-unsupported.test.mjs:156`. No source edits or further suite run were made.

Remote complete raw log: `/home/ben/orca-gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f/docs/work/evidence/netcup-sealed-gate/sealed-suite.raw.log`.
Remote summary: `/home/ben/orca-gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f/docs/work/evidence/netcup-sealed-gate/sealed-suite.summary`.
Local transport record: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/netcup/sealed-gate.transport.log`.

Attempt 2 raw log: `/home/ben/orca-gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f/docs/work/evidence/netcup-sealed-gate/attempt2-suite.raw.log`.
Attempt 2 summary: `/home/ben/orca-gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f/docs/work/evidence/netcup-sealed-gate/attempt2-suite.summary`.
Attempt 2 local transport: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/netcup/sealed-gate-attempt2.transport.log`.
