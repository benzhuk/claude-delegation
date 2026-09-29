VERDICT: NEEDS_FIXES da0e0e1

# Lane 51 spec red-team (wr-2026-09-28-fable-wave, "## Spec", at da0e0e1)

Scope: the spec section of docs/work/wr-2026-09-28-fable-wave.record.md, read against scripts/build-census.mjs, skills/multi/scripts/note-flush.mjs, docs/census.md, and the code they call (note-send.mjs, inbox-claude.mjs, transport.mjs, envelope.mjs, decisions-pickup.mjs). Worktree at da0e0e1 is clean; nothing was modified.

Count: 3 BLOCKER, 6 MAJOR, 5 MINOR, plus verified-clean areas at the end.

Step 1 is sound in principle and can be built once W1 is pinned (m2) and the read moves off flush.log (M3, M4). Step 2 as written would not work: the hold sits in the drain, but the drain never sees most wakes (B1). Two of the step-2 safety rules would also strand notes (B2, B3).

---

## B1 BLOCKER: most wakes never reach note-flush, so a hold "inside note-flush.mjs alone" holds nothing (attack 4, N5)

Evidence:
- note-send.mjs:900-916: when the recipient has a registered inbox, note-send posts the envelope itself, at send time, through `deliverToInbox`, and returns `delivered: true, outbox: null`. An outbox entry is written only when that post fails (:917-925, `const outbox = queue(how)` at :919).
- note-send.mjs:97 imports `deliverToInbox` from note-flush.mjs. The drain (note-flush.mjs:810-870) only handles what is already in `outbox/`.
- inbox-claude.mjs:54 `DEFAULT_FROM = 'note-flush'`. Every post, including note-send's direct ones, is labelled `from: note-flush`. The census's "15 note-flush wakes" (fable-lead-census.md:9, classifyWake build-census.mjs:176-189) are therefore mostly note-send direct posts, not drain posts. The packet's premise, "note-flush wakes", comes from that label.
- Predicted outcome of N7 as written: skills-fable (scratch slug) has a registered inbox, so each of the two RESULTs is posted at once by note-send. The result is two posts and two wakes, and the drain has nothing to hold. N6's unit tests would pass (they drive the drain directly) while the live proof fails.

Fix. Replace N5 with:

> N5. The hold is decided in `deliverToInbox` (note-flush.mjs:538). note-send already imports it (note-send.mjs:97) and calls it for every registered-inbox send (:900-916). For a held recipient it returns `{ ok: true, delivered: false, reason: 'held', detail: 'held for a wave until <ISO>' }` without opening the socket. note-send's existing not-delivered branch (:917-925) then writes the outbox entry and exits 3 with that reason. The drain calls `deliverToInbox` with `{ release: true }`, which skips the hold check. note-send.mjs, note-inbox and hooks/ are not edited. note-send's observable result for a held recipient does change, from exit 0 `delivered` to exit 3 `queued` with reason `held`, so skills/multi/SKILL.md gets one line saying so and joins the Territory. Test: runNoteSend with the real `deliverToInbox`, a wave.json listing the slug and a registered claude-socket inbox whose socket path does not exist. Assert exit 3, reason `held`, exactly one outbox entry, and no `inbox-stale` outcome (the socket was never opened).

Territory line to add: `skills/multi/SKILL.md: one line, exit 3 reason held.` Also add note-send.test.mjs for that one test.

## B2 BLOCKER: if the hold goes through the existing verdict path, each drain counts it as an attempt, and 20 of them dead-letter the note (attack 3)

Evidence:
- note-flush.mjs:859: `const counted = !NOT_AN_ATTEMPT.has(outcome)`. Any not-delivered reason other than `codex-no-thread`/`no-inbox` (:115) increments `attempts`.
- :733-747: `attempts >= 20` triggers `killOutboxEntry` plus `appendBlockedToBen`. The entry goes to `outbox/dead/` and the wake-up is never sent.
- Drains run once a minute plus once per note-send on the machine (drainQuietly :1644). During a 10-minute hold on a busy host (a wave of lanes sending), a held entry passes 20 drains easily. The note is then stranded, and Ben gets a false BLOCKED line.
- :869: repeat suppression applies only to NOT_AN_ATTEMPT outcomes, so a held entry would also write one flush.log line per drain.

Fix. Add to N2:

> N2a. The drain checks the hold after the retirement pass (after :723) and before `claimOutboxEntry`. A held entry is not an attempt: `held` joins NOT_AN_ATTEMPT (:115) and `attempts` never moves. It logs one line, `<stamp> held [<id>] -> <slug> — until <ISO>`, only on the drain where its `lastOutcome` first becomes `held`. That one rewrite of `lastOutcome` is made under the claim, the same way the no-inbox branch does it (note-flush.mjs:889-925). Test: an entry held across 25 drains keeps `attempts` 0, is never dead-lettered, and writes exactly one `held` line.

## B3 BLOCKER: holding makes every RESULT depend on the one-minute timer; a dead timer strands notes to an idle lead indefinitely (attack 3, "no drain running")

Evidence:
- Today a registered-inbox send is posted by note-send itself (note-send.mjs:900-916). The timer is not in the path, so a dead timer costs nothing for these notes.
- With a hold, release happens only in a drain: the timer, or some other note-send's piggyback on the same host. An idle lead has no hook events, so its UserPromptSubmit, PostToolUse and Stop hooks never surface the note. A held RESULT to an idle lead on a host whose timer is dead is never read. That breaks GOALS.md:18 with no bound at all.
- A dead timer is a known state here: the heartbeat exists to detect it (note-flush.mjs:131 `HEARTBEAT_STALE_MS` 5 min; :219 `readHeartbeat`; :373-377 staleness judged on `timer_at`, "never on a piggyback ... on a machine whose one-minute timer is dead").

Fix. Add to N2:

> N2b. A hold is placed only while the timer is alive, meaning `flush-last.json`'s `timer_at` (readHeartbeat, note-flush.mjs:219) is younger than `HEARTBEAT_STALE_MS` (:131). If the heartbeat is missing, unreadable or stale, the note posts at once (today's behaviour), and one `wave-off [*] -> <slug> — timer stale` line is logged on change. The same check runs in the drain: an entry already held while the timer is stale is released on the next drain of any mode. Test: a stale heartbeat with wave.json listing the slug gives an immediate post through `deliverToInbox`.

Predicted outcome: a dead timer degrades to today's behaviour instead of silent stranding.

---

## M1 MAJOR: a cap of 30 leaves no margin under the 30-minute unread rule; measure the hold from the outbox `createdAt`, not the ledger time (attack 3: skew, crash)

Evidence:
- GOALS.md:18 counts unread time. The hold cap alone uses the whole budget, and three delays stack on top of it:
  - timer granularity, up to 1 minute;
  - a release that crashes after `claimOutboxEntry` returns to the outbox only after `STALE_CLAIM_MS` = 5 min (transport.mjs:1129, :1136);
  - the lead's own turn start after the post.
- Worst case at cap 30 is over 36 minutes.
- The ledger time is minute-resolution local wall time with a zone label (envelope.mjs:30). It is written by whichever clock built the envelope, and "hold from ledger time" needs `envelopeInstant` parsing. The outbox `createdAt` (transport.mjs:1057) is an ISO stamp from this host's clock, the same clock the drain reads.

Fix. Replace the N1 cap sentence and the N2 first sentence with:

> N is capped at 20. A value over 20 is used as 20 and logged on change (see m4). For a listed recipient, a note's wake-up is held for up to N minutes from its outbox entry's `createdAt` (transport.mjs:1057, this host's clock). An entry whose `createdAt` is unparseable or later than now is released at once. Worst case: 20 (hold) + 1 (timer) + 5 (stale-claim recovery after a crashed release) = 26 minutes, under 30.

N6 test 3 becomes: "with N = 45, a note is released at 20 with the cap logged."

## M2 MAJOR: the release list holds the owner's Done-tick and the collector's stall nudges; hold RESULT only (attack 3, release list)

Evidence:
- The Done-tick is `--kind ASK --needs ack` (decisions-pickup.mjs:27-28, :536-545). Under N2 ("an ASK whose Needs is not decision or review" is held) it would be held. That delays Ben's decisions reaching the lead, and "hours ask to accepted" is the measure this lane must not worsen.
- Stall nudges are ASKs to the lead's slug (docs/census.md, "Wakes, Stop-blocks, stall nudges"). Holding a "your lane is stalled" nudge defeats it.
- `by` is free text (envelope.mjs:30), so "any note whose `--by` falls within the hold window" needs a parser (parseByTime, note-flush.mjs:1270) and a policy for text that will not parse. Dropping it removes a part.
- With `wake-all-kinds` present (transport.mjs:841, note-flush.mjs:668, note-send.mjs:422), ACK and FYI do post, and N2 does not say whether they are held.
- N6 test 2 ("a BLOCKED arriving while two notes are held releases all three in one post"): after B1, a BLOCKED goes through note-send's direct post. note-send's piggyback drain runs before its own post (note-send.mjs:581-595), so the held RESULTs are not in hand at that moment. Putting all three in one post would make the send path claim other outbox entries, which is extra parts.

Fix. Replace the release paragraph of N2 with:

> Only RESULT is held. ASK (any Needs), BLOCKED, and ACK/FYI when `wake-all-kinds` is present post at once, alone, as today. A RESULT still held for that recipient is not pulled into that post. The recipient's own hooks show it inside the turn the loud note opened, and N3's cursor check then retires it unposted. If the hooks do not show it, it releases at its own time.

Replace N6 test 2 with:

> a BLOCKED sent while two RESULTs are held posts at once, alone. When the recipient's cursor has since marked both RESULTs seen, the next drain retires them and posts nothing.

## M3 MAJOR: the R1/R2 flush.log read cannot be computed; every post carries one note today and direct posts leave no flush.log line (attack 2)

Evidence:
- note-send.mjs never calls `appendFlushLog` (no hit in the file). inbox-claude.mjs logs only in its CLI `main` (:246). A note-send direct post, which B1 shows is most wakes, leaves nothing in flush.log.
- The drain posts one outbox entry per `deliverInbox` call (note-flush.mjs:810-870). Its line is `<drain-start stamp> delivered [<id>] -> <slug> — inbox (claude-socket)` (:574-577): one note per line, with the drain's start time rather than the post time.
- So "for each wake, how many notes the post carried" is 1 by construction, and the direct-post wakes are missing. The 80-percent rule's "no other note to the same slug within 10 minutes" cannot be read from flush.log. The ledger has the times (minute resolution); the transcript has exact ones.

Fix: delete the second paragraph of R1 and the second paragraph of R2. The coalescing read moves into step 1 as W1b (M4), computed from the transcript's own wake lines, tested, and printing no text.

## M4 MAJOR: the 25-percent wake share is not the saving; with the 80-percent rule the spec can BUILD for at most about 5 percent (attack 1)

Evidence:
- A wake-opened turn's tokens include the work the note triggers (read the record, merge, dispatch). Coalescing two RESULTs into one turn still does both pieces of work. What it removes is the extra turn's fixed overhead: roughly the orientation request, the closing request, and the context re-read each of them pays.
- The window has 213 requests over 39 turns, about 5.5 requests a turn at about 189k each (fable-lead-census.md:21-22, :40; four-read.md:293). A merged wake saves on the order of 1 to 2 requests, not about 5.5.
- The two conditions multiply. Wakes carrying 25 percent, with only 20 percent of wakes having a neighbour, passes both rules, yet the most coalescing could save is the neighbours' share. That is about 5 percent of lead tokens as an upper bound, and less after the work is subtracted.
- Only RESULT is holdable (M2). Done-tick and ASK wakes cannot coalesce and must not count toward the saving.

Fix. Add W1b after W1:

> W1b. For the same window, simulate a hold of N = 10 minutes over the wake-opened turns whose wake envelope kind is RESULT (classifyWake returns the kind; capture it in ENVELOPE_LINE_RE, build-census.mjs:153) and which are not Done-ticks. In order of the wake line's timestamp, a wave starts at its first wake and takes every later such wake that arrives less than N minutes after the wave's start. `coalescableTurns` = those wakes minus waves. Print it with two token figures per model: the upper bound (the sum of the coalescable turns' tokens) and the lower bound (the sum of each coalescable turn's first deduped request). JSON: `lead.wakeSplit.coalescable = { holdMinutes: 10, turns, upperByModel, lowerByModel }`. W2's fixture adds a third, RESULT wake 4 minutes after the first, and asserts `turns: 1` and both bounds exactly.

Replace R2 with:

> R2. The read is claude-fable-5-1 only. If the upper bound of W1b is under 10.0 percent of the window's claude-fable-5-1 tokens, the lane is NO-BUILD. Step 1 merges as a measurement, and the RESULT quotes the wake share, the coalescable turns, and both bounds. That is a first-class result, not a failure. Otherwise step 2 is built, and the RESULT quotes the same numbers, the lower bound being the saving to expect.

The 25.0 figure stays printed as context, not as the gate. (The 10.0 threshold is the lead's to set. The point is that the gate is on coalescable tokens, not the wake share.)

## M5 MAJOR: the leading-edge hold delays every isolated RESULT by N with no saving; the latency cost must be measured (attack 5)

Evidence:
- GOALS.md:16 cites "29 percent lead dispatch latency". GOALS.md:18 counts "orchestrators idle awaiting a nudge" as work stalled. A 10-minute hold on an idle lead is exactly that, for every RESULT, including the isolated ones that coalesce with nothing.
- The spec's own NO-BUILD reasoning expects many wakes to be isolated. Every one of them pays up to 10 minutes of dispatch delay for zero saving.

Simpler-and-safer alternative, considered. A per-slug minimum interval between posts (trailing debounce): the first RESULT to a slug posts at once; a RESULT that arrives within N minutes after the last post to that slug is queued and released at last-post + N, together with anything else queued. Isolated notes then pay no delay, and bursts still coalesce, except that each burst keeps one extra post. It needs one more part: a stamp `~/.agents/notes/.last-post-<slug>` written by `deliverToInbox` on a delivered post (missing means post at once, which fails open). It is safer, not simpler, so I do not mandate it. The Stop-hook alternative does not apply: an idle-lead wake never passes through the Stop hook, and hooks/ is out of territory anyway.

Fix, whichever design is kept. Add to N6's measure-after (and to the RESULT):

> Every release line carries the hold age of each entry (m4). The after-read prints the median and the maximum hold age of released RESULTs from flush.log, next to wakes per hour. A median hold above 5 minutes with fewer than 1.5 notes per released post means the hold is costing dispatch time without saving turns, and the lead sets holdMinutes lower or switches to the debounce.

## M6 MAJOR: the token count cannot see cost; a hold can turn warm cache reads into cold cache writes (attack 1)

Evidence:
- In the window, cache_creation is 683,680 over 39 turns, about 17.5k a turn, against about 189k of context a request (fable-lead-census.md:40). Today's wake turns mostly start warm.
- Under the 5-minute default prompt-cache lifetime, a note that today posts 3 minutes after the lead went idle lands warm. Held to 10 minutes, it lands cold and rewrites the whole context as cache_creation. That is priced at about 1.25x input, against 0.1x for a read, so roughly 12x a read per token.
- The spec's measures sum all four columns equally, so this change reads as neutral or better while costing more.

Fix. Add to W1:

> The wake side and the other side each also print `cache_creation_input_tokens` per turn.

And to step 2's measure-after:

> cache_creation per wake-opened turn must not exceed its step-1 value by more than the cache_read saved per coalesced turn divided by 12; the RESULT quotes both.

---

## m1 MINOR: the kill-switch names contradict each other (N4)

Evidence: `switchedOff(name)` (skills/decisions/scripts/project-config.mjs:57-61) checks `$AGENTS_HOME/ws-off` and `ws-off-<name>`, never `no-wave`. Every other switch in the repo is `ws-off-<feature>` (note-flush.mjs:1267 `ws-off-overdue`, README.md:148, :373-374). `switchedOff` also reads `process.env`/`homedir()`, not the drain's injected `home`. docs/census.md has no switch wiring today.

Replace N4:

> N4. Kill switch: `~/.agents/ws-off-wave`, and the master `~/.agents/ws-off`, disable holding for every slug. The check uses note-flush's own `switchActive` against the injected home (the same shape as `overdueKillSwitchPath`, note-flush.mjs:1267), and is logged on change (m4). docs/census.md names it in one line beside the wake split.

## m2 MINOR: W1 needs pinning so the split is exact and self-checking (attack 1)

Evidence: runs start at the first assistant line after a non-tool-result user line (build-census.mjs:409-430), and classifyWake runs on the same pass (:397). Several things are left open:
- which user line is "opening" when several sit between two runs;
- how a run that straddles `--from` is tagged;
- what "top-tier" means (the census has no such notion);
- how the Codex JSON reads.

Two things are fine as they stand. Deduped attribution is safe if the tag rides on the entry, last line wins (:297-320). A mid-turn delivery is a `queued_command` attachment that neither breaks a run nor counts as a wake (docs/census.md:244-247), so busy-turn deliveries are not double-counted.

Replace the W1 definition sentences with:

> A wake line (classifyWake) sets a pending flag. The next assistant line that starts a run (the leadTurns rule, build-census.mjs:409-430) tags that run wake-opened and clears the flag. Any other run is "other". A Stop-block feedback line (classifyStopBlock form `feedback`) likewise tags the run it opens as `stopBlock`. Stop-block turns are printed as a third bucket: they are note-driven but untouched by a hold. Each deduped entry carries its run's tag, last line wins. Invariants, asserted in W2: `wakeTurns + stopBlockTurns + otherTurns == leadTurns`, and per model and per column `wake + stopBlock + other == windowByModel`. Shares are printed per model (`shareByModel: {<model>: {wake, stopBlock, other}}`, percent, one decimal, `Math.round(x * 1000) / 10`). R2 reads the claude-fable-5-1 entry; no model name is hardcoded in the census. For a Codex lead, JSON `lead.wakeSplit` is `null` with `lead.wakeSplitUnavailable: "codex lead"`, and the markdown prints `wakeSplit: unavailable (codex lead)`.

## m3 MINOR: N3 matches the drain, but only if the hold check comes after the cursor retirement (attack 3, N3)

Evidence: note-flush.mjs:723-731 retires an entry whose id is in the recipient's cursor `seen` (not `cold`, :~615-624) before `live` is built. This happens in every pass, so a held entry the lead's hooks have shown in the meantime is retired, not posted. That is correct, provided the hold check is placed after :723 (B2's placement). note-send's direct path has no cursor check and needs none.

Add to N3:

> The hold check runs after the cursor retirement (note-flush.mjs:723), so a held entry already shown is retired unposted. At release, entries the cursor has passed are left out of the wave; if all have been passed, nothing is posted.

Add an N6 test: "a held RESULT marked seen in the recipient's cursor before its release is retired, and nothing is posted."

## m4 MINOR: logging volume, and the wave post format (N1, N4, N7)

Evidence: "logged once per drain" means about 1,440 timer lines a day plus one per note-send while a switch or an over-cap value is present. The file's own rule is to log on change (note-flush.mjs:869, :889-925 "C3"). There is also no line format for a multi-note post, so the after-measures (notes per post, hold age) cannot be read.

Add to N2:

> A release is one line: `<stamp> delivered-wave [<id>,<id>] -> <slug> — inbox (claude-socket), <k> notes, held <s1>s,<s2>s`. The ids are oldest first, and the held seconds run from each entry's `createdAt` to the post. The cap, the kill switch and a stale timer are each logged on change, not per drain.

N7 then reads "one `delivered-wave` line with 2 notes".

## m5 MINOR: hold claude-socket recipients only; say how a multi-note release is claimed

Evidence: a multi-line post to a Codex queue is not a wake by the census's own rule (classifyCodexWake requires one single-line `input_text`, build-census.mjs:223-235), and inbox-codex queues "one line" (inbox-codex.mjs:235). A wave post is several entries in one post, and the current code claims, posts and retires one entry at a time (note-flush.mjs:827-866).

Add to N1:

> A wave.json entry applies only to a slug registered as `claude-socket`; a `codex-queue` slug posts as today.

Add to N2:

> A release claims every entry of the wave (a lost claim drops that entry from this wave), posts once, and retires every claimed entry on `delivered`. On any other outcome it rewrites each with one attempt counted. A crash after the post and before the retire returns the claims after `STALE_CLAIM_MS`, and a duplicate wave is possible, the same class as today's single-entry case.

Hold state: add to N2:

> There is no new state file. The outbox entry is the hold, decided each pass from `createdAt`, wave.json, the switch and the heartbeat, so it survives a crash or restart unchanged.

---

## Verified clean (no defect)

- ACK/FYI are ledger-only in the current code, as N2 says. note-send creates no outbox entry and no post for them (note-send.mjs:422, :859-893), and the drain retires any queued ACK/FYI unattempted (note-flush.mjs:668-675). The one exception is `wake-all-kinds`, covered in M2.
- The piggyback budget is not a hazard for a release. A wave is one claude-socket post, and its start floor is 750 ms (note-flush.mjs:105) against the piggyback's 3,000 ms (:1644-1648). An under-budget pass skips without counting (:815-823).
- W1 can be computed from the existing units in one pass, with no text kept: runs, wakes and deduped entries all come from the same loop in `censusLeadFile`. Hook-surfaced notes (attachments) never open a run, so they are neither missed nor double-counted as wakes. The only note-driven openers besides wakes are Stop-block feedback lines, which m2 splits out.
- A sleeping host is not a new risk: the lead on that host sleeps too, and the first timer drain after resume releases anything due. Clock skew is closed by M1 (local `createdAt`, future stamps release at once).
