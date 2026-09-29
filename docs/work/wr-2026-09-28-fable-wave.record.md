Work: wr-2026-09-28-fable-wave
Scope: the spec section of this record (lane 51), from packet docs/notes/skills-fable-lane-51-1.md read at a6efbbe
Owner: skills-n
Status: owned
Authority: build, review, integrate, push build/fable-wave-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; read transcripts and flush.log on ben-desktop read-only over ssh; live proof sends two FYI notes to skills-fable under a scratch notes home only; no write to any live wave.json or notes home, no release, no install
Next: Opus red-team of this spec, then the step 1 builder
Worktree: build/fable-wave-1
Scratch: /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-51
Opened: 2026-09-29T00:58:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-29T00:57:08Z
Base: a6efbbe
Log: 2026-09-29T00:59:03.000Z owned skills-n picked up skills-fable-lane-51-1 (ACK skills-n-lane-51-1); spec written into this record; Opus red-team of the spec before any builder

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
