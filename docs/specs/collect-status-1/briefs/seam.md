Task: one read-only pass across the C1/C2/C3 joints, after all three territories have their own
`APPROVE` and are merged onto the integration branch. You look only at the boundaries — the call
sites where C2's generated command invokes C1's CLI, the note C1 sends, and C3's wiring check
reading the path C2's installer actually writes — that per-territory reviewers never saw. Verdict
`APPROVE`/`NEEDS_FIXES` first, then findings.

Goal: seams are reviewed by no one unless someone is assigned the seam specifically (docs/specs/
collect-status-1/spec.md's Acceptance section requires this explicitly: "one seam review across
the timer's command seam and the note the collector sends"); docs/GOALS.md's "Rework after
acceptance" measure.

Work: wr-2026-09-27-collect-status (docs/work/wr-2026-09-27-collect-status.record.md) — you never
write to this file; report to the path given at spawn.

Inputs (by path):
- docs/specs/collect-status-1/spec.md — the Territory section's contract lines (K1 Paths' pinned
  shapes live in contracts.md, not spec.md) and the Acceptance section's seam-review sentence
- docs/specs/collect-status-1/contracts.md — K1 Paths (the pinned default `--out`, the collect
  job's OWN `~/.agents/collect/installed.json`, never the janitor's), K2 The note (host
  sanitization, state-token allowlist, envelope rules), K3 Installer (`--job collect-status`'s
  exact seam requirements), Process (the attack brief below is lifted from here)
- the merged integration branch itself (`build/collect-status-1` in /home/ben/Code/wt-cs, once the
  integrator has merged all three territories) — read the actual merged files, not the individual
  territory worktrees, since a merge can itself introduce a seam defect
- each territory's final report (docs/specs/collect-status-1/reports/C1.md/C2.md/C3.md)

PROJECT FACTS: repo root has no package.json/npm; pure Node ESM + `node:test`, Node v24.18.1; the
sealed test runner is `node scripts/run-tests.mjs <file>`; you have a shell for a mechanical check
(re-running a gate, a revert-and-diff) with no extra tool grant.

Attack brief (contracts.md's Process section, verbatim, applied specifically at the three seams):
- The C2→C1 command seam: does the argv `scheduledCommandArgv` builds for `--job collect-status`
  actually match a flag `scripts/collect-status.mjs` really parses (`--repo`, `--to`, `--host`,
  `--out`) — not a flag C2 guessed at before C1 landed? A crafted `--repo`/`--to`/`--host` value
  reaching a shell (it must not — argv array, never shell string) or smuggling `--apply` through.
- The C1 note seam: does the note's `--text`/`--goal` ever carry a branch name, record path, or any
  origin-supplied string (K2 says never — integers and state tokens only)? Does a fetch failure
  ever still send a note or update `announced`?
- The C1/C3 wiring seam: does `collect-status-fresh`'s `file` and `requiresFile` in
  `required-wiring.default.json` match, byte for byte, the ACTUAL default `--out` path C1's CLI
  resolves and the ACTUAL `installed.json` path C2's `--job collect-status` writes — not what any
  one territory's brief assumed before the others landed?
- Two hosts' collectors double-waking one lead: confirm each host's own slug and own `previous.json`
  change key really do make two installs mean two independent wakes, never a shared/racing one.
- Does `--job`'s default (`janitor-record`, omitted) drift any existing byte anywhere in the merged
  tree, now that all three territories' changes are together?

Evidence format: severity + file:line + measured-count evidence (an actual diff, an actual argv
dump, an actual generated file's bytes) for every finding, never a plausibility argument alone.
Verdict first, always.

Report: path given at spawn time. Line 1 is the verdict, first word (`APPROVE`/`NEEDS_FIXES`),
then findings.

Autonomy: read-only across the whole merged tree; never edit a file. Check in with the
orchestrator if a seam defect looks like it requires re-opening a territory that already reported
`APPROVE` from its own reviewer — that decision is the orchestrator's, not yours.

Un-agent-able steps: none — this review needs only the merged tree and its test suite, which
already exist once the integrator has merged.

ETA: 30-45 minutes. Report or park by then.

Termination: report to the path given at spawn, first line `VERDICT: APPROVE`/`VERDICT:
NEEDS_FIXES`, then stop.
