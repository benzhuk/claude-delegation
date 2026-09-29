VERDICT: PASS

Source base: `b090aca15be70f3694a30605fb4a572838c5f9a7`.
Production implementation commit: `49211a1ac53708e6657d9396391e6867a3ee9454`.
Documentation format follow-up: `993c7f30e272b44119656ba06ff5e21cabeb430f`.
Scoped gate commit: `f9416f9c8ebf8e3cb884d3c4d8bd6d6586263b43`.

Changed builder paths: `hooks/multi-codex-hook.mjs`, `codex/README.md`, and `docs/census.md`.
`nativeRouteForLead` now derives its concrete advisory script from the pinned `NATIVE_ROUTES` export, requiring exactly one declared script for each native event. The existing event-specific arguments, output parsing, role filtering, deadlines, and child reaping are unchanged. The Codex README documents supplied-id per-session backlog cadence; the census documentation states that hosts without an id use the shared `unknown` fallback, so independent per-pane nudges are unavailable in that case.

Actual gate receipt: independent T2 ran `node --test hooks/multi-codex-hook.test.mjs hooks/codex-unsupported.test.mjs` under the process-owned `Global\\claude-verify` mutex (acquired within 60 seconds and released in `finally`). It exited 0 with 25 passing tests and 0 failures in 2487.239ms. Receipt: `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\codex-followups-49\final-green.txt`. The tested `hooks/multi-codex-hook.mjs` SHA256 was `C5161F2EA919972331C282C31E38DC1C5B3F2BC41C1067C7DD888803D43B5D96`, from production implementation commit `49211a1ac53708e6657d9396391e6867a3ee9454`.

The independent test report records restored-green and scratch-only red evidence for the 5000ms timeout mutation, dropped `session_id` adapter mutation, and fake manifest pairs. No production budget changed, no Claude-side hook changed, and this report does not claim a live hook installation or four-measure result.

Cause: native advisory routing duplicated the event-to-script declaration, while the existing checks did not make timeout bounds, derived manifest parity, or preserved native session identity executable.

Discriminating check: the independent gate proved production route consumption through `NATIVE_ROUTES`; each specified scratch mutant failed its intended assertion, while the unmodified source passed 25/25.

Fix location: `hooks/multi-codex-hook.mjs` consumes `NATIVE_ROUTES`; `codex/README.md` and `docs/census.md` document the supported and missing-id cadence scopes.

Simplification: one pinned route declaration is now the production selection source; no parallel routing list, new controller, timer service, state store, or budget increase was added.
