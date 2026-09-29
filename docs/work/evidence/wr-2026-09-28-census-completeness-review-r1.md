VERDICT: NEEDS_FIXES 1c41ce7d52ff38a23934cd3a8cffdd3c786bf989

# Lane 38 census-completeness: adversarial review, round 1

Reviewed: origin/main...origin/build/census-completeness-1 at 1c41ce7d52ff38a23934cd3a8cffdd3c786bf989 (fetched; worktree HEAD equals the branch tip, clean). Read-only: nothing in the worktree was written. Mutations ran on a `git archive` copy in my scratchpad and were restored after each run (diff -q confirmed).

Four findings need fixes: one MAJOR, three MINOR. There are four INFO notes. The code's counting is correct on every real transcript I could read. The MAJOR finding is about scope: the prediction and one census.md sentence do not hold for a Codex-led lane.

## Verified clean (first-class findings)

- **Marker strings match the plugin.** I checked each one in the source myself:
  - `STOP_BLOCK_REASON` (build-census.mjs) equals `STOP_REASON` at hooks/multi-hook-core.mjs:144-145, and a test pins it to the export.
  - `PEER_HEADER_RE` matches `summarise` at multi-hook-core.mjs:55. `blockOutput` (:136-142) builds the reason as summary + `\n\n` + STOP_REASON.
  - `ENVELOPE_LINE_RE` is `ENVELOPE_RE` (skills/multi/scripts/envelope.mjs:29-30) minus the tail groups, with the same ARROW.
  - `DONE_TICK_*` matches decisions-pickup.mjs:536-546: the id is `${from}-decisions-${sha256 hex}-${round}` (sha256 is hex at :39-41), and `terminate()` (envelope.mjs:136) adds the final period.
  - `--no-type` still queues the wake for note-flush (note-send.mjs:974-980), so a Done-tick does arrive as a note-flush wake.
  - The `note-flush` origin matches inbox-claude.mjs:54, :71.
- **The markers are exact on real data.** I ran the branch's own `classifyWake` and `classifyStopBlock` over all 101 lead transcripts on this host modified since 9/15:
  - All 111 `origin:{kind:peer,from:note-flush}` user lines classify as wakes.
  - None of the 915 teammate-message lines (`Another Claude session sent a message:\n<teammate-message …>`, no origin) counts. Neither do the 6 subagent-peer lines, whose origin.from is an agent id.
  - Session 9c61c35a has 5 hook_blocking_error Stop attachments and 5 `Stop hook feedback:` lines, so max() counts 5 blocks, not 10. The 5 `stop_hook_summary` system lines and one tool_result line that contain the sentence count nothing.
  - No wake text is ever duplicated inside a file (every text hash occurs once).
- **The live numbers reproduce.** I reran `build-census.mjs --lead 588290d9….jsonl --from 2026-09-28T03:06:46Z --to 2026-09-28T10:28:19Z --ledger-dir C:/Users/benzh/Code/claude-delegation/docs/ledger --lead-slug skills-o`. Then I ran `four-read.mjs --record docs/work/wr-2026-09-27-autolink-guard.record.md --census <that json> --ledger … --lead-slug skills-o`. The L row matches the builder report byte for byte: `…; wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-o`. My hand check:
  - The one in-window wake is at 03:58:12Z.
  - The transcript has no Stop-block lines at all.
  - The Windows ledger has no `[collect-…-stall-…]` id. The only `collect-*-stall-*` text is inside the RESULT at 2026-09-28.md:17 (`skills-n-lane-43-2`), and it is correctly not counted.
- **Read-only holds.** No new log, no new hook, no hooks/ change. build-census writes only `--out`/`--json`, as before.
- **four-read prints all three numbers in the L row,** after the leading integer. work-record.mjs:743-744 still parses only that integer, so the stall-word gate is unaffected.
- **census.md defines each count with its marker and file:line.** The Codex horizon paragraph is untouched.
- **The territory holds.** The changed files are docs/census.md, build-census.mjs and four-read.mjs with their tests and fixtures, and the lane's own record. The merge into current origin/main (357fc15) is clean (`git merge-tree`), and main has not touched these files since base 8b8c2f0.
- **Tests:** the four touched files give 197 pass, 0 fail. Mutations on the scratch copy:
  - Each of these made at least one test fail: dropping the origin check, summing the two Stop-block forms instead of max, the slug filter, the window, the lower and upper window bounds, wakes/Stop-blocks/doneTick unwindowed, prefix-anywhere instead of starts-with, a loosened Done-tick id, a loosened Done-tick body, the multi-inbox command check, the hookEvent check, the reason check, dropping the four-read suffix, and a widened four-read nudge window.
  - Two mutants survived but change nothing: removing `isToolResultOnlyUser` from either classifier, because `userText` already ignores tool_result content.
  - One mutant survived and is a real gap. See F4.

## Findings

### F1 MAJOR: Codex-led lanes fall outside the prediction, and census.md gives the wrong reason for skipping Codex wakes

- Evidence:
  - docs/census.md:227 says "A Codex lead is not read for wakes or Stop-blocks (its rollout carries no hook records)".
  - A Codex wake is not a hook record. note-flush delivers it through `codex queue`, and it runs as "a real turn" (skills/multi/scripts/inbox-codex.mjs:4-7). The rollout records that as a user turn whose text is the envelope line.
  - build-census has no Codex path for wakes or stall nudges: `runCodexCensus` returns no `stallNudges`.
  - four-read therefore prints `wakes unavailable (the census does not read Codex wakes or Stop-blocks)` for any Codex census (four-read.mjs `computeCompletenessSuffix`).
  - The acceptance prediction is "the bundle's 9/29 check reads all three numbers for every lane of this bundle without a hand count". Lane 37 is Codex-led, so that prediction is false by construction.
  - I could not open a Codex rollout that holds a queued note. The one local rollout has none. The ssh config lookup to Netcup was denied by the secret guard, and I did not work around it.
- Fix: pick one and say which in the record.
  - (a) Count Codex wakes. In `runCodexCensus`, count user-turn records whose text is exactly one line matching `ENVELOPE_LINE_RE`, windowed like the tokens. First check the record shape on a Netcup rollout that received a queued note. Stop-blocks stay unavailable unless the rollout records the Stop hook's block. Also add `stallNudges: computeStallNudges(opts, lead, fsImpl)` to the Codex report, since the ledger does not depend on the host.
  - (b) Keep the scope. Correct the reason at census.md:227. Have the record restate the prediction as "all three numbers for every Claude-led lane; lane 37's wakes and Stop-blocks print unavailable by a stated limit". Put the Codex gap on Ben's page as a follow-up.
- The minimum to pass: (b). This is the patch for census.md:227-229.
  - Current: `subagent transcript. A Codex lead is not read for wakes or Stop-blocks (its rollout carries no\nhook records): those fields are absent and `four-read.mjs` says so.`
  - Replacement: `subagent transcript. A Codex lead is not read for wakes or Stop-blocks: a Codex wake is a queued turn (`inbox-codex.mjs`), not a hook record, and this census has no reader for it yet, so those fields are absent and `four-read.mjs` prints them as unavailable. Stall nudges for a Codex lead are still counted by `four-read.mjs` from the ledger.`
  - Check the exact existing line wrap before applying.
- Predicted outcome: with (b), the 9/29 check's expectation matches what four-read prints for lane 37. With (a), lane 37 gets a real wake count.

### F2 MINOR: census.md:324-326 still says the census does not read message text

- Evidence: census.md:324-326 reads: "Secrecy: the file never reads `message.content` except to test membership of `--marker` … output is numbers, model names and file basenames only." The branch now reads `message.content` in `classifyWake`/`classifyStopBlock` (build-census.mjs:176, :196). It also prints slugs, ledger ids and the full `ledgerDir` path (`stallNudgesLabel`). The header comment in build-census.mjs was updated; this doc line was not.
- Patch:
  - Current: ``Secrecy: the file never reads `message.content` except to test membership of `--marker` `` / `inside a parsed line (a boolean-only, bounded-depth/width search) — output is numbers,` / `model names and file basenames only.`
  - Replacement: ``Secrecy: the file never prints `message.content`. It reads it only to test membership of `--marker` `` / `inside a parsed line (a boolean-only, bounded-depth/width search) and to match the plugin's own wake and` / `Stop-block markers, keeping a kind and a recipient slug, never the text — output is numbers, model names,` / `slugs, ledger ids, the ledger directory and file basenames only.`
- Predicted outcome: the doc matches the code and the build-census.mjs header comment.

### F3 MINOR: note-flush notes queued mid-turn are silently not counted and not documented

- Evidence: Claude Code records a note-flush delivery that arrives mid-turn as `type:"attachment"`, `attachment.type:"queued_command"`, `attachment.origin:{kind:"peer",from:"note-flush"}`, with `prompt` = the bare envelope line (no `Another Claude session…` prefix). In 9c61c35a these are 10 of the 79 note-flush deliveries: lines 11365, 19813, 21022, 21786, 24294, 25038, 27460, 29789, 29804, 29849.
  - Not counting them is right under the spec's "a turn that starts from", because they join a running turn.
  - But census.md:242-244 names only the UserPromptSubmit/PostToolUse hook context as "not a wake", and no fixture line covers this shape. A later "fix" that reads `attachment.origin` could start counting them unnoticed.
- Fix:
  1. Doc, census.md:242-244. After "A note that arrives inside a turn already running (the UserPromptSubmit and PostToolUse hook context) is not a wake: it did not start the turn." append: ` The same holds for a note-flush delivery Claude Code queues into a running turn (an `attachment` of type `queued_command` whose `origin` is note-flush): it joins that turn and is not counted.`
  2. Fixture: add one line to scripts/build-census.fixtures/completeness/lead.jsonl, inside the fixture hour and after 12:10Z so the window test is unaffected: `{"type":"attachment","timestamp":"2026-09-27T12:48:00.000Z","attachment":{"type":"queued_command","prompt":"skills-fable → skills-o, 9.27.26 08:48 NYC [skills-fable-fixture-9] ASK: Queued mid-turn.","commandMode":"prompt","origin":{"kind":"peer","from":"note-flush"},"isMeta":true}}`. It carries no usage, so the token goldens are unaffected.
- Predicted outcome: the existing exact-count tests stay green (wakes 2), and they now guard this shape.

### F4 MINOR: loosening the stall-nudge id regex fails no test

- Evidence: mutating four-read.mjs:596 `STALL_NUDGE_ID_RE = /^collect-.+-stall-/` to `/stall/` leaves all 14 completeness tests passing. No fixture ledger line addressed to skills-o has an id containing `stall` that does not start with `collect-`.
- Patch: append to scripts/build-census.fixtures/completeness/ledger/2026-09-27.md:
  `skills-fable → skills-o, 9.27.26 08:23 NYC [skills-fable-stall-review-1] ASK: A peer note whose topic is stall-review, not a collector nudge. Needs: ack`
- Predicted outcome: the existing assertions (count 1 for skills-o in 12:00-13:00Z, count 2 from 09:00Z) stay green on the real regex and fail on the loosened one. This line adds skills-fable as a sender, which `ledgerHasSlug` ignores for skills-o. Rerun four-read.completeness to confirm the `strangerSlug` case is unaffected.

## INFO (no fix required; for the record and the 9/29 check)

- **I1: the dispatching wake is never counted.** The note that dispatches a build lands seconds before `Opened:`: 588290d9 wake at 2026-09-28T03:06:13Z against Opened 03:06:46Z, and on 9/27 a wake at 06:19:21Z against the lane16 window start 06:20:18Z. The documented `--from <Opened:>` census convention (census.md:473) therefore excludes it every time. That matches number 1's window. Suggest one census.md sentence: "the note that dispatched the build arrives before `Opened:` and is not counted".
- **I2: windows differ after a re-accept.** Wakes and Stop-blocks use the census window (`--to <last accepted>` after a re-accept, per census.md:473-474). Stall nudges use `Opened:`..first accepted. This is documented at census.md:363-369. After a re-accept the three numbers cover different spans; aligning them would mean four-read filtering per-event timestamps the census would have to emit. Leave it unless a re-accepted lane shows a difference.
- **I3: typed wakes are uncounted.** When `MULTI_ALLOW_TYPING=1` (note-flush.mjs:632, a last resort that is off by default), a note typed into the composer is a human-shaped turn with no prefix and is not counted. Worth one clause in census.md if any host enables typing.
- **I4: the spec's grep over-counts; use four-read's count on 9/29.** The spec's bundle-level reader `grep -c 'collect-.*-stall-' docs/ledger/2026-09-2*.md` over-counts. On Windows it hits the lane-43 RESULT at docs/ledger/2026-09-28.md:17, whose id is `skills-n-lane-43-2`. This lane's id-anchored count correctly reads 0 there. The 9/29 check should read four-read's stall-nudge number, not that grep.
- **Test count:** the four touched files run 197 tests here. The builder's 215 likely included more files. Both show 0 fail.

## Fixture patches checked on the scratch copy

I applied both fixture patches, F3's queued_command line and F4's `skills-fable-stall-review-1` line, to the scratch copy:
- On the branch's code, the four touched test files give 197 pass, 0 fail.
- With the F4 line in place, the loosened `/stall/` mutant now fails 7 of the 14 completeness tests.

The scratch copy was restored afterwards.
