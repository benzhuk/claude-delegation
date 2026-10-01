# Integrator state — collect-status-1

Updated 2026-09-27, after the only gate run this job performed.

## Territories merged (all three, in this order)

| Territory | Approved sha (from orchestrator's task + confirmed by reviewer's APPROVE line) | Merge kind | Result |
|---|---|---|---|
| C1 | ed9d8ca25648835ae4c3835ee618c188ef9f6c8c | fast-forward | clean |
| C2 | 6b08cec63d0bcde89997cccdf015f6049616e549 | merge commit (a6e2f05) | clean, after moving aside one stray untracked `reports/C2.md` |
| C3 | 3707afac309d97dbf73ebe152ffaee27912085db | merge commit (1542f8c) | clean |

Base sha: 31a23e24171fe846b406722bd05541a76ced2983 (matches brief).
Integration branch HEAD after all three merges: `1542f8caf23a74b96a7993a6903ae831ce476c31`.

## Gate run (once, after all three merges)

Command: `node scripts/run-tests.mjs` (repo root `/home/ben/Code/wt-cs`), stdout+stderr to
`docs/specs/collect-status-1/reports/integrator-gate.log`.

Tail:
```
ℹ tests 2349
ℹ suites 0
ℹ pass 2345
ℹ fail 0
ℹ cancelled 0
ℹ skipped 4
ℹ todo 0
ℹ duration_ms 21015.379744
```
Exit code 0. Zero failures. No triage needed — nothing to assign to any territory.

## Not done / blocked (reported plainly, not guessed)

- Seam review (docs/specs/collect-status-1/briefs/seam.md): no seam report has been filed
  anywhere under docs/specs/collect-status-1/ or elsewhere in the repo as of this gate run
  (confirmed by `find` across the tree). Per its own brief the seam review runs only after the
  integrator has merged all three territories, so there was nothing to read "once filed" before
  this merge — it simply had not started yet. Not decided by me; the orchestrator should spawn it
  next against HEAD `1542f8c`.
- Sealed suite on a second host: attempted `ssh ben@100.111.119.54` (tailscale `zhuk-vps32`,
  reachable, publickey auth succeeded) — host has `git` but no `node`/`nodejs` on PATH and no
  nvm/volta install found; running the sealed suite there would require installing Node, which is
  out of this job's authorized scope (only the one named Netcup live-proof install is
  authorized). Not run. `ssh ben@100.69.249.18` / `ssh zhuk-netcup` (the Netcup host used for past
  sealed-suite-second-host runs per docs/work/evidence/wr-2026-09-26-janitor-origin-netcup-suite.md)
  both returned "Permission denied (publickey)" from this session — no key access.
- Netcup live proof: blocked for the same reason (no key access to 100.69.249.18 / zhuk-netcup
  from this session). Did not attempt the install; did not fabricate any of the four numbers
  (`systemctl --user list-timers`, first status.md, first RESULT ledger line). This also means the
  check-in-before-Netcup-step requirement is moot here since the step could not be reached at all.

## Stray file handled during merge (housekeeping, not a decision)

Before merging C2, `git merge` refused because an untracked
`docs/specs/collect-status-1/reports/C2.md` already sat in this integration worktree (an earlier
draft of the C2 builder report, textually different from the round-3 version the C2 branch
carries). Moved aside, not deleted, to
`/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/pre-merge-stray/`
(both a copy and the original moved file are there) so the merge could proceed; the branch's own
`C2.md` (round 3, matching the APPROVEd sha) is what landed.
