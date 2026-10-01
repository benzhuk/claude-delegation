VERDICT: MAPPED

Corrected per acceptance-boundary-review.md F1-F5 (see acceptance-boundary-corrections.md). The review verdict remains NEEDS_FIXES with these corrections applied, for root adjudication; this is not an independent APPROVE.

Offline evidence mapping only. No live run, SSH, test, guard probe, denied-command replay, raw transcript, settings or configuration read; no source, record, commit, Notion or peer action. No refusal occurred. Reported 2026-09-29 ~22:20 EDT (America/New_York).

## Result in one paragraph
The publication steps identified in the approved skill (de16056) and runner prompt/argv (80760b3) do not name or require reading chezmoi/git auto-commit settings. The R2 denied read (`Check chezmoi git auto-commit settings`) is therefore **discretionary/undetermined** with respect to those two instruction sources. User-scope instructions loaded by `--setting-sources user` were not examined. Why the model chose the read remains unknown. R2 publication succeeded; R2 proof stays **FAIL** on `zeroPermissionDenials`. This record does not support a recipe or source edit (section 6). The zero-denial condition is not weakened.

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
| 3 | Acquire shared curated lock before first write | skill :40-41 "acquire the shared exclusive lock **before** the first triage write"; PowerShell/Node acquire recipe :46-85 (cleanup now five `$env:X = $null`) | No (env vars named in the recipe only) | R1: no lock-step denial (its sole denial was the orca.md append, row 5). The old `Remove-Item Env:` cleanup was refused later, during recipe delivery at 21:26 EDT (recipe-delivery-blocked.md l.3-8), and was replaced by the `$env:X = $null` finally (skill :78-84). R2: lock released, locks absent (R2 report l.102) | |
| 4 | Read INDEX and topic files, decide merge/new/reject | skill :133-134 "Read `INDEX.md`; open the topic file(s)… Decide, using the original rubric" | No | R2: topics touched per receipt | Semantic quality not measured |
| 5 | Write prose with Write/Edit, no shell heredocs | skill :142 "Use the Write or Edit tool (apply_patch in Codex sessions)… Keep knowledge text out of shell command strings and heredocs" | No | R1 denial: `Append new Orca sections to orca.md`, "command dumps the process environment" (live-proof-r1-denial.md); R2 has no such denial | Attributed cause: prose in a shell heredoc (recipe-recovery-brief.md l.17; body not inspected). Skill :142-144 now instructs Write/Edit. No recurrence in R2. |
| 6 | Archive with disposition, append DIGEST | skill steps 2-3 (`_inbox/_archive/…`, `DIGEST.md`) | No | R2: 60 archived, one DIGEST line each | |
| 7 | Preservation checks first | skill :96-97 "Run preservation checks first" | No, but check content unspecified (see 4) | R2 outcome: 129 dirty paths preserved (R2 report l.96-98). Which checks the agent ran first is unknown; the six post-denial tools are listed at R2 report l.38. | The exact check is the agent's choice |
| 8 | `chezmoi add --secrets error` on the allowlist only | skill :97-98 "exact-file `chezmoi add --secrets error`, require the staged set to equal the allowlist" | Not stated | R2 publication verified (`f9f0e11…`, exactly one commit) | |
| 9 | No pre-staged paths | skill :103-105 "Before `chezmoi add`, require that no path is already staged" | No | R2 baseline 0 staged (preflight) | |
| 10 | Commit and push allowlist only | skill :98-99 "then commit and push only those paths under the standing knowledge-only grant" | No | R2 before `de16056…`, after `f9f0e11…`, remote equal | |
| 11 | Verify remote and hashes, release lock | skill :100-101, release recipe :105-115 | No | R2 all publication assertions true | |
| 12 | On any denial: stop that step, report, no reroute | runner :158 "stop that affected step immediately and report the exact denial. Do not retry through another shell, tool, command shape…" | This is the denial contract | R2: `preventedContinuation: false`, six later tools show no equivalent read (17-denial-followup-window.json, per report l.38) | Summary comparison not reproduced by me |

Runner environment that shapes the nested session (runner :127-133): `--setting-sources user`, `--permission-mode auto`, `--permission-prompts none`, tools `Skill,Read,Glob,Grep,Edit,Write,Bash`. The user's PreToolUse `secret-guard.sh` is inferred to be active for nested Bash calls (from the R1/R2 denial messages naming it; not otherwise verified), so a discretionary Bash whose text names a protected file can be denied. `--disallowedTools` bans only Agent and named CLIs (`claude`, `codex`, `note-send`, `orca`, `ssh`, `scp`, `curl`) (:132), not reads of settings.

## Dependency status
- The inspected instructions order lock acquisition, writes, publication, verification and release. They specify no settings-file input. This does not establish all operational dependencies or the content of uninspected user-scope instructions.
- The runner performs its own read-only verification after the nested session (`publicationState` at knowledge-gather.mjs:344, `digestCommitSince` :373, runner :372-377); no auto-commit keyword appears in them (keyword absence check only; the helper bodies were not read, after a guard refusal during review).

## 4. Is the settings read required?
- **Explicitly required:** no, by the approved skill (de16056) or the runner prompt/argv (80760b3). A search of the runner, the gather helper and the whole `scripts/`, `skills/` and `docs/specs/knowledge-triage-40/` trees at 80760b3 for `autocommit`/`auto-commit` returns no match, and the de16056 skill contains neither word nor any instruction to read chezmoi configuration or settings.
- **Indirectly required:** not shown. Skill :97-99 orders `chezmoi add`, then "require the staged set to equal the allowlist", then commit. Possible interaction with automatic commits is a hypothesis about external-tool behavior, not verified evidence or an established missing precondition. R2's configuration is unknown and not to be probed. The inspected text supplies no settings-read requirement, and the recorded run completed publication after abandoning that read.
- **Discretionary/undetermined:** this is the classification. The R2 description was only `Check chezmoi git auto-commit settings` (report l.31); the input hash is `0700e024…` and the command body is not in the evidence packet. Which file the command named is unknown, and so is whether the agent read it before or after the preservation step (l.38 lists only the six later tools). I did not try to identify it.
- A secondary observation: R1 and R2 were denied by different guard rules (R1: "dumps the process environment" on a 13,567-byte heredoc append; R2: "references a secret file"). No shared recipe instruction explains both, and R1's cause is attributed (not verified from the body) to prose in a shell heredoc, which the recipe amendment addresses (recipe-recovery-brief.md l.17).

## Outcomes each contract permits
| Contract | Publication | Proof |
|---|---|---|
| Runner terminal path (runner :376-401) | `success` receipt if publication verifies | Not defined by it |
| Live-proof R2 ruling (live-proof-r2-ruling.md l.3, l.13) | Must be published and preserved | "Zero guard denials… required"; on refusal, stop the action and report |
| R2 result | Success: 60/60, one commit `f9f0e11…`, locks absent, 129 dirty paths preserved | **FAIL**: one `permission-rule` denial |

## 5. Separate statements
- **Publication success:** established by the R2 report and its assertions (report l.60-76, l.94-105). Not remeasured here.
- **Proof acceptance:** not achieved. `zeroPermissionDenials` is false and the R2 ruling makes it required. Acceptance, merge, install and release remain unauthorized.
- **Unknowns:** the file/command the denied read targeted and when it occurred; whether a fresh nested run would choose the same read; the quality of the curated prose; cost and speed against a baseline; unattended behavior; whether any user-scope instruction loaded by `--setting-sources user` prompted the read (not examined, by scope). Also the transcript-layer result-usage field (report l.107) and Mac (no alias).

## 6. Cause before any edit
No cause for a source or recipe change is established in the inspected skill and runner: neither requires the denied operation, and both already say to stop and report a denial, which the run did. No edit is recommended from this mapping. This record authorizes no rerun, transcript-body read or protected-file inspection to obtain further evidence. If a separately authorized run later repeats the read, that shows recurrence, not a mandatory cause; any change would still need evidence of the dependency it removes.

Falsification check per the bearings prediction: the required publication path is accounted for without protected settings and without new runtime state, and R2 still evaluates to proof FAIL despite publication success. The prediction holds on this packet.
