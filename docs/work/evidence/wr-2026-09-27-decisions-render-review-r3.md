VERDICT: APPROVE 4a2b21c279e058f98cc009747ce1162c64d7930f

# Lane 26 (decisions-render): round-3 delta review of 4a2b21c

Scope: `git diff e2ceba8..4a2b21c`, one commit touching five files:
- SKILL.md
- decisions-render-core.mjs
- decisions-render-publish.mjs
- decisions-render-publish.test.mjs
- decisions-render.test.mjs

Nothing outside `skills/decisions` changed, and the worktree is clean.

## Summary

- The round-2 BLOCKER and all three minors are fixed.
- The new regression test really fails on e2ceba8.
- An end-to-end probe using a genuine pickup receipt passes on 4a2b21c and fails on e2ceba8.
- One new MINOR (a wrong line number in a refusal message). It does not block approval.

## How I checked

- `node --test skills/decisions/scripts/*.test.mjs` gives 425 pass, 0 fail (422 in round 2, plus 3 new tests).
- Mutation checks ran in a scratch copy made with `git archive` into my session scratchpad. The reviewed tree was never written.
- The end-to-end probe used a scratch git repo with a local bare origin and `AGENTS_HOME` pointed at a scratch directory.
  - Real parts: git (except `push`, which a wrapper intercepts and records), `publish()`, `render()`, `decisions-read.mjs`, and the real `decisions-pickup.mjs`.
  - `pickupOnce()` itself wrote a genuine WAITING_OWNER receipt and private capture.
  - `readPickupCapture` was not injected, so the production `defaultReadPickupCapture` ran against the real `decisions-pickup.mjs`.
  - `notion.js` was replaced by in-memory `readPage` and `replaceMd` fakes. Nothing wrote to Notion and nothing pushed.

## Prior findings, re-verified

| Finding | Verdict | Evidence |
| --- | --- | --- |
| R2-1 (BLOCKER) `st.receipt.status` | FIXED | See below. |
| R2-2 SKILL.md handback token | FIXED | See below. |
| R2-3 Done line inside a waiting item | FIXED, with one message defect (R3-1) | See below. |
| R2-4 nothing-to-commit check reads the whole index | FIXED | See below. |

### R2-1 (BLOCKER): FIXED

- Code: `decisions-render-publish.mjs:118` now reads `acceptableStatuses.has(st?.status)`.
- Why that is right: the real `status()` returns `receiptStatus()`'s wrapper `{ status: effectiveStatus, receipt, … }` (decisions-pickup.mjs:822-828). Its `PENDING_MANUAL_HANDOFF`, `NEEDS_RECONCILIATION` and `ORPHAN_CAPTURE` overrides (:1263, :1270, :1280) also land on `st.status`.
- In the end-to-end run, the real wrapper returned `status() -> WAITING_OWNER` and the receipt had no `status` field of its own. That confirms the shape the tests assume.

The regression test uses the real shape. Its fake `pickup.status()` returns `{ status: 'RECORDED', receipt: { state: 'RECORDED', round, captureReadAt } }`: status on the wrapper, only `state` on the receipt.

Mutation check (scratch copy):
- With only line 118 reverted to `st?.receipt?.status`, the RECORDED test fails (`actual: null`).
- With e2ceba8's whole `decisions-render-publish.mjs` put back, the RECORDED test also fails.
- After restoring, both tests pass.
- The ACCOUNTED test passes in every variant. That is expected: it guards against the filter being loosened, not against this bug.

The injectable `pickup` argument cannot change production behaviour:
- Signature: `defaultReadPickupCapture({ repo, page }, { pickup } = {})`.
- The only production call is `readPickupCapture({ repo, page })` at `decisions-render-publish.mjs:375`, with one argument. So `pickup` is `undefined` and the real dynamic import runs.
- `decisions-render.mjs:33/42` only re-exports the function.
- No CLI flag or environment variable reaches the second argument.

### R2-2: FIXED

- SKILL.md:354 now says "prints a `DRIFT` line and ends with `HANDBACK page-drift`".
- That matches `decisions-handback.mjs:567-569`, which prints `HANDBACK page-drift` and returns 1.
- skill-text tests pass.

### R2-3: FIXED

- `decisions-render-core.mjs:281-283` refuses any `doc.doneLabel !== null` with `<label>:<line> carries a Done line (only the renderer writes Done)`.
- Mutation check: disabling the check (`false &&`) makes the new test fail. Restoring it makes the test pass.
- No legitimate item is newly refused. Before this change, any item with a Done line was already refused, either by `hasReadDefect` or by render's composed-page self-check.
- One message defect remains, reported as R3-1 below.

### R2-4: FIXED

- `decisions-render-publish.mjs:538` is now `diff --cached --quiet -- ...toAdd`.
- End-to-end probe in the scratch repo: stage an unrelated `unrelated.txt`, then run a plain republish whose readback equals `last-render.md`.
  - At 4a2b21c: exit 0, prints "nothing to commit: …", no push, and `unrelated.txt` stays staged and untouched.
  - The same step at e2ceba8: exit 6, "git commit failed after the page was written and verified".

## End-to-end probe: `publish --clear-done` with a real pickup receipt

Setup:
- The scratch repo's `last-render.md` was produced by `render()`.
- The fresh page is `last-render.md` plus one owner comment line (`\t\*\* keep it capped, the queue broke twice`) under the waiting decision, with Done ticked.
- The real `pickupOnce()` captured that page. The result: receipt state WAITING_OWNER, round 1, `captureReadAt` 2026-09-27T19:55:00.000Z.

| Case | Result at 4a2b21c |
| --- | --- |
| A: today's history file has no quoted comment | exit 3, "owner text is not present verbatim (quoted) in today's committed history file …". 0 Notion writes, 0 pushes. |
| A2: quoted comment only in the working tree, not committed | exit 3, same message. 0 writes. |
| B: `- Ben on the nightly batch cap: "keep it capped, the queue broke twice"` committed and on origin/main | exit 0. See details below. |

Details of case B:
- One `replaceMd` write, and one recorded `push origin HEAD:main`.
- Lines only in the fresh read: the comment line and `- [x] Done`.
- Lines only in the write: `- [ ] Done (last cleared: Sep 27, 2026, 4:00 PM America/New_York)`.
- Line counts: 23 in the fresh read, 22 in the write. So the write dropped exactly the comment line and cleared Done, and nothing else changed.
- The written page parses with `done=false`, no warnings and no comments.
- `session.md` now has `since: 2026-09-27T19:55:00.000Z`, the receipt's `captureReadAt`.
- The commit holds exactly `last-render.md` and `session.md`, and `last-render.md` equals the write. `git status` is clean.

The same probe at e2ceba8 exits 3 in all three cases with "no captured pickup round for this page", and nothing is written. That is the R2-1 bug, and it confirms the probe tells the two commits apart.

## New findings

### R3-1 (MINOR): the R2-3 refusal names the wrong line when the Done line is not the item's last line

- Evidence: `decisions-render-core.mjs:282` always reports `lastContentLineNumber(text)`, the item's true last line. But `doc.doneLabel` is set for a Done line anywhere in the item (decisions-read.mjs:127-134).
- Probe: an item whose first line is `- [ ] Done` is refused as `waiting/middle.md:9 carries a Done line`, but the Done line is on line 1.
- The same check now also runs before `hasReadDefect`. For the not-last and multiple-Done cases, the old message included decisions-read's own warning with the correct line number, and the new message replaces it.
- Impact: the refusal is still correct (exit 2 before any write). Only the pointer is wrong.
- Fix: take the line from decisions-read's own warning when there is one, and fall back to the last content line.
  - current:
    ```js
        throw new RefusedError(`${label}:${lastContentLineNumber(text)} carries a Done line (only the renderer writes Done)`);
    ```
  - replacement:
    ```js
        const doneWarn = doc.warnings.find((w) => w.text === 'Done is not the last line' || w.text === 'more than one Done line');
        throw new RefusedError(`${label}:${doneWarn?.line ?? lastContentLineNumber(text)} carries a Done line (only the renderer writes Done)`);
    ```
  - Both warnings carry `last.line`, the canonical Done candidate (decisions-read.mjs:131-132).
- Predicted outcome:
  - The middle case reports `:1`.
  - The existing last-line case still reports `:9`.
  - All current tests still pass: the new test only matches `:\d+`, and the stray-Done test only asserts `RefusedError`.
  - Optionally, add a test for the middle case asserting `:1`.

## Verified absent

- Nothing outside the four fixes changed.
  - The only additions are the R2-3 helper and its check, the injectable argument, and the tests.
  - There are no edits to decisions-read.mjs, decisions-pickup.mjs or decisions-handback.mjs.
- The production pickup path is unchanged apart from the corrected field.
- The drift compare still catches non-owner edits. The case-B diff shows `revertOwnerInput` removed only the lines decisions-read attributed to the owner.

## Scratch

My probes, the scratch repos and the scratch `AGENTS_HOME` are under the session scratchpad, in `r3e2e/` and `mut3/`. Nothing was written to the reviewed worktree.
