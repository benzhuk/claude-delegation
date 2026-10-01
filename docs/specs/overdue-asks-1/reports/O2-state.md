# O2 state

## Territory
`agents/builder.md` and the `BUILD_MANDATE` constant in
`skills/team-build/references/build-loop-workflow.js` — one pinned sentence, verbatim,
in each file. No other change.

## Contracts I rely on
- contracts.md R6: O2 owns exactly these two files/edits; gate is
  `node --test skills/team-build/references/build-loop-workflow.test.mjs`; no builder
  writes `docs/work/`; no builder deletes any directory, own scratch included.
- scout-O2.md (read from `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/briefs/scout-O2.md`
  — the brief's stated path under wt-overdue-asks-1-O2 does not exist in this worktree;
  these setup-authored briefs/reports live only in the lead's wt-oa worktree, untracked,
  since my branch (build/overdue-asks-1-O2) forked from the same base commit before they
  were written there): pins insertion at `agents/builder.md:17` (beside it) and the
  `BUILD_MANDATE` constant (not any other mandate); confirms no test pins BUILD_MANDATE's
  exact wording beyond the R9 "Never send peer notes." check.

## Done
- Round 2 fix for review finding F1 (BLOCKER): moved the new bullet in
  `agents/builder.md` out of the shared `<!-- safety-block:.. -->` fence (which
  `agents/agents.test.mjs` pins byte-identical across all four agent files, at exactly
  11 bullets, under 2100 chars) to the first bullet of the builder-only list, right
  after `<!-- safety-block:end -->`. Verified `node --test agents/agents.test.mjs` now
  gives 24 pass / 0 fail (was 21/3 before the fix).
- Inserted the sentence inline into `BUILD_MANDATE` (still one JS string, one line),
  placed after the "no destructive git (...)" clause and before "Never send peer
  notes.", with the sentence's own apostrophe escaped (`lead\'s`) per the file's
  existing single-quote-string convention (see `markerFlag` line ~354).
- Left all four other mandate constants (`REVIEW_MANDATE`, `INTEGRATE_MANDATE`,
  `SETUP_MANDATE`, `ACCEPT_MANDATE`) byte-for-byte unchanged (confirmed via `git diff`:
  only agents/builder.md +1 line, build-loop-workflow.js one line changed).
- `node --check` on the .js file: syntax OK.
- Gate run: `node --test skills/team-build/references/build-loop-workflow.test.mjs` —
  83 pass, 0 fail, including both R9 tests ("every mandate constant carries the
  note-send prohibition" and the cross-prompt R9 check). Log at
  `docs/specs/overdue-asks-1/reports/O2-gate.log`.
- Round 1 committed at 90a5fb8f232cabbd5d13c75b9ea4fe8e86aea992 (branch
  build/overdue-asks-1-O2); round 2 fix committed separately, see O2-report.md's
  Commit section for the final sha.
- Did not touch `skills/team-build/references/build-loop-workflow.test.mjs` (no test
  pins BUILD_MANDATE's exact prose beyond the R9 phrase check, which still passes).
- Did not touch `docs/work/`.
- Did not delete any directory, including my own scratch (none used beyond the report
  dir, which was `mkdir -p`'d, never removed).

## Next
- Nothing outstanding for O2. Territory is complete pending integration.

## Open questions
- None outstanding. The one open question in scout-O2.md (whether a second `rm -rf`
  prohibition exists elsewhere in build-loop-workflow.js beyond BUILD_MANDATE) was
  checked by grep across all five mandate constants: only BUILD_MANDATE and
  SETUP_MANDATE mention `rm -rf`, and R6/the spec name only the builder's own mandate;
  SETUP_MANDATE was left untouched per the brief's explicit NOT-in-scope list.

## How to run my gate
`cd /home/ben/Code/wt-overdue-asks-1-O2 && node --test skills/team-build/references/build-loop-workflow.test.mjs`
