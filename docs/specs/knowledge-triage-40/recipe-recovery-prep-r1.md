VERDICT: PREPARED

Actual clock: 2026-09-29 21:07 EDT (America/New_York). Preparation only: nothing installed, committed, pushed, run or written outside Scratch. No SSH, no guard or permission changes, no cleanup, no retry of the denied operation.

Files (Scratch root C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/recipe-recovery/):
- base-SKILL.md, cand-SKILL.md, base-README.md, cand-README.md, recipe.patch; state in recipe-recovery-state.md (one directory up, beside this report).

## 1. Sources and hashes
- Maintained source: ~/.local/share/chezmoi/dot_claude/skills/triage/SKILL.md, sha256 f9924f92c15db1264610bb87df11fbf18595d749d8280324b9bc1007e8c06ec9. The installed ~/.claude/skills/triage/SKILL.md has the identical hash. Chezmoi HEAD d96d0b1a97d99f92a7ef7b620ce66808c91bc206 (R1's publication commit).
- Maintained README: ~/.local/share/chezmoi/docs/windows-knowledge-update/README.md, sha256 cd295aef4586ce16fcc5d5f7a754b5eda021be375de6aa6047048cd34bb50430.
- Candidates: cand-SKILL.md 9bf2aaed5c45bca1b8eb3253d75c8bc20f9709957d8b6f16dfc8cfb77dae749c; cand-README.md e2fa120b1ddb781e01323033fb06abb4e2105872b907bbb74c4955cc3f278e92; recipe.patch 58faebe7609d87998233047a36c12d2379c1b42821d38650a0b59d99741a229a.
- Other inputs read: live-proof-r1-report.md, live-proof-r1-denial.md, live-proof/20260929-201431/10b-selected-dispositions.json, ledger lines 90 (lane-40-10) and 100 (lane-40-12) of C:/Users/benzh/Code/claude-delegation/docs/ledger/2026-09-29.md, scripts/knowledge-triage.mjs (CAP=60 at :23; selectNotes :214-226; CLI accepts only --manual :425-430; prompt text :151-155). I did not open live-proof-plan.md or release-install-prep.md beyond what the brief summarizes (release-install-prep.md is my own earlier report).

## 2. Minimal recipe amendment (recipe.patch, unified diff against the maintained sources)
1. SKILL.md, after the "Do not auto-trigger" paragraph (line 31): the F11 one-sentence scheduled-invocation exception (spec-r1-adjudication.md:65), unchanged text. It is authorized for installation after acceptance/merge; prepared in the same candidate, not delivered.
2. SKILL.md, step 2 (before "Never rewrite or delete EXISTING topic-file content", now near line 140): one bullet: write topic, INDEX and DIGEST text with the Write or Edit tool, never as text inside a Bash command (heredoc, `cat >`, `echo`), because the secret guard refuses that form; Bash only for moves and hashes; if any tool call is refused, stop that step, record the exact refusal in the digest, and do not retry another way. This follows lane-40-12: the guard refuses only a Bash heredoc carrying the text as command bytes and accepts the same content through Write/Edit (ledger line 100). No retry mechanism is added; the bullet removes the cause instead of retrying.
3. docs/windows-knowledge-update/README.md: same F11 sentence appended to the existing paragraph that says "No ... unattended triage" (line 5) so the two do not contradict.
Recipe text uses no environment-accessor phrases or secret-like strings. Not tested against the guard, by instruction.

## 3. The nine remaining notes (mechanical: 10b-selected-dispositions.json rows with inbox=true, disposition=pending; 60 selected, 51 archived, 9 pending)
Current metadata in ~/.claude/knowledge/_inbox (existence, size, mtime, sha256 only; contents not copied):
| name | size | mtime (UTC) | sha256 |
|---|---|---|---|
| 2026-08-31-orca-project-groups-host-scoped.md | 2460 | 2026-08-31T19:09:41Z | 5c30c67da12ad91439542a8f8ebae7d157b6946716d084635e0d2d197e1f2e4e |
| 2026-09-01-orca-account-ids-per-host.md | 1529 | 2026-09-01T03:41:26Z | bc28d2eab430cf4b08164e71644a71a66cbc427fc2dee836b25fcc72048c6547 |
| 2026-09-02-orca-fork-rebase-gotchas.md | 3916 | 2026-09-02T13:33:08Z | 08ee64a13c2b813fdfbeee4035a04ebe21ab85738d16b55fa2f5ac2cef5fe2ad |
| 2026-09-02-orca-serve-oompolicy-kills-all-claudes.md | 4577 | 2026-09-02T13:29:05Z | 9502fd310306768bd99b6ac63e66c7e89ff206b19aa8558ba423e6b7bf91e780 |
| 2026-09-02-orca-stale-daemon-generation-ownership-unknown.md | 4468 | 2026-09-02T14:12:07Z | 8ca77d0145015fc57a5dd60e68309de6723ddfc828bba58e8ffeca1d07e6fc18 |
| 2026-09-08-accounts-swap-per-host-ids-and-windows-token-carry.md | 2973 | 2026-09-08T21:40:52Z | daf38194b63e8d81724e46dd0811bc72959b1b3f7c1391ae51a9fa485215575f |
| 2026-09-10-orca-register-existing-login-via-rpc.md | 2568 | 2026-09-10T14:44:55Z | acb57cb062515ea6f3f10902f9720a3c2f1f481438446683b443c9e5bab9c6a7 |
| 2026-09-25-orca-upgrade-script-flag-gaps.md | 1935 | 2026-09-25T15:52:30Z | bba9b349035b9d16210c338915254c709e3b0d119a3a2fad591a73cd72bb8fdd |
| 2026-09-25-windows-orca-panes-froze-overnight-os-awake.md | 4177 | 2026-09-25T13:28:46Z | 5b044e6ba7002c5e252a1d8064de3c7c0b08b922eeeb1d4ecfcc0749ff48ba90 |
All nine exist now as regular inbox files. The local inbox holds 37 .md notes now (36 after R1 plus one arrival). All nine are Orca notes, consistent with the denied write having been an Orca section append (orca.md was never touched; denial provenance in live-proof-r1-denial.md).
I did not compare these hashes to their pre-R1 hashes (before-state-files.json holds those); root can confirm they are unchanged.

## 4. Can the existing CLI meet a nine-only scope? NO
- `knowledge-triage.mjs` accepts only `--manual` (:425-430). It always gathers all hosts, then `selectNotes` sorts by note age and takes the oldest CAP=60 of every eligible note (:214-226). No option restricts the set, and none is authorized (no hidden seam, no moved notes, no edited state, no new flag).
- Locally the nine are inbox ranks 3 to 12 by mtime among 37 local notes (I sorted the local mtimes; the runner's ageMs field may differ). With SSH gather now expected to work (SSH ProgramData fix at 80760b3), imported Netcup (103 pending) and Hetzner (16) notes join the pool; the nine are then selected unless 48 or more remote/local notes are older than the ninth-ranked note. Remote ages are unknown to me (no SSH).
- A next `--manual` run would therefore process up to 60 notes, likely including many not in R1's set. It cannot promise "exactly nine".

## 5. Concrete scope choice (no new mechanism)
Choose: the proof for the nine is ONE `--manual` run under the existing cap 60, with the acceptance criterion re-stated as "all nine listed notes are in `receipt.selected` and reach a recorded terminal disposition" (each archived with a DIGEST line, or named residue), not "only nine were processed". Extra oldest-first notes processed in that run are in scope because CAP=60 across all hosts is the accepted contract (rev4.md:21,23). Check, from the receipt and read-only counts after the run: (a) the nine names all appear in `selected`; (b) each has exactly one place and a DIGEST line; (c) zero permission denials in the transcript; (d) Netcup/Hetzner hosts are gathered, not skipped 255, or the skip is recorded; (e) before/after counts and residue named. If a nine-only proof is truly required, that needs a new production seam, which is a separate authorization the brief excludes.
Pre-run read-only precondition (proposal, no live action here): confirm the nine hashes above are unchanged, no ATTENTION/lock, and delivery of the amended skill (patch applied, hash recorded, dotfiles commit) precedes the run under rev3 item 7's procedure; nothing here delivers it.

## 6. Un-agent-able steps and open items
- Review of recipe.patch by an independent high-tier reviewer (F11 requires a fresh Opus delta), then delivery to dotfiles under the lock, commit, push and remote verification: root/lead.
- Whether the amended skill must be installed before the one rerun (it must, or the nested agent may repeat the heredoc form): root decides sequencing with the acceptance and release gates.
- The "60 notes" sentence and the Write/Edit bullet are one review candidate as directed; the sentence is not deliverable until acceptance/merge.
- Ranks in section 4 are local-mtime based and remote ranks are unknown; if root wants certainty about selection, a read-only remote metadata list (names and mtimes only) would need its own authorization.
