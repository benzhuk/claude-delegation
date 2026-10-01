VERDICT: PASS

# J2 builder report, round 2 (wr-2026-09-27-janitor-daily)

Worktree: /home/ben/Code/claude-delegation-wt/wt-janitor-daily-1-J2, branch build/janitor-daily-1-J2.
HEAD after this round: `ea3d8eee82f1841ab716a077391c5050f629864f` (one commit, `git rev-parse HEAD`
run in the worktree after the last commit).

GOAL line served: "a build goes spec to accepted through the plugin ... census beats the hand-run
build on all four measures" — this round closes the gap between what the wiring check claims (a
substring "wired" check, a red SessionStart hook, a red uninstalled host) and what it actually does,
so the janitor's own wiring signal is trustworthy without a person re-deriving it by hand. Nearest
NOT: "a rule no script checks" — every fix below is enforced by a new or tightened test, not a
comment.

This round applies every finding from
`docs/specs/janitor-daily-1/reports/J2-review-r1.md` (2 BLOCKER, 1 MAJOR, 2 MINOR). All five are
fixed in one commit.

## B1 (BLOCKER) — hook_present was a raw substring match

Fixed. `hook_present`/`hook_absent` now accept an optional exact `command` string and an optional
`matcher` string, alongside the existing `substring` (kept for any other caller). `hasValidDefinition`
(`scripts/wiring-check.mjs:158-166`), `inspectHookGroup` (`:212-241`, now takes `command`/`matcher`
params, `continue`s past a hook-group entry whose `matcher` doesn't match the pin, and compares
`h.command.trim() === command` when a `command` pin is set instead of `.includes(substring)`), and
`evalHookPresence` (`:253`, passes both through) all changed per the reviewer's patch.

The two shipped rows (`scripts/required-wiring.default.json`) now read:
```json
{
  "id": "hook-delete-guard",
  "type": "hook_present",
  "file": "${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json",
  "event": "PreToolUse",
  "matcher": "Bash|PowerShell",
  "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/delete-guard.mjs\"",
  ...
}
```
```json
{
  "id": "hook-post-tool-use-inbox",
  "type": "hook_present",
  "file": "${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json",
  "event": "PostToolUse",
  "matcher": "*",
  "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/multi-inbox.js\" PostToolUse",
  ...
}
```
Both pins are copied verbatim from `hooks/hooks.json`'s own `PreToolUse`/`Bash|PowerShell` entry and
`PostToolUse`/`*` entry.

Test: `scripts/wiring-check.test.mjs` — "hook-delete-guard's exact command+matcher pin does not match
a commented-out, echoed, disabled, renamed-file or wrong-matcher hook" now drives all five of the
reviewer's probes plus the real command and a genuinely different command through fixtures built from
`shippedRow("hook-delete-guard")` itself (not a hand-copied duplicate), asserting `missing` for every
bypass attempt and `ok` only for the real thing.

## B2 (BLOCKER) — SessionStart's `--line` now failed the hook on every session that has anything to say

Fixed with the reviewer's `--hook` flag. `main()`'s known-flags set now includes `--hook`
(`wiring-check.mjs:463`); `main()` returns 0 unconditionally when `--hook` is present, before the
`result.ok ? 0 : 1` line (`:487-490`). `hooks/hooks.json:18`'s SessionStart command is now:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/wiring-check.mjs" --line --hook
```
Bare `--line`/`--json`/table still exit 1 on red, per the brief's own line ("J3's paragraph tells
operators to run `node scripts/wiring-check.mjs --line` and report the exit code").

**Territory note**: `hooks/hooks.json` is not in any territory's map (contracts.md's map lists only
`scripts/wiring-check.mjs`, `scripts/required-wiring.default.json`, their tests, and the wiring
section of docs for J2). The reviewer's own fix instruction says "the lead must assign line 18 to J2
... or apply it themselves" and names J2 as "the natural owner, since this is its only CLI caller."
Absent any lead ruling reaching me this round, and given the brief's directive to apply every
reviewer-verified finding in one round, I applied the one-line flag addition at hooks.json:18 myself.
Flagging this plainly rather than leaving the fix half-applied (a fixed CLI with an unfixed caller
would still be broken in production).

Live verification on this host, verbatim:
```
$ node scripts/wiring-check.mjs --line --hook
$ echo $?
0
```
(prints nothing here because, after the B3 fix below, nothing is flagged on this host at all; a
second CLI test drives `--line --hook` against a fixture with a real finding and confirms the line
still prints while the exit code stays 0.)

Tests: `scripts/wiring-check.test.mjs` — two new CLI tests (`--line --hook` with a finding present,
exit 0, line printed; `--line --hook` against a bare scratch home, exit 0, line printed) plus the
hooks.json shape test tightened to require `--hook` in the SessionStart command.

## B3 (MAJOR, lead ruling requested by the reviewer) — an uninstalled J1 was red every session

The reviewer offered two options and marked (a) "Recommended." No lead ruling on this reached me
before or during this round. Per the brief's instruction to apply every reviewer-verified finding in
one round, and because option (a) is the one that actually satisfies spec.md J2.2's explicit "not
red" requirement (the exact defect the reviewer's own evidence demonstrates), I applied (a):

`evalFileFresh`'s `requiresFile`-absent branch (`wiring-check.mjs:283-290`) now returns
`{ state: "info", why: "... (unknown: <gateFile> does not exist - the timer was never installed on
this host)" }` instead of `state: "unknown"`. `info` is never counted against `checkWiring().ok`
(see the `ok` computation, unchanged, at `checkWiring()`'s `results.every(...)` line), so a host
without J1 installed is no longer red for that reason alone. The wording still says "unknown" in the
`why` text because installed-or-not genuinely isn't knowable from this file alone — only the *state*
name changed, not the honesty of the message.

Live verification, before and after, on this real, unmodified host (no J1 timer installed here):
```
before (round 1):
$ node scripts/wiring-check.mjs --line
wiring: 1 flagged (janitor last run). Run wiring-check for the fixes.
$ echo $?
1

after (this round):
$ node scripts/wiring-check.mjs --line
$ echo $?
0
```
The full table's `janitor-last-run` row now reads:
```
janitor-last-run  |  info  |  the daily janitor timer's own log proves it actually ran in the last 26 hours; a stale or absent log after install means the schedule stopped firing (unknown: /home/ben/.agents/janitor/installed.json does not exist - the timer was never installed on this host)
```
This is the "info" line the reviewer predicted, and matches the report from J2 round 1's own live run
(`wiring: 1 flagged`), now silent, matching spec.md J2.2.

If the lead prefers option (b) instead (keep `unknown`, amend the spec to accept every uninstalled
host being red), that is a one-line revert of the `state: "info"` branch plus reverting the matching
test assertion — flagged in the state file as the one open decision this round rests on.

Test: `scripts/wiring-check.test.mjs`'s seam-table test now asserts `state === "info"` for the
never-installed case and `neverInstalled.ok === true`.

## M1 (MINOR) — stale "exit 0 always" comments

Fixed both: the file-header CLI comment (`wiring-check.mjs:44-47`) and the usage-error return
comment (`:487`, was "the only non-zero exit this tool ever returns" — no longer true once
`checkWiring().ok` can also drive a non-zero exit).

## M2 (MINOR) — hook_present checks were close to true by construction; `why` text overclaimed

Added two `file_exists` checks in `required-wiring.default.json`:
```json
{
  "id": "hook-delete-guard-script",
  "type": "file_exists",
  "file": "${CLAUDE_PLUGIN_ROOT}/hooks/delete-guard.mjs",
  "why": "the PreToolUse delete-guard hook registration is useless if the script it runs is missing",
  "fix": "reinstall or repair the plugin so hooks/delete-guard.mjs is present at its install root"
},
{
  "id": "hook-post-tool-use-inbox-script",
  "type": "file_exists",
  "file": "${CLAUDE_PLUGIN_ROOT}/hooks/multi-inbox.js",
  "why": "the PostToolUse multi-inbox hook registration is useless if the script it runs is missing",
  "fix": "reinstall or repair the plugin so hooks/multi-inbox.js is present at its install root"
}
```
Rewrote both `hook_present` rows' `why` text to say what is actually checked ("the plugin's own
hooks/hooks.json still registers ...") instead of implying the guard's own behaviour is verified.
The reviewer's other caveats (doesn't see `disableAllHooks`, plugin-disabled state, or a live host's
`CLAUDE_PLUGIN_ROOT` env unset at repo-checkout time) remain true and out of scope for a cheap fix —
not addressed further this round, matching the reviewer's own "not a blocker" framing.

## Gate

`node scripts/run-tests.mjs scripts/wiring-check.test.mjs scripts/janitor.test.mjs`:
138 tests, 136 pass, 0 fail, 2 skipped (same pre-existing skips as round 1). Full log at
`docs/specs/janitor-daily-1/reports/J2-gate.log`.

## Files changed this round

- `scripts/wiring-check.mjs` — hook_present exact command/matcher, `--hook` flag, B3 info fix, M1
  comment fixes.
- `scripts/required-wiring.default.json` — exact command/matcher on the two hook_present rows, two
  new file_exists rows, corrected why text (list now 17 rows: 9 original + 8 new).
- `scripts/wiring-check.test.mjs` — rewrote the hook_present bypass test to cover all 5 reviewer
  probes plus the real/different-command cases; updated the shape test for the new field names and
  two new rows; flipped the seam-table's never-installed assertion to `info`; added two `--hook` CLI
  tests; tightened the hooks.json shape test to require `--hook`.
- `hooks/hooks.json:18` — added `--hook` to the SessionStart command (territory note above).
- `README.md` — wiring bullet rewritten to describe `--hook`, the exact command/matcher pins, the
  new file_exists checks, and the `info` (not `missing`) state for an uninstalled J1.

## Deviations from the round-1 report

None beyond the hooks.json territory note above (B2) and the B3 judgment call (applying the
reviewer's Recommended option (a) absent a reaching lead ruling). Both are called out explicitly in
the state file's "Open questions" section for the lead's attention.
