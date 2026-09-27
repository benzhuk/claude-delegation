Work: wr-2026-09-26-linux-green
Scope: docs/specs/linux-green-1/spec.md (read at origin/docs/lane-specs-0925 0bac9c6) with lead rulings docs/specs/linux-green-1/contracts.md; one territory L1
Owner: skills-n
Status: reviewed
Authority: build, review, integrate, push build/linux-green-1, and merge into main on acceptance under the merge-on-acceptance rule, without Ben
Artifact: 875efa007a06f1d16266da7448d63cd8cfbd378f
Evidence: docs/work/evidence/wr-2026-09-26-linux-green-review.md, docs/work/evidence/wr-2026-09-26-linux-green-L1.md, docs/work/evidence/wr-2026-09-26-linux-green-integrator.md, docs/work/evidence/wr-2026-09-26-linux-green-windows-suite.log
Next: census, four-read, accept, merge into main
Worktree: build/linux-green-1
Opened: 2026-09-26T22:35:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-26T18:27:00-04:00
Base: 68d2a154505665f98280d73e88e4a4d6cf05b020
Log: 2026-09-26T22:35:00.000Z owned skills-n picked up, ACK sent over ssh on ben-desktop, base 68d2a15
Log: 2026-09-26T22:36:00.000Z owned skills-n red at base on Netcup, isolated: H6 note-send.test.mjs actual '/home/ben/Code/wt-lg/C:/Users/benzh/Code/Zhuk Projects' expected 'C:/Users/benzh/Code/Zhuk Projects'
Log: 2026-09-26T22:36:00.000Z owned skills-n red at base on Netcup, isolated: V4 mirror-shim.test.mjs AssertionError SKILL_FILE_EXCLUDE let a .test.mjs file publish (actual false, expected true)
Log: 2026-09-27T02:25:00.000Z owned skills-n launch wf_7223f595-b7d stalled 3.5h: the builder committed ffc882f at 18:44 NY and hung on an rm -rf permission prompt before its report; stopped and relaunched with startFrom NEEDS_FIXES at ffc882f against reports/lead-stall-note.md
Log: 2026-09-27T02:42:00.000Z owned skills-n relaunch wf_e3b29d48-9a5: L1 APPROVE at a1be589 after 3 rounds (reports/L1-review-3.md), integrated d93e3f2; integrator FAIL, 1 of 1778: registered-pickup.contract.test.mjs:116, intermittent 1 in 5
Log: 2026-09-27T02:50:00.000Z owned skills-n lead ruling, territory widened by one test file: the test built its expected order with localeCompare while decisions-pickup.mjs sorts by code-point key, so mkdtemp's mixed-case suffix flipped it; test now mirrors the key, 0 of 25 isolated reruns fail, de019ec; delta review, Linux and Windows suites launched
Log: 2026-09-27T03:05:00.000Z owned skills-n F1 applied at 875efa0; Linux suite PASS 1775 of 1778, 0 fail (reports/integrator-3.md)
Log: 2026-09-27T03:20:00.000Z reviewed skills-n Opus delta review APPROVE 875efa0 (reports/delta-review-2.md); Windows suite PASS 1778 of 1778 from a bundle with origin/main

Observed: one territory L1. mainCheckout now composes a common dir with path.posix when the start is absolute or drive-lettered, so H6 passes on Linux, and V4 polices the symlink publish mode; Opus APPROVE at a1be589 after three rounds. The first integration run exposed a third Linux-only red, a 1-in-5 flake in registered-pickup.contract.test.mjs (the test sorted with localeCompare, the code by code point); the lead fixed the test and, on the Opus delta review's F1, gave the fixture a fixed-order prefix so the ordinal assertion now catches a creation-order implementation 20 of 20 runs (was 2 of 40). Suites at 875efa0: Linux 1775 pass, 0 fail, 3 skipped; Windows 1778 of 1778. A Windows run from a bundle without origin/main fails decisions-handback.test.mjs:789, a harness gap for the second-host runner, not code.
