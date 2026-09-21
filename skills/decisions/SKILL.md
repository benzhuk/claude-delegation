---
name: decisions
description: Use when something only the owner can decide comes up, when writing or reading the owner's decisions page, or when choosing between blocking on a question and recording it and moving on. NOT for peer asks between equal sessions — that is multi.
---

# Decisions — record it, keep moving

## The one idea

A session never blocks on the owner. It records the decision on the owner's decisions
page, keeps working on whatever else is dispatchable, and picks the answer up later.

## Writing an item

Shape: `templates/decision-item.md`, read with `scripts/decisions-read.mjs` (both in
this repo). One toggle per decision, a unique title, one or two lines of evidence,
two to four unticked options with the recommended one FIRST marked "(recommended)".
Last plain line: `Default after <date> <time> <±UTC offset>: <option>` for a
reversible decision — use the offset in force on that date (`-04:00` New York in
summer, `-05:00` in winter), e.g. `Default after 2030-06-15 18:00 -04:00: cap at 200
items per run` — or `No default: <reason>` for anything irreversible, costly, or
that changes the owner's machines. Inside the item, no agent line starts with bold —
some agent-written bold comes back from Notion escaped exactly like an owner
comment. Bold stays only in the `<summary>` title.

State the decision and the recommendation in chat too; send the link only once a
fresh read shows the item there.

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
- COMMENTED: reply under the owner's line, starting with `Reply: YYYY-MM-DD` (the
  numeric date is required) — that is what stops the next read reporting it again.
- DUE: the item's `Default after …` deadline passed unanswered. Apply the default,
  tell the owner in the same message, and close the item.
- WARN: the page is broken — Done missing, misplaced, indented, or duplicated, or a
  `Default` line off-shape (rewrite older wording into it). Fix before trusting anything else.
- REPLIED or OPEN: nothing to do.

## Closing

DELETE the item's toggle, checkboxes and all, and write ONE plain bullet in Closed:
title, what was chosen, the date, the OBSERVED result — never move or copy the toggle.

## Sub-sessions

A sub-session sends its decision UP to the session that talks to the owner:
`note-send` with `--kind ASK --needs decision` (the `multi` skill). That session
batches simple ones into one pass, after everything dispatchable is dispatched.
