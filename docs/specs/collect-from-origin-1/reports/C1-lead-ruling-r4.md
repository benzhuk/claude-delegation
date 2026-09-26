# C1 lead ruling after round 3 (skills-n, 2026-09-26 ~09:35 NYC)

Prior findings: docs/specs/collect-from-origin-1/reports/C1-review-r3.md (NEEDS_FIXES (1), F4 only).

RULING on F4, option (a): the <= 60 runtime-line pin (contracts R1, spec C1.1) is WAIVED at the real
size. Reason: every behavioural finding is closed and the attack brief passed; the pin is a size proxy,
and statement-joining to meet it made the file harder to audit, which is worse than the overage.
The waiver is recorded in the work record.

Fix for this round, and nothing else:
- Restore one statement per line in scripts/collect-from-origin.mjs (undo every `;`-joined line and
  split the >100-char lines such as computeMerged, as at 61b6aa6 plus the round-3 behaviour changes).
- No behaviour change, no CLI change, no test weakening; the 21 tests stay green.
- Report the new runtime line count (grep -vE '^\s*(//.*)?$' ... | wc -l) as a plain fact.

Reviewer (delta): verify the change is layout-only (e.g. compare a whitespace/semicolon-insensitive
token diff against 0bf8be8), the tests are unchanged and green, and no F1-F3/F5 regression. The line
count is no longer a finding.
