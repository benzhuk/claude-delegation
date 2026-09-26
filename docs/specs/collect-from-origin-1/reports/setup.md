VERDICT: PASS

# Setup report — collect-from-origin-1

Spec pack: /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/spec.md
Base sha: 5f057a3959323bd0fd01231e6fe6d47688991cec (confirmed an ancestor of ac9c842; this
base already carries the ac9c842+05b9bcc merge per contracts.md's own note)

## Worktrees created

Command run for each: `git worktree add <worktree> -b <branch> 5f057a3959323bd0fd01231e6fe6d47688991cec`
then `git -C <worktree> rev-parse HEAD`.

- C1: worktree /home/ben/Code/wt-collect-from-origin-1-C1, branch
  build/collect-from-origin-1-C1. `git rev-parse HEAD` output verbatim:
  `5f057a3959323bd0fd01231e6fe6d47688991cec`
- C2: worktree /home/ben/Code/wt-collect-from-origin-1-C2, branch
  build/collect-from-origin-1-C2. `git rev-parse HEAD` output verbatim:
  `5f057a3959323bd0fd01231e6fe6d47688991cec`

Both worktrees are clean freshly-cut branches at the base sha (no commits yet — headSha
equals baseSha, as expected before any builder has run). Verified with
`git worktree list` immediately after creation; both entries present, correct branch
each.

## Scouting

One scout pass (this session, read-only, no worktree created for it — surveyed the base
tree directly per skills/team-build/references/scout-brief.md) over both territories,
written before either territory's brief:

- /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/briefs/scout-C1.md
- /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/briefs/scout-C2.md

Key findings folded into the briefs below:
- C1: `scripts/collect-from-origin.mjs`/test/fixtures do not exist yet (fresh build).
  `scripts/janitor.mjs` and `scripts/work-record.mjs` (`parseRecord`) are the established
  reusable patterns for read-only git plumbing and record parsing, respectively.
  `docs/census.md` has no existing collector section — the required three sentences are
  a new subsection. Two open questions recorded (diff --name-only vs ls-tree choice;
  missing-Status vs no-record state) for the builder to resolve and justify.
- C2: the exact anchor sentence in `skills/team-build/SKILL.md`'s Ship section (after the
  `accept --census <census.md>` sentence) is named. Only one of the three named C2 files
  (`skills/decisions/SKILL.md`) currently has a test that reads it
  (`skills/decisions/scripts/skill-text.test.mjs`, which asserts several exact literal
  substrings — flagged as a must-not-break constraint). No Codex mirror of the decisions
  skill exists anywhere in this tree (`.codex-plugin/` holds only `plugin.json`) — the
  scout recommends the builder's report say this plainly per spec C2 item 3.

## Briefs written

All from the spec pack (spec.md, contracts.md, each territory's own scout addendum, all
referenced by path per the mandate template) using
/home/ben/Code/wt-collect-1/docs/mandate-template.md:

- /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/briefs/C1.md
- /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/briefs/C2.md
- /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/briefs/reviewer.md
  (one shared reviewer brief, instantiated per territory at spawn time — carries both
  the C1 attack brief (spec Acceptance, verbatim: try to make the collector call an
  unmerged branch merged; prove it never writes) and the C2 attack brief (merge-item
  shape matches contracts R3 exactly; skill-text.test.mjs still passes; Codex-mirror
  question answered plainly). Both reviewer lines carry `JUDGMENT:`.
- /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/briefs/integrator.md
  (worktree /home/ben/Code/wt-collect-1, branch build/collect-from-origin-1 — already
  checked out there at the base sha; gate `node scripts/run-tests.mjs`, no-new-failure-
  vs-base ac9c842 by failing test name per contracts.md; includes the R4 dogfood
  invocation against /home/ben/Code/claude-delegation)
- /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/briefs/seam.md (scoped
  strictly to the C1/C2 boundary: the pull-signal (census doc) vs push-signal
  (decisions-page merge item) not contradicting each other; the four-numbers citation
  staying valid since C1 never touches record header shape; no phantom cross-territory
  wiring claimed by either side)

## Not done in this pass (out of this job's scope)

Per the prompt, this run was setup only: no builder, reviewer, or integrator was spawned;
no work record was opened, moved, or touched (docs/work/wr-2026-09-26-collect-from-origin.record.md
already exists, `Status: owned`, opened by the orchestrator before this session — this
setup left it untouched, as instructed); nothing was pushed; no git identity was set or
changed; no destructive git command was run. No peer note was sent.

## Anomalies / notes for the orchestrator

- The work record's own `Next:` line already names this exact setup step ("one launch of
  the one-launch script... setup mode, then accept") and its `Lead-session:` matches this
  session's id — this setup run appears to be exactly that named next step, executed
  directly rather than through a separate one-launch script invocation. Flagging this so
  the orchestrator can reconcile the record's `Next:` wording with what actually ran.
- `docs/ledger/`, `docs/notes/`, and `hooks/multi-hook-core.mjs.bak-noparking` were
  already untracked in the working tree before this session started (per the git status
  snapshot given at conversation start) and were left untouched.
