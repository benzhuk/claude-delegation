# C2 round 2: the lead's rulings on reports/C2-review.md

Round: 2
Findings file (the only source of what to fix): /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/reports/C2-review.md
Start from: wt/lane-closeout-1-C2 at cea1b7793dfca470b97b69ebaf80761258cab659, in the same worktree, /home/ben/Code/claude-delegation-wt/lane-closeout-1-C2
Previous state: reports/C2-state.md

These rulings replace the heredoc and ssh parts of the C2 rulings in contracts.md.

## R1, for F1: a heredoc is exempt only in one narrow shape, replacing the current heredoc exemption
A heredoc body is exempt from the recursive-delete match only when all of the following hold:
1. The delimiter is quoted (`<<'EOF'` or `<<"EOF"`, with the whole word quoted). An unquoted delimiter or `<<-` keeps the body checked, because `$( )` and backticks run in it.
2. The input holds exactly one heredoc.
3. The command that owns the heredoc is the entire input, apart from the body. There is:
   - no `|` or `|&`;
   - no `;`, `&&`, `||` or `&`;
   - no newline-separated second command, before or after;
   - no `<( )` or `>( )`;
   - no `$( )` or backtick anywhere outside the body.
4. That command is one of these:
   - `cat > <file>` or `cat >> <file>` (the redirect before or after the `<<`);
   - `tee [-a] <file>` with its stdout discarded or not piped;
   - `note-send ...`;
   - `git commit -F -`.
5. The target file's name does not end in `.sh`, `.bash`, `.zsh`, `.ps1`, `.psm1`, `.cmd`, `.bat`, `.py`, `.js`, `.mjs` or `.cjs`.

Anything else with a heredoc is checked exactly as at base.

Every F1 repro from the review gets a test and must refuse. So must `cat > report.md <<EOF` with an unquoted delimiter and a `$(rm ...)` in the body.

`cat > report.md <<'EOF'` with a delete command quoted in the body, and nothing after it, must pass. That is the report-writing shape the spec's first false positive names.

A script written in one call and run in a later call stays out of scope. Put the header note back, per F6.

## R2, for F2: remove findSshSafeSpans and the ssh re-parse entirely
The ssh shapes behave exactly as at base. Correct your before/after table where it claimed an ssh change. The spec's third false-positive shape already passed at base; keep its test as a regression.

## R3, for F3: time limit
The guard stays well under the hook's 5 s timeout on long input, with no quadratic scan. Add a test: a 320 KB command returns in under 1 s.

## R4, for F4 and F5
- F4: apply the reviewer's regex fix for the `rg` case, with its test.
- F5: make the ssh-regex regression test fail instead of hanging. Give it a timeout, or a bounded input.

## F7
Out of scope for this lane. Leave it; the lead routes it.

You may reuse the reviewer's scratch fix as a starting point where it matches these rulings. Check it against R1 before you adopt it; do not trust it blindly.

## Gate and report
Run the same gate as brief-C2.md. The single known failure, the docs/GOALS.md STALE test, also fails at base and is not yours.

Commit on wt/lane-closeout-1-C2 and do not push.

Report to reports/C2-r2-report.md:
- line 1: `DONE <full sha>` or `BLOCKED <reason>`;
- one table row per finding: disposition, test name and commit;
- the gate numbers, quoted from the log, which goes to reports/C2-r2-gate.log.

ETA 60 minutes.
