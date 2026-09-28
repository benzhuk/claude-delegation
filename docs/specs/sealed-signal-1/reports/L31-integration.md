VERDICT: PASS

Source approved: `b5341c71d9436427e31bdae11a6726ec798d1946`.
Gate/evidence revision: `3cc33eabe916b2d2317ccee87826e647ff1f8c89`; the four implementation files have no delta from the approved source. No gate was rerun.

Cause: a signal re-raise could deliver twice to a foreign listener; the old synchronous runner deferred a runner-PID SIGTERM. The F4 generated fixture and Windows exit observation also had test-only faults.

Discriminating check: Netcup baseline `3dbe93567049ffc2fdd4fbe424226e57b7dc7ed0` produced the expected F4 two deliveries and `RUNNER_NOT_GONE_5S`; the candidate F4 proof delivered once, and candidate R1 exited 143 with its home removed in 53 ms.

Fix location: `scripts/test-home.mjs`, `scripts/test-home.test.mjs`, `scripts/run-tests.mjs`, and `scripts/run-tests.test.mjs` only.

Simplification: both process handlers use the same conditional re-raise rule; the proof reuses the existing runner/controller fixture rather than adding a runner layer.

## Commands and admission

Netcup used `ben@100.69.249.18`, ordinary retained clones under `/home/ben/orca-gates/sealed-signal-1-<full-sha>`, `bash -lc` Node v24.18.1, explicit `cd`, full-HEAD, and `scripts/run-tests.mjs` assertions. Each Netcup command acquired `/tmp/claude-verify.lock` by bounded `mkdir` (60 s), scanned actual Node processes, and released its own lock. Windows used the exact integration checkout with a bounded 60 s `Global\claude-verify` mutex and released it in `finally`.

Executed once each: baseline F4/R1 proof, candidate F4/R1 proof, Linux focused `node --test scripts/test-home.test.mjs scripts/run-tests.test.mjs`, Linux full `node scripts/run-tests.mjs`, and Windows full `node scripts/run-tests.mjs`.

## Results

| Gate | Native exit | Result |
| --- | ---: | --- |
| Netcup baseline F4 | 1 | Expected failure; retained fixture output asserted `deliveries=2`. |
| Netcup baseline R1 | 1 | Expected `RUNNER_NOT_GONE_5S`. |
| Netcup candidate F4 | 0 | Exit 0, exactly one delivery, home removed. |
| Netcup candidate R1 | 0 | Runner exit 143, home removed in 53 ms, controller gone. |
| Netcup focused | 0 | 43 pass, 0 fail, 1 skip. |
| Netcup sealed suite | 0 | 2534 pass, 0 fail, 5 skip. |
| Windows sealed suite | 0 | 2528 pass, 0 fail, 11 skip. |

Raw commands, exits, metadata, and output are retained in [Netcup gate evidence](L31-netcup-gate-3cc33eabe916b2d2317ccee87826e647ff1f8c89/) and [Windows gate evidence](L31-windows-gate-3cc33eabe916b2d2317ccee87826e647ff1f8c89/). Key raw SHA-256 values: Netcup Linux full `56eb02310865e54362c0823149732a3f649b229b7c23d71a95f1499329f5192b`; Windows full `e92677111b16edc5f0ead4ce4beb0b11198564463734421ae8208601576bbe99`.

The baseline and final candidate clones remain retained. No canonical Netcup checkout, work record, publication checkout, or source file was changed during gate execution.
