VERDICT: PASS

# Setup report — janitor-daily-1

## Worktrees created

All three cut from base sha `c25cc70cb180f22fc2f5ddb40a47be501cde9245` with
`git worktree add <worktree> -b <branch> c25cc70cb180f22fc2f5ddb40a47be501cde9245`, verified with
`git -C <worktree> rev-parse HEAD` immediately after each add:

| id | worktree | branch | headSha (verbatim `rev-parse HEAD`) |
|---|---|---|---|
| J1 | /home/ben/Code/claude-delegation-wt/wt-janitor-daily-1-J1 | build/janitor-daily-1-J1 | c25cc70cb180f22fc2f5ddb40a47be501cde9245 |
| J2 | /home/ben/Code/claude-delegation-wt/wt-janitor-daily-1-J2 | build/janitor-daily-1-J2 | c25cc70cb180f22fc2f5ddb40a47be501cde9245 |
| J3 | /home/ben/Code/claude-delegation-wt/wt-janitor-daily-1-J3 | build/janitor-daily-1-J3 | c25cc70cb180f22fc2f5ddb40a47be501cde9245 |

All three headSha match the given base sha exactly (fresh worktrees, no commits yet), read live off
`git rev-parse HEAD`, never copied from the prompt.

## Scout pass

One scout pass (done by this setup session itself, not a separate spawned agent, since the
computed task folded scouting into this same setup job) over the base tree at c25cc70, per
`skills/team-build/references/scout-brief.md`. One file per territory, each ≤40 lines, written to
`docs/specs/janitor-daily-1/briefs/scout-<id>.md`:
- `briefs/scout-J1.md` — confirms `--record`/`writeRecord` exist and work; confirms `--host` and
  `~/.agents/janitor-repo` are brand-new (no prior convention); names `isDurablePath` in
  `scripts/mirror-shared-skills.mjs:691-701` and its refusal call site (710-730) as the pattern J1
  should mirror, and flags that this pattern will correctly treat J1's OWN worktree path as
  non-durable.
- `briefs/scout-J2.md` — confirms `wiring-check.mjs`'s always-`return 0` CLI and the 9-check default
  list (2 `file_fresh`, 1 `env_presence`, 6 `switch`, 0 `hook_present`/`json_value`/`file_exists`
  today); confirms the `hook_present`/`hook_absent` evaluator code already exists and is tested but
  unused; raises two open questions — the exact PostToolUse hook identity (`hooks/multi-inbox.js`,
  not a file literally named note-inbox) and which file a live host's plugin hooks actually
  materialize into, since `hooks/hooks.json` ships inside the plugin bundle rather than a per-user
  settings file.
- `briefs/scout-J3.md` — confirms no dedicated release-checklist doc exists; recommends README.md's
  `## Install (mirror for Codex)` section (225-233) as the spec's own named fallback; flags an open
  question (out of J3's charge) about whether `docs/GOALS.md:92`'s already-stale "wiring check
  cannot go red" status prose should also change — left for the lead to rule on, not decided here.

## Briefs written

All six briefs written from the mandate template at `docs/mandate-template.md`, filling every
bracket, each brief's Inputs section pointing by path at spec.md, contracts.md, and (for J1/J2/J3)
that territory's own scout file — never restating their content inline:
- `docs/specs/janitor-daily-1/briefs/J1.md`
- `docs/specs/janitor-daily-1/briefs/J2.md`
- `docs/specs/janitor-daily-1/briefs/J3.md`
- `docs/specs/janitor-daily-1/briefs/reviewer.md` (one shared reviewer mandate, parameterized by
  territory id/round — attack brief written per-territory inside it, matching the spec's own
  Acceptance section's named attack surface almost verbatim)
- `docs/specs/janitor-daily-1/briefs/integrator.md` (full-suite gate `node scripts/run-tests.mjs`,
  integration worktree /home/ben/Code/claude-delegation-wt/janitor-daily-base, branch
  build/janitor-daily-1, as named in the computed task)
- `docs/specs/janitor-daily-1/briefs/seam.md` (J1/J2 seam only — J3 has no seam; scoped to the
  pinned "Seam contract between J1 and J2" section of contracts.md, with the four
  `last-run.log` states as an explicit live check list; marked `JUDGMENT: seam contract compliance,
  byte-exact` for opus-tier spawn per the dispatch-guard requirement)

Report/gate/state-file paths for all builder and review roles are anchored under
`/home/ben/Code/claude-delegation-wt/janitor-daily-base/docs/specs/janitor-daily-1/reports/` (a
directory I created since it did not exist), following the `<report-dir>/<territory>-*` shape the
mandate template names.

## Discrepancy noted, not resolved (out of this job's scope)

`docs/work/wr-2026-09-27-janitor-daily.record.md` already exists on the integration branch
(`build/janitor-daily-1`, HEAD `14178b3`) with `Status: owned`, `Owner: skills-h`, and a `Log:` line
claiming a build loop `wf_fb234b53-e8c` was already "launched... (setup mode, J1 J2 J3 all in
flight...)" at `2026-09-27T12:01:12Z`. Its `Lead-session:` field names this exact session id
(`ad389ae1-f992-4dd3-8a19-2b51176675c1`). On disk, however, no J1/J2/J3 worktree existed before this
job ran (verified: `/home/ben/Code/claude-delegation-wt/` held only `janitor-daily-base` before this
job's `git worktree add` calls), and no brief existed before this job wrote them. I did not touch
`docs/work/wr-2026-09-27-janitor-daily.record.md` — per contracts.md's territory map, `docs/work/*`
is "Nobody" territory in this lane (the lead's alone), and this setup job's brief doesn't authorize
editing it. Flagging this so whoever owns that record next reconciles its claimed prior state with
what's actually now on disk (freshly created worktrees/briefs, not a loop already in flight).

## What was NOT done (out of this job's explicit scope)

No builder, reviewer, integrator, or seam agent was spawned. No code was written to any territory
worktree. No work record was opened or edited. This job's scope was: create the three territory
worktrees, scout every territory, and write all six briefs — all done, all verified on disk.
