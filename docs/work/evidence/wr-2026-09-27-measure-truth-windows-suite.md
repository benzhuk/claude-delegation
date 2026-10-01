VERDICT: PASS ea149162b51537c283195e7f9a57edac7731fe3b

# Windows sealed test suite — measure-truth-1

- Artifact: `ea149162b51537c283195e7f9a57edac7731fe3b`
- Branch: `build/measure-truth-1` (also present on `origin`)
- Host: `ben-desktop.tail219acd.ts.net` (Windows, node via `C:\nvm4w\nodejs` on PATH)
- Runner: `node scripts/run-tests.mjs`

## Totals

```
tests       2092
suites      0
pass        2092
fail        0
cancelled   0
skipped     0
todo        0
duration_ms 779412.2319   (~12m 59s)
```

## Failures

None. 0 failing tests.

Note: a grep for the literal substring `not ok` in the log matched exactly one line, which is a
passing test whose *name* happens to contain the text `not ok:false` (not a failing TAP line):

```
✔ R1: a mapped sender host that IS this machine mirrors to nobody — mirrorLedger absent, not ok:false (4.2692ms)
```

## Local log path

`/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane14-ea-1790512211-suite.log`

(2170 lines, 212,871 bytes; scp'd back from the Windows box.)

## Windows leftovers (left in place per instructions, not cleaned up)

On `ben-desktop`, under `C:\Temp`:

- `C:\Temp\lane14-ea.bundle` — the git bundle uploaded from the Linux side (4,180,990 bytes)
- `C:\Temp\lane14-ea-1790512211\` — the clone made from the bundle, checked out at
  `ea149162b51537c283195e7f9a57edac7731fe3b` (suffix `1790512211`, a Unix timestamp)
- `C:\Temp\lane14-ea-1790512211-suite.log` — the raw test-run log (212,871 bytes), source of the
  totals above

## Procedure notes

- `git bundle create` in `/home/ben/Code/wt-mt` bundled `build/measure-truth-1` and
  `refs/remotes/origin/main`; scp'd to `C:/Temp/lane14-ea.bundle`.
- The single chained ssh cmd line cloned the bundle, fetched `origin/main` into the clone,
  checked out the artifact sha, and ran the suite, redirecting stdout+stderr to the log file.
  A cosmetic `warning: remote HEAD refers to nonexistent ref, unable to checkout` appeared right
  after the clone (expected for a bundle with no HEAD ref) and did not affect the subsequent
  checkout of the artifact sha or the test run — confirmed by the log containing 2092 real test
  lines and the final node:test summary block.
- ssh command exited 0.
