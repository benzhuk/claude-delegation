VERDICT: NEEDS_FIXES (10) 21c313dc0917af441751315458a034f70df9d257

# Review L2 r1: skills/team-build/SKILL.md

JUDGMENT: Opus review per the spec (Sonnet builds, Opus reviews).
Worktree `/home/ben/Code/wt-one-launch-L2`, `git rev-parse HEAD` = `21c313dc0917af441751315458a034f70df9d257` (read by me). Tree clean. The diff is `fbd7cf6..HEAD`, one file, two hunks, both inside the last section.
Measured: 371 -> 366 lines (-5), the same as the builder's report.
Tests I ran: `node --test scripts/work-record.test.mjs scripts/native-package.test.mjs scripts/mirror-shared-skills.test.mjs skills/team-build/references/build-loop-workflow.test.mjs` passed 172/172. That includes the pinned census-paragraph test at work-record.test.mjs:1808.

Counts: 0 BLOCKER, 4 MAJOR, 6 MINOR.

## Verified absences (first-class)
- Rules that apply outside the loop are unchanged: roles, tiers, the `JUDGMENT:` line (L94-96), bug-fix fields (L126-133) and accept semantics (Ship L243-271). The diff touches only L305+.
- README.md was not edited. No file outside the territory was touched.
- The Codex paragraph says there is no Workflow tool, uses the same stages in the same order, the same census definitions, and allows no emulation. The substance matches R10 (see F10 for one wording fix).
- The startFrom paragraph (L346-350) matches R6: APPROVE goes to Integrate with no build or review, NEEDS_FIXES starts with a fix-round builder, and startFrom applies only to "given" territories.
- The three-wakes and one-notification sentences are each one sentence and are correct.
- The R8 lead-session sourcing (hook line -> `~/.claude/projects/<cwd-slug>/<uuid>.jsonl`) is correct.

## MAJOR

### F1 MAJOR: the launch turn no longer says what args to pass (R2). "Base sha" is missing entirely.
Evidence: SKILL.md:317-327. The old text named the `scriptPath`, the arg names and the example file. The new text says only "`args` per the build's pinned contract". For a future build, "the build's pinned contract" means that build's own contracts.md, which does not define the Workflow args. As a result, a lead reading the skill cannot build the call:
- These are never named: `specPath`, `baseSha` (brief item 1 lists "base sha" explicitly), `territories[].id`/`gate`, `maxRounds`, `worktreeRoot`, `censusMarker` and `seam`.
- Also missing: `reviewerBriefPath`/`integratorBriefPath` are required when every territory is "given", and `{scriptPath: ...}`.
- There is no pointer to `build-loop-args.example.json`.
Two statements are also wrong against R2/R4/R5:
- "pass integrationWorktree/... leadSession and recordPath whenever this call should also integrate". Integrate runs without `integrationWorktree`; that is the 0.20.9 path.
- The text lumps all five args together. What actually gates accept-prep is `integrationWorktree` + `recordPath`. `leadSession` is optional, and without it `censusPath` comes back null.

Fix: replace L321-325 ("Then make ONE Workflow call ... seam-review and accept-prep.") with:
```
Then make ONE Workflow call, `{scriptPath: "skills/team-build/references/build-loop-workflow.js"}`,
with `args` `{ specPath, baseSha, startedAt, maxRounds?, territories: [{ id, gate?, briefPath?,
worktree?, branch?, startFrom? }], reviewerBriefPath?, integratorBriefPath?, integrationWorktree?,
integrationBranch?, integrationGate?, worktreeRoot?, leadSession?, recordPath?, censusMarker?,
seam? }` (worked examples: `references/build-loop-args.example.json`). A territory with
`briefPath`/`worktree`/`branch` all given is "given", with all three absent the launch's setup
stage cuts it from `baseSha` and writes its briefs; never mix the two in one call
(`mixed-territory-modes`), and an all-given call also passes `reviewerBriefPath` and
`integratorBriefPath`. `integrationWorktree` turns on the seam review (default: two or more
territories; `seam: false` suppresses it); `integrationWorktree` plus `recordPath` turn on
accept-prep; `leadSession` gives it the census (without it, `censusPath` comes back `null`).
```
Expected result: about +4 lines net, still under 371. Every arg name in R2 appears once.

### F2 MAJOR: the accept rule can accept a partial build, and it points to an acceptance "blocker" the contract does not define
Evidence: SKILL.md:334-337: "When `acceptance.checkAcceptance.verdict` is `PASS`, run ... accept".
- Under R5, accept-prep runs whenever the integrator PASSed and the seam is APPROVE/SKIPPED. The integrator runs only over approved territories: build-loop-workflow.js:320-321 (`approved`/`excluded`) and :152 ("excluded" text).
- So if one territory ends `rounds-exhausted`, the rest integrate, the seam approves and check-acceptance PASSes. The skill then tells the lead to `accept` and send RESULT with a territory missing. This is "a check that passes because it isn't looking".
- The text also says a named blocker exists "on ... the acceptance stage". R5 defines none: a FAIL is `acceptance.checkAcceptance` with `output`, a skip is `acceptance.skipped`, and a missing `integrationWorktree` gives `acceptance: null`. None of these three cases is handled.
- The `accept ...` ellipsis also drops the flags. `accept` must repeat the same check (`--repo <integrationWorktree> --delivery-ref <integrationBranch>`), or the lead's accept checks something different from what PASSed.

Fix: replace L334-337 with:
```
**Accept turn**: read the return. Accept only when `blockers` is empty (every territory
`APPROVE`, seam `APPROVE` or `SKIPPED`) AND `acceptance.checkAcceptance.verdict` is `PASS`:
run `work-record.mjs accept --record <recordPath> --repo <integrationWorktree> --delivery-ref
<integrationBranch> --census <acceptance.censusPath>` (or `--no-census "<acceptance.censusNote>"`
when `censusPath` is `null`) and send ONE RESULT. Otherwise exactly one of these decides the
one next step: a `blockers` entry (a territory id, `seam`, or `*` for a launch error),
`acceptance.skipped`, or `checkAcceptance.output` on `FAIL`; `acceptance: null` means this
call ran without `integrationWorktree`, so seam and acceptance are still yours to run by hand.
```
Expected result: a partial build can no longer reach `accept`, and every R5 acceptance shape has a next step.

### F3 MAJOR: the skill contradicts itself on who writes the record. It never says what the accept-prep runner writes.
Evidence:
- Setup step 7 (SKILL.md:75-77, "You are this record's ONLY writer, for its whole life ... neither one ever touches `docs/work/`") and Ship L228 ("You remain the only writer to `docs/work/`").
- Contract R5.2-3: the accept-prep runner copies evidence into `docs/work/evidence/` and writes `Status: reviewed`, `Artifact:`, `Worktree:`, `Evidence:` and one `Log: ... reviewed ... seam r<n> APPROVE` header line.
- The new section says nothing about this. A lead following Setup/Ship will either treat the runner's writes as a violation or write the same lines by hand before accept, which duplicates `Log:`/`Evidence:` lines.
- Ship L214-217 (move each territory's record "in the same turn the event happens") also cannot be followed while the loop runs, because the lead is not awake per event.

Fix: add this after the Accept-turn paragraph (one sentence; keep the Setup/Ship rule as is):
```
Inside the loop the accept-prep runner is the one sanctioned second writer to the record:
exactly `Status: reviewed`, `Artifact:`, `Worktree:`, `Evidence:` (the copied deciding reports
in `docs/work/evidence/`) and one `Log: ... reviewed ... seam r<n> APPROVE <sha>` line, never
`accepted`; per-event record moves (Ship) collapse into that one write, so don't pre-write them.
```

### F4 MAJOR: the Setup steps the launch now does are not marked as manual/Codex-only (brief item 5 not done), and the record count conflicts
Evidence:
- Brief item 5 says to cut "the Setup section's scout/worktree/record steps where the launch now does them (keep them as the Codex/manual path, stated once)". The report's deviation says Setup "needed no edit". That is not right: Setup L33-43 (step 2 Scout) is written as mandatory before any worktree exists, and the loop section sends the lead to Setup steps 1 and 7 (L318, L321).
- A loop lead with "setup" territories will read Setup top-down and spawn a scout by hand. R3 says the setup runner does that scout and also writes every brief. That wastes exactly the lead turns this lane exists to remove.
- L320-321 says to open "this build's work record" (one `recordPath`) and cites Setup step 7, which says "one work record per territory" (L68).

Fix, choose one of these:
- (a) Append to Setup step 2 (after L43): ` A Workflow launch with "setup" territories (Running the loop, below) does this step, the worktrees and the briefs itself; this step is the manual and Codex path.`
- (b) In the launch turn, after "Setup step 1": `(of Setup, do steps 1 and 3-6 yourself; with "setup" territories skip step 2, since the launch scouts, cuts worktrees and writes every brief)`.

Also change L320-321 `Open this build's work record (\`recordPath\`, Setup step 7)` to `Open ONE work record for the whole build (\`recordPath\`; Setup step 7's fields, not one per territory)`.

## MINOR

### F5 MINOR: the census-at-accept sentence is garbled and never says `--four-read` is passed
SKILL.md:342-344. Old: `and pass it
at accept — when the record supports \`--four-read\`, pass it at accept.`
New: `and pass it
at accept (in the loop, accept-prep already ran it: that is \`acceptance.censusPath\`); when the
record supports \`--four-read\`, pass \`--four-read\` at accept too.`

### F6 MINOR: the return-row description drops `id` and `sha`, and the blocker vocabulary is incomplete
SKILL.md:328-332.
- A territory row is `{ id, sha, verdict, rounds, reportPath, findingsPath, blocker }` (script L31, R6). The new text omits `id` and `sha`, and `sha` is what gets accepted.
- `review-sha-mismatch` and `review-not-approved` exist in the 0.20.9 script (L224, L286, L297) but are hidden under "stage-specific reason".
- R2/R3/R4 add `mixed-territory-modes`/`missing-args` (id `*`), `setup-failed` (territory id) and seam blockers (id `seam`).
- `setup` content (R7: `{ reportPath, reviewerBriefPath, integratorBriefPath, seamBriefPath } | null`) is not described.

Old: `` `territories` one row
each (`verdict`, `rounds`, `reportPath`, `findingsPath`, `blocker`: `null` on a normal end,
else `'agent-died'`, `'builder-blocked'`, `'build-failed'`, `'rounds-exhausted'`, or a
stage-specific reason);``
New: `` `territories` one row
each (`id`, `sha`, `verdict`, `rounds`, `reportPath`, `findingsPath`, `blocker`: `null` on a
normal end, else `agent-died`, `builder-blocked`, `build-failed`, `review-sha-mismatch`,
`review-not-approved`, `rounds-exhausted` or `setup-failed`; launch errors come back as id `*`
`missing-args`/`mixed-territory-modes`, seam failures as id `seam`); `setup` is the setup
stage's report and brief paths, or `null`;``

### F7 MINOR: the "What breaks honestly" first bullet is false against the script and R4
SKILL.md:358-359 says "every fix round gets a full review, not a diff against the prior one's findings". But build-loop-workflow.js:135-145 (`reviewPrompt`, round >= 2) already passes `Prior findings:` and `Commit range: <prior>..HEAD`, and R4 relies on that ("same rule as reviewPrompt").
Old: `- No warm-delta re-review across rounds — every fix round gets a full review, not a diff
  against the prior one's findings.`
New: `- No warm reviewer across rounds — each fix round spawns a fresh reviewer, briefed with the
  prior findings path and commit range (a cold delta re-review, not a resumed agent).`

### F8 MINOR: a loop-specific census instruction is still duplicated in Ship (brief item 5)
SKILL.md:275-277: `(and, if this build launched the loop from an Opus pane, \`node <plugin>/scripts/build-census.mjs --lead <lead-session.jsonl>
--tasks <subagent-tasks-dir>\`)`. This is a second loop census, with different flags from L250 and from accept-prep. Delete the parenthetical: old `docs/work\` (and, if this build ... --tasks <subagent-tasks-dir>\`) to get` -> new `docs/work\` to get`.

### F9 MINOR: an inline code path is split across a line break
SKILL.md:311-312: `` `skills/team-build/`` newline `` references/build-loop-workflow.js` ``. Markdown renders this with a space inside the path, and a grep for the full path misses it. Put `` `skills/team-build/references/build-loop-workflow.js` `` on one line (re-wrap the paragraph).

### F10 MINOR: the Codex record line is written as an example, but R10 pins it
SKILL.md:355: `(e.g. \`Evidence: Codex-led, manual sequence (no Workflow tool)\`)` -> `: \`Evidence: Codex-led, manual sequence (no Workflow tool)\``. Optionally, add "the loop is unsupported on Codex" in so many words, to meet the "explicit unsupported" attack point.

## Answers to the attack brief (L2)
- **Does every script sentence match contracts.md?** No. The args (F1), the accept semantics (F2), the runner's record writes (F3) and the return vocabulary (F6) diverge or are missing. Stage order is correct where it is stated: fix/re-review, seam, integration, census-and-check.
- **Did the cut remove a rule that still applies?** No rule outside the loop was removed. However, the kept only-writer rule and the per-event record moves now conflict with R5 (F3), and the scout step was not marked manual-only (F4).
- **Codex:** unsupported in substance, no emulation. One wording pin (F10).

Cause: the rewrite describes the contract by reference ("per the build's pinned contract") instead of naming its args and return shapes, and it did not reconcile the kept Setup/Ship rules with what the launch now does.
Discriminating check: take only the new section and try to write the Workflow `args` for a two-territory setup build. `baseSha`, `specPath` and the territory `id` field cannot be found. Then run a return with one `rounds-exhausted` territory and a check-acceptance PASS through L334: the skill says accept.
Fix location: skills/team-build/SKILL.md L317-337 (F1, F2, F3), L33-43/L320 (F4), plus the MINOR lines listed.
Simplification: F1 and F2 replace vague prose with the pinned names, for about +6 lines net. F8 removes about 2 lines. The file stays under 371.
