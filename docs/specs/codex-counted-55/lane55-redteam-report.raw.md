NEEDS_FIXES spec 5d0b5dc

Reviewer: Claude Opus 5.5 (claude-opus-5-5), agent lane55-redteam, worktree C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/9c61c35a-82dd-4aef-8eca-c99bb0e72e31/scratchpad/wt-redteam-55 (detached 5d0b5dc). Read-only. Time: America/New_York, 2026-09-28.

Denied step, verbatim: the final `git -C /c/Users/benzh/Code/claude-delegation worktree remove "$SCRATCH/wt-redteam-55" --force` was refused with "PreToolUse:Bash hook error: delete-guard: recursive delete refused for an agent (git worktree remove --force). Removal of worktrees and scratch is the lead's own standalone command; report what needs deleting." Not retried. The lead should remove worktree wt-redteam-55 at the path above.

Files: docs/specs/codex-counted-55/final-spec.md (cited as final-spec:N, 1-based lines of that file).

## MAJOR

1. **COUNTED on line 1 is an acceptance gate, and the spec decouples it from coverageSupported without saying so.** (final-spec:21)
   work-record.mjs:968 accepts a census for acceptance only when line 1 matches `^VERDICT: COUNTED\b` (isCensusFile). Today build-census.mjs:1694-1696 prints COUNTED exactly when lead.coverageSupported is true. The spec lets the text say COUNTED while coverageSupported stays false and token fields are UNSUPPORTED. That silently changes work-record acceptance behaviour for Codex records and breaks the COUNTED-iff-coverageSupported invariant.
   Add: "The line-1 prefix `VERDICT: COUNTED ` is printed if and only if the census is temporally complete (discovery.scope.complete true and every selected file time-complete). Unsupported fields never block it but are listed on line 1 as `; UNSUPPORTED <field>[, <field>]`. The existing line-1 wording `<n> Codex responses (leadTurns <m>)` is kept byte for byte. The existing work-record suite, unedited, is run to show isCensusFile accepts the new COUNTED line and refuses a PARTIAL one. Accepting a COUNTED census that carries UNSUPPORTED fields is intended and stated in docs/census.md."

2. **"coverageSupported stays conservative" is undefined, so the DONE numbers may still be `unread`.** (final-spec:21)
   four-read.mjs:67 gates every Codex token cell on lead.coverageSupported === true, and its token summary (~:116) also requires finite cache_creation_input_tokens per model. If "conservative" means false whenever any field is UNSUPPORTED, the four-read Codex rows stay unread and codex-rows.md must take numbers from census text, which the spec does not say.
   Add: "lead.coverageSupported is true iff temporal completeness holds and inputTokens, cachedInputTokens, outputTokens, model and derivedTotalTokens are all COUNTED. Codex has no cache-write tier: combined[model].cache_creation_input_tokens is 0 with fields.cacheWriteTokens COUNTED only if the log format proves no such tier exists, otherwise null and UNSUPPORTED. codex-rows.md takes each token and turn cell from four-read output when available and from census JSON otherwise, and each cell names its source."

## MINOR

3. **A same-id resumed lead is refused, not merged.** (final-spec:15) Codex resume can write a second rollout file carrying the same session_meta.payload.id. None exists among the 183 files today (first-line ids checked: zero duplicates), but as written a routine resume becomes an error with no numbers.
   Change "Refuse ... conflicting same-id copies" to: "Non-identical files with the same payload.id are segments of one logical session. They are unioned with response-id deduplication, and only an overlapping response id with different usage is a refusing conflict. A test covers a two-segment lead and a conflicting pair."

4. **Out-of-graph token spend is invisible rather than UNSUPPORTED.** (final-spec:17) A `codex exec` runner the lead launches through the shell starts its own root and is excluded as unrelated, though its tokens are real build cost.
   Add: "Sessions whose metadata proves a different root are excluded from counts. The census and codex-rows.md state that the counted scope is the lead's own session graph and excludes shell-launched codex exec runners and other hosts' agents."

5. **Reasoning tokens risk double counting.** (final-spec:20) The field list has outputTokens and reasoningOutputTokens but no rule for combining them.
   Add: "reasoningOutputTokens is a subset of outputTokens as Codex reports them, verified against the token_count schema in a fixture. derivedTotalTokens = inputTokens + outputTokens and never re-adds reasoning or cached tokens."

6. **Old versus new census outputs are unstated.** (final-spec:34) The pickup allows rewriting the five census files; the spec writes to codex-evidence/ and is silent about the old ones.
   Add: "The five existing census files are not rewritten. New outputs go only to docs/reports/census-0928/codex-evidence/, and each begins with the generating origin/main SHA and command. The lane 37 exact-base PARTIAL stays as L55-lane37-baseline.census.* in the spec folder and is cited from codex-rows.md."

## NIT

7. **The record seam is not needed.** (final-spec:8) parseRecord is already exported by work-record.mjs:163, and four-read already takes `--lead-session <id>`. A `--lead-session <id>` flag on build-census does the job with no record parsing. If --record stays, add: "imports parseRecord unchanged; work-record.mjs and the record format are not edited."

Checked and fine: the id match uses payload.id and never treats the filename as proof. The time witness is a real field: a timestamped row beyond --to, or a task_complete whose turn_id matches the last task_started. A still-running lead cannot read as complete for an open window. The Claude --lead path is stated unchanged, and four-read.mjs and review-run.mjs are untouched.
