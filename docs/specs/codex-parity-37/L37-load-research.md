VERDICT: PASS

# Lane 37 SessionStart load research

## Cause

The two Netcup R3 failures were not route timeouts. Each failed SessionStart test completed in
57.687 ms or 58.124 ms, far below the former 400 ms child timeout and 450 ms advisory race. The
fixture supplies a scratch Codex home to `runCodexHook`, but its environment does not supply
`HOME`; the spawned wiring check therefore reads the host account home. On the healthy Netcup
account, `wiring-check --line --hook` correctly returns no line, while the Windows account happened
to have a finding. The expectation of a `wiring:` line was consequently host-state dependent.

The inspection also found that SessionStart shares the 400/450 ms PostToolUse advisory cap. A
controlled delayed injected route can be dropped by that cap, but it did not occur in R3 and does
not establish a production requirement for this lane. It remains a non-blocking follow-up.

## Research

1. Read the R3 sealed-suite raw log: only the two wiring assertions failed; peer and continuation
   output remained present.
2. Used the recorded per-test durations to falsify the 400/450 ms explanation for those two R3
   observations.
3. Ran the existing Netcup wiring entrypoint with the exact narrow child environment: it exited zero
   and printed no line against the inherited healthy home.
4. Repeated that read-only command with only `HOME` set to a nonexistent fixture path: it printed
   `wiring: 4 flagged`, proving the output difference is home/trust state rather than role,
   metadata, or child-route classification.
5. A controlled injected route can trigger the shared 450 ms advisory timer without host load. This
   is recorded as a separate, non-blocking observation because it cannot explain the 58 ms R3 runs.

## Discriminating check

The R3 duration evidence and the two exact wiring-check invocations distinguish the ambient-home
fixture failure from a timeout. The test author is making the two wiring fixtures set their scratch
home explicitly, so their expected finding no longer depends on the host account.

## Fix location

`hooks/codex-unsupported.test.mjs` is the actual fix location, owned by the independent test
author: its SessionStart fixtures must pass their scratch home to the spawned child environment.
The approved production adapter stays at the R3 source: every route retains its existing 400/450 ms
advisory behavior, and PostToolUse remains inside its 700 ms outer ceiling.

## Simplification

The corrective change is fixture environment only. It adds no production state, runner, retry, or
Claude-hook behavior; the child retains its existing close-before-return cleanup.

## Validation

The transient source proposal passed `node --check hooks/multi-codex-hook.mjs` (exit 0) and was
then reverted under the root ruling because it did not address R3. The independent focused parity
gate is owned by the test author after its deterministic fixture correction; no full suite or live
native rerun was performed.
