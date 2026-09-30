# Lane 63: page-lint misjudges toggle extents around nested tables

## Defect, reproduced on this host 9/30 6:28 PM NY
`node skills/notion-writing/scripts/page-lint.mjs <fresh Goals read> --kind plain --title Goals` exits 2 with two toggle-tail findings, at `# Detail {toggle="true"}` and at `# The aim {toggle="true"}`. The block tree (`notion.js read-blocks 3e3da11277a1813cb326c42ed97a1d5d --ids`) shows both toggles end with an empty paragraph as their last child (The aim: block f6f018f0-8999-47d2-af00-6b17294bf88e; Detail: block 541f3f09-0e73-4e0f-afa0-5db56a9e97cb). The page is correct. The lint is wrong.

Cause, read from the script: a toggle's extent ends at the first later line whose tab indent is at or below the toggle's own (page-lint.mjs, the loop near line 136). Notion's markdown export prints table rows (`<tr>`, `<td>`, `</tr>`) at column 0 whatever the table's nesting, so a table inside a toggle cuts the extent short at its first row. On the Goals page the table under The aim is at two tabs and its rows are at zero, so both enclosing toggles end there and neither sees its real tail. skills-a's diagnosis (docs/specs/knowledge-triage-40/bearings-lint-diagnosis.md) found the same thing independently.

This blocks every bearings publication to the Goals page (lane 40's, lane 62's, and the 10/1 3:00 PM NY read). It is a defect fix to a fed, measured mechanism, so it opens now under the standing rule for that class. Ruling for the meantime: the two findings are known false positives and skills-a publishes lane 62's section past them; that ruling is recorded in history.

## Scope, pinned
1. In page-lint's line pass, every line strictly between a `<table` opener and its matching `</table>` inherits the opener's indent for extent and parent purposes. Nothing else about those lines changes (they stay non-blank content). No other rule loosens.
2. Regression test in `skills/notion-writing/scripts/page-lint.test.mjs`, from a fixture that mirrors the Goals shape: a toggle heading holding a paragraph, a table whose rows sit at column 0, more children, and a trailing `<empty-block/>`. Assert exit 0 and no toggle-tail. A second case with the same table and no trailing `<empty-block/>` must still report toggle-tail, so the fix does not blind the rule.
3. Prove it on the real page: run the fixed lint over a fresh read of the Goals page and put the exit code in the report. Read only; no write to any Notion page in this lane.
4. NOT in scope: any other lint rule, the decisions renderer, notion.js, the skill prose, a lint waiver flag.

## Build shape
Mid tier writes, Opus reviews on record, focused test then the full suite once on Windows and once on a second host (ask skills-n for a Netcup slot, one suite per machine). Own branch, own work record, record Status accepted with the Opus APPROVE sha and both suite results. Then the 2026-09-26 standing grant: merge into main with a merge commit carrying the closing bullet in docs/decisions/history/<NY day>.md. No install and no release in this lane; the lint runs from the checkout.

Every execution brief carries: if any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

## Deadline
On main by 10/1 12:00 PM NY so the 3:00 PM bearings publication lints clean. If it slips, say so and the read publishes past the two known false positives, with the block ids above cited.

## Received / acted
