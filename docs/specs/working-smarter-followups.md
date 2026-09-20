# Working smarter: follow-ups carried out of review (none blocked a merge)

Each line: source review, file, what, why it was not a blocker.

## Janitor (review-b-delta2, 2026-09-20)
- `scripts/artifact-registry.mjs` resolveRegistryPath: require the configured registry path to be inside the project
  root before any write path gains a caller. Reading is harmless today and neither CLI mutates the registry.
- `scripts/artifact-registry.mjs` lock: a stale `<registry>.lock` after a hard kill bricks appends forever. Break a lock
  older than about 60 seconds, say so on stderr, replace the tight spin.
- `scripts/artifact-registry.mjs` rewrite: always terminate the rewritten file with a newline so a preserved truncated
  final line is not concatenated with the next append.
- `scripts/janitor.mjs`: exclude branches checked out in another worktree at classification time (apply already refuses).
- `scripts/janitor.mjs` hasSubmodules: use `git submodule status --recursive` instead of `.gitmodules` existence.

## Verification and prior art (review-a-delta2, 2026-09-20)
- A mechanical test that greps every `skills/*/SKILL.md` for `../_docs/<name>.md` and asserts each is in `SHARED_DOC_FILES`.
  The class recurred twice inside one territory.
- `codex/agents/researcher.toml` does not exist, so Codex operators hand-copy `builder.toml`.
- Builder discipline: a builder used `git stash` mid-round and disclosed it. Prose did not hold; a PreToolUse guard for
  stash, reset --hard and clean in builder sessions belongs in phase two.

## Process
- The usage limit cut three agents off mid-work on 2026-09-20. Mandates now say: write the report incrementally, verdict
  line first, and commit early and often.

## Goal card (review-d-delta, builder-d integration lines, 2026-09-20)
- Codex gets no goal card yet: `hooks/multi-codex-hook.mjs` should append `goalCardContext(cwd)` to its SessionStart
  context. No new handler, no new trust entry. The batch counter stays off Codex.
- `scripts/goal-card.mjs` carries its own agentsHome/switchedOff/activeSwitch; `scripts/project-config.mjs` now honours
  AGENTS_HOME too, so fold them into one implementation with `activeSwitch()`.
- PostToolBatch costs one node spawn per tool batch (about 6 ms over bare node on the hot path, roughly a minute of wall
  time per 2,000 batches). Watch it in the one-week trial.
- The reviewer's six small follow-ups are listed at the end of review-d-delta.md (orchestrator scratchpad ws-build/).
