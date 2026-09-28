# Lane twenty-one: collect-status — one status file for lane state, on a timer, one wake per change

Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31 (skills-fable)
Spec-from: 2026-09-27T18:20:00Z
Base: 44118f4fc0175993909851d08b2cdfe8b6ed000d (main, release 0.20.14)
Authority: Ben ticked option (b) on the decisions item "Lead coordination cost: STOP after two RE-PLAN verdicts" at about 14:05 America/New_York on 2026-09-27, captured by the live pickup (round 2, skills-n-decisions-title-6). The tick is his word for the build and for installing the timer on Netcup on acceptance. Merge to main follows the standing grant (accepted record on origin, Opus reviews on record, sealed suite green on a second host).

## Aim

The lead's coordination cost is the top-tier tokens the harness spends without judgment: on 2026-09-26/27 the lead session ran 468 assistant turns and 86.4M claude-fable-5-1 tokens in 24 hours (83.7M of them cache reads), most of it answering one lane event at a time and verifying each with a runner. Bearings 09-26 and 09-27 both said RE-PLAN on this cost, which fired the goal card's STOP. Ben chose (b): a Sonnet-tier process gathers lane state from origin on a schedule and writes ONE file; the lead reads that file per wave and rules on everything in it in one turn. Judgment stays with the lead; the collector judges nothing.

Measure moved: top-tier tokens per build, through the lead's share. Check: `node scripts/build-census.mjs --lead <skills-fable session>.jsonl --from 2026-09-28T12:00:00Z --to 2026-09-29T12:00:00Z --json` must show fewer windowTurns and fewer claude-fable-5-1 tokens than the 2026-09-27T12:00Z window (target at most 200 windowTurns and 40M tokens including cache reads, the prediction already on the page). Worsens none: lanes verify, merge and post their own Closed entries exactly as now, so hours ask to accepted does not move; nothing is deleted or retried, so work lost or stalled does not move.

Not a new mechanism on top of an unfed one: `scripts/collect-from-origin.mjs` already computes per-lane state from origin (rows branch, tipSha, tipDate, recordPath, status, artifactSha, merged, hoursSinceLog, state) and today nobody runs it on a schedule; lane nineteen's `scripts/install-janitor-timer.mjs` already installs a per-host timer and today it can schedule only janitor. This lane feeds the first and lets the second schedule a second job. No new scheduler, no watcher, no daemon.

## Territory (one builder unless the lead splits by file)

- C1 `scripts/collect-status.mjs` (new) and `scripts/collect-status.test.mjs` (new).
- C2 `scripts/install-janitor-timer.mjs` and its test: job parameter. The Windows task-XML encoding defect found today (schtasks rejects the generated XML: "malformed (1,40) unable to switch the encoding") is NOT in this lane; it needs a live Windows proof and goes to a Windows-led lane. This lane changes no bytes of the Windows or macOS generators beyond substituting the job command and name.
- C3 `scripts/required-wiring.default.json` (one added check) and `docs/GOALS.md` status line for the lead-cost measure if the file carries one; `skills/continue/SKILL.md` or the lead's equivalent skill: the paragraph that tells a lead where lane state is read from (see C3).
- Not in this lane: the decisions skill, note-send or note-flush internals, build-census, four-read, the janitor itself, any Codex file, any README changelog (the release adds it).

## C1: collect-status.mjs

Runs `collect-from-origin` in process (import its functions; do not shell out to it) against `--repo <dir>` with the same `--main`, `--no-fetch` and `--skip` semantics, then writes ONE status directory `--out <dir>` (default `~/.agents/collect/<repo basename>/`):

- `status.json`: `{ generatedAt (ISO Z), host, repo, main: { ref, sha }, rows: [collect rows, unchanged shape], summary: { byState: {state: count}, attention: [ {branch, recordPath, state, reason} ] } }`. `attention` lists, mechanically: `accepted-unmerged` rows with tipDate older than `--merge-hours` (default 4) hours; any row with `hoursSinceLog` above `--stale-hours` (default 6) whose state is `owned`; `no-record` rows. No other judgment; no wording beyond `reason` tokens `accepted-unmerged-over-N-h`, `silent-over-N-h`, `no-record`.
- `status.md`: the same, human-readable, at most 60 lines: a header line with generatedAt (also given in America/New_York), main sha, row count; the attention list first; then the table exactly as `formatTable` prints it. This is the file the lead reads.
- `previous.json`: the prior `status.json`, moved aside atomically before the new write (rename, not copy).
- Writes are atomic (temp file plus rename), the directory is created if absent, and a failed fetch still writes a status whose header says `fetch: failed` (collect-from-origin already exits 0 on that; keep that promise).

Change detection and the single wake: the collector computes a change key from the rows: the sorted set of `(branch, recordPath, state, tipSha)`. If the key equals the previous run's key, it writes nothing but `status.json`/`status.md` (fresh timestamps) and exits 0 silently. If the key differs, or `previous.json` is absent, it sends exactly ONE note and records the key it announced in `status.json` as `announced`:

```
note-send --from collect-<host> --to <--to slug> --kind RESULT --no-type --recipient-repo <repo> --topic lane-state --text "<n> lanes on origin: <byState counts as k=v pairs>; attention <m>" --details <repo-relative path of status.md is not available; use --text only and name the absolute status.md path in --goal> --needs none
```

Use the shipped `note-send` shim on PATH (`~/.local/bin/note-send`), never a hand-written ledger line. The substance must satisfy the envelope rules already in `skills/multi/references/envelope.md` (no backtick, semicolon, pipe, double ampersand or dollar-paren; the example above therefore uses commas, not semicolons: the builder rewrites it). RESULT wakes the recipient's inbox where one exists and lands in the ledger otherwise; ACK and FYI are ledger-only and MUST NOT be used here. Flag `--quiet` suppresses the note (for tests and for a first run on a new host). A run that would send a note but finds no note-send on PATH writes the status files anyway and exits 0 with `note: skipped, note-send missing` in status.md.

Never: no writes under the repo, no git writes (collect-from-origin's own never-writes test is the model; add the same assertion for collect-status against a bare-remote fixture), no deletion beyond replacing its own three files, no `--apply` of anything.

Tests (contract, not implementation): status.json shape against the bare-remote fixture that collect-from-origin.test.mjs already builds (reuse its helper, do not fork it); attention rules at each threshold boundary; change key equal means no note (inject the note-send exec; assert zero calls); change key different means exactly one call with kind RESULT and `--no-type`; `--quiet`; missing note-send; atomic write (temp never left behind); `previous.json` rotation; fetch failure still writes; the never-writes assertion.

### Lane thirty addendum (stall-nudge, docs/specs/stall-nudge-1): one ASK per stall

After status.md and the existing RESULT above, the collector sends ONE more note per row still stuck at `silent-over-N-h` (an `owned` row whose `hoursSinceLog` exceeds `--stale-hours`, EXCEPT a `closed` record: `computeState` still buckets `closed` as `owned` since it has no state of its own, but a closed record is terminal — closed never gets an attention row, never gets an ASK): an ASK, addressed to the row's own `Owner:` slug (read off the branch's own tip blob, the same way `status`/`artifact` already are — never `main`'s), never to `--to`. Argv shape (docs/specs/stall-nudge-1/contracts.md S1-S6):

```
note-send --from collect-<host> --to <row's Owner:> --kind ASK --no-type --recipient-repo <repo> --topic stall-<branch-slug>-<tipSha7> --text "<branch> has had no Log line for <H.h> h in state <status>. Reply with the lane state and a new ETA, or BLOCKED. A Log line on the record resets this." --needs review --by <HH:MM of now+30m, America/New_York>
```

The `<status>` word in the text is the record's own `Status:` field when it is one of `work-record.mjs`'s `STATUSES` (for example `blocked`, `delivered`, `owned`), never a guess — a stale row whose record never claims a recognized status falls back to the row's own bucket (`owned`).

No usable Owner (missing, `none`, or failing note-send's slug grammar) sends nothing, one stderr line, and leaves the attention row unchanged. `--quiet` suppresses the ASK too, exactly the same "send nothing this run" promise it already makes for the RESULT — a by-hand preview run (`--quiet --out /tmp/x`) must never spend the one ASK the timer would otherwise have sent for a still-stale tip.

Dedupe: before sending, the collector reads every `docs/ledger/*.md` file in the MAIN CHECKOUT of `--recipient-repo` (resolved the same way `note-send` itself resolves where it writes: `git rev-parse --git-common-dir` from `--recipient-repo`, so a linked worktree or a subdirectory `--repo` both read the ledger at the main checkout's root, never a path under the worktree or subdirectory itself, which is where `note-send` never writes) for the literal id prefix `[collect-<host>-stall-<branch-slug>-<tipSha7>-`; a hit means this exact tip was already asked, so a later stall on the same tip sends nothing, while a NEW tip (a fresh commit, still idle past the threshold) asks again, because its sha7 differs. Two attention rows that share one branch tip (two records changed by the same commit) share one topic too, so the collector treats its own first send within the same run as a hit for the second: only one ASK reaches the lead per tip per run, same as a real second run would give. A ledger read error (not merely "no ledger yet") fails the whole round closed: no ASK, one stderr line. Kill switch: `~/.agents/collect/<repo basename>/no-nudge` (the same directory `status.json` lives in by default, regardless of `--out`) suppresses every ASK for a run; the attention row itself is unaffected and still shows in status.md either way. A note-send failure here is logged and never fails the run, same promise as the RESULT send above. A healthy multi-hour run that never once needed a stall ASK costs nothing beyond the one RESULT above it; a run that does stall costs exactly one ASK, and one `Log:` line on the record is what answers it (resets `hoursSinceLog`, so the next run's attention list no longer names that row). Known limit: the ASK lands wherever this collector's notes already land (the recipient repo's ledger/inbox); whether the owning lead's own hooks surface it on its own host is a follow-up, not this lane.

## C2: install-janitor-timer.mjs gains a job

Add `--job janitor-record|collect-status` (default `janitor-record`, so every existing test and every installed janitor timer is unchanged byte for byte: keep the byte-stability tests green without editing their expectations). `--job collect-status`:

- name defaults to `collect-status` (still overridable by `--name` in tests);
- command from the single `scheduledCommandArgv` seam: `<node> <pluginRoot>/scripts/collect-status.mjs --repo <repo> --to <slug>` plus `--host <name>` when given, plus `--out <dir>` when `--out` is given; `--to <slug>` is required for this job and refused for janitor-record; the `--apply` refusal stays and now also covers the collect job's args;
- schedule: `--every <minutes>` (5 to 60, default 15) instead of `--hour`; `--hour` with the collect job is refused, `--every` with the janitor job is refused. systemd: `OnBootSec=2min` plus `OnUnitActiveSec=<every>min`, `Persistent=false`. launchd: `StartInterval` seconds. Windows: a `TimeTrigger` with `Repetition/Interval PT<every>M` in the same XML shape already generated (text only; no encoding change, see territory).
- `installed.json` records both jobs by name, as the name-owned shape already allows; `--remove --job collect-status` removes only that job's files.

Tests: default job unchanged (existing byte-stability tests untouched and green); collect job systemd unit and timer text exact; `--every` bounds; `--to` required; `--hour`/`--every` cross refusals; `--apply` in `--to` refused; installed.json with both jobs; remove one job leaves the other.

## C3: wiring and the lead's rule

- `required-wiring.default.json`: one `file_fresh` check, id `collect-status-fresh`, file `~/.agents/collect/<repo basename>/status.json` (the check type must support the `~` and basename the janitor check already uses, or the builder adds the check with the literal path the installer writes into `installed.json` and reads it from there, whichever the existing code supports without a new mechanism), `maxAgeSeconds` 2700 (three intervals at 15 min), `requiresFile` the installer's `installed.json` so a host without the collector is info, not red.
- The lead's rule, mechanical: `skills/continue/SKILL.md` (or the skill that today tells a lead how to resume a wave; the builder names the file in the record) gets one paragraph: a lead reads lane state from the collector's status.md, once per wave, and never from peer notes; a lead session on another host reads it with one `ssh <collector host> cat <path>`. The check that makes this more than prose is the `collect-status-fresh` wiring check plus a fixture test that the paragraph names the exact default path the installer writes (the same pattern lane eighteen used for the goal-status sentence fixture). If no such fixture pattern fits, say so in the record and leave the paragraph as a stated goal referencing `docs/GOALS.md`.
- `docs/GOALS.md`: if the lead-cost measure has a status sentence, update it with the 09-27 numbers (468 turns, 86.4M tokens) and this lane as the change that targets it; otherwise add nothing.

## Acceptance

- Record `docs/work/wr-2026-09-27-collect-status.record.md` with Spec-session, Spec-from (Z), Base (one sha), Lead-session, Log lines with model tokens on every review, as lane fourteen's accept requires.
- Opus reviews: C1 and C2 each, plus one seam review across the timer's command seam and the note the collector sends (attack: can a crafted branch name or record field reach the shell or the envelope; can two hosts' collectors double-wake one lead; does a fetch failure ever send a note; does `--job` default drift any existing byte).
- Sealed suite green on the build host and on a second host, from origin.
- Live proof on Netcup, on acceptance, under Ben's tick: install `--job collect-status --every 15 --to skills-fable --repo /home/ben/Code/claude-delegation` from the installed plugin copy once the lane is released, or from the reference checkout at the merged sha if the lead judges the checkout-durability guard allows it; quote `systemctl --user list-timers`, the first status.md, and the ledger line of the first RESULT it sent. Record the four numbers.
- Closed entry on Ben's page by the lane, plain bullet, then `decisions-title.mjs set --page 3e1da11277a18174bccfea187d5c3972 --topic Skills`.
- Spec-to-accepted target: under 3 hours. Lead under 20 turns.
