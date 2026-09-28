## Territory

`scripts/collect-status.mjs` and its test, the project-config loader
(`skills/decisions/scripts/project-config.mjs`, reached via `scripts/project-config.mjs`) and its test
(only the new `owner_hosts` key), `.agents/project.json`, `docs/census.md`. Lane 43, cross-host nudge,
build/cross-host-nudge-1.

## Contracts I rely on

- `note-send.mjs` already accepts `--sender-host <name>` (STRING_FLAGS) and `resolveSenderHost`
  (note-send.mjs:152-169) looks it up in the frozen `MIRROR_HOSTS` table (note-send.mjs:136-141) by
  name, mirroring the ledger line to that host over ssh (`runMirror`, :237). Not modified; only relied
  on.
- `loadProjectConfig` (`skills/decisions/scripts/project-config.mjs`, re-exported by
  `scripts/project-config.mjs`) is the one loader every script reads `.agents/project.json` through.
  `DEFAULTS.owner_hosts = {}`; a malformed value is ignored (collapses to `{}`), never thrown.

## Done

- `owner_hosts` key added to `DEFAULTS` and sanitized on load in `skills/decisions/scripts/project-config.mjs`.
- `.agents/project.json` carries `owner_hosts: { "skills-h": "zhuk-vps32", "skills-n": "zhuk-netcup" }`
  (names taken from `note-send.mjs`'s `MIRROR_HOSTS`, not invented).
- `scripts/collect-status.mjs`: `main()` loads `ownerHosts` once per run and passes it to
  `sendStallNudges`, which looks up `ownerHosts[owner]` and passes it to `buildStallNudgeArgv`, which
  appends `--sender-host <host>` only when present.
- Tests: 3 new in `scripts/collect-status.test.mjs` (mapped owner gets the flag; unmapped owner in a
  present table gets none; no `.agents/project.json` at all gets none), 3 new in
  `scripts/project-config.test.mjs` (default empty table; well-formed table passthrough; malformed
  table ignored — three shapes).
- Discriminating check: the mapped-owner test shown failing on unfixed code via a `git archive HEAD`
  copy under `mktemp -d` (never in this worktree), left at
  `/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-43/repro-yDOZ/repo`.
- Gate green: `node --test` on collect-status + project-config + hooks.test.mjs (75/75 pass), then
  `node scripts/run-tests.mjs` once (2595/2600 pass, 5 skipped, 0 fail). Logs in
  `docs/specs/cross-host-nudge-1/reports/{gate-unit,gate-full,cross-host-nudge-gate}.log`.
- Committed and pushed on `build/cross-host-nudge-1`.

## Next

Nothing outstanding in this territory. The live proof (a real ASK to skills-h on Hetzner, read back
over ssh from Hetzner's own `docs/ledger/`) is explicitly the lead's step, not this builder's — brief
forbids sending a real note or ssh'ing anywhere from here.

## Open questions

None. The two design choices the brief left open were both made and stated in `build.md`'s
Simplification section: malformed `owner_hosts` is **ignored** (not refused), and the loader edited is
the canonical `skills/decisions/scripts/project-config.mjs` (with tests added to the existing
`scripts/project-config.test.mjs`, which already imports both it and its re-export).

## How to run my gate

```
node --test scripts/collect-status.test.mjs scripts/project-config.test.mjs skills/multi/scripts/hooks.test.mjs
node scripts/run-tests.mjs
```
