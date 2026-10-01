VERDICT: APPROVE 26c61ad

# Lane 34, pickup-binding: delta re-review r2

This re-review covers the change from bafd52d to 26c61ad; the builder's report is build-r1.md. The code change is limited to `decisions-pickup.mjs` (+17/-4), `decisions-pickup.test.mjs` (two new tests) and `SKILL.md` (two sentences).

The worktree was never modified. Its `git status --short` is empty apart from this report. Every run used fresh `mktemp -d` dirs:
- rv-k6UV: an archive of 26c61ad.
- rv-Cn8h: fresh git fixtures. They were made with `clone --shared`, `clone --bare`, `worktree add --no-checkout` and `init --separate-git-dir`, with no commits and no identity.
- rv-JtTT and rv-DYlp: mutation copies.
- rv-Bgvj: the live-store snapshot.

No command was denied.

## C4 fields

Cause: `readRegistration` returned the normalized main-checkout identity as `entry.repo`, so `pickupOnce` read the config again from the main checkout (F1). Separately, `mainCheckout`'s `/\/?\.git\/?$/` strip turned a bare common dir `proj.git` into a sibling `proj`, and P1 had made that stripped value the authorization identity (F2).
Discriminating check: each new test fails when only its own fix is reverted on a 26c61ad copy. With `repo: boundRepo` restored (rv-JtTT), only "a registration entry naming a linked worktree…" fails. With `return durableTransportRepo(configCheckout, …)` restored (rv-DYlp), only "a worktree of a bare-backed clone stays its own project…" fails. Both pass on 26c61ad.
Fix location: `skills/decisions/scripts/decisions-pickup.mjs`: `registeredProject` now returns `projectIdentity(...)` (new helper, :646-660), and `readRegistration` returns `{ repo, … }` (:740). The text changes are at `skills/decisions/SKILL.md:67-70` and `:84`.
Simplification: none further. Identity still funnels through one function, `registeredProject` → `projectIdentity`, and `transport.mjs` is untouched, as the lead ruled.

## Prior findings: fix verification

- **F1: FIXED.** The code is my r1 patch verbatim.
  - The rv-Cn8h/reg.mjs rows at bafd52d were `wt2 → main2, PICKUP_FAILED` and `wt3 → main3, PICKUP_FAILED`.
  - At 26c61ad they are `wt2 → wt2, PICKUP_RECORDED` and `wt3 → wt3, PICKUP_RECORDED`, and the direct runs are still RECORDED.
  - The new test also asserts that the receipt binds to the main checkout's realpath, so fixing F1 did not undo P1.
- **F2: FIXED.** The code is my r1 patch verbatim.
  - open2.mjs: with a round recorded from the separate clone `proj`, the bare-backed worktree `bwt` now gets status PENDING_MANUAL_HANDOFF. `open` throws PRIVATE_CAPTURE_UNAVAILABLE and the renderer capture is null. At bafd52d this was RECORDED, with the bytes readable.
  - harness.mjs identities at 26c61ad:

    | Checkout | Identity |
    |---|---|
    | main | main |
    | wt | main |
    | wt-link | main |
    | bwt | bwt |
    | proj | proj |
    | plain/sub3 (submodule-like) | plain/sub3, now back to its pre-lane value |
    | sep (separate-git-dir) and repo.git (bare) | throw ENOENT, the same as before this lane (fails closed) |
- **F3: follow-up lane, by the lead's ruling.** The flaw is still present and I measured it: with `GIT_DIR=<proj>/.git`, `--repo main` gives project `proj`. It is not blocking for this lane. The follow-up lane should strip `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR` and `GIT_INDEX_FILE` in the identity git runner, or in `transport.gitRunner`.
- **F4a: FIXED.** The sentence now reads "Any other conflict when merging into main, of any kind, means no merge", which no longer contradicts the append-only exception. One cosmetic nit: SKILL.md:84 is now 94 characters, a little wider than the paragraph's roughly 90-column wrap. No test enforces a width.
- **F4b: FIXED.** The sentence now says that `--clear-done` finds the round only from the registered checkout or its linked worktrees, never from a separate clone. That matches the measurements: from `wt` and `wt-link` the capture is FOUND, and from `proj` and `bwt` it is null.
- **F5: no change, by the lead's ruling.** It still fails closed; it cannot misbind.

## Regression hunt

- **`projectIdentity` edge cases.**
  - It returns early when `main === configCheckout`, so a main checkout costs no extra git call and its identity is byte-identical.
  - The relative common dir from a subdirectory (`../.git`) is resolved against the realpath config checkout.
  - If git fails, identity falls back to the checkout's own realpath.
  - `main` and `dirname(common)` come from the same git output, so on Windows their casing cannot diverge between the two.
- **Live check.** It stays on the byte-identical path; see below.
- **Registration.**
  - Sorting and deduplication still key on the identity (`boundRepo`, :734).
  - `pickupOnce` recomputes the same identity from the config checkout.
  - The live registration's single entry is the main checkout itself, so its entry path equals its identity, and nothing changes for Netcup.
- **Suites.**
  - `node --test skills/decisions/scripts/*.test.mjs` in the worktree (HEAD 87d72f5, code identical to 26c61ad) passes 492/492.
  - `skill-text.test.mjs`, `mirror-shared-skills`, `native-package` and `janitor` tests: 107 pass, 0 fail, 2 skipped.
- **Not measured.** I did not run `account` from a worktree directly. It shares the `registeredProject` funnel and the same `receipt.project` and `transportRepo` checks that status and open now pass from `wt`, so I verified it by reading the code only.

## Live status check (read-only)

**The code does not write.** `status` → `registeredProject` → `projectIdentity`. The only new step is `git rev-parse --git-common-dir` plus realpath, and the rest of the path is the same read-only one verified in r1: no `atomicJson`, `privateMkdir`, `acquireClaim` or write call.

**Result.** From this worktree's code, `status --page 3e1da11277a18174bccfea187d5c3972 --repo /home/ben/Code/wt-ws-mainbase` gave:
- status **RECORDED**, round 3;
- project `/home/ben/Code/claude-delegation`;
- projectScope `f403a017…c39dc1`;
- evidence OK, claimed false, exit 0.

**Nothing was written.** An mtime and size listing of `~/.agents/ws/decisions-pickup`, taken before and after, is identical. `git status --short` in wt-ws-mainbase shows 0 lines.

## Housekeeping

The scratch dirs rv-k6UV, rv-Cn8h, rv-JtTT, rv-DYlp and rv-Bgvj are left in place under the no-delete rule. None of them is inside a repository tree that is under review.
