DONE fb48a924a5988c3808eacebae93aa7c08d581bc1

# Lane 60, secret-guard phase 2: narrow the two noisiest deny patterns

Territory: `/var/tmp/lane-60/dot`, branch `build/secret-guard-60-1`, started
at `c890801f58f7068db66ee1548ce9a7b604df22b4`, committed at
`fb48a924a5988c3808eacebae93aa7c08d581bc1`.

Files changed (all three named in my brief, nothing else):
- `/var/tmp/lane-60/dot/dot_claude/hooks/executable_secret-guard.sh`
- `/var/tmp/lane-60/dot/dot_claude/hooks/executable_secret-guard-selftest.sh`
- `/var/tmp/lane-60/dot/dot_claude/hooks/INSTALL-secret-guard.md`

## What changed, and why

Ruling r1 named two noisiest deny reasons from the desktop corpus (205
refusals / 105 transcripts): "command references a secret file" (73, 35.6%)
and "command dumps the process environment" (65, 31.7%). 41% of the whole
corpus was read-only lookups; only 1.5% (3 cases) were real reads.

Implemented exactly the ruling's three narrowings, each deny-biased on any
parse hiccup (unrecognized shape still denies — "When unsure, deny"):

- **Exclusion H** (`strip_quoted_heredoc_bodies`): a heredoc with a quoted
  delimiter (`<<'EOF'`/`<<"EOF"`, `<<-`/`<<~` variants) has its body blanked
  before either pattern scans it — literal content the shell expands
  nothing in. An unquoted heredoc (`<<EOF`) is untouched. Applied to both
  the secret-file default-deny check and the env-dump check (and, as a
  bonus fix the ruling explicitly allows, to the sourcing check too — same
  reasoning, same shared scope).
- **Exclusion Q** (`strip_search_pattern_arguments` +
  `strip_safe_existence_operands`), secret-file pattern only: does not deny
  when the secret-file name appears only as a grep/rg/sed/findstr search
  pattern, a grep/rg/findstr file operand under a silencing flag
  (`-l`/`-c`/`-q`), an `ls`/`test`/`[`/`stat`/`wc -c`/`git log`/
  `git diff --stat` operand, or a quoted `echo` string. Implemented by
  DIFFERENCE: blank every recognized safe shape, then re-run
  `path_pattern_hit`; if a hit remains, at least one mention is outside all
  the safe shapes and the default deny still fires.
- **Narrowing E**, env-dump pattern: shares the grep/rg/sed-pattern-argument
  half of Q (`strip_search_pattern_arguments`) — the measured false
  positive it fixes is a `grep` invocation whose search pattern itself
  contains the word "export", denying because that word sat inside the
  search pattern, not because anything was exported. Also adds
  `Get-ChildItem env:` / `gci env:` coverage, which was simply missing
  before phase 2 (grepped the file to confirm: zero prior hits for
  "ChildItem" or "gci").

Deny/allow decisions stay in the hook's existing style (bash functions,
grep-based pattern matching, no jq); the allow path adds no new forks for
the overwhelming majority of commands (every new helper is gated behind the
existing cheap prefilters — `path_pattern_hit`/`has_env_dump` must already
be true before any of the new stripping runs).

## Proof required, per ruling r1

**1. All 3 class-(a) real reads still deny.** 2 of 3 replay directly to a
deny on both old (c890801) and new hooks. The 3rd (session `cb23003e`)
cannot be replayed at all — the corpus's own ~200-char truncation cuts it
off before whatever text actually triggered the original denial, on BOTH
hooks identically (a truncation artifact, not a regression). Per the
ruling's own allowance ("or a structural twin of it with fake paths"), it is
proven by `t_phase2_classA_registry_hunt_secret_path` in the selftest: same
registry-hunt shape, completed with a real secret-path mention matching the
corpus row's own stated reason, denies on both hooks. Full detail and the
truncation caveat: `/var/tmp/lane-60/p2-replay.md`.

**2. Red-team set, every real case still denies.** 15 red-team selftest
cases cover exactly the brief's list: unquoted heredoc with `$(cat secret)`,
`source` of a secret file, whole-file `cp`/`scp` (plus the existing baseline
`cat` case), bare `env`, bare `set`, `export -p`, `gci env:` (new
coverage), `JSON.stringify(process.env)`, `dict(os.environ)`, and a mixed
case (a real read alongside an unrelated quoted heredoc, proving H doesn't
over-exempt). All pass on HEAD.

**3/4. Formerly-refused commands now passing, discriminating tests.** Full
corpus replay of all 33 quoted commands (3 class-a + 15 class-b + 15
class-d; class-c has 0 cases, class-e has no sampled command text) against
both hooks: **5 now pass** (4 class-b, 1 class-d), **0 regressions**
(nothing that old allowed is now denied). Counts and per-command detail in
`/var/tmp/lane-60/p2-replay.md`. 13 additional invented "newly passing"
selftest cases plus the 1 new `gci env:` deny were verified RED on c890801
and GREEN on HEAD by running the whole selftest file with
`HOOK_BIN=<c890801 snapshot>` (44/58 pass there; the 14 failures are exactly
the 14 intentionally-changed cases — no other test regresses).

## Gate

```
TMPDIR=/var/tmp bash dot_claude/hooks/executable_secret-guard-selftest.sh
```
Result: `secret-guard-selftest: 58 passed, 0 failed (of 58)`. Log at
`/var/tmp/lane-60/p2-gate.log`.

Allow-path timing (plain `ls -la`, 30-run average, this machine):
- before (c890801): 34-35ms
- after (this commit): 37-38ms
- delta: ~3ms (~8%), well inside prior rounds' 60ms target.

## Deviations / assumptions

- Corpus class-a row 3's truncation issue (above) — resolved per the
  ruling's own "structural twin" allowance, documented in both the replay
  doc and the selftest.
- Interpreted "Both patterns get the same two exclusions" as: exclusion H
  (heredoc) is literally shared; the search-pattern-argument half of Q is
  literally shared with narrowing E (`strip_search_pattern_arguments`);
  Q's remaining bullets (ls/test/stat/wc -c/git-log/git-diff--stat/quoted-
  echo) have no environment-variable analog and are scoped to the
  secret-file pattern only, per the ruling's own per-pattern framing.
- `Get-ChildItem env:`/`gci env:` is a new deny (gap-close), not a
  narrowing — included because the ruling's own red-team list names it.
- Did not touch `has_allow_carveout`'s internal void-check (it still scans
  unstripped text) — out of scope; the ruling narrows the two named deny
  reasons, not the carveout mechanism.
- Live secret-guard hook (unrelated, still running c890801-era logic on
  this host) fired several benign PostToolUse "SECRET DETECTED" false
  positives while I was reading/editing `executable_secret-guard.sh` itself
  — that file's own key-literal detection arrays contain sample marker
  substrings its own patterns are defined to match, so reading or diffing
  the file trips its own detector. No real secret was involved; this is
  pre-existing behavior of the file already committed at c890801, not
  introduced by this change.

## Cleanup

No dev server or background process was started at any point during this
task — only one-shot script executions (the selftest file, the timing
script, the replay script). Nothing to kill.

## Scratch

Left in place per the hard rule against deleting anything, under
`/var/tmp/delegation-l60p2-IRFR/` (probe scripts, the c890801 snapshot used
for replay, extraction/replay Python scripts, and their JSON output).
