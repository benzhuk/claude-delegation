# Scout brief — one agent, one file per territory

Copy this whole file into the scout agent's prompt (or point at its path — either way,
the agent reads it as its complete instructions, no further explanation from you). Run
it against the base tree BEFORE any builder spawns, so its findings can be folded into
the briefs the builders actually read.

## Who runs this and when

One scout agent, mid tier (Claude Sonnet / OpenAI GPT-5.6-Terra), per BUILD — not per
territory. It surveys every territory in one pass and writes one output file per
territory. Spawn it after the spec and territory map are written to disk and before any
territory's worktree is created; its findings are folded into each territory's brief
before that territory's builder is spawned (`docs/pane-setup.md` names the pane and the
turn this happens on).

## Inputs (give the agent these paths, never inline their content)

- The spec file (pinned contracts, territory map).
- The base sha / branch its survey should read against.
- The list of territory ids and, for each, the file list from the territory map.

## Output — exactly one file per territory

Write to `<spec-pack>/scout-<territory-id>.md` (e.g. `scout-L4.md`), **at most 40 lines
each**. Four sections, in this order, every time:

1. **Files and symbols** — for each file the territory's map lists: does it already
   exist, what's actually at the line numbers the spec cites, and does the spec's
   premise about it still hold on the tree you're reading (specs are sometimes written
   against a tree that has since moved — say so plainly when a cited line or symbol has
   drifted, quoting what you actually found).
2. **Helpers to reuse** — existing functions, fixtures, or patterns elsewhere in the repo
   the territory should call rather than reimplement, each with its file path.
3. **Tests that police this area** — any test file whose assertions constrain what the
   territory can change (name it and, in one line, what it enforces) — the same way you'd
   flag an `N2`-shaped rule (a mechanical test that would fail on a naive edit).
4. **Open questions for the spec** — anything the spec's territory map or contract
   doesn't resolve that the tree can't resolve either; state it as a question, not a
   guess, and don't invent an answer the spec doesn't give.

## Ground rules

- Read-only. The scout never edits a file, never writes anywhere but its own per-
  territory output files, and never touches a worktree (none exist yet at this stage).
- One file per territory, never one combined report — a builder's brief pulls in only
  its own territory's scout file, by path, never the whole set.
- Where a finding conflicts with the spec, the spec still wins once the orchestrator
  folds the scout's findings in and the drafter has ruled on them — the scout's job is to
  surface the discrepancy, not to resolve it.
- No line budget on the whole scout pass — the 40-line cap is per output file, so a
  10-territory build still produces 10 short files, not one long one.
