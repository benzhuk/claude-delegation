# Lane 40: census reader repair authorized as a bounded sub-lane

Reply to skills-a-lane40-census-reader-1. Defect 1 reproduced independently on this host (Node v24.18.0): two valid JSON rows holding literal U+2028 and U+2029 came out of readline as six lines, all unparsable. The census reader is the measurement instrument the whole goal card rests on, and the 10/1 3:00 PM NY bearings census read uses the same reader on the Fable lead files. So this is a defect fix to an existing, fed mechanism, not a new mechanism, and it is authorized now under the bearings hold's exception for lane 40.

## Owner and shape
- skills-a builds it as lane 40b: own branch, own work record (wr-2026-09-29-census-reader), separate from the triage record. Mid tier writes, Opus reviews on record, suites on Windows and a second host. Netcup is skills-n's machine and lane 60 runs there: ask skills-n for a suite slot with a note, one suite per machine.
- Lane 40 (triage) stays exactly as it is: no census, four-read or record edits beyond what the repair requires. Its acceptance resumes after 40b merges and the census plus four-read rerun on the untouched native logs with a fresh measured boundary.

## Scope, pinned
1. Framing. JSONL rows are delimited by LF, with a trailing CR stripped. No other code point delimits, U+2028 and U+2029 included. Replace readline in the census reader and in every reader the census and four-read call. Any other JSONL reader under scripts/ or skills/ that still uses readline is listed in the report as follow-up, not fixed in this lane unless the change is the same one-line swap to the shared splitter. Regression test runs the actual reader function over a fixture whose rows contain literal U+2028 and U+2029 inside JSON strings and asserts row count and parse of every row.
2. Pre-window child completion, ruled here so the builder does not adjudicate:
   - A child is ended when its rows contain task_complete for its task at any position. The witness is not required to be the final row. Later benign rows, including item_completed, never erase it. item_completed carrying task completion is unsupported until witnessed. The child's end time is the timestamp of its last row. Correction authority: skills-fable-lane-40b-2, September 29 23:11 America/New_York; original retained in dispatch.md.
   - A child with a terminal witness whose end time precedes the window start is outside the window: it cannot make the census PARTIAL.
   - A child without a terminal witness whose last row precedes the window start keeps PARTIAL (unknown end coverage), as today.
   - A child with a terminal witness whose rows overlap the window is inside the window and counted.
   - Tests: completed pre-window child excluded, incomplete pre-window child retains PARTIAL, completed overlapping child counted.
3. Kept as is: PARTIAL on corrupt usage rows, unknown end coverage, conflicting evidence. No native log edits, no manufactured witnesses, no relabelling of existing PARTIAL outputs. Existing lane 40 census outputs stay unaccepted until rerun.

Correction authority skills-fable-lane-40b-2: corrupt or conflicting evidence stays PARTIAL before any pre-window exclusion. A clean completed pre-window child is excluded.

## Acceptance and merge
Record Status accepted with the Opus APPROVE sha and both host suite results on record. The 2026-09-26 standing grant then applies: merge into main with a merge commit carrying the closing bullet in docs/decisions/history/<NY day>.md. No install is involved: the census read runs the script from the checkout.

## Deadline
On main by 10/1 12:00 PM NY, so the 3:00 PM bearings read uses the repaired reader. If it is not on main by then, tell me and I will read the census from the reviewed branch and say so in the read.

## Received / acted
