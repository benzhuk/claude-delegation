VERDICT: PASS — 306 of 306 focused census and four-read tests pass

# Lane 40b final focused integration gate

- Tested SHA: `a0332e6fa693a592871361aecd6c18645018dca3`
- Worktree: `C:/Users/benzh/orca/workspaces/claude-delegation/census-reader-40b`
- Branch: `build/census-reader-40b`
- Completed: 2026-09-29 23:26:56 America/New_York
- Worktree status after gate: clean
- Source or test edits during this gate: none
- Full suite: not run
- Encoding mutant: not repeated; see `focused-report.md` for the prior 4/4 kill proof

## Command

The nonblocking Windows mutex `Global\claude-verify` was acquired.

```powershell
node --test scripts/build-census.codex.contract.test.mjs scripts/build-census.completeness.test.mjs scripts/build-census.test.mjs scripts/build-census.wake-split.test.mjs scripts/jsonl-lines.test.mjs scripts/token-census.test.mjs scripts/four-read.completeness.test.mjs scripts/four-read.test.mjs
```

## Exact result

```text
ℹ tests 306
ℹ suites 0
ℹ pass 306
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2739.9305
```

Named failures: none.

All lane 40b regression groups passed, including:

- literal U+2028/U+2029 through Codex, Claude lead, Claude subagent, and token-census production readers;
- LF/CRLF framing, decoded chunk boundaries, final remainder, blank rows, stream errors, early exit, and byte-chunk rejection;
- completed pre-window exclusion with and without usage;
- incomplete pre-window retention as PARTIAL;
- overlapping and open-mode completion with benign trailing rows;
- finite-start, exact-boundary, latest-task, repeated-id, invalid-restart, and segment-merge rules;
- corruption, conflicting evidence, and unsupported `item_completed` witnesses remaining PARTIAL;
- existing build-census completeness, wake-split, token-census, four-read completeness, and four-read contracts.

The command emitted this expected stderr from the four-read unresolvable-ref fixture:

```text
fatal: ambiguous argument 'not-a-real-ref..0123456': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'
```

Its associated test passed (`computeReworkAfterAcceptance: an unresolvable git ref fails closed as unavailable, not a thrown error`), and the process exited 0.

