# Lane twelve: the sealed gate stops depending on host load

Written by skills-fable, 2026-09-26 18:40 New York. Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31. For a Codex or Claude lane lead on Windows. Base: origin/main at pickup, one sha. Branch build/gate-under-load-1. Builders in their own worktrees.

## Why
Two tests in `hooks/delegation-reminder.test.mjs` fail whenever the Windows host is busy and pass when it is idle. Today they failed in the release suite twice, in lane eight's merged-tree run twice, in lane nine's Windows gate (1775 of 1777, both of them) and in the janitor lane's runs; every lead now carries a "known flake" allowance in its brief and reruns until green. A gate that needs a rerun allowance is not a gate: it hides a real regression behind the same two names, and it costs a full suite run (about eight minutes) per retry on every merge.

The two tests, on origin/main:

1. About line 340, "MAJOR 2: concurrent PostToolBatch hooks past the threshold DO fire (round 1 fired zero times)". It seeds the tally five below the threshold, fans out threshold plus five concurrent hook processes, and asserts at least one fired. The tally is an append-only byte counter whose own design comment says concurrent appends on Windows are lossy and "a lossy count can delay the card but never cancel it". Under load enough appends are lost that the threshold is not reached inside that one fan-out, so the test asserts a window the design does not promise. The promise is "delayed, never cancelled": after the fan-out, if none fired, one more sequential hook call must fire. That is the assertion to write; it is deterministic and it still catches the round-one bug (zero fires ever).
2. About line 811, "the hook is fast enough to sit on every tool batch". Five sequential hook calls, average wall clock including Node start-up must be under 400 ms. On a busy Windows box Node start-up alone can exceed that. This is a performance measurement, not a correctness property; it does not belong in the sealed gate. Move it out: keep the measurement, print it, and make the assertion conditional on an explicit opt-in (`DELEGATION_PERF_ASSERT=1`, read only in that test), so the sealed suite records the number and a perf run enforces it. Document the opt-in in `docs/sealed-tests.md` in one sentence; nothing else in that doc changes.

`scripts/run-tests.mjs` walks every `.test.mjs` and rejects flags; do not add a perf group, a skip list or a flag to it. The only knobs this lane adds are the two changes above.

Measures: hours ask to accepted (no rerun per merge) and work stalled (no merge waits on a second full run). Must not worsen: rework after acceptance (the concurrency property is still asserted, more strictly than before, because "delayed, never cancelled" is now checked instead of hoped).

## Territory G1
`hooks/delegation-reminder.test.mjs` (only those two tests), `docs/sealed-tests.md` (one sentence). No change to `hooks/delegation-reminder.js` or whatever module implements the hook unless the investigation in step 1 proves the hook itself can cancel rather than delay; then stop, put the evidence in the record's Log, and report BLOCKED with the mechanism, because that is a different lane.

1. Before changing anything: from a fresh worktree of base, run the file alone three times idle and once while a full suite runs in another worktree (the lead's runner can provide the load if you cannot; say so in the record). Paste all results into the record's Log so it shows the load dependence, not a story about it.
2. Rewrite test 1 as described: fan-out, then if no process fired, one sequential call, assert that it fires; assert every process exited 0; keep the existing upper-bound assertions of the sibling test untouched.
3. Test 2 as described. The printed line names the average in milliseconds and says whether the assertion is armed.
4. Run the whole file under the same load as step 1 and paste the results; the two tests must pass under load ten of ten runs.

## Acceptance
Sealed suite green on your host and on a second host from origin (Netcup Linux if built on Windows; the lead's runner runs it if you cannot). Until lane ten (docs/specs/2026-09-26-linux-green-main.md) merges, the Linux run fails exactly H6 in note-send.test.mjs and V4 in mirror-shim.test.mjs; those two are main's and count as green for this lane; any other Linux failure does not. Opus reviewer with this attack brief: a hook that never fires under any load would still pass test 1 (it must not); a hook that fires twice for one threshold crossing; the opt-in name read anywhere but that one test; a change to the hook module; the sibling "lose no increments" test weakened. Record with Lead-session, Spec-session, Spec-from, Base one sha; accept --census --four-read (if the census is unsupported on your host, say so in the record and give the four numbers by hand from the record's Log, as lane two did). Then merge on acceptance under the lane eight rule and post the Closed entry; that is the RESULT. Push at every Status change; a denied command stops the step and is reported; the git identity is never set by an agent; no trailers; no README changelog.
