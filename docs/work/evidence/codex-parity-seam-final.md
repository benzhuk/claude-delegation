VERDICT: APPROVE dad15f870d839f3fceaf4f6c2cb0f3d58b81fa3e

# Codex parity: independent seam review, final narrow delta

- **Target:** dad15f870d839f3fceaf4f6c2cb0f3d58b81fa3e. The checkout at astra-codex-parity was read-only. I exported the tree with `git archive` into my scratchpad (`src3`) and ran everything there.
- **Prior seam verdict:** APPROVE db5ae5c, with three LOW findings: L1, L2 and L3.
- **Scope of this pass:** the delta db5ae5c..dad15f8 only. I did not repeat the full seam review. The db5ae5c section below still holds, because the delta does not change any runtime hook behaviour except the L1 import. I did one review, the seam review, and did not read the other reviewers' findings files.

## Delta scope: verified as exactly what was claimed

The delta is three commits: `28a222c`, then merge `004a059` (parents db5ae5c and 28a222c), then `dad15f8`.

- **The merge from main.** `git diff 004a059^1 004a059` touches exactly three files, each with a one-line change from `"version": "0.20.7"` to `"0.20.8"`: `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`. Nothing else came in from main.
- **The fix commit.** `git diff 004a059 dad15f8` touches exactly six files:
  - `hooks/lib/goal-context.mjs`
  - `hooks/lib/goal-context.test.mjs` (new)
  - `scripts/build-census.mjs`
  - `scripts/build-census.test.mjs`
  - `scripts/work-record.mjs`
  - `scripts/work-record.test.mjs`
- There are no doc changes, no hook registration or manifest changes beyond the version bump, and no change to either host adapter.

## Prior findings

### L1 (LOW): FIXED

- **The fix.** `hooks/lib/goal-context.mjs` no longer imports `bearings-state.mjs` at the top of the file. The import now happens inside `bearingsNotice`'s `try` at `hooks/lib/goal-context.mjs:28`, so a missing or broken bearings module leaves `bearingsNotice` returning null and the card still renders. The wording and the signatures are unchanged.
- **The regression test.** `hooks/lib/goal-context.test.mjs:18` copies the helper into a temp tree that has `scripts/` but no `skills/`, and asserts the card is `ok` and the bearings notice is null.
- **Mutation check** (on the scratch copy, then restored). I restored the static import at the top of the file; the new test failed (0 pass, 1 fail). With the fix restored it passed.

### L2 (LOW): FIXED

- **The fix.** At `scripts/work-record.mjs:705-713`, a first line matching `^VERDICT: UNSUPPORTED` is still refused with code `census-missing`. The message now names UNSUPPORTED and the `--no-census "<reason>"` route. The plain header-miss message is unchanged.
- **The regression test.** `scripts/work-record.test.mjs:1595` runs the real `build-census.mjs` CLI on `codex-lead.jsonl`, feeds the output to `acceptRecord`, and checks three things:
  - the error code is `census-missing`;
  - the message matches `/UNSUPPORTED/` and `/--no-census/`;
  - the record is not moved to `Status: accepted`.
- **Mutation check** (scratch copy, then restored). I forced `unsupported = false`; the test failed (0 pass, 1 fail). With the fix restored it passed.

### L3 (LOW): FIXED

- **The fix.** At `scripts/build-census.mjs:761-765`, a Codex lead now gets `subagents.totalTurns`, `totalByModel`, `totalByRole` and `roleFileCounts` as null. It keeps `fileCount`, `unreadable`, `unreadableDirs`, `incomplete` and `perFile`.
- **The test.** New assertions at `scripts/build-census.test.mjs:114-117`.
- **Probe.** The CLI's `--json` for the Codex fixture now prints `subagents` with those four keys null, and `combined` null.
- **Markdown is untouched.** Everything after line 1 of the Markdown output is byte-identical to db5ae5c's; I diffed the two outputs.
- **No crash from the new nulls.** `formatText` reads `subagents.totalByRole` and `totalTurns` only on the non-Codex path, after the Codex early return.

## New issues in the delta

None blocking. One NIT: the new `work-record.test.mjs:1597` test creates a temp directory and never removes it. The other new test cleans up after itself. Fix: add `t.after(() => fs.rmSync(dir, { recursive: true, force: true }))`, which needs the test callback to take `t`. It is not needed for acceptance.

The Claude path is unaffected. The `totalTurns` and aggregates are unchanged for `codex === false`, and the filtered census tests below are all green.

## Still valid from the db5ae5c seam review

Nothing in this delta changes these results:

- **Adapter parity.** Both adapters deliver byte-identical shared content. The injected `AGENTS_HOME` beats the ambient one.
- **Switches and events.** The three switches behave as documented. Only `SessionStart` and `UserPromptSubmit` get the new context, and no event registrations were added. Compact and resume handling match the docs.
- **Docs.** Every behaviour sentence in the docs is consistent with P1.
- **Census freshness.** A complete Claude census still uses its dedicated first-line `leadLastMessageAt`, and an unreadable default directory still gives `census-incomplete`. There is no fallback to a stale generic date.
- **Script paths and packaging.** Both still resolve under `${CLAUDE_PLUGIN_ROOT}`, `${PLUGIN_ROOT}` and the mirror's checkout path. The new lazy import resolves the same relative path.

## Checks run and their limits

- **Focused tests on the dad15f8 export:**
  - `node --test hooks/lib/goal-context.test.mjs hooks/multi-codex-hook.test.mjs hooks/delegation-reminder.test.mjs`: 57/57.
  - `work-record.test.mjs`, filtered to census, UNSUPPORTED and INCOMPLETE: 32/32. This includes the new UNSUPPORTED CLI seam test.
  - `build-census.test.mjs`, filtered to Codex, unreadable, MISSING, leadLastMessageAt and healthy: 18/18.
- **Probes:**
  - CLI Markdown and JSON output for the Codex fixture.
  - A Markdown diff against db5ae5c's output.
  - The two mutation checks above, run on the scratch copy only, both restored and re-verified green.
- **Limits:**
  - I did not run the full sealed suite; it is running separately.
  - No install, no live or native Codex observation, and no private transcript reads.
  - I did not re-review the other main-side content of release 0.20.8 beyond confirming that the merge brought in only the three manifest lines.
