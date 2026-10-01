VERDICT: APPROVE ba985167ef11bdaf74c0b380d59de7f39dcf19ba

# Lane 60 phase 2 — delta red-team of fix round 2 (ba98516 on 12589fc)

Reviewed the fix at `ba985167ef11bdaf74c0b380d59de7f39dcf19ba` against ruling
r3 (git log/diff flags become a POSITIVE ALLOWLIST; format/pretty allowed only
with no content placeholder; git show never exempt; "when unsure, deny"),
ruling r2/r1, the prior finding N2 (p2-review-r2.md), and the builder report
p2-fix2-build.md.

Read-only on the worktree. Scratch under `/var/tmp/delegation-l60rt3-ityX`.
Probes were JSON payloads fed to the hook with FAKE, nonexistent secret-shaped
paths (a dotenv-shaped placeholder built by runtime concatenation); no probe
was executed as a command, and no secret/transcript/command text is reproduced
here. Trial instrumentation was done only on a scratch COPY of the hook
(`hook-dbg.sh`); the reviewed tree was never modified. One of my own harness
heredocs was refused by the live guard (it carried guard trip-words); I moved
that harness to a scratch file written via the editor and never obfuscated.

Bottom line: N2 is closed. The git log/diff allowlist holds against every
attack vector in the brief — no content-leaking shape retains the exemption,
and every unlisted/ambiguous shape fails closed to a full scan (deny). H and Q
are bit-identical to 12589fc. Tests discriminate (4 new cases red on 12589fc).
Replay: 0 regressions, 0 real reads, 59 now-passing. Allow-path 40–42 ms.

C4 fields (for the integrator gate — the N2 fix I verified):
- Cause: the git log/diff exemption was a DENYLIST of patch-form flags
  (`-p|-u|--patch|-U<n>|--full-diff|-G|-S`); `-L<range>:<file>` /
  `-L:func:<file>` prints file content across history and was not listed, so
  the invocation stayed exempt and the secret path was blanked.
- Discriminating check: `git log -L<range>:<secret>` and `-L:func:<secret>` —
  DENY on c890801, allowed on 12589fc, DENY again on ba98516; verified by 4 new
  selftest cases RED on the 12589fc snapshot and GREEN on the fix.
- Fix location: `git_log_diff_flags_allowed` (new helper) plus
  `GIT_LOG_DIFF_SAFE_FLAGS` / `GIT_LOG_DIFF_SAFE_FORMAT_PLACEHOLDERS`
  constants, and the two call sites in `strip_safe_existence_operands`, in
  `dot_claude/hooks/executable_secret-guard.sh`.
- Simplification: the whole handling is now a positive allowlist — any flag not
  on the list (including any short-flag cluster) withholds the exemption for
  the whole invocation, so an unlisted content flag now fails closed by
  construction rather than by enumeration.

---

## Task 1 — N2 closed (verified)

`git log -L<range>:<secret>` and `git log -L:func:<secret>` now DENY on the
fix (probe + selftest). The line-range flag and the function-range flag no
longer get the exemption: both fail the positive allowlist. The 2 N2 selftest
cases (`-L<range>`, `-L:func:`) plus 2 more (`-W`, `-ns` cluster) are RED on
the 12589fc snapshot (70 passed / 4 failed with the current corpus) and GREEN
on the fix (74/74). Confirmed the reviewed hook is not executable in the source
tree, so all invocations went through `bash <hook>`.

## Task 2 — allowlist attack surface (no bypass found)

Every content-leaking shape denies; every unlisted/ambiguous shape fails closed
to a full scan. Verified by direct probes (fake secret operand) against the fix
hook and, for the format logic, by isolating `git_log_diff_flags_allowed` and
by instrumenting a scratch copy:

- Attached / equals forms: `-U5`, `-Gfoo`, `-Sfoo`, `--patch`,
  `--patch-with-stat` → DENY. `--max-count=5`, `-n5`, `-5`, `--date=iso`,
  `--since=…` → allow (metadata). `--max-count 5` (separated two-token form)
  → DENY (conservative; builder deviation #3), safe direction.
- Abbreviated long options (git prefix-matching): `--form=%H` (prefix of
  `--format`) → DENY. No dangerous option can be spelled as a safe-listed
  literal, because the allowlist matches whole tokens against exact real
  option names; every abbreviation of a dangerous flag fails the match and
  fails closed. Safe both directions.
- Short-flag clusters: `-ns`, `-pp` → DENY (never match a single listed entry
  as a whole token).
- Flags after `--`: `git log --stat -- -L<range>:<secret>` → DENY (the `-L`
  token is still checked and withholds the exemption; over-deny, safe). A
  dangerous flag placed after `--` is a git pathspec (harmless to git) and is
  denied regardless.
- Format / pretty placeholders: metadata placeholders (`%H`, `%s`, `%aN`,
  `%n`, `%x41`, `format:%H`, `pretty=medium`, `pretty=raw`) → allow;
  content-ambiguous / unknown placeholders (`%(trailers)`, `%w(80)`, `%Cred`,
  and any parenthesized/unknown `%(...)`) → DENY. No git pretty-format
  placeholder prints tracked-file bytes, so no leak path exists here; the
  check fails closed on anything it does not positively recognize. (Note: my
  first probe pass appeared to allow `%(trailers)` — that was a Python `%%`
  string-concatenation artifact in my harness sending a literal double
  percent; corrected single-percent probes, the isolated function, and the
  instrumented hook all confirm `%(trailers)` DENIES. Builder report claim is
  correct.)
- Config overrides / textconv / external diff: `git -c diff.external=cat diff
  --stat <secret>` and `GIT_EXTERNAL_DIFF=cat git diff --stat <secret>` and
  `git diff --stat --ext-diff <secret>` → all DENY. The `-c` form is not
  detected as an exempt `git log`/`git diff` invocation (the detector requires
  `git` immediately followed by `log`/`diff`), so it is scanned and the secret
  path denies; `--ext-diff` is not on the allowlist. `--stat` never triggers
  external-diff generation anyway.
- Aliases: any non-`git log`/`git diff` verb (`git <alias> <secret>`) is not
  exempted → scanned → denies on the secret path.
- Revision operands naming blob content: content requires a patch flag (all
  denied); `git diff --stat <blobA> <blobB>` and `git log --oneline <range> --
  <secret>` emit only metadata/line-counts.
- Environment variables: `GIT_EXTERNAL_DIFF`/pager vars add no file content
  under the stat-family flags that the diff exemption requires; probe denies.
- Separators / whitespace: newline-, `;`-, `&&`-, and `|`-separated dangerous
  second segments (`-p`/`-L`) → DENY via the blanket per-verb bail; tab-
  separated `-p` → DENY (`read -ra` splits tabs); leading `FOO=1 git log -p`
  and `(git log -p …)` → DENY.

`git diff` with zero flags (`git diff -- <secret>`, full unified patch by
default) → DENY; the r2 carry-over requiring at least one stat-family shape
flag is intact and correct.

## Task 3 — H and Q not regressed

The three diff hunks are all inside the git-log/diff block (script lines
~1325–1521): the comment block, the new constants + `git_log_diff_flags_allowed`
helper, and the two call sites in `strip_safe_existence_operands`. The heredoc
exemption (H) and the substitution / F4 ls-pipe logic (Q) are byte-identical to
12589fc. The replay corpus counts are identical to fix round 1 (0 regressions,
59 now-passing), consistent with H/Q being untouched.

## Task 4 — selftest and replay (counts)

- Selftest at the fix: 74 passed, 0 failed (of 74).
- Full-length replay, OLD=c890801 vs NEW=ba98516, over the deduped corpus:
  - paired refused Bash commands (deduped): 397
  - denied OLD: 362; denied NEW: 303
  - now passing: 59
  - regressions: 0
  - now-passing classified REAL READ: 2 — both `ls-pipe-reader`, the known
    false flags the prior round traced (F4 logic unchanged this round, so the
    classification and its refutation carry forward). Structural real reads in
    the now-passing set: 0.
- Allow-path cost (40-run avg, this machine): `ls -la` 39.8 ms, `git status`
  41.7 ms, `git log --stat -- <file>` (exercises the new allowlist path)
  40.8 ms. All under the 60 ms budget (c890801 baseline 32–33 ms).

## Task 5 — tests discriminate

The 4 new deny-cases are RED on the 12589fc snapshot (70/74) and GREEN on the
fix; the 3 kept-allowed controls (`--stat --`, `--oneline -n 5 --`,
`git diff --stat`) pass on both builds. The tests go red on 12589fc for the
right reason (the `-L`/`-W`/cluster gap), so they discriminate the fix.

## Denylist-twin hunt (the -L bug class)

No remaining allow-direction denylist in the exemption paths. The git handling
is now a positive allowlist (unlisted → fail closed). The `$(`/backtick
substitution bail and the F4 ls/stat pipe-onward bail are fail-CLOSED denylists
(match → do not exempt → scan → deny); a missing entry there means the text is
not exempted, i.e. it still denies — the safe direction. The heredoc H
exemption is a positive allowlist (only `cat >file` / `tee file`). Nothing in
the exemption logic grants an exemption from a denylist that could miss an
entry the way `-L` was missed.

## Non-blocking observations (not findings)

- Conservative false-denies that lose the exemption but are safe and cause 0
  corpus regressions, consistent with r3's "when unsure, deny": `--max-count 5`
  (separated), `--decorate=full`/`--stat=200` (valued variants of listed
  bare flags), and a double-quoted multi-word `--format="%H %s"`. All emit
  metadata only; losing the exemption merely falls back to a normal scan.
  No action required.

## Verified-sound areas (first-class negatives)

- N2's `-L`/`-L:func:` leak is closed; verified by probe and by discriminating
  selftest.
- The git log/diff allowlist has no false-ALLOW across attached/equals forms,
  abbreviations, short-flag clusters, post-`--` flags, format/pretty
  placeholders and named formats, `-c`/textconv/external-diff, env vars,
  revision operands, and every separator form tested.
- H and Q are byte-identical to 12589fc; 0 regressions in the 397-command
  replay; allow-path within budget.

## Scratch

All under `/var/tmp/delegation-l60rt3-ityX`: hook snapshots (c890801, 12589fc,
ba98516), the instrumented debug copy, the isolated-function test, and the
probe/timing/replay harnesses. Nothing in the reviewed tree was modified;
nothing deleted.
