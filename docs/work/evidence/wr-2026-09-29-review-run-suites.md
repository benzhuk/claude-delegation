VERDICT: PASS 643a8626b7cf3b8d9711e7640ee95a548d9fb69a (lead-run suites and acceptance gates, supporting evidence, not the deciding review)

# Lane 53 suites and acceptance gates at 643a862

## Suites

- Linux (Netcup), from the fix round 4 builder (docs/specs/review-run-53/build-r4.md) and rerun by the r4 Opus reviewer. TMPDIR=/var/tmp, because /tmp on this host was at 100 percent inode use.
  - skills/team-build/scripts/review-run.test.mjs: 67 pass, 0 fail.
  - node scripts/run-tests.mjs: 2998 tests, 2993 pass, 0 fail, 5 skipped. The skips are pre-existing and platform-conditional.
- Windows (ben-desktop), a fresh clone of the bundle at 643a862 with origin/main fetched:
  - review-run.test.mjs: 67 tests, 48 pass, 0 fail, 19 skipped. The skips are win32 only and per test, with the reason "no spawnable fake claude on win32; covered by the live Windows probe".
  - node scripts/run-tests.mjs: 2998 tests, 2965 pass, 0 fail, 33 skipped, about 170 s.
- Earlier, at 1b62edb, Windows had 23 fails and a 40-minute hang, all from spawn EFTYPE. Fix round 4 fixed it (docs/specs/review-run-53/lead-ruling-r4.md).

## Live probes

- Netcup, across rounds 1 to 4: docs/specs/review-run-53/build.md, build-r1.md, build-r2.md, probes-r2.md.
  - The final state at the code under review:
    - all git global-option forms are denied, both space and equals spellings;
    - P5 has 0 denials and the report is written;
    - P1 shows no CLAUDE.md or rules visible;
    - P3 recursion exits 6;
    - P4 is unchanged.
  - Writes the classifier approves outside the clone remain, at parity with the Agent-tool reviewer (lead-ruling-r2).
- Windows (ben-desktop), W-P5 and W-P7. skills-fable ran them from its own pane, because over the ssh key login claude.exe cannot reach its login (docs/specs/review-run-53/winprobe-ssh.md). The runner's report is docs/specs/review-run-53/winprobe-live.md.
  - W-P7 passes: all three attack commands were denied, and the decoy's local hooksPath is unchanged.
  - W-P5: exit 0, a VERDICT first line, the real claude.exe, model opus, and the worktree cleaned up.
  - Its one denial was the machine's identity guard refusing a chained, read-only `git config --get`. That is not review-run behaviour. The runner's own FAIL line rests on two of the lead's probe criteria, which the lead withdrew because they are not in the spec. See the record's Log.

## Acceptance gates (lead-ruling-redteam.md M8)

- **a2 (quality): PASS.**
  - Evidence: docs/specs/review-run-53/a2-clean/.
  - review-run on 90beeb9 with a clean brief returned `VERDICT: NEEDS_FIXES (3) 90beeb9...`. The brief was lane 49's standing review brief, verbatim, plus the sha and the author's delivery note.
  - Its F1 names the production Stop-null mutant gap from docs/work/wr-2026-09-28-codex-followups.record.md line 32, proved with its own production mutants.
  - An earlier a2 run is not counted: its reconstructed brief was written from line 32 itself (docs/specs/review-run-53/gates-a2-b.md).
- **b (Codex-launched): PASS.**
  - Evidence: docs/specs/review-run-53/gates-a2-b.md.
  - Launched from inside `codex exec`: exit 0, `VERDICT: NEEDS_FIXES (3)` on the decoy, 0 denials.
  - Escalation needed: `--sandbox workspace-write` fails with EROFS before the reviewer starts, because of writes outside the workspace. `--sandbox danger-full-access` works.
