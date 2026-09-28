VERDICT: APPROVE a960c36

# Lane 42, stale-session guard: delta review r2

This review covers the fix-round delta, `git diff aeb7f76 a960c36`. The commits above a960c36 (8fde1c8, 593759a) touch only docs; `git diff a960c36 HEAD -- hooks scripts` is empty. Reviewed 2026-09-28, about 17:12 America/New_York. The reviewed worktree was left untouched (`git status --short` was empty throughout). I ran every mutation and live check on `git archive a960c36` copies under `scratchpad/lane-42/rev-r2-osQI/`.

Cause: a session keeps the hooks of the plugin version directory it started on. Round 1 found the refuse gate untested, a symlinked HOME that blinded the check, a log that could not tell a refusal from an observe-only deny, a red exit with no reason shown in `--json` and table modes, and a misplaced census section.
Discriminating check: I reverted each code fix on a scratch copy and the new test for it failed; each unmutated copy passes. Details below.
Fix location: hooks/agent-dispatch-guard.mjs:643; scripts/plugin-staleness.mjs:83-84; scripts/wiring-check.mjs:508-521; docs/census.md tail; new tests in the three test files.
Simplification: none of the fixes adds a mechanism. They are one extra realpath, one extra log field, two extra print calls and a moved census section.

## Gates

- `node --test scripts/plugin-staleness.test.mjs hooks/agent-dispatch-guard.test.mjs scripts/wiring-check.test.mjs` at HEAD 593759a (code identical to a960c36): 220 tests, 220 pass, 0 fail, 0 skipped.

## Each r1 finding, verified

### MAJOR 1: the CLI refuse gate has a test (FIXED)

The test was added verbatim at hooks/agent-dispatch-guard.test.mjs:1381-1403, with the MINOR 3 assert.

My own revert check: on the scratch copy `mutA`, I changed hooks/agent-dispatch-guard.mjs:652 to `const denyWins = result.enforced && result.action === 'deny';` and ran `node --test hooks/agent-dispatch-guard.test.mjs`:
```
✖ R0-stale CLI: a stale cache copy prints permissionDecision deny WITHOUT the enforce file, and logs R0-stale
ℹ pass 119
ℹ fail 1
```
The unmutated copy passes the same file. The gate can no longer turn observe-only without the suite noticing.

### MINOR 2: a symlinked HOME no longer blinds the check (FIXED)

scripts/plugin-staleness.mjs:83-84 now realpaths the cache dir, with a fallback to the unresolved path. The test is at plugin-staleness.test.mjs:229-240 and uses a junction on win32.

My own revert check: on the scratch copy `mutB`, I deleted the realpath line. The new test failed (`pass 26, fail 1`); the unmutated copy passes 27/27.

My own linkhome live check (`linkhome -> home`, a960c36 tree at 0.20.9 and at 0.20.16, manifest naming 0.20.16):
- Guard, `HOME=linkhome`, script at 0.20.9 through the real path: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",...}`, exit 0. At r1 this printed nothing.
- Guard, `HOME=linkhome`, script at 0.20.16: prints nothing, exit 0. No false deny.
- wiring-check `--line --hook` run through the link at 0.20.9: the `wiring:` line plus the `stale session: this session loaded delegation hooks 0.20.9, but 0.20.16 is installed, ...` line, exit 0. At r1 the stale line was missing.
- Through the link at 0.20.16: the `wiring:` line only, exit 0.

Regression hunt on the second realpath:
- If the realpath throws, the unresolved path is kept, and the result is still a pass or a correct match.
- The version still comes only from the real directory name, three segments under the real cache.
- Each session reads only its own `<pluginsDir>/installed_plugins.json`, so two config dirs sharing one symlinked cache cannot cross-deny.

I found no new path to a false deny.

### MINOR 3: `hard_deny` is in the log (FIXED)

hooks/agent-dispatch-guard.mjs:643. Live log lines from the scratch run:
```
{"at":"2026-09-28T21:10:04.246Z","session":"r2sess01","tool":"Agent","from_subagent":false,"subagent_type":"builder","model":"sonnet","rules":["R0-stale"],"action":"deny","enforced":false,"hard_deny":true}
{"at":"2026-09-28T21:10:04.286Z","session":"r2sess01","tool":"Agent","from_subagent":false,"subagent_type":"builder","model":"sonnet","rules":[],"action":"allow","enforced":false}
```
The field appears only on the R0 deny; every other line is unchanged.

### MINOR 4: a red exit now shows its reason (FIXED)

I ran scripts/wiring-check.mjs from the a960c36 cache copies against the scratch HOME. The `json` column comes from `JSON.parse` of stdout.

| run | exit | stdout stale lines | stderr lines | stdout is JSON |
|---|---|---|---|---|
| 0.20.9 `--line --hook` | 0 | 1 (2 lines total) | 0 | n/a |
| 0.20.9 `--line` | 1 | 1 | 0 | n/a |
| 0.20.9 `--json` | 1 | 0 | 1 (the stale line) | yes |
| 0.20.9 `--json --hook` | 0 | 0 | 1 | yes |
| 0.20.9 `--line --json --hook` | 0 | 0 | 1 | yes |
| 0.20.9 `--hook` | 0 | 1 | 0 | n/a |
| 0.20.9 (table) | 1 | 1 | 0 | n/a |
| 0.20.16 every mode above | as before | 0 | 0 | yes for `--json` |

The `--json` stdout is byte-identical between aeb7f76 and a960c36 once the `at` timestamp is masked, so the JSON contract is unchanged. `--hook` exits 0 in every combination and adds at most one line. ws-off still silences `--line`: `--line --hook` printed 0 lines with exit 0. As before this lane, ws-off does not silence the table or `--json`.

### NIT 5: census placement (FIXED)

`## Counted markers` now comes after the Codex paragraph, at the true end of docs/census.md. The entry is one line and names `stale session:`, `R0-stale` and `hard_deny: true`.

## Non-blocking note (no fix required)

scripts/wiring-check.mjs:523-525: the J2 comment still says "`--json`/`--line`/table output shapes are unchanged", but a stale session now adds one line to the table, and one to stderr under `--json`. If anyone touches that comment again, it could say "unchanged except the stale-session line (P7, review-r1 MINOR 4)". This does not affect behaviour.

## Carried forward from r1 (outside this lane)

This item is unchanged and not counted in this verdict. The pre-existing `isMain` check at hooks/agent-dispatch-guard.mjs:697 and hooks/delete-guard.mjs:510 does not realpath `argv[1]`. A guard invoked through a symlinked path therefore does nothing at all. It needs a follow-up lane.
