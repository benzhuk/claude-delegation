DONE 12589fc2ad12f48eb213981dc42044d9ab6be110

# Lane 60 phase 2, fix round 1: narrow exclusions to allowlisted shapes

Territory: `/var/tmp/lane-60/dot`, branch `build/secret-guard-60-1`, fixing
`fb48a924a5988c3808eacebae93aa7c08d581bc1` (NEEDS_FIXES per the Opus
red-team's `docs/specs/secret-guard-60/p2-review.md`, ruled on in
`docs/specs/secret-guard-60/ruling-r2.md`), committed at
`12589fc2ad12f48eb213981dc42044d9ab6be110`.

## Files changed
- `dot_claude/hooks/executable_secret-guard.sh`
- `dot_claude/hooks/executable_secret-guard-selftest.sh`
- `dot_claude/hooks/secret-guard-replay-extractor.py` (new — the reviewer's
  full-length replay measure, brought into the worktree per ruling r2's
  instruction; prints only counts/structural classes, never command text)

## What changed, mapped to the review's findings

- **F1** (HIGH, exclusion H over-blanked executing heredocs): rewrote
  `strip_quoted_heredoc_bodies` to a positive allowlist — a body is blanked
  only when the receiver is `cat` redirected to a file (`>`/`>>`) or `tee`
  with a file operand, nothing pipes onward, and the whole command scope
  carries no command/process substitution anywhere (blanket bail). Any
  interpreter receiver (bash/sh/python/node/ssh/anything else) is left
  fully scanned.
- **F2** (HIGH, exclusion Q swallowed a live substitution): both
  `strip_search_pattern_arguments` and `strip_safe_existence_operands` now
  bail entirely (leave the text untouched) whenever `$(...)` or a backtick
  appears anywhere in scope. Note: the reviewer's own "VERIFIED" patch
  (`/var/tmp/l60p2rt-D6kg/fix2.sh`) does not actually parse — `bash -n`
  fails on it, because its double-quoted `*"$("*|*"`"*)` case pattern is
  real command-substitution/backtick syntax to bash's parser, not a literal
  string match. Caught this with `bash -n` before trusting it, and used
  single-quoted case patterns (`*'$('*|*'`'*`) instead, which do parse and
  behave correctly (verified on scratch before touching the reviewed file).
- **F3** (HIGH, `git log -p` leaked content): `git log`/`git diff` lose the
  exemption the instant a patch/content flag is present (`-p`, `-u`,
  `--patch`, `-U<n>`, `--full-diff`, `-G`, `-S`); `git diff` additionally now
  requires one of `--stat`/`--name-only`/`--name-status` to be present at
  all. `git show` was never in this allowlist and stays that way.
- **F4** (HIGH, `ls SECRETDIR | xargs cat` bypass): the ls/stat exemption
  now bails (leaves ALL ls/stat operands in scope unblanked) whenever any
  ls/stat invocation is followed by a `|` before its next `;`/`&`.
- **F5** (measurement): brought the reviewer's full-length replay extractor
  into the worktree, ran it against c890801 and this fix — see below.
- **F6** (tests): 9 new selftest cases (F1 x2, F2 x1, F3 x2, F4 x1, each RED
  on fb48a924... and GREEN after; plus 2 controls proving the F3 narrowing
  doesn't over-deny plain `git log`/`git diff --stat`, and 1 sanity case for
  "git show never exempt"). Updated the one existing allow-case whose
  fixture (`cat <<'EOF'` with no file redirect) is no longer an allowed
  shape under r2's narrower H — redirected it to a file so it still proves
  the intended file-authoring exemption.

## A 7th finding, not in the review: the sourcing check's own bug

While investigating the full-length replay's now-passing set, I found (and
fixed) a real bypass the review didn't name: `has_source_sourcing`'s call
site (wired this way since ruling r1's first pass, untouched by F1-F4's own
patches) was scanning the SAME comment-and-heredoc-stripped text built for
the secret-path default-deny check, instead of the raw `$CMD_SCOPE` that
c890801 always used for this specific check. "Sourcing" (144 of 397
real-corpus denials — the single largest reason category) was never one of
ruling r1/r2's two narrowed patterns, so this was scope creep from variable
reuse, not an authorized narrowing. Fixed by giving the sourcing check its
own gate, restored to c890801's exact semantics, independent of the
default-deny path's H exemption. This closed 6 real bypasses in the
full-length replay (5 the reviewer's classifier happened to flag via
coincidental heredoc-regex matches, 1 it missed entirely — found only by
directly instrumenting the real hook's own functions). Full diagnostic
detail: `/var/tmp/lane-60/p2-fix1-replay.md`.

## Full-length replay measure (ruling r2's required proof)

Ran `dot_claude/hooks/secret-guard-replay-extractor.py` against
`c890801f58f7068db66ee1548ce9a7b604df22b4` (OLD) and this commit (NEW), over
all 397 deduped, full-length (untruncated) real Bash commands this machine's
own transcripts show were refused by the live guard:

```
paired refused Bash tool_uses (full cmd available), deduped: 397
denied on OLD: 362
denied on NEW: 303
now passing (old DENY -> new allow): 59
regressions (old allow -> new DENY): 0
now-passing classified as REAL READ: 2
```

- **0 regressions** — nothing OLD allowed is denied by NEW.
- **2 remaining classifier flags, both proven structurally to be false
  flags** (not fixed further because there is nothing to fix): for both, a
  boolean-only diagnostic confirms this build's own F4 bail
  (`LS_STAT_PIPES_ONWARD=1`) correctly fired and disabled the ls/stat
  exemption entirely for the whole command; the actual exemption granted
  came from the unrelated, intended search-pattern-argument/safe-existence
  bullets elsewhere in the same long real-world command. The classifier's
  crude regex matched an `ls ... | ... cat` SHAPE present somewhere in the
  text, coincidentally, not what granted the pass. Full trace (booleans and
  marker counts only, never command text): `/var/tmp/lane-60/p2-fix1-replay.md`.
- **Now-passing count (the measure this lane moves): 59** — down from 196
  before any of this round's fixes, 66 immediately after the F1-F4 code
  changes alone, to 59 after also fixing the sourcing-check bug found
  during investigation.

## Selftest gate

```
TMPDIR=/var/tmp bash dot_claude/hooks/executable_secret-guard-selftest.sh
```
Result: `secret-guard-selftest: 67 passed, 0 failed (of 67)`. Log:
`/var/tmp/lane-60/p2-fix1-gate.log`.

Red/green confirmed against fb48a924a5988c3808eacebae93aa7c08d581bc1:
`HOOK_BIN=<fb48a92 snapshot>` gives 61 passed, 6 failed — exactly the 6 new
F1-F4 discriminating deny-cases (the other 3 new cases, all ALLOW controls,
already passed on fb48a92 too, since they don't exercise anything this round
changed).

Allow-path timing (plain `ls -la`, 30-run average, this machine): c890801
36ms, this build 42ms — ~6ms/~17% added, still well inside the 60ms budget.

## Deviations / assumptions

- The reviewer's own "VERIFIED on scratch" F2 patch does not parse as
  written (see F2 above) — used a corrected, equivalent single-quoted form
  instead, verified with `bash -n` and targeted probes before touching the
  reviewed file.
- Fixed the sourcing-check bug (not named F1-F4) because it is a direct,
  real instance of the exact defect class this round exists to close (a
  real read c890801 denied, now silently allowed) and because ruling r2's
  own governing principle ("everything else scanned exactly as at c890801")
  directly condemns it. Flagged explicitly in the state file for the
  reviewer.
- Did not attempt to fix the pre-existing `has_source_sourcing` false-positive
  on plain English prose (`. ` or any bare `.` followed by whitespace) — out
  of scope for this round; it is a c890801-inherited detector shape, not
  something this round's narrowing touches, and fixing it would itself be a
  new narrowing needing its own ruling.
- Live secret-guard hook (unrelated, running on this host) fired its known,
  pre-existing false-positive PostToolUse "SECRET DETECTED" warnings several
  times while editing `executable_secret-guard.sh` itself (the file's own
  key-literal detection arrays contain the marker substrings its own
  patterns are defined to match) — no real secret involved, same as noted
  in the phase-2 round-1 report.

## Cleanup

No dev server or background process was started. Only one-shot script
executions (selftest, timing script, replay extractor, diagnostic probes).
Nothing to kill.

## Scratch

Left in place per the hard rule against deleting anything, under
`/var/tmp/delegation-l60p2fix-jZbP/` (function-isolation probes used before
touching the reviewed file, the c890801/fb48a92 hook snapshots used for
replay and red/green checks, and the boolean-only diagnostic scripts —
`diag_all.sh`, `diag_pathhit.sh`, `diag_heredoc.sh`,
`investigate_flags.py`/`investigate2.py`/`investigate3.py` — used to
investigate and resolve the classifier's flags without ever printing
command text).
