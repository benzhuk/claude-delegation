# Scout: census68 (census half of item 3, item 4, item 6). Read at base 0f910a7a.

## 1. Files and symbols
- Item 6: the per-phase state-file WRITE is `skills/team-build/references/build-loop-workflow.js` line 626 (`stateOpts = { agentType: 'delegation:runner', model: 'sonnet', schema: STATE_WRITE, ... }`). The spec says "near line 567"; that line is now the startFrom check, so the cited line has DRIFTED. The state READ (line 640, label `state:read`) is also sonnet; the spec names only the write.
- Item 3 census half: the stall census is `scripts/four-read.mjs` `computeWorkLostOrStalled()` (lines ~606-680), documented in `docs/census.md` ("Work lost or stalled", ~lines 425-500). Today it knows `stalled` (lead gap over 30 min outside agent spans) and `waiting-on-agents`. There is NO "pane silent" and NO "waiting on a peer" category anywhere in the tree (grep). The leading integer of the Number 4 value is parsed by `scripts/work-record.mjs`; it must not change meaning.
- Item 4 reader: no script reads the guard log. The log is written by the dotfiles guard (`~/.claude/hooks/secret-guard.sh`) to `$XDG_STATE_HOME/secret-guard/denials.log` else `~/.local/state/secret-guard/denials.log`: tab-separated UTC ISO time, phase, tool, pattern NAME, command text (<=300 chars, one rotated generation `.1`). Spec: `docs/specs/secret-guard-60/spec.md` Phase 1. It is per machine and carries no session id, so "per build" can only be a time window (record Opened to accepted). Off switch `~/.agents/ws-off-guard-log`.
- Item 4 detector: the guard hook, its selftest and the denoised pass (`denoised_key_hit`) live in the DOTFILES repo, not this plugin repo; nothing in this repo contains them. Today's refusal (census-read file, item 11) is the PreToolUse "command references a secret file" deny (log pattern `secret_path_default_deny`), not the PostToolUse denoised pass.

## 2. Helpers to reuse
- `scripts/four-read.mjs`: `collectLedgerEntries`, `ledgerInWindow`, `computeCompletenessSuffix`, `computeNotesToLead`, companion-line structure (`report.companions`); window ms from `openedMs`/`acceptedMs`.
- `scripts/build-census.mjs`: lead timestamps and `computeStallNudges`; `scripts/work-census.mjs` and `scripts/work-record.mjs` for record status parsing (`STATUSES`, Log parser).
- `scripts/test-home.mjs` and `scripts/build-census.fixtures/` for tests that must not touch a real home.

## 3. Tests that police this area
- `skills/team-build/references/build-loop-workflow.test.mjs`: `PINNED_PAIRS` (line ~131) lists only builder/sonnet, reviewer/opus, integrator/sonnet, runner/sonnet and the L-C4.4 test fails any other pair, so a runner/haiku pair must be added deliberately; line ~2024 asserts every state write is sonnet; line ~252 requires "Never send peer notes." in each mandate constant.
- `scripts/four-read.test.mjs`, `scripts/four-read.completeness.test.mjs`: exact Number 4 strings and companion rows; `scripts/build-census.test.mjs`, `build-census.completeness.test.mjs`; `scripts/work-record.test.mjs` (stall-check parse of the leading integer).

## 4. Open questions for the spec
- "Waiting on a peer" is not an existing category. What is the evidence for it: a ledger ASK from the lead still unanswered in the gap, or the existing waiting-on-agents spans? Default in the brief: a gap is "waiting on a peer" when the lead has an unanswered outbound ASK to a peer in the ledger at the gap start, else "pane silent" when the record's Status is `owned` (the only working state in `STATUSES`; `runnable`, `delivered`, `reviewed`, `blocked` are not), else unclassified.
- Item 4's detector half edits the dotfiles repo (chezmoi path; the lane record has `Artifact: none` and no `Artifact-repo`, and the lean rules ban writing chezmoi paths). Default: census68 does NOT touch it; it reports the proposed pattern and test as text for the lead.
- Denials are host-local; a build spans hosts. Default: report the count for the host the census runs on, labelled with the host, and "unavailable" (never 0) when the log is missing.
- Should the "PostToolUse guard report is a report" sentence also go into the six mandate constants of the workflow file (hooks68 cannot touch that file)? Default: yes, census68 adds one sentence to each.
