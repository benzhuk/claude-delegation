DONE

# Lane 58 fix round 1 — adopt review-r1.md findings

## Cause
`defaultReadPickupCapture` accepted ACCOUNTED and `publish` treated "fresh Done
checked, and fresh triples equal the capture's" as proof the page was still in
round N's own Done episode. That proof breaks once round N's Done has actually
been cleared and the owner checks it again with identical inputs (zero inputs,
or the same note retyped): the drift check and verbatim check both still pass,
and round N's stale capture silently consumes a brand-new, uncaptured
hand-back — reopening M8 (docs/work/evidence/wr-2026-09-27-decisions-render-review-r1.md:254).

## Discriminating check
The Done label text (`Done (last cleared: <stamp>)`, from `doc.doneLabel`,
the same field `extractDoneLineVerbatim` already uses). Round N's capture
carries the stamp from before round N; any `publish --clear-done` writes a
strictly newer one. So `capture.doneLabel === fresh doc.doneLabel` is true
only in the legitimate state (accounted, not yet cleared). A second,
independent signal: `receipt.observedUncheckedAt`, set once the pickup host
has actually seen the page unchecked after accounting — a stronger and
earlier-available proof the round is over, applied at the read layer before
even opening the private capture.

## Fix location
- `skills/decisions/scripts/decisions-render-publish.mjs`,
  `defaultReadPickupCapture`: added
  `if (st.status === 'ACCOUNTED' && st.receipt.observedUncheckedAt) return null;`
  right after the acceptable-statuses check; the returned capture now also
  carries `doneLabel: doc.doneLabel` when `accounted: true`. Updated the
  comment's overstated "never a stale earlier one" claim per the review's F1
  note.
- `publish()`: added
  `if (capture.accounted && doc.doneLabel !== capture.doneLabel) throw PublishError(3, ...)`
  right after the existing Done-checked guard, before the multiset check.
- `skills/decisions/SKILL.md`: replaced the ambiguous sentence with the
  reviewer's F2 wording (names "the Done line unchanged since the capture,
  never cleared and re-checked" and adds the `(checked by ...)` tag its
  neighbours carry).
- Adopted the reviewer's ready patch verbatim (review-r1.md lines 61-101,
  143-154) and its two named test additions (lines 104-136), plus its
  `doneLabel: 'Done'` addition to the existing ACCOUNTED-shape test (line 104).

## Simplification
None beyond what the review itself pointed out: no new comparison machinery
was added — `parseDocument` already returns `doc.doneLabel`, the same field
`extractDoneLineVerbatim` uses; carrying and comparing it closes the hole. Did
not take up N2 (dropping the `capture.accounted &&` guard to close the twin
RECORDED-side hole) — out of this round's scope per the coordinator's brief
(both findings named are F1 MAJOR and F2 MINOR only), and the review itself
calls N2 "the builder's call and in territory, but outside the spec."

## Red evidence (mktemp copy at c73d472, scratch /var/tmp/l58-k3oG/red-c73)
`git archive c73d472` extracted to a fresh copy; added the reviewer's test
edits (the `doneLabel: 'Done'` shape addition, the new
"Done was cleared and then re-checked" test, and the new
"unchecked page was already observed" test) with source unchanged. Ran
`TMPDIR=/var/tmp node --test skills/decisions/scripts/decisions-render-publish.test.mjs`:
54 tests, 52 pass, 2 fail:
1. The ACCOUNTED-shape test failed: `actual` had no `doneLabel` key
   (deepEqual mismatch) — confirms the capture didn't yet carry the label.
2. The new "Done was cleared and then re-checked" test failed with
   "Missing expected rejection" — `publish` returned code 0 and cleared the
   new, uncaptured hand-back using round N's stale capture, exactly the F1
   defect.

Honesty note on the third test ("unchecked page was already observed yields
null and never opens the capture"): at c73d472 this assertion already passes
by coincidence, not by the intended guard. Pre-fix, `openPrivateCapture`
IS still called (the mock's own throw fires), but the generic
`try { ... } catch { return null; }` around that call swallows the throw and
returns `null` anyway — the same value the test asserts. The assertion checks
only the return value, not whether `openPrivateCapture` was invoked, so it is
non-discriminating for that specific claim at the unit level (verified
directly with `node -e` against the c73d472 module). It is still correct and
useful post-fix (the new `observedUncheckedAt` check now returns null earlier,
before ever calling `openPrivateCapture`, matching its own docstring), and is
included verbatim per the coordinator's instruction to adopt the reviewer's
regression tests as given.

## Post-fix gates (worktree /var/tmp/lane-58/wt, TMPDIR=/var/tmp)
1. `node --test skills/decisions/scripts/decisions-render-publish.test.mjs`
   → 54 pass, 0 fail (both red cases above now green; the rest unmoved).
2. Every other `skills/decisions/scripts/*.test.mjs` (decisions-archive.contract,
   decisions-handback, decisions-pickup, decisions-read, decisions-render-core,
   decisions-render, decisions-title, goals-mirror, registered-pickup.contract,
   skill-text) → 455 pass, 0 fail. `skill-text.test.mjs` alone: 14/14 (no
   assertion touches the edited SKILL.md paragraph, as the review predicted).
3. `TMPDIR=/var/tmp node scripts/run-tests.mjs` (once) → 3035 tests, 3030 pass,
   5 skipped, 0 fail; "leak check: 0 new temp entries". Full log at
   /var/tmp/lane-58/l58-fix-r1-full-run.log (not committed).

## Commit
14fc09d fix(decisions): require the accounted capture's Done line, not just checked
(branch build/clear-done-accounted-1, on top of afb83ec; not pushed).

## Notes / deviations
- No dev server, no process started, nothing to kill.
- No Notion access; notion.js never invoked.
- Nothing deleted; scratch directories (`/var/tmp/l58-k3oG`, and the builder's
  earlier `/var/tmp/l58-0CEf`) left in place per the hard rules.
- Did not act on review Notes N1 or N2 (both explicitly marked "no fix
  required for this lane" / "the builder's call ... but outside the spec");
  only F1 (MAJOR) and F2 (MINOR), as the coordinator's brief named both
  findings verbatim and nothing else.
