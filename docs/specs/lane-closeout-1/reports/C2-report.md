DONE cea1b7793dfca470b97b69ebaf80761258cab659

GOAL served: "The lead spends judgment, not turns" / work lost or stalled measure — a
recursive-delete false refusal on quoted/heredoc/ssh-remote text stalls an unattended
lead exactly the way the two named incidents did (2026-09-26, 3.5h and 40m). Nearest NOT:
"a rule no script checks" — every exempt/refused shape below is pinned by a test, not a
comment.

Worktree: /home/ben/Code/claude-delegation-wt/lane-closeout-1-C2, branch
wt/lane-closeout-1-C2 (local only, not pushed). Commits:
- d103cc5 fix(hooks): delete-guard stops matching quoted text in heredocs and ssh remote strings
- cea1b77 docs(agents): pin the scratch-directory sentence across all eight role files

## What changed — hooks/delete-guard.mjs

1. `SAFE_CMD_RE` (line ~208) gained `rg` alongside `grep`/`echo`/`printf`/`git commit -m`/
   `note-send --text`.
2. New `findHeredocSafeSpans` (~line 312): a here-doc body fed to `cat` (only when NOT
   redirected to a file), `tee` (even writing a file — the real incidents were reviewers
   using `tee` for reports), `note-send`, or a `git commit` message is added to the safe
   spans, UNLESS that consumer's own output is piped onward into a shell/interpreter
   (reuses the existing `pipesToShell` guard). An unterminated here-doc (no closing
   delimiter line found) is never exempted — fails closed.
3. New `findSshSafeSpans` (~line 351): `ssh host "…"` / `ssh host '…'`'s quoted argument
   is a separate command string, so it gets its own recursive `detectDelete()` call rather
   than being treated as one opaque quoted span. Exempt only if the recursive call finds
   no match (e.g. the remote string is itself `grep '...'`).
4. `detectDelete` (~line 470) now unions safe spans from `findSafeQuoteSpans`,
   `findHeredocSafeSpans`, and `findSshSafeSpans`.
5. Bug found and fixed during this round, before any test was written against it: the ssh
   scan originally reused the shared module-level `SSH_RE` regex object inside a `while`
   loop whose body calls `detectDelete` recursively — a re-entrant call resets/advances the
   SAME object's `lastIndex`, and the outer loop resumed from corrupted state, re-finding
   the same match forever (spun a node process at 100% CPU, confirmed with a scratch probe
   script, hung >120s). Fixed by making that one regex a fresh local object per call
   (comment left in place explaining why). I killed the one hung process I had started, by
   its own PID (1003237, confirmed via `ps aux` as my own probe.mjs), before continuing —
   no broad kill used.
6. Doc comment block at the top of the file (lines ~68-102) rewritten to describe the new
   exemptions and to stop claiming the now-fixed `git commit -m "$(cat <<'EOF' …)"` shape
   as a residual false refusal.

## Before/after shape table

| Shape | Before this change | After this change |
|---|---|---|
| `grep -n "rm -rf" file` (quoted) | exempt (pre-existing) | exempt (unchanged) |
| `rg -n "rm -rf" file` (quoted) | **refused** (rg not on safe list) | **exempt** |
| `echo`/`printf`/`git commit -m`/`note-send --text` quoted | exempt (pre-existing) | exempt (unchanged) |
| `cat <<EOF` … `EOF` (report body, no `>`) | **refused** (literal heredoc scan) | **exempt** |
| `tee report.md <<EOF` … `EOF` | **refused** | **exempt** |
| `note-send <<EOF` … `EOF` | **refused** | **exempt** |
| `git commit -F - <<EOF` … `EOF` | **refused** | **exempt** |
| `git commit -m "$(cat <<'EOF' … EOF)"` | **refused** (documented residual limit) | **exempt** |
| `cat <<EOF > script.sh` … `EOF` … `bash script.sh` (pinned regression) | refused | **still refused** (cat-to-a-file excluded from the cat exemption on purpose) |
| `cat <<EOF | sh` … `EOF` | refused | **still refused** (pipesToShell guard) |
| `ssh host "grep -n 'rm -rf' file"` | **refused** | **exempt** |
| `ssh host 'grep -n "rm -rf" file'` | **refused** | **exempt** |
| `ssh host "rm -rf x"` / `ssh host 'rm -rf x'` | refused | **still refused** (recursive parse itself matches) |
| `ssh host <<EOF` with delete in body | refused | **still refused** (ssh is not a recognized heredoc consumer) |
| `bash <<EOF` / `sh -s <<EOF` with delete in body | refused | **still refused** |
| `bash -c "rm -rf x"` / `zsh -c "..."` / `eval "..."` | refused | **still refused** |
| `pwsh -Command "Remove-Item -Recurse ..."` | refused | **still refused** |
| `find ... -exec rm -rf {} \;` | refused | **still refused** |
| `xargs rm -rf`, `find -delete`, all real `rm`/`Remove-Item`/`git clean`/`git worktree` shapes from the old test | refused | **still refused** (all 116 original tests pass unchanged) |
| Unterminated quote / unterminated here-doc | refused (accidentally, by not matching a safe span) | **still refused, deliberately** (documented fail-closed behavior, now pinned by tests) |
| `node -e "fs.rmSync(...)"` / `python -c "shutil.rmtree(...)"` | not matched at all (out of scope, undetected either way) | unchanged — not in scope, no test added (matches the file's own documented limit) |

## Tests (hooks/delete-guard.test.mjs)

New/pinned test names (26 added, all under the "Lane 36 / C2" and "Stay refused" sections
near the end of the file):
- `quoted: rg -n "rm -rf" file passes (never a delete) — rg added to the safe-command list`
- `false positive #1 (spec): a heredoc report body into cat passes …`
- `quoted: heredoc into tee (writing to a file) passes …`
- `quoted: heredoc into note-send passes`
- `quoted: heredoc into a git commit message (git commit -F -) passes`
- `quoted: a heredoc fed to cat inside a git commit -m "$(...)" substitution passes …`
- `false positive #3 (spec): ssh host "grep -n 'rm -rf' file" passes …`
- `quoted: ssh host 'grep -n "rm -rf" file' passes …`
- `quoted: bash -c "rm -rf x" is NOT exempted …`
- `quoted: zsh -c "rm -rf x" is NOT exempted`
- `quoted: eval "rm -rf x" is NOT exempted`
- `quoted: ssh host "rm -rf x" is NOT exempted …`
- `quoted: ssh host 'rm -rf x' is NOT exempted …`
- `quoted: ssh host <<EOF with the delete in the body is NOT exempted …`
- `quoted: bash <<EOF with the delete in the body is NOT exempted`
- `quoted: sh -s <<EOF with the delete in the body is NOT exempted`
- `detectDelete: pwsh -Command "Remove-Item -Recurse ..." still matches …`
- `detectDelete: find ... -exec rm -rf {} \; still matches …`
- `detectDelete: the pinned regression stays refused — cat <<EOF > script.sh ... EOF ... bash script.sh …`
- `quoted: a cat here-doc piped onward into sh is NOT exempted (cat <<EOF | sh)`
- `quoted: an unterminated quote after echo still refuses (fails closed on unparseable quoting)`
- `quoted: an unterminated here-doc (no closing EOF line) still refuses (fails closed on unparseable quoting)`
- `detectDelete stays fast (not exponential) on repeated ssh-quoted-grep segments, and still denies a trailing real delete`

The pre-existing "false-positive" test 2 named in the spec (quoted grep pattern) was
already present and green before this round (`quoted: grep -n "rm -rf" file passes`,
line 445 of the pre-change file) — left unchanged, still passing.

## Docs / eight-file scratch sentence

- `docs/subagent-contract.md`: new `## Scratch is the lead's to create and remove; agents
  never delete` section (4 sentences) naming who creates the directory, that agents write
  temp files only there, and that `close --closeout` removes it.
- Pinned sentence added verbatim (as its own bullet, outside the byte-identical safety
  block in the `.md` files) to: `agents/builder.md`, `agents/integrator.md`,
  `agents/reviewer.md`, `agents/runner.md`, `codex/agents/builder.toml`,
  `codex/agents/integrator.toml`, `codex/agents/reviewer.toml`, `codex/agents/runner.toml`.
- `agents/agents.test.mjs`: new test `the pinned scratch sentence appears, verbatim and on
  its own line, in all eight role files` — reads all four `.md` and all four `.toml` files
  directly (not just the four `.md` files the existing suite's `AGENT_FILES` glob covers)
  and asserts the exact sentence text (leading `- ` stripped) appears as a whole
  trimmed line in each.

## Gate

1. `node --test hooks/delete-guard.test.mjs agents/agents.test.mjs`:
   ```
   ℹ tests 164
   ℹ suites 0
   ℹ pass 164
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ```
2. `node scripts/run-tests.mjs > .../reports/C2-gate.log 2>&1`:
   ```
   ℹ tests 2613
   ℹ suites 0
   ℹ pass 2607
   ℹ fail 1
   ℹ cancelled 0
   ℹ skipped 5
   ℹ todo 0
   ```
   The one failure is `scripts/work-record.test.mjs:2340:1` — "docs/GOALS.md and
   docs/goals/card.md carry no phrase this build's evidence contradicts (STALE regexes,
   doesNotMatch)", expecting `docs/GOALS.md` to still contain the literal substring "152
   turns (no source record" while the file now reads "152 hand-run (no source record" — a
   wording drift in a file I never touched. Confirmed pre-existing and out of my
   territory: `git diff --stat <base> HEAD -- docs/GOALS.md docs/goals/card.md
   scripts/work-record.test.mjs` is empty (no output shown above the "---" marker in my
   working notes). `docs/GOALS.md` is explicitly lead/"Nobody" territory in this lane's
   map (contracts.md territory map), not mine to edit. Flagging for the
   integrator/lead rather than fixing.

## Deviations / judgment calls

- The heredoc-consumer check for `git commit` uses a plain `/\bgit\s+commit\b/i` test, not
  the fuller `GIT_PREFIX` global-option scanner used elsewhere in the file (which handles
  `git -C <path> commit …`). The pinned ruling's shapes (`git commit -F - <<EOF`, and the
  `git commit -m "$(cat <<'EOF' …)"` nested-cat case) don't need it; I did not extend
  further since it wasn't asked for and every required shape passes.
- `tee`'s exemption is unconditional per the contract ("tee (writing to a file)" is
  explicitly named as exempt) except for the shared `pipesToShell` guard also applied to
  `cat`/`note-send`/`git commit` — I did not add a "the tee target file is later executed"
  check beyond that, since the contract names tee as exempt outright and the pinned
  regression test that DOES require staying refused is specifically the `cat …>… bash`
  shape, not a `tee` one.

No process left running; no dev server started; nothing pushed.
