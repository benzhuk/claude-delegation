Work: wr-2026-09-29-four-read-json
Scope: the spec section of this record (lane 54), from packet docs/notes/skills-fable-lane-53-1.md "Queued behind it: lane 54" read at 7ab59db
Owner: skills-n
Status: delivered
Authority: build, review, integrate, push build/four-read-json-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; rerun build-census and four-read read-only against lead transcripts and merged records; no release, no install
Next: Opus delta review r2 of 63996a6 and the Windows suite, then accept, merge, publish, close, RESULT
Worktree: build/four-read-json-1
Scratch: /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-54
Opened: 2026-09-29T02:24:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-29T02:04:06Z
Base: 7ab59dbd496c062f1cbb8eb259dd5a95aa9f9088
Log: 2026-09-29T02:24:05.000Z owned skills-n picked up lane 54 from the skills-fable-lane-53-1 packet while lane 53 waits on two decisions (disjoint territory); small lane, spec written by the lead, no spec red-team; Sonnet builder spawned
Log: 2026-09-29T02:35:51.000Z delivered skills-n Sonnet builder DONE 02c2535, report 48c879b (four-read refuses a non-JSON census with exit 2, 10 new tests, four-read suites 117 pass, full suite 2928 pass 0 fail; lanes 42, 43, 44, 46, 47 rerun with the census JSON, no lane 45 record); Opus code review and Windows suite started
Log: 2026-09-29T02:41:28.000Z rejected skills-n Opus code review by a04896a79a9e5e130 NEEDS_FIXES (4) 84e643e (F-1 the gate requires stallNudges and refuses 34 of 40 committed older census JSONs, F-2 --spec-census markdown still silent, F-3 appendix cells drop two unavailable parts, F-4 lead check untested); all four adopted, F-2 in scope; Windows suite at 84e643e 2918 pass, 1 fail the hooks/codex-unsupported load flake, 13 of 13 twice alone; fresh builder spawned
Log: 2026-09-29T02:48:03.000Z delivered skills-n fresh Sonnet fix round 1 builder DONE b13f448 and 63996a6, report eb2a2af (F-1 to F-4 applied, each new test red first, four-read suites 119 pass, full suite 2930 pass 0 fail); same Opus reviewer resumed for delta r2, Windows suite started

## Spec (lead, from the packet)

Measure: work lost or stalled, and the census's own reliability. The records of lanes 42 to 47 show blank gap and stall cells, because scripts/four-read.mjs was handed the census markdown and silently read it as "no census" (docs/reports/census-0928/four-read.md, the paragraph beginning "Finding 4b is wrong"). A check that passes because it isn't looking. Must not worsen: every existing four-read and accept test.

F1. `scripts/four-read.mjs --census <path>` refuses any input that is not build-census `--json` output. Refusing means:
- a stderr message naming the flag and the fix: "four-read: --census must be the build-census --json data file, not the census markdown";
- exit 2, before any output file is written.

The test for "is it the JSON" is a successful JSON.parse plus the top-level shape build-census writes (the builder names the exact keys, with file:line in build-census.mjs). A missing file keeps whatever four-read does today, if that is already loud; if it is silent, it also exits 2.

F2. Callers. Find every place that hands four-read a census path: scripts, skills/*/references, docs that show the command (docs/census.md, skills/team-build/SKILL.md, docs/work-record.md). Any one showing or passing the markdown is corrected to pass the `--json` file. The builder lists each with file:line in the report. A doc that already shows the JSON is left alone.

F3. Tests: a unit test red at the base on markdown input (today silent and exit 0) and green after (exit 2 with the message). A JSON input keeps passing. The existing four-read suites pass.

F4. The reruns. For each lane record among lanes 42, 43, 44, 46 and 47 on main (the builder maps the lane numbers to wr-2026-09-28-* records from their Log lines and titles, and says which lane 45 is, if any):
- regenerate its census JSON with build-census.mjs `--lead <that lane's lead transcript>`, `--from <record Opened>` and `--to <the record's accepted Log time>`. Lead transcripts on this host are under ~/.claude/projects/-home-ben-Code-claude-delegation/<Lead-session>.jsonl;
- rerun four-read with that JSON against the record as merged on main.
The gap and stall cells then go as one appendix line per lane in docs/reports/census-0928/four-read.md, under a new "## Appendix: lanes 42 to 47 rerun with the census JSON (lane 54)" heading at the end. Nothing else in that report changes. If a lead transcript is missing or a rerun fails, the line says so with the error, never a blank.

Territory:
- scripts/four-read.mjs and its test file(s);
- the caller corrections F2 finds, one line each;
- docs/reports/census-0928/four-read.md, the appendix only.

NOT scripts/build-census.mjs, docs/GOALS.md, or any record's own body.
