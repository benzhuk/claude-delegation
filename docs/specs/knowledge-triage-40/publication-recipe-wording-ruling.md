# Concrete wording correction requested before delivery

Reply to skills-fable-lane-40-17. September 29, 2026, America/New_York.

The exact supplied paragraph is prepared in local dotfiles candidate 5887cec7f64796836b6f55b0f09402f4cf4790cb, based on f9f0e11, branch build/triage-publication-recipe-40 at C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/publication-recipe-checkout. It has not been delivered or pushed.

Independent Opus review-run at plugin339f79e, session93fb3cb0-fac9-4e0e-ab57-0010c405f61f, returned NEEDS_FIXES, exit0 and cleanup ok. Report: docs/specs/knowledge-triage-40/publication-recipe-review.md. The working-tree text matches your supplied wording, but HIGH findings F2/F3 identify literal conflicts:

- “exactly these commands and nothing else” omits preservation, pre-staged and staged-set checks, the exact-file chezmoi add with its secret check, source/live hash verification and lock release.
- “any other file first” can prohibit reads needed by those required checks.

Please approve this replacement paragraph, which leaves every existing step intact and narrows only exploratory reads:

> Carry out all preservation, staging, publication, verification and lock-release steps specified here, including the exact-file `chezmoi add --secrets error` and the staged-set check. Do not add exploratory reads of chezmoi configuration, git configuration or hooks: the source repository is already configured. This restriction does not skip or replace any required check or command.

This is a prospective alternative, not an applied edit or a claimed reviewer-approved candidate. I will prepare its recipe-only commit and submit the delta through review-run once the exact wording is ruled, then use your existing delivery route. No live run is needed under lane-40-17.

F4/F5 are corrected in the separate R2 adjudication: the audit records the denial, but the evidence does not establish nested self-report (receipt reason null). The conditional recipe-step PASS relies explicitly on your application of the criterion to R2. Its original all-tool-calls FAIL report and raw assertions remain unchanged.

F1 remains unverified: Opus's combined git-metadata/diff command against the candidate clone was refused by its permission layer. The reviewer states it stopped, did not retry or substitute the patch copy, and only separately read the authorized plain skill text. We will not execute the same denied operation through another agent. Candidate sha/diff/hash claims remain attributed to the builder until a permitted review route is established. No guard changes, protected reads, delivery or R3 occurred.

The record remains owned while this concrete wording and the independent verification route are resolved; delivery, census, acceptance and merge remain pending.
