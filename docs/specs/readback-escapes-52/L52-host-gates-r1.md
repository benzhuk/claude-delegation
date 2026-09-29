VERDICT: MIXED

Candidate: `ee488fdf35dd72b3349277b1da566f66233813ed` (`origin/build/readback-escapes-52`). No candidate source or index change occurred during these gates.

Windows sealed gate: PASS, native exit 0. Actual totals: 2915 tests, 2901 pass, 0 fail, 14 skipped. Raw receipt: `windows/ee488fdf35dd72b3349277b1da566f66233813ed/suite.raw.log`; native sidecar: `windows/ee488fdf35dd72b3349277b1da566f66233813ed/suite.exit.txt`; summary: `windows/ee488fdf35dd72b3349277b1da566f66233813ed/suite.summary`. The process-owned runner ended and candidate HEAD stayed `ee488fdf35dd72b3349277b1da566f66233813ed` clean.

Windows raw output also reports `leak check: 4 new temp entries`: `decisions-render-reader-0whq6f`, `decisions-render-reader-JrhbI3`, `decisions-render-reader-YdTd9k`, and `decisions-render-TF4vE7`. All four directories were observed in the Windows temp directory with creation time 10:07:04 PM America/New_York, during the gate. The runner's native exit remains 0. Attribution is unresolved because global TEMP can overlap focused review tests; no directories were removed and no source defect is claimed from this receipt alone.

Netcup sealed gate: BLOCKED, native exit 1 and SSH exit 1. Actual totals: 2915 tests, 2909 pass, 1 fail, 5 skipped. Local copied receipts: `netcup/ee488fdf35dd72b3349277b1da566f66233813ed/{suite.raw.log,suite.exit.txt,suite.summary,preflight-diff.raw.log,preflight-diff.exit.txt}`; SSH wrapper receipt: `netcup-gate-ssh.raw.log` and `netcup-gate-ssh.exit`.

The sole Netcup failure is `skills/decisions/scripts/decisions-handback.test.mjs:893`: its real-process assertion requires `origin/main`, but the remote candidate was cloned with `--single-branch build/readback-escapes-52` and therefore has no `origin/main`. The raw failure is `fatal: bad revision 'origin/main'` from `git log -1 --format=%h origin/main -- docs/GOALS.md docs/goals/card.md`. This is a remote gate-checkout configuration failure, not evidence against the candidate source. Do not rerun this unchanged checkout; fetch the real `origin/main` into the remote candidate before the next changed-candidate gate.

Preflights and staging are retained at `windows-process-preflight.{raw.log,exit}`, `netcup-process-preflight.{raw.log,exit}`, `netcup-prepare.{raw.log,exit}`, `netcup-transfer.{raw.log,exit}`, `netcup-runner-verify.{raw.log,exit}`, and `netcup-receipt-copy.exit`. The Netcup runner uses shared persistent `/tmp/claude-verify.lock`; the Windows runner changes to the resolved candidate repository before launching the suite.
