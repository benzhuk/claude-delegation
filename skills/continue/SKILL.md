---
name: continue
description: Continue authorized ongoing project work through pauses, wave closeout, and status turns by selecting finite useful ready work and preserving evidence. Use when work needs to progress without serializing independent lanes; not for unattended scheduling or new authority.
---

# Continue ongoing useful work

Apply this skill when work resumes and before ending an ongoing-goal turn, closing a wave, or treating a status reply as a stopping point. Read the project's current goal, active bearings, and existing work records before choosing work. The optional bound completion check below supplies one mechanical correction opportunity on supported hosts. It is not an idle scheduler, wake-up promise, authority grant, or proof that the goal is achieved.

## Select and run work

1. Reconcile the goal and acceptance evidence with owned work, pending review or integration, known unmet requirements, and actual external blockers. A shipped release, exhausted wave, failed trial, or status reply does not by itself complete the ongoing goal.
2. Separate pending owner decisions from work in flight, review, or integration. A decision blocks only its dependent item. Select and start independent, finite, authorized ready work; refill genuinely free disjoint capacity subject to the project's concurrency constraints. Prefer existing runnable records, a current bearings next action, or a clearly scoped goal item; never fabricate activity or recursively expand scope.
3. If the ready queue is empty while required outcomes are unmet, inspect their dependencies to find finite useful work or establish concrete blockers. Before an expected permission boundary, prepare reversible work and ask for the needed authority. An unanswered request or elapsed time grants no merge, installation, machine change, external communication, or new objective.
4. Preserve the work/evidence identity and report observed results, inferences, failures, and unknowns. For code, use applicable tests, review, and artifact evidence. For non-code work, use the project's stated acceptance evidence and owner judgment. Answer a status question concisely, then continue active work unless the user pauses, stops, or changes scope.

## Resume and stop

Resume an interrupted native session only when the host session is identified and the surrounding harness scope is already authorized. Local installed CLI evidence is limited to Codex `resume` (including `--last`) and Claude Code `--continue` or `--resume <session-id>`; it does not establish unattended restart, cross-host continuation, child ancestry, or a portable loop. Do not alias an unverified `/loop` mechanism.

Do not wait on a human while independent authorized work remains. Stop only when the user requests it, the authorized objective has completion evidence, or every remaining useful authorized item genuinely depends on an external decision or unavailable dependency. Record those specific blockers and the session/work identity needed for a later resume.

## Bind the supported completion check

Use this only for an explicitly authorized ongoing scope. A finite question or explicit user stop must not be converted into ongoing authority. The host hook provides the current session identity and opaque epoch; do not copy a peer's identity, infer one from a pane slug, reuse an older epoch, or substitute a fresh epoch automatically inside an asynchronous command. Unsupported or unavailable host evidence leaves this check inactive; it does not prevent useful ordinary work.

Resolve the released plugin root once. Native plugin sessions use their supplied plugin path. For the Codex shared-skill mirror, the existing `~/.agents/skills/.mirror-manifest.json` identifies `sourcePath`; verify that root contains this plugin's manifest and `scripts/continuation.mjs`. Do not install a second copy or invent a global executable to satisfy the command.

Bind the actual integration checkout and selected existing work roots to the native epoch:

```text
node <plugin-root>/scripts/continuation.mjs bind --host <codex|claude> --session-id <native-id> --expected-epoch <hook-epoch> --repo <integration-checkout> --root <work-id> --authority-ref <existing-authority-evidence>
```

Repeat `--root` for independent selected work. An accepted release record is not the whole ongoing goal. Admission of new useful work still uses the existing work-record process. Bind is not active until its current native episode is confirmed by the hook. `status` reports that distinction; never describe pending/unsupported as enforced.

After updating the existing work records, `status --host ... --session-id ...` supplies the selected revision. If the scope has been accounted for, `account --host ... --session-id ... --expected-epoch ... --expected-revision ... --evidence-ref <attached-evidence>` records that exact evidence. A changed selection invalidates the account. This records your judgment; it cannot make a false completion or blocker claim true. Continue any independent useful work the evidence identifies.

On explicit pause/stop, use `stop --host ... --session-id ... --expected-epoch ...` when a current binding exists. New user prompts suspend earlier binding until their scope is reconciled. Off switches are `ws-off` and `ws-off-continuation` in the existing agents home. Do not turn them back on without the user's authority.

The completion hook checks selected work at Stop and combines any correction with peer delivery into one response. It does not poll in the background or start turns for routine ACK/FYI. At most one correction is available per current user episode, with the native recursion guard retained; repeated unchanged or uncertain emission must not become a loop. After a correction, actually perform the selected work instead of ending with a promise to continue.

## Bearings seam

When continuation reveals changed assumptions, recurring failure, or no credible ready work, use `bearings` to reassess from bounded evidence. A `CONTINUE` result selects one next action but does not serialize independently authorized work.
