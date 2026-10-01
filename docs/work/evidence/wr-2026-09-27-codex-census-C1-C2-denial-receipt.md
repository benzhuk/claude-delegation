VERDICT: BLOCKED policy denial before the focused C1+C2 gate could be verified.

The policy tool returned only `blocked by policy`; it supplied no specific reason. The blocked PowerShell wrapper contained these command fragments in execution order:

```powershell
New-Item temp claude-verify.lock
node --test scripts/build-census.test.mjs
finally { Remove-Item -LiteralPath $gateLock -Force }
```

Therefore this receipt does not claim that `node --test scripts/build-census.test.mjs` alone was denied. No standalone test command, equivalent tool, cleanup reroute, or filesystem-permission change was attempted.

`docs/concurrency-budget.md` supplies only a POSIX directory mutex whose trap removes the lock; the repository has no existing non-deleting Windows mutex helper. Proposed for root judgment only, never executed: use a process-owned Windows named mutex (`Global\claude-delegation-verify`) around the same focused `node --test` invocation. `WaitOne()` serializes admitted local test runners, `ReleaseMutex()` and `Dispose()` release the process resource without filesystem deletion, and OS process exit releases an abandoned mutex. This preserves the one-expensive-command admission rule but needs explicit root approval before use.
