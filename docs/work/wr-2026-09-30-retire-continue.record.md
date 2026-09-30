Work: wr-2026-09-30-retire-continue
Scope: retire the unused continue skill and its continuation hook wiring, per Ben's tick read 5:51 PM 9/29 and the census docs/work/evidence/continue/census-0929.md; measure: top-tier tokens per build (the epoch banner fires on every prompt for zero use)
Owner: skills-o
Status: reviewed
Authority: skills-fable RESULT skills-fable-lane-61-2 on Ben's tick: census first, then retire if unused; merge under the standing grant, install rides the next release
Artifact: build/retire-continue-1@d29ea541771ac501f004c9960f8e4a918e79cbf4
Worktree: build/retire-continue-1
Evidence: docs/work/evidence/wr-2026-09-30-retire-continue-review.md
Next: accept, merge, close
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-30T13:34:00Z
Scratch: C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/588290d9-ee43-400b-a808-cf44c407171c/retire-continue
Base: ee6dcf6564098ac3670cbee14063fbfdf8330a9d
Opened: 2026-09-30T13:46:10Z
Log: 2026-09-30T13:46:10Z owned skills-o retire lane opened
Log: 2026-09-30T14:04:52Z delivered skills-o Sonnet builder removed skills/continue, the continuation runtime and hook wiring; doc fixes at d29ea541771ac501f004c9960f8e4a918e79cbf4
Log: 2026-09-30T14:04:52Z reviewed skills-o Opus APPROVE d29ea541771ac501f004c9960f8e4a918e79cbf4 (r1 two minor doc findings, fixed)
Log: 2026-09-30T14:04:52Z verified skills-o Netcup suite 3327 pass 0 fail at d29ea541771ac501f004c9960f8e4a918e79cbf4; no Continuation epoch banner from either host hook, peer Stop block unchanged

Observed: the continue skill had 0 invocations in six weeks, yet its epoch banner was injected into every lead prompt on every host.
Predicts: top-tier tokens per build drop by the banner's per-prompt cost, with no change to the other three measures because nothing used the skill.
