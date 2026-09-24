Work: wr-2026-09-24-pickup-integration
Scope: docs/specs/2026-09-24-pickup-integration.md@ef7ead8e4b39c1dac601285a909923403e84d3f0
Owner: skills-a
Status: rejected
Authority: standing useful-work source and merge grant; no live registration, scheduling, Notion writes, peer sends or credentials by builders
Artifact: 1332e5d96810e2917e3c78fac132fb9b71105079
Evidence: docs/work/evidence/pickup-integration-builder.md, docs/work/evidence/pickup-integration-gates.md, docs/work/evidence/pickup-integration-review-r1-original.md
Next: fix round2 owner-handoff false success; independent real-receipt regression then delta review and fresh integration gate
Opened: 2026-09-24T11:25:56Z
Rounds: 2
Log: 2026-09-24T11:25:56Z owned skills-a Record opened after initial bounded read-only gap scouting; timestamp is admission record time, not user ask time.

Predicts: Explicit opt-in registration plus existing timer invocation can complete unattended pickup without another scheduler or model turns for unchecked pages.
Observed: Integrated e50ebaf passed7 independent tests and1413 sealed suite tests. Fresh Opus still found a real false-green: nested receipt.handoffStatus with changed owner retained top-level RECORDED and mapped to success. Source correction and a real-receipt independent regression are running in parallel. First review and passing-but-insufficient gates are retained; no release or activation occurred.
