VERDICT: APPROVE ea919e4cfc0525c726bc8e5166eed4414c99ab79

# wtloc65 review, delta re-review of fix round 3 (the harness calls this review round 2)

Reviewed: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-worktree-location-65-wtloc65, branch build/worktree-location-65-wtloc65.
HEAD (my own `git rev-parse HEAD`): ea919e4cfc0525c726bc8e5166eed4414c99ab79. The range 1364cdfd..HEAD is one commit (ea919e4c) that touches two files: hooks/worktree-location.mjs (+12/-4) and hooks/worktree-location.test.mjs (+8). `git status --porcelain` in the worktree was empty before and after my review.

About the report path: the harness called this "round 2", but reports/wtloc65-review-r2.md already holds an earlier reviewer's r2 findings. Writing there would overwrite that work, so this report is r4, the next free number after r3.

Counts: 0 BLOCKER, 0 MAJOR, 2 MINOR. Neither MINOR blocks the verdict.
- The r3 finding is fixed at its cause, and a test pins it: reverting the fix fails that test.
- MINOR 1 is older than this lane's fix rounds. It is in the same here-string detector, and its trigger is narrower than r3-1's.
- MINOR 2 is a test gap: one line of the new fix is not pinned by any test.
Both come with patches that I verified on a scratch copy, so the orchestrator can fold them in without another review round.

## Gate re-run (it is real)
I re-ran the builder's 13-file `node --test` list in the worktree myself, with output going to my scratch folder: `tests 811, pass 794, fail 0, cancelled 0, skipped 16, todo 1`, exit 0. This matches reports/wtloc65-gate.log. The only `✖` lines come from the deliberate `probe` fixture that scripts/run-tests.test.mjs spawns. I also ran hooks/worktree-location.test.mjs, hooks/agent-dispatch-guard.test.mjs and skills/multi/scripts/hooks.test.mjs on their own: `pass 177, fail 0`.

## Prior finding: status

| r3 | Status | Evidence |
|---|---|---|
| 1 MINOR: a PowerShell here-string leaves its quote dangling | FIXED | hooks/worktree-location.mjs:140-156. The opener `@'`/`@"` is rewritten to an empty closed string, the shared quote state is cleared, and the rest of the terminator line is kept and comment-stripped. I probed with real git (a `git init` fixture repo under scratch with `.claude/worktrees` created, cwd = repo, tool PowerShell). Every case below is DENY, and each names `<repo>/.claude/worktrees/<leaf>`: `git commit -m @'\nmsg\n'@\ngit worktree add ../hs-escape`, `$m = @"\nnotes\n"@\n... ../hs2-escape`, `'@; git worktree add ../hs4-escape`, `$m = @'...`, `'@ \| git worktree add ../tail-escape`, a body holding `it's`, an indented `  '@`, two here-strings in a row, and a `"` inside a `@"..."@` body. All of these were allowed at 1364cdfd. Still allowed, which is correct: the prose case `@'\ngit worktree add ../x\n'@ \| Set-Content n.md`, `$m=@'` (no space) and `(@'...'@)` with an outside path in the body, an in-folder `.claude/worktrees/ok-in` after a here-string, and `'@ + "x` followed by a git line (that quote really is still open). The bash heredoc `"$(cat <<'EOF' ... EOF\n)"` is unchanged and still DENY. Mutations on a `git archive HEAD` copy in scratch: reverting the whole fix gives `fail 1`. Dropping only the terminator-tail push gives `fail 1`. Dropping only the opener rewrite plus the reset gives `fail 1`. Dropping only `quoteState.quote = null` gives `fail 0` (see MINOR 2). The copy was byte-identical to HEAD again afterward (`cmp`). |

Regression hunt: across my 24-command probe set, the only lines whose output changed between 1364cdfd and HEAD are the here-string lines that r3-1 named, plus their twins listed above. No allow became a deny on legitimate in-folder or prose input. agent-dispatch-guard.test.mjs (R0-stale, R1, R1b, R2, R3 texts and order, and the kill switch) passes unchanged. The delta does not touch hooks.json, the janitor, the installer, .gitignore, agents or skills.

## Findings

### 1. MINOR (pre-existing since 2697a085; a twin of r3-1): a line that merely ends in `@'` or `@"` is taken for a here-string opener, so every later line in the call is dropped unseen

Evidence: hooks/worktree-location.mjs:151, `const ps = /@(['"])$/.exec(line.trimEnd());`. This matches any line whose last two characters are `@` plus a quote, including a closing quote, a quoted string's tail and a comment. The detector then sets `pending`, and because no `'@` terminator line ever comes, every later line is skipped. Real git, cwd = fixture repo. The result is the same at HEAD and at 1364cdfd:
```
"echo 'user@'\ngit worktree add ../at-quote"            (Bash)       -> allow
"git commit -m \"ping me@\"\ngit worktree add ../at-dq" (Bash)       -> allow
"Write-Host 'mail me@'\ngit worktree add ../ps-at"      (PowerShell) -> allow
"git status # see @'\ngit worktree add ../cmt-at"       (PowerShell) -> allow
```
PowerShell opens a here-string only when `@'`/`@"` starts a token, outside a string and outside a comment, and is the last thing on the line. Bash has no here-strings of this kind. This is the named failure class (the guard is not looking at the line that runs), but the trigger is narrow: a non-opener line has to end in `@` plus a quote, and an outside `worktree add` has to follow in the same call. That is why it is non-blocking.

Fix (mechanical), hooks/worktree-location.mjs `stripHeredocs`. Exact current code (:146, then :151-152):
```js
    out.push(stripComment(line, quoteState));
```
```js
    const ps = /@(['"])$/.exec(line.trimEnd());
    if (ps) {
```
Replacements:
```js
    const lineState = { quote: quoteState.quote }; // the quote state this line starts in
    out.push(stripComment(line, quoteState));
```
```js
    // `@'` opens a here-string only as a token start, outside a quote and a comment.
    const tEnd = line.trimEnd();
    const ps = /(?:^|[\s=(,;|&+])@(['"])$/.exec(tEnd);
    const pre = ps ? tEnd.slice(0, -2) : '';
    if (ps && stripComment(pre, lineState) === pre && lineState.quote === null) {
```
The body of the `if` (the `pending` set, the rewrite to `''` and the reset) stays as it is.

Test: in hooks/worktree-location.test.mjs, right after the here-string loop added in ea919e4c (just before the `});` that closes the "prose about the command" test), add:
```js
  // A line that merely ends in @' or @" is not a here-string opener, and a quote in a comment
  // after the terminator does not leak into the next line.
  for (const [cmd, leaf] of [
    ["Write-Host 'mail me@'\ngit worktree add ../ps-at", 'ps-at'],
    ['git commit -m "ping me@"\ngit worktree add ../at-dq', 'at-dq'],
    ["git status # see @'\ngit worktree add ../cmt-at", 'cmt-at'],
    ["@'\nbody\n'@ # it's done\ngit worktree add ../tail-comment", 'tail-comment'],
  ]) {
    assert.equal(decide(BASH(cmd, repo, 'PowerShell'), ctxFor(home)).text, r4Text(repo, leaf), cmd);
  }
```
Predicted outcome, which I checked by applying both patches to the scratch copy:
- worktree-location.test.mjs plus agent-dispatch-guard.test.mjs give `pass 135, fail 0`.
- With HEAD's code and the new test, the result is `fail 1` (on `ps-at`).
- In my probe set, only the four lines above change, each to a DENY that names `<repo>/.claude/worktrees/<leaf>`. Every r3-1 case, the prose `'@ | Set-Content` case, `$m=@'`, `(@'` and the bash heredoc keep their HEAD result.

### 2. MINOR (test gap in the delta): `quoteState.quote = null` at hooks/worktree-location.mjs:155 is load-bearing but unpinned

Evidence: I deleted only that line on the scratch copy and ran `node --test hooks/worktree-location.test.mjs`: `pass 15, fail 0`. Yet the same mutation turns `@'\nbody\n'@ # it's done\ngit worktree add ../tail-comment` (PowerShell) from DENY into allow. The opener's `'` stays open across the dropped body. The `#` on the terminator tail is then read as inside a quote, so it is not cut, and the comment's apostrophe leaves `scanCommand` with an open quote over the next line.

Fix: the fourth case (`tail-comment`) in MINOR 1's test block pins it. On the scratch copy, the patched code without the reset line gives `fail 1`, and with it `pass`. If MINOR 1's code change is not taken, add only that one case. At HEAD it already passes, and it fails under the mutation.

## Verified absences in the delta
- The opener rewrite `replace(/@(['"])\s*$/, '$1$1')` only acts on the comment-stripped output line. When a comment removed the `@'`, the rewrite does nothing and the line keeps no dangling quote, so it cannot corrupt a line it was not meant for.
- Any text before the opener on its line (for example `git commit -m @'`) is still scanned. The commit-message display rule still treats that `git commit` segment as prose, and the separate git line after the terminator is judged on its own.
- The terminator test `t.startsWith(pending.term)` after `trim()` also accepts an indented `'@`. In the worst case this ends a body early and scans more text, which errs toward deny and never toward allow.
- Pre-existing residual, not counted: a double-quoted `@"..."@` body (or an unquoted bash `<<EOF` body) that holds `$(git worktree add ../x)` does run, but the guard drops it as prose (`$x = @"\n$(git worktree add ../subexpr)\n"@` -> allow at HEAD and at 1364cdfd). This is the lane's accepted heredoc-as-prose design, and the trigger is contrived.
- My r1 to r3 verified absences for items 2, 3, 4, 5 and 7 stand: the delta does not touch those files, and their tests pass in my gate re-run.

## C4 fields (item 7 is the bug-fix part of this lane; unchanged since r1)
Cause: the janitor's bare `--record` defaulted to the tracked `docs/work/evidence/janitor/` (the old janitor.mjs DEFAULT_RECORD_DIR). Every daily scheduled run therefore appended to the tracked drift.md in each durable checkout, and `git pull --ff-only` refused on Netcup and Hetzner.
Discriminating check: scripts/janitor.test.mjs "lane 65 item 7: the scheduled argv (bare --record, --host, --apply) on a clean fixture repo leaves `git status --porcelain` empty". It fails under the old default and passes at HEAD (it passed in my gate re-run).
Fix location: scripts/janitor.mjs `defaultRecordDir`, `parseFlags(argv, home)` and `main`'s injectable `home`. This delta does not change them.
Simplification: nothing more is needed for item 7. For R4, MINOR 1's fix stays inside `stripHeredocs` and reuses `stripComment` with a copied state, so it adds no second quote tracker.
