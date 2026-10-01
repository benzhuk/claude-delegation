DONE ba985167ef11bdaf74c0b380d59de7f39dcf19ba

# Lane 60 phase 2, fix round 2: git log/diff flags as a positive allowlist

Territory: `/var/tmp/lane-60/dot`, branch `build/secret-guard-60-1`, fixing
finding N2 from `docs/specs/secret-guard-60/p2-review-r2.md` (NEEDS_FIXES (1)
on `12589fc2ad12f48eb213981dc42044d9ab6be110`), per
`docs/specs/secret-guard-60/ruling-r3.md`, committed at
`ba985167ef11bdaf74c0b380d59de7f39dcf19ba`.

GOAL line served: "work lost or stalled" (the secret guard blocking or
silently letting through real reads is direct rework/trust cost on every
agent host). Nearest NOT: "a rule no script checks" — this round exists
specifically because the prior denylist form let one shape (`-L`) through
that no test caught; the new allowlist plus its selftest coverage closes
that class of gap going forward, and any future unlisted flag now fails
closed by construction instead of by enumeration.

## Files changed
- `dot_claude/hooks/executable_secret-guard.sh`
- `dot_claude/hooks/executable_secret-guard-selftest.sh`
- `dot_claude/hooks/INSTALL-secret-guard.md`

(`secret-guard-replay-extractor.py`, the full-length replay tool from fix
round 1, was used unmodified — no change needed to it this round.)

## What changed (N2, per ruling r3)

`strip_safe_existence_operands`'s `git log`/`git diff` flag handling was a
DENYLIST of patch-form flags (`-p`/`-u`/`--patch`/`-U<n>`/`--full-diff`/
`-G`/`-S`); `-L<range>:<file>` / `-L:func:<file>` (prints the given line
range or function's content across history — a real read) was not in it, so
it stayed exempt and the secret path was blanked. Ruling r3 replaces this
with a positive allowlist: every flag a `git log`/`git diff` invocation
carries must be on the list, or the exemption is withheld entirely for that
whole invocation and the path is scanned exactly as at c890801.

**New helper**, `git_log_diff_flags_allowed "log"|"diff" "<segment>"`, added
to `executable_secret-guard.sh` just above `strip_safe_existence_operands`,
backed by two new module-level constants:

- `GIT_LOG_DIFF_SAFE_FLAGS` — the exact list from ruling r3: `--`,
  `--stat`/`--shortstat`/`--numstat`, `--name-only`/`--name-status`,
  `--oneline`/`--graph`/`--decorate`/`--no-decorate`/`--abbrev-commit`/
  `--no-merges`/`--merges`/`--reverse`/`--all`/`--follow`, `-n`/`-n<N>`
  (bare `-n` takes its count as a separate token; `-nN` attached is also
  matched), `-<N>` (bare digit shorthand, e.g. `-5`), `--max-count=<N>`,
  `--skip=<N>`, `--since=`/`--until=`/`--after=`/`--before=`/`--author=`/
  `--committer=`/`--date=`/`--format=`/`--pretty=`. A combined short-flag
  cluster (e.g. `-ns`, `-ps`) never matches any single entry on this list as
  a WHOLE token, so it always fails and withholds the exemption — no special
  cluster-detection code needed, the whole-token match does it.
- `GIT_LOG_DIFF_SAFE_FORMAT_PLACEHOLDERS` — the git-log pretty-format
  placeholders known to print commit metadata only (hash/tree/parent ids,
  author/committer identity and every date form, subject/body, ref
  decoration, GPG signature info, reflog info, the mbox separator, a literal
  `%`/newline, a raw hex byte). A `--format=`/`--pretty=` value is checked by
  stripping every recognized-safe placeholder and confirming no `%` is left
  over; any residual `%` (including a parenthesized/unknown form like
  `%(trailers)`) means doubt remains, per ruling r3's own text, and
  withholds the exemption for that whole `git log`/`git diff` invocation.

**Quote-awareness**: `CMD_SCOPE` (and so the text this function receives) is
the RAW JSON payload text, not a JSON-decoded shell command — a
double-quoted shell argument appears as a literal backslash-then-quote pair
at each end (JSON's `\"` escape), a single-quoted one as a literal quote
char at each end. The `--format=`/`--pretty=` value is extracted and
validated BEFORE tokenizing the segment into words, specifically because a
quoted, multi-word value's later shell-words don't start with `-` and would
otherwise be silently skipped by the per-token allowlist check as "not a
flag" — checking the whole extracted value up front closes that gap.
Verified both the escaped-double-quote and single-quote shapes on scratch
before touching the reviewed file (see Scratch, below).

**`git diff` still additionally requires** at least one of
`--stat`/`--shortstat`/`--numstat`/`--name-only`/`--name-status` to be
present at all — carried forward from ruling r2, not repealed by r3: r3's
allowlist says which flags are SAFE, it doesn't say zero flags is safe for a
command whose *default* output is the full unified patch (real content).
Without this, a bare `git diff -- <secret>` would vacuously satisfy "every
flag is on the list" (zero flags) and wrongly gain the exemption — flagged
explicitly in the state file as an interpretive call worth a reviewer's
eyes. `git log` carries no such extra requirement (bare `git log` was always
safe, pre-dating phase 2 entirely). `git show` stays never exempt
(unchanged).

**Call site**: `strip_safe_existence_operands`'s `*git*)` case now extracts
every `git log ...`/`git diff ...` segment in the whole scope and bails
(blanket, for that whole verb across the scope) the instant ANY one segment
fails `git_log_diff_flags_allowed` — the same blanket-bail philosophy the
file already uses for the command-substitution bail and F4's ls/stat
pipe-onward bail ("when unsure, deny" for the whole scope, not just the one
offending invocation).

## Selftest (ruling r3's required cases)

7 new cases, plus the existing 67 untouched:
- `git log -L1,20:<secret>` — RED on 12589fc, GREEN after (deny).
- `git log -L:func:<secret>` (using `-L:main:` as the sample) — RED on
  12589fc, GREEN after (deny).
- `git log -W -- <secret>` (unlisted flag) — RED on 12589fc, GREEN after
  (deny).
- `git log -ns -- <secret>` (combined short-flag cluster) — RED on 12589fc,
  GREEN after (deny).
- Controls, straight from ruling r3's own kept-allowed list: `git log
  --stat -- <secret>`, `git log --oneline -n 5 -- <secret>`, `git diff
  --stat <secret>` — all allow on both builds (unaffected).

Gate:
```
TMPDIR=/var/tmp bash dot_claude/hooks/executable_secret-guard-selftest.sh
```
Result: `secret-guard-selftest: 74 passed, 0 failed (of 74)`. Log:
`/var/tmp/lane-60/p2-fix2-gate.log`.

Red/green confirmed against `12589fc2ad12f48eb213981dc42044d9ab6be110`:
`HOOK_BIN=<12589fc snapshot>` gives 70 passed, 4 failed — exactly the 4 new
N2/allowlist discriminating deny-cases (the 3 new allow-controls already
passed on 12589fc too, since they don't exercise the `-L` gap).

## Full-length replay (ruling r3's required measure)

Ran `dot_claude/hooks/secret-guard-replay-extractor.py` (unmodified from fix
round 1) against `c890801f58f7068db66ee1548ce9a7b604df22b4` (OLD) and this
commit (NEW), over the same 397 deduped, full-length real Bash commands used
in every prior round's measure:

```
paired refused Bash tool_uses (full cmd available), deduped: 397
denied on OLD: 362
denied on NEW: 303
now passing (old DENY -> new allow): 59
regressions (old allow -> new DENY): 0
now-passing classified as REAL READ: 2 (both known, already-verified false
  flags — see below)
```

- **0 regressions.**
- **Now-passing count: 59** — unchanged from fix round 1. Expected: N2's
  `-L` gap does not appear anywhere in this real corpus (0 `-L` commands, as
  the reviewer already noted in p2-review-r2.md), and this round's diff
  touches only the git-log/diff flag-handling block plus its own new helper
  function — nothing else. Confirmed via `git diff dot_claude/hooks/
  executable_secret-guard.sh` that no line outside the git-block/new-helper
  changed, so every other narrowed pattern (H, the substitution bail, F4's
  ls/stat pipe bail, the sourcing-check gate) is bit-for-bit what fix round
  1 already verified — the corpus numbers being identical is the expected,
  correct result, not a stale measurement.
- **2 classifier flags, both already proven false in fix round 1's
  investigation** (`REAL-READ:ls-pipe-reader`, unaffected by this round's
  diff since F4's logic wasn't touched): the F4 pipe-onward bail correctly
  disables the ls/stat exemption for the whole command in both cases; the
  actual pass comes from an unrelated, intended bullet elsewhere in each
  long real-world command, not from the ls-pipe shape the classifier's
  regex coincidentally matched. Full mechanism trace from the round that
  found this: `/var/tmp/lane-60/p2-fix1-replay.md`.
- **Structural real reads in the now-passing set: 0.**

## Allow-path cost (ruling r3's required measure, 40-run averages)

- allowed `ls -la`: this build 42ms (c890801 baseline on this machine: 34ms)
- allowed `git status`: this build 42ms (c890801 baseline: 34ms)

Both well under the 60ms budget, and match the reviewer's own 41-42ms
measurement at 12589fc — no measurable added latency from this round's
change, because plain `ls -la` and `git status` never reach the new
git-flag-allowlist code path at all (neither is a `git log`/`git diff`
invocation; the two cheap `grep -oE` segment-extraction calls that DO run
unconditionally on any "git"-containing command find zero matches for
`git status` and cost the same as before).

## Deviations / assumptions

1. Kept ruling r2's "`git diff` needs a shape-limiting flag present" rule
   even though ruling r3's allowlist text doesn't restate it. Read r3 as
   extending r2's allowlist-of-flags, not repealing r2's separate
   requirement that at least one such flag be present at all for diff —
   dropping it would let a bare, unflagged `git diff -- <secret>` (full
   unified patch, real content, by default) vacuously satisfy "every flag is
   on the list" with zero flags and wrongly gain the exemption. Flagged for
   the reviewer in the state file.
2. `--format=`/`--pretty=` safety is judged against a curated, explicit list
   of known git-log metadata placeholders (letters/pairs only — `%H`, `%an`,
   `%ad`, `%s`, `%b`, `%d`, `%GG`, `%gd`, `%x<hex>`, etc.), not a full
   grammar of git's placeholder syntax. Any `%` sequence not on that list —
   including a parenthesized form like `%(trailers)`, which git log does
   support but this hook doesn't specifically vet — is treated as
   unrecognized and withholds the exemption for the whole invocation. This
   matches ruling r3's own "if doubt remains, drop them from the list", and
   the failure direction is conservative (loses the exemption, i.e. falls
   back to being scanned normally) rather than unsafe.
3. `--max-count=`/`--skip=`/`--since=`/etc. are only recognized in their
   attached (`--flag=value`) form, matching how ruling r3 lists them (with a
   trailing `=`). A separated two-token form (e.g. `--max-count 5`) is not
   specifically recognized and would withhold the exemption — conservative,
   not a security gap.
4. `-n`/`-N` semantics: bare `-n` is allowed (its count is a separate,
   non-flag token, already ignored by the per-token check regardless of
   content); `-n<digits>` (attached) and bare `-<digits>` (e.g. `-5`) are
   each matched narrowly (`-n[0-9]+`, `-[0-9]+`) so a combined cluster like
   `-n5p` (patch flag riding along) does NOT match either and correctly
   fails.

## Cleanup

No dev server or background process was started. Only one-shot script
executions (selftest, timing script, replay extractor, scratch prototype
probes). Nothing to kill.

## Scratch

Under `/var/tmp/delegation-l60p2f2-D0op/`: `proto.sh` (the
`git_log_diff_flags_allowed` prototype, exercised against ~25 constructed
allow/deny cases including the RAW-JSON escaped-quote shape, before the
function was ever pasted into the reviewed file), `snapshots/` (the c890801
and 12589fc hook snapshots used for the replay and red/green checks),
`time_allow.sh` and the two sample JSON payloads used for the allow-path
timing measure, and the full replay output
(`replay-c890801-vs-fix2.txt`). Left in place per the hard rule against
deleting anything.
