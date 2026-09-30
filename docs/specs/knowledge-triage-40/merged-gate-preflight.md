VERDICT: READY

# Lane 40 merged-tree gate preflight

Prepared: 2026-09-29 22:48:08 America/New_York

This is procedure preparation only. No suite, SSH connection, mutex/lock acquisition, recipe or guard inspection, live triage action, source edit, or cleanup was performed.

## Proven gate procedures

### Native Windows

Retained provenance: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/windows-gate-r4/report.md` and `windows-gate-r4.raw.log`.

R4 ran exactly:

```text
node scripts/run-tests.mjs --no-sweep
```

It passed at candidate `80760b3bea59b8d8641537b1ae3749388f13f575`: 3102 total, 3069 pass, 0 fail, 33 skip, leak count 0. The retained procedure is:

1. Use the integration checkout in its native Windows parent environment. Check only whether `DELEGATION_REVIEW_RUN` is present; require it to be naturally absent and never clear or change it. Do not dump or rewrite the environment.
2. Record the assigned merge SHA, `git rev-parse HEAD`, `scripts` and `skills` tree IDs, and restricted worktree status. Require the tree identity authorized by root and no source/test worktree delta.
3. Check only PID, executable path and command-line classification for another `run-tests.mjs` or `node --test` suite. If one is active, stop without waiting.
4. Open `Global\claude-verify` and call nonblocking `WaitOne(0)` once. If busy, release/dispose any locally owned handle and stop. Hold the mutex through the one suite invocation and raw-log close; release it in `finally`.
5. Run the exact command above once from the integration root. Capture the filesystem raw log, exit code, TAP totals/skips/duration and sealed-home leak line. Do not rerun, sweep, repair or clean.
6. Report every named failure and every skip. Require exit 0, fail 0 and sealed leak count 0 for PASS.

The identity-safe environment is the inherited native parent environment with no marker changes, test seams, HOME/USERPROFILE override, identity variable, credential copy or configuration inspection.

### Netcup Linux

Retained provenance: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/netcup-gate-r5/report.md`, `raw.log`, and `remote.sh`.

R5 used a login shell, a fresh detached clone, and the same exact suite command. Its retained remote procedure is:

```sh
SHA=<root-supplied-merged-main-sha>
if ! mkdir /tmp/claude-verify.lock 2>/dev/null; then echo SLOT_BUSY; exit 42; fi
trap 'rmdir /tmp/claude-verify.lock' EXIT
D=/tmp/lane40-merged-gate-$$
mkdir "$D" && cd "$D" || exit 1
echo "DIR=$D"
git clone https://github.com/benzhuk/claude-delegation.git repo 2>&1 || exit 1
cd repo && git checkout --detach "$SHA" 2>&1 || exit 1
echo "RESOLVED=$(git rev-parse HEAD)"
echo "NODE=$(node -v)"
echo "CMD=node scripts/run-tests.mjs --no-sweep"
echo "START=$(date -u +%FT%TZ)"
node scripts/run-tests.mjs --no-sweep 2>&1
RC=$?
echo "END=$(date -u +%FT%TZ)"
echo "EXIT=$RC"
exit $RC
```

Run it only after Netcup availability/reservation is reported. Invoke the retained script through the normal Netcup SSH endpoint and `bash -l -s`, capture stdout/stderr and SSH exit locally, and leave the unique checkout and logs in place. The nonblocking `mkdir` is the single reservation attempt; exit 42 means busy and requires stopping without waiting or using another lock. The trap removes only this runner's own successfully acquired lock.

R5 passed at candidate `80760b3bea59b8d8641537b1ae3749388f13f575`: 3102 total, 3095 pass, 0 fail, 7 skip, leak count 0. The identity-safe environment is Netcup's normal login-shell environment in a fresh clone. Do not dump, filter or inject environment variables, alter Git identity, reuse a dirty checkout, copy credentials, or add test flags.

## Prerequisites for execution

- Root supplies the exact merged-main SHA and confirms the acceptance/census preflight is complete.
- The SHA is present on `origin` before the Netcup fresh clone; both hosts must resolve the exact authorized tree.
- skills-o reports Windows availability and skills-n reports Netcup availability. No reservation exists yet.
- Root assigns distinct retained output directories for the Windows and Netcup merged gates.
- Windows has no competing suite and `Global\claude-verify` is acquired immediately; Netcup has no competing owner and `/tmp/claude-verify.lock` is acquired immediately.
- Each host runs exactly once with `node scripts/run-tests.mjs --no-sweep`; no cross-host result substitutes for the other.

## Current blockers

- The final merged-main SHA has not yet been supplied.
- Root's Sonnet census/acceptance preflight is still running.
- Windows and Netcup availability replies and reservations are pending.
- No execution or host reservation has been authorized in this preparation turn.

The original R2 live-proof FAIL remains preserved separately. The later recipe-step evidence does not change these merged-tree gate mechanics or relabel that historical result.
