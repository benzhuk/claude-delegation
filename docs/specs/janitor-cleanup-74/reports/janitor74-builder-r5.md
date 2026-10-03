DONE 1275bcfefed305170059bc84649cf287ef9bbac5

# janitor74 builder, round 5

Branch build/janitor-cleanup-74-janitor74, pushed. Parent was 8bf2f89398af3c0dc4673a950b0bbae920549134.

## Gate
`node scripts/run-tests.mjs` (sealed runner) on: janitor.test, janitor-sweep.test, wiring-check.test, janitor-timer-refresh.test, install-janitor-timer.test, skills/multi/scripts/hooks.test. Exit 0, tests 356, pass 349, fail 0, skipped 7, "leak check: 0 new temp entries". No full suite. No real scheduler, home or repo touched; the only installer calls are injected.

## MAJOR 1 and MINOR 2 (option A)
- Cause: the refresh treated "the root this session runs from" as "the installed release". True for no stale pane and for no Codex or dev-checkout session.
- Discriminating check: new tests, each of which fails if the matching gate is removed. (1) a stale fixture's `--hook` makes 0 refresh calls and prints no `janitor timer` line; (2) `.codex` cache root, dev-checkout root and no root each make 0 refresh calls, and through the real `refreshIfRegistered` with an injected installer make 0 installer calls. Existing tests :1500/:1525 moved to the current fixture (`running 0.20.16, installed 0.20.16`) and the order test drops the lean-rules write so a wiring line prints. The older-release re-registration test also runs from a current in-cache root now.
- Fix location: scripts/wiring-check.mjs, `main()` `--hook` branch (`if (!stale.stale) refreshJanitorTimer(opts)`), and `refreshJanitorTimer` returns early unless the session root is under `<home>/.claude/plugins/cache` (new local helper `isUnderClaudeCache`, realpath both sides, case-fold on win32/darwin, mirroring the installer's allowlist). A missing root also skips. scripts/janitor-timer-refresh.mjs: leading `refused: ` stripped from `reason`; janitor-timer-refresh.test.mjs asserts it.
- Simplification: one call-site condition (not stale, root under the Claude cache). No new module, no version parser. Covers stale downgrade, Codex ping-pong, the 400 ms Codex kill window, and the doubled-prefix noise. Trade-off accepted per ruling: a Codex-only host is not refreshed until a Claude session runs.

## Integrator failure 2 (janitor-sweep.test.mjs:619)
- Cause: the holder `spawn(process.execPath, ["-e", ...], { cwd, stdio })` had no `env` key, which the N2 scanner in hooks.test.mjs flags.
- Discriminating check: hooks.test.mjs "N2: no test file in this suite inherits the runner environment" passes now (failed before per the integrator).
- Fix location: scripts/janitor-sweep.test.mjs, `env: th.env` (the sealed env from makeTempHome). Guard test unchanged.

## Integrator failure 1 (janitor.test.mjs, fetchOrigin source test)
- Cause: the test reads scripts/janitor.mjs and its regex anchors on `"\n}\n"`. In this worktree `git ls-files --eol` shows `i/lf w/lf`, so I could not reproduce the failure here; the integrator's checkout was `w/crlf`, which makes the regex miss. So it is a Windows CRLF working-copy artifact, not a source defect.
- Discriminating check: test passes here (LF); on CRLF input the normalisation makes the same text the regex expects. I did not build a CRLF copy to prove the failing side.
- Fix location: scripts/janitor.test.mjs, the source read now does `.replace(/\r\n/g, "\n")`. Source behaviour (timeout, GIT_TERMINAL_PROMPT) unchanged.
- Simplification: normalise at the read, no change to the regex.

## Notes
- I briefly ran a bad sed on scripts/janitor.test.mjs that wrote stray CR/LF into the line; I restored that one file from the index with `git checkout` (my own just-made edit only; nothing else was in it) and redid the edit with the Edit tool.
- No docs/work/*.record.md touched. No command was denied.
