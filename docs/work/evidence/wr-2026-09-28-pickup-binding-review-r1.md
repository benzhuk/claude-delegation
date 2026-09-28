VERDICT: NEEDS_FIXES bafd52d

# Lane 34, pickup-binding — adversarial review r1

Artifact: bafd52d (diff `720430d..bafd52d`), worktree `wt-pb`, branch build/pickup-binding-1.
Nothing in the worktree was modified; `git status --short` is empty after every run. All
trial edits and fixtures were made in `mktemp -d .../scratchpad/lane-34/rv-*` copies built with
`git archive` (old = rv-dgqH at 720430d, new = rv-8Sz0 at bafd52d, mutation = rv-YRfi, candidate
fixes = rv-Dacr and rv-stzY, git fixtures = rv-jEHq). No git identity was set anywhere. The
fixtures use `git clone --shared` and `git worktree add --no-checkout`, which make no commits.

The core fix is real. The live receipt is found from wt-ws-mainbase, and the main checkout's
identity is byte-identical to before. But P1 introduced one regression in the registration
path (F1), and it lets a separate clone share a project identity with a bare-backed worktree
(F2), which the ruling forbids. Both are small and mechanical, and both patches below were
run in scratch copies and kept the decisions suite green.

## C4 fields

Cause: `registeredProject` returned the realpath of the checkout named on the command line as the authorization identity, so a linked worktree hashed a different `projectScope` and compared a different `receipt.project` than the main checkout that captured the round (confirmed: old code gives PENDING_MANUAL_HANDOFF for the live page from wt-ws-mainbase and RECORDED from the main checkout).
Discriminating check: the new test "a linked worktree of a repo resolves to the same project…" fails when only `return durableTransportRepo(configCheckout, git, fsImpl);` is reverted to `return configCheckout;` (scratch rv-YRfi: 1 fail, status PENDING_MANUAL_HANDOFF, requestedProject …/linked-worktree vs boundProject …/git-main-*), and passes on bafd52d.
Fix location: `skills/decisions/scripts/decisions-pickup.mjs:638-647` (`registeredProject`), with `git` threaded through `readRegistration` (:664, :719) and the four callers (:938, :1261, :1297, :1369). Two follow-ups are needed at :727 (F1) and in the identity helper (F2).
Simplification: the builder kept `receipt.project` and `receipt.transportRepo` as separate fields, now equal for every standard layout. That is acceptable and the right call for a minimal diff. No further simplification is asked of this lane. The F2 patch deliberately makes them differ again for bare-backed and submodule layouts, where they already differed before this lane.

## Findings

### F1 — MEDIUM (regression): a registration naming a worktree now runs pickup against the MAIN checkout's config

Evidence: `readRegistration` validates the entry's config from the worktree (`registeredProject(repo, …)` at :719). It then returns `{ repo: boundRepo, … }` at :727, and `boundRepo` is now the main-checkout identity. `runRegisteredPickup` passes that entry to `pickupOnce` (:790), and `pickupOnce` calls `registeredProject(options.repo)` again (:938). So the config is re-read from the main checkout, not from the checkout the registration names. That contradicts the ruling ("`.agents/project.json` is still read from the checkout given") and the new code comment at :631-632 ("or in a registration entry").

Measured (rv-jEHq/reg.mjs). The fixture is a registration naming worktree `wt2`, whose main checkout has no `.agents/project.json`, and `wt3`, whose main checkout names a different page.

```
old wt2 registration hands pickupOnce repo= wt2   | registered run: PICKUP_RECORDED | direct --repo wt2 : RECORDED
old wt3 registration hands pickupOnce repo= wt3   | registered run: PICKUP_RECORDED | direct --repo wt3 : RECORDED
new wt2 registration hands pickupOnce repo= main2 | registered run: PICKUP_FAILED   | direct --repo wt2 : RECORDED
new wt3 registration hands pickupOnce repo= main3 | registered run: PICKUP_FAILED   | direct --repo wt3 : RECORDED
```

Impact: every timer run returns PICKUP_FAILED, so the owner's Done ticks are never captured. This is the "work lost or stalled" class the lane exists to fix. It is not live on Netcup today, because the only registration entry is `/home/ben/Code/claude-delegation` (measured).

Fix: return the config checkout and keep `boundRepo` only for the uniqueness key. `pickupOnce` then derives the same identity itself.

Current (decisions-pickup.mjs:727):
```
    return { repo: boundRepo, page, from, owner, reader, topic };
```
Replacement:
```
    return { repo, page, from, owner, reader, topic };
```
Verified in rv-Dacr: both `new` rows above become `PICKUP_RECORDED`, and `decisions-pickup.test.mjs` plus `registered-pickup.contract.test.mjs` pass 64/64. Add a test: a registration entry naming a linked worktree whose main checkout lacks `.agents/project.json` must give `PICKUP_RECORDED`, with the receipt's `project` equal to the main checkout's realpath. It fails on bafd52d, as measured above.

### F2 — MEDIUM (misbinding): a worktree of bare `X.git` takes the identity of a sibling clone `X`

Evidence: `mainCheckout` (skills/multi/scripts/transport.mjs:449) strips the common dir with `/\/?\.git\/?$/`. The leading slash is optional, so the common dir `/…/proj.git` of a bare-backed worktree becomes `/…/proj`, a different repository whenever such a sibling exists. Before this lane that only misrouted the transport repo. Now it is the authorization identity too.

Measured (rv-jEHq/open2.mjs). The fixture: `proj` is a separate clone, and `bwt` is a worktree of a separate bare clone `proj.git`. Pickup is recorded from `proj`, then run from `bwt`:
```
new  bwt status= RECORDED               open= BYTES-MATCH  renderer capture= FOUND
old  bwt status= PENDING_MANUAL_HANDOFF open= THROW …      renderer capture= null
```
So under bafd52d, `bwt` can read `proj`'s private capture and back a `publish --clear-done` with it, and `account` would also pass its `receipt.project` check. The ruling requires that a separate clone stays a different project.

Related (LOW, fixed by the same patch): a submodule's identity moves from its working tree to `<super>/.git/modules/<name>` (measured: old `plain/sub3`, new `plain/.git/modules/sub3`). Any receipt bound to a submodule path would become PENDING_MANUAL_HANDOFF. None is live.

Fix: identity follows the main checkout only when git's common dir is exactly a `.git` component. Every other layout keeps its own realpath, as it did before. transport.mjs is not touched, so transport routing stays as it is.

Current (decisions-pickup.mjs:646-647):
```
  return durableTransportRepo(configCheckout, git, fsImpl);
}
```
Replacement:
```
  return projectIdentity(configCheckout, git, fsImpl);
}

// Only a standard linked worktree (git common dir exactly `<main>/.git`) shares its main checkout's
// identity. A bare-backed worktree, a separate-git-dir checkout or a submodule keeps its own realpath:
// `mainCheckout` strips any `.git` suffix, so `proj.git` would otherwise resolve to a sibling `proj`.
function projectIdentity(configCheckout, git = gitRunner, fsImpl = fs) {
  const main = durableTransportRepo(configCheckout, git, fsImpl);
  if (main === configCheckout) return main;
  let common;
  try { common = String(git(['rev-parse', '--git-common-dir'], configCheckout)).trim(); } catch { return configCheckout; }
  const absolute = path.resolve(configCheckout, common);
  if (path.basename(absolute) !== '.git') return configCheckout;
  return canonicalProject(path.dirname(absolute), fsImpl) === main ? main : configCheckout;
}
```
Verified in rv-stzY, which has F1 and F2 applied:
- identities are: main → main, wt → main, wt-link → main, bwt → bwt (was proj), proj → proj, plain/sub3 → plain/sub3 (was the modules dir);
- bwt status is PENDING_MANUAL_HANDOFF;
- `node --test skills/decisions/scripts/*.test.mjs` passes 489/490. The one failure, "CLI: real process, without --head…", fails identically in the pristine bafd52d archive (rv-8Sz0), because the archive is not a git repo. It passes 490/490 in the worktree.

Add a test: `git clone --bare` plus `git worktree add` from `X.git`, next to a separate clone `X` with the same `decisions_url`. A round recorded from `X` must be PENDING_MANUAL_HANDOFF from the bare-backed worktree.

### F3 — LOW: an inherited `GIT_DIR` now rebinds the identity to another repository

Evidence: `gitRunner` (transport.mjs:412-416) inherits `process.env`. Measured (rv-jEHq/gd.mjs), running `--repo main` with `GIT_DIR=<proj>/.git`: old gives `project main`, new gives `project proj`. The `--repo` config is validated, but the identity comes from the environment. This is reachable when the CLI runs from a git hook or a `!` alias. No hook in this repo calls it today (grep over hooks/ and scripts/ is empty).

Fix (instruction, shared code): give the identity lookup a git runner that drops `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR` and `GIT_INDEX_FILE` from the child env. Pass it as `git` from the pickup callers, or make `transport.gitRunner` do that for every caller, which also fixes the pre-existing transport misroute. Predicted outcome: the gd.mjs row reads `project main` with or without the variable. Acceptable as a follow-up lane if the lead prefers not to touch transport.mjs here.

### F4 — LOW: SKILL.md wording

(a) The new sentence at SKILL.md:86-87 contradicts the unchanged sentence just before it at :84-85: "Any conflict when merging into main, of any kind, means no merge…". No skill-text test pins "of any kind" (grep).

Current (SKILL.md:84):
```
posted for an ordinary accepted merge. Any conflict when merging into main, of any kind,
```
Replacement:
```
posted for an ordinary accepted merge. Any other conflict when merging into main, of any kind,
```
Better still, swap the order so the append-only exception comes first and "Any other conflict" reads naturally. Either way, run `skill-text.test.mjs` again; it passes 14/14 today.

(b) SKILL.md:67-70 says publish "runs from any clean checkout on branch main of the registered repository, a worktree included; the pickup round is found through the repository's main checkout". A separate clone on branch main of the same GitHub repository is also a checkout "of the registered repository", but it finds no round: measured `proj` gives PENDING_MANUAL_HANDOFF and renderer capture null. So `publish --clear-done` from a separate clone exits 3. Suggested text: "`publish` runs from any clean checkout on branch main of the registered repository; `--clear-done` finds the pickup round only from the registered checkout or one of its linked worktrees (`git worktree add`), never from a separate clone (Lane 34, pickup-binding)."

### F5 — LOW / informational: Windows path case

Identity equality is byte-exact at :944, :974, :1266, :1304 and :1374. With P1, a linked worktree's identity takes the path casing git recorded in its `.git` file. A main-checkout run keeps the casing the caller typed, because `fs.realpathSync` (non-native) does not canonicalize case. If they differ on Windows, the worktree gets PENDING_MANUAL_HANDOFF. That fails closed, never misbinds, and the same exposure existed before for two spellings of the main path. Not measured: there is no Windows host in this review. No fix is required for this lane. If one is wanted later, compare `canonicalPathKey(receipt.project) !== canonicalPathKey(project)` at those five points and leave the stored bytes and `projectScope` alone.

### F6 — INFO: registration uniqueness is now per repository

`repos.has(canonicalPathKey(boundRepo))` (:721) now rejects a registration with two entries for the main checkout and a worktree of one repository, or for two subdirectories that carry their own `.agents/project.json`. Every entry then becomes PICKUP_CONFIG_INVALID. That is consistent with "one repository is one project", and the live registration has one entry. Mention it in the lane record, but no change is asked.

## Attack-brief answers

1. **Cause or compensation.** It fixes the cause, at the single funnel. Every identity computation goes through `registeredProject`: pickup (:938), status (:1261), account (:1297), open (:1369) and the registration load (:719). The claim is keyed by page only (:121), so it is identity-free. Captures and the pointer use `paths.projectScope` or `receipt.projectScope`. `resolvePrivateCapture` (:250-267) takes `receipt.project` and `receipt.transportRepo`. Its store-inside-checkout guard lost nothing: an AGENTS_HOME inside a worktree is still refused by `detectedGitRoot` finding the worktree's `.git` file. The renderer's `defaultReadPickupCapture` (decisions-render-publish.mjs:97-117) calls `status` and `openPrivateCapture`, which are both fixed. Measured from worktree `wt` and symlink `wt-link`: status RECORDED, open bytes match, renderer capture FOUND. No raw-realpath identity call site remains. `canonicalProject` is now used only for config resolution (:639, :703) and inside `durableTransportRepo` (:808). The one leak is F1: the registration hands the identity back as a config path.
2. **Byte-identical scope (verified absence of defect).**
   - The live receipt reads `project=/home/ben/Code/claude-delegation`, `projectScope=f403a017…c39dc1`. sha256(project + NUL + page), recomputed, equals it.
   - `realpath /home/ben/Code/claude-delegation` is the same string, and git's common dir from the main checkout is `.git`, so `mainCheckout` returns the input.
   - status is read-only by code: `registeredProject` only reads and runs `git rev-parse`; then `readJson`, `receiptStatus` → `verifyReceiptEvidence` (reads only), `durableTransportRepo`, `resolvePrivateCapture` + `existsSync`. There is no `atomicJson`, `privateMkdir`, `acquireClaim` or write call on that path.
   - Ran from this worktree's code: `status --page 3e1da11277a18174bccfea187d5c3972 --repo /home/ben/Code/wt-ws-mainbase` gave **RECORDED, round 3**, project `/home/ben/Code/claude-delegation`, evidence OK, claimed false, exit 0. An mtime/size listing of `~/.agents/ws/decisions-pickup` before and after is identical.
   - The same command from the 720430d archive gives PENDING_MANUAL_HANDOFF, "bound to a different authorization project".
   - `--repo /home/ben/Code/claude-delegation` gives RECORDED round 3 on both old and new code.
3. **Edge cases.**
   | Case | Result |
   |---|---|
   | Bare repo as `--repo` | Throws `cannot resolve repo (ENOENT)` on old and new (pre-existing, fails closed) |
   | Non-git dir | Keeps its realpath (test 3, and measured) |
   | Submodule | Identity moved (F2, related LOW) |
   | Symlink to a worktree | Resolves to main |
   | Worktree whose main lacks config, or names a different page | Direct commands work (config from the worktree); the registration path breaks (F1) |
   | Bare-backed worktree | Collides with sibling clone (F2) |
   | Separate clone | Stays separate (measured PENDING_MANUAL_HANDOFF) |
   | Subdirectory `--repo` | Now resolves to the repo root instead of its own path (benign, consistent with P1) |
   | Windows case | F5 |

   Can one repo's worktree act on another repo's page? Not across repositories: another repo's existing receipt still fails the `receipt.project` check. The exceptions are F2 (bare/sibling) and F3 (GIT_DIR). A worktree whose own config names a page the main checkout does not name can open a round for that page under the main identity. It is authorized by its own config, exactly as before, only bound to main now.
4. **Tests that aren't looking.**
   - Test 1 discriminates. It fails on the mutation (the one-line revert) and passes on bafd52d.
   - Tests 2 and 3 are invariance pins. By design they pass on both old and new code, and they would catch an identity change for a main checkout or non-git dir, which is their job.
   - Not covered by any test: the registration path (F1), open/account/renderer from a worktree, bare/sibling (F2), and GIT_DIR (F3). Add the F1 and F2 tests described above.
5. **SKILL.md sentences.** They do not break text tests: `skill-text.test.mjs` passes 14/14 in the worktree, and mirror-shared-skills, native-package and janitor tests pass 93, with 0 failures and 2 skipped. Accuracy: sentence 2 contradicts "of any kind" (F4a). Sentence 1 overclaims for separate clones (F4b). The builder's full-suite claim is backed: `node --test skills/decisions/scripts/*.test.mjs` passes 490/490 in the worktree.

## Housekeeping

I wrote one stray scratch file, `.../scratchpad/lane-34/rv-before.txt` (the store mtime snapshot). It is outside any repo, but it sits directly in lane-34 rather than in an `rv-*` mktemp dir, and it is left in place under the no-delete rule. The scratch dirs rv-dgqH, rv-8Sz0, rv-YRfi, rv-Dacr, rv-stzY and rv-jEHq are also left in place. No command was denied by a permission prompt or guard.
