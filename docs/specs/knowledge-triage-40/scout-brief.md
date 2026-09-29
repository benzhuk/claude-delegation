Task: Survey Lane40 territories and the mandatory nested triage probe prerequisites. Do not implement.
Goal: Feed the existing knowledge triage mechanism without losing or duplicating notes.
Work: wr-2026-09-29-knowledge-triage
Inputs: docs/specs/knowledge-triage-40/territories.md, rev3.md, rev4-intake.md; scripts/install-janitor-timer.mjs and tests, scripts/knowledge-counts.mjs and tests; live C:/Users/benzh/.claude/skills/triage/SKILL.md.
PROJECT FACTS: Windows, Node builtin tests. Base e142f9a. Claude user guards must remain enabled. No identity changes. User permission denials stop the step, never work around a refusal. Existing review-run runs Claude directly and has no --via flag.
NOT: no production, work-record, hooks, live knowledge, remote, git or scheduler mutations. Do not run a nested Claude, suite or triage yet. Do not read credential values. Read only relevant hooks/settings commands and permission rules, never auth/token/env values.
Evidence: file:line sources, at most 40 lines per territory. Identify reusable helpers, inaccurate premises, exact installed CLI probe candidates and how to isolate scratch knowledge/publication without changing live settings. Identify Mac alias only from SSH Host/HostName/User lines without dumping other configuration.
Report: docs/specs/knowledge-triage-40/scout-T1.md, scout-T2.md, scout-T3.md. First line VERDICT: READY or BLOCKED. No executive narrative.
Autonomy: read-only survey, write these three reports only. No subdelegation.
ETA: 10 minutes. On any permission/guard refusal stop the denied step and report it without changing tools or permission mode.
Termination: write the reports and stop.
