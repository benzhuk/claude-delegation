VERDICT: PASS — focused source gate passed on bd3b5701b019f5f02d6ccb0bedb536266229c56c.

Cause: With `--no-repo` (or no resolved repository), `packetLocation` returned `exists: false` despite consulting no repository source. Both packet renderers used truthiness, so the unchecked `null` state also appeared missing.

Discriminating check: The one mutex-scoped focused gate, `node --test skills/multi/scripts/note-inbox.test.mjs hooks/multi-hook-core.test.mjs`, exited 0: 67 tests passed, 0 failed, 0 skipped. Native exit receipt: `L29-builder-focused.exit`; raw output: `L29-builder-focused.log`.

Fix location: `skills/multi/scripts/note-inbox.mjs` now emits `packetExists: null` and `packetChecked: false` when no repository was consulted, and formats all three states with strict equality. `hooks/multi-hook-core.mjs` renders the same states strictly. `skills/multi/SKILL.md` contains the pinned Codex queue paragraph immediately after the idle-delivery bullet.

Simplification: The existing strict missing-packet problem guard remains the sole problem decision; no module, hook entrypoint, sender, flusher, or transport behavior changed.

Source commit: `bd3b5701b019f5f02d6ccb0bedb536266229c56c` (`fix(multi): distinguish unchecked packets`). Independent contract tests belong to the integration lane and were not run here.
