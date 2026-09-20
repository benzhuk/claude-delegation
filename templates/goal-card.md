# Goal card

The goal card is the ONE piece of goal text that lives in an agent's context. It is five lines. It is
injected by `hooks/delegation-reminder.js` at session start, into subagents at spawn, and once every
40 tool batches during a long autonomous stretch — never on every prompt, because a standing text a
model sees 300 times is wallpaper.

It replaces goal prose, not adds to it: parents, rationale and history stay on disk behind the SOURCE
line and are read only when an agent follows that path.

## Where the file lives

The path comes from project config (`.agents/project.json`, key `goal_card`), default
`docs/goals/card.md`. A relative value resolves against the project root; an absolute value is used
as given. **No file means no injection** — the feature is simply off for that project, silently.

## The format — exactly five lines, in this order

```
GOAL: <the one outcome this project is trying to reach, in the owner's words>
NOT: <one or more non-goals, all on this single line>
DONE: <the acceptance test — what someone runs or reads to see the goal is met>
KILL: <the kill criterion, and the budget>
SOURCE: <path of the full goals doc> (parent: <path of its parent doc>)
```

Worked example:

```
GOAL: every batch is cheap, fast, recoverable, tracked and metered, and we never lose one.
NOT: a second execution engine. NOT: a new leg or transport to fix a polling bug.
DONE: a killed run resumes from its ledger with zero re-billed work, and spend per film is visible before it is spent.
KILL: if recovery still needs a human after two weeks, stop and buy a durable engine. Budget: $600.
SOURCE: docs/goals/batches.md (parent: docs/goals/program.md)
```

### What each line is for

- **GOAL** — the outcome, not the activity. One line. If it needs two, the project has two goals and
  wants two cards, or the second one is really a DONE.
- **NOT** — the non-goals, on ONE line. This is the line that does the work: a drifting agent is
  usually building something nobody ever declared out of scope. The merge ask asks which non-goal a
  change comes closest to and why it does not cross it, which is a question a model cannot answer
  without surfacing a real tension. Several non-goals go on this one line, separated however reads
  best (`NOT: a. NOT: b.` or `a; b`).
- **DONE** — the acceptance test, stated so that passing it is observable. Not "works well".
- **KILL** — when to stop trying and what the attempt is allowed to cost. Checked whenever it is
  crossed; it is the third goal-challenge trigger.
- **SOURCE** — where the full goals record is, and its parent, so an agent that needs the reasoning
  can fetch it. Write paths only. The as-of stamp is NOT written here: the injector appends
  ` — as of <mtime> NYC` from the file's own modification time, so editing the card propagates to the
  next session with no restart and no stale date to maintain by hand.

### Rules the validator enforces

- Exactly the five labelled lines, in that order, each non-empty.
  Blank lines, `#` headings and `<!-- HTML comments -->` are ignored, so the file can carry a title.
  An optional leading `- ` or `* ` bullet on a line is allowed and stripped.
- A hard byte cap: 800 bytes for the file's card content, 240 bytes per line, 1000 bytes rendered.
  **A card over the cap is REJECTED, never truncated** — a silently shortened goal is worse than no
  goal. `scripts/goal-card.mjs check` names the offending line; the hook injects nothing and exits 0.
- Anything else (a sixth line, a missing label, labels out of order) is malformed: nothing is
  injected, no session is blocked.

## Checking a card

```
node scripts/goal-card.mjs check    # 0 valid or no card configured, 1 malformed, 3 cannot see the project
node scripts/goal-card.mjs show     # prints exactly the text the hook would inject, or nothing
```

## Switches

`~/.agents/ws-off` (master) or `~/.agents/ws-off-goalcard` — a present file means no card is ever
injected. Files, not env vars, so the switch works from a GUI-launched session and works exactly when
a hook is misbehaving.
