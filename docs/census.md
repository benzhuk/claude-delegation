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
node scripts/build-census.mjs --lead <session.jsonl> [--tasks <dir>]... [--role-map <json>] [--marker <text>] [--out <path>] [--json <path>]
```

Worked example, run against the committed fixtures (this is gate-10's own invocation —
run it twice and the two outputs must be byte-identical):

```
node scripts/build-census.mjs --lead scripts/build-census.fixtures/lead.jsonl --tasks scripts/build-census.fixtures/tasks
```

- `--lead` — one Claude Code lead session transcript (`.jsonl`). Required.
- `--tasks` — a directory of subagent transcripts (`.output`, and `.jsonl` for forward
  compatibility — `.output` is the extension real subagent task directories actually use).
  May be given more than once; every file across every given directory is counted, each
  exactly once — a directory given twice, or a file reachable through two directories (a
  symlink, in real life), is de-duped by its resolved real path, not by its nominal path.
  Optional: when omitted, the default subagents glob below may still supply files.
- **Default subagents glob** — when `--lead <session.jsonl>` is given, the script also
  globs `<dirname of lead>/<lead session id>/subagents/agent-*.jsonl` (`<lead session id>`
  is the lead's basename with `.jsonl` stripped) so a lead's own Task-tool subagents are
  counted without a flag. Unlike an explicitly-named `--tasks` dir (unreadable is an
  error, never a silent zero — see below), a MISSING default dir is the common case (most
  lead sessions spawn no subagents) and contributes zero files without complaint.
- `--role-map <json>` (optional) — inline JSON, `{"agent-<id>": "<role>"}`, mapping a
  subagent file's basename with its extension stripped (e.g. `agent-a5759bed32340205d`)
  directly to a role string. See "Roles" below.
- `--marker` (optional) — a substring; the "window" starts at the first line containing
  it (a bounded-depth/width search — it is never printed) and runs to the end of the lead
  file. Without `--marker`, the window is the whole file. A `--marker` that matches
  nothing in the lead file throws (`--marker text not found in <basename> (window would
  be empty)`) rather than silently printing a confident zero for both the window turn
  count and the combined split — the exact shape a reader skims first.
- `--out` (optional) — write the full markdown report there; without it (and without
  `--json`), the report goes to stdout. Nothing else reaches stdout (with `--out` and/or
  `--json`, only one `wrote: <path>` line per file written does).
- `--json` (optional) — write the same report as deterministic JSON (object keys sorted
  recursively, so two runs over the same input are byte-identical) to this path,
  independently of `--out`.

### Roles

A subagent file's role comes from two sources, in this order:

1. **The Workflow's own journal** — `journal.jsonl`, committed next to the agent files it
   labels, one line per agent: `{"agentId":"<id>","label":"<label>"}`, where `<id>` is
   that agent's file basename with a leading `agent-` and its extension stripped (file
   `agent-w1.jsonl` → id `w1`). When a journal entry matches, the role is the label's
   segment before its first `:` — `build:T1:r2` → `build`, `review:T1:r1` → `review`,
   `seam` → `seam` (no `:` — the whole label is the role), `integrate` → `integrate`.
2. **`--role-map`** — when no journal entry matches, `--role-map`'s JSON maps the file's
   bare basename (`agent-<id>`, extension stripped, prefix intact) directly to a role
   string, verbatim.

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

### Header line

Every report's markdown begins with a `VERDICT:` line, then (after a blank line) the
exact literal line **`# Build census`**. That line, always present, always verbatim, is
the header line other tools recognise a build-census report by — see
`scripts/work-record.mjs`'s `accept --census <file>` (Territory C2), which refuses a file
lacking it rather than parsing loosely.

### Report sections

`VERDICT: COUNTED <n> lead turns, <m> subagent files` (first line) · `# Build census`
(the header line, see above) · **Summary** (flat, copyable lines: `leadTurns`,
`wallClockHours`, a `by-model` line and a `by-role` line, each `key=totalTokens`,
comma-separated) · lead turns (whole file and window, both de-duped, plus `leadTurns`),
turns/hour in the window · lead tokens by model (whole file and window) · subagents: a
`Roles: <role>=<fileCount>, ...` line, then a `| file | role | turns |` table (every
counted file, its resolved path, its role, and its turn count — `unassigned` files are
listed like any other, never dropped) · subagent totals by model · subagent totals by
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

## `work-census.mjs`

```
node scripts/work-census.mjs [docs/work] [--out <path>]
```

Reads records through `scripts/work-record.mjs`'s own `listRecords`/`parseRecord` — this
file never re-parses a record. Per work id:

- **opened / first owned / first delivered / first reviewed / first accepted** —
  `Opened:` field, and the earliest `Log:` line of each of the other four statuses, in
  file order.
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
