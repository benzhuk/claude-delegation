VERDICT: NEEDS_FIXES 1b6a5d5

# Lane 47 (repo-env-everywhere-1) review r1: d6f5c9d..1b6a5d5

Findings: 1 HIGH, 3 MEDIUM, 2 LOW, plus INFO notes. Part 1 (P1 to P5) is correct and well covered, apart from the test gap in F3. P6's stated cause is wrong. The real cause is established below from the live transcript and the installed plugin versions. P8 fixes the case it was aimed at and breaks the case where the receipt was written from a worktree.

## F1 HIGH: P6's cause is wrong. The live miss was stale plugin code on the `--no-repo` PostToolUse path, which 0.20.16 (c8c16be) already fixed

The builder's claim ("the hook process cannot run git, ENOENT, so mainCheckout falls back to the given dir") has no evidence behind it. The builder produced the condition by stripping Git from PATH, so the repro shows only that the code would miss in that case. It does not show that this is what happened. The measured facts point to a different cause:

1. **Git is reachable, and the same code finds the packets with git present.** On ben-desktop, `where git` gives `C:\Program Files\Git\cmd\git.exe` and `C:\Program Files\Git\bin\git.exe`, and sshd builds its PATH from the same registry PATH that a GUI-launched Orca inherits. `git -C C:\Users\benzh\orca\workspaces\claude-delegation\gudgeon rev-parse --git-common-dir --show-toplevel` gives `C:/Users/benzh/Code/claude-delegation/.git` and the worktree. I ran the installed 0.20.15 `note-inbox.mjs` from that cwd, read-only: scratch `--home C:\Temp\lane47-review\home --me skills-fable --no-bind --cold-start-hours 0 --days 1`, and it reads the real main-checkout `docs/ledger`. All four notes came back as `[packet: C:/Users/benzh/Code/claude-delegation/docs/notes/<id>.md]`: skills-n-release-0-20-17-1, -2, skills-n-lane-44-2 and skills-a-lane-37-4. The repo path (UserPromptSubmit/Stop) never misses these packets.
2. **Every live miss came from a PostToolUse hook.** I read skills-fable's transcript read-only: `C:\Users\benzh\.claude\projects\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl`, the lines containing "which is not on this machine". The 2026-09-28 hits are all `hook_additional_context` from `PostToolUse` (Write, Write, SendMessage, Bash, Edit, Bash), each running `node "${CLAUDE_PLUGIN_ROOT}/hooks/multi-inbox.js" PostToolUse`. They are at 17:51:51, 17:56:56, 17:57:22, 17:58:59, 18:09:21 and 18:16:13 EDT, all with cwd `C:\Users\benzh\orca\workspaces\claude-delegation\gudgeon`. The 17:51:51 context reads `! [skills-n-release-0-20-17-1] points at docs/notes/skills-n-release-0-20-17-1.md, which is not on this machine` and ends "This arrived mid-turn", which is the PostToolUse note.
3. **PostToolUse always passes `--no-repo`.** In hooks/multi-inbox.js:338 (`extraArgs.push("--me", me.slug, "--no-repo", ...)`), the reader builds no repo source, so the packet is never looked for.
4. **Before c8c16be, an unchecked packet was reported as MISSING.** On the Windows box, installed 0.20.12 to 0.20.15 `note-inbox.mjs:336` has `return { path: entry.details, exists: false };`. 0.20.16 and 0.20.17 have `exists: checked ? false : null` (line 339). c8c16be ("fix(multi): distinguish unchecked packets") is not in the 0.20.15 release 0c92605 and is in the 0.20.16 release 3323d75. So at 0.20.16 or later, a PostToolUse read cannot produce this problem line. At 0.20.15 or earlier it produces it for every note that has a Details line, whether or not the file exists. skills-fable's session (9c61c35a, running since 09-25) had loaded an older plugin root. 0.20.16 and 0.20.17 were installed at about 17:48 EDT, but the running session kept using its load-time `CLAUDE_PLUGIN_ROOT`.
5. **Timing is ruled out.** The packets were created at 17:51, 17:56, 17:58 and 18:09 (`dir /T:C`), the same minute as their ledger lines, and note-send writes the packet before the line (note-send.mjs:795-820). The later last-write time (18:07) comes from a later rewrite and does not matter here.
6. **The fix for the actual cause already has a red/green test.** On a scratch copy I put back the 0.20.15 line `exists: false` and reran note-inbox.test "L29: packet state distinguishes unchecked, absent, present, and no Details". It fails, and it passes at 1b6a5d5.

So (a) nothing shows the real hook lacked git, and the transcript plus the version check make that cause unnecessary. (b) The mechanism that produced MISSING with git present is `--no-repo` combined with pre-c8c16be `packetLocation`. Dedupe, the `start`/`worktreePathFromEnv` choice, drive-letter form and Details parsing are all fine: the Details lines are `Details: docs/notes/<id>.md Needs: none`, and the 0.20.15 repo read resolves them correctly. (c) `resolveRealRepo` does not hide the live symptom, because the live symptom is already gone at 0.20.16 or later. It is a P7 hardening for a different, hypothetical case: a `start` that git cannot place in any repo, which is the lead's non-repo-cwd hypothesis. That behaviour is correct under P7: a directory no git proved is never "checked". But the report, the code comment and the test all present it as the cause of the live miss, and that is false.

Fix instructions (Part 2 only; nothing else changes):
- `docs/specs/repo-env-everywhere-1/reports/build.md` Part 2: replace the four fields with the following, then simulate the fields check:
  - `Cause: skills-fable's long-running session executed plugin <=0.20.15 hook code (its CLAUDE_PLUGIN_ROOT predates the 17:48 install of 0.20.16/0.20.17); every live miss was a PostToolUse read, which always passes --no-repo, and <=0.20.15 packetLocation returned exists:false when no repo source was scanned, so an unchecked packet printed "which is not on this machine". Fixed upstream by c8c16be (in 0.20.16).`
  - `Discriminating check: transcript 9c61c35a hits are all PostToolUse (17:51:51-18:16:13 EDT); installed 0.20.15 note-inbox.mjs:336 is exists:false vs 0.20.16 :339 exists: checked ? false : null; the installed 0.20.15 reader run from gudgeon with git present reports all four packets present on the repo path; reverting c8c16be's line turns L29 red.`
  - `Fix location: none needed for the live symptom (c8c16be). skills/multi/scripts/note-inbox.mjs resolveRealRepo is P7 hardening for a start git cannot place in a repo (non-repo cwd), not the live cause.`
  - `Simplification: one git spawn per resolve (see F5); no new mechanism for the live case.`
- Remove the false claim from `skills/multi/scripts/note-inbox.mjs:331-340` (the resolveRealRepo docstring). Old: `MISSING, when the hook's cwd for some reason left git unable to answer for it (lane 47, P6 — the\n * false "not on this machine" miss). So this probes` New: `MISSING (lane 47, P7: a start git cannot place in any repo, e.g. a cwd outside every checkout, is\n * never "checked"). So this probes`
- `skills/multi/scripts/note-inbox.test.mjs:181-188`: rewrite the comment so it says the test pins P7 for a non-repo start. Delete the sentence "the false "not on this machine" miss reported live (skills-fable's pane, docs/notes/skills-n-lane-44-2.md and friends)". Rename the test prefix from `L47/P6:` to `L47/P7:`.
- Follow-up for the lead, outside this lane's territory: a session that started before an install keeps running the old hook code. That is the actual defect class behind this symptom. It belongs to plugin-staleness or to the release checklist ("restart or reload long-running panes after install"), not to note-inbox.

Predicted outcome: no behaviour change. The report and the comments match the evidence, and the lead's live proof ("packet present" on a UserPromptSubmit read from a worktree pane at 0.20.16 or later) is expected to pass.

## F2 MEDIUM: P8 now misses a receipt written from a linked worktree (regression)

`hooks/lib/goal-context.mjs:37-42` checks only `mainCheckout(cwd)`. `bearings-state.mjs complete` still keys the receipt on `findProjectRoot(repo)`, and for a worktree that is the worktree itself, because it has its own `.git` file (bearings-state.mjs:62-74, project-config.mjs:47). SKILL.md:51 tells the lead to run `complete --repo <project-root>`, and a lead working in an Orca worktree pane will pass `.`. Probe on a scratch main checkout plus linked worktree, running `complete({repo: wt})` and then `bearingsNotice(wt)`:

```
== fix   check(wt): current | check(main): due   notice(wt): Bearings are due. Run `/delegation:bearings` ...
== base  check(wt): current | check(main): due   notice(wt): null
```

The notice now disagrees with `bearings-state.mjs check --repo .` run in the same worktree, which is the same class of disagreement P8 was meant to remove, now in the other direction. Fix it inside the notice's own code, so the P8 one-change limit still holds. Check the main checkout first, and only if that result is not current, accept a current receipt keyed on the given cwd:

Old (goal-context.mjs:37-42):
```js
    let repo = cwd || process.cwd();
    try {
      const { mainCheckout, gitRunner } = await import('../../skills/multi/scripts/transport.mjs');
      repo = mainCheckout(repo, gitRunner) ?? repo;
    } catch { /* no transport.mjs here, or git could not answer: check against the given cwd as-is */ }
    const checked = checkBearings({ repo, env });
```
New:
```js
    const given = cwd || process.cwd();
    let repo = given;
    try {
      const { mainCheckout, gitRunner } = await import('../../skills/multi/scripts/transport.mjs');
      repo = mainCheckout(given, gitRunner) ?? given;
    } catch { /* no transport.mjs here, or git could not answer: check against the given cwd as-is */ }
    let checked = checkBearings({ repo, env });
    // A receipt completed from inside a worktree is keyed on that worktree: still honour it.
    if (checked.status !== 'current' && repo !== given) {
      const own = checkBearings({ repo: given, env });
      if (own.status === 'current') checked = own;
    }
```
Predicted outcome: the builder's test still passes, because the main receipt is current on the first check. My probe gives `notice(wt): null`. The main-checkout `reviewer-not-independent` message is kept unless the worktree receipt is current. Add a second test to goal-context.test.mjs that mirrors the existing one with `complete({ repo: worktree, ... })` and asserts `null`. It will be red at 1b6a5d5 and green with this patch. The durable fix is for `complete` and `check` in bearings-state to key on the main checkout themselves. That is outside P8's territory, so list it as a follow-up.

## F3 MEDIUM: call-site classes (a) and (c) have no test of their own (spec "Efficacy for Part 1")

The spec requires one lane-44-pattern test per class. For (a) it names collect-from-origin or four-read's runGit "plus one more". For (c) it names one of the decisions trio "through its default runner". build.md covers (a) with the work-record test, which is class (b), and with lane 44's existing gitRunner tests, and covers (c) only with the grep. I reverted three fixes on a scratch copy and reran: the P8, work-record and P6 tests each go red on base. Classes (a) and (c) have nothing that would go red.

Instruction: add two tests. Both are in-process and use real git with no injection.
- (a) `scripts/collect-from-origin.test.mjs`: repos A and B (`git init` under `FIXTURE_ROOT || os.tmpdir()`, env `makeGitFixtureEnv()`-style or `childEnv`). Make an empty commit in A and `git -C A branch only-in-a`. Set `GIT_DIR=<B>/.git` in the parent process and restore it in `finally`. Assert that `refExists(A, 'refs/heads/only-in-a') === true`. The exported `refExists` goes through the module's default `git`. It is false on base because B has no such ref.
- (c) `skills/decisions/scripts/decisions-render-core.test.mjs`: same two repos. Assert that `realpath(defaultExecGit(['rev-parse','--absolute-git-dir'], A).trim()) === realpath(A/.git)` while `GIT_DIR` points at B. On base it answers B/.git. Use `--absolute-git-dir`, not `--show-toplevel`: when GIT_DIR is set, git takes the cwd as the top level, so `--show-toplevel` does not discriminate.

I did not verify these two tests. My trial run was blocked (see "Denied"). Predicted outcome: red at d6f5c9d, green at 1b6a5d5.

## F4 LOW: the new real-git fixture calls inherit the parent GIT_DIR, and one of them commits into the repo it points at

1b6a5d5 dropped `env: childEnv(...)` from the git calls in goal-context.test.mjs (+56-65), and hooks.test.mjs:218 `git init` never had one. Under `run-tests.mjs` the sealed env now strips the four names (P3), so the gate is safe. A standalone `node --test hooks/lib/goal-context.test.mjs` is the command build.md's own "How to reproduce" gives. Run that way with GIT_DIR exported, which is the very scenario this lane exists for, the fixture operates on the GIT_DIR repo. I verified this in scratch: with `GIT_DIR=<real>/.git`, `git init -q m; git -C m add -A; git -C m commit -qm seed` created no `m/.git` and committed "seed" into the real repo, deleting its tracked `keep.txt`. That weakens what e75aba0's version had. Patch:

goal-context.test.mjs, import line. Old: `import { scratchHome } from '../../skills/multi/scripts/test-child-env.mjs';` New: `import { childEnv, scratchHome } from '../../skills/multi/scripts/test-child-env.mjs';`
Then add `const gitEnv = childEnv(os.homedir());` before `execFileSync('git', ['init', '-q', main]);` and append `, { env: gitEnv }` to each of the five `execFileSync('git', …)` calls. In the sealed run, `os.homedir()` is the sealed HOME, and `GIT_CONFIG_GLOBAL` survives the spread, so the `includeIf` identity still applies. Standalone runs keep the real HOME's identity, as they do today. childEnv strips the four names.
hooks.test.mjs:218. Old: `execFileSync('git', ['init', '-q', home]);` New: `execFileSync('git', ['init', '-q', home], { env: childEnv(home) });` (childEnv is already imported there).
Predicted outcome: both suites stay green, and a standalone run with an exported GIT_DIR can no longer touch the real repo.

## F5 LOW: resolveRealRepo runs `git rev-parse --git-common-dir` twice per resolve

note-inbox.mjs:341-353 probes, then calls `mainCheckout`, which runs the same command again. The fallback block at :220-224 can resolve `fallbackStart` a second time as well, so a Windows UserPromptSubmit read (2500 ms budget) can spawn git up to 4 times. Patch:

Old:
```js
function resolveRealRepo(dir, git) {
  if (!dir) return null;
  try {
    git(['rev-parse', '--git-common-dir'], dir);
  } catch {
    return null;
  }
  try {
    return mainCheckout(dir, git);
  } catch {
    return null;
  }
}
```
New:
```js
function resolveRealRepo(dir, git) {
  if (!dir) return null;
  let common;
  try { common = git(['rev-parse', '--git-common-dir'], dir); } catch { return null; }
  if (!String(common ?? '').trim()) return null;
  return mainCheckout(dir, () => common); // same answer, one spawn
}
```
Predicted outcome: identical results, and note-inbox.test stays at 31/31. Run it, because some fakes count calls.

## Part 1 (P1 to P5): verified

- **P1:** `withoutRepoLocatingGitEnv` (transport.mjs:426-437) spreads into a new object and deletes only on the copy, so it cannot mutate its argument (`{...undefined}` is also safe). The win32 `toUpperCase` match is kept. `gitRunner` uses it.
- **P2, my own grep:** I searched every `.mjs/.js/.cjs` outside tests and node_modules for `['"\`]git['"\`]` and `execFileSync|spawnSync|execSync|spawn(|execFile(`, including multi-line calls. Every git spawn is wrapped or goes through a wrapped default:
  - the named sites;
  - work-record:359/591/792/1209/1238/1597/1603 in the options object, with the injection seams unchanged;
  - prefix-test:181/187/195;
  - render-publish through render-core's `defaultExecGit`;
  - goals-mirror `defaultGit`.
  build.md's grep covered only `*.mjs` single-line calls; mine adds `.js` and finds nothing more. Scope limit: janitor, work-record and render-core diffs touch only the import plus the git-call options.
- **No wrapped call needs GIT_DIR:** there are no git-hook scripts (no hooksPath, .githooks or husky). The only intentional GIT_DIR setters are in-process tests (transport.test, work-record.test), and childEnv's `over` is still applied after the strip.
- **P3:** makeTempHome and childEnv both strip the four names, and no test passes GIT_DIR to a child on purpose. Both new tests go red on base.
- **P4:** checked with `mainCheckout(start, () => out)`:

  | common dir | start | result |
  |---|---|---|
  | `/x/.git` | `/x` | `/x` |
  | `/x/.git/` | `/x` | `/x` |
  | `/srv/repo.git` | | unchanged |
  | `.` | `/srv/repo.git` | `/srv/repo.git` |
  | `C:/x/.git` | `C:/x/wt` | `C:/x` |
  | `//host/share/r/.git` | | `//host/share/r` |
  | `.git` | `//host/share/r` | `//host/share/r` |
  | `/.git` | | `/` |

  INFO: `C:/.git` gives `C:` (drive-relative). Base does the same, so this is not a regression.
- **P5:** a real git run in scratch confirms that `GIT_OBJECT_DIRECTORY`, `GIT_NAMESPACE`, and `core.worktree` injected through `GIT_CONFIG_COUNT/KEY/VALUE` leave both `--show-toplevel` and `--git-common-dir` unchanged. Four names is right.
- **Part 1 bug-fix fields:** Cause, Discriminating check, Fix location and Simplification are accurate.

## P8 bug-fix fields

- **Cause:** correct for a receipt keyed on the main checkout.
- **Fix location / Simplification:** they create F2.
- **Non-repo cwd:** still handled. `mainCheckout` returns `start` when git fails, and a copied helper without skills/multi falls back to cwd; the existing detached-copy test is green.

## Tests (item 4)

- **Revert and rerun on a scratch `git archive` copy:**
  - goal-context.mjs to base: the P8 test fails.
  - work-record.mjs to base: the class (b) test fails.
  - note-inbox.mjs to base: the P6/P7 test fails.
  - c8c16be's line put back: L29 fails.
  - All restored afterwards.
- **Targeted run at 1b6a5d5:** 321/321 pass.
- **Full `run-tests.mjs` on the copy:** 2693 pass. There is 1 failure, "CLI: real process, without --head, calls real git". It is expected, because the copy is not a git repo (fatal: not a git repository); the builder's worktree run was green.
- **1b6a5d5's edits to existing tests:** the M3 assertion is unchanged, and the fixture now sits in a real checked repo, so it is stricter and not weaker. The weakening is the dropped env seal (F4).

## Process (item 5): no identity leak found where I could check

- All seven lane commits have author and committer `Ben Zhuk <benzhuk@gmail.com>`, the same identity as prior main commits such as c8c16be.
- The diff d6f5c9d..1b6a5d5 contains no `user.email/name`, `GIT_AUTHOR/COMMITTER` or `.gitconfig` text.
- The worktree's local config has no `user.*`, and the global identity comes from `~/.gitconfig` only.
- INFO: intermediate commit e75aba0 held a test that wrote a scratch-HOME `.gitconfig` with `Fixture <fixture@example.invalid>`. 1b6a5d5 removed it. It was test-only and never a real config, but it is in branch history.
- I could not complete the mtime check on `~/.gitconfig` or the Windows global identity check: the guard denied the command (below).

## Denied (reported verbatim, not retried in any form)

1. Writing a scratch trial test for F3 through a bash heredoc:
   `PreToolUse:Bash hook error: [/home/ben/.claude/hooks/secret-guard.sh pretooluse]: SECRET-GUARD: blocked — command dumps the process environment. Use ~/.claude/scripts/secret-tool.sh (check|fingerprint|sync|set|grep-safe|scrub) — it never prints values. To read a non-secret part of that file, copy the needed non-secret lines via secret-tool grep-safe.`
   Nothing was written; the file is absent.
2. A combined `stat ~/.gitconfig` / scratch `.gitconfig` find / Windows `git config --global --get user.name` probe:
   `PreToolUse:Bash hook error: [/home/ben/.claude/hooks/git-identity-guard.sh]: GIT-IDENTITY-GUARD: blocked — command writes git config user.email / user.name (reads with --get are fine) ...`
   That step stopped there.

## Leftovers for the lead (I ran no deletes)

- `/tmp/delegation-test-run-308310-1o4WPP/`: `run-tests.mjs` kept its sealed home after the expected non-git failure.
- My scratch under `.../scratchpad/lane-47/`: `copy-jbgm`, `rv-MjJS` (it holds transcript excerpts `hits.jsonl` and `ver.jsonl` from Ben's session, so clean it up), `p5-*`, `p8-*`, `f4-*` and `copy-full.txt`.
- Windows: `C:\Temp\lane47-review\home` (empty scratch home).

## Commands run (summary)

- Local:
  - `git log/diff/show` over d6f5c9d..1b6a5d5; the history of note-inbox and transport; `merge-base --is-ancestor c8c16be` against 0c92605 and 3323d75.
  - Reads of the spec, packet, build.md and the touched sources (multi-inbox.js, multi-hook-core.mjs, note-send.mjs, bearings-state.mjs, delegation-reminder.js).
  - The P2 greps above.
  - `git archive 1b6a5d5 | tar -x` into mktemp; targeted `node --test`; the revert-and-rerun checks; the full `run-tests.mjs`; the P4 `node -e`.
  - Scratch git probes for P5, P8 and F4.
- Windows over `ssh -o BatchMode=yes benzh@ben-desktop...`:
  - `where git/node/bash`, `git --version`, `git -C <gudgeon> rev-parse --git-common-dir --show-toplevel`.
  - `dir` and `dir /T:C` of the four packets; `findstr` over main-checkout `docs/ledger`.
  - `git -C <main> log/status/reflog`.
  - `dir` of `~/.claude/plugins/cache/benzhuk/delegation`; `findstr` of `--no-repo` and `packetLocation` in installed 0.20.12 to 0.20.17.
  - Installed 0.20.15 `note-inbox.mjs` from gudgeon with a scratch `--home`, `--no-bind` and `--cold-start-hours 0`.
  - `findstr` of the session transcript for "which is not on this machine" and for plugin-version paths, parsed locally with jq, printing timestamps, event names, cwd and the hook text only.
