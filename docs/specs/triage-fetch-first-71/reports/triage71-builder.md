VERDICT: PASS

# triage71 builder report (lane 71: triage fetches before it commits)

Worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-triage-fetch-first-71-triage71, branch build/triage-fetch-first-71-triage71, base 3438d721. Two commits: bb6c22ba, efb1e7d1 (the final sha is in the structured reply). No push, no merge, nothing outside the listed files, no skill file, no real chezmoi source, no identity set.

## What changed
- scripts/knowledge-publish-sync.mjs (new, 163 lines): `syncBeforeStart` (item 1), `repairPushRace` (item 2), `recoveryBlock` (item 3 blocks). Every call is `git -C <repo> ...` through `runProcess` (30 s bound, no shell), env from `deps.gitEnv ?? process.env`.
- scripts/knowledge-triage.mjs (460 lines): header comment (l.2-9) updated; `recoveryText(problem, block)` appends the block after the problem line and leaves the generic lines byte-for-byte; `raiseAttention`/`attend` take the block; preflight call; post-nested repair call; `receipt.sync` and `receipt.publication.repair` added.
- scripts/knowledge-gather.mjs (567 lines): git helper takes `ctx.deps.gitEnv ?? process.env`; shared `repoRoot` helper out of `publicationState` (behavior identical); new export `resolveDotfilesRepo`. gather test run too: green.
- scripts/knowledge-triage.test.mjs (738 lines): fake-git learned status, fetch, rev-list, rebase, push, merge with clean in-sync defaults (knobs: dirty, fetchFailure, ahead, behind, race, rebaseFail); 5 wiring tests appended. The 20 existing tests are unchanged and pass.
- scripts/knowledge-publish-sync.test.mjs (new, 380 lines): 11 real-git tests.

## Flow (cites are to the worktree's current files)
- Item 1 placement: in `runKnowledgeTriage`, right after the curated-lock check and BEFORE `managedNames` (knowledge-triage.mjs, the `syncBeforeStart(opts)` block). I put it before `managedNames`, not just before the baseline, because the managed set is a listing of the chezmoi source inbox and a fast-forward can add files there. `dotfilesBefore` is read by the unchanged baseline `publicationState` after it, so it is the post-fast-forward HEAD.
- Preflight steps: `symbolic-ref --short HEAD` (unresolved/detached), `status --porcelain --untracked-files=no` (dirty: refuse BEFORE any fetch), `fetch --no-tags --no-prune origin` (failure: ATTENTION with the git error), `rev-list --count origin/<b>..HEAD` and `HEAD..origin/<b>`, ahead>0 -> "diverged before start" (also when ahead with nothing behind), behind>0 -> `merge --ff-only origin/<b>`. No stash, reset, checkout, clean, force, merge commit, identity.
- Item 2 placement: after the nested run and the first post-run `publicationState`, only when `digestChanged` and HEAD and the fresh remote ref are both known and differ. Repair runs only if the tracked tree is clean and `rev-list origin/<b>..HEAD` and `rev-list <dotfilesBefore>..HEAD` are the same single commit; then `rebase origin/<b>` once, `push origin HEAD:<b>`, `publicationState` again, then the existing digest-commit check. Conflict: `rebase --abort`, ATTENTION "conflict on rebase". Push rejected: ATTENTION "push rejected after one rebase", no second rebase. Not repairable (more or fewer commits, dirty tree, fetch failure): nothing is run beyond reads and a fetch, and the existing "publication not verified: ..." ATTENTION is raised with ` [repair not attempted: <why>]` appended.

## Scout section 4, resolved
1. Item 2 lives in the outer job as a post-nested repair step in the new module, the only in-repo seam; proposed skill sentences are in reports/triage71-skill-patch.md for the lead (not applied). Header comment updated. This reverses rev4's "job never pushes" for this one case.
2. Dirty = tracked changes only (`--untracked-files=no`); mode-only changes count as dirty. This is the literal spec reading, and it would stop a host whose tracked tree carries mode-only changes (the incident host showed two `M ...executable_*.sh` mode-only entries, core.fileMode differs per host), every day until Ben clears them. Untracked files (`._*`) do not stop it (test: "untracked files alone do not stop the run").
3. A repaired push leaves `.curated-update.lock` alone (test: the fake skill creates the lock and the test asserts it still exists after the repair). The next run defers on it exactly as before; lock mechanism is out of scope.
4. Unresolvable repo, detached HEAD, or missing origin/branch ref at preflight: ATTENTION "dotfiles repo unresolved: ..." (a missing remote surfaces as "fetch failed before start: <git error>"). Never a silent continue.

## Evidence: item 1 and 2 scenarios, all in scripts/knowledge-publish-sync.test.mjs against a scratch bare origin
- clean + in sync: "clean and in sync: preflight fetches, changes nothing, ..." (proceeds, success, no merge/rebase/push).
- origin ahead: "origin ahead: fast-forwards first, dotfilesBefore is the new HEAD, ..." (merge --ff-only; dotfilesBefore equals the new HEAD and the nested run's start HEAD; the pulled-in DIGEST commit is not counted; no merge commit).
- dirty tracked file: "dirty tracked file: ATTENTION before any fetch, ..." (refused before ANY fetch; no gather dir, no nested start, inbox untouched, hand edit still in place). Stated choice: no fetch is needed to refuse.
- diverged before start: "diverged before start: ..." and "ahead only ..." (fetch happened, no merge/rebase/push, local HEAD unchanged).
- push race: "push race: origin gains a commit during the run; ..." (skill push confirmed rejected; one rebase, one push; remote head equals local head; log is [triage: archive notes, other host commit, seed]; 0 merge commits; lock untouched).
- rebase conflict: "rebase conflict: the same DIGEST tail edited on both sides; ..." (rebase then rebase --abort, no push, tree clean, no rebase-merge/apply dir, skill commit still local, remote unchanged).
- second push rejection: "second push rejection: exactly one rebase, one push, ..." (pre-receive hook closes the remote; 1 rebase, 1 push, tree clean).
- also: fetch failure and detached HEAD (both ATTENTION, nothing started), recoveryBlock path quoting.
- Every test asserts via the logging git wrapper that no job call contains `--force*`, `reset`, `stash`, `clean`, `checkout`, `-c`, `user.*`, that every `merge` has `--ff-only`, and every `push` is exactly `push origin HEAD:main`.

Actual job git call log, push race (from the gate log, line 58): symbolic-ref, status, fetch, rev-list --count x2 (preflight), then the baseline and post-run reads (rev-parse, symbolic-ref, ls-remote, show, twice), then `["status","--porcelain","--untracked-files=no"]`, `["fetch","--no-tags","--no-prune","origin"]`, `["rev-list","origin/main..HEAD"]`, `["rev-list","<before>..HEAD"]`, `["rebase","origin/main"]`, `["push","origin","HEAD:main"]`, then rev-parse, symbolic-ref, ls-remote, show, and the digest `log`.

Actual job git call log, rebase conflict (gate log, line 60) ends: `... ["fetch","--no-tags","--no-prune","origin"],["rev-list","origin/main..HEAD"],["rev-list","<before>..HEAD"],["rebase","origin/main"],["rebase","--abort"]`. No push.

## Evidence: item 3, packet blocks as produced by the test run (repo path shortened to <fixtures>\dotfiles; the generic tail is unchanged)
dirty before start:
```
dirty before start: <fixtures>\dotfiles has 1 tracked change(s) on main (M README.md); nothing was gathered or run
State: dirty before start. Repo found: <fixtures>\dotfiles. The job stopped before it touched the knowledge store; there is nothing of its own to recover.
  git -C <fixtures>\dotfiles status --short
Ben commits or discards those tracked changes by hand (the job never does). When that is done, remove ATTENTION with the last command of this packet.
Ben inspects and recovers this; never an agent. Only if you inspected a STALE curated lock (no triage process running, owner.txt confirms):
  rmdir ~/.claude/knowledge/.curated-update.lock
Then, once the cause is fixed:
  rm ~/.agents/knowledge-triage/ATTENTION
```
diverged before start (block only):
```
State: diverged before start. Repo found: <fixtures>\dotfiles. The job stopped before it touched the knowledge store.
  git -C <fixtures>\dotfiles fetch origin
  git -C <fixtures>\dotfiles log --oneline origin/main..HEAD
  git -C <fixtures>\dotfiles rebase origin/main
  git -C <fixtures>\dotfiles push origin HEAD:main
Read the log first: those are the commits origin lacks. When that is done, remove ATTENTION with the last command of this packet.
```
conflict on rebase (block only):
```
State: conflict on rebase. Repo found: <fixtures>\dotfiles. The job tried one rebase of its single commit onto origin/main; on a conflict it runs rebase --abort, so the commit is still in the local branch and nothing was pushed.
  git -C <fixtures>\dotfiles status
  git -C <fixtures>\dotfiles fetch origin
  git -C <fixtures>\dotfiles rebase origin/main
That rebase stops at the same conflict. Resolve the files by hand, then:
  git -C <fixtures>\dotfiles rebase --continue
  git -C <fixtures>\dotfiles push origin HEAD:main
  git -C <fixtures>\dotfiles status -sb
Verify the branch line shows no ahead or behind. If the status shows a rebase still open (the packet line above says when the abort failed) and you would rather start over, run this first:
  git -C <fixtures>\dotfiles rebase --abort
When that is done, remove ATTENTION with the last command of this packet.
```
The BLOCKED note stays one `safeSummary` line (state name plus repo); tests assert `assertFieldSafe` on the delivered text for the dirty, conflict and the existing lock cases. Paths containing whitespace are quoted in the commands.

## Gate (tail of reports/triage71-gate.log, which also includes knowledge-gather.test.mjs because knowledge-gather.mjs changed)
```
ℹ tests 59
ℹ pass 59
ℹ fail 0
ℹ cancelled 0
```
`node --test skills/multi/scripts/hooks.test.mjs` run once: tests 42, pass 42, fail 0 (N2 spawn-env scan green on the new test file).

## Deviations and additions the lead should look at
- Two ATTENTION block kinds beyond the three named states: "push rejected after one rebase" (reuses the diverged commands) and "unresolved" (status -sb, remote -v, fetch origin) for fetch/detached/ff failures. Small and paste-ready; drop if the three-state wording is strict.
- Preflight sits before `managedNames`, not between it and the baseline (reason above). The existing "managed discovery failure skips" test still passes because `dotfilesRepo` is a seam there and the preflight does not call chezmoi when it is set; in production the preflight adds one extra `chezmoi source-path` call.
- Repair also runs when origin did not move but the skill's push never happened (ahead by exactly one, behind 0): rebase is a no-op and the push retries once. Consistent with the brief's "ahead by exactly one own commit"; flag if unwanted.
- `receipt.sync` and `receipt.publication.repair` are new receipt fields (schemaVersion left at 1; no existing test pins the receipt key set).
- Rebase and the repaired push need a git identity on the production host (the rebase rewrites the commit); the job never sets one, it relies on the host's own config exactly as the skill's commit does.
- Not done by me, by scope: Linux suites on Netcup and Hetzner (lead), skill file edits (patch text only), a live run against the real chezmoi source.
