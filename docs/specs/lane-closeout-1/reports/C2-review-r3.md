VERDICT: NEEDS_FIXES 610d0cb80c821aba7f3a174542dcc7acf25bf9a0

# C2 review, round 3 (lane 36): delete-guard heredoc exemption at 610d0cb

Artifact: wt/lane-closeout-1-C2 at 610d0cb80c821aba7f3a174542dcc7acf25bf9a0, diffed against base 7b00418621f3b7dc168a2c1aa2f7d3618b1b6d45.

How I reviewed:
- Read-only. The worktree is still clean at 610d0cb, and `git status --short` prints nothing.
- No command was denied.
- I wrote no delete-shaped string and ran none. Every bypass below was shown with a harmless marker line, `echo MARKER_$((6*7))`. If bash executes that line, it prints `MARKER_42`; the literal text contains no `42`.
- For each shape I checked two things on a scratch copy of the guard, with `findHeredocSafeSpans` exported:
  1. whether the heredoc exempt span covers the marker line;
  2. whether real bash (GNU bash 5.2.21) executes it.
- Every detector skips a verb whose start index lies inside a safe span (`isExcluded(safeSpans, m.index)` at `hooks/delete-guard.mjs:373, 388, 399, 410, 425, 438, 447`). So any recursive-delete verb placed on a covered line passes the guard.

## Summary

- R1 conditions 1 and 4 are enforced.
- Condition 3 is enforced only as the guard reads line 1, and bash reads line 1 differently in three ways (N2, N4).
- Condition 2 has no code at all (N3).
- Condition 5 checks one literal token, not the file bash writes (N5).
- Measured: 9 command shapes make the exemption cover a line that bash executes, and 4 shapes write a `.sh` file while exempt.
- The 106-case harness shows no new bypass because none of its cases pairs an exempt head shape with a hostile line 1 or body. That output is correct, but it does not cover these classes.
- A narrowing patch, verified on a scratch copy, closes all 13 shapes:
  - all 13 turn from `EXEMPT` to `checked`;
  - `hooks/delete-guard.test.mjs` passes 187/187 against it;
  - the spec's report shape (`cat > report.md <<'EOF'`) stays exempt.
- Verified with no defect:
  - no shared `lastIndex` state;
  - linear time on long input;
  - F1, F2 and F4 all refuse in the saved probe;
  - the eight role files and their identity test are correct.

## Bug-fix fields

Cause: `findHeredocSafeSpans` decides what is "outside the body" with JS regex classes (`\S+`, `\s`) on the normalized string. Bash splits words and lines differently in four ways:
- a quote or `#` inside a `\S+` target or argument;
- a second `<<` glued onto a `\S+` target;
- JS `\s` accepting characters that bash treats as part of the delimiter word;
- `detectDelete` joining backslash-newline and backtick-newline pairs before the scan, which bash never does inside a quoted-delimiter body.

In each case the exempt span ends up covering lines that bash parses as commands.

Discriminating check: `scratchpad/lane-closeout/C2-review/r3/probe-r3.mjs` (paths below).
- Against 610d0cb it prints `EXEMPT  bash-ran=YES` for 9 shapes and `EXEMPT  bash-wrote-*.sh=YES` for 4.
- Against the patched copy (`probe-r3-fixed2.mjs`), all 13 print `checked`.
- The control row, `cat > report.md <<'EOF'`, prints `EXEMPT  bash-ran=no` on both.

Fix location: all of it is in `hooks/delete-guard.mjs`:
- the shape regexes, `:306-309`;
- `findHeredocSafeSpans`, `:326`, `:332` and `:351`;
- the call site in `detectDelete`, `:477`.

Simplification: accept only plain words on line 1. Targets and arguments come from the charset `[A-Za-z0-9_./~+:-]` and are separated by `[ \t]` only, so no quote, `#`, `\`, `$`, `<`, `>`, glob character or non-blank whitespace can reach the shape regexes. Then:
- add one condition-2 line: exactly one `<<`;
- allow exactly one `cat` redirect;
- parse the heredoc on the raw string rather than the normalized one.

Every change only narrows the exemption, so the saved probe can only move toward refusal.

## Answers to the five questions

### 1. Does `findHeredocSafeSpans` enforce the five R1 conditions?

| R1 condition | Where | Verdict |
|---|---|---|
| 1. Quoted delimiter, no `<<-` | `:306-309`: `<<(['"])…\3` (or `\2`, `\1`). A quote must follow `<<` directly, so `<<-` and unquoted delimiters never match. | Enforced. |
| 2. Exactly one heredoc | No line. `(\S+)` at `:306`/`:307` and `(?:\s+\S+)*` at `:308` accept a second `<<A` glued to the target. | **Not enforced (N3).** |
| 3. The command is the entire input apart from the body | `:315` + `:326` (line-1 disqualifiers), `:306-309` (`^…$`), `:362-363` (whitespace-only trailer) | **Only as the guard reads it.** It is defeated by quotes and `#` in line 1 and by non-bash whitespace (N2), and by normalization (N4). |
| 4. The command is one of the four shapes | `:306-309`, `:331-348` | Enforced as regexes. But a leading `#` in the `tee`/`note-send` argument turns the heredoc into a comment (N2). |
| 5. No script suffix on the target | `:320`, `:337`, `:341`, `:351` | **Partial (N5).** Only one of two `cat` redirects is checked, and quoted targets escape the check. |

Can text outside a heredoc body get exempted? Yes, through the four classes in N2-N4, all measured.

Shared mutable regex state: none remains.
- The new regexes at `:306-309`, `:315` and `:320` are non-global.
- `closeRe` (`:355`) is built fresh on every call and is also non-global.
- `SAFE_CMD_RE` is reset at `:272` and `QUOTE_SPAN_RE` at `:279`.
- The ssh re-parse is gone, so no recursive `detectDelete` call remains.

### 2. The saved probe output (`reports/C2-r3-probe-out.txt`)

- Every F1 repro refuses: all 24, plus the wrapper and pipe variants, are `ok base=refuse new=refuse`.
- Both F2 repros (`ssh … "echo '…'" | sh` and `… printf … | bash`) refuse.
- Both F4 repros (`sudo -u rg …` and `/opt/rg/bin/sh …`) refuse.
- Exactly one row goes from refuse at base to pass at HEAD: `tee report.md <<'EOF'`, which is the spec's first false-positive shape.
- FP2 and FP3 pass at both base and HEAD.
- Three rows moved from pass to refuse, which is an improvement: `FOO=echo sh -c`, `ssh host echo '$(…)'` and `ssh host echo "a & …"`.
- The 14 `BYPASS(pre-existing)` rows are F7, which is out of scope.
- The 3 `FALSE-REFUSAL` rows are refused by design under R1.

`reports/C2-r3-suffix-out.txt`: all 24 rows are as R1 requires.
- 18 refuse: `.sh`, `.py`, `.mjs`, `.SH`, `.ps1` and `.md.sh`, each in all three head shapes.
- 6 pass: `report.md` and `x.txt`, each in all three head shapes.

Coverage caveat: the harness only varies the command around the heredoc (pipes, `;`, `$( )`, unquoted delimiters, bare `cat`). No case combines an exempt head shape (`cat > f <<'EOF'`, `tee f <<'EOF'`, `note-send … <<'EOF'`) with a hostile line 1 or body.

Case #22 in the harness (backslash-newline in the body) uses bare `cat <<'EOF'`. It refuses only because bare `cat` is no longer an exempt shape, and the same shape with `cat > f` passes (N4). The test at `hooks/delete-guard.test.mjs:694` has the same blind spot.

### 3. Territory tests

`node --test hooks/delete-guard.test.mjs agents/agents.test.mjs`, run in the worktree at 610d0cb:

```
ℹ tests 212
ℹ pass 212
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

The full gate (`reports/C2-r3-gate.log:2835-2840`): `tests 2661`, `pass 2655`, `fail 1`, `skipped 5`. The one failure is the pre-existing docs/GOALS.md STALE test.

### 4. The pinned scratch sentence

- I took the sentence from contracts.md (the `> ` line) and ran `grep -cF` on each of the eight files. The count is `1` in every file:
  - `agents/builder.md:28`
  - `agents/integrator.md:28`
  - `agents/reviewer.md:29`
  - `agents/runner.md:30`
  - `codex/agents/builder.toml:10`
  - `codex/agents/integrator.toml:11`
  - `codex/agents/reviewer.toml:12`
  - `codex/agents/runner.toml:40`
- The sha256 of each matching line is identical (`e46356ce5748350c…`).
- `agents/agents.test.mjs:150-172` asserts the exact sentence as one whole line in all eight files, with `- ` stripped, and asserts that there are exactly eight files.

No defect.

### 5. Other points: see N2-N6 and the verified-absent section.

## Findings

Scratch root: `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C2-review/r3/`.

In the rows below:
- `NL` is a newline;
- `MK` is the harmless marker line;
- `<V>` is where a builder's regression test puts its `DEL` constant.

### N2: BLOCKER. Line 1 is split with JS `\S`/`\s`, not bash words, so quotes, `#` and non-blank whitespace move the real heredoc boundary

The code is at `hooks/delete-guard.mjs:306-308`:
- `(\S+)` targets;
- `(?:\s+\S+)*` note-send arguments;
- `\s*$` after the delimiter.

Measured with `probe-r3.mjs`. Every row is `EXEMPT` (the span covers the marker) with `bash-ran=YES` (bash executed it):

| Shape (JS expression) | What bash does |
|---|---|
| `'cat > "c3 <<\'EOF\'' + NL + '"' + NL + <V> + NL + 'EOF'` | The `"` in the target opens a string that swallows `<<'EOF'`. The `"` on body line 1 closes it, and the next line is a command. |
| `"cat > 'c4 <<'EOF'" + NL + "'" + NL + <V> + NL + 'EOF'` | Same, with single quotes. |
| `"tee #c <<'EOF'" + NL + <V> + NL + 'EOF'` | `#` starts a comment, so there is no heredoc. `tee` reads the empty stdin, and every body line runs. `note-send #x <<'EOF'` matches `:308` the same way. It was span-checked only, not run, because no note may be sent. |
| `"cat > c8.txt <<'EOF' " + NL + 'EOF ' + NL + <V> + NL + 'EOF'` | NBSP is part of the bash delimiter word (`EOF<NBSP>`), so bash closes on body line 1. JS `\s` ate the NBSP, so the guard closes on the last line. |
| the same with `\f` in place of ` ` | Same. `\v`, `﻿` and the Unicode `Zs` spaces behave the same way. |

Fix (mechanical). Replace `:306-309`.

Current:
```js
const CAT_LINE_RE = /^\s*cat(?:\s+(>{1,2})\s*(\S+))?\s+<<(['"])([A-Za-z_][A-Za-z0-9_]*)\3(?:\s+(>{1,2})\s*(\S+))?\s*$/;
const TEE_LINE_RE = /^\s*tee(?:\s+-a)?\s+(\S+)\s+<<(['"])([A-Za-z_][A-Za-z0-9_]*)\2\s*$/;
const NOTE_SEND_LINE_RE = /^\s*note-send(?:\s+\S+)*\s+<<(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*$/;
const GIT_COMMIT_F_LINE_RE = /^\s*git\s+commit\s+-F\s+-\s+<<(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*$/;
```
Replacement:
```js
const CAT_LINE_RE = /^[ \t]*cat(?:[ \t]+(>{1,2})[ \t]*([A-Za-z0-9_./~+:-]+))?[ \t]+<<(['"])([A-Za-z_][A-Za-z0-9_]*)\3(?:[ \t]+(>{1,2})[ \t]*([A-Za-z0-9_./~+:-]+))?[ \t]*$/;
const TEE_LINE_RE = /^[ \t]*tee(?:[ \t]+-a)?[ \t]+([A-Za-z0-9_./~+:-]+)[ \t]+<<(['"])([A-Za-z_][A-Za-z0-9_]*)\2[ \t]*$/;
const NOTE_SEND_LINE_RE = /^[ \t]*note-send(?:[ \t]+[A-Za-z0-9_./~+:-]+)*[ \t]+<<(['"])([A-Za-z_][A-Za-z0-9_]*)\1[ \t]*$/;
const GIT_COMMIT_F_LINE_RE = /^[ \t]*git[ \t]+commit[ \t]+-F[ \t]+-[ \t]+<<(['"])([A-Za-z_][A-Za-z0-9_]*)\1[ \t]*$/;
```

What the replacement does:
- `[ \t]` is exactly bash's blank set.
- The word charset excludes quotes, `\`, `#`, `$`, `<`, `>`, glob characters, braces and parentheses. `=` is left out on purpose, because zsh expands a word that starts with `=`.
- Each new regex matches a subset of the old one's inputs, and the capture group numbers do not change.
- The words cannot contain blanks, so the note-send repeat cannot backtrack ambiguously. Measured: 160k arguments run in 0-10 ms.

Predicted cost: `note-send --subject "x y" <<'EOF'` and CRLF input now refuse. The only note-send heredoc in the repo is the bare `note-send <<'EOF'`, which still passes.

### N3: BLOCKER. R1 condition 2 (exactly one heredoc) has no code, and a second, unquoted heredoc glued to the target gets its body exempted

The code is at `hooks/delete-guard.mjs:306-308` and `:322-326`. `\S+` swallows `f<<A`, and `HEREDOC_DISQUALIFY_RE` (`:315`) has no `<<` term.

Measured, `EXEMPT` with `bash-ran=YES`:
- `"cat > c1.txt<<A <<'EOF'" + NL + '$(' + <V> + ')' + NL + 'A' + NL + 'x' + NL + 'EOF'`
- the same with `tee c2.txt<<A <<'EOF'`

The mechanism:
- Bash reads the two bodies in order.
- A's body is unquoted, so its `$( )` runs during expansion.
- The guard's span runs from line 2 to the `EOF` line, so it covers A's body.
- `note-send <<A <<'EOF'` has the same shape.

Fix (mechanical). The N2 charset already keeps `<` out of targets. Also give condition 2 its own line after `:326`.

Current:
```js
  if (HEREDOC_DISQUALIFY_RE.test(line1)) return [];
```
Replacement:
```js
  if (HEREDOC_DISQUALIFY_RE.test(line1)) return [];
  if ((line1.match(/<</g) || []).length !== 1) return []; // R1 condition 2: exactly one heredoc
```

### N4: BLOCKER. The exemption is computed on the normalized string, and normalization joins a body line ending in `\` or a backtick onto the closing `EOF` line

This is the twin of round-1 F1 #22, and it is still open for every exempt head shape. The call site is `hooks/delete-guard.mjs:477`, with the normalizer at `:474`.

Measured, `EXEMPT` with `bash-ran=YES`:
- `"cat > c6.txt <<'EOF'" + NL + 'x \\' + NL + 'EOF' + NL + <V> + NL + 'EOF'`
- the same with ``'x `'`` as body line 1

The mechanism:
- With a quoted delimiter, bash does no backslash-newline processing in the body, so it closes on the first `EOF` and runs the next line.
- The normalizer turns `x \⏎EOF` into one line, so the guard closes on the second `EOF`.

`hooks/delete-guard.test.mjs:694` (#22) does not pin this. Its bare `cat <<'EOF'` is refused for the unrelated reason that bare `cat` is no longer exempt.

Fix (verified). Parse the heredoc on the raw string, which has bash's own line structure. After line 1 there is only body, the delimiter and whitespace, so the span can run to the end of the normalized string.

Current (`:475-478`):
```js
  const safeSpans = [
    ...findSafeQuoteSpans(normalized),
    ...findHeredocSafeSpans(normalized),
  ];
```
Replacement:
```js
  const safeSpans = [
    ...findSafeQuoteSpans(normalized),
    // Heredoc structure comes from the RAW string: bash never joins backslash/backtick-newline
    // inside a quoted-delimiter body. After line 1 the raw text is only body, the delimiter
    // line and whitespace, so the span runs to the end of the normalized string; the prefix
    // up to the body must be unchanged by normalization.
    ...findHeredocSafeSpans(command)
      .filter(([s]) => command.slice(0, s) === normalized.slice(0, s))
      .map(([s]) => [s, normalized.length]),
  ];
```

This keeps a markdown report whose lines end in a backtick exempt. Checked: `detectDelete` returns null for a benign `cat > r.md <<'EOF'` with a line ending in a backtick.

A simpler alternative, also verified: `...(normalized === command ? findHeredocSafeSpans(normalized) : []),`. It refuses any heredoc report that has a line ending in `\` or a backtick and also mentions a delete verb. That costs more false refusals in report writing.

### N5: MAJOR. R1 condition 5 checks one literal token, not the file bash writes

The code is at `hooks/delete-guard.mjs:337` (`target = m[2] || m[6]`) and `:351`.

Measured with an inert body, `EXEMPT` with `bash-wrote-*.sh=YES`:

| Shape | What goes wrong |
|---|---|
| `cat > r1.md <<'EOF' > w1.sh` | Only `m[2]` is checked, and bash writes the body to the last redirect, `w1.sh`. |
| `cat > "w2.sh" <<'EOF'` | The token `"w2.sh"` ends in `"`, not `.sh`. |
| `tee 'w3.sh' <<'EOF'` | Same, with single quotes. |
| `cat > w4.s'h' <<'EOF'` | A partly quoted suffix. |

Fix (mechanical):
- The N2 charset removes the quote cases, because quoted targets no longer match any shape.
- R1 names a single redirect ("the redirect before or after the `<<`"), so require exactly one at `:332`.

Current:
```js
  if (m && (m[1] || m[5])) {
```
Replacement:
```js
  if (m && (m[1] ? !m[5] : m[5])) { // exactly one redirect (R1 condition 4); two would hide the real target from condition 5
```

With exactly one redirect, `target = m[2] || m[6]` at `:337` is then the real target.

### N6: MINOR. Tests to add, one per repro

Add each N2-N5 shape to `hooks/delete-guard.test.mjs` with the file's `DEL` constant in place of `<V>`, and assert that `detectDelete` is truthy:
- the 9 execution shapes, plus `note-send #x <<'EOF'` and `note-send <<A <<'EOF'`;
- the 4 condition-5 shapes.

Also add a pass test: `cat > r.md <<'EOF'` whose body has a line ending in a backtick and a quoted delete mention. This pins the N4 raw-parse choice.

Ask the lead to add these shapes to the probe harness as well, so that the next "0 new bypasses" covers them.

### Combined patch: verified on scratch

`fixed2/hooks/delete-guard.mjs` is the 610d0cb copy with the N2, N3, N4 and N5 patches applied:
- `hooks/delete-guard.test.mjs` passes 187/187;
- the `fixed2` probe run prints all 13 hostile rows as `checked` (not exempt);
- the control row, `cat > report.md <<'EOF'`, stays `EXEMPT` and bash does not run it.

Predicted effect on the saved 106-case harness: no row can move from refuse to pass.
- Every change either matches a subset of the old inputs or adds a `return []`.
- The spans at the call site only start later or are dropped; they never start earlier.
- The one intended pass, `tee report.md <<'EOF'`, still matches.

### INFO (the lead's call, not the builder's): gaps in the spec'd suffix list

The suffix list in R1 condition 5 does not cover files the shell runs by itself later:
- `~/.bashrc`, `~/.profile`, `~/.zshrc`;
- `.git/hooks/pre-commit` and other extensionless scripts;
- `Makefile`;
- `.ps1` copies with a trailing dot on Windows (`x.ps1.` becomes `x.ps1`).

Writing these is the same write-then-run split that R1 leaves out of scope. The builder implemented the list as specified.

## Verified absent (first-class findings)

- **Regex state.** No global regex is shared across calls without a reset (`:272`, `:279`), the new regexes are non-global, and nothing recurses.
- **Early close.** An early guard close is not exploitable. `closeRe` is multiline, so its `^`/`$` also match around `\r`, ` ` and ` `. That can close earlier than bash, but never later, because every bash delimiter line is also a `closeRe` match. The whitespace-only trailer (`:363`) then leaves bash reading the rest as body.
- **CRLF.** A CRLF opener is safe at 610d0cb: bash's `EOF\r` delimiter line is matched by `^EOF$` in multiline mode.
- **Time.**
  - 320 KB runs of spaces, tabs or newlines take 0-3 ms in `detectDelete`.
  - 160k note-send arguments take 0-10 ms in the span scan.
  - The R3 test passes.
  - The lookbehind in `SAFE_CMD_RE` shows no quadratic behaviour in V8.
- **`SAFE_CMD_RE`.** Every string the new pattern (`:240`) matches is also matched by the base `\b…\b` pattern, except the added `rg` word, which is now held to command position. The change adds no new safe positions.
- **The ssh re-parse** is fully removed, and the F2 repros refuse.
- **The header comment** (`:75-112`) restores the cross-call residual-limit note (F6) and documents condition 5 as it is implemented. After the fix, add the condition-2 check and the plain-word rule to it.

## Scratch artifacts (left for the lead's closeout)

Everything is under `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C2-review/r3/`:
- `guard-copy.mjs`: the 610d0cb guard, with the span helper exported;
- `probe-r3.mjs`: the harmless marker probe;
- `run/`: where bash wrote its files;
- `apply-fix.mjs` and `fixed/`: the simpler normalization gate;
- `fixed2/`, `guard-fixed2.mjs`, `probe-r3-fixed2.mjs` and `run-fixed2/`: the recommended patch.
