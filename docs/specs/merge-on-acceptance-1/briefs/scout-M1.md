# Scout — M1 (the merge gate and the page entry)

Read at 24e02eab356217a4c63725014d4fdd028cfb5891 (wt-moa checkout). Docs-only territory.

## 1. Files and symbols

- `skills/team-build/SKILL.md` — the merge-item paragraph is exactly where contracts.md
  R2 says: :256-264 ("After that `accept --census` …" through "…so the collector still
  finds the branch."), the ETA-note clause at :287-289 ("before the merge ask …"), and the
  Ship-step accept-turn clause at :380 ("push the branch, post its merge item to the
  decisions page (Ship), and only then send ONE RESULT."). All three premises hold as
  written on this tree — confirmed by direct read, not grep.
- `skills/decisions/SKILL.md` — the "A lane lead's own merge item …" paragraph is at
  :56-68 (confirmed). Its last two sentences (:63-68, two-writers + exit-3 retry) are the
  ones R2 says to KEEP for the Closed entry — they read as generic anchored-edit
  discipline, not merge-item-specific, so keeping them verbatim while replacing the
  merge-item-specific sentences around them is mechanically doable without reflow.
- `skills/decisions/templates/decision-item.md` — the merge-item paragraph is a single
  paragraph near the end (after the "action-request" paragraph, before "## Replying to
  an owner's comment"), reading "A lane lead's own merge item is an ordinary use of this
  same shape … `No default: merges to main take your word per item`". Confirmed present,
  one paragraph, easy to delete/replace whole.
- `docs/census.md` — "at every merge tick" is at line 352, inside the
  `collect-from-origin.mjs` section (heading "the durable signal for accepted-but-unmerged
  work"). R8/item-4's one sentence about the four-hour defect belongs right after this
  paragraph (it already names `accepted-unmerged`/`hoursSinceLog` at :356-357).
- `docs/pane-setup.md` — three call-outs, confirmed:
  - :10-11 area: "the only pane that writes the decisions page" — in the
    `<project>-fable` bullet's role description.
  - :38-39: "for the actual ship decision" — step 4 of "Who launches what, and when".
  - :117-118: "the merge ask `<project>-fable` puts on the decisions page, not into a
    pane's own transcript alone" — in the Census section, just before "## Releasing".
  All three describe fable posting/deciding a merge ask; none currently describe a lane
  lead merging on its own gate.
- `docs/GOALS.md` line 21 (the "NOT waiting to be asked" bullet) reads: "Ben's word is
  needed only to merge to main or touch a machine, never to start." This directly
  contradicts M1's rule. Per contracts.md this file is explicitly NOT edited by M1 — only
  flagged to Ben. It is mirrored to Notion (`docs/pane-setup.md`'s Releasing section, plus
  `skills/team-build/SKILL.md`'s "After a release … keeps the Notion goals mirror current"
  language lives at census.md, not team-build — see below).
- `scripts/collect-from-origin.mjs` — contracts.md R4 is explicit this file is NOT
  changed by M1 (spec item 4's "only if a flag is needed" premise does not hold: no flag
  is needed). Confirmed no other file needs code changes for M1 — this territory is
  docs-only, matching the territory map.

## 2. Helpers to reuse

- The exact "Closed entry" shape and its anchored-edit mechanics already exist as prose
  patterns in decisions SKILL.md's "Closing" section (near the file's end) — reuse its
  phrasing ("DELETE the item's toggle … write ONE plain bullet in Closed") as the model
  for how a Closed-entry-only write (no toggle ever created) should be described; this is
  a smaller thing than closing an existing item, so say so explicitly to avoid confusion
  with the toggle-close flow.
- `docs/work/evidence/wr-2026-09-26-collect-from-origin-merge-645eb79.md` and
  `docs/specs/collect-from-origin-1/reports/integrate-win.md` are a real precedent for
  what "the sealed suite green on a second host from origin" evidence looks like in this
  repo (an existing lane's second-host gate log) — point M1's docs at this shape rather
  than inventing a new one.

## 3. Tests that police this area

- `skills/decisions/scripts/skill-text.test.mjs`: pins exact line wraps at decisions
  SKILL.md :49-50 ("write only with anchored edits, `notion.js edit\n--safe`") and around
  :306-307 ("Exit 3 means a page could not be read: do not hand back, fix the\nread
  first") — both OUTSIDE the :56-68 paragraph M1 replaces, so untouched as long as the
  edit doesn't reflow past :56. Also bans any line starting with `**` anywhere in the
  file (`assert.doesNotMatch(skillText, /^[ \t]*\*\*/m)`) — the Closed-entry line must
  never start with bold, matching contracts.md's "plain bullet, never starting with
  bold".
- `scripts/work-record.test.mjs`: slices exactly 800 chars from "Run the census at accept
  time" in team-build SKILL.md (confirmed: that string is present, followed by the
  `build-census.mjs --lead --marker --out` paragraph). The test asserts `--lead`,
  `--marker`, `--out`, `Log: ... reviewed`, and `accept --census` all appear inside that
  800-char slice. M1's own edit window (:256 onward) starts well after this slice ends —
  confirmed no overlap by direct inspection of the intervening text.
- No script/test anywhere greps for the literal merge-item phrases being replaced
  (confirmed by grep across `*.mjs`/`*.js`/`*.json`: empty). The only test risk is the two
  pins above plus the 800-char slice; both are avoidable by editing strictly within the
  named line ranges.

## 4. Open questions for the spec

- Contracts.md R6 says GOALS.md is "flagged to Ben", not specifying the exact mechanism
  (a decisions-page item, or literally naming it in the RESULT). The reviewer/integrator
  brief should treat "a Waiting decision item naming GOALS.md:21" as the expected shape,
  consistent with the rest of R1-R8's "by-hand" pattern (see M2's Windows-registration
  step) — but the spec pack doesn't say this in so many words for M1; it's the drafter's
  call, not the scout's.
- R2 says "keeping its two-writers and exit-3 retry sentences (:63-68) for the Closed
  entry" — the paragraph at :56-68 is one continuous block; whether those two sentences
  are literally reusable as-is (referring to "the item") or need a light rewrite to say
  "the Closed entry" is a drafting decision the brief should make explicit rather than
  leaving to the builder's judgment call on prose only.
