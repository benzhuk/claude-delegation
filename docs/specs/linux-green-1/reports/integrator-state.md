# integrator state — linux-green-1

## Run 1 — 2026-09-26

- Merged `build/linux-green-1-L1` (L1, sha `a1be58949d77617e19f462a8277a89e0ca849281`, reviewed
  APPROVE at that exact sha in `docs/specs/linux-green-1/reports/L1-review-3.md`) into
  `build/linux-green-1` in `/home/ben/Code/wt-lg`. Merge commit `d93e3f2b87053d8253cf1ce38ea00625cf0f27b3`
  (`git merge --no-edit build/linux-green-1-L1`; no conflicts — the only pre-existing dirty files in
  this worktree, `L1-gate.log`/`L1-state.md`, were untouched by the merge diff).
- Ran `node scripts/run-tests.mjs > docs/specs/linux-green-1/reports/integrator-gate.log 2>&1`.
  Exit 1. Summary: `1778 tests, 1774 pass, 1 fail, 3 skipped, 0 cancelled, 0 todo`.
- The one failure: `skills/decisions/scripts/registered-pickup.contract.test.mjs:98:1` — "one
  injected selection invokes exactly one bound entry and maps lifecycle states to safe summaries".
  Not `hooks/delegation-reminder.test.mjs` (the one named flake in contracts.md R4) — no special
  rerun-alone step applied.
  Not in L1's territory map (L1 touches only `skills/multi/scripts/transport.mjs`,
  `note-send.test.mjs`, `mirror-shim.test.mjs`, `scripts/mirror-shared-skills.mjs`); this file was
  untouched by the merge (`git log` shows no commit touching it since before base).
  Diagnostic-only reruns of this single file alone (`node --test
  skills/decisions/scripts/registered-pickup.contract.test.mjs`, 5x, outside the sealed run, purely
  to characterize it — not a re-run of the gate itself): failed 1/5 times, same assertion, same two
  literal page values swapped. Looks order-dependent on `mkdtempSync`'s random directory-name
  suffix (the canonical sort in the test compares `path.resolve(repo)` strings, and the two fixture
  prefixes differ only by the literal `"two-"` infix, so a random suffix can sort either side of
  it). This is a real, intermittent failure — not the named flake, so it is reported as a blocker
  per R4, not waived.
- Verdict this run: **FAIL** (R4's zero-failures bar; 1 failing test).
- Sealed-home artifact left by the runner for inspection: `/tmp/sealed-home-ZoprdT` (not removed —
  script-created, may be useful for triage).

Next: awaiting orchestrator triage/decision. If L1 re-lands or the orchestrator directs a re-run,
re-run the gate and update this file.
