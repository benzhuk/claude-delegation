Work: wr-2026-09-27-autolink-guard
Scope: docs/specs/2026-09-27-autolink-guard.md@a7b1d20 (origin/docs/lane-specs-0925)
Owner: skills-o
Status: reviewed
Authority: skills-fable ASK skills-fable-lane-32-1: build, review, second-host suite, merge, publish from main
Artifact: build/autolink-guard-1@72f8b71e0410b55ce5402e5013de6541042f50a0
Worktree: build/autolink-guard-1
Evidence: docs/work/evidence/wr-2026-09-27-autolink-guard-review-r2.md
Next: accept, merge with the closing bullet, publish from main
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-28T03:02:00Z
Base: a06848d249eedd9f7caa3e7b40e9081915aaa910
Opened: 2026-09-28T03:06:46Z
Log: 2026-09-28T03:06:46Z owned skills-o pack at C:/Users/benzh/Code/autolink-guard/pack
Log: 2026-09-28T10:11:12Z delivered skills-o Sonnet builder 3af975a: 83\/83 render tests, full Windows suite 2546 pass 0 fail, real sources render exit 0, and a scratch bare GOALS.md exits 2 naming session.md:9
Log: 2026-09-28T10:27:31Z delivered skills-o Sonnet builder round 2 at 72f8b71e0410b55ce5402e5013de6541042f50a0: F1 angle-bracket exemption narrowed to real autolinks, F2 file-line numbering in session.md
Log: 2026-09-28T10:27:31Z reviewed skills-o Opus reviewer APPROVE 72f8b71e0410b55ce5402e5013de6541042f50a0 after Opus NEEDS_FIXES on 3af975a (F1, F2); Netcup 2561/2565 0 fail 4 skipped at 72f8b71e0410b55ce5402e5013de6541042f50a0

Observed: at 72f8b71, render refuses with exit 2 and the true file:line a bare word.md (md, sh, io, ai, co, me, so, py, final segment), a bare tilde and a bare URL outside a link or a real <http(s)://> autolink, before any write. Current docs/decisions sources render with exit 0.

Predicts: no publish fails after the write on text Notion autolinks. The next publish with a bare GOALS.md exits 2 at render with zero Notion writes, not exit 5 after replace-md.
