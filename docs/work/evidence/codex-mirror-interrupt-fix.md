VERDICT: PASS

Commit: `811e548` on source `75c1daf`.

Cause: the mirror installer generated and trusted only SessionStart, UserPromptSubmit, PostToolUse and Stop after the shared Codex adapter gained native Interrupt handling. A mirrored installation therefore lacked the callback that immediately disarms continuation state on cancellation.

Discriminating check: `CODEX_EVENTS` is the single input to hook JSON generation, non-destructive merge placement and trust-entry generation. Adding Interrupt there must yield a three-second handler, an `interrupt:0:0` trust key, preserved foreign handlers and byte-idempotent second merge.

Fix location: `scripts/codex-hook-trust.mjs` adds `{ event: 'Interrupt', timeout: 3 }`. `scripts/codex-hook-trust.test.mjs` pins event generation, label/key, exact trust coverage, merge placement, foreign-handler preservation and idempotence. Existing four captured native trust-hash fixtures remain unchanged.

Simplification: the existing shared event table drives configuration and trust; no capability switch, alternate handler, shell wrapper or live configuration mutation was added.

Gate: `node scripts/run-tests.mjs scripts/codex-hook-trust.test.mjs scripts/mirror-shared-skills.test.mjs` passed 51/51. `git diff --check` passed. No live homes or configuration were written.

Limit: an already installed four-event mirror receives Interrupt only on its normal separately authorized mirror refresh.
