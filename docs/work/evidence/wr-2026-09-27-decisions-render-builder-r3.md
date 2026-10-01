VERDICT: DONE 4a2b21c279e058f98cc009747ce1162c64d7930f

# Lane 26 (decisions-render), round 3 — review-r2.md's BLOCKER + three minors

Applied exactly the four items named in the task, nothing else. Branch
`build/decisions-render-1`, one commit on top of e2ceba8: `4a2b21c`.

## (1) BLOCKER R2-1 — `st.receipt.status` -> `st.status`

`decisions-render-publish.mjs:116` filtered on `st.receipt.status`, which is always
`undefined` — a real pickup receipt only ever carries `.state` (`decisions-pickup.mjs:1073`
etc.); the status word lives on the wrapper `receiptStatus()` returns as `st.status`
(`decisions-pickup.mjs:822-828`). Applied the report's one-line patch:

```
-  if (!acceptableStatuses.has(st?.receipt?.status)) return null;
+  if (!acceptableStatuses.has(st?.status)) return null;
```

To write a regression test that exercises the real wrapper shape (every existing test
injects `deps.readPickupCapture` wholesale, bypassing `defaultReadPickupCapture` entirely,
which is how the bug shipped), made the pickup module injectable through a second
argument (`{ pickup }`, default the real dynamic import — production behavior
unchanged):

```
-export async function defaultReadPickupCapture({ repo, page }) {
-  let pickupMod;
-  try {
-    pickupMod = await import('./decisions-pickup.mjs');
-  } catch {
-    return null;
+export async function defaultReadPickupCapture({ repo, page }, { pickup } = {}) {
+  let pickupMod = pickup;
+  if (!pickupMod) {
+    try {
+      pickupMod = await import('./decisions-pickup.mjs');
+    } catch {
+      return null;
+    }
   }
```

Added two tests in `decisions-render-publish.test.mjs` with a fake `pickup` returning the
exact real shape (`{ status, receipt: { state, round, captureReadAt } }`):
- `status:'RECORDED'` must return the triples.
- `status:'ACCOUNTED'` must return null (and never call `openPrivateCapture`).

Verified the failing-before/passing-after claim directly: temporarily reverted only the
one-line patch (via `sed`, then restored it — never committed), reran the new test in
isolation.

Before the patch:
```
✖ defaultReadPickupCapture: a real RECORDED wrapper (status lives on st, not st.receipt) yields the captured triples (0.7961ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  + null
  - { round: 4, tickAt: ..., triples: [...] }
```
After restoring the patch: both new tests pass (see full gate log, tests included in the
451/451 total below).

## (2) SKILL.md:354 — `HANDBACK blocked` -> `HANDBACK page-drift`

`decisions-handback.mjs` (lines 563-571) already emits the distinct `HANDBACK page-drift`
token whenever drift is among the objections, generic `HANDBACK blocked` otherwise.
SKILL.md:354 still named only the old generic token. Reworded that sentence to match:
"prints a `DRIFT` line and ends with `HANDBACK page-drift` (rescued by the kill switch
like any other content objection) when they differ". No pinned substring in
`skill-text.test.mjs` names either token, so nothing else needed updating.

## (3) A Done line inside a waiting item: refusal now names the file and line

`checkWaitingItem` let a standalone waiting item's own Done line through unrefused
whenever it was unticked and truly the item's last line: no `decisions-read.mjs` warning
fires (there is exactly one Done candidate and it is not "not last"), and
`doc.done === false` means the existing `hasReadDefect` ticked-Done check never sees it
either. The composed-page self-check would then refuse it as "render produced a page ...
this is a renderer defect, never a source-file refusal" — the wrong file gets blamed.

Added a check in `checkWaitingItem` (before the generic `hasReadDefect` check, so it
also improves the message for the already-caught ticked case): `doc.doneLabel !== null`
throws `${label}:${line} carries a Done line (only the renderer writes Done)`, where
`line` is a locally recomputed "true last content line" number (never imported from
`decisions-read.mjs` — this lane only reads that script through its exports, and no
export surfaces a Done line's number). Added one regression test
(`decisions-render.test.mjs`) covering exactly this shape (an unticked Done as the
item's own last line), asserting the message names both file and line.

## (4) Nothing-to-commit check scoped to the staged files

`decisions-render-publish.mjs:538` (`git diff --cached --quiet`) saw the whole index, so
an unrelated staged file could make a good, verified write exit 6 after the fact. Applied
the report's patch exactly:

```
-    execGit(['diff', '--cached', '--quiet'], repo);
+    execGit(['diff', '--cached', '--quiet', '--', ...toAdd], repo);
```

`toAdd` is the same array already built two lines above (`last-render.md`, plus
`session.md` under `--clear-done`) — no new state introduced.

## Nothing else touched

No Notion writes (no `--reader` run against the real page this round), no push, no
merge. `childEnv()` was not needed (no new spawn added). Git identity untouched. No
commit trailers added beyond the standard message body.

## Gate

```
node --test skills/decisions/scripts/*.test.mjs skills/multi/scripts/hooks.test.mjs
```
451/451 pass, 0 fail — full output at
`C:/Users/benzh/Code/decisions-render/pack/reports/B-gate.log`.

## Files changed
- `skills/decisions/SKILL.md`
- `skills/decisions/scripts/decisions-render-core.mjs`
- `skills/decisions/scripts/decisions-render-publish.mjs`
- `skills/decisions/scripts/decisions-render-publish.test.mjs`
- `skills/decisions/scripts/decisions-render.test.mjs`

State file updated: `C:/Users/benzh/Code/decisions-render/pack/reports/B-state.md`.
