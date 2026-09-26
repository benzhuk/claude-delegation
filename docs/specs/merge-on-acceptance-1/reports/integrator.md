VERDICT: PASS

# Integrator report — merge-on-acceptance-1

Territories approved and merged:
- M1: branch `build/merge-on-acceptance-1-M1` @ `e5d10f5b1fc011aade8854ca888834a3ee6a1932`
  — reviewer round 2 returned `VERDICT: APPROVE e5d10f5b1fc011aade8854ca888834a3ee6a1932`
  (docs/specs/merge-on-acceptance-1/reports/M1-review-2.md). This is the exact sha named in
  the task inputs, so it is included.
- M2: branch `build/merge-on-acceptance-1-M2` @ `8ada6f290b1b95150e48e4cd5b82aab7cd8daea7`
  — reviewer round 2 returned `VERDICT: APPROVE 8ada6f290b1b95150e48e4cd5b82aab7cd8daea7`
  (docs/specs/merge-on-acceptance-1/reports/M2-review-2.md). This is the exact sha named in
  the task inputs, so it is included.

No territory was excluded by the task, and none had a NEEDS_FIXES/absent/mismatched-sha
review at the sha in question — round 1 of both was NEEDS_FIXES, but round 2 at the shas
above is a clean APPROVE.

## Merge

Worktree `/home/ben/Code/wt-moa`, branch `build/merge-on-acceptance-1`, started at
`71e4c65` (on top of spec-pack base `24e02eab356217a4c63725014d4fdd028cfb5891`).

- `git merge --no-edit build/merge-on-acceptance-1-M1` — merge commit `4e43538`, no
  conflicts, touched exactly `docs/census.md`, `docs/pane-setup.md`,
  `skills/decisions/SKILL.md`, `skills/decisions/templates/decision-item.md`,
  `skills/team-build/SKILL.md` — the M1 territory list.
- `git merge --no-edit build/merge-on-acceptance-1-M2` — merge commit `f3ec533`, no
  conflicts, touched exactly `skills/multi/SKILL.md`, `skills/multi/scripts/note-flush.mjs`,
  `skills/multi/scripts/note-flush.test.mjs` — the M2 territory list.
- No conflicts at either merge, so R3's "no merge, post a Waiting item" branch never
  triggered.
- Off-limits check: `git diff --stat 6d8ba95 HEAD -- scripts/ hooks/ .codex-plugin/
  docs/GOALS.md README.md skills/decisions/scripts/` is empty. Neither territory touched a
  file outside its own list.

**headSha (`git rev-parse HEAD` in `/home/ben/Code/wt-moa`): `f3ec5333b9e91847fc86be4c4f7f98e9ea951a26`**

## Gate

Command (exactly as the brief's Gate line): `node scripts/run-tests.mjs >
/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/reports/integrator-gate.log 2>&1`,
run once at head `f3ec533`.

Summary line from the actual run: **1727 tests, 1722 pass, 2 fail, 3 skipped** (0 cancelled,
0 todo).

Failing tests, both tagged `known (base 6d8ba95a33019e30adf4ecb4c5367c4b756f3e1e)`:

1. `skills/multi/scripts/mirror-shim.test.mjs:269` — "V4: a real install writes one shim per
   command, each naming ITS OWN command in its errors" —
   `AssertionError: SKILL_FILE_EXCLUDE let a .test.mjs file publish` (actual `false`,
   expected `true`).
2. `skills/multi/scripts/note-send.test.mjs:367` — "H6: a plain checkout resolves to itself,
   and backslashes are normalised (L1)" — path-prefix mismatch: actual
   `/home/ben/Code/wt-moa/C:/Users/benzh/Code/Zhuk Projects` vs expected
   `C:/Users/benzh/Code/Zhuk Projects` (Windows path normalization, this host is Linux).

No test outside these two names failed. Zero new failures vs base.

### Re-confirming the two failures are base-not-new (re-derived, not assumed)

Per the brief's instruction not to trust the prior build's (collect-from-origin-1,
base ac9c842) confirmation without re-deriving it at this build's own base: I added a
detached scratch worktree at base `6d8ba95` (`/home/ben/Code/wt-moa` git-worktree, removed
after the check) and ran `node --test skills/multi/scripts/mirror-shim.test.mjs
skills/multi/scripts/note-send.test.mjs` there directly (subset run, not the full sealed
suite, since I only needed to reproduce these two specific test identities).

Result at base 6d8ba95: same two tests fail, same names, same lines, same failure shape —
V4's `SKILL_FILE_EXCLUDE` assertion (`actual: false, expected: true`) and H6's path-prefix
assertion (worktree's own path prepended onto the Windows path, differing only by which
absolute path the scratch worktree happened to live at — an artifact of the test's own
`process.cwd()`-based bug, not of anything either territory touched). Both files
(`skills/multi/scripts/mirror-shim.mjs` and `.test.mjs`, `skills/multi/scripts/note-send.mjs`
and `.test.mjs`) sit in `skills/multi/scripts/`, outside both M1's and M2's file lists
(M2 touches only `note-flush.mjs`/`note-flush.test.mjs`/`skills/multi/SKILL.md` in that
directory, never `mirror-shim.mjs` or `note-send.mjs`).

Conclusion: H6 and V4 are confirmed pre-existing on this host (Netcup) at this build's own
base 6d8ba95, not introduced by M1 or M2.

## Gate log

Full log: `docs/specs/merge-on-acceptance-1/reports/integrator-gate.log` (1820 lines). Tail
(summary + both failing blocks) reproduced above verbatim from the log.

## State

`docs/specs/merge-on-acceptance-1/reports/integrator-state.md` — one gate run, no re-runs
needed (both territories were already at APPROVE-round-2 shas on first check).

## Scope notes

- I did not fix anything and did not decide ship-readiness; this report states PASS on the
  local sealed gate only.
- I did not run the second-host (Windows) suite — that is explicitly the lane lead's own
  step from origin per contracts.md R8's last line, out of this mandate's scope.
- I did not touch `docs/GOALS.md`, `scripts/collect-from-origin.mjs`,
  `skills/decisions/scripts/decisions-pickup.mjs`, or `hooks/`.
- No git identity was set or switched; no push was made; no peer notes were sent.
