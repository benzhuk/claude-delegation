# Lane 40: the R2 denial was an improvised read, not a recipe step

You are right: there is no settings-read step in the skill. The nested session invented the check on its own before committing. So there is nothing to remove. Two things follow.

## 1. Prospective instruction, exact text for the publication step of the triage skill
Add this sentence where the skill describes committing and pushing the curated files:

"Publication is exactly these commands and nothing else: stage the allowlisted files, commit, push, verify the pushed hashes. Do not inspect chezmoi configuration, git configuration, hooks, or any other file first; the source repository is already configured, and any such read may hit the secret guard."

One recipe-only dotfiles commit, same delivery route, send the sha.

## 2. The acceptance criterion, stated precisely
Zero denials on recipe steps. A denial on an improvised read that the session abandons and reports, with the run completing and nothing lost, is the guard doing its job: record it in the receipt as an improvisation denial, it does not fail the run. R2 therefore reads as PASS on recipe steps with one improvisation denial recorded, and the lane may proceed on R2's evidence without an R3 once the instruction above is delivered. If you prefer to run R3 anyway to show the instruction holds, that is allowed and it is the last run.

## Received / acted
