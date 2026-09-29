# review-run-53 — builder state

## Territory
`skills/team-build/scripts/review-run.mjs` (+ test), one-liner edits to
`hooks/delete-guard.mjs` / `hooks/multi-inbox.js` (+ tests), `skills/team-build/SKILL.md`,
`docs/census.md`, `scripts/mirror-shared-skills.test.mjs`. Branch `build/review-run-1`,
worktree `.../scratchpad/lane-53/wt`.

## Contracts I rely on
- `agents/reviewer.md` frontmatter (model/effort/tools/omitClaudeMd) — the real role
  `review-run.mjs` resolves by default via `resolvePluginRoot`.
- `DELEGATION_REVIEW_RUN=1` — the marker `buildChildEnv` sets; `delete-guard.mjs` and
  `multi-inbox.js` both now key off it the same way they key off `agent_id`.
- `claude` CLI flags pinned in `buildArgv` (review-run.mjs:196-215): `--setting-sources user`,
  `--strict-mcp-config`, `--disallowedTools` (M1 list), `--permission-mode dontAsk`,
  `--permission-prompts none`, `--agents`/`--agent`.
- Live CLI init event names the version field `claude_code_version` (not `claude_version` —
  found by probing, code now reads both).

## Done
DONE at `4c2b974` (docs commit `997b665` on top references it, per repo convention).
5 commits: hooks fix, review-run.mjs + 28 unit tests + SKILL.md/census.md/mirror-test,
spawn-error/HOST fix, dontAsk escalation, claude_code_version fix.
Full report: `docs/specs/review-run-53/build.md` (probe table P1-P7, hook C4 fields).
Gate green: 268/268 scoped, 2954/2959 full suite (5 skipped, 0 fail), 0 temp leaks.
8/8 real `claude -p` probe calls used.

## Next
- P2b needs re-confirmation once this fix actually ships/re-mirrors to this host's
  installed plugin cache (currently stale — see build.md).
- P3 has no live end-to-end confirmation (static/unit evidence only, cap exhausted).
- P7's `dontAsk` escalation is unverified live — confirm it actually blocks a Write
  outside the worktree with one dedicated probe, once budget allows.
- P1's bare "yes" Context-check answer (CLAUDE.md visibility) is unresolved either way.

## Open questions
- Does `dontAsk` change reviewer UX/behavior for legitimate in-worktree work? P6's run
  (post-fix) still showed 0 denials on ordinary review work, but only one data point.

## How to run my gate
```
node --test skills/team-build/scripts/review-run.test.mjs hooks/delete-guard.test.mjs \
  hooks/multi-inbox.test.mjs scripts/mirror-shared-skills.test.mjs
node scripts/run-tests.mjs
```
