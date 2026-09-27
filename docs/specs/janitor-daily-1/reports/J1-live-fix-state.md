# J1-live-fix state

## Territory
scripts/install-janitor-timer.mjs and scripts/install-janitor-timer.test.mjs only
(round 1: findings L1/L2 from J1-live-findings.md; round 2: F1-F5 from
J1-live-fix-review.md, Opus review of round 1 at 3ea1493).

## Contracts I rely on
- docs/specs/janitor-daily-1/contracts.md, "J1 rulings" > "Temporary checkout":
  refuse a non-installed-plugin/non-durable checkout unless `--force-root` (tests
  only). L2 narrowed this to a positive allowlist; F3/F4 hardened it (realpath,
  platform-scoped case-fold, bare-root rejected).
- Claude plugin cache shape: `<home>/.claude/plugins/cache/<publisher>/<name>/
  <version>/` (README.md:117).
- Codex plugin cache shape (native `codex plugin add` route only):
  `<CODEX_HOME>/plugins/cache/delegation/delegation/<version>/`; only the default
  `<home>/.codex` is allowlisted (Codex's homes:
  scripts/codex-hook-trust.mjs:585-591 — a non-default CODEX_HOME/CLAUDE_CONFIG_DIR
  install is refused, fail-safe). Path confirmed live:
  docs/work/evidence/native-package-review.md:10.
- `isDurablePath` stays imported from scripts/mirror-shared-skills.mjs (owned by
  another lane; read-only use here, unchanged).

## Done
Round 1 (3ea1493bc31dd3ac0d6ade12bf31dc3676650a44):
- L1: `--help`/`-h` prints usage, exits 0, writes nothing; any unrecognized argv
  token is a usage error, exit 2, nothing written.
- L2: install requires `pluginRoot` inside the Claude/Codex plugin cache
  (`isInstalledPluginRoot`); `isDurablePath` kept as an additional refusal.

Round 2 (b9fc40e34d80320aab6286c2849cca93fe6b9d8f), all 5 reviewer findings applied
essentially verbatim:
- F1: `--repo`/`--host`/`--name` valueless/empty/repeated now refuse (exit 1,
  nothing written, no exec) instead of silently falling back to a default — closes
  the `main(["--remove","--name","--enable"])` real-timer-deletion hole.
- F2: `isInstalledPluginRoot` exported; new path-only unit test
  (`L2 review: the allowlist itself rejects...`) added, which fails to even load
  against c4b6633 (function didn't exist there); the old non-discriminating
  main-level L2 refusal test tightened so the pluginRoot check is the only possible
  refusal (`refusals.length === 1`, message matched).
- F3: `isInstalledPluginRoot`'s `norm` now realpaths both sides
  (`fs.realpathSync.native`, falls back to the resolved path on error) and
  case-folds only on `process.platform === "win32" || "darwin"`, not Linux.
- F4: allowlist match is `t.startsWith(\`${root}/\`)` only — the bare cache root
  itself no longer matches.
- F5: doc-comment-only fix, cites scripts/codex-hook-trust.mjs:585-591 for
  CODEX_HOME resolution instead of mirror-shared-skills.mjs:48, notes only the
  default `<home>/.codex` is allowlisted.
- I1 (symlinked entrypoint silently no-ops via `isMainModule`) intentionally left
  unfixed — info only, pre-existing, outside this diff, per instruction.

Territory gate: `node --test scripts/install-janitor-timer.test.mjs` — 31/31 pass.
Full sealed gate: `node scripts/run-tests.mjs` — 2044 pass / 0 fail / 3 skipped
(log: docs/specs/janitor-daily-1/reports/J1-live-fix-r2-gate.log).

## Next
Nothing outstanding for L1/L2/F1-F5. Round 2 report is DONE. I1 remains open as its
own (unassigned) ticket per the reviewer's note — not this territory's job to fix
without instruction.

## Open questions
None blocking. Same Codex-mirror-route note as round 1 still applies: the mirror
route never writes a Codex plugin cache at all (mirror-shared-skills.mjs:14-15), so
on a host that only ever used the mirror route, `<home>/.codex/plugins/cache/` will
simply never exist — `isInstalledPluginRoot` still allows it as a location, it just
won't match on such a host, which is correct.

## How to run my gate
```
cd /home/ben/Code/claude-delegation-wt/janitor-daily-base
node --test scripts/install-janitor-timer.test.mjs      # territory gate, 31 tests
node scripts/run-tests.mjs > docs/specs/janitor-daily-1/reports/J1-live-fix-r2-gate.log 2>&1  # full sealed suite
```
