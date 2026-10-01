Work: wr-2026-09-26-gate-under-load
Scope: docs/specs/2026-09-26-gate-under-load.md@b786916
Owner: skills-a
Status: accepted
Authority: engineering, independent review, and branch pushes are authorized; merge is conditional on the recorded accepted-merge standing grant and all acceptance gates; release or installation requires Ben's word.
Artifact: build/gate-under-load-1-g1@0c00422e97755df7d01127e529c8216c756ee8f9
Worktree: build/gate-under-load-1
Evidence: docs/work/evidence/wr-2026-09-26-gate-under-load-G1-report.md, docs/work/evidence/wr-2026-09-26-gate-under-load-G1-review.md, docs/work/evidence/wr-2026-09-26-gate-under-load-windows-sealed.md, docs/work/evidence/wr-2026-09-26-gate-under-load-linux-sealed.md, docs/work/evidence/wr-2026-09-26-gate-under-load-census-unavailable.md, docs/work/evidence/wr-2026-09-26-gate-under-load-focused-load-captures.md, docs/work/evidence/wr-2026-09-26-gate-under-load-main-merge-gate.md, docs/work/evidence/wr-2026-09-26-gate-under-load-result-packet.md
Next: none pending on this record; accepted artifact 0c00422e97755df7d01127e529c8216c756ee8f9 is integrated and merged to origin/main dad0f7933dad4f6d7b2b55b03cd992bf9566ca06; release and installation remain outside this work.
Opened: 2026-09-26T22:42:00Z
Lead-session: 01a0df4c-2809-7520-b1d7-876cc51a87ee
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: docs/specs/2026-09-26-gate-under-load.md@b786916
Base: 68d2a154505665f98280d73e88e4a4d6cf05b020
Log: 2026-09-26T22:42:00Z runnable lead setup authorized; status creation pending branch push
Log: 2026-09-26T22:51:26.927Z owned gate-builder
Log: 2026-09-26T23:25:50.496Z delivered skills-a received builder idle baseline evidence: three focused file runs each PASS 43/43, durations 27.003s, 19.899s, and 12.181s; serial UTC intervals were not retained
Log: 2026-09-26T23:00:57.227Z baseline CAPTURE_UNAVAILABLE for first paired prechange file run; no exit or stdout was retained
Log: 2026-09-26T23:01:47.287Z baseline loaded FAIL 42/43, exit 1: 45 concurrent calls emitted 0 cards; raw log docs/work/evidence/wr-2026-09-26-gate-under-load-G1-prechange-loaded.log
Log: 2026-09-26T23:16:34.431Z delivered skills-a artifact build/gate-under-load-1-g1@0c00422e97755df7d01127e529c8216c756ee8f9; ten loaded post-change file runs exit 0 (suite PIDs 73596 and 71244, both exit 0)
Log: 2026-09-26T23:20:00Z delivered skills-a artifact origin/build/gate-under-load-1-g1@0c00422e97755df7d01127e529c8216c756ee8f9 verified recoverable; builder report copied to integration evidence
Log: 2026-09-26T23:21:47.930Z reviewed native-opus artifact build/gate-under-load-1-g1@0c00422e97755df7d01127e529c8216c756ee8f9 original explicit APPROVE; nondeciding because the Write tool was denied and the reviewer then created focus.mjs through Bash
Log: 2026-09-26T23:27:22.005Z delivered skills-a compliance correction: original review retained as nondeciding evidence; fresh compliant review pending
Log: 2026-09-26T23:31:22.577Z reviewed native-opus artifact build/gate-under-load-1-g1@0c00422e97755df7d01127e529c8216c756ee8f9 fresh Claude Opus claude-opus-5-5 session 6f7e742c-b18b-4ef4-80cb-d58bc65f874f explicit APPROVE; exit 0, permission denials 0, disposable Write route compliant
Log: 2026-09-26T23:32:10.099Z reviewed skills-a artifact 0c00422e97755df7d01127e529c8216c756ee8f9 record-validator correction: compliant native Opus approval remains the deciding evidence
Log: 2026-09-26T23:34:32.235Z integrated skills-a merge commit 99c7c0110f4f5933e580e1c2a42ff1dfaf5d2f64 preserves reviewed artifact 0c00422e97755df7d01127e529c8216c756ee8f9 as an ancestor; no diff from reviewed source in hooks/scripts/sealed test territory
Log: 2026-09-26T23:41:36.438Z gated windows exact 99c7c0110f4f5933e580e1c2a42ff1dfaf5d2f64 PASS 1777/1777, direct exit 0 after one authorized capture repair; first attempt retained CAPTURE_UNAVAILABLE
Log: 2026-09-26T23:34:53.950Z gated linux exact 99c7c0110f4f5933e580e1c2a42ff1dfaf5d2f64 baseline-qualified PASS: direct exit 1 with only allowed H6/V4, 1772 pass/2 fail/3 skipped; lane ten unmerged
Log: 2026-09-26T23:43:07.281Z reviewed skills-a census/four-read unsupported: no active lead JSONL; no usage or measures fabricated
Log: 2026-09-26T23:44:56.036Z reviewed skills-a actual Codex census ran from account CODEX_HOME and is UNSUPPORTED; provisional four-read records only supported snapshot values and unavailable limitations
Log: 2026-09-26T23:44:56.036Z reviewed skills-a artifact 0c00422e97755df7d01127e529c8216c756ee8f9 record-validator artifact handback after gate/census evidence
Census: skipped — Codex census UNSUPPORTED: complete per-build response coverage, conversational lead turns, and native child attribution are unavailable; four-read identity limitations are recorded.
Four numbers: Top-tier tokens per build: unavailable (Codex census UNSUPPORTED: complete per-build response coverage is not established)
Four numbers: Hours ask to accepted: 1.1h; gap unavailable (Codex lead turns are unsupported)
Four numbers: Rework after acceptance: unavailable (seven-day observation window has not elapsed)
Four numbers: Work lost or stalled: unavailable (Codex conversational lead turns and complete child attribution are unsupported; idle baseline UTC intervals were not retained)
Log: 2026-09-26T23:47:46.354Z accepted skills-a artifact 0c00422e97755df7d01127e529c8216c756ee8f9

Observed: Opened is the peer request minute-precision timestamp. The local pack preserves the pinned spec, scout, lead ruling, and contract checks. Three idle focused baselines each passed 43/43 in 27.003s, 19.899s, and 12.181s. Individual raw stdout and exit sidecars are unavailable in retained evidence, and UTC start/end timestamps were not retained; only builder-reported counts, exits, and durations remain. The durable loaded prechange baseline failed 42/43 with direct exit 1: 45 concurrent calls emitted zero cards. Durable raw manifests record each counted postchange run 01–10 with direct exit 0 and actual overlapping suite PIDs 73596 or 71244; the retained non-counted file-7 race is marked load-ended-before-run. Reviewed artifact 0c00422e97755df7d01127e529c8216c756ee8f9 is reachable at origin/build/gate-under-load-1-g1, unchanged in integrated runtime/test territory at 99c7c0110f4f5933e580e1c2a42ff1dfaf5d2f64, and is an ancestor of merged origin/main dad0f7933dad4f6d7b2b55b03cd992bf9566ca06. The sealed Windows gate on 99c7 has direct exit 0 and 1777/1777; Linux is baseline-qualified with only H6/V4 while lane ten remains unmerged. The merged-tree Windows gate on dad0 has direct exit 0 and 1798/1798. A lane-scoped Codex census ran but its complete coverage and four-read transcript identity are unsupported; only labeled provisional measures are retained. Acceptance and main merge completed; release and installation were not performed.
