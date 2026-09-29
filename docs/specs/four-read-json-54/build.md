DONE 02c2535a2985268ea8af40c80a6071bb5f7f7272

Lane 54, work `docs/work/wr-2026-09-29-four-read-json.record.md`. GOAL line served: "work
lost or stalled" (a census that silently reads no data is the worst case of that measure —
it hides the answer instead of counting it). Nearest NOT: "a rule no script checks" — F1
turns the miss into a script-enforced refusal, not a written-down convention.

## Cause

`scripts/four-read.mjs --census <path>` read the path through `loadJson` (`:47`), which is
`JSON.parse` wrapped in a silent try/fallback (`tryOr`) that returns `null` on ANY failure —
a missing file, an unreadable file, or (the real-world case) a file that parses as Markdown,
not JSON. `buildFourRead` (`:787`) took that `null` as "no census" and every downstream
number that needs it printed `unavailable (no census)` with no error, no exit code, no
signal that the wrong file had been handed in. The same `null` also blanked
`census.leadPath` (`:789`), which is why the gap/stall/wake/Stop-block cells went blank too,
not just the token cell. It happened for real on lanes 42, 43, 44, 46 and 47: each was
handed its `-census.md` markdown instead of a `build-census.mjs --json` file
(`docs/reports/census-0928/four-read.md`, "Finding 4b is wrong" paragraph and the correction
under the original finding 4b).

## Discriminating check: the new test's red result at 7ab59db

Built a detached worktree at base `7ab59db`, copied only the new test file and the new
`census-markdown-sample.md` fixture into it (the fix itself was NOT present), and ran a
standalone probe against base's own `main()`:

```
node probe.mjs   # imports base's scripts/four-read.mjs main(), unmodified
```

Result at base, handing `--census` the markdown fixture:
```
exit code: 0
write() lines: [ 'wrote: .../out.json', 'wrote: .../out.md' ]
outMd exists: true
outJson exists: true
outMd top-tier line: | Top-tier tokens per build | unavailable (no census) |
```

Silent exit 0, both output files written, no error anywhere — exactly the miss the spec
names. Running the full new test file itself against base additionally fails to even load,
because the new exports (`validateCensusArg`, `isBuildCensusJsonShape`,
`CENSUS_REFUSAL_MESSAGE`) do not exist there:
```
SyntaxError: The requested module './four-read.mjs' does not provide an export named 'CENSUS_REFUSAL_MESSAGE'
```
The worktree was removed after the check (`git worktree remove --force`, my own scratch
worktree, never the lead's).

## Fix location

`scripts/four-read.mjs`:
- New: `CENSUS_JSON_TOP_LEVEL_KEYS`, `isBuildCensusJsonShape`, `CENSUS_REFUSAL_MESSAGE`,
  `validateCensusArg` (all exported, all in the "── CLI ──" section, just before `main`).
- Changed: `main()` now calls `validateCensusArg(fsImpl, opts.census)` immediately after
  `parseArgs`, before `buildFourRead` runs and before any `fsImpl.writeFileSync`. On failure
  it writes the message to a new `writeErr` sink (default `process.stderr.write`, default
  preserved for the CLI entrypoint at the bottom of the file) and returns exit code `2`
  instead of `0`. `buildFourRead`'s own internal `loadJson` read of `opts.census` (`:787`,
  unchanged) is now dead code on the refusal path — it never runs, because `main` returns
  before calling `buildFourRead`.
- The shape check requires all 8 top-level keys build-census.mjs writes for BOTH lead hosts
  (`lead`, `subagents`, `combined`, `stallNudges`, `marker`, `leadPath`, `tasksPaths`,
  `defaultSubagentsDir` — `scripts/build-census.mjs:1359-1390` Codex report, `:1558-1609`
  Claude report; both return blocks carry the identical key set), plus `lead` being a
  non-array object, so a hand-built JSON stub with the wrong shape is refused the same way
  as the markdown.
- A missing/unreadable file is also refused (spec: "if it is silent, it also exits 2" — and
  at base it was silent, confirmed by the probe run above against a nonexistent path, same
  `tryOr`-swallowed-null path as the markdown case). Its message names the path directly
  (`four-read: --census file not found or unreadable: <path> (<err>)`) rather than reusing
  the markdown-specific wording, since it isn't the markdown case F1 quotes verbatim.

## Simplification

No new mechanism: one strict-read helper (`validateCensusArg`) placed at the one call site
that matters (`main`, before any write), reusing the exact JSON.parse `loadJson` already
does downstream — it duplicates one read (`buildFourRead` still calls `loadJson` on
`opts.census` internally after validation passes), traded deliberately for leaving
`buildFourRead`'s existing contract and all of its many direct-call tests (which pass
already-parsed census objects or already-valid JSON files, never CLI-level markdown)
untouched. No `--census` behavior for direct `buildFourRead` callers changed.

## F2: caller list

Searched every non-evidence/spec/report `.mjs` and `.md` file for `four-read.mjs` and for
`--census`:
- `docs/census.md:364` and `:499` — the only places that print a full
  `four-read.mjs --census <path>` command. Both already show `<census.json>` /
  `<id>.census.json`, build-census.mjs's own `--json` output. Left alone (spec: "a doc that
  already shows the JSON is left alone").
- `skills/team-build/SKILL.md:255`, `:258`, `:267`, `:405`, `:430-431` — every `--census`
  here is `work-record.mjs accept --census`, a DIFFERENT flag on a different script that
  deliberately reads the markdown (`scripts/work-record.mjs:1079-1097` `readCensusSource`,
  `1102-1112` `loadCensus`, which requires the markdown's own `VERDICT:` header and throws
  `census-missing`/`census-invalid` on anything else). None of these lines invoke
  `four-read.mjs` at all. Not a caller of the flag F1 fixes; left alone.
- `docs/work-record.md:133` — mentions `--four-read` in passing, shows no invocation of
  `four-read.mjs` and no `--census` path. Not a caller.
- No script (`scripts/*.mjs`, any `skills/**/*.mjs`) shells out to `four-read.mjs` as a
  subprocess — `grep -rln "four-read.mjs" scripts/*.mjs skills/**/*.mjs` returns only
  `four-read.mjs` itself, its two test files, `build-census.mjs` (imports two unrelated
  helper functions from it, `collectLedgerEntries`/`countStallNudges`, not a subprocess
  call), and `work-record.mjs` (comments/error strings about the shared `--four-read` JSON
  shape, not a call to `four-read.mjs`).

Result: zero corrections needed. Every real invocation of `four-read.mjs --census` in the
repo is a doc example, and both doc examples already pass the `--json` file. The actual
lanes-42-47 miss was an ad hoc command run by hand at accept time, not from any scripted or
documented caller — F1's new refusal is now the only thing standing between that mistake and
a silent "no census", for scripts and docs alike.

## F4: lane-to-record map and reruns

| Lane | Record |
|---|---|
| 42 | `wr-2026-09-28-stale-session-guard` |
| 43 | `wr-2026-09-28-cross-host-nudge` |
| 44 | `wr-2026-09-28-transport-identity` |
| 46 | `wr-2026-09-28-test-temp-hygiene` |
| 47 | `wr-2026-09-28-repo-env-everywhere` |

Lane 45: no `wr-2026-09-28-*` record exists for it. It names the janitor.mjs/
work-record.mjs git-runner work and the scratch-reaper backstop
(`docs/specs/repo-env-everywhere-1/spec.md:29`: "janitor.mjs beyond its git runner (lane 45,
skills-h)"; `docs/specs/test-temp-hygiene-1/packet.md:3`: "the janitor as backstop (lane 45,
specced, after lane 36)") — specced but not a closed lane in the census-0928 window, so it
is not one of the 5 rerun here.

All 5 records share `Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e`, present on this
host at `~/.claude/projects/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e.jsonl`
(verified: 16,081 lines, timestamps through 2026-09-29T02:25:50.710Z, spanning every one of
the 5 windows below).

Exact commands run per lane (`<scratch>` = a `mktemp -d` under this lane's scratchpad, `<REC>`
= the record id above), both exiting 0:

```
node scripts/build-census.mjs --lead ~/.claude/projects/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e.jsonl --from <Opened> --to <accepted Log time> --json <scratch>/laneNN.census.json --out <scratch>/laneNN.census.md
node scripts/four-read.mjs --record docs/work/<REC>.record.md --census <scratch>/laneNN.census.json --out <scratch>/laneNN.four-read.md --json <scratch>/laneNN.four-read.json
```

| Lane | `--from` | `--to` | Result |
|---|---|---|---|
| 42 | 2026-09-28T20:37:43.000Z | 2026-09-28T21:12:39.000Z | both commands exit 0; top-tier 8,917,860 (matches `wr-2026-09-28-stale-session-guard-census.md:9`); gap 15.3min at 20:39:39.994Z; 0 stalled, 0 waiting-on-agents, wakes 0, Stop-blocks 0 |
| 43 | 2026-09-28T19:56:00.000Z | 2026-09-28T20:34:53.000Z | both commands exit 0; top-tier 11,623,981 (matches `-cross-host-nudge-census.md:9`); gap 12.7min at 20:13:44.130Z; 0 stalled, 0 waiting-on-agents, wakes 1, Stop-blocks 0 |
| 44 | 2026-09-28T21:18:00.000Z | 2026-09-28T21:57:01.000Z | both commands exit 0; top-tier 18,248,547 (matches `-transport-identity-census.md:9`); gap 7.7min at 21:31:45.836Z; 0 stalled, 0 waiting-on-agents, wakes 0, Stop-blocks 0 |
| 46 | 2026-09-28T22:03:00.000Z | 2026-09-28T22:47:28.000Z | both commands exit 0; top-tier 14,735,966 (matches `-test-temp-hygiene-census.md:9`); gap 10.1min at 22:07:27.484Z; 0 stalled, 0 waiting-on-agents, wakes 1, Stop-blocks 0 |
| 47 | 2026-09-28T22:17:00.000Z | 2026-09-29T00:12:11.000Z | both commands exit 0; top-tier 35,706,699 (matches `-repo-env-everywhere-census.md:12`); gap 40.9min at 22:51:00.423Z; 0 stalled over 30min, 1 waiting-on-agents (40.9 min), wakes 1, Stop-blocks 0 |

No lead transcript was missing, no rerun failed, so the appendix has no `unread` line.
`--lead-slug`/`--ledger` were not passed (not asked for by F4), so each rerun's own ASKs and
stall-nudges cells still print `unavailable (no --lead-slug)` — unchanged, outside this
lane's territory. Appendix committed at
`docs/reports/census-0928/four-read.md`, new heading "## Appendix: lanes 42 to 47 rerun with
the census JSON (lane 54)" at the end of the file; nothing else in that report was touched.
All 10 rerun output files (5 `.census.json`/`.md` pairs, 5 `.four-read.json`/`.md` pairs) are
scratch, under this lane's `mktemp -d`, never committed (spec's territory is the appendix
only).

## Test counts

```
node --test scripts/four-read.test.mjs
tests 111, pass 111, fail 0

node --test scripts/four-read.completeness.test.mjs
tests 6, pass 6, fail 0

node --test scripts/four-read*.test.mjs   (gate command 1, both files together)
tests 117, pass 117, fail 0, cancelled 0, skipped 0, todo 0

node scripts/run-tests.mjs                (gate command 2, full suite)
exit 0
tests 2933, pass 2928, fail 0, cancelled 0, skipped 5, todo 0
leak check: 0 new temp entries
```

New tests added to `scripts/four-read.test.mjs` (10, all in the four-read suite's 111): shape
check (2), `validateCensusArg` unit tests for markdown/wrong-shape/missing-file/valid-JSON (4),
and `main()`-level integration tests for the markdown refusal (exit 2, no files written,
exact stderr message) and the JSON pass-through (exit 0) (2), plus the two shape tests
already counted above — 8 new standalone tests plus 2 new `main:` tests = 10 net new; every
pre-existing four-read test (101 in `four-read.test.mjs`, 6 in the completeness file) still
passes unchanged.

## Deviations / assumptions

- The exact refusal message for a missing/unreadable `--census` file is not the literal F1
  string (that string is specific to "not the census markdown"); it instead names the path
  and the underlying I/O error, per the same "loud, exit 2, never silent" rule. Judgment
  call, since the spec only quotes the exact message for the markdown case.
- `--lead-slug`/`--ledger` were intentionally omitted from the F4 reruns, since F4 only names
  `--lead`, `--from` and `--to` for the census regeneration and "that JSON" for the four-read
  rerun — adding a guessed slug would have been outside what F4 asked for.
- No `docs/census.md` line changed: it already used to document `--json`'s exit-2 behavior
  is unaffected. No new marker string is printed by this fix (F1 is a refusal, not a new
  census field), so no census.md edit was needed there either.

## Cleanup

No dev server, no background process, no lingering worktree (the base-commit probe worktree
was removed with `git worktree remove --force` on my own scratch checkout). Scratch outputs
(`f4rerun/`, `basecheck/`) sit under this lane's own scratchpad directory only.
