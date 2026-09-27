VERDICT: APPROVE 3707afac309d97dbf73ebe152ffaee27912085db

# C3 review, round 2 (delta re-review, collect-status-1)

Reviewed: `/home/ben/Code/wt-collect-status-1-C3`, HEAD `3707afac309d97dbf73ebe152ffaee27912085db`
(from my own `git rev-parse HEAD`). The range `d254f72..HEAD` is a single commit, `3707afa fix(C3): pin
collect-status-fresh row's exact K1 literals (review F1)`, touching 4 files. The only code change is
`scripts/continue-skill-lane-state.test.mjs` (+15). The other 3 files are the builder's own report, state
file and gate log. `scripts/required-wiring.default.json`, `skills/continue/SKILL.md` and
`scripts/wiring-check.test.mjs` are unchanged in this range. The worktree was clean before and after my
review (`git status --short` gave 0 lines). I changed nothing in the reviewed tree. All mutation checks
ran on scratch copies (a `git archive HEAD` extract and a `git clone`) in the session scratchpad.

## Prior findings

### F1 (MAJOR, the new row was pinned by no test): FIXED, confirmed

`scripts/continue-skill-lane-state.test.mjs:48-61` matches the round-1 patch exactly. It adds a
`WIRING_PATH` constant and one read-only test that:
- checks there is exactly one `collect-status-fresh` row;
- pins `type`, `file`, `maxAgeSeconds`, `whenMissing` and `requiresFile` to the contracts.md K1 literals;
- checks that the row's `file` is in the same directory as the SKILL.md `STATUS_MD_PATH`.

The test writes nothing to disk and creates no temp home, so it complies with contracts.md Process.

Mutation check. I re-ran the gate files (`wiring-check.test.mjs` and `continue-skill-lane-state.test.mjs`)
against each mutated copy of `required-wiring.default.json` on the scratch extract. The original file was
restored after each run, and `cmp` confirmed it matched at the end.

| Mutation of the row | Round 1 | Round 2 |
|---|---|---|
| `maxAgeSeconds` 2700 changed to 27000 | 62 pass, 0 fail | 62 pass, 1 fail |
| `requiresFile` changed to `~/.agents/collect/install.json` | 62 pass, 0 fail | 62 pass, 1 fail |
| `file` changed to `~/.agents/collect/status.json` | 62 pass, 0 fail | 62 pass, 1 fail |
| `id` changed to `collect-fresh` | 62 pass, 0 fail | 62 pass, 1 fail |
| `requiresFile` changed to the janitor's `~/.agents/janitor/installed.json` | 3 fail | 59 pass, 4 fail |

The reviewer brief's C3 question was whether `requiresFile` matches the collect job's own installed.json,
not the janitor's. Before this fix that was true only by eye. It is now asserted directly, by
`continue-skill-lane-state.test.mjs:59`.

### N1, N2 (MINOR, advisory or optional): no action taken, which is acceptable

The builder's report explains why both were left alone. N1 remains a spec/contract matter for the lead or
the seam review: the 2700 s bound conflicts with `--every` above 45. N2 was optional.

## Gates I re-ran

- Territory gate in the worktree: `node scripts/run-tests.mjs scripts/wiring-check.test.mjs
  scripts/continue-skill-lane-state.test.mjs` gave 63 tests, 63 pass, 0 fail. This matches the builder's
  `C3-gate.log` tail and my round-1 prediction.
- Full sealed suite, run in a scratch `git clone` at `3707afa`: 2308 tests, 2304 pass, 0 fail, 4 skipped,
  exit 0.
  - I first ran it in a `git archive` extract with an empty `git init`. That run had 1 failure:
    "CLI: real process, without --head, calls real git for the head sha". The cause was my empty scratch
    repo, which has no HEAD. The real clone passes that test, so the failure is not a finding.

## Regression hunt

- The delta touches no shipped JSON, skill or wiring-test file. It cannot drift any existing byte of the
  row, the SKILL.md paragraph or the pre-authorized count bump (still 18 at `wiring-check.test.mjs:732`,
  unchanged in this range).
- The new test and the two existing tests in the file share `STATUS_MD_PATH`. They do not conflict, since
  the directory check compares `.../claude-delegation`.
- None of the attack-brief items about shell, systemd, the envelope, double-wake, fetch failure or `--job`
  byte drift apply to C3 (JSON and markdown plus a read-only test).
- I found no new defects.

## C4 fields

Cause: The `collect-status-fresh` row in `scripts/required-wiring.default.json:135-144` was added with only
a list-length assertion. None of its K1 literals were pinned, so a drift in any of them shipped green.
Discriminating check: I applied four field mutations (maxAgeSeconds, requiresFile, file, id) to a scratch copy.
Round 1 went 62/62 green on all four. At 3707afa each mutation now gives 1 failure. The janitor-path
`requiresFile` mutation gives 4 failures.
Fix location: `scripts/continue-skill-lane-state.test.mjs:48-61` (new read-only field-pin test).
Simplification: One read-only test in the file C3 already owned. It adds no helper, no temp home, and no
edit to `wiring-check.test.mjs` beyond the pre-authorized count bump.
