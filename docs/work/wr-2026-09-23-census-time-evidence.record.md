Work: wr-2026-09-23-census-time-evidence
Scope: docs/specs/2026-09-23-census-time-evidence.md
Owner: skills-a
Status: owned
Authority: Ben authorizes useful source fixes, testing and merges; no installation/config or historical timestamp fabrication
Artifact: none
Evidence: none
Next: mid-tier builder repairs the existing census measurement boundary, then independent review and full sealed gate
Opened: 2026-09-24T03:52:00Z
Builder: GPT-5.6-Terra
Rounds: 1

Predicts: Actual malformed timing evidence is reported as unknown instead of a timestamp string or numeric-looking NaN/negative duration; valid historical measures remain unchanged.
Observed: Running the real work census printed Sol as the first delivered timestamp for the status-revision repair because the parent wrote a malformed prose Log. The implementation also subtracts Date.parse results without checking validity or chronology. Parent owns the producer mistake; this repair stops unknown temporal evidence being rendered as a normal measurement.
