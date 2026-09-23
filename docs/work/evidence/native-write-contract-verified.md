VERDICT: PASS bounded native one-file Write contract

On September 23, 2026 (America/New_York), the parent ran one fresh Sonnet trial after independent approval of the actual temporary runner and real child-process argv checks. Claude Code 2.1.281 invoked Write exactly once for the disposable working directory's probe-output.txt. Parent checked the provider event and file bytes: UTF-8 `NATIVE_WRITE_CONTRACT_PROBE\n` exactly, with only that one file in the previously empty directory. Exit 0, two turns, 3,535 ms, zero permission denials. Reported cost $0.0118208 is the provider's scoped list-price basis, not billed or whole-task cost.

The verified actual invocation used `--restricted --permission-mode dontAsk --permission-prompts none --tools Read,Write --allowedTools Read Edit(probe-output.txt)`, with no plugin, hooks, MCP server or persisted session. Existing authentication was used without copying credentials. Ordinary CLI bookkeeping remains possible; this is not a filesystem-silent profile claim.

## Cause and simplification

Two local testing defects were discovered before this run. PowerShell Start-Process can split a long task argument, and the reused review runner hardcoded Read-only tools. The earlier launcher wrote an independent expected Write vector as metadata, but never passed it to the runner. Its first fixture only constructed another array, so it could not prove the actual process boundary. The fixed-1 trial's missing Write is explained by that actual Read-only vector. No SDK or permission-rule defect follows from those trials.

The temporary runner now constructs arguments once. Its explicit one-file probe mode adds the narrow Write capability; its review default remains Read-only. The harmless fixture uses the very same spawn call and actual argument vector to launch a Node child that returns received arguments. Independent review exercised both modes, including quotes, Unicode, empty setting-sources and settings JSON. The outer launch carries task text by file, with token-safe paths. This is a scoped local repair, not a new packaged runner framework or general PowerShell quoting solution.

The original long-prompt trial did not preserve its received prompt; the demonstrated splitting mechanism is only a plausible retrospective cause for that trial. The successful Opus review used a different short prompt path and remains attributable. Preserve the old failures rather than replacing them with this success.

## Evidence identity and limits

Reviewed temporary files and SHA-256:

- native-claude-review-runner.mjs: 9b1a156a618360e6335953e085e4dbb6813e5ef8cec74dc04faf09306993f53b
- launch-native-write-probe.ps1: a18dfd2fd5065978bfcd2ffe7c173f0bc1149bc31edc317792947a68156bc9b2
- actual-child-argv.mjs: d81620cf583d702834195d6da31ff8711a299330653bde5503f57f4c74e9c4a6

Local raw provider output, argv and usage remain under `C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/native-write-probe-verified-contract-state`; the disposable target is in the sibling `native-write-probe-verified-contract-workdir`. Raw logs are not published. Independent transport review is preserved as `native-argv-review.md` alongside this report.

This establishes a narrowly authorized native Write path. It does not prove the older plugin-specific denied write, persistent installation, mixed-agent peer delivery, unattended execution, or comparative builder quality/speed. No further permission probe is warranted without a new concrete failure.
