VERDICT: NEEDS_FIXES (4) efb1e7d1b36977e5e15de1b793374f82a64d62b0

# triage71 review, round 1

Reviewed: worktree wt-triage-fetch-first-71-triage71, branch build/triage-fetch-first-71-triage71, `git rev-parse HEAD` = efb1e7d1b36977e5e15de1b793374f82a64d62b0, diff 3438d721...HEAD (5 files, +690/-19). I read the diff itself, not the report's summary of it. The worktree is clean (`git status --short` is empty).

Gate re-run by me: `node --test scripts/knowledge-triage.test.mjs scripts/knowledge-publish-sync.test.mjs scripts/knowledge-gather.test.mjs` gave tests 59, pass 59, fail 0. `node --test skills/multi/scripts/hooks.test.mjs` gave tests 42, pass 42, fail 0 (the N2 spawn-env scan passes). Both match the builder's gate log.

Findings: 1 MAJOR, 3 MINOR, 0 BLOCKER.

Cause: after the one-rebase repair, `digestCommitSince` still scans `<dotfilesBefore>..HEAD`. The rebase pulls origin's raced commits into that range, so another host's commit that touches the DIGEST source path is counted as this run's digest commit.
Discriminating check: in a real-git scratch probe, the skill's single commit touches only `topics/base.md` (the store DIGEST changed, the source DIGEST did not), and the raced commit from the other host touches `source-inbox/_archive/DIGEST.md`. With no race the job raises ATTENTION "DIGEST changed but no commit touching its source path since the run began". With the race the job reports `success` and `publication.verified: true`.
Fix location: scripts/knowledge-publish-sync.mjs `repairPushRace` (return the pre-rebase base sha) and scripts/knowledge-triage.mjs l.392 (`digestCommitSince` range).
Simplification: after a repair, scan only the commits the rebase replayed (`<pre-rebase origin sha>..HEAD`). No new mechanism is needed.

## MAJOR 1: a race commit from another host that touches DIGEST is counted as this run's digest commit after the repair

Evidence:
- scripts/knowledge-triage.mjs l.388-392: on `fix.pushed` the code re-reads `pub`, then calls `digestCommitSince(opts, pub, receipt.dotfilesBefore)`.
- scripts/knowledge-gather.mjs `digestCommitSince` runs `git log --format=%H <before>..HEAD -- <digestRel>`. After `git rebase origin/<b>`, that range is [other host's commits..., own rebased commit].
- Measured with a scratch probe that copies this branch's harness and adds two knobs: the skill does not append to the source DIGEST, and it commits `topics/base.md`. Output:
  - control, no race: `A-control attention publication not verified: DIGEST changed but no commit touching its source path since the run began`
  - race on DIGEST_REL: `A-twin success null {"verified":true,...,"repair":{"attempted":true,"outcome":"pushed"}}`, with log `triage: archive notes (topics/base.md) / other host commit (source-inbox/_archive/DIGEST.md) / seed`
- This is the case the brief says "must NOT be counted". The builder tested it only on the fast-forward side ("origin ahead ... a pulled-in DIGEST commit is not this run's"). The repair side is its twin, and it is the named class "a safety stop that passes because it is not looking". The damage is bounded: reconcile still leaves notes without a committed slug as residue. But the run reports success where before lane 71 it raised ATTENTION.
- A related edge has the same cause. If the rebase drops the own commit as already applied upstream, the range holds only foreign commits.

Fix (mechanical, apply verbatim):

scripts/knowledge-publish-sync.mjs, current:
```js
  const rebase = await git(options, repo, ["rebase", remote]);
```
replacement:
```js
  const base = await git(options, repo, ["rev-parse", remote]);
  if (!base.ok || !base.out) return { attempted: false, why: `rev-parse ${remote} failed: ${base.error}` };
  const rebase = await git(options, repo, ["rebase", remote]);
```
current:
```js
  return { attempted: true, pushed: true };
```
replacement:
```js
  return { attempted: true, pushed: true, base: base.out };
```

scripts/knowledge-triage.mjs, current:
```js
    let repairNote = "";
```
replacement:
```js
    let repairNote = "";
    let repairBase = null;
```
current:
```js
      if (fix.pushed) pub = await publicationState(opts);
```
replacement:
```js
      if (fix.pushed) { repairBase = fix.base; pub = await publicationState(opts); }
```
current:
```js
      const commit = await digestCommitSince(opts, pub, receipt.dotfilesBefore);
```
replacement:
```js
      // After a repair only the replayed own commit counts; origin's raced commits sit below repairBase.
      const commit = await digestCommitSince(opts, pub, repairBase ?? receipt.dotfilesBefore);
```

Predicted outcome:
- A-twin: the range `base..HEAD` holds only the rebased `topics/base.md` commit, `commit` is null, and the run raises ATTENTION "publication not verified: DIGEST changed but no commit touching its source path since the run began".
- The existing real-git push-race test is unchanged: the own commit touches DIGEST and is found.
- The fake-git wiring test still passes. Its `rev-parse origin/main` falls through to `console.log(head)`, and its `log` answers from `touchesDigest`.
- assertSafeCalls allows `rev-parse`.

Optional, and cheaper to explain: refuse the repair up front when the single own commit does not touch `pub.digestRel` (`git log --format=%H <before>..HEAD -- <digestRel>` must equal `a[0]`). Do this in addition to the range fix, not instead of it, because only the range fix covers the dropped-empty edge.

Regression test to add (scripts/knowledge-publish-sync.test.mjs):
1. Give `fakeClaude` two knobs: `skipSourceDigest` (do not append to `cfg.sourceDigest`) and `commitFile` (append to and `git add` that file instead of `cfg.digestRel`).
2. Add the test `configure({ skipSourceDigest: true, commitFile: 'topics/base.md', race: { file: DIGEST_REL, text: '2026-09-29 · other-host → merged:z.md\n' } })`.
3. Assert `status === 'attention'` and that the reason matches `/no commit touching its source path/`.
4. Revert the fix on a scratch copy and the test fails, because the status reads `success`. That is what I measured above.

## MINOR 2: the conflict-on-rebase packet runs `rebase --continue` without staging the resolution

Evidence:
- scripts/knowledge-publish-sync.mjs l.144-145: "Resolve the files by hand, then:" is followed directly by `git -C <repo> rebase --continue`.
- Git refuses `--continue` while conflicted paths are unstaged ("you must edit all merge conflicts and then mark them as resolved using git add"). So the paste sequence fails at that line.
- I could not run this live: my scratch-repo check was blocked by a guard hook (verbatim below). The finding rests on git's documented behaviour.
- The brief's own recipe omits the step too, so this is not a builder deviation. But item 3's goal is "recovery is a paste".

Fix, current:
```js
      "That rebase stops at the same conflict. Resolve the files by hand, then:",
      `  git -C ${r} rebase --continue`,
```
replacement:
```js
      "That rebase stops at the same conflict. Resolve the files by hand, then:",
      `  git -C ${r} add -u`,
      `  git -C ${r} rebase --continue`,
```
(`add -u` stages tracked files only, so the host's untracked `._*` files stay out.) Add `'add -u'` to the conflict test's packet line list at publish-sync.test.mjs l.328.

## MINOR 3: the repair pushes `HEAD:<preflight branch>` without checking that HEAD is still on that branch

Evidence:
- scripts/knowledge-triage.mjs l.390 passes `receipt.sync.branch`, which was read at preflight.
- scripts/knowledge-publish-sync.mjs l.92-106 computes `origin/<b>..HEAD`, rebases HEAD and pushes `HEAD:<b>`.
- If the nested run left HEAD on another branch (for example main plus one commit), the repair rebases that branch and pushes it to `<b>`. A detached HEAD is already excluded, because `publicationState` then has no `remoteRef`.
- This is unlikely, but it is the brief's question "does it push a different branch/ref than the one verified?". It costs one read.

Fix, after the `status` check in `repairPushRace`:
```js
  const onBranch = await git(options, repo, ["symbolic-ref", "--short", "HEAD"]);
  if (!onBranch.ok || onBranch.out !== branch) return { attempted: false, why: `HEAD is no longer on ${branch}` };
```
Predicted outcome: every current test is unchanged, since all of them stay on main.

## MINOR 4: no test covers "two or more own commits ahead: no rebase, no push"

Evidence:
- The guard is correct as read: knowledge-publish-sync.mjs l.97 checks `a.length !== 1 || b.length !== 1 || a[0] !== b[0]`.
- No test covers it in either file. The race tests all make exactly one commit, and the only not-attempted path exercised is the fake-git default (0 ahead).
- The attack brief names this case.

Fix:
1. Add a `fakeClaude` knob `commits: 2` that makes a second commit (for example on `topics/base.md`).
2. Add a race test asserting `status === 'attention'` and a reason matching `/repair not attempted: expected exactly one own commit .* found 2 ahead and 2/`.
3. Assert the call log has no `rebase` and no `push`, and that the remote is unchanged.

## Verified with no defect found (each tried, none failing)
- **Preflight placement.** `syncBeforeStart` runs after the curated-lock check and before `managedNames`, the baseline `publicationState` and `gatherKnowledge` (knowledge-triage.mjs l.304-311). Nothing writes to the knowledge store before it. The only earlier writes are `run.lock` and ATTENTION under `~/.agents/knowledge-triage`. The dirty test shows no gather dir, no nested start and the inbox note still in place. `sessions.json` is only written inside `selected.length > 0`, after gather.
- **`dotfilesBefore` is the post-fast-forward HEAD.** The baseline `publicationState` comes after the preflight (l.315-316). The real-git test "origin ahead" checks it against the nested run's start HEAD, and checks that a pulled-in DIGEST commit is not counted.
- **Refusals that cannot fall through.** Fetch failure, detached HEAD, missing `origin/<b>` (count returns null) and an unresolvable repo all return `stop("unresolved", ...)` and lead to ATTENTION. My probe C changed the fetch refspec so the tracking ref for main would go stale. The run did not quietly see "in sync": the fetch failed, so it raised ATTENTION "fetch failed before start" and the nested run never started.
- **Fast-forward.** It is `merge --ff-only origin/<b>` and runs only when ahead==0 and behind>0. The real-git test checks `--merges` count is 0.
- **No destructive or identity calls.** The full set of git calls in the new module is: symbolic-ref, status, fetch `--no-tags --no-prune` origin, rev-list, merge `--ff-only`, rebase, rebase `--abort`, push `origin HEAD:<b>`. There is no force, reset, stash, checkout, clean or `-c`. `assertSafeCalls` enforces this on the real job call logs.
- **The push is reachable only through the repair path.** It needs `digestChanged && !pub.verified && head && remoteRef && head !== remoteRef` (l.389), a clean tracked tree, and exactly one own commit. A mismatch without a DIGEST change never reaches the repair.
- **Conflict handling.** `rebase --abort` runs, the tree is clean, no rebase-merge or rebase-apply directory is left, and nothing is pushed (real-git test).
- **Second push rejection.** There is no second rebase: one rebase and one push in the log, and the stop kind is pushRejected (real-git test).
- **ATTENTION text.** The generic lines are byte-unchanged; the diff only inserts `...block` after the problem line. The BLOCKED note goes through `safeSummary`, which handles `assertFieldSafe` and the 400-char cap. The dirty and conflict tests assert `assertFieldSafe`. Ben is still named as the one who recovers. The dirty and diverged commands are well formed.
- **Repo path in packet commands.** In production the repo path comes from `git rev-parse --show-toplevel`, which uses forward slashes, so it pastes into both bash and PowerShell. Only the test seam shows backslashes.
- **Existing tests.** The diff of knowledge-triage.test.mjs touches no existing test body; it changes fake-git lines and appends 5 tests. The new fake-git branches answer clean or in-sync only for the new subcommands, which matches the brief. The real-git file carries the actual proof, so a test that passes only because of the fake would not go unnoticed. The `ls-remote` change applies only when `s.race` is set, which no pre-existing test sets.
- **Lock.** The curated lock is never taken or cleared. The race test asserts the lock still exists after the repair.
- **N2.** Every `execFileSync` and `gitIn` in the new test passes the sealed env, and no test sets an identity. hooks.test.mjs passes.
- **File sizes.** All under 800 lines: 163, 380, 460, 567, 738.
- **Header comment (l.2-10).** It covers the fetch, the fast-forward, the one-rebase push repair, no force-push, never touching the curated lock and no chezmoi.
- **Dirty check.** It uses `--untracked-files=no`; untracked files do not stop the run (test). I could not run the staged-only and mode-only checks live because of the guard block below. By git's porcelain semantics, staged and mode changes (with core.fileMode=true) show up as entries.

## Not judged (out of scope for this review)
- A repaired run still leaves the skill's curated lock in place. The next run therefore defers, and the one after escalates. That interaction belongs to the seam reviewer.
- If origin moves after the skill's own successful push, the job still raises "publication not verified". This is pre-existing rev4 behaviour, and that window is seconds wide.

## Guard block, verbatim (that step was stopped and not retried any other way)
When I tried to run a scratch-repo script (makeTempHome fixture) that would have checked the conflict packet's paste sequence and the staged-mode porcelain output live:
```
PreToolUse:Bash hook error: [C:/Users/benzh/.claude/hooks/secret-guard.sh pretooluse]: SECRET-GUARD: blocked — command references a secret file. Use ~/.claude/scripts/secret-tool.sh (check|fingerprint|sync|set|grep-safe|scrub) — it never prints values. To read a non-secret part of that file, copy the needed non-secret lines via secret-tool grep-safe.
```
The script referenced no secret file. My guess is that a property name such as `th.env` matched the guard's pattern. Because of this block, MINOR 2 and the staged and mode-only dirty claims rest on git's documented behaviour, not a live run.

Scratch files, left for the lead's closeout: C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-71/review/ (build-probe.mjs, probes.part.mjs, probe.test.mjs, conflict-paste.mjs, which never ran).
