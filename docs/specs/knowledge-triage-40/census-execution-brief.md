Task: Execute the prepared Codex build census, Claude spec slice and four-number read for lane40, then run read-only strict acceptance check and refresh the main merge preview. Root performs acceptance and all record writes.
Work: wr-2026-09-29-knowledge-triage.
Goal: Preserve truthful cost, time, rework and stalled-work evidence including failed rounds.
Inputs: closeout-prep-r2.md and closeout-prep-ruling.md (corrected instructions override r1), publication-recipe-delivered.md, ../../work/wr-2026-09-29-knowledge-triage.record.md, acceptance-window.json in this directory, docs/census.md and actual CLI parsers if needed. Do not follow stale merge/release steps in r1.

Pinned source:80760b3bea59b8d8641537b1ae3749388f13f575. Record now reviewed; independent approval and host suites still valid, original R2 FAIL retained alongside later clarified PASS and delivered recipe. No R3.

Use the exact acceptAt from acceptance-window.json for build --to, four-read --accept-at and the reported acceptance handoff. Census from Opened2026-09-29T19:17:00Z. Codex lead01a0df4c-2809-7520-b1d7-876cc51a87ee and home C:/Users/benzh/AppData/Roaming/orca/codex-accounts/f22a4cc4-fb5a-4af5-aeec-4951188a536a/home. Must use --lead-session and --codex-home, not legacy --lead. Ledger C:/Users/benzh/Code/claude-delegation/docs/ledger, slugskills-a. Spec-session9c61c35a-82dd-4aef-8eca-c99bb0e72e31, from2026-09-29T19:15:53Z to2026-09-29T19:17:00Z, transcript path in closeout-prep.md section3.

Outputs exactly:
- docs/work/evidence/wr-2026-09-29-knowledge-triage.census.json and .census.md
- same prefix .spec-census.json and .spec-census.md
- same prefix .four-read.json and .four-read.md
- docs/specs/knowledge-triage-40/census-execution-report.md

Run existing supported census/four-read CLIs, no source changes or waiver flags. COUNTED/PARTIAL and UNSUPPORTED must remain verbatim. Unknown is never zero. Native graph excludes shell-launched Claude reviewers/builders/live sessions: explicitly list that limitation. Use existing identity/report usage to provide a clearly labeled supplemental table if practical, without claiming completeness, summing incompatible metrics or merging it into the native census. Do not invent graph ancestry. Count failed rounds by preserving the full build window.

Read-only checks: strict work-record check-acceptance with pinned artifact, census and four-read and same accept timestamp as supported; no accept command. Fetch current origin/main in integration checkout and run one merge-tree preview. Read canonical main checkout C:/Users/benzh/Code/claude-delegation git status (no edits) to flag other-owned changes; source diff against approved80760b3 should be empty under scripts and skills. No conflict resolution or integration.

NOT: no work record edits, accept/close, commit/push/main mutation, suite, SSH, triage, schedule, release, cleanup, Notion, secrets/config reads, raw transcript printing, guard replay or source fixes. Existing census may parse its supported structured logs, but no conversational payload is printed or copied. If a guard refuses, stop that operation without reroute. If census fails due evidence, report exact error and any narrow missing input, do not patch the owner tool or manufacture an end witness.

Report: VERDICT: READY or BLOCKED, literal census verdicts, four cells and limitations, exact paths, acceptAt, strict-check exit, main SHA/preview outcome and dirty-state boundary. Keep concise. If the timestamp freshness check expires, report it; root selects a new measured timestamp, not a guessed future one.
ETA: 6 minutes, report completed parts and real blockers by then. Termination: write report and stop; no peer wait.
