# Working smarter, v2 (after the Opus red-team: RESTRUCTURE accepted)

Supersedes `2026-09-20-working-smarter.md`. Red-team report and the two research syntheses are the prior-art record
for this build (paths in the orchestrator's scratchpad; verdicts: no Obsidian, Notion stays, goals shrink to a record,
issue log = one markdown file per issue with a derived index). Owner's scope: every project, every machine, every agent.

## Phase 1 (this build): three builders, NO new global hook, everything mechanical
Failures addressed: (1) a second engine built with nobody searching the first engine's issue tracker; (2) mechanisms
stacked on symptoms; (3) reports describing intent not state; (5) decisions stalled and links lost; (6) cleanup owned
by nobody. Failure (4), idle orchestrators, is phase 2: an external timer, never a Stop hook.

### Orchestrator owns at t0 (builders must not edit these)
`contracts/**`, `scripts/project-config.mjs`, `package.json`, `hooks/hooks.json`, the arrays in
`scripts/mirror-shared-skills.mjs`, `.claude-plugin/plugin.json` + `marketplace.json` version bump, `README.md`.
A builder that needs a line in one of these writes it in its report under "INTEGRATION LINES"; the orchestrator applies.

### Pinned rules for every script in this build
- Tests: `node --test` (package.json `npm test`). Every script ships a `*.test.mjs` beside it.
- Exit codes: 0 ok, 1 finding, 3 blind (cannot see). NEVER 2: both harnesses read hook exit 2 as BLOCK. A test asserts it.
- Fail open: a crash, a timeout or unreadable state is exit 0 and silent. Tested.
- Kill switches are FILES, not env vars: `~/.agents/ws-off` (master) and `~/.agents/ws-off-<name>`. Precedent:
  `~/.agents/notes/no-type`. Present = the feature does nothing.
- Project config is read ONLY through `scripts/project-config.mjs` (`contracts/project.schema.json`). `vcs: "none"`
  projects make git-dependent scripts exit 0 silent.
- No network calls. No MCP. Nothing project-specific (no "generation", no BTO names).
- Subagents never see hooks: every rule that must reach a builder, reviewer or integrator lives in the mandate docs.

### Territory A — verification and prior art (Sonnet builder, Opus reviewer)
Files: `skills/team-build/SKILL.md`, `skills/delegate/SKILL.md`, `docs/mandate-standards.md`, `docs/subagent-contract.md`,
`docs/model-tiers.md` (research tiers only), NEW `docs/research-ladder.md`, NEW `docs/merge-ask-template.md`,
NEW `agents/researcher.md`, NEW `templates/research-report.md`.
1. team-build Setup gains **step 0, prior art**: before a spec is written, a research report exists on disk answering
   the zoom-out questions (what is this component's job; who else has this job and what do they use; are we on a
   supported path; what would we delete) AND "search the upstream issue tracker for the exact symptom". No report, no spec.
   The spec red-team brief gains "should this exist in this shape; what is the smallest subset".
2. delegate gains the **third-fix rule**: a third fix round on one defect class stops and runs a research lane first.
3. `docs/research-ladder.md`: Sonnet lanes one per source class (official docs, issue trackers, practitioner write-ups,
   alternatives); Haiku only fetches and quotes pages a Sonnet lane found; an Opus skeptic refutes and spot-checks
   sources by fetching them; the top session decides. Cost tiers: a small change gets ONE lane in a fixed time box;
   a mechanism or a new project gets the full ladder. Reports follow `templates/research-report.md` (verdict line 1).
4. **State over intent** in the subagent contract and mandate standards: a result names the command that observed it
   and its output; a reviewer verifies against origin and the running bytes, never against the report; "pushed" means
   `git rev-parse origin/<branch>` was read; "deployed" means the running version was read.
5. `docs/merge-ask-template.md`: branch, tip, review verdict with reviewer tier, gate line, `Adds:` / `Deletes:`
   (what we must now maintain, what goes away), `Research:` report id or `none-needed: why`, cleanup done (worktree,
   scratch). Definition of done in team-build includes cleanup.

### Territory B — janitor (Sonnet builder, Opus reviewer)
Files: NEW `skills/janitor/SKILL.md`, NEW `scripts/janitor.mjs` + test, NEW `scripts/commit-check.mjs` + test,
NEW `scripts/artifact-registry.mjs` + test.
- Registry line per `contracts/artifact.schema.json`. Kinds: worktree | branch | scratch | packet | state | other.
- `janitor.mjs` prints a dry-run table in two classes and five drift numbers (disk, worktrees, open branches,
  untracked files, registry entries past their end condition). `--apply` touches ONLY the safe class:
  `git worktree prune`, removal of clean worktrees whose branch is merged, deletion of merged local branches, and
  paths the registry says this tool created. The judgment class NEVER executes unattended. It never runs
  `git clean`, never force-pushes, never `rm -rf` a path it did not create. It is never chained onto productive work.
- `commit-check.mjs` refuses scratch and temp packets by pattern from project config. It is a script a project MAY
  wire into its own pre-commit; this build wires it nowhere.

### Territory C — decisions, one file (Sonnet builder, Opus reviewer)
Files: NEW `skills/decisions/SKILL.md`, NEW `scripts/open-decisions.mjs` + test, `skills/multi/SKILL.md` (send-up rule
section only), `hooks/multi-hook-core.mjs` (ONE addition: the footer line).
- State file `~/.agents/decisions/open.json` per `contracts/decision.schema.json`; atomic write (temp + rename),
  per-record files under `~/.agents/decisions/records/` if concurrent writers make one file unsafe; stale rule and GC.
- CLI: `open-decisions.mjs add|answer|default|close|list|footer`. `footer` prints one line:
  `Decisions waiting: <n> — <url>` or nothing.
- The footer is ONE `systemMessage` line emitted by the EXISTING Stop hook path in `multi-hook-core.mjs`, never a new
  hook process, never a block, silent when the switch file exists or nothing is open.
- Skill rules: sub-sessions never block on the owner, they send decisions up; the top session batches simple ones as
  ONE multiple-choice call only after everything dispatchable is dispatched; reversible decisions carry a default and
  a deadline; complex decisions go to a decision doc with an append-only answer section; the owner's page is never
  replaced wholesale.

## Phase 2 (after phase 1 has run a week; separate builds)
An external idle watcher (timer that reads panes and the waiting board, posts to the owner's inbox); the goals record
(two levels, checked at project start and on mechanism-adding merges) if the owner confirms; AGENTS.md migration with a
parity map; the per-project issue log (one markdown file per issue, derived index) after its research ruling.

## Rollout
Branch `feat/working-smarter`. Merged hooks stay OFF behind `~/.agents/ws-off` for a week. Rollback = reinstall the
pinned prior plugin version + `touch ~/.agents/ws-off`, which needs no working session. Codex: the footer rides the
existing multi hook, which the mirror script already installs and pre-trusts; nothing else in phase 1 is a hook.
