# L1 state

## Territory
`skills/multi/scripts/note-send.mjs`, its test, `skills/multi/SKILL.md` (envelope.md untouched — no
field added). Serves GOAL's "rework after acceptance" measure: a cross-host ASK/RESULT pair now has
both halves on both hosts, so lane thirteen's overdue-cross-host rule (and the four-number read) stop
misreading a cross-host ACK as unanswered. NOT: touching note-flush.mjs/transport.mjs/envelope.mjs, or
top-tier execution — pure mid-tier build against a pinned contract.

## Contracts I rely on
`docs/specs/ledger-both-halves-1/contracts.md` R1-R4 (host table, `--append-ledger`, where the mirror
runs, territory/gates) — wins over spec.md wherever they differ. Host table frozen verbatim from
contracts R1 Facts. `appendLine`/`notesMirrorPath`/`parseEnvelope`/`MAX_LINE` imported, not redefined.

## Done
- `MIRROR_HOSTS` (4 rows), `resolveSenderHost`, `remoteAppendCommand`, `runMirror` (deps.spawnMirror
  injected), `runAppendLedgerMode` — all in note-send.mjs, all exported except the last two internals.
- `--sender-host`/`--append-ledger` in STRING_FLAGS, `--no-mirror` in BOOL_FLAGS.
- Mirror computed once, right after `for (const t of ledgerTargets) appendLine(...)` (line ~721),
  attached to `base` (spread into every return path) as `mirrorLedger` — present only when genuinely
  remote or unmapped-address; absent for local/`--no-mirror`.
- `--dry-run` plans the mirror (host + exact ssh command) without spawning; still reports
  `unknown-sender-address` since that doesn't depend on sending.
- `--append-ledger <day>` reads stdin, rejects over-length before parsing, requires `parseEnvelope` +
  day regex, appends via the shared `appendLine`/`notesMirrorPath` — no delivery, no outbox, no mirror
  of its own.
- SKILL.md: two spots edited (lane-13 overdue-cross-host sentence at old :143, cross-host paragraph at
  old :308) — see report for the exact diffs.
- 26 new tests added; 141/141 pass; N2 (hooks.test.mjs) green; no existing test edited.

## Next
Nothing outstanding for L1 itself. Open question (section 4, note-flush.mjs:1512's nudge-send) is
answered by reasoning, not code — see report. Integrator/reviewer may challenge that reasoning or the
"no special case for --to ben" design per contract R3's own invitation.

## Open questions
Whether "never from note-flush" (contracts R3) meant something stronger than "the nudge-send process
happens to have no SSH_CONNECTION/--sender-host so it resolves local" — flagged explicitly in the
report per the brief's instruction, not resolved by adding a suppression flag (out of territory).

## How to run my gate
```
node --test skills/multi/scripts/note-send.test.mjs > .../reports/L1-gate.log 2>&1 \
  && node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs >> .../reports/L1-gate.log 2>&1
```
Both green as of commit `097f6541f03467de66d06c39eceddeca4917ddd0` (141 + 1 tests, 0 failures).
