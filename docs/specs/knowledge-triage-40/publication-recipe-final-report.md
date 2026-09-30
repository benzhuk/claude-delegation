VERDICT: PREPARED

Actual clock: 2026-09-29 22:40 EDT (America/New_York). Authority: skills-fable-lane-40-18 approval (22:38 EDT) of the replacement paragraph in publication-recipe-wording-ruling.md. One new branch, one recipe-only commit. No push, live skill write, lock, SSH, triage, scheduled run, protected read, environment enumeration, guard test, review inspection or peer message. No refusal occurred. Identity of the candidate remains pending fable's independent delivery review; I did not recreate the refused review inspection and do not claim F1 closed. The text has not been live-tested.

## Candidate
- Commit: **`0cf1c5d0bc66f699c74755ed84a92d82cfe4b9b5`**, message `docs(triage): publication forbids exploratory config reads, keeps every required check`, author Ben Zhuk (configured identity), parent `f9f0e11addf44cf48fe5aaf04065413f02954225`.
- Branch: `build/triage-publication-final-40`, local only. Base: dotfiles `main` = f9f0e11, confirmed by a fresh `git ls-remote origin refs/heads/main` after the commit.
- Checkout: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/publication-recipe-checkout` (same isolated clone). The old branch `build/triage-publication-recipe-40` still points at `5887cec7f64796836b6f55b0f09402f4cf4790cb`, untouched. That rejected paragraph ("Publication is exactly these commands and nothing else…") is absent from the new candidate; the two are not combined.
- Commit operation: 1 file changed, 2 insertions, 0 deletions (`dot_claude/skills/triage/SKILL.md`). The working tree was clean (0 status entries) after the commit; the staged set before the commit equalled that path.

## Exact inserted paragraph
Placed as its own paragraph after the pre-staged paragraph (skill :103-105) and before "Release only when `token.txt`…", the same publication position as the rejected version. Markdown backticks kept, no quote marker:

Carry out all preservation, staging, publication, verification and lock-release steps specified here, including the exact-file `chezmoi add --secrets error` and the staged-set check. Do not add exploratory reads of chezmoi configuration, git configuration or hooks: the source repository is already configured. This restriction does not skip or replace any required check or command.

It matches the blockquote in the ruling word for word. No existing line changed: the preservation, pre-staged, exact-file add, staged-set, hash-check and release text are unchanged, and the scheduled-invocation amendment is absent (search for its wording finds no match).

## Hashes (plain candidate text)
| Item | Value |
|---|---|
| Working-tree file, raw (CRLF, 174 CR / 174 LF, 9,984 bytes) sha256 | `C3A993F42A4D985371CF54A6DD88E71E0034CB14728877025A54B5C2D4480692` |
| LF-normalized text sha256 | `b043a29d557dd5606c8673aa84eb450f03d0d4f3ffd727c2dd275bacc5563803` |
| Committed blob | `67d00b09cb1867b064ecbf4609a76862c6cdd4ff` |
| Base file raw | `8588A62AC9AFE6457ABB58CDCFE70AAFA41506E12E60E3F47039780D933B19BA` (base blob `a634c39bebf7b3b7266ff874e4bc9638e5122697`) |
| Patch `f9f0e11..0cf1c5d` (`git diff --binary`) sha256 | `3C4469A230BAAECFFBC61F9D4A6F081D8256BB3D48C81D2451B418B73B80BD28` |
The patch is copied beside this report as `publication-recipe-final.patch`. The expected installed Windows (CRLF) hash after delivery is the raw hash above. These figures are the builder's own measurements from the plain candidate text and the commit operation, not independently verified.

## Not done
No delivery or push (fable owns delivery and its own diff check against main), no review, no R3, no record edit. The commit is not in the maintained repo; fetch branch `build/triage-publication-final-40` from the clone path above.
