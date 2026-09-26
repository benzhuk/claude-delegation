VERDICT: PARTIAL

X1 walk state, recovered 2026-09-26 America/New_York.

- Step 1 install/wiring: PARTIAL. Durable manifest reports 0.20.9 and Codex 0.156.1. `codex exec` is `source: exec` and only an installation smoke test; it printed no hook line. A separate live Codex TUI launch through Orca `powershell.exe` proves handler execution for that route only.
- Step 2 goal card: PARTIAL. The live `source: cli` transcript `01a0dab2-065e-7a31-bff4-9aecfe1fa833` proves valid-card injection. Missing-card, malformed-card, and kill-switch observations came from an earlier synthetic route that used the parent identity and are historical, superseded, and not independently reproducible.
- Step 3 bearings: PARTIAL. The live transcript proves hook additional-context delivery of the due advisory. The exact spec requirement for transcript `systemMessage` is unmet; a reported TUI rendering is an operator observation without a retained capture.
- Step 4 multi: PARTIAL. The live scratch Claude-to-Codex queue delivery is transcript-backed. The old synthetic `x1-scratch-codex` probe bound the parent pane to that scratch slug at 6:43:53 PM America/New_York; the scratch terminal is now closed, and missed-note impact is unavailable from retained evidence.
- Step 5 census: PASS. Actual account-home lead read. Opening timestamp 2026-09-25T22:23:17.093Z; census truthfully returns UNSUPPORTED with 24 observed requests and unsupported leadTurns.

Branch/install boundary: durable `fbd7cf6`; fresh checkout `60146fe`; relevant adapter and mirror installer diffs are empty.

Spec discrepancies include the missing-card expectation, kill-switch spelling, exec hook-line/version expectation, card-path wording, and transcript-systemMessage expectation. No adapter-logic gap was found for the verified native launch route; other routes and final acceptance remain unproven.
