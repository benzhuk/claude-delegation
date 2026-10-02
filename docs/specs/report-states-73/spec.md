# Lane 73: report states and the three progress fields (10/1, opened after pickup round 4)

Ben on the page tonight: "i think each goal will take a long time and will take many many steps, so 'partial' is not a useful state since it will be in that state for weeks. Your idea is good but we need another column for a super brief summary of exactly where we are and what needs to happen to actually get to a finished state, and estimate of much longer we will need to finish". Measure: work lost or stalled (Ben and the lead see where every long-running thing is without reading it).

## Scope, pinned
1. Report contract (docs/subagent-contract.md and the report check script): first line is one of `DONE`, `NEEDS BEN: <one line>`, `NEEDS <peer slug>: <one line>`, `FAILED: <why>`, ending with `<n> of <m> steps done`. PARTIAL is refused. Line 2 for anything not DONE: `Now: <one line> | To finish: <one line> | Est: <duration>`. The check script refuses a report missing either line.
2. Lane records (docs/work/*.record.md): `Status:` values become open, NEEDS BEN, NEEDS <peer>, FAILED, accepted, closed; every open record carries the same `Now / To finish / Est` line, refreshed by whoever writes the record. The accept and merge scripts refuse a record with any other Status word.
3. Decisions page: every waiting item and every in-progress item the renderer emits shows the three fields as one short line under its title (renderer change coordinates with lane 72; whichever lands second rebases).
4. The hook card line format for components (Now / To finish / Est per component) is specified here as a reference the lead's v6 draft uses; the card text itself is not in this lane.
5. Tests for 1, 2, 3 against fixtures; the briefs in skills/team-build and skills/delegate state the first-line rule once each.
Not in scope: the card text, the census, retroactive rewrites of closed records.

## Build shape
Through the Workflow, Sonnet builds, Opus reviews, one red-team round at most, worktree under <repo>/.claude/worktrees/, suites once on Netcup and once on Hetzner, merge under the 9/26 grant. Every execution brief: if any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. Never set a git identity, no --no-verify, no force, no recursive deletes.

Due on main: 10/2 3:00 PM NY.

## Received / acted
