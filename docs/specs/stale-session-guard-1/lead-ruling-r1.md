# Lane 42 review r1: lead rulings

Review: reports/review-r1.md (Opus, VERDICT: NEEDS_FIXES aeb7f76).

- MAJOR 1: IN, as the reviewer wrote it. A CLI-level test that runs the real guard process against a scratch HOME with a stale cache copy and NO dispatch-guard-enforce file, asserting permissionDecision deny and R0-stale. It must fail when the `|| result.hardDeny` term is removed; say in the report that you checked this by reverting it.
- MINOR 2: IN, as patched (realpath the cache dir, fail-open kept), with the symlinked-home test (junction on win32). The lead accepts the second realpath call; it amends P3's budget of one.
- MINOR 3: IN, as patched (`hard_deny` in the log line), plus the assert in the MAJOR 1 test.
- MINOR 4: IN, as patched: a red exit shows its reason in --json and table modes too.
- NIT 5: IN, as the reviewer wrote it.
- Deviations 1 and 2 of the build report stand, as the reviewer ruled.
