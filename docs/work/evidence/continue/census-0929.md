VERDICT: COUNTED

# "continue" skill census, 2026-08-18 to 2026-09-29 (America/New_York), run 2026-09-29 about 18:00 ET

Headline: both counts of real use are near zero. The skill itself was never invoked on any reachable host (and never in any retained transcript): 0 Skill tool_use calls, 0 `/continue` slash commands, 0 `invoked_skills` records, 0 Codex loads. The only boundary action is 3 Stop-block corrections, all on Windows in one scratch review session on 2026-09-23. The passive epoch banner fires on every lead prompt since 2026-09-23/24; that measures hook installation, not use.

## 1. Exact strings the completion boundary prints or injects (source: C:/Users/benzh/Code/baseline-61, HEAD fef771a)

Where the code lives: `hooks/hooks.json` and `hooks/codex-hooks.json` do not contain the word "continuation". Claude wires it through `hooks/multi-inbox.js` (SessionStart/UserPromptSubmit/PostToolUse/Stop entries in `hooks/hooks.json` at lines 8, 34, 50, 67; import of `continuation-native.mjs` and `scripts/continuation.mjs` at `hooks/multi-inbox.js:43-44`, called at :295-299 and :378-402). Codex wires it through `hooks/multi-codex-hook.mjs` (all five events in `hooks/codex-hooks.json:3-7`; imports at `hooks/multi-codex-hook.mjs:34-35`, called at :258-268). `hooks/continuation-native.mjs` (201 lines) only normalizes host events and has no user-facing string. The strings are produced in `scripts/continuation.mjs` and merged into hook output by `hooks/multi-hook-core.mjs`.

1. Epoch banner, injected as hook additional context on UserPromptSubmit and on the first PostToolUse when no state exists (`scripts/continuation.mjs:69`; returned at :231, :236, :249):

```
Continuation epoch ${epoch}. Host: ${event.host}; session: ${event.sessionId}. Ongoing scope remains inactive until bind is confirmed by this episode's PostToolUse.
```

2. Stop correction, the only text that blocks a stop (built at `scripts/continuation.mjs:179`, returned as `reason` at :181, emitted by `stopResult` at :192-204; at most once per user episode, only while a binding is `active`):

```
Continuation accounting for the bound selected work: ${summary}. Reconcile this snapshot through existing work records and continue only useful authorized work.
```

`${summary}` is `runnable=N owned=N delivered=N rejected=N reviewed=N accepted=N blocked=N` (bucket names and counts, `scripts/continuation.mjs:178`), or `snapshot=unknown` on the peer-only path (same line, :178; peer-only path at :193-196).

3. Wrapper that turns text 2 into a Stop block: `hooks/multi-hook-core.mjs:181` `output: { decision: 'block', reason: text }` (when a peer block already exists, :175-178 appends it after the peer reason with a blank line; the peer reason is `STOP_REASON`, `hooks/multi-hook-core.mjs:144-145`: "Handle these before you stop: ACK what you are taking, answer what you can, or send BLOCKED with the reason. If none of it is for you, say so in one line and stop."). Non-Stop events wrap text 1 as `hookSpecificOutput.additionalContext` (`hooks/multi-hook-core.mjs:186-198`).

4. `diagnostic` results (`scripts/continuation.mjs:199`) are fixed codes, never shown to the model. The off switches `ws-off` and `ws-off-continuation` (`scripts/continuation.mjs:42`) return null before any string.

5. `skills/continue/SKILL.md` (49 lines) prints nothing itself; its description is at line 3 and it tells the model to run `node <plugin-root>/scripts/continuation.mjs bind|status|account|stop` (lines 32-37).

Timeline: `skills/continue/SKILL.md` was added in commit 2f2d928 on 2026-09-23 17:33 ET; the runtime and hook strings landed in d79056b and 2b21a37 on 2026-09-23. Nothing could fire before that. First epoch banner seen: Windows 2026-09-23 23:18 ET, Netcup and Hetzner 2026-09-24 07:44 ET.

## 2. Method

Scripts (in the scratch folder): `continue-census-work/count.py` for all three hosts, streamed to the remotes over ssh stdin as `ssh <host> python3 - < count.py` with nothing copied; and `continue-census-work/count.mjs`, a Node twin run on Windows only (Netcup and Hetzner have no node). The Windows Node and Python runs agree exactly (621 epochs, 3 accounting blocks, 0 skill), which cross-checks the port. Read-only, transcripts only. Files with mtime before 2026-08-16 are skipped. Transcript times are UTC, converted to America/New_York, bucketed by ET date into ISO weeks (Monday start). W34 (starts Aug 17) and W40 (ends Oct 4) are partial; the window is Aug 18 to Sep 29.

Roots scanned: Windows `~/.claude*/projects` (`.claude` 1509 files, `.claude-headless` 1) plus `~/.codex/sessions` and `~/.codex/archived_sessions` (45 files, 14 touched since Aug 16). Netcup `~/.claude*/projects` (`.claude` 5988 files, acct2 to acct6 12 files) and Hetzner (`.claude` 196, acct2 to acct6 22), because both keep several Claude config dirs. Netcup and Hetzner have `~/.codex` (config, hooks.json, AGENTS.md) but no `sessions` or `archived_sessions` dir, so there are no Codex transcripts to count there.

(a) Skill invocations
- Claude, primary: assistant record, `message.content[]` block `type=tool_use`, `name=Skill`, `input.skill` equal to `continue` or ending `:continue` (so `delegation:continue`). Deduplicated by tool_use id (the `wireToolInputs` copy is ignored). Subagent transcripts (`agent-*.jsonl`, `subagents/`) are included.
- Claude, secondary: user record whose text contains `<command-name>/continue</command-name>` or `/<plugin>:continue`, deduped by uuid (user typed the slash command).
- Claude, cross-check on every file regardless of date: `attachment.type=invoked_skills` skill names, a raw grep for `"skill":"...continue"`, and a raw grep for the slash-command tag. All are 0 on all three hosts.
- Codex rule: a session turn (`turn_id` from `task_started` or `turn_context`) counts once if any of: A) a user-role `response_item` message containing `<skill><name>continue</name>` (host-injected skill body), B) a `function_call`, `custom_tool_call` or `local_shell_call` whose arguments reference `skills/continue/SKILL.md` (model loaded it by reading the file), C) a user message naming `$continue` or `[$continue]` (AGENTS.md and the "Available skills" listing excluded). A, B, C are reported separately.

(b) Boundary firings. Counted only in hook-output records, never in tool results that merely quote the source. Netcup has 7 files that contain the accounting string as tool output while reading the source; they correctly count 0.
- b1 Epoch banner (string 1): Claude `attachment` records of type `hook_additional_context` (content strings) or `hook_success` (`stdout` JSON, `hookSpecificOutput.additionalContext`); Codex developer or user `response_item` message, or `item_completed` `HookPrompt` fragment. Dedup: the epoch token is a random 18-byte value, so one firing = one distinct token per host. The same token appears in both `hook_additional_context` and `hook_success`, again in subagent transcripts that inherit the parent context, and again on repeat hook invocations within one prompt; all collapse to one. Dated by the earliest record carrying the token.
- b2 Accounting Stop block (string 2): Claude `hook_blocking_error` attachment (hookEvent Stop), `system` `stop_hook_summary` `hookErrors[]`, and the meta user turn starting `Stop hook feedback:`; Codex `item_completed` `HookPrompt` with `hookRunId` starting `stop:` (and the `<hook_prompt hook_run_id="stop:...">` form). Claude writes up to three records for one block within about 2 ms, so dedup = same text within 10 s = one firing. Two blocks 2 min apart with identical text stay separate; the runtime allows one correction per user episode.
- The "probe" figures count firings whose cwd contains a Temp, tmp, scratch or probe path; those are test sessions, not project work.

## 3. Weekly counts per host

### Windows (Ben-Desktop)

Claude transcripts scanned: 1081 of 1510 (mtime filter), 968 of them subagent files. Codex transcripts: 45 found, 14 scanned.

| ISO week | (a) Claude Skill tool_use | (a) Claude /continue slash | (a) Codex load A / B / C | (b1) epoch, Claude (of which probe cwd) | (b1) epoch, Codex | (b2) accounting block, Claude | (b2) accounting block, Codex |
|---|---|---|---|---|---|---|---|
| 2026-W34 (Mon 2026-08-17) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W35 (Mon 2026-08-24) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W36 (Mon 2026-08-31) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W37 (Mon 2026-09-07) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W38 (Mon 2026-09-14) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W39 (Mon 2026-09-21) | 0 | 0 | 0 / 0 / 0 | 463 (17) | 0 | 3 (3 probe) | 0 |
| 2026-W40 (Mon 2026-09-28) | 0 | 0 | 0 / 0 / 0 | 158 (2) | 0 | 0 (0 probe) | 0 |
| total | 0 | 0 | 0 / 0 / 0 | 621 (19) | 0 | 3 | 0 |

Distinct sessions carrying an epoch banner: 29.

### Netcup (v2202608391056492408)

Claude transcripts scanned: 5720 of 6000 (mtime filter), 5631 of them subagent files. Codex transcripts: 0 found, 0 scanned.

| ISO week | (a) Claude Skill tool_use | (a) Claude /continue slash | (a) Codex load A / B / C | (b1) epoch, Claude (of which probe cwd) | (b1) epoch, Codex | (b2) accounting block, Claude | (b2) accounting block, Codex |
|---|---|---|---|---|---|---|---|
| 2026-W34 (Mon 2026-08-17) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W35 (Mon 2026-08-24) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W36 (Mon 2026-08-31) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W37 (Mon 2026-09-07) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W38 (Mon 2026-09-14) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W39 (Mon 2026-09-21) | 0 | 0 | 0 / 0 / 0 | 717 (5) | 0 | 0 (0 probe) | 0 |
| 2026-W40 (Mon 2026-09-28) | 0 | 0 | 0 / 0 / 0 | 318 (26) | 0 | 0 (0 probe) | 0 |
| total | 0 | 0 | 0 / 0 / 0 | 1035 (31) | 0 | 0 | 0 |

Distinct sessions carrying an epoch banner: 39.

### Hetzner (zhuk-vps32)

Claude transcripts scanned: 156 of 218 (mtime filter), 129 of them subagent files. Codex transcripts: 0 found, 0 scanned.

| ISO week | (a) Claude Skill tool_use | (a) Claude /continue slash | (a) Codex load A / B / C | (b1) epoch, Claude (of which probe cwd) | (b1) epoch, Codex | (b2) accounting block, Claude | (b2) accounting block, Codex |
|---|---|---|---|---|---|---|---|
| 2026-W34 (Mon 2026-08-17) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W35 (Mon 2026-08-24) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W36 (Mon 2026-08-31) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W37 (Mon 2026-09-07) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W38 (Mon 2026-09-14) | 0 | 0 | 0 / 0 / 0 | 0 (0) | 0 | 0 (0 probe) | 0 |
| 2026-W39 (Mon 2026-09-21) | 0 | 0 | 0 / 0 / 0 | 46 (10) | 0 | 0 (0 probe) | 0 |
| 2026-W40 (Mon 2026-09-28) | 0 | 0 | 0 / 0 / 0 | 105 (0) | 0 | 0 (0 probe) | 0 |
| total | 0 | 0 | 0 / 0 / 0 | 151 (10) | 0 | 0 | 0 |

Distinct sessions carrying an epoch banner: 13.

### Mac

Unreachable (per the brief; not probed from this lane). No counts. The census covers 3 of the 4 hosts.

## 4. Last date each happened (America/New_York)

| Host | Skill invoked (any form) | Epoch banner (first seen) | Accounting Stop block |
|---|---|---|---|
| Windows (Ben-Desktop) | never (0 in retained transcripts, all dates) | 2026-09-29 17:57 (first 2026-09-23 23:18) | 2026-09-23 23:43 (first 2026-09-23 23:32) |
| Netcup (v2202608391056492408) | never (0 in retained transcripts, all dates) | 2026-09-29 17:58 (first 2026-09-24 07:44) | never |
| Hetzner (zhuk-vps32) | never (0 in retained transcripts, all dates) | 2026-09-28 21:25 (first 2026-09-24 07:44) | never |
| Mac | unreachable | unknown | unknown |

Codex, all three reachable hosts: no skill load, no epoch, no accounting block. Windows Codex sessions in the window are dated 2026-09-01 to 2026-09-18 (before the hooks existed on 2026-09-23); Netcup and Hetzner have no Codex transcripts. Codex epoch and HookPrompt records do exist from 2026-09-25 (rollout 01a0dab2-..., visible only as quoted tool output in Windows Claude sessions 415ff943 and c9faac47 from the codex-fresh probes), but those rollout files are not under `~/.codex/sessions` or `archived_sessions` on this box (isolated CODEX_HOME), so they are not counted here.

## 5. Detail: the only accounting Stop blocks (Windows, one scratch review session)

Session 2ccdbe03-d922-418e-8215-c375d3e9538c, cwd `C:\Users\benzh\AppData\Local\Temp\astra-followthrough-0923\native-instruction-delta-review-aa42a11\repo`:
- 2026-09-23 23:32 ET: `runnable=0 owned=1 delivered=0 rejected=0 reviewed=0 accepted=0 blocked=0`
- 2026-09-23 23:41 ET: `runnable=0 owned=0 delivered=1 rejected=0 reviewed=0 accepted=0 blocked=0`
- 2026-09-23 23:43 ET: same counts as 23:41 (separate episode, 2 min later)

Each appeared in all three record forms (hook_blocking_error, stop_hook_summary, Stop hook feedback user turn).

## 6. Reading the numbers

- Both counts of real use are near zero: skill invocations 0 on every host; accounting blocks 3 in total, none outside one Windows test session. No bound ongoing scope has fired on Netcup or Hetzner.
- The epoch banner is not an action. It is injected on every lead-session prompt (and first PostToolUse) whenever a plugin version with the hook is installed, so its counts (Windows 621, Netcup 1035, Hetzner 151) measure hook installation and session volume, not use of the skill.
- Caveats: transcripts only (hosts may have pruned old ones); Claude sessions under a config dir other than `~/.claude*` are not seen; Codex isolated-home probe rollouts are not seen; the probe flag is a cwd-name heuristic; ET conversion uses the tz database (present on all three hosts).

Raw output per host is in `continue-census-work/` (`win-py.json`, `netcup.json`, `hetzner.json`, `win.json` from the Node run).
