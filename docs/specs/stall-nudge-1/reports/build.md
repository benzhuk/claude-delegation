VERDICT: PASS
STATUS: DONE d026b5b

## Goal-card line served

"work lost or stalled" (docs/GOALS.md). This closes the gap the spec names directly: the collector
(lane 21) already computes `silent-over-N-h` and writes it to status.md, but nobody is asked. Lane
30 feeds that existing detection with one ASK, addressed to the row's own owner, so a stall costs
the lead one reply instead of nothing at all. Nearest NOT avoided: this is not a new mechanism on
an unfed signal — `computeAttention`'s `silent-over-N-h` reason already existed and was already
written to status.md; this lane only adds a wake on top of a signal that was already computed and
already measured (the attention list).

## Files changed

- `scripts/collect-status.mjs` — added `sendStallNudges` and its helpers (`branchSlug`,
  `buildStallTopic`, `ownerSlugOrNull`, `readOwnerField`, `readLedgerCorpus`, `killSwitchPath`,
  `buildStallNudgeArgv`), wired into `main()` right after `atomicWrite(mdPath, ...)`, gated by
  `!fetchFailed` (same promise as the existing RESULT send: a failed fetch never wakes anyone).
  New imports: `parseRecord` from `./work-record.mjs` (read-only), `SLUG_RE`/`timeParts` from
  `../skills/multi/scripts/envelope.mjs` (read-only, never edited).
- `scripts/collect-status.test.mjs` — 9 new tests (pure helpers + 7 integration scenarios against
  real bare-remote git fixtures, matching the file's existing convention) plus the fetch-failure
  guard test added after the first review pass.
- `docs/specs/collect-status-1/spec.md` — new "Lane thirty addendum" section documenting the ASK's
  argv shape, the Owner lookup, the ledger dedupe (and its fail-closed read-error behavior), the
  kill switch, and the "a healthy run costs one ASK, answered by a Log line" language the brief
  asked for.
- `docs/specs/stall-nudge-1/reports/` — this report, `stall-nudge-state.md`, `stall-nudge-gate.log`.

Not touched: the installer (S1 is explicitly the lead's job by hand), note-send/inbox/flush,
work-record.mjs (imported, not edited), run-tests.mjs, test-home.mjs.

## Design decisions / how each contract ruling landed in code

- **S1** — left the Netcup timer alone; `--stale-hours` default in the script stays 6, as ruled.
- **S2 (dedupe)** — `readLedgerCorpus` reads every `docs/ledger/*.md` under `--recipient-repo`
  (the collector's own working tree, real fs, not a git blob) and checks for the literal id prefix
  `[<from>-<topic>-` where `from = collect-<sanitizeHost(host)>` (same value the RESULT send
  already uses) and `topic = stall-<branch-slug>-<tipSha7>`. No ledger directory yet → `""` (not a
  read error, so it still sends). Any OTHER read error (permission denied, `docs/ledger` existing
  as a plain file) is caught in `sendStallNudges` and fails the WHOLE round closed — no ASK, one
  stderr line — never per-row.
- **S3 (Owner)** — the Owner is read straight off the branch's own tip blob via
  `git show <tipSha>:<recordPath>` + `parseRecord`, mirroring how `collect-from-origin.mjs`
  already reads `Status:`/`Artifact:` for the same row (never `main`'s copy). `ownerSlugOrNull`
  rejects `undefined`/`null`/`"none"`/anything not already-lowercase-and-matching `SLUG_RE` —
  never a guess.
- **S4 (kill switch)** — `<defaultOutDir(home, repoAbs)>/no-nudge`, i.e. always the DEFAULT
  `~/.agents/collect/<repo basename>` directory, independent of whether `--out` overrides where
  this run's status files actually land (contract's literal wording). The attention row itself is
  untouched either way (no new status.md column).
- **S5 (order + argv)** — called after `atomicWrite(mdPath, ...)`, wrapped in its own try/catch so
  a bug here can never cost the already-durable status write. argv:
  `--from collect-<host> --to <owner> --kind ASK --no-type --recipient-repo <repo> --topic
  stall-<branch-slug>-<tipSha7> --text "<branch> has had no Log line for <H.h> h in state
  <status>. Reply with the lane state and a new ETA, or BLOCKED. A Log line on the record resets
  this." --needs review --by <HH:MM of now+30m, America/New_York>`.
- **S6** — no live proof attempted; that is explicitly the lead's, from a main checkout.
- **Extra guard beyond the pinned rulings** — added `!fetchFailed` around the whole
  `sendStallNudges` call, matching the existing RESULT send's own guard ("a failed fetch never
  wakes anyone"): on a failed fetch, `rows` reflects stale local refs, which is never grounds for
  waking a lead either. Covered by a new test.
- **Judgment call (undocumented in the pinned rulings)**: S2 says "if [the topic] is too long,
  truncate the branch-slug part, never the sha" but no exact length is pinned anywhere in
  note-send/envelope beyond the 700-char envelope line. Picked 40 characters for the branch-slug
  half (mirrors `sanitizeHost`'s own 40-char cap already in this file) — flagged in the state file
  for the lead to confirm or override.
- **Judgment call**: `--quiet` does NOT suppress the stall ASK — only the kill switch and a
  missing note-send binary do. The pinned rule names only the kill switch as a suppressor for the
  ASK; `--quiet`'s effect on the RESULT was never explicitly extended to the ASK, so it was left
  alone. Every new test therefore omits `--to` (so the pre-existing RESULT send is skipped for
  "missing --to" reasons) rather than passing `--quiet`, to keep `spawn.calls` reading exclusively
  as ASK calls.

## Tests added (scripts/collect-status.test.mjs)

Pure: `branchSlug`, `buildStallTopic` (including the truncate-slug-never-sha case), `ownerSlugOrNull`.

Integration, all against real bare-remote git fixtures (never the fake in-memory rows the other
integration tests sometimes use, since Owner is read via a real `git show`):

1. One ASK for a 2.1h stale `owned` row; NONE for `accepted-merged`, `accepted-unmerged` (well
   over the default merge-hours), `rejected`, `withdrawn`, `no-record`, or a 1.9h `owned` row —
   all in one fixture, asserting `spawn.calls.length === 1` and the exact argv (topic, `--to`,
   `--no-type`, `--recipient-repo`, `--needs review`, `--by`, `--text` verbatim).
2. Dedupe: first run asks once; a hand-written ledger line carrying the predicted id prefix makes
   a second run on the SAME tip send nothing; pushing an unrelated follow-up commit (new tip,
   record still stale) makes the next run ask again.
3. Kill switch: file present under `defaultOutDir/no-nudge` → zero ASKs, but
   `status.summary.attention` and status.md both still carry `silent-over-2-h`.
4. S3: Owner `none`, Owner field absent, and Owner failing the slug grammar (`"Not A Slug"`) all
   produce zero ASKs, in one fixture with three branches.
5. S2: `docs/ledger` existing as a plain FILE (forces `ENOTDIR` regardless of the runner's own
   privilege level, unlike a chmod-based approach which passes as root) → zero ASKs.
6. Fetch failure: a synthetic `collectMain` that reports a fetch failure with an otherwise-stale
   `owned` row still sends zero ASKs.

## Discrimination proof (dedupe + kill switch)

Per the brief, done in a scratch copy OUTSIDE this territory/repo:
`scratchpad/stall-nudge-discrim/` (two mutated copies of `collect-status.mjs` with, respectively,
the ledger `.includes(idPrefix)` check and the kill-switch `fs.existsSync(...)` check short-
circuited to `false &&`, plus a small standalone harness `discrim.mjs` replaying the same two
fixture scenarios). Result:

```
real collect-status.mjs, dedupe scenario: second-run spawn count = 1 (expect 1)
no-dedupe mutant, dedupe scenario: second-run spawn count = 2 (expect > 1, proving the real assertion is meaningful)
real collect-status.mjs, kill-switch scenario: spawn count = 0 (expect 0)
no-killswitch mutant, kill-switch scenario: spawn count = 1 (expect > 0, proving the real assertion is meaningful)
DISCRIMINATION PROOF: both tests fail when their code path is disabled. OK.
```

i.e. the real test's `assert.equal(spawn.calls.length, 1, ...)` / `assert.equal(spawn.calls.length,
0, ...)` genuinely depend on the dedupe/kill-switch code paths, not on incidental fixture shape.

## Gate

`node --test scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs`
→ **60/60 pass**, 0 fail (log: `docs/specs/stall-nudge-1/reports/stall-nudge-gate.log`). 51 were
pre-existing (unchanged), 9 are new for this lane.

## Deviations from the literal territory/brief text

- The spec's own territory line allows touching `scripts/collect-from-origin.mjs` "only if a
  field must be added". It was NOT touched: the Owner field is read directly off the row's own
  `tipSha`/`recordPath` via `git show` + `parseRecord` inside `collect-status.mjs` itself, so no
  row shape change was needed anywhere. Flagging this as a deviation from the spec's own
  anticipation, in the direction of a smaller diff.
- The two "must discriminate" tests (dedupe, kill switch) were proven in a scratch copy per the
  brief's instruction, rather than by temporarily mutating the real territory file in place; the
  scratch copy and its temp fixture directories live under `os.tmpdir()` (not the scratchpad dir
  named in this brief) because the harness is a one-off verification script, not part of any
  deliverable, and it imports the real `collect-from-origin.mjs`/`work-record.mjs`/`envelope.mjs`
  from this worktree by absolute path (never forked). Those leftover `/tmp/discrim-*` directories
  were left in place rather than removed, per the standing "never run rm, alone or chained" rule;
  they are harmless, ephemeral, and outside any repo.
- No numeric cap on a stall topic's length is pinned anywhere in `note-send`/`envelope.mjs` beyond
  the 700-char whole-envelope-line cap; picked 40 characters for the branch-slug half (mirrors
  `sanitizeHost`'s existing 40-char cap in this same file). Noted in the state file for lead
  confirmation.

## Assumptions

- `--quiet` does not gate the stall ASK (only the kill switch and a missing note-send binary do) —
  see "Judgment call" above.
- The kill-switch file's mere existence suppresses sending, regardless of its contents (an empty
  file is enough, matching how `no-nudge` reads as a boolean flag, not a config value).
