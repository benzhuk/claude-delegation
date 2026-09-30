VERDICT: SOURCE_READY (existing scoped gate green; new independent tests not yet run against it)
Source commit: 749c670f63df79619101c0e05eaed3bcbdd31a49 on benzhuk/census-reader-40b-source (base fb63673). Files: scripts/jsonl-lines.mjs, scripts/build-census.mjs, scripts/token-census.mjs. No tests, records, pushes or other files touched.

## Implementation map (contract -> code)
- lfLines(stream): for-await over chunks (early return destroys Readable); non-string chunk -> TypeError; split on LF only; one CR stripped after joining (CR across chunk boundary ok); blank rows yielded; nonempty unterminated remainder yielded (CR-only -> ''); source error rethrown without yielding the pending remainder.
- openLines in build-census.mjs and token-census.mjs now `return lfLines(stream)` (still createReadStream utf8, fsImpl seam kept); readline imports removed. four-read untouched.
- Positional witness (finding 1): parser in censusCodexLeadFile adds openTurn/latestStartCompleted/untimedStart, returned separately from finalRowCompletesTurn/finalEvent/completedTurns (lead metrics unchanged). Every task_started (valid, invalid, repeated id) sets openTurn=its id-or-null and clears the witness; a task_complete with usable id == openTurn sets it. Only task_complete counts (finding 8/terminal-ruling); item_completed/assistant text never a witness.
- Segment merge: witness taken from the segment owning the strictly newer lastStartedAt; equal-time newest starts AND the witnesses (conflict -> false); untimedStart ORed. childEnded(state) = latestStartCompleted && !invalidTaskStarted && !untimedStart (an invalid or untimed start anywhere -> PARTIAL, conservative).
- Ended check replaced in bounded child rule (`!hasRowAfterTo && !childEnded`) and open-mode child rule (finding 4). Reason strings unchanged.
- Pre-window exclusion (finding 2): childEndedBeforeWindow = finite sharedFrom (from-only/marker included) && childEnded && !damaged && !timestampConflict && windowResponses===0 && finite latestAt strictly < sharedFrom. Placed after the existing post-window skip (unchanged) and before damaged/zero-usage checks in bounded mode, first in the loop in open mode. No finite from -> no exclusion (Lane55 open zero-usage child stays PARTIAL). Unreadable children keep unusableChildren reason. Excluded child still adds existing 'unusable child coverage' to unavailable (as the review noted; not touched, no discovery.excluded change).
- Lead rules untouched.

## Gate
Mutex Global\claude-verify acquired nonblocking (free), released after. `node --test` on scripts/build-census.test.mjs, build-census.codex.contract, build-census.completeness, build-census.wake-split, token-census.test: 161 tests, 161 pass, 0 fail. Output: C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/census-reader-40b/source-gate.out. Limits: existing tests only (they were green on old source too for retention cases); none of the new regression cases exist yet, so the fix is not proven red->green. Scratch smoke: chunked input with U+2028/U+2029 and CRLF across chunks yields the expected 3 rows. No temporal-fixture run of the new exclusion path was done.

## Other readline JSONL readers
build-census.mjs and token-census.mjs were the only JSONL readline users (both swapped). Repo-wide grep (excluding node_modules/.git) for readline/createInterface: only scripts/test-home.test.mjs (child stdout, not JSONL) plus docs. None under skills/. Follow-up: none.

## C4
Cause: readline frames rows on U+2028/U+2029 (both openLines), and the child end rule accepted only a final-row task_complete via finalRowCompletesTurn.
Discriminating check: separator-in-usage-row fixtures through censusLeadFile/censusCodexLeadFile/censusSubFile/token-census (damaged null, exact totals, malformedLines 0); pre-window child `task_started A, task_complete A, benign row` excluded, but `started A, complete A, started A` and invalid-restart stay PARTIAL with the no-end-bound reason.
Fix location: scripts/jsonl-lines.mjs; openLines in build-census.mjs/token-census.mjs; censusCodexLeadFile start/complete tracking; child segment merge; child temporal rules.
Simplification: one positional boolean replaces final-row test and set lookups; one guarded `continue` per mode; no new mechanism.
