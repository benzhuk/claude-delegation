VERDICT: APPROVE 1542f8caf23a74b96a7993a6903ae831ce476c31

# Seam review, round 1: collect-status-1 (C1/C2/C3 joints)

Reviewed tree: `/home/ben/Code/wt-cs`, branch `build/collect-status-1`, HEAD
`1542f8caf23a74b96a7993a6903ae831ce476c31` (`git rev-parse HEAD`, run by this reviewer). I read the
merged files, not the territory worktrees. All scratch work (bare-remote fixture, fake homes, base-tree
export via `git archive 31a23e2`) lives under the session scratchpad. Nothing in the reviewed tree was
edited, staged or committed. The only file written here is this report.

Result: 0 blockers, 0 majors, 5 minors, 4 info notes. All five seams asked about hold on every path I
measured. The minors are two twins of an earlier-fixed bug class (C2 r1 m2), one contract-letter gap in
K2, one spec-level cadence/threshold conflict, and one missing cross-territory regression test. None of
them breaks the live proof as specified (`--every 15 --to skills-fable --repo /home/ben/Code/claude-delegation`).
m1, m2 and m3 would reopen C1 or C2, which already have APPROVE. Whether to reopen them or carry the
minors to a follow-up is the orchestrator's call, not mine.

## Gates re-run at this sha (sealed runner, `node scripts/run-tests.mjs <file>`)

| file | tests | pass | fail |
|---|---|---|---|
| scripts/collect-status.test.mjs | 24 | 24 | 0 |
| scripts/install-janitor-timer.test.mjs | 48 | 48 | 0 |
| scripts/wiring-check.test.mjs | 60 | 60 | 0 |
| scripts/continue-skill-lane-state.test.mjs | 3 | 3 | 0 |
| scripts/collect-from-origin.test.mjs | 22 | 22 | 0 |

## Attack-brief answers (each is a verified result)

### S1. C2 to C1 command seam: VERIFIED CLEAN

Setup: a real `--job collect-status --to skills-fable --host Netcup.Box_01 --dry-run --json --force-root`
install into a scratch HOME against a scratch clone named `claude-delegation`. The generated unit's line:

```
ExecStart=<node> /home/ben/Code/wt-cs/scripts/collect-status.mjs --repo <scratch>/claude-delegation --to skills-fable --host Netcup.Box_01
```

- Every flag C2 emits (`--repo`, `--to`, `--host`, and `--out` when given) is one that
  `scripts/collect-status.mjs:47-53` `parseArgs` really parses. C2 emits no flag that C1 lacks, and C2
  never emits `--main`, `--skip`, `--no-fetch` or `--quiet`.
- I ran that exact argv under a systemd-like env (`env -i HOME=<scratch> PATH=<nodeDir>:/usr/bin:/bin`,
  cwd = WorkingDirectory). It exited 0, and status.json and status.md landed at
  `<HOME>/.agents/collect/claude-delegation/`.
- `--apply` smuggling: `collect-status.mjs` has no `--apply` flag and builds collect-from-origin's argv
  itself from a fixed shape (`collect-status.mjs:286-288`). C2 refuses `--apply` inside any of
  repo/host/to/out (`install-janitor-timer.mjs:644`). `--to` is SLUG_RE-validated (`:578`). A `--`-leading
  value for any flag is refused as "needs a value" (`:553-555`).
- Shell reach: on Linux the command is systemd ExecStart text, not a shell. On launchd it goes through
  `/bin/sh -c` with correct single-quote escaping (`:312-316`). On Windows it goes through `cmd /c` with
  plain `"…"` wrapping; that is the J1 pattern, it predates this lane, and see info i4. No origin-supplied
  string ever reaches the installer. Its inputs are operator flags and `os.hostname()`. However, see m2
  and m3: two operator-flag hygiene twins.

### S2. C1 note seam: VERIFIED CLEAN on every measured path

Fixture: a bare origin with a branch named `lane/evil;$(touch${IFS}pwned)|x&&y` carrying a record at
`docs/work/wr-evil`;$(id).record.md` (status accepted), plus a no-record branch. note-send was the real
`skills/multi/scripts/note-send.mjs`, wrapped by a scratch `~/.local/bin/note-send` that logs argv and
appends `--dry-run --json`. The argv dump from the actual call:

```
--from collect-netcup-box-01 --to skills-fable --kind RESULT --no-type --recipient-repo <scratch>/claude-delegation
--topic lane-state --text "2 lanes on origin: accepted-unmerged=1, no-record=1, attention 1"
--goal "status at <HOME>/.agents/collect/claude-delegation/status.md" --needs none
```

- The real note-send accepted the argv: `{"ok":true,"exitCode":0,…,"envelope":"collect-netcup-box-01 → skills-fable, … RESULT: 2 lanes on origin: accepted-unmerged=1, no-record=1, attention 1. Goal: status at …/status.md. Needs: none"}`.
  Every flag C1 passes is in note-send's STRING_FLAGS/BOOL_FLAGS (`note-send.mjs:119-124`). The from
  slug passes SLUG_RE, and the text and goal pass `assertFieldSafe`.
- Neither the branch name nor the record path appears in `--text` or `--goal` (argv dump above). No
  `pwned` file was created anywhere (`find` returned 0 hits).
- Fetch failure, measured as a sequence of runs. Calls are cumulative note-send invocations:

  | run | origin | local key vs announced | fetch | calls | announced == changeKey |
  |---|---|---|---|---|---|
  | 1 first run | up | new | ok | 1 | true |
  | 2 | up | equal | ok | 1 | true |
  | 3 | moved away (unreachable) | differs (refs pre-fetched) | failed | 1 | **false** (announced kept) |
  | 4 | unreachable | differs | failed | 1 | false |
  | 5 | restored | differs | ok | 2 | true |
  | 6 | up | equal | ok | 2 | true |

  A failed fetch sends nothing and does not move `announced`. The next good run sends exactly one note.
  status.md's header carries `| fetch: failed` on runs 3 and 4. The `"git fetch failed"` substring C1
  keys on (`collect-status.mjs:294`) matches collect-from-origin's warn text byte for byte
  (`collect-from-origin.mjs:152`).

### S3. C1/C3 wiring seam: VERIFIED CLEAN (byte-for-byte, end to end)

- The collector's actual default `--out` is `path.join(home, ".agents", "collect", basename(repo))`
  (`collect-status.mjs:61-63`, used at `:282`). The measured output directory was
  `<HOME>/.agents/collect/claude-delegation/`.
- C2's actual `installed.json` was written by a real (non-dry-run, no `--enable`) scratch install:
  `<HOME>/.agents/collect/installed.json` = `{"schema":1,"repo":"…","node":"…","every":15,"scheduler":"systemd-user","name":"collect-status","to":"skills-fable"}\n`.
  That matches K1's pinned key order.
- The `required-wiring.default.json` `collect-status-fresh` row: `file "~/.agents/collect/claude-delegation/status.json"`,
  `requiresFile "~/.agents/collect/installed.json"`, `maxAgeSeconds 2700`.
- `checkWiring({home})` states, measured: installed and run gives `ok`; now + 2701 s gives `stale`; a
  fresh home with no install gives `info`.
- `skills/continue/SKILL.md`'s `~/.agents/collect/claude-delegation/status.md` is the file the collector
  actually wrote in that same directory.

### S4. Two hosts double-waking one lead: RULED, as contracts.md Process expects

- Each host's sender is `collect-<sanitizeHost(host)>` (`collect-status.mjs:190`). The installer bakes
  that host's own `os.hostname()` in at install time (`install-janitor-timer.mjs:607`).
- Each host's change state (`announced` in status.json, plus previous.json) lives under that host's own
  `~/.agents/collect/<basename>/`. Nothing is shared across hosts, so two installs mean two independent
  wakes per origin change, never a racing shared one.
- Nothing stops a second host's install. The only guard is per host: `installed.json` refuses a second
  `--name` on the same host (`:844-855`).
- Edge (info only): two hostnames that sanitize alike (`box_1` and `box-1`, both `collect-box-1`) would
  share a sender slug.

### S5. `--job` default byte drift: VERIFIED NONE

Method: `git archive 31a23e2` into scratch, then the same harness against both trees. That was 8
default-job argv sets × 3 platforms (linux/win32/darwin) × {`--dry-run --json`, a real write with an
injected no-op exec}, with every written file dumped and HOME/ROOT normalised. Result: 774 lines each
side, `diff` empty (IDENTICAL), 21 written files compared. The argv sets were: none, `--hour 7`,
`--remove`, `--hour 7 --host h1 --name janitor-record-test`, `--hour 99`, `--host a--applyb`, bare
`--name`, and `--hour 3 --hour 4`.

`git diff 31a23e2 HEAD -- scripts/install-janitor-timer.test.mjs` has 0 removed lines, so no existing
expectation was edited. collect-from-origin.mjs/.test.mjs and skills/multi show 0 diff lines. The only
default-job text that changed is `--help`/usage text (info i3).

## Findings

### m1 (minor): K2's "fixed allowlist" of state tokens is not enforced at the C1 to collect-from-origin seam

Evidence: `scripts/collect-status.mjs:186` builds `--text` from every key of `byState`, and `byState`
comes straight from `r.state` of collect-from-origin's rows (`:78`). No allowlist exists anywhere:
`grep -i allowlist` over C1's source, tests and reports returns 0 hits. Today the set is closed, because
`computeState` (`collect-from-origin.mjs:111-117`) returns only accepted-merged, accepted-unmerged,
withdrawn, rejected or owned, and `noRecordRow` adds no-record. So no origin string reaches the envelope
today; the S2 fixture measured this. But K2 requires the allowlist in the text builder, and a future
state derived from record content would pass straight into `--text`.

Patch (`scripts/collect-status.mjs`). After line 38 (`import { assertFieldSafe } …`), add:

```js
// K2: the only state tokens that may ever reach a note's --text (collect-from-origin's computeState
// names plus the no-record row); anything else is counted as "other", never named.
const NOTE_STATE_TOKENS = new Set(["owned", "rejected", "withdrawn", "accepted-merged", "accepted-unmerged", "no-record"]);
```

Replace line 186, whose current text is exactly:

```js
  const kv = Object.entries(byState).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(", ");
```

with:

```js
  const safeByState = {};
  for (const [k, v] of Object.entries(byState)) {
    const token = NOTE_STATE_TOKENS.has(k) ? k : "other";
    safeByState[token] = (safeByState[token] ?? 0) + (Number.isInteger(v) ? v : 0);
  }
  const kv = Object.entries(safeByState).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(", ");
```

Add a test: an injected `collectMain` writes one row with `state: "evil;$(id)"`. Assert that the spawned
`--text` contains `other=1` and no `evil`.

Predicted outcome: the 24 existing tests stay green, because they use only real states. The new test
fails without the patch and passes with it.

### m2 (minor): an absolute `--out` inside the repo is accepted (twin of C2 review r1 m2)

Evidence: `--job collect-status --repo <scratch>/claude-delegation --out <scratch>/claude-delegation/lanes --dry-run --json`
ran with `refusals: []`, and ExecStart ends `--out <scratch>/claude-delegation/lanes`. The collector
would then write status.json, status.md and previous.json under the repo tree, which breaks C1's "no
writes under the repo". C2 r1 m2 closed only the relative-path form (`install-janitor-timer.mjs:585-597`).
C1 does not refuse it either (`collect-status.mjs:282`).

Patch (`scripts/install-janitor-timer.mjs`). Insert immediately after line 602
(`  const repo = resolveRepo({ home, repoFlag });`):

```js
  // Twin of C2 review r1 m2: an ABSOLUTE --out inside the repo breaks C1's "no writes under the repo" too.
  if (outFlag !== null) {
    const rel = path.relative(repo, outFlag);
    const outside = rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
    if (!outside) refusals.push(`--out must be outside the repo ${repo} (the collector never writes under the repo), got ${outFlag}`);
  }
```

Predicted outcome: the default job is unaffected, since `outFlag` is null whenever `--out` is absent and
`--out` is already refused for janitor-record. The 48 installer tests stay green. The repro above
becomes exit 1 with the new refusal.

### m3 (minor): a control character in `--host`/`--repo` injects systemd directives (twin of C2 review r1 m2; predates this lane in the janitor job)

Evidence: `--job collect-status … --host "$(printf 'box\nExecStartPre=/bin/touch /tmp/x')" --dry-run --json`
gave `refusals: []`, and the generated unit carries a second line, `ExecStartPre=/bin/touch /tmp/x"`. The
same input against the base tree's janitor job gives the same result, so it predates this lane. C2 r1 m2
added the control-character refusal for `--out` only (`:594-596`). `--host` and `--repo` reach the same
ExecStart through `systemdQuote` (`:172-175`), which quotes a newline but cannot stop it from ending the
line. Only an operator can supply these values (`os.hostname()` cannot contain a newline), so this is
input hygiene, not a privilege boundary.

Patch (`scripts/install-janitor-timer.mjs`). Insert immediately after line 607
(`  const host = hostFlag || os.hostname();`):

```js
  for (const [flag, v] of [["--host", host], ["--repo", repo]]) {
    if (/[\u0000-\u001f\u007f]/.test(v)) refusals.push(`${flag} must not contain control characters, got ${JSON.stringify(v)}`);
  }
```

Predicted outcome: the S5 byte-diff stays IDENTICAL, because no control character appears in any
existing input. Only inputs that today generate a broken or injected unit start being refused.

Orchestrator's call: this touches the default job's refusal set. K3 pins generated bytes, and those are
unchanged for every input that yields a well-formed unit. To keep strictly to C2's collect-only scope,
gate the loop with `if (job === "collect-status")`.

### m4 (minor, spec-level): `--every` 46-60 against the fixed `maxAgeSeconds` 2700 gives a periodic false red

Evidence: K3 allows `--every` 5-60 (`install-janitor-timer.mjs:536-538`), and K1 pins
`maxAgeSeconds: 2700` (`required-wiring.default.json`, `collect-status-fresh`). status.json is rewritten
once per run, so with `--every 60` its age exceeds 2700 s from minute 45 to minute 60 of every interval.
That is 25% of the time red. With `--every 45`, it is red for the collector's own runtime each cycle.
The row's own `why` says "45 minutes at the default 15-minute schedule", so the conflict is known but
unguarded.

This is not a builder defect, since both numbers are pinned. Fix instruction, a lead ruling, either of:
(a) cap `--every` at 45 (K3 amendment; `:537` `n <= 60` becomes `n <= 45`, plus the usage text and the
bounds test), or (b) keep 5-60 and add a sentence to the row's `why`/`fix` and the usage text saying that
cadences over 45 minutes need a private `~/.agents/required-wiring.json` override of `maxAgeSeconds`.
The live proof at `--every 15` is unaffected.

### m5 (minor): no test ties the three territories together; each pins its own literal

Evidence: the installer tests stub `collect-status.mjs` (`install-janitor-timer.test.mjs:62`) and pin
the argv literal (`:719-721`). The collect-status tests pin `parseArgs` separately (`collect-status.test.mjs:114-139`).
C3 pins the wiring row's literals (`continue-skill-lane-state.test.mjs`), not what C1 and C2 resolve.
Today all three agree (S1 and S3, measured). But renaming `--to` in C1's parser, or moving C2's
installed.json, would keep every current test green once each builder updates their own literal.

Fix: add one seam test, for example `scripts/collect-status-seam.test.mjs`, that asserts three things.
(1) `parseArgs(scheduledCommandArgv({node:"/n",pluginRoot:"/p",repo:"/r/claude-delegation",host:"h",job:"collect-status",to:"s",out:"/o"}).slice(2))`
gives `repo "/r/claude-delegation"`, `to "s"`, `host "h"`, `out "/o"`.
(2) `expandHome(row.requiresFile, home)` equals `installedJsonPath` from `main(["--job","collect-status","--to","s","--repo",fixtureRepo,"--dry-run","--json","--force-root"], {home, pluginRoot: fixtureRoot, …})`.
(3) `path.dirname(expandHome(row.file, home))` equals `defaultOutDir(home, "/any/claude-delegation")`.

Mutation prediction: renaming `--to` in `collect-status.mjs:52` fails (1). Changing `agentsDir` at
`install-janitor-timer.mjs:699` fails (2).

## Info (no action required by this lane)

- **i1.** note-send writes the ledger under the watched repo. With `--recipient-repo <repo>`, the real
  note-send plans `append envelope to <repo>/docs/ledger/<day>.md` (measured in its dry-run `ledgers`).
  The spec's own command mandates `--recipient-repo <repo>`, and `docs/ledger/` is already the
  convention in the reference checkout. C1's "never writes" test injects the exec, so it does not cover
  this real path, and should not.
- **i2.** A fetch that fails permanently keeps `collect-status-fresh` green. status.json is still
  rewritten every run (runs 3 and 4 in S2), so a host whose fetch always fails never wakes the lead yet
  shows `ok`. On this host origin is HTTPS with credential helper `!/usr/bin/gh`, reachable under the
  unit's `PATH=<nodeDir>:/usr/bin:/bin`. Netcup could not be checked from here. The live proof should
  quote the first status.md header line and confirm it has no `fetch: failed`, not just that the file
  exists.
- **i3.** `--help`/usage text grew for the default job. That is expected (new flags are documented) and
  no test pins it.
- **i4.** On Windows the `cmd /c` wrapping uses bare `"…"` quoting. A `%VAR%` inside `--repo`/`--out`
  would be expanded by cmd. This is J1's pattern, text-only and not executed on any host here, with
  operator-supplied inputs only. A concurrent manual run and timer run on one host could each see the
  old `announced` and both send (the systemd oneshot never overlaps itself). Also, `spawnSync` has no
  timeout (`collect-status.mjs:145`), so a hung note-send holds the oneshot active. The resulting
  staleness is caught by `collect-status-fresh`.

## Verified absences

- The C2 argv flags are all parsed by C1 (S1).
- No origin string appears in `--text` or `--goal`, and no shell execution came from a crafted branch
  or record name (S2).
- A failed fetch sends no note and leaves `announced` alone (S2).
- The K1 paths agree across C1, C2 and C3 byte for byte, end to end (S3).
- There is no shared or racing wake across hosts (S4).
- There is zero default-job byte drift across 48 generated outputs and 21 written files (S5).
