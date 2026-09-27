VERDICT: COUNTED 3 lead requests (leadTurns 2), 2 subagent files, leadLastMessageAt: 2026-09-21T10:06:00.000Z

# Build census

## Summary

- leadTurns: 2
- wallClockHours: 0.10
- by-model: claude-opus-5=630, claude-sonnet-5=1910
- by-role: unassigned=450
- subagentFiles: 2

Lead: `lead.jsonl` | Tasks dirs: `scripts/build-census.fixtures/tasks` | Default subagents dir: `scripts\build-census.fixtures\lead\subagents`

## Lead transcript

- Total assistant turns, deduped (whole file): **3**
- Window assistant turns, deduped: **3**
- leadTurns (conversational runs — see docs/census.md): **2**
- Window: 2026-09-21T10:00:00.000Z .. 2026-09-21T10:06:00.000Z
- Turns/hour in window: **30.00**

### Lead tokens by model — whole file (deduped)

| model | input | cache_creation | cache_read | output |
|---|---|---|---|---|
| claude-opus-5 | 500 | 0 | 100 | 30 |
| claude-sonnet-5 | 1050 | 0 | 200 | 210 |

### Lead tokens by model — window (deduped)

| model | input | cache_creation | cache_read | output |
|---|---|---|---|---|
| claude-opus-5 | 500 | 0 | 100 | 30 |
| claude-sonnet-5 | 1050 | 0 | 200 | 210 |

## Subagents (2 files, 2 turns total, deduped)

Roles: unassigned=2

| file | role | turns |
|---|---|---|
| scripts\build-census.fixtures\tasks\empty.output | unassigned | 0 |
| scripts\build-census.fixtures\tasks\split-request.output | unassigned | 2 |

### Subagent tokens by model — totals (deduped)

| model | input | cache_creation | cache_read | output |
|---|---|---|---|---|
| claude-sonnet-5 | 320 | 0 | 50 | 80 |

### Subagent tokens by role — totals (deduped)

| role | input | cache_creation | cache_read | output |
|---|---|---|---|---|
| unassigned | 320 | 0 | 50 | 80 |

## Combined split (lead window + subagents)

| model | output_tokens | input+cache_creation+cache_read |
|---|---|---|
| claude-opus-5 | 30 | 600 |
| claude-sonnet-5 | 290 | 1620 |
