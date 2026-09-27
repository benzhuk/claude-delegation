# M1 builder state

## Territory
`skills/multi/scripts/note-send.mjs`, `note-flush.mjs`, `note-send.test.mjs`, `note-flush.test.mjs`,
`skills/multi/SKILL.md` (exit table), `skills/multi/references/envelope.md`,
`docs/specs/overdue-asks-1/spec.md` (dated amend line).

## Contracts I rely on
- `docs/specs/multi-cross-host-1/spec.md` — Defect 1 (exit 6 refusal) and Defect 2 (ack answers
  `Needs: ack`) pinned text.
- `transport.mjs`'s `resolvePaneWithSource` message shapes (read-only, never edited): not-found
  starts `no pane titled "`; ambiguous says "matches N panes" / "is bound to N live panes".
- `envelope.mjs`'s `NoteError`, `envelopeInstant` (read-only, never edited).
- Both defects land on `origin/main`-based branch `build/multi-cross-host-1` at base `0c92605`.

## Done
- Defect 2 (note-flush.mjs): `collectOverdueAsks` second pass answers a `Needs: ack` ASK only by an
  on-time ACK from the ASK's own `to`. Committed `d525740`.
- Defect 1 (note-send.mjs): new exit 6 refusal (`no-local-recipient`), `--local-ok` bypass, wired
  into both the quiet/no-type path and the typed-path not-found branch. `failureJson` surfaces
  `refused`/`hint`. Committed `3ba1cb4`.
- SKILL.md exit table + prose, `references/envelope.md` N3 paragraph — both updated, committed
  `3ba1cb4`.
- `docs/specs/overdue-asks-1/spec.md:14` — dated amendment line added, committed `d525740`.
- 8 pre-existing note-send.test.mjs tests amended with `--local-ok` (their own intent predates
  Defect 1); 8 new Defect-1 tests added.
- note-flush.test.mjs: kept the `Needs: review` non-answer test, added 3 `Needs: ack` cases
  (answered, self-ACK, stale-ACK).
- Scoped gate: `node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/note-flush.test.mjs`
  → 307/307 pass.
- Full suite: `node scripts/run-tests.mjs` → 2357 pass, 4 skipped, 0 fail. Log at
  `docs/specs/multi-cross-host-1/reports/M1-gate.log`.
- Pushed `build/multi-cross-host-1` to origin (782e23b..3ba1cb4).
- Grepped all of scripts/, hooks/, skills/ for note-send argv-building callers: exactly 3
  (`collect-status.mjs:164`, `decisions-pickup.mjs:543`, `note-flush.mjs:1622`), all pass
  `--recipient-repo` unconditionally — none can hit exit 6.

## Next
Nothing outstanding in-territory. Final report written to
`docs/specs/multi-cross-host-1/reports/M1-report.md`.

## Open questions
- The spec's ambiguous acceptance clause ("the typed path still exits 2 after the ledger write when
  an inbox IS registered") is structurally impossible to hit literally for the SAME `--to` slug (a
  registered inbox skips pane resolution entirely per the pre-existing C9 rule, so `paneError` is
  never set). I interpreted and tested it as: an inbox registered for a DIFFERENT slug does not
  suppress the refusal-exemption scoping when `--recipient-repo` is used for the actual `--to` —
  see test `Defect 1: --recipient-repo is exempt …` in note-send.test.mjs. Flagging this as my own
  judgment call, not an unambiguous literal reading.

## How to run my gate
```
node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/note-flush.test.mjs
node scripts/run-tests.mjs > docs/specs/multi-cross-host-1/reports/M1-gate.log 2>&1
```
