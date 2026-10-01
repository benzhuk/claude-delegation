# M1 round 2 addendum (lead rulings on docs/specs/multi-cross-host-1/reports/M1-review.md)

Findings file: docs/specs/multi-cross-host-1/reports/M1-review.md (commit it first: git add it, commit "docs(specs): M1 review r1").
- F1: apply the reviewer's patch verbatim (both hunks) plus its test.
- F2: the JSON `hint` string stays byte-exact as the spec pins it. Fix only the prose: the error message text, SKILL.md (:380, :430-431) and envelope.md (:178-179) say: run note-send on the recipient's machine over ssh, and inside that command add `--sender-host <the host you came from>` when SSH_CONNECTION does not map, so the line mirrors back to the sending host; `--sender-host` naming the machine you are running on has no effect. Do not document `--sender-host <recipient host>` from a local shell.
- F3, F4, F7: add the tests the reviewer describes (F3: the Object.keys mutation must fail a test; F4: an ACK at exactly the ASK instant answers; F7: quiet and --no-type refusals assert no ledger, mirror, outbox or wake file was written).
- F5: --dry-run reports the same refusal (exit 6, refusal JSON) instead of previewing success, with a test.
- F6: USAGE lists --local-ok.
All base-brief rules still apply (docs/specs/multi-cross-host-1/brief-M1.md): no deletion commands, fixtures only, no identity flags, separate add/commit/push, never touch docs/work/.
Gate: the two multi test files, then the full suite once into reports/M1-r2-gate.log, 0 fail. Push.
Report: docs/specs/multi-cross-host-1/reports/M1-r2-report.md, line 1 `DONE <sha>` or `BLOCKED <reason>`, a per-finding table (finding, disposition, file:line, test name). ETA 30 minutes.
