VERDICT: MAPPED

Offline evidence mapping only. No live run, SSH, test, guard probe, denied-command replay, raw transcript, settings or configuration read; no source, record, commit, Notion or peer action. No refusal occurred. Reported 2026-09-29 ~22:20 EDT (America/New_York).

## Result in one paragraph
Every mandatory step of the triage publication path is stated in the approved skill or the runner's prompt, and none of them names, requires or presupposes reading chezmoi/git auto-commit settings. The R2 denied read (`Check chezmoi git auto-commit settings`) is therefore **discretionary/undetermined**: not explicitly required, and at most defensible as the agent's own precaution about one implicit assumption (section 4). R2 publication succeeded; R2 proof stays **FAIL** on `zeroPermissionDenials`. This record does not support a recipe or source edit (section 6). The zero-denial condition is not weakened.

## Inspected identities
| Item | Revision / hash |
|---|---|
| Runner `scripts/knowledge-triage.mjs` | `git show 80760b3:` blob `0732ef730df3a727fb66046b7f0fc43475b3fc04`, sha256 (LF) `5dccc0194be70f2efc962c050ba2f695bd2cdae8fedeafc652cbd05594513e71`, 437 lines |
| Helper `scripts/knowledge-gather.mjs` (searched only) | `git show 80760b3:` (commit `80760b3bea59b8d8641537b1ae3749388f13f575`), sha256 prefix `dd99c87cf218222b` |
| Recipe/skill text | dotfiles `de1605691444c3595a0804a4ecece664c2dec27d`, `dot_claude/skills/triage/SKILL.md` sha256 `8588a62ac9afe6457abb58cdcfe70aafa41506e12e60e3f47039780d933b19ba` (plain skill text from the Scratch checkout; equals the R2 preflight's Windows installed hash) |
| Reports | integration repo HEAD `f4a9c66f2fa7f32303e370ccda4ae689a4ddcfaf`; live-proof-r2-report.md `5d74bac7…`, bearings-live-r2-assessment.md `5660466b…`, live-proof-r1-report.md `9170ebc3…` (sha256 prefixes) |

## Mapping: required steps to exact text
Skill line numbers are the de16056 file; runner line numbers are the 80760b3 file.

| # | Required step | Exact short excerpt and location | Depends on settings read? | R1 / R2 evidence | Limit |
|---|---|---|---|---|---|
| 1 | Invoke the skill first | runner :149 "Invoke the `triage` skill with the Skill tool as your first action" | No | R2: first tool was `Skill` `triage` (report l.23) | |
| 2 | Process only the selected notes, slug = filename | runner :152-155 "Process ONLY these N notes…", `SLUG_SENTENCE` (:25) | No | R2: 60 selected, 60 archived | |
| 3 | Acquire shared curated lock before first write | skill :40-41 "acquire the shared exclusive lock **before** the first triage write"; PowerShell/Node acquire recipe :46-85 (cleanup now five `$env:X = $null`) | No (env vars named in the recipe only) | R1 failed on the old `Remove-Item Env:` text (recipe-delivery-blocked.md); R2 lock released, locks absent (l.102) | |
| 4 | Read INDEX and topic files, decide merge/new/reject | skill :133-134 "Read `INDEX.md`; open the topic file(s)… Decide, using the original rubric" | No | R2: topics touched per receipt | Semantic quality not measured |
| 5 | Write prose with Write/Edit, no shell heredocs | skill :142 "Use the Write or Edit tool (apply_patch in Codex sessions)… Keep knowledge text out of shell command strings and heredocs" | No | R1 denial: `Append new Orca sections to orca.md`, "command dumps the process environment" (live-proof-r1-denial.md); R2 has no such denial | R1 cause is the discretionary/mandatory heredoc that step 5 now removes |
| 6 | Archive with disposition, append DIGEST | skill steps 2-3 (`_inbox/_archive/…`, `DIGEST.md`) | No | R2: 60 archived, one DIGEST line each | |
| 7 | Preservation checks first | skill :96-97 "Run preservation checks first" | No, but check content unspecified (see 4) | R2 followed with six Bash tools: recent commit messages, add, staged set, commit+push, hash verify, lock release | The exact check is the agent's choice |
| 8 | `chezmoi add --secrets error` on the allowlist only | skill :97-98 "exact-file `chezmoi add --secrets error`, require the staged set to equal the allowlist" | Not stated | R2 publication verified (`f9f0e11…`, exactly one commit) | |
| 9 | No pre-staged paths | skill :103-105 "Before `chezmoi add`, require that no path is already staged" | No | R2 baseline 0 staged | |
| 10 | Commit and push allowlist only | skill :98-99 "then commit and push only those paths under the standing knowledge-only grant" | No | R2 before `de16056…`, after `f9f0e11…`, remote equal | |
| 11 | Verify remote and hashes, release lock | skill :100-101, release recipe :105-115 | No | R2 all publication assertions true | |
| 12 | On any denial: stop that step, report, no reroute | runner :158 "stop that affected step immediately and report the exact denial. Do not retry through another shell, tool, command shape…" | This is the denial contract | R2: `preventedContinuation: false`, six later tools show no equivalent read (17-denial-followup-window.json, per report l.38) | Summary comparison not reproduced by me |

Runner environment that shapes the nested session (runner :127-133): `--setting-sources user`, `--permission-mode auto`, `--permission-prompts none`, tools `Skill,Read,Glob,Grep,Edit,Write,Bash`. The user's PreToolUse `secret-guard.sh` is therefore active for every nested Bash call, so any discretionary Bash whose text names a protected file is denied. `--disallowedTools` bans only Agent and named CLIs (`claude`, `codex`, `note-send`, `orca`, `ssh`, `scp`, `curl`) (:132), not reads of settings.

## Dependency status
- Steps 1-11 are sequentially dependent only on each other (lock, then writes, then publication, then verification, then release). None of them has an input from a settings file. Step 8's stated result, "staged set equals the allowlist", is the only place a hidden precondition exists (section 4).
- The runner performs its own read-only verification after the nested session (`publicationState` at knowledge-gather.mjs:344, `digestCommitSince` :373, runner :376-377); it does not use auto-commit settings either.

## 4. Is the settings read required?
- **Explicitly required:** no. A search of the runner, the gather helper and the whole `scripts/`, `skills/` and `docs/specs/knowledge-triage-40/` trees at 80760b3 for `autocommit`/`auto-commit` returns no match, and the de16056 skill contains neither word nor any instruction to read chezmoi configuration or settings.
- **Indirectly required:** not shown. One implicit assumption exists: skill :97-99 orders `chezmoi add`, then "require the staged set to equal the allowlist", then commit. That order holds only when chezmoi is not configured to auto-commit; with auto-commit on, `chezmoi add` would commit itself and the staged-set check would be moot. The skill never says to check this and does not say where a check would look. So a cautious agent may reasonably want the fact, but the text supplies no required way to get it, and the recorded run got through the whole publication path without it (report l.38).
- **Discretionary/undetermined:** this is the classification. The R2 description was only `Check chezmoi git auto-commit settings` (report l.31); the input hash is `0700e024…` and the command body is not in the evidence packet. Which file the command named is unknown, and so is whether the agent read it before or after the preservation step (l.38 lists only the six later tools). I did not try to identify it.
- A secondary observation: R1 and R2 were denied by different guard rules (R1: "dumps the process environment" on a 13,567-byte heredoc append; R2: "references a secret file"). No shared recipe instruction explains both, and R1's cause is the prose-in-shell problem the recipe amendment addresses.

## Outcomes each contract permits
| Contract | Publication | Proof |
|---|---|---|
| Runner terminal path (runner :376-401) | `success` receipt if publication verifies | Not defined by it |
| Live-proof R2 ruling (live-proof-r2-ruling.md l.3, l.13) | Must be published and preserved | "Zero guard denials… required"; on refusal, stop the action and report |
| R2 result | Success: 60/60, one commit `f9f0e11…`, locks absent, 129 dirty paths preserved | **FAIL**: one `permission-rule` denial |

## 5. Separate statements
- **Publication success:** established by the R2 report and its assertions (report l.60-76, l.94-105). Not remeasured here.
- **Proof acceptance:** not achieved. `zeroPermissionDenials` is false and the R2 ruling makes it required. Acceptance, merge, install and release remain unauthorized.
- **Unknowns:** the file/command the denied read targeted and when it occurred; whether a fresh nested run would choose the same read; the quality of the curated prose; cost and speed against a baseline; unattended behavior. Also the transcript-layer result-usage field (report l.107) and Mac (no alias).

## 6. Cause before any edit
No cause for a source or recipe change is established: the denied operation is not in any mandatory instruction, and the prompt and skill already say to stop and report a denial, which the run did. The only concrete gap visible is the unstated auto-commit assumption in skill :97-99; whether it is worth a one-line bounded instruction (for example, that the check must not use protected files, or that the assumption is stated) is a design choice for review, and I do not recommend it as a result, since a discretionary read is not shown to be repeated. If root wants a bounded change, the evidence that would justify it is a second occurrence of the same read in a nested run, or the denied body's target path from an authorized reader.

Falsification check per the bearings prediction: the required publication path is accounted for without protected settings and without new runtime state, and R2 still evaluates to proof FAIL despite publication success. The prediction holds on this packet.
