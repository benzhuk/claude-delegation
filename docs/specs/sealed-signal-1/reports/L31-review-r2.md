VERDICT: APPROVE b5341c71d9436427e31bdae11a6726ec798d1946

Reviewer identity: Codex independent reviewer `/root/lane31_review` (GPT-6-Astra).
Reviewed-at: 2026-09-28T03:17:00Z; September 27, 2026, 11:17:00 PM America/New_York.

This verdict approves the four-file implementation/test source delta. The separate
proof-artifact verdict below is NEEDS_FIXES. Overall acceptance remains blocked on
proof repairs and the required live proofs and host gates. No runtime tests or
diagnostics were executed by this reviewer.

Cause: the first revision's forwarding handler repeated a foreign listener's
signal, the F4 fixture had invalid source separators and no pre-signal liveness,
and the Windows regression attached its exit observer too late.
Discriminating check: the repaired F4 fixture can reach the signal; the new
runSealed foreign-listener fixture requires one delivery and its chosen exit 73;
the Windows test now subscribes before taskkill. The existing runner-only test
requires SIGTERM/143, timely home removal, and immediate-controller termination.
Fix location: `scripts/run-tests.mjs:136`; `scripts/test-home.test.mjs` F4 fixture;
`scripts/run-tests.test.mjs` foreign-listener fixture and Windows taskkill test.
Simplification: the same conditional re-raise rule now governs both handlers;
fixtures reuse the established controller marker and bounded exit waiter.

## Source approval evidence

Git HEAD was resolved directly as
`b5341c71d9436427e31bdae11a6726ec798d1946`. Git ancestor checks confirmed that the
original F4 commit `1311df737ab46cf7570d47e6207799e5bc6233c0`, original R1 commit
`c9e5029da51270fe59b29c8749f532c7ef8cde57`, and latest main `a06848d` are ancestors.
The original distinct F4/R1 commit boundary is preserved. Only the owner's work
record was dirty at inspection; it was not edited. The first review is unchanged.

All three first-review findings are resolved in the reviewed source:

- Both `onProcessSignal` and `forwardSignal` remove their own listener before
  re-raising only if the signal's listener count is zero. A foreign listener
  registered before `runSealed` receives the original delivery once and retains
  ownership of its bounded exit. With no foreign listener, home cleanup precedes
  forwarding and the default signal outcome is preserved.
- F4 generated JavaScript now uses actual newlines between statements and when
  parsing stdout. Escaped newlines inside generated JavaScript string literals
  remain correctly escaped. A ref'ed interval prevents premature normal exit.
  The foreign listener's existing timer still exits the fixture. The new wrapper
  fixture uses valid separators, a live child, and a foreign-listener timer; its
  `runSealed` Promise sets the numeric exit code through `.then`.
- The Windows test constructs its runner-exit Promise before starting taskkill,
  eliminating the missed-event ordering. It still targets the immediate suite
  controller PID with `/F`, without `/T`, and checks kept-on-failure afterward.

The foreign-listener regression discriminates the rejected forwarding source by
delivery count, not a syntax error or unawaited Promise assertion. The repaired
standalone F4 test similarly discriminates the old unconditional home-handler
re-raise. These are static conclusions about test structure, not claims that the
POSIX tests have passed. The documented round-two Windows focused result is native
exit 0, 35 pass, 0 fail, 9 skip; POSIX cases remain skipped there. No new source
blocker was found in this delta. First-review limits on unexercised canary/start/
close races remain limits, not newly invented scope.

## Proof-artifact verdict: NEEDS_FIXES

Reviewed artifacts:

- `docs/specs/sealed-signal-1/reports/L31-live-proof-f4.sh`
- `docs/specs/sealed-signal-1/reports/L31-live-proof-posix.sh`
- `docs/specs/sealed-signal-1/reports/L31-proof-plan.md`

These scripts have not run. Their HEAD assertions, isolated checkout plan, actual
JavaScript newlines, F4 pre-signal interval, ready marker, and runner-PID-only signal
targeting are appropriate. The R1 fixture uses the immediate controller PID and
does not assume signal delivery to a test worker. Scratch evidence is retained.

### MAJOR — R1 proof can print PASS for a nonsignal exit

`L31-live-proof-posix.sh:66-74` records `runner_exit` but never tests it. A regression
which forwards and cleans up promptly but returns 0 or 1 can satisfy every check
and produce PASS. Merely printing the unknown result is not an assertion of the
pinned SIGTERM outcome. Bash `wait` exposes the required native SIGTERM exit as 143
on the target POSIX host. Require that exact value.

### MINOR — time measurement precedes the actual home-absence observation

`L31-live-proof-posix.sh:67-69` samples elapsed time before checking the home.
Measure after that check, while retaining its position before the independent
controller-death polling loop. This makes the five-second claim cover the actual
home-absence observation as well as runner termination.

Combined ready-to-apply R1 patch:

```diff
--- a/docs/specs/sealed-signal-1/reports/L31-live-proof-posix.sh
+++ b/docs/specs/sealed-signal-1/reports/L31-live-proof-posix.sh
@@
 wait "$runner"; runner_exit=$?
+test "$runner_exit" -eq 143 || fail "RUNNER_NOT_SIGTERM_EXIT=$runner_exit"
+test ! -e "$home" || fail "RUNNER_HOME_REMAINS=$home"
 elapsed=$(( $(date +%s%3N) - sent_at ))
 test "$elapsed" -le 5000 || fail "RUNNER_ELAPSED_MS=$elapsed"
-test ! -e "$home" || fail "RUNNER_HOME_REMAINS=$home"
 deadline=$((SECONDS + 5))
```

Discriminating check: a controlled runner that removes its home and exits 0 after
SIGTERM must fail with `RUNNER_NOT_SIGTERM_EXIT=0`; a home observation after the
five-second bound must fail even if runner exit was observed earlier. Static
review establishes that the added checks reject those paths; no mutation was run.

### MINOR — F4 timeout skips its existing controlled-child cleanup

`L31-live-proof-f4.sh:50` exits immediately when the signal fixture is still alive,
leaving its ref'ed interval running. The script already has a bounded `reap_child`
routine used by the readiness failure; invoke that same routine here. This changes
only failure cleanup and does not turn the failure into PASS.

```diff
--- a/docs/specs/sealed-signal-1/reports/L31-live-proof-f4.sh
+++ b/docs/specs/sealed-signal-1/reports/L31-live-proof-f4.sh
@@
-if kill -0 "$child" 2>/dev/null; then printf 'F4_CHILD_NOT_GONE retained=%s\n' "$scratch" >&2; exit 1; fi
+if kill -0 "$child" 2>/dev/null; then reap_child; printf 'F4_CHILD_NOT_GONE retained=%s\n' "$scratch" >&2; exit 1; fi
```

Discriminating check: a fixture that keeps its interval alive after SIGTERM must
still produce the timeout failure and pass through bounded TERM/KILL cleanup.

Update the plan's candidate-success wording to require `RUNNER_EXIT=143` and say
the elapsed measurement includes home absence before controller polling. No new
proof scenarios, dependencies, source changes, or gate repetitions are requested.
