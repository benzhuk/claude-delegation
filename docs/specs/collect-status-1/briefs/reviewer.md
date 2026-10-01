Task: independently review one territory's delivered diff (C1, C2, or C3 — the orchestrator names
which, and the exact commit range, when spawning you) against docs/specs/collect-status-1/spec.md
and contracts.md, after that territory's own gate is already green. You are read-only: never edit
the territory's files. Verdict `APPROVE` or `NEEDS_FIXES` first, then findings.

Goal: catch what a same-agent gate cannot — a check that passes because it isn't looking, a wrong
decomposition, or a byte the change silently drifted (docs/specs/collect-status-1/spec.md's Aim;
docs/GOALS.md's "Rework after acceptance" measure).

Work: wr-2026-09-27-collect-status (docs/work/wr-2026-09-27-collect-status.record.md) — you never
write to this file; report to the path the orchestrator gives you at spawn.

Inputs (by path):
- docs/specs/collect-status-1/spec.md (whole file — territory sections plus the shared Acceptance
  section)
- docs/specs/collect-status-1/contracts.md (K1/K2/K3 rulings, all pinned, win over spec.md; the
  Process section's attack brief below is lifted directly from it)
- the territory's own brief (docs/specs/collect-status-1/briefs/C1.md, C2.md, or C3.md — read
  whichever one you were spawned to review) and its scout file (scout-C1.md/C2.md/C3.md)
- the territory's own delivered report and gate log (paths given at spawn)

PROJECT FACTS: repo root has no package.json/npm; pure Node ESM + `node:test`, Node v24.18.1; the
sealed test runner is `node scripts/run-tests.mjs <file>`; the bundled reviewer agent has a shell,
so re-running a gate or a revert-and-diff needs no extra tool grant.

Attack brief (contracts.md's Process section, verbatim — every reviewer applies all of these that
touch its territory):
- Can a crafted branch name or record field reach the shell, the systemd/launchd text, or the
  envelope? (C1, C2)
- Can two hosts' collectors double-wake one lead? Rule it: each host has its own slug and its own
  change key, so two installs mean two wakes — the lead installs on Netcup only; does the change
  actually confirm nothing stops a second install, or does it silently claim otherwise? (C1)
- Does a fetch failure ever send a note? (C1: a failed fetch must send no note and must not update
  `announced`.)
- Does `--job`'s default drift any existing byte? Diff the default-job (`--job` omitted or
  `janitor-record`) generated text and `installed.json` before/after the change; any difference at
  all is a finding, however small. (C2)
- A check that passes because it isn't looking: a never-writes assertion that never actually
  exercised a write path, or a `status.md` that would exceed 60 lines on a 40-branch fixture but
  the test fixture used is too small to show it. (C1)
- (C3 only, additive) does the wiring-check.test.mjs length-bump the brief pre-authorized actually
  land at exactly the right new count, and does the new row's `requiresFile` path match the ACTUAL
  path C2's installer writes for the collect job's own installed.json (contracts.md K1), not the
  janitor's?

Evidence format: severity + file:line + measured-count evidence for every finding; a concrete,
ready-to-apply fix (exact old → exact new) for anything mechanical. Verdict first, always.

Report: path given at spawn time. Line 1 is the verdict, first word (`APPROVE`/`NEEDS_FIXES`),
then findings.

Autonomy: decide which of the attack-brief items apply to the specific territory you were spawned
against; skip the ones that plainly don't (e.g. C3 has no shell/systemd surface) rather than
padding the report. Check in only if the territory's own brief and the spec appear to conflict in
a way contracts.md does not resolve.

Un-agent-able steps: live scheduler execution (`schtasks`, `launchctl`, real `systemctl --user`
enable) is not possible on this host for C2's Windows/macOS text — review the generated text only,
say so plainly, never claim a live-execution proof you didn't run.

ETA: 30-45 minutes per territory review. Report or park by then.

Termination: report to the path given at spawn, first line `VERDICT: APPROVE`/`VERDICT:
NEEDS_FIXES`, then stop.
