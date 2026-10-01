Task: In worktree `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-decisions-wedge-64-wedge64` (branch `build/decisions-wedge-64-wedge64`, base 0d9cdeb539a6f23e7974cdea589fb0d3b127f2f9) implement spec.md scope items 1-4 of Lane 64: (1) clearing Done and accounting a pickup round become one step, with no path that clears Done without accounting; (2) a round whose owner inputs are all quoted in `docs/decisions/history/` on origin is admitted as closed; (3) the owner binding follows the lead that runs the pickup, not the first lead that ever ran it; (4) a regression test for each of the three, built from a synthetic fixture of the 9/30 wedge. Done means the gate below is green and each regression test is shown failing at the base sha (scripts/prefix-test.mjs) and passing on your branch. Item 5 (the live close and publish on the real page) is the lead's, not yours.
Goal: stop the decisions page wedging (round 3 stuck in NEEDS_RECONCILIATION, `account` and `publish` both refusing); measure: work lost or stalled.
Work: wr-2026-10-01-decisions-wedge (docs/work/wr-2026-10-01-decisions-wedge.record.md in the integration worktree `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64`; read-only for you, the lead writes it).

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/spec.md (the pinned scope, "Not in scope" list, and the rules for all lanes; there is no separate contracts.md, spec.md is the contract)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/briefs/scout-wedge64.md (file and line survey, the tests that police this area, and the open questions; read it before you start)
- Background, read-only: C:/Users/benzh/.agents/handoff-0930/consolidation-state.md and C:/Users/benzh/Code/zhuk-infra/claude-delegation/docs/notes/skills-fable-pickup-r3-accounted-1.md

PROJECT FACTS (repo-specific; your own instruction files are not loaded for you):
- Pure Node, no build step, no install. Windows host: there is NO full suite here; run `node --test` only on the files you changed or added. The lead runs the full suite on Netcup and Hetzner.
- Territory files: skills/decisions/scripts/decisions-pickup.mjs, decisions-render-publish.mjs, decisions-render.mjs (CLI wiring only), their `.test.mjs` files, registered-pickup.contract.test.mjs, skills/decisions/SKILL.md plus skill-text.test.mjs, and new fixtures under skills/decisions/scripts/fixtures/wedge-930-64/. skills/multi/scripts/note-flush.mjs only if you can show the CONFIG_INVALID cause is in repo code rather than host config.
- Tests run sealed: use `makeTempHome` from scripts/test-home.mjs; every child process goes through the `childEnv()` helper from skills/multi/scripts/test-child-env.mjs, never a bare spread of the parent's environment. Never read, copy or write the real `~/.agents/ws/decisions-pickup` (private captures and the live receipt); synthesise the 9/30 wedge fixture from the receipt shape in scout-wedge64.md and the three quoted history facts in spec.md.
- Header-line shape for report fields: `/^[ \t*+-]{0,20}<Label>:\**[ \t]{0,20}(.+)$/mi`.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.
- Never set or switch a git identity, no `--no-verify`, no force, no recursive deletes, no reset/clean/stash. Commit on your branch only, conventional messages, no trailers. Never push. Never send peer notes.
- Lane 62 is running against the same hosts; stay inside your file list.

NOT (out of scope, stated explicitly):
- Any live action: no `notion.js` read or write, no `decisions-render.mjs publish` against the real page, no `account` or `pickup --once` against the real receipt, no edit of the host's `registrations.json` or any receipt. The lead does these (spec item 5; "do not hand-edit the receipt or the page").
- The publish-without-pickup redesign, new page sections, any waiver flag (spec "Not in scope").
- `docs/work/` (lead is the only writer), `docs/decisions/history/`, and every file outside the territory list above.
- No integration-wide test run; your gate is scoped.

Rulings you may not make silently: the four open questions at the bottom of scout-wedge64.md (one-step outcome source; which command admits a history-closed round and whether attestation stays; how "the lead that runs the pickup" is identified and what to do with registered-pickup.contract.test.mjs:181; project rebinding after the repo move). Take the narrowest reading that keeps every existing sibling test green, implement only that, and list each such choice under a "Rulings needed" heading in your report with the alternative you did not take. If a question cannot be answered without widening scope, park and report BLOCKED with the question.

Evidence format: cite `file:line` for every claim; for each of the three regression tests give the test name, its path, and the scripts/prefix-test.mjs exit code and one-line result at base 0d9cdeb539a6f23e7974cdea589fb0d3b127f2f9; quote the exact receipt-state or error string before and after for the wedge fixture.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/wedge64-report.md. Line 1 is the verdict, first word.

Gate: node --test skills/decisions/scripts/decisions-pickup.test.mjs skills/decisions/scripts/decisions-render-publish.test.mjs skills/decisions/scripts/registered-pickup.contract.test.mjs skills/decisions/scripts/skill-text.test.mjs <every other test file you add or change> > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/wedge64-gate.log 2>&1. Read only the tail and the failing names. No wrapper script.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/wedge64-state.md. Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: decide implementation details inside your file list without checking in (function boundaries, fixture layout, test names, SKILL.md wording). Check in (park with a report) before editing any file outside the list, before changing the assertion of an existing test other than registered-pickup.contract.test.mjs:181 (and then only as the narrow reading of item 3 requires), and on any of the four open questions the narrow reading cannot settle.

Un-agent-able steps: item 5 (the live close of round 3 and `publish` on page 3e1da11277a18174bccfea187d5c3972), the Netcup and Hetzner full-suite runs, the host registration repair, the push, and accept are all the lead's, scoped out of your "done".

ETA: 90-120 minutes (three behavior changes in two large files plus fixtures). Report or park by then.

Fix kind: bug
Class: decisions-pickup-wedge
Regression test: skills/decisions/scripts/decisions-pickup.test.mjs
Base sha: 0d9cdeb539a6f23e7974cdea589fb0d3b127f2f9

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
