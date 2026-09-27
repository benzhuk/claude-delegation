VERDICT: APPROVE 9ff2ee4ba29961d79e0f692c25c52aaf68277db2

# K1 review, round 2 (delta): hooks/knowledge-log.mjs

Work: wr-2026-09-27-knowledge-counted. Territory K1 only.
Worktree: `C:/Users/benzh/Code/knowledge-counted/wt-knowledge-counted-1-K1`. HEAD is
`9ff2ee4ba29961d79e0f692c25c52aaf68277db2`, from my own `git rev-parse HEAD`. It matches the
report's "Round 2 commit" line. The range b270c67..HEAD is one commit (`9ff2ee4 fix: K1 round 2 ...`)
touching only `hooks/knowledge-log.mjs` (+37/-22) and `hooks/knowledge-log.test.mjs` (+109/-4).
The worktree was clean (`git status --short` empty) before and after this review. All mutation
checks ran on a scratch copy under my session scratchpad, which I restored and confirmed
byte-identical to the worktree file with `cmp`. Nothing in the reviewed tree was written.

Order: I read the report first, then the diff.

Severity count: 0 BLOCKER, 0 MAJOR, 0 MINOR. One non-blocking advisory (A1) is listed below and is not counted.

---

## Prior findings: each fix verified

| r1 | Status | Evidence |
|---|---|---|
| F1 MAJOR, second rotation clobbered `.1` | FIXED | `hooks/knowledge-log.mjs:255` `if (size >= ROTATE_AT_BYTES && !fsImpl.existsSync(`${logPath}.1`)) {`. Header `:60-65` and JSDoc `:242-245` no longer say "overwriting". The old test is replaced by two tests (no prior `.1` rotates; an EXISTING `.1` is untouched and the live log keeps `OLD-CURRENT`, ending in `after-rotate`). **Mutation:** removing the guard on a scratch copy fails exactly "CLI: a log at or over 1 MiB with an EXISTING .1 does not rotate again ..." (27/28). |
| F2 MINOR, entry check no-ops via a junction | FIXED | `:299-311` `isMainModule()` realpaths both sides and case-folds on win32. `:99` now imports `fileURLToPath`. New CLI test spawns through `fs.symlinkSync(HERE, ..., 'junction')`; it ran and was not skipped. **Mutation:** restoring `import.meta.url === pathToFileURL(entry).href` fails exactly "CLI: launched through a junctioned/symlinked hook path still logs ..." (27/28). Importing the module still does not run the CLI: the unit tests import it and pass. |
| F3 MINOR, symlink behaviour undocumented | FIXED | Header paragraph at `:55-58` matches the r1 text. Two `decide()` tests pin 2a (store-is-link: the link path counts, the real target path does not) and 2b (a link inside the store pointing out still counts). Both ran on this host; neither was skipped. `trySymlink` skips only on EPERM/EACCES and rethrows anything else. That is correct: an unexpected error surfaces rather than silently skipping. |
| F4 MINOR, `~` used real homedir | FIXED | `:133` `resolveDisplayPath(filePath, cwd, home = os.homedir())`, `:138` `path.join(home, p.slice(1))`, `:190` passes `home`. New test "decide: a `~` file_path expands against ctx.home ...". **Mutation:** restoring `os.homedir()` at `:138` fails exactly that test (27/28). |
| F5 MINOR, comment and citation errors | FIXED | `:37-39` and `:48` now carry the r1 replacement text verbatim. I spot-checked the report's new citations against HEAD: `:133`, `:138`, `:149-152`, `:172-222`, `:176-181`, `:190`, `:200-203`, `:215-219`, `:246-267`, `:255`, `:269-292`, `:279-284`, `:288-289`, `:294-311`, `:313-318`, `:55-58`, `:60-65`, `:67-94`, `:101`, `:102`. All match. |

## Regression hunt

- **Rotation race under the new guard.** The existsSync-then-rename step is check-then-act, so in
  theory two writers can both see no `.1`. Measured through the real hook CLI with 10 trials,
  each with 16 concurrent writers against a 1.2 MB `read.log` in scratch homes:
  `trials with GEN1 loss: 0/10; lost new lines: 0`. Every trial left `read.log,read.log.1`, with
  all 240000 GEN1 lines and 16/16 new lines accounted for. That is the same residual as r1 (it was
  optional then). This round did not widen it. No action.
- **Once `.1` exists, the live log grows without bound.** This is the intended literal reading of
  "rotated to `.1` once, never deleted". It is documented at `:63-65`. No action.
- **`isMainModule` on non-Windows.** Both sides go through `fs.realpathSync`, the same function
  Node's own main-module resolution uses, so case and link differences cancel. A realpath
  failure falls back to `path.resolve`, and any throw means `false`. There is no new crash path
  at import. No defect.
- **fsImpl contract.** `appendWithRotation` now calls `fsImpl.existsSync`. Only `runCli(fsImpl = fs)`
  reaches it, and any throw is swallowed inside the outer try. No test injects a partial fs into
  the CLI path. No defect.
- **Scope.** The diff touches no K23 file, no `hooks.json`, no README and nothing under `docs/work/`.
  Imports are still only `node:fs/os/path/url`. Verified.

## Tests

- Brief gate halves, re-run by me at HEAD:
  - `node --test hooks/knowledge-log.test.mjs scripts/mirror-shared-skills.test.mjs`: 41/41 pass, 0 skipped.
  - `node --test --test-name-pattern="V3|N2" skills/multi/scripts/hooks.test.mjs`: 10/10 pass.
- `pack/reports/K1-gate.log`:
  - It shows `tests 54 / pass 54 / fail 0 / skipped 0`.
  - It contains the three new round-2 test names.
  - Its mtime (09:00:20 EDT) is after the commit (08:59:38 EDT).
- The report's round-2 gate command (`node --test hooks/knowledge-log.test.mjs skills/multi/scripts/hooks.test.mjs`)
  differs from the K1 brief's. The report attributes this to the round-2 task. I cannot see
  that task, so I re-ran the brief's own command as well (above). Both are green.

## Advisory (non-blocking, not counted)

**A1: the junction-launch test leaks a junction into `%TEMP%` that points at the live worktree's `hooks/` dir.**
- Where: `hooks/knowledge-log.test.mjs`, the test "CLI: launched through a junctioned/symlinked hook
  path ...". It creates `knowledge-log-link-parent-*/hooks-link -> HERE` and never removes it.
- Measured: `ls $TEMP | grep -c knowledge-log-link-parent-` returned `9` after the builder's runs and mine.
- Why it matters: a temp cleaner that follows reparse points could reach real source files
  through the link. This is unlikely with Node's `rmSync` or Explorer, but cheap to prevent.
- Precedent: the repo already cleans up with `t.after` (for example `hooks/multi-codex-hook.test.mjs:73`).

Current code, immediately after the skip block:
```js
  const linkedHookPath = path.join(linkedHooksDir, 'knowledge-log.mjs');
```
Replacement:
```js
  // Remove the link itself (never its target) so no junction into the repo outlives the test.
  t.after(() => { try { fs.rmSync(linkDir, { recursive: true, force: true }); } catch {} });
  const linkedHookPath = path.join(linkedHooksDir, 'knowledge-log.mjs');
```
- Predicted outcome: the test still passes. `fs.rmSync` lstat's the junction and unlinks it
  without descending into `hooks/`.
- The lead may fold this into integration or waive it. It does not affect the hook's behaviour
  or the count.

## C4 fields

Cause: r1 found five defects. (1) An unguarded `renameSync` onto an existing `.1` (`:251` at b270c67). (2) A naive URL-string entry check. (3) Undocumented lexical symlink handling. (4) `~` expanded against the real `os.homedir()` instead of `ctx.home`. (5) Comments that contradicted the code.
Discriminating check: on a scratch copy, reverting each code fix one at a time fails exactly its new test, 27/28 each time. F1 fails "EXISTING .1 does not rotate again", F2 fails "launched through a junctioned/symlinked hook path", F4 fails "`~` file_path expands against ctx.home". The unmodified copy passes 28/28, 0 skipped.
Fix location: `hooks/knowledge-log.mjs:255` (F1); `:99,299-311` (F2); `:55-58` (F3); `:133,138,190` (F4); `:37-39,48,60-65,242-245` (F5); new and replaced tests in `hooks/knowledge-log.test.mjs`.
Simplification: none further warranted. The F1 fix is a single guard clause, the lightest form of "once". The optional `linkSync` no-clobber variant stays unnecessary, given the 0/10 measured race loss.
