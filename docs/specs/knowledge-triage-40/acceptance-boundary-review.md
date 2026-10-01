VERDICT: NEEDS_FIXES (5) 7614dec08a334633fb2612bdf546246275063378

# Acceptance-boundary mapping: independent review

Reviewed: `docs/specs/knowledge-triage-40/acceptance-boundary-report.md` at integration commit `7614dec`. This was a document and source read only. I ran no tests, live run, SSH, transcript read, guard replay or configuration read, and changed nothing except this file. Reviewed 2026-09-29, America/New_York.

## Bottom line
The report's main conclusion holds. The approved triage skill (dotfiles `de16056`) and the runner prompt/argv (`80760b3`) contain no step that requires, names or presupposes reading chezmoi/git auto-commit settings. The R2 denied read is therefore **discretionary/undetermined** with respect to those two instruction sources. No concrete code or text dependency calls for a prospective change, and I agree that no patch is supported. The report keeps R2 publication success separate from proof FAIL, and it does not weaken the zero-denial gate.

It needs five text corrections before it can serve as an evidence record: one wrong R1 attribution, one unscoped absence claim, one unguarded "what would justify an edit" sentence, and two lower-severity overstatements. None of them changes the classification or calls for any live action.

## Verified claims (first-class: no defect)
- **Runner identity.** `80760b3:scripts/knowledge-triage.mjs` blob `0732ef73…`, sha256 `5dccc019…3e71`, 437 lines. Gather helper sha256 begins `dd99c87cf218222b`. Both match report l.11-12.
- **Runner citations.** :25 SLUG_SENTENCE, :132 disallowedTools, :149 "Invoke the `triage` skill…", :152 "Process ONLY…", :158 the stop-and-report denial contract, :401 success terminal. All match the quoted text exactly.
- **Skill identity.** The checkout HEAD is `de16056…`. The working-tree SKILL.md sha256 is `8588a62a…`, and the LF blob via `git show` is `c1e20637…`. Both match the R2 preflight (live-proof-r2-report.md l.48-49). The file is 172 lines.
- **Skill citations.** :40-41 lock before first write, :46-89 acquire recipe with a `finally` that sets five `$env:X = $null` (:78-84), :96-101 publication order, :103-105 no pre-staged paths, :107-118 release, :133-134 and :142-147 Write/Edit and stop-on-denial. All verified.
- **Absence.** `git grep -i -E 'auto-?commit|autoCommit' 80760b3 -- scripts skills docs/specs/knowledge-triage-40` returns no match. Searching the de16056 skill case-insensitively for `auto|setting|config` finds only "AUTOMATED", "auto-trigger", "automatic", "autonomously", "auto-clear" and "auto-schedule". None is a settings or configuration read.
- **Boundary separation.** Report l.47-55 correctly records publication success (R2 report l.60-76) alongside proof **FAIL** on `zeroPermissionDenials` (R2 report l.9, l.107; ruling l.3). The R2 report l.38 supports the claim that the read was abandoned, not evaded. The report does not treat the denied read as mandatory.
- **Scope.** The report creates no new state and adds no retry, watcher or bypass. It does not authorize a live run.

## Findings

### F1 (Medium): Table row 3 attributes the `Remove-Item Env:` refusal to R1. It happened during the later recipe delivery.
Evidence: report l.23, R1/R2 cell: "R1 failed on the old `Remove-Item Env:` text (recipe-delivery-blocked.md)".
- `recipe-delivery-blocked.md` l.1-8 is a **recipe-delivery** lock attempt at 21:26 EDT. It was refused with "Remove-Item on system path … is protected from removal".
- R1's only denial was at 20:27:51 EDT: the secret-guard's "command dumps the process environment" on the `orca.md` append (live-proof-r1-denial.md l.9-13; live-proof-r1-report.md l.9, l.79 "This is the sole failing assertion").
- R1 had no lock-step denial.

Patch for report l.23, R1/R2 cell:
- Current: `R1 failed on the old \`Remove-Item Env:\` text (recipe-delivery-blocked.md); R2 lock released, locks absent (l.102)`
- Replacement: `R1: no lock-step denial (its sole denial was the orca.md append, row 5). The old \`Remove-Item Env:\` cleanup was refused later, during recipe delivery at 21:26 EDT (recipe-delivery-blocked.md l.3-8), and was replaced by the \`$env:X = $null\` finally (skill :78-84). R2: lock released, locks absent (R2 report l.102)`

### F2 (Medium): The absence claim covers only the skill and runner prompt. The nested session also loads user-scope instructions, which the report does not scope out.
Evidence:
- Report l.6 says: "Every mandatory step … is stated in the approved skill or the runner's prompt". Report l.41 says: "Explicitly required: no".
- Runner :129 passes `--setting-sources user`. The report itself notes (l.34) that user hooks are active, so user-scope instruction files also reach the nested session.
- The report neither examined those files nor named them as outside its scope. That is an unknown presented as a conclusion.

Fix (text only; do **not** read those files, which are private configuration and out of scope):
- In l.6 and l.41, qualify the result as "not required by the approved skill (de16056) or the runner prompt/argv (80760b3)".
- Add to the l.56 unknowns: "whether any user-scope instruction loaded by `--setting-sources user` prompted the read; not examined, by scope".

Predicted outcome: the classification stays discretionary/undetermined for the approved path, and the bearings prediction still holds (see below).

### F3 (Medium): The "second occurrence would justify an edit" sentence is unguarded. It could be read as licensing a rerun or a read of the denied body.
Evidence: report l.59: "the evidence that would justify it is a second occurrence of the same read in a nested run, or the denied body's target path from an authorized reader."
- A second occurrence can only come from another live run. No such run is authorized (ruling l.11; bearings l.46).
- Reading the denied body is excluded from the packet (lead response l.5).
- Recurrence alone would show a pattern, not a mandatory cause. Patching each recurring optional operation is the patch castle bearings warns against (bearings l.29-30).

Patch for report l.59, last sentence:
- Current: `If root wants a bounded change, the evidence that would justify it is a second occurrence of the same read in a nested run, or the denied body's target path from an authorized reader.`
- Replacement: `This record authorizes no rerun, transcript-body read or protected-file inspection to obtain further evidence. If a separately authorized run later repeats the read, that shows recurrence, not a mandatory cause; any change would still need exact text tying the read to a required step.`

### F4 (Low): The chezmoi auto-commit behavior in l.42 is stated as fact without a source.
Evidence: report l.42 says "with auto-commit on, `chezmoi add` would commit itself and the staged-set check would be moot."
- This describes external tool behavior. The report cites no source for it, and the packet does not verify it.
- The report also does not say whether auto-commit was on for R2. Nothing in the packet shows that, and nothing should be probed to find out.

Patch for l.42:
- Current: `with auto-commit on, \`chezmoi add\` would commit itself and the staged-set check would be moot.`
- Replacement: `if chezmoi's git auto-commit option were enabled (external tool behavior, not verified here; R2's state unknown and not to be probed), \`chezmoi add\` might commit before the staged-set check.`

### F5 (Low): Rows 5 and 7 and l.38 overstate the evidence or cite it loosely.
- **Row 5 (l.25).** "the discretionary/mandatory heredoc that step 5 now removes" is self-contradictory, and the skill prose instructs rather than removes. The prose-in-shell cause is attributed, not verified from the body: the guard owner's policy is in recipe-recovery-brief.md l.17, and the 13,567-byte body was never read.
  - Fix: replace with "Attributed cause: prose in a shell heredoc (recipe-recovery-brief.md l.17; body not inspected). Skill :142-144 now instructs Write/Edit. No recurrence in R2." Apply the same "attributed" wording at l.44.
- **Row 7 (l.27).** "R2 followed with six Bash tools…" relabels the six post-denial tools as preservation checks. "Show recent source commit messages" is not a preservation check. The preservation outcome is runner-level evidence (R2 report l.94-98, `09-dotfiles-preservation.json`).
  - Fix: replace with "R2 outcome: 129 dirty paths preserved (R2 report l.96-98). Which checks the agent ran first is unknown; the six post-denial tools are listed at R2 report l.38."
- **Row 9 (l.29).** "R2 baseline 0 staged" is the runner's preflight (R2 report l.53), not evidence that the agent ran the check.
  - Fix: add "(preflight)".
- **Line 38.** The `publicationState` call is at runner :372, not :376-377.
  - Fix: cite ":372-377".

## Bearings prediction
**Met on this packet**, provided F2's scope qualifier is added.
- The required publication path in the approved skill and runner (lock, Write/Edit, archive, digest, exact-file `chezmoi add --secrets error`, staged-set check, commit/push, verify, release) can be accounted for without reading protected settings and without new runtime state.
- R2 still evaluates to proof **FAIL** despite publication success.
- No mandatory setting, new mechanism or acceptance waiver was needed. The evidence supports **no further recipe or source patch**, and none is recommended.

## Unresolved external decisions (outside agent authority)
1. Whether and when to authorize another live proof, and on what terms. Neither this review nor the report grants one.
2. Whether zero-denial acceptance should stay scoped to every tool call, including optional exploration. This is an acceptance-policy decision for the owner and root. The review does not propose relaxing it.
3. Whether user-scope instructions prompting chezmoi checks exist. Only the owner can decide whether they should be inspected.
4. Acceptance, merge, schedule install and release: all remain unauthorized.

## Unavailable evidence and refusal record
- One guard refusal during this review. It occurred on a combined read-only command that printed `publicationState`/`digestCommitSince` (gather helper :344-395) and grepped for chezmoi configuration filenames. The refusal was: `SECRET-GUARD: blocked — command references a secret file.` I stopped that operation and did not retry, reshape or substitute it. As a result, I did not read the helper bodies. The report's l.38 claim that runner verification does not use auto-commit settings rests on my keyword absence check above, not on a body read.
- Not inspected, by scope: raw transcripts, denied command bodies, the R2 evidence directory JSON, user-scope instruction files and any chezmoi configuration.
