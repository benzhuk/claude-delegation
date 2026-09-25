VERDICT: PASS — no X2 code changes indicated by X1.

1. Cause: the X1 spec says a missing goal card gets rejection text, while installed source intentionally makes missing cards silent.
   Discriminating check: installed adapter SessionStart against an empty git fixture emitted no JSON output; malformed two-line card emitted the exact rejection.
   Fix location: `docs/specs/codex-fresh-0925/spec.md` step 2 and, if accepted, `docs/native-use.md:94-95`; no code location.
   Simplification: align the spec to silent missing-card behavior; retain rejection only for malformed cards.

2. Cause: the guide requires normal-session hook execution but does not distinguish `codex exec` (`source: exec`, unknown role) from an interactive `cli` lead.
   Discriminating check: real `codex exec` completed with `X1_OK` and its transcript says `source: exec`; `hooks/continuation-native.mjs:71-73` accepts only `cli`/`vscode` leads.
   Fix location: `docs/native-use.md:52-56`; no code location.
   Simplification: document `codex exec` as an installation smoke test and require an observable interactive-lead probe for goal/bearings proof.
