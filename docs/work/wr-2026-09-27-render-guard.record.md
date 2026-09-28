Work: wr-2026-09-27-render-guard
Scope: docs/specs/2026-09-27-render-guard.md@d15cf9e (origin/docs/lane-specs-0925)
Owner: skills-o
Status: reviewed
Authority: skills-fable ASK skills-fable-lane-28-1: build, review, live proof (a refused publish on the real page from an up-to-date main checkout, then a normal publish, and one local note-send refusal), merge on acceptance under the standing grant of 2026-09-26, closing bullet in docs/decisions/history in the merge commit. No release, chezmoi or install.
Artifact: build/render-guard-1@1a493e21cc2bc240bfe694ade4fdde64cb32d459
Worktree: build/render-guard-1
Evidence: docs/work/evidence/wr-2026-09-27-render-guard-review-r2.md
Next: accept, merge with the closing bullet, live proof from the main checkout (refused publish exit 7, normal publish, note-send refusal)
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T22:55:00Z
Base: 53a77f79943aca31bb03bdad1553ba923bb06c6c
Opened: 2026-09-27T22:52:57Z
Log: 2026-09-27T22:52:57Z owned skills-o pack at C:/Users/benzh/Code/render-guard/pack
Log: 2026-09-28T02:38:43Z stalled skills-o round-2 fix 1a493e2 pushed 23:11Z with Netcup 2488/2492 0 fail; the resumed Opus reviewer never wrote review-r2.md and the lead did not notice until skills-fable's status check at 02:38Z; fresh Opus reviewer launched 2026-09-28T02:38:43Z

Observed: publish refuses a dirty docs/decisions tree with exit 7 before any write, including untracked files under status.showUntrackedFiles=no and renames on either side of last-render.md; --dry-run warns on stderr from the CLI; the note-send exit-6 hint names the ssh form and --local-ok. Open minor: the rename split applies to every status line (review-r2, fix in the report). The round-1 reviewer committed once in its own scratch repo with --no-gpg-sign, outside the reviewed tree.

Predicts: no page drift from an uncommitted source file again; the next publish with an uncommitted docs/decisions edit exits 7.
