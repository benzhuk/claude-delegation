STATUS: DONE bafd52d

# Lane 34, pickup-binding — builder report

Goal card line served: **work lost or stalled** (a pickup registration re-pointed to any
other checkout of the same repository — a worktree included — used to make every later
round a manual handoff forever, per the lead ruling's evidence). Nearest NOT: **not more
parts than the simplest design** — the fix reuses the `mainCheckout`/`durableTransportRepo`
resolver the codebase already had, rather than adding a new identity mechanism.

Territory touched, and nothing else: `skills/decisions/scripts/decisions-pickup.mjs`,
`skills/decisions/scripts/decisions-pickup.test.mjs`, `skills/decisions/SKILL.md`.
`skills/decisions/scripts/decisions-render-publish.mjs` was read but not edited (see
Simplification below — its acceptance is met with no change there).

## Cause

`registeredProject(repo, page, fsImpl)` (decisions-pickup.mjs) computed a project's
*identity* — the value hashed into `projectScope` (`receiptPaths`, :114-125) and stored
verbatim as `receipt.project` — as the plain `realpath` of whatever checkout path a
caller passed in `--repo`/`options.repo`. `durableTransportRepo`, a few lines away,
already normalized a project's *transport* location through `mainCheckout` (so a note
sent from a worktree lands durably in the main checkout's `docs/`), but nothing routed
the *identity* through that same resolver. So a worktree of a repo and its main checkout
produced two different `project` values, hence two different `projectScope` hashes for
the very same registered page. Because the receipt is looked up by page only
(`receiptPaths`'s `key = sha256(page)`, but the *content* validation at
decisions-pickup.mjs:937/968 compares `receipt.project !== project` byte for byte), a
pickup or `publish` run from any checkout other than the literal one that first captured
the round returns `PENDING_MANUAL_HANDOFF` — permanently, since nothing ever rewrites a
saved receipt's `project` field. This is exactly the live defect the lead ruling names
(round 3 bound to a detached, dirty checkout on Netcup that nobody may move).

## Discriminating check

`skills/decisions/scripts/decisions-pickup.test.mjs`, new test *"a linked worktree of a
repo resolves to the same project and projectScope as its main checkout, and finds a
RECORDED round bound to the main checkout"*.

Shown failing on the old code in a scratch copy (never in the worktree): copied
`skills/` and `scripts/` into a scratch dir, replaced `decisions-pickup.mjs` with
`git show HEAD:skills/decisions/scripts/decisions-pickup.mjs` (the pre-fix content, since
HEAD had not yet received this branch's edit), and ran a standalone harness performing
the same steps as the new test — `git init`/`git worktree add` under a sealed
`makeTempHome()` fixture, one `pickupOnce` from the main checkout (RECORDED, round 1),
then `status({ repo: <worktree> , page })`. Old code's output:

```
worktree status: {
  "status": "PENDING_MANUAL_HANDOFF",
  ...
  "reason": "this page is bound to a different authorization project",
  "requestedProject": ".../fixtures/wt",
  "boundProject": ".../fixtures/main-UM1D4v"
}
```

Same harness against the fixed `decisions-pickup.mjs` returns `"status": "RECORDED"`
with the worktree's `receipt.project` equal to the main checkout's realpath. The new
test in the actual test suite asserts the same thing and passes; reverting only
`registeredProject`'s `return durableTransportRepo(configCheckout, git, fsImpl);` to the
old `return configCheckout;` reproduces the failure inside the real suite too (not
re-verified there to avoid editing the worktree, per instructions — the scratch harness
above is the required substitute and is bit-for-bit the same code path).

## Fix location

`skills/decisions/scripts/decisions-pickup.mjs`, `registeredProject` (was :631, now
:638): config is still read from the checkout it was given (`loadProjectConfig
(configCheckout)`, unchanged input), but the function now *returns*
`durableTransportRepo(configCheckout, git, fsImpl)` instead of the bare `configCheckout`.
`durableTransportRepo` already existed and already did exactly this normalization
(`mainCheckout` then realpath) for the transport repo — reused verbatim, not
reimplemented. `git` is threaded as a fourth parameter through `registeredProject` and
`readRegistration`, and into the four callers (`pickupOnce`, `status`, `account`,
`openPrivateCapture`) as `deps.git ?? gitRunner`, matching the existing pattern already
used for `durableTransportRepo`'s other call sites in those same functions.

For a main-checkout path, `durableTransportRepo` resolves back to the identical realpath
(`mainCheckout` of a main checkout's own `.git` common dir strips back to that same
path; verified by the new "byte-identical to today's formula" test), so every existing
receipt and capture keyed by `/home/ben/Code/claude-delegation` stays valid with no
migration — exactly the ruling's P1 requirement.

`decisions-render-publish.mjs` was NOT touched. Its `defaultReadPickupCapture` calls
`pickupMod.status({ repo, page })` / `openPrivateCapture({ repo, page, round })` with
whatever `--repo` `publish` was invoked with. Once `registeredProject`'s identity is
main-checkout-normalized, `publish --repo <any worktree of the registered repo>`
already finds the round bound to the main checkout with zero further code change — the
new worktree test exercises the identical `status()` codepath `publish` uses, so this
was verified rather than assumed.

`skills/decisions/SKILL.md` (P3): two sentences added —
1. After the `publish --repo . --page ...` command line: *"`publish` runs from any
   clean checkout on branch main of the registered repository, a worktree included; the
   pickup round is found through the repository's main checkout (Lane 34,
   pickup-binding)."*
2. In the merge paragraph, after "naming the conflicting paths instead.": *"An
   append-only conflict on the day file is resolved by keeping both bullets in commit
   order; it is not a decision item."*
All 14 existing `skill-text.test.mjs` assertions (which pin exact substrings/line-wraps
elsewhere in the same file) still pass unchanged.

## Simplification

`registeredProject` and `durableTransportRepo` now compute the *same* value
(`durableTransportRepo(configCheckout, ...)` is literally called from inside
`registeredProject`), so after this fix `receipt.project` and `receipt.transportRepo`
are always equal — the two fields and their two separate drift checks
(`receipt.project !== project` at :937/968 and `receipt.transportRepo !== transportRepo`
at :947/977) are no longer *identity* checks against two independently-derived values,
only a defensive re-derivation check against a receipt written earlier (protecting
against the underlying git structure changing between calls, e.g. a `.git` file's
target being edited). I left both checks and both fields in place rather than
collapsing them: removing either changes what a stale receipt would surface (silently
losing the "durable transport repository changed" reconciliation path), which is outside
this bug fix's minimal-diff mandate and not named in the lane's acceptance. No dead code
was introduced or removed; the diff is three call-site edits, one function-body edit,
and one parameter threaded through four callers plus one internal one
(`readRegistration`).

## Tests added

Three, in `decisions-pickup.test.mjs`, using real git fixtures (`git init` +
`git worktree add` in `fs.mkdtempSync` dirs under each test's own sealed
`fixtureRoot`, per `scripts/test-home.mjs`'s own documented contract for where a
committed fixture must live to get an identity) — commits use the sealed fixture's
own already-configured identity, no `-c user.*`/`--author`/env override added:

1. `a linked worktree of a repo resolves to the same project and projectScope as its
   main checkout, and finds a RECORDED round bound to the main checkout`
2. `a main-checkout path's projectScope is unchanged from today's formula`
3. `a non-git directory keeps its realpath identity`

## Gate

```
node --test skills/decisions/scripts/*.test.mjs
```
490/490 pass (`docs/specs/pickup-binding-1/reports/build-gate.log`), including all
existing `decisions-pickup.test.mjs` and `registered-pickup.contract.test.mjs` tests
unchanged, and all 14 `skill-text.test.mjs` assertions.

```
node scripts/run-tests.mjs
```
2586/2592 pass, 5 skipped, 1 pre-existing failure
(`docs/specs/pickup-binding-1/reports/build-fullsuite.log`):
`scripts/work-record.test.mjs:2340` — a `docs/GOALS.md`/`docs/work-record.test.mjs`
staleness-regex mismatch unrelated to this diff. Confirmed pre-existing via
`git diff HEAD -- docs/GOALS.md scripts/work-record.test.mjs`, which shows zero
changes to either file on this branch; both are explicitly outside this territory's
scope (do-not-touch list in the brief).

## Deviations / assumptions

- P4 (the verbatim-tick history-file addition) and the "Live: round 3 cleared by one
  `publish --clear-done` from wt-ws-mainbase" acceptance line are the lead/integrator's
  own actions per the ruling's own wording ("the lead adds…"), not named in this
  builder's brief (P1, P3, Tests only) — not attempted here.
- No new test file was added for the two SKILL.md sentences beyond the existing
  `skill-text.test.mjs` suite (out of this territory's file list; the brief said "other
  tests police SKILL.md text, so run them," not "add one").

## Cleanup

No dev server, no background process started. Scratch dirs used for the discriminating
check (`.../scratchpad/lane-34/gitcheck-*`, `.../scratchpad/lane-34/oldcode-*`) are left
in place per the no-delete rule; nothing under them is referenced by the committed diff.
