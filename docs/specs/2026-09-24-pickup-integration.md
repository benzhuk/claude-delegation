# Connect Done pickup to existing unattended execution

Draft for scoped design and independent red-team; no implementation contract is pinned yet.

Authority: Ben's standing instruction to keep building useful work toward the harness goal, in parallel. Source, tests, review and merges are authorized. Existing approved rollout does not imply arbitrary page registration, owner reassignment, new schedules, credentials or live peer messages. No activation occurs during this source design/build. The original provider session remains read-only and must not be resumed.

Goal: the builder's submitted Notion Done event reaches its current maintaining agent without repeated model turns. Existing0.20.4 decisions-pickup already provides one-shot read, capture, claim, recoverable dispatch and accounting. The existing unattended note flusher timer runs independently. Current missing seams are explicit host registration and invocation; neither needs another scheduler or receipt/state engine.

Reuse existing receipt/transport/privacy/off-switch contracts. Registration must explicitly bind known project/page/owner/sender/reader on one host. A stored path or Done checkbox grants no authority. Absent or malformed registration must not scan projects, read Notion, invent owners or send. CLI-only integration must leave imports, piggyback, status, dry-run and ordinary peer delivery unchanged. Bounded work and overlap handling must protect normal flushing; unknown dispatch remains unknown rather than retrying a possibly sent note.

Before build: inspect current source and deployed timer, settle the smallest file/API territory, pin explicit registration and runtime budgets, red-team owner identity, multiple projects, timeouts, cross-project claims and zero-work default. Existing note-flush and pickup tests supply regressions; new independent contract tests must exercise invocation boundaries and failures. Builders use sealed homes and no live external effects. Parent alone owns work records, release metadata, source integration and Notion.

Prior evidence: the September23 automation slices define one-shot pickup and its limits; no repeated external research needed. Mid-tier gap scout confirmed missing registration/invocation against current source and actual timer. High-tier proposal is pending; root will adjudicate the concrete contract before implementation.
