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

## Done — round 3 (fix round, reviewed at b667652)
Applied both findings in `reports/L1-review-2.md` (VERDICT: NEEDS_FIXES (2)), verbatim per the
reviewer's exact patches. Both were test-strength findings only — no production code changed.
- MAJOR-1: the R3 real-retry test injected `SSH_CONNECTION: '100.69.249.18 1 2 3'` (zhuk-netcup's own
  address, matched by the gate host's own interface) with no `hostname`/`localAddrs` override, so
  round 2's self-check fix made the test a no-op on the gate host itself. Changed the address to
  `100.111.119.54` (zhuk-vps32, never this machine) and pinned `hostname: 'test-host', localAddrs: []`.
- MINOR-1: the 701-char `--append-ledger` test used `'a'.repeat(MAX_LINE + 1)`, rejected by
  `parseEnvelope` on shape alone regardless of the length guard. Replaced with a real parseable
  envelope body padded to exactly `MAX_LINE + 1` chars, plus `assert.ok(parseEnvelope(over), ...)`.
- Suite: still 147 pass / 0 fail (same count — in-place test-body fixes). N2 green, 1/1.
- This round's diff: only `note-send.test.mjs`, 9 insertions / 4 deletions. Cumulative
  `git diff --stat 026a7a0..HEAD`: still 3 files (`SKILL.md`, `note-send.mjs`, `note-send.test.mjs`).
- Committed at `b87791b182b8d81b281842a57df094ce90381495`.

## Done — round 2 (fix round, reviewed at 097f654; full detail in git log / L1.md round-2 report)
Applied every finding in `reports/L1-review-1.md` plus the lead's addendum: MAJOR-1 (EPIPE listener
on mirror child stdin), MAJOR-2 (`failureJson` spreads `mirrorLedger` from a thrown `NoteError`),
MAJOR-3 (self-mirror check also matches `deps.localAddrs`, not just hostname label), MAJOR-4 (R3
retry test drives the real imported `runNoteFlush`, not a stub), MINOR-1 (`--append-ledger` rejects
701-char and trailing-CR bodies), MINOR-2 (every mirror-reachable test injects hermetic
`hostname`/`localAddrs`), MINOR-3 (timeout resolves from the timer, not `'close'`, for a grandchild
holding stderr), MINOR-4 (lead ruling: no code change, reasoning stands). Lead addendum #3 (SKILL.md
overdue-nudge wording matches `observableAnswerSide`'s `>= askAt` check) and #4 (R2 constraints
already correct) both confirmed. Suite went 141 → 147 pass / 0 fail. Committed at `b667652`.

## Next
Nothing outstanding for L1 as of round 3. MINOR-4's tmux/interactive-ssh residual exposure is the
lead's own ruling to leave open, not a builder action item.

## Open questions
None new. MINOR-4's scope (tmux sessions started over ssh inheriting `SSH_CONNECTION` into a
note-flush nudge) was ruled on by the lead as not counted against the builder — flagged for
visibility only.

## How to run my gate
```
node --test skills/multi/scripts/note-send.test.mjs > .../reports/L1-gate.log 2>&1 \
  && node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs >> .../reports/L1-gate.log 2>&1
```
Both green as of commit `b87791b182b8d81b281842a57df094ce90381495` (147 + 1 tests, 0 failures).
