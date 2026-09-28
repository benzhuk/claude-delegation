STATUS: DONE (see commit sha below)

# Lane 43, cross-host nudge — build report

Territory: `scripts/collect-status.mjs` and its test, the project-config loader (`skills/decisions/scripts/project-config.mjs`, reached through the compatibility re-export `scripts/project-config.mjs`) and its test (only the new `owner_hosts` key), `.agents/project.json`, and `docs/census.md`.

## Cause

`collect-status.mjs`'s `sendStallNudges` sends every stall ASK with no `--sender-host` flag at all
(`buildStallNudgeArgv`, pre-fix). `note-send.mjs`'s cross-host mirror (`runMirror`, contract R1-R3) only
fires when it can resolve a sender host, and it resolves one exclusively from `--sender-host` or from
`SSH_CONNECTION`/`SSH_CLIENT` (`resolveSenderHost`, note-send.mjs:152-169). `collect-status.mjs` runs
from a timer with neither env var set and never passed the flag, so `resolveSenderHost` always returned
`{ host: null }` and the mirror never ran. Every stall ASK therefore landed only in the note-send caller's
own host's `~/.agents/notes/<day>.md` (and, via `--recipient-repo`, only that host's `docs/ledger/`) —
an owner on a different host never saw it. The 9/27 11:41 PM ASK to skills-h existing only on Netcup's
ledger is exactly this: the collector ran on Netcup with no SSH_CONNECTION and no `--sender-host`.

## Discriminating check

`node --test` on a fixture-only test asserting that a stale row owned by `skills-h`, with
`.agents/project.json`'s `owner_hosts` table mapping `skills-h -> zhuk-vps32`, produces a note-send
argv containing `--sender-host zhuk-vps32`. Run against an UNFIXED copy of the code (a fresh
`git archive HEAD` extracted under `mktemp -d`, never in this worktree — the test was appended there,
never in the worktree's own test file, and the worktree was never touched by that run):

```
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
+ actual - expected
+ '--from'
- 'zhuk-vps32'
```

(`get("--sender-host")` found no `--sender-host` flag in argv at all, so `args.indexOf(-1) + 1 = 0`
read `args[0]`, `'--from'` — proof the flag was never added on unfixed code.) The same test passes
after the fix (see full gate output below). Archive copy path (left in place, not deleted, per the
delete rule):
`/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-43/repro-yDOZ/repo`

## Fix location

- `scripts/collect-status.mjs`:
  - `buildStallNudgeArgv` gains an optional `senderHost` param; when truthy it appends
    `--sender-host <senderHost>` to the argv it already builds — note-send's own existing flag, no new
    transport, no new script.
  - `sendStallNudges` gains an `ownerHosts` param (a plain object, owner slug -> host name) and looks up
    `ownerHosts[owner]` per stall row, passing it through to `buildStallNudgeArgv`. Absent from the
    table (or no table at all) -> `undefined` -> the flag is simply omitted -> byte-for-byte today's
    behaviour.
  - `main()` computes `ownerHosts` once per run via `loadProjectConfig(repo).config.owner_hosts`
    (imported from `./project-config.mjs`, the existing compatibility re-export every other script in
    this repo already imports from) and passes it into the one `sendStallNudges` call, inside the same
    try/catch that already guards that call — a failure here degrades to the existing
    `stall-nudge failed` warn(), never a new crash mode.
- `skills/decisions/scripts/project-config.mjs` (the canonical loader `scripts/project-config.mjs`
  re-exports): `DEFAULTS` gains `owner_hosts: {}`; `loadProjectConfig`'s file-found branch runs the raw
  `owner_hosts` value through a new `sanitizeOwnerHosts` before merging it into `config`.
- `.agents/project.json`: added an `owner_hosts` table with `"skills-h": "zhuk-vps32"` and
  `"skills-n": "zhuk-netcup"` — the exact host names `note-send.mjs`'s `MIRROR_HOSTS` table already
  uses for Hetzner and Netcup (grepped, not invented; `zhuk-vps32` is independently confirmed as
  Hetzner's mirror name across several existing evidence files, e.g.
  `docs/work/evidence/wr-2026-09-27-multi-cross-host-live.md`).
- `docs/census.md`: two new lines (in one paragraph) after the `collect-status.mjs` section, naming
  what is counted — a stall nudge that reached the owner's own host ledger versus one that landed only
  on the sender's.

Confirmed before writing any code that `note-send.mjs` already accepts and correctly handles
`--sender-host <name>` (STRING_FLAGS includes `sender-host`; `resolveSenderHost` looks it up in
`MIRROR_HOSTS` by name, throwing a usage error only for an unknown name) — so this fix needed no change
to `note-send.mjs`, `transport.mjs`, or any other file outside the stated territory.

## Simplification

The malformed-table question ("refused or ignored — pick one and say which") is decided as **ignored**:
a malformed `owner_hosts` value (not a plain object, or holding any key/value pair that isn't a
non-empty string) collapses the whole table to `{}` inside the loader, never throwing. This means every
call site — `collect-status.mjs` included — never needs its own malformed-config guard: an owner with
no usable entry (whether because the table is absent, empty, or thrown away for being malformed) is
handled by the exact same code path as "this owner isn't in the table," which is also the exact same
code path that already existed for "no cross-host table at all." One `if (senderHost)` check in
`buildStallNudgeArgv` covers all three cases at once, and `loadProjectConfig`'s existing
"broken config degrades to defaults, never a crash" contract is extended rather than given a second,
key-specific version of the same idea.

## Tests

New tests (all passing):
- `scripts/collect-status.test.mjs`: three new tests — (1) an owner mapped in `owner_hosts` gets
  `--sender-host <that host>` in the note-send argv; (2) an owner absent from a present `owner_hosts`
  table gets no `--sender-host` flag; (3) no `.agents/project.json` at all gets no flag either (today's
  behaviour, byte-for-byte).
- `scripts/project-config.test.mjs`: three new tests on `owner_hosts` — the empty-default case, a
  well-formed table passing through unchanged, and the malformed-table-is-ignored case (three malformed
  shapes: a non-object value, a non-string value inside an object, and an unparseable `project.json`
  file — all resolve to `{}`, never throw).

## Gate

```
node --test scripts/collect-status.test.mjs scripts/project-config.test.mjs skills/multi/scripts/hooks.test.mjs
```
75 tests, 75 pass, 0 fail.

```
node scripts/run-tests.mjs
```
2600 tests, 2595 pass, 0 fail, 5 skipped.

Full logs: `docs/specs/cross-host-nudge-1/reports/cross-host-nudge-gate.log`
(unit run and full-suite run concatenated; also kept separately as `gate-unit.log` and `gate-full.log`).

## Deviations / assumptions

- The territory brief named "the project-config loader and its test" without naming a file. The
  canonical implementation lives at `skills/decisions/scripts/project-config.mjs` (re-exported by
  `scripts/project-config.mjs`, which is where the existing project-config test file already lives and
  the only place `owner_hosts` is imported and tested from in this build); I edited the canonical file
  and added the new-key tests to the existing `scripts/project-config.test.mjs`, since that file already
  imports both the re-export and the canonical module and is the one file this repo's convention treats
  as "the project-config loader's test."
- No live proof was attempted (forbidden by this brief: "Never send a real note, and never ssh
  anywhere. The lead does the live proof."). The lead's record (`docs/work/wr-2026-09-28-cross-host-nudge.record.md`)
  already names a live proof note to skills-h on Hetzner as the lead's own next step.
- The git-archive repro copy at `/tmp/claude-1000/.../scratchpad/lane-43/repro-yDOZ/repo` is left in
  place (not deleted, per the hard no-delete rule); it is pure scratch and safely ignorable.
