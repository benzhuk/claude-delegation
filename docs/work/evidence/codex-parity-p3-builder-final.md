VERDICT: PASS 6311556cc17c62d364d056a595f3c2fe3a71b150

P3 final documentation delta committed in `astra-codex-p3`: `6311556cc17c62d364d056a595f3c2fe3a71b150` (`docs: clarify Codex hook update route`). Only `README.md` and `docs/native-use.md` changed.

- N1 README behavior paragraph: removed the duplicated `native`, wrapped the confirmed-children sentence, and retains per-event native metadata wording.
- N1 README 0.20.9 changelog: replaced the stale `SessionStart metadata` wording with `native metadata on an event`.
- R1 native route step 3: added the exact reminder to rerun `--codex-hooks-only` after every plugin update because the hook uses its wired adapter path.
- Verification: `rg` found all four per-event wording locations and no `SessionStart metadata` or `native native`; `git diff --check` passed; local Markdown links in both edited documents all resolve.

No tests, installs, source changes, or records were run or modified.
