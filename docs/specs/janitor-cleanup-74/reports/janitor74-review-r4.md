VERDICT: NEEDS_FIXES (2) 8bf2f89398af3c0dc4673a950b0bbae920549134

# janitor74 review, round 4 (delta re-review of fix round 4)

NEEDS_FIXES

- Worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-janitor-cleanup-74-janitor74.
- HEAD: 8bf2f89398af3c0dc4673a950b0bbae920549134. I got it from my own `git rev-parse HEAD`.
- Range: `9126120c..HEAD` is one commit touching 5 files, +114/-3: scripts/wiring-check.mjs, scripts/wiring-check.test.mjs, scripts/janitor-sweep.mjs, scripts/janitor-sweep.test.mjs and skills/janitor/SKILL.md.
- `git status --short` is empty before and after my checks.
- hooks/hooks.json and hooks/codex-hooks.json did not change.
- Report file name: the task said "round 2", but janitor74-review-r1, -r2 and -r3 already exist (the r3 sha is 9126120c). I wrote this report as r4, matching builder-r4, so no earlier review is overwritten.

Counts: 0 BLOCKER, 1 MAJOR, 1 MINOR.
- MAJOR B (wiring) is fixed as asked.
- The two orchestrator rulings landed correctly.
- But wiring the refresh into a live hook exposed a defect: the refresh re-registers the timer from whatever root the session runs from, not from the installed release. That breaks the very thing item 6 promises.

## Gate re-run (mine)
- Command: the brief's Gate list, plus scripts/janitor-sweep.test.mjs, scripts/janitor-timer-refresh.test.mjs, scripts/wiring-check.test.mjs and scripts/native-package.test.mjs.
- The log is in the session scratchpad (`.../scratchpad/lane-74/j74r4/gate.log`), not in the repo.
- Result: exit 0. `tests 542, pass 480, fail 0, skipped 62`. This is the builder's 539/477 plus native-package's 3, so the builder's gate log is real.

## Prior findings and rulings
- **MAJOR B (item 6 not wired): FIXED as specified.**
  - `refreshJanitorTimer(opts)` runs after the hook's own output (scripts/wiring-check.mjs:569-572), inside a try/catch that swallows everything (:504-521).
  - There is no new hook entry.
  - The module loads only when argv has `--hook`, and a failed load gives `null` (:65-67).
  - Cost, measured: in a scratch home, `--line --hook` takes about 75 ms and `--line` about 67 ms, so the refresh adds roughly 10 ms. That is far inside the 5 s bound.
  - `grep refreshIfRegistered` now also finds wiring-check.mjs and its test.
- **Exit-code ruling: DONE.** skills/janitor/SKILL.md:135 says a `--apply` run with a failed or stopped sweep row exits 1. That matches scripts/janitor.mjs:2236 (the sweep runs on `--sweep` or when a policy file is present) and :2403-2404 (1, never 2).
- **Narrow-refspec ruling: DONE.** scripts/janitor-sweep.mjs:203 names the false positive and `git ls-remote`, and the row is still `report-only`. janitor-sweep.test.mjs:495 asserts the text.
- **No regression found** in the sweep, archive or ownership code: this round changed only one detail string there.

## MAJOR 1: the hook re-registers the timer from the session's own root, not from the installed release
- Item 6 (spec.md:13) says the timer is re-registered "from the installed release ... so a stale timer cannot keep running old code".
- The hook calls the refresh unconditionally (scripts/wiring-check.mjs:569-572). It ignores `stale.stale`, even though `stale` is computed a few lines earlier at :539.
- `refreshIfRegistered` re-registers whenever the baked root differs from `CLAUDE_PLUGIN_ROOT` (scripts/janitor-timer-refresh.mjs:112).
- The installer accepts any directory under `~/.claude/plugins/cache` **or** `~/.codex/plugins/cache` (scripts/install-janitor-timer.mjs:504-518).

This causes two failures in real use.

**(a) A stale Claude session downgrades the timer.** SessionStart also fires on resume, clear and compact, so a pane still running release N fires it long after N+1 is installed.
- The fixture is a sealed home in scratch. The timer was installed from 0.20.16 and recorded. The real installer ran with an injected exec.
- Driven through `main(["--line","--hook"])`, the probe output was:
  ```
  STALE 0.20.9 session SessionStart: "plugin 0.20.9 running, 0.20.16 installed: restart this pane","janitor timer: refreshed: re-registered from ...\0.20.9 (was ...\0.20.16)"
    scheduler execs: systemctl --user daemon-reload, systemctl --user enable --now janitor-record.timer
    unit now bakes [ '0.20.9' ]
  CURRENT 0.20.16 session SessionStart: refreshed ... unit now bakes [ '0.20.16' ]
  STALE again: refreshed ... unit now bakes [ '0.20.9' ]
  ```
- The timer runs whichever release had the last SessionStart before its hour. That is exactly "a stale timer keeps running old code".
- The builder's own test enshrines this: wiring-check.test.mjs:1500 uses `staleFixture(running 0.20.9, installed 0.20.16)` and asserts that the refresh **is** called.

**(b) Claude and Codex sessions ping-pong, even on the same version.**
- hooks/multi-codex-hook.mjs:67 and :127 run `scripts/wiring-check.mjs --line --hook` on Codex's SessionStart, with `CLAUDE_PLUGIN_ROOT` set to the Codex plugin root (:100).
- The probe (same fixture, a Codex root at `.codex/plugins/cache/.../0.20.16`) showed:
  ```
  CODEX (same version 0.20.16): refreshed: re-registered from <.codex-cache> (was <.claude-cache>)   execs: daemon-reload, enable --now
  CLAUDE 0.20.16:               refreshed: re-registered from <.claude-cache> (was <.codex-cache>)   execs: daemon-reload, enable --now
  CODEX again:                  refreshed: re-registered from <.codex-cache> (was <.claude-cache>)
  ```
- Every alternation is a scheduler re-registration.
- If Codex's cache lags Claude's, this is a downgrade as well. checkStaleness does not flag a Codex root, so case (a)'s gate alone would not stop it.
- The Codex route also kills its child at 400 ms (multi-codex-hook.mjs:76). The refresh's budget, `4300 - uptime` (wiring-check.mjs:510), assumes the 5 s Claude bound, so under Codex the installer can be killed mid-exec.

Fix, in two parts:
1. **Mechanical, required.** Do not refresh from a stale session. In scripts/wiring-check.mjs, replace
   ```
     if (argv.includes("--hook")) {
       refreshJanitorTimer(opts);
       return 0;
     }
   ```
   with
   ```
     if (argv.includes("--hook")) {
       // A stale session is not the installed release; refreshing from it would downgrade the timer.
       if (!stale.stale) refreshJanitorTimer(opts);
       return 0;
     }
   ```
2. **Judgment.** Stop the ping-pong. Pick one:
   - (A) Simplest: refresh only from the Claude hook path, i.e. skip when the root is not under `<home>/.claude/plugins/cache`. This one rule also removes the Codex 400 ms kill window and MINOR 2.
   - (B) Make `refreshIfRegistered` forward-only: when both the baked root and this root are versioned cache directories, re-register only if this root's version is strictly greater, and treat equal versions as `current`.
   - (A) leaves a Codex-only host un-refreshed until a Claude session runs. (B) keeps Codex-only hosts covered. That trade-off is the orchestrator's call.

Tests to change and add:
- wiring-check.test.mjs:1500 and :1525 must use a current fixture (`running: "0.20.16", installedVersions: ["0.20.16"]`).
- The test at :1500 also needs some printed output to keep its order assertion, because a fully-wired, non-stale home prints nothing. For example, drop the `lean-rules.md` write so the wiring line prints.
- Add a test: a stale fixture's `--hook` makes 0 refresh calls and prints no `janitor timer` line.
- Add a test: for the option you pick, a `.codex` root with an equal version (or any version, under A) makes 0 installer calls.

Predicted outcome, which I verified on a scratch copy outside the reviewed tree (`git archive HEAD`):
- With patch 1 applied, the stale probe gives `scheduler execs: []` and `unit now bakes ['0.20.16']` on every stale SessionStart.
- The new "stale never refreshes" test passes with the patch and fails without it (`✖ ... a STALE session's --hook never refreshes the timer`). So it tells the two apart.
- With the current fixture, unpatched test :1500 fails only on its order assertion, as predicted above. The other three lane-74 tests stay green.
- Patch 1 alone does not fix (b). Option A or B is still needed.

Cause: the refresh treats "the root this session runs from" as "the installed release". On Claude, that is false for any stale pane. On Codex, it names a second, equally valid cache, so two roots fight over one timer.
Discriminating check: in a sealed home with the timer recorded at the newest Claude root, run `main(["--line","--hook"])` once with a stale root and once with a `.codex` root, using an injected exec. Today both re-register; after the fix both make 0 scheduler execs and the unit still bakes the newest root.
Fix location: scripts/wiring-check.mjs:569-572 (stale gate, plus option A's root gate), or scripts/janitor-timer-refresh.mjs:110-112 (option B's version rule), plus scripts/wiring-check.test.mjs:1500-1566.
Simplification: one condition at the call site (`!stale.stale` and a root under `.claude/plugins/cache`). That covers the stale downgrade, the Codex ping-pong, the 400 ms kill window and MINOR 2, and needs no new module or version parser.

## MINOR 2: a session from a non-installed root prints a "refused" line on every SessionStart
- Examples are a session started from a dev worktree or a `--plugin-dir` checkout. checkStaleness does not flag these, so the refresh runs.
- The installer refuses at scripts/install-janitor-timer.mjs:769, before writing anything, which is correct.
- But wiring-check prints the refusal every time (wiring-check.mjs:515-517). The probe gave this line on session 1 and again on session 2:
  ```
  janitor timer: refused: refused: refusing to install a live janitor timer from a temporary checkout (...\dev-worktree) - run the installer from the installed plugin, or pass --force-root (tests only)
  ```
  The "refused: refused:" prefix is doubled because `reason` (janitor-timer-refresh.mjs:130) already starts with the installer's own `refused: `.
- That is permanent noise in every session's context, and it is not actionable.
- Fix: option A of MAJOR 1 removes this case entirely.
- If option B is chosen instead, check `isInstalledPluginRoot(pluginRoot, { home })` (already exported, install-janitor-timer.mjs:504) in `refreshIfRegistered` before calling `install` when `!forceRoot`, and return `{ action: "none", reason: "this session's plugin root is not an installed plugin" }`.
  - Update janitor-timer-refresh.test.mjs:125-131 to expect `none`, with the unit untouched.
  - Strip a leading `refused: ` from `reason` at :130.
- Predicted outcome: dev-root sessions are silent, and installed-root refusals print one prefix.

## Attack-brief answers (delta)
- **Work lost:** this round adds no removal path. The janitor-sweep change is a detail string only.
- **Report mode, exit codes:** unchanged. The SKILL.md line matches the code at janitor.mjs:2403-2404.
- **Item 6:**
  - Wired.
  - It runs only when a timer is already registered: `installed.json` plus the unit file are required (janitor-timer-refresh.mjs:96-109).
  - It fails open: a throwing refresh leaves exit and output unchanged (test :1525, verified).
  - It finishes well inside 5 s.
  - Tests never reach a real scheduler. Every in-process test injects `refresh`. The CLI test (:1560) runs under `childEnv`, which sets HOME and USERPROFILE to a scratch home, and that home's `installed.json` is `{schema:1}`, so it returns `none` before any exec.
  - The timer units stay byte-stable, because install-janitor-timer.mjs did not change.
  - No hook JSON changed, so the six hook-reading tests are not triggered. native-package passes anyway.
  - Defect: MAJOR 1, the source root is wrong for stale and Codex sessions.
- **Ownership, roots, push scope, item 5, items 7 and 8:** no change in this round, and no regression in the gate.

## Hygiene
- All probes ran in sealed homes under the session scratchpad (`.../scratchpad/lane-74/j74r4/`) with an injected exec. No real scheduler, home or repo was touched.
- The mutation check used a `git archive` scratch copy. The reviewed tree is unmodified (`git status --short` is empty).
- No command was denied.
