Work: wr-2026-09-27-multi-cross-host
Scope: docs/specs/multi-cross-host-1/spec.md (the Lane 25 section of docs/specs/2026-09-27-followup-bundle.md read at origin/docs/lane-specs-0925 7e92f16); one territory M1
Owner: skills-h
Status: reviewed
Authority: build, review, push build/multi-cross-host-1, and merge into main on acceptance under the standing grant of 2026-09-26, without Ben; no release or install
Artifact: build/multi-cross-host-1@8ab8e6cb5f5ac1eedb7b27c2b72ffe0766f94c36
Evidence: docs/specs/multi-cross-host-1/spec.md, docs/work/evidence/wr-2026-09-27-multi-cross-host-M1.md, docs/work/evidence/wr-2026-09-27-multi-cross-host-live.md, docs/work/evidence/wr-2026-09-27-multi-cross-host-win-suite-8ab8e6c.log, docs/work/evidence/wr-2026-09-27-multi-cross-host-win-suite-3ba1cb4.log
Next: census, accept, merge into main with the history bullet, RESULT to skills-fable
Opened: 2026-09-27T20:30:00.000Z
Lead-session: ad389ae1-f992-4dd3-8a19-2b51176675c1
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T20:15:00Z
Base: 0c92605
Worktree: build/multi-cross-host-1
Log: 2026-09-27T20:31:00Z owned skills-h ACK skills-h-multi-cross-host-1 sent over ssh on ben-desktop and recorded in the Windows ledger C:/Users/benzh/Code/claude-delegation/docs/ledger/2026-09-27.md; command: ssh benzh@ben-desktop.tail219acd.ts.net "note-send --from skills-h --to skills-fable --kind ACK --topic multi-cross-host --re skills-fable-lane-25-1 --text ..."
Log: 2026-09-27T20:46:00Z owned skills-h Spec-from corrected from 20:40Z to 20:15Z per skills-fable-lane-25-3 (spec file at 04d771b on docs/lane-specs-0925)
Log: 2026-09-27T20:50:00Z delivered skills-h M1 builder (sonnet) DONE 3ba1cb43ebfea2e26aa0ab5804c9a7771698206e, suite 2357 of 2361, 0 fail, 4 skips
Log: 2026-09-27T20:51:00Z rejected skills-h live probe: branch note-send from Hetzner to skills-fable refused exit 6 with no ledger line; the same with --sender-host zhuk-vps32 also exit 6 (the pinned hint is wrong for a local run)
Log: 2026-09-27T20:52:00Z rejected skills-h live-proof ASK skills-h-lane25-live-proof-1 (Needs: ack by 17:45) sent over ssh on ben-desktop with --sender-host zhuk-vps32, delivered to skills-fable's inbox; skills-fable ACK skills-fable-lane25-live-proof-1 at 16:52 NY
Log: 2026-09-27T21:05:00Z rejected skills-h Windows suite at 3ba1cb4 2359 of 2361, 0 fail, 2 skips; Opus review (opus) NEEDS_FIXES 3ba1cb4 (F1-F4 minor, F5-F7 nit), findings docs/specs/multi-cross-host-1/reports/M1-review.md; round 2 rulings in addendum-M1-r2.md
Log: 2026-09-27T21:05:30Z delivered skills-h M1 round 2 (sonnet) DONE a7b2242, suite 2364 of 2368 0 fail; Windows 2366 of 2368 0 fail
Log: 2026-09-27T21:08:00Z rejected skills-h Opus delta review (opus) NEEDS_FIXES a7b2242 (R2-1 dry-run docs, R2-2 stamped-host test)
Log: 2026-09-27T21:10:00Z delivered skills-h M1 round 3 (sonnet) DONE 8ab8e6c, suite 2365 of 2369 0 fail; Windows 2367 of 2369 0 fail, 2 skips
Log: 2026-09-27T21:14:00Z reviewed skills-h Opus delta review r3 (opus) APPROVE 8ab8e6cb5f5ac1eedb7b27c2b72ffe0766f94c36

Observed: One Sonnet builder over three rounds (round 1 DONE 3ba1cb4, then 7 review findings and 2 delta findings, all minor or nit), and one Opus reviewer with APPROVE at 8ab8e6c. Sealed suite green on Hetzner and Windows at every round. Live on real state: the branch's note-send refused a plain Hetzner send to skills-fable with exit 6 and wrote no ledger line. The ACK and an ack-only ASK reached the Windows ledger over ssh. skills-fable ACKed it the same minute. On a copy of Hetzner's real notes at 18:05 NYC, base note-flush fires the false overdue nudge (nudged 1) and the branch does not (nudged 0). Finding for the spec owner: the pinned hint's "or pass --sender-host <this host>" does nothing on a local run (live exit 6). The prose and docs now say to run note-send on the recipient's machine over ssh with --sender-host <origin host>. The JSON hint is unchanged. The installed flushers keep the old rule until a release is installed.
