# Census tools (L-C9, L-C10)

Two read-only tools for measuring one loop-build run against another (spec.md
`spec-outline.md`'s "now vs then" goal, the same measure the speed census needed to be
repeatable): `scripts/build-census.mjs` (turns and tokens over a lead transcript and its
subagents) and `scripts/work-census.mjs` (dispatch latency, elapsed time and idle time
over the work-record ledger). Both follow this repo's `scripts/token-census.mjs` pattern:
`parseArgs(argv)`, `async main(argv, {fsImpl, write})`, a win32-safe `isMainModule()`
guard. Neither prints transcript or record prose — only counts, model names, work ids and
file basenames.

## `build-census.mjs`

```
node scripts/build-census.mjs --lead <session.jsonl> --tasks <dir> [--marker <text>] [--out <path>]
```

- `--lead` — one Claude Code lead session transcript (`.jsonl`).
- `--tasks` — a directory of subagent transcripts (`.output`, and `.jsonl` for forward
  compatibility — `.output` is the extension real subagent task directories actually use).
- `--marker` (optional) — a substring; the "window" starts at the first line containing
  it (a bounded-depth/width search — it is never printed) and runs to the end of the lead
  file. Without `--marker`, the window is the whole file.
- `--out` (optional) — write the full markdown report there; without it, the report goes
  to stdout. Nothing else reaches stdout (with `--out`, only a `wrote: <path>` line does).

**The de-duplication fix, the reason this file exists in this shape:** Claude Code
re-emits one logical assistant turn as several JSONL lines — one per `apiBlockIndex` —
sharing a `requestId` (or `message.id`) with `output_tokens` growing across the lines
while `input_tokens`/`cache_read_input_tokens` repeat. Naive per-line summing over-counted
the dominant token category by roughly 1.8x on a real 813-line transcript. Both
`build-census.mjs` and its test keep a `Map<id, entry>` per file (and, when `--marker` is
given, a second map for the window, since a request can straddle the boundary), overwrite
on every repeat, and count `Map.size` as the turn total — never a per-line increment.
`scripts/build-census.fixtures/lead.jsonl` and `scripts/build-census.fixtures/tasks/`
carry a request split over three lines with strictly growing `output_tokens`, specifically
so a naive (buggy) implementation produces a different, wrong number on this fixture, not
just a smaller one — `scripts/build-census.test.mjs` asserts the deduped values, and
separately proves the naive per-line count would disagree.

Report sections: lead turns (whole file and window, both deduped), turns/hour in the
window, lead tokens by model (whole file and window), subagent totals by model per file,
and a combined split (the build-window lead cost plus every subagent's cost — the only
lead-side number actually comparable to subagent cost, since subagents only exist during
the build). First line: `VERDICT: COUNTED <n> lead turns, <m> subagent files`.

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
  transitions between adjacent `Log:` lines.
- **dispatch latency** — for each `delivered` `Log:` line, the time to the FIRST LATER
  `Log:` line whose status is `reviewed` or `rejected` — not simply the next line,
  whatever its status. A real record's line right after `delivered` is routinely a
  same-second `owned ... agent-exited` hand-back, which measures bookkeeping, not
  dispatch. A record delivered more than once (fix rounds) gets one latency per round,
  plus their sum.
- **elapsed** — `opened` -> `accepted`. Most real records never reach `accepted` (the
  common case, not an edge case): when no `accepted` line exists, elapsed falls back to
  `opened` -> the LAST `reviewed` line, labeled `(to reviewed)` in the report rather than
  left blank. A record with neither line reports `null`, not a guess.
- **idle minutes (footer)** — total time, across all records merged and timestamp-sorted
  by their own `Log:` transitions, during which at least one record was `runnable` with
  `Owner: none`. Two records idle at the same time are not double-counted (it is a union
  over records, not a sum). An idle window with no later closing transition (a record
  still sitting `runnable`/`none` with nothing after it) is never counted — there is no
  `now` reference to close it against.

No fixtures directory is committed for this tool (unlike `build-census.mjs`'s, which
gate-10 runs the CLI against directly): `scripts/work-census.test.mjs` builds its
`.record.md` fixtures under a fresh `mkdtempSync` temp dir, the same convention every
other test in this repo already uses for record fixtures.
