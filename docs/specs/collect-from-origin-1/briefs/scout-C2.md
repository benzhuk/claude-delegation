# Scout — C2 (lane posts its own merge item)

Read at base 5f057a3959323bd0fd01231e6fe6d47688991cec (ac9c842+05b9bcc; this base already
carries build/one-launch-1's rewrite of skills/team-build/SKILL.md per contracts R3).

## Files and symbols
- `skills/team-build/SKILL.md` (413 lines). `## Ship` starts at line 209. The exact
  anchor sentence to insert after (spec: "after `accept --census` and the push"): the
  paragraph ending "...then `accept --census <census.md>`; a genuinely broken census
  still accepts via `--no-census \"<reason>\"`, visibly unmeasured rather than silently
  blocked — see `docs/census.md`." Insert the new one-paragraph rule immediately after
  that sentence and before the `check-acceptance`/`accept` mechanics paragraph that
  follows it — keep it a small local insertion (contracts R3), not a new section.
- `skills/decisions/SKILL.md` (310 lines). "Writing an item" (lines 14-38) already
  states the fill-in shape/anchored-edit route; "Page rules" (39-76) states the
  fresh-read/one-anchored-edit/retry-once-on-changed-anchor rule generally for the
  whole page. Spec C2 item 2 wants one paragraph naming the SHAPE of a lane-posted
  merge item specifically (title `Merge <branch> into main (<tip sha>)`, the four-number
  evidence line, merge-now/merge-and-release/hold options, "No default: merges to main
  take your word per item") and restating that two writers never edit the page at once —
  the two-writers rule already exists in Page rules; the new paragraph can point at it
  rather than duplicate it.
- `skills/decisions/templates/decision-item.md` (51 lines) — the fenced fill-in shape is
  already generic (title/evidence/options/Default-or-No-default). The merge item is an
  ordinary use of this existing template; nothing here needs a code/shape change — this
  file may only need a one-line pointer/example addition, or no edit at all, per the
  spec's own wording ("through... the decision-item template").

## Helpers to reuse
- `scripts/four-read.mjs` already defines the four numbers this evidence line must
  quote; `work-record.mjs`'s `parseRecord().fourNumbers` already carries a record's
  `Four numbers:` line verbatim — the merge item's evidence line should copy that text,
  never recompute the numbers.
- Nothing under `scripts/build-census.mjs`, `work-record.mjs`, `four-read.mjs`,
  `janitor.mjs`, `hooks/`, `.codex-plugin/` is in scope (contracts, explicit off-limits)
  — this territory is doc-only prose in the three named files.

## Tests that police this area
- `skills/decisions/scripts/skill-text.test.mjs` does `readFileSync` on
  `skills/decisions/SKILL.md` and asserts several EXACT literal substrings are present
  (e.g. `"notion.js read"`, `"decisions-read.mjs"`, `"decisions-handback.mjs
  --decisions"`) plus a no-line-starts-with-`**` check and a STALE-wording check. Any
  edit to decisions/SKILL.md must not delete/reword any of those exact substrings.
- Grep found NO existing test that does `readFileSync` on `skills/team-build/SKILL.md`
  or `skills/decisions/templates/decision-item.md` — contracts' C2 gate ("the tests that
  read the three C2 files") currently resolves to `skill-text.test.mjs` alone; open
  question below.
- `skills/team-build/references/build-loop-workflow.test.mjs` exists but tests the
  workflow script's contract, not SKILL.md prose — grep confirmed no readFileSync of
  SKILL.md there.

## Open questions for the spec
- Contracts' C2 gate names "the tests that read the three C2 files" as plural, but only
  one of the three (decisions/SKILL.md, via skill-text.test.mjs) currently has such a
  test. Confirm the gate is just "whatever currently reads them" (i.e., today that's
  skill-text.test.mjs alone) rather than an instruction to add new tests for the other
  two — contracts' gate line doesn't ask for new tests, only names the existing check.
- Spec item 3 asks to "state plainly whether the Codex mirror of the decisions skill can
  post the item." This repo's `.codex-plugin/` contains only `plugin.json`; no Codex
  mirror of the decisions skill (or its `notion.js`/anchored-edit tooling) exists in
  this tree at all. Recommend the report says exactly that: no Codex mirror exists here,
  so item 3's "if it cannot yet" branch applies — the Codex lane's RESULT must carry the
  merge item text verbatim, collector still finds the branch.
