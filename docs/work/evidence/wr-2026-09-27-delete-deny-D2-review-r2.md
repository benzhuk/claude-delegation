VERDICT: APPROVE f9ed55db74f2e241c2daad0f54d71d8813ca5190

# D2 review, round 2 (delta): Codex PreToolUse wiring for the delete-guard

Worktree C:/Users/benzh/Code/delete-deny/wt-d2, HEAD f9ed55db74f2e241c2daad0f54d71d8813ca5190 (from `git rev-parse HEAD`, which I ran myself). Range e470334..HEAD is one commit, f9ed55d.
Scope: verify each r1 finding (pack/reports/D2-review-r1.md) and look for regressions. This is not a fresh full review.
Method:
- Read the diff.
- Reran the gate.
- Ran mirror-shim on the branch alone.
- Made a scratch copy (`git archive` into the session scratchpad) and added D1's current hooks/delete-guard.mjs (wt-d1 b7a3fef). On that copy I ran the suites, a scratch-CODEX_HOME install, an upgrade from an unmatched install, CLI payload probes and two mutation checks.
- Read the upstream Codex source at %TEMP%/codex-hook-source, commit 7dae8c53.

The reviewed tree was never modified: `git status --short` was empty at the end. No real delete ran.

Counts: BLOCKER 0, MAJOR 0, MINOR 3, NIT 1.

## Gate, rerun
`node --test scripts/codex-hook-trust.test.mjs scripts/mirror-shared-skills.test.mjs skills/multi/scripts/hooks.test.mjs`: 86 tests, 86 pass, 0 fail, exit 0. That matches the report. The N2 scanner is inside it and passes. The round-2 tests are pure-function tests and add no child spawn, so there is no N2 twin.

## Prior findings, verified

**MAJOR 1 (no matcher): FIXED.**
- scripts/codex-hook-trust.mjs:424 now carries `matcher: 'Bash'`.
- Line 518 destructures the matcher.
- Line 524 writes it on a new group.
- Lines 539-542 repair it on an existing group of ours.
- Line 553 reads the placement's matcher back from the group, so the trust hash is computed with it.

Upstream check:
- Codex treats `Bash` as an exact matcher (hooks/src/events/common.rs:139-146, 169-173).
- Every hook site for the shell tool uses `HookToolName::bash()`: unified_exec/exec_command.rs:528, unified_exec.rs:92, sandboxing.rs:145.
- `apply_patch` (apply_patch.rs:461) and MCP tools (mcp.rs:95-96) have other names, so they are now excluded.

D1's `decide()` does not look at tool_name, so PowerShell syntax that Codex sends under `Bash` on Windows is still covered. Probe: an agent payload `Get-ChildItem x | Remove-Item -Recurse -Force` is denied with `(Remove-Item -Recurse)`.

Scratch install results:
- hooks.json gets `PreToolUse: [{"hooks":[…delete-guard.mjs…],"matcher":"Bash"}]`.
- config.toml gets `trusted_hash = sha256:f34fccb6…`, which equals `codexHookHash(handler,'PreToolUse','Bash')`. It does not equal the hash without a matcher (`sha256:e72b9d10…`).

Upgrade path: I simulated an e470334-era home, where the group has no matcher and the trust is the hash without a matcher, then reran `--codex-hooks-only`. The result:
- The matcher was added in place, still one group.
- `trust.updated: [pre_tool_use:0:0]`, and the trust moved to the hash with the matcher.
- A second rerun gave `wroteHooks: false` with no trust changes, so the install is idempotent.

Mutation checks on the scratch copy (restored afterwards; 47/47 pass after restore):
- Disabling the repair branch fails "a guard group that exists without a matcher … gains one".
- Removing `matcher: 'Bash'` fails both new tests.

**MAJOR 2 (the branch alone fails mirror-shim; the report said 22/22): RESOLVED BY RECORD, as r1 allowed under option (a).**
- With D2 alone, `node --test skills/multi/scripts/mirror-shim.test.mjs` still gives 20 pass, 2 fail. The failing tests are the two MAJOR 1 control/foreign-duplicate tests. This is expected because hooks/delete-guard.mjs is absent.
- The report now states the false 22/22 claim and corrects it (D2-report.md "Correction (round 2, MAJOR 2)").
- It records that D2 merges only after D1: D1 is not yet accepted, and the spec's order is D1 first, then D2 as build/delete-deny-2.
- It asks the integrator to add mirror-shim to the gate once D1 is present.

With D1's script in the scratch copy, `mirror-shim + mirror-shared-skills + codex-hook-trust` gives 82 pass, 0 fail, exit 0.

The integrator must not merge D2 before D1. Merged alone, every `--codex-hooks` run exits 1 with "missing Codex delete-guard hook script".

**MAJOR 3 (Codex reach overstated; the prescribed live check would mislead): FIXED.**
- The gap doc's new "What is proven" item 3 (docs/notes/2026-09-27-delete-deny-codex-pretooluse-gap.md:73-87) states that only calls carrying `agent_id` are guarded. It cites hook_runtime.rs:199 and schema.rs:282-285.
- Decision section (:131-141): the reach is named as narrower than on Claude, and the top-level-lane question goes to the lead as an open decision.
- Follow-up 1 (:145-157): the live probe is run by a `spawn_agent` child. A top-level probe is documented as an expected pass, and it runs only against a directory that is safe to delete.
- The SKILL.md sentence (:163-164) now reads "Codex: wired for Codex subagents; top-level Codex lanes are not guarded".
- The report's integrator section says the same.

Re-probed with D1 b7a3fef: a top-level payload exits 0 with no output (passed-lead), and the same payload with `agent_id` is denied with `(rm -r)`. The doc's claim at :85-87 holds.

**MINOR 1 (false binary-scan fact): FIXED.** The gap doc at :97-111 now gives the measured counts (5 / 8 / 1). It corrects the serde claim, ties the source reading to 0.157.0 through the binary scan, and names the checkout path as not durable.

**MINOR 2 (report line 1): FIXED.** D2-report.md line 1 is `VERDICT: DONE f9ed55db74f2e241c2daad0f54d71d8813ca5190`, which equals HEAD.

**MINOR 3 (happy-path test): FIXED.** scripts/mirror-shared-skills.test.mjs:176 asserts `matcher === 'Bash'` on the happy branch. The test passes with D1 present in the scratch copy. The refusal branch is kept, which is reasonable because no rebase happened.

## Regression hunt: verified clean
- The note-delivery groups get no `matcher` key. Checked by the new test at codex-hook-trust.test.mjs:262-265 and by the scratch hooks.json, where SessionStart, UserPromptSubmit, PostToolUse, Stop and Interrupt have no matcher. Their trust hashes are unchanged.
- `trustEntriesFor` (codex-hook-trust.mjs:568-575) still ignores the matcher. It is only used for the note-delivery events, which have none, so this is not a defect.
- The repair only runs on the group that holds our marker (:520, :539), so it never touches a matcher on Orca's PreToolUse group.

## MINOR 1: the gap doc's "What is wired now" omits the matcher
docs/notes/2026-09-27-delete-deny-codex-pretooluse-gap.md:15-16 describes the entry as "a `PreToolUse` entry, 10 s timeout". The matcher is the load-bearing part of the r1 fix, so this list should say so.
Patch:
- old: `` - `scripts/codex-hook-trust.mjs:CODEX_DELETE_GUARD_EVENTS` — a `PreToolUse` entry, 10 s timeout, for the ``
- new: `` - `scripts/codex-hook-trust.mjs:CODEX_DELETE_GUARD_EVENTS` — a `PreToolUse` entry, 10 s timeout, `matcher: 'Bash'` (shell calls only; `apply_patch` and MCP tools never reach the guard), for the ``

## MINOR 2: the --codex-hooks usage text implies the guard is optional
scripts/mirror-shared-skills.mjs:629-631 says the guard is wired "when hooks/delete-guard.mjs exists (D1's build)". The code does not skip when the script is missing. It refuses: `refuse('missing Codex delete-guard hook script …')`, the whole run exits 1, and that is what fails the two mirror-shim tests. A user who reads the help would expect a silent skip.
Patch:
- old: `ALSO wire (and pre-trust) the Codex hooks — note delivery AND, when hooks/delete-guard.mjs`
  `               exists (D1's build), the recursive-delete PreToolUse guard (delete-deny D2). OFF by`
- new: `ALSO wire (and pre-trust) the Codex hooks — note delivery AND the recursive-delete PreToolUse`
  `               guard hooks/delete-guard.mjs (delete-deny D2; refuses if that script is missing). OFF by`

## MINOR 3: a known reach gap is not written down: write_stdin into an open exec session emits no PreToolUse
Upstream codex-rs/core/src/tools/handlers/unified_exec/write_stdin.rs:129-134 returns `None` from `pre_tool_use_payload`, with the comment "non-empty writes continue a command that already ran PreToolUse as Bash". A Codex subagent could:
1. start an interactive shell with `exec_command` (the guard sees only `bash` or `pwsh` and passes it);
2. send `rm -rf x\n` through `write_stdin`.

The guard never sees step 2, whatever the matcher is.

This is not a D2 defect. The matcher did not create the gap, and D2 cannot close it. The gap doc lists what the guard does on Codex, so it should also list this gap.
Fix: add one sentence to gap doc item 3 (after :87): "Also not seen on Codex: input typed into an already-open interactive exec session via `write_stdin`, which emits no PreToolUse (codex-rs/core/src/tools/handlers/unified_exec/write_stdin.rs:129-134); only the command that opened the session is checked."

## NIT: stray blank line inside a JSDoc block
scripts/codex-hook-trust.mjs:411 is an empty line between ` *` (:410) and ` * The deny shape is ESTABLISHED` (:412). It is harmless syntactically. Delete line 411.

## For the lead
- Merge order is load-bearing: D1 first, then D2. After D1 is in, add `skills/multi/scripts/mirror-shim.test.mjs` to the D2 gate line.
- The open decision the builder names still has no owner: should top-level Codex lanes, such as a `codex exec` builder or a skills-a pane, be denied? The spec's "refuse more" rule points to yes, and that needs a D1 contract change.

## How to rerun what I measured
- `git archive HEAD | tar -x -C <scratch>/tree`, then copy wt-d1/hooks/delete-guard.mjs into `<scratch>/tree/hooks/`.
- In `<scratch>/tree`: `node --test skills/multi/scripts/mirror-shim.test.mjs scripts/mirror-shared-skills.test.mjs scripts/codex-hook-trust.test.mjs` gives 82/82.
- `HOME=<scratch>/home USERPROFILE=<scratch>/home CODEX_HOME= node scripts/mirror-shared-skills.mjs --codex-hooks-only --codex-home <scratch>/home/codex --json`. Then inspect hooks.json (the matcher) and the config.toml `pre_tool_use:0:0` trusted_hash.
- Upgrade check: delete the matcher from hooks.json and set the trusted_hash to `codexHookHash(handler,'PreToolUse',null)`. Rerunning should give `trust.updated` with the entry, and the matcher is restored.
