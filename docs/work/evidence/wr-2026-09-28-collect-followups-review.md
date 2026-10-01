VERDICT: APPROVE 0523ec8

# Lane 33 (collect-followups-1), delta review round 2

Scope: `git diff 6cd4ec2..0523ec8` against review-r1.md and the lead's rulings. F1, F2, F4 and F5 are ruled in as written. For F3, exit 1 stays and the record amends the spec. F6 gets no change.

The commits after 0523ec8 (97c348b, 1a2fe5b, e6348b4) change only build-r1.md and the record. There is no script diff from 0523ec8 to HEAD.

I ran every experiment on fresh `git archive` exports of 573f04e and 0523ec8 in scratch `rv33-cdpC`. The worktree was read-only for me.

Gate: `node --test scripts/install-janitor-timer.test.mjs scripts/collect-from-origin.test.mjs scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs` gave 141 tests, 141 pass, 0 fail.

Cause: r1 found two Major test gaps, both from the named past bug class. First, nothing tied a `--stale-hours` value given to `main` to the unit or task or plist it writes, or to installed.json. Second, the `closed` grep test passed without finding anything. r1 also found two Minor items: F4, the flag silently ignored for janitor-record, and F5, K3 claiming more than the code does.
Discriminating check: I reran M1 through M7 and a new F4 mutant, M15, on fresh copies of 0523ec8. All 8 are now killed. The unmutated copy passes 115 of 115 on the three collect and installer files.
Fix location: scripts/install-janitor-timer.test.mjs:901-927 (the F1 test and the F4 assertion), scripts/collect-status.test.mjs:204-207 (F2), scripts/install-janitor-timer.mjs:578-580 (F4), docs/specs/collect-status-1/contracts.md:18 (F5).
Simplification: none needed. The production change is one 3-line refusal. Everything else is tests and docs.

## Prior findings, each verified

| r1 | Fix at 0523ec8 | Verified by |
|---|---|---|
| F1 Major | The review's test was appended verbatim (install-janitor-timer.test.mjs:914-927). | M4 (systemd), M5 (Windows XML), M6 (launchd) and M7 (installed.json hardcoded to 2) each fail exactly this test. |
| F2 Major | The block was replaced verbatim (collect-status.test.mjs:204-207). | M1 (`closed` dropped from NOTE_STATE_TOKENS) and M2 (the guard brought back behind a `// NOTE_STATE_TOKENS` comment) each fail the grep test. M3 (the `computeState` revert) still fails 2 tests. |
| F3 Minor | No code change. Record Log line 15 records the spec amendment: "exit 1, not 2". | Matches the lead's ruling. The bounds test still pins exit 1. |
| F4 Minor | The refusal was inserted verbatim at install-janitor-timer.mjs:578-580. The bounds test gains a case for the janitor job with `--stale-hours 3`: exit 1, the refusal text, and nothing written. | M15 (refusal removed) fails the bounds test. |
| F5 Minor | The K3 sentence was replaced with the review's exact wording (contracts.md:18). | I read the diff. The text is the proposed replacement, byte for byte. |
| F6 Nit | No change, per the ruling. | n/a |

## Regression hunt

- **Janitor bytes are still byte-identical to 573f04e.**
  - Generated from both trees: all 30 outputs, meaning argv, service, timer, Windows XML, plist and installed.json for 3 direct input sets, plus `main` dry-run and write on linux, win32 and darwin, each with no flags and with `--hour 9 --host hh --name custom`.
  - Result: `diff -r` showed them identical, and all 14 written files (UTF-16LE XML included) were identical after normalising the fixture path.
  - Independent check: when 0523ec8's `main` planned over the files 573f04e had written, all 14 janitor artifacts came back `unchanged`.
- The F4 refusal touches only the `janitor-record` job. None of the collect-job tests change, and the only new refusal path is the one M15 exercises.
- Live units untouched: `XDG_CONFIG_HOME` is unset here. The file timestamps in `~/.config/systemd/user` all predate this review; I read metadata only.

## New findings

### N1: Nit, non-blocking. If F4 regresses, the new janitor assertion would do a real install using the runner's environment

Evidence: scripts/install-janitor-timer.test.mjs:905. The call is `main(["--force-root", "--json", "--stale-hours", "3"], { home: janitorHome, platform: "linux", ... })`. It has no `--dry-run` and no `env`, so `env` falls back to `process.env`.

If the refusal ever regressed, the call would write janitor units under `process.env.XDG_CONFIG_HOME` whenever that is set. install-janitor-timer.mjs:775 decides the directory. This only matters for a run outside the sealed runner, which overrides it.

The same pattern already exists in this file, for example at :681, :690 and the bounds default case at :897. So this is not new risk in kind.

Fix: replace
`const janitorCode = main(["--force-root", "--json", "--stale-hours", "3"], { home: janitorHome, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...janitorCap });`
with
`const janitorCode = main(["--force-root", "--json", "--dry-run", "--stale-hours", "3"], { home: janitorHome, env: { XDG_CONFIG_HOME: path.join(janitorHome, ".config") }, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...janitorCap });`

Predicted outcome: the refusal still fires before any write and the assertions hold unchanged. M15 would still be killed, because a regressed dry-run returns 0, not 1.
