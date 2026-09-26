VERDICT: PASS

# Setup — withdraw-status-1

Spec pack: `/home/ben/Code/wt-withdraw/docs/specs/withdraw-status-1/spec.md`
Base sha (as given, verified to exist and resolve to commit
`a8bffb6 docs(work): open wr-2026-09-26-withdraw-status with its spec pack`):
`a8bffb67b47796fbf492ffc0a640ef934d19f8dc`

## Territory worktree

Ran, in order:
```
git -C /home/ben/Code/wt-withdraw worktree add /home/ben/Code/wt-withdraw-status-1-W1 \
  -b build/withdraw-status-1-W1 a8bffb67b47796fbf492ffc0a640ef934d19f8dc
git -C /home/ben/Code/wt-withdraw-status-1-W1 rev-parse HEAD
```
Output of `rev-parse HEAD`, verbatim: `a8bffb67b47796fbf492ffc0a640ef934d19f8dc`

- W1: worktree `/home/ben/Code/wt-withdraw-status-1-W1`, branch
  `build/withdraw-status-1-W1`, headSha `a8bffb67b47796fbf492ffc0a640ef934d19f8dc`.

The integration worktree/branch named in the task
(`/home/ben/Code/wt-withdraw`, `build/withdraw-status-1`) already existed, already
checked out at the same base sha — nothing created there; confirmed with `git status`
(clean, up to date with `origin/build/withdraw-status-1`) and
`git log --oneline -1 a8bffb6...` before creating W1's worktree. Not modified by this
job. The work record `docs/work/wr-2026-09-26-withdraw-status.record.md` already exists
there (`Status: owned`, owner `skills-n`) — read for context, not written to (setup does
not own `docs/work/`).

## Scout

Wrote `/home/ben/Code/wt-withdraw/docs/specs/withdraw-status-1/briefs/scout-W1.md`
(created the `briefs/` and `reports/` directories, which did not yet exist), read-only,
against the W1 worktree at base sha, per
`skills/team-build/references/scout-brief.md`'s four-section shape. Notable findings
folded into W1's brief and the reviewer's attack brief:
- `scripts/collect-from-origin.mjs:111-113` `computeState` currently maps EVERY
  non-accepted, non-rejected status (so a future `withdrawn` too) to `"owned"` — a real
  bug relative to contracts.md R3, not just a missing test.
- `hooks/multi-codex-hook.mjs`'s `status` references (lines 79-82) are a `goal-card.mjs`
  result, unrelated to work-record.mjs statuses — R3's "only if it lists records" almost
  certainly resolves to "no change," flagged as a verify-don't-assume item in W1's brief
  rather than decided by setup.
- `scripts/work-record.test.mjs:207` asserts `STATUSES` has exactly seven values by
  name — will fail the moment `withdrawn` is added; W1's brief and the reviewer's
  attack brief both call this out explicitly so it isn't a silent false-green gate.
- `docs/census.md:356-357` also enumerates collector-state words
  (`accepted-unmerged`/`accepted-merged`/`rejected`) outside the `docs/work-record.md`
  and `skills/team-build/SKILL.md` hits R4's grep is aimed at — left as an open question
  in the scout file and echoed in the reviewer's checklist rather than resolved here,
  since resolving it is a judgment call outside a setup job's scope.

## Briefs written

- `/home/ben/Code/wt-withdraw/docs/specs/withdraw-status-1/briefs/W1.md` — territory
  mandate, mandate-template shape, citing spec.md/contracts.md/scout-W1.md by path,
  gate from contracts.md R6 verbatim, off-limits list from contracts.md's territory map,
  explicit NOT on `docs/work/` and the dogfood step (R5, lead-only).
- `/home/ben/Code/wt-withdraw/docs/specs/withdraw-status-1/briefs/reviewer.md` — high-tier
  adversarial attack brief built directly from spec.md's own Acceptance-section attack
  list (accepted-record withdrawal, double withdrawal, missing `--superseded-by`
  target, list-reappearance, four-read-breaking Log line), plus the `STATUSES`-count
  regression and the docs-list check.
- `/home/ben/Code/wt-withdraw/docs/specs/withdraw-status-1/briefs/integrator.md` — gate
  `node scripts/run-tests.mjs`, "no new failing test name vs base b7ddf11" per
  contracts.md R6, notes the two base-only failures (Netcup H6, V4) named there so they
  aren't misreported as regressions; explicitly not the second-host run or the push.
- `/home/ben/Code/wt-withdraw/docs/specs/withdraw-status-1/briefs/seam.md` — scoped to
  the live handoff (unit-tested code -> the two real hook/collector consumers and the
  lead's real dogfood step next), since this build has one territory rather than the
  usual cross-territory seam; requires quoting actual printed lines against a scratch
  fixture, never running `withdraw` against the real `docs/work/` records itself
  (reserved for the lead, R5).

## Notes / anything that didn't match the brief

- Only one territory (W1) is defined in this spec pack; scouted and briefed as one,
  per the task's own enumeration (only W1 was named).
- The task's phrase "writing briefs/scout-<id>.md next to the spec" put the scout file
  under a `briefs/` subdirectory rather than directly beside `spec.md`; both `briefs/`
  and `reports/` were created fresh under `docs/specs/withdraw-status-1/` since neither
  existed before this job.
- No destructive git operations were run; no git identity was set or changed; nothing
  was pushed; no peer notes were sent.

## Territories (for the caller)

| id | worktree | branch | briefPath | gate | headSha |
|---|---|---|---|---|---|
| W1 | /home/ben/Code/wt-withdraw-status-1-W1 | build/withdraw-status-1-W1 | /home/ben/Code/wt-withdraw/docs/specs/withdraw-status-1/briefs/W1.md | node --test scripts/work-record.test.mjs hooks/backlog-notice.test.mjs scripts/collect-from-origin.test.mjs scripts/four-read.test.mjs && node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs | a8bffb67b47796fbf492ffc0a640ef934d19f8dc |
