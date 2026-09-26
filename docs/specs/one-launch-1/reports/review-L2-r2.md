VERDICT: NEEDS_FIXES (4) 65f4217d79735fbdb0a4b4b84e7f2a085afd7a8d

# Review L2 r2: skills/team-build/SKILL.md (delta re-review)

JUDGMENT: Opus review per the spec (Sonnet builds, Opus reviews).
Worktree `/home/ben/Code/wt-one-launch-L2`. I ran `git rev-parse HEAD` myself: `65f4217d79735fbdb0a4b4b84e7f2a085afd7a8d`. The tree is clean before and after my checks.
Range `21c313d..HEAD` is one commit (`65f4217`) that touches one file (+61/-35). Measured line count: 366 -> 392.

Tests I ran:
- `node --test scripts/work-record.test.mjs scripts/native-package.test.mjs scripts/mirror-shared-skills.test.mjs skills/team-build/references/build-loop-workflow.test.mjs`: 172/172 pass.
- Full `node scripts/run-tests.mjs`: 1559 pass, 2 fail. The failures are V4 in `skills/multi/scripts/mirror-shim.test.mjs` and H6 in `skills/multi/scripts/note-send.test.mjs`. Both fail the same way at base `fbd7cf6` (I checked in `/home/ben/Code/wt-ws-mainbase`), so they are pre-existing and environmental (a Windows path on Linux). They are not caused by this diff.

Counts: 0 BLOCKER, 1 MAJOR, 3 MINOR.

## Prior findings (r1): all 10 verified fixed
- F1: every R2 arg is named once (L324-328), with `scriptPath` and the example-file pointer. The trigger scoping matches R2/R4/R5: `integrationWorktree` turns on the seam, `integrationWorktree` plus `recordPath` turn on accept-prep, and `leadSession` turns on the census.
- F2: accept is gated on `blockers` empty AND check-acceptance `PASS`, and `accept` carries its real flags. I checked those flags against `scripts/work-record.mjs:1043-1045`. All three R5 acceptance shapes are handled. The census part of this text is superseded by N1 below.
- F3: the paragraph naming the runner as the sanctioned second writer (L357-361) matches R5.3 exactly.
- F4: option (a) is appended to Setup step 2 (L43-45). The record is now ONE per build (L322-323).
- F5 through F10: applied as specified. The `skills/team-build/references/build-loop-workflow.js` path is on one line (L313). The Codex line is pinned and says "unsupported" outright (L377-381). The Ship census parenthetical is gone (L275-280).
- No regressions outside the loop section. Roles, tiers, `JUDGMENT:`, bug-fix fields and Ship's accept semantics (L209-273) are unchanged. README.md is untouched.

## MAJOR

### N1 MAJOR: the Accept turn passes accept-prep's census, and `accept` will always refuse it as `census-stale`. The census rule contradicts itself.
Evidence:
- `scripts/work-record.mjs:774-791`: `accept --census` fails `census-stale` when the census's `leadLastMessageAt` is before the record's last `Log: ... reviewed` entry.
- `scripts/build-census.mjs:215-217, 763`: `leadLastMessageAt` is the last timestamp in the lead's own `.jsonl`.
- R5 orders accept-prep as: step 1 census, then step 3 write `Log: <iso> reviewed ...`. The lead's `.jsonl` is not written while the Workflow runs. I measured this on the live lead file for this very run: its last entry is `2026-09-25T23:03:30Z`, and it was still unchanged at 23:08Z while this workflow was running.
- So `acceptance.censusPath` always ends before the lead's launch turn, and the runner's `reviewed` line is always later. `accept --census <acceptance.censusPath>` (SKILL.md:349-351) fails closed on every loop build.
- L366-369 states the problem itself: "run a fresh census after the last review lands ... (in the loop, accept-prep already ran it: that is `acceptance.censusPath`)". Accept-prep's census runs *before* the last review line lands. (I suggested that parenthetical in r1 F5; it was wrong.)
- Brief item 1 and R5 both say "--census <censusPath>". This is a spec/contract flaw that the skill reproduces faithfully. The lead needs to rule on it (see the note to the lead below). The skill-side fix is still needed so a lead is not sent into a refusal.

Fix. SKILL.md L349-351, old:
```
`PASS`: run `work-record.mjs accept --record <recordPath> --repo <integrationWorktree>
--delivery-ref <integrationBranch> --census <acceptance.censusPath>` (or `--no-census
"<acceptance.censusNote>"` when `censusPath` is `null`) and send ONE RESULT. Otherwise
```
new:
```
`PASS`: re-run the census now (Ship's `build-census.mjs` command, `--out
<integrationWorktree>/docs/work/evidence/<work-id>-census.md`) — accept-prep's
`acceptance.censusPath` predates its own `Log: ... reviewed` line, so `accept` refuses it
as `census-stale` — then run `work-record.mjs accept --record <recordPath> --repo
<integrationWorktree> --delivery-ref <integrationBranch> --census <that file>`
(`--no-census "<reason>"` only when the census itself breaks) and send ONE RESULT. Otherwise
```
L368, old: `at accept (in the loop, accept-prep already ran it: that is \`acceptance.censusPath\`);`
new: `at accept (in the loop too: accept-prep's \`acceptance.censusPath\` ran before its own \`Log: reviewed\` line, so it is not that census);`

Expected result: during the accept turn the lead's `.jsonl` gains the completion notification and the accept turn's own entries, all timestamped after the runner's `Log: reviewed`. So `leadLastMessageAt > reviewedAt`, census-stale passes, and the file lands in the integration worktree where `accept` copies it. The change is about +2 lines.

## MINOR

### N2 MINOR: the launch turn does not say the record lives in the integration worktree, or that the worktree must exist before launch
SKILL.md:319-323. `recordPath` is repo-relative. Accept-prep writes it, and `check-acceptance`/`accept` read it, under `--repo <integrationWorktree>` (R5.3-4, and `scripts/work-record.mjs:1029` resolves `path.resolve(repoRoot, recordPath)`). A lead that opens the record in its own checkout, when that checkout is not the integration worktree, gets a runner that cannot find it. R3 also creates only territory worktrees, so the integration worktree/branch is the lead's job before launch. `worktreeRoot` defaults to that worktree's parent.
Old: `Open ONE work record for the whole build
(\`recordPath\`; Setup step 7's fields, not one per territory).`
New: `Cut the integration worktree/branch from \`baseSha\` and open ONE work record for the
whole build inside it (\`recordPath\`, repo-relative to \`integrationWorktree\`; Setup step
7's fields, not one per territory).`

### N3 MINOR: `setup-failed` is listed as a territory-row blocker, but R3 returns no rows
SKILL.md:340-343. R3 says: "return immediately with `blockers: [{ id, reason: 'setup-failed' }]`, nothing built". No territory rows exist, and L1's `earlyReturn` gives `territories: []`. I also introduced this in my r1 F6 text.
Old: `` `review-sha-mismatch`, `review-not-approved`, `rounds-exhausted` or `setup-failed`;
launch errors come back as id `*` `missing-args`/`mixed-territory-modes`, seam failures
as id `seam`); ``
New: `` `review-sha-mismatch`, `review-not-approved` or `rounds-exhausted`; launch errors
come back only in `blockers`, as id `*` `missing-args`/`mixed-territory-modes` or as
`setup-failed`, with no rows; seam failures as id `seam`); ``

### N4 MINOR: "exactly one of these decides" fails when several apply at once
SKILL.md:351-355. The return can carry two `blockers` entries (two territories `rounds-exhausted`). It can also carry a `*`/`setup-failed` blocker together with `acceptance: null`, because the early return nulls every stage field. "Exactly one" then gives the lead no rule, and it can read `acceptance: null` as "no integrationWorktree was given" when a launch error actually caused it.
Old: `exactly one of these decides the one next step: a \`blockers\` entry (a territory id,`
New: `the first of these that applies decides the one next step: a \`blockers\` entry (a territory id,`
Also change `\`acceptance: null\` means this call ran without` to `\`acceptance: null\` with no blockers means this call ran without`.

## Verified absences (first-class)
- Arg names, stage order (build/review/fix -> Integrate -> Seam -> Accept), return fields and seam blocker vocabulary match contracts.md R2-R7. The only mismatch is N3.
- No rule outside the loop was cut. The only-writer rule (Setup step 7, Ship L230) is now reconciled by L357-361.
- Codex (R10): the text says unsupported, gives the manual sequence in the same order with the same census definitions, pins the record line, and allows no emulation.
- The startFrom paragraph matches R6.

## Notes to the lead (not counted as findings)
- Contract R5 step 1: under the census-stale rule no accept-prep census can pass. The lead's `.jsonl` is quiet for the whole run, so moving step 1 after step 3 would not help. Either drop step 1 from R5/L1, or keep it only as an informational preview. Separately, L1's accept-prep prompt (`build-loop-workflow.js:298`) runs `--out docs/work/evidence/...` "from the delegation plugin root". That writes the census into the plugin checkout, not the integration worktree. This belongs to L1 and the seam review.
- The line count is 392, over the brief's "fewer than 371" expected shape. This round's +26 lines are contract detail that r1 required. My r1 estimate of about +6 was too low. The lead can accept this or ask for trims elsewhere. N1 adds about 2 lines, and N2-N4 add about 0.

Cause: r1's fix text treated accept-prep's census as the accept census. It missed that `leadLastMessageAt` comes from a lead file that stays quiet during the run, so that census always ends before the runner's `reviewed` line.
Discriminating check: take the live lead `.jsonl` during any Workflow run. Its last timestamp stays at the launch turn (measured: 23:03:30Z, still unchanged at 23:08Z mid-run). Any `Log: <now> reviewed` the runner writes is later. `work-record.mjs:786-791` then throws `census-stale`.
Fix location: skills/team-build/SKILL.md L349-351 and L368 (N1), L322-323 (N2), L340-343 (N3), L352-354 (N4).
Simplification: N1 turns the accept turn into one rule with no loop special case ("re-run the census at accept, always"), the same as Ship L252.
