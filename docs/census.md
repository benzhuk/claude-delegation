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
  Codex is detected from a verified `session_meta` record: the census counts only
  deduplicated `token_usage_record.payload.usage` values whose session id matches that
  metadata record, never its cumulative turn/thread counters. Codex model attribution is
  reported as `unknown` when the transcript does not carry a model field. Its native turn
  ids are reported separately; `leadTurns` remains explicitly unsupported unless the
  transcript establishes the same assistant/user conversational ordering defined below.
  Native Codex child-transcript discovery and usage attribution are unsupported: a Codex
  lead rejects `--tasks` and emits no child, role, or combined-spend table. Codex malformed
  JSON fails visibly once the stream is recognized as Codex; a wholly unrecognizable
  malformed file retains the legacy Claude reader's malformed-line skip behavior.
  Codex per-response values are diagnostic observations, not a complete census: every Codex
  report is `VERDICT: UNSUPPORTED`, with `leadTokens` unsupported for coverage and any
  `observedLeadTokens` separately labeled. `accept --census` refuses that report; use
  `--no-census` with the stated coverage, turn, and child-attribution limits.
  The marker is a bounded substring match and does not itself prove a build boundary; the
  live diagnostic's requested marker boundary was independently verified before use.
- `--tasks` — a directory of subagent transcripts (`.output`, and `.jsonl` for forward
  compatibility — `.output` is the extension real subagent task directories actually use).
  May be given more than once; every file across every given directory is counted, each
  exactly once — a directory given twice, or a file reachable through two directories (a
  symlink, in real life), is de-duped by its resolved real path, not by its nominal path.
  Optional: when omitted, the default subagents glob below may still supply files.
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
- `--from`/`--to` (optional, four-number-read spec.md Territory R1 item 3) — a SECOND,
  independent windowing mode: a plain ISO timestamp range instead of a marker match.
  Mutually exclusive with `--marker` (given together, both throw). Messages outside
  `[--from, --to]` are not counted; a window covering the whole file equals the
  unwindowed run. This is the mechanism `scripts/four-read.mjs` uses for the spec
  writer's token slice: `build-census.mjs --lead <spec session> --from <Spec-from> --to
  <Opened>`, its output file stored next to the record. Codex leads reject these flags
  (native per-response usage has no assistant/user role ordering to window this way).
  This is the ONLY change this build made to this file; everything else in it is frozen.
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
   messages of the lead session inside the build window, plus the number of ASK ids
   addressed to the lead's slug in `docs/ledger/*.md` within the window that have no
   RESULT or BLOCKED naming them with `re <id>`. Each gap prints its start time and
   length; each unanswered id prints.

Two companion lines print beside the four: top-tier assistant messages per build (each
one re-reads the whole context, so this is the cost driver, not the turn count alone) —
`four-read.mjs` reports this one `unavailable` today, since `build-census.mjs` sums
tokens by model but does not count messages per model; and notes to the lead per build
(ASK, RESULT and BLOCKED envelopes addressed to `Lead-session:`'s slug in the ledger
within the window, since each one is a full lead turn). **Rule for every lane from now
on: a lane wakes its lead at most three times, ACK at start, RESULT at the end, BLOCKED
if stuck, and an ACK's content is never sent under the ASK kind to force delivery.**

Inputs from the record: `Opened:`, `Base:`, the accepted sha (from the first `accepted`
`Log:` entry's own `artifact <sha>` note, or the `Artifact:` field), `Lead-session:`,
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
`work-record.mjs accept --four-read <json>` copies the four lines into the record. When
the spec writer's slice applies, run `build-census.mjs` a second time over the spec
session's window and pass its output file as `--spec-census` alongside `--census`.

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
