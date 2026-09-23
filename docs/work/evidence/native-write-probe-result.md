# Native Claude Write contract probe — result

**VERDICT: INCONCLUSIVE — no Write call exercised; no retry.**

The one authorized detached Sonnet probe completed with exit `0`, subtype `success`, and a parseable final result in `1,348 ms` (`1,288 ms` API time), at `$0.0035686` list-price basis. It reported zero `permission_denials`. However, the fresh probe working directory remained empty: `probe-output.txt` does not exist, so there are no target bytes to compare and the snapshot delta is empty.

The final response said the task appeared truncated rather than attempting the requested one-file Write. Therefore zero denials means only that no permission request was made; it does **not** show that `dontAsk` plus `Edit(probe-output.txt)` permits or denies a Write. It also does not support any claim about the original native Write contract mismatch.

## Captured scope

- Work directory: fresh non-project `native-write-probe-workdir`, with no files before or after the run.
- Intended only target: `probe-output.txt`, expected UTF-8 bytes `NATIVE_WRITE_CONTRACT_PROBE\n`; actual target: absent.
- Model: `claude-sonnet-5`; one turn; 2 input, 549 cache-creation input, 5,543 cache-read input, and 26 output tokens; no web requests.
- Invocation boundary: hidden detached launch; 120-second runner limit; restricted, `dontAsk`, `--permission-prompts none`, built-in `Read,Write`, and `--allowedTools "Read" "Edit(probe-output.txt)"`; no plugin, hook, MCP, install, updater, config edit, credential copy, or bypass.
- Factual debug observation only: the debug log contains zero allow rules for user, project, local, flag, and policy settings sources. It does not contain a Write permission request or denial. This is not enough to infer why the documented CLI allow rule did not appear in the log.

The sanitized result response and raw protocol/debug capture remain scoped to `native-write-probe-state`; no raw provider log is reproduced here.

## Minimal upstream reproduction status

This is not yet a permission reproduction because the model did not attempt Write. The minimal reproduction record is: Claude Code 2.1.281 / `claude-sonnet-5`; fresh empty CWD; direct finite one-file task; exact documented `Edit(probe-output.txt)` allow-rule shape; success result with no Write invocation, no target, no denial. The observed defect candidate is prompt delivery/launch argument handling, but its cause is unproven. Do not patch the harness, broaden permission, add a bypass, or retry this probe under the present authorization.

**Next action:** stop this Write lane. If a later independently authorized investigation is desired, first test the detached launcher’s argument delivery without a model call; only then decide whether a fresh one-call Write reproduction is warranted.
