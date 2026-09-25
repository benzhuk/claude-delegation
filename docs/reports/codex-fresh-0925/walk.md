VERDICT: PARTIAL — the installed 0.20.9 mirror and adapter provide the expected source behavior, but a fresh native interactive Codex lead could not be started from this Orca child because the host rejected creation of its outer Store/MSIX PowerShell process (OS error 5). `codex exec` did run, but its `source: "exec"` transcript is deliberately classified as unknown, so it is not a lead-card proof.

# X1 fresh-project walk — 2026-09-25

Scope: source checkout `C:/Users/benzh/orca/workspaces/claude-delegation/codex-fresh-x1` at `60146fe63b3d6e4d0798760db850896240d58bdb`; installed durable source `C:/Users/benzh/Code/claude-delegation` at `fbd7cf62ef4bf2ac81c46082a9e9cb76495d848b`. The relevant adapter and installer are byte-identical by `git diff --no-index` (both exit 0). Thus installed observations are evidence for the identical code paths, never evidence that this fresh checkout is wired.

All scratch repositories were outside any project:

- `C:/Users/benzh/AppData/Local/Temp/codex-fresh-x1-20260925` (valid card)
- `C:/Users/benzh/AppData/Local/Temp/codex-fresh-x1-missing-20260925` (no card)
- `C:/Users/benzh/AppData/Local/Temp/codex-fresh-x1-invalid-20260925` (two-line card)

Direct adapter probes used the existing lead transcript only as a native-shaped fixture and set an isolated `NOTE_SLUG` where inbox behavior was tested. They are labeled **synthetic adapter proof**; no parent pane was targeted.

## 1. Install and wiring — PARTIAL

Command heads:

```powershell
$actual=$env:CODEX_HOME
Select-String -Path "$actual/config.toml" -Pattern 'hooks.state' | Measure-Object
& codex --version
Get-Content -Raw 'C:/Users/benzh/.agents/skills/.mirror-manifest.json'
```

Output head: actual `CODEX_HOME` is `C:\Users\benzh\AppData\Roaming\orca\codex-accounts\f8bc0bab-fa9c-4317-b296-797e4dc50024\home`; `hooks.state` count was `18`; `codex --version` was `codex-cli 0.156.1`; the mirror manifest records `pluginVersion: "0.20.9"`, `sourcePath: "C:/Users/benzh/Code/claude-delegation"`. Its `hooks.json` has durable-source command registrations for SessionStart, UserPromptSubmit, PostToolUse, Stop, and Interrupt.

`$env:NOTE_SLUG='x1-scratch-codex'; codex exec --json 'Reply exactly X1_OK.'` completed at 18:26 America/New_York with `thread.started` id `01a0daad-974d-7bb0-aec3-89948887a119`, two unrelated ignored-`sandbox` configuration notices, and agent message `X1_OK`. It did **not** print a hook line. Its first transcript row says `source: "exec"`; `hooks/continuation-native.mjs:71-73` accepts only `cli`/`vscode` as a lead. This is a real installed Codex execution but cannot demonstrate the lead-only goal/advisory injection.

An attempted normal interactive session, with the scratch cwd and `NOTE_SLUG=x1-scratch-codex`, was blocked before Codex started: `CreateProcessW ... Microsoft.PowerShell_7.6.6.0_x64__8wekyb3d8bbwe\\pwsh.exe ... failed: Access is denied. (os error 5)`. Selecting system PowerShell in the command call did not affect the unified-exec outer shell. This matches the host boundary described at `docs/native-use.md:114`, so no claim of a fresh live lead is made.

Gap X1-1 (MAJOR, operator proof): `docs/native-use.md:52-56` requires normal-session hook execution, but the `codex exec` command available for a noninteractive walk creates an intentionally non-lead transcript and prints no hook receipt. The guide needs an observable interactive-lead verification procedure or must say `exec` is only an installation smoke test. This is a documentation gap, not an adapter defect.

## 2. Goal card — PARTIAL

Valid fixture command:

```powershell
git init C:/Users/benzh/AppData/Local/Temp/codex-fresh-x1-20260925
# write docs/goals/card.md with five valid GOAL/NOT/DONE/KILL/SOURCE lines
```

**Synthetic adapter proof against installed durable code:** feeding SessionStart and UserPromptSubmit with a real `source: "cli"` lead transcript and the valid scratch cwd returned this exact card in `hookSpecificOutput.additionalContext` both times:

```
Goal card for this project:
GOAL: Verify a harmless fresh-project Codex hook observation.
NOT: Change any project source or contact any peer.
DONE: Record whether the goal card appears in hook context.
KILL: Stop after this isolated observation.
SOURCE: X1 disposable fixture, 2026-09-25. — as of 2026-09-25 18:26 NYC
```

The same SessionStart output included `systemMessage: "Bearings are due. Run /delegation:bearings to assess the current goal and publish the result."`.

For the no-card git fixture the output was empty. For the two-line fixture the exact SessionStart rejection was:

```
goal card not injected: C:\Users\benzh\AppData\Local\Temp\codex-fresh-x1-invalid-20260925\docs\goals\card.md — expected exactly 5 card lines, found 2. No goals are being restated in this session; fix the card or run `node scripts/goal-card.mjs check`.
```

With `AGENTS_HOME=C:/Users/benzh/AppData/Local/Temp/codex-fresh-x1-agents` containing only `ws-off-goalcard`, valid-card SessionStart output was empty. This is isolated switch proof; it did not touch global switches.

Gap X1-2 (MAJOR, specification contradiction): `docs/specs/codex-fresh-0925/spec.md` step 2 requires “a repo without a card gets the same rejection text,” while `docs/native-use.md:94-95` says “A missing card is silent” and `hooks/multi-codex-hook.mjs:79-82` returns no output unless `card.status === 'rejected'`. The installed behavior is silent, as above. Do not change code to satisfy the contradictory step.

## 3. Bearings notice — PARTIAL

Command:

```powershell
node skills/bearings/scripts/bearings-state.mjs check --repo C:/Users/benzh/AppData/Local/Temp/codex-fresh-x1-20260925
```

Output head: `{"status":"due","reason":"no completion receipt",...}`. The valid-card synthetic SessionStart output contained the exact one-line due notice in both `additionalContext` and `systemMessage`; UserPromptSubmit contained it only in `additionalContext`. That agrees with `hooks/multi-codex-hook.mjs:83-88` and `hooks/lib/goal-context.mjs:30-35`.

This proves composition and event shaping in the installed adapter, not transcript-visible SessionStart delivery in a fresh interactive lead, because that native process was blocked as described in step 1.

## 4. Multi — PARTIAL

Following the isolated-ledger route, a dedicated scratch note was recorded without pane typing:

```powershell
node .../note-send.mjs --from x1-claude --to x1-scratch-codex --kind ASK \
  --topic x1-hook-delivery --text 'Harmless X1 hook delivery probe.' \
  --goal 'verify Codex hook context' --needs ack --by 18:40 --no-type \
  --recipient-repo C:/Users/benzh/AppData/Local/Temp/codex-fresh-x1-20260925
```

Output head: `recorded and queued for note-flush (to: x1-scratch-codex)`. A **synthetic installed-adapter UserPromptSubmit** using the real `codex exec` transcript and `NOTE_SLUG=x1-scratch-codex` returned:

```
1 new peer note for x1-scratch-codex (the multi skill; the ledger is the channel):
  x1-claude → x1-scratch-codex, 9.25.26 18:29 NYC [x1-claude-x1-hook-delivery-1] ASK: Harmless X1 hook delivery probe. Goal: verify Codex hook context. Needs: ack by 18:40
```

and `systemMessage: "📨 x1-claude → x1-scratch-codex ASK: Harmless X1 hook delivery probe."`.

The earlier FYI ledger probe was read with `note-inbox --me x1-scratch-codex --ack --json --cold-start-hours 0`, yielding one note and a scratch binding. The ASK was not directed to the lead or any working peer. No actual Claude scratch session nor native interactive Codex lead was available through this host boundary, so cross-host live delivery is unproven.

## 5. Census on the lead — PASS (truthful unsupported result)

Actual account-home lead transcript:

`C:/Users/benzh/AppData/Roaming/orca/codex-accounts/f8bc0bab-fa9c-4317-b296-797e4dc50024/home/sessions/2026/09/25/rollout-2026-09-25T18-23-14-01a0daaa-63a0-7f81-a42f-6883d7c68961.jsonl`

Its opening `session_meta.timestamp` is `2026-09-25T22:23:17.093Z` (18:23:17.093 America/New_York); it identifies `session_id` and `id` as `01a0daaa-63a0-7f81-a42f-6883d7c68961`, `source: "cli"`. Command:

```powershell
node scripts/build-census.mjs --lead <path above>
```

Exact verdict head: `VERDICT: UNSUPPORTED Codex complete census (complete per-build response coverage is not established), 0 subagent files, leadLastMessageAt: 2026-09-25T22:27:41.761Z`.

It reports `leadTurns: unsupported`; observed deduplicated response usage `1656186`; observed requests `24`; window native turn count `1` (explicitly not conversational lead turns); and codex subagent usage unsupported. This is the required honest census result, not all-role completeness. `scripts/build-census.mjs:311-368` requires a verified `session_meta`/token attribution and deliberately emits unsupported where full coverage or role ordering is unavailable.

## Doc corrections for docs/native-use.md

- At `docs/native-use.md:52-56`, replace “Finally verify a normal session's hook execution on that host; listings and configuration alone do not prove event delivery.” with “Finally verify a normal interactive Codex lead session's hook execution on that host; `codex exec` uses `source: \"exec\"`, is not classified as a lead by the goal-card adapter, and is only an installation smoke test. Listings and configuration alone do not prove event delivery.”
- At `docs/native-use.md:114`, replace “The identical disposable fixture worked when its PATH selected system Windows PowerShell.” with “The identical disposable fixture worked when its PATH selected system Windows PowerShell; verify the outer host process can also start that shell before relying on this procedure.”

## Findings count

Two: X1-1 documentation/proof gap; X1-2 specification contradiction. Neither requires an X2 code edit.
