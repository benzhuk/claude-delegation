VERDICT: PASS 11a1023e47aeb94d7646d21c1b4c9b4cdc0bc883

# Lane 37 corrected-fixture native Codex proof R4

R3 remains preserved as a fixture-not-candidate failure: its fresh fixture omitted a runnable record. The R4 fixture correction added only the scratch record `docs/work/wr-2026-09-28-fixture-r4.record.md`; direct `backlog-notice.js UserPromptSubmit` validation emitted its required `work:` line before the live probe. The candidate checkout remained at the requested SHA; its only status entry afterward is that declared scratch record.

The actual live command was `codex.cmd exec --json -m gpt-5.6-terra -C <fixture> -s read-only "hi" < NUL`, using a fresh `codex-home-r4` and `isolated-agents-r4`. The trusted installer wrote only that scratch home. Native exit was `0` (`integration/codex-live-r4.exit.txt`); non-recursive auth cleanup completed (`auth-copy-exists=False`).

The actual model reply in `integration/codex-live-r4.raw.jsonl` was:

```text
wiring: 1 flagged (janitor last run). Run wiring-check for the fixes.
work: 1 runnable and unowned (wr-2026-09-28-fixture-r4), 0 delivered and unreviewed (), 0 rejected awaiting a fix round (). Pull one or say why not.
DONE
```

No real-home installation, permission bypass, source edit, record edit, or commit occurred.
