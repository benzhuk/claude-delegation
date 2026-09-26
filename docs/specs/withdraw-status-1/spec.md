# Lane nine: a way out of rejected

Written by skills-fable, 2026-09-26 17:05 New York. Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31. For a Claude lane lead from its pane's current session. Base: origin/main at pickup (b7ddf11 or later, one sha). Branch build/withdraw-status-1. Builders in their own worktrees.

## Why
`scripts/work-record.mjs` has a closed status set (runnable, owned, delivered, rejected, reviewed, accepted, blocked) and two commands, check-acceptance and accept. The only exit from rejected is a full accept. Two records rejected on Sep 23 (wr-2026-09-23-native-claude-pilot, wr-2026-09-23-native-instruction-review) were superseded by later work and nobody will run a fix round on them, so every prompt in every session in this repo reads "2 rejected awaiting a fix round. Pull one or say why not." A record nobody will fix is not work; the hook is reporting a false signal, and a runner that tried to close them found no tool path and correctly stopped (evidence: the lead's close-records report, 17:00 NY).

Measures: work lost or stalled (the fix-round count becomes true), top-tier tokens per build (no lead spends turns re-deciding the same two records). Must not worsen: rework after acceptance (a withdrawn record is terminal, it never re-enters the queue).

## Territory W1: the status and the command (scripts/work-record.mjs, its test, and the hook or script that computes "awaiting a fix round")
1. Add one terminal status, `withdrawn`. Allowed from rejected, blocked, runnable and owned; never from accepted; never back out of withdrawn.
2. One command: `work-record.mjs withdraw <record> --reason "<one sentence>" [--superseded-by <record-name>] --by <session-id> --at <iso>`. It appends a Log line in the record's existing Log format, rewrites only the Status line and adds a `Superseded-by:` header when given (the header must round-trip through the parser; if the parser rejects unknown headers, put it in the Log line and say so). Refuse without --reason. Refuse when --superseded-by names a record that does not exist on disk.
3. The hook query that produces "rejected awaiting a fix round" excludes withdrawn. Whatever lists runnable/delivered/rejected work also excludes it. One test per exclusion.
4. Tests: transition table (each allowed and each refused source status), the refusals in item 2, and the query exclusions. Existing tests stay green.
5. Docs: one sentence in the work-record section of docs/subagent-contract.md (or wherever statuses are documented; grep for "rejected" in docs/ and skills/ and update every list of statuses you find, nothing else).

## Dogfood
On the same branch, withdraw both Sep 23 records with the tool: the pilot with reason "closed without a fix round: the native artifact never materialized and the effort continued under a later record" and the review with `--superseded-by wr-2026-09-23-instruction-consistency`. Quote the hook's work line from a fresh prompt in the worktree showing 0 rejected awaiting a fix round.

## Acceptance
Sealed suite green on your host and on a second host from origin (Windows if built on Linux). Opus reviewer with this attack brief: withdraw an accepted record; withdraw twice; --superseded-by pointing at a missing record; a withdrawn record reappearing in any list the hook or the collector prints; a Log line that breaks the four-number read. Record with Lead-session, Spec-session, Spec-from, Base one sha; accept --census --four-read. Then merge on acceptance under the lane eight rule and post the Closed entry; that is the RESULT. Push at every Status change; a denied command stops the step and is reported; the git identity is never set by an agent; no trailers; no README changelog.
