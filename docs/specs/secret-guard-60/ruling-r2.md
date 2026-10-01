# Lane 60 lead ruling r2: the phase 2 red-team (p2-review.md), adopted in full

Input: docs/specs/secret-guard-60/p2-review.md, NEEDS_FIXES on fb48a924a5988c3808eacebae93aa7c08d581bc1. It has four HIGH findings. Each is a real read that c890801 denied and fb48a92 allows.

Every finding from F1 to F6 is adopted. F7 lists pre-existing gaps and is out of scope. Each exclusion narrows to a positive allowlist of shapes known to be harmless. Anything not on the allowlist is scanned exactly as it was at c890801.

## Exclusion H narrows to "a heredoc that only writes a file"
A quoted-delimiter heredoc body is blanked only when all three of these hold:
- The command that receives the heredoc is `cat` with its stdout redirected to a file (`>` or `>>`), or `tee` with a file operand.
- Nothing follows it in a pipe.
- It does not sit inside a command substitution.

Every other receiver keeps its body scanned. That includes bash, sh, zsh, python, node, ssh, any other interpreter, and any unknown command. Here-strings are never blanked.

## Exclusion Q narrows to plain operands in a plain segment
A search or existence operand is blanked only when:
- the whole command holds no command substitution (`$(` or a backtick) and no process substitution;
- the operand's pipeline segment does not pipe into anything, and receives no pipe from a lister.

Adopt the reviewer's verified F2 patch as the base for this. It is in /var/tmp/l60p2rt-D6kg/.

`git log` and `git diff` are exempt only when their flags hold no patch form. `-p`, `-u`, `--patch` and `-U<n>` are patch forms. For `git diff`, only `--stat`, `--name-only` and `--name-status` keep the exemption. `git show` is never exempt.

## Proof, replacing ruling r1's proof 3
- The full-length replay is the measure. The reviewer's extractor lives in /var/tmp/l60p2rt-D6kg/.
  - Copy it into the dotfiles worktree as a selftest helper, or next to the selftest. It must print only counts and structural classes, never command text.
  - Rerun it against c890801 and against the fix.
- Required results:
  - zero regressions;
  - zero commands in the now-passing set that the structural real-read classifier flags;
  - every flag is either fixed or shown, structurally, to be a false flag.
- Report the now-passing count. It is the measure this lane moves.
- Each F1 to F4 shape gets a discriminating selftest case (F6): red on fb48a92, green after.
