DONE 610d0cb80c821aba7f3a174542dcc7acf25bf9a0

# C2 round 3 report — N1 only

## Disposition

| Finding | Disposition | Test(s) | Commit |
|---|---|---|---|
| N1: R1 condition 5 not enforced (cat/tee heredoc target ending in a script suffix stayed exempt) | Fixed | `R1 condition 5: cat/tee heredoc target ending in ${suffix} is refused, all three head shapes` (×11 suffixes: .sh, .bash, .zsh, .ps1, .psm1, .cmd, .bat, .py, .js, .mjs, .cjs), `R1 condition 5: the suffix check is case-insensitive (x.SH refused, all three head shapes)`, `R1 condition 5: only the FINAL suffix counts — x.md.sh is refused (ends in .sh)`, `R1 condition 5: only the FINAL suffix counts — x.sh.md passes (ends in .md, not a disallowed suffix)`, `R1 condition 5: report.md and x.txt still pass — no disallowed suffix, all three head shapes` (all in `hooks/delete-guard.test.mjs`) | `610d0cb80c821aba7f3a174542dcc7acf25bf9a0` |

## Fix

`findHeredocSafeSpans` in `hooks/delete-guard.mjs` now extracts the write target for the
`cat`/`tee` shapes (`CAT_LINE_RE`'s existing redirect-target groups; `TEE_LINE_RE` gained a
capture group for its previously-uncaptured filename) and refuses the whole command — same
as any other condition-5 miss, `return []` — when that target's name ends, final suffix
only, case-insensitively, in `.sh`, `.bash`, `.zsh`, `.ps1`, `.psm1`, `.cmd`, `.bat`, `.py`,
`.js`, `.mjs` or `.cjs` (`HEREDOC_DISALLOWED_SUFFIX_RE`). `note-send`/`git commit -F -` name
no target file, so condition 5 does not apply to them (unchanged). Header comment
(`hooks/delete-guard.mjs:75-102`) updated with a paragraph naming condition 5's rule and
the `x.md.sh` refuses / `x.sh.md` passes distinction.

## Repro: before/after

Ran `reports/C2-r2-suffix-probe.mjs.txt` (copied to a scratch dir, `new` symlinked to the
worktree) against 1b8f23d (before) and 610d0cb (after). All 24 cases plus an extra probe
covering the remaining suffixes not in the original 8-file list (`.bash`, `.zsh`, `.cmd`,
`.bat`, `.psm1`, `.js`, `.cjs`, `.PY`, `.Mjs`, `.sh.md`) and all three head shapes each:

| Target | Before (1b8f23d) | After (610d0cb) | Expected |
|---|---|---|---|
| `report.md` | pass | pass | pass |
| `x.sh` | pass (bug) | refuse | refuse |
| `x.py` | pass (bug) | refuse | refuse |
| `x.mjs` | pass (bug) | refuse | refuse |
| `x.SH` (case) | pass (bug) | refuse | refuse |
| `x.ps1` | pass (bug) | refuse | refuse |
| `x.txt` | pass | pass | pass |
| `x.md.sh` (final suffix `.sh`) | pass (bug) | refuse | refuse |
| `x.bash`/`x.zsh`/`x.cmd`/`x.bat`/`x.psm1`/`x.js`/`x.cjs`/`x.PY`/`x.Mjs` | pass (bug) | refuse | refuse |
| `x.sh.md` (final suffix `.md`) | pass | pass | pass |

All three head shapes (`cat > f <<'EOF'`, `tee f <<'EOF'`, `cat <<'EOF' > f`) behaved
identically within each row, before and after.

## Gate

1. `node --test hooks/delete-guard.test.mjs agents/agents.test.mjs`:
   `tests 212`, `pass 212`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0` (197 round-2 tests
   + 15 new N1 tests).
2. `node scripts/run-tests.mjs > reports/C2-r3-gate.log 2>&1`:
   `tests 2661`, `pass 2655`, `fail 1`, `cancelled 0`, `skipped 5`, `todo 0`. The one failure
   is the pre-existing `docs/GOALS.md` STALE test at `scripts/work-record.test.mjs:2340`
   (`doesNotMatch` against the "152 turns (no source record" phrase) — confirmed unrelated:
   my diff touches only `hooks/delete-guard.mjs` and `hooks/delete-guard.test.mjs`, and this
   same failure is noted as pre-existing at base in `reports/C2-state.md` (round 2) and in
   `addendum-C2-r2.md`.

## Scope note

Only N1 was in scope for round 3 per the task. No other files touched; no other findings
from `C2-r2-findings.md` were revisited.
