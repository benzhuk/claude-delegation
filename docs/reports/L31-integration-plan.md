VERDICT: READY

# Lane 31 integration execution plan

Prepared for `wr-2026-09-27-sealed-signal`. This plan serves the measure “work lost or stalled”:
a runner interrupted by SIGTERM cleans its own sealed home promptly, while another in-process
signal listener cannot be delivered the same signal twice.

## Inputs and boundary

- Spec: `docs/specs/sealed-signal-1/spec.md` at
  `b159e9d2ff29e4abb7cbc8e58aabd2e22aca6c63`.
- Contract: `docs/specs/sealed-signal-1/contracts.md` at
  `a40c8c2a637a486a04dd29bbd8b10a81769636cb`.
- Work record: `docs/work/wr-2026-09-27-sealed-signal.record.md` in the sealed-signal worktree;
  root remains its sole writer.
- Existing review: `docs/work/evidence/wr-2026-09-27-sealed-home-leak-review-r1.md`, F4 and R1.

Preparation correction: the first draft commits were accidentally made in the original
`gudgeon` detached checkout (`a40c8c2a637a486a04dd29bbd8b10a81769636cb` and
`a0abccbde1707967b63d89dcef7eab641fdc361b`). They are preserved there and were not
cherry-picked, reset, moved, or cleaned. Their document bytes were recovered with `git show` into
this mandated `sealed-signal-1` checkout; this combined scoped commit is the integration artifact.

No production territory extends beyond `scripts/run-tests.mjs`, `scripts/run-tests.test.mjs`,
`scripts/test-home.mjs`, and `scripts/test-home.test.mjs`. Do not touch sweeps, `ws-off`,
collectors, or work-record code. No new module, compatibility shim, deferred-exit hack,
installation, release, identity setting, Git trailer, force/reset/clean/stash, denial bypass, or
filesystem deletion wrapper is allowed.

## Ordered implementation receipt

1. Apply F4 in `test-home.mjs`: after the local listener removes itself and registered homes, call
   `process.kill(process.pid, signal)` only if `process.listenerCount(signal) === 0`. Add the
   focused listener test in `test-home.test.mjs`, proving a pre-existing listener sees the original
   signal once and owns the outcome. Commit the two F4 files together, with no R1 change.
2. Apply R1 in `run-tests.mjs`: replace synchronous canary and suite execution with Promise-based
   child execution; make `runSealed` and `main` Promise-returning; await `main()` at the CLI while
   assigning `process.exitCode`; forward runner SIGTERM to either live child. Delete only the
   `setImmediate(keep)` and empty `setImmediate` deferrals/comments that covered `spawnSync`.
   Convert every `runSealed()` and `main()` test call to `await`, including the existing
   `test-home.test.mjs` helper/caller, and add the POSIX runner-PID proof plus Windows
   controlled-fixture/ready-channel child-PID `taskkill` retained-home proof. Never use `/T`.
   Commit these R1 source/test changes separately from F4.
3. Maintain existing semantics while converting the control flow: canary/suite/start failure stays
   non-zero and retains the runner home; success removes it. Preserve actual signal/exit outcomes;
   do not map interruption to zero or a fabricated normal exit.

## Focused verification gate

The only local gate is:

```text
node --test scripts/test-home.test.mjs scripts/run-tests.test.mjs
```

It needs an explicit grant from root even when no owner holds the mutex; Windows may be owned by
`skills-o` until 11:45 PM America/New_York. When granted, acquire the usual
`Global\claude-verify` named mutex before this command and release it afterward. Do not replace it
with a filesystem lock or any cleanup/delete wrapper. Record the tested full HEAD and the pass/fail
summary. There is no unchanged rerun.

The focused gate must demonstrate:

| Check | Required evidence |
| --- | --- |
| F4 listener ownership | Another listener is registered; after the handled signal it reports one delivery, with no second re-raise. |
| POSIX R1 | An isolated real runner receives SIGTERM by runner PID; its live child receives the forwarded termination and the printed runner home is absent within five seconds. |
| Windows R1 | `taskkill` targets the child PID; the runner returns non-zero and keeps its own printed home for inspection. |
| Existing behavior | Canary, startup, and suite failures retain their homes; a clean run removes its home. |

## Independent Netcup proof

Use `ben@100.69.249.18`, but never execute the proof from dirty
`/home/ben/Code/claude-delegation`. Read/fetch into a fresh ordinary clone under
`/home/ben/orca-gates`; no worktree or cleanup wrapper. Before any suite command, explicitly
`cd` to the fresh checkout, assert its complete `git rev-parse HEAD` equals the reviewed tip, and
assert `scripts/run-tests.mjs` is present. This prevents the prior lane-29 omission of `cd` from
launching the wrong directory.

Run the isolated POSIX runner-PID SIGTERM proof against that asserted checkout and preserve its raw
exit result, observed child outcome, printed home path, and elapsed cleanup time (must be at most
five seconds). Then run `node scripts/run-tests.mjs` once on Netcup and once on the other host,
after the same explicit checkout/HEAD/entrypoint assertions. Each host gets one sealed-suite run;
do not rerun an unchanged suite. The live proof is independent of the builder’s focused test.

## Handoff

Before merge, an independent reviewer checks the two commit boundaries, the F4 listener outcome,
the raw POSIX interruption evidence, Windows retained-on-failure behavior, and no deferred-exit
regression. Root alone updates the work record and coordinates the record/spec/scout commits. This
lane reports commit hashes copied from `git rev-parse`, never reconstructed abbreviations.
