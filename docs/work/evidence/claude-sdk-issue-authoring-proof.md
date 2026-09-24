# Claude-authored Codex SDK issue draft — execution proof

Recorded September 23, 2026 (America/New_York). The draft is local and unpublished.

## Native authoring run

- Runner: `C:\Users\benzh\AppData\Local\Temp\astra-followthrough-0923\native-claude-review-runner.mjs`
- Claude executable: `C:\Users\benzh\.local\bin\claude.exe`
- Model: `claude-sonnet-5` (`--model sonnet`)
- Result: success, exit 0, no signal, no timeout
- Elapsed: 26,220 ms total; 26,130 ms API
- Turns: 2
- Permission denials: 0
- Cost reported by the native runtime: USD 0.0493042
- Usage: 4 input tokens, 4,688 cache-creation tokens, 10,921 cache-read tokens, 2,836 output tokens, including 25 thinking tokens
- Web search/fetch requests: 0 / 0
- Native session: `7ae4f2c7-cc39-49b5-bccd-d9098c7fa12b`

The exact machine-readable record is `usage.json`; `runner-state.json`, `argv.json`, empty `stderr.raw.log`, and `stdout.raw.json` preserve the process evidence.

## Permission and delivery boundary

The runner exposed only the Read tool (`--tools Read --allowedTools Read`), used restricted `dontAsk` mode with no permission prompts, enabled `--no-session-persistence`, supplied an empty strict MCP configuration, and set `disableAllHooks:true`. It did not pass `--plugin-dir`. The runner also removed Orca, note-slug and Claude messaging socket/token variables and placed `ws-off` in a fresh run-specific `AGENTS_HOME`.

Accordingly the authoring process had no Write/Edit/Bash/browser/MCP delivery tool and no plugin hook or messaging path. It returned the draft on stdout; the runner alone saved that stdout-derived text into the local state directory. No GitHub issue, message, repository file, personal configuration, or external application was created or modified.

## Independent Codex review

Verdict: ready to paste into an upstream issue after owner review; not published.

The draft accurately separates the observed Store-PowerShell failure, source inspection, the working system-PowerShell counterfactual, and the unknown lower-level Windows mechanism. It does not generalize the result to all nested processes and does not recommend global hook disablement or per-hook wrappers.

Codex made three editorial corrections after preserving the exact Claude output as `claude-sdk-issue-draft.raw.md`:

1. removed the outer Markdown code fence so the file is directly pasteable;
2. softened one causal sentence so source inspection does not claim the unproved lower-level Windows mechanism;
3. qualified fallback application by the affected Windows sandbox context and expanded the two corroborative issue references to URLs.

Final draft SHA-256: `c71e789bc61d0d5288166eab34d2cd6bc5d233f55a0cf9e3926ae153ec6eba98`.
