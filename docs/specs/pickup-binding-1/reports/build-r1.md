STATUS: DONE 26c61ad66543bb84f91d3aac79bb85acea04dfc4

# Lane 34, pickup-binding — fix round r1

Base: bafd52d (fix(decisions): resolve pickup project identity through the main checkout).
This fix round is committed at 26c61ad.
Territory: `skills/decisions/scripts/decisions-pickup.mjs`, `skills/decisions/scripts/decisions-pickup.test.mjs`,
`skills/decisions/SKILL.md`. Nothing else touched — `skills/multi/scripts/transport.mjs` was not opened for
edit (F3 explicitly out of scope for this lane).

Applied per review-r1.md and the lead's Log-line ruling:
- **F1** — the patch as written (`registeredProject`'s return kept as `boundRepo` for uniqueness
  only; `readRegistration` now hands `pickupOnce` the config checkout `repo`, not the main-checkout
  identity), plus the named test.
- **F2** — the `projectIdentity` patch as written (bare-backed worktree keeps its own realpath
  unless its git common dir is exactly `<main>/.git`), plus the named test.
- **F4a** — "Any conflict" → "Any other conflict" (SKILL.md:84).
- **F4b** — the suggested text for the publish/`--clear-done` sentence (SKILL.md:67-69). Reran
  `skill-text.test.mjs`: 14/14, unchanged.
- **F3** — not applied. `skills/multi/scripts/transport.mjs` was not touched.
- **F5** — no change.

## C4 fields

**Cause:** `readRegistration` validated each entry's project/page binding by calling
`registeredProject(repo, page, fsImpl, git)`, which reads `.agents/project.json` from the checkout
named on the command line (correct) but then returned the NORMALIZED main-checkout identity as
`boundRepo`. That normalized identity was then stored as `entry.repo` and handed to `pickupOnce`,
whose own `registeredProject(options.repo, ...)` call re-reads `.agents/project.json` from that
main checkout instead of from the worktree the registration actually names. Separately,
`durableTransportRepo`'s `mainCheckout` strips any trailing `.git` from the git common dir with
`/\/?\.git\/?$/`; for a worktree of a *bare* clone the common dir is literally `<name>.git` (the
bare repo itself, no `.git` subcomponent), so the strip also removes that suffix from the directory
name itself, e.g. `proj.git` → `proj`, silently colliding with an unrelated sibling clone named
`proj`. P1 made that stripped value the authorization identity, so the collision became a
misbinding, not just a transport-routing quirk.

**Discriminating check:**
- F1: `node --test skills/decisions/scripts/decisions-pickup.test.mjs` — the new test
  "a registration entry naming a linked worktree is validated from the worktree, and its receipt
  still binds to the main checkout" asserts `runRegisteredPickup` returns `PICKUP_RECORDED`
  against a registration entry naming a linked worktree whose main checkout has no
  `.agents/project.json` at all. On bafd52d it fails: `{ code: 'PICKUP_FAILED', ordinal: 0 }`
  instead of `{ code: 'PICKUP_RECORDED', ordinal: 0 }`.
- F2: the new test "a worktree of a bare-backed clone stays its own project, never a sibling
  clone's" records round 1 from a separate clone `proj`, then reads `status` from `bwt`, a
  `git worktree add` off a separate `git clone --bare` of the same origin (named `proj.git`,
  sitting next to `proj`). On bafd52d it fails: `status` returns `'RECORDED'` (misbound to
  `proj`'s receipt) instead of `'PENDING_MANUAL_HANDOFF'`.
- Both measured in a fresh `git archive bafd52d` copy made with `mktemp -d
  .../scratchpad/lane-34/fx-uHe9`, with only the test file copied over (the unfixed
  `decisions-pickup.mjs` left exactly as archived). Both tests pass unchanged in the worktree
  (492/492 across `skills/decisions/scripts/*.test.mjs`).

**Fix location:**
- `skills/decisions/scripts/decisions-pickup.mjs:727` — `readRegistration`'s per-entry return now
  hands back `repo` (the validated config checkout) instead of `boundRepo` (the normalized
  main-checkout identity used only for the uniqueness key at :721).
- `skills/decisions/scripts/decisions-pickup.mjs:646-659` (`registeredProject`'s return, plus a new
  `projectIdentity` helper) — a linked worktree's identity now only follows its main checkout when
  `git rev-parse --git-common-dir` resolves to a path whose basename is exactly `.git` AND whose
  parent's canonical identity is that main checkout; every other layout (bare-backed worktree,
  separate-git-dir checkout, submodule) keeps its own realpath, unchanged from before P1.
- `skills/decisions/SKILL.md:67-69` and `:84` — the two wording fixes (F4a, F4b).

**Simplification:** none asked or made beyond the named patches — the prior builder's collapse of
`receipt.project`/`receipt.transportRepo` into one value for the standard worktree layout stands;
F2's `projectIdentity` deliberately makes them differ again for bare-backed and submodule layouts,
where they already differed before this lane. No other call site or field was touched.

## Gate

`node --test skills/decisions/scripts/*.test.mjs` → 492/492 pass, 0 fail
(`docs/specs/pickup-binding-1/reports/build-r1-gate.log`). `skill-text.test.mjs`'s 14 assertions
are included in that run and are unchanged/still green.

## Deviations / assumptions

None. F1 and F2 patches were applied byte-for-byte as given in review-r1.md; F4b used the review's
suggested sentence verbatim. The two new tests use the existing sealed-fixture git identity pattern
(`makeTempHome`'s `includeIf` scoping already used by the prior builder's three tests) for the one
commit each fixture needs; the F2 fixture's `git clone --bare`, `git clone --shared`, and
`git worktree add` steps make no further commits, per the brief's guidance.
