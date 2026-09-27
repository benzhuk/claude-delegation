Task: Adversarially review one territory's delivered diff (J1, J2, or J3 — you will be told which,
by name, when spawned) against the spec pack. Read-only; you never edit the territory's files.
Verdict first: `APPROVE` or `NEEDS_FIXES (<n>)`.
Goal: the same two goals the build serves — cleanup has an owner (a stale worktree/branch found
daily, not by memory) and the wiring check can actually go red — without spending top-tier tokens
on anything an agent didn't need to run, and without silently shipping a check that passes because
it isn't looking, or an installer that could touch a real host by accident.
Work: wr-2026-09-27-janitor-daily

Inputs (by path):
- docs/specs/janitor-daily-1/spec.md
- docs/specs/janitor-daily-1/contracts.md (pinned rulings — this file wins over the spec where more
  specific; the J1/J2 seam contract section applies whichever side you're reviewing)
- docs/specs/janitor-daily-1/briefs/scout-<territory-id>.md (that territory's scout addendum)
- docs/specs/janitor-daily-1/briefs/<territory-id>.md (that territory's own builder brief, so you
  know what it was actually asked to do and NOT do)
- The builder's report: /home/ben/Code/claude-delegation-wt/janitor-daily-base/docs/specs/janitor-daily-1/reports/<territory-id>-builder.md
- The builder's gate log: /home/ben/Code/claude-delegation-wt/janitor-daily-base/docs/specs/janitor-daily-1/reports/<territory-id>-gate.log
- The territory's own worktree/branch (you will be told the absolute worktree path and branch name
  when spawned) — read the actual diff there, never trust the report's paraphrase of it.

PROJECT FACTS (at most 25 lines):
- No package.json, no npm. Test runner: `node scripts/run-tests.mjs <file> [file...]`; run it
  yourself against the territory's own test file(s) to confirm the builder's gate log is real,
  don't just read the log.
- Never run `rm`, `rm -rf`, `git clean`, or any deletion; never enable a real scheduler entry; never
  pass `--apply` to janitor.mjs, even to check something.
- Never set a git identity or add commit trailers.

NOT (out of scope, stated explicitly):
- You do not fix anything yourself. You do not review a territory other than the one you were
  spawned for. You do not adjudicate cross-territory seam questions — that's the seam reviewer's
  job, after all territories land.

Evidence format: every finding carries a severity (BLOCKER/MAJOR/MINOR), a file:line or a measured
command output, and a concrete fix — a ready-to-apply patch (exact old -> exact new) for anything
mechanical. Verdict word first, on its own, before any prose.

Attack brief — the priorities and specific things to try, per territory:

**J1 (install-janitor-timer):**
- Does any generated unit, timer, task or plist contain `--apply` anywhere in its command string?
  Grep the generated text itself, not just the source code that generates it.
- Run the installer from a path that looks like a temporary/worktree checkout (its own worktree
  qualifies) without `--force-root` — does it refuse, the way the Codex hooks installer refuses?
- Does the systemd unit's PATH include a directory with `node` in it, or could it silently run with
  no node on PATH?
- Run the installer once, then again — is `installed.json` byte-identical? Does `--dry-run` write
  literally nothing (no directory, no file)?
- Does `--remove` delete ONLY files carrying the installer's own marker line — plant an unrelated
  `janitor-record`-prefixed file without the marker and confirm `--remove` leaves it alone and
  reports it.
- Does the record's host name (from `--host` if added, or the default) stay stable across two
  installs, and does it match the seam contract's `installed.json` shape exactly, field for field?

**J2 (wiring-check):**
- Point a `hook_present` check's settings file at a JSON with a COMMENTED-OUT or DIFFERENT-COMMAND
  hook — confirm it reports `missing`, not `ok`. A raw substring match that a commented-out hook
  could satisfy is a BLOCKER.
- Point any check at a settings file with unreadable permissions or invalid JSON — confirm
  `unknown` with a reason, never `ok`.
- Before the exit-code change: does the builder's report actually list every caller of
  `wiring-check`/`checkWiring` and confirm none depends on the old exit-0-always contract? If the
  report skipped this, that's a finding regardless of whether the code happens to be safe.
- Confirm the `last-run.log` `file_fresh` check reads `unknown` (not `missing`) when
  `installed.json` doesn't exist (J1 never installed), and `missing` once `installed.json` exists
  but the log doesn't — per the seam contract's exact state table.
- Confirm `--json`/`--line` output text is byte-identical to before except the new checks appear;
  confirm the new exit-code behavior doesn't break `scripts/janitor.test.mjs`'s embedded WIRING
  caller.

**J3 (docs paragraph):**
- Is it exactly one paragraph, in one of the three named candidate docs, never the changelog, never
  a new file?
- Does it name the exact command and say to report both the line and the exit code?
- No code, no test changed — confirm the diff touches only the doc file named in the report.

Named failure class for every territory: "a check that passes because it isn't looking, or an
unknown rendered as a confident number." Also ask, for J1/J2: is any fix here a CAUSE fix or a
COMPENSATION that hides a symptom without removing the defect (this lane isn't a bug-fix lane, but
the same question catches a guard that silences a state instead of reporting it honestly).

Report: /home/ben/Code/claude-delegation-wt/janitor-daily-base/docs/specs/janitor-daily-1/reports/<territory-id>-review-r<round>.md
Line 1 is the verdict, first word: `VERDICT: APPROVE` or `VERDICT: NEEDS_FIXES (<n>)`.

State file: /home/ben/Code/claude-delegation-wt/janitor-daily-base/docs/specs/janitor-daily-1/reports/<territory-id>-reviewer-state.md

A result of zero findings is a good answer, stated plainly, once you've actually tried every item
in the attack brief above and can say so.

Autonomy: you decide severity and whether a finding blocks APPROVE. You do not decide whether to
grant a fix round or spawn a fresh builder — that's the orchestrator's call once your report lands.

Un-agent-able steps: none expected — every check above runs from a shell in the territory's own
worktree with a fixture home.

ETA: 30–45 minutes per round. Report or park by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means
read the file; nothing is trusted from a final message alone.
