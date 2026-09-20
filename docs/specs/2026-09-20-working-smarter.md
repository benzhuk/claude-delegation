# Working smarter: goals ladder, research ladder, no-idle orchestration, decisions, janitor, AGENTS.md

Spec for a team build. Owner/orchestrator: the taxonomy-fable session. Decided by Ben 2026-09-20 (Notion
"Working smarter", page 3e1da11277a18114b0dff725d462d5f8): build everything together as one skill set; goals ladder
three levels by default; the orchestrator drafts the first goals docs; reversible decisions carry a default and a
deadline; everything lives in THIS plugin so every project, machine and agent gets it. Ben, same day: "this is for
everything I do, all my agents on all projects."

## Why (the week this is built from)
1. A second engine was built for a week; nobody searched the runtime's issue tracker where the bug and fix were listed.
2. Watchdogs, leases and timers were stacked on symptoms; the cause was one structural fact nobody looked up.
3. Reports described intent, not state: a green rebuild on old packages, commits never pushed, a harness that was
   not production.
4. Orchestrators sat idle: asks unanswered after a compaction, a peer with no inbox, builders queued serially.
5. Decisions stalled when the owner was away; links to decisions were lost in chat history.
6. Nothing owned cleanup: 225 worktrees, 159 merged branches, 3,231 pending generations, scratch in the repo.
Every rule that existed as prose was ignored at the moment it mattered. So: EVERY RULE HERE IS MECHANICAL
(hook, script, template, gate) or it is not in scope.

## Design constraints
- Agent-neutral. Procedures are tool-neutral markdown; tool specifics live in a short "Adapters" section
  (Claude Code, Codex, ChatGPT). AGENTS.md is the source; CLAUDE.md becomes a one-line import.
- Project-agnostic. No BTO specifics. A project supplies only a small adapter file (`.agents/project.json`):
  where goals live, what its gate command is, where decisions are published.
- Tiny and testable. Goals docs max 10 content lines. Index files max 60 lines, generated, never hand-kept.
- Tiered ceremony. small change = one goal-trace line; adds a mechanism = research report + goal check;
  new project = goals doc with kill criterion and budget first.
- Every global hook has a kill switch env var and fails OPEN (a broken hook never blocks work).
- No MCP servers. No network calls from hooks.
- Storage: repo markdown is the source of truth. The human viewer (Notion mirror vs an Obsidian vault) is
  UNDECIDED pending research; nothing in this spec may depend on either.

## Pinned contracts (stubs committed at t0 under `contracts/`)
- `contracts/goal.schema.json` frontmatter: id, title, level (program|project|component), parent (id|null),
  owner, status (active|challenged|retired), acceptance_test, kill_criterion, budget {days, usd}, spent {days, usd},
  last_challenged (date). Body: purpose (1 sentence), outcomes (3-5 bullets), non_goals.
- `contracts/research-report.schema.json` frontmatter: id, question, trigger (mechanism|third-fix|keyword|manual),
  lanes[], verdict (line 1 of body), sources[] {url, supports}, date, supersedes.
- `contracts/decision.schema.json`: id, title, kind (simple|complex), options[] {label, recommended, reversible},
  default, deadline, status (open|answered|defaulted|closed), answer, url.
- `contracts/artifact.schema.json` (janitor registry line): path|ref, kind (worktree|branch|generation|scratch|
  packet|state), owner, purpose, end_condition, created.
- `contracts/state-files.md`: `~/.agents/decisions/open.json`, `~/.agents/board/waiting.json` shapes.
- `contracts/env.md`: kill switches `WS_GOALS=0`, `WS_RESEARCH_GATE=0`, `WS_IDLE_CHECK=0`, `WS_DECISION_FOOTER=0`,
  `WS_JANITOR=0`. Exit codes for every script: 0 ok, 1 finding, 2 blind (cannot see) — blind outranks a finding.
- Goal trace line format (used in commits, merge asks, builder briefs):
  `Goal: <component-id> > <project-id> > <program-id> — <one sentence how this serves the leaf>`
  plus, when a mechanism is added: `Adds: <what we must now maintain>. Deletes: <what goes away|nothing>.`
  plus `Research: <report id|none-needed:why>`.

## Territory map (one builder each, disjoint files)
- **T1 goals** — `skills/goals/SKILL.md`, `templates/goal.md`, `scripts/goals-index.mjs` (generate index from
  frontmatter, validate schema and the 10-line cap), `scripts/goal-trace-check.mjs` (a trace line resolves to real
  ids up the chain), challenge triggers and the keep/reword/split/retire record, tests.
- **T2 research** — `skills/research/SKILL.md` (zoom-out questions: what is this component's job, who else has this
  job and what do they use, are we on a supported path, what would we delete), `workflows/research-ladder.js`
  (Sonnet lanes by source class -> Opus skeptic that refutes and spot-checks sources; Haiku only fetch-and-quote),
  `agents/researcher.md`, `templates/research-report.md`, `scripts/research-index.mjs`, tests.
- **T3 orchestration (Opus builder: hooks bind every session)** — `hooks/delegation-reminder.js` rewrite
  (conditional: mechanism words / third-fix / stall words inject the research gate; otherwise one short line, not
  wallpaper), `hooks/idle-check.js` (Stop: an orchestrator with an unfinished task, nothing dispatched and no wake
  armed must dispatch or state IDLE with what and since when), `hooks/post-compaction.js` (checklist: inbox, peer
  panes, open decisions, waiting board), `scripts/waiting-board.mjs`, inbox pre-flight in `skills/multi`, tests.
- **T4 decisions** — `skills/decisions/SKILL.md` (sub-sessions never block on the owner, send up; batch simple ones
  as ONE multiple-choice call only after everything dispatchable is dispatched; default + deadline on reversible;
  complex -> decision doc), `scripts/open-decisions.mjs`, `hooks/decision-footer.js` (every owner-facing message
  ends with the open-decisions link while anything is open), decision-doc template, answer read-back parser, tests.
- **T5 janitor** — `skills/janitor/SKILL.md`, `scripts/janitor.mjs` (dry-run table; safe class vs judgment class;
  never deletes files it did not create; generations are invalidated, never deleted), `scripts/commit-check.mjs`
  (refuse scratch and temp packets), artifact registry helpers, five drift numbers, tests.
- **T6 gates in existing skills** — `skills/team-build/SKILL.md` (Setup step 0: prior-art + zoom-out report on
  disk or the spec is refused; red-team attacks "should this exist"; definition of done includes cleanup),
  `skills/delegate/SKILL.md` (third fix round on one defect class -> research lane before round four),
  `docs/mandate-standards.md` + `docs/subagent-contract.md` (state over intent: a result names the command that
  observed it; reviewers verify against origin and running bytes, never the report), merge-ask template.
- **T7 AGENTS.md** — `AGENTS.md` template + `docs/agents-md-migration.md` (parity map method: every rule in an
  existing CLAUDE.md gets a named destination), adapters section, the mirror script change so skills land in
  `~/.agents/skills`. The owner's dotfiles are migrated in a SECOND build after this one is proven.

## Rollout
Branch `feat/working-smarter`, NOT main. Prove on the VPS in one session with the plugin pointed at the branch,
every kill switch documented. Merge to main (which publishes to every machine) only on Ben's word.

## Not in scope
Any BTO-specific rule. A Notion or Obsidian dependency. New MCP servers. A dashboard. Anything enforced by prose.

## Addendum 2026-09-20 11:30 NYC — per-project knowledge base and issue log (Ben)
Each project gets its own knowledge base with its own memory management, including a highly structured ISSUE LOG:
one record per issue with evidence, status (open | fixed | ignored | superseded), the fix or the reason it was
ignored, links to the goal it threatens and to the research or decision that closed it. Whether the right substrate
is interlinked markdown alone, or markdown with a database component (SQLite or similar) for the structured records,
is UNDECIDED and under research (lanes E and F). Contract added at t0 regardless of substrate:
`contracts/issue.schema.json`: id, title, status, severity, first_seen, last_seen, evidence[] {kind, ref, observed_by,
command}, goal (id), cause, resolution {kind: fixed|ignored|superseded, ref, date, why}, recurrence_count.
A builder territory **T8 knowledge base + issue log** opens only after the research ruling.
