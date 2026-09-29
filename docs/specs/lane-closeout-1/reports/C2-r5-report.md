DONE 3ba867968c516e16ef15ac4a9e108ae041eb64e2

# C2 round 5: amend Ruling W's note-send exemption (N7)

Worktree: /home/ben/Code/claude-delegation-wt/lane-closeout-1-C2, started from 8bc8bd574666e81d0e7b16b4a45abf1789ff10b9.

## What changed

Applied the reviewer's exact current → replacement regex from
docs/specs/lane-closeout-1/reports/C2-review-r4.md verbatim, and nothing else
in `hooks/delete-guard.mjs`:

`hooks/delete-guard.mjs:336` (`NOTE_SEND_LINE_RE`):
- Before: `/^note-send ((?:[^\s<>|;&$\`()#]|[ \t])*) --packet-file - <<'([A-Za-z_][A-Za-z0-9_]*)'$/`
- After: `/^note-send ((?:[^\s<>|;&$\`()#'"\\]|"(?:[^\s<>|;&$\`()#"\\]|[ \t])*"|'(?:[^\s<>|;&$\`()#'\\]|[ \t])*'|[ \t])*) --packet-file - <<'([A-Za-z_][A-Za-z0-9_]*)'$/`

`<args>` may now hold `'` and `"` only as complete pairs (no quote of the
other kind, and no `\`, inside a pair), and `\` is excluded everywhere on
line 1. Comments and header text were left untouched, per "Change nothing
else."

`hooks/delete-guard.test.mjs`, in the `W_REPROS` array (ends just above
`];` at what was line 678):
- Added the reviewer's three N7 rows verbatim (N7a lone double quote, N7b
  lone single quote, N7c quote glued onto an argument) — each `must refuse`.
- Added one pass test for the real shape from the addendum: `note-send
  --from a --to b --kind RESULT --text "x y" --packet-file - <<'EOF'`
  (with a body line and delimiter) — asserts `detectDelete(...) === null`
  (stays exempt).

No other file touched.

## Gate

1. `node --test hooks/delete-guard.test.mjs agents/agents.test.mjs`:
   `tests 231`, `pass 231`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`.
   (227 base + 3 N7 repro tests + 1 new pass test = 231.)

2. `node scripts/run-tests.mjs`, log at
   docs/specs/lane-closeout-1/reports/C2-r5-gate.log:
   - Final summary (line 2854-2859): `tests 2680`, `pass 2674`, `fail 1`,
     `skipped 5`.
   - The one failure is `scripts/work-record.test.mjs:2340`, the pre-existing
     GOALS.md STALE test (unsourced 152-turn baseline). This predates this
     lane, per the addendum, and is unrelated to hooks/delete-guard.
   - The nested `fail 1` at log line ~1220 is run-tests' own self-test of a
     failing inner suite (same pattern the r4 report noted at its own
     `:1212`); it is not a real failure.

No command was denied. No literal recursive-delete command was typed in any
shell command; the two new test bodies build `DEL` (`'rm -rf x'`) via the
pre-existing string concatenation already in that block, same as all other
W_REPROS rows.

Committed on wt/lane-closeout-1-C2 at 3ba867968c516e16ef15ac4a9e108ae041eb64e2. Not pushed.
