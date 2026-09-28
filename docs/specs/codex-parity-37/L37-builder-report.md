VERDICT: PASS

Artifact: `b078f2bdf802d0c9b59e7febd2c60216d74f1f17` (base `fa29e134d1d669513a7fac142e6e5b32ec035f80`).

Gate: `node --test hooks/multi-codex-hook.test.mjs`; exit 0; tests 13, pass 13, fail 0, skipped 0. Raw output and immediate native exit: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/builder/multi-codex-r2.raw.{log,exit}`. Node syntax checks for `hooks/multi-codex-hook.mjs` and `scripts/codex-hook-trust.mjs`, plus both new/changed JSON parses, exit 0.

Cause: Codex had the shared multi adapter but did not surface the Claude wiring check or backlog notice, and its coverage inventory was implicit.

Discriminating check: the focused adapter suite preserves existing peer, continuation, advisory, child-exclusion, and Stop behavior while the route seam remains injectable for the independent parity test.

Fix location: `hooks/multi-codex-hook.mjs` routes existing bounded `wiring-check` SessionStart and backlog prompt/Stop/PostToolUse output into the native envelope; `hooks/codex-hooks.json` declares the existing `Bash` delete guard; `hooks/codex-unsupported.json` records the remaining nonportable pairs.

Simplification: no installer, delete matcher, or Claude hook behavior was copied or changed. The adapter invokes existing hook entrypoints, retaining their switches, silence, and backlog cadence.

Limitations: the independent `hooks/codex-unsupported.test.mjs` gate and the scratch-home native proof are owned by the test author and root integrator, respectively. The Codex census horizon is explicit: configured canonical home plus two UTC folders, verified ancestry through depth three, and verified explicit task files.
