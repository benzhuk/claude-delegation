VERDICT: NEEDS_FIXES cea1b7793dfca470b97b69ebaf80761258cab659

# C2 review (lane 36): delete-guard quoted-text exemption

Artifact: wt/lane-closeout-1-C2 at cea1b7793dfca470b97b69ebaf80761258cab659, diffed against base 7b00418621f3b7dc168a2c1aa2f7d3618b1b6d45. I reviewed read-only: the worktree is still clean at that sha, and every probe and mutation ran on copies under `.../scratchpad/lane-closeout/C2-review/r1/`. No deletion command was run or scripted. No command was denied.

## Summary

- The guard now lets real deletes through. The heredoc exemption (`findHeredocSafeSpans`) has many bypasses:
  - 36 command shapes were refused at base and pass at HEAD, measured through `detectDelete` on both versions.
  - I ran 11 of them in real bash, with `echo EXECUTED` in place of the delete. The marker ran in all 11 while the guard passed the delete version.
- The ssh re-parse (`findSshSafeSpans`) adds no legitimate exemption, because base already passed the ssh false-positive shapes. Its only measurable effect is one new bypass.
- Heredoc scanning is quadratic. A large input exceeds the hook's 5-second timeout, and the guard then fails open.
- Verified with no defect:
  - All 116 base tests pass against the new guard.
  - Every "stay refused" shape named in the contract still refuses.
  - Unbalanced quotes and unterminated heredocs fail closed.
  - The reentrancy fix holds, and no shared regex state is left across a recursive call.
  - All eight role files carry the pinned sentence byte for byte, and the identity test catches drift.
- I built a prototype fix on a scratch copy (F1 + F2 + F4 below). It closes all 36 regressions, keeps 139/139 HEAD tests and 116/116 base tests green, and runs linearly: 13 ms on the 320 KB input that takes 12.3 s at HEAD.

## Bug-fix fields

Cause: The heredoc and ssh exemptions trust a regex reading of shell structure, and bash parses these commands differently in many cases, so text that bash executes gets exempted:
- the consumer is any word before `<<` (`\bcat\b`, case-insensitive), not the command word;
- the body runs from the next newline to the first loosely-matched delimiter line;
- redirects and pipes are checked only in the text after the delimiter on the opener line;
- a body with an unquoted delimiter can hold a substitution, and that is not checked;
- the ssh exemption checks whether the remote string is safe, but not what consumes ssh's output.

Discriminating check: `r1/probe.mjs` feeds the same strings to the base and HEAD `detectDelete`. It reports 36 `BYPASS-NEW(regression)` rows: base refuses, HEAD passes. `r1/semantics.mjs` runs 11 of those shapes in real bash with a harmless marker, and the marker executes in all 11.

Fix location: all in `hooks/delete-guard.mjs`:
- `findHeredocSafeSpans` and its helpers: `hooks/delete-guard.mjs:283-338`;
- `findSshSafeSpans`: `:339-374`, plus the union at `:487`;
- `SAFE_CMD_RE`: `:219`;
- the heredoc call site under normalization: `:483-488`.

Simplification:
- Delete `findSshSafeSpans` outright. With it removed, all 139 HEAD tests still pass, the FP3 ssh test included.
- Narrow the heredoc exemption to one strict shape:
  - the consumer is the command word;
  - nothing follows the delimiter on the opener line;
  - there is no substitution context, except `git commit … "$(cat <<'EOF'`;
  - the delimiter is quoted, or the body has no substitution;
  - nothing later in the command runs an interpreter.

## Findings

### F1 — BLOCKER: the heredoc exemption lets real recursive deletes through (36 shapes)

The defect is in `hooks/delete-guard.mjs:283-338`:
- `HEREDOC_OPEN_RE` (`:283`) misreads what counts as a heredoc opener.
- `heredocConsumer` (`:304-310`) looks for the consumer word anywhere in the 200 characters before `<<`, not as the command word.
- The redirect and pipe checks at `:328-329` look only at the rest of the opener line.
- The closing-line regex at `:331` accepts a looser delimiter line than bash does.

Every repro below is refused at base and passes at HEAD. Rows marked **[bash]** were run in real bash with `echo EXECUTED` in place of the delete, and the marker executed.

Write these as failing tests. Each must assert `detectDelete(cmd)` is truthy. Build them with concatenation (`const NL = '\n'; const DEL = 'rm -rf x';`):

| # | Repro (JS expression) | Why bash executes it |
|---|---|---|
| 1 | `'cat > x.sh <<EOF' + NL + DEL + NL + 'EOF' + NL + 'bash x.sh'` **[bash]** | The redirect comes before `<<`, so the trailer-only `>` check misses it. This is the pinned regression with the words reordered. |
| 2 | `"cat >x.sh <<'EOF'" + NL + DEL + NL + 'EOF' + NL + 'bash x.sh'` | Same as 1. |
| 3 | `'tee x.sh <<EOF' + NL + DEL + NL + 'EOF' + NL + 'bash x.sh'` | tee writes a file, and the same command then runs it. |
| 4 | `'tee x.sh <<EOF >/dev/null' + NL + DEL + NL + 'EOF' + NL + 'sh x.sh'` | Same as 3. |
| 5 | `'cat <<EOF |& bash' + NL + DEL + NL + 'EOF'` **[bash]** | `PIPE_STAGE_SHELL_RE` (`:240`) does not allow the `&` of `|&`. |
| 6 | `'cat <<EOF | timeout 5 bash' + NL + DEL + NL + 'EOF'` | Wrappers are not recognized in a pipe stage. The same happens with `command bash` and `nohup sh`. |
| 7 | `'cat <<EOF |' + NL + DEL + NL + 'EOF' + NL + 'bash'` **[bash]** | The pipeline continues after the body, and the trailer holds only `|`. |
| 8 | `'bash <(cat <<EOF' + NL + DEL + NL + 'EOF' + NL + ')'` | Process substitution feeds the body to bash. |
| 9 | `"bash -c \"$(cat <<'EOF'" + NL + DEL + NL + 'EOF' + NL + ')"'` **[bash]** | The substitution's output is executed. |
| 10 | `'eval "$(cat <<EOF' + NL + DEL + NL + 'EOF' + NL + ')"'` | Same as 9. A bare `$(cat <<EOF … )` used as a command, and `source <(cat <<EOF …)`, behave the same way. |
| 11 | `'bash -s cat <<EOF' + NL + DEL + NL + 'EOF'` | The word `cat` is an argument to bash, and bash reads stdin (`sh -s -- tee <<EOF` is the same). |
| 12 | `'CAT=1 bash <<EOF' + NL + DEL + NL + 'EOF'` | The consumer regex is case-insensitive and word-anywhere. |
| 13 | `'echo cat & bash <<EOF' + NL + DEL + NL + 'EOF'` | A single `&` is not a separator in `CMD_SEP_RE` (`:284`). |
| 14 | `'tee >(bash) <<EOF' + NL + DEL + NL + 'EOF'` | tee writes into a process substitution that runs bash. |
| 15 | `'cat <<EOF' + NL + '$(' + DEL + ')' + NL + 'EOF'` **[bash]** | With an unquoted delimiter, the body undergoes command substitution. Same for `tee report.md <<EOF`, `note-send <<EOF` and `git commit -F - <<EOF`. |
| 16 | `'cat <<EOF' + NL + 'a `' + DEL + '` b' + NL + 'EOF'` **[bash]** | Backtick substitution in an unquoted-delimiter body. |
| 17 | `'bash <<A; cat <<B' + NL + DEL + NL + 'A' + NL + 'hello' + NL + 'B'` **[bash]** | Bodies stack in order, so the span found for B covers A's body, which bash executes. |
| 18 | `'cat <<E"OF"' + NL + 'hi' + NL + 'EOF' + NL + DEL + NL + 'E'` **[bash]** | The guard reads the delimiter as `E`, bash reads `EOF`, and the delete lands between them. |
| 19 | `'cat <<<"x"' + NL + DEL + NL + 'x'` **[bash]** | A here-string is misread as a heredoc with delimiter `x`. `cat <<<EOF` behaves the same. |
| 20 | `'grep -n "cat <<EOF" x.md' + NL + DEL + NL + 'cat <<EOF' + NL + 'report' + NL + 'EOF'` **[bash]** | A `<<` inside quotes is not an operator, but its "body" gets exempted. This is a realistic grep-then-work multi-line call. |
| 21 | `'# write it with cat <<EOF' + NL + DEL + NL + 'cat <<EOF' + NL + 'x' + NL + 'EOF'` | Same as 20, with the `<<` in a comment. |
| 22 | `"cat <<'EOF'" + NL + 'x \\' + NL + 'EOF' + NL + DEL + NL + 'EOF'` **[bash]** | Normalization (`:483`) joins `x \⏎EOF` into one line. With a quoted delimiter, bash ends the heredoc at that first `EOF`. |
| 23 | `'cat $((1<<x))' + NL + DEL + NL + 'x'` | An arithmetic shift is read as a heredoc. |
| 24 | `'ssh host "sh -s" cat <<EOF' + NL + DEL + NL + 'EOF'` | The remote `sh -s` executes stdin. |

Fix (judgment, but prototyped and verified): replace `findHeredocSafeSpans` and its helpers with the version below.
- Gate the call site on normalization: `...(normalized === command ? findHeredocSafeSpans(normalized) : []),` in place of `...findHeredocSafeSpans(normalized),` at `:486`. A continuation line inside a body means fail closed.
- The rules this code enforces:
  - The opener is not `<<<` and not an arithmetic shift, and the delimiter ends at a shell word boundary.
  - The closing delimiter is matched exactly as bash does: exact for `<<`, leading tabs only for `<<-`.
  - The scan skips past every body, so openers inside a body and a second opener on the same line are never exempted. This also makes the scan linear (see F3).
  - The trailer (the rest of the opener line) must be empty.
  - An opener inside quotes or a `#` comment is not exempted.
  - The consumer must be the command word, case-sensitive (`cat` with no `>` anywhere, `tee` with no `>(`/`<(`, `note-send`, or `git [global opts] commit`).
  - Inside `(` or a backtick, the only exempt shape is `git commit … "$(cat <<'EOF'`.
  - A body with an unquoted delimiter that contains `$(` or a backtick is not exempted.
  - Nothing after the closing line may run an interpreter or source a file.

```js
const HEREDOC_OPEN_RE = /(?<![<\w$)])<<(-?)[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2(?=[\s;&|<>)]|$)/g;
const EXEC_AFTER_RE = /(?:^|[\s;&|(`])(?:sh|bash|zsh|dash|ksh|fish|source|eval|exec|xargs|pwsh|powershell|python\d*(?:\.\d+)?|node|perl|ruby)(?:\.exe)?(?=[\s;&|)`]|$)|(?:^|[\s;&|])\.{1,2}\/|(?:^|[\s;&|])\.[ \t]/i;

function openerQuotedOrCommented(command, idx) {
  const lineStart = command.lastIndexOf('\n', idx - 1) + 1;
  let q = null;
  for (let i = lineStart; i < idx; i += 1) {
    const c = command[i];
    if (q === "'") { if (c === "'") q = null; continue; }
    if (q === '"') {
      if (c === '\\') { i += 1; continue; }
      if (c === '"') { q = null; continue; }
      if (c === '$' && command[i + 1] === '(') { q = null; i += 1; }
      continue;
    }
    if (c === '\\') { i += 1; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '#' && (i === lineStart || /\s/.test(command[i - 1]))) return true;
  }
  return q !== null;
}

function subCommandBefore(command, idx) {
  let i = idx - 1;
  const floor = Math.max(0, idx - 300);
  for (; i >= floor; i -= 1) {
    const c = command[i];
    if (c === ';' || c === '&' || c === '|' || c === '\n' || c === '(' || c === '`') break;
  }
  if (i < floor && floor > 0) return null; // too long to judge: fail closed
  return { text: command.slice(i + 1, idx), boundary: i >= 0 ? command[i] : '', boundaryIdx: i };
}

const GIT_COMMIT_START_RE = new RegExp('^' + GIT_PREFIX.replace(/^\\b/, '') + 'commit\\b');

function heredocConsumer(command, idx) {
  const sub = subCommandBefore(command, idx);
  if (!sub) return null;
  const text = sub.text.trimStart();
  let consumer = null;
  if (/^cat(?=\s|$)/.test(text) && !/>/.test(text)) consumer = 'cat';
  else if (/^tee(?=\s|$)/.test(text) && !/[<>]\(/.test(text)) consumer = 'tee';
  else if (/^note-send(?=\s|$)/.test(text)) consumer = 'note-send';
  else if (GIT_COMMIT_START_RE.test(text)) consumer = 'git-commit';
  if (!consumer) return null;
  if (sub.boundary === '`') return null;
  if (sub.boundary === '(') {
    if (command[sub.boundaryIdx - 1] !== '$') return null;
    const outer = subCommandBefore(command, sub.boundaryIdx - 1);
    if (!outer || !GIT_COMMIT_START_RE.test(outer.text.trimStart())) return null;
  }
  return consumer;
}

function findHeredocSafeSpans(command) {
  const spans = [];
  const unterminated = new Set();
  HEREDOC_OPEN_RE.lastIndex = 0;
  let m;
  while ((m = HEREDOC_OPEN_RE.exec(command))) {
    const [, dash, quote, delim] = m;
    const openEnd = HEREDOC_OPEN_RE.lastIndex;
    const nl = command.indexOf('\n', openEnd);
    if (nl === -1) break;
    if (unterminated.has(delim)) continue;
    const closeRe = new RegExp(`^${dash ? '\\t*' : ''}${delim}$`, 'gm');
    closeRe.lastIndex = nl + 1;
    const close = closeRe.exec(command);
    if (!close) { unterminated.add(delim); continue; }
    const bodyStart = nl + 1;
    const bodyEnd = close.index;
    HEREDOC_OPEN_RE.lastIndex = close.index + close[0].length; // never rescan inside a body
    if (!/^\s*$/.test(command.slice(openEnd, nl))) continue;
    if (openerQuotedOrCommented(command, m.index)) continue;
    if (!heredocConsumer(command, m.index)) continue;
    if (!quote && /\$\(|`/.test(command.slice(bodyStart, bodyEnd))) continue;
    if (EXEC_AFTER_RE.test(command.slice(close.index + close[0].length))) continue;
    spans.push([bodyStart, bodyEnd]);
  }
  return spans;
}
```

In the scratch prototype, the git-commit regex was built inline rather than hoisted to `GIT_COMMIT_START_RE`; the behaviour is the same. With this fix, F2's removal and F4's patch applied to a scratch copy:
- the probe shows 0 `BYPASS-NEW` rows;
- the HEAD test file passes 139/139, and the base test file passes 116/116;
- all six exempt heredoc and ssh tests at `hooks/delete-guard.test.mjs:502-538` stay green;
- `cat <<-EOF` with a tab-indented terminator now passes, where HEAD refuses it.

Two cheap false refusals are accepted:
- a `tee report.md <<'EOF' … EOF` followed in the same call by any `bash …`;
- a heredoc body containing a line that ends in a backslash.

Lead call (the contract is silent on it): the prototype refuses `cat > report.md <<'EOF'`, the same as HEAD refuses `cat <<EOF > f`. If the lead wants cat-to-file to be exempt like tee, the change is:
- drop `&& !/>/.test(text)` for `cat`;
- let the trailer be `^\s*(?:>{1,2}\s*\S+\s*)?$`.

`EXEC_AFTER_RE` still refuses the pinned regression at `hooks/delete-guard.test.mjs:589`, because `bash script.sh` follows.

A probe note: the case "cat <<EOF / hello EOF / two spaces then EOF / delete / EOF" is not a bypass in the prototype. Bash treats the indented `EOF` as body data, so the delete there is inert.

### F2 — MAJOR: `findSshSafeSpans` exempts a delete that the local shell runs, and adds no legitimate exemption

The code is at `hooks/delete-guard.mjs:351-374`, with the union at `:487`.

Repros, refused at base and passing at HEAD:
- `"ssh host \"echo '" + DEL + "'\" | sh"`
- `"ssh host \"printf '" + DEL + "'\" | bash"`

The remote echo prints the delete, and the local `sh` runs it. The ssh span exempts the whole remote string without checking what consumes ssh's output. Base refused both, through `pipesToShell` on echo's window.

Measured at base 7b00418, `detectDelete` returns null for all of these:
- `ssh host "grep -n 'rm -rf' file"` (FP3);
- `ssh host 'grep -n "rm -rf" file'`;
- `ssh host "cat f | grep 'rm -rf'"`;
- `ssh host "cd x && grep -n 'rm -rf' f"`.

The existing grep and echo quoted-span exemption already covers them. The builder's shape table marks the first two as "**refused**" before this change, which is wrong.

Mutation check: I deleted the `...findSshSafeSpans(normalized),` line on a scratch copy, and the HEAD test file still passes 139/139. The function is dead weight apart from the bypass, and its recursion is the reason the reentrancy hazard exists at all.

Fix (mechanical): delete lines `:339-374`, the comment block and `findSshSafeSpans`. Then:
- delete line `:487`, `    ...findSshSafeSpans(normalized),`;
- rewrite the header paragraph at `:83-88` to say that the quoted ssh remote grep is exempt through the existing safe-command quoted-span rule;
- keep all the ssh tests;
- add the two repros above as stay-refused tests.

Predicted result: the ssh tests stay green, both repros refuse (verified on scratch), and the reentrancy concern disappears.

### F3 — MAJOR: heredoc scanning is quadratic, and large input fails open past the 5-second hook timeout

The code is at `hooks/delete-guard.mjs:312-338`. For every opener it calls `command.indexOf('\n', …)` and `closeRe.exec(command.slice(bodyStart))`, which is O(n) per opener. Unterminated openers get no memo.

The hook's timeout is 5 s (`hooks/hooks.json:105`), and on a timeout the guard fails open.

Measured, with the delete at the end of each input:

| Input | HEAD | Base |
|---|---|---|
| `('cat <<A' + NL).repeat(20000) + DEL` | 3.1 s | 1 ms |
| `('cat <<A' + NL).repeat(40000) + DEL`, 320 KB | 12.3 s | — |
| `tee x.cpp <<'EOF'` with 40,000 `cat << foo;` body lines, 480 KB | 6.8 s | — |

At 12.3 s the hook is killed, so the delete at the end passes.

Fix: the F1 prototype is linear. It skips past each body, and it memoizes a delimiter that has no terminator. It measured 13 ms on the 320 KB input and 4 ms on the 480 KB one. Add a test that runs `('cat <<A' + NL).repeat(40000) + DEL`, asserts under 1000 ms, and asserts a refusal.

### F4 — MINOR: adding `rg` widens the "safe word anywhere" hole

The line is `hooks/delete-guard.mjs:219`. Repros, refused at base and passing at HEAD:
- `"sudo -u rg sh -c '" + DEL + "'"`
- `"/opt/rg/bin/sh -c '" + DEL + "'"`

`\brg\b` matches a user name or a path segment, and the quoted executor argument then counts as a safe span. The same class existed at base for the other words, for example `FOO=echo sh -c '…'`.

Fix, mechanical: restrict the safe word to command position.
- old: `const SAFE_CMD_RE = /\b(?:grep|rg|echo|printf|git\s+commit\s+-m|note-send\s+--text)\b/gi;`
- new: `const SAFE_CMD_RE = /(?<=(?:^|[;&|\n(\`"'])\s*)(?:grep|rg|echo|printf|git\s+commit\s+-m|note-send\s+--text)\b/gi;`

The backtick inside the character class needs no escape in the file itself; it is escaped here only because of the Markdown code span.

Verified on scratch together with F1 and F2: HEAD tests pass 139/139 and base tests pass 116/116.
- Both repros refuse.
- It also closes two base-era bypasses: `FOO=echo sh -c '…'` and `ssh host echo '$(…)'`.
- Cost: `sudo grep "…"` and `find … -exec grep "…"` now false-refuse, which is cheap.

### F5 — MINOR: the reentrancy regression pin hangs the suite instead of failing

The test is at `hooks/delete-guard.test.mjs:610-616`. On a scratch copy I swapped the local `sshRe` for a shared module-level regex. The test file then hung, `node --test --test-timeout=10000` could not stop the synchronous loop, and `timeout 90` killed it (exit 143). No process was left behind.

A regression here stalls CI instead of failing it. If F2 lands this is moot. If `findSshSafeSpans` is kept, run that test through `spawnSync(process.execPath, [...], { timeout: 5000 })` and assert that the child exited normally.

### F6 — MINOR (doc): the header dropped the cross-call residual limit

At `hooks/delete-guard.mjs:68-102`, the base header said that nothing here follows a script file written by one call into a later call that executes it. That limit still applies, and it is now broader, because `tee` to a file is exempt by ruling. Restore one sentence saying this:
- a heredoc written to a file by `tee` (or by `cat`, if the lead extends F1) and executed by a later, separate tool call is not seen;
- only same-call execution after the body is refused.

### F7 — INFO: bypasses that existed at base (not regressions, lead's call whether to fold in)

These were measured to pass at both base and HEAD. They sit in the attack surface the brief named, so they are listed here for a follow-up.
- `&` is not a separator in `SEP_RE` (`:140`):
  - `"echo x & bash -c '" + DEL + "'"`
  - `"echo hi & 'rm' -rf x"`
- Unquoted substitution or process substitution around a safe command:
  - `"echo $(sh -c '" + DEL + "')"`
  - `"$(echo '" + DEL + "')"`
  - `"bash -c \"$(echo '" + DEL + "')\""`
  - `"bash <(echo '" + DEL + "')"`
  - `"echo '" + DEL + "' > >(bash)"`
  - `"note-send --text $(sh -c '" + DEL + "')"`
  - `"$(ssh host \"echo '" + DEL + "'\")"`
  - `"Invoke-Expression (echo 'Remove-Item -Recurse d')"`
- Pipe stages (`:240`), for which a mechanical fix is given below:
  - `"echo '" + DEL + "' |& bash"`
  - `"echo '" + DEL + "' | timeout 5 sh"`
- A file written, then executed:
  - `"echo '" + DEL + "' | tee x.sh; bash x.sh"`
- Unquoted ssh remote, re-parsed remotely:
  - `'ssh host echo "a & ' + DEL + '"'`

Mechanical fix for the pipe stages: at `:240`, change the start of the pattern so it admits `|&` and common wrappers.
- old: `const PIPE_STAGE_SHELL_RE = /^\s*(?:sudo`
- new: `const PIPE_STAGE_SHELL_RE = /^&?\s*(?:(?:timeout\s+\S+|nohup|command|exec|nice|stdbuf\s+\S+|doas)\s+)*(?:sudo`

The rest of the line stays unchanged. Each wrapper token is unambiguous, so no backtracking blow-up is introduced. This is predicted to close both pipe-stage repros; it was not run.

## Verified absent (first-class findings)

- **Base shapes still refused.** I ran base `hooks/delete-guard.test.mjs` unchanged against the HEAD guard on a scratch copy: 116/116 pass.
- **The contract's stay-refused list.** Every item refuses at HEAD:
  - `bash -c`, `sh -c`, `zsh -c`, `eval "…"`;
  - `ssh host "…"` and `ssh host '…'`, including `ssh host bash -c "'…'"`, `ssh -o X=y host "…"` and `ssh -o "X=y" host "…"`;
  - `ssh host <<EOF`, `bash <<EOF`, `sh -s <<EOF`;
  - `pwsh -Command "Remove-Item -Recurse …"`, `echo '…' | iex`;
  - `xargs rm -rf`, `find … -exec rm -rf {} \;`, `find -exec sh -c '…'`, `find -delete`;
  - `sudo`, `env`, `command`, `nohup` and `timeout` in front of `bash -c` or `sh -c`;
  - `git -C x clean -fdx` inside `bash -c` or `sh -c`;
  - `note-send --text "$(…)"`;
  - `echo "$(…)"` and `` echo "`…`" ``.
  - `node -e` and `python -c` are not matched at base either, which matches the file's documented limit.
- **Chains.** `grep 'x' f; DEL`, `echo "a" && DEL`, `||`, newline and `echo "a" & DEL` all refuse.
- **Unbalanced or unparseable input.**
  - `echo "DEL` refuses.
  - `ssh host "DEL` refuses.
  - A heredoc with no closing line refuses.
- **Reentrancy.** No shared regex's `lastIndex` is iterated across a recursive `detectDelete` call:
  - The loops over `SAFE_CMD_RE`, `HEREDOC_OPEN_RE` and `CMD_SEP_RE` never recurse.
  - `QUOTE_SPAN_RE` is exec'd once in `findSshSafeSpans` before the recursive call, and its result is captured first.
  - The builder's local `sshRe` is the correct fix. The mutation check confirms that a shared regex hangs.
- **Performance of the ssh path.** 40,000 repeated ssh-grep segments (760 KB) take 576 ms, against about 200 ms at base, which is linear.
- **Eight role files.** On a node-only scratch copy:
  - Each of the eight files holds exactly one line byte-equal to `- ` + the pinned sentence, and it matches contracts.md.
  - Mutations of one file at a time: dropping the final period, a curly apostrophe, and a doubled space each fail the identity test in all 8 files (24/24).
  - Gluing the sentence onto a non-blank previous line fails it too (builder.md, codex runner.toml).
  - The same glue mutation "passed" in 6 files, but only because the preceding line there is blank. The result is still the sentence on its own line, and the test strips the leading `- ` and whitespace by design.
  - After restoring, the test passes.
- **docs/subagent-contract.md.** The new section carries all four required points:
  - the directory is `<scratch root>/<lead session id>/<lane>/`;
  - the lead creates it and names it in the brief;
  - `close --closeout` removes it;
  - agents never delete.

## Scratch artifacts

Everything is under `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C2-review/r1/`, left in place for the lead's closeout.
- `probe.mjs`: the base-vs-HEAD matrix.
- `semantics.mjs`: the real-bash marker runs. It also left `s.sh` there, a file holding one `echo` line.
- `perf.mjs` and `perf3.mjs`: the timing runs.
- `agents-mut.mjs`: the role-file mutation check, with `agents-copy/` holding the copied files.
- `heredoc-proto.mjs.txt`: the F1 prototype.
- `mut*/`: the scratch guard copies used for the mutation checks and the prototype.
