Task: Run the full-suite gate once per gate request over the integration worktree (after each
territory's branch is merged in), triage any failure to the territory that owns the failing file,
and report pass/fail plus the failure file. You never decide whether a failure is acceptable — you
report it.
Goal: the same two goals the build serves (cleanup has an owner; the wiring check can go red)
without regressing anything else in the suite, and without top-tier tokens spent re-reading a green
run's full log.
Work: wr-2026-09-27-janitor-daily

Inputs (by path):
- docs/specs/janitor-daily-1/spec.md (territory map, acceptance section)
- docs/specs/janitor-daily-1/contracts.md (territory map — every path's single owner, so you know
  which territory a failing file belongs to)
- Each territory's own report and gate log under
  /home/ben/Code/claude-delegation-wt/janitor-daily-base/docs/specs/janitor-daily-1/reports/ (read
  the relevant one only when triaging a specific failure, not up front)

PROJECT FACTS (at most 25 lines):
- Integration worktree: /home/ben/Code/claude-delegation-wt/janitor-daily-base, branch
  build/janitor-daily-1. This is where each territory branch merges.
- Full-suite gate: `node scripts/run-tests.mjs` (no args — walks the whole repo for `*.test.mjs`,
  excluding node_modules/.claude/.git). No package.json, no npm.
- No wrapper script — run the gate command directly, redirect to a log file, and read only the tail
  and the failing test names, not the full scrollback, on a green run.
- Never run `rm`, `rm -rf`, `git clean`, or set a git identity; no commit trailers; never merge with
  `--no-verify`.
- Merging a territory's branch into build/janitor-daily-1 is a normal `git merge` (fast-forward or a
  merge commit) once that territory is `reviewed` (an APPROVE verdict exists) — you run the merge
  when the orchestrator tells you which territory is ready, never on your own schedule.

NOT (out of scope, stated explicitly):
- You do not write or edit any territory's source files. You do not decide whether a failure blocks
  merge — that's the orchestrator's ship decision, informed by your report.
- You do not touch docs/work/*.record.md — that's the orchestrator's alone.
- You do not run a live smoke of the scheduler primitives (systemd/schtasks/launchd) unless
  explicitly asked — that's part of each territory's own acceptance evidence, already gathered by
  its builder/reviewer.

Evidence format: pass/fail per gate run, the exact command and its exit code, and — on failure —
the failing test file names and the first error line for each, not the full stack trace unless
asked.

Report: /home/ben/Code/claude-delegation-wt/janitor-daily-base/docs/specs/janitor-daily-1/reports/integrator.md
Line 1 is the verdict, first word.

Gate: node scripts/run-tests.mjs > /home/ben/Code/claude-delegation-wt/janitor-daily-base/docs/specs/janitor-daily-1/reports/integrator-gate.log 2>&1

State file: /home/ben/Code/claude-delegation-wt/janitor-daily-base/docs/specs/janitor-daily-1/reports/integrator-state.md
Keep it current after every gate run — one line per gate, with the date, which territories were
merged in at that point, and pass/fail.

A result of "still red, same two tests as last run" is a good answer — say so plainly rather than
re-diagnosing from scratch each time.

Autonomy: you may run the gate as many times as the orchestrator requests, and you may re-run a
single failing test file in isolation to confirm a fix landed. You do not decide to skip a failing
test, weaken an assertion, or merge a territory that hasn't been told to you as ready.

Un-agent-able steps: none expected.

ETA: 5–10 minutes per gate run (this suite is small; sealed homes add overhead but nothing close to
a production build). Report or park by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means
read the file; nothing is trusted from a final message alone.
