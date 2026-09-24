VERDICT: APPROVE 841dae0845c63d8abf58739174ea868998bb1002

I only read the source and ran nothing. The parent gate still has to run the tests. I read `manifest.json`, `prior-review.md`, `fix.diff`, the changed part of `decisions-read.mjs`, the whole of `decisions-archive.contract.test.mjs`, the new tests in `decisions-read.test.mjs`, and `decisions-pickup.mjs:905-1016`. I did not open `0924-archive-builder-r2.md` or `0924-archive-contract-r2.md`, so nothing below relies on them.

## The prior MEDIUM is fixed

**Balance flag** (`decisions-read.mjs:169,186,294,353-354`)
- **Stray close:** a `</details>` at depth 0 sets `detailsBalanced = false` (`:186`).
- **Unclosed at end of file:** if the depth isn't 0 when the loop ends, the flag is also set false (`:294`).
- **Filter:** `!(detailsBalanced && archivedTitles.has(t))` means a page with untrusted structure exempts nothing. That is the same result as before the archive change.
- **No new BLIND rule:** there is no new `throw`. The unterminated-fence check still throws first (`:293`). Tags inside a fence are skipped (`:177-178`) before depth is counted.
- **Other tag shapes:** a `<details>` or `</details>` with other text on the same line isn't counted. At worst that makes the page look unbalanced, which removes the exemption. It never hides anything.

**Human signals still come through.** The flag only changes the `shapeless` filter. Comments still reach `unattached` through the R5 loop (`:321-324`). Options, statuses, Done handling and which title a line attaches to are unchanged. The public key set is still pinned (`decisions-read.test.mjs`, new test).

**Nested details inside Closed still work.** `ARCHIVE:27-29` is balanced, so `Nested archived grouping` stays exempt (contract `:86-92`). A nested H1 still can't end scope (contract `:103-130`).

## The new tests fail on the old 96edf source

I traced each test against the old code:
- **`UNCLOSED_DETAILS` / read-test unclosed case:** depth stays at 1, so `# Active` never ends scope. The old code returns `[]`; the tests expect two entries, or `[{Active malformed item, 4}]` in the read test.
- **`STRAY_DETAILS_CLOSE`:** the old code silently drops the stray close and returns `['Active optionless']`, but the test expects both titles. The read-test stray case returns `[]` but expects one entry.
- **Real `pickupOnce` (contract `:150-154`):**
  - Old code: `shapeless` is empty and there are no warnings (no options, and Done is the last line), so the result is `UNCHANGED`. The test asserts `INVALID`.
  - New code: `pickupOnce` returns at `pickup.mjs:1010-1015`. There is no receipt, so it never reaches the receipt/capture branches, and the test's no-artifact assertion is meaningful.

## The nits are fixed
- SKILL.md now says "top-level level-one (`#`) heading" and adds the clause that other sections block both pickup and hand-back.
- The module header at `:87-89` is accurate.
- The `archiveScope` string check and the replace that did nothing are removed. The `Object.keys` deep-equals remain as the real guard.

## Findings

**NIT: no real-pickup test for a stray close.** Contract `:150`
- **Cause:** only `UNCLOSED_DETAILS` goes through `pickupOnce`. The stray case is only checked at the parser level.
- **Discriminating check:** run `pickupOnce` with `STRAY_DETAILS_CLOSE`. It should return `INVALID` with 0 sends.
- **Fix location:** optional. Loop both fixtures at `:148-154`. Pickup reads the same `doc.shapeless` array, so the risk is low.
- **Simplification:** none needed. The fix is one boolean with no new state, engine, public key or allow-list.

**Not checked:** the fix doesn't change `docs/specs/2026-09-24-decisions-archive-scope.md`, and I didn't read it. I can't say whether it describes the unbalanced fallback. That wouldn't block approval.