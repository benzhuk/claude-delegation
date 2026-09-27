DONE a1329dc9e3b1334652084e961fbe0d01b4edff07

# M1 round 2 report — lead rulings applied against docs/specs/multi-cross-host-1/reports/M1-review.md

Branch `build/multi-cross-host-1`. Commits this round: `260ed50` (docs: commit the findings file),
`a7b2242` (F1/F2/F3/F4/F5/F6/F7 code, tests, docs), `a1329dc` (round-2 gate log). Pushed to
`origin/build/multi-cross-host-1`.

Goal-card line served: "Change only what improves one of these and worsens none: top-tier tokens per
build, hours ask to accepted, rework after acceptance, work lost or stalled." These fixes close a real
lost-note path (F1) and two untested mutation-survival gaps (F3, F4) the review's own attack pass
found — work lost or stalled is the measure. Nearest NOT: "a rule no script checks" — every finding
here landed as a test, not prose alone.

## Per-finding table

| Finding | Disposition | file:line | Test name |
|---|---|---|---|
| F1 (MINOR): foreign-host inbox record exempted the refusal | Fixed — `localInboxRegistered` now requires `!host \|\| host === os.hostname()`; Case A also fires on a foreign `inboxRecord` (typed path), not just quiet/`--no-type` | `note-send.mjs:509-514` (predicate), `note-send.mjs:536-539` (Case A `\|\| inboxRecord`) | `Defect 1: an inbox registered on a DIFFERENT HOST does not exempt --to - still exit 6 (quiet path)`; `Defect 1: an inbox registered on a DIFFERENT HOST does not exempt --to - still exit 6 (typed path, would otherwise exit 3)`; `Defect 1: a SAME-host registered inbox still exempts --to as before (no host field, or matches os.hostname())` (regression guard) |
| F2 (MINOR): `--sender-host <this host>` advice was wrong for a local run | Fixed — prose only, the pinned `hint` JSON string is byte-exact unchanged. Lead's ruling: ssh to the recipient's machine, add `--sender-host <the host you came from>` inside that command only if `SSH_CONNECTION` doesn't map; never `--sender-host <recipient host>` from a local shell | `note-send.mjs:513-521` (thrown message text, not the `hint` field), `SKILL.md:380` (table row), `SKILL.md:430-434` (Fix: paragraph), `envelope.md:177-183` (N3 clarifying sentence after the JSON quote) | none (docs-only; the JSON `hint` assertions in existing Defect-1 tests are unchanged and still pass) |
| F3 (MINOR): no test proved a different-slug inbox doesn't exempt `--to`; report's coverage claim was wrong | Fixed — reviewer's exact patch applied verbatim, `--recipient-repo` dropped so only the foreign-slug inbox is in play; the wrong M1-report.md paragraph is superseded by this report | `note-send.test.mjs` (new test, placed after the `--recipient-repo` exemption test) | `Defect 1: an inbox registered for a DIFFERENT slug does not exempt --to - still exit 6, nothing written` |
| F4 (MINOR): "at or after" untested for the "at" half | Fixed — reviewer's exact patch applied verbatim (code at `note-flush.mjs:1425` already used strict `<`, so only the test was missing) | `note-flush.test.mjs` (new test after the stale-ACK test) | `overdue-asks: an ACK in the SAME minute as its Needs: ack ask answers it (at or after) - never nudged` |
| F5 (NIT, lead upgraded to required): `--dry-run` previewed success for a send that would be refused | Fixed in code, not docs-only, per the addendum's ruling — `!dryRun` removed from `canRefuseNoLocalRecipient`; Case A (quiet/`--no-type`/foreign-inbox, fully knowable without touching orca) now also refuses under `--dry-run`. Case B (typed-path pane lookup) is unchanged: `--dry-run` never calls orca, so whether a pane would resolve is genuinely undeterminable there, and that preview is left as-is (scoping decision, noted below) | `note-send.mjs:515-521` (predicate), `SKILL.md:434` and `envelope.md:183` (one sentence each: "`--dry-run` never refuses") | `Defect 1: --dry-run on the quiet path reports the exit-6 refusal too, not a success preview`; `Defect 1: --dry-run + --local-ok still previews the ledger-only success, unaffected` (regression guard) |
| F6 (NIT): USAGE didn't list `--local-ok` | Fixed, one-line patch applied verbatim | `note-send.mjs:1075` | none (USAGE string; no existing test parses its literal flag list) |
| F7 (NIT): quiet/`--no-type` refusal tests didn't assert no write happened | Fixed, reviewer's patch applied verbatim to both tests | `note-send.test.mjs:1126-1153` (`Defect 1: the quiet (ledger-only) path is refused too…` and `Defect 1: --no-type is refused too…`) | same two test names, now with the added `fs.existsSync` assertions |

## F5 scoping note
The addendum's ruling ("reports the same refusal … instead of previewing success") is fully satisfied
for every case the review's own probe demonstrated (a quiet FYI under `--dry-run`) and for `--no-type`
and the foreign-inbox variant, all of which are decidable without an orca call. The typed-path
`--dry-run` preview (a slug ASK with no inbox, no mirror, no `--recipient-repo`) still previews the
pre-Defect-1 "would record and exit 3" line, because dry-run deliberately never resolves a pane
(`In --dry-run we never touch orca at all`), so whether that send would ultimately hit Case B's
not-found refusal or a real pane is unknowable without doing the very orca call `--dry-run` exists to
skip. No caller regressed: the pre-existing `--dry-run without --recipient-repo says why it cannot
plan` test (ASK, no quiet/no-type/inbox trigger) still exits 1 exactly as before, and every existing
`--dry-run` test that reaches a preview passes `--recipient-repo` or a real mirror target, so none was
ever in the refused set.

## Gate numbers
- `node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/note-flush.test.mjs`:
  tests 314, pass 314, fail 0, cancelled 0, skipped 0, todo 0 (up from 307 in round 1 — 7 new tests:
  3 for F1, 1 for F3, 1 for F4, 2 for F5).
- `node scripts/run-tests.mjs` (full suite, log at
  `docs/specs/multi-cross-host-1/reports/M1-r2-gate.log`): tests 2368, pass 2364, fail 0, cancelled 0,
  skipped 4, todo 0.

## Notes
- Findings file committed first as instructed: `git add docs/specs/multi-cross-host-1/reports/M1-review.md`,
  commit `260ed50` "docs(specs): M1 review r1".
- No caller in scripts/, hooks/, skills/ was newly affected — the round-1 grep result (3 callers, all
  passing `--recipient-repo` unconditionally) is unchanged by this round's fixes, since none of them
  touch a caller.
- No deletion commands run, no git identity touched, no `--no-verify`, add/commit/push kept as
  separate commands, `docs/work/` untouched.
- Territory unchanged from the brief: `skills/multi/scripts/note-send.mjs`, `note-flush.mjs` (test
  only this round), `note-send.test.mjs`, `note-flush.test.mjs`, `skills/multi/SKILL.md`,
  `skills/multi/references/envelope.md`. No other file edited.
