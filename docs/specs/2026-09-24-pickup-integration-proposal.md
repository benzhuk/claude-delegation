VERDICT: PROPOSE ONE CONVENTIONAL PRIVATE REGISTRATION FILE AND ONE POST-FLUSH CALL. Keep the installed one-minute `note-flush` commands unchanged. Only the standalone CLI main, after a normal flush, checks for `AGENTS_HOME/ws/decisions-pickup/registrations.json`; absent means one local existence check and no import, page read, state write, or network call. `--help`, `--status`, `--dry-run`, imported `runNoteFlush`, `drainQuietly`, note-send, and note-notify never check or invoke pickup. A present file opts this host into at most one existing `pickupOnce` call per cadence. No new scheduler, receipt engine, transport, or recovery policy is justified.

## Why this is the smallest seam

At the inspected source, `skills/multi/scripts/note-flush.mjs` already has the unattended CLI entry point. Its imported paths are separately exposed as `runNoteFlush` and `drainQuietly`; its `main()` handles help/status before normal drain. `skills/decisions/scripts/decisions-pickup.mjs` already owns the safety-critical behavior: switch precedence, project/page authorization, a 15-second reader, page-scoped exclusive claims, private captures, versioned receipts, exact transport recovery, owner handoff, and `runNoteSend --no-type` dispatch. The Windows scheduled task uses `MultipleInstances IgnoreNew`; systemd uses one oneshot service; launchd uses one job label. Their commands all invoke the existing bare `note-flush` shim, so a conventional file avoids three-host scheduler edits.

A new sweep executable would duplicate admission and create a second callable surface. A new `note-flush` flag would require changing each installed scheduler. A fixed private registration file is itself the explicit opt-in and is simpler than either.

## Pinned registration contract

Path: `AGENTS_HOME/ws/decisions-pickup/registrations.json`. It is private host state, never Git content. Schema:

```json
{
  "version": 1,
  "entries": [
    {
      "repo": "C:/absolute/real/project-root",
      "page": "canonical-page-url-or-id",
      "from": "pickup-host-slug",
      "owner": "current-maintainer-slug",
      "reader": "C:/absolute/real/notion-reader.mjs"
    }
  ]
}
```

Rules:

- `version` must equal 1; `entries` must contain 1–16 objects; unknown keys fail the whole registration before any page read or send. The file is bounded to 64 KiB.
- `from` and `owner` are required and must pass the pickup's existing exact slug rule. They are identities, not inferred from panes, ledgers, environment, or a model. `owner` is the recipient binding; it grants no authority.
- `repo` and `reader` must be absolute. Resolve each existing path to its real path; require repo directory and reader regular file. Reject symlinked registration files and duplicate canonical `(repo,page)` entries. Do not scan for projects.
- Each selected call still passes through existing `registeredProject()`, which requires the repo's `.agents/project.json` `decisions_url` to equal the normalized page. This remains the authorization binding and catches moved or wrong projects.
- Registration contains no token, cookie, auth command, private page bytes, or inherited arbitrary arguments. Provider authentication remains the reader's existing host configuration. Missing/expired auth is learned only from the reader's bounded, sanitized failure; it causes no receipt or send. An attended rollout validation may prove reader auth, but activation is not part of this build.
- A changed registry owner does not reassign an active round. Existing pickup behavior retains the saved owner and writes `PENDING_MANUAL_HANDOFF` on mismatch. A disappeared owner is never replaced: the exact ASK is recorded through existing transport and its wake-up remains deferred, or the existing receipt remains waiting/recorded. Only a fresh round after the established unchecked reset may take a new binding.

## Runtime API and budget

Add one export in `decisions-pickup.mjs`:

```js
runRegisteredPickup({ registrationPath, slot }, deps) -> Promise<safeSummary>
```

It checks `ws-off` / `ws-off-decisions` first, reads and validates the registration once, orders entries by stable hash of canonical `repo + NUL + normalizedPage`, selects index `slot % count`, and calls existing `pickupOnce` once. Production `slot` is `Math.floor(Date.now() / 60_000)`. Thus every configured project gets one turn in each N-minute cycle without a persisted cursor, parallel readers, or process fan-out. A failed/invalid selected project cannot monopolize later minutes. Do not loop entries.

In `note-flush.mjs`, keep `runNoteFlush` unchanged. After the standalone main completes and prints the normal flush result, admit the registered call only when all are true:

1. invocation is not help, status, dry-run, or targeted `--to`;
2. normal flush succeeded;
3. elapsed normal-flush time is under 30,000 ms; and
4. the conventional registration file exists.

Only then dynamically import `decisions-pickup.mjs` and call `runRegisteredPickup`. The existing reader ceiling is 15,000 ms. Existing pickup dispatch uses `runNoteSend --no-type`; note-send's preliminary drain is bounded to 3,000 ms and the new ASK is queued rather than launching a Codex app-server in the pickup phase. Therefore one admitted pickup adds one reader and one bounded send/queue path, normally keeping a cadence below roughly 48 seconds plus local Git/filesystem work. Do not race or kill `pickupOnce`: its receipt transitions must finish or preserve their existing crash state. Existing scheduler serialization is the overlap boundary. If normal peer delivery consumes 30 seconds, skip this cadence so pickup never competes with the flusher or its Codex queue path (whose admission floor is 5 seconds and default client timeout is 20 seconds).

The post-flush result must not alter flush stdout, heartbeat, exit code, or delivery accounting. Success is silent. A registration or pickup failure may emit only a fixed allowlisted code on stderr (`PICKUP_CONFIG_INVALID`, `PICKUP_DISABLED`, `PICKUP_SKIPPED_BUDGET`, `PICKUP_FAILED`); never page text, titles, paths, reader stderr, parser messages, receipt content, or owner names.

## Minimal build territory

1. `skills/decisions/scripts/decisions-pickup.mjs`: schema/real-path validation, deterministic one-entry selection, and the wrapper around `pickupOnce`. Reuse its switch, page binding, claim, receipt, capture, and send code unchanged.
2. `skills/multi/scripts/note-flush.mjs`: standalone-main-only existence check, elapsed admission, dynamic import, and fixed-code error boundary. Do not alter `runNoteFlush`, inbox delivery, heartbeat, or piggyback paths.
3. `skills/decisions/SKILL.md`: document the private registration, one-entry cadence, authority limit, owner handoff, and off switches.
4. Focused tests in the two existing test files. No new production helper or state directory.

Root retains work records, version/manifest, Notion, release, registration creation, and rollout.

## Required tests

- No registration: standalone normal CLI performs exactly one registration existence check; no dynamic import/pickup/page/state/network I/O and identical flush output/exit/heartbeat.
- Boundary exclusions: import, `drainQuietly`, note-send piggyback, note-notify, help, status, dry-run, and targeted `--to` never stat/read the registration or invoke pickup.
- Ordering: normal flush completes before pickup; flush failure or elapsed >=30 seconds skips pickup; pickup failure cannot change flush result.
- Schema/path: oversize, wrong version, empty/>16, extra keys, relative/missing/non-file reader, relative/missing/non-directory repo, symlinked registry, duplicate canonical page/project, invalid slugs, and page/config mismatch all fail before reader/send.
- Switches: `ws-off` and `ws-off-decisions`, including unreadable switch state, win before registration/page/receipt/transport work.
- Fairness: fixed clock across N consecutive minute slots selects each of N entries exactly once; only one reader is ever active/called per invocation; malformed configuration causes zero calls.
- Existing semantics through the wrapper: unchecked/unchanged and fresh valid Done with zero items send nothing; checked content writes the existing private capture/receipt and records exactly one ASK; same-page claim contention is no-op; crash/SENDING uncertainty is reconciled by existing code without resend.
- Identity lifecycle: active owner mismatch produces manual handoff and no send; absent recipient never rebinds; deferred queue uses the saved exact owner/from.
- Privacy: canary page bytes, title, reader stderr, paths, and parser exceptions never appear in stdout/stderr or the registration runner summary.

## Material risks and limits

Minute-derived rotation assumes the existing one-minute cadence; manual invocations may select the same entry and are still protected by the page claim. A host down for a minute can skip that slot, but later cycles retry fairly without cursor state. With 16 entries, worst normal polling latency is about 16 minutes; raising throughput would add process overlap and should require new evidence.

The 30-second cutoff is admission, not cancellation. Local Git or filesystem stalls can still lengthen a run; existing scheduler serialization prevents concurrent scheduled instances, while page claims protect duplicate manual calls. This integration detects owner work; it does not execute it, clear Done, reassign owners, migrate legacy receipts, resolve UNKNOWN dispatch, or turn registration into authority.
