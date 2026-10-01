VERDICT: NEEDS_FIXES 25a523b

# Lane 44 transport identity: review r1

Artifact 25a523b84c101fa258e4520c66b9ec022e915a23, diff against 8b8c2f0. Reviewer runs on git 2.47.3 and node v24.18.1 (Linux). I edited nothing in the worktree. The only file I wrote there is this report.

## Summary

The production change is right. The cause sits in `gitRunner`, not in a caller: every identity caller (mainCheckout, decisions-pickup, note-send, note-inbox, collect-status) uses that one runner by default. The four names cover everything that can move `--git-common-dir` off `cwd`, and no caller depends on an inherited GIT_DIR.

The verdict is NEEDS_FIXES because the new test file has problems. It fails on win32 even with the fix in place (F1, MAJOR). It fails, and re-inits the caller's own repository, when the suite runs with an inherited GIT_DIR (F2). It does not catch a fix that strips GIT_DIR alone (F3). It leaks temp repos (F5). Separately, a mixed-case key on win32 gets past the production delete (F4). F1, F2, F3 and F5 go away with one patch to the test file. F4 is a 4-line change.

## C4 fields

Cause: `gitRunner` (transport.mjs:422 at 25a523b, :412 at base) called `execFileSync('git', …)` with no `env`, so the child inherited the parent's GIT_DIR / GIT_COMMON_DIR. Git then took the repository from them instead of discovering it from `cwd`. I confirmed this is the cause and not a compensation: there is one shared runner, every identity caller uses it by default, and no caller hands it GIT_* on purpose (Q3).
Discriminating check: reproduced independently. transport.test.mjs "gitRunner resolves identity from cwd, not an inherited GIT_DIR" fails against base transport.mjs (actual `/tmp/transport-identity-b-BPTjNt/.git`, expected `/tmp/transport-identity-a-nld9Ds/.git`) and passes at 25a523b. Caveat: it only discriminates for GIT_DIR (F3).
Fix location: `skills/multi/scripts/transport.mjs` `gitRunner` plus the `REPO_LOCATING_GIT_ENV` export. This is the right location, one shared change as P1 requires.
Simplification: none needed in the production code. The four names are the smallest identity-relevant subset of git's own `git rev-parse --local-env-vars` list (Q1). The test patch in F1/F2/F3/F5 replaces three separate fixes with one edit.

## Findings

### F1 MAJOR: the first assertion fails on win32 whether or not the fix is present
Evidence: transport.test.mjs:36 compares a POSIX-slashed value against a native-slashed one:
`resolvedCommon = toPosix(path.resolve(repoA, common))` against `path.join(repoA, '.git')`. On win32, `path.join` gives back backslashes. Simulated with `path.win32`: `"C:/Users/ben/AppData/Local/Temp/transport-identity-a-x/.git"` against `"C:\\Users\\ben\\AppData\\Local\\Temp\\transport-identity-a-x\\.git"`, so they are never equal. The suite is cross-platform (hooks, inbox, note-send, note-flush and six scripts/*.test.mjs have win32 branches), and `scripts/run-tests.mjs` picks this file up. So the gate on a Windows host goes red on every run, and a red result there tells you nothing.
Fix (exact patch):
```
-    assert.equal(resolvedCommon, path.join(repoA, '.git'));
+    assert.equal(resolvedCommon, `${repoA}/.git`);
```
Predicted outcome: on Linux the comparison is byte-identical to today (`/tmp/x/.git`). On win32 both sides become `C:/…/.git`. The red run at base still fails, because it gets repo B.

### F2 MINOR: the test fails under an inherited GIT_DIR, and re-inits the inherited repository
Evidence: transport.test.mjs:22 `mkRepo` runs `execFileSync('git', ['init', '--quiet'], { cwd: dir, … })` with the inherited environment. This is the same bug class as the lane, sitting in the test for the lane. Measured at 25a523b: `GIT_DIR=<scratch>/B/.git node --test skills/multi/scripts/transport.test.mjs` gives `pass 0 / fail 2` (`Error: Command failed: git rev-parse --git-common-dir`). Plain `GIT_DIR=<B>/.git git init` in an empty dir prints `Reinitialized existing Git repository in …/B/.git/` and leaves the new dir empty. So a gate run from inside a git operation writes into the caller's own repository.
Fix: build the child env with the four names removed. See the combined patch below. Keep the list local rather than importing `REPO_LOCATING_GIT_ENV`: an import of a name that does not exist at base is a SyntaxError, and the red run would then fail at load time instead of on the assertion.

### F3 MINOR: the test does not catch a fix that strips GIT_DIR alone, although GIT_COMMON_DIR alone also changes identity
Evidence (measured, mutant on a scratch copy): I reduced `REPO_LOCATING_GIT_ENV` to `['GIT_DIR']` and the test file still passes (`pass 2 / fail 0`). With that same mutant and `GIT_COMMON_DIR=<B>/.git`, `mainCheckout(<A>, gitRunner)` returns `<scratch>/probe-JEcT/B`. Plain git confirms that GIT_COMMON_DIR on its own moves identity: in repo A, `GIT_COMMON_DIR=<B>/.git git rev-parse --git-common-dir` gives `<B>/.git`.
Fix: add the GIT_COMMON_DIR test in the combined patch. Predicted: base red, GIT_DIR-only mutant red (returns B), 25a523b green.

### F4 MINOR: on win32 a key that is not upper-case gets past the delete
Evidence: transport.mjs:425-426, `{ ...process.env }` followed by `delete env[name]` for the four upper-case names. On win32 the spread copies keys in the case they are stored in, which is whatever case the process that set them used. So `Git_Dir` survives `delete env.GIT_DIR`. Node's child env builder (read from node 24's own `child_process` source through `--expose-internals`) only removes case-insensitive duplicates ("On Windows env keys are case insensitive. Filter out duplicates, keeping only the first one"), so it passes `Git_Dir` through untouched. Windows environment lookup (GetEnvironmentVariableW / CRT getenv, which Git for Windows uses) ignores case, so git would honour it. I did not measure this on a Windows host. Git itself exports hook variables in upper case, so this only happens when a person or a script set the odd-cased variable. Low likelihood, but the fix is cheap.
Fix (exact patch, transport.mjs:425-426):
```
-  const env = { ...process.env };
-  for (const name of REPO_LOCATING_GIT_ENV) delete env[name];
+  const env = { ...process.env };
+  // win32 env names are case-insensitive to the OS and to git, but a spread copy keeps each key's
+  // stored case, so `Git_Dir` would survive `delete env.GIT_DIR`; match case-insensitively there.
+  const locating = process.platform === 'win32'
+    ? (key) => REPO_LOCATING_GIT_ENV.includes(key.toUpperCase())
+    : (key) => REPO_LOCATING_GIT_ENV.includes(key);
+  for (const key of Object.keys(env)) if (locating(key)) delete env[key];
```
Predicted: no change on POSIX, where the match is exact and a `Git_Dir` really is a different variable that git ignores. On win32 every casing is removed. The parent's `process.env` is still never touched.

### F5 MINOR: the test leaks two temp git repos per test on every run (brief item 5)
Evidence: transport.test.mjs:21 uses `fs.mkdtempSync(path.join(os.tmpdir(), prefix))` and never removes anything. `/tmp/transport-identity-*` now holds 48 dirs: the builder's 24 plus 24 from my 6 runs. What the neighbours do: in skills/multi/scripts, 8 of the 10 test files that mkdtemp do not clean up (hooks, mirror-shim, note-flush, note-inbox, note-send, pane-binding, session-name, and now transport). Only inbox.test.mjs:612 cleans up, in a `finally`. The convention the repo actually wrote down is in scripts/collect-status.test.mjs:8-9 and :1380-1395 (and collect-from-origin.test.mjs): mkTmp under `process.env.FIXTURE_ROOT || os.tmpdir()`, track each dir, and one `after()` that returns early when FIXTURE_ROOT is set (makeTempHome's cleanup owns that tree) and otherwise runs `fs.rmSync` best-effort.
Fix: use the combined patch below, which follows that convention.

### F6 NIT: the "10 direct sites" count is wrong
Evidence: spec.md:11 and build.md:7 say 10. There are 9 literal `execFileSync('git', …)` sites outside gitRunner (listed under Q6). The 10th is probably gitRunner itself. Beyond those 9, there are 7 more injected-default git spawns in scripts/work-record.mjs and 3 in scripts/prefix-test.mjs (also in Q6).
Fix: record "9 direct sites plus 10 injected/spawnSync sites (Q6 of review-r1)" in the lane record. No code change.

### Combined test-file patch (fixes F1, F2, F3, F5)
Mental simulation: base red (GIT_DIR test gets B, GIT_COMMON_DIR test gets B). GIT_DIR-only mutant red (GIT_COMMON_DIR test). 25a523b green. 25a523b with an inherited GIT_DIR green (mkRepo uses a clean env, and gitRunner strips). Nothing leaks when the file is run directly. I tried to run this patch on a scratch copy, but a guard hook denied the command (quoted verbatim under "Denied steps"). So these predictions are not measured, and I did not retry.

transport.test.mjs, replace
```
import test from 'node:test';
```
with
```
import test, { after } from 'node:test';
```
Replace
```
function mkRepo(prefix) {
  const dir = toPosix(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  execFileSync('git', ['init', '--quiet'], { cwd: dir, encoding: 'utf8' });
  return dir;
}
```
with
```
// The four names gitRunner strips, repeated rather than imported so this file still loads on base
// 8b8c2f0 for the red run. mkRepo runs `git init` without them: an inherited GIT_DIR would otherwise
// turn it into a re-init of the caller's own repository.
const LOCATING = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE'];
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (LOCATING.includes(key.toUpperCase())) delete env[key];
  return env;
}
const tracked = [];

function mkRepo(prefix) {
  const dir = toPosix(fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix)));
  tracked.push(dir);
  execFileSync('git', ['init', '--quiet'], { cwd: dir, encoding: 'utf8', env: cleanEnv() });
  return dir;
}

after(() => {
  // Same convention as scripts/collect-status.test.mjs: under scripts/run-tests.mjs every dir lives
  // under FIXTURE_ROOT and makeTempHome's cleanup() removes it; run directly, nothing else does.
  if (process.env.FIXTURE_ROOT) return;
  for (const dir of tracked) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort cleanup only */ }
  }
});
```
Replace
```
    assert.equal(resolvedCommon, path.join(repoA, '.git'));
```
with
```
    assert.equal(resolvedCommon, `${repoA}/.git`);
```
Append
```
test('gitRunner resolves identity from cwd, not an inherited GIT_COMMON_DIR', () => {
  const repoA = mkRepo('transport-identity-e-');
  const repoB = mkRepo('transport-identity-f-');
  const had = Object.prototype.hasOwnProperty.call(process.env, 'GIT_COMMON_DIR');
  const prev = process.env.GIT_COMMON_DIR;
  try {
    process.env.GIT_COMMON_DIR = `${repoB}/.git`;
    assert.equal(mainCheckout(repoA, gitRunner), repoA);
  } finally {
    if (had) process.env.GIT_COMMON_DIR = prev;
    else delete process.env.GIT_COMMON_DIR;
  }
});
```

## Brief item 1: are the four names the right set?

Anchor: `git rev-parse --local-env-vars` is the list git itself clears when it crosses into another repository, for example a submodule. On 2.47.3 it prints GIT_ALTERNATE_OBJECT_DIRECTORIES, GIT_CONFIG, GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT, GIT_OBJECT_DIRECTORY, GIT_DIR, GIT_WORK_TREE, GIT_IMPLICIT_WORK_TREE, GIT_GRAFT_FILE, GIT_INDEX_FILE, GIT_NO_REPLACE_OBJECTS, GIT_REPLACE_REF_BASE, GIT_PREFIX, GIT_SHALLOW_FILE, GIT_COMMON_DIR. The lane's four are a subset of that list. Live probes below, cwd = repo A, target B (scratch `probe-JEcT`):

| Variable | Live result | Ruling |
|---|---|---|
| GIT_DIR=B/.git | `--git-common-dir` gives `…/B/.git` | In scope: identity. Stripped. |
| GIT_COMMON_DIR=B/.git (alone) | gives `…/B/.git` | In scope: identity. Stripped. The test does not cover it (F3). |
| GIT_WORK_TREE=B (alone) | common dir `.git`, but `--show-toplevel` gives `…/B` | In scope: it relocates every worktree-relative command. Stripped. |
| GIT_INDEX_FILE (alone) | `.git` (no change) | No identity effect. Stripping it is harmless and correct, since it is in git's own list. |
| GIT_OBJECT_DIRECTORY=B/objects | common dir unchanged. `rev-parse HEAD^{tree}` in M: `fatal: ambiguous argument 'HEAD^{tree}': unknown revision` | Harmless for identity. Objects are content-addressed, so a foreign store either fails (collect-status loadOwnerHosts catches that and falls back) or returns identical bytes. Follow-up only. |
| GIT_ALTERNATE_OBJECT_DIRECTORIES | additive only | Harmless. |
| GIT_NAMESPACE=x | `rev-parse HEAD` unchanged (`d6be71b`) | Harmless: it only scopes refs for upload-pack/receive-pack, and git does not list it as repo-local. |
| GIT_CEILING_DIRECTORIES=A (cwd A/sub) | `fatal: not a git repository` | Harmless for identity. It can only make discovery fail (mainCheckout then returns the passed path), never redirect it to another repo. It is a deliberate user boundary, so do not strip it. |
| GIT_DISCOVERY_ACROSS_FILESYSTEM=0 | `../.git` (unchanged on one fs) | Same as the ceiling: can only fail, never redirect. Do not strip. |
| GIT_CONFIG_PARAMETERS `'core.worktree'='B'` | common dir `.git`, toplevel stays A | Harmless for identity. No config key relocates the git dir during discovery. |
| GIT_CONFIG_COUNT/KEY/VALUE core.worktree=B | `.git`, toplevel A | Harmless for identity (same measurement). |
| GIT_CONFIG_COUNT core.bare=true | `.git` | Harmless for identity. |
| GIT_CONFIG (legacy) | only read by `git config` | Harmless. |

Ruling: the four names are correct and complete for "identity comes from the passed path". gitRunner's callers only run `rev-parse --git-common-dir` (transport.mjs mainCheckout, decisions-pickup.mjs:656) and `show origin/main:.agents/project.json` (collect-status.mjs:360), and nothing else in the table moves either of those to another repo. Widening to the whole `--local-env-vars` list is an optional follow-up. It would be warranted if gitRunner ever runs a config-sensitive or history-sensitive command. Stripping GIT_CONFIG_PARAMETERS would also throw away the user's `-c` intent, which is one reason not to do it now.

## Brief item 2: discriminating check, re-run

Scratch copy `…/lane-44/rev-vyWN` (`git archive 25a523b`, then transport.mjs replaced with `git show 8b8c2f0:…`). Diff checked: it differs from 25a523b only by the export and the env lines.
- Base transport.mjs: `✖ gitRunner resolves identity from cwd, not an inherited GIT_DIR`, `pass 1 / fail 1`, actual `/tmp/transport-identity-b-BPTjNt/.git`, expected `/tmp/transport-identity-a-nld9Ds/.git`.
- 25a523b (worktree): both tests pass, `pass 2 / fail 0`.
- The second test ("never mutates … GIT_DIR") also passes on base. It does not discriminate, which is acceptable because its job is to catch a `delete process.env.GIT_DIR` implementation.
- Mutant (strip GIT_DIR only): `pass 2 / fail 0`, a false green (F3).
- The scratch copy was restored to base afterwards (`pass 1 / fail 1` again).

Suites at 25a523b: `node --test skills/multi/scripts/*.test.mjs` gives tests 580, pass 580, fail 0. Extra check on the gitRunner callers: `node --test skills/decisions/scripts/decisions-pickup.test.mjs scripts/collect-status.test.mjs` gives 107 pass, 0 fail.

## Brief item 3: does any caller rely on an inherited GIT_DIR on purpose?

Verified absent. Every caller: transport.mjs `mainCheckout`; decisions-pickup.mjs :638/:652/:677/:778/:818/:951/:966/:1274/:1288/:1290/:1310/:1318/:1382; note-send.mjs :394 (mainCheckout at :470/:641/:644/:649/:662/:664/:680/:689); note-inbox.mjs :128 (:217/:221); collect-status.mjs :307/:360/:546/:656. Each one passes an explicit path, whether cwd, `--repo`, a pane worktreePath or a registration entry. None sets or reads GIT_*.
- `git grep` for `GIT_DIR=` / `--git-dir` in code, docs, units and scripts finds only the lane-34 review evidence. No plugin git hook exists (no hooksPath/.git/hooks writes). The user's global hooks dir `~/.config/git/hooks` holds only `pre-commit`, and it does not call note-send, note-inbox, decisions-pickup, collect-status or transport.
- Tests: none puts GIT_* into the real runner except the new file. collect-status.test.mjs:844/:1307 use the real gitRunner under test-home's env. GIT_CONFIG_GLOBAL and GIT_CONFIG_NOSYSTEM are kept, because they are not among the four.
- Hook case, emulated with the variables git exports to hooks per githooks(5). A real hook run was denied; see "Denied steps".
  - Main-checkout hook (cwd M, `GIT_DIR=.git`, `GIT_INDEX_FILE=.git/index`): base M, fixed M.
  - Linked-worktree hook (cwd MW2, `GIT_DIR=<M>/.git/worktrees/MW2`): base M, fixed M. That is correct: the main checkout of a linked worktree.
  - Bare-repo hook (cwd X.git, `GIT_DIR=.`): base `…/X`, fixed `…/X`. Both give the same wrong answer. This comes from mainCheckout itself, not the lane (FU5).
  - **Linked-worktree hook calling note-send for recipient A** (`mainCheckout(A)`): base `…/M` (misrouted), fixed `…/A`. This is the real-world version of the bug, and the fix closes it.
  - Main-checkout hook with relative `GIT_DIR=.git`, target A: base A, fixed A. In base, a relative GIT_DIR resolves against the child cwd, which hid the bug for ordinary `.git` repos. That explains why it went unseen: the absolute GIT_DIR of a linked worktree is the case that misroutes.
- Behaviour that changes on purpose: a process started from a cwd outside any repo, with GIT_DIR pointing at the intended repo (a `git --git-dir=X` `!` alias, or `GIT_DIR=X node note-send.mjs`), now falls back to the cwd, because mainCheckout returns the passed path when there is no repo. Nothing in the repo or on this box invokes it that way. This matches P1's intent.

## Brief item 4: Windows

See F4. Node's win32 child env builder only removes case-insensitive duplicates, so a spread copy that keeps `Git_Dir` passes it to git. It should be fixed with the case-insensitive filter, applied on win32 only.

## Brief item 5: test hygiene

See F5 for what the neighbours do and the patch that follows the repo's written after()/FIXTURE_ROOT convention.

## Brief item 6: direct `execFileSync('git', …)` sites outside gitRunner (9, not 10)

Each inherits the env, and `-C` does not override GIT_DIR. "Identity" means the site decides which repository's refs, history or worktrees it acts on or reports.

| # | Site | What it does | Ruling |
|---|---|---|---|
| 1 | scripts/janitor.mjs:165 `git()` | `gitToplevel` `rev-parse --show-toplevel` (:170), worktree list (:285), status (:331), merge-base, and destructive `worktree remove` (:1088) / `branch -D` (:1170) | **Resolves identity and acts destructively.** It runs from a timer unit, which is exactly the packet's "stale environment" trigger. Follow-up priority 1. |
| 2 | scripts/janitor.mjs:195 `fetch origin --prune` | fetch in root | Identity (which repo gets fetched). Same follow-up. It already builds `env: { ...process.env, … }`, so stripping there costs one line. |
| 3 | scripts/collect-from-origin.mjs:27 `git` | for-each-ref, show, diff, fetch on `--repo` | Resolves identity: the collector reads another project's records. Follow-up priority 2. |
| 4 | scripts/collect-status.mjs:285 `readOwnerField` | `show tip:record` for the ASK owner | Resolves identity (wrong owner, so the ASK goes to the wrong person). Same follow-up as #3. |
| 5 | scripts/collect-status.mjs:581 | `rev-parse <main>` for the status header / change key | Identity-adjacent, low impact. Same follow-up. |
| 6 | skills/decisions/scripts/decisions-handback.mjs:583 | `computeHeadSha` and `readLastRender` on `--repo` | Resolves identity (staleness verdict against another repo). Follow-up. |
| 7 | skills/decisions/scripts/decisions-render-core.mjs:236 | `ls-tree origin/main` validation | Fails closed (a false "missing" error). Harmless for identity, low priority. |
| 8 | skills/decisions/scripts/goals-mirror.mjs:244 | `log -1 origin/main -- sources`, the SHA stamped on the mirror page | Identity-adjacent: another repo's SHA would get published. Low priority. |
| 9 | scripts/four-read.mjs:519 `runGit` (`-C repoDir`) | diff range for a metric | Harmless (the metric reads "unavailable" when the SHAs are foreign). |

Not literal `execFileSync('git'` but the same exposure: scripts/work-record.mjs :358 (execImpl `-C gitDir log`), :589 (spawnImpl `-C repoRoot log`), :790 (`rev-parse --verify`), :1206/:1234 (the acceptance gate: artifact verify and is-ancestor in the worktree), :1592/:1598 (the close gate: merge verify and is-ancestor). All default to execFileSync/spawnSync, so they **resolve identity for the acceptance and close gates**: follow-up priority 2. scripts/prefix-test.mjs:180/:186/:194 run `worktree remove --force` / `prune` / `add` through `spawnSync` with `cwd: repoAbs`. With an absolute GIT_DIR inherited, they act on that repository's worktrees. They are destructive, so they belong with priority 1.

## Follow-ups (not findings against this lane; P1 scopes them out)

- FU1 (priority 1): janitor.mjs `git()` and `fetchOrigin`, and prefix-test.mjs `run`. Strip `REPO_LOCATING_GIT_ENV`, importing it from transport.mjs.
- FU2: collect-from-origin.mjs:27, collect-status.mjs:285/:581, and the work-record.mjs acceptance/close gates.
- FU3: decisions-handback / decisions-render-core / goals-mirror defaults.
- FU4: scripts/test-home.mjs builds the sealed test env but does not delete GIT_* (it already deletes CODEX_HOME and others by the same pattern). A suite run from a git hook therefore sends GIT_DIR into every git-using test, which is F2's failure across the whole suite.
- FU5 (twin of lane 34): `mainCheckout` removes a trailing `.git` from a bare repo's own path. `X.git` becomes the non-existent sibling `X`, measured the same at base and at the fix. decisions-pickup `projectIdentity` guards against this, but note-send, note-inbox and collect-status call `mainCheckout` directly, so a note from a bare repo's hook (or with cwd in a bare repo) would go to `X/docs/ledger`. This predates the lane and is not a regression.
- FU6 (optional): widen to git's `--local-env-vars` list if gitRunner ever runs a config- or history-sensitive command (Q1).

## Denied steps (verbatim, not routed around)

1. A real git hook run with `git -c core.hooksPath=<scratch>/M/.git/hooks commit …` (the global `core.hooksPath` otherwise hides repo-local hooks):
   `PreToolUse:Bash hook error: [/home/ben/.claude/hooks/git-identity-guard.sh]: GIT-IDENTITY-GUARD: blocked — command overrides core.hooksPath (disables the identity hook)`
   I stopped that step. Q3's hook evidence therefore comes from emulating the hook environment (the variables and cwd githooks(5) documents), not from a hook that git itself ran.
2. A trial run of the combined test patch on the scratch copy `rev-vyWN`:
   `PreToolUse:Bash hook error: [/home/ben/.claude/hooks/secret-guard.sh pretooluse]: SECRET-GUARD: blocked — command dumps the process environment. Use ~/.claude/scripts/secret-tool.sh (check|fingerprint|sync|set|grep-safe|scrub) — it never prints values. To read a non-secret part of that file, copy the needed non-secret lines via secret-tool grep-safe.`
   The command did not run; the scratch copy is unchanged and still has the base transport.mjs. The patch's outcomes are predicted, not measured. The patch uses a spread-and-delete form, so applying it with Edit and running the tests will not trip that guard.

## Side effects of this review

- I committed and modified nothing in the worktree. `git status --short` was clean before this report was written.
- Scratch only: `…/lane-44/probe-JEcT` (repos A, B, M with one empty commit made under the already-configured identity, linked worktrees MW, MW2 and MW3, bare repo X.git, and N) and `…/lane-44/rev-vyWN`. The inherited-GIT_DIR run re-inited scratch repo B, as expected.
- 24 more `/tmp/transport-identity-{a,b,c,d}-*` dirs came from my 6 test runs; the total is now 48. Per the brief, I removed none of them.
