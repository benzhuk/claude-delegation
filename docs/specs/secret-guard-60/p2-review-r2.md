VERDICT: NEEDS_FIXES 12589fc2ad12f48eb213981dc42044d9ab6be110 (1)

# Lane 60 phase 2 — delta red-team of fix round 1 (12589fc on fb48a92)

Reviewed the fix at `12589fc2...` against ruling r2 (each exclusion is now a
positive allowlist; everything else scanned as at c890801; "when unsure,
deny"), the builder report `p2-fix1-report.md`, and my round-1 findings.

Notation: `SECRET`/`SDIR` = fake secret path/dir placeholders, `READ` = a
byte-reading verb, `INTERP` = an interpreter/executor, `SUBST` = a command
substitution. No real command text, transcript content, path literal or key
appears below. Probe payloads were fed to the hook as JSON with fake paths
built by runtime concatenation; no probe command was executed. Trial fixes
were made only on scratch copies under `/var/tmp/l60p2rt-D6kg/`; the reviewed
tree was never modified. Several of my own tool calls were refused by the
live guard (sourcing/env-dump/secret-echo patterns tripped by tokens in my
own script text); I reported and reworded each and never obfuscated.

GOAL line served: "work lost or stalled". Nearest NOT: "a rule no script
checks" — the git-flag exemption is a denylist that misses a content flag.

Bottom line: F1–F6 are closed and the sourcing fix is sound. One real read
still passes: `git log -L<range>:<file>` (and `-L:func:file`) prints the
secret file's content across history but is not in the patch-form denylist.

C4 fields (finding N2, for the integrator gate):
- Cause: the git-log/diff exemption is implemented as a DENYLIST of
  patch-producing flags (`-p|-u|--patch|-U<n>|--full-diff|-G|-S`); `-L`,
  which prints file content, is not in it, so an `-L` invocation stays
  exempt and the secret path is blanked.
- Discriminating check: `git log -L1,20:SECRET` and `git log -L:func:SECRET`
  — DENY on c890801, allow on 12589fc; `git log --stat`/bare `git log`/
  `git diff --stat` stay allowed.
- Fix location: `strip_safe_existence_operands` in the hook script — the two
  `grep -qE` patch-form alternations for `git log` and `git diff`.
- Simplification: prefer a positive allowlist of known-safe git-log flags
  over the denylist (matches r2's stated principle); minimally, add `-L`.

---

## Task 1 — F1–F6 verified closed (all re-run against 12589fc)

Each round-1 bypass shape now DENIES on 12589fc (each still DENY on c890801;
the fix restores c890801 behaviour for the dangerous shapes):

- F1 (executing heredoc): an INTERP-fed quoted heredoc (bash / sh -s /
  python / node / ssh), a heredoc piped into a shell, the double-quoted
  delimiter, and the unterminated form — all DENY. A file-authoring heredoc
  (`cat >file` / `tee file`) is exempt only as intended; a real read on a
  line AFTER such a heredoc, or on its intro line after `;`, is still scanned
  and DENIES. Process-substitution targets (`cat >>(...)`, `tee >(...)`) and
  fd redirects (`>&2`) fall through to a full scan and DENY.
- F2 (substitution operand): a SUBST reading SECRET as the operand of
  ls/stat/test/`[`/wc -c/echo, and the backtick form, all DENY (the blanket
  `$(`/backtick bail fires).
- F3 (git content): `git log -p`/`-u`/`--patch`/`-U<n>` and `git diff` with a
  patch flag all DENY. (Gap: `-L` — see N2.)
- F4 (lister piped to reader): `ls SDIR | xargs READ` DENIES (the ls/stat
  pipe-onward bail fires).

Important correction to my own method: my round-1 constructed heredoc probes
used a literal backslash-n for line breaks, which `json.dumps` double-escapes
to `\\n` on the wire. A real multi-line Bash `command` carries actual
newlines, encoded as a single `\n`. Under the double-escaped form the hook's
`\\[nr]` normalization leaves a stray backslash on each line that corrupts
the heredoc delimiter match and made the strip appear to drop everything
after the heredoc. Re-run with faithful real-newline encoding, that apparent
"trailing-read-after-file-heredoc" bypass does NOT exist — the trailing read
is scanned and denied. I verified this both ways and confirm the H allowlist
is sound. (My round-1 corpus replay used real transcript commands, i.e.
faithful encoding, so its counts were unaffected.)

## Task 2 — the F2 patch parses; the builder's correction is right

The builder is correct that a double-quoted `*"$("*` case pattern does not
parse (`bash` reads it as a live substitution). The committed helpers use
single-quoted patterns `*'$('*|*'`'*`, which `bash -n` accepts and which
behave correctly (confirmed: `bash -n` clean; F2 shapes deny; intended
allows preserved). My round-1 report text already showed the single-quoted
form; the earlier scratch file `fix2.sh` that failed `bash -n` was a
superseded attempt, not the verified `fix3.sh`. No issue here.

## Task 3 — the 7th (sourcing) fix is sound

`has_source_sourcing` now runs on raw `$CMD_SCOPE` behind its own
comment-stripped `path_pattern_hit` gate, matching c890801 exactly, instead
of the heredoc/comment-stripped `SECRET_PATH_SCOPE_H`. Verified: plain
`source SECRET` and dot-source of SECRET DENY on all three builds; a
`source SECRET` mention inside an authored (quoted, cat>file) heredoc body
is allowed — correct, because authored heredoc content is literal and never
executed, so it is not a real read. The change is a faithful c890801
restoration of a check that was never one of the two narrowed patterns; no
regression introduced (0 regressions in the full replay, below).

## Task 4 — allowlist attack: one real read gets through (N2)

Confirmed HARMLESS (allowlist holds): a file-authoring heredoc followed by a
`;` and a reader on the same line (scanned, DENIES); a tee/cat whose target
is a process substitution (bail → DENIES); `cat >&2` (fd, not a file →
DENIES); `git log --stat`/bare `git log`/`git diff --stat`/`--name-only`
(metadata, correctly allowed); `git show` (never exempt, DENIES).

### N2 — HIGH — `git log -L<range>:<file>` leaks file content

`git log -L1,20:SECRET` and `git log -L:func:SECRET` trace the content of the
given line range / function across history — the secret file's bytes into
the transcript. The patch-form denylist in `strip_safe_existence_operands`
does not list `-L`, so these stay exempt and the path is blanked. Verified:
DENY on c890801, allow on 12589fc. This is a real read the lane exists to
stop; per r2's own "everything else scanned exactly as at c890801 / when
unsure deny," it must deny.

Ready-to-apply patch (VERIFIED on scratch: closes `git log -L`/`-L:func`;
keeps `git log --stat`, bare `git log`, `git diff --stat` allowed; selftest
stays 67/67). In `strip_safe_existence_operands`, both patch-form
alternations (the `git log` one and the `git diff` one) read:

Old:
```
(-p([[:space:]]|$)|--patch|-u([[:space:]]|$)|--full-diff|-G|-S|-U[0-9])
```
New:
```
(-p([[:space:]]|$)|--patch|-u([[:space:]]|$)|--full-diff|-G|-S|-U[0-9]|-L|-W|--ext-diff)
```
(`-L` is the confirmed content leak; `-W`/`--ext-diff` do not leak on their
own but are cheap defensive additions the brief asked about.) Add a
discriminating selftest case for `git log -L` (RED on 12589fc, GREEN after).

Deeper recommendation (lead call): the git-flag handling is a denylist,
which contradicts r2's stated "positive allowlist" principle and is why `-L`
slipped. Consider whitelisting the known-safe metadata/format flags instead,
so an unlisted content flag defaults to deny rather than allow.

## Task 5 — full-length replay (counts only), and the builder's flags

Re-ran the extractor over `~/.claude/projects/*/`, deduped, full-length
commands, c890801 (OLD) vs 12589fc (NEW):
- paired refused Bash commands (deduped): 397
- denied on OLD: 362
- denied on NEW: 303
- now passing (OLD deny → NEW allow): 59
- regressions (OLD allow → NEW deny): 0
- OLD denials by reason: secret_path 152, sourcing 144, env_dump 53,
  secret_var 12, printenv 1

Confirmed: the builder's 59-now-passing and 0-regressions are exact.

The builder's "2 classifier flags, both false" — confirmed structurally. The
two are `ls|reader`-shaped commands; the F4 pipe-onward bail disables the
ls/stat exemption for them, and the actual pass came from an unrelated
intended bullet elsewhere in each long command, not the ls-pipe. They are
not real reads.

One caveat the builder's classifier missed (does not change the verdict): a
mechanism-based pass I ran (comparing the comment-stripped vs
heredoc-stripped scope for each now-passing command) found 1 command whose
secret token is dropped by the heredoc strip. Inspected structurally: the
token is NOT positioned after any heredoc delimiter — it is authored body
content, not an executed read — so it is a false flag too. Net real reads in
the now-passing corpus set: 0. (N2's `git log -L` does not appear in this
corpus — 0 `-L` commands — but is reachable, hence flagged by construction.)

## Task 6 — allow-path cost (40-run averages, this machine)

- allowed `ls -la`: c890801 33ms → 12589fc 42ms
- allowed `git status`: c890801 34ms → 12589fc 41ms

~+8-9ms (~25%) over c890801, still inside the prior 60ms budget. Acceptable,
though the cumulative phase-2 additions have roughly doubled the delta the
round-1 build carried; worth watching if more exclusions are added.

## Verified-sound areas (first-class negatives)

- 0 regressions across 397 full-length corpus commands and all constructed
  controls; nothing c890801 allowed is now denied.
- Exclusion H is sound under faithful encoding: every executing-heredoc and
  edge shape denies; only the literal file-authoring shape is exempt.
- Exclusion Q's substitution bail closes every F2 shape; the ls/stat
  pipe-onward bail closes F4; non-substitution real reads (plain read/copy/
  source, `git show`, non-`--stat` diff, patterns-from-file) still deny.
- Selftest 67/67 green on 12589fc; the 6 new F1–F4 deny cases are RED on
  fb48a92 (discriminating). Only gap: no `git log -L` case yet (add with N2).

## Scratch

All trial edits/probes under `/var/tmp/l60p2rt-D6kg/` (old/fb48a92/12589fc
snapshots, the verified N2 patch `fixN2.sh`, faithful-encoding probes, the
replay/inspection scripts). Nothing in the reviewed tree was modified.
