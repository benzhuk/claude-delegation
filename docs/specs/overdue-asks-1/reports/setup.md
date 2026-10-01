VERDICT: PASS

# Setup report — overdue-asks-1

Base sha: `d5d769f8c5a026a20d06a0e8eee3b4bccd9da9ba` (confirmed to exist in
`/home/ben/Code/wt-oa` and matches its current HEAD/branch `build/overdue-asks-1`).

## Territory worktrees created

Ran `git worktree add <worktree> -b <branch> d5d769f8c5a026a20d06a0e8eee3b4bccd9da9ba`
then `git -C <worktree> rev-parse HEAD` for each territory. Both created cleanly with no
conflicts (neither branch nor worktree path pre-existed).

- O1: worktree `/home/ben/Code/wt-overdue-asks-1-O1`, branch `build/overdue-asks-1-O1`.
  `git rev-parse HEAD` output: `d5d769f8c5a026a20d06a0e8eee3b4bccd9da9ba`.
- O2: worktree `/home/ben/Code/wt-overdue-asks-1-O2`, branch `build/overdue-asks-1-O2`.
  `git rev-parse HEAD` output: `d5d769f8c5a026a20d06a0e8eee3b4bccd9da9ba`.

Both territories' HEAD matches the given base sha exactly (verbatim `git rev-parse`
output, not copied from the prompt).

## Scouting

Ran a read-only survey of the base tree (at d5d769f8...) for each territory's file list
per `skills/team-build/references/scout-brief.md`, and wrote:
- `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/briefs/scout-O1.md`
- `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/briefs/scout-O2.md`

Notable findings folded into the O1 brief: `parseEnvelope`'s output carries no `topic`
field (the spec's "topic the ASK's topic" for the BLOCKED note must be recovered from the
id's own `<from>-<topic>-<n>` shape); the in-process send the pickup uses is `runNoteSend`
from `note-send.mjs` (confirmed via `decisions-pickup.mjs`'s own call site), not
`deliverToInbox` directly; exact line numbers for `main()`, `runPostFlushPickup`,
`drainQuietly`, `switchActive`, and the `--status`/`--json` builders were recorded so the
builder does not have to re-locate them.

Notable findings folded into the O2 brief: `agents/builder.md`'s existing `rm -rf` line
is at line 17 inside the safety-block fence; the constant to edit in
`build-loop-workflow.js` is `BUILD_MANDATE` specifically (not `REVIEW_MANDATE` etc.); no
test currently pins either file's prose beyond `build-loop-workflow.test.mjs`'s R9 check
("every mandate constant carries the note-send prohibition"), so contracts R6's
conditional test-update clause does not currently apply.

## Briefs written

Per-territory briefs (mandate-template shape, spec + contracts + own scout addendum
cited by path):
- `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/briefs/O1.md`
- `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/briefs/O2.md`

Plus:
- Reviewer brief (attack briefs per territory, drawn from contracts R7's "Opus reviewer
  with this attack brief" list for O1 and from the O2 spec/contract text for O2):
  `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/briefs/reviewer.md`
- Integrator brief (full-suite gate `node scripts/run-tests.mjs`, zero failures on Linux,
  per contracts R7, on integration worktree `/home/ben/Code/wt-oa`, branch
  `build/overdue-asks-1`):
  `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/briefs/integrator.md`
- Seam brief (the near-disjoint-files case: O1 and O2 touch no common file, so the seam
  pass is scoped to shared framing/incident-narrative consistency and a cross-territory
  file-touch check, rather than a shared-mechanism check):
  `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/briefs/seam.md`

## Deviations / notes

- No deviations from the computed task text. Both worktree paths, branch names, and
  brief paths are exactly as given in the setup prompt.
- Peer notes were never sent (per the safety rule); no git identity was set or switched;
  no destructive git operations were run; nothing was pushed.
- The integrator brief's full-suite gate was not run as part of this setup step — setup
  only creates worktrees, scouts, and writes briefs; the gate runs after both territories
  land and merge, which is the integrator agent's own job.
