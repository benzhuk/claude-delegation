VERDICT: PARTIAL

X1 walk state, 2026-09-25 18:29 America/New_York.

- Step 1 install/wiring: PARTIAL. Installed mirror manifest is 0.20.9 from durable checkout; 18 trusted hook-state entries; Codex 0.156.1. `codex exec` succeeds but is `source: exec`, emits no hook receipt, and is not a lead.
- Step 2 goal card: PARTIAL. Installed-adapter synthetic lead fixture injects valid card at SessionStart/UserPromptSubmit; missing card is silent; malformed card rejects at SessionStart; isolated goalcard switch suppresses output. Native interactive lead blocked by outer-shell error 5.
- Step 3 bearings: PARTIAL. Fixture is due/no-completion-receipt and adapter emits due advisory; SessionStart systemMessage shape proved synthetically.
- Step 4 multi: PARTIAL. Dedicated scratch ASK appears in synthetic adapter context and systemMessage; no parent or working peer targeted. Native Claude-to-interactive-Codex delivery remains unproven.
- Step 5 census: PASS. Actual account-home lead read. Opening timestamp 2026-09-25T22:23:17.093Z; census truthfully returns UNSUPPORTED with 24 observed requests and unsupported leadTurns.

Branch/install boundary: durable `fbd7cf6`; fresh checkout `60146fe`; relevant adapter and mirror installer diffs are empty.

Next action: parent copies these reports into the work record; no X2 code change is indicated.
