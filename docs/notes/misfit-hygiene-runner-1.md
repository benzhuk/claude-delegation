DONE: rows 292, duplicates fixed: M288

Commit d9dd7a7f "docs: misfit list hygiene after the Codex review", pushed to main. Only docs/misfits.md changed.

## What ran
- Before: 293 table rows. One duplicate id, M288, at two different rows (same event, different wording and class).
- The two M288 rows differ, so the second (later in file) became M293. The highest id before was M292. All other ids unchanged.
- M159 (choice made on weak evidence) and M179 (host or tool defect) moved out of the table into "Not included" as two lines, text kept, with "moved after review: a product defect in another project, not a harness failure".
- M172 class changed to "check correct, work held", Recurred set to "no" (it is the only row in that class). This created a new class, so Classes went 50 to 51, and the line in the Classes section lists it.
- Recurred counts in other rows adjusted to match: false positive from a check 22 to 21, choice made on weak evidence 3 to 2, host or tool defect 7 to 6.
- Appended M294 to "Added after the compile" (10/5, class number set or counted wrongly, recurred yes, evidence path as given).
- Header now: Rows 292 (280 in the first compile after two moves, 12 added after), Classes 51.
- Judgement call: the brief said to change the Classes count only if the class set changed. It did, through M172, so I raised it to 51 and updated "Six families hold the 51 classes".

## Row count check
Final table rows: 292, no duplicate ids. 280 compile rows (282 minus 2 moved) plus M283 to M294 with the extra M288 (12 rows) gives 292.

## Family counts after the change
| Family | Rows |
|---|---|
| Agents leave a mess | 45 |
| Guards and checks cry wolf, or prove less than they claim | 69 (false positive 22 to 21, plus new class check correct, work held 1) |
| Four hosts, many panes, one plugin to install everywhere | 66 (was 67, M179 out) |
| Ben's page and his input | 37 |
| Numbers nobody can trust | 23 (was 24, M159 out) |
| The project grows instead of shrinking | 40 |
| Total | 280 (was 282) |

The added rows M283 to M294 are not in the Classes section or the family table, as before.

No secret values were read or printed. No tests run.
