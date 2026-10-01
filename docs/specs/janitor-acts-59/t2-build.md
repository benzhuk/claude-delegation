DONE

# Lane 59 T2 report — janitor acts

Branch `build/janitor-acts-59-1`, worktree `/var/tmp/lane-59/wt`, HEAD at `7f48e2f`
when I started. My territory per the task brief and ruling-r0.md: scripts/janitor.mjs +
.test.mjs (F1, F2, F14, F16), scripts/install-janitor-timer.mjs + .test.mjs (C3
amended), scripts/mirror-shared-skills.mjs + .test.mjs (F9, F10, F11, F12),
skills/janitor/SKILL.md (C5), docs/subagent-contract.md (F13). T1 (a separate builder in
the same worktree) owned scripts/path-safety.mjs, scripts/reclaim.mjs,
scripts/work-record.mjs's refactor — I never touched those files; T1's work landed at
commit `c12e190` partway through my own session and I coded to it as-committed, not to a
stub, wherever I referenced it (documenting reclaim.mjs's actual usage/exit codes/switch
name in SKILL.md).

Every finding below has its own red-before/green-after test(s); every commit is
conventional and territory-scoped (`git add` of only the files it names, never `-A`).

## F1 — idleHours + 24h idle floor (scripts/janitor.mjs, commit `250ce5f`)

Exported the pinned seam first, per ruling r0: `idleHours(wtPath, {home,
now=Date.now()}) -> number` — newest of the worktree directory's own mtime, its
git-admin `HEAD`/`index`/`logs/HEAD`, and any `~/.claude/projects/<slug>/` transcript
entries; `Infinity` when none exist. `applySafe()` now consults it (gated on
`state.act === true`) before removing a SAFE worktree, skipping with `"active in last
24h"` below `IDLE_FLOOR_HOURS = 24`.

Tests: `idleHours()` unit test (fresh vs. backdated-via-utimesSync fixture, using a
non-git-tracked `~/.claude/projects/<slug>` dir specifically because it's safe to
backdate — git's own worktree/index files are NOT, see the debugging note below); an
Infinity-when-empty unit test; an end-to-end `main()`-driven test proving a worktree
survives on the real clock and is removed once `now` is pushed 25h forward.

**A debugging note worth keeping**: my first test design backdated real worktree/git-
admin file mtimes via `fs.utimesSync` before calling `main(["--apply", ...])`. Four
tests failed, including two PRE-EXISTING ones. Root cause: `git status` (which
`gatherState`'s `isTreeClean()` runs, ahead of `applySafe`'s idle check, on every
`main()` call) silently rewrites `.git/index`'s own mtime to "now" whenever a tracked
file's on-disk ctime looks inconsistent with the index's cached data — and
`fs.utimesSync`/`touch` always bump ctime to the real current time, which IS that
inconsistency. So any backdating gets silently undone before `idleHours` ever reads it,
even when the tracked files themselves are also backdated. Fixed by abandoning file
backdating for `main()`-driven tests entirely: added a `now` override to
`main()`/`applySafe()`, threaded to `idleHours`, so tests advance the clock instead of
rewinding any file. This is now documented in-line in janitor.test.mjs for the next
reader.

## F2 — restorable records (scripts/janitor.mjs, same commit)

`applySafe`'s log rows now carry a `sha` and a paste-back `restore` hint (`git branch
<b> <sha> && git worktree add <ref> <b>` for a worktree, `git branch <b> <sha>` for a
branch). `writeRecord` gains `act`, `removed[]` (name+sha of everything actually
removed this run) and `safeLeft` ({worktrees, branches} counts of SAFE rows NOT
removed); `drift.md`'s line gains a ` safe=<n> removed=<n>` suffix. `main()` now writes
`--record` AFTER `applySafe`, including from the apply-failure catch path (previously
report-then-apply, so a mid-apply crash could lose the record of what did get removed).

Tests: a direct `applySafe` test asserting sha/restore-hint shape on both a removed
worktree and a removed branch; a `--record` JSON/drift-line test.

## F14 — the janitor-act kill switch (scripts/janitor.mjs, same commit)

`switchedOff("janitor-act")` (checked only when `--apply` is given) makes `--apply`
record-only: the record's `act` is `"switched-off"`, `removed` is `[]`, `safeLeft`
still counts the full SAFE class, and the printed report's FIRST line is exactly
`janitor: act switched off (~/.agents/ws-off-janitor-act)`.

Tests: the kill-switch behavior end to end; a sanity test confirming the pre-existing,
blunter `~/.agents/ws-off` switch (no run at all) still works unchanged and is checked
first.

## F16 — skip-worktree/assume-unchanged (scripts/janitor.mjs, same commit)

`isTreeClean()` now also runs `git ls-files -v` and treats any line tagged `S`
(skip-worktree) or a lowercase letter (assume-unchanged) as dirty — `git status
--porcelain` alone misses both. `applySafe` re-runs `isTreeClean` immediately before
`git worktree remove`, skipping with `"tree changed since classify"` on a race.

Tests: a fixture proving the skip-worktree gap existed (measured empty `--porcelain` +
a real local edit surviving an unforced `git worktree remove` before this fix, exactly
as redteam.md's evidence described); an `applySafe` re-check/race test.

**janitor.test.mjs overall**: 104 tests, 102 pass, 0 fail, 2 skipped (pre-existing,
platform-specific).

## C3 amended (F15 cuts) — install-janitor-timer.mjs's default argv (commit `38f1a8c`)

`scheduledCommandArgv()` now appends `--apply` for the janitor job by default (not the
collect-status job). No `--record-only` flag exists (F15 cuts it — the kill switch
above is the only off path). The pre-existing refusal of a literal `--apply` substring
inside a `--repo`/`--host`/`--to`/`--out` VALUE (`:684-701`-ish) is untouched and still
fires; I added a test confirming it explicitly alongside the new default. Rewrote the
top-of-file banner paragraph and `scheduledCommandArgv`'s own docstring, both of which
had claimed "`--apply` never appears in anything this installer generates" — no longer
true.

Updated every generated-text assertion that this flips: two `--dry-run`/real-install
tests checked service-unit/XML/plist text for the ABSENCE of `--apply` — now split by
whether the content embeds `ExecStart`/is the janitor job at all (installed.json never
embeds the argv, so it's unaffected either way); the byte-for-byte `deepEqual` on
`scheduledCommandArgv`'s own return value gained the trailing `"--apply"` element.

**install-janitor-timer.test.mjs overall**: 52 tests, all pass.

## F9/F10/F11/F12 — mirror-shared-skills.mjs (commit `8ff959d`)

- **F12**: `reclaim` joins the PATH shims with an explicit `target:
  path.join(REPO, "scripts", "reclaim.mjs")` (a new per-entry `target` field
  `shimContent`/`publishShim`/`manifestEntry` all now honor, falling back to
  `shimTarget(command)` for the note-* family) — never the mirrored copy, since
  `scripts/` is never published and `reclaim.mjs` pulls in `janitor.mjs` and friends.
  Gated on `isDurablePath(REPO)` inside `collectSources()`; a non-durable checkout
  (this worktree, under `/var/tmp`) prints `SKIP reclaim shim: <REPO> is not durable`
  and installs nothing.

- **F9/F10**: every run — `--write-allow` or not, `--dry-run` or not, install or
  `--uninstall` — prints both:
  `ALLOW claude: Bash(reclaim *)` and
  `ALLOW codex: prefix_rule(pattern = ["reclaim"], decision = "allow")  # append to
  ~/.codex/rules/default.rules`.
  `Bash(reclaim *)` is the space form (Claude Code 2.1.285's own `--help`), not the
  legacy colon form; "line present" (F10's own definition) matches either spelling. A
  `permissions.deny`/`ask` rule already starting `Bash(reclaim` prints `WARN <path>: a
  deny/ask rule shadows reclaim` and skips the write.

- **F11 (Claude)**: new `--write-allow` adds the line to `~/.claude/settings.json`, only
  when: lstat is a regular file (not a symlink — the chezmoi `symlink_` hazard F11
  named); it parses as JSON; `JSON.stringify(parsed, null, 2)+"\n"` equals the file's
  bytes exactly after CRLF→LF normalization for the comparison only; the line is
  absent; chezmoi does not manage it (`chezmoi managed --include=files,symlinks`, 30s
  timeout, compared HOME-relative per F11's own fix text, which pins the relative form
  `.claude/settings.json` — not absolute). The write is `wx`-flag atomic in a temp file,
  `chmod`'d to the ORIGINAL mode, re-reads the original immediately before rename
  (skipping on a concurrent change — Claude Code itself writes this file on "always
  allow"), retries up to 3× 200ms apart on `EPERM`/`EBUSY`/`EACCES`, and backs up the
  original to `~/.agents/rollout-backups/claude-settings.json.<UTC stamp>` (same mode) —
  OUTSIDE `~/.claude`, so a later `chezmoi add ~/.claude` never sweeps a secrets copy
  into the dotfiles repo. SKIP reasons are the nine fixed strings F11 names —
  `absent`, `not a regular file`, `not valid JSON`, `formatting would change`, `line
  present`, `chezmoi-managed`, `chezmoi check failed`, `changed during write`, `rename
  failed` — never `err.message`, never a file-content fragment (tested explicitly with
  a JSON body containing a `"sekret"` key: the SKIP line names neither `sekret` nor the
  malformed token).

- **F9's ruling-r0 amendment (Codex)**: `--write-allow` also appends the Codex line to
  `~/.codex/rules/default.rules`, under the same shared write protocol and the same
  chezmoi check, PLUS my own added gate for "the Codex rules path is not certain on
  this host" (ruling r0's own wording): `isCodexRulesPathCertain()` (exported) is true
  only when `codexHomes()` resolves to exactly the single plain `~/.codex` home — no
  `CODEX_HOME` override, no Orca-managed account home found. Otherwise it prints `SKIP
  codex allow line: codex rules path is not certain on this host (print only)` and
  touches nothing. This specific gate is my own interpretation of an intentionally
  loose ruling instruction ("if not certain... print only") — flagged as an open
  question in my state file, not as a defect.

- **F10 probe P-allow**: ruling r0 says "the builder adds the probe tests that F10
  lists... recorded as documented behavior, not as a claim." I ran the six-command
  probe once by hand against the real `claude` CLI (2.1.285 — matches the version the
  finding measured against) in a scratch cwd with a scratch settings.json holding only
  `{"permissions":{"allow":["Bash(reclaim *)"]}}`, `--permission-mode default`. Result,
  also recorded as a comment in mirror-shared-skills.test.mjs directly above a
  placeholder test:
  - `reclaim /nonexistent` → ran (reclaim not installed, exit 127) — **allowed**
  - `reclaim /x && touch p1` → **denied**, p1 never created
  - `reclaim /x; touch p2` → **denied**, p2 never created
  - `reclaim $(touch p3)` → **denied** (command substitution), p3 never created
  - `reclaim /x > p4` → ran (exit 127) — **allowed**, AND the shell's own output
    redirection created an EMPTY `p4` before `reclaim` ever executed, independent of
    reclaim's own outcome
  - `FOO=1 reclaim /x` → **denied**, never ran

  So the chained/substituted/env-prefixed forms are blocked exactly as F10 predicted;
  a bare invocation and one using output redirection both run. **The redirection
  result is a genuinely new, measured finding**: `Bash(reclaim *)` lets a session
  create/truncate an arbitrary file via `reclaim <anything> > <target>`, regardless of
  whether reclaim.mjs's own argument validation ever runs — but this is not specific to
  reclaim; it's shared by every other single-word `Bash(<cmd> *)` allow rule in the
  same settings file (e.g. the pre-existing `Bash(git *)`), and reclaim.mjs itself
  never executes as a result. Per ruling r0's explicit softening of the original
  redteam.md text ("if any does [exist], the allow line is not shipped" — the ruling
  instead says "documented behavior, not a claim"), I did NOT block shipping
  `--write-allow`/the ALLOW-line printing over this; I documented it in the test-file
  comment and in SKILL.md's Reclaim section as practical guidance.

**mirror-shared-skills.test.mjs overall**: 37 new/updated tests, all pass (existing
tests untouched and still green).

## C5 — docs (commit `1ce13f4`)

- **skills/janitor/SKILL.md**: new `## Reclaim: the one allowlisted deleter` section —
  the four classes, usage/exit codes, the `ws-off-reclaim` kill switch (verified against
  T1's actual `switchedOff("reclaim")` call and `project-config.mjs`'s
  `ws-off-<name>` naming), and both allow lines. Also fixed two now-stale claims in the
  pre-existing "Installing the daily timer" and "Cadence" sections that said `--apply`
  never appears in anything the installer generates — added a bullet documenting the
  `ws-off-janitor-act` switch explicitly.
- **docs/subagent-contract.md**: new section pinning F13's scratch convention exactly —
  `mktemp -d /var/tmp/delegation-<name>-XXXX` (Linux/macOS) / `mktemp -d -t
  delegation-<name>-XXXX` (Windows Git Bash), removed with bare `reclaim <path>`, never
  `rm` — distinct from the pre-existing lead-owned lane-scratch section.
- **scripts/janitor.test.mjs**: the heading-list pin test for SKILL.md needed exactly
  one line added (the new Reclaim heading) — still green, 102/104 (2 pre-existing
  platform skips), included in the F1/F2/F14/F16 test count above since it lives in the
  same file/commit family; the actual edit landed in the docs commit since that's what
  needed it.

## Gate: full suite

`TMPDIR=/var/tmp node scripts/run-tests.mjs` at HEAD (`1ce13f4`): **3134 tests, 3129
pass, 0 fail, 5 skipped, exit 0**, "leak check: 0 new temp entries" (includes T1's
territory, already landed in this shared worktree).

## Deviations / assumptions (all flagged, none blocking)

1. `SKIP <path>: <reason>` / `WROTE <path> +<line>` / `WARN <path>: <reason>` action-
   line wording for `--write-allow` is my own consistent format, matching the two
   literally-pinned pieces (the ALLOW lines, and the nine SKIP reason strings) but not
   itself pinned by any finding — chosen for internal consistency with the rest of
   mirror-shared-skills.mjs's `say()`-based logging.
2. `isCodexRulesPathCertain()`'s exact definition of "certain" (single plain `~/.codex`
   home, no override, no Orca account) is my own reading of ruling r0's loosely-worded
   F9 amendment ("if the Codex rules path is not certain on a host, print only") — no
   stricter or looser definition was pinned.
3. F10's probe P-allow is recorded as a one-time, by-hand result (comment in the test
   file + this report), not wired into the automated suite — it needs a live `claude`
   CLI/session, which a sealed test run cannot shell out to.

## Commits (this branch, my files only)

- `250ce5f` feat(janitor): idle floor, restorable apply records, act kill switch,
  skip-worktree guard
- `38f1a8c` feat(install-janitor-timer): default scheduled argv carries --apply (C3/F15)
- `8ff959d` feat(mirror-shared-skills): reclaim shim, and the reclaim allow lines
  (F9/F10/F11/F12)
- `1ce13f4` docs(janitor): Reclaim section in SKILL.md, F13's scratch convention in
  subagent-contract.md

No process was started and left running; nothing was pulled or pushed; no git identity
was touched; no `--no-verify`.
