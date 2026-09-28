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
node scripts/build-census.mjs --lead <session.jsonl> [--tasks <dir>]... [--role-map <json>] [--marker <text>] [--from <iso>] [--to <iso>] [--out <path>] [--json <path>]
```

Worked example, run against the committed fixtures (this is gate-10's own invocation —
run it twice and the two outputs must be byte-identical):

```
node scripts/build-census.mjs --lead scripts/build-census.fixtures/lead.jsonl --tasks scripts/build-census.fixtures/tasks
```

- `--lead` — one Claude Code or Codex lead session transcript (`.jsonl`). Required.
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
  Default discovery reads only the configured canonical Codex home in the lead's UTC date
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

Secrecy: the file never reads `message.content` except to test membership of `--marker`
inside a parsed line (a boolean-only, bounded-depth/width search) — output is numbers,
model names and file basenames only.

## `four-read.mjs` — the four-number read

```
node scripts/four-read.mjs --record <record.md> --census <census.json> [--spec-census <json>] [--ledger docs/ledger] [--git <repo>] [--branch <ref>] [--lead-session <id>] [--lead-slug <slug>] [--out <path>] [--json <path>]
```

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
   check parses only that leading integer).

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
session's window and pass its output file as `--spec-census` alongside `--census`. The
accept-time `--census` itself runs `--from <Opened:>` (and `--to <last accepted Log:>`
when it is re-run later, after a re-accept) — one window governs both Number 1 and the
top-tier-messages companion; `four-read.mjs` refuses a census whose window starts outside the
build or ends after its last acceptance.

The prediction rule from the bearings: the lead writes the next build's predicted four
numbers in the RESULT to skills-fable.

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

Codex: the read counter is unsupported on Codex, because Codex hook payloads carry no file path, so Codex sessions' reads are never counted. The SessionStart line still renders in Codex sessions, and its read count there covers Claude sessions on the same host only.

## Counted markers

- `stale session:`: the stale-session guard's marker; the guard logs it as rule `R0-stale` (with `hard_deny: true`); wiring-check `--line` prints the same text.
- `leak check:`: `scripts/run-tests.mjs`'s own line, the reader for a test temp leak - `leak check: 0 new temp entries` when a run left nothing new directly under the real temp dir, otherwise the count and up to 5 names as a signal to investigate, and `leak check: nested run, not checked` when the CLI is itself running inside another run's root. It never changes the run's exit code (round 1 ruling R1: a shared host's concurrent runs made the forced exit 1 too flaky to gate on); the unit tests in run-tests.test.mjs are the gate for the mechanism itself.
