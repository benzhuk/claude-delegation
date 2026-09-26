VERDICT: PARTIAL — no adapter-logic/X2 code change is indicated for the verified native Orca `powershell.exe` launch route; other launch routes and exact spec criteria remain unverified.

1. Cause: the X1 spec says a missing goal card gets rejection text, while installed source intentionally makes missing cards silent.
   Discriminating check: installed adapter SessionStart against an empty git fixture emitted no JSON output; malformed two-line card emitted the exact rejection.
   Fix location: `docs/specs/codex-fresh-0925/spec.md` step 2 and, if accepted, `docs/native-use.md:94-95`; no code location.
   Simplification: align the spec to silent missing-card behavior; retain rejection only for malformed cards.

2. Disposition of the native-proof limitation: a transcript-backed Codex TUI launch proves SessionStart, UserPromptSubmit, and peer-delivery hook context for the documented Orca `powershell.exe` route. `codex exec` remains an installation smoke test because it is `source: exec` and printed no hook line. No claim is made for other launchers, PostToolUse, Stop, or acceptance.

3. Historical synthetic probes used the parent session identity and produced a scratch-pane binding. Their later isolated-rerun/hash claim lacks retained commands, environment, times, and output; it is unavailable for independent verification. Do not use it to infer clean isolation.

4. Remaining specification discrepancies: missing-card behavior, kill-switch spelling, default card path, exec hook-line/version, and transcript-systemMessage expectation. These are documentation/spec issues, not evidence of an adapter code defect.
