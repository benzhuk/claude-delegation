VERDICT: APPROVE a8e0bb578e2f84cd034720cbf38c2ec74fc43800

# Seam review, round 3: J1/J2 seam (wr-2026-09-27-janitor-daily)

- Integration worktree: /home/ben/Code/claude-delegation-wt/janitor-daily-base, branch build/janitor-daily-1.
- HEAD: `git rev-parse HEAD` returned `a8e0bb578e2f84cd034720cbf38c2ec74fc43800`.
- Range: `git log --oneline 162d2b34ac26e2a61866c677e3757e5056228ffc..HEAD` lists one commit, `a8e0bb5 fix(janitor-daily-1-seam): correct systemctl command in wiring-check fix text (n1)`. It changes one line in scripts/required-wiring.default.json.
- This is a delta re-review. I checked the round-2 fix, re-ran the three seam claims live in a scratch home, and looked for regressions.
- Scratch home: `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/seam-r3/` (`home/`, `xdg/` as XDG_CONFIG_HOME, `repo/` from `git init`). In the output below, `<S>` stands for that path.
- The worktree's `git status --short` was the same before and after: only the untracked briefs/ and reports/.

## Reviewer incident (disclosed; the real home is back to its prior state except for one empty directory)

While checking the installer's flags, I ran `node scripts/install-janitor-timer.mjs --help` in the worktree with no HOME override. The installer does not recognise `--help`. It treated the call as a plain install, with no `--enable`, against the real home. It printed:
```
install (systemd-user, name=janitor-record, hour=6, repo=/home/ben/Code/claude-delegation)
  created: /home/ben/.config/systemd/user/janitor-record.service
  created: /home/ben/.config/systemd/user/janitor-record.timer
  created: /home/ben/.agents/janitor/installed.json
```
- `created` means none of the three files existed before (planWrite, install-janitor-timer.mjs:301).
- Without `--enable`, no systemctl command ran. `systemctl --user list-timers janitor-record.timer`, run just before, printed `0 timers listed.`
- To undo it, I previewed the removal with `--remove --dry-run`, which listed exactly those three files as `would-remove`. I then ran `node scripts/install-janitor-timer.mjs --remove` as a separate command, and it printed `removed:` for all three.
- Checked afterwards:
  - `ls /home/ben/.config/systemd/user/ | grep -ci janitor` gives `0`.
  - `systemctl --user list-timers --all` and `list-unit-files` show no janitor unit.
  - `/home/ben/.agents/janitor/` is now an **empty directory** (mtime 09:48). I believe my run created it, but I cannot prove it did not exist before. I left it in place rather than delete a directory, so the owner can decide. It does not affect J2's check, which keys on installed.json.
- Not a finding against the code. `--help` falling through to a live install is J1's own ergonomics, which is outside this seam's scope. The orchestrator may want to pass it to J1 as a follow-up, not as a blocker here.

## Prior finding: fix verification

### n1 (MINOR, `systemd --user list-timers` is not a real command): CLOSED
- Command: `grep -rn "systemd --user list-timers" scripts/ README.md skills/ docs/specs/janitor-daily-1/*.md; echo "grep-old exit=$?"` printed `grep-old exit=1`, so the wrong text no longer appears anywhere.
- scripts/required-wiring.default.json:133 now reads `"fix": "check the host's own scheduler first (systemctl --user list-timers janitor-record.timer, the Windows task janitor-record, or the launchd agent) ..."`.
- The command now works. `systemctl --user list-timers janitor-record.timer --no-pager` printed `0 timers listed.` with `exit=0`.
- The JSON is still valid: parsing it with `JSON.parse` printed `json ok`.
- No test asserts this string. `grep -rn "list-timers" scripts/*.test.mjs` returned exit 1.
- The live wiring-check output below shows the corrected `fix` text in all states.

## Seam claims, re-verified live at a8e0bb5

- **Claim 1: installed.json shape. HOLDS.** `cat -A` gives:
  `{"schema":1,"repo":"<S>/repo","node":"/home/ben/.local/share/fnm/node-versions/v24.18.0/installation/bin/node","hour":6,"scheduler":"systemd-user","name":"janitor-record"}$`
  The key check printed `schema,repo,node,hour,scheduler,name true true true`: the keys are in the pinned order, `hour` is an integer, and `repo` and `node` are absolute paths.
- **Claim 2: the scheduled command. HOLDS.** The generated line is:
  `ExecStart=/home/ben/.local/share/fnm/node-versions/v24.18.0/installation/bin/node /home/ben/Code/claude-delegation-wt/janitor-daily-base/scripts/janitor.mjs --record --repo <S>/repo --host zhuk-vps32`
  `grep -c -- '--apply'` returned `:0` for the .timer, the .service and installed.json.
- **Claim 3: the four `file_fresh` states. HOLDS** under the amended contract (contracts.md:35, `info` when installed.json is absent). These are the `janitor-last-run` rows from `wiring-check.mjs --json`, with `why` cut to its last 140 characters:
  ```
  == state A: nothing installed
  {"state":"info","why":"... (unknown: <S>/home/.agents/janitor/installed.json does not exist - the timer was never installed on this host)", ...}
  == state B: installed, no log
  {"state":"missing","why":"... (<S>/home/.agents/janitor/last-run.log has never been created)", ...}
  == state C: fresh log
  {"state":"ok", ...}
  == state D: 27h log
  {"state":"stale","why":"... (last touched 97200s ago, max 93600s)", ...}
  == state E: 25h59m log
  {"state":"ok", ...}
  == state F: installed.json absent (after real --remove), stale log present
  {"state":"info","why":"... (unknown: <S>/home/.agents/janitor/installed.json does not exist - the timer was never installed on this host)", ...}
  ```
- Suite: `node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs scripts/wiring-check.test.mjs scripts/janitor.test.mjs` gave `tests 163, pass 161, fail 0, skipped 2`, the same as round 2.

## Verified absence of defects (first-class)
- The only code change in range is one token in a `fix` string. No state, exit code, path, key order or scheduled command changed, and all six live rows above match round 2's states.
- The seam holds: all four states are verified, with the output quoted above.

Cause: n1 (round 2): the m1 fix text said `systemd` where it should have said `systemctl`, so it named a command that does not exist.
Discriminating check: `grep -n "systemd --user list-timers" scripts/required-wiring.default.json` prints nothing at a8e0bb5, and `systemctl --user list-timers janitor-record.timer` exits 0.
Fix location: scripts/required-wiring.default.json:133 (J2), already applied in a8e0bb5.
Simplification: none needed. The fix is a single token and leaves no code, test or contract residue.
