VERDICT: NEEDS_FIXES (3) 202ad6079f5a97752055ec14e94d4e69d8760703

NEEDS_FIXES

# M2 review, round 1: feed registered pickup's status line

Worktree `/home/ben/Code/wt-merge-on-acceptance-1-M2`, HEAD `202ad6079f5a97752055ec14e94d4e69d8760703`
(from `git rev-parse HEAD`), one commit on base `24e02eab`. Working tree clean before and after this review.
Diff: 3 files: `skills/multi/SKILL.md` +6, `note-flush.mjs` +56/-4, `note-flush.test.mjs` +54/-6.

Counts: blocker 0, major 1, minor 2.

## Findings

### 1. MAJOR: `--status --json` now overwrites the raw heartbeat's `pickup` annotation and drops `at` and `ordinal`

- `skills/multi/scripts/note-flush.mjs:376`: `json: { ...heartbeat, age_s, timer_age_s, stale, pickup: pickupStatus.json }`.
  The spread copies the heartbeat's own `pickup: {at, code, ordinal}`, and then the new key replaces it with
  `:318`'s `{ state: 'annotated', code, age_s }`.
- Before this build, `--status --json` printed the annotation unchanged (test name at `note-flush.test.mjs:1479`:
  "--status --json includes the raw heartbeat"). The pickup-integration contract says so in its own words
  (`docs/specs/2026-09-24-pickup-integration.md:24`: "--status --json exposes annotation"). So does
  `skills/decisions/SKILL.md:126` ("flush-last.json may contain a safe `pickup` code and selected ordinal").
  After this change, `ordinal` is gone from `--status --json`. `ordinal` is the only place that shows which
  registration entry a pass selected. The absolute `at` is gone too. R1 asks for `--status --json` to *gain*
  the pickup state. It does not allow removing a field it already exposed. `pickup.code` survives, so
  redteam.md:44's by-hand check still works. Nothing else in the repo reads `pickup.ordinal` from status
  (grep), which is why this is major and not blocker.
- Fix (mechanical): keep the sanitized annotation fields and add the new ones.
  - `note-flush.mjs:318`, current:
    ```js
        return { line: `; pickup: ${pickup.code} ${ageS}s`, json: { state: 'annotated', code: pickup.code, age_s: ageS } };
    ```
    replacement:
    ```js
        return { line: `; pickup: ${pickup.code} ${ageS}s`, json: { state: 'annotated', ...pickup, age_s: ageS } };
    ```
    (`pickup` here is `safePickupAnnotation`'s output, exactly `{ at, code, ordinal }`. It is already sanitized, so this adds nothing unsafe.)
  - `note-flush.mjs:299`, current `` -> `{ state: 'annotated', code, age_s }`, `age_s` `` → replacement
    `` -> `{ state: 'annotated', at, code, ordinal, age_s }`, `age_s` ``.
  - `note-flush.test.mjs:1522`, current:
    ```js
      assert.deepEqual(status.json.pickup, { state: 'annotated', code: 'PICKUP_RECORDED', age_s: 17 });
    ```
    replacement:
    ```js
      assert.deepEqual(status.json.pickup, {
        state: 'annotated', at: new Date(NOW).toISOString(), code: 'PICKUP_RECORDED', ordinal: 3, age_s: 17,
      });
    ```
  - Predicted outcome: the `--status --json` pickup value becomes a superset of the old raw annotation. The
    line output does not change, and the other 114 tests are unaffected: only the one test reads
    `json.pickup` in the annotated state. The file should go 115/115 again.
- Cause: the new `pickup` key reuses the name of an existing heartbeat field, and the json object is built
  with `...heartbeat` before the new key, so the new value silently wins.
- Discriminating check: build a fixture heartbeat with `pickup: {at, code:'PICKUP_RECORDED', ordinal:3}` and
  compare `buildFlushStatus(['--json'])`'s `json.pickup.ordinal` before this build (3) and at HEAD (undefined).
- Fix location: `skills/multi/scripts/note-flush.mjs:318` (plus the doc comment at `:299` and the test at `:1522`).
- Simplification: spread the already-sanitized `pickup` into the annotated json. No new field names or
  helpers are needed.

### 2. MINOR: SKILL.md leaves out the fourth state the code can print

- `note-flush.mjs:333` can end the line with `; pickup: configured, awaiting first pickup pass`. This happens
  when the file is registered, no switch is on, and no annotation exists yet. It is a sensible way to fill a
  case R1 left unstated. But `skills/multi/SKILL.md:129-133` lists only three endings, so a reader who sees
  the fourth has nothing to match it against.
- Patch, `skills/multi/SKILL.md:132-133`, current:
  ```
  this machine, which is the normal state on most hosts), `; pickup: <code> <age>` once a pass has
  annotated one, or `; pickup: disabled (<switch>)` when `ws-off`/`ws-off-decisions` is present.
  ```
  replacement:
  ```
  this machine, which is the normal state on most hosts), `; pickup: configured, awaiting first pickup
  pass` when the file exists but no pass has annotated a result yet, `; pickup: <code> <age>` once a pass
  has annotated one, or `; pickup: disabled (<switch>)` when `ws-off`/`ws-off-decisions` is present.
  ```

### 3. MINOR: two branches are implemented but have no test

- There is no test for the `configured` state (`note-flush.mjs:333`). There is also no test for the
  "`ws-off` is named first when both switches exist" ruling (`:321-323`). Mutating either one leaves all 115
  tests green: swapping the two ternary arms, or changing the configured string.
- Add the following after `note-flush.test.mjs:1533`. No spawn is needed, so N2 is unaffected:
  ```js
  test('F3/M2: --status reports "configured" when registered, enabled, and not yet annotated', () => {
    const home = tmp();
    enableRegisteredPickup(home);
    const status = buildFlushStatus([], { home });
    assert.match(status.line, /; pickup: configured, awaiting first pickup pass$/);
    assert.deepEqual(status.json.pickup, { state: 'configured' });
  });

  test('F3/M2: --status names ws-off, not ws-off-decisions, when both switches exist', () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
    fs.writeFileSync(path.join(home, '.agents', 'ws-off'), '', 'utf8');
    fs.writeFileSync(path.join(home, '.agents', 'ws-off-decisions'), '', 'utf8');
    const status = buildFlushStatus([], { home });
    assert.deepEqual(status.json.pickup, { state: 'disabled', switch: 'ws-off' });
  });
  ```
  Predicted outcome: both pass at HEAD, and each fails under its matching mutation.

## Attack angles with no defect found (verified)

1. **No new mechanism.** The diff touches 3 files, and nothing under `hooks/` or `skills/decisions/`
   (`git diff --stat -- skills/decisions hooks` is empty). The added code has no `fetch`, http, spawn, timer,
   `appendFile`, or log call (grep of `+` lines). The only added `writeFileSync` calls are 2 test fixtures.
   There is no new state file and no new switch name: only `ws-off` and `ws-off-decisions`, through the
   existing `switchActive` (`:1162`). The registration check is exactly one `lstatSync` (`:327`), existence
   only, never parsed, with ENOENT/ENOTDIR meaning absent, the same as `runPostFlushPickup:1207-1209`. The
   new code is one helper next to `buildFlushStatus`, within the limit.
2. **Post twice / block a drain / run without a token.** None of these can happen here.
   `buildPickupStatus` only reads: `statSync`/`lstatSync` plus the heartbeat that is already parsed. It sends
   nothing, imports nothing, and runs only on `--status`, which `runPostFlushPickup` already refuses
   (`:1195`). I ran the tests myself: `node --test skills/decisions/scripts/decisions-pickup.test.mjs
   skills/decisions/scripts/registered-pickup.contract.test.mjs` gives 50/50 pass. Neither file is in the diff.
3. **The two `deepEqual` tests.** Both were extended, not weakened (`note-flush.test.mjs:1414-1417`,
   `:1430-1434`): the full object shape is kept, and `pickup: { state: 'unregistered' }` was added. Three more
   old exact-line pins (`:1444`, `:1454`, `:1474`) were extended with the exact suffix. None was loosened.
4. **The three new tests.** Absent registration (`:1505`) sets up nothing. Annotation (`:1511`) writes only
   a heartbeat with `pickup`, and no registration or switch. Disabled (`:1524`) writes a registration AND
   `ws-off-decisions`, and asserts that disabled wins. That is exactly the precedence it names, so the combined
   fixture is deliberate and asserted. Mutation check on a scratch copy (via `git archive`, outside the tree,
   restored afterwards and diffed as identical): turning off the disabled branch fails only that test.
   Disabled is checked before registration (`:321-324` before `:326-331`), as the brief ruled. The builder
   correctly points out that `runPostFlushPickup` returns null when unregistered, before it acts on `disabled`
   (`:1210`). So "matching runPostFlushPickup's precedence" is true only of the order the two values are
   computed in, not of the outcome. This is a brief ruling the builder was told not to change, and it is not
   counted as a finding. The comment at `:304-306` already says "computes".
5. **N2.** `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs` gives 1/1 pass. The new
   tests do not spawn a process and do not spread the process env.
6. **SKILL.md accuracy.** `:129-133` correctly defines "not registered on this host" as no `registrations.json`
   under `~/.agents/ws/decisions-pickup/`: never opted into, the normal state on most hosts. It does not
   suggest anything is broken. The only gap is finding 2.
7. **Both return branches** carry the suffix (`:359`, `:375`) and the json key (`:360`, `:376`). The missing
   branch passes `null` for the annotation, which is correct: a corrupt file has none that can be parsed.
8. **Gate.** I re-ran `node --test skills/multi/scripts/note-flush.test.mjs` myself: 115/115 pass. That matches
   `reports/M2-gate.log`.

Observation, not a finding: the annotation is checked first, as the brief orders. So if registration is
later removed, the preserved annotation keeps being reported, with a growing age, instead of "not
registered". That follows the brief as written, and the growing age shows the annotation is out of date.
