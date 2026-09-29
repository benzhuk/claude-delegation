Work: wr-2026-09-28-fable-wave
Scope: the spec section of this record (lane 51), from packet docs/notes/skills-fable-lane-51-1.md read at a6efbbe
Owner: skills-n
Status: closed
Authority: build, review, integrate, push build/fable-wave-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; read transcripts and flush.log on ben-desktop read-only over ssh; live proof sends two FYI notes to skills-fable under a scratch notes home only; no write to any live wave.json or notes home, no release, no install
Next: accept pinned at e7f5f25, merge, publish, close, RESULT (NO-BUILD)
Artifact: e7f5f25c3e6f7b7351476358b311cbfb2d7d5d5b
Evidence: docs/work/evidence/wr-2026-09-28-fable-wave-review.md, docs/work/evidence/wr-2026-09-28-fable-wave-review-r1.md, docs/work/evidence/wr-2026-09-28-fable-wave-review-r2.md, docs/work/evidence/wr-2026-09-28-fable-wave-redteam.md, docs/work/evidence/wr-2026-09-28-fable-wave-suites.md
Worktree: build/fable-wave-1
Scratch: /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-51
Opened: 2026-09-29T00:58:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-29T00:57:08Z
Base: a6efbbe97e21bc0f49f995ed5b4e9f4a2259bd8d
Log: 2026-09-29T00:59:03.000Z owned skills-n picked up skills-fable-lane-51-1 (ACK skills-n-lane-51-1); spec written into this record; Opus red-team of the spec before any builder
Log: 2026-09-29T01:08:24.000Z owned skills-n Opus spec red-team by ac5a812f7f22dc663 NEEDS_FIXES da0e0e1 (3 blockers: most wakes are note-send direct posts that never reach the drain, a held entry would count as an attempt and dead-letter, a dead timer would strand held notes; 6 major incl. the gate measures wake share not saving); all adopted, gate is the coalescable upper bound under 10 percent, step 2 if built is a trailing debounce; Sonnet step 1 builder spawned
Log: 2026-09-29T01:27:41.000Z delivered skills-n Sonnet step 1 builder DONE 828dc30 (wake split and W1b in build-census, red at a6efbbe, 2907 pass 0 fail); the lead read 9c61c35a on ben-desktop from 19:00Z to 01:26:54Z at 828dc30: wake-opened 22 turns carry 39.3 percent of claude-fable-5-1 (19.2M of 48.9M), coalescable RESULT turns at a 10-minute hold 0, so the upper bound is 0 percent, under the 10 percent gate: NO-BUILD for step 2; lead cross-check lists 21 wakes, 7 RESULT (nearest pair 13.8 min apart), 11 ASK (10 from skills-a), 3 BLOCKED; Opus code review and Windows suite started
Log: 2026-09-29T01:38:23.000Z rejected skills-n Opus code review by ac577c0fc9f9dec6a NEEDS_FIXES 828dc30 (MAJOR: the W1b 0 is not an upper bound for the ruled design, a RESULT ceiling is the true gate; 4 MINOR, 1 NIT); Windows suite at 828dc30 2897 pass 1 fail, the fail a hooks/codex-unsupported load flake outside territory, 8 of 8 twice alone; Sonnet fix round 1 builder spawned
Log: 2026-09-29T01:45:09.000Z delivered skills-n Sonnet fix round 1 builder DONE 6b95a2d (all 6 findings, census 121 pass, full suite 2911 pass 0 fail); lead re-read 9c61c35a on ben-desktop at 6b95a2d, same window: coalescable 1 turn (upper 0.73M, 1.5 percent), RESULT ceiling 8 turns 11.17M of 48.89M claude-fable-5-1, 22.9 percent, over the 10 percent gate, so the ceiling does not decide; rule fixed before the gap read: a RESULT wake is saved only when the previous post came under 10 min before it and another run opens, or another queued RESULT releases, before that post plus 10 min; saved over 10 percent builds step 2, else NO-BUILD; Sonnet gap-read runner and Opus delta review spawned
Log: 2026-09-29T01:54:52.000Z rejected skills-n Opus delta review by a6c493494c6afdf0f NEEDS_FIXES 6b95a2d (MAJOR: a straddling RESULT run coalesces into its own wave, so the re-read coalescable 1 is likely an artifact; 4 MINOR: pre-window chaining, post --to lines, ceiling guard can only lower a bound, unpinned mutants); ceiling a true bound and unaffected; same builder resumed for fix round 2
Log: 2026-09-29T01:57:59.000Z delivered skills-n Sonnet fix round 2 builder DONE e7f5f25 (census 125 pass, full suite 2915 pass 0 fail); Sonnet runner a949108d8af9945c4 gap read at 6b95a2d: 8 RESULT rows sum to the ceiling 11172487 exactly, saved under the pre-registered 10 min rule 0 turns, 0.0 percent, NO-BUILD for step 2 (30 min hold would save 11.2 percent, context only, it sits at the GOALS 30 min unread limit); lead re-read at e7f5f25 on ben-desktop: coalescable 0, ceiling unchanged 8 turns 11172487; Opus delta review r3 resumed, Windows suite started
Log: 2026-09-29T02:01:25.000Z reviewed skills-n Opus reviewer a6c493494c6afdf0f delta r3 VERDICT: APPROVE e7f5f25 (all r2 findings fixed as specified, 9 of 9 mutants killed, 0 findings); Windows suite at e7f5f25 2905 pass, the 1 fail a missing origin/main in the lead clone, 89 of 89 after the fetch
Census: - leadTurns: 12
Census: - wallClockHours: 1.06
Census: - wakes: 1 (1 note-flush, 0 Done-tick)
Census: - wakeSplit: wake 1, stopBlock 0, other 11 (coalescable 0 at hold 10m — see "Wake-opened turns" below)
Census: - stopBlocks: 0
Census: - stallNudges: unavailable (ledger dir unreadable)
Census: - by-model: claude-opus-5-5=20501950, claude-sonnet-5=22239559
Census: - by-role: unassigned=31676161
Census: - subagentFiles: 221
Census: - Total assistant turns, deduped (whole file): **1361**
Census: - Window assistant turns, deduped: **67**
Census: - leadTurns (conversational runs — see docs/census.md): **12**
Census: - Wakes (turns opened by a note-flush or Done-tick line, see docs/census.md): **1** (1 note-flush, 0 Done-tick)
Census: - Stop-blocks (multi-inbox Stop hook blocks): **0**
Census: - Stall nudges received (ledger `collect-*-stall-*` ASKs to the lead's slug, in the window): **unavailable (ledger dir unreadable)**
Census: - Window: 2026-09-29T00:58:07.016Z .. 2026-09-29T02:01:27.009Z
Census: - Turns/hour in window: **63.47**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 2720 | 4279334 | 226716699 | 898128 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 134 | 177385 | 10837276 | 50553 |
Census: - wakeTurns: 1, stopBlockTurns: 0, otherTurns: 11
Census: - cache_creation per turn (M6) — wake: claude-opus-5-5=13612.0; other: claude-opus-5-5=14888.5
Census: - coalescable (W1b, hold 10m, RESULT wakes only, Done-tick excluded): turns 0, upper (none), lower (none); ceiling (every RESULT wake turn) turns 0, (none)
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 228 | 403514 | 8867046 | 165814 |
Census: | claude-sonnet-5 | 390 | 544190 | 21508242 | 186737 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 618 | 947704 | 30375288 | 352551 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 216367 | 20285583 |
Census: | claude-sonnet-5 | 186737 | 22052822 |
Four numbers: Top-tier tokens per build: 20501950 tokens: build 20501950 (claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 1.1h; largest gap 17.8min at 2026-09-29T01:08:49.724Z
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); 1 unanswered ASK(s) to skills-n: skills-fable-lane-51-1; wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-n
Log: 2026-09-29T02:01:32.000Z accepted skills-n artifact e7f5f25c3e6f7b7351476358b311cbfb2d7d5d5b
Log: 2026-09-29T02:02:31.000Z merged skills-n merged into main at a6a3f39 under the standing merge grant, merge suite 2920 pass 0 fail
Log: 2026-09-29T02:02:49.000Z closed skills-n merge a6a3f39eee278c9a2d3d2bf9f7d1deaa37b8dfde

Observed: build-census now splits a Claude lead window into wake-opened, Stop-block and other turns, and prints a RESULT ceiling beside the W1b coalescable count. On the Fable lead 9c61c35a, 2026-09-28T19:00:00Z to 2026-09-29T01:26:54Z, read on ben-desktop at e7f5f25: wake-opened 22 turns carry 39.3 percent of claude-fable-5-1 (19196120 of 48886987), coalescable 0 at a 10 minute hold, and the RESULT ceiling is 8 turns, 11172487, 22.9 percent. The ceiling is over the 10 percent gate, so the pre-registered gap rule decided: 0 of 8 RESULT turns saved, 0.0 percent, NO-BUILD for step 2. A 30 minute hold would save 4 turns, 11.2 percent, but that sits at the GOALS 30 minute unread limit. The wakes are mostly ASKs (11 of 21, 10 from skills-a), so holding RESULTs is not the lever.

Predicts: the next Fable lead census shows a wake-opened share between 30 and 45 percent with coalescable 0 and a RESULT ceiling under 25 percent. If the wake share rises past 45 percent, ASK wakes from skills-a are the lever to measure, not a RESULT hold.

Stall: no builder or reviewer stalled. The word match in the Log is "change", not a hang. Background watchers exited on report arrival each time. One review watcher exited on the first report of two it covered, which was harmless, and it was restarted for the second.

## Spec (lead, from the packet)

Measure: top-tier tokens per build, specifically the Fable lead's share. Must not worsen: hours ask to accepted, or work lost or stalled. No RESULT, ASK or BLOCKED may sit unread over 30 minutes (docs/GOALS.md:18).

### Step 1: measure the split (always built)

W1. In scripts/build-census.mjs's Claude lead reading, split the window into wake-opened turns and all other turns. A turn is the census's existing conversational run (the unit leadTurns counts). A wake-opened turn is one whose opening top-level user message is a wake by the existing `classifyWake`. The turn's tokens are the deduped assistant usage from its opening message up to the next turn.

For each side, print:
- the turn count;
- per model, the four token columns and their sum;
- the share of the window's top-tier tokens as a percent with one decimal.

Show it in the markdown census as a new "### Wake-opened turns against the rest (window)" block. Add it to `--json` under `lead.wakeSplit` = `{wakeTurns, otherTurns, byModel: {wake: {...}, other: {...}}, topTierShareWake}`.

The Codex lead reading is out of scope. Print `wakeSplit: unavailable (codex lead)` there so the gap is visible.

W2. Tests use the existing lead fixtures plus one new fixture. That fixture has two wake-opened turns and one prompt-opened turn with known usage, and the test asserts the exact split. It must fail at the base: the field is absent.

W3. docs/census.md gets one line naming the split.

### The read and the decision rule (fixed before the read)

R1. The lead runs the step-1 reader on ben-desktop, over ssh, from a fresh detached worktree of the branch. It reads session 9c61c35a-82dd-4aef-8eca-c99bb0e72e31 from 2026-09-28T19:00:00Z to the read time, and the two numbers go into this record.

Also, from ben-desktop's ~/.agents/notes/flush.log: for each wake to skills-fable in that window, how many notes the post carried. The lead reads this with a grep and a count, printing no note text.

R2. If wake-opened turns carry under 25.0 percent of the window's claude-fable-5-1 tokens, the lane is NO-BUILD. Step 1 merges as a measurement, and the RESULT says NO-BUILD with the numbers. That is a first-class result, not a failure.

Otherwise step 2 is built. Step 2 is also NO-BUILD if at least 80 percent of the wakes already carried a single note arriving alone, as defined here: no other note to the same slug within 10 minutes before or after it. The reason is that coalescing saves nothing when notes arrive far apart. The flush.log count decides this.

### Step 2: note-flush wakes once per wave (only when R2 says build)

N1. The config is `~/.agents/notes/wave.json`, shaped `{"<slug>": {"holdMinutes": N}}`. If the file is absent or unreadable, or the slug has no entry, behaviour is exactly today's. N is capped at 30. A value over 30 is used as 30 and logged once per drain.

N2. For a listed recipient, the flusher holds a note's wake-up for up to N minutes from the note's ledger time. Then it posts every held note for that recipient in one post, one line each, oldest first.

These notes are released at once, together with anything already held for the same recipient:
- BLOCKED;
- an ASK whose Needs is decision or review;
- any note whose `--by` falls within the hold window.

ACK and FYI stay ledger-only as today, so they never wake anyone and are never held. The held kinds are therefore RESULT, plus an ASK whose Needs is not decision or review. The packet's efficacy test and live proof name FYIs; the lead reads that as RESULT-class notes, because an FYI never posts.

N3. The ledger and packets are written first, as today. Holding delays only the wake-up, never the record. A note already surfaced by the recipient's own hooks (its cursor has passed it) is not posted again. Whatever today's code does for that case is unchanged.

N4. Kill switch: `~/.agents/no-wave` disables holding for every slug and is logged once per drain. In the census wiring it reads as `switchedOff("wave")`, the same shape as the other switches.

N5. Nothing in note-send, note-inbox or hooks/ changes. A note-send piggyback drain respects holds exactly as the timer drain does.

N6. Efficacy tests:
- a held note is released at N;
- a BLOCKED arriving while two notes are held releases all three in one post;
- with N = 45, a note is released at 30 with the cap logged;
- with the file absent, or with no-wave present, the post is byte for byte today's for the existing fixture;
- a piggyback drain inside the hold posts nothing for a held slug.
Each test is red at the base or at the step-1 head, whichever applies.

N7. Live proof, run by the lead after review, under a scratch notes home and a scratch registration only: two RESULT notes to a scratch slug three minutes apart, with holdMinutes 10, produce one post in the scratch flush.log. The live wave.json on ben-desktop is skills-fable's to write at install. This lane never writes it.

### Territory

- skills/multi/scripts/note-flush.mjs and its tests.
- scripts/build-census.mjs, for the wake split only, and its tests.
- docs/census.md: one line for the split and one for the switch.

NOT scripts/four-read.mjs, note-send, note-inbox, hooks/ or the record schema.
