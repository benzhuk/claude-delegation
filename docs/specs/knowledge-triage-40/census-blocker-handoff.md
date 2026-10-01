# Lane 40 census blocker: valid JSONL split by the reader

Reply to skills-fable-lane-40-19. Delivery is verified locally (Windows hash C3A993F4) and peer-confirmed on all three hosts. R2 evidence is ready under the clarified criterion. The production source remains approved80760b3 with both host gates green. No R3.

Acceptance now fails on a real census-reader limitation, independently reproduced. Please route or authorize a bounded build-census repair; no acceptance waiver is requested. Lane40 has not changed census, four-read or work-record production code.

1. Node v24.18.0 readline splits literal U+2028/U+2029 inside valid JSON strings. scripts/build-census.mjs uses readline, then stops on the first invalid fragment. The actual lead file and three children are valid when framed on LF. The lead census stopped at2026-09-29T23:37:49.690Z although later valid rows exist through the requested window. Independent synthetic verification used the actual exported censusCodexLeadFile and reproduced malformed JSON row; this is not an inferred cause or a request to skip corrupt rows.
2. A fourth child (01a0eb03-ad86-7020-8bbe-723da3ab9581) ended wholly before the build window. Its task_complete is followed by item_completed, so the final-row witness predicate loses the completion and the child keeps the entire census PARTIAL. The current code skips only children starting after the window, not a provably completed pre-window child. Any fix needs a verified completion condition; simply excluding every early-looking or truncated child would be unsafe.

Proposed bounded repair: frame JSONL on LF without treating legal Unicode characters as delimiters, with a discriminating regression against the actual reader. Adjudicate the pre-window terminal evidence rule and test both a completed old child and an incomplete child that could overlap the window. Retain PARTIAL on actual corrupt usage, unknown end coverage and conflicting evidence. Then rerun the same census/four-read on untouched native logs with a fresh measured boundary. No native log edits, manufactured witnesses or relabelling old PARTIAL.

Evidence in docs/specs/knowledge-triage-40/:
- census-execution-report.md (original CLI verdict and limitations)
- census-diagnosis.md (bounded metadata-only checks of the five affected logs)
- census-diagnosis-review.md (independent native high-tier synthetic confirmation)
- publication-recipe-delivered.md and live-proof-r2-clarified-adjudication.md

Census/four-read output: docs/work/evidence/wr-2026-09-29-knowledge-triage.{census,spec-census,four-read}.{md,json}. Build verdict PARTIAL; spec slice COUNTED. Four cells: top-tier total unavailable; 7.5h to provisional acceptance boundary; pre-acceptance rework reads0 (not a seven-day outcome); native stall classification unavailable with one unanswered pickup ASK. Observed token counts are partial and shell-launched Claude roles are outside the native graph. No four-measure success is claimed.

Root corrected record formatting exposed by strict checks: later Log entries had been below the first blank line, outside parseRecord's header. They are now in the parsed header, preserving dates and substance, with APPROVE/model spacing repaired. No verifier change. Strict check now reaches census recognition and refuses PARTIAL with census-missing; work-record requires a COUNTED Markdown report, not the census JSON. Four-read consumes JSON. Existing output stays unaccepted.

Fresh main preview was clean against59d641f5845905a78051931ffe1f560691253fac. No main merge, push, suite or installation occurred. Gate procedures are prepared; slot requests to skills-o and skills-n were withdrawn because no gate is ready. No lock held. The lane remains blocked solely on truthful census acceptance and subsequent integration work. Bearings publication remains separately PENDING on its recorded full-page lint issue.
