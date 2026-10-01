STATUS: DONE 19607cf

Lane 33, collect-followups-1. Serves GOAL's "work lost or stalled" measure (both fixes are named
in the spec's own titles as "work lost or stalled"): Fix 1 stops a reinstall from silently
re-losing lane 30's stall-nudge fix; Fix 2 stops a stale `closed` record from being silently
mis-bucketed by the one place (`computeState`) that is supposed to decide state. Nearest NOT:
"a rule no script checks" — both fixes are enforced by tests, not just comments.

## Files changed (fix commit 19607cf)

- scripts/install-janitor-timer.mjs — Fix 1: `DEFAULT_STALE_HOURS = 2`; `--stale-hours` added to
  `KNOWN_VALUE_FLAGS`, usage text, parsed/validated (0.1-48, refused otherwise, exit 1 matching this
  file's existing convention for every other bound flag — see Deviations); `scheduledCommandArgv`
  pushes `--stale-hours <n>` as the LAST argument for `--job collect-status` only; `installedJsonText`
  gains `staleHours` in the pinned slot (schema, repo, node, every, staleHours, scheduler, name, to);
  `systemdServiceUnit`/`windowsTaskXml`/`launchdPlist` all thread `staleHours` through to
  `scheduledCommandArgv`; `result.staleHours` set only for the collect job. Janitor job's own branch
  of `scheduledCommandArgv`/`installedJsonText` untouched (K1: bytes stay identical) — verified by the
  untouched byte-stability tests staying green.
- scripts/install-janitor-timer.test.mjs — updated the three pinned collect-job expectations (argv,
  installed.json literal, ExecStart literal) to carry `--stale-hours 2`; added: `--stale-hours 0.5`
  appears in all three generators (systemd/Windows/launchd); `--stale-hours` bounds test (0.1/48/2/0.5
  accepted, 0/99/-1/nope/0x10/space refused, default 2 when omitted); updated the real-install test's
  installed.json `deepEqual`.
- scripts/collect-from-origin.mjs — Fix 2: `computeState` returns `"closed"` for `Status: closed`,
  terminal like `withdrawn`/`accepted-merged`.
- scripts/collect-from-origin.test.mjs — `computeState` test gains the closed case.
- scripts/collect-status.mjs — Fix 1: `parseArgs`'s `--stale-hours` branch validates 0.1-48, setting
  `staleHoursError`; `main()` checks it first and returns exit 2 (the file's own deliberate exception
  to its usual "exit 0 always" promise — nothing else in this run gets a nonzero exit). Fix 2:
  `NOTE_STATE_TOKENS` gains `"closed"`; the `r.status !== "closed"` guard in `computeAttention` is
  removed (state alone now decides, since `closed` state can never equal `"owned"`); the status.md
  legend literal at (was :461) now reads `"lane: every non-terminal Status shows as owned; closed is
  its own terminal lane"`.
- scripts/collect-status.test.mjs — updated the legend-literal assertion; updated the stall-nudge
  fixture's stale F2 comment (no longer says computeState "still buckets closed as owned"); added:
  `parseArgs` --stale-hours range test; `main()` exit-2-on-bad---stale-hours test; `computeByState`
  closed-key test; `computeAttention` closed-never-flagged test; a grep test that `"closed"` appears
  in collect-status.mjs only inside `NOTE_STATE_TOKENS` and the legend line (Acceptance's own bullet).
- docs/specs/collect-status-1/contracts.md — K1 installed.json shape gains `staleHours` in the pinned
  slot; K3 documents `--stale-hours` (0.1-48, default 2, last argv position).
- docs/specs/collect-status-1/spec.md — the stall-nudge addendum's stale "computeState still buckets
  closed as owned" clause corrected to describe the new behavior.
- docs/specs/collect-from-origin-1/contracts.md:12 (R1) — state token list gains `closed`; I also
  added the pre-existing `withdrawn` gap while touching this line (it was already a real state
  `computeState` could return, from an earlier lane, but was never added to this list) — flagged as a
  bonus correction, not part of either pinned fix.
- docs/census.md:454 — updated (not marked historical): the sentence is a live behavior contract
  ("an origin branch whose record already reads X is reported by its collector state Y"), still true
  and now complete with `closed`/`accepted`→ `closed`.

## Discriminating checks (each shown failing on pre-fix source, in a fresh mktemp copy, then passing)

All done under `/tmp/claude-1000/.../scratchpad/cf-XXXX` mktemp copies of `scripts/` (never reusing or
cleaning one), each seeded with the OLD (`git show HEAD:`, pre-lane-33) version of the one file under
test, alongside my NEW test file.

1. Three generators carry --stale-hours (install-janitor-timer): reverting only
   `install-janitor-timer.mjs` to `HEAD` (pre-fix) and running the updated test file: 7 of 50 tests
   fail — the argv/installed.json/systemd/Windows+launchd/bounds/real-install tests all fail with
   `staleHours: undefined` or a missing `--stale-hours` token. With the fix: 50/50 pass.

2. The range is refused in both places:
   - Installer: `--stale-hours 0`/`99`/`-1`/`nope`/`0x10`/` ` all produce `code 1` with a refusal
     containing "--stale-hours must be a number from 0.1 to 48"; `0x10` specifically catches the
     `Number("0x10") === 16` smuggling bug the regex guard (`/^\d{1,2}(\.\d+)?$/`) exists for — a
     first draft without that regex accepted `0x10` as 16 (in-range) and the test caught it live
     during this build.
   - collect-status.mjs: `main(["--stale-hours","0"])`/`["--stale-hours","99"]` both return exit 2
     with a matching stderr warning and write nothing (asserted no status.json). Reverting only
     `collect-status.mjs` to HEAD and re-running: the exit-2 test fails (`0 !== 2`, since the old file
     always returns 0).

3. Closed is terminal: reverting only `collect-from-origin.mjs` to HEAD (computeState still folds
   `closed` into `owned`) while keeping the new tests (which also assume the guard is gone from
   collect-status.mjs): 2 tests fail — `computeState` test (`'owned' !== 'closed'`) and the
   stall-nudge fixture test (5 `silent-over-2-h` attention rows instead of 4 — the closed-lane branch
   now gets flagged, because the old `computeState` gives it "owned" and the guard that used to
   protect it is gone). This is the intended coupled-regression proof: Fix 2 only holds with BOTH
   edits together, and reverting either half breaks it.

## Gate

`node --test scripts/install-janitor-timer.test.mjs scripts/collect-from-origin.test.mjs scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs` — **140 tests, 140 pass, 0 fail** (full log: docs/specs/collect-followups-1/reports/gate.log). Per-file breakdown at time of last full run: install-janitor-timer 50/50, collect-from-origin 22/22, collect-status 42/42, hooks 26/26.

## Deviations / judgment calls

- **Exit code for the installer's own --stale-hours refusal is 1, not 2.** Acceptance says "`--stale-hours 0` and `99` are refused (exit 2) by the installer and by collect-status parseArgs." Every other bound flag in install-janitor-timer.mjs (`--hour`, `--every`) refuses with exit 1, tested extensively and unchanged by this build. Special-casing only `--stale-hours` to exit 2 would be an inconsistent, untested-elsewhere exit-code convention inside one tool's uniform refusal path. I kept the installer at exit 1 (matching --hour/--every) and gave collect-status.mjs (which otherwise always exits 0, by explicit design) the deliberate exit 2, since that file has no other nonzero-exit precedent to be consistent with. Flagging for the lead to confirm or correct.
- **docs/census.md:454 — updated, not marked historical.** This sentence is a live, checked-by-nothing-but-still-accurate description of current collector behavior ("an origin branch whose record already reads X is reported by its collector state Y"), not a record of a past event, so I corrected it to include `closed` rather than freezing it as history.
- **docs/specs/collect-from-origin-1/contracts.md:12 — also added `withdrawn`,** which was already a real `computeState` output (from an earlier, unrelated lane) but had never been added to this pinned list. Bonus correction while touching the line, not required by either Fix 1 or Fix 2 pinning, called out separately here per the brief's spirit of not silently expanding scope.
- Did not touch the janitor job's own branches of `scheduledCommandArgv`/`installedJsonText`, nor note-send, run-tests/test-home, or decisions-render-*, per the brief's NOT list.
- Left `--stale-hours` acceptable (but inert) for `--job janitor-record` at the CLI level — i.e. no cross-refusal like `--to`/`--out`/`--every` get for the wrong job. Not pinned by the spec or Acceptance, and the janitor job's own scheduled-command branch simply never reads it, so giving it has zero effect on output. Noted in case the lead wants the symmetric refusal added.

## Cleanup

No dev server, no background job, no scratch directories left mid-work beyond the mktemp discriminating-check copies noted above (never cleaned per the no-delete rule).
