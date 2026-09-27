Territory: J1 (janitor-daily-1) — scripts/install-janitor-timer.mjs (new), its test, skills/janitor/SKILL.md, plus the optional --host override in scripts/janitor.mjs.

Contracts I rely on:
- docs/specs/janitor-daily-1/contracts.md: territory map, J1 rulings (names, scheduling commands,
  node path, temp-checkout refusal, --remove marker rule, repo-path resolution), and the J1/J2 seam
  (installed.json's exact byte-stable shape; the scheduled command text; last-run.log truncation and
  J2's file_fresh state table for it).
- scripts/mirror-shared-skills.mjs's exported `isDurablePath` (imported, not forked) and its
  writeFileAtomic pattern (reimplemented locally, not exported there).

Done (round 2 — every reviewer-verified finding from J1-review-r1.md applied):
- B1 (ExecStart argv injection): added `systemdQuote` (quotes only when whitespace/quotes/backslash
  present, doubles `%`/`$`), applied to every systemd ExecStart arg; added an outright refusal when
  `--repo`/`--host`/`~/.agents/janitor-repo` contains the literal string `--apply`.
- B2 (location-dependent refusal test): rewrote the temp-checkout refusal test to use an explicit
  fixture pluginRoot under os.tmpdir(), never the installer's own default — passes from any checkout.
- M1 (foreign-unit enable/disable by name): both install and --remove now refuse outright (exit 1,
  zero exec calls) when any artifact is a same-named foreign (unmarked) file and --enable is given
  (install path checks unconditionally, since m4 also requires it); --remove's disable now runs
  BEFORE file deletion, plus a `daemon-reload` after, on systemd.
- M2 (Windows Arguments quoting): wrapped in `/s /c "..."` so cmd.exe strips exactly the outer pair.
- M3 (Windows XML encoding mismatch): declaration changed to UTF-8, matching the utf8 bytes written.
- M4 (test not portable to Windows execPath resolution): the "real install" test now compares the
  full generated service text against `systemdServiceUnit()` called with `NODE = path.resolve(...)`
  (resolved the same way main() does, on whatever OS the suite itself runs on) instead of a
  hand-reconstructed literal string.
- M5 (no existence check on script/repo): added a refusal (checked under --dry-run too) when the
  janitor script or `<repo>/.git` does not exist; every fixture plugin root now ships a stub
  `scripts/janitor.mjs`, and a `fixtureDefaultRepoGit(home)` helper stamps `.git` under the default
  repo path for every test expecting a successful install.
- m1 (host not baked at install time): `main()` now bakes `--host <name> || os.hostname()` into
  every generated command at install time; added a janitor.test.mjs test driving `main(["--record",
  dir, "--host", name])` end to end.
- m2 (silent --hour fallback): an out-of-range/non-integer --hour now refuses (exit 1, nothing
  written) instead of silently falling back to the default.
- m3 (--enable prints nothing, --remove doesn't say the entry may remain): every exec'd command is
  pushed to `result.commands` (JSON + one `ran:` line per command in text mode); a failed exec is
  reported as a refusal, never an uncaught throw; a plain `--remove` (no --enable) sets `result.note`
  naming the exact disable command that was not run.
- m4 (dry-run claims past tense; foreign artifact still finishes install): `planWrite`/`planRemove`
  now return `would-create`/`would-update`/`would-remove` under --dry-run; an install with any
  foreign artifact skips installed.json and returns 1 (the non-conflicting artifacts are still
  written by name — only the finishing steps are withheld).
- m5 (three tests fell through to real process.env): all `main()` calls in the test file now pass an
  explicit `env: { XDG_CONFIG_HOME: ... }`.
- New/changed tests in scripts/install-janitor-timer.test.mjs: B1 --apply-injection refusal (repo and
  host), B1 space-bearing-repo-no-refusal (single quoted argv), M1 foreign-unit gating (install
  --enable and --remove --enable, zero exec calls each), M5 missing-script / not-a-git-checkout /
  dry-run refusal, --remove --dry-run would-remove wording, Windows Arguments/`encoding="UTF-8"`
  assertions, --hour bad-value table (99, 7.5, -1, "nope").
- Live-verified again on this host (systemd --user path): the quoted-ExecStart and --apply-substring
  refusal were exercised via the new unit tests (fakeExec/scratch homes only — no real systemctl
  call was made for this round; same live-verification scope as round 1 otherwise).
- Gate green: `node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs
  scripts/janitor.test.mjs` → 100 tests, 98 pass, 0 fail, 2 skipped (pre-existing, unrelated).
- Committed on build/janitor-daily-1-J1 — see report for the exact sha (`git rev-parse HEAD`).

Done (round 3 — every reviewer-verified finding from J1-review-r2.md applied):
- J1r2-M1 (B1 space-repo test not Windows-portable, same class as r1 M4): rewrote the assertion to
  find the `ExecStart=` line and compare against `spaceRepo.replace(/\\/g, "\\\\")` (systemdQuote's
  own doubled-backslash behavior) instead of building a regex from the raw, unescaped path.
- J1r2-m1 (--remove --dry-run note claims "files removed"): note text is now
  `` `${dryRun ? "files would be removed" : "files removed"}, but the ... ` `` — added a
  `/^files would be removed/` assertion to the existing --remove --dry-run test.
- J1r2-m2 (valueless/loosely-formatted --hour installs silently): `argv.includes("--hour")` checked
  separately from `parseArgFlag`'s null return so a bare `--hour` (nothing follows, or another
  --flag follows) is refused; value is now required to match `/^\d{1,2}$/` before `Number()`, so
  `"0x10"` (was 16) and `" "` (was 0) are refused too. Added both to the bad-value table plus a new
  test for the two valueless-argv shapes.
- J1r2-m3 (post-remove daemon-reload failure swallowed): the catch block now pushes
  `` `${cmdText} (failed: ${err.message})` `` into `result.commands`, mirroring the disable loop
  above it. Added a new test with a fakeExec that throws only on the daemon-reload call and asserts
  the failure entry appears in `result.commands`.
- Gate green: `node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs
  scripts/janitor.test.mjs` → 102 tests, 100 pass, 0 fail, 2 skipped (pre-existing, unrelated —
  same two as round 2).
- Committed on build/janitor-daily-1-J1 — see report for the exact sha (`git rev-parse HEAD`).

Next: nothing outstanding for J1. If re-picked up: confirm J2's file_fresh check for
~/.agents/janitor/last-run.log actually reads the `unknown`-when-installed.json-absent state as
this file's seam contract describes (J2's own territory, not mine, but worth a cross-check at
merge time).

Open questions (unchanged from round 1, still open, none blocking):
- `--repo <repo>` is written into every generated command per the pinned contract text, but is
  inert to janitor.mjs's own CLI today (only --host was added, per brief's NOT list) — real
  repo-targeting comes from each unit/task/plist's WorkingDirectory.
- `~/.agents/janitor-repo`'s content shape: took the brief's stated "simplest reading" (bare path
  string, first line trimmed) — no prior convention existed to copy.
- Windows Task Scheduler/launchd stdout truncation: both wrap the scheduled command in a shell
  (`cmd /s /c "..."` / `/bin/sh -c`) with `>` truncation — a design choice, not verified live on
  either platform (impossible on this Linux host).

How to run my gate:
cd /home/ben/Code/claude-delegation-wt/wt-janitor-daily-1-J1 && node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs scripts/janitor.test.mjs
