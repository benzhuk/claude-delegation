# C1 state — collect-from-origin collector

## Territory
scripts/collect-from-origin.mjs, scripts/collect-from-origin.test.mjs, docs/census.md's
three-sentence addition. Worktree /home/ben/Code/wt-collect-from-origin-1-C1, branch
build/collect-from-origin-1-C1. Nothing else touched. Round 4, at
4843ef78219efaf716a3cbffc52e128053a6d71c.

## Contracts I rely on
- contracts.md R1: CLI shape, row fields/order, state enum, artifact-sha extraction rule,
  git-plumbing-only, exit 0 always. The <=60 runtime-line pin is WAIVED by the lead ruling
  (C1-lead-ruling-r4.md) at the real size (114 lines) — the pin was a size proxy and
  statement-joining to meet it made the file harder to audit.
- contracts.md R2: three sentences in docs/census.md (untouched this round).
- work-record.mjs's `parseRecord(text)` (imported, not re-derived).

## Done (round 4 — the lead ruling's only instruction)
- Restored one-statement-per-line layout in collect-from-origin.mjs: undid every
  `;`-joined statement and comma-joined `const` from round 3 (0bf8be8), and reverted the
  round-3 ternary-chain rewrites of `computeMerged`/`computeState`/`extractArtifactSha`/etc.
  back to their multi-line if/return form, as at 61b6aa6.
- The one round-3 *behaviour* change (R2-3: `changedRecordPaths`'s orphan/shallow-clone
  two-dot fallback) is kept, reformatted into a named `diffRecordPaths(repo, range)` helper
  (`collect-from-origin.mjs:75-84`) instead of round 3's inline closure — same behaviour,
  readable layout.
- Verified: `git diff 61b6aa6 -- scripts/collect-from-origin.mjs` shows exactly one hunk —
  the `diffRecordPaths` extraction inside `changedRecordPaths` — nothing else differs from
  the pre-round-3 layout.
- Fetch-failure warning text reverted to its pre-round-3 form (includes `err.message`),
  since round 3's fixed-string version was a side effect of the try/catch collapse being
  undone here, not a reviewer finding. The one test reading it (`:332`) matches
  `/fetch failed/`, unaffected either way.
- Line count fact: `grep -vE '^\s*(//.*)?$' scripts/collect-from-origin.mjs | wc -l` = 114
  (pin waived; not a finding).
- Gate: 21/21 pass, test file untouched (`git status --short` shows only the `.mjs` file
  modified).

## Next
Nothing planned unless a future ruling reopens F4 or F6. F6 (output-shape ruling) remains
open per rounds 1-3, unaffected by this round.

## Open questions
None new. F6 is still a standing lead-only call (unchanged since round 2), not touched
this round per the ruling's scope ("nothing else").

## How to run my gate
`cd /home/ben/Code/wt-collect-from-origin-1-C1 && node --test scripts/collect-from-origin.test.mjs`
21/21 pass this round.
