# Bearings evidence template

Use this template for the bounded packet sent to the fresh high-tier reviewer and for the dated published result. Replace every bracketed value. Do not add a field merely to make an unknown look complete.

```markdown
# Bearings — [project] — [YYYY-MM-DD]

## Scope

- Assessment window: [start date] to [end date]
- Goal revision: [repository link to the exact goal/card revision]
- Reviewed by: [host and high-tier role]
- Evidence boundary: [what was included and why]
- Unknown or unavailable evidence: [measure, report, access limitation, or "none known"]

## Evidence

| Observation | Repository evidence | What it supports | Limitation |
| --- | --- | --- | --- |
| [dated fact] | [commit, file, report, or artifact permalink] | [claim] | [missing context or measurement] |

Repository evidence links should identify the reviewed revision whenever possible. A path without a reachable repository link is still useful evidence, but label it as local/unlinked rather than implying that it was published or independently reachable.

## Reviewer assessment

1. Have we made significant progress towards the goal? [answer with cited observation(s)]
2. Have we gotten sidelined on some too-specific sub-project? [answer with cited observation(s)]
3. Have we spent time on a castle of patches instead of going back to the architecture and simplifying? [answer with cited observation(s)]
4. Are we still building towards the simplest possible solution that solves our actual core problem? [answer with cited observation(s)]

- Decision: `CONTINUE` | `RE-PLAN` | `CUT`
- Missing evidence that could change the decision: [items]
- Next action: [one concrete action or owner decision]
- Prediction: [observable result and when it will be checked]

## Lead response

[The lead's own words. State what it accepts, what it does next, and any authority boundary. Do not present the reviewer's wording as the lead's response.]

## Re-plan record

- Previous unresolved RE-PLAN concern: [none or link]
- This response's result: [what changed or why it did not]
- Reassessment required: [yes after two ineffective RE-PLAN responses; otherwise no]

## Publication

- Notion target: [configured page title and link]
- Publication status: `PUBLISHED` | `PENDING`
- Published at: [date/time, or pending]
- If pending: [attempted route and reason]
```

The assessment should be dated when it is created, and publication status should remain truthful if a later write fails. Token counts, seven-day rework, and other unavailable measures belong under unknown evidence until actual evidence exists.
