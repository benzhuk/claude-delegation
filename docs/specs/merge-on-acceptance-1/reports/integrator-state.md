# Integrator state — merge-on-acceptance-1

Run 1 (2026-09-26): both territories merged, gate run once.

- M1 merged: `build/merge-on-acceptance-1-M1` @ e5d10f5b1fc011aade8854ca888834a3ee6a1932
  (reviewer APPROVE, round 2) — merge commit 4e43538.
- M2 merged: `build/merge-on-acceptance-1-M2` @ 8ada6f290b1b95150e48e4cd5b82aab7cd8daea7
  (reviewer APPROVE, round 2) — merge commit f3ec533.
- Integration head after both merges: `f3ec5333b9e91847fc86be4c4f7f98e9ea951a26`
  (`git rev-parse HEAD` in `/home/ben/Code/wt-moa`, branch `build/merge-on-acceptance-1`).
  No conflicts in either merge.
- Off-limits check: `git diff --stat 6d8ba95 HEAD -- scripts/ hooks/ .codex-plugin/
  docs/GOALS.md README.md skills/decisions/scripts/` is empty — neither territory touched
  off-limits paths.
- Gate: `node scripts/run-tests.mjs > .../reports/integrator-gate.log 2>&1`, run once from
  `/home/ben/Code/wt-moa` at head f3ec533.
  - Summary: 1727 tests, 1722 pass, 2 fail, 0 cancelled, 3 skipped, 0 todo.
  - Failures: `skills/multi/scripts/mirror-shim.test.mjs:269` (V4) and
    `skills/multi/scripts/note-send.test.mjs:367` (H6).
  - Re-confirmed base-not-new: checked out base `6d8ba95` into a detached scratch worktree
    and ran `node --test skills/multi/scripts/mirror-shim.test.mjs
    skills/multi/scripts/note-send.test.mjs` there. Both V4 and H6 fail there too, same test
    names/lines, same assertion shape (V4: `SKILL_FILE_EXCLUDE let a .test.mjs file
    publish`, actual false vs expected true; H6: path-prefix assertion, actual has the
    worktree's own absolute path prefixed onto the Windows path). Confirmed pre-existing on
    this host (Netcup), not new. Scratch worktree removed after the check.
  - No test name outside {V4, H6} failed. Verdict: PASS.

No further rounds needed — both territories approved on the first check of their exact
shas; gate passed with only the two known base failures. This is the final state.
