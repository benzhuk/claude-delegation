VERDICT: PASS

# janitor74 fix round 4

Commit 8bf2f89398af3c0dc4673a950b0bbae920549134 on build/janitor-cleanup-74-janitor74.
Files: scripts/wiring-check.mjs, scripts/wiring-check.test.mjs, scripts/janitor-sweep.mjs, scripts/janitor-sweep.test.mjs, skills/janitor/SKILL.md. hooks/hooks.json unchanged.

- MAJOR B (item 6 wired): wiring-check.mjs `--hook` path now ends with refreshJanitorTimer(opts): one fail-open try/catch call to refreshIfRegistered() after the hook's own output. No new hook entry. The module is loaded by a top-level `await import(...).catch(() => null)` only when the process argv has `--hook`, so a missing or broken sibling never takes the wiring check down. The real exec shares what is left of the hook's 5 s bound (4300 ms minus process uptime). Prints one `janitor timer: <action>: <reason>` line only when it refreshed, was refused or failed. The header comment that said "never writes anything" now names this one exception.
- Tests (wiring-check.test.mjs, 4 new): refresh called once after output with the injected home, and never for bare --line/--json; a throwing refresh changes neither exit code nor output; the real refreshIfRegistered with an injected `install` re-registers an older-release unit once and is then "current" (no scheduler reached); a scratch home with nothing registered stays silent (CLI subprocess).
- Exit code ruling: documented once in skills/janitor/SKILL.md (a --apply run with a failed or stopped sweep row exits 1, never 2).
- Narrow refspec ruling: the unpushed-archive row (still report-only) now says a narrow fetch refspec yields false positives and to check with git ls-remote; assertion added in janitor-sweep.test.mjs.
- Seam MINOR (policy text): not in this territory, untouched.

Gate (brief's list plus janitor-sweep, janitor-timer-refresh, wiring-check tests) > reports/janitor74-gate.log: exit 0, `tests 539, pass 477, fail 0, skipped 62`. scripts/native-package.test.mjs also run: 3 pass. No guard blocks, no temp files, no processes started.
