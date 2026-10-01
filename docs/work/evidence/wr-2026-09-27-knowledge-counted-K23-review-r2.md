VERDICT: APPROVE 10047430fb87866339a31bbb001d02f621aca122

# K23 review, round 2 (delta): verify the round-1 fixes and look for regressions

Work: wr-2026-09-27-knowledge-counted. Territory K23 only.
- Worktree: `C:/Users/benzh/Code/knowledge-counted/wt-knowledge-counted-1-K23`.
- `git rev-parse HEAD` = `10047430fb87866339a31bbb001d02f621aca122`.
- Range reviewed: `9c44af5..HEAD`, one commit touching 6 files (+121/-16).
- Reading order: the builder report, then the round-1 findings, then the diff.

Tally: 0 BLOCKER, 0 MAJOR, 0 MINOR. All seven round-1 findings are fixed or resolved as documented. I found no regressions. Three nits follow; none needs action before accept.

I did the verification on a scratch copy, a `git archive HEAD` extracted to
`...\scratchpad\k23r2`. Nothing in the worktree was modified.

## Gate and regression runs (my own, at HEAD)

| Command | tests | pass | fail |
|---|---|---|---|
| `node --test scripts/goal-card.test.mjs scripts/knowledge-counts.test.mjs scripts/knowledge-count.test.mjs skills/decisions/scripts/goals-mirror.test.mjs` | 83 | 83 | 0 |
| `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs` | 1 | 1 | 0 |
| `node --test hooks/delegation-reminder.test.mjs hooks/lib/goal-context.test.mjs hooks/multi-codex-hook.test.mjs` | 57 | 57 | 0 |

- The first command gave 83 because round 1 had 81 tests and this round adds 2 end-to-end tests.
- The third command gave 57/56/1 at round-1 HEAD. That is the B1 regression, and it is now gone.

## Prior findings: check of each fix

### B1 (BLOCKER), FIXED
- `scripts/goal-card.mjs:434`: `renderInjection` now only consumes `opts.knowledgeLine`. It does no filesystem I/O.
- `:473`: `goalCardResult` computes the line with `{ ...opts, knowledgeLine: knowledgeSessionLine(opts) }`.
- Fail-open still holds. `knowledgeSessionLine` catches every error and returns null (`:392-405`), and `goalCardResult`'s own try/catch still wraps the call.
- The "MINOR 2: the whole payload" test in `hooks/delegation-reminder.test.mjs` passes. The whole three-file run is 57/57.
- The two goal-card tests that relied on the old I/O (`scripts/goal-card.test.mjs:571-614`) now pass `knowledgeLine` explicitly.
- The byte-cap test still proves the drop order. With the knowledge line in `opts`, the render is byte-identical to the render without it (`:612-614`).

### M1 (MAJOR), FIXED
- `scripts/goal-card.mjs:396-398` adds the fallback `KNOWLEDGE_HOME` -> `dirname(AGENTS_HOME)` -> `homedir()`, and `:21` imports `dirname`.
- The only production readers of `AGENTS_HOME` are the switch and state helpers. The plugin never sets it itself, so production resolution is unchanged.
- The store and `read.log` both derive from the same `home`, so the fallback cannot split them.
- **Mutation check on the scratch copy:**
  - I replaced the fallback with a bare `homedir()` and ran the e2e tests with `HOME`/`USERPROFILE` pointed at an empty scratch dir. The Codex e2e test failed (`✖ end to end (Codex) ...`), so that test pins the fallback.
  - The unmodified HEAD under the same empty home passes 2/2.
  - The Claude child test passes either way. That is expected: `childEnv` sets its `HOME` to the fixture, and its own comment says so.
- **Remaining in-process test calls without `KNOWLEDGE_HOME` or `AGENTS_HOME`** (`hooks/multi-codex-hook.test.mjs:77,89,151`, `hooks/multi-hook-core.test.mjs:385`, env `{}`):
  - All of them use a non-existent cwd (`/repo`, `/project`), so `goalCardResult` returns `blind` before `knowledgeSessionLine` runs.
  - None of them reads the live store. **Verified clean.**

### M2 (MAJOR, lead decision): RESOLVED AS OPTION (a), documentation only
- `docs/census.md:373-377` states that the line rides only with a rendering card, and that a live check must run from a project that carries `docs/goals/card.md`.
- `docs/goals/card.md` exists in this repo, so "this repo's own checkout" is a valid place to run it.
- No code change was made, and nothing outside the file list was touched.
- **The lead still has one step:** the Lead addendum's live-check wording ("from a scratch directory") must change to run from a checkout that has a card. That step is outside K23.

### M3 (MAJOR), FIXED
- `scripts/goal-card.test.mjs:635-652` (Codex, in-process `runCodexHook`) and `:656-675` (Claude, spawned `hooks/delegation-reminder.js` through `childEnv`) both assert this exact line in `additionalContext`:
  `knowledge: 1 topics, 0 inbox notes pending, 0 topic reads on this host in 7 days; INDEX ~/.claude/knowledge/INDEX.md`
- **Mutation check on the scratch copy:** I changed `:473` back to `renderInjection(card.text, card.mtimeMs, opts)`, so no line is computed. Both e2e tests then failed (pass 0 / fail 2). The tests discriminate.
- Neither adapter file was edited.
- The Codex test's `home` is a scratch fixture. `NOTE_SLUG` is unset, so no inbox registration happens.

### m1 (MINOR), FIXED
- The test was renamed (`scripts/goal-card.test.mjs:536`).
- The comment block at `scripts/goal-card.mjs:325-333` now lists every event that renders a card, and both switches that gate it.

### m2 (MINOR), FIXED
`docs/GOALS.md:119` now reads:
`Status: NONE. Memory never syncs; 44 knowledge notes pending in the inbox on 2026-09-24; topic files opened 0 times by either lead session; triage is unscheduled on every host.`

- The 44 / 2026-09-24 / 0 figures match the base line at `c25cc70:docs/GOALS.md:119` byte for byte. No numbers were invented.
- `goals-src/docs/GOALS.md:81` has the same sentence.
- In `goals-page.expected.md:65` the sentence follows `<span color="red">**NONE**</span> `.
- `goals-mirror.test.mjs` is green in the gate.
- The status word stays `NONE` (attack 14).

### m3 (MINOR), FIXED
`docs/census.md:370` now says `spec.md Territory K3 item 3 names lanes fourteen and seventeen`.

## Nits (no action required; patches given if the builder wants them)

**n1.** `docs/census.md:374` says the line "is computed inside `renderInjection`". After B1 it is computed in `goalCardResult` and only placed by `renderInjection`. The sentence's operative claim is still correct: no card means no line, and the live check must run from a project with a card. The paragraph also ends with a process citation, "(round-1 review, MAJOR 2)", which is odd in a durable doc.

Current:
```
SessionStart line only rides with a rendering goal card — it is computed inside
`renderInjection`, which returns nothing when a project has no valid `docs/goals/card.md`
```
Replacement:
```
SessionStart line only rides with a rendering goal card — `goalCardResult` computes it only
after a valid `docs/goals/card.md` has been read, and returns no text when a project has none
```

**n2.** In the header comment at `scripts/goal-card.mjs:318-322`, the knowledge line is still described in terms of "`opts.extra`'s existing single slot". The line now travels in its own `opts.knowledgeLine` slot. The comment is stale but harmless.

**n3.** Four calls still pass an `env` that `renderInjection` now ignores: `scripts/goal-card.test.mjs:142,165,173` pass `{ env: noKnowledgeEnv() }` directly, and `:179` passes one through a local `env`. The dead option does no harm, since the tests are still correct and read nothing live.

## Regression hunt: areas checked and found clean

- **Production wiring:**
  - `hooks/lib/goal-context.mjs:9-15`, `hooks/multi-codex-hook.mjs:66-90` and `hooks/delegation-reminder.js:370-435` all still carry `goalCardResult(...).text` unmodified.
  - The Claude child resolves `process.env`, and under `childEnv` that includes `AGENTS_HOME`.
- **Kill switches:**
  - Master `ws-off` and `ws-off-goalcard` return `off` at `scripts/goal-card.mjs:462` before `knowledgeSessionLine` is called.
  - `no-knowledge-log` returns null inside `knowledgeSessionLine` (`:395`).
- **Byte cap:** the drop order is unchanged. The knowledge line is dropped first, and the card and `extra` are never shortened (`:434-440`). A `knowledgeLine` that is empty or not a string is treated as absent.
- **Files touched:** all 6 are within K23's list. Nothing under `docs/work/`, `README.md`, K1's files or the adapter files was touched.
