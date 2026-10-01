VERDICT: APPROVE 72ca037be774bc043bb62dd4a5817200db2b7ff2

# Lane40 code review r3: delta review of the F1-F4 closure

Reviewed: `72ca037be774bc043bb62dd4a5817200db2b7ff2`, the diff from `7cc858a`. That covers the source commit `0fa06fe`, the test commits `faac957` (F1-F4) and `d2daf06` (N2), and the reports. I read code-review-r2.md, code-r2-adjudication.md, code-delta-r3-brief.md, bearings-second-delta-assessment.md, contracts.d.ts, tests-report.md and builder-report.md.

The worktree is unmodified: `git status` is empty and HEAD is 72ca037. All mutants ran on scratch copies under `code-review-r3/review-run-72ca037-13d2cff6/scratch/`. There was no live SSH, no note send, no knowledge or task mutation, no secret or private-config read and no subagent. I did not rerun the refused direct-sh harness, in any form.

Two operations were denied by the guard, and each stopped there with no retry:
- **Rebuilding the F3 and F4-gating mutants.** A first sed attempt had corrupted three copies (f3, f3b, f4), which were therefore never run. F3 is instead covered by a pure-function probe, below.
- **A log-summary listing.** Only the cleanup inventory below is affected.

## Findings: none blocking (0)

All four r2 findings are closed at the required acceptance behaviour. The bearings prediction holds on every clause: both archive mutants are rejected, one kill happens in either ordering, the problem summaries are accepted, the packetless notification is attempted, and no persistent state was added.

### F1 (tests): claim recovery. CLOSED
- **Archive source:** `git diff 7cc858a HEAD -- scripts/knowledge-gather.mjs` touches only `runProcess` (lines 92-93, 108, 117). ARCHIVE_SCRIPT (lines 45-62) is byte-identical to 7cc858a.
- **New tests:**
  - `knowledge-gather.test.mjs:337`, interrupted and busy claims:
    - Interrupted: terminal 0 and unresolved 1, with reason `/remote claim kept.*\.claim-/`. `claim/note` still holds the original bytes.
    - Busy: reason `/claim dir already exists.*\.claim-/`. The source bytes and the existing claim marker are untouched.
  - `knowledge-gather.test.mjs:353`, changed bytes before the claim:
    - Live name free (`before-claim`): the source holds the exact changed bytes, and no claim and no destination remain.
    - Live name newly occupied (`before-claim-occupied`): the reason is CLAIM_KEPT, the live name holds the occupant, and `claim/note` holds the changed bytes. Both versions are readable.
  - The fixture hook keys on `"$1" = "$HOME/.claude/knowledge/_inbox/$RACE_NAME"`, as r2 advised. The before-claim assertions on the replacement bytes can only pass if the hook actually fired, so they are self-proving.
- **Mutants, re-run on this SHA:**
  - m3 (the missing-source branch loses its claim check) fails the gather suite 21/22: `interrupted: 1 !== 0` on terminal, at `:337`.
  - m4 (`restore` does `rm -f "$cf"` instead of `ln`) fails the gather suite 21/22 at `:353`: `ENOENT` reading the live source, because the changed bytes were destroyed.
  - Both fail the intended assertion.
- **Fixture extraction:** `knowledge-gather.test-fixtures.mjs` has 136 lines and territories.md authorises it.
  - I diffed the moved bodies (7cc858a lines 211-745 against HEAD lines 43-625, ignoring whitespace). All 20 prior tests are present and unchanged, except the kill-order test, which was intentionally rewritten. There are 2 new tests, 22 in total.
  - The only machinery changes are the race phases: `before-claim` and `before-claim-occupied`, plus the `$1`-keyed after-claim hook. The prior atomic-replacement test still passes on it.
  - Assertions stay in the test file. The test file is 625 lines, the triage test file 645, both under 800.

### F2: a single `killOnce`. CLOSED
- **Source:** one `killed` flag (`knowledge-gather.mjs:92-93`). Both the overflow trigger (`:108`) and the timeout trigger (`:117`) call `killOnce()`. The two order-specific guards are gone, and no timer or signalling route was added.
- **Test:** `:178` uses a real Node child and the injected parent timer, with both orders in one loop.
- **Mutant f2** (old asymmetric guards restored) fails 21/22 at `:178`: `timeout-first: … 2 !== 1`. The overflow-first half passes before the failure, as it should.

### F3: whitespace normalised first. CLOSED
- **Source:** `knowledge-triage.mjs:82-83` is exactly the r2 patch. `envelope.mjs` is unchanged: `git diff 7cc858a HEAD -- skills hooks` is empty.
- **Test:** `knowledge-triage.test.mjs:281-287` sends NBSP and U+2028 labels through the real git `ls-remote` failure path to the injected sender, and asserts the real `assertFieldSafe(delivered)`.
- **Pure-function probe:** this read-only `node -e` import compared the new `safeSummary` with an inline copy of the old one. It stands in for the denied mutant build. `RESERVED_WORDS` is `' Goal: '`, `' Details: '` and `' Needs: '`: case-sensitive, with a trailing space.

  | Input | Old code | New code |
  |---|---|---|
  | `remote Goal: unsafe` | throws | `knowledge-triage: remote Goal - unsafe` |
  | `remote Details: unsafe` | throws | `… Details - unsafe` |
  | `x Needs: y` | throws | passes |
  | `a　Goal: b` | throws | passes |
  | ASCII `plain Goal: y` | `… Goal - y` | identical |
  | 500-character input | — | capped at 400 |

- **Reachability:** the test report and the builder receipt independently record NBSP red on the old source with `delivered == null`. That proves the stderr reason reaches `safeSummary`. U+2028 uses the same path, and the probe shows it red on the old code.

### F4: one packetless attempt. CLOSED
- **Source** (`knowledge-triage.mjs:107-124`):
  - The send is no longer gated on the packet write. When the write failed, the summary is `safeSummary(recoveryText("ATTENTION packet NOT written"))`, the same text for the injected sender and for `defaultNoteSend`.
  - `defaultNoteSend` receives `written ? ctx.attention : null` and passes it to `buildNotificationInvocation`. That helper now omits `--packet-file` only when the value is falsy. So the production path does use the nullable helper (verified by inspection).
  - The dynamic write and send errors stay in the returned suffix, so the delivery error remains visible.
  - No retry, no new file and no new state were added.
- **Test:** `:290-319` asserts all of the following:
  - `attempted === 1`
  - the fallback passes `assertFieldSafe`
  - `/ATTENTION packet NOT written/`
  - both exact commands, via `includes`: `rmdir ~/.claude/knowledge/.curated-update.lock` and `rm ~/.agents/knowledge-triage/ATTENTION`
  - the receipt shows `BLOCKED … NOT delivered … fixture fallback send down`
  - `buildNotificationInvocation(…, null)` has no `--packet-file`
- **Mutants:**
  - f4c (the fallback sends the dynamic reason) fails 19/20 on the `/ATTENTION packet NOT written/` assertion.
  - f4d (the helper always emits `--packet-file`) fails 19/20 with `true !== false`.
  - The gating revert (`if (written) try`) could not be run (the rebuild was denied). By inspection it fails `attempted === 1`, and the builder's pre-edit receipt records exactly that red (`attempted 0`).
  - f4b survived. See O1.

### Research receipt and branch-specific reds
- **Order:** commit `6dd2091` (research receipts, builder-report.md only) is the parent of the fix commit `0fa06fe`. Its author time is 19:55:26 and the fix's is 19:56:16. The two share a committer time of 19:56:58 because they were integrated together. So the receipt predates the patch both in history and in author time.
- **The receipt's reds:** its three failures are F2-F4, each at its intended assertion. The two extra reds were stale fixtures on the builder's tree. Both are fixed in this candidate:
  - the gather `.sort()` on both sides at `:399`
  - the triage `:610` test, which now checks the packet at `:624`, not the note
- **The test author's red gate** (42 tests, 39 pass, 3 fail) was F2-F4 only.

### N2 test changes since 7cc858a
- **What changed:** `d2daf06` passes `env: childEnv(childHome)` to the gather hanging-fixture grandchild (`knowledge-gather.test.mjs:25`) and to the triage Claude-fixture grandchild. Both stay in the scanned `*.test.mjs` files.
- **Scanner result:** all 16 N2 scanner tests pass on this SHA, including the full-suite "no test file inherits the runner environment" test.
- **The moved spawn:** the fake-SSH `spawnSync(shell…)` now lives in `.test-fixtures.mjs`, which the scanner does not walk. It still carries an explicit literal env (`PATH`, `HOME`, `TMP`, `TEMP`, `RACE_*`) and it spawns bash, not node. So nothing inherits (see O3).

## Gate and counts (exact)
- **Scoped sealed gate:** one run, holding `Global\claude-verify` acquired nonblocking with no contention. Command: `node scripts/run-tests.mjs --no-sweep` over `scripts/knowledge-gather.test.mjs`, `scripts/knowledge-triage.test.mjs` and `skills/multi/scripts/hooks.test.mjs`.
  - **Result:** 84 tests, 69 pass, 15 fail, 0 skipped, leak check 0, 12.7 s.
  - **Gather and triage:** 42 of 42 pass.
  - **N2 scanner:** 16 of 16 pass.
  - **The 15 fails:** all in hooks.test.mjs hook-behaviour cases (V3, M1, M3, L3, L1, D2, C4), all "hook printed nothing". No hook or skills file changed since 7cc858a, and `DELEGATION_REVIEW_RUN` is present in this reviewer's environment (a presence check only). The test report's native 308/308 run happened with the marker absent. These fails are environment-specific to the review run, not caused by this candidate.
- **Mutants:** six were run and five killed (m3, m4, f2, f4c, f4d); f4b survived.
  - **Timings:** m3 8.6 s, m4 8.8 s, f2 9.1 s, f4b 12.2 s, f4c 12.2 s, f4d 12.4 s.
  - **Not run:** f3, f3b and the F4-gating revert (rebuild denied). F3 is covered by the probe above.

## Non-blocking follow-ups (none affects required acceptance behaviour)

**O1 (LOW, test gap on the production F4 path).**
- **Evidence:** mutant f4b changes `defaultNoteSend(ctx, summary, written ? ctx.attention : null)` to `defaultNoteSend(ctx, summary, ctx.attention)`. It passes triage 20/20.
- **Effect in production:** note-send would refuse the missing packet (`note-send.mjs:798-801`, "--packet-file … unreadable"). The fallback would then be "NOT delivered". It would still be visible, but Ben would not be notified.
- **Why the test misses it:** the injected sender never sees the packet argument.
- **Patch:**
  - `knowledge-triage.mjs:118-119`, current:
    ```js
        if (ctx.deps.noteSend) await ctx.deps.noteSend(summary);
        else await defaultNoteSend(ctx, summary, written ? ctx.attention : null);
    ```
    replacement:
    ```js
        const packetFile = written ? ctx.attention : null;
        if (ctx.deps.noteSend) await ctx.deps.noteSend(summary, packetFile);
        else await defaultNoteSend(ctx, summary, packetFile);
    ```
  - In the test at `:308`, capture the second argument and assert that it is `null`. Assert that it equals `path.join(h.stateDir,'ATTENTION')` in the `:268` case.
- **Predicted:** existing injected senders ignore the extra argument. The f4b-shaped mutant (`packetFile = ctx.attention`) then fails.

**O2 (LOW, possible flake in the F2 test on a loaded host).**
- **Evidence:** in `timeout-first`, the stub delivers the real kill after a fixed 200 ms (`knowledge-gather.test.mjs:191`), but the child writes only after Node boot plus 25 ms. If boot takes more than about 175 ms (a busy Windows full suite), the child dies before it writes. `result.overflow` is then false and the test goes red. It is a false red, never a false green.
- **Patch:** at `:195`, change the child args to `'process.stdout.write("overflow"); setTimeout(() => process.exit(0), 500)'`, and delete the `if (order === 'timeout-first' && killCalls === 1) setTimeout(…realKill…, 200);` line.
- **Predicted:** both orders still pass on the fix, and mutant f2 still fails with `2 !== 1`. The order no longer depends on child boot, because the child always writes before it exits by itself.

**O3 (INFO).** The explicit-env fake-SSH spawn now sits outside the N2 scanner's `*.test.mjs` walk. It is safe as written, but a future edit there would not be caught. No action is needed for this lane.

## Bugfix fields
Cause: the claim-recovery branches had no fixture driving them; each of the two kill triggers had its own order-specific guard; the reserved-label replace ran before Unicode whitespace was normalised; and the BLOCKED send was gated on the ATTENTION write succeeding.
Discriminating check: on this SHA, mutants m3 (terminal 1 ≠ 0) and m4 (live source ENOENT) fail the new claim tests; f2 fails `timeout-first 2 !== 1`; the pure probe shows the NBSP, U+2028, U+2029 and U+3000 labels throwing on the old code and safe on the new; f4c and f4d fail the packet-write-failure test; and the gate is 42/42 green for gather and triage.
Fix location: `scripts/knowledge-gather.mjs:92-93,108,117` (killOnce); `scripts/knowledge-triage.mjs:77,82-83,95,99-100,114-120` (safeSummary order, nullable helper, packetless fallback); tests at `scripts/knowledge-gather.test.mjs:178,337,353`, `scripts/knowledge-triage.test.mjs:281-287,290-319`; machinery in `scripts/knowledge-gather.test-fixtures.mjs`.
Simplification: one `killed` flag replaces two asymmetric guards; one regex pass is dropped from safeSummary; the packetless fallback reuses the existing `recoveryText` with a fixed label; no new state, retry or service was added.

## Judgment: one supervised manual live proof
**Yes, it is safe now,** under the same conditions r2 set:
- Run it manually and singly, with no task installed.
- Confirm beforehand that `chezmoi source-path` resolves.
- After the run, confirm that no `.claim-*` directory remains in the Netcup and Hetzner inboxes.
- Treat any CLAIM_KEPT or CLAIM_BUSY as a stop.

Nothing in this delta adds a data-loss, duplication or false-success path. F4 improves visibility, and O1 and O2 are test-only gaps. Unattended scheduling still waits on the root's host gates: the native full suite and Netcup.

## Unknowns
- **F3 and F4-gating mutants:** not executed, because the scratch rebuild was denied. They rest on the pure-function probe, inspection and the recorded pre-edit reds.
- **The default `note-send` process path:** never executed in a test. That is by design, because no live note sends are allowed. See O1.
- **Host gates:** the native full suite and Netcup were not rerun by me.
- **Author-reported numbers:** the test author's figures (42/39/3 red gate, 308/308 native) are streamed receipts only, with no log file.

## Cleanup disposition
Retained for the lead's closeout (I deleted nothing), all under `code-review-r3/review-run-72ca037-13d2cff6/scratch/`:
- `head.tar` and `base/` (a clean export of this SHA)
- the mutant copies `m3`, `m4`, `f2`, `f4b`, `f4c`, `f4d`
- `f3`, `f3b` and `f4`: invalid partial edits, never run, discard
- the logs `gate.log`, `*.log` and `*.u8.log`
- `old-body.txt` and `new-body.txt`

`run-tests.mjs` left its sealed homes under `%TEMP%\delegation-test-run-*` for the red runs, for example `delegation-test-run-57868-iTuhEx` for the gate. I could not list the rest, because the listing was denied. The gate's leak check was 0.
