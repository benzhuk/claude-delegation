DONE 1b8f23d0a66706851dafba7781035d827563809c

# C2 round 2 report (lane 36, lane-closeout)

Worktree `/home/ben/Code/claude-delegation-wt/lane-closeout-1-C2`, branch
`wt/lane-closeout-1-C2`, started from `cea1b7793dfca470b97b69ebaf80761258cab659`.
Rulings applied from `docs/specs/lane-closeout-1/addendum-C2-r2.md`, findings from
`docs/specs/lane-closeout-1/reports/C2-review.md`.

## Findings table

| Finding | Disposition | Tests | Commit |
|---|---|---|---|
| F1 (heredoc: 36 bypasses) | Fixed. `findHeredocSafeSpans` rewritten per R1: exempt only when the whole command apart from the body is exactly `cat > file` / `cat >> file` / `tee [-a] file` / `note-send …` / `git commit -F -`, with a plain `<<` and a quoted delimiter, nothing else anywhere outside the body. | All 24 numbered F1 repro tests (`F1 repro #1`…`#24`); updated exempt-shape tests (`false positive #1…`, `heredoc into tee…`, `heredoc into note-send…`, `heredoc into a git commit message (git commit -F -)…`); flipped nested-substitution test (`a heredoc fed to cat inside a git commit -m "$(...)"…`) to stay-refused; new `bare cat with NO redirect…` stay-refused test; new `R1 pinned: cat > report.md <<EOF with an UNQUOTED delimiter…` stay-refused test (the exact repro named in R1's text); new dashed-heredoc (`<<-`) stay-refused test; new quoted-delimiter-unterminated-heredoc fail-closed test. | `6f3fe78` (implementation + first test batch), `1b8f23d` (the R1-named unquoted-delimiter-with-redirect pin) |
| F2 (ssh re-parse: dead weight + bypass) | Fixed. `findSshSafeSpans` and its call-site union deleted outright, per R2. The ssh false positive needs no dedicated code: it is already covered by the base `findSafeQuoteSpans`/`SAFE_CMD_RE` rule (`grep` in command position right after the remote string's own opening quote). Before/after table in the round-1 report's claim of an ssh-side change is corrected here: there is no ssh-specific code left at all. | Kept as regression: `false positive #3 (spec): ssh host "grep -n 'rm -rf' file" passes…`, `ssh host 'grep -n "rm -rf" file' passes…`. New stay-refused: `F2: ssh host "echo 'rm -rf x'" | sh is NOT exempted…`, `F2: ssh host "printf 'rm -rf x'" | bash is NOT exempted…`. | `6f3fe78` |
| F3 (quadratic heredoc scan / timeout) | Fixed. New implementation does one bounded pass per command (no per-opener rescanning), so it cannot be quadratic. Measured 320KB adversarial input at ~0.5-1.2ms, well under the 1s bar. | New: `F3: a 320 KB adversarial heredoc-shaped input stays under 1s and still refuses the trailing delete`. | `6f3fe78` |
| F4 (`rg` widened "safe word anywhere") | Fixed. Applied the reviewer's regex fix: `SAFE_CMD_RE` now requires the safe word to sit in command position (start of string, after a separator/newline/`(`/backtick/quote), not merely anywhere in the string. | New: `F4: sudo -u rg sh -c 'rm -rf x' is NOT exempted…`, `F4: /opt/rg/bin/sh -c 'rm -rf x' is NOT exempted…`. Kept: `rg -n "rm -rf" file passes…`. | `6f3fe78` |
| F5 (ssh reentrancy pin hangs instead of failing) | Moot, per R4/the addendum's own note ("If F2 lands this is moot"): `findSshSafeSpans` no longer exists, so there is no recursive re-entry into a shared regex to hang on. No `sshRe` object remains anywhere in the file. | The existing perf test (`detectDelete stays fast … on repeated ssh-quoted-grep segments …`) is kept as a regression; it now measures the plain quoted-argument path only. | `6f3fe78` |
| F6 (header dropped the cross-call residual-file note) | Fixed. Restored, and extended to name `cat > file` alongside `tee`, since round 2 makes `cat`-to-file newly exempt: a heredoc written to a file and executed by a LATER, SEPARATE tool call stays out of this hook's scope; only same-call execution after the body is refused (enforced by the empty-trailer requirement). | N/A (doc-comment restoration in `hooks/delete-guard.mjs:75-97`; also restated in the test file's section-header comment). | `6f3fe78` |
| F7 (base-era bypasses, out of scope) | Left untouched per the addendum's explicit ruling ("Out of scope for this lane. Leave it; the lead routes it."). No code or test change. | — | — |

## Gate

1. `node --test hooks/delete-guard.test.mjs agents/agents.test.mjs`:
```
ℹ tests 197
ℹ suites 0
ℹ pass 197
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

2. `node scripts/run-tests.mjs > reports/C2-r2-gate.log 2>&1` (full log at
`docs/specs/lane-closeout-1/reports/C2-r2-gate.log`):
```
ℹ tests 2646
ℹ pass 2640
ℹ fail 1
ℹ cancelled 0
ℹ skipped 5
ℹ todo 0
ℹ duration_ms 17476.002863
```
The single failure is `scripts/work-record.test.mjs:2340:1` (`docs/GOALS.md and
docs/goals/card.md carry no phrase this build's evidence contradicts`), the same
pre-existing `docs/GOALS.md` STALE test named as not mine in the addendum's "Gate and
report" section. `git diff cea1b779..HEAD --stat` touches only `hooks/delete-guard.mjs`
and `hooks/delete-guard.test.mjs`; `docs/GOALS.md` is untouched.

## Notes

- Verified the reviewer's scratch prototype (`heredoc-proto.mjs.txt`, read-only) against
  R1 before adopting anything from it: R1 is materially stricter than the prototype in two
  ways the prototype allowed and R1 forbids — (a) a bare `cat <<EOF` with no redirect
  (prototype kept this exempt; R1's rule 4 lists only `cat > file`/`cat >> file`, so this
  round drops it), and (b) the `git commit -m "$(cat <<'EOF' … )"` nested-substitution
  shape (prototype kept a special-cased allowance for it via `subCommandBefore`/boundary
  logic; R1's rule 3 bans `$( )` anywhere outside the body with no such exception, and rule
  4 lists only literal `git commit -F -`). I did not reuse the prototype's `subCommandBefore`/
  `heredocConsumer`/quote-scanning helper functions at all — R1's "whole command apart from
  the body is exactly one of four shapes" let the implementation collapse to whole-line
  anchored regexes instead, which is both simpler and, by construction, satisfies R1's
  "exactly one heredoc" and "nothing before/after but whitespace" requirements without a
  separate counting pass.
- No deletion command was run or scripted at any point; all destructive-shaped test
  strings were built with string concatenation. No command was denied.
- Scratch work (probe/perf scripts, read-only) under
  `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C2/`.
