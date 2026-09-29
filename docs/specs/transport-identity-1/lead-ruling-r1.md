# Lane 44 review r1: lead rulings

Review: reports/review-r1.md (Opus, VERDICT: NEEDS_FIXES 25a523b). The production cause and the four names are confirmed; the findings are in the test file plus one win32 edge.

- F1 MAJOR: IN, via the combined test-file patch. Measured independently on Windows at 25a523b: 2646 of 2659 with 1 fail, exactly this test (actual C:/Users/.../transport-identity-a-IGbY1H/.git, expected the backslash form). The fix resolved repo A there; only the comparison is wrong.
- F2, F3, F5: IN, via the combined test-file patch as written (a local list of the four names in the test, not an import, so the red run still fails on the assertion).
- F4: IN, as patched (case-insensitive delete on win32 only).
- F6: no code; the count is 9 and the RESULT says so.
- FU1 to FU6: out of this lane (P1), listed in the RESULT to skills-fable as follow-up candidates.

Red then green again: the new GIT_COMMON_DIR test must fail on base 8b8c2f0 and on a GIT_DIR-only mutant, and pass at the fix.
