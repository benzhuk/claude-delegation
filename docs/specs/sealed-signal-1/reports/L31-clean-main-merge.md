# Lane 31 clean-main merge preflight

VERDICT: READY_FOR_SLOT_ADMISSION

Fresh ordinary clone: `C:/Users/benzh/orca-gates/sealed-signal-1-clean-main`.
It started at `origin/main` `5b97441029447dd0290b5b8b2c43c33aeee3f338`, merged exact
`169dc8e7c180511d099be8e515761b2083ba9559` without a conflict, and committed
`5bf05649b669ccf0bbf5230398ebdc2d26ec7313` with the required merge message. It is not pushed.

The merge preserves the Lane 31 publication receipt, removes only
`docs/decisions/waiting/lane-31-history-merge.md`, and carries the approved Lane 31 history
bullet exactly once as the final bullet before `## Bearings`. The old conflicted merge checkout
was not changed.

The four source paths `scripts/test-home.mjs`, `scripts/test-home.test.mjs`,
`scripts/run-tests.mjs`, and `scripts/run-tests.test.mjs` have no diff from approved source
`b5341c71d9436427e31bdae11a6726ec798d1946`. The clean merge checkout has no working-tree
changes.

Windows admission preflight found no `node.exe` command line matching `run-tests` or `--test`.
`Global\\claude-verify` did not exist when opened read-only. No mutex was acquired and no suite
has run on Windows because Lane 32 reported a concurrent, unlocked Windows suite. The granted
Netcup fallback acquired `/tmp/claude-verify.lock` within its 60-second bound, ran exactly one
full sealed suite at the merge SHA, and released the lock. Native and SSH exit were both 0:
2551 tests, 2546 pass, 5 skipped, 0 failures, duration 19427.961151 ms. Raw evidence is
`L31-clean-main-merge-linux-full.log`, `L31-clean-main-merge-linux-full.exit`, and
`L31-clean-main-merge-linux-full.meta` beside this report.

After the successful gate, a fresh fetch confirmed `origin/main`
`5b97441029447dd0290b5b8b2c43c33aeee3f338` was an ancestor of the merge. A normal non-force
push advanced `main` to `5bf05649b669ccf0bbf5230398ebdc2d26ec7313`; fresh fetch and
`ls-remote` agree on that SHA.

Publication correction: the Waiting decision is live on the Notion page. The prior renderer
returned exit 5 because readback normalization differed by one blank line, before its renderer
commit; its error text only instructed a restore and does not prove one occurred. Read-only
inspection of `decisions-render-publish.mjs` shows `--adopt-live` performs no Notion write, but
would write fresh page text to `docs/decisions/last-render.md`, commit it, and push it after an
up-to-date-main check. It is therefore not a read-only diagnosis and has not been invoked.
