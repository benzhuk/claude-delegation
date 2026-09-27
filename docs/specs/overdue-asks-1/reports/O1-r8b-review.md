VERDICT: APPROVE b9e3f7239274421383d243ad67952b54cbb23e4a

# O1 R8b delta review: overdue-asks-1

The narrowing and the doc fix landed exactly as I drafted them, the real-ledger replay gives 0 sends in every scenario, and I found no regressions.

## Scope and gate

- **Reviewed:** /home/ben/Code/wt-overdue-asks-1-O1 at `b9e3f7239274421383d243ad67952b54cbb23e4a`. I confirmed the sha with my own `git rev-parse HEAD`. The worktree was clean before and after.
- **Delta:** `b662984..b9e3f72` is one commit, b9e3f72. It touches exactly three files, all in O1: SKILL.md, note-flush.mjs and note-flush.test.mjs.
- **Gate:** I re-ran `node --test skills/multi/scripts/note-flush.test.mjs` and got 149 pass, 0 fail.
- **Scratch:** every trial ran under `<scratchpad>/r8b-first`, `r8b-steady` and `r8b-src`. I restored the code file in r8b-src to HEAD and `cmp` confirms it. Nothing was deleted.

Counts: BLOCKER 0, MAJOR 0, MINOR 0, NIT 0.

## 1. The patches landed as written

| Finding (O1-r8-review.md) | Where | Status |
|---|---|---|
| MAJOR 1, import | note-flush.mjs:59 adds `envelopeInstant` | Verbatim |
| MAJOR 1, gate | note-flush.mjs:1378-1386 adds `askAt = envelopeInstant(ask)`, the `askAt !== null &&` short-circuit, and `(envelopeInstant(g) ?? -Infinity) >= askAt` | Verbatim |
| MAJOR 1, test | note-flush.test.mjs:2302-2312 | Verbatim |
| NIT 1 | SKILL.md:150 | Verbatim |

The lead's narrowing sits at the end of `contracts.md`, under R8. It states the "at or after the ASK" rule and the reason for it, and the code matches it.

## 2. Real-ledger replay

I copied this host's `~/.agents/notes/2026-09-2*.md` to scratch, registered `skills-n` with an existing cwd, stubbed the send, and used the current time as `now`. I did not read inboxes.json.

| Scenario | Pass 1 | Pass 2 | Status |
|---|---|---|---|
| First run, no state file | `seeded: true`, open 7, nudged 0, crossHost 0, **0 sends**, log `overdue-seeded 7` | open 7, nudged 7 (all seeded), crossHost 0, **0 sends** | `; overdue: 7 open, 7 nudged` |
| Steady state: state file present, same 7 ids unrecorded | open 7, nudged 0, **crossHost 7, 0 sends**, seven `overdue-cross-host [...] -> skills-n` log lines | crossHost 7, 0 sends | `; overdue: 7 open, 0 nudged` |

This matches the expected result: 0 sends, and crossHost is 7 in the steady state. The two 2026-09-25 `skills-n → skills-fable` lines no longer satisfy condition (a), because both are stamped before every 9.26 ASK.

## 3. Regression hunt

**Mutation checks, run on the scratch copy only:**

| Mutation | Result | What it shows |
|---|---|---|
| Drop the `>= askAt` term, which restores "any line, ever" | 148 pass, 1 fail; only the new test fails | The narrowing is pinned |
| Make the reply-line branch always false | 145 pass, 4 fail | The existing R8 and observability tests still pin that a reply at or after the ASK (their 20:10 lines after a 20:00 ASK) opens the gate. The narrowing did not make condition (a) dead code |

**The narrowing adds no throw path:**
- `envelopeInstant` returns null on malformed input and never throws.
- A null `askAt` falls through to condition (b). It cannot happen in practice, because an ASK only gets this far with a valid date and time (`overdueDeadlineMs`).
- A reply whose instant is null compares as `-Infinity`, so it does not count.
- `>=` keeps a reply stamped in the same minute as the ASK.

**Time zone:** both the reply stamp and the ASK stamp are read in `DEFAULT_ZONE`. That is the same zone the deadline uses (R3), so there is no mixed-zone comparison.

**The seven attack items:**
- **A nudge twice for one id, across drains or days.** Nothing changed here: the id is recorded before any send, and ids that are seeded or cross-host are recorded too. Pruning is shape-aware.
- **A superseded ASK.** Unchanged.
- **23:50 by 00:10.** Unchanged.
- **A `re` reply that is itself an ASK.** Unchanged. It still counts as a recipient-to-sender line when it is stamped after the ASK.
- **drainQuietly or piggyback path.** Unchanged, and test :2111 still checks it.
- **Unbounded state file.** Unchanged.
- **A send that fails.** Still fails open. The delta touches only the gate predicate.

**Cost:**
- The extra `envelopeInstant` call runs only on lines that already match `from === ask.to && to === ask.from`.
- It runs only for overdue ids not yet in the state file, which is none on most passes after the seed.

**SKILL.md:150** now matches `buildOverdueStatus` (:1430-1440): seeded ids count as `nudged`, and ids whose answer side is not observable go to `json.crossHost`.

## C4 fields
Cause: R8 (a) accepted any recipient-to-sender envelope ever seen in a ledger with no age limit. Two 2026-09-25 lines therefore opened the gate forever for skills-fable → skills-n. The lead's ruling narrows (a) to lines stamped at or after the ASK.
Discriminating check: replay this host's ledger in the steady state with skills-n registered. At b662984 it made 7 sends; at b9e3f72 it makes 0, with crossHost 7. The new test fails when the `>= askAt` term is removed (148 of 149).
Fix location: note-flush.mjs:59 and :1378-1386, note-flush.test.mjs:2302-2312, SKILL.md:150, and the lead narrowing at the end of contracts.md R8.
Simplification: one comparison inside the existing `some()`. No new mechanism, state or flag.
