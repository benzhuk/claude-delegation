# Lane 40b: repair the existing census reader

Authority and pinned acceptance: dispatch.md (skills-fable-lane-40-20). Base origin/main960c7dfd11aba99778db26c7293415ddc0da0472. Opened September29 23:00 America/New_York. True Spec-from requested from the author, not inferred.

Measure: reduce stalled work by restoring trustworthy census measurement and lane40 acceptance. No claim of cost savings or four-measure success before the rerun. Deadline October1 noon America/New_York, ahead of the15:00 bearings read. No installation.

## Contracts

JSONL framing is LF only; strip one trailing CR from each row. Preserve other code points including U+2028/U+2029. Preserve UTF-8 across stream chunk boundaries, a final non-LF-terminated row, blank-row semantics and stream failures. Stay streaming; do not read entire production logs into memory. Reuse an existing suitable splitter if present; otherwise one shared utility is allowed. The scout maps readers and the lead pins the exact module/export before builders start.

Every reader called by census or four-read must obey that framing. Other readline-based JSONL readers under scripts/skills are a named follow-up unless adoption is the same one-line swap to the shared splitter. No general reader rewrite or new parser policy.

Codex child completion follows dispatch.md: a terminal event for that task may occur anywhere, including task_complete or an item_completed carrying the task's completion. Last-row timestamp is end time. A completed child ending before the window is excluded; an incomplete pre-window child keeps PARTIAL; a completed overlapping child is counted. Corrupt usage, unknown end coverage and conflicting evidence stay PARTIAL. A new started task must not borrow an earlier task's completion; the exact supported completion payload is pinned from existing source/schema fixtures in the scout and spec review, never guessed.

## Regression proof

Independent tests exercise the actual production reader with literal U+2028/U+2029 strings and check exact row count plus JSON.parse for every row. Cover LF, CRLF, Unicode/chunk boundaries, blank rows, final unterminated line and stream failure where relevant. Test the three required child cases and retention of corrupt usage/unknown end/conflicting evidence. Existing actual-parser reproduction is in prior-diagnosis-review.md; no private log copies or fixture commits in scratch homes.

## Initial territory map

- Root: docs/specs/census-reader-40b/** and docs/work/wr-2026-09-29-census-reader*.record.md; integration, acceptance and main merge.
- Sonnet source builder: scripts/build-census.mjs, census/four-read reachable reader implementations and one shared LF splitter if needed. Scout must enumerate final exact paths before implementation. Never edit assertions/tests or any work record.
- Independent test author: existing census/four-read test files, new shared-reader tests and synthetic fixtures only; final exact paths after scout. No production edits or work records.
- Opus: spec/code review via review-run, reports only. Native high-tier test author is justified by false-green measurement risk; source remains mid-tier per dispatch.

## Gates and ship

Test-first red receipt, mid-tier implementation, focused green plus retention/mutant checks, Opus APPROVE exact artifact, full sealed Windows and second-host suites. One suite per host with established nonblocking locks; ask skills-n for Netcup. Run a fresh census/four-read on unmodified native logs using the reviewed candidate before acceptance, without relabelling prior PARTIAL outputs. No waiver is presumed.

Root accepts through work-record.mjs and merges under the standing grant, main first parent and accepted lane second parent, with a plain closing bullet added to docs/decisions/history/<NY day>.md in that merge commit. No conflict resolution without a ruling. Lane40 remains unchanged until 40b merges; then rerun its census/four-read against untouched logs and a fresh measured boundary. Guards remain active, no identity edits, force push, cleanup, live triage or Notion action in the build.
