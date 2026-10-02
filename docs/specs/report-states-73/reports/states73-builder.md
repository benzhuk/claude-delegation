VERDICT: PASS

# states73 builder report (lane 73, wr-2026-10-01-report-states)

Branch build/report-states-73-states73, HEAD 658efde1634b5e9dc77f718afa3076f3eb37a9c8 (base 7233aa7f). Serves the GOAL line "work lost or stalled"; nearest NOT: "a rule no script checks" (each rule below is checked by a script).

## Gate
`node --test scripts/report-check.test.mjs scripts/work-record*.test.mjs scripts/record-closed-and-skip.contract.test.mjs scripts/work-census.test.mjs hooks/backlog-notice.test.mjs agents/agents.test.mjs skills/decisions/scripts/*.test.mjs skills/notion-writing/scripts/*.test.mjs` -> exit 0, 1132 tests, 1132 pass, 0 fail (log: reports/states73-gate.log). No full suite run (Windows; the lead's Netcup/Hetzner step). Extra consumer check, exit 0: collect-status, collect-from-origin, four-read, team-build references tests, 348 of 348.

## The five items
1. Report contract and check. scripts/report-check.mjs (new, modelled on bugfix-fields.mjs; exit 0/1 naming what is missing): line 1 is DONE | NEEDS BEN: x | NEEDS <peer slug>: x | FAILED: x, ending `(<n> of <m> steps done)` (parentheses optional; DONE needs n = m; n <= m); PARTIAL and VERDICT lines are refused with a message; line 2 `Now: .. | To finish: .. | Est: ..` is required for anything not DONE (report-check.mjs parseFirstLine, checkReport). Contract text: docs/subagent-contract.md (first-line paragraph, both report kinds named once). Tests in scripts/report-check.test.mjs: "PARTIAL is refused", "a report missing line 2 is refused", "line 2 with a field absent or empty is refused", "a first line without the steps phrase is refused", "DONE with fewer steps done than total is refused", "NEEDS BEN, NEEDS <peer slug> and FAILED each pass", "owner spelling and peer slug shape". Fixtures: scripts/fixtures/report-states-73/ (10 files). 15 tests in the file, exit 0.
2. Lane-record words and Now line. scripts/work-record.mjs: LANE_STATUS_WORDS, GATE_STATUS_WORDS, isLaneStatusWord, isKnownStatus, checkProgressLine, PROGRESS_LINE_FROM; a `Now` header label (FIELD_LABELS, field `progress`); validateRecord accepts the new words and reports a missing or malformed Now line as `missing-field`; requireStrictRecordShape (used by accept and check-acceptance) refuses a word outside the gate set (`status-word-refused`) and a missing Now line (`progress-line-missing`); checkMergeReady refuses any word outside the set (`status-word-refused`). Tests: scripts/work-record-states73.test.mjs, 11 tests (for example "accept: refuses a Status word outside the allowed set", "merge-check: refuses every Status word but accepted", "existing records on disk still parse and none gains a bad-status or Now: finding" over every docs/work record). STATUSES stays 9 and FINDING_CODES stays 17 (existing assertions untouched). docs/work-record.md updated (Status row, meanings, Now section, bad-status row).
3. Renderer. skills/decisions/scripts/decisions-render-core.mjs: checkWaitingProgressLine (called beside checkWaitingItem in buildWaitingSection; the line must be the first line under `<summary>`, tab-indented, exact shape, 200 characters at most; the refusal names file:line) and checkSessionProgress (a session bullet that begins "In progress" must carry the line; runs after the existing 8-bullet and 200-char checks, which count the fields). Tests: skills/decisions/scripts/decisions-render-progress.test.mjs, 7 tests; fixtures skills/decisions/scripts/fixtures/progress-73/ (with line, without line, two fields, session with and without). Two existing fixtures (GOOD_ITEM in decisions-render.test.mjs, waitingItem in decisions-render-publish.test.mjs) gained the line, one line each. Template skills/decisions/templates/decision-item.md and skills/decisions/SKILL.md updated.
4. Hook card reference. docs/components.md comment header only: `<name>: Now: <one line> | To finish: <one line> | Est: <duration>` plus the finished-component line. Test: report-check.test.mjs "item 4".
5. Briefs. skills/team-build/SKILL.md and skills/delegate/SKILL.md each state "First-line rule:" once. Test: report-check.test.mjs "item 5 ... exactly once each". docs/mandate-template.md termination line notes both kinds.

## Readings taken (scout section 4)
1. Progress reports only (runner, lead, long-running). Reviewer, integrator and seam reports keep `VERDICT:`; stated once in docs/subagent-contract.md. agents/*.md and the build-loop prompts are untouched.
2. New scripts/report-check.mjs, not an extension of bugfix-fields.mjs.
3. Old words stay readable (STATUSES unchanged, 9). New words added. `reviewed` stays allowed at the accept and merge-check gate because accept consumes it; accept still needs `reviewed`, merge-check still needs `accepted`. Gate set = open, NEEDS BEN, NEEDS <peer slug>, FAILED, accepted, closed, reviewed; any other word is refused with `status-word-refused`. Old pre-accept words (owned, delivered, and so on) were never accept-able and are still refused at the gate. No record was rewritten.
4. validateRecord's bad-status accepts old and new words (no cutoff needed). Only the Now-line requirement is date-gated, by PROGRESS_LINE_FROM = 2026-10-02T04:00:00Z (midnight New York after lane 73's merge day), for non-terminal records only; an unparseable Opened fires, as with ACCEPTED_WITHOUT_CHECK_CUTOFF. A Now line that is present must always be well formed. Lane 73's own record (Opened 00:50Z, Status owned) is grandfathered.
5. Waiting item: the first tab-indented line under `<summary>`. Session: each bullet beginning "In progress". A missing line is a refusal naming file and line.
6. Item 4 lives in the docs/components.md header comment.
7. `<n> of <m> steps done` ends the line, parentheses optional; DONE also carries it, with n = m.
Not decided: accept does not rewrite the Now line when it flips reviewed to accepted (an accepted record is exempt from the check, so a stale Now on it is harmless to the gate).

## Consumers (not edited)
hooks/backlog-notice.js classify() counts a record whose Status is outside parser.STATUSES (for example `open`, `NEEDS BEN`) as malformed: one stderr note, not counted in the printed line, no throw. work-census, collect-status, four-read and collect-from-origin tests pass unchanged. No test of mine proves a break, so none was edited. The lead may want STATUSES widened to silence that note once the first `open` record exists.

## Lead action needed
The six live waiting items in docs/decisions/waiting/*.md (decision-classes, goal-card-v6-diff, janitor-policy, quality-measure, release-0-20-20, simplification-lane) lack the line, so the renderer now refuses them (verified: "waiting/<f>:3 lacks the line directly under the title"). Add a tab-indented `Now: .. | To finish: .. | Est: ..` under each `<summary>` before the next publish. The live session.md already passes.

## Files touched
docs/subagent-contract.md, docs/mandate-template.md, docs/work-record.md, docs/components.md (header), scripts/report-check.mjs (new), scripts/report-check.test.mjs (new), scripts/work-record.mjs, scripts/work-record-states73.test.mjs (new), scripts/fixtures/report-states-73/* (10 new), skills/team-build/SKILL.md, skills/delegate/SKILL.md, skills/decisions/SKILL.md, skills/decisions/templates/decision-item.md, skills/decisions/scripts/decisions-render-core.mjs, skills/decisions/scripts/decisions-render-progress.test.mjs (new), decisions-render.test.mjs and decisions-render-publish.test.mjs (one fixture line each), skills/decisions/scripts/fixtures/progress-73/* (5 new). Four commits on the branch, nothing pushed, no scratch files created.

## Fix round 2 (reviewer r1 findings), commit 0c7b14fec626fd432b3c4e90cf4a1cae09f341cd

Gate: exit 0, tests 1136, pass 1136, fail 0 (states73-gate.log; round 1 was 1132, plus 4 new tests).

Applied:
- M1: the VERDICT group is now "reviewer, integrator, seam, builder or suite/census runner (every build-loop worker, anything that can be listed as Evidence:)"; the progress group is "a status report on a long-running thing, never an Evidence: file". Same change in docs/subagent-contract.md, skills/team-build/SKILL.md, skills/delegate/SKILL.md, docs/mandate-template.md; anchor regexes in scripts/report-check.test.mjs updated, "First-line rule:" still once per skill.
- m1: scripts/report-check.mjs names the absent label ("line 2 lacks Est:"); empty field keeps the old message. Test added.
- m2: pipe refused in Now and To finish in report-check.mjs parseProgressLine and decisions-render-core.mjs isProgressLine. Tests added in report-check.test.mjs and decisions-render-progress.test.mjs.
- m3: scripts/work-record.mjs isLaneStatusWord refuses "NEEDS ben"; added to the bad list in work-record-states73.test.mjs.
- m4: checkWaitingProgressLine loops over every <summary>; two-item test added (second item refused at its own line).
- m6 (hook only): hooks/backlog-notice.js classify takes parser.isKnownStatus, so open / NEEDS BEN / NEEDS <peer> / FAILED are no longer counted malformed. Proof: classify on those words gave malformed 3 before, 0 after; test added in hooks/backlog-notice.test.mjs. collect-from-origin computeState mapping left alone (lifecycle decision).
- m8: delegate/SKILL.md qualifies the script path "in the claude-delegation checkout".

Not changed (lead's calls, as the reviewer listed): m5 (non-"In progress" bullets), m7 (withdraw from new words), m9 (merge-day hazards, Log grammar).
