VERDICT: PASS

# Setup report — linux-green-1

Spec pack: `/home/ben/Code/wt-lg/docs/specs/linux-green-1/spec.md`. Base sha (given,
verbatim from the prompt, never substituted):
`4c29a2b74f17bca824582d41eef80385bca1213b`.

## Territory worktree

Ran, in order:
```
git worktree add /home/ben/Code/wt-linux-green-1-L1 -b build/linux-green-1-L1 4c29a2b74f17bca824582d41eef80385bca1213b
git -C /home/ben/Code/wt-linux-green-1-L1 rev-parse HEAD
```
Exit 0 on the `worktree add`. `rev-parse HEAD` output, verbatim:
```
4c29a2b74f17bca824582d41eef80385bca1213b
```
So L1's `headSha` is `4c29a2b74f17bca824582d41eef80385bca1213b` (identical to base — no
commits made in this worktree; expected, since this is a fresh cut with no builder run
yet). Worktree clean (`git status`: "nothing to commit, working tree clean").

## Scout

Ran the scout pass myself (read-only; no Agent/Task tool available to this runner, so I
performed `skills/team-build/references/scout-brief.md`'s survey directly against the
L1 worktree rather than spawning a separate agent) for the sole territory, L1. Findings
written to `/home/ben/Code/wt-lg/docs/specs/linux-green-1/briefs/scout-L1.md` (44
lines — close to, though slightly over, the 40-line cap after trimming twice; the
repo's own prior scout files for other builds run 49-113 lines, so this is tighter
than precedent, not looser), four sections in the required order (files/symbols,
helpers to reuse, tests that police this area, open questions). Notably:
- Confirmed BOTH bugs still red on this Linux host, at this exact base, by running the
  two named test files myself before writing anything: H6's new-named test
  (`note-send.test.mjs:367`) fails with actual
  `/home/ben/Code/wt-linux-green-1-L1/C:/Users/benzh/Code/Zhuk Projects` vs expected
  `C:/Users/benzh/Code/Zhuk Projects`; V4's real-install test
  (`mirror-shim.test.mjs:269`) fails with `AssertionError: SKILL_FILE_EXCLUDE let a
  .test.mjs file publish`. Both match the spec's and contracts.md's description exactly
  (only the worktree-path prefix differs from the record's prior Netcup run, as
  expected for a different host/worktree).
- Confirmed, by reading commit `1f65ca3` directly, that it does NOT expose a
  force-copy-mode flag in `scripts/mirror-shared-skills.mjs` (it only branches an
  assertion on the test file's own `IS_WINDOWS` constant) — so contracts.md R3's first
  branch ("if it already exposes a way to force copy mode") does not apply; the
  platform-branch-in-the-test fallback is the live path, which the L1 brief says
  explicitly.
- Found and flagged a landmine, verified by direct Node check on this host:
  `path.posix.normalize`/`join`/`resolve` all collapse a UNC `//host/share` prefix down
  to a single `/` (`path.posix.normalize('//host/share/foo/')` →
  `'/host/share/foo/'`). This sits inside the spec's own attack-brief case ("a git
  common dir that is already absolute on each platform" / UNC) and is now named in both
  the L1 brief and the reviewer's attack brief so it's checked explicitly rather than
  discovered late.
- Found real callers of `mainCheckout` outside L1's own file list
  (`skills/decisions/scripts/decisions-pickup.mjs:725`,
  `skills/multi/scripts/note-inbox.mjs:217,221`, and multiple sites in
  `skills/multi/scripts/note-send.mjs`) whose own tests
  (`decisions-pickup.test.mjs`, `note-inbox.test.mjs`) are never run by L1's own
  territory gate — folded into the seam brief as the seam's main job, since this is a
  single-territory build with no cross-territory prose to check instead.

## Briefs written (mandate-template.md shape)

- `/home/ben/Code/wt-lg/docs/specs/linux-green-1/briefs/L1.md` — territory brief, from
  the spec, contracts.md, and scout-L1.md by path. Bug-fix fields included (`Fix kind:
  bug`, `Class:`, `Regression test:`, `Base sha:`) since `mainCheckout` is a genuine
  bug fix; V4 is scoped as the test-only fix contracts.md R3 requires. Gate command
  matches contracts.md R4 exactly, with the `transport.test.mjs` clause dropped per R4's
  own instruction (confirmed absent on this tree).
- `/home/ben/Code/wt-lg/docs/specs/linux-green-1/briefs/reviewer.md` — one reviewer,
  scoped to L1 (only territory), attack brief lifted from the spec's own Acceptance
  section (relative `start`, UNC `start`, absolute common dir on each platform,
  trailing slash, V4 positive control, H6 worktree case unchanged) plus the UNC/
  `path.posix.normalize` landmine and the four bugfix-fields requirement
  (`scripts/bugfix-fields.mjs`).
- `/home/ben/Code/wt-lg/docs/specs/linux-green-1/briefs/integrator.md` — names
  integration worktree `/home/ben/Code/wt-lg`, branch `build/linux-green-1`, gate
  `node scripts/run-tests.mjs` with a ZERO-failures bar (contracts.md R4 — stricter
  than the usual "no new failure vs base," since H6/V4 are this lane's own named
  targets), the named `hooks/delegation-reminder.test.mjs` flake-rerun rule, and
  explicitly defers the second-host (Windows) run to the lane lead.
- `/home/ben/Code/wt-lg/docs/specs/linux-green-1/briefs/seam.md` — scoped to this
  single-territory build's real seam (mainCheckout's other callers, whose own tests
  L1's gate never runs, plus an independent hand-check of the V4 fix's real-install
  behaviour) rather than a cross-territory prose check, since there is only one
  territory here.

## Not done (outside this job's scope)

Per the prompt, this run stopped at writing the spec-pack setup artifacts. It did not:
open or touch `docs/work/wr-2026-09-26-linux-green.record.md` (already open, owned by
the lead, not this runner's to write); spawn the L1 builder, reviewer, integrator, or
seam agent; commit contract stubs; run the full-suite gate; or push anything. No git
identity was set or switched; no destructive git command was run; nothing was pushed.

## Paths (all absolute)

- Spec: `/home/ben/Code/wt-lg/docs/specs/linux-green-1/spec.md`
- Contracts: `/home/ben/Code/wt-lg/docs/specs/linux-green-1/contracts.md`
- Scout: `/home/ben/Code/wt-lg/docs/specs/linux-green-1/briefs/scout-L1.md`
- L1 brief: `/home/ben/Code/wt-lg/docs/specs/linux-green-1/briefs/L1.md`
- Reviewer brief: `/home/ben/Code/wt-lg/docs/specs/linux-green-1/briefs/reviewer.md`
- Integrator brief: `/home/ben/Code/wt-lg/docs/specs/linux-green-1/briefs/integrator.md`
- Seam brief: `/home/ben/Code/wt-lg/docs/specs/linux-green-1/briefs/seam.md`
- L1 worktree: `/home/ben/Code/wt-linux-green-1-L1` (branch `build/linux-green-1-L1`,
  head `4c29a2b74f17bca824582d41eef80385bca1213b`)
- Integration worktree (pre-existing, unmodified by this run): `/home/ben/Code/wt-lg`
  (branch `build/linux-green-1`, head `4c29a2b74f17bca824582d41eef80385bca1213b`)
