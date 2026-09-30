VERDICT: NEEDS_FIXES (5) 339f79e296defcacf6515ca26c954146f32bd1e4

# Publication recipe candidate and R2 clarified adjudication: independent review

September 29, 2026, America/New_York. Review lane head: `339f79e296defcacf6515ca26c954146f32bd1e4`. Dotfiles candidate as named in publication-recipe-report.md:7: **`5887cec7f64796836b6f55b0f09402f4cf4790cb`** (parent `f9f0e11addf44cf48fe5aaf04065413f02954225`). This is a prospective prose/policy review, so no bug-fix fields apply.

## Refusal disclosure (operation stopped, nothing substituted)
My one git command against the candidate clone was refused by the permission layer. It would have run `git log -2` on 5887cec, `git diff --stat` and the one-file `git diff` for f9f0e11..5887cec, `git rev-parse` of both SKILL.md blobs, the de16056..f9f0e11 `--quiet` diff, and `git status`/`git branch` on that file. I did not retry it, reroute it (no `git -C`, no other shell), or use the `publication-recipe.patch` copy in its place. So the commit sha, parent, author, single-file delta, blob ids and fresh-base claims below are **unverified**. They come from the builder's report only.

What I did inspect was a separately authorized plain-file read of the working-tree `dot_claude/skills/triage/SKILL.md` in `publication-recipe-checkout`, lines 85-124. It is not a git-verified blob. Every SKILL.md line number below refers to that working-tree file.

## Findings

### F1: BLOCKING (verification gap): candidate identity and single-file delta are unverified
- Evidence: the refused command above. The claims in publication-recipe-report.md:6-9 and :22-26 (sha 5887cec, parent f9f0e11, 2 insertions and 0 deletions in one file, blob `a23dd36f…`, base unchanged since de16056, no scheduled amendment) could not be checked from git.
- Why it blocks APPROVE: an APPROVE here would be a check that passes because it did not look. The working-tree read shows the text, not which commit contains it or what else that commit changes.
- Fix: a lane that has git permission on the clone runs, read-only: `git -C <clone> show --stat --format='%H %P %an' 5887cec7f64796836b6f55b0f09402f4cf4790cb`, `git -C <clone> diff f9f0e11 5887cec -- dot_claude/skills/triage/SKILL.md`, `git -C <clone> diff --name-only f9f0e11 5887cec`, and `git -C <clone> rev-parse 5887cec:dot_claude/skills/triage/SKILL.md`.
- Predicted outcome if the report is accurate: exactly one path, one added paragraph line plus one blank line at the position of SKILL.md:107-108, and blob `a23dd36f6be706706093aed3336c5fa8068c6c4a`. A delta re-review can close F1 using those outputs.

### F2: HIGH: in the supplied sentence, "exactly these commands and nothing else" conflicts with the mandatory checks and the exact-file add
- Exact text (SKILL.md:107): "Publication is exactly these commands and nothing else: stage the allowlisted files, commit, push, verify the pushed hashes."
- Verbatim check: this sentence matches acceptance-criterion-ruling.md:8 character for character. The builder did not paraphrase it.
- Placement: it is its own paragraph, after the publication paragraph (:96-101) and the pre-staged paragraph (:103-105) and before the release recipe (:109-121). Nothing in :96-105 or :109-123 was removed or altered in the lines I read, so the builder's placement preserves the existing text. The conflict is in the wording itself.
- Conflicts, read literally. The sentence is the latest instruction in the section and uses exclusive words ("exactly", "nothing else"):
  - (a) It leaves out the mandatory steps: preservation checks (:97), the no-pre-staged check (:103-104), the staged-set-equals-allowlist check (:98) and the lock release (:109-121).
  - (b) "stage the allowlisted files" is generic. The skill defines staging as exact-file `chezmoi add --secrets error` (:97-98). A reader could satisfy the new sentence with a plain `git add`, which drops the `--secrets error` check. That weakens the preservation and secret contract.
  - (c) "verify the pushed hashes" is narrower than "Verify the remote commit and source/live hashes" (:100-101).
- Smallest clarification for the peer to supply (I am not rewriting the candidate): "After the checks above, publication is exactly these commands and nothing else: exact-file `chezmoi add --secrets error` of the allowlisted files, commit, push, verify the remote commit and source/live hashes, then release the lock as below."
- Predicted outcome: the sentence keeps its purpose (no extra exploratory commands) and can no longer be read as overriding :96-105 or the release at :109-121.

### F3: HIGH: in the supplied sentence, the read prohibition "any other file first" also covers the required checks
- Exact text (SKILL.md:107): "Do not inspect chezmoi configuration, git configuration, hooks, or any other file first; the source repository is already configured, and any such read may hit the secret guard."
- Conflict: the required checks read repository state before publishing. That includes the preservation checks (:97), the staged-index check (:103), the staged-set comparison (:98) and the source/live hash verification (:100-101). "Any other file first" literally forbids them.
- Risk: this is the failure mode the brief warns about. A model that obeys the literal words skips the preservation and staged checks, and those checks then "pass" because nothing looked. The clause's intended target, exploratory configuration reads like the R2 improvised read, is narrower than its words.
- Smallest clarification for the peer: "Do not inspect chezmoi configuration, git configuration, hooks, or any other file beyond what these checks and commands name; the source repository is already configured, and any such read may hit the secret guard."
- Predicted outcome: the R2-type configuration read stays forbidden, and the mandatory checks stay explicitly allowed.
- The trailing "may hit the secret guard" is hedged and states no guaranteed behavior, so I raise no finding on it.

F2 and F3 together are one peer clarification of one sentence. Root cannot resolve them by rewording the candidate. The builder correctly kept the sentence verbatim and flagged these same ambiguities (publication-recipe-report.md:35-41).

### F4: MEDIUM: the adjudication omits the "reports" element of the clarified criterion
- Evidence: the criterion as restated at live-proof-r2-clarified-adjudication.md:7 covers "an improvised read that is abandoned **and reported**" (ruling :13 says "abandons and reports"). The supporting bullets at :11-14 show abandonment (no equivalent read afterward, six later tools, :12), completion and nothing lost. None shows that the nested session reported the denial. In the R2 packet, the denial was found by the runner's exact-session transcript audit (live-proof-r2-report.md:9, :27-40), and the receipt reason is `null` (:17). Whether the nested session self-reported it is not shown.
- Risk: :9 ("R2 evidence supports that narrower condition") therefore presents an unshown element as satisfied.
- Fix: add one bullet after :12, for example: "Reporting: the denial is recorded by the runner's exact-session audit (live-proof-r2-report.md l.27-40); the packet does not show the nested session reporting it itself (receipt reason `null`, l.17). The peer's ruling (acceptance-criterion-ruling.md l.13) applies the criterion to R2 as PASS on these facts."
- Predicted outcome: the conditional PASS then rests on the peer's explicit application, not on an unshown fact. The conclusion at :16 can stand unchanged.

### F5: LOW: missing spaces in the adjudication (mechanical)
- :3 of acceptance-boundary-adjudication.md is out of scope. The instances in the reviewed adjudication are:
  - live-proof-r2-clarified-adjudication.md:11: current `runner80760b3.` → replace with `runner 80760b3.`
  - :13: current `All60 selected` → replace with `All 60 selected`
  - :13: current `All129 pre-existing` → replace with `All 129 pre-existing`

## Verified areas with no defect found
- **Sentence text:** it is the exact peer sentence (SKILL.md:107 matches ruling :8 verbatim). The builder did no speculative repair.
- **Existing text preserved:** in the working-tree lines 85-124, the preservation checks, pre-staged check, exact-file add, staged verification, hash verification and lock-release recipe are all present and intact around the insertion. The scheduled-amendment absence is claimed at report :30, and I could not verify it (see F1).
- **Original R2 report:** live-proof-r2-report.md still reads `VERDICT: FAIL` (:1, :9), and its denial record (:27-40) is intact. The adjudication says the report is unchanged and not re-graded (:5). I did not check document history, because git on the docs repo is out of scope.
- **Criterion clarification is explicit and attributed:** see adjudication :3, :5 and :7, and ruling :12-13.
- **Recipe-step PASS is kept separate from lane acceptance:** :16 says R2 "supports recipe-step PASS with one recorded improvisation denial". :18 says delivery is a prerequisite for using this evidence for lane acceptance, and that no acceptance, merge or installation is performed. The improvisation denial stays recorded (:16), not erased.
- **Mapping stays inside allowed sources:** :11 grounds the claims in de16056, 80760b3 and the existing R2 report (via acceptance-boundary-report.md and acceptance-boundary-adjudication.md). It says that other user-scope instructions were not inspected, and it attributes the "improvised" classification to the peer rather than claiming to know the model's intent. :16 disclaims prose quality, cost savings and unattended behavior. It makes no claim of guaranteed future zero denials.
- **R3 and permissions:** :18 records that root chooses not to run the optional R3, which ruling :13 permits. No new permission is inferred.

## Answer: does clarified R2 evidence support the conditional adjudication?
Mostly yes. Abandonment, completion, nothing lost, recipe-source absence of the settings read, and the preserved original FAIL are all supported by the packet. The one element the packet does not show is "reported" (F4). With the F4 bullet added, the conditional recipe-step PASS rests on evidence plus the peer's explicit application, and it stays conditional on delivery of the instruction.

Delivery should not happen until F2 and F3 are resolved. As worded, the instruction the PASS depends on can be read as removing the preservation checks and the `--secrets error` add.
