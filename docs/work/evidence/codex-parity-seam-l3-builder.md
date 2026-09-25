VERDICT: PASS (uncommitted integration seam fix)

Codex unsupported child coverage now serializes subagents.totalTurns, totalByModel,
totalByRole, and roleFileCounts as null while retaining fileCount, unreadableDirs,
incomplete, excludedByWindow, and perFile diagnostics. Markdown remains safe because its
Codex unsupported path does not enumerate null aggregates. Claude behavior is unchanged.

Validation: `node scripts/run-tests.mjs scripts/build-census.test.mjs` passed 65/65 in a
sealed temporary home. No git add or commit was performed.
