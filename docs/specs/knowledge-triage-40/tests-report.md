VERDICT: READY fae1141adef62a762327cc772f688897e6d9f6ae

# Lane40 independent contract-test report

Date: 2026-09-29 America/New_York

Branch: `build/knowledge-triage-40-tests`

Base: `9cad287a5a0567d1e4fbe9e1ccfc25117828b620`

Test commits: `888729f`, `db88bbd`, `86d51a1`, `a260ad3`, `9c9ebdd`, `8e8c653`, `27b3846`, and `5b08cc3`

The owned test paths contain 51 new named contract cases. The test files and authorized helper remain below the 800-line limit (`knowledge-gather.test.mjs` 625 physical lines; `knowledge-triage.test.mjs` 645; `knowledge-gather.test-fixtures.mjs` 136). Every fixture uses a temporary or sealed `FIXTURE_ROOT` home. SSH, Claude, Git and chezmoi are real Node command-prefix children; scheduler execution is injected. No live store, SSH host, Claude account, task, settings, Notion page or Git publication was touched.

## Contract coverage

- Gather/import: stable top-level selection, source bytes/hash/mtime, fixed pending/null alias reasons, unreachable-host truth, local/two-remote content deduplication, repeated gather, changed same-name versions, safe names/case collisions, atomic visible outcomes, and managed evidence retention.
- Archive/reconcile: status-frontmatter mutation matched against original bytes, cross-month destination stability, changed origins and conflicting archives preserved, resurrected source reported, origin-missing and superseded terminal outcomes reported once, and staged bytes retained for unresolved/terminal states.
- Tar and resources: checksum/path/link/global-PAX rejection, truncated stream rejection, 1 MiB skip with continued import, 1000-entry bound, GNU/libarchive metadata keys, and actual local GNU tar 1.35 plus libarchive/bsdtar 3.8.8 PAX producers with a long-path record.
- Process isolation: the full pinned SSH options, environment allowlist with secret/API/Git identity exclusions, bounded host timeout, nested timeout, and zombie-aware proof that owned grandchildren die.
- Runner: writer and kill-switch skips, missing skill/CLI, existing ATTENTION, cap 60 deterministic selection, exact digest-slug prompt sentence, managed/oversize/unsupported residue, two-run lock and skill-deferral escalation, job-local concurrency, nested nonzero, token-unavailable truth and aggregate token math, session recording, out-of-selection attention, and missing digest entry residue.
- Publication: HEAD movement alone is insufficient; fixture commands distinguish unchanged HEAD, unrelated HEAD, fresh remote mismatch and committed-DIGEST identity. Changed publication failures become ATTENTION; a no-change remote mismatch defers without ATTENTION.
- Installer/counts: existing job generator bytes remain stable, triage XML is disabled/interactive/PT2H with chosen first-run date, missing/malformed/impossible first-run dates refuse before writes, create-query-enable-run order, writer-only exit 2, triage-only removal, UTF-16LE BOM, and read-log session exclusion with absent/corrupt/non-array fallback.

## Discrimination and verification

The fixtures contain four explicit fault variants requested by the brief:

1. Duplicate import: identical local/netcup/hetzner bytes must produce no second canonical note, including on repeat gather.
2. Unchecked origin move: changed source, conflicting archive and resurrection each require a non-success disposition while both source and evidence remain.
3. Unrelated publication HEAD: the fake Git child advances HEAD but reports no DIGEST-touching commit; success is forbidden.
4. Child-only kill: fake SSH and Claude children each spawn a grandchild; the deadline assertions fail if the tree, rather than only the direct child, is not terminated.

Structural verification passed with `node --check` and `git diff --check`. After the first integrated gate exposed fixture assumptions, root adjudicated bounded corrections for the maintained skill text, SSH transport quoting, publication setup, terminal accounting, digest paths, stdin prompt capture, selection order, and missing-digest residue. Against verification-only source commits `e16fe93`, `2b31d51`, and `ce032de`, the following scoped gates passed under the bounded `Global\claude-verify` mutex:

- Runner: 14 pass / 0 fail / 0 skip. The changed-DIGEST publication test now archives a real selected note, reaches the Git checks, and rejects unchanged HEAD, a commit that does not touch DIGEST, and fresh remote mismatch as ATTENTION.
- Gather: 16 pass / 0 fail / 0 skip, including both real PAX producers and process-tree timeout; sealed leak check 0.
- Installer: 54 pass / 0 fail / 3 expected platform skips, including valid and invalid `--first-run` handling; sealed leak check 0.

The count file was not rerun after source integration in this child because root is performing the final sealed four-file gate. Its earlier pre-integration run had 16 pass / 1 expected fail for the then-unimplemented session exclusion.

## Code review r1 regression delta

Commit `9c9ebdd` adds one discriminating regression for each accepted finding in code review `42e356b`: envelope-safe notification plus the installed Node sender and visible packet/send failures; atomic archive replacement preservation; full-receipt terminal uniqueness; fail-closed managed-name discovery in the runner and standalone gather; publication precondition/reason/session hardening; the three-hour live-PID lock bound; preserved gather-phase unresolved totals; skipped deferral with nested evidence; a deterministic overflow-plus-timeout single-signal check; and mixed valid plus unsupported POSIX-backslash/drive-like tar entries.

Against the reviewed source, the sealed red gates produced:

- Gather: 16 pass / 4 expected fail. The failures are exactly managed discovery fail-closed, one process-tree signal, archive replacement preservation, and unsupported-name residue.
- Runner: 12 pass / 8 expected fail. The failures map to notification seam/failure visibility, managed discovery, deferral status, aged live-PID ownership, terminal uniqueness and unresolved accounting. The hardened changed-DIGEST test passed its exact nested-exit and publication-reason assertions, proving it reaches the intended verification branches.

These were intentional red receipts before the source fix. The failed sealed runners left `%TEMP%\delegation-test-run-42424-sq9qz7` and `%TEMP%\delegation-test-run-53120-LfA8kJ`. An exact temp-only recursive cleanup was refused by `delete-guard`; no alternate deletion was attempted.

Against source fixes `1317543` and `bac4849`, commit `8e8c653` applies the two root-adjudicated fixture corrections: compare both sorted archive-directory lists, and read the exact multiline recovery commands from ATTENTION while treating the injected note as the envelope-safe summary. Scoped green results under `Global\claude-verify`:

- Gather: 20 pass / 0 fail / 0 skip; Node duration 6,419 ms, command wall time 7.23 s, sealed leak check 0.
- Runner: 20 pass / 0 fail / 0 skip; Node duration 11,141 ms, command wall time 11.95 s, sealed leak check 0.

Six focused scratch-copy mutants all exited nonzero and killed their intended assertion: writer precondition (166 ms), digest commit proof (808 ms), archive rename claim (731 ms), runner managed fail-closed (469 ms), standalone gather managed fail-closed (167 ms), and production sender consumption of `buildNotificationInvocation` (158 ms). The mutant copy remains at `%TEMP%\lane40-mutants-0f73682238ac4f94af1015ac1494dc3f` per the no-cleanup instruction. No full suite was run in this child.

## Full-suite N2 fixture integration

Commit `27b3846` repairs the two own-lane N2 findings from the Windows full suite. The generated SSH and Claude fixture programs now import the existing `test-child-env.mjs` helper and pass `childEnv(explicitFixtureHome)` to their grandchild spawns. No production file or guard marker changed. In this native Codex environment, `DELEGATION_REVIEW_RUN` was absent (presence check only; no environment dump). The requested five-file sealed scope was not run: immediate acquisition of `Global\claude-verify` returned busy, and the instruction required stopping that check rather than waiting or retrying. Syntax and `git diff --check` passed before the commit.

After the reviewing lane released the mutex, the same native environment ran the requested comparison once with no role-marker change:

```text
node scripts/run-tests.mjs --no-sweep hooks/delete-guard.test.mjs hooks/multi-inbox.test.mjs skills/multi/scripts/hooks.test.mjs scripts/knowledge-gather.test.mjs scripts/knowledge-triage.test.mjs
```

Result: 308 tests / 308 pass / 0 fail / 0 skip, Node duration 11,622.1398 ms, command wall time 12.48 s, sealed leak check 0. The 29 lead-classification failures from the inherited mid-tier full gate did not reproduce. `DELEGATION_REVIEW_RUN` was absent in the native parent; lines exercising value `1` came from intentional child fixtures in the guard/hook tests.

Raw-output provenance: direct `functions.exec` result chunk `4721cc` on 2026-09-29 America/New_York. The command was streamed to the tool result rather than redirected, so there is no filesystem raw-log path. Its successful sealed root was `%TEMP%\delegation-test-run-59940-8z1TnC\sealed-home-kE8twq`; `run-tests.mjs` removed that root on success. This report preserves the exact command, aggregate TAP receipt, wall time, Node duration and leak result without claiming a nonexistent log file.

## Code review r2 independent red phase

Commit `5b08cc3` adds the F1-F4 closure assertions from `code-r2-adjudication.md`. Root authorized extracting the existing reusable gather fixture machinery from `scripts/knowledge-gather.test.mjs` to `scripts/knowledge-gather.test-fixtures.mjs`; assertions stayed in the test file, and the N2 `childEnv(explicitFixtureHome)` grandchild spawn stayed visible in the scanned test file.

The final sealed real-source gate under `Global\claude-verify` produced 42 tests / 39 pass / 3 expected fail / 0 skip, Node duration 11,424.4395 ms, command wall time 12.21 s, and leak check 0. The three failures are branch-specific:

- F2 timeout-first signaling measured 2 tree signals instead of 1. The same test's overflow-first variant passed.
- F3 the NBSP plus reserved-label publication error never reached the injected sender, proving `safeSummary` rejected it before delivery. The test also carries the U+2028 reserved-label variant.
- F4 ATTENTION write failure did not attempt the fallback sender, so the receipt lacked the required visible BLOCKED-delivery failure. The same case also pins one attempt, envelope-safe fallback text, both exact recovery commands, and nullable helper argv without `--packet-file`.

F1 is green on the real source: interrupted and busy claims both remain named unresolved evidence (814.6205 ms); changed bytes restore to a free name and changed bytes plus a new live occupant preserve both versions (1,225.3231 ms); the earlier successful replacement case also passes (617.6451 ms). Two destructive scratch mutants fail the intended assertions: removing the missing-source claim check exits 1 (528 ms; focused test 379.4321 ms), and deleting a changed claim instead of restoring it exits 1 (738 ms; focused test 614.5919 ms).

Raw provenance is direct `functions.exec` chunk `ae918b` for the final red gate and the immediately following mutant tool result for the two focused mutants. No filesystem logs were claimed because output was streamed. Per the no-cleanup instruction, retained paths include `%TEMP%\delegation-test-run-15768-FIDO2Z`, `%TEMP%\delegation-test-run-49556-M5LkLo`, and `%TEMP%\lane40-r2-mutants-8d2d652bde2248c7b9f1d8a0629e0bd3`. F2-F4 remain intentionally red until the separately owned source repair is integrated; no full suite or live action ran.

## Limitations and integration gate

Root added the bounded test-only command/time seams in `test-seam-ruling.md` after dispatch. Those root-owned files are deliberately absent from the test commits. The source cherry-picks in this test branch exist only to run scoped verification; root should integrate the six test commits above rather than merge this branch wholesale. Root's final integrated gate should run exactly:

```text
node --test scripts/knowledge-triage.test.mjs scripts/knowledge-gather.test.mjs scripts/install-janitor-timer.test.mjs scripts/knowledge-counts.test.mjs
```

Run that focused gate under `Global\claude-verify`. Mocked Git/chezmoi output proves operation semantics and false-positive rejection; it does not prove an actual publication. The later G1 live proof remains required for real commit/push/remote identity.
## Windows OpenSSH ProgramData startup regression

Commit `fae1141` adds one Windows-only, no-network regression in the existing gather test territory. The test builds an explicit fixture HOME with `childEnv`, filters it through production `sshEnv`, and launches the real `C:/Windows/System32/OpenSSH/ssh.exe -V` through production `runProcess`. It skips explicitly when the platform or executable is unavailable, uses a 10-second child bound inside a 15-second test bound, and never prints environment values or version output. It also injects named provider/session/Git credential markers into the sealed base and requires all of them to remain absent from the SSH child environment.

Source prerequisite `dd40a7d` was cherry-picked separately as `901b105` only to restore the previously approved F1-F4 baseline. It is not part of this test delivery.

The single scoped sealed gate acquired `Global\claude-verify` nonblocking and produced the expected red result against current source: 23 tests / 22 pass / 1 fail / 0 skip, Node duration 8,411.9342 ms, command wall time 9.47 s, leak check 0. The only failure is the new regression: native Windows OpenSSH returned 255 because production `sshEnv` contained only `HOME`, `Path`, `SystemRoot`, `TEMP`, `TMP`, and `USERPROFILE`; expected exit was 0. No value or child output content appears in the assertion.

Raw log: `C:/Users/benzh/orca/workspaces/claude-delegation/knowledge-triage-40-tests/Scratch/knowledge-triage-40-programdata-red.log`. The retained failed sealed root is `C:/Users/benzh/AppData/Local/Temp/delegation-test-run-46136-1AT5Jy/sealed-home-U01rvZ`; no cleanup was attempted. The gather test file is 652 physical lines, below the 800-line limit. No host connection, SSH configuration read, credential access, triage invocation, guard change, or source fix occurred.

