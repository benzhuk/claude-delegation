# Research ladder — prior art and root cause, before more building

A research question (does this exist already, is there a supported path, why does this
defect keep recurring) gets a fixed shape of investigation instead of an open-ended
search. The ladder is one lane per source class plus two support lanes; how much of it
runs is set by the cost tier below.

## Lanes

- **One mid-tier lane per source class** (Claude Sonnet / OpenAI GPT-5.6-Terra): official
  docs, issue trackers, practitioner write-ups, alternatives. Each lane searches its ONE
  class only, quotes what it finds, cites the exact URL and fetch date, and does not
  synthesize across classes — that's the top session's job. The issue-tracker lane, run
  for a team-build prior-art check, searches for the EXACT symptom, not the general
  topic.
- **Fast-tier fetch-and-quote** (Claude Haiku / OpenAI GPT-5.6-Luna): fetches and quotes
  pages a mid-tier lane already found. It never searches independently and never
  synthesizes; it exists to pull full quotes cheaply once the mid-tier lane has done the
  finding.
- **High-tier skeptic** (Claude Opus / OpenAI GPT-6-Astra, Sol if cost forbids): tries to
  refute the other lanes' findings. It re-fetches EVERY load-bearing source itself — any
  finding that would change the plan, and every number or quote a decision would rest on
  — and checks that each quote appears verbatim at that URL. A quote it cannot locate on
  the page is reported as UNVERIFIED-AT-SOURCE and the finding is STRUCK, not softened;
  it never trusts a lane's transcription. Any number that reached the record through the
  fast-tier fetch pass is re-fetched before it enters a decision (the fast tier never
  owns a number someone will act on, `docs/model-tiers.md`). It states plainly which
  findings survive, which are struck, and which sources it could not fetch.
- **The top session decides.** Lanes report findings; none of them adjudicates across
  another lane's report, and none of them issues a build-directing ruling.

## Cost tiers

The tier is decided by a test on the change, not by how big it feels:

- **Small change** — no new dependency, no new long-lived mechanism (a script, a hook, a
  daemon, a queue, an engine), no new external service, and the defect class is on its
  first or second fix round: ONE lane, in a fixed time box stated in the mandate (e.g.
  "10 minutes, official docs only").
- **A mechanism or a new project** — anything that fails ANY clause above, including any
  change whose merge-ask `Adds:` line is non-empty in the maintenance sense: the full
  ladder — all four source-class lanes, the fast-tier fetch pass feeding them, and the
  high-tier skeptic pass over the result.

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
- **NOT FOUND** — a real search that actually reached the source class, listed in the
  report, and nothing surfaced.
- **BLIND** — the source class could not be reached at all (auth wall, 403, paywall,
  tracker unreachable, every fetch failed). Nothing was learned about the question. Say
  which fetches failed and how they failed. A `BLIND` lane NEVER satisfies a prior-art
  gate and never licenses a fourth fix attempt; the top session re-runs it by another
  route or decides in the open that it is deciding blind.
- **MIXED** — partial or conflicting results; the top session has to read the detail
  before deciding.

## Reports

Every lane writes to disk in `templates/research-report.md`'s shape, at an
orchestrator-chosen path, verdict line 1. The template lives in the plugin repo and is
NOT mirrored, so the orchestrator passes its ABSOLUTE path in the mandate (alongside this
doc's absolute path); a lane that was given neither falls back to the shape restated in
`agents/researcher.md` and says so in its report. A lane diagnosing a defect (a
third-fix-rule lane) uses the template's investigation shape — `## Evidence`,
`## Hypotheses`, `## Resolution` — on top of the standard sections
(`docs/subagent-contract.md`'s Investigation reports section). The report protocol
otherwise — path naming, never trusting the reply, the termination formula, recovery
after a mid-round kill — is `docs/subagent-contract.md` verbatim; nothing here overrides
it.

## Model tiers

`docs/model-tiers.md`'s mid/fast/high rows map directly onto the three lane kinds above,
one row per lane kind; no new tier is added. The top session (top tier) never runs a lane
itself — it only adjudicates.

## Adapters

- **Claude Code**: spawn each lane with the `Agent` tool, `subagent_type: "researcher"`
  (`agents/researcher.md`), and `model:` set per lane at the call site — sonnet by
  default, haiku or opus override exactly as `docs/model-tiers.md`'s spawn-mechanics
  section describes for the builder/reviewer roles. The ISSUE-TRACKER lane and the
  skeptic are spawned with a shell granted at the call site (the agent file ships without
  one) so they can run the tracker's own CLI — `gh search issues "<exact symptom>" --repo
  <owner>/<repo> --state all`, `gh search prs`, `gh issue view` — because web search
  indexes closed issues and comment threads unevenly and that is where the exact symptom
  usually is. Same pattern as team-build's "grant tools at the spawn call" for reviewers
  with a mechanical component.
- **Codex**: no bundled researcher role ships yet. Copy `~/.codex/agents/builder.toml`
  to `researcher.toml` and set `model` per lane the same way `docs/model-tiers.md`'s
  Codex section describes for the high-tier builder override.
