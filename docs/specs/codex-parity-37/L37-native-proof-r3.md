VERDICT: BLOCKED 11a1023e47aeb94d7646d21c1b4c9b4cdc0bc883

# Lane 37 changed-candidate native Codex proof R3

Fresh detached scratch checkout `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/integration/proof-r3` was clean at the requested SHA before and after execution. The normal trusted installer wrote only the fresh scratch `codex-home-r3`, including SessionStart, UserPromptSubmit, PostToolUse, Stop, Interrupt, and PreToolUse delete-guard placements. The literal read-only command was `codex.cmd exec --json -m gpt-5.6-terra -C <fresh fixture> -s read-only "hi" < NUL`.

Native exit was `0` (`integration/codex-live-r3.exit.txt`), and non-recursive scratch-auth cleanup completed (`auth-copy-exists=False`). However, the actual model reply in `integration/codex-live-r3.raw.jsonl` was only:

```text
wiring: 1 flagged (janitor last run). Run wiring-check for the fixes.
DONE
```

It omitted the required `work:` context line. The fixture created for this attempt contains its AGENTS instruction but no runnable/unowned work record, so this is an incomplete proof fixture rather than evidence that the candidate removed backlog context. Under the single-attempt instruction, no unchanged-source repair, native retry, or Windows suite was run. Raw stderr retained `Reading additional input from stdin...`; no permission denial occurred.
