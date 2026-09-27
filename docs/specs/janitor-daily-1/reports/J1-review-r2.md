VERDICT: NEEDS_FIXES (4) 8ffd077898f84b7a384af0bbae1f58cf71ed68c4

# J1 review, round 2 (delta re-review): install-janitor-timer

Reviewed: worktree /home/ben/Code/claude-delegation-wt/wt-janitor-daily-1-J1, HEAD
8ffd077898f84b7a384af0bbae1f58cf71ed68c4 (`git rev-parse HEAD`, run by me). Range d188e68..HEAD is one commit.
It touches 4 files, all in scope: scripts/install-janitor-timer.mjs, scripts/install-janitor-timer.test.mjs,
scripts/janitor.test.mjs, and skills/janitor/SKILL.md. janitor.mjs is unchanged this round.

Gate re-run by me: `node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs scripts/janitor.test.mjs`
gave tests 100, pass 98, fail 0, skipped 2. That matches the builder's report.

Safety: all scratch homes were under my session scratchpad, with HOME and XDG_CONFIG_HOME overridden.
`--enable` and `--apply` were never passed. No real unit was enabled. I deleted nothing, and I wrote nothing
in the worktree.

Counts: 0 BLOCKER, 1 MAJOR, 3 MINOR.

---

## Prior findings: verification

| r1 | Status | Evidence |
|---|---|---|
| B1 | FIXED | `systemdQuote` is at install-janitor-timer.mjs:127-130, and the `--apply` refusal at :392-396. Live check: `--repo "<scratch>/my repo $x%h" --host "box $USER"` produced `--repo "<...>/my repo $$x%%h" --host "box $$USER"`, and `systemd-analyze --user verify` on the generated service and timer exited 0. `~/.agents/janitor-repo` = `/srv/repo --apply` is refused with exit 1. Mutation reasoning: without the guard, the new B1 test's exit-1 assertion fails. Without the quoting, the space-repo regex fails on POSIX. |
| B2 | FIXED | The refusal test now uses `fixturePluginRoot()`. isDurablePath flags that path on Windows too, through the `temp/` segment regex (mirror-shared-skills.mjs:700). |
| M1 | FIXED | The remove side pre-checks foreign files read-only before any delete or exec (:476-492). Disable now runs before `planRemove`, then daemon-reload. On the install side, a foreign file withholds installed.json and every enable exec. The new test covers both sides with zero fakeExec calls. |
| M2 | FIXED (text only) | `<Arguments>/s /c "..."</Arguments>` at :211. It is still unverified live on Windows, and the builder says so. |
| M3 | FIXED | The declaration now reads UTF-8 (:189). |
| M4 | FIXED for the tests it named | The whole-text comparison against `systemdServiceUnit` plus `NODE` holds on win32. The new B1 space test reintroduces the same bug class; see J1r2-M1 below. |
| M5 | FIXED | Script and `.git` existence refusals at :402-409, applied under `--dry-run` as well and skipped for `--remove`. Three sub-case tests. |
| m1 | FIXED | Host defaults to `os.hostname()`, baked in at install time (:364). The new janitor.test.mjs test drives `--host` end to end. |
| m2 | FIXED for out-of-range and non-integer values | Values 99, 7.5, -1 and nope are refused. A valueless `--hour` still falls back to 6 silently; see J1r2-m2. |
| m3 | FIXED, with one gap | `result.commands` plus `ran:` lines, and `result.note` on a plain `--remove`. The post-remove daemon-reload failure is still swallowed with no record; see J1r2-m3. |
| m4 | FIXED, with one gap | The status strings are now `would-create`, `would-update` and `would-remove`. The `--remove --dry-run` note still says "files removed"; see J1r2-m1. |
| m5 | FIXED | Every `main()` call that can write on the linux platform now passes `env`. The calls without `env` are dry-run or refused before any write. |

---

## MAJOR

### J1r2-M1: the new B1 space-repo test fails on Windows (same class as r1 M4)
Evidence: install-janitor-timer.test.mjs:476 builds its regex from the raw `spaceRepo`, escaping it as a regex
literal. `systemdQuote` (install-janitor-timer.mjs:129) doubles backslashes inside the quotes. On Windows,
`spaceRepo` is `C:\...\my repo`, so the unit reads `--repo "C:\\...\\my repo"` while the regex expects single
backslashes. I measured this by running the exported `systemdServiceUnit` with a Windows-shaped repo and
applying the test's own regex:
```
ExecStart="C:\\usr\\bin\\node" ... --record --repo "C:\\Users\\ben\\AppData\\Local\\Temp\\janitor-timer-home-b1-space-abc\\my repo" --host h
test regex matches: false      (posix path: true)
```
The spec requires the suite to be green "on Windows from origin", so this test goes red there.

Fix (mechanical). Current, test.mjs:476:
```js
  assert.match(serviceText, new RegExp(`ExecStart=\\S+ \\S+ --record --repo "${spaceRepo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
```
Replacement:
```js
  // systemdQuote doubles backslashes inside the quotes, so a Windows-hosted run sees `C:\\...\\my repo`.
  const execLine = serviceText.split("\n").find((l) => l.startsWith("ExecStart="));
  assert.ok(execLine.includes(` --record --repo "${spaceRepo.replace(/\\/g, "\\\\")}" `), execLine);
```
Predicted outcome: I simulated this with the real exported generator. It gives `true` for both
`C:\Users\...\my repo` and `/tmp/x/my repo`. The trailing space in the match holds because `--host <os.hostname()>`
always follows. Mutation check: without `systemdQuote`, the unquoted repo fails the `--repo "` match.

---

## MINOR

### J1r2-m1: `--remove --dry-run` prints "files removed" (the twin of r1 m4)
Evidence: install-janitor-timer.mjs:532 sets the note whenever `!enableFlag`, whatever `dryRun` is. Measured in
a scratch home:
```
  would-remove: .../janitor-record.service
  ...
  note: files removed, but the systemd-user entry may still be registered/running — pass --enable to also run: ...
```
Fix (mechanical). Current, :532:
```js
        `files removed, but the ${scheduler} entry may still be registered/running — pass --enable ` +
```
Replacement:
```js
        `${dryRun ? "files would be removed" : "files removed"}, but the ${scheduler} entry may still be registered/running — pass --enable ` +
```
The existing `/may still be registered\/running/` assertion still passes. Optionally assert
`/^files would be removed/` in the `--remove --dry-run` test.

### J1r2-m2: a valueless or loosely formatted `--hour` still installs at 06:00 or at an unintended hour (the twin of r1 m2)
Evidence: `parseArgFlag` (:319-324) returns null both when the flag is absent and when it has no value. Measured:
`--force-root --dry-run --hour` gives exit 0 with hour=6, and so does `--hour --json`. By reading the code,
`Number(" ")` is 0 and `Number("0x10")` is 16, and both pass `Number.isInteger`, so a stray value becomes a real
hour.

Fix (mechanical). Current, :346-353:
```js
  const hourArg = parseArgFlag(argv, "--hour");
  if (hourArg !== null) {
    const n = Number(hourArg);
    ...
    if (Number.isInteger(n) && n >= 0 && n <= 23) hour = n;
    else refusals.push(`--hour must be an integer 0-23, got ${hourArg}`);
  }
```
Replacement:
```js
  const hourArg = parseArgFlag(argv, "--hour");
  if (argv.includes("--hour")) {
    const n = hourArg !== null && /^\d{1,2}$/.test(hourArg) ? Number(hourArg) : NaN;
    if (Number.isInteger(n) && n >= 0 && n <= 23) hour = n;
    else refusals.push(`--hour must be an integer 0-23, got ${hourArg === null ? "(no value)" : hourArg}`);
  }
```
Add `"0x10"`, `" "` and a valueless `--hour` case to the table test at test.mjs:~325. Predicted: `"-1"` is still
refused (the regex rejects it), and `"14"` and `"07"` still pass.

### J1r2-m3: the post-remove `daemon-reload` failure is swallowed without a record
Evidence: install-janitor-timer.mjs:519-525 has `catch { // Best effort, same reasoning as above. }`. The disable
loop just above it records `(failed: ...)` in `result.commands`, and the builder's own comment says "Reported,
not swallowed silently". The reload is the one exec left unreported, so `ran:` silently omits it.

Fix (mechanical). Current, :522-524:
```js
      } catch {
        // Best effort, same reasoning as above.
      }
```
Replacement:
```js
      } catch (err) {
        // Best effort, same reasoning as above — but reported, like the disable commands.
        result.commands.push(`${cmdText} (failed: ${String(err && err.message ? err.message : err)})`);
      }
```

---

## Attack brief, re-run against HEAD
- **`--apply` in generated text:** I grepped the installed service, timer and installed.json in a scratch home
  and found no `--apply`. The injection paths `--repo`, `--host` and `~/.agents/janitor-repo` are all refused.
  No defect.
- **Refusal from the worktree without `--force-root`:** a live `--dry-run` from this worktree prints
  `refused: refusing to install a live janitor timer from a temporary checkout (...)` and exits 1. No defect.
- **Node on PATH:** the unit has `Environment=PATH=<fnm node dir>:/usr/bin:/bin` and an absolute node in
  ExecStart. No defect.
- **Idempotency and `--dry-run`:** installed.json sha256 is identical across two installs, and the second run
  reports `unchanged` for all three files. A dry run into a scratch home wrote nothing. No defect.
- **`--remove` marker scope:** a foreign same-named file is left alone and blocks `--enable` on both the install
  and remove paths. The disable-before-delete order is fixed. No defect.
- **Host stability and installed.json shape:** the host is baked in at install time, and the byte-identical
  re-run confirms it is stable. installed.json keys and order match the seam contract. No defect.
- **Cause vs compensation:** the remaining silent fallbacks are J1r2-m2 (`--hour`) and J1r2-m3 (reload).

## Observations (not findings)
- On install, a foreign `.timer` still lets the sibling service file be written before the refusal exits 1.
  The builder flagged this as a deliberate reading, the JSON reports it honestly as `created`, and installed.json
  is withheld. Acceptable. A read-only pre-check before any write, like the remove path, would be cleaner.
- `WorkingDirectory=` and `StandardOutput=truncate:` still pass `%` specifiers through unescaped. A repo path
  containing a literal `%h` would be expanded, as seen in my scratch unit. That is pathological and does not
  affect `--apply` safety.
- The J1/J2 seam note from r1 stands: a fresh last-run.log does not prove the run succeeded.
- I did not write the reviewer state file: my standing instructions allow only this report.

## Bug-fix fields (not a bug-fix lane; filled for gate compatibility)
Cause: not applicable. This is a new-feature territory; each finding above carries its own measured reproduction.
Discriminating check: J1r2-M1 is the Windows-path simulation through the test's own regex (false, while the
POSIX path gives true). J1r2-m1 and J1r2-m2 are the measured CLI outputs quoted above.
Fix location: scripts/install-janitor-timer.test.mjs:476 and scripts/install-janitor-timer.mjs:346-353, :522-524
and :532.
Simplification: not applicable.
