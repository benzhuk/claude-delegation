# Lane 60 lead ruling r1: the two patterns phase 2 narrows

Input: docs/work/evidence/secret-guard/denials-desktop.md on main, VERDICT COUNTED: 205 refusals in 105 transcripts (skills-fable-guard-60-3).

## The two patterns

By reason, the two largest are:
1. "command references a secret file": 73 refusals, 35.6 percent.
2. "command dumps the process environment": 65 refusals, 31.7 percent.

By class:
- 45.4 percent are writes whose content names a guarded word (class d).
- 41.0 percent are read-only lookups (class b).
- 1.5 percent are real reads (class a, 3 cases).

Class c, the env-file interpreter flag run as a command, has zero cases. So the env-file flag candidate from the spec is dropped. Phase 2 narrows only the two patterns above. The sources-a-secret-file reason, 28 refusals, is third, and is out of scope unless its fix is the same heredoc rule below.

## The narrowing

Both patterns get the same two exclusions, and the environment-dump pattern gets one more.

### Exclusion H: quoted heredoc bodies
- Text inside a heredoc whose delimiter is quoted (`<<'EOF'` or `<<"EOF"`) is not scanned by these two patterns. Such a body is literal content being written, and the shell expands nothing in it.
- An unquoted heredoc body (`<<EOF`) is still scanned, because `$(...)` and backticks inside it run.
- A git commit message given with -m, and Write/Edit content, stay under the rules they already have. Nothing in them is loosened by this ruling.

### Exclusion Q: search and existence operands
The file-name pattern denies only when a secret file is an operand that would read or copy its bytes:
- cat, less, more, head, tail, type, Get-Content, gc;
- cp, scp, rsync, tar, zip;
- source and `.`;
- base64, xxd, od, strings;
- an interpreter one-liner that opens the path: readFileSync, open(, Get-Content.

It does not deny when the name appears only:
- as a grep, rg or findstr pattern or file operand, when the flags print no matched line content (-l, -c, -q) or when the pattern names the file rather than reading it;
- as an operand of ls, test, `[`, stat, wc -c, git log or git diff --stat;
- inside a quoted string passed to echo.

When unsure, deny. Every doubt resolves to deny.

### Environment-dump narrowing E
Deny when a pipeline segment:
- starts with env, printenv or `set` with no arguments;
- starts with `export -p`, Get-ChildItem env: or gci env:;
- or runs an interpreter one-liner that serializes the whole environment (JSON.stringify or console.log of the whole environment object, print of os.environ, dict(os.environ)).

Do not deny when:
- the environment accessor text appears only inside a grep, rg or sed pattern argument;
- it appears inside a quoted heredoc body (exclusion H);
- it is a single named non-secret key read. Secret-shaped key names stay under their existing rule.

## Proof required, per the spec

1. **All real reads still deny.** Every class (a) case in the corpus still denies after the change. Test each one, or a structural twin of it with fake paths.
2. **Real cases still deny.** For each narrowed pattern, a red-team test set proves every real case it was written for still denies: whole-file reads, copies, sourcing and dumps, including an unquoted heredoc that runs a command substitution reading the file.
3. **Formerly refused commands, now passing.** Run the corpus's class b and class d examples, and every quoted command in the corpus file, through the old and new hook. List each command that now passes. Give the count per class.
4. **Discriminating tests.** Each new test is red on the pre-phase-2 hook and green after, for the right reason.

## Held, not in phase 2

These are recorded for a later lane:
- The "task-" plus 40-hex fold into the legacy key pattern (sweep record, 9/29).
- The TOKENS, colon and three-digit prose trip in the output detector's denoised pass (skills-fable-guard-60-2).
