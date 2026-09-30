VERDICT: EXPECTED_RED — the base gate ran once under Global\claude-verify (34 of 291 tests red, all in the T2 territory; 257 pass). Three of my tests masked their intended red behind an unrelated unknown flag; I repaired them at 090d81b2, but the one justified rerun was BLOCKED (a node test process appeared; reported once, not retried), so the repair is unexecuted.

Commits: gated run at 2c3d7b76; fixture repair at 090d81b2. Changed test path in repair: scripts/census-completeness-62.test.mjs only (assertions and contracts unchanged).
Logs: T2-base-gate.log (complete output). No T2-base-gate-rerun.log exists (rerun blocked before starting).
Gate: process check clean, mutex acquired nonblocking and held until node exited; command `node --test scripts/census-completeness-62.test.mjs scripts/work-record.test.mjs`. No full suite, no production or spec edits.

## Observed red per core defect (base = original source)
1. Detached roles: all 9 Claude-role tests and the declared-Codex test fail at the control with `build-census: unknown argument: --record` (missing behavior: manifest/--repo/--claude-root unsupported). Intended red; fixture content itself (paths, manifest, sidecars) is still unproven because the flag rejection precedes it.
2. Codex stalls: all 8 activity tests run the census successfully (status 0, so the Codex fixture rows are accepted) and fail `census JSON carries activity for a Codex lead` — activity does not exist. Wake-dedup test: observed `2 !== 1`, the replayed identical note row is counted twice at base — a genuine, discriminating red, not a fixture error.
3. Rework: all 7 rework tests build their census successfully, then four-read fails `unknown argument: --as-of` (no maturity/--records support). Intended red.
4. Tokens: 3 tests fail `ERR_MODULE_NOT_FOUND` for scripts/census-measures.mjs (intended). F6 parseRecord: `fields.roleSessions` undefined; F6 strict accept: `unknown label: Role-sessions`; F7: PARTIAL census cannot be produced (`unknown argument: --record`). All intended.

## Fixture errors found and repaired (test-owned, committed, NOT rerun)
- top-tier-tokens test and Codex-led mixed test passed `--as-of` to four-read, so they failed on that flag and hid the unknown-model behavior. Removed `--as-of` there (not needed for that number).
- legacy native-only test passed `--claude-root/--codex-home` with no record, so it failed on those flags rather than on the missing `measurementScope`/`tokenDefinition`. Those flags are now passed only with a record.
Expected after repair (prediction, unexecuted): legacy fails on measurementScope; top-tier-tokens control passes and the unknown-model assertion fails; the mixed test still fails at `--record`.

## Limitations
- Claude role-fixture paths, manifest and sidecar shape, and the Codex-led mixed window checks remain unproven until source supports the flags.
- Rerun command when a slot is free: `node --test --test-name-pattern="legacy census|top-tier tokens|Codex-led mixed" scripts/census-completeness-62.test.mjs`.
- These are base tests before source integration; nothing here is candidate green.

Cause: the base lacks every lane62 flag, field and module. Discriminating check: control-first fixtures plus the base values observed above (2 wakes not 1, activity absent, --as-of rejected, module absent). Fix location: T1 (build-census, four-read, work-record, census-measures). Simplification: none from the tests.
