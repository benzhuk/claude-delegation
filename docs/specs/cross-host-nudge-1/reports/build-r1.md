STATUS: DONE 4cb22f16383e5ccb6d17b5e2e64d8c05a9cb900d

# Lane 43, cross-host nudge: fix round 1

Fresh Sonnet builder, review r1's NEEDS_FIXES on c12a494, rulings from the record's last Log line
(2026-09-28T20:13:14.000Z). Applied F1, F2, F3, F5, F6 as ruled; F4 was already done by the lead in
the same commit that carried the rulings (the duplicate gate log removed), so no gate log is added
or committed here - the gate is summarized below instead.

## Cause

The build's promise ("a missing/malformed `owner_hosts` table degrades to today's behaviour, never
a crash") held for a missing table but not for three real failure shapes review r1 found: an
`owner_hosts` value that is not one of note-send's own `MIRROR_HOSTS` names (a typo, or a host later
renamed/dropped from that table) reached note-send anyway, which refused the whole send with exit 1
before any write - losing the nudge completely, worse than not having the fix at all (F2). A mirror
that failed on the remote host (unreachable, ssh timeout) was invisible: `result.status` is 3 for the
normal "no registered inbox" ASK path whether or not the ssh mirror to the owner's own host actually
worked, so a lost remote copy left no trace anywhere (F3). And the census/live-proof discriminator
named the wrong file - `note-send`'s cross-host mirror writes the owner's `~/.agents/notes/<day>.md`
(what `note-inbox` reads), never the owner's repo `docs/ledger` (F1). Separately, a top-level `null`
`.agents/project.json` threw inside `sanitizeOwnerHosts(raw.owner_hosts)` before the loader's own
catch could normalize it, changing `source`/`vcs` for every reader (F5). And the timer's `--repo` is
a pinned plugin checkout that can sit at an old release indefinitely while the live repo's
`owner_hosts` table has moved on, so a config change made in this session would not reach the timer
until that checkout advanced (F6).

## Discriminating check

- F2: `scripts/collect-status.test.mjs` - "an owner_hosts value that is not a MIRROR_HOSTS name falls
  back to no --sender-host, with one warning". Reverting `MIRROR_HOST_NAMES`'s gate (i.e. going back
  to `typeof ownerHosts[owner] === "string"`) makes this fail: the argv would carry
  `--sender-host zhuk-vps-32`, an unknown host name note-send's own `resolveSenderHost` refuses.
- F3: "a failed mirror (mirrorLedger.ok === false in note-send's stdout JSON) produces one warning
  naming the sender host" - a fake `spawnNoteSend` returns `{status:3, stdout: JSON.stringify({
  mirrorLedger: {host:"zhuk-vps32", ok:false, error:"timeout"} })}`; without `mirrorOutcome()` the run
  produces zero warnings naming the host.
- F5: `scripts/project-config.test.mjs` - "a top-level `null` project.json does not throw and is
  treated as readable, not 'unreadable'". Reverting `raw?.owner_hosts` to `raw.owner_hosts` throws a
  TypeError on a `null` file, which the loader's `catch` turns into `source: "unreadable"`.
- F6: two dedicated tests using a fake git runner (`fakeGitRunnerWith`) - one where the working tree
  has NO `.agents/project.json` at all and only the fake `origin/main:.agents/project.json` blob
  supplies `owner_hosts`, proving the code actually reads that ref; one where the fake runner throws
  (simulating a missing ref/blob) and the run falls back to the working-tree table.
- F1 is a documentation fix (no code path), verified by re-reading `note-send.mjs`'s own
  `runAppendLedgerMode`/`notesMirrorPath` (transport.mjs:795): the remote mirror never touches
  `docs/ledger`, only `~/.agents/notes/<day>.md`.

Full gate: `node --test scripts/collect-status.test.mjs scripts/project-config.test.mjs
skills/multi/scripts/hooks.test.mjs` -> 81/81 pass (9 new: 4 in collect-status.test.mjs for F2/F3/F6
x2, 1 in project-config.test.mjs for F5). `node scripts/run-tests.mjs` once -> 2601/2606 pass, 0
fail, 5 skipped (same 5 skips as build round 1; no regression).

## Fix location

- `docs/census.md:469-477` (F1) - replaced with the review's exact text, notes-mirror as the
  delivered copy.
- `scripts/collect-status.mjs` - import of `MIRROR_HOSTS` and the `MIRROR_HOST_NAMES` set (near the
  top); the sender-host resolution + warn inside `sendStallNudges`'s loop (F2); `mirrorOutcome()` and
  its call site right after (F3); `loadOwnerHosts()` plus `opts.gitRunner` in `main()`, called at the
  stall-nudge site in place of the bare `loadProjectConfig(repo).config.owner_hosts` read (F6).
- `skills/decisions/scripts/project-config.mjs:48` (F5) - `raw?.owner_hosts`; `sanitizeOwnerHosts` is
  now also exported, so `collect-status.mjs` runs the exact same sanitizer against the `origin/main`
  blob as the loader runs against the working tree (F6, "the same sanitizer").
- Tests: `scripts/collect-status.test.mjs` (F2 typo test, F2 guard test, F3 mirror-failure test, F6
  x2), `scripts/project-config.test.mjs` (F5 null test).

## Simplification

F2 and F6 both reuse a table/sanitizer that already exists rather than adding a second one:
`MIRROR_HOST_NAMES` is a `Set` built once from note-send's own frozen `MIRROR_HOSTS` (no copy of the
host list in this file), and `loadOwnerHosts` calls the SAME `sanitizeOwnerHosts` the working-tree
loader calls, imported directly rather than duplicated. F3 adds one small pure helper
(`mirrorOutcome`) that reads a field note-send already prints on stdout on every exit path (success
or refusal) - no new IPC, no new file. F6 reuses the git runner the ledger-path code (`mainCheckout`)
already imports (`gitRunner` from `transport.mjs`), injected the same way every other seam in this
file already is (`opts.<name> ?? <default>`), so the fallback-on-throw behaviour needed no new error
type: any parse/exec failure just returns the working-tree table, the loader's own "broken degrades to
defaults" rule applied one level up.

## Deviations / assumptions

- F6 design: the reviewer's own alternative was picked by the lead's ruling ("owner_hosts read from
  `origin/main:.agents/project.json` with the working tree as fallback"). Implemented exactly that;
  `opts.gitRunner` is new (no prior injection point existed in `main()` for the git runner used
  elsewhere in this file for `mainCheckout`).
- The guard test ("every value in the repo's own `.agents/project.json` owner_hosts is a
  MIRROR_HOSTS name") reads the REAL repo config and the REAL `note-send.mjs` MIRROR_HOSTS table
  (via `./project-config.mjs` and `../skills/multi/scripts/note-send.mjs`), not a fixture - by
  design, so a future host rename/drop in either file trips this test immediately.

## Live-proof harness (--dry-run only, never run for real)

Written to `scratchpad/lane-43/proof.mjs` per the brief - not part of this territory's tracked diff.
Builds a throwaway fixture (bare `origin` + `clone`, no identity flag anywhere) with `origin/main`
carrying `owner_hosts: {"skills-h":"zhuk-vps32"}` and a `build/proof-cross-host-1` branch (Owner:
skills-h, Status: owned, a 5-hours-old Log line), then imports this worktree's real
`scripts/collect-status.mjs` and calls its `main()` against the fixture. The harness's own
`--dry-run` is threaded into the REAL, installed `note-send` (`~/.local/bin/note-send`, not this
worktree's copy) through a `spawnNoteSend` wrapper that appends `--dry-run --json` to whatever argv
collect-status built - collect-status.mjs itself gained no new flag for this. The script refuses to
run at all without `--dry-run`.

Two stated deviations (also written into the harness's own file header):
1. The brief names `--stale-hours 0`; collect-status's own CLI validation (lane 33 F1) refuses 0
   (exit 2, before any row is read). `--stale-hours 0.1` is used instead - the smallest value the
   CLI accepts, same practical effect.
2. No existing collect-status.mjs flag can change the stall ASK's `--text` or `--needs` (both are a
   fixed template inside `sendStallNudges`, not read from argv). Making the ASK literally say "this
   is a lane 43 delivery proof and needs no action" through an existing flag is therefore
   **impossible** - stated rather than silently adding a new flag outside this fix round's scope.

Command run (the only invocation): `node proof.mjs --dry-run`. Full output:

```
warning: You appear to have cloned an empty repository.
--dry-run — nothing was written outside <fixture>, nothing was sent, nothing was ssh'd.
collect-status.mjs main() exit code: 0
Fixture: scratchpad/lane-43/proof-87xhBs

Files under the fixture (73): [clone/.git internals, clone/.agents/project.json, clone/README.md,
origin/* (bare), out/status.json, out/status.md - all under the fixture, nothing outside it]

note-send calls: 1

Planned argv (execPath=/home/ben/.local/bin/note-send):
  ["--from","collect-proof-host","--to","skills-h","--kind","ASK","--no-type","--recipient-repo",
   "<fixture>/clone","--topic","stall-build-proof-cross-host-1-f906c80","--text","build/proof-cross-
   host-1 has had no Log line for 5.0 h in state owned. Reply with the lane state and a new ETA, or
   BLOCKED. A Log line on the record resets this.","--needs","review","--by","16:53","--sender-host",
   "zhuk-vps32","--dry-run","--json"]
Exit status: 0
Note id: collect-proof-host-stall-build-proof-cross-host-1-f906c80-1
Planned actions (note-send's own dry-run plan):
  - "skills-h" has no registered inbox on this machine, so this would record the note, queue the
    wake-up and exit 3 - typing is off unless MULTI_ALLOW_TYPING=1 (skipped: --dry-run)
  - append envelope to <fixture>/clone/docs/ledger/2026-09-28.md
  - append envelope to /home/ben/.agents/notes/2026-09-28.md
  - mirror the envelope to "zhuk-vps32" over ssh: ssh -o BatchMode=yes -o ConnectTimeout=3
    ben@100.111.119.54 ~/.local/bin/note-send --append-ledger 2026-09-28 (skipped: --dry-run)
  - drain ~/.agents/notes/outbox first (3 s budget)
  - no registered inbox: record the note, queue the wake-up, exit 3
  - classify pane via `terminal show` + `terminal read` (last-resort typed path, MULTI_ALLOW_TYPING=1
    only); Claude sends idle or working, Codex idle only
  - two-phase: baseline read, `terminal send --text <envelope>` (no --enter), re-read, then
    `terminal send --enter` - last resort only

No existing collect-status.mjs flag can change the stall ASK's --text or --needs (Deviation #2) - the
ASK text above is collect-status's fixed stall template, not a proof-specific message. The branch
name (build/proof-cross-host-1) is the only proof label available without adding a new flag.
```

This confirms the argv the real, installed note-send would receive carries `--sender-host zhuk-vps32`
(the F2/F6 path, end to end) and plans the ssh mirror to that host - the mechanism the review's F1
ruling says lands in Hetzner's `~/.agents/notes/<day>.md`. No note was sent, no ssh connection was
made (every step above is a plan string; `--dry-run` skipped all of them, per note-send's own
contract).

## Gate

```
node --test scripts/collect-status.test.mjs scripts/project-config.test.mjs skills/multi/scripts/hooks.test.mjs
  -> tests 81, pass 81, fail 0

node scripts/run-tests.mjs
  -> tests 2606, pass 2601, fail 0, skipped 5
```

No gate log committed (F4: the lead already removed the duplicate; this round adds none).
