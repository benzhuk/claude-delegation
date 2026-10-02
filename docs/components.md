<!--
Components of the delegation plugin, one line each. Source of the Components toggle on the
decisions page: the renderer reads this file on every publish and never invents a line.
Line shape: - name | what it does for the goal | state | `path`, `path`
State words (exactly one per line):
  fed      shipped, and something consumes its output
  measured shipped, and a number is read from it
  unfed    shipped, and nothing consumes it
  partial  some of it shipped, a named part is not
  missing  no component exists yet
Every backticked path under skills/, scripts/ or hooks/ must exist on main; the renderer refuses
to publish otherwise. The continue skill is retired and is not listed. The build loop is the only
route for a build. Brought current to main after lanes 64 to 68b. Source map: the 9/28 component
map, section A.
-->
- Goal card and goals file | Puts the goal and its four measures in front of every session | fed | `docs/GOALS.md`, `docs/goals/card.md`, `scripts/goal-card.mjs`, `hooks/lib/goal-context.mjs`
- Goals page mirror | Shows Ben the goal, its state and the card where he reads | fed | `skills/decisions/scripts/goals-mirror.mjs`
- Work records | Keep each lane's state, owner and evidence so nothing is lost between sessions | measured | `scripts/work-record.mjs`, `scripts/work-census.mjs`
- Evidence and accept gate | Refuses to accept work without an independent review of the exact artifact | fed | `skills/team-build/references/accept-prep.mjs`
- Sealed tests | Run suites in a private home so a test cannot stall or fill the machine | measured | `scripts/run-tests.mjs`, `scripts/test-home.mjs`
- delegate | Fans research and review lanes out to parallel subagents | fed | `skills/delegate/`
- team-build and the build loop | The only route a build takes from spec to accepted | measured | `skills/team-build/`, `skills/team-build/references/build-loop-workflow.js`
- multi | Notes and a ledger between sessions and hosts, so asks are not lost | fed | `skills/multi/`, `hooks/multi-inbox.js`, `hooks/multi-codex-hook.mjs`
- Note flusher | Wakes a session that has a waiting note, once a minute | fed | `skills/multi/scripts/note-flush.mjs`
- Decisions page | Puts what only Ben can decide, and the goal, bearings and components, where he reads | fed | `skills/decisions/`, `skills/decisions/scripts/decisions-render.mjs`
- Done-tick pickup | Picks up Ben's ticks and comments so his answers are acted on | fed | `skills/decisions/scripts/decisions-pickup.mjs`
- bearings | Checks progress toward the goal and returns CONTINUE, RE-PLAN or CUT with a dated prediction | measured | `skills/bearings/`, `skills/bearings/scripts/bearings-state.mjs`
- janitor | Reports stale worktrees and branches and removes only the safe ones | partial | `skills/janitor/`, `scripts/janitor.mjs`
- notion-writing and page-lint | Keep Notion pages in the shape Ben reads and check them by script | fed | `skills/notion-writing/`, `skills/notion-writing/scripts/page-lint.mjs`
- dev-server | Starts and stops local servers so none is lost or collides | unfed | `skills/dev-server/`
- Agent roles | Builder, integrator, reviewer and runner definitions for each host | measured | `agents/builder.md`
- Shared docs | Model tiers, subagent contract, pacing and mandates that briefs cite | partial | `docs/model-tiers.md`, `docs/subagent-contract.md`
- Pane setup | A pane layout for running many sessions at once | unfed | `docs/pane-setup.md`
- Delegation reminder | Reminds a session to delegate at start and on each prompt | fed | `hooks/delegation-reminder.js`
- Agent dispatch guard | Checks a dispatch against the size and tier rules | fed | `hooks/agent-dispatch-guard.mjs`
- Delete guard | Refuses recursive deletes by an agent so no lane stalls on a prompt | fed | `hooks/delete-guard.mjs`
- Backlog notice | Tells a session when work is waiting for it | fed | `hooks/backlog-notice.js`
- Knowledge read logger | Counts how often saved knowledge is read | measured | `hooks/knowledge-log.mjs`, `scripts/knowledge-count.mjs`
- Wiring check | Fails when a required hook, file or setting is missing or stale on a host | fed | `scripts/wiring-check.mjs`
- Discovery and mirror | Installs the plugin and mirrors shared skills to each host | fed | `scripts/mirror-shared-skills.mjs`
- Build census | Counts top-tier tokens, hours and wakes per build | measured | `scripts/build-census.mjs`
- Four-number read | Reads tokens, hours, rework and stalls for one build | measured | `scripts/four-read.mjs`
- Work census | Counts lanes by state and age | measured | `scripts/work-census.mjs`
- Token census | An older token count that counted the wrong agents | unfed | `scripts/token-census.mjs`
- Collector | Lists accepted branches not yet merged and nudges when they go stale | fed | `scripts/collect-from-origin.mjs`, `scripts/collect-status.mjs`
- Knowledge triage | Sorts new knowledge notes into the knowledge store | partial | `scripts/knowledge-triage.mjs`
- Codex host integration | Runs the same build loop from Codex | partial | `hooks/codex-hooks.json`, `scripts/codex-hook-trust.mjs`
- Research | A source-preserving research route | missing
- Multi-build | One implementation and an alias for parallel builds | missing
