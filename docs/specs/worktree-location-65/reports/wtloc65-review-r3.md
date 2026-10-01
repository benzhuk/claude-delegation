VERDICT: NEEDS_FIXES (1) 1364cdfdab59ecf3bda5b5e9244c961d7120a506

# wtloc65 review, round 3 (delta re-review of the r2 fix round)

Reviewed: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-worktree-location-65-wtloc65, branch build/worktree-location-65-wtloc65.
HEAD (my own `git rev-parse HEAD`): 1364cdfdab59ecf3bda5b5e9244c961d7120a506. Delta 9526ad71..HEAD is one commit (1364cdfd) touching 2 files: hooks/worktree-location.mjs (+25/-13) and hooks/worktree-location.test.mjs (+16/-1). `git status --porcelain` in the worktree was empty before and after my review.

Counts: 0 BLOCKER, 0 MAJOR, 1 MINOR. All four r2 findings are fixed, and each fix is pinned by a test that fails when the fix is reverted. The one MINOR is not a regression: it has been there since the first delivery (2697a085). It is the PowerShell twin of r2 finding 2 (a dangling quote turns the guard off for the rest of the command), and the r2-2 fix did not close it.

## Gate re-run (it is real)
I re-ran the builder's 13-file `node --test` list myself, writing output to my scratch folder: `tests 811, pass 794, fail 0, cancelled 0, skipped 16, todo 1`, exit 0. This matches the builder's gate log. The only `✖` line is the deliberate `probe` fixture that scripts/run-tests.test.mjs spawns. The test count is the same as r2 because the new cases went into existing tests.

## Method
- Probes used real git. I made a `git init` fixture repo under scratch, plus a real linked worktree created with `git worktree add --orphan` at `<repo>/.claude/worktrees/lane` (LANE). I called `checkBashWorktreeAdd` / `checkAgentWorktree` in-process with a fixture home, on about 55 commands and prompts. I ran the same set against HEAD, r2 (9526ad71), r1 (b7fcaaee) and the first delivery (2697a085), then diffed the outputs.
- Mutation checks ran on a `git archive HEAD` copy in scratch, never on the reviewed tree. After the checks the copy is byte-identical to HEAD again (confirmed with `cmp`).

## Prior findings: status

| r2 | Status | Evidence |
|---|---|---|
| 1 MAJOR `cd X;` / `Set-Location X;` | FIXED | CD_VAL `[^\s;&|)]+` (hooks/worktree-location.mjs:216-217). With real git from LANE, these are now DENY and each names `<repo>/.claude/worktrees/<leaf>`: `Set-Location <repo>; ... ../sl-escape`, `Set-Location <repo>;git ...`, `cd <repo>;git ... ..\nospace-ps2`, `cd <repo>&&git ...`, `Set-Location -Path <repo>; ...`, `cd "<repo>";git ...`, `cd <repo>|git ...`, `(cd <repo>; git ...)`. `cd -- .claude/worktrees && git worktree add wt-dd` (cwd REPO) is now allowed. The test stub now throws on a missing cwd (worktree-location.test.mjs:235), so the test no longer hides the miss. Mutation: reverting CD_VAL to VAL alone gives `fail 1`; dropping `--\s+` alone gives `fail 1`. |
| 2 MINOR quote state across lines | FIXED | `stripComment(line, state)` with one shared `quoteState` (:118-147). DENY: escape-a/b/c, plus my extra cases `git commit -m "it's #1"\n...`, a single-quoted `'a\nb # c'`, `git status # don't\n...`, `# it's a note\n...`, `"$(cat <<'EOF' ... EOF\n)"\n...` and `-F - <<'EOF'`. The r1-4 comment cases are unchanged (`... # then later git worktree add ../z` and `# git worktree add ../z\ngit status` are allowed, `../x#frag` is denied). Mutation: a per-line `{ quote: null }` gives `fail 1`. |
| 3 MINOR backslash Agent relative path | FIXED | `/^\.{1,2}[\\/]/` (:349). `Worktree: ..\wt-back` and `Worktree: .\wt-dot` are denied and name the leaf. `Worktree: .\.claude\worktrees\new2` and `Worktree: .claude\worktrees\x` are allowed. Mutation: `[\/]` gives `fail 1`. (The builder report's item 3 writes the regex as `[\/]`; the code is correct, only the report's text is off.) |
| 4 MINOR cd inside `bash -c "..."` | FIXED | `replayCd` (:272-289). DENY from LANE: `bash -c "cd <repo> && ... ../bashc-escape"`, `bash -c 'cd <repo>; ...'`, `pwsh -Command "Set-Location <repo>; ..."`. ALLOW from REPO: `bash -c "cd .claude/worktrees && git worktree add wt-bashc-legit"`. Also correct: `bash -c "cd <repo>; cd .claude/worktrees && git worktree add wt-two-cd"` is allowed (two inner cds replay in order). `bash -c "cd <repo>" && git worktree add ../subshell-cd` from LANE is allowed (a subshell cd does not leak, so `../` from LANE stays in the folder). `cd .claude/worktrees && bash -c "git worktree add wt-outer"` is allowed (round 1 hard-denied it). `bash -c "cd \$WT && ..."` is allowed (unresolvable). `bash -c "cd 'C:/nonexistent dir' && ..."` is allowed (not a repo: allow). The quoted git.exe head (`& "C:\Program Files\Git\cmd\git.exe" worktree add ../qexe`) is still denied. Mutation: disabling the inner replay gives `fail 1`. |

Compared with r2 output, my probe set changes ONLY on the lines named above: the four r2 findings plus `escape-e`. Compared with r1, the r1-4 comment lines are back to allow, as r2 intended. No other line changed.

## Finding

### 1. MINOR (pre-existing since 2697a085, the PowerShell twin of r2-2): a PowerShell here-string leaves its opening quote dangling, and every `git worktree add` after it in the same call is allowed

Evidence: hooks/worktree-location.mjs:136-151 (`stripHeredocs`). The here-string body and its terminator line (`'@` / `"@`) are dropped, but the opener line `... @'` is kept with its `'`. Both `scanCommand` and the new `quoteState` then see a quote that never closes. So the git match on a later line is `inQuote`, its head is not an executor, and it is skipped as prose. The terminator line is also dropped whole, so anything after `'@` on that line is never seen. Real git, cwd = REPO, tool PowerShell. The result is the same at HEAD, r2, r1 and 2697a085:
```
"$m = @'\nnotes\n'@\ngit worktree add ../hs-escape"                -> allow  (git creates <Code>/hs-escape: outside)
"$m = @\"\nnotes\n\"@\ngit worktree add ../hs2-escape"              -> allow
"git commit -m @'\nmsg\n'@\ngit worktree add ../hs3-escape"         -> allow
"git commit -m @'\nmsg\n'@; git worktree add ../hs4-escape"         -> allow
```
`git commit -m @'...'@` is the commit idiom the PowerShell tool itself tells agents to use. The bash spelling of the same contract is already pinned (worktree-location.test.mjs:139: "a heredoc does not hide a real command that follows it"), but the here-string spelling is not. This is the named failure class: a deny that fails open on its own input. It is MINOR because the trigger is narrow (a here-string and an outside `worktree add` in one call).

Fix (mechanical), hooks/worktree-location.mjs. Exact current code (:137-150):
```js
    if (pending) {
      const t = line.trim();
      if (pending.ps ? t.startsWith(pending.term) : t === pending.term) pending = null;
      continue;
    }
    out.push(stripComment(line, quoteState));
    const h = /(?<!<)<<-?[ \t]*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z_]\w*))/.exec(line);
    if (h) { pending = { term: h[1] ?? h[2] ?? h[3], ps: false }; continue; }
    const t = line.trimEnd();
    if (t.endsWith("@'")) pending = { term: "'@", ps: true };
    else if (t.endsWith('@"')) pending = { term: '"@', ps: true };
  }
```
Replacement:
```js
    if (pending) {
      const t = line.trim();
      if (pending.ps ? t.startsWith(pending.term) : t === pending.term) {
        // `'@ | Set-Content x` or `'@; git ...`: the rest of the terminator line still runs
        if (pending.ps) out.push(stripComment(t.slice(pending.term.length), quoteState));
        pending = null;
      }
      continue;
    }
    out.push(stripComment(line, quoteState));
    const h = /(?<!<)<<-?[ \t]*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z_]\w*))/.exec(line);
    if (h) { pending = { term: h[1] ?? h[2] ?? h[3], ps: false }; continue; }
    const ps = /@(['"])$/.exec(line.trimEnd());
    if (ps) {
      pending = { term: `${ps[1]}@`, ps: true };
      // the here-string is one closed string: its opening quote must not swallow what follows
      out[out.length - 1] = out[out.length - 1].replace(/@(['"])\s*$/, '$1$1');
      quoteState.quote = null;
    }
  }
```
Test: in hooks/worktree-location.test.mjs, next to the heredoc assertion at :139, add:
```js
  // ... and neither does a PowerShell here-string, or a command on its terminator line.
  for (const [cmd, leaf] of [
    ["git commit -m @'\nmsg\n'@\ngit worktree add ../hs-escape", 'hs-escape'],
    ['$m = @"\nnotes\n"@\ngit worktree add ../hs2-escape', 'hs2-escape'],
    ["git commit -m @'\nmsg\n'@; git worktree add ../hs4-escape", 'hs4-escape'],
  ]) {
    assert.equal(decide(BASH(cmd, repo, 'PowerShell'), ctxFor(home)).text, r4Text(repo, leaf), cmd);
  }
```
Predicted outcome, verified by applying the code replacement to the scratch copy: worktree-location.test.mjs plus agent-dispatch-guard.test.mjs give `pass 135, fail 0`. In my probe set, only the four here-string lines above change: each becomes a DENY naming `<repo>/.claude/worktrees/<leaf>`. The existing prose case `@'\ngit worktree add ../x\n'@ | Set-Content n.md` is still allowed, because the body is still dropped and the terminator's rest is only `| Set-Content n.md`. Bash heredocs (`"$(cat <<'EOF' ... EOF\n)"`, `-F - <<'EOF'`) are unchanged.

## Verified absences in the delta
- No regression from the shared quote state: an apostrophe inside a `#` comment (`git status # don't`, `# it's a note`) does not leak, because the `#` is cut before the quote is read. The `"$(cat <<'EOF'` commit pattern closes its `"` on the `)"` line, as before.
- CD_VAL: quoted operands with spaces, `-Path`/`-LiteralPath`, `|`, `(...)` and `)` all place correctly. Pre-existing residuals, not counted and not changed by this delta: `cd X 2>/dev/null && git ...` (a redirection after the operand) is not followed and judges against the call cwd. `cd (Join-Path ...)` is not followed either.
- `replayCd`: the outer replay still skips quoted text (`echo "x; cd <repo>/.."` is ignored), and the inner replay sees only the executor's own quoted head, so no cd is replayed twice.
- The test stub now behaves like real git on a missing cwd, and `<repo>/.claude/worktrees` is created, so the in-folder allow cases (`cd .claude/worktrees`, `cd --`, `bash -c "cd .claude/worktrees ..."`) are meaningful and not vacuous allows. The mutation results above confirm this.
- Out of the delta: `git diff --stat 9526ad71..HEAD` lists only the two hooks files. agent-dispatch-guard.mjs/.test.mjs (R0-stale/R1/R1b/R2/R3 text and order, the kill switch), hooks.json, the janitor, the installer, .gitignore, agents and skills are untouched. My r1/r2 verified absences for items 2, 3, 4, 5 and 7 stand, and their tests pass in my gate re-run.

## C4 fields (item 7 is the bug-fix part of this lane; unchanged since r1)
Cause: the janitor's bare `--record` defaulted to the tracked `docs/work/evidence/janitor/` (the old janitor.mjs DEFAULT_RECORD_DIR). Every daily scheduled run therefore appended to the tracked drift.md in each durable checkout, and `git pull --ff-only` refused on Netcup and Hetzner.
Discriminating check: scripts/janitor.test.mjs "lane 65 item 7: the scheduled argv (bare --record, --host, --apply) on a clean fixture repo leaves `git status --porcelain` empty". It fails under the old default and passes now (it passes in my r3 gate re-run).
Fix location: scripts/janitor.mjs `defaultRecordDir`, `parseFlags(argv, home)` and `main`'s injectable `home`; not changed in this delta.
Simplification: nothing more is needed for item 7. For R4, the r3 finding's fix stays inside `stripHeredocs`, so it needs no new pass and no second quote tracker.
