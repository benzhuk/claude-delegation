# Root acceptance preflight correction

September 29, 2026, America/New_York. No acceptance performed.

The first strict-check refusal was not only APPROVE spacing. parseRecord reads Log lines only before the first blank line. Root had appended later entries below that boundary, making them invisible to the parser. Root moved all existing Log lines into the header without changing timestamps or substantive evidence, and inserted spaces between APPROVE/model names and adjacent identifiers. This is a record formatting repair; no verifier changed.

After that repair, check-acceptance reached census recognition. It correctly refused the census JSON because work-record's census input is the Markdown report. Four-read uses JSON. With the Markdown path supplied, strict acceptance still refuses because its first line is VERDICT: PARTIAL; the required recognizer is VERDICT: COUNTED. No header was relabelled and no no-census exception was used.

The six census/four-read files preserve the first run at measured boundary2026-09-30T02:45:58.2499761Z. They predate the record header repair and are preliminary, not acceptance evidence of a complete build. A new run must use the corrected record, a fresh measured boundary and reviewed fixes for the independently verified census reader/witness defects. Pre-acceptance rework0 and incomplete native observations are not proof of seven-day quality, full cost or no stalls.

The reader diagnosis and independent synthetic reproduction are in census-diagnosis.md and census-diagnosis-review.md. Root routed them via skills-a-lane40-census-reader-1. The scope remains blocked on a truthful complete census or an explicit reviewed policy decision; no waiver is presumed. Existing approved source, host gates, delivered recipe and clarified R2 evidence remain intact.
