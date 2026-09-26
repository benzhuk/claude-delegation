# M2 state — feed registered pickup's status line

## Territory
`skills/multi/scripts/note-flush.mjs` (`buildFlushStatus` + one small helper
`buildPickupStatus`), `skills/multi/scripts/note-flush.test.mjs`,
`skills/multi/SKILL.md` (:121-124 area).

## Contracts I rely on
- contracts.md R1 (this territory's actual spec, supersedes spec.md's M2).
- Three rulings NOT mine to change: (a) the `; pickup: ...` suffix appears on BOTH
  `buildFlushStatus` return branches; (b) disabled-switch check is named `ws-off` first,
  else `ws-off-decisions`, and is checked BEFORE the registration-existence check; (c) the
  registration check is existence-only (one `lstat`, never parsed).
- `runPostFlushPickup`/`switchActive`/`safePickupAnnotation`/`PICKUP_CODES` (existing,
  unmodified, reused as-is).

## Done
- `buildPickupStatus(home, fsImpl, now, heartbeatPickup)` added just above
  `buildFlushStatus` (note-flush.mjs ~line 311), documented in a JSDoc block describing the
  exact `{state, ...}` json shape (`'annotated'|'disabled'|'configured'|'unregistered'`).
- `buildFlushStatus` calls it on both branches (missing-heartbeat early return, and the
  normal fresh/stale return) and appends `pickupStatus.line` to the human line and
  `pickupStatus.json` as `json.pickup`.
- Two pre-existing `deepEqual` tests (missing/corrupt heartbeat) updated to include the new
  `pickup: {state:'unregistered'}` key.
- Three pre-existing exact-match/regex tests (fresh, stale, six-piggyback-passes) updated
  to expect the trailing `; pickup: not registered on this host` suffix (these broke on
  first gate run from the inherited partial work — fixed in this session).
- Three new tests added (F3/M2-tagged): absent registration, present annotation
  (code + age against a fixed `now`), disabled switch (registration also present, disabled
  still wins — confirms ordering).
- `skills/multi/SKILL.md` — two sentences added right after the `note-flush --status`
  fenced example, describing the three status states and what "not registered on this
  host" means.
- Recovered a dead prior session's uncommitted diff: its `note-flush.mjs` +
  `note-flush.test.mjs` changes were correct and kept as-is (checked against contracts.md/
  scout-M2.md line by line); its SKILL.md edit was never made — added fresh this session.
  Its gate had NOT been run — three pre-existing tests were still broken; fixed and
  verified.

## Next
Nothing outstanding for M2. Round 2 applied all three review-1 findings and committed
(8ada6f290b1b95150e48e4cd5b82aab7cd8daea7):
- MAJOR: `--status --json`'s `pickup.annotated` state now spreads the sanitized
  `{at, code, ordinal}` annotation instead of dropping `at`/`ordinal`.
- MINOR: SKILL.md now documents the fourth ("configured, awaiting first pickup pass")
  state.
- MINOR: two new tests cover the "configured" state and ws-off-named-first-when-both-exist
  precedence.

## Open questions
None blocking. Note for the record: the brief's "disabled short-circuits before
registration, matching runPostFlushPickup's own precedence" is followed exactly as
instructed; a close read of `runPostFlushPickup`'s actual code shows it early-returns
`null` when NOT configured before it ever branches on `disabled` (so in that one function,
an absent registration currently means "no-op" regardless of switch state) — flagging this
discrepancy per the brief's own instruction to report if the runtime shape differs from
what's described, without acting on it (the three rulings are explicitly not mine to
change).

## How to run my gate
```
node --test skills/multi/scripts/note-flush.test.mjs && node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs
```
Last run: 117/117 pass in note-flush.test.mjs (115 + 2 new from round 2), 1/1 pass (N2) in
hooks.test.mjs. Full log at `docs/specs/merge-on-acceptance-1/reports/M2-gate.log`.
