VERDICT: NEEDS_FIXES fb48a924a5988c3808eacebae93aa7c08d581bc1 (6)

# Lane 60 phase 2 red-team — secret guard narrowed deny patterns

Reviewed: the hook script at `fb48a924...` (one commit on `c890801f...`),
against `docs/specs/secret-guard-60/spec.md` (phase 2) and `ruling-r1.md`
("When unsure, deny. Every doubt resolves to deny.").

Notation: `SECRET` = a fake secret-path placeholder (never a real path
literal), `SDIR` = a fake secret directory, `READ` = any byte-reading verb,
`INTERP` = any interpreter/executor, `SUBST` = a command substitution. No
real command text, transcript content, path literal or key appears below;
every shape is described structurally.

GOAL line served: "work lost or stalled" (a guard that lets real secret
reads through is the failure this lane exists to prevent). Nearest NOT:
"a symptom fix" — the narrowing cut noise but opened real-read holes.

Read-only review. Probe payloads were fed to the hook as JSON with fake
paths/keys built by runtime concatenation; no probe command was executed.
Trial fixes were made only on scratch copies under `/var/tmp/l60p2rt-D6kg/`
and never touched the reviewed tree. Several of my own tool calls were
refused by the live guard (twice on a Bash call, once on this Write for an
embedded read shape); I reported and reworded each and never obfuscated to
slip past.

C4 fields (primary finding F2, for the integrator gate):
- Cause: the "blank the safe shape then re-check" design removes the secret
  path token even when that same token is simultaneously part of an
  executing construct (SUBST, executing heredoc, pipe to a reader), so the
  re-check no longer sees a read that still runs.
- Discriminating check: feed `<safe-verb> SUBST` and an INTERP-fed
  quoted-delimiter heredoc whose body reads SECRET, through old vs new; old
  denies, new allows, but the read executes.
- Fix location: the three phase-2 strippers and the git-log operand rule in
  the hook script (strip_safe_existence_operands, strip_search_pattern_-
  arguments, strip_quoted_heredoc_bodies).
- Simplification: guard each stripper with a deny-bias bailout on any
  SUBST / executor-heredoc / pipe-to-reader before it blanks anything.

VERDICT: NEEDS_FIXES. Four HIGH real-read bypasses, all introduced by phase
2 (each denies on `c890801`, allows on `fb48a92`), plus a materially
incomplete now-passing measurement and a discriminating-test gap.

---

## F1 — HIGH — Exclusion H blanks the body of a heredoc that EXECUTES

`strip_quoted_heredoc_bodies` (hook script, def near line 1184) blanks the
body of ANY quoted-delimiter heredoc unconditionally. The ruling's premise
("literal content being written, the shell expands nothing in it") holds
only when the heredoc is data to a non-executing sink. A quoted delimiter
merely disables expansion inside the heredoc TEXT — it says nothing about
whether that text is then executed. When the heredoc is stdin to an INTERP,
or piped into a shell, the body runs verbatim, and blanking it hides the
read.

Verified on the real artifact (old=`c890801`, new=`fb48a92`), fake paths,
bodies built at runtime. All of these were DENY on old and are allow on new:
- INTERP `<<'Q'` whose body READs SECRET, for INTERP in
  bash / sh -s / python / node / ssh.
- a heredoc piped into a shell (`... <<'Q' | bash`) whose body READs SECRET.
- the double-quoted-delimiter form (`<<"Q"`).
- an UNTERMINATED quoted heredoc whose (never-closed) body READs SECRET.
These are real reads that now pass. An environment dump inside such a body
also passes (that one already passed on old too — see F7).

Fix (judgment — get executor detection right; deny-bias interim):
`strip_quoted_heredoc_bodies` must NOT blank a body when an INTERP governs
the heredoc (an interpreter/executor token immediately introducing `<<`) or
when the heredoc is piped into a shell. Only the literal-authoring shape (a
heredoc redirected to a file or consumed by a non-executing sink) may be
exempted.

Caveat proven on scratch: a naive `grep -qE` guard listing the executor
tokens DOES close every executing case above, but the helper runs on
`CMD_SCOPE` (the whole description-stripped JSON payload, not the bare
command), so a `[^|;&]*` gap bridges JSON structure and the `sh` inside
`"tool_name":"Bash"` matches — over-denying even benign file-authoring
heredocs. The clean fix therefore needs (a) word boundaries on the executor
list and (b) a gap that does not cross JSON string/quote boundaries, or
detection on the extracted command value rather than the whole payload.
Over-denying is at least safe; the current under-denying is the live hole.
This is not a one-line patch — do not ship a blanket strip.

## F2 — HIGH — Exclusion Q blanks a command-substitution operand

`strip_safe_existence_operands` (def near line 1264) and
`strip_search_pattern_arguments` (def near line 1236) blank an operand
region with `[^;\&|]*` / `[^"]*`, which swallows an embedded SUBST (either
`$(...)` or the backtick form) whole. The SUBST executes at runtime, so
blanking it hides the read and the re-checked text no longer holds the path.

Verified (fake paths, reader built at runtime; each DENY on old, allow on
new): a SUBST that READs SECRET, sitting as the operand of `ls`, `stat`,
`test`, the `[ ... ]` builtin, `wc -c`, or inside a double-quoted `echo`
argument; and the backtick form of the same. The same class reaches
narrowing E, which shares `strip_search_pattern_arguments`.

Ready-to-apply patch (VERIFIED on scratch: closes every case above, keeps
the intended allows — glob existence listing, a quoted prose mention, an
existence test chained with `&&` — and keeps the selftest at 58/58). Insert
this deny-bias bailout immediately after the `local ...` declaration line at
the top of BOTH helpers. The case patterns MUST be single-quoted; a
double-quoted `*"$("*` pattern is parsed by bash as an unterminated
substitution and breaks the script (confirmed on scratch). Old → new:

Old (top of each helper), e.g. strip_search_pattern_arguments:
```
strip_search_pattern_arguments() {
  local text="$1" out
  case "$text" in
```
New:
```
strip_search_pattern_arguments() {
  local text="$1" out
  case "$text" in
    *'$('*|*'`'*) printf '%s' "$text"; return 0 ;;
  esac
  case "$text" in
```
and identically in strip_safe_existence_operands, inserting the same
`case "$text" in ... esac` bailout block right after its
`start='(...)'` line and before its existing body.

Predicted outcome: any operand carrying a SUBST is never blanked, so the
re-check still sees the read and denies. Conservative (bails on any SUBST
anywhere in scope) — exactly the ruling's "when unsure, deny".

## F3 — HIGH — `git log` with a patch flag leaks file content

Exclusion Q lists bare `git log` as a metadata-only safe operand, and
`strip_safe_existence_operands` (near line 1273) blanks the entire tail
after `git log`. But `git log` with a patch/content flag (`-p`, `-u`,
`--patch`) prints the file's full content across history. The blanket blank
exempts these content-printing forms.

Verified: `git log` with the patch flag on SECRET — DENY on old, allow on
new (real content leak). Bare `git log` on SECRET (metadata only) is the
intended allow and is fine.

Fix (mechanical direction): do not blank a `git log` invocation carrying a
patch/content flag. Before the git-log sed, bail (leave for deny) when the
text matches `git[[:space:]]+log[^;\&|]*(-p([[:space:]]|$)|--patch|-u([[:space:]]|$)|--full-diff|-G|-S)`.
Only metadata/format-only `git log` stays exempt.

## F4 — HIGH — A lister piped into a reader bypasses the ls/stat exemption

The `ls`/`stat` operand blank drops the secret path token, but the pipeline
continues to a downstream READ that carries no path literal of its own, so
the re-check misses it.

Verified: listing SDIR piped into a reader (`ls SDIR | xargs READ`) — DENY
on old, allow on new. With a file operand this reads the key bytes.

Fix (judgment/mechanical): do not blank an `ls`/`stat` operand when the same
statement pipes into another command. Detect a `|` after the ls/stat operand
(before the next `;`/`&&`) and bail to deny, or require the ls/stat to be the
terminal command of its pipeline segment before exempting it.

## F5 — MED — Now-passing measurement is a gross undercount; ruling proof #3 unmet

The builder's replay (`p2-replay.md`) reports "5 of 33 now pass, 0 real
reads," because it replayed only the corpus's 33 commands truncated to ~200
chars, where truncation removed the very triggers.

I built the full-length measure the brief asks for: programmatically
extracted every Bash `tool_use` under `~/.claude/projects/*/` whose
`tool_result` carried the guard refusal text, deduped by command hash, and
replayed each FULL command through old (`c890801`) and new (`fb48a92`).
Counts only:
- paired refused Bash commands (full text, deduped): 397
- denied on OLD: 362
- denied on NEW: 166
- now passing (OLD deny → NEW allow): 196
- regressions (OLD allow → NEW deny): 0
- OLD denials by phase-1 reason: secret_path 152, sourcing 144, env_dump 53,
  secret_var 12, printenv 1

Of the 196 now-passing, a structural classifier (heredoc-fed-to-executor,
command-substitution-read, git-log patch, lister-piped-to-reader) flags ~101
as real reads. That classifier is a heuristic and may over-count, but the
constructed proofs in F1–F4 are exact, and even the ~16 distinct constructed
shapes alone refute the "0 real reads" claim. Regressions: 0 — the one part
of the builder's claim that holds.

Fix: rerun this full-length measure after F1–F4 land; the now-passing set
must contain zero real reads, and the ruling's proof #3 must be produced
against full-length commands, not ~200-char truncations.

## F6 — MED — Discriminating tests that pass because they aren't looking

`t_phase2_allow_quoted_heredoc_body_mention` (selftest, def near line 980;
fixture near line 85) exercises only a heredoc whose body merely NAMES a
path in prose — the benign literal-authoring shape. There is NO test for a
quoted heredoc fed to an INTERP, which is exactly the shape that turns
exclusion H into a bypass (F1). Likewise there is no case for a SUBST inside
an ls/stat/test/echo operand (F2), none for a patch-flag `git log` (F3), and
none for a lister piped into a reader (F4). The `unquoted_heredoc_cmdsub`
red-team case covers only the UNquoted heredoc (never stripped), so it
cannot catch the quoted-executor hole. These are checks that pass because
they are not looking at the dangerous shape.

Fix: add red-team DENY cases for each of F1–F4 (each RED on `fb48a92`, GREEN
after the fix), and keep a benign file-authoring heredoc case GREEN to prove
the H fix does not over-deny.

## F7 — INFO — Pre-existing env-dump gaps (out of phase-2 scope)

Not introduced by phase 2 (allow on both old and new), noted for a later
lane: `has_env_dump` (def near line 624) misses a python one-liner iterating
the environment mapping's items (the `.items` accessor after the mapping
defeats the bare-object terminator), an environment-dump verb wrapped in a
SUBST inside a search-pattern argument, and an environment dump inside a
heredoc body fed to a shell (the `end` alternation lacks a close-paren and a
real-newline terminator). Fold into the already-held env-dump items.

## Verified-sound areas (first-class negatives)

- Zero regressions: nothing the old hook allowed is denied by the new one,
  across 397 full-length corpus commands and all constructed controls.
- Narrowing E's intended shape is sound where it matters: a bare environment
  dump after a pipe, the `-p` listing forms, and `printenv` (even inside a
  search pattern) all still deny; the PowerShell `env:` enumeration newly
  denies as specified.
- Exclusion Q correctly still DENIES the non-SUBST real-read shapes it must:
  showing SECRET at a revision, a non-`--stat` diff of it, patterns-from-file
  search whose pattern-file IS SECRET, a single-dot/empty search pattern with
  SECRET as the FILE operand (the file operand survives the pattern blank),
  and plain whole-file read / copy / sourcing of SECRET.
- Allow-path cost (item 5), 40-run averages this machine: an allowed `ls`
  32ms→36ms; an allowed `git status` 32ms→35ms. ~3-4ms (~10%) added, inside
  the prior 60ms budget. Acceptable.
- Selftest is 58/58 green on `fb48a92`; on `c890801` it fails the 15
  intentionally-changed cases (the narrowing plus the new PowerShell deny),
  the expected RED-before/GREEN-after direction.

## Scratch

All trial edits and probes under `/var/tmp/l60p2rt-D6kg/` (old/new
snapshots, the verified F2 patch, probe scripts). Nothing in the reviewed
tree was modified.
