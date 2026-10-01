VERDICT: READY

# Knowledge triage 40 live proof R2 preparation

Prepared: 2026-09-29 21:23:13 America/New_York

This verdict means the bounded preparation is complete. It does not authorize the live invocation. Execution remains blocked until root supplies the independently approved recipe delta, its delivery receipt and live installed-skill SHA, and the explicit execution follow-up required by `live-proof-r2-ruling.md`.

## Approved identity and completed gates

- Approved source/test candidate: `80760b3bea59b8d8641537b1ae3749388f13f575`.
- Current integration HEAD during preparation: `6a46fdac30c58334d801eee915079969286e4566` (docs-only successor).
- `scripts` tree is identical at both revisions: `87c7d6a8eab7060957a2feb19648190cd46834a1`.
- `skills` tree is identical at both revisions: `6d9991616757c867f058b592db38f4bc582074b2`.
- Restricted `scripts`/`skills` worktree delta during preparation: zero.
- Opus narrow review: APPROVE, session `7214f385`, candidate `80760b3bea59b8d8641537b1ae3749388f13f575`.
- Fresh Linux full gate reported by root: 3095 pass, 0 fail, 7 skip.
- Native Windows R4 gate: 3102 tests, 3069 pass, 0 fail, 33 skip, leak count 0. Receipt: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/windows-gate-r4/report.md`.

These are preparation bearings only. Source/test identity and worktree state must be captured again immediately before the authorized invocation.

## Preserved R1 baseline

R1 evidence is retained at:

`C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/live-proof/20260929-201431`

R1 selected 60 notes, archived 51, and left the following nine pending. The hashes below come from the stored R1 `after-gather-state.json`; they are not claims about current live files.

| Pending note | Stored R1 SHA-256 |
|---|---|
| `2026-08-31-orca-project-groups-host-scoped.md` | `5c30c67da12ad91439542a8f8ebae7d157b6946716d084635e0d2d197e1f2e4e` |
| `2026-09-01-orca-account-ids-per-host.md` | `bc28d2eab430cf4b08164e71644a71a66cbc427fc2dee836b25fcc72048c6547` |
| `2026-09-02-orca-fork-rebase-gotchas.md` | `08ee64a13c2b813fdfbeee4035a04ebe21ab85738d16b55fa2f5ac2cef5fe2ad` |
| `2026-09-02-orca-serve-oompolicy-kills-all-claudes.md` | `9502fd310306768bd99b6ac63e66c7e89ff206b19aa8558ba423e6b7bf91e780` |
| `2026-09-02-orca-stale-daemon-generation-ownership-unknown.md` | `8ca77d0145015fc57a5dd60e68309de6723ddfc828bba58e8ffeca1d07e6fc18` |
| `2026-09-08-accounts-swap-per-host-ids-and-windows-token-carry.md` | `daf38194b63e8d81724e46dd0811bc72959b1b3f7c1391ae51a9fa485215575f` |
| `2026-09-10-orca-register-existing-login-via-rpc.md` | `acb57cb062515ea6f3f10902f9720a3c2f1f481438446683b443c9e5bab9c6a7` |
| `2026-09-25-orca-upgrade-script-flag-gaps.md` | `bba9b349035b9d16210c338915254c709e3b0d119a3a2fad591a73cd72bb8fdd` |
| `2026-09-25-windows-orca-panes-froze-overnight-os-awake.md` | `5b044e6ba7002c5e252a1d8064de3c7c0b08b922eeeb1d4ecfcc0749ff48ba90` |

Stored R1 `10b-selected-dispositions.json` records each as present in the inbox, absent from archive months, at one location, with disposition `pending` immediately after R1. R2 must account for every one: selected and dispositioned by the new receipt, or absent before launch with a specific evidence-backed explanation. A missing or changed note cannot be silently treated as handled.

R1 effects remain preserved. R2 must not undo, repair, or replay them. In particular, the exact command denied during R1 must not be copied, reproduced, or routed another way.

## Execution checklist after root authorization

1. Create a new dated evidence directory beneath the existing live-proof root, with distinct run and Claude session identifiers.
2. Re-capture exact HEAD; compare `scripts` and `skills` tree identities to approved candidate `80760b3`; require no restricted worktree delta.
3. Verify the delivered recipe byte-for-byte against the independently approved recipe-only SHA and delivery receipt. Record its installed path and writer host. Confirm the normal skill resolves, real HOME is active, the native role marker remains absent, and no dependency seams or environment overrides are present.
4. Check production locks, ATTENTION state, active writer state, and guard readiness. Any conflict stops before launch.
5. Resolve the chezmoi source path fresh. Record branch/HEAD, fetch/fresh remote state, index status, and exact dirty-path byte hashes. Any staged file, dirty publishable curated file, source mismatch, or remote mismatch stops before launch. Preserve every unrelated dirty path and approved `._*` metadata exactly.
6. Capture fresh local inbox/archive/DIGEST/gather-state/read-ledger/session baselines and the nine-note presence and SHA-256 matrix.
7. Run the approved read-only remote count/claim collectors for the fixed Netcup and Hetzner endpoints. Both configured endpoints must be reached; `CLAIM_KEPT`, `BUSY`, connection failure, or unexplained claim residue stops before launch. Mac remains a named pending placeholder.
8. If all preconditions pass, invoke exactly once: `node .\scripts\knowledge-triage.mjs --manual`. Use the normal production cap of 60, real HOME and production dependencies. Add no outer timeout and do not rerun.
9. Preserve the complete receipt, run/session identifiers, terminal status, stdout/stderr evidence, and exact Claude transcript evidence. Require zero guard denials and no semantically equivalent reroute after a denial.
10. Capture fresh post-run local and remote counts, claim residue, gather state, read ledger, sessions, chezmoi source/index/dirty hashes, publication state, and receipt-to-filesystem reconciliation.
11. Prove both configured SSH endpoints were reached rather than skipped. Account for all selected notes with terminal dispositions, and separately account for each of the nine R1 pending notes. Prove read exclusion and publication from fresh evidence.
12. Compare pre/post preservation data byte-for-byte for unrelated dotfiles and approved metadata. Leave the scheduled-task/G4 path untouched.

## Reusable sealed collectors

The following R1 collectors may be copied or invoked from the new evidence directory after execution authorization, without repeating the denied R1 operation:

- `snapshot-dotfiles.mjs`
- `capture-local.mjs`
- `capture-remote-counts.mjs`
- `capture-remote-claims.mjs`
- `verify-publication.mjs`
- `summarize-transcript.mjs`

Their provenance is the preserved R1 evidence directory above. Reuse does not waive fresh baselines, the reviewed recipe identity, the two-endpoint reachability requirement, or the one-run limit.

## Stop conditions and unsupported assertions

Stop without repair, retry, or alternate command route for a recipe/delivery mismatch, source/test identity mismatch, active writer, lock or ATTENTION conflict, staged work, dirty publishable curated file, dotfiles source/remote mismatch, guard denial, either fixed SSH endpoint being unreachable, claim residue, or an unexplained state for any of the nine R1 pending notes.

The recipe review, delivery receipt, live installed-skill SHA, current live HOME state, current nine-note presence, current dotfiles state, and current Netcup/Hetzner reachability are not yet evidenced. No claim about them is made here.

This preparation read the ruling, original plan, local repository identity, gate receipt, and stored R1 artifacts only. It did not probe HOME, dotfiles, Claude, Netcup, Hetzner, Mac, credentials, configuration, or any live host; it did not invoke knowledge triage or mutate production state.
