DONE 8bc8bd5

# C2 round 4 (lane 36): Ruling W — heredoc exemption replaced with an exact whitelist

Worktree: `/home/ben/Code/claude-delegation-wt/lane-closeout-1-C2`, branch `wt/lane-closeout-1-C2`,
started from `610d0cb80c821aba7f3a174542dcc7acf25bf9a0`, committed at `8bc8bd5`.

## What changed

`hooks/delete-guard.mjs`: `findHeredocSafeSpans` (a parser) is deleted outright and replaced
by `heredocWhitelistBodyStart` + `matchHeredocLine1` (an exact whitelist, Ruling W), matched
against the **raw**, un-normalized command — never the normalized one, so a body line's
trailing backslash/backtick can no longer move where the guard thinks the body starts (the
round-3 N4 bug class). Three regexes replace the old four: `CAT_TEE_LINE_RE` (`cat`/`tee`,
single redirect only, plain-word target charset `[A-Za-z0-9._/-]`, single-quoted delimiter
only), `NOTE_SEND_LINE_RE` (`note-send <args> --packet-file - <<'DELIM'`, `<args>` excluding
shell metacharacters and any non-ASCII-space/tab whitespace), and `GIT_COMMIT_F_LINE_RE`
(`git commit -F - <<'DELIM'`, exact). The closing line is found by scanning the raw string's
lines for the first one **strictly equal** (`===`) to the captured delimiter — no `\s`-based
trimming — so quotes, `#`, glued-on second heredocs, and odd whitespace can no longer smuggle
real bash syntax past the check the way regex-based parsing did. `detectDelete`'s call site
now pushes a single `[bodyStart, normalized.length]` span (the whole remainder is exempt or
nothing is, per the ruling's "nothing may follow but one optional final `\n`" rule), guarded
by a cheap raw/normalized prefix-equality check.

`hooks/delete-guard.test.mjs`: added the 13 Ruling-W repro tests (built by string
concatenation, `DEL = 'rm -rf x'`), a `note-send --packet-file -` pass test, and pinned the
two shapes Ruling W intentionally narrows away (bare `note-send <<'EOF'`, and
`cat <<'EOF' > file`) as now-refused. `heredocHeads` (used by the round-3 N1 suffix tests)
now generates `cat > f`, `cat >> f`, `tee f` instead of including the dropped
`cat <<'EOF' > f` form. 15 net new tests (212 → 227).

## The 13 repros (reports/C2-review-r3.md N2-N5) — all refused

| # | Shape | Refused |
|---|---|---|
| N2 #1 | `cat > "c3 <<'EOF'` (double-quoted target swallows `<<'EOF'` as literal text) | yes |
| N2 #2 | `cat > 'c4 <<'EOF'` (single-quoted target, same swallow) | yes |
| N2 #3 | `tee #c <<'EOF'` (`#` starts a real bash comment, no heredoc at all) | yes |
| N2 #4 | `cat > c8.txt <<'EOF'<NBSP>` (NBSP is part of bash's delimiter word, not whitespace) | yes |
| N2 #5 | same with a form-feed (`\f`) in place of the NBSP | yes |
| N3 #1 | `cat > c1.txt<<A <<'EOF'` (a second, unquoted heredoc glued onto the target) | yes |
| N3 #2 | `tee c2.txt<<A <<'EOF'` (same shape, tee) | yes |
| N4 #1 | quoted delimiter, body line 1 ends in `\` (normalizer used to join the real closing `EOF` into the opener) | yes |
| N4 #2 | same, body line 1 ends in a backtick | yes |
| N5 #1 | `cat > r1.md <<'EOF' > w1.sh` (second redirect hides the real write target from the suffix check) | yes |
| N5 #2 | `cat > "w2.sh" <<'EOF'` (double-quoted target) | yes |
| N5 #3 | `tee 'w3.sh' <<'EOF'` (single-quoted target) | yes |
| N5 #4 | `cat > w4.s'h' <<'EOF'` (partly-quoted target) | yes |

Verified two ways: (1) `node --test hooks/delete-guard.test.mjs` — all 13 are now permanent
regression tests (`Ruling W repro N2 #1: must refuse`, etc.), all pass; (2) an ad hoc script
at `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C2/r4/verify-r4.mjs`
imports `detectDelete` directly and prints `REFUSED` for all 13 and `PASS` for the four
required-pass shapes.

## Required pass shapes — all pass

`cat > report.md <<'EOF'`, `tee -a notes.md <<'EOF'`,
`note-send --to x --packet-file - <<'EOF'`, `git commit -F - <<'EOF'` — all four `null`
(exempt) under `detectDelete`, pinned as tests.

## Saved probes re-run

Both harnesses live in the reviewer's own scratch (`new` there is a live symlink to this
worktree, so re-running them already reflects this round's code):

- **106-case probe** (`/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C2-review/r2run/probe.mjs`,
  saved output `reports/C2-r3-probe-out.txt`): re-run output is **byte-identical** to the
  saved file (`diff` empty) — bypass count stays 14 (all pre-existing F7, out of scope), no
  row moved.
- **24-case suffix probe** (`.../r2run/suffix.mjs`, saved output `reports/C2-r3-suffix-out.txt`):
  exactly 2 rows differ, both the intentionally-narrowed shape:
  - `pass "cat <<'EOF' > report.md"` → `refuse` (target-after-`<<` shape dropped by Ruling W)
  - `pass "cat <<'EOF' > x.txt"` → `refuse` (same)
  Every other row (the 22 `cat > f <<'EOF'` / `tee f <<'EOF'` rows, and all six disallowed-suffix
  rows across all three heads) is unchanged. No new EXEMPT/pass anywhere.

This matches the addendum's prediction ("every change only narrows the exemption, so the
saved probe can only move toward refusal") exactly, plus the one deliberate, ruling-mandated
narrowing (dropping the redirect-after-`<<` shape) documented above and pinned as a new test.

## Deviations from prior rounds (both required by Ruling W, both pinned as regression tests)

1. Bare `note-send <<'EOF'` (no `--packet-file -`) is **no longer exempt** — Ruling W's
   note-send shape requires `--packet-file -` literally before the `<<`. The old round-2/3
   test asserting this passed was changed to assert refusal; a new test with
   `--packet-file -` added covers the shape Ruling W actually whitelists.
2. `cat <<'EOF' > file` (redirect **after** the `<<`) is **no longer exempt at all**, for any
   target including a benign one — Ruling W's line-1 regex only has the redirect-before-`<<`
   form. This also fixes round-3 N5 by construction (a second redirect anywhere on the line
   simply fails to match any of the three shapes, rather than being partially checked).

Also: the double-quoted delimiter form (`<<"EOF"`, allowed in rounds 2-3 alongside
`<<'EOF'`) is dropped — Ruling W's regex is single-quote only. Nothing in the repo or in the
test suite used a double-quoted delimiter, so no test needed updating for this.

## Gate

1. `node --test hooks/delete-guard.test.mjs agents/agents.test.mjs`: **227 pass, 0 fail**
   (212 → 227; the 15 new tests are the 13 Ruling-W repros plus the note-send `--packet-file -`
   pass test and the `cat <<'EOF' > file` narrowing pin).
2. `node scripts/run-tests.mjs > reports/C2-r4-gate.log`: **2676 tests, 2670 pass, 1 fail,
   5 skipped**. The 1 failure is the pre-existing `docs/GOALS.md` STALE test
   (`scripts/work-record.test.mjs:2340`), unrelated to this diff (touches only
   `hooks/delete-guard.mjs`/`hooks/delete-guard.test.mjs`) — same failure noted at base and
   in every prior round's state/report for this territory, and named as pre-existing in this
   round's addendum. Log: `reports/C2-r4-gate.log`.
3. Timing: the existing F3 test (320 KB / 40,000-line adversarial heredoc-shaped input)
   stays under 1s and still refuses the trailing delete — unaffected by this round (the new
   whitelist short-circuits on line 1 before ever reaching the body scan for a non-matching
   shape like the F3 input).

## Non-negotiables

No shell deletion command was ever typed literally, in this session or in the test file; every
hostile string is built by concatenation (`DEL = 'rm -rf x'` + `+`). No command was denied by a
permission prompt, sandbox, or guard hook during this round. Committed on `wt/lane-closeout-1-C2`,
not pushed.

## GOAL line served

Rework after acceptance / work lost or stalled: a subagent chaining a recursive delete into an
unattended command is exactly the failure class this hook exists to close before the prompt
nobody watches appears; round 3's review found the exemption itself had reopened that gap
through four independent parsing mismatches. Nearest NOT: not a rule no script checks — every
shape in this report is now a permanent, executable regression test, not prose.
