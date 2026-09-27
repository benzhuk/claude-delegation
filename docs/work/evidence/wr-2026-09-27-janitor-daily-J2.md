VERDICT: APPROVE ea3d8eee82f1841ab716a077391c5050f629864f

# J2 review, round 2 (wr-2026-09-27-janitor-daily)

Worktree: /home/ben/Code/claude-delegation-wt/wt-janitor-daily-1-J2, branch build/janitor-daily-1-J2.
HEAD (`git rev-parse HEAD`, run by the reviewer): ea3d8eee82f1841ab716a077391c5050f629864f.
Range reviewed: b506977d9a8b2c832fea5d431919646d412db829..HEAD, one commit (ea3d8ee). It touches
scripts/wiring-check.mjs, scripts/required-wiring.default.json, scripts/wiring-check.test.mjs,
README.md (the Wiring check bullet only) and hooks/hooks.json:18. The worktree is clean.

Tally: 0 BLOCKER, 0 MAJOR, 0 MINOR. Two lead actions (not defects in the code) and two NITs follow.

## Gate reproduced

- `node scripts/run-tests.mjs scripts/wiring-check.test.mjs scripts/janitor.test.mjs`: tests 138,
  pass 136, fail 0, skipped 2. This matches J2-gate.log.
- The reviewer also ran the other suites that read hooks/hooks.json, because this round edits that
  file: skills/multi/scripts/hooks.test.mjs, hooks/multi-inbox.test.mjs and
  scripts/native-package.test.mjs, together with the gate. Result: 182 tests, 180 pass, 0 fail,
  2 skipped. hooks/codex-hooks.json does not reference wiring-check, so the codex-hook-trust hashes
  are unaffected.

## Prior findings, verified one by one

### B1 (hook_present substring match): FIXED

`inspectHookGroup` (wiring-check.mjs:221-247) now skips any group whose `matcher` differs from a
pinned `matcher`, and compares `h.command.trim() === command` when a `command` pin is set. Both
shipped rows (required-wiring.default.json:69-87) pin the exact strings used in hooks/hooks.json.

The reviewer ran the shipped `hook-delete-guard` row against scratch pluginRoot fixtures through
`checkWiring`. Measured results:
```
real                   ok
realTrailingSpace      ok
shellComment           missing
echo                   missing
disabled (true ||)     missing
bak                    missing
wrongMatcher (Read)    missing
noMatcher              missing
real under Read + real under Bash|PowerShell   ok
jsonc                  unknown
```
Every bypass from round 1 now reads `missing`. A JSONC file still reads `unknown`.

Mutation check, on a scratch `git archive` copy and never the worktree: removing the matcher
`continue` makes 1 test fail, and replacing the exact `===` with `includes(command)` makes 1 test
fail. The rewritten test at wiring-check.test.mjs:801 is real: it builds its fixtures from the
shipped row, not from a copied duplicate.

### B2 (the SessionStart `--line` exit dropped stdout): FIXED

- `--hook` is in the known-flag set (wiring-check.mjs:471), and `main()` returns 0 when `--hook` is
  present (:498). hooks/hooks.json:18 now runs `... wiring-check.mjs" --line --hook`.
- Measured on an empty scratch HOME:
  - `--line`: prints `wiring: 4 flagged (...)`, rc=1.
  - `--line --hook`: prints the same line, rc=0.
  - `--json`: rc=1.
  - `--hook` alone: table, rc=0.
  - `--hook --bogus`: usage error, rc=1.
- On this real host, `--line`, `--line --hook` and the table all give rc=0 with no line printed.
- Mutation check: removing the `--hook` return makes 2 tests fail.
- The hooks.json shape test now requires `--hook` (wiring-check.test.mjs:1252).

### B3 (a host without J1 installed was red): FIXED in code, lead ruling still needed (see L1)

- The not-installed branch of `evalFileFresh` (wiring-check.mjs:288) returns `info`. Its reason text
  says "unknown: <installed.json> does not exist - the timer was never installed on this host". That
  reports the state honestly and does not show a confident number.
- Measured state table on a scratch home:
  - No installed.json: `info`, ok=true.
  - installed.json present, no log: `missing`, ok=false.
  - Log 27 hours old: `stale`, ok=false.
  - Fresh log: `ok`, ok=true.
- The header comments at :32-37 and :279-284 now match this behaviour.
- Mutation check: going back to `unknown` makes 1 test fail.

### M1 (the "Exit 0 always" header): FIXED

The comments at wiring-check.mjs:49-52 and :475 are accurate.

### M2 (hook_present was true by construction): FIXED

- The `hook-delete-guard-script` and `hook-post-tool-use-inbox-script` `file_exists` rows exist.
- The `why` text of both hook_present rows now says "the plugin's own hooks/hooks.json still
  registers ...".
- The live host run gives rc=0, so both new rows resolve `${CLAUDE_PLUGIN_ROOT}` correctly and read
  `ok`.

## Lead actions (these are not code defects, so they are not counted in the verdict)

L1. contracts.md still pins `installed.json absent: state unknown` at line 35, and briefs/J2.md:6
says the same. The code now returns `info`, which is the round-1 option (a) and matches spec.md
J2.2 ("not red"). The builder applied it without a lead ruling and disclosed that. To match the
code, amend contracts.md:35:
```
old:   - `installed.json` absent: state `unknown`, never `missing`.
new:   - `installed.json` absent: state `info` (reason text says unknown / never installed), never `missing`, never counted against `ok`.
```
If the lead picks option (b) instead, the revert is wiring-check.mjs:288 (`"info"` back to
`"unknown"`), the assertion at wiring-check.test.mjs:874-875, and the README bullet's last clause.
The seam reviewer should confirm that J1's and J3's text does not promise `unknown`.

L2. hooks/hooks.json:18 is outside every territory's map. The builder edited it and disclosed that
in report §B2. The one-line change is exactly the round-1 Patch C, and it is covered by the tightened
shape test. The lead should ratify it at integration.

## NITs (optional, not counted)

N1. A command pin does not check `h.type`. A hook entry with `type: "prompt"` that carries the exact
command string reads `ok`; the reviewer measured this. The hooks.json file is not hand-written, so
this is marginal. Patch, if wanted, at wiring-check.mjs, the `hit` line:
```
old:      const hit = typeof command === "string" ? h.command.trim() === command : h.command.includes(substring);
new:      const hit = typeof command === "string" ? h.type === "command" && h.command.trim() === command : h.command.includes(substring);
```
Predicted outcome: the existing tests still pass, because every command-pin fixture uses
`type: "command"`.

N2. The `missing` reason for a command pin still says `contains "<command>"` (wiring-check.mjs:264).
For an exact pin, "runs exactly" would be more accurate. This is wording only.

## Attack-brief items rechecked with nothing wrong found

- **Commented-out or different-command hook:** reads `missing`, as in the probe table above.
- **Invalid or unreadable settings:** JSONC reads `unknown`. The round-1 chmod and invalid-JSON
  probes cover paths this round does not touch.
- **Caller audit:** a fresh grep outside docs/ finds only hooks/hooks.json:18 (CLI, now `--hook`)
  and scripts/janitor.mjs (library only). README.md:158-166 now describes `--hook` correctly.
- **Output text:** `printLine`, `printJson` and `printTable` are unchanged in this round.
- **janitor.test.mjs:** its embedded WIRING caller passes inside the gate.
- **Cause or compensation:**
  - `--hook` is scoped to the one caller whose runtime discards stdout on a non-zero exit. The bare
    CLI stays red, so this is a cause fix and does not hide a symptom.
  - The `info` gate reports its uncertainty in its reason text instead of dropping it.

Cause: in round 1, hook_present matched by substring and ignored the matcher, the CLI's non-zero
exit reached a SessionStart hook caller whose stdout Claude Code discards on a non-zero exit, and a
host without J1 installed read `unknown`, which counted against ok.
Discriminating check: the scratch probe table above (five bypass variants now `missing`, the real
hook `ok`), `--line` vs `--line --hook` on an empty HOME (rc 1 vs 0, same line), and four mutations
on a scratch copy, each of which turns the suite red.
Fix location: scripts/wiring-check.mjs:166-174, 221-247, 259, 288, 471, 498;
scripts/required-wiring.default.json:69-101; hooks/hooks.json:18; scripts/wiring-check.test.mjs:730,
801, 870, 990-1003, 1252.
Simplification: an exact command and matcher equality replaces substring guessing, and a single
`--hook` flag keeps the only hook caller at exit 0. No new check type was added.

Note: this reviewer did not write the reviewer state file the brief names. This report is the only
write the reviewer is permitted.
