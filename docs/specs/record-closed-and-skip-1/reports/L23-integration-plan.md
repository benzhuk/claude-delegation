VERDICT: PLANNED

# Lane 23 integration and acceptance plan

No gates, checkout creation, installation, cleanup, lock acquisition, record mutation, Git index operation, or measurement command ran while preparing this plan.

## Artifact admission and focused gate

The current integration worktree is `C:/Users/benzh/orca/workspaces/claude-delegation/record-closed-and-skip-1` on `build/record-closed-and-skip-1@06eb6f58aa93aebffa96c3f70a4ca9ecce1b88b6`. The builder checkout is separate. After root supplies a changed, pushed artifact SHA, fetch that exact ref and establish source-byte identity before the one focused gate for that SHA.

The builder owns the four-file focused source gate and already ran it once on each changed artifact. Integration must not repeat that unchanged gate. Use only the non-deleting Windows named mutex `Global\claude-verify`: `WaitOne` no longer than 60 seconds, then release and dispose the process-owned mutex handle. Do not create or delete lock files. Persist stdout/stderr and `NATIVE_EXIT` immediately beside the lane evidence. The integration-only independent contract command is:

```text
node --test scripts/record-closed-and-skip.contract.test.mjs
```

Run it once for the changed artifact only. If it fails or a command is denied, preserve the exact output and stop for the changed-source handback; never rerun an unchanged SHA.

## Sealed gates

After focused green and independent review approval, use the unchanged command below once on the reviewed integration artifact on Windows and once in a separately fetched-origin Linux checkout:

```text
node scripts/run-tests.mjs
```

Windows preserves its own raw log and native exit under the lane evidence path while holding the same non-deleting mutex. Do not rerun it at the same source SHA.

The Netcup read-only inspection found `/home/ben/Code/claude-delegation` is the canonical repository but is dirty with ledger/notes artifacts, so it is not a gate checkout. `/home/ben/orca-gates` exists; the former `codex-census-f59` checkout is absent. On authorization, create a fresh fetched-origin checkout at a new exact-SHA path such as `/home/ben/orca-gates/record-closed-and-skip-1-<artifact-sha>`; never modify the dirty canonical repository.

To avoid the earlier CRLF outer-SSH failure, prepare a UTF-8-without-BOM script whose bytes use LF only, then stream it as `ssh ben@100.69.249.18 'bash -s'`. Its body changes to the exact fetched checkout, invokes only `node scripts/run-tests.mjs`, captures `$?` immediately as the test's native exit, writes `NATIVE_EXIT=<code>` to the remote receipt, and exits with that same code. Keep the local SSH-wrapper exit separately from the native test exit. Do not use a PowerShell CRLF payload, `exit 0\r`, or a cleanup wrapper.

## Fresh acceptance measurement

The actual host files are available without copying transcripts:

- Codex lead: `C:\Users\benzh\AppData\Roaming\orca\codex-accounts\f22a4cc4-fb5a-4af5-aeec-4951188a536a\home\sessions\2026\09\26\rollout-2026-09-26T15-58-25-01a0df4c-2809-7520-b1d7-876cc51a87ee.jsonl` (Lead-session `01a0df4c-2809-7520-b1d7-876cc51a87ee`).
- Claude spec session: `C:\Users\benzh\.claude\projects\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl` (Spec-session `9c61c35a-82dd-4aef-8eca-c99bb0e72e31`).

After an approved artifact and reviews, choose one fresh `acceptAt` ISO instant and preserve it. The Codex census command is:

```text
node scripts/build-census.mjs --lead <codex-lead-path> --from 2026-09-27T20:30:00Z --to <acceptAt> --out <lane-evidence>/census.md --json <lane-evidence>/census.json
```

The record currently has `Spec-from: 2026-09-27T20:40:00Z`, later than `Opened: 2026-09-27T20:30:00Z`. Therefore no honest `Spec-from..Opened` Claude slice exists: a command with `--from 20:40Z --to 20:30Z` must not be run, and no complete spec total may be invented. Invoke four-read without `--spec-census` so it reports that slice as partial/unavailable:

```text
node scripts/four-read.mjs --record docs/work/wr-2026-09-27-record-closed-and-skip.record.md --census <lane-evidence>/census.json --ledger docs/ledger --git . --branch HEAD --lead-session 01a0df4c-2809-7520-b1d7-876cc51a87ee --lead-slug skills-a --accept-at <acceptAt> --out <lane-evidence>/four-read.md --json <lane-evidence>/four-read.json
```

Then, only if the census is COUNTED/complete and the four values remain honest, use the one reviewed artifact value consistently:

```text
node scripts/work-record.mjs check-acceptance --record docs/work/wr-2026-09-27-record-closed-and-skip.record.md --repo . --pinned-artifact <artifact-sha> --census <lane-evidence>/census.md --four-read <lane-evidence>/four-read.json --at <acceptAt>
node scripts/work-record.mjs accept --record docs/work/wr-2026-09-27-record-closed-and-skip.record.md --repo . --pinned-artifact <artifact-sha> --census <lane-evidence>/census.md --four-read <lane-evidence>/four-read.json --at <acceptAt>
```

The close command's live proof follows the final merge on main and uses its full merge SHA, not an abbreviated placeholder. The `Spec-from`/`Opened` inversion is a known measurement limitation for root to resolve or retain visibly; this plan does not edit the work record.
