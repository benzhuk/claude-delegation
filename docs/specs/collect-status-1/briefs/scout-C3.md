# Scout — C3 (required-wiring.default.json, docs/GOALS.md, lead's-rule skill file)

## Files and symbols
- `scripts/required-wiring.default.json` (135 lines, base sha 31a23e2): an array of check
  objects. `type: "file_fresh"` entries already in the file (e.g. `flusher-heartbeat`,
  `janitor-last-run`) use `file`, `maxAgeSeconds`, `whenMissing`, `requiresFile`, `why`, `fix` —
  this is the exact shape to copy for `collect-status-fresh`. `janitor-last-run` (line 126) is
  the closest sibling: `requiresFile: "~/.agents/janitor/installed.json"` gates it to info-only
  when the mechanism was never installed — same pattern the spec wants keyed to
  `~/.agents/collect/installed.json` per contracts.md K1.
- `docs/GOALS.md` (128 lines): no existing bullet or status sentence names "lead coordination
  cost" or "lead-cost" specifically. The closest measures are the aim-table row "Top-tier tokens
  per build" and the section "The lead spends judgment, not turns" (turns-per-build, not
  tokens-per-24h). Neither currently carries the exact 09-26/09-27 numbers (468 turns, 86.4M
  tokens) the spec's Aim paragraph gives.
- `skills/continue/SKILL.md` (45 lines): today has no mention of collect-status, a collector, or
  reading lane state from a status file; its closest existing hook is step 1, "Read the project's
  current goal, active bearings, and existing work records before choosing work" — this is where
  the spec's one paragraph would land, or as a new short section.

## Helpers to reuse
- `scripts/required-wiring.default.json`'s own `file_fresh`/`requiresFile` shape (no new check
  "type" needed — same mechanism, new instance).
- No existing wiring-check code inspected here for whether `file` supports `~`-expansion of a
  computed basename inside the path; `scripts/wiring-check.mjs` is the reader to check for that
  (out of this territory's file list, read-only reference only).

## Tests that police this area
- No test file yet references `collect-status-fresh`, `docs/GOALS.md`'s lead-cost sentence, or
  `skills/continue/SKILL.md`'s content (fresh grep, zero hits). This territory is adding a new
  wiring-check row plus prose; whatever fixture test C3 writes is itself the first test policing
  this area.
- **`scripts/wiring-check.test.mjs:730-732` is an N2-shaped mechanical trap**: `test("the shipped
  list gained exactly eight new checks: ...")` asserts `list.length === 17` ("9 original + 8 new")
  read straight off the real `required-wiring.default.json` file (not a synthetic fixture). Adding
  `collect-status-fresh` bumps the shipped list to 18 entries and WILL fail this assertion unless
  the builder also bumps this test's expected count (and, ideally, its comment) to 18. This file is
  outside C3's stated territory list (only `required-wiring.default.json` and the two doc files are
  named) — flag this collision explicitly in the brief/record; the count constant is a one-line,
  mechanical, additive change, not a redesign, so editing it is the correct move (the alternative,
  leaving the suite red, is worse).

## Open questions for the spec
- No "goal-status sentence fixture" precedent was found as a doc-content test (only a JS-sentence
  constant embedded via `goal-card.mjs`'s `KNOWLEDGE_INDEX_HINT` + a test asserting the rendered
  string contains it — not a fixture over a `SKILL.md` file's prose). The spec itself anticipates
  this: "If no such fixture pattern fits, say so in the record and leave the paragraph as a stated
  goal referencing docs/GOALS.md."
- The spec's "lead-cost measure" status sentence in GOALS.md may not exist yet (see above); the
  builder should say so in the record rather than inventing one, per the spec's own conditional.
