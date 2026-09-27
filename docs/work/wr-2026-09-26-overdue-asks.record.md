Work: wr-2026-09-26-overdue-asks
Scope: docs/specs/overdue-asks-1/spec.md (read at origin/docs/lane-specs-0925 57a4763) with lead rulings docs/specs/overdue-asks-1/contracts.md; territories O1 O2
Owner: skills-n
Status: reviewed
Authority: build, review, integrate, push build/overdue-asks-1, and merge into main on acceptance under the merge-on-acceptance rule, without Ben
Artifact: 2ba158dfa7e4a6e0c8bc67f084b6c555d9bcb646
Evidence: docs/work/evidence/wr-2026-09-26-overdue-asks-review.md, docs/work/evidence/wr-2026-09-26-overdue-asks-O1.md, docs/work/evidence/wr-2026-09-26-overdue-asks-O2.md, docs/work/evidence/wr-2026-09-26-overdue-asks-integrator.md, docs/work/evidence/wr-2026-09-26-overdue-asks-windows-suite.log
Next: census, four-read, accept, merge into main
Worktree: build/overdue-asks-1
Opened: 2026-09-27T02:54:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-26T22:50:00-04:00
Base: 3bd6ef6f98a07037b258ca7b843cbf88b7820f89
Log: 2026-09-27T02:54:00.000Z owned skills-n picked up skills-fable-overdue-asks-1, ACK sent over ssh on ben-desktop, base 3bd6ef6
Log: 2026-09-27T03:44:00.000Z owned skills-n launch wf_25e7cd56-c3f: O2 APPROVE at 974d096 (2 rounds); O1 rounds exhausted at a97c0fd with one MAJOR needing a lead ruling and one MINOR test
Log: 2026-09-27T03:47:00.000Z owned skills-n lead ruling: R5 amended (both inbox cwds gone means log and record, send nothing); lead applied the MINOR test verbatim at 2346279; O1 merged, integration head 81bd3b9; Opus final review, Linux and Windows suites launched
Log: 2026-09-27T03:55:46.000Z owned skills-n suites green at 81bd3b9 (Linux 1822 of 1825 0 fail, Windows 1825 of 1825); O1 final Opus review NEEDS_FIXES at 2346279 on a spec-premise MAJOR: across hosts each ledger holds half the conversation, so the pass would send false BLOCKED notes; spec ruling asked of skills-fable, by 00:45 NY; nothing merged
Log: 2026-09-27T04:23:32.000Z reviewed skills-n R8 and the lead narrowing applied (O1 b9e3f72, Opus APPROVE, reports/O1-r8b-review.md); integration 2ba158d Opus APPROVE (reports/integration-review.md); Linux PASS 1828 of 1831 0 fail, Windows PASS 1831 of 1831

Observed: two territories. O2 adds the builder no-delete sentence in agents/builder.md and the build-loop mandate (Opus APPROVE at 974d096, 2 rounds). O1 adds runOverdueAsks to note-flush's standalone path: an ASK 15 min past its by-time with no RESULT or BLOCKED gets one BLOCKED from note-flush, once per id, with its own kill switch, fail open, an 8-day prune and a --status suffix. O1 ran out of loop rounds with a contract gap (both inbox cwds gone), which the lead amended in R5. The O1 final Opus review then found a flaw in the spec's premise: across hosts each ledger holds half the conversation, so the pass would send false BLOCKED notes (7 of 7 on this host's real ledger). The spec author ruled R8: nudge only when the answer side is observable here, else log overdue-cross-host, and seed silently on the first run. The Opus review of R8 found old reply lines satisfied it forever, and the lead narrowed it to reply lines stamped at or after the ASK. Replay over this host's real ledger: first run 7 seeded and 0 sent, steady state crossHost 7 and 0 sent. Cross-host ASKs stay unwatched until lane fifteen mirrors a remote send into the sender's ledger. Suites at 2ba158d: Linux 1828 pass, 0 fail, 3 skipped of 1831; Windows 1831 of 1831. Opus integration APPROVE at 2ba158d.
