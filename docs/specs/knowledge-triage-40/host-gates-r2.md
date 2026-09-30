# Host gates r2, candidate 7cc858ad834f3958b45a0afd17f6879fcc4dd9bf

## Windows: FAIL
- Pre-check: no other run-tests.mjs / node --test process found. Global\claude-verify acquired with one nonblocking WaitOne(0); released by my script (finally).
- Command: `node scripts/run-tests.mjs --no-sweep` from the integration checkout (script: win-gate.ps1). One run, no rerun.
- Tested HEAD: 50c37bad8857861287767fec511581bbb42b68e5, NOT 7cc858a. The worktree had moved one docs-only commit ahead of the candidate (50c37ba "docs: record repaired lane40 focused gate…"). `git diff --name-only 7cc858a HEAD` outside docs/ is empty, and the working tree has no non-docs changes vs 7cc858a, so the tested source/test bytes equal the candidate. Uncommitted docs edits were present (records) and do not affect tests.
- Node v24.18.0. Start 2026-09-29 19:28:45 EDT, end 19:30:29 EDT (about 104 s). Exit 1.
- Totals (top-level): tests 3099, pass 3036, fail 30, skipped 33 (cancelled 0, todo 0). Skips are not hidden: 33.
- Seal/leak: run-tests printed "leak check: 0 new temp entries". Sealed home left for inspection at C:\Users\benzh\AppData\Local\Temp\delegation-test-run-61420-VLspwT\sealed-home-1EV8KI (I did not clean it).
- Note: two nested self-test fixture blocks (probe, run-tests-forward) show their own "failing tests" output inside the log; those are expected fixture runs. The 30 real failures are in the final failing-tests list (log line 3400 on).
- Failures (named; file:line):
  - hooks/delete-guard.test.mjs:890 "decide: the lead session (no agent_id) ... passed-lead" and :1057 "CLI: the lead session ... passed-lead": `'deny' !== 'allow'`.
  - hooks/multi-inbox.test.mjs: (a) :101, (c) :159, (d) :180, (e) :197, (f) :215, (g) :254, (h) :272, (i) :295, (j) :312, (m) :390, (n) :417, (o) :430 (12 tests): e.g. "registerInbox must have written ...\.agents\notes\inboxes.json".
  - skills/multi/scripts/hooks.test.mjs (15 tests): V3 :95, :107, :124, :141; M1 :160, :177, :192; M3 :212; L3 :225; L1 :238; D2 :316, :333, :339; C4 :348; D2 guessed slug :371. Typical text: "TypeError: Cannot read properties of null (reading 'suppressOutput' / 'taxonomy')".
  - skills/multi/scripts/hooks.test.mjs:771 "N2: no test file in this suite inherits the runner environment on its own": AssertionError, sites named: scripts/knowledge-gather.test.mjs:194 and scripts/knowledge-triage.test.mjs:114 "[spawn] passes no env key at all". This one is in candidate lane 40's own test files.
- Root adjudicates; several failures (multi-inbox, hooks.test, delete-guard) look outside lane 40 and may be Windows/environment-related, but I did not investigate or fix.
- Logs: host-gates-r2/win-raw.log, win-meta.txt, win-gate.ps1.

## Netcup: BLOCKED (SLOT_BUSY)
- One nonblocking `mkdir /tmp/claude-verify.lock` on ben@100.69.249.18 failed; lock held by another owner. Script printed SLOT_BUSY, exit 42. No waiting, no deletion, no clone, no tests run, nothing to release.
- SSH policy: BatchMode, StrictHostKeyChecking=yes, ConnectTimeout=15, no forwarding, `bash -l -c 'bash -s'`.
- Logs: netcup-raw.log, remote.sh.

Nothing was edited or committed; no peer messages sent.
