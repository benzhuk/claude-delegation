VERDICT: BLOCKED — SHA b726ff9ad09f3e403ade74d27ab0a497c742c729; host Netcup; scoped suites 1 pass / full suites 1 fail; native exits 0/1; SSH exits 0/1.

# Lane 37 Netcup short-path gate

## Research

1. **Reproduction.** R2 ran the sealed suite with `TEMP`, `TMP`, and `TMPDIR` under the prior long Lane 37 path. `inbox.test` failed binding `/home/ben/orca-gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/r2-tmp-b726ff9ad09f3e403ade74d27ab0a497c742c729/inbox-sock-25fn4w/s.sock` (`EINVAL`), a 146-byte Unix-domain socket path.
2. **Isolation.** The lane-owned remote root, including every R1/R2 raw log, summary, clone, and retained sealed-home evidence, was moved intact from `/home/ben/orca-gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37` to the single current host root `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37`. Before the literal `mv`, the destination was absent, the resolved source was exact, the clone was clean, and its HEAD was the requested SHA. No symlink or deletion was used.
3. **Hypothesis.** The Unix-domain `sun_path` length, rather than the inbox behavior, caused the R2 failures. `run-tests.mjs` makes `sealed-home-*` under `os.tmpdir()`, but its child environment preserves `TEMP`/`TMP`/`TMPDIR`; `inbox.test` therefore binds directly at `<temp-root>/inbox-sock-XXXXXX/s.sock`, with no sealed-home segment.
4. **Discriminating check.** With all three temp variables equal to the new short root, the computed concrete socket path is `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/inbox-sock-XXXXXX/s.sock` (69 bytes). The actual sealed-runner invocation `node scripts/run-tests.mjs skills/multi/scripts/inbox.test.mjs` passed 73/73, native and SSH exit 0. This checks the same child/sealed nesting used by the full runner.
5. **Result before fix.** The one authorized full sealed suite then ran with the same absolute Node, short temp root, exact clean source SHA, and owned bounded `/tmp/claude-verify.lock`. The socket failure was eliminated, but the suite failed independently: 2 failures, 2,658 passes, 5 skips, native/SSH exit 1/1. Both remaining failures are `hooks/codex-unsupported.test.mjs` SessionStart wiring assertions, whose contexts retain peer/continuation text but omit `wiring:`. This gate made no source or record edits and did not retry the unchanged SHA.

## Evidence

- Absolute Node: `/home/ben/.local/state/fnm_multishells/3959920_1790633786398/bin/node` (`v24.18.1`). Preflight saw no running Node `scripts/run-tests.mjs` process; the mutex was released after each run.
- Scoped raw log: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/r3-inbox-scoped.raw.log`.
- Full raw log: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/r3-suite.raw.log`.
- Full summary: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/37/r3-suite.summary`.
- Local transport logs: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/netcup/r3-inbox-scoped.transport.log` and `r3-sealed-full.transport.log`.
