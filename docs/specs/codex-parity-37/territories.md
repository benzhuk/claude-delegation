# Lane 37 territory and pinned contract

Spec: pinned-spec.md copied from dc16de3ba767fe9762cde454b3483e1e3a5abd9a.
Base: 8b8c2f04cdabe25d1a996ad76bee7e6f2391b6ee.
Measure: work lost or stalled; explicit host coverage and a Codex-to-Claude review handoff.

Implementation owner: hooks/codex-hooks.json, scripts/codex-hook-trust.mjs, hooks/multi-codex-hook.mjs (only routing added events), codex/README.md (janitor), hooks/codex-unsupported.json, docs/census.md (final Codex horizon paragraph only).
Independent test owner: new hooks/codex-unsupported.test.mjs. Tests must enumerate actual Claude (script,event) pairs and reject missing or overlapping coverage, permit Codex-only Interrupt, and exercise newly routed output with isolated fixtures.
Root alone owns docs/work and this spec pack. No Claude hook changes, runner changes, census reader changes, real-home installs or page publication.

Contract: every actual Claude script/event pair is covered exactly once by a native Codex equivalent or an explicit one-line unsupported reason. Unsupported JSON shape is {"unsupported":[{"script":"hooks/example.js","event":"EventName","reason":"One nonempty line."}]}, paths relative to repo root, no wildcard events or aggregate entries. Test enumerates actual Claude manifest commands and native manifest commands, with an explicit mapping for multi-codex-hook equivalents that behavioral probes independently verify. No invented metadata in native hooks.json.
Routing: reuse existing multi-codex-hook entrypoint to add wiring-check SessionStart text and backlog UserPromptSubmit/Stop/PostToolUse text to native context without discarding notes, blocking decisions, continuation or existing advisories. Reuse Claude scripts or exported helpers unchanged, preserving silence, kill switches and backlog cadence. No replacement state machine. Add delete-guard manifest entry matching existing installer implementation; retain native caller and matcher limits explicitly. No mirror-shared-skills edits permitted. All route timeouts bounded, no hanging child processes. Independent tests own tests; builder may report needed additional cases to test author.
All temporary files: C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37.
Mandatory mixed review: green artifact sent to skills-fable for fresh Claude Opus review, with both peer note IDs retained.
Prediction: the next Codex-led lane has zero not-stated host coverage gaps.
