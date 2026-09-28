VERDICT: READY

# Lane 37 live-proof and cross-host gate plan

No installer, scratch home, clone, test, or Codex execution ran while preparing this plan. Windows has `C:\nvm4w\nodejs\codex.ps1`; `codex --version` is `codex-cli 0.158.0`, and `codex exec --json` is the evidence entrypoint.

## Scratch Codex proof after the reviewed artifact is present

Use only `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\codex-parity-37\integration\codex-home` and a sibling fixture repo. Create the home with restrictive ACLs, then copy the existing `$env:CODEX_HOME\auth.json` to it without printing, parsing, hashing, or retaining its content; source existence was confirmed, and the scratch copy keeps ordinary authenticated execution while no live home is written. Never use `--dangerously-bypass-hook-trust`.

From the reviewed checkout, the installer command is:

```powershell
node scripts/mirror-shared-skills.mjs --codex-hooks-only --codex-home $scratchHome --json
```

It must return `ok:true`, name only `$scratchHome`, and write trusted normal-hook plus delete-guard placements. Then run `C:\nvm4w\nodejs\codex.cmd` through `cmd.exe` (PowerShell does not implement `< NUL`), with `CODEX_HOME=$scratchHome`, read-only sandbox, and no `--ephemeral` (the JSONL transcript is required):

```powershell
cmd.exe /d /c ""C:\nvm4w\nodejs\codex.cmd" exec --json -C "%FIXTURE_REPO%" -s read-only "Reply with exactly the two context lines beginning wiring: and work:, then DONE." < NUL"
```

Fixture precondition: its `docs/work/` contains one valid runnable/unowned record and no backlog sentinel, so `backlog-notice` must emit the deterministic `work: 1 runnable...` line. The reviewed routing must also add the SessionStart `wiring:` line. Keep only a redacted excerpt of the JSONL events that contains those two strings, hook start/completion markers, CLI version, and exit; do not retain prompt text, auth material, full transcript, or unrelated response payloads. Success requires both strings in the model's final reply plus hook completion with no trust-bypass flag; a hook JSON file or installer success alone is insufficient.

Cheap delete-guard evidence: run `node --test scripts/codex-hook-trust.test.mjs hooks/delete-guard.test.mjs` under the Windows mutex and retain the exact `PreToolUse`/`Bash` matcher and `permissionDecision: deny` assertions. Do not perform a recursive deletion: upstream source and current unit fixtures establish the deny shape, while live recursive-delete scope is intentionally not this gate.

## Windows focused and sealed gates

After source-byte identity to the reviewed SHA, acquire only process-owned `Global\claude-verify` for at most 60 seconds. The wrapper must use `WaitOne(60000)`, invoke the command once, capture `$LASTEXITCODE` immediately as `NATIVE_EXIT`, and in `finally` call `ReleaseMutex()` only when acquired then `Dispose()`; it creates no lock file. First run the new parity test plus its direct helpers; after review, run `node scripts/run-tests.mjs` once. Store bounded heads/tails, timestamps, SHA, command, and `NATIVE_EXIT`, preserving any nonzero exit rather than returning wrapper success.

## Netcup sealed gate

Read-only connectivity succeeded to `ben@100.69.249.18`; `/home/ben/orca-gates` and Git 2.47.3 exist. After the reviewed SHA is pushed, create a fresh origin clone only at `/home/ben/orca-gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/<full-sha>`; never use the dirty canonical checkout. Resolve Node once with `ssh ... "bash -lc 'command -v node; node --version'"`, then send an LF-only `bash -s` payload.

The payload must fetch/checkout the exact SHA, verify `git rev-parse HEAD`, acquire `/tmp/claude-verify.lock` by bounded `mkdir` for <=60 seconds, run `node scripts/run-tests.mjs` once, save its immediate native exit and bounded log excerpt in the clone's evidence directory, release only its own mkdir lock in `trap`, and `exit "$native"`. Retain the SSH transport exit separately; it never replaces the remote native exit. A busy lock, denied command, checkout mismatch, or failed suite is BLOCKED and is not rerun at the same SHA.

## Entry checks

Before each gate: reviewed SHA is committed/pushed; `git diff --exit-code <sha> --` is clean for the gate checkout; the independent parity test exists; scratch/remote paths are exact; and no raw unbounded log is printed. Evidence headers must state `VERDICT`, SHA, host, exact command, CLI/Node version, start/end, native exit, and the observed proof strings. Any permission, sandbox, or guard denial is retained verbatim and stops that step without an alternate tool or shell.
