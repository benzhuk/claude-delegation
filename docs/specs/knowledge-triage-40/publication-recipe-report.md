VERDICT: PREPARED

Actual clock: 2026-09-29 22:31 EDT (America/New_York). One isolated one-file candidate, one local commit. No push, no delivery, no live skill write, no lock, no triage, no SSH, no schedule, no Notion, no peer message, no guard probe, no protected configuration or transcript read, no identity change. No refusal occurred. The new text has NOT been live-tested.

## Identity
- Fresh base: dotfiles `main` = `f9f0e11addf44cf48fe5aaf04065413f02954225`. The maintained clone's local HEAD and a fresh `git ls-remote origin refs/heads/main` (run before and after the commit) both equal it. The base skill file is unchanged since de16056 (`git diff --quiet de16056 f9f0e11 -- dot_claude/skills/triage/SKILL.md` exits 0).
- Candidate commit: **`5887cec7f64796836b6f55b0f09402f4cf4790cb`**, message `docs(triage): publication is stage, commit, push, verify only`, parent f9f0e11, author Ben Zhuk (configured identity; nothing set).
- Branch `build/triage-publication-recipe-40`, local only, in the new clone `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/publication-recipe-checkout` (`git clone --no-hardlinks` of the maintained clone, then a branch at f9f0e11; the clone was newly created, no reset or cleanup). The previous candidate `portable-cleanup-checkout` was only read (its skill file used for an apply-check) and not changed.
- Territory: exactly one file, `dot_claude/skills/triage/SKILL.md`; 2 insertions, 0 deletions; staged set equalled that path; working tree clean after the commit.

## Exact diff
```
@@ after the "Before `chezmoi add`, require that no path is already staged…" paragraph (skill :103-105), before "Release only when `token.txt`…"
+Publication is exactly these commands and nothing else: stage the allowlisted files, commit, push, verify the pushed hashes. Do not inspect chezmoi configuration, git configuration, hooks, or any other file first; the source repository is already configured, and any such read may hit the secret guard.
+
```
The sentence is copied verbatim from acceptance-criterion-ruling.md §1 (single paragraph, no paraphrase). No other text changed or removed.

## Hashes
| Item | Value |
|---|---|
| Working-tree file, raw (CRLF, 174 CR / 174 LF, 9,903 bytes) sha256 | `469695812D541195A8E41B7D9484935B5ACC5DB8344C2AB319B0096631375E19` |
| Committed blob (git object id) | `a23dd36f6be706706093aed3336c5fa8068c6c4a` (base blob `a634c39bebf7b3b7266ff874e4bc9638e5122697`) |
| Committed content normalized to LF, sha256 | `e6cabcd6890753c3bcf2bdf1d1d82284aef33e66f56b80d8bbdc0d1fd32a6832` (computed on the committed blob text with CRLF replaced by LF) |
| Base file raw (CRLF), sha256 | `8588A62AC9AFE6457ABB58CDCFE70AAFA41506E12E60E3F47039780D933B19BA` (equals the R2-installed Windows hash) |
| Patch `base..candidate` (`git diff --binary`, 834 bytes) sha256 | `0E7BCC78BB54A302250341F89A18A57C5D69E4C239230852F624183E1559FA80` |
The patch is copied beside this report as `publication-recipe.patch` (byte-identical to the Scratch copy) and applies cleanly (`git apply --check`) to the de16056 file. The expected installed Windows CRLF hash after delivery is the raw hash above (the same convention as the portable-cleanup handoff: Git stores LF, compare normalized content on Unix).

## Absence checks
Scheduled-invocation amendment: absent (the candidate contains neither the scheduled sentence nor the README change; a case-sensitive search for its wording returns no match). The de16056 recipe text (prose-writing direction and the five-null cleanup) is present and unchanged because it is already in the base.

## Placement and semantic ambiguity (reported, not resolved)
Placement: the brief asks for the sentence "at the committing/pushing portion of the publication step". The skill states that portion in one paragraph (:96-101: allowlist, preservation checks, `chezmoi add`, staged-set check, commit and push, verify) and then a pre-staged-check paragraph (:103-105). I placed the sentence as its own paragraph after the pre-staged paragraph, so the preservation and pre-staged checks stay intact and precede it, and did not split the publication paragraph.

Conflicts and ambiguities in the exact wording, for root and the reviewer to adjudicate (I did not edit around any of them):
1. "Publication is exactly these commands and nothing else: stage … commit, push, verify the pushed hashes" versus the surrounding required steps. The skill also requires preservation checks first (:97), a pre-staged check (:103-105), the staged set to equal the allowlist (:98), verification of "the remote commit and source/live hashes" (:100-101) and the lock release recipe. The sentence's list omits these. Read literally, "nothing else" could be taken to forbid them; read with its placement (after the checks), it governs only the publish commands.
2. "Do not inspect … any other file first" versus preservation checks and the staged-set check, which read repository state, and the hash verification, which reads files. The sentence names configuration, hooks and "any other file" broadly; the intended scope (avoid exploratory configuration reads) is clear from the ruling, but the words are wider.
3. "Stage" versus the skill's exact-file `chezmoi add --secrets error`: the sentence says "stage" generically; the skill defines staging as that command.
4. "verify the pushed hashes" is narrower than the skill's "remote commit and source/live hashes".
5. The last clause ("may hit the secret guard") is a prediction about the guard, not verified here.
These are ambiguities in exact peer-supplied wording that the brief says to keep verbatim; changing any of them is a decision for root or peer lane-40-17.

## Not done / next
No delivery, no push (fable owns delivery), no independent review (Opus review, peer delivery and acceptance are outside this mandate), no docs/work edit, no R3. The candidate commit is not in the maintained repo; fetch it from the clone path above. The report is not committed anywhere by me.
