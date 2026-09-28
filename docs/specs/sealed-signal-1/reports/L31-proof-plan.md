# Lane 31 live-proof execution plan

This is an execution receipt, not authorization to run a gate. Run it only after root admits the
Netcup verification slot through the established shared-lock convention. Do not infer admission
from an empty process list. The local Windows `Global\\claude-verify` slot is unrelated to this
host gate.

The two comparison revisions are fixed:

```text
baseline = 3dbe93567049ffc2fdd4fbe424226e57b7dc7ed0
candidate = SOURCE_SHA (the future approved full source SHA)
```

`baseline` has the old unconditional F4 re-raise and synchronous `runSealed`. Set `SOURCE_SHA`
only to the future source revision that has passed source review; `c9e5029da51270fe59b29c8749f532c7ef8cde57`
is known rejected and is explicitly ineligible. The candidate comparison discriminates the F4 and
asynchronous-R1 faults. It does not qualify the later foreign-listener R1 fix unless that repair is
in the approved source revision.

## Prepare isolated checkouts and evidence scripts

From the approved operator host, copy the reviewed evidence scripts to Netcup as evidence files;
they are not copied into, or executed from, the dirty canonical checkout.

```bash
set -eu
host=ben@100.69.249.18
repo=https://github.com/benzhuk/claude-delegation.git
base=3dbe93567049ffc2fdd4fbe424226e57b7dc7ed0
candidate=${SOURCE_SHA:?set to the reviewed, approved full source SHA}
base_dir=/home/ben/orca-gates/sealed-signal-1-3dbe93567049ffc2fdd4fbe424226e57b7dc7ed0
candidate_dir=/home/ben/orca-gates/sealed-signal-1-$candidate

ssh "$host" "bash -lc 'git clone "$repo" "$base_dir" && cd "$base_dir" && git checkout --detach "$base" && test "\$(git rev-parse HEAD)" = "$base" && test -f scripts/run-tests.mjs'"
ssh "$host" "bash -lc 'git clone "$repo" "$candidate_dir" && cd "$candidate_dir" && git checkout --detach "$candidate" && test "\$(git rev-parse HEAD)" = "$candidate" && test -f scripts/run-tests.mjs'"
scp docs/specs/sealed-signal-1/reports/L31-live-proof-f4.sh "$host:/home/ben/orca-gates/L31-live-proof-f4.sh"
scp docs/specs/sealed-signal-1/reports/L31-live-proof-posix.sh "$host:/home/ben/orca-gates/L31-live-proof-posix.sh"
```

The `bash -lc` commands establish the available Netcup Node shell, explicitly enter each fresh
clone, assert its complete ref, and assert the runner entrypoint before any proof command. The
proof scripts repeat the checkout/ref checks themselves.

## Discriminating F4 commands

```bash
ssh "$host" "bash -lc 'cd "$base_dir" && test "\$(git rev-parse HEAD)" = "$base" && test -f scripts/test-home.mjs && bash /home/ben/orca-gates/L31-live-proof-f4.sh "$base_dir" "$base"'"
ssh "$host" "bash -lc 'cd "$candidate_dir" && test "\$(git rev-parse HEAD)" = "$candidate" && test -f scripts/test-home.mjs && bash /home/ben/orca-gates/L31-live-proof-f4.sh "$candidate_dir" "$candidate"'"
```

The baseline command must return non-zero and leave the named scratch directory, whose `out` file
shows `deliveries=2`. The candidate must return `PASS ... DELIVERIES=1 ... HOME_REMOVED=...`.
The fixture uses actual JavaScript newlines and a ref'ed interval before SIGTERM, so a baseline
failure establishes duplicate signal delivery rather than a syntax error or an early Node exit.

## Discriminating R1 commands

```bash
ssh "$host" "bash -lc 'cd "$base_dir" && test "\$(git rev-parse HEAD)" = "$base" && test -f scripts/run-tests.mjs && bash /home/ben/orca-gates/L31-live-proof-posix.sh "$base_dir" "$base"'"
ssh "$host" "bash -lc 'cd "$candidate_dir" && test "\$(git rev-parse HEAD)" = "$candidate" && test -f scripts/run-tests.mjs && bash /home/ben/orca-gates/L31-live-proof-posix.sh "$candidate_dir" "$candidate"'"
```

The baseline must return non-zero with `RUNNER_NOT_GONE_5S`; its controlled 10-second fixture
shows that the old synchronous runner deferred SIGTERM handling. The failure path sends the
controlled runner SIGTERM, waits up to 12 seconds, then sends SIGKILL only to that controlled
runner before a bounded reap; it does not assume a Promise or leave that runner alive. The
candidate must return `PASS` with `RUNNER_EXIT=143`, elapsed time at most five seconds including
the removed printed-home observation, before the separate five-second controller-reap bound.

Each command is one proof for its exact source revision. Preserve the printed `RETAINED=` scratch
path and raw SSH exit status; do not rerun an unchanged command or run the sealed suite as part of
this comparison.
