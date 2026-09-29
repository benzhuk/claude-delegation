## Territory

S1 (lane-closeout addendum, seam fix after merging main): `scripts/work-record.mjs`'s
closeout and sweep-origin region, `scripts/work-record-closeout.test.mjs`, plus this
round's report/gate log.

## Contracts I rely on

`docs/specs/lane-closeout-1/addendum-S1-seam.md` (this round's whole brief). Depends on
main's 7248ba5 pattern (`withoutRepoLocatingGitEnv` from
`skills/multi/scripts/transport.mjs`, imported at `work-record.mjs:12` already) and
`janitor.mjs`'s own wrapped `git()` helper (confirmed fine, untouched).

## Done

HEAD `cfa1fc0`. Added `env: withoutRepoLocatingGitEnv(process.env)` to all 13
`execImpl`/`spawnImpl("git", ...)` call sites in the closeout/sweep-origin region
(lines 1835, 1852, 1863, 1867, 1870, 1873, 1875, 1936, 2182, 2195, 2243, 2339, 2354).
Whole-file grep afterwards: 19 total git call sites, all wrapped (the other 6, outside
this region, were already wrapped before this round - confirmed per-site, not just by the
single-line grep, since several split the options object across lines).

Added one regression test to `work-record-closeout.test.mjs` ("sweepOrigin and
closeoutRecord never let an inherited GIT_DIR redirect their git calls at a different
repo"): two separate fixture repos (A, B) with their own bare origins, `GIT_DIR` pointed
at B while `sweepOrigin`/`closeoutRecord` run live against A, asserts A's origin branches
are actually removed and B's bare origin's `for-each-ref` output is byte-identical before
and after.

Mutation proof: `git archive` of `cfa1fc0` untarred (separate command) under
`.../scratchpad/lane-closeout/S1-mut/extract/`; removed the wrapper from just the
`--force-with-lease` push call there - the new test fails (67/68), the intended assertion
("sweepOrigin must have deleted ... on A's own origin"). Real repo untouched by this step.

Gate: territory 414/412/0 fail/2 skipped (+2 over C1 round 6's 412/409/1); full gate
2907/2902/0 fail/5 skipped. Both under `timeout`, one at a time. Log: `reports/S1-gate.log`.

GOALS.md STALE test (`work-record.test.mjs:2458`), pre-existing failure at C1 round 6 (1
fail there): now **passes** after the main merge - both gate runs above show 0 fail. No
code change in this round touched GOALS.md/card.md/the STALE test; already fixed on main
before this round started.

Committed on `build/lane-closeout-1` as `cfa1fc0` (not pushed).

## Next

None outstanding for S1. If a future round adds a new git call anywhere in
`work-record.mjs`, wrap it with the same `env:` form on the same line as the
`execImpl`/`spawnImpl` call - grep `execImpl("git"\|spawnImpl("git"` and check every hit
for `withoutRepoLocatingGitEnv` within its own (possibly multi-line) options object.

## Open questions

None.

## How to run my gate

```
timeout 300 node --test --test-reporter=tap scripts/work-record.test.mjs \
  scripts/work-record-closeout.test.mjs scripts/janitor.test.mjs \
  scripts/record-closed-and-skip.contract.test.mjs
timeout 900 node scripts/run-tests.mjs
```
Run one at a time, each under `timeout`, from
`/home/ben/Code/claude-delegation-wt/lane-closeout-1`.
