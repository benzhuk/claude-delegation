VERDICT: PASS

Territory J1 (janitor-daily-1) — fix round 2, applying every reviewer-verified finding from
docs/specs/janitor-daily-1/reports/J1-review-r1.md (12 findings: 2 BLOCKER, 5 MAJOR, 5 MINOR).
Serves GOAL's "work lost or stalled" measure — a stale worktree/branch found daily by a scheduled
run, not when someone remembers — and specifically the reviewer's own attack-brief line ("cause vs
compensation": a swallowed error or a silent fallback is a guard that hides a state rather than
reports it). Nearest NOT: "a rule no script checks" — every fix below has a new or updated assertion
in the test file, not just a comment.

Worktree: /home/ben/Code/claude-delegation-wt/wt-janitor-daily-1-J1. Branch build/janitor-daily-1-J1.
Base of this round: d188e68a2fe9cc71962fef6a135a47052abb47a8 (the round-1 commit the review was run
against).
Commit: 8ffd077898f84b7a384af0bbae1f58cf71ed68c4 (`git rev-parse HEAD`, run in the worktree after
committing — matches this report's `sha` field).

## Files changed
- scripts/install-janitor-timer.mjs — see per-finding notes below.
- scripts/install-janitor-timer.test.mjs — new/updated assertions per finding, plus two new test-only
  helpers (`fixtureDefaultRepoGit`, and `fixturePluginRoot` now ships a stub `scripts/janitor.mjs`).
- scripts/janitor.test.mjs — one new test for m1 (`--host` driven end to end through `main()`).
- skills/janitor/SKILL.md — two new bullets (repo/script existence refusal, host baked at install
  time).

## BLOCKER

### B1 — ExecStart argv injection via unquoted `--repo`/`--host`
Fix: `systemdQuote(arg)` (install-janitor-timer.mjs:127-130) doubles `%`/`$` and quotes only when the
arg has whitespace/quotes/backslash, applied via `.map(systemdQuote)` in `systemdServiceUnit`
(:133). A second, independent guard refuses outright when `--repo`/`--host`/the resolved value
carries the literal string `--apply` (:387-396) — the contract text ("the string `--apply` never
appears anywhere") now holds even if a quoting bug is ever introduced later.
Tests: "B1: --repo or --host carrying the literal string --apply is refused outright, nothing
written" (both directions); "B1: an ordinary space-bearing repo (no --apply) still generates a
single, correctly quoted ExecStart argv element" — asserts the exact quoted `ExecStart=` line via
regex against the real repo path.

### B2 — refusal test only passed from a `wt-`/tmp checkout
Fix: rewrote the refusal test (install-janitor-timer.test.mjs, "refuses to install from a
temporary/worktree checkout...") to pass `pluginRoot: fixturePluginRoot()` (a fresh dir under
os.tmpdir()) instead of relying on the installer's own default pluginRoot — exactly the reviewer's
suggested replacement. This now refuses regardless of where this worktree itself lives, so it stays
green after merge to `~/Code/claude-delegation` and on a Windows `C:\Users\ben\Code\claude-delegation`
checkout.

## MAJOR

### M1 — by-name enable/disable touches a foreign same-named unit
Fix: both branches now read-check every artifact's marker status BEFORE running any enable/disable
command. `--remove --enable` refuses outright (exit 1, nothing removed, zero exec calls) when any
artifact is foreign (:476-492); a plain install refuses to finish (installed.json withheld, exit 1,
zero exec calls under `--enable`) when any artifact is foreign (:540-552) — this subsumes m4's second
half. `--remove --enable`'s disable commands now run BEFORE `planRemove` (:494-509), with a
`systemctl --user daemon-reload` run after removal on systemd (:513-525), fixing the "disable a
now-file-less unit" ordering bug too.
Test: "M1: a foreign (unmarked) same-named unit blocks --enable entirely, on both install and
--remove — zero exec calls, the user's unit left alone" — plants a foreign `janitor-record.timer`
BEFORE either call, asserts exit 1 + zero fakeExec calls + byte-identical foreign file, for both
`install --enable` and `--remove --enable`.

### M2 — Windows `cmd /c` quote-stripping mangles the command
Fix: `<Arguments>/s /c "${escapeXml(wrapped)}"</Arguments>` (install-janitor-timer.mjs:211) — `/s`
makes cmd.exe strip exactly the one outer quote pair added here, per cmd.exe's documented rule.
Still not runnable live (no schtasks on this Linux host) — text-only, flagged as such in the test
comment. Test asserts `<Arguments>/s /c "` appears in the generated XML.

### M3 — declared UTF-16, written as UTF-8
Fix: declaration changed to `<?xml version="1.0" encoding="UTF-8"?>` (install-janitor-timer.mjs:189),
matching writeFileAtomic's `"utf8"` write. Test asserts the exact declaration line.

### M4 — the "real install" test cannot pass on Windows
Fix: added `const NODE = path.resolve("/usr/bin/node")` at module scope in the test file (resolved
the same way `main()` itself resolves `execPath`, using node's own OS-native `path` module — so it
tracks whatever OS the suite itself runs on, not a hardcoded POSIX string). The "real install" test
now asserts `serviceText === systemdServiceUnit({ node: NODE, pluginRoot, repo, host: "test-host",
logPath })` — a whole-text comparison against the real exported generator, rather than a hand-built
literal that assumed POSIX paths and unquoted ExecStart. installed.json's `node` field assertion
uses `NODE` too.

### M5 — no existence check on the janitor script or repo
Fix: `main()` now refuses (before any write, under `--dry-run` too, `--remove` exempt) when
`!fs.existsSync(janitorScriptPath)` or `!fs.existsSync(path.join(repo, ".git"))`
(install-janitor-timer.mjs:398-409). `fixturePluginRoot()` now writes a stub `scripts/janitor.mjs`
so every existing fixture keeps passing; a new `fixtureDefaultRepoGit(home)` helper stamps
`<home>/Code/claude-delegation/.git/` and is called from every test that expects a successful
install/dry-run against the default repo path (9 call sites — audited one by one against M5's new
check).
Test: "M5: refuses when the janitor script is missing, or the repo is not a git checkout — nothing
written, exit 1" (three sub-cases: missing script, no `.git`, and the same refusal under
`--dry-run`).

## MINOR

### m1 — `--host` not baked in by default; untested in janitor.test.mjs
Fix: `const host = hostFlag || os.hostname();` in `main()` (install-janitor-timer.mjs:364), baked
into every generated command regardless of whether `--host` was typed. SKILL.md's "Which host name
it records under" bullet documents this. New test in scripts/janitor.test.mjs drives
`main(["--record", dir, "--host", "Custom Host!", ...])` end to end and asserts the written file name
and `record.host` both carry the sanitized override, not `os.hostname()`.

### m2 — `--hour 99`/`7.5` silently fell back to 6
Fix: an out-of-range or non-integer `--hour` now pushes a refusal and returns 1 before any write
(install-janitor-timer.mjs:345-353), instead of silently substituting the default. Test table covers
`"99"`, `"7.5"`, `"-1"`, `"nope"` — each asserted exit 1, a matching refusal string, and nothing
written.

### m3 — `--enable` prints nothing; a plain `--remove` doesn't say the live entry remains
Fix: every exec'd command (enable, disable, and the post-remove `daemon-reload`) is pushed into
`result.commands`, printed as one `ran: <cmd>` line per command in text mode, and a failed exec is
now a reported refusal (JSON + nonzero exit) instead of an uncaught throw. A plain `--remove` (no
`--enable`) sets `result.note` naming the exact disable command that was withheld. Tests assert
`result.commands` contains the expected `systemctl` lines, and `result.note` matches
`/may still be registered\/running/`.

### m4 — dry-run status wording; foreign artifact still finished the install
Fix: `planWrite`/`planRemove` return `would-create`/`would-update`/`would-remove` under `--dry-run`
(install-janitor-timer.mjs:296-315). The foreign-artifact-blocks-finishing-the-install half is
covered under M1 above (same code path, same test). Tests: the dry-run install test now asserts every
file's status is `would-create`; a new "`--remove --dry-run` reports would-remove" test asserts the
old `"removed"` claim for an untouched file is gone.

### m5 — three tests fell through to real `process.env.XDG_CONFIG_HOME`
Fix: every bare `main()` call in the test file that previously omitted `env` now passes
`env: { XDG_CONFIG_HOME: path.join(home, ".config") }` explicitly (the `--force-root` bypass test,
the `--remove`-ungated test, and the `--remove`-on-absent test).

## Deviations / judgment calls (flagged, not hidden)
- M1's install-side gating (foreign artifact blocks finishing) applies REGARDLESS of `--enable` —
  the reviewer's m4 fix explicitly asked for this ("if any artifact is foreign, skip writing
  installed.json and return 1"), which is a stronger gate than M1's own text (which only mentions
  `--enable`). I kept the non-conflicting sibling artifact WRITTEN (e.g. a clean service file next to
  a foreign timer) — only `installed.json` and any by-name `--enable` command are withheld — since
  M1's own remove-side text says "left-untouched-foreign... files themselves are handled correctly";
  I read the install side the same way rather than rolling back an already-safe write.
- The `--apply`-substring refusal (B1's second part) checks both `repo` and the resolved `host`
  (`hostFlag || os.hostname()`), even though `os.hostname()` containing the literal string `--apply`
  is not a realistic threat — cheap to check, keeps the guard uniform over every source of the value.

## Gate
`node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs scripts/janitor.test.mjs` from
the worktree → tests 100, pass 98, fail 0, skipped 2 (pre-existing, unrelated — a Windows-only
directory-removal test and a case-insensitive-filesystem test, both skipped by design on this Linux
host). Full log: docs/specs/janitor-daily-1/reports/J1-gate.log.

## State file
Updated: docs/specs/janitor-daily-1/reports/J1-state.md (round-2 Done/Next/Open-questions sections).
