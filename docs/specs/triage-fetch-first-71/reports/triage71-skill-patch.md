# Proposed patch for the triage skill's publication paragraph (lead applies; no skill file was edited)

Target: the "commit and push the chezmoi source" paragraph of `~/.claude/skills/triage/SKILL.md` (scout: l.96-110) and its chezmoi source twin `dot_claude/skills/triage/SKILL.md`. I did not read or touch either file; the wording below is written to slot in after whatever sentence says "commit the DIGEST and the curated topics, then push".

## Sentences to add

> Before you commit, the knowledge-triage job has already fetched origin and fast-forwarded the chezmoi source branch, and has refused to start on a dirty tracked tree or a branch that is ahead of or diverged from origin; so your commit lands on a tree that was current when the run began. Make exactly one commit for the run and push it with a plain `git push origin HEAD:<branch>`; never `--force`, never `--force-with-lease`, never `reset`, `stash`, `checkout` or `clean` to get unstuck, and never change the git identity.
>
> If that push is rejected because origin moved during the run, do not retry it in a loop and do not merge: stop after the first rejection. The job repairs this one case after you return: it fetches again, rebases your single commit once onto `origin/<branch>`, and pushes. If that rebase conflicts it aborts the rebase and raises ATTENTION for Ben, so leave the commit in the local branch exactly as it is. The curated lock stays yours to release as the lock section says; neither you nor the repair step clears it on the other's behalf.

## Why the skill text matters

The job repairs only "local ahead of origin by exactly one commit, made since the run began". If the skill makes two commits, amends, or leaves tracked changes uncommitted, the job's repair declines (it prints "repair not attempted: ..." in the ATTENTION reason) and Ben recovers by hand, as before lane 71.
