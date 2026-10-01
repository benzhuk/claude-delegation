VERDICT: NEEDS_FIXES 255f351

# Lane 30 stall-nudge: adversarial review, round 1

Reviewed: `git diff 480b750..255f351` in `wt-sn` (branch build/stall-nudge-1). Spec: docs/specs/stall-nudge-1/spec.md, rulings contracts.md S1-S6 (these win where they narrow the spec), builder report build.md.

Gate: `node --test scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs` gives 60/60 pass at 255f351.

How I checked:
- I ran a harness under `scratchpad/rev-sn-exp/`. It drives the REAL `note-send.mjs` from the tree under review, with a sealed HOME and fixture repos, all inside the scratchpad.
- I ran mutants on `git archive` copies under `scratchpad/mut-*`.
- The worktree itself is untouched (`git status --short` is empty). The only write is this report.

## Findings

### F1 (HIGH, latent): the dedupe reads the wrong ledger when `--repo` is not the main checkout's root, so a stall gets a new ASK every run

- `scripts/collect-status.mjs:276` reads `path.join(repoAbs, "docs", "ledger")`.
- note-send never writes there. It writes into `mainCheckout(--recipient-repo)` (`skills/multi/scripts/note-send.mjs:639`, `transport.mjs:422-450`, ledger target at `note-send.mjs:740`). That resolves `git rev-parse --git-common-dir`, so a linked worktree or a subdirectory `--repo` goes to the main checkout's root. collect-from-origin explicitly supports a subdirectory `--repo` (collect-from-origin.mjs:73-74).

Measured with the real note-send, three runs 0 s apart:
- Worktree `--repo`: 3 ASKs, ids `[collect-exphost-stall-build-wt-1-999db1f-1]`, `-2` and `-3`, all in the main checkout's ledger. The worktree has no `docs/ledger` at all.
- Subdirectory `--repo`: 2 runs gave 2 ASKs.

At 15 minutes that is 4 ASKs an hour per stalled lane, forever. The Netcup unit uses `--repo /home/ben/Code/claude-delegation`, a main checkout's root, so this is not live today. It is still exactly the "a wrong dedupe spams leads every 15 minutes" class. The dedupe test misses it because it writes the ledger line itself, into `root/docs/ledger`, which is the path the collector reads, not the path note-send writes (collect-status.test.mjs:681-684).

Fix: read the same directory note-send writes. Patch:

```
old (collect-status.mjs:39):
import { assertFieldSafe, SLUG_RE, timeParts } from "../skills/multi/scripts/envelope.mjs";
new:
import { assertFieldSafe, SLUG_RE, timeParts } from "../skills/multi/scripts/envelope.mjs";
import { mainCheckout, gitRunner } from "../skills/multi/scripts/transport.mjs";

old (collect-status.mjs:276):
  const dir = path.join(repoAbs, "docs", "ledger");
new:
  const dir = path.join(mainCheckout(repoAbs, gitRunner) ?? repoAbs, "docs", "ledger");
```

I applied this in a scratch copy:
- Worktree scenario: 1 ASK over 3 runs.
- Subdirectory scenario: 1 ASK over 2 runs.
- Gate: still 60/60.

Add a test: a `git worktree add` of the fixture, `--repo <worktree>`, and a fake spawn that appends a `buildEnvelope(...)` line to `ledgerPath(mainCheckout(recipientRepo), ymd)`, which is where note-send really writes. Run twice and expect 1 call. Against 255f351 this test gives 2 calls.

### F2 (MEDIUM): a `closed` record (finished work) is treated as `owned`, so it gets flagged silent and asked

- `computeState` (collect-from-origin.mjs:112-118) knows accepted, withdrawn and rejected. Anything else becomes `owned`, including `closed`, which is terminal (work-record.mjs:11, :1562-1626; lane 23).
- `computeAttention` (collect-status.mjs:117) then flags a closed record whose last Log line is over the threshold, and the nudge asks about it.
- Measured: a `build/closed-1` branch with `Status: closed` and its `Log: ... closed ... merge <sha>` line 2.5 h old got `ASK leadslug stall-build-closed-1-2f38183 | build/closed-1 has had no Log line for 2.5 h in state owned...`.
- How it can happen: a closed record reaches a row whenever an unmerged branch changes it, for example a post-merge commit on the lane branch, or a follow-up branch that edits the closed record.

Fix, in territory and one line. It also stops status.md calling a closed lane "silent":

```
old (collect-status.mjs:117):
    if (r.state === "owned" && typeof r.hoursSinceLog === "number" && r.hoursSinceLog > staleHours) {
new:
    if (r.state === "owned" && r.status !== "closed" && typeof r.hoursSinceLog === "number" && r.hoursSinceLog > staleHours) {
```

In a scratch copy the closed row gets no attention and no ASK, and the gate stays 60/60. Add `closed` to the first acceptance test's "none" set.

Follow-up for the lead, not this lane (collect-from-origin is out of territory): `computeState` should give `closed` its own terminal state.

### F3 (MEDIUM): `--quiet` does not suppress the ASK

- The file header (collect-status.mjs:21-25) and `sendNote` (:187) make `--quiet` the "send nothing" flag. `sendStallNudges` (:315) never checks it. The builder chose this on purpose (build.md "Judgment call").
- The effect: a lead's by-hand preview (`collect-status.mjs --repo X --quiet --out /tmp/x`) sends real ASKs. Because the dedupe is per tip, that preview also uses up the one ASK the timer would have sent. Measured: `--quiet` run gave 1 ASK.
- S4's kill switch is per repo and persistent, so it is no substitute for a one-off quiet run.

Patch:

```
old (collect-status.mjs:315):
  const stallRows = attention.filter((a) => STALL_REASON_RE.test(a.reason));
new:
  if (args.quiet) return [];
  const stallRows = attention.filter((a) => STALL_REASON_RE.test(a.reason));
```

In a scratch copy the `--quiet` run gives 0 ASKs and the gate stays 60/60. Add a test with a 2.1 h row plus `--quiet` that expects 0 calls. If the lead rules to keep the builder's reading instead, the doc addendum should say in plain words that `--quiet` does not silence the ASK.

### F4 (MEDIUM, a check that passes because it isn't looking): the "none for accepted-unmerged / no-record" acceptance claim is never exercised

Mutant M1 replaces collect-status.mjs:315 with `const stallRows = attention;`, so every attention reason gets an ASK. It passes all 34 collect-status tests. Two reasons:
- The fixed `NOW = 2026-09-27T12:00:00Z` (test:553) is EARLIER than the fixture commits' real committer dates. So `accepted-unmerged-over-4-h` never trips, and the accepted-unmerged row never enters `attention`. build.md's claim that it is "well over the default merge-hours" is false.
- The `no-record` row does enter `attention`, but it has no record, so the "no usable Owner" path drops it. The filter is never what excludes it.

Fix (test only):
1. In that test, set `const NOW = Date.now() + 5 * 3_600_000` (logs stay relative to NOW), or pass `--merge-hours 0` with a NOW after the commits.
2. Assert `status.summary.attention` has reasons `accepted-unmerged-over-4-h` and `no-record` before asserting `spawn.calls.length === 1`.

Predicted: M1 then fails (2 calls, one to `leadslug` for build/accepted-unmerged).

### F5 (LOW): the dedupe fixture is a hand-written string, not note-send's formatter; cross-day and counter bump are never pinned

- collect-status.test.mjs:684 writes `sent already [${from}-${topic}-1] ASK: stalled.` into a file named for NOW's own day.
- The real line does match. With the real note-send I got `collect-exphost → leadslug, 9.27.26 23:05 NYC [collect-exphost-stall-build-foo-1-0e1158a-1] ASK: ... Needs: review by 23:35`, and a second run sent nothing.
- Nothing in the test ties it to that format, though. A mutant that reads only today's-UTC-date file was killed only because the UTC date had already moved past 2026-09-27 when I ran it (a timing accident, not a test that looks).

Fix: build the line with `buildEnvelope` from envelope.mjs (exported), with id `${from}-${topic}-2`, in a file named for the previous day (for example `2026-09-26.md`).

### F6 (LOW): two records on the same branch, both silent, get two ASKs in one run

- `ledgerCorpus` is read once (collect-status.mjs:331), and a send never updates it. `collect-from-origin` makes one row per changed record, so two silent records on one tip share one topic.
- Result: that topic gets two sends in the first run (ids `-1` and `-2`), deduped only after that.

Fix, after the send at :363:

```
old:
    outcomes.push({ branch: a.branch, sent: true, argv, result });
new:
    ledgerCorpus += `\n${idPrefix}`;
    outcomes.push({ branch: a.branch, sent: true, argv, result });
```

### F7 (LOW, judgment): "in state <status>" is always "in state owned"

- `a.state` is `owned` by construction for every silent row (collect-status.mjs:355), so that part of the text says nothing.
- The spec's `<status>` placeholder more likely means the record's Status: runnable, delivered, reviewed or blocked. "delivered for 3 h" tells the lead a reviewer is overdue.

Suggest `STATUSES.includes(row.status) ? row.status : a.state`. `STATUSES` is a closed set from work-record.mjs, so no untrusted text reaches `--text`, same as K2.

## Verified absent: named attack surface with no defect

- **Id format and prefix boundary.** note-send's id is `${from}-${topic}-${n}` (note-send.mjs:721-723), and the line carries `[<id>]` (envelope.mjs:166-169). `from` is `collect-${sanitizeHost(...)}` on both sides. `build/foo-1` and `build/foo-10` were measured as two independent ASKs, and each second run was deduped. Because sha7 is fixed width and the prefix ends in `-`, the slug cannot be read as a prefix of another branch's slug. Mutant M2 (dropping the trailing `-`) survives only because it changes nothing. `re <id>` and `supersedes <id>` never follow `[`, so replies cannot false-hit.
- **Across days.** The collector reads every `docs/ledger/*.md`. With the only ledger file renamed to `2020-01-01.md`, the next run still deduped.
- **Truncation.** The slug is capped at 40 and the sha is kept whole (collect-status.mjs:236-240). A collision needs two branches with the same first 40 slug characters at the same tip commit: the same records and owner, so it is harmless.
- **The sha7 is the row's tip.** `row.tipSha` is `commitInfo(branchInfo.ref).sha` (collect-from-origin.mjs:64-69, :137), and the Owner is read from that same commit (collect-status.mjs:261).
- **Filter.** It keeps only `silent-over-` reasons, which exist only for `state === "owned"`, and the threshold is strict `>` on `hoursSinceLog` (the last `Log:` line). accepted-merged, accepted-unmerged, rejected, withdrawn and no-record are excluded by construction. `closed` is not: see F2. `blocked` is included on purpose, since the spec says every non-terminal state. That is compliant; whether to skip `blocked` is the lead's call.
- **Owner.**
  - `none`, missing, uppercase, spaces and injection characters all yield null, the same as note-send's slug grammar, with one stderr line and the attention row unchanged.
  - A malformed record or a missing blob also yields null.
  - A session id (`9c61c35a-...`) does pass the grammar, so the ASK goes to an unregistered slug. note-send records it and warns "not a recognized recipient". That is compliant with S3 and reaches nobody.
- **No shell.** `spawnSync(execPath, argv)`, `execFileSync("git", [...])` and in-process `fs` reads only. A branch name containing `;`, `|`, a backtick, `$(` or `&&` is a legal git ref. note-send refuses that text with exit 1 before writing the ledger, so there is no ASK and no injection, just one stderr line per run.
- **`--by`.** `timeParts(now+30m).time` gives `HH:MM` in America/New_York, and note-send only runs `assertFieldSafe` on it. Midnight wrap: note-flush's `overdueDeadlineMs` (note-flush.mjs:1285-1297) moves a `by` earlier than the note's own time to the next day, so a 23:50 note with `by 00:20` is not overdue on arrival.
- **`!fetchFailed` guard.** Reasonable. On a failed fetch the rows reflect stale refs: a lead's Log line may be pushed but not yet fetched, and asking then would be a false ASK. A fetch that keeps failing does hide stalls, but only while the collector is blind to everything anyway, and status.md already says `fetch: failed`. A persistent-fetch-failure alarm is a separate follow-up, not a defect here.
- **Kill switch (S4).** `defaultOutDir(home, repo)/no-nudge` = `~/.agents/collect/<basename>/no-nudge`, independent of `--out`. `home` is injectable, and the attention row stays. The test is sound (the builder's discrimination mutant killed it).
- **Ledger read error (S2).** A non-ENOENT readdir or readFile error means no ASKs for the whole round, one stderr line. A missing directory counts as "nothing sent". Correct.
- **note-send failure.** A non-zero exit is warned and never fails the run (`main` returns 0, `write(mdPath)` still runs). There is no "asked" state other than the ledger, so a send that failed before its ledger write simply retries next run. A send that failed after its ledger write (exit 2 or 3) is deduped.
- **Order (S5).** The ASK runs after status.json, status.md and the RESULT (collect-status.mjs:531-550).

## Mutation log (scratch copies only)

| Mutant | Change | Result |
|---|---|---|
| M1 | `stallRows = attention` (no filter) | survives 34/34 (F4) |
| M2 | idPrefix without trailing `-` | survives, but equivalent (see above) |
| M3 | read only today's-UTC ledger file | killed, but only by date accident (F5) |
| Fix copy | F1+F2+F3 patches | gate 60/60; worktree 1 ASK / 3 runs; subdir 1 / 2; closed 0; quiet 0 |
