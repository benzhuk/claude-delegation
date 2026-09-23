# Native Claude Write contract probe — corrected fixed-1 result

**VERDICT: NOT A WRITE PROBE — the actual child invocation was Read-only; no retry.**

This is a correction to the fixed-1 report, preserving its observed outcome. The direct task was delivered through the new prompt-file path, and the model accurately reported that only `Read` was available. It made no Write invocation. The fresh non-project work directory stayed empty: `probe-output.txt` is absent, no target bytes exist, and the post-run snapshot delta is empty. Final result was exit `0`, subtype `success`, `is_error: false`, `4,132 ms` (`4,069 ms` API), one turn, `$0.0064686` list-price basis, and zero `permission_denials`.

The previous report incorrectly described a preflight metadata vector as the actual launched Claude vector. The real fixed-1 `state/argv.json` records `--tools Read` and `--allowedTools Read` only. The temporary runner hardcoded those Read-only options; its actual Node child spawn never received `Read,Write` or `Edit(probe-output.txt)`. Consequently the model's missing Write tool is fully explained by our runner configuration, and this run says nothing about Claude Code's Write permission contract, `dontAsk`, or the `Edit(path)` rule.

## Preserved observations

- Requested task: one literal write to `probe-output.txt`; actual tool invocation: none.
- Actual child configuration: restricted, `dontAsk`, no prompt host, **Read-only tools/allowlist**.
- Target assertion: expected UTF-8 `NATIVE_WRITE_CONTRACT_PROBE\n`; actual target: absent.
- Directory assertion: expected only `probe-output.txt`; actual delta: no files.
- Model usage: `claude-sonnet-5`; 2 input, 694 cache-creation input, 5,543 cache-read input, and 258 output tokens (193 thinking); no web requests.
- Debug log fact: it lists zero allow rules from user, project, local, flag, and policy settings sources; no Write request or denial appears. This is consistent with the actual Read-only child vector and does not identify provider behavior.

No plugin, hook, MCP server, installer, updater, configuration edit, credential copy, bypass flag, or source patch was used. Raw protocol/debug output remains scoped to `native-write-probe-fixed-1-state`.

## Correction boundary

The earlier `claude-argv-preflight.json` was fabricated launcher metadata: it contained the intended `Read,Write` / `Edit(probe-output.txt)` shape, but the launcher did not supply that array to the runner. It must not be used as execution evidence. The prompt-file transport remains a plausible repair for the demonstrated outer PowerShell splitting issue, but the post-fix toy fixture did not exercise the runner's real child spawn. Parent is now consolidating one actual argument-construction path and an actual child-argv test.

**Next action:** stop this lane. A future fresh Write probe requires a separately verified actual child argv that exposes precisely the authorized `Read,Write` and `Edit(probe-output.txt)` configuration. Do not infer an SDK defect, permission-rule outcome, or harness defect from fixed-1.
