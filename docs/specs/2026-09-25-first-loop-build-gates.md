# First build through the plugin from a Claude lead: close the three unchecked gates

Written by skills-fable, 2026-09-24 evening, for an Opus lead (skills-o) running the plugin's own build loop. This build is also the measurement: it is the Claude-led half of the card's DONE line ("a build goes spec to accepted through the plugin, led once from Claude and once from Codex"). The lead records its own turn count and the census; the numbers are the deliverable as much as the code.

Measure this build moves: rework after acceptance (three gates that today pass on a claim instead of a check), and work lost or stalled (the bearings due-notice reaches the model, never Ben). It must not worsen top-tier tokens per build or hours ask to accepted: the lead stays under 20 turns, Sonnet builds, Opus reviews.

Base: main at 795c8e1 (0.20.7). Branch `build/loop-gates-1`, one worktree per builder, never the main checkout.

## Territories (disjoint files)

### T1: acceptance and reviewer SHA (scripts/, skills/team-build/)
Findings on 795c8e1:
- `scripts/work-record.mjs:182` still accepts any first line beginning `VERDICT:`; the strict `checkAcceptance` (CLI `check-acceptance`, `:530`/`:546`) runs only because `skills/team-build/SKILL.md:234-237` tells the owner to run it. That is a rule enforced by prose.
- `skills/team-build/references/build-loop-workflow.js:169-171` and `:230-232` compare `review.sha` to `build.sha`, both self-reported by agents; the reviewer prompt at `:89` hands it the SHA to echo. Workflow scripts cannot shell out, so the check must live where git is reachable.

Required:
1. The accept path in `work-record.mjs` calls `checkAcceptance` itself; a record cannot move to `accepted` when the check fails. Exit non-zero with the finding list. The CLI command stays for manual use.
2. `checkAcceptance` gains one check: the record's SHA must equal `git rev-parse HEAD` of the record's branch or worktree (path recorded on the work record; add the field if absent). A mismatch is a failing finding named `sha-not-in-git`.
3. The build loop's reviewer prompt tells the reviewer to run `git rev-parse HEAD` in the worktree it reviews and report that value; the builder likewise. The workflow keeps its equality check but stops handing either agent the expected SHA.
4. Tests: accept with a passing check, accept refused on a bad verdict line, accept refused on a SHA that git does not have, and a fixture proving the reviewer prompt no longer contains the SHA. Sealed suite green.

### T2: bearings reaches Ben and is independent (hooks/, skills/bearings/)
Findings on 795c8e1:
- `hooks/delegation-reminder.js:339` builds "Bearings are due"; SessionStart `:390` and PostToolBatch `:420` put it in `text`/`additionalContext` only. The PostToolBatch comment says a rejection is reported at session start only.
- `skills/bearings/SKILL.md:13` says "a fresh high-tier reviewer" but nothing requires the reviewer to be an agent other than the lead, and `bearings-state.mjs` checks no reviewer identity. The 2026-09-24 bearings entry was written by the lead that did the work.

Required:
1. The due-notice goes in `systemMessage` at SessionStart (so Ben sees it in the pane) and stays in `additionalContext` for the model. PostToolBatch keeps model-only; no repeated pane noise.
2. A bearings receipt records the reviewer's session or agent id and the lead's; `bearings-state.mjs` rejects a receipt where they are equal or the reviewer id is missing, with the finding `reviewer-not-independent`. The skill text states the rule in one line and points at the check.
3. Tests for both, sealed suite green. Kill switches unchanged (`ws-off-bearings`), fail open.

### T3: docs (docs/GOALS.md, README changelog)
- GOALS.md "One package" status: replace the mixed-version sentence with the four-host 0.20.6 install of 2026-09-24 (evidence `docs/work/evidence/four-host-0206-and-live-pickup.md`), and note the 0.20.7 card cap change is installed nowhere yet at the time of writing.
- GOALS.md "Decisions and goals" status: the scheduled pickup ran unattended at 8:25 AM on 2026-09-24 and returned PICKUP_NO_ACTION with Done false; a checked-Done handback has still never happened.
- GOALS.md "Progress is checked by a fresh agent" status: the 2026-09-24 bearings returned RE-PLAN and was run by the lead, so it does not count as independent; the STOP line counts from the next independent run.
- Changelog entry under the next patch version, one paragraph, no version bump commit (the release is Ben's call).

## Not in scope
No new hooks, no scheduler, no Codex cadence work, no Notion writes, no plugin install, no release commit, no merge to main. Nothing under `skills/decisions/`. No Co-Authored-By or any trailer. The git identity is never set or switched by an agent.

## Acceptance
- Sealed `node scripts/run-tests.mjs` green on the integrated branch.
- `node scripts/work-record.mjs check-acceptance <record>` passes on this build's own record, with the SHA check live.
- The reviewer for each territory is Opus with a `JUDGMENT:` line and file:line evidence; the seam reviewer covers T1 and T2 together.
- The lead reports: its own turn count, the census (tokens by model and role), wall clock from this spec's timestamp to the accepted record, and review rounds per territory. Under 20 lead turns is the target; report the real number either way.
- Branch pushed to origin as `build/loop-gates-1`. Merge waits for Ben's word given directly to the lead or to skills-fable.
