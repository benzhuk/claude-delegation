VERDICT: NEEDS_FIXES 6ef609a

# Lane 47 (repo-env-everywhere-1) review r2, a delta review: 1b6a5d5..6ef609a

There are 3 findings: 1 MEDIUM and 2 LOW. There are also 2 NITs and some INFO notes. F1 to F5 were applied as ruled, and every one of them does what it says. In the areas listed under "Verified" I found no defect. The MEDIUM finding (R2-1) is in P8/F2 logic that is still in place at 6ef609a. The main checkout's "nothing to say" answer masks what the worktree itself says. The goal is a one-condition patch, which I tested on a scratch copy.

Bug-fix fields for this review:
Cause: bearingsNotice (hooks/lib/goal-context.mjs:43-48) treats the main checkout's answer as final unless the worktree's answer is exactly `current`. A main checkout with no goal card (`unconfigured`) or with no receipt therefore hides a worktree that is due. The notice goes silent, or it drops the reviewer-not-independent reason.
Discriminating check: in a scratch main checkout with no card, plus a linked worktree that has docs/goals/card.md and no receipt, `bearingsNotice(wt)` returns `null` at 1b6a5d5 and at 6ef609a. It returns "Bearings are due." at base d6f5c9d and with the R2-1 patch. `bearings-state check --repo <wt>` says `due/no completion receipt`.
Fix location: hooks/lib/goal-context.mjs:44-48 (the F2 fallback condition), plus one test in hooks/lib/goal-context.test.mjs.
Simplification: this changes the condition only. There is no new module and no second resolution path. It stays inside P8's "one resolution change in the notice's own code" limit.

## R2-1 MEDIUM: the F2 fallback still loses the worktree's answer when the main checkout has nothing to say

`hooks/lib/goal-context.mjs:43-48` only uses the worktree's own `check` when that result is exactly `current`. This causes two failures.

- **Case G: the main checkout has no goal card, and the worktree has one with no receipt.** I measured this with probe-f2-g.mjs and real git:
  ```
  G card only in wt, no receipt, cwd=wt: base=DUE(generic) | r0=null | fix=null | check(wt)=due/no completion receipt | check(main)=unconfigured
  ```
  - At 6ef609a the notice is silent.
  - `bearings-state.mjs check --repo .` in the same worktree says due.
  - Base d6f5c9d said due.
  
  This is the same notice-vs-check disagreement that P8 and F2 exist to remove. P8 introduced it, and the F2 patch kept it. It is a false negative from the one advisory whose job is to say "due". It happens when a project adopts bearings on a branch in a worktree before the card reaches the main checkout, or when the main checkout sits on an older branch.
- **Case F: the brief asked whether the reviewer-not-independent message is kept.** The main-checkout direction keeps it. The worktree direction loses it.
  - **Main-checkout receipt not independent, cwd = worktree (case E): kept.** Main returns `due/reviewer-not-independent`. The worktree has no receipt, so its result is not `current` and `checked` stays on main. The specific message prints.
  - **Worktree receipt not independent, main has no receipt, cwd = worktree (case F): lost.** Main returns `due/no completion receipt`. The worktree returns `due/reviewer-not-independent`, which is not `current`, so the notice prints the generic "Bearings are due." Base d6f5c9d printed the specific reviewer message. The lead would rerun `/delegation:bearings` with the same reviewer. I found this by reading the code (lines 43-52 against bearings-state.mjs:94-106). My executed probe for E, F and H was stopped by a hook denial, quoted verbatim below, and I did not retry it.

Patch. Current code (goal-context.mjs:44-48):
```js
    // A receipt completed from inside a worktree is keyed on that worktree: still honour it.
    if (checked.status !== 'current' && repo !== given) {
      const own = checkBearings({ repo: given, env });
      if (own.status === 'current') checked = own;
    }
```
Replacement:
```js
    // A receipt completed from inside a worktree is keyed on that worktree: still honour it. The
    // worktree's own answer also wins when the main checkout has nothing to say: no goal card there,
    // or a card with no receipt at all (so a worktree-only card, or a worktree receipt's own reason,
    // is never masked by the main checkout's silence).
    if (checked.status !== 'current' && repo !== given) {
      const own = checkBearings({ repo: given, env });
      const mainSilent = checked.status === 'unconfigured' || checked.reason === 'no completion receipt';
      if (own.status === 'current' || (mainSilent && own.status !== 'unconfigured')) checked = own;
    }
```
Add this test to hooks/lib/goal-context.test.mjs. It copies the F2 test's fixture with two changes. The main commit gets a README and no card, and the card is written into the worktree after `worktree add`. Make no `complete` call. Then:
```js
  const { bearingsNotice } = await import(pathToFileURL(HELPER).href);
  const notice = await bearingsNotice(worktree, { env: { AGENTS_HOME: bearingsHome } });
  assert.match(String(notice), /^Bearings are due\./, 'a card only the worktree has must not be masked by the main checkout having none');
```
Predicted and measured outcome: I applied this on scratch copy `r2-jCFI/mut3` and ran both probes against it (the `alt/fix` symlink points at mut3).
- A (receipt on main, cwd = worktree): null.
- B (receipt on the worktree, cwd = worktree): null.
- C (receipt on the worktree, cwd = main): DUE.
- D (non-repo cwd with a receipt): null.
- D2 (non-repo cwd, no receipt): DUE.
- G: DUE. That is fixed; it was null before.
- I (card in main, no receipt): DUE.
- `node --test hooks/lib/goal-context.test.mjs` passed 3/3.

Tracing the code for the cases I could not run gives this:
- E stays specific (main is not "silent").
- F becomes specific.
- H (main current, worktree not independent) stays null.
- Main and worktree both `unconfigured` stays null.
- `disabled` behaves the same for both, because it is home-scoped.

## R2-2 LOW: F1 residue. build.md's narrative still asserts the disproved cause as fact

The four fields are verbatim, and `node scripts/bugfix-fields.mjs build.md` passes. The docstring (note-inbox.mjs:337-341) and the test comment and prefix (note-inbox.test.mjs:181-188) no longer claim the missing-git cause. But docs/specs/repo-env-everywhere-1/reports/build.md still states the r0 cause as established fact, in the same report and directly above the corrected fields:
- **:198** is the heading "Root cause, found by reproduction (not assumed)".
- **:205** opens "The actual cause: `mainCheckout` is a WRITER's helper".
- **:210** says "(confirmed on the real Windows box — ...". The only thing confirmed was a repro with Git stripped from PATH.
- **:239-240** says "(so every git call throws ENOENT — the mechanism found above)".
- **:13-15** says "P6/P8 both went to the actual resolution-path cause (an unproven directory treated as checked; ...)".

:200-203 (the lead's hypothesis "ruled out" as the live cause) and :347-352 are accurate and can stay.

Exact patches (build.md at 6ef609a):
1. :13-15. Current:
   ```
   though it exists and is current. Nearest NOT: "a symptom fix" — P6/P8 both went to the
   actual resolution-path cause (an unproven directory treated as checked; a worktree path used
   as project identity), not to reformatting a message.
   ```
   Replacement:
   ```
   though it exists and is current. Nearest NOT: "a symptom fix" — P8 went to the actual
   resolution-path cause (a worktree path used as project identity). Part 2's r0 cause (an
   unproven directory treated as checked) is the r0 hypothesis, disproved by review r1; see the
   Part 2 fields. Neither change reformats a message.
   ```
2. :198. Current: `### Root cause, found by reproduction (not assumed)`. Replacement: `### r0 hypothesis, disproved by review r1 (the corrected cause is in the fields below)`
3. :205. Current: ``The actual cause: `mainCheckout` is a WRITER's helper — when `dir` is not a repo, OR when git``. Replacement: ``The r0 hypothesis (disproved by review r1, F1): `mainCheckout` is a WRITER's helper — when `dir` is not a repo, OR when git``
4. :210. Current: `could not run git for its cwd (confirmed on the real Windows box — a PATH that does not`. Replacement: `could not run git for its cwd (reproduced on the Windows box only by stripping Git from PATH, never observed live; review r1 found git reachable there — a PATH that does not`
5. :240. Current: ``mechanism found above) and calls `runNoteInbox` with `cwd: wt`, exactly as the real hook``. Replacement: ``r0 hypothesis above, not the live cause) and calls `runNoteInbox` with `cwd: wt`, exactly as the real hook``

Predicted outcome: no sentence in build.md asserts the missing-git cause as fact. The fields check still passes, because none of these lines starts with a field label.

## R2-3 LOW: the new F3 tests repeat the F4 hazard. Run standalone with GIT_DIR exported, one of them commits into the GIT_DIR repo

This is the same class as F4, in fixtures this round added:
- scripts/collect-from-origin.test.mjs:28-30. The `git` helper passes no env.
- skills/decisions/scripts/decisions-render-core.test.mjs:22. `mkRepo`'s `git init` passes no env.

Measured: I made a scratch `victim` repo with one tracked `keep.txt` and exported `GIT_DIR=<victim>/.git`. Then I ran, from the 6ef609a copy, `node --test --test-name-pattern='inherited GIT_DIR' scripts/collect-from-origin.test.mjs skills/decisions/scripts/decisions-render-core.test.mjs`. Both tests fail, and the victim gains two commits:
- "init a", which deletes `keep.txt` from the tree;
- "init b".

The victim also gains the `only-in-a` branch. `git ls-files` afterwards shows only `README.md`. The sealed `run-tests.mjs` gate is safe (P3). The standalone `node --test` form is the one both build reports give as the way to reproduce. The rest of collect-from-origin.test.mjs has had the same helper since before this lane, and the same one-line fix covers it too.

Patch 1, scripts/collect-from-origin.test.mjs. After `import { fileURLToPath } from "node:url";`, add:
```js
import { childEnv } from "../skills/multi/scripts/test-child-env.mjs";
```
and change the helper from
```js
  return execFileSync("git", args, { cwd, encoding: "utf8" });
```
to
```js
  return execFileSync("git", args, { cwd, encoding: "utf8", env: childEnv(os.homedir()) });
```

Patch 2, skills/decisions/scripts/decisions-render-core.test.mjs. After `import { defaultExecGit } from './decisions-render-core.mjs';`, add:
```js
import { childEnv } from '../../multi/scripts/test-child-env.mjs';
```
and change
```js
  execFileSync('git', ['init', '--quiet'], { cwd: dir, encoding: 'utf8' });
```
to
```js
  execFileSync('git', ['init', '--quiet'], { cwd: dir, encoding: 'utf8', env: childEnv(os.homedir()) });
```

Use `childEnv` rather than importing `withoutRepoLocatingGitEnv` directly. `childEnv` exists at base, so the red-on-base check still loads; base's transport.mjs does not export the helper.

Measured on scratch copy `r2-jCFI/mut2`:
- Unpoisoned, both files pass 24/24.
- Standalone with `GIT_DIR=<victim2>/.git`, they pass 24/24 and victim2 is untouched (still one commit, `keep.txt` only).
- The patched test files still fail 2 of 24 on base d6f5c9d and on the single-wrap mutation (`r2-jCFI/mut`), so the tests still discriminate.

## NITs

- skills/multi/scripts/note-inbox.test.mjs:208 still says "no regression from the P6 fix", although the test above it was renamed to P7. Current: `// as before (no regression from the P6 fix on the ordinary, working path).` Replacement: `// as before (no regression from the P7 hardening on the ordinary, working path).`
- build-r1.md, section F4, says `node --test hooks/lib/goal-context.test.mjs skills/multi/scripts/hooks.test.mjs` gives "3 + 30 = 33 tests". At 6ef609a hooks.test.mjs has 27 tests, so that run gives 30. I measured it both on the copy and combined. This is a report-accuracy slip only.

## INFO (no action)

- **F5 matches for real git, but not for fakes that return an empty answer.** r0 treated a fake `git` that returned `''` or whitespace as a checked repo (via mainCheckout's `return start`). The fix returns `null`, which is "not checked here". That is more correct under P7, and real git never succeeds with empty output.
- **One failure path is no longer caught.** The new code drops the second try/catch. `mainCheckout(dir, () => common)` could throw only if an injected runner returned a non-string, which calls `.trim()`. `gitRunner` always returns a string.
- **A bare repo as cwd still reads as a checked repo whose packets are all MISSING.** r0 does the same, so this was not introduced here.
- **The fallback block (note-inbox.mjs:218-224) can still resolve `fallbackStart` twice.** With F5 that is at most 3 spawns instead of 4. It was not in the F5 ruling.

## Verified: no defects found

- **F1: the fields, the docstring and the test are correct.** The build.md Part 2 fields (:216-228) match review-r1's text word for word, and `bugfix-fields.mjs` gives "all four fields present". The note-inbox.mjs docstring (:337-341) now describes P7 hardening only. The note-inbox.test.mjs comment (:181-187) no longer names the live skills-fable miss, and both titles are `L47/P7:`. The hooks.test.mjs:214 comment makes no claim about the cause. The narrative residue is R2-2.
- **F2: applied verbatim, both directions and a non-repo cwd work.** probe-f2.mjs, with real git and real `complete`, shows base / r0 / fix:
  - A, receipt on main, cwd = worktree: DUE / null / null.
  - B, receipt on the worktree, cwd = worktree: null / DUE / null.
  - C, receipt on the worktree, cwd = main: DUE / DUE / DUE, which matches `check --repo main`.
  - D, non-repo cwd (`.agents/project.json`, no git) with a receipt: null / null / null.
  - D2, the same with no receipt: DUE / DUE / DUE.
  - The main-checkout reviewer-not-independent message (case E) is kept, by code reading. The worktree direction is R2-1.
- **F3: both tests really discriminate.** On a `git archive d6f5c9d` copy with only the new tests copied in, both fail. refExists gives `false !== true`. defaultExecGit answers `/tmp/render-core-gitdir-b-*/.git`, repo B. I also took a copy of 6ef609a and mutated only the two wraps (`env: withoutRepoLocatingGitEnv(` changed to `env: ((e) => e)(` in collect-from-origin.mjs:30 and decisions-render-core.mjs:237). Both tests fail there, 22/24, so each fails because of the wrap alone. At 6ef609a they pass 24/24.
- **F4: applied as patched and effective.** With `GIT_DIR=<victim>/.git` exported, a standalone `node --test hooks/lib/goal-context.test.mjs` passes 3/3 and hooks.test.mjs passes 27/27. The victim repo is unchanged. Applying the same sealing to the F2 test was a correct extension.
- **F5: identical results and one spawn.** probe-f5.mjs ran runNoteInbox with a spawn-counting wrapper around the real `gitRunner`, over five cwds (main, worktree, subdirectory, bare, non-repo), comparing r0 with the fix. With real git the results match in every case: `packetChecked` / `packetExists` / path and the problem count. Spawns go from 2 to 1 for main, worktree, subdirectory and bare, and stay at 1 for non-repo and for the throwing fake. note-inbox.test.mjs passes 31/31 (in the targeted run).
- **Regressions in 1b6a5d5..6ef609a.** The targeted run on the 6ef609a copy (the build-r1 list) gives 468/469. The one failure is "CLI: real process, without --head, calls real git", which is expected because an archive copy is not a git repo; review r1 saw the same. The full `run-tests.mjs` on the copy, with TMPDIR in my scratch, gives 2691 pass, 6 fail and 5 skipped, with leak check 0:
  - "CLI: real process, without --head, calls real git": the same non-git failure.
  - "C12: a dead session is dialled ONCE, however many notes are queued for it".
  - "D3: a real end-to-end drain posts the envelope onto a real socket, with no orca at all".
  - "D3: a stale inbox counts as an attempt, keeps the note, and drops the registration".
  - "D4: a real post puts both lines on the socket, in order, newline-terminated".
  - "D4: a session that is gone is `inbox-stale`, and the registration is dropped".
  
  The last five (all five, C12 included, are in skills/multi/scripts/inbox.test.mjs; the log has 4 EINVAL lines) are listed only to show that none is in files this delta touches. Checked for one: "D4: a real post puts both lines on the socket" fails with `listen EINVAL` on a Unix socket path longer than 108 bytes, caused by my long TMPDIR; I did not look at the other four failure messages. Neither 1b6a5d5..6ef609a nor the whole lane touches inbox.test.mjs. The builder's worktree gate was green, with 2697 passing. No other production code changed in this delta besides goal-context.mjs and note-inbox.mjs. The hooks.test.mjs "no test file inherits the runner's environment" guard passes.
- **Identity.** Every commit in 1b6a5d5..HEAD has author and committer Ben Zhuk. The diff contains no `user.*` or `GIT_AUTHOR`/`GIT_COMMITTER` text.

## Denied (reported verbatim, not retried in any form)

I tried to patch probe-f2.mjs through a `python3` heredoc so that it forges reviewer-not-independent receipts (cases E, F and H). The hook blocked it:
`PreToolUse:Bash hook error: [/home/ben/.claude/hooks/secret-guard.sh pretooluse]: SECRET-GUARD: blocked — command references a secret file. Use ~/.claude/scripts/secret-tool.sh (check|fingerprint|sync|set|grep-safe|scrub) — it never prints values. To read a non-secret part of that file, copy the needed non-secret lines via secret-tool grep-safe.`

That step stopped there. E, F and H are assessed from the code only. Cases G and I were a separate probe with no receipt forging (probe-f2-g.mjs).

## Commands run

- `cat ~/.agents/lean-rules.md`; reads of spec.md, review-r1.md, lead-ruling-r1.md, build-r1.md and build.md (:1-40, :190-401).
- In the worktree:
  - `git log`, `git diff --stat 1b6a5d5..6ef609a`, and `git diff 1b6a5d5..6ef609a -- hooks skills scripts docs/work`;
  - `git grep` over note-inbox, the tests, hooks and build.md for P6, the false-miss text and ENOENT;
  - `node scripts/bugfix-fields.mjs docs/specs/repo-env-everywhere-1/reports/build.md`.
- Scratch at `.../scratchpad/lane-47/r2-jCFI` (made with mktemp -d):
  - `git archive` of 6ef609a (`fix`), d6f5c9d (`base`) and 1b6a5d5 (`r0`), plus the mutation copies `mut`, `mut2` and `mut3`, and the symlink dir `alt`.
  - The targeted `node --test` list on `fix`.
  - `TMPDIR=<scratch>/tmpd node scripts/run-tests.mjs` on `fix`.
  - F3 red runs on `base` and `mut`.
  - The poisoned-GIT_DIR standalone runs against the scratch repos `victim` and `victim2`.
  - `node probe-f2.mjs`, `node probe-f2-g.mjs` and `node probe-f5.mjs`, each against the base/r0/fix copies, and probe-f2.mjs and probe-f2-g.mjs again against `alt` (the R2-1 patch).
  - The R2-1 and R2-3 patch checks on `mut3` and `mut2`.
- Nothing was written to the reviewed worktree. I ran no deletes.

## Leftovers for the lead

Everything is under `/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-47/r2-jCFI/`:
- the tree copies and mutated copies: `base`, `r0`, `fix`, `mut`, `mut2`, `mut3`, `alt`;
- the scratch repos `victim` and `victim2`;
- `tmpd`;
- the probe fixtures `fx*`, `gx*` and `f5-*`;
- the probes and the logs `targeted-fix.txt` and `full-fix.txt`.

None of it holds secrets or transcript content.
