# Lane 40 release/install handoff (prepared read-only, 2026-09-30; nothing executed)

## Exact facts
- Reviewed source 80760b3; accepted 0edd4d93; main merge 4aa46f39 (history bullet in docs/decisions/history/2026-09-30.md: Windows 3069, Netcup 3095, zero failures).
- R2 live proof: 60 of 60 selected notes archived; publication dotfiles f9f0e11addf44cf48fe5aaf04065413f02954225 (live-proof-r2-report.md:65).
- Both fixed SSH hosts (Netcup, Hetzner) reached, exit 0. Mac endpoint is the sentinel `pending` (awaiting owner-provided ssh alias); still pending.
- Unresolved: 18 archive-origin rows (nine salvage filenames on each of the two hosts, "conflicting archive destination"; live-proof-r2-report.md:74).
- Recipe delivery (different from the scheduled sentence): dotfiles 0cf1c5d, two lines in triage SKILL.md, three hosts (publication-recipe-delivered.md).

## Authority
- Ben's tick, Sep 29 5:11 PM NY, recorded in install-authority.md (already recorded; do not ask again): "Yes, install when it lands, first run right away (recommended)". Cite it in the release item.
- Install rides the NEXT release (0.20.19 is the open item on Ben's page, unticked). Release word stays Ben's; the tick covers the triage task.
- Dependency: next release must ship lane 40 (merge 4aa46f39) before the installer exists in the plugin cache.

## Pending, NOT delivered
- One scheduled-run sentence in ~/.claude/skills/triage/SKILL.md and docs/windows-knowledge-update/README.md:5 (text: spec-r1-adjudication.md:65). Only planned/patch files carry it (rev3, scheduled-only.patch, release-install-prep); publication-recipe-final-handoff.md:9 says "no scheduled amendment". F11 also wants a fresh Opus delta first.
- First scheduler run is PENDING: nothing registered, no last-run.json from the scheduler (R2 was a manual run). A 60-note live run also confounds Lane 18's Oct 4 prediction (rev4.md:70).

## Order (rev4.md:25, F8)
1. Release update per host: `claude plugin marketplace update benzhuk`; `claude plugin update delegation@benzhuk`; `claude plugin list`.
2. Amendment: publish and remote-verify the sentence in both locations (rev3 lock procedure); record sha.
3. Installer (from installed cache copy on BEN-DESKTOP, Windows only, never from a worktree), preview: `node <cache>\scripts\install-janitor-timer.mjs --job knowledge-triage --dry-run --json`
4. Register disabled (PT2H, Enabled=false): `node <cache>\scripts\install-janitor-timer.mjs --job knowledge-triage`; then `schtasks /Create /TN knowledge-triage /XML %USERPROFILE%\.agents\knowledge-triage\knowledge-triage.task.xml /F`; `schtasks /Query /TN knowledge-triage /XML` (confirm Enabled false, PT2H, StartBoundary).
5. Enable: `schtasks /Change /TN knowledge-triage /ENABLE`; first run: `schtasks /Run /TN knowledge-triage`. (Bundled alternative `--enable` does Create, Query, Change, Run with no pause; the spec asks for stepwise.)

## Verify after install
- `type %USERPROFILE%\.agents\knowledge-triage\last-run.json` (quote it)
- `schtasks /Query /TN knowledge-triage /V /FO LIST`
- `node <cache>\scripts\knowledge-count.mjs`
- `node <cache>\scripts\wiring-check.mjs --line`

## Rollback / pause (existing)
`node <cache>\scripts\install-janitor-timer.mjs --job knowledge-triage --remove --enable`; pause with `~/.agents/no-knowledge-triage` or `~/.agents/ws-off`.

## Command verification (read from source, nothing executed; 2026-09-30)
Read scripts/install-janitor-timer.mjs on main 4aa46f39 and listed scripts/. Command semantics unchanged.
- `--dry-run`, `--json`, `--remove`, `--enable` are known boolean flags (line 510) and `--job` a known value flag (line 511); `--job knowledge-triage` is accepted (line 600). Without `--enable` the installer writes only the task XML and never shells out to schtasks (line 41); `schtasks /Create /TN knowledge-triage /XML <agentsDir>\knowledge-triage.task.xml /F` is its own first enable command (line 896), so step 4's separate Create matches it. With `--enable` it appends Query, Change /ENABLE, Run (lines 901-903, only inside the `if (triage)` branch, so for this job), matching the bundled alternative in step 5. `--remove --enable` maps to `schtasks /Delete /TN knowledge-triage /F` (line 906), matching Rollback. The `/XML` on step 4's Query is the handoff's own addition; the installer's own Query has none.
- Refusals that apply even to `--dry-run` (checked before any write): not run from an installed plugin root (line 757; matches "cache copy, never a worktree"); `scripts/knowledge-triage.mjs` missing from that root (line 803; the file exists in the repo); non-win32 host (line 661); writer host not found in the triage skill or not this host (lines 608-616, reads ~/.claude/skills/triage/SKILL.md via parseWriterHost). So the install is Windows, writer host only.
- Verify helpers: `scripts/knowledge-count.mjs` is the actual CLI (its header names knowledge-counts.mjs as the shared module it imports); `scripts/knowledge-counts.mjs` is that module, not a CLI. `scripts/wiring-check.mjs` exists and accepts `--line`. The verify step uses knowledge-count.mjs (singular), which is correct.
- Line numbers above were re-read against main 4aa46f39 on 2026-09-30 (510-511, 41, 896, 901-903, 906). Not verified: anything at runtime (no dry run, guard, env or config read).

## Boundaries
- Release item stays unticked and install pending; nothing was installed or registered.
- F11: a fresh Opus delta review is still required before the scheduled-run sentence is published.

Source: release-install-prep.md for the plan; the Command verification section above is from the installer source itself.
