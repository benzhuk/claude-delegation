VERDICT: APPROVE 72408ccce8a11dcc1bf782b8bae54efa913e8226

# Lane40 portable-cleanup delta review (dotfiles candidate de16056)

Clock: 2026-09-29 21:39 EDT (America/New_York). One reviewer pass. No subagents.

## Pins
- Plugin evidence commit: **72408ccce8a11dcc1bf782b8bae54efa913e8226**. The reviewed worktree is clean (0 porcelain entries). The delta 6a46fda..72408cc touches 10 files, all under `docs/specs/knowledge-triage-40/` plus the work record. The code paths (`scripts skills hooks agents codex templates`) have an empty diff. The report copy at the Scratch root is byte-identical to the one committed in the repo.
- Dotfiles candidate commit: **de1605691444c3595a0804a4ecece664c2dec27d**. It sits on branch `build/triage-portable-cleanup-40` in the Scratch clone `portable-cleanup-checkout`, where branch = HEAD and the tree is clean. Its parent is d96d0b1a97d99f92a7ef7b620ce66808c91bc206, the reported fresh origin/main. Author: Ben Zhuk.
- Candidate `dot_claude/skills/triage/SKILL.md` sha256 (CRLF, checkout bytes): **8588a62ac9afe6457abb58cdcfe70aafa41506e12e60e3f47039780d933b19ba**. The git blob stores LF (9425 bytes, 0 CR, 172 LF). The checkout converts it to CRLF (9597 bytes, 172 CR, 172 LF). Converting the committed blob to CRLF gives exactly 8588a62a…19ba. The base blob converted the same way gives f9924f92…6ec9, the reviewed base. **Skills-fable should compare the CRLF bytes against 8588a62a…, not the raw blob hash (c1e20637…).**

## Diff scope (verified)
- `git diff d96d0b1..de16056 --stat`: one file, `dot_claude/skills/triage/SKILL.md`, 11 insertions and 1 deletion, in two hunks.
- **Mechanical rebuild, byte-exact:**
  1. Base (f9924f92…) with `patch --binary` of the reviewed `recipe-only.patch` (sha 123b1a29…a2ab) gives c60feb3b…3b8a, the r2-approved result.
  2. In that result, I replaced the single original `Remove-Item Env:… -ErrorAction SilentlyContinue` line (it occurs exactly once) with one `  $env:<NAME> = $null` CRLF line per name. The names were extracted by regex from the original line, in their original order.
  3. The output is sha 8588a62a…19ba and `===` the candidate returned true.
  
  So the change is the approved prose bullet plus the five assignments, and nothing else.
- **Every original name is covered, and no others:** KNOWLEDGE_LOCK_PATH, KNOWLEDGE_LOCK_OWNER, KNOWLEDGE_LOCK_HOST, KNOWLEDGE_LOCK_OWNER_PID, KNOWLEDGE_LOCK_STARTED. That is 5 of 5, same order, same spelling. The candidate has 0 `Remove-Item Env:` occurrences.
- **Ownership, exclusive mkdir and release are byte-identical to the base:** they fall outside both hunks. This covers `fs.mkdirSync(lock)`, the `wx` token write, owner.txt, the `$lockOutput -cne $knowledgeLockOwner` check, the release token/contents checks and the `Remove-Item -LiteralPath` release lines (SKILL:107-118).
- **Scheduled text is absent.** Neither `+` line of `scheduled-only.patch` (sha b7421a67…3663, unchanged) appears in the candidate. The `schedul*` mentions at SKILL:29-30, 42 and 172 are base text: they are at base lines 29-30, 42 and 162, shifted by the 10 added lines.

## Independent synthetic child-process check
- Script: `portable-cleanup-review/review-run-72408cc-28b4c428/scratch/review-cleanup-check.ps1` (Scratch only).
- It is derived from the exact candidate, not hand-copied:
  - The input file `scratch/cand-SKILL.md` was written from `git show de16056:…`, converted to CRLF, and hashes to 8588a62a…19ba.
  - The script extracts the body of the only `} finally {` block from that file.
  - It takes the expected names from the base file's original `Remove-Item Env:` line.
  - It requires every body line to match `$env:<NAME> = $null` and the name list to equal the original list exactly.
  - It dot-sources the extracted body inside a `finally`.
- Values: five synthetic markers `reviewer-synthetic-marker-<NAME>` and a control `REVIEW_CONTROL_MARKER=reviewer-control-7f3`. Only these six names are ever queried, and no values are printed except the control's. There was no lock, no node, no deletion and no live path.
- It also starts a grandchild of the same runtime after cleanup and asks it only whether each of the six names is present, which tests whether the variables are inherited.

| Run | Result |
|---|---|
| candidate, pwsh 7.6.6 | bodyLines=5, shapeMatchesOriginalNames=True, set-before=5, still-present-after=0, control intact, grandchild: 5×False plus control True. **PASS, exit 0** |
| candidate, Windows PowerShell 5.1.26100.9549 | same numbers. **PASS, exit 0** |
| mutant: HOST line dropped | after=1, grandchild HOST=True. **FAIL, exit 1** |
| mutant: `OWNERPID` typo | after=1, grandchild OWNER_PID=True. **FAIL, exit 1** |
| mutant: STARTED set to `' '` instead of `$null` | after=1. **FAIL, exit 1** |

The mutants show the check would catch a wrong skill both by its shape check and by behaviour. After the runs, the parent shell has none of the six names set (checked name by name).

The builder's own `env-cleanup-check.ps1` also takes its body from the file, but it runs any text found there without first checking its shape. My shape assertion covers that gap. This is not a finding against the candidate.

## Refusal preservation
I did not rerun, reshape or route around the preserved `recipe-delivery-blocked.md` lock command. I made no lock attempt. **Disclosure:** my first attempt at the final parent-state check included a broad `env | grep`. The secret guard blocked it before it ran, and I did not retry it. It was replaced by name-by-name `${NAME+x}` checks, and no environment output was produced. That refusal came from my own verification command, not the triage recipe.

## Findings
None blocking (0).

## Non-blocking notes (not counted)
- **N1** (kept from r1/r2): "stop that step" does not say what happens to the note whose write was refused. The safe reading is to leave it in `_inbox/`.
- **N2** (kept from r1/r2): the README's F11 sentence says "this skill", kept so the text matches F11 exactly.
- **N4** (new, outside this ruling's scope; the release text must stay byte-identical): the refusal message was `Remove-Item on system path ''`, so the host guard apparently failed to resolve the Remove-Item arguments. The kept release lines (SKILL:117-118) also call `Remove-Item -LiteralPath (Join-Path $knowledgeLock …)` with runtime-computed paths. The guard is built into the host tool and is not a readable hook: its message appears only in session transcripts, not in `~/.claude/hooks`. So I could not show statically whether release is affected, and I did not probe it. If release were refused during a real triage run, the no-retry clause would leave the lock held: safe, but stalled until Ben clears it. Suggestion for root: add "the release step was refused" to the first live run's watch list. The change here does not make this better or worse.

## Bug-fix fields
- Cause: the acquire recipe cleaned up with `Remove-Item Env:…`, which the host PowerShell tool guard refuses before execution. This made the lock recipe unusable on this host (recipe-delivery-blocked.md).
- Discriminating check: the reviewer ran the cleanup extracted from de16056 on synthetic values in a child process, on pwsh 7.6.6 and on Windows PowerShell 5.1. All five names were removed, the control was kept and the grandchild did not inherit the names. Three mutants of the skill text (a dropped line, a typo, a non-null value) each fail.
- Fix location: `dot_claude/skills/triage/SKILL.md` in commit de1605691444c3595a0804a4ecece664c2dec27d, acquire `finally` block only (SKILL:78-84), plus the prose bullet already approved in r2 (SKILL:142-147).
- Simplification: five explicit null assignments replace one cmdlet call, with no enumeration, name scan or new mechanism. No simpler correct form exists that keeps explicit per-name coverage.

## Boundary
This approves the dotfiles candidate text de1605691444c3595a0804a4ecece664c2dec27d / 8588a62ac9afe6457abb58cdcfe70aafa41506e12e60e3f47039780d933b19ba for skills-fable peer review and delivery under lane-40-14. It does not deliver, apply, push or authorize a live proof. `scheduled-only.patch` stays held.

I wrote nothing to the reviewed plugin tree, the candidate clone, the maintained dotfiles, the live skill, notes, Notion, guards or settings, and ran no SSH. My only files are this report and the Scratch-only `review-run-72408cc-28b4c428/scratch/`: base/cand/mutant copies, the check script and an empty `a/`. They are left for the lead's closeout.
