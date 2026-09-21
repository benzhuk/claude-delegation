---
name: decisions
description: Use when something only the owner can decide comes up, when writing or reading the owner's decisions page, or when choosing between blocking on a question and recording it and moving on. NOT for peer asks between equal sessions — that is multi.
---

# Decisions — record it, keep moving

## The one idea

A session never blocks on the owner. It records the decision on the owner's decisions
page, keeps working on whatever else is dispatchable, and picks the answer up later.

## Writing an item

Shape: `templates/decision-item.md`, read with `scripts/decisions-read.mjs` — both
shipped next to this skill (`../_templates/…`, `../_scripts/…`) when mirrored, else at
the plugin repo's `templates/` and `scripts/`. One toggle per decision, a unique
title, one or two lines of evidence, two to four unticked options with the
recommended one FIRST marked "(recommended)". Last plain line: `Default after <date>
<time> <±UTC offset>: <option>` for a reversible decision (the offset is the owner's
local time, e.g. `Default after 2026-09-25 18:00 -04:00: cap at 200 items per run`),
or `No default: <reason>` for anything irreversible, costly, or that changes the
owner's machines. Inside the item, no agent line may start with bold or a colored
span — plain text first, bold only in the `<summary>` title — because Notion escapes
colored-span bold exactly like the owner's own asterisks, so such a line reads back
as a forged owner comment. State the decision and the recommendation in chat too;
send the link only once a fresh read shows the item there.

## Page rules

`scripts/decisions-read.mjs` reads a comment from a line starting with the escaped
`\*\*` Notion produces from the owner's typed asterisks — plain agent bold
(`**like this**`) is never one. Never re-type or quote the owner's line when
answering it: a copied `\*\*` prefix forges a second comment that never clears.
Write and read the page through the `notion-writing` skill: markdown endpoints only,
one request per page, never a whole-page replace, read fresh seconds before writing,
a multi-line edit built from a script with the old and new text loaded from files,
not argv. New items go inside the open section, never appended past the page-level
`- [ ] Done` line (`append-md` must not be used for this); whoever adds an item
unticks Done in the same pass; whoever closes the last open item ticks it back, which
asserts the owner has nothing open.

## Reading answers

`node ~/.claude/scripts/notion.js read <page-id> | node scripts/decisions-read.mjs`
(path per above; page id from the owner or brief — never search, it's fuzzy).
Exit 1: act, below. Exit 0: OPEN/REPLIED only — nothing due. Exit 3: BLIND (empty
read, bad fence, no titles) — stop, tell the owner, change nothing.

- AMBIGUOUS or UNATTACHED: report to the owner — never guess, never drop it.
- TICKED: act on the option; an unreplied comment on the same item still needs a
  reply (next bullet) — a tick never cancels it.
- COMMENTED: reply directly under the owner's line, as a line starting with
  `Reply:` and the date — that marker stops the next read reporting it again.
- DUE: the item's `Default after …` deadline passed unanswered. Apply the default,
  tell the owner in the same message, and close the item.
- WARN: the page itself is broken (Done misplaced or duplicated, a malformed
  Default line). Fix the page before trusting any other status on it.
- REPLIED or OPEN: nothing to do.

## Closing

DELETE the item's toggle, checkboxes and all, and write ONE plain bullet in Closed:
title, what was chosen, the date, the OBSERVED result — never move or copy the toggle.

## Sub-sessions

A sub-session sends its decision UP to the session that talks to the owner:
`note-send` with `--kind ASK --needs decision` (the `multi` skill). That session
batches simple ones into one pass, after everything dispatchable is dispatched.
