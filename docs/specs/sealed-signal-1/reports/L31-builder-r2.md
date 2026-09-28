VERDICT: PASS

Cause: `runChild` re-raised a forwarded signal after a foreign listener had already
received it; the F4 generated fixture used literal separators and did not keep its
process alive; the Windows taskkill regression subscribed after the runner could exit.

Discriminating check: the independent R2 test patch adds a POSIX wrapper whose
foreign listener must receive SIGTERM exactly once and exit 73, fixes the F4 fixture's
actual newlines and liveness, and registers the Windows runner exit waiter before
taskkill. The conditional re-raise repair makes the wrapper retain foreign-listener
ownership.

Fix location: `scripts/run-tests.mjs` conditionally re-raises only if no listener
remains. `scripts/test-home.test.mjs` repairs the F4 fixture. `scripts/run-tests.test.mjs`
adds the foreign-listener regression and repairs the Windows exit-observation ordering.

Simplification: the R2 regression reuses the existing forward probe, ready marker,
owned-PID check, bounded exit waiter, and child environment.

Commits: original F4 `1311df737ab46cf7570d47e6207799e5bc6233c0`; original R1
`c9e5029da51270fe59b29c8749f532c7ef8cde57`; source repair
`96c5e671a7995a59c477a7b5ee644169891724eb`; F4 test repair
`3824d55127c264c115fa747eedb76d697641a382`; R1 test repair
`062a4a940c7fe31a15930270202fa197243663e5`.

Artifact SHA-256:

- Independent patch (integration checkout): `98733d17e19e35cb889d6733b42697646a4fdc6787d9b7695375c1404cef59f0`
- `scripts/run-tests.mjs`: `85bc9d95f2fc68d0d30e860fb4d4309ef7b0bb37978798396f2a88fb5935005c`
- `scripts/test-home.test.mjs`: `26fffb9128ad9a504b8f9839fa9af9ec48a9ab13bbf7a0f313f2bc5197da2525`
- `scripts/run-tests.test.mjs`: `cf840158ddc766f8c783d895c248ee9dfc38cfbb5b0a339f8c2d9f4b16bf722f`
- Raw focused-gate log: `e1480f1a1bdd1517d52fd2dcf9326e96879d0a8547eda437c6609b4c67fbe8c`
- Raw focused-gate exit: `5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9` (content: `0`)

Gate: executed once under the process-owned `Global\claude-verify` mutex with a
60-second bounded acquire and release/dispose in `finally`.

```text
node --test scripts/test-home.test.mjs scripts/run-tests.test.mjs
```

Native exit: `0`; 35 pass, 0 fail, 9 skipped. No full/Linux suite was run.
