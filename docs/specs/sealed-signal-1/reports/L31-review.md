VERDICT NEEDS_FIXES 219f7a95da57600c996f6b776f317f3a6800a8d5

Reviewed-at: 2026-09-28T03:00:33Z; September 27, 2026, 11:00:33 PM America/New_York.

Independent static/source review of builder checkout HEAD above, base
`3dbe93567049ffc2fdd4fbe424226e57b7dc7ed0`. Git confirms F4
`1311df737ab46cf7570d47e6207799e5bc6233c0` and R1
`c9e5029da51270fe59b29c8749f532c7ef8cde57`; the receipt commit does not change
implementation. No tests or diagnostics were run by this reviewer. The builder's
Windows gate reports native exit 0, 35 pass, 0 fail, 8 skip. POSIX runtime behavior
is not verified here and that gate cannot establish it.

Cause: the asynchronous runner adds an unconditional signal re-raise alongside the
corrected home handler; the F4 regression contains literal backslash-n separators
and does not hold its fixture alive before the signal; the Windows regression
registers for runner exit after the action that can already have caused that exit.
Discriminating check: execute valid, live isolated fixtures with another listener,
signal the runner PID only, and assert exactly one listener delivery; register exit
observation before taskkill. The current F4 regression fails before signal delivery.
Fix location: `scripts/run-tests.mjs:136`, `scripts/test-home.test.mjs:462-481`,
`scripts/run-tests.test.mjs:483-488`.
Simplification: reuse the same conditional re-raise rule in both handlers; retain
the existing fixture structure with actual newlines and one keep-alive timer; move
one existing exit-promise creation ahead of taskkill.

## MAJOR 1 — R1 reintroduces duplicate delivery to another listener

`scripts/run-tests.mjs:129-136`: with a caller's SIGTERM listener registered, the
original delivery invokes that listener, then `onProcessSignal` removes the home
and its own listener, then `forwardSignal` kills the child and unconditionally
re-raises. The caller receives the same SIGTERM a second time. A caller implementing
“second interrupt forces exit” therefore has its first-interrupt outcome overridden.
The F4 fix in `test-home.mjs:69` is exact and correct in isolation, but the new
forwarder defeats it whenever `runSealed` is active. The shipped standalone F4 test
never imports or exercises `runSealed`.

Ready-to-apply patch:

```diff
--- a/scripts/run-tests.mjs
+++ b/scripts/run-tests.mjs
@@
       for (const handled of signals) process.removeListener(handled, forwardSignal);
-      process.kill(process.pid, signal);
+      if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
```

Add an isolated POSIX regression which registers a foreign SIGTERM listener before
calling `runSealed`, waits for the existing suite-controller ready marker, then
signals only that wrapper PID. The foreign listener should keep the process alive
for a bounded 250 ms sentinel and exit with its chosen code; assert one delivery,
home removed, and controller gone. This discriminates the current unconditional
forwarder from the patch by delivery count, not Promise/type errors. The existing
runner-only test continues to require the raw SIGTERM outcome when no foreign
listener owns it.

## MAJOR 2 — F4's required regression cannot reach its signal assertion

`scripts/test-home.test.mjs:468` joins generated source using `"\\n"`, which is a
literal backslash followed by n, outside JavaScript strings. `node -e` encounters
invalid syntax immediately after the first import statement. Lines 479 and 481
also look for/split literal backslash-n although the child prints an actual newline.
The test consequently cannot establish its claimed one-delivery outcome. This was
copied from `L31-F4-tests.patch`; the independent artifact is not independent runtime
proof. Once those escapes are repaired, the script still needs a ref'ed handle:
installing a signal listener alone does not keep Node alive while awaiting SIGTERM.

Ready-to-apply patch (retain the two escaped newlines INSIDE generated string
literals at lines 465 and 467; those are correct):

```diff
--- a/scripts/test-home.test.mjs
+++ b/scripts/test-home.test.mjs
@@
       "let deliveries = 0;",
+      "setInterval(() => {}, 1000);",
@@
-    ].join("\\n");
+    ].join("\n");
@@
-        if (!sent && output.includes("\\n")) { sent = true; child.kill("SIGTERM"); }
+        if (!sent && output.includes("\n")) { sent = true; child.kill("SIGTERM"); }
@@
-      child.once("exit", (exitCode) => { clearTimeout(timeout); resolve({ home: output.split("\\n")[0].trim(), stdout: output, code: exitCode }); });
+      child.once("exit", (exitCode) => { clearTimeout(timeout); resolve({ home: output.split("\n")[0].trim(), stdout: output, code: exitCode }); });
```

The existing listener timer calls `process.exit(0)`, so the interval does not prevent
its chosen exit; the outer 4-second timeout still kills a broken fixture. Scope the
join replacement to this F4 block. After repair, old unconditional F4 source must
produce two deliveries, and corrected source must produce one; this runtime
discrimination remains to be demonstrated on POSIX.

## MINOR 3 — Windows proof can miss the runner exit it is waiting for

`scripts/run-tests.test.mjs:483-488`: taskkill can terminate the immediate controller,
allow the runner to exit, and emit the runner's `exit` event before the taskkill
process itself emits `exit`. Only after awaiting taskkill does the test subscribe
to runner exit. `waitForExit` does not check an already-exited child's state, so this
valid ordering times out despite correct implementation. One passing Windows run
does not eliminate the race.

Ready-to-apply patch:

```diff
--- a/scripts/run-tests.test.mjs
+++ b/scripts/run-tests.test.mjs
@@
     cleanups.push(() => { try { process.kill(runner.pid, "SIGKILL"); } catch {} });
+    const exited = waitForExit(runner, "runner after taskkill");
     const killed = new Promise((resolve, reject) => {
@@
     await killed;
-    const { code } = await waitForExit(runner, "runner after taskkill");
+    const { code } = await exited;
```

Discriminating check: delay the taskkill completion observation until after runner
exit; the old placement misses the event, the new placement retains the result.
This can be a bounded diagnostic if the owner elects one; no gate repetition was
performed here.

## Other reviewed properties and limits

- Implementation changes stay in the four authorized files. F4 and R1 are separate
  commits; R1's test-home test change is the explicitly required awaited caller.
- Both canary and suite use async `spawn`. Normal/error completion shares an
  idempotent `finish`, which detaches the per-child handlers. Spawn's synchronous
  throw occurs before listener registration; asynchronous spawn failure resolves
  an error result and retains the home. Null child status maps to failure, never 0.
- Awaited callsites, `captureLog`, and `withoutNodeTestContext` retain their console
  and environment scope until asynchronous work finishes. CLI `.then` assigns the
  resolved numeric code; it does not assign a Promise to `process.exitCode`.
- The old spawnSync deferral workarounds are gone. The canary-to-suite continuation
  is synchronous within the promise continuation; no explicit asynchronous phase
  gap is introduced. Native signal/start/close race behavior has not been runtime
  verified by this review, and there is no canary-phase regression in this patch.
- The POSIX R1 regression targets the runner PID, measures the five-second bound,
  checks raw exit signal/code, home removal, and immediate-controller death. It
  correctly avoids claiming test-worker SIGTERM receipt. Its 10-second fixture
  would discriminate the old synchronous runner on elapsed time.
- Windows uses `/PID <process.ppid from the worker> /F`, with no `/T`, so the intended
  target is the immediate controller, not the runner. Retention is checked after
  runner exit. Setup failure cleanup is registered late (after ready-marker setup)
  and the marker existence/read is not atomic; these are residual fixture hygiene
  limitations rather than additional feature requests.
- The independent R1 patch artifact still contains escaped separators which the
  builder corrected in the committed R1 test. Its artifact text is not executable
  proof. The committed F4 test did not receive that correction.

Do not treat this review or the reported Windows focused gate as the required
Netcup live signal proof or two-host sealed-suite acceptance.
