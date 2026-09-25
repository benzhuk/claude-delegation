VERDICT: NEEDS_FIXES (7) a7dcd5219520b5135633b11e5c8f8a58b7a69879

# P3 (docs) review: Codex goal and bearings parity

Candidate: a7dcd5219520b5135633b11e5c8f8a58b7a69879, base 7f188b0d0aea4dd5539285aa92b3abab03358d94, checkout C:/Users/benzh/orca/workspaces/claude-delegation/astra-codex-p3 (read-only; `git status --short` stayed empty before and after).
Diff: README.md (+2/-2), docs/native-use.md (+3/-1), skills/bearings/SKILL.md (+1/-1). Inputs read: the parity spec, codex-parity-1/contracts.md, scout-P3.md, territories.md, the builder report, and the four-host 0.20.6 evidence file.

## Findings

### F1 MAJOR: the docs describe as "source behavior" code that exists in no tree yet
- Evidence: README.md:240 says "This is source behavior". docs/native-use.md:49 says "the source adapter adds the project's goal card ... This describes source capability". README.md:62 and skills/bearings/SKILL.md:56 state the Codex lead card/advisory as present fact. At a7dcd52, `hooks/multi-codex-hook.mjs` never imports goal-card or bearings-state: its only matches for goal/bearings/switch are the `classifyCodexRole` import at :34 and :47. `hooks/lib/goal-context.mjs`, the shared helper the contract calls for, does not exist. The P1 worktree (astra-codex-p1) is still at 7f188b0 with a clean status, so no P1 artifact exists anywhere. The packet also says the runtime red-team can still change the contract.
- Consequence: taken alone, or merged ahead of P1, this commit says the checked-in source does something it does not do. That is the exact source-versus-deployed confusion this territory exists to prevent.
- Fix: make P3 depend on the reviewed P1 SHA. Rebase or merge P3 onto P1 only after P1 has been approved. Then re-check every sentence in native-use.md:49, README.md:62, README.md:240 and SKILL.md:56 against P1's final code and its named tests in `hooks/multi-codex-hook.test.mjs`, and change the wording wherever the red-team changed the contract. The work record should say P3 was accepted against P1 <sha>. Predicted outcome: once P1 lands as contracted, the wording is correct, apart from F3 to F6.

### F2 MAJOR: spec P3.2 is not met, because native-use.md still does not give the current install route in order
- Evidence: the spec's P3.2 asks for "the current install route for Claude and Codex on a fresh project (what the 0.20.6 four-host rollout actually ran)". That rollout used the Claude marketplace/plugin plus the Codex shared mirror, with "No duplicate native Codex plugin" (four-host evidence, paragraph 2). docs/native-use.md:21-51 still starts with the native `codex plugin` route, which the rollout did not use. It gives Claude only the update commands (:59-65), not a first install, although README.md:21-22 has `claude plugin marketplace add benzhuk/claude-delegation` and `claude plugin install delegation@benzhuk`. Nowhere does it say which route the hosts use now. The only change is line 3, which names the rollout but gives no steps.
- Fix: before the native-package paragraph, add a short ordered subsection titled "Current route (the 0.20.6 four-host rollout)":
  1. Install or update Claude: `claude plugin marketplace add benzhuk/claude-delegation` then `claude plugin install delegation@benzhuk`, or the update commands.
  2. From the durable checkout you chose, run `node scripts/mirror-shared-skills.mjs --dry-run --json` and then the same command without `--dry-run`.
  3. Run `--codex-hooks-only --dry-run --json` and then `--codex-hooks-only`.
  4. Start fresh sessions.
  5. Check the registered events and the actual execution on that host.

  Then label the `codex plugin` block as the alternative route, never to be combined with the mirror (keep :51).

### F3 MINOR: "on the configured mirrored-hook route" is too narrow and does not say what makes the capability live
- Evidence: both routes run the same adapter. The native package calls `${PLUGIN_ROOT}/hooks/multi-codex-hook.mjs` (hooks/codex-hooks.json:3-7). The mirror wires `path.join(REPO, 'hooks', 'multi-codex-hook.mjs')` (scripts/mirror-shared-skills.mjs:69-75). The trust hash covers the handler command, not the script contents (scripts/codex-hook-trust.mjs:509-514). What runs is therefore whatever file sits at the wired path. I checked this machine read-only: every `command` in ~/.codex/hooks.json points at `~/.claude/plugins/cache/benzhuk/delegation/0.20.7/hooks/multi-codex-hook.mjs`. That is a versioned plugin-cache directory, so a new plugin version gets a new path and must be rewired.
- Fix: replace "For a Codex lead on the configured mirrored-hook route, the source adapter adds" with: "For a Codex lead on either hook route (both run `hooks/multi-codex-hook.mjs`), the adapter adds". Then add: "A mirrored host runs the adapter at the path it was wired from. After a plugin update, rerun `--codex-hooks-only` from the new durable checkout and start a fresh session before claiming the new behavior is installed."

### F4 MINOR: the switch semantics are underspecified, and "all fail safely" is ambiguous
- Evidence: in the Claude hook, the master switch silences everything. `ws-off-goalcard` turns off the card and also the bearings notice (`bearingsOff = off !== null`, hooks/delegation-reminder.js:369-372). `ws-off-bearings` turns off bearings only. The base directory is `$AGENTS_HOME`, falling back to `~/.agents` (:160-162, :180-186). An unreadable switch path counts as present, which means suppress (:164-176). The contract keeps this coupling for Codex. docs/native-use.md:49 and README.md:240 list the three names, correctly spelled, but give none of this. The spec says "fail open", the code does the opposite for unreadable switches, and "fail safely" covers both readings.
- Patch for docs/native-use.md:49. Current: "The switches are `~/.agents/ws-off`, `~/.agents/ws-off-goalcard`, and `~/.agents/ws-off-bearings`; all fail safely." Replacement: "Switches live in `$AGENTS_HOME` (default `~/.agents`): `ws-off` suppresses all of this new context, `ws-off-goalcard` suppresses the card and its bearings advisory, and `ws-off-bearings` suppresses only the advisory. A switch path that cannot be read counts as present, and the hook never blocks a turn." Confirm this against P1's final code, per F1.

### F5 MINOR: the rejection path and the usable-card precondition are missing
- Evidence: the contract says Codex adds the card and notice "only with usable card", and that SessionStart "may add the same rejection message or bearings notice to systemMessage". The Claude precedent is at hooks/delegation-reminder.js:386-395. The docs mention only the advisory in the pane (SKILL.md:56, native-use.md:49, README.md:240). An operator whose card is invalid will see a rejection notice that is documented nowhere, and will not know why the advisory is missing.
- Fix: add one sentence to native-use.md:49 and SKILL.md:56: "The advisory appears only when the card is usable. An unusable card instead shows the shared rejection notice once, at SessionStart."

### F6 MINOR: the difference in schedules is stated only in SKILL.md
- Evidence: contracts.md (P1, last paragraph) says "Shared CONTENT is parity, not identical event schedules. P3 must say this explicitly." Claude deliberately keeps the card out of every prompt, because every-prompt injection "is what made the last standing text wallpaper" (hooks/delegation-reminder.js:374-377). Claude injects at SessionStart and every 40th PostToolBatch. Codex will inject at every UserPromptSubmit. SKILL.md:56 says "Claude retains its own existing cadence". README.md:62 says "the same card and due/unknown advisory", and native-use.md:49 does not say it at all.
- Fix: append to README.md:62 and native-use.md:49: "The content is shared, not the schedule. Codex repeats it on every prompt, while Claude uses SessionStart and its bounded PostToolBatch reminder."

### F7 NIT: the changelog number and line wrapping
- Evidence: README.md:240 labels the entry 0.20.9. The manifests say 0.20.7 (.claude-plugin/plugin.json:5, .codex-plugin/plugin.json:3), and the 0.20.8 entry had no version bump either. The scout left the patch number as an open question. README.md:62 and :240 are single very long lines, while the entries around them wrap at about 90 columns.
- Fix: the integrator confirms the number at merge. Wrap both lines to match the neighboring entries.

## Checked and found correct (areas with no defect)
- Switch spelling: the diff uses only `ws-off`, `ws-off-goalcard` and `ws-off-bearings`. A search of the three files at a7dcd52 for `ws-off-goal-card` finds nothing, and the spellings match hooks/delegation-reminder.js:183-185.
- Installed versus live: none of the changed text claims the new notice was installed or observed live. README.md:240 and native-use.md:49 disclaim it explicitly. native-use.md:3 describes the 0.20.6 rollout accurately as installation evidence, not event execution on every host, which matches the evidence file.
- Confirmed child versus unknown: the wording matches the contract. Children get no new effect, unknown identity keeps its existing inbox/continuation behavior without the advisory, and it does not deny the positive native discriminator ("child-work detection remains incomplete", SKILL.md:56).
- Existing peer context is described as preserved. The only new Codex events are SessionStart and UserPromptSubmit, and all three files deny any PostToolUse, Stop or Interrupt cadence.
- The warning against duplicate hooks is kept (native-use.md:51).
- Changelog history is intact: the diff only adds lines, and the 0.20.8, 0.20.7 and 0.16.0 entries are unchanged.
- CLI commands: every flag in native-use.md:36-44 exists in the parser at scripts/mirror-shared-skills.mjs:116-137. I ran `--codex-hooks-only --dry-run --json --codex-home <scratch>` from the candidate. It exited 0 with ok:true and five trust keys, and wrote nothing: the scratch home stayed empty and the git status stayed clean.
- `git diff --check 7f188b0..a7dcd52` is clean.

## Observations, and what I did not check
- Live observation on this Windows host, read-only: ~/.codex/hooks.json runs the adapter from the Claude plugin cache 0.20.7 directory. README.md:242 (0.20.8) records the 0.20.7 card-cap change as "installed nowhere as of 2026-09-24". That can still be true as a dated statement, but Windows now appears to be wired to 0.20.7. The lead should record that as a fact with its own date. P3 should not state it without an evidence file.
- Not done: I ran no hook, no full suite, no install, no native runtime, and no transcript reads. P1 behavior could not be checked because P1 does not exist yet (F1).
