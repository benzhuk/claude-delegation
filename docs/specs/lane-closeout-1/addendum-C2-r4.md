# C2 round 4: the lead replaces the heredoc parser with a whitelist

- Round: 4.
- Findings: reports/C2-review-r3.md, N2 to N5 and the reviewer's patches.
- Start from wt/lane-closeout-1-C2 at 610d0cb80c821aba7f3a174542dcc7acf25bf9a0, in /home/ben/Code/claude-delegation-wt/lane-closeout-1-C2.

Research, from round 3 on: the reviewer already reproduced all 13 shapes on a scratch copy. The repros are in /tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C2-review/r3/. The cause they share: the exemption tries to parse bash's heredoc rules and gets them wrong in edge cases (quotes or `#` in the target, unicode whitespace, a second heredoc, joined lines). Hypothesis: any parse-based exemption keeps leaking. The discriminating check is to replace the parse with an exact whitelist and re-run all 13 repros plus the saved 106-case and 24-case probes. The prediction is 0 exempted shapes outside the whitelist.

## Ruling W: the only exempt shape, matched exactly and never parsed
The input as a whole must match this, or the heredoc exemption does not apply and the whole input is checked as at base:
- **Line 1** matches `^(cat >>? ?|tee (-a )?)([A-Za-z0-9._/-]+) <<'([A-Za-z_][A-Za-z0-9_]*)'$`.
  - The spaces are single ASCII spaces.
  - The target has only those characters: no quotes, `#`, `$`, backslash, `<`, `>` or whitespace inside it.
  - Exactly one `<<`.
  - The delimiter is single-quoted.
  - Nothing follows the closing quote.
  - Also allowed is `note-send <args> --packet-file - <<'X'`, where `<args>` contains no `<`, `>`, `|`, `;`, `&`, `$`, backtick, `(`, `)` or `#`. Also `git commit -F - <<'X'` exactly.
- **Body:** every line after line 1, up to the first line exactly equal to the delimiter.
  - Lines are not joined: a quoted delimiter means bash does no continuation.
  - A line counts as the delimiter only when it is the delimiter with no leading or trailing whitespace of any kind.
- **After the body:** nothing may follow the delimiter line, except one optional final newline. There must be exactly one delimiter line, and an unterminated heredoc is not exempt.
- **Suffix:** the target's final suffix, compared case-insensitively, is not in the R1 list.
- **Newlines:** input containing `\r`, or any character other than ASCII space or tab that `\s` matches, anywhere on line 1 or the delimiter line, is not exempt.

Delete the old parsing exemption code. W replaces it; it does not sit beside it. Keep the quoted-argument rule for non-executors (grep, rg, echo and the like) as it is, with the F4 fix.

## Tests
- All 13 repros from C2-review-r3.md must be checked again, meaning refused when their body holds a delete. Build them by string concatenation.
- These must pass: `cat > report.md <<'EOF'` (body with a delete in quotes), `tee -a notes.md <<'EOF'`, `note-send --to x --packet-file - <<'EOF'`, and `git commit -F - <<'EOF'`.
- The saved probes must come out unchanged apart from shapes W now refuses. Report any difference. The lead re-runs the probes afterwards.
- Timing: 320 KB in under 1 s.

## Gate and report
- The gate is as in brief-C2.md. The GOALS.md STALE failure is pre-existing.
- Commit, and do not push.
- Report to reports/C2-r4-report.md:
  - line 1: `DONE <sha>` or `BLOCKED <reason>`;
  - a table of the 13 repros, each marked refused yes/no;
  - the gate numbers, with the log at reports/C2-r4-gate.log.
- ETA 45 minutes.
