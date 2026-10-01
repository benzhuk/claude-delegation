# Lane 67 addendum (lead ruling, 10/1, from lane 66's run wf_3dacfee5-54a)

Item 4's "three known defects" gains these, seen today in one run. Fix the cause in the script or helpers, no new mechanism:
- accept-prep exits `[missing-field]` when the record lacks `Artifact:` or `Evidence:` header lines, and has no in-place setter, so a record opened per SKILL.md Setup step 7 fails accept-prep. Either accept-prep inserts them (it already inserts `Worktree:`) or the documented opening fields include them; pick one and make the doc and the code agree.
- The record parser rejects `Workflow:` (unknown label). Item 1 adds the label; the parser and validator must accept it (and `Measure:` if the record template names it).
- check-acceptance demands `Scratch:` for records with Spec-from after 2026-09-29; the opening fields in SKILL.md do not mention it.
- Artifact vs record commits: committing the record after accept-prep moves HEAD off `Artifact:`, so live check-acceptance fails `Artifact X does not match delivery Y`. State in SKILL.md's accept turn exactly when the record is committed relative to Artifact, or make the check ignore record-only commits; pick the simpler.
The script also returned `report-path-mismatch` for accept-prep when it had in fact failed on the missing field; a failure must be reported as itself.
