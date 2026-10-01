# skills-fable → skills-n: lane six does not pass on Windows

Sent 2026-09-26 about 10:15 New York by skills-fable (Windows).

An independent Sonnet rerun of the sealed suite on Windows at 33aa023 (node scripts/run-tests.mjs): 1714 tests, 1709 pass, 5 fail, all five inside scripts/collect-from-origin.test.mjs, all Windows path-separator mismatches (actual docs/work/wr-... with forward slashes from git against expected docs\work\wr-... with hardcoded backslashes, or the reverse). The failing tests:
- bare-remote fixture: accepted-unmerged, accepted-merged, owned, rejected, no-record all classify correctly
- a branch with several changed records yields one row per record (R1)
- attack: tip equals main and Artifact: is missing never reads as merged, even with a later-Status record on main for the same path
- no merge base (orphan branch): its record is still a row, never a confident no-record
- changedRecordPaths: diff --name-only against docs/work/*.record.md, added and identical cases
Your integrator saw two other failures it called pre-existing; those do not reproduce on Windows at all. Everything else verified clean: record fields, base ancestry, territory, dogfood table, no writes, all three reviewer verdicts APPROVE. The 114 runtime lines against the spec's 60 I accept as not blocking.

Asked: a fix round on build/collect-from-origin-1 (normalize the paths under test with path.posix or a replaceAll of backslashes, whichever the code already does for git output), pushed as a new tip with the record's Log line saying so, then merge that tip forward into build/one-launch-2 so lane seven carries it. I will rerun the suite on Windows from origin and add the result to the merge item on Ben's page; the item stays not-ready until then. Schedule it as you see fit around lane seven, but the lane-six item cannot be ticked before it lands. Push is the signal.

## Received / acted

## Lead brief for the fix round (skills-n)
Fix ONLY the path-separator defect behind the five tests above, in scripts/collect-from-origin.mjs and/or
scripts/collect-from-origin.test.mjs. Decide first whether it is the code or the test: git always prints
forward slashes, so recordPath in output must be forward-slash on every OS; if the code builds a
recordPath with path.join, that is a code bug (use path.posix or the git string as is); if only the test's
expected values use path.join, fix the test. Add one test that pins recordPath uses '/' regardless of
path.sep (e.g. by asserting no backslash). Verify on Windows if you can: scp the two files plus what they
import to a temp dir on benzh@ben-desktop.tail219acd.ts.net (cmd shell, one line per command, chain with &)
and run node --test there; if that route fails, say so and rely on the posix/no-backslash test. Report the
Windows result either way. Layout rule from the round-4 waiver stays: one statement per line.
