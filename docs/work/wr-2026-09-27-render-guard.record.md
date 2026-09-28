Work: wr-2026-09-27-render-guard
Scope: docs/specs/2026-09-27-render-guard.md@d15cf9e (origin/docs/lane-specs-0925)
Owner: skills-o
Status: closed
Authority: skills-fable ASK skills-fable-lane-28-1: build, review, live proof (a refused publish on the real page from an up-to-date main checkout, then a normal publish, and one local note-send refusal), merge on acceptance under the standing grant of 2026-09-26, closing bullet in docs/decisions/history in the merge commit. No release, chezmoi or install.
Artifact: build/render-guard-1@1a493e21cc2bc240bfe694ade4fdde64cb32d459
Worktree: build/render-guard-1
Evidence: docs/work/evidence/wr-2026-09-27-render-guard-review-r2.md
Next: accept, merge with the closing bullet, live proof from the main checkout (refused publish exit 7, normal publish, note-send refusal)
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T22:55:00Z
Base: 53a77f79943aca31bb03bdad1553ba923bb06c6c
Opened: 2026-09-27T22:52:57Z
Log: 2026-09-27T22:52:57Z owned skills-o pack at C:/Users/benzh/Code/render-guard/pack
Log: 2026-09-28T02:38:43Z stalled skills-o round-2 fix 1a493e2 pushed 23:11Z with Netcup 2488/2492 0 fail; the resumed Opus reviewer never wrote review-r2.md and the lead did not notice until skills-fable's status check at 02:38Z; fresh Opus reviewer launched 2026-09-28T02:38:43Z
Log: 2026-09-28T02:41:54Z delivered skills-o Sonnet builder, two rounds: 7db6691 (r1), 1a493e21cc2bc240bfe694ade4fdde64cb32d459 (r2); gate 626/626
Log: 2026-09-28T02:41:54Z reviewed skills-o Opus reviewer APPROVE 1a493e21cc2bc240bfe694ade4fdde64cb32d459 after Opus NEEDS_FIXES on 7db6691 (the CLI dry-run warning never reached stderr); Netcup 2488/2492 0 fail 4 skipped
Census: - leadTurns: 9
Census: - wallClockHours: 3.83
Census: - by-model: claude-opus-5-5=6428335, claude-sonnet-5=7427344
Census: - by-role: unassigned=8658314
Census: - subagentFiles: 70
Census: - Total assistant turns, deduped (whole file): **269**
Census: - Window assistant turns, deduped: **21**
Census: - leadTurns (conversational runs — see docs/census.md): **9**
Census: - Window: 2026-09-27T22:53:00.372Z .. 2026-09-28T02:42:48.610Z
Census: - Turns/hour in window: **5.48**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 538 | 2211667 | 43514314 | 154655 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 42 | 281459 | 4903841 | 12023 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 72 | 145800 | 1060208 | 24890 |
Census: | claude-sonnet-5 | 174 | 210333 | 7151644 | 65193 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 246 | 356133 | 8211852 | 90083 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 36913 | 6391422 |
Census: | claude-sonnet-5 | 65193 | 7362151 |
Four numbers: Top-tier tokens per build: unavailable (no census)
Four numbers: Hours ask to accepted: 3.8h; gap unavailable (no lead transcript)
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: gaps unavailable (no lead transcript); ASKs unavailable (no ledger dir)
Log: 2026-09-28T02:42:49.000Z accepted skills-o artifact 1a493e21cc2bc240bfe694ade4fdde64cb32d459
Log: 2026-09-28T02:52:15.000Z closed skills-o merge 1f6b74924d3deaebcef6c8ba3343ad2a63d1cde2

Observed: publish refuses a dirty docs/decisions tree with exit 7 before any write, including untracked files under status.showUntrackedFiles=no and renames on either side of last-render.md; --dry-run warns on stderr from the CLI; the note-send exit-6 hint names the ssh form and --local-ok. Open minor: the rename split applies to every status line (review-r2, fix in the report). The round-1 reviewer committed once in its own scratch repo with --no-gpg-sign, outside the reviewed tree.

Predicts: no page drift from an uncommitted source file again; the next publish with an uncommitted docs/decisions edit exits 7.
Log: 2026-09-28T02:52:21Z verified skills-o live proof on main 1f6b749: with session.md edited but not committed, publish exited 7 and the page read was byte-identical before and after. After commit 4fe1db8 the page published normally, retitled 9/27 10:51PM with a clean tree. A note-send to an unregistered slug refused with exitCode 6 and the new --sender-host hint, and wrote no ledger line.
