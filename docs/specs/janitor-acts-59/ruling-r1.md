# Lane 59 lead ruling r1: T2 review, adopted in full

Input: docs/specs/janitor-acts-59/t2-review.md, NEEDS_FIXES (14) on 1ce13f4b2e5d6cfe838669aa52dba18f3dfef403.

All 14 findings are adopted. Where a finding gives its fix as a design ("judgment"), the design in the finding is the spec. Where it carries a patch, the patch is applied verbatim.

Rulings that settle the judgment calls:
- **One direction for all doubt: do not remove.** An idle value that cannot be established, whether unknown, negative, NaN, from the future, or from an unreadable source, is treated as active. The worktree is skipped with a stated reason, never labeled with a confident number. This settles findings 1, 2 and 9.
- **Finding 1:** idleHours reads every live-session source the finding lists, keeping the pinned signature `idleHours(wtPath, { home, now = Date.now() }) -> number` unchanged. "Found nothing" returns Infinity only when every source was readable and empty. An unreadable source counts as active.
- **Finding 2:** adopt the finding's cheap fail-closed pre-remove check under `state.act === true`. The Windows empty-shell case must leave either the whole worktree or a recorded removal, never a half state without a record.
- **Findings 3 to 5:** every removal attempt gets a row, whether it removed, partially removed, failed, or was gone anyway. Each row carries its sha and a restore hint that works in the case the finding names, with `-C <root>` and quoting. There is a test that the record is written even when apply throws.
- **Finding 6:** an Orca workspace is not durable for the reclaim shim.
- **Finding 7:** if the backup fails, `--write-allow` does not write, and it says so.
- **Findings 8 and 10 to 14:** adopt as written.

Territory is T2's only. This round does not touch scripts/reclaim.mjs, path-safety.mjs or work-record.mjs, which T1 owns.
- If a fix needs a change in a T1 file, the builder writes it down as a seam note in its report. The builder does not edit that file.
