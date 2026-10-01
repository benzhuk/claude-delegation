Territory: J2 — scripts/wiring-check.mjs, scripts/required-wiring.default.json, their tests, the
wiring section of README.md. Round 2 also touched hooks/hooks.json:18 (not in any territory's
map; applied per reviewer's explicit fix since J2 is the CLI's only caller — see report).
Worktree: wt-janitor-daily-1-J2, branch build/janitor-daily-1-J2, HEAD
ea3d8eee82f1841ab716a077391c5050f629864f.

Contracts I rely on:
- contracts.md J2 rulings: CLI exits 1 when checkWiring().ok is false; unreadable/invalid-JSON
  settings file is always `unknown`, never `ok`; hook_present must match a real parsed command
  string, never raw text (round 2: this now means an exact `command` pin, not a substring, for
  the two shipped rows).
- contracts.md J1/J2 seam table for `janitor-last-run`, amended in round 2 per spec.md J2.2 ("not
  red" for an uninstalled J1): `installed.json` absent -> `info` (was `unknown`), never counted
  against `ok`. Present + log absent -> `missing`. Log >26h -> `stale`. Else `ok`. Unchanged.

Done (round 2, all committed at ea3d8ee):
- B1 (BLOCKER): hook_present/hook_absent gained an optional exact `command` + `matcher` pin
  (wiring-check.mjs: hasValidDefinition, inspectHookGroup, evalHookPresence). The two shipped
  hook_present rows (hook-delete-guard, hook-post-tool-use-inbox) now pin the real command string
  and matcher instead of a substring. New test covers all 5 reviewer-probed bypasses (commented,
  echoed, true||-disabled, renamed .bak, wrong matcher) plus the real command and a genuinely
  different command - all read the correct state.
- B2 (BLOCKER): added `--hook` CLI flag, always exits 0 (wiring-check.mjs main()). Changed
  hooks/hooks.json:18's SessionStart command to `--line --hook` (outside J2's map; applied here
  per the reviewer's own "assign to J2 or apply it" instruction, since J2 is this CLI's only
  caller - flagging this territory note explicitly). Bare `--line`/`--json`/table still exit 1 on
  red. Two new CLI tests confirm `--line --hook` exits 0 both when red and when clean; the
  hooks.json test now asserts `--hook` is present.
- B3 (MAJOR, lead ruling needed - applied reviewer's Recommended option (a), absent an explicit
  lead override): `file_fresh`'s `requiresFile` gate now reports `info` (not `unknown`) when the
  gated file is absent, so an uninstalled J1 timer is never red. Live-verified on this host:
  `wiring-check.mjs --line` now prints nothing and exits 0 (previously "1 flagged" / exit 1).
- M1 (MINOR): fixed the two stale "exit 0 always" comments.
- M2 (MINOR): added two new file_exists checks (hook-delete-guard-script,
  hook-post-tool-use-inbox-script) for the hook scripts themselves; corrected both hook_present
  `why` strings to describe the actual check (registration in hooks.json, not guard behaviour).
- Gate: 138 tests, 136 pass, 0 fail, 2 skipped (same pre-existing skips as round 1).

Next: none pending for J2. If a lead wants B3's option (b) instead (keep `unknown`, amend the
spec), that is a one-line revert of the requiresFile-absent branch plus the matching test/comment.

Open questions: hooks/hooks.json ownership for line 18 - still not in any territory's map; J2
applied the one-line flag addition there this round since it is the CLI's sole caller, per the
reviewer's own instruction. Flag for the lead if a different owner is preferred going forward.

How to run my gate:
  node scripts/run-tests.mjs scripts/wiring-check.test.mjs scripts/janitor.test.mjs
Last run: 138 tests, 136 pass, 0 fail, 2 skipped.
