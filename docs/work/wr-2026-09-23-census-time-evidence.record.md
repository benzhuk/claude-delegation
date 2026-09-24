Work: wr-2026-09-23-census-time-evidence
Scope: docs/specs/2026-09-23-census-time-evidence.md@071e841d2d017ad6bf3435fd4f87fd25a9f034d8
Owner: skills-a
Status: accepted
Authority: Ben authorizes useful source fixes, testing and merges; no installation/config or historical timestamp fabrication
Artifact: b04172836e0f394ee1af5de1e8fb28ee12d2d8d7
Evidence: docs/work/evidence/census-time-evidence-independent-review.md, docs/work/evidence/final-0203-integration.md
Next: release0.20.3 and update authorized plain mirror; measure actual useful work without reconstructing missing historical times
Opened: 2026-09-24T03:49:33Z
Builder: GPT-5.6-Terra
Rounds: 1
Log: 2026-09-24T03:54:05Z accepted skills-a artifact b04172836e0f394ee1af5de1e8fb28ee12d2d8d7 Strict pinned acceptance returned ok:true immediately before this transition; source integrated and full gate passed.
Log: 2026-09-24T03:54:05Z reviewed skills-a artifact b04172836e0f394ee1af5de1e8fb28ee12d2d8d7 Integrated at frozen b80088253d4c556556b7a0cc0333faffdcfdb906; full sealed suite1393/1393actualexit0, unchangedHEAD, diffcheck0.
Log: 2026-09-24T03:52:32Z reviewed skills-a artifact b04172836e0f394ee1af5de1e8fb28ee12d2d8d7 Independent Astra APPROVE;22focused and10additional scenarios plus actualCLI/inputimmutability passed.
Log: 2026-09-24T03:51:42Z delivered skills-a artifact b04172836e0f394ee1af5de1e8fb28ee12d2d8d7 agent-exited; focused22/22actualexit0, source ownership returned, independent review dispatched.
Log: 2026-09-24T03:49:33Z owned skills-a Corrected pre-dispatch clerical Opened value using observed UTC clock; no prior delivery/review/acceptance event is inferred.

Predicts: Actual malformed timing evidence is reported as unknown instead of a timestamp string or numeric-looking NaN/negative duration; valid historical measures remain unchanged.
Observed: Running the real work census printed Sol as the first delivered timestamp for the status-revision repair because the parent wrote a malformed prose Log. The implementation also subtracts Date.parse results without checking validity or chronology. Parent owns the producer mistake; this repair stops unknown temporal evidence being rendered as a normal measurement.

Observed: Independent review reproduced ten additional timing cases and a real child CLI with unchanged inputs. Invalid latest acceptance remains unknown instead of falling back, valid offsets/fractions and true zero retain their values. The original malformed parent Log remains preserved; its timing is now unknown. Full sealed integration passed1393tests. This is data-validity evidence, not comparative speed improvement.
