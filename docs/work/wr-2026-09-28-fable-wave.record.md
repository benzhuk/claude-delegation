Work: wr-2026-09-28-fable-wave
Scope: the spec section of this record (lane 51), from packet docs/notes/skills-fable-lane-51-1.md read at a6efbbe
Owner: skills-n
Status: delivered
Authority: build, review, integrate, push build/fable-wave-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; read transcripts and flush.log on ben-desktop read-only over ssh; live proof sends two FYI notes to skills-fable under a scratch notes home only; no write to any live wave.json or notes home, no release, no install
Next: gap read decides step 2 by the pre-registered debounce rule; Opus delta review of 6b95a2d; then accept, merge, publish, close, RESULT
Worktree: build/fable-wave-1
Scratch: /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-51
Opened: 2026-09-29T00:58:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-29T00:57:08Z
Base: a6efbbe
Log: 2026-09-29T00:59:03.000Z owned skills-n picked up skills-fable-lane-51-1 (ACK skills-n-lane-51-1); spec written into this record; Opus red-team of the spec before any builder
Log: 2026-09-29T01:08:24.000Z owned skills-n Opus spec red-team by ac5a812f7f22dc663 NEEDS_FIXES da0e0e1 (3 blockers: most wakes are note-send direct posts that never reach the drain, a held entry would count as an attempt and dead-letter, a dead timer would strand held notes; 6 major incl. the gate measures wake share not saving); all adopted, gate is the coalescable upper bound under 10 percent, step 2 if built is a trailing debounce; Sonnet step 1 builder spawned
Log: 2026-09-29T01:27:41.000Z delivered skills-n Sonnet step 1 builder DONE 828dc30 (wake split and W1b in build-census, red at a6efbbe, 2907 pass 0 fail); the lead read 9c61c35a on ben-desktop from 19:00Z to 01:26:54Z at 828dc30: wake-opened 22 turns carry 39.3 percent of claude-fable-5-1 (19.2M of 48.9M), coalescable RESULT turns at a 10-minute hold 0, so the upper bound is 0 percent, under the 10 percent gate: NO-BUILD for step 2; lead cross-check lists 21 wakes, 7 RESULT (nearest pair 13.8 min apart), 11 ASK (10 from skills-a), 3 BLOCKED; Opus code review and Windows suite started
Log: 2026-09-29T01:38:23.000Z rejected skills-n Opus code review by ac577c0fc9f9dec6a NEEDS_FIXES 828dc30 (MAJOR: the W1b 0 is not an upper bound for the ruled design, a RESULT ceiling is the true gate; 4 MINOR, 1 NIT); Windows suite at 828dc30 2897 pass 1 fail, the fail a hooks/codex-unsupported load flake outside territory, 8 of 8 twice alone; Sonnet fix round 1 builder spawned
Log: 2026-09-29T01:45:09.000Z delivered skills-n Sonnet fix round 1 builder DONE 6b95a2d (all 6 findings, census 121 pass, full suite 2911 pass 0 fail); lead re-read 9c61c35a on ben-desktop at 6b95a2d, same window: coalescable 1 turn (upper 0.73M, 1.5 percent), RESULT ceiling 8 turns 11.17M of 48.89M claude-fable-5-1, 22.9 percent, over the 10 percent gate, so the ceiling does not decide; rule fixed before the gap read: a RESULT wake is saved only when the previous post came under 10 min before it and another run opens, or another queued RESULT releases, before that post plus 10 min; saved over 10 percent builds step 2, else NO-BUILD; Sonnet gap-read runner and Opus delta review spawned

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
