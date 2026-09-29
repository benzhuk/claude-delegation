# Lane 53 lead ruling on delta review r2 (NEEDS_FIXES (6) cb66b71)

The review is docs/specs/review-run-53/review-r2.md. All six new findings and the partial items in its verification table are adopted, with one change of design.

- **N1, the sweep kill: take the simpler design, not the /proc identity patch.** The sweep never sends a signal to anything:
  - Remove `defaultKillOrphan`, the `killOrphanFn` injection and the kill call.
  - A stale run whose recorded `childPid` still answers `kill(pid, 0)` is skipped: its dir is left in place, and review-run prints one line naming it.
  - A dead or absent childPid gets the existing cleanup.
  - Reason: a recorded pid is never proof of identity (reuse, forgery). The reviewer's own patch already leaks the dir on darwin and win32. One behaviour on every platform is fewer parts than a Linux-only identity check.
  - Tests:
    - an unrelated live `sleep` whose pid is written as childPid survives the sweep, and its dir is kept, for both the detached and non-detached forms;
    - a dead childPid is still cleaned.
  - Finding 6's original concern, a later sweep deleting a live orphan's working dir, stays fixed, because the dir is kept while the pid is alive.
- **N2, the equals forms:** take the review's patch and unit test as written.
- **N3, the sidecar write:** take the review's rename-based fix.
- **N4:** replace the inert `Write(...)` rule with the documented `Edit(//<abs report>)` form, per the review. `auto` stays the default (lead-ruling-r2).
- **N5:** add the missing sweep tests so that the three named mutants die.
- **N6:** document in SKILL.md that a failed run leaves an empty sidecar.

Live probes: the review's list items 1 to 4, at most 6 real runs, on Netcup, against decoys.
- Probe 3 (dontAsk with the Edit rule) is information only. Whatever it shows, the default stays `auto` in this lane.

Logs are never committed. This is fix round 2 of a cap of 3.
