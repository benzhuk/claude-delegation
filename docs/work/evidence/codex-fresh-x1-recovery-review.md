VERDICT: NEEDS_FIXES 13d1605b10553b2d55c9b283a856d0dacef67e08

# X1 recovery review: Codex fresh-project correction

- **Reviewed artifact SHA:** `13d1605b10553b2d55c9b283a856d0dacef67e08` (`benzhuk/codex-fresh-x1`). Author Ben Zhuk, 2026-09-26 15:57:20 America/New_York. The branch's parent chain is `d01e4e8` → `a0e5d77` → `1a63cdc` → merge-base `60146fe`. It is not a descendant of `c05a497`.
- **Reviewer session id:** `415ff943-9d2b-4e82-b932-58017acd01e4`, from this session's continuation hook line.
- **Reviewer model:** `claude-opus-5-5` (Claude Code).
- **Method:** read-only. The reviewer used exact-SHA Git inspection, the native transcripts, continuation state, note ledger/inbox state, and the scratch Claude transcript. It made no edits, wrote no files, ran no tests, and ran no hooks.
- **Scope:** relative to `60146fe`, the target touches only `docs/reports/codex-fresh-0925/{state,walk,x2-findings}.md`. It is docs-only.

## What the independent evidence verifies

The live native Codex lead is genuine. The transcript at `C:/Users/benzh/AppData/Roaming/orca/codex-accounts/f8bc0bab-fa9c-4317-b296-797e4dc50024/home/sessions/2026/09/25/rollout-2026-09-25T18-31-35-01a0dab2-065e-7a31-bff4-9aecfe1fa833.jsonl` has 51 lines and SHA-256 `f1faefecac92f7a6b53dc3dcd8495ea6761553d8fc2f77e73ed7fd471e45bd76`. Its line 1 identifies a Codex TUI `source: "cli"` session in the scratch repo; lines 9 and 12 contain the hook-injected card and due-bearings context; lines 24–25 show the agent quoting it after one `Get-Content` call at line 17.

Live Claude-to-Codex delivery is also genuine. Scratch Claude transcript `C:/Users/benzh/.claude/projects/C--Users-benzh-AppData-Local-Temp-codex-fresh-x1-20260925/2e91f34a-07b0-42e2-97ac-d1507fbdf6ab.jsonl` records the `note-send` to `x1-native-codex` and codex-queue delivery. The ledger has the note at `C:/Users/benzh/.agents/notes/2026-09-25.md:67`; the Codex transcript has the queued note at line 31 and peer-note hook context at line 33. The agent did not ACK, which step 4 does not require.

The corrective synthetic rerun's method is consistent with isolation: no continuation file exists for its UUID `62e7c9f6-54f3-4f7c-93d4-2b6dbb3bc2f1`, that UUID is absent under `C:/Users/benzh/.agents`, and `x1-r3-isolated-codex` is absent from `inboxes.json`. The rerun itself remains unreviewable because its commands, times, outputs, copied transcript path, and retained log are absent.

The parent continuation file `ef7094e1…json` is currently generation 15, active, and bound to `wr-2026-09-25-codex-fresh-project`. Its SHA-256 now is `1079e7a3…`, not the claimed `984f4914…`, so that reported before/after hash cannot be reproduced.

## Judgment on B1–B4

| Item | Status | Basis |
|---|---|---|
| B1 isolation / parent state | Partly resolved | The rerun method is sound and parent state is clean, but no per-probe environment list exists; stale proof text remains; the hash is not reviewable. |
| B2 native hook execution | Resolved in substance | Live transcript lines 9, 12, and 33 prove SessionStart, UserPromptSubmit, and peer-delivery handlers on the Codex TUI launch path. |
| B3 usable document correction | Partly resolved | Escaped quotes are fixed; correction 2 remains conflated with the earlier launch failure. |
| B4 no X2 code change | Supported with a qualifier | No adapter-logic gap was found for the verified Orca `powershell.exe` launch path; other outer launchers remain unverified. |

## Blocking

### X-1 — MAJOR: the parent lead's pane was bound to the scratch slug, contrary to the report

`C:/Users/benzh/.agents/notes/panes.json` maps `term_617edbd1-e2a2-4982-8285-25d36cf11d03` to `x1-scratch-codex`; `inboxes.json` maps that slug to parent thread `01a0daaa-63a0-7f81-a42f-6883d7c68961` in the `gudgeon` cwd. Both were written at 6:43:53 PM America/New_York during the parent lead's own UserPromptSubmit. This conflicts with `walk.md:19` (“no parent pane was targeted”).

Fix: disclose the original probe environment and binding, remove the scratch pane/inbox entries and pending ASK through the janitor, record cleanup, and determine whether any `skills-a` notes were missed while the pane resolved to the scratch slug.

### X-2 — MAJOR: the corrective rerun is asserted, not reviewable

`walk.md:9` and `x2-findings.md:7-11` omit command heads, exact environment, output heads, timestamps, copied-transcript path, and retained log. Sections 2–4 still quote the original unsafe probes without marking them superseded.

Fix: retain committed command/output evidence, identify exact NYC probe times, label original synthetic output superseded or replace it, and describe the hash as an observation that is non-reproducible after later lead writes.

### X-3 — MINOR: OS-error-5 attribution contradicts the recovery

`walk.md:36` says the unified-exec failure matches `docs/native-use.md:114`, while `walk.md:11` and `:138` say they are different process boundaries.

Fix: rewrite line 36 to match the latter evidence.

### X-4 — MAJOR: step verdicts exceed the stated spec criteria

`spec.md:18` requires `codex exec "hi"` to print a hook line and hook-reported version 0.20.9, but `walk.md:34` shows no hook line and takes version from the mirror manifest. `spec.md:20` requires transcript `systemMessage`, while the native transcript preserves only `hooks.additional_context`; the claimed TUI rendering has no captured artifact.

Fix: mark those criteria as replaced discrepancies, retain PASS only with that qualification, and attach any retained TUI capture or label rendering an operator observation.

## Nonblocking

- **N-1 — MINOR:** `walk.md:125` should say hooks ran for Codex 0.156.1 launched by `orca terminal create --shell powershell.exe`; default outer-shell behavior remains untested.
- **N-2 — MINOR:** `x2-findings.md:5` must scope its conclusion to SessionStart, UserPromptSubmit, and peer delivery on that launch path. PostToolUse/Stop are unproven.
- **N-3 — MINOR:** enumerate remaining spec discrepancies: `docs/GOALS.md` versus default `docs/goals/card.md`; exec hook-line/version expectations; transcript `systemMessage`; and pane-binding behavior of `note-inbox --ack`.
- **N-4 — MINOR:** disclose that the live probe used real `AGENTS_HOME` and left continuation/inbox state; clean it with the janitor.
- **N-5 — INFO:** pin native transcript SHA-256 and line count in the walk.
- **N-6 — INFO:** do not commit the stray `Cannot overwrite variable Error because it is read-only or constant` file.
- **N-7 — INFO:** retire the dead scratch Claude inbox registration through janitor cleanup.

## Integration as docs-only evidence

After the blocking fixes, port `a0e5d77`, `d01e4e8`, `13d1605`, and the fix commit onto the frozen `c05a497` lineage; do not merge the divergent branch. Then replace the untracked historical `docs/work/evidence/2026-09-25-codex-fresh-project.md` with corrected evidence (or a committed pointer), update and commit the record with the new artifact, correction/cleanup/review logs, and this reviewer identity. No integration action was performed by this review.

## Minimum next gate

1. Fix X-1 through X-4 in one docs-only commit, including N-1 and N-3 wording, then reconcile it on the `c05a497` lineage with committed evidence and record.
2. Run a short independent read-only re-review of that exact SHA.
3. Only then run the sealed suite, `check-acceptance`, `accept --no-census "<exact script reason>"`, and the RESULT.

This review does not accept the lane.
