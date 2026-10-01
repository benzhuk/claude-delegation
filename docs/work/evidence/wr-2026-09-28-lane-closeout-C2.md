VERDICT: APPROVE 3ba867968c516e16ef15ac4a9e108ae041eb64e2

# C2 review, round 5 (lane 36): delta check of the N7 fix at 3ba8679

Artifact: wt/lane-closeout-1-C2 at 3ba867968c516e16ef15ac4a9e108ae041eb64e2. This is a delta against 8bc8bd574666e81d0e7b16b4a45abf1789ff10b9, which I reviewed in reports/C2-review-r4.md.

How I reviewed:
- Read-only. `git status --short` printed 0 lines before and after.
- No command was denied.
- I wrote and ran no delete-shaped string. The probes use only the harmless marker `echo MARKER_$((6*7))`, and `note-send` is a shell function that swallows stdin.
- Scratch: `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C2-review/r4/` (`r5/guard-r5.mjs`, `probe-ns-r5.mjs`, `edges-r5.mjs`).

## Bug-fix fields

Cause: `NOTE_SEND_LINE_RE` let `'`, `"` and `\` into the note-send `<args>` as plain characters. An unbalanced quote left bash inside a string at the end of line 1, so the "body" that the guard exempted was really commands to bash (r4 N7).

Discriminating check: `node probe-ns-r5.mjs` against the 3ba8679 guard.
- N7a, N7b and N7c now print `checked`. At 8bc8bd5 they printed `EXEMPT bash-ran=YES`.
- Both controls, `--to x` and `--to x --text "a b?"`, still print `EXEMPT bash-ran=no`.

Fix location: `hooks/delete-guard.mjs:336` (`NOTE_SEND_LINE_RE`), and `hooks/delete-guard.test.mjs:678-694` (3 repro rows and 1 pass test).

Simplification: the fix is one regex, and the exemption is still an exact whitelist, not a parser. Quotes are accepted only as complete pairs on line 1, backslash is excluded everywhere, and no parsing code was added.

## Checks

1. **Scope of the delta.** `git diff --stat 8bc8bd5..3ba8679` shows 2 files, +12 and -1, in one commit.
   - `hooks/delete-guard.mjs`: the only change is line 336. It is byte-identical to the replacement I gave in r4 N7.
   - `hooks/delete-guard.test.mjs`: the three N7 rows, as I wrote them, are appended to `W_REPROS`, plus one pass test.
   - Nothing else changed.
2. **N7 shapes and the real shape.** See the discriminating check above.
   - I re-ran the 25 inert edge rows (`edges-r5.mjs`), and their output is byte-identical to the r4 run (`diff` is empty). The `cat`/`tee`/`git` shapes and the `\r`, whitespace, trailer and suffix handling did not regress.
   - The new regex matches only inputs the old one matched: its character classes are subsets, and quotes are allowed only inside complete segments. The saved probes contain no note-send heredoc. So the lead's report that the 106-case, 13-repro and 24-suffix outputs are byte-identical to r4 is what I predicted. No r5 probe-output file is saved in reports/, so I relied on the lead's statement plus this argument.
3. **Territory tests** (I ran them at 3ba8679). `node --test hooks/delete-guard.test.mjs agents/agents.test.mjs`:
   ```
   ℹ tests 231
   ℹ pass 231
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ```
   - The count is 227 + 4. `Ruling W repro N7a/N7b/N7c … must refuse` and `Ruling W real note-send shape … stays exempt` all pass.
   - The gate is at `reports/C2-r5-gate.log:2854-2859`: `tests 2680`, `pass 2674`, `fail 1`, `skipped 5`. The one failure is the pre-existing GOALS.md STALE test (`scripts/work-record.test.mjs:2340`).
4. **The pinned sentence.** Neither the eight role files nor `agents/agents.test.mjs` changed in this delta. They still pass, as verified in r4.

## Findings (non-gating)

### M1: MINOR. The new pass test does not exercise the exemption

`hooks/delete-guard.test.mjs:691-694` uses the body `'body text'`, which no detector matches. `detectDelete` would return `null` for it even if the note-send regex stopped matching the `--text "x y"` form.

The refusal side is pinned correctly by N7a-c. What is not pinned is the false-refusal side for real usage.

Fix. Current:
```js
    const cmd = "note-send --from a --to b --kind RESULT --text \"x y\" --packet-file - <<'EOF'" + NL + 'body text' + NL + 'EOF\n';
```
Replacement:
```js
    const cmd = "note-send --from a --to b --kind RESULT --text \"x y\" --packet-file - <<'EOF'" + NL + 'warned peer about the ' + DEL + ' incident' + NL + 'EOF\n';
```
Predicted result: the test passes at 3ba8679. It would fail if the quoted-segment branch of the regex were removed, because the line would then no longer be exempt and the delete detector would match the body.

### M2: MINOR (comment only). Two comments still describe the old `<args>` rule

`hooks/delete-guard.mjs:332-335` and the header at `:88-90` still say that `<args>` is any non-`\s` character outside the metacharacter list. The fix: add "quotes only as complete `"…"`/`'…'` segments on line 1; no backslash" to both. There is no behaviour change.

## Verified absent

- **Regressions in the delta.** None. The diff contains only the regex and the tests, and the edge-row output is identical to r4.
- **Backtracking cost.** A 320 KB adversarial note-send line 1 took 2-5 ms with this exact regex, measured in r4 on the scratch copy.
- **Real repo usage.** All note-send lines in the repo (`skills/multi/SKILL.md:327`, `skills/multi/references/examples.md:93`, `skills/multi/scripts/note-send.mjs:1100`) use balanced `"…"` arguments, and those still match.
