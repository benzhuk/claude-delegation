# Research ladder — prior art and root cause, before more building

A research question (does this exist already, is there a supported path, why does this
defect keep recurring) gets a fixed shape of investigation instead of an open-ended
search. The ladder is one lane per source class plus two support lanes; how much of it
runs is set by the cost tier below.

## Lanes

- **One mid-tier (Sonnet) lane per source class**: official docs, issue trackers,
  practitioner write-ups, alternatives. Each lane searches its ONE class only, quotes
  what it finds, cites the exact URL and fetch date, and does not synthesize across
  classes — that's the top session's job. The issue-tracker lane, run for a team-build
  prior-art check, searches for the EXACT symptom, not the general topic.
- **Fast-tier (Haiku) fetch-and-quote**: fetches and quotes pages a Sonnet lane already
  found. It never searches independently and never synthesizes; it exists to pull full
  quotes cheaply once the Sonnet lane has done the finding.
- **High-tier (Opus) skeptic**: tries to refute the Sonnet lanes' findings. Fetches the
  sources itself rather than trusting their quotes, spot-checks at least one source per
  lane, and states plainly which findings survive and which don't.
- **The top session decides.** Lanes report findings; none of them adjudicates across
  another lane's report, and none of them issues a build-directing ruling.

## Cost tiers

- **Small change**: ONE lane, in a fixed time box stated in the mandate (e.g. "10
  minutes, official docs only").
- **A mechanism or a new project**: the full ladder — all four source-class lanes, the
  Haiku fetch pass feeding them, and the Opus skeptic pass over the result.

## When to run it

- `team-build`'s Setup step 1 (prior art, before the spec is written): the zoom-out
  questions (what is this component's job; who else has this job and what do they use;
  are we on a supported path; what would we delete) plus the issue-tracker symptom
  search. No report, no spec.
- `delegate`'s third-fix rule: a third fix round on one defect class stops and runs a
  lane here before a fourth attempt.
- Anywhere else a mandate says "check for prior art" or "find the root cause" before
  authorizing more building.

## Verdict vocabulary

Every report's first line is one of:

- **FOUND** — the lane surfaced material that changes the plan (prior art exists, a
  root cause is identified, the working hypothesis holds).
- **NOT FOUND** — a real search, nothing surfaced.
- **MIXED** — partial or conflicting results; the top session has to read the detail
  before deciding.

## Reports

Every lane writes to disk in `templates/research-report.md`'s shape (read from the
plugin repo's `templates/` directory — this one is not mirrored to Codex, since
research lanes run from a source checkout, not the mirrored skill store), at an
orchestrator-chosen path, verdict line 1. The report protocol otherwise — path naming,
never trusting the reply, the termination formula, recovery after a mid-round kill — is
`docs/subagent-contract.md` verbatim; nothing here overrides it.

## Model tiers

`docs/model-tiers.md`'s mid/fast/high rows map directly onto the three lane kinds above:
Sonnet runs each source-class lane, Haiku runs the fetch-and-quote pass, Opus runs the
skeptic pass. The top session (top tier) never runs a lane itself — it only adjudicates.

## Adapters

- **Claude Code**: spawn each lane with the `Agent` tool, `subagent_type: "researcher"`
  (`agents/researcher.md`), and `model:` set per lane at the call site — sonnet by
  default, haiku or opus override exactly as `docs/model-tiers.md`'s spawn-mechanics
  section describes for the builder/reviewer roles.
- **Codex**: no bundled researcher role ships yet. Copy `~/.codex/agents/builder.toml`
  to `researcher.toml` and set `model` per lane the same way `docs/model-tiers.md`'s
  Codex section describes for the high-tier builder override.
