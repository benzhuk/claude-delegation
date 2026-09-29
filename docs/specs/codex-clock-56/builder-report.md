VERDICT: PASS

Artifact: 1b335e86e42811f81380b889f6c03edeef57610e
Scope: `hooks/codex-unsupported.test.mjs`; no production, runner, other-test, record, or `docs/census.md` change.

Cause: real route assertions raced the wrapper's 400 ms child kill and 450 ms parent promise deadlines under Windows host load.
Discriminating check: freeze only those wrapper-parent timers while a real backlog child must emit its normal output and write the exact supplied-session sentinel; retain separate real-clock give-up checks.
Fix location: `hooks/codex-unsupported.test.mjs`.
Simplification: one reusable in-process timer helper and a temporary explicit `node --import file://...` preload for the wrapper CLI; the backlog child receives no preload.

Functional coverage now includes real UserPromptSubmit CLI/direct children with exact sentinels, peer/advisory composition, independent Claude/Codex session sentinels, Stop text plus sentinel, and disabled/cadence silence. The two deadline tests use real time, a <=2 s bound, and only silent give-up assertions. Each timer mock resets through `t.after`.

Focused final gate: `node --test hooks/codex-unsupported.test.mjs` — exit 0; 14 tests, 14 pass, 0 fail, 0 skipped. Raw: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-clock-56/focused-005-final.raw.log`; native exit: `focused-005-final.exit.txt`.

Mutants ran only in isolated gate scratch copies. Stop-null: exit 1, 13 pass/1 fail; Stop-text-fallback: exit 1, 13 pass/1 fail. Each failed exactly `functional: real native Stop route surfaces backlog text for Codex`, at its backlog-text assertion. Raw and exit receipts: `mutant-stop-null-002.*` and `mutant-stop-text-fallback-002.*` in the same gate directory. No mutant remains in this worktree.

Focused attempt `focused-001` intentionally remains retained: Windows Node rejected the absolute `--import` path before execution. The implementation changed it to a `file://` URL; later focused passes are retained separately. No full suite was run; the three sealed Windows suites and independent source review remain root/integrator gates.
