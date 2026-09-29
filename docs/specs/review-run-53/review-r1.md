VERDICT: NEEDS_FIXES (14) 4c2b9741186054c5d25702d6bbc4d8d2a36417ca

# Lane 53 code review r1: review-run (4c2b974 against base 7ab59db)

Scope: `git diff 7ab59db 4c2b974`. The code at worktree HEAD ad0f18a is byte-identical to 4c2b974; the later commits only add docs. Spec order: lead-ruling-redteam.md, then redteam.md, then the record.

What I ran:
- `claude --help` and `claude --version` (2.1.284).
- A read-only `strings` pass over the installed claude binary.
- A scratch clone of the artifact at `scratchpad/lane-53/rev-MfVP/repo`, where I did all the mutations and runs.

I made no real `claude -p` call. The reviewed worktree is untouched: `git status` is clean and `git stash list` is empty. My scratch clone holds one leftover, `relscratch/`, which is the evidence for finding 4. I deleted nothing.

Totals: 1 BLOCKER, 5 MAJOR, 8 MINOR.

---

## 1. BLOCKER: the pinned argv pre-approves every Bash call and every Write, and the deny list is already shown to be bypassed. dontAsk does not close P7.

**Evidence**
- `skills/team-build/scripts/review-run.mjs:208-211`: the argv passes `--permission-mode dontAsk --permission-prompts none --tools <T> --allowedTools <T>`, where T is `Read,Grep,Glob,Write,Bash[,PowerShell]`. Every tool in the role gets a tool-wide allow rule.
- The CLI's own description of the mode (from the binary's string table) is: "'dontAsk' - Don't prompt for permissions, deny if not pre-approved". `--help` says of `--permission-prompts none`: "the permission mode still decides everything else".
  - A tool-wide `Write` rule pre-approves a Write to any path.
  - A tool-wide `Bash` rule pre-approves any command the deny list does not match.
  - dontAsk only changes what happens to calls that would otherwise prompt, and those calls no longer exist.
  - The escalation in ce0676c therefore does not plausibly close P7(iii). Its comment at :203-207 claims it does, but nothing measured that. It rests on hope.
- dontAsk also removes the auto classifier. That classifier was the only backstop for Bash commands outside the prefix deny list.
- User allow rules still load under `--setting-sources user`: redteam M1 names `Bash(git *)` and `Edit(**)`. Under dontAsk, they pre-approve too.
- **Live evidence of the bypass is already in the builder's own report.** The P2b row of build.md ran `git -C <decoy repo> worktree remove --force <decoy worktree>`.
  - That run's sidecar, `probes/reports/p2b.md.identity.json`, shows startedAt 2026-09-28 22:49:50 NY and `permissionDenials: 0`.
  - The run came after 875822b (22:42 NY), whose DISALLOWED_TOOLS already held `Bash(git worktree:*)` (the 875822b version of the file, line 52).
  - The command executed. A `Bash(<verb>:*)` prefix rule does not match `git -C <path> <verb>`.
  - So these all get through: `git -C <original repo> push origin HEAD:main`, `git --git-dir=<orig>/.git config core.hooksPath /tmp/x`, `rm -R`, `rm --recursive`, `env git push`, `/usr/bin/git push`. The last four are predicted from the same prefix mechanics; only the `git -C` case is measured.
- The shared clone does not help here. The original repo's path is known to the child: it is in `wt/.git/objects/info/alternates`, and the report path is usually inside that repo. Isolation is only as strong as the permission layer, and today that layer is tool-wide Bash plus prefix denies.
- Today's Agent-tool reviewer runs under the lead's `auto` classifier. This is the "must not worsen: work lost" regression that M1 exists to prevent.

**Fix.** Part (c) is a judgment call; (a) and (b) are mechanical.

**(a) Never grant a tool-wide Write.** Keep `Write` in `--tools`, but pre-approve only the report path. Pin the rule syntax by probe: the documented absolute-path form is `//abs/path`, and `Edit(...)` rules also cover Write. Also reject a `--report` containing `,` or `)`.

Current (`review-run.mjs:196-197`):
```js
export function buildArgv({ model, effort, tools, sessionId, agentsPath, permissionMode }) {
  const toolList = tools.join(',');
```
Replacement:
```js
export function buildArgv({ model, effort, tools, sessionId, agentsPath, permissionMode, reportPath }) {
  const toolList = tools.join(',');
  // P7: never a tool-wide Write pre-approval — the report path is the only Write the child is granted.
  const allowList = tools.filter((t) => t !== 'Write')
    .concat(reportPath ? [`Write(/${reportPath.replace(/\\/g, '/')})`] : [])
    .join(',');
```
Also make these two replacements:
- At :210, replace `'--allowedTools', toolList,` with `'--allowedTools', allowList,`.
- At :449-451, the call site passes `reportPath: options.report`.

On win32 the `/C:/...` shape is wrong. Pin the Windows form on ben-desktop.

**(b) Deny git's global-option forms.** The reviewer's cwd is the clone, so it never needs any of them. Append these to `DISALLOWED_TOOLS` (:49-55):
```js
  'Bash(git -C:*)', 'Bash(git -c:*)', 'Bash(git --git-dir:*)', 'Bash(git --work-tree:*)', 'Bash(git --exec-path:*)',
```
This is still whack-a-mole: `env git …` and absolute-path git remain open.

**(c) Decide the mode by probe, with (a) and (b) in place.** The ruling says "auto first". The P7 reason for leaving auto was the Write escape, and that escape comes from the tool-wide `Write` pre-approval, so (a) removes it. Re-run P7 and P5 under `auto` with (a) and (b).
- Keep dontAsk only if auto fails P5. In that case, replace the tool-wide `Bash` in `--allowedTools` with an explicit read-only allowlist, and record in the build report what the reviewer lost.
- Add a unit test on the spawn-boundary argv: `--allowedTools` has no bare `Write` or `Bash` token, and `--disallowedTools` contains `Bash(git -C:*)`.
- Predicted result: P7(iii) is denied under either mode, and `git -C <decoy> push --dry-run` is denied.

## 2. MAJOR: the user's CLAUDE.md and ~/.claude/rules load into the child, which violates P1(ii) (M3)

**Evidence**
- The agents JSON sets `omitClaudeMd` (review-run.mjs:186). The CLI's own schema text says it runs the agent "without the user, project and local CLAUDE.md instruction files **when it runs as a subagent**". Under `--agent` the child is the main thread, so the flag does not apply.
- The memory loader in the binary pushes the "User" CLAUDE.md and the user rules dir whenever the `userSettings` source is on. `--setting-sources user` turns it on.
- The same code shows the one switch that stops it: `if(a.CLAUDE_CODE_DISABLE_CLAUDE_MDS)return[]`.
- The child's bare "yes" in P1 is exactly what this predicts.
- The reviewer role's own safety block says "Your user's and the project's instruction files are NOT loaded for you". That premise is false for this child.
- This is expected CLI behaviour, but it breaks the adopted spec: M3 P1(ii) "must answer none", and role parity with the Agent-tool reviewer.

**Fix** (`review-run.mjs:230-231`). Current:
```js
  out.KNOWLEDGE_DIR = path.join(runDir, 'knowledge');
  return out;
```
Replacement:
```js
  out.KNOWLEDGE_DIR = path.join(runDir, 'knowledge');
  // M3/P1(ii): omitClaudeMd applies only to subagents; under --agent the child is the main thread.
  out.CLAUDE_CODE_DISABLE_CLAUDE_MDS = '1';
  return out;
```
- Add `assert.equal(env.CLAUDE_CODE_DISABLE_CLAUDE_MDS, '1')` to the buildChildEnv test.
- Caveat: this also drops managed-policy CLAUDE.md, which omitClaudeMd would have kept. State that in build.md.
- Predicted: P1(ii) answers "none", and hooks still load (re-check P2a).

## 3. MAJOR: on Windows the child's PowerShell tool gets past every deny rule

**Evidence**
- agents/reviewer.md:6 declares `tools: Read, Grep, Glob, Write, Bash, PowerShell`. `buildArgv` passes the frontmatter list into both `--tools` and `--allowedTools` (review-run.mjs:209-210), so on win32 PowerShell is enabled and pre-approved tool-wide.
- Every entry in `DISALLOWED_TOOLS` (:49-55) is `Bash(...)`. `git push`, `git worktree remove --force` and `Remove-Item -Recurse` all go through PowerShell unmatched.
- M1 required "On Windows, add `PowerShell(Remove-Item*)`". It is absent.
- On Linux the P1 init event showed no PowerShell tool, so every probe so far is blind to this.

**Fix** (`review-run.mjs`, after :55). Add:
```js
/** M1: PowerShell twins — the role grants PowerShell on win32, and a Bash(...) rule never matches it. */
const POWERSHELL_DISALLOWED = [
  ...DISALLOWED_TOOLS.filter((r) => r.startsWith('Bash(')).map((r) => `PowerShell(${r.slice('Bash('.length)}`),
  'PowerShell(Remove-Item:*)', 'PowerShell(ri:*)', 'PowerShell(del:*)', 'PowerShell(rd:*)', 'PowerShell(rmdir:*)',
];
```
- At :211, replace `'--disallowedTools', DISALLOWED_TOOLS.join(','),` with `'--disallowedTools', [...DISALLOWED_TOOLS, ...POWERSHELL_DISALLOWED].join(','),`.
- Pin the PowerShell rule syntax on ben-desktop.
- The simpler alternative: drop `PowerShell` from both lists, since the Bash tool is Git Bash on Windows. Record which one you chose.

## 4. MAJOR: a relative `--scratch` leaks a clone into the reviewed repo and always exits 7 (measured)

**Evidence**
- `parseArgs` stores `--scratch` verbatim (review-run.mjs:111).
- `runDir` and `mkdirSync` resolve against `process.cwd()` (:431-433).
- `git clone … wtDir` runs with `cwd: repoTop` (:441), so git resolves the relative target against repoTop.
- `git -C wtDir` with `cwd: wtDir` (:442) resolves twice.

Measured run from the scratch clone: `cd rev-MfVP/work && node …/review-run.mjs --repo rev-MfVP/repo --scratch relscratch …`.
- Result: `review-run internal error: Error: spawnSync git ENOENT`, exit 7.
- owner.json landed in `work/relscratch/review-run-4c2b974-e367a5df/`.
- The clone landed in `repo/relscratch/review-run-4c2b974-e367a5df/wt/.git`, and `git -C repo status` shows `?? relscratch/`.
- The catch path's `rmSync` aimed at `work/relscratch/.../wt`, which does not exist. Nothing was deleted, but an untracked clone is left in the repo under review.
- When cwd equals repoTop, the paths agree, the run still fails at `remote remove` (exit 7), and the cleanup hits its own dir.
- No path deletes outside the run's own `wt/`.

**Fix** (`review-run.mjs:111`). Current:
```js
      case '--scratch': out.scratch = value; break;
```
Replacement:
```js
      case '--scratch': out.scratch = path.resolve(value); break;
```
- Predicted: the same command creates `work/relscratch/review-run-*/wt`, clones there, and proceeds normally.
- Add a test with a relative `--scratch` and a cwd other than the repo: assert that `git -C <repo> status --porcelain` is unchanged.

## 5. MAJOR: the tests pass because they aren't looking (past bug class). The fake claude never checks argv, and the delete path (the sweep) has no test.

I ran 15 mutations in the scratch clone with `node --test`; the runner is `rev-MfVP/mutate.mjs`.

| mutation | result |
|---|---|
| drop `--strict-mcp-config` | killed (buildArgv test) |
| drop `NOTE_SLUG` from the denylist | killed (2 tests) |
| drop `GIT_INDEX_FILE` from the denylist | **survived** |
| call site passes `permissionMode: 'bypassPermissions'` | **survived** |
| drop `--agents`/`--agent` (the child runs as a default session, not the reviewer) | **survived** |
| drop `--allowedTools` | **survived** |
| sweep ignores owner liveness | **survived** |
| sweep ignores age | **survived** |
| remove the "plugin root inside the reviewed repo" exit 4 | **survived** |
| installed-entry resolution disabled | **survived** |
| no cleanup on the catch path | **survived** |
| no `KNOWLEDGE_DIR` | **survived** |
| SIGTERM handler kills only the direct child with SIGTERM, not the group | **survived** |
| delete-guard.mjs line removed | killed (2 tests) |
| multi-inbox.js line removed | killed (1 test) |

What the tests are missing:
- The fake (review-run.test.mjs:60-100) never reads `process.argv`.
- The only spawn-boundary argv assertions are that `-n` and `--name` are absent (:276-277).
- `sweepStaleRuns` is not even imported (:13-18), although it is the only code that removes a directory this run did not create.
- The "never scans the plugin cache" test (:420-429) passes vacuously: no cache dir exists in its fixture home, and it only asserts `roleSource !== 'installed'`.
- The SIGTERM test (:449-485) never checks that the fake's process is gone, although S4/M5 require it.

**Fix.** Add these tests; each should go red under the mutation listed next to it.
- **Spawn-boundary argv.** In the existing env test, `assert.deepEqual(capturedArgv, buildArgv({...expected}))`, and assert the pairs `['--agent','review-run-reviewer']`, `['--permission-mode', <pinned>]` and `['--setting-sources','user']`. Also assert that `agents.json` equals `buildAgentsJson(parseRoleFile(roleBytes))`. Kills the call-site, agent-flag and allowedTools mutants.
- **Sweep.** Unit-test `sweepStaleRuns` with an injected `isAliveFn`:
  - a dead-and-old run's `wt/` is removed;
  - a live run's `wt/` survives;
  - a young run's `wt/` survives;
  - a non-matching dir survives;
  - a symlinked `review-run-*` entry pointing at a canary dir with a planted owner.json survives (see finding 7).
- **Inside-repo exit 4.** No `--plugin-root`, a HOME with no installed_plugins.json, and the script's own repo as `--repo`: expect exit 4 and no clone. Also a symlinked `--repo` (see finding 8).
- **Installed-entry resolution.** An installed_plugins.json whose user entry points at a fixture root gives `roleSource: 'installed'`.
- **Catch-path cleanup.** A `gitRunner` that throws on `checkout` after a real clone must leave no `wt/`.
- **Env.** Assert `KNOWLEDGE_DIR` is under the run dir, and extend the denylist test to every `REPO_LOCATING_GIT_ENV` name.
- **SIGTERM.** Have the fake write its pid (`FAKE_PID_FILE`), and assert that the pid is dead after exit.
- **Symlinks at cleanup.** A tree checked out with a symlink to a canary dir: after cleanup the canary file still exists. This is the regression guard for "cleanup never follows a link out of wt/".

## 6. MAJOR: an orphaned child survives a SIGKILL of review-run, and a later run's sweep deletes its live dir

**Evidence**
- The child is spawned with `detached: true` on POSIX (review-run.mjs:547), which puts it in its own process group.
- A SIGKILL of review-run cannot be caught, and a Codex tool timeout that kills the shell's process group misses the detached child. The child keeps running as an Opus session with no watchdog: the timer died with its parent.
- owner.json records only review-run's own pid (:434-436).
- The next run's sweep (:273-289) sees that pid dead and removes `wt/` once the *sweeping* run's `--timeout-min` has passed since the dead run's start. The orphan loses its cwd mid-review.
- This is the M5 scenario ("a detached child keeps running as an orphan Opus session"). Signals that can be caught are handled correctly; this one is not.
- SKILL.md tells Codex leads to avoid tool-timeout kills, but that is advice, not a guard.

**Fix**
- After spawn, rewrite owner.json as `{pid, startedAt, childPid: child.pid, timeoutMin}`.
- In the sweep, if `childPid` is alive and age is past the owner's own `timeoutMin`, `process.kill(-childPid, 'SIGKILL')` first. If it is alive and younger, skip.
- Use `owner.timeoutMin ?? timeoutMin` as the cutoff.
- Predicted: an orphan is reaped at the latest one sweep after its own deadline, and a live orphan's `wt/` is never removed underneath it.

## 7. MINOR: the sweep follows a symlinked run dir, and EPERM counts as dead

**Evidence**
- In `sweepStaleRuns`, `path.join(runDir, 'wt')` (:279, :287) traverses a `review-run-*` entry that is a symlink. A foreign dir holding an owner.json with a dead pid and an old startedAt, plus a `wt/`, gets its `wt/` removed.
- Only something that can write into scratch can plant such an entry, for example the child via Bash. Low likelihood.
- `isProcessAlive` (:266-268) returns false on EPERM, so a live process owned by another user counts as dead.
- PID reuse is fail-safe: a reused pid counts as alive, so the run is skipped and only leaks.

**Fix.** Current (:279):
```js
    const runDir = path.join(scratchDir, entry);
```
Replacement:
```js
    const runDir = path.join(scratchDir, entry);
    try { if (!fsImpl.lstatSync(runDir).isDirectory()) continue; } catch { continue; }
```
Current (:266-268):
```js
function isProcessAlive(pid, fsImpl = fs) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
```
Replacement:
```js
function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err?.code === 'EPERM'; }
}
```

## 8. MINOR: a symlinked `--repo` gets past the "plugin root inside the reviewed repo" exit 4 (measured)

**Evidence**
- The check (review-run.mjs:398-409) compares `path.resolve` strings.
- Walk-up starts from the script's realpath, while `repoTop` is `path.resolve(--repo)`, so it can go through a symlink.
- Measured with `rev-MfVP/inside-repo.mjs`: an injected gitRunner throws at `clone`, so nothing is created or removed.
  - direct path: `exit=4 reachedClone=false`;
  - `--repo <symlink to the same repo>`: `exit=7 reachedClone=true`.
- In the second case the run went on with the reviewed tree's own `agents/reviewer.md`.
- Windows case differences hit the same compare.

**Fix.** Current (:402):
```js
        if (path.resolve(pluginRoot, rootCommon) === path.resolve(repoTop, repoCommon)) {
```
Replacement:
```js
        const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
        const norm = (p) => (process.platform === 'win32' ? real(p).toLowerCase() : real(p));
        if (norm(path.resolve(pluginRoot, rootCommon)) === norm(path.resolve(repoTop, repoCommon))) {
```
Predicted: the symlinked case exits 4 before any clone.

## 9. MINOR: the git environment is only partly stripped (measured)

**Evidence**
- I fed `buildChildEnv` a probe env and printed names only. These reach the child:
  - `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT/KEY_n/VALUE_n`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`: a caller-scoped `core.hooksPath` or other config gets injected;
  - `GIT_AUTHOR_*` and `GIT_COMMITTER_*`: identity;
  - `GIT_NAMESPACE`, `GIT_CEILING_DIRECTORIES`, `GIT_SSH_COMMAND`, `GIT_ASKPASS`, `GIT_EXEC_PATH`, `GIT_TEMPLATE_DIR`, `GIT_QUARANTINE_PATH`.
- The script's own git calls strip only the 6 repo-locating names (:72-75, :234-238). That covers the named four (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_COMMON_DIR) plus the two object-dir names. Nothing else is stripped.

**Fix.** Current (:68):
```js
const ENV_DENYLIST_PATTERN = [/^CLAUDE_CODE_SESSION_/, /_SESSION_ID$/];
```
Replacement:
```js
const ENV_DENYLIST_PATTERN = [/^CLAUDE_CODE_SESSION_/, /_SESSION_ID$/, /^GIT_/];
```
Current (:236):
```js
  for (const key of Object.keys(copy)) if (REPO_LOCATING_GIT_ENV.includes(key)) delete copy[key];
```
Replacement:
```js
  for (const key of Object.keys(copy)) if (key.startsWith('GIT_')) delete copy[key];
```

## 10. MINOR: sidecar and stdout fields the ruling requires are missing

**Evidence**
- The identity (review-run.mjs:467-485) has no `installedRoleSha256` (M7: "even when another source was used"), no body sha256 (M3: "the sha256 of the body bytes and of the whole file"), and no resolved absolute claude path (m1).
- The stdout JSON (:522) has no `cleanup`, and no path when cleanup failed (M5: "set "cleanup":"failed" and the path in the stdout JSON and the sidecar").
- `model` is the alias `opus`, not the id resolved from the init event.
- No sidecar is written on exit paths 1, 4 or 7 after the clone.

**Fix**
- Add `roleBodySha256: sha256Hex(Buffer.from(role.body, 'utf8'))`.
- Add `installedRoleSha256`: the sha of `<installPath>/agents/reviewer.md` from the user entry, or null. Compute it independently of `roleSource`.
- Add `claudeBin`: the absolute path. Resolve PATH once with `execFileSync('which'/'where.exe')`, or record `child.spawnfile`.
- Add `resolvedModel` from `row.model` of the init event.
- Add `cleanup` and, when it failed, `wtDir` to `output`.

## 11. MINOR: the build report's "P4" is not the spec's P4, and the spec's P4 never ran

**Evidence**
- In build.md's probe table, the P4 row is "Role file byte-identity (folded into P1)".
- The spec's P4 is "no transport writes": hashes and mtimes of `~/.agents/notes/`, `inboxes.json`, `panes.json` and the repo's `docs/ledger/`, before and after a full run.
- M1 extends it into P7 ("P4's hashes are unchanged"), and m2 adds `~/.claude/knowledge/_inbox`.
- No row measures any of these. The decision-2(a) multi-inbox line is exactly what that probe would prove live.

**Fix**
- Run the real P4 in the probe round.
- lean-rules forbid reading `inboxes.json`, so use `stat` (mtime, size) for that file and hash the rest.
- Correct build.md's table.

## 12. MINOR: an inherited `DELEGATION_REVIEW_RUN=1` silently disables a lead's inbox, and nothing documents it

**Evidence**
- hooks/multi-inbox.js:269 returns early on every event when the marker is set, so the session gets no registration, no delivery and no Stop-block.
- hooks/delete-guard.mjs:561 fails safe (it denies).
- A `git grep DELEGATION_REVIEW_RUN` finds the name only in code and tests. SKILL.md, docs/ and the hook headers never say that a session carrying the marker gets no notes.
- Inheritance needs a process started from the child's Bash that outlives it. `Bash(claude:*)` blocks only the literal prefix (`nohup claude …` and `env claude …` get through), so it is possible but unlikely.

**Fix**
- Add one sentence to the SKILL.md review-run paragraph and one to the multi-inbox.js comment at :267: "A session whose env carries DELEGATION_REVIEW_RUN=1 is never registered and receives no notes; the marker must never be exported in a lead's shell."
- Optional: on SessionStart, multi-inbox writes one stderr line when it skips for the marker.

## 13. MINOR: `--timeout-min` above about 35791 overflows setTimeout and kills the child at once

**Evidence**
- review-run.mjs:621 computes `timeoutMin * 60 * 1000`.
- Node sets any delay above 2147483647 ms to 1 ms, so the run exits 3 immediately.

**Fix.** Current (:122):
```js
  if (!Number.isFinite(out.timeoutMin) || out.timeoutMin <= 0) usageError('--timeout-min must be a positive number');
```
Replacement:
```js
  if (!Number.isFinite(out.timeoutMin) || out.timeoutMin <= 0 || out.timeoutMin > 35000) usageError('--timeout-min must be a positive number of at most 35000');
```

## 14. MINOR: the sidecar write follows a symlink the child planted, and two runs can share one report path

**Evidence**
- `writeFileSync(identityPath, …)` (review-run.mjs:520) follows a symlink the child may have created at `<report>.identity.json` while it ran. The child can Write anywhere today (finding 1), so this becomes a confused-deputy write only once finding 1 is fixed.
- `validateReportPath` (:260-263) is check-then-use. Two concurrent runs given the same `--report` both pass, and one can validate the other's report.

**Fix (judgment)**
- Claim the sidecar atomically during validation with `fs.writeFileSync(sidecar, '', { flag: 'wx' })`; EEXIST exits 1.
- Write the final sidecar through `fs.openSync(sidecar, O_WRONLY|O_TRUNC|O_NOFOLLOW)`.
- Document that a failed run leaves an empty sidecar, so the report path must be fresh.

---

## Verified absent (first-class findings)

- **B1 verdict parsing.** I compared 20 inputs against accept's `VERDICT_RE` (scripts/work-record.mjs:571) with its normalization (:1335: split on `/\r?\n/`, then `trim()`, which also strips a BOM).
  - No input is accepted by review-run and rejected by accept.
  - The differences all run the other way: accept takes and review-run rejects `VERDICT: NEEDS_FIXES (3)` with no sha, 4-6 or 41-64 hex, `FAIL`, and `REJECTED`.
  - `NEEDS_FIXES (n) <sha>`, `— <sha>`, CRLF, BOM, surrounding spaces and an uppercase sha all agree.
  - The sha-less `NEEDS_FIXES (n)` exits 2. That conforms to the ruling, but it is the reviewer role's own literal form (agents/reviewer.md), so a role-obedient child that ignores the prompt's sha line produces a relay. Worth a line in SKILL.md.
- **Environment.** `NOTE_SLUG`, `ORCA_TERMINAL_HANDLE` (the `ORCA_` prefix), `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY` and `GIT_ALTERNATE_OBJECT_DIRECTORIES` are stripped (measured).
  - The argv never carries `-n` or `--name`; the session appears only as the `--session-id` uuid.
  - Nothing prints or persists an environment value:
    - owner.json is `{pid, startedAt}`;
    - the sidecar holds paths, hashes and telemetry;
    - stderr messages name paths only;
    - an internal-error stack carries git argv, not env.
  - `stream.jsonl` persists the transcript under scratch by design (m3).
- **A signal mid-setup is not lost.** Everything from `parseArgs` to `spawn` is synchronous, and the first `await` is `runChild`. So the SIGINT/SIGTERM/SIGHUP callback runs only after the abort listener is registered, and it kills the just-spawned group. The existing SIGTERM test exercises exactly that window.
- **The cleanup target is always this run's own `<scratch>/review-run-<sha7>-<rand8>/wt`** (:429-432, :516, :525).
  - No `git worktree` or `prune` call remains.
  - Symlinks inside `wt/` are not followed: Node 24's `rmSync` removes the link, not its target. This is reasoned, not run, because of the no-delete rule; the test in finding 5 would pin it.
- **Role resolution.** The order is flag, then installed user entry (then matching project entry), then walk-up.
  - The cache dir is never scanned; only the recorded `installPath` is read, as M7 allows.
  - Nothing reads from the reviewed clone.
  - A direct-path root inside the reviewed repo exits 4 (measured). For the symlink hole, see finding 8.
- **Kill switch and recursion come before any side effect** (:366-375).
- **Decision 2(a) hook lines.**
  - Both unit tests go red without their line: delete-guard 2 fail, multi-inbox 1 fail (mutations H1, H2).
  - There is no twin to patch:
    - `hooks/delete-guard.mjs` is the single file both hosts load (hooks/hooks.json:104, hooks/codex-hooks.json:8);
    - `hooks/multi-codex-hook.mjs` has no `agent_id` gate and is a Codex-only hook, which a Claude child never loads.
  - The untracked `hooks/multi-hook-core.mjs.bak-noparking` in the main checkout is not in this tree.
- **Clone isolation.** Git never writes into an alternates store, the origin is removed, and config, hooks and refs are private to the clone. The child can still name the original repo's path, which is why finding 1 is the blocker.

## C4 (the bug fix under review: ce0676c, "escalate to dontAsk for P7")

Cause: probe P7's out-of-clone Write succeeded because `--allowedTools` pre-approves the `Write` tool for every path (review-run.mjs:210). The permission mode was not the cause, and dontAsk still honours a pre-approval ("deny if not pre-approved").
Discriminating check: under the committed dontAsk argv, a live child Writes to an absolute path outside the clone. The prediction is that it is still allowed. With finding 1(a), the Write rule limited to the report path, the same call is denied, and the report Write still succeeds.
Fix location: `buildArgv` in skills/team-build/scripts/review-run.mjs:196-214 (the allow list and deny list), plus the call site at :449-451 that passes `reportPath`.
Simplification: grant exactly one path-scoped Write rule instead of switching the session-wide mode. The mode question then goes back to the ruling's default (`auto`) unless P5 says otherwise.

## Items for the live probe round

1. **P7 under the committed argv.** Run it before any fix, so the defect is recorded as measured:
   - Write to an absolute path outside the clone (predicted: allowed);
   - Bash `printf x > <outside path>` (predicted: allowed);
   - `git -C <decoy origin repo> push --dry-run <decoy> HEAD:refs/heads/probe` (predicted: allowed);
   - `git --git-dir=<decoy>/.git config core.hooksPath /tmp/x` (predicted: allowed).

   Then repeat it with finding 1(a) and 1(b), under `auto` and under `dontAsk`.
2. **P5 with the fixed argv.** Zero denials on a real review, including the report Write through the scoped rule. This settles the syntax: `Write(//abs)` or `Edit(//abs)`.
3. **P1(ii) with `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`.** Ask the child to name the file and quote the first line of any CLAUDE.md or rules file it can see. Expected: "none". Re-check P2a in the same env, to confirm the hooks still load.
4. **P3 live.** The child runs review-run and gets exit 6. Also have it try `env claude -p …` or `nohup claude …`, which get past the `Bash(claude:*)` prefix, and record the result.
5. **The real P4.** Before/after hashes of `~/.agents/notes/` (stat only for `inboxes.json`, per lean-rules), `panes.json`, the repo's `docs/ledger/` and `~/.claude/knowledge/_inbox`.
6. **Windows (ben-desktop).**
   - PowerShell deny twins and their rule syntax.
   - The Windows form of the absolute-path Write rule.
   - Resolution of `claude` to `claude.exe` on PATH.
   - Cleanup over a checked-out symlink or junction pointing at a canary dir: the canary must survive.
7. **Codex-launched run.**
   - The sandbox escalations it needed.
   - Whether a Codex tool timeout sends SIGTERM (handled) or SIGKILL (finding 6's orphan), and whether the detached child survives it.
8. **P2b after release.** The installed 0.20.17 cache still lacks the delete-guard line, so a live P2b stays red until a release ships this commit.

Observation, not counted: build.md says the builder confirmed the hook tests went red with `git stash`. No stash entry remains, and I re-proved both by mutation.
