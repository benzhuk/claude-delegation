# Census tools (L-C9, L-C10)

Two read-only tools for measuring one loop-build run against another (spec.md
`spec-outline.md`'s "now vs then" goal, the same measure the speed census needed to be
repeatable): `scripts/build-census.mjs` (turns and tokens over a lead transcript and its
subagents) and `scripts/work-census.mjs` (elapsed time and rounds over the work-record
ledger). Both follow this repo's `scripts/token-census.mjs` pattern:
`parseArgs(argv)`, `async main(argv, {fsImpl, now, write})`, a win32-safe `isMainModule()`
guard. Neither prints transcript or record prose — only counts, model names, work ids and
file basenames.

## `build-census.mjs`

```
node scripts/build-census.mjs (--lead <session.jsonl> | --lead-session <id>) [--codex-home <canonical-home>] [--tasks <dir>]... [--role-map <json>] [--marker <text>] [--from <iso>] [--to <iso>] [--ledger-dir <dir>] [--lead-slug <slug>] [--out <path>] [--json <path>]
```

Worked example, run against the committed fixtures (this is gate-10's own invocation —
run it twice and the two outputs must be byte-identical):

```
node scripts/build-census.mjs --lead scripts/build-census.fixtures/lead.jsonl --tasks scripts/build-census.fixtures/tasks
```

- `--lead` — one Claude Code or Codex lead session transcript (`.jsonl`). Required unless
  Codex identity mode supplies `--lead-session`. In identity mode the configured
  `--codex-home` canonical `sessions/year/month/day` tree is walked once and the id is
  verified from `session_meta.payload.id`; a filename match is never identity proof. If
  both options are present they must identify the same logical session. For every Codex
  run, including legacy `--lead` without `--lead-session`, same-id rollout segments found
  inside that mode's discovery scope are unioned, exact aliases do not add usage, and conflicting usage for one
  response id is refused. Equal-usage duplicates with conflicting model attribution make
  the model field unsupported; conflicting timestamps make temporal coverage partial; and
  conflicting turn ids make the response timeline unsupported. Exact token observations
  remain countable in all three attribution-conflict cases.
  Codex is detected from a verified `session_meta` record. It sums only response-local
  `token_usage_record.payload.usage`, deduplicated by logical session id plus response id;
  cumulative turn/thread snapshots are never added. The preceding `turn_context` supplies
  each response model. Native `input_tokens` already includes cache input, so every Codex
  model aggregate exposes `native_input_tokens` and an independently calculated
  `derived_total_tokens = native_input_tokens + output_tokens`. The legacy additive input
  split is emitted only when both cache fields are present. Missing cache, reasoning, or
  raw `total_tokens` fields stay `null` and are named in that aggregate's `unavailable`
  array; they are never converted to zero, never double-counted, and do not by themselves
  invalidate the derived total. A missing model context is `unknown` and makes coverage
  partial. A unique native `task_started.turn_id` is a Codex user-turn counter.
  Legacy discovery reads only the configured canonical Codex home in the lead's UTC date
  folder and the following date folder. It verifies each child edge through
  `source.subagent.thread_spawn.parent_thread_id`, follows depth at most three, and checks
  that all usage rows use the lead root session namespace. `--tasks` adds explicit rollout
  files after the same checks; it never replaces default discovery. The report exposes
  `lead.sessionId`, discovery candidates/exclusions, coverage status, and every child’s
  role, nickname, parent id and depth. It also exposes a window-filtered, response-id
  deduplicated lead-only `lead.codex.responseTimeline` containing only response id, turn
  id, timestamp and model, plus `responseTimelineComplete`; prompt/content and raw usage
  are never copied into that metadata timeline. Complete coverage emits `VERDICT: COUNTED` and a
  combined aggregate; malformed, unreadable, out-of-horizon, unverified, over-depth, or
  unknown-model evidence emits `VERDICT: PARTIAL` with observed subtotals and unavailable
  reasons. `--from`/`--to` accept offset-bearing inclusive timestamps for Codex and retain
  model context before the window.

  Known-id discovery reads every existing canonical date folder, proves descendant ancestry
  transitively to depth three, and reports the finite read snapshot in
  `lead.codex.discovery.scope`. Shell-launched `codex exec` runners, other Codex homes and
  other hosts are outside this session graph. Temporal completeness and field support are
  independent: `VERDICT: COUNTED` means the requested historical window has a readable
  discovery snapshot and an end witness for every selected logical session, and may include
  `UNSUPPORTED <field>` on that line. `lead.codex.fields` reports stable status for model,
  native token fields, derived totals, turns, responses, wakes, Stop-blocks, nudges and
  stalls. Missing native evidence stays unavailable rather than becoming zero. Native input
  includes cached input; derived total is input plus output, while reasoning output remains
  a subset of output. `lead.coverageSupported` additionally requires counted input, cached
  input, output, model and derived-total fields. A valid row after `--to`, or a matching
  terminal `task_complete` at logical-session end, witnesses a closed historical window;
  damaged tails and open unbounded runs remain PARTIAL while preserving observed subtotals.
- `--tasks` — a directory of subagent transcripts (`.output`, and `.jsonl` for forward
  compatibility — `.output` is the extension real subagent task directories actually use).
  May be given more than once; every file across every given directory is counted, each
  exactly once — a directory given twice, or a file reachable through two directories (a
  symlink, in real life), is de-duped by its resolved real path, not by its nominal path.
  Optional: when omitted, the default subagents glob below may still supply files.
  For Codex, a missing or unreadable explicitly named directory is required evidence and
  makes coverage partial, including `ENOENT`, `ENOTDIR` and `EACCES`. A missing default
  next-day session folder remains the normal no-files case.
- **Default subagents glob** — when `--lead <session.jsonl>` is given, the script also
  globs two locations, needing no `--tasks` flag at all (`<lead session id>` is the
  lead's basename with `.jsonl` stripped):
  - `<dirname of lead>/<lead session id>/subagents/agent-*.jsonl` — the lead's own
    Task-tool subagents.
  - `<dirname of lead>/<lead session id>/subagents/workflows/<runId>/agent-*.jsonl`, one
    directory PER RUN — the Workflow tool's own agents (a loop build's builders,
    reviewers and integrator), each run directory carrying its own `journal.jsonl`
    beside its agent files (see "Roles" below). Without this, a loop build's by-role
    table comes back with no build/review/integrate rows at all — everything the
    Workflow tool ran lands one directory below where the plain default glob stops.
  Unlike an explicitly-named `--tasks` dir (unreadable is an error, never a silent zero
  — see below), a MISSING default dir (either the base `subagents/` or `workflows/`) is
  the common case (most lead sessions spawn no subagents, or spawn Task-tool subagents
  only) and contributes zero files without complaint. **Missing (`ENOENT`) is the only
  error this silence covers.** Any OTHER error enumerating a default dir — `EACCES`,
  `EPERM`, `ENOTDIR`, `EMFILE` — means a real source exists but could not be
  listed; that dir is reported by path under `unreadableDirs`, and the whole census is
  marked `INCOMPLETE` in both the VERDICT line and the JSON's `subagents.incomplete`
  flag, exactly like an individual unreadable subagent FILE already was — a directory
  that can't be read is never silently zero, and `accept --census` refuses an
  `INCOMPLETE` census outright (`census-incomplete`; `--no-census "<reason>"` is the
  explicit escape).
  - **De-dup across sources, mechanically:** every file counted through any `--tasks`
    dir or either default glob is de-duped by BOTH its resolved real path and its
    filesystem inode (`dev`+`ino`). Real path alone catches a symlink or the same
    directory named twice; it cannot catch Claude Code's own `tasks/<id>.output`, which
    is a **hardlink** to `subagents/agent-<id>.jsonl` (two distinct real paths, one
    inode) — the exact shape this section's `--tasks <tasks dir>` example produces
    alongside `--lead`. On a collision the default glob's `agent-<id>.jsonl` copy is
    kept over an explicit `--tasks` dir's `<id>.output` alias (the name journal.jsonl
    and `--role-map` both key off).
- **A `skills/team-build/scripts/review-run.mjs` child is not a subagent of any lead
  (lane 53).** Its transcript is `<CLAUDE_CONFIG_DIR or ~/.claude>/projects/<mangled run
  worktree path>/<session>.jsonl` on the review host, not under any lead's
  `subagents/` folder, so neither `--lead` nor either default glob above ever counts it.
  Count it separately with `build-census.mjs --lead <that file>` (it is a valid lead
  transcript on its own, never a subagent one). The identity sidecar review-run writes
  beside its report also carries the child's own `result`-event `usage`, `modelUsage`,
  `total_cost_usd`, `num_turns`, `duration_ms` and permission-denial count, so a reader
  who only has the sidecar (no separate census run) still sees the token cost. This gap
  is named, not hidden: a Codex lead's own census undercounts its review tokens by
  exactly this child's total until someone runs the separate `--lead` count.
- `--role-map <json>` (optional) — inline JSON, `{"agent-<id>": "<role>"}`, mapping a
  subagent file's basename with its extension stripped (e.g. `agent-a5759bed32340205d`)
  directly to a role string. See "Roles" below.
- `--marker` (optional) — a substring; the "window" starts at the first line containing
  it (a bounded-depth/width search — it is never printed) and runs to the end of the lead
  file. Without `--marker`, the window is the whole file. A `--marker` that matches
  nothing in the lead file throws (`--marker text not found in <basename> (window would
  be empty)`) rather than silently printing a confident zero for both the window turn
  count and the combined split — the exact shape a reader skims first.
  A `--marker` windows more than `windowTurns`: `leadTurns` (see below) is windowed too
  (`leadTurnsTotal` keeps the whole-file count alongside it, for comparison), and every
  subagent file's turns are filtered to drop any entry timestamped strictly before the
  window's start — reported per file as `excludedByWindow` and named in the markdown
  report — so a persistent lead pane (one session across several builds) doesn't report
  session-wide numbers as if they were this build's. An entry with no timestamp is
  unknown, never dropped as a guess; when the window's own start timestamp can't be
  established (the marker-matching line carries none, and neither does any line before
  it), nothing is excluded at all.
  Codex resolves the marker once in the lead and applies that timestamp boundary to every
  verified child. Children do not need to repeat marker text. A response whose timestamp
  is unavailable at a required boundary makes coverage partial rather than being guessed
  into or out of the window. The effective interval (including an implicit end for an
  unbounded or marker-only run) must fit the reported two-day discovery horizon.
- `--from`/`--to` (optional, four-number-read spec.md Territory R1 item 3) — a SECOND,
  independent windowing mode: a plain ISO timestamp range instead of a marker match.
  Mutually exclusive with `--marker` (given together, both throw). Messages outside
  `[--from, --to]` are not counted; a window covering the whole file equals the
  unwindowed run. This is the mechanism `scripts/four-read.mjs` uses for the spec
  writer's token slice: `build-census.mjs --lead <spec session> --from <Spec-from> --to
   <Opened>`, its output file stored next to the record. Codex applies the same inclusive
   timestamp bounds to native response records while retaining preceding model context.
- `--out` (optional) — write the full markdown report there; without it (and without
  `--json`), the report goes to stdout. Nothing else reaches stdout (with `--out` and/or
  `--json`, only one `wrote: <path>` line per file written does).
- `--json` (optional) — write the same report as deterministic JSON (object keys sorted
  recursively, so two runs over the same input are byte-identical) to this path,
  independently of `--out`.
- `--ledger-dir` (optional) — the peer-note ledger directory the stall-nudge count reads. Default:
  this repository's own `docs/ledger`, found from the script's location.
- `--lead-slug` (optional) — the lead's note slug, whose `collect-*-stall-*` ASKs are counted.
  Default: the recipient the lead transcript itself names most often (wake envelopes, Stop-block
  and hook-context headers); the report says `slugSource: inferred`. A lead that was never sent a
  note and gave no slug reports the stall-nudge count as unavailable, never zero.

### Roles

A subagent file's role comes from two sources, in this order:

1. **The Workflow tool's own journal** — `journal.jsonl`, the Workflow tool's own output
   file, written at its real location (`subagents/workflows/<runId>/journal.jsonl`, next
   to that run's agent files — never something this repo commits in production). Every
   line that carries `agentId` and `label` labels one agent:
   `{"type":"started","key":…,"agentId":"<id>","label":"<label>",...}`, where `<id>` is
   that agent's file basename with a leading `agent-` and its extension stripped (file
   `agent-w1.jsonl` → id `w1`). Other line shapes the journal actually contains
   (`{"type":"launched"}`, a `result` line with no `label`) are read and skipped, not
   treated as an error — `readJournal` only ever looks at `agentId`/`label`, never
   `type`. When a journal entry matches, the role is the label's segment before its
   first `:` — `build:T1:r2` → `build`, `review:T1:r1` → `review`, `seam` → `seam` (no
   `:` — the whole label is the role), `integrate` → `integrate`.
2. **`--role-map`** — when no journal entry matches, `--role-map`'s JSON maps the file's
   bare basename directly to a role string, verbatim. The key may be given either as
   `agent-<id>` (as this doc otherwise documents it) or as the bare `<id>` with no
   prefix — a real `tasks/<id>.output` file's own basename has no `agent-` prefix at
   all, so both forms must resolve the same file.

A file matched by neither lands under **`unassigned`** — never silently folded into
another role's row. The by-role table (see below) always lists every role that actually
occurred, `unassigned` included whenever it's non-empty.

**The de-duplication fix, the reason this file exists in this shape:** Claude Code
re-emits one logical assistant turn as several JSONL lines — one per `apiBlockIndex` —
sharing a `requestId` (or `message.id`) with `output_tokens` growing across the lines
while `input_tokens`/`cache_read_input_tokens` repeat. Naive per-line summing over-counted
the dominant token category by roughly 1.8x on a real 813-line transcript. Both
`build-census.mjs` and its test keep a `Map<id, entry>` per file (and, when `--marker` is
given, a second map for the window, since a request can straddle the boundary — each map
does its own independent last-wins de-dup), overwrite on every repeat, and count
`Map.size` as the turn total — never a per-line increment. A turn whose lines carry
*mixed* id presence (one line has only `message.id`, another later carries both
`requestId` and `message.id`) still resolves to one turn: the first line that carries
both records an alias from that `message.id` to its `requestId`, and any line — earlier
or later in the file — that carries only the `message.id` resolves through the alias to
the same canonical key instead of splitting into a second turn.
`scripts/build-census.fixtures/lead.jsonl` and `scripts/build-census.fixtures/tasks/`
carry a request split over three lines with strictly growing `output_tokens`, specifically
so a naive (buggy) implementation produces a different, wrong number on this fixture, not
just a smaller one — `scripts/build-census.test.mjs` asserts the deduped values, and
separately proves the naive per-line count would disagree.

### `leadTurns`

**`leadTurns` is the number of maximal runs of consecutive assistant messages in the lead
transcript, where a run is broken by any user message that is not made up ENTIRELY of
`tool_result` content — a plain-content user message (including a Task-tool completion
notification, which the harness delivers as an ordinary user message) breaks a run, but a
user message whose content is nothing but one or more `tool_result` blocks does not.**

This is a genuinely different count from `totalTurns`/`windowTurns` above: those are the
number of DE-DUPED assistant API requests (an `apiBlockIndex`-split request is one
"turn"); `leadTurns` is a conversational notion — several de-duped API requests in a row,
with only tool-result traffic between them, are still just one run. See
`scripts/build-census.fixtures/lead-multi.jsonl` (5 de-duped requests, 3 conversational
runs) and its pinning tests in `scripts/build-census.test.mjs`.

`leadTurns` is windowed by `--marker` exactly like `windowTurns` is (0 before the window
starts); `leadTurnsTotal` is the same count over the whole file regardless of `--marker` —
the two are equal whenever no `--marker` is given.

For a Codex lead the report has two different native units. `windowTurns` and
`observedLeadRequests` count deduplicated native responses, keyed by response id.
`leadTurns` and `nativeTurnCountWindow` count distinct `task_started.turn_id` values, which
are native user turns. One user turn may produce several responses, so these counters are
not interchangeable. The redacted lead response timeline retains each response's turn id
to make that relationship auditable; `responseTimelineComplete: false` means a required
timestamp or model was unavailable for timeline-based gap analysis.

Codex ancestry is authenticated only through already verified immediate parents. A
rejected parent never authenticates a descendant. Candidates in clearly unrelated root
namespaces are reported as unrelated exclusions without making an otherwise complete
census partial. A candidate claiming the selected root namespace through a missing or
rejected parent is unverified evidence and makes coverage partial. Exact duplicate files
for one logical identity are named and counted once; divergent copies are a permanent
identity conflict regardless of discovery order.

### Wakes, Stop-blocks, stall nudges

Backlog-notice cadence is per native session id; hosts that omit an id share the `unknown` fallback, so independent per-pane nudges are unavailable for those sessions.

The three counts the goal's "work lost or stalled" measure names beside the gaps: how often the
lead was pulled back into work by a note, how often its stop was refused, and how often the
collector had to chase its lane. All three are read-only over files that already exist (the lead
transcript and the repo's ledger): no new log, no new hook. They print in the `## Summary` and
`## Lead transcript` sections of the markdown, as `lead.wakes*`, `lead.stopBlocks*` and
`stallNudges` in the JSON, and in `four-read.mjs`'s "Work lost or stalled" row (below). Each is
counted inside the census window (`--marker`, `--from`/`--to`, else the whole file), with the
whole-file total beside it (`wakesTotal`, `stopBlocksTotal`). None of the three reads a
subagent transcript. A Codex lead is read for all three: wakes and Stop-blocks from its rollout
(each below) and stall nudges from the ledger, which is host-agnostic. No Codex field is
unavailable.

**`wakes`** is the number of lead turns that start from a peer note delivered by note-flush, of
which `wakesDoneTick` start from the Done-tick line and `wakesNoteFlush` from any other note
(`wakes = wakesNoteFlush + wakesDoneTick`, disjoint). The marker is a top-level `user`
transcript line, not tool_result-only, whose text **opens with** Claude Code's prefix
`Another Claude session sent a message:` and a newline, followed by the plugin's own envelope
line `<from> → <to>, <M.D.YY> <HH:MM> <TZ> [<id>...] <KIND>: <body>` (the shape of
`ENVELOPE_RE`, `skills/multi/scripts/envelope.mjs:29-30`, built at `envelope.mjs` `buildEnvelope`),
and whose `origin`, when the transcript records one, is `{kind: "peer", from: "note-flush"}`
(the frame `skills/multi/scripts/inbox-claude.mjs:74-82` posts, `DEFAULT_FROM = 'note-flush'`
at `:54`). The Done-tick is that same wake whose envelope id is
`<from>-decisions-<64 hex>-<round>` and whose body is `Owner decisions pickup round <N> is
ready.` — the note `skills/decisions/scripts/decisions-pickup.mjs` `sendInputs` (`:536-546`,
text at `:539`) sends when the owner ticks Done. A note that arrives inside a turn already
running (the UserPromptSubmit and PostToolUse hook context) is not a wake: it did not start
the turn. The same holds for a note-flush delivery Claude Code queues into a running turn (an
`attachment` of type `queued_command` whose `origin` is note-flush): it joins that turn and is
not counted. The dispatching note that opens a build arrives before `Opened:` is set, so it falls
outside the record window and is not counted.

A Codex lead's wake is a `response_item` whose payload is a `message` with `role: "user"` and
exactly one `input_text` part whose whole text is one envelope line (`ENVELOPE_LINE_RE`), counted
inside the window like the tokens. A multi-line text, a text with more than one part, an
assistant or developer message, tool output, and the `event_msg` `item_completed` `UserMessage`
that echoes the same note are not wakes. The done-tick split is the same as above. This record
shape was read on a live rollout that received a queued note
(`01a0dab2-065e-7a31-bff4-9aecfe1fa833`, 2026-09-25T22:32:53Z), in the format
`skills/multi/scripts/inbox-codex.mjs` delivers; the fixture
`scripts/build-census.fixtures/completeness/codex-lead.jsonl` reproduces it.

**`stopBlocks`** is the number of times the multi-inbox Stop hook refused a stop because peer
notes were waiting. The marker is the hook's own reason sentence, verbatim,
`STOP_REASON` at `hooks/multi-hook-core.mjs:144-145`:

> Handle these before you stop: ACK what you are taking, answer what you can, or send BLOCKED with the reason. If none of it is for you, say so in one line and stop.

produced by `handleStop` (`multi-hook-core.mjs`, called from `hooks/multi-inbox.js` for the
`Stop` event) through `blockOutput` (`:136-142`). Claude Code records one block twice in the
lead transcript: an `attachment` line of type `hook_blocking_error` for the `Stop` event whose
command is `multi-inbox.js`, and a meta `user` line opening `Stop hook feedback:`. Each must
contain the sentence above; a block is counted once (the larger of the two forms, never their
sum), so a transcript that keeps only one form still counts it. The same sentence in assistant
prose, a human prompt or a tool result, another hook's Stop reason, or the multi-inbox reason
on a non-Stop event, is not a block. A test pins `STOP_BLOCK_REASON` in `build-census.mjs` to
the hook's own export, so a reworded hook fails the suite instead of silently counting zero.

A Codex lead records the same block once as an `event_msg` whose payload is an `item_completed`
with `item.type: "HookPrompt"`; each item fragment carries the hook's `text` and a `hookRunId`
that starts with the event name, `stop:`. It is counted when a fragment's `hookRunId` starts
with `stop:` and its text contains the reason sentence above. The paired `response_item` user
message `<hook_prompt hook_run_id="stop:...">` holds the same text and is not counted, or each
block would count twice. A different Stop hook produces the same item shape (for example
"Continuation accounting for the bound selected work: ..."), so the reason sentence, not
`stop:` alone, decides. The sentence inside tool output (`CommandExecution`,
`custom_tool_call_output`), or under a `hookRunId` for another event, is not a block. Shape
verified live on rollout `01a0df4c-2809-7520-b1d7-876cc51a87ee` at 2026-09-28T03:56:33Z
(`response_item` user message, then the `HookPrompt` `item_completed` 7 ms later); the fixture
`scripts/build-census.fixtures/completeness/codex-lead.jsonl` reproduces it with lookalike
negatives.

**`wakeSplit`** (lane 51, W1/m2/M4/M6; `null` with `wakeSplitUnavailable: "codex lead"` for a Codex lead) splits `leadTurns` into wake/stopBlock/other by what opened each run, with tokens by model, each model's percent share, cache_creation per turn (wake and other), and a W1b coalescable-hold simulation over RESULT-only wakes, plus the ceiling (every RESULT wake turn's tokens, the bound for any RESULT-only hold) — printed in the census markdown under `### Wake-opened turns against the rest (window)`. A run opened by a wake before the window start and still running at it counts as wake-opened, so `wakeTurns` can exceed `wakes` by one.

**`stallNudges`** is the number of stall nudges the lead received: lines in
`<ledger-dir>/*.md` (default `docs/ledger`) whose id matches `^collect-.+-stall-` — the ASK the
collector sends per stuck lane (`scripts/collect-status.mjs`, `buildStallTopic`, id
`collect-<host>-stall-<branch>-<sha7>-<n>`) — addressed to the lead's slug, with a timestamp
inside the window. A line that merely names such an id in its text, and the RESULT that answers
it, are not nudges. The JSON carries `count`, `ids`, `slug`, `slugSource` (`option` or
`inferred`), `ledgerDir` and the window used; `count: null` with a `reason` means the ledger or
the slug could not be read, which is never printed as zero. It counts only the ledger it is
given: a nudge sent to an owner on another host lands in that host's ledger (the collector
mirrors to the sender's host and, since lane 43, to the owner's), so a build led on another
host is counted from that host's ledger.

### Header line

Every report's markdown begins with a line whose literal PREFIX is **`VERDICT: COUNTED `**
— that prefix, always present, always verbatim, byte-identical, is what
`scripts/work-record.mjs`'s `accept --census <file>` (Territory C2) actually matches to
recognise a build-census report (it refuses a file whose first line lacks it, rather than
parsing loosely); the rest of the line is free text and may change. After a blank line,
`# Build census` follows — this is only this report's section title, not something any
other tool parses; do not confuse the two when changing either one.

**`leadLastMessageAt`, the one currency field (T1/C2 fix round, MAJOR C2):** the same
header line also carries `leadLastMessageAt: <ISO timestamp or 'unknown'>` — the census's
own window-end timestamp (same value as `lead.windowEndAt` in the JSON), and the ONLY
timestamp `work-record.mjs`'s `census-stale` check ever reads. It is never inferred from
"the latest ISO-8601 timestamp anywhere in the report" — a `--role-map` label, a file
path, or any other free text in the report can contain a string that *looks* like a
timestamp (a role literally named `review-2026-09-26T00:00:00Z`, for instance) without
being one; scanning the whole report for any ISO-looking substring lets exactly that kind
of text rescue a genuinely stale census. `checkAcceptance` parses only this one named
field; a report missing it, or carrying an unparsable value, fails closed as
`census-stale` rather than treating an unknown as an agreeing one.

### Report sections

`VERDICT: COUNTED <n> lead requests (leadTurns <k>), <m> subagent files` (first line —
see "Header line" above for which part of it is load-bearing) · `# Build census` (the
section title) · **Summary** (flat, copyable lines: `leadTurns`, `wallClockHours`, a
`by-model` line and a `by-role` line, each `key=totalTokens`, comma-separated, then
`subagentFiles` and, only when any subagent file is unreadable, an `INCOMPLETE` line
naming the unreadable count — this is the one Summary line `accept --census` needs to
carry the incompleteness flag into the record, since it copies flat bullets but not the
VERDICT line or prose) · lead
turns (whole file and window, both de-duped, plus `leadTurns` and, when `--marker` is
given, `leadTurnsTotal` alongside it), turns/hour in the window · lead tokens by model
(whole file and window) · subagents: a `Roles: <role>=<fileCount>, ...` line, then (when
`--marker` is given) a `Window-excluded subagent turns` line naming, per file, how many
of its turns were dropped as pre-window, then a `| file | role | turns |` table (every
counted file, its resolved path, its role, and its IN-WINDOW turn count — `unassigned`
files are listed like any other, never dropped, and a file excluded down to 0 turns still
gets its own row rather than disappearing) · subagent totals by model · subagent totals by
role (same shape as by-model) · a combined split (the build-window lead cost plus every
subagent's cost — the only lead-side number actually comparable to subagent cost, since
subagents only exist during the build).

A subagent file that cannot be read shows `n/a` in the turns column rather than `0`; `0`
is reserved for a file that was read and genuinely contained no turns (zero-byte
transcripts are common — 65 of 145 in the reference corpus). When any file is unreadable
the VERDICT line and the `## Subagents` header say so, and the subagent token table and
the combined split are **incomplete by an unknown amount** — do not quote them.

Secrecy: the file never prints `message.content`. It reads it only to test membership of
`--marker` inside a parsed line (a boolean-only, bounded-depth/width search) and to match the
plugin's own wake and Stop-block markers, keeping a kind and a recipient slug, never the text —
output is numbers, model names, slugs, ledger ids, the ledger directory and file basenames only.

## `four-read.mjs` — the four-number read

```
node scripts/four-read.mjs --record <record.md> --census <census.json> [--spec-census <json>] [--ledger docs/ledger] [--git <repo>] [--branch <ref>] [--lead-session <id>] [--lead-slug <slug>] [--out <path>] [--json <path>]
```

The first cross-lane read, every lane closed on 9/28 against the hand-run baseline with an Opus verdict, is docs/reports/census-0928/four-read.md (lane 50).

Prints the goal's four measures (docs/GOALS.md) for one build. Every number is a
computed `value` or `unavailable (<reason>)` — a guess is never printed. Definitions,
verbatim from `docs/specs/2026-09-25-four-number-read.md`:

1. **Top-tier tokens per build**: the sum over every counted file of input, output,
   cache-read and cache-write tokens for messages whose `message.model` matches the top
   tier (`DELEGATION_TOP_TIER`, default `fable,opus`), plus the spec writer's slice: the
   spec session's top-tier usage between `Spec-from:` and `Opened:`. The census JSON
   already holds the by-model sums; the spec slice is one extra
   `build-census.mjs --lead <spec session> --from <Spec-from> --to <Opened>` run whose
   output file is stored next to the record.
2. **Hours ask to accepted**: `Opened:` to the FIRST `accepted` `Log:` entry, in hours to
   one decimal, plus the largest gap between two consecutive messages of the lead session
   inside that window (a stall indicator, printed beside it).
3. **Rework after acceptance**: the count of commits on `main` (or the integration branch
   when `main` does not yet contain the build) within 7 days after the first acceptance
   that touch any file changed in the build's range, excluding the merge commit and the
   release commit, plus the count of `accepted` `Log:` entries after the first. Both
   counts print with their shas or log lines. The range is `Base:` to the accepted sha
   from the record; a record without a resolvable range gives `unavailable (no range)`.
4. **Work lost or stalled**: the number of gaps over 30 minutes between consecutive
   messages of the lead session inside the build window that are `stalled`, plus every
   subagent stall, plus the number of ASK ids addressed to the lead's slug in
   `docs/ledger/*.md` within the window that have no RESULT or BLOCKED naming them with
   `re <id>`. Each stalled gap prints its start time and length; each unanswered id
   prints. The leading integer is always the stalled count (`work-record.mjs`'s stall
   check parses only that leading integer). The row then ends with the three counts
   `build-census.mjs` defines (see "Wakes, Stop-blocks, stall nudges"), after the leading
   integer, as `; wakes <N> (<a> note-flush, <b> Done-tick); Stop-blocks <N>; stall nudges
   <N> to <slug>: <ids>`. Wakes and Stop-blocks come from the census JSON and print only when
   that census is the build's window (the same check as number 1: window start not before
   `Opened:` minus 5 minutes, window end not after the last acceptance plus 5 minutes);
   otherwise each says `unavailable (<reason>)`, as it does for a census that predates the
   counts (no integer for wakes and Stop-blocks); a Codex census prints all three the same way.
   Stall nudges are counted by `four-read.mjs` itself from
   `--ledger` over `Opened:` to the first accepted `Log:`, for `--lead-slug`, and say
   `unavailable (<reason>)` without either. Nothing is ever printed as a zero it did not
   count.

For a native Codex census, the verified response timeline supports response-gap
measurement but does not establish Claude `Agent`/`Task`/`Workflow` spans or child stall
semantics. Number 2 therefore labels its largest native API response gap as a heuristic.
Number 4 begins `stalled classification unavailable`, then prints the measured number of
native API response gaps over 30 minutes as a heuristic and the ledger ASK result. It
never presents that response-gap count as the leading verified stall count, including
when the count is zero. The Codex path consumes only the census response timeline; it
does not run the Claude raw-transcript span or subagent-stall scanners.

A lead gap over 30 minutes is split into two classes, never counted as one plain number.
For every lead `tool_use` named `Agent`, `Task` or `Workflow`, a span runs from that
tool_use's own timestamp to the LATER of its own matching `tool_result` and the spawned
agent file(s)' own activity end (read from `subagents/`) — the tool_result alone is only
a dispatch ack, not completion, so it is never trusted by itself when a spawned agent's
own transcript can bound the span instead; only when no matching agent file exists at all
does a span fall back to the ack (or, for a `Workflow` tool_use specifically, to the first
later lead `TaskStop`, else the window end, since a Workflow's own ack reliably returns in
under a second regardless of how long its dispatched builders and reviewers keep running).
An agent file's own activity end is its last timestamp, UNLESS its last record is a
`tool_use` with no later `tool_result` (left waiting on a tool, such as a permission
prompt) — such an agent is still alive, so its activity end is instead its own R7 end
bound, and the same hang counts once, as the agent's own R7 tail stall, never a second
time as a lead R6 stall. A Workflow launch that reuses its run's `toolUseResult.runId` (a
relaunch) is bounded only by the agent files that launch itself started — those whose own
first timestamp falls between this launch and the next launch that shares the same runId
— so a lead stall before the relaunch is never papered over as waiting on the first
launch's agents. Overlapping/nested spans are merged into one union first, so a Workflow
whose own agents are also directly spawned is never counted twice. A gap is then split at
the union's boundaries: the piece(s) inside the union are `waiting-on-agents` (any length
counts, since the lead is legitimately waiting on dispatched work, the "intended shape of
a cheap lead"); a piece outside the union is `stalled` only when that piece alone still
exceeds 30 minutes.

Every subagent transcript the lead's own session spawned is also scanned directly:
`<lead-dir>/<session id>/subagents/agent-*.jsonl` and
`.../subagents/workflows/<run>/agent-*.jsonl` (both read; `journal.jsonl` and any
`*.meta.json` are skipped; when the lead dispatched Agent/Task/Workflow work but no files
are found under `subagents/` at all, the line says so explicitly rather than reading as a
confident zero). A file counts only when its own timestamp range overlaps the build
window; a gap over 30 minutes between two of its consecutive in-window timestamps is one
stall, and its tail silence (last timestamp to its end bound, clipped to the window) is a
stall too, but only when its last record holds a `tool_use` with no later `tool_result` —
i.e. the agent was left waiting on a tool, such as a permission prompt, not merely between
turns. A direct subagent's end bound is the lead's own `tool_result` for its spawning
Agent/Task call, matched by the id that result's `toolUseResult.agentId` names, and only
when that result comes strictly after the file's own last timestamp (an async Agent's
matched result is often just the launch ack, not completion) — else the window end. A
Workflow agent's end bound prefers the first lead `TaskStop` after the file's last
timestamp, then the nearest-preceding Workflow's own `tool_result` when that, too, is
strictly later than the file's last timestamp, then the window end. A timestamp that fails
to parse, or that has no `Z` or offset, rejects the whole file rather than being guessed as
local time; that file prints `agent <id> unreadable timestamps` instead of a count. Each
real stall prints `agent <id> silent <N> min from <ISO>` and adds one to the leading count
(when the lead's gaps are available; the gaps-unavailable line prints no count, and accept
then needs a `Stall:`/`Gap:` paragraph);
these stalls also print alongside a "fewer than 2 lead messages in window" gaps-unavailable
line rather than being dropped, since the lead's own message count says nothing about
whether its subagents stalled.

**Pane silent and waiting on a peer (lane 68).** Each lead `stalled` piece is then named,
so no stall in the window is left without a cause. A piece is judged at its own start time
against two things already in the inputs: the record's Status at that instant (the status
of the latest `Log:` entry at or before it; `owned` is the only working state in
`work-record.mjs`'s `STATUSES`), and the ledger. **Waiting on a peer**: the piece starts
while the record is `owned` and the lead's slug holds an ASK to some other slug, sent inside
the build window, that no RESULT or BLOCKED naming it with `re <id>` has answered by that
instant; it prints `waiting on a peer <min> min from <ISO> (ASK <id> to <slug>)`. **Pane
silent**: the piece starts while the record is `owned` and no such ASK is open; the lead's
pane stopped writing to its transcript with work open and nobody asked for, which is what
an Orca occlusion freeze looks like from the outside. The plugin cannot fix that freeze; it
names it, as `pane silent <min> min from <ISO>`. The two are disjoint, a piece in neither
(the record was not `owned`, or had no `Log:` entry yet) keeps today's `stalled` wording
only, and a gap inside an `Agent`/`Task`/`Workflow` span is still `waiting-on-agents`. The
clauses come after `waiting-on-agents` and any `agent <id> silent` lines, in the existing
`; ` style, and they attribute a subset of the stalled count: the leading integer is
unchanged and still counts every stalled piece, so `work-record.mjs`'s stall check reads
the same number it always did. When the record's `Log:` entries cannot be read, or an
`owned` piece needs the ledger and `--lead-slug` or `--ledger` is missing (or the slug is
not in the ledger), the row says `stall attribution unavailable (<reason>)` rather than
saying nothing. The Codex response-gap heuristic is not attributed.

Two companion lines print beside the four: top-tier assistant messages per build (each
one re-reads the whole context, so this is the cost driver, not the turn count alone),
with the tokens line split into cache-read, cache-write, input and output; and notes to
the lead per build (ASK, RESULT and BLOCKED envelopes addressed to `Lead-session:`'s slug
in the ledger within the window, since each one is a full lead turn). The messages
companion shares Number 1's census verdict for Claude and for rejected windows. A
complete native Codex lead timeline remains independently countable when only whole-build
token coverage is partial (for example, incomplete child discovery): the lead-only native
response count remains measured and its token suffix states the coverage failure. An
unavailable or malformed native lead timeline still makes the companion unavailable,
never a confident zero.
**Rule for every lane from now on: a lane wakes its lead at most three times, ACK at
start, RESULT at the end, BLOCKED if stuck, and an ACK's content is never sent under the
ASK kind to force delivery.**

Inputs from the record: `Opened:`, `Base:`, the accepted sha (from the first `accepted`
`Log:` entry's own `artifact <sha>` note, or, only when the record has a single
`accepted` entry, the `Artifact:` field), `Lead-session:`,
`Spec-session:`, `Spec-from:`. `four-read.mjs` parses these fields itself, independently
of `scripts/work-record.mjs` (which may not carry `Lead-session:`/`Spec-session:`/
`Spec-from:` in every worktree yet) — a record missing any of them yields `unavailable
(<which field>)` for the numbers that need it, never a thrown error.

**Open the record with the id your host reports (the hook's hint line in context, not an
environment variable that may be unset).** Where a real build has no `Lead-session:`
(true of every build before this one), the reader takes `--lead-session <id>` on the
command line and the evidence file says the id came from the command line and how it was
established — the census file names the lead session file it read (its `leadPath` field);
`four-read.mjs` always sources the transcript from there, never by searching for a
session id on disk.

Run the read at accept time, after the last review, against a fresh `--census`: `node
scripts/four-read.mjs --record docs/work/<id>.record.md --census
docs/work/evidence/<id>.census.json --ledger docs/ledger --lead-slug <slug> --json
docs/work/evidence/<id>.four-read.json --out docs/work/evidence/<id>.four-read.md`, then
`work-record.mjs accept --four-read <json>` copies the four lines into the record. Because
the record has no `accepted` Log: entry yet at this point, share one `T` between the two
commands instead — `T=$(date -u +%FT%TZ)`, `four-read.mjs ... --accept-at $T` and `accept
--at $T --four-read <json>` — so the accepted Log: line `accept` writes carries the same
`T` the read already measured up to, and the four numbers it copies are real values, not
`unavailable`. When the spec writer's slice applies, run `build-census.mjs` a second time over the spec
session's window and pass its `--json` output file as `--spec-census` alongside `--census`. The
accept-time `--census` itself runs `--from <Opened:>` (and `--to <last accepted Log:>`
when it is re-run later, after a re-accept) — one window governs both Number 1 and the
top-tier-messages companion; `four-read.mjs` refuses a census whose window starts outside the
build or ends after its last acceptance.

The prediction rule from the bearings: the lead writes the next build's predicted four
numbers in the RESULT to skills-fable.

## Completeness measures (lane 62)

### Token definition

Every census and four-read number says which token count it uses: `processed-v1`. Claude: uncached input + cache
creation + cache read + output, once per native request (the last row per request wins; a nested
`cache_creation` breakdown is a subset and is never added). Codex: input + output, where cached and cache-write
input and reasoning output are subsets of those and are never re-added. A negative or non-finite category, cached +
cache-write above input, or reasoning above output is an invalid vector: the row is rejected (PARTIAL role, or
`sanity.invalidUsageRows` in `token-census`), not coerced. `token-census` keeps `costUnits` as its own price-ratio
unit, separate from the processed total, and adds `tokenDefinition` to its JSON.

### Declared roles and scope

`build-census --record <record.md> --repo <repo> --from <iso> --to <iso> [--claude-root <dir>] [--codex-home <dir>]`
also reads the record's `Role-sessions:` manifest (docs/work-record.md). `--record` requires `--repo`, explicit
`--from`/`--to`, no `--marker`, and a `--from` no more than 5 minutes before the record's `Opened:`. Declared
transcripts are read with LF-only framing, de-duplicated against the native session graph by request identity, and
join the existing by-model, by-role and per-file reducers with `source: "declared"`. In a Codex-led census a
declared Claude vector also gets a processed `derived_total_tokens`, so a Codex 100 + Claude Opus 10 build reads 110.
The JSON gains `tokenDefinition`, `measurementScope` (roles, window, omitted declarations, limitations) and
`roleSessions` (per session: host, id, role, status, reasons, requests, duplicateRequests). The verdict is
`PARTIAL` whenever a declared role is PARTIAL or omitted; `work-record accept` refuses a PARTIAL census with a
message that points to `--no-census "<reason>"`. Without `--record` a census is native-session-graph only and says so.

Top tier is the union `fable, opus, gpt-6-astra, gpt-5.6-sol` whatever the lead's host; `DELEGATION_TOP_TIER` still
acts as a filter: a configured match counts (even an otherwise unknown name), and any other known family — a default
top-tier one excluded by the configuration, or a known lower family (sonnet, haiku, gpt-5.6-terra, gpt-5.6-luna,
codex-spark) — is not top tier without making the cell unavailable. A model in no known family carrying tokens makes the top-tier cell `unavailable` with the observed subtotal (a zero-token
`<synthetic>` row does not). The four-read headline is the wider, declared-role scope and is labelled
SCOPE MISMATCH against the lead-only hand-run baseline; the `Top-tier tokens, lead only` companion gives the
comparable figure. No overall DONE is claimed from it.

### Codex activity

For a Codex lead, `activity` classifies every consecutive-event gap strictly longer than 120 minutes across all lead
segments (timestamp order, file order on ties). `baselineRuleGaps` counts the gaps of any kind, including waits between
turns — the rule the hand-run baseline used; an artificial `--to` boundary never adds one. `observedSilentGaps` is
silence inside an open turn and `toolRunningGaps` a call with no output yet; a turn whose end was never observed makes
later gaps `unknown` and the coverage PARTIAL. At exactly 120 minutes every count is 0. four-read states the
baseline-rule count beside the 30-minute heuristic and names usage-limit, relaunch and missing-report stalls and
causal attribution as UNSUPPORTED, so the count is a lower bound.

### Follow-up episodes

four-read reads the record corpus (`--records <dir>`, default the record's own directory; `--as-of <iso>`, default
now) and appends `; follow-up episodes: <n> (declared links only, mature|provisional until <windowEnd>)` to the
rework cell, or `; follow-up episodes unavailable (<reason>)`, plus `; this build is follow-up of <parent>` when the
record has `Follow-up-of:`. An episode is a record whose `Follow-up-of:` names this `Work:` and whose `Opened:` lies
within 7 days after the first acceptance; the window is mature once `--as-of` reaches its end. The corpus must include
the target record; an unreadable or Work-less nonempty record, a duplicate Work, a missing ancestor or a cycle is
PARTIAL. The count is separate from the commit/re-accept count and is never summed with it. The JSON carries the same
facts under `reworkAttribution`.

## `work-census.mjs`

```
node scripts/work-census.mjs [docs/work] [--out <path>]
```

Reads records through `scripts/work-record.mjs`'s own `listRecords`/`parseRecord` — this
file never re-parses a record. Per work id:

- **opened / first owned / first delivered / first reviewed / first accepted** —
  `Opened:` field, and the earliest `Log:` line of each of the other four statuses, in
  file order. **`Opened:` is set once, when the lead starts the build** (the ask/spec
  dispatch time), never at accept time or any other later moment — a record whose
  `Opened:` is minutes before its own acceptance makes the wall-clock measurement
  meaningless (T1/C2 fix round item 4: it does not measure the build, only the tail end
  of its review). `Opened:` is required (`docs/work-record.md`); when the exact start is
  uncertain, use the ask's or spec's dispatch time and never a time after it.
- **rounds** — the `Rounds:` field when present, else a count of `owned` -> `delivered`
  transitions, file order — not adjacency: an intervening line of some other status (an
  interim `reviewed` note, a `rejected` verdict) between an `owned` and its eventual
  `delivered` still counts as one transition, tracked with an "armed" flag that arms on
  `owned` and fires (and disarms) on the next `delivered`.
- **elapsed** — `opened` -> `accepted`. Most real records never reach `accepted` (the
  common case, not an edge case): when no `accepted` line exists, elapsed falls back to
  `opened` -> the LAST `reviewed` line, labeled `(to reviewed)` in the report rather than
  left blank. A record with neither line reports `null`, labeled
  `(no reviewed or accepted line)`. A record that HAS a `reviewed`/`accepted` line but no
  `Opened:` field also reports `null`, but labeled `(no Opened: field)` — the label names
  whichever field is actually missing rather than defaulting to the first case's wording.

No fixtures directory is committed for this tool (unlike `build-census.mjs`'s, which
gate-10 runs the CLI against directly): `scripts/work-census.test.mjs` builds its
`.record.md` fixtures under a fresh `mkdtempSync` temp dir, the same convention every
other test in this repo already uses for record fixtures.

## `collect-from-origin.mjs` — the durable signal for accepted-but-unmerged work

```
node scripts/collect-from-origin.mjs [--repo <dir>] [--main origin/main] [--no-fetch] [--json] [--skip <name>]... [--only-prefix <prefix>]...
```

The collector is run before any lane dispatch and after every merge to main, never only when a
lead happens to remember to ask. Its table goes into the bearings packet alongside the
other census numbers above, not just into a one-off terminal check. "In flight" may only
be written about a lane whose origin record says `owned` — an origin branch whose record
already reads `accepted`, `rejected`, `withdrawn`, or `closed` is reported by its collector state
(`accepted-unmerged`, `accepted-merged`, `rejected`, `withdrawn`, `closed`), never described as merely
in flight. (Updated by lane 33, docs/specs/collect-followups-1: `closed` is its own terminal
collector state, added alongside the existing four.)
The collector's own `accepted-unmerged` state together with its `hoursSinceLog` field IS
the four-hour "accepted-unmerged" check: an `accepted-unmerged` row older than four hours
is a defect the lead reports, not a normal state waiting on its turn.

`collect-status.mjs` passes `--only-prefix build/` by default, so status reports only lane
branches. Repeat `--only-prefix` to select different prefixes; `--only-prefix ""` deliberately
disables the default and includes every candidate branch. Excluded candidate branches are one
`skipped: n (outside build/)` line, never `no-record` attention rows. The first report after
this filter is introduced has a new row-only change key and therefore sends one expected RESULT.
In `status.md` the rendered derived-state column is named `lane`; every non-terminal `Status:`
renders as `owned` there. JSON retains the `state` field for callers.

A stall nudge (`sendStallNudges`, work lost or stalled) is counted delivered when its id is in the
OWNER's host notes mirror, `~/.agents/notes/<day>.md` (what `note-inbox` reads), and lost when it is
only in the sender's `docs/ledger/<day>.md`: `grep -c 'collect-.*-stall-' ~/.agents/notes/<day>.md` on
the owner's host (the note-send mirror for an `owner_hosts` entry, or the local write when owner and
collector share a host) against the same grep on the collector host's `docs/ledger/<day>.md`.

## Knowledge read counting (not yet a census)

Topic reads out of `~/.claude/knowledge/` are counted per host in `~/.agents/knowledge/read.log`
(spec.md Territory K1's hook writes it; `scripts/knowledge-counts.mjs` and
`scripts/knowledge-count.mjs` read it, and the same numbers reach the SessionStart notice through
`scripts/goal-card.mjs`). No census in this file consumes those counts yet — a per-host log of
reads is not the same thing as a build-over-build measure, and turning it into one is a later
lane's work (spec.md Territory K3 item 3 names lanes fourteen and seventeen as the owners of
`scripts/build-census.mjs` and `scripts/four-read.mjs`; this lane does not touch either). The
SessionStart line only rides with a rendering goal card — it is computed inside
`renderInjection`, which returns nothing when a project has no valid `docs/goals/card.md`
(status `blind`, `absent`, or `rejected`) — so a live check of the line must run from a project
that carries one, such as this repo's own checkout; a scratch directory with no card shows none
(round-1 review, MAJOR 2).

Codex: the knowledge read counter is unsupported because Codex hook payloads carry no file path, so Codex sessions' reads are never counted. The SessionStart line still renders in Codex sessions, and its read count there covers Claude sessions on the same host only. The Codex token census reads the explicit lead transcript plus only verified descendant session files in the configured canonical Codex home’s UTC folder for the lead `session_meta` timestamp and the following UTC folder, to depth three; explicit `--tasks` files still require that same horizon, ancestry, and root-namespace verification. It cannot read tokens from other Codex homes, sessions outside that two-day horizon, or descendants without authenticated `thread_spawn` ancestry. A Claude reviewer such as skills-fable is not a native Codex descendant and cannot enter that combined aggregate through `--tasks`; its Claude census is separate and the four-read remains partial when that reviewer’s tokens are unavailable. These sources produce `PARTIAL`/`unavailable` evidence rather than an implied zero, so an unavailable record names this discovery limit.

## Notion writing: fed

The measure: rework after acceptance on Notion pages (pages Ben retitles, rejects or asks to be rewritten) and hours from ask to accepted (a Codex lead publishes a page without asking a Claude lead). The owner's structure complaints ("hard to read", "which toggle", "a mess") are the baseline (`docs/specs/2026-09-28-notion-writing.md`, Measure); the pages he used are listed in taxonomy-fable's 9/28 packet, kept out of this public repo.

What is fed: `skills/notion-writing/scripts/page-lint.mjs`, one checker, kinds `decisions`, `spec`, `brief`, `status`, `read`, `handoff` and `plain`. It is read-only, exits 2 with `page-lint: <rule-id> <file>:<line> <what to fix>` per violation, and is mirrored to `~/.agents/skills/notion-writing/scripts/` so Codex runs the same file. The decisions render calls it once, at the end of `render()`, for `render`, `publish` and `publish --dry-run`; `~/.agents/no-page-lint` skips that call, fail-open, with one stderr line.

Counting: every publish through the skill leaves a `page-lint: clean (<kind>)` line in the writer's record or ledger, so `grep -c 'page-lint: clean (' docs/ledger/<day>.md docs/work/*.record.md` per host is the number of checked publishes, and a Codex session appearing in those lines is the hours-to-accepted evidence. A skipped render call is counted by the `page-lint skipped, kill switch` stderr line, which the render prints once per run.

The live-proof page (one page published through the skill from a Codex session to a scratch parent, read back, checker green) is named in the Evidence of `docs/work/wr-2026-09-28-notion-writing.record.md`, not here, because it is published after the build review.

Fixtures are masked skeletons only (`skills/notion-writing/scripts/mask-fixture.mjs`): this repository is public and the pages Ben used are not.

## Counted markers

- `stale session:`: the stale-session guard's marker; the guard logs it as rule `R0-stale` (with `hard_deny: true`); wiring-check `--line` prints the same text.
- `leak check:`: `scripts/run-tests.mjs`'s own line, the reader for a test temp leak - `leak check: 0 new temp entries` when a run left nothing new directly under the real temp dir, otherwise the count and up to 5 names as a signal to investigate, and `leak check: nested run, not checked` when the CLI is itself running inside another run's root. It never changes the run's exit code (round 1 ruling R1: a shared host's concurrent runs made the forced exit 1 too flaky to gate on); the unit tests in run-tests.test.mjs are the gate for the mechanism itself.

## Knowledge triage: fed

Lane 40 (docs/specs/knowledge-triage-40/rev4.md) schedules the existing triage skill instead of adding a second mechanism. One daily Windows job on the designated writer host, `node scripts/knowledge-triage.mjs` (installed as the `knowledge-triage` job of `scripts/install-janitor-timer.mjs`), gathers the top-level pending notes from Netcup and Hetzner (Mac is a named placeholder until Ben supplies an alias), runs the skill once over the union in one nested `claude-opus-5-5` session (cap 60 oldest notes, 60 minutes), verifies the skill's own publication read-only, and only then moves each archived original into its origin host's `_inbox/_archive/`. Measure moved: work lost or stalled in the knowledge inbox.

Readers that exist today:

- `node scripts/knowledge-count.mjs` on each host: pending, topics, reads in 7 days. Reads exclude the job's own nested sessions, listed in `~/.agents/knowledge-triage/sessions.json`.
- `~/.agents/knowledge-triage/last-run.json` (schema 1): per-run timestamps, status, session id, model, cap, `notesIn` (selected), `notesEligible` (union), `notesArchived`, `notesArrived` (local captures newer than the previous run's end; imported notes are counted separately per host), `topicsTouched`, `outOfSelection`, tokens (`{input, output, cacheRead, cacheCreation, total}` or `{unavailable: reason}`, never an invented zero), `dotfilesBefore`/`dotfilesSha`, per-host gather/archive/pending counts, publication identity, named residue and terminal outcomes.
- `~/.agents/knowledge-triage/ATTENTION` exists only after a stall the job refuses to clear itself (a timeout, a repeatedly held curated lock, an unverified publication of a changed DIGEST, an out-of-selection archive); every later run skips while it exists.

Prediction: while at least 60 eligible notes remain, each successful run archives at least 30, names any residue, and adds dated DIGEST lines; topic reads in 7 days excluding job sessions reach at least 3 by 2026-10-12. The first live run confounds Lane 18's Oct 4 prediction (reads rising from the count line alone); Lane 18's checker is not edited, and the record states the pre-run values. One run does not establish overall DONE or any comparative cost claim.

Codex: a Codex runner for this job is an explicitly unsupported capability until it is tested; the nested call is the Claude CLI because the triage skill is a Claude skill. The lead may still be Codex.
