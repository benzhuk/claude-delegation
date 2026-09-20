---
name: decisions
description: Use when something only the owner can decide comes up, when writing or reading the owner's decisions page, or when choosing between blocking on a question and recording it and moving on. NOT for peer asks between equal sessions — that is multi.
---

# Decisions — record it, keep moving

## The one idea

A session never blocks on the owner. It records the decision on the owner's decisions
page, keeps working on whatever else is dispatchable, and picks the answer up later.

## Writing an item

Shape: `templates/decision-item.md`. One toggle per decision, with a unique title. One
or two lines of context that state the evidence. Two to four options as unticked
checkboxes, the recommended option FIRST and marked "(recommended)". A last plain line
that gives one of:

- for a reversible decision: `Default if unanswered by <day, time, zone>: <option>`,
  the time in the owner's local time.
- for anything irreversible, costly, or that changes the owner's machines: `No
  default` and the reason.

None of the agent's own lines may start with two asterisks (`**`) — that prefix is how
the owner's comments are recognised by `scripts/decisions-read.mjs`. Write the item with
the `notion-writing` skill's tooling, never a hand-rolled request.

State the decision and the recommendation in the chat message too. Send the page link
only after reading the page back and confirming the item is there, and only while it is
still open.

## Page rules

Follow the `notion-writing` skill: markdown endpoints only, one request per page, never
the per-block API, never replace a whole page the owner may be editing. Read the page
fresh seconds before writing. Build a multi-line edit from a script FILE, never an
inline shell escape — an inline escape put an option line into the page's header
callout on 2026-09-20. The page-level `- [ ] Done` line is the last non-empty line of
the page; whoever adds an open item unticks it in the same pass.

## Reading answers

`<read the page as markdown> | node scripts/decisions-read.mjs` — exit 1 means there is
something to act on.

- TICKED: act on the ticked option.
- COMMENTED: the owner asked or said something. Answer it INSIDE the item, under their
  line — never edit or delete their line. Leave the item open and untick Done.
- AMBIGUOUS or UNATTACHED: report to the owner, never guess.

A default is applied only after its deadline has passed, by the session that reads the
page, and it tells the owner in the same message that it did.

## Closing

Move a closed item to the Closed section as a plain bullet WITHOUT checkboxes — the
parser cannot tell a historical tick from a live one. Give the title, what was chosen,
the date, and the OBSERVED result once acted on. This is mechanical page housekeeping:
a mid-tier agent does it, not a top-tier thread.

## Sub-sessions

A sub-session sends its decision UP to the session that talks to the owner: `note-send`
with `--kind ASK --needs decision` (the `multi` skill). That session batches simple
ones into one pass, after everything dispatchable is dispatched.
