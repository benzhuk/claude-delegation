VERDICT: READY

# Lane56 integration-gate setup

No final reviewed Lane56 candidate has been supplied, so this preparation ran no Lane56 clone, full suite, or second-host command. The work record `wr-2026-09-29-codex-clock` was read-only.

Windows helper: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-clock-56/windows-three-gate.ps1`. Given a fresh detached final-candidate worktree and SHA, it:

- rejects a dirty checkout or SHA mismatch and records the real origin URL plus `refs/remotes/origin/main` before execution;
- acquires process-owned `Global\claude-verify` with a 60-second limit, uses the ordinary Windows temporary base, and restores `TMPDIR`, `TMP`, and `TEMP` in `finally`;
- uses `Push-Location`/`Pop-Location` around every Node launch, recording Node CWD and Git HEAD before each test launch;
- performs three consecutive `node scripts/run-tests.mjs` gates with a unique raw log and `native.exit.txt` per attempt, stopping at the first nonzero exit.

Its `-Probe` mode was deliberately launched from the Lane56 integration CWD against the existing detached Lane55 checkout. It passed without a suite: Node CWD and Git HEAD both resolved to `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-counted-55/windows-r1-cd5fecc` at `cd5fecccad1028298fb7811c77cff133c2d4c750`; preflight saw real `origin/main` `c0818c99c171de3b7812acd20adbe4d4ea96297c`. Receipt: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-clock-56/windows/cd5fecccad1028298fb7811c77cff133c2d4c750-attempt0-b65d59063fe841c0ac72b8041323a619/{git-preflight.json,node-preflight.json,probe.raw.log,native.exit.txt,summary.json}`.

Netcup helper: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-clock-56/netcup-one-gate.sh`. The earlier unused three-run helper is preserved separately. It is prepared for execution through `ssh ben@100.69.249.18` in a login shell (`bash -lc`), where it resolves and records the absolute Node path. After a final SHA and source URL are supplied, it uses only the existing `/tmp/claude-verify.lock` with `flock -w 60`, creates a unique `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/56` candidate checkout and unique receipts, verifies real `origin/main`, then runs one sealed Linux suite with its own unique receipt. It neither creates alternate locks nor changes permissions.
