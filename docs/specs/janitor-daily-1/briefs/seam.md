Task: After J1 and J2 have both reached a reviewed (APPROVE) state, run one adversarial pass scoped
ONLY to the seam between them — the pinned contract in docs/specs/janitor-daily-1/contracts.md's
"Seam contract between J1 and J2" section — since no per-territory reviewer ever looks at the
joint, and the integrator's gate is mechanical, not adversarial.
Goal: the two goals this build serves stay true TOGETHER, not just inside each territory — a
host that has run J1's installer and then J2's wiring check gets the state the contract promises,
not two correct halves that disagree at the boundary.
Work: wr-2026-09-27-janitor-daily

Inputs (by path):
- docs/specs/janitor-daily-1/contracts.md (the pinned Seam contract section — your whole scope is
  this section, read literally)
- docs/specs/janitor-daily-1/spec.md (Territory J1 item 2, Territory J2 item 2's `file_fresh` bullet
  — read for context, the contracts.md ruling wins on any conflict)
- Both territories' delivered reports:
  /home/ben/Code/claude-delegation-wt/janitor-daily-base/docs/specs/janitor-daily-1/reports/J1-builder.md
  and .../J2-builder.md, and their latest review reports (.../J1-review-r<n>.md, .../J2-review-r<n>.md)
- The merged integration worktree at /home/ben/Code/claude-delegation-wt/janitor-daily-base, branch
  build/janitor-daily-1, once both territories are merged into it — read the actual merged code, not
  the reports' paraphrase of it.

PROJECT FACTS (at most 25 lines):
- No package.json, no npm. Test runner: `node scripts/run-tests.mjs <file> [file...]`.
- Never run `rm`, `rm -rf`, `git clean`, or set a git identity. Never pass `--apply` to janitor.mjs.
  Use a fixture/scratch home for any live check — never the real `~`.
- The seam's exact claims to verify, live, in a scratch home:
  1. `installed.json`'s shape is exactly
     `{"schema":1,"repo":"<abs repo path>","node":"<abs node path>","hour":<int>,"scheduler":"systemd-user"|"schtasks"|"launchd","name":"janitor-record"}`.
  2. The scheduled command is exactly `<node> <pluginRoot>/scripts/janitor.mjs --record --repo
     <repo>` (plus `--host <name>` only if J1 added that flag) — confirm the literal string, and
     confirm `--apply` appears nowhere in it.
  3. J2's `last-run.log` `file_fresh` check: `unknown` when `installed.json` is absent (never
     `missing`); `missing` when `installed.json` exists but the log doesn't; `stale` past 26h;
     `ok` otherwise. Test all four states in one scratch home by creating/removing the two files by
     hand.

NOT (out of scope, stated explicitly):
- Re-reviewing either territory's own internal correctness (its own reviewer already did that) —
  you look only at the boundary between them.
- J3's doc paragraph — no seam with that territory exists.
- Fixing anything yourself — you report findings for the orchestrator to route back to whichever
  territory owns the file.

Evidence format: every finding carries a severity (BLOCKER/MAJOR/MINOR), the exact command you ran
and its exact output (not paraphrased), and which territory's file needs the fix.

Report: /home/ben/Code/claude-delegation-wt/janitor-daily-base/docs/specs/janitor-daily-1/reports/seam-review.md
Line 1 is the verdict, first word: `VERDICT: APPROVE` or `VERDICT: NEEDS_FIXES (<n>)`.

State file: /home/ben/Code/claude-delegation-wt/janitor-daily-base/docs/specs/janitor-daily-1/reports/seam-state.md

A result of "seam holds, all four states verified, quoted below" is a good answer when it's true —
say so plainly with the quoted output, rather than padding with unnecessary caveats.

Autonomy: you decide whether a seam mismatch is a BLOCKER (breaks the contract's literal promise)
or a MINOR (cosmetic drift that doesn't change behavior). You do not decide which territory's
builder gets the fix round — report the finding, tagged with the owning territory, and the
orchestrator routes it.

Un-agent-able steps: none expected — everything here runs from a shell against a scratch home.

ETA: 30–45 minutes (JUDGMENT: adversarial correctness verdict on a pinned cross-territory contract
— this mandate is bought at opus/high-tier). Report or park by then.

JUDGMENT: seam contract compliance, byte-exact

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means
read the file; nothing is trusted from a final message alone.
