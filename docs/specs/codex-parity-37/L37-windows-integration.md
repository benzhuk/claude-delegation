VERDICT: BLOCKED 0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f

# Lane 37 Windows integration receipt

Artifact: `0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f` (`build/codex-parity-37`); exact SHA and clean checkout admitted before the proof. CLI: `C:\nvm4w\nodejs\codex.cmd`, `codex-cli 0.158.0`; model `gpt-5.6-terra`; scratch only: `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\codex-parity-37\integration`.

## Native scratch proof — failed, no retry

- Command: prepared `run-live.ps1` with the exact artifact checkout/SHA; it installed trusted normal hooks and the `PreToolUse` Bash delete guard in scratch `CODEX_HOME`, without the hook-trust bypass.
- Native exit: `0` (`codex-live.exit.txt`). Actual model context/final output in `codex-live.raw.jsonl`: `DONE` only. Required observed lines beginning `wiring:` and `work:` are absent.
- Stderr was `Reading additional input from stdin...`; it is preserved verbatim in `codex-live.stderr.log`. This is an ordinary proof defect, not a permission, sandbox, or guard denial; no repair or unchanged retry ran.
- Scratch auth cleanup: `auth-copy-exists=False` after the script's standalone non-recursive `Remove-Item -LiteralPath`; no auth content was printed.

## Windows sealed suite — failed, one admitted run

- Preflight found no existing `node ... scripts/run-tests.mjs` process. The one suite ran under process-owned `Global\claude-verify`, acquired within 60 seconds, with `TEMP`/`TMP` set to `integration\windows`; the mutex was released/disposed by `finally`.
- Command: `node scripts/run-tests.mjs`; immediate native exit `1` in `windows/sealed-suite.exit.txt`.
- Counts: 2,664 tests; 2,650 pass; 2 fail; 12 skipped; 0 cancelled; duration 144021.656 ms.
- Failure 1: `scripts/native-package.test.mjs:14` expected five Codex events but `hooks/codex-hooks.json` now includes `PreToolUse`.
- Failure 2: `skills/multi/scripts/hooks.test.mjs:429` rejects `hooks/codex-unsupported.test.mjs:156` for not using `childEnv()`.
- Raw suite output and retained sealed home are under the lane scratch `windows/` directory. No suite retry, source edit, record edit, or commit occurred.

The artifact requires a builder fix and fresh review before any further proof or gate.
