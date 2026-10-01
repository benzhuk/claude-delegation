# Lane 40b: repair the existing census reader

Authority and pinned acceptance: spec.md, copied verbatim from dispatch.md (skills-fable-lane-40-20). Base origin/main960c7dfd11aba99778db26c7293415ddc0da0472. Opened September29 23:00 America/New_York. Author supplied Spec-from 2026-09-30T02:59:00Z in skills-fable-lane-40b-1.

Measure: reduce stalled work by restoring trustworthy census measurement and lane40 acceptance. No claim of cost savings or four-measure success before the rerun. Deadline October1 noon America/New_York, ahead of the15:00 bearings read. No installation.

## Contracts

JSONL framing is LF only; strip one trailing CR from each row. Preserve other code points including U+2028/U+2029. Preserve UTF-8 across stream chunk boundaries, a final non-LF-terminated row, blank-row semantics and stream failures. Stay streaming; do not read entire production logs into memory. Reuse an existing suitable splitter if present; otherwise one shared utility is allowed. The scout maps readers and the lead pins the exact module/export before builders start.

Every reader called by census or four-read must obey that framing. Other readline-based JSONL readers under scripts/skills are a named follow-up unless adoption is the same one-line swap to the shared splitter. No general reader rewrite or new parser policy.

Codex child completion follows dispatch.md as corrected by terminal-ruling.md: task_complete for that task may occur anywhere; item_completed is never a witness. Last-row timestamp is end time. A completed child ending before the window is excluded; an incomplete pre-window child keeps PARTIAL; a completed overlapping child is counted. Corrupt usage, unknown end coverage and conflicting evidence stay PARTIAL. A new started task must not borrow an earlier task's completion; the exact supported completion payload is pinned from existing source/schema fixtures in the scout and spec review, never guessed.

## Regression proof

Pinned interface: scripts/jsonl-lines.mjs exports async generator lfLines(stream), accepting UTF-8-decoded string chunks from createReadStream({encoding:'utf8'}). Reject non-string chunks with TypeError rather than decode incomplete bytes. Callers retain decoding and blank-row policy. Existing openLines(fsImpl,path) in build-census and token-census wraps it; no other public API changes. Both callers are in source territory. four-read stays untouched. Other readers under skills must be checked and named in the report. Use for-await so early consumer return destroys a Readable stream. Source error propagates without yielding pending remainder. Join before stripping one CR. At EOF yield any remainder nonempty before CR stripping, including a CR-only remainder as an empty row.

Clean completed pre-window children may be excluded before zero-usage checks; corruption and conflicting evidence must still mark PARTIAL. Only task_complete is supported per terminal-ruling.md; arbitrary item_completed or assistant text is never a completion witness.

### Opus spec findings resolved

Review provenance: spec-review-r1.md in work evidence, NEEDS_FIXES at fb63673. The following pins findings 1-8; independent re-review follows.

1. The positional completion predicate belongs to the most recent task_started in file order, including invalid starts. Every start clears it, even a repeated id or a missing/unusable id. Only a later task_complete with a usable id matching that start sets it. No start means no witness. Preserve existing lead metrics and final-row fields. Add a separately named child positional witness; do not reuse historical completedTurns membership. In logical child segment aggregation, choose the witness from the segment owning the newest start, and never let an invalid later start or ambiguous equal-time conflicting segments preserve an older true witness. Unknown association stays PARTIAL rather than inventing a new ordering. Pin details in source report and independent tests.
2. Pre-window exclusion requires finite sharedFrom, a clean positional witness, no invalidTaskStarted, no damaged evidence, no timestampConflict, zero windowResponses, finite latestAt strictly less than sharedFrom. It precedes the zero-usage guard, never bypasses corrupt/conflicting evidence, and does not alter the existing post-window exclusion. Unreadable children keep their existing reason. Boundary equality is in-window.
3. Completed temporal fixtures have at least one benign row after task_complete and no row after --to. Cover pre-window with and without usage, overlapping completion, and incomplete usage-bearing child with the exact no-end-bound-witness reason. Regression cases prove old-source red; retention cases correctly remain green on old source.
4. Apply the positional predicate in bounded and open child modes. Exclude pre-window only when sharedFrom is finite, including from-only and marker windows. With no start boundary there is no exclusion. Keep lead final-row behavior unchanged. Existing open zero-usage child remains PARTIAL.
5. LF tests compare exact parsed objects and absence of replacement characters, include a real production-reader file with Unicode bytes across the 65536 byte boundary, and prove removing utf8 encoding fails a test. Non-string chunks reject; no lossy decoding fallback.
6. Actual Codex reader asserts damaged is null and exact tokenRecordCount after separator rows. Actual Claude lead and child readers put Unicode in usage rows and assert exact response/token totals. Token census asserts zero malformedLines and exact turns. Old source must fail the affected assertions.
7. Source error after a complete row and partial remainder yields only the complete row then throws the same error. Early break destroys the underlying Readable. CRLF spanning chunks yields one stripped row. Keep focused resource tests.
8. Negative matching-id UserMessage item_completed and assistant text claiming completion stay PARTIAL with no-end-bound reason. terminal-ruling.md supersedes the unsupported speculative payload clause.

Keep existing Lane55 zero-usage and known-id child tests and no-end-bound assertions byte-identical. Any excluded-child output annotation must use existing perFile information and cannot manufacture discovery evidence or hide reasons. No new persistent mechanism.

Spec delta APPROVE f739541 (Opus a91bcb4e) adds N1 clarification: merged child witness requires ownerSegment.latestStartCompleted, no conflicting tie, and no invalidTaskStarted anywhere in the child's segments. Add explicit segment-invalid-start and equal-start-time/conflicting-witness retention cases. N2 stale item_completed prose above is corrected. Neither needs another spec review round.

Independent tests exercise the actual production reader with literal U+2028/U+2029 strings and check exact row count plus JSON.parse for every row. Cover LF, CRLF, Unicode/chunk boundaries, blank rows, final unterminated line and stream failure where relevant. Test the three required child cases and retention of corrupt usage/unknown end/conflicting evidence. Existing actual-parser reproduction is in prior-diagnosis-review.md; no private log copies or fixture commits in scratch homes.

## Initial territory map

- Root: docs/specs/census-reader-40b/** and docs/work/wr-2026-09-29-census-reader*.record.md; integration, acceptance and main merge.
- Sonnet source builder: scripts/build-census.mjs, census/four-read reachable reader implementations and one shared LF splitter if needed. Scout must enumerate final exact paths before implementation. Never edit assertions/tests or any work record.
- Independent test author: existing census/four-read test files, new shared-reader tests and synthetic fixtures only; final exact paths after scout. No production edits or work records.
- Opus: spec/code review via review-run, reports only. Native high-tier test author is justified by false-green measurement risk; source remains mid-tier per dispatch.

## Gates and ship

Test-first red receipt, mid-tier implementation, focused green plus retention/mutant checks, Opus APPROVE exact artifact, full sealed Windows and second-host suites. One suite per host with established nonblocking locks; ask skills-n for Netcup. Run a fresh census/four-read on unmodified native logs using the reviewed candidate before acceptance, without relabelling prior PARTIAL outputs. No waiver is presumed.

Root accepts through work-record.mjs and merges under the standing grant, main first parent and accepted lane second parent, with a plain closing bullet added to docs/decisions/history/<NY day>.md in that merge commit. No conflict resolution without a ruling. Lane40 remains unchanged until 40b merges; then rerun its census/four-read against untouched logs and a fresh measured boundary. Guards remain active, no identity edits, force push, cleanup, live triage or Notion action in the build.
