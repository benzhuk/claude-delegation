VERDICT: PASS — 4037d869721aa082a81db39fada4c3683728e3a0

Cause: B correctly moved the project-config implementation into `skills/decisions/scripts`, while goal-card's spaced-copy fixture copied only the root compatibility module. Separately, goals-mirror shortened dated source strings and removed trailing parenthetical context, then labeled rendered paraphrases as owner quotes and used an `origin/main` source SHA without first checking the local source matched it.

Discriminating check: `node scripts/run-tests.mjs scripts/goal-card.test.mjs skills/decisions/scripts/goals-mirror.test.mjs` passed 46/46, 0 failed. The goal-card fixture now executes from a path containing a space with the canonical module at the exact relative import destination. goals-mirror tests prove an exact `2026-09-23` specification path, URL, year, and parenthetical context survive rendering; a default render refuses a local source differing from `origin/main`; and the existing explicit `--sha` fixture CLI render remains byte-compatible. Log: `C:\Users\benzh\AppData\Local\Temp\astra-build-0923\next-seam-fix-gate.log`.

Fix location: `scripts/goal-card.test.mjs` copies the canonical module into the copied-layout fixture. `skills/decisions/scripts/goals-mirror.mjs` now renders original source text directly and checks source freshness after computing a default SHA. The template and expected fixture label source material neutrally, retain the `main at <sha>` marker, make installed host injection coverage unknown, and require source/version verification before attended publication.

Simplification: removed both lossy text transformations. The existing `checkDirty` helper is reused at the default render boundary; `--sha` remains the explicit caller-attested preview path. No renderer, schema, publisher, or live operation was added.

Scope was limited to the five authorized files. `git diff --check` passed before commit and the worktree was clean afterward. No full suite, installation, publisher, records, handback/pickup files, or GOALS source changed.
