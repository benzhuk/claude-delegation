VERDICT: PASS

Artifact: a742860b3ea8a35ffc19320d7958e3ec7ad71cf0
Scope: `hooks/codex-unsupported.test.mjs`; no production, runner, other-test, record, or `docs/census.md` change.

Cause: real route assertions raced the wrapper's 400 ms child kill and 450 ms parent promise deadlines under Windows host load.
Discriminating check: freeze only those wrapper-parent timers while a real backlog child must emit its normal output and write the exact supplied-session sentinel; retain separate real-clock give-up checks.
Fix location: `hooks/codex-unsupported.test.mjs`.
Simplification: one reusable in-process timer helper and a temporary explicit `node --import file://...` preload for the wrapper CLI; it freezes only that parent process's 400/450/2500 ms budgets, while the backlog child receives no preload.

Functional tests have a 10-second independent cleanup limit (the synchronous CLI call also has `spawnSync` timeout 10000); only deadline tests assert the <=2-second product behavior. Each in-process timer mock resets through `t.after`.

All 14 tests are explicitly classified and use these helpers/contracts:

1. Functional — actual manifest parity: `assertManifestParity`.
2. Functional — fake manifest rejection: `assertManifestParity`.
3. Functional — native wrapper composition: `runCodexHook`, real SessionStart child, `freezeParentRouteTimers`.
4. Functional — actual UserPromptSubmit wrapper CLI: wrapper-only preload plus exact sentinel.
5. Functional — metadata-free SessionStart: `nativeRouteForLead` plus `freezeParentRouteTimers`.
6. Deadline — real child give-up: `runRoute`, real clock, <=2 seconds, silent output only.
7. Deadline — outer route give-up: injected never-route, real clock, <=2 seconds, silent output only.
8. Functional — real UserPromptSubmit composition: `nativeRouteForLead`, frozen parent timers, peer/advisory text, exact sentinel.
9. Functional — declared nonexistent route: frozen parent timers and explicit absence of a sentinel.
10. Functional — Claude/Codex independent sentinels: frozen parent timers and exact paths.
11. Functional — real Stop route: frozen parent timers, text and exact sentinel; the sole Stop-mutant target.
12. Functional — cadence/switch silence: frozen parent timers, first real-child sentinel, then silence.
13. Functional — native installer: installer CLI and trusted delete-guard contract.
14. Functional — coverage negative controls: `assertCoverage`.

Focused final gate: `node --test hooks/codex-unsupported.test.mjs` — exit 0; 14 tests, 14 pass, 0 fail, 0 skipped. Raw: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-clock-56/focused-008-final.raw.log`; native exit: `focused-008-final.exit.txt`.

Mutants ran only in isolated gate scratch copies from this final source. Stop-null: exit 1, 13 pass/1 fail; Stop-text-fallback: exit 1, 13 pass/1 fail. Each failed exactly `functional: real native Stop route surfaces backlog text for Codex`, at its backlog-text assertion. Raw and exit receipts: `mutant-stop-null-004.*` and `mutant-stop-text-fallback-004.*` in the same gate directory. No mutant remains in this worktree.

Focused attempt `focused-001` intentionally remains retained: Windows Node rejected the absolute `--import` path before execution. The implementation changed it to a `file://` URL; later focused passes are retained separately. No full suite was run; the three sealed Windows suites and independent source review remain root/integrator gates.
