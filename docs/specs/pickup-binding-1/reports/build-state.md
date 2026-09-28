# Lane 34 (pickup-binding) — builder state

## Fix round r1 (this pass)
F1 and F2 patched exactly as review-r1.md specified (see `docs/specs/pickup-binding-1/reports/build-r1.md`).
F4a/F4b SKILL.md wording applied verbatim/as-suggested. F3 and F5: no change, per lead
ruling. Two new tests added (F1's registration-from-worktree case, F2's bare-backed-worktree
case); both measured failing on bafd52d in a fresh `git archive` copy, both pass in the
worktree. Gate: 492/492 (`skills/decisions/scripts/*.test.mjs`).

## Territory
`skills/decisions/scripts/decisions-pickup.mjs` + `decisions-pickup.test.mjs` +
`registered-pickup.contract.test.mjs`; `skills/decisions/SKILL.md` (P3 sentences only).
`decisions-render-publish.mjs` NOT touched — its acceptance is met without a change
(see Done, below).

## Contracts I rely on
- `mainCheckout(dir, runner)` and `gitRunner` from `skills/multi/scripts/transport.mjs`
  (unmodified, reused as-is).
- `durableTransportRepo(project, git, fsImpl)` inside decisions-pickup.mjs (unmodified;
  now also called from `registeredProject` — see Done).
- `loadProjectConfig(start)` from `project-config.mjs` (unmodified).
- Lead ruling P1/P2/P3 in `docs/specs/pickup-binding-1/lead-ruling.md` overrides the
  spec's pinned no-code design.

## Done
- P1: `registeredProject(repo, page, fsImpl, git)` now reads `.agents/project.json`
  from the checkout it was GIVEN (unchanged), then returns
  `durableTransportRepo(configCheckout, git, fsImpl)` as the identity — the same
  main-checkout resolver `durableTransportRepo` already used for the transport repo.
  Threaded `git` through `readRegistration` and all four `registeredProject(...)`
  call sites (`pickupOnce`, `status`, `account`, `openPrivateCapture`) via
  `deps.git ?? gitRunner`.
- P3: two sentences added to SKILL.md (publish-location, day-file append-only
  conflict) — see `git diff` on SKILL.md. `skill-text.test.mjs`'s 14 existing
  assertions still pass unchanged.
- Tests: 3 new tests in `decisions-pickup.test.mjs`, using real `git init` /
  `git worktree add` fixtures under `sealed.fixtureRoot`, committed under the
  sealed fixture's own configured identity (no `-c user.*`):
  1. linked worktree resolves to the same project/projectScope as its main checkout,
     finds the RECORDED round bound to the main checkout.
  2. a main-checkout path's projectScope is byte-identical to today's
     `sha256(project + page)` formula.
  3. a non-git directory keeps its realpath identity.
- Gate run: `node --test skills/decisions/scripts/*.test.mjs` → 490/490 pass
  (`reports/build-gate.log`). `node scripts/run-tests.mjs` (full suite) → 2586/2592
  pass, 1 pre-existing failure unrelated to this diff (`reports/build-fullsuite.log`).
- decisions-render-publish.mjs: NOT touched. `defaultReadPickupCapture` calls
  `pickupMod.status({repo, page})`/`openPrivateCapture({repo, page, round})` with
  whatever `--repo` `publish` was given; once `registeredProject`'s identity is
  main-checkout-normalized, a `publish --repo <worktree>` already finds the round
  bound to the main checkout with no further code change. Verified this generically
  via the worktree test above (status() is the same codepath `publish` uses).

## Next
- Nothing outstanding in this territory. P4 (verbatim tick) and the "Live: round 3
  cleared from wt-ws-mainbase" acceptance line are the lead/integrator's own actions,
  not named in this builder's brief.

## Open questions
- None blocking. Note for the integrator: the one failing test in the full suite
  (`scripts/work-record.test.mjs:2340`, docs/GOALS.md staleness) is pre-existing —
  confirmed via `git diff HEAD` showing zero changes to docs/GOALS.md or
  scripts/work-record.test.mjs in this branch — and outside this territory
  (docs/GOALS.md is on this brief's do-not-touch list).

## How to run my gate
```
node --test skills/decisions/scripts/*.test.mjs
node scripts/run-tests.mjs
```
