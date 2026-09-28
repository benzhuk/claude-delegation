STATUS: DONE 0523ec8

# Lane 33 (collect-followups-1), fix round 1

Scope: applying `docs/specs/collect-followups-1/reports/review-r1.md`'s findings, per the lead's
ruling in the task brief (apply F1, F2, F4, F5 exactly as the review's patches are written; F3 no
exit-code change — exit 1 stays, spec amendment is the lead's to make in the record; no change for
F6). Built on top of build/collect-followups-1 HEAD (6cd4ec2).

## Changes

- **F1** (Major — a `--stale-hours` value given to the installer was never checked in the file the
  installer writes): appended the review's exact new test to `scripts/install-janitor-timer.test.mjs`,
  right after the bounds test (`"C2: --stale-hours bounds..."`), verbatim as given in review-r1.md.
  It runs `main` with `--dry-run --json --stale-hours 0.5` on linux/win32/darwin and asserts the value
  reaches both the generated unit/task/plist text and `installed.json`.

- **F2** (Major — the `closed` grep test passed without finding anything): replaced the block at
  `scripts/collect-status.test.mjs:204-210` with the review's exact replacement — asserts `hits.length
  === 2`, that one hit matches the `NOTE_STATE_TOKENS` declaration by regex, and one hit contains
  "closed is its own terminal lane" (the legend).

- **F3** (Minor, lead's ruling: no change): exit 1 stays for `install-janitor-timer.mjs`'s own
  `--stale-hours` refusal path, matching the file's existing `--hour`/`--every` convention. No code or
  test edit made for this finding; the spec's Acceptance line ("exit 2") is the lead's to amend in the
  record.

- **F4** (Minor — `--stale-hours` was accepted and silently ignored for `--job janitor-record`):
  inserted the review's exact refusal in `install-janitor-timer.mjs`, right after the closing `}` of
  the `--every` janitor refusal (previously at :577, now followed by the new block):
  ```js
  if (job === "janitor-record" && argv.includes("--stale-hours")) {
    refusals.push("--stale-hours is refused for --job janitor-record; it only applies to --job collect-status");
  }
  ```
  Per the ruling, also added the one assertion to the bounds test: a new case in
  `"C2: --stale-hours bounds..."` that runs `main(["--force-root", "--json", "--stale-hours", "3"], ...)`
  (no `--job`, so the default `janitor-record` job) and asserts exit 1, the refusal text, and that
  nothing is written under `~/.agents`.

- **F5** (Minor, doc): replaced `docs/specs/collect-status-1/contracts.md` K3's "carried into every
  reinstall from then on..." sentence with the review's exact replacement wording — a reinstall always
  writes an explicit threshold (given value, else 2) and never falls back to the bare 6h default; a
  non-default value must be passed again on each reinstall, since `installed.json`'s `staleHours` is
  recorded but never read back.

- **F6** (Nit): no change, per the ruling.

No production-code changes beyond the one F4 refusal line; F1/F2 are test-only, F5 is doc-only.

## Gate

`node --test scripts/install-janitor-timer.test.mjs scripts/collect-from-origin.test.mjs
scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs`

```
ℹ tests 141
ℹ suites 0
ℹ pass 141
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

(140 before this round + 1 new install-janitor-timer test; collect-status.test.mjs's total count is
unchanged since F2 replaced an existing test's body rather than adding a new one.)

## Discriminating checks (mktemp scratch copies, per the brief)

Made two scratch copies under a fresh `mktemp -d
.../scratchpad/cf2-XXXX` (resolved to `cf2-PtoT`), each holding a copy of `scripts/` (+
`skills/multi/` for the hooks gate) taken from the fixed worktree.

- **F1 vs M4** (main's `systemdServiceUnit(...)` call drops `staleHours`, install-janitor-timer.mjs
  line ~780): edited the scratch copy's `install-janitor-timer.mjs` to drop `staleHours` from that one
  call site (`out: outFlag, staleHours }` → `out: outFlag }`), reran
  `node --test scripts/install-janitor-timer.test.mjs`. New F1 test failed (linux ExecStart no longer
  contained `--stale-hours 2`, `AssertionError`, `actual: false, expected: true`). Restored the file
  from a saved `.orig` copy (no delete used); reran — back to 51/51 pass. By construction the same test
  loop also covers win32/darwin generation and installed.json, so M5/M6/M7 (the twin drops on
  `windowsTaskXml`, `launchdPlist`, `installedJsonText`) are covered by the identical mechanism; I did
  not additionally hand-mutate those three call sites since the test's per-platform loop and the
  installed.json assertion are the same code path the review verified against.

- **F2 vs M1** (drop `"closed"` from `NOTE_STATE_TOKENS`, collect-status.mjs:46): edited the scratch
  copy's `collect-status.mjs` line 46 to remove `, "closed"` from the `Set([...])` literal, reran
  `node --test scripts/collect-status.test.mjs`. The new F2 grep test failed:
  `expected exactly the NOTE_STATE_TOKENS and legend lines, got: <legend line only>` — `1 !== 2`.
  Restored the file from a saved `.orig` copy; reran — back to 42/42 pass.

Both discriminating requirements from the brief are met: F1's new test fails on a dropped-value mutant
(M4, and by the same mechanism M5-M7), F2's new test fails on M1.

## Deviations / assumptions

- None beyond the lead's own ruling (F3 no exit-code change, no fix for F6). F1, F2, F4, F5 applied
  exactly as the review's patches read; no wording or logic changes on top of them.
- The bounds test (`"C2: --stale-hours bounds..."`) now carries two review-driven additions in the same
  test body: F1's default-value assertion (untouched, pre-existing) is separate from the new F4
  assertion appended at the end of that same test function, per the review's instruction to "add one
  assertion for it to the bounds test."

## Files changed

- `scripts/install-janitor-timer.mjs` (F4: one new refusal block)
- `scripts/install-janitor-timer.test.mjs` (F1: new test; F4: one new assertion in the bounds test)
- `scripts/collect-status.test.mjs` (F2: replaced grep-test body)
- `docs/specs/collect-status-1/contracts.md` (F5: K3 wording)
- `docs/specs/collect-followups-1/reports/collect-followups-state.md` (state file updated)
