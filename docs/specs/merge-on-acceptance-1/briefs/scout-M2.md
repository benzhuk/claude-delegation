# Scout — M2 (feed registered pickup's status line)

Read at 24e02eab356217a4c63725014d4fdd028cfb5891 (wt-moa checkout).

## 1. Files and symbols

- `skills/multi/scripts/note-flush.mjs`: `buildFlushStatus(argv, deps)` is a real,
  existing exported function at line 299 (not 325 as an earlier skim suggested — confirm
  by grep, not assumption). It builds `{ exitCode, line, json }` from `readHeartbeat`,
  branching on missing/unreadable/fresh/stale. The function ends with `return { exitCode:
  stale ? 1 : 0, line: ..., json: { ...heartbeat, age_s: ageS, timer_age_s: timerAgeS,
  stale } }`. Contracts.md's "append `; pickup: ...` to the human line, add a `pickup`
  field to the json" must happen inside/around this return, for both the missing-heartbeat
  early return AND the normal return (a missing heartbeat can still have a registration to
  report on — decide explicitly whether the pickup suffix appears in that branch too; the
  spec/contract don't say, so this is an open question below).
- `heartbeat.pickup` shape, when present, is `{ at: <ISO8601>, code: <one of
  PICKUP_CODES>, ordinal: <int 0-15 or null> }`, written by `annotatePickup` (:1131) via
  `safePickupAnnotation` (:226). `age` for the `; pickup: <code> <age>` line is not
  precomputed anywhere — it must be derived the same way `ageS` is derived from
  `heartbeat.at` (`Date.parse` then `Math.round((now - atMs)/1000)`), applied to
  `heartbeat.pickup.at` instead.
- Registration existence check: `runPostFlushPickup` (:1148) does exactly "one lstat" of
  `path.join(base, 'ws', 'decisions-pickup', 'registrations.json')` where `base =
  path.resolve(home, '.agents')` — confirmed at :1156-1161. `buildFlushStatus`'s `home` is
  already resolved via `toPosix(args.home ?? deps.home ?? os.homedir())`; the same
  `<agentsHome>` join pattern must be reused, not reinvented, and the lstat must be
  wrapped exactly like `runPostFlushPickup` does (ENOENT/ENOTDIR = not configured,
  anything else = configured/error) rather than a bare try/catch that swallows real
  errors as "absent".
- Kill-switch check: `switchActive(file, fsImpl)` (:1116) is the existing helper —
  `switchActive(path.join(base, 'ws-off'), fsImpl) || switchActive(path.join(base,
  'ws-off-decisions'), fsImpl)` is the exact disabled-check `runPostFlushPickup` uses
  (:1159-1160). Contracts.md's "disabled (<switch>)" text should presumably name whichever
  one is active — `runPostFlushPickup`'s own boolean doesn't distinguish which switch
  fired; the brief should decide whether `buildFlushStatus` needs to (open question
  below).
- `skills/multi/scripts/note-flush.test.mjs`: imports from `./note-flush.mjs` already
  include `buildFlushStatus` (confirmed :24). It does NOT currently import `childEnv` from
  `./test-child-env.mjs` (confirmed: no match). Existing `buildFlushStatus` tests
  (F3-tagged, around :1409-1483) use plain `fs`/`os`/`path` with a `tmp()` helper
  (`fs.mkdtempSync`), no process spawning — because `buildFlushStatus` itself never
  spawns a child. The three new tests (absent registration, present annotation, disabled
  switch) can follow this exact same pattern (fixture `home` dir, write files directly
  with `fs`, call `buildFlushStatus([], { home, now })`) with NO spawn and therefore no
  `childEnv()` need — contracts.md's "every spawn uses childEnv()" is a general suite rule
  (enforced by N2, see below), not a requirement that these particular tests spawn
  anything.
- `skills/multi/SKILL.md` :121-124 is the exact spot describing `note-flush --status`
  (confirmed: "`note-flush --status` is the first check…" through the fenced example
  block). The one-two sentence addition belongs right after or inside this block.

## 2. Helpers to reuse

- `test-child-env.mjs`'s `childEnv(home, over)` (skills/multi/scripts/test-child-env.mjs)
  — only needed if a new test spawns a child process. The three planned tests don't need
  to, per above. If a builder decides to test via the CLI (`node note-flush.mjs --status
  --json`) instead of calling `buildFlushStatus` directly, THAT would spawn and would need
  `childEnv()` — calling the exported function directly avoids the whole question and
  matches every existing `buildFlushStatus` test's own style.
- `registered-pickup.contract.test.mjs` (skills/decisions/scripts/) shows the exact
  registration-file fixture shape (version 1, `entries` array with `{repo, page, from,
  owner, reader}`) if a test wants a realistic-looking (even if not parsed by
  `buildFlushStatus`, which only lstats it) registrations.json.

## 3. Tests that police this area

- `skills/multi/scripts/hooks.test.mjs`: `test('N2: no test file in this suite inherits
  the runner environment on its own', ...)` (confirmed :429) scans EVERY `.test.mjs` file
  in the repo for the literal built substring `...` + `process` + `.` + `env` and fails if
  found outside `test-child-env.mjs` itself. Any new test code that spreads
  `process.env` directly (even `{ ...process.env, FOO: 'bar' }`) fails this gate
  repo-wide, not just locally — a real risk if a new test spawns a child without going
  through `childEnv()`.
- `skills/multi/scripts/note-flush.test.mjs`'s own existing `buildFlushStatus` tests
  (F3-tagged) pin the exact missing/unreadable/fresh/stale json shapes
  (`{missing,unreadable,age_s,timer_age_s,stale}` and `{...heartbeat,age_s,timer_age_s,stale}`).
  Adding a `pickup` key to the json return must not perturb these — `assert.deepEqual`
  calls at :1414 and :1425 compare the FULL json object, so any new key added
  unconditionally (even `pickup: undefined` serialized oddly, or `pickup: null`) breaks
  those two exact `deepEqual`s unless the new key is added only when applicable, or those
  two tests are updated to include the new key explicitly. Flag this to the builder as a
  concrete regression risk, not a hypothetical.
- `skills/decisions/scripts/registered-pickup.contract.test.mjs` and
  `decisions-pickup.test.mjs` (:257, :302, :460, :940-960 per contracts.md) are the tests
  that already prove the false→true-once, true→true-nothing, and missing-token behaviors
  the spec's M2 wanted — none of these are touched by M2's reduced scope; M2 gate
  (contracts.md R8) does not include them, only `note-flush.test.mjs` and the `N2`-tagged
  test in `hooks.test.mjs`.

## 4. Open questions for the spec

- Does the `; pickup: ...` suffix appear on BOTH branches of `buildFlushStatus` (the
  early missing-heartbeat return AND the normal return), or only the normal one? The
  contract's phrasing ("the `note-flush --status` human line gains `; pickup: ...`")
  reads as unconditional, but the missing-heartbeat branch already has its own two
  possible lines; the brief should rule this rather than leave it to the builder.
- When BOTH `ws-off` and `ws-off-decisions` exist, does the status line need to name
  which one, or is "disabled (<switch>)" satisfied by naming either? `runPostFlushPickup`
  doesn't distinguish; contracts.md's own text uses a single placeholder `<switch>`, so a
  single canonical name (e.g. always report `ws-off-decisions` if either is present, or
  report whichever is found first) needs to be picked and stated, since "your choice,
  documented in the test" (contracts.md R1 item 1) only covers the object/string shape of
  the JSON field, not this wording choice.
- "Not registered on this host" is defined as "one lstat of
  `<agentsHome>/ws/decisions-pickup/registrations.json`" coming back ENOENT/ENOTDIR. What
  happens when the file exists but is otherwise invalid (bad JSON, wrong version, symlink)
  — does the status line say "not registered" (existence-only check, matching the
  contract's literal wording) or something else? The contract's wording ("one lstat…
  else") suggests existence-only, ignoring content validity, which is simpler and cheaper
  — worth confirming explicitly in the brief so the builder doesn't accidentally re-parse
  the registration file (which would require importing decisions-pickup.mjs internals,
  outside M2's file territory).
