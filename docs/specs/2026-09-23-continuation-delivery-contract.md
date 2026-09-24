# Continuation and delivery without wasteful turns

From Astra, September 23, 2026 (America/New_York). This follows Ben's observation that the lead stopped despite instructions, and that hooks can waste turns. It supersedes any implication that the continuation instruction correction alone prevents early completion.

## Decision

Keep the existing ledger, work records and host transports. Correct demonstrated transport defects first. Do not add a polling agent, another work ledger, a heartbeat conversation, or a hook that invariably starts another turn. The existing plan contains useful tested pieces; it is not a demonstrated optimum or a complete continuation contract.

## What past learning already settled

- The ledger is durable; a notification is a hint to inspect state. Duplicate notifications must not repeat work.
- ACK/FYI messages do not wake an idle agent or block Stop by themselves. Actionable peer notes can block Stop once, with a recursion guard. Agents never wait in a turn for peer replies.
- Native Claude inbox and Codex queue delivery avoid the user's composer. Their September 17 Linux trials are retained in `2026-09-17-inbox-delivery.md`; they are not proof of Windows launcher compatibility or child isolation.
- Work acceptance and actual useful outcomes differ. Source checks and model instruction reviews cannot establish reliable live continuation.

## Findings selecting this build

The Windows queue resolver finds an npm `codex.cmd` launcher but returns bare `codex` to Node `execFile`. A harmless `--version` invocation reproduces ENOENT. Fix the executable/argv boundary and retain shell-free message passing.

Fable's three recent notes were marked seen and their retries retired, while the inspected lead transcript contains no original delivery before manual retrieval. The configured hook trust hashes match. The Codex adapter allows inherited pane identity to select the same cursor and does not distinguish children. That is a demonstrated isolation risk; the specific historical reader remains unattributed. Do not invent Claude-shaped Codex event fields as a fix.

Continuation is presently instructions plus advisory backlog notices. The blocking peer hook considers unread messages, not project work. An empty inbox is not evidence of an achieved goal. The previous instruction correction therefore did not close the runtime requirement.

## Runtime boundary required before enforcement

A host adapter must identify the current lead session, an explicitly authorized ongoing scope and selected existing work root, child ancestry, and explicit user cancellation. Repository presence, old owner names, timestamps and inherited terminal handles do not establish those facts. A finite request and a stopped scope must remain finite/stopped.

At an existing completion boundary, a small mechanical check can account for selected runnable, owned/in-flight, delivered, rejected, reviewed and blocked records. It must preserve owners and distinguish missing or malformed evidence from completion. The model decides the next useful action against the goal; the hook does not invent work or silently broaden authority.

Only actionable authorized work that has not already been accounted for should justify a bounded continuation. Coalesce events for the same session/work revision. Repeated unchanged events, routine receipts and an empty queue should cost no model turn. A native Stop veto and a post-completion queued turn are different host capabilities and need separate evidence. Retain the recursion guard; do not turn it into a repeated stop/restart loop.

Delivery evidence must distinguish transport enqueue, rendering into the intended lead context, and owner disposition. The current seen cursor is deduplication evidence, not proof that the intended owner handled an ASK. Preserve the ledger and existing ACK/RESULT/BLOCKED events as the disposition source. Do not retire substantive work merely because a shared cursor moved.

## Build order and acceptance

1. Repair Windows executable resolution with a real argv-process regression and existing transport tests. Independently repair the confirmed decisions-pickup off-switch gap.
2. Verify the actual running native Codex child/lead event contract and completion seam before adding isolation/enforcement. If the host cannot supply those facts, state that exact limitation; do not claim a generic hook fixes Orca or all agents.
3. Run a scoped delivery observation on the supported host route: intended owner receives one actionable item; children cannot consume its cursor; duplicates and ACK/FYI create no idle turns; a transport failure remains recoverable. Do not resend historical note IDs or type into a peer pane for the experiment.
4. Exercise continuation on real authorized work: ready independent work continues after a status/release boundary; explicit stop and finite requests stop; blocked work does not prevent other ready work; no available useful work creates no model loop. Measure useful accepted outcomes, added model turns/usage, missed items and duplicate work. Missing usage or observation remains unknown, not zero.

The first two source fixes can build in parallel. Host-contract inspection is independent. Runtime enforcement follows authentic host evidence; it is not bundled into the confirmed launcher correction.
