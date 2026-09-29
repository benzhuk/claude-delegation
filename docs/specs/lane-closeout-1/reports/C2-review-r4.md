VERDICT: NEEDS_FIXES 8bc8bd574666e81d0e7b16b4a45abf1789ff10b9

# C2 review, round 4 (lane 36): Ruling W whitelist at 8bc8bd5

Artifact: wt/lane-closeout-1-C2 at 8bc8bd574666e81d0e7b16b4a45abf1789ff10b9, diffed against base 7b00418621f3b7dc168a2c1aa2f7d3618b1b6d45.

How I reviewed:
- Read-only. `git status --short` in the worktree prints nothing, before and after.
- No command was denied.
- I wrote no delete-shaped string and ran none. The one live bypass below was shown with the harmless marker line `echo MARKER_$((6*7))`: bash prints `MARKER_42` only if it executes that line, and the literal text contains no `42`. `note-send` was never run. Inside the probe's `bash -c` it is a shell function that swallows stdin.
- Scratch: `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C2-review/r4/`. `guard-copy.mjs` is the HEAD guard with `heredocWhitelistBodyStart` exported. `probe-ns.mjs` is the marker probe. `edges.mjs` holds 25 inert edge rows. `fixed/` is the patched copy.

## Summary

- For the `cat`/`tee` and `git commit -F -` shapes, the builder implemented Ruling W exactly. The old parser is gone, the exemption is computed on the raw command, and the detectors still scan the normalized command.
- The evidence files show what the brief asks for:
  - all 13 r3 shapes refuse;
  - the control passes;
  - the 106-case output is byte-identical to round 3;
  - the suffix probe moved 2 rows, both the narrowing that W requires;
  - there are 0 new bypasses.
- **One BLOCKER remains (N7).** The note-send shape in Ruling W does not exclude quote characters from `<args>`, and the builder copied that faithfully (`hooks/delete-guard.mjs:336`). An unbalanced `"` or `'` in the args swallows ` --packet-file - <<'EOF'` into a string. Bash then runs body lines as commands, and the guard exempts them all. This is the N2 #1/#2 class again, carried over into the note-send shape. It is measured, and a one-line fix is verified on scratch. Because the ruling's own text permits quotes, the lead has to amend W for this.

## Bug-fix fields

Cause: `NOTE_SEND_LINE_RE` (`hooks/delete-guard.mjs:336`) lets `'`, `"` and `\` into `<args>` as plain characters, as Ruling W's own exclusion list allows. When a quote is unbalanced, bash's quote state at the end of line 1 is "inside a string". The regex assumes line 1 ends as one complete command with a heredoc. So the heredoc the guard sees does not exist in bash, and the lines the guard exempts are commands to bash.

Discriminating check: run `node probe-ns.mjs` in the scratch r4 directory against the HEAD copy:
- `ctl plain args` and `ctl real usage` print `EXEMPT bash-ran=no`.
- `N7a lone dquote`, `N7b lone squote` and `N7c dquote glued` print `EXEMPT bash-ran=YES`.

Against `fixed/` (`probe-ns-fixed.mjs`), the three N7 rows print `checked` and both controls stay `EXEMPT`.

Fix location: `hooks/delete-guard.mjs:336` (`NOTE_SEND_LINE_RE`), plus three rows in the `W_REPROS` array in `hooks/delete-guard.test.mjs` (the array ends just above `:679`).

Simplification: none needed beyond the one regex. W already is the simplification. The patch keeps it a whitelist, not a parser. Outside quotes, quotes and backslash are excluded. A quoted segment must open and close on line 1 and cannot contain its own quote character or a backslash. The regex's view of the quotes on line 1 therefore always matches bash's.

## Answers to the brief

### 1. Does the code implement Ruling W exactly?

| Ruling W clause | Code | Verdict |
|---|---|---|
| Line 1 regex for `cat`/`tee` | `:331` `CAT_TEE_LINE_RE = /^(?:cat >>? ?\|tee (?:-a )?)([A-Za-z0-9._/-]+) <<'([A-Za-z_][A-Za-z0-9_]*)'$/`. The groups are non-capturing, and otherwise it is the ruling's regex character for character. | Exact |
| Single ASCII spaces, target charset, exactly one `<<`, single-quoted delimiter, nothing after the closing quote | Built into `:331`. It has no `m` flag, so `$` matches only at the end of the input, never before a `\r` or `\u2028`. | Exact. Measured in `edges.mjs`: `CR line1`, `u2028 line1`, `tab sep`, `nbsp sep`, `lead space`, `cat two sp`, `dq delim` and `dash <<-` all give `not-exempt`. |
| note-send `<args>` exclusions | `:336` excludes `<>\|;&$`, backtick, `()#` and every `\s` character except a literal space or tab | Matches the ruling's list, but the list is incomplete (**N7**) |
| `git commit -F - <<'X'` exactly | `:338` | Exact. `git extra sp` gives `not-exempt`. |
| Body lines are not joined | `:375-385` splits the RAW string on `\n` only, with no continuation handling | Exact |
| The delimiter line is the delimiter with no whitespace of any kind | `:383` uses `lines[i] === shape.delim` | Exact. `delim sp`, `delim tab lead` and `CRLF delim only` give `not-exempt`. |
| Nothing after the body except one optional `\n`; exactly one delimiter line; an unterminated heredoc is not exempt | `:386` (unterminated) and `:388-390` (`trailer` must be `''` or `'\n'`) | Exact. `trailer 2nl`, `trailer CRLF`, `trailer text`, `two delim lines` and `unterminated` give `not-exempt`, while `ctl +nl` is exempt. |
| Suffix is not in the R1 list, compared case-insensitively | `:343` and `:370`. The regex tests the final suffix. | Exact. `.SH` and `.md.sh` give `not-exempt`; `.sh.md` is exempt, as R1 says. |
| `\r` or non-ASCII whitespace on line 1 or the delimiter line | Refused by the anchored charsets (`:331`, `:336`, `:338`) and the strict `===` (`:383`) | Exact |

- **Is the old parsing exemption fully gone?** Yes. `grep` for `findHeredocSafeSpans`, `HEREDOC_DISQUALIFY_RE`, `CAT_LINE_RE`, `TEE_LINE_RE` and `closeRe` finds nothing at HEAD. The only heredoc exemption code left is `:327-391`, and the only call site is `:510-516`. W replaces the old code; it does not sit beside it.
- **Can any byte outside the whitelisted body be exempted?**
  - For `cat`/`tee`/`git`: no. The span is `[bodyStart, normalized.length]` (`:515`). `bodyStart` is the byte after line 1's `\n`. Everything after the body is at most the delimiter line plus one `\n` (`:388-390`), and a detector cannot match inside a bare delimiter word.
  - For note-send: yes, through N7. There the "body" the guard computes is not a heredoc body in bash's reading.
- **Raw versus normalized.**
  - The exemption is computed on the raw `command` (`:510`).
  - The prefix-equality guard (`:511-514`) makes sure the offset is valid in normalized coordinates. Line 1 always ends in `'`, so the normalizer's `[\\`]\r?\n` can never touch the prefix.
  - All detectors still run on `normalized` (`:518`).
  - Correct.
- **Comment nit (INFO, no gate).** `:372` says "The delimiter is unquoted here". It means the delimiter captured without its quotes. As written it reads as the opposite of the rule. Suggested wording: "The delimiter is single-quoted on line 1, so bash disables all expansion inside the body".

### 2. Evidence files

- `reports/C2-r4-r3repros-out.txt`:
  - all 13 r3 shapes print `refuse`;
  - the control prints `PASS` (`cat > c0.md <<'EOF'`).
  - The probe source (`C2-r4-r3repros-probe.mjs.txt`) builds the body by concatenation (`'r'+'m -'+'rf d'`).
  - The NBSP row really contains U+00A0: `od` shows bytes `302 240` after `'EOF'` and after the `EOF` line. The form-feed row uses the JS escape `\f`.
- `reports/C2-r4-probe-out.txt` against `reports/C2-r3-probe-out.txt`:
  - `diff` is empty, byte-identical, 107 lines each;
  - `bypass count (new): 14`;
  - all 14 `BYPASS` lines are tagged `BYPASS(pre-existing)`; `grep BYPASS | grep -vc pre-existing` prints `0`.
- `reports/C2-r4-suffix-out.txt` against `reports/C2-r3-suffix-out.txt`: exactly 2 rows move from `pass` to `refuse`:
  - `cat <<'EOF' > report.md`
  - `cat <<'EOF' > x.txt`

  Both are the redirect-after-`<<` shape, which W does not whitelist. That is the narrowing W requires, and it is documented in the r4 report.
- New bypasses: 0 in every saved probe. None of the saved probes contains a note-send line with a quote in its args, so N7 is outside their coverage. That is the same kind of coverage gap as in r3.
- `reports/C2-r4-gate.log:2850-2855`: `tests 2676`, `pass 2670`, `fail 1`, `skipped 5`.
  - The one failure is `scripts/work-record.test.mjs:2340`, the pre-existing GOALS.md STALE test.
  - The `✖ probe` at `:1212` is run-tests' own self-test of a failing inner suite, nested inside a passing outer test. It is not a failure.

### 3. Territory tests (run by me at 8bc8bd5)

`node --test hooks/delete-guard.test.mjs agents/agents.test.mjs`:
```
ℹ tests 227
ℹ pass 227
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```
All 13 `Ruling W repro … : must refuse` tests are present and pass (generated at `hooks/delete-guard.test.mjs:679-683`).

### 4. The pinned sentence in the eight role files

- I took the `> ` sentence from contracts.md and ran `grep -cF` on it. The count is 1 in each file:
  - `agents/builder.md:28`
  - `agents/integrator.md:28`
  - `agents/reviewer.md:29`
  - `agents/runner.md:30`
  - `codex/agents/builder.toml:10`
  - `codex/agents/integrator.toml:11`
  - `codex/agents/reviewer.toml:12`
  - `codex/agents/runner.toml:40`
- With `- ` stripped, every line has sha256 `f61f279f65fa4418…`, which equals the contracts sentence plus `\n`.
- `agents/agents.test.mjs:150-172` asserts this byte for byte, as a whole line, in exactly eight files, and it passes.
- No defect.

## Findings

### N7: BLOCKER. An unbalanced quote in the note-send `<args>` turns the "body" into executed commands, and the whitelist exempts them

Code: `hooks/delete-guard.mjs:336`. Measured with `probe-ns.mjs`, where `NL` is a newline and `MK` is the harmless marker line:

| Row | Line 1 plus body (JS) | Guard | Bash |
|---|---|---|---|
| N7a | `'note-send " --packet-file - <<\'EOF\'' + NL + '"' + NL + MK + NL + 'EOF'` | EXEMPT | ran=YES |
| N7b | `"note-send ' --packet-file - <<'EOF'" + NL + "'" + NL + MK + NL + 'EOF'` | EXEMPT | ran=YES |
| N7c | `'note-send --to x" --packet-file - <<\'EOF\'' + NL + '"' + NL + MK + NL + 'EOF'` | EXEMPT | ran=YES |
| control | `'note-send --to x --text "a b?" --packet-file - <<\'EOF\''` + body | EXEMPT | ran=no |

Mechanism:
1. The `"` opens a string that runs across the newline, so ` --packet-file - <<'EOF'` is literal text.
2. Body line 1 (`"`) closes the string.
3. The newline ends the command, and the next line runs.

The span `[bodyStart, end]` (`:515`) covers that line. Every detector skips an index inside a span (`isExcluded` at `:404, 415, 426, 437, 452, 465, 474`), so a recursive-delete verb on that line passes the guard.

Fix (mechanical; it needs the lead to amend Ruling W, because W's text allows quotes). Quotes may appear only as complete quoted segments on line 1, and backslash is excluded everywhere.

Current (`hooks/delete-guard.mjs:336`):
```js
const NOTE_SEND_LINE_RE = /^note-send ((?:[^\s<>|;&$`()#]|[ \t])*) --packet-file - <<'([A-Za-z_][A-Za-z0-9_]*)'$/;
```
Replacement:
```js
const NOTE_SEND_LINE_RE = /^note-send ((?:[^\s<>|;&$`()#'"\\]|"(?:[^\s<>|;&$`()#"\\]|[ \t])*"|'(?:[^\s<>|;&$`()#'\\]|[ \t])*'|[ \t])*) --packet-file - <<'([A-Za-z_][A-Za-z0-9_]*)'$/;
```
Also update the comment at `:332-335` and the header at `:88-90` to say "quotes only as complete `"…"`/`'…'` segments on line 1; no backslash".

Test (append to the `W_REPROS` array in `hooks/delete-guard.test.mjs`, before its closing `];` at `:677`):
```js
    ['N7a note-send " --packet-file - <<\'EOF\' (an unbalanced double quote swallows the heredoc operator)',
      'note-send " --packet-file - <<\'EOF\'' + NL + '"' + NL + DEL + NL + 'EOF'],
    ["N7b note-send ' --packet-file - <<'EOF' (same, single quote)",
      "note-send ' --packet-file - <<'EOF'" + NL + "'" + NL + DEL + NL + 'EOF'],
    ['N7c note-send --to x" --packet-file - <<\'EOF\' (quote glued onto an argument)',
      'note-send --to x" --packet-file - <<\'EOF\'' + NL + '"' + NL + DEL + NL + 'EOF'],
```
Also add one pass test: `'note-send --to x --text "a b" --packet-file - <<\'EOF\'' + NL + 'warned peer about the rm -rf incident' + NL + 'EOF\n'` must return `null`.

Verified on scratch (`fixed/hooks/delete-guard.mjs`, patch applied by `apply.mjs`):
- `probe-ns-fixed.mjs` prints `checked` for N7a, N7b and N7c.
- Both controls, including the real-usage `--text "a b?"` form, stay `EXEMPT` with `bash-ran=no`.
- `node --test hooks/delete-guard.test.mjs` passes 202/202 on the patched copy. That is the delete-guard half of the 227.
- Timing: a 320 KB adversarial note-send line 1 (runs of `"a `, `" `, `' `, `a"b" `) takes 2-5 ms in `heredocWhitelistBodyStart`. The alternatives are disjoint by their first character, so the regex does not backtrack badly.

Predicted effect on the saved probes: none can move from refuse to pass. Every input the new regex matches, the old one matched too, because the new character classes are subsets and quotes appear only inside complete segments. The 106-case and suffix probes contain no note-send heredoc, so their outputs stay byte-identical to r4.

Real usage is kept. Every note-send line in the repo (`skills/multi/SKILL.md:327`, `skills/multi/references/examples.md:93`, `skills/multi/scripts/note-send.mjs:1100`) uses only balanced `"…"` arguments, and those still match. They are also ssh/`< packet.md` forms that were never heredocs.

### INFO: the header comment at `:372`

It says "unquoted" where it means the delimiter captured without its quotes. See §1 for suggested wording. No gate.

## Verified absent (first-class findings)

- **Old parser.** It is removed outright, and no helper, constant or call remains.
- **`cat`/`tee`/`git` shapes.** Across the 25 edge rows in `edges.mjs`, each row does what W requires: the 5 controls are exempt, `.sh.md` is exempt as R1 says, and the other 19 are not exempt.
- **Normalization.** It cannot shift the span. The exemption is computed on the raw string, and the prefix check is always true for these shapes.
- **Time.** The split and the scan are linear. I measured 320 KB at 2-5 ms. The F3 test still passes.
- **The quoted-argument rule for non-executors.** It is unchanged in this round. It is still the r3 F4 lookbehind form (`SAFE_CMD_RE`).
- **The pinned sentence.** It is present byte for byte in all eight role files and checked by `agents/agents.test.mjs`.
