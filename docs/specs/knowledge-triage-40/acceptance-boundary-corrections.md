VERDICT: APPLIED

Mechanical text corrections F1-F5 from acceptance-boundary-review.md applied to acceptance-boundary-report.md. No other file was read or written, no research done, no refusal occurred. The review verdict remains NEEDS_FIXES with these corrections applied, for root adjudication; this is not an independent APPROVE. Line numbers are those of the corrected report (three lines were inserted at the top: a status line plus blank, so review line numbers are offset by +2).

## Findings and changes
- **F1** (R1 attribution), table row 3, R1/R2 cell (report l.25): replaced with the reviewer's text. It now says R1 had no lock-step denial, the `Remove-Item Env:` refusal came later during recipe delivery at 21:26 EDT (recipe-delivery-blocked.md l.3-8), the replacement is the `$env:X = $null` finally (skill :78-84), and R2's lock evidence is cited to R2 report l.102.
- **F2** (scope of absence claim):
  - l.7 result paragraph: the read is now discretionary/undetermined "with respect to" the approved skill (de16056) and runner prompt/argv (80760b3), with user-scope instructions loaded by `--setting-sources user` "not examined, by scope".
  - Section 4 "Explicitly required" bullet: scoped to the same two sources.
  - Section 5 unknowns: added "whether any user-scope instruction loaded by `--setting-sources user` prompted the read (not examined, by scope)".
  - Dependency status bullet 2 (l.40): now says the gather/runner verification helpers contain no auto-commit keyword by keyword-absence check only, that the helper bodies were not read after the review's guard refusal, and cites runner :372-377 (also F5).
- **F3** (recurrence sentence): section 6 last part replaced. Removed the "if root wants a bounded change, evidence that would justify it is a second occurrence" text and the one-line-instruction suggestion. It now says the record authorizes no rerun, transcript-body read or protected-file inspection, that a repeat would show recurrence and not a mandatory cause, and that any change would need exact text tying the read to a required step. It no longer suggests any edit.
- **F4** (auto-commit behavior stated as fact): section 4 "Indirectly required" bullet now reads "if chezmoi's git auto-commit option were enabled (external tool behavior, not verified here; R2's state unknown and not to be probed), `chezmoi add` might commit before the staged-set check". Also, in the runner-environment paragraph, the claim that the user's `secret-guard.sh` is active for nested Bash was reworded as an inference (from the R1/R2 denial messages naming it; not otherwise verified), for the same reason (a tool-behavior claim without a verifying source).
- **F5** (overstatements):
  - Row 5 limit cell (l.27): replaced with "Attributed cause: prose in a shell heredoc (recipe-recovery-brief.md l.17; body not inspected). Skill :142-144 now instructs Write/Edit. No recurrence in R2." Same "attributed" wording applied in section 4 secondary observation.
  - Row 7 R1/R2 cell (l.29): replaced with "R2 outcome: 129 dirty paths preserved (R2 report l.96-98). Which checks the agent ran first is unknown; the six post-denial tools are listed at R2 report l.38."
  - Row 9 (l.31): added "(preflight)" after "R2 baseline 0 staged".
  - Runner citation: `:376-377` changed to `:372-377`.

## Diff summary
One file changed (acceptance-boundary-report.md): a 2-line correction notice under the verdict, and 13 in-place edits across the result paragraph, table rows 3, 5, 7 and 9, the runner-environment paragraph, dependency bullet 2, section 4 (three bullets and the secondary observation), section 5 unknowns and section 6. The VERDICT: MAPPED first line, classification (discretionary/undetermined), proof FAIL vs publication success split and the zero-denial statement are unchanged. This file is the only other write.
