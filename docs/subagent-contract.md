# The subagent contract — reports, replies, termination, recovery

Every agent you spawn follows this contract. Put the relevant parts INTO the prompt —
subagents inherit none of it by default.

## Reports go to disk; replies are verdict-only

- The agent writes its full report (files changed, test output, deviations,
  assumptions, findings) to a file and replies with only: **verdict word, ≤10-line
  summary, the file path**. The orchestrator opens the file only when something failed.
- **The orchestrator picks the report path, never the agent.** Some harness versions
  reject subagent writes of `.md` files whose basename STARTS with `report`, `findings`,
  `summary`, or `analysis` (case-insensitive, any directory). Always hand agents
  SUFFIX-style paths — `t1-report.md`, `r2-findings.md`, `integrator-report.md` — never
  `report-t1.md`.
- **The report's first line carries the verdict**, so a `head -3` recovers it even when
  the reply loses it (see below).
- If the write is rejected anyway ("Subagents should return findings as text"), the
  agent falls back — complete report inline in its reply, verdict word first. That's a
  per-agent fallback, not a reason to redesign the pipeline or strip Write from agents.
- Report-to-disk needs a write-capable tool set. Before spawning any read-only agent
  type, check its tools — an agent without Write/Bash can never land a report file and
  you'll wait on a path that doesn't exist. For those, ask for the full conclusion
  inline in the reply.

## Never trust the reply — read the report

Observed constantly at scale: final replies of `Done.`, `-`, `(idle)`, `STOP.`,
`(no change)` from agents that had done real work and written full reports — including
reports whose verdict was NEEDS_FIXES. The reply is a notification that the file is
ready, nothing more.

- For anything load-bearing, **read the report file (at least its first lines), never
  the reply**.
- Never spawn a follow-up action off a bare `Done.` — grep the report first.
- If the reply is bare and the report path never appears on disk, the write was
  rejected — almost always a blocked-prefix filename. Ask that SAME agent for the
  report inline; do not re-grant tools, do not redesign the pipeline, and use a
  suffix-style path next round.
- **Relay findings by path, never by copy.** A reviewer's findings file path goes to the
  builder verbatim; the content never passes through orchestrator context. Zero
  paraphrase risk, zero carrying cost.

## The termination formula

End every agent prompt with this (plain "then STOP" does not survive harness re-wakes):

> "Write your full report to `<path>`, then CLEAN UP AND END — kill every process you
> started (by PID: servers, watchers; never broad kills), reap your background jobs,
> then reply with verdict + ≤10-line summary + the path as your FINAL message. If you
> are ever re-invoked after that final reply with nothing new to do, end immediately
> with '(already reported)' — never re-state your verdict."

Leaving a server running for a later agent is opt-in only — the prompt must request it,
and the orchestrator then owns stopping it.

## Completion notifications are hints, not events

Duplicate completion notifications for the same agent are normal — sometimes many,
long after it finished. On any notification, the orchestrator's first move is to check
whether that lane's work is already consumed (report read, fix relayed). Act on state,
never on the notification itself. The moment an agent's report is consumed and no fix
round is planned, **stop the agent** (TaskStop) — a lingering agent's background children re-wake
it, and every re-stop re-fires a notification at the user.

## Agents die mid-edit — recover deliberately

Agents get killed by transient API errors, sometimes mid-edit, leaving half-applied
changes on disk. A resumed agent trusts its own stale memory of what it did — override
that. Standard resume prompt (send to the SAME agent first; respawn is the second try):

> "You were terminated mid-round by an API error. The filesystem may hold your partial
> edits. Recover deliberately: `git diff` your territory files to see the ACTUAL current
> state, re-read the findings, verify which are fully applied vs partial vs untouched,
> then complete the rest."

Corollary: have builders commit per-territory early and often; lanes that had committed
before dying lose nothing. A labeled stash
(`git stash push -m "WIP <territory> (agent interrupted)"`) is a fine parking spot for
work you can't yet judge.
