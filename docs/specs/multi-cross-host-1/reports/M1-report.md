DONE 3ba1cb43ebfea2e26aa0ab5804c9a7771698206e

# M1 report — lane 25, multi-cross-host

Branch `build/multi-cross-host-1`, base `0c92605`, worktree
`/home/ben/Code/claude-delegation-wt/multi-cross-host-1`. Two commits:
`d525740` (Defect 2, note-flush), `3ba1cb4` (Defect 1, note-send + docs).
Pushed to `origin/build/multi-cross-host-1`.

## Defect 1 — note-send exit 6 refusal, no local recipient

### What changed
- `skills/multi/scripts/note-send.mjs:125` — `'local-ok'` added to `BOOL_FLAGS`.
- `skills/multi/scripts/note-send.mjs:506-527` — new `localInboxRegistered` (computed independent of
  `--no-type`, unlike the pre-existing `inboxRecord`), `localOk`, `canRefuseNoLocalRecipient`, and the
  `refuseNoLocalRecipient()` NoteError(6, …) factory carrying `{refused:'no-local-recipient', to,
  hint}`. Case A throws immediately when `quietSkipsResolution || noType` (no pane lookup happens on
  those paths, matching N1).
- `skills/multi/scripts/note-send.mjs:600-601` — Case B: after typed-path pane resolution, if
  `canRefuseNoLocalRecipient` and `paneError` matches the true not-found shape (`/^no pane titled "/`,
  not the ambiguous "matches N panes" / "is bound to N live panes" shape), throw the same refusal
  instead of the old H3 exit-2 ledger-written fallback.
- `skills/multi/scripts/note-send.mjs:1085-1107` (`failureJson`) — surfaces `refused`/`hint` when
  `err.refused` is set.
- Exit-code comment block and `USAGE` string updated to list exit 6.
- `skills/multi/SKILL.md` — exit table gains a row for 6; a new paragraph "Exit 6 refuses instead of
  recording a note nobody local can read (since 2026-09-27)" explains the rule and `--local-ok`.
- `skills/multi/references/envelope.md` — new "N3 (2026-09-27)" paragraph under transport step 5,
  alongside N1/N2, stating the refusal, its four-way trigger, the JSON shape, and the
  `--local-ok`/`--recipient-repo` exemptions.

### Acceptance tests (note-send.test.mjs)
New, at lines 1106-1215:
- `Defect 1: typed path, no inbox, no mirror, no --recipient-repo, pane not found — exit 6, refusal JSON, NO ledger line`
- `Defect 1: the quiet (ledger-only) path is refused too, before any pane lookup is attempted`
- `Defect 1: --no-type is refused too, before any pane lookup is attempted`
- `Defect 1: --local-ok bypasses the refusal on the quiet path too, resuming the old N1 exit-0 ledger-only behaviour`
- `Defect 1: --to ben is exempt — still exit 0 notified, even with no inbox and no mirror target`
- `Defect 1: --recipient-repo is exempt (the collector's cross-repo path) — still exits 2 old-H3, not 6`
- `Defect 1: a --sender-host that resolves to a real mirror target is exempt — still exits 2 old-H3, not 6`
- `Defect 1: an ambiguous pane is never refused — a session DOES exist here, so it stays H3 exit 2`

Amended (pre-existing tests whose own fixture now also satisfies the new refusal's four conditions;
added `--local-ok` to preserve their original intent — H3 pane-not-found ledger fallback, N2
unknown-recipient banner logic, and a MINOR-7 ledger-only-warning test): the two H3 not-found tests
(one is the pinned "amend the H3 test" the spec names), four N2 tests, both calls in the MAJOR-2 test,
and the MINOR-7 test. All 8 call sites listed at note-send.test.mjs:1042, 1080, 1349, 1373, 1386, 1415,
1471+1476, 1515.

Acceptance clause "the typed path still exits 2 after the ledger write when an inbox IS registered":
a registered inbox for the SAME `--to` slug always skips pane resolution entirely (pre-existing C9
rule), so `paneError` can never be set in that exact combination — it is structurally untestable as a
literal reading. Interpreted instead as proving the refusal-exemption scoping is per-`--to`, not
"any inbox anywhere": the `--recipient-repo` exemption test above registers an inbox for
`someone-else-entirely` while sending to `nucleus`, confirming the refusal still doesn't fire only
because `--recipient-repo` was passed, not because some unrelated inbox exists. Flagged as my own
judgment call in the state file's Open Questions.

### Kill switch / caller grep
Grepped `note-send` across `scripts/`, `hooks/`, `skills/` (excluding tests, node_modules) for
argv-building callers. Exactly three:
- `scripts/collect-status.mjs:164` — always passes `--recipient-repo`. Exempt, never hits exit 6.
- `skills/decisions/scripts/decisions-pickup.mjs:543` — always passes `--recipient-repo`. Exempt,
  never hits exit 6.
- `skills/multi/scripts/note-flush.mjs:1622` (the overdue-asks nudge send, `runOverdueAsks`) — always
  passes `--recipient-repo` (resolved from the target's own registered inbox `cwd`, note-flush.mjs
  1604-1613); when no `cwd` resolves it skips sending entirely rather than omitting the flag, so this
  call site can also never hit exit 6.
No existing caller in the repo is newly affected by the exit-6 refusal.

## Defect 2 — note-flush overdue ASK answered by an on-time ACK

### What changed
- `skills/multi/scripts/note-flush.mjs:1398-1439` (`collectOverdueAsks`) — first pass now also
  collects every parsed envelope (not just RESULT/BLOCKED) into `parsed[]` and every ASK by id into
  `asks`. A second pass (1412-1427) walks ACK envelopes: an ACK answers its `re` target only when the
  target is an ASK whose `needs === 'ack'`, the ACK's `from` equals the ASK's `to` (rejects a
  sender self-ACK), and `envelopeInstant(ack) >= envelopeInstant(ask)` (rejects a stale ACK). Every
  other `Needs:` value is untouched — still RESULT/BLOCKED-only via the original first-pass logic.
- Doc comment above `collectOverdueAsks`, `note-flush.mjs:1388-1397`, updated to state the amended
  rule.
- `docs/specs/overdue-asks-1/spec.md:14` — dated amendment paragraph appended after Territory O1
  point 2's original sentence, citing this spec and the pinned rule verbatim.

### Acceptance tests (note-flush.test.mjs)
- `overdue-asks: answered by a RESULT re-ing the id is never nudged` (:1836, pre-existing, unchanged —
  confirms RESULT still answers).
- `overdue-asks: an ACK re-ing a Needs: review id does NOT answer it - still nudged` (:1848, the
  pinned test the spec names by its old title/line — kept, still asserts `Needs: review` is untouched).
- `overdue-asks: a Needs: ack ask IS answered by an on-time ACK from its \`to\` - never nudged` (:1867,
  new).
- `overdue-asks: a SENDER self-ACK does not answer a Needs: ack ask - still nudged` (:1880, new).
- `overdue-asks: a STALE ACK (before the ask's own instant) does not answer a Needs: ack ask - still nudged` (:1894, new).

## Out of scope for this territory
The spec's lane-level "Live proof in the record: one ASK with Needs: ack from skills-h to skills-fable
that reaches the Windows ledger…" is a cross-machine, live-ssh proof for the lane lead/record, not a
territory-scoped unit test; not attempted here. `transport.mjs` and `envelope.mjs` were read for
reference (pane-resolution message shapes, `NoteError`/`envelopeInstant`) but never edited — stayed in
territory.

## Gate numbers
- `node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/note-flush.test.mjs`:
  tests 307, pass 307, fail 0, cancelled 0, skipped 0, todo 0.
- `node scripts/run-tests.mjs` (full suite, log at
  `docs/specs/multi-cross-host-1/reports/M1-gate.log`): tests 2361, pass 2357, fail 0, cancelled 0,
  skipped 4, todo 0.

## Deviations / assumptions
- None beyond the documented interpretation of the "inbox IS registered" acceptance clause above.
- No denied commands encountered.
