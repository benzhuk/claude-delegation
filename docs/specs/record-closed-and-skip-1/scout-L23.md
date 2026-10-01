VERDICT: READY-WITH-CONFLICT

## Files and symbols
- `scripts/work-record.mjs` exists: `STATUSES` is line 11 (eight values, no `closed`); `validateRecord` starts 171 and has accepted-only anti-hand-edit checks at 225-276; `acceptRecord` applies its `--at` bound at 1411-1415. Premise holds; reuse that bound rather than duplicate it.
- `scripts/work-record.test.mjs` exists: acceptance clock tests are 1998-2055; withdraw tests begin 2373 and currently refuse `accepted` at 2424. Its import list needs the close exports.
- `scripts/continuation.mjs` exists: line 165 hard-codes seven buckets and line 169 indexes them, so `withdrawn` already throws and is caught as `SELECTION_UNREADABLE`. Premise holds.
- `scripts/continuation.test.mjs` exists: snapshot assertions begin at 61; add the all-status snapshot here.
- `scripts/collect-from-origin.mjs` exists: CLI parser at 34 has repeatable `--skip`; branch enumeration starts at 153, and fully merged branches are dropped at 155. `computeState` at 111 maps only accepted/rejected/withdrawn specially, so closed will naturally read `owned` if it is ever listed.
- `scripts/collect-from-origin.test.mjs` exists: parser test 142 and state/row fixtures 122-286 constrain new prefix propagation.
- `scripts/collect-status.mjs` exists: parser 44, forwarding to collector 299-303, `computeChangeKey` 88, and `buildStatusMd` 240. Add default-prefix choice here and pass it through.
- `scripts/collect-status.test.mjs` exists: parser test 114, key stability 157, MD rendering/60-line constraints 219-248, and status shape 258.
- Conflict: `docs/work/README.md` does not exist at base; `docs/work-record.md` has the Status table (35-61), including an obsolete “seven values” finding at 221. `docs/census.md` has the existing collector prose at 443 onward; no standalone collector doc exists.

## Helpers to reuse
- `formatLogLine`, `parseRecord`, `validateRecord`, `acceptanceError`, `isAncestor`/`objectExists` patterns in `scripts/work-record.mjs`; accepted validation and clock logic are the close model.
- `fullRef`, `refExists`, `listOriginBranches`, and `formatTable` in `scripts/collect-from-origin.mjs`; collector already supplies branch filtering before row construction.
- `computeChangeKey`, `computeAttention`, and `buildStatusMd` in `scripts/collect-status.mjs`; keep keys based only on the filtered rows.
- Existing temp-repo fixtures and CLI-injection style in each corresponding `.test.mjs`.

## Tests that police this area
- `scripts/work-record.test.mjs`: strict accepted evidence/log/census validation, monotonic and bounded `--at`, and no accepted-to-withdrawn transition.
- `scripts/continuation.test.mjs`: selection snapshots must remain `OK` and preserve deterministic buckets/revisions.
- `scripts/collect-from-origin.test.mjs`: origin refs, merged-branch omission, row schema, and state mapping.
- `scripts/collect-status.test.mjs`: argument defaults, row-only order-independent keys, exact JSON shape, attention, and <=60-line Markdown.

## Open questions for the spec
- Should territory/doc reference change from nonexistent `docs/work/README.md` to `docs/work-record.md`, and should `docs/census.md` be named as the collector doc? Minimal resolution: amend L23 map before builder work.
- The close CLI syntax omits `--by`, while the fixed Log grammar requires an owner and `accept` uses `Owner:`. Should close use the record `Owner:` as its Log owner (the apparent minimal choice), or require a caller identity?
