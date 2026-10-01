# Review brief C2 (lane 36): delete guard quoted-text exemption

Artifact: wt/lane-closeout-1-C2 at cea1b7793dfca470b97b69ebaf80761258cab659. The worktree is /home/ben/Code/claude-delegation-wt/lane-closeout-1-C2. Diff it against base 7b00418621f3b7dc168a2c1aa2f7d3618b1b6d45.

Read these:
- contracts.md next to this file, the C2 rulings;
- the builder's report, reports/C2-report.md.

The one known suite failure, "docs/GOALS.md ... STALE regexes", also fails at base. Ignore it.

## Attack surface
This change loosens a safety guard, so the priority is a real delete getting through. Defeat the exemption. Try at least these:
- **Heredocs.**
  - A heredoc to `cat` that is then piped or redirected into a shell: `cat <<EOF | bash`, `cat <<EOF > x.sh && bash x.sh`, `tee x | sh`.
  - Quoted and unquoted delimiters, `<<-`, and several heredocs in one command.
  - A heredoc delimiter that appears inside the body.
- **Command chains.** A quoted exempt argument followed by a real command: `grep 'x' f; rm -rf d`, `echo "a" && rm -rf d`, and the same with `||`, newlines and `&`.
- **Substitution inside double quotes.** `echo "$(rm -rf d)"` and `` echo "`rm -rf d`" ``, which execute.
- **ssh.**
  - A remote string with nested quoting that the re-parse gets wrong.
  - `ssh host bash -c "'...'"`.
  - `ssh -o X host cmd` and other option forms.
  - ssh with the remote command unquoted.
- **Wrappers and executors.** `sudo`, `env`, `command`, `nohup` and `timeout` in front of an executor. `xargs`. `find -exec`. `git -C x clean` inside quotes. `note-send` with a `$( )` substitution.
- **Robustness.** Unbalanced quotes, and very long input. Does the regex reentrancy fix hold? Look for any shared regex state left behind.
- **PowerShell shapes,** if the guard handles PowerShell.

For every bypass you find, write a failing test case.

Two more checks:
- Every shape the guard refused at base still refuses. Run the base test file against the new guard.
- The eight role files carry the pinned sentence byte for byte, and the identity test would fail if one of them drifted. Prove it by mutating a copy of the files in a scratch dir, using node only.

## Rules
Read-only on the worktree. Put scratch copies under /tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C2-review/, and use fresh names there.

Never run any deletion command (rm, rmdir, git clean, and the like), and never put one in a script you run. A reviewer on the last lane hung for 4.8 hours on a script that began with rm -rf. Build the test strings in node with string concatenation, and feed them to the guard through its exported function or through stdin JSON.

If a command is denied, stop that step and report it verbatim.

## Report
Write the report to reports/C2-review.md.
- Line 1: `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES <sha>`.
- Then the findings. Each has a severity, file:line, a repro string, and a concrete fix (exact old → new where it is mechanical).

ETA 45 minutes.
