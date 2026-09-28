# Lane 38 contracts: the marker strings the plugin prints (verbatim), with file:line

Read against worktree C:/Users/benzh/Code/census-completeness/wt at 3d10e8c. Line numbers are that tree's.

## 1. Note-flush wake (the turn a peer note starts)

Producer: `skills/multi/scripts/note-flush.mjs` drains the outbox and calls `deliverToInbox` (note-flush.mjs ~815-830), which posts the envelope line through `skills/multi/scripts/inbox-claude.mjs`.

- Frame sent to the session socket: `{"type":"user","from":"note-flush","message":{"content":"<envelope line>"}}` (inbox-claude.mjs:17 comment, :74-82 code; `DEFAULT_FROM = 'note-flush'` at :54).
- What the transcript records (verified in the lead transcript 588290d9, 17 entries): a `type:"user"` line, `isMeta:true`, `origin: {"kind":"peer","from":"note-flush"}`, whose text is Claude Code's own prefix `Another Claude session sent a message:` + newline + the plugin's envelope line.
- The envelope line is the plugin's text: `ENVELOPE_RE` in `skills/multi/scripts/envelope.mjs:29-30`, built at envelope.mjs:~160:
  `<from> → <to>, <M.D.YY> <HH:MM> <TZ> [<id>( re <id>)?( supersedes <id>)?] <KIND>: <body>...`
  with `ARROW = '→'` (envelope.mjs:24) and KIND in `ASK|ACK|RESULT|BLOCKED|FYI`.
- Census marker (wake): a top-level `type:"user"` transcript line that is not tool_result-only, whose text STARTS with `Another Claude session sent a message:` and whose next line matches the envelope shape above, and whose `origin`, when present, is `{kind:"peer", from:"note-flush"}`.

## 2. Done-tick line (the pickup note for a ticked Done)

Producer: `skills/decisions/scripts/decisions-pickup.mjs` `sendInputs`, lines 536-546:
- text (line 539): `` `Owner decisions pickup round ${round} is ready` `` (envelope `terminate()` adds the final period, envelope.mjs `terminate`).
- id (lines 537-538): `${from}-decisions-${projectScope}-${round}`, `projectScope` = 64 hex chars (decisions-pickup.mjs:116).
- kind `ASK` (:27 `NOTE_KIND = 'ASK'`), needs `ack` (:28).
- It reaches the lead exactly as a note-flush wake (section 1), so on the wire it is
  `<from> → <owner>, <date> <time> NYC [<from>-decisions-<64 hex>-<round>] ASK: Owner decisions pickup round <N> is ready. Details: <path> Needs: ack`
- Census marker (Done-tick): a wake (section 1) whose envelope id matches `-decisions-<hex>-<digits>` and whose body is `Owner decisions pickup round <digits> is ready.`

## 3. Multi-inbox Stop hook block

Producer: `hooks/multi-inbox.js` `Stop` -> `handleStop` in `hooks/multi-hook-core.mjs:~305-316` -> `blockOutput(result, STOP_REASON, STOP_LIMIT)` (multi-hook-core.mjs:136-142).
- Block reason text = `summarise(...)` (core:46-64) + `\n\n` + `STOP_REASON`.
- Header line (core:55): `<N> new peer note(s) for <slug> (the multi skill; the ledger is the channel):`
- Trailer (core:61-62): `Read the packet before acting. ACK an ASK you take, or send BLOCKED with the reason. Never re-send an id someone else sent, and never wait on a peer inside this turn.`
- `STOP_REASON` (core:144-145), verbatim:
  `Handle these before you stop: ACK what you are taking, answer what you can, or send BLOCKED with the reason. If none of it is for you, say so in one line and stop.`
- How Claude Code records one block (verified in session 9c61c35a, line 10007-10010), three lines per block:
  1. `type:"user"`, `isMeta:true`, content string beginning `Stop hook feedback:\n` + the reason text;
  2. `type:"attachment"`, `attachment.type:"hook_blocking_error"`, `attachment.hookEvent:"Stop"`, `attachment.blockingError.blockingError` = the reason text, `attachment.blockingError.command` containing `multi-inbox.js`;
  3. `type:"system"`, `subtype:"stop_hook_summary"`.
- Census marker (Stop-block): a transcript line of form 2 (or, when a transcript has form 1 without form 2, form 1) whose reason text contains the exact `STOP_REASON` sentence. Text elsewhere (assistant prose, tool_result content, a human prompt) that merely contains the sentence is not a block.

## 4. Stall nudge received

Producer: `scripts/collect-status.mjs` `buildStallTopic` (:~262 `stall-${slug}-${sha7}`), id `${from}-${topic}-${n}` where `from` is the collector's sender (`collect-<host>`), so an id looks like `collect-<host>-stall-<branch-slug>-<sha7>-1`; kind ASK, `to` = the record's `Owner:`.
- Census marker: a line in `<repo>/docs/ledger/*.md`, parsed by four-read's ledger line shape, whose id matches `^collect-.+-stall-` and whose `to` equals the lead's slug, timestamped inside the window.
