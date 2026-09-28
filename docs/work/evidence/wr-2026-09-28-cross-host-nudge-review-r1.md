VERDICT: NEEDS_FIXES c12a494

# Lane 43, cross-host nudge: review r1

Artifact c12a494 on build/cross-host-nudge-1, diff `67eb918..c12a494`. The reviewer is independent (Opus), and the worktree was not edited. All probes ran on `git archive` copies under
`scratchpad/lane-43/rv-RVyr` and `scratchpad/lane-43/rv-fS0M`, using `--dry-run` and fakes only. I sent no note and made no ssh connection. No command was denied.

Counts: 2 MAJOR, 2 MINOR, 1 NIT, 1 INFO (deployment).

## C4 fields

Cause: the builder treated note-send's cross-host mirror as though it appends to the owner host's repo `docs/ledger`. It does not. `runMirror` (note-send.mjs:237-252) runs `note-send --append-ledger <day>` on the remote, and `runAppendLedgerMode` (note-send.mjs:284) writes only `~/.agents/notes/<day>.md` (`notesMirrorPath`, transport.mjs:795). That is why the census discriminator and the planned live proof read the wrong file. Separately, `sanitizeOwnerHosts` checks the table's shape but never checks that a host is a member of `MIRROR_HOSTS`. An unknown host name therefore reaches note-send, which refuses it before any write.
Discriminating check: a `--dry-run` of the worktree's note-send with `--sender-host zhuk-vps32` plans three writes. Two are local: `<repo>/docs/ledger/<day>.md` and `~/.agents/notes/<day>.md`. The third is `ssh ... ben@100.111.119.54 ~/.local/bin/note-send --append-ledger <day>`, and it names no remote docs/ledger. With `--sender-host zhuk-vps-32` the run prints `exit=1`, reports `"ledgers":[]`, and writes nothing. A probe test that maps `skills-h` to `zhuk-vps-32` fails on c12a494 (the argv carries the bad name) and passes with the F2 patch below.
Fix location: `docs/census.md:469-477` (F1), plus the lead's live-proof step in the record; `scripts/collect-status.mjs:41` and `:398-405` (F2, F3); `docs/specs/cross-host-nudge-1/reports/cross-host-nudge-gate.log` (F4); `skills/decisions/scripts/project-config.mjs:48` (F5).
Simplification: check host names in one place, the collector, against the one host table that already exists (note-send's `MIRROR_HOSTS`, imported and never copied). With that check, "malformed", "unknown host" and "unmapped owner" all fall back to the same no-flag path the build already has. No second table is needed and the loader has no new failure mode.

## Answers to the attack brief

1. **End to end.** Partly correct. `buildStallNudgeArgv` appends `--sender-host zhuk-vps32` (collect-status.mjs:327-333). note-send lists `sender-host` in `STRING_FLAGS` (:123), `resolveSenderHost` looks the name up in `MIRROR_HOSTS` (:152-163), and `mirrorTargetHost` is set because Netcup is not zhuk-vps32 (:462-464). `runMirror` then sends the envelope over `ssh -o BatchMode=yes -o ConnectTimeout=3`. The line is **not** appended to Hetzner's `docs/ledger`, though. It goes to Hetzner's `~/.agents/notes/<day>.md`. That file is what `note-inbox` on Hetzner reads (note-inbox.mjs:211), so the nudge does reach skills-h's inbox. Only the census check and the packet's efficacy check look in the wrong place (F1).
   - **Dedupe: no spam regression, verified.** The local append (note-send.mjs:820, `for (const t of ledgerTargets) appendLine(...)`) runs before the mirror (:829-830). The Netcup main-checkout `docs/ledger/<day>.md` line therefore always exists, and the collector's `readLedgerCorpus` / `idPrefix` dedupe (collect-status.mjs:364-387) still finds it. The one exception is F2. There, note-send exits 1 before writing anything, so the dedupe finds nothing and a failing send repeats on every timer run.
2. **Same-host owner: verified correct, no ssh to itself.** On this host (`os.hostname()` = `v2202608391056492408`, `tailscale0` = 100.69.249.18), a dry-run with `--sender-host zhuk-netcup` plans only the two local appends and no mirror line. `mirrorIsLocal` matches on the interface address (note-send.mjs:460-463), so there is no double write. The host names in `.agents/project.json` (`zhuk-vps32`, `zhuk-netcup`) match `MIRROR_HOSTS` names exactly, case included, both in the worktree and in the installed `~/.agents/skills/multi/scripts/note-send.mjs` (which also has `sender-host` in `STRING_FLAGS`).
3. **Failure paths: verified. The collector does not fail and the local line is kept.** The mirror is bounded by `ConnectTimeout=3` plus a hard 5 s SIGKILL and pipe destroy (`MIRROR_TIMEOUT_MS`, note-send.mjs:144, :183-230). It never throws (:237-252) and never changes the exit code (note-send.test.mjs:1886, :1916 cover this). The collector's `spawnSync` has no timeout of its own, but the time is bounded: at most about 5 s of mirror plus the 3 s drain per ASK. **Gap:** a failed mirror is invisible to the collector, and because Netcup's ledger marks the ASK as sent, it is never retried (F3).
4. **Config: harmless to other readers, with one NIT.** The `loadProjectConfig` callers are decisions-handback.mjs:355/388/413, decisions-pickup.mjs:640, bearings-state.mjs:64, goal-card.mjs:168, janitor.mjs:1437 and collect-status.mjs:605. Each reads named keys only. None iterates the keys or compares against an exact key set. The root re-export key test is unchanged, and the full-suite log shows 0 failures. A missing `owner_hosts` gives `{}`, and a malformed one (non-object, or a non-string value) gives `{}` without throwing. An unknown host name is **not** caught (F2). A top-level `null` project.json now drops to `source: "unreadable"` / `vcs: "none"` (F5). There are no secrets. The table holds slugs and host names only; the tailnet IPs were already in note-send.mjs. The gate logs contain no `/home/ben` or scratch paths. build.md cites `/tmp/claude-1000/...` scratch paths, which are local noise and not secrets.
5. **Tests: they are looking, verified by mutation.** The fake replaces `spawnNoteSend(execPath, argv)`, and `defaultSpawnNoteSend` passes that argv to `spawnSync` unchanged (collect-status.mjs:168-170). That is the real seam. Mutation runs in a fresh `git archive c12a494` copy:
   - Reverting `scripts/collect-status.mjs` to 67eb918 fails 1 test ("an owner mapped ... gets --sender-host"), 48 pass.
   - Reverting `project-config.mjs` to 67eb918 fails 2 tests (the DEFAULTS / missing-key test and the malformed test), 47 pass.
   - The unmodified copy passes all 49.
   What is missing: no test pins that each `owner_hosts` value is a name note-send accepts, which is F2's class. The patch below comes with a probe test.
6. **Repo bloat.** Remove `cross-host-nudge-gate.log` before merge. It is a byte-identical concatenation of `gate-unit.log` and `gate-full.log` (`cmp` of `cat gate-unit.log gate-full.log` against it matches): 2,905 lines, 284 KB of pure duplication (F4). The other two logs (2,905 lines, 284 KB together) follow an existing precedent, since 182 `.log` files are already tracked at 67eb918. Keeping `gate-unit.log` is enough. `gate-full.log` can go too, with the one summary line already in build.md ("2600 tests, 2595 pass, 0 fail, 5 skipped") kept as the evidence. That decision is the lead's; the duplicate should go either way.

## Findings

### F1 MAJOR: the census discriminator and the planned live proof read a file the mirror never writes

Evidence: `docs/census.md:475` says to use `grep -c 'collect-.*-stall-' docs/ledger/2026-09-2*.md` on each host, where "a count on the owner's own host is a delivered nudge". The remote half of the mirror writes only `~/.agents/notes/<day>.md` (note-send.mjs:284-285 via `notesMirrorPath`, transport.mjs:795). The dry-run plan above shows no remote docs/ledger. So every successfully delivered cross-host nudge would count as **lost** on Hetzner. Worse, if Hetzner has a stall line in its own `docs/ledger` from any other source, it counts as delivered. The check is not looking at the delivered copy. The packet's efficacy step ("the line then present in Hetzner's docs/ledger for that day, read over ssh") and build-state.md's "Next" line ("read back over ssh from Hetzner's own `docs/ledger/`") share the same error. Run as written, the live proof fails, or passes by accident.

The glob `2026-09-2*` also stops matching on October 1.

Fix (documentation, exact text). Replace `docs/census.md:469-477`, from "A stall nudge (`sendStallNudges`..." through "...is a lost one.", with:

```
A stall nudge (`sendStallNudges`, work lost or stalled) is counted delivered when its id is in the
OWNER's host notes mirror, `~/.agents/notes/<day>.md` (what `note-inbox` reads), and lost when it is
only in the sender's `docs/ledger/<day>.md`: `grep -c 'collect-.*-stall-' ~/.agents/notes/<day>.md` on
the owner's host (the note-send mirror for an `owner_hosts` entry, or the local write when owner and
collector share a host) against the same grep on the collector host's `docs/ledger/<day>.md`.
```

The lead should also amend the record's live-proof step. The proof reads Hetzner's `~/.agents/notes/<day>.md` over ssh and quotes the id. It does not read Hetzner's `docs/ledger`, which this design never writes. If a copy in Hetzner's repo ledger is truly required, that needs a new remote-side write, which the packet's "no new transport" rules out. The lead has to rule on that, not the builder.
Predicted outcome: the census count and the live proof both look at the file that receives the mirrored line.

### F2 MAJOR: an unknown host name in `owner_hosts` loses the nudge completely, which is worse than before the fix

Evidence: `sanitizeOwnerHosts` (project-config.mjs:21-27) accepts any non-empty string, and collect-status.mjs:401 forwards it as is. note-send rejects an unknown `--sender-host` inside `resolveSenderHost` (note-send.mjs:156-161) with exit 1, **before** the ledger write. A measured dry-run with `--sender-host zhuk-vps-32` gave `exit=1` and `"ledgers":[]`. The result: no line on Netcup, no line on Hetzner, and the dedupe never sees an id, so the collector warns `stall-nudge send exit 1` on every 15-minute run while the owner receives nothing. Before c12a494, the same stall at least reached Netcup's ledger. The same failure follows if a host is later renamed or dropped from `MIRROR_HOSTS`. The build's own promise ("A missing/malformed table ... today's behaviour") does not hold for this malformed case.

Fix (mechanical, trial-applied to a scratch copy: all 45 collect-status tests pass, and the typo probe fails on c12a494 and passes patched):

`scripts/collect-status.mjs:41`, current:
```js
import { loadProjectConfig } from "./project-config.mjs";
```
replacement:
```js
import { loadProjectConfig } from "./project-config.mjs";
import { MIRROR_HOSTS } from "../skills/multi/scripts/note-send.mjs";

const MIRROR_HOST_NAMES = new Set(MIRROR_HOSTS.map((h) => h.name));
```
(note-send.mjs has no import-time side effects: `main()` sits behind `isMainModule`, and collect-status already imports its siblings `envelope.mjs` and `transport.mjs`.)

`scripts/collect-status.mjs:401`, current:
```js
    const senderHost = ownerHosts && typeof ownerHosts[owner] === "string" ? ownerHosts[owner] : undefined;
```
replacement:
```js
    const mappedHost = ownerHosts && Object.hasOwn(ownerHosts, owner) ? ownerHosts[owner] : undefined;
    const senderHost = MIRROR_HOST_NAMES.has(mappedHost) ? mappedHost : undefined;
    if (mappedHost !== undefined && !senderHost) {
      warn(`collect-status: owner_hosts maps ${owner} to a host note-send does not know; sending without --sender-host`);
    }
```

Add a test to `scripts/collect-status.test.mjs`. Copy the "owner mapped" test, change the table value to `"zhuk-vps-32"`, and assert `spawn.calls.length === 1` and `args.includes("--sender-host") === false`.

Optionally, add a guard test: every value in the repo's own `.agents/project.json` `owner_hosts` is a `MIRROR_HOSTS` name.

Predicted outcome: a typo falls back to today's local-only line, so the dedupe works and there is one warning per real send, not a silent loss.

### F3 MINOR: a failed mirror is silent and never retried

Evidence: every cross-host stall ASK exits 3 (dry-run: "no registered inbox ... record the note, queue the wake-up and exit 3"). On that path note-send prints `failureJson` to stdout, including `mirrorLedger` (note-send.mjs:1121, :1185). collect-status.mjs:403-405 reads only `result.status`, which is 3 whether or not the mirror worked. When Hetzner cannot be reached, or ssh from the timer context fails, the ASK sits in Netcup's ledger and the dedupe marks it as asked. The owner never gets it for that tip, and `last-run.log` shows nothing different from a success. The build's contract R2 ("no retry, ever") is kept, but the loss has to be visible.

Fix (mechanical). After collect-status.mjs:405, insert:
```js
    const mirror = mirrorOutcome(result);
    if (senderHost && mirror && mirror.ok === false) {
      warn(`collect-status: stall-nudge mirror to ${senderHost} failed (${mirror.error ?? "unknown"}) for ${a.branch}; the ASK is only in this host's ledger`);
    }
```
and add near `defaultSpawnNoteSend`:
```js
function mirrorOutcome(result) {
  const line = String(result?.stdout ?? "").trim().split("\n").pop();
  try { return JSON.parse(line)?.mirrorLedger ?? null; } catch { return null; }
}
```
Test: a fake spawn that returns `{ status: 3, stdout: JSON.stringify({ mirrorLedger: { host: "zhuk-vps32", ok: false, error: "timeout" } }) }` produces exactly one warning containing `mirror to zhuk-vps32 failed`.
Predicted outcome: a lost remote copy leaves one line in `~/.agents/collect/last-run.log`.

### F4 MINOR: a duplicate 284 KB gate log is committed

Evidence: `docs/specs/cross-host-nudge-1/reports/cross-host-nudge-gate.log` (2,905 lines, 283,931 bytes) is `gate-unit.log` and `gate-full.log` concatenated, byte for byte (`cmp` clean). Together the three logs are 5,810 lines and 567,862 bytes for a fix of roughly 45 code lines.
Fix: the builder runs `git rm docs/specs/cross-host-nudge-1/reports/cross-host-nudge-gate.log` and updates build.md's "Full logs:" line to name only `gate-unit.log` and `gate-full.log`. It is the lead's call whether to also drop `gate-full.log` in favour of build.md's summary line. The reviewer runs no delete.

### F5 NIT: a `null` project.json now counts as unreadable

Evidence: project-config.mjs:48 calls `sanitizeOwnerHosts(raw.owner_hosts)`. When the file is the JSON literal `null`, that throws a TypeError, and the loader falls into the catch. Measured: on 67eb918 such a file gives `source=<file>, vcs=git`; on c12a494 it gives `source=unreadable, vcs=none`. janitor.mjs:1441 would then print "unreadable". Nobody writes a `null` file today, but this changes the behaviour of every reader.
Fix, `skills/decisions/scripts/project-config.mjs:48`, current:
```js
    return { root, config: { ...DEFAULTS, ...raw, owner_hosts: sanitizeOwnerHosts(raw.owner_hosts) }, source: file };
```
replacement:
```js
    return { root, config: { ...DEFAULTS, ...raw, owner_hosts: sanitizeOwnerHosts(raw?.owner_hosts) }, source: file };
```
Predicted outcome: `null` behaves as it did on 67eb918, and `owner_hosts` stays `{}`.

### F6 INFO: deployment needs two steps before the fix goes live and before the live proof can pass

- The timer runs a pinned plugin copy: `ExecStart=... /home/ben/.claude/plugins/cache/benzhuk/delegation/0.20.16/scripts/collect-status.mjs` (`~/.config/systemd/user/collect-status.service`). A release plus a re-install of the unit is needed.
- The collector reads `owner_hosts` from the **working tree** at `--repo /home/ben/Code/claude-delegation`. That tree is currently a detached HEAD at 0c92605 (release 0.20.15), which does not contain 67eb918. Until that checkout moves forward, `loadProjectConfig` returns `{}` and no flag is sent, even with new code.
- A live proof run by hand from an interactive shell does not exercise the timer's ssh context. The user manager environment does have `SSH_AUTH_SOCK` set (count 1), so the timer can probably authenticate, but the proof should run the collector the way the timer does.

A design alternative for the lead: read the table from `origin/main:.agents/project.json` (the collector already reads origin refs), so config changes never depend on the state of the local checkout.

## Verified absent, stated as findings

- The same-host owner (skills-n on Netcup) gets no ssh to itself and no double write.
- Host-name spelling: both entries match `MIRROR_HOSTS` exactly.
- The local ledger line survives every mirror outcome, and the dedupe input is unchanged. There is no lane-30-style spam, except under F2.
- The mirror cannot hang the collector: it has a hard 5 s bound.
- No other `project.json` reader is affected, and there is no exact-key check anywhere.
- The committed files contain no secrets and no credential paths.
- The unit tests assert the argv at the real spawn seam, and both halves of the fix are mutation-proven.
