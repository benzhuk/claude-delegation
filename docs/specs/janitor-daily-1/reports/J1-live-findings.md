VERDICT: NEEDS_FIXES a8e0bb578e2f84cd034720cbf38c2ec74fc43800

Lead findings for J1 from the live checks (docs/work/evidence/wr-2026-09-27-janitor-daily-live.md, "CRITICAL FINDING" section). Written by skills-h.

## L1 — HIGH — an unknown flag falls through to a real install
- Where: `main()` in scripts/install-janitor-timer.mjs, lines 337-362. Flags are read with `argv.includes`/`parseArgFlag`, and anything unrecognised is ignored.
- What happened: `node scripts/install-janitor-timer.mjs --help` wrote `~/.config/systemd/user/janitor-record.{service,timer}` and `~/.agents/janitor/installed.json` into the real Hetzner home.
- Fix:
  - `--help` / `-h` prints usage and exits 0, writing nothing.
  - Any argument that is not a known flag, or not the value of a value-taking flag, is a refusal: usage error, exit 2, no writes.
  - Known flags: --dry-run --json --remove --enable --force-root --hour <n> --repo <p> --host <h> --name <n>.
- Tests:
  - `--help` writes nothing.
  - `--bogus` exits 2 and writes nothing.
  - A stray positional argument exits 2 and writes nothing.

## L2 — HIGH — the temp-checkout refusal misses real worktree names
- Where: line 385. `isDurablePath` (a mirror-shared-skills.mjs regex) matches the segments `tmp|temp|scratchpad|worktree(s)|wt-*`. This host's worktrees live under `/home/ben/Code/claude-delegation-wt/`, and the lane's worktree is `.../janitor-daily-base`. Neither matches, so the installer accepted a worktree as a durable root.
- Why this matters: contracts.md, J1 rulings, "Temporary checkout", says to refuse any plugin root that is not the installed plugin cache. The attack brief named this case, but the tests only used `wt-` prefixed paths.
- Fix: make the check positive. Install is allowed only when the resolved `pluginRoot` is inside an installed-plugin location:
  - `<home>/.claude/plugins/cache/`;
  - plus the Codex host's installed-plugin root, if the plugin installs there. Find it from this repo's own install code and docs (.codex-plugin/, scripts/mirror-shared-skills.mjs, docs/native-use.md) and cite file:line. If there is none, say so and allow only the Claude cache.
- Keep `isDurablePath` as an additional refusal. `--force-root` stays tests-only. `--remove` stays ungated.
- Tests:
  - A plugin root under a fixture `<home>/.claude/plugins/cache/benzhuk/delegation/0.0.0` installs.
  - These all refuse under both `--dry-run` and a real install, with nothing written: a root at `<fixture>/Code/claude-delegation-wt/x`, one at `<fixture>/Code/claude-delegation`, and one under os.tmpdir().

## Out of scope
- Do not edit scripts/mirror-shared-skills.mjs (another lane owns it).
- Keep the change under about 60 lines of code plus tests.
