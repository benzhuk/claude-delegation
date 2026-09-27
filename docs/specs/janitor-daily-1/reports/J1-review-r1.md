VERDICT: NEEDS_FIXES (12) d188e68a2fe9cc71962fef6a135a47052abb47a8

# J1 review, round 1: install-janitor-timer

Reviewed: worktree /home/ben/Code/claude-delegation-wt/wt-janitor-daily-1-J1, branch build/janitor-daily-1-J1,
HEAD d188e68a2fe9cc71962fef6a135a47052abb47a8 (`git rev-parse HEAD`, run by me), base c25cc70. Clean tree.
Diff: scripts/install-janitor-timer.mjs (new), scripts/install-janitor-timer.test.mjs (new),
scripts/janitor.mjs (+`--host`), scripts/janitor.test.mjs (one heading-list assertion), skills/janitor/SKILL.md.

Gate re-run by me: `node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs scripts/janitor.test.mjs`
gave tests 93, pass 91, fail 0, skipped 2. That matches J1-gate.log, so the log is genuine. It is green only
because the suite runs from a `wt-` path on Linux; see B2 and M4.

All scratch homes are under my session scratchpad. No real unit was enabled, `--apply` was never passed, and
nothing was deleted. The only `--remove` runs targeted scratch homes, and `systemctl` was a fake shim on PATH
that only logs its argv.

Counts: 2 BLOCKER, 5 MAJOR, 5 MINOR.

---

## BLOCKER

### B1: a generated systemd unit can run `janitor.mjs --apply` (unquoted ExecStart argv injection)
Evidence: `scripts/install-janitor-timer.mjs:121` builds ExecStart with `scheduledCommandArgv(...).join(" ")`
and applies no quoting. systemd splits ExecStart on whitespace, so any space inside `repo` (from `--repo`
or `~/.agents/janitor-repo`) or inside `--host` becomes a new argv element for janitor.mjs.
`janitor.mjs:1396` is `argv.includes("--apply")`. Measured with a dry run in a scratch home:
```
# ~/.agents/janitor-repo contains "/srv/repo --apply"
WorkingDirectory=/srv/repo --apply
ExecStart=<node> <plugin>/scripts/janitor.mjs --record --repo /srv/repo --apply
# --host 'box --apply'
ExecStart=<node> <plugin>/scripts/janitor.mjs --record --repo /srv/repo --apply --host box --apply
```
With a valid repo and `--host 'box --apply'`, the scheduled daily run is a destructive `--apply` run.
The code comment at :100-103 says scheduledCommandArgv is "exactly one place that could ever add it". That
is false once argv is flattened unquoted. The pinned contract ("The string `--apply` never appears
anywhere") is also violated as text on all three platforms. The test at test.mjs:65-79 only checks fixed,
benign inputs.

Fix (mechanical, two parts):
1. Quote systemd args only when needed, so normal paths stay byte-identical and the existing ExecStart
   assertion at test.mjs:157 still passes.

   Current (install-janitor-timer.mjs:120-121):
   ```js
   export function systemdServiceUnit({ node, pluginRoot, repo, host, logPath }) {
     const cmd = scheduledCommandArgv({ node, pluginRoot, repo, host }).join(" ");
   ```
   Replacement:
   ```js
   /** systemd ExecStart quoting: `%` is a specifier and `$` is env expansion, so double both; quote only
    * when the arg has whitespace/quotes/backslashes, so ordinary paths stay byte-identical. */
   function systemdQuote(arg) {
     const s = String(arg).replace(/%/g, "%%").replace(/\$/g, "$$$$");
     return /[\s"'\\]/.test(s) ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s;
   }

   export function systemdServiceUnit({ node, pluginRoot, repo, host, logPath }) {
     const cmd = scheduledCommandArgv({ node, pluginRoot, repo, host }).map(systemdQuote).join(" ");
   ```
2. Refuse outright any input that carries the forbidden string, so the contract holds as text too.
   Insert in `main()` right after `const repo = resolveRepo({ home, repoFlag });` (:361):
   ```js
   if ([repo, hostFlag || ""].some((v) => v.includes("--apply"))) {
     refusals.push("refusing: --repo/--host/~/.agents/janitor-repo contains the string --apply, which a scheduled janitor command must never carry");
   }
   if (refusals.length > 0) {
     if (jsonFlag) stdout(`${JSON.stringify(result, null, 2)}\n`);
     else for (const r of refusals) stdout(`refused: ${r}\n`);
     return 1;
   }
   ```
   Also add a test that sets `--host 'box --apply'` and a repo file with a space, and asserts exit 1 and no
   files written.

   Predicted outcome: the demo above gets refused. A space-bearing repo with no `--apply` produces
   `--repo "/srv/my repo"`, which stays a single argv element. Existing tests stay green.

### B2: the refusal test only passes when the checkout sits under a `wt-`/tmp path, so it goes red on main and on Windows
Evidence: test.mjs:110 is `main(["--json"], { home, ...cap })`. It uses the default pluginRoot, which is
this file's own checkout, and asserts `code === 1` because "Default pluginRoot ... sits under a `wt-...`
segment". After merge, the suite runs from `~/Code/claude-delegation`. The spec's acceptance also requires
the suite to be green "on Windows from origin", where the checkout is `C:\Users\ben\Code\claude-delegation`.
Both of those paths are durable. Measured:
```
main(["--dry-run","--json"], { pluginRoot: "/home/ben/Code/claude-delegation", home: <scratch>, platform: "linux", ... })
-> exit 0 refusals []
```
So from a durable checkout, test.mjs:110 gets 0 and fails. Without `--dry-run`, it also really installs a
unit that points at the real checkout, into `env = process.env`'s XDG_CONFIG_HOME. That lands in the sealed
home under run-tests.mjs, but in the real one under a bare `node --test`; see m5.

Fix (mechanical): make the refusal test independent of where the checkout lives. A fixture plugin root
under os.tmpdir() is non-durable by construction, and so is FIXTURE_ROOT.

Current (test.mjs:110):
```js
  const code = main(["--json"], { home, ...cap });
```
Replacement:
```js
  const code = main(["--json"], { home, env: { XDG_CONFIG_HOME: path.join(home, ".config") }, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap });
```
Also reword the comment at :108-109: the refusal comes from the fixture root under os.tmpdir(), not from
the `wt-` segment. Predicted: the test passes from any checkout location, and the refusal assertion and the
nothing-written assertion both still hold.

---

## MAJOR

### M1: `--enable` enables and disables the entry BY NAME, even when the same-named file is foreign; `--remove --enable` disables only after deleting the unit files
Evidence: install-janitor-timer.mjs:418-427 and :435-437 run `disableCmds` and `enableCmds` whatever each
file's `status` is. Measured in a scratch home: a same-named `janitor-record.timer` without the marker, then
`--remove --enable` with a fake `systemctl` on PATH:
```
  left-untouched-foreign: .../systemd/user/janitor-record.timer
fake-calls.log: .../fakebin/systemctl --user disable --now janitor-record.timer
```
So the user's own timer is left in place on disk but is stopped and disabled. This is the attack brief's
case of "`--remove` touching a user's unrelated janitor unit", reached through a different door. The mirror
case also holds: install with a foreign `.timer` plus `--enable` runs `systemctl --user enable --now` on the
user's timer. On Windows, `schtasks /Delete /TN janitor-record /F` deletes whatever task holds that name.

There is also an ordering problem. On `--remove`, the unit files are deleted (:413) before the disable runs
(:419). `systemctl --user disable` on a unit whose file is gone typically fails with "Unit file ... does not
exist". I could not run real systemctl here. That error is swallowed (:422-425), so the
`timers.target.wants` symlink can stay dangling and the loaded timer stays active until a reload or reboot.

Fix (judgment, small):
- Run the enable/disable commands only when none of the artifacts has status `left-untouched-foreign`.
  Otherwise add a refusal line naming the foreign file and return 1.
- On `--remove`, run the disable commands BEFORE the `planRemove` calls, then run
  `systemctl --user daemon-reload` after them on systemd.
- Add a test that uses the injected `fakeExec`: with a foreign `.timer` present, `--remove --enable` and
  `--enable` install record zero calls. Predicted: the user's timer is never touched, and an owned install
  is disabled while its unit file still exists.

### M2: the Windows task's command line is mangled by cmd.exe's `/c` quote stripping, so the task can never run
Evidence: install-janitor-timer.mjs:170-171 and :192 emit `<Command>%ComSpec%</Command>` with
`<Arguments>/c "C:\...\node.exe" "C:\...\janitor.mjs" "--record" "--repo" "C:\..." > "C:\...\last-run.log" 2>&1</Arguments>`
(generated verbatim by me with `windowsTaskXml`). cmd.exe's documented `/c` rule applies: when there are
more than two quote characters, it strips the first character if it is `"` and removes the LAST `"` on the
line. The command it then runs is `C:\Program Files\nodejs\node.exe" "C:\...\janitor.mjs" ... > "C:\...\last-run.log 2>&1`,
which has a broken program token and an unterminated redirect. The tests only grep the text, so they cannot
see this, and it was not run live because this host has no schtasks. This is the named failure class: a
check that passes because it is not looking.

Fix (mechanical): wrap the whole payload in one extra pair of quotes and use `/s`, which makes cmd strip
exactly that outer pair.

Current (:192):
```js
    `      <Arguments>/c ${escapeXml(wrapped)}</Arguments>\n` +
```
Replacement:
```js
    `      <Arguments>/s /c "${escapeXml(wrapped)}"</Arguments>\n` +
```
Predicted: cmd runs `"node.exe" "janitor.mjs" ... > "last-run.log" 2>&1` intact. State in the report that
this is still unverified live on Windows, and ask the lead to run the `janitor-record-test` acceptance step
on the Windows host.

### M3: the Windows task XML declares `encoding="UTF-16"` but is written as UTF-8 bytes
Evidence: install-janitor-timer.mjs:174 declares `<?xml version="1.0" encoding="UTF-16"?>`, and
writeFileAtomic (:66) writes `"utf8"`. An XML parser that finds no BOM and ASCII-compatible bytes, then a
UTF-16 declaration, rejects the switch. In MSXML this is the "switch from current encoding to specified
encoding not supported" error, so `schtasks /Create /XML` should fail. Not verified live, because this host
has no schtasks.

Fix (mechanical): declare what is actually written. Keeping UTF-8 also keeps `readMarked`'s utf8
`includes(MARKER)` working.

Current (:174):
```js
    '<?xml version="1.0" encoding="UTF-16"?>\n' +
```
Replacement:
```js
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
```
Predicted: the declaration and the bytes agree. The alternative, writing UTF-16LE with a BOM, would break
readMarked's marker check and the unchanged-bytes comparison, so avoid it.

### M4: the "real install" test cannot pass on Windows (the spec requires the suite green "on Windows from origin")
Evidence: test.mjs:142 passes `execPath: "/usr/bin/node"`, and the installer does `path.resolve(execPath)`
(:362). On win32 that returns `C:\usr\bin\node`, so:
- test.mjs:156 `includes("Environment=PATH=/usr/bin:/usr/bin:/bin")` fails, because the text is
  `C:\usr\bin:/usr/bin:/bin`;
- the `ExecStart=/usr/bin/node ` prefix at :157 fails;
- the `node: "/usr/bin/node"` deepEqual at :171 fails.

Fix (mechanical): derive expectations from the resolved value. At the top of the test file add
`const NODE = path.resolve("/usr/bin/node");`, then:
- :156 becomes `assert.ok(serviceText.includes(\`Environment=PATH=${path.dirname(NODE)}:/usr/bin:/bin\`));`
- :157 becomes `"ExecStart=" + NODE + " " + path.join(...) ...`. After B1's quoting, a Windows path has
  backslashes and would be quoted, so assert with `systemdServiceUnit`'s own output, or skip the ExecStart
  literal on win32.
- :171 becomes `node: NODE,`

Predicted: green on both platforms.

### M5: the installer never checks that the repo or the janitor script exists (the refusal it mirrors does), so it reports a timer that can never run as `created` with exit 0
Evidence: the Codex installer it mirrors refuses on a missing script (mirror-shared-skills.mjs,
`installCodexHookScript`: `if (!fs.existsSync(scriptPath)) { refuse(\`missing ... hook script\`) }`).
install-janitor-timer.mjs:338-351 checks only durability. The builder's own live step 2 installed
`"repo":"/tmp/janitor-timer-live-verify-rT9nTR/Code/claude-delegation"`, a directory that does not exist,
and got `created` / exit 0. My scratch install did the same (the r1 home has no Code/ directory).

A unit with a non-existent WorkingDirectory fails with CHDIR every day. A unit whose plugin-cache version
directory has been garbage-collected makes node write "Cannot find module" into last-run.log, which is still
truncated and freshly written each run. Either way the J2 freshness signal can read `ok` while no record was
ever written. This is the named failure class, and J1 is the side that can stop it at install time.

Fix (judgment, small): in `main()`, before any write and under `--dry-run` too, when not `--remove`:
- if `!fs.existsSync(janitorScriptPath)`, refuse with `missing janitor script <path>`;
- if `!fs.existsSync(path.join(repo, ".git"))`, refuse with `repo <repo> is not a git checkout (set ~/.agents/janitor-repo or --repo)`.

In tests, make `fixturePluginRoot()` write a stub `scripts/janitor.mjs`, and create
`home/Code/claude-delegation/.git/` in the install tests. Add one test per refusal. Predicted: a misconfigured
host is told so at install time instead of going quietly green later.
(Seam note for the seam reviewer, not adjudicated here: a fresh last-run.log does not prove a successful run.)

---

## MINOR

### m1: `--host` was added to janitor.mjs, but the default install never passes it, and the flag is untested in janitor.test.mjs
The contract says the scheduled command is the pinned text "plus `--host <name>` if J1 adds that flag". J1
added it (janitor.mjs:1417-1426), and the report justifies it as "needed so a scheduled record's host stays
stable". Yet the installer adds it only when the operator types `--host` (install-janitor-timer.mjs:106,
:328). By default the host stays `os.hostname()` at run time. That is stable across two installs, as I
checked, so this is not a correctness bug, but the report's rationale is not delivered.

No test in janitor.test.mjs drives `main(["--record", dir, "--host", "x"])` to show that
`<date>-x.json` / `"host":"x"` gets written.

Fix: either default `hostFlag` to `os.hostname()` baked in at install time (and say so in SKILL.md), or drop
the rationale from the report. Also add one janitor.test.mjs test for `--host`.

### m2: `--hour 99` / `--hour 7.5` silently fall back to 6
install-janitor-timer.mjs:320-325, and test.mjs:245-259 asserts that behaviour. A typo'd hour installs a
06:00 timer and reports success. The guard silences the bad input instead of reporting it.

Fix: in the `if (hourArg !== null)` branch, when the value is not an integer in 0..23, push the refusal
``--hour must be an integer 0-23, got ${hourArg}`` and return 1 before any write. Update the test to
assert exit 1 and no files written.

### m3: `--enable` does not print the commands it runs, and a plain `--remove` does not say the live entry remains
The contract says: "With `--enable`, it runs the host's enable/load command and prints it."
:436 is `exec(..., { stdio: "ignore" })`, which prints nothing, puts nothing in the JSON, and on failure
throws an uncaught stack trace.

A `--remove` without `--enable` deletes the files but leaves a registered Windows task, or a loaded
systemd timer, still running. The output never says so.

Fix: push each `${cmd} ${args.join(" ")}` into `result.commands` (JSON) and print it as a line in text
mode. Wrap the exec in try/catch so a failure is reported and returns a nonzero exit. When `--remove` runs
without `--enable`, add `result.note` with the exact disable command for the platform.

### m4: status wording and exit code hide an incomplete state
- `--remove --dry-run` reports `removed:` for files it did not remove (measured; :291 returns
  `status: "removed"` under dryRun). Change it to `dryRun ? "would-remove" : "removed"`, and do the same in
  planWrite: `would-create` / `would-update`.
- An install where an artifact is `left-untouched-foreign` still writes installed.json and exits 0
  (:431-433, :447). J2 will then treat the host as installed. Fix: if any artifact is foreign, skip writing
  installed.json and return 1.

### m5: three tests run `main()` with `env = process.env`, which reaches a real `$XDG_CONFIG_HOME` under a bare `node --test`
test.mjs:121 (`--force-root`, default real pluginRoot, no `env`), :130 (`--remove`, no `env`), and :238 all
fall through to `process.env.XDG_CONFIG_HOME`. The sealed runner overrides that variable (test-home.mjs:94),
so the gate is safe. But the file header (:1) documents running it as
`node --test scripts/install-janitor-timer.test.mjs`, and the comment at :5-7 claims "no risk of ... touching
a real machine's home even under an unsealed run". On a host that exports XDG_CONFIG_HOME, :121 writes a
real `janitor-record.service` pointing at the checkout, and :130 would remove a real marked one.

Fix: pass `env: { XDG_CONFIG_HOME: path.join(home, ".config") }` in those three calls. Also pass it at :276
and :189 for consistency.

---

## Attack brief, item by item
- **`--apply` in generated text:** with default inputs, grepping the generated service, timer, installed.json
  and the dry-run JSON gives "no --apply". It is injectable through repo or host, so B1.
- **Refusal from a worktree without `--force-root`:** it refuses, with exit 1 and nothing written (scratch
  home stays empty), and `--dry-run` is refused as well. It mirrors `isDurablePath` by import, not by a copy.
  The test for this is location-dependent (B2).
- **Node on PATH in the systemd unit:** `Environment=PATH=/home/ben/.local/share/fnm/node-versions/v24.18.0/installation/bin:/usr/bin:/bin`,
  and ExecStart uses the absolute `process.execPath`. `systemd-analyze --user verify` on the generated
  service and timer passes (exit 0). No defect here.
- **Idempotency and `--dry-run`:** installed.json, service and timer sha256 are identical across two
  installs, the second run reports `unchanged` for all three, and installed.json's mtime is unchanged. A
  `--dry-run --force-root` leaves the scratch home with 0 entries (no directory, no file). No defect here.
- **`--remove` marker scope:** a planted `janitor-record-extra.service` survives, and is not reported,
  which is correct because it is not same-named. A same-named timer without the marker is left untouched
  and reported `left-untouched-foreign`. The files themselves are handled correctly; the by-name
  enable/disable is M1.
- **Host stability and installed.json shape:** the host defaults to `os.hostname()` at run time and is
  stable (see m1). installed.json is
  `{"schema":1,"repo":...,"node":...,"hour":6,"scheduler":"systemd-user","name":"janitor-record"}\n`: field
  for field and key order match the seam contract. No defect in the shape.
- **Cause vs compensation:** the `--hour` fallback (m2) and the swallowed disable errors (M1) are guards that
  silence a state rather than report it. Nothing else qualifies.
- **SKILL.md:** it covers install, where the record lands, that Ben's page links drift.md, and that
  `--apply` stays a human's command. The janitor.test.mjs heading-list edit is in scope and minimal. No
  defect.

## Observations (not findings; for the lead or seam reviewer)
- A timer run gets the systemd user manager's environment, which usually has no SSH agent. If origin is an
  SSH remote, every daily fetch may fail, and the table then downgrades to UNVERIFIABLE. Worth one live
  `systemctl --user start` on a real host at release time.
- A bare `--record` from the timer appends to the tracked `docs/work/evidence/janitor/drift.md` inside the
  watched main checkout every day, so that checkout will always be dirty. That follows the spec's design,
  but whoever pulls on that checkout will meet it.
- A pluginRoot inside the plugin cache is version-specific. After a plugin update the installer must be
  re-run, or the timer runs a dead path (see M5's seam note).
- I did not write the reviewer state file the brief names: my standing instructions allow only this report
  as a write.

## Bug-fix fields (not a bug-fix lane; filled for gate compatibility)
Cause: not applicable. This is a new feature territory, and no prior defect is being fixed.
Discriminating check: not applicable. Each finding above carries its own measured reproduction.
Fix location: scripts/install-janitor-timer.mjs and scripts/install-janitor-timer.test.mjs, per finding.
Simplification: not applicable.
