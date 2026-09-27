VERDICT: APPROVE b28254ebb93084fd42546caea9181ea071512c2c

# F1 review, round 2 (measure-truth-1), delta re-review

Reviewed: `/home/ben/Code/wt-measure-truth-1-F1`, HEAD `b28254ebb93084fd42546caea9181ea071512c2c`
(from my own `git rev-parse HEAD`). The range is `d92ae53..HEAD`, one commit, `fix(work-record): apply F1
round-1 review findings`. It touches `scripts/work-record.mjs`, `scripts/work-record.test.mjs` and
`docs/work-record.md`, all inside F1's R9 boundary. `git status --short` was clean before and after. The
reviewed tree was never written to. Mutation checks ran on a `git archive HEAD` copy in the scratchpad
(`.../scratchpad/f1r2`), and that copy was restored byte-identical (`cmp` against the saved original).

Tally: 0 BLOCKER, 0 MAJOR, 2 MINOR (non-blocking). All eight round-1 findings are fixed. This is a
feature review, so the C4 bug-fix fields do not apply.

## Gates, re-run by the reviewer

- Territory gate `node --test scripts/work-record.test.mjs`: **218 pass, 0 fail**.
- Integration gate `node scripts/run-tests.mjs`, the full sealed suite: **2056 tests, 2053 pass, 0 fail,
  3 skipped**. All three skips are platform skips unrelated to F1: a case-insensitive-fs test, a
  Windows-only worktree test, and `timeout terminates…`. Round 1 had this gate red with 2 failures; it is
  now green.

## Environment note (not a finding against F1; the orchestrator needs to know)

Partway through my mutation runs, `/tmp` ran out of **inodes**:
- `df -i /tmp` shows 1048576/1048576 used (100%), while `df -h` shows 25G free.
- Leaked test temp dirs from many suite runs fill it. The top prefixes are `note-send-*` 15986,
  `note-flush-*` 12168, `work-record-git-home-*` 11377, `decisions-handback-home-*` 4830, `inbox-*` 4690
  and `work-record-acceptance-*` 4511.
- From now on, every test that creates a temp dir fails with ENOSPC on this machine, in any lane.
- I deleted nothing. That includes my own 259M scratch copy, because the rules forbid `rm -rf`.
- Cleanup is a human or orchestrator decision.

Consequence for this review:
- The two gate runs above and the first mutation run finished before the exhaustion.
- After it, I mutation-checked only pure (no-temp-dir) tests, selected by `--test-name-pattern`.
- The git-backed and four-read tests I verified by reading them, as stated per item below.

## Prior findings: verification

| # | Round-1 finding | Fix at HEAD | Verified how |
|---|---|---|---|
| B1 | R4 never saw this accept's `--four-read` | `checkAcceptance` reads and validates `--four-read` before `checkMeasureTruthRules` and threads `opts.fourNumbers` (mjs:1082-1094). R4 prefers it and filters `not run` (mjs:713-721). TOCTOU guard in `acceptRecord` (mjs:1379-1400). `fourReadText` stripped from both the CLI and the `acceptRecord` output (mjs:1429, 1593). | **Mutation run** (before the exhaustion): dropping `fourNumbers: fourReadNumbers` from the call fails exactly 1 test, `acceptRecord: a hung Log: line refuses when THIS accept's --four-read reports zero…`. In-process probe: a stale `1 gap(s)` in the file plus this accept's `0` gives `REFUSED stall-word-unexplained`. So this accept's four-read wins over stale file lines. |
| B1 TOCTOU | re-read of `--four-read` | guard at mjs:1393 | By reading. The racing `fsImpl` rewrites `123456`→`999999`, which is in the `topTierTokensPerBuild` value, not in any `acceptAt`. Without the guard, the second read parses cleanly and accept succeeds, so `assert.fail` would be caught with code `ERR_ASSERTION` ≠ `four-read-invalid`, and the test fails. The guard is pinned. |
| B2 | sealed-runner identity failures | the three R1 repos now use `process.env.FIXTURE_ROOT \|\| os.tmpdir()` | Full sealed suite: 0 fail (above). |
| M1 | case-insensitive APPROVE/SKIPPED | both regexes case-sensitive (mjs:503-504) | Mutation: restoring `/i` on SKIPPED fails the `lowercase 'skipped'` test, and restoring it on APPROVE fails the `lowercase 'approve'` test (1 each). |
| M2 | unparseable Opened: exempted | `if (Number.isNaN(openedMs)) return true;` (mjs:601) | Mutation: removing it fails 2 tests (`isStrictRecord` and `checkMeasureTruthRules` M2 tests). |
| M3 | undated Log lines skip R3/R4 | R3 mjs:667; R4 NaN guard removed (mjs:699-708) | Mutation: each revert fails its own M3 test (1 each). Checked by reasoning: `NaN < x` and `NaN > x` are both false, so an undated line reaches `STALL_WORD_RE`. |
| m1 | compound prefix counted as a negation word | `raw.replace(/\S+$/, "")` before the window (mjs:545) | Mutation: reverting to `raw.trim()` fails the m1 test. |
| m2 | "one error line per field" doc claim | doc reworded to "naming the first failing field, in the order Base, Spec-session, Spec-from, and its fix". The new test substitutes a Z Spec-from into d0da77c and asserts a clean pass. | Read the diff: the doc change is confined to that one paragraph. The test proves "Spec-from alone". I offered this option in round 1 and accept it. |
| m3 | R1 tests don't separate the later instant from commit time | two new git-backed tests | By reading (they need temp repos). "Opened after, commit before → strict" kills `return firstAddMs`: first add is before the cutoff, so that mutant says non-strict and the test expects strict. "Add, rm, re-add → earliest counts" kills `Math.max(...stamps)`: the mutant picks the re-add after the cutoff and says strict, while the test expects non-strict. `return openedMs` alone is already killed by the round-1 "Opened one minute before, committed after" test. |

## New findings

### n1 (MINOR): the `not run` filter has no test, and the builder report says it does

**Evidence.**
- The builder report claims the test `acceptRecord: without --four-read, a hung Log: line skips R4 with a
  warning and never refuses (accept's own 'not run' marker is never counted as a present line)`
  (test:2228) proves B1(a).
- It does not. `makeAcceptanceFixture`'s record has no `Four numbers:` line at check time, and
  `acceptRecord` writes `Four numbers: not run` only *after* `checkAcceptance` passes.
- So `record.fourNumbers` is `[]` whatever the filter does, and deleting `!/^not run$/i.test(l.trim())`
  (mjs:714) leaves that test green.
- `grep -n "not run" scripts/work-record.test.mjs` finds only lines 2041, 2045, 2228 and 2239, and none
  of them puts `not run` in the text under check.
- The code itself is correct. In-process probe on HEAD: a record carrying only `Four numbers: not run`
  plus a `hung` Log line gives PASS with `stall-word-check-skipped`.

**Fix (ready to apply).** Add this test next to the other R4 `checkMeasureTruthRules` tests in
`scripts/work-record.test.mjs`. It creates no temp files.
```js
test("checkMeasureTruthRules: a record whose only Four numbers: line is accept's own 'not run' marker skips R4 with a warning, never refuses (round 2 review n1)", () => {
  const text = `# t\nWork: wr-x\nStatus: reviewed\nOpened: 2026-09-23T12:00:00Z\nBase: ${"a".repeat(40)}\nFour numbers: not run\nLog: 2026-09-24T00:00:00Z owned lead the builder hung on a prompt\n\nbody\n`;
  const result = checkMeasureTruthRules(text, parseRecord(text), { now: new Date("2026-09-25T00:00:00Z") });
  assert.ok(result.warnings.some((w) => /stall-word-check-skipped/.test(w)));
});
```
Predicted outcome:
- It passes at HEAD. I ran the same text through the delivered module and got PASS with the skip warning.
- With the filter removed, `fourNumbers` is `["not run"]`. `find` returns undefined, so `nonZero` is false
  and the call throws `stall-word-unexplained`. The test fails, so it pins the filter.

### n2 (MINOR): re-accept without `--four-read` still judges R4 against the file's stale `Four numbers:` lines (the residual of B1(b) that the builder flagged)

**Evidence.**
- `checkAcceptance` passes `fourNumbers: fourReadNumbers`, which is `undefined` when no `--four-read`
  was given (mjs:1094).
- `checkMeasureTruthRules` then falls back to `record.fourNumbers` (mjs:713).
- On a record re-flipped to `Status: reviewed` for re-accept, those lines come from the *previous* accept.
- In-process probes on HEAD (Opened 2026-09-23, `hung` Log line on 09-24, no `--four-read`):
  - stale `Four numbers: Work lost or stalled: 1 gap(s) old` → **PASS with no stall warning**. R4
    silently leans on an old number, while `acceptRecord` then appends `Four numbers: not run` for this
    accept.
  - stale `… 0 gap(s) old` → `REFUSED stall-word-unexplained`. That is a false refusal whose message says
    the count "is zero", but no count was measured for this accept.
- The same fallback lets a builder hand-write a `Four numbers: Work lost or stalled: 1` header line into a
  reviewed record and accept without `--four-read`, and R4 passes silently.
- This is minor: it needs a re-accept or a hand-written line, *and* no `--four-read`, and the record still
  visibly says `not run`. It is still the named class ("passes because it isn't looking"), though, since
  no skip warning is emitted.

**Patch (mechanical).** In `scripts/work-record.mjs:1094`, current:
```js
  const measureTruth = checkMeasureTruthRules(text, record, { ...opts, repoRoot, spawnImpl, fourNumbers: fourReadNumbers });
```
Replacement:
```js
  // The production path judges R4 only against THIS accept's --four-read; with none, the
  // record's own (stale, or hand-written) Four numbers: lines are never read - R4 skips and warns.
  const measureTruth = checkMeasureTruthRules(text, record, { ...opts, repoRoot, spawnImpl, fourNumbers: fourReadNumbers ?? [] });
```
Predicted outcome:
- Both probes above give PASS with `stall-word-check-skipped`, which matches R4's "no Four numbers line
  (no `--four-read`) → skip and warn".
- Direct `checkMeasureTruthRules` callers (the R5 fixtures, which pass no `fourNumbers`) keep the
  `record.fourNumbers` fallback and are unaffected.
- Add one `checkMeasureTruthRules` test with `{ fourNumbers: [] }` and a stale `1 gap(s)` line that
  asserts the skip warning.
- I could not run the suite against this patch, because `/tmp` inodes were exhausted (see the environment
  note). The builder must run `node --test scripts/work-record.test.mjs` after applying it. The only
  tests at risk are `checkAcceptance`/`acceptRecord` tests whose record text already carries a
  `Four numbers:` line next to a stall word. I found none by reading, but I have not confirmed that by
  a run.

## Regression hunt on the delta: held

- **The four-read is now read inside `checkAcceptance`.** `--four-read` was already a flag shared by both
  commands (`parseAcceptanceArgs` mjs:1566). `check-acceptance --four-read <bad>` now refuses
  `four-read-invalid`, which is stricter and fails closed. `fourReadLines` still validates the four keys.
- **Label contract with F2.** `four-read.mjs:335` still emits label `Work lost or stalled`. After the
  `Four numbers: ` prefix strip, R4's `/^Work lost or stalled:/` finds it.
- **A four-read value with no leading integer** (for example `unavailable …`) makes `nonZero` false. With
  a stall word and no `Stall:`/`Gap:` paragraph, the record is refused. That fails closed and never
  renders an unknown as zero.
- **The m1 change cannot add false positives.** It only removes the in-word prefix before taking the two
  preceding whitespace words. `no Opus reviewer was used`, `reviewed by claude-opus-5-5` and
  `Opus reviewer, not the builder` all keep their round-1 results (pinned in the m1 test).
  - Informational: `no:Opus`, with no space, is no longer read as negated. The contract says "words", and
    this form is not realistic.
- **The M3 change** means an undated `reviewed … Opus … APPROVE` line can also satisfy the high/top
  requirement. That is consistent with "judged, never skipped", and not a finding.
- **Doc scope.** The `docs/work-record.md` delta is one paragraph in the acceptance section and nothing
  else.
- **Stall regex, Spec-from strict regex, `strict-exempt` wording, no CLI `--strict-from`.** None of these
  changed in this delta. The round-1 verification stands.
