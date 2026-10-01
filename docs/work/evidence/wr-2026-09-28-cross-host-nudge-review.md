VERDICT: APPROVE 4cb22f1

# Lane 43, cross-host nudge: delta review r2

This reviews the fix commit 4cb22f1 against r1's findings on c12a494. The worktree was already at `origin/build/cross-host-nudge-1` (9227c00, which contains 4cb22f1), so no pull was needed and none was run. The worktree was not edited. All mutation runs used fresh `git archive 4cb22f1` copies under `scratchpad/lane-43/rv-8hZ8`.

The approval covers the code at 4cb22f1. It does not cover the proof harness: as written, the harness cannot send for real (H1 below). The live proof needs that fixed first.

One command was denied, reported verbatim. `env | grep -c '^SSH_CONNECTION='` (chained after two `ls` commands) was blocked by the hook with:

> PreToolUse:Bash hook error: [/home/ben/.claude/hooks/secret-guard.sh pretooluse]: SECRET-GUARD: blocked — command dumps the process environment. Use ~/.claude/scripts/secret-tool.sh (check|fingerprint|sync|set|grep-safe|scrub) — it never prints values. To read a non-secret part of that file, copy the needed non-secret lines via secret-tool grep-safe.

I dropped that step and re-ran the two `ls` commands on their own. Whether the caller's shell has an `SSH_CONNECTION` set does not change the result, because an explicit `--sender-host` is resolved first (note-send.mjs:153).

## C4 fields

Cause: the r1 defects are all closed. What remains:
- The proof harness has no live mode. It refuses with exit 1 whenever `--dry-run` is absent (proof.mjs:124-131). The planned real run therefore sends nothing.
- build.md still points at the gate log the lead deleted.
Discriminating check:
- Mutation. Each r1 fix, reverted on its own in an archive copy, fails exactly its own new test, and the unmodified copy passes 81 of 81 (details below).
- Harness. `node proof.mjs --dry-run` with the real HOME made exactly 1 note-send call carrying `--sender-host zhuk-vps32`. A before/after metadata diff of `~/.agents/notes` and `~/.agents/collect` shows no change. The harness source shows the live path is refused.
Fix location: `scratchpad/lane-43/proof.mjs:58, :124-131, :140, :152, :180-183` (H1), `docs/specs/cross-host-nudge-1/reports/build.md:109-110` (N1), `scripts/collect-status.mjs:351-352` (N2), `scripts/collect-status.mjs:360` (N3).
Simplification: the harness needs one mode switch and a one-send guard inside the wrapper it already has. No collect-status flag is needed, and none should be added.

## r1 findings: fix verification

| r1 | Status | Evidence |
|---|---|---|
| F1 census file | **Fixed** | docs/census.md:469-473 is r1's text verbatim. It names the owner-host `~/.agents/notes/<day>.md` and drops the `2026-09-2*` glob. The record's Next line now says the live proof reads Hetzner's `~/.agents/notes`. |
| F2 unknown host | **Fixed** | collect-status.mjs:42-48 and :433-437 match the r1 patch. Mutating back to `typeof mappedHost === "string"` fails 1 test ("...not a MIRROR_HOSTS name falls back..."), 80 pass. There is also a guard test that every repo `owner_hosts` value is a `MIRROR_HOSTS` name. |
| F3 silent mirror failure | **Fixed** | `mirrorOutcome` (:346-349) and the warning at :446-451 run only when `senderHost` is set. Mutating the check to `if (false)` fails the F3 test, 80 pass. |
| F4 duplicate log | **Fixed** (lead, fbf2dba) | `cross-host-nudge-gate.log` is gone and no new log was committed in round 1. The reference to it is left dangling; see N1. |
| F5 `null` project.json | **Fixed** | project-config.mjs:51 now reads `raw?.owner_hosts`. Mutating it back fails the new F5 test, 80 pass. |
| F6 origin/main read | **Fixed as ruled** | `loadOwnerHosts` (:358-366). Mutating it to always use the working tree fails the "prefers origin/main" test, 80 pass. |

Unmodified copy: `node --test scripts/collect-status.test.mjs scripts/project-config.test.mjs skills/multi/scripts/hooks.test.mjs` gives 81 tests, 81 pass, 0 fail. The builder's full-suite figure (2601 of 2606, 0 fail) was not re-run here.

## F6 regression hunt (origin read)

- **Fetch timing: verified fine.** On the timer path, `collectMain` runs `git fetch origin` (collect-from-origin.mjs:156, default refspec, so `refs/remotes/origin/main` is updated) before the nudge block. The nudge block runs only when `!fetchFailed` (:645). The config is therefore read from the ref that was just fetched. On `--no-fetch`, the local remote-tracking ref is used as it stands.
- **Missing ref or missing file: verified fallback.** `gitRunner` is `execFileSync` and throws on a non-zero exit (transport.mjs:412-416). The throw is caught at :363, which returns the working-tree table. The fake-runner test covers this, and so does my dry run: the proof fixture's `origin/main` resolved through the real `gitRunner`.
- **Malformed file.** Unparseable JSON falls back to the working tree. JSON that parses but has a bad `owner_hosts` shape gives `{}` with no fallback. A `origin/main` that parses but has no `owner_hosts` key also gives `{}`: origin wins. This matches the ruling ("origin/main, working tree as fallback" when unavailable) and is benign. One consequence: before the merge, `origin/main` has no table, so new code would send no flag. That does not affect the proof, because the harness fixture's own `origin/main` carries the table.
- **Hostile origin/main: nothing injectable.**
  - Host values must pass `MIRROR_HOST_NAMES` (F2). The worst a hostile table can do is route an owner's ASK to one of the four known tailnet hosts, or suppress the flag. Someone who can push to `origin/main` already controls the code the plugin ships, so this adds no new capability.
  - Keys are looked up with `Object.hasOwn` only for owners that pass `SLUG_RE` (`/^[a-z0-9-]+$/`), so `__proto__` and similar names can never be looked up. `sanitizeOwnerHosts` copies with object spread (own data properties), so there is no prototype pollution.
  - The argv goes to `spawnSync` with no shell.
  - The `git show <rev>:<path>` of a blob applies no textconv or smudge filter. A symlink or tree at that path fails `JSON.parse` and falls back. An oversized blob exceeds `execFileSync`'s 1 MiB buffer, throws, and falls back.
  - The only remote-derived text that reaches a log is note-send's own `mirrorLedger.error`, already capped at 120 characters (note-send.mjs:249-251), and it is written only to `last-run.log`.
- **New imports: verified.** collect-status now imports `note-send.mjs`, which in turn imports `note-flush`, `inbox-claude` and `inbox-codex`. Every one of their `main()` calls is behind `isMainModule`. The installed plugin layout (`.../delegation/0.20.16/skills/multi/scripts/note-send.mjs`, `note-flush.mjs`, `skills/decisions/scripts/project-config.mjs`) has every imported path, so a release will resolve. The root re-export key test is unchanged and passes; `sanitizeOwnerHosts` is exported only from the canonical module.

## Proof harness (`scratchpad/lane-43/proof.mjs`)

Dry-run result. I ran it from a scratch cwd with the real HOME. A first attempt with `HOME=<scratch>` was refused by `git-identity-guard` (the allowlist lives in the real HOME), and I did not work around it. The real-HOME run exited 0 with:
- **note-send calls: 1.** The argv is `--from collect-proof-host --to skills-h --kind ASK --no-type --recipient-repo <SP>/proof-dwMAKZ/clone --topic stall-build-proof-cross-host-1-1022abd --text "build/proof-cross-host-1 has had no Log line for 5.0 h in state owned. ..." --needs review --by 16:58 --sender-host zhuk-vps32 --dry-run --json`.
- The id is `collect-proof-host-stall-build-proof-cross-host-1-1022abd-1`.
- note-send's own plan is: append to `<SP>/proof-dwMAKZ/clone/docs/ledger/2026-09-28.md`, append to `/home/ben/.agents/notes/2026-09-28.md`, mirror to zhuk-vps32 via `ssh ... ben@100.111.119.54 ~/.local/bin/note-send --append-ledger 2026-09-28`, drain the outbox, then queue the wake-up and exit 3.
- A before/after `find -printf '%p %T@ %s'` of `~/.agents/notes` and `~/.agents/collect` (95 entries) shows **no change**. The dry run wrote only under the scratch fixture.
- One side effect: note-send's dry run reads the real routing state under `~/.agents/notes` programmatically (inboxes and outbox). No contents were printed.

Answers to your three questions:

1. **Exactly one note? Yes, per invocation, once a live mode exists.**
   - The fixture holds one stale record, and there is no `--to`, so `sendNote` sends no RESULT. The dry run confirms a single spawn.
   - Each harness run builds a new fixture with a new commit sha, so the topic and id are new each time. Re-running the harness sends one more real ASK each time; the dedupe will not stop it.
   - The real note-send also drains Netcup's existing outbox first (3 s budget). That can deliver notes that were already queued, but it creates no new ones. The timer does the same.
2. **Anything left outside scratch? In dry-run, no (measured). A live run would leave four things**, the same set any timer-sent stall ASK leaves:
   - one line in Netcup `~/.agents/notes/2026-09-28.md`;
   - one outbox entry on Netcup for skills-h. skills-h has no inbox there, so it stays deferred for note-flush;
   - one line in Hetzner `~/.agents/notes/<day>.md`, which is the intended one;
   - the fixture directories under `scratchpad/lane-43/proof-*`. There are now three: `proof-87xhBs` (yours), plus `proof-VLXceM` (my failed scratch-HOME attempt, a partial fixture) and `proof-dwMAKZ` (my run). All three are in scratch, and I deleted nothing.
3. **Same code path as the timer? Partly.**
   - **Same:**
     - `collect-status.mjs` `main()` from this worktree, identical to 4cb22f1 in the code files;
     - `spawnSync` with identical options;
     - `resolveNoteSend`, which resolves `~/.local/bin/note-send` and then the installed `~/.agents/skills/multi/scripts/note-send.mjs`, and that file supports `--sender-host`;
     - the F6 read of `origin/main` through the real `gitRunner`;
     - the F2 guard;
     - the argv is identical apart from the appended flags.
   - **Different:**
     - The timer runs the **plugin cache 0.20.16** copy, which has none of this lane, until a release and a re-install of the unit.
     - `--no-fetch`, `--stale-hours 0.1` and a scratch `--repo`, so the Netcup repo-ledger copy lands in the fixture, not in `/home/ben/Code/claude-delegation/docs/ledger`.
     - The ssh identity context. The harness uses your shell's agent; the timer uses the systemd user manager's `SSH_AUTH_SOCK`, which is present (count 1) but unverified. A passing proof does not prove the timer's ssh will authenticate.
     - The harness appends `--json`.
   - The origin-over-working-tree preference is not tested by this fixture, because both copies carry the same table. The unit test with the fake git runner covers it.

### H1 BLOCKING FOR THE LIVE PROOF, NOT FOR THE ARTIFACT: the harness cannot send for real

Evidence: proof.mjs:124-131 refuses and returns exit 1 whenever `--dry-run` is absent, and :140 always appends `--dry-run`. Running it "for real" as it stands prints the refusal and sends nothing. Any edit that makes it live is unreviewed code, so here is the exact change.

Also, :152 prints "nothing was sent, nothing was ssh'd" unconditionally, and :180-183 print only `plan`, not the mirror outcome.

Patch, `proof.mjs:58`. Current:
```js
const DRY_RUN = process.argv.includes("--dry-run");
```
replacement:
```js
const DRY_RUN = process.argv.includes("--dry-run");
const LIVE = process.argv.includes("--live");
```

`proof.mjs:124`. Current:
```js
  if (!DRY_RUN) {
```
replacement:
```js
  if (DRY_RUN === LIVE) {
```
(This refuses both no flag and both flags. The refusal text can stay as it is, or say "pass exactly one of --dry-run or --live".)

`proof.mjs:140-141`. Current:
```js
    const finalArgs = [...args, "--dry-run", "--json"];
    const result = spawnSync(execPath, finalArgs, { encoding: "utf8" });
```
replacement:
```js
    if (calls.length >= 1) {
      const refused = { status: 99, stdout: "", stderr: "proof.mjs: refused a second note-send in one run" };
      calls.push({ execPath, args, result: refused });
      return refused;
    }
    const finalArgs = DRY_RUN ? [...args, "--dry-run", "--json"] : [...args, "--json"];
    const result = spawnSync(execPath, finalArgs, { encoding: "utf8" });
```

`proof.mjs:152`. Current:
```js
  console.log(`\n--dry-run — nothing was written outside ${work}, nothing was sent, nothing was ssh'd.`);
```
replacement:
```js
  console.log(DRY_RUN
    ? `\n--dry-run — nothing was written outside ${work}, nothing was sent, nothing was ssh'd.`
    : `\n--live — ONE real ASK sent; also written: ~/.agents/notes/<day>.md and an outbox entry on this host, and the mirrored line on the owner's host.`);
```

`proof.mjs:181` (after `console.log(\`Note id: ${parsed.id}\`);`), add:
```js
      console.log(`note-send exitCode: ${parsed.exitCode ?? call.result.status}; mirrorLedger: ${JSON.stringify(parsed.mirrorLedger ?? null)}`);
```

Predicted outcome:
- `node proof.mjs --live` makes one spawn and exits 3, with `mirrorLedger: {"host":"zhuk-vps32","ok":true}` when ssh works. A second spawn is impossible.
- `ssh` to Hetzner followed by `grep -c 'collect-proof-host-stall-build-proof-cross-host-1-' ~/.agents/notes/2026-09-28.md` returns 1.
- If `ok:false`, collect-status's own F3 warning also prints to stderr.

Before running it, re-run `--dry-run` once with the patched file. The dry-run output must be unchanged apart from the added exitCode/mirrorLedger line.

Operator note, not a code fix: the ASK text is the fixed stall template. It asks skills-h to "Reply with the lane state and a new ETA" by a time 30 minutes out, about a branch that exists only in the scratch fixture, from the slug `collect-proof-host`, which has no inbox anywhere. skills-h may spend a turn on it, and a reply to that slug will not land. Whether to tell skills-h in advance is the lead's call.

## Remaining findings on the artifact (NIT, non-blocking)

### N1 NIT: build.md names the deleted log

`docs/specs/cross-host-nudge-1/reports/build.md:109-110`. Current:
```
Full logs: `docs/specs/cross-host-nudge-1/reports/cross-host-nudge-gate.log`
(unit run and full-suite run concatenated; also kept separately as `gate-unit.log` and `gate-full.log`).
```
replacement:
```
Full logs: `docs/specs/cross-host-nudge-1/reports/gate-unit.log` and `gate-full.log`.
```

### N2 NIT: the F6 comment misstates what is pinned

The comment at `scripts/collect-status.mjs:351-352` says the timer's `--repo` is "a pinned plugin checkout". In fact the **script** is the pinned plugin copy (`.../delegation/0.20.16/scripts/collect-status.mjs`), and `--repo` is `/home/ben/Code/claude-delegation`, the main checkout, currently detached at 0c92605. Current:
```js
// F6 (review r1): the timer's `--repo` is a pinned plugin checkout that can sit at an old commit
// indefinitely (a detached HEAD parked at a release tag) while the live repo's `.agents/project.json`
```
replacement:
```js
// F6 (review r1): the timer's `--repo` main checkout can sit at an old commit indefinitely (a
// detached HEAD parked at a release tag) while the live repo's `.agents/project.json`
```

### N3 NIT: `origin/main` is hardcoded where the collector already has `args.main`

`scripts/collect-status.mjs:360` reads `origin/main:` even when the run is given `--main <ref>` (default `origin/main`, :59). The records and the config then come from different refs. The timer uses the default, so this has no effect today. For consistency, pass `args.main` into `loadOwnerHosts` and use `` `${mainRef}:.agents/project.json` ``. The fake runner in the tests matches the literal `origin/main:` string, so it needs `args[1].endsWith(":.agents/project.json")` instead. Optional.

## Verified absent

- No F6 path throws.
- A hostile `origin/main` cannot inject into argv, into object prototypes, or into a shell.
- There is no stale-ref window on the timer path.
- F2, F3, F5 and F6 are each pinned by a test that fails when the fix is reverted.
- The harness dry run wrote nothing outside scratch and makes exactly one note-send call.
