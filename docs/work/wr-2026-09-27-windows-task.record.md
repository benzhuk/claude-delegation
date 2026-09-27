Work: wr-2026-09-27-windows-task
Scope: docs/specs/2026-09-27-followup-bundle.md@7e92f16 (origin/docs/lane-specs-0925), section Lane 22, windows-task
Owner: skills-o
Status: reviewed
Authority: skills-fable ASK skills-fable-lane-22-1: build, review, live proof on Windows, merge on acceptance under the standing grant of 2026-09-26, post the Closed entry. Ben approved the janitor timer on all four hosts on 2026-09-27 12:38 PM NY. No release, chezmoi or install beyond the timer.
Artifact: build/windows-task-1@899a6e615d895aea074c51e25e3f116329f5cbd4
Worktree: build/windows-task-1
Evidence: docs/work/evidence/wr-2026-09-27-windows-task-review.md
Next: accept, merge to main, Closed bullet in docs/decisions/history, final --enable from the main checkout
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T20:15:00Z
Base: 0c926057a948c4365cf92d82d8fb584cbcc77dcd
Opened: 2026-09-27T20:30:59Z
Log: 2026-09-27T20:30:59Z owned skills-o pack at C:/Users/benzh/Code/windows-task/pack
Log: 2026-09-27T20:46:55Z delivered skills-o Sonnet builder 899a6e615d895aea074c51e25e3f116329f5cbd4: task xml written as UTF-16LE with BOM and encoding=UTF-16, readMarked decodes a BOM-led .xml as UTF-16 before the marker check; gate 72 pass 0 fail
Log: 2026-09-27T20:46:55Z reviewed skills-o Opus APPROVE 899a6e615d895aea074c51e25e3f116329f5cbd4; live on ben-desktop at 2026-09-27T20:42:49Z: --enable --json exit 0 with schtasks /Create /XML accepted, schtasks /Query showed Next Run Time 9/28/2026 6:00:00 AM Status Ready, --remove --enable exit 0 then Query said the task cannot be found; Netcup 2346/2350 0 fail 4 skipped

Observed: schtasks accepts the UTF-16 task xml on Windows (0.20.15 UTF-8 file was refused with "unable to switch the encoding"). The /TR fallback was not needed. An old 0.20.15 UTF-8 file is still recognised as ours and overwritten (review probe). The live runs used --force-root from the branch worktree; the final --enable is run from the main checkout after the merge so the task does not point at a worktree. The collect-status job is NOT wired on Windows in this lane; the collector runs on Netcup only. Minors open: three byte-identical test checks read the UTF-16 file as UTF-8 (test :1192, :1211, :1239); the BOM at install-janitor-timer.mjs:284 is a literal character, better written as an escape.

Predicts: the janitor records a run on ben-desktop at 6:00 AM NY on 2026-09-28 and last-run.log exists after it.
