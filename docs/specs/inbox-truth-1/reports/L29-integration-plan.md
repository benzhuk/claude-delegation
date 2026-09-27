VERDICT: PLANNED

# Lane 29 integration plan

This is a gate plan only. No test, census, live proof, install, release, or
record transition was run while preparing it.

## Artifact and focused gate

The integration branch starts from
`build/inbox-truth-1@9fb803fa23adc9143bfce65feeba0ab9f4d975fc`. After a
builder supplies a changed, committed candidate, integration will establish
the exact candidate SHA and source-byte identity before its one independent
contract gate. The builder owns its scoped source gate and integration does
not repeat an unchanged focused gate.

The exact integration contract command, when authorized, is:

```text
node --test scripts/inbox-truth.contract.test.mjs
```

If the independent contract test is not present in the merged candidate,
integration stops and reports that missing prerequisite rather than replacing
it with a source-test rerun. The builder's planned focused command is:

```text
node --test skills/multi/scripts/note-inbox.test.mjs hooks/multi-hook-core.test.mjs
```

On Windows, every authorized expensive gate admits through the established
process-owned, non-deleting named mutex `Global\claude-verify`: wait at most
60 seconds, then release and dispose that process handle. It creates or
removes no filesystem lock. Stdout/stderr, the immediate native exit, start
and end timestamps, tested SHA, and command go under this spec pack. A
failure, denial, or busy admission is reported once and is never rerun at an
unchanged SHA.

This follows the existing Lane 23 integration receipt and plan at
`docs/specs/record-closed-and-skip-1/reports/L23-integration-plan.md`; its
prior bearing is `VERDICT: CONTINUE` in
`docs/specs/record-closed-and-skip-1/reports/bearings-assessment.md`. That is
an existing same-goal receipt, not a new bearing or an implementation
attestation for Lane 29.

## Sealed suite

The exact sealed command on each authorized host is unchanged:

```text
node scripts/run-tests.mjs
```

Windows runs it once under `Global\claude-verify` on the exact pushed
candidate. Netcup runs one actual suite in a fresh fetched-origin checkout at
that same SHA, never in the dirty canonical repository
`/home/ben/Code/claude-delegation`. Before the first remote launch, resolve
Node only with `bash -lc 'command -v node'`; use the returned directory in the
non-login payload `PATH` and retain both the resolution and actual-suite
receipts. The remote verification lock is held only for the one suite. A
transport launch failure before Node starts is recorded separately from the
one actual suite invocation; neither result permits a same-SHA rerun. Both
hosts retain raw stdout/stderr, wrapper and native exits, timestamps, tested
SHA, and fetched-origin proof.

## Future measurement route — availability only

The requested Claude session file is present on this Windows host at:

```text
C:\Users\benzh\.claude\projects\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl
```

It corresponds to the pinned spec session
`9c61c35a-82dd-4aef-8eca-c99bb0e72e31` and `Spec-from:
2026-09-27T23:05:00Z`. No census was run and no transcript content was read.
If separately authorized, the existing CLI route is
`node scripts/build-census.mjs --lead <that-session-file> --from
2026-09-27T23:05:00Z --to <shared-acceptAt> --out <report.md> --json
<report.json>`; it requires a shared actual acceptance instant and preserves
the command's native output and exit.
