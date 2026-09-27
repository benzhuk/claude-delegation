VERDICT: NEEDS_FIXES (2) 73d4be8ddb24b2fe2aff89ff5d2eca4a51c3c64b

# C2 review, round 2 (collect-status-1)

Reviewed: `/home/ben/Code/wt-collect-status-1-C2`, branch `build/collect-status-1-C2`, HEAD
`73d4be8ddb24b2fe2aff89ff5d2eca4a51c3c64b` (from `git rev-parse HEAD`), range
`b249ce0..73d4be8` (one commit: scripts/install-janitor-timer.mjs +48/-12,
scripts/install-janitor-timer.test.mjs +97/-5, plus report, state and gate-log docs). Written
2026-09-27 14:55 America/New_York. I did not modify the reviewed tree (`git status --short` is
empty). All probes and mutations ran on `git archive` copies under
`.../scratchpad/c2r2rev/`.

Summary: all four round-1 findings are fixed, and each fix is pinned by a test that fails when
the fix is reverted (m3 is the exception; see below). The default job still does not drift. While
hunting twins of M1 on the two platforms round 1 did not probe, I found **2 new majors**. Both
were already present at b249ce0, so they are misses from round 1, not regressions from this
round:
- **N1:** on Windows, the M1 clobber still works through the shared task name.
- **N2:** on macOS, `--remove --job collect-status` without `--to` crashes.

## Gate, re-run by me

`node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs` in the worktree: tests 46,
pass 46, fail 0.

## Prior findings, each verified

| id | status | evidence |
|---|---|---|
| M1 | fixed (linux, darwin); **Windows twin open, see N1** | `COLLECT_MARKER` at :78 is not a substring of `MARKER` and `MARKER` is not a substring of it. `markerLine(style, job)` is at :85-92. `job` is threaded through all 4 generators and all 4 artifact `marker:` fields (:188, :206, :278, :332, :714-715, :725, :733). The janitor timer branch still calls `markerLine("hash")`, which is byte-identical. Mutation `COLLECT_MARKER = MARKER`: gate 44/46; the new M1 test and the exact-bytes test fail. |
| m2 | fixed | :592-597. Mutation dropping `path.resolve`: 45/46 (the m2 test fails). Mutation disabling the control-character check: 45/46. `--out ""` is still refused as "--out needs a value" (probe). |
| m3 | fixed | `result.job` is now set only for the collect job (:693-694). The refusal wording is job-scoped (:649-652). Drift harness: see below. **No test pins it:** mutating either change back leaves the gate at 46/46. Round 1 asked for no test, so this is advisory only. |
| m4 | fixed | test.mjs now uses `--to x--apply` and a `startsWith("refusing: --repo/--host/--to/--out")` assertion. Mutation `[repo, host, outFlag]`: 45/46 (the B1-twin test fails). |

## Attack brief, re-run

**`--job` default drifting a byte (C2): no drift.** I re-ran round 1's 120-case harness: the base
31a23e2 `main()` against the HEAD `main()`, with 20 argv shapes x linux/win32/darwin x
{fresh home, pre-installed home}. The harness compares every file under the home, the stdout, the
exit code and the exec calls.
- 0 file diffs, 0 exit-code diffs, 0 exec-call diffs.
- 18 stdout diffs, and all 18 are the `--help`/usage text (new flag lines only).
- Round 1's `"job"` JSON key drift and the `--apply` refusal-wording drift are gone.

**Crafted origin string reaching the shell, unit text or envelope: still absent.** The installer
reads no origin data. `--out` control characters are now refused (m2). The `--host` newline
injection noted in round 1 is pre-existing janitor behaviour and is not counted.

**Second install / double wake:** unchanged from round 1. Nothing stops a second host's install,
and the report does not claim otherwise.

**Un-agent-able:** I ran no `schtasks`, `launchctl` or live `systemctl --user enable`. The Windows
and macOS findings below come from the generated text and the injected-exec argv, not from a live
scheduler.

## New findings

### N1 (major): Windows twin of M1. The collect job can replace or delete the janitor's live scheduled task by name

The marker fix protects linux and darwin because there the unit or plist file *is* the scheduler
identity, and both jobs resolve the same `--name` to the same path. On Windows the two jobs keep
their task XML in different directories: `~/.agents/janitor/<name>.task.xml` and
`~/.agents/collect/<name>.task.xml` (:681, :723). Task Scheduler, though, has one namespace keyed
by `/TN <name>` (:727-728). So the marker check never sees the other job's file, and the by-name
command hits the other job's task. Measured with injected exec, platform `win32`, HEAD:

- Janitor installed with `--enable`, then
  `--enable --job collect-status --to skills-fable --name janitor-record`: **exit 0**, and it
  runs `schtasks /Create /TN janitor-record /XML <home>/.agents/collect/janitor-record.task.xml /F`.
  The janitor's live task is replaced by the collector, while
  `~/.agents/janitor/installed.json` still reports a healthy janitor. This is M1's exact impact.
- `--remove --enable --job collect-status --name janitor-record`: **exit 0**, and it runs
  `schtasks /Delete /TN janitor-record /F`, deleting the janitor's task.
- The reverse direction, with a collect job installed: `--remove --enable --name collect-status`
  (default job): **exit 0**, and it runs `schtasks /Delete /TN collect-status /F`.
- The same three commands on linux and darwin exit 1 (marker refusal or installed.json refusal).
  The b249ce0 tree shows the same Windows behaviour, so this is not a regression from this round.

The M1 regression test (test.mjs, "C2 review round 1, M1") runs `platform: "linux"` only, so it
cannot see this.

Cause: the two jobs share Windows' task-name namespace, but each keeps its own XML directory, so
content-based ownership never compares against the other job's task.
Discriminating check: on win32, install the janitor with `--enable`, then run
`--enable --job collect-status --to skills-fable --name janitor-record`. Today it exits 0 and
issues `schtasks /Create /TN janitor-record ... /F`. Fixed, it should exit 1 with no exec calls
and no files written.
Fix location: scripts/install-janitor-timer.mjs, in the pre-write refusal block, just before
`const result = { action: ...` (currently :672).
Simplification: use one existence check on the other job's same-name task XML. No new ownership
model is needed.

Patch (mechanical). Insert immediately before
```
  const result = { action: removeFlag ? "remove" : dryRun ? "dry-run" : "install", refusals, files: [] };
```
this block:
```
  // Task Scheduler has ONE task-name namespace, but each job keeps its task XML in its own dir, so the
  // marker check can never see the other job's same-named task. Refuse any --name the other job
  // already holds, before any write or exec (install and remove alike).
  if (platform === "win32") {
    const otherDir = job === "collect-status" ? "janitor" : "collect";
    const otherTaskXml = path.join(home, ".agents", otherDir, `${name}.task.xml`);
    if (fs.existsSync(otherTaskXml)) {
      refusals.push(`refusing: --name ${name} is already the ${otherDir === "janitor" ? "janitor-record" : "collect-status"} job's scheduled task (${otherTaskXml}); pick another --name`);
    }
  }
```
Predicted outcome:
- All three Windows commands above exit 1 with no exec calls.
- The default job's bytes are unchanged, because the check fires only when
  `~/.agents/collect/<name>.task.xml` exists, a state that could not exist before C2. The drift
  harness should still show 0 file, exit-code and exec diffs.
- The gate stays green.

Add a win32 test that mirrors the M1 test: janitor `--enable`, then both collect commands, then
asserting exit 1, no exec calls, and the janitor's XML and installed.json byte-identical. Also
test the reverse direction.

A residual remains and should be named in the report: a live task whose XML was deleted by hand
cannot be detected without querying `schtasks`.

### N2 (major): on macOS, `--remove --job collect-status` without `--to` throws an uncaught TypeError

The builder made `--to` not required for `--remove` (round 1 confirmed this at :562). But the
remove path still builds `desired` for every artifact, and `launchdPlist` calls `.replace` on each
argv element (:312-313, `.map((a) => a.replace(/'/g, "'\\''"))`). With `to` null, the collect argv
contains `null`, so the call throws. `systemdQuote` (:173, `String(arg)`) and the Windows
generator tolerate null, which is why linux and win32 pass. Measured, platform `darwin`, HEAD
(also present at b249ce0):
- `--remove --job collect-status` gives `TypeError: Cannot read properties of null (reading
  'replace')` at install-janitor-timer.mjs:313. It prints a stack, removes nothing, and leaves
  the plist and `~/.agents/collect/installed.json` in place.
- `--remove --enable --job collect-status --name janitor-record` throws the same error.
- `--remove --job collect-status --to x` works (exit 0, removed). That is the only workaround.

No test covers a darwin or win32 collect-job remove. The only collect remove test,
test.mjs:1033, is `platform: "linux"`.

Cause: `launchdPlist` assumes every argv element is a string. The remove path passes `to: null`.
Discriminating check: on darwin, install `--job collect-status --to skills-fable`, then run
`--remove --job collect-status`. Today it throws. Fixed, it should exit 0 with the plist and the
collect installed.json removed.
Fix location: scripts/install-janitor-timer.mjs:313.
Simplification: coerce with `String(a)`, the same as `systemdQuote` already does. No change to
the remove flow is needed.

Patch (mechanical). Replace
```
    .map((a) => a.replace(/'/g, "'\\''"))
```
with
```
    .map((a) => String(a).replace(/'/g, "'\\''"))
```
Predicted outcome:
- Every janitor argv element is already a string, so the default darwin plist bytes are
  unchanged (drift harness: 0 diffs).
- Both darwin commands above exit 0 and remove the collect job's own files.
- The `--name janitor-record` variant then reaches the marker check and exits 1 with
  `foreign (unmarked) file(s) present`.

Add a test that installs the collect job and then removes it without `--to`, on `darwin` and
`win32`, asserting exit 0 and both files gone.

## Not counted

- **Nit:** the help text at :443 still says `--out <dir>   collect-status output dir override,
  passed through as-is`, and the comment at :582 still says "--out is a plain pass-through". Since
  m2, `--out` is resolved to an absolute path and refused if it contains a control character.
  Suggested replacement for :443: `"  --out <dir>   collect-status output dir override (resolved to
  an absolute path)",`. The help text is new in C2, so this changes no default-job byte beyond the
  existing, intended help-text diffs.
- **Advisory:** m3's two fixes have no regression test (mutating either back leaves the gate at
  46/46). A test that runs a default-job `--json` install and asserts `!("job" in result)` would
  pin it.
- **Advisory from round 1 (Windows `TimeTrigger` child order):** left as is, which is acceptable.
- The m2 test compares `--out ${path.resolve("rel")}` against the unit text. If the runner's cwd
  ever contained whitespace, `systemdQuote` would quote it and the test would fail. The sealed
  runner's cwd has no whitespace today.

## Verified clean (first-class)

- Default job: 0 generated-file, installed.json, exit-code or exec drift across 120 cases
  (measured above).
- The M1 fix on linux and darwin, in both directions. With a collect install present, a
  default-job `--remove --enable --name collect-status` now refuses on linux and darwin (at
  b249ce0 it ran `launchctl unload` on the collect plist).
- m2, m4 and M1 are each mutation-proven by their new tests.
