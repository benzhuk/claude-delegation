# Lane five: the janitor is fed and measured, and it can no longer mistake a fresh worktree for a merged one

Written by skills-fable, 2026-09-25 evening, for whichever lane lead finishes first (skills-h on Hetzner or skills-n on Netcup; Claude, Opus, fresh session). Ben, Sep 25: "this project needs cleanup already, make it a key part of our plan, another component." The plugin already has `scripts/janitor.mjs` (815 lines, 1,410 lines of tests) and `skills/janitor/SKILL.md`; no record shows it was ever run on this project. This lane feeds the existing mechanism and gives it its measure. It adds no second cleaner.

Measure this lane moves: work lost or stalled (a leftover worktree or a branch nobody owns is stalled work; a live worktree removed by mistake is lost work) and the janitor's own drift numbers per host over time. Must not worsen: lead turns, Sonnet builds, Opus reviews, no new mechanism.

Base: origin/main at fbd7cf6 (0.20.9) or later. Branch `build/janitor-fed-1`, one worktree per builder, never the main checkout.

## Findings from the first report-only sweeps (Netcup and Hetzner, 2026-09-25 evening; Windows in `docs/work/evidence/janitor/2026-09-25-windows.md` when it lands)
- The janitor's "merged" test is `merge-base --is-ancestor <branch> origin/main` (`scripts/janitor.mjs:209,240`). A builder worktree cut from main minutes earlier has tip equal to main's tip, so it is "merged". On both hosts the live lanes' worktrees (`wt-one-launch-L1`, `wt-one-launch-L2`, `fresh-walk-1`, under ten minutes old) were reported merged; they escaped SAFE only because they were already dirty. A clean one would have been removed by `--apply`. The comment at `:382` treats unmerged or detached as "normal in-progress state"; tip-equals-main is also in-progress and is not treated so.
- The janitor sees local branches only. Merged build branches on origin (`build/loop-gates-1`, `build/census-complete-1` and `-C1`, `-C2`, `build/codex-parity-1`, `build/integrate-0925`, `release/0.20.8`, `release/0.20.9` once merged) accumulate with nothing to list them.
- The four drift numbers are printed and lost; no file, no trend. Rollout backups (`~/.agents/rollout-backups/delegation-02NN-*`, about 24 MB per host across seven snapshots) and `~/.agents/ws/*` (trial-0920 9.6 MB, handoff-0920) are outside its view and have no retention rule.
- The skill says it is not mirrored to Codex.
- Local-only unpushed branches on Netcup (`ws/territory-a..d`, Sep 20) are correctly JUDGMENT: never touch them; they go to Ben's page.

## Territory J1: the script (scripts/janitor.mjs, scripts/janitor.test.mjs, fixtures)
1. UNSTARTED class: a branch whose tip equals `origin/<main>`'s tip, or has zero commits not on `origin/<main>`, is never SAFE and never "merged" in the tables; it is reported under JUDGMENT as `unstarted (tip is main)` with its worktree's age. Pinned by a test that cuts a worktree from main and asserts it is not SAFE, clean or dirty.
2. Age floor: no worktree or branch younger than `--min-age-hours` (default 6) is SAFE, whatever else is true; reported with its age. Pinned by a test.
3. Remote class, report-only: `origin/*` branches whose tip is contained in `origin/<main>`, excluding protected names, listed under JUDGMENT as `remote branch merged into main` with the exact `git push origin --delete <name>` command a human would run. The janitor never runs it (its two destructive actions stay exactly two). Pinned by a test with a bare remote fixture.
4. `--record <dir>`: writes `<dir>/<YYYY-MM-DD>-<host>.json` with the four drift numbers, the SAFE and JUDGMENT counts, the base sha and the host name, and appends one line to `<dir>/drift.md` (date, host, four numbers). Deterministic apart from the timestamp; pinned by a test. Default `<dir>` when the flag is given bare: `docs/work/evidence/janitor/`.
5. Optional, only if under 60 lines: `--outside` lists the sizes and dates of `~/.agents/rollout-backups/*` and `~/.agents/ws/*` under JUDGMENT with a retention recommendation (keep the newest two backups). Report-only. If it costs more than 60 lines, it is a finding for later, not code.

## Territory J2: the skill and the mirror (skills/janitor/SKILL.md, scripts/mirror-shared-skills.mjs only as far as adding janitor to the mirrored set, its test)
1. The skill states the cadence: after every accepted build, the lane's integrator runs `janitor --record` and `janitor --apply` in that order and pastes the JUDGMENT table into the RESULT; once a day per host a Sonnet runner does the same from the main checkout; JUDGMENT goes to the owner's decisions page as ONE item with a recommendation per line, never as several. State the UNSTARTED class and the age floor in one sentence each.
2. Mirror the skill to `~/.agents/skills/janitor` like the others (the script is called by absolute plugin path; the mirrored copy is the skill text). If mirroring needs more than adding a name to a list, stop and report; do not restructure the mirror.
3. No README.md changelog edit; the RESULT carries the one-line entry. Nothing under skills/team-build/ (lane four owns it; the janitor stage of the one-launch is lane four's to add from this lane's flags, queued for its next round, not injected mid-round).

## Acceptance
- Sealed suite green on the branch. Opus reviewers per territory with `JUDGMENT:` lines; the J1 review's attack brief names the two past bug classes from the skill's own history (a symlinked parent walking through a root check; a registry line claiming created_by_tool) and asks the reviewer to try to make the new classes remove the wrong thing.
- Dogfood: run the new janitor with `--record` on the host you are on from the main checkout, in report mode, and commit the record file; run it with `--apply` only on your own build's leftovers after acceptance and show the before and after drift lines in the RESULT.
- Record `docs/work/wr-2026-09-25-janitor-fed.record.md`, `check-acceptance`, `accept --census`. Fresh lead session; three wakes to skills-fable at most; push on green; merge waits for Ben's word; no trailers; the git identity is never set by an agent.
