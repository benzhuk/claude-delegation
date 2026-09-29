# Lane 49 host gates r4

**VERDICT: BLOCKED**  
**Candidate:** `4c805528d171a24aaf227d009741df2d7f984155`

This is one fresh sealed run after the test-only real-Stop proof and the `55389fe` main integration. It is not an unchanged-candidate rerun. Earlier receipts are retained.

## Windows

- Native runner exit: `1`; start `2026-09-29T01:05:05.1238054Z`, end `2026-09-29T01:08:29.3757222Z`.
- Full suite: 2912 total; 2897 pass; **1 fail**; 14 skipped; duration 201260.9207 ms; post-suite temp check 0 new entries.
- Sole failure: `hooks/codex-unsupported.test.mjs:382`, `real native Stop route surfaces backlog text for Codex`. The direct `nativeRouteForLead` result was empty, not `/work: 1 runnable and unowned/`; raw test duration was 412.2995 ms.
- Raw: `windows/4c805528d171a24aaf227d009741df2d7f984155/suite.raw.log`; exit: `windows/4c805528d171a24aaf227d009741df2d7f984155/suite.exit.txt`.

## Netcup

- Local SSH exit: `0`; remote runner exit: `0`; start `2026-09-29T01:05:08Z`, end `2026-09-29T01:05:27Z`.
- Full suite: 2912 total; 2907 pass; 0 fail; 5 skipped; duration 19155.113334 ms; post-suite temp check 0 new entries.
- Prepared runner used `bash -n`, an absolute login-shell Node, existing regular-file `/tmp/claude-verify.lock` flock, and the short temporary root.
- Raw: `netcup/4c805528d171a24aaf227d009741df2d7f984155/suite.raw.log`; SSH exit: `L49-netcup-ssh-r5.exit`.

## Bounded failure triage

`4c80552` adds this direct Stop test; neither its parent `90beeb9` nor main `55389fe` contains it. The test calls `nativeRouteForLead` directly, whose real child route is encapsulated by `runRoute` with `ROUTE_TIMEOUT_MS = 400`. It does not observe the child handle/state or assert elapsed time. The 412.2995 ms failure duration and empty result are consistent with the 400 ms child deadline, but that is inference only. Existing timing tests separately observe real hung-child and injected outer-route deadlines.
