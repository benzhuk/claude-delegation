DONE 8ab8e6c

# M1 round 3 report — patches applied against docs/specs/multi-cross-host-1/reports/M1-review-r2.md

Branch `build/multi-cross-host-1`. Commits this round: `b63ed48` (docs: commit the r2 findings file),
`8ab8e6c` (R2-1 docs, R2-2 test, NIT clause), `6b1aee7` (round-3 gate log). Pushed to
`origin/build/multi-cross-host-1`.

## Per-patch disposition

| Patch | Disposition | file:line | Test name |
|---|---|---|---|
| R2-1: SKILL.md:438 dry-run sentence contradicted the F5 code | Applied verbatim | `skills/multi/SKILL.md:438` | docs-only, no test (the existing `Defect 1: --dry-run on the quiet path reports the exit-6 refusal too` test already covers the corrected claim) |
| R2-1: envelope.md:186 dry-run sentence contradicted the F5 code | Applied verbatim | `skills/multi/references/envelope.md:186` | docs-only, same as above |
| R2-2: stamped-host regression guard was missing (every real registration carries `host: os.hostname()`, and the existing guard never stamped one, so `!localInboxRec.host` survived) | Applied verbatim, plus renamed the existing test's title per the reviewer's suggestion (dropped "or matches os.hostname()", since it only covers the no-host case) | `skills/multi/scripts/note-send.test.mjs` (new test after the renamed one) | Renamed: `Defect 1: a SAME-host registered inbox still exempts --to as before (no host field)`. New: `Defect 1: a registered inbox stamped with THIS host (as every real registration is) still exempts --to` |
| NIT: thrown message missing "`--sender-host` naming the machine you are running on has no effect" | Added, prose only — the pinned JSON `hint` field is unchanged, byte-exact | `skills/multi/scripts/note-send.mjs:531-532` (the thrown `NoteError` message text) | none needed (no existing test asserts the message's exact prose beyond `/NO ledger line was written/`) |

## Gate numbers
- `node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/note-flush.test.mjs`:
  tests 315, pass 315, fail 0, cancelled 0, skipped 0, todo 0 (up from 314 last round — 1 new test,
  R2-2).
- `node scripts/run-tests.mjs` (full suite, log at
  `docs/specs/multi-cross-host-1/reports/M1-r3-gate.log`): tests 2369, pass 2365, fail 0, cancelled 0,
  skipped 4, todo 0.

## Notes
- Findings file committed first as instructed: `git add docs/specs/multi-cross-host-1/reports/M1-review-r2.md`,
  commit `b63ed48` "docs(specs): M1 review r2".
- No code behavior changed this round (the reviewer confirmed F1-F7's code is already correct; R2-1
  and the NIT are prose-only, R2-2 is test-only).
- No deletion commands run, no git identity touched, no `--no-verify`, add/commit/push kept as
  separate commands, `docs/work/` untouched, no force push.
- Territory unchanged from the brief: `skills/multi/scripts/note-send.mjs`, `note-send.test.mjs`,
  `skills/multi/SKILL.md`, `skills/multi/references/envelope.md`. No other file edited.
