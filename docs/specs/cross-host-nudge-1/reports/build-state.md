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

## Fix round 1 (this pass)

Review r1 NEEDS_FIXES on c12a494, rulings in the record's last Log line: F1/F2/F3/F5/F6 applied
as ruled, F4 already done by the lead (duplicate gate log removed; no new gate log committed here).
See `reports/build-r1.md` for the full account (Cause/Discriminating check/Fix location/
Simplification, plus the proof harness's --dry-run output).

- F1: `docs/census.md` replaced with the exact review text (notes-mirror is the delivered copy).
- F2: `MIRROR_HOST_NAMES` (from note-send's own `MIRROR_HOSTS`) gates every `owner_hosts` value;
  an unknown name falls back to no `--sender-host`, with one warn(). Typo test + a guard test that
  every value in this repo's own `.agents/project.json` owner_hosts is a MIRROR_HOSTS name.
- F3: `mirrorOutcome()` reads note-send's own `mirrorLedger` from its stdout JSON; a failed mirror
  produces one warn() naming the sender host, never a retry.
- F5: `sanitizeOwnerHosts(raw?.owner_hosts)` - a top-level `null` project.json no longer throws.
- F6: `loadOwnerHosts()` reads `owner_hosts` from `origin/main:.agents/project.json` through the
  same `gitRunner`/sanitizer, falling back to the working-tree config when the ref or file is
  missing/unparseable. `opts.gitRunner` added to `main()` for test injection.

## Next

Nothing outstanding in this territory. The live proof (a real ASK to skills-h on Hetzner, read back
over Hetzner's own `~/.agents/notes/<day>.md`, per F1's ruling) is explicitly the lead's step, not
this builder's - brief forbids sending a real note or ssh'ing anywhere from here. A throwaway
--dry-run-only proof harness demonstrating the same mechanism against a synthetic fixture is at
`scratchpad/lane-43/proof.mjs` (scratch, not part of the territory diff).

## Open questions

None. F2's typo fallback, F3's mirror-failure warning and F6's origin/main-first read are all
mechanical per the review's own patches; no further design choice was left open.

## How to run my gate

```
node --test scripts/collect-status.test.mjs scripts/project-config.test.mjs skills/multi/scripts/hooks.test.mjs
node scripts/run-tests.mjs
```
