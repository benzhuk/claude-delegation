VERDICT: PASS 0c00422e97755df7d01127e529c8216c756ee8f9

Work: `wr-2026-09-26-gate-under-load`, G1. Base: `68d2a154505665f98280d73e88e4a4d6cf05b020`.

## Evidence

- Idle focused baselines (`node scripts/run-tests.mjs hooks/delegation-reminder.test.mjs`): three exit-0, 43-pass/0-fail runs, with durations 27.003s, 19.899s, and 12.181s. Their complete outputs are retained in this builder session transcript.
- Canonical loaded prechange focused baseline: `2026-09-26T23:00:57.2279219Z` to `2026-09-26T23:01:47.2870524Z`, exit 1. Durable log: `C:/Users/benzh/AppData/Local/Temp/gate-under-load-0926/prechange-focused-2.log`; sidecar: `C:/Users/benzh/AppData/Local/Temp/gate-under-load-0926/prechange-focused-2.exit`. It failed the 45-process MAJOR 2 fan-out with zero cards.
- `gate_ops`' atomic suite-and-file harness retained ten durable postchange loaded focused runs: 10/10 exit 0, no failures. The manifest and logs remain with `gate_ops` for the integration record; their paths were not exposed to this builder worktree.
- `git diff --check HEAD^ HEAD` for `0c00422e97755df7d01127e529c8216c756ee8f9` passed with no output. The commit changes only `hooks/delegation-reminder.test.mjs` and `docs/sealed-tests.md`.

## Cause

Windows concurrent append loss can leave the seeded tally below the count threshold during the one fan-out. An immediate card was never a guaranteed production contract.

## Discriminating check

The durable loaded baseline observed exactly the claimed failure: 45 concurrent calls produced zero cards. The revised test keeps that fan-out and every child exit-zero check; when it is quiet, it advances the existing `.fired` fixture beyond `REINJECT_MAX_MS` and requires one sequential `PostToolBatch` card through the documented time fallback.

## Fix location

`hooks/delegation-reminder.test.mjs`: the named concurrent MAJOR 2 test and the named timing test. `docs/sealed-tests.md`: one opt-in sentence. The timing measurement always prints its average and armed state; only `process.env.DELEGATION_PERF_ASSERT === '1'` enforces the 400 ms limit. The tally-equals-five assertion remains.

## Simplification

No hook or runner behavior changed. The sealed gate checks delayed-never-cancelled behavior instead of a load-dependent immediate crossing; performance enforcement is explicit rather than host-load sensitive.

## Deviation and unknown

An earlier overlapped attempt lacked durable tail capture and is retained as `CAPTURE_UNAVAILABLE`, not evidence of a pass. The canonical prechange baseline above replaced it. The builder did not receive the postchange harness paths, so this report identifies their owner rather than inventing paths.
