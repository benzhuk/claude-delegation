Task: Fix the triage skill's non-secret lock ownership variable name and prepare an environment-name regression test.
Goal: Reduce stalled work caused by misleading variable names while preserving every guard and lock ownership check.
Work: wr-2026-09-29-knowledge-triage
Inputs: probe-r2-report.md, guard-followup.md in this spec directory. Authority skills-fable-lane-40-4 explicitly directs KNOWLEDGE_LOCK_OWNER and a plugin-script regression check.
PROJECT FACTS: Plugin worktree C:/Users/benzh/orca/workspaces/claude-delegation/knowledge-triage-40. Isolated dotfiles worktree C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/dotfiles-owner-fix, branch build/knowledge-lock-owner-40, base b29f3f8593414670c19d66cf03032c7d5916bed8. Maintained source dot_claude/skills/triage/SKILL.md. Real live user skill is byte-identical to this base but must not be edited or applied here.
Territory: only that dotfiles SKILL.md, new plugin scripts/nonsecret-env-names.test.mjs, and scratch report/state. Root owns all docs/work and spec files.
Rename the following old environment identifier to KNOWLEDGE_LOCK_OWNER.
KNOWLEDGE_LOCK_TOKEN
Rename the following old PowerShell identifier to knowledgeLockOwner.
knowledgeLockToken
Preserve on-disk token.txt protocol, exclusive mkdir/wx, random marker generation, case-sensitive match, release behavior and all other skill text.
Commit this one dotfiles path using existing identity, no config/author overrides. No push or chezmoi apply.
Regression design: scan runtime source under scripts, hooks and skills for environment identifier spellings carrying these fragments.
TOKEN
KEY
SECRET
PASSWORD
CREDENTIAL
Distinguish env identifiers from arbitrary internal constants such as the following.
FLAG_KEYS
Cover JS dot/bracket environment reads and env object assignments, shell and PowerShell forms where feasible; document exact static scope, never claim perfect semantic analysis.
Credential names are a reasoned allowlist. Two documented exceptions are confirmed by skills-fable-lane-40-5.
ORCA_PANE_KEY
The preceding identifier belongs to the host, not the plugin.
DELEGATION_RESUME_NOTICE_TOKENS
The preceding legacy identifier belongs to the excluded hook. No hook migration in this lane.
New unclassified secret-shaped environment names fail. Include synthetic classifier cases proving credentials pass and invented non-secret owner names fail.
Do not read credential values or files. Test must be portable and not depend on local dotfiles. Keep file under 800 lines.
Root will independently inspect and reviewer will attack it.
NOT: no guard edits, no denied-command retry, no live settings/skill edits, no scratch HOME git, no API-key auth, no peer notes, no other production files. Do not broaden source scanning to private user configuration.
Evidence: first-line VERDICT PASS or BLOCKED, exact paths/SHA and scoped gate; Cause, Discriminating check, Fix location, Simplification. Record limits and existing exceptions honestly. Keep dotfiles commit separate from plugin test (leave plugin test unstaged for root).
Report: C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/lock-owner-report.md
Gate: node --test scripts/nonsecret-env-names.test.mjs, focused only. No full suite.
State file: same scratch directory lock-owner-state.md.
Autonomy: perform authorized patch and scoped test, stop on any guard denial. Notify promptly once the dotfiles commit is ready, then finish the test.
ETA: 12 minutes.
Ruling for resumed attempt: skills-fable-lane-40-6 identified the prior brief alert as an output-detector false positive, reproduced through the installed hook. A name followed by a colon and digit-bearing prose on one long line triggered its denoised pass; no credential value matched. The peer explicitly directs this short-line reflow and builder rerun. Original brief is preserved at commit 63e71af. Guards remain unchanged, and no genuine secret access is authorized.
