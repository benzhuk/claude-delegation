VERDICT: PASS c6212e56739e13cf3e353a636716d5ce15bc23ec

# Lane 37 changed-source native proof

Scope code SHA: `58170210871638726594cca8b9452cb7a6f1b3a8`; diagnosis/report commit: `c6212e56739e13cf3e353a636716d5ce15bc23ec`. Detached proof checkout: `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\codex-parity-37\integration\proof-r2`; verified HEAD `c6212e56739e13cf3e353a636716d5ce15bc23ec`, clean before and after execution.

The changed-source run used `run-live-r2.ps1`, a fresh `codex-home-r2`, fresh fixture repository, isolated `AGENTS_HOME`, cleared local `NOTE_SLUG`/pane handle, normal trusted installer, and `C:\nvm4w\nodejs\codex.cmd exec --json -m gpt-5.6-terra -s read-only "hi" < NUL`. No hook-trust or permission bypass was used.

Native exit: `0` (`codex-live-r2.exit.txt`). The actual model reply in `codex-live-r2.raw.jsonl` was:

```text
wiring: 1 flagged (janitor last run). Run wiring-check for the fixes.
work: 1 runnable and unowned (wr-2026-09-28-fixture-r2), 0 delivered and unreviewed (), 0 rejected awaiting a fix round (). Pull one or say why not.
DONE
```

The installer recorded trusted SessionStart, UserPromptSubmit, PostToolUse, Stop, Interrupt, and PreToolUse/Bash delete-guard placements in only the fresh scratch home. Stderr retained `Reading additional input from stdin...`; no denial occurred. After process exit, the standalone non-recursive auth cleanup completed: `auth-copy-exists=False`. Attempt 1 files remain unchanged. No suite was run or rerun.
