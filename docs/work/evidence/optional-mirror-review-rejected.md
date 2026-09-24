**NEEDS_FIXES.** I reviewed the source as it stands at the reported HEAD `e8065af` (`135537f` + `1f65ca3`, guide `6507f00`). That SHA comes from the session-start git snapshot. I had no execution tools, so I haven't checked it myself.

I didn't run any tests. The builder's "21 passing" is their report; I only confirmed that `mirror-shim.test.mjs` defines exactly 21 tests.

## Findings

**MINOR (the only blocker, a one-line fix): in dry-run mode, the new diagnostic reads "would optional source skill not sourced: …"**
- `scripts/mirror-shared-skills.mjs:145-147` adds "would " to any line that doesn't match `NO_OP`. The new line at `:289` doesn't match.
- A dry run is exactly what the spec targets and what the guide tells operators to run. There the diagnostic is ungrammatical, and it presents a present-tense fact as a planned action. The existing refusal line was added to `NO_OP` for this same reason (`:141-145`).
- The tests at `mirror-shim.test.mjs:220,237,239` use `includes`, which hides the problem.
- **Fix:** add `optional source` to `NO_OP`, or rephrase so the line starts with an existing no-op word. Then have one test check the exact dry-run line, e.g. with `startsWith('optional source skill not sourced: knowledge')`.

**LOW (no fix required, but name it): a narrow change to what counts as usable**
- Before, `isSkillDir` accepted a `SKILL.md` that was a directory, because it used `existsSync`. Now `:379` rejects it.
- That's arguably more correct, but the contract says "usable sources … unchanged". Either accept this in the record or match the old rule.

**LOW: some diagnostic branches are untested**
- No test covers "SKILL.md is not a file", the `inspection failed: <code>` path, or symlinks.
- By inspection: `statSync` follows symlinks, so a symlink to a real skill is still selected, as before. A dangling link reports "source missing". That's defensible, since the target really is missing, but it doesn't say a link exists.
- `ENOTDIR` counted as "missing" (`:384`) blurs the case where `~/.claude/skills` itself is a file. That's acceptable for an optional source.

**LOW: `docs/native-use.md:33` says the mirror "publishes eight … skills"**
- It also publishes knowledge, triage and learn when they're present, and it now reports when they aren't.
- **Fix:** one clause, e.g. "plus optional ~/.claude/skills sources when present; omissions appear in `actions`."

## Confirmed by inspection
- **API, JSON shape and refusals:** exports, the `collectSources()` signature, `ok` and `refusals` are unchanged. Optional omissions go only to `actions`, and bundled-skill refusals are unchanged. I couldn't search for other consumers of `actions`, so that's unchecked.
- **Dry-run doesn't write:** the check at `:223` (the temp home stays empty) is a strong assertion. The check at `:245` confirms nothing is published.
- **Copy/symlink test:** the regex at `:242` matches both the Windows copy log line (`:483`) and the POSIX symlink log line (`:439`). The usable `learn` source is selected on both.
- **Source vs. installed claims:** reason strings describe only the source and make no claim about the destination. They don't guess causes; unknown errors show their raw code (`:385`).
- **Cause vs. compensation:** this fixes the real cause (the silent `else` at the old omission point) using the existing `say`/`actions` channel. The new inspection function is justified because the diagnostic needs a reason. No unnecessary mechanisms were added.
- **Explicit-stop contract:** `docs/native-use.md:17` ("Honor an explicit user stop or pause. Otherwise…") now matches `skills/continue/SKILL.md:15,21,25,39`. The evidence file's `GUIDE_CORRECTION_REQUIRED` header is the historical review verdict, and `:9` records the correction at `6507f00`. That's consistent.