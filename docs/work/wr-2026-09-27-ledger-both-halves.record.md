Work: wr-2026-09-27-ledger-both-halves
Scope: docs/specs/ledger-both-halves-1/spec.md (read at origin/docs/lane-specs-0925 ad0bf95) with lead rulings docs/specs/ledger-both-halves-1/contracts.md; territory L1
Owner: skills-n
Status: reviewed
Authority: build, review, integrate, push build/ledger-both-halves-1, and merge into main on acceptance under the merge-on-acceptance rule, without Ben
Artifact: 3c6a5f0f466ec7d2d9f1c2fe165c380d459a9e59
Evidence: docs/work/evidence/wr-2026-09-27-ledger-both-halves-review.md, docs/work/evidence/wr-2026-09-27-ledger-both-halves-L1.md, docs/work/evidence/wr-2026-09-27-ledger-both-halves-integrator.md, docs/work/evidence/wr-2026-09-27-ledger-both-halves-windows-suite.log, docs/work/evidence/wr-2026-09-27-ledger-both-halves-windows-smoke.md
Next: accept, merge into main, then the live check after skills-fable's release
Opened: 2026-09-27T03:58:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T00:05:00-04:00
Base: 7aad49b1cf134a8e1bbb8c0cb4f33a4e26a3c61b
Worktree: build/ledger-both-halves-1
Log: 2026-09-27T04:26:26.000Z owned skills-n picked up skills-fable-ledger-both-halves-1 after lane thirteen merged, ACK sent over ssh on ben-desktop naming the live-check order change, base 7aad49b
Log: 2026-09-27T05:41:42.000Z owned skills-n launch wf_dd31f2cc-bf4: L1 r1 at 097f654, Opus NEEDS_FIXES (reports/L1-review-1.md); the r2 builder hung 40 min on an rm -rf permission prompt after its edits (uncommitted, 01:02 NY); stopped, relaunched with startFrom NEEDS_FIXES at 097f654 against reports/lead-stall-note.md, which also carries skills-fable-ledger-both-halves-3's SKILL.md wording
Log: 2026-09-27T05:58:49.724Z reviewed skills-n seam SKIPPED
Log: 2026-09-27T06:05:14.000Z reviewed skills-n integration Opus APPROVE at 3c6a5f0 (reports/integration-review.md); Windows 1863 of 1863 and real-ssh smoke PASS (reports/windows-suite.md)

Observed: one territory, L1. note-send learns the sender's host from --sender-host or the SSH_CONNECTION/SSH_CLIENT client address, mapped through a four-host table. When that host is another machine, note-send appends the byte-identical envelope line to the sender's ~/.agents/notes/<day>.md over ssh, bounded at 5 s, with no retry and fail open (mirrorLedger in the result). This runs through the peer's own note-send --append-ledger <day>, stdin only, because Windows has no cat and Netcup's non-login shell has no node. L1: Opus APPROVE at b87791b after three rounds. The round-2 builder stalled 40 min on an rm -rf prompt and was relaunched from 097f654. Integration: Opus APPROVE at 3c6a5f0, a code diff identical to L1. Suites at 3c6a5f0: Linux PASS (integrator); Windows 1863 of 1863. Real-ssh smoke from Netcup into ben-desktop via the clone's --append-ledger: exit 0, line byte-identical (LF, no BOM), file grew by exactly one line. Not yet shown: the mirror through the installed shims on both hosts, which is the post-release live check.
