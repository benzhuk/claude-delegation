VERDICT: APPROVE 4f57e1ad5951da4c4c37800eb41581497185adc2

# Integration review: delete-deny, build/delete-deny-1 at 4f57e1a

Scope: read-only review of C:/Users/benzh/Code/delete-deny/wt-int at 4f57e1ad5951da4c4c37800eb41581497185adc2.
Approvals checked: D1 b7a3fef (D1-review-r4.md), D2 f9ed55d (D2-review-r2.md).
Counts: BLOCKER 0, MAJOR 0, MINOR 3, NIT 2.

Times below are America/New_York (EDT). UTC stamps quoted from files are left as the files have them.

## (1) The tree is b688ba9 plus D1 plus D2, and nothing else: verified

- The parents are as claimed.
  - 601ef19 has parents b688ba9 and b7a3fef.
  - 4f57e1a has parents 601ef19 and f9ed55d.
  - Both branch refs resolve to exactly the approved shas: `build/delete-deny-1-d1` is b7a3fef73b6d… and `build/delete-deny-1-d2` is f9ed55db74f2….
- I recomputed both merges with `git merge-tree --write-tree`:
  - merge(b688ba9, b7a3fef) gives tree cc049f82…, which equals `601ef19^{tree}`.
  - merge(601ef19, f9ed55d) gives tree 3523f738…, which equals `4f57e1a^{tree}`.
  - So neither merge commit adds content of its own: there is no evil merge and no conflict hand-edit.
- `git diff --stat b688ba9 4f57e1a` touches exactly 10 files: the D1 five and the D2 five. `docs/work/` is not among them.
- b688ba9 itself differs from 806d773 only by the 12-line work record.

## (2) The integrator's live evidence is real: verified against the files

All evidence is in `…/scratchpad/dd-live/`. This turned out to be the same session scratchpad as mine.

**Check (a), agent_id.**
- `agentid-probe.log` contains exactly the two lines quoted in the report. Its mtime, 03:33:57.851 EDT, equals the second line's stamp, 07:33:57.851Z.
- Claude's own session transcripts corroborate it. In `~/.claude/projects/…-scratchpad-dd-live/b90d4085-….jsonl`:
  - the lead ran Bash `echo lead-probe` at 07:33:51.306Z;
  - it dispatched a Sonnet Agent at 07:33:52.238Z.
- `…/b90d4085-…/subagents/agent-a2d4d9c238c181450.jsonl` exists. That is the same agent id as in the probe log, and it holds Bash `echo sub-probe` at 07:33:57.451Z, 0.4 s before the probe line.
- `plugin-debug` differs from the HEAD tree only in three ways:
  - `hooks/agentid-probe.mjs` was added;
  - one hook entry was appended under `Bash|PowerShell` in hooks.json;
  - `docs/work` is different, because the work record has changed since.
- The probe script logs whether `agent_id` is present using `hasOwnProperty`, so it does not infer it.
- An earlier run, session a89118c7 (`check-a.log`, 03:32:34), predates the probe script (written 03:33:20). That explains why the log holds one run, not two. It is consistent, not suspicious.

**Check (b), live deny.**
- `check-b.jsonl` is genuine stream-json. Its `system/init` shows:
  - `claude_code_version 2.1.283`, model claude-sonnet-5;
  - exactly one `delegation` plugin, with path `C:\Users\benzh\Code\delete-deny\wt-int` (inline). No marketplace copy of the plugin was loaded alongside it, so the deny cannot have come from another install.
- In the transcript:
  - the subagent's Bash `tool_use` is at 07:35:23.704Z;
  - its `tool_result` is at 07:35:25.939Z, with `is_error: true`, which is 2.235 s later;
  - the content is byte-for-byte `reasonText('rm -r')` (hooks/delete-guard.mjs:103-106).
- The subagent transcript `agent-aa9d8094b811c20ff.jsonl` exists, and that id matches the transcript's agentId.
- `~/.agents/notes/delete-guard.log` has exactly one line, `2026-09-27T07:35:24.042Z denied [rm -r] mkdir -p "C:/Users/…`. The file's mtime is 03:35:24.042 EDT, which matches.
- `dd-live/dg-test` is empty. No delete ran, because the compound command was refused whole.
- The reason text can only have come from delete-guard's JSON deny path: the script never writes stderr and never exits 2.

**Stop probe (informational).** The quotes match `stopprobe/turn1.jsonl` and `turn2.jsonl`. See NIT 1 for a caveat about what they prove.

The line number the report cites, `fromSubagent` at hooks/delete-guard.mjs:409, is correct.

## (3) Is the Codex deny shape "established" by evidence or by assertion? It is backed by evidence, so this is not MAJOR

I checked the claim independently, without relying on D2's text:

- **Upstream source.** `%TEMP%/codex-hook-source` is at commit 7dae8c53d97e…, dated 2026-09-24.
  - In `codex-rs/hooks/src/events/pre_tool_use.rs:193-283`, `parse_completed` sets `should_block` on a parsed `block_reason` when the exit code is 0.
  - The test `permission_decision_deny_blocks_processing` (:357-384) feeds it the exact JSON that delete-guard.mjs emits and asserts `should_block: true` / `HookRunStatus::Blocked`.
- **Preconditions the D2 docs do not spell out, which I checked.**
  - Control effects apply only to Sync handlers (`engine/mod.rs:141-156`). A `command` handler without `async: true` is Sync, and D2 writes no `async` field.
  - The shell `tool_input` is `{"command": args.cmd}` (`unified_exec/exec_command.rs:529`), where `cmd: String` (`unified_exec.rs:29`). So `decide()` receives a string and does not silently pass a non-string.
  - The upstream trust hash folds in the matcher through a flattened group (`engine/discovery.rs:766-792`). That matches `codexHookHash` (scripts/codex-hook-trust.mjs:64-77).
- **The installed binary is tied to that source.** The binary is `@openai/codex` 0.157.0 (`codex --version` gives `codex-cli 0.157.0`). I ran `grep -c -a -F` on the vendored `codex.exe`:

  | String | Count |
  |---|---|
  | `permissionDecision` | 5 |
  | `hookSpecificOutput` | 8 |
  | `permissionDecisionReason` | 4 |
  | `Command blocked by PreToolUse hook` | 1 |
  | `hook returned invalid pre-tool-use JSON output` | 1 |
  | `PreToolUse hook exited with code 2 but did not write a blocking reason to stderr` | 1 |

  The last two strings are the error texts inside this exact `parse_completed`. So the installed build carries this parser.

The claim therefore rests on evidence I reproduced. It is not an assertion, and the brief's MAJOR condition is not met. What is still not proven is a live Codex refusal on this host. MINOR 1 covers that.

## (4) Tests rerun: pass

- The code is identical to 4f57e1a: `git diff --quiet 4f57e1a -- hooks scripts skills` exits 0.
- `node --test hooks/delete-guard.test.mjs scripts/codex-hook-trust.test.mjs skills/multi/scripts/hooks.test.mjs` gave 189 tests, 189 pass, 0 fail, exit 0. The log is at `…/scratchpad/int-review-tests.log`.
- D2-review-r2 asked for mirror-shim to be gated once D1 is present, so I also ran `node --test skills/multi/scripts/mirror-shim.test.mjs scripts/mirror-shared-skills.test.mjs`: 35/35 pass. The two tests that failed on D2 alone now pass with D1 merged.
- In the integrator's `pack/reports/int-suite.log`: 2002 pass, 0 fail, and zero `✖` lines.

## MINOR 1: D2 did not meet the spec's own fallback condition literally; the Codex refusal is unobserved live

- The spec's D2 fallback is triggered "if the deny shape cannot be established **on this host by a live check**". No live Codex check was run. The gap doc (docs/notes/2026-09-27-delete-deny-codex-pretooluse-gap.md, "What is still outstanding") and the comment at scripts/codex-hook-trust.mjs:412-423 both say so.
- D2 replaced the live check with source evidence. That evidence holds up (section 3), but it is a reinterpretation of the spec, not compliance with it.
- The wiring now installs on every `--codex-hooks` / `--codex-hooks-only` run, with no separate flag. The next mirror run on this host will write it into live Codex homes.
- The risk is bounded:
  - the hook fails open;
  - it is scoped to `matcher: 'Bash'`;
  - it denies only `spawn_agent` children, never a top-level Codex session.

  The worst realistic outcome is an inert guard, not a false block of a lead.
- Fix, for the lead and not the code: either run the gap doc's Follow-up 1 (a `spawn_agent` child in a scratch CODEX_HOME runs the probe) before the next live `--codex-hooks` run, or record in the work record that the lead accepts the source-plus-binary evidence in place of the spec's live check, and name it as such. Either way, the record must not claim a live Codex refusal was observed.
- Also a small wording error at scripts/codex-hook-trust.mjs:413: "hashes and matches the exact JSON". The upstream code parses that JSON; it does not hash it. Suggested replacement: "parses the exact JSON".

## MINOR 2: D2-review-r2's four non-blocking items and the SKILL.md sentence are not in the integrated tree

This is correct for an integrator, which must add nothing. The items are still open:
- the gap doc's "What is wired now" line does not name `matcher: 'Bash'` (gap doc :15-16);
- the `--codex-hooks` usage text implies the guard is optional, but the code refuses when the script is missing (scripts/mirror-shared-skills.mjs:629-631);
- the `write_stdin` reach gap is not written down;
- a stray blank line sits in the JSDoc at scripts/codex-hook-trust.mjs:411;
- `skills/multi/SKILL.md` has no Codex-reach sentence ("Codex: wired for Codex subagents; top-level Codex lanes are not guarded").

The open decision on guarding top-level Codex lanes also still has no owner.

Fix: apply the r2 patches verbatim in a follow-up commit, or list them as follow-ups in the record. None of them changes behaviour.

## MINOR 3: HEAD moved during this review; the added commit was not reviewed

- wt-int HEAD is now 4d8e398 ("docs(work): delete-deny delivered with live checks", 03:42:30 EDT). It sits on top of 4f57e1a and changes only `docs/work/wr-2026-09-27-delete-deny.record.md` (+3/-2).
- The live-check facts in its Log line match what I verified: 2.235 s, agent id a2d4d9c238c181450, and nothing ran.
- The Log line also says "Netcup 1999/2002 with 0 fail (3 skipped)". No artifact I was given backs that, and I did not verify it.

Fix: the orchestrator keeps the Netcup run's log next to the record, or cites where it is.

## NIT 1: the Stop probe's "across a --resume boundary" claim is weaker than stated

- `turn1.jsonl` shows the model echoing `PHRASE-STOPPROBE-7f3c9d21` in 8 of its own assistant messages. That makes the phrase part of the resumed transcript.
- Turn 2's `YES. Line: "Stop hook additional context: …"` shows that the injected context persisted in the transcript. It does not show that a fresh Stop firing after the resume delivers new context.
- This is informational only and not gating.

## NIT 2: the reviewer's own footprint

- To recompute the second merge on the first attempt, I ran `git commit-tree` once. That wrote one unreferenced commit object into wt-int's object store.
- No ref, index or working-tree file changed. `git status --short` still shows only `?? pack/`, which is the integrator's untracked suite log.
- Git gc will discard the object.

## Areas verified clean

- The merge trees have no extra content.
- The approval shas equal the merged tips.
- The live-check stamps, agent ids and reason text all match their source files.
- Codex's parsing of the deny, the Sync execution mode, the `tool_input.command` string type and the matcher in the trust hash all check out against the upstream source and the installed binary.
- No real delete ran during this review.

## C4 fields (not a bug-fix review; included so the gate reads a complete set)

Cause: not applicable. This is a feature integration review with no bug under fix.
Discriminating check: `git merge-tree --write-tree` recompute; the trees equal `601ef19^{tree}` and `4f57e1a^{tree}`.
Fix location: none required in code. MINOR 1 and MINOR 3 are record items; MINOR 2 is a follow-up commit.
Simplification: none proposed.
