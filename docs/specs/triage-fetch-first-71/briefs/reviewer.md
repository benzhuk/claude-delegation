Task: Adversarially review territory triage71's delivered diff (all of lane 71) against the spec and its builder brief. Read-only; you never edit the territory's files. Verdict first: `APPROVE` or `NEEDS_FIXES (<n>)`.
Goal: work is not lost or stalled by a knowledge-triage run that commits in the chezmoi source and cannot push because origin moved; the run fetches and fast-forwards first, stops with a paste-ready ATTENTION when the source is dirty or diverged before it starts, and recovers one push race by a single rebase.
Work: wr-2026-10-01-triage-fetch-first

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/spec.md (items 1 to 4 are the contract)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/briefs/scout-triage71.md
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/briefs/triage71.md (the builder's brief, so you know what it was asked to do and NOT do, and which scout questions it was allowed to rule on)
- The builder's report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/reports/triage71-builder.md
- The builder's gate log: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/reports/triage71-gate.log
- The proposed skill patch: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/reports/triage71-skill-patch.md
- The incident evidence: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/work/evidence/2026-10-01-post-install-first-runs.md (Step 3 follow-up)
- The territory's worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-triage-fetch-first-71-triage71, branch build/triage-fetch-first-71-triage71, base 3438d7218730d43dcf37069031ff048b1e6d85c8. Read the actual diff there (`git -C <worktree> diff 3438d7218730d43dcf37069031ff048b1e6d85c8...HEAD`), never the report's paraphrase of it.

PROJECT FACTS (at most 25 lines):
- Windows host, Node only, no package.json. There is NO full suite on Windows: re-run `node --test` yourself on scripts/knowledge-triage.test.mjs, scripts/knowledge-publish-sync.test.mjs, every other test file the diff added or changed, and skills/multi/scripts/hooks.test.mjs (N2 spawn-env scan) to confirm the builder's gate log is real. Never run a bare `node --test`, never `node scripts/run-tests.mjs` with no arguments.
- Temp files only under C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-71/, never in a repo. Use scratch bare repos and clones for every live check, built with makeTempHome({ gitIdentity: true }) from scripts/test-home.mjs.
- NEVER touch the real chezmoi source repo (C:/Users/benzh/.local/share/chezmoi), ~/.claude/knowledge, ~/.claude/skills or ~/.agents/knowledge-triage, not even read-write git against them; the real triage job is never run.
- Never run a recursive delete or git clean; never set a git identity (the fixture identity comes from makeTempHome); no commit trailers; never push.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- You do not fix anything. You do not judge the whole-lane seams after merge (outer job vs the skill's publication, the lock): that is the seam reviewer's job. You do not review the triage skill text itself (it is outside the repo).

Evidence format: every finding carries a severity (BLOCKER/MAJOR/MINOR), a file:line or a measured command output, and a concrete fix (exact old -> exact new for anything mechanical). Verdict word first, on its own line, before any prose.

Attack brief, specific things to try:
- Item 1: the preflight runs before ANY write to the knowledge store. Prove it: a dirty tree and a diverged tree leave `_inbox` byte-identical (no imports from gatherKnowledge, no sessions.json, no nested spawn), and the ATTENTION packet exists. Is `receipt.dotfilesBefore` read AFTER the fast-forward? Construct a case where origin gained a commit that touches the DIGEST path: it must NOT be counted as this run's digest commit by `digestCommitSince`. Does a fetch failure, a detached HEAD, a missing origin, an unresolvable repo, or a branch with no upstream ref stop with ATTENTION rather than falling through? Does the ff use `--ff-only` and never create a merge commit? Is anything destructive or identity-touching called (reset, stash, checkout, clean, `-c user.*`, force)?
- Item 2: a push race where origin moves between preflight and the nested commit: remote head equals local head after, history linear, own commit rebased exactly once. Rebase conflict: `rebase --abort` runs, the tree is clean afterwards, ATTENTION names "conflict on rebase". Two or more local commits ahead: must NOT blindly rebase and push (single own commit only). Second push rejection: no second rebase, ATTENTION. Is the push ever `--force` or `--force-with-lease`, or does it push a different branch/ref than the one verified? Does a repair with an unrelated mismatch (no DIGEST change) still defer rather than push?
- Item 3: the three ATTENTION blocks are present, name the repo path and branch, and each command is paste-valid on its own (run each quoted command against the scratch repo in the matching state). The generic lines are byte-unchanged and the one-line BLOCKED note still passes `assertFieldSafe` and the 400-char cap. Ben remains the one who recovers.
- Existing behaviour: all 20 original knowledge-triage tests keep their intent (diff the test file: any weakened assertion is a MAJOR). The fake-git change must not make a green test green by accident (a catch-all that answers every new subcommand with clean/in-sync).
- Process: the job still never takes or clears `.curated-update.lock`; the header comment (knowledge-triage.mjs l.2-8) now tells the truth about fetch, ff and the one repair push; rev4 said "never pushes", so check that the new push is reachable only through the repair path. N2: every spawn in the new test file passes an explicit sealed env; no test sets an identity. Files under 800 lines.
Named failure class: "a safety stop that passes because it is not looking": a dirty/diverged check that a mode-only change, an untracked file, a missing upstream, a shallow ref or a stale tracking ref defeats, or a repair that quietly rewrites history it does not own. Also ask whether any fix is a cause fix or a compensation that hides the symptom.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/reports/triage71-review-r<round>.md. Line 1 is the verdict, first word: `VERDICT: APPROVE` or `VERDICT: NEEDS_FIXES (<n>)`.

A result of zero findings is a good answer, stated plainly, once you have tried every item above and can say so.

Autonomy: you decide severity and whether a finding blocks APPROVE. You do not decide whether to grant a fix round or spawn a fresh builder: that is the orchestrator's call once your report lands.

Un-agent-able steps: none expected; every check runs from a shell in the territory's worktree with scratch repos.
ETA: 30 to 45 minutes per round. Report or park by then.

JUDGMENT: adversarial correctness verdict on the triage preflight (dirty/diverged stop), the one-rebase push repair and the three-state ATTENTION recovery text

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
