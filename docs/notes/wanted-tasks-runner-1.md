DONE: 9 candidate tasks across 3 repos

Run 2026-10-05. Read-only. Commands: gh repo list (benzhuk plus orgs NightrushAI, Cadma-Capital-Partners, nucleusfilms), gh issue list on the 13 most recently pushed repos, local file search under Code, BTO and Zhuk Projects, git log --since=14.days on the 6 most recently committed local repos.

Key finding: all 13 checked repos have issues enabled and zero open issues. Wanted work lives in CLAUDE.md "Known gaps", TODO.md and docs files, not in GitHub Issues. Only hillstone has a clean, current, self-contained list.

Candidates (most recently active repo first)

| Repo | Task | Source | Size | Observable result |
|---|---|---|---|---|
| hillstone (local Zhuk Projects/hillstone) | Observer requests back off on a 429 storm, as the target polls already do | Zhuk Projects/hillstone/CLAUDE.md, "Known gaps", 2nd bullet | small | A unit test with a fake 429 stream passes; the observer log shows growing retry gaps instead of a fixed 10 s or 2 s cadence |
| hillstone | Fix burst windows landing one hour off on DST-change opening days (Nov 1 2026, Mar 8 2027) | Zhuk Projects/hillstone/CLAUDE.md, "Known gaps", 1st bullet | small to medium (4 to 8 h with tests) | A test for the Nov 1 2026 and Mar 8 2027 targets prints burst windows at 10:00 ET plus or minus 3 min instead of 09:00 or 11:00 |
| hillstone | Turn on the ntfy push and Google Calendar insert legs | Zhuk Projects/hillstone/CLAUDE.md, "Still pending on Ben" items 1 and 2 | small, but needs Ben's secrets and phone, so not delegable end to end | Service start logs `legs: ntfy=on gcal=on`; a test booking pushes to the phone and adds a calendar event |
| bto_nucleus (local BTO/bto_nucleus, remote nucleusfilms/bto-team-g2) | Label both axes on the film analysis page chart (value vs worldwide box office) | BTO/bto_nucleus/docs/experiment-film-analysis-page-todo.html line 125, flagged quick win, owner Ben | small | The projection chart shows axis titles; a Playwright screenshot confirms. Unverified whether already done (file dated 2026-06-18, tick state lives in Ben's browser) |
| bto_nucleus | Add RT and IMDb scores per film plus the comp-set median score to the comp table | same file, line 133, owner Ben | medium | Comp table gains score columns and a median row. Same staleness caveat |
| bto_nucleus | Consolidate remaining inline spacing, radius and motion values onto the new scale (Plan A) | BTO/bto_nucleus/docs/refactors/plan-a-design-tokens.md; codemods in scripts/codemods/ (plan-a-a2, a3, a4) | large | Before and after screenshot diff in chromium and webkit; inline fontSize count falls from 499 in src. Status unclear: the type ramp landed in globals.css (commit 6258eec8) but the 499 count suggests the migration is partial |
| bto_nucleus to bto-workflows | Prepared per-project detail row (project_detail_current) so project-detail stops its ~12-query fan-out | BTO/bto_nucleus/docs/handoffs/2026-07-29-warm-incident-and-prepared-row-roadmap.md section 2b | large, cross-repo, touches the shared DB | Post-deploy warm sweep issues one read per project; no DB wedges. Roadmap ask, marked not urgent, and owned by the bto-workflows side |
| nightrush-form (local nightrush/nightrush-form, remote NightrushAI/nightrush-form) | Add error message in each form section and block moving to the next section on invalid data | nightrush/nightrush-form/TODO.md, items 6 to 8 (Spanish) | medium | Submitting an invalid section shows an inline error and the Next button does not advance. Caveat: last local commit is 2025-10-24, TODO may be stale |
| nightrush-form | Add an image cropper to the picture upload | nightrush/nightrush-form/TODO.md, last item (Spanish) | medium | Choosing a picture opens a crop step before upload. Same staleness caveat |

In flight, last 14 days (not candidates, listed so the lead does not propose them)
- claude-delegation: the lead's own docs work (bet 2, lane 70, Agent Skills page, misfit list). 20+ commits.
- tdf: build K (thumbnail cards, date pills) merged and accepted 2026-10-01. The load-time layout shift noted in the seam findings was fixed in commit a049015.
- hillstone: schedule hardening and first live booking done 2026-09-30. Open question to Ben in docs/history.md: keep booking every Wednesday after Oct 7, next is Oct 14.
- raycast-join-meeting: extension shipped 2026-10-04, no open items found.
- bto_nucleus: Figma plugin real-projects swap for O4.1 frames (commit 7029041a).
- cook: /tdf proxy to the tdf Vercel project (commit 1d9f30e).

Not found (no open issues and no current backlog file)
- Zero issues and no backlog file: dotfiles, zhuk-infra, tdf, zhuk-cooks, bto-activations, bto-workflows (all benzhuk or nucleusfilms), and the Cadma-Capital-Partners repos data-interface, terraform, cadma-app, api-gateway, data-pipeline, agent. None of the Cadma repos are cloned under Code, so no local backlog could be checked.
- tdf has docs/superpowers/plans/2026-09-26-tdf-phase1.md with 74 unchecked boxes, but the work records show those phases built and accepted, so the boxes are not maintained. Not used.
- BTO/bto_team/.planning/ROADMAP.md shows phases 2 and 3 of the /description page as open, but git log has "docs(phase-4): complete phase execution — all phases done" and src/app/description/page.tsx exists. Stale, not used.
- No TODO, BACKLOG or ROADMAP files found for Zhuk Projects, charts, reserve or Streeteasy. The 12 most recently pushed repos did not include any nucleusfilms or NightrushAI repo apart from bto-activations, so those orgs' other repos were not scanned for issues.
