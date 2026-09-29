VERDICT: NEEDS_FIXES (4) 7cc858ad834f3958b45a0afd17f6879fcc4dd9bf

# Lane40 code review r2 (delta review against r1 findings)

Reviewed: `7cc858ad834f3958b45a0afd17f6879fcc4dd9bf`. This is the diff from `42e356b` in `scripts/knowledge-gather.mjs`, `scripts/knowledge-triage.mjs`, their two test files and `contracts.d.ts`. I checked it against code-review-r1.md, code-r1-adjudication.md and code-review-brief.md.

The reviewed worktree is unmodified. All mutants and probes ran on scratch copies under `code-review-r2/review-run-7cc858a-ce311c43/scratch/`. I made no live SSH, notes, task install, peer messages or credential/config reads.

Gate: `focused-r3.log` shows 114 tests, 111 pass, 0 fail, 3 skipped, and 0 new temp entries. I did not rerun it.

My scoped gate held `Global\claude-verify` with no contention. It ran twice. The first run's output filter matched nothing, so it left no evidence, and I reran the same gate once with raw TAP saved. No other gate ran.

One probe was refused by the secret guard. A direct `sh` harness for ARCHIVE_SCRIPT tripped the "dumps the process environment" pattern, and per the brief I stopped that step without retrying. The archive shell behaviour below therefore rests on inspection plus the committed fake-SSH tests and the mutants.

## Status of the ten r1 causes

| # | r1 cause | Status at 7cc858a | Evidence |
|---|---|---|---|
| 1 | Notification never delivered, and silently | **Fixed** (residuals: F3, F4) | `buildNotificationInvocation` (triage `:88-95`) returns `cmd:[process.execPath]` and args[0] = `<plugin>/skills/multi/scripts/note-send.mjs`, including `--packet-file`. Production `defaultNoteSend` (`:98-101`) consumes it, so it is not a test-only helper. Nonzero, error or timeout throws. `raiseAttention` (`:107-120`) writes the multiline ATTENTION first, then sends `safeSummary(reason)` through `assertFieldSafe`, and returns a visible `[BLOCKED to Ben NOT delivered: …]` / `[ATTENTION write failed: …]` suffix, which all six call sites put into `receipt.reason` via `attend()`. Injected `noteSend` gets the same summary. The CLI still accepts only `--manual`. |
| 2 | Archive unlinked the source before the hash check | **Fixed in code** (test gap: F1) | ARCHIVE_SCRIPT `:45-62`. `mkdir .claim-$h` is exclusive, `mv src → claim/note` is a same-directory rename, and the hash check and `ln` to dst run on the claimed bytes. `rm` touches only `$cf`, and only after `okdst`, or after `restore` re-linked it to `src`. No `rm "$src"` remains anywhere. Changed bytes restore by exclusive `ln` only if the live name is free; otherwise `CLAIM_KEPT <path>` keeps both. The missing-source branch checks the claim before `okdst`/`ORIGIN_MISSING`, so an interrupted claim is named unresolved residue, not terminal. `$h` is hex-validated, `$n` has no slash or leading dot, and gather's `find -maxdepth 1 -type f ! -name ".*"` never sees `.claim-*`. The reason carries the claim path (`remoteArchive` detail at `:504-505`, reason at `:544`). |
| 3 | Terminal reported twice | **Fixed** | `:396` dedupes by identity. The full-receipt test asserts exactly one `{netcup, superseded}` and row `terminal: 1`. |
| 4 | Unknown managed set treated as empty | **Fixed** | `managedSet` returns `{set, error}` for both a source-path failure and an unreadable source inbox. The runner resolves once (`:296-298`, on a copy `opts`, so the caller is not mutated) and skips before baseline, gather or spawn. Standalone gather fails closed with skipped rows and 0 imports (`:435-442`). Mutant m6 (runner skip removed) fails the managed test. The contract `managedNames?: Set<string>` is internal and has no CLI path. |
| 5 | Tests passed on an unrelated precondition failure | **Fixed** | Mutant m1 (writer paragraph broken in the harness) fails 7/9 selected tests. The changed-DIGEST test now fails on `nestedExitCode` (actual `null`, expected `0`). Mutant m2 (`!commit` check disabled) fails the changed-DIGEST test in mode `unchanged` (`success` ≠ `attention`), so the matching fresh remote `1…1` isolates the missing DIGEST commit. The success test asserts the argv `--session-id` UUID is in `sessions.json`. The no-change test pins `skipped` / `skill deferred` / `nestedExitCode 0` / `remote ref`. |
| 6 | PID-only run.lock liveness | **Fixed** | `:279-280`. Age must satisfy 0 ≤ age < 3 h. NaN, future or older gives ATTENTION, and the lock is never removed. The test covers a live PID with an old timestamp. |
| 7 | Reconcile zeroed gather-phase `unresolved` | **Fixed** | `:519` is `{...r, archived: 0}`. The full-receipt collision test asserts row `unresolved: 1` and the matching named entry. Deduping by host+name in the runner cannot collide in practice: a gather-collided origin has no canonical and never reaches reconcile, and older same-name versions are superseded first. |
| 8 | First deferral labelled success | **Fixed** | `:398`. The status is `skipped` while `sessionId`, `nestedExitCode 0` and `tokens` are retained (asserted). `lastEndedAt` is not advanced. |
| 9 | Watchdog could signal twice | **Partly fixed** (F2) | The overflow-then-timeout order is guarded. The timeout-then-overflow order still signals twice (measured). |
| 10 | Backslash name failed the whole host | **Fixed** | `parseTar` `:295-299`. Slash, absolute paths and `..` still throw. A name with a backslash or a drive-like prefix goes to `unsupportedName` before any path use. The mixed test imports the valid sibling only. |

## Findings

### F1. MEDIUM (tests): the claim-restore and interrupted-claim branches have no test, so a byte-loss mutant passes all gather tests
- **Evidence:** the full `knowledge-gather.test.mjs` passes 20/20 on both of these scratch mutants (`scratch/m3-gather.tap`, `scratch/m4-gather.tap`):
  - **m3:** the missing-source branch loses the claim check. `if [ -e "$claim" ] … CLAIM_KEPT … elif okdst` becomes `if okdst`. An interrupted claim is then reported as terminal `ORIGIN_MISSING`, which is exactly the r2 brief's "not a terminal missing origin" requirement.
  - **m4:** `restore()` deletes the claimed changed version instead of re-linking it. `if ln "$cf" "$src"` becomes `if rm -f "$cf"`. The concurrently written note is destroyed and the script reports `CHANGED_SOURCE`.

  The only race test (`knowledge-gather.test.mjs:489`) replaces the source *after* the claim `mv`, so it exercises only the success path. The fixture's `ln` hook fires only on restore, which that test never reaches. `CLAIM_BUSY` is also untested.
- **Fix (tests only, `scripts/knowledge-gather.test.mjs`):**
  1. **Interrupted claim.** Copy the setup of the "changed origin" test (`:455-470`). After moving the local import into `_archive/2026-09`, simulate the crash: `const claim = path.join(path.dirname(source), '.claim-' + item.sha256); fs.mkdirSync(claim); fs.renameSync(source, path.join(claim, 'note'));`. Then `seedVerifiedPublication` and `reconcileKnowledge`. Assert `row.terminal === 0`, `row.unresolved === 1`, that `rows.residue.unresolved[0].reason` matches `/remote claim kept.*\.claim-/`, and that the file at `path.join(claim,'note')` still holds the original bytes. Predicted: passes at 7cc858a; m3 fails (terminal 1, `origin missing`).
  2. **Changed claim, live name free.** Add a fixture phase, `archiveRace: { …, phase: 'before-claim' }`. Its `mv` hook replaces the source with the replacement bytes *before* `command mv "$@"`, and only when `"$1" = "$HOME/.claude/knowledge/_inbox/$RACE_NAME"`. Compare against `$HOME`, not the Windows-converted `RACE_SOURCE`: the `ln` hook's path equality has never been exercised. Assert unresolved `/origin changed since gather/`, that the source holds the replacement bytes, that no `.claim-*` entry remains, and that the destination is absent. Predicted: passes at 7cc858a; m4 fails (source absent).
  3. Optionally, a variant where the hook also writes a third version at the live name after the claim. Assert `CLAIM_KEPT` with both versions readable.
- **Simplification:** none. This adds tests only; no production change.

### F2. LOW: the watchdog still signals twice when the timeout fires before the overflow
- **Evidence:** `knowledge-gather.mjs:107` kills on overflow whenever `!overflow`, whatever `timedOut` says. `:116` guards only the other direction.

  My scratch probe (`scratch/dblkill.mjs`) stubs `taskkill` so that it does not kill, fires the injected timeout while the child is still writing, and then crosses `maxBytes`. Measured result: `{"killCalls":2,"timedOut":true,"overflow":true}`.

  In production this happens when the parent timeout fires and output then keeps arriving (from an escaped descendant, or before `taskkill` finishes). The second `taskkill /PID <pid> /T /F` can hit a reused PID, which is the r1 #9 hazard in reverse. The committed test (`:346`) covers only overflow first.
- **Patch** (`scripts/knowledge-gather.mjs`):
  - `:92` current: `    let timedOut = false; let overflow = false; let done = false; let handle = null; let child;`
    replacement: `    let timedOut = false; let overflow = false; let killed = false; let done = false; let handle = null; let child;`
    Then add a new line after `:92`: `    const killOnce = () => { if (!killed) { killed = true; killTree(child.pid); } };`
  - `:107` current: `if (size > maxBytes) { if (!overflow) { overflow = true; killTree(child.pid); } return; }`
    replacement: `if (size > maxBytes) { if (!overflow) { overflow = true; killOnce(); } return; }`
  - `:116` current: `timedOut = true; if (!overflow) killTree(child.pid);`
    replacement: `timedOut = true; killOnce();`
- **Predicted and measured outcome:** on a scratch copy with this patch, the same probe gives `killCalls: 1`. The existing overflow-then-timeout test is unaffected, because `killOnce` preserves one call. Add the reverse-order case to the existing test: fire `timeoutCallback()` first, then let the child overflow, and assert `killCalls === 1`.

### F3. LOW: `safeSummary` throws on a reserved word preceded by non-ASCII whitespace, so the BLOCKED note is not sent
- **Evidence:** `knowledge-triage.mjs:81-82` replaces ` (Goal|Details|Needs):` before collapsing `\s+`. Measured with the real `assertFieldSafe`: `safeSummary("x Goal: y")` and `safeSummary("x Details: y")` both throw "contains the reserved word". Reasons are partly dynamic: the curated-lock holder text comes from the lock's owner file, and git/pub reasons are also dynamic. The throw is caught and shown as "NOT delivered", so it is visible, but Ben is not notified.
- **Patch** (`scripts/knowledge-triage.mjs:81-82`):
  - current:
    ```js
    const flat = `knowledge-triage: ${reason}`.replace(/[\r\n\t]+/g, " ").replace(/[`;|$]/g, "'").replace(/&&/g, "and")
      .replace(/ (Goal|Details|Needs):/g, " $1 -").replace(/\s+/g, " ").trim();
    ```
  - replacement:
    ```js
    const flat = `knowledge-triage: ${reason}`.replace(/\s+/g, " ").replace(/[`;|$]/g, "'").replace(/&&/g, "and")
      .replace(/ (Goal|Details|Needs):/g, " $1 -").trim();
    ```
- **Predicted outcome:** `\s` covers `\r\n\t`, NBSP, U+2028 and the like, so each input becomes `x Goal - y` and passes the validator. All existing outputs are unchanged. The truncation at 397 cannot form ` Goal: `, because the trailing space is gone.

### F4. LOW (judgment): an ATTENTION write failure suppresses the BLOCKED notification completely
- **Evidence:** `knowledge-triage.mjs:113` has `if (!suffix) try { … send … }`, so when the packet write fails, no note is attempted. The test at `knowledge-triage.test.mjs:301` asserts `attempted === 0`. The failure then shows only in the returned receipt. In the tested case (stateDir unwritable), `receipt.json` cannot be written either. The only trace is the process stdout and exit code 1 in Task Scheduler, which is the "hidden stall" class r1 #1 closed.

  The adjudication asks to "write ATTENTION before sending so packet exists" and for the write failure to be visible. It does not say to stop notifying Ben.
- **Fix (root decision):** when the packet write failed, still send one note, this time without `--packet-file`: `safeSummary(\`${reason}; ATTENTION packet NOT written (${err.code})\`)`. Two ways to do it:
  - Allow `buildNotificationInvocation(text, packetFile)` to omit `--packet-file` when `packetFile` is null. This is a one-line contract note.
  - Keep the packet mandatory and state explicitly in the contract that no notification is sent in this case.

  The test's `attempted === 0` then becomes `attempted === 1` with the summary matching `/ATTENTION packet NOT written/`. Predicted: the other notification tests are unchanged.

## Verified absences (first-class)
- **No live-name deletion in ARCHIVE_SCRIPT.** Every `rm` targets `$cf` only, after an `ln` or `okdst` succeeded. `rmdir` is used only on the owned claim. `mv` happens only after the exclusive `mkdir`. Every exit path either completes, restores to a free live name, or reports `CLAIM_KEPT <path>` / `CLAIM_BUSY <path>` as unresolved, never terminal and never success. No bulk scan or cleanup of other claims.
- **The notification path is the production path.** `defaultNoteSend` is the only default caller and uses the pure helper. The sender identity is fixed to `--from knowledge-triage` and `--to ben`. note-send reads no peer identity from the environment for `--to ben`.
- **Publication tests reach their branch.** Mutants m1 and m2 fail on branch-specific assertions, as described above.
- **Test fixtures do not relax production.** Platform/`process.kill` stubbing is restored in `finally`. The SSH race hooks are injected only when `archiveRace` is set. `chezmoiSourceInbox: undefined` forces the real discovery path. Every override is still `deps`-only.
- **Receipt totals agree** for terminal (identity dedup) and unresolved (row counts preserved and names deduped by identity-equivalent tuple).

## Observations (not counted)
- A persistent `chezmoi source-path` failure is a daily exit-0 `skipped: managed set unresolved…` with no escalation. That is root's pinned "named skip", but it is a quiet stall. Consider applying the two-consecutive escalation already used for lock and deferral before unattended scheduling.
- note-send writes the packet and ledger under `--sender-repo` = PLUGIN_ROOT (`docs/notes/`, `docs/ledger/`), plus the `~/.agents/notes` mirror. This predates this delta. For the live proof, confirm that PLUGIN_ROOT is the intended home for those files.
- There is a pre-existing narrow window between the `mkdirSync(runLock)` and `owner.json` writes (`:273-275`). A concurrent starter reading `owner.json` in that gap gets a false ATTENTION. This does not matter for a single manual run.

## Receipts (scratch)
`scratch/m{0,1,2,6}-triage.tap`, `scratch/m{0,3,4}-gather.tap`, `scratch/dblkill.mjs`, `scratch/dblkill-mut.mjs`, `scratch/mut/`, and `scratch/gate.ps1`.
- **Baselines:** m0 passes triage 9/9 (selected) and gather 20/20.
- **Mutant results:** m1 fails 7 of 9; m2 fails changed-DIGEST (`unchanged`); m6 fails the managed-discovery test; m3 and m4 pass 20/20 (F1).

## JUDGMENT (one supervised manual live proof)
**Yes, it is safe now.** None of the four findings creates a data-loss, duplication, permission or false-success path in a single supervised manual run:
- F1 is a test gap over code that is correct by inspection.
- F2 needs the timeout and overflow both to fire, and the proof run is watched.
- F3 and F4 are visible in the receipt, and the operator is present.

Conditions:
- Run it manual and single, with no task installed.
- Confirm beforehand that `chezmoi source-path` resolves for DIGEST.
- After the run, confirm that no `.claim-*` directory remains in the Netcup and Hetzner inboxes.
- Treat any `CLAIM_KEPT` or `CLAIM_BUSY` in the receipt as a stop.

Fix F1-F4 before unattended scheduling.

Cause: the claim rewrite added two recovery branches (`restore`, and the claim-exists check) that no fixture drives. The single-kill fix guarded one ordering of two independent kill triggers. The reserved-word rewrite runs before whitespace normalisation. The notification send is gated on the packet write instead of degrading without it.
Discriminating check: mutants m3 and m4 pass all gather tests today (F1). The timeout-first probe measures `killCalls: 2` today and `1` after the patch (F2). `safeSummary("x Goal: y")` throws today and passes after the patch (F3). The ATTENTION-write-failure test asserts `attempted === 0` today (F4).
Fix location: `scripts/knowledge-gather.test.mjs` (the new claim tests and the `makeSshFixture` phase), `scripts/knowledge-gather.mjs:92,107,116` (`killOnce`), `scripts/knowledge-triage.mjs:81-82` (`safeSummary` order), and `scripts/knowledge-triage.mjs:107-120` plus the `buildNotificationInvocation` contract line (F4).
Simplification: `killOnce` replaces two separate guards with one flag. The `safeSummary` reorder drops one regex pass. No new mechanism is needed.
