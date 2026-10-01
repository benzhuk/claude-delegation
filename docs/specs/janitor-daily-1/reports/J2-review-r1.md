VERDICT: NEEDS_FIXES (5) b506977d9a8b2c832fea5d431919646d412db829

# J2 review, round 1 (wr-2026-09-27-janitor-daily)

Worktree: /home/ben/Code/claude-delegation-wt/wt-janitor-daily-1-J2, branch build/janitor-daily-1-J2.
HEAD (`git rev-parse HEAD`, run by the reviewer): b506977d9a8b2c832fea5d431919646d412db829.
Base c25cc70. One commit. Diff touches scripts/wiring-check.mjs, scripts/required-wiring.default.json,
scripts/wiring-check.test.mjs and README.md (the Wiring check bullet only). Everything is inside J2's
territory.

Gate reproduced by the reviewer in the worktree:
`node scripts/run-tests.mjs scripts/wiring-check.test.mjs scripts/janitor.test.mjs` gives
tests 136 / pass 134 / fail 0 / skipped 2. That matches the builder's gate log.

Tally: 2 BLOCKER, 1 MAJOR, 2 MINOR.

---

## B1 BLOCKER: `hook_present` is still a substring match, so a commented-out, disabled or wrong-matcher hook reads `ok`, and a new test locks that in

The J2 ruling in contracts.md says: "`hook_present` must match a real hook entry by its command string
in the parsed JSON. It must not match a text search that a commented-out, disabled or different-command
hook could satisfy." The reviewer brief says: "A raw substring match that a commented-out hook could
satisfy is a BLOCKER."

Evidence:
- `scripts/wiring-check.mjs:210-227` (`inspectHookGroup`, unchanged) passes on
  `h.command.includes(substring)`. It never looks at `entry.matcher`.
- The shipped checks use short substrings: `scripts/required-wiring.default.json:73`
  `"substring": "hooks/delete-guard.mjs"` and `:82` `"substring": "hooks/multi-inbox.js"`.
- The reviewer ran a probe on a scratch copy against the shipped `hook-delete-guard` row, with a
  fixture pluginRoot and a fixture home. Measured results:
  ```
  real                                   => ok
  "# node \"${CLAUDE_PLUGIN_ROOT}/hooks/delete-guard.mjs\""        (shell-commented) => ok
  "echo hooks/delete-guard.mjs"                                     (echo only)       => ok
  "true || node \"${CLAUDE_PLUGIN_ROOT}/hooks/delete-guard.mjs\""  (disabled)        => ok
  "node \"${CLAUDE_PLUGIN_ROOT}/hooks/delete-guard.mjs.bak\""       (renamed file)    => ok
  real command under matcher "Read" instead of "Bash|PowerShell"    (never fires)     => ok
  ```
- `scripts/wiring-check.test.mjs:790-806` is titled "does not match a commented-out or wrong-command
  PreToolUse hook". It actually asserts `state === "ok"` for
  `command: "echo 'hooks/delete-guard.mjs is disabled for now'"` (line 799 is the fixture, line 806
  is the assert). So the test locks in the exact behaviour the ruling forbids. Its only negative case
  is a hook with a completely different file name.
- The builder's report, §6, says "a raw-text false positive is structurally impossible already". That
  is true only for JSON-level comments. A JSONC `//` comment makes the file fail to parse, which is
  correctly `unknown`. It is not true for a hook that is disabled or commented out inside the command
  string.

Fix (mechanical). Add an optional exact `command` pin and an optional `matcher` pin to
`hook_present`/`hook_absent`. Keep `substring` for existing callers. Pin the two shipped rows to the
exact strings in hooks/hooks.json. The reviewer applied this patch on a scratch copy (never the
worktree) and measured the result: all five probes above now read `missing`, real reads `ok`, JSONC
still reads `unknown`, and the live CLI still shows `hook-delete-guard ok` and
`hook-post-tool-use-inbox ok` against the real hooks.json. In wiring-check.test.mjs, exactly two
tests fail after the patch, and both need updating as described below. The other 56 pass.

Patch 1: `scripts/wiring-check.mjs:160-163` (hasValidDefinition):
```
old:
      return isNonemptyString(check.file) && isNonemptyString(check.event) && typeof check.substring === "string";
new:
      return isNonemptyString(check.file) && isNonemptyString(check.event)
        && (typeof check.substring === "string" || isNonemptyString(check.command))
        && (check.command === undefined || isNonemptyString(check.command))
        && (check.matcher === undefined || typeof check.matcher === "string");
```
Patch 2: `scripts/wiring-check.mjs:210`:
```
old: function inspectHookGroup(data, event, substring) {
new: function inspectHookGroup(data, event, substring, command, matcher) {
```
Patch 3: in the same function, the inner loop header:
```
old:
    const list = entry.hooks;
    for (const h of list) {
new:
    // J2 ruling: when the check pins a matcher, a hook under any other matcher does not count - a
    // delete-guard parked under "Read" never fires for Bash.
    if (typeof matcher === "string" && entry.matcher !== matcher) continue;
    const list = entry.hooks;
    for (const h of list) {
```
Patch 4: the match line in the same function:
```
old:
      if (typeof h.command === "string" && h.command.includes(substring)) return { kind: "known", present: true };
new:
      if (typeof h.command !== "string") continue;
      // J2 ruling: an exact `command` pin compares the whole parsed command string, so a
      // shell-commented, echoed, `true ||`-disabled or renamed-file hook never satisfies it.
      const hit = typeof command === "string" ? h.command.trim() === command : h.command.includes(substring);
      if (hit) return { kind: "known", present: true };
```
Patch 5: `scripts/wiring-check.mjs:241`:
```
old:   const inspected = inspectHookGroup(evidence.value, check.event, check.substring);
new:   const inspected = inspectHookGroup(evidence.value, check.event, check.substring, check.command, check.matcher);
```
Patch 6: `scripts/required-wiring.default.json:72-73` and `:81-82`:
```
old:
    "event": "PreToolUse",
    "substring": "hooks/delete-guard.mjs",
new:
    "event": "PreToolUse",
    "matcher": "Bash|PowerShell",
    "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/delete-guard.mjs\"",

old:
    "event": "PostToolUse",
    "substring": "hooks/multi-inbox.js",
new:
    "event": "PostToolUse",
    "matcher": "*",
    "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/multi-inbox.js\" PostToolUse",
```
Also update the file-header type table (`hook_present { file, event, substring }`) to show
`{ file, event, substring | command, matcher? }`.

Test updates. These are judgment calls, so they are instructions, not patches.
- The "shipped list gained exactly six new checks" test: assert `delGuard.command`/`matcher` and
  `postInbox.command`/`matcher` instead of the `substring` regexes.
- Rewrite the test at `wiring-check.test.mjs:790` so that every one of these reads `missing` against
  the shipped row: the echo fixture, a `#`-commented command, a `true || <real command>`, a `.bak`
  path, and the real command under matcher `"Read"`. The existing "some-other-guard" case stays
  `missing`.

## B2 BLOCKER: the SessionStart hook's `--line` now exits 1 exactly when it has a line to show, which Claude Code treats as a hook error

Evidence:
- `hooks/hooks.json:18` runs `node "${CLAUDE_PLUGIN_ROOT}/scripts/wiring-check.mjs" --line` as a
  SessionStart command hook. `printLine` (`scripts/wiring-check.mjs:414-421`) writes the line to
  stdout with `console.log`. `main()` now returns `result.ok ? 0 : 1` (`wiring-check.mjs:475`). The
  line prints only when a result is missing, stale or unknown, and in every one of those cases `ok`
  is false. So the hook exits 1 every time it prints anything.
- Documented Claude Code command-hook semantics: only exit 0 counts as success. For SessionStart,
  stdout on exit 0 is added to the session's context. Any other exit code except 2 is a non-blocking
  error: stdout is not injected, and only stderr is surfaced, in verbose mode or as a
  "hook error" notice. This hook writes nothing to stderr. So the visibility line that the README
  (`README.md:155-157`) promises "at session start" is dropped exactly when it matters. The user
  gets, at most, an empty hook-error notice.
- The repo's own convention is the same: every other hook exits 0 deliberately
  (`hooks/backlog-notice.js:10,15`, `hooks/delete-guard.mjs:30,481,488`,
  `hooks/delegation-reminder.js:44`, `hooks/multi-hook-core.mjs:14`).
- With `~/.agents/ws-off` present, `--line` prints nothing but still exits 1. The test at
  `wiring-check.test.mjs:987` asserts this ("never the exit code"). So a silenced host still gets a
  failing SessionStart hook on every session.
- The builder's caller audit (report §1) says a nonzero SessionStart exit "surfaces its stderr as a
  notice". That is beside the point: the line is on stdout. The README's new sentence at
  `README.md:159-160`, "a caller that just wants the visibility line, like the SessionStart hook
  above, is unaffected either way", is therefore wrong. This is the "exit code change breaking a
  caller that reads stdout" item from the spec's attack list.
- Measured on this host (reviewer, read-only): `node scripts/wiring-check.mjs --line` prints
  `wiring: 1 flagged (janitor last run). Run wiring-check for the fixes.` and exits `1`. That is the
  exact output the SessionStart hook would now produce on every session on this host.

Fix. Keep the red exit for humans and agents, and keep the hook on exit 0:
- Add a `--hook` flag to wiring-check.mjs that forces return 0.
- Switch the SessionStart command to `--line --hook`.
- Do not make bare `--line` always exit 0: J3's paragraph tells operators to run
  `node scripts/wiring-check.mjs --line` and report the exit code, so that exit code must stay real.

`hooks/hooks.json` is not in any territory's map. The lead must assign line 18 to J2 (the natural
owner, since this is its only CLI caller) or apply it themselves.

Patch A: `scripts/wiring-check.mjs:451`:
```
old:   const known = new Set(["--line", "--json"]);
new:   const known = new Set(["--line", "--json", "--hook"]);
```
Patch B: `scripts/wiring-check.mjs:475`:
```
old:   return result.ok ? 0 : 1;
new:   // --hook: a Claude Code hook's non-zero exit drops its stdout (a non-blocking error), so the
  // SessionStart caller keeps exit 0 and the line still reaches the session; the red exit is for
  // humans and agents running the CLI directly.
  if (argv.includes("--hook")) return 0;
  return result.ok ? 0 : 1;
```
Patch C: `hooks/hooks.json:18`, once the lead assigns it:
```
old:             "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/wiring-check.mjs\" --line",
new:             "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/wiring-check.mjs\" --line --hook",
```
Tests and docs:
- Add a CLI test: `--line --hook` against a bare scratch home prints the line and exits 0.
- The existing test at `wiring-check.test.mjs:1210` keeps matching, because it only checks
  `includes("--line")`. Tighten it to also require `--hook`.
- Fix the README sentence at `README.md:159-160` to say the SessionStart hook passes `--hook` and
  always exits 0.

Predicted outcome: the SessionStart line reaches the session again, and `--line`, `--json` and the
table exit 1 when red.

## B3 MAJOR (needs a lead ruling): a host that never installed J1 is red and nags every session, which contradicts the spec

Evidence:
- spec.md J2.2 says: "state `unknown`, not `missing`, when the timer was never installed, so a host
  without J1 is not red for that reason."
- `checkWiring().ok` counts `unknown` as not-ok, and `main()` exits 1 on `!ok`. The builder's own live
  run (report §8) and the reviewer's rerun on this host both give `wiring: 1 flagged (janitor last
  run)` and exit `1`. The only cause is `janitor-last-run` being `unknown`
  (`wiring-check.mjs:268`). Every host without J1 installed is red and prints that line at every
  session start. The spec puts installing the timer on Ben's four machines behind a release step that
  needs his word, so all four hosts start out red.
- The builder's own comments say the opposite of what the code does: `wiring-check.mjs:32` ("so a
  host that never ran that installer is not red") and `:263` ("not red for lacking a record").
- The conflict is upstream. contracts.md pins the state name ("installed.json absent: state
  `unknown`") and also pins "exit code is 1 when `ok` is false". The spec's purpose clause says "not
  red". The builder followed the contract to the letter, and that produces the red the spec rules
  out.

Fix. The lead picks one:
- (a) Recommended. The not-installed gate reports `info`, and its reason says it is unknown or not
  installed. This is a one-line change and the contract's seam table would need amending (`info`
  instead of `unknown`):
  ```
  old (wiring-check.mjs:268):
      if (gate.kind === "absent") return { state: "unknown", why: `${check.why} (${gateFile} does not exist - not installed on this host)` };
  new:
      if (gate.kind === "absent") return { state: "info", why: `${check.why} (unknown: ${gateFile} does not exist - the timer was never installed on this host)` };
  ```
  Then update the test that asserts `neverInstalled...state === "unknown"`, plus the header comment
  at lines 30-32. Predicted outcome: this host's `--line` goes silent and exits 0. It still goes red
  (`missing`) the moment installed.json exists without a log.
- (b) Keep `unknown` and amend the spec to accept that every uninstalled host is red. If so, delete
  the false "not red" comments at `wiring-check.mjs:32` and `:263`.

Either way, the code comments must match the behaviour.

## M1 MINOR: the header still says "Exit 0 always"

`scripts/wiring-check.mjs:44-46` still reads "Exit 0 always, except an unknown flag (usage error) - a
wiring check never fails its caller." `:455` says "the only non-zero exit this tool ever returns".
Both are now false.
```
old (45-46):
// unknown, and nothing at all when everything is ok/info. `--json` prints `{ ok, results }`. Exit 0
// always, except an unknown flag (usage error) - a wiring check never fails its caller.
new:
// unknown, and nothing at all when everything is ok/info. `--json` prints `{ ok, results }`. Exit 1
// when checkWiring().ok is false (any missing/stale/unknown) or on an unknown flag (usage error),
// else 0. `--hook` (the SessionStart caller) always exits 0. checkWiring() itself never throws.
old (455):
    return 1; // usage error - the only non-zero exit this tool ever returns
new:
    return 1; // usage error
```
Drop the `--hook` clause if B2 is resolved some other way.

## M2 MINOR: the `hook_present` pair reads the plugin's own shipped file, so it is close to true by construction

When the check runs as the plugin's SessionStart hook, `CLAUDE_PLUGIN_ROOT` points at the same install
whose `hooks/hooks.json` registered that hook. So `hook-delete-guard`/`hook-post-tool-use-inbox` can
only go red if that shipped file is edited or corrupted. When someone runs it by hand from a repo
checkout with no env set, the `path.dirname(HERE)` default (`wiring-check.mjs:345`) reads the
checkout's hooks.json, not the installed plugin's.

The check does not see the plugin being disabled, `disableAllHooks`, or a missing
`hooks/delete-guard.mjs`. Yet the `why` text (`required-wiring.default.json:74`) claims "if it is not
wired, nothing in this plugin catches an accidental rm -rf".

The J2 brief explicitly sanctioned this file choice, and the builder disclosed it (report §3), so this
is not a blocker.

Fix, cheap and in territory:
- Add two `file_exists` rows for `${CLAUDE_PLUGIN_ROOT}/hooks/delete-guard.mjs` and
  `${CLAUDE_PLUGIN_ROOT}/hooks/multi-inbox.js`, so a missing hook script goes red.
- Change the two `why` strings to say what is actually checked: "the plugin's own hooks/hooks.json
  still registers ...".

---

## Attack-brief items checked with nothing wrong found

- **Unreadable or invalid settings.** Tested on a scratch copy:
  - `~/.claude/settings.json` as `{not json`: `cross-session-inbound` reads `unknown`, reason "could
    not inspect required file evidence".
  - The same file at chmod 000: `unknown`.
  - hooks.json at chmod 000: `hook-delete-guard` reads `unknown`.
  - A JSONC `//` comment in hooks.json: `unknown`.
  - Never `ok` in any of these.
- **The seam contract's state table for `janitor-last-run`.** Measured on a scratch home:
  - No installed.json: `unknown` (never `missing`).
  - installed.json present, no log: `missing`.
  - Log 27 hours old: `stale`.
  - Fresh log: `ok`.
  - An unreadable installed.json (non-ENOENT): `unknown`, and the builder's test covers it.
  - This matches the contract's table exactly. The redness question is B3.
- **Caller audit.** The reviewer grepped all .mjs/.js/.json/.sh/.ps1/.md files outside docs/work and
  docs/specs. The callers are exactly the two the report lists: `hooks/hooks.json:18` (CLI) and
  `scripts/janitor.mjs:116,1485` (library, display only, inside try/catch). The only other mention is
  prose at docs/pane-setup.md:84. The report does list every caller. Its reading of the hook caller is
  wrong (B2).
- **`--json`/`--line`/table output.** `printLine`, `printJson` and `printTable` are not in the diff.
  Only the return value and the new rows change.
- **scripts/janitor.test.mjs.** Unmodified, and its embedded WIRING tests pass (inside the 134 passes
  above). janitor.mjs calls the library only, so the CLI exit code cannot reach it.
- **The existing checks.** The 9 original rows (7 switch/env_presence plus `flusher-heartbeat` and
  `lean-rules-file`) are untouched. The diff hunk only appends after the last row.
- **Shim path.** `~/.local/bin/note-send` matches `scripts/mirror-shared-skills.mjs:49` (`LOCAL_BIN`)
  and `:114-116` (the extensionless `sh` shim is generated on Windows too), so no `platforms` field is
  needed.
- **Cause fix or compensation.** The `requiresFile` gate and `whenMissing: "missing"` are genuine
  cause-level additions. They report the not-installed state instead of hiding it. The one place a
  state is silenced rather than reported is B1, where the substring match lets a broken hook read
  `ok`.

Cause: `hook_present` matches by substring and ignores the matcher, and the CLI's new exit code
reaches the SessionStart hook caller, where Claude Code discards the stdout of a non-zero exit.
Discriminating check: the scratch-copy probe above (five disabled or wrong-matcher variants all `ok`
before the patch and all `missing` after it), plus `node scripts/wiring-check.mjs --line; echo $?`,
which prints the line with exit 1 on this host.
Fix location: scripts/wiring-check.mjs:160-163, 210-227, 241, 268, 451, 475;
scripts/required-wiring.default.json:72-73, 81-82; hooks/hooks.json:18 (needs the lead to assign it);
scripts/wiring-check.test.mjs:790-806 and the shipped-list shape test.
Simplification: one exact `command` equality plus a `matcher` equality replaces substring guessing for
the shipped rows, and one `--hook` flag keeps the only hook caller on exit 0. No new check type is
needed.

Note: the reviewer brief names a reviewer state file. It was not written: this reviewer's only
permitted write is this report.
